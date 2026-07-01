from fastapi import HTTPException, status


class NotFoundError(HTTPException):
    def __init__(self, resource: str):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=f"{resource} not found")


class UnauthorizedError(HTTPException):
    def __init__(self, detail: str = "Authentication required"):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "Access denied"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class QuotaExceededError(HTTPException):
    def __init__(self, resource: str = "generation"):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Quota exceeded for {resource}. Upgrade your plan to continue.",
        )


class GenerationError(HTTPException):
    def __init__(self, detail: str = "Content generation failed"):
        super().__init__(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)


class ValidationError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
