/* ============================================================
   STATE CORE — shared load/save logic for the single localStorage blob
   ("sscms_president_state") every dashboard (President, Club Head, Faculty
   Coordinator, Student) reads and writes. Depends on shared/js/seed-data.js
   (DEFAULT_STATE) and shared/js/api.js (Api, backend fetch calls) being
   loaded first. Each dashboard's own app.js/state.js still owns its own
   UI-only globals (activeProposalId, calendarDate, etc.) and any
   role-specific state helpers.

   loadState() is now ASYNC: clubs/venues/inventory/club rosters/recruitment
   domains/volunteer applications are fetched live from the backend on every
   call instead of being seeded from a hardcoded local blob. Callers must
   `await loadState()` before rendering anything that reads those fields.
============================================================= */

let state = {};

async function loadState() {
    const saved = localStorage.getItem("sscms_president_state");
    if (saved) {
        try {
            state = JSON.parse(saved);
        } catch (e) {
            console.error("Error parsing saved state, resetting...", e);
            state = {};
        }
    } else {
        state = {};
    }

function clearLocalState() {
    localStorage.removeItem("sscms_president_state");
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
}

    // Backfill any runtime-only fields a fresh/older blob might be missing,
    // without touching whatever local data already exists for them.
    const defaults = DEFAULT_STATE;
    Object.keys(defaults).forEach((key) => {
        if (state[key] === undefined) {
            state[key] = JSON.parse(JSON.stringify(defaults[key]));
        }
    });
    (state.eventBudgets || []).forEach(eb => {
        if (typeof eb.comment !== "string") eb.comment = "";
        if (!Array.isArray(eb.tasks)) eb.tasks = [];
        if (!Array.isArray(eb.registrations)) eb.registrations = [];
        if (!eb.publish) {
            eb.publish = { published: false, name: eb.eventName, description: "", rules: "", poster: "", venue: "", date: "", time: "", registrationDeadline: "", rounds: [], contactInfo: "" };
        }
    });
    (state.inventoryUsage || []).forEach(u => {
        if (typeof u.assignedViaTask !== "boolean") u.assignedViaTask = false;
    });

    await refreshFromBackend();
    saveState();

    // Only the Student dashboard defines this (derives its notification feed
    // by diffing state against what it last saw) — harmless no-op elsewhere.
    if (typeof syncStudentNotifications === "function") syncStudentNotifications();
}

