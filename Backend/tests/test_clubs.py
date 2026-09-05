"""Tests for club management, membership approval, domains and volunteer
applications (Epic 1.2)."""
from app.models import ROLE_CLUB_HEAD, ROLE_FACULTY_COORDINATOR, ROLE_STUDENT
from tests.conftest import auth_headers, make_club, make_user


def test_create_club_requires_faculty_role(client, db_session):
    make_user(db_session, student_id="ST1", name="Student", email="s1@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    headers = auth_headers(client, "s1@iit.ac.in", "pass123")
    resp = client.post("/clubs", json={"name": "New Club"}, headers=headers)
    assert resp.status_code == 403


def test_create_club_as_faculty_succeeds(client, db_session):
    make_user(db_session, student_id="F1", name="Faculty", email="f1@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "f1@iit.ac.in", "pass123")
    resp = client.post("/clubs", json={"name": "New Club", "category": "Technical"}, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["club"]["status"] == "Approved"
    assert body["club_head"]["email"] == "newclub@iitm.in"
    assert body["club_head"]["password"] == "newclub123"

    # the Club Head login must actually work
    login = client.post("/auth/login", json={"email": "newclub@iitm.in", "password": "newclub123"})
    assert login.status_code == 200
    assert login.json()["user"]["roles"][0]["role"] == ROLE_CLUB_HEAD


def test_create_club_with_custom_club_head_credentials(client, db_session):
    make_user(db_session, student_id="F3", name="Faculty", email="f3@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "f3@iit.ac.in", "pass123")
    resp = client.post(
        "/clubs",
        json={
            "name": "Chess Club",
            "category": "Miscellaneous",
            "club_head_email": "chesshead@iitm.in",
            "club_head_password": "custompass1",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["club_head"]["email"] == "chesshead@iitm.in"
    assert body["club_head"]["password"] == "custompass1"

    login = client.post("/auth/login", json={"email": "chesshead@iitm.in", "password": "custompass1"})
    assert login.status_code == 200
    assert login.json()["user"]["roles"][0]["role"] == ROLE_CLUB_HEAD


def test_create_club_with_duplicate_custom_email_returns_409(client, db_session):
    make_user(db_session, student_id="F4", name="Faculty", email="f4@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "f4@iit.ac.in", "pass123")
    client.post(
        "/clubs",
        json={"name": "Debate Club", "club_head_email": "shared@iitm.in", "club_head_password": "pass1234"},
        headers=headers,
    )
    resp = client.post(
        "/clubs",
        json={"name": "Quiz Club", "club_head_email": "shared@iitm.in", "club_head_password": "pass1234"},
        headers=headers,
    )
    assert resp.status_code == 409


def test_create_club_duplicate_name_returns_409(client, db_session):
    make_user(db_session, student_id="F2", name="Faculty", email="f2@iit.ac.in", password="pass123", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "f2@iit.ac.in", "pass123")
    client.post("/clubs", json={"name": "Robotix Club"}, headers=headers)
    resp = client.post("/clubs", json={"name": "Robotix Club"}, headers=headers)
    assert resp.status_code == 409


def test_list_clubs_is_public(client, db_session):
    make_club(db_session, name="Music Club")
    resp = client.get("/clubs")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_get_unknown_club_returns_404(client):
    resp = client.get("/clubs/999")
    assert resp.status_code == 404


def test_apply_for_membership_then_duplicate_conflicts(client, db_session):
    club = make_club(db_session)
    make_user(db_session, student_id="ST2", name="Applicant", email="applicant@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    headers = auth_headers(client, "applicant@iit.ac.in", "pass123")

    first = client.post(f"/clubs/{club.id}/members/apply", headers=headers)
    assert first.status_code == 201
    assert first.json()["status"] == "Pending"

    second = client.post(f"/clubs/{club.id}/members/apply", headers=headers)
    assert second.status_code == 409


def test_club_head_can_approve_membership(client, db_session):
    club = make_club(db_session)
    make_user(db_session, student_id="ST3", name="Applicant", email="applicant2@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    make_user(db_session, student_id="CH1", name="Head", email="head@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)

    applicant_headers = auth_headers(client, "applicant2@iit.ac.in", "pass123")
    apply_resp = client.post(f"/clubs/{club.id}/members/apply", headers=applicant_headers)
    member_id = apply_resp.json()["id"]

    head_headers = auth_headers(client, "head@iit.ac.in", "pass123")
    review_resp = client.post(
        f"/clubs/{club.id}/members/{member_id}/review", json={"approve": True}, headers=head_headers
    )
    assert review_resp.status_code == 200
    assert review_resp.json()["status"] == "Active"
    assert review_resp.json()["joined_on"] is not None


def test_other_club_head_cannot_approve_membership(client, db_session):
    club_a = make_club(db_session, name="Club A")
    club_b = make_club(db_session, name="Club B")
    make_user(db_session, student_id="ST4", name="Applicant", email="applicant3@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    make_user(db_session, student_id="CH2", name="Other Head", email="otherhead@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club_b.id)

    applicant_headers = auth_headers(client, "applicant3@iit.ac.in", "pass123")
    apply_resp = client.post(f"/clubs/{club_a.id}/members/apply", headers=applicant_headers)
    member_id = apply_resp.json()["id"]

    other_head_headers = auth_headers(client, "otherhead@iit.ac.in", "pass123")
    resp = client.post(
        f"/clubs/{club_a.id}/members/{member_id}/review", json={"approve": True}, headers=other_head_headers
    )
    assert resp.status_code == 403


def test_reviewing_already_decided_membership_returns_409(client, db_session):
    club = make_club(db_session)
    make_user(db_session, student_id="ST5", name="Applicant", email="applicant4@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    make_user(db_session, student_id="CH3", name="Head", email="head3@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)

    applicant_headers = auth_headers(client, "applicant4@iit.ac.in", "pass123")
    apply_resp = client.post(f"/clubs/{club.id}/members/apply", headers=applicant_headers)
    member_id = apply_resp.json()["id"]

    head_headers = auth_headers(client, "head3@iit.ac.in", "pass123")
    client.post(f"/clubs/{club.id}/members/{member_id}/review", json={"approve": True}, headers=head_headers)
    second = client.post(f"/clubs/{club.id}/members/{member_id}/review", json={"approve": True}, headers=head_headers)
    assert second.status_code == 409


def test_domain_creation_and_volunteer_application_flow(client, db_session):
    club = make_club(db_session)
    make_user(db_session, student_id="CH4", name="Head", email="head4@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    make_user(db_session, student_id="ST6", name="Volunteer Hopeful", email="vh@iit.ac.in", password="pass123", role=ROLE_STUDENT)

    head_headers = auth_headers(client, "head4@iit.ac.in", "pass123")
    domain_resp = client.post(
        f"/clubs/{club.id}/domains", json={"title": "Design & Media", "recruitment_open": True}, headers=head_headers
    )
    assert domain_resp.status_code == 201
    domain_id = domain_resp.json()["id"]

    applicant_headers = auth_headers(client, "vh@iit.ac.in", "pass123")
    apply_resp = client.post(
        f"/clubs/{club.id}/volunteer-applications",
        json={"domain_id": domain_id, "note": "Ran the school Instagram page."},
        headers=applicant_headers,
    )
    assert apply_resp.status_code == 201
    application_id = apply_resp.json()["id"]

    review_resp = client.post(
        f"/clubs/{club.id}/volunteer-applications/{application_id}/review",
        json={"approve": True},
        headers=head_headers,
    )
    assert review_resp.status_code == 200
    assert review_resp.json()["status"] == "Selected"


def test_delete_domain_removes_it(client, db_session):
    club = make_club(db_session, name="Delete Domain Club")
    make_user(db_session, student_id="CH-DD", name="Head", email="head-dd@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    head_headers = auth_headers(client, "head-dd@iit.ac.in", "pass123")

    domain_id = client.post(
        f"/clubs/{club.id}/domains", json={"title": "Logistics", "recruitment_open": False}, headers=head_headers
    ).json()["id"]

    resp = client.delete(f"/domains/{domain_id}", headers=head_headers)
    assert resp.status_code == 204

    remaining = client.get(f"/clubs/{club.id}/domains").json()
    assert domain_id not in [d["id"] for d in remaining]


def test_delete_domain_with_active_applications_returns_409(client, db_session):
    club = make_club(db_session, name="Delete Domain Club 2")
    make_user(db_session, student_id="CH-DD2", name="Head", email="head-dd2@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    make_user(db_session, student_id="ST-DD2", name="Hopeful", email="hopeful-dd2@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    head_headers = auth_headers(client, "head-dd2@iit.ac.in", "pass123")
    applicant_headers = auth_headers(client, "hopeful-dd2@iit.ac.in", "pass123")

    domain_id = client.post(
        f"/clubs/{club.id}/domains", json={"title": "Logistics", "recruitment_open": True}, headers=head_headers
    ).json()["id"]
    client.post(
        f"/clubs/{club.id}/volunteer-applications", json={"domain_id": domain_id}, headers=applicant_headers
    )

    resp = client.delete(f"/domains/{domain_id}", headers=head_headers)
    assert resp.status_code == 409


def test_revoke_and_reopen_volunteer_application(client, db_session):
    club = make_club(db_session, name="Revoke Club")
    make_user(db_session, student_id="CH-RV", name="Head", email="head-rv@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    applicant = make_user(db_session, student_id="ST-RV", name="Volunteer", email="vol-rv@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    head_headers = auth_headers(client, "head-rv@iit.ac.in", "pass123")

    domain_id = client.post(
        f"/clubs/{club.id}/domains", json={"title": "Media", "recruitment_open": True}, headers=head_headers
    ).json()["id"]
    applicant_headers = auth_headers(client, "vol-rv@iit.ac.in", "pass123")
    application_id = client.post(
        f"/clubs/{club.id}/volunteer-applications", json={"domain_id": domain_id}, headers=applicant_headers
    ).json()["id"]

    # Revoking before selection should be rejected.
    early_revoke = client.post(f"/clubs/{club.id}/volunteer-applications/{application_id}/revoke", headers=head_headers)
    assert early_revoke.status_code == 409

    client.post(f"/clubs/{club.id}/volunteer-applications/{application_id}/review", json={"approve": True}, headers=head_headers)

    # The applicant should now be able to act as a Volunteer.
    me = client.get("/auth/me", headers=applicant_headers).json()
    assert any(r["role"] == "Volunteer" and r["club_id"] == club.id for r in me["roles"])

    revoke_resp = client.post(f"/clubs/{club.id}/volunteer-applications/{application_id}/revoke", headers=head_headers)
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "Revoked"

    # The Volunteer role should be gone after revocation.
    me_after = client.get("/auth/me", headers=applicant_headers).json()
    assert not any(r["role"] == "Volunteer" for r in me_after["roles"])

    reopen_resp = client.post(f"/clubs/{club.id}/volunteer-applications/{application_id}/reopen", headers=head_headers)
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["status"] == "Pending"


def test_volunteer_application_to_closed_domain_returns_404(client, db_session):
    club = make_club(db_session)
    make_user(db_session, student_id="CH5", name="Head", email="head5@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    make_user(db_session, student_id="ST7", name="Hopeful", email="hopeful@iit.ac.in", password="pass123", role=ROLE_STUDENT)

    head_headers = auth_headers(client, "head5@iit.ac.in", "pass123")
    domain_resp = client.post(
        f"/clubs/{club.id}/domains", json={"title": "Finance", "recruitment_open": False}, headers=head_headers
    )
    domain_id = domain_resp.json()["id"]

    applicant_headers = auth_headers(client, "hopeful@iit.ac.in", "pass123")
    resp = client.post(
        f"/clubs/{club.id}/volunteer-applications",
        json={"domain_id": domain_id},
        headers=applicant_headers,
    )
    assert resp.status_code == 404


def test_self_service_memberships_and_applications(client, db_session):
    club = make_club(db_session)
    make_user(db_session, student_id="CH6", name="Head", email="head6@iit.ac.in", password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id)
    make_user(db_session, student_id="ST8", name="Self", email="self@iit.ac.in", password="pass123", role=ROLE_STUDENT)

    student_headers = auth_headers(client, "self@iit.ac.in", "pass123")

    # No memberships/applications yet.
    assert client.get("/me/memberships", headers=student_headers).json() == []
    assert client.get("/me/volunteer-applications", headers=student_headers).json() == []

    client.post(f"/clubs/{club.id}/members/apply", headers=student_headers)
    head_headers = auth_headers(client, "head6@iit.ac.in", "pass123")
    domain_id = client.post(
        f"/clubs/{club.id}/domains", json={"title": "Design", "recruitment_open": True}, headers=head_headers
    ).json()["id"]
    client.post(
        f"/clubs/{club.id}/volunteer-applications", json={"domain_id": domain_id}, headers=student_headers
    )

    memberships = client.get("/me/memberships", headers=student_headers).json()
    assert len(memberships) == 1
    assert memberships[0]["status"] == "Pending"

    applications = client.get("/me/volunteer-applications", headers=student_headers).json()
    assert len(applications) == 1
    assert applications[0]["applicant_name"] == "Self"

    # A different student sees only their own records, not Self's.
    make_user(db_session, student_id="ST9", name="Other", email="other@iit.ac.in", password="pass123", role=ROLE_STUDENT)
    other_headers = auth_headers(client, "other@iit.ac.in", "pass123")
    assert client.get("/me/memberships", headers=other_headers).json() == []


def test_club_president_can_list_members_and_volunteer_applications(client, db_session):
    from app.models import ROLE_CLUB_PRESIDENT

    club = make_club(db_session)
    make_user(db_session, student_id="PRES1", name="President", email="pres1@iit.ac.in", password="pass123", role=ROLE_CLUB_PRESIDENT, club_id=club.id)
    president_headers = auth_headers(client, "pres1@iit.ac.in", "pass123")

    # A President must be able to view (not just a Club Head/Faculty
    # Coordinator) -- this regressed once before: list_volunteer_applications
    # was missing ROLE_CLUB_PRESIDENT while list_club_members had it.
    assert client.get(f"/clubs/{club.id}/members", headers=president_headers).status_code == 200
    assert client.get(f"/clubs/{club.id}/volunteer-applications", headers=president_headers).status_code == 200
