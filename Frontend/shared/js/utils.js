// Toast notification helper
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById("toast-container");
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconClass = "fa-solid fa-circle-check";
    if (type === 'info') iconClass = "fa-solid fa-circle-info";
    if (type === 'warning') iconClass = "fa-solid fa-circle-exclamation";
    if (type === 'danger') iconClass = "fa-solid fa-triangle-exclamation";

    toast.innerHTML = `<i class="${iconClass}"></i> <span class="toast-msg"></span>`;
    toast.querySelector(".toast-msg").textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("fade-out");
    }, 2700);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Format Currency
function formatCurrency(amt) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amt || 0);
}

// ─────────────────────────────────────────────────────────────
// DATE / TIME UTILITIES
// ─────────────────────────────────────────────────────────────

// Format YYYY-MM-DD → "5 Aug 2026"
function formatDate(dateStr) {
    if (!dateStr || dateStr === '—') return '—';
    try {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [year, month, day] = dateStr.split('-');
        return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
    } catch(e) { return dateStr; }
}

// Format "YYYY-MM-DD HH:MM" → "5 Aug 2026, 09:30"
function formatDateTime(dtStr) {
    if (!dtStr) return '—';
    const parts = dtStr.trim().split(' ');
    if (parts.length < 2) return formatDate(parts[0]);
    return `${formatDate(parts[0])}, ${parts[1]}`;
}

