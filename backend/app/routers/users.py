from fastapi import APIRouter, HTTPException, status
import httpx

from ..config import get_settings
from ..schemas.users import UserPublic


router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{user_id}", response_model=UserPublic)
def get_user_public(user_id: int) -> UserPublic:
	settings = get_settings()
	if not settings.auth_service_url:
		raise HTTPException(status_code=503, detail="Auth service is not configured")

	base_url = settings.auth_service_url.rstrip("/")
	auth_url = f"{base_url}/api/auth/users/{user_id}"

	try:
		with httpx.Client(timeout=10.0) as client:
			res = client.get(auth_url)
	except httpx.HTTPError as exc:
		raise HTTPException(status_code=503, detail=f"Auth service unreachable: {exc}") from exc

	if res.status_code == 404:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

	if not res.is_success:
		try:
			detail = res.json().get("detail")
		except Exception:
			detail = res.text
		raise HTTPException(status_code=res.status_code, detail=detail or "Auth service error")

	payload = res.json() if res.content else {}
	user_id_value = payload.get("id") or payload.get("user_id")
	if user_id_value is None:
		raise HTTPException(status_code=502, detail="Auth service returned malformed user data")

	public = {
		"id": user_id_value,
		"username": payload.get("username") or payload.get("login") or payload.get("handle"),
		"display_name": payload.get("display_name") or payload.get("name"),
		"title": payload.get("title"),
		"rating": payload.get("rating"),
		"country": payload.get("country"),
		"avatar_url": payload.get("avatar_url") or payload.get("avatar"),
		"created_at": payload.get("created_at"),
		"updated_at": payload.get("updated_at"),
	}

	return UserPublic.model_validate(public)


