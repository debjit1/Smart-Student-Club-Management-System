// Dashboard Tab Logic — My Registrations, Ongoing Events, Upcoming Events, Featured Clubs
window.renderDashboard = function () {
    const welcomeEl = document.getElementById("welcome-message");
    if (welcomeEl) {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        welcomeEl.textContent = `${greeting}, ${CURRENT_STUDENT_NAME} \u{1F44B}`;
    }
    renderDashboardRegistrations();
    renderDashboardOngoing();
    renderDashboardUpcoming();
    renderFeaturedClubs();
};

function renderDashboardRegistrations() {
    const container = elements.dashboardRegistrations;
    if (!container) return;

    let myRegs = getMyRegistrations();
    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        myRegs = myRegs.filter(({ eb }) =>
            getEventDisplayName(eb).toLowerCase().includes(q) ||
            (eb.club && eb.club.toLowerCase().includes(q))
        );
    }

    if (myRegs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-ticket"></i>
                <p>${uiState.searchQuery ? 'No registrations match your search.' : "You haven't registered for any events yet."}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = myRegs.map(({ reg, eb }) => `
        <div class="registration-card-min">
            <div class="reg-icon-box">
                <i class="fa-solid fa-qrcode"></i>
            </div>
            <div class="reg-details">
                <h4 class="reg-title">${escapeHtml(getEventDisplayName(eb))}</h4>
                <div class="reg-meta">
                    <span><i class="fa-solid fa-calendar-day"></i> ${getEventDisplayDate(eb) ? formatDate(getEventDisplayDate(eb)) : "Date TBA"}</span>
                    <span>${reg.checkedIn ? '<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Checked In' : '<i class="fa-regular fa-circle"></i> Not Checked In'}</span>
                </div>
            </div>
            <button class="reg-action-btn" style="color: var(--primary);" data-action="view-my-qr" data-reg-id="${reg.id}" data-eb-id="${eb.id}" title="View QR Code">
                <i class="fa-solid fa-qrcode"></i> QR
            </button>
        </div>
    `).join("");

    container.querySelectorAll("[data-action='view-my-qr']").forEach(btn => {
        btn.addEventListener("click", () => {
            const ebId = btn.getAttribute("data-eb-id");
            const regId = btn.getAttribute("data-reg-id");
            if (typeof window.viewMyRegistrationQr === "function") {
                window.viewMyRegistrationQr(ebId, regId);
            }
        });
    });
}

function renderDashboardOngoing() {
    const container = elements.dashboardOngoing;
    if (!container) return;

    let ongoing = getPublishedEvents().filter(isEventOngoing);
    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        ongoing = ongoing.filter(eb =>
            getEventDisplayName(eb).toLowerCase().includes(q) ||
            (eb.club && eb.club.toLowerCase().includes(q))
        );
    }

    if (ongoing.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding: 1.5rem 0;"><p>${uiState.searchQuery ? 'No ongoing events match your search.' : 'No events happening today.'}</p></div>`;
        return;
    }
    container.innerHTML = ongoing.map(eb => eventMiniCardHtml(eb)).join("");
}

function renderDashboardUpcoming() {
    const container = elements.dashboardUpcoming;
    if (!container) return;

    let upcoming = getPublishedEvents().filter(isEventUpcoming).sort((a, b) => getEventDisplayDate(a).localeCompare(getEventDisplayDate(b)));
    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        upcoming = upcoming.filter(eb =>
            getEventDisplayName(eb).toLowerCase().includes(q) ||
            (eb.club && eb.club.toLowerCase().includes(q))
        );
    }

    if (upcoming.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding: 1.5rem 0;"><p>${uiState.searchQuery ? 'No upcoming events match your search.' : 'No upcoming events published yet.'}</p></div>`;
        return;
    }
    container.innerHTML = upcoming.slice(0, 4).map(eb => eventMiniCardHtml(eb)).join("");
}

function eventMiniCardHtml(eb) {
    const eventDate = getEventDisplayDate(eb);
    const timeStr = (eb.publish && eb.publish.time) || eb.time || "10:00 - 17:00";
    return `
        <div class="registration-card-min">
            <div class="reg-icon-box">
                <i class="fa-solid fa-calendar-day"></i>
            </div>
            <div class="reg-details">
                <h4 class="reg-title">${escapeHtml(getEventDisplayName(eb))}</h4>
                <div class="reg-meta">
                    <span><i class="fa-solid fa-users"></i> ${escapeHtml(eb.club || "")}</span>
                    <span><i class="fa-regular fa-calendar"></i> ${eventDate ? formatDate(eventDate) : "Date TBA"}</span>
                    <span><i class="fa-regular fa-clock"></i> ${escapeHtml(timeStr)}</span>
                </div>
            </div>
        </div>
    `;
}

// Render Featured Clubs list at the bottom of the dashboard
window.renderFeaturedClubs = function () {
    const container = document.getElementById("dashboard-clubs-container");
    if (!container) return;

    let featured = (state.clubsFinances || []);
    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        featured = featured.filter(c =>
            c.club.toLowerCase().includes(q) ||
            (c.category && c.category.toLowerCase().includes(q))
        );
    }
    featured = featured.slice(0, 3);

    if (featured.length === 0) {
        container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; padding: 1.5rem 0;"><p>No clubs match your search.</p></div>`;
        return;
    }

    container.innerHTML = featured.map(c => {
        const profile = getClubProfile(c.club);
        return `
        <div class="featured-club-card">
            <div class="featured-club-top">
                <div class="featured-club-icon blue">
                    <i class="fa-solid fa-people-group"></i>
                </div>
                <div class="featured-club-meta">
                    <h4 class="featured-club-name">${escapeHtml(c.club)}</h4>
                    <span class="featured-club-members">${escapeHtml(c.category)}</span>
                </div>
            </div>
            <p class="featured-club-desc">${escapeHtml(profile ? profile.description : "")}</p>
            <div class="featured-club-action">
                <button data-club="${escapeHtml(c.club)}" class="btn-featured-explore">Explore Club</button>
            </div>
        </div>
    `;
    }).join("");

    container.querySelectorAll(".btn-featured-explore").forEach(btn => {
        btn.addEventListener("click", () => window.openClubExploreModal(btn.getAttribute("data-club")));
    });
};
