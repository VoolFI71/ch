from .auth import router as auth_router
from .courses import router as courses_router
from .lessons import router as lessons_router
from .payments import router as payments_router
from .pgn_files import router as pgn_files_router

__all__ = ["auth_router", "courses_router", "lessons_router", "payments_router", "pgn_files_router"]


