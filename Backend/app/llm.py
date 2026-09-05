"""Gemini-backed helpers for the notification-digest and event-proposal-assist
features. Both call points degrade to a deterministic fallback (no network
call) when GEMINI_API_KEY isn't set, so the rest of the app keeps working
without a live key.
"""
import json
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

_client = None
_client_init_attempted = False
_executor = ThreadPoolExecutor(max_workers=2)
_CALL_TIMEOUT_SECONDS = 8


def _get_client():
    global _client, _client_init_attempted
    if _client_init_attempted:
        return _client
    _client_init_attempted = True

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        _client = genai.Client(api_key=api_key)
    except Exception:
        _client = None
    return _client


def _call_gemini(client, model: str, prompt: str) -> str:
    response = client.models.generate_content(model=model, contents=prompt)
    return response.text or ""


def _generate_json(prompt: str) -> dict | None:
    """Calls Gemini and parses a JSON object out of the response text.
    Returns None on any failure (missing key, network error, bad JSON, or a
    call that doesn't finish within _CALL_TIMEOUT_SECONDS -- e.g. a sandbox
    with no outbound internet -- so callers always fall back to a heuristic
    instead of hanging the request).
    """
    client = _get_client()
    if client is None:
        return None
    try:
        model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        future = _executor.submit(_call_gemini, client, model, prompt)
        text = future.result(timeout=_CALL_TIMEOUT_SECONDS).strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except FutureTimeoutError:
        return None
    except Exception:
        return None


def assist_event_proposal(
    event_name: str,
    objective: str,
    expected_participants: int,
) -> dict:
    """Generates full proposal content for an event. Returns a dict with keys:
    event_description, agenda, budget_estimate, required_inventory,
    volunteers_required, risk_assessment, timeline. Uses Gemini when available;
    falls back to a heuristic that produces reasonable defaults.
    """
    prompt = (
        "You are an experienced campus event planner assistant helping a "
        "College Club Head draft a complete event proposal.\n\n"
        f"Event Name: {event_name}\n"
        f"Objective: {objective}\n"
        f"Expected Participants: {expected_participants}\n\n"
        "Generate a complete event proposal. Respond with ONLY a JSON object "
        "with these exact keys (no markdown):\n"
        "{\n"
        '  "event_description": "<2-4 sentence professional description of the event>",\n'
        '  "agenda": [{"time_slot": "HH:MM - HH:MM", "activity": "<name>", '
        '"description": "<optional details>"}],\n'
        '  "budget_estimate": <numeric INR amount as a float>,\n'
        '  "required_inventory": [{"item": "<item name>", "quantity": <int>, '
        '"reason": "<why needed>"}],\n'
        '  "volunteers_required": <int>,\n'
        '  "risk_assessment": "<2-3 sentence paragraph covering top risks and mitigations>",\n'
        '  "timeline": [{"phase": "<phase name>", "start_date": "<relative e.g. T-4 weeks>", '
        '"end_date": "<relative e.g. T-2 weeks>", "description": "<what happens>"}]\n'
        "}\n\n"
        "Be specific and practical. The budget should be realistic for a "
        f"campus event with ~{expected_participants} attendees. "
        "Include 4-6 agenda items covering the full event duration. "
        "List 3-8 inventory items the event will realistically need. "
        "Include 3-4 timeline phases (planning through post-event). "
        "Keep the risk assessment concise but actionable."
    )
    result = _generate_json(prompt)
    if result and isinstance(result.get("event_description"), str):
        return {"source": "gemini", **_normalise_proposal(result, expected_participants)}

    return {"source": "heuristic", **_heuristic_proposal(event_name, objective, expected_participants)}


