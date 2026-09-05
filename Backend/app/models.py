import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base

# Role names mirrored from Documents/team-103-milestone-1-2/er-dbml.txt::roles
ROLE_STUDENT = "Student"
ROLE_VOLUNTEER = "Volunteer"
ROLE_CLUB_HEAD = "ClubHead"
ROLE_CLUB_PRESIDENT = "ClubPresident"
ROLE_FACULTY_COORDINATOR = "FacultyCoordinator"
ALL_ROLES = [ROLE_STUDENT, ROLE_VOLUNTEER, ROLE_CLUB_HEAD, ROLE_CLUB_PRESIDENT, ROLE_FACULTY_COORDINATOR]


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    department = Column(String)
    year = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role", "club_id", name="uq_user_role_club"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, nullable=False)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True)

    user = relationship("User", back_populates="roles")
    club = relationship("Club")


class Club(Base):
    __tablename__ = "clubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    category = Column(String)
    description = Column(Text)
    history = Column(Text)
    achievements = Column(Text)  # "|"-joined list, see schemas.ClubOut.achievements
    status = Column(String, default="Pending")  # Pending, Approved, Rejected
    president_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    faculty_coordinator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Running finance totals -- kept in sync by app.routers.finance on every
    # ledger-affecting action; FinanceTransaction is the audit trail behind
    # these two numbers (see models.FinanceTransaction).
    budget_allotted = Column(Numeric, nullable=False, default=0)
    budget_spent = Column(Numeric, nullable=False, default=0)


class ClubMember(Base):
    __tablename__ = "club_members"
    __table_args__ = (UniqueConstraint("club_id", "user_id", name="uq_club_member"),)

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="Pending")  # Pending, Active, Rejected
    joined_on = Column(Date, nullable=True)

    club = relationship("Club")
    user = relationship("User")


class Domain(Base):
    __tablename__ = "domains"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    title = Column(String, nullable=False)
    recruitment_open = Column(Boolean, default=False)
    opened_on = Column(Date, nullable=True)

    club = relationship("Club")


class VolunteerApplication(Base):
    __tablename__ = "volunteer_applications"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    domain_id = Column(Integer, ForeignKey("domains.id"), nullable=False)
    applicant_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    applied_on = Column(Date, nullable=False, default=datetime.date.today)
    status = Column(String, default="Pending")  # Pending, Selected, Rejected
    note = Column(Text)

    club = relationship("Club")
    domain = relationship("Domain")
    applicant = relationship("User")


class Venue(Base):
    __tablename__ = "venues"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    capacity = Column(Integer)
    location = Column(String)
    facilities = Column(Text)
    requirements = Column(Text)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String)
    total_stock = Column(Integer, nullable=False)
    available_stock = Column(Integer, nullable=False)
    status = Column(String, default="In Stock")  # In Stock, Low Stock, Out of Stock


class EventProposal(Base):
    __tablename__ = "event_proposals"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    event_name = Column(String, nullable=False)
    description = Column(Text)
    schedule_date = Column(Date)
    time_slot = Column(String, nullable=True)
    estimated_participants = Column(Integer, nullable=True)
    capacity_required = Column(Integer, nullable=True)
    line_items_json = Column(Text, nullable=True)
    venue_id = Column(Integer, ForeignKey("venues.id"), nullable=True)
    budget_estimate = Column(Numeric)
    status = Column(String, default="Draft")
    # Draft, Pending President Review, Pending Faculty Approval, Approved, Rejected
    submitted_by = Column(Integer, ForeignKey("users.id"))
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    club = relationship("Club")
    venue = relationship("Venue")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, ForeignKey("event_proposals.id"), unique=True, nullable=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    venue_id = Column(Integer, ForeignKey("venues.id"), nullable=True)
    event_date = Column(Date)
    event_time = Column(String)
    registration_deadline = Column(Date, nullable=True)
    published = Column(Boolean, default=False)
    finalized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    club = relationship("Club")
    venue = relationship("Venue")


