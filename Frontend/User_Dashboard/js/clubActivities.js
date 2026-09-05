// Club Activities Tab — visible only to approved (Selected) volunteers.
// Ongoing Events for the volunteer's club(s) + Assigned Tasks grouped by
// domain, with the full Accept -> Submit Proof -> (Verified / Revision
// Requested) workflow, plus the Attendance-task QR scanner.

let stuQrStream = null;
let stuQrRAF = null;
let activeStuAttendanceTaskId = null;
let activeStuAttendanceEbId = null;
let activeProofTaskId = null;
let activeProofEbId = null;

// Sync assigned tasks from the backend (source of truth) so duties assigned
// from another device / session — or created before a local state save — still
// show up here. Backend TaskOut uses event_id (the backend proposal/event id)
// and assigned_to (the numeric user id); listMyTasks only returns tasks for the
// logged-in user, so we map those straight onto the shared local
// eventBudget/task shape and let the backend win on status/proof.
async function syncMyTasksFromBackend() {
    if (typeof Api === "undefined" || !Api.listMyTasks) return;
    const backendTasks = await Api.listMyTasks().catch(() => []);
    if (!backendTasks || !backendTasks.length) return;

    let changed = false;
    backendTasks.forEach(bt => {
        const eb = (state.eventBudgets || []).find(e => e.backendEventId === bt.event_id);
        if (!eb) return;
        eb.tasks = eb.tasks || [];
        const existing = eb.tasks.find(t => t.backendId === bt.id);
        if (existing) {
            // Backend is the source of truth for this task's lifecycle.
            if (existing.status !== bt.status) { existing.status = bt.status; changed = true; }
            if (bt.proof_text && (!existing.proof || existing.proof.note !== bt.proof_text)) {
                existing.proof = Object.assign({}, existing.proof, { note: bt.proof_text });
                changed = true;
            }
            return;
        }
        eb.tasks.push({
            id: generateId("task"),
            backendId: bt.id,
            eventId: eb.id,
            title: bt.title,
            description: bt.description || "",
            type: bt.type,
            priority: bt.priority || "Medium",
            deadline: bt.deadline || null,
            assignedVolunteerId: CURRENT_STUDENT_ID,
            assignedVolunteerName: CURRENT_STUDENT_NAME,
            domainId: null,
            procurementUsageId: null,
            expenseId: bt.expense_id || null,
            status: bt.status || "Assigned",
            proof: bt.proof_text ? { note: bt.proof_text, link: "", fileName: "" } : null,
            createdOn: todayStr()
        });
        changed = true;
    });
    if (changed) saveState();
}

