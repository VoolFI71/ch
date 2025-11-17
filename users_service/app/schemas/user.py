from datetime import datetime
from typing import Optional

from pydantic import BaseModel, HttpUrl


class UserPublic(BaseModel):
	id: int
	username: Optional[str] = None
	display_name: Optional[str] = None
	title: Optional[str] = None
	rating: Optional[int] = None
	country: Optional[str] = None
	avatar_url: Optional[HttpUrl] = None
	created_at: Optional[datetime] = None
	updated_at: Optional[datetime] = None

	model_config = {"from_attributes": True}