// Replaces the backend-owned slices of `state` with live data from the API.
// Runs on every loadState() call so approvals/edits made from any dashboard
// (or seeded directly in the DB) show up everywhere without a stale local
// copy lingering in localStorage.
async function refreshFromBackend() {
    if (typeof Api === "undefined") return; // shared/js/api.js not loaded on this page

    try {
        const clubs = await Api.listClubs();

        // allotted/spent now come straight off the Club row (backend-owned --
        // see Club.budget_allotted/budget_spent + app.routers.finance).
        state.clubsFinances = clubs.map((c) => ({
            id: c.id,
            club: c.name,
            category: c.category,
            status: c.status,
            allotted: Number(c.budget_allotted) || 0,
            spent: Number(c.budget_spent) || 0
        }));

        state.financeTransactions = [];
        for (const c of clubs) {
            try {
                const txns = await Api.listFinanceTransactions(c.id);
                txns.forEach((t) => {
                    state.financeTransactions.push({
                        id: `txn-${t.id}`,
                        date: t.created_at,
                        club: c.name,
                        type: t.type,
                        amount: Number(t.amount),
                        desc: t.description || ""
                    });
                });
            } catch (err) {
                console.warn(`Could not fetch finance transactions for club ${c.id}:`, err);
            }
        }

        try {
            const pool = await Api.getFacultyBudgetPool();
            state.facultyBudgetPool = { total: Number(pool.total) || 0 };
        } catch (err) {
            console.warn("Could not fetch faculty budget pool:", err);
        }

        state.clubProfiles = clubs.map((c) => ({
            id: c.id,
            club: c.name,
            description: c.description || "",
            achievements: c.achievements || [],
            history: c.history || "",
            pastEvents: []
        }));

        // Raw backend Event rows (id, proposal_id, club_id, name, ...) --
        // used only to resolve which real backend Event a given eventBudget
        // corresponds to (via proposal_id), so the Epic 4-6 task/QR/
        // certificate endpoints -- which key off Event.id, not
        // EventBudget.id -- can be called for the right event.
        let backendEvents = [];
        try {
            backendEvents = await Api.listEvents();
            state.backendEvents = backendEvents;
        } catch (err) {
            console.warn("Could not fetch events from backend:", err);
        }

        const venues = await Api.listVenues();
        state.venues = venues.map((v) => ({
            id: v.id,
            name: v.name,
            capacity: v.capacity,
            location: v.location || "",
            description: "",
            facilities: v.facilities || "",
            requirements: v.requirements ? v.requirements.split(", ") : []
        }));

        const inventory = await Api.listInventory();
        state.inventory = inventory.map((i) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            category: i.category,
            location: "",
            totalStock: i.total_stock,
            availableStock: i.available_stock,
            status: i.status
        }));

        try {
            const backendBookings = await Api.listBookings();
            if (Array.isArray(backendBookings)) {
                state.bookings = backendBookings.map((b) => ({
                    id: b.id,
                    venueId: b.venue_id,
                    venueName: b.venue_name || "",
                    event: b.event_name || "",
                    club: b.club_name || "",
                    date: b.booking_date ? String(b.booking_date) : "",
                    timeSlot: b.time_slot || "10:00 - 17:00",
                    requirements: Array.isArray(b.requirements) ? b.requirements : [],
                    status: b.status || "Confirmed"
                }));
            }
        } catch (err) {
            console.warn("Could not fetch bookings from backend:", err);
        }

        try {
            const backendUsage = await Api.listInventoryUsage();
            if (Array.isArray(backendUsage)) {
                state.inventoryUsage = backendUsage.map((u) => ({
                    id: u.id,
                    itemId: u.item_id,
                    itemName: u.item_name || "",
                    club: u.club_name || "",
                    event: u.event_name || "",
                    qty: u.quantity,
                    date: u.booking_date ? String(u.booking_date) : (u.checked_out_at ? String(u.checked_out_at).slice(0, 10) : ""),
                    timeRange: u.time_slot || "10:00 - 17:00",
                    location: u.location || "",
                    status: u.status || "Booked"
                }));
            }
        } catch (err) {
            console.warn("Could not fetch inventory usage from backend:", err);
        }

        // Event budgets + their expense/bill line items are backend-owned
        // (app.routers.finance). certVerification/tasks/registrations/publish
        // are a separate, local-only feature -- preserved from whatever was
        // already cached for that event budget id.
        const previousEventBudgets = new Map((state.eventBudgets || []).map((eb) => [String(eb.id), eb]));
        state.eventBudgets = [];
        for (const c of clubs) {
            let backendBudgets = [];
            try {
                backendBudgets = await Api.listEventBudgets(c.id);
            } catch (err) {
                console.warn(`Could not fetch event budgets for club ${c.id}:`, err);
                continue;
            }
            for (const eb of backendBudgets) {
                const previous = previousEventBudgets.get(String(eb.id)) || {};
                let expenses = [];
                try {
                    const backendExpenses = await Api.listExpenses(eb.id);
                    expenses = backendExpenses.map((exp) => ({
                        id: exp.id,
                        eventName: eb.event_name,
                        itemName: exp.item_name,
                        type: exp.type,
                        category: exp.category || "",
                        approvedAmount: Number(exp.approved_amount) || 0,
                        billAmount: exp.bill_amount === null || exp.bill_amount === undefined ? null : Number(exp.bill_amount),
                        billFileName: exp.bill_file_name || null,
                        billFileUrl: exp.bill_file_url || null,
                        status: exp.status,
                        source: exp.source,
                        prizeDetails: exp.prize_student_name ? {
                            studentName: exp.prize_student_name, studentId: exp.prize_student_id,
                            department: exp.prize_department, affiliation: exp.prize_affiliation,
                            bankDetails: exp.prize_bank_details
                        } : null,
                        judgeDetails: exp.judge_name ? {
                            judgeName: exp.judge_name, contactNumber: exp.judge_contact,
                            bankDetails: exp.judge_bank_details
                        } : null
                    }));
                } catch (err) {
                    console.warn(`Could not fetch expenses for event budget ${eb.id}:`, err);
                }

                const backendEvent = eb.proposal_id
                    ? backendEvents.find((ev) => ev.proposal_id === eb.proposal_id)
                    : null;

                state.eventBudgets.push({
                    id: eb.id,
                    eventName: eb.event_name,
                    club: c.name,
                    clubId: c.id,
                    proposalId: eb.proposal_id || null,
                    // Real backend Event.id this eventBudget corresponds to (if
                    // any) -- lets task/QR/certificate actions call the live
                    // Epic 4-6 endpoints. Absent for event budgets with no
                    // linked proposal, which fall back to local-only behavior.
                    backendEventId: backendEvent ? backendEvent.id : null,
                    allotted: Number(eb.allotted) || 0,
                    status: eb.status,
                    closedOn: eb.closed_on || null,
                    comment: eb.comment || previous.comment || "",
                    certVerification: previous.certVerification || { status: "Pending", verifiedOn: null },
                    tasks: previous.tasks || [],
                    registrations: previous.registrations || [],
                    publish: previous.publish || {
                        published: false, name: eb.event_name, description: "", rules: "", poster: "",
                        venue: "", date: "", time: "", registrationDeadline: "", rounds: [], contactInfo: ""
                    },
                    expenses
                });
            }
        }

        // Merge backend tasks into each event budget's task list.
        // Club heads (and faculty/president) can see tasks for all their events;
        // students see their own via the backend's assigned_to filter.
        const sessForTasks = typeof getSession === "function" ? getSession() : null;
        const taskUserLookup = new Map();
        (state.clubMembers || []).forEach(m => {
            if (m.userId !== null && m.userId !== undefined) {
                taskUserLookup.set(Number(m.userId), { studentId: m.studentId, name: m.name });
            }
        });
        for (const eb of state.eventBudgets) {
            if (!eb.backendEventId) continue;
            try {
                const backendTasks = await Api.listEventTasks(eb.backendEventId);
                const existingByBackendId = new Map((eb.tasks || []).filter(t => t.backendId).map(t => [t.backendId, t]));
                for (const bt of backendTasks) {
                    // TaskOut carries `assigned_to` (a user id, not the
                    // volunteer's student_id) -- resolve the display identity
                    // from the roster cache (or the current session).
                    const assignee = taskUserLookup.get(Number(bt.assigned_to))
                        || (sessForTasks && Number(sessForTasks.userId) === Number(bt.assigned_to)
                            ? { studentId: sessForTasks.studentId, name: sessForTasks.name }
                            : null);
                    const existing = existingByBackendId.get(bt.id);
                    if (existing) {
                        // Backfill the volunteer identity for tasks merged on an
                        // earlier load when the roster wasn't cached yet.
                        if (!existing.assignedVolunteerName && assignee && assignee.name) {
                            existing.assignedVolunteerName = assignee.name;
                            existing.assignedVolunteerId = assignee.studentId;
                        }
                        continue; // already present
                    }
                    eb.tasks.push({
                        id: `bk-${bt.id}`, backendId: bt.id, eventId: eb.id,
                        title: bt.title, description: bt.description || "",
                        type: bt.type, priority: bt.priority || "Medium",
                        deadline: bt.deadline || "",
                        assignedVolunteerId: assignee ? assignee.studentId : null,
                        assignedVolunteerName: assignee ? assignee.name : "",
                        domainId: null, procurementUsageId: null,
                        expenseId: bt.expense_id || null,
                        status: bt.status, proof: bt.proof_text ? { note: bt.proof_text, link: "", fileName: "" } : null,
                        createdOn: bt.created_at ? String(bt.created_at).slice(0, 10) : ""
                    });
                }
            } catch (err) {
                console.warn(`Could not fetch backend tasks for event budget ${eb.id}:`, err);
            }
        }

        // Sync the current user's real backend registrations into their local
        // event-budget copies so the Student dashboard's calendar/QR views show
        // registrations made from any browser/session -- not just ones that were
        // cached locally in the shared blob. A backend Registration carries the
        // Event.id as `event_id`, which matches eventBudget.backendEventId.
        try {
            const myRegs = await Api.listMyRegistrations();
            if (Array.isArray(myRegs) && myRegs.length) {
                const sess = typeof getSession === "function" ? getSession() : null;
                const studentName = (sess && sess.name) || "";
                const studentId = (sess && sess.studentId) || "";
                const studentEmail = (sess && sess.email) || "";
                const backendEventsById = new Map((state.backendEvents || []).map((ev) => [Number(ev.id), ev]));

                (state.eventBudgets || []).forEach((eb) => {
                    if (!eb.backendEventId) return;
                    const reg = myRegs.find((r) => Number(r.event_id) === Number(eb.backendEventId));
                    if (!reg) return;

                    const already = (eb.registrations || []).some((r) => r.backendId === reg.id);
                    if (!already) {
                        eb.registrations = eb.registrations || [];
                        eb.registrations.push({
                            id: `reg-bk-${reg.id}`,
                            backendId: reg.id,
                            studentName,
                            studentId,
                            email: studentEmail,
                            registeredOn: reg.registered_at ? String(reg.registered_at).slice(0, 10) : "",
                            qrPayload: reg.qr_token,
                            checkedIn: reg.status === "Checked-In",
                            checkedInAt: reg.checked_in_at || null
                        });
                    }

                    // Backfill a display date from the backend Event row so the
                    // calendar can place the event even if the Club Head never
                    // published via the local-only Edit & Publish pane.
                    const backendEvent = backendEventsById.get(Number(eb.backendEventId));
                    if (backendEvent && backendEvent.event_date && !(eb.publish && eb.publish.date)) {
                        eb.publish = eb.publish || {};
                        eb.publish.date = String(backendEvent.event_date);
                    }
                });
            }
        } catch (err) {
            console.warn("Could not sync backend registrations:", err);
        }

        try {
            const backendProposals = await Api.listProposals();
            if (Array.isArray(backendProposals)) {
                const freshProposals = backendProposals.map((bp) => {
                    const club = clubs.find((c) => c.id === bp.club_id);
                    const venue = venues.find((v) => v.id === bp.venue_id);
                    const organizerName = club ? club.name : "";
                    const existingLocal = (state.proposals || []).find((p) => p.id === bp.id || (p.title === bp.event_name && p.organizer === organizerName));

                    let mappedStatus = bp.status;
                    if (bp.status === "Pending Faculty Review" || bp.status === "Pending Faculty Approval") {
                        mappedStatus = "Pending Faculty Approval";
                    } else if (bp.status === "Pending President Review") {
                        mappedStatus = "Pending President Review";
                    } else if (bp.status === "Draft") {
                        mappedStatus = "Draft";
                    }

                    let backendLineItems = null;
                    if (bp.line_items_json) {
                        try { backendLineItems = JSON.parse(bp.line_items_json); } catch (e) { /* ignore malformed data */ }
                    }
                    const hasBudgetEstimate = bp.budget_estimate !== null && bp.budget_estimate !== undefined && Number(bp.budget_estimate) > 0;
                    const fallbackProcuringItems = (!backendLineItems && hasBudgetEstimate) ? [{
                        name: "Event Procurement / Budget",
                        category: "Materials & Consumables",
                        qty: 1,
                        unit: "pkg",
                        pricePerUnit: Number(bp.budget_estimate),
                        overallPrice: Number(bp.budget_estimate),
                        status: bp.status === "Approved" ? "Approve" : "Pending",
                        comment: ""
                    }] : [];

                    return {
                        id: bp.id,
                        clubId: bp.club_id,
                        title: bp.event_name,
                        desc: bp.description || "",
                        organizer: organizerName,
                        date: bp.schedule_date ? String(bp.schedule_date) : "",
                        time: bp.time_slot || "10:00 - 17:00",
                        estimatedParticipants: bp.estimated_participants || 100,
                        status: mappedStatus,
                        rawBackendStatus: bp.status,
                        submittedOn: bp.schedule_date ? String(bp.schedule_date) : "",
                        generalSuggestions: bp.rejection_reason || "",
                        clubComments: "",
                        venue: venue ? {
                            venueId: venue.id,
                            venueName: venue.name,
                            location: venue.location || "",
                            capacity: venue.capacity || 0,
                            capacityRequired: bp.capacity_required || venue.capacity || 0,
                            status: bp.status === "Approved" ? "Approve" : "Pending",
                            suggestion: ""
                        } : null,
                        inventoryRequirements: existingLocal ? existingLocal.inventoryRequirements || []
                            : (backendLineItems ? backendLineItems.inventoryRequirements || [] : []),
                        procuringItems: existingLocal && existingLocal.procuringItems && existingLocal.procuringItems.length > 0
                            ? existingLocal.procuringItems
                            : (backendLineItems ? backendLineItems.procuringItems || [] : fallbackProcuringItems),
                        prizeMoney: existingLocal ? existingLocal.prizeMoney || []
                            : (backendLineItems ? backendLineItems.prizeMoney || [] : []),
                        judgeFees: existingLocal ? existingLocal.judgeFees || []
                            : (backendLineItems ? backendLineItems.judgeFees || [] : [])
                    };
                });
                state.proposals = freshProposals;
            }
        } catch (err) {
            console.warn("Could not fetch proposals from backend:", err);
        }

        // Reconcile approved proposals and backend events into state.eventBudgets
        (state.proposals || []).forEach((p) => {
            if (p.status === "Approved" || p.rawBackendStatus === "Approved") {
                let eb = (state.eventBudgets || []).find((e) => (p.id && e.proposalId === p.id) || (e.eventName === p.title && (!e.club || e.club === p.organizer)));
                const bEvent = (backendEvents || []).find((ev) => ev.proposal_id === p.id || (ev.name === p.title && ev.club_id === p.clubId));
                const venueName = (p.venue && p.venue.venueName) ? p.venue.venueName : ((venues.find(v => v.id === p.venueId) || {}).name || "TBD");
                const prev = previousEventBudgets.get(String(p.id)) || {};

                if (!eb) {
                    eb = {
                        id: p.id,
                        eventName: p.title,
                        club: p.organizer,
                        clubId: p.clubId,
                        proposalId: p.id,
                        backendEventId: bEvent ? bEvent.id : null,
                        allotted: Number(p.budgetRequired || p.estimatedBudget || 0),
                        status: "Open",
                        closedOn: null,
                        comment: "",
                        certVerification: prev.certVerification || { status: "Pending", verifiedOn: null },
                        tasks: prev.tasks || [],
                        registrations: prev.registrations || [],
                        publish: prev.publish || {
                            published: true,
                            name: p.title,
                            description: p.desc || "",
                            rules: "",
                            poster: "",
                            venue: venueName,
                            date: p.date || "",
                            time: p.time || "10:00 - 17:00",
                            registrationDeadline: "",
                            rounds: [],
                            contactInfo: ""
                        },
                        expenses: []
                    };
                    state.eventBudgets.push(eb);
                } else {
                    eb.publish = eb.publish || {};
                    if (!eb.publish.date && p.date) eb.publish.date = p.date;
                    if (!eb.publish.venue && venueName) eb.publish.venue = venueName;
                    if (!eb.publish.time && p.time) eb.publish.time = p.time;
                    if (!eb.publish.description && p.desc) eb.publish.description = p.desc;
                    eb.publish.published = true;
                    if (bEvent && !eb.backendEventId) eb.backendEventId = bEvent.id;
                }
            }
        });

        // Ensure state.events is always populated for all event queries across all dashboards
        state.events = (state.eventBudgets || []).map((eb) => {
            const p = eb.publish || {};
            const matchedProp = (state.proposals || []).find((pr) => pr.id === eb.proposalId || (pr.title === eb.eventName && (!eb.club || pr.organizer === eb.club)));
            const eventDate = p.date || (matchedProp ? matchedProp.date : (eb.date || ""));
            const timeRange = p.time || (matchedProp ? matchedProp.time : "10:00 - 17:00");
            const [timeStart, timeEnd] = timeRange.includes(" - ") ? timeRange.split(" - ") : [timeRange, ""];
            return {
                id: eb.backendEventId || eb.id,
                eventBudgetId: eb.id,
                proposalId: eb.proposalId || (matchedProp ? matchedProp.id : null),
                name: (p && p.name) ? p.name : eb.eventName,
                title: (p && p.name) ? p.name : eb.eventName,
                club: eb.club,
                clubId: eb.clubId,
                venueId: matchedProp && matchedProp.venue ? matchedProp.venue.venueId : null,
                venueName: p.venue || (matchedProp && matchedProp.venue ? matchedProp.venue.venueName : "TBD"),
                date: eventDate,
                event_date: eventDate,
                timeStart: timeStart || "10:00",
                timeEnd: timeEnd || "17:00",
                description: p.description || (matchedProp ? matchedProp.desc : ""),
                status: eb.status === "Closed" ? "Closed" : "Approved",
                published: p.published !== false,
                finalized: eb.status === "Closed"
            };
        });

        // Recruitment domains are a public read -- every dashboard (including
        // Students browsing clubs to volunteer for) can see them all.
        state.domains = [];
        for (const club of clubs) {
            const domains = await Api.listDomains(club.id);
            domains.forEach((d, idx) => {
                state.domains.push({
                    id: d.id,
                    club: club.name,
                    clubId: club.id,
                    name: `Domain ${idx + 1}`,
                    title: d.title,
                    recruitmentOpen: d.recruitment_open,
                    openedOn: d.opened_on,
                    roles: []
                });
            });
        }

        // Member rosters and volunteer applications contain other students'
        // PII, so the backend only allows a club's own Club Head/President/
        // Faculty Coordinator to list them. Fetch only what this session is
        // allowed to see.
        const session = typeof getSession === "function" ? getSession() : null;
        let clubIdsToLoad = [];
        if (session && (session.role === "facultycoordinator" || session.role === "president")) {
            clubIdsToLoad = clubs.map((c) => c.id);
        } else if (session && session.role === "clubhead" && session.clubId) {
            clubIdsToLoad = [session.clubId];
        }

        state.clubMembers = [];
        state.volunteerApplications = [];
        for (const clubId of clubIdsToLoad) {
            const club = clubs.find((c) => c.id === clubId);
            if (!club) continue;

            try {
                const members = await Api.listMembers(clubId);
                (members || []).forEach((m) => {
                    state.clubMembers.push({
                        id: m.id,
                        club: club.name,
                        clubId,
                        userId: m.user_id,
                        name: m.name,
                        studentId: m.student_id,
                        email: m.email,
                        department: m.department,
                        year: m.year,
                        status: m.status,
                        joinedOn: m.joined_on,
                        domainId: null
                    });
                });
            } catch (err) {
                console.warn(`Could not fetch members for club ${clubId}:`, err);
            }

            try {
                const applications = await Api.listVolunteerApplications(clubId);
                (applications || []).forEach((a) => {
                    state.volunteerApplications.push({
                        id: a.id,
                        club: club.name,
                        clubId,
                        domainId: a.domain_id,
                        applicantName: a.applicant_name,
                        studentId: a.applicant_student_id,
                        userId: a.applicant_id,
                        appliedOn: a.applied_on,
                        status: a.status,
                        note: a.note
                    });
                });
            } catch (err) {
                console.warn(`Could not fetch volunteer applications for club ${clubId}:`, err);
            }
        }

        // Students/Volunteers can't list a club's full roster (403 -- other
        // students' PII), but can always see their own membership/application
        // records via the self-service /me/* endpoints.
        if (session && session.role === "user") {
            const clubById = new Map(clubs.map((c) => [c.id, c]));

            const myMemberships = await Api.myMemberships();
            myMemberships.forEach((m) => {
                const club = clubById.get(m.club_id);
                state.clubMembers.push({
                    id: m.id,
                    club: club ? club.name : "",
                    clubId: m.club_id,
                    userId: m.user_id,
                    name: m.name,
                    studentId: m.student_id,
                    email: m.email,
                    department: m.department,
                    year: m.year,
                    status: m.status,
                    joinedOn: m.joined_on,
                    domainId: null
                });
            });

            const myApplications = await Api.myVolunteerApplications();
            myApplications.forEach((a) => {
                const club = clubById.get(a.club_id);
                state.volunteerApplications.push({
                    id: a.id,
                    club: club ? club.name : "",
                    clubId: a.club_id,
                    domainId: a.domain_id,
                    applicantName: a.applicant_name,
                    studentId: a.applicant_student_id,
                    appliedOn: a.applied_on,
                    status: a.status,
                    note: a.note
                });
            });

            // Sync this student's own event registrations from the backend --
            // without this, a registration made from a different browser/session
            // (or before this browser's local cache existed) is invisible here,
            // so a re-register attempt hits the backend's real duplicate check
            // with no local "already registered + here's your QR" state to show.
            try {
                const myRegs = await Api.listMyRegistrations();
                myRegs.forEach((r) => {
                    const eb = state.eventBudgets.find((e) => e.backendEventId === r.event_id);
                    if (!eb) return;
                    if (!eb.registrations) eb.registrations = [];
                    let existing = eb.registrations.find((x) => x.backendId === r.id);
                    if (existing) {
                        existing.qrPayload = r.qr_token;
                        existing.checkedIn = r.status === "Checked-In";
                        existing.checkedInAt = r.checked_in_at;
                    } else {
                        eb.registrations.push({
                            id: `reg-${r.id}`,
                            backendId: r.id,
                            studentName: session.name,
                            studentId: session.studentId,
                            email: session.email,
                            registeredOn: r.registered_at ? String(r.registered_at).slice(0, 10) : "",
                            qrPayload: r.qr_token,
                            checkedIn: r.status === "Checked-In",
                            checkedInAt: r.checked_in_at
                        });
                    }
                });
            } catch (err) {
                console.warn("Could not fetch my registrations from backend:", err);
            }

            // Fetch certificates from backend for the current user (students only).
            try {
                const certs = await Api.listMyCertificates();
                const existingKeys = new Set((state.certificates || []).map(c => `${c.studentId}-${c.eventId}`));
                const stuId = session.studentId || session.email;
                for (const cert of certs) {
                    const key = `${stuId}-${cert.event_id}`;
                    if (existingKeys.has(key)) continue;
                    const eb = (state.eventBudgets || []).find(e => Number(e.backendEventId) === Number(cert.event_id));
                    // Backend certificates already carry the type in `reason`
                    // ("Volunteer" or "Attendee" -- see app.routers.certificates).
                    state.certificates.push({
                        id: `cert-bk-${cert.id}`,
                        studentId: stuId,
                        studentName: session.name || "",
                        eventId: cert.event_id,
                        title: (eb && eb.eventName) || `Event #${cert.event_id}`,
                        issuer: (eb && eb.club) || "",
                        issueDate: cert.issued_at ? String(cert.issued_at).slice(0, 10) : "",
                        type: cert.reason === "Volunteer" ? "Volunteer" : "Attendee"
                    });
                }
            } catch (err) {
                console.warn("Could not fetch certificates from backend:", err);
            }

            // Fetch notifications from backend for the current student. This runs
            // before syncStudentNotifications() in loadState(), so the fetched
            // rows are in state and the synthesis dedup (via sourceKey) works
            // against them.
            try {
                const notifs = await Api.listNotifications();
                state.notifications = notifs.map(n => ({
                    id: `notif-bk-${n.id}`,
                    studentId: session.studentId || session.email,
                    message: n.message,
                    read: n.read,
                    createdOn: n.created_at || "",
                    sourceKey: `notif-bk-${n.id}`
                }));
            } catch (err) {
                console.warn("Could not fetch notifications from backend:", err);
            }
        }
    } catch (e) {
        console.error("Could not load live data from the backend -- is it running? Falling back to any cached copy.", e);
        if (typeof showToast === "function") {
            showToast("Could not reach the backend API -- showing cached data.", "error");
        }
    }
}

