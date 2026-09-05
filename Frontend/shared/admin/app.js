// Centralized State Management with LocalStorage persistence.
// loadState/saveState/DEFAULT_STATE now live in shared/js/seed-data.js and
// shared/js/state-core.js (loaded before this file) so all four dashboards
// share one canonical schema/seed instead of four hand-copies of it.
let activeEventBudgetId = null; // default active budget event to show splits (null until an event is picked)
let activeOverviewClubName = null; // active club being viewed in Club Overview tab (null = club gallery); also scopes the nested Finances & Budgets sub-tab
let activeOverviewSubTab = "activities"; // "activities" | "members" | "certification" | "finances" — sub-tab within a club's overview detail
let activeProposalId = null; // default active proposal (null for showing gallery first)
let activeInventoryId = null; // default active inventory item (null for showing available items list first)
let globalQuery = "";
let calendarDate = new Date(); // Default calendar month: today's month
let calendarResourceType = "venues"; // Default resource type: "venues" or "requirements"
let calendarSelectedVenues = null; // List of selected venue names/IDs for calendar filters
let calendarSelectedRequirements = null; // List of selected requirement item names for calendar filters

// Toast/currency/date/time helpers (showToast, escapeHtml, formatCurrency,
// formatDate, formatDateTime, parseTimeToMinutes, parseTimeRange,
// timesOverlap, formatTimeRange) now live in shared/js/utils.js

// -------------------------------------------------------------
// RENDERERS
// -------------------------------------------------------------

function renderAll() {
    renderDashboard();
    renderClubOverview(); // also renders the nested Finances & Budgets sub-tab
    renderInventory();
    renderVenues();
    renderProposals();
    renderCalendar();
    renderReports();
}

// ============================================================
// ANALYTICS REPORTS (Faculty Coordinator only) — Component 13.
// Generates / lists / downloads persisted reports from the
// backend /reports endpoints. The tab is wired up in the faculty
// dashboard only; the root element is absent for the President,
// so all of this is a no-op there.
// ============================================================
const REPORT_TYPES_META = {
    club_summary:       { label: "Club Summary",         icon: "fa-people-group",        desc: "Per-club member counts, events conducted and budget status." },
    event_summary:      { label: "Event Summary",        icon: "fa-calendar-check",       desc: "Every event with registrations, attendance and certificates issued." },
    volunteer_summary:  { label: "Volunteer Performance", icon: "fa-user-group",          desc: "Per-volunteer tasks assigned, verified and certificates earned." },
    finance_summary:    { label: "Finance Summary",      icon: "fa-wallet",               desc: "Per-club allocated vs. spent with utilization percentage." },
    comprehensive:      { label: "Comprehensive",        icon: "fa-file-circle-check",    desc: "All four summaries combined into a single report." }
};

function renderReports() {
    const root = document.getElementById("reports-root");
    if (!root) return; // not the faculty dashboard (or tab removed)
    if (__session.role !== "facultycoordinator") return;

    root.innerHTML = `
        <div style="display:grid; grid-template-columns: minmax(320px, 360px) 1fr; gap:1.5rem; align-items:start;">
            <div class="dashboard-card">
                <div class="card-header">
                    <h3><i class="fa-solid fa-wand-magic-sparkles text-indigo"></i> Generate Report</h3>
                </div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Report Type</label>
                        <select id="report-type-select" class="form-select">
                            ${Object.keys(REPORT_TYPES_META).map(k =>
                                `<option value="${k}">${REPORT_TYPES_META[k].label}</option>`
                            ).join("")}
                        </select>
                        <p class="text-muted" style="font-size:0.75rem; margin:0.35rem 0 0;" id="report-type-desc">${REPORT_TYPES_META.club_summary.desc}</p>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.6rem; margin-top:0.75rem;">
                        <div class="form-group" style="min-width:0;">
                            <label class="form-label" style="font-size:0.8rem;">From</label>
                            <input type="date" id="report-date-from" class="form-input" style="width:100%; min-width:0; box-sizing:border-box; padding:0.45rem 0.5rem; font-size:0.82rem;">
                        </div>
                        <div class="form-group" style="min-width:0;">
                            <label class="form-label" style="font-size:0.8rem;">To</label>
                            <input type="date" id="report-date-to" class="form-input" style="width:100%; min-width:0; box-sizing:border-box; padding:0.45rem 0.5rem; font-size:0.82rem;">
                        </div>
                    </div>
                    <button class="btn btn-primary" id="btn-generate-report" style="width:100%; margin-top:0.75rem;">
                        <i class="fa-solid fa-file-circle-plus"></i> Generate Report
                    </button>
                    <div id="report-generate-status" style="margin-top:0.85rem;"></div>
                </div>
            </div>

            <div class="dashboard-card">
                <div class="card-header">
                    <h3><i class="fa-solid fa-folder-open text-indigo"></i> Previously Generated Reports</h3>
                    <span class="badge badge-info" id="reports-count">0</span>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-compact">
                            <thead>
                                <tr><th>Title</th><th>Type</th><th>Generated</th><th class="text-right">Actions</th></tr>
                            </thead>
                            <tbody id="reports-list-tbody">
                                <tr><td colspan="4" class="text-muted text-center" style="padding:1.25rem;">Loading reports&hellip;</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    const typeSelect = document.getElementById("report-type-select");
    typeSelect.addEventListener("change", () => {
        document.getElementById("report-type-desc").textContent = REPORT_TYPES_META[typeSelect.value].desc;
    });
    document.getElementById("btn-generate-report").addEventListener("click", generateReportFromForm);

    loadReportsList();
}

async function generateReportFromForm() {
    const btn = document.getElementById("btn-generate-report");
    const statusEl = document.getElementById("report-generate-status");
    const type = document.getElementById("report-type-select").value;
    const from = document.getElementById("report-date-from").value || null;
    const to = document.getElementById("report-date-to").value || null;
    btn.disabled = true;
    statusEl.innerHTML = `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.6rem 0.8rem; background:var(--primary-light); color:var(--primary); border-radius:var(--border-radius-md); font-size:0.82rem;">
        <i class="fa-solid fa-spinner fa-spin"></i> Generating ${escapeHtml(REPORT_TYPES_META[type].label)}&hellip;</div>`;
    try {
        const report = await Api.generateReport(type, from, to);
        statusEl.innerHTML = `<div style="padding:0.6rem 0.8rem; background:var(--success-light); color:var(--success); border:1px solid rgba(16,185,129,0.25); border-radius:var(--border-radius-md); font-size:0.82rem;">
            <i class="fa-solid fa-circle-check"></i> <strong>${escapeHtml(report.title)}</strong> generated.</div>`;
        await loadReportsList();
    } catch (e) {
        statusEl.innerHTML = `<div style="padding:0.6rem 0.8rem; background:var(--danger-light); color:var(--danger); border:1px solid rgba(239,68,68,0.25); border-radius:var(--border-radius-md); font-size:0.82rem;">
            <i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(e.detail || e.message || "Generation failed.")}</div>`;
    } finally {
        btn.disabled = false;
    }
}

async function loadReportsList() {
    const tbody = document.getElementById("reports-list-tbody");
    if (!tbody) return;
    const countEl = document.getElementById("reports-count");
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center" style="padding:1.25rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading&hellip;</td></tr>`;
    try {
        const reports = await Api.listReports() || [];
        if (countEl) countEl.textContent = String(reports.length);
        tbody.innerHTML = reports.map(r => `
            <tr>
                <td>${escapeHtml(r.title)}</td>
                <td><span class="badge badge-info">${escapeHtml((REPORT_TYPES_META[r.report_type] || {}).label || r.report_type)}</span></td>
                <td>${r.created_at ? formatDateTime(String(r.created_at).replace('T', ' ').substring(0, 16)) : "-"}</td>
                <td class="text-right" style="white-space:nowrap;">
                    <button class="btn btn-secondary btn-sm" data-report-view="${r.id}"><i class="fa-solid fa-eye"></i> View</button>
                    <button class="btn btn-secondary btn-sm" data-report-download="${r.id}"><i class="fa-solid fa-download"></i> CSV</button>
                </td>
            </tr>
        `).join("") || `<tr><td colspan="4" class="text-muted text-center" style="padding:1.25rem;">No reports generated yet.</td></tr>`;
        tbody.querySelectorAll("[data-report-download]").forEach(btn => {
            btn.addEventListener("click", () => downloadReportCsv(Number(btn.getAttribute("data-report-download"))));
        });
        tbody.querySelectorAll("[data-report-view]").forEach(btn => {
            btn.addEventListener("click", () => viewReportDetail(Number(btn.getAttribute("data-report-view"))));
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center" style="padding:1.25rem;">Could not load reports.</td></tr>`;
    }
}

async function downloadReportCsv(id) {
    try {
        const csv = await Api.downloadReport(id);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report_${id}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("Report downloaded.");
    } catch (e) {
        showToast(`Download failed: ${e.detail || e.message || e}`, "error");
    }
}

// Opens the Reports history "View" action: fetches the full report (Report
// Generation component) and renders its JSON payload in a readable panel.
async function viewReportDetail(id) {
    const root = document.getElementById("reports-root");
    if (!root) return;
    try {
        const report = await Api.getReport(id);
        if (!report) throw new Error("Report not found");
        const typeMeta = REPORT_TYPES_META[report.report_type] || { label: report.report_type, icon: "fa-file-lines" };
        root.innerHTML = `
            <div class="dashboard-card">
                <div class="card-header">
                    <h3><i class="fa-solid ${typeMeta.icon} text-indigo"></i> ${escapeHtml(report.title)}</h3>
                    <button class="btn btn-secondary btn-sm" id="report-back-btn"><i class="fa-solid fa-arrow-left"></i> Back to list</button>
                </div>
                <div class="card-body">
                    <div class="prop-summary-banner" style="margin-bottom:1rem;">
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-tag text-indigo"></i>
                            <div><span class="prop-summary-lbl">Type</span><span class="prop-summary-val">${escapeHtml(typeMeta.label)}</span></div>
                        </div>
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-calendar-days text-amber"></i>
                            <div><span class="prop-summary-lbl">Range</span><span class="prop-summary-val">${report.date_from || "—"} → ${report.date_to || "—"}</span></div>
                        </div>
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-user-gear text-emerald"></i>
                            <div><span class="prop-summary-lbl">Generated By</span><span class="prop-summary-val">${escapeHtml(report.generated_by || "—")}</span></div>
                        </div>
                    </div>
                    ${renderReportData(report.data)}
                    <div style="margin-top:1rem; display:flex; gap:0.5rem; justify-content:flex-end;">
                        <button class="btn btn-secondary btn-sm" id="report-download-again"><i class="fa-solid fa-download"></i> Download CSV</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById("report-back-btn").addEventListener("click", renderReports);
        const dlBtn = document.getElementById("report-download-again");
        if (dlBtn) dlBtn.addEventListener("click", () => downloadReportCsv(id));
    } catch (e) {
        showToast(`Could not load report: ${e.detail || e.message || e}`, "error");
    }
}

function renderReportData(data) {
    if (!data) return `<p class="text-muted text-center" style="padding:1rem;">This report contains no data.</p>`;
    const sections = [];
    Object.entries(data).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            const rows = value.slice(0, 100);
            if (rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null) {
                const cols = Object.keys(rows[0]);
                sections.push(`
                    <div class="setup-section" style="margin-top:0.75rem;">
                        <h5 class="setup-section-title"><i class="fa-solid fa-table"></i> ${escapeHtml(humanizeKey(key))} (${value.length})</h5>
                        <div class="table-responsive" style="max-height:400px; overflow:auto; border:1px solid var(--border-color); border-radius:var(--border-radius-md);">
                            <table class="table table-compact" style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                                <thead>
                                    <tr style="background:var(--bg-main); border-bottom:2px solid var(--border-color); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
                                        ${cols.map(c => `<th style="padding:0.6rem 0.75rem; white-space:nowrap;">${escapeHtml(humanizeKey(c))}</th>`).join("")}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows.map(r => `
                                        <tr style="border-bottom:1px solid var(--border-color);">
                                            ${cols.map(c => `<td style="padding:0.5rem 0.75rem; white-space:nowrap;">${escapeHtml(formatCellValue(r[c]))}</td>`).join("")}
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `);
            } else {
                sections.push(`
                    <div class="setup-section" style="margin-top:0.75rem;">
                        <h5 class="setup-section-title"><i class="fa-solid fa-list"></i> ${escapeHtml(humanizeKey(key))} (${value.length})</h5>
                        ${rows.length ? `<ul style="padding-left:1.25rem; font-size:0.85rem; margin:0.5rem 0;">${rows.map(r => `<li>${escapeHtml(formatCellValue(r))}</li>`).join("")}</ul>` : `<p class="text-muted text-center" style="padding:0.5rem;">No items.</p>`}
                    </div>
                `);
            }
        } else if (value !== null && typeof value === "object") {
            sections.push(`
                <div class="setup-section" style="margin-top:0.75rem;">
                    <h5 class="setup-section-title"><i class="fa-solid fa-bars-staggered"></i> ${escapeHtml(humanizeKey(key))}</h5>
                    <pre class="report-data-pre" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--border-radius-md); padding:0.75rem; font-size:0.78rem; max-height:300px; overflow:auto; white-space:pre-wrap;">${escapeHtml(JSON.stringify(value, null, 2))}</pre>
                </div>
            `);
        } else {
            sections.push(`
                <div class="setup-section" style="margin-top:0.75rem;">
                    <h5 class="setup-section-title">${escapeHtml(humanizeKey(key))}</h5>
                    <p style="font-size:0.9rem; font-weight:600; margin:0.25rem 0;">${escapeHtml(formatCellValue(value))}</p>
                </div>
            `);
        }
    });
    return sections.join("");
}

function humanizeKey(key) {
    return String(key)
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

function formatCellValue(val) {
    if (val === null || val === undefined) return "—";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "number") return String(val);
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
}

function formatReportRow(row) {
    if (row === null || row === undefined) return "—";
    if (typeof row !== "object") return String(row);
    return Object.entries(row).map(([k, v]) => {
        const val = (v === null || v === undefined) ? "—" : String(v);
        return `${humanizeKey(k)}: ${val}`;
    }).join(" · ");
}

function renderDashboard() {
    // 1. Compute Stats
    let totalAllotted = state.clubsFinances.reduce((acc, c) => acc + c.allotted, 0);
    let totalSpent = state.clubsFinances.reduce((acc, c) => acc + c.spent, 0);
    let activeBookings = state.bookings.filter(b => b.status === "Confirmed").length;
    let inventoryLent = state.inventoryUsage.filter(u => u.status === "In Use").length;

    document.getElementById("stat-total-budget").textContent = formatCurrency(totalAllotted);
    document.getElementById("stat-spent-budget").textContent = formatCurrency(totalSpent);
    document.getElementById("stat-active-bookings").textContent = activeBookings;
    document.getElementById("stat-inventory-lent").textContent = inventoryLent;

    const pendingProposalsEl = document.getElementById("stat-pending-proposals");
    if (pendingProposalsEl) {
        const pendingCount = (state.proposals || []).filter(p => p.status === "Pending" || p.status === "Pending President Review").length;
        pendingProposalsEl.textContent = pendingCount;
    }

    // Faculty-only "Available to Allocate" master budget pool stat (see the
    // MASTER BUDGET POOL section in bindEvents for the edit flow).
    if (__session.role === "facultycoordinator") {
        const poolTotal = (state.facultyBudgetPool && state.facultyBudgetPool.total) || 0;
        const poolAvailable = poolTotal - totalAllotted;
        const poolAvailableEl = document.getElementById("stat-budget-pool-available");
        const poolTotalEl = document.getElementById("stat-budget-pool-total");
        if (poolAvailableEl) poolAvailableEl.textContent = formatCurrency(poolAvailable);
        if (poolTotalEl) poolTotalEl.textContent = formatCurrency(poolTotal);

        // Reconcile the four headline stat cards against the backend's
        // authoritative budget overview (Report Generation / analytics source
        // of truth). Non-blocking: local state stays if the backend is down.
        Api.getBudgetOverview().then(overview => {
            if (!overview) return;
            if (overview.total_allocated != null) {
                document.getElementById("stat-total-budget").textContent = formatCurrency(overview.total_allocated);
            }
            if (overview.total_spent != null) {
                document.getElementById("stat-spent-budget").textContent = formatCurrency(overview.total_spent);
            }
            if (overview.active_bookings != null) {
                document.getElementById("stat-active-bookings").textContent = overview.active_bookings;
            }
            if (overview.inventory_on_loan != null) {
                document.getElementById("stat-inventory-lent").textContent = overview.inventory_on_loan;
            }
        }).catch(() => {
            // backend unreachable — keep locally computed stats
        });
    }

    let utilizationPercent = totalAllotted > 0 ? Math.round((totalSpent / totalAllotted) * 100) : 0;
    document.getElementById("stat-budget-percent").textContent = `${utilizationPercent}% of allotment spent`;

    // 2. Finance Chart by Club
    const chartContainer = document.getElementById("club-finance-chart");
    chartContainer.innerHTML = "";
    
    state.clubsFinances.forEach(cf => {
        const spentPercent = cf.allotted > 0 ? Math.round((cf.spent / cf.allotted) * 100) : 0;
        
        const barWrapper = document.createElement("div");
        barWrapper.className = "chart-bar-wrapper";

        const barFill = document.createElement("div");
        barFill.className = "chart-bar-fill";
        barFill.style.height = `${Math.max(spentPercent, 5)}%`; // minimum height for visuals
        
        // Tooltip
        const tooltip = document.createElement("span");
        tooltip.className = "chart-bar-tooltip";
        tooltip.textContent = `${cf.club}: Spent ${formatCurrency(cf.spent)} / ${formatCurrency(cf.allotted)} (${spentPercent}%)`;
        barFill.appendChild(tooltip);

        const barLabel = document.createElement("span");
        barLabel.className = "chart-bar-label";
        barLabel.textContent = cf.club.split(" ")[0]; // First word of club name
        barLabel.title = cf.club;

        barWrapper.appendChild(barFill);
        barWrapper.appendChild(barLabel);
        chartContainer.appendChild(barWrapper);
    });

    // 3. Venue Status summary — today's status only
    const todayStr = new Date().toISOString().slice(0, 10);
    const venueQuickList = document.getElementById("venue-quick-list");
    venueQuickList.innerHTML = "";
    state.venues.slice(0, 4).forEach(v => {
        // Find if booked today
        const booked = state.bookings.find(b => b.venueId === v.id && b.date === todayStr && b.status === "Confirmed");

        const li = document.createElement("li");
        li.className = "venue-quick-item";
        li.innerHTML = `
            <div class="venue-quick-info">
                <span class="venue-quick-name">${escapeHtml(v.name)}</span>
                <span class="venue-quick-desc">${escapeHtml(v.location)} (Cap: ${v.capacity})</span>
            </div>
            <span class="badge ${booked ? 'badge-danger' : 'badge-success'}">
                ${booked ? `Booked &middot; ${formatTimeRange(booked.timeSlot)}` : 'Available'}
            </span>
        `;
        venueQuickList.appendChild(li);
    });

    // 4. Upcoming Venue Bookings table (top 5)
    const bookingsTbody = document.getElementById("dashboard-bookings-tbody");
    bookingsTbody.innerHTML = "";
    const activeBookingsList = state.bookings
        .filter(b => b.status === "Confirmed")
        .slice(0, 5);

    if (activeBookingsList.length === 0) {
        bookingsTbody.innerHTML = `<tr><td colspan="5" class="text-muted">No active venue bookings.</td></tr>`;
    } else {
        activeBookingsList.forEach(b => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${escapeHtml(b.venueName)}</strong></td>
                <td>${escapeHtml(b.event)}</td>
                <td>${escapeHtml(b.club || "General / Other")}</td>
                <td>${b.date ? formatDate(b.date) : '—'} <span class="text-muted" style="font-size:0.8rem;"><i class="fa-solid fa-clock" style="margin-left:0.2rem;"></i> ${b.timeSlot ? formatTimeRange(b.timeSlot) : '—'}</span></td>
                <td><span class="badge badge-success">${b.status}</span></td>
            `;
            bookingsTbody.appendChild(tr);
        });
    }

    // 5. Inventory alerts (Low available stock vs total stock)
    const alertsList = document.getElementById("inventory-alerts-list");
    alertsList.innerHTML = "";
    state.inventory.forEach(inv => {
        inv.availableStock = getRemainingStockForDate(inv.id, todayStr, null);
        const stockPct = inv.totalStock > 0 ? Math.round((inv.availableStock / inv.totalStock) * 100) : 0;
        
        // show if stock is less than 50%
        if (stockPct < 50) {
            let colorFillClass = "bg-danger-fill";
            if (stockPct >= 30) colorFillClass = "bg-warning-fill";

            const alertDiv = document.createElement("div");
            alertDiv.className = "alert-progress-item";
            alertDiv.innerHTML = `
                <div class="progress-header">
                    <span>${escapeHtml(inv.name)} (${escapeHtml(inv.code)})</span>
                    <span class="text-danger">${inv.availableStock}/${inv.totalStock} available (${stockPct}%)</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill ${colorFillClass}" style="width: ${stockPct}%"></div>
                </div>
            `;
            alertsList.appendChild(alertDiv);
        }
    });

    if (alertsList.innerHTML === "") {
        alertsList.innerHTML = `<p class="text-muted text-center" style="padding: 2rem 0;"><i class="fa-solid fa-square-check text-success"></i> All inventory stock limits healthy!</p>`;
    }
}

function renderInventory() {
    const galleryView = document.getElementById("inventory-gallery-view");
    const detailView = document.getElementById("inventory-detail-view");

    // ── 1. RENDER LIST/GALLERY VIEW ───────────────────────────
    if (activeInventoryId === null) {
        if (galleryView) galleryView.classList.remove("hidden");
        if (detailView) detailView.classList.add("hidden");

        const categoryFilter = document.getElementById("inventory-category-filter").value;
        const statusFilter = document.getElementById("inventory-status-filter").value;
        
        const listContainer = document.getElementById("inventory-items-list");
        if (!listContainer) return;
        listContainer.innerHTML = "";

        // Availability shown here is scoped to TODAY: an item only shows as
        // reduced on the day it's actually booked out for, not for the whole
        // lifetime of the allocation (see getRemainingStockForDate).
        const todayForList = new Date().toISOString().slice(0, 10);
        const filteredItems = state.inventory.filter(item => {
            // Recalculate dynamic available stock for this item, scoped to today
            item.availableStock = getRemainingStockForDate(item.id, todayForList, null);

            // category search
            if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
            
            // status search
            if (statusFilter !== "all") {
                if (statusFilter === "In Stock" && item.availableStock === 0) return false;
                if (statusFilter === "Out of Stock" && item.availableStock > 0) return false;
                if (statusFilter === "Lent Out") {
                    const logs = state.inventoryUsage.filter(u => u.itemId === item.id && u.status === "In Use");
                    if (logs.length === 0) return false;
                }
            }

            // global search
            if (globalQuery !== "") {
                const query = globalQuery.toLowerCase();
                return item.name.toLowerCase().includes(query) || 
                       item.code.toLowerCase().includes(query);
            }

            return true;
        });

        document.getElementById("inventory-count-summary").textContent = `Showing ${filteredItems.length} items`;

        if (filteredItems.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-muted); font-style: italic;">
                    No inventory items match search criteria.
                </div>
            `;
        } else {
            filteredItems.forEach(item => {
                const availPercent = item.totalStock > 0 ? Math.round((item.availableStock / item.totalStock) * 100) : 0;
                let barClass = "bg-success-fill";
                if (availPercent === 0) barClass = "bg-danger-fill";
                else if (availPercent < 50) barClass = "bg-warning-fill";

                const div = document.createElement("div");
                div.className = "inventory-inline-row";
                div.setAttribute("data-id", item.id);
                div.style.cursor = "pointer";
                div.innerHTML = `
                    <div style="flex: 1;"><code>${escapeHtml(item.code)}</code></div>
                    <div style="flex: 2.2; font-weight: 700; color: var(--text-main);">${escapeHtml(item.name)}</div>
                    <div style="flex: 1.8; color: var(--text-muted);">${escapeHtml(item.category)}</div>
                    <div style="flex: 2.6;">
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:600; margin-bottom:0.25rem;">
                            <span>${item.availableStock} / ${item.totalStock} available</span>
                            <span class="text-muted">${availPercent}%</span>
                        </div>
                        <div class="progress-bar-bg" style="height:8px;">
                            <div class="progress-bar-fill ${barClass}" style="width: ${availPercent}%"></div>
                        </div>
                    </div>
                `;
                listContainer.appendChild(div);
            });
        }
        return;
    }

    // ── 2. RENDER DETAILED VIEW OF SPECIFIC ITEM ──────────────
    if (galleryView) galleryView.classList.add("hidden");
    if (detailView) detailView.classList.remove("hidden");

    const item = state.inventory.find(i => i.id === activeInventoryId);
    if (!item) {
        activeInventoryId = null;
        renderInventory();
        return;
    }

    // Recalculate dynamic available stock for detail view, scoped to today
    // (same date-aware rule as the gallery list — see getRemainingStockForDate)
    item.availableStock = getRemainingStockForDate(item.id, new Date().toISOString().slice(0, 10), null);

    // Set Header titles
    document.getElementById("review-inv-name").textContent = item.name;
    document.getElementById("review-inv-category").textContent = item.category;

    // Status badge styling
    const statusBadge = document.getElementById("review-inv-status");
    let statusClass = "badge-success";
    let statusText = "In Stock";
    if (item.availableStock === 0) {
        statusClass = "badge-danger";
        statusText = "Out of Stock";
    } else if (item.availableStock < item.totalStock) {
        statusClass = "badge-warning";
        statusText = "Lent Partial";
    }
    statusBadge.className = `badge ${statusClass}`;
    statusBadge.textContent = statusText;

    // Populate Detailed stats banner (removing storage location completely)
    const statsBanner = document.getElementById("inventory-stats-banner");
    if (statsBanner) {
        statsBanner.innerHTML = `
            <div class="prop-summary-item">
                <i class="fa-solid fa-barcode text-indigo" style="font-size:1.25rem;"></i>
                <div>
                    <span class="prop-summary-lbl">Asset Code</span>
                    <span class="prop-summary-val">${escapeHtml(item.code)}</span>
                </div>
            </div>
            <div class="prop-summary-item">
                <i class="fa-solid fa-boxes-stacked text-emerald" style="font-size:1.25rem;"></i>
                <div>
                    <span class="prop-summary-lbl">Total Stock Count</span>
                    <span class="prop-summary-val">${item.totalStock} units</span>
                </div>
            </div>
            <div class="prop-summary-item">
                <i class="fa-solid fa-hand-holding-hand text-amber" style="font-size:1.25rem;"></i>
                <div>
                    <span class="prop-summary-lbl">Current Available</span>
                    <span class="prop-summary-val" style="color:var(--primary);font-weight:700;">${item.availableStock} units</span>
                </div>
            </div>
        `;
    }

    // Render Usage log list filtered specifically for this item
    const usageContainer = document.getElementById("inventory-usage-list");
    if (usageContainer) {
        usageContainer.innerHTML = "";

        // Filter usages by item id
        const itemUsages = state.inventoryUsage.filter(u => u.itemId === activeInventoryId);

        if (itemUsages.length === 0) {
            usageContainer.innerHTML = `
                <div style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-style: italic;">
                    <i class="fa-solid fa-clipboard-question" style="font-size: 2.5rem; opacity: 0.4; margin-bottom: 0.75rem; display: block;"></i>
                    No active allocations or lending logs logged for this asset.
                </div>
            `;
        } else {
            itemUsages.forEach(u => {
                const div = document.createElement("div");
                div.className = "usage-inline-row";
                
                let usageStatusClass = "badge-warning";
                if (u.status === "Booked") usageStatusClass = "badge-outline-warning";
                if (u.status === "Returned") usageStatusClass = "badge-success";
                if (u.status === "Pending Review") usageStatusClass = "badge-warning"; // Highlight review required

                // Review & returned action button rules — President-only; Faculty
                // Coordinator only add/edit/removes the master catalogue, so no
                // handover/return workflow buttons show on their page.
                let actionHtml = "";
                if (__session.role === "president") {
                    if (u.status === "Booked") {
                        actionHtml = `<button class="btn btn-secondary btn-sm handover-usage-btn" data-id="${u.id}"><i class="fa-solid fa-handshake"></i> Mark In Use</button>`;
                    } else if (u.status === "In Use") {
                        actionHtml = `<button class="btn btn-secondary btn-sm volunteer-return-btn" data-id="${u.id}"><i class="fa-solid fa-reply"></i> Volunteer Returned</button>`;
                    } else if (u.status === "Pending Review") {
                        actionHtml = `<button class="btn btn-primary btn-sm confirm-return-btn" style="background-color: var(--success); border-color: var(--success);" data-id="${u.id}"><i class="fa-solid fa-check"></i> Verify &amp; Return</button>`;
                    } else {
                        actionHtml = `<span class="text-success" style="font-weight: 600; font-size: 0.8rem;"><i class="fa-solid fa-circle-check"></i> Returned</span>`;
                    }
                }
                const actionColumnHtml = __session.role === "president" ? `<div style="flex: 2; text-align: right;">${actionHtml}</div>` : "";

                // Volunteer details — auto-populated the moment a Club Head's
                // Procurement task for this item is accepted (assignedViaTask);
                // no manual entry happens here anymore.
                let volunteerSubtext = "";
                if (u.volunteerName) {
                    const iconClass = u.status === "Returned" ? "fa-user-check text-muted" : (u.status === "Pending Review" ? "fa-user-clock text-warning" : "fa-user-tag text-indigo");
                    const opacity = u.status === "Returned" ? "opacity:0.6;" : "";
                    volunteerSubtext = `<span class="volunteer-details-subtext" style="display:block; margin-top:0.25rem; ${opacity}"><i class="fa-solid ${iconClass}"></i> Volunteer: <strong>${escapeHtml(u.volunteerName)}</strong> (${escapeHtml(u.volunteerId)})</span>`;
                } else {
                    volunteerSubtext = `<span class="volunteer-details-subtext text-muted" style="display:block; margin-top:0.25rem; font-style:italic;"><i class="fa-solid fa-user-slash"></i> Volunteer not allotted</span>`;
                }

                div.innerHTML = `
                    <div style="flex: 2; font-weight: 700; color: var(--text-main);">${escapeHtml(u.itemName)}</div>
                    <div style="flex: 1.5; color: var(--text-muted); font-weight: 500;">${escapeHtml(u.club || "General / Other")}</div>
                    <div style="flex: 1.8; color: var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(u.location || "On-ground")}</div>
                    <div style="flex: 2.2; font-weight: 500;">${escapeHtml(u.event)}</div>
                    <div style="flex: 1; text-align: center; font-weight: 700;">${u.qty}</div>
                    <div style="flex: 2; color: var(--text-muted); display: flex; flex-direction: column; gap: 0.15rem;">
                        <span style="font-weight: 600; color: var(--text-main); font-size: 0.82rem;">${formatDate(u.date)}</span>
                        <span style="font-size: 0.73rem; margin-top: 0.1rem;"><i class="fa-solid fa-clock" style="margin-right:0.2rem; opacity:0.7;"></i>${u.timeStart && u.timeEnd ? `${u.timeStart} – ${u.timeEnd}` : (u.timeRange || '—')}</span>
                    </div>
                    <div style="flex: 1.5; text-align: center;">
                        <span class="badge ${usageStatusClass}">${u.status}</span>
                        ${volunteerSubtext}
                    </div>
                    ${actionColumnHtml}
                `;
                usageContainer.appendChild(div);
            });
        }
    }

    // Populate drop down menus for allocation form — President-only (allocating
    // stock to clubs); Faculty Coordinator has no allocation modal.
    if (__session.role === "president") {
        const allocItemSelect = document.getElementById("alloc-item");
        if (allocItemSelect) {
            allocItemSelect.innerHTML = '<option value="">-- Select Available Item --</option>';
            state.inventory.forEach(item => {
                if (item.availableStock > 0) {
                    allocItemSelect.innerHTML += `<option value="${item.id}">${escapeHtml(item.name)} (${item.availableStock} available)</option>`;
                }
            });
        }
    }
}

