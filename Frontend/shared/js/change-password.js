// Change Password — one self-service modal for every role dashboard.
//
// Each dashboard exposes the same three hooks in its own index.html:
//   #change-password-btn      (key icon in the sidebar .user-profile-card)
//   #modal-change-password    (modal overlay)
//   #form-change-password     (current / new / confirm password fields)
//
// The admin dashboards (president, faculty coordinator, club head) use the
// `.modal` / `.form-input` markup; the student dashboard uses `.modal-box` /
// `.form-control`. This module only toggles the `.active` class on the overlay
// directly (no dependency on openModal/openModalOverlay), so script load order
// and the two markup styles don't matter. Close buttons, overlay clicks, and
// Escape are handled by each dashboard's existing generic modal-close wiring.
function initChangePassword() {
    const trigger = document.getElementById("change-password-btn");
    const modal = document.getElementById("modal-change-password");
    const form = document.getElementById("form-change-password");
    if (!trigger || !modal || !form) return;

    const cur = form.querySelector("#change-current-password");
    const next = form.querySelector("#change-new-password");
    const confirm = form.querySelector("#change-confirm-password");

    // Automatically equip each password input with an eye toggle button if not already wrapped
    [cur, next, confirm].forEach((input) => {
        if (!input || input.parentElement.classList.contains("password-input-wrap")) return;
        const wrap = document.createElement("div");
        wrap.className = "password-input-wrap";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toggle-password-btn";
        btn.setAttribute("title", "Show/Hide password");
        btn.setAttribute("aria-label", "Toggle password visibility");
        btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        btn.addEventListener("click", () => {
            const isPw = input.type === "password";
            input.type = isPw ? "text" : "password";
            btn.innerHTML = isPw ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        });
        wrap.appendChild(btn);
    });

    trigger.addEventListener("click", () => {
        form.reset();
        [cur, next, confirm].forEach((input) => {
            if (input) {
                input.type = "password";
                const btn = input.parentElement.querySelector(".toggle-password-btn");
                if (btn) btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
            }
        });
        modal.classList.add("active");
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!cur.value || !next.value || !confirm.value) {
            showToast("Please fill in all fields.", "warning");
            return;
        }
        if (next.value !== confirm.value) {
            showToast("New passwords do not match.", "danger");
            return;
        }
        // callApi surfaces the backend detail (e.g. "Current password is
        // incorrect") as a danger toast automatically.
        const res = await callApi(
            () => Api.changePassword({ current_password: cur.value, new_password: next.value }),
            "Couldn't change password"
        );
        if (!res.ok) return;
        modal.classList.remove("active");
        form.reset();
        showToast("Password changed successfully.", "success");
    });
}

document.addEventListener("DOMContentLoaded", initChangePassword);
