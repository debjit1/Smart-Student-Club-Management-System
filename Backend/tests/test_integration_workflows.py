import pytest
from decimal import Decimal
from tests.conftest import make_user, make_club, make_venue, auth_headers, today_str
from app import models

"""
===============================================================================
SSCMS END-TO-END INTEGRATION TEST SUITE (Milestone 4 - Sprint 2)
===============================================================================
This module contains comprehensive multi-component integration tests verifying 
cross-epic workflows, role permissions, state transitions, and backend services.
"""

def test_e2e_full_event_lifecycle_to_certificate_issuance(client, db_session):
    """
    INTEGRATION TEST 1: Full Event Approval, Volunteer Task Verification, 
    QR Check-in & Automatic Certificate Issuance Pipeline.
    """
    # 1. Setup Roles & Users
    faculty = make_user(db_session, student_id="FAC001", name="Dr. Faculty", email="fac@iitm.in", role=models.ROLE_FACULTY_COORDINATOR)
    club = make_club(db_session, name="Dance Club", status="Approved")
    president = make_user(db_session, student_id="PRES01", name="Club Pres", email="pres@iitm.in", role=models.ROLE_CLUB_PRESIDENT, club_id=club.id)
    club_head = make_user(db_session, student_id="CH001", name="Dance Head", email="dancehead@iitm.in", role=models.ROLE_CLUB_HEAD, club_id=club.id)
    volunteer = make_user(db_session, student_id="VOL001", name="Vol Student", email="vol@iitm.in", role=models.ROLE_VOLUNTEER, club_id=club.id)
    attendee = make_user(db_session, student_id="STU001", name="Attendee Student", email="stu@iitm.in", role=models.ROLE_STUDENT)

    venue = make_venue(db_session, name="Main Auditorium", capacity=300)

    # Auth headers for each role
    fac_headers = auth_headers(faculty)
    pres_headers = auth_headers(president)
    ch_headers = auth_headers(club_head)
    vol_headers = auth_headers(volunteer)
    att_headers = auth_headers(attendee)

    # 2. Club Head creates Event Proposal
    proposal_resp = client.post("/proposals", json={
        "club_id": club.id,
        "event_name": "Annual Dance Fest 2026",
        "description": "Grand cultural dance performance",
        "schedule_date": today_str(5),
        "venue_id": venue.id,
        "budget_estimate": 5000.0,
        "expected_attendees": 200
    }, headers=ch_headers)
    assert proposal_resp.status_code == 201
    proposal_id = proposal_resp.json()["id"]

    # Submit Proposal
    client.post(f"/proposals/{proposal_id}/submit", headers=ch_headers)

    # President approves proposal
    pres_review = client.post(f"/proposals/{proposal_id}/president-review", json={"approve": True, "reason": "Looks good"}, headers=pres_headers)
    assert pres_review.status_code == 200
    assert pres_review.json()["status"] == "Pending Faculty Approval"

    # Faculty approves proposal -> triggers Event & Booking creation
    fac_review = client.post(f"/proposals/{proposal_id}/faculty-review", json={"approve": True, "reason": "Approved budget & venue"}, headers=fac_headers)
    assert fac_review.status_code == 200
    assert fac_review.json()["status"] == "Approved"
    
    events = client.get("/events", params={"club_id": club.id}, headers=ch_headers).json()
    assert len(events) == 1
    event_id = events[0]["id"]

    # 3. Club Head creates Task and assigns to Volunteer
    task_resp = client.post(f"/events/{event_id}/tasks", json={
        "title": "Attendance Management",
        "description": "Scan QR codes at entrance",
        "type": "Attendance",
        "assigned_to": volunteer.id,
        "priority": "High"
    }, headers=ch_headers)
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    # Volunteer accepts task & submits proof
    accept_resp = client.post(f"/tasks/{task_id}/accept", headers=vol_headers)
    assert accept_resp.status_code == 200
    assert accept_resp.json()["status"] == "Accepted"

    proof_resp = client.post(f"/tasks/{task_id}/submit-proof", json={"proof_text": "Completed scanning all entries"}, headers=vol_headers)
    assert proof_resp.status_code == 200
    assert proof_resp.json()["status"] == "Submitted"

    # Club Head verifies task
    verify_resp = client.post(f"/tasks/{task_id}/review", json={"verified": True, "comment": "Great job"}, headers=ch_headers)
    assert verify_resp.status_code == 200
    assert verify_resp.json()["status"] == "Verified"

    # 4. Attendee Student registers for event
    reg_resp = client.post(f"/events/{event_id}/registrations", headers=att_headers)
    assert reg_resp.status_code == 201
    qr_token = reg_resp.json()["qr_token"]

    # Volunteer checks in Attendee using QR Token
    checkin_resp = client.post(f"/registrations/{qr_token}/check-in", headers=vol_headers)
    assert checkin_resp.status_code == 200
    assert checkin_resp.json()["status"] == "Checked-In"

    # Check live attendance stats
    stats_resp = client.get(f"/events/{event_id}/attendance-stats", headers=ch_headers)
    assert stats_resp.status_code == 200
    assert stats_resp.json()["checked_in"] == 1

    # 5. Faculty Finalizes Event -> Auto Certificate Issuance
    finalize_resp = client.post(f"/events/{event_id}/finalize", headers=fac_headers)
    assert finalize_resp.status_code == 200
    issued_certs = finalize_resp.json()["certificates_issued"]
    assert len(issued_certs) == 2  # 1 Attendee + 1 Verified Volunteer

    # Verify Attendee received Certificate
    att_certs = client.get("/certificates", headers=att_headers).json()
    assert len(att_certs) == 1
    assert att_certs[0]["reason"] == "Attendee"
    assert att_certs[0]["event_id"] == event_id

    # Verify Volunteer received Certificate
    vol_certs = client.get("/certificates", headers=vol_headers).json()
    assert len(vol_certs) == 1
    assert vol_certs[0]["reason"] == "Volunteer"
    assert vol_certs[0]["event_id"] == event_id


