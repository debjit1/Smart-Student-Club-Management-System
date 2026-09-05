"""Tests for venue and inventory update (PATCH) and delete (DELETE) endpoints."""
from app.models import ROLE_CLUB_HEAD, ROLE_FACULTY_COORDINATOR
from tests.conftest import auth_headers, make_club, make_user, make_venue


def _faculty(client, db_session, email="fac@iit.ac.in", student_id="FCX"):
    make_user(
        db_session,
        student_id=student_id,
        name="Faculty",
        email=email,
        password="pass123",
        role=ROLE_FACULTY_COORDINATOR,
    )
    return auth_headers(client, email, "pass123")


# ── PATCH /venues/{venue_id} ──────────────────────────────────────
def test_patch_venue_happy_path(client, db_session):
    venue = make_venue(db_session, name="Old Hall", capacity=100)
    headers = _faculty(client, db_session)
    resp = client.patch(
        f"/venues/{venue.id}",
        json={"name": "New Hall", "capacity": 250, "location": "Block B"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Hall"
    assert data["capacity"] == 250
    assert data["location"] == "Block B"


def test_patch_venue_non_faculty_returns_403(client, db_session):
    club = make_club(db_session)
    venue = make_venue(db_session)
    make_user(
        db_session,
        student_id="CH1",
        name="Head",
        email="head@iit.ac.in",
        password="pass123",
        role=ROLE_CLUB_HEAD,
        club_id=club.id,
    )
    headers = auth_headers(client, "head@iit.ac.in", "pass123")
    resp = client.patch(f"/venues/{venue.id}", json={"name": "Hijacked"}, headers=headers)
    assert resp.status_code == 403


def test_patch_venue_not_found_returns_404(client, db_session):
    headers = _faculty(client, db_session)
    resp = client.patch("/venues/999", json={"name": "Ghost"}, headers=headers)
    assert resp.status_code == 404


# ── DELETE /venues/{venue_id} ─────────────────────────────────────
def test_delete_venue_without_references_returns_204(client, db_session):
    venue = make_venue(db_session, name="Temporary Hall")
    headers = _faculty(client, db_session)
    resp = client.delete(f"/venues/{venue.id}", headers=headers)
    assert resp.status_code == 204
    remaining = client.get("/venues").json()
    assert all(v["id"] != venue.id for v in remaining)


def test_delete_venue_referenced_by_booking_returns_409(client, db_session):
    venue = make_venue(db_session)
    headers = _faculty(client, db_session)
    booking = client.post(
        "/bookings",
        json={"venue_id": venue.id, "event_name": "Test Event", "booking_date": "2026-09-10"},
        headers=headers,
    )
    assert booking.status_code == 201

    resp = client.delete(f"/venues/{venue.id}", headers=headers)
    assert resp.status_code == 409
    assert "booking" in resp.json()["detail"].lower()


def test_delete_venue_referenced_by_proposal_returns_409(client, db_session):
    club = make_club(db_session)
    venue = make_venue(db_session)
    make_user(
        db_session,
        student_id="CH2",
        name="Head",
        email="head2@iit.ac.in",
        password="pass123",
        role=ROLE_CLUB_HEAD,
        club_id=club.id,
    )
    head_headers = auth_headers(client, "head2@iit.ac.in", "pass123")
    proposal = client.post(
        "/proposals",
        json={"club_id": club.id, "event_name": "Fest", "venue_id": venue.id},
        headers=head_headers,
    )
    assert proposal.status_code == 201

    headers = _faculty(client, db_session, email="fac2@iit.ac.in", student_id="FCY")
    resp = client.delete(f"/venues/{venue.id}", headers=headers)
    assert resp.status_code == 409
    assert "proposal" in resp.json()["detail"].lower()


# ── PATCH /inventory/{item_id} ────────────────────────────────────
def test_patch_inventory_recalculates_available_stock(client, db_session):
    headers = _faculty(client, db_session)
    item = client.post(
        "/inventory", json={"code": "AV-MIC-01", "name": "Mics", "total_stock": 10}, headers=headers
    ).json()

    # Check out 3 -- available drops to 7, so the "checked out" delta is 3.
    usage = client.post("/inventory/usage", json={"item_id": item["id"], "quantity": 3}, headers=headers)
    assert usage.status_code == 201

    resp = client.patch(
        f"/inventory/{item['id']}",
        json={"total_stock": 20, "name": "Wireless Mics"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_stock"] == 20
    # Delta (3 checked out) is preserved: 20 - 3 = 17.
    assert data["available_stock"] == 17
    assert data["name"] == "Wireless Mics"


def test_patch_inventory_non_faculty_returns_403(client, db_session):
    club = make_club(db_session)
    make_user(
        db_session,
        student_id="CH3",
        name="Head",
        email="head3@iit.ac.in",
        password="pass123",
        role=ROLE_CLUB_HEAD,
        club_id=club.id,
    )
    headers = auth_headers(client, "head3@iit.ac.in", "pass123")
    resp = client.patch("/inventory/1", json={"name": "Hijacked"}, headers=headers)
    assert resp.status_code == 403


def test_patch_inventory_not_found_returns_404(client, db_session):
    headers = _faculty(client, db_session)
    resp = client.patch("/inventory/999", json={"name": "Ghost"}, headers=headers)
    assert resp.status_code == 404


# ── DELETE /inventory/{item_id} ───────────────────────────────────
def test_delete_inventory_without_usage_returns_204(client, db_session):
    headers = _faculty(client, db_session)
    item = client.post(
        "/inventory", json={"code": "AV-PROJ-01", "name": "Projector", "total_stock": 2}, headers=headers
    ).json()
    resp = client.delete(f"/inventory/{item['id']}", headers=headers)
    assert resp.status_code == 204
    remaining = client.get("/inventory").json()
    assert all(i["id"] != item["id"] for i in remaining)


def test_delete_inventory_referenced_by_usage_returns_409(client, db_session):
    headers = _faculty(client, db_session)
    item = client.post(
        "/inventory", json={"code": "AV-LIGHT-01", "name": "Lights", "total_stock": 5}, headers=headers
    ).json()
    usage = client.post("/inventory/usage", json={"item_id": item["id"], "quantity": 2}, headers=headers)
    assert usage.status_code == 201

    resp = client.delete(f"/inventory/{item['id']}", headers=headers)
    assert resp.status_code == 409
    assert "usage" in resp.json()["detail"].lower()
