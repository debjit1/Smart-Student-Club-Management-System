# SSCMS — Complete API Documentation

**Smart Student Club Management System — Backend API**
**Team Hustlers (Team 103) | Sprint 2 (Milestone 4)**
**Base URL:** `http://127.0.0.1:8000`
**Spec:** OpenAPI 3.0.3
**Auth:** Bearer JWT in `Authorization` header (except login/register)

---

## Authentication

All authenticated endpoints require:
```
Authorization: Bearer <access_token>
```
Obtain a token via `POST /auth/login`. Tokens encode user ID and roles.

### Valid Roles

| Role | Description |
|------|-------------|
| `Student` | General student; can browse clubs, register for events |
| `Volunteer` | Student selected for a club domain; can accept tasks |
| `ClubHead` | Head of a specific club; manages members, events, tasks |
| `ClubPresident` | Oversees all clubs; reviews proposals and expenses |
| `FacultyCoordinator` | Admin; manages venues, inventory, budgets, final approvals |

---


### `POST /auth/bulk-import` — Bulk Import Users Auth Alias
**Request Body** (multipart/form-data):
  - `file`: `string | null`
  - `payload`: `array | null`

**Response (200)**:
  - `total`: `integer`
  - `imported`: `integer`
  - `failed`: `integer`
  - `results`: `array[BulkUserImportRowResult]`

**Errors**:
  - 403 Faculty Coordinator role required
  - 422 Validation Error

---

### `POST /auth/change-password` — Change Own Password
**Auth:** Any logged-in user (Student, Volunteer, ClubHead, ClubPresident,
FacultyCoordinator).

**Request Body** (JSON):
  - `current_password`: `string` *(required)*
  - `new_password`: `string` *(required, min length 6)*

**Response (200)**:
  - `message`: `string`

**Errors**:
  - 400 Current password is incorrect
  - 401 Not authenticated
  - 422 Validation Error (e.g. new password too short)

---

### `POST /auth/login` — Login
**Request Body** (JSON):
  - `email`: `string(email)` *(required)*
  - `password`: `string` *(required)*

**Response (200)**:
  - `access_token`: `string`
  - `token_type`: `string`
  - `user`: `UserOut`

**Errors**:
  - 401 Invalid email or password
  - 422 Validation Error

---

### `GET /auth/me` — Read Current User
**Response (200)**:
  - `id`: `integer`
  - `student_id`: `string`
  - `name`: `string`
  - `email`: `string(email)`
  - `department`: `string | null`
  - `year`: `string | null`
  - `roles`: `array[RoleOut]`

---

### `POST /auth/register` — Register
**Request Body** (JSON):
  - `student_id`: `string` *(required)*
  - `name`: `string` *(required)*
  - `email`: `string(email)` *(required)*
  - `password`: `string` *(required)*
  - `department`: `string | null`
  - `year`: `string | null`
  - `role`: `string` *(required)*
  - `club_id`: `integer | null`

**Response (201)**:
  - `id`: `integer`
  - `student_id`: `string`
  - `name`: `string`
  - `email`: `string(email)`
  - `department`: `string | null`
  - `year`: `string | null`
  - `roles`: `array[RoleOut]`

**Errors**:
  - 409 student_id or email already registered
  - 422 Validation Error

---


## Certification & Budget Analytics

### `GET /analytics/budget-overview` — Budget Overview
**Response (200)**:
  - `clubs`: `array[ClubBudgetOverview]`
  - `total_allocated`: `string`
  - `total_spent`: `string`
  - `active_bookings`: `integer`
  - `inventory_on_loan`: `integer`

---

### `GET /certificates` — List My Certificates
---

### `POST /events/{event_id}/finalize` — Finalize Event
**Path Parameters:**
  - `event_id` (integer)

**Response (200)**:
  - `event`: `EventOut`
  - `certificates_issued`: `array[CertificateOut]`

**Errors**:
  - 404 Event not found
  - 409 Event is already finalized
  - 422 Validation Error

---


## Club Chat

### `GET /clubs/{club_id}/chat` — List Chat Messages
**Path Parameters:**
  - `club_id` (integer)

**Query Parameters:**
  - `student_id`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `POST /clubs/{club_id}/chat` — Send Chat Message
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `student_id`: `string | null`
  - `text`: `string` *(required)*

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `student_id`: `string | null`
  - `sender_id`: `integer`
  - `sender_role`: `string`
  - `text`: `string`
  - `created_at`: `string(date-time)`

**Errors**:
  - 404 Club not found
  - 422 Validation Error

---


## Club Finance

### `POST /clubs/{club_id}/event-budgets` — Create Event Budget
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `event_name`: `string` *(required)*
  - `allotted`: `number | string` *(required)*
  - `proposal_id`: `integer | null`

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `proposal_id`: `integer | null`
  - `event_name`: `string`
  - `allotted`: `string`
  - `status`: `string`
  - `closed_on`: `string | null`
  - `comment`: `string | null`

**Errors**:
  - 422 Validation Error

---

### `GET /clubs/{club_id}/event-budgets` — List Event Budgets
**Path Parameters:**
  - `club_id` (integer)

**Errors**:
  - 422 Validation Error

---

### `GET /clubs/{club_id}/finance` — Get Club Finance
**Path Parameters:**
  - `club_id` (integer)

**Response (200)**:
  - `club_id`: `integer`
  - `allotted`: `string`
  - `spent`: `string`
  - `remaining`: `string`

**Errors**:
  - 422 Validation Error

---

### `GET /clubs/{club_id}/finance/transactions` — List Finance Transactions
**Path Parameters:**
  - `club_id` (integer)

**Errors**:
  - 422 Validation Error

---

### `POST /clubs/{club_id}/finance/transactions` — Create Finance Transaction
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `type`: `string` *(required)*
  - `amount`: `number | string` *(required)*
  - `description`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `type`: `string`
  - `amount`: `string`
  - `description`: `string | null`
  - `created_at`: `string(date-time)`

**Errors**:
  - 409 Adjustment exceeds current allotted budget
  - 422 Validation Error

