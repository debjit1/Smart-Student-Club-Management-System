"""Tests for QR-based event registration and check-in (Epic 5, Stories
5.1 and 5.2)."""
from app import models
from app.models import ROLE_CLUB_HEAD, ROLE_STUDENT, ROLE_VOLUNTEER
from tests.conftest import auth_headers, make_club, make_user


def _setup_event(db_session, club_name="Dance Club"):
    club = make_club(db_session, name=club_name)
    head = make_user(
        db_session, student_id=f"CH-{club_name}", name="Head", email=f"head-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id,
    )
    student = make_user(
        db_session, student_id=f"STU-{club_name}", name="Student", email=f"stu-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    event = models.Event(club_id=club.id, name="Tech Fest", event_date=None)
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return club, head, student, event


def test_student_registers_and_gets_qr_token(client, db_session):
    club, head, student, event = _setup_event(db_session)
    headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    resp = client.post(f"/events/{event.id}/registrations", headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "Registered"
    assert body["qr_token"]


def test_duplicate_registration_returns_409(client, db_session):
    club, head, student, event = _setup_event(db_session)
    headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    client.post(f"/events/{event.id}/registrations", headers=headers)
    resp = client.post(f"/events/{event.id}/registrations", headers=headers)
    assert resp.status_code == 409


def test_register_unknown_event_returns_404(client, db_session):
    club, head, student, event = _setup_event(db_session)
    headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    resp = client.post("/events/999/registrations", headers=headers)
    assert resp.status_code == 404


def test_club_head_checks_in_registrant(client, db_session):
    club, head, student, event = _setup_event(db_session)
    stu_headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")

    registration = client.post(f"/events/{event.id}/registrations", headers=stu_headers).json()
    resp = client.post(f"/registrations/{registration['qr_token']}/check-in", headers=head_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Checked-In"
    assert resp.json()["checked_in_at"] is not None


def test_volunteer_with_attendance_task_can_check_in(client, db_session):
    club, head, student, event = _setup_event(db_session)
    volunteer = make_user(
        db_session, student_id="VOL1", name="Volunteer", email="vol1@iit.ac.in",
        password="pass123", role=ROLE_VOLUNTEER, club_id=club.id,
    )
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Attendance", "title": "Scan entries"},
        headers=head_headers,
    )
    vol_headers = auth_headers(client, "vol1@iit.ac.in", "pass123")
    stu_headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")

    registration = client.post(f"/events/{event.id}/registrations", headers=stu_headers).json()
    resp = client.post(f"/registrations/{registration['qr_token']}/check-in", headers=vol_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Checked-In"


def test_check_in_by_unrelated_user_returns_403(client, db_session):
    club, head, student, event = _setup_event(db_session)
    other_student = make_user(
        db_session, student_id="STU2", name="Other Student", email="stu2@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    stu_headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    other_headers = auth_headers(client, "stu2@iit.ac.in", "pass123")

    registration = client.post(f"/events/{event.id}/registrations", headers=stu_headers).json()
    resp = client.post(f"/registrations/{registration['qr_token']}/check-in", headers=other_headers)
    assert resp.status_code == 403


def test_double_check_in_returns_409(client, db_session):
    club, head, student, event = _setup_event(db_session)
    stu_headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")

    registration = client.post(f"/events/{event.id}/registrations", headers=stu_headers).json()
    client.post(f"/registrations/{registration['qr_token']}/check-in", headers=head_headers)
    resp = client.post(f"/registrations/{registration['qr_token']}/check-in", headers=head_headers)
    assert resp.status_code == 409


def test_check_in_unknown_token_returns_404(client, db_session):
    club, head, student, event = _setup_event(db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.post("/registrations/does-not-exist/check-in", headers=head_headers)
    assert resp.status_code == 404


def test_event_roster_visible_to_club_head_only(client, db_session):
    club, head, student, event = _setup_event(db_session)
    other_club_head = make_user(
        db_session, student_id="CH2", name="Other Head", email="head2@iit.ac.in",
        password="pass123", role=ROLE_CLUB_HEAD, club_id=999,
    )
    stu_headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    other_headers = auth_headers(client, "head2@iit.ac.in", "pass123")

    client.post(f"/events/{event.id}/registrations", headers=stu_headers)

    ok = client.get(f"/events/{event.id}/registrations", headers=head_headers)
    assert ok.status_code == 200
    assert len(ok.json()) == 1

    forbidden = client.get(f"/events/{event.id}/registrations", headers=other_headers)
    assert forbidden.status_code == 403


def test_list_my_registrations(client, db_session):
    club, head, student, event = _setup_event(db_session)
    stu_headers = auth_headers(client, f"stu-{club.id}@iit.ac.in", "pass123")
    client.post(f"/events/{event.id}/registrations", headers=stu_headers)
    resp = client.get("/registrations/mine", headers=stu_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