window.renderClubActivities = async function () {
    const container = document.getElementById("club-activities-container");
    if (!container) return;

    const clubs = getSelectedVolunteerClubs();
    if (clubs.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 4rem 0;">
                <i class="fa-solid fa-lock" style="font-size: 3rem;"></i>
                <p style="margin-top: 1rem;">Get selected as a volunteer for a club to unlock Club Activities.</p>
            </div>
        `;
        return;
    }

    await syncMyTasksFromBackend();

    container.innerHTML = clubs.map(club => renderClubActivitiesBlock(club)).join("");
    wireClubActivitiesEvents(container);
};

function renderClubActivitiesBlock(club) {
    let ongoingEvents = (state.eventBudgets || []).filter(eb => eb.club === club && (isEventOngoing(eb) || (eb.tasks || []).some(t => t.assignedVolunteerId === CURRENT_STUDENT_ID && t.status !== "Verified")));
    let myTasksForClub = getMyTasks().filter(({ eb }) => eb.club === club);

    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        ongoingEvents = ongoingEvents.filter(eb =>
            getEventDisplayName(eb).toLowerCase().includes(q) ||
            (eb.publish && eb.publish.venue && eb.publish.venue.toLowerCase().includes(q))
        );
        myTasksForClub = myTasksForClub.filter(({ task, eb }) =>
            (task.title && task.title.toLowerCase().includes(q)) ||
            (task.description && task.description.toLowerCase().includes(q)) ||
            (task.type && task.type.toLowerCase().includes(q)) ||
            getEventDisplayName(eb).toLowerCase().includes(q)
        );
    }

    const ongoingHtml = ongoingEvents.length
        ? `<div class="task-cards">${ongoingEvents.map(eb => `
            <div class="task-card">
                <div class="task-card-header"><span class="task-card-title">${escapeHtml(getEventDisplayName(eb))}</span>${isEventOngoing(eb) ? '<span class="badge badge-success">Happening Today</span>' : '<span class="badge badge-secondary">Upcoming</span>'}</div>
                <div class="task-card-meta"><i class="fa-solid fa-location-dot"></i> ${escapeHtml((eb.publish && eb.publish.venue) || "Venue TBA")} &middot; <i class="fa-regular fa-clock"></i> ${escapeHtml((eb.publish && eb.publish.time) || "TBA")}</div>
            </div>
        `).join("")}</div>`
        : `<p class="text-muted-note">${uiState.searchQuery ? 'No ongoing events match your search.' : `No ongoing events for ${escapeHtml(club)} right now.`}</p>`;

    // Group tasks by domain title (fallback to task type when no domain is set).
    const groups = {};
    myTasksForClub.forEach(({ task, eb }) => {
        const domain = getDomain(task.domainId);
        const groupTitle = domain ? domain.title : (task.type === "Attendance" ? "Attendance Duty" : task.type === "Procurement" ? "Procurement Duty" : task.type === "Bill Upload" ? "Bill Upload Duty" : "General Tasks");
        if (!groups[groupTitle]) groups[groupTitle] = [];
        groups[groupTitle].push({ task, eb });
    });

    const domainGroupsHtml = Object.keys(groups).length
        ? Object.keys(groups).map(groupTitle => `
            <div class="ca-domain-group">
                <div class="ca-domain-title">${escapeHtml(groupTitle)}</div>
                <div class="task-cards">${groups[groupTitle].map(({ task, eb }) => taskCardHtml(task, eb)).join("")}</div>
            </div>
        `).join("")
        : `<p class="text-muted-note">${uiState.searchQuery ? 'No assigned tasks match your search.' : 'No tasks assigned yet — the Club Head will assign duties here.'}</p>`;

    return `
        <div class="ca-club-block">
            <div class="ca-club-header">
                <h2><i class="fa-solid fa-people-group" style="color: var(--primary);"></i> ${escapeHtml(club)}</h2>
            </div>
            <div class="ca-section-title"><i class="fa-solid fa-bolt" style="color: var(--success);"></i> Ongoing Events</div>
            ${ongoingHtml}
            <div class="ca-section-title"><i class="fa-solid fa-list-check" style="color: var(--primary);"></i> Assigned Tasks</div>
            ${domainGroupsHtml}
        </div>
    `;
}

function taskStatusBadge(status) {
    if (status === "Assigned") return `<span class="badge badge-secondary">Assigned</span>`;
    if (status === "Accepted") return `<span class="badge badge-info">Accepted</span>`;
    if (status === "Submitted") return `<span class="badge badge-warning">Awaiting Verification</span>`;
    if (status === "Verified") return `<span class="badge badge-success">Verified</span>`;
    if (status === "Revision Requested") return `<span class="badge badge-danger">Revision Requested</span>`;
    return `<span class="badge badge-secondary">${escapeHtml(status)}</span>`;
}

// Bill Upload tasks (self-procured expense items) skip the generic Submit->Verify loop —
// once accepted, the card tracks the LINKED EXPENSE's own status, since that's what's
// actually being reviewed (first by the President, then the Faculty Coordinator).
function expenseStatusForStudent(status) {
    if (status === "Pending President Review") return { label: "Sent to the Club Head — awaiting President review.", badge: "badge-warning" };
    if (status === "Pending Faculty Review") return { label: "Awaiting the Faculty Coordinator's final approval.", badge: "badge-info" };
    if (status === "Approved") return { label: "Approved — task complete.", badge: "badge-success" };
    if (status === "Rejected") return { label: "Rejected — please revise and re-upload.", badge: "badge-danger" };
    if (status === "Not Utilized") return { label: "Marked as not spent.", badge: "badge-secondary" };
    return { label: "Not uploaded yet.", badge: "badge-secondary" };
}

function billUploadTaskCardHtml(task, eb) {
    const exp = (eb.expenses || []).find(e => e.id === task.expenseId);
    if (!exp) return "";

    let actions = "";
    if (task.status === "Assigned") {
        actions = `<button class="btn-secondary" data-action="accept-task" data-task-id="${task.id}" data-eb-id="${eb.id}" style="flex: none; padding: 0.5rem 1rem;"><i class="fa-solid fa-check"></i> Accept Task</button>`;
    } else if (["Awaiting Bill", "Draft", "Rejected"].includes(exp.status)) {
        const label = exp.billFileName ? "Edit Bill" : "Upload Bill";
        actions = `<button class="action-primary-btn" data-action="open-bill-upload" data-task-id="${task.id}" data-eb-id="${eb.id}" style="padding: 0.5rem 1rem;"><i class="fa-solid fa-upload"></i> ${label}</button>`;
    } else {
        const info = expenseStatusForStudent(exp.status);
        actions = `<span class="text-muted-note"><i class="fa-solid fa-hourglass-half"></i> ${escapeHtml(info.label)}</span>`;
    }

    const billLink = exp.billFileUrl
        ? `<a href="${SSCMS_API_BASE}${exp.billFileUrl}" target="_blank" rel="noopener">${escapeHtml(exp.billFileName)}</a>`
        : escapeHtml(exp.billFileName || "");
    const billInfo = exp.billFileName
        ? `<div class="task-card-proof">Bill: ${billLink} (${formatCurrency(exp.billAmount)})</div>`
        : (exp.status === "Not Utilized" ? `<div class="task-card-proof">Marked as not spent.</div>` : "");

    const statusInfo = task.status === "Assigned"
        ? `<span class="badge badge-secondary">Assigned</span>`
        : `<span class="badge ${expenseStatusForStudent(exp.status).badge}">${escapeHtml(exp.status)}</span>`;

    return `
        <div class="task-card">
            <div class="task-card-header">
                <span class="task-card-title">${escapeHtml(task.title)}</span>
                ${statusInfo}
            </div>
            <p class="text-muted-note" style="margin-bottom:0.5rem;">${escapeHtml(task.description || "")}</p>
            <div class="task-card-meta">
                ${getEventDisplayName(eb) ? `<i class="fa-solid fa-calendar-day"></i> ${escapeHtml(getEventDisplayName(eb))} &middot; ` : ""}
                Priority: ${escapeHtml(task.priority || "Medium")} &middot; Assigned by: Club Head
            </div>
            ${billInfo}
            <div class="task-card-actions">${actions}</div>
        </div>
    `;
}

function taskCardHtml(task, eb) {
    if (task.type === "Bill Upload" && task.expenseId) return billUploadTaskCardHtml(task, eb);

    let actions = "";
    if (task.status === "Assigned") {
        actions = `<button class="btn-secondary" data-action="accept-task" data-task-id="${task.id}" data-eb-id="${eb.id}" style="flex: none; padding: 0.5rem 1rem;"><i class="fa-solid fa-check"></i> Accept Task</button>`;
    } else if (task.status === "Accepted") {
        if (task.type === "Attendance") {
            actions += `<button class="btn-secondary" data-action="open-scanner" data-task-id="${task.id}" data-eb-id="${eb.id}" style="flex: none; padding: 0.5rem 1rem;"><i class="fa-solid fa-qrcode"></i> Open QR Scanner</button> `;
        }
        actions += `<button class="action-primary-btn" data-action="open-proof" data-task-id="${task.id}" data-eb-id="${eb.id}" style="padding: 0.5rem 1rem;"><i class="fa-solid fa-upload"></i> Mark as Completed</button>`;
    } else if (task.status === "Revision Requested") {
        actions = `<button class="btn-secondary" data-action="accept-task" data-task-id="${task.id}" data-eb-id="${eb.id}" style="flex: none; padding: 0.5rem 1rem;"><i class="fa-solid fa-rotate"></i> Resume &amp; Resubmit</button>`;
    } else if (task.status === "Submitted") {
        actions = `<span class="text-muted-note"><i class="fa-solid fa-hourglass-half"></i> Sent to the Club Head for verification.</span>`;
    } else if (task.status === "Verified") {
        actions = `<span class="text-muted-note"><i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Closed.</span>`;
    }

    const proofHtml = task.proof
        ? `<div class="task-card-proof">Proof: ${escapeHtml(task.proof.note || "")}${task.proof.link ? ` &middot; <a href="${escapeHtml(task.proof.link)}" target="_blank" rel="noopener">${escapeHtml(task.proof.link)}</a>` : ""}${task.proof.fileName ? ` &middot; ${escapeHtml(task.proof.fileName)}` : ""}</div>`
        : "";

    return `
        <div class="task-card">
            <div class="task-card-header">
                <span class="task-card-title">${escapeHtml(task.title)}</span>
                ${taskStatusBadge(task.status)}
            </div>
            <p class="text-muted-note" style="margin-bottom:0.5rem;">${escapeHtml(task.description || "")}</p>
            <div class="task-card-meta">
                ${getEventDisplayName(eb) ? `<i class="fa-solid fa-calendar-day"></i> ${escapeHtml(getEventDisplayName(eb))} &middot; ` : ""}
                ${task.deadline ? `Due ${formatDate(task.deadline)} &middot; ` : ""}
                Priority: ${escapeHtml(task.priority || "Medium")} &middot; Assigned by: Club Head
            </div>
            ${proofHtml}
            <div class="task-card-actions">${actions}</div>
        </div>
    `;
}

function wireClubActivitiesEvents(container) {
    // data-eb-id is always a string; eventBudget ids are numeric (backend-owned)
    // -- Number() it here or every eb lookup below (`e.id === ebId`) silently
    // fails to match, leaving these buttons looking unresponsive.
    container.querySelectorAll("[data-action='accept-task']").forEach(btn => {
        btn.addEventListener("click", () => acceptStudentTask(btn.getAttribute("data-task-id"), numAttr(btn, "data-eb-id")));
    });
    container.querySelectorAll("[data-action='open-scanner']").forEach(btn => {
        btn.addEventListener("click", () => openStuQrScanner(btn.getAttribute("data-task-id"), numAttr(btn, "data-eb-id")));
    });
    container.querySelectorAll("[data-action='open-proof']").forEach(btn => {
        btn.addEventListener("click", () => openTaskProofModal(btn.getAttribute("data-task-id"), numAttr(btn, "data-eb-id")));
    });
    container.querySelectorAll("[data-action='open-bill-upload']").forEach(btn => {
        btn.addEventListener("click", () => openBillUploadModal(btn.getAttribute("data-task-id"), numAttr(btn, "data-eb-id")));
    });
}

// ---- Task accept (mirrors Club Head's acceptTask, driven from the volunteer side) ----
async function acceptStudentTask(taskId, ebId) {
    const eb = (state.eventBudgets || []).find(e => e.id === ebId);
    const task = eb && eb.tasks.find(t => t.id === taskId);
    if (!task) return;
    // Backend's /accept only accepts a task still "Assigned" -- a "Revision
    // Requested" task goes straight back to Accepted locally (matching the
    // backend, which lets it be resubmitted directly via /submit-proof).
    if (task.backendId && task.status === "Assigned") {
        try {
            await Api.acceptTask(task.backendId);
        } catch (e) {
            // Don't block the local transition on a backend conflict (e.g. a
            // Club Head's "Simulate" shortcuts already moved this task past
            // Assigned on their end) -- just don't claim it as synced.
            console.warn("Accept task: backend not updated:", e.detail || e.message);
        }
    }
    task.status = "Accepted";
    task.proof = null;
    if (task.type === "Procurement" && task.procurementUsageId) {
        const usage = (state.inventoryUsage || []).find(u => u.id === task.procurementUsageId);
        if (usage) {
            usage.volunteerName = CURRENT_STUDENT_NAME;
            usage.volunteerId = CURRENT_STUDENT_ID;
            usage.assignedViaTask = true;
        }
        showToast("Procurement task accepted — now visible to the President & Faculty Coordinator.", "success");
    } else if (task.type === "Attendance") {
        showToast("Attendance task accepted — QR scanner unlocked.", "success");
    } else if (task.type === "Bill Upload") {
        showToast("Task accepted — upload the bill once you've procured the item.", "success");
    } else {
        showToast("Task accepted.", "success");
    }
    saveState();
    window.renderClubActivities();
}

// ---- Proof submission ----
function openTaskProofModal(taskId, ebId) {
    activeProofTaskId = taskId;
    activeProofEbId = ebId;
    const eb = (state.eventBudgets || []).find(e => e.id === ebId);
    const task = eb && eb.tasks.find(t => t.id === taskId);
    document.getElementById("task-proof-modal-title").textContent = task ? `Submit Proof — ${task.title}` : "Submit Proof of Completion";
    document.getElementById("task-proof-form").reset();
    openModalOverlay("task-proof-modal");
}

function setupTaskProofFormSubmit() {
    const form = document.getElementById("task-proof-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const eb = (state.eventBudgets || []).find(x => x.id === activeProofEbId);
        const task = eb && eb.tasks.find(t => t.id === activeProofTaskId);
        if (!task) { closeModalOverlay("task-proof-modal"); return; }

        const note = document.getElementById("task-proof-note").value.trim();
        const link = document.getElementById("task-proof-link").value.trim();
        const fileInput = document.getElementById("task-proof-file");
        const proofFile = (fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;

        if (isFileTooLarge(proofFile)) {
            showToast(`File is too large — please upload something under ${MAX_UPLOAD_MB}MB.`, "danger");
            return;
        }

        if (task.backendId) {
            try {
                await Api.submitTaskProof(task.backendId, {
                    proof_text: [note, link].filter(Boolean).join(" — ") || null,
                    proof_file_name: proofFile ? proofFile.name : null
                });
            } catch (err) {
                // Don't block the local transition on a backend conflict --
                // see acceptStudentTask.
                console.warn("Submit proof: backend not updated:", err.detail || err.message);
            }
        }

        task.proof = { note, link, fileName: proofFile ? proofFile.name : "" };
        task.status = "Submitted";
        saveState();
        closeModalOverlay("task-proof-modal");
        showToast("Proof submitted — awaiting Club Head verification.", "success");
        window.renderClubActivities();
    });
}
document.addEventListener("DOMContentLoaded", setupTaskProofFormSubmit);

// ---- Bill Upload (Self-Procured Expense tasks only) — writes directly into the linked
// eb.expenses[] line item as a Draft, same as if the Club Head had uploaded it themselves.
// Editable again any time it's Draft/Rejected, until the Club Head sends it for processing.
let activeBillUploadTaskId = null;
let activeBillUploadEbId = null;

function openBillUploadModal(taskId, ebId) {
    const eb = (state.eventBudgets || []).find(e => e.id === ebId);
    const task = eb && eb.tasks.find(t => t.id === taskId);
    const exp = task && (eb.expenses || []).find(x => x.id === task.expenseId);
    if (!exp) return;

    activeBillUploadTaskId = taskId;
    activeBillUploadEbId = ebId;

    document.getElementById("bill-upload-form").reset();
    document.getElementById("bill-upload-item-display").value = exp.itemName;
    document.getElementById("bill-upload-approved-display").value = formatCurrency(exp.approvedAmount);
    document.getElementById("bill-upload-amount").value = exp.billAmount ? exp.billAmount : "";
    document.getElementById("bill-upload-file-hint").textContent = exp.billFileName
        ? `Current file: ${exp.billFileName} — choose a new file only to replace it.`
        : "";
    document.getElementById("bill-upload-modal-title").textContent =
        (exp.status === "Draft" || exp.status === "Rejected") ? "Edit Bill" : "Upload Bill";
    openModalOverlay("bill-upload-modal");
}

function setupBillUploadFormSubmit() {
    const form = document.getElementById("bill-upload-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const eb = (state.eventBudgets || []).find(x => x.id === activeBillUploadEbId);
        const task = eb && eb.tasks.find(t => t.id === activeBillUploadTaskId);
        const exp = task && (eb.expenses || []).find(x => x.id === task.expenseId);
        if (!exp) { closeModalOverlay("bill-upload-modal"); return; }

        const rawAmount = document.getElementById("bill-upload-amount").value.trim();
        const fileInput = document.getElementById("bill-upload-file");
        const billFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

        if (isFileTooLarge(billFile)) {
            showToast(`Bill file is too large — please upload something under ${MAX_UPLOAD_MB}MB.`, "danger");
            return;
        }

        if (rawAmount === "" || Number(rawAmount) === 0) {
            try {
                await Api.uploadExpenseBill(exp.id, 0, null);
            } catch (err) {
                showToast(`Couldn't save: ${err.detail || err.message}`, "danger");
                return;
            }
            exp.billAmount = 0;
            exp.billFileName = null;
            exp.billFileUrl = null;
            exp.status = "Not Utilized";
            if (task.status !== "Assigned") task.status = "Verified";
            saveState();
            closeModalOverlay("bill-upload-modal");
            showToast(`Marked "${exp.itemName}" as not spent.`, "info");
            window.renderClubActivities();
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
            const updated = await Api.uploadExpenseBill(exp.id, Number(rawAmount), billFile);
            exp.billFileName = updated.bill_file_name;
            exp.billFileUrl = updated.bill_file_url;
        } catch (err) {
            showToast(`Couldn't save bill: ${err.detail || err.message}`, "danger");
            return;
        }

        exp.billAmount = Number(rawAmount);
        exp.status = "Draft";
        saveState();
        closeModalOverlay("bill-upload-modal");
        showToast(`Bill saved for "${exp.itemName}" — visible to your Club Head now.`, "success");
        window.renderClubActivities();
    });
}
document.addEventListener("DOMContentLoaded", setupBillUploadFormSubmit);

