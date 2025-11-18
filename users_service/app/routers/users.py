from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..schemas import UserPublic


router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{user_id}", response_model=UserPublic)
async def get_user_by_id(user_id: int, db: AsyncSession = Depends(get_db)) -> UserPublic:
	user = await db.get(User, user_id)
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

	return UserPublic(
		id=user.id,
		username=user.username,
		display_name=user.username,
		created_at=user.created_at,
		updated_at=user.updated_at,
	)
