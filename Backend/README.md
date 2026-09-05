# SSCMS Backend

## Running the API

Run these commands inside WSL (e.g. `wsl` from a Windows terminal, or your WSL
distro's terminal directly):

```bash
cd Backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

- Interactive Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Raw OpenAPI (Swagger-compatible YAML, pinned to spec version 3.0.3): [`openapi.yaml`](openapi.yaml)
- Health check: `GET /health`

**The backend must be running for the frontend to log in at all** -- it's a
separate process from the static frontend server and does not start itself.
If sign-in shows "Invalid email or password" for a demo account that should
work, check this first: `curl http://127.0.0.1:8000/health` should return
`{"status":"ok"}`; if it doesn't, start uvicorn as above.

On first run the app seeds demo data: 5 clubs (with their own Club Head
logins, a small member roster, recruitment domains, and a couple of pending
volunteer applications for Dance Club), 5 venues, 5 inventory items, one
Faculty Coordinator, one Club President (oversees all 5 clubs), and 5
standalone students. The **Frontend** (see `Frontend/`) now reads all of this
live from the API instead of shipping its own hardcoded copy -- see
"Frontend integration" below. Demo logins:

| Role | Email | Password |
|---|---|---|
| Faculty Coordinator | facultycoord@iitm.in | faculty123 |
| Club President (all clubs) | studentpresident@iitm.in | president123 |
| Club Head, Dance Club | danceclub@iitm.in | danceclub123 |
| Club Head, Coding Club | codingclub@iitm.in | codingclub123 |
| Club Head, Robotix Club | robotixclub@iitm.in | robotixclub123 |
| Club Head, Music Club | musicclub@iitm.in | musicclub123 |
| Club Head, Green Club | greenclub@iitm.in | greenclub123 |
| Student | stu-001@iitm.in (or stu-002 / stu-003 / stu-004 / stu-005 @iitm.in) | student@123 |

Any *new* club created via `POST /clubs` auto-provisions its own Club Head
login the same way: email `<clubname-slug>@iitm.in`, password
`<clubname-slug>123` (e.g. "Photography Club" -> `photographyclub@iitm.in` /
`photographyclub123`) -- the plaintext password is returned exactly once, in
that endpoint's response, for the Faculty Coordinator to hand off.

Students added through the Faculty Coordinator (manual add or bulk CSV) get
their login derived the same way: email `<student_id>@iitm.in`, default
password `student@123`.

## Running the tests

Run inside WSL:

```bash
./venv/bin/python -m pytest -v
```

**145 tests, all passing.** See [`TEST_CASES.md`](TEST_CASES.md) for the full
test-case table (API, Inputs, Expected/Actual Output, Result) and
[`pytest_output.txt`](pytest_output.txt) for the raw run log.

## APIs integrated (from libraries / third parties)

| Library / Service | Used for |
|---|---|
| `fastapi` | HTTP routing, request validation, automatic OpenAPI generation |
| `sqlalchemy` | ORM / database access (SQLite for dev, swappable via `SSCMS_DATABASE_URL`) |
| `python-jose[cryptography]` | JWT encode/decode for bearer-token auth |
| Python `hashlib`/`hmac` (stdlib) | PBKDF2-HMAC password hashing (no third-party crypto dependency) |
| `google-genai` (optional) | Gemini LLM-backed notification digest and event proposal assistant; falls back to deterministic heuristic when `GEMINI_API_KEY` is not set |
| `pytest` / `httpx` (via `fastapi.testclient`) | Automated API test suite |

The LLM endpoints (`/llm/notification-digest`, `/llm/event-proposal-assist`)
work without an API key: they use a deterministic heuristic. Set
`GEMINI_API_KEY` to get Gemini-backed results instead.

## APIs created (dev-team implementation)

Full request/response schemas, per-status-code error descriptions, and field
validation live in [`openapi.yaml`](openapi.yaml) / `/docs`. Summary:

### Epic 1 -- Role-Based Portal Access & Onboarding

| Method & Path | Story | Description |
|---|---|---|
| `POST /auth/register` | 1.1 | Create a user + assign one role (Student/Volunteer/ClubHead/ClubPresident/FacultyCoordinator) |
| `POST /auth/login` | 1.1 | Authenticate, returns a JWT + the user's roles so the frontend can route to the matching dashboard |
| `GET /auth/me` | 1.1 | Resolve the caller's identity + roles from their bearer token |
| `POST /auth/change-password` | -- | Self-service password change for any logged-in role: requires the current password, enforces a 6-char minimum on the new one. Existing JWT sessions stay valid |
| `POST /clubs` | -- | Faculty Coordinator creates a new club (`status: Approved`) and its Club Head login is auto-provisioned in the same transaction. Optionally accepts `club_head_email` / `club_head_password` in the request body so the Faculty Coordinator can set that club's credentials directly instead of accepting the derived `<slug>@iitm.in` / `<slug>123` default -- either way the response's `club_head` field returns the actual email/password to hand off (see demo logins above) |
| `GET /clubs`, `GET /clubs/{id}` | -- | Browse/view clubs (public), including `description`/`history`/`achievements` |
| `PATCH /clubs/{id}` | -- | Faculty Coordinator or that club's President updates club fields |
| `DELETE /clubs/{id}` | -- | Faculty Coordinator deletes a club and cascades all related data |
| `POST /clubs/{id}/review` | -- | Faculty Coordinator approves/rejects a club still in `Pending` status |
| `POST /clubs/{id}/club-head/reset-password` | -- | Faculty Coordinator or Club President resets the Club Head's password |
| `POST /clubs/{id}/members/apply` | 1.2 | Student requests to join a club |
| `GET /clubs/{id}/members` | 1.2 | Club Head/President/Faculty view a club's pending + decided membership requests, with the applicant's name/email/department/year |
| `POST /clubs/{id}/members/{member_id}/review` | 1.2 | Club Head approves/rejects a membership request |
| `POST /clubs/{id}/domains` | 1.2 | Club Head opens/creates a recruitment domain |
| `GET /clubs/{id}/domains` | 1.2 | List a club's recruitment domains (public) |
| `PATCH /domains/{id}/recruitment` | 1.2 | Toggle a domain's recruitment open/closed |
| `DELETE /domains/{id}` | 1.2 | Club Head deletes a domain (blocked if it has Pending/Selected applications) |
| `POST /clubs/{id}/volunteer-applications` | 1.2 | Student applies as a volunteer to an open domain |
| `GET /clubs/{id}/volunteer-applications` | 1.2 | Club Head/President/Faculty view volunteer applications, with the applicant's name/student ID |
| `POST /clubs/{id}/volunteer-applications/{app_id}/review` | 1.2 | Club Head approves/rejects; approval grants the applicant the Volunteer role for that club |
| `POST /clubs/{id}/volunteer-applications/{app_id}/revoke` | 1.2 | Club Head revokes a selected application and removes the Volunteer role |
| `POST /clubs/{id}/volunteer-applications/{app_id}/reopen` | 1.2 | Club Head reopens a rejected/revoked application back to Pending |
| `GET /me/memberships` | 1.2 | Self-service: the caller's own membership records across every club (so a Student can see their own status without needing roster access to other students' PII) |
| `GET /me/volunteer-applications` | 1.2 | Self-service: the caller's own volunteer application records |

