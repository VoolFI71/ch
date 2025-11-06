from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Course, Lesson, User, Enrollment
from ..schemas.lesson import PGNFileOut
from ..security import get_current_user


router = APIRouter(prefix="/api/pgn-files", tags=["pgn-files"])


@router.get("/", response_model=List[PGNFileOut])
def list_user_pgn_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[PGNFileOut]:
    """
    Get all PGN files for lessons in courses that the user has access to.
    Returns files in format: "Course Title" Урок {lesson_number}
    """
    # Get all enrollments for the user
    enrollments = db.query(Enrollment).filter(Enrollment.user_id == current_user.id).all()
    enrolled_course_ids = [e.course_id for e in enrollments]
    
    # Build filter for accessible courses
    from sqlalchemy import or_
    course_filter = Course.price_cents == 0
    if enrolled_course_ids:
        course_filter = or_(Course.id.in_(enrolled_course_ids), Course.price_cents == 0)
    
    # Get all lessons with PGN content from enrolled courses or free courses
    lessons = (
        db.query(Lesson)
        .join(Course)
        .filter(
            Lesson.pgn_content.isnot(None),
            Lesson.pgn_content != "",
            course_filter,
            Course.is_active == True
        )
        .order_by(Course.title.asc(), Lesson.order_index.asc())
        .all()
    )
    
    # Format response
    result = []
    for lesson in lessons:
        result.append(PGNFileOut(
            id=lesson.id,
            course_id=lesson.course_id,
            course_title=lesson.course.title,
            lesson_number=lesson.order_index,
            lesson_title=lesson.title,
            pgn_content=lesson.pgn_content,
            created_at=lesson.created_at
        ))
    
    return result

