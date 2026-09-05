// Resources-calendar rendering — shared by President and Faculty Coordinator
// dashboards (byte-identical in both; Club Head has no calendar tab, so it
// doesn't load this file). Depends on the calendarDate/calendarResourceType/
// calendarSelectedVenues/calendarSelectedRequirements globals each dashboard
// declares alongside its other UI-only state.
function renderCalendar() {
    renderCalendarFilters();
    renderCalendarGrid();
}

function renderCalendarFilters() {
    const checklistDiv = document.getElementById("calendar-checkboxes-list");
    if (!checklistDiv) return;
    
    checklistDiv.innerHTML = "";
    
    if (calendarResourceType === "venues") {
        const allVenues = state.venues.map(v => v.name);
        if (calendarSelectedVenues === null) {
            calendarSelectedVenues = [...allVenues];
        }
        
        state.venues.forEach(v => {
            const isChecked = calendarSelectedVenues.includes(v.name);
            checklistDiv.innerHTML += `
                <label class="checkbox-label" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-main); cursor: pointer;">
                    <input type="checkbox" name="cal-filter-item" value="${escapeHtml(v.name)}" ${isChecked ? "checked" : ""} style="cursor: pointer;">
                    <span>${escapeHtml(v.name)}</span>
                </label>
            `;
        });
    } else {
        // Collect all requirements dynamically
        const reqNames = new Set();
        state.inventory.forEach(i => reqNames.add(i.name));
        state.inventoryUsage.forEach(u => reqNames.add(u.itemName));
        state.bookings.forEach(b => {
            if (b.requirements) b.requirements.forEach(r => reqNames.add(r));
        });
        state.proposals.forEach(p => {
            if (p.inventoryRequirements) p.inventoryRequirements.forEach(r => reqNames.add(r.name));
        });
        
        const allReqs = Array.from(reqNames).sort();
        if (calendarSelectedRequirements === null) {
            calendarSelectedRequirements = [...allReqs];
        }
        
        allReqs.forEach(req => {
            const isChecked = calendarSelectedRequirements.includes(req);
            checklistDiv.innerHTML += `
                <label class="checkbox-label" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-main); cursor: pointer;">
                    <input type="checkbox" name="cal-filter-item" value="${escapeHtml(req)}" ${isChecked ? "checked" : ""} style="cursor: pointer;">
                    <span>${escapeHtml(req)}</span>
                </label>
            `;
        });
    }
}

function renderCalendarGrid() {
    const daysGrid = document.getElementById("calendar-days-grid");
    const monthTitle = document.getElementById("calendar-month-title");
    if (!daysGrid || !monthTitle) return;
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth(); // 0-indexed
    
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    monthTitle.textContent = `${monthNames[month]} ${year}`;
    
    daysGrid.innerHTML = "";
    
    // First day of the month
    const firstDayIndex = new Date(year, month, 1).getDay();
    
    // Total days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Total days in previous month
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    
    // Padding cells from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevMonthTotalDays - i;
        const d = new Date(year, month - 1, dayNum);
        const cell = createDayCell(d, true);
        daysGrid.appendChild(cell);
    }
    
    // Days of current month
    for (let i = 1; i <= totalDays; i++) {
        const d = new Date(year, month, i);
        const cell = createDayCell(d, false);
        daysGrid.appendChild(cell);
    }
    
    // Padding cells from next month to complete the grid row
    const totalCellsSoFar = firstDayIndex + totalDays;
    const remainingCells = totalCellsSoFar % 7 === 0 ? 0 : 7 - (totalCellsSoFar % 7);
    for (let i = 1; i <= remainingCells; i++) {
        const d = new Date(year, month + 1, i);
        const cell = createDayCell(d, true);
        daysGrid.appendChild(cell);
    }
}

function createDayCell(dateObj, isOtherMonth) {
    const day = dateObj.getDate();
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    
    // Formatted date YYYY-MM-DD
    const pad = (n) => n.toString().padStart(2, '0');
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    
    const cell = document.createElement("div");
    cell.className = "calendar-day-cell";
    if (isOtherMonth) {
        cell.classList.add("other-month");
    }
    
    // Highlight today
    const today = new Date();
    if (dateObj.getFullYear() === today.getFullYear() &&
        dateObj.getMonth() === today.getMonth() &&
        dateObj.getDate() === today.getDate()) {
        cell.classList.add("today");
    }
    
    const dayNumDiv = document.createElement("div");
    dayNumDiv.className = "calendar-day-number";
    dayNumDiv.textContent = day;
    cell.appendChild(dayNumDiv);
    
    const eventsListDiv = document.createElement("div");
    eventsListDiv.className = "calendar-events-list";
    
    if (calendarResourceType === "venues") {
        const bookingsToday = state.bookings.filter(b => 
            b.date === dateStr && 
            (b.status === "Confirmed" || b.status === "Completed")
        );
        
        const filteredBookings = bookingsToday.filter(b => 
            calendarSelectedVenues && calendarSelectedVenues.includes(b.venueName)
        );
        
        filteredBookings.sort((a, b) => {
            const timeA = parseTimeRange(a.timeSlot)?.start || 0;
            const timeB = parseTimeRange(b.timeSlot)?.start || 0;
            return timeA - timeB;
        });

        filteredBookings.forEach(b => {
            const item = document.createElement("div");
            item.className = "calendar-event-item venue-item";
            item.setAttribute("data-booking-id", b.id);
            item.title = `${b.venueName} (${b.timeSlot}) - ${b.event}`;
            item.innerHTML = `<i class="fa-solid fa-location-dot" style="margin-right:0.25rem;"></i> <strong>${escapeHtml(b.venueName)}</strong> <span style="font-size:0.65rem; opacity:0.85;">${escapeHtml(b.timeSlot)}</span>`;
            eventsListDiv.appendChild(item);
        });
    } else {
        const usagesToday = state.inventoryUsage.filter(u => 
            u.date === dateStr && u.status !== "Returned"
        );
        
        const filteredUsages = usagesToday.filter(u => 
            calendarSelectedRequirements && calendarSelectedRequirements.includes(u.itemName)
        );
        
        filteredUsages.sort((a, b) => {
            const timeA = parseTimeRange(a.timeRange)?.start || 0;
            const timeB = parseTimeRange(b.timeRange)?.start || 0;
            return timeA - timeB;
        });

        filteredUsages.forEach(u => {
            const item = document.createElement("div");
            item.className = "calendar-event-item req-item";
            item.setAttribute("data-usage-id", u.id);
            item.title = `${u.itemName} (x${u.qty}) - ${u.event} (${u.volunteerName || 'Unassigned'})`;
            item.innerHTML = `<i class="fa-solid fa-boxes-stacked" style="margin-right:0.25rem;"></i> <strong>${escapeHtml(u.itemName)} (x${u.qty})</strong>`;
            eventsListDiv.appendChild(item);
        });
    }
    
    cell.appendChild(eventsListDiv);
    return cell;
}
