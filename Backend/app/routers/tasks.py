"""Epic 4 -- Task Management & Volunteer Workflows.

Story 4.1/4.2: a Club Head assigns a task (Attendance, Procurement, Bill
Upload or Custom) to a Volunteer of their club, with a priority and
deadline. The volunteer accepts it, submits proof of work, and the Club
Head verifies it or sends it back for revision.

Status lifecycle: Assigned -> Accepted -> Submitted -> Verified |
Revision Requested (a Revision Requested task is resubmitted straight
back to Submitted).
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, require_roles, user_has_role

router = APIRouter(tags=["Task Management"])

STATUS_ASSIGNED = "Assigned"
STATUS_ACCEPTED = "Accepted"
STATUS_SUBMITTED = "Submitted"
STATUS_VERIFIED = "Verified"
STATUS_REVISION_REQUESTED = "Revision Requested"


def _require_club_head_of_event(db: Session, current_user: models.User, event: models.Event) -> None:
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, event.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can manage tasks for this event")


@router.post(
    "/events/{event_id}/tasks",
    response_model=schemas.TaskOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Event not found, or assignee is not a Volunteer of this club"},
    },
)
def create_task(
    event_id: int,
    payload: schemas.TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _require_club_head_of_event(db, current_user, event)

    if not user_has_role_for_user(db, payload.assigned_to, models.ROLE_VOLUNTEER, event.club_id):
        raise HTTPException(status_code=404, detail="Assignee is not a Volunteer of this club")

    task = models.Task(
        event_id=event.id,
        club_id=event.club_id,
        assigned_to=payload.assigned_to,
        assigned_by=current_user.id,
        type=payload.type,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        deadline=payload.deadline,
        expense_id=payload.expense_id,
        status=STATUS_ASSIGNED,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def user_has_role_for_user(db: Session, user_id: int, role: str, club_id: int) -> bool:
    return (
        db.query(models.UserRole)
        .filter(models.UserRole.user_id == user_id, models.UserRole.role == role, models.UserRole.club_id == club_id)
        .first()
        is not None
    )


@router.get("/events/{event_id}/tasks", response_model=list[schemas.TaskOut])
def list_event_tasks(
    event_id: int,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    query = db.query(models.Task).filter(models.Task.event_id == event_id)
    if not (
        user_has_role(current_user, models.ROLE_CLUB_HEAD, event.club_id)
        or user_has_role(current_user, models.ROLE_CLUB_PRESIDENT, event.club_id)
        or user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR)
    ):
        query = query.filter(models.Task.assigned_to == current_user.id)
    if status_filter:
        query = query.filter(models.Task.status == status_filter)
    return query.all()


@router.get("/tasks/mine", response_model=list[schemas.TaskOut])
def list_my_tasks(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Task).filter(models.Task.assigned_to == current_user.id)
    if status_filter:
        query = query.filter(models.Task.status == status_filter)
    return query.all()


@router.post(
    "/tasks/{task_id}/accept",
    response_model=schemas.TaskOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this task's assignee"},
        404: {"model": schemas.ErrorOut, "description": "Task not found"},
        409: {"model": schemas.ErrorOut, "description": "Task is not Assigned"},
    },
)
def accept_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Only this task's assignee can accept it")
    if task.status != STATUS_ASSIGNED:
        raise HTTPException(status_code=409, detail="Task is not Assigned")

    task.status = STATUS_ACCEPTED
    db.commit()
    db.refresh(task)
    return task


@router.post(
    "/tasks/{task_id}/submit-proof",
    response_model=schemas.TaskOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this task's assignee"},
        404: {"model": schemas.ErrorOut, "description": "Task not found"},
        409: {"model": schemas.ErrorOut, "description": "Task is not Accepted or Revision Requested"},
    },
)
def submit_proof(
    task_id: int,
    payload: schemas.TaskProofSubmit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Only this task's assignee can submit proof")
    if task.status not in (STATUS_ACCEPTED, STATUS_REVISION_REQUESTED):
        raise HTTPException(status_code=409, detail="Task is not Accepted or Revision Requested")

    task.proof_text = payload.proof_text
    task.proof_file_name = payload.proof_file_name
    task.submitted_at = datetime.datetime.utcnow()
    task.status = STATUS_SUBMITTED
    db.commit()
    db.refresh(task)
    return task


@router.post(
    "/tasks/{task_id}/review",
    response_model=schemas.TaskOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Task not found"},
        409: {"model": schemas.ErrorOut, "description": "Task is not Submitted"},
    },
)
def review_task(
    task_id: int,
    payload: schemas.TaskReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, task.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can review this task")
    if task.status != STATUS_SUBMITTED:
        raise HTTPException(status_code=409, detail="Task is not Submitted")

    task.status = STATUS_VERIFIED if payload.verified else STATUS_REVISION_REQUESTED
    task.review_comment = payload.comment
    task.reviewed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task