---

### `GET /event-budgets/{event_budget_id}` — Get Event Budget
**Path Parameters:**
  - `event_budget_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `proposal_id`: `integer | null`
  - `event_name`: `string`
  - `allotted`: `string`
  - `status`: `string`
  - `closed_on`: `string | null`
  - `comment`: `string | null`

**Errors**:
  - 404 Event budget not found
  - 422 Validation Error

---

### `DELETE /event-budgets/{event_budget_id}` — Delete Event Budget
**Path Parameters:**
  - `event_budget_id` (integer)

**Errors**:
  - 422 Validation Error

---

### `POST /event-budgets/{event_budget_id}/close` — Close Event Budget
**Path Parameters:**
  - `event_budget_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `proposal_id`: `integer | null`
  - `event_name`: `string`
  - `allotted`: `string`
  - `status`: `string`
  - `closed_on`: `string | null`
  - `comment`: `string | null`

**Errors**:
  - 404 Event budget not found
  - 409 Already closed, or has expenses still awaiting review
  - 422 Validation Error

---

### `PATCH /event-budgets/{event_budget_id}/comment` — Update Event Budget Comment
**Path Parameters:**
  - `event_budget_id` (integer)

**Request Body** (JSON):
  - `comment`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `proposal_id`: `integer | null`
  - `event_name`: `string`
  - `allotted`: `string`
  - `status`: `string`
  - `closed_on`: `string | null`
  - `comment`: `string | null`

**Errors**:
  - 403 Forbidden
  - 422 Validation Error

---

### `POST /event-budgets/{event_budget_id}/expenses` — Create Expense
**Path Parameters:**
  - `event_budget_id` (integer)

**Request Body** (JSON):
  - `item_name`: `string` *(required)*
  - `type`: `string` *(required)*
  - `category`: `string | null`
  - `approved_amount`: `number | string` *(required)*
  - `source`: `string`
  - `bill_file_name`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `event_budget_id`: `integer`
  - `item_name`: `string`
  - `type`: `string`
  - `category`: `string | null`
  - `approved_amount`: `string`
  - `bill_amount`: `string | null`
  - `bill_file_name`: `string | null`
  - `bill_file_url`: `string | null`
  - `status`: `string`
  - `source`: `string`
  - `comment`: `string | null`
  - `prize_student_name`: `string | null`
  - `prize_student_id`: `string | null`
  - `prize_department`: `string | null`
  - `prize_affiliation`: `string | null`
  - `prize_bank_details`: `string | null`
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `judge_bank_details`: `string | null`

**Errors**:
  - 422 Validation Error

---

### `GET /event-budgets/{event_budget_id}/expenses` — List Expenses
**Path Parameters:**
  - `event_budget_id` (integer)

**Errors**:
  - 422 Validation Error

---

### `POST /event-budgets/{event_budget_id}/send-for-processing` — Send For Processing
**Path Parameters:**
  - `event_budget_id` (integer)

**Errors**:
  - 403 Forbidden
  - 422 Validation Error

---

### `POST /expenses/{expense_id}/faculty-review` — Faculty Review Expense
**Path Parameters:**
  - `expense_id` (integer)

**Request Body** (JSON):
  - `approve`: `boolean` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `event_budget_id`: `integer`
  - `item_name`: `string`
  - `type`: `string`
  - `category`: `string | null`
  - `approved_amount`: `string`
  - `bill_amount`: `string | null`
  - `bill_file_name`: `string | null`
  - `bill_file_url`: `string | null`
  - `status`: `string`
  - `source`: `string`
  - `comment`: `string | null`
  - `prize_student_name`: `string | null`
  - `prize_student_id`: `string | null`
  - `prize_department`: `string | null`
  - `prize_affiliation`: `string | null`
  - `prize_bank_details`: `string | null`
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `judge_bank_details`: `string | null`

**Errors**:
  - 409 Expense is not Pending Faculty Review
  - 422 Validation Error

---

### `POST /expenses/{expense_id}/judge-details` — Submit Judge Details
**Path Parameters:**
  - `expense_id` (integer)

**Request Body** (JSON):
  - `bill_amount`: `number | string` *(required)*
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `bank_details`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `event_budget_id`: `integer`
  - `item_name`: `string`
  - `type`: `string`
  - `category`: `string | null`
  - `approved_amount`: `string`
  - `bill_amount`: `string | null`
  - `bill_file_name`: `string | null`
  - `bill_file_url`: `string | null`
  - `status`: `string`
  - `source`: `string`
  - `comment`: `string | null`
  - `prize_student_name`: `string | null`
  - `prize_student_id`: `string | null`
  - `prize_department`: `string | null`
  - `prize_affiliation`: `string | null`
  - `prize_bank_details`: `string | null`
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `judge_bank_details`: `string | null`

**Errors**:
  - 403 Forbidden
  - 409 Conflict
  - 422 Validation Error

---

### `POST /expenses/{expense_id}/president-review` — President Review Expense
**Path Parameters:**
  - `expense_id` (integer)

**Request Body** (JSON):
  - `approve`: `boolean` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `event_budget_id`: `integer`
  - `item_name`: `string`
  - `type`: `string`
  - `category`: `string | null`
  - `approved_amount`: `string`
  - `bill_amount`: `string | null`
  - `bill_file_name`: `string | null`
  - `bill_file_url`: `string | null`
  - `status`: `string`
  - `source`: `string`
  - `comment`: `string | null`
  - `prize_student_name`: `string | null`
  - `prize_student_id`: `string | null`
  - `prize_department`: `string | null`
  - `prize_affiliation`: `string | null`
  - `prize_bank_details`: `string | null`
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `judge_bank_details`: `string | null`

**Errors**:
  - 409 Expense is not Pending President Review
  - 422 Validation Error

---

### `POST /expenses/{expense_id}/prize-details` — Submit Prize Details
**Path Parameters:**
  - `expense_id` (integer)

