"""Club finance -- ledger, faculty master budget pool, per-event budgets and
their bill/expense line items. Mirrors the workflow that used to live only in
the frontend's localStorage (Frontend/shared/admin/app.js /
Frontend/club_head_dashboard/app.js) so it survives a reload and is shared
across sessions.

Expense status lifecycle (see models.Expense docstring for the full picture):
    proposal-sourced: Awaiting Bill -> Draft -> Pending President Review
                       -> Pending Faculty Review -> Approved | Rejected
    manual (logged directly by President/Faculty): President-logged starts
                       at Pending Faculty Review; Faculty-logged starts
                       already Approved.
"""
import datetime
import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user, require_roles, user_has_role

router = APIRouter(tags=["Club Finance"])

EDITABLE_EXPENSE_STATUSES = {"Awaiting Bill", "Draft", "Rejected"}
UNREVIEWED_EXPENSE_STATUSES = {"Awaiting Bill", "Draft", "Pending President Review", "Pending Faculty Review"}

# Uploaded bill files land on disk here (Backend/uploads/bills/) and are
# served back out under the /uploads static mount registered in app.main --
# real bytes, not just a filename string, so they survive a reload and can
# actually be opened later.
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "bills"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB, matches the frontend's MAX_UPLOAD_MB


def _get_club_or_404(db: Session, club_id: int) -> models.Club:
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    return club


def _log_transaction(db: Session, club_id: int, txn_type: str, amount: Decimal, description: str = None):
    db.add(models.FinanceTransaction(club_id=club_id, type=txn_type, amount=amount, description=description))


def _get_event_budget_or_404(db: Session, event_budget_id: int) -> models.EventBudget:
    eb = db.query(models.EventBudget).filter(models.EventBudget.id == event_budget_id).first()
    if not eb:
        raise HTTPException(status_code=404, detail="Event budget not found")
    return eb


def _get_expense_or_404(db: Session, expense_id: int) -> models.Expense:
    exp = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    return exp


# ── Club finance ledger ─────────────────────────────────────────────
@router.get("/clubs/{club_id}/finance", response_model=schemas.ClubFinanceOut)
def get_club_finance(club_id: int, db: Session = Depends(get_db)):
    club = _get_club_or_404(db, club_id)
    return schemas.ClubFinanceOut(
        club_id=club.id,
        allotted=club.budget_allotted,
        spent=club.budget_spent,
        remaining=club.budget_allotted - club.budget_spent,
    )


@router.get("/clubs/{club_id}/finance/transactions", response_model=list[schemas.FinanceTransactionOut])
def list_finance_transactions(club_id: int, db: Session = Depends(get_db)):
    _get_club_or_404(db, club_id)
    return (
        db.query(models.FinanceTransaction)
        .filter(models.FinanceTransaction.club_id == club_id)
        .order_by(models.FinanceTransaction.created_at)
        .all()
    )


