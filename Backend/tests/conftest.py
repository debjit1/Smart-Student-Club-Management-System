import datetime
import os

os.environ["SSCMS_SKIP_SEED"] = "1"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.main import app
from app.security import hash_password

TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture()
def db_session():
    engine = create_engine(
        TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session, tmp_path):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    # Bill uploads write real files -- redirect to a per-test tmp dir instead
    # of the real Backend/uploads/bills/ so test runs don't leave junk files
    # behind in the repo.
    from app.routers import finance as finance_router
    original_upload_dir = finance_router.UPLOAD_DIR
    finance_router.UPLOAD_DIR = tmp_path / "bills"
    finance_router.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    finance_router.UPLOAD_DIR = original_upload_dir


def make_user(db_session, *, student_id, name, email, password="secret123", role=models.ROLE_STUDENT, club_id=None, department=None, year=None):
    user = models.User(
        student_id=student_id,
        name=name,
        email=email,
        password_hash=hash_password(password),
        department=department,
        year=year,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(models.UserRole(user_id=user.id, role=role, club_id=club_id))
    db_session.commit()
    db_session.refresh(user)
    return user


def make_club(db_session, name="Dance Club", status="Approved"):
    club = models.Club(name=name, category="Cultural", status=status)
    db_session.add(club)
    db_session.commit()
    db_session.refresh(club)
    return club


def make_venue(db_session, name="Auditorium", capacity=450):
    venue = models.Venue(name=name, capacity=capacity, location="Block A")
    db_session.add(venue)
    db_session.commit()
    db_session.refresh(venue)
    return venue


def auth_headers(user_or_client, email=None, password="secret123"):
    if hasattr(user_or_client, "email"):
        from app.security import create_access_token
        roles = [r.role for r in user_or_client.roles] if hasattr(user_or_client, "roles") else []
        token = create_access_token(subject=str(user_or_client.id), extra_claims={"roles": roles})
        return {"Authorization": f"Bearer {token}"}
    resp = user_or_client.post("/auth/login", json={"email": email, "password": password})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def today_str(offset_days=0):
    return (datetime.date.today() + datetime.timedelta(days=offset_days)).isoformat()