**Request Body** (JSON):
  - `bill_amount`: `number | string` *(required)*
  - `student_name`: `string | null`
  - `student_id`: `string | null`
  - `department`: `string | null`
  - `affiliation`: `string | null`
  - `bank_details`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `event_budget_id`: `integer`
  - `item_name`: `string`
  - `type`: `string`
  - `category`: `string | null`
  - `approved_amount`: `string`
  - `bill_amount`: `string | null`
  - `bill_file_name`: `string | null`
  - `bill_file_url`: `string | null`
  - `status`: `string`
  - `source`: `string`
  - `comment`: `string | null`
  - `prize_student_name`: `string | null`
  - `prize_student_id`: `string | null`
  - `prize_department`: `string | null`
  - `prize_affiliation`: `string | null`
  - `prize_bank_details`: `string | null`
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `judge_bank_details`: `string | null`

**Errors**:
  - 403 Forbidden
  - 409 Conflict
  - 422 Validation Error

---

### `POST /expenses/{expense_id}/reset` — Reset Expense
**Path Parameters:**
  - `expense_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `event_budget_id`: `integer`
  - `item_name`: `string`
  - `type`: `string`
  - `category`: `string | null`
  - `approved_amount`: `string`
  - `bill_amount`: `string | null`
  - `bill_file_name`: `string | null`
  - `bill_file_url`: `string | null`
  - `status`: `string`
  - `source`: `string`
  - `comment`: `string | null`
  - `prize_student_name`: `string | null`
  - `prize_student_id`: `string | null`
  - `prize_department`: `string | null`
  - `prize_affiliation`: `string | null`
  - `prize_bank_details`: `string | null`
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `judge_bank_details`: `string | null`

**Errors**:
  - 409 Expense is not Approved
  - 422 Validation Error

---

### `POST /expenses/{expense_id}/upload-bill` — Upload Bill
**Path Parameters:**
  - `expense_id` (integer)

**Request Body** (multipart/form-data):
  - `bill_amount`: `number | string` *(required)*
  - `file`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `event_budget_id`: `integer`
  - `item_name`: `string`
  - `type`: `string`
  - `category`: `string | null`
  - `approved_amount`: `string`
  - `bill_amount`: `string | null`
  - `bill_file_name`: `string | null`
  - `bill_file_url`: `string | null`
  - `status`: `string`
  - `source`: `string`
  - `comment`: `string | null`
  - `prize_student_name`: `string | null`
  - `prize_student_id`: `string | null`
  - `prize_department`: `string | null`
  - `prize_affiliation`: `string | null`
  - `prize_bank_details`: `string | null`
  - `judge_name`: `string | null`
  - `judge_contact`: `string | null`
  - `judge_bank_details`: `string | null`

**Errors**:
  - 403 Forbidden
  - 409 Conflict
  - 422 Validation Error

---

### `GET /faculty-budget-pool` — Get Faculty Budget Pool
**Response (200)**:
  - `total`: `string`

---

### `PATCH /faculty-budget-pool` — Update Faculty Budget Pool
**Request Body** (JSON):
  - `total`: `number | string` *(required)*

**Response (200)**:
  - `total`: `string`

**Errors**:
  - 409 Total is below what's already allotted to clubs
  - 422 Validation Error

---

### `POST /finance/transactions` — Create Global Finance Transaction
**Request Body** (JSON):
  - `club_id`: `integer` *(required)*
  - `type`: `string` *(required)*
  - `amount`: `number | string` *(required)*
  - `description`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `type`: `string`
  - `amount`: `string`
  - `description`: `string | null`
  - `created_at`: `string(date-time)`

**Errors**:
  - 409 Adjustment exceeds current allotted budget
  - 422 Validation Error

---


## Clubs & Membership

### `GET /clubs` — List Clubs
---

### `POST /clubs` — Create Club
**Request Body** (JSON):
  - `name`: `string` *(required)*
  - `category`: `string | null`
  - `description`: `string | null`
  - `history`: `string | null`
  - `achievements`: `array[string]`
  - `club_head_email`: `string | null`
  - `club_head_password`: `string | null`

**Response (201)**:
  - `club`: `ClubOut`
  - `club_head`: `ClubHeadCredentialsOut`

**Errors**:
  - 409 Club name or club head email already exists
  - 422 Validation Error

---

### `GET /clubs/{club_id}` — Get Club
**Path Parameters:**
  - `club_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `name`: `string`
  - `category`: `string | null`
  - `description`: `string | null`
  - `history`: `string | null`
  - `achievements`: `array[string]`
  - `status`: `string`
  - `president_id`: `integer | null`
  - `faculty_coordinator_id`: `integer | null`
  - `budget_allotted`: `string`
  - `budget_spent`: `string`

**Errors**:
  - 404 Club not found
  - 422 Validation Error

---

### `PATCH /clubs/{club_id}` — Update Club
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `description`: `string | null`
  - `category`: `string | null`
  - `history`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `name`: `string`
  - `category`: `string | null`
  - `description`: `string | null`
  - `history`: `string | null`
  - `achievements`: `array[string]`
  - `status`: `string`
  - `president_id`: `integer | null`
  - `faculty_coordinator_id`: `integer | null`
  - `budget_allotted`: `string`
  - `budget_spent`: `string`

**Errors**:
  - 403 Caller cannot manage this club
  - 404 Club not found
  - 422 Validation Error

---

### `DELETE /clubs/{club_id}` — Delete Club
**Path Parameters:**
  - `club_id` (integer)

**Errors**:
  - 403 Caller cannot manage this club
  - 404 Club not found
  - 422 Validation Error

---

### `POST /clubs/{club_id}/club-head/reset-password` — Reset Club Head Password
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `password`: `string` *(required)*

**Response (200)**:
  - `email`: `string`
  - `password`: `string`
  - `note`: `string`

**Errors**:
  - 403 Caller cannot manage this club
  - 404 Club or Club Head not found
  - 422 Validation Error

---

### `POST /clubs/{club_id}/domains` — Create Domain
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `title`: `string` *(required)*
  - `recruitment_open`: `boolean`

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `title`: `string`
  - `recruitment_open`: `boolean`
  - `opened_on`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 422 Validation Error

