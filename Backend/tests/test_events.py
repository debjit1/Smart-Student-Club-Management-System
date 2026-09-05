"""Tests for the event proposal pipeline and venue-conflict-checked
faculty approval (Epic 3, Stories 3.1 and 2.1)."""
from app.models import ROLE_CLUB_HEAD, ROLE_CLUB_PRESIDENT, ROLE_FACULTY_COORDINATOR
from tests.conftest import auth_headers, make_club, make_user, make_venue


def _setup_club_with_roles(client, db_session, club_name="Dance Club"):
    club = make_club(db_session, name=club_name)
    make_user(db_session, student_id=f"CH-{club_name}", name="Head", email=f"head-{club.id}@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    make_user(db_session, student_id=f"PR-{club_name}", name="President", email=f"pres-{club.id}@iit.ac.in", password="pass123", role=ROLE_CLUB_PRESIDENT, club_id=club.id)
    return club


def test_create_proposal_as_draft(client, db_session):
    club = _setup_club_with_roles(client, db_session)
    headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        "/proposals",
        json={"club_id": club.id, "event_name": "Freshers Night", "schedule_date": "2026-08-10", "budget_estimate": 5000},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "Draft"


def test_create_proposal_wrong_club_head_returns_403(client, db_session):
    club_a = _setup_club_with_roles(client, db_session, "Club A")
    club_b = _setup_club_with_roles(client, db_session, "Club B")
    headers = auth_headers(client, f"head-{club_a.id}@iit.ac.in", "pass123")
    resp = client.post(
        "/proposals",
        json={"club_id": club_b.id, "event_name": "Not Mine", "schedule_date": "2026-08-10"},
        headers=headers,
    )
    assert resp.status_code == 403


def test_full_pipeline_approves_and_creates_event_and_booking(client, db_session):
    club = _setup_club_with_roles(client, db_session)
    venue = make_venue(db_session)
    make_user(db_session, student_id="FAC1", name="Faculty", email="faculty1@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)

    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    proposal = client.post(
        "/proposals",
        json={"club_id": club.id, "event_name": "Tech Fest", "schedule_date": "2026-08-12", "venue_id": venue.id, "budget_estimate": 20000},
        headers=head_headers,
    ).json()

    submit = client.post(f"/proposals/{proposal['id']}/submit", headers=head_headers)
    assert submit.status_code == 200
    assert submit.json()["status"] == "Pending President Review"

    pres_headers = auth_headers(client, f"pres-{club.id}@iit.ac.in", "pass123")
    pres_review = client.post(f"/proposals/{proposal['id']}/president-review", json={"approve": True}, headers=pres_headers)
    assert pres_review.status_code == 200
    assert pres_review.json()["status"] == "Pending Faculty Approval"

    fac_headers = auth_headers(client, "faculty1@iit.ac.in", "pass123")
    fac_review = client.post(f"/proposals/{proposal['id']}/faculty-review", json={"approve": True}, headers=fac_headers)
    assert fac_review.status_code == 200
    assert fac_review.json()["status"] == "Approved"

    events = client.get("/events", params={"club_id": club.id}).json()
    assert len(events) == 1
    assert events[0]["name"] == "Tech Fest"

    bookings = client.get("/bookings", params={"venue_id": venue.id}).json()
    assert len(bookings) == 1
    assert bookings[0]["status"] == "Confirmed"


def test_submitting_non_draft_proposal_returns_409(client, db_session):
    club = _setup_club_with_roles(client, db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    proposal = client.post(
        "/proposals", json={"club_id": club.id, "event_name": "Fest", "schedule_date": "2026-08-10"}, headers=head_headers
    ).json()
    client.post(f"/proposals/{proposal['id']}/submit", headers=head_headers)
    second_submit = client.post(f"/proposals/{proposal['id']}/submit", headers=head_headers)
    assert second_submit.status_code == 409


def test_president_rejects_proposal(client, db_session):
    club = _setup_club_with_roles(client, db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    proposal = client.post(
        "/proposals", json={"club_id": club.id, "event_name": "Fest", "schedule_date": "2026-08-10"}, headers=head_headers
    ).json()
    client.post(f"/proposals/{proposal['id']}/submit", headers=head_headers)

    pres_headers = auth_headers(client, f"pres-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/proposals/{proposal['id']}/president-review",
        json={"approve": False, "reason": "Budget too high"},
        headers=pres_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Rejected"
    assert resp.json()["rejection_reason"] == "Budget too high"


def test_faculty_review_blocked_by_venue_conflict(client, db_session):
    """Story 2.1: a second proposal for the same venue+date must not be
    approvable once a Booking already exists for that slot."""
    club = _setup_club_with_roles(client, db_session)
    venue = make_venue(db_session)
    make_user(db_session, student_id="FAC2", name="Faculty", email="faculty2@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)

    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    pres_headers = auth_headers(client, f"pres-{club.id}@iit.ac.in", "pass123")
    fac_headers = auth_headers(client, "faculty2@iit.ac.in", "pass123")

    def run_to_faculty_review(name):
        p = client.post(
            "/proposals",
            json={"club_id": club.id, "event_name": name, "schedule_date": "2026-08-15", "venue_id": venue.id},
            headers=head_headers,
        ).json()
        client.post(f"/proposals/{p['id']}/submit", headers=head_headers)
        client.post(f"/proposals/{p['id']}/president-review", json={"approve": True}, headers=pres_headers)
        return p["id"]

    first_id = run_to_faculty_review("Event One")
    second_id = run_to_faculty_review("Event Two")

    first_approval = client.post(f"/proposals/{first_id}/faculty-review", json={"approve": True}, headers=fac_headers)
    assert first_approval.status_code == 200
    assert first_approval.json()["status"] == "Approved"

    second_approval = client.post(f"/proposals/{second_id}/faculty-review", json={"approve": True}, headers=fac_headers)
    assert second_approval.status_code == 409
    assert "already booked" in second_approval.json()["detail"]

    # the conflicting proposal must remain Pending Faculty Approval, not silently Approved
    still_pending = client.get(f"/proposals/{second_id}").json()
    assert still_pending["status"] == "Pending Faculty Approval"


def test_get_unknown_proposal_returns_404(client):
    resp = client.get("/proposals/999")
    assert resp.status_code == 404


def test_publish_event_requires_owning_club_head(client, db_session):
    club_a = _setup_club_with_roles(client, db_session, "Club A")
    club_b = _setup_club_with_roles(client, db_session, "Club B")
    venue = make_venue(db_session)
    make_user(db_session, student_id="FAC3", name="Faculty", email="faculty3@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)

    head_a = auth_headers(client, f"head-{club_a.id}@iit.ac.in", "pass123")
    pres_a = auth_headers(client, f"pres-{club_a.id}@iit.ac.in", "pass123")
    fac = auth_headers(client, "faculty3@iit.ac.in", "pass123")

    p = client.post(
        "/proposals",
        json={"club_id": club_a.id, "event_name": "A Fest", "schedule_date": "2026-08-18", "venue_id": venue.id},
        headers=head_a,
    ).json()
    client.post(f"/proposals/{p['id']}/submit", headers=head_a)
    client.post(f"/proposals/{p['id']}/president-review", json={"approve": True}, headers=pres_a)
    client.post(f"/proposals/{p['id']}/faculty-review", json={"approve": True}, headers=fac)

    event_id = client.get("/events", params={"club_id": club_a.id}).json()[0]["id"]

    head_b = auth_headers(client, f"head-{club_b.id}@iit.ac.in", "pass123")
    resp = client.post(f"/events/{event_id}/publish", headers=head_b)
    assert resp.status_code == 403
