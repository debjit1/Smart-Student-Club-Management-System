"""Notifications -- per-user in-app notifications (proposal status changes,
task reminders, etc.). A user only ever sees their own notifications.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user

router = APIRouter(tags=["Notifications"])


@router.get("/notifications", response_model=list[schemas.NotificationOut])
def list_my_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    notifications = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id)
        .order_by(models.Notification.created_at.desc(), models.Notification.id.desc())
        .all()
    )
    return notifications


@router.post(
    "/notifications",
    response_model=schemas.NotificationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_notification(
    payload: schemas.NotificationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    notification = models.Notification(user_id=current_user.id, message=payload.message)
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/notifications/read-all")
def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    updated = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id, models.Notification.read == False)
        .update({models.Notification.read: True}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}