class Booking(Base):
    __tablename__ = "venue_booking"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id"), nullable=False)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True)
    event_name = Column(String, nullable=True)
    booking_date = Column(Date, nullable=False)
    time_slot = Column(String, nullable=True)
    requirements = Column(Text, nullable=True)
    status = Column(String, default="Confirmed")  # Reserved, Confirmed, Released, Completed, Cancelled

    venue = relationship("Venue")
    event = relationship("Event")
    club = relationship("Club")


class InventoryUsage(Base):
    __tablename__ = "inventory_usage"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    event_name = Column(String, nullable=True)
    # Preferred: link straight to the venue being used (known at proposal-
    # approval time, before an Event row necessarily exists). `location` is
    # kept only as free text for "Other Purpose" allocations that have no
    # venue at all -- see _inventory_usage_to_schema, which prefers venue_id.
    venue_id = Column(Integer, ForeignKey("venues.id"), nullable=True)
    location = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    booking_date = Column(Date, nullable=True)
    time_slot = Column(String, nullable=True)
    checked_out_at = Column(DateTime, nullable=True)
    returned_at = Column(DateTime, nullable=True)
    status = Column(String, default="Booked")

    event = relationship("Event")
    item = relationship("InventoryItem")
    club = relationship("Club")
    venue = relationship("Venue")