---

### `GET /clubs/{club_id}/domains` — List Domains
**Path Parameters:**
  - `club_id` (integer)

**Errors**:
  - 422 Validation Error

---

### `GET /clubs/{club_id}/members` — List Club Members
**Path Parameters:**
  - `club_id` (integer)

**Query Parameters:**
  - `status_filter`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `POST /clubs/{club_id}/members/apply` — Apply For Membership
**Path Parameters:**
  - `club_id` (integer)

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `user_id`: `integer`
  - `status`: `string`
  - `joined_on`: `string | null`
  - `name`: `string | null`
  - `student_id`: `string | null`
  - `email`: `string | null`
  - `department`: `string | null`
  - `year`: `string | null`

**Errors**:
  - 404 Club not found
  - 409 Already a member or already applied
  - 422 Validation Error

---

### `POST /clubs/{club_id}/members/{member_id}/review` — Review Membership
**Path Parameters:**
  - `club_id` (integer)
  - `member_id` (integer)

**Request Body** (JSON):
  - `approve`: `boolean` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `user_id`: `integer`
  - `status`: `string`
  - `joined_on`: `string | null`
  - `name`: `string | null`
  - `student_id`: `string | null`
  - `email`: `string | null`
  - `department`: `string | null`
  - `year`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Membership request not found
  - 409 Membership request already decided
  - 422 Validation Error

---

### `POST /clubs/{club_id}/review` — Review Club
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `approve`: `boolean` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `name`: `string`
  - `category`: `string | null`
  - `description`: `string | null`
  - `history`: `string | null`
  - `achievements`: `array[string]`
  - `status`: `string`
  - `president_id`: `integer | null`
  - `faculty_coordinator_id`: `integer | null`
  - `budget_allotted`: `string`
  - `budget_spent`: `string`

**Errors**:
  - 404 Club not found
  - 409 Club is not in Pending status
  - 422 Validation Error

---

### `POST /clubs/{club_id}/volunteer-applications` — Apply As Volunteer
**Path Parameters:**
  - `club_id` (integer)

**Request Body** (JSON):
  - `domain_id`: `integer` *(required)*
  - `note`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `domain_id`: `integer`
  - `applicant_id`: `integer`
  - `applied_on`: `string(date)`
  - `status`: `string`
  - `note`: `string | null`
  - `applicant_name`: `string | null`
  - `applicant_student_id`: `string | null`
  - `applicant_email`: `string | null`

**Errors**:
  - 404 Domain not found or recruitment closed
  - 409 Already applied to this domain
  - 422 Validation Error

---

### `GET /clubs/{club_id}/volunteer-applications` — List Volunteer Applications
**Path Parameters:**
  - `club_id` (integer)

**Query Parameters:**
  - `status_filter`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `POST /clubs/{club_id}/volunteer-applications/{application_id}/reopen` — Reopen Volunteer Application
**Path Parameters:**
  - `club_id` (integer)
  - `application_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `domain_id`: `integer`
  - `applicant_id`: `integer`
  - `applied_on`: `string(date)`
  - `status`: `string`
  - `note`: `string | null`
  - `applicant_name`: `string | null`
  - `applicant_student_id`: `string | null`
  - `applicant_email`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Application not found
  - 409 Application is not Rejected or Revoked
  - 422 Validation Error

---

### `POST /clubs/{club_id}/volunteer-applications/{application_id}/review` — Review Volunteer Application
**Path Parameters:**
  - `club_id` (integer)
  - `application_id` (integer)

**Request Body** (JSON):
  - `approve`: `boolean` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `domain_id`: `integer`
  - `applicant_id`: `integer`
  - `applied_on`: `string(date)`
  - `status`: `string`
  - `note`: `string | null`
  - `applicant_name`: `string | null`
  - `applicant_student_id`: `string | null`
  - `applicant_email`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Application not found
  - 409 Application already decided
  - 422 Validation Error

---

### `POST /clubs/{club_id}/volunteer-applications/{application_id}/revoke` — Revoke Volunteer Application
**Path Parameters:**
  - `club_id` (integer)
  - `application_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `domain_id`: `integer`
  - `applicant_id`: `integer`
  - `applied_on`: `string(date)`
  - `status`: `string`
  - `note`: `string | null`
  - `applicant_name`: `string | null`
  - `applicant_student_id`: `string | null`
  - `applicant_email`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Application not found
  - 409 Application is not currently Selected
  - 422 Validation Error

---

### `DELETE /domains/{domain_id}` — Delete Domain
**Path Parameters:**
  - `domain_id` (integer)

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Domain not found
  - 409 Domain has Pending or Selected volunteer applications
  - 422 Validation Error

---

### `PATCH /domains/{domain_id}/recruitment` — Toggle Recruitment
**Path Parameters:**
  - `domain_id` (integer)

**Query Parameters:**
  - `recruitment_open`: `boolean` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `title`: `string`
  - `recruitment_open`: `boolean`
  - `opened_on`: `string | null`

**Errors**:
  - 404 Domain not found
  - 422 Validation Error

---

### `GET /me/memberships` — List My Memberships
---

### `GET /me/volunteer-applications` — List My Volunteer Applications
---


## Event Proposals & Events

### `GET /events` — List Events
**Query Parameters:**
  - `club_id`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `GET /events/{event_id}` — Get Event
**Path Parameters:**
  - `event_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `proposal_id`: `integer | null`
  - `club_id`: `integer`
  - `name`: `string`
  - `description`: `string | null`
  - `venue_id`: `integer | null`
  - `event_date`: `string | null`
  - `registration_deadline`: `string | null`
  - `published`: `boolean`
  - `finalized`: `boolean`

**Errors**:
  - 404 Event not found
  - 422 Validation Error

---

### `POST /events/{event_id}/publish` — Publish Event
**Path Parameters:**
  - `event_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `proposal_id`: `integer | null`
  - `club_id`: `integer`
  - `name`: `string`
  - `description`: `string | null`
  - `venue_id`: `integer | null`
  - `event_date`: `string | null`
  - `registration_deadline`: `string | null`
  - `published`: `boolean`
  - `finalized`: `boolean`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Event not found
  - 422 Validation Error

