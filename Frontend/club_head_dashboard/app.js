/* ============================================================
   CLUB HEAD DASHBOARD CONTROLLER
   Shares the SAME localStorage state ("sscms_president_state")
   as the Club President Portal, so a proposal submitted here
   shows up instantly in the President's "Event Proposals" tab.
============================================================= */

// ── Identity of the logged-in Club Head ─────────────────────────
// Resolved from the real session (see shared/js/session.js) once the page
// loads -- set in the DOMContentLoaded handler at the bottom of this file,
// after `__session` (from index.html's inline requireRole() call) and the
// live club list (via loadState()) are both available.
let CURRENT_CLUB = "";
let CURRENT_CLUB_ID = null;
let CURRENT_USER_NAME = "";

// Fixed 5-category list — used by BOTH the "Inventory & Infrastructure Requirements"
// category dropdown AND the "Procuring Items" category dropdown (matches the
// President portal's colour coding for these exact 5 categories).
const CATEGORY_LIST = [
    "Venue & Infrastructure",
    "Media & Technology",
    "Materials & Consumables",
    "Food & Hospitality",
    "Services & Human Resources"
];
// Kept as an alias so any older references still work.
const PROCURING_CATEGORIES = CATEGORY_LIST;


// State load/save/DEFAULT_STATE/migrations now live in shared/js/seed-data.js
// and shared/js/state-core.js (loaded before this file) — single source of
// truth shared by all four dashboards instead of a hand-copy per dashboard.

