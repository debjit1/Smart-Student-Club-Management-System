/**
 * Shared Student Management & Bulk Onboarding Module.
 * Powers the Student Management view and CSV Bulk Import tools
 * on both Faculty Coordinator and President dashboards.
 */

window.StudentManagement = {
    students: [],

    async loadAndRender(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Adding students (manual + bulk) is Faculty-Coordinator-only on the
        // backend (POST /students, POST /users/bulk-import). This module is
        // shared with the President dashboard, so hide the Add button there
        // instead of letting it fail with a 403.
        // (`__session` is a top-level const per dashboard -- a global lexical
        // binding, so reference it directly rather than via window.)
        const canAddStudents = typeof __session !== "undefined" && __session && __session.role === "facultycoordinator";

        container.innerHTML = `
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
                <div>
                    <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700;">Student Management</h3>
                    <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">Manage registered student profiles, filter by user roles, import bulk CSV records, or add student rows manually.</p>
                </div>
                <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                    <select id="sm-role-filter" class="form-select" style="padding: 0.45rem 0.85rem; font-size: 0.85rem; width: 170px; border-radius: 8px;">
                        <option value="all">All Roles</option>
                        <option value="Student">Student</option>
                        <option value="Volunteer">Volunteer</option>
                        <option value="ClubHead">Club Head / Exec</option>
                        <option value="ClubPresident">Club President</option>
                        <option value="FacultyCoordinator">Faculty Coordinator</option>
                    </select>
                    <input type="text" id="sm-search-input" class="form-control" placeholder="Search student name, ID, email..." style="padding: 0.45rem 0.85rem; font-size: 0.85rem; width: 220px; border-radius: 8px;">
                    ${canAddStudents ? `<button class="btn btn-primary" id="sm-add-manual-btn" style="padding: 0.45rem 0.85rem; font-size: 0.85rem; border-radius: 8px;"><i class="fa-solid fa-user-plus"></i> Add Student Manually</button>` : ""}
                    <button class="btn btn-outline" id="sm-refresh-btn" style="padding: 0.45rem 0.85rem; font-size: 0.85rem; border-radius: 8px;"><i class="fa-solid fa-rotate"></i> Refresh</button>
                </div>
            </div>
            <div id="sm-table-container">
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top: 0.5rem;">Loading student data from server...</p></div>
            </div>
            <div id="sm-detail-modal-root"></div>
        `;

        const addManualBtn = container.querySelector("#sm-add-manual-btn");
        if (addManualBtn) {
            addManualBtn.addEventListener("click", () => this.openAddManualModal(container));
        }

        const refreshBtn = container.querySelector("#sm-refresh-btn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => this.fetchAndDraw(container));
        }

        const searchInput = container.querySelector("#sm-search-input");
        const roleFilter = container.querySelector("#sm-role-filter");

        const applyFilter = () => {
            const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
            const selectedRole = roleFilter ? roleFilter.value : "all";

            const filtered = this.students.filter(s => {
                const matchesQuery = !query ||
                    (s.name && s.name.toLowerCase().includes(query)) ||
                    (s.student_id && s.student_id.toLowerCase().includes(query)) ||
                    (s.email && s.email.toLowerCase().includes(query)) ||
                    (s.department && s.department.toLowerCase().includes(query));

                const rawRoles = s.roles || (s.role ? [s.role] : ["Student"]);
                const studentRoles = Array.from(new Set(rawRoles));
                const matchesRole = selectedRole === "all" || studentRoles.includes(selectedRole);

                return matchesQuery && matchesRole;
            });

            this.drawTable(container.querySelector("#sm-table-container"), filtered);
        };

        if (searchInput) searchInput.addEventListener("input", applyFilter);
        if (roleFilter) roleFilter.addEventListener("change", applyFilter);

        await this.fetchAndDraw(container);
    },

    async fetchAndDraw(container) {
        const tableBox = container.querySelector("#sm-table-container");
        tableBox.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
                <p style="margin-top: 0.5rem;">Fetching live student records from database...</p>
            </div>
        `;
        try {
            this.students = await Api.getStudents();
            this.drawTable(tableBox, this.students);
        } catch (err) {
            console.error("Failed to load students from DB:", err);
            tableBox.innerHTML = `
                <div class="alert alert-danger" style="padding: 1.25rem; border-radius: 8px; text-align: center;">
                    <i class="fa-solid fa-circle-exclamation fa-2x" style="margin-bottom: 0.5rem; color: var(--danger);"></i>
                    <h4 style="margin: 0 0 0.5rem 0;">Could Not Fetch Data from Server Database</h4>
                    <p style="font-size: 0.9rem; margin-bottom: 1rem;">${err.message || err}</p>
                    <button class="btn btn-outline" id="sm-retry-btn" style="padding: 0.45rem 1.25rem; font-size: 0.85rem; border-radius: 8px;">
                        <i class="fa-solid fa-rotate"></i> Retry Fetching from Database
                    </button>
                </div>
            `;
            const retryBtn = tableBox.querySelector("#sm-retry-btn");
            if (retryBtn) {
                retryBtn.addEventListener("click", () => this.fetchAndDraw(container));
            }
        }
    },

    drawTable(tableBox, studentList) {
        if (!studentList || studentList.length === 0) {
            tableBox.innerHTML = `
                <div style="text-align: center; padding: 3rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-lg);">
                    <i class="fa-solid fa-user-graduate" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                    <h4 style="margin: 0;">No Students Found</h4>
                    <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.9rem;">No user records match your search query or selected role filter.</p>
                </div>
            `;
            return;
        }

        let rowsHtml = studentList.map(s => {
            let createdAtStr = "N/A";
            if (s.created_at) {
                try {
                    createdAtStr = new Date(s.created_at).toLocaleString();
                } catch (e) {
                    createdAtStr = s.created_at;
                }
            }

            const rawRoles = s.roles || (s.role ? [s.role] : ["Student"]);
            const roles = Array.from(new Set(rawRoles));
            const roleChips = roles.map(r => {
                let badgeClass = "badge-primary";
                if (r === "FacultyCoordinator") badgeClass = "badge-danger";
                else if (r === "ClubPresident") badgeClass = "badge-warning";
                else if (r === "ClubHead") badgeClass = "badge-info";
                else if (r === "Volunteer") badgeClass = "badge-success";
                return `<span class="badge ${badgeClass}" style="font-size: 0.75rem; margin-right: 0.25rem;">${r}</span>`;
            }).join("");

            return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 0.85rem 1rem; font-family: monospace; font-size: 0.85rem; font-weight: 600;">${s.student_id}</td>
                    <td style="padding: 0.85rem 1rem; font-weight: 600;">${s.name}</td>
                    <td style="padding: 0.85rem 1rem; font-size: 0.85rem;">${s.email}</td>
                    <td style="padding: 0.85rem 1rem;">${roleChips}</td>
                    <td style="padding: 0.85rem 1rem; font-size: 0.85rem;">${s.department || "N/A"} ${s.year ? `(${s.year})` : ""}</td>
                    <td style="padding: 0.85rem 1rem; font-size: 0.8rem; color: var(--text-muted);">${createdAtStr}</td>
                    <td style="padding: 0.85rem 1rem; text-align: right;">
                        <button class="btn btn-sm btn-outline view-student-detail-btn" data-id="${s.id}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
                            <i class="fa-solid fa-eye"></i> View Profile
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

        tableBox.innerHTML = `
            <div style="overflow-x: auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-lg);">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                    <thead>
                        <tr style="background: var(--bg-main); border-bottom: 2px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
                            <th style="padding: 0.75rem 1rem;">Student ID</th>
                            <th style="padding: 0.75rem 1rem;">Student Name</th>
                            <th style="padding: 0.75rem 1rem;">Email</th>
                            <th style="padding: 0.75rem 1rem;">Role(s)</th>
                            <th style="padding: 0.75rem 1rem;">Dept / Year</th>
                            <th style="padding: 0.75rem 1rem;">Created At</th>
                            <th style="padding: 0.75rem 1rem; text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        tableBox.querySelectorAll(".view-student-detail-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const sId = parseInt(e.currentTarget.dataset.id, 10);
                const studentObj = this.students.find(s => s.id === sId);
                if (studentObj) this.openDetailModal(studentObj);
            });
        });
    },

    openDetailModal(s) {
        const root = document.getElementById("sm-detail-modal-root");
        if (!root) return;

        const regItems = (s.registrations || []).map(r => `
            <li style="padding: 0.5rem 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="font-size: 0.9rem;">${r.event_name}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">QR Token: <code style="font-size:0.75rem;">${r.qr_token}</code></div>
                </div>
                <span class="badge ${r.status === 'Checked-In' ? 'badge-success' : 'badge-warning'}" style="font-size: 0.75rem;">${r.status}</span>
            </li>
        `).join("") || `<p class="text-muted" style="font-size: 0.85rem;">No event registrations yet.</p>`;

        const certItems = (s.certificates || []).map(c => `
            <li style="padding: 0.5rem 0; border-bottom: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="font-size: 0.9rem;">${c.event_name}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Reason: ${c.reason}</div>
                </div>
                <span class="badge badge-success" style="font-size: 0.75rem;"><i class="fa-solid fa-award"></i> Verified</span>
            </li>
        `).join("") || `<p class="text-muted" style="font-size: 0.85rem;">No certificates issued yet.</p>`;

        const rawRoles = s.roles || (s.role ? [s.role] : ["Student"]);
        const roles = Array.from(new Set(rawRoles));
        const roleChips = roles.map(r => {
            let badgeClass = "badge-primary";
            if (r === "FacultyCoordinator") badgeClass = "badge-danger";
            else if (r === "ClubPresident") badgeClass = "badge-warning";
            else if (r === "ClubHead") badgeClass = "badge-info";
            else if (r === "Volunteer") badgeClass = "badge-success";
            return `<span class="badge ${badgeClass}" style="font-size: 0.75rem; margin-right: 0.25rem;">${r}</span>`;
        }).join("");

        root.innerHTML = `
            <div class="modal-backdrop active" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                <div class="modal-card" style="background: var(--bg-card); border-radius: 12px; width: 620px; max-width: 90vw; max-height: 85vh; overflow-y: auto; padding: 1.5rem; border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                        <div>
                            <h3 style="margin: 0; font-size: 1.2rem;">${s.name}</h3>
                            <div style="margin-top: 0.25rem; font-size: 0.85rem; font-family: monospace;" class="text-muted">ID: ${s.student_id} &bull; ${s.email}</div>
                            <div style="margin-top: 0.35rem;">${roleChips}</div>
                        </div>
                        <button class="btn-close-sm-modal" style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer; color: var(--text-muted);">&times;</button>
                    </div>

                    <div style="margin-bottom: 1.25rem;">
                        <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text-main);"><i class="fa-solid fa-user-group text-indigo"></i> Club Memberships</h4>
                        <div>${(s.memberships || []).map(m => `<span class="badge badge-info" style="margin-right: 0.4rem; margin-bottom: 0.4rem; font-size: 0.8rem;">${m.club_name} - ${m.role}</span>`).join("") || "<span class='text-muted' style='font-size:0.85rem;'>None</span>"}</div>
                    </div>

                    <div style="margin-bottom: 1.25rem;">
                        <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text-main);"><i class="fa-solid fa-calendar-check text-amber"></i> Event Registrations (${(s.registrations||[]).length})</h4>
                        <ul style="list-style: none; padding: 0; margin: 0;">${regItems}</ul>
                    </div>

                    <div style="margin-bottom: 1.25rem;">
                        <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text-main);"><i class="fa-solid fa-award text-emerald"></i> Earned Certificates (${(s.certificates||[]).length})</h4>
                        <ul style="list-style: none; padding: 0; margin: 0;">${certItems}</ul>
                    </div>

                    <div style="text-align: right; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                        <button class="btn btn-secondary btn-close-sm-modal" style="padding: 0.4rem 1rem; border-radius: 8px;">Close</button>
                    </div>
                </div>
            </div>
        `;

        root.querySelectorAll(".btn-close-sm-modal").forEach(b => {
            b.addEventListener("click", () => {
                root.innerHTML = "";
            });
        });
    },

    openAddManualModal(container) {
        const root = document.getElementById("sm-detail-modal-root");
        if (!root) return;

        root.innerHTML = `
            <div class="modal-backdrop active" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                <div class="modal-card" style="background: var(--bg-card); border-radius: 12px; width: 480px; max-width: 90vw; padding: 1.5rem; border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                        <h3 style="margin: 0; font-size: 1.15rem;"><i class="fa-solid fa-user-plus text-indigo"></i> Add Student Manually</h3>
                        <button class="btn-close-sm-modal" style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer; color: var(--text-muted);">&times;</button>
                    </div>

                    <form id="form-add-student-manual">
                        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                            <div>
                                <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">Student ID <span style="color:var(--danger)">*</span></label>
                                <input type="text" id="manual-student-id" class="form-control" placeholder="e.g. STU101" required style="font-size: 0.85rem;">
                            </div>
                            <div>
                                <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">Full Name <span style="color:var(--danger)">*</span></label>
                                <input type="text" id="manual-student-name" class="form-control" placeholder="e.g. Alex Morgan" required style="font-size: 0.85rem;">
                            </div>
                            <div>
                                <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">Email Address</label>
                                <input type="email" id="manual-student-email" class="form-control" placeholder="Auto-fills as <student_id>@iitm.in" style="font-size: 0.85rem;">
                                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">Auto-fills from the Student ID. Edit it to use a custom email.</div>
                            </div>
                            <div>
                                <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">Initial Password</label>
                                <input type="text" id="manual-student-password" class="form-control" value="student@123" minlength="6" style="font-size: 0.85rem;">
                                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">Default login password is <code>student@123</code>.</div>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                <div>
                                    <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">Department</label>
                                    <input type="text" id="manual-student-dept" class="form-control" placeholder="e.g. CSE" style="font-size: 0.85rem;">
                                </div>
                                <div>
                                    <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">Year</label>
                                    <input type="text" id="manual-student-year" class="form-control" placeholder="e.g. 3rd Year" style="font-size: 0.85rem;">
                                </div>
                            </div>
                        </div>

                        <div id="manual-student-error" style="margin-top: 0.85rem; color: var(--danger); font-size: 0.85rem; display: none;"></div>

                        <div style="text-align: right; margin-top: 1.25rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button type="button" class="btn btn-secondary btn-close-sm-modal" style="padding: 0.4rem 1rem; border-radius: 8px;">Cancel</button>
                            <button type="submit" class="btn btn-primary" style="padding: 0.4rem 1rem; border-radius: 8px;">Save Student</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        root.querySelectorAll(".btn-close-sm-modal").forEach(b => {
            b.addEventListener("click", () => {
                root.innerHTML = "";
            });
        });

        // Auto-fill the login email as <student_id>@iitm.in while the faculty
        // types the Student ID, unless they've manually edited the email.
        const idInput = root.querySelector("#manual-student-id");
        const emailInput = root.querySelector("#manual-student-email");
        let emailTouched = false;
        emailInput.addEventListener("input", () => { emailTouched = true; });
        idInput.addEventListener("input", () => {
            if (emailTouched) return;
            const id = idInput.value.trim().toLowerCase();
            emailInput.value = id ? `${id}@iitm.in` : "";
        });

        const form = root.querySelector("#form-add-student-manual");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const errBox = root.querySelector("#manual-student-error");
            errBox.style.display = "none";

            const studentId = idInput.value.trim();
            const payload = {
                student_id: studentId,
                name: root.querySelector("#manual-student-name").value.trim(),
                email: emailInput.value.trim() || (studentId ? `${studentId.toLowerCase()}@iitm.in` : ""),
                password: root.querySelector("#manual-student-password").value.trim() || "student@123",
                department: root.querySelector("#manual-student-dept").value.trim() || null,
                year: root.querySelector("#manual-student-year").value.trim() || null,
            };

            try {
                await Api.createStudentManual(payload);
                root.innerHTML = "";
                await this.fetchAndDraw(container);
                if (typeof showToast === "function") showToast("Student created successfully in database!", "success");
            } catch (err) {
                errBox.textContent = err.message || "Failed to save student record to database";
                errBox.style.display = "block";
            }
        });
    },

    async processBulkUserImport(fileOrRowsInput, reportContainerId) {
        const reportBox = document.getElementById(reportContainerId);
        if (!reportBox) return;

        reportBox.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-lg"></i> Processing bulk import...</div>
        `;

        try {
            const res = await Api.bulkImportUsers(fileOrRowsInput);
            this.renderBulkImportReport(reportBox, res);
        } catch (err) {
            reportBox.innerHTML = `
                <div class="alert alert-danger" style="padding: 0.85rem; border-radius: 8px; font-size: 0.85rem;">
                    <i class="fa-solid fa-circle-exclamation"></i> Import failed: ${err.message || err}
                </div>
            `;
        }
    },

    renderBulkImportReport(reportBox, res) {
        let rowsHtml = (res.results || []).map(r => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 0.5rem 0.75rem; font-family: monospace;">Row ${r.row}</td>
                <td style="padding: 0.5rem 0.75rem;">${r.email}</td>
                <td style="padding: 0.5rem 0.75rem;">
                    <span class="badge ${r.status === 'success' ? 'badge-success' : 'badge-danger'}" style="font-size: 0.75rem;">${r.status.toUpperCase()}</span>
                </td>
                <td style="padding: 0.5rem 0.75rem; font-size: 0.8rem; color: ${r.status === 'error' ? 'var(--danger)' : 'var(--text-muted)'};">
                    ${r.error || "Successfully created user account & roles"}
                </td>
            </tr>
        `).join("");

        reportBox.innerHTML = `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-lg); padding: 1rem; margin-top: 1rem;">
                <div style="display: flex; gap: 1.5rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
                    <div><span class="text-muted" style="font-size: 0.8rem;">Total Processed:</span> <strong style="font-size: 1rem;">${res.total}</strong></div>
                    <div><span class="text-muted" style="font-size: 0.8rem;">Imported:</span> <strong style="color: var(--success); font-size: 1rem;">${res.imported}</strong></div>
                    <div><span class="text-muted" style="font-size: 0.8rem;">Failed:</span> <strong style="color: var(--danger); font-size: 1rem;">${res.failed}</strong></div>
                </div>

                <div style="max-height: 250px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
                        <thead>
                            <tr style="background: var(--bg-main); font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">
                                <th style="padding: 0.5rem 0.75rem;">Row #</th>
                                <th style="padding: 0.5rem 0.75rem;">Email</th>
                                <th style="padding: 0.5rem 0.75rem;">Status</th>
                                <th style="padding: 0.5rem 0.75rem;">Details / Error</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }
};