function saveState() {
    localStorage.setItem("sscms_president_state", JSON.stringify(state));
}

// ── Certificate issuance ──────────────────────────────────────
// Called once an event's certification is finally verified by the Faculty
// Coordinator (eb.certVerification.status -> "Verified"). Issues one
// certificate per student who either completed a verified volunteering
// task or checked in as a registered attendee for the event. Idempotent —
// safe to call again (e.g. if verification is reopened and re-verified)
// since it skips any (studentId, eventId) pair that already has a cert.
function issueCertificatesForEvent(eb) {
    if (!Array.isArray(state.certificates)) state.certificates = [];

    // Each recipient gets exactly one certificate per event, typed by what
    // they did: a student who completed a Verified volunteer task earns a
    // "Volunteer" certificate; one who only checked in as an attendee earns
    // an "Attendee" certificate. Volunteering outranks attendance, so a
    // student who did both gets the Volunteer certificate.
    const recipients = new Map(); // studentId -> { name, type }
    (eb.tasks || []).forEach(t => {
        if (t.status === "Verified" && t.assignedVolunteerId) {
            const rec = recipients.get(t.assignedVolunteerId) || {};
            rec.name = rec.name || t.assignedVolunteerName || "";
            rec.type = "Volunteer";
            recipients.set(t.assignedVolunteerId, rec);
        }
    });
    (eb.registrations || []).forEach(r => {
        if (r.checkedIn && r.studentId) {
            const rec = recipients.get(r.studentId) || {};
            rec.name = rec.name || r.studentName || "";
            rec.type = rec.type || "Attendee";
            recipients.set(r.studentId, rec);
        }
    });

    const eventTitle = (eb.publish && eb.publish.name) ? eb.publish.name : eb.eventName;
    let changed = false;
    recipients.forEach((rec, studentId) => {
        const existing = state.certificates.find(c => c.studentId === studentId && c.eventId === eb.id);
        if (existing) {
            // Backfill the type for certificates issued before this field
            // existed (re-verification path).
            if (!existing.type && rec.type) {
                existing.type = rec.type;
                changed = true;
            }
            return;
        }
        state.certificates.push({
            id: "cert-" + eb.id + "-" + studentId,
            studentId,
            studentName: rec.name,
            eventId: eb.id,
            title: eventTitle,
            issuer: eb.club,
            issueDate: new Date().toISOString().slice(0, 10),
            type: rec.type || "Attendee"
        });
        changed = true;
    });
    if (changed) saveState();
}
