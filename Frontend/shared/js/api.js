/* ============================================================
   SSCMS API CLIENT — thin fetch wrapper around the FastAPI backend
   (Backend/app/main.py). Attaches the bearer token from the logged-in
   session (localStorage "sscms_session") to every request. Depends on
   shared/js/api-config.js (SSCMS_API_BASE) being loaded first; does NOT
   depend on shared/js/session.js so load order between the two doesn't
   matter.
============================================================= */

function sscmsAuthToken() {
    try {
        const session = JSON.parse(localStorage.getItem("sscms_session"));
        return (session && session.token) || null;
    } catch (e) {
        return null;
    }
}

class ApiError extends Error {
    constructor(status, detail) {
        super(typeof detail === "string" ? detail : JSON.stringify(detail));
        this.status = status;
        this.detail = detail;
    }
}

async function apiRequest(method, path, { body, params, auth = true } = {}) {
    let url = `${SSCMS_API_BASE}${path}`;
    if (params) {
        const usp = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") usp.append(k, v);
        });
        const qs = usp.toString();
        if (qs) url += `?${qs}`;
    }

    // A FormData body (real file uploads) must NOT get a JSON Content-Type or
    // be stringified -- fetch sets the correct multipart boundary itself.
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

    const headers = {};
    if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
    if (auth) {
        const token = sscmsAuthToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    let resp;
    try {
        resp = await fetch(url, {
            method,
            headers,
            body: body === undefined ? undefined : (isFormData ? body : JSON.stringify(body)),
        });
    } catch (networkErr) {
        throw new ApiError(0, `Server connection error (${networkErr.message || "Failed to fetch"}). Please ensure the backend server is running at ${SSCMS_API_BASE}.`);
    }

    if (resp.status === 204) return null;

    let data = null;
    const text = await resp.text();
    if (text) {
        try { data = JSON.parse(text); } catch (e) { data = text; }
    }

    if (!resp.ok) {
        const detail = (data && data.detail) || resp.statusText || "Request failed";
        throw new ApiError(resp.status, detail);
    }
    return data;
}

