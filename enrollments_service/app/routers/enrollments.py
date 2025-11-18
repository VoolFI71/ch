from __future__ import annotations

from typing import List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Enrollment
from ..schemas import (
	EnrollmentCreate,
	EnrollmentEnsureResponse,
	EnrollmentInternalCreate,
	EnrollmentOut,
)
from ..security import get_current_user_id, verify_internal_token


router = APIRouter(prefix="/api/enrollments", tags=["enrollments"])


async def _ensure_enrollment(db: AsyncSession, *, user_id: int, course_id: int) -> Tuple[Enrollment, bool]:
	if course_id <= 0:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid course id")

	stmt = select(Enrollment).where(Enrollment.user_id == user_id, Enrollment.course_id == course_id)
	result = await db.execute(stmt)
	existing = result.scalars().first()
	if existing:
		return existing, False

	enrollment = Enrollment(user_id=user_id, course_id=course_id)
	db.add(enrollment)
	await db.commit()
	await db.refresh(enrollment)
	return enrollment, True


@router.get("/me", response_model=List[EnrollmentOut])
async def list_my_enrollments(
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> List[EnrollmentOut]:
	stmt = (
		select(Enrollment)
		.where(Enrollment.user_id == current_user_id)
		.order_by(Enrollment.created_at.desc())
	)
	result = await db.execute(stmt)
	return list(result.scalars().all())


@router.post("/", response_model=EnrollmentEnsureResponse, status_code=status.HTTP_201_CREATED)
async def create_enrollment(
	data: EnrollmentCreate,
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> EnrollmentEnsureResponse:
	enrollment, created = await _ensure_enrollment(db, user_id=current_user_id, course_id=data.course_id)
	return EnrollmentEnsureResponse(enrollment=enrollment, created=created)


@router.post("/internal", response_model=EnrollmentEnsureResponse, status_code=status.HTTP_200_OK)
async def create_enrollment_internal(
	data: EnrollmentInternalCreate,
	_: None = Depends(verify_internal_token),
	db: AsyncSession = Depends(get_db),
) -> EnrollmentEnsureResponse:
	enrollment, created = await _ensure_enrollment(db, user_id=data.user_id, course_id=data.course_id)
	return EnrollmentEnsureResponse(enrollment=enrollment, created=created)


@router.get("/internal/user/{user_id}", response_model=List[EnrollmentOut])
async def list_enrollments_for_user_internal(
	user_id: int,
	_: None = Depends(verify_internal_token),
	db: AsyncSession = Depends(get_db),
) -> List[EnrollmentOut]:
	stmt = (
		select(Enrollment)
		.where(Enrollment.user_id == user_id)
		.order_by(Enrollment.created_at.desc())
	)
	result = await db.execute(stmt)
	return list(result.scalars().all())

