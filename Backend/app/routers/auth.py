"""Epic 1.1 -- Role-Based Dashboards: register, authenticate, and identify
the caller so the frontend can route to the dashboard matching their role.
"""
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=schemas.UserOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": schemas.ErrorOut, "description": "student_id or email already registered"}},
)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    if payload.role not in models.ALL_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {models.ALL_ROLES}")

    existing = (
        db.query(models.User)
        .filter((models.User.email == payload.email) | (models.User.student_id == payload.student_id))
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email or student_id already exists")

    if payload.role in (models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT) and payload.club_id:
        club = db.query(models.Club).filter(models.Club.id == payload.club_id).first()
        if not club:
            raise HTTPException(status_code=404, detail="club_id does not exist")

    user = models.User(
        student_id=payload.student_id,
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        department=payload.department,
        year=payload.year,
    )
    db.add(user)
    db.flush()
    db.add(models.UserRole(user_id=user.id, role=payload.role, club_id=payload.club_id))
    db.commit()
    db.refresh(user)
    return user


@router.post(
    "/login",
    response_model=schemas.TokenOut,
    responses={401: {"model": schemas.ErrorOut, "description": "Invalid email or password"}},
)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    roles = [r.role for r in user.roles]
    token = create_access_token(subject=str(user.id), extra_claims={"roles": roles})
    return schemas.TokenOut(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def read_current_user(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post(
    "/change-password",
    responses={
        400: {"model": schemas.ErrorOut, "description": "Current password is incorrect"},
        422: {"model": schemas.ErrorOut, "description": "New password does not meet requirements"},
    },
)
def change_password(
    payload: schemas.ChangePassword,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
    return {"message": "Password changed successfully"}


# ── Bulk Import Users (Faculty Coordinator Only) ───────────────────
from io import StringIO
import csv
from typing import List, Optional
from fastapi import File, UploadFile, Body
from app.deps import require_roles

@router.post(
    "/bulk-import",
    response_model=schemas.BulkUserImportOut,
    status_code=status.HTTP_200_OK,
    responses={403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"}},
)
def bulk_import_users_auth_alias(
    file: Optional[UploadFile] = File(None),
    payload: Optional[List[schemas.BulkUserImportRow]] = Body(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    return process_bulk_import(file, payload, db)


def process_bulk_import(
    file: Optional[UploadFile],
    payload: Optional[List[schemas.BulkUserImportRow]],
    db: Session,
) -> schemas.BulkUserImportOut:
    rows_to_process = []
    if file and file.filename:
        content = file.file.read().decode("utf-8")
        csv_reader = csv.DictReader(StringIO(content))
        for idx, row in enumerate(csv_reader, start=1):
            student_id = row.get("student_id", "").strip()
            rows_to_process.append(
                schemas.BulkUserImportRow(
                    student_id=student_id,
                    name=row.get("name", "").strip(),
                    # A student's login derives from their student_id when the
                    # CSV omits the email: <student_id>@iitm.in.
                    email=(row.get("email", "").strip() or f"{student_id.lower()}@iitm.in"),
                    password=row.get("password", "student@123").strip() or "student@123",
                    department=row.get("department", "").strip() or None,
                    year=row.get("year", "").strip() or None,
                    role=row.get("role", "Student").strip() or "Student",
                    club_id=int(row["club_id"]) if row.get("club_id") and row["club_id"].strip().isdigit() else None,
                )
            )
    elif payload:
        rows_to_process = payload

    results = []
    imported_count = 0
    failed_count = 0

    for idx, r in enumerate(rows_to_process, start=1):
        # Derive a missing email for JSON rows the same way the CSV path does.
        if not r.email and r.student_id:
            r.email = f"{r.student_id.lower()}@iitm.in"
        if not r.email or not r.student_id or not r.name:
            failed_count += 1
            results.append(
                schemas.BulkUserImportRowResult(
                    row=idx,
                    email=r.email or "unknown",
                    status="error",
                    error="Missing required fields: email, student_id, or name",
                )
            )
            continue

        if r.role not in models.ALL_ROLES:
            failed_count += 1
            results.append(
                schemas.BulkUserImportRowResult(
                    row=idx,
                    email=r.email,
                    status="error",
                    error=f"Invalid role: {r.role}. Must be one of {models.ALL_ROLES}",
                )
            )
            continue

        existing = (
            db.query(models.User)
            .filter((models.User.email == r.email) | (models.User.student_id == r.student_id))
            .first()
        )
        if existing:
            failed_count += 1
            results.append(
                schemas.BulkUserImportRowResult(
                    row=idx,
                    email=r.email,
                    status="error",
                    error=f"User with email '{r.email}' or student_id '{r.student_id}' already exists",
                )
            )
            continue

        try:
            user = models.User(
                student_id=r.student_id,
                name=r.name,
                email=r.email,
                password_hash=hash_password(r.password or "student@123"),
                department=r.department,
                year=r.year,
                created_at=datetime.datetime.utcnow(),
            )
            db.add(user)
            db.flush()
            db.add(models.UserRole(user_id=user.id, role=r.role, club_id=r.club_id))
            db.commit()
            imported_count += 1
            results.append(
                schemas.BulkUserImportRowResult(
                    row=idx,
                    email=r.email,
                    status="success",
                    error=None,
                )
            )
        except Exception as e:
            db.rollback()
            failed_count += 1
            results.append(
                schemas.BulkUserImportRowResult(
                    row=idx,
                    email=r.email,
                    status="error",
                    error=str(e),
                )
            )

    return schemas.BulkUserImportOut(
        total=len(rows_to_process),
        imported=imported_count,
        failed=failed_count,
        results=results,
    )