@router.post(
    "/clubs/{club_id}/finance/transactions",
    response_model=schemas.FinanceTransactionOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": schemas.ErrorOut, "description": "Adjustment exceeds current allotted budget"}},
)
def create_finance_transaction(
    club_id: int,
    payload: schemas.FinanceTransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    club = _get_club_or_404(db, club_id)
    if payload.type not in {"Allocation", "Expense Reimbursement", "Adjustment"}:
        raise HTTPException(status_code=422, detail="type must be Allocation, Expense Reimbursement or Adjustment")

    if payload.type == "Allocation":
        club.budget_allotted += payload.amount
        ledger_amount = payload.amount
    elif payload.type == "Expense Reimbursement":
        club.budget_spent += payload.amount
        ledger_amount = -payload.amount
    else:  # Adjustment
        if payload.amount > club.budget_allotted:
            raise HTTPException(status_code=409, detail="Adjustment can't exceed the club's current allotted budget")
        club.budget_allotted -= payload.amount
        ledger_amount = -payload.amount

    txn = models.FinanceTransaction(
        club_id=club.id,
        type=payload.type,
        amount=ledger_amount,
        description=payload.description,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.post(
    "/finance/transactions",
    response_model=schemas.FinanceTransactionOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": schemas.ErrorOut, "description": "Adjustment exceeds current allotted budget"}},
)
def create_global_finance_transaction(
    payload: schemas.GlobalFinanceTransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    tx_type = "Allocation" if payload.type.lower() == "credit" or payload.type == "Allocation" else "Expense Reimbursement"
    create_payload = schemas.FinanceTransactionCreate(
        type=tx_type,
        amount=payload.amount,
        description=payload.description,
    )
    return create_finance_transaction(payload.club_id, create_payload, db, current_user)


# ── Faculty master budget pool (singleton) ───────────────────────────
def _get_pool(db: Session) -> models.FacultyBudgetPool:
    pool = db.query(models.FacultyBudgetPool).first()
    if not pool:
        pool = models.FacultyBudgetPool(total=0)
        db.add(pool)
        db.commit()
        db.refresh(pool)
    return pool


@router.get("/faculty-budget-pool", response_model=schemas.FacultyBudgetPoolOut)
def get_faculty_budget_pool(db: Session = Depends(get_db)):
    return _get_pool(db)


@router.patch(
    "/faculty-budget-pool",
    response_model=schemas.FacultyBudgetPoolOut,
    responses={409: {"model": schemas.ErrorOut, "description": "Total is below what's already allotted to clubs"}},
)
def update_faculty_budget_pool(
    payload: schemas.FacultyBudgetPoolUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    pool = _get_pool(db)
    total_allotted = db.query(models.Club).with_entities(models.Club.budget_allotted).all()
    already_allotted = sum((row[0] or 0) for row in total_allotted)
    if payload.total < already_allotted:
        raise HTTPException(
            status_code=409,
            detail=f"Total can't be less than the {already_allotted} already allotted across clubs",
        )
    pool.total = payload.total
    db.commit()
    db.refresh(pool)
    return pool


# ── Event budgets ─────────────────────────────────────────────────────
@router.post(
    "/clubs/{club_id}/event-budgets",
    response_model=schemas.EventBudgetOut,
    status_code=status.HTTP_201_CREATED,
)
def create_event_budget(
    club_id: int,
    payload: schemas.EventBudgetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)),
):
    club = _get_club_or_404(db, club_id)
    if payload.allotted and payload.allotted > 0:
        if club.budget_allotted < payload.allotted:
            club.budget_allotted = payload.allotted
    eb = models.EventBudget(
        club_id=club_id, proposal_id=payload.proposal_id, event_name=payload.event_name,
        allotted=payload.allotted, status="Open",
    )
    db.add(eb)
    db.commit()
    db.refresh(eb)
    return eb


@router.get("/clubs/{club_id}/event-budgets", response_model=list[schemas.EventBudgetOut])
def list_event_budgets(club_id: int, db: Session = Depends(get_db)):
    _get_club_or_404(db, club_id)
    return db.query(models.EventBudget).filter(models.EventBudget.club_id == club_id).all()


@router.get(
    "/event-budgets/{event_budget_id}",
    response_model=schemas.EventBudgetOut,
    responses={404: {"model": schemas.ErrorOut, "description": "Event budget not found"}},
)
def get_event_budget(event_budget_id: int, db: Session = Depends(get_db)):
    return _get_event_budget_or_404(db, event_budget_id)


@router.patch(
    "/event-budgets/{event_budget_id}/comment",
    response_model=schemas.EventBudgetOut,
    responses={403: {"model": schemas.ErrorOut}},
)
def update_event_budget_comment(
    event_budget_id: int,
    payload: schemas.EventBudgetCommentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    eb = _get_event_budget_or_404(db, event_budget_id)
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, eb.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can edit this note")
    eb.comment = payload.comment
    db.commit()
    db.refresh(eb)
    return eb


@router.post(
    "/event-budgets/{event_budget_id}/close",
    response_model=schemas.EventBudgetOut,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Event budget not found"},
        409: {"model": schemas.ErrorOut, "description": "Already closed, or has expenses still awaiting review"},
    },
)
def close_event_budget(
    event_budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)),
):
    eb = _get_event_budget_or_404(db, event_budget_id)
    if eb.status == "Closed":
        raise HTTPException(status_code=409, detail="Event budget is already closed")

    unreviewed = (
        db.query(models.Expense)
        .filter(models.Expense.event_budget_id == eb.id, models.Expense.status.in_(UNREVIEWED_EXPENSE_STATUSES))
        .first()
    )
    if unreviewed:
        raise HTTPException(status_code=409, detail="This event still has expenses awaiting review")

    approved_total = (
        db.query(models.Expense)
        .filter(models.Expense.event_budget_id == eb.id, models.Expense.status == "Approved")
        .all()
    )
    spent_total = sum((e.bill_amount or 0) for e in approved_total)
    unused = max(eb.allotted - spent_total, 0)

    eb.status = "Closed"
    eb.closed_on = datetime.date.today()

    if unused > 0:
        club = _get_club_or_404(db, eb.club_id)
        club.budget_spent = max(club.budget_spent - unused, 0)
        unused_str = f"{unused:.2f}".rstrip("0").rstrip(".")
        _log_transaction(
            db, eb.club_id, "Adjustment", unused,
            f"Event [{eb.event_name}] finances closed -- unused budget of {unused_str} returned to club pool",
        )

    db.commit()
    db.refresh(eb)
    return eb