function renderVenues() {
    const filterSelect = document.getElementById("venue-booking-filter");
    const filterVenueVal = filterSelect ? filterSelect.value : "all";
    
    // 1. Render Venues Cards Grid
    const cardsGrid = document.getElementById("venues-cards-grid");
    cardsGrid.innerHTML = "";

    state.venues.forEach(v => {
        // filter cards by search
        if (globalQuery !== "") {
            const query = globalQuery.toLowerCase();
            const matches = v.name.toLowerCase().includes(query) || 
                            v.location.toLowerCase().includes(query) || 
                            v.description.toLowerCase().includes(query) ||
                            v.facilities.toLowerCase().includes(query);
            if (!matches) return;
        }

        const card = document.createElement("div");
        card.className = "venue-card";

        card.innerHTML = `
            <div class="venue-header-img">
                <div class="venue-title-row">
                    <h3>${escapeHtml(v.name)}</h3>
                </div>
                <div class="venue-meta">
                    <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(v.location)}</span>
                    <span><i class="fa-solid fa-users"></i> Cap: ${v.capacity}</span>
                </div>
            </div>
            <div class="venue-actions" ${__session.role === "facultycoordinator" ? 'style="display: flex; gap: 0.5rem;"' : ''}>
                ${__session.role === "president" ? `
                <button class="btn btn-secondary btn-sm btn-full-width book-venue-card-btn" data-id="${v.id}">
                    <i class="fa-solid fa-calendar-plus"></i> Book Venue Room
                </button>
                ` : `
                <button class="btn btn-secondary btn-sm btn-full-width edit-venue-card-btn" data-id="${v.id}">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn btn-secondary btn-sm btn-full-width delete-venue-card-btn" data-id="${v.id}"
                    style="border-color: var(--danger); color: var(--danger);">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
                `}
            </div>
        `;
        cardsGrid.appendChild(card);
    });

    // 2. Booking filter dropdown options seed (if present)
    if (filterSelect) {
        const currentVal = filterSelect.value;
        filterSelect.innerHTML = '<option value="all">All Venues</option>';
        state.venues.forEach(v => {
            filterSelect.innerHTML += `<option value="${v.id}">${escapeHtml(v.name)}</option>`;
        });
        filterSelect.value = currentVal;
    }

    // 3. Render Bookings History Table
    const bookingsTbody = document.getElementById("venue-bookings-tbody");
    bookingsTbody.innerHTML = "";

    const filteredBookings = (state.bookings || []).filter(b => {
        if (filterVenueVal !== "all" && String(b.venueId) !== String(filterVenueVal)) return false;
        
        if (globalQuery !== "") {
            const query = globalQuery.toLowerCase();
            return (b.venueName || "").toLowerCase().includes(query) || 
                   (b.event || "").toLowerCase().includes(query) || 
                   (b.club || "").toLowerCase().includes(query);
        }
        return true;
    });

    if (filteredBookings.length === 0) {
        bookingsTbody.innerHTML = `<tr><td colspan="8" class="text-muted text-center">No bookings logged.</td></tr>`;
    } else {
        filteredBookings.forEach(b => {
            const tr = document.createElement("tr");
            let badgeClass = "badge-indigo";
            if (b.status === "Confirmed") badgeClass = "badge-success";
            if (b.status === "Completed") badgeClass = "badge-info";
            if (b.status === "Cancelled") badgeClass = "badge-danger";

            const canAction = b.status === "Confirmed";

            // Bookings Actions column (Complete/Cancel) is a President-only
            // permission — Faculty Coordinator only manages the venue catalogue,
            // not individual bookings.
            const actionsCellHtml = __session.role === "president" ? `
                <td class="text-right">
                    <div class="table-actions">
                        ${canAction ? `
                            <button class="action-btn action-btn-success complete-booking-btn" data-id="${b.id}" title="Mark Completed"><i class="fa-solid fa-circle-check"></i></button>
                            <button class="action-btn action-btn-warning release-booking-btn" data-id="${b.id}" title="Release this venue slot (rejected allocation)"><i class="fa-solid fa-rotate-left"></i></button>
                            <button class="action-btn action-btn-delete cancel-booking-btn" data-id="${b.id}" title="Cancel Booking"><i class="fa-solid fa-circle-xmark"></i></button>
                        ` : `<span class="text-muted">-</span>`}
                    </div>
                </td>
            ` : "";

            tr.innerHTML = `
                <td><code>${b.id}</code></td>
                <td><strong>${escapeHtml(b.venueName)}</strong></td>
                <td>${escapeHtml(b.event)}</td>
                <td>${escapeHtml(b.club || "General / Other")}</td>
                <td>${b.date ? formatDate(b.date) : '—'}</td>
                <td>${b.timeSlot ? formatTimeRange(b.timeSlot) : '—'}</td>
                <td><span class="badge ${badgeClass}">${b.status}</span></td>
                ${actionsCellHtml}
            `;
            bookingsTbody.appendChild(tr);
        });
    }

    // Populate modal booking options — President-only (Book Venue modal);
    // Faculty Coordinator uses Add/Edit Venue instead.
    if (__session.role === "president") {
        const bookingVenueSelect = document.getElementById("booking-venue");
        bookingVenueSelect.innerHTML = '<option value="">-- Choose Venue --</option>';
        state.venues.forEach(v => {
            bookingVenueSelect.innerHTML += `<option value="${v.id}">${escapeHtml(v.name)} (Cap: ${v.capacity})</option>`;
        });
    }
}

// ─────────────────────────────────────────────────────────────
// CLUB FINANCES & EVENT BUDGETS (MERGED) RENDERER
// ─────────────────────────────────────────────────────────────

// Sum only verified (Approved) BILL amounts for an event budget — drives the graph, remaining balance, and totals row
function getApprovedExpenseTotal(eb) {
    return eb.expenses.filter(e => e.status === "Approved").reduce((acc, e) => acc + (e.billAmount || 0), 0);
}

// Sum of the originally approved (reserved) amounts across all line items for an event budget
function getTotalApprovedAmount(eb) {
    return eb.expenses.reduce((acc, e) => acc + (e.approvedAmount || 0), 0);
}

function detailsOrBillCellFor(exp) {
    if (exp.status === "Not Utilized") {
        return `<span class="text-muted" style="font-size:0.75rem;">Not applicable</span>`;
    }
    if (exp.type === "Prize Money") {
        return exp.prizeDetails
            ? `<span class="badge badge-info" title="Bank details: ${escapeHtml(exp.prizeDetails.bankDetails)}">${escapeHtml(exp.prizeDetails.studentName)} (${escapeHtml(exp.prizeDetails.studentId)}, ${escapeHtml(exp.prizeDetails.department)}) — ${escapeHtml(exp.prizeDetails.affiliation)}</span>`
            : `<span class="text-muted" style="font-size:0.75rem;">Not submitted yet</span>`;
    }
    if (exp.type === "Judge/Guest Fee") {
        return exp.judgeDetails
            ? `<span class="badge badge-info" title="Bank details: ${escapeHtml(exp.judgeDetails.bankDetails)}">${escapeHtml(exp.judgeDetails.judgeName)} (${escapeHtml(exp.judgeDetails.contactNumber)})</span>`
            : `<span class="text-muted" style="font-size:0.75rem;">Not submitted yet</span>`;
    }
    if (exp.billFileName) {
        const shortName = exp.billFileName.length > 18 ? escapeHtml(exp.billFileName.slice(0, 15)) + '…' : escapeHtml(exp.billFileName);
        return exp.billFileUrl
            ? `<a class="badge badge-info" href="${SSCMS_API_BASE}${exp.billFileUrl}" target="_blank" rel="noopener" title="Open ${escapeHtml(exp.billFileName)}" style="text-decoration:none; cursor:pointer;"><i class="fa-solid fa-paperclip"></i> ${shortName} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.65rem; margin-left:0.25rem;"></i></a>`
            : `<span class="badge badge-info" title="${escapeHtml(exp.billFileName)}"><i class="fa-solid fa-paperclip"></i> ${shortName}</span>`;
    }
    return `<span class="text-muted" style="font-size:0.75rem;">Not uploaded yet</span>`;
}

// ─────────────────────────────────────────────────────────────
// CLUB OVERVIEW (Members & Volunteer Domains, read-only)
// ─────────────────────────────────────────────────────────────
function renderClubOverview() {
    if (!document.getElementById("tab-overview")) return;
    if (activeOverviewClubName === null) {
        renderOverviewClubGallery();
    } else {
        renderOverviewClubDetail();
    }
}

function renderOverviewClubGallery() {
    const galleryView = document.getElementById("overview-club-gallery-view");
    const detailView = document.getElementById("overview-club-detail-view");
    if (galleryView) galleryView.classList.remove("hidden");
    if (detailView) detailView.classList.add("hidden");

    const cardsGrid = document.getElementById("overview-club-cards-grid");
    if (!cardsGrid) return;
    cardsGrid.innerHTML = "";

    const filteredClubs = state.clubsFinances.filter(cf => {
        if (globalQuery !== "") {
            return cf.club.toLowerCase().includes(globalQuery.toLowerCase());
        }
        return true;
    });

    if (filteredClubs.length === 0) {
        cardsGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; text-align:center; padding:2rem; color:var(--text-muted);">No clubs match search criteria.</div>`;
        return;
    }

    filteredClubs.forEach(cf => {
        const clubEventBudgets = (state.eventBudgets || []).filter(eb => eb.club === cf.club);
        const totalEventsAllotted = clubEventBudgets.reduce((sum, e) => sum + (Number(e.allotted) || 0), 0);
        const totalEventsSpent = clubEventBudgets.reduce((sum, e) => sum + getApprovedExpenseTotal(e), 0);
        cf.allotted = Math.max(Number(cf.allotted) || 0, totalEventsAllotted, totalEventsSpent);
        cf.spent = Math.max(Number(cf.spent) || 0, totalEventsSpent);

        const activeMembers = (state.clubMembers || []).filter(m => m.club === cf.club && m.status === "Active").length;
        const pendingMembers = (state.clubMembers || []).filter(m => m.club === cf.club && m.status === "Pending").length;
        const domainsCount = (state.domains || []).filter(d => d.club === cf.club).length;
        const pendingApps = (state.volunteerApplications || []).filter(a => a.club === cf.club && a.status === "Pending").length;
        const totalPending = pendingMembers + pendingApps;

        const spentPercent = cf.allotted > 0 ? Math.round((cf.spent / cf.allotted) * 100) : 0;
        let budgetBarClass = "bg-success-fill";
        if (spentPercent > 85) budgetBarClass = "bg-danger-fill";
        else if (spentPercent > 60) budgetBarClass = "bg-warning-fill";

        const card = document.createElement("div");
        card.className = "venue-card overview-club-card";
        card.setAttribute("data-club", cf.club);
        card.innerHTML = `
            <div class="venue-header-img">
                <div class="venue-title-row">
                    <h3>${escapeHtml(cf.club)}</h3>
                    ${cf.status === "Pending" ? `<span class="badge badge-warning"><i class="fa-solid fa-hourglass-half"></i> Awaiting Approval</span>` : (totalPending > 0 ? `<span class="badge badge-warning">${totalPending} pending</span>` : `<i class="fa-solid fa-chevron-right"></i>`)}
                </div>
                <div class="venue-meta">
                    <span><i class="fa-solid fa-layer-group"></i> ${escapeHtml(cf.category)}</span>
                    <span><i class="fa-solid fa-user-group"></i> ${domainsCount} domains</span>
                </div>
            </div>
            <div class="venue-body">
                <div class="venue-info-section">
                    <h5 class="setup-section-title">Membership</h5>
                    <div class="event-card-finance">
                        <span class="text-muted">Active Members: ${activeMembers}</span>
                        <span>Pending Requests: ${pendingMembers}</span>
                    </div>
                </div>
                <div class="venue-info-section">
                    <h5 class="setup-section-title">Budget Utilization</h5>
                    <div class="event-card-finance">
                        <span class="text-muted">Allotted: ${formatCurrency(cf.allotted)}</span>
                        <span>Spent: ${formatCurrency(cf.spent)}</span>
                    </div>
                    <div class="progress-bar-bg" style="height: 8px;">
                        <div class="progress-bar-fill ${budgetBarClass}" style="width: ${Math.min(spentPercent, 100)}%"></div>
                    </div>
                    <div style="font-size: 0.75rem; text-align:right; font-weight:600; margin-top:0.35rem; color:var(--text-muted);">
                        ${spentPercent}% utilized
                    </div>
                </div>
            </div>
            <div class="venue-actions">
                ${(cf.status === "Pending" && __session.role === "facultycoordinator") ? `
                <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
                    <button type="button" class="btn btn-success btn-sm" style="flex:1;" data-review-club="${cf.id}" data-approve="1" title="Approve this club proposal"><i class="fa-solid fa-check"></i> Approve</button>
                    <button type="button" class="btn btn-danger btn-sm" style="flex:1;" data-review-club="${cf.id}" data-approve="0" title="Reject this club proposal"><i class="fa-solid fa-xmark"></i> Reject</button>
                </div>
                ` : ""}
                <button class="btn btn-secondary btn-sm btn-full-width view-club-overview-btn" data-club="${escapeHtml(cf.club)}">
                    <i class="fa-solid fa-arrow-right"></i> View Club Overview
                </button>
                ${(__session.role === "president" || __session.role === "facultycoordinator") ? `
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button type="button" class="btn btn-secondary btn-sm edit-club-btn" style="flex:1;" title="Edit club description / Club Head password"
                        data-id="${cf.id}" data-club="${escapeHtml(cf.club)}">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm delete-club-btn" style="flex:1; color:var(--danger); border-color:var(--danger);" title="Delete this club"
                        data-id="${cf.id}" data-club="${escapeHtml(cf.club)}">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </div>
                ` : ""}
            </div>
        `;
        cardsGrid.appendChild(card);
    });
}

// ── CLUB ACTIVITIES sub-tab: events conducted, budget utilization graph, past events ──
function renderOverviewActivities(clubName) {
    const clubEvents = (state.eventBudgets || []).filter(eb => eb.club === clubName);

    // Stat cards
    const totalEvents = clubEvents.length;
    const totalAllotted = clubEvents.reduce((acc, eb) => acc + (Number(eb.allotted) || 0), 0);
    const totalExpenses = clubEvents.reduce((acc, eb) => acc + getApprovedExpenseTotal(eb), 0);
    const openEvents = clubEvents.filter(eb => eb.status !== "Closed").length;
    const closedEvents = clubEvents.filter(eb => eb.status === "Closed").length;
    const pendingProposals = (state.proposals || []).filter(p => (p.organizer === clubName || p.club === clubName) && ((p.status || "").startsWith("Pending") || p.status === "Needs Revision")).length;
    const utilizedPercent = totalAllotted > 0 ? Math.round((totalExpenses / totalAllotted) * 100) : 0;
    const totalParticipants = clubEvents.reduce((acc, eb) => {
        const matchedProposal = (state.proposals || []).find(p => (p.organizer === clubName || p.club === clubName) && (p.title === eb.eventName || p.id === eb.proposalId));
        return acc + (matchedProposal ? (matchedProposal.estimatedParticipants || 0) : 0);
    }, 0);

    const statsGrid = document.getElementById("overview-activities-stats");
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon bg-indigo-glow"><i class="fa-solid fa-calendar-check text-indigo"></i></div>
                <div class="stat-content">
                    <span class="stat-label">Events Conducted</span>
                    <h2 class="stat-value">${totalEvents}</h2>
                    <span class="stat-trend trend-neutral"><i class="fa-solid fa-circle-info"></i> ${openEvents} Open &middot; ${closedEvents} Closed</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon bg-emerald-glow"><i class="fa-solid fa-wallet text-emerald"></i></div>
                <div class="stat-content">
                    <span class="stat-label">Total Event Budgets Allotted</span>
                    <h2 class="stat-value">${formatCurrency(totalAllotted)}</h2>
                    <span class="stat-trend trend-neutral"><i class="fa-solid fa-circle-info"></i> Across all events</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon bg-amber-glow"><i class="fa-solid fa-file-invoice-dollar text-amber"></i></div>
                <div class="stat-content">
                    <span class="stat-label">Total Expenses (Verified Bills)</span>
                    <h2 class="stat-value">${formatCurrency(totalExpenses)}</h2>
                    <span class="stat-trend trend-info"><i class="fa-solid fa-clock"></i> ${utilizedPercent}% utilized</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon bg-blue-glow"><i class="fa-solid fa-file-signature text-blue"></i></div>
                <div class="stat-content">
                    <span class="stat-label">Pending Proposals</span>
                    <h2 class="stat-value">${pendingProposals}</h2>
                    <span class="stat-trend trend-neutral"><i class="fa-solid fa-clock"></i> Awaiting review</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon bg-purple-glow"><i class="fa-solid fa-user-group text-purple"></i></div>
                <div class="stat-content">
                    <span class="stat-label">Members Participated</span>
                    <h2 class="stat-value">${totalParticipants}</h2>
                    <span class="stat-trend trend-neutral"><i class="fa-solid fa-circle-info"></i> Across all events</span>
                </div>
            </div>
        `;
    }

    // Bar chart — one bar per event, height = % of that event's budget utilized
    const chartContainer = document.getElementById("overview-activities-chart");
    if (chartContainer) {
        chartContainer.innerHTML = "";
        if (clubEvents.length === 0) {
            chartContainer.innerHTML = `<div class="text-muted" style="width:100%; text-align:center; padding: 2rem 0;">No approved events yet for this club.</div>`;
        } else {
            clubEvents.forEach(eb => {
                const spent = getApprovedExpenseTotal(eb);
                const pct = eb.allotted > 0 ? Math.round((spent / eb.allotted) * 100) : 0;

                const barWrapper = document.createElement("div");
                barWrapper.className = "chart-bar-wrapper";

                const barFill = document.createElement("div");
                barFill.className = "chart-bar-fill";
                barFill.style.height = `${Math.max(pct, 5)}%`;

                const tooltip = document.createElement("span");
                tooltip.className = "chart-bar-tooltip";
                tooltip.textContent = `${eb.eventName}: ${formatCurrency(spent)} / ${formatCurrency(eb.allotted)} (${pct}%)`;
                barFill.appendChild(tooltip);

                const barLabel = document.createElement("span");
                barLabel.className = "chart-bar-label";
                barLabel.textContent = eb.eventName.split(" ")[0];
                barLabel.title = eb.eventName;

                barWrapper.appendChild(barFill);
                barWrapper.appendChild(barLabel);
                chartContainer.appendChild(barWrapper);
            });
        }
    }

    // Past & Ongoing Events — name, date, description, budget & expenses
    const eventsList = document.getElementById("overview-activities-events-list");
    if (eventsList) {
        if (clubEvents.length === 0) {
            eventsList.innerHTML = `<div class="empty-state" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No events conducted yet for this club.</div>`;
        } else {
            eventsList.innerHTML = clubEvents.map(eb => {
                const spent = getApprovedExpenseTotal(eb);
                const remaining = (eb.allotted || 0) - spent;
                const pct = eb.allotted > 0 ? Math.round((spent / eb.allotted) * 100) : 0;
                let barClass = "bg-primary-fill";
                if (pct > 90) barClass = "bg-danger-fill";
                else if (pct > 65) barClass = "bg-warning-fill";

                const matchedProposal = (state.proposals || []).find(p => (p.organizer === clubName || p.club === clubName) && (p.title === eb.eventName || p.id === eb.proposalId));
                const description = (eb.publish && eb.publish.description) ? eb.publish.description : (matchedProposal ? matchedProposal.desc : "No description available for this event.");
                const rawDate = (eb.publish && eb.publish.date) ? eb.publish.date : (matchedProposal ? matchedProposal.date : (eb.date || ""));
                const eventDate = rawDate ? formatDate(rawDate) : "—";

                return `
                    <div class="event-budget-card" style="cursor: default;">
                        <div class="event-card-header">
                            <h4>${escapeHtml(eb.eventName)}</h4>
                            <span class="badge ${eb.status === 'Closed' ? 'badge-secondary' : 'badge-success'}">${eb.status === 'Closed' ? 'Closed' : 'Open'}</span>
                        </div>
                        <div class="event-card-club"><i class="fa-solid fa-calendar-day" style="margin-right:0.3rem;"></i>${eventDate}</div>
                        <p class="text-muted" style="font-size:0.8rem; line-height:1.4; margin: 0.25rem 0 0.75rem 0;">${escapeHtml(description)}</p>
                        <div class="event-card-finance">
                            <span class="text-muted">Allotted: ${formatCurrency(eb.allotted)}</span>
                            <span>Expenses: ${formatCurrency(spent)}</span>
                        </div>
                        <div class="progress-bar-bg" style="height: 6px;">
                            <div class="progress-bar-fill ${barClass}" style="width: ${Math.min(pct, 100)}%"></div>
                        </div>
                        <div style="font-size: 0.72rem; text-align:right; font-weight:550; margin-top:0.25rem; color:${remaining < 0 ? 'var(--danger)' : 'var(--text-muted)'};">
                            ${remaining < 0 ? `Exceeded by ${formatCurrency(Math.abs(remaining))}` : `${formatCurrency(remaining)} remaining`}
                        </div>
                    </div>
                `;
            }).join("");
        }
    }
}

// ── CERTIFICATION VERIFICATION sub-tab: president verifies participation before certs are issued ──
function renderOverviewCertification(clubName) {
    const tbody = document.getElementById("overview-certification-tbody");
    if (!tbody) return;

    const clubEvents = state.eventBudgets.filter(eb => eb.club === clubName);

    if (clubEvents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center" style="padding:1.5rem;">No events conducted yet for this club.</td></tr>`;
        return;
    }

    tbody.innerHTML = clubEvents.map(eb => {
        const cert = eb.certVerification || { status: "Pending", verifiedOn: null };
        const matchedProposal = (state.proposals || []).find(p => (p.organizer === clubName || p.club === clubName) && (p.title === eb.eventName || p.id === eb.proposalId));
        const rawDate = (eb.publish && eb.publish.date) ? eb.publish.date : (matchedProposal ? matchedProposal.date : (eb.date || ""));
        const eventDate = rawDate ? formatDate(rawDate) : "—";
        const participants = matchedProposal ? (matchedProposal.estimatedParticipants || 0) : 0;

        // Two-stage verification: the Club President gives first approval,
        // then the Faculty Coordinator gives final sign-off. Each role sees
        // its own labels/actions for the same underlying cert.status values.
        let statusBadge;
        let actionHtml;
        if (__session.role === "president") {
            if (cert.status === "Verified") {
                statusBadge = `<span class="badge badge-success">Verified${cert.verifiedOn ? ' on ' + formatDate(cert.verifiedOn) : ''}</span>`;
                actionHtml = `<span class="text-muted" style="font-size: 0.8rem;">Finalized by Faculty Coordinator</span>`;
            } else if (cert.status === "Pending Faculty Approval") {
                statusBadge = `<span class="badge badge-info">Awaiting Faculty Coordinator</span>`;
                actionHtml = `<button class="btn btn-secondary btn-sm overview-reopen-cert-btn" data-id="${eb.id}" title="Undo my approval"><i class="fa-solid fa-rotate-left"></i> Undo Approval</button>`;
            } else {
                statusBadge = `<span class="badge badge-warning">Pending Verification</span>`;
                actionHtml = `<button class="btn btn-primary btn-sm overview-verify-cert-btn" data-id="${eb.id}"><i class="fa-solid fa-check"></i> Approve</button>`;
            }
        } else {
            if (cert.status === "Verified") {
                statusBadge = `<span class="badge badge-success">Verified${cert.verifiedOn ? ' on ' + formatDate(cert.verifiedOn) : ''}</span>`;
                actionHtml = `<button class="btn btn-secondary btn-sm overview-reopen-cert-btn" data-id="${eb.id}" title="Undo final approval"><i class="fa-solid fa-rotate-left"></i> Re-open</button>`;
            } else if (cert.status === "Pending Faculty Approval") {
                statusBadge = `<span class="badge badge-info">President Approved — Awaiting You</span>`;
                actionHtml = `<button class="btn btn-primary btn-sm overview-verify-cert-btn" data-id="${eb.id}"><i class="fa-solid fa-check-double"></i> Final Approve</button>`;
            } else {
                statusBadge = `<span class="badge badge-warning">Awaiting President Approval</span>`;
                actionHtml = `<span class="text-muted" style="font-size: 0.8rem;">Not yet reviewed by the Club President</span>`;
            }
        }

        return `
            <tr>
                <td><strong>${escapeHtml(eb.eventName)}</strong></td>
                <td>${eventDate}</td>
                <td>${participants}</td>
                <td>${statusBadge}</td>
                <td class="text-right table-actions">${actionHtml}</td>
            </tr>
        `;
    }).join("");
}

