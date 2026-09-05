"""Tests for venues, inventory and conflict-checked bookings (Epic 2, Story 2.1)."""
from app.models import ROLE_CLUB_HEAD, ROLE_FACULTY_COORDINATOR
from tests.conftest import auth_headers, make_club, make_user, make_venue


def _make_event(db_session, club):
    from app import models

    event = models.Event(club_id=club.id, name="Test Event", published=False, finalized=False)
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def test_create_venue_requires_faculty_role(client, db_session):
    club = make_club(db_session)
    make_user(db_session, student_id="CH1", name="Head", email="head@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    headers = auth_headers(client, "head@iit.ac.in", "pass123")
    resp = client.post("/venues", json={"name": "New Hall", "capacity": 100}, headers=headers)
    assert resp.status_code == 403


def test_list_venues_is_public(client, db_session):
    make_venue(db_session, name="Auditorium")
    resp = client.get("/venues")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "Auditorium"


def test_venue_availability_true_when_no_booking(client, db_session):
    venue = make_venue(db_session)
    resp = client.get(f"/venues/{venue.id}/availability", params={"booking_date": "2026-08-15"})
    assert resp.status_code == 200
    assert resp.json()["available"] is True


def test_venue_availability_unknown_venue_returns_404(client):
    resp = client.get("/venues/999/availability", params={"booking_date": "2026-08-15"})
    assert resp.status_code == 404


def test_create_booking_then_conflicting_booking_returns_409(client, db_session):
    club = make_club(db_session)
    venue = make_venue(db_session)
    event1 = _make_event(db_session, club)
    event2 = _make_event(db_session, club)
    make_user(db_session, student_id="FC1", name="Faculty", email="fc1@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc1@iit.ac.in", "pass123")

    first = client.post(
        "/bookings",
        json={"venue_id": venue.id, "event_id": event1.id, "booking_date": "2026-08-20"},
        headers=headers,
    )
    assert first.status_code == 201
    assert first.json()["status"] == "Confirmed"

    second = client.post(
        "/bookings",
        json={"venue_id": venue.id, "event_id": event2.id, "booking_date": "2026-08-20"},
        headers=headers,
    )
    assert second.status_code == 409
    assert "already booked" in second.json()["detail"]

    availability = client.get(f"/venues/{venue.id}/availability", params={"booking_date": "2026-08-20"})
    assert availability.json()["available"] is False


def test_booking_different_date_succeeds(client, db_session):
    club = make_club(db_session)
    venue = make_venue(db_session)
    event1 = _make_event(db_session, club)
    event2 = _make_event(db_session, club)
    make_user(db_session, student_id="FC2", name="Faculty", email="fc2@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc2@iit.ac.in", "pass123")

    client.post("/bookings", json={"venue_id": venue.id, "event_id": event1.id, "booking_date": "2026-09-01"}, headers=headers)
    second = client.post("/bookings", json={"venue_id": venue.id, "event_id": event2.id, "booking_date": "2026-09-02"}, headers=headers)
    assert second.status_code == 201


def test_release_booking_then_rebooking_same_date_succeeds(client, db_session):
    club = make_club(db_session)
    venue = make_venue(db_session)
    event1 = _make_event(db_session, club)
    event2 = _make_event(db_session, club)
    make_user(db_session, student_id="FC3", name="Faculty", email="fc3@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc3@iit.ac.in", "pass123")

    booking = client.post("/bookings", json={"venue_id": venue.id, "event_id": event1.id, "booking_date": "2026-09-05"}, headers=headers).json()
    release = client.post(f"/bookings/{booking['id']}/release", headers=headers)
    assert release.status_code == 200
    assert release.json()["status"] == "Released"

    rebook = client.post("/bookings", json={"venue_id": venue.id, "event_id": event2.id, "booking_date": "2026-09-05"}, headers=headers)
    assert rebook.status_code == 201


def test_inventory_checkout_reduces_available_stock(client, db_session):
    club = make_club(db_session)
    event = _make_event(db_session, club)
    make_user(db_session, student_id="FC4", name="Faculty", email="fc4@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc4@iit.ac.in", "pass123")

    item = client.post("/inventory", json={"code": "AV-MIC-01", "name": "Wireless Mics", "total_stock": 8}, headers=headers).json()
    checkout = client.post(
        f"/inventory/{item['id']}/checkout", params={"event_id": event.id, "quantity": 3}, headers=headers
    )
    assert checkout.status_code == 200
    assert checkout.json()["available_stock"] == 5


def test_inventory_checkout_over_stock_returns_409(client, db_session):
    club = make_club(db_session)
    event = _make_event(db_session, club)
    make_user(db_session, student_id="FC5", name="Faculty", email="fc5@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc5@iit.ac.in", "pass123")

    item = client.post("/inventory", json={"code": "AV-PROJ-01", "name": "Projector", "total_stock": 2}, headers=headers).json()
    resp = client.post(
        f"/inventory/{item['id']}/checkout", params={"event_id": event.id, "quantity": 5}, headers=headers
    )
    assert resp.status_code == 409
