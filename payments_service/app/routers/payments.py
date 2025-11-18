from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import Course, Enrollment, Order, OrderStatusEnum
from ..security import get_current_user_id


router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/checkout/{course_id}")
async def create_checkout(
	course_id: int,
	request: Request,
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
	settings = get_settings()
	course = await db.get(Course, course_id)
	if not course or not course.is_active:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

	if course.price_cents == 0:
		stmt = select(Enrollment).where(
			Enrollment.user_id == current_user_id, Enrollment.course_id == course_id
		)
		existing = await db.scalar(stmt)
		if not existing:
			db.add(Enrollment(user_id=current_user_id, course_id=course_id))
			await db.commit()
		return {"status": "ok", "message": "Enrolled (free)"}

	order = Order(
		user_id=current_user_id,
		course_id=course.id,
		amount_cents=course.price_cents,
		currency="RUB",
		provider="yookassa",
		status=OrderStatusEnum.PENDING.value,
	)
	db.add(order)
	await db.commit()
	await db.refresh(order)

	shop_id = settings.yookassa_shop_id
	secret_key = settings.yookassa_secret_key

	if not shop_id or not secret_key:
		fake_payment_url = f"/api/payments/simulate/{order.id}/success"
		return {"payment_url": fake_payment_url, "order_id": order.id}

	try:
		from yookassa import Configuration, Payment
	except Exception as exc:  # pragma: no cover - import error
		raise HTTPException(status_code=500, detail=f"Payment SDK error: {exc}")

	Configuration.account_id = shop_id
	Configuration.secret_key = secret_key

	base_url = settings.public_base_url or str(request.base_url).rstrip("/")
	return_url = f"{base_url}/cabinet.html"
	webhook_url = f"{base_url}/api/payments/webhook"
	idempotence_key = str(uuid.uuid4())
	description = f"Course #{course.id}: {course.title}"

	try:
		payment = Payment.create(
			{
				"amount": {"value": f"{course.price_cents / 100:.2f}", "currency": "RUB"},
				"confirmation": {"type": "redirect", "return_url": return_url},
				"capture": True,
				"description": description,
				"metadata": {"order_id": order.id, "user_id": current_user_id, "course_id": course.id},
			},
			idempotence_key,
		)
	except Exception as exc:  # pragma: no cover - provider errors
		raise HTTPException(status_code=502, detail=f"Payment provider error: {exc}")

	order.provider_payment_id = payment.id
	await db.commit()

	confirmation_url = payment.confirmation.confirmation_url  # type: ignore[attr-defined]
	return {"payment_url": confirmation_url, "order_id": order.id}


@router.post("/webhook")
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
	# YooKassa sends various events. We care about payment.succeeded and payment.canceled
	payload = await request.json()
	event = payload.get("event")
	obj = payload.get("object") or {}
	payment_id = obj.get("id")
	metadata = obj.get("metadata") or {}
	order_id = metadata.get("order_id")

	if not payment_id or not order_id:
		return {"status": "ignored"}

	order = await db.get(Order, int(order_id))
	if not order:
		return {"status": "ignored"}

	if event == "payment.succeeded":
		order.status = OrderStatusEnum.PAID.value
		order.provider_payment_id = payment_id
		await db.commit()
		if order.user_id and order.course_id:
			stmt = select(Enrollment).where(
				Enrollment.user_id == order.user_id, Enrollment.course_id == order.course_id
			)
			exists = await db.scalar(stmt)
			if not exists:
				db.add(Enrollment(user_id=order.user_id, course_id=order.course_id))
				await db.commit()
		return {"status": "ok"}

	if event in ("payment.canceled", "payment.expired", "refund.succeeded"):
		order.status = OrderStatusEnum.CANCELLED.value
		await db.commit()
		return {"status": "ok"}

	return {"status": "ignored"}


@router.get("/order/{order_id}")
async def get_order(
	order_id: int,
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
	order = await db.get(Order, order_id)
	if not order or order.user_id != current_user_id:
		raise HTTPException(status_code=404, detail="Order not found")
	return {"id": order.id, "status": order.status}


@router.get("/simulate/{order_id}/success")
async def simulate_success(order_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
	order = await db.get(Order, order_id)
	if not order:
		raise HTTPException(status_code=404, detail="Order not found")
	order.status = OrderStatusEnum.PAID.value
	await db.commit()
	if order.user_id and order.course_id:
		stmt = select(Enrollment).where(
			Enrollment.user_id == order.user_id, Enrollment.course_id == order.course_id
		)
		exists = await db.scalar(stmt)
		if not exists:
			db.add(Enrollment(user_id=order.user_id, course_id=order.course_id))
			await db.commit()
	return {"status": "ok"}
