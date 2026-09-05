"""Epic 1.2 -- Membership & Volunteer Approval, plus general Club
Management (create/list clubs, open recruitment domains).

Club creation also provisions that club's Club Head login in the same
transaction: email `<clubname-slug>@iitm.in`, password `<clubname-slug>123`
-- see `slugify_club_name` / `provision_club_head`.
"""
import datetime
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, require_roles, user_has_role
from app.security import hash_password

router = APIRouter(tags=["Clubs & Membership"])


# ── Self-service (any authenticated user, own records only) ─────────
@router.get("/me/memberships", response_model=list[schemas.ClubMemberOut])
def list_my_memberships(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    members = db.query(models.ClubMember).filter(models.ClubMember.user_id == current_user.id).all()
    return [schemas.ClubMemberOut.from_orm_member(m) for m in members]


@router.get("/me/volunteer-applications", response_model=list[schemas.VolunteerApplicationOut])
def list_my_volunteer_applications(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    applications = (
        db.query(models.VolunteerApplication)
        .filter(models.VolunteerApplication.applicant_id == current_user.id)
        .all()
    )
    return [schemas.VolunteerApplicationOut.from_orm_application(a) for a in applications]


def slugify_club_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def provision_club_head(
    db: Session, club: models.Club, email: str = None, password: str = None
) -> tuple[models.User, str]:
    slug = slugify_club_name(club.name)
    email = email or f"{slug}@iitm.in"
    password_text = password or f"{slug}123"

    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

    student_id = f"CH-{club.id}"
    dup_student = db.query(models.User).filter(models.User.student_id == student_id).first()
    if dup_student:
        student_id = f"CH-{club.id}-{db.query(models.User).count() + 1}"

    user = models.User(
        student_id=student_id,
        name=f"{club.name} Head",
        email=email,
        password_hash=hash_password(password_text),
    )
    db.add(user)
    db.flush()
    db.add(models.UserRole(user_id=user.id, role=models.ROLE_CLUB_HEAD, club_id=club.id))
    db.commit()
    db.refresh(user)
    return user, password_text


# ── Club Management ────────────────────────────────────────────────
@router.post(
    "/clubs",
    response_model=schemas.ClubCreateResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": schemas.ErrorOut, "description": "Club name or club head email already exists"}},
)
def create_club(
    payload: schemas.ClubCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR, models.ROLE_CLUB_PRESIDENT)),
):
    if db.query(models.Club).filter(models.Club.name == payload.name).first():
        raise HTTPException(status_code=409, detail="A club with this name already exists")

    slug = slugify_club_name(payload.name)
    target_email = payload.club_head_email or f"{slug}@iitm.in"
    if db.query(models.User).filter(models.User.email == target_email).first():
        raise HTTPException(status_code=409, detail="A user with this club head email already exists")

    data = payload.model_dump()
    achievements = data.pop("achievements", [])
    club_head_email = data.pop("club_head_email", None)
    club_head_password = data.pop("club_head_password", None)
    # Club Management component (Component 3): a Club President submits a new
    # club proposal which the Faculty Coordinator must review before the club
    # goes live. Faculty Coordinator-created clubs are approved immediately.
    is_faculty = any(r.role == models.ROLE_FACULTY_COORDINATOR for r in current_user.roles)
    club = models.Club(
        **data,
        achievements="|".join(achievements),
        status="Approved" if is_faculty else "Pending",
        faculty_coordinator_id=current_user.id,
    )
    db.add(club)
    db.commit()
    db.refresh(club)

    club_head_user, plaintext_password = provision_club_head(
        db, club, email=club_head_email, password=club_head_password
    )

    return schemas.ClubCreateResponse(
        club=schemas.ClubOut.from_orm_club(club),
        club_head=schemas.ClubHeadCredentialsOut(email=club_head_user.email, password=plaintext_password),
    )


@router.get("/clubs", response_model=list[schemas.ClubOut])
def list_clubs(db: Session = Depends(get_db)):
    return [schemas.ClubOut.from_orm_club(c) for c in db.query(models.Club).all()]


@router.get(
    "/clubs/{club_id}",
    response_model=schemas.ClubOut,
    responses={404: {"model": schemas.ErrorOut, "description": "Club not found"}},
)
def get_club(club_id: int, db: Session = Depends(get_db)):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    return schemas.ClubOut.from_orm_club(club)


def _can_manage_club(current_user: models.User, club: models.Club) -> bool:
    return user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR) or user_has_role(
        current_user, models.ROLE_CLUB_PRESIDENT, club.id
    )