---

### `POST /proposals` — Create Proposal
**Request Body** (JSON):
  - `club_id`: `integer` *(required)*
  - `event_name`: `string` *(required)*
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `number | string | null`

**Response (201)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `event_name`: `string`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `string | null`
  - `status`: `string`
  - `submitted_by`: `integer | null`
  - `rejection_reason`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Club or venue not found
  - 422 Validation Error

---

### `GET /proposals` — List Proposals
**Query Parameters:**
  - `club_id`: `?` *(optional)*
  - `status_filter`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `GET /proposals/{proposal_id}` — Get Proposal
**Path Parameters:**
  - `proposal_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `event_name`: `string`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `string | null`
  - `status`: `string`
  - `submitted_by`: `integer | null`
  - `rejection_reason`: `string | null`

**Errors**:
  - 404 Proposal not found
  - 422 Validation Error

---

### `PATCH /proposals/{proposal_id}` — Update Proposal
**Path Parameters:**
  - `proposal_id` (integer)

**Request Body** (JSON):
  - `club_id`: `integer | null`
  - `event_name`: `string | null`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `number | string | null`

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `event_name`: `string`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `string | null`
  - `status`: `string`
  - `submitted_by`: `integer | null`
  - `rejection_reason`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Proposal not found
  - 409 Proposal is not in Draft or Needs Revision status
  - 422 Validation Error

---

### `POST /proposals/{proposal_id}/faculty-review` — Faculty Review
**Path Parameters:**
  - `proposal_id` (integer)

**Request Body** (JSON):
  - `approve`: `boolean` *(required)*
  - `reason`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `event_name`: `string`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `string | null`
  - `status`: `string`
  - `submitted_by`: `integer | null`
  - `rejection_reason`: `string | null`

**Errors**:
  - 404 Proposal not found
  - 409 Proposal is not Pending Faculty Approval, or its venue is already booked (Story 2.1)
  - 422 Validation Error

---

### `POST /proposals/{proposal_id}/president-review` — President Review
**Path Parameters:**
  - `proposal_id` (integer)

**Request Body** (JSON):
  - `approve`: `boolean` *(required)*
  - `reason`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `event_name`: `string`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `string | null`
  - `status`: `string`
  - `submitted_by`: `integer | null`
  - `rejection_reason`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club President
  - 404 Proposal not found
  - 409 Proposal is not Pending President Review
  - 422 Validation Error

---

### `POST /proposals/{proposal_id}/send-for-revision` — Send Proposal For Revision
**Path Parameters:**
  - `proposal_id` (integer)

**Request Body** (JSON):
  - `reason`: `string` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `event_name`: `string`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `string | null`
  - `status`: `string`
  - `submitted_by`: `integer | null`
  - `rejection_reason`: `string | null`

**Errors**:
  - 403 Caller is not this club's President (Pending President Review) / Faculty Coordinator (Pending Faculty Approval)
  - 404 Proposal not found
  - 409 Proposal is not Pending President Review or Pending Faculty Approval
  - 422 Validation Error

---

### `POST /proposals/{proposal_id}/submit` — Submit Proposal
**Path Parameters:**
  - `proposal_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `club_id`: `integer`
  - `event_name`: `string`
  - `description`: `string | null`
  - `schedule_date`: `string | null`
  - `time_slot`: `string | null`
  - `estimated_participants`: `integer | null`
  - `capacity_required`: `integer | null`
  - `line_items_json`: `string | null`
  - `venue_id`: `integer | null`
  - `budget_estimate`: `string | null`
  - `status`: `string`
  - `submitted_by`: `integer | null`
  - `rejection_reason`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Proposal not found
  - 409 Proposal is not in Draft status
  - 422 Validation Error

---


## Health

### `GET /health` — Health Check
---


## LLM-Assisted Features

### `POST /llm/event-proposal-assist` — Event Proposal Assistant
> Supports Story 3.1 (Event Proposal Pipeline): when a Club Head is creating a new event proposal, this endpoint takes a minimal input (event name, objective, expected participants) and returns a fully drafted proposal including: event description, age...

**Request Body** (JSON):
  - `event_name`: `string` *(required)*
  - `objective`: `string` *(required)*
  - `expected_participants`: `integer` *(required)*

**Response (200)**:
  - `source`: `string`
  - `event_description`: `string`
  - `agenda`: `array[AgendaItem]`
  - `budget_estimate`: `number`
  - `required_inventory`: `array[InventoryItemSuggestion]`
  - `volunteers_required`: `integer`
  - `risk_assessment`: `string`
  - `timeline`: `array[TimelinePhase]`

**Errors**:
  - 422 Validation Error

---

### `POST /llm/notification-digest` — Notification Digest
> Cross-cutting platform feature backing every role's notification feed: summarizes a caller's unread notifications (approvals, rejections, deadlines) into a short digest plus up to 3 highlight bullets. Calls Gemini (GEMINI_API_KEY) when configured; ot...

**Request Body** (JSON):
  - `notifications`: `array[NotificationIn]` *(required)*

**Response (200)**:
  - `source`: `string`
  - `summary`: `string`
  - `highlights`: `array[string]`

**Errors**:
  - 422 Validation Error

---


## Notifications

### `GET /notifications` — List My Notifications
---

### `POST /notifications` — Create Notification
**Request Body** (JSON):
  - `message`: `string` *(required)*

**Response (201)**:
  - `id`: `integer`
  - `user_id`: `integer`
  - `message`: `string`
  - `read`: `boolean`
  - `created_at`: `string(date-time)`

**Errors**:
  - 422 Validation Error

---

### `POST /notifications/read-all` — Read All Notifications
---


## QR Attendance

### `GET /events/{event_id}/attendance-stats` — Get Attendance Stats
> Return real-time attendance statistics for an event.

Accessible to the event's Club Head, Club President, or Faculty
Coordinator -- the same roles that can view the full roster.

