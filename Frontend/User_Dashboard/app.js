// Main Core Coordinator

window.elements = {
    navLinks: document.querySelectorAll(".nav-link"),
    tabContents: document.querySelectorAll(".tab-content"),
    pageTitle: document.getElementById("page-title"),
    pageSubtitle: document.getElementById("page-subtitle"),
    globalSearch: document.getElementById("global-search"),
    notificationBell: document.getElementById("notification-bell"),
    notifDropdown: document.getElementById("notif-dropdown"),
    notifDropdownList: document.getElementById("notif-dropdown-list"),
    notifDot: document.getElementById("notif-dot"),
    logoutBtn: document.getElementById("logout-button"),

    statRegistrations: document.getElementById("stat-registrations"),
    statClubsJoined: document.getElementById("stat-clubs-joined"),
    statVolunteerRoles: document.getElementById("stat-volunteer-roles"),
    bannerDate: document.getElementById("banner-current-date"),

    dashboardRegistrations: document.getElementById("dashboard-registrations-container"),
    dashboardOngoing: document.getElementById("dashboard-ongoing-container"),
    dashboardUpcoming: document.getElementById("dashboard-upcoming-container"),
    eventsCards: document.getElementById("events-cards-container"),
    calendarDays: document.getElementById("calendar-days-container"),
    calendarMonthYear: document.getElementById("calendar-month-year"),
    calendarAgenda: document.getElementById("calendar-agenda-container"),
    certificatesCards: document.getElementById("certificates-cards-container"),

    navClubActivities: document.getElementById("nav-club-activities"),
    navChat: document.getElementById("nav-chat"),

    toastContainer: document.getElementById("toast-container")
};

// Navigation / search state (UI-only — not part of the shared localStorage schema).
window.uiState = {
    currentTab: "dashboard",
    searchQuery: "",
    calendarDate: new Date()
};

// Generic modal open/close helpers (mirrors the Club Head dashboard's pattern).
function openModalOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
}
function closeModalOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
}

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
    await loadState();

    setupNavigation();
    setupEventListeners();
    setupGenericModalCloseButtons();

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (elements.bannerDate) {
        elements.bannerDate.textContent = new Date().toLocaleDateString('en-US', options);
    }

    // Restore the last-active tab on refresh (defaults to the dashboard if
    // nothing was saved, or the saved tab is no longer valid). Gated tabs
    // (club-activities, chat) are only restored when the user qualifies, so
    // the unlock toast isn't fired on every load. Wrapped defensively so a
    // hiccup during restore still leaves a fully rendered dashboard instead
    // of a dead page.
    try {
        const savedTab = localStorage.getItem("sscms_active_tab_student");
        const isKnownTab = savedTab && elements.navLinks.some(l => l.getAttribute("data-tab") === savedTab);
        let canRestore = isKnownTab;
        if (isKnownTab && (savedTab === "club-activities" || savedTab === "chat")) {
            canRestore = isApprovedVolunteer();
        }
        if (canRestore) {
            switchTab(savedTab);
        } else {
            window.renderAll();
        }
    } catch (err) {
        console.error("Tab restore failed, falling back to dashboard:", err);
        window.renderAll();
    }
});

// Setup Navigation Tab Switching
function setupNavigation() {
    elements.navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = link.getAttribute("data-tab");
            switchTab(tabId);
        });
    });

    document.querySelectorAll("[data-go-tab]").forEach(element => {
        element.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = element.getAttribute("data-go-tab");
            switchTab(tabId);
        });
    });
}

window.switchTab = function (tabId) {
    // Club Activities and Chat are gated behind having at least one Selected volunteer application.
    if (tabId === "club-activities" && !isApprovedVolunteer()) {
        showToast("Get selected as a volunteer to unlock Club Activities.", "info");
        return;
    }
    if (tabId === "chat" && !isApprovedVolunteer()) {
        showToast("Get selected as a volunteer to chat with a Club Head.", "info");
        return;
    }

    uiState.currentTab = tabId;
    // Remember the active tab so a page refresh restores it instead of
    // falling back to the dashboard.
    localStorage.setItem("sscms_active_tab_student", tabId);

    elements.navLinks.forEach(link => {
        link.classList.toggle("active", link.getAttribute("data-tab") === tabId);
    });

    elements.tabContents.forEach(content => {
        content.classList.toggle("active", content.id === `${tabId}-tab`);
    });

    const tabHeaders = {
        "dashboard": { title: "Dashboard", subtitle: "Your personalized portal and upcoming opportunities" },
        "events": { title: "Events", subtitle: "Register as an attendee and get your check-in QR code" },
        "club-activities": { title: "Club Activities", subtitle: "Your volunteering duties and assigned tasks" },
        "calendar": { title: "Interactive Calendar", subtitle: "Visual overview of your registered event dates" },
        "certificates": { title: "Earned Certificates", subtitle: "View and download credentials of completed events" },
        "clubs": { title: "Clubs", subtitle: "Explore and join clubs that match your interests" },
        "chat": { title: "Chat", subtitle: "Message the Club Head for clubs you volunteer with" }
    };

    if (tabHeaders[tabId]) {
        elements.pageTitle.textContent = tabHeaders[tabId].title;
        elements.pageSubtitle.textContent = tabHeaders[tabId].subtitle;
    }

    window.renderAll();
};

