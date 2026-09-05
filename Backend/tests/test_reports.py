"""Tests for Report Generation Component (Component 13).

Covers: generate, list, get, download, role enforcement, date-range filtering,
and report-type validation.
"""
import datetime
import json

from tests.conftest import make_club, make_user, auth_headers, today_str


# ── fixtures ──────────────────────────────────────────────────────

def _setup_data(db):
    """Create minimal data so reports have something to aggregate."""
    fc = make_user(db, student_id="FC-RPT", name="FC Report", email="fc.rpt@test.com",
                   role="FacultyCoordinator")
    club = make_club(db, name="Report Club")
    president = make_user(db, student_id="PRES-RPT", name="Pres Report",
                          email="pres.rpt@test.com", role="ClubPresident", club_id=club.id)
    head = make_user(db, student_id="HEAD-RPT", name="Head Report",
                     email="head.rpt@test.com", role="ClubHead", club_id=club.id)
    volunteer = make_user(db, student_id="VOL-RPT", name="Vol Report",
                          email="vol.rpt@test.com", role="Volunteer", club_id=club.id)
    student = make_user(db, student_id="STU-RPT", name="Stu Report",
                        email="stu.rpt@test.com", role="Student")
    return fc, club, president, head, volunteer, student


def _create_event(db, club, venue=None):
    from app import models
    event = models.Event(
        club_id=club.id, name="Report Test Event",
        event_date=datetime.date.today(), published=True,
        venue_id=venue.id if venue else None,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# ── generate report ───────────────────────────────────────────────

def test_generate_club_summary(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    resp = client.post("/reports", json={"report_type": "club_summary"}, headers=auth_headers(fc))
    assert resp.status_code == 201
    body = resp.json()
    assert body["report_type"] == "club_summary"
    assert body["title"] == "Club Summary Report"
    assert "data" in body
    assert body["data"]["total_clubs"] >= 1
    assert any(c["club_name"] == "Report Club" for c in body["data"]["clubs"])


def test_generate_event_summary(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    _create_event(db_session, club)
    resp = client.post("/reports", json={"report_type": "event_summary"}, headers=auth_headers(fc))
    assert resp.status_code == 201
    body = resp.json()
    assert body["data"]["total_events"] >= 1


def test_generate_volunteer_summary(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    resp = client.post("/reports", json={"report_type": "volunteer_summary"}, headers=auth_headers(fc))
    assert resp.status_code == 201
    body = resp.json()
    assert "volunteers" in body["data"]
    assert "total_volunteers" in body["data"]


def test_generate_finance_summary(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    resp = client.post("/reports", json={"report_type": "finance_summary"}, headers=auth_headers(fc))
    assert resp.status_code == 201
    body = resp.json()
    assert "master_pool_total" in body["data"]
    assert "clubs" in body["data"]


def test_generate_comprehensive_report(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    resp = client.post("/reports", json={"report_type": "comprehensive"}, headers=auth_headers(fc))
    assert resp.status_code == 201
    body = resp.json()
    assert body["report_type"] == "comprehensive"
    data = body["data"]
    assert "club_summary" in data
    assert "event_summary" in data
    assert "volunteer_summary" in data
    assert "finance_summary" in data


def test_generate_report_with_date_range(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    resp = client.post("/reports", json={
        "report_type": "club_summary",
        "date_from": "2025-01-01",
        "date_to": "2026-12-31",
    }, headers=auth_headers(fc))
    assert resp.status_code == 201
    body = resp.json()
    assert body["date_from"] == "2025-01-01"
    assert body["date_to"] == "2026-12-31"
    assert "to" in body["title"]  # title includes date range


def test_generate_report_invalid_type_returns_422(client, db_session):
    fc, *_ = _setup_data(db_session)
    resp = client.post("/reports", json={"report_type": "nonexistent"}, headers=auth_headers(fc))
    assert resp.status_code == 422


def test_generate_report_requires_faculty_role(client, db_session):
    _, club, president, *_ = _setup_data(db_session)
    resp = client.post("/reports", json={"report_type": "club_summary"}, headers=auth_headers(president))
    assert resp.status_code == 403


def test_generate_report_requires_auth(client, db_session):
    resp = client.post("/reports", json={"report_type": "club_summary"})
    assert resp.status_code in (401, 403)


# ── list reports ──────────────────────────────────────────────────

def test_list_reports_returns_generated(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    client.post("/reports", json={"report_type": "club_summary"}, headers=auth_headers(fc))
    client.post("/reports", json={"report_type": "event_summary"}, headers=auth_headers(fc))
    resp = client.get("/reports", headers=auth_headers(fc))
    assert resp.status_code == 200
    reports = resp.json()
    assert len(reports) == 2
    # most recent first
    assert reports[0]["report_type"] == "event_summary"


def test_list_reports_filter_by_type(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    client.post("/reports", json={"report_type": "club_summary"}, headers=auth_headers(fc))
    client.post("/reports", json={"report_type": "event_summary"}, headers=auth_headers(fc))
    resp = client.get("/reports?report_type=club_summary", headers=auth_headers(fc))
    assert resp.status_code == 200
    reports = resp.json()
    assert len(reports) == 1
    assert reports[0]["report_type"] == "club_summary"


def test_list_reports_requires_faculty_role(client, db_session):
    _, club, president, *_ = _setup_data(db_session)
    resp = client.get("/reports", headers=auth_headers(president))
    assert resp.status_code == 403


# ── get single report ─────────────────────────────────────────────

def test_get_report_by_id(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    create_resp = client.post("/reports", json={"report_type": "finance_summary"}, headers=auth_headers(fc))
    report_id = create_resp.json()["id"]
    resp = client.get(f"/reports/{report_id}", headers=auth_headers(fc))
    assert resp.status_code == 200
    assert resp.json()["id"] == report_id
    assert resp.json()["report_type"] == "finance_summary"


def test_get_report_unknown_returns_404(client, db_session):
    fc, *_ = _setup_data(db_session)
    resp = client.get("/reports/99999", headers=auth_headers(fc))
    assert resp.status_code == 404


# ── download report ───────────────────────────────────────────────

def test_download_report_returns_csv(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    create_resp = client.post("/reports", json={"report_type": "club_summary"}, headers=auth_headers(fc))
    report_id = create_resp.json()["id"]
    resp = client.get(f"/reports/{report_id}/download", headers=auth_headers(fc))
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    content = resp.content.decode("utf-8")
    assert "club_name" in content  # CSV header row present
    assert "Report Club" in content


def test_download_comprehensive_report_csv(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    create_resp = client.post("/reports", json={"report_type": "comprehensive"}, headers=auth_headers(fc))
    report_id = create_resp.json()["id"]
    resp = client.get(f"/reports/{report_id}/download", headers=auth_headers(fc))
    assert resp.status_code == 200
    content = resp.content.decode("utf-8")
    assert "Club Summary Report" in content  # section header in CSV


def test_download_unknown_report_returns_404(client, db_session):
    fc, *_ = _setup_data(db_session)
    resp = client.get("/reports/99999/download", headers=auth_headers(fc))
    assert resp.status_code == 404


def test_download_report_requires_faculty_role(client, db_session):
    _, club, president, *_ = _setup_data(db_session)
    resp = client.get("/reports/1/download", headers=auth_headers(president))
    assert resp.status_code == 403


# ── persistence / historical ──────────────────────────────────────

def test_reports_persisted_and_listed(client, db_session):
    fc, club, *_ = _setup_data(db_session)
    # Generate two reports
    client.post("/reports", json={"report_type": "club_summary"}, headers=auth_headers(fc))
    client.post("/reports", json={"report_type": "finance_summary"}, headers=auth_headers(fc))

    # Both appear in list
    resp = client.get("/reports", headers=auth_headers(fc))
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    # Each can be retrieved individually
    for r in resp.json():
        detail = client.get(f"/reports/{r['id']}", headers=auth_headers(fc))
        assert detail.status_code == 200
        assert detail.json()["data"] is not None