**Path Parameters:**
  - `event_id` (integer)

**Response (200)**:
  - `event_id`: `integer`
  - `total_registered`: `integer`
  - `checked_in`: `integer`
  - `pending`: `integer`
  - `last_check_in_at`: `string | null`

**Errors**:
  - 404 Event not found
  - 422 Validation Error

---

### `POST /events/{event_id}/registrations` — Register For Event
**Path Parameters:**
  - `event_id` (integer)

**Response (201)**:
  - `id`: `integer`
  - `event_id`: `integer`
  - `user_id`: `integer`
  - `qr_token`: `string`
  - `status`: `string`
  - `registered_at`: `string(date-time)`
  - `checked_in_at`: `string | null`

**Errors**:
  - 404 Event not found
  - 409 Already registered for this event
  - 422 Validation Error

---

### `GET /events/{event_id}/registrations` — List Event Registrations
**Path Parameters:**
  - `event_id` (integer)

**Errors**:
  - 404 Event not found
  - 422 Validation Error

---

### `GET /registrations/mine` — List My Registrations
---

### `POST /registrations/{qr_token}/check-in` — Check In
**Path Parameters:**
  - `qr_token` (integer)

**Response (200)**:
  - `id`: `integer`
  - `event_id`: `integer`
  - `user_id`: `integer`
  - `qr_token`: `string`
  - `status`: `string`
  - `registered_at`: `string(date-time)`
  - `checked_in_at`: `string | null`

**Errors**:
  - 403 Caller cannot check attendees in for this event
  - 404 Registration not found for this token
  - 409 Already checked in
  - 422 Validation Error

---


## Report Generation

### `POST /reports` — Generate Report
> Generate and persist an analytics report.  The Faculty Coordinator
can request a specific report type with an optional date range filter.

**Request Body** (JSON):
  - `report_type`: `string` *(required)*
  - `date_from`: `string | null`
  - `date_to`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `report_type`: `string`
  - `title`: `string`
  - `date_from`: `string | null`
  - `date_to`: `string | null`
  - `data`: `object | null`
  - `generated_by`: `integer`
  - `created_at`: `string | null`

**Errors**:
  - 422 Unprocessable Entity

---

### `GET /reports` — List Reports
> List all previously generated reports, optionally filtered by type.

**Query Parameters:**
  - `report_type`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `GET /reports/{report_id}` — Get Report
> Retrieve a single report by ID.

**Path Parameters:**
  - `report_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `report_type`: `string`
  - `title`: `string`
  - `date_from`: `string | null`
  - `date_to`: `string | null`
  - `data`: `object | null`
  - `generated_by`: `integer`
  - `created_at`: `string | null`

**Errors**:
  - 404 Not Found
  - 422 Validation Error

---

### `GET /reports/{report_id}/download` — Download Report
> Download a report as a CSV file.

**Path Parameters:**
  - `report_id` (integer)

**Errors**:
  - 404 Not Found
  - 422 Validation Error

---


## Student Management

### `GET /students` — List Students
**Errors**:
  - 403 Faculty Coordinator, Club President, or Club Head role required

---

### `POST /students` — Create Student Manual
**Request Body** (JSON):
  - `student_id`: `string` *(required)*
  - `name`: `string` *(required)*
  - `email`: `string(email)` *(required)*
  - `password`: `string` *(required)*
  - `department`: `string | null`
  - `year`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `student_id`: `string`
  - `name`: `string`
  - `email`: `string(email)`
  - `department`: `string | null`
  - `year`: `string | null`
  - `created_at`: `string | null`
  - `roles`: `array[string]`
  - `memberships`: `array[StudentMembershipOut]`
  - `registrations`: `array[StudentRegistrationOut]`
  - `certificates`: `array[StudentCertificateOut]`

**Errors**:
  - 403 Faculty Coordinator role required
  - 409 User already exists
  - 422 Validation Error

---

### `POST /users/bulk-import` — Bulk Import Users
**Request Body** (multipart/form-data):
  - `file`: `string | null`
  - `payload`: `array | null`

**Response (200)**:
  - `total`: `integer`
  - `imported`: `integer`
  - `failed`: `integer`
  - `results`: `array[BulkUserImportRowResult]`

**Errors**:
  - 403 Faculty Coordinator role required
  - 422 Validation Error

---


## Task Management

### `POST /events/{event_id}/tasks` — Create Task
**Path Parameters:**
  - `event_id` (integer)

**Request Body** (JSON):
  - `assigned_to`: `integer` *(required)*
  - `type`: `string` *(required)*
  - `title`: `string` *(required)*
  - `description`: `string | null`
  - `priority`: `string`
  - `deadline`: `string | null`
  - `expense_id`: `integer | null`

**Response (201)**:
  - `id`: `integer`
  - `event_id`: `integer`
  - `club_id`: `integer`
  - `assigned_to`: `integer`
  - `assigned_by`: `integer`
  - `type`: `string`
  - `title`: `string`
  - `description`: `string | null`
  - `priority`: `string`
  - `deadline`: `string | null`
  - `expense_id`: `integer | null`
  - `status`: `string`
  - `proof_text`: `string | null`
  - `proof_file_name`: `string | null`
  - `submitted_at`: `string | null`
  - `review_comment`: `string | null`
  - `reviewed_at`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Event not found, or assignee is not a Volunteer of this club
  - 422 Validation Error

---

### `GET /events/{event_id}/tasks` — List Event Tasks
**Path Parameters:**
  - `event_id` (integer)

**Query Parameters:**
  - `status_filter`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `GET /tasks/mine` — List My Tasks
**Query Parameters:**
  - `status_filter`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `POST /tasks/{task_id}/accept` — Accept Task
**Path Parameters:**
  - `task_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `event_id`: `integer`
  - `club_id`: `integer`
  - `assigned_to`: `integer`
  - `assigned_by`: `integer`
  - `type`: `string`
  - `title`: `string`
  - `description`: `string | null`
  - `priority`: `string`
  - `deadline`: `string | null`
  - `expense_id`: `integer | null`
  - `status`: `string`
  - `proof_text`: `string | null`
  - `proof_file_name`: `string | null`
  - `submitted_at`: `string | null`
  - `review_comment`: `string | null`
  - `reviewed_at`: `string | null`

