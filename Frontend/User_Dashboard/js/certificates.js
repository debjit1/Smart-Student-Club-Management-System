// Certificates Tab Logic — certificates are issued by the Faculty Coordinator
// dashboard (issueCertificatesForEvent, shared/js/state-core.js) once an
// event's certification is finally verified. Each recipient gets one
// certificate per event: a "Volunteer" certificate when they completed a
// Verified task, otherwise an "Attendee" certificate for a checked-in
// attendance. This tab lists the current student's own certificates and lets
// them download each one as a PDF (jsPDF).

// The event budget this certificate belongs to (for the event date + the
// volunteer duties the student completed during the event).
function getCertificateEventBudget(cert) {
    return (state.eventBudgets || []).find(e => String(e.id) === String(cert.eventId));
}

// Resolve the certificate type ("Volunteer" | "Attendee"). New certificates
// carry `type`; legacy ones issued before the field existed are derived from
// whether the student completed a Verified task for the event.
function getCertificateType(cert, eb) {
    if (cert.type === "Volunteer" || cert.type === "Attendee") return cert.type;
    const isVolunteer = eb && (eb.tasks || []).some(t =>
        t.status === "Verified" && String(t.assignedVolunteerId) === String(cert.studentId));
    return isVolunteer ? "Volunteer" : "Attendee";
}

// What this volunteer did during the event — the Verified tasks that earned
// the certificate. Only shown on Volunteer certificates.
function buildCertificateDuties(cert, eb) {
    const duties = (eb && Array.isArray(eb.tasks) ? eb.tasks : [])
        .filter(t => t.status === "Verified" && String(t.assignedVolunteerId) === String(cert.studentId))
        .map(t => t.title)
        .filter(Boolean);
    return duties.length ? duties : ["Volunteered for the event"];
}

