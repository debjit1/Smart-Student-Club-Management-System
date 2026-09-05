// Events Tab Logic — browse published events and register as an attendee.
// Registering creates an entry in eventBudgets[].registrations[] with a
// qrPayload the volunteer running the "Attendance Taking" task scans at
// the venue.

window.renderEvents = function () {
    const container = elements.eventsCards;
    if (!container) return;

    let events = getPublishedEvents();

    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        events = events.filter(eb =>
            getEventDisplayName(eb).toLowerCase().includes(q) ||
            (eb.club && eb.club.toLowerCase().includes(q)) ||
            (eb.publish && eb.publish.venue && eb.publish.venue.toLowerCase().includes(q)) ||
            (eb.publish && eb.publish.description && eb.publish.description.toLowerCase().includes(q))
        );
    }

    // Ongoing/upcoming first, most imminent first.
    events = events.slice().sort((a, b) => (getEventDisplayDate(a) || "9999").localeCompare(getEventDisplayDate(b) || "9999"));

    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; padding: 5rem 0;">
                <i class="fa-solid fa-calendar-xmark" style="font-size: 3rem;"></i>
                <p style="margin-top: 1rem; font-size: 1rem;">${uiState.searchQuery ? 'No published events match your search.' : 'No published events right now — check back soon.'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = events.map(eb => {
        const p = eb.publish || {};
        const myReg = (eb.registrations || []).find(r => r.studentId === CURRENT_STUDENT_ID);
        const ongoing = isEventOngoing(eb);
        return `
        <div class="event-card">
            ${p.poster ? `<img src="${p.poster}" alt="${escapeHtml(getEventDisplayName(eb))} poster" style="width:100%; height:150px; object-fit:cover; display:block;">` : ""}
            <div class="event-top-info">
                <div class="event-tags-wrap">
                    <span class="tag technical">${escapeHtml(eb.club)}</span>
                </div>
                <div>
                    ${myReg ? `<span class="event-status-indicator registered"><i class="fa-solid fa-check"></i> Registered</span>` : ongoing ? `<span class="event-status-indicator full"><i class="fa-solid fa-bolt"></i> Ongoing</span>` : ""}
                </div>
            </div>
            <div class="event-body">
                <h3 class="event-title">${escapeHtml(getEventDisplayName(eb))}</h3>
                <p class="event-desc">${escapeHtml(p.description || "No description provided yet.")}</p>
                <div class="event-meta-grid">
                    <div class="meta-item"><i class="fa-regular fa-calendar"></i><span>${p.date ? formatDate(p.date) : "Date TBA"}</span></div>
                    <div class="meta-item"><i class="fa-regular fa-clock"></i><span>${escapeHtml(p.time || "TBA")}</span></div>
                    <div class="meta-item" style="grid-column: span 2;"><i class="fa-solid fa-location-dot"></i><span>${escapeHtml(p.venue || "Venue TBA")}</span></div>
                </div>
                <div class="event-footer">
                    ${myReg
                ? `<button class="btn-primary-action registered" data-action="view-qr" data-eb-id="${eb.id}" data-reg-id="${myReg.id}"><i class="fa-solid fa-qrcode"></i> View My QR</button>`
                : `<button class="btn-primary-action" data-action="register" data-eb-id="${eb.id}"><i class="fa-solid fa-user-plus"></i> Register</button>`
            }
                </div>
            </div>
        </div>
    `;
    }).join("");

    container.querySelectorAll("[data-action='register']").forEach(btn => {
        // data-eb-id is always a string; eventBudget ids are numeric (backend-owned) --
        // Number() it here or eb lookups below silently fail to match.
        btn.addEventListener("click", () => window.registerForEvent(numAttr(btn, "data-eb-id")));
    });
    container.querySelectorAll("[data-action='view-qr']").forEach(btn => {
        btn.addEventListener("click", () => window.viewMyRegistrationQr(numAttr(btn, "data-eb-id"), btn.getAttribute("data-reg-id")));
    });
};

window.registerForEvent = async function (ebId) {
    const eb = (state.eventBudgets || []).find(e => e.id === ebId);
    if (!eb) return;
    const already = (eb.registrations || []).some(r => r.studentId === CURRENT_STUDENT_ID);
    if (already) { showToast("You're already registered for this event.", "info"); return; }

    const regId = generateId("reg");
    let backendId = null;
    let qrPayload = JSON.stringify({ eventId: eb.id, registrationId: regId });

    if (eb.backendEventId) {
        try {
            const backendReg = await Api.registerForEvent(eb.backendEventId);
            backendId = backendReg.id;
            qrPayload = backendReg.qr_token;
        } catch (e) {
            if (e.status === 409) {
                // The backend already has a registration for this user+event
                // (e.g. made from a different browser/session, or a race with
                // this same click) that our local cache didn't know about --
                // recover by pulling the real record instead of just erroring.
                try {
                    const mine = await Api.listMyRegistrations();
                    const existing = mine.find((r) => r.event_id === eb.backendEventId);
                    if (existing) {
                        backendId = existing.id;
                        qrPayload = existing.qr_token;
                    } else {
                        showToast(`Couldn't register: ${e.detail || e.message}`, "danger");
                        return;
                    }
                } catch (err) {
                    showToast(`Couldn't register: ${e.detail || e.message}`, "danger");
                    return;
                }
            } else {
                showToast(`Couldn't register: ${e.detail || e.message}`, "danger");
                return;
            }
        }
    }

    const registration = {
        id: regId,
        backendId,
        studentName: CURRENT_STUDENT_NAME,
        studentId: CURRENT_STUDENT_ID,
        email: CURRENT_STUDENT_EMAIL,
        registeredOn: todayStr(),
        qrPayload,
        checkedIn: false,
        checkedInAt: null
    };
    if (!eb.registrations) eb.registrations = [];
    eb.registrations.push(registration);
    saveState();
    showToast(`Registered for ${getEventDisplayName(eb)}!`, "success");
    window.renderEvents();
    window.renderStats();
    window.viewMyRegistrationQr(eb.id, regId);
};

window.viewMyRegistrationQr = function (ebId, regId) {
    const eb = (state.eventBudgets || []).find(e => e.id == ebId || String(e.id) === String(ebId));
    if (!eb) return;
    const reg = (eb.registrations || []).find(r => r.id == regId || String(r.id) === String(regId) || (r.backendId && String(r.backendId) === String(regId)));
    if (!reg) return;

    document.getElementById("qr-view-event-name").textContent = getEventDisplayName(eb);
    document.getElementById("qr-view-checkin-status").textContent = reg.checkedIn
        ? `Checked in on ${formatDateTime(reg.checkedInAt ? reg.checkedInAt.replace('T', ' ').substring(0, 16) : '')} IST`
        : "Not checked in yet — show this QR code at the venue.";
    openModalOverlay("qr-view-modal");

    const canvas = document.getElementById("qr-view-canvas");
    const payload = reg.qrPayload || reg.qr_token || (reg.backendId ? `reg-${reg.backendId}` : `reg-${reg.id}`);
    if (window.QRCode && canvas) {
        QRCode.toCanvas(canvas, payload, { width: 220 }, function (err) { if (err) console.error("QR render error:", err); });
    }
};