// ---- Attendance QR Scanner (camera, with manual fallback) — scoped to a single event ----
function renderStuAttendanceHistory(eb) {
    const tbody = document.getElementById("stu-qr-attendance-tbody");
    const checkedIn = (eb.registrations || []).filter(r => r.checkedIn);
    tbody.innerHTML = checkedIn.map(r => `
        <tr><td>${escapeHtml(r.studentName)}</td><td>${escapeHtml(r.studentId)}</td><td>${r.checkedInAt ? formatDateTime(r.checkedInAt.replace('T', ' ').substring(0, 16)) + " IST" : "-"}</td></tr>
    `).join("") || `<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">No check-ins yet.</td></tr>`;
}

function openStuQrScanner(taskId, ebId) {
    const eb = (state.eventBudgets || []).find(e => e.id === ebId);
    const task = eb && eb.tasks.find(t => t.id === taskId);
    if (!eb || !task) return;
    activeStuAttendanceTaskId = taskId;
    activeStuAttendanceEbId = ebId;
    renderStuAttendanceHistory(eb);
    document.getElementById("stu-qr-scan-status").textContent = "";
    document.getElementById("stu-qr-manual-input").value = "";
    openModalOverlay("qr-scanner-modal");
    startStuQrCamera();
}

function startStuQrCamera() {
    const video = document.getElementById("stu-qr-video");
    const statusEl = document.getElementById("stu-qr-scan-status");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusEl.textContent = "Camera not available in this browser — use manual entry below.";
        return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
            stuQrStream = stream;
            video.srcObject = stream;
            video.play();
            stuQrRAF = requestAnimationFrame(scanStuQrFrame);
        })
        .catch(() => {
            statusEl.textContent = "Camera access denied or unavailable — use manual entry below.";
        });
}