const Api = {
    // ── Auth ──────────────────────────────────────────────────────
    login: (email, password) => apiRequest("POST", "/auth/login", { body: { email, password }, auth: false }),
    register: (payload) => apiRequest("POST", "/auth/register", { body: payload, auth: false }),
    me: () => apiRequest("GET", "/auth/me"),
    changePassword: (payload) => apiRequest("POST", "/auth/change-password", { body: payload }),
    myMemberships: () => apiRequest("GET", "/me/memberships"),
    myVolunteerApplications: () => apiRequest("GET", "/me/volunteer-applications"),

    // ── Clubs & membership ───────────────────────────────────────
    listClubs: () => apiRequest("GET", "/clubs"),
    getClub: (id) => apiRequest("GET", `/clubs/${id}`),
    createClub: (payload) => apiRequest("POST", "/clubs", { body: payload }),
    updateClub: (id, payload) => apiRequest("PATCH", `/clubs/${id}`, { body: payload }),
    deleteClub: (id) => apiRequest("DELETE", `/clubs/${id}`),
    resetClubHeadPassword: (id, password) =>
        apiRequest("POST", `/clubs/${id}/club-head/reset-password`, { body: { password } }),
    reviewClub: (id, approve) => apiRequest("POST", `/clubs/${id}/review`, { body: { approve } }),

    applyMembership: (clubId) => apiRequest("POST", `/clubs/${clubId}/members/apply`),
    listMembers: (clubId, statusFilter) =>
        apiRequest("GET", `/clubs/${clubId}/members`, { params: { status_filter: statusFilter } }),
    reviewMembership: (clubId, memberId, approve) =>
        apiRequest("POST", `/clubs/${clubId}/members/${memberId}/review`, { body: { approve } }),

    // ── Recruitment domains ──────────────────────────────────────
    listDomains: (clubId) => apiRequest("GET", `/clubs/${clubId}/domains`),
    createDomain: (clubId, title, recruitmentOpen) =>
        apiRequest("POST", `/clubs/${clubId}/domains`, { body: { title, recruitment_open: recruitmentOpen } }),
    toggleRecruitment: (domainId, recruitmentOpen) =>
        apiRequest("PATCH", `/domains/${domainId}/recruitment`, { params: { recruitment_open: recruitmentOpen } }),
    deleteDomain: (domainId) => apiRequest("DELETE", `/domains/${domainId}`),

    // ── Volunteer applications ───────────────────────────────────
    applyVolunteer: (clubId, domainId, note) =>
        apiRequest("POST", `/clubs/${clubId}/volunteer-applications`, { body: { domain_id: domainId, note } }),
    listVolunteerApplications: (clubId, statusFilter) =>
        apiRequest("GET", `/clubs/${clubId}/volunteer-applications`, { params: { status_filter: statusFilter } }),
    reviewVolunteerApplication: (clubId, applicationId, approve) =>
        apiRequest("POST", `/clubs/${clubId}/volunteer-applications/${applicationId}/review`, { body: { approve } }),
    revokeVolunteerApplication: (clubId, applicationId) =>
        apiRequest("POST", `/clubs/${clubId}/volunteer-applications/${applicationId}/revoke`),
    reopenVolunteerApplication: (clubId, applicationId) =>
        apiRequest("POST", `/clubs/${clubId}/volunteer-applications/${applicationId}/reopen`),

    // ── Venues & inventory ────────────────────────────────────────
    listVenues: () => apiRequest("GET", "/venues"),
    createVenue: (payload) => apiRequest("POST", "/venues", { body: payload }),
    updateVenue: (id, payload) => apiRequest("PATCH", `/venues/${id}`, { body: payload }),
    deleteVenue: (id) => apiRequest("DELETE", `/venues/${id}`),
    venueAvailability: (venueId, bookingDate) =>
        apiRequest("GET", `/venues/${venueId}/availability`, { params: { booking_date: bookingDate } }),

    listInventory: () => apiRequest("GET", "/inventory"),
    createInventoryItem: (payload) => apiRequest("POST", "/inventory", { body: payload }),
    updateInventoryItem: (id, payload) => apiRequest("PATCH", `/inventory/${id}`, { body: payload }),
    deleteInventoryItem: (id) => apiRequest("DELETE", `/inventory/${id}`),
    listInventoryUsage: () => apiRequest("GET", "/inventory/usage"),
    createInventoryUsage: (payload) => apiRequest("POST", "/inventory/usage", { body: payload }),
    markInventoryUsageInUse: (usageId) => apiRequest("POST", `/inventory/usage/${usageId}/mark-in-use`),
    returnInventoryUsage: (usageId) => apiRequest("POST", `/inventory/usage/${usageId}/return`),
    checkoutInventory: (itemId, eventId, quantity) =>
        apiRequest("POST", `/inventory/${itemId}/checkout`, { params: { event_id: eventId, quantity } }),

    // ── Bookings ──────────────────────────────────────────────────
    listBookings: (venueId) => apiRequest("GET", "/bookings", { params: venueId ? { venue_id: venueId } : {} }),
    createBooking: (payload) => apiRequest("POST", "/bookings", { body: payload }),
    updateBookingStatus: (bookingId, status) => apiRequest("PATCH", `/bookings/${bookingId}`, { body: { status } }),
    releaseBooking: (bookingId) => apiRequest("POST", `/bookings/${bookingId}/release`),

    // ── Event proposals & events ──────────────────────────────────
    createProposal: (payload) => apiRequest("POST", "/proposals", { body: payload }),
    listProposals: (clubId, statusFilter) =>
        apiRequest("GET", "/proposals", { params: { club_id: clubId, status_filter: statusFilter } }),
    getProposal: (id) => apiRequest("GET", `/proposals/${id}`),
    submitProposal: (id) => apiRequest("POST", `/proposals/${id}/submit`),
    updateProposal: (id, payload) => apiRequest("PATCH", `/proposals/${id}`, { body: payload }),
    sendForRevision: (id, reason) => apiRequest("POST", `/proposals/${id}/send-for-revision`, { body: { reason } }),
    presidentReview: (id, approve, reason) =>
        apiRequest("POST", `/proposals/${id}/president-review`, { body: { approve, reason } }),
    facultyReview: (id, approve, reason) =>
        apiRequest("POST", `/proposals/${id}/faculty-review`, { body: { approve, reason } }),

    listEvents: (clubId) => apiRequest("GET", "/events", { params: { club_id: clubId } }),
    getEvent: (id) => apiRequest("GET", `/events/${id}`),
    publishEvent: (id) => apiRequest("POST", `/events/${id}/publish`),

    // ── Task management (Epic 4) ────────────────────────────────────
    createTask: (eventId, payload) => apiRequest("POST", `/events/${eventId}/tasks`, { body: payload }),
    listEventTasks: (eventId, statusFilter) =>
        apiRequest("GET", `/events/${eventId}/tasks`, { params: { status_filter: statusFilter } }),
    listMyTasks: (statusFilter) => apiRequest("GET", "/tasks/mine", { params: { status_filter: statusFilter } }),
    acceptTask: (taskId) => apiRequest("POST", `/tasks/${taskId}/accept`),
    submitTaskProof: (taskId, payload) => apiRequest("POST", `/tasks/${taskId}/submit-proof`, { body: payload }),
    reviewTask: (taskId, verified, comment) =>
        apiRequest("POST", `/tasks/${taskId}/review`, { body: { verified, comment } }),

    // ── QR attendance (Epic 5) ──────────────────────────────────────
    registerForEvent: (eventId) => apiRequest("POST", `/events/${eventId}/registrations`),
    listMyRegistrations: () => apiRequest("GET", "/registrations/mine"),
    listEventRegistrations: (eventId) => apiRequest("GET", `/events/${eventId}/registrations`),
    attendanceStats: (eventId) => apiRequest("GET", `/events/${eventId}/attendance-stats`),
    checkIn: (qrToken) => apiRequest("POST", `/registrations/${encodeURIComponent(qrToken)}/check-in`),

    // ── Certification & budget analytics (Epic 6) ────────────────────
    finalizeEvent: (eventId) => apiRequest("POST", `/events/${eventId}/finalize`),
    listMyCertificates: () => apiRequest("GET", "/certificates"),
    getBudgetOverview: () => apiRequest("GET", "/analytics/budget-overview"),

    // ── Faculty reports (Epic 7) ──────────────────────────────────────
    generateReport: (reportType, dateFrom, dateTo) =>
        apiRequest("POST", "/reports", { body: { report_type: reportType, date_from: dateFrom, date_to: dateTo } }),
    listReports: () => apiRequest("GET", "/reports"),
    getReport: (id) => apiRequest("GET", `/reports/${id}`),
    downloadReport: (id) => apiRequest("GET", `/reports/${id}/download`),

    // ── Club finance ────────────────────────────────────────────────
    getClubFinance: (clubId) => apiRequest("GET", `/clubs/${clubId}/finance`),
    listFinanceTransactions: (clubId) => apiRequest("GET", `/clubs/${clubId}/finance/transactions`),
    createFinanceTransaction: (clubId, type, amount, description) =>
        apiRequest("POST", `/clubs/${clubId}/finance/transactions`, { body: { type, amount, description } }),
    // Global finance ledger (Faculty Coordinator allocations / reimbursements)
    createGlobalFinanceTransaction: (clubId, type, amount, description) =>
        apiRequest("POST", "/finance/transactions", { body: { club_id: clubId, type, amount, description } }),

    getFacultyBudgetPool: () => apiRequest("GET", "/faculty-budget-pool"),
    updateFacultyBudgetPool: (total) => apiRequest("PATCH", "/faculty-budget-pool", { body: { total } }),

    createEventBudget: (clubId, eventName, allotted, proposalId) =>
        apiRequest("POST", `/clubs/${clubId}/event-budgets`, { body: { event_name: eventName, allotted, proposal_id: proposalId } }),
    listEventBudgets: (clubId) => apiRequest("GET", `/clubs/${clubId}/event-budgets`),
    getEventBudget: (id) => apiRequest("GET", `/event-budgets/${id}`),
    closeEventBudget: (id) => apiRequest("POST", `/event-budgets/${id}/close`),
    deleteEventBudget: (id) => apiRequest("DELETE", `/event-budgets/${id}`),
    updateEventBudgetComment: (id, comment) => apiRequest("PATCH", `/event-budgets/${id}/comment`, { body: { comment } }),

    createExpense: (eventBudgetId, payload) => apiRequest("POST", `/event-budgets/${eventBudgetId}/expenses`, { body: payload }),
    listExpenses: (eventBudgetId) => apiRequest("GET", `/event-budgets/${eventBudgetId}/expenses`),
    // billFile is an actual File object (or null/undefined for "not spent" /
    // no change to an already-uploaded file) -- sent as real multipart bytes,
    // not just a filename string, so the backend can persist and re-serve it.
    uploadExpenseBill: (expenseId, billAmount, billFile) => {
        const fd = new FormData();
        fd.append("bill_amount", billAmount);
        if (billFile) fd.append("file", billFile);
        return apiRequest("POST", `/expenses/${expenseId}/upload-bill`, { body: fd });
    },
    submitExpensePrizeDetails: (expenseId, payload) =>
        apiRequest("POST", `/expenses/${expenseId}/prize-details`, { body: payload }),
    submitExpenseJudgeDetails: (expenseId, payload) =>
        apiRequest("POST", `/expenses/${expenseId}/judge-details`, { body: payload }),
    sendEventBudgetForProcessing: (eventBudgetId) => apiRequest("POST", `/event-budgets/${eventBudgetId}/send-for-processing`),
    presidentReviewExpense: (expenseId, approve) => apiRequest("POST", `/expenses/${expenseId}/president-review`, { body: { approve } }),
    facultyReviewExpense: (expenseId, approve) => apiRequest("POST", `/expenses/${expenseId}/faculty-review`, { body: { approve } }),
    resetExpense: (expenseId) => apiRequest("POST", `/expenses/${expenseId}/reset`),

    // ── LLM-assisted features ──────────────────────────────────────
    eventProposalAssist: (payload) => apiRequest("POST", "/llm/event-proposal-assist", { body: payload }),
    notificationDigest: (notifications) =>
        apiRequest("POST", "/llm/notification-digest", { body: { notifications } }),

    // ── Club chat ──────────────────────────────────────────────────
    getChat: (clubId, studentId) => apiRequest("GET", `/clubs/${clubId}/chat`, { params: studentId ? { student_id: studentId } : {} }),
    sendChat: (clubId, payload) => apiRequest("POST", `/clubs/${clubId}/chat`, { body: payload }),

    // ── Bulk & Student Management (Feedback-driven) ─────────────────
    createStudentManual: (payload) => apiRequest("POST", "/students", { body: payload }),
    bulkImportUsers: (fileOrRows) => {
        if (fileOrRows instanceof File) {
            const fd = new FormData();
            fd.append("file", fileOrRows);
            return apiRequest("POST", "/users/bulk-import", { body: fd });
        }
        return apiRequest("POST", "/users/bulk-import", { body: fileOrRows });
    },
    getStudents: () => apiRequest("GET", "/students"),
    bulkCreateVenues: (fileOrList) => {
        if (fileOrList instanceof File) {
            const fd = new FormData();
            fd.append("file", fileOrList);
            return apiRequest("POST", "/venues/bulk-import", { body: fd });
        }
        return apiRequest("POST", "/venues/bulk", { body: fileOrList });
    },
    bulkCreateInventory: (fileOrList) => {
        if (fileOrList instanceof File) {
            const fd = new FormData();
            fd.append("file", fileOrList);
            return apiRequest("POST", "/inventory/bulk-import", { body: fd });
        }
        return apiRequest("POST", "/inventory/bulk", { body: fileOrList });
    },

    // ── Notifications ──────────────────────────────────────────────
    listNotifications: () => apiRequest("GET", "/notifications"),
    createNotification: (message) => apiRequest("POST", "/notifications", { body: { message } }),
    markAllNotificationsRead: () => apiRequest("POST", "/notifications/read-all"),
};