// Global Event Listeners Setup
function setupEventListeners() {
    elements.globalSearch.addEventListener("input", (e) => {
        uiState.searchQuery = e.target.value.toLowerCase().trim();
        window.renderAll();
    });

    // Close Cert Modal handlers
    const closeCertModal = () => closeModalOverlay("certificate-modal");
    document.getElementById("close-cert-modal-btn").addEventListener("click", closeCertModal);
    document.getElementById("cert-modal-close-btn").addEventListener("click", closeCertModal);

    // Calendar Control Buttons
    document.getElementById("cal-prev-btn").addEventListener("click", () => {
        uiState.calendarDate.setMonth(uiState.calendarDate.getMonth() - 1);
        window.renderCalendar();
    });
    document.getElementById("cal-next-btn").addEventListener("click", () => {
        uiState.calendarDate.setMonth(uiState.calendarDate.getMonth() + 1);
        window.renderCalendar();
    });

    // Notification bell dropdown
    elements.notificationBell.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden = elements.notifDropdown.classList.contains("hidden");
        if (isHidden) {
            renderNotificationDropdown();
            elements.notifDropdown.classList.remove("hidden");
            loadNotificationDigest();
            markAllNotificationsRead();
            elements.notifDot.classList.add("hidden");
        } else {
            elements.notifDropdown.classList.add("hidden");
        }
    });
    document.addEventListener("click", (e) => {
        if (!elements.notifDropdown.classList.contains("hidden") &&
            !elements.notifDropdown.contains(e.target) && e.target !== elements.notificationBell) {
            elements.notifDropdown.classList.add("hidden");
        }
    });

    // Logout click
    elements.logoutBtn.addEventListener("click", () => {
        logout();
    });
}

// Close buttons on modals follow the pattern id="close-<x>-modal-btn" -> closes the
// nearest ancestor .modal-overlay. Clicking the dark overlay itself also closes it.
function setupGenericModalCloseButtons() {
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("active");
                if (overlay.id === "qr-scanner-modal" && typeof stopStuQrCamera === "function") stopStuQrCamera();
            }
        });
    });
    document.querySelectorAll("[id^='close-'][id$='-modal-btn']").forEach(btn => {
        btn.addEventListener("click", () => {
            const overlay = btn.closest(".modal-overlay");
            if (overlay) {
                overlay.classList.remove("active");
                if (overlay.id === "qr-scanner-modal" && typeof stopStuQrCamera === "function") stopStuQrCamera();
            }
        });
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && typeof stopStuQrCamera === "function") stopStuQrCamera();
    });
}

function renderNotificationDropdown() {
    const notifs = getMyNotifications();
    if (!notifs.length) {
        elements.notifDropdownList.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
        return;
    }
    elements.notifDropdownList.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}">
            ${escapeHtml(n.message)}
            <span class="notif-item-time">${formatDateTime(n.createdOn.replace('T', ' ').substring(0, 16))}</span>
        </div>
    `).join("");
}

async function loadNotificationDigest() {
    const digestBox = document.getElementById("notif-digest");
    if (!digestBox) return;

    const unread = getMyNotifications().filter(n => !n.read);
    if (!unread.length) {
        digestBox.classList.add("hidden");
        digestBox.innerHTML = "";
        return;
    }

    try {
        const result = await Api.notificationDigest(unread.map(n => ({ message: n.message })));
        const highlightsHtml = (result.highlights || [])
            .map(h => `<li>${escapeHtml(h)}</li>`).join("");
        digestBox.innerHTML = `
            <p class="notif-digest-summary">${escapeHtml(result.summary)}</p>
            ${highlightsHtml ? `<ul class="notif-digest-highlights">${highlightsHtml}</ul>` : ""}
        `;
        digestBox.classList.remove("hidden");
    } catch (err) {
        digestBox.classList.add("hidden");
    }
}

function refreshNotifBadge() {
    const count = getUnreadNotificationCount();
    if (elements.notifDot) elements.notifDot.classList.toggle("hidden", count === 0);
}

function refreshClubActivitiesNavVisibility() {
    if (elements.navClubActivities) {
        elements.navClubActivities.classList.toggle("hidden", !isApprovedVolunteer());
    }
    if (elements.navChat) {
        elements.navChat.classList.toggle("hidden", !isApprovedVolunteer());
    }
}

// Master Render Coordinator
window.renderAll = function () {
    syncStudentNotifications();
    window.renderStats();
    refreshNotifBadge();
    refreshClubActivitiesNavVisibility();

    switch (uiState.currentTab) {
        case "dashboard":
            window.renderDashboard();
            break;
        case "events":
            window.renderEvents();
            break;
        case "club-activities":
            window.renderClubActivities();
            break;
        case "calendar":
            window.renderCalendar();
            break;
        case "certificates":
            window.renderCertificates();
            break;
        case "clubs":
            window.renderClubsGrid();
            break;
        case "chat":
            window.renderChat();
            break;
    }
};

// Render Header Stat Cards
window.renderStats = function () {
    const registrations = getMyRegistrations().length;
    const clubsJoined = getMyMemberships().filter(m => m.status === "Active").length;
    const volunteerRoles = getSelectedVolunteerClubs().length;

    if (elements.statRegistrations) elements.statRegistrations.textContent = registrations;
    if (elements.statClubsJoined) elements.statClubsJoined.textContent = clubsJoined;
    if (elements.statVolunteerRoles) elements.statVolunteerRoles.textContent = volunteerRoles;
};
