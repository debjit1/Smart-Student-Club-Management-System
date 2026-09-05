"""Tests for task assignment and the proof-of-work review workflow
(Epic 4, Stories 4.1 and 4.2)."""
from app import models
from app.models import ROLE_CLUB_HEAD, ROLE_VOLUNTEER
from tests.conftest import auth_headers, make_club, make_user, today_str


def _setup_event_with_volunteer(db_session, club_name="Dance Club"):
    club = make_club(db_session, name=club_name)
    head = make_user(
        db_session, student_id=f"CH-{club_name}", name="Head", email=f"head-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id,
    )
    volunteer = make_user(
        db_session, student_id=f"VOL-{club_name}", name="Volunteer", email=f"vol-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_VOLUNTEER, club_id=club.id,
    )
    event = models.Event(club_id=club.id, name="Tech Fest", event_date=None)
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return club, head, volunteer, event


def test_club_head_assigns_task_to_volunteer(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Attendance", "title": "Scan entries", "priority": "High", "deadline": today_str(1)},
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "Assigned"
    assert body["assigned_to"] == volunteer.id


def test_assign_task_to_non_volunteer_returns_404(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": head.id, "type": "Custom", "title": "Not a volunteer"},
        headers=headers,
    )
    assert resp.status_code == 404


def test_assign_task_wrong_club_head_returns_403(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    other_club, other_head, _, _ = _setup_event_with_volunteer(db_session, "Other Club")
    headers = auth_headers(client, f"head-{other_club.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Custom", "title": "Not my event"},
        headers=headers,
    )
    assert resp.status_code == 403


def test_full_task_lifecycle_accept_submit_verify(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    vol_headers = auth_headers(client, f"vol-{club.id}@iit.ac.in", "pass123")

    task = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Procurement", "title": "Buy props"},
        headers=head_headers,
    ).json()

    accept = client.post(f"/tasks/{task['id']}/accept", headers=vol_headers)
    assert accept.status_code == 200
    assert accept.json()["status"] == "Accepted"

    submit = client.post(
        f"/tasks/{task['id']}/submit-proof", json={"proof_text": "Bought props, receipt attached"}, headers=vol_headers
    )
    assert submit.status_code == 200
    assert submit.json()["status"] == "Submitted"

    review = client.post(f"/tasks/{task['id']}/review", json={"verified": True}, headers=head_headers)
    assert review.status_code == 200
    assert review.json()["status"] == "Verified"


def test_revision_requested_can_be_resubmitted(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    vol_headers = auth_headers(client, f"vol-{club.id}@iit.ac.in", "pass123")

    task = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Bill Upload", "title": "Upload bill"},
        headers=head_headers,
    ).json()
    client.post(f"/tasks/{task['id']}/accept", headers=vol_headers)
    client.post(f"/tasks/{task['id']}/submit-proof", json={"proof_file_name": "bill.pdf"}, headers=vol_headers)
    review = client.post(
        f"/tasks/{task['id']}/review", json={"verified": False, "comment": "Illegible scan"}, headers=head_headers
    )
    assert review.json()["status"] == "Revision Requested"

    resubmit = client.post(
        f"/tasks/{task['id']}/submit-proof", json={"proof_file_name": "bill-clear.pdf"}, headers=vol_headers
    )
    assert resubmit.status_code == 200
    assert resubmit.json()["status"] == "Submitted"


def test_accept_task_not_assignee_returns_403(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    other_volunteer = make_user(
        db_session, student_id="VOL2", name="Other Volunteer", email="vol2@iit.ac.in",
        password="pass123", role=ROLE_VOLUNTEER, club_id=club.id,
    )
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    other_vol_headers = auth_headers(client, "vol2@iit.ac.in", "pass123")

    task = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Custom", "title": "Setup stage"},
        headers=head_headers,
    ).json()

    resp = client.post(f"/tasks/{task['id']}/accept", headers=other_vol_headers)
    assert resp.status_code == 403


def test_submit_proof_before_accept_returns_409(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    vol_headers = auth_headers(client, f"vol-{club.id}@iit.ac.in", "pass123")

    task = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Custom", "title": "Setup stage"},
        headers=head_headers,
    ).json()

    resp = client.post(f"/tasks/{task['id']}/submit-proof", json={"proof_text": "done"}, headers=vol_headers)
    assert resp.status_code == 409


def test_list_my_tasks_returns_only_assigned(client, db_session):
    club, head, volunteer, event = _setup_event_with_volunteer(db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    vol_headers = auth_headers(client, f"vol-{club.id}@iit.ac.in", "pass123")

    client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Custom", "title": "Task A"},
        headers=head_headers,
    )
    resp = client.get("/tasks/mine", headers=vol_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Task A"