function renderOverviewClubDetail() {
    const galleryView = document.getElementById("overview-club-gallery-view");
    const detailView = document.getElementById("overview-club-detail-view");
    if (galleryView) galleryView.classList.add("hidden");
    if (detailView) detailView.classList.remove("hidden");

    const clubName = activeOverviewClubName;
    const cf = state.clubsFinances.find(c => c.club === clubName);
    if (!cf) {
        activeOverviewClubName = null;
        renderClubOverview();
        return;
    }

    document.getElementById("overview-club-name").textContent = cf.club;
    document.getElementById("overview-club-category").textContent = cf.category;

    // ── Sub-tab toggle (Club Activities <-> Club Members <-> Certification Verification <-> Finances & Budgets) ──
    const activitiesPane = document.getElementById("overview-activities-pane");
    const membersPane = document.getElementById("overview-members-pane");
    const certificationPane = document.getElementById("overview-certification-pane");
    const financesPane = document.getElementById("overview-finances-pane");
    const btnActivitiesTab = document.getElementById("btn-overview-tab-activities");
    const btnMembersTab = document.getElementById("btn-overview-tab-members");
    const btnCertificationTab = document.getElementById("btn-overview-tab-certification");
    const btnFinancesTab = document.getElementById("btn-overview-tab-finances");
    if (activitiesPane && membersPane && certificationPane && financesPane && btnActivitiesTab && btnMembersTab && btnCertificationTab && btnFinancesTab) {
        const showActivities = activeOverviewSubTab === "activities";
        const showMembers = activeOverviewSubTab === "members";
        const showCertification = activeOverviewSubTab === "certification";
        const showFinances = activeOverviewSubTab === "finances";
        activitiesPane.classList.toggle("hidden", !showActivities);
        membersPane.classList.toggle("hidden", !showMembers);
        certificationPane.classList.toggle("hidden", !showCertification);
        financesPane.classList.toggle("hidden", !showFinances);
        btnActivitiesTab.classList.toggle("active", showActivities);
        btnMembersTab.classList.toggle("active", showMembers);
        btnCertificationTab.classList.toggle("active", showCertification);
        btnFinancesTab.classList.toggle("active", showFinances);
    }

    renderOverviewActivities(clubName);
    renderOverviewCertification(clubName);
    renderFinancesBudgets();

    // ── Club Members ──
    const clubMembers = (state.clubMembers || []).filter(m => m.club === clubName);
    const pending = clubMembers.filter(m => m.status === "Pending");
    const active = clubMembers.filter(m => m.status === "Active");

    const pendingCountEl = document.getElementById("overview-members-pending-count");
    pendingCountEl.textContent = `${pending.length} Pending`;
    pendingCountEl.className = pending.length > 0 ? "badge badge-warning" : "badge badge-success";

    const pendingTbody = document.getElementById("overview-members-pending-tbody");
    if (pending.length === 0) {
        pendingTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;">No pending join requests right now.</td></tr>`;
    } else {
        pendingTbody.innerHTML = pending.map(m => `
            <tr>
                <td><strong>${escapeHtml(m.name)}</strong></td>
                <td><code>${escapeHtml(m.studentId)}</code></td>
                <td>${escapeHtml(m.email)}</td>
                <td>${escapeHtml(m.department)}</td>
                <td>${escapeHtml(m.year)}</td>
                <td>${formatDate(m.appliedOn)}</td>
            </tr>
        `).join("");
    }

    document.getElementById("overview-members-active-count").textContent = `${active.length} member${active.length === 1 ? '' : 's'}`;
    const activeTbody = document.getElementById("overview-members-active-tbody");
    if (active.length === 0) {
        activeTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;">No active members yet.</td></tr>`;
    } else {
        activeTbody.innerHTML = active.map(m => {
            const selectedDomainNames = (state.volunteerApplications || [])
                .filter(a => a.club === clubName && a.status === "Selected" && a.studentId === m.studentId)
                .map(a => {
                    const d = (state.domains || []).find(dm => dm.id === a.domainId);
                    return d ? d.title : null;
                })
                .filter(Boolean);
            const bubbles = selectedDomainNames
                .map(name => `<br><span class="badge badge-indigo" style="font-size:0.7rem; margin-top:0.2rem;">${escapeHtml(name)}</span>`)
                .join("");
            return `
                <tr>
                    <td><strong>${escapeHtml(m.name)}</strong>${bubbles}</td>
                    <td><code>${escapeHtml(m.studentId)}</code></td>
                    <td>${escapeHtml(m.email)}</td>
                    <td>${escapeHtml(m.department)}</td>
                    <td>${escapeHtml(m.year)}</td>
                    <td>${formatDate(m.joinedOn)}</td>
                </tr>
            `;
        }).join("");
    }

    // ── Recruitment Domains ──
    const domains = (state.domains || []).filter(d => d.club === clubName);
    const domainsGrid = document.getElementById("overview-domains-grid");
    domainsGrid.innerHTML = domains.map(d => {
        const isOpen = d.recruitmentOpen;
        const appCount = (state.volunteerApplications || []).filter(a => a.club === clubName && a.domainId === d.id).length;
        return `
            <div class="domain-card">
                <div class="domain-card-header">
                    <div>
                        <h4>${escapeHtml(d.name)}</h4>
                        <div class="domain-card-subtitle">${escapeHtml(d.title)}</div>
                    </div>
                    <span class="badge ${isOpen ? 'badge-success' : 'badge-outline-warning'}">${isOpen ? 'Recruiting' : 'Closed'}</span>
                </div>
                <ul class="domain-role-list">
                    ${d.roles.map(r => `<li><i class="fa-solid fa-circle-check"></i><span>${escapeHtml(r)}</span></li>`).join("")}
                </ul>
                <div class="domain-card-footer">
                    <span class="text-muted" style="font-size:0.75rem;">${appCount} application${appCount === 1 ? '' : 's'} received</span>
                </div>
            </div>
        `;
    }).join("");

    // ── Volunteer Applications (read-only — the Club Head makes the select/reject decision) ──
    const apps = (state.volunteerApplications || []).filter(a => a.club === clubName);
    const appsTbody = document.getElementById("overview-volunteer-apps-tbody");
    if (apps.length === 0) {
        appsTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;">No volunteer applications yet.</td></tr>`;
    } else {
        appsTbody.innerHTML = apps.map(a => {
            const domain = (state.domains || []).find(d => d.id === a.domainId);
            let statusClass = "badge-warning";
            if (a.status === "Selected") statusClass = "badge-success";
            if (a.status === "Rejected") statusClass = "badge-danger";
            return `
                <tr>
                    <td><strong>${escapeHtml(a.applicantName)}</strong></td>
                    <td><code>${escapeHtml(a.studentId)}</code></td>
                    <td><span class="badge badge-indigo">${escapeHtml(domain ? domain.name : "-")}</span></td>
                    <td>${formatDate(a.appliedOn)}</td>
                    <td style="max-width:220px; font-size:0.8rem; color:var(--text-muted);">${escapeHtml(a.note || "-")}</td>
                    <td><span class="badge ${statusClass}">${a.status}</span></td>
                </tr>
            `;
        }).join("");
    }

    // ── Volunteer Details by Domain ──
    const domainVolunteersGrid = document.getElementById("overview-domain-volunteers-grid");
    domainVolunteersGrid.innerHTML = domains.map(d => {
        const volunteers = (state.volunteerApplications || []).filter(a => a.club === clubName && a.domainId === d.id && a.status === "Selected");
        return `
            <div class="domain-card">
                <div class="domain-card-header">
                    <div>
                        <h4>${escapeHtml(d.name)}</h4>
                        <div class="domain-card-subtitle">${escapeHtml(d.title)}</div>
                    </div>
                    <span class="badge badge-indigo">${volunteers.length} volunteer${volunteers.length === 1 ? '' : 's'}</span>
                </div>
                ${volunteers.length === 0 ? `
                    <p class="text-muted" style="font-size:0.8rem; font-style:italic; margin:0;">No volunteers selected for this domain yet.</p>
                ` : `
                    <ul class="domain-volunteer-list">
                        ${volunteers.map(v => `
                            <li class="domain-volunteer-item">
                                <span><strong>${escapeHtml(v.applicantName)}</strong> <span class="text-muted">(${escapeHtml(v.studentId)})</span></span>
                                <i class="fa-solid fa-circle-check text-emerald"></i>
                            </li>
                        `).join("")}
                    </ul>
                `}
            </div>
        `;
    }).join("");
}

// Finances & Budgets now lives as a sub-tab nested inside a specific club's
// Club Overview (see renderOverviewClubDetail) rather than its own top-level
// gallery — it always renders for the club currently being viewed there.
function renderFinancesBudgets() {
    if (activeOverviewClubName === null) return;
    renderClubDetail();
    renderFinanceLedger();
}

// Ledger entries for the active club only — real incurred expenses (bills
// approved against an event) plus whole-club fund additions/disbursements/
// revisions. The lump "budget reserved" amount for a newly approved event is
// intentionally NOT logged here; only money actually spent shows up.
function renderFinanceLedger() {
    const ledgerTbody = document.getElementById("finance-ledger-tbody");
    if (!ledgerTbody) return;
    ledgerTbody.innerHTML = "";

    const ledgerList = state.financeTransactions.filter(txn => {
        if (txn.club !== activeOverviewClubName) return false;
        if (globalQuery !== "") {
            const query = globalQuery.toLowerCase();
            return txn.desc.toLowerCase().includes(query) || txn.type.toLowerCase().includes(query);
        }
        return true;
    });

    if (ledgerList.length === 0) {
        ledgerTbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center">No transactions ledger entries found.</td></tr>`;
    } else {
        [...ledgerList].reverse().forEach(txn => {
            const tr = document.createElement("tr");
            const isNegative = txn.amount < 0;
            const amtText = formatCurrency(Math.abs(txn.amount));
            const colorClass = isNegative ? 'text-danger' : 'text-emerald';
            const sign = isNegative ? '-' : '+';

            let badgeClass = 'badge-indigo';
            if (txn.type === 'Allocation') badgeClass = 'badge-success';
            if (txn.type === 'Adjustment') badgeClass = 'badge-warning';

            tr.innerHTML = `
                <td><code>${txn.id}</code></td>
                <td>${formatDateTime(txn.date)}</td>
                <td><span class="badge ${badgeClass}">${txn.type}</span></td>
                <td><strong class="${colorClass}">${sign} ${amtText}</strong></td>
                <td>${escapeHtml(txn.desc)}</td>
            `;
            ledgerTbody.appendChild(tr);
        });
    }
}

// ── CLUB DETAIL VIEW (Event Budgets + Expense Review), scoped to activeOverviewClubName ──
function renderClubDetail() {
    const cf = state.clubsFinances.find(c => c.club === activeOverviewClubName);
    if (!cf) return;

    // Event Budget cards scoped to this club
    const gridContainer = document.getElementById("club-event-budgets-grid");
    gridContainer.innerHTML = "";

    const clubEventBudgets = (state.eventBudgets || []).filter(eb => eb.club === activeOverviewClubName);
    const totalEventsAllotted = clubEventBudgets.reduce((sum, e) => sum + (Number(e.allotted) || 0), 0);
    const totalEventsSpent = clubEventBudgets.reduce((sum, e) => sum + getApprovedExpenseTotal(e), 0);
    cf.allotted = Math.max(Number(cf.allotted) || 0, totalEventsAllotted, totalEventsSpent);
    cf.spent = Math.max(Number(cf.spent) || 0, totalEventsSpent);

    const remaining = cf.allotted - cf.spent;
    const statsBanner = document.getElementById("club-finance-stats-banner");
    if (statsBanner) {
        statsBanner.innerHTML = `
            <div class="prop-summary-item">
                <i class="fa-solid fa-money-bill-wave text-indigo"></i>
                <div>
                    <span class="prop-summary-lbl">Total Budget Allotted</span>
                    <span class="prop-summary-val">${formatCurrency(cf.allotted)}</span>
                </div>
            </div>
            <div class="prop-summary-item">
                <i class="fa-solid fa-wallet text-amber"></i>
                <div>
                    <span class="prop-summary-lbl">Total Spent</span>
                    <span class="prop-summary-val">${formatCurrency(cf.spent)}</span>
                </div>
            </div>
            <div class="prop-summary-item">
                <i class="fa-solid fa-piggy-bank text-emerald"></i>
                <div>
                    <span class="prop-summary-lbl">Budget Left</span>
                    <span class="prop-summary-val" style="color:${remaining < 0 ? 'var(--danger)' : 'var(--primary)'};">${formatCurrency(remaining)}</span>
                </div>
            </div>
        `;
    }

    if (clubEventBudgets.length === 0) {
        gridContainer.innerHTML = `<div class="empty-state" style="grid-column:1/-1; text-align:center; padding:1.5rem; color:var(--text-muted);">No event budgets allocated yet for this club.</div>`;
    } else {
        clubEventBudgets.forEach(eb => {
            const totalExpense = getApprovedExpenseTotal(eb);
            const pendingReviewStatus = __session.role === "president" ? "Pending President Review" : "Pending Faculty Review";
            const pendingCount = eb.expenses.filter(e => e.status === pendingReviewStatus).length;
            const awaitingCount = eb.expenses.filter(e => e.status === "Awaiting Bill").length;
            const evtRemaining = eb.allotted - totalExpense;
            const spentPercent = eb.allotted > 0 ? Math.round((totalExpense / eb.allotted) * 100) : 0;

            let barClass = "bg-primary-fill";
            if (spentPercent > 90) barClass = "bg-danger-fill";
            else if (spentPercent > 65) barClass = "bg-warning-fill";

            let headerBadge = `<i class="fa-solid fa-chevron-right text-muted"></i>`;
            if (eb.status === "Closed") {
                headerBadge = `<span class="badge badge-secondary">Closed</span>`;
            } else if (pendingCount > 0) {
                headerBadge = `<span class="badge badge-warning">${pendingCount} to review</span>`;
            } else if (awaitingCount > 0) {
                headerBadge = `<span class="badge badge-info">${awaitingCount} awaiting bill</span>`;
            }

            const card = document.createElement("div");
            card.className = `event-budget-card ${eb.id === activeEventBudgetId ? 'active' : ''}`;
            card.setAttribute("data-id", eb.id);

            card.innerHTML = `
                <div class="event-card-header">
                    <h4>${escapeHtml(eb.eventName)}</h4>
                    ${headerBadge}
                </div>
                <div class="event-card-club">${eb.expenses.length} logged item${eb.expenses.length === 1 ? '' : 's'}</div>
                <div class="event-card-finance">
                    <span class="text-muted">Budget: ${formatCurrency(eb.allotted)}</span>
                    <span>Approved Spend: ${formatCurrency(totalExpense)}</span>
                </div>
                <div class="progress-bar-bg" style="height: 6px;">
                    <div class="progress-bar-fill ${barClass}" style="width: ${Math.min(spentPercent, 100)}%"></div>
                </div>
                <div style="font-size: 0.72rem; text-align:right; font-weight:550; margin-top:0.25rem; color:${evtRemaining < 0 ? 'var(--danger)' : 'var(--text-muted)'};">
                    ${evtRemaining < 0 ? `Exceeded by ${formatCurrency(Math.abs(evtRemaining))}` : `${formatCurrency(evtRemaining)} remaining`}
                </div>
            `;
            gridContainer.appendChild(card);
        });
    }

    renderEventSplitDetails();
}

// ── EVENT SPLIT-UP + EXPENSE REVIEW TABLE ─────────────────────
function renderEventSplitDetails() {
    const placeholder = document.getElementById("event-split-placeholder");
    const detailsPane = document.getElementById("event-split-details-pane");

    const activeEb = state.eventBudgets.find(eb => eb.id === activeEventBudgetId && eb.club === activeOverviewClubName);

    if (!activeEb) {
        if (placeholder) placeholder.classList.remove("hidden");
        if (detailsPane) detailsPane.classList.add("hidden");
        return;
    }

    if (placeholder) placeholder.classList.add("hidden");
    if (detailsPane) detailsPane.classList.remove("hidden");

    document.getElementById("split-event-title").textContent = activeEb.eventName;
    document.getElementById("split-event-badge").textContent = activeEb.club;

    const statusBadgeEl = document.getElementById("split-event-status-badge");
    if (activeEb.status === "Closed") {
        statusBadgeEl.textContent = `Closed${activeEb.closedOn ? ' on ' + formatDate(activeEb.closedOn) : ''}`;
        statusBadgeEl.className = "badge badge-secondary";
    } else {
        statusBadgeEl.textContent = "Open";
        statusBadgeEl.className = "badge badge-success";
    }

    // Totals calculations — only verified (Approved) BILLS count towards actual spend
    const allotted = activeEb.allotted;
    const spent = getApprovedExpenseTotal(activeEb);
    const remaining = allotted - spent;

    document.getElementById("split-allotted-val").textContent = formatCurrency(allotted);
    document.getElementById("split-spent-val").textContent = formatCurrency(spent);
    document.getElementById("split-remaining-val").textContent = formatCurrency(remaining);

    // SVG Donut Calculations (based on approved expenses only)
    const segmentsGroup = document.getElementById("donut-segments-group");
    segmentsGroup.innerHTML = "";

    document.getElementById("donut-total-amt").textContent = formatCurrency(allotted);

    const categoriesMap = {
        "Catering & Hospitality": { sum: 0, color: "#4f46e5" },
        "Logistics & Venue Setup": { sum: 0, color: "#10b981" },
        "Marketing & Printing": { sum: 0, color: "#f59e0b" },
        "Speakers / Honorarium": { sum: 0, color: "#06b6d4" },
        "Miscellaneous": { sum: 0, color: "#8b5cf6" }
    };

    activeEb.expenses.filter(e => e.status === "Approved").forEach(exp => {
        if (categoriesMap[exp.category]) {
            categoriesMap[exp.category].sum += exp.billAmount;
        } else {
            categoriesMap["Miscellaneous"].sum += exp.billAmount;
        }
    });

    const unallocatedAmt = Math.max(remaining, 0);

    let chartData = [];
    Object.keys(categoriesMap).forEach(cat => {
        if (categoriesMap[cat].sum > 0) {
            chartData.push({ name: cat, amount: categoriesMap[cat].sum, color: categoriesMap[cat].color });
        }
    });

    if (unallocatedAmt > 0) {
        chartData.push({ name: "Unspent Balance", amount: unallocatedAmt, color: "#f1f5f9" });
    }

    let cumulativePercent = 0;
    chartData.forEach(segment => {
        const percent = allotted > 0 ? (segment.amount / allotted) * 100 : 0;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("class", "donut-segment");
        circle.setAttribute("cx", "21");
        circle.setAttribute("cy", "21");
        circle.setAttribute("r", "15.915");
        circle.setAttribute("fill", "transparent");
        circle.setAttribute("stroke", segment.color);
        circle.setAttribute("stroke-width", "3.2");
        circle.setAttribute("stroke-dasharray", `${percent} ${100 - percent}`);
        circle.setAttribute("stroke-dashoffset", `-${cumulativePercent}`);
        segmentsGroup.appendChild(circle);
        cumulativePercent += percent;
    });

    const legendList = document.getElementById("split-legend-list");
    legendList.innerHTML = "";
    chartData.forEach(segment => {
        const percent = allotted > 0 ? Math.round((segment.amount / allotted) * 100) : 0;
        const li = document.createElement("div");
        li.className = "legend-item";
        li.innerHTML = `
            <div class="legend-color-label">
                <span class="legend-dot" style="background-color: ${segment.color}"></span>
                <span>${segment.name}</span>
            </div>
            <div class="legend-pct">
                <span>${formatCurrency(segment.amount)} (${percent}%)</span>
            </div>
        `;
        legendList.appendChild(li);
    });

    // Logged Expenses & Bills — lists every approved budget line item, its bill (once uploaded), and review action
    const expensesTbody = document.getElementById("split-expenses-tbody");
    expensesTbody.innerHTML = "";

    if (activeEb.expenses.length === 0) {
        expensesTbody.innerHTML = `<tr><td colspan="8" class="text-muted text-center">No approved budget line items for this event yet.</td></tr>`;
    } else {
        activeEb.expenses.forEach((exp) => {
            const tr = document.createElement("tr");

            let statusBadgeClass = "badge-secondary";
            if (exp.status === "Pending President Review") statusBadgeClass = "badge-warning";
            if (exp.status === "Pending Faculty Review") statusBadgeClass = "badge-indigo";
            if (exp.status === "Approved") statusBadgeClass = "badge-success";
            if (exp.status === "Rejected") statusBadgeClass = "badge-danger";

            const overBudget = exp.billAmount != null && exp.billAmount > exp.approvedAmount;
            const billAmountCell = exp.billAmount != null
                ? `<strong>${formatCurrency(exp.billAmount)}</strong>${overBudget ? ` <i class="fa-solid fa-triangle-exclamation text-danger" title="Exceeds approved amount"></i>` : ''}`
                : `<span class="text-muted">—</span>`;

            const billCell = detailsOrBillCellFor(exp);

            // President: first-level review — only acts on items the Club Head has sent
            // for processing; Faculty Coordinator gives the final sign-off afterwards.
            // Faculty Coordinator: final-level review — only acts on items the President
            // has already approved and forwarded on; can also re-open an Approved item.
            let actionHtml = "";
            if (activeEb.status === "Closed") {
                actionHtml = `<span class="text-muted" style="font-size:0.75rem;">Closed</span>`;
            } else if (exp.status === "Awaiting Bill" || exp.status === "Draft") {
                actionHtml = `<span class="text-muted" style="font-size:0.75rem;">Awaiting Club Head's submission</span>`;
            } else if (exp.status === "Pending President Review") {
                actionHtml = __session.role === "president"
                    ? `
                    <button class="action-btn action-btn-success approve-expense-btn" data-id="${exp.id}" title="Approve"><i class="fa-solid fa-check"></i></button>
                    <button class="action-btn action-btn-delete reject-expense-btn" data-id="${exp.id}" title="Reject"><i class="fa-solid fa-xmark"></i></button>
                `
                    : `<span class="text-muted" style="font-size:0.75rem;">Awaiting President review</span>`;
            } else if (exp.status === "Pending Faculty Review") {
                actionHtml = __session.role === "president"
                    ? `<span class="text-muted" style="font-size:0.75rem;">Forwarded to Faculty Coordinator</span>`
                    : `
                    <button class="action-btn action-btn-success approve-expense-btn" data-id="${exp.id}" title="Approve"><i class="fa-solid fa-check"></i></button>
                    <button class="action-btn action-btn-delete reject-expense-btn" data-id="${exp.id}" title="Reject"><i class="fa-solid fa-xmark"></i></button>
                `;
            } else if (exp.status === "Rejected") {
                actionHtml = `<span class="text-muted" style="font-size:0.75rem;">Awaiting Club Head to revise</span>`;
            } else if (exp.status === "Approved") {
                actionHtml = __session.role === "president"
                    ? `<span class="text-muted" style="font-size:0.75rem;">Finalized by Faculty Coordinator</span>`
                    : `<button class="btn btn-secondary btn-sm reset-expense-btn" data-id="${exp.id}" title="Re-open for review"><i class="fa-solid fa-rotate-left"></i> Re-review</button>`;
            } else if (exp.status === "Not Utilized") {
                actionHtml = `<span class="text-muted" style="font-size:0.75rem;">Not spent</span>`;
            }

            tr.innerHTML = `
                <td><strong>${escapeHtml(exp.itemName)}</strong></td>
                <td><span class="badge badge-indigo">${exp.type}</span></td>
                <td>${escapeHtml(exp.category)}</td>
                <td><strong>${formatCurrency(exp.approvedAmount)}</strong></td>
                <td>${billAmountCell}</td>
                <td>${billCell}</td>
                <td><span class="badge ${statusBadgeClass}">${exp.status}</span></td>
                <td class="text-right table-actions">${actionHtml}</td>
            `;
            expensesTbody.appendChild(tr);
        });

        // Totals row + Close Event Finance action
        const totalApprovedAmt = getTotalApprovedAmount(activeEb);
        const totalBillApprovedAmt = getApprovedExpenseTotal(activeEb);
        const hasUnreviewed = activeEb.expenses.some(e => ["Awaiting Bill", "Draft", "Pending President Review", "Pending Faculty Review"].includes(e.status));
        const canClose = activeEb.status !== "Closed" && !hasUnreviewed;

        let closeCell = "";
        if (activeEb.status === "Closed") {
            closeCell = `<span class="badge badge-secondary">Closed</span>`;
        } else if (canClose) {
            closeCell = `<button class="btn btn-primary btn-sm" id="btn-close-event-finance"><i class="fa-solid fa-lock"></i> Close Event Finance</button>`;
        } else {
            closeCell = `<span class="text-muted" style="font-size:0.72rem;">Awaiting full review</span>`;
        }

        const totalsRow = document.createElement("tr");
        totalsRow.style.fontWeight = "700";
        totalsRow.style.backgroundColor = "var(--bg-main)";
        totalsRow.innerHTML = `
            <td colspan="3" class="text-right">Totals</td>
            <td>${formatCurrency(totalApprovedAmt)}</td>
            <td>${formatCurrency(totalBillApprovedAmt)}</td>
            <td colspan="2"></td>
            <td class="text-right">${closeCell}</td>
        `;
        expensesTbody.appendChild(totalsRow);
    }

    const commentBox = document.getElementById("split-bill-comment-box");
    if (commentBox) {
        commentBox.textContent = activeEb.comment && activeEb.comment.trim()
            ? activeEb.comment
            : "No comment left yet.";
    }
}

// -------------------------------------------------------------
// EVENT HANDLERS & BINDINGS
// -------------------------------------------------------------

