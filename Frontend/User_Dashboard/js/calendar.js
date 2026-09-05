// Calendar View Logic — shows the student's registered events by date.
window.renderCalendar = function () {
    if (!elements.calendarDays) return;

    const calendarMonthDate = uiState.calendarDate;
    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    if (elements.calendarMonthYear) {
        elements.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    const myRegs = getMyRegistrations();

    let daysHTML = "";
    for (let i = 0; i < firstDayIndex; i++) {
        daysHTML += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const regsOnDay = myRegs.filter(({ eb }) => getEventDisplayDate(eb) === dateStr);
        const isToday = dateStr === todayStr();

        let eventsDotsHTML = "";
        if (regsOnDay.length > 0) {
            eventsDotsHTML = `<div class="calendar-day-events">` +
                regsOnDay.map(({ eb }) => `<div class="calendar-event-dot technical" title="${escapeHtml(getEventDisplayName(eb))}">${escapeHtml(getEventDisplayName(eb))}</div>`).join("") +
                `</div>`;
        }

        daysHTML += `
            <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                <span class="calendar-day-num">${day}</span>
                ${eventsDotsHTML}
            </div>
        `;
    }

    elements.calendarDays.innerHTML = daysHTML;
    elements.calendarDays.querySelectorAll(".calendar-day[data-date]").forEach(el => {
        el.addEventListener("click", () => window.selectCalendarDay(el.getAttribute("data-date")));
    });

    renderAgenda();
};

window.selectCalendarDay = function (dateString) {
    const regsOnDay = getMyRegistrations().filter(({ eb }) => getEventDisplayDate(eb) === dateString);
    if (regsOnDay.length > 0) {
        const names = regsOnDay.map(({ eb }) => getEventDisplayName(eb)).join(", ");
        showToast(`${formatDate(dateString)} — ${names}`, "info");
    } else {
        showToast(`No registered events on ${formatDate(dateString)}`, "info");
    }
};

window.renderAgenda = function () {
    if (!elements.calendarAgenda) return;

    let myRegs = getMyRegistrations()
        .filter(({ eb }) => !!getEventDisplayDate(eb))
        .sort((a, b) => getEventDisplayDate(a.eb).localeCompare(getEventDisplayDate(b.eb)));

    if (uiState.searchQuery) {
        const q = uiState.searchQuery.toLowerCase();
        myRegs = myRegs.filter(({ eb }) =>
            getEventDisplayName(eb).toLowerCase().includes(q) ||
            (eb.club && eb.club.toLowerCase().includes(q)) ||
            (eb.publish && eb.publish.venue && eb.publish.venue.toLowerCase().includes(q))
        );
    }

    if (myRegs.length === 0) {
        elements.calendarAgenda.innerHTML = `
            <div class="empty-state" style="padding: 2.5rem 0;">
                <i class="fa-solid fa-list-ul"></i>
                <p>${uiState.searchQuery ? 'No agenda items match your search.' : 'Register for events to see your schedule agenda.'}</p>
            </div>
        `;
        return;
    }

    elements.calendarAgenda.innerHTML = myRegs.map(({ eb }) => {
        const dateStr = getEventDisplayDate(eb);
        const eventDate = new Date(dateStr);
        const day = eventDate.getUTCDate();
        const shortMonth = eventDate.toLocaleString('default', { month: 'short', timeZone: 'UTC' });

        return `
            <div class="agenda-item">
                <div class="agenda-date-badge">
                    ${day}
                    <span>${shortMonth}</span>
                </div>
                <div class="agenda-text-wrap">
                    <h4 class="agenda-event-title">${escapeHtml(getEventDisplayName(eb))}</h4>
                    <p class="agenda-event-time">${escapeHtml((eb.publish && eb.publish.time) || "TBA")} | ${escapeHtml((eb.publish && eb.publish.venue) || "Venue TBA")}</p>
                </div>
            </div>
        `;
    }).join("");
};
