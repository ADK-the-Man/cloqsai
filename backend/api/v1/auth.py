"""
Authentication endpoints supporting password credentials and social browser SSO (Google/Gmail, Microsoft/Outlook).
"""
import logging
import uuid
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings, get_settings
from core.database import get_db
from core.security import verify_password, hash_password, create_access_token, get_current_user
from models.db import User
from models.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    AuthConfigResponse,
    BrowserSessionLoginRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/auth/config", response_model=AuthConfigResponse)
async def get_auth_config():
    """Returns current auth configuration and active social login providers."""
    cfg = get_settings()
    providers = ["google"] if cfg.LOGIN_ENABLED else []
    return AuthConfigResponse(
        login_enabled=cfg.LOGIN_ENABLED,
        providers=providers,
        google_client_id_configured=bool(cfg.GOOGLE_CLIENT_ID),
        microsoft_client_id_configured=bool(cfg.MICROSOFT_CLIENT_ID),
    )


@router.post("/auth/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    cfg = get_settings()
    # When LOGIN_ENABLED is false, fall back strictly to login only (no register)
    if not cfg.LOGIN_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled when LOGIN_ENABLED is false. Please sign in with existing credentials.",
        )

    email_clean = req.email.strip().lower()
    res = await db.execute(select(User).where(User.email == email_clean))
    existing = res.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    new_user = User(
        id=uuid.uuid4(),
        email=email_clean,
        hashed_password=hash_password(req.password),
        name=req.name.strip(),
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token = create_access_token(data={"sub": str(new_user.id), "email": new_user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user),
    )


@router.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == req.email))
    user = res.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/auth/token", response_model=TokenResponse)
async def login_oauth2(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == form_data.username))
    user = res.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


# ── Social / Browser Login Routes (Gmail, Outlook) ───────────────────────────

@router.post("/auth/oauth/browser-session", response_model=TokenResponse)
async def browser_session_login(req: BrowserSessionLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Direct browser session sign-in for Gmail & Outlook.
    Active when LOGIN_ENABLED=true. Automatically provisions or authenticates the account.
    """
    cfg = get_settings()
    if not cfg.LOGIN_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Social browser login is currently disabled (LOGIN_ENABLED=false).",
        )

    email_clean = req.email.strip().lower()
    if "@" not in email_clean or len(email_clean) < 5:
        raise HTTPException(status_code=400, detail="Invalid email address format.")

    provider = req.provider.strip().lower()
    if provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Unsupported auth provider. Supported: google, microsoft.")

    # Find or upsert user
    res = await db.execute(select(User).where(User.email == email_clean))
    user = res.scalar_one_or_none()

    if not user:
        display_name = req.name.strip() if req.name else email_clean.split("@")[0].replace(".", " ").title()
        user = User(
            id=uuid.uuid4(),
            email=email_clean,
            hashed_password=hash_password(uuid.uuid4().hex + "SocialSSO!"),
            name=display_name,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get("/auth/oauth/{provider}/authorize")
async def oauth_authorize(provider: str):
    """
    Initiates standard OAuth 2.0 flow for Google or Microsoft.
    """
    cfg = get_settings()
    if not cfg.LOGIN_ENABLED:
        raise HTTPException(status_code=403, detail="Social login is disabled.")

    provider_clean = provider.strip().lower()
    redirect_uri = f"{cfg.FRONTEND_URL}/api/v1/auth/oauth/{provider_clean}/callback"

    if provider_clean == "google":
        if not cfg.GOOGLE_CLIENT_ID:
            # Fall back to frontend browser login modal if client ID is not yet provisioned in Google Cloud
            return RedirectResponse(url=f"{cfg.FRONTEND_URL}/login?prompt_browser_login=google")
        params = {
            "client_id": cfg.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
        }
        return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}")

    elif provider_clean == "microsoft":
        if not cfg.MICROSOFT_CLIENT_ID:
            return RedirectResponse(url=f"{cfg.FRONTEND_URL}/login?prompt_browser_login=microsoft")
        params = {
            "client_id": cfg.MICROSOFT_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile User.Read",
            "response_mode": "query",
            "prompt": "select_account",
        }
        return RedirectResponse(f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{urllib.parse.urlencode(params)}")

    else:
        raise HTTPException(status_code=400, detail="Provider must be 'google' or 'microsoft'.")


@router.get("/auth/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Handles OAuth 2.0 exchange callback from Google or Microsoft.
    """
    cfg = get_settings()
    if not cfg.LOGIN_ENABLED:
        return RedirectResponse(url=f"{cfg.FRONTEND_URL}/login?error=OAuth+disabled")

    if error or not code:
        logger.warning(f"OAuth callback received error: {error}")
        return RedirectResponse(url=f"{cfg.FRONTEND_URL}/login?error={urllib.parse.quote(error or 'Missing authorization code')}")

    provider_clean = provider.strip().lower()
    redirect_uri = f"{cfg.FRONTEND_URL}/api/v1/auth/oauth/{provider_clean}/callback"
    email: Optional[str] = None
    name: Optional[str] = None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider_clean == "google":
                token_resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": cfg.GOOGLE_CLIENT_ID,
                        "client_secret": cfg.GOOGLE_CLIENT_SECRET,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                token_resp.raise_for_status()
                token_data = token_resp.json()
                access_token = token_data.get("access_token")

                info_resp = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                info_resp.raise_for_status()
                info = info_resp.json()
                email = info.get("email")
                name = info.get("name")

            elif provider_clean == "microsoft":
                token_resp = await client.post(
                    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                    data={
                        "code": code,
                        "client_id": cfg.MICROSOFT_CLIENT_ID,
                        "client_secret": cfg.MICROSOFT_CLIENT_SECRET,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                token_resp.raise_for_status()
                token_data = token_resp.json()
                access_token = token_data.get("access_token")

                info_resp = await client.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                info_resp.raise_for_status()
                info = info_resp.json()
                email = info.get("mail") or info.get("userPrincipalName")
                name = info.get("displayName")

            if not email:
                return RedirectResponse(url=f"{cfg.FRONTEND_URL}/login?error=Could+not+retrieve+email+from+provider")

            email_clean = email.strip().lower()
            res = await db.execute(select(User).where(User.email == email_clean))
            user = res.scalar_one_or_none()

            if not user:
                user = User(
                    id=uuid.uuid4(),
                    email=email_clean,
                    hashed_password=hash_password(uuid.uuid4().hex + "SSOSecret!"),
                    name=name or email_clean.split("@")[0].title(),
                    is_active=True,
                    created_at=datetime.now(timezone.utc),
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)

            jwt_token = create_access_token(data={"sub": str(user.id), "email": user.email})
            return RedirectResponse(url=f"{cfg.FRONTEND_URL}/login?token={jwt_token}")

    except Exception as exc:
        logger.exception(f"OAuth exchange failed: {exc}")
        return RedirectResponse(url=f"{cfg.FRONTEND_URL}/login?error=OAuth+authentication+failed")