@router.delete(
    "/event-budgets/{event_budget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_event_budget(
    event_budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)),
):
    eb = _get_event_budget_or_404(db, event_budget_id)
    expenses = db.query(models.Expense).filter(models.Expense.event_budget_id == eb.id).all()

    total_to_revert = Decimal("0")
    for exp in expenses:
        if exp.source == "proposal" or exp.status == "Approved":
            total_to_revert += exp.approved_amount or Decimal("0")
        db.delete(exp)

    if total_to_revert > 0:
        club = _get_club_or_404(db, eb.club_id)
        club.budget_spent = max(club.budget_spent - total_to_revert, Decimal("0"))
        _log_transaction(
            db, eb.club_id, "Adjustment", total_to_revert,
            f"Event [{eb.event_name}] budget reverted due to proposal rejection",
        )

    db.delete(eb)
    db.commit()
    return None


# ── Expenses / bills ──────────────────────────────────────────────────
@router.post(
    "/event-budgets/{event_budget_id}/expenses",
    response_model=schemas.ExpenseOut,
    status_code=status.HTTP_201_CREATED,
)
def create_expense(
    event_budget_id: int,
    payload: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)),
):
    eb = _get_event_budget_or_404(db, event_budget_id)
    if payload.type not in {"Self-Procured Expense", "Prize Money", "Judge/Guest Fee"}:
        raise HTTPException(status_code=422, detail="Invalid expense type")

    is_faculty = user_has_role(current_user, models.ROLE_FACULTY_COORDINATOR)

    if payload.source == "proposal":
        expense = models.Expense(
            event_budget_id=eb.id, item_name=payload.item_name, type=payload.type, category=payload.category,
            approved_amount=payload.approved_amount, bill_amount=None, status="Awaiting Bill", source="proposal",
        )
        eb.allotted += payload.approved_amount
        club = _get_club_or_404(db, eb.club_id)
        club.budget_spent += payload.approved_amount  # reserved immediately, ledger logged once billed & approved
        if club.budget_allotted < club.budget_spent:
            club.budget_allotted = club.budget_spent
    else:
        # Manual/ad hoc: the amount is known upfront (President/Faculty type it in directly).
        if is_faculty:
            expense_status = "Approved"
        else:
            expense_status = "Pending Faculty Review"
        expense = models.Expense(
            event_budget_id=eb.id, item_name=payload.item_name, type=payload.type, category=payload.category,
            approved_amount=payload.approved_amount, bill_amount=payload.approved_amount,
            bill_file_name=payload.bill_file_name, status=expense_status, source="manual",
        )
        if is_faculty:
            eb.allotted += payload.approved_amount
            club = _get_club_or_404(db, eb.club_id)
            club.budget_spent += payload.approved_amount
            if club.budget_allotted < club.budget_spent:
                club.budget_allotted = club.budget_spent
            _log_transaction(db, eb.club_id, "Expense Reimbursement", -payload.approved_amount,
                              f"{payload.item_name} ({eb.event_name})")

    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/event-budgets/{event_budget_id}/expenses", response_model=list[schemas.ExpenseOut])
