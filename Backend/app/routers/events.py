"""Epic 3 -- Event Lifecycle & Approval Workflows.

Story 3.1 (Event Proposal Pipeline): Draft -> Pending President Review ->
Pending Faculty Approval -> Approved/Rejected, status visible at every stage.
Faculty approval runs the Story 2.1 venue-conflict check before an Event
row (and its Booking) is created, so a proposal cannot be approved into a
double-booked venue.
"""
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import require_roles, user_has_role

router = APIRouter(tags=["Event Proposals & Events"])

STATUS_DRAFT = "Draft"
STATUS_PENDING_PRESIDENT = "Pending President Review"
STATUS_PENDING_FACULTY = "Pending Faculty Approval"
STATUS_APPROVED = "Approved"
STATUS_REJECTED = "Rejected"
STATUS_NEEDS_REVISION = "Needs Revision"


@router.post(
    "/proposals",
    response_model=schemas.EventProposalOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Club or venue not found"},
    },
)
def create_proposal(
    payload: schemas.EventProposalCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, payload.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can draft a proposal")
    if not db.query(models.Club).filter(models.Club.id == payload.club_id).first():
        raise HTTPException(status_code=404, detail="Club not found")
    if payload.venue_id and not db.query(models.Venue).filter(models.Venue.id == payload.venue_id).first():
        raise HTTPException(status_code=404, detail="Venue not found")

    proposal = models.EventProposal(
        club_id=payload.club_id,
        event_name=payload.event_name,
        description=payload.description,
        schedule_date=payload.schedule_date,
        time_slot=payload.time_slot,
        estimated_participants=payload.estimated_participants,
        capacity_required=payload.capacity_required,
        line_items_json=payload.line_items_json,
        venue_id=payload.venue_id,
        budget_estimate=payload.budget_estimate,
        status=STATUS_DRAFT,
        submitted_by=current_user.id,
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal


@router.get("/proposals", response_model=list[schemas.EventProposalOut])
def list_proposals(
    club_id: int | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.EventProposal)
    if club_id:
        query = query.filter(models.EventProposal.club_id == club_id)
    if status_filter:
        query = query.filter(models.EventProposal.status == status_filter)
    return query.all()


@router.get(
    "/proposals/{proposal_id}",
    response_model=schemas.EventProposalOut,
    responses={404: {"model": schemas.ErrorOut, "description": "Proposal not found"}},
)
def get_proposal(proposal_id: int, db: Session = Depends(get_db)):
    proposal = db.query(models.EventProposal).filter(models.EventProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal


@router.post(
    "/proposals/{proposal_id}/submit",
    response_model=schemas.EventProposalOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Proposal not found"},
        409: {"model": schemas.ErrorOut, "description": "Proposal is not in Draft status"},
    },
)
def submit_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    proposal = db.query(models.EventProposal).filter(models.EventProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, proposal.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can submit this proposal")
    if proposal.status not in (STATUS_DRAFT, STATUS_NEEDS_REVISION):
        raise HTTPException(status_code=409, detail="Proposal is not in Draft or Needs Revision status")

    proposal.status = STATUS_PENDING_PRESIDENT
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post(
    "/proposals/{proposal_id}/president-review",
    response_model=schemas.EventProposalOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club President"},
        404: {"model": schemas.ErrorOut, "description": "Proposal not found"},
        409: {"model": schemas.ErrorOut, "description": "Proposal is not Pending President Review"},
    },
)
def president_review(
    proposal_id: int,
    payload: schemas.ProposalReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_PRESIDENT)),
):
    proposal = db.query(models.EventProposal).filter(models.EventProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if not user_has_role(current_user, models.ROLE_CLUB_PRESIDENT, proposal.club_id):
        raise HTTPException(status_code=403, detail="Only this club's President can review this proposal")
    if proposal.status != STATUS_PENDING_PRESIDENT:
        raise HTTPException(status_code=409, detail="Proposal is not Pending President Review")

    if payload.approve:
        proposal.status = STATUS_PENDING_FACULTY
    else:
        proposal.status = STATUS_REJECTED
        proposal.rejection_reason = payload.reason
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post(
    "/proposals/{proposal_id}/send-for-revision",
    response_model=schemas.EventProposalOut,
    responses={
        403: {
            "model": schemas.ErrorOut,
            "description": "Caller is not this club's President (Pending President Review) / Faculty Coordinator (Pending Faculty Approval)",
        },
        404: {"model": schemas.ErrorOut, "description": "Proposal not found"},
        409: {
            "model": schemas.ErrorOut,
            "description": "Proposal is not Pending President Review or Pending Faculty Approval",
        },
    },
)
def send_proposal_for_revision(
    proposal_id: int,
    payload: schemas.ProposalRevisionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    proposal = db.query(models.EventProposal).filter(models.EventProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    is_president = user_has_role(current_user, models.ROLE_CLUB_PRESIDENT, proposal.club_id)
    is_faculty = user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR)

    if is_president and proposal.status == STATUS_PENDING_PRESIDENT:
        pass
    elif is_faculty and proposal.status == STATUS_PENDING_FACULTY:
        pass
    elif proposal.status in (STATUS_PENDING_PRESIDENT, STATUS_PENDING_FACULTY):
        # The proposal is at a revocable stage, but this user is not the
        # actor that owns that stage.
        raise HTTPException(
            status_code=403,
            detail="Only the club's President (Pending President Review) or the Faculty Coordinator (Pending Faculty Approval) can send this proposal for revision",
        )
    else:
        raise HTTPException(
            status_code=409,
            detail="Proposal is not Pending President Review or Pending Faculty Approval",
        )

    proposal.status = STATUS_NEEDS_REVISION
    proposal.rejection_reason = payload.reason
    db.commit()
    db.refresh(proposal)
    return proposal


@router.patch(
    "/proposals/{proposal_id}",
    response_model=schemas.EventProposalOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Proposal not found"},
        409: {"model": schemas.ErrorOut, "description": "Proposal is not in Draft or Needs Revision status"},
    },
)
def update_proposal(
    proposal_id: int,
    payload: schemas.EventProposalUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    proposal = db.query(models.EventProposal).filter(models.EventProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, proposal.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can edit this proposal")
    if proposal.status not in (STATUS_DRAFT, STATUS_NEEDS_REVISION):
        raise HTTPException(
            status_code=409, detail="Proposal is not in Draft or Needs Revision status"
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(proposal, field, value)

    # Editing a proposal that was sent back for revision restarts the
    # review pipeline from the top.
    if proposal.status == STATUS_NEEDS_REVISION:
        proposal.status = STATUS_DRAFT
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post(
    "/proposals/{proposal_id}/faculty-review",
    response_model=schemas.EventProposalOut,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Proposal not found"},
        409: {
            "model": schemas.ErrorOut,
            "description": "Proposal is not Pending Faculty Approval, or its venue is already booked (Story 2.1)",
        },
    },
)
def faculty_review(
    proposal_id: int,
    payload: schemas.ProposalReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    proposal = db.query(models.EventProposal).filter(models.EventProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status not in (STATUS_PENDING_FACULTY, "Pending Faculty Review"):
        raise HTTPException(status_code=409, detail="Proposal is not Pending Faculty Approval")

    if not payload.approve:
        proposal.status = STATUS_REJECTED
        proposal.rejection_reason = payload.reason

        if proposal.venue_id and proposal.schedule_date:
            bookings = (
                db.query(models.Booking)
                .filter(
                    models.Booking.venue_id == proposal.venue_id,
                    models.Booking.booking_date == proposal.schedule_date,
                    models.Booking.status != "Released",
                )
                .all()
            )
            for b in bookings:
                b.status = "Released"

        eb = db.query(models.EventBudget).filter(models.EventBudget.proposal_id == proposal.id).first()
        if eb:
            expenses = db.query(models.Expense).filter(models.Expense.event_budget_id == eb.id).all()
            revert_amount = sum((exp.approved_amount or Decimal("0")) for exp in expenses)
            if revert_amount > 0:
                club = db.query(models.Club).filter(models.Club.id == proposal.club_id).first()
                if club:
                    club.budget_spent = max(club.budget_spent - revert_amount, Decimal("0"))
            for exp in expenses:
                db.delete(exp)
            db.delete(eb)

        db.commit()
        db.refresh(proposal)
        return proposal

    # Story 2.1: catch a venue double-booking before final approval.
    if proposal.venue_id and proposal.schedule_date:
        conflict = (
            db.query(models.Booking)
            .filter(
                models.Booking.venue_id == proposal.venue_id,
                models.Booking.booking_date == proposal.schedule_date,
                models.Booking.status != "Released",
                models.Booking.status != "Cancelled",
                models.Booking.event_name != proposal.event_name,
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Venue is already booked on {proposal.schedule_date} "
                    f"by another event ('{conflict.event_name}') -- cannot approve"
                ),
            )

    proposal.status = STATUS_APPROVED
    db.commit()
    db.refresh(proposal)

    event = models.Event(
        proposal_id=proposal.id,
        club_id=proposal.club_id,
        name=proposal.event_name,
        description=proposal.description,
        venue_id=proposal.venue_id,
        event_date=proposal.schedule_date,
        published=True,
        finalized=False,
    )
    db.add(event)
    db.flush()

    # Ensure an EventBudget entry exists for finance and club overview tracking
    existing_eb = (
        db.query(models.EventBudget)
        .filter(models.EventBudget.proposal_id == proposal.id)
        .first()
    )
    if not existing_eb:
        db.add(
            models.EventBudget(
                club_id=proposal.club_id,
                proposal_id=proposal.id,
                event_name=proposal.event_name,
                allotted=proposal.budget_estimate or Decimal("0"),
                status="Open",
            )
        )

    if proposal.venue_id and proposal.schedule_date:
        # The Club Head/President-side flow already reserves a Booking for
        # this event_name at proposal-approval time (see Frontend's
        # approveProposal/finalizeProposalResources -> Api.createBooking).
        # Reuse that row instead of inserting a second one for the same
        # event, which would double-count the venue as booked.
        existing_booking = (
            db.query(models.Booking)
            .filter(
                models.Booking.venue_id == proposal.venue_id,
                models.Booking.booking_date == proposal.schedule_date,
                models.Booking.event_name == proposal.event_name,
                models.Booking.status.not_in(["Released", "Cancelled"]),
            )
            .first()
        )
        if existing_booking:
            existing_booking.event_id = event.id
            existing_booking.status = "Confirmed"
        else:
            db.add(
                models.Booking(
                    venue_id=proposal.venue_id,
                    event_id=event.id,
                    event_name=proposal.event_name,
                    booking_date=proposal.schedule_date,
                    status="Confirmed",
                )
            )

    # ── F-4.1.5: Auto-create Attendance Taking task when event is approved ──
    # The system automatically creates an Attendance Taking task assigned to the
    # Club Head of the event's club so the QR attendance workflow is ready from
    # day one, without the Club Head having to manually create this mandatory task.
    club_head_role = (
        db.query(models.UserRole)
        .filter(
            models.UserRole.club_id == proposal.club_id,
            models.UserRole.role == models.ROLE_CLUB_HEAD,
        )
        .first()
    )
    if club_head_role:
        db.add(
            models.Task(
                event_id=event.id,
                club_id=proposal.club_id,
                assigned_to=club_head_role.user_id,
                assigned_by=current_user.id,
                type="Attendance",
                title="Attendance Taking",
                description="Scan registrant QR codes at the venue to mark attendance.",
                priority="High",
                status="Assigned",
            )
        )

    db.commit()
    db.refresh(proposal)
    return proposal


@router.get("/events", response_model=list[schemas.EventOut])
def list_events(club_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Event)
    if club_id:
        query = query.filter(models.Event.club_id == club_id)
    return query.all()


@router.get(
    "/events/{event_id}",
    response_model=schemas.EventOut,
    responses={404: {"model": schemas.ErrorOut, "description": "Event not found"}},
)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post(
    "/events/{event_id}/publish",
    response_model=schemas.EventOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Event not found"},
    },
)
def publish_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, event.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can publish this event")
    event.published = True
    db.commit()
    db.refresh(event)
    return event
