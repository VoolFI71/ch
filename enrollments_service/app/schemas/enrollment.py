from datetime import datetime

from pydantic import BaseModel, Field


class EnrollmentCreate(BaseModel):
	course_id: int = Field(gt=0)


class EnrollmentInternalCreate(BaseModel):
	user_id: int = Field(gt=0)
	course_id: int = Field(gt=0)


class EnrollmentOut(BaseModel):
	id: int
	user_id: int
	course_id: int
	created_at: datetime

	class Config:
		from_attributes = True


class EnrollmentEnsureResponse(BaseModel):
	enrollment: EnrollmentOut
	created: bool


