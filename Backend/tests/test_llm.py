"""Tests for the GenAI-assisted features (notification digest + event
proposal assistant). No GEMINI_API_KEY is set in the test environment, so
the endpoints exercise the deterministic heuristic fallback in app/llm.py --
this proves the app degrades gracefully without a live LLM key, which is the
behaviour the rest of the system depends on.
"""
from app.models import ROLE_STUDENT
from tests.conftest import auth_headers, make_user


def _student_headers(client, db_session):
    make_user(
        db_session, student_id="S1", name="Student One", email="student1@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    return auth_headers(client, "student1@iit.ac.in", "pass123")


def _force_heuristic(monkeypatch):
    """Make the Gemini call points deterministically fall back to the heuristic.

    The developer's .env may set a real GEMINI_API_KEY (and outbound network may
    be available), which would otherwise turn these tests into live-network calls.
    Removing the key AND resetting the module's cached client forces the intended
    deterministic fallback path.
    """
    import app.llm as llm
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(llm, "_client", None)
    monkeypatch.setattr(llm, "_client_init_attempted", False)


def test_notification_digest_requires_auth(client, db_session):
    resp = client.post("/llm/notification-digest", json={"notifications": []})
    assert resp.status_code == 401


def test_notification_digest_empty_list_returns_no_new_notifications(client, db_session):
    headers = _student_headers(client, db_session)
    resp = client.post("/llm/notification-digest", json={"notifications": []}, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "heuristic"
    assert body["summary"] == "No new notifications."
    assert body["highlights"] == []


def test_notification_digest_summarizes_without_api_key(client, db_session, monkeypatch):
    _force_heuristic(monkeypatch)
    headers = _student_headers(client, db_session)
    resp = client.post(
        "/llm/notification-digest",
        json={"notifications": [
            {"message": "Your volunteer application was approved", "type": "approval"},
            {"message": "Event proposal rejected: budget too high", "type": "rejection"},
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "heuristic"
    assert "2 new notifications" in body["summary"]
    assert len(body["highlights"]) == 2


# ── Event Proposal Assistant ──────────────────────────────────────

def test_event_proposal_assist_requires_auth(client, db_session):
    resp = client.post("/llm/event-proposal-assist", json={
        "event_name": "Hack Night", "objective": "Hackathon", "expected_participants": 50,
    })
    assert resp.status_code == 401


def test_event_proposal_assist_returns_heuristic(client, db_session, monkeypatch):
    _force_heuristic(monkeypatch)
    headers = _student_headers(client, db_session)
    resp = client.post("/llm/event-proposal-assist", json={
        "event_name": "Annual Tech Fest",
        "objective": "Showcase student innovations and build community",
        "expected_participants": 200,
    }, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "heuristic"
    # event_description is non-empty
    assert len(body["event_description"]) > 30
    # budget_estimate is a positive number
    assert body["budget_estimate"] > 0
    # agenda has items
    assert len(body["agenda"]) >= 4
    assert all("time_slot" in a and "activity" in a for a in body["agenda"])
    # required_inventory has items
    assert len(body["required_inventory"]) >= 3
    assert all("item" in i and "quantity" in i for i in body["required_inventory"])
    # volunteers_required scales with participants
    assert body["volunteers_required"] >= 3
    # risk_assessment is a string
    assert isinstance(body["risk_assessment"], str) and len(body["risk_assessment"]) > 20
    # timeline has phases
    assert len(body["timeline"]) >= 3
    assert all("phase" in t for t in body["timeline"])


def test_event_proposal_assist_budget_scales_with_participants(client, db_session, monkeypatch):
    _force_heuristic(monkeypatch)
    headers = _student_headers(client, db_session)
    small = client.post("/llm/event-proposal-assist", json={
        "event_name": "Small Workshop", "objective": "Learn", "expected_participants": 20,
    }, headers=headers).json()
    large = client.post("/llm/event-proposal-assist", json={
        "event_name": "Large Fest", "objective": "Celebrate", "expected_participants": 500,
    }, headers=headers).json()
    assert large["budget_estimate"] > small["budget_estimate"]


def test_event_proposal_assist_volunteers_scale_with_participants(client, db_session, monkeypatch):
    _force_heuristic(monkeypatch)
    headers = _student_headers(client, db_session)
    small = client.post("/llm/event-proposal-assist", json={
        "event_name": "Workshop", "objective": "Teach", "expected_participants": 10,
    }, headers=headers).json()
    large = client.post("/llm/event-proposal-assist", json={
        "event_name": "Fest", "objective": "Party", "expected_participants": 500,
    }, headers=headers).json()
    assert large["volunteers_required"] > small["volunteers_required"]


def test_event_proposal_assist_missing_required_fields_returns_422(client, db_session):
    headers = _student_headers(client, db_session)
    resp = client.post("/llm/event-proposal-assist", json={
        "event_name": "Test",
        # objective and expected_participants missing
    }, headers=headers)
    assert resp.status_code == 422


def test_event_proposal_assist_empty_event_name_returns_422(client, db_session):
    headers = _student_headers(client, db_session)
    resp = client.post("/llm/event-proposal-assist", json={
        "event_name": "",
        "objective": "Learn",
        "expected_participants": 50,
    }, headers=headers)
    assert resp.status_code == 422
