"""Tests for event finalization/certificate issuance and the Faculty
Coordinator's budget-overview analytics (Epic 6, Stories 6.1 and 6.2)."""
import datetime
from decimal import Decimal

from app import models
from app.models import ROLE_CLUB_HEAD, ROLE_FACULTY_COORDINATOR, ROLE_STUDENT, ROLE_VOLUNTEER
from tests.conftest import auth_headers, make_club, make_user, make_venue


def _setup_event(db_session, club_name="Dance Club"):
    club = make_club(db_session, name=club_name)
    club.budget_allotted = Decimal("10000")
    club.budget_spent = Decimal("2000")
    db_session.commit()
    head = make_user(
        db_session, student_id=f"CH-{club_name}", name="Head", email=f"head-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id,
    )
    faculty = make_user(
        db_session, student_id=f"FAC-{club_name}", name="Faculty", email=f"fac-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_FACULTY_COORDINATOR,
    )
    event = models.Event(club_id=club.id, name="Tech Fest", event_date=datetime.date.today())
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return club, head, faculty, event


def test_finalize_issues_certificates_to_volunteer_and_attendee(client, db_session):
    club, head, faculty, event = _setup_event(db_session)
    volunteer = make_user(
        db_session, student_id="VOL1", name="Volunteer", email="vol1@iit.ac.in",
        password="pass123", role=ROLE_VOLUNTEER, club_id=club.id,
    )
    student = make_user(
        db_session, student_id="STU1", name="Student", email="stu1@iit.ac.in", password="pass123", role=ROLE_STUDENT
    )
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    vol_headers = auth_headers(client, "vol1@iit.ac.in", "pass123")
    stu_headers = auth_headers(client, "stu1@iit.ac.in", "pass123")
    fac_headers = auth_headers(client, f"fac-{club.id}@iit.ac.in", "pass123")

    task = client.post(
        f"/events/{event.id}/tasks",
        json={"assigned_to": volunteer.id, "type": "Custom", "title": "Setup"},
        headers=head_headers,
    ).json()
    client.post(f"/tasks/{task['id']}/accept", headers=vol_headers)
    client.post(f"/tasks/{task['id']}/submit-proof", json={"proof_text": "done"}, headers=vol_headers)
    client.post(f"/tasks/{task['id']}/review", json={"verified": True}, headers=head_headers)

    registration = client.post(f"/events/{event.id}/registrations", headers=stu_headers).json()
    client.post(f"/registrations/{registration['qr_token']}/check-in", headers=head_headers)

    resp = client.post(f"/events/{event.id}/finalize", headers=fac_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["event"]["finalized"] is True
    reasons = {c["user_id"]: c["reason"] for c in body["certificates_issued"]}
    assert reasons[volunteer.id] == "Volunteer"
    assert reasons[student.id] == "Attendee"

    vol_certs = client.get("/certificates", headers=vol_headers).json()
    assert len(vol_certs) == 1
    assert vol_certs[0]["reason"] == "Volunteer"

    stu_certs = client.get("/certificates", headers=stu_headers).json()
    assert len(stu_certs) == 1
    assert stu_certs[0]["reason"] == "Attendee"


def test_finalize_twice_returns_409(client, db_session):
    club, head, faculty, event = _setup_event(db_session)
    fac_headers = auth_headers(client, f"fac-{club.id}@iit.ac.in", "pass123")
    client.post(f"/events/{event.id}/finalize", headers=fac_headers)
    resp = client.post(f"/events/{event.id}/finalize", headers=fac_headers)
    assert resp.status_code == 409


def test_finalize_requires_faculty_role(client, db_session):
    club, head, faculty, event = _setup_event(db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.post(f"/events/{event.id}/finalize", headers=head_headers)
    assert resp.status_code == 403


def test_finalize_unknown_event_returns_404(client, db_session):
    club, head, faculty, event = _setup_event(db_session)
    fac_headers = auth_headers(client, f"fac-{club.id}@iit.ac.in", "pass123")
    resp = client.post("/events/999/finalize", headers=fac_headers)
    assert resp.status_code == 404


def test_budget_overview_aggregates_across_clubs(client, db_session):
    club, head, faculty, event = _setup_event(db_session)
    venue = make_venue(db_session)
    db_session.add(models.Booking(venue_id=venue.id, event_id=event.id, club_id=club.id, booking_date=event.event_date, status="Confirmed"))
    item = models.InventoryItem(code="CAM-1", name="Camera", total_stock=2, available_stock=1, status="Low Stock")
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    db_session.add(models.InventoryUsage(item_id=item.id, club_id=club.id, event_id=event.id, quantity=1, status="In Use"))
    db_session.commit()

    fac_headers = auth_headers(client, f"fac-{club.id}@iit.ac.in", "pass123")
    resp = client.get("/analytics/budget-overview", headers=fac_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["active_bookings"] == 1
    assert body["inventory_on_loan"] == 1
    club_row = next(c for c in body["clubs"] if c["club_id"] == club.id)
    assert Decimal(club_row["allocated"]) == Decimal("10000")
    assert Decimal(club_row["spent"]) == Decimal("2000")


def test_budget_overview_requires_faculty_role(client, db_session):
    club, head, faculty, event = _setup_event(db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.get("/analytics/budget-overview", headers=head_headers)
    assert resp.status_code == 403