**Errors**:
  - 403 Caller is not this task's assignee
  - 404 Task not found
  - 409 Task is not Assigned
  - 422 Validation Error

---

### `POST /tasks/{task_id}/review` — Review Task
**Path Parameters:**
  - `task_id` (integer)

**Request Body** (JSON):
  - `verified`: `boolean` *(required)*
  - `comment`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `event_id`: `integer`
  - `club_id`: `integer`
  - `assigned_to`: `integer`
  - `assigned_by`: `integer`
  - `type`: `string`
  - `title`: `string`
  - `description`: `string | null`
  - `priority`: `string`
  - `deadline`: `string | null`
  - `expense_id`: `integer | null`
  - `status`: `string`
  - `proof_text`: `string | null`
  - `proof_file_name`: `string | null`
  - `submitted_at`: `string | null`
  - `review_comment`: `string | null`
  - `reviewed_at`: `string | null`

**Errors**:
  - 403 Caller is not this club's Club Head
  - 404 Task not found
  - 409 Task is not Submitted
  - 422 Validation Error

---

### `POST /tasks/{task_id}/submit-proof` — Submit Proof
**Path Parameters:**
  - `task_id` (integer)

**Request Body** (JSON):
  - `proof_text`: `string | null`
  - `proof_file_name`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `event_id`: `integer`
  - `club_id`: `integer`
  - `assigned_to`: `integer`
  - `assigned_by`: `integer`
  - `type`: `string`
  - `title`: `string`
  - `description`: `string | null`
  - `priority`: `string`
  - `deadline`: `string | null`
  - `expense_id`: `integer | null`
  - `status`: `string`
  - `proof_text`: `string | null`
  - `proof_file_name`: `string | null`
  - `submitted_at`: `string | null`
  - `review_comment`: `string | null`
  - `reviewed_at`: `string | null`

**Errors**:
  - 403 Caller is not this task's assignee
  - 404 Task not found
  - 409 Task is not Accepted or Revision Requested
  - 422 Validation Error

---


## Venues, Inventory & Bookings

### `POST /bookings` — Create Booking
**Request Body** (JSON):
  - `venue_id`: `integer` *(required)*
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `event_name`: `string | null`
  - `booking_date`: `string(date)` *(required)*
  - `time_slot`: `string | null`
  - `requirements`: `array | string | null`
  - `status`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `venue_id`: `integer`
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `club_name`: `string | null`
  - `venue_name`: `string | null`
  - `event_name`: `string | null`
  - `booking_date`: `string(date)`
  - `time_slot`: `string | null`
  - `requirements`: `array | null`
  - `status`: `string`

**Errors**:
  - 404 Venue or event not found
  - 409 Venue already booked for this date
  - 422 Validation Error

---

### `GET /bookings` — List Bookings
**Query Parameters:**
  - `venue_id`: `?` *(optional)*

**Errors**:
  - 422 Validation Error

---

### `PATCH /bookings/{booking_id}` — Update Booking Status
**Path Parameters:**
  - `booking_id` (integer)

**Request Body** (JSON):
  - `status`: `string` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `venue_id`: `integer`
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `club_name`: `string | null`
  - `venue_name`: `string | null`
  - `event_name`: `string | null`
  - `booking_date`: `string(date)`
  - `time_slot`: `string | null`
  - `requirements`: `array | null`
  - `status`: `string`

**Errors**:
  - 422 Validation Error

---

### `POST /bookings/{booking_id}/release` — Release Booking
**Path Parameters:**
  - `booking_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `venue_id`: `integer`
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `club_name`: `string | null`
  - `venue_name`: `string | null`
  - `event_name`: `string | null`
  - `booking_date`: `string(date)`
  - `time_slot`: `string | null`
  - `requirements`: `array | null`
  - `status`: `string`

**Errors**:
  - 404 Booking not found
  - 422 Validation Error

---

### `GET /inventory` — List Inventory
---

### `POST /inventory` — Create Inventory Item
**Request Body** (JSON):
  - `code`: `string` *(required)*
  - `name`: `string` *(required)*
  - `category`: `string | null`
  - `total_stock`: `integer` *(required)*
  - `available_stock`: `integer | null`

**Response (201)**:
  - `id`: `integer`
  - `code`: `string`
  - `name`: `string`
  - `category`: `string | null`
  - `total_stock`: `integer`
  - `available_stock`: `integer`
  - `status`: `string`

**Errors**:
  - 409 Item code already exists
  - 422 Validation Error

---

### `POST /inventory/bulk` — Create Inventory Bulk
**Request Body** (multipart/form-data):
  - `file`: `string | null`
  - `payload`: `array | null`

**Response (200)**:
  - `total`: `integer`
  - `created`: `integer`
  - `failed`: `integer`
  - `results`: `array[BulkInventoryItemResult]`

**Errors**:
  - 403 Faculty Coordinator role required
  - 422 Validation Error

---

### `POST /inventory/bulk-import` — Create Inventory Bulk
**Request Body** (multipart/form-data):
  - `file`: `string | null`
  - `payload`: `array | null`

**Response (200)**:
  - `total`: `integer`
  - `created`: `integer`
  - `failed`: `integer`
  - `results`: `array[BulkInventoryItemResult]`

**Errors**:
  - 403 Faculty Coordinator role required
  - 422 Validation Error

---

### `GET /inventory/usage` — List Inventory Usage
---

### `POST /inventory/usage` — Create Inventory Usage
**Request Body** (JSON):
  - `item_id`: `integer` *(required)*
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `event_name`: `string | null`
  - `venue_id`: `integer | null`
  - `location`: `string | null`
  - `quantity`: `integer` *(required)*
  - `booking_date`: `string | null`
  - `time_slot`: `string | null`
  - `status`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `item_id`: `integer`
  - `item_name`: `string | null`
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `club_name`: `string | null`
  - `event_name`: `string | null`
  - `venue_id`: `integer | null`
  - `location`: `string | null`
  - `quantity`: `integer`
  - `booking_date`: `string | null`
  - `time_slot`: `string | null`
  - `checked_out_at`: `string | null`
  - `returned_at`: `string | null`
  - `status`: `string`

**Errors**:
  - 422 Validation Error

---

### `POST /inventory/usage/{usage_id}/mark-in-use` — Mark Inventory Usage In Use
**Path Parameters:**
  - `usage_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `item_id`: `integer`
  - `item_name`: `string | null`
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `club_name`: `string | null`
  - `event_name`: `string | null`
  - `venue_id`: `integer | null`
  - `location`: `string | null`
  - `quantity`: `integer`
  - `booking_date`: `string | null`
  - `time_slot`: `string | null`
  - `checked_out_at`: `string | null`
  - `returned_at`: `string | null`
  - `status`: `string`

