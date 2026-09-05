# SSCMS — Smart Student Club Management System

**Team Hustlers | Team 103**

A full-stack platform that digitizes the entire lifecycle of student clubs and
events — from club creation and membership, through event proposals, budget
approvals, volunteer task management, QR attendance, and certificate
generation.

For Demo Video of the app: https://drive.google.com/drive/folders/18RHpAZIvgAvYBOhnTUYbWzZvhMjoQAV5?usp=sharing
---

## Table of Contents

1. [Overview](#1-overview)
2. [User Roles](#2-user-roles)
3. [Core Features by Role](#3-core-features-by-role)
4. [System Architecture](#4-system-architecture)
5. [Component Relationships](#5-component-relationships)
6. [Project Structure](#6-project-structure)
7. [Getting Started](#7-getting-started)
8. [Demo Accounts](#8-demo-accounts)
9. [Typical End-to-End Workflow](#9-typical-end-to-end-workflow)
10. [Troubleshooting](#10-troubleshooting)
11. [Documentation](#11-documentation)

---

## 1. Overview

SSCMS replaces manual, spreadsheet-and-WhatsApp club administration with a
single system that handles:

- Club creation, membership, and volunteer recruitment
- Event proposals with a three-stage approval chain (Club Head → President →
  Faculty Coordinator)
- Venue and asset booking with conflict detection
- Budget allocation, expense review, and finance close-out
- Volunteer task assignment and tracking via a Kanban-style workflow
- QR-code based event registration and attendance
- Proof-of-work verification for volunteer tasks
- Certificate generation and download
- Term-level analytics and reporting

The system is role-based: what a user sees and can do is determined entirely
by their assigned role, with additional dashboard modules unlocking as a
student's status changes (e.g. becoming a volunteer).

## 2. User Roles

| Role | Scope |
|------|-------|
| **Student** | Browses clubs/events, joins clubs, registers for events, applies to volunteer |
| **Volunteer** *(a student status, not a separate account)* | Handles assigned tasks, uploads proof of work, chats with their Club Head |
| **Club Head** | Runs one club — proposals, event management, membership, volunteer recruitment, finances |
| **Club President** | Oversees all clubs — proposal review, budget allocation/disbursement, certification sign-off |
| **Faculty Coordinator** | Final administrative authority — club/event/venue/asset approval, certificate issuance, reporting |

## 3. Core Features by Role

### Student
- Dashboard with registrations, club memberships, and volunteer roles at a glance
- Club directory with detail view (description, achievements, past events, open recruitments)
- Event browsing and registration with a personal check-in QR code
- Calendar view of registered events
- Certificate downloads (Volunteer and Attendance certificates)
- 1-on-1 chat with a club's Club Head (once selected as a volunteer)

### Club Head
- Event proposal builder covering venue, inventory, procurement, prize money, and judge/guest fees, with a live budget summary
- Event workspace: task allotment, registrations/QR check-in, and publishing
- Membership and volunteer recruitment management (domains, applications, approvals)
- Club finance tracking with per-event budget breakdowns and bill uploads
- Volunteer chat

### Club President
- Campus-wide dashboard: finance utilization, venue status, inventory alerts
- Club gallery with budget, membership, and pending-request overview
- Budget allocation/disbursement and expense approval
- Inventory allocation and venue booking management
- Proposal review with per-line-item decisions and feedback
- Student directory and resource calendar

### Faculty Coordinator
- All President capabilities, plus:
- Final club, event, venue, and asset approval
- Master budget pool management and budget escalation approval
- Final certification sign-off and certificate issuance
- Club creation and bulk student onboarding (CSV import)
- Full inventory/venue CRUD, including bulk CSV import
- Term-level analytical reports

## 4. System Architecture

The application is composed of 13 functional components:

1. **User Authentication** — credential validation, role identification, dashboard routing
2. **Dashboard** — role-specific landing views and module gating
3. **Club Management** — club creation and membership workflows
4. **Event Management** — proposal-to-publication lifecycle and registration
5. **Venue and Asset Management** — resource availability, reservation, and conflict detection
6. **Volunteer Management** — recruitment, applications, and domain/field-monitor assignment
7. **Task Management** — domain/task creation, assignment, and Kanban tracking
8. **Proof of Work Verification** — review and approval of volunteer submissions
9. **QR Attendance** — registration verification and live attendance tracking
10. **Asset Checkout** — allocation, in-use tracking, and return verification
11. **Certificate Management** — eligibility checks, multi-party sign-off, and generation
12. **Report Generation** — term-level analytics compiled from club, event, and resource data
13. **Resource Request** — intake and approval of new venues/assets into inventory

Each task moves through defined states: `Pending → Accepted → In Progress →
Under Review → Completed` (or `Revision Required`).

## 5. Component Relationships

| Component | Directly Interacts With |
|---|---|
| User Authentication | Dashboard |
| Dashboard | Club Management, Event Management, Volunteer Management, Task Management, Certificate Management |
| Club Management | Event Management |
| Event Management | Venue & Asset Management, Volunteer Management, QR Attendance |
| Venue & Asset Management | Asset Checkout |
| Volunteer Management | Task Management |
| Task Management | Proof of Work Verification, Messaging |
| Proof of Work Verification | Certificate Management |
| QR Attendance | Certificate Management |
| Report Generation | Club Management, Event Management, Volunteer Management, Asset Checkout, Certificate Management |
| Resource Request | Venue & Asset Management |

## 6. Project Structure

```
.
├── Backend/                     FastAPI backend
│   ├── app/
│   │   ├── main.py              App entrypoint
│   │   ├── database.py          DB connection/session setup
│   │   ├── models.py            SQLAlchemy models
│   │   ├── schemas.py           Pydantic schemas
│   │   ├── security.py          Auth/hashing utilities
│   │   ├── deps.py              Shared FastAPI dependencies
│   │   ├── llm.py               LLM integration
│   │   ├── seed.py              Seeds demo accounts & data
│   │   └── routers/             One router per domain — auth, clubs, events,
│   │                            venues, tasks, attendance, certificates,
│   │                            finance, chat, notifications, reports,
│   │                            students, llm
│   ├── tests/                   Pytest suite (one file per router, plus
│   │                            test_integration_workflows.py)
│   ├── uploads/bills/           Uploaded bill attachments
│   ├── clear_data.py            Wipes DB data
│   ├── sscms.db                 SQLite database file
│   ├── openapi.yaml / API_DOC.md
│   └── requirements.txt
│
├── Frontend/                    Static site (no build step)
│   ├── index.html               Login page
│   ├── User_Dashboard/          Student dashboard (app.js, css/, js/)
│   ├── club_head_dashboard/     Club Head dashboard
│   ├── President_Dashboard/     Club President dashboard
│   ├── faculty_coordinator_dashboard/
│   └── shared/                  Shared css/ and js/ (api.js, session.js,
│                                 calendar.js, state-core.js, seed-data.js, …)
│
└── Documents/
    ├── USER_MANUAL.md
    ├── Design of Components.pdf
    ├── SPRINT2_DOC.md
    ├── TEST_CASES.md
    ├── team-103-milestone-1-2/  Class diagram, ER diagram/DBML, Gantt chart,
    │                            user stories, sprint schedule
    └── milestone-3-submission/  Backend.zip, openapi.yaml, deliverables PDF
```

> The President and Faculty Coordinator dashboards share the same shell/CSS
> (`shared/`), with role-specific extras layered on top — matching the note in
> the user manual that the Faculty Coordinator dashboard "shares the same
> shell as the President dashboard but with extra powers."

## 7. Getting Started

### Prerequisites
- Python 3.x (backend)
- Node.js (for `npx serve`, optional — a plain HTTP server also works)

### Running the Backend

```bash
cd Backend
.myenv/bin/python -m uvicorn app.main:app --port 8000
```

The backend serves the API at `http://127.0.0.1:8000`. The frontend will not
function without it running.

### Running the Frontend

The frontend is a static site — any static file server works:

```bash
cd Frontend
npx serve -l 5500 .
# or
python3 -m http.server 5500
```

Open **http://localhost:5500** and sign in from the **SSCMS Sign In** page.

## 8. Demo Accounts

Pre-seeded accounts are available for exploring each role (also listed on the
login page under **"Demo accounts"**):

| Role | Email | Password |
|------|-------|----------|
| Faculty Coordinator | `facultycoord@iitm.in` | `faculty123` |
| Club President | `studentpresident@iitm.in` | `president123` |
| Club Head (Dance Club) | `danceclub@iitm.in` | `danceclub123` |
| Student | `stu-001@iitm.in` | `student@123` |

## 9. Typical End-to-End Workflow

**From member to volunteer to certificate:**

1. Student joins a club → Club Head approves membership.
2. Student applies to volunteer → Club Head selects them.
3. Club Head drafts an event proposal → President approves → Faculty
   Coordinator gives final approval → event is created.
4. Club Head publishes the event; students register and receive a QR code.
5. On event day, attendance is scanned; volunteers are assigned and complete
   tasks (submit proof → Club Head approves).
6. Faculty Coordinator finalizes the event for certification.
7. Student and volunteer download their certificates.

**Budget approval with escalation:** a proposal that exceeds a club's budget
is flagged for the President, who forwards it; the Faculty Coordinator
reviews the shortfall, tops up the budget, and gives final approval.

**Event finance close-out:** Club Head uploads bills → President reviews each
expense → Faculty Coordinator gives final review → President closes the
event's finance record.

## 10. Troubleshooting

| Issue | Likely Cause |
|---|---|
| "Invalid email or password" | Wrong demo credentials, or backend not running |
| Sign-in does nothing | Backend unreachable at `http://127.0.0.1:8000` |
| A feature "won't survive a reload" | Action isn't yet linked to a backend record (local-only demo data) |
| Can't delete a venue/inventory item | Blocked while bookings, proposals, or usage records reference it |
| Club Activities / Chat tabs missing | Only appear once a Club Head selects the student as a volunteer |
| Can't accept a task | Only the assigned volunteer can accept it |

There is currently no self-service password recovery; a Club Head's password
can be reset by the President or Faculty Coordinator from the club's edit
screen. All other roles change their own password via the key icon in the
sidebar profile card.

## 11. Documentation

- **User Manual** — step-by-step guide for every role, including UI
  conventions (toasts, modals, global search) and full workflow walkthroughs.
- **Design of Components** — detailed purpose, responsibilities, inputs/
  outputs, and functional behaviour for each of the 13 system components.
