from __future__ import annotations

from typing import List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

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


def _ensure_enrollment(db: Session, *, user_id: int, course_id: int) -> Tuple[Enrollment, bool]:
	if course_id <= 0:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid course id")

	existing = (
		db.query(Enrollment)
		.filter(Enrollment.user_id == user_id, Enrollment.course_id == course_id)
		.first()
	)
	if existing:
		return existing, False

	enrollment = Enrollment(user_id=user_id, course_id=course_id)
	db.add(enrollment)
	db.commit()
	db.refresh(enrollment)
	return enrollment, True


@router.get("/me", response_model=List[EnrollmentOut])
def list_my_enrollments(
	current_user_id: int = Depends(get_current_user_id),
	db: Session = Depends(get_db),
) -> List[EnrollmentOut]:
	return (
		db.query(Enrollment)
		.filter(Enrollment.user_id == current_user_id)
		.order_by(Enrollment.created_at.desc())
		.all()
	)


@router.post("/", response_model=EnrollmentEnsureResponse, status_code=status.HTTP_201_CREATED)
def create_enrollment(
	data: EnrollmentCreate,
	current_user_id: int = Depends(get_current_user_id),
	db: Session = Depends(get_db),
) -> EnrollmentEnsureResponse:
	enrollment, created = _ensure_enrollment(db, user_id=current_user_id, course_id=data.course_id)
	return EnrollmentEnsureResponse(enrollment=enrollment, created=created)


@router.post("/internal", response_model=EnrollmentEnsureResponse, status_code=status.HTTP_200_OK)
def create_enrollment_internal(
	data: EnrollmentInternalCreate,
	_: None = Depends(verify_internal_token),
	db: Session = Depends(get_db),
) -> EnrollmentEnsureResponse:
	enrollment, created = _ensure_enrollment(db, user_id=data.user_id, course_id=data.course_id)
	return EnrollmentEnsureResponse(enrollment=enrollment, created=created)


@router.get("/internal/user/{user_id}", response_model=List[EnrollmentOut])
def list_enrollments_for_user_internal(
	user_id: int,
	_: None = Depends(verify_internal_token),
	db: Session = Depends(get_db),
) -> List[EnrollmentOut]:
	return (
		db.query(Enrollment)
		.filter(Enrollment.user_id == user_id)
		.order_by(Enrollment.created_at.desc())
		.all()
	)

