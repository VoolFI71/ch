from __future__ import annotations

from typing import Callable

from fastapi import Header, HTTPException, status


def make_internal_token_verifier(
	expected_token_supplier: Callable[[], str | None],
	*,
	header_name: str = "X-Internal-Token",
) -> Callable[[str | None], None]:
	"""Build a FastAPI dependency that validates internal service tokens."""

	def _verify(token: str | None = Header(default=None, alias=header_name)) -> None:
		expected = expected_token_supplier()
		if not expected:
			# token check disabled (e.g. dev mode)
			return
		if token != expected:
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")

	return _verify

