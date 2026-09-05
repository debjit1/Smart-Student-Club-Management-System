/* ============================================================
   RUNTIME STATE SKELETON — shared by all four dashboards via the common
   localStorage key "sscms_president_state" (see shared/js/state-core.js).

   Clubs, venues, inventory, club rosters, recruitment domains and
   volunteer applications used to be hardcoded here. They now live in the
   backend database (Backend/app/seed.py) and are fetched live via
   shared/js/api.js on every load — see state-core.js's refreshFromBackend().
   Everything left in this skeleton is genuinely runtime/local data (event
   proposals, tasks, chat, certificates, ...) that the backend doesn't own
   yet for this sprint.
============================================================= */
const DEFAULT_STATE = {
    // Populated live from the backend on every loadState() call.
    clubsFinances: [],
    clubProfiles: [],
    venues: [],
    inventory: [],
    clubMembers: [],
    domains: [],
    volunteerApplications: [],

    // Genuinely local/runtime data -- not backed by the API yet.
    inventoryUsage: [],
    bookings: [],
    financeTransactions: [],
    eventBudgets: [],
    proposals: [],
    notifications: [],
    certificates: [],
    chatMessages: [],

    // Faculty Coordinator's master budget pool -- nothing allotted to any club yet.
    facultyBudgetPool: { total: 200000 }
};