### Epic 2 -- Venue Booking & Asset Management

| Method & Path | Story | Description |
|---|---|---|
| `POST /venues`, `GET /venues` | 2.1 | Faculty Coordinator manages the shared venue pool |
| `GET /venues/{id}/availability?booking_date=` | 2.1 | Check whether a venue is free on a given date |
| `POST /bookings` | 2.1 | Reserve a venue for an event -- **rejects with `409` if the venue is already booked (non-Released) for that date**, catching double-bookings before approval |
| `GET /bookings` | 2.1 | List bookings, optionally filtered by venue |
| `PATCH /bookings/{id}` | 2.1 | Update a booking's status (Club Head/President/Faculty) |
| `POST /bookings/{id}/release` | 2.1 | Free a venue+date slot |
| `POST /inventory`, `GET /inventory` | 2.2 | Faculty Coordinator manages the shared asset/inventory pool |
| `POST /inventory/{id}/checkout?event_id=&quantity=` | 2.2 | Check out stock against an event; `409` if not enough `available_stock` |
| `POST /inventory/usage` | 2.2 | Create an inventory usage record (decrements stock, tracks checkout/return) |
| `POST /inventory/usage/{id}/mark-in-use` | 2.2 | Mark an item In Use and stamp checkout time |
| `POST /inventory/usage/{id}/return` | 2.2 | Return an item and restock automatically |
| `GET /inventory/usage` | 2.2 | List all inventory usage records |
| `POST /venues/bulk`, `POST /venues/bulk-import` | 2.1 | Faculty Coordinator bulk-creates venues from CSV or JSON |
| `POST /inventory/bulk`, `POST /inventory/bulk-import` | 2.2 | Faculty Coordinator bulk-creates inventory items from CSV or JSON |