**Errors**:
  - 422 Validation Error

---

### `POST /inventory/usage/{usage_id}/return` — Return Inventory Usage
**Path Parameters:**
  - `usage_id` (integer)

**Response (200)**:
  - `id`: `integer`
  - `item_id`: `integer`
  - `item_name`: `string | null`
  - `event_id`: `integer | null`
  - `club_id`: `integer | null`
  - `club_name`: `string | null`
  - `event_name`: `string | null`
  - `venue_id`: `integer | null`
  - `location`: `string | null`
  - `quantity`: `integer`
  - `booking_date`: `string | null`
  - `time_slot`: `string | null`
  - `checked_out_at`: `string | null`
  - `returned_at`: `string | null`
  - `status`: `string`

**Errors**:
  - 422 Validation Error

---

### `PATCH /inventory/{item_id}` — Update Inventory Item
**Path Parameters:**
  - `item_id` (integer)

**Request Body** (JSON):
  - `code`: `string | null`
  - `name`: `string | null`
  - `category`: `string | null`
  - `total_stock`: `integer | null`
  - `available_stock`: `integer | null`

**Response (200)**:
  - `id`: `integer`
  - `code`: `string`
  - `name`: `string`
  - `category`: `string | null`
  - `total_stock`: `integer`
  - `available_stock`: `integer`
  - `status`: `string`

**Errors**:
  - 403 Faculty Coordinator role required
  - 404 Inventory item not found
  - 422 Validation Error

---

### `DELETE /inventory/{item_id}` — Delete Inventory Item
**Path Parameters:**
  - `item_id` (integer)

**Errors**:
  - 403 Faculty Coordinator role required
  - 404 Inventory item not found
  - 409 Item is referenced by inventory usage
  - 422 Validation Error

---

### `POST /inventory/{item_id}/checkout` — Checkout Inventory
**Path Parameters:**
  - `item_id` (integer)

**Query Parameters:**
  - `event_id`: `integer` *(required)*
  - `quantity`: `integer` *(required)*

**Response (200)**:
  - `id`: `integer`
  - `code`: `string`
  - `name`: `string`
  - `category`: `string | null`
  - `total_stock`: `integer`
  - `available_stock`: `integer`
  - `status`: `string`

**Errors**:
  - 404 Item or event not found
  - 409 Not enough available stock
  - 422 Validation Error

---

### `GET /venues` — List Venues
---

### `POST /venues` — Create Venue
**Request Body** (JSON):
  - `name`: `string` *(required)*
  - `capacity`: `integer | null`
  - `location`: `string | null`
  - `facilities`: `string | null`
  - `requirements`: `string | null`

**Response (201)**:
  - `id`: `integer`
  - `name`: `string`
  - `capacity`: `integer | null`
  - `location`: `string | null`
  - `facilities`: `string | null`
  - `requirements`: `string | null`

**Errors**:
  - 422 Validation Error

---

### `POST /venues/bulk` — Create Venues Bulk
**Request Body** (multipart/form-data):
  - `file`: `string | null`
  - `payload`: `array | null`

**Response (200)**:
  - `total`: `integer`
  - `created`: `integer`
  - `failed`: `integer`
  - `results`: `array[BulkVenueItemResult]`

**Errors**:
  - 403 Faculty Coordinator role required
  - 422 Validation Error

---

### `POST /venues/bulk-import` — Create Venues Bulk
**Request Body** (multipart/form-data):
  - `file`: `string | null`
  - `payload`: `array | null`

**Response (200)**:
  - `total`: `integer`
  - `created`: `integer`
  - `failed`: `integer`
  - `results`: `array[BulkVenueItemResult]`

**Errors**:
  - 403 Faculty Coordinator role required
  - 422 Validation Error

---

### `PATCH /venues/{venue_id}` — Update Venue
**Path Parameters:**
  - `venue_id` (integer)

**Request Body** (JSON):
  - `name`: `string | null`
  - `capacity`: `integer | null`
  - `location`: `string | null`
  - `facilities`: `string | null`
  - `requirements`: `string | null`

**Response (200)**:
  - `id`: `integer`
  - `name`: `string`
  - `capacity`: `integer | null`
  - `location`: `string | null`
  - `facilities`: `string | null`
  - `requirements`: `string | null`

**Errors**:
  - 403 Faculty Coordinator role required
  - 404 Venue not found
  - 422 Validation Error

---

### `DELETE /venues/{venue_id}` — Delete Venue
**Path Parameters:**
  - `venue_id` (integer)

**Errors**:
  - 403 Faculty Coordinator role required
  - 404 Venue not found
  - 409 Venue is referenced by a booking or an event proposal
  - 422 Validation Error

---

### `GET /venues/{venue_id}/availability` — Check Venue Availability
> Story 2.1: reports whether `venue_id` is free on `booking_date`
(YYYY-MM-DD) by looking for an existing non-Released booking.

**Path Parameters:**
  - `venue_id` (integer)

**Query Parameters:**
  - `booking_date`: `string` *(required)*

**Errors**:
  - 404 Venue not found
  - 422 Validation Error

---

