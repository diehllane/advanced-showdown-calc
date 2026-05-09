// ── teams.js ──────────────────────────────────────────────────────────────────
// Handles My Teams and Opponent Teams views.
// All persistence goes through window.SB (supabase-client.js).

const TeamsManager = (() => {
  let _myTeams  = [];
  let _oppTeams = [];
  let _activeTeam = null;

  async function loadTeams() {
    try {
      const [mine, opp] = await Promise.all([
        SB.getTeams('mine'),
        SB.getTeams('opponent'),
      ]);
      _myTeams  = mine;
      _oppTeams = opp;
      renderSidebars();
    } catch(e) {
      showToast('Failed to load teams: ' + e.message, 'error');
    }
  }

  function renderSidebars() {
    renderList('my-teams-list', _myTeams);
    renderList('opp-teams-list', _oppTeams);
  }

  function renderList(containerId, teams) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!teams.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:8px">No teams saved yet.</div>`;
      return;
    }
    el.innerHTML = teams.map(t => `
      <div class="team-item ${_activeTeam?.id === t.id ? 'active' : ''}" data-id="${t.id}">
        <div class="team-item-name">${esc(t.name)}</div>
        <div class="team-item-meta">
          ${(t.pokemon?.length ?? 0)} Pokémon · Gen ${t.gen ?? 7}
          ${t.notes ? `<br><em>${esc(t.notes.slice(0,40))}</em>` : ''}
        </div>
      </div>
    `).join('');
    el.querySelectorAll('.team-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        const team = [..._myTeams, ..._oppTeams].find(t => t.id === id);
        if (team) openTeamEditor(team);
      });
    });
  }

  function openTeamEditor(team) {
    _activeTeam = team;
    renderSidebars();
    const editor = document.getElementById('team-editor');
    if (!editor) return;

    const pokemon = team.pokemon || [];
    const slots = Array.from({length: 6}, (_, i) => {
      const pk = pokemon[i];
      if (!pk) return `<div class="team-slot empty" data-slot="${i}">+ Add Pokémon</div>`;
      return `
        <div class="team-slot" data-slot="${i}">
          <div class="slot-pokemon-name">${esc(pk.species || '?')}</div>
          <div class="slot-meta">
            ${esc(pk.item || 'No Item')} · ${esc(pk.ability || 'No Ability')} · ${esc(pk.nature || '')}
          </div>
          <div class="slot-moves">${(pk.moves||[]).filter(Boolean).join(' / ')}</div>
          <div class="slot-actions">
            <button class="action-btn secondary edit-slot-btn" data-slot="${i}">Edit</button>
            <button class="action-btn danger remove-slot-btn" data-slot="${i}">✕</button>
            <button class="action-btn secondary send-to-calc-btn" data-slot="${i}">→ Calc</button>
          </div>
        </div>
      `;
    }).join('');

    editor.innerHTML = `
      <div class="team-editor-header">
        <h2>${esc(team.name)}</h2>
        <button class="action-btn secondary" id="edit-team-meta-btn">Edit Name/Notes</button>
        <button class="action-btn danger" id="delete-team-btn">Delete Team</button>
      </div>
      ${team.notes ? `<p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">${esc(team.notes)}</p>` : ''}
      <div class="team-slots">${slots}</div>
      <button class="action-btn" id="save-team-btn">Save Team</button>
    `;

    editor.querySelectorAll('.team-slot.empty').forEach(slot => {
      slot.addEventListener('click', () => openSlotEditor(team, parseInt(slot.dataset.slot)));
    });
    editor.querySelectorAll('.edit-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => openSlotEditor(team, parseInt(btn.dataset.slot)));
    });
    editor.querySelectorAll('.remove-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.slot);
        team.pokemon.splice(i, 1);
        openTeamEditor(team);
      });
    });
    editor.querySelectorAll('.send-to-calc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.slot);
        const pk = team.pokemon[i];
        if (pk) {
          // Route to correct panel based on team owner
          if (team.owner === 'mine') {
            window.attackerForm?.setState(pk);
            showToast(`${pk.species} sent to Left`, 'success');
          } else {
            window.defenderForm?.setState(pk);
            showToast(`${pk.species} sent to Right`, 'success');
          }
          switchView('calc');
        }
      });
    });

    document.getElementById('save-team-btn')?.addEventListener('click', () => saveTeam(team));
    document.getElementById('delete-team-btn')?.addEventListener('click', () => deleteTeam(team));
    document.getElementById('edit-team-meta-btn')?.addEventListener('click', () => openTeamMetaModal(team));
  }

  function openSlotEditor(team, slotIdx) {
    const existing = team.pokemon?.[slotIdx] || {};
    openModal('Add / Edit Pokémon', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="form-row"><label>Species</label>
          <input type="text" id="slot-species" value="${esc(existing.species||'')}" placeholder="e.g. Garchomp" /></div>
        <div class="form-row"><label>Nickname</label>
          <input type="text" id="slot-nickname" value="${esc(existing.nickname||'')}" /></div>
        <div class="form-2col">
          <div class="form-row"><label>Level</label>
            <input type="number" id="slot-level" value="${existing.level||100}" min="1" max="100" /></div>
          <div class="form-row"><label>Nature</label>
            <select id="slot-nature">${NATURES.map(n=>`<option ${existing.nature===n?'selected':''}>${n}</option>`).join('')}</select></div>
        </div>
        <div class="form-row"><label>Item</label>
          <select id="slot-item">${COMMON_ITEMS.map(i=>`<option ${existing.item===i?'selected':''}>${i}</option>`).join('')}</select></div>
        <div class="form-row"><label>Ability</label>
          <input type="text" id="slot-ability" value="${esc(existing.ability||'')}" /></div>
        <div class="form-row"><label>Moves (one per line)</label>
          <textarea id="slot-moves" rows="4">${(existing.moves||[]).join('\n')}</textarea></div>
        <div class="form-row"><label>EVs (HP Atk Def SpA SpD Spe, space-separated)</label>
          <input type="text" id="slot-evs" value="${(existing.evs||[0,0,0,0,0,0]).join(' ')}" /></div>
        <div class="form-row"><label>IVs (HP Atk Def SpA SpD Spe)</label>
          <input type="text" id="slot-ivs" value="${(existing.ivs||[31,31,31,31,31,31]).join(' ')}" /></div>
        <button class="action-btn" id="confirm-slot-btn">Save Pokémon</button>
      </div>
    `);

    document.getElementById('confirm-slot-btn')?.addEventListener('click', () => {
      const pk = {
        species:  document.getElementById('slot-species').value.trim(),
        nickname: document.getElementById('slot-nickname').value.trim(),
        level:    parseInt(document.getElementById('slot-level').value)||100,
        nature:   document.getElementById('slot-nature').value,
        item:     document.getElementById('slot-item').value,
        ability:  document.getElementById('slot-ability').value.trim(),
        moves:    document.getElementById('slot-moves').value.split('\n').map(m=>m.trim()).filter(Boolean).slice(0,4),
        evs:      document.getElementById('slot-evs').value.split(/\s+/).map(Number).slice(0,6),
        ivs:      document.getElementById('slot-ivs').value.split(/\s+/).map(Number).slice(0,6),
      };
      if (!pk.species) { showToast('Species is required', 'error'); return; }
      if (!team.pokemon) team.pokemon = [];
      team.pokemon[slotIdx] = pk;
      closeModal();
      openTeamEditor(team);
    });
  }

  function openTeamMetaModal(team) {
    openModal('Edit Team', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="form-row"><label>Team Name</label>
          <input type="text" id="meta-name" value="${esc(team.name)}" /></div>
        <div class="form-row"><label>Notes</label>
          <textarea id="meta-notes" rows="3">${esc(team.notes||'')}</textarea></div>
        <button class="action-btn" id="save-meta-btn">Save</button>
      </div>
    `);
    document.getElementById('save-meta-btn')?.addEventListener('click', () => {
      team.name  = document.getElementById('meta-name').value.trim() || team.name;
      team.notes = document.getElementById('meta-notes').value.trim();
      closeModal();
      openTeamEditor(team);
    });
  }

  async function saveTeam(team) {
    try {
      const payload = {
        name:        team.name,
        owner:       team.owner,
        notes:       team.notes || '',
        pokemon:     team.pokemon || [],
        gen:         window.appState?.currentGen ?? 7,
        opponent_id: team.opponent_id || null,
      };
      if (team.id) {
        await SB.updateTeam(team.id, payload);
      } else {
        const created = await SB.createTeam(payload);
        team.id = created.id;
      }
      showToast('Team saved!', 'success');
      await loadTeams();
      openTeamEditor(team);
    } catch(e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  }

  async function deleteTeam(team) {
    if (!team.id) { showToast('Team not saved yet', 'error'); return; }
    if (!confirm(`Delete team "${team.name}"?`)) return;
    try {
      await SB.deleteTeam(team.id);
      _activeTeam = null;
      document.getElementById('team-editor').innerHTML = `<div class="placeholder-msg">Team deleted.</div>`;
      await loadTeams();
      showToast('Team deleted', 'success');
    } catch(e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  }

  function initNewTeamBtn() {
    document.getElementById('new-team-btn')?.addEventListener('click', () => {
      openModal('New Team', `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="form-row"><label>Team Name</label>
            <input type="text" id="new-team-name" placeholder="My Main Team" /></div>
          <div class="form-row"><label>Owner</label>
            <select id="new-team-owner">
              <option value="mine">My Team</option>
              <option value="opponent">Opponent's Team</option>
            </select></div>
          <div class="form-row"><label>Notes</label>
            <textarea id="new-team-notes" rows="2" placeholder="Weekly event notes..."></textarea></div>
          <button class="action-btn" id="create-team-btn">Create Team</button>
        </div>
      `);
      document.getElementById('create-team-btn')?.addEventListener('click', async () => {
        const name  = document.getElementById('new-team-name').value.trim();
        const owner = document.getElementById('new-team-owner').value;
        const notes = document.getElementById('new-team-notes').value.trim();
        if (!name) { showToast('Team name required', 'error'); return; }
        closeModal();
        const team = { name, owner, notes, pokemon: [], gen: window.appState?.currentGen ?? 7 };
        await saveTeam(team);
      });
    });
  }

  // Expose for OpponentsManager to open a team editor directly
  function openTeamById(id) {
    const team = [..._myTeams, ..._oppTeams].find(t => t.id === id);
    if (team) openTeamEditor(team);
  }

  return { loadTeams, initNewTeamBtn, openTeamById };
})();
