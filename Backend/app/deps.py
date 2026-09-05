from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise credentials_error
    user = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
    if not user:
        raise credentials_error
    return user


def require_roles(*allowed_roles: str):
    def _checker(user: models.User = Depends(get_current_user)) -> models.User:
        user_role_names = {r.role for r in user.roles}
        if not user_role_names.intersection(allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed_roles)}",
            )
        return user

    return _checker


def user_has_role(user: models.User, role: str, club_id: int = None) -> bool:
    for r in user.roles:
        if r.role == role and (club_id is None or r.club_id == club_id):
            return True
    return False
