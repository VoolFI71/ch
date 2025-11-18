from __future__ import annotations

from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import Course, Lesson
from ..schemas import PGNFileOut
from ..security import get_current_user_id


router = APIRouter(prefix="/api/pgn-files", tags=["pgn-files"])


def _get_enrollments_client() -> tuple[str, dict[str, str]]:
	settings = get_settings()
	if not settings.enrollments_service_url or not settings.enrollments_internal_token:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Enrollments service unavailable")
	base_url = settings.enrollments_service_url.rstrip("/")
	headers = {"X-Internal-Token": settings.enrollments_internal_token}
	return base_url, headers


def _fetch_user_enrolled_course_ids(user_id: int) -> List[int]:
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

	course_ids: List[int] = []
	for item in data:
		course_id = item.get("course_id")
		if isinstance(course_id, int):
			course_ids.append(course_id)
	return course_ids


@router.get("/", response_model=List[PGNFileOut])
async def list_user_pgn_files(
	db: AsyncSession = Depends(get_db),
	user_id: int = Depends(get_current_user_id),
) -> List[PGNFileOut]:
	course_ids = _fetch_user_enrolled_course_ids(user_id)
	if not course_ids:
		return []

	stmt = (
		select(Lesson)
		.join(Course)
		.where(
			Lesson.course_id.in_(course_ids),
			Lesson.pgn_content.isnot(None),
			Lesson.pgn_content != "",
			Course.is_active == True,  # noqa: E712
		)
		.order_by(Course.title.asc(), Lesson.order_index.asc())
	)
	result = await db.execute(stmt)
	lessons = result.scalars().all()

	output: List[PGNFileOut] = []
	for lesson in lessons:
		if lesson.pgn_content is None:
			continue
		output.append(
			PGNFileOut(
				id=lesson.id,
				course_id=lesson.course_id,
				course_title=lesson.course.title if lesson.course else "",
				lesson_number=lesson.order_index,
				lesson_title=lesson.title,
				pgn_content=lesson.pgn_content,
				created_at=lesson.created_at,
			)
		)

	return output


