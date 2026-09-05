import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models import ALL_ROLES


# ── Auth ──────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    student_id: str
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    department: Optional[str] = None
    year: Optional[str] = None
    role: str = Field(description=f"One of: {', '.join(ALL_ROLES)}")
    club_id: Optional[int] = Field(default=None, description="Required for ClubHead/ClubPresident roles")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class RoleOut(BaseModel):
    role: str
    club_id: Optional[int] = None

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: int
    student_id: str
    name: str
    email: EmailStr
    department: Optional[str] = None
    year: Optional[str] = None
    roles: List[RoleOut] = []

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Clubs & Membership ────────────────────────────────────────────
class ClubCreate(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    history: Optional[str] = None
    achievements: List[str] = []
    club_head_email: Optional[EmailStr] = Field(
        default=None, description="Defaults to <clubname-slug>@iitm.in if omitted"
    )
    club_head_password: Optional[str] = Field(
        default=None, min_length=6, description="Defaults to <clubname-slug>123 if omitted"
    )


class ClubOut(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    history: Optional[str] = None
    achievements: List[str] = []
    status: str
    president_id: Optional[int] = None
    faculty_coordinator_id: Optional[int] = None
    budget_allotted: Decimal = Decimal(0)
    budget_spent: Decimal = Decimal(0)

    class Config:
        from_attributes = True

    @staticmethod
    def from_orm_club(club):
        return ClubOut(
            id=club.id,
            name=club.name,
            category=club.category,
            description=club.description,
            history=club.history,
            achievements=club.achievements.split("|") if club.achievements else [],
            status=club.status,
            president_id=club.president_id,
            faculty_coordinator_id=club.faculty_coordinator_id,
            budget_allotted=club.budget_allotted or Decimal(0),
            budget_spent=club.budget_spent or Decimal(0),
        )


class ClubHeadCredentialsOut(BaseModel):
    email: str
    password: str
    note: str = "Share these with the incoming Club Head -- this is the only time the password is returned in plaintext."


class ClubCreateResponse(BaseModel):
    club: ClubOut
    club_head: ClubHeadCredentialsOut


class ClubReview(BaseModel):
    approve: bool


class ClubUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    history: Optional[str] = None


class ClubHeadPasswordReset(BaseModel):
    password: str = Field(min_length=6)


class ClubHeadPasswordResetOut(BaseModel):
    email: str
    password: str
    note: str = "Share this with the Club Head -- this is the only time the new password is returned in plaintext."


class MembershipApply(BaseModel):
    club_id: int


class ClubMemberOut(BaseModel):
    id: int
    club_id: int
    user_id: int
    status: str
    joined_on: Optional[datetime.date] = None
    name: Optional[str] = None
    student_id: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None

    class Config:
        from_attributes = True

    @staticmethod
    def from_orm_member(member):
        u = member.user
        return ClubMemberOut(
            id=member.id,
            club_id=member.club_id,
            user_id=member.user_id,
            status=member.status,
            joined_on=member.joined_on,
            name=u.name if u else None,
            student_id=u.student_id if u else None,
            email=u.email if u else None,
            department=u.department if u else None,
            year=u.year if u else None,
        )


class DomainCreate(BaseModel):
    title: str
    recruitment_open: bool = False


class DomainOut(BaseModel):
    id: int
    club_id: int
    title: str
    recruitment_open: bool
    opened_on: Optional[datetime.date] = None

    class Config:
        from_attributes = True


class VolunteerApplicationCreate(BaseModel):
    domain_id: int
    note: Optional[str] = None


class VolunteerApplicationOut(BaseModel):
    id: int
    club_id: int
    domain_id: int
    applicant_id: int
    applied_on: datetime.date
    status: str
    note: Optional[str] = None
    applicant_name: Optional[str] = None
    applicant_student_id: Optional[str] = None
    applicant_email: Optional[str] = None

    class Config:
        from_attributes = True

    @staticmethod
    def from_orm_application(application):
        a = application.applicant
        return VolunteerApplicationOut(
            id=application.id,
            club_id=application.club_id,
            domain_id=application.domain_id,
            applicant_id=application.applicant_id,
            applied_on=application.applied_on,
            status=application.status,
            note=application.note,
            applicant_name=a.name if a else None,
            applicant_student_id=a.student_id if a else None,
            applicant_email=a.email if a else None,
        )


class ApplicationReview(BaseModel):
    approve: bool


# ── Venues & Inventory ─────────────────────────────────────────────
class VenueCreate(BaseModel):
    name: str
    capacity: Optional[int] = None
    location: Optional[str] = None
    facilities: Optional[str] = None
    requirements: Optional[str] = None


class VenueOut(BaseModel):
    id: int
    name: str
    capacity: Optional[int] = None
    location: Optional[str] = None
    facilities: Optional[str] = None
    requirements: Optional[str] = None

    class Config:
        from_attributes = True


class VenueUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    location: Optional[str] = None
    facilities: Optional[str] = None
    requirements: Optional[str] = None


class InventoryItemCreate(BaseModel):
    code: str
    name: str
    category: Optional[str] = None
    total_stock: int
    available_stock: Optional[int] = None


class InventoryItemOut(BaseModel):
    id: int
    code: str
    name: str
    category: Optional[str] = None
    total_stock: int
    available_stock: int
    status: str


class InventoryItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    total_stock: Optional[int] = None
    available_stock: Optional[int] = None

class InventoryUsageCreate(BaseModel):
    item_id: int
    event_id: Optional[int] = None
    club_id: Optional[int] = None
    event_name: Optional[str] = None
    venue_id: Optional[int] = None
    location: Optional[str] = None
    quantity: int
    booking_date: Optional[datetime.date] = None
    time_slot: Optional[str] = None
    status: Optional[str] = "Booked"


class InventoryUsageOut(BaseModel):
    id: int
    item_id: int
    item_name: Optional[str] = None
    event_id: Optional[int] = None
    club_id: Optional[int] = None
    club_name: Optional[str] = None
    event_name: Optional[str] = None
    venue_id: Optional[int] = None
    location: Optional[str] = None
    quantity: int
    booking_date: Optional[datetime.date] = None
    time_slot: Optional[str] = None
    checked_out_at: Optional[datetime.datetime] = None
    returned_at: Optional[datetime.datetime] = None
    status: str

    class Config:
        from_attributes = True


class BookingCreate(BaseModel):
    venue_id: int
    event_id: Optional[int] = None
    club_id: Optional[int] = None
    event_name: Optional[str] = None
    booking_date: datetime.date
    time_slot: Optional[str] = None
    requirements: Optional[list[str] | str] = None
    status: Optional[str] = "Confirmed"


class BookingStatusUpdate(BaseModel):
    status: str


class BookingOut(BaseModel):
    id: int
    venue_id: int
    event_id: Optional[int] = None
    club_id: Optional[int] = None
    club_name: Optional[str] = None
    venue_name: Optional[str] = None
    event_name: Optional[str] = None
    booking_date: datetime.date
    time_slot: Optional[str] = None
    requirements: Optional[list[str]] = None
    status: str

    class Config:
        from_attributes = True


# ── Event Proposals & Events ───────────────────────────────────────
class EventProposalCreate(BaseModel):
    club_id: int
    event_name: str
    description: Optional[str] = None
    schedule_date: Optional[datetime.date] = None
    time_slot: Optional[str] = None
    estimated_participants: Optional[int] = None
    capacity_required: Optional[int] = None
    line_items_json: Optional[str] = None
    venue_id: Optional[int] = None
    budget_estimate: Optional[Decimal] = None


class EventProposalOut(BaseModel):
    id: int
    club_id: int
    event_name: str
    description: Optional[str] = None
    schedule_date: Optional[datetime.date] = None
    time_slot: Optional[str] = None
    estimated_participants: Optional[int] = None
    capacity_required: Optional[int] = None
    line_items_json: Optional[str] = None
    venue_id: Optional[int] = None
    budget_estimate: Optional[Decimal] = None
    status: str
    submitted_by: Optional[int] = None
    rejection_reason: Optional[str] = None

    class Config:
        from_attributes = True


class ProposalReview(BaseModel):
    approve: bool
    reason: Optional[str] = None


class ProposalRevisionRequest(BaseModel):
    reason: str


class EventProposalUpdate(BaseModel):
    club_id: Optional[int] = None
    event_name: Optional[str] = None
    description: Optional[str] = None
    schedule_date: Optional[datetime.date] = None
    time_slot: Optional[str] = None
    estimated_participants: Optional[int] = None
    capacity_required: Optional[int] = None
    line_items_json: Optional[str] = None
    venue_id: Optional[int] = None
    budget_estimate: Optional[Decimal] = None


class EventOut(BaseModel):
    id: int
    proposal_id: Optional[int] = None
    club_id: int
    name: str
    description: Optional[str] = None
    venue_id: Optional[int] = None
    event_date: Optional[datetime.date] = None
    registration_deadline: Optional[datetime.date] = None
    published: bool
    finalized: bool

    class Config:
        from_attributes = True


class ErrorOut(BaseModel):
    detail: str


# ── Task management (Epic 4) ────────────────────────────────────────
TASK_TYPES = ["Attendance", "Procurement", "Bill Upload", "Custom"]


class TaskCreate(BaseModel):
    assigned_to: int = Field(description="User id of the volunteer this task is assigned to")
    type: str = Field(description=f"One of: {', '.join(TASK_TYPES)}")
    title: str
    description: Optional[str] = None
    priority: str = Field(default="Medium", description="One of: Low, Medium, High")
    deadline: Optional[datetime.date] = None
    expense_id: Optional[int] = Field(
        default=None, description="Only for type='Bill Upload' -- the Expense line item this task covers"
    )


class TaskProofSubmit(BaseModel):
    proof_text: Optional[str] = None
    proof_file_name: Optional[str] = None


class TaskReview(BaseModel):
    verified: bool
    comment: Optional[str] = None


class TaskOut(BaseModel):
    id: int
    event_id: int
    club_id: int
    assigned_to: int
    assigned_by: int
    type: str
    title: str
    description: Optional[str] = None
    priority: str
    deadline: Optional[datetime.date] = None
    expense_id: Optional[int] = None
    status: str
    proof_text: Optional[str] = None
    proof_file_name: Optional[str] = None
    submitted_at: Optional[datetime.datetime] = None
    review_comment: Optional[str] = None
    reviewed_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


# ── QR attendance (Epic 5) ──────────────────────────────────────────
class RegistrationOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    qr_token: str
    status: str
    registered_at: datetime.datetime
    checked_in_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


# ── F-5.3.3: Real-time attendance stats ───────────────────────────
class AttendanceStatsOut(BaseModel):
    event_id: int
    total_registered: int
    checked_in: int
    pending: int
    last_check_in_at: Optional[datetime.datetime] = None


# ── Certification & budget analytics (Epic 6) ───────────────────────
class CertificateOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    reason: str
    issued_at: datetime.datetime

    class Config:
        from_attributes = True


class FinalizeEventOut(BaseModel):
    event: EventOut
    certificates_issued: List[CertificateOut]


class ClubBudgetOverview(BaseModel):
    club_id: int
    club_name: str
    allocated: Decimal
    spent: Decimal


class BudgetOverviewOut(BaseModel):
    clubs: List[ClubBudgetOverview]
    total_allocated: Decimal
    total_spent: Decimal
    active_bookings: int
    inventory_on_loan: int


# ── LLM-assisted features ──────────────────────────────────────────
class NotificationIn(BaseModel):
    message: str
    type: Optional[str] = None


class NotificationDigestRequest(BaseModel):
    notifications: List[NotificationIn]


class NotificationDigestResponse(BaseModel):
    source: str = Field(description='"gemini" if the LLM produced the digest, "heuristic" otherwise')
    summary: str
    highlights: List[str] = []


# ── Event Proposal Assistant ──────────────────────────────────────
class EventProposalAssistRequest(BaseModel):
    """Club Head provides the basic idea; AI generates the full proposal content."""
    event_name: str = Field(min_length=1, description="Name / title of the proposed event")
    objective: str = Field(min_length=1, description="Purpose or goal of the event")
    expected_participants: int = Field(gt=0, description="Estimated number of attendees")


class AgendaItem(BaseModel):
    time_slot: str = Field(description="e.g. '10:00 - 10:30'")
    activity: str
    description: Optional[str] = None


class InventoryItemSuggestion(BaseModel):
    item: str
    quantity: int
    reason: Optional[str] = None


class TimelinePhase(BaseModel):
    phase: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None


class EventProposalAssistResponse(BaseModel):
    source: str = Field(description='"gemini" if the LLM produced the content, "heuristic" otherwise')
    event_description: str
    agenda: List[AgendaItem] = []
    budget_estimate: float = Field(description="Estimated total budget in INR")
    required_inventory: List[InventoryItemSuggestion] = []
    volunteers_required: int
    risk_assessment: str
    timeline: List[TimelinePhase] = []


# ── Club finance ──────────────────────────────────────────────────
class ClubFinanceOut(BaseModel):
    club_id: int
    allotted: Decimal
    spent: Decimal
    remaining: Decimal


class FinanceTransactionCreate(BaseModel):
    type: str = Field(description="One of: Allocation, Expense Reimbursement, Adjustment")
    amount: Decimal = Field(gt=0, description="Unsigned magnitude; sign is derived server-side from `type`")
    description: Optional[str] = None


class FinanceTransactionOut(BaseModel):
    id: int
    club_id: int
    type: str
    amount: Decimal
    description: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class FacultyBudgetPoolOut(BaseModel):
    total: Decimal


class FacultyBudgetPoolUpdate(BaseModel):
    total: Decimal = Field(ge=0)


class EventBudgetCreate(BaseModel):
    event_name: str
    allotted: Decimal = Field(ge=0)
    proposal_id: Optional[int] = None


class EventBudgetOut(BaseModel):
    id: int
    club_id: int
    proposal_id: Optional[int] = None
    event_name: str
    allotted: Decimal
    status: str
    closed_on: Optional[datetime.date] = None
    comment: Optional[str] = None

    class Config:
        from_attributes = True


class EventBudgetCommentUpdate(BaseModel):
    comment: Optional[str] = None


class ExpenseCreate(BaseModel):
    item_name: str
    type: str = Field(description="One of: Self-Procured Expense, Prize Money, Judge/Guest Fee")
    category: Optional[str] = None
    approved_amount: Decimal = Field(ge=0)
    source: str = Field(default="proposal", description="proposal or manual")
    bill_file_name: Optional[str] = Field(
        default=None, description="manual entries only -- the amount/file are both known upfront"
    )


class ExpenseOut(BaseModel):
    id: int
    event_budget_id: int
    item_name: str
    type: str
    category: Optional[str] = None
    approved_amount: Decimal
    bill_amount: Optional[Decimal] = None
    bill_file_name: Optional[str] = None
    bill_file_url: Optional[str] = None
    status: str
    source: str
    comment: Optional[str] = None
    prize_student_name: Optional[str] = None
    prize_student_id: Optional[str] = None
    prize_department: Optional[str] = None
    prize_affiliation: Optional[str] = None
    prize_bank_details: Optional[str] = None
    judge_name: Optional[str] = None
    judge_contact: Optional[str] = None
    judge_bank_details: Optional[str] = None

    class Config:
        from_attributes = True


class ExpensePrizeDetails(BaseModel):
    bill_amount: Decimal = Field(ge=0)
    student_name: Optional[str] = None
    student_id: Optional[str] = None
    department: Optional[str] = None
    affiliation: Optional[str] = None
    bank_details: Optional[str] = None


class ExpenseJudgeDetails(BaseModel):
    bill_amount: Decimal = Field(ge=0)
    judge_name: Optional[str] = None
    judge_contact: Optional[str] = None
    bank_details: Optional[str] = None


class ExpenseReview(BaseModel):
    approve: bool


# ── Bulk Import & Student Detail Schemas ───────────────────────────
class BulkUserImportRow(BaseModel):
    student_id: str
    name: str
    email: Optional[EmailStr] = None
    password: Optional[str] = "student@123"
    department: Optional[str] = None
    year: Optional[str] = None
    role: Optional[str] = "Student"
    club_id: Optional[int] = None


class BulkUserImportRowResult(BaseModel):
    row: int
    email: str
    status: str  # "success" or "error"
    error: Optional[str] = None


class BulkUserImportOut(BaseModel):
    total: int
    imported: int
    failed: int
    results: List[BulkUserImportRowResult]


class StudentMembershipOut(BaseModel):
    club_id: int
    club_name: str
    role: str

    class Config:
        from_attributes = True


class StudentRegistrationOut(BaseModel):
    event_id: int
    event_name: str
    status: str
    qr_token: str
    checked_in_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class StudentCertificateOut(BaseModel):
    id: int
    event_id: int
    event_name: str
    reason: str
    issued_at: datetime.datetime

    class Config:
        from_attributes = True


class StudentCreateManual(BaseModel):
    student_id: str
    name: str
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=6)
    department: Optional[str] = None
    year: Optional[str] = None


class StudentDetailOut(BaseModel):
    id: int
    student_id: str
    name: str
    email: EmailStr
    department: Optional[str] = None
    year: Optional[str] = None
    created_at: Optional[datetime.datetime] = None
    roles: List[str] = []
    memberships: List[StudentMembershipOut] = []
    registrations: List[StudentRegistrationOut] = []
    certificates: List[StudentCertificateOut] = []

    class Config:
        from_attributes = True


class BulkVenueItemResult(BaseModel):
    index: int
    name: str
    status: str
    venue: Optional[VenueOut] = None
    error: Optional[str] = None


class BulkVenueOut(BaseModel):
    total: int
    created: int
    failed: int
    results: List[BulkVenueItemResult]


class BulkInventoryItemResult(BaseModel):
    index: int
    name: str
    status: str
    inventory_item: Optional[InventoryItemOut] = None
    error: Optional[str] = None


class BulkInventoryOut(BaseModel):
    total: int
    created: int
    failed: int
    results: List[BulkInventoryItemResult]


class GlobalFinanceTransactionCreate(BaseModel):
    club_id: int
    type: str = Field(description="Credit or Debit")
    amount: Decimal = Field(gt=0)
    description: Optional[str] = None


# ── Report Generation (Component 13) ───────────────────────────────
REPORT_TYPES = ["club_summary", "event_summary", "volunteer_summary", "finance_summary", "comprehensive"]


class ReportCreate(BaseModel):
    report_type: str = Field(description=f"One of: {', '.join(REPORT_TYPES)}")
    date_from: Optional[datetime.date] = None
    date_to: Optional[datetime.date] = None


class ReportOut(BaseModel):
    id: int
    report_type: str
    title: str
    date_from: Optional[datetime.date] = None
    date_to: Optional[datetime.date] = None
    data: Optional[dict] = None
    generated_by: int
    created_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


# ── Club Chat ──────────────────────────────────────────────────────
class ChatMessageCreate(BaseModel):
    student_id: Optional[str] = None
    text: str


class ChatMessageOut(BaseModel):
    id: int
    club_id: int
    student_id: Optional[str] = None
    sender_id: int
    sender_role: str
    text: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# ── Notifications ──────────────────────────────────────────────────
class NotificationCreate(BaseModel):
    message: str


class NotificationOut(BaseModel):
    id: int
    user_id: int
    message: str
    read: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True