@router.patch(
    "/clubs/{club_id}",
    response_model=schemas.ClubOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller cannot manage this club"},
        404: {"model": schemas.ErrorOut, "description": "Club not found"},
    },
)
def update_club(
    club_id: int,
    payload: schemas.ClubUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_FACULTY_COORDINATOR, models.ROLE_CLUB_PRESIDENT)
    ),
):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    if not _can_manage_club(current_user, club):
        raise HTTPException(status_code=403, detail="Only this club's President or the Faculty Coordinator can edit it")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(club, field, value)
    db.commit()
    db.refresh(club)
    return schemas.ClubOut.from_orm_club(club)


@router.post(
    "/clubs/{club_id}/club-head/reset-password",
    response_model=schemas.ClubHeadPasswordResetOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller cannot manage this club"},
        404: {"model": schemas.ErrorOut, "description": "Club or Club Head not found"},
    },
)
def reset_club_head_password(
    club_id: int,
    payload: schemas.ClubHeadPasswordReset,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_FACULTY_COORDINATOR, models.ROLE_CLUB_PRESIDENT)
    ),
):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    if not _can_manage_club(current_user, club):
        raise HTTPException(
            status_code=403, detail="Only this club's President or the Faculty Coordinator can reset the Club Head's password"
        )

    club_head_role = (
        db.query(models.UserRole)
        .filter(models.UserRole.club_id == club_id, models.UserRole.role == models.ROLE_CLUB_HEAD)
        .first()
    )
    if not club_head_role:
        raise HTTPException(status_code=404, detail="This club has no Club Head account")

    club_head_user = db.query(models.User).filter(models.User.id == club_head_role.user_id).first()
    club_head_user.password_hash = hash_password(payload.password)
    db.commit()
    return schemas.ClubHeadPasswordResetOut(email=club_head_user.email, password=payload.password)


@router.delete(
    "/clubs/{club_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller cannot manage this club"},
        404: {"model": schemas.ErrorOut, "description": "Club not found"},
    },
)
def delete_club(
    club_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_FACULTY_COORDINATOR, models.ROLE_CLUB_PRESIDENT)
    ),
):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    if not _can_manage_club(current_user, club):
        raise HTTPException(status_code=403, detail="Only this club's President or the Faculty Coordinator can delete it")

    event_ids = [e.id for e in db.query(models.Event.id).filter(models.Event.club_id == club_id).all()]
    if event_ids:
        db.query(models.Booking).filter(models.Booking.event_id.in_(event_ids)).delete(synchronize_session=False)
        db.query(models.InventoryUsage).filter(models.InventoryUsage.event_id.in_(event_ids)).delete(synchronize_session=False)
    db.query(models.Event).filter(models.Event.club_id == club_id).delete(synchronize_session=False)
    db.query(models.EventProposal).filter(models.EventProposal.club_id == club_id).delete(synchronize_session=False)

    domain_ids = [d.id for d in db.query(models.Domain.id).filter(models.Domain.club_id == club_id).all()]
    if domain_ids:
        db.query(models.VolunteerApplication).filter(models.VolunteerApplication.domain_id.in_(domain_ids)).delete(
            synchronize_session=False
        )
    db.query(models.VolunteerApplication).filter(models.VolunteerApplication.club_id == club_id).delete(
        synchronize_session=False
    )
    db.query(models.Domain).filter(models.Domain.club_id == club_id).delete(synchronize_session=False)
    db.query(models.ClubMember).filter(models.ClubMember.club_id == club_id).delete(synchronize_session=False)
    db.query(models.UserRole).filter(models.UserRole.club_id == club_id).delete(synchronize_session=False)

    db.delete(club)
    db.commit()
    return None