# ── Club finance ────────────────────────────────────────────────────
class FinanceTransaction(Base):
    """Immutable ledger line for a club's budget. `amount` is signed:
    positive for inflows (allocations, refunds of unused/rolled-back
    spend), negative for outflows (expenses, fines/decreases) -- mirrors
    the ledger display convention the frontend already used locally.
    """
    __tablename__ = "finance_transactions"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    type = Column(String, nullable=False)  # Allocation, Expense Reimbursement, Adjustment
    amount = Column(Numeric, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    club = relationship("Club")


class FacultyBudgetPool(Base):
    """Singleton row -- the master pool the Faculty Coordinator allocates
    club budgets out of. Seeded once; see app.seed.
    """
    __tablename__ = "faculty_budget_pool"

    id = Column(Integer, primary_key=True, index=True)
    total = Column(Numeric, nullable=False, default=0)


class EventBudget(Base):
    __tablename__ = "event_budgets"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    proposal_id = Column(Integer, ForeignKey("event_proposals.id"), nullable=True)
    event_name = Column(String, nullable=False)
    allotted = Column(Numeric, nullable=False, default=0)
    status = Column(String, default="Open")  # Open, Closed
    closed_on = Column(Date, nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    club = relationship("Club")
    proposal = relationship("EventProposal")


class Expense(Base):
    """A single bill/payout line item under an EventBudget. Status
    lifecycle (see app.routers.finance for the transition rules):

    proposal-sourced:  Awaiting Bill -> Draft -> Pending President Review
                        -> Pending Faculty Review -> Approved | Rejected
                        (Rejected loops back to Draft-editable by Club Head)
                        Awaiting Bill can also resolve straight to
                        Not Utilized (nothing spent).
    manual (logged directly by President/Faculty): President-logged starts
                        at Pending Faculty Review; Faculty-logged starts
                        already Approved.
    """
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    event_budget_id = Column(Integer, ForeignKey("event_budgets.id"), nullable=False)
    item_name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # Self-Procured Expense, Prize Money, Judge/Guest Fee
    category = Column(String)
    approved_amount = Column(Numeric, nullable=False, default=0)
    bill_amount = Column(Numeric, nullable=True)
    bill_file_name = Column(String, nullable=True)
    # Servable path (e.g. "/uploads/bills/<stored-name>") for the actual bytes
    # saved by app.routers.finance.upload_bill -- bill_file_name alone is just
    # the original filename for display, not something anyone can open.
    bill_file_url = Column(String, nullable=True)
    status = Column(String, default="Awaiting Bill")
    source = Column(String, default="manual")  # proposal, manual
    comment = Column(Text, nullable=True)

    # Prize Money payout details (only set when type == "Prize Money")
    prize_student_name = Column(String, nullable=True)
    prize_student_id = Column(String, nullable=True)
    prize_department = Column(String, nullable=True)
    prize_affiliation = Column(String, nullable=True)
    prize_bank_details = Column(Text, nullable=True)

    # Judge/Guest Fee payout details (only set when type == "Judge/Guest Fee")
    judge_name = Column(String, nullable=True)
    judge_contact = Column(String, nullable=True)
    judge_bank_details = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    event_budget = relationship("EventBudget")


# ── Task management (Epic 4) ────────────────────────────────────────
class Task(Base):
    """A unit of work a Club Head assigns to a Volunteer for an event.

    Status lifecycle: Assigned -> Accepted -> Submitted ->
    Verified | Revision Requested (a Revision Requested task goes back
    to Submitted once the volunteer resubmits proof).
    """
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)  # Attendance, Procurement, Bill Upload, Custom
    # Only set for type == "Bill Upload" -- the Expense line item this task's
    # assignee is responsible for procuring/uploading a bill for (see
    # app.routers.finance.upload_bill, which lets this assignee upload too).
    expense_id = Column(Integer, ForeignKey("expenses.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String, default="Medium")  # Low, Medium, High
    deadline = Column(Date, nullable=True)
    status = Column(String, default="Assigned")
    proof_text = Column(Text, nullable=True)
    proof_file_name = Column(String, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    review_comment = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    event = relationship("Event")
    club = relationship("Club")
    assignee = relationship("User", foreign_keys=[assigned_to])
    assigner = relationship("User", foreign_keys=[assigned_by])


# ── QR attendance (Epic 5) ──────────────────────────────────────────
class Registration(Base):
    """A student's registration for an event, identified by a unique QR
    token. Check-in flips `status` from Registered to Checked-In, either
    via the in-app scanner reading `qr_token` or a manual entry of the
    same token.
    """
    __tablename__ = "registrations"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_registration_event_user"),)

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    qr_token = Column(String, unique=True, nullable=False, index=True)
    status = Column(String, default="Registered")  # Registered, Checked-In
    registered_at = Column(DateTime, default=datetime.datetime.utcnow)
    checked_in_at = Column(DateTime, nullable=True)

    event = relationship("Event")
    user = relationship("User")


class Report(Base):
    """An analytics report generated on demand by a Faculty Coordinator.
    Stored so historical reports remain available for future reference.
    """
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String, nullable=False)  # "club_summary", "event_summary", "volunteer_summary", "finance_summary", "comprehensive"
    title = Column(String, nullable=False)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    data_json = Column(Text, nullable=False)  # JSON-serialised analytics payload
    generated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    generator = relationship("User", foreign_keys=[generated_by])


class Certificate(Base):
    """Auto-issued when an event is finalized, to every user who either
    had a Verified task on the event or was Checked-In to it (see
    app.routers.certificates.finalize_event).
    """
    __tablename__ = "certificates"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_certificate_event_user"),)

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=False)  # Volunteer, Attendee
    issued_at = Column(DateTime, default=datetime.datetime.utcnow)

    event = relationship("Event")
    user = relationship("User")


class ChatMessage(Base):
    """A single message in a club's chat. `student_id` is the volunteer's
    student_id when a message belongs to a one-on-one club-head <-> volunteer
    thread (null for general club chat).
    """
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    student_id = Column(String, nullable=True)  # volunteer's student_id, null for general chat
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender_role = Column(String, nullable=False)  # "clubhead" or "student"
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    club = relationship("Club")
    sender = relationship("User")


class Notification(Base):
    """A per-user notification (e.g. proposal status updates, task reminders)."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