function todayStr() {
    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Toast/currency/date/time helpers (showToast, escapeHtml, formatCurrency,
// formatDate, formatDateTime, formatTimeRange) now live in shared/js/utils.js

// ============================================================
// VIEW / NAVIGATION STATE
// ============================================================
let currentView = "gallery"; // gallery | form | detail
let activeDetailId = null;
let editingProposalId = null; // set when revising an existing proposal
let globalQuery = "";

// Working form state (rows use local incrementing keys so DOM stays stable)
let formState = {
    title: "", desc: "", date: "", timeStart: "", timeEnd: "", participants: "",
    venueId: "", capacityRequired: "",
    comments: "",
    inventoryRows: [],   // { category, itemId, itemName, qty, unit }
    procuringRows: [],   // { name, category, qty, unit, pricePerUnit }
    prizeRows: [],       // { position, amount }
    judgeRows: []        // { desc, numJudges, feePerJudge }
};

function resetFormState() {
    formState = {
        title: "", desc: "", date: "", timeStart: "", timeEnd: "", participants: "",
        venueId: "", capacityRequired: "",
        comments: "",
        inventoryRows: [],
        procuringRows: [],
        prizeRows: [],
        judgeRows: []
    };
}

// ============================================================
// SWITCHING BETWEEN GALLERY / FORM / DETAIL
// ============================================================
function showView(view) {
    currentView = view;
    document.getElementById("ch-gallery-view").classList.toggle("hidden", view !== "gallery");
    document.getElementById("ch-form-view").classList.toggle("hidden", view !== "form");
    document.getElementById("ch-detail-view").classList.toggle("hidden", view !== "detail");

    const pageTitle = document.getElementById("page-title");
    const pageSubtitle = document.getElementById("page-subtitle");
    if (view === "gallery") {
        pageTitle.textContent = "Event Proposals";
        pageSubtitle.textContent = "Submit new event proposals and track their approval status with the Club President.";
    } else if (view === "form") {
        pageTitle.textContent = editingProposalId ? "Revise Proposal" : "New Event Proposal";
        pageSubtitle.textContent = "Fill in every section that applies to your event — leave a table empty if it isn't needed.";
    } else if (view === "detail") {
        pageTitle.textContent = "Proposal Status";
        pageSubtitle.textContent = "Read-only view of what was submitted and the Club President's decisions.";
    }
}

function openNewProposalForm() {
    editingProposalId = null;
    resetFormState();
    document.getElementById("ch-form-title").textContent = "New Event Proposal";
    document.getElementById("ch-feedback-ref-box").classList.add("hidden");
    populateVenueSelect();
    renderInventoryFormTable();
    renderProcuringFormTable();
    renderPrizeFormTable();
    renderJudgeFormTable();
    updateBudgetSummary();
    // Clear plain inputs
    document.getElementById("ch-f-title").value = "";
    document.getElementById("ch-f-desc").value = "";
    document.getElementById("ch-f-date").value = "";
    document.getElementById("ch-f-time-start").value = "";
    document.getElementById("ch-f-time-end").value = "";
    document.getElementById("ch-f-participants").value = "";
    document.getElementById("ch-f-venue").value = "";
    document.getElementById("ch-f-capacity").value = "";
    document.getElementById("ch-f-comments").value = "";
    document.getElementById("ch-f-venue-meta").textContent = "";
    document.getElementById("ch-f-venue-requirements").value = "";
    document.getElementById("ch-f-venue-suggestions")?.classList.add("hidden");
    const aiStatus = document.getElementById("ch-ai-assist-status");
    if (aiStatus) { aiStatus.classList.add("hidden"); aiStatus.innerHTML = ""; }
    showView("form");
}

function openEditProposalForm(propId) {
    const prop = state.proposals.find(p => p.id === propId);
    if (!prop) return;
    editingProposalId = propId;
    resetFormState();

    formState.title = prop.title;
    formState.desc = prop.desc;
    formState.date = prop.date;
    const timeParts = (prop.time || "").split(" - ");
    formState.timeStart = timeParts[0] || "";
    formState.timeEnd = timeParts[1] || "";
    formState.participants = prop.estimatedParticipants;
    formState.venueId = prop.venue ? prop.venue.venueId : "";
    formState.capacityRequired = prop.venue ? prop.venue.capacityRequired : "";
    formState.comments = prop.clubComments || "";

    formState.inventoryRows = (prop.inventoryRequirements || []).map(r => ({
        category: r.category || (state.inventory.find(i => i.id === r.itemId) || {}).category || "",
        itemId: r.itemId, itemName: r.name, qty: r.qty, unit: r.unit
    }));
    formState.procuringRows = (prop.procuringItems || []).map(r => ({
        name: r.name, category: r.category, qty: r.qty, unit: r.unit, pricePerUnit: r.pricePerUnit
    }));
    formState.prizeRows = (prop.prizeMoney || []).map(r => ({ position: r.position, amount: r.amount }));
    formState.judgeRows = (prop.judgeFees || []).map(r => ({ desc: r.name, numJudges: r.qty, feePerJudge: r.feePerJudge }));

    document.getElementById("ch-form-title").textContent = `Revise Proposal — ${prop.title}`;
    const fbBox = document.getElementById("ch-feedback-ref-box");
    if (prop.generalSuggestions && prop.generalSuggestions.trim() !== "") {
        fbBox.classList.remove("hidden");
        document.getElementById("ch-feedback-ref-text").textContent = prop.generalSuggestions;
    } else {
        fbBox.classList.add("hidden");
    }

    populateVenueSelect();
    document.getElementById("ch-f-title").value = formState.title;
    document.getElementById("ch-f-desc").value = formState.desc;
    document.getElementById("ch-f-date").value = formState.date;
    document.getElementById("ch-f-time-start").value = formState.timeStart;
    document.getElementById("ch-f-time-end").value = formState.timeEnd;
    document.getElementById("ch-f-participants").value = formState.participants;
    document.getElementById("ch-f-venue").value = formState.venueId;
    document.getElementById("ch-f-capacity").value = formState.capacityRequired;
    document.getElementById("ch-f-comments").value = formState.comments;
    updateVenueMeta();

    renderInventoryFormTable();
    renderProcuringFormTable();
    renderPrizeFormTable();
    renderJudgeFormTable();
    updateBudgetSummary();

    const aiStatus = document.getElementById("ch-ai-assist-status");
    if (aiStatus) { aiStatus.classList.add("hidden"); aiStatus.innerHTML = ""; }
    showView("form");
}

// ============================================================
// GALLERY VIEW
// ============================================================
function renderGallery() {
    const myProposals = state.proposals.filter(p => p.organizer === CURRENT_CLUB);

    const filtered = myProposals.filter(p => {
        if (globalQuery !== "") {
            const q = globalQuery.toLowerCase();
            return p.title.toLowerCase().includes(q) || (p.venue && p.venue.venueName.toLowerCase().includes(q));
        }
        return true;
    });

    const pendingCount = myProposals.filter(p => p.status === "Pending" || p.status === "Needs Revision").length;
    const pendingCountSpan = document.getElementById("ch-pending-count");
    pendingCountSpan.textContent = `${pendingCount} Pending`;
    pendingCountSpan.className = pendingCount > 0 ? "badge badge-warning" : "badge badge-success";

    const reviewProposals = filtered.filter(p => p.status !== "Approved");
    const approvedProposals = filtered.filter(p => p.status === "Approved");

    const reviewGrid = document.getElementById("ch-review-grid");
    const approvedGrid = document.getElementById("ch-approved-grid");

    if (reviewProposals.length === 0) {
        reviewGrid.innerHTML = `
            <div class="ch-empty-state">
                <i class="fa-solid fa-folder-open"></i>
                No proposals under review right now. Click "New Proposal" to submit one.
            </div>`;
    } else {
        reviewGrid.innerHTML = "";
        reviewProposals.forEach(prop => reviewGrid.appendChild(buildProposalCard(prop)));
    }

    if (approvedProposals.length === 0) {
        approvedGrid.innerHTML = `
            <div class="ch-empty-state">
                <i class="fa-solid fa-circle-check"></i>
                No approved events yet.
            </div>`;
    } else {
        approvedGrid.innerHTML = "";
        approvedProposals.forEach(prop => approvedGrid.appendChild(buildProposalCard(prop)));
    }
}

function buildProposalCard(prop) {
    const isRevision = prop.status === "Needs Revision" || prop.status === "Faculty Revision Requested" || prop.status === "Revision Requested" || prop.status === "Draft" || prop.rawBackendStatus === "Needs Revision";
    let statusClass = "badge-warning";
    if (prop.status === "Needs Revision") statusClass = "badge-outline-warning";
    if (prop.status === "Faculty Revision Requested") statusClass = "badge-outline-warning";
    if (prop.status === "Pending Faculty Approval") statusClass = "badge-info";
    if (prop.status === "Rejected") statusClass = "badge-danger";
    if (prop.status === "Approved") statusClass = "badge-success";

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
            <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(prop.venue ? prop.venue.venueName : "-")}</span>
            <span><i class="fa-solid fa-calendar-day"></i> ${formatDate(prop.date)} &nbsp;<i class="fa-solid fa-clock" style="margin-left:0.3rem;"></i> ${formatTimeRange(prop.time)}</span>
        </div>
        ${isRevision ? `
        <div style="margin-top:0.6rem; padding-top:0.5rem; border-top:1px dashed var(--border-color);">
            <button type="button" class="btn btn-primary btn-sm" data-action="card-revise-resubmit" style="width:100%;">
                <i class="fa-solid fa-arrows-rotate"></i> Revise &amp; Resubmit
            </button>
        </div>
        ` : ''}
    `;

    card.addEventListener("click", (e) => {
        const reviseClick = e.target.closest('[data-action="card-revise-resubmit"]');
        if (reviseClick) {
            e.stopPropagation();
            openEditProposalForm(prop.id);
            return;
        }
        openDetailView(prop.id);
    });
    return card;
}

// ============================================================
// DETAIL (READ-ONLY) VIEW
// ============================================================
function openDetailView(propId) {
    activeDetailId = propId;
    showView("detail");
    renderDetailView();
}

function decisionBadge(status) {
    const map = {
        Pending: ["badge-warning", "Pending"],
        Approve: ["badge-success", "Approved"],
        Approved: ["badge-success", "Approved"],
        Reject: ["badge-danger", "Rejected"],
        Disapprove: ["badge-danger", "Rejected"],
        Rejected: ["badge-danger", "Rejected"],
        "Suggest Change": ["badge-outline-warning", "Change Suggested"],
        "Suggest Changes": ["badge-outline-warning", "Change Suggested"]
    };
    const [cls, label] = map[status] || ["badge-warning", "Pending"];
    return `<span class="badge ${cls}" style="font-size:0.7rem;">${label}</span>`;
}

function renderDetailView() {
    const prop = state.proposals.find(p => p.id === activeDetailId);
    if (!prop) { showView("gallery"); return; }

    document.getElementById("ch-detail-title").textContent = prop.title;
    document.getElementById("ch-detail-desc").textContent = prop.desc;
    document.getElementById("ch-detail-datetime").textContent = `${formatDate(prop.date)}  ·  ${formatTimeRange(prop.time)} (24hr)`;
    document.getElementById("ch-detail-attendees").textContent = `${prop.estimatedParticipants} Expected`;
    document.getElementById("ch-detail-submitted").textContent = formatDateTime(prop.submittedOn) || "—";
    document.getElementById("ch-detail-venue").textContent = prop.venue ? `${prop.venue.venueName} (${prop.venue.location})` : "—";

    const statusBadgeEl = document.getElementById("ch-detail-status");
    let statusClass = "badge-warning";
    if (prop.status === "Approved") statusClass = "badge-success";
    if (prop.status === "Needs Revision" || prop.status === "Faculty Revision Requested") statusClass = "badge-outline-warning";
    if (prop.status === "Pending Faculty Approval") statusClass = "badge-info";
    if (prop.status === "Rejected") statusClass = "badge-danger";
    statusBadgeEl.className = `badge ${statusClass}`;
    statusBadgeEl.textContent = prop.status;

    // Summary banner
    const procuringCost = prop.procuringItems.reduce((s, r) => s + (r.overallPrice || 0), 0);
    const prizeCost = prop.prizeMoney.reduce((s, r) => s + (r.amount || 0), 0);
    const judgeCost = prop.judgeFees.reduce((s, r) => s + (r.overallPrice || 0), 0);
    const totalRequested = procuringCost + prizeCost + judgeCost;
    document.getElementById("ch-detail-summary-banner").innerHTML = `
        <div class="prop-summary-item">
            <i class="fa-solid fa-calendar-check text-indigo"></i>
            <div><span class="prop-summary-lbl">Submitted On</span><span class="prop-summary-val">${formatDateTime(prop.submittedOn) || "—"}</span></div>
        </div>
        <div class="prop-summary-item">
            <i class="fa-solid fa-money-bill-wave text-emerald"></i>
            <div><span class="prop-summary-lbl">Procurements Cost</span><span class="prop-summary-val">${formatCurrency(procuringCost)}</span></div>
        </div>
        <div class="prop-summary-item">
            <i class="fa-solid fa-award text-amber"></i>
            <div><span class="prop-summary-lbl">Prizes &amp; Fees</span><span class="prop-summary-val">${formatCurrency(prizeCost + judgeCost)}</span></div>
        </div>
        <div class="prop-summary-item prop-summary-total">
            <i class="fa-solid fa-indian-rupee-sign text-indigo"></i>
            <div><span class="prop-summary-lbl">Total Requested</span><span class="prop-summary-val" style="color:var(--primary);font-weight:700;">${formatCurrency(totalRequested)}</span></div>
        </div>
    `;

    // Inventory
    const invTbody = document.getElementById("ch-detail-inv-tbody");
    if (!prop.inventoryRequirements.length) {
        invTbody.innerHTML = `<tr class="ch-empty-row"><td colspan="5">No lent-asset requirements were requested.</td></tr>`;
    } else {
        invTbody.innerHTML = prop.inventoryRequirements.map(r => `
            <tr>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td><span class="badge badge-indigo">${escapeHtml(r.category || "-")}</span></td>
                <td>${r.qty}</td>
                <td><span class="badge badge-info">${escapeHtml(r.unit)}</span></td>
                <td>${decisionBadge(r.status)}${r.comment ? `<div class="ch-item-comment">${escapeHtml(r.comment)}</div>` : ""}</td>
            </tr>
        `).join("");
    }

    // Procuring
    const procTbody = document.getElementById("ch-detail-proc-tbody");
    if (!prop.procuringItems.length) {
        procTbody.innerHTML = `<tr class="ch-empty-row"><td colspan="6">No self-procured expenses were requested.</td></tr>`;
    } else {
        procTbody.innerHTML = prop.procuringItems.map(r => `
            <tr>
                <td><strong>${escapeHtml(r.name)}</strong><br><span class="badge badge-indigo" style="font-size:0.7rem; margin-top:0.2rem;">${escapeHtml(r.category || "Uncategorised")}</span></td>
                <td>${r.qty}</td>
                <td><span class="badge badge-indigo">${escapeHtml(r.unit)}</span></td>
                <td>${formatCurrency(r.pricePerUnit)}</td>
                <td><strong class="text-indigo">${formatCurrency(r.overallPrice)}</strong></td>
                <td>${decisionBadge(r.status)}${r.comment ? `<div class="ch-item-comment">${escapeHtml(r.comment)}</div>` : ""}</td>
            </tr>
        `).join("");
    }

    // Prize money
    const prizeTbody = document.getElementById("ch-detail-prize-tbody");
    if (!prop.prizeMoney.length) {
        prizeTbody.innerHTML = `<tr class="ch-empty-row"><td colspan="3">No prize money was requested.</td></tr>`;
    } else {
        prizeTbody.innerHTML = prop.prizeMoney.map(r => `
            <tr>
                <td><strong>${escapeHtml(r.position)}</strong></td>
                <td><strong class="text-indigo">${formatCurrency(r.amount)}</strong></td>
                <td>${decisionBadge(r.status)}${r.comment ? `<div class="ch-item-comment">${escapeHtml(r.comment)}</div>` : ""}</td>
            </tr>
        `).join("");
    }

    // Judge fees
    const judgeTbody = document.getElementById("ch-detail-judge-tbody");
    if (!prop.judgeFees.length) {
        judgeTbody.innerHTML = `<tr class="ch-empty-row"><td colspan="5">No judge / guest fees were requested.</td></tr>`;
    } else {
        judgeTbody.innerHTML = prop.judgeFees.map(r => `
            <tr>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td>${r.qty}</td>
                <td>${formatCurrency(r.feePerJudge)}</td>
                <td><strong class="text-indigo">${formatCurrency(r.overallPrice)}</strong></td>
                <td>${decisionBadge(r.status)}${r.comment ? `<div class="ch-item-comment">${escapeHtml(r.comment)}</div>` : ""}</td>
            </tr>
        `).join("");
    }

    // Comments boxes
    const yourBox = document.getElementById("ch-detail-your-comments");
    if (prop.clubComments && prop.clubComments.trim() !== "") {
        yourBox.textContent = prop.clubComments;
        yourBox.classList.remove("empty");
    } else {
        yourBox.textContent = "No comments were added.";
        yourBox.classList.add("empty");
    }

    const adminBox = document.getElementById("ch-detail-admin-feedback");
    if (prop.generalSuggestions && prop.generalSuggestions.trim() !== "") {
        adminBox.textContent = prop.generalSuggestions;
        adminBox.classList.remove("empty");
    } else {
        adminBox.textContent = "No feedback yet.";
        adminBox.classList.add("empty");
    }

    // Revise & resubmit button for any revision / draft status
    const isRevision = prop.status === "Needs Revision" || prop.status === "Faculty Revision Requested" || prop.status === "Revision Requested" || prop.status === "Draft" || prop.rawBackendStatus === "Needs Revision";
    const reviseBtn = document.getElementById("btn-ch-revise-resubmit");
    const topReviseBtn = document.getElementById("btn-ch-top-revise");

    if (reviseBtn) {
        if (isRevision) {
            reviseBtn.classList.remove("hidden");
            reviseBtn.onclick = () => openEditProposalForm(prop.id);
        } else {
            reviseBtn.classList.add("hidden");
        }
    }

    if (topReviseBtn) {
        if (isRevision) {
            topReviseBtn.classList.remove("hidden");
            topReviseBtn.onclick = () => openEditProposalForm(prop.id);
        } else {
            topReviseBtn.classList.add("hidden");
        }
    }
}

// ============================================================
// VENUE SELECT (Form)
// ============================================================
function populateVenueSelect() {
    const select = document.getElementById("ch-f-venue");
    select.innerHTML = '<option value="">-- Select Venue --</option>' +
        state.venues.map(v => `<option value="${v.id}">${escapeHtml(v.name)} (Cap: ${v.capacity})</option>`).join("");
    select.value = formState.venueId || "";
}

function updateVenueMeta() {
    const meta = document.getElementById("ch-f-venue-meta");
    const venue = state.venues.find(v => v.id === formState.venueId);
    meta.textContent = venue ? `${venue.location} · Standard capacity ${venue.capacity}` : "";
}

// ============================================================
// INVENTORY REQUIREMENTS TABLE (Category → searchable Requirement)
// ============================================================
function stockHintHtml(itemId) {
    const item = state.inventory.find(i => i.id === itemId);
    if (!item) return "";
    return `<span class="ch-stock-hint">Stock: ${item.availableStock} / ${item.totalStock} available</span>`;
}

function renderInventoryFormTable() {
    const tbody = document.getElementById("ch-f-inv-tbody");
    if (formState.inventoryRows.length === 0) {
        tbody.innerHTML = `<tr class="ch-empty-row"><td colspan="5">No lent-asset items added. Click "+ Add Item" if your event needs any inventory (chairs, mics, projectors, etc.).</td></tr>`;
        return;
    }
    tbody.innerHTML = formState.inventoryRows.map((row, idx) => `
        <tr>
            <td>
                <select class="form-select ch-inv-cat" data-idx="${idx}">
                    <option value="">-- Category --</option>
                    ${CATEGORY_LIST.map(c => `<option value="${escapeHtml(c)}" ${row.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
            </td>
            <td>
                <div class="ch-searchable" data-idx="${idx}">
                    <input type="text" class="form-input ch-req-search" data-idx="${idx}"
                        placeholder="${row.category ? 'Search or pick from list...' : 'Select category first'}"
                        value="${escapeHtml(row.itemName || '')}" autocomplete="off" ${row.category ? "" : "disabled"}>
                    ${row.itemId ? stockHintHtml(row.itemId) : `<span class="ch-stock-hint">Choose an item from the dropdown — typing only searches.</span>`}
                </div>
            </td>
            <td><input type="number" min="1" class="form-input ch-inv-qty" data-idx="${idx}" value="${row.qty || ''}" placeholder="Qty"></td>
            <td><input type="text" list="ch-units-list" class="form-input ch-inv-unit" data-idx="${idx}" value="${escapeHtml(row.unit || '')}" placeholder="Units"></td>
            <td style="text-align:center;"><button type="button" class="action-btn action-btn-delete ch-remove-row" data-table="inv" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join("");
}

// ── Shared, single, fixed-position dropdown overlay ──
// Used for the "Requirement" combobox so the list is always rendered in front
// of everything (never clipped by the table's overflow-x:auto scroll area)
// and never requires scrolling the page/table to see it.
let activeDropdownIdx = null;

function positionSharedDropdown(inputEl) {
    const dropdown = document.getElementById("ch-shared-dropdown");
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    dropdown.style.width = rect.width + "px";
    dropdown.style.left = rect.left + "px";
    if (spaceBelow < 260 && rect.top > 260) {
        // Not enough room below — open upwards instead of forcing a scroll.
        dropdown.style.top = "";
        dropdown.style.bottom = (window.innerHeight - rect.top + 4) + "px";
    } else {
        dropdown.style.bottom = "";
        dropdown.style.top = (rect.bottom + 4) + "px";
    }
}

function openReqDropdown(idx, inputEl, query) {
    const row = formState.inventoryRows[idx];
    if (!row || !row.category) return;
    activeDropdownIdx = idx;

    const dropdown = document.getElementById("ch-shared-dropdown");
    const q = (query || "").toLowerCase();
    const matches = state.inventory.filter(i => i.category === row.category && i.name.toLowerCase().includes(q));

    if (matches.length === 0) {
        dropdown.innerHTML = `<div class="ch-dropdown-empty">No lendable items exist in "${escapeHtml(row.category)}" yet. Try a different category, or add this under "Procuring Items" instead.</div>`;
    } else {
        dropdown.innerHTML = matches.map(item => {
            const stockCls = item.availableStock === 0 ? "none" : (item.availableStock < 5 ? "low" : "");
            return `
                <div class="ch-dropdown-option" data-idx="${idx}" data-item-id="${item.id}" data-item-name="${escapeHtml(item.name)}">
                    <span>${escapeHtml(item.name)}</span>
                    <span class="ch-opt-stock ${stockCls}">${item.availableStock} avail.</span>
                </div>`;
        }).join("");
    }
    positionSharedDropdown(inputEl);
    dropdown.classList.remove("hidden");
}

function hideAllDropdowns() {
    document.getElementById("ch-shared-dropdown").classList.add("hidden");
    activeDropdownIdx = null;
}

// ============================================================
// PROCURING ITEMS TABLE
// ============================================================
function renderProcuringFormTable() {
    const tbody = document.getElementById("ch-f-proc-tbody");
    if (formState.procuringRows.length === 0) {
        tbody.innerHTML = `<tr class="ch-empty-row"><td colspan="7">No self-procured items added. Click "+ Add Item" if your club will directly purchase anything.</td></tr>`;
        return;
    }
    tbody.innerHTML = formState.procuringRows.map((row, idx) => `
        <tr>
            <td><input type="text" class="form-input ch-proc-name" data-idx="${idx}" value="${escapeHtml(row.name || '')}" placeholder="e.g. Banners, T-shirts"></td>
            <td>
                <select class="form-select ch-proc-cat" data-idx="${idx}">
                    <option value="">-- Category --</option>
                    ${PROCURING_CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${row.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
            </td>
            <td><input type="number" min="1" class="form-input ch-proc-qty" data-idx="${idx}" value="${row.qty || ''}" placeholder="Qty"></td>
            <td><input type="text" list="ch-units-list" class="form-input ch-proc-unit" data-idx="${idx}" value="${escapeHtml(row.unit || '')}" placeholder="Units"></td>
            <td><input type="number" min="0" class="form-input ch-proc-price" data-idx="${idx}" value="${row.pricePerUnit || ''}" placeholder="₹ / unit"></td>
            <td><strong class="text-indigo ch-proc-total" data-idx="${idx}">${formatCurrency((row.qty || 0) * (row.pricePerUnit || 0))}</strong></td>
            <td style="text-align:center;"><button type="button" class="action-btn action-btn-delete ch-remove-row" data-table="proc" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join("");
}

// ============================================================
// PRIZE MONEY TABLE
// ============================================================
function renderPrizeFormTable() {
    const tbody = document.getElementById("ch-f-prize-tbody");
    if (formState.prizeRows.length === 0) {
        tbody.innerHTML = `<tr class="ch-empty-row"><td colspan="3">No prize positions added. Click "+ Add Position" if your event has cash prizes.</td></tr>`;
        return;
    }
    tbody.innerHTML = formState.prizeRows.map((row, idx) => `
        <tr>
            <td><input type="text" class="form-input ch-prize-position" data-idx="${idx}" value="${escapeHtml(row.position || '')}" placeholder="e.g. Winner (1st Place)"></td>
            <td><input type="number" min="0" class="form-input ch-prize-amount" data-idx="${idx}" value="${row.amount || ''}" placeholder="₹ Amount"></td>
            <td style="text-align:center;"><button type="button" class="action-btn action-btn-delete ch-remove-row" data-table="prize" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join("");
}

// ============================================================
// JUDGE / GUEST FEE TABLE
// ============================================================
function renderJudgeFormTable() {
    const tbody = document.getElementById("ch-f-judge-tbody");
    if (formState.judgeRows.length === 0) {
        tbody.innerHTML = `<tr class="ch-empty-row"><td colspan="5">No judge / guest fees added. Click "+ Add Judge / Guest" if you're inviting paid judges or guests.</td></tr>`;
        return;
    }
    tbody.innerHTML = formState.judgeRows.map((row, idx) => `
        <tr>
            <td><input type="text" class="form-input ch-judge-desc" data-idx="${idx}" value="${escapeHtml(row.desc || '')}" placeholder="e.g. External Industry Judges"></td>
            <td><input type="number" min="1" class="form-input ch-judge-num" data-idx="${idx}" value="${row.numJudges || ''}" placeholder="Count"></td>
            <td><input type="number" min="0" class="form-input ch-judge-fee" data-idx="${idx}" value="${row.feePerJudge || ''}" placeholder="₹ / Judge"></td>
            <td><strong class="text-indigo ch-judge-total" data-idx="${idx}">${formatCurrency((row.numJudges || 0) * (row.feePerJudge || 0))}</strong></td>
            <td style="text-align:center;"><button type="button" class="action-btn action-btn-delete ch-remove-row" data-table="judge" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join("");
}

// ============================================================
// BUDGET SUMMARY (shown below "Comments if any")
// ============================================================
function computeTotalAsked() {
    const procTotal = formState.procuringRows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.pricePerUnit) || 0), 0);
    const prizeTotal = formState.prizeRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const judgeTotal = formState.judgeRows.reduce((s, r) => s + (parseFloat(r.numJudges) || 0) * (parseFloat(r.feePerJudge) || 0), 0);
    return procTotal + prizeTotal + judgeTotal;
}

function getClubFinance() {
    return state.clubsFinances.find(c => c.club === CURRENT_CLUB) || { club: CURRENT_CLUB, allotted: 0, spent: 0 };
}

// Tile rendering itself now lives in shared/js/budget-summary.js
// (renderBudgetSummaryTiles) so President/Faculty Coordinator's proposal
// review screens render the identical panel for a saved proposal.
function updateBudgetSummary() {
    const el = document.getElementById("ch-f-budget-summary");
    if (!el) return;

    const totalAsked = computeTotalAsked();
    const finance = getClubFinance();
    renderBudgetSummaryTiles(el, { allotted: finance.allotted, spent: finance.spent, totalAsked });
}

// Whether the live (unsaved) form's total ask exceeds the club's remaining budget.
function isFormOverBudget() {
    const finance = getClubFinance();
    return computeTotalAsked() > (finance.allotted - finance.spent);
}

// ============================================================
// EVENT DELEGATION — dynamic table interactions
// ============================================================
function setupFormTableEvents() {
    // ---- Inventory table ----
    const invTbody = document.getElementById("ch-f-inv-tbody");
    invTbody.addEventListener("change", (e) => {
        const idx = e.target.getAttribute("data-idx");
        if (idx === null) return;
        if (e.target.classList.contains("ch-inv-cat")) {
            formState.inventoryRows[idx].category = e.target.value;
            formState.inventoryRows[idx].itemId = null;
            formState.inventoryRows[idx].itemName = "";
            renderInventoryFormTable();
        }
    });
    invTbody.addEventListener("input", (e) => {
        const idx = e.target.getAttribute("data-idx");
        if (idx === null) return;
        if (e.target.classList.contains("ch-inv-qty")) {
            formState.inventoryRows[idx].qty = e.target.value;
        } else if (e.target.classList.contains("ch-inv-unit")) {
            formState.inventoryRows[idx].unit = e.target.value;
        } else if (e.target.classList.contains("ch-req-search")) {
            formState.inventoryRows[idx].itemName = e.target.value;
            formState.inventoryRows[idx].itemId = null; // typing invalidates prior selection until re-picked
            openReqDropdown(idx, e.target, e.target.value);
        }
    });
    invTbody.addEventListener("focusin", (e) => {
        if (e.target.classList.contains("ch-req-search") && !e.target.disabled) {
            const idx = e.target.getAttribute("data-idx");
            openReqDropdown(idx, e.target, e.target.value);
        }
    });
    invTbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".ch-remove-row");
        if (!btn) return;
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        formState.inventoryRows.splice(idx, 1);
        renderInventoryFormTable();
        updateBudgetSummary();
    });

    // Shared dropdown lives outside the table (appended near end of <body>),
    // so its option-click handler is wired up once, globally, below.
    document.getElementById("ch-shared-dropdown").addEventListener("mousedown", (e) => {
        const opt = e.target.closest(".ch-dropdown-option");
        if (!opt) return;
        e.preventDefault();
        const idx = opt.getAttribute("data-idx");
        const itemId = Number(opt.getAttribute("data-item-id"));
        const itemName = opt.getAttribute("data-item-name");
        formState.inventoryRows[idx].itemId = itemId;
        formState.inventoryRows[idx].itemName = itemName;
        hideAllDropdowns();
        renderInventoryFormTable();
    });

    // Reposition/hide behaviour: keep the floating dropdown glued to its input
    // while scrolling, and dismiss it on outside click.
    window.addEventListener("scroll", () => {
        if (activeDropdownIdx === null) return;
        const input = document.querySelector(`.ch-req-search[data-idx="${activeDropdownIdx}"]`);
        if (input) positionSharedDropdown(input); else hideAllDropdowns();
    }, true);
    window.addEventListener("resize", () => {
        if (activeDropdownIdx === null) return;
        const input = document.querySelector(`.ch-req-search[data-idx="${activeDropdownIdx}"]`);
        if (input) positionSharedDropdown(input); else hideAllDropdowns();
    });

    // ---- Procuring table ----
    const procTbody = document.getElementById("ch-f-proc-tbody");
    procTbody.addEventListener("input", (e) => {
        const idx = e.target.getAttribute("data-idx");
        if (idx === null) return;
        const row = formState.procuringRows[idx];
        if (e.target.classList.contains("ch-proc-name")) row.name = e.target.value;
        else if (e.target.classList.contains("ch-proc-qty")) row.qty = e.target.value;
        else if (e.target.classList.contains("ch-proc-unit")) row.unit = e.target.value;
        else if (e.target.classList.contains("ch-proc-price")) row.pricePerUnit = e.target.value;

        if (e.target.classList.contains("ch-proc-qty") || e.target.classList.contains("ch-proc-price")) {
            const totalEl = procTbody.querySelector(`.ch-proc-total[data-idx="${idx}"]`);
            if (totalEl) totalEl.textContent = formatCurrency((parseFloat(row.qty) || 0) * (parseFloat(row.pricePerUnit) || 0));
            updateBudgetSummary();
        }
    });
    procTbody.addEventListener("change", (e) => {
        const idx = e.target.getAttribute("data-idx");
        if (idx === null) return;
        if (e.target.classList.contains("ch-proc-cat")) formState.procuringRows[idx].category = e.target.value;
    });
    procTbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".ch-remove-row");
        if (!btn) return;
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        formState.procuringRows.splice(idx, 1);
        renderProcuringFormTable();
        updateBudgetSummary();
    });

    // ---- Prize table ----
    const prizeTbody = document.getElementById("ch-f-prize-tbody");
    prizeTbody.addEventListener("input", (e) => {
        const idx = e.target.getAttribute("data-idx");
        if (idx === null) return;
        if (e.target.classList.contains("ch-prize-position")) formState.prizeRows[idx].position = e.target.value;
        else if (e.target.classList.contains("ch-prize-amount")) { formState.prizeRows[idx].amount = e.target.value; updateBudgetSummary(); }
    });
    prizeTbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".ch-remove-row");
        if (!btn) return;
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        formState.prizeRows.splice(idx, 1);
        renderPrizeFormTable();
        updateBudgetSummary();
    });

    // ---- Judge table ----
    const judgeTbody = document.getElementById("ch-f-judge-tbody");
    judgeTbody.addEventListener("input", (e) => {
        const idx = e.target.getAttribute("data-idx");
        if (idx === null) return;
        const row = formState.judgeRows[idx];
        if (e.target.classList.contains("ch-judge-desc")) row.desc = e.target.value;
        else if (e.target.classList.contains("ch-judge-num")) row.numJudges = e.target.value;
        else if (e.target.classList.contains("ch-judge-fee")) row.feePerJudge = e.target.value;

        if (e.target.classList.contains("ch-judge-num") || e.target.classList.contains("ch-judge-fee")) {
            const totalEl = judgeTbody.querySelector(`.ch-judge-total[data-idx="${idx}"]`);
            if (totalEl) totalEl.textContent = formatCurrency((parseFloat(row.numJudges) || 0) * (parseFloat(row.feePerJudge) || 0));
            updateBudgetSummary();
        }
    });
    judgeTbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".ch-remove-row");
        if (!btn) return;
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        formState.judgeRows.splice(idx, 1);
        renderJudgeFormTable();
        updateBudgetSummary();
    });

    // ---- Add row buttons ----
    document.getElementById("ch-f-inv-addrow").addEventListener("click", () => {
        formState.inventoryRows.push({ category: "", itemId: null, itemName: "", qty: "", unit: "" });
        renderInventoryFormTable();
    });
    document.getElementById("ch-f-proc-addrow").addEventListener("click", () => {
        formState.procuringRows.push({ name: "", category: "", qty: "", unit: "", pricePerUnit: "" });
        renderProcuringFormTable();
        updateBudgetSummary();
    });
    document.getElementById("ch-f-prize-addrow").addEventListener("click", () => {
        formState.prizeRows.push({ position: "", amount: "" });
        renderPrizeFormTable();
        updateBudgetSummary();
    });
    document.getElementById("ch-f-judge-addrow").addEventListener("click", () => {
        formState.judgeRows.push({ desc: "", numJudges: "", feePerJudge: "" });
        renderJudgeFormTable();
        updateBudgetSummary();
    });

    // Close the open searchable dropdown when clicking anywhere else on the page
    document.addEventListener("mousedown", (e) => {
        if (!e.target.closest(".ch-searchable") && !e.target.closest("#ch-shared-dropdown")) {
            hideAllDropdowns();
        }
    });

    // Venue select meta
    document.getElementById("ch-f-venue").addEventListener("change", (e) => {
        formState.venueId = e.target.value ? Number(e.target.value) : "";
        updateVenueMeta();
    });
    document.getElementById("ch-f-capacity").addEventListener("input", (e) => {
        formState.capacityRequired = e.target.value;
    });
}

// ============================================================
// AI PROPOSAL ASSISTANT — calls /llm/event-proposal-assist so the
// Club Head can draft a proposal from just title + objective +
// expected attendees. Degrades gracefully when the backend (and thus
// Gemini) is unreachable, and to a deterministic template when
// GEMINI_API_KEY isn't set — the response's `source` field says which.
// ============================================================

// Matches an AI-suggested item against the club's real inventory catalog by
// normalized name, so suggestions that exist on campus become Inventory rows
// (lent assets) and anything unknown lands in Procuring Items (self-procured).
function aiMatchInventory(itemName) {
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const q = norm(itemName);
    if (!q) return null;
    const qWords = q.split(" ").filter(w => w.length >= 4);
    return state.inventory.find(inv => {
        const n = norm(inv.name);
        if (!n) return false;
        if (n.includes(q) || q.includes(n)) return true;
        const nWords = n.split(" ").filter(w => w.length >= 4);
        return qWords.some(w => nWords.includes(w));
    }) || null;
}

// Turns the AI's required_inventory list into real form rows. Returns how many
// rows went into each table so the summary panel can tell the user what to check.
function applyAiInventoryToForm(requiredInventory) {
    let addedInv = 0, addedProc = 0;
    (requiredInventory || []).forEach(s => {
        const itemName = (s.item || "").trim();
        if (!itemName) return;
        const qty = (s.quantity && s.quantity > 0) ? s.quantity : 1;
        const match = aiMatchInventory(itemName);
        if (match) {
            // Real lent asset on campus → Inventory & Infrastructure row
            formState.inventoryRows.push({
                category: match.category,
                itemId: match.id,
                itemName: match.name,
                qty, unit: ""
            });
            addedInv++;
        } else {
            // Not in the catalog → suggest it as a self-procured item
            formState.procuringRows.push({
                name: itemName, category: "Materials & Consumables", qty, unit: "", pricePerUnit: ""
            });
            addedProc++;
        }
    });
    return { addedInv, addedProc };
}

function renderAiAssistResult(result, { addedInv, addedProc }) {
    const sourceLabel = result.source === "gemini" ? "Gemini AI" : "Smart Template";
    const badgeCls = result.source === "gemini" ? "badge-indigo" : "badge-secondary";

    const agendaHtml = (result.agenda || []).map(a => `
        <li><strong>${escapeHtml(a.time_slot || "")}</strong> — ${escapeHtml(a.activity || "")}${a.description ? ` <span class="text-muted">(${escapeHtml(a.description)})</span>` : ""}</li>
    `).join("") || `<li class="text-muted">No agenda generated.</li>`;

    const timelineHtml = (result.timeline || []).map(t => `
        <li><strong>${escapeHtml(t.phase || "")}</strong>${t.start_date ? ` <span class="text-muted">(${escapeHtml(t.start_date)}${t.end_date ? " → " + escapeHtml(t.end_date) : ""})</span>` : ""} — ${escapeHtml(t.description || "")}</li>
    `).join("") || `<li class="text-muted">No timeline generated.</li>`;

    const invNotes = [];
    if (addedInv > 0) invNotes.push(`${addedInv} matched your club's inventory and were added under Inventory Requirements`);
    if (addedProc > 0) invNotes.push(`${addedProc} weren't in the catalog and were added under Procuring Items — review quantities and add prices`);
    const invNoteHtml = invNotes.length
        ? `<p class="ch-ai-note"><i class="fa-solid fa-circle-info"></i> ${invNotes.join(". ")}.</p>`
        : "";

    return `
        <div class="ch-ai-result">
            <div class="ch-ai-result-header">
                <span class="badge ${badgeCls}">AI Draft · ${sourceLabel}</span>
                <span class="text-muted" style="font-size:0.72rem;">Edits below were applied to the form — refine them before submitting</span>
            </div>
            <div class="ch-ai-metrics">
                <div class="ch-ai-metric"><span class="ch-ai-metric-lbl">Est. Budget</span><span class="ch-ai-metric-val">${formatCurrency(result.budget_estimate)}</span></div>
                <div class="ch-ai-metric"><span class="ch-ai-metric-lbl">Volunteers</span><span class="ch-ai-metric-val">${result.volunteers_required}</span></div>
            </div>
            <p class="ch-ai-desc">${escapeHtml(result.event_description || "")}</p>
            ${invNoteHtml}
            <details class="ch-ai-details" open>
                <summary>Suggested agenda</summary>
                <ul>${agendaHtml}</ul>
            </details>
            <details class="ch-ai-details">
                <summary>Planning timeline</summary>
                <ul>${timelineHtml}</ul>
            </details>
            <details class="ch-ai-details">
                <summary>Risk assessment</summary>
                <p class="ch-ai-risk">${escapeHtml(result.risk_assessment || "")}</p>
            </details>
        </div>
    `;
}

async function runAiAssist() {
    const titleEl = document.getElementById("ch-f-title");
    const descEl = document.getElementById("ch-f-desc");
    const partsEl = document.getElementById("ch-f-participants");
    const statusEl = document.getElementById("ch-ai-assist-status");
    if (!statusEl) return;

    const event_name = titleEl.value.trim();
    const objective = descEl.value.trim();
    const expected_participants = parseInt(partsEl.value, 10);

    if (!event_name) { showToast("Enter an event title first — the AI drafts around it.", "danger"); titleEl.focus(); return; }
    if (!objective) { showToast("Add a one-line objective in the description so the AI knows the event's purpose.", "danger"); descEl.focus(); return; }
    if (!expected_participants || expected_participants <= 0) { showToast("Enter expected attendees.", "danger"); partsEl.focus(); return; }
    if (typeof Api === "undefined") {
        showToast("AI assist needs the backend to be running — start it and log in again.", "danger");
        return;
    }

    const btn = document.getElementById("btn-ch-ai-assist");
    btn.disabled = true;
    statusEl.classList.remove("hidden");
    statusEl.innerHTML = `
        <div class="ch-ai-loading">
            <i class="fa-solid fa-spinner fa-spin"></i> AI is drafting a proposal for "${escapeHtml(event_name)}"…
        </div>`;
    statusEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
        const result = await Api.eventProposalAssist({ event_name, objective, expected_participants });

        // 1) Expand the description textarea with the AI's full write-up.
        if (result.event_description) {
            descEl.value = result.event_description;
            formState.desc = result.event_description;
        }

        // 2) Turn AI inventory suggestions into real form rows.
        const applied = applyAiInventoryToForm(result.required_inventory);
        renderInventoryFormTable();
        renderProcuringFormTable();
        updateBudgetSummary();

        // 3) Render the summary panel.
        statusEl.innerHTML = renderAiAssistResult(result, applied);
    } catch (e) {
        statusEl.innerHTML = `
            <div class="ch-ai-error">
                <i class="fa-solid fa-circle-exclamation"></i>
                AI assist failed: ${escapeHtml((e && (e.detail || e.message)) || "Unknown error")}
                <span class="text-muted" style="display:block; font-size:0.72rem; margin-top:0.3rem;">
                    Make sure the backend is running and reachable.
                </span>
            </div>`;
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
// CONFLICT CHECKS — inventory availability and venue booking are both
// date/time scoped: an item or venue is only unavailable on the days it's
// actually reserved for an overlapping time range (mirrors
// getRemainingStockForDate in shared/admin/app.js, which drives the same
// calculation on the review side).
// ============================================================
function getRemainingStockForDate(itemId, date, timeRange) {
    const item = state.inventory.find(i => i.id === itemId);
    if (!item) return 0;

    const usedOverlapping = (state.inventoryUsage || [])
        .filter(u => {
            if (u.itemId !== itemId || u.date !== date) return false;
            if (u.status === "Returned") return false;
            const usageTimeRange = u.timeRange || null;
            if (timeRange && usageTimeRange) {
                return timesOverlap(timeRange, usageTimeRange);
            }
            return true;
        })
        .reduce((sum, u) => sum + u.qty, 0);

    return Math.max(item.totalStock - usedOverlapping, 0);
}

// Finds a conflicting confirmed booking for the same venue on the same date
// with an overlapping time range. Only bookings from an ACCEPTED proposal
// (i.e. a real Booking row, created at final approval) count as a conflict —
// another proposal that's merely been sent for approval and hasn't been
// accepted yet does not block this one.
function findVenueConflict(venueId, date, timeRange) {
    const bookingConflict = (state.bookings || []).find(b =>
        b.venueId === venueId && b.date === date && b.status === "Confirmed" && timesOverlap(timeRange, b.timeSlot)
    );
    if (bookingConflict) {
        return { event: bookingConflict.event, club: bookingConflict.club };
    }

    return null;
}

// ============================================================
// VALIDATION + SUBMIT
// ============================================================
function validateAndBuildProposal() {
    const title = document.getElementById("ch-f-title").value.trim();
    const desc = document.getElementById("ch-f-desc").value.trim();
    const date = document.getElementById("ch-f-date").value;
    const timeStart = document.getElementById("ch-f-time-start").value;
    const timeEnd = document.getElementById("ch-f-time-end").value;
    const participants = document.getElementById("ch-f-participants").value;
    const rawVenueId = document.getElementById("ch-f-venue").value;
    const venueId = rawVenueId ? Number(rawVenueId) : "";
    const capacityRequired = document.getElementById("ch-f-capacity").value;
    const comments = document.getElementById("ch-f-comments").value.trim();

    if (!title) { showToast("Please enter an event title.", "danger"); return null; }
    if (!desc) { showToast("Please enter an event description.", "danger"); return null; }
    if (!date) { showToast("Please select a proposed date.", "danger"); return null; }
    if (!timeStart || !timeEnd) { showToast("Please select both a start and end time.", "danger"); return null; }
    if (!participants || participants <= 0) { showToast("Please enter expected attendees.", "danger"); return null; }
    if (!venueId) { showToast("Please select a venue for the event.", "danger"); return null; }

    const venue = state.venues.find(v => v.id === venueId);
    const timeRange = `${timeStart} - ${timeEnd}`;

    // Venue conflict check — block submission if this venue is already
    // booked (or requested by another pending proposal) on an overlapping
    // date/time.
    const venueConflict = findVenueConflict(venueId, date, timeRange);
    if (venueConflict) {
        showToast(
            `Venue conflict: "${venue.name}" is already booked for "${venueConflict.event}" (${venueConflict.club || "another club"}) on ${date} during an overlapping time. Please choose a different venue, date or time.`,
            "danger"
        );
        return null;
    }

    // Inventory rows — only keep fully-filled rows, flag partials
    const inventoryRequirements = [];
    for (const row of formState.inventoryRows) {
        const hasAny = row.category || row.itemId || row.qty || row.unit;
        if (!hasAny) continue;
        if (!row.category || !row.itemId || !row.qty || !row.unit) {
            showToast("Please complete every field in an Inventory Requirement row, or remove it.", "danger");
            return null;
        }

        // Inventory overcommit check — block submission if the requested
        // quantity exceeds what's actually available for this date/time.
        const remaining = getRemainingStockForDate(row.itemId, date, timeRange);
        if (Number(row.qty) > remaining) {
            showToast(
                `Not enough "${row.itemName}" available on ${date}: requested ${row.qty}, only ${remaining} available for that date/time. Please reduce the quantity or pick a different date.`,
                "danger"
            );
            return null;
        }

        inventoryRequirements.push({
            itemId: row.itemId, name: row.itemName, category: row.category,
            qty: Number(row.qty), unit: row.unit, status: "Pending", comment: ""
        });
    }

    // Procuring rows
    const procuringItems = [];
    for (const row of formState.procuringRows) {
        const hasAny = row.name || row.category || row.qty || row.unit || row.pricePerUnit;
        if (!hasAny) continue;
        if (!row.name || !row.category || !row.qty || !row.unit || row.pricePerUnit === "" || row.pricePerUnit === undefined) {
            showToast("Please complete every field in a Procuring Item row, or remove it.", "danger");
            return null;
        }
        const qty = Number(row.qty), price = Number(row.pricePerUnit);
        procuringItems.push({
            name: row.name, category: row.category, qty, unit: row.unit,
            pricePerUnit: price, overallPrice: qty * price, status: "Pending", comment: ""
        });
    }

    // Prize rows
    const prizeMoney = [];
    for (const row of formState.prizeRows) {
        const hasAny = row.position || row.amount;
        if (!hasAny) continue;
        if (!row.position || row.amount === "" || row.amount === undefined) {
            showToast("Please complete every field in a Prize Money row, or remove it.", "danger");
            return null;
        }
        prizeMoney.push({ position: row.position, amount: Number(row.amount), status: "Pending", comment: "" });
    }

    // Judge rows
    const judgeFees = [];
    for (const row of formState.judgeRows) {
        const hasAny = row.desc || row.numJudges || row.feePerJudge;
        if (!hasAny) continue;
        if (!row.desc || !row.numJudges || row.feePerJudge === "" || row.feePerJudge === undefined) {
            showToast("Please complete every field in a Judge / Guest Fee row, or remove it.", "danger");
            return null;
        }
        const qty = Number(row.numJudges), fee = Number(row.feePerJudge);
        judgeFees.push({ name: row.desc, qty, feePerJudge: fee, overallPrice: qty * fee, status: "Pending", comment: "" });
    }

    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const submittedOn = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    return {
        id: editingProposalId || generateId("prop"),
        title, desc,
        organizer: CURRENT_CLUB,
        date,
        time: `${timeStart} - ${timeEnd}`,
        estimatedParticipants: Number(participants),
        status: "Pending",
        submittedOn,
        generalSuggestions: "",
        clubComments: comments,
        venue: {
            venueId: venue.id, venueName: venue.name, location: venue.location,
            capacity: venue.capacity, capacityRequired: Number(capacityRequired) || venue.capacity,
            status: "Pending", suggestion: ""
        },
        inventoryRequirements, procuringItems, prizeMoney, judgeFees
    };
}

async function submitProposal() {
    const proposal = validateAndBuildProposal();
    if (!proposal) return;

    if (isFormOverBudget()) {
        const finance = getClubFinance();
        const shortfall = computeTotalAsked() - (finance.allotted - finance.spent);
        if (!confirm(`This exceeds ${CURRENT_CLUB}'s remaining budget by ${formatCurrency(shortfall)} — the President won't be able to approve it directly; it'll need Faculty Coordinator budget allocation. Submit anyway?`)) {
            return;
        }
    }

    // Revising a proposal that lives on the backend: PATCH the updated fields
    // (this also resets a "Needs Revision" proposal back to Draft), then submit
    // it again so it re-enters the review pipeline from the top. Fall back to a
    // local-only update for proposals that were never persisted (Api offline,
    // or editingProposalId isn't a numeric backend id).
    if (editingProposalId) {
        const isBackendProposal = typeof Api !== "undefined" && typeof editingProposalId === "number";
        if (isBackendProposal) {
            try {
                const backendPayload = {
                    club_id: CURRENT_CLUB_ID,
                    event_name: proposal.title,
                    description: proposal.desc,
                    schedule_date: proposal.date || todayStr(),
                    time_slot: proposal.time,
                    estimated_participants: proposal.estimatedParticipants,
                    capacity_required: proposal.venue ? proposal.venue.capacityRequired : null,
                    venue_id: proposal.venue ? proposal.venue.venueId : null,
                    budget_estimate: computeTotalAsked() || 0
                };
                await Api.updateProposal(editingProposalId, backendPayload);
                const resubmitted = await Api.submitProposal(editingProposalId);
                proposal.id = editingProposalId;
                proposal.status = (resubmitted && resubmitted.status) || "Pending President Review";
            } catch (e) {
                showToast(`Couldn't resubmit proposal: ${e.detail || e.message}`, "danger");
                return;
            }
        }

        const idx = state.proposals.findIndex(p => p.id === editingProposalId);
        if (idx !== -1) state.proposals[idx] = proposal;
        saveState();
        editingProposalId = null;
        resetFormState();
        showView("gallery");
        renderGallery();
        showToast(isBackendProposal
            ? "Proposal resubmitted — sent back to the President."
            : `"${proposal.title}" resubmitted locally -- the backend isn't available, so this won't survive a reload.`, isBackendProposal ? "success" : "info");
        return;
    }

    if (typeof Api !== "undefined" && CURRENT_CLUB_ID) {
        try {
            const created = await Api.createProposal({
                club_id: CURRENT_CLUB_ID,
                event_name: proposal.title,
                description: proposal.desc,
                schedule_date: proposal.date || todayStr(),
                time_slot: proposal.time,
                estimated_participants: proposal.estimatedParticipants,
                capacity_required: proposal.venue ? proposal.venue.capacityRequired : null,
                line_items_json: JSON.stringify({
                    inventoryRequirements: proposal.inventoryRequirements,
                    procuringItems: proposal.procuringItems,
                    prizeMoney: proposal.prizeMoney,
                    judgeFees: proposal.judgeFees
                }),
                venue_id: proposal.venue ? proposal.venue.venueId : null,
                budget_estimate: computeTotalAsked() || 0
            });
            await Api.submitProposal(created.id);
            proposal.id = created.id;
        } catch (e) {
            showToast(`Couldn't submit proposal: ${e.detail || e.message}`, "danger");
            return;
        }
    }

    state.proposals.push(proposal);
    saveState();
    resetFormState();
    showView("gallery");
    renderGallery();
    showToast(`✅ "${proposal.title}" sent to the Club President for approval!`);
}

function cancelForm() {
    if (!confirm("Discard this proposal? Any unsaved changes will be lost.")) return;
    editingProposalId = null;
    resetFormState();
    showView("gallery");
    renderGallery();
}

// ============================================================
// CLUB FINANCES & EVENT BUDGETS (read-only, scoped to CURRENT_CLUB)
// Re-uses the President portal's exact club-detail / event-split-up
// markup, CSS classes, and calculation logic — just pre-filtered to
// this club only, with no allocate/approve/reject actions.
// ============================================================
let activeFinanceEventBudgetId = null;

function getApprovedExpenseTotal(eb) {
    return eb.expenses.filter(e => e.status === "Approved").reduce((acc, e) => acc + (e.billAmount || 0), 0);
}

function getTotalApprovedAmount(eb) {
    return eb.expenses.reduce((acc, e) => acc + (e.approvedAmount || 0), 0);
}

function statusBadgeClassFor(status) {
    if (status === "Pending President Review") return "badge-warning";
    if (status === "Pending Faculty Review") return "badge-indigo";
    if (status === "Approved") return "badge-success";
    if (status === "Rejected") return "badge-danger";
    if (status === "Not Utilized") return "badge-secondary";
    return "badge-secondary"; // Draft, Awaiting Bill
}

// Draft/Rejected items are still editable by the Club Head — not yet sent for processing.
function isEditableStatus(status) {
    return status === "Awaiting Bill" || status === "Draft" || status === "Rejected";
}

// Closes out a Bill Upload task once its linked expense reaches a terminal state that
// needs no further volunteer action (Not Utilized here; Approved is synced from the
// Faculty Coordinator portal once final sign-off happens).
function markLinkedBillTaskVerified(eb, expenseId) {
    const task = (eb.tasks || []).find(t => t.type === "Bill Upload" && t.expenseId === expenseId);
    if (task && task.status !== "Assigned") task.status = "Verified";
}

function reviewActionLabelFor(exp) {
    if (exp.status === "Pending President Review") return `<span class="text-muted" style="font-size:0.75rem;">Awaiting President review</span>`;
    if (exp.status === "Pending Faculty Review") return `<span class="text-muted" style="font-size:0.75rem;">Awaiting Faculty Coordinator review</span>`;
    if (exp.status === "Approved") return `<span class="text-muted" style="font-size:0.75rem;">Verified</span>`;
    if (exp.status === "Not Utilized") return `<span class="text-muted" style="font-size:0.75rem;">Not spent</span>`;
    return "";
}

function renderFinanceDashboard() {
    const cf = getClubFinance();

    document.getElementById("ch-finance-club-name").textContent = cf.club;
    document.getElementById("ch-finance-club-category").textContent = cf.category || "-";

    const remaining = cf.allotted - cf.spent;
    const statsBanner = document.getElementById("ch-finance-stats-banner");
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

    // Event Budget cards — this club's events only
    const gridContainer = document.getElementById("ch-finance-event-grid");
    const clubEventBudgets = state.eventBudgets.filter(eb => eb.club === CURRENT_CLUB);

    if (clubEventBudgets.length === 0) {
        gridContainer.innerHTML = `<div class="empty-state" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No event budgets allocated yet. These appear automatically once the Club President approves one of your proposals.</div>`;
    } else {
        gridContainer.innerHTML = clubEventBudgets.map(eb => {
            const totalExpense = getApprovedExpenseTotal(eb);
            const pendingCount = eb.expenses.filter(e => e.status === "Pending President Review" || e.status === "Pending Faculty Review").length;
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
                headerBadge = `<span class="badge badge-warning">${pendingCount} in review</span>`;
            } else if (awaitingCount > 0) {
                headerBadge = `<span class="badge badge-info">${awaitingCount} need bills</span>`;
            }

            return `
                <div class="event-budget-card ${eb.id === activeFinanceEventBudgetId ? 'active' : ''}" data-id="${eb.id}">
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
                </div>
            `;
        }).join("");
    }

    renderFinanceEventSplit();
}

function renderFinanceEventSplit() {
    const placeholder = document.getElementById("ch-finance-split-placeholder");
    const detailsPane = document.getElementById("ch-finance-split-details");

    const activeEb = state.eventBudgets.find(eb => eb.id === activeFinanceEventBudgetId && eb.club === CURRENT_CLUB);

    if (!activeEb) {
        placeholder.classList.remove("hidden");
        detailsPane.classList.add("hidden");
        return;
    }

    placeholder.classList.add("hidden");
    detailsPane.classList.remove("hidden");

    document.getElementById("ch-split-event-title").textContent = activeEb.eventName;
    document.getElementById("ch-split-event-badge").textContent = activeEb.club;

    const statusBadgeEl = document.getElementById("ch-split-event-status-badge");
    if (activeEb.status === "Closed") {
        statusBadgeEl.textContent = `Closed${activeEb.closedOn ? ' on ' + formatDate(activeEb.closedOn) : ''}`;
        statusBadgeEl.className = "badge badge-secondary";
    } else {
        statusBadgeEl.textContent = "Open";
        statusBadgeEl.className = "badge badge-success";
    }

    const allotted = activeEb.allotted;
    const spent = getApprovedExpenseTotal(activeEb);
    const remaining = allotted - spent;

    document.getElementById("ch-split-allotted-val").textContent = formatCurrency(allotted);
    document.getElementById("ch-split-spent-val").textContent = formatCurrency(spent);
    document.getElementById("ch-split-remaining-val").textContent = formatCurrency(remaining);

    // Donut chart — expenses by category, plus unspent balance
    const segmentsGroup = document.getElementById("ch-donut-segments-group");
    segmentsGroup.innerHTML = "";
    document.getElementById("ch-donut-total-amt").textContent = formatCurrency(allotted);

    const PALETTE = ["#4f46e5", "#10b981", "#f59e0b", "#06b6d4", "#8b5cf6", "#ec4899", "#3b82f6", "#14b8a6"];
    const categoriesMap = {};
    let colorIdx = 0;

    (activeEb.expenses || []).forEach(exp => {
        if (exp.status === "Not Utilized") return;
        const cat = exp.category || (exp.type === "Prize Money" ? "Prize Money" : exp.type === "Judge/Guest Fee" ? "Judge / Guest Fee" : "Materials & Consumables");
        if (!categoriesMap[cat]) {
            categoriesMap[cat] = { sum: 0, color: PALETTE[colorIdx % PALETTE.length] };
            colorIdx++;
        }
        const amt = exp.billAmount !== null && exp.billAmount !== undefined
            ? Number(exp.billAmount)
            : Number(exp.approvedAmount || 0);
        if (!isNaN(amt) && amt > 0) {
            categoriesMap[cat].sum += amt;
        }
    });

    let totalCategorized = 0;
    let chartData = [];
    Object.keys(categoriesMap).forEach(cat => {
        if (categoriesMap[cat].sum > 0) {
            chartData.push({ name: cat, amount: categoriesMap[cat].sum, color: categoriesMap[cat].color });
            totalCategorized += categoriesMap[cat].sum;
        }
    });

    const unallocatedAmt = Math.max(allotted - totalCategorized, 0);
    if (unallocatedAmt > 0) {
        chartData.push({ name: "Unspent Balance", amount: unallocatedAmt, color: "#cbd5e1" });
    }

    const chartBase = Math.max(allotted, totalCategorized);
    let cumulativePercent = 0;
    chartData.forEach(segment => {
        const percent = chartBase > 0 ? (segment.amount / chartBase) * 100 : 0;
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

    const legendList = document.getElementById("ch-split-legend-list");
    legendList.innerHTML = chartData.map(segment => {
        const percent = chartBase > 0 ? Math.round((segment.amount / chartBase) * 100) : 0;
        return `
            <div class="legend-item">
                <div class="legend-color-label">
                    <span class="legend-dot" style="background-color: ${segment.color}"></span>
                    <span>${escapeHtml(segment.name)}</span>
                </div>
                <div class="legend-pct"><span>${formatCurrency(segment.amount)} (${percent}%)</span></div>
            </div>
        `;
    }).join("");

    // Logged Expenses & Bills — the Club Head uploads bills (self-procured items) or payout
    // details (prize money / judge fees) against President-approved line items; the President
    // is the one who approves/rejects them (see the President portal). Split into three
    // separate sections by item type so bills and payout details don't mix in one table.

    // ── Self-Procured Expenses (bill upload) ──
    const selfProcTbody = document.getElementById("ch-split-selfproc-tbody");
    const selfProcExpenses = activeEb.expenses.filter(e => e.type === "Self-Procured Expense");
    if (selfProcExpenses.length === 0) {
        selfProcTbody.innerHTML = `<tr><td colspan="7" class="text-muted text-center" style="padding:1.5rem;">No approved self-procured items for this event.</td></tr>`;
    } else {
        selfProcTbody.innerHTML = selfProcExpenses.map(exp => {
            const overBudget = exp.billAmount != null && exp.billAmount > exp.approvedAmount;
            const billAmountCell = exp.billAmount != null
                ? `<strong>${formatCurrency(exp.billAmount)}</strong>${overBudget ? ` <i class="fa-solid fa-triangle-exclamation text-danger" title="Exceeds approved amount"></i>` : ''}`
                : `<span class="text-muted">—</span>`;

            const billCell = exp.billFileName
                ? (exp.billFileUrl
                    ? `<a class="badge badge-info" href="${SSCMS_API_BASE}${exp.billFileUrl}" target="_blank" rel="noopener" title="Open ${escapeHtml(exp.billFileName)}"><i class="fa-solid fa-paperclip"></i> ${exp.billFileName.length > 16 ? exp.billFileName.slice(0, 14) + '…' : exp.billFileName}</a>`
                    : `<span class="badge badge-info" title="${escapeHtml(exp.billFileName)}"><i class="fa-solid fa-paperclip"></i> ${exp.billFileName.length > 16 ? exp.billFileName.slice(0, 14) + '…' : exp.billFileName}</span>`)
                : exp.status === "Not Utilized"
                    ? `<span class="text-muted" style="font-size:0.75rem;">Not applicable</span>`
                    : `<span class="text-muted" style="font-size:0.75rem;">Not uploaded yet</span>`;

            let actionHtml = "";
            if (activeEb.status === "Closed") {
                actionHtml = `<span class="text-muted" style="font-size:0.75rem;">Closed</span>`;
            } else if (exp.status === "Awaiting Bill") {
                actionHtml = `<button class="btn btn-secondary btn-sm ch-upload-bill-btn" data-id="${exp.id}"><i class="fa-solid fa-upload"></i> Upload Bill</button>`;
            } else if (exp.status === "Draft" || exp.status === "Rejected") {
                actionHtml = `<button class="btn btn-secondary btn-sm ch-upload-bill-btn" data-id="${exp.id}" title="Edit Bill"><i class="fa-solid fa-pen"></i> Edit Bill</button>`;
            } else {
                actionHtml = reviewActionLabelFor(exp);
            }

            return `
                <tr>
                    <td><strong>${escapeHtml(exp.itemName)}</strong></td>
                    <td>${escapeHtml(exp.category)}</td>
                    <td><strong>${formatCurrency(exp.approvedAmount)}</strong></td>
                    <td>${billAmountCell}</td>
                    <td>${billCell}</td>
                    <td><span class="badge ${statusBadgeClassFor(exp.status)}">${exp.status}</span></td>
                    <td class="text-right table-actions">${actionHtml}</td>
                </tr>
            `;
        }).join("");
    }

    // ── Prize Money (student payout details, no bill) ──
    const prizeTbody = document.getElementById("ch-split-prize-tbody");
    const prizeExpenses = activeEb.expenses.filter(e => e.type === "Prize Money");
    if (prizeExpenses.length === 0) {
        prizeTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;">No approved prize money for this event.</td></tr>`;
    } else {
        prizeTbody.innerHTML = prizeExpenses.map(exp => {
            const amountCell = exp.billAmount != null
                ? `<strong>${formatCurrency(exp.billAmount)}</strong>`
                : `<span class="text-muted">—</span>`;

            const detailsCell = exp.prizeDetails
                ? `<span title="Bank details: ${escapeHtml(exp.prizeDetails.bankDetails)}">${escapeHtml(exp.prizeDetails.studentName)} (${escapeHtml(exp.prizeDetails.studentId)}, ${escapeHtml(exp.prizeDetails.department)}) — <span class="badge badge-indigo">${escapeHtml(exp.prizeDetails.affiliation)}</span></span>`
                : exp.status === "Not Utilized"
                    ? `<span class="text-muted" style="font-size:0.75rem;">Not applicable</span>`
                    : `<span class="text-muted" style="font-size:0.75rem;">Not submitted yet</span>`;

            let actionHtml = "";
            if (activeEb.status === "Closed") {
                actionHtml = `<span class="text-muted" style="font-size:0.75rem;">Closed</span>`;
            } else if (exp.status === "Awaiting Bill") {
                actionHtml = `<button class="btn btn-secondary btn-sm ch-prize-details-btn" data-id="${exp.id}"><i class="fa-solid fa-pen"></i> Enter Details</button>`;
            } else if (exp.status === "Draft" || exp.status === "Rejected") {
                actionHtml = `<button class="btn btn-secondary btn-sm ch-prize-details-btn" data-id="${exp.id}" title="Edit Details"><i class="fa-solid fa-pen"></i> Edit Details</button>`;
            } else {
                actionHtml = reviewActionLabelFor(exp);
            }

            return `
                <tr>
                    <td><strong>${escapeHtml(exp.itemName)}</strong></td>
                    <td><strong>${formatCurrency(exp.approvedAmount)}</strong></td>
                    <td>${amountCell}</td>
                    <td>${detailsCell}</td>
                    <td><span class="badge ${statusBadgeClassFor(exp.status)}">${exp.status}</span></td>
                    <td class="text-right table-actions">${actionHtml}</td>
                </tr>
            `;
        }).join("");
    }

    // ── Judge / Guest Fees (judge payout details, no bill) ──
    const judgeTbody = document.getElementById("ch-split-judge-tbody");
    const judgeExpenses = activeEb.expenses.filter(e => e.type === "Judge/Guest Fee");
    if (judgeExpenses.length === 0) {
        judgeTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;">No approved judge/guest fees for this event.</td></tr>`;
    } else {
        judgeTbody.innerHTML = judgeExpenses.map(exp => {
            const amountCell = exp.billAmount != null
                ? `<strong>${formatCurrency(exp.billAmount)}</strong>`
                : `<span class="text-muted">—</span>`;

            const detailsCell = exp.judgeDetails
                ? `<span title="Bank details: ${escapeHtml(exp.judgeDetails.bankDetails)}">${escapeHtml(exp.judgeDetails.judgeName)} (${escapeHtml(exp.judgeDetails.contactNumber)})</span>`
                : exp.status === "Not Utilized"
                    ? `<span class="text-muted" style="font-size:0.75rem;">Not applicable</span>`
                    : `<span class="text-muted" style="font-size:0.75rem;">Not submitted yet</span>`;

            let actionHtml = "";
            if (activeEb.status === "Closed") {
                actionHtml = `<span class="text-muted" style="font-size:0.75rem;">Closed</span>`;
            } else if (exp.status === "Awaiting Bill") {
                actionHtml = `<button class="btn btn-secondary btn-sm ch-judge-details-btn" data-id="${exp.id}"><i class="fa-solid fa-pen"></i> Enter Details</button>`;
            } else if (exp.status === "Draft" || exp.status === "Rejected") {
                actionHtml = `<button class="btn btn-secondary btn-sm ch-judge-details-btn" data-id="${exp.id}" title="Edit Details"><i class="fa-solid fa-pen"></i> Edit Details</button>`;
            } else {
                actionHtml = reviewActionLabelFor(exp);
            }

            return `
                <tr>
                    <td><strong>${escapeHtml(exp.itemName)}</strong></td>
                    <td><strong>${formatCurrency(exp.approvedAmount)}</strong></td>
                    <td>${amountCell}</td>
                    <td>${detailsCell}</td>
                    <td><span class="badge ${statusBadgeClassFor(exp.status)}">${exp.status}</span></td>
                    <td class="text-right table-actions">${actionHtml}</td>
                </tr>
            `;
        }).join("");
    }

    const commentBox = document.getElementById("ch-split-bill-comment");
    if (commentBox) commentBox.value = activeEb.comment || "";

    // ── Send for Processing — bulk-forwards every drafted item to the President ──
    const sendBtn = document.getElementById("btn-ch-send-for-processing");
    const sendStatusLine = document.getElementById("ch-send-for-processing-status");
    if (sendBtn && sendStatusLine) {
        const sendableCount = activeEb.expenses.filter(e => isEditableStatus(e.status)).length;
        const inReviewCount = activeEb.expenses.filter(e => e.status === "Pending President Review" || e.status === "Pending Faculty Review").length;

        if (activeEb.status === "Closed") {
            sendBtn.disabled = true;
            sendStatusLine.textContent = "This event's finances are closed.";
        } else if (sendableCount > 0) {
            sendBtn.disabled = false;
            sendStatusLine.textContent = inReviewCount > 0 ? `${inReviewCount} item(s) already under review.` : "";
        } else if (inReviewCount > 0) {
            sendBtn.disabled = true;
            sendStatusLine.textContent = "All items sent — awaiting review.";
        } else {
            sendBtn.disabled = false;
            sendStatusLine.textContent = "";
        }
    }
}

// Bulk-forwards this event's drafted/rejected line items to the President for first-level
// review; anything left untouched (still "Awaiting Bill") is finalized as "Not Utilized"
// since nothing was spent on it. The President later forwards approved items on to the
// Faculty Coordinator for final sign-off (see the President portal).
async function sendExpensesForProcessing() {
    const activeEb = state.eventBudgets.find(eb => eb.id === activeFinanceEventBudgetId && eb.club === CURRENT_CLUB);
    if (!activeEb || activeEb.status === "Closed") return;

    const commentBox = document.getElementById("ch-split-bill-comment");
    const comment = commentBox ? commentBox.value.trim() : activeEb.comment;

    const sendable = activeEb.expenses.filter(e => isEditableStatus(e.status));
    if (sendable.length === 0) {
        showToast("Nothing new to send — every item has already been submitted or finalized.", "info");
        return;
    }

    try {
        await Api.updateEventBudgetComment(activeEb.id, comment);
        await Api.sendEventBudgetForProcessing(activeEb.id);
    } catch (err) {
        showToast(`Couldn't send for processing: ${err.detail || err.message}`, "danger");
        return;
    }

    await loadState();
    renderFinanceDashboard();
    showToast(`Sent "${activeEb.eventName}"'s expenses to the President for first-level approval.`, "info");
}

// ── "Upload Bill" modal (Club Head only — attaches a bill to a President-approved line item) ──
// openModal/closeModal now live in shared/js/modal.js (loaded before this file).

function openUploadBillModal(expId) {
    // Looked up by expense id alone (not the active Finances-tab event) so this also works
    // when opened from Event Management's Bill Upload task cards.
    const activeEb = state.eventBudgets.find(eb => eb.club === CURRENT_CLUB && eb.expenses.some(x => x.id === expId));
    if (!activeEb) return;
    const exp = activeEb.expenses.find(x => x.id === expId);
    if (!exp) return;

    document.getElementById("form-ch-upload-bill").reset();
    document.getElementById("ch-upload-bill-expense-id").value = exp.id;
    document.getElementById("ch-upload-bill-item-display").value = exp.itemName;
    document.getElementById("ch-upload-bill-approved-display").value = formatCurrency(exp.approvedAmount);
    document.getElementById("ch-upload-bill-amount").value = exp.billAmount ? exp.billAmount : "";
    document.getElementById("ch-upload-bill-file-hint").textContent = exp.billFileName
        ? `Current file: ${exp.billFileName} — choose a new file only to replace it.`
        : "";
    document.getElementById("ch-upload-bill-modal-title").textContent =
        (exp.status === "Draft" || exp.status === "Rejected") ? "Edit Bill for Item" : "Upload Bill for Approved Item";
    openModal("modal-ch-upload-bill");
}

async function submitUploadBill(e) {
    e.preventDefault();
    const expId = Number(document.getElementById("ch-upload-bill-expense-id").value);
    const activeEb = state.eventBudgets.find(eb => eb.club === CURRENT_CLUB && eb.expenses.some(x => x.id === expId));
    if (!activeEb) return;

    const exp = activeEb.expenses.find(x => x.id === expId);
    if (!exp) return;

    const rawAmount = document.getElementById("ch-upload-bill-amount").value.trim();
    const fileInput = document.getElementById("ch-upload-bill-file");
    const billFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

    if (isFileTooLarge(billFile)) {
        showToast(`Bill file is too large — please upload something under ${MAX_UPLOAD_MB}MB.`, "danger");
        return;
    }

    // Amount left blank or 0 — nothing was spent on this item, no bill needed.
    if (rawAmount === "" || Number(rawAmount) === 0) {
        try {
            await Api.uploadExpenseBill(expId, 0, null);
        } catch (err) {
            showToast(`Couldn't save: ${err.detail || err.message}`, "danger");
            return;
        }
        markLinkedBillTaskVerified(activeEb, exp.id);
        await loadState();
        closeModal("modal-ch-upload-bill");
        renderFinanceDashboard();
        if (activeEventMgmtId) renderEventMgmtDetail();
        showToast(`Marked "${exp.itemName}" as not spent.`, "info");
        return;
    }

    if (!billFile && !exp.billFileName) {
        showToast("Please upload a bill, or leave the amount as 0 / blank if nothing was spent.", "danger");
        return;
    }

    if (isNaN(Number(rawAmount)) || Number(rawAmount) < 0) {
        showToast("Enter a valid bill amount (0 or greater).", "danger");
        return;
    }

    try {
        await Api.uploadExpenseBill(expId, Number(rawAmount), billFile);
    } catch (err) {
        showToast(`Couldn't save bill: ${err.detail || err.message}`, "danger");
        return;
    }

    await loadState();
    closeModal("modal-ch-upload-bill");
    renderFinanceDashboard();
    if (activeEventMgmtId) renderEventMgmtDetail();
    showToast(`Bill saved for "${exp.itemName}" — click "Send for Processing" when you're ready to submit it.`, "info");
}

// ── "Enter Prize Details" modal (Club Head only — student payout details, no bill) ──
function openPrizeDetailsModal(expId) {
    const activeEb = state.eventBudgets.find(eb => eb.id === activeFinanceEventBudgetId && eb.club === CURRENT_CLUB);
    if (!activeEb) return;
    const exp = activeEb.expenses.find(x => x.id === expId);
    if (!exp) return;

    document.getElementById("form-ch-prize-details").reset();
    document.getElementById("ch-prize-expense-id").value = exp.id;
    document.getElementById("ch-prize-item-display").value = exp.itemName;
    document.getElementById("ch-prize-approved-display").value = formatCurrency(exp.approvedAmount);
    document.getElementById("ch-prize-amount").value = exp.billAmount ? exp.billAmount : "";
    if (exp.prizeDetails) {
        document.getElementById("ch-prize-student-name").value = exp.prizeDetails.studentName || "";
        document.getElementById("ch-prize-student-id").value = exp.prizeDetails.studentId || "";
        document.getElementById("ch-prize-department").value = exp.prizeDetails.department || "";
        document.getElementById("ch-prize-bank-details").value = exp.prizeDetails.bankDetails || "";
        const affiliationRadio = document.querySelector(`input[name="ch-prize-affiliation"][value="${exp.prizeDetails.affiliation}"]`);
        if (affiliationRadio) affiliationRadio.checked = true;
    }
    document.getElementById("ch-prize-details-modal-title").textContent =
        (exp.status === "Draft" || exp.status === "Rejected") ? "Edit Prize Money Details" : "Enter Prize Money Details";
    openModal("modal-ch-prize-details");
}

async function submitPrizeDetails(e) {
    e.preventDefault();
    const activeEb = state.eventBudgets.find(eb => eb.id === activeFinanceEventBudgetId && eb.club === CURRENT_CLUB);
    if (!activeEb) return;

    const expId = Number(document.getElementById("ch-prize-expense-id").value);
    const exp = activeEb.expenses.find(x => x.id === expId);
    if (!exp) return;

    const rawAmount = document.getElementById("ch-prize-amount").value.trim();

    if (rawAmount === "" || Number(rawAmount) === 0) {
        try {
            await Api.submitExpensePrizeDetails(expId, { bill_amount: 0 });
        } catch (err) {
            showToast(`Couldn't save: ${err.detail || err.message}`, "danger");
            return;
        }
        await loadState();
        closeModal("modal-ch-prize-details");
        renderFinanceDashboard();
        showToast(`Marked "${exp.itemName}" as not given out.`, "info");
        return;
    }

    const studentName = document.getElementById("ch-prize-student-name").value.trim();
    const studentId = document.getElementById("ch-prize-student-id").value.trim();
    const department = document.getElementById("ch-prize-department").value.trim();
    const affiliation = (document.querySelector('input[name="ch-prize-affiliation"]:checked') || {}).value || "Intra-College";
    const bankDetails = document.getElementById("ch-prize-bank-details").value.trim();

    if (!studentName || !studentId || !department || !bankDetails) {
        showToast("Please fill in the student's name, roll no, department, and bank details, or leave the amount as 0 / blank if not given out.", "danger");
        return;
    }

    if (isNaN(Number(rawAmount)) || Number(rawAmount) < 0) {
        showToast("Enter a valid prize amount (0 or greater).", "danger");
        return;
    }

    try {
        await Api.submitExpensePrizeDetails(expId, {
            bill_amount: Number(rawAmount), student_name: studentName, student_id: studentId,
            department, affiliation, bank_details: bankDetails
        });
    } catch (err) {
        showToast(`Couldn't save prize details: ${err.detail || err.message}`, "danger");
        return;
    }

    await loadState();
    closeModal("modal-ch-prize-details");
    renderFinanceDashboard();
    showToast(`Prize money details saved for "${exp.itemName}" — click "Send for Processing" when you're ready to submit it.`, "info");
}

// ── "Enter Judge Details" modal (Club Head only — judge/guest payout details, no bill) ──
function openJudgeDetailsModal(expId) {
    const activeEb = state.eventBudgets.find(eb => eb.id === activeFinanceEventBudgetId && eb.club === CURRENT_CLUB);
    if (!activeEb) return;
    const exp = activeEb.expenses.find(x => x.id === expId);
    if (!exp) return;

    document.getElementById("form-ch-judge-details").reset();
    document.getElementById("ch-judge-expense-id").value = exp.id;
    document.getElementById("ch-judge-item-display").value = exp.itemName;
    document.getElementById("ch-judge-approved-display").value = formatCurrency(exp.approvedAmount);
    document.getElementById("ch-judge-amount").value = exp.billAmount ? exp.billAmount : "";
    if (exp.judgeDetails) {
        document.getElementById("ch-judge-name").value = exp.judgeDetails.judgeName || "";
        document.getElementById("ch-judge-contact").value = exp.judgeDetails.contactNumber || "";
        document.getElementById("ch-judge-bank-details").value = exp.judgeDetails.bankDetails || "";
    }
    document.getElementById("ch-judge-details-modal-title").textContent =
        (exp.status === "Draft" || exp.status === "Rejected") ? "Edit Judge / Guest Fee Details" : "Enter Judge / Guest Fee Details";
    openModal("modal-ch-judge-details");
}

async function submitJudgeDetails(e) {
    e.preventDefault();
    const activeEb = state.eventBudgets.find(eb => eb.id === activeFinanceEventBudgetId && eb.club === CURRENT_CLUB);
    if (!activeEb) return;

    const expId = Number(document.getElementById("ch-judge-expense-id").value);
    const exp = activeEb.expenses.find(x => x.id === expId);
    if (!exp) return;

    const rawAmount = document.getElementById("ch-judge-amount").value.trim();

    if (rawAmount === "" || Number(rawAmount) === 0) {
        try {
            await Api.submitExpenseJudgeDetails(expId, { bill_amount: 0 });
        } catch (err) {
            showToast(`Couldn't save: ${err.detail || err.message}`, "danger");
            return;
        }
        await loadState();
        closeModal("modal-ch-judge-details");
        renderFinanceDashboard();
        showToast(`Marked "${exp.itemName}" as not paid out.`, "info");
        return;
    }

    const judgeName = document.getElementById("ch-judge-name").value.trim();
    const contactNumber = document.getElementById("ch-judge-contact").value.trim();
    const bankDetails = document.getElementById("ch-judge-bank-details").value.trim();

    if (!judgeName || !contactNumber || !bankDetails) {
        showToast("Please fill in the judge/guest's name, contact number, and bank details, or leave the amount as 0 / blank if not paid out.", "danger");
        return;
    }

    if (isNaN(Number(rawAmount)) || Number(rawAmount) < 0) {
        showToast("Enter a valid fee amount (0 or greater).", "danger");
        return;
    }

    try {
        await Api.submitExpenseJudgeDetails(expId, {
            bill_amount: Number(rawAmount), judge_name: judgeName, judge_contact: contactNumber, bank_details: bankDetails
        });
    } catch (err) {
        showToast(`Couldn't save judge/guest details: ${err.detail || err.message}`, "danger");
        return;
    }

    await loadState();
    closeModal("modal-ch-judge-details");
    renderFinanceDashboard();
    showToast(`Judge/guest fee details saved for "${exp.itemName}" — click "Send for Processing" when you're ready to submit it.`, "info");
}

// ============================================================
// MANAGE MEMBERS (Club Head)
// ============================================================
function renderMembers() {
    const clubMembers = state.clubMembers.filter(m => (m.clubId && Number(m.clubId) === Number(CURRENT_CLUB_ID)) || m.club === CURRENT_CLUB);
    const pending = clubMembers.filter(m => m.status === "Pending");
    const active = clubMembers.filter(m => m.status === "Active");

    const pendingCountEl = document.getElementById("ch-members-pending-count");
    pendingCountEl.textContent = `${pending.length} Pending Request${pending.length === 1 ? '' : 's'}`;
    pendingCountEl.className = pending.length > 0 ? "badge badge-warning" : "badge badge-success";

    const pendingTbody = document.getElementById("ch-members-pending-tbody");
    if (pending.length === 0) {
        pendingTbody.innerHTML = `<tr><td colspan="7" class="text-muted text-center" style="padding:1.5rem;">No pending join requests right now.</td></tr>`;
    } else {
        pendingTbody.innerHTML = pending.map(m => `
            <tr>
                <td><strong>${escapeHtml(m.name)}</strong></td>
                <td><code>${escapeHtml(m.studentId)}</code></td>
                <td>${escapeHtml(m.email)}</td>
                <td>${escapeHtml(m.department)}</td>
                <td>${escapeHtml(m.year)}</td>
                <td>${formatDate(m.appliedOn)}</td>
                <td class="text-right table-actions">
                    <button class="action-btn action-btn-success ch-approve-member-btn" data-id="${m.id}" title="Approve"><i class="fa-solid fa-check"></i></button>
                    <button class="action-btn action-btn-delete ch-reject-member-btn" data-id="${m.id}" title="Reject"><i class="fa-solid fa-xmark"></i></button>
                </td>
            </tr>
        `).join("");
    }

    const activeTbody = document.getElementById("ch-members-active-tbody");
    if (active.length === 0) {
        activeTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;">No active members yet.</td></tr>`;
    } else {
        activeTbody.innerHTML = active.map(m => {
            // Category-bubble pattern (matches the item-name badges in the proposal
            // tables): the member's name, with one badge-indigo pill per selected
            // volunteer domain stacked directly underneath. Shows the domain's
            // actual title (e.g. "Music & Performance") rather than the generic
            // "Domain 1" slot label.
            const selectedDomains = state.volunteerApplications
                .filter(a => a.club === CURRENT_CLUB && a.status === "Selected" && a.studentId === m.studentId)
                .map(a => state.domains.find(dm => dm.id === a.domainId))
                .filter(Boolean);
            const bubbles = selectedDomains
                .map(d => `<br><span class="badge ${domainBadgeClass(d)}" style="font-size:0.7rem; margin-top:0.2rem;">${escapeHtml(d.title)}</span>`)
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
}

async function approveMember(id) {
    id = Number(id); // data-id attributes are always strings; backend ids are numeric
    const m = state.clubMembers.find(x => x.id === id);
    if (!m) return;
    try {
        await Api.reviewMembership(m.clubId, id, true);
    } catch (e) {
        showToast(`Couldn't approve ${m.name}: ${e.detail || e.message}`, "danger");
        return;
    }
    m.status = "Active";
    m.joinedOn = todayStr();
    delete m.appliedOn;
    logHistory(m, "Approved join request");
    saveState();
    renderMembers();
    showToast(`${m.name} was approved and added to ${CURRENT_CLUB}.`);
}

async function rejectMember(id) {
    id = Number(id);
    const m = state.clubMembers.find(x => x.id === id);
    if (!m) return;
    if (!confirm(`Reject ${m.name}'s request to join ${CURRENT_CLUB}?`)) return;
    try {
        await Api.reviewMembership(m.clubId, id, false);
    } catch (e) {
        showToast(`Couldn't reject ${m.name}: ${e.detail || e.message}`, "danger");
        return;
    }
    state.clubMembers = state.clubMembers.filter(x => x.id !== id);
    saveState();
    renderMembers();
    showToast(`${m.name}'s join request was rejected.`, "danger");
}

// ============================================================
// VOLUNTEER MANAGEMENT (Club Head)
// ============================================================
function renderVolunteerManagement() {
    renderDomainCards();
    renderVolunteerApplications();
    renderDomainVolunteerDetails();
}

function renderDomainCards() {
    const grid = document.getElementById("ch-domains-grid");
    const domains = state.domains.filter(d => d.club === CURRENT_CLUB);
    grid.innerHTML = domains.map(d => {
        const isOpen = d.recruitmentOpen;
        const appCount = state.volunteerApplications.filter(a => a.club === CURRENT_CLUB && a.domainId === d.id).length;
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
                    <div style="display:flex; gap:0.4rem;">
                        <button type="button" class="btn btn-sm ${isOpen ? 'btn-secondary' : 'btn-primary'} ch-toggle-recruitment-btn" data-id="${d.id}">
                            <i class="fa-solid ${isOpen ? 'fa-lock' : 'fa-bullhorn'}"></i> ${isOpen ? 'Close Recruitment' : 'Send Recruitment'}
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary ch-delete-domain-btn" data-id="${d.id}" title="Delete domain" style="border-color:var(--danger); color:var(--danger);">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// Adds a new recruitment domain for CURRENT_CLUB — Club Head-authored, not seeded.
// Note: the backend Domain model doesn't store the free-text `roles` duty
// list yet, so it's kept client-side only and won't survive a page reload.
async function addDomain(name, title, roles) {
    let created;
    try {
        created = await Api.createDomain(CURRENT_CLUB_ID, title, false);
    } catch (e) {
        showToast(`Couldn't create domain: ${e.detail || e.message}`, "danger");
        return;
    }
    state.domains.push({
        id: created.id,
        club: CURRENT_CLUB,
        clubId: CURRENT_CLUB_ID,
        name,
        title,
        recruitmentOpen: created.recruitment_open,
        openedOn: created.opened_on,
        roles
    });
    saveState();
    renderDomainCards();
    showToast(`Domain "${name}" added.`);
}

// Blocks deletion while volunteers are still Pending/Selected against this
// domain, so nobody's application silently disappears (also enforced
// server-side -- see app.routers.clubs.delete_domain).
async function deleteDomain(domainId) {
    domainId = Number(domainId);
    const d = state.domains.find(x => x.id === domainId);
    if (!d) return;

    const hasActiveApps = state.volunteerApplications.some(a => a.domainId === domainId && (a.status === "Pending" || a.status === "Selected"));
    if (hasActiveApps) {
        showToast(`Can't delete "${d.name}" — it still has Pending or Selected volunteer applications. Resolve or revoke those first.`, "danger");
        return;
    }

    if (!confirm(`Delete domain "${d.name}" (${d.title})? This can't be undone.`)) return;

    if (!(await callApi(() => Api.deleteDomain(domainId), `Couldn't delete "${d.name}"`)).ok) return;

    state.domains = state.domains.filter(x => x.id !== domainId);
    saveState();
    renderDomainCards();
    showToast(`Domain "${d.name}" deleted.`, "danger");
}

async function toggleDomainRecruitment(domainId) {
    domainId = Number(domainId);
    const d = state.domains.find(x => x.id === domainId);
    if (!d) return;
    const nextOpen = !d.recruitmentOpen;
    try {
        await Api.toggleRecruitment(domainId, nextOpen);
    } catch (e) {
        showToast(`Couldn't update recruitment: ${e.detail || e.message}`, "danger");
        return;
    }
    d.recruitmentOpen = nextOpen;
    if (d.recruitmentOpen) d.openedOn = todayStr();
    saveState();
    renderDomainCards();
    showToast(
        d.recruitmentOpen
            ? `Recruitment sent for ${d.name} (${d.title}) — members can now apply.`
            : `Recruitment closed for ${d.name}.`,
        d.recruitmentOpen ? "success" : "info"
    );
}

function renderVolunteerApplications() {
    const tbody = document.getElementById("ch-volunteer-apps-tbody");
    const apps = state.volunteerApplications.filter(a => a.club === CURRENT_CLUB);

    if (apps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-center" style="padding:1.5rem;">No volunteer applications yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = apps.map(a => {
        const domain = state.domains.find(d => d.id === a.domainId);
        let statusClass = "badge-warning";
        if (a.status === "Selected") statusClass = "badge-success";
        if (a.status === "Rejected") statusClass = "badge-danger";
        if (a.status === "Revoked") statusClass = "badge-outline-warning";

        let actionHtml = "";
        if (a.status === "Pending") {
            actionHtml = `
                <button class="action-btn action-btn-success ch-select-app-btn" data-id="${a.id}" title="Select"><i class="fa-solid fa-check"></i></button>
                <button class="action-btn action-btn-delete ch-reject-app-btn" data-id="${a.id}" title="Reject"><i class="fa-solid fa-xmark"></i></button>
            `;
        } else if (a.status === "Selected") {
            actionHtml = `<button class="btn btn-secondary btn-sm ch-revoke-app-btn" data-id="${a.id}" title="Revoke selection" style="border-color:var(--danger); color:var(--danger);"><i class="fa-solid fa-user-slash"></i> Revoke</button>`;
        } else {
            actionHtml = `<button class="btn btn-secondary btn-sm ch-reopen-app-btn" data-id="${a.id}" title="Re-open for review"><i class="fa-solid fa-rotate-left"></i> Re-review</button>`;
        }

        return `
            <tr>
                <td><strong>${escapeHtml(a.applicantName)}</strong></td>
                <td><code>${escapeHtml(a.studentId)}</code></td>
                <td><span class="badge badge-indigo">${escapeHtml(domain ? domain.name : "-")}</span></td>
                <td>${formatDate(a.appliedOn)}</td>
                <td style="max-width:220px; font-size:0.8rem; color:var(--text-muted);">${escapeHtml(a.note || "-")}</td>
                <td><span class="badge ${statusClass}">${a.status}</span></td>
                <td class="text-right table-actions">${actionHtml}</td>
            </tr>
        `;
    }).join("");
}

async function selectApplication(id) {
    id = Number(id);
    const a = state.volunteerApplications.find(x => x.id === id);
    if (!a) return;
    try {
        await Api.reviewVolunteerApplication(a.clubId, id, true);
    } catch (e) {
        showToast(`Couldn't select ${a.applicantName}: ${e.detail || e.message}`, "danger");
        return;
    }
    a.status = "Selected";
    logHistory(a, "Selected as volunteer");
    saveState();
    renderVolunteerManagement();
    showToast(`${a.applicantName} was selected as a volunteer!`);
}

async function rejectApplication(id) {
    id = Number(id);
    const a = state.volunteerApplications.find(x => x.id === id);
    if (!a) return;
    try {
        await Api.reviewVolunteerApplication(a.clubId, id, false);
    } catch (e) {
        showToast(`Couldn't reject ${a.applicantName}: ${e.detail || e.message}`, "danger");
        return;
    }
    a.status = "Rejected";
    logHistory(a, "Rejected application");
    saveState();
    renderVolunteerManagement();
    showToast(`${a.applicantName}'s application was rejected.`, "danger");
}

async function reopenApplication(id) {
    id = Number(id);
    const a = state.volunteerApplications.find(x => x.id === id);
    if (!a) return;
    if (!(await callApi(() => Api.reopenVolunteerApplication(a.clubId, id), `Couldn't reopen ${a.applicantName}'s application`)).ok) return;
    a.status = "Pending";
    logHistory(a, "Re-opened for review");
    saveState();
    renderVolunteerManagement();
}

// Pulls an already-Selected volunteer back out. Distinct from Rejected so the
// Club Head can tell "never selected" apart from "selected, then pulled" —
// and cancels any of their not-yet-verified tasks so they don't linger.
async function revokeApplication(id) {
    id = Number(id);
    const a = state.volunteerApplications.find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Revoke ${a.applicantName}'s volunteer selection? Any of their unfinished tasks for this club will be cancelled.`)) return;

    if (!(await callApi(() => Api.revokeVolunteerApplication(a.clubId, id), `Couldn't revoke ${a.applicantName}'s selection`)).ok) return;

    a.status = "Revoked";
    a.revokedOn = todayStr();
    logHistory(a, "Revoked volunteer selection");
    (state.eventBudgets || []).forEach(eb => {
        if (eb.club !== a.club) return;
        (eb.tasks || []).forEach(t => {
            if (t.assignedVolunteerId === a.studentId && t.status !== "Verified") {
                t.status = "Revoked";
            }
        });
    });
    saveState();
    renderVolunteerManagement();
    showToast(`${a.applicantName}'s volunteer selection was revoked.`, "danger");
}

function renderDomainVolunteerDetails() {
    const grid = document.getElementById("ch-domain-volunteers-grid");
    const domains = state.domains.filter(d => d.club === CURRENT_CLUB);

    grid.innerHTML = domains.map(d => {
        const volunteers = state.volunteerApplications.filter(a => a.club === CURRENT_CLUB && a.domainId === d.id && a.status === "Selected");
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

function setupMembershipEvents() {
    document.getElementById("ch-members-pending-tbody").addEventListener("click", (e) => {
        const approveBtn = e.target.closest(".ch-approve-member-btn");
        if (approveBtn) { approveMember(approveBtn.getAttribute("data-id")); return; }
        const rejectBtn = e.target.closest(".ch-reject-member-btn");
        if (rejectBtn) { rejectMember(rejectBtn.getAttribute("data-id")); return; }
    });

    document.getElementById("ch-domains-grid").addEventListener("click", (e) => {
        const toggleBtn = e.target.closest(".ch-toggle-recruitment-btn");
        if (toggleBtn) { toggleDomainRecruitment(toggleBtn.getAttribute("data-id")); return; }
        const deleteBtn = e.target.closest(".ch-delete-domain-btn");
        if (deleteBtn) { deleteDomain(deleteBtn.getAttribute("data-id")); return; }
    });

    const btnAddDomain = document.getElementById("btn-ch-add-domain");
    if (btnAddDomain) {
        btnAddDomain.addEventListener("click", () => {
            document.getElementById("form-ch-add-domain").reset();
            openModal("modal-ch-add-domain");
        });
    }

    const formAddDomain = document.getElementById("form-ch-add-domain");
    if (formAddDomain) {
        formAddDomain.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("ch-domain-name").value.trim();
            const title = document.getElementById("ch-domain-title").value.trim();
            const roles = document.getElementById("ch-domain-roles").value.split("\n").map(r => r.trim()).filter(Boolean);
            if (!name || !title || roles.length === 0) {
                alert("Please fill in a name, title, and at least one role.");
                return;
            }
            addDomain(name, title, roles);
            closeModal("modal-ch-add-domain");
        });
    }

    document.getElementById("ch-volunteer-apps-tbody").addEventListener("click", (e) => {
        const selectBtn = e.target.closest(".ch-select-app-btn");
        if (selectBtn) { selectApplication(selectBtn.getAttribute("data-id")); return; }
        const rejectBtn = e.target.closest(".ch-reject-app-btn");
        if (rejectBtn) { rejectApplication(rejectBtn.getAttribute("data-id")); return; }
        const revokeBtn = e.target.closest(".ch-revoke-app-btn");
        if (revokeBtn) { revokeApplication(revokeBtn.getAttribute("data-id")); return; }
        const reopenBtn = e.target.closest(".ch-reopen-app-btn");
        if (reopenBtn) { reopenApplication(reopenBtn.getAttribute("data-id")); return; }
    });
}

// ============================================================
// EVENT MANAGEMENT (Club Head) — approved events as cards, with a
// 4-toggle detail workspace: Approved Details / Task Allotment /
// Registrations / Edit & Publish.
// ============================================================
let activeEventMgmtId = null;
let activeEmToggle = "details";
let qrScannerStream = null;
let qrScannerRAF = null;
// Events whose backend registration roster has been auto-synced this session,
// so the Registrations pane fetches the real roster once instead of on every render.
const syncedBackendEvents = new Set();

function getEventVolunteers(club) {
    return state.volunteerApplications.filter(v => v.club === club && v.status === "Selected");
}

// Domain color palette — assigns each recruitment domain a stable, distinct
// color (by its "Domain N" slot number, falling back to a hash of its id)
// so the same domain reads as the same color everywhere it's shown: the
// Manage Members roster bubbles and the task-allocation volunteer dropdowns.
const DOMAIN_BADGE_CLASSES = ["badge-domain-1", "badge-domain-2", "badge-domain-3", "badge-domain-4", "badge-domain-5", "badge-domain-6"];
const DOMAIN_BADGE_HEX = [
    { bg: "#f3e8ff", fg: "#7c3aed" },
    { bg: "#f0fdfa", fg: "#0d9488" },
    { bg: "#fdf2f8", fg: "#db2777" },
    { bg: "#fff7ed", fg: "#ea580c" },
    { bg: "#eff6ff", fg: "#2563eb" },
    { bg: "#f7fee7", fg: "#65a30d" }
];
function domainColorIndex(domain) {
    if (!domain) return 0;
    const match = /Domain (\d+)/.exec(domain.name || "");
    if (match) return (parseInt(match[1], 10) - 1) % DOMAIN_BADGE_CLASSES.length;
    let hash = 0;
    for (let i = 0; i < domain.id.length; i++) hash = (hash * 31 + domain.id.charCodeAt(i)) >>> 0;
    return hash % DOMAIN_BADGE_CLASSES.length;
}
function domainBadgeClass(domain) { return DOMAIN_BADGE_CLASSES[domainColorIndex(domain)]; }
function domainBadgeHex(domain) { return DOMAIN_BADGE_HEX[domainColorIndex(domain)]; }

function volunteerOptionsHtml(club) {
    const volunteers = getEventVolunteers(club);
    if (!volunteers.length) return `<option value="">No selected volunteers available</option>`;
    return volunteers.map(v => {
        const domain = state.domains.find(d => d.id === v.domainId);
        const label = domain ? `${v.applicantName} (${v.studentId}) — ${domain.title}` : `${v.applicantName} (${v.studentId})`;
        const colorStyle = domain ? (() => { const c = domainBadgeHex(domain); return ` style="color:${c.fg}; background-color:${c.bg};"`; })() : "";
        return `<option value="${v.studentId}" data-name="${escapeHtml(v.applicantName)}" data-user-id="${v.userId || ""}"${colorStyle}>${escapeHtml(label)}</option>`;
    }).join("");
}

// ============================================================
// VOLUNTEER CHAT — one thread per (club, studentId), matching
// how a volunteer relationship is already uniquely keyed in
// state.volunteerApplications. No unread-badge tracking (MVP).
// ============================================================
let activeChatStudentId = null;
let chatPollIntervalId = null;

function getChatThread(studentId) {
    return state.chatMessages
        .filter(m => m.club === CURRENT_CLUB && m.studentId === studentId)
        .sort((a, b) => new Date(a.sentOn) - new Date(b.sentOn));
}

function renderVolunteerChatList() {
    const listEl = document.getElementById("ch-chat-volunteer-list");
    if (!listEl) return;
    const volunteers = getEventVolunteers(CURRENT_CLUB);

    if (!volunteers.length) {
        listEl.innerHTML = `<p class="text-muted" style="padding:1rem; font-size:0.85rem;">No selected volunteers yet — select someone from Volunteer Management to start chatting.</p>`;
        document.getElementById("ch-chat-panel").innerHTML = `<p class="text-muted" style="padding:2rem; text-align:center;">Select a volunteer to view the conversation.</p>`;
        if (chatPollIntervalId) { clearInterval(chatPollIntervalId); chatPollIntervalId = null; }
        return;
    }

    if (!activeChatStudentId || !volunteers.some(v => v.studentId === activeChatStudentId)) {
        activeChatStudentId = volunteers[0].studentId;
    }

    listEl.innerHTML = volunteers.map(v => `
        <div class="chat-thread-item ${v.studentId === activeChatStudentId ? 'active' : ''}" data-student-id="${v.studentId}" data-name="${escapeHtml(v.applicantName)}" style="padding:0.75rem 1rem; cursor:pointer; border-radius:8px; ${v.studentId === activeChatStudentId ? 'background:var(--primary-light);' : ''}">
            <strong>${escapeHtml(v.applicantName)}</strong>
            <div class="text-muted" style="font-size:0.75rem;">${escapeHtml(v.studentId)}</div>
        </div>
    `).join("");

    renderChatPanel(activeChatStudentId, volunteers.find(v => v.studentId === activeChatStudentId).applicantName);

    // Start polling for new messages every 3 seconds
    if (chatPollIntervalId) clearInterval(chatPollIntervalId);
    chatPollIntervalId = setInterval(() => {
        if (activeChatStudentId) pollChatForStudent(activeChatStudentId);
    }, 3000);
}

async function renderChatPanel(studentId, studentName) {
    const panel = document.getElementById("ch-chat-panel");
    if (!panel) return;

    // Pull the live backend thread for this (club, student) pair, merging any
    // new messages into local state so server + cached copies both render
    // (merge is idempotent by backend id).
    if (typeof Api !== "undefined" && CURRENT_CLUB_ID) {
        try {
            const backendMessages = await Api.getChat(CURRENT_CLUB_ID, studentId);
            if (Array.isArray(backendMessages)) {
                mergeChatMessages(backendMessages, studentId, studentName);
            }
        } catch (err) {
            console.warn(`Could not fetch chat for ${studentName}:`, err);
        }
    }

    const messages = getChatThread(studentId);

    panel.innerHTML = `
        <div class="chat-panel-header" style="padding:0.75rem 1rem; border-bottom:1px solid var(--border-color); font-weight:700;">${escapeHtml(studentName)}</div>
        <div class="chat-messages" id="ch-chat-messages" style="flex:1; overflow-y:auto; padding:1rem; display:flex; flex-direction:column; gap:0.6rem;">
            ${messages.length ? messages.map(m => `
                <div class="chat-bubble ${m.sender === 'clubhead' ? 'chat-bubble-mine' : 'chat-bubble-theirs'}" style="max-width:75%; padding:0.5rem 0.8rem; border-radius:10px; ${m.sender === 'clubhead' ? 'align-self:flex-end; background:var(--primary); color:#fff;' : 'align-self:flex-start; background:var(--bg-subtle,#f1f1f5);'}">
                    <div>${escapeHtml(m.text)}</div>
                    <div style="font-size:0.65rem; opacity:0.75; margin-top:0.2rem;">${formatDateTime(m.sentOn.replace('T', ' ').substring(0, 16))}</div>
                </div>
            `).join("") : `<p class="text-muted" style="text-align:center;">No messages yet — say hello!</p>`}
        </div>
        <form id="form-ch-chat-send" style="display:flex; gap:0.5rem; padding:0.75rem 1rem; border-top:1px solid var(--border-color);">
            <input type="text" id="ch-chat-input" class="form-input" placeholder="Type a message..." autocomplete="off" required style="flex:1;">
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
    `;

    const msgsEl = document.getElementById("ch-chat-messages");
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    document.getElementById("form-ch-chat-send").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("ch-chat-input");
        const text = input.value.trim();
        if (!text) return;
        const localMsg = {
            id: generateId("chat"),
            club: CURRENT_CLUB,
            studentId,
            sender: "clubhead",
            senderName: CURRENT_USER_NAME,
            text,
            sentOn: new Date().toISOString()
        };
        // Append locally for instant UI, then mirror to the backend.
        state.chatMessages.push(localMsg);
        saveState();
        renderChatPanel(studentId, studentName);

        if (typeof Api !== "undefined" && CURRENT_CLUB_ID) {
            try {
                const created = await Api.sendChat(CURRENT_CLUB_ID, { student_id: studentId, text });
                if (created && created.id) {
                    localMsg.id = `bk-${created.id}`;
                    localMsg.backendId = created.id;
                    localMsg.sentOn = created.created_at ? String(created.created_at) : localMsg.sentOn;
                }
                saveState();
                renderChatPanel(studentId, studentName);
            } catch (err) {
                showToast(`Couldn't send message to backend: ${err.detail || err.message}`, "warning");
            }
        }
    });
}

// Merges backend ChatMessageOut rows into state.chatMessages, keyed by the
// backend message id so re-renders / re-fetches never duplicate a message.
function mergeChatMessages(backendMessages, studentId, studentName) {
    state.chatMessages = state.chatMessages || [];
    const existingByBackendId = new Map(state.chatMessages.filter(m => m.backendId).map(m => [m.backendId, m]));
    let added = false;
    for (const msg of backendMessages) {
        if (existingByBackendId.has(msg.id)) continue;
        // A locally-optimistic copy of a message we just sent is still pending
        // (no backendId yet) while the send POST is in flight. Upgrade that
        // copy in place instead of pushing a duplicate -- otherwise polling
        // racing the send handler shows every sent message twice.
        const pendingIdx = state.chatMessages.findIndex(m =>
            !m.backendId &&
            m.club === CURRENT_CLUB &&
            m.studentId === (msg.student_id || studentId) &&
            m.sender === (msg.sender_role || "student") &&
            m.text === msg.text
        );
        if (pendingIdx !== -1) {
            const pending = state.chatMessages[pendingIdx];
            pending.id = `bk-${msg.id}`;
            pending.backendId = msg.id;
            pending.sentOn = msg.created_at ? String(msg.created_at) : pending.sentOn;
            added = true;
            continue;
        }
        state.chatMessages.push({
            id: `bk-${msg.id}`,
            backendId: msg.id,
            club: CURRENT_CLUB,
            studentId: msg.student_id || studentId,
            sender: msg.sender_role || "student",
            senderName: msg.sender_role === "clubhead" ? CURRENT_USER_NAME : (studentName || ""),
            text: msg.text,
            sentOn: msg.created_at ? String(msg.created_at) : new Date().toISOString()
        });
        added = true;
    }
    if (added || dedupeChatMessages()) saveState();
}

// One-time / ongoing cleanup for chat duplicates. Two things can leave extra
// copies in localStorage: (a) two messages sharing one backend id (the send
// handler + a racing poll both storing the confirmed message), and (b) an
// orphaned optimistic copy (no backend id) that was superseded by a
// backend-confirmed twin. Both are safe to drop; identical text from an
// unrelated NEW message is kept because it stays fresh (> 60s newer than the
// confirmed twin, or no twin at all).
function dedupeChatMessages() {
    state.chatMessages = state.chatMessages || [];
    const seenBackend = new Set();
    const confirmedByKey = new Map();
    state.chatMessages.forEach(m => {
        if (m.backendId != null) {
            const key = [m.club, m.studentId, m.sender, m.text].join("|");
            if (!confirmedByKey.has(key)) confirmedByKey.set(key, m);
        }
    });
    const cleaned = [];
    let changed = false;
    for (const m of state.chatMessages) {
        if (m.backendId != null) {
            const k = String(m.backendId);
            if (seenBackend.has(k)) { changed = true; continue; }
            seenBackend.add(k);
            cleaned.push(m);
        } else {
            const key = [m.club, m.studentId, m.sender, m.text].join("|");
            const twin = confirmedByKey.get(key);
            const mine = +new Date(m.sentOn);
            const theirs = twin ? +new Date(twin.sentOn) : NaN;
            // Drop the orphan when it predates the twin (the race always stores
            // the optimistic copy first) or when the two are within a 60s
            // window (clock-skew-safe). A distinctly NEWER same-text message
            // (>60s apart) is a genuine new send and stays.
            if (twin && (mine <= theirs || Math.abs(theirs - mine) < 60000)) { changed = true; continue; }
            cleaned.push(m);
        }
    }
    if (changed) state.chatMessages = cleaned;
    return changed;
}

// Poll for new messages without full re-render (just merge and update if needed)
async function pollChatForStudent(studentId) {
    if (typeof Api === "undefined" || !CURRENT_CLUB_ID) return;
    try {
        const backendMessages = await Api.getChat(CURRENT_CLUB_ID, studentId);
        if (Array.isArray(backendMessages)) {
            const beforeCount = state.chatMessages.length;
            const volunteer = getEventVolunteers(CURRENT_CLUB).find(v => v.studentId === studentId);
            mergeChatMessages(backendMessages, studentId, volunteer ? volunteer.applicantName : "");
            // Only re-render if new messages were added
            if (state.chatMessages.length > beforeCount) {
                renderChatPanel(studentId, volunteer ? volunteer.applicantName : "");
            }
        }
    } catch (err) {
        // Silent fail on polling
    }
}

function setupVolunteerChatEvents() {
    const listEl = document.getElementById("ch-chat-volunteer-list");
    if (!listEl) return;
    listEl.addEventListener("click", (e) => {
        const item = e.target.closest(".chat-thread-item");
        if (!item) return;
        activeChatStudentId = item.getAttribute("data-student-id");
        renderVolunteerChatList();
    });
}

function showEventMgmtGallery() {
    document.getElementById("ch-em-gallery-view").classList.remove("hidden");
    document.getElementById("ch-em-detail-view").classList.add("hidden");
    renderEventMgmtGallery();
}

function renderEventMgmtGallery() {
    const grid = document.getElementById("ch-em-grid");
    const events = state.eventBudgets.filter(eb => eb.club === CURRENT_CLUB);

    if (events.length === 0) {
        grid.innerHTML = `<div class="ch-empty-state"><i class="fa-solid fa-calendar-xmark"></i>No approved events yet. Approved proposals appear here automatically.</div>`;
        return;
    }

    grid.innerHTML = events.map(eb => {
        const spent = getApprovedExpenseTotal(eb);
        const spentPercent = eb.allotted > 0 ? Math.round((spent / eb.allotted) * 100) : 0;
        let barClass = "bg-primary-fill";
        if (spentPercent > 90) barClass = "bg-danger-fill";
        else if (spentPercent > 65) barClass = "bg-warning-fill";
        const taskCount = (eb.tasks || []).length;
        const regCount = (eb.registrations || []).length;
        const publishedBadge = eb.publish && eb.publish.published
            ? `<span class="badge badge-success">Published</span>`
            : `<i class="fa-solid fa-chevron-right text-muted"></i>`;

        return `
            <div class="event-budget-card" data-id="${eb.id}">
                <div class="event-card-header">
                    <h4>${escapeHtml(eb.eventName)}</h4>
                    ${publishedBadge}
                </div>
                <div class="event-card-club">${taskCount} task${taskCount === 1 ? '' : 's'} &middot; ${regCount} registration${regCount === 1 ? '' : 's'}</div>
                <div class="event-card-finance">
                    <span class="text-muted">Approved: ${formatCurrency(eb.allotted)}</span>
                    <span>Spent: ${formatCurrency(spent)}</span>
                </div>
                <div class="progress-bar-bg" style="height: 6px;">
                    <div class="progress-bar-fill ${barClass}" style="width: ${Math.min(spentPercent, 100)}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function openEventMgmtDetail(id) {
    activeEventMgmtId = id;
    activeEmToggle = "details";
    document.getElementById("ch-em-gallery-view").classList.add("hidden");
    document.getElementById("ch-em-detail-view").classList.remove("hidden");
    document.querySelectorAll(".ch-em-toggle-btn").forEach(b => b.classList.toggle("active", b.getAttribute("data-toggle") === "details"));
    document.querySelectorAll(".ch-em-toggle-pane").forEach(p => p.classList.add("hidden"));
    document.getElementById("ch-em-pane-details").classList.remove("hidden");
    renderEventMgmtDetail();
}

function switchEmToggle(toggle) {
    activeEmToggle = toggle;
    document.querySelectorAll(".ch-em-toggle-btn").forEach(b => b.classList.toggle("active", b.getAttribute("data-toggle") === toggle));
    document.querySelectorAll(".ch-em-toggle-pane").forEach(p => p.classList.add("hidden"));
    document.getElementById(`ch-em-pane-${toggle}`).classList.remove("hidden");
    renderEventMgmtDetail();
}

function renderEventMgmtDetail() {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    if (!eb) { showEventMgmtGallery(); return; }
    document.getElementById("ch-em-detail-title").textContent = eb.eventName;
    document.getElementById("ch-em-detail-club-badge").textContent = eb.club;

    if (activeEmToggle === "details") renderEmDetailsPane(eb);
    else if (activeEmToggle === "tasks") renderEmTasksPane(eb);
    else if (activeEmToggle === "registrations") renderEmRegistrationsPane(eb);
    else if (activeEmToggle === "publish") renderEmPublishPane(eb);
}

function getApprovedProposalFor(eb) {
    return state.proposals.find(p => p.organizer === eb.club && p.title === eb.eventName && p.status === "Approved");
}

// ---- Toggle 1: Approved Details (read-only, pulled from the matching approved proposal) ----
function renderEmDetailsPane(eb) {
    const pane = document.getElementById("ch-em-pane-details");
    const prop = getApprovedProposalFor(eb);

    if (!prop) {
        pane.innerHTML = `<p class="text-muted">No matching approved proposal found for this event.</p>`;
        return;
    }

    const invRows = prop.inventoryRequirements.map(r => `
        <tr><td>${escapeHtml(r.name)}</td><td>${r.qty} ${escapeHtml(r.unit)}</td><td>${decisionBadge(r.status)}</td></tr>
    `).join("") || `<tr><td colspan="3" class="text-muted">None requested.</td></tr>`;

    const procRows = prop.procuringItems.map(r => `
        <tr><td>${escapeHtml(r.name)}</td><td>${r.qty} ${escapeHtml(r.unit)}</td><td>${formatCurrency(r.overallPrice)}</td><td>${decisionBadge(r.status)}</td></tr>
    `).join("") || `<tr><td colspan="4" class="text-muted">None requested.</td></tr>`;

    const prizeRows = prop.prizeMoney.map(r => `
        <tr><td>${escapeHtml(r.position)}</td><td>${formatCurrency(r.amount)}</td><td>${decisionBadge(r.status)}</td></tr>
    `).join("") || `<tr><td colspan="3" class="text-muted">None requested.</td></tr>`;

    const judgeRows = prop.judgeFees.map(r => `
        <tr><td>${escapeHtml(r.name)}</td><td>${r.qty}</td><td>${formatCurrency(r.overallPrice)}</td><td>${decisionBadge(r.status)}</td></tr>
    `).join("") || `<tr><td colspan="4" class="text-muted">None requested.</td></tr>`;

    pane.innerHTML = `
        <div class="proposal-summary-banner" style="grid-template-columns: repeat(3, 1fr); margin-bottom:1rem;">
            <div class="prop-summary-item"><i class="fa-solid fa-calendar-check text-indigo"></i><div><span class="prop-summary-lbl">Date &amp; Time</span><span class="prop-summary-val">${formatDate(prop.date)} &middot; ${formatTimeRange(prop.time)}</span></div></div>
            <div class="prop-summary-item"><i class="fa-solid fa-location-dot text-emerald"></i><div><span class="prop-summary-lbl">Venue</span><span class="prop-summary-val">${prop.venue ? escapeHtml(prop.venue.venueName) : "—"}</span></div></div>
            <div class="prop-summary-item"><i class="fa-solid fa-users text-amber"></i><div><span class="prop-summary-lbl">Expected Attendees</span><span class="prop-summary-val">${prop.estimatedParticipants}</span></div></div>
        </div>
        <h4 style="margin:1rem 0 0.5rem;">Inventory Requirements</h4>
        <div class="table-responsive"><table class="table table-compact"><thead><tr><th>Item</th><th>Qty</th><th>Status</th></tr></thead><tbody>${invRows}</tbody></table></div>
        <h4 style="margin:1rem 0 0.5rem;">Procuring Items</h4>
        <div class="table-responsive"><table class="table table-compact"><thead><tr><th>Item</th><th>Qty</th><th>Cost</th><th>Status</th></tr></thead><tbody>${procRows}</tbody></table></div>
        <h4 style="margin:1rem 0 0.5rem;">Prize Money</h4>
        <div class="table-responsive"><table class="table table-compact"><thead><tr><th>Position</th><th>Amount</th><th>Status</th></tr></thead><tbody>${prizeRows}</tbody></table></div>
        <h4 style="margin:1rem 0 0.5rem;">Judge / Guest Fees</h4>
        <div class="table-responsive"><table class="table table-compact"><thead><tr><th>Name</th><th>Qty</th><th>Cost</th><th>Status</th></tr></thead><tbody>${judgeRows}</tbody></table></div>
    `;
}

// Bill Upload tasks don't follow the generic Assigned->Submitted->Verified review loop —
// once accepted, the card tracks the LINKED EXPENSE's own status (from the Finances tab)
// since that's the thing actually being reviewed (by the President, then Faculty Coordinator).
function billUploadTaskCardParts(task) {
    const eb = state.eventBudgets.find(e => e.id === task.eventId);
    const exp = eb && eb.expenses.find(x => x.id === task.expenseId);
    if (!exp) return { statusBadge: `<span class="badge badge-secondary">${escapeHtml(task.status)}</span>`, actions: "", proofHtml: "" };

    let statusBadge = `<span class="badge ${statusBadgeClassFor(exp.status)}">${escapeHtml(exp.status)}</span>`;
    let actions = "";
    if (task.status === "Assigned") {
        actions = `<button class="btn btn-secondary btn-sm" data-action="accept-task" data-task-id="${task.id}"><i class="fa-solid fa-user-check"></i> Simulate Volunteer Accept</button>`;
    } else if (isEditableStatus(exp.status)) {
        actions = `<button class="btn btn-secondary btn-sm" data-action="open-upload-bill-task" data-expense-id="${exp.id}"><i class="fa-solid fa-upload"></i> Simulate Volunteer Bill Upload</button>`;
    } else {
        actions = reviewActionLabelFor(exp) || `<span class="text-muted" style="font-size:0.75rem;">${escapeHtml(exp.status)}</span>`;
    }

    const billLink = exp.billFileUrl
        ? `<a href="${SSCMS_API_BASE}${exp.billFileUrl}" target="_blank" rel="noopener">${escapeHtml(exp.billFileName)}</a>`
        : escapeHtml(exp.billFileName || "");
    const proofHtml = exp.billFileName
        ? `<div class="ch-item-comment">Bill: ${billLink} (${formatCurrency(exp.billAmount)})</div>`
        : (exp.status === "Not Utilized" ? `<div class="ch-item-comment">Marked as not spent.</div>` : "");

    return { statusBadge, actions, proofHtml };
}

// ---- Toggle 2: Task Allotment (Attendance + Procurement + Bill Upload mandatory, plus custom tasks) ----
function renderTaskCardHtml(task) {
    if (task.type === "Bill Upload" && task.expenseId) {
        const parts = billUploadTaskCardParts(task);
        return `
            <div class="event-budget-card">
                <div class="event-card-header"><h4>${escapeHtml(task.title)}</h4>${parts.statusBadge}</div>
                <p class="text-muted" style="font-size:0.8rem;">${escapeHtml(task.description || "")}</p>
                <div class="event-card-club">Assigned to: <strong>${escapeHtml(task.assignedVolunteerName)}</strong> &middot; Priority: ${task.priority}</div>
                ${parts.proofHtml}
                <div style="margin-top:0.5rem; display:flex; gap:0.4rem; flex-wrap:wrap;">${parts.actions}</div>
            </div>
        `;
    }

    let statusBadge = `<span class="badge badge-secondary">${task.status}</span>`;
    if (task.status === "Accepted") statusBadge = `<span class="badge badge-info">Accepted</span>`;
    if (task.status === "Submitted") statusBadge = `<span class="badge badge-warning">Submitted</span>`;
    if (task.status === "Verified") statusBadge = `<span class="badge badge-success">Verified</span>`;
    if (task.status === "Revision Requested") statusBadge = `<span class="badge badge-danger">Revision Requested</span>`;

    let actions = "";
    if (task.status === "Assigned") {
        actions = `<button class="btn btn-secondary btn-sm" data-action="accept-task" data-task-id="${task.id}"><i class="fa-solid fa-user-check"></i> Simulate Volunteer Accept</button>`;
    } else if (task.status === "Accepted") {
        if (task.type === "Attendance") {
            actions += `<button class="btn btn-primary btn-sm" data-action="open-scanner" data-task-id="${task.id}"><i class="fa-solid fa-qrcode"></i> Open QR Scanner</button> `;
        }
        actions += `<button class="btn btn-secondary btn-sm" data-action="submit-task" data-task-id="${task.id}">Simulate Submit Proof</button>`;
    } else if (task.status === "Submitted") {
        actions = `<button class="btn btn-primary btn-sm" data-action="verify-task" data-task-id="${task.id}">Approve</button> <button class="btn btn-secondary btn-sm" data-action="revise-task" data-task-id="${task.id}">Request Revision</button>`;
    } else if (task.status === "Revision Requested") {
        actions = `<button class="btn btn-secondary btn-sm" data-action="accept-task" data-task-id="${task.id}">Resubmit (Simulate Accept)</button>`;
    }

    const proofHtml = task.proof
        ? `<div class="ch-item-comment">Proof: ${escapeHtml(task.proof.note || task.proof.link || task.proof.fileName || "")}</div>`
        : "";

    return `
        <div class="event-budget-card">
            <div class="event-card-header"><h4>${escapeHtml(task.title)}</h4>${statusBadge}</div>
            <p class="text-muted" style="font-size:0.8rem;">${escapeHtml(task.description || "")}</p>
            <div class="event-card-club">Assigned to: <strong>${escapeHtml(task.assignedVolunteerName)}</strong>${task.deadline ? ` &middot; Due ${formatDate(task.deadline)}` : ""} &middot; Priority: ${task.priority}</div>
            ${proofHtml}
            <div style="margin-top:0.5rem; display:flex; gap:0.4rem; flex-wrap:wrap;">${actions}</div>
        </div>
    `;
}

function renderEmTasksPane(eb) {
    const pane = document.getElementById("ch-em-pane-tasks");
    const volunteers = getEventVolunteers(eb.club);
    const attendanceTask = eb.tasks.find(t => t.type === "Attendance");
    const procurementUsages = state.inventoryUsage.filter(u => u.club === eb.club && u.event === eb.eventName);
    const customTasks = eb.tasks.filter(t => t.type === "Custom");

    let attendanceHtml;
    if (!attendanceTask) {
        attendanceHtml = volunteers.length ? `
            <div class="event-budget-card">
                <div class="event-card-header"><h4>Attendance Taking</h4><span class="badge badge-secondary">Unassigned</span></div>
                <p class="text-muted" style="font-size:0.8rem;">Assign a volunteer to scan registrant QR codes and mark attendance.</p>
                <select class="form-input" id="ch-em-attendance-volunteer-select" style="margin-bottom:0.5rem;">${volunteerOptionsHtml(eb.club)}</select>
                <button class="btn btn-primary btn-sm" data-action="allot-attendance">Allot Task</button>
            </div>
        ` : `
            <div class="event-budget-card">
                <div class="event-card-header"><h4>Attendance Taking</h4><span class="badge badge-secondary">Unassigned</span></div>
                <p class="text-muted" style="font-size:0.8rem;">No selected volunteers available yet — approve one in Volunteer Management first.</p>
            </div>
        `;
    } else {
        attendanceHtml = renderTaskCardHtml(attendanceTask);
    }

    let procurementHtml;
    if (procurementUsages.length === 0) {
        procurementHtml = `<p class="text-muted" style="font-size:0.85rem;">No procurement/inventory items linked to this event yet.</p>`;
    } else {
        procurementHtml = procurementUsages.map(u => {
            const linkedTask = eb.tasks.find(t => t.type === "Procurement" && t.procurementUsageId === u.id);
            if (linkedTask) return renderTaskCardHtml(linkedTask);
            if (!volunteers.length) {
                return `
                    <div class="event-budget-card">
                        <div class="event-card-header"><h4>${escapeHtml(u.itemName)} (Qty ${u.qty})</h4><span class="badge badge-secondary">Unassigned</span></div>
                        <p class="text-muted" style="font-size:0.8rem;">No selected volunteers available yet.</p>
                    </div>
                `;
            }
            return `
                <div class="event-budget-card">
                    <div class="event-card-header"><h4>${escapeHtml(u.itemName)} (Qty ${u.qty})</h4><span class="badge badge-secondary">Unassigned</span></div>
                    <p class="text-muted" style="font-size:0.8rem;">Assign a volunteer to procure this item.</p>
                    <select class="form-input ch-em-procurement-volunteer-select" data-usage-id="${u.id}" style="margin-bottom:0.5rem;">${volunteerOptionsHtml(eb.club)}</select>
                    <button class="btn btn-primary btn-sm" data-action="allot-procurement" data-usage-id="${u.id}">Allot Task</button>
                </div>
            `;
        }).join("");
    }

    const selfProcExpenses = (eb.expenses || []).filter(e => e.type === "Self-Procured Expense");
    let billUploadHtml;
    if (selfProcExpenses.length === 0) {
        billUploadHtml = `<p class="text-muted" style="font-size:0.85rem;">No self-procured expense items for this event yet.</p>`;
    } else {
        billUploadHtml = selfProcExpenses.map(exp => {
            const linkedTask = eb.tasks.find(t => t.type === "Bill Upload" && t.expenseId === exp.id);
            if (linkedTask) return renderTaskCardHtml(linkedTask);
            if (!volunteers.length) {
                return `
                    <div class="event-budget-card">
                        <div class="event-card-header"><h4>${escapeHtml(exp.itemName)} (${formatCurrency(exp.approvedAmount)})</h4><span class="badge badge-secondary">Unassigned</span></div>
                        <p class="text-muted" style="font-size:0.8rem;">No selected volunteers available yet.</p>
                    </div>
                `;
            }
            return `
                <div class="event-budget-card">
                    <div class="event-card-header"><h4>${escapeHtml(exp.itemName)} (${formatCurrency(exp.approvedAmount)})</h4><span class="badge badge-secondary">Unassigned</span></div>
                    <p class="text-muted" style="font-size:0.8rem;">Assign a volunteer to procure this item and upload its bill. You can also upload it yourself from the Finances tab.</p>
                    <select class="form-input ch-em-billupload-volunteer-select" data-expense-id="${exp.id}" style="margin-bottom:0.5rem;">${volunteerOptionsHtml(eb.club)}</select>
                    <button class="btn btn-primary btn-sm" data-action="allot-billupload" data-expense-id="${exp.id}">Allot Task</button>
                </div>
            `;
        }).join("");
    }

    const customHtml = customTasks.length
        ? customTasks.map(t => renderTaskCardHtml(t)).join("")
        : `<p class="text-muted" style="font-size:0.85rem;">No custom tasks yet.</p>`;

    pane.innerHTML = `
        <h4 style="margin-bottom:0.5rem;"><i class="fa-solid fa-user-check text-indigo"></i> Attendance Taking (Mandatory)</h4>
        <div class="event-budget-cards" style="margin-bottom:1.25rem;">${attendanceHtml}</div>
        <h4 style="margin-bottom:0.5rem;"><i class="fa-solid fa-boxes-stacked text-indigo"></i> Procurement (Mandatory)</h4>
        <div class="event-budget-cards" style="margin-bottom:1.25rem;">${procurementHtml}</div>
        <h4 style="margin-bottom:0.5rem;"><i class="fa-solid fa-receipt text-indigo"></i> Bill Upload — Self-Procured Expenses (Mandatory)</h4>
        <div class="event-budget-cards" style="margin-bottom:1.25rem;">${billUploadHtml}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <h4 style="margin:0;"><i class="fa-solid fa-list-check text-indigo"></i> Custom Tasks</h4>
            <button class="btn btn-secondary btn-sm" data-action="open-add-task"><i class="fa-solid fa-plus"></i> Add Task</button>
        </div>
        <div class="event-budget-cards">${customHtml}</div>
    `;
}

async function allotAttendanceTask() {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const sel = document.getElementById("ch-em-attendance-volunteer-select");
    const opt = sel && sel.options[sel.selectedIndex];
    if (!opt || !opt.value) { showToast("No volunteer selected.", "danger"); return; }

    const title = "Attendance Taking";
    const description = "Scan registrant QR codes at the venue to mark attendance.";
    const deadline = eb.publish && eb.publish.date ? eb.publish.date : "";
    const userId = opt.getAttribute("data-user-id");

    let backendId = null;
    if (eb.backendEventId && userId) {
        try {
            const backendTask = await Api.createTask(eb.backendEventId, {
                assigned_to: Number(userId), type: "Attendance", title, description, priority: "High",
                deadline: deadline || null
            });
            backendId = backendTask.id;
        } catch (e) {
            showToast(`Couldn't allot task: ${e.detail || e.message}`, "danger");
            return;
        }
    }

    eb.tasks.push({
        id: generateId("task"), backendId, eventId: eb.id, title, description,
        type: "Attendance", priority: "High", deadline,
        assignedVolunteerId: opt.value, assignedVolunteerName: opt.getAttribute("data-name"),
        domainId: null, procurementUsageId: null, status: "Assigned", proof: null, createdOn: todayStr()
    });
    saveState();
    renderEventMgmtDetail();
    renderEventMgmtGallery();
    showToast(backendId ? "Attendance task allotted." : "Attendance task allotted locally only (event isn't linked to a backend proposal, or the volunteer has no backend account) -- won't survive a reload.", backendId ? "success" : "info");
}

async function allotProcurementTask(usageId) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const usage = state.inventoryUsage.find(u => u.id === usageId);
    const sel = document.querySelector(`.ch-em-procurement-volunteer-select[data-usage-id="${usageId}"]`);
    const opt = sel && sel.options[sel.selectedIndex];
    if (!usage || !opt || !opt.value) { showToast("No volunteer selected.", "danger"); return; }

    const userId = opt.getAttribute("data-user-id");
    let backendId = null;
    if (eb.backendEventId && userId) {
        try {
            const backendTask = await Api.createTask(eb.backendEventId, {
                assigned_to: Number(userId), type: "Procurement",
                title: `Procure: ${usage.itemName}`,
                description: `Procure/collect ${usage.qty} of ${usage.itemName} for this event.`,
                priority: "High", deadline: usage.date || null
            });
            backendId = backendTask.id;
        } catch (e) {
            showToast(`Couldn't allot procurement task: ${e.detail || e.message}`, "danger");
            return;
        }
    }

    eb.tasks.push({
        id: generateId("task"), backendId, eventId: eb.id, title: `Procure: ${usage.itemName}`,
        description: `Procure/collect ${usage.qty} of ${usage.itemName} for this event.`,
        type: "Procurement", priority: "High", deadline: usage.date || "",
        assignedVolunteerId: opt.value, assignedVolunteerName: opt.getAttribute("data-name"),
        domainId: null, procurementUsageId: usageId, status: "Assigned", proof: null, createdOn: todayStr()
    });
    saveState();
    renderEventMgmtDetail();
    renderEventMgmtGallery();
    showToast(backendId ? "Procurement task allotted." : "Procurement task allotted locally only (event isn't linked to a backend proposal, or the volunteer has no backend account) — won't survive a reload.", backendId ? "success" : "info");
}

// Bill Upload tasks link to an approved Self-Procured Expense line item (eb.expenses[]),
// not inventory — the assigned volunteer buys the item and uploads the bill themselves,
// which lands directly in the Club Head's Logged Expenses & Bills (see submitUploadBill).
async function allotBillUploadTask(expenseId) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const exp = eb.expenses.find(x => x.id === expenseId);
    const sel = document.querySelector(`.ch-em-billupload-volunteer-select[data-expense-id="${expenseId}"]`);
    const opt = sel && sel.options[sel.selectedIndex];
    if (!exp || !opt || !opt.value) { showToast("No volunteer selected.", "danger"); return; }

    const title = `Upload Bill: ${exp.itemName}`;
    const description = `Procure "${exp.itemName}" (approved amount ${formatCurrency(exp.approvedAmount)}) and upload the bill.`;
    const userId = opt.getAttribute("data-user-id");

    let backendId = null;
    if (eb.backendEventId && userId) {
        try {
            const backendTask = await Api.createTask(eb.backendEventId, {
                assigned_to: Number(userId), type: "Bill Upload", title, description, priority: "High",
                expense_id: expenseId
            });
            backendId = backendTask.id;
        } catch (e) {
            showToast(`Couldn't allot task: ${e.detail || e.message}`, "danger");
            return;
        }
    }

    eb.tasks.push({
        id: generateId("task"), backendId, eventId: eb.id, title, description,
        type: "Bill Upload", priority: "High", deadline: "",
        assignedVolunteerId: opt.value, assignedVolunteerName: opt.getAttribute("data-name"),
        domainId: null, procurementUsageId: null, expenseId: expenseId, status: "Assigned", proof: null, createdOn: todayStr()
    });
    saveState();
    renderEventMgmtDetail();
    renderEventMgmtGallery();
    showToast(backendId ? "Bill upload task allotted." : "Bill upload task allotted locally only (event isn't linked to a backend proposal, or the volunteer has no backend account) -- won't survive a reload.", backendId ? "success" : "info");
}

function acceptTask(taskId) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const task = eb.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.status = "Accepted";
    task.proof = null;
    if (task.type === "Procurement" && task.procurementUsageId) {
        const usage = state.inventoryUsage.find(u => u.id === task.procurementUsageId);
        if (usage) {
            usage.volunteerName = task.assignedVolunteerName;
            usage.volunteerId = task.assignedVolunteerId;
            usage.assignedViaTask = true;
        }
        showToast(`${task.assignedVolunteerName} confirmed for procurement — now visible to the President & Faculty Coordinator.`);
    } else if (task.type === "Attendance") {
        showToast(`${task.assignedVolunteerName} accepted the Attendance task — QR scanner unlocked.`);
    } else if (task.type === "Bill Upload") {
        showToast(`${task.assignedVolunteerName} accepted the bill upload task.`);
    } else {
        showToast(`${task.assignedVolunteerName} accepted the task.`);
    }
    saveState();
    renderEventMgmtDetail();
}

function submitTaskProof(taskId) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const task = eb.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.proof = { note: "Work completed as assigned.", link: "", fileName: "" };
    task.status = "Submitted";
    saveState();
    renderEventMgmtDetail();
    showToast("Task submitted for review.");
}

async function verifyTask(taskId) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const task = eb.tasks.find(t => t.id === taskId);
    if (!task) return;
    let backendSynced = true;
    if (task.backendId) {
        try {
            await Api.reviewTask(task.backendId, true);
        } catch (e) {
            // A 409 here almost always means the "Simulate Volunteer Accept" /
            // "Simulate Submit Proof" demo shortcuts advanced this task's local
            // status without the volunteer ever calling the real accept/submit-
            // proof endpoints (backend correctly requires the assignee for
            // those) -- the backend task is still stuck at "Assigned". Don't
            // block the local demo transition on that; just flag it wasn't
            // mirrored to the backend.
            backendSynced = false;
        }
    }
    task.status = "Verified";
    saveState();
    renderEventMgmtDetail();
    showToast(backendSynced ? "Task verified and closed." : "Task verified locally — backend wasn't updated (this task's accept/submit steps were simulated, not run by the real volunteer).", backendSynced ? "success" : "info");
}

async function reviseTask(taskId) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const task = eb.tasks.find(t => t.id === taskId);
    if (!task) return;
    let backendSynced = true;
    if (task.backendId) {
        try {
            await Api.reviewTask(task.backendId, false);
        } catch (e) {
            // See verifyTask -- a 409 here means the local demo shortcuts got
            // ahead of the backend's real task lifecycle; don't block on it.
            backendSynced = false;
        }
    }
    task.status = "Revision Requested";
    saveState();
    renderEventMgmtDetail();
    showToast(backendSynced ? "Revision requested from volunteer." : "Revision requested locally — backend wasn't updated (this task's accept/submit steps were simulated, not run by the real volunteer).", backendSynced ? "success" : "info");
}

function openAddTaskModal() {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    document.getElementById("form-ch-add-task").reset();
    document.getElementById("ch-task-type").value = "Custom";
    document.getElementById("ch-task-procurement-usage-id").value = "";
    document.getElementById("ch-task-procurement-item-group").style.display = "none";
    document.getElementById("ch-add-task-modal-title").textContent = "Add a Custom Task";
    document.getElementById("ch-task-volunteer").innerHTML = volunteerOptionsHtml(eb.club);
    openModal("modal-ch-add-task");
}

async function submitAddTask(e) {
    e.preventDefault();
    const eb = state.eventBudgets.find(x => x.id === activeEventMgmtId);
    const volSelect = document.getElementById("ch-task-volunteer");
    const opt = volSelect.options[volSelect.selectedIndex];
    if (!opt || !opt.value) { showToast("No volunteer selected.", "danger"); return; }

    const title = document.getElementById("ch-task-title").value.trim();
    const description = document.getElementById("ch-task-description").value.trim();
    const priority = document.getElementById("ch-task-priority").value;
    const deadline = document.getElementById("ch-task-deadline").value;
    const userId = opt.getAttribute("data-user-id");

    let backendId = null;
    if (eb.backendEventId && userId) {
        try {
            const backendTask = await Api.createTask(eb.backendEventId, {
                assigned_to: Number(userId), type: "Custom", title, description, priority, deadline: deadline || null
            });
            backendId = backendTask.id;
        } catch (err) {
            showToast(`Couldn't allot task: ${err.detail || err.message}`, "danger");
            return;
        }
    }

    eb.tasks.push({
        id: generateId("task"), backendId, eventId: eb.id, title, description,
        type: "Custom", priority, deadline,
        assignedVolunteerId: opt.value, assignedVolunteerName: opt.getAttribute("data-name"),
        domainId: null, procurementUsageId: null, status: "Assigned", proof: null, createdOn: todayStr()
    });
    saveState();
    closeModal("modal-ch-add-task");
    renderEventMgmtDetail();
    renderEventMgmtGallery();
    showToast("Task allotted.");
}

// ---- Toggle 3: Registrations ----
function renderEmRegistrationsPane(eb) {
    const pane = document.getElementById("ch-em-pane-registrations");
    const regs = eb.registrations || [];
    const rows = regs.map(r => `
        <tr>
            <td>${escapeHtml(r.studentName)}</td>
            <td>${escapeHtml(r.studentId)}</td>
            <td>${escapeHtml(r.email || "")}</td>
            <td>${r.checkedIn ? `<span class="badge badge-success">Checked In${r.checkedInAt ? " &middot; " + formatDateTime(r.checkedInAt.replace('T', ' ').substring(0, 16)) + " IST" : ""}</span>` : `<span class="badge badge-secondary">Not Checked In</span>`}</td>
            <td class="text-right"><button class="btn btn-secondary btn-sm" data-action="view-qr" data-reg-id="${r.id}"><i class="fa-solid fa-qrcode"></i> View QR</button></td>
        </tr>
    `).join("") || `<tr><td colspan="5" class="text-muted text-center" style="padding:1.5rem;">No registrations yet.</td></tr>`;

    const syncedCount = regs.filter(r => r.backendId).length;
    const headerBtn = eb.backendEventId
        ? `<button class="btn btn-primary btn-sm" data-action="sync-registrations"><i class="fa-solid fa-rotate"></i> Sync from backend</button>`
        : `<button class="btn btn-secondary btn-sm" data-action="seed-registrations"><i class="fa-solid fa-user-plus"></i> Add Sample Registrations</button>`;

    pane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
            <p class="text-muted" style="font-size:0.85rem; margin:0;">${regs.length} registration${regs.length === 1 ? '' : 's'}${syncedCount ? ` &middot; ${syncedCount} synced from backend` : ""}</p>
            ${headerBtn}
        </div>
        <div class="table-responsive">
            <table class="table table-compact">
                <thead><tr><th>Name</th><th>Student ID</th><th>Email</th><th>Attendance</th><th class="text-right">QR</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    // Auto-sync the real roster once per session when the event is linked to a
    // backend Event, so the Club Head sees actual student registrations instead
    // of only the locally-seeded samples.
    if (eb.backendEventId && !syncedBackendEvents.has(eb.id)) {
        syncBackendRegistrations(eb);
    }
}

// Fetch the event's real registration roster from the backend (GET
// /events/{id}/registrations) and merge it into local state, keeping any
// local-only sample rows alongside. Backend registrations only carry user_id,
// so names are resolved from the club's member roster when available.
async function syncBackendRegistrations(eb) {
    if (!eb.backendEventId) return;
    syncedBackendEvents.add(eb.id);
    const memberById = new Map((state.clubMembers || []).map(m => [m.userId, m]));
    try {
        const backendRegs = await Api.listEventRegistrations(eb.backendEventId);
        const byBackendId = new Map((eb.registrations || []).filter(r => r.backendId).map(r => [r.backendId, r]));
        const merged = [];
        (backendRegs || []).forEach(b => {
            const existing = byBackendId.get(b.id);
            const member = memberById.get(b.user_id);
            merged.push({
                id: b.id,
                backendId: b.id,
                studentName: existing ? existing.studentName : (member ? member.name : `Student #${b.user_id}`),
                studentId: existing ? existing.studentId : (member ? member.studentId : (b.user_id || "")),
                email: existing ? existing.email : (member ? member.email : ""),
                registeredOn: b.registered_at,
                qrPayload: b.qr_token,
                checkedIn: b.status === "Checked-In",
                checkedInAt: b.checked_in_at,
                backendStatus: b.status
            });
        });
        // Keep local-only sample rows that aren't real backend registrations.
        (eb.registrations || []).forEach(r => {
            if (!r.backendId && !merged.some(m => m.id === r.id)) merged.push(r);
        });
        eb.registrations = merged;
        saveState();
        renderEventMgmtDetail();
        showToast(`${merged.filter(r => r.backendId).length} registrations synced from backend.`);
    } catch (e) {
        syncedBackendEvents.delete(eb.id);
        showToast("Could not sync registrations from backend.", "error");
    }
}

function seedRegistrations() {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const sampleNames = [
        { name: "Neha Kapoor", id: "IIT2026301" },
        { name: "Arjun Mehta", id: "IIT2026150" },
        { name: "Sara Fernandes", id: "IIT2026212" }
    ];
    sampleNames.forEach((s, idx) => {
        const regId = "reg-" + Date.now() + "-" + idx;
        eb.registrations.push({
            id: regId, studentName: s.name, studentId: s.id, email: `${s.id.toLowerCase()}@iit.ac.in`,
            registeredOn: todayStr(), qrPayload: JSON.stringify({ eventId: eb.id, registrationId: regId }),
            checkedIn: false, checkedInAt: null
        });
    });
    saveState();
    renderEventMgmtDetail();
    renderEventMgmtGallery();
    showToast("Sample registrations added.");
}

function viewRegistrationQr(regId) {
    const eb = state.eventBudgets.find(e => e.id == activeEventMgmtId || String(e.id) === String(activeEventMgmtId));
    if (!eb || !eb.registrations) return;
    const reg = eb.registrations.find(r => r.id == regId || String(r.id) === String(regId) || (r.backendId && String(r.backendId) === String(regId)));
    if (!reg) return;
    document.getElementById("ch-view-qr-name").textContent = `${reg.studentName || 'Student'} (${reg.studentId || ''})`;
    openModal("modal-ch-view-qr");
    const canvas = document.getElementById("ch-view-qr-canvas");
    const payload = reg.qrPayload || reg.qr_token || (reg.backendId ? `reg-${reg.backendId}` : `reg-${reg.id}`);
    if (window.QRCode && canvas) {
        QRCode.toCanvas(canvas, payload, { width: 220 }, function (err) { if (err) console.error("QR render error:", err); });
    }
}

// ---- Toggle 4: Edit & Publish ----
function renderEmPublishPane(eb) {
    const pane = document.getElementById("ch-em-pane-publish");
    const p = eb.publish || {};
    const prop = getApprovedProposalFor(eb);
    // Venue / date / time are locked to what was requested & approved in the
    // proposal — the Club Head can't change them here, only the registration
    // deadline and the rest of the published listing.
    const lockedVenue = prop ? prop.venue.venueName : (p.venue || "—");
    const lockedDate = prop ? prop.date : (p.date || "");
    const lockedTime = prop ? prop.time : (p.time || "—");
    p.venue = lockedVenue;
    p.date = lockedDate;
    p.time = lockedTime;
    const roundsHtml = (p.rounds || []).map((r, idx) => `
        <div class="ch-em-round-row" data-idx="${idx}" style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
            <input type="text" class="form-input ch-round-name" value="${escapeHtml(r.name)}" placeholder="Round name" style="flex:1;">
            <input type="text" class="form-input ch-round-desc" value="${escapeHtml(r.description)}" placeholder="Description" style="flex:2;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="remove-round" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join("");

    pane.innerHTML = `
        <form id="form-ch-em-publish">
            <div class="form-group"><label class="form-label">Event Name</label><input type="text" id="ch-pub-name" class="form-input" value="${escapeHtml(p.name || eb.eventName)}"></div>
            <div class="form-group"><label class="form-label">Description</label><textarea id="ch-pub-description" class="form-input" rows="2">${escapeHtml(p.description || "")}</textarea></div>
            <div class="form-group"><label class="form-label">Rules / Guidelines</label><textarea id="ch-pub-rules" class="form-input" rows="3">${escapeHtml(p.rules || "")}</textarea></div>
            <div class="form-group"><label class="form-label">Poster</label><input type="file" id="ch-pub-poster" class="form-input" accept="image/*"></div>
            ${p.poster ? `<img src="${p.poster}" style="max-width:180px; border-radius:8px; margin-bottom:0.75rem; display:block;">` : ""}
            <p class="text-muted" style="font-size:0.78rem; margin: 0 0 0.35rem;"><i class="fa-solid fa-lock"></i> Venue, date and time are locked to what was requested &amp; approved in the proposal — only the registration deadline below is editable here.</p>
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <div class="form-group" style="flex:1; min-width:150px;"><label class="form-label">Venue</label><input type="text" id="ch-pub-venue" class="form-input" value="${escapeHtml(p.venue || "")}" readonly disabled></div>
                <div class="form-group" style="flex:1; min-width:150px;"><label class="form-label">Date</label><input type="date" id="ch-pub-date" class="form-input" value="${p.date || ""}" readonly disabled></div>
                <div class="form-group" style="flex:1; min-width:150px;"><label class="form-label">Time</label><input type="text" id="ch-pub-time" class="form-input" value="${escapeHtml(p.time || "")}" readonly disabled></div>
            </div>
            <div class="form-group"><label class="form-label">Registration Deadline</label><input type="date" id="ch-pub-deadline" class="form-input" value="${p.registrationDeadline || ""}"></div>
            <div class="form-group">
                <label class="form-label">Rounds</label>
                <div id="ch-em-rounds-list">${roundsHtml}</div>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-round"><i class="fa-solid fa-plus"></i> Add Round</button>
            </div>
            <div class="form-group"><label class="form-label">Contact Info</label><input type="text" id="ch-pub-contact" class="form-input" value="${escapeHtml(p.contactInfo || "")}"></div>
            <div class="form-group" style="display:flex; align-items:center; gap:0.5rem;">
                <input type="checkbox" id="ch-pub-published" ${p.published ? "checked" : ""} style="width:auto;">
                <label for="ch-pub-published" style="margin:0;">Published (visible to students)</label>
            </div>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Save${p.published ? " & Update" : " & Publish"}</button>
        </form>
    `;
}

function captureEmPublishFormInto(pub) {
    // NOTE: venue/date/time are intentionally NOT read from the form — they're
    // locked to the approved proposal (set in renderEmPublishPane) and must not
    // be editable here, even though the disabled inputs still show them.
    pub.name = document.getElementById("ch-pub-name").value.trim();
    pub.description = document.getElementById("ch-pub-description").value.trim();
    pub.rules = document.getElementById("ch-pub-rules").value.trim();
    pub.registrationDeadline = document.getElementById("ch-pub-deadline").value;
    pub.contactInfo = document.getElementById("ch-pub-contact").value.trim();
    pub.rounds = Array.from(document.querySelectorAll(".ch-em-round-row")).map(row => ({
        name: row.querySelector(".ch-round-name").value.trim(),
        description: row.querySelector(".ch-round-desc").value.trim()
    }));
}

function addPublishRound() {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    captureEmPublishFormInto(eb.publish);
    eb.publish.rounds.push({ name: "", description: "" });
    renderEmPublishPane(eb);
}

function removePublishRound(idx) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    captureEmPublishFormInto(eb.publish);
    eb.publish.rounds.splice(idx, 1);
    renderEmPublishPane(eb);
}

async function submitPublishForm(e) {
    e.preventDefault();
    const eb = state.eventBudgets.find(x => x.id === activeEventMgmtId);
    captureEmPublishFormInto(eb.publish);
    eb.publish.published = document.getElementById("ch-pub-published").checked;

    const posterInput = document.getElementById("ch-pub-poster");
    const file = posterInput.files && posterInput.files[0];
    if (isFileTooLarge(file)) {
        showToast(`Poster is too large — please upload an image under ${MAX_UPLOAD_MB}MB.`, "danger");
        return;
    }
    const finish = () => {
        saveState();
        renderEmPublishPane(eb);
        renderEventMgmtGallery();
        showToast(eb.publish.published ? "Event published to participants." : "Event details saved.");

        // Wire to backend: if the "Published" checkbox is on and this event
        // is linked to a real backend Event row, call the publish endpoint so
        // the event is visible to students server-side too (fire-and-forget).
        if (eb.publish.published && eb.backendEventId) {
            Api.publishEvent(eb.backendEventId).catch(err => {
                showToast(`Backend publish failed — will revert on reload: ${err.detail || err.message}`, "warning");
            });
        }
    };
    if (file) {
        const reader = new FileReader();
        reader.onload = function () {
            eb.publish.poster = reader.result;
            finish();
        };
        reader.readAsDataURL(file);
    } else {
        finish();
    }
}

// ---- Attendance QR Scanner (camera, with manual fallback) ----
function renderAttendanceHistory(eb) {
    const tbody = document.getElementById("ch-qr-attendance-tbody");
    const checkedIn = (eb.registrations || []).filter(r => r.checkedIn);
    tbody.innerHTML = checkedIn.map(r => `
        <tr><td>${escapeHtml(r.studentName)}</td><td>${escapeHtml(r.studentId)}</td><td>${r.checkedInAt ? formatDateTime(r.checkedInAt.replace('T', ' ').substring(0, 16)) + " IST" : "-"}</td></tr>
    `).join("") || `<tr><td colspan="3" class="text-muted text-center">No check-ins yet.</td></tr>`;
}

// Live attendance stats strip in the scanner modal — driven by the real
// backend GET /events/{id}/attendance-stats endpoint when the event is
// linked to a backend Event; hidden for purely-local sample events.
async function loadAttendanceStats(eb) {
    const statsEl = document.getElementById("ch-qr-attendance-stats");
    if (!statsEl) return;
    if (!eb.backendEventId) {
        statsEl.classList.add("hidden");
        statsEl.innerHTML = "";
        return;
    }
    try {
        const s = await Api.attendanceStats(eb.backendEventId);
        if (!s) { statsEl.classList.add("hidden"); return; }
        statsEl.classList.remove("hidden");
        statsEl.innerHTML = `
            <div class="ch-qr-stat"><span class="ch-qr-stat-lbl">Registered</span><span class="ch-qr-stat-val">${s.total_registered}</span></div>
            <div class="ch-qr-stat"><span class="ch-qr-stat-lbl">Checked In</span><span class="ch-qr-stat-val">${s.checked_in}</span></div>
            <div class="ch-qr-stat"><span class="ch-qr-stat-lbl">Pending</span><span class="ch-qr-stat-val">${s.pending}</span></div>
            ${s.last_check_in_at ? `<div class="ch-qr-stat"><span class="ch-qr-stat-lbl">Last Check-in</span><span class="ch-qr-stat-val" style="font-size:0.75rem; color:var(--text-main);">${formatDateTime(s.last_check_in_at.replace('T', ' ').substring(0, 16))} IST</span></div>` : ""}
        `;
    } catch (e) {
        statsEl.classList.add("hidden");
    }
}

function openQrScanner(taskId) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const task = eb.tasks.find(t => t.id === taskId);
    if (!task) return;
    renderAttendanceHistory(eb);
    loadAttendanceStats(eb);
    document.getElementById("ch-qr-scan-status").textContent = "";
    document.getElementById("ch-qr-manual-input").value = "";
    openModal("modal-ch-qr-scanner");
    startQrCamera();
}

function startQrCamera() {
    const video = document.getElementById("ch-qr-video");
    const statusEl = document.getElementById("ch-qr-scan-status");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusEl.textContent = "Camera not available in this browser — use manual entry below.";
        return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
            qrScannerStream = stream;
            video.srcObject = stream;
            video.play();
            qrScannerRAF = requestAnimationFrame(scanQrFrame);
        })
        .catch(() => {
            statusEl.textContent = "Camera access denied or unavailable — use manual entry below.";
        });
}

function scanQrFrame() {
    const video = document.getElementById("ch-qr-video");
    const canvas = document.getElementById("ch-qr-canvas");
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || typeof jsQR !== "function") {
        qrScannerRAF = requestAnimationFrame(scanQrFrame);
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && code.data) {
        handleQrDecoded(code.data);
    } else {
        qrScannerRAF = requestAnimationFrame(scanQrFrame);
    }
}

function handleQrDecoded(payloadStr) {
    markAttendance(payloadStr);
    qrScannerRAF = requestAnimationFrame(scanQrFrame);
}

// `scanned` is either a real backend qr_token (plain string, current
// registrations) or a legacy local-only JSON payload {registrationId}
// (older cached registrations from before this event had a linked
// backend Event) -- try the token match first, fall back to the id.
async function markAttendance(scanned) {
    const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
    const statusEl = document.getElementById("ch-qr-scan-status");
    let legacyId = null;
    try { legacyId = JSON.parse(scanned).registrationId; } catch (e) { /* not JSON -- fine */ }
    const reg = eb.registrations.find(r => r.qrPayload === scanned || r.id === scanned || (legacyId && r.id === legacyId));
    if (!reg) {
        statusEl.textContent = `No registration found for "${scanned}".`;
        return;
    }
    if (reg.checkedIn) {
        statusEl.textContent = `${reg.studentName} has already checked in${reg.checkedInAt ? " at " + formatIstTime(reg.checkedInAt) : ""}.`;
        return;
    }
    if (reg.backendId) {
        try {
            const backendReg = await Api.checkIn(reg.qrPayload);
            reg.checkedInAt = backendReg.checked_in_at;
        } catch (e) {
            // A 409 here means the backend already has this check-in (its
            // detail already reads "Already checked in at <time> IST") --
            // show that directly instead of a generic failure message.
            statusEl.textContent = e.status === 409 ? `${reg.studentName}: ${e.detail}` : `Check-in failed: ${e.detail || e.message}`;
            return;
        }
    } else {
        reg.checkedInAt = new Date().toISOString();
    }
    reg.checkedIn = true;
    saveState();
    statusEl.textContent = `✅ ${reg.studentName} marked present${reg.checkedInAt ? " at " + formatIstTime(reg.checkedInAt) : ""}.`;
    renderAttendanceHistory(eb);
    loadAttendanceStats(eb);
}

function stopQrCamera() {
    if (qrScannerRAF) cancelAnimationFrame(qrScannerRAF);
    qrScannerRAF = null;
    if (qrScannerStream) {
        qrScannerStream.getTracks().forEach(t => t.stop());
        qrScannerStream = null;
    }
}

function setupEventManagementEvents() {
    const emGrid = document.getElementById("ch-em-grid");
    if (emGrid) {
        emGrid.addEventListener("click", (e) => {
            const card = e.target.closest(".event-budget-card");
            if (!card) return;
            openEventMgmtDetail(Number(card.getAttribute("data-id")));
        });
    }

    const btnEmBack = document.getElementById("btn-ch-em-back");
    if (btnEmBack) {
        btnEmBack.addEventListener("click", () => {
            activeEventMgmtId = null;
            showEventMgmtGallery();
        });
    }

    document.querySelectorAll(".ch-em-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => switchEmToggle(btn.getAttribute("data-toggle")));
    });

    const emDetailView = document.getElementById("ch-em-detail-view");
    if (emDetailView) {
        emDetailView.addEventListener("click", (e) => {
            const actionEl = e.target.closest("[data-action]");
            if (!actionEl) return;
            const action = actionEl.getAttribute("data-action");
            if (action === "accept-task") acceptTask(actionEl.getAttribute("data-task-id"));
            else if (action === "submit-task") submitTaskProof(actionEl.getAttribute("data-task-id"));
            else if (action === "verify-task") verifyTask(actionEl.getAttribute("data-task-id"));
            else if (action === "revise-task") reviseTask(actionEl.getAttribute("data-task-id"));
            else if (action === "open-scanner") openQrScanner(actionEl.getAttribute("data-task-id"));
            else if (action === "allot-attendance") allotAttendanceTask();
            else if (action === "allot-procurement") allotProcurementTask(numAttr(actionEl, "data-usage-id"));
            else if (action === "allot-billupload") allotBillUploadTask(numAttr(actionEl, "data-expense-id"));
            else if (action === "open-upload-bill-task") openUploadBillModal(numAttr(actionEl, "data-expense-id"));
            else if (action === "open-add-task") openAddTaskModal();
            else if (action === "view-qr") viewRegistrationQr(actionEl.getAttribute("data-reg-id"));
            else if (action === "seed-registrations") seedRegistrations();
            else if (action === "sync-registrations") {
                const eb = state.eventBudgets.find(e => e.id === activeEventMgmtId);
                if (eb) syncBackendRegistrations(eb);
            }
            else if (action === "add-round") addPublishRound();
            else if (action === "remove-round") removePublishRound(parseInt(actionEl.getAttribute("data-idx"), 10));
        });
    }

    const panePublish = document.getElementById("ch-em-pane-publish");
    if (panePublish) {
        panePublish.addEventListener("submit", (e) => {
            if (e.target && e.target.id === "form-ch-em-publish") submitPublishForm(e);
        });
    }

    const formAddTask = document.getElementById("form-ch-add-task");
    if (formAddTask) {
        formAddTask.addEventListener("submit", submitAddTask);
    }

    document.querySelectorAll(".modal-close-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            const overlay = this.closest(".modal-overlay");
            if (overlay && overlay.id === "modal-ch-qr-scanner") stopQrCamera();
        });
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") stopQrCamera();
    });

    const btnQrSubmit = document.getElementById("btn-ch-qr-manual-submit");
    if (btnQrSubmit) {
        btnQrSubmit.addEventListener("click", () => {
            const input = document.getElementById("ch-qr-manual-input");
            const val = input ? input.value.trim() : "";
            if (val) markAttendance(val);
        });
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    if (typeof __session === "undefined" || !__session) return;
    CURRENT_CLUB_ID = __session.clubId ? Number(__session.clubId) : null;
    CURRENT_USER_NAME = __session.name || "Club Head";

    await loadState();

    const myClub = (state.clubsFinances || []).find(cf => Number(cf.id) === Number(CURRENT_CLUB_ID));
    CURRENT_CLUB = myClub ? myClub.club : "";
    if (!CURRENT_CLUB && state.clubsFinances && state.clubsFinances.length > 0) {
        const fallback = state.clubsFinances[0];
        CURRENT_CLUB = fallback.club;
        if (!CURRENT_CLUB_ID) CURRENT_CLUB_ID = fallback.id;
    }

    const nameEl = document.getElementById("sidebar-username");
    if (nameEl) nameEl.textContent = CURRENT_USER_NAME;
    const roleEl = document.getElementById("sidebar-userrole");
    if (roleEl) roleEl.textContent = `Club Head · ${CURRENT_CLUB}`;

    setupFormTableEvents();
    setupMembershipEvents();
    setupEventManagementEvents();
    setupVolunteerChatEvents();

    // ---- Top-level sidebar tab switching (Dashboard <-> Event Proposals <-> Club Finances) ----
    const navLinks = document.querySelectorAll(".sidebar .nav-link");
    navLinks.forEach(link => {
        link.addEventListener("click", function (e) {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove("active"));
            this.classList.add("active");

            const tab = this.getAttribute("data-tab");
            document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));
            const targetPane = document.getElementById(`tab-${tab}`);
            if (targetPane) targetPane.classList.add("active");
            // Remember the active tab so a page refresh restores it instead of
            // falling back to the default view.
            localStorage.setItem("sscms_active_tab_clubhead", tab);

            const titleEl = document.getElementById("page-title");
            const subTitleEl = document.getElementById("page-subtitle");

            if (tab === "dashboard") {
                if (titleEl) titleEl.textContent = `${CURRENT_CLUB || "Club Head"} Dashboard`;
                if (subTitleEl) subTitleEl.textContent = `Welcome back, ${CURRENT_USER_NAME || "Club Head"}. Here is an overview of your club's activities, members, and events.`;
                renderClubHeadDashboard();
            } else if (tab === "proposals") {
                if (titleEl) titleEl.textContent = "Event Proposals";
                if (subTitleEl) subTitleEl.textContent = `Submit new event proposals and track their approval status with the Club President.`;
                activeDetailId = null;
                editingProposalId = null;
                showView("gallery");
                renderGallery();
            } else if (tab === "eventmgmt") {
                if (titleEl) titleEl.textContent = "Event Management";
                if (subTitleEl) subTitleEl.textContent = `Manage tasks, registrations and publishing for ${CURRENT_CLUB}'s approved events.`;
                activeEventMgmtId = null;
                showEventMgmtGallery();
            } else if (tab === "members") {
                if (titleEl) titleEl.textContent = "Manage Members";
                if (subTitleEl) subTitleEl.textContent = `View ${CURRENT_CLUB}'s member roster, and approve or reject new join requests.`;
                renderMembers();
            } else if (tab === "volunteers") {
                if (titleEl) titleEl.textContent = "Volunteer Management";
                if (subTitleEl) subTitleEl.textContent = `Send domain recruitment, review volunteer applications, and track selected volunteers for ${CURRENT_CLUB}.`;
                renderVolunteerManagement();
            } else if (tab === "finances") {
                if (titleEl) titleEl.textContent = "Club Finances & Event Budgets";
                if (subTitleEl) subTitleEl.textContent = `View ${CURRENT_CLUB}'s allotted budget, spend, and per-event breakdowns.`;
                activeFinanceEventBudgetId = null;
                renderFinanceDashboard();
            } else if (tab === "volunteerchat") {
                if (titleEl) titleEl.textContent = "Volunteer Chat";
                if (subTitleEl) subTitleEl.textContent = `Message your selected volunteers for ${CURRENT_CLUB} directly.`;
                renderVolunteerChatList();
            }
        });
    });

    // Quick action shortcuts on Dashboard
    const quickNewProp = document.getElementById("ch-quick-new-proposal");
    if (quickNewProp) {
        quickNewProp.addEventListener("click", () => {
            const link = document.querySelector(`.sidebar .nav-link[data-tab="proposals"]`);
            if (link) link.click();
            openNewProposalForm();
        });
    }
    const quickManageMembers = document.getElementById("ch-quick-manage-members");
    if (quickManageMembers) {
        quickManageMembers.addEventListener("click", () => {
            const link = document.querySelector(`.sidebar .nav-link[data-tab="members"]`);
            if (link) link.click();
        });
    }
    const quickVolunteers = document.getElementById("ch-quick-volunteers");
    if (quickVolunteers) {
        quickVolunteers.addEventListener("click", () => {
            const link = document.querySelector(`.sidebar .nav-link[data-tab="volunteers"]`);
            if (link) link.click();
        });
    }
    const quickFinances = document.getElementById("ch-quick-finances");
    if (quickFinances) {
        quickFinances.addEventListener("click", () => {
            const link = document.querySelector(`.sidebar .nav-link[data-tab="finances"]`);
            if (link) link.click();
        });
    }
    const quickChat = document.getElementById("ch-quick-chat");
    if (quickChat) {
        quickChat.addEventListener("click", () => {
            const link = document.querySelector(`.sidebar .nav-link[data-tab="volunteerchat"]`);
            if (link) link.click();
        });
    }
    const dashViewEventsBtn = document.getElementById("ch-dash-view-events-btn");
    if (dashViewEventsBtn) {
        dashViewEventsBtn.addEventListener("click", () => {
            const link = document.querySelector(`.sidebar .nav-link[data-tab="eventmgmt"]`);
            if (link) link.click();
        });
    }

    // ---- Finance: clicking an event budget card shows its split-up ----
    const finGrid = document.getElementById("ch-finance-event-grid");
    if (finGrid) {
        finGrid.addEventListener("click", (e) => {
            const card = e.target.closest(".event-budget-card");
            if (!card) return;
            activeFinanceEventBudgetId = Number(card.getAttribute("data-id"));
            renderFinanceDashboard();
        });
    }

    // ---- Finance: Upload Bill modal ----
    const selfProcTbody = document.getElementById("ch-split-selfproc-tbody");
    if (selfProcTbody) {
        selfProcTbody.addEventListener("click", (e) => {
            const uploadBtn = e.target.closest(".ch-upload-bill-btn");
            if (!uploadBtn) return;
            openUploadBillModal(Number(uploadBtn.getAttribute("data-id")));
        });
    }
    const formUploadBill = document.getElementById("form-ch-upload-bill");
    if (formUploadBill) formUploadBill.addEventListener("submit", submitUploadBill);

    const prizeTbody = document.getElementById("ch-split-prize-tbody");
    if (prizeTbody) {
        prizeTbody.addEventListener("click", (e) => {
            const btn = e.target.closest(".ch-prize-details-btn");
            if (!btn) return;
            openPrizeDetailsModal(Number(btn.getAttribute("data-id")));
        });
    }
    const formPrizeDetails = document.getElementById("form-ch-prize-details");
    if (formPrizeDetails) formPrizeDetails.addEventListener("submit", submitPrizeDetails);

    const judgeTbody = document.getElementById("ch-split-judge-tbody");
    if (judgeTbody) {
        judgeTbody.addEventListener("click", (e) => {
            const btn = e.target.closest(".ch-judge-details-btn");
            if (!btn) return;
            openJudgeDetailsModal(Number(btn.getAttribute("data-id")));
        });
    }
    const formJudgeDetails = document.getElementById("form-ch-judge-details");
    if (formJudgeDetails) formJudgeDetails.addEventListener("submit", submitJudgeDetails);

    const btnSendProc = document.getElementById("btn-ch-send-for-processing");
    if (btnSendProc) btnSendProc.addEventListener("click", sendExpensesForProcessing);

    // ---- Generic modal close controls ----
    document.querySelectorAll(".modal-close-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            const overlay = this.closest(".modal-overlay");
            if (overlay) overlay.classList.remove("active");
        });
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".modal-overlay").forEach(overlay => overlay.classList.remove("active"));
        }
    });

    const btnNewProp = document.getElementById("btn-new-proposal");
    if (btnNewProp) btnNewProp.addEventListener("click", openNewProposalForm);

    const btnAiAssist = document.getElementById("btn-ch-ai-assist");
    if (btnAiAssist) btnAiAssist.addEventListener("click", runAiAssist);

    const btnBackForm = document.getElementById("btn-back-from-form");
    if (btnBackForm) {
        btnBackForm.addEventListener("click", () => {
            if (confirm("Leave this form? Any unsaved changes will be lost.")) {
                editingProposalId = null;
                resetFormState();
                showView("gallery");
                renderGallery();
            }
        });
    }

    const btnBackGal = document.getElementById("btn-ch-back-to-gallery");
    if (btnBackGal) {
        btnBackGal.addEventListener("click", () => {
            activeDetailId = null;
            showView("gallery");
            renderGallery();
        });
    }

    const btnSendApp = document.getElementById("btn-ch-send-approval");
    if (btnSendApp) btnSendApp.addEventListener("click", submitProposal);

    const btnCancel = document.getElementById("btn-ch-cancel");
    if (btnCancel) btnCancel.addEventListener("click", cancelForm);

    // Restore the last-active tab on refresh (defaults to dashboard).
    const savedTab = localStorage.getItem("sscms_active_tab_clubhead") || "dashboard";
    const savedLink = document.querySelector(`.sidebar .nav-link[data-tab="${savedTab}"]`) || document.querySelector(`.sidebar .nav-link[data-tab="dashboard"]`);
    if (savedLink) {
        savedLink.click();
    } else {
        renderClubHeadDashboard();
    }
});