def list_expenses(event_budget_id: int, db: Session = Depends(get_db)):
    _get_event_budget_or_404(db, event_budget_id)
    return db.query(models.Expense).filter(models.Expense.event_budget_id == event_budget_id).all()


def _require_club_head_of_expense(db: Session, current_user: models.User, expense: models.Expense) -> models.EventBudget:
    eb = _get_event_budget_or_404(db, expense.event_budget_id)
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, eb.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can act on this expense")
    if expense.status not in EDITABLE_EXPENSE_STATUSES:
        raise HTTPException(status_code=409, detail=f"Expense is not editable in its current status ({expense.status})")
    return eb


def _volunteer_holds_bill_task(db: Session, current_user: models.User, expense: models.Expense) -> bool:
    return (
        db.query(models.Task)
        .filter(
            models.Task.expense_id == expense.id,
            models.Task.assigned_to == current_user.id,
            models.Task.type == "Bill Upload",
        )
        .first()
        is not None
    )


def _require_can_upload_bill(db: Session, current_user: models.User, expense: models.Expense) -> models.EventBudget:
    """Either this expense's Club Head, or the Volunteer assigned the linked
    Bill Upload task, may upload/edit its bill -- mirrors _can_check_in's
    "assignee or Club Head" pattern for Attendance tasks.
    """
    eb = _get_event_budget_or_404(db, expense.event_budget_id)
    is_club_head = user_has_role(current_user, models.ROLE_CLUB_HEAD, eb.club_id)
    if not is_club_head and not _volunteer_holds_bill_task(db, current_user, expense):
        raise HTTPException(
            status_code=403,
            detail="Only this club's Club Head or the Volunteer assigned to this bill can act on this expense",
        )
    if expense.status not in EDITABLE_EXPENSE_STATUSES:
        raise HTTPException(status_code=409, detail=f"Expense is not editable in its current status ({expense.status})")
    return eb


@router.post(
    "/expenses/{expense_id}/upload-bill",
    response_model=schemas.ExpenseOut,
    responses={403: {"model": schemas.ErrorOut}, 409: {"model": schemas.ErrorOut}},
)
def upload_bill(
    expense_id: int,
    bill_amount: Decimal = Form(..., ge=0),
    file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    expense = _get_expense_or_404(db, expense_id)
    _require_can_upload_bill(db, current_user, expense)

    if file is not None and file.filename:
        contents = file.file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Bill file is too large (max 5MB)")
        suffix = Path(file.filename).suffix
        stored_name = f"{expense_id}_{uuid.uuid4().hex}{suffix}"
        (UPLOAD_DIR / stored_name).write_bytes(contents)
        expense.bill_file_name = file.filename
        expense.bill_file_url = f"/uploads/bills/{stored_name}"

    expense.bill_amount = bill_amount
    expense.status = "Not Utilized" if bill_amount == 0 else "Draft"
    db.commit()
    db.refresh(expense)
    return expense


@router.post(
    "/expenses/{expense_id}/prize-details",
    response_model=schemas.ExpenseOut,
    responses={403: {"model": schemas.ErrorOut}, 409: {"model": schemas.ErrorOut}},
)
def submit_prize_details(
    expense_id: int,
    payload: schemas.ExpensePrizeDetails,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    expense = _get_expense_or_404(db, expense_id)
    _require_club_head_of_expense(db, current_user, expense)

    expense.bill_amount = payload.bill_amount
    expense.prize_student_name = payload.student_name
    expense.prize_student_id = payload.student_id
    expense.prize_department = payload.department
    expense.prize_affiliation = payload.affiliation
    expense.prize_bank_details = payload.bank_details
    expense.status = "Not Utilized" if payload.bill_amount == 0 else "Draft"
    db.commit()
    db.refresh(expense)
    return expense


@router.post(
    "/expenses/{expense_id}/judge-details",
    response_model=schemas.ExpenseOut,
    responses={403: {"model": schemas.ErrorOut}, 409: {"model": schemas.ErrorOut}},
)
def submit_judge_details(
    expense_id: int,
    payload: schemas.ExpenseJudgeDetails,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    expense = _get_expense_or_404(db, expense_id)
    _require_club_head_of_expense(db, current_user, expense)

    expense.bill_amount = payload.bill_amount
    expense.judge_name = payload.judge_name
    expense.judge_contact = payload.judge_contact
    expense.judge_bank_details = payload.bank_details
    expense.status = "Not Utilized" if payload.bill_amount == 0 else "Draft"
    db.commit()
    db.refresh(expense)
    return expense


@router.post(
    "/event-budgets/{event_budget_id}/send-for-processing",
    response_model=list[schemas.ExpenseOut],
    responses={403: {"model": schemas.ErrorOut}},
)
def send_for_processing(
    event_budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_HEAD)),
):
    eb = _get_event_budget_or_404(db, event_budget_id)
    if not user_has_role(current_user, models.ROLE_CLUB_HEAD, eb.club_id):
        raise HTTPException(status_code=403, detail="Only this club's Club Head can send expenses for processing")

    expenses = (
        db.query(models.Expense)
        .filter(models.Expense.event_budget_id == eb.id, models.Expense.status.in_(EDITABLE_EXPENSE_STATUSES))
        .all()
    )
    for exp in expenses:
        if exp.status == "Awaiting Bill":
            exp.bill_amount = 0
            exp.status = "Not Utilized"
        else:
            exp.status = "Pending President Review"
    db.commit()
    return expenses


@router.post(
    "/expenses/{expense_id}/president-review",
    response_model=schemas.ExpenseOut,
    responses={409: {"model": schemas.ErrorOut, "description": "Expense is not Pending President Review"}},
)
def president_review_expense(
    expense_id: int,
    payload: schemas.ExpenseReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_CLUB_PRESIDENT)),
):
    expense = _get_expense_or_404(db, expense_id)
    if expense.status != "Pending President Review":
        raise HTTPException(status_code=409, detail="Expense is not Pending President Review")

    expense.status = "Pending Faculty Review" if payload.approve else "Rejected"
    db.commit()
    db.refresh(expense)
    return expense


