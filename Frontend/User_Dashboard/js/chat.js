// Chat Tab — one thread per club the student is a Selected volunteer for,
// mirroring the Club Head's Volunteer Chat (club_head_dashboard/app.js).
// Messages live in the shared state.chatMessages array, keyed by (club, studentId).
let activeChatClub = null;
let chatPollIntervalId = null;

function getChatThreadWithClub(club) {
    return (state.chatMessages || [])
        .filter(m => m.club === club && m.studentId === CURRENT_STUDENT_ID)
        .sort((a, b) => new Date(a.sentOn) - new Date(b.sentOn));
}

window.renderChat = function () {
    const listEl = document.getElementById("stu-chat-club-list");
    const panelEl = document.getElementById("stu-chat-panel");
    if (!listEl || !panelEl) return;

    const clubs = getSelectedVolunteerClubs();
    if (!clubs.length) {
        listEl.innerHTML = `<p class="text-muted" style="padding:1rem; font-size:0.85rem;">Get selected as a volunteer for a club to chat with its Club Head.</p>`;
        panelEl.innerHTML = "";
        if (chatPollIntervalId) { clearInterval(chatPollIntervalId); chatPollIntervalId = null; }
        return;
    }

    if (!activeChatClub || !clubs.includes(activeChatClub)) {
        activeChatClub = clubs[0];
    }

    listEl.innerHTML = clubs.map(club => `
        <div class="chat-thread-item ${club === activeChatClub ? 'active' : ''}" data-club="${escapeHtml(club)}" style="padding:0.75rem 1rem; cursor:pointer; border-radius:8px; ${club === activeChatClub ? 'background:var(--primary-light);' : ''}">
            <strong>${escapeHtml(club)}</strong>
        </div>
    `).join("");

    renderChatPanelForClub(activeChatClub);

    // Start polling for new messages every 3 seconds
    if (chatPollIntervalId) clearInterval(chatPollIntervalId);
    chatPollIntervalId = setInterval(() => {
        if (activeChatClub) pollChatForClub(activeChatClub);
    }, 3000);
};

async function renderChatPanelForClub(club) {
    const panel = document.getElementById("stu-chat-panel");
    if (!panel) return;

    // Resolve the club name to its backend club_id so the live chat thread can
    // be fetched. If there's no club profile match (or no Api client), fall
    // back to the local cached thread only -- never crash on a missing match.
    const clubProfile = (state.clubProfiles || []).find(p => p.club === club);
    if (clubProfile && typeof Api !== "undefined" && CURRENT_STUDENT_ID) {
        try {
            const backendMessages = await Api.getChat(clubProfile.id, CURRENT_STUDENT_ID);
            if (Array.isArray(backendMessages)) {
                mergeChatMessagesForClub(backendMessages, club);
            }
        } catch (err) {
            console.warn(`Could not fetch chat for ${club}:`, err);
        }
    } else if (!clubProfile && typeof Api !== "undefined") {
        console.warn(`No club profile found for "${club}" -- chat will be local-only.`);
    }

    const messages = getChatThreadWithClub(club);

    panel.innerHTML = `
        <div class="chat-panel-header" style="padding:0.75rem 1rem; border-bottom:1px solid var(--border-color); font-weight:700;">${escapeHtml(club)} — Club Head</div>
        <div class="chat-messages" id="stu-chat-messages" style="flex:1; overflow-y:auto; padding:1rem; display:flex; flex-direction:column; gap:0.6rem;">
            ${messages.length ? messages.map(m => `
                <div class="chat-bubble" style="max-width:75%; padding:0.5rem 0.8rem; border-radius:10px; ${m.sender === 'student' ? 'align-self:flex-end; background:var(--primary); color:#fff;' : 'align-self:flex-start; background:var(--bg-subtle,#f1f1f5);'}">
                    <div>${escapeHtml(m.text)}</div>
                    <div style="font-size:0.65rem; opacity:0.75; margin-top:0.2rem;">${formatDateTime(m.sentOn.replace('T', ' ').substring(0, 16))}</div>
                </div>
            `).join("") : `<p class="text-muted" style="text-align:center;">No messages yet — say hello!</p>`}
        </div>
        <form id="form-stu-chat-send" style="display:flex; gap:0.5rem; padding:0.75rem 1rem; border-top:1px solid var(--border-color);">
            <input type="text" id="stu-chat-input" class="form-input" placeholder="Type a message..." autocomplete="off" required style="flex:1;">
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
    `;

    const msgsEl = document.getElementById("stu-chat-messages");
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    document.getElementById("form-stu-chat-send").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("stu-chat-input");
        const text = input.value.trim();
        if (!text) return;
        const localMsg = {
            id: generateId("chat"),
            club,
            studentId: CURRENT_STUDENT_ID,
            sender: "student",
            senderName: CURRENT_STUDENT_NAME,
            text,
            sentOn: new Date().toISOString()
        };
        // Append locally for instant UI, then mirror to the backend.
        state.chatMessages.push(localMsg);
        saveState();
        renderChatPanelForClub(club);

        if (clubProfile && typeof Api !== "undefined" && CURRENT_STUDENT_ID) {
            try {
                const created = await Api.sendChat(clubProfile.id, { student_id: CURRENT_STUDENT_ID, text });
                if (created && created.id) {
                    localMsg.id = `bk-${created.id}`;
                    localMsg.backendId = created.id;
                    localMsg.sentOn = created.created_at ? String(created.created_at) : localMsg.sentOn;
                }
                saveState();
                renderChatPanelForClub(club);
            } catch (err) {
                showToast(`Couldn't send message to backend: ${err.detail || err.message}`, "warning");
            }
        }
    });
}

