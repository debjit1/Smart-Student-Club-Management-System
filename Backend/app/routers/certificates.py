"""Epic 6 -- Certification & Budget Analytics.

Story 6.1: finalizing an event auto-issues a Certificate to every
Volunteer with a Verified task on it and every Checked-In attendee, so
students no longer have to chase organizers for proof of participation.

Story 6.2: `GET /analytics/budget-overview` gives the Faculty
Coordinator's live dashboard -- allocated/spent per club, active venue
bookings, and inventory currently on loan. Per-club/event finance
detail already lives in app.routers.finance; this endpoint is the
cross-club rollup.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, require_roles

router = APIRouter(tags=["Certification & Budget Analytics"])

REASON_VOLUNTEER = "Volunteer"
REASON_ATTENDEE = "Attendee"


@router.post(
    "/events/{event_id}/finalize",
    response_model=schemas.FinalizeEventOut,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Event not found"},
        409: {"model": schemas.ErrorOut, "description": "Event is already finalized"},
    },
)
def finalize_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.finalized:
        raise HTTPException(status_code=409, detail="Event is already finalized")

    verified_volunteer_ids = {
        row[0]
        for row in db.query(models.Task.assigned_to)
        .filter(models.Task.event_id == event_id, models.Task.status == "Verified")
        .distinct()
        .all()
    }
    checked_in_ids = {
        row[0]
        for row in db.query(models.Registration.user_id)
        .filter(models.Registration.event_id == event_id, models.Registration.status == "Checked-In")
        .distinct()
        .all()
    }

    issued = []
    for user_id in verified_volunteer_ids | checked_in_ids:
        reason = REASON_VOLUNTEER if user_id in verified_volunteer_ids else REASON_ATTENDEE
        certificate = models.Certificate(event_id=event_id, user_id=user_id, reason=reason)
        db.add(certificate)
        issued.append(certificate)

    event.finalized = True
    db.commit()
    for certificate in issued:
        db.refresh(certificate)
    db.refresh(event)

    return schemas.FinalizeEventOut(event=event, certificates_issued=issued)


@router.get("/certificates", response_model=list[schemas.CertificateOut])
def list_my_certificates(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Certificate).filter(models.Certificate.user_id == current_user.id).all()


@router.get("/analytics/budget-overview", response_model=schemas.BudgetOverviewOut)
def budget_overview(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    clubs = db.query(models.Club).all()
    club_rows = [
        schemas.ClubBudgetOverview(
            club_id=club.id, club_name=club.name, allocated=club.budget_allotted, spent=club.budget_spent
        )
        for club in clubs
    ]
    total_allocated = sum((club.budget_allotted for club in clubs), Decimal("0"))
    total_spent = sum((club.budget_spent for club in clubs), Decimal("0"))

    active_bookings = (
        db.query(models.Booking).filter(models.Booking.status.not_in(["Released", "Cancelled"])).count()
    )
    inventory_on_loan = db.query(models.InventoryUsage).filter(models.InventoryUsage.status == "In Use").count()

    return schemas.BudgetOverviewOut(
        clubs=club_rows,
        total_allocated=total_allocated,
        total_spent=total_spent,
        active_bookings=active_bookings,
        inventory_on_loan=inventory_on_loan,
    )