@router.post(
    "/expenses/{expense_id}/faculty-review",
    response_model=schemas.ExpenseOut,
    responses={409: {"model": schemas.ErrorOut, "description": "Expense is not Pending Faculty Review"}},
)
def faculty_review_expense(
    expense_id: int,
    payload: schemas.ExpenseReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    expense = _get_expense_or_404(db, expense_id)
    if expense.status != "Pending Faculty Review":
        raise HTTPException(status_code=409, detail="Expense is not Pending Faculty Review")

    if not payload.approve:
        expense.status = "Rejected"
        db.commit()
        db.refresh(expense)
        return expense

    eb = _get_event_budget_or_404(db, expense.event_budget_id)
    bill_amount = expense.bill_amount or 0

    if expense.source == "manual":
        eb.allotted += bill_amount
        club = _get_club_or_404(db, eb.club_id)
        club.budget_spent += bill_amount

    _log_transaction(db, eb.club_id, "Expense Reimbursement", -bill_amount, f"{expense.item_name} ({eb.event_name})")
    expense.status = "Approved"
    db.commit()
    db.refresh(expense)
    return expense


@router.post(
    "/expenses/{expense_id}/reset",
    response_model=schemas.ExpenseOut,
    responses={409: {"model": schemas.ErrorOut, "description": "Expense is not Approved"}},
)
def reset_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    expense = _get_expense_or_404(db, expense_id)
    if expense.status != "Approved":
        raise HTTPException(status_code=409, detail="Only an Approved expense can be reset")

    eb = _get_event_budget_or_404(db, expense.event_budget_id)
    bill_amount = expense.bill_amount or 0

    if expense.source == "manual":
        club = _get_club_or_404(db, eb.club_id)
        club.budget_spent = max(club.budget_spent - bill_amount, 0)
        eb.allotted = max(eb.allotted - bill_amount, 0)
        _log_transaction(db, eb.club_id, "Adjustment", bill_amount, f"Re-opened: {expense.item_name} ({eb.event_name})")

    expense.status = "Pending Faculty Review"
    db.commit()
    db.refresh(expense)
    return expense