// Poll for new messages without full re-render (just merge and update if needed)
async function pollChatForClub(club) {
    const clubProfile = (state.clubProfiles || []).find(p => p.club === club);
    if (!clubProfile || typeof Api === "undefined" || !CURRENT_STUDENT_ID) return;
    try {
        const backendMessages = await Api.getChat(clubProfile.id, CURRENT_STUDENT_ID);
        if (Array.isArray(backendMessages)) {
            const beforeCount = state.chatMessages.length;
            mergeChatMessagesForClub(backendMessages, club);
            // Only re-render if new messages were added
            if (state.chatMessages.length > beforeCount) {
                renderChatPanelForClub(club);
            }
        }
    } catch (err) {
        // Silent fail on polling
    }
}

// Merges backend ChatMessageOut rows into state.chatMessages, keyed by the
// backend message id so re-renders / re-fetches never duplicate a message.
function mergeChatMessagesForClub(backendMessages, club) {
    state.chatMessages = state.chatMessages || [];
    const existingByBackendId = new Map(state.chatMessages.filter(m => m.backendId).map(m => [m.backendId, m]));
    let added = false;
    for (const msg of backendMessages) {
        if (existingByBackendId.has(msg.id)) continue;
        // A locally-optimistic copy of a message we just sent is still pending
        // (no backendId yet) while the send POST is in flight. Upgrade that
        // copy in place instead of pushing a duplicate -- otherwise polling
        // racing the send handler shows every sent message twice.
        const pendingIdx = state.chatMessages.findIndex(m =>
            !m.backendId &&
            m.club === club &&
            m.studentId === (msg.student_id || CURRENT_STUDENT_ID) &&
            m.sender === (msg.sender_role || "student") &&
            m.text === msg.text
        );
        if (pendingIdx !== -1) {
            const pending = state.chatMessages[pendingIdx];
            pending.id = `bk-${msg.id}`;
            pending.backendId = msg.id;
            pending.sentOn = msg.created_at ? String(msg.created_at) : pending.sentOn;
            added = true;
            continue;
        }
        state.chatMessages.push({
            id: `bk-${msg.id}`,
            backendId: msg.id,
            club,
            studentId: msg.student_id || CURRENT_STUDENT_ID,
            sender: msg.sender_role || "student",
            senderName: msg.sender_role === "student" ? CURRENT_STUDENT_NAME : "Club Head",
            text: msg.text,
            sentOn: msg.created_at ? String(msg.created_at) : new Date().toISOString()
        });
        added = true;
    }
    if (added || dedupeChatMessages()) saveState();
}

// One-time / ongoing cleanup for chat duplicates. Two things can leave extra
// copies in localStorage: (a) two messages sharing one backend id (the send
// handler + a racing poll both storing the confirmed message), and (b) an
// orphaned optimistic copy (no backend id) that was superseded by a
// backend-confirmed twin. Both are safe to drop; identical text from an
// unrelated NEW message is kept because it stays fresh (> 60s newer than the
// confirmed twin, or no twin at all).
function dedupeChatMessages() {
    state.chatMessages = state.chatMessages || [];
    const seenBackend = new Set();
    const confirmedByKey = new Map();
    state.chatMessages.forEach(m => {
        if (m.backendId != null) {
            const key = [m.club, m.studentId, m.sender, m.text].join("|");
            if (!confirmedByKey.has(key)) confirmedByKey.set(key, m);
        }
    });
    const cleaned = [];
    let changed = false;
    for (const m of state.chatMessages) {
        if (m.backendId != null) {
            const k = String(m.backendId);
            if (seenBackend.has(k)) { changed = true; continue; }
            seenBackend.add(k);
            cleaned.push(m);
        } else {
            const key = [m.club, m.studentId, m.sender, m.text].join("|");
            const twin = confirmedByKey.get(key);
            const mine = +new Date(m.sentOn);
            const theirs = twin ? +new Date(twin.sentOn) : NaN;
            // Drop the orphan when it predates the twin (the race always stores
            // the optimistic copy first) or when the two are within a 60s
            // window (clock-skew-safe). A distinctly NEWER same-text message
            // (>60s apart) is a genuine new send and stays.
            if (twin && (mine <= theirs || Math.abs(theirs - mine) < 60000)) { changed = true; continue; }
            cleaned.push(m);
        }
    }
    if (changed) state.chatMessages = cleaned;
    return changed;
}

document.addEventListener("DOMContentLoaded", () => {
    const listEl = document.getElementById("stu-chat-club-list");
    if (!listEl) return;
    listEl.addEventListener("click", (e) => {
        const item = e.target.closest(".chat-thread-item");
        if (!item) return;
        activeChatClub = item.getAttribute("data-club");
        window.renderChat();
    });
});
