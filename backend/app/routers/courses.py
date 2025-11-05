from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Course, Enrollment, User
from ..schemas.course import CourseOut, CourseCreate
from ..security import get_current_user


router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("/", response_model=List[CourseOut])
def list_courses(db: Session = Depends(get_db)) -> List[CourseOut]:
    courses = db.query(Course).filter(Course.is_active == True).order_by(Course.created_at.desc()).all()  # noqa: E712
    return courses


@router.get("/me", response_model=List[CourseOut])
def my_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[CourseOut]:
    enrollments = (
        db.query(Enrollment)
        .join(Course, Course.id == Enrollment.course_id)
        .filter(Enrollment.user_id == current_user.id)
        .all()
    )
    course_ids = [en.course_id for en in enrollments]
    if not course_ids:
        return []
    courses = db.query(Course).filter(Course.id.in_(course_ids)).all()
    return courses
@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(data: CourseCreate, db: Session = Depends(get_db)) -> CourseOut:
    # ensure unique slug
    if db.query(Course).filter(Course.slug == data.slug).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already exists")

    course = Course(
        id=data.id,
        slug=data.slug,
        title=data.title,
        description=data.description,
        price_cents=data.price_cents,
        is_active=data.is_active,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


# Accept both /api/courses and /api/courses/ for POST
@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course_alias(data: CourseCreate, db: Session = Depends(get_db)) -> CourseOut:
    return create_course(data, db)



@router.post("/{course_id}/enroll", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def enroll_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseOut:
    course = db.get(Course, course_id)
    if not course or not course.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    existing = (
        db.query(Enrollment)
        .filter(Enrollment.user_id == current_user.id, Enrollment.course_id == course_id)
        .first()
    )
    if existing:
        return course

    en = Enrollment(user_id=current_user.id, course_id=course_id)
    db.add(en)
    db.commit()
    return course


