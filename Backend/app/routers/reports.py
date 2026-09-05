"""Report Generation Component (Component 13).

Generates analytical reports for the Faculty Coordinator:
  - club_summary: per-club membership, events, budget overview
  - event_summary: event list with registration / attendance / certificate counts
  - volunteer_summary: per-volunteer task performance across events
  - finance_summary: per-club allocated vs. spent with utilization %
  - comprehensive: all of the above combined

Reports are persisted so historical reports remain available for future
reference.  Each report can also be downloaded as a CSV file.
"""
import csv
import datetime
import io
import json
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, require_roles

router = APIRouter(tags=["Report Generation"])


# ── helpers ──────────────────────────────────────────────────────────

def _safe_decimal(obj):
    """Make a value JSON-serialisable (Decimal -> float)."""
    if isinstance(obj, Decimal):
        return float(obj)
    return obj


def _build_club_summary(db: Session, date_from, date_to) -> dict:
    """Per-club: member count, event count, budget allotted / spent / remaining."""
    clubs = db.query(models.Club).all()
    rows = []
    for club in clubs:
        member_count = db.query(models.ClubMember).filter(
            models.ClubMember.club_id == club.id, models.ClubMember.status == "Active"
        ).count()

        event_q = db.query(models.Event).filter(models.Event.club_id == club.id)
        if date_from:
            event_q = event_q.filter(models.Event.event_date >= date_from)
        if date_to:
            event_q = event_q.filter(models.Event.event_date <= date_to)
        event_count = event_q.count()

        finalized_count = event_q.filter(models.Event.finalized == True).count()

        allocated = _safe_decimal(club.budget_allotted)
        spent = _safe_decimal(club.budget_spent)
        remaining = round(allocated - spent, 2)

        rows.append({
            "club_id": club.id,
            "club_name": club.name,
            "category": club.category,
            "status": club.status,
            "active_members": member_count,
            "events": event_count,
            "finalized_events": finalized_count,
            "budget_allotted": allocated,
            "budget_spent": spent,
            "budget_remaining": remaining,
        })

    return {"clubs": rows, "total_clubs": len(rows)}


def _build_event_summary(db: Session, date_from, date_to) -> dict:
    """Per-event: registrations, checked-in count, tasks, certificates issued."""
    q = db.query(models.Event)
    if date_from:
        q = q.filter(models.Event.event_date >= date_from)
    if date_to:
        q = q.filter(models.Event.event_date <= date_to)
    events = q.order_by(models.Event.event_date.desc()).all()

    rows = []
    for ev in events:
        total_reg = db.query(models.Registration).filter(models.Registration.event_id == ev.id).count()
        checked_in = db.query(models.Registration).filter(
            models.Registration.event_id == ev.id, models.Registration.status == "Checked-In"
        ).count()
        tasks_total = db.query(models.Task).filter(models.Task.event_id == ev.id).count()
        tasks_verified = db.query(models.Task).filter(
            models.Task.event_id == ev.id, models.Task.status == "Verified"
        ).count()
        certs = db.query(models.Certificate).filter(models.Certificate.event_id == ev.id).count()

        club = db.query(models.Club).filter(models.Club.id == ev.club_id).first()
        venue = db.query(models.Venue).filter(models.Venue.id == ev.venue_id).first()

        rows.append({
            "event_id": ev.id,
            "event_name": ev.name,
            "club_name": club.name if club else "N/A",
            "venue_name": venue.name if venue else "N/A",
            "event_date": str(ev.event_date) if ev.event_date else None,
            "published": ev.published,
            "finalized": ev.finalized,
            "registrations": total_reg,
            "checked_in": checked_in,
            "tasks_total": tasks_total,
            "tasks_verified": tasks_verified,
            "certificates_issued": certs,
        })

    return {"events": rows, "total_events": len(rows)}


