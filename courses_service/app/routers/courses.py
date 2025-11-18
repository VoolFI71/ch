from __future__ import annotations

from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import Course
from ..schemas import CourseCreate, CourseOut
from ..security import get_current_user_id


router = APIRouter(prefix="/api/courses", tags=["courses"])


def _get_enrollments_client() -> tuple[str, dict[str, str]]:
	settings = get_settings()
	if not settings.enrollments_service_url or not settings.enrollments_internal_token:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Enrollments service unavailable")
	base_url = settings.enrollments_service_url.rstrip("/")
	headers = {"X-Internal-Token": settings.enrollments_internal_token}
	return base_url, headers


def _fetch_user_enrollment_course_ids(user_id: int) -> List[int]:
	base_url, headers = _get_enrollments_client()
	url = f"{base_url}/api/enrollments/internal/user/{user_id}"
	try:
		res = httpx.get(url, headers=headers, timeout=5.0)
	except httpx.RequestError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Enrollments service unreachable")

	if res.status_code != status.HTTP_200_OK:
		raise HTTPException(
			status.HTTP_502_BAD_GATEWAY,
			detail=f"Enrollments service error ({res.status_code})",
		)

	try:
		data = res.json()
	except ValueError:
		raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Invalid response from enrollments service")

	ids: List[int] = []
	for item in data:
		course_id = item.get("course_id")
		if isinstance(course_id, int):
			ids.append(course_id)
	return ids


def _ensure_enrollment(user_id: int, course_id: int) -> None:
	base_url, headers = _get_enrollments_client()
	url = f"{base_url}/api/enrollments/internal"
	payload = {"user_id": user_id, "course_id": course_id}
	try:
		res = httpx.post(url, json=payload, headers=headers, timeout=5.0)
	except httpx.RequestError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Enrollments service unreachable")

	if res.status_code not in (status.HTTP_200_OK, status.HTTP_201_CREATED):
		try:
			detail = res.json().get("detail")
		except Exception:
			detail = res.text
		raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=detail or "Enrollments service error")


@router.get("/", response_model=List[CourseOut])
async def list_courses(db: AsyncSession = Depends(get_db)) -> List[CourseOut]:
	stmt = (
		select(Course)
		.where(Course.is_active == True)  # noqa: E712
		.order_by(Course.created_at.desc())
	)
	result = await db.execute(stmt)
	return list(result.scalars().all())


@router.get("/me", response_model=List[CourseOut])
async def my_courses(
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> List[CourseOut]:
	course_ids = _fetch_user_enrollment_course_ids(current_user_id)
	if not course_ids:
		return []
	stmt = select(Course).where(Course.id.in_(course_ids))
	result = await db.execute(stmt)
	return list(result.scalars().all())


async def _create_course_record(db: AsyncSession, data: CourseCreate) -> Course:
	stmt = select(Course).where(Course.slug == data.slug)
	exists = await db.execute(stmt)
	if exists.scalars().first():
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Slug already exists")

	course = Course(
		id=data.id,
		slug=data.slug,
		title=data.title,
		description=data.description,
		price_cents=data.price_cents,
		is_active=data.is_active,
	)
	db.add(course)
	await db.commit()
	await db.refresh(course)
	return course


@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(data: CourseCreate, db: AsyncSession = Depends(get_db)) -> CourseOut:
	return await _create_course_record(db, data)


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course_alias(data: CourseCreate, db: AsyncSession = Depends(get_db)) -> CourseOut:
	return await _create_course_record(db, data)


@router.post("/{course_id}/enroll", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def enroll_course(
	course_id: int,
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> CourseOut:
	course = await db.get(Course, course_id)
	if not course or not course.is_active:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Course not found")

	_ensure_enrollment(user_id=current_user_id, course_id=course_id)
	return course