def test_e2e_venue_booking_conflict_prevention_and_release_flow(client, db_session):
    """
    INTEGRATION TEST 2: Multi-Proposal Venue Conflict Detection & Booking Slot Release.
    """
    faculty = make_user(db_session, student_id="FAC002", name="Dr. Faculty", email="fac2@iitm.in", role=models.ROLE_FACULTY_COORDINATOR)
    club1 = make_club(db_session, name="Music Club", status="Approved")
    club2 = make_club(db_session, name="Robotix Club", status="Approved")
    pres1 = make_user(db_session, student_id="PRES02", name="Music Pres", email="pres2@iitm.in", role=models.ROLE_CLUB_PRESIDENT, club_id=club1.id)
    pres2 = make_user(db_session, student_id="PRES03", name="Robo Pres", email="pres3@iitm.in", role=models.ROLE_CLUB_PRESIDENT, club_id=club2.id)
    ch1 = make_user(db_session, student_id="CH002", name="Music Head", email="music@iitm.in", role=models.ROLE_CLUB_HEAD, club_id=club1.id)
    ch2 = make_user(db_session, student_id="CH003", name="Robotix Head", email="robotix@iitm.in", role=models.ROLE_CLUB_HEAD, club_id=club2.id)

    venue = make_venue(db_session, name="Open Air Theatre", capacity=1000)
    target_date = today_str(10)

    fac_headers = auth_headers(faculty)
    pres1_headers = auth_headers(pres1)
    pres2_headers = auth_headers(pres2)
    ch1_headers = auth_headers(ch1)
    ch2_headers = auth_headers(ch2)

    # Proposal 1
    p1 = client.post("/proposals", json={"club_id": club1.id, "event_name": "Music Concert", "description": "Live Show", "schedule_date": target_date, "venue_id": venue.id}, headers=ch1_headers).json()["id"]
    client.post(f"/proposals/{p1}/submit", headers=ch1_headers)
    client.post(f"/proposals/{p1}/president-review", json={"approve": True}, headers=pres1_headers)
    
    # Proposal 2
    p2 = client.post("/proposals", json={"club_id": club2.id, "event_name": "Robo Expo", "description": "Tech Showcase", "schedule_date": target_date, "venue_id": venue.id}, headers=ch2_headers).json()["id"]
    client.post(f"/proposals/{p2}/submit", headers=ch2_headers)
    client.post(f"/proposals/{p2}/president-review", json={"approve": True}, headers=pres2_headers)

    # Faculty approves P1 -> Success
    res1 = client.post(f"/proposals/{p1}/faculty-review", json={"approve": True}, headers=fac_headers)
    assert res1.status_code == 200

    # Faculty tries to approve P2 -> Rejection due to venue conflict
    res2 = client.post(f"/proposals/{p2}/faculty-review", json={"approve": True}, headers=fac_headers)
    assert res2.status_code == 409
    assert "already booked" in res2.json()["detail"]

    # Release booking from Event 1
    events1 = client.get("/events", params={"club_id": club1.id}, headers=ch1_headers).json()
    e1_id = events1[0]["id"]

    bookings = client.get(f"/bookings?venue_id={venue.id}", headers=fac_headers).json()
    b1 = [b for b in bookings if b["event_id"] == e1_id and b["status"] == "Confirmed"][0]
    
    release_res = client.post(f"/bookings/{b1['id']}/release", headers=fac_headers)
    assert release_res.status_code == 200
    assert release_res.json()["status"] == "Released"

    # Now Faculty approves P2 -> Success
    res2_retry = client.post(f"/proposals/{p2}/faculty-review", json={"approve": True}, headers=fac_headers)
    assert res2_retry.status_code == 200
    assert res2_retry.json()["status"] == "Approved"