function bindEvents() {
    // 1. Tab switching
    const navLinks = document.querySelectorAll(".sidebar .nav-link");
    navLinks.forEach(link => {
        link.addEventListener("click", function(e) {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove("active"));
            this.classList.add("active");

            const tab = this.getAttribute("data-tab");

            // Toggle view panels
            document.querySelectorAll(".tab-pane").forEach(pane => {
                pane.classList.remove("active");
            });
            document.getElementById(`tab-${tab}`).classList.add("active");
            // Remember the active tab so a page refresh restores it instead of
            // falling back to the dashboard.
            localStorage.setItem("sscms_active_tab_admin", tab);

            // Update Header Title
            const pageTitle = document.getElementById("page-title");
            const pageSubtitle = document.getElementById("page-subtitle");
            
            if (tab === "dashboard") {
                if (__session.role === "president") {
                    pageTitle.textContent = "President's Dashboard";
                    pageSubtitle.textContent = `Welcome back, ${__session.name || "President"}. Here is what's happening across campus clubs.`;
                } else {
                    pageTitle.textContent = "Faculty Coordinator Dashboard";
                    pageSubtitle.textContent = "Here is what's happening across campus clubs.";
                }
            } else if (tab === "overview") {
                pageTitle.textContent = "Club Overview";
                pageSubtitle.textContent = "View each club's activities, event budgets, member roster and volunteer domains.";
                activeOverviewClubName = null;
                activeOverviewSubTab = "activities";
                activeEventBudgetId = null;
            } else if (tab === "inventory") {
                pageTitle.textContent = "Central Inventory Manager";
                pageSubtitle.textContent = __session.role === "president"
                    ? "Manage all student club logistics assets, physical gear, and track lending allocations."
                    : "Add, edit, and remove student club logistics assets and physical gear.";
                activeInventoryId = null;
            } else if (tab === "venues") {
                if (__session.role === "president") {
                    pageTitle.textContent = "Venue Schedule & Ground Setup";
                    pageSubtitle.textContent = "Track schedules, confirm bookings, and manage basic requirements for campus event venues.";
                } else {
                    pageTitle.textContent = "Venues Manager";
                    pageSubtitle.textContent = "Add, edit, and remove campus event venues and their on-ground setup requirements.";
                }
            } else if (tab === "proposals") {
                pageTitle.textContent = "Event Proposals Audit";
                pageSubtitle.textContent = "Review student club event proposals, approve resource allocations, adjust funding splits, or request revisions.";
                activeProposalId = null;
            } else if (tab === "resources-calendar") {
                pageTitle.textContent = "Resources Schedule Calendar";
                pageSubtitle.textContent = "Track booking timeline schedules for venues and inventory requirements.";
            } else if (tab === "students") {
                pageTitle.textContent = "Student Management & Onboarding";
                pageSubtitle.textContent = "Monitor student participation, club memberships, issued certificates, and import new student rosters.";
                if (window.StudentManagement) {
                    window.StudentManagement.loadAndRender("sm-view-root");
                }
            } else if (tab === "reports") {
                pageTitle.textContent = "Analytics Reports";
                pageSubtitle.textContent = "Generate and download analytical reports across clubs, events, volunteers and finances.";
            }

            renderAll();
        });
    });

    const bulkImportBtn = document.getElementById("btn-upload-bulk-students");
    if (bulkImportBtn) {
        bulkImportBtn.addEventListener("click", function() {
            const fileInput = document.getElementById("bulk-student-file-input");
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                showToast("Please select a CSV file to upload.", "warning");
                return;
            }
            if (window.StudentManagement) {
                window.StudentManagement.processBulkUserImport(fileInput.files[0], "bulk-student-import-report");
            }
        });
    }

    const bulkSetupBtn = document.getElementById("btn-open-bulk-setup-modal");
    if (bulkSetupBtn) {
        bulkSetupBtn.addEventListener("click", function() {
            openBulkSetupModal();
        });
    }

    // 2. Global search bar
    const globalSearch = document.getElementById("global-search");
    globalSearch.addEventListener("input", function() {
        globalQuery = this.value;
        renderAll();
    });

    // View All Venues quick redirect from dashboard
    document.getElementById("view-all-venues-btn").addEventListener("click", () => {
        const link = document.querySelector('[data-tab="venues"]');
        if (link) link.click();
    });

    // Filter selectors reload tables
    document.getElementById("inventory-category-filter").addEventListener("change", renderInventory);
    document.getElementById("inventory-status-filter").addEventListener("change", renderInventory);
    const venueBookingFilterEl = document.getElementById("venue-booking-filter");
    if (venueBookingFilterEl) venueBookingFilterEl.addEventListener("change", renderVenues);

    // -------------------------------------------------------------
    // MODALS OPEN/CLOSE CONTROL — openModal/closeModal now live in
    // shared/js/modal.js (loaded before this file).
    // -------------------------------------------------------------

    document.querySelectorAll(".modal-close-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const overlay = this.closest(".modal-overlay");
            if (overlay) overlay.classList.remove("active");
        });
    });

    // Escape Key closes modals
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".modal-overlay").forEach(overlay => {
                overlay.classList.remove("active");
            });
        }
    });

    // Booking-purpose toggle — "For a Club" (club dropdown + event name) vs.
    // "Other Purpose" (just a free-text purpose, no club dropdown). Shared by
    // both the Allocate Inventory and Book Venue modals. President-only —
    // Faculty Coordinator has no allocate/book modals (CRUD instead).
    function wirePurposeToggle(radioName, clubGroupId, clubSelectId, eventLabelId, eventInputId) {
        document.querySelectorAll(`input[name="${radioName}"]`).forEach(radio => {
            radio.addEventListener("change", () => {
                const isClub = document.querySelector(`input[name="${radioName}"]:checked`).value === "club";
                document.getElementById(clubGroupId).style.display = isClub ? "" : "none";
                document.getElementById(clubSelectId).required = isClub;
                document.getElementById(eventLabelId).textContent = isClub ? "Event Name" : "Purpose";
                document.getElementById(eventInputId).placeholder = isClub ? "e.g. AI Workshop Logistics" : "e.g. Faculty seminar, guest lecture";
            });
        });
    }

    function resetPurposeToggle(radioName, clubGroupId, clubSelectId) {
        const clubRadio = document.querySelector(`input[name="${radioName}"][value="club"]`);
        if (clubRadio) clubRadio.checked = true;
        document.getElementById(clubGroupId).style.display = "";
        document.getElementById(clubSelectId).required = true;
    }

    if (__session.role === "president") {
        wirePurposeToggle("alloc-purpose-type", "alloc-club-group", "alloc-club", "alloc-event-label", "alloc-event");
        wirePurposeToggle("booking-purpose-type", "booking-club-group", "booking-club", "booking-event-label", "booking-event");

        // Quick Book (Inventory Manager) — allocates stock to a club without leaving the tab
        document.getElementById("btn-quick-book-inventory").addEventListener("click", () => {
            document.getElementById("form-allocate-inventory").reset();
            populateClubsSelects();
            resetPurposeToggle("alloc-purpose-type", "alloc-club-group", "alloc-club");
            openModal("modal-allocate-inventory");
        });

        document.getElementById("dashboard-add-booking-btn").addEventListener("click", () => {
            const link = document.querySelector('[data-tab="venues"]');
            if (link) link.click();
            openModal("modal-book-venue");
            populateClubsSelects();
        });
    }

    // -------------------------------------------------------------
    // INVENTORY MANAGER ACTIONS
    // -------------------------------------------------------------
    // Note: Adding/editing/removing inventory items is a Faculty Coordinator
    // permission. President can only view items and allocate stock to clubs.

    if (__session.role === "facultycoordinator") {
        // Add Item button
        document.getElementById("btn-add-inventory-item").addEventListener("click", () => {
            document.getElementById("form-inventory-item").reset();
            document.getElementById("inv-item-id").value = "";
            document.getElementById("modal-inventory-title").textContent = "Add Inventory Item";
            openModal("modal-inventory-item");
        });
    }

    // Back to available items gallery list button
    const backToInvBtn = document.getElementById("btn-back-to-inventory");
    if (backToInvBtn) {
        backToInvBtn.addEventListener("click", () => {
            activeInventoryId = null;
            renderAll();
        });
    }

    if (__session.role === "president") {
        // Allocate active asset button (opens allocate modal and auto-selects this item)
        const btnAllocateActiveInv = document.getElementById("btn-allocate-active-inv");
        if (btnAllocateActiveInv) {
            btnAllocateActiveInv.addEventListener("click", () => {
                document.getElementById("form-allocate-inventory").reset();
                populateClubsSelects();
                resetPurposeToggle("alloc-purpose-type", "alloc-club-group", "alloc-club");
                openModal("modal-allocate-inventory");
                const selectEl = document.getElementById("alloc-item");
                if (selectEl) selectEl.value = activeInventoryId;
            });
        }

        // Allocate general/quick button
        const btnAllocInv = document.getElementById("btn-allocate-inventory");
        if (btnAllocInv) {
            btnAllocInv.addEventListener("click", () => {
                document.getElementById("form-allocate-inventory").reset();
                populateClubsSelects();
                resetPurposeToggle("alloc-purpose-type", "alloc-club-group", "alloc-club");
                openModal("modal-allocate-inventory");
            });
        }
    } else {
        // Faculty Coordinator: edit, checkout, delete active asset from detailed view
        const btnEditActiveInv = document.getElementById("btn-edit-active-inv");
        if (btnEditActiveInv) {
            btnEditActiveInv.addEventListener("click", () => {
                const item = state.inventory.find(i => i.id === activeInventoryId);
                if (item) {
                    document.getElementById("inv-item-id").value = item.id;
                    document.getElementById("inv-item-name").value = item.name;
                    document.getElementById("inv-item-category").value = item.category;
                    document.getElementById("inv-item-code").value = item.code;
                    document.getElementById("inv-item-qty").value = item.totalStock;
                    document.getElementById("inv-item-location").value = "";

                    document.getElementById("modal-inventory-title").textContent = "Edit Inventory Item";
                    openModal("modal-inventory-item");
                }
            });
        }

        // Checkout active asset for an event (Faculty Coordinator)
        const btnCheckoutActiveInv = document.getElementById("btn-checkout-active-inv");
        if (btnCheckoutActiveInv) {
            btnCheckoutActiveInv.addEventListener("click", async () => {
                const item = state.inventory.find(i => i.id === activeInventoryId);
                if (!item) return;
                if (item.availableStock <= 0) {
                    showToast("No available stock to checkout.", "warning");
                    return;
                }
                // Build event options from backend-linked events
                const eventsWithBackend = (state.eventBudgets || []).filter(eb => eb.backendEventId);
                if (eventsWithBackend.length === 0) {
                    showToast("No events linked to backend proposals. Create and finalize a proposal first.", "info");
                    return;
                }
                const eventOptions = eventsWithBackend.map(eb =>
                    `<option value="${eb.backendEventId}">${escapeHtml(eb.eventName)} (${eb.club})</option>`
                ).join("");
                const qty = prompt(`Checkout quantity for "${item.name}" (available: ${item.availableStock}):`, "1");
                if (!qty) return;
                const qtyNum = Number(qty);
                if (isNaN(qtyNum) || qtyNum <= 0) { showToast("Enter a valid quantity.", "danger"); return; }
                if (qtyNum > item.availableStock) { showToast(`Only ${item.availableStock} available.`, "danger"); return; }
                const eventIdStr = prompt(`Enter backend Event ID for checkout:\n${eventsWithBackend.map(eb => `${eb.backendEventId}: ${eb.eventName}`).join("\n")}`);
                if (!eventIdStr) return;
                const eventId = Number(eventIdStr);
                if (!eventsWithBackend.some(eb => eb.backendEventId === eventId)) {
                    showToast("Invalid event ID. Must be a backend event from the list above.", "danger");
                    return;
                }
                try {
                    const updated = await Api.checkoutInventory(activeInventoryId, eventId, qtyNum);
                    item.availableStock = updated.available_stock;
                    item.status = updated.status;
                    saveState();
                    renderAll();
                    showToast(`Checked out ${qtyNum}x ${item.name} for event #${eventId}.`);
                } catch (err) {
                    showToast(`Checkout failed: ${err.detail || err.message}`, "danger");
                }
            });
        }

        // Delete active asset from detailed view
        const btnDeleteActiveInv = document.getElementById("btn-delete-active-inv");
        if (btnDeleteActiveInv) {
            btnDeleteActiveInv.addEventListener("click", async () => {
                const item = state.inventory.find(i => i.id === activeInventoryId);
                if (item && confirm(`Are you sure you want to delete "${item.name}"? It can only be deleted if it has no usage records.`)) {
                    if (typeof Api !== "undefined" && !isNaN(Number(activeInventoryId))) {
                        try {
                            await Api.deleteInventoryItem(activeInventoryId);
                        } catch (err) {
                            showToast(`Couldn't delete "${item.name}": ${err.detail || err.message}`, "danger");
                            return;
                        }
                    }
                    state.inventory = state.inventory.filter(i => i.id !== activeInventoryId);
                    state.inventoryUsage = state.inventoryUsage.filter(u => u.itemId !== activeInventoryId);
                    activeInventoryId = null;
                    saveState();
                    renderAll();
                    showToast("Inventory item deleted successfully.", "warning");
                }
            });
        }
    }

    // Available Items List click delegation (opens the detail view)
    document.getElementById("inventory-items-list").addEventListener("click", function(e) {
        const row = e.target.closest(".inventory-inline-row");
        if (row) {
            activeInventoryId = numAttr(row, "data-id");
            renderAll();
        }
    });

    if (__session.role === "president") {
        // Form Submit: Allocate inventory item
        document.getElementById("form-allocate-inventory").addEventListener("submit", async function(e) {
            e.preventDefault();

            // alloc-item's value is always a string; inventory ids are
            // backend-numeric -- Number() it or the lookup below silently
            // fails to match and the whole submission aborts with no error.
            const itemId = Number(document.getElementById("alloc-item").value);
            const isClubBooking = document.querySelector('input[name="alloc-purpose-type"]:checked').value === "club";
            const club = isClubBooking ? document.getElementById("alloc-club").value : null;
            const qty = parseInt(document.getElementById("alloc-qty").value);
            const event = document.getElementById("alloc-event").value;
            const location = document.getElementById("alloc-location").value;
            const volName = document.getElementById("alloc-volunteer-name").value;
            const volId = document.getElementById("alloc-volunteer-id").value;
            const date = document.getElementById("alloc-date").value;
            const timeStart = document.getElementById("alloc-time").value;
            const timeEnd = document.getElementById("alloc-time-end").value;
            const timeRange = timeStart && timeEnd ? `${timeStart} - ${timeEnd}` : timeStart || "00:00 - 23:59";

            if (!itemId) {
                alert("Please select a valid item.");
                return;
            }

            const item = state.inventory.find(i => i.id === itemId);
            if (!item) return;

            if (qty > item.availableStock) {
                alert(`Insufficient stock! Only ${item.availableStock} items are available.`);
                return;
            }

            const cf = club ? state.clubsFinances.find(c => c.club === club) : null;
            const allocResult = await callApi(() => Api.createInventoryUsage({
                item_id: itemId,
                club_id: cf ? cf.id : null,
                event_name: event || club,
                location,
                quantity: qty,
                booking_date: date || null,
                time_slot: timeRange,
                status: "In Use"
            }), "Couldn't allocate inventory");
            if (!allocResult.ok) return;
            const created = allocResult.data;

            // Add usage record in "In Use" status with volunteer details
            state.inventoryUsage.push({
                id: created.id,
                itemId: itemId,
                itemName: item.name,
                club: club,
                event: event,
                qty: qty,
                location: location,
                volunteerName: volName,
                volunteerId: volId,
                date: date,
                timeStart: timeStart,
                timeEnd: timeEnd,
                timeRange: timeRange,
                status: "In Use"
            });

            saveState();
            closeModal("modal-allocate-inventory");
            renderAll();
            showToast(`Allocated ${qty}x ${item.name} to volunteer ${volName} (${club || event}).`);
        });

        // Active Usage logs click delegation (Review / Return Workflow)
        document.getElementById("inventory-usage-list").addEventListener("click", async function(e) {
            const handoverBtn = e.target.closest(".handover-usage-btn");
            const volunteerBtn = e.target.closest(".volunteer-return-btn");
            const confirmBtn = e.target.closest(".confirm-return-btn");

            if (handoverBtn) {
                // data-id is always a string; inventoryUsage ids are
                // backend-numeric -- Number() it or this lookup silently
                // matches nothing and the button does nothing at all.
                const logId = numAttr(handoverBtn, "data-id");
                const log = state.inventoryUsage.find(u => u.id === logId);
                if (log) {
                    // Volunteer name/ID is auto-populated from the Club Head's
                    // Procurement task acceptance (or was entered at Quick Book
                    // creation time) — no manual entry here anymore.
                    if (typeof Api !== "undefined" && logId !== null && !(await callApi(() => Api.markInventoryUsageInUse(logId), "Couldn't mark in use")).ok) return;
                    log.status = "In Use";
                    saveState();
                    await loadState();
                    renderAll();
                    showToast(log.volunteerName ? `Asset marked In Use under volunteer ${log.volunteerName}.` : `Asset marked In Use.`);
                }
                return;
            }

            if (volunteerBtn) {
                const logId = numAttr(volunteerBtn, "data-id");
                const log = state.inventoryUsage.find(u => u.id === logId);
                if (log) {
                    // "Pending Review" is a local-only staging step (volunteer
                    // says they returned it, awaiting Faculty confirmation) --
                    // the backend only models Booked/In Use/Returned, so there's
                    // nothing to persist until the Faculty Coordinator actually
                    // confirms the return below.
                    log.status = "Pending Review";
                    saveState();
                    renderAll();
                    showToast(`Volunteer return submitted. Review and confirm return.`);
                }
                return;
            }

            if (confirmBtn) {
                const logId = numAttr(confirmBtn, "data-id");
                const log = state.inventoryUsage.find(u => u.id === logId);
                if (log) {
                    if (typeof Api !== "undefined" && logId !== null && !(await callApi(() => Api.returnInventoryUsage(logId), "Couldn't confirm return")).ok) return;
                    log.status = "Returned";
                    saveState();
                    await loadState();
                    renderAll();
                    showToast(`Returned quantity verified & added back to stock!`);
                }
                return;
            }
        });
    } else {
        // Form Submit: Inventory Item Add/Edit. Add uses POST /inventory and
        // Edit uses PATCH /inventory/{id} (falling back to a local-only change
        // when the Api client isn't available, e.g. offline).
        document.getElementById("form-inventory-item").addEventListener("submit", async function(e) {
            e.preventDefault();

            const rawId = document.getElementById("inv-item-id").value;
            const id = rawId ? Number(rawId) : null;
            const name = document.getElementById("inv-item-name").value;
            const category = document.getElementById("inv-item-category").value;
            const code = document.getElementById("inv-item-code").value;
            const qty = parseInt(document.getElementById("inv-item-qty").value);

            if (id) {
                // Edit mode
                const idx = state.inventory.findIndex(i => i.id === id);
                if (idx !== -1) {
                    let updated = null;
                    if (typeof Api !== "undefined" && !isNaN(Number(id))) {
                        try {
                            updated = await Api.updateInventoryItem(id, { code, name, category, total_stock: qty });
                        } catch (err) {
                            showToast(`Couldn't update asset: ${err.detail || err.message}`, "danger");
                            return;
                        }
                    }
                    if (updated) {
                        // Backend keeps the checked-out delta constant when the
                        // total changes, so availableStock comes back adjusted.
                        state.inventory[idx] = {
                            ...state.inventory[idx],
                            code: updated.code,
                            name: updated.name,
                            category: updated.category,
                            totalStock: updated.total_stock,
                            availableStock: updated.available_stock,
                            status: updated.status,
                            location: ""
                        };
                        showToast("Inventory item updated.", "success");
                    } else {
                        // Local fallback (offline, or a non-backend item).
                        const prevTotal = state.inventory[idx].totalStock;
                        const prevAvail = state.inventory[idx].availableStock;
                        const allocatedCount = prevTotal - prevAvail;

                        state.inventory[idx].name = name;
                        state.inventory[idx].category = category;
                        state.inventory[idx].code = code;
                        state.inventory[idx].totalStock = qty;
                        state.inventory[idx].availableStock = Math.max(qty - allocatedCount, 0);
                        state.inventory[idx].location = "";
                        showToast("Inventory item updated locally.", "success");
                    }
                }
            } else {
                // Add mode
                let created;
                try {
                    created = await Api.createInventoryItem({ code, name, category, total_stock: qty });
                } catch (err) {
                    showToast(`Couldn't add asset: ${err.detail || err.message}`, "danger");
                    return;
                }
                state.inventory.push({
                    id: created.id,
                    code: created.code,
                    name: created.name,
                    category: created.category,
                    location: "",
                    totalStock: created.total_stock,
                    availableStock: created.available_stock,
                    status: created.status
                });
                showToast("New asset added to central inventory.");
            }

            saveState();
            closeModal("modal-inventory-item");
            renderAll();
        });
    }

    // -------------------------------------------------------------
    // VENUES ACTIONS
    // -------------------------------------------------------------
    // Note: Booking venues for clubs is a Club President permission. Faculty
    // Coordinator can only add, edit, and remove venues from the catalogue.
    if (__session.role === "president") {
        // Venue Card booking triggers
        document.getElementById("venues-cards-grid").addEventListener("click", function(e) {
            const bookBtn = e.target.closest(".book-venue-card-btn");
            if (bookBtn) {
                const venueId = bookBtn.getAttribute("data-id");
                resetPurposeToggle("booking-purpose-type", "booking-club-group", "booking-club");
                openModal("modal-book-venue");
                populateClubsSelects();
                document.getElementById("booking-venue").value = venueId;
            }
        });

        document.getElementById("btn-add-booking").addEventListener("click", () => {
            document.getElementById("form-book-venue").reset();
            populateClubsSelects();
            resetPurposeToggle("booking-purpose-type", "booking-club-group", "booking-club");
            openModal("modal-book-venue");
        });

        // Live venue-availability check (Story 2.1): when a venue + date are
        // picked, ask the backend whether that venue is free on that date and
        // surface the result inline before the user confirms the booking.
        const bookingAvailabilityHint = document.getElementById("booking-availability-hint");
        const bookingVenueInput = document.getElementById("booking-venue");
        const bookingDateInput = document.getElementById("booking-date");
        let lastAvailabilityToken = 0;
        async function checkBookingAvailability() {
            const venueId = Number(bookingVenueInput && bookingVenueInput.value);
            const date = bookingDateInput && bookingDateInput.value;
            if (!venueId || !date) {
                if (bookingAvailabilityHint) bookingAvailabilityHint.classList.add("hidden");
                return;
            }
            const token = ++lastAvailabilityToken;
            try {
                const res = await Api.venueAvailability(venueId, date);
                if (token !== lastAvailabilityToken) return; // stale response
                if (!bookingAvailabilityHint) return;
                bookingAvailabilityHint.classList.remove("hidden");
                bookingAvailabilityHint.style.background = res && res.available
                    ? "var(--success-light)"
                    : "var(--danger-light)";
                bookingAvailabilityHint.style.border = res && res.available
                    ? "1px solid rgba(16,185,129,0.3)"
                    : "1px solid rgba(239,68,68,0.3)";
                bookingAvailabilityHint.style.color = res && res.available
                    ? "var(--success)"
                    : "var(--danger)";
                bookingAvailabilityHint.innerHTML = res && res.available
                    ? `<i class="fa-solid fa-circle-check"></i> This venue is available on ${formatDate(date)} — safe to book.`
                    : `<i class="fa-solid fa-triangle-exclamation"></i> This venue is already booked on ${formatDate(date)} (booking #${res.conflicting_booking_id}). The conflict check will block this booking.`;
            } catch (e) {
                // Backend unreachable — the local conflict check still runs on submit.
                if (bookingAvailabilityHint) bookingAvailabilityHint.classList.add("hidden");
            }
        }
        if (bookingVenueInput) bookingVenueInput.addEventListener("change", checkBookingAvailability);
        if (bookingDateInput) bookingDateInput.addEventListener("change", checkBookingAvailability);

        // Form Submit: Book Venue
        document.getElementById("form-book-venue").addEventListener("submit", function(e) {
            e.preventDefault();

            const venueId = Number(document.getElementById("booking-venue").value);
            const isClubBooking = document.querySelector('input[name="booking-purpose-type"]:checked').value === "club";
            const club = isClubBooking ? document.getElementById("booking-club").value : null;
            const event = document.getElementById("booking-event").value;
            const date = document.getElementById("booking-date").value;
            const timeStart = document.getElementById("booking-time-start").value;
            const timeEnd = document.getElementById("booking-time-end").value;
            const timeSlot = `${timeStart} - ${timeEnd}`;

            if (!venueId) {
                alert("Please choose a venue.");
                return;
            }

            const venue = state.venues.find(v => v.id === venueId);
            if (!venue) return;

            // Check for double bookings on same day/venue
            const conflict = state.bookings.find(b => b.venueId === venueId && b.date === date && b.status === "Confirmed");
            if (conflict) {
                alert(`Booking Conflict! ${venue.name} is already booked on ${date} for event "${conflict.event}".`);
                return;
            }

            // Add Booking
            const clubObj = state.clubsFinances.find(c => c.club === club);
            const clubId = clubObj ? clubObj.id : null;
            (async () => {
                let createdBooking = null;
                try {
                    createdBooking = await Api.createBooking({
                        venue_id: venueId,
                        club_id: clubId,
                        event_name: event,
                        booking_date: date,
                        time_slot: timeSlot,
                        status: "Confirmed"
                    });
                } catch (err) {
                    console.warn("Could not persist booking to DB:", err);
                }

                const bookingId = createdBooking ? createdBooking.id : generateId("b");
                state.bookings.push({
                    id: bookingId,
                    venueId: venueId,
                    venueName: venue.name,
                    event: event,
                    club: club,
                    date: date,
                    timeSlot: timeSlot,
                    status: "Confirmed"
                });

                saveState();
                closeModal("modal-book-venue");
                renderAll();
                showToast(`Venue ${venue.name} successfully booked for ${event}.`);
            })();
        });

        // Booking Table Actions (Complete / Cancel)
        document.getElementById("venue-bookings-tbody").addEventListener("click", async function(e) {
            const compBtn = e.target.closest(".complete-booking-btn");
            if (compBtn) {
                const bId = compBtn.getAttribute("data-id");
                const booking = state.bookings.find(b => b.id == bId);
                if (booking) {
                    if (!isNaN(Number(bId)) && !(await callApi(() => Api.updateBookingStatus(Number(bId), "Completed"), "Couldn't mark booking as Completed")).ok) return;
                    booking.status = "Completed";
                    saveState();
                    renderAll();
                    showToast(`Booking ${bId} marked as Completed.`);
                }
            }

            const cancelBtn = e.target.closest(".cancel-booking-btn");
            if (cancelBtn) {
                const bId = cancelBtn.getAttribute("data-id");
                if (confirm("Are you sure you want to cancel this booking?")) {
                    const booking = state.bookings.find(b => b.id == bId);
                    if (booking) {
                        if (!isNaN(Number(bId)) && !(await callApi(() => Api.updateBookingStatus(Number(bId), "Cancelled"), "Couldn't cancel booking")).ok) return;
                        booking.status = "Cancelled";
                        saveState();
                        renderAll();
                        showToast(`Booking ${bId} cancelled successfully.`, 'danger');
                    }
                }
            }

            // Release a confirmed booking — the Venue & Asset Management component's
            // "Release rejected allocations" step: frees the venue slot without
            // deleting the record, so it no longer blocks future bookings.
            const releaseBtn = e.target.closest(".release-booking-btn");
            if (releaseBtn) {
                const bId = releaseBtn.getAttribute("data-id");
                if (confirm("Release this venue slot? The booking will be marked as Released and will no longer block other bookings for that venue/date.")) {
                    const booking = state.bookings.find(b => b.id == bId);
                    if (booking) {
                        if (!isNaN(Number(bId)) && !(await callApi(() => Api.releaseBooking(Number(bId)), "Couldn't release booking")).ok) return;
                        booking.status = "Released";
                        saveState();
                        renderAll();
                        showToast(`Booking ${bId} released. The venue slot is free again.`);
                    }
                }
            }
        });
    } else {
        document.getElementById("btn-add-venue").addEventListener("click", () => {
            document.getElementById("form-venue-item").reset();
            document.getElementById("venue-item-id").value = "";
            document.getElementById("modal-venue-title").textContent = "Add Venue";
            openModal("modal-venue-item");
        });

        // Venue card Edit/Delete delegation
        document.getElementById("venues-cards-grid").addEventListener("click", async function(e) {
            const editBtn = e.target.closest(".edit-venue-card-btn");
            const deleteBtn = e.target.closest(".delete-venue-card-btn");

            if (editBtn) {
                const venue = state.venues.find(v => v.id === numAttr(editBtn, "data-id"));
                if (venue) {
                    document.getElementById("venue-item-id").value = venue.id;
                    document.getElementById("venue-item-name").value = venue.name;
                    document.getElementById("venue-item-capacity").value = venue.capacity;
                    document.getElementById("venue-item-location").value = venue.location;
                    document.getElementById("venue-item-description").value = venue.description;
                    document.getElementById("venue-item-facilities").value = venue.facilities;
                    document.getElementById("venue-item-requirements").value = (venue.requirements || []).join(", ");

                    document.getElementById("modal-venue-title").textContent = "Edit Venue";
                    openModal("modal-venue-item");
                }
                return;
            }

            if (deleteBtn) {
                const id = numAttr(deleteBtn, "data-id");
                const venue = state.venues.find(v => v.id === id);
                if (venue && confirm(`Are you sure you want to remove "${venue.name}"? It can only be deleted if it has no bookings or event proposals.`)) {
                    if (typeof Api !== "undefined" && !isNaN(Number(id))) {
                        try {
                            await Api.deleteVenue(id);
                        } catch (err) {
                            showToast(`Couldn't delete "${venue.name}": ${err.detail || err.message}`, "danger");
                            return;
                        }
                    }
                    state.venues = state.venues.filter(v => v.id !== id);
                    saveState();
                    renderAll();
                    showToast(`"${venue.name}" removed from the venue catalogue.`, "warning");
                }
                return;
            }
        });

        // Form Submit: Venue Add/Edit. Add uses POST /venues and Edit uses
        // PATCH /venues/{id} (falling back to a local-only change when the Api
        // client isn't available, e.g. offline).
        document.getElementById("form-venue-item").addEventListener("submit", async function(e) {
            e.preventDefault();

            const rawId = document.getElementById("venue-item-id").value;
            const id = rawId ? Number(rawId) : null;
            const name = document.getElementById("venue-item-name").value;
            const capacity = parseInt(document.getElementById("venue-item-capacity").value);
            const location = document.getElementById("venue-item-location").value;
            const description = document.getElementById("venue-item-description").value;
            const facilities = document.getElementById("venue-item-facilities").value;
            const requirements = document.getElementById("venue-item-requirements").value
                .split(",").map(r => r.trim()).filter(r => r.length > 0);

            if (id) {
                const idx = state.venues.findIndex(v => v.id === id);
                if (idx !== -1) {
                    let updated = null;
                    if (typeof Api !== "undefined" && !isNaN(Number(id))) {
                        try {
                            updated = await Api.updateVenue(id, { name, capacity, location, facilities, requirements: requirements.join(", ") });
                        } catch (err) {
                            showToast(`Couldn't update venue: ${err.detail || err.message}`, "danger");
                            return;
                        }
                    }
                    if (updated) {
                        // `description` is a local-only field (VenueOut has no
                        // such column) -- preserved from the existing local copy.
                        state.venues[idx] = {
                            ...state.venues[idx],
                            name: updated.name, capacity: updated.capacity,
                            location: updated.location || "",
                            facilities: updated.facilities || "",
                            requirements: updated.requirements ? updated.requirements.split(", ") : [],
                            description
                        };
                        showToast("Venue updated.", "success");
                    } else {
                        // Local fallback (offline, or a non-backend venue).
                        state.venues[idx] = { ...state.venues[idx], name, capacity, location, description, facilities, requirements };
                        showToast("Venue updated locally.", "success");
                    }
                }
            } else {
                let created;
                try {
                    created = await Api.createVenue({ name, capacity, location, facilities, requirements: requirements.join(", ") });
                } catch (err) {
                    showToast(`Couldn't add venue: ${err.detail || err.message}`, "danger");
                    return;
                }
                state.venues.push({
                    id: created.id,
                    name: created.name, capacity: created.capacity, location: created.location || "",
                    description, facilities: created.facilities || "",
                    requirements: created.requirements ? created.requirements.split(", ") : []
                });
                showToast("New venue added to the campus catalogue.");
            }

            saveState();
            closeModal("modal-venue-item");
            renderAll();
        });
    }

    // -------------------------------------------------------------
    // CLUB FINANCES ACTIONS — Faculty Coordinator-only (the President can
    // view finances but does not allocate or disburse club funds).
    // -------------------------------------------------------------
    if (__session.role === "facultycoordinator") {
        document.getElementById("btn-adjust-finances").addEventListener("click", () => {
            if (!activeOverviewClubName) return;
            document.getElementById("form-club-finance").reset();
            const clubSelect = document.getElementById("finance-club");
            clubSelect.innerHTML = `<option value="${escapeHtml(activeOverviewClubName)}">${escapeHtml(activeOverviewClubName)}</option>`;
            clubSelect.value = activeOverviewClubName;
            openModal("modal-club-finances");
        });

        // Form Submit: Club Finance adjustment
        document.getElementById("form-club-finance").addEventListener("submit", async function(e) {
            e.preventDefault();

            const clubName = document.getElementById("finance-club").value;
            const type = document.getElementById("finance-type").value;
            const amount = parseInt(document.getElementById("finance-amount").value);
            const desc = document.getElementById("finance-desc").value;

            const cf = state.clubsFinances.find(c => c.club === clubName);
            if (!cf) return;

            if (isNaN(amount) || amount <= 0) {
                alert("Enter a valid amount (greater than 0).");
                return;
            }
            if (type === "Adjustment" && amount > cf.allotted) {
                alert(`Adjustment can't exceed ${clubName}'s current allotted budget of ${formatCurrency(cf.allotted)}.`);
                return;
            }

            try {
                // Faculty Coordinator logs through the global finance ledger
                // endpoint (Credit/Debit style); Adjustments stay club-scoped.
                if (type === "Adjustment") {
                    await Api.createFinanceTransaction(cf.id, type, amount, desc);
                } else {
                    await Api.createGlobalFinanceTransaction(cf.id, type, amount, desc);
                }
            } catch (err) {
                showToast(`Couldn't log transaction: ${err.detail || err.message}`, "danger");
                return;
            }

            await loadState();
            closeModal("modal-club-finances");
            renderAll();
            showToast(`Financial ledger transaction logged for ${clubName}.`);
        });
    }

    // -------------------------------------------------------------
    // MASTER BUDGET POOL (drives "Available to Allocate") — Faculty-only
    // -------------------------------------------------------------
    if (__session.role === "facultycoordinator") {
        const btnEditBudgetPool = document.getElementById("btn-edit-budget-pool");
        if (btnEditBudgetPool) {
            btnEditBudgetPool.addEventListener("click", () => {
                if (!state.facultyBudgetPool) state.facultyBudgetPool = { total: 0 };
                const totalAllotted = state.clubsFinances.reduce((acc, c) => acc + c.allotted, 0);
                const poolTotal = state.facultyBudgetPool.total || 0;
                const available = poolTotal - totalAllotted;

                document.getElementById("budget-pool-total").value = poolTotal;

                const summary = document.getElementById("budget-pool-summary");
                if (summary) {
                    summary.innerHTML = `
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-money-bill-wave text-indigo"></i>
                            <div>
                                <span class="prop-summary-lbl">Currently Allotted</span>
                                <span class="prop-summary-val">${formatCurrency(totalAllotted)}</span>
                            </div>
                        </div>
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-piggy-bank text-emerald"></i>
                            <div>
                                <span class="prop-summary-lbl">Currently Available</span>
                                <span class="prop-summary-val" style="color:${available < 0 ? 'var(--danger)' : 'var(--primary)'};">${formatCurrency(available)}</span>
                            </div>
                        </div>
                    `;
                }
                openModal("modal-budget-pool");
            });
        }

        // Form Submit: Edit master budget pool
        const formBudgetPool = document.getElementById("form-budget-pool");
        if (formBudgetPool) {
            formBudgetPool.addEventListener("submit", async function(e) {
                e.preventDefault();

                const newTotal = parseInt(document.getElementById("budget-pool-total").value, 10);
                if (isNaN(newTotal) || newTotal < 0) return;

                const totalAllotted = state.clubsFinances.reduce((acc, c) => acc + c.allotted, 0);
                if (newTotal < totalAllotted) {
                    showToast(`Master budget can't be below ${formatCurrency(totalAllotted)} already allotted to clubs.`, "warning");
                    return;
                }

                try {
                    await Api.updateFacultyBudgetPool(newTotal);
                } catch (err) {
                    showToast(`Couldn't update master budget pool: ${err.detail || err.message}`, "danger");
                    return;
                }

                await loadState();
                closeModal("modal-budget-pool");
                renderAll();
                showToast("Master budget pool updated.");
            });
        }
    }

    // -------------------------------------------------------------
    // CLUB OVERVIEW — DRILLDOWN NAVIGATION
    // -------------------------------------------------------------
    const overviewCardsGrid = document.getElementById("overview-club-cards-grid");
    if (overviewCardsGrid) {
        overviewCardsGrid.addEventListener("click", async function(e) {
            const editBtn = e.target.closest(".edit-club-btn");
            if (editBtn) {
                const clubId = numAttr(editBtn, "data-id");
                const clubName = editBtn.getAttribute("data-club");
                const profile = (state.clubProfiles || []).find(p => p.id === clubId);
                document.getElementById("form-edit-club").reset();
                document.getElementById("edit-club-id").value = clubId;
                document.getElementById("edit-club-name").value = clubName;
                document.getElementById("edit-club-description").value = profile ? (profile.description || "") : "";
                openModal("modal-edit-club");
                return;
            }

            const deleteBtn = e.target.closest(".delete-club-btn");
            if (deleteBtn) {
                const clubId = numAttr(deleteBtn, "data-id");
                const clubName = deleteBtn.getAttribute("data-club");
                if (!confirm(`Delete "${clubName}" permanently? This removes its members, proposals, events, bookings and recruitment domains. This cannot be undone.`)) return;
                try {
                    await Api.deleteClub(clubId);
                } catch (err) {
                    showToast(`Couldn't delete "${clubName}": ${err.detail || err.message}`, "danger");
                    return;
                }
                state.clubsFinances = state.clubsFinances.filter(c => c.id !== clubId);
                state.clubProfiles = (state.clubProfiles || []).filter(p => p.id !== clubId);
                state.clubMembers = (state.clubMembers || []).filter(m => m.club !== clubName);
                state.domains = (state.domains || []).filter(d => d.club !== clubName);
                state.volunteerApplications = (state.volunteerApplications || []).filter(a => a.club !== clubName);
                state.proposals = (state.proposals || []).filter(p => p.organizer !== clubName);
                state.eventBudgets = (state.eventBudgets || []).filter(eb => eb.club !== clubName);
                if (activeOverviewClubName === clubName) activeOverviewClubName = null;
                saveState();
                renderAll();
                showToast(`"${clubName}" has been deleted.`);
                return;
            }

            // Faculty reviews pending club proposals (Component 3).
            const reviewBtn = e.target.closest("[data-review-club]");
            if (reviewBtn) {
                const clubId = numAttr(reviewBtn, "data-review-club");
                const approve = reviewBtn.getAttribute("data-approve") === "1";
                const club = state.clubsFinances.find(c => c.id === clubId);
                if (!club) return;
                if (!confirm(`${approve ? "Approve" : "Reject"} the club proposal for "${club.club}"? ${approve ? "The club and its Club Head login will go live." : "The proposal will be rejected and the club will stay unpublished."}`)) return;
                try {
                    const updated = await Api.reviewClub(clubId, approve);
                    club.status = updated.status || (approve ? "Approved" : "Rejected");
                    saveState();
                    renderAll();
                    showToast(`${approve ? "Approved" : "Rejected"} club "${club.club}".`);
                } catch (err) {
                    showToast(`Couldn't review club: ${err.detail || err.message}`, "danger");
                }
                return;
            }

            const card = e.target.closest(".overview-club-card");
            if (card) {
                activeOverviewClubName = card.getAttribute("data-club");
                activeOverviewSubTab = "activities";
                renderClubOverview();
            }
        });
    }

    // Edit Club — description + optional Club Head password reset
    const formEditClub = document.getElementById("form-edit-club");
    if (formEditClub) {
        formEditClub.addEventListener("submit", async function(e) {
            e.preventDefault();
            const clubId = Number(document.getElementById("edit-club-id").value);
            const clubName = document.getElementById("edit-club-name").value;
            const description = document.getElementById("edit-club-description").value.trim();
            const newPassword = document.getElementById("edit-club-head-password").value.trim();

            if (newPassword && newPassword.length < 6) {
                showToast("Club Head password must be at least 6 characters.", "danger");
                return;
            }

            try {
                await Api.updateClub(clubId, { description });
                if (newPassword) {
                    await Api.resetClubHeadPassword(clubId, newPassword);
                }
            } catch (err) {
                showToast(`Couldn't update "${clubName}": ${err.detail || err.message}`, "danger");
                return;
            }

            const profile = (state.clubProfiles || []).find(p => p.id === clubId);
            if (profile) profile.description = description;

            saveState();
            closeModal("modal-edit-club");
            renderAll();
            showToast(`"${clubName}" updated.${newPassword ? " Club Head password has been reset." : ""}`);
        });
    }

    const btnBackToOverviewClubs = document.getElementById("btn-back-to-overview-clubs");
    if (btnBackToOverviewClubs) {
        btnBackToOverviewClubs.addEventListener("click", () => {
            activeOverviewClubName = null;
            renderClubOverview();
        });
    }

    // Create Club — opens the modal from the Club Overview gallery
    if (__session.role === "facultycoordinator" || __session.role === "president") {
        const btnCreateClub = document.getElementById("btn-create-club");
        if (btnCreateClub) {
            btnCreateClub.addEventListener("click", () => {
                document.getElementById("form-create-club").reset();
                openModal("modal-create-club");
            });
        }

        // Form Submit: Create Club — calls the backend, which also auto-provisions
        // that club's Club Head login (<clubname-slug>@iitm.in / <slug>123).
        const formCreateClub = document.getElementById("form-create-club");
        if (formCreateClub) {
            formCreateClub.addEventListener("submit", async function(e) {
                e.preventDefault();

                const name = document.getElementById("create-club-name").value.trim();
                const category = document.getElementById("create-club-category").value;
                const description = document.getElementById("create-club-description").value.trim();
                const clubHeadEmail = document.getElementById("create-club-head-email").value.trim();
                const clubHeadPassword = document.getElementById("create-club-head-password").value.trim();

                if (!name) return;
                if (clubHeadPassword && clubHeadPassword.length < 6) {
                    showToast("Club Head password must be at least 6 characters.", "danger");
                    return;
                }

                // Guard against duplicates (case-insensitive)
                const exists = state.clubsFinances.some(c => c.club.toLowerCase() === name.toLowerCase());
                if (exists) {
                    showToast(`A club named "${name}" already exists.`, "warning");
                    return;
                }

                let result;
                try {
                    result = await Api.createClub({
                        name, category, description, achievements: [],
                        club_head_email: clubHeadEmail || undefined,
                        club_head_password: clubHeadPassword || undefined
                    });
                } catch (err) {
                    showToast(`Couldn't create "${name}": ${err.detail || err.message}`, "danger");
                    return;
                }

                state.clubsFinances.push({
                    id: result.club.id, club: result.club.name, category: result.club.category,
                    status: result.club.status, allotted: 0, spent: 0
                });

                if (!Array.isArray(state.clubProfiles)) state.clubProfiles = [];
                state.clubProfiles.push({
                    id: result.club.id,
                    club: result.club.name,
                    description: result.club.description || "",
                    achievements: result.club.achievements || [],
                    history: result.club.history || "",
                    pastEvents: []
                });

                saveState();
                closeModal("modal-create-club");
                renderAll();
                const pendingNote = result.club.status === "Pending"
                    ? " This club proposal now awaits Faculty Coordinator approval."
                    : "";
                showToast(
                    `"${name}" created. Club Head login: ${result.club_head.email} / ${result.club_head.password} — share this with them.${pendingNote}`,
                    result.club.status === "Pending" ? "warning" : "success"
                );
            });
        }
    }

    // Club Overview sub-tab switch (Club Activities <-> Club Members <-> Certification Verification <-> Finances & Budgets)
    const btnOverviewTabActivities = document.getElementById("btn-overview-tab-activities");
    const btnOverviewTabMembers = document.getElementById("btn-overview-tab-members");
    const btnOverviewTabCertification = document.getElementById("btn-overview-tab-certification");
    const btnOverviewTabFinances = document.getElementById("btn-overview-tab-finances");
    if (btnOverviewTabActivities && btnOverviewTabMembers && btnOverviewTabCertification && btnOverviewTabFinances) {
        btnOverviewTabActivities.addEventListener("click", () => {
            activeOverviewSubTab = "activities";
            renderOverviewClubDetail();
        });
        btnOverviewTabMembers.addEventListener("click", () => {
            activeOverviewSubTab = "members";
            renderOverviewClubDetail();
        });
        btnOverviewTabCertification.addEventListener("click", () => {
            activeOverviewSubTab = "certification";
            renderOverviewClubDetail();
        });
        btnOverviewTabFinances.addEventListener("click", () => {
            activeOverviewSubTab = "finances";
            activeEventBudgetId = null;
            renderOverviewClubDetail();
        });
    }

    // Certification Verification — Verify/Final Approve / Re-open actions
    const overviewCertTbody = document.getElementById("overview-certification-tbody");
    if (overviewCertTbody) {
        overviewCertTbody.addEventListener("click", async function(e) {
            const verifyBtn = e.target.closest(".overview-verify-cert-btn");
            const reopenBtn = e.target.closest(".overview-reopen-cert-btn");

            if (verifyBtn) {
                const eb = state.eventBudgets.find(x => x.id === numAttr(verifyBtn, "data-id"));
                if (eb) {
                    if (__session.role === "president") {
                        if (!confirm(`Approve certificates for "${eb.eventName}"? This confirms the event took place and participation records are accurate. The Faculty Coordinator will give final sign-off before certificates are issued.`)) return;
                        eb.certVerification = { status: "Pending Faculty Approval", verifiedOn: null, presidentApprovedOn: new Date().toISOString().slice(0, 10) };
                        saveState();
                        renderOverviewCertification(activeOverviewClubName);
                        showToast(`"${eb.eventName}" approved and sent to the Faculty Coordinator for final sign-off.`);
                    } else {
                        if (!confirm(`Give final approval for "${eb.eventName}"? This issues the verified certificates to participants.`)) return;
                        // Finalizing on the backend is what actually issues Task-4/QR-5
                        // Certificate rows for verified volunteers + checked-in attendees
                        // (app.routers.certificates.finalize_event); already-finalized is
                        // a no-op here since local certVerification tracks it separately.
                        let backendFinalized = true;
                        if (eb.backendEventId) {
                            try {
                                await Api.finalizeEvent(eb.backendEventId);
                            } catch (err) {
                                if (err.status !== 409) {
                                    showToast(`Couldn't finalize on the backend: ${err.detail || err.message}`, "danger");
                                    return;
                                }
                            }
                        } else {
                            backendFinalized = false;
                        }
                        eb.certVerification.status = "Verified";
                        eb.certVerification.verifiedOn = new Date().toISOString().slice(0, 10);
                        saveState();
                        issueCertificatesForEvent(eb);
                        renderOverviewCertification(activeOverviewClubName);
                        showToast(
                            backendFinalized
                                ? `Certificates finalized for "${eb.eventName}".`
                                : `Certificates finalized locally for "${eb.eventName}" -- this event isn't linked to a backend proposal, so no real Certificate/attendance records were touched server-side.`,
                            backendFinalized ? "success" : "info"
                        );
                    }
                }
                return;
            }

            if (reopenBtn) {
                const eb = state.eventBudgets.find(x => x.id === numAttr(reopenBtn, "data-id"));
                if (eb) {
                    if (__session.role === "president") {
                        eb.certVerification = { status: "Pending", verifiedOn: null };
                        saveState();
                        renderOverviewCertification(activeOverviewClubName);
                        showToast(`"${eb.eventName}" re-opened for certificate verification.`, "info");
                    } else {
                        eb.certVerification.status = "Pending Faculty Approval";
                        eb.certVerification.verifiedOn = null;
                        saveState();
                        renderOverviewCertification(activeOverviewClubName);
                        showToast(`"${eb.eventName}" re-opened for final certificate review.`, "info");
                    }
                }
                return;
            }
        });
    }

    // Click an event budget card within the active club -> show split details
    const clubEventBudgetsGrid = document.getElementById("club-event-budgets-grid");
    if (clubEventBudgetsGrid) {
        clubEventBudgetsGrid.addEventListener("click", function(e) {
            const card = e.target.closest(".event-budget-card");
            if (card) {
                activeEventBudgetId = numAttr(card, "data-id");
                renderEventSplitDetails();
                // Re-render the card list too so the "active" highlight updates
                renderClubDetail();
            }
        });
    }

    // Add Event Budget modal (locked to the club currently being viewed) —
    // Faculty Coordinator-only. The President can view event budgets but does
    // not allocate them.
    if (__session.role === "facultycoordinator") {
        document.getElementById("btn-add-event-budget").addEventListener("click", () => {
            if (!activeOverviewClubName) return;
            document.getElementById("form-event-budget").reset();
            const clubSelect = document.getElementById("evt-budget-club");
            clubSelect.innerHTML = `<option value="${escapeHtml(activeOverviewClubName)}">${escapeHtml(activeOverviewClubName)}</option>`;
            clubSelect.value = activeOverviewClubName;
            openModal("modal-event-budget");
        });

        // Form Submit: Add Event budget allocation
        document.getElementById("form-event-budget").addEventListener("submit", async function(e) {
            e.preventDefault();

            const name = document.getElementById("evt-budget-name").value;
            const clubName = activeOverviewClubName;
            const allotted = parseInt(document.getElementById("evt-budget-allotted").value);
            if (!clubName) return;

            if (isNaN(allotted) || allotted < 0) {
                alert("Enter a valid allotted amount (0 or greater).");
                return;
            }

            const cf = state.clubsFinances.find(c => c.club === clubName);
            if (!cf) return;

            let created;
            try {
                created = await Api.createEventBudget(cf.id, name, allotted);
            } catch (err) {
                showToast(`Couldn't allocate event budget: ${err.detail || err.message}`, "danger");
                return;
            }

            activeEventBudgetId = created.id; // focus new budget

            await loadState();
            closeModal("modal-event-budget");
            renderAll();
            showToast(`Event budget allocated for "${name}" (${clubName}).`);
        });
    }

    // Open "Log Additional Expense / Bill" modal, pre-filled and locked to the active event (for unplanned/extra items)
    document.getElementById("btn-add-expense-line").addEventListener("click", () => {
        const activeEb = state.eventBudgets.find(eb => eb.id === activeEventBudgetId);
        if (!activeEb) return;
        document.getElementById("form-expense-line").reset();
        document.getElementById("expense-event-name-display").value = activeEb.eventName;
        toggleExpenseBillRequirement();
        openModal("modal-expense-line");
    });

    // Toggle the bill-upload requirement hint when expense type changes (Prize Money doesn't need a bill)
    function toggleExpenseBillRequirement() {
        const typeVal = document.getElementById("expense-type").value;
        const uploadGroup = document.getElementById("expense-bill-upload-group");
        const hint = document.getElementById("expense-bill-hint");
        const fileInput = document.getElementById("expense-bill-file");
        if (typeVal === "Prize Money") {
            uploadGroup.style.opacity = "0.6";
            hint.textContent = "Not required for Prize Money entries.";
            fileInput.removeAttribute("required");
        } else {
            uploadGroup.style.opacity = "1";
            hint.textContent = "Required unless the expense type is Prize Money.";
        }
    }
    const expenseTypeSelect = document.getElementById("expense-type");
    if (expenseTypeSelect) {
        expenseTypeSelect.addEventListener("change", toggleExpenseBillRequirement);
    }

    // Form Submit: Log a brand new, unplanned expense/bill for review (not one of the originally approved line items)
    document.getElementById("form-expense-line").addEventListener("submit", async function(e) {
        e.preventDefault();

        const activeEb = state.eventBudgets.find(eb => eb.id === activeEventBudgetId);
        if (!activeEb) return;

        const itemName = document.getElementById("expense-item-name").value;
        const type = document.getElementById("expense-type").value;
        const category = document.getElementById("expense-category").value;
        const amount = parseInt(document.getElementById("expense-amount").value);
        const fileInput = document.getElementById("expense-bill-file");
        const billFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

        if (type !== "Prize Money" && !billFile) {
            alert("Please upload a bill/receipt for this expense (only Prize Money entries can skip this).");
            return;
        }

        if (isFileTooLarge(billFile)) {
            alert(`Bill file is too large — please upload something under ${MAX_UPLOAD_MB}MB.`);
            return;
        }

        if (isNaN(amount) || amount < 0) {
            alert("Enter a valid amount (0 or greater).");
            return;
        }

        try {
            const createdExp = await Api.createExpense(activeEb.id, {
                item_name: itemName, type, category, approved_amount: amount,
                source: "manual", bill_file_name: billFile ? billFile.name : null,
            });
            if (billFile && createdExp && createdExp.id) {
                await Api.uploadExpenseBill(createdExp.id, amount, billFile);
            }
        } catch (err) {
            showToast(`Couldn't log expense: ${err.detail || err.message}`, "danger");
            return;
        }

        await loadState();
        closeModal("modal-expense-line");
        renderAll();
        showToast(
            __session.role === "president"
                ? "Expense/bill logged and forwarded to the Faculty Coordinator for final approval."
                : "Expense/bill logged and approved.",
            "info"
        );
    });

    // Approve / Reject / Re-review / Close Event Finance actions on logged expenses
    // (first-level review for President, final-level review for Faculty Coordinator)
    document.getElementById("split-expenses-tbody").addEventListener("click", async function(e) {
        const approveBtn = e.target.closest(".approve-expense-btn");
        const rejectBtn = e.target.closest(".reject-expense-btn");
        const resetBtn = e.target.closest(".reset-expense-btn");
        const closeBtn = e.target.closest("#btn-close-event-finance");

        const activeEb = state.eventBudgets.find(eb => eb.id === activeEventBudgetId);
        if (!activeEb) return;

        // Every branch below mutates money server-side, then reloads state
        // from the backend so club/event totals and the ledger stay exactly
        // in sync with what app.routers.finance actually computed.
        if (approveBtn && __session.role === "president") {
            const expId = numAttr(approveBtn, "data-id");
            const exp = activeEb.expenses.find(x => x.id === expId);
            if (exp && exp.status === "Pending President Review") {
                const overBudget = exp.billAmount > exp.approvedAmount;
                const confirmMsg = overBudget
                    ? `Warning: the amount (${formatCurrency(exp.billAmount)}) exceeds the approved amount (${formatCurrency(exp.approvedAmount)}) for "${exp.itemName}".\n\nApprove and forward to the Faculty Coordinator anyway?`
                    : `Approve "${exp.itemName}" — ${formatCurrency(exp.billAmount)}? This forwards it to the Faculty Coordinator for final approval.`;
                if (!confirm(confirmMsg)) return;
                try {
                    await Api.presidentReviewExpense(expId, true);
                } catch (err) {
                    showToast(`Couldn't approve "${exp.itemName}": ${err.detail || err.message}`, "danger");
                    return;
                }
                await loadState();
                renderAll();
                showToast(`Approved "${exp.itemName}" — forwarded to the Faculty Coordinator.`);
            }
            return;
        }

        if (approveBtn && __session.role === "facultycoordinator") {
            const expId = numAttr(approveBtn, "data-id");
            const exp = activeEb.expenses.find(x => x.id === expId);
            if (exp && exp.status === "Pending Faculty Review") {
                const overBudget = exp.billAmount > exp.approvedAmount;
                const confirmMsg = overBudget
                    ? `Warning: the bill amount (${formatCurrency(exp.billAmount)}) exceeds the approved amount (${formatCurrency(exp.approvedAmount)}) for "${exp.itemName}".\n\nApprove anyway?`
                    : `Give final approval to "${exp.itemName}" — ${formatCurrency(exp.billAmount)}? This will be added to the event's total expenses.`;
                if (!confirm(confirmMsg)) return;
                try {
                    await Api.facultyReviewExpense(expId, true);
                } catch (err) {
                    showToast(`Couldn't approve "${exp.itemName}": ${err.detail || err.message}`, "danger");
                    return;
                }

                // Close out the linked Bill Upload task (if any) — the volunteer's job is done now.
                // (tasks are a local-only feature, not part of the finance backend.)
                const linkedTask = (activeEb.tasks || []).find(t => t.type === "Bill Upload" && t.expenseId === exp.id);
                if (linkedTask && linkedTask.status !== "Assigned") linkedTask.status = "Verified";

                await loadState();
                renderAll();
                showToast(`Approved "${exp.itemName}" — ${formatCurrency(exp.billAmount)}.`);
            }
            return;
        }

        if (rejectBtn) {
            const expId = numAttr(rejectBtn, "data-id");
            const exp = activeEb.expenses.find(x => x.id === expId);
            const expectedStatus = __session.role === "president" ? "Pending President Review" : "Pending Faculty Review";
            if (exp && exp.status === expectedStatus) {
                if (!confirm(`Reject "${exp.itemName}" (${formatCurrency(exp.billAmount)})? The club head can revise and resend it.`)) return;
                const reviewFn = __session.role === "president" ? Api.presidentReviewExpense : Api.facultyReviewExpense;
                try {
                    await reviewFn(expId, false);
                } catch (err) {
                    showToast(`Couldn't reject "${exp.itemName}": ${err.detail || err.message}`, "danger");
                    return;
                }
                await loadState();
                renderAll();
                showToast(`Rejected "${exp.itemName}".`, "danger");
            }
            return;
        }

        if (resetBtn && __session.role === "facultycoordinator") {
            const expId = numAttr(resetBtn, "data-id");
            const exp = activeEb.expenses.find(x => x.id === expId);
            if (exp && exp.status === "Approved") {
                try {
                    await Api.resetExpense(expId);
                } catch (err) {
                    showToast(`Couldn't re-open "${exp.itemName}": ${err.detail || err.message}`, "danger");
                    return;
                }
                await loadState();
                renderAll();
                showToast(`"${exp.itemName}" re-opened for review.`, "info");
            }
            return;
        }

        if (closeBtn) {
            const hasUnreviewed = activeEb.expenses.some(x => ["Awaiting Bill", "Draft", "Pending President Review", "Pending Faculty Review"].includes(x.status));
            if (hasUnreviewed || activeEb.status === "Closed") return;

            const totalBillApproved = getApprovedExpenseTotal(activeEb);
            const unusedAmt = Math.max(activeEb.allotted - totalBillApproved, 0);

            if (!confirm(`Close event finances for "${activeEb.eventName}"?\n\nTotal approved bills: ${formatCurrency(totalBillApproved)}${unusedAmt > 0 ? `\nUnused budget of ${formatCurrency(unusedAmt)} will be returned to ${activeEb.club}'s pool.` : ''}`)) return;

            try {
                await Api.closeEventBudget(activeEb.id);
            } catch (err) {
                showToast(`Couldn't close "${activeEb.eventName}": ${err.detail || err.message}`, "danger");
                return;
            }
            await loadState();
            renderAll();
            showToast(`Event "${activeEb.eventName}" finances closed.${unusedAmt > 0 ? ` ${formatCurrency(unusedAmt)} returned to ${activeEb.club}'s budget.` : ''}`);
            return;
        }
    });

    // -------------------------------------------------------------
    // EVENT PROPOSALS REVIEW BINDINGS
    // -------------------------------------------------------------
    // Click gallery proposal card
    const galleryGrid = document.getElementById("proposals-gallery-grid");
    if (galleryGrid) {
        galleryGrid.addEventListener("click", function(e) {
            const card = e.target.closest(".proposal-card");
            if (card) {
                activeProposalId = numAttr(card, "data-id");
                renderProposals();
            }
        });
    }

    const approvedGrid = document.getElementById("proposals-approved-grid");
    if (approvedGrid) {
        approvedGrid.addEventListener("click", function(e) {
            const card = e.target.closest(".proposal-card");
            if (card) {
                activeProposalId = numAttr(card, "data-id");
                renderProposals();
            }
        });
    }

    // Back button click
    const btnBack = document.getElementById("btn-back-to-gallery");
    if (btnBack) {
        btnBack.addEventListener("click", () => {
            activeProposalId = null;
            renderProposals();
        });
    }

    // Dynamic input persistence for proposal details using event delegation.
    // President writes to the primary status/comment/suggestion fields; Faculty
    // Coordinator writes to its own facultyStatus/facultyComment fields so
    // neither role's decision overwrites the other's on the same item.
    const reviewCard = document.getElementById("proposal-review-card");
    if (reviewCard && __session.role === "president") {
        reviewCard.addEventListener("change", function(e) {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (!prop) return;

            // Venue changes
            if (e.target.classList.contains("venue-decision-select")) {
                prop.venue.status = e.target.value;
                // Clear suggestion if not suggesting
                if (e.target.value !== "Suggest a different venue") {
                    prop.venue.suggestion = "";
                }
                saveState();
                renderProposals();
            } else if (e.target.classList.contains("venue-capacity-select")) {
                prop.venue.capacityRequired = parseInt(e.target.value) || 0;
                saveState();
            } else if (e.target.classList.contains("venue-suggestion-select")) {
                prop.venue.suggestion = e.target.value;
                saveState();
            }

            // Inventory changes
            if (e.target.classList.contains("inv-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.inventoryRequirements[idx]) {
                    prop.inventoryRequirements[idx].status = e.target.value;
                    saveState();
                    renderProposals();
                }
            }

            // Procuring changes
            if (e.target.classList.contains("proc-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.procuringItems[idx]) {
                    prop.procuringItems[idx].status = e.target.value;
                    saveState();
                    renderProposals();
                }
            }

            // Prize changes
            if (e.target.classList.contains("prize-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.prizeMoney[idx]) {
                    prop.prizeMoney[idx].status = e.target.value;
                    saveState();
                    renderProposals();
                }
            }

            // Judge changes
            if (e.target.classList.contains("judge-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.judgeFees[idx]) {
                    prop.judgeFees[idx].status = e.target.value;
                    saveState();
                    renderProposals();
                }
            }
        });

        reviewCard.addEventListener("input", function(e) {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (!prop) return;

            // Inventory suggestion input
            if (e.target.classList.contains("inv-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.inventoryRequirements[idx]) {
                    prop.inventoryRequirements[idx].comment = e.target.value;
                    saveState();
                }
            }

            // Procuring suggestion input
            if (e.target.classList.contains("proc-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.procuringItems[idx]) {
                    prop.procuringItems[idx].comment = e.target.value;
                    saveState();
                }
            }

            // Prize suggestion input
            if (e.target.classList.contains("prize-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.prizeMoney[idx]) {
                    prop.prizeMoney[idx].comment = e.target.value;
                    saveState();
                }
            }

            // Judge suggestion input
            if (e.target.classList.contains("judge-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.judgeFees[idx]) {
                    prop.judgeFees[idx].comment = e.target.value;
                    saveState();
                }
            }

            // General suggestions text box
            if (e.target.id === "proposal-feedback") {
                prop.generalSuggestions = e.target.value;
                saveState();
            }
        });
    } else if (reviewCard) {
        reviewCard.addEventListener("change", function(e) {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (!prop) return;

            // Venue changes (FC's own decision — separate from the President's
            // prop.venue.status, stored in facultyStatus so neither overwrites
            // the other)
            if (e.target.classList.contains("venue-decision-select")) {
                prop.venue.facultyStatus = e.target.value;
                if (e.target.value !== "Suggest a different venue") {
                    prop.venue.facultyComment = "";
                }
                saveState();
                renderProposals();
            } else if (e.target.classList.contains("venue-capacity-select")) {
                prop.venue.capacityRequired = parseInt(e.target.value) || 0;
                saveState();
            }

            // Inventory changes
            if (e.target.classList.contains("inv-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.inventoryRequirements[idx]) {
                    prop.inventoryRequirements[idx].facultyStatus = e.target.value;
                    saveState();
                    renderProposals();
                }
            }

            // Procuring changes
            if (e.target.classList.contains("proc-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.procuringItems[idx]) {
                    prop.procuringItems[idx].facultyStatus = e.target.value;
                    saveState();
                    renderProposals();
                }
            }

            // Prize changes
            if (e.target.classList.contains("prize-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.prizeMoney[idx]) {
                    prop.prizeMoney[idx].facultyStatus = e.target.value;
                    saveState();
                    renderProposals();
                }
            }

            // Judge changes
            if (e.target.classList.contains("judge-decision-select")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.judgeFees[idx]) {
                    prop.judgeFees[idx].facultyStatus = e.target.value;
                    saveState();
                    renderProposals();
                }
            }
        });

        reviewCard.addEventListener("input", function(e) {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (!prop) return;

            // Venue suggestion input
            if (e.target.classList.contains("venue-suggestion-input")) {
                prop.venue.facultyComment = e.target.value;
                saveState();
            }

            // Inventory suggestion input
            if (e.target.classList.contains("inv-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.inventoryRequirements[idx]) {
                    prop.inventoryRequirements[idx].facultyComment = e.target.value;
                    saveState();
                }
            }

            // Procuring suggestion input
            if (e.target.classList.contains("proc-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.procuringItems[idx]) {
                    prop.procuringItems[idx].facultyComment = e.target.value;
                    saveState();
                }
            }

            // Prize suggestion input
            if (e.target.classList.contains("prize-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.prizeMoney[idx]) {
                    prop.prizeMoney[idx].facultyComment = e.target.value;
                    saveState();
                }
            }

            // Judge suggestion input
            if (e.target.classList.contains("judge-suggestion-input")) {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                if (prop.judgeFees[idx]) {
                    prop.judgeFees[idx].facultyComment = e.target.value;
                    saveState();
                }
            }

            // Feedback box for requesting changes back to the President
            if (e.target.id === "proposal-feedback") {
                prop.facultyFeedback = e.target.value;
                saveState();
            }
        });
    }

    if (__session.role === "president") {
        // Overall Approve button
        document.getElementById("btn-approve-proposal").addEventListener("click", async () => {
            await approveProposal(activeProposalId);
        });

        // Send for Revision button — bounces the proposal back to the club/Club Head
        document.getElementById("btn-revise-proposal").addEventListener("click", async () => {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (prop) {
                if (confirm("Are you sure you want to send this proposal back for revision?")) {
                    // The feedback textarea (id="proposal-feedback") is present in
                    // the President view too -- use it as the revision reason.
                    const reason = document.getElementById("proposal-feedback") ? document.getElementById("proposal-feedback").value.trim() : "";

                    if (typeof Api !== "undefined" && typeof prop.id === "number") {
                        try {
                            await Api.sendForRevision(prop.id, reason || "Revision requested");
                        } catch (err) {
                            showToast(`Backend couldn't mark the proposal for revision: ${err.detail || err.message}`, "danger");
                        }
                    }

                    prop.status = "Needs Revision";
                    logHistory(prop, "Sent back for revision");
                    saveState();
                    alert(`Proposal "${prop.title}" sent back for revision.`);

                    activeProposalId = null;
                    goToProposalsGallery();
                    renderAll();
                }
            }
        });

        // Reject button
        document.getElementById("btn-reject-proposal").addEventListener("click", async () => {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (prop) {
                if (confirm("Are you sure you want to reject this event proposal entirely?")) {
                    const reason = document.getElementById("proposal-feedback") ? document.getElementById("proposal-feedback").value.trim() : "";
                    prop.status = "Rejected";
                    logHistory(prop, "Rejected by President");

                    if (typeof Api !== "undefined" && typeof prop.id === "number") {
                        try { await Api.presidentReview(prop.id, false, reason); } catch (err) { console.warn("Backend president review error:", err); }
                    }
                    await revertProposalResources(prop);

                    saveState();
                    await loadState();

                    activeProposalId = null;
                    goToProposalsGallery();
                    renderAll();
                    showToast(`Proposal "${prop.title}" has been rejected. Resources & budget reverted.`, "danger");
                }
            }
        });
    } else {
        // Final Approve button — Faculty Coordinator's final sign-off. When the
        // proposal needed extra budget (President couldn't approve directly),
        // this instead tops up the club's budget and finalizes in one step.
        document.getElementById("btn-approve-proposal").addEventListener("click", async () => {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (!prop || prop.status !== "Pending Faculty Approval") return;

            if (prop.needsExtraBudget) {
                const topUpInput = document.getElementById("fc-topup-amount");
                const topUpAmount = parseInt(topUpInput ? topUpInput.value : "0", 10);
                if (isNaN(topUpAmount) || topUpAmount <= 0) {
                    alert(`This event proposal requires an extra budget allocation (shortfall of ${formatCurrency(prop.budgetShortfall || 0)}). You must enter a valid positive top-up amount before approving.`);
                    return;
                }
                await approveWithBudgetTopUp(prop.id, topUpAmount);
                return;
            }

            if (!confirm(`Give final approval for "${prop.title}"? This finalizes the proposal.`)) return;
            if (typeof Api !== "undefined" && !isNaN(Number(prop.id))) {
                try {
                    await Api.facultyReview(Number(prop.id), true, "");
                } catch (err) {
                    console.warn("Backend faculty review error:", err);
                    showToast(`Backend approval error: ${err.detail || err.message}`, "danger");
                }
            }
            prop.status = "Approved";
            prop.facultyFeedback = "";
            logHistory(prop, "Final approval granted");
            saveState();
            await loadState();

            activeProposalId = null;
            goToProposalsGallery();
            renderAll();
            showToast(`"${prop.title}" has been given final approval.`);
        });

        // Request Changes button — sends the proposal back to the President with feedback.
        document.getElementById("btn-revise-proposal").addEventListener("click", async () => {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (!prop || prop.status !== "Pending Faculty Approval") return;

            const feedback = document.getElementById("proposal-feedback").value.trim();
            if (!feedback) {
                alert("Please describe what needs to change before requesting changes.");
                return;
            }
            if (!confirm(`Send "${prop.title}" back to the President with your feedback?`)) return;

            if (typeof Api !== "undefined" && typeof prop.id === "number") {
                try {
                    await Api.sendForRevision(prop.id, feedback);
                } catch (err) {
                    showToast(`Backend couldn't request changes: ${err.detail || err.message}`, "danger");
                }
            }

            prop.status = "Faculty Revision Requested";
            prop.facultyFeedback = feedback;
            logHistory(prop, "Changes requested by Faculty Coordinator");
            saveState();
            returnToProposalsGallery();
            renderAll();
            showToast(`"${prop.title}" sent back to the President for changes.`, "info");
        });

        // Reject Event button — rejects the whole proposal outright (e.g. for a
        // budget-escalated proposal the Faculty Coordinator doesn't want to fund).
        document.getElementById("btn-reject-proposal").addEventListener("click", async () => {
            const prop = state.proposals.find(p => p.id === activeProposalId);
            if (!prop || prop.status !== "Pending Faculty Approval") return;
            if (!confirm(`Reject "${prop.title}" entirely? This cannot be undone.`)) return;

            const reason = document.getElementById("proposal-feedback") ? document.getElementById("proposal-feedback").value.trim() : "";
            prop.status = "Rejected";
            prop.needsExtraBudget = false;
            logHistory(prop, "Rejected by Faculty Coordinator");

            if (typeof Api !== "undefined" && !isNaN(Number(prop.id))) {
                try { await Api.facultyReview(Number(prop.id), false, reason); } catch (err) { console.warn("Backend faculty review error:", err); }
            }
            await revertProposalResources(prop);

            saveState();
            await loadState();

            activeProposalId = null;
            goToProposalsGallery();
            renderAll();
            showToast(`"${prop.title}" has been rejected. Resources & budget reverted.`, "danger");
        });
    }

    // -------------------------------------------------------------
    // RESOURCES CALENDAR ACTIONS & BINDINGS
    // -------------------------------------------------------------
    const btnCalVenues = document.getElementById("btn-calendar-venues");
    const btnCalReqs = document.getElementById("btn-calendar-requirements");
    
    if (btnCalVenues && btnCalReqs) {
        btnCalVenues.addEventListener("click", () => {
            btnCalVenues.classList.add("active");
            btnCalReqs.classList.remove("active");
            calendarResourceType = "venues";
            document.getElementById("calendar-filter-title").textContent = "Filter Venues";
            
            // Reload checklist and render
            calendarSelectedVenues = null; // reset to default (select all)
            renderCalendarFilters();
            renderCalendarGrid();
        });

        btnCalReqs.addEventListener("click", () => {
            btnCalReqs.classList.add("active");
            btnCalVenues.classList.remove("active");
            calendarResourceType = "requirements";
            document.getElementById("calendar-filter-title").textContent = "Filter Requirements";
            
            // Reload checklist and render
            calendarSelectedRequirements = null; // reset to default (select all)
            renderCalendarFilters();
            renderCalendarGrid();
        });
    }

    // Checkbox list change delegation
    const checklistDiv = document.getElementById("calendar-checkboxes-list");
    if (checklistDiv) {
        checklistDiv.addEventListener("change", function(e) {
            const cb = e.target;
            if (cb && cb.name === "cal-filter-item") {
                const val = cb.value;
                if (calendarResourceType === "venues") {
                    if (cb.checked) {
                        if (!calendarSelectedVenues.includes(val)) calendarSelectedVenues.push(val);
                    } else {
                        calendarSelectedVenues = calendarSelectedVenues.filter(v => v !== val);
                    }
                } else {
                    if (cb.checked) {
                        if (!calendarSelectedRequirements.includes(val)) calendarSelectedRequirements.push(val);
                    } else {
                        calendarSelectedRequirements = calendarSelectedRequirements.filter(v => v !== val);
                    }
                }
                renderCalendarGrid();
            }
        });
    }

    // Select All filters button
    const btnSelectAllFilters = document.getElementById("btn-calendar-select-all");
    if (btnSelectAllFilters) {
        btnSelectAllFilters.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll('input[name="cal-filter-item"]');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
                const val = cb.value;
                if (calendarResourceType === "venues") {
                    if (!allChecked) {
                        if (!calendarSelectedVenues.includes(val)) calendarSelectedVenues.push(val);
                    } else {
                        calendarSelectedVenues = [];
                    }
                } else {
                    if (!allChecked) {
                        if (!calendarSelectedRequirements.includes(val)) calendarSelectedRequirements.push(val);
                    } else {
                        calendarSelectedRequirements = [];
                    }
                }
            });
            renderCalendarGrid();
        });
    }

    // Month Navigation
    const btnCalPrev = document.getElementById("calendar-nav-prev");
    const btnCalNext = document.getElementById("calendar-nav-next");
    const btnCalToday = document.getElementById("calendar-nav-today");

    if (btnCalPrev) {
        btnCalPrev.addEventListener("click", () => {
            calendarDate.setMonth(calendarDate.getMonth() - 1);
            renderCalendarGrid();
        });
    }
    if (btnCalNext) {
        btnCalNext.addEventListener("click", () => {
            calendarDate.setMonth(calendarDate.getMonth() + 1);
            renderCalendarGrid();
        });
    }
    if (btnCalToday) {
        btnCalToday.addEventListener("click", () => {
            calendarDate = new Date();
            renderCalendarGrid();
        });
    }

    // Calendar Days Grid click delegation for event items
    const daysGrid = document.getElementById("calendar-days-grid");
    if (daysGrid) {
        daysGrid.addEventListener("click", function(e) {
            const venueItem = e.target.closest('.calendar-event-item.venue-item');
            const reqItem = e.target.closest('.calendar-event-item.req-item');

            if (venueItem) {
                const bookingId = venueItem.getAttribute("data-booking-id");
                const booking = state.bookings.find(b => b.id === bookingId);
                if (booking) {
                    document.getElementById("cal-venue-name").textContent = booking.venueName;
                    
                    // Look up details for the venue (like capacity and location)
                    const venue = state.venues.find(v => v.id === booking.venueId || v.name === booking.venueName);
                    document.getElementById("cal-venue-location").textContent = venue ? venue.location : "Campus Main Ground";
                    
                    document.getElementById("cal-venue-club").textContent = booking.club;
                    document.getElementById("cal-venue-event").textContent = booking.event;
                    document.getElementById("cal-venue-date").textContent = formatDate(booking.date);
                    document.getElementById("cal-venue-time").textContent = formatTimeRange(booking.timeSlot);
                    
                    const reqListUl = document.getElementById("cal-venue-requirements");
                    reqListUl.innerHTML = "";
                    if (booking.requirements && booking.requirements.length > 0) {
                        booking.requirements.forEach(req => {
                            reqListUl.innerHTML += `<li>${escapeHtml(req)}</li>`;
                        });
                    } else {
                        reqListUl.innerHTML = `<li class="text-muted" style="list-style: none;">No special venue setup requirements approved.</li>`;
                    }
                    
                    openModal("modal-calendar-venue");
                }
                return;
            }

            if (reqItem) {
                const usageId = reqItem.getAttribute("data-usage-id");
                const usage = state.inventoryUsage.find(u => u.id === usageId);
                if (usage) {
                    document.getElementById("cal-req-log-id").value = usage.id;
                    document.getElementById("cal-req-name").textContent = usage.itemName;
                    document.getElementById("cal-req-qty").textContent = `Qty: ${usage.qty}`;
                    document.getElementById("cal-req-club").textContent = usage.club || "General / Other";
                    document.getElementById("cal-req-event").textContent = usage.event;
                    document.getElementById("cal-req-date").textContent = formatDate(usage.date);
                    document.getElementById("cal-req-time").textContent = 
                        (usage.timeStart && usage.timeEnd)
                            ? `${usage.timeStart} – ${usage.timeEnd}`
                            : (usage.timeRange || "All day usage");
                    
                    // Volunteer name is always read-only here — it's set only
                    // by the Club Head assigning and the volunteer accepting a
                    // Procurement task; no manual entry point exists anymore.
                    const assignedInput = document.getElementById("cal-req-assigned");
                    assignedInput.value = usage.volunteerName || "Volunteer not allotted";
                    assignedInput.readOnly = true;
                    const assignedNote = document.getElementById("cal-req-assigned-note");
                    assignedNote.textContent = usage.volunteerName
                        ? `Assigned via Club Head task allotment. This volunteer accepted the procurement task, so the name can't be edited manually here.`
                        : "Not yet assigned — this fills in automatically once the Club Head allots the procurement task and the volunteer accepts it.";
                    const saveBtn = document.getElementById("btn-cal-req-save");
                    if (saveBtn) saveBtn.style.display = "none";

                    openModal("modal-calendar-requirement");
                }
                return;
            }
        });
    }

    // Save Assignment form inside modal
    const formCalReq = document.getElementById("form-calendar-requirement");
    if (formCalReq) {
        formCalReq.addEventListener("submit", function(e) {
            e.preventDefault();
            const logId = document.getElementById("cal-req-log-id").value;
            const assignedVal = document.getElementById("cal-req-assigned").value;
            
            const usageIndex = state.inventoryUsage.findIndex(u => u.id === logId);
            if (usageIndex !== -1) {
                state.inventoryUsage[usageIndex].volunteerName = assignedVal;
                saveState();
                closeModal("modal-calendar-requirement");
                showToast("Procurement assignment updated successfully.");
                renderAll();
            }
        });
    }
}

