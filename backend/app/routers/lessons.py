from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Course, Lesson, User, Enrollment
from ..schemas.lesson import LessonCreate, LessonOut, LessonUpdate, PGNFileOut
from ..security import get_current_user


router = APIRouter(prefix="/api/courses/{course_id}/lessons", tags=["lessons"])


@router.get("/", response_model=List[LessonOut])
def list_lessons(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[LessonOut]:
    course = db.get(Course, course_id)
    if not course or not course.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    # Access control: free courses available to any authenticated user; paid require enrollment
    if course.price_cents and course.price_cents > 0:
        has_enrollment = (
            db.query(Enrollment)
            .filter(Enrollment.user_id == current_user.id, Enrollment.course_id == course_id)
            .first()
            is not None
        )
        if not has_enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this course")
    lessons = (
        db.query(Lesson)
        .filter(Lesson.course_id == course_id)
        .order_by(Lesson.order_index.asc(), Lesson.id.asc())
        .all()
    )
    return lessons


@router.post("/", response_model=LessonOut, status_code=status.HTTP_201_CREATED)
def create_lesson(
    course_id: int,
    payload: LessonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LessonOut:
    course = db.get(Course, course_id)
    if not course or not course.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    lesson = Lesson(
        course_id=course_id,
        title=payload.title,
        content=payload.content,
        pgn_content=payload.pgn_content,
        order_index=payload.order_index,
        duration_sec=payload.duration_sec,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.patch("/{lesson_id}", response_model=LessonOut)
def update_lesson(
    course_id: int,
    lesson_id: int,
    payload: LessonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LessonOut:
    course = db.get(Course, course_id)
    if not course or not course.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    
    lesson = db.get(Lesson, lesson_id)
    if not lesson or lesson.course_id != course_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    
    # Update only provided fields
    if payload.title is not None:
        lesson.title = payload.title
    if payload.content is not None:
        lesson.content = payload.content
    if payload.pgn_content is not None:
        lesson.pgn_content = payload.pgn_content
    if payload.order_index is not None:
        lesson.order_index = payload.order_index
    if payload.duration_sec is not None:
        lesson.duration_sec = payload.duration_sec
    
    db.commit()
    db.refresh(lesson)
    return lesson




