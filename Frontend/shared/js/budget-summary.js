// Shared 4-tile Budget Summary panel — used by Club Head's proposal submit
// form (computed from live, unsaved form rows) and by President's / Faculty
// Coordinator's proposal review screens (computed from a saved proposal
// object). Depends on formatCurrency (shared/js/utils.js).

// Unconditional sum of a persisted proposal's monetary asks — the
// "Total Budget Asked For" figure for a proposal that's already been
// submitted (as opposed to Club Head's own live formState-based total,
// which runs before anything is saved).
function computeTotalAskedForProposal(prop) {
    const procTotal = (prop.procuringItems || []).reduce((s, r) => s + (r.overallPrice || 0), 0);
    const prizeTotal = (prop.prizeMoney || []).reduce((s, r) => s + (r.amount || 0), 0);
    const judgeTotal = (prop.judgeFees || []).reduce((s, r) => s + (r.overallPrice || 0), 0);
    return procTotal + prizeTotal + judgeTotal;
}

// Renders the 4-tile panel (allotted / remaining-before / asked / remaining-after)
// into containerEl, given the club's current finance figures and the ask total.
function renderBudgetSummaryTiles(containerEl, { allotted, spent, totalAsked }) {
    if (!containerEl) return;

    const remainingBefore = allotted - spent;
    const remainingAfter = remainingBefore - totalAsked;
    const overBudget = remainingAfter < 0;

    containerEl.innerHTML = `
        <div class="prop-summary-item">
            <i class="fa-solid fa-wallet text-indigo"></i>
            <div>
                <span class="prop-summary-lbl">Club's Allotted Budget</span>
                <span class="prop-summary-val">${formatCurrency(allotted)}</span>
            </div>
        </div>
        <div class="prop-summary-item">
            <i class="fa-solid fa-piggy-bank text-emerald"></i>
            <div>
                <span class="prop-summary-lbl">Remaining Budget (Before this Request)</span>
                <span class="prop-summary-val">${formatCurrency(remainingBefore)}</span>
            </div>
        </div>
        <div class="prop-summary-item">
            <i class="fa-solid fa-indian-rupee-sign text-amber"></i>
            <div>
                <span class="prop-summary-lbl">Total Budget Asked For (this proposal)</span>
                <span class="prop-summary-val">${formatCurrency(totalAsked)}</span>
            </div>
        </div>
        <div class="prop-summary-item prop-summary-total">
            <i class="fa-solid fa-scale-balanced" style="${overBudget ? 'color:var(--danger);' : 'color:var(--primary);'}"></i>
            <div>
                <span class="prop-summary-lbl">Remaining Budget (After this Request)</span>
                <span class="prop-summary-val" style="${overBudget ? 'color:var(--danger);' : 'color:var(--primary);'} font-weight:700;">
                    ${formatCurrency(remainingAfter)}${overBudget ? ' <span style="font-size:0.65rem;">(exceeds budget)</span>' : ''}
                </span>
            </div>
        </div>
    `;
}