// Formats a naive "YYYY-MM-DD[T ]HH:MM[:SS]" wall-clock string as "2:35 PM IST"
// -- no Date object / timezone math, since attendance check-in timestamps are
// already stored as IST wall-clock values by the backend (see
// app.routers.attendance._now_ist), not UTC like everything else in this app.
function formatIstTime(dtStr) {
    if (!dtStr) return '';
    const timePart = dtStr.replace('T', ' ').trim().split(' ')[1] || '';
    const [hStr, mStr] = timePart.split(':');
    let h = parseInt(hStr, 10);
    if (isNaN(h)) return '';
    const m = (mStr || '00').padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm} IST`;
}

// Parse "HH:MM" → minutes since midnight
function parseTimeToMinutes(t) {
    if (!t) return 0;
    const clean = t.trim();
    const parts = clean.split(':');
    return parseInt(parts[0] || '0') * 60 + parseInt(parts[1] || '0');
}

// Parse "HH:MM - HH:MM" → { start, end } in minutes
function parseTimeRange(rangeStr) {
    if (!rangeStr) return null;
    const sep = rangeStr.includes(' - ') ? ' - ' : '-';
    const parts = rangeStr.split(sep).map(s => s.trim());
    if (parts.length < 2) return { start: parseTimeToMinutes(parts[0]), end: parseTimeToMinutes(parts[0]) + 60 };
    return { start: parseTimeToMinutes(parts[0]), end: parseTimeToMinutes(parts[1]) };
}

// Check if two time range strings overlap (returns true if they overlap)
function timesOverlap(rangeStrA, rangeStrB) {
    const a = parseTimeRange(rangeStrA);
    const b = parseTimeRange(rangeStrB);
    if (!a || !b) return true; // conservative: assume conflict if can't parse
    // Ranges overlap if a.start < b.end AND b.start < a.end
    return a.start < b.end && b.start < a.end;
}

// Format proposal time range "10:00 - 22:00" → "Start Time: 10:00, End Time: 22:00"
function formatTimeRange(timeStr) {
    if (!timeStr || timeStr === '—') return '—';
    const sep = timeStr.includes(' - ') ? ' - ' : '-';
    const parts = timeStr.split(sep).map(s => s.trim());
    if (parts.length >= 2) {
        return `Start: ${parts[0]}, End: ${parts[1]}`;
    }
    return timeStr;
}

// Calculates date/time-aware available stock for an inventory item
function getRemainingStockForDate(itemId, targetDateStr, targetTimeRangeStr) {
    if (typeof state === "undefined" || !state.inventory) return 0;
    const item = state.inventory.find(i => i.id === itemId);
    if (!item) return 0;

    const total = item.totalStock || 0;
    if (!targetDateStr) return item.availableStock || total;

    const activeUsages = (state.inventoryUsage || []).filter(u => {
        if (u.itemId !== itemId) return false;
        if (u.status === "Returned" || u.status === "Cancelled") return false;

        const uDate = u.date || (u.checked_out_at ? String(u.checked_out_at).slice(0, 10) : "");
        if (uDate !== targetDateStr) return false;

        if (targetTimeRangeStr && u.timeRange) {
            return timesOverlap(targetTimeRangeStr, u.timeRange);
        }
        return true;
    });

    const bookedQty = activeUsages.reduce((sum, u) => sum + (Number(u.qty) || 0), 0);
    return Math.max(total - bookedQty, 0);
}

// Generates a unique-enough ID for new records ("prefix-<base36 time>-<random>").
// Always includes a random suffix so IDs never collide even when several
// records are created in the same tick (e.g. inside a loop).
function generateId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Max size for any user-uploaded file (bills, proof docs, posters). Some of
// these are persisted as base64 data URLs directly in the localStorage
// state blob, so an unbounded upload can bloat/break it.
const MAX_UPLOAD_MB = 5;
function isFileTooLarge(file) {
    return !!file && file.size > MAX_UPLOAD_MB * 1024 * 1024;
}

// Appends a lightweight audit entry to a record going through an approve/
// reject/status-change flow (join requests, volunteer applications,
// proposals). Relies on the page's own `__session` global (set by each
// dashboard's requireRole() call) to attribute the action.
function logHistory(record, action) {
    if (!record) return;
    if (!Array.isArray(record.history)) record.history = [];
    const session = (typeof __session !== "undefined" && __session) || {};
    record.history.push({
        action,
        by: session.name || SSCMS_ROLE_LABELS[session.role] || session.role || "Unknown",
        on: new Date().toISOString()
    });
}

// Escape HTML special characters for safe interpolation into innerHTML templates
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ─────────────────────────────────────────────────────────────
// DOM-ID / BACKEND-CALL HELPERS
//
// Every dashboard reads record ids off DOM `data-*` attributes (always
// strings) and compares/sends them against backend rows (always numeric
// ids). `getAttribute(...) === someNumericId` silently fails -- no error,
// the action just does nothing -- and that exact bug recurred independently
// in at least half a dozen places across this app (procurement task
// allotment, event registration, QR check-in, inventory allocation...).
// Route every DOM-id read through numAttr() instead of a bare
// getAttribute()/Number() so it can't happen again.
// ─────────────────────────────────────────────────────────────

// Reads a data-* attribute (or any attribute) as a number. Returns null for
// a missing/blank/non-numeric attribute instead of NaN, so callers can do a
// plain `if (!id) return;` guard.
function numAttr(el, attrName) {
    if (!el) return null;
    const raw = el.getAttribute(attrName);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
}

// Runs an Api.* call and turns a thrown ApiError into a toast instead of an
// uncaught rejection or (worse) a silently-swallowed catch block that lets
// the caller carry on updating local state as if the backend call had
// succeeded. Collapses the
//   try { await Api.x(...) } catch (e) { showToast(...); return; }
// pattern this app repeats dozens of times into one line, and makes it
// impossible to accidentally forget the abort-on-failure `return`.
//
// Usage:
//   const result = await callApi(() => Api.deleteDomain(id), "Couldn't delete domain");
//   if (!result.ok) return;
//   // use result.data
async function callApi(apiCallFn, errorPrefix = "Request failed") {
    try {
        const data = await apiCallFn();
        return { ok: true, data };
    } catch (e) {
        showToast(`${errorPrefix}: ${e.detail || e.message}`, "danger");
        return { ok: false, error: e };
    }
}
