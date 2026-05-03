// ── opponents.js ──────────────────────────────────────────────────────────────
// Manages the Opponents view for tracking recurring weekly event opponents.

const OpponentsManager = (() => {
  let _opponents = [];
  let _activeOpponent = null;

  async function loadOpponents() {
    try {
      _opponents = await fetch('/api/opponents').then(r => r.json());
      renderList();
    } catch(e) {
      showToast('Failed to load opponents: ' + e.message, 'error');
    }
  }

  function renderList() {
    const el = document.getElementById('opponents-list');
    if (!el) return;
    if (!_opponents.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:8px">No opponents yet.</div>`;
      return;
    }
    el.innerHTML = _opponents.map(o => `
      <div class="opponent-item ${_activeOpponent?.id === o.id ? 'active' : ''}" data-id="${o.id}">
        <div class="team-item-name">${esc(o.name)}</div>
        ${o.notes ? `<div class="team-item-meta">${esc(o.notes.slice(0,60))}</div>` : ''}
      </div>
    `).join('');
    el.querySelectorAll('.opponent-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = parseInt(item.dataset.id);
        _activeOpponent = _opponents.find(o => o.id === id);
        renderList();
        await openOpponentDetail(_activeOpponent);
      });
    });
  }

  async function openOpponentDetail(opponent) {
    const detail = document.getElementById('opponent-detail');
    if (!detail || !opponent) return;

    // Load their teams
    let teams = [];
    try {
      const all = await fetch('/api/teams?owner=opponent').then(r => r.json());
      // Filter to teams tagged to this opponent (notes field contains opponent name as simple heuristic)
      // For a proper FK link we'd need the opponent_id column — works for now as a name match
      teams = all.filter(t => t.notes?.includes(`[opp:${opponent.id}]`));
    } catch(e) {}

    detail.innerHTML = `
      <div class="team-editor-header">
        <h2>${esc(opponent.name)}</h2>
        <button class="action-btn secondary" id="edit-opponent-btn">Edit</button>
        <button class="action-btn danger" id="delete-opponent-btn">Delete</button>
      </div>
      ${opponent.notes ? `<p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">${esc(opponent.notes)}</p>` : ''}

      <div class="sidebar-header" style="margin-bottom:12px">
        <h3 style="font-size:14px">Tracked Teams</h3>
        <button class="action-btn" id="new-opp-team-btn">+ Add Team for This Opponent</button>
      </div>

      ${teams.length ? `
        <div class="team-list">
          ${teams.map(t => `
            <div class="team-item">
              <div class="team-item-name">${esc(t.name)}</div>
              <div class="team-item-meta">${(t.pokemon||[]).length} Pokémon · Gen ${t.gen ?? 7}</div>
              <div class="slot-actions" style="margin-top:8px">
                <button class="action-btn secondary opp-team-open-btn" data-id="${t.id}">View Team</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p style="color:var(--text-muted);font-size:13px">No teams tracked for this opponent yet.</p>`}
    `;

    document.getElementById('edit-opponent-btn')?.addEventListener('click', () => openEditModal(opponent));
    document.getElementById('delete-opponent-btn')?.addEventListener('click', () => deleteOpponent(opponent));
    document.getElementById('new-opp-team-btn')?.addEventListener('click', () => {
      // Tag team with opponent id in notes
      openModal('New Opponent Team', `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="form-row"><label>Team Name / Event</label>
            <input type="text" id="opp-team-name" placeholder="Week 3 - VGC Regional" /></div>
          <div class="form-row"><label>Notes</label>
            <textarea id="opp-team-notes" rows="2"></textarea></div>
          <button class="action-btn" id="create-opp-team-btn">Create</button>
        </div>
      `);
      document.getElementById('create-opp-team-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('opp-team-name').value.trim();
        const notes = document.getElementById('opp-team-notes').value.trim();
        if (!name) { showToast('Team name required', 'error'); return; }
        closeModal();
        try {
          const res = await fetch('/api/teams', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              name,
              owner: 'opponent',
              notes: `[opp:${opponent.id}] ${notes}`,
              pokemon: [],
              gen: window.appState?.currentGen ?? 7,
            })
          });
          const d = await res.json();
          showToast('Team created!', 'success');
          await openOpponentDetail(opponent);
          // Switch to teams view and open that team
          switchView('myteams');
          await TeamsManager.loadTeams();
        } catch(e) {
          showToast('Failed: ' + e.message, 'error');
        }
      });
    });

    detail.querySelectorAll('.opp-team-open-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        switchView('myteams');
        await TeamsManager.loadTeams();
        // Open that team
        const allTeams = await fetch('/api/teams?owner=opponent').then(r=>r.json());
        const team = allTeams.find(t => t.id === id);
        if (team) {
          // Slight delay to let teams view render
          setTimeout(() => {
            document.querySelector(`[data-id="${id}"]`)?.click();
          }, 100);
        }
      });
    });
  }

  function openEditModal(opponent) {
    openModal('Edit Opponent', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="form-row"><label>Name</label>
          <input type="text" id="edit-opp-name" value="${esc(opponent.name)}" /></div>
        <div class="form-row"><label>Notes</label>
          <textarea id="edit-opp-notes" rows="3">${esc(opponent.notes||'')}</textarea></div>
        <button class="action-btn" id="save-opp-btn">Save</button>
      </div>
    `);
    document.getElementById('save-opp-btn')?.addEventListener('click', async () => {
      opponent.name = document.getElementById('edit-opp-name').value.trim() || opponent.name;
      opponent.notes = document.getElementById('edit-opp-notes').value.trim();
      try {
        await fetch(`/api/opponents/${opponent.id}`, {
          method: 'PUT',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name: opponent.name, notes: opponent.notes })
        });
        closeModal();
        await loadOpponents();
        await openOpponentDetail(opponent);
        showToast('Opponent updated', 'success');
      } catch(e) {
        showToast('Failed: ' + e.message, 'error');
      }
    });
  }

  async function deleteOpponent(opponent) {
    if (!confirm(`Delete opponent "${opponent.name}"? Their teams will remain but become unlinked.`)) return;
    try {
      await fetch(`/api/opponents/${opponent.id}`, { method: 'DELETE' });
      _activeOpponent = null;
      document.getElementById('opponent-detail').innerHTML = `<div class="placeholder-msg">Opponent deleted.</div>`;
      await loadOpponents();
      showToast('Opponent deleted', 'success');
    } catch(e) {
      showToast('Failed: ' + e.message, 'error');
    }
  }

  function initAddBtn() {
    document.getElementById('new-opponent-btn')?.addEventListener('click', () => {
      openModal('Add Opponent', `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="form-row"><label>Name / Handle</label>
            <input type="text" id="new-opp-name" placeholder="e.g. MikeyVGC" /></div>
          <div class="form-row"><label>Notes</label>
            <textarea id="new-opp-notes" rows="2" placeholder="Met at Weekly #1 · Prefers stall..."></textarea></div>
          <button class="action-btn" id="create-opp-btn">Add Opponent</button>
        </div>
      `);
      document.getElementById('create-opp-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('new-opp-name').value.trim();
        const notes = document.getElementById('new-opp-notes').value.trim();
        if (!name) { showToast('Name required', 'error'); return; }
        try {
          await fetch('/api/opponents', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name, notes })
          });
          closeModal();
          await loadOpponents();
          showToast('Opponent added!', 'success');
        } catch(e) {
          showToast('Failed: ' + e.message, 'error');
        }
      });
    });
  }

  return { loadOpponents, initAddBtn };
})();