@router.post(
    "/clubs/{club_id}/review",
    response_model=schemas.ClubOut,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Club not found"},
        409: {"model": schemas.ErrorOut, "description": "Club is not in Pending status"},
    },
)
def review_club(
    club_id: int,
    payload: schemas.ClubReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    if club.status != "Pending":
        raise HTTPException(status_code=409, detail="Club is not in Pending status")
    club.status = "Approved" if payload.approve else "Rejected"
    db.commit()
    db.refresh(club)
    return schemas.ClubOut.from_orm_club(club)


# ── Membership requests ────────────────────────────────────────────
@router.post(
    "/clubs/{club_id}/members/apply",
    response_model=schemas.ClubMemberOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Club not found"},
        409: {"model": schemas.ErrorOut, "description": "Already a member or already applied"},
    },
)
def apply_for_membership(
    club_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    existing = (
        db.query(models.ClubMember)
        .filter(models.ClubMember.club_id == club_id, models.ClubMember.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already applied or a member of this club")
    member = models.ClubMember(club_id=club_id, user_id=current_user.id, status="Pending")
    db.add(member)
    db.commit()
    db.refresh(member)
    return schemas.ClubMemberOut.from_orm_member(member)


@router.get("/clubs/{club_id}/members", response_model=list[schemas.ClubMemberOut])
def list_club_members(
    club_id: int,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    query = db.query(models.ClubMember).filter(models.ClubMember.club_id == club_id)
    if status_filter:
        query = query.filter(models.ClubMember.status == status_filter)
    return [schemas.ClubMemberOut.from_orm_member(m) for m in query.all()]


@router.post(
    "/clubs/{club_id}/members/{member_id}/review",
    response_model=schemas.ClubMemberOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Membership request not found"},
        409: {"model": schemas.ErrorOut, "description": "Membership request already decided"},
    },
)
def review_membership(
    club_id: int,
    member_id: int,
    payload: schemas.ApplicationReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD, models.ROLE_FACULTY_COORDINATOR)),
):
    if not user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR) and not user_has_role(
        current_user, models.ROLE_CLUB_HEAD, club_id
    ):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can review membership requests")

    member = (
        db.query(models.ClubMember)
        .filter(models.ClubMember.id == member_id, models.ClubMember.club_id == club_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Membership request not found")
    if member.status != "Pending":
        raise HTTPException(status_code=409, detail="Membership request already decided")

    member.status = "Active" if payload.approve else "Rejected"
    if payload.approve:
        member.joined_on = datetime.date.today()
    db.commit()
    db.refresh(member)
    return schemas.ClubMemberOut.from_orm_member(member)


# ── Recruitment domains ─────────────────────────────────────────────
@router.post(
    "/clubs/{club_id}/domains",
    response_model=schemas.DomainOut,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"}},
)
def create_domain(
    club_id: int,
    payload: schemas.DomainCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD, models.ROLE_FACULTY_COORDINATOR)),
):
    if not user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR) and not user_has_role(
        current_user, models.ROLE_CLUB_HEAD, club_id
    ):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can manage recruitment domains")
    domain = models.Domain(
        club_id=club_id,
        title=payload.title,
        recruitment_open=payload.recruitment_open,
        opened_on=datetime.date.today() if payload.recruitment_open else None,
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)
    return domain


@router.get("/clubs/{club_id}/domains", response_model=list[schemas.DomainOut])
def list_domains(club_id: int, db: Session = Depends(get_db)):
    return db.query(models.Domain).filter(models.Domain.club_id == club_id).all()


@router.patch(
    "/domains/{domain_id}/recruitment",
    response_model=schemas.DomainOut,
    responses={404: {"model": schemas.ErrorOut, "description": "Domain not found"}},
)
def toggle_recruitment(
    domain_id: int,
    recruitment_open: bool,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD, models.ROLE_FACULTY_COORDINATOR)),
):
    domain = db.query(models.Domain).filter(models.Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if not user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR) and not user_has_role(
        current_user, models.ROLE_CLUB_HEAD, domain.club_id
    ):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can manage recruitment domains")
    domain.recruitment_open = recruitment_open
    domain.opened_on = datetime.date.today() if recruitment_open else domain.opened_on
    db.commit()
    db.refresh(domain)
    return domain


