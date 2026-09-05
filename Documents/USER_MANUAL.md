# SSCMS — User Manual

**Smart Student Club Management System**
**Team Hustlers (Team 103) | Sprint 2**

> A step-by-step guide for every user of the platform — Students, Club Heads,
> Club Presidents, and Faculty Coordinators.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Understanding the Interface](#2-understanding-the-interface)
3. [Student Guide](#3-student-guide)
4. [Club Head Guide](#4-club-head-guide)
5. [Club President Guide](#5-club-president-guide)
6. [Faculty Coordinator Guide](#6-faculty-coordinator-guide)
7. [End-to-End Workflows](#7-end-to-end-workflows)
8. [Common Questions & Troubleshooting](#8-common-questions--troubleshooting)

---

## 1. Getting Started

### 1.1 Accessing the Application

1. Open your web browser.
2. Go to the application URL (e.g. `http://localhost:5500` if running locally).
3. You will see the **SSCMS Sign In** page.

### 1.2 Signing In

1. Enter your **Email** in the email field.
2. Enter your **Password** in the password field.
3. Click the **Sign In** button.
4. You'll be automatically taken to your role's dashboard:
   - **Student** → Student Dashboard
   - **Club Head** → Club Head Dashboard
   - **Club President** → President Dashboard
   - **Faculty Coordinator** → Faculty Coordinator Dashboard

> **Tip:** During login the button changes to "Signing in…" — wait for it to
> finish. If you mistype your password you'll see a red error message under the
> form.

### 1.3 Demo Accounts

Use any of these pre-made accounts to explore the app:

| Role | Email | Password |
|------|-------|----------|
| Faculty Coordinator | `facultycoord@iitm.in` | `faculty123` |
| Club President | `studentpresident@iitm.in` | `president123` |
| Club Head (Dance Club) | `danceclub@iitm.in` | `danceclub123` |
| Student | `stu-001@iitm.in` | `student@123` |

> These are listed on the login page under the **"Demo accounts"** dropdown.

### 1.4 Logging Out

Click the **Logout** button in the sidebar (bottom left) of any dashboard. You
will be returned to the login page.

### 1.5 Changing Your Password

Every role — Student, Club Head, Club President, and Faculty Coordinator — can
update their own password from the sidebar of their dashboard.

1. In the sidebar, find your **profile card** (bottom left).
2. Click the **key icon** button next to the Logout button.
3. In the **Change Password** popup, enter your **current password**, your
   **new password** (at least 6 characters), and confirm the new password.
4. Click **Update Password**.

> **Tips:**
> - If the current password is wrong, or the two new passwords don't match, a
>   toast explains the problem.
> - Your new password takes effect immediately — sign in with it next time. The
>   old password will no longer work.
> - Changing your password does **not** log you out of any open session.

---

## 2. Understanding the Interface

### 2.1 The Sidebar

Every dashboard has a **sidebar on the left** that contains:
- **Navigation tabs** — click to switch between sections
- **Your profile card** — shows your name and role, a **key icon** button to
  change your password (see [1.5](#15-changing-your-password)), and the
  **Logout** button

### 2.2 Toasts (pop-up notifications)

Every action shows a small **toast notification** in the top-right corner:
- ✅ **Green** — success (e.g. "Event published successfully")
- 🔴 **Red** — error (e.g. "Venue is already booked")
- 🟡 **Yellow** — warning (e.g. "Only 20% stock remaining")
- 🔵 **Blue** — information

Toasts disappear automatically after a few seconds.

### 2.3 Modals (pop-up windows)

Forms often open in **modals** (centered dialog boxes). To close a modal:
- Click the **×** button in the corner, **or**
- Click the darkened background, **or**
- Press the **Escape** key.

### 2.4 Global Search

The Student, President, and Faculty Coordinator dashboards have a **global
search bar** at the top. Type to instantly filter the current tab's content.

---

## 3. Student Guide

The Student Dashboard is your personal portal. It has **7 tabs**.

### 3.1 Dashboard Tab (Home)

- **Welcome banner** — greets you by name with today's date.
- **Stats cards** — show your counts:
  - *My Registrations* — events you've signed up for
  - *Clubs Joined* — clubs where you're an active member
  - *Volunteer Roles* — clubs where you're a selected volunteer
- **My Registrations** — list of events you registered for, each with a **QR** button
- **Ongoing Events** — events happening today
- **Upcoming Events** — future events (max 4), with **View all →** link
- **Featured Clubs** — up to 3 club cards with **Explore Club** buttons

### 3.2 Clubs Tab

1. Click **Clubs** in the sidebar.
2. Browse the grid of all campus clubs. Each card shows the club's name,
   category, description, your membership status, and any open recruitments.
3. **Click a club card** to open the **Club Detail** popup. Here you can see:
   - The club's full description, achievements, and history
   - Your membership status
   - **Ongoing Recruitments** (open domains)
   - **Past Events** the club has conducted

**Joining a club:**

1. In the club detail popup, click **Join Club**.
2. Your status changes to *"Awaiting Club Head approval"*.
3. When the Club Head approves, you become an active member.

**Applying to be a volunteer:**

1. In the club detail popup, click **Join as Volunteer** (only shows if you're a member).
2. In the **Apply to Volunteer** popup:
   - Pick a **Domain** (e.g. "Events Management") from the dropdown.
   - Write your **Relevant Experience** in the text area.
3. Click **Submit Application**.
4. Your status shows *"Volunteer Application Pending"* until the Club Head
   decides.

> Once you're a **Selected volunteer**, two new tabs appear: **Club Activities**
> and **Chat**.

### 3.3 Events Tab

1. Click **Events** in the sidebar.
2. You'll see cards for all published events (ongoing and upcoming). Each shows
   the club, date, time, venue, and a poster (if uploaded).
3. To attend an event, click **Register** on its card.
4. A **QR Code popup** opens immediately with your personal check-in QR code.

**Viewing your QR again:**
- On the event card, click **View My QR**.
- Show this code at the venue on event day to check in.

> Your QR code is unique to you and the event. The check-in status updates to
> *"Checked in on …"* once the venue staff scans it.

### 3.4 Club Activities Tab *(only for Selected volunteers)*

This tab shows your volunteering duties.

- **Ongoing Events** — the club's current/upcoming events.
- **Assigned Tasks** — grouped by domain. Each task card shows the title,
  status badge, description, event, deadline, priority, and who assigned it.

**Task statuses you'll see:**

| Status | Meaning | What you can do |
|--------|---------|-----------------|
| Assigned | The Club Head just gave you the task | Click **Accept Task** |
| Accepted | You accepted it | Complete it, click **Mark as Completed** |
| Submitted | Your proof is with the Club Head | Wait for verification |
| Revision Requested | The Club Head wants changes | Click **Resume & Resubmit** |
| Verified | Done and closed | Nothing |

**Accepting a task:**
- Click **Accept Task** on the task card.

**Submitting proof of completion:**
1. Click **Mark as Completed** (or **Open Proof**).
2. In the **Submit Proof** popup:
   - Add **Notes** describing what you did.
   - Optionally add a **Link** (e.g. a drive link or repo).
   - Optionally **Attach a file** (image or PDF).
3. Click **Mark as Completed**.
4. The task moves to *Submitted* — the Club Head will verify it.

**Uploading a bill** (for procurement / bill-upload tasks):
1. Click **Upload Bill** (or **Edit Bill**) on the task card.
2. In the popup, enter the **Bill Amount (Rs.)**.
   - If you weren't able to buy the item, enter **0** — no bill is needed.
3. Optionally **attach the bill image/PDF**.
4. Click **Save Bill**.

**Taking attendance** (for Attendance tasks):
1. Click **Open QR Scanner** on the task card.
2. Use the camera to scan attendees' QR codes, **or** type a registration code
   in the manual box and click **Mark Present**.
3. The **Attendance History** table shows who has checked in.

### 3.5 Calendar Tab

- See all your registered event dates on a monthly calendar.
- Click the **‹ ›** arrows to change months.
- Days with events show a dot; click a day to see the event names.
- The **Registered Agenda** sidebar lists your upcoming events chronologically.

### 3.6 Certificates Tab

1. Click **Certificates** in the sidebar.
2. You'll see a card for each certificate you've earned. There are two kinds:
   - **Volunteer** (amber) — you completed a *Verified* task for the event. It
     lists the duties you handled.
   - **Attendance** (sky blue) — you checked in to the event.
3. Click **Download PDF** on a card to save a printable copy, **or** click the
   card to open the **Certificate Preview** with your name, the event, and the
   issuer.

> Certificates are issued by the Faculty Coordinator after an event is
> finalized and your participation is verified.

### 3.7 Chat Tab *(only for Selected volunteers)*

1. Click **Chat** in the sidebar.
2. On the left, pick the **club** whose Club Head you want to message.
3. Type your message in the box at the bottom and press **Send**.
4. Your messages appear on the right; the Club Head's replies appear on the left.

> Chat is a 1-on-1 conversation with the Club Head of each club you volunteer
> for.

---

## 4. Club Head Guide

The Club Head Dashboard manages one club. It has **6 tabs**.

### 4.1 Event Proposals Tab

This is where you propose events and track their approval.

**Creating a new proposal:**

1. Click **Event Proposals** → **New Proposal** button.
2. Fill in the form:

   | Section | What to fill |
   |---------|--------------|
   | **Event Details** | Title, description, proposed date, expected attendees, start/end times |
   | **1. Venue Booking Request** | Select a venue, enter capacity required |
   | **2. Inventory Requirements** | Add lent-asset items: category, requirement, quantity, units (use **+ Add Item**) |
   | **3. Procuring Items** | Add self-procured expenses: name, category, quantity, price per unit (auto-computes total) |
   | **4. Prize Money Request** | Add positions and amounts (**+ Add Position**) |
   | **5. Judge/Guest Fee Request** | Add judges/guests: description, number, fee per judge |
   | **Comments** | Any notes for the President |

3. Watch the **Budget Summary** panel as you add items — it shows allotted,
   spent, remaining, and total asked.
4. Click **Send for Approval**.

> If your proposal exceeds the club's remaining budget, you'll be asked to
> confirm before submitting — it will need the Faculty Coordinator's budget
> allocation.

**After submitting**, your proposal shows in the gallery with a status:

| Status | Meaning |
|--------|---------|
| Pending | Waiting for the President |
| Needs Revision | The President/Faculty sent it back — click **Revise & Resubmit** |
| Pending Faculty Approval | President approved; waiting for Faculty |
| Rejected | Not approved |
| Approved | Accepted — it becomes an event |

**Revising a proposal:**
1. Open the proposal (click its card).
2. Click **Revise & Resubmit**.
3. Edit the form and click **Send for Approval** again.

### 4.2 Event Management Tab

Here you manage approved events. Click an event card to open its **workspace**
with four toggles.

**Toggle 1 — Approved Details:** Read-only view of the approved proposal.

**Toggle 2 — Task Allotment:** Assign volunteers to tasks.

- **Attendance Taking** (mandatory): pick a volunteer and click **Allot Task**.
- **Procurement** (mandatory): pick a volunteer per inventory item.
- **Bill Upload** (mandatory): per self-procured expense.
- **Custom Tasks**: click **Add Task**, fill in title, description, assign a
  volunteer, deadline, and priority, then **Allot Task**.

Once assigned, each task card lets you:
- **Simulate Volunteer Accept** (demo of the volunteer accepting)
- **Open QR Scanner** (for attendance tasks)
- **Simulate Submit Proof** (demo of proof submission)
- **Approve** / **Request Revision** on submitted proofs

**Toggle 3 — Registrations:** See who registered, check people in via QR, and
**Add Sample Registrations** for testing.

**Toggle 4 — Edit & Publish:** The event's public page.

1. Fill in the event **Name**, **Description**, **Rules**, upload a **Poster**.
   - Venue, date, and time are locked (from the approved proposal).
2. Set the **Registration Deadline**.
3. Add **Rounds** with **+ Add Round** (each with a name and description).
4. Add **Contact Info**.
5. Tick **Published (visible to students)** to make it public.
6. Click **Save & Publish** (or **Save & Update**).

> Once published, the event appears on students' Events tab and they can
> register.

### 4.3 Manage Members Tab

- **Pending Join Requests** — approve (green ✓) or reject (red ✗) each request.
- **Active Club Members** — all current members with their volunteer domains.

### 4.4 Volunteer Management Tab

- **Add Domain** — create a recruitment domain (name, title, roles). Click to
  open the form.
- **Domain Cards** — each shows recruiting status and the volunteers. Use
  **Close Recruitment** / **Send Recruitment** to toggle openness, or the
  delete (trash) icon to remove it (blocked if there are pending applications).
- **Volunteer Applications** — review each application:
  - *Pending*: **Select** (green ✓) or **Reject** (red ✗)
  - *Selected*: **Revoke** (removes the volunteer and cancels their unfinished tasks)
  - *Rejected/Revoked*: **Re-review** (reopens)
- **Volunteer Details by Domain** — see all selected volunteers per domain.

### 4.5 Club Finances Tab

- **Club Budget Overview** — total allotted, spent, and remaining.
- **Approved Event Budgets** (left) — per-event cards with progress bars.
- **Event Split-Up** (right, after clicking an event) — a donut chart of how the
  budget was spent by category, with the allotted amount, approved expenses,
  and remaining balance.
- **Self-Procured Expense Bills** — upload or edit bills for each expense item.
- **Prize Money Details** — enter the amounts paid and student bank details.
- **Judge/Guest Fee Details** — enter amounts paid and judge details.
- When done, write a **comment** and click **Send for Processing** to forward
  all expenses to the President for review.

### 4.6 Volunteer Chat Tab

1. Click **Volunteer Chat**.
2. Pick a volunteer from the left list.
3. Type a message and press **Send**.
4. The conversation is saved — you'll see it again next time.

---

## 5. Club President Guide

The President oversees all clubs. The dashboard has **7 tabs**.

### 5.1 Dashboard Tab

Quick overview of the whole campus:
- **Stats** — total allocated budget, total spent, active bookings, inventory
  lent out, pending proposals.
- **Finance Utilization by Club** — bar chart of spend vs. allotted per club.
- **Venue Status Summary** — today's venue availability.
- **Upcoming Venue Bookings** — the next 5 bookings.
- **Inventory Alert** — items with less than 50% stock.

### 5.2 Club Overview Tab

- **Club Gallery** — every club card with its budget progress, member counts,
  and pending requests. Use **View Club Overview**, **Edit**, or **Delete**.

Opening a club's **overview** reveals four sub-tabs:

**Club Activities:** event counts, budget utilization chart, past/ongoing events.

**Club Members:** (read-only) membership requests, members, domains, volunteers.

**Certification Verification:** approve events for certification —
- Click **Approve** to send to the Faculty Coordinator for final sign-off.

**Finances & Budgets:**
- **Allocate / Disburse Funds** — add or revise a club's budget.
- **Allocate New Event Budget** — fund a specific event.
- Review each **Logged Expense & Bill**:
  - *Pending President Review*: **Approve** (✓) or **Reject** (✗)
  - *Rejected*: the Club Head must revise
- **Close Event Finance** once all items are reviewed.

### 5.3 Inventory Manager Tab

- **Gallery** — filter by category or status. **Quick Book** opens the allocate
  modal. Click an item for detail.
- **Detail view** — see stock, and track **Active Inventory Allocations**:
  - *Booked*: click **Mark In Use** to hand over
  - *In Use*: click **Volunteer Returned** to stage return
  - *Pending Review*: click **Verify & Return** to restock

**Allocating inventory:**
1. Click **Allocate Item** (or **Quick Book**).
2. In the popup pick the **Item**, choose **Booking For** (A Club / Other), the
   club, **Quantity**, **Event Name**, **Location**, volunteer details, and the
   **date/time**.
3. Click **Create Allocation**.

### 5.4 Venues & Bookings Tab

- **Venue cards** — each shows capacity, location, facilities. Click **Book
  Venue Room** to reserve it.
- **Booking History & Schedule Tracker** — all bookings. Use the filter by venue.
- **Actions** on confirmed bookings: **Mark Completed** or **Cancel Booking**.

**Making a booking:**
1. Click **Book Venue** (or **Book Venue Room** on a card).
2. Pick the **Venue**, choose **Booking For** (A Club / Other), the club and
   event name, then the **date** and **start/end times**.
3. Click **Confirm Booking**.

### 5.5 Event Proposals Tab

Review every club's proposals.

- **Proposals for Review** — pending proposals.
- **Approved Events** — completed approvals.

**Reviewing a proposal:**
1. Click a proposal to open its detail view.
2. Review each section — venue request, inventory requirements, procuring
   items, prize money, judge fees — and set a **Decision** per line item with a
   reason.
3. Add **General Suggestions / Feedback** in the text box.
4. Choose an action:
   - **Approve & Send to Faculty Coordinator** (green) — forwards to Faculty.
   - **Send for Revision** — sends back to the Club Head with your feedback.
   - **Reject Proposal** — rejects it outright.

### 5.6 Student Management Tab

- Search and filter all students.
- Open a student to see their memberships, volunteer applications, and
  certificates.

### 5.7 Resources Calendar Tab

- **Filter sidebar** — toggle between *Venues* and *Requirements*, check items
  to include, or **Select All**.
- **Calendar** — month view with dots on booked days.
- **Click a day** to open the booking details popup, including approved
  requirements.
- **Requirements view** lets you assign an item to a volunteer via the
  **Assigned To** box.

---

## 6. Faculty Coordinator Guide

The Faculty Coordinator has final administrative authority. The dashboard has
**7 tabs**. It shares the same shell as the President dashboard but with extra
powers.

### 6.1 Dashboard Tab

- **Stats** — allocated budget, spent, active bookings, inventory lent, and
  **Available to Allocate** (remaining master budget).
- **Finance Utilization** bar chart.
- **Venue Status** and **Inventory Alerts**.

**Editing the master budget pool:**
1. Click the **pencil icon** on the "Available to Allocate" card.
2. In the **Edit Master Budget Pool** popup, set the **Total Master Budget (Rs.)**.
3. Click **Save Budget Pool**.

### 6.2 Club Overview Tab

Everything the President sees, plus:

- **Create Club** button — create new clubs (see below).
- **Certification Verification** — the **final** step:
  - *Pending Faculty Approval*: click **Final Approve** to issue certificates.
  - *Verified*: click **Re-open** to undo.
- **Finances** — review expenses:
  - *Pending Faculty Review*: **Approve** or **Reject**
  - *Approved*: **Re-review** to reopen

**Creating a club:**
1. Click **Create Club**.
2. Fill in:
   - **Club Name** (required)
   - **Category** — Technical, Cultural, Social, Sports, Literary, Miscellaneous
   - **Description**
   - **Club Head Email** (leave blank to auto-generate)
   - **Club Head Password** (min 6 chars, leave blank to auto-generate)
3. Click **Create Club**.

> If you leave the email/password blank, they're auto-generated as
> `<clubname>@iitm.in` / `<clubname>123` (e.g. *Photography Club* →
> `photographyclub@iitm.in` / `photographyclub123`). The generated credentials
> are shown to you once after creation — hand them to the new Club Head.

### 6.3 Inventory Manager Tab

Everything the President can do except allocations, **plus** full asset control:

- **Add Inventory Item** — name, category, item code, total stock.
- **Bulk Import CSV** — upload a CSV of items.
- **Edit Asset Details** (on an item's detail view).
- **Delete Asset** — removes the item (blocked if usage records exist).
- The usage tracker is read-only (President handles allocations).

### 6.4 Venues Manager Tab

Full venue control:

- **Add Venue** — name, capacity, location, description, facilities, setup
  requirements.
- **Edit** / **Remove** on each venue card (removal is blocked if the venue has
  bookings or proposals).
- **Bulk Import CSV** — upload venues in bulk.
- Booking history is read-only.

### 6.5 Event Proposals Tab

The final approval stage:

- **Final Approve** — approves a proposal that the President already approved.
- **Request Changes** — sends it back (requires feedback in the **Feedback for
  the President** box).
- **Reject Event** — rejects it.

**Budget escalation:**
- If a proposal exceeds the club's remaining budget, a **Budget Escalation**
  panel appears. Enter a **Budget Top-Up Amount** to cover the shortfall before
  approving.

### 6.6 Student Management Tab

- **Bulk Student Onboarding** — upload a CSV
  (`student_id, name, email, password, department, year`) and click
  **Import CSV**. `email` and `password` may be left blank — they're
  auto-generated as `<student_id>@iitm.in` / `student@123`.
- **Add Student Manually** — create a single student. Leave the email/password
  blank to get the same auto-generated login.
- Below, the same searchable student directory as the President.

### 6.7 Resources Calendar Tab

Identical to the President's — filter resources and view bookings on a calendar.

---

## 7. End-to-End Workflows

Here are the typical journeys through the system.

### 7.1 From Member to Volunteer to Event Certificate

1. **Student** signs in and joins the *Dance Club* (**Clubs** → **Join Club**).
2. **Club Head** approves the membership (**Manage Members** → approve).
3. **Student** applies to volunteer in the *Events* domain (**Clubs** → club →
   **Join as Volunteer**).
4. **Club Head** selects the volunteer (**Volunteer Management** → **Select**).
5. **Club Head** creates a proposal for an event (**Event Proposals** →
   **New Proposal** → **Send for Approval**).
6. **President** reviews and approves (**Event Proposals** → **Approve &
   Send to Faculty Coordinator**).
7. **Faculty Coordinator** final-approves (**Event Proposals** → **Final
   Approve**). An Event is created.
8. **Club Head** publishes the event (**Event Management** → **Edit & Publish** →
   tick *Published* → **Save & Publish**).
9. **Student** registers (**Events** → **Register**) and gets a QR code.
10. On event day, **Club Head** scans the QR (**Event Management** →
    Registrations → QR scanner).
11. **Club Head** allots tasks to the volunteer and the volunteer completes
    them (**Club Activities** → Accept → Submit proof; Club Head **Approves**).
12. **Faculty Coordinator** finalizes the event (**Club Overview** →
    Certification Verification → **Final Approve**).
13. **Student** downloads their certificate (**Certificates** tab).

### 7.2 Budget Approval with Escalation

1. **Club Head** proposes an event that exceeds the club's budget.
2. The system warns about the shortfall; the Club Head submits anyway.
3. **President** sees it in **Event Proposals** and approves (it goes to
   Faculty because it needs extra funds).
4. **Faculty Coordinator** sees the **Budget Escalation** panel, enters a
   **Budget Top-Up**, and **Final Approves**.

### 7.3 Managing an Event's Finances

1. **Club Head** buys items and uploads bills (**Club Finances** → Upload Bill).
2. For prize money, enters student details; for judges, enters judge details.
3. **Club Head** clicks **Send for Processing**.
4. **President** reviews each expense (**Club Overview** → Finances → Approve/Reject).
5. **Faculty Coordinator** gives the final review.
6. Once all items are reviewed, the President can **Close Event Finance**.

---

## 8. Common Questions & Troubleshooting

### 8.1 "Invalid email or password"

- Check you're using the exact demo email/password from the login page.
- Make sure the backend is running (see below).

### 8.2 "The page loads but nothing happens when I sign in"

- The frontend needs to reach the backend. Verify the backend is running on
  `http://127.0.0.1:8000`.

### 8.3 A feature shows "won't survive a reload"

- This happens when an action isn't linked to a real backend record yet (e.g.
  an event that has no backend proposal). Most features are now fully
  linked; this message only appears for local-only demo data.

### 8.4 I can't delete a venue/inventory item

- Deletion is intentionally blocked if the item has bookings, proposals, or
  usage records — to preserve history. Free it by removing those references
  first.

### 8.5 The Club Activities / Chat tabs don't appear for me

- Those tabs only appear after a Club Head **selects you as a volunteer** in a
  club. Ask your Club Head to approve your application.

### 8.6 I'm a volunteer but I can't accept a task

- Only the volunteer the task was assigned to can accept it. If you see a
  *Revision Requested* task, click **Resume & Resubmit** to continue it.

### 8.7 How do I change my password?

Click the **key icon** in your sidebar profile card (next to Logout) and fill
in the **Change Password** popup — see
[1.5 Changing Your Password](#15-changing-your-password).

> There is no "forgot password" self-recovery yet. A Club Head whose password
> is lost can have it reset by the Faculty Coordinator or Club President from
> the club's edit screen.

### 8.8 Running the app locally

```bash
# 1. Start the backend (from the Backend folder)
cd Backend
.myenv/bin/python -m uvicorn app.main:app --port 8000

# 2. Start the frontend (from the Frontend folder, new terminal)
cd Frontend
python3 -m http.server 5500

# 3. Open in your browser
open http://localhost:5500
```

---

*Document generated 2026-08-08 | SSCMS Sprint 2*