def _normalise_proposal(data: dict, expected_participants: int) -> dict:
    """Ensure every field has the right type even if Gemini returns partial data."""
    proposal = {
        "event_description": str(data.get("event_description", "")),
        "agenda": [],
        "budget_estimate": float(data.get("budget_estimate", 0)),
        "required_inventory": [],
        "volunteers_required": int(data.get("volunteers_required", max(3, expected_participants // 20))),
        "risk_assessment": str(data.get("risk_assessment", "")),
        "timeline": [],
    }
    for item in (data.get("agenda") or [])[:10]:
        if isinstance(item, dict):
            proposal["agenda"].append({
                "time_slot": str(item.get("time_slot", "")),
                "activity": str(item.get("activity", "")),
                "description": item.get("description"),
            })
    for item in (data.get("required_inventory") or [])[:15]:
        if isinstance(item, dict):
            proposal["required_inventory"].append({
                "item": str(item.get("item", "")),
                "quantity": int(item.get("quantity", 1)),
                "reason": item.get("reason"),
            })
    for item in (data.get("timeline") or [])[:8]:
        if isinstance(item, dict):
            proposal["timeline"].append({
                "phase": str(item.get("phase", "")),
                "start_date": item.get("start_date"),
                "end_date": item.get("end_date"),
                "description": item.get("description"),
            })
    return proposal


def _heuristic_proposal(event_name: str, objective: str, expected_participants: int) -> dict:
    """Deterministic fallback when Gemini is unavailable."""
    budget_per_head = 150  # INR
    budget_estimate = round(expected_participants * budget_per_head, 2)

    volunteers_required = max(3, expected_participants // 20)

    agenda = [
        {"time_slot": "09:00 - 09:15", "activity": "Registration & Welcome", "description": "Check-in participants and distribute welcome kits."},
        {"time_slot": "09:15 - 09:30", "activity": "Inauguration", "description": "Opening address by Club Head or Faculty Coordinator."},
        {"time_slot": "09:30 - 11:00", "activity": "Main Session", "description": f"Core activity for {event_name}."},
        {"time_slot": "11:00 - 11:15", "activity": "Break", "description": "Tea/coffee break."},
        {"time_slot": "11:15 - 12:30", "activity": "Interactive Segment", "description": "Workshop, competition, or collaborative activity."},
        {"time_slot": "12:30 - 13:00", "activity": "Closing & Certificates", "description": "Vote of thanks and certificate distribution."},
    ]
    if expected_participants >= 100:
        agenda.insert(3, {"time_slot": "11:00 - 11:15", "activity": "Break", "description": "Tea/coffee break."})

    inventory = [
        {"item": "Sound System (Speakers + Mics)", "quantity": 1, "reason": "Amplification for all speakers and music."},
        {"item": "Projector & Screen", "quantity": 1, "reason": "Presentations and visual content."},
        {"item": "Plastic Chairs", "quantity": max(expected_participants, 20), "reason": "Seating for all participants."},
        {"item": "Extension Power Boards", "quantity": max(4, expected_participants // 25), "reason": "Power for AV and laptop equipment."},
    ]
    if expected_participants >= 50:
        inventory.append({"item": "Portable PA Speaker", "quantity": 2, "reason": "Coverage for overflow / outdoor area."})
    if expected_participants >= 200:
        inventory.append({"item": "Temporary Tent / Canopy", "quantity": 1, "reason": "Weather protection for large outdoor gatherings."})

    risk = (
        f"Primary risks: insufficient seating for {expected_participants} attendees if last-minute "
        "registrations surge (mitigation: reserve 10% buffer seating); power outages disrupting AV "
        "equipment (mitigation: confirm generator backup with venue); low volunteer turnout on the "
        "event day (mitigation: over-recruit by 20% and confirm attendance 48 hours prior)."
    )

    timeline = [
        {"phase": "Planning & Proposal", "start_date": "T-4 weeks", "end_date": "T-3 weeks", "description": "Draft proposal, get club head and president approval, submit to faculty coordinator."},
        {"phase": "Logistics & Booking", "start_date": "T-3 weeks", "end_date": "T-2 weeks", "description": "Confirm venue booking, reserve inventory, finalize budget."},
        {"phase": "Promotion & Volunteer Prep", "start_date": "T-2 weeks", "end_date": "T-1 week", "description": "Promote the event, recruit and assign volunteers, send reminders."},
        {"phase": "Execution & Post-Event", "start_date": "T-1 week", "end_date": "T+1 week", "description": "Event day setup/execution, teardown, bill uploads, finalize event and issue certificates."},
    ]

    return {
        "event_description": (
            f"{event_name} is a campus event organised to {objective}. "
            f"Aimed at approximately {expected_participants} participants, the event "
            "will feature structured sessions, interactive activities, and networking "
            "opportunities. The organising club will coordinate logistics including "
            "venue, audio-visual equipment, and volunteer support."
        ),
        "agenda": agenda,
        "budget_estimate": budget_estimate,
        "required_inventory": inventory,
        "volunteers_required": volunteers_required,
        "risk_assessment": risk,
        "timeline": timeline,
    }


def summarize_notifications(notifications: list[dict]) -> dict:
    """Summarizes a list of notifications (each with at least a `message` and
    `type`) into a short digest. Returns
    {"source": "gemini"|"heuristic", "summary": str, "highlights": [str, ...]}.
    """
    if not notifications:
        return {"source": "heuristic", "summary": "No new notifications.", "highlights": []}

    prompt = (
        "Summarize this student's unread notifications from a club management "
        "app into a short, friendly digest (1-2 sentences) plus up to 3 "
        "highlight bullet points for the most important/urgent items "
        "(e.g. approvals, rejections, deadlines). Notifications (JSON):\n"
        f"{json.dumps(notifications)}\n\n"
        'Respond with ONLY a JSON object: {"summary": "<1-2 sentences>", '
        '"highlights": ["<bullet>", ...]}.'
    )
    result = _generate_json(prompt)
    if result and isinstance(result.get("summary"), str):
        return {
            "source": "gemini",
            "summary": result["summary"],
            "highlights": result.get("highlights", []) if isinstance(result.get("highlights"), list) else [],
        }

    count = len(notifications)
    highlights = [n.get("message", "") for n in notifications[:3] if n.get("message")]
    return {
        "source": "heuristic",
        "summary": f"You have {count} new notification{'s' if count != 1 else ''}.",
        "highlights": highlights,
    }