@router.delete(
    "/domains/{domain_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Domain not found"},
        409: {"model": schemas.ErrorOut, "description": "Domain has Pending or Selected volunteer applications"},
    },
)
def delete_domain(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    domain = db.query(models.Domain).filter(models.Domain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, domain.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can manage recruitment domains")

    has_active_apps = (
        db.query(models.VolunteerApplication)
        .filter(
            models.VolunteerApplication.domain_id == domain_id,
            models.VolunteerApplication.status.in_(["Pending", "Selected"]),
        )
        .first()
        is not None
    )
    if has_active_apps:
        raise HTTPException(
            status_code=409,
            detail="Domain has Pending or Selected volunteer applications -- resolve or revoke those first",
        )

    db.delete(domain)
    db.commit()


# ── Volunteer applications ──────────────────────────────────────────
@router.post(
    "/clubs/{club_id}/volunteer-applications",
    response_model=schemas.VolunteerApplicationOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Domain not found or recruitment closed"},
        409: {"model": schemas.ErrorOut, "description": "Already applied to this domain"},
    },
)
def apply_as_volunteer(
    club_id: int,
    payload: schemas.VolunteerApplicationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    domain = (
        db.query(models.Domain)
        .filter(models.Domain.id == payload.domain_id, models.Domain.club_id == club_id)
        .first()
    )
    if not domain or not domain.recruitment_open:
        raise HTTPException(status_code=404, detail="Domain not found or recruitment is closed")

    existing = (
        db.query(models.VolunteerApplication)
        .filter(
            models.VolunteerApplication.domain_id == payload.domain_id,
            models.VolunteerApplication.applicant_id == current_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already applied to this domain")

    application = models.VolunteerApplication(
        club_id=club_id,
        domain_id=payload.domain_id,
        applicant_id=current_user.id,
        applied_on=datetime.date.today(),
        note=payload.note,
        status="Pending",
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return schemas.VolunteerApplicationOut.from_orm_application(application)


@router.get("/clubs/{club_id}/volunteer-applications", response_model=list[schemas.VolunteerApplicationOut])
def list_volunteer_applications(
    club_id: int,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    query = db.query(models.VolunteerApplication).filter(models.VolunteerApplication.club_id == club_id)
    if status_filter:
        query = query.filter(models.VolunteerApplication.status == status_filter)
    return [schemas.VolunteerApplicationOut.from_orm_application(a) for a in query.all()]


@router.post(
    "/clubs/{club_id}/volunteer-applications/{application_id}/review",
    response_model=schemas.VolunteerApplicationOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Application not found"},
        409: {"model": schemas.ErrorOut, "description": "Application already decided"},
    },
)
def review_volunteer_application(
    club_id: int,
    application_id: int,
    payload: schemas.ApplicationReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD, models.ROLE_FACULTY_COORDINATOR)),
):
    if not user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR) and not user_has_role(
        current_user, models.ROLE_CLUB_HEAD, club_id
    ):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can review volunteer applications")

    application = (
        db.query(models.VolunteerApplication)
        .filter(models.VolunteerApplication.id == application_id, models.VolunteerApplication.club_id == club_id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.status != "Pending":
        raise HTTPException(status_code=409, detail="Application already decided")

    application.status = "Selected" if payload.approve else "Rejected"
    db.commit()
    db.refresh(application)

    if payload.approve:
        already_role = (
            db.query(models.UserRole)
            .filter(
                models.UserRole.user_id == application.applicant_id,
                models.UserRole.role == models.ROLE_VOLUNTEER,
                models.UserRole.club_id == club_id,
            )
            .first()
        )
        if not already_role:
            db.add(models.UserRole(user_id=application.applicant_id, role=models.ROLE_VOLUNTEER, club_id=club_id))
            db.commit()

    return schemas.VolunteerApplicationOut.from_orm_application(application)


def _require_club_head_of_application(
    db: Session, current_user: models.User, club_id: int, application_id: int
) -> models.VolunteerApplication:
    application = (
        db.query(models.VolunteerApplication)
        .filter(models.VolunteerApplication.id == application_id, models.VolunteerApplication.club_id == club_id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can manage this application")
    return application


@router.post(
    "/clubs/{club_id}/volunteer-applications/{application_id}/revoke",
    response_model=schemas.VolunteerApplicationOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Application not found"},
        409: {"model": schemas.ErrorOut, "description": "Application is not currently Selected"},
    },
)
def revoke_volunteer_application(
    club_id: int,
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    application = _require_club_head_of_application(db, current_user, club_id, application_id)
    if application.status != "Selected":
        raise HTTPException(status_code=409, detail="Application is not currently Selected")

    application.status = "Revoked"
    db.query(models.UserRole).filter(
        models.UserRole.user_id == application.applicant_id,
        models.UserRole.role == models.ROLE_VOLUNTEER,
        models.UserRole.club_id == club_id,
    ).delete(synchronize_session=False)
    db.commit()
    db.refresh(application)
    return schemas.VolunteerApplicationOut.from_orm_application(application)


@router.post(
    "/clubs/{club_id}/volunteer-applications/{application_id}/reopen",
    response_model=schemas.VolunteerApplicationOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Caller is not this club's Club Head"},
        404: {"model": schemas.ErrorOut, "description": "Application not found"},
        409: {"model": schemas.ErrorOut, "description": "Application is not Rejected or Revoked"},
    },
)
def reopen_volunteer_application(
    club_id: int,
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    application = _require_club_head_of_application(db, current_user, club_id, application_id)
    if application.status not in ("Rejected", "Revoked"):
        raise HTTPException(status_code=409, detail="Application is not Rejected or Revoked")

    application.status = "Pending"
    db.commit()
    db.refresh(application)
    return schemas.VolunteerApplicationOut.from_orm_application(application)
