"""Club Chat -- per-club messaging between Club Heads and students/volunteers.

Any logged-in user can read and write messages for a club. A message belongs
either to the club's general chat (student_id null) or to a one-on-one thread
between a Club Head and a specific volunteer (student_id set). `sender_role`
is recorded as "clubhead" or "student" based on the sender's role.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, user_has_role

router = APIRouter(tags=["Club Chat"])


@router.get("/clubs/{club_id}/chat", response_model=list[schemas.ChatMessageOut])
def list_chat_messages(
    club_id: int,
    student_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    query = db.query(models.ChatMessage).filter(models.ChatMessage.club_id == club_id)
    if student_id:
        query = query.filter(models.ChatMessage.student_id == student_id)
    return query.order_by(models.ChatMessage.created_at.asc(), models.ChatMessage.id.asc()).all()


@router.post(
    "/clubs/{club_id}/chat",
    response_model=schemas.ChatMessageOut,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"model": schemas.ErrorOut, "description": "Club not found"}},
)
def send_chat_message(
    club_id: int,
    payload: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    sender_role = "student" if user_has_role(current_user, models.ROLE_STUDENT) else "clubhead"
    message = models.ChatMessage(
        club_id=club_id,
        student_id=payload.student_id,
        sender_id=current_user.id,
        sender_role=sender_role,
        text=payload.text,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
