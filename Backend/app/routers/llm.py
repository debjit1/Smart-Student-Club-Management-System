"""LLM-assisted features: notification digest
(summarizes a student's unread notifications) and event proposal assistant
(generates a full proposal from name + objective + participants).

All degrade to deterministic heuristics when GEMINI_API_KEY isn't set --
see app/llm.py.
"""
from fastapi import APIRouter, Depends

from app import llm, models, schemas
from app.database import get_db
from app.deps import get_current_user

router = APIRouter(tags=["LLM-Assisted Features"])


@router.post(
    "/llm/notification-digest",
    response_model=schemas.NotificationDigestResponse,
    summary="Notification Digest",
    description=(
        "Cross-cutting platform feature backing every role's notification "
        "feed: summarizes a caller's unread notifications (approvals, "
        "rejections, deadlines) into a short digest plus up to 3 highlight "
        "bullets. Calls Gemini (GEMINI_API_KEY) when configured; otherwise "
        "falls back to a deterministic count-based summary -- `source` in "
        "the response tells the caller which path was used."
    ),
)
def notification_digest(
    payload: schemas.NotificationDigestRequest,
    current_user: models.User = Depends(get_current_user),
):
    result = llm.summarize_notifications([n.model_dump() for n in payload.notifications])
    return schemas.NotificationDigestResponse(**result)


@router.post(
    "/llm/event-proposal-assist",
    response_model=schemas.EventProposalAssistResponse,
    summary="Event Proposal Assistant",
    description=(
        "Supports Story 3.1 (Event Proposal Pipeline): when a Club Head is "
        "creating a new event proposal, this endpoint takes a minimal input "
        "(event name, objective, expected participants) and returns a fully "
        "drafted proposal including: event description, agenda, budget estimate, "
        "required inventory, volunteer requirements, risk assessment, and a "
        "planning timeline. Uses Gemini when GEMINI_API_KEY is set; otherwise "
        "falls back to a deterministic heuristic. The response's `source` field "
        "indicates which path was used."
    ),
)
def event_proposal_assist(
    payload: schemas.EventProposalAssistRequest,
    current_user: models.User = Depends(get_current_user),
):
    result = llm.assist_event_proposal(
        event_name=payload.event_name,
        objective=payload.objective,
        expected_participants=payload.expected_participants,
    )
    return schemas.EventProposalAssistResponse(**result)
