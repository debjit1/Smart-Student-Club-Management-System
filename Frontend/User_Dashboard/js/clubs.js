// Clubs Tab & Membership / Volunteering Flow
// Complete Student Journey: Browse Clubs -> Join Club -> Become Club Member ->
// Apply for a Volunteer Domain -> Club Head Approval -> Notification ->
// Club Activities.

let activeClubModalName = null;

window.renderClubsGrid = function () {
    const container = document.getElementById("clubs-grid-container");
    if (!container) return;

    let clubs = state.clubsFinances || [];
    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        clubs = clubs.filter(c => c.club.toLowerCase().includes(q) || (c.category && c.category.toLowerCase().includes(q)));
    }

    if (clubs.length === 0) {
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-magnifying-glass"></i><p>No clubs match your search.</p></div>`;
        return;
    }

    container.innerHTML = clubs.map(c => {
        const profile = getClubProfile(c.club);
        const membership = getMyMembership(c.club);
        const joined = membership && (membership.status === "Active" || membership.status === "Approved");
        const pendingApproval = membership && membership.status === "Pending";
        const openDomainCount = getClubDomains(c.club).filter(d => d.recruitmentOpen).length;
        let membershipBadgeHtml = `<span class="badge badge-secondary">Not a member</span>`;
        if (joined) membershipBadgeHtml = `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Member</span>`;
        else if (pendingApproval) membershipBadgeHtml = `<span class="badge badge-warning"><i class="fa-solid fa-hourglass-half"></i> Approval Pending</span>`;
        return `
            <div class="club-card" data-club="${escapeHtml(c.club)}">
                <div class="club-card-top">
                    <div class="club-card-icon"><i class="fa-solid fa-people-group"></i></div>
                    <div>
                        <div class="club-card-name">${escapeHtml(c.club)}</div>
                        <div class="club-card-category">${escapeHtml(c.category)}</div>
                    </div>
                </div>
                <p class="club-card-desc">${escapeHtml(profile ? (profile.description.length > 110 ? profile.description.substring(0, 110) + "..." : profile.description) : "")}</p>
                <div class="club-card-status-row" style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                    ${membershipBadgeHtml}
                    ${openDomainCount > 0 ? `<span class="badge badge-info"><i class="fa-solid fa-bullhorn"></i> ${openDomainCount} domain${openDomainCount === 1 ? "" : "s"} recruiting</span>` : ""}
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".club-card").forEach(card => {
        card.addEventListener("click", () => window.openClubExploreModal(card.getAttribute("data-club")));
    });
};

// Renders the membership status / action button block for a given club into `mountEl`.
function renderMembershipActionBlock(club) {
    const membership = getMyMembership(club);
    const joined = membership && (membership.status === "Active" || membership.status === "Approved");
    const pendingApproval = membership && membership.status === "Pending";
    const volStatus = getMyVolunteerStatusForClub(club);
    const openDomains = getClubDomains(club).filter(d => d.recruitmentOpen);

    let volunteerBlockHtml = "";
    if (volStatus === "Selected") {
        volunteerBlockHtml = `<button class="action-primary-btn" id="btn-go-club-activities" style="justify-content:center; background-color: var(--success);"><i class="fa-solid fa-list-check"></i> Go to Club Activities</button>`;
    } else if (volStatus === "Pending") {
        volunteerBlockHtml = `<span class="badge badge-warning" style="align-self:flex-start;"><i class="fa-solid fa-hourglass-half"></i> Volunteer Application Pending</span>`;
    } else if (openDomains.length > 0) {
        volunteerBlockHtml = `<button class="action-primary-btn" id="btn-join-volunteer" style="justify-content:center;"><i class="fa-solid fa-hand-holding-heart"></i> Join as Volunteer</button>`;
    }

    if (pendingApproval) {
        return `
            <div class="membership-status-box">
                <span class="badge badge-warning" style="align-self:flex-start;"><i class="fa-solid fa-hourglass-half"></i> Awaiting Club Head approval</span>
                ${volunteerBlockHtml}
            </div>
        `;
    }

    if (!joined) {
        return `
            <div class="membership-status-box">
                <span class="badge badge-secondary" style="align-self:flex-start;">Not a member yet</span>
                <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
                    <button class="action-primary-btn" id="btn-join-club" style="justify-content:center;">
                        <i class="fa-solid fa-user-plus"></i> Join Club
                    </button>
                    ${volunteerBlockHtml}
                </div>
            </div>
        `;
    }

    return `
        <div class="membership-status-box">
            <span class="badge badge-success" style="align-self:flex-start;"><i class="fa-solid fa-circle-check"></i> You are a member</span>
            ${volunteerBlockHtml}
        </div>
    `;
}

// Domains with recruitmentOpen === true for this club — shown to every
// student browsing the Clubs section, regardless of membership/volunteer
// status, so they can see what they'd be signing up for before joining or
// applying. Closed domains are simply omitted from this list.
function renderOpenRecruitmentsHtml(clubName) {
    const openDomains = getClubDomains(clubName).filter(d => d.recruitmentOpen);
    if (!openDomains.length) {
        return `<p class="text-muted-note">No domains are currently recruiting for this club.</p>`;
    }
    return `
        <div class="task-cards">
            ${openDomains.map(d => `
                <div class="task-card" style="display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <div class="task-card-header">
                            <span class="task-card-title">${escapeHtml(d.title)}</span>
                            <span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Recruiting</span>
                        </div>
                        <ul style="margin: 0.4rem 0 0 1.1rem; padding:0; font-size:0.82rem; color: var(--text-main); line-height:1.6;">
                            ${(d.roles || []).map(r => `<li>${escapeHtml(r)}</li>`).join("")}
                        </ul>
                    </div>
                    <div style="margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end;">
                        <button type="button" class="btn-primary-action btn-sm" data-action="apply-domain-volunteer" data-club="${escapeHtml(clubName)}" data-domain-id="${d.id}">
                            <i class="fa-solid fa-hand-holding-heart"></i> Apply to Domain
                        </button>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

window.openClubExploreModal = function (clubName) {
    activeClubModalName = clubName;
    const profile = getClubProfile(clubName);
    const finance = (state.clubsFinances || []).find(c => c.club === clubName);
    const modal = document.getElementById("club-explore-modal");
    if (!modal) return;

    modal.querySelector(".modal-title").textContent = clubName;
    const body = document.getElementById("club-explore-modal-body");

    const achievementsHtml = (profile && profile.achievements.length)
        ? `<ul style="margin: 0 0 0 1.1rem; padding:0; font-size:0.85rem; color: var(--text-main); line-height:1.7;">${profile.achievements.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>`
        : `<p class="text-muted-note">No achievements listed yet.</p>`;

    const pastEventsHtml = (profile && profile.pastEvents.length)
        ? profile.pastEvents.map(e => `
            <li class="club-activity-item">
                <div><strong style="display:block; font-size:0.85rem;">${escapeHtml(e.name)}</strong><span style="font-size:0.75rem; color: var(--text-muted);">${formatDate(e.date)}</span></div>
                <span class="club-activity-badge">Completed</span>
            </li>
        `).join("")
        : `<li class="text-muted-note" style="list-style:none;">No past events recorded yet.</li>`;

    body.innerHTML = `
        <div class="club-modal-grid">
            <div class="club-modal-desc-box">
                <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; margin: 0;">${escapeHtml(profile ? profile.description : "No description available.")}</p>
                <div>
                    <h4 style="font-size:0.9rem; margin-bottom:0.5rem;">Achievements</h4>
                    ${achievementsHtml}
                </div>
                <div>
                    <h4 style="font-size:0.9rem; margin-bottom:0.5rem;">History</h4>
                    <p style="font-size:0.85rem; color: var(--text-muted); line-height:1.6;">${escapeHtml(profile ? profile.history : "")}</p>
                </div>
                ${finance ? `<div style="font-size:0.8rem; color: var(--text-muted);">Category: <strong style="color: var(--text-main);">${escapeHtml(finance.category)}</strong></div>` : ""}
            </div>
            <div id="club-modal-membership-mount">${renderMembershipActionBlock(clubName)}</div>
            <div class="club-activities-box club-modal-activities" style="grid-column: span 2;">
                <h3 class="club-activities-title" style="font-size:0.95rem;"><i class="fa-solid fa-bullhorn" style="color: var(--success);"></i> Ongoing Recruitments</h3>
                ${renderOpenRecruitmentsHtml(clubName)}
            </div>
            <div class="club-activities-box club-modal-activities">
                <h3 class="club-activities-title" style="font-size:0.95rem;"><i class="fa-regular fa-calendar-check" style="color: var(--primary);"></i> Past Events Conducted</h3>
                <ul class="club-activity-list">${pastEventsHtml}</ul>
            </div>
        </div>
    `;

    wireClubModalActions(clubName);
    modal.classList.add("active");
};

function wireClubModalActions(clubName) {
    const joinBtn = document.getElementById("btn-join-club");
    if (joinBtn) joinBtn.addEventListener("click", () => window.joinClub(clubName));

    const volBtn = document.getElementById("btn-join-volunteer");
    if (volBtn) volBtn.addEventListener("click", () => window.openVolunteerModal(clubName));

    const activitiesBtn = document.getElementById("btn-go-club-activities");
    if (activitiesBtn) activitiesBtn.addEventListener("click", () => {
        closeModalOverlay("club-explore-modal");
        window.switchTab("club-activities");
    });

    const modal = document.getElementById("club-explore-modal");
    if (modal) {
        modal.querySelectorAll('[data-action="apply-domain-volunteer"]').forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const domainId = btn.getAttribute("data-domain-id");
                window.openVolunteerModal(clubName, domainId);
            });
        });
    }
}

window.joinClub = async function (clubName) {
    const existing = getMyMembership(clubName);
    if (existing) {
        if (existing.status === "Pending") {
            showToast(`Your request to join ${clubName} is awaiting Club Head approval.`, "info");
        } else {
            showToast(`You're already a member of ${clubName}.`, "info");
        }
        return;
    }

    const clubFinance = (state.clubsFinances || []).find(c => c.club === clubName);
    if (!clubFinance) { showToast("Couldn't find this club.", "danger"); return; }

    let created;
    try {
        created = await Api.applyMembership(clubFinance.id);
    } catch (e) {
        showToast(`Couldn't send join request: ${e.detail || e.message}`, "danger");
        return;
    }

    state.clubMembers.push({
        id: created.id,
        name: created.name || CURRENT_STUDENT_NAME,
        studentId: created.student_id || CURRENT_STUDENT_ID,
        email: created.email || CURRENT_STUDENT_EMAIL,
        department: created.department || "",
        year: created.year || "",
        club: clubName,
        clubId: clubFinance.id,
        status: created.status,
        appliedOn: todayStr()
    });
    saveState();
    showToast(`Join request sent — awaiting Club Head approval for ${clubName}.`, "success");

    // Refresh whichever view is currently showing this club.
    if (activeClubModalName === clubName) window.openClubExploreModal(clubName);
    window.renderClubsGrid();
    window.renderFeaturedClubs();
    window.renderStats();
};

// ---- Volunteer Application ----
window.openVolunteerModal = function (clubName, targetDomainId) {
    const domains = getClubDomains(clubName).filter(d => d.recruitmentOpen);
    const select = document.getElementById("volunteer-domain-select");
    const form = document.getElementById("volunteer-application-form");
    form.setAttribute("data-club", clubName);
    document.getElementById("volunteer-modal-title").textContent = `Apply to Volunteer — ${clubName}`;
    document.getElementById("volunteer-note-input").value = "";

    if (!domains.length) {
        select.innerHTML = `<option value="">No domains open for this club right now</option>`;
        select.disabled = true;
    } else {
        select.disabled = false;
        select.innerHTML = domains.map(d => `<option value="${d.id}" ${targetDomainId && String(d.id) === String(targetDomainId) ? 'selected' : ''}>${escapeHtml(d.title)}</option>`).join("");
    }
    openModalOverlay("volunteer-application-modal");
};

function setupVolunteerFormSubmit() {
    const form = document.getElementById("volunteer-application-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const club = form.getAttribute("data-club");
        const rawDomainId = document.getElementById("volunteer-domain-select").value;
        const domainId = rawDomainId ? Number(rawDomainId) : null;
        const note = document.getElementById("volunteer-note-input").value.trim();
        if (!domainId) { showToast("This club has no open volunteering domains yet.", "danger"); return; }

        const domain = getDomain(domainId);
        if (!domain || !domain.recruitmentOpen) { showToast("This domain is not currently open for recruitment.", "danger"); return; }

        const alreadyApplied = getMyVolunteerAppsForClub(club).some(a => a.domainId === domainId && a.status !== "Rejected");
        if (alreadyApplied) { showToast("You've already applied for this domain.", "info"); return; }

        const clubFinance = (state.clubsFinances || []).find(c => c.club === club);
        if (!clubFinance) { showToast("Couldn't find this club.", "danger"); return; }

        let created;
        try {
            created = await Api.applyVolunteer(clubFinance.id, domainId, note);
        } catch (err) {
            showToast(`Couldn't submit application: ${err.detail || err.message}`, "danger");
            return;
        }

        state.volunteerApplications.push({
            id: created.id,
            club,
            clubId: clubFinance.id,
            domainId: created.domain_id,
            applicantName: created.applicant_name || CURRENT_STUDENT_NAME,
            studentId: created.applicant_student_id || CURRENT_STUDENT_ID,
            appliedOn: created.applied_on,
            status: created.status,
            note: created.note
        });
        saveState();
        closeModalOverlay("volunteer-application-modal");
        showToast("Volunteer application submitted — awaiting Club Head approval.", "success");

        if (activeClubModalName === club) window.openClubExploreModal(club);
        window.renderClubsGrid();
        window.renderStats();
    });
}

document.addEventListener("DOMContentLoaded", setupVolunteerFormSubmit);
