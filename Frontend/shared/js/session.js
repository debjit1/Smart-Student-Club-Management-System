// Client-side session for the SSCMS frontend, backed by a real login
// against the backend API (see shared/js/api.js). The session blob stored
// under SSCMS_SESSION_KEY carries the JWT plus enough profile/role info for
// each dashboard to identify "who am I" and "which club do I run" without
// re-fetching /auth/me on every page.
const SSCMS_SESSION_KEY = "sscms_session";
const SSCMS_LOGIN_PATH = "../index.html";

const SSCMS_ROLE_LABELS = {
    president: "Club President",
    facultycoordinator: "Faculty Coordinator",
    clubhead: "Club Head",
    user: "Student"
};

// Backend role name -> frontend dashboard-folder role key, in priority order
// (a user with more than one role assignment is routed by the highest).
const SSCMS_BACKEND_ROLE_PRIORITY = [
    ["FacultyCoordinator", "facultycoordinator"],
    ["ClubPresident", "president"],
    ["ClubHead", "clubhead"],
    ["Volunteer", "user"],
    ["Student", "user"]
];

function sscmsPrimaryRoleFromBackend(roles) {
    const names = (roles || []).map(r => r.role);
    for (const [backendRole, frontendRole] of SSCMS_BACKEND_ROLE_PRIORITY) {
        if (names.includes(backendRole)) return { backendRole, frontendRole };
    }
    return { backendRole: null, frontendRole: "user" };
}

// Builds and persists the session object from a POST /auth/login response
// (`{ access_token, user: { id, name, email, student_id, roles: [...] } }`).
function establishSessionFromLogin(loginResponse) {
    const { backendRole, frontendRole } = sscmsPrimaryRoleFromBackend(loginResponse.user.roles);
    const rolesList = loginResponse.user.roles || [];
    const clubRoleEntry = rolesList.find(r => r.role && backendRole && r.role.toLowerCase() === backendRole.toLowerCase() && r.club_id)
        || rolesList.find(r => r.club_id);

    const session = {
        token: loginResponse.access_token,
        role: frontendRole,
        backendRole,
        name: loginResponse.user.name,
        email: loginResponse.user.email,
        userId: loginResponse.user.id,
        studentId: loginResponse.user.student_id,
        roles: rolesList,
        clubId: clubRoleEntry ? clubRoleEntry.club_id : null
    };
    localStorage.setItem(SSCMS_SESSION_KEY, JSON.stringify(session));
    return session;
}

function getSession() {
    try {
        return JSON.parse(localStorage.getItem(SSCMS_SESSION_KEY));
    } catch (e) {
        return null;
    }
}

function getAuthToken() {
    const session = getSession();
    return session ? session.token : null;
}

// Redirects to login if there's no session, it's for a different role, or
// it's missing a token (i.e. predates real backend auth). Returns the
// session when it's valid for the given role.
function requireRole(role) {
    const session = getSession();
    if (!session || session.role !== role || !session.token) {
        // Log the precise reason so a redirect is never a silent mystery --
        // helps diagnose environments where localStorage isn't persisting.
        if (!session) {
            console.warn(`[requireRole] No session in localStorage ('${SSCMS_SESSION_KEY}') -- redirecting to login. ` +
                "If this happens right after login or on refresh, the browser is not persisting localStorage for this page origin.");
        } else if (!session.token) {
            console.warn(`[requireRole] Session for role '${session.role}' has no token -- redirecting to login.`);
        } else if (session.role !== role) {
            console.warn(`[requireRole] Session role '${session.role}' does not match required role '${role}' -- redirecting to login.`);
        }
        window.location.href = SSCMS_LOGIN_PATH;
        return null;
    }
    return session;
}

function initialsFor(name) {
    if (!name) return "?";
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

// Fills in the sidebar's name/avatar from the session (leaves the
// role/subtitle line as authored per-dashboard unless no name was given).
function applySessionToSidebar(session) {
    if (!session) return;
    const nameEl = document.getElementById("sidebar-username");
    const roleEl = document.getElementById("sidebar-userrole");
    const avatarEl = document.getElementById("sidebar-avatar");
    const label = SSCMS_ROLE_LABELS[session.role] || "User";

    if (nameEl) nameEl.textContent = session.name || label;
    if (avatarEl) avatarEl.textContent = initialsFor(session.name || label);
    if (roleEl && session.name) roleEl.textContent = label;
}

function logout() {
    localStorage.removeItem(SSCMS_SESSION_KEY);
    window.location.href = SSCMS_LOGIN_PATH;
}

// Overrides a dashboard's logout control (link or button) to clear the
// session instead of just navigating away.
function wireLogout(selector = ".logout-btn, #logout-button") {
    document.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            logout();
        });
    });
}