// Calculate remaining inventory stock for a given item on a specific date+time range
// timeRange: "HH:MM - HH:MM" in 24hr format. Accounts for time overlaps precisely.
function getRemainingStockForDate(itemId, date, timeRange) {
    const item = state.inventory.find(i => i.id === itemId);
    if (!item) return 0;
    
    // Sum all usage allocations on the same date where the time ranges overlap
    const usedOverlapping = state.inventoryUsage
        .filter(u => {
            if (u.itemId !== itemId || u.date !== date) return false;
            if (u.status === 'Returned') return false; // returned items are available
            // If we have time info for both, do precise overlap check
            const usageTimeRange = u.timeRange || null;
            if (timeRange && usageTimeRange) {
                return timesOverlap(timeRange, usageTimeRange);
            }
            return true; // conservative fallback: assume conflict
        })
        .reduce((sum, u) => sum + u.qty, 0);
        
    return Math.max(item.totalStock - usedOverlapping, 0);
}


// ─────────────────────────────────────────────────────────────
// EVENT PROPOSALS REVIEW RENDERER & ACTIONS
// ─────────────────────────────────────────────────────────────
function renderProposals() {
    const galleryView = document.getElementById("proposals-gallery-view");
    const detailView = document.getElementById("proposals-detail-view");
    
    // ── 1. RENDER GALLERY VIEW ────────────────────────────────
    if (activeProposalId === null) {
        if (galleryView) galleryView.classList.remove("hidden");
        if (detailView) detailView.classList.add("hidden");

        const gridContainer = document.getElementById("proposals-gallery-grid");
        const approvedContainer = document.getElementById("proposals-approved-grid");
        if (!gridContainer || !approvedContainer) return;
        gridContainer.innerHTML = "";
        approvedContainer.innerHTML = "";

        const pendingCountSpan = document.getElementById("proposals-pending-count");
        const pendingCount = __session.role === "president"
            ? state.proposals.filter(p => p.status === "Pending" || p.status === "Pending President Review" || p.status === "Faculty Revision Requested").length
            : state.proposals.filter(p => p.status === "Pending Faculty Approval").length;
        if (pendingCountSpan) {
            pendingCountSpan.textContent = __session.role === "president" ? `${pendingCount} Pending` : `${pendingCount} Awaiting You`;
            pendingCountSpan.className = pendingCount > 0 ? "badge badge-warning" : "badge badge-success";
        }

        const filteredProposals = state.proposals.filter(prop => {
            if (globalQuery !== "") {
                const q = globalQuery.toLowerCase();
                return prop.title.toLowerCase().includes(q) ||
                       prop.organizer.toLowerCase().includes(q) ||
                       prop.venue.venueName.toLowerCase().includes(q);
            }
            return true;
        });

        const reviewProposals = filteredProposals.filter(p => p.status !== "Approved");
        const approvedProposals = filteredProposals.filter(p => p.status === "Approved");

        if (reviewProposals.length === 0) {
            gridContainer.innerHTML = `
                <div class="empty-state" style="grid-column: span 3; text-align: center; padding: 2rem; color: var(--text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; opacity: 0.5; margin-bottom: 0.5rem; display: block;"></i>
                    No proposals currently pending review.
                </div>
            `;
        } else {
            reviewProposals.forEach(prop => {
                let statusClass = "badge-warning";
                if (prop.status === "Needs Revision") statusClass = "badge-outline-warning";
                if (prop.status === "Rejected") statusClass = "badge-danger";
                if (prop.status === "Pending Faculty Approval") statusClass = "badge-info";
                if (prop.status === "Faculty Revision Requested") statusClass = "badge-outline-warning";

                const card = document.createElement("div");
                card.className = "proposal-card";
                card.setAttribute("data-id", prop.id);
                card.innerHTML = `
                    <div class="proposal-card-top">
                        <div class="proposal-card-title-row">
                            <h4 class="proposal-card-title">${escapeHtml(prop.title)}</h4>
                            <span class="badge ${statusClass}">${prop.status}</span>
                        </div>
                        <span class="proposal-card-organizer"><i class="fa-solid fa-users"></i> ${escapeHtml(prop.organizer)}</span>
                    </div>
                    <p class="proposal-card-desc-snippet" style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin: 0.4rem 0;">
                        ${escapeHtml(prop.desc.length > 90 ? prop.desc.substring(0, 90) + "..." : prop.desc)}
                    </p>
                    <div class="proposal-card-meta" style="border-top: 1px solid var(--border-color); padding-top: 0.6rem; margin-top: 0.4rem;">
                        <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(prop.venue.venueName)}</span>
                        <span><i class="fa-solid fa-calendar-day"></i> ${formatDate(prop.date)} &nbsp;<i class="fa-solid fa-clock" style="margin-left:0.3rem;"></i> ${formatTimeRange(prop.time)}</span>
                    </div>
                `;
                gridContainer.appendChild(card);
            });
        }

        if (approvedProposals.length === 0) {
            approvedContainer.innerHTML = `
                <div class="empty-state" style="grid-column: span 3; text-align: center; padding: 2rem; color: var(--text-muted);">
                    <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; opacity: 0.5; margin-bottom: 0.5rem; display: block;"></i>
                    No approved events yet.
                </div>
            `;
        } else {
            approvedProposals.forEach(prop => {
                const card = document.createElement("div");
                card.className = "proposal-card";
                card.setAttribute("data-id", prop.id);
                card.innerHTML = `
                    <div class="proposal-card-top">
                        <div class="proposal-card-title-row">
                            <h4 class="proposal-card-title">${escapeHtml(prop.title)}</h4>
                            <span class="badge badge-success">Approved</span>
                        </div>
                        <span class="proposal-card-organizer"><i class="fa-solid fa-users"></i> ${escapeHtml(prop.organizer)}</span>
                    </div>
                    <p class="proposal-card-desc-snippet" style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin: 0.4rem 0;">
                        ${escapeHtml(prop.desc.length > 90 ? prop.desc.substring(0, 90) + "..." : prop.desc)}
                    </p>
                    <div class="proposal-card-meta" style="border-top: 1px solid var(--border-color); padding-top: 0.6rem; margin-top: 0.4rem;">
                        <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(prop.venue.venueName)}</span>
                        <span><i class="fa-solid fa-calendar-day"></i> ${formatDate(prop.date)} &nbsp;<i class="fa-solid fa-clock" style="margin-left:0.3rem;"></i> ${formatTimeRange(prop.time)}</span>
                    </div>
                `;
                approvedContainer.appendChild(card);
            });
        }
        return;
    }

    // ── 2. RENDER DETAILS VIEW ────────────────────────────────
    if (galleryView) galleryView.classList.add("hidden");
    if (detailView) detailView.classList.remove("hidden");

    const prop = state.proposals.find(p => p.id === activeProposalId);
    if (!prop) return;

    // Set text contents
    document.getElementById("review-prop-title").textContent = prop.title;
    document.getElementById("review-prop-desc").textContent = prop.desc;
    document.getElementById("review-prop-club").textContent = prop.organizer;
    document.getElementById("review-prop-datetime").textContent = `${formatDate(prop.date)}  ·  ${formatTimeRange(prop.time)} (24hr)`;
    document.getElementById("review-prop-attendees").textContent = `${prop.estimatedParticipants} Expected`;
    document.getElementById("review-prop-submitted").textContent = formatDateTime(prop.submittedOn) || "—";
    document.getElementById("proposal-feedback").value = __session.role === "president" ? (prop.generalSuggestions || "") : (prop.facultyFeedback || "");

    const statusBadgeEl = document.getElementById("review-prop-status");
    let statusClass = "badge-warning";
    if (prop.status === "Approved") statusClass = "badge-success";
    if (prop.status === "Needs Revision") statusClass = "badge-outline-warning";
    if (prop.status === "Rejected") statusClass = "badge-danger";
    if (prop.status === "Pending Faculty Approval") statusClass = "badge-info";
    if (prop.status === "Faculty Revision Requested") statusClass = "badge-outline-warning";
    statusBadgeEl.className = `badge ${statusClass}`;
    statusBadgeEl.textContent = prop.status;

    if (__session.role === "president") {
        // Faculty Coordinator's requested-changes feedback, shown only while this proposal is back with the President
        const facultyFeedbackBanner = document.getElementById("proposal-faculty-feedback-banner");
        if (facultyFeedbackBanner) {
            const showFeedback = prop.status === "Faculty Revision Requested" && prop.facultyFeedback;
            facultyFeedbackBanner.style.display = showFeedback ? "" : "none";
            if (showFeedback) {
                document.getElementById("proposal-faculty-feedback-text").textContent = prop.facultyFeedback;
            }
        }
    }

    // Budget Summary — same 4-tile panel as Club Head's submit form
    // (shared/js/budget-summary.js), so allotted/remaining/asked line up
    // identically everywhere the proposal is reviewed.
    const summaryBanner = document.getElementById("proposal-summary-banner");
    if (summaryBanner) {
        const finance = state.clubsFinances.find(c => c.club === prop.organizer) || { allotted: 0, spent: 0 };
        const totalAsked = computeTotalAskedForProposal(prop);
        renderBudgetSummaryTiles(summaryBanner, { allotted: finance.allotted, spent: finance.spent, totalAsked });
    }

    if (__session.role === "facultycoordinator") {
        // Budget Escalation panel — only relevant when the President couldn't
        // approve directly because the club's remaining budget fell short.
        const escalationPanel = document.getElementById("fc-budget-escalation-panel");
        if (escalationPanel) {
            escalationPanel.style.display = prop.needsExtraBudget ? "" : "none";
            if (prop.needsExtraBudget) {
                const finance = state.clubsFinances.find(c => c.club === prop.organizer) || { allotted: 0, spent: 0 };
                const poolTotal = (state.facultyBudgetPool && state.facultyBudgetPool.total) || 0;
                const totalAllotted = state.clubsFinances.reduce((acc, c) => acc + c.allotted, 0);
                const poolAvailable = poolTotal - totalAllotted;
                const statsBanner = document.getElementById("fc-escalation-stats-banner");
                if (statsBanner) {
                    statsBanner.innerHTML = `
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-scale-unbalanced text-danger"></i>
                            <div>
                                <span class="prop-summary-lbl">Shortfall</span>
                                <span class="prop-summary-val" style="color:var(--danger);">${formatCurrency(prop.budgetShortfall || 0)}</span>
                            </div>
                        </div>
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-piggy-bank text-emerald"></i>
                            <div>
                                <span class="prop-summary-lbl">${escapeHtml(prop.organizer)}'s Remaining Budget</span>
                                <span class="prop-summary-val">${formatCurrency(finance.allotted - finance.spent)}</span>
                            </div>
                        </div>
                        <div class="prop-summary-item">
                            <i class="fa-solid fa-vault text-indigo"></i>
                            <div>
                                <span class="prop-summary-lbl">Faculty Pool Available</span>
                                <span class="prop-summary-val">${formatCurrency(poolAvailable)}</span>
                            </div>
                        </div>
                    `;
                }
                const topUpInput = document.getElementById("fc-topup-amount");
                if (topUpInput && !topUpInput.value) topUpInput.value = prop.budgetShortfall || 0;
            }
        }

        const approveBtnLabel = document.getElementById("btn-approve-proposal");
        if (approveBtnLabel) {
            approveBtnLabel.innerHTML = prop.needsExtraBudget
                ? '<i class="fa-solid fa-check-double"></i> Allot Budget &amp; Approve'
                : '<i class="fa-solid fa-check-double"></i> Final Approve';
        }
    }

    // Helper status chip generator
    const statusChip = (status) => {
        const map = {
            Pending:  ["res-chip-pending",  "fa-clock"],
            Approve: ["res-chip-approved", "fa-check"],
            Approved: ["res-chip-approved", "fa-check"],
            Disapprove: ["res-chip-rejected", "fa-xmark"],
            Reject: ["res-chip-rejected", "fa-xmark"],
            Rejected: ["res-chip-rejected", "fa-xmark"],
            Suggest: ["res-chip-modified", "fa-pen"],
            Modified: ["res-chip-modified", "fa-pen"]
        };
        const [cls, icon] = map[status] || ["res-chip-pending", "fa-clock"];
        return `<span class="res-status-chip ${cls}"><i class="fa-solid ${icon}"></i></span>`;
    };

    // Helper to generate capacity options
    const capacityOptions = [50, 100, 200, 500, 600, 1000, 1500];
    const capacitySelectHtml = `
        <select class="form-select venue-capacity-select inline-select" style="max-width: 140px;">
            ${capacityOptions.map(c => `<option value="${c}" ${prop.venue.capacityRequired === c ? "selected" : ""}>Cap: ${c} req.</option>`).join("")}
        </select>
    `;

    // ── Venue requested rendering ─────────────────────────────
    const venueContainer = document.getElementById("proposal-venue-container");
    if (venueContainer && __session.role === "president") {
        const isSuggesting = prop.venue.status === "Suggest a different venue";

        // Check if the requested venue itself has a time-conflicting confirmed booking
        const requestedVenueConflict = state.bookings.find(b =>
            b.venueId === prop.venue.venueId &&
            b.date === prop.date &&
            b.status === "Confirmed" &&
            timesOverlap(prop.time, b.timeSlot)
        );

        // Find other venues that are NOT time-conflicting on prop.date with prop.time
        const availableVenues = state.venues
            .filter(v => {
                if (v.id === prop.venue.venueId) return false;
                const conflict = state.bookings.find(b =>
                    b.venueId === v.id &&
                    b.date === prop.date &&
                    b.status === "Confirmed" &&
                    timesOverlap(prop.time, b.timeSlot)
                );
                return !conflict;
            });

        let suggestComponentHtml = "";
        if (isSuggesting) {
            suggestComponentHtml = `
                <select class="form-select venue-suggestion-select inline-select" style="width: 100%;">
                    <option value="">-- Select Available Venue --</option>
                    ${availableVenues.map(v => `<option value="${escapeHtml(v.name)}" ${prop.venue.suggestion === v.name ? "selected" : ""}>${escapeHtml(v.name)} (Cap: ${v.capacity})</option>`).join("")}
                </select>
            `;
        } else {
            suggestComponentHtml = `
                <input type="text" class="form-input venue-suggestion-input" placeholder="Suggestions will lock here..."
                       value="${escapeHtml(prop.venue.suggestion || "")}" disabled style="opacity: 0.5; font-size: 0.85rem; padding: 0.4rem 0.75rem;">
            `;
        }

        venueContainer.innerHTML = `
            <div class="venue-inline-row" style="display: flex; gap: 1rem; align-items: center; background-color: var(--bg-main); padding: 0.85rem 1.25rem; border-radius: var(--border-radius-md); border: 1px solid var(--border-color);">
                <div style="flex: 1.5; font-size: 0.9rem;">
                    <i class="fa-solid fa-location-dot text-indigo"></i> <strong>${escapeHtml(prop.venue.venueName)}</strong>
                    <span class="text-muted" style="font-size: 0.8rem;">(${escapeHtml(prop.venue.location)})</span>
                    ${requestedVenueConflict ? `<span class="badge badge-danger" style="margin-left:0.5rem; font-size:0.7rem;"><i class="fa-solid fa-triangle-exclamation"></i> Time Conflict</span>` : `<span class="badge badge-success" style="margin-left:0.5rem; font-size:0.7rem;"><i class="fa-solid fa-circle-check"></i> Available</span>`}
                </div>

                <div style="flex: 1;">
                    ${capacitySelectHtml}
                </div>

                <div style="flex: 1.2;">
                    <select class="form-select venue-decision-select inline-select" style="width: 100%;">
                        <option value="Pending" ${prop.venue.status === "Pending" ? "selected" : ""}>Pending Review</option>
                        <option value="Approve" ${prop.venue.status === "Approve" ? "selected" : ""}>Approve Booking</option>
                        <option value="Suggest a different venue" ${prop.venue.status === "Suggest a different venue" ? "selected" : ""}>Suggest a different venue</option>
                    </select>
                </div>

                <div style="flex: 1.8;">
                    ${suggestComponentHtml}
                </div>
            </div>
        `;
    } else if (venueContainer) {
        // NOTE: Faculty Coordinator reviews what was requested but does NOT see
        // venue availability / booked-time-conflict information or an "available
        // venues" suggestion list — that's the President's concern only. FC gives
        // its own independent per-item decision (defaults to "Approve"), stored in
        // a separate `facultyStatus`/`facultyComment` field so it never overwrites
        // the President's own `status`/`comment` decision on the same item.
        const venueFacultyStatus = prop.venue.facultyStatus || "Approve";
        const isSuggesting = venueFacultyStatus === "Suggest a different venue";

        venueContainer.innerHTML = `
            <div class="venue-inline-row" style="display: flex; gap: 1rem; align-items: center; background-color: var(--bg-main); padding: 0.85rem 1.25rem; border-radius: var(--border-radius-md); border: 1px solid var(--border-color);">
                <div style="flex: 1.5; font-size: 0.9rem;">
                    <i class="fa-solid fa-location-dot text-indigo"></i> <strong>${escapeHtml(prop.venue.venueName)}</strong>
                    <span class="text-muted" style="font-size: 0.8rem;">(${escapeHtml(prop.venue.location)})</span>
                </div>

                <div style="flex: 1;">
                    ${capacitySelectHtml}
                </div>

                <div style="flex: 1.2;">
                    <select class="form-select venue-decision-select inline-select" style="width: 100%;">
                        <option value="Approve" ${venueFacultyStatus === "Approve" ? "selected" : ""}>Approve</option>
                        <option value="Pending" ${venueFacultyStatus === "Pending" ? "selected" : ""}>Pending</option>
                        <option value="Suggest a different venue" ${venueFacultyStatus === "Suggest a different venue" ? "selected" : ""}>Suggest something</option>
                    </select>
                </div>

                <div style="flex: 1.8;">
                    <input type="text" class="form-input venue-suggestion-input" placeholder="Reason/suggestion..."
                           value="${prop.venue.facultyComment || ""}" ${isSuggesting ? "" : "disabled style='opacity: 0.5;'"} style="font-size: 0.85rem; padding: 0.4rem 0.75rem;">
                </div>
            </div>
        `;
    }

    // ── Inventory Requirements rendering ──────────────────────
    const reqsTbody = document.getElementById("proposal-requirements-tbody");
    reqsTbody.innerHTML = "";
    prop.inventoryRequirements.forEach((res, idx) => {
        const tr = document.createElement("tr");
        const rowStatus = __session.role === "president" ? res.status : (res.facultyStatus || "Approve");
        const isActionNeeded = rowStatus === "Reject" || rowStatus === "Suggest Change";

        // Calculate remaining stock for that date+time precisely (time collision aware) —
        // President-only; Faculty Coordinator's own review doesn't surface live stock figures.
        let stockCellHtml = "";
        if (__session.role === "president") {
            const remainingStock = getRemainingStockForDate(res.itemId, prop.date, prop.time);
            const stockOk = remainingStock >= res.qty;
            const stockTight = !stockOk && remainingStock > 0;
            const stockBadgeClass = stockOk ? "badge-success" : (stockTight ? "badge-warning" : "badge-danger");
            stockCellHtml = `
            <td>
                <span class="badge ${stockBadgeClass}" style="font-size: 0.8rem; font-weight: 700;" title="Stock available during ${formatTimeRange(prop.time)} on ${formatDate(prop.date)}">
                    ${remainingStock} avail.
                </span>
            </td>`;
        }

        tr.innerHTML = `
            <td><strong>${escapeHtml(res.name)}</strong></td>
            ${stockCellHtml}
            <td>${res.qty}</td>
            <td><span class="badge badge-info">${res.unit}</span></td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                    ${statusChip(rowStatus)}
                    <select class="form-select inv-decision-select inline-select" data-idx="${idx}">
                        <option value="Pending" ${rowStatus === "Pending" ? "selected" : ""}>Pending</option>
                        <option value="Approve" ${rowStatus === "Approve" ? "selected" : ""}>Approve</option>
                        <option value="Reject" ${rowStatus === "Reject" ? "selected" : ""}>Reject</option>
                        <option value="Suggest Change" ${rowStatus === "Suggest Change" ? "selected" : ""}>Suggest Change</option>
                    </select>
                </div>
            </td>
            <td>
                <input type="text" class="form-input inv-suggestion-input" data-idx="${idx}" placeholder="Reason/suggestion..."
                       value="${(__session.role === "president" ? res.comment : res.facultyComment) || ""}" ${isActionNeeded ? "" : "disabled style='opacity: 0.5;'"} style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">
            </td>
        `;
        reqsTbody.appendChild(tr);
    });

    // ── Procuring Items rendering ──────────────────────────────
    const procuringTbody = document.getElementById("proposal-procuring-tbody");
    procuringTbody.innerHTML = "";
    prop.procuringItems.forEach((res, idx) => {
        const tr = document.createElement("tr");
        const rowStatus = __session.role === "president" ? res.status : (res.facultyStatus || "Approve");
        const isActionNeeded = rowStatus === "Reject" || rowStatus === "Suggest Change";
        // Category color mapping
        const catColors = {
            "Venue & Infrastructure": "badge-outline-warning",
            "Media & Technology": "badge-indigo",
            "Materials & Consumables": "badge-success",
            "Food & Hospitality": "badge-warning",
            "Services & Human Resources": "badge-info"
        };
        const catBadgeClass = catColors[res.category] || "badge-outline-warning";
        tr.innerHTML = `
            <td><strong>${escapeHtml(res.name)}</strong><br><span class="badge ${catBadgeClass}" style="font-size:0.7rem; margin-top:0.2rem;">${escapeHtml(res.category || "Uncategorised")}</span></td>
            <td>${res.qty}</td>
            <td><span class="badge badge-indigo">${res.unit}</span></td>
            <td>${formatCurrency(res.pricePerUnit)}</td>
            <td><strong class="text-indigo">${formatCurrency(res.qty * res.pricePerUnit)}</strong></td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                    ${statusChip(rowStatus)}
                    <select class="form-select proc-decision-select inline-select" data-idx="${idx}">
                        <option value="Pending" ${rowStatus === "Pending" ? "selected" : ""}>Pending</option>
                        <option value="Approve" ${rowStatus === "Approve" ? "selected" : ""}>Approve</option>
                        <option value="Reject" ${rowStatus === "Reject" ? "selected" : ""}>Reject</option>
                        <option value="Suggest Change" ${rowStatus === "Suggest Change" ? "selected" : ""}>Suggest Change</option>
                    </select>
                </div>
            </td>
            <td>
                <input type="text" class="form-input proc-suggestion-input" data-idx="${idx}" placeholder="Reason/suggestion..."
                       value="${(__session.role === "president" ? res.comment : res.facultyComment) || ""}" ${isActionNeeded ? "" : "disabled style='opacity: 0.5;'"} style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">
            </td>
        `;
        procuringTbody.appendChild(tr);
    });

    // ── Prize Money rendering ────────────────────────────────
    const prizeTbody = document.getElementById("proposal-prizes-tbody");
    prizeTbody.innerHTML = "";
    prop.prizeMoney.forEach((res, idx) => {
        const tr = document.createElement("tr");
        const rowStatus = __session.role === "president" ? res.status : (res.facultyStatus || "Approve");
        const isActionNeeded = rowStatus === "Disapprove" || rowStatus === "Suggest Changes";
        tr.innerHTML = `
            <td><strong>${escapeHtml(res.position)}</strong></td>
            <td><strong class="text-indigo">${formatCurrency(res.amount)}</strong></td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                    ${statusChip(rowStatus)}
                    <select class="form-select prize-decision-select inline-select" data-idx="${idx}">
                        <option value="Pending" ${rowStatus === "Pending" ? "selected" : ""}>Pending</option>
                        <option value="Approve" ${rowStatus === "Approve" ? "selected" : ""}>Approve</option>
                        <option value="Disapprove" ${rowStatus === "Disapprove" ? "selected" : ""}>Disapprove</option>
                        <option value="Suggest Changes" ${rowStatus === "Suggest Changes" ? "selected" : ""}>Suggest Changes</option>
                    </select>
                </div>
            </td>
            <td>
                <input type="text" class="form-input prize-suggestion-input" data-idx="${idx}" placeholder="Reason/suggestion..."
                       value="${(__session.role === "president" ? res.comment : res.facultyComment) || ""}" ${isActionNeeded ? "" : "disabled style='opacity: 0.5;'"} style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">
            </td>
        `;
        prizeTbody.appendChild(tr);
    });

    // ── Judge Fees rendering ─────────────────────────────────
    const judgeTbody = document.getElementById("proposal-judges-tbody");
    judgeTbody.innerHTML = "";
    prop.judgeFees.forEach((res, idx) => {
        const tr = document.createElement("tr");
        const rowStatus = __session.role === "president" ? res.status : (res.facultyStatus || "Approve");
        const isActionNeeded = rowStatus === "Disapprove" || rowStatus === "Suggest Changes";
        tr.innerHTML = `
            <td><strong>${escapeHtml(res.name)}</strong></td>
            <td>${res.qty}</td>
            <td>${formatCurrency(res.feePerJudge)}</td>
            <td><strong class="text-indigo">${formatCurrency(res.qty * res.feePerJudge)}</strong></td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                    ${statusChip(rowStatus)}
                    <select class="form-select judge-decision-select inline-select" data-idx="${idx}">
                        <option value="Pending" ${rowStatus === "Pending" ? "selected" : ""}>Pending</option>
                        <option value="Approve" ${rowStatus === "Approve" ? "selected" : ""}>Approve</option>
                        <option value="Disapprove" ${rowStatus === "Disapprove" ? "selected" : ""}>Disapprove</option>
                        <option value="Suggest Changes" ${rowStatus === "Suggest Changes" ? "selected" : ""}>Suggest Changes</option>
                    </select>
                </div>
            </td>
            <td>
                <input type="text" class="form-input judge-suggestion-input" data-idx="${idx}" placeholder="Reason/suggestion..."
                       value="${(__session.role === "president" ? res.comment : res.facultyComment) || ""}" ${isActionNeeded ? "" : "disabled style='opacity: 0.5;'"} style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">
            </td>
        `;
        judgeTbody.appendChild(tr);
    });

    if (__session.role === "president") {
        // Disable overall decision actions once the President's part is done: finalised
        // (Approved/Rejected/Needs Revision) or currently awaiting the Faculty Coordinator's
        // sign-off. Re-enabled automatically if the Faculty Coordinator requests changes.
        const isFinalised = prop.status === "Approved" || prop.status === "Rejected" ||
            prop.status === "Needs Revision" || prop.status === "Pending Faculty Approval";
        document.getElementById("btn-approve-proposal").disabled = isFinalised;
        document.getElementById("btn-revise-proposal").disabled = isFinalised;
        document.getElementById("btn-reject-proposal").disabled = isFinalised;

        // Enable/disable individual resource review dropdowns and input comments based on overall status
        document.querySelectorAll(".res-decision-select, .venue-decision-select, .venue-capacity-select, .inv-decision-select, .proc-decision-select, .prize-decision-select, .judge-decision-select, .inv-suggestion-input, .proc-suggestion-input, .prize-suggestion-input, .judge-suggestion-input, #proposal-feedback, .venue-suggestion-select, .venue-suggestion-input").forEach(el => {
            el.disabled = isFinalised;
            if (isFinalised && el.tagName === "INPUT") {
                el.style.opacity = "0.5";
            }
        });
    } else {
        // Faculty Coordinator only acts once the President has reserved resources and
        // sent the proposal over. FC gives its OWN independent per-item decision
        // (facultyStatus, defaulting to "Approve") — only the venue capacity figure
        // (a President-only planning detail) stays locked.
        const canFacultyAct = prop.status === "Pending Faculty Approval";
        document.getElementById("btn-approve-proposal").disabled = !canFacultyAct;
        document.getElementById("btn-revise-proposal").disabled = !canFacultyAct;
        document.getElementById("btn-reject-proposal").disabled = !canFacultyAct;

        document.querySelectorAll(".venue-capacity-select").forEach(el => { el.disabled = true; });

        document.querySelectorAll(".venue-decision-select, .inv-decision-select, .proc-decision-select, .prize-decision-select, .judge-decision-select").forEach(el => {
            el.disabled = !canFacultyAct;
        });
        document.querySelectorAll(".venue-suggestion-input, .inv-suggestion-input, .proc-suggestion-input, .prize-suggestion-input, .judge-suggestion-input").forEach(el => {
            // Suggestion inputs are only meaningfully editable when both FC can act
            // AND that item's own facultyStatus needs a reason (already reflected by
            // whether the render left them un-disabled above); just add the act-gate.
            if (!canFacultyAct) {
                el.disabled = true;
                el.style.opacity = "0.5";
            }
        });

        // Feedback box is only meant for the "Request Changes" action
        document.getElementById("proposal-feedback").disabled = !canFacultyAct;

        // Context banner explaining why the buttons are disabled, when applicable
        const contextBanner = document.getElementById("proposal-faculty-context-banner");
        if (contextBanner) {
            let msg = "";
            if (prop.status === "Pending") msg = "Awaiting the President's initial review — not yet ready for your sign-off.";
            else if (prop.status === "Faculty Revision Requested") msg = "Sent back to the President with your feedback — awaiting their re-review.";
            else if (prop.status === "Needs Revision") msg = "The President sent this back to the club for revision.";
            else if (prop.status === "Rejected") msg = "This proposal has been rejected.";
            else if (prop.status === "Approved") msg = "Finalized — no further action needed.";
            contextBanner.style.display = canFacultyAct ? "none" : "";
            document.getElementById("proposal-faculty-context-text").textContent = msg;
        }
    }
}

