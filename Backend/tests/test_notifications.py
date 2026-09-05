"""Tests for the notifications endpoints (create, list, read-all, scoping)."""
from app.models import ROLE_STUDENT
from tests.conftest import auth_headers, make_user


def test_create_and_list_notification(client, db_session):
    make_user(
        db_session, student_id="STU1", name="Student", email="stu1@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    headers = auth_headers(client, "stu1@iit.ac.in", "pass123")

    resp = client.post(
        "/notifications", json={"message": "Your proposal was approved"}, headers=headers
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["message"] == "Your proposal was approved"
    assert data["read"] is False
    assert data["user_id"] is not None

    listing = client.get("/notifications", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["message"] == "Your proposal was approved"


def test_read_all_returns_updated_count(client, db_session):
    make_user(
        db_session, student_id="STU2", name="Student", email="stu2@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    headers = auth_headers(client, "stu2@iit.ac.in", "pass123")

    for i in range(3):
        client.post("/notifications", json={"message": f"msg {i}"}, headers=headers)

    resp = client.post("/notifications/read-all", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["updated"] == 3

    listing = client.get("/notifications", headers=headers).json()
    assert len(listing) == 3
    assert all(n["read"] is True for n in listing)

    # Nothing left unread -- a second call updates zero rows.
    resp = client.post("/notifications/read-all", headers=headers)
    assert resp.json()["updated"] == 0


def test_notifications_scoped_to_current_user(client, db_session):
    make_user(
        db_session, student_id="STU3", name="Student", email="stu3@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    make_user(
        db_session, student_id="STU4", name="Student", email="stu4@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    h3 = auth_headers(client, "stu3@iit.ac.in", "pass123")
    h4 = auth_headers(client, "stu4@iit.ac.in", "pass123")

    client.post("/notifications", json={"message": "for user 3"}, headers=h3)
    client.post("/notifications", json={"message": "for user 4"}, headers=h4)
    client.post("/notifications", json={"message": "another for 3"}, headers=h3)

    listing = client.get("/notifications", headers=h3).json()
    assert len(listing) == 2
    assert {n["message"] for n in listing} == {"for user 3", "another for 3"}

    other = client.get("/notifications", headers=h4).json()
    assert [n["message"] for n in other] == ["for user 4"]


def test_notifications_require_auth(client):
    assert client.get("/notifications").status_code == 401
    assert client.post("/notifications", json={"message": "hi"}).status_code == 401
    assert client.post("/notifications/read-all").status_code == 401