### Epic 3 -- Event Lifecycle & Approval Workflows

| Method & Path | Story | Description |
|---|---|---|
| `POST /proposals` | 3.1 | Club Head drafts an event proposal (schedule, venue, budget) |
| `GET /proposals`, `GET /proposals/{id}` | 3.1 | List/view proposals, filterable by club/status |
| `POST /proposals/{id}/submit` | 3.1 | Draft -> Pending President Review |
| `POST /proposals/{id}/president-review` | 3.1 | President approves (-> Pending Faculty Review) or rejects (-> Rejected, with reason) |
| `POST /proposals/{id}/faculty-review` | 3.1 + 2.1 | Faculty approves -> **re-runs the venue conflict check** before approving; on success creates the `Event` row and a `Confirmed` `Booking` automatically. Faculty can also reject with a reason. On approval, an "Attendance Taking" task is auto-created for the Club Head. |
| `GET /events`, `GET /events/{id}` | 3.1 | List/view events created from approved proposals |
| `POST /events/{id}/publish` | 3.2 (prep) | Club Head marks an approved event visible to students |

### Epic 4 -- Task Management & Volunteer Workflows

| Method & Path | Story | Description |
|---|---|---|
| `POST /events/{id}/tasks` | 4.1 | Club Head creates a task (Attendance, Procurement, Bill Upload, Custom) and assigns it to a club volunteer |
| `GET /events/{id}/tasks` | 4.1 | List an event's tasks with optional `status_filter`; volunteers see only their own |
| `GET /tasks/mine` | 4.1 | List tasks assigned to the current user, optional `status_filter` |
| `POST /tasks/{id}/accept` | 4.1 | Assignee accepts a task (Assigned -> Accepted) |
| `POST /tasks/{id}/submit-proof` | 4.1 | Assignee submits proof (Accepted/Revision Requested -> Submitted) |
| `POST /tasks/{id}/review` | 4.1 | Club Head reviews a Submitted task: marks it Verified or Revision Requested |

Task types: **Attendance** (unlocks QR scanner on accept), **Procurement**,
**Bill Upload** (linked to an Expense), **Custom** (freeform proof).
Task states: Assigned -> Accepted -> Submitted -> Verified / Revision Requested.

### Epic 5 -- QR Attendance & Live Execution