// Switches the sidebar/tab back to the Event Proposals gallery (used after any
// proposal decision action returns the user to the list). President-only —
// see returnToProposalsGallery() for the Faculty Coordinator equivalent.
function goToProposalsGallery() {
    document.querySelectorAll(".sidebar .nav-link").forEach(l => l.classList.remove("active"));
    const proposalsLink = document.querySelector('.sidebar .nav-link[data-tab="proposals"]');
    if (proposalsLink) proposalsLink.classList.add("active");

    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));
    const paneEl = document.getElementById("tab-proposals");
    if (paneEl) paneEl.classList.add("active");

    const pageTitle = document.getElementById("page-title");
    const pageSubtitle = document.getElementById("page-subtitle");
    if (pageTitle) pageTitle.textContent = "Event Proposals Audit";
    if (pageSubtitle) pageSubtitle.textContent = "Review student club event proposals, approve resource allocations, adjust funding splits, or request revisions.";
}

// Returns to the proposals gallery pane — used after the Faculty Coordinator
// finalizes, rejects, or sends back a proposal. President-only pages use
// goToProposalsGallery() above instead.
function returnToProposalsGallery() {
    activeProposalId = null;
    document.querySelectorAll(".sidebar .nav-link").forEach(l => l.classList.remove("active"));
    const proposalsLink = document.querySelector('.sidebar .nav-link[data-tab="proposals"]');
    if (proposalsLink) proposalsLink.classList.add("active");
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));
    const paneEl = document.getElementById("tab-proposals");
    if (paneEl) paneEl.classList.add("active");
    const pageTitle = document.getElementById("page-title");
    const pageSubtitle = document.getElementById("page-subtitle");
    if (pageTitle) pageTitle.textContent = "Event Proposals Audit";
    if (pageSubtitle) pageSubtitle.textContent = "Give final approval on proposals the President has reserved resources for, or send them back with feedback.";
}