// ============================================================
// DASHBOARD OVERVIEW RENDERING
// ============================================================
function renderClubHeadDashboard() {
    // 1. Members
    const clubMembers = (state.clubMembers || []).filter(m => m.club === CURRENT_CLUB);
    const activeMembers = clubMembers.filter(m => m.status === "Active").length;
    const pendingMembers = clubMembers.filter(m => m.status === "Pending").length;
    const membersCountEl = document.getElementById("ch-stat-members-count");
    if (membersCountEl) membersCountEl.textContent = String(activeMembers);
    const membersPendingEl = document.getElementById("ch-stat-members-pending");
    if (membersPendingEl) {
        membersPendingEl.innerHTML = pendingMembers > 0 
            ? `<span class="text-warning"><i class="fa-solid fa-clock"></i> ${pendingMembers} pending request${pendingMembers === 1 ? '' : 's'}</span>`
            : `<span class="text-success"><i class="fa-solid fa-circle-check"></i> Roster up to date</span>`;
    }

    // 2. Events & Proposals
    const clubEvents = (state.events || []).filter(e => e.club === CURRENT_CLUB);
    const clubProposals = (state.proposals || []).filter(p => p.club === CURRENT_CLUB);
    const approvedProposals = clubProposals.filter(p => p.status === "Approved").length;
    const inReviewProposals = clubProposals.filter(p => (p.status || "").startsWith("Pending") || p.status === "Needs Revision").length;

    const eventsCountEl = document.getElementById("ch-stat-events-count");
    if (eventsCountEl) eventsCountEl.textContent = String(clubEvents.length);
    const eventsActiveEl = document.getElementById("ch-stat-events-active");
    if (eventsActiveEl) {
        const publishedCount = clubEvents.filter(e => e.status === "Approved" || e.published).length;
        eventsActiveEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${publishedCount} published`;
    }

    const proposalsCountEl = document.getElementById("ch-stat-proposals-count");
    if (proposalsCountEl) proposalsCountEl.textContent = String(clubProposals.length);
    const proposalsReviewEl = document.getElementById("ch-stat-proposals-review");
    if (proposalsReviewEl) {
        proposalsReviewEl.innerHTML = inReviewProposals > 0
            ? `<span class="text-warning"><i class="fa-solid fa-hourglass-half"></i> ${inReviewProposals} in review</span>`
            : `<span class="text-muted"><i class="fa-solid fa-circle-check"></i> All processed</span>`;
    }

    // 3. Volunteers & Domains
    const clubDomains = (state.domains || []).filter(d => d.club === CURRENT_CLUB);
    const clubVolunteers = (state.volunteerApplications || []).filter(a => a.club === CURRENT_CLUB && a.status === "Selected").length;
    const volunteersCountEl = document.getElementById("ch-stat-volunteers-count");
    if (volunteersCountEl) volunteersCountEl.textContent = String(clubVolunteers);
    const domainsCountEl = document.getElementById("ch-stat-domains-count");
    if (domainsCountEl) domainsCountEl.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${clubDomains.length} active domain${clubDomains.length === 1 ? '' : 's'}`;

    // 4. Finances
    const cf = (state.clubsFinances || []).find(c => c.club === CURRENT_CLUB) || { allotted: 0, spent: 0 };
    const clubEbList = (state.eventBudgets || []).filter(e => e.club === CURRENT_CLUB);
    const ebAllotted = clubEbList.reduce((sum, e) => sum + (Number(e.allotted) || 0), 0);
    const ebSpent = clubEbList.reduce((sum, e) => sum + getApprovedExpenseTotal(e), 0);
    const totalAllotted = Math.max(Number(cf.allotted) || 0, ebAllotted, ebSpent);
    const totalSpent = Math.max(Number(cf.spent) || 0, ebSpent);
    const remaining = totalAllotted - totalSpent;

    const budgetRemainingEl = document.getElementById("ch-stat-budget-remaining");
    if (budgetRemainingEl) {
        budgetRemainingEl.textContent = formatCurrency(remaining);
        budgetRemainingEl.style.color = remaining < 0 ? 'var(--danger)' : 'var(--text-main)';
    }
    const budgetSpentEl = document.getElementById("ch-stat-budget-spent");
    if (budgetSpentEl) {
        budgetSpentEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${formatCurrency(totalSpent)} spent (${totalAllotted > 0 ? Math.round((totalSpent / totalAllotted) * 100) : 0}%)`;
    }

    // 5. Render Upcoming Events Table
    const eventsTbody = document.getElementById("ch-dash-events-tbody");
    if (eventsTbody) {
        if (clubEvents.length === 0) {
            eventsTbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center" style="padding:1.5rem;">No active events conducted yet. Click "Submit New Event Proposal" to get started!</td></tr>`;
        } else {
            const sortedEvents = [...clubEvents].sort((a, b) => (a.date || a.event_date || "").localeCompare(b.date || b.event_date || ""));
            eventsTbody.innerHTML = sortedEvents.slice(0, 5).map(ev => {
                const venueObj = (state.venues || []).find(v => v.id === ev.venueId) || { name: ev.venueName || "TBD" };
                const regCount = (state.registrations || []).filter(r => r.event_id === ev.id || r.eventId === ev.id).length;
                return `
                    <tr>
                        <td><strong>${escapeHtml(ev.name || ev.title)}</strong></td>
                        <td>${formatDate(ev.date || ev.event_date)} ${ev.timeStart ? `(${formatTimeRange(ev.timeStart, ev.timeEnd)})` : ''}</td>
                        <td><i class="fa-solid fa-location-dot text-indigo"></i> ${escapeHtml(venueObj.name || "TBD")}</td>
                        <td><span class="badge badge-info">${regCount} registered</span></td>
                        <td><span class="badge badge-success">${ev.finalized ? 'Completed' : (ev.status || 'Active')}</span></td>
                    </tr>
                `;
            }).join("");
        }
    }

    // 6. Render Active Domains list
    const domainsListEl = document.getElementById("ch-dash-domains-list");
    const domainsBadgeEl = document.getElementById("ch-dash-domains-badge");
    if (domainsBadgeEl) domainsBadgeEl.textContent = `${clubDomains.length} Domains`;
    if (domainsListEl) {
        if (clubDomains.length === 0) {
            domainsListEl.innerHTML = `<li class="text-muted text-center" style="padding:1rem;">No recruitment domains published yet.</li>`;
        } else {
            domainsListEl.innerHTML = clubDomains.map(d => {
                const selectedCount = (state.volunteerApplications || []).filter(a => a.club === CURRENT_CLUB && a.domainId === d.id && a.status === "Selected").length;
                const pendingCount = (state.volunteerApplications || []).filter(a => a.club === CURRENT_CLUB && a.domainId === d.id && a.status === "Pending").length;
                return `
                    <li style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid var(--border-color);">
                        <div>
                            <strong>${escapeHtml(d.title)}</strong>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(d.description ? d.description.slice(0, 40) + '…' : '')}</div>
                        </div>
                        <div style="display:flex; gap:0.35rem; align-items:center;">
                            <span class="badge badge-success" title="Selected volunteers">${selectedCount} active</span>
                            ${pendingCount > 0 ? `<span class="badge badge-warning" title="Pending applications">${pendingCount} new</span>` : ''}
                        </div>
                    </li>
                `;
            }).join("");
        }
    }
}