| Method & Path | Story | Description |
|---|---|---|
| `POST /events/{id}/registrations` | 5.1 | Register for an event; a unique QR token is issued |
| `GET /registrations/mine` | 5.1 | List the current user's event registrations |
| `GET /events/{id}/registrations` | 5.1 | Club Head/President/Faculty view an event's full registration roster |
| `POST /registrations/{qr_token}/check-in` | 5.1 | Check in a student by QR token; `409` if already checked in, `403` if caller is not authorized (must be the event's Club Head or hold an Attendance task) |
| `GET /events/{id}/attendance-stats` | 5.1 | Live attendance stats: total registered, checked-in count, pending count, last check-in time |

### Epic 6 -- Certification & Budget Analytics

| Method & Path | Story | Description |
|---|---|---|
| `POST /events/{id}/finalize` | 6.1 | Faculty Coordinator finalizes a concluded event: auto-issues a Certificate to every Checked-In attendee and every volunteer with a Verified task |
| `GET /certificates` | 6.1 | List the current user's certificates |
| `GET /analytics/budget-overview` | 6.2 | Faculty Coordinator dashboard rollup: per-club allocated/spent, totals, count of active venue bookings, count of inventory currently on loan |
| `POST /clubs/{id}/finance/transactions` | 6.2 | Faculty Coordinator allocates budget from the master pool to a club (Allocation / Expense Reimbursement / Adjustment) |
| `GET /clubs/{id}/finance`, `GET /clubs/{id}/finance/transactions` | 6.2 | Club finance summary and ledger |
| `POST /finance/transactions` | 6.2 | Global (cross-club) finance transaction |
| `GET /faculty-budget-pool`, `PATCH /faculty-budget-pool` | 6.2 | Faculty Coordinator manages the master budget pool |
| `POST /clubs/{id}/event-budgets`, `GET /clubs/{id}/event-budgets` | 6.2 | President/Faculty creates and lists event-level budgets |
| `GET /event-budgets/{id}` | 6.2 | Get a single event budget |
| `PATCH /event-budgets/{id}/comment` | 6.2 | Club Head adds a comment/note to an event budget |
| `POST /event-budgets/{id}/close` | 6.2 | Close an event budget; unused funds return to the club pool |
| `DELETE /event-budgets/{id}` | 6.2 | Delete an event budget; reverts approved/proposal-sourced spend |
| `POST /event-budgets/{id}/expenses`, `GET /event-budgets/{id}/expenses` | 6.2 | Create/list expense line items under an event budget |
| `POST /expenses/{id}/upload-bill` | 6.2 | Club Head or linked Bill Upload volunteer uploads a purchase bill (multipart, max 5 MB) |
| `POST /expenses/{id}/prize-details` | 6.2 | Club Head submits prize-money payout details |
| `POST /expenses/{id}/judge-details` | 6.2 | Club Head submits judge/guest fee payout details |
| `POST /event-budgets/{id}/send-for-processing` | 6.2 | Club Head forwards all editable expenses to the review pipeline |
| `POST /expenses/{id}/president-review` | 6.2 | President approves -> Pending Faculty Review, or rejects |
| `POST /expenses/{id}/faculty-review` | 6.2 | Faculty approves -> Approved (applies spend to club budget) or rejects |
| `POST /expenses/{id}/reset` | 6.2 | Faculty resets an Approved expense back to Pending Faculty Review |

### LLM-Assisted Features

| Method & Path | Description |
|---|---|
| `POST /llm/notification-digest` | Summarize the caller's notifications into a digest with up to 3 highlights. Gemini-backed with deterministic fallback. |
| `POST /llm/event-proposal-assist` | **Event Proposal Assistant**: Club Head provides event name, objective, and expected participants; AI generates a full proposal including event description, agenda, budget estimate, required inventory, volunteer count, risk assessment, and planning timeline. Gemini-backed with deterministic fallback. |

### Student Management & Bulk Import

| Method & Path | Description |
|---|---|
| `POST /students` | Faculty Coordinator manually creates a student account |
| `POST /users/bulk-import`, `POST /auth/bulk-import` | Faculty Coordinator bulk-imports users from CSV or JSON |
| `GET /students` | Faculty Coordinator / Club President / Club Head lists aggregated student profiles (roles, memberships, registrations, certificates) |

### Report Generation

| Method & Path | Description |
|---|---|
| `POST /reports` | Faculty Coordinator generates and persists an analytics report (types: `club_summary`, `event_summary`, `volunteer_summary`, `finance_summary`, `comprehensive`; optional `date_from`/`date_to` filter) |
| `GET /reports` | List all historical reports, filterable by `report_type` |
| `GET /reports/{id}` | Retrieve a single report's full analytics payload |
| `GET /reports/{id}/download` | Download a report as a CSV file |

Reports are stored in the database so historical reports remain available for
future reference. Each report type compiles different data:

- **club_summary** -- per-club active members, events, finalized events, budget allotted/spent/remaining
- **event_summary** -- per-event registrations, checked-in count, tasks, certificates issued
- **volunteer_summary** -- per-volunteer clubs served, events served, tasks assigned/verified, certificates earned (ranked by verified tasks)
- **finance_summary** -- master pool total, per-club utilization %, event budgets, expense counts
- **comprehensive** -- all four sections combined

Every write endpoint above enforces the caller's role **and**, where relevant,
that the caller's role is scoped to the specific club being acted on (e.g. a
Club Head from Club B cannot approve Club A's membership requests) --
verified in `tests/test_clubs.py::test_other_club_head_cannot_approve_membership`
and `tests/test_events.py::test_publish_event_requires_owning_club_head`.

## Test suite breakdown

| Test file | Tests | What it covers |
|---|---|---|
| `test_attendance.py` | 10 | Event registration, QR token issuance, check-in by Club Head and by volunteer with Attendance task, double-check-in / unknown-token / unauthorized-user 409/404/403, roster access, my registrations |
| `test_auth.py` | 12 | Registration, login, token validation, `GET /auth/me`, self-service change-password (success, wrong current password, auth required, too-short new password) |
| `test_bulk_and_students.py` | 8 | Bulk user import (JSON + CSV), partial failure, student aggregated view, manual student create, bulk venue import, bulk inventory import |
| `test_certificates.py` | 6 | Event finalize + certificate issuance, duplicate finalize 409, faculty-only enforcement, budget overview aggregation |
| `test_chat.py` | 6 | Club chat endpoints -- send + list messages, auth required, filtering |
| `test_clubs.py` | 18 | Club CRUD, membership apply/approve/reject, domain management, volunteer application lifecycle (apply, approve, revoke, reopen), cross-club role isolation |
| `test_events.py` | 8 | Proposal create/submit, president review, faculty review with venue-conflict check, event publish, role enforcement |
| `test_finance_bills.py` | 6 | Bill upload (file persists on disk), zero-amount mark Not Utilized, volunteer with linked task can upload, unauthorized / wrong-status 403/409 |
| `test_llm.py` | 9 | Notification digest (auth required, empty list, summarization), event proposal assistant (auth required, heuristic output, budget scaling, volunteer scaling, validation errors) |
| `test_notifications.py` | 4 | Notifications endpoints -- create, list, read-all, user scoping |
| `test_proposal_revision.py` | 11 | Proposal revision flow -- send-for-revision, PATCH editing, re-submission from Needs Revision |
| `test_reports.py` | 19 | Report generation (all 5 types, date-range filter, invalid type 422, faculty-only + auth enforcement), list/filter reports, get by ID, CSV download (club + comprehensive), unknown report 404, historical persistence |
| `test_tasks.py` | 8 | Task assignment, full lifecycle (accept -> submit -> verify), revision request + resubmission, role/assignee enforcement, status-guard errors |
| `test_venue_inventory_update_delete.py` | 11 | Venue and inventory update (PATCH) and delete (DELETE) endpoints, role enforcement, deletion blocked by references |
| `test_venues.py` | 9 | Venue create, availability check, booking creation + conflict detection, release + rebook, inventory checkout + stock enforcement |
| **Total** | **145** | |

## Frontend integration

`Frontend/` no longer ships its own hardcoded demo data. `Frontend/index.html`
now logs in against `POST /auth/login` for real (email + password, no more
role-picker) and every dashboard's `state.clubsFinances` / `clubProfiles` /
`venues` / `inventory` / `clubMembers` / `domains` / `volunteerApplications`
are fetched live from the backend on every load (`shared/js/state-core.js`'s
`refreshFromBackend()`, via the new `shared/js/api.js` client) instead of
`shared/js/seed-data.js`'s old hardcoded arrays -- that file is now just an
empty-array skeleton for the entities the backend doesn't own yet this sprint
(event proposals/tasks/finance/certificates/chat/notifications). Point the
frontend at a non-default backend URL via
`<script>window.SSCMS_API_BASE = "http://host:port";</script>` before
`shared/js/api-config.js` loads.

Every page computes its own `<base>` tag at runtime from `window.location`
(see the inline script right after `<title>` in each `index.html`) instead of
a hardcoded absolute path. This makes the pages work both opened directly as
`file://` and through a static server -- including ones like `npx serve` that
redirect `/some/index.html` to a clean URL with the filename stripped, which
would otherwise break every relative `<script src="../shared/js/...">` and
leave `Api` undefined (the symptom looks exactly like "Invalid email or
password" because the login handler never runs at all).

Wired to the backend: all core CRUD operations -- club creation, membership
apply/approve/reject, recruitment domain create/toggle/delete, volunteer
application apply/select/reject/revoke/reopen, venue/inventory creation
and editing, booking create/complete/cancel/release, event proposal
create/submit/revise/resubmit/president-review/faculty-review,
event publish, task lifecycle (assign/accept/submit-proof/review),
event registration + QR check-in, certificate listing + event finalize
with budget analytics, event-budget and expense management with bill
uploads, and the full proposal revision flow (Send for Revision /
Request Changes). Chat messages and notifications are persisted via
backend endpoints so they survive reload across sessions. Point the
frontend at a non-default backend URL via
`<script>window.SSCMS_API_BASE = "http://host:port";</script>` before
`shared/js/api-config.js` loads.

## Deliberate deviation from the ER design

`Documents/team-103-milestone-1-2/er-dbml.txt` specifies a DB-level
`unique(venue_id, booking_date)` index on `bookings`. Testing surfaced that
this blocks the legitimate "release a booking, then rebook the same slot"
flow (see [`TEST_CASES.md` section 16](TEST_CASES.md#16-case-where-actual-output-initially-differed-from-expected-found-via-testing)),
so the constraint was moved to the application layer, where it correctly
excludes `Released` bookings.

## Configuration (.env)

The backend reads optional settings from a `.env` file in the `Backend/`
directory (loaded once at startup by `load_dotenv()` in `app/main.py`). If a
variable is missing, the code falls back to the default in the table below.

### Setting it up

1. Create the file from the template:

   ```bash
   cd Backend
   cp .env.example .env
   ```

2. Open `.env` and fill in the values you need. At a minimum, set a strong
   `SSCMS_SECRET_KEY` before running anything other than local development.
3. Restart the backend — the environment is read **once at startup**
   (`uvicorn --reload` does not watch `.env`, only `.py` files):

   ```bash
   ./venv/bin/python -m uvicorn app.main:app --reload --port 8000
   ```

> `.env` is gitignored — never commit real secrets. The repo ships
> `.env.example` as a template with blank values.

### Variables

| Variable | Default | Purpose |
|---|---|---|
| `SSCMS_DATABASE_URL` | `sqlite:///./sscms.db` | SQLAlchemy connection string |
| `SSCMS_SECRET_KEY` | dev placeholder | JWT signing secret -- **must** be overridden outside local dev |
| `SSCMS_SKIP_SEED` | unset | Set to `1` to skip demo-data seeding (used by the test suite) |
| `GEMINI_API_KEY` | unset | Optional; enables Gemini-backed notification digests and event proposal assists. Without it, deterministic heuristics are used. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Which Gemini model the LLM endpoints use. Only read when `GEMINI_API_KEY` is set. |

### Getting a Gemini API key (optional)

The GenAI features (`/llm/notification-digest`, `/llm/event-proposal-assist`)
use Google's Gemini API when `GEMINI_API_KEY` is set, and degrade to a
deterministic heuristic when it isn't set or a call fails.

1. Sign in at <https://aistudio.google.com/apikey> with a Google account.
2. Click **Create API key**, pick a project, and copy the key (starts with
   `AIza...`).
3. Put it in `.env`:

   ```dotenv
   GEMINI_API_KEY=your-key-here
   ```

4. Restart the backend.

Notes:
- The **free tier is limited to 20 generate-content requests per day per
  model**. Once the quota is used up, calls return `429` and the endpoints
  transparently fall back to the heuristic until the quota resets. Attaching
  billing to the project raises this limit.
- Point the LLM endpoints at a different model via `GEMINI_MODEL`
  (e.g. `gemini-2.5-pro`).
- Every LLM response includes a `source` field (`"gemini"` or
  `"heuristic"`), so you can tell which path served the request.