// President-only — reviews/reserves resources and forwards the proposal to
// "Pending Faculty Approval", with a budget-shortfall detour to the Faculty
// Coordinator's discretionary top-up flow (approveWithBudgetTopUp below).
// Creates the backend EventBudget + its Expense line items for a proposal's
// approved procuring items/prize money/judge fees (see app.routers.finance).
// Shared by approveProposal() and finalizeProposalResources() since both run
// the exact same resource-reservation step, just from different approval
// paths (direct President approval vs. Faculty Coordinator budget top-up).
async function persistProposalEventBudget(prop) {
    const cf = state.clubsFinances.find(c => c.club === prop.organizer);
    if (!cf) return;

    const expensesToCreate = [];
    prop.procuringItems.forEach(res => {
        if (res.status === "Approve") {
            expensesToCreate.push({
                item_name: res.name, type: "Self-Procured Expense", category: res.category || "Miscellaneous",
                approved_amount: res.overallPrice, source: "proposal"
            });
        }
    });
    prop.prizeMoney.forEach(res => {
        if (res.status === "Approve") {
            expensesToCreate.push({
                item_name: `Prize money: ${res.position}`, type: "Prize Money", category: "Miscellaneous",
                approved_amount: res.amount, source: "proposal"
            });
        }
    });
    prop.judgeFees.forEach(res => {
        if (res.status === "Approve") {
            expensesToCreate.push({
                item_name: res.name, type: "Judge/Guest Fee", category: "Speakers / Honorarium",
                approved_amount: res.overallPrice, source: "proposal"
            });
        }
    });

    try {
        const proposalId = typeof prop.id === "number" ? prop.id : null;
        const eb = await Api.createEventBudget(cf.id, prop.title, 0, proposalId);
        for (const exp of expensesToCreate) {
            await Api.createExpense(eb.id, exp);
        }
    } catch (err) {
        showToast(`Couldn't reserve event budget for "${prop.title}": ${err.detail || err.message}`, "danger");
    }
}

