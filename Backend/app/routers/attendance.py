"""Epic 5 -- QR Attendance & Live Execution.

Story 5.1/5.2: a Student registers for an event and receives a unique QR
token; at the door a Club Head or a Volunteer holding an Attendance task
for that event scans (or manually enters) the token to check the student
in. The Club Head's roster view shows live Checked-In / Not Checked-In
counts.
"""
import datetime
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, user_has_role

router = APIRouter(tags=["QR Attendance"])

STATUS_REGISTERED = "Registered"
STATUS_CHECKED_IN = "Checked-In"

# Attendance is taken at Indian venues -- checked_in_at is stored as a naive
# IST wall-clock value (not UTC, unlike every other timestamp column in this
# app) so the frontend can display it as-is with no timezone conversion.
IST_OFFSET = datetime.timedelta(hours=5, minutes=30)


def _now_ist() -> datetime.datetime:
    return datetime.datetime.utcnow() + IST_OFFSET


def _format_ist(dt: datetime.datetime) -> str:
    return dt.strftime("%I:%M %p IST").lstrip("0")


def _can_check_in(db: Session, user: models.User, event: models.Event) -> bool:
    if user_has_role(user, models.ROLE_CLUB_HEAD, event.club_id):
        return True
    return (
        db.query(models.Task)
        .filter(
            models.Task.event_id == event.id,
            models.Task.assigned_to == user.id,
            models.Task.type == "Attendance",
        )
        .first()
        is not None
    )


@router.post(
    "/events/{event_id}/registrations",
    response_model=schemas.RegistrationOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Event not found"},
        409: {"model": schemas.ErrorOut, "description": "Already registered for this event"},
    },
)
def register_for_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    existing = (
        db.query(models.Registration)
        .filter(models.Registration.event_id == event_id, models.Registration.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already registered for this event")

    registration = models.Registration(
        event_id=event_id,
        user_id=current_user.id,
        qr_token=secrets.token_urlsafe(16),
        status=STATUS_REGISTERED,
    )
    db.add(registration)
    db.commit()
    db.refresh(registration)
    return registration


@router.get("/registrations/mine", response_model=list[schemas.RegistrationOut])
def list_my_registrations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Registration).filter(models.Registration.user_id == current_user.id).all()


@router.get(
    "/events/{event_id}/registrations",
    response_model=list[schemas.RegistrationOut],
    responses={404: {"model": schemas.ErrorOut, "description": "Event not found"}},
)
def list_event_registrations(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not (
        user_has_role(current_user, models.ROLE_CLUB_HEAD, event.club_id)
        or user_has_role(current_user, models.ROLE_CLUB_PRESIDENT, event.club_id)
        or user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR)
    ):
        raise HTTPException(status_code=403, detail="Only this club's Club Head, President or Faculty Coordinator can view the roster")
    return db.query(models.Registration).filter(models.Registration.event_id == event_id).all()


@router.post(
    "/registrations/{qr_token}/check-in",
    response_model=schemas.RegistrationOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller cannot check attendees in for this event"},
        404: {"model": schemas.ErrorOut, "description": "Registration not found for this token"},
        409: {"model": schemas.ErrorOut, "description": "Already checked in"},
    },
)
def check_in(
    qr_token: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    registration = db.query(models.Registration).filter(models.Registration.qr_token == qr_token).first()
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found for this token")

    event = db.query(models.Event).filter(models.Event.id == registration.event_id).first()
    if not _can_check_in(db, current_user, event):
        raise HTTPException(status_code=403, detail="Caller cannot check attendees in for this event")
    if registration.status == STATUS_CHECKED_IN:
        when = _format_ist(registration.checked_in_at) if registration.checked_in_at else "an earlier time"
        raise HTTPException(status_code=409, detail=f"Already checked in at {when}")

    registration.status = STATUS_CHECKED_IN
    registration.checked_in_at = _now_ist()
    db.commit()
    db.refresh(registration)
    return registration


# ── F-5.3.3: Real-time attendance stats ─────────────────────────────
@router.get(
    "/events/{event_id}/attendance-stats",
    response_model=schemas.AttendanceStatsOut,
    responses={404: {"model": schemas.ErrorOut, "description": "Event not found"}},
)
def get_attendance_stats(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return real-time attendance statistics for an event.

    Accessible to the event's Club Head, Club President, or Faculty
    Coordinator -- the same roles that can view the full roster.
    """
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not (
        user_has_role(current_user, models.ROLE_CLUB_HEAD, event.club_id)
        or user_has_role(current_user, models.ROLE_CLUB_PRESIDENT, event.club_id)
        or user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR)
    ):
        raise HTTPException(status_code=403, detail="Only this club's Club Head, President or Faculty Coordinator can view attendance stats")

    registrations = (
        db.query(models.Registration)
        .filter(models.Registration.event_id == event_id)
        .all()
    )
    total = len(registrations)
    checked_in = sum(1 for r in registrations if r.status == STATUS_CHECKED_IN)
    last_check_in = max(
        (r.checked_in_at for r in registrations if r.checked_in_at),
        default=None,
    )

    return schemas.AttendanceStatsOut(
        event_id=event_id,
        total_registered=total,
        checked_in=checked_in,
        pending=total - checked_in,
        last_check_in_at=last_check_in,
    )