def _build_volunteer_summary(db: Session, date_from, date_to) -> dict:
    """Per-volunteer: events served, tasks assigned / verified, certificates earned."""
    volunteer_role_subq = (
        db.query(models.UserRole.user_id)
        .filter(models.UserRole.role == models.ROLE_VOLUNTEER)
        .subquery()
    )
    volunteer_ids = [row[0] for row in db.query(volunteer_role_subq.c.user_id).distinct().all()]

    rows = []
    for vid in volunteer_ids:
        user = db.query(models.User).filter(models.User.id == vid).first()
        if not user:
            continue

        task_q = db.query(models.Task).filter(models.Task.assigned_to == vid)
        if date_from:
            task_q = task_q.join(models.Event, models.Task.event_id == models.Event.id)
            task_q = task_q.filter(models.Event.event_date >= date_from)
        if date_to:
            task_q = task_q.join(models.Event, models.Task.event_id == models.Event.id)
            task_q = task_q.filter(models.Event.event_date <= date_to)

        tasks_total = task_q.count()
        tasks_verified = task_q.filter(models.Task.status == "Verified").count()
        tasks_submitted = task_q.filter(models.Task.status == "Submitted").count()

        event_ids_served = [row[0] for row in task_q.with_entities(models.Task.event_id).distinct().all()]

        cert_q = db.query(models.Certificate).filter(models.Certificate.user_id == vid)
        if date_from:
            cert_q = cert_q.join(models.Event, models.Certificate.event_id == models.Event.id)
            cert_q = cert_q.filter(models.Event.event_date >= date_from)
        if date_to:
            cert_q = cert_q.join(models.Event, models.Certificate.event_id == models.Event.id)
            cert_q = cert_q.filter(models.Event.event_date <= date_to)
        certs = cert_q.count()

        clubs_served = db.query(models.UserRole).filter(
            models.UserRole.user_id == vid, models.UserRole.role == models.ROLE_VOLUNTEER
        ).count()

        rows.append({
            "user_id": vid,
            "name": user.name,
            "student_id": user.student_id,
            "clubs_served": clubs_served,
            "events_served": len(event_ids_served),
            "tasks_total": tasks_total,
            "tasks_verified": tasks_verified,
            "tasks_submitted": tasks_submitted,
            "certificates_earned": certs,
        })

    rows.sort(key=lambda r: r["tasks_verified"], reverse=True)
    return {"volunteers": rows, "total_volunteers": len(rows)}


def _build_finance_summary(db: Session, date_from, date_to) -> dict:
    """Per-club: budget allotted, spent, remaining, utilization %, event budgets."""
    clubs = db.query(models.Club).all()
    pool = db.query(models.FacultyBudgetPool).first()
    master_pool_total = _safe_decimal(pool.total) if pool else 0

    rows = []
    for club in clubs:
        allocated = _safe_decimal(club.budget_allotted)
        spent = _safe_decimal(club.budget_spent)
        remaining = round(allocated - spent, 2)
        utilization = round((spent / allocated) * 100, 1) if allocated > 0 else 0

        ev_budgets = db.query(models.EventBudget).filter(models.EventBudget.club_id == club.id)
        ev_budget_count = ev_budgets.count()
        ev_budget_closed = ev_budgets.filter(models.EventBudget.status == "Closed").count()

        expense_q = db.query(models.Expense).join(
            models.EventBudget, models.Expense.event_budget_id == models.EventBudget.id
        ).filter(models.EventBudget.club_id == club.id)
        if date_from:
            expense_q = expense_q.filter(models.Expense.created_at >= datetime.datetime.combine(date_from, datetime.time.min))
        if date_to:
            expense_q = expense_q.filter(models.Expense.created_at <= datetime.datetime.combine(date_to, datetime.time.max))
        total_expenses = expense_q.count()
        approved_expenses = expense_q.filter(models.Expense.status == "Approved").count()

        rows.append({
            "club_id": club.id,
            "club_name": club.name,
            "budget_allotted": allocated,
            "budget_spent": spent,
            "budget_remaining": remaining,
            "utilization_pct": utilization,
            "event_budgets_total": ev_budget_count,
            "event_budgets_closed": ev_budget_closed,
            "expenses_total": total_expenses,
            "expenses_approved": approved_expenses,
        })

    total_allocated = sum(r["budget_allotted"] for r in rows)
    total_spent = sum(r["budget_spent"] for r in rows)

    return {
        "master_pool_total": master_pool_total,
        "clubs": rows,
        "total_allocated": total_allocated,
        "total_spent": total_spent,
        "total_remaining": round(total_allocated - total_spent, 2),
    }


