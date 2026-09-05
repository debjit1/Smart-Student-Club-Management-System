"""Tests for the proposal revision flow: send-for-revision, PATCH editing,
and re-submission from Needs Revision."""
from app.models import ROLE_CLUB_HEAD, ROLE_CLUB_PRESIDENT, ROLE_FACULTY_COORDINATOR
from tests.conftest import auth_headers, make_club, make_user


def _setup(client, db_session, club_name="Dance Club"):
    club = make_club(db_session, name=club_name)
    make_user(
        db_session,
        student_id=f"CH-{club_name}",
        name="Head",
        email=f"head-{club.id}@iit.ac.in",
        password="pass123",
        role=ROLE_CLUB_HEAD,
        club_id=club.id,
    )
    make_user(
        db_session,
        student_id=f"PR-{club_name}",
        name="President",
        email=f"pres-{club.id}@iit.ac.in",
        password="pass123",
        role=ROLE_CLUB_PRESIDENT,
        club_id=club.id,
    )
    make_user(
        db_session,
        student_id=f"FC-{club_name}",
        name="Faculty",
        email=f"fac-{club.id}@iit.ac.in",
        password="pass123",
        role=ROLE_FACULTY_COORDINATOR,
    )
    return club


def _draft_proposal(client, club):
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        "/proposals",
        json={"club_id": club.id, "event_name": "Fest", "schedule_date": "2026-08-10"},
        headers=head_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"], head_headers


def _submit_proposal(client, proposal_id, head_headers):
    resp = client.post(f"/proposals/{proposal_id}/submit", headers=head_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Pending President Review"


def _needs_revision_via_president(client, club):
    """Draft -> Submitted -> sent back for revision by the President."""
    proposal_id, head_headers = _draft_proposal(client, club)
    _submit_proposal(client, proposal_id, head_headers)
    pres_headers = auth_headers(client, f"pres-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/proposals/{proposal_id}/send-for-revision",
        json={"reason": "Add more detail"},
        headers=pres_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Needs Revision"
    return proposal_id, head_headers


# ── POST /proposals/{proposal_id}/send-for-revision ───────────────
def test_send_for_revision_by_president(client, db_session):
    club = _setup(client, db_session)
    proposal_id, _ = _needs_revision_via_president(client, club)

    detail = client.get(f"/proposals/{proposal_id}").json()
    assert detail["status"] == "Needs Revision"
    assert detail["rejection_reason"] == "Add more detail"


def test_send_for_revision_by_faculty(client, db_session):
    club = _setup(client, db_session)
    proposal_id, head_headers = _draft_proposal(client, club)
    _submit_proposal(client, proposal_id, head_headers)

    pres_headers = auth_headers(client, f"pres-{club.id}@iit.ac.in", "pass123")
    client.post(f"/proposals/{proposal_id}/president-review", json={"approve": True}, headers=pres_headers)

    fac_headers = auth_headers(client, f"fac-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/proposals/{proposal_id}/send-for-revision",
        json={"reason": "Venue conflict"},
        headers=fac_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Needs Revision"
    assert resp.json()["rejection_reason"] == "Venue conflict"


def test_send_for_revision_wrong_status_returns_409(client, db_session):
    club = _setup(client, db_session)
    proposal_id, _ = _draft_proposal(client, club)
    pres_headers = auth_headers(client, f"pres-{club.id}@iit.ac.in", "pass123")

    # Proposal is still Draft -- nothing to revise yet.
    resp = client.post(
        f"/proposals/{proposal_id}/send-for-revision",
        json={"reason": "nope"},
        headers=pres_headers,
    )
    assert resp.status_code == 409


def test_send_for_revision_wrong_role_returns_403(client, db_session):
    club_a = _setup(client, db_session, "Club A")
    club_b = _setup(client, db_session, "Club B")
    proposal_id, _ = _draft_proposal(client, club_a)
    _submit_proposal(client, proposal_id, auth_headers(client, f"head-{club_a.id}@iit.ac.in", "pass123"))

    # President of the wrong club tries to send club A's proposal for revision.
    pres_b_headers = auth_headers(client, f"pres-{club_b.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/proposals/{proposal_id}/send-for-revision",
        json={"reason": "not mine"},
        headers=pres_b_headers,
    )
    assert resp.status_code == 403


def test_send_for_revision_not_found_returns_404(client, db_session):
    club = _setup(client, db_session)
    pres_headers = auth_headers(client, f"pres-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        "/proposals/999/send-for-revision", json={"reason": "x"}, headers=pres_headers
    )
    assert resp.status_code == 404


# ── PATCH /proposals/{proposal_id} ────────────────────────────────
def test_patch_proposal_in_draft_by_owning_club_head(client, db_session):
    club = _setup(client, db_session)
    proposal_id, head_headers = _draft_proposal(client, club)

    resp = client.patch(
        f"/proposals/{proposal_id}",
        json={"event_name": "Fest 2.0", "description": "Bigger and better"},
        headers=head_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["event_name"] == "Fest 2.0"
    assert data["description"] == "Bigger and better"
    assert data["status"] == "Draft"


def test_patch_proposal_from_needs_revision_resets_to_draft(client, db_session):
    club = _setup(client, db_session)
    proposal_id, head_headers = _needs_revision_via_president(client, club)

    resp = client.patch(
        f"/proposals/{proposal_id}", json={"event_name": "Fest Revised"}, headers=head_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Draft"
    assert resp.json()["event_name"] == "Fest Revised"


def test_patch_proposal_wrong_club_head_returns_403(client, db_session):
    club_a = _setup(client, db_session, "Club A")
    club_b = _setup(client, db_session, "Club B")
    proposal_id, _ = _draft_proposal(client, club_a)

    head_b_headers = auth_headers(client, f"head-{club_b.id}@iit.ac.in", "pass123")
    resp = client.patch(
        f"/proposals/{proposal_id}", json={"event_name": "Stolen"}, headers=head_b_headers
    )
    assert resp.status_code == 403


def test_patch_proposal_not_found_returns_404(client, db_session):
    club = _setup(client, db_session)
    head_headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.patch("/proposals/999", json={"event_name": "Ghost"}, headers=head_headers)
    assert resp.status_code == 404


def test_patch_proposal_wrong_status_returns_409(client, db_session):
    club = _setup(client, db_session)
    proposal_id, head_headers = _draft_proposal(client, club)
    _submit_proposal(client, proposal_id, head_headers)

    # Pending President Review is not editable.
    resp = client.patch(
        f"/proposals/{proposal_id}", json={"event_name": "Too late"}, headers=head_headers
    )
    assert resp.status_code == 409


# ── Submit from Needs Revision ────────────────────────────────────
def test_submit_from_needs_revision(client, db_session):
    club = _setup(client, db_session)
    proposal_id, head_headers = _needs_revision_via_president(client, club)

    # Fix the proposal, then re-submit -- straight back to President Review.
    client.patch(f"/proposals/{proposal_id}", json={"event_name": "Fest Fixed"}, headers=head_headers)
    resp = client.post(f"/proposals/{proposal_id}/submit", headers=head_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Pending President Review"
    assert resp.json()["event_name"] == "Fest Fixed"
