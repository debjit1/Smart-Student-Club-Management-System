"""Tests for club chat endpoints (send + list messages, auth, filtering)."""
from app.models import ROLE_CLUB_HEAD, ROLE_STUDENT
from tests.conftest import auth_headers, make_club, make_user


def test_send_and_list_chat_message(client, db_session):
    club = make_club(db_session)
    make_user(
        db_session, student_id="STU1", name="Student", email="stu1@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    headers = auth_headers(client, "stu1@iit.ac.in", "pass123")

    resp = client.post(f"/clubs/{club.id}/chat", json={"text": "Hello club!"}, headers=headers)
    assert resp.status_code == 201
    msg = resp.json()
    assert msg["club_id"] == club.id
    assert msg["text"] == "Hello club!"
    assert msg["sender_role"] == "student"
    assert msg["sender_id"] is not None
    assert msg["student_id"] is None

    listing = client.get(f"/clubs/{club.id}/chat", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["text"] == "Hello club!"


def test_chat_sender_role_club_head(client, db_session):
    club = make_club(db_session)
    make_user(
        db_session, student_id="CH1", name="Head", email="head@iit.ac.in",
        password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id,
    )
    headers = auth_headers(client, "head@iit.ac.in", "pass123")
    resp = client.post(
        f"/clubs/{club.id}/chat", json={"text": "From the head"}, headers=headers
    )
    assert resp.status_code == 201
    assert resp.json()["sender_role"] == "clubhead"


def test_chat_requires_auth(client, db_session):
    club = make_club(db_session)
    assert client.get(f"/clubs/{club.id}/chat").status_code == 401
    assert client.post(f"/clubs/{club.id}/chat", json={"text": "hi"}).status_code == 401


def test_chat_unknown_club_returns_404(client, db_session):
    make_user(
        db_session, student_id="STU2", name="Student", email="stu2@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    headers = auth_headers(client, "stu2@iit.ac.in", "pass123")
    assert client.get("/clubs/999/chat", headers=headers).status_code == 404
    assert client.post("/clubs/999/chat", json={"text": "hi"}, headers=headers).status_code == 404


def test_chat_club_id_filter(client, db_session):
    club_a = make_club(db_session, name="Club A")
    club_b = make_club(db_session, name="Club B")
    make_user(
        db_session, student_id="STU3", name="Student", email="stu3@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    headers = auth_headers(client, "stu3@iit.ac.in", "pass123")

    client.post(f"/clubs/{club_a.id}/chat", json={"text": "msg for A"}, headers=headers)
    client.post(f"/clubs/{club_b.id}/chat", json={"text": "msg for B"}, headers=headers)
    client.post(f"/clubs/{club_a.id}/chat", json={"text": "second for A"}, headers=headers)

    listing = client.get(f"/clubs/{club_a.id}/chat", headers=headers)
    assert [m["text"] for m in listing.json()] == ["msg for A", "second for A"]
    assert all(m["club_id"] == club_a.id for m in listing.json())


def test_chat_student_id_thread_filter(client, db_session):
    club = make_club(db_session)
    make_user(
        db_session, student_id="STU4", name="Student", email="stu4@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    headers = auth_headers(client, "stu4@iit.ac.in", "pass123")

    client.post(
        f"/clubs/{club.id}/chat",
        json={"student_id": "VOL-101", "text": "to volunteer 101"},
        headers=headers,
    )
    client.post(
        f"/clubs/{club.id}/chat",
        json={"student_id": "VOL-202", "text": "to volunteer 202"},
        headers=headers,
    )
    client.post(
        f"/clubs/{club.id}/chat",
        json={"text": "general chat"},
        headers=headers,
    )

    thread = client.get(
        f"/clubs/{club.id}/chat", params={"student_id": "VOL-101"}, headers=headers
    ).json()
    assert [m["text"] for m in thread] == ["to volunteer 101"]
