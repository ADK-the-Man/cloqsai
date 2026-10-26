from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db

logger = logging.getLogger(__name__)

import bcrypt

pwd_context = None
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    subject: Optional[str] = None,
    extra_claims: Optional[dict[str, Any]] = None,
    data: Optional[dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    if data:
        payload = data.copy()
        if "exp" not in payload:
            exp = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS))
            payload["exp"] = exp
        return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS))
    payload: dict[str, Any] = {
        "sub": str(subject or ""),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Any:
    from models.db import User

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id_raw = payload.get("sub")
        if not user_id_raw:
            raise credentials_exception
        
        user_uuid = UUID(str(user_id_raw)) if isinstance(user_id_raw, str) else user_id_raw
        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            logger.warning("User not found or inactive for id: %s", user_id_raw)
            raise credentials_exception
        return user
    except Exception as exc:
        logger.error("get_current_user error: %s", exc, exc_info=True)
        raise credentials_exception