async function revertProposalResources(prop) {
    if (!prop) return;

    // 1. Revert Venue Bookings
    const relatedBookings = (state.bookings || []).filter(b => b.event === prop.title || (b.club === prop.organizer && b.date === prop.date));
    for (const b of relatedBookings) {
        b.status = "Cancelled";
        if (typeof Api !== "undefined" && !isNaN(Number(b.id))) {
            try { await Api.updateBookingStatus(Number(b.id), "Cancelled"); } catch (e) {}
        }
    }

    // 2. Revert Inventory Usage
    const relatedUsage = (state.inventoryUsage || []).filter(u => u.event === prop.title);
    for (const u of relatedUsage) {
        u.status = "Returned";
        if (typeof Api !== "undefined" && !isNaN(Number(u.id))) {
            try { await Api.returnInventoryUsage(Number(u.id)); } catch (e) {}
        }
    }

    // 3. Revert Event Budget & Expenses
    const eb = (state.eventBudgets || []).find(e => e.eventName === prop.title || e.proposalId === prop.id);
    if (eb) {
        if (typeof Api !== "undefined" && !isNaN(Number(eb.id))) {
            try {
                await Api.deleteEventBudget(Number(eb.id));
            } catch (e) {
                console.warn("Could not revert event budget on backend:", e);
            }
        }
        state.eventBudgets = state.eventBudgets.filter(e => e.id !== eb.id);
    }
    prop.resourcesReserved = false;
}

async function approveProposal(propId) {
    const prop = state.proposals.find(p => p.id === propId);
    if (!prop) return;

    if (prop.status === "Approved" || prop.status === "Pending Faculty Approval") {
        alert("This event proposal has already been sent to the Faculty Coordinator!");
        activeProposalId = null;
        renderAll();
        return;
    }

    // Verify all decisions have been reviewed (no items left as Pending)
    const hasPendingVenue = prop.venue.status === "Pending";
    const hasPendingInv = prop.inventoryRequirements.some(r => r.status === "Pending");
    const hasPendingProc = prop.procuringItems.some(r => r.status === "Pending");
    const hasPendingPrize = prop.prizeMoney.some(r => r.status === "Pending");
    const hasPendingJudge = prop.judgeFees.some(r => r.status === "Pending");

    if (hasPendingVenue || hasPendingInv || hasPendingProc || hasPendingPrize || hasPendingJudge) {
        let pendingFields = [];
        if (hasPendingVenue) pendingFields.push("Venue Booking Request");
        if (hasPendingInv) pendingFields.push("Inventory Requirements");
        if (hasPendingProc) pendingFields.push("Procuring Items");
        if (hasPendingPrize) pendingFields.push("Prize Money Request");
        if (hasPendingJudge) pendingFields.push("Judge / Guest Fee Request");

        alert("Please make a decision (Approve / Disapprove / Suggest Change) for all sections before approving the overall proposal. Missing decisions in:\n\n- " + pendingFields.join("\n- "));
        return;
    }

    // Budget-sufficiency check — the approved amount (what's about to be
    // reserved below) vs. the club's *current* remaining budget. If the club
    // can't cover it, the President cannot finalize this normally; it routes
    // to the Faculty Coordinator tagged for a discretionary budget top-up
    // instead (see faculty_coordinator_dashboard's approveWithBudgetTopUp).
    const approvedAsk = prop.procuringItems.reduce((s, r) => s + (r.status === "Approve" ? r.overallPrice : 0), 0)
        + prop.prizeMoney.reduce((s, r) => s + (r.status === "Approve" ? r.amount : 0), 0)
        + prop.judgeFees.reduce((s, r) => s + (r.status === "Approve" ? r.overallPrice : 0), 0);
    const clubFinance = state.clubsFinances.find(c => c.club === prop.organizer) || { allotted: 0, spent: 0 };
    const remainingBudget = clubFinance.allotted - clubFinance.spent;

    if (approvedAsk > remainingBudget) {
        if (!confirm(`Warning: This event proposal requires ${formatCurrency(approvedAsk)}, but ${prop.organizer} only has ${formatCurrency(remainingBudget)} left in its allotted budget (shortfall of ${formatCurrency(approvedAsk - remainingBudget)}).\n\nSend this event proposal to the Faculty Coordinator to request extra budget allocation?`)) {
            return;
        }
        prop.status = "Pending Faculty Approval";
        prop.needsExtraBudget = true;
        prop.budgetShortfall = approvedAsk - remainingBudget;
        prop.facultyFeedback = "";
        logHistory(prop, "Sent to Faculty Coordinator for extra budget allocation");
        if (typeof Api !== "undefined" && !isNaN(Number(prop.id))) {
            try { await Api.presidentReview(Number(prop.id), true, ""); } catch (err) { console.warn("Backend president review error:", err); }
        }
        saveState();
        activeProposalId = null;
        goToProposalsGallery();
        renderAll();
        showToast(`"${prop.title}" exceeds club budget — sent to Faculty Coordinator for extra budget allocation.`, "warning");
        return;
    }

    if (!confirm("Approve this event proposal and reserve its venue/inventory? It will then be sent to the Faculty Coordinator for final sign-off.")) {
        return;
    }

    // Update status — the President's approval reserves resources but does not
    // finalize the proposal; the Faculty Coordinator holds final sign-off (see
    // faculty_coordinator_dashboard).
    prop.status = "Pending Faculty Approval";
    prop.needsExtraBudget = false;
    prop.facultyFeedback = "";
    logHistory(prop, "Approved by President — sent for final sign-off");

    if (typeof Api !== "undefined" && !isNaN(Number(prop.id))) {
        try { await Api.presidentReview(Number(prop.id), true, ""); } catch (err) { console.warn("Backend president review error:", err); }
    }

    // If the Faculty Coordinator requested changes and the President is simply
    // re-sending it, the venue/inventory/budget were already reserved the first
    // time around — reserving them again would double-book everything.
    if (prop.resourcesReserved) {
        saveState();
        activeProposalId = null;
        goToProposalsGallery();
        renderAll();
        showToast(`"${prop.title}" re-sent to the Faculty Coordinator for final sign-off.`);
        return;
    }
    prop.resourcesReserved = true;

    // 1. Auto-Reserve Venue (supports suggested venue fallback)
    const isVenueApproved = prop.venue.status === "Approve";
    const isVenueSuggested = prop.venue.status === "Suggest a different venue" && prop.venue.suggestion;

    // Hoist to function scope so forEach callbacks below can reference them
    let reserveVenueId = prop.venue.venueId;
    let reserveVenueName = prop.venue.venueName;

    if (isVenueApproved || isVenueSuggested) {
        
        if (isVenueSuggested) {
            const suggestedVenue = state.venues.find(v => v.name === prop.venue.suggestion);
            if (suggestedVenue) {
                reserveVenueId = suggestedVenue.id;
                reserveVenueName = suggestedVenue.name;
            } else {
                reserveVenueName = prop.venue.suggestion;
            }
        }
        
        // Requirements checklist carries over approved items
        const selectedReqs = prop.inventoryRequirements
            .filter(r => r.status === "Approve")
            .map(r => r.name);

        const cf = state.clubsFinances.find(c => c.club === prop.organizer);
        let createdBooking = null;
        if (typeof Api !== "undefined" && reserveVenueId && prop.date) {
            try {
                createdBooking = await Api.createBooking({
                    venue_id: reserveVenueId,
                    club_id: cf ? cf.id : null,
                    event_name: prop.title,
                    booking_date: prop.date,
                    time_slot: prop.time || "10:00 - 17:00",
                    requirements: selectedReqs,
                    status: "Confirmed"
                });
            } catch (err) {
                console.warn("Could not persist proposal booking to DB:", err);
            }
        }

        const bookingId = createdBooking ? createdBooking.id : generateId("b");
        state.bookings.push({
            id: bookingId,
            venueId: reserveVenueId,
            venueName: reserveVenueName,
            event: prop.title,
            club: prop.organizer,
            date: prop.date,
            timeSlot: prop.time,
            requirements: selectedReqs,
            status: "Confirmed"
        });
    }

    // 2. Auto-Allocate Inventory items (allocates but inventory is free - no charge applied)
    const itemsAllocatedLogs = [];
    const cf = state.clubsFinances.find(c => c.club === prop.organizer);
    for (const res of prop.inventoryRequirements) {
        if (res.status === "Approve") {
            let itemId = res.itemId;
            if (!itemId) {
                const foundItem = (state.inventory || []).find(i => i.name.toLowerCase() === res.name.toLowerCase() || i.name.toLowerCase().includes(res.name.toLowerCase()));
                if (foundItem) itemId = foundItem.id;
            }
            if (itemId) {
                const item = state.inventory.find(i => i.id === itemId);
                if (item) {
                    const usageVenueId = (isVenueApproved || isVenueSuggested) ? reserveVenueId : (prop.venue ? prop.venue.venueId : null);
                    const venueForLocation = (isVenueApproved || isVenueSuggested)
                        ? (state.venues.find(v => v.id === reserveVenueId) || {}).name || reserveVenueName
                        : prop.venue.venueName;
                    if (typeof Api !== "undefined") {
                        try {
                            await Api.createInventoryUsage({
                                item_id: itemId,
                                club_id: cf ? cf.id : null,
                                event_name: prop.title,
                                venue_id: usageVenueId,
                                location: venueForLocation,
                                quantity: res.qty,
                                booking_date: prop.date,
                                time_slot: prop.time || "10:00 - 17:00",
                                status: "Booked"
                            });
                        } catch (e) {
                            console.warn("Could not persist inventory usage to DB:", e);
                        }
                    }
                    state.inventoryUsage.push({
                        id: generateId("use"),
                        itemId: itemId,
                        itemName: item.name,
                        club: prop.organizer,
                        event: prop.title,
                        qty: res.qty,
                        date: prop.date,
                        timeStart: prop.time ? prop.time.split(" - ")[0]?.trim() : "",
                        timeEnd: prop.time ? prop.time.split(" - ")[1]?.trim() : "",
                        timeRange: prop.time,
                        location: venueForLocation,
                        status: "Booked",
                        volunteerName: "",
                        volunteerId: ""
                    });
                    itemsAllocatedLogs.push(`${res.qty}x ${item.name}`);
                }
            }
        }
    }

    // 3. Approved budget line items (no bill yet — club head/volunteers upload bills later for President
    // review) — reserves the event's approved budget out of the club's overall pool server-side (see
    // persistProposalEventBudget / app.routers.finance). Not logged to the ledger yet — the ledger only
    // shows real expenses once their bills are actually approved (see the approve-expense-btn handler)
    // plus whole-club fund additions/disbursements/revisions.
    await persistProposalEventBudget(prop);

    saveState();
    await loadState();

    // Navigate back to proposals gallery immediately
    activeProposalId = null;
    goToProposalsGallery();

    renderAll();
    showToast(`"${prop.title}" approved — venue reserved, resources allocated, and sent to the Faculty Coordinator for final sign-off.`);
}

// Reserves venue/inventory and rolls up approved spend for a proposal — the
// same steps approveProposal() runs above, needed here because the
// budget-escalation path skips them at the President stage and only runs
// them once the Faculty Coordinator tops up the budget and finalizes.
// Faculty Coordinator-only.
async function finalizeProposalResources(prop) {
    const isVenueApproved = prop.venue.status === "Approve";
    const isVenueSuggested = prop.venue.status === "Suggest a different venue" && prop.venue.suggestion;
    let reserveVenueId = prop.venue.venueId;
    let reserveVenueName = prop.venue.venueName;
    const cf = state.clubsFinances.find(c => c.club === prop.organizer);

    if (isVenueApproved || isVenueSuggested) {
        if (isVenueSuggested) {
            const suggestedVenue = state.venues.find(v => v.name === prop.venue.suggestion);
            if (suggestedVenue) {
                reserveVenueId = suggestedVenue.id;
                reserveVenueName = suggestedVenue.name;
            } else {
                reserveVenueName = prop.venue.suggestion;
            }
        }
        let createdBooking = null;
        if (typeof Api !== "undefined" && reserveVenueId && prop.date) {
            try {
                createdBooking = await Api.createBooking({
                    venue_id: reserveVenueId,
                    club_id: cf ? cf.id : null,
                    event_name: prop.title,
                    booking_date: prop.date,
                    time_slot: prop.time || "10:00 - 17:00",
                    status: "Confirmed"
                });
            } catch (err) {
                console.warn("Could not persist finalize booking to DB:", err);
            }
        }
        state.bookings.push({
            id: createdBooking ? createdBooking.id : generateId("b"),
            venueId: reserveVenueId,
            venueName: reserveVenueName,
            event: prop.title,
            club: prop.organizer,
            date: prop.date,
            timeSlot: prop.time,
            status: "Confirmed"
        });
    }

    for (const res of prop.inventoryRequirements) {
        const rowStatus = res.status || res.facultyStatus;
        if (rowStatus === "Approve") {
            let itemId = res.itemId;
            if (!itemId) {
                const foundItem = (state.inventory || []).find(i => i.name.toLowerCase() === res.name.toLowerCase() || i.name.toLowerCase().includes(res.name.toLowerCase()));
                if (foundItem) itemId = foundItem.id;
            }
            if (itemId) {
                const item = state.inventory.find(i => i.id === itemId);
                if (item) {
                    const usageVenueId = (isVenueApproved || isVenueSuggested) ? reserveVenueId : (prop.venue ? prop.venue.venueId : null);
                    const venueForLocation = (isVenueApproved || isVenueSuggested)
                        ? (state.venues.find(v => v.id === reserveVenueId) || {}).name || reserveVenueName
                        : prop.venue.venueName;
                    if (typeof Api !== "undefined") {
                        try {
                            await Api.createInventoryUsage({
                                item_id: itemId,
                                club_id: cf ? cf.id : null,
                                event_name: prop.title,
                                venue_id: usageVenueId,
                                location: venueForLocation,
                                quantity: res.qty,
                                booking_date: prop.date,
                                time_slot: prop.time || "10:00 - 17:00",
                                status: "Booked"
                            });
                        } catch (e) {
                            console.warn("Could not persist inventory usage to DB:", e);
                        }
                    }
                    state.inventoryUsage.push({
                        id: generateId("use"),
                        itemId: itemId,
                        itemName: item.name,
                        club: prop.organizer,
                        event: prop.title,
                        qty: res.qty,
                        date: prop.date,
                        timeStart: prop.time ? prop.time.split(" - ")[0]?.trim() : "",
                        timeEnd: prop.time ? prop.time.split(" - ")[1]?.trim() : "",
                        timeRange: prop.time,
                        location: venueForLocation,
                        status: "Booked",
                        volunteerName: "",
                        volunteerId: ""
                    });
                }
            }
        }
    }

    await persistProposalEventBudget(prop);
    prop.resourcesReserved = true;
}

// Faculty Coordinator's discretionary top-up + one-step finalize for a
// proposal the President couldn't approve directly (prop.needsExtraBudget).
// Faculty Coordinator-only.
async function approveWithBudgetTopUp(propId, topUpAmount) {
    const prop = state.proposals.find(p => p.id === propId);
    if (!prop) return;
    const cf = state.clubsFinances.find(c => c.club === prop.organizer);
    if (!cf) return;

    const poolTotal = (state.facultyBudgetPool && state.facultyBudgetPool.total) || 0;
    const totalAllotted = state.clubsFinances.reduce((acc, c) => acc + c.allotted, 0);
    const poolAvailable = poolTotal - totalAllotted;
    if (topUpAmount > poolAvailable) {
        alert(`Only ${formatCurrency(poolAvailable)} is available in the master budget pool.`);
        return;
    }
    if (!confirm(`Allot ${formatCurrency(topUpAmount)} extra to ${prop.organizer} and give final approval for "${prop.title}"?`)) return;

    try {
        await Api.createFinanceTransaction(cf.id, "Allocation", topUpAmount, `Extra budget allotted for event "${prop.title}"`);
    } catch (err) {
        showToast(`Couldn't allot extra budget: ${err.detail || err.message}`, "danger");
        return;
    }

    await finalizeProposalResources(prop);
    if (typeof Api !== "undefined" && !isNaN(Number(prop.id))) {
        try {
            await Api.facultyReview(Number(prop.id), true, "");
        } catch (err) {
            console.warn("Backend faculty review error:", err);
            showToast(`Backend approval error: ${err.detail || err.message}`, "danger");
        }
    }
    prop.status = "Approved";
    prop.needsExtraBudget = false;
    prop.facultyFeedback = "";
    logHistory(prop, `Approved with ${formatCurrency(topUpAmount)} budget top-up`);
    saveState();
    await loadState();
    returnToProposalsGallery();
    renderAll();
    showToast(`Allotted ${formatCurrency(topUpAmount)} extra to ${prop.organizer} — "${prop.title}" has been given final approval.`);
}

// -------------------------------------------------------------
// SELECT ELEMENTS SEED HELPERS
// -------------------------------------------------------------
function populateClubsSelects() {
    // Note: "evt-budget-club" and "finance-club" are intentionally excluded —
    // both are locked to the club currently being viewed in the nested
    // Finances & Budgets sub-tab of Club Overview.
    const selects = ["alloc-club", "booking-club"];
    
    // Sort club names alphabetically
    const clubNames = state.clubsFinances.map(cf => cf.club).sort();
    
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">-- Choose Club --</option>';
            clubNames.forEach(name => {
                select.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
            });
        }
    });
}

// Initialize on Load
document.addEventListener("DOMContentLoaded", async () => {
    await loadState();
    bindEvents();
    renderAll();

    // Restore the last-active tab on refresh (no-op if nothing was saved or
    // the saved tab doesn't exist in this role's sidebar). Programmatically
    // clicking the nav link re-runs the full tab-switch handler (panes, title,
    // per-tab render).
    const savedTab = localStorage.getItem("sscms_active_tab_admin");
    if (savedTab) {
        const savedLink = document.querySelector(`.sidebar .nav-link[data-tab="${savedTab}"]`);
        if (savedLink) savedLink.click();
    }

    if (document.getElementById("sm-view-root") && window.StudentManagement) {
        window.StudentManagement.loadAndRender("sm-view-root");
    }

    if (__session.role === "president") {
        const pageSubtitle = document.getElementById("page-subtitle");
        if (pageSubtitle) {
            pageSubtitle.textContent = `Welcome back, ${__session.name || "President"}. Here is what's happening across campus clubs.`;
        }

        // Budget allocation/disbursement is a Faculty Coordinator-only action —
        // the President can view finances but not move money.
        if (btnAdjustFinances) btnAdjustFinances.classList.add("hidden");
        if (btnAddEventBudget) btnAddEventBudget.classList.add("hidden");
    }

    const btnBulkVenuesCsv = document.getElementById("btn-bulk-venues-csv");
    if (btnBulkVenuesCsv) {
        btnBulkVenuesCsv.addEventListener("click", () => {
            openModal("modal-bulk-venues-csv");
        });
    }

    const formBulkVenuesCsv = document.getElementById("form-bulk-venues-csv");
    if (formBulkVenuesCsv) {
        formBulkVenuesCsv.addEventListener("submit", async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById("bulk-venues-file-input");
            const reportEl = document.getElementById("bulk-venues-report");
            if (!fileInput || !fileInput.files[0]) {
                showToast("Please select a CSV file first", "warning");
                return;
            }
            reportEl.innerHTML = `<div style="text-align:center; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Processing venues CSV...</div>`;
            try {
                const res = await Api.bulkCreateVenues(fileInput.files[0]);
                reportEl.innerHTML = `
                    <div style="background: var(--bg-main); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.85rem;">
                        <p style="margin:0 0 0.5rem 0;"><strong>Total:</strong> ${res.total} &bull; <span style="color: var(--success);">Created: ${res.created}</span> &bull; <span style="color: var(--danger);">Failed: ${res.failed}</span></p>
                    </div>
                `;
                showToast(`Venues Bulk Import finished: ${res.created} created, ${res.failed} failed.`, "success");
                await loadState();
                renderAll();
            } catch (err) {
                reportEl.innerHTML = `<div class="alert alert-danger" style="padding: 0.75rem;">Failed: ${err.message || err}</div>`;
            }
        });
    }

    const btnBulkInventoryCsv = document.getElementById("btn-bulk-inventory-csv");
    if (btnBulkInventoryCsv) {
        btnBulkInventoryCsv.addEventListener("click", () => {
            openModal("modal-bulk-inventory-csv");
        });
    }

    const formBulkInventoryCsv = document.getElementById("form-bulk-inventory-csv");
    if (formBulkInventoryCsv) {
        formBulkInventoryCsv.addEventListener("submit", async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById("bulk-inventory-file-input");
            const reportEl = document.getElementById("bulk-inventory-report");
            if (!fileInput || !fileInput.files[0]) {
                showToast("Please select a CSV file first", "warning");
                return;
            }
            reportEl.innerHTML = `<div style="text-align:center; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Processing inventory CSV...</div>`;
            try {
                const res = await Api.bulkCreateInventory(fileInput.files[0]);
                reportEl.innerHTML = `
                    <div style="background: var(--bg-main); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.85rem;">
                        <p style="margin:0 0 0.5rem 0;"><strong>Total:</strong> ${res.total} &bull; <span style="color: var(--success);">Created: ${res.created}</span> &bull; <span style="color: var(--danger);">Failed: ${res.failed}</span></p>
                    </div>
                `;
                showToast(`Inventory Bulk Import finished: ${res.created} created, ${res.failed} failed.`, "success");
                await loadState();
                renderAll();
            } catch (err) {
                reportEl.innerHTML = `<div class="alert alert-danger" style="padding: 0.75rem;">Failed: ${err.message || err}</div>`;
            }
        });
    }
});

function openBulkSetupModal() {
    let modalRoot = document.getElementById("bulk-setup-modal-root");
    if (!modalRoot) {
        modalRoot = document.createElement("div");
        modalRoot.id = "bulk-setup-modal-root";
        document.body.appendChild(modalRoot);
    }

    modalRoot.innerHTML = `
        <div class="modal-backdrop active" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div class="modal-card" style="background: var(--bg-card); border-radius: 12px; width: 680px; max-width: 90vw; max-height: 85vh; overflow-y: auto; padding: 1.5rem; border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.2rem;"><i class="fa-solid fa-boxes-packing text-amber"></i> Bulk Setup (Venues & Inventory)</h3>
                        <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">Batch insert multiple campus venues or inventory items in a single call.</p>
                    </div>
                    <button class="btn-close-bulk-modal" style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer; color: var(--text-muted);">&times;</button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <label class="form-label" style="font-weight: 600; font-size: 0.85rem;">Select Target Resource:</label>
                    <select id="bulk-target-select" class="form-select" style="font-size: 0.85rem; margin-bottom: 0.75rem;">
                        <option value="venues">Venues (JSON array of name, capacity, location, description)</option>
                        <option value="inventory">Inventory (JSON array of name, category, description, total_stock)</option>
                    </select>

                    <label class="form-label" style="font-weight: 600; font-size: 0.85rem;">JSON Array Data:</label>
                    <textarea id="bulk-json-input" class="form-control" rows="8" style="font-family: monospace; font-size: 0.8rem;" placeholder='[\n  {"name": "Auditorium C", "capacity": 300, "location": "Block A"},\n  {"name": "Seminar Room 1", "capacity": 60, "location": "Block B"}\n]'></textarea>
                </div>

                <div id="bulk-setup-report-area"></div>

                <div style="text-align: right; margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
                    <button class="btn btn-secondary btn-close-bulk-modal" style="padding: 0.4rem 1rem; border-radius: 8px;">Close</button>
                    <button id="btn-submit-bulk-json" class="btn btn-primary" style="padding: 0.4rem 1.25rem; border-radius: 8px;"><i class="fa-solid fa-cloud-arrow-up"></i> Submit Bulk Request</button>
                </div>
            </div>
        </div>
    `;

    modalRoot.querySelectorAll(".btn-close-bulk-modal").forEach(b => {
        b.addEventListener("click", () => { modalRoot.innerHTML = ""; });
    });

    const submitBtn = modalRoot.querySelector("#btn-submit-bulk-json");
    submitBtn.addEventListener("click", async () => {
        const target = modalRoot.querySelector("#bulk-target-select").value;
        const jsonText = modalRoot.querySelector("#bulk-json-input").value.trim();
        const reportArea = modalRoot.querySelector("#bulk-setup-report-area");

        if (!jsonText) {
            showToast("Please enter a valid JSON array.", "warning");
            return;
        }

        let parsedData;
        try {
            parsedData = JSON.parse(jsonText);
            if (!Array.isArray(parsedData)) throw new Error("Root must be a JSON array []");
        } catch (err) {
            showToast(`JSON Syntax Error: ${err.message}`, "danger");
            return;
        }

        reportArea.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Submitting bulk setup...</div>`;

        try {
            let res;
            if (target === "venues") {
                res = await Api.bulkCreateVenues(parsedData);
            } else {
                res = await Api.bulkCreateInventory(parsedData);
            }

            let rows = (res.results || []).map(r => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 0.4rem 0.6rem;">Item ${r.index}</td>
                    <td style="padding: 0.4rem 0.6rem; font-weight: 600;">${r.name}</td>
                    <td style="padding: 0.4rem 0.6rem;"><span class="badge ${r.status === 'success' ? 'badge-success' : 'badge-danger'}">${r.status.toUpperCase()}</span></td>
                    <td style="padding: 0.4rem 0.6rem; font-size: 0.8rem; color: ${r.status === 'error' ? 'var(--danger)' : 'var(--text-muted)'};">${r.error || "Created"}</td>
                </tr>
            `).join("");

            reportArea.innerHTML = `
                <div style="background: var(--bg-main); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.85rem;">
                    <p style="margin: 0 0 0.5rem 0;"><strong>Total:</strong> ${res.total} &bull; <span style="color: var(--success);">Created: ${res.created}</span> &bull; <span style="color: var(--danger);">Failed: ${res.failed}</span></p>
                    <div style="max-height: 180px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead>
                                <tr style="background: var(--bg-card); font-size: 0.75rem; text-transform: uppercase;">
                                    <th style="padding: 0.4rem 0.6rem;">#</th>
                                    <th style="padding: 0.4rem 0.6rem;">Name</th>
                                    <th style="padding: 0.4rem 0.6rem;">Status</th>
                                    <th style="padding: 0.4rem 0.6rem;">Details</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `;
            await loadState();
            renderAll();
            showToast(`Bulk setup finished: ${res.created} created, ${res.failed} failed.`, "success");
        } catch (err) {
            reportArea.innerHTML = `<div class="alert alert-danger" style="padding: 0.75rem;">Failed: ${err.message || err}</div>`;
        }
    });
}


// -------------------------------------------------------------
// RESOURCES CALENDAR RENDERERS now live in shared/js/calendar.js (loaded before this file).