function scanStuQrFrame() {
    const video = document.getElementById("stu-qr-video");
    const canvas = document.getElementById("stu-qr-canvas");
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || typeof jsQR !== "function") {
        stuQrRAF = requestAnimationFrame(scanStuQrFrame);
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && code.data) {
        handleStuQrDecoded(code.data);
    } else {
        stuQrRAF = requestAnimationFrame(scanStuQrFrame);
    }
}

function handleStuQrDecoded(payloadStr) {
    markStuAttendance(payloadStr);
    stuQrRAF = requestAnimationFrame(scanStuQrFrame);
}

// `scanned` is either a real backend qr_token (plain string, current
// registrations) or a legacy local-only JSON payload {registrationId}
// (older cached registrations from before this event had a linked
// backend Event) -- try the token match first, fall back to the id.
async function markStuAttendance(scanned) {
    const eb = (state.eventBudgets || []).find(e => e.id === activeStuAttendanceEbId);
    const statusEl = document.getElementById("stu-qr-scan-status");
    let legacyId = null;
    try { legacyId = JSON.parse(scanned).registrationId; } catch (e) { /* not JSON -- fine */ }
    const reg = eb && eb.registrations.find(r => r.qrPayload === scanned || r.id === scanned || (legacyId && r.id === legacyId));
    if (!reg) {
        statusEl.textContent = `No registration found for "${scanned}" on this event.`;
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
            // See club_head_dashboard/app.js's markAttendance -- a 409's detail
            // already reads "Already checked in at <time> IST".
            statusEl.textContent = e.status === 409 ? `${reg.studentName}: ${e.detail}` : `Check-in failed: ${e.detail || e.message}`;
            return;
        }
    } else {
        reg.checkedInAt = new Date().toISOString();
    }
    reg.checkedIn = true;
    saveState();
    statusEl.textContent = `${reg.studentName} marked present${reg.checkedInAt ? " at " + formatIstTime(reg.checkedInAt) : ""}.`;
    renderStuAttendanceHistory(eb);
}

function stopStuQrCamera() {
    if (stuQrRAF) cancelAnimationFrame(stuQrRAF);
    stuQrRAF = null;
    if (stuQrStream) {
        stuQrStream.getTracks().forEach(t => t.stop());
        stuQrStream = null;
    }
}

function setupStuQrManualEntry() {
    const btn = document.getElementById("btn-stu-qr-manual-submit");
    if (!btn) return;
    btn.addEventListener("click", () => {
        const val = document.getElementById("stu-qr-manual-input").value.trim();
        if (val) markStuAttendance(val);
    });
}
document.addEventListener("DOMContentLoaded", setupStuQrManualEntry);