def test_e2e_volunteer_recruitment_and_role_revocation_lifecycle(client, db_session):
    """
    INTEGRATION TEST 3: Domain Creation, Student Volunteer Application, Selection,
    and Role Revocation Governance Workflow.
    """
    faculty = make_user(db_session, student_id="FAC003", name="Dr. Faculty", email="fac3@iitm.in", role=models.ROLE_FACULTY_COORDINATOR)
    club = make_club(db_session, name="Coding Club", status="Approved")
    ch = make_user(db_session, student_id="CH004", name="Coder Head", email="coder@iitm.in", role=models.ROLE_CLUB_HEAD, club_id=club.id)
    student = make_user(db_session, student_id="STU002", name="Dev Student", email="dev@iitm.in", role=models.ROLE_STUDENT)

    ch_headers = auth_headers(ch)
    stu_headers = auth_headers(student)

    # 1. Create Domain
    domain_resp = client.post(f"/clubs/{club.id}/domains", json={"title": "Web Development", "recruitment_open": True}, headers=ch_headers)
    assert domain_resp.status_code == 201
    domain_id = domain_resp.json()["id"]

    # 2. Student applies
    app_resp = client.post(f"/clubs/{club.id}/volunteer-applications", json={"domain_id": domain_id, "note": "Experienced in React and FastAPI"}, headers=stu_headers)
    assert app_resp.status_code == 201
    app_id = app_resp.json()["id"]
    assert app_resp.json()["status"] == "Pending"

    # 3. Club Head approves
    review_resp = client.post(f"/clubs/{club.id}/volunteer-applications/{app_id}/review", json={"approve": True}, headers=ch_headers)
    assert review_resp.status_code == 200
    assert review_resp.json()["status"] == "Selected"

    # Verify user now has Volunteer role
    me_resp = client.get("/auth/me", headers=stu_headers)
    assert me_resp.status_code == 200
    roles = [r["role"] for r in me_resp.json()["roles"]]
    assert models.ROLE_VOLUNTEER in roles

    # 4. Club Head revokes application
    revoke_resp = client.post(f"/clubs/{club.id}/volunteer-applications/{app_id}/revoke", headers=ch_headers)
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "Revoked"

    # Verify Volunteer role is removed
    me_resp_after = client.get("/auth/me", headers=stu_headers)
    roles_after = [r["role"] for r in me_resp_after.json()["roles"]]
    assert models.ROLE_VOLUNTEER not in roles_after


