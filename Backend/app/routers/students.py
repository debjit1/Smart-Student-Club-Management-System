"""Student Management & User Bulk Import Router.

Endpoints:
- `POST /users/bulk-import` (CSV / JSON bulk user import for Faculty Coordinator)
- `GET /students` (Aggregated student profiles for Faculty Coordinator & Club President)
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Body, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.routers.auth import process_bulk_import

import datetime
from app.security import hash_password

router = APIRouter(tags=["Student Management"])


@router.post(
    "/students",
    response_model=schemas.StudentDetailOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"},
        409: {"model": schemas.ErrorOut, "description": "User already exists"},
    },
)
def create_student_manual(
    payload: schemas.StudentCreateManual,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    # A student's login is derived from their student_id when not supplied:
    # email = <student_id>@iitm.in, default password student@123.
    email = payload.email or f"{payload.student_id.lower()}@iitm.in"
    password = payload.password or "student@123"

    existing = (
        db.query(models.User)
        .filter((models.User.email == email) | (models.User.student_id == payload.student_id))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Student with email '{email}' or student_id '{payload.student_id}' already exists",
        )

    now = datetime.datetime.utcnow()
    user = models.User(
        student_id=payload.student_id,
        name=payload.name,
        email=email,
        password_hash=hash_password(password),
        department=payload.department,
        year=payload.year,
        created_at=now,
    )
    db.add(user)
    db.flush()

    role = models.UserRole(user_id=user.id, role=models.ROLE_STUDENT, club_id=None)
    db.add(role)
    db.commit()
    db.refresh(user)

    return schemas.StudentDetailOut(
        id=user.id,
        student_id=user.student_id,
        name=user.name,
        email=user.email,
        department=user.department,
        year=user.year,
        created_at=user.created_at or now,
        roles=[models.ROLE_STUDENT],
        memberships=[],
        registrations=[],
        certificates=[],
    )


from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Body, Request, status

@router.post(
    "/users/bulk-import",
    response_model=schemas.BulkUserImportOut,
    status_code=status.HTTP_200_OK,
    responses={403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"}},
)
async def bulk_import_users(
    request: Request,
    file: Optional[UploadFile] = File(None),
    payload: Optional[List[schemas.BulkUserImportRow]] = Body(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    if not file and not payload:
        try:
            body_json = await request.json()
            if isinstance(body_json, list):
                payload = [schemas.BulkUserImportRow(**row) for row in body_json]
        except Exception:
            pass
    return process_bulk_import(file, payload, db)


@router.get(
    "/students",
    response_model=List[schemas.StudentDetailOut],
    responses={403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator, Club President, or Club Head role required"}},
)
def list_students(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Restrict caller to Faculty Coordinator, Club President, or Club Head
    has_faculty = any(r.role == models.ROLE_FACULTY_COORDINATOR for r in current_user.roles)
    has_president = any(r.role == models.ROLE_CLUB_PRESIDENT for r in current_user.roles)
    has_head = any(r.role == models.ROLE_CLUB_HEAD for r in current_user.roles)

    if not (has_faculty or has_president or has_head):
        raise HTTPException(
            status_code=403,
            detail="Only Faculty Coordinator, Club President, or Club Head can access Student Management view",
        )

    # Query student accounts from DB (excluding Faculty Coordinators)
    students = (
        db.query(models.User)
        .filter(~models.User.roles.any(models.UserRole.role == models.ROLE_FACULTY_COORDINATOR))
        .order_by(models.User.id.desc())
        .all()
    )
    if not students:
        students = db.query(models.User).order_by(models.User.id.desc()).all()

    # Pre-fetch clubs, events for fast mapping
    clubs_by_id = {c.id: c.name for c in db.query(models.Club).all()}
    events_by_id = {row.id: row.name for row in db.query(models.Event.id, models.Event.name).all()}

    output = []
    for s in students:
        # User roles (deduplicated)
        user_roles = list(dict.fromkeys([r.role for r in s.roles])) if s.roles else ["Student"]

        # Memberships
        memberships = []
        for r in s.roles:
            if r.club_id and r.club_id in clubs_by_id:
                memberships.append(
                    schemas.StudentMembershipOut(
                        club_id=r.club_id,
                        club_name=clubs_by_id[r.club_id],
                        role=r.role,
                    )
                )

        # Event Registrations
        registrations = []
        user_regs = db.query(models.Registration).filter(models.Registration.user_id == s.id).all()
        for reg in user_regs:
            registrations.append(
                schemas.StudentRegistrationOut(
                    event_id=reg.event_id,
                    event_name=events_by_id.get(reg.event_id, f"Event #{reg.event_id}"),
                    status=reg.status,
                    qr_token=reg.qr_token,
                    checked_in_at=reg.checked_in_at,
                )
            )

        # Certificates
        certificates = []
        user_certs = db.query(models.Certificate).filter(models.Certificate.user_id == s.id).all()
        for cert in user_certs:
            certificates.append(
                schemas.StudentCertificateOut(
                    id=cert.id,
                    event_id=cert.event_id,
                    event_name=events_by_id.get(cert.event_id, f"Event #{cert.event_id}"),
                    reason=cert.reason,
                    issued_at=cert.issued_at,
                )
            )

        output.append(
            schemas.StudentDetailOut(
                id=s.id,
                student_id=s.student_id,
                name=s.name,
                email=s.email,
                department=s.department,
                year=s.year,
                created_at=s.created_at,
                roles=user_roles,
                memberships=memberships,
                registrations=registrations,
                certificates=certificates,
            )
        )

    return output
