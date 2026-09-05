"""Tests for POST /auth/register, POST /auth/login, GET /auth/me (Epic 1.1)."""
from app.models import ROLE_STUDENT
from tests.conftest import auth_headers, make_user


def test_register_creates_user_with_role(client):
    resp = client.post(
        "/auth/register",
        json={
            "student_id": "IIT2026999",
            "name": "Test Student",
            "email": "test.student@iit.ac.in",
            "password": "secret123",
            "department": "CSE",
            "year": "2nd Year",
            "role": ROLE_STUDENT,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "test.student@iit.ac.in"
    assert body["roles"][0]["role"] == ROLE_STUDENT


def test_register_duplicate_email_returns_409(client):
    payload = {
        "student_id": "IIT2026001",
        "name": "A",
        "email": "dup@iit.ac.in",
        "password": "secret123",
        "role": ROLE_STUDENT,
    }
    first = client.post("/auth/register", json=payload)
    assert first.status_code == 201
    payload["student_id"] = "IIT2026002"
    second = client.post("/auth/register", json=payload)
    assert second.status_code == 409


def test_register_invalid_role_returns_422(client):
    resp = client.post(
        "/auth/register",
        json={
            "student_id": "IIT2026003",
            "name": "B",
            "email": "b@iit.ac.in",
            "password": "secret123",
            "role": "SuperAdmin",
        },
    )
    assert resp.status_code == 422


def test_login_success_returns_token(client, db_session):
    make_user(db_session, student_id="S1", name="Isha", email="isha@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    resp = client.post("/auth/login", json={"email": "isha@iit.ac.in", "password": "pass123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "isha@iit.ac.in"


def test_login_wrong_password_returns_401(client, db_session):
    make_user(db_session, student_id="S2", name="Isha", email="isha2@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    resp = client.post("/auth/login", json={"email": "isha2@iit.ac.in", "password": "wrong"})
    assert resp.status_code == 401


def test_login_unknown_email_returns_401(client):
    resp = client.post("/auth/login", json={"email": "ghost@iit.ac.in", "password": "whatever"})
    assert resp.status_code == 401


def test_me_requires_token(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_me_returns_current_user(client, db_session):
    make_user(db_session, student_id="S3", name="Kabir", email="kabir@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    headers = auth_headers(client, "kabir@iit.ac.in", "pass123")
    resp = client.get("/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Kabir"


def test_change_password_success(client, db_session):
    make_user(db_session, student_id="S4", name="Noor", email="noor@iit.ac.in", password="oldpass1", role=ROLE_STUDENT)
    headers = auth_headers(client, "noor@iit.ac.in", "oldpass1")

    resp = client.post(
        "/auth/change-password",
        json={"current_password": "oldpass1", "new_password": "newpass9"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Password changed successfully"

    # Old password no longer works, the new one does.
    assert client.post("/auth/login", json={"email": "noor@iit.ac.in", "password": "oldpass1"}).status_code == 401
    login = client.post("/auth/login", json={"email": "noor@iit.ac.in", "password": "newpass9"})
    assert login.status_code == 200


def test_change_password_wrong_current_returns_400(client, db_session):
    make_user(db_session, student_id="S5", name="Reva", email="reva@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    headers = auth_headers(client, "reva@iit.ac.in", "pass123")

    resp = client.post(
        "/auth/change-password",
        json={"current_password": "wrong-pass", "new_password": "newpass9"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Current password is incorrect"


def test_change_password_requires_auth(client):
    resp = client.post(
        "/auth/change-password",
        json={"current_password": "whatever", "new_password": "newpass9"},
    )
    assert resp.status_code == 401


def test_change_password_new_password_too_short_returns_422(client, db_session):
    make_user(db_session, student_id="S6", name="Dev", email="dev@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    headers = auth_headers(client, "dev@iit.ac.in", "pass123")

    resp = client.post(
        "/auth/change-password",
        json={"current_password": "pass123", "new_password": "123"},
        headers=headers,
    )
    assert resp.status_code == 422