def test_e2e_finance_budget_expense_approval_and_reporting_pipeline(client, db_session):
    """
    INTEGRATION TEST 4: Finance Master Pool Management, Club Allocation, 
    Event Budget Expense Pipeline & Comprehensive Analytics Reporting.
    """
    faculty = make_user(db_session, student_id="FAC004", name="Dr. Faculty", email="fac4@iitm.in", role=models.ROLE_FACULTY_COORDINATOR)
    club = make_club(db_session, name="Green Club", status="Approved")
    president = make_user(db_session, student_id="PRES04", name="Club Pres", email="pres4@iitm.in", role=models.ROLE_CLUB_PRESIDENT, club_id=club.id)
    ch = make_user(db_session, student_id="CH005", name="Green Head", email="green@iitm.in", role=models.ROLE_CLUB_HEAD, club_id=club.id)

    fac_headers = auth_headers(faculty)
    pres_headers = auth_headers(president)
    ch_headers = auth_headers(ch)

    # 1. Update Master Pool & Allocate to Club
    client.patch("/faculty-budget-pool", json={"total": 100000.0}, headers=fac_headers)
    alloc_resp = client.post("/finance/transactions", json={
        "club_id": club.id,
        "type": "Allocation",
        "amount": 25000.0,
        "description": "Annual Green Initiative Grant"
    }, headers=fac_headers)
    assert alloc_resp.status_code == 201

    # 2. President creates Event Budget & Expense
    eb_resp = client.post(f"/clubs/{club.id}/event-budgets", json={"event_name": "Tree Plantation Drive", "allotted": 5000.0}, headers=pres_headers)
    assert eb_resp.status_code == 201
    eb_id = eb_resp.json()["id"]

    exp_resp = client.post(f"/event-budgets/{eb_id}/expenses", json={
        "item_name": "Saplings and Gardening Tools",
        "type": "Self-Procured Expense",
        "category": "Procurement",
        "approved_amount": 3500.0
    }, headers=pres_headers)
    assert exp_resp.status_code == 201
    exp_id = exp_resp.json()["id"]

    # Upload bill
    bill_resp = client.post(f"/expenses/{exp_id}/upload-bill", data={"bill_amount": 3200.0}, files={"file": ("bill.jpg", b"fake bill content", "image/jpeg")}, headers=ch_headers)
    assert bill_resp.status_code == 200
    assert float(bill_resp.json()["bill_amount"]) == 3200.0

    # Send for processing
    client.post(f"/event-budgets/{eb_id}/send-for-processing", headers=ch_headers)

    # President approve
    client.post(f"/expenses/{exp_id}/president-review", json={"approve": True}, headers=pres_headers)

    # Faculty approve -> deducts spend
    fac_exp_rev = client.post(f"/expenses/{exp_id}/faculty-review", json={"approve": True}, headers=fac_headers)
    assert fac_exp_rev.status_code == 200
    assert fac_exp_rev.json()["status"] == "Approved"

    # Check Club Finance ledger
    fin_summary = client.get(f"/clubs/{club.id}/finance", headers=ch_headers).json()
    assert float(fin_summary["allotted"]) == 25000.0
    assert float(fin_summary["spent"]) == 3500.0
    assert float(fin_summary["remaining"]) == 21500.0

    # 3. Faculty generates Comprehensive Analytics Report
    report_resp = client.post("/reports", json={"report_type": "comprehensive"}, headers=fac_headers)
    assert report_resp.status_code == 201
    report_id = report_resp.json()["id"]

    # Download CSV Report
    csv_resp = client.get(f"/reports/{report_id}/download", headers=fac_headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    csv_content = csv_resp.text
    assert "Club Summary Report" in csv_content
    assert "Finance Summary Report" in csv_content
    assert "Green Club" in csv_content



def test_e2e_cross_club_role_isolation_security(client, db_session):
    """
    INTEGRATION TEST 5: Strict Role Scoping & Cross-Club Security Isolation.
    """
    faculty = make_user(db_session, student_id="FAC005", name="Dr. Faculty", email="fac5@iitm.in", role=models.ROLE_FACULTY_COORDINATOR)
    club_a = make_club(db_session, name="Club Alpha", status="Approved")
    club_b = make_club(db_session, name="Club Beta", status="Approved")

    ch_a = make_user(db_session, student_id="CHA", name="Head Alpha", email="alpha@iitm.in", role=models.ROLE_CLUB_HEAD, club_id=club_a.id)
    ch_b = make_user(db_session, student_id="CHB", name="Head Beta", email="beta@iitm.in", role=models.ROLE_CLUB_HEAD, club_id=club_b.id)

    headers_a = auth_headers(ch_a)
    headers_b = auth_headers(ch_b)

    # CH A creates proposal for Club A
    p_a = client.post("/proposals", json={"club_id": club_a.id, "event_name": "Alpha Event", "description": "Test", "schedule_date": today_str(2)}, headers=headers_a).json()["id"]

    # CH B attempts to update or submit CH A's proposal -> 403 Forbidden
    edit_resp = client.patch(f"/proposals/{p_a}", json={"event_name": "Hacked Title"}, headers=headers_b)
    assert edit_resp.status_code == 403

    sub_resp = client.post(f"/proposals/{p_a}/submit", headers=headers_b)
    assert sub_resp.status_code == 403
