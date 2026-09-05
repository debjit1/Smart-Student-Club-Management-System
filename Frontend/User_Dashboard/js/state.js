/* ============================================================
   STUDENT DASHBOARD STATE
   Shares the SAME localStorage state ("sscms_president_state")
   as the President / Club Head / Faculty Coordinator portals.
   Toast/currency/date/time helpers (showToast, escapeHtml,
   formatCurrency, formatDate, formatDateTime, formatTimeRange)
   live in shared/js/utils.js (loaded before this file).
============================================================= */

// ── Identity of the logged-in Student ───────────────────────────
// Comes straight from the real backend session established at login (see
// shared/js/session.js -- `establishSessionFromLogin`), so every read/write
// (join club, volunteer application) uses the actual authenticated
// student_id/email rather than a locally-guessed identity.
const __loginSession = (typeof getSession === "function") ? getSession() : null;

const CURRENT_STUDENT_NAME = (__loginSession && __loginSession.name) || "Student";
const CURRENT_STUDENT_ID = (__loginSession && __loginSession.studentId) || "";
const CURRENT_STUDENT_EMAIL = (__loginSession && __loginSession.email) || "";
const CURRENT_STUDENT_USER_ID = (__loginSession && __loginSession.userId) || null;


// State load/save/DEFAULT_STATE/migrations now live in ../../shared/js/seed-data.js
// and ../../shared/js/state-core.js (loaded before this file) — single source of
// truth shared by all four dashboards instead of a hand-copy per dashboard.
function todayStr() {
    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ============================================================
// STUDENT-CENTRIC DATA HELPERS
// ============================================================

function getEventDisplayName(eb) {
    return (eb.publish && eb.publish.name) ? eb.publish.name : (eb.eventName || eb.name || eb.title || "Event");
}

function getEventDisplayDate(eb) {
    if (eb.publish && eb.publish.date) return eb.publish.date;
    if (eb.date) return eb.date;
    if (eb.event_date) return eb.event_date;
    const matchedProp = (state.proposals || []).find(p => p.id === eb.proposalId || (p.title === eb.eventName && (!eb.club || p.organizer === eb.club)));
    if (matchedProp && matchedProp.date) return matchedProp.date;
    return "";
}

function getPublishedEvents() {
    return (state.eventBudgets || []).filter(eb => {
        if (eb.publish && eb.publish.published) return true;
        if (eb.published) return true;
        const matchedProp = (state.proposals || []).find(p => p.id === eb.proposalId || (p.title === eb.eventName && (!eb.club || p.organizer === eb.club)));
        if (matchedProp && (matchedProp.status === "Approved" || matchedProp.status === "Published")) return true;
        if (eb.backendEventId) return true;
        return false;
    });
}

function isEventOngoing(eb) {
    const d = getEventDisplayDate(eb);
    return d && d === todayStr();
}

function isEventUpcoming(eb) {
    const d = getEventDisplayDate(eb);
    return d && d > todayStr();
}

function getMyMembership(club) {
    return (state.clubMembers || []).find(m => m.studentId === CURRENT_STUDENT_ID && m.club === club);
}

function getMyMemberships() {
    return (state.clubMembers || []).filter(m => m.studentId === CURRENT_STUDENT_ID);
}

function getMyVolunteerAppsForClub(club) {
    return (state.volunteerApplications || []).filter(v => v.studentId === CURRENT_STUDENT_ID && v.club === club);
}

function getMyVolunteerApps() {
    return (state.volunteerApplications || []).filter(v => v.studentId === CURRENT_STUDENT_ID);
}

// Best-known status for a student's volunteering relationship with a club:
// Selected > Pending > Revoked > Rejected > null (never applied)
function getMyVolunteerStatusForClub(club) {
    const apps = getMyVolunteerAppsForClub(club);
    if (!apps.length) return null;
    if (apps.some(a => a.status === "Selected")) return "Selected";
    if (apps.some(a => a.status === "Pending")) return "Pending";
    if (apps.some(a => a.status === "Revoked")) return "Revoked";
    return "Rejected";
}

function getSelectedVolunteerClubs() {
    const clubs = new Set();
    getMyVolunteerApps().forEach(a => { if (a.status === "Selected") clubs.add(a.club); });
    return Array.from(clubs);
}

function isApprovedVolunteer() {
    return getSelectedVolunteerClubs().length > 0;
}

// Returns [{ task, eb }] for every task assigned to the current student.
function getMyTasks() {
    const out = [];
    (state.eventBudgets || []).forEach(eb => {
        (eb.tasks || []).forEach(t => {
            if (t.assignedVolunteerId === CURRENT_STUDENT_ID) out.push({ task: t, eb });
        });
    });
    return out;
}

// Returns [{ reg, eb }] for every attendee registration by the current student.
function getMyRegistrations() {
    const out = [];
    (state.eventBudgets || []).forEach(eb => {
        (eb.registrations || []).forEach(r => {
            if (r.studentId === CURRENT_STUDENT_ID) out.push({ reg: r, eb });
        });
    });
    return out;
}

function getDomain(domainId) {
    return (state.domains || []).find(d => d.id === domainId);
}

function getClubDomains(club) {
    return (state.domains || []).filter(d => d.club === club);
}

function getClubProfile(club) {
    return (state.clubProfiles || []).find(p => p.club === club);
}

// ============================================================
// NOTIFICATIONS
// Since the Club Head / President side doesn't push notifications yet,
// the student dashboard synthesizes them itself by diffing the current
// state against what it last saw. Each synthesized notification carries
// a `sourceKey` so the same event never gets pushed twice.
// ============================================================
// Dedup is scoped to (sourceKey, studentId) rather than sourceKey alone —
// broadcast-style events (recruitment opened, event published) reuse the
// same sourceKey for every student, and each student needs their own row.
function pushNotificationOnce(sourceKey, message) {
    const already = (state.notifications || []).some(n => n.sourceKey === sourceKey && n.studentId === CURRENT_STUDENT_ID);
    // On reload, refreshFromBackend replaces state.notifications with the
    // backend list (sourceKey "notif-bk-..."). A freshly-synthesized event's
    // sourceKey never matches those, so treat "same text already came from the
    // backend" as already-present too -- otherwise every load would re-add a
    // duplicate row next to the server copy and re-post it.
    const fromServer = (state.notifications || []).some(n =>
        (n.sourceKey || "").startsWith("notif-bk-") && n.message === message
    );
    if (already || fromServer) return false;
    state.notifications.push({
        id: generateId("notif"),
        studentId: CURRENT_STUDENT_ID,
        message,
        read: false,
        createdOn: new Date().toISOString(),
        sourceKey
    });

    // Mirror genuinely-new notifications to the backend (fire-and-forget) so
    // they survive a reload / show up on another device.
    if (typeof Api !== "undefined") {
        Api.createNotification(message).catch(err => console.warn("Couldn't mirror notification to backend:", err));
    }
    return true;
}

function syncStudentNotifications() {
    let changed = false;

    getMyVolunteerApps().forEach(app => {
        if (app.status === "Selected") {
            const domain = getDomain(app.domainId);
            const domainTitle = domain ? domain.title : "your selected domain";
            if (pushNotificationOnce(`vapp-selected-${app.id}`, `You've been selected as a volunteer for ${app.club} (${domainTitle})! Head to Club Activities to get started.`)) changed = true;
        } else if (app.status === "Rejected") {
            if (pushNotificationOnce(`vapp-rejected-${app.id}`, `Your volunteer application for ${app.club} was not selected this time.`)) changed = true;
        } else if (app.status === "Revoked") {
            if (pushNotificationOnce(`vapp-revoked-${app.id}`, `Your volunteer selection for ${app.club} was withdrawn by the Club Head.`)) changed = true;
        }
    });

    getMyTasks().forEach(({ task, eb }) => {
        const eventName = getEventDisplayName(eb);
        if (task.status === "Assigned") {
            if (pushNotificationOnce(`task-assigned-${task.id}`, `New task assigned: "${task.title}" for ${eventName}.`)) changed = true;
        } else if (task.status === "Revision Requested") {
            if (pushNotificationOnce(`task-revision-${task.id}`, `The Club Head requested revisions on "${task.title}" for ${eventName}.`)) changed = true;
        } else if (task.status === "Verified") {
            if (pushNotificationOnce(`task-verified-${task.id}`, `Your submission for "${task.title}" (${eventName}) was verified and closed. Great work!`)) changed = true;
        }
    });

    // Broadcast: any club opening recruitment or publishing an event notifies
    // every student the next time their dashboard loads state.
    (state.domains || []).forEach(d => {
        if (d.recruitmentOpen) {
            if (pushNotificationOnce(`domain-open-${d.id}`, `"${d.club}" opened recruitment for ${d.title} — apply now!`)) changed = true;
        }
    });

    getPublishedEvents().forEach(eb => {
        if (pushNotificationOnce(`event-published-${eb.id}`, `"${eb.club}" announced a new event: ${getEventDisplayName(eb)}.`)) changed = true;
    });

    if (changed) saveState();
}

function getMyNotifications() {
    return (state.notifications || []).filter(n => n.studentId === CURRENT_STUDENT_ID).sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
}

function getUnreadNotificationCount() {
    return getMyNotifications().filter(n => !n.read).length;
}

function markAllNotificationsRead() {
    getMyNotifications().forEach(n => { n.read = true; });
    saveState();
    if (typeof Api !== "undefined") {
        Api.markAllNotificationsRead().catch(err => console.warn("Couldn't mark notifications read on backend:", err));
    }
}