window.renderCertificates = function () {
    if (!elements.certificatesCards) return;

    let certs = (state.certificates || []).filter(c => c.studentId === CURRENT_STUDENT_ID);
    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        certs = certs.filter(cert =>
            (cert.eventName && cert.eventName.toLowerCase().includes(q)) ||
            (cert.club && cert.club.toLowerCase().includes(q)) ||
            (cert.type && cert.type.toLowerCase().includes(q))
        );
    }

    if (certs.length === 0) {
        elements.certificatesCards.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; padding: 5rem 0;">
                <i class="fa-solid fa-award" style="font-size: 3.5rem;"></i>
                <p style="margin-top: 1rem; font-size: 1rem;">${uiState.searchQuery ? 'No certificates match your search.' : 'No certificates issued yet. Completed events and verified volunteering will show up here.'}</p>
            </div>
        `;
        return;
    }

    elements.certificatesCards.innerHTML = certs.map(cert => {
        const type = getCertificateType(cert, getCertificateEventBudget(cert));
        const isVolunteer = type === "Volunteer";
        return `
        <div class="certificate-card">
            <div class="cert-icon-container ${isVolunteer ? 'volunteer' : 'attendee'}">
                <i class="fa-solid ${isVolunteer ? 'fa-hand-holding-heart' : 'fa-ticket'}"></i>
            </div>
            <span class="cert-type-badge ${isVolunteer ? 'volunteer' : 'attendee'}">
                <i class="fa-solid ${isVolunteer ? 'fa-hand-holding-heart' : 'fa-user-check'}"></i>
                ${isVolunteer ? 'Volunteer' : 'Attendance'}
            </span>
            <h3 class="cert-title">${escapeHtml(cert.title)}</h3>
            <p class="cert-issuer">Issued by ${escapeHtml(cert.issuer)} on ${formatDate(cert.issueDate)}</p>
            <button type="button" class="btn cert-download-btn" data-download-cert="${escapeHtml(cert.id)}">
                <i class="fa-solid fa-file-pdf"></i> Download PDF
            </button>
        </div>
    `;
    }).join("");
};

// Download the certificate as a PDF. Volunteer and Attendee certificates get
// distinct titles, wording, accent color and duties, matching the card badges.
function downloadCertificatePdf(cert) {
    if (!cert || typeof window.jspdf === "undefined") {
        if (typeof showToast === "function") {
            showToast("PDF library isn't loaded — check your internet connection and try again.", "error");
        }
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();   // 842pt
    const H = doc.internal.pageSize.getHeight();  // 595pt

    const eb = getCertificateEventBudget(cert);
    const type = getCertificateType(cert, eb);
    const isVolunteer = type === "Volunteer";

    const eventName = cert.title
        || (eb && (eb.publish && eb.publish.name ? eb.publish.name : eb.eventName))
        || "College Event";
    const eventDate = eb && eb.publish && eb.publish.date ? formatDate(eb.publish.date) : "";
    // Duty list only belongs on the Volunteer certificate; attendee certs just
    // carry the presentation/date block.
    const duties = isVolunteer ? buildCertificateDuties(cert, eb) : [];
    const studentName = cert.studentName || CURRENT_STUDENT_NAME;

    // Distinct palette per certificate type (amber = volunteering, sky =
    // attendance -- both drawn from the site theme).
    const ACCENT = isVolunteer ? [245, 158, 11] : [2, 132, 199];   // --grad-amber vs --primary
    const BORDER = isVolunteer ? [198, 156, 68] : [14, 116, 144];
    const NAVY = [31, 56, 100];
    const GRAY = [110, 110, 115];
    const INK = [35, 35, 40];

    const certTitle = isVolunteer ? "CERTIFICATE OF VOLUNTEERING" : "CERTIFICATE OF PARTICIPATION";
    const preamble = isVolunteer
        ? "for successfully volunteering and completing the responsibilities of the event"
        : "for attending and actively participating in the event";

    // Decorative double border (type-colored outer, thin inner)
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(3);
    doc.rect(24, 24, W - 48, H - 48);
    doc.setLineWidth(1);
    doc.rect(32, 32, W - 64, H - 64);

    // Writes centered, wrapped text and returns the y-position after the block.
    const centerText = (text, y, size, style, color, maxWidth) => {
        doc.setFont("helvetica", style || "normal");
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(text, maxWidth || W - 160);
        const lh = size * 1.25;
        lines.forEach(line => { doc.text(line, W / 2, y, { align: "center" }); y += lh; });
        return y;
    };

    // Header
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text("STUDENT CLUB MANAGEMENT SYSTEM", W / 2, 66, { align: "center" });

    let y = centerText(certTitle, 106, 30, "bold", NAVY, W - 200);
    y += 12;

    // Divider under the title
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(2);
    doc.line(W / 2 - 130, y, W / 2 + 130, y);
    y += 26;

    y = centerText("This certificate is proudly presented to", y, 13, "normal", GRAY, W - 200);
    y += 14;

    // Recipient name (serif italic, large)
    doc.setFont("times", "bolditalic");
    doc.setFontSize(34);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.splitTextToSize(studentName || "Student", W - 200).forEach(line => {
        doc.text(line, W / 2, y, { align: "center" });
        y += 40;
    });
    y += 10;

    y = centerText(preamble, y, 13, "normal", GRAY, W - 200);
    y += 20;

    y = centerText(eventName, y, 22, "bold", ACCENT, W - 180);
    y += 18;

    if (eventDate && eventDate !== "—") {
        centerText("Event Date: " + eventDate, y, 13, "normal", GRAY, W - 200);
        y += 34;
    } else {
        y += 34;
    }

    // Volunteer responsibilities section — Volunteer certificates only.
    // Attendee certificates close right after the event name/date block.
    if (isVolunteer) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.text("VOLUNTEER RESPONSIBILITIES", W / 2, y, { align: "center" });
        y += 18;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        duties.forEach((d, i) => {
            const lines = doc.splitTextToSize(`${i + 1}. ${d}`, W - 220);
            lines.forEach(line => {
                if (y > H - 90) {
                    doc.addPage();
                    y = 60;
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(12);
                    doc.setTextColor(INK[0], INK[1], INK[2]);
                }
                doc.text(line, W / 2, y, { align: "center" });
                y += 18;
            });
        });
    }

    // Footer
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    if (cert.issuer) doc.text(`Issued by: ${cert.issuer}`, 48, H - 52);
    doc.text(`Issued on: ${formatDate(cert.issueDate)}`, W - 48, H - 52, { align: "right" });

    const safeName = String(eventName).replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60) || "Certificate";
    doc.save(`Certificate-${type}-${safeName}.pdf`);
}

document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("certificates-cards-container");
    if (!grid) return;
    grid.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-download-cert]");
        if (!btn) return;
        const cert = (state.certificates || []).find(c => c.id === btn.getAttribute("data-download-cert"));
        if (cert) downloadCertificatePdf(cert);
    });
});