def _build_report(db: Session, report_type: str, date_from, date_to) -> dict:
    builders = {
        "club_summary": _build_club_summary,
        "event_summary": _build_event_summary,
        "volunteer_summary": _build_volunteer_summary,
        "finance_summary": _build_finance_summary,
    }
    if report_type == "comprehensive":
        data = {}
        for key, fn in builders.items():
            data[key] = fn(db, date_from, date_to)
        return data
    return builders[report_type](db, date_from, date_to)


REPORT_TITLES = {
    "club_summary": "Club Summary Report",
    "event_summary": "Event Summary Report",
    "volunteer_summary": "Volunteer Performance Report",
    "finance_summary": "Finance Summary Report",
    "comprehensive": "Comprehensive Analytics Report",
}


def _to_csv(report_type: str, data: dict) -> str:
    """Flatten the report data dict into a CSV string."""
    buf = io.StringIO()

    if report_type == "comprehensive":
        for section_key, section_data in data.items():
            writer = csv.writer(buf)
            writer.writerow([REPORT_TITLES.get(section_key, section_key)])
            _write_section_csv(writer, section_key, section_data)
            writer.writerow([])
    else:
        writer = csv.writer(buf)
        _write_section_csv(writer, report_type, data)
    return buf.getvalue()


def _write_section_csv(writer, report_type: str, data: dict):
    rows = data.get("clubs") or data.get("events") or data.get("volunteers") or []
    if not rows:
        writer.writerow(["No data available"])
        return
    headers = list(rows[0].keys())
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(h, "") for h in headers])


# ── endpoints ────────────────────────────────────────────────────────

@router.post(
    "/reports",
    response_model=schemas.ReportOut,
    status_code=201,
    responses={422: {"model": schemas.ErrorOut}},
)
def generate_report(
    body: schemas.ReportCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    """Generate and persist an analytics report.  The Faculty Coordinator
    can request a specific report type with an optional date range filter.
    """
    if body.report_type not in schemas.REPORT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid report_type '{body.report_type}'. Must be one of: {', '.join(schemas.REPORT_TYPES)}",
        )

    data = _build_report(db, body.report_type, body.date_from, body.date_to)
    title = REPORT_TITLES[body.report_type]
    if body.date_from or body.date_to:
        suffix = f" ({body.date_from or '...'} to {body.date_to or '...'})"
        title += suffix

    report = models.Report(
        report_type=body.report_type,
        title=title,
        date_from=body.date_from,
        date_to=body.date_to,
        data_json=json.dumps(data, default=str),
        generated_by=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return schemas.ReportOut(
        id=report.id,
        report_type=report.report_type,
        title=report.title,
        date_from=report.date_from,
        date_to=report.date_to,
        data=data,
        generated_by=report.generated_by,
        created_at=report.created_at,
    )


@router.get("/reports", response_model=list[schemas.ReportOut])
def list_reports(
    report_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    """List all previously generated reports, optionally filtered by type."""
    q = db.query(models.Report).order_by(models.Report.created_at.desc())
    if report_type:
        q = q.filter(models.Report.report_type == report_type)
    reports = q.all()

    return [
        schemas.ReportOut(
            id=r.id,
            report_type=r.report_type,
            title=r.title,
            date_from=r.date_from,
            date_to=r.date_to,
            data=json.loads(r.data_json),
            generated_by=r.generated_by,
            created_at=r.created_at,
        )
        for r in reports
    ]


@router.get(
    "/reports/{report_id}",
    response_model=schemas.ReportOut,
    responses={404: {"model": schemas.ErrorOut}},
)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    """Retrieve a single report by ID."""
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return schemas.ReportOut(
        id=report.id,
        report_type=report.report_type,
        title=report.title,
        date_from=report.date_from,
        date_to=report.date_to,
        data=json.loads(report.data_json),
        generated_by=report.generated_by,
        created_at=report.created_at,
    )


@router.get(
    "/reports/{report_id}/download",
    responses={404: {"model": schemas.ErrorOut}},
)
def download_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    """Download a report as a CSV file."""
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    data = json.loads(report.data_json)
    csv_content = _to_csv(report.report_type, data)
    filename = f"{report.report_type}_{report.id}.csv"

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
