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
        <button class="action-btn secondary" id="pokepaste-btn">⬇ Import Pokepaste</button>
        <button class="action-btn danger" id="delete-team-btn">Delete Team</button>
      </div>
      ${team.notes ? `<p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">${esc(team.notes)}</p>` : ''}
      <div class="team-slots">${slots}</div>
      <button class="action-btn" id="save-team-btn">Save Team</button>
      <div style="margin-top:16px">
        <button class="action-btn secondary" id="coverage-toggle-btn">▶ Type Coverage</button>
        <div id="coverage-container" style="display:none;margin-top:12px"></div>
      </div>
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
    document.getElementById('pokepaste-btn')?.addEventListener('click', () => openPokepasteModal(team));
    document.getElementById('coverage-toggle-btn')?.addEventListener('click', () => toggleCoverage(team, 'coverage-toggle-btn', 'coverage-container'));
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


  // ── Pokepaste Import ────────────────────────────────────────────────────────

  function openPokepasteModal(team) {
    openModal('Import Pokepaste', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <p style="font-size:13px;color:var(--text-dim);margin:0">
          Paste a Showdown export (up to 6 Pokémon). This will replace the current team.
        </p>
        <div class="form-row">
          <label>Pokepaste / Showdown Export</label>
          <textarea id="pokepaste-input" rows="12" placeholder="Garchomp @ Rocky Helmet&#10;Ability: Rough Skin&#10;..."></textarea>
        </div>
        <button class="action-btn" id="confirm-pokepaste-btn">Import</button>
      </div>
    `);

    document.getElementById('confirm-pokepaste-btn')?.addEventListener('click', () => {
      const raw = document.getElementById('pokepaste-input').value.trim();
      if (!raw) { showToast('Paste is empty', 'error'); return; }

      const parsed = parsePokepaste(raw);
      if (!parsed.length) { showToast('Could not parse any Pokémon', 'error'); return; }

      team.pokemon = parsed;
      closeModal();
      openTeamEditor(team);
      showToast(`Imported ${parsed.length} Pokémon — save to keep`, 'success');
    });
  }

  function parsePokepaste(text) {
    // Split on blank lines to get individual pokemon blocks
    const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    return blocks.slice(0, 6).map(parseOneBlock).filter(Boolean);
  }

  function parseOneBlock(block) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;

    let species = '', nickname = '', item = '', gender = '';

    // First line: "Nickname (Species) (Gender) @ Item"
    // or "Species (Gender) @ Item"
    // or "Species @ Item"
    const firstLine = lines[0];
    const atIdx = firstLine.indexOf(' @ ');
    const headerPart = atIdx >= 0 ? firstLine.slice(0, atIdx) : firstLine;
    if (atIdx >= 0) item = firstLine.slice(atIdx + 3).trim();

    // Strip trailing gender marker from headerPart
    const genderMatch = headerPart.match(/^(.*?)\s+\((M|F)\)\s*$/);
    const headerNoGender = genderMatch ? genderMatch[1].trim() : headerPart.trim();
    if (genderMatch) gender = genderMatch[2];

    // Check for nickname (Species) pattern
    const nicknameMatch = headerNoGender.match(/^(.+?)\s+\(([^)]+)\)$/);
    if (nicknameMatch) {
      nickname = nicknameMatch[1].trim();
      species  = nicknameMatch[2].trim();
    } else {
      species = headerNoGender.trim();
    }

    if (!species) return null;

    let ability = '', level = 100, nature = 'Hardy';
    const moves = [], evs = [0,0,0,0,0,0], ivs = [31,31,31,31,31,31];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Nature (standalone line: "Jolly Nature")
      const natureAlone = line.match(/^([A-Z][a-z]+)\s+Nature$/);
      if (natureAlone) { nature = natureAlone[1]; continue; }

      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) {
        // Move lines start with -
        if (line.startsWith('- ') || line.startsWith('-')) {
          moves.push(line.replace(/^-\s*/, '').trim());
        }
        continue;
      }

      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (key === 'Ability')  { ability = val; continue; }
      if (key === 'Level')    { level = parseInt(val) || 100; continue; }

      if (key === 'EVs') {
        // "252 Atk / 252 Spe / 4 HP"
        val.split('/').forEach(part => {
          const m = part.trim().match(/^(\d+)\s+(.+)$/);
          if (!m) return;
          const n = parseInt(m[1]);
          const stat = m[2].trim().toLowerCase();
          if (stat === 'hp')  evs[0] = n;
          else if (stat === 'atk') evs[1] = n;
          else if (stat === 'def') evs[2] = n;
          else if (stat === 'spa' || stat === 'spatk') evs[3] = n;
          else if (stat === 'spd' || stat === 'spdef') evs[4] = n;
          else if (stat === 'spe' || stat === 'spd' && part.includes('Spe')) evs[5] = n;
        });
        // Spe is ambiguous with SpD so handle directly
        val.split('/').forEach(part => {
          const m = part.trim().match(/^(\d+)\s+(.+)$/);
          if (!m) return;
          const raw = m[2].trim();
          if (raw === 'Spe') evs[5] = parseInt(m[1]);
        });
        continue;
      }

      if (key === 'IVs') {
        val.split('/').forEach(part => {
          const m = part.trim().match(/^(\d+)\s+(.+)$/);
          if (!m) return;
          const n = parseInt(m[1]);
          const stat = m[2].trim();
          if (stat === 'HP')  ivs[0] = n;
          else if (stat === 'Atk') ivs[1] = n;
          else if (stat === 'Def') ivs[2] = n;
          else if (stat === 'SpA') ivs[3] = n;
          else if (stat === 'SpD') ivs[4] = n;
          else if (stat === 'Spe') ivs[5] = n;
        });
        continue;
      }

      // Nature on same line as something else (rare)
      if (key === 'Nature') { nature = val.replace(' Nature','').trim(); continue; }

      // Moves
      if (line.startsWith('- ') || line.startsWith('-')) {
        moves.push(line.replace(/^-\s*/, '').trim());
      }
    }

    return {
      species,
      nickname: nickname || species,
      item:     item || 'None',
      ability,
      level,
      nature,
      gender:   gender || 'M',
      moves:    moves.slice(0, 4),
      evs,
      ivs,
      boosts:   [0,0,0,0,0,0],
      status:   '',
    };
  }


  // ── Type Coverage Charts ─────────────────────────────────────────────────────

  const ALL_TYPES = [
    'Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison',
    'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'
  ];

  const TYPE_CHART = {
    Normal:   { Ghost:0, Rock:0.5, Steel:0.5 },
    Fire:     { Fire:0.5, Water:0.5, Rock:0.5, Dragon:0.5, Grass:2, Ice:2, Bug:2, Steel:2 },
    Water:    { Water:0.5, Grass:0.5, Dragon:0.5, Fire:2, Ground:2, Rock:2 },
    Electric: { Electric:0.5, Grass:0.5, Dragon:0.5, Ground:0, Flying:2, Water:2 },
    Grass:    { Fire:0.5, Grass:0.5, Poison:0.5, Flying:0.5, Bug:0.5, Dragon:0.5, Steel:0.5, Water:2, Ground:2, Rock:2 },
    Ice:      { Water:0.5, Ice:0.5, Fire:0.5, Steel:0.5, Grass:2, Ground:2, Flying:2, Dragon:2 },
    Fighting: { Poison:0.5, Flying:0.5, Psychic:0.5, Bug:0.5, Ghost:0, Normal:2, Ice:2, Rock:2, Dark:2, Steel:2 },
    Poison:   { Poison:0.5, Ground:0.5, Rock:0.5, Ghost:0.5, Steel:0, Grass:2, Fairy:2 },
    Ground:   { Grass:0.5, Bug:0.5, Flying:0, Fire:2, Electric:2, Poison:2, Rock:2, Steel:2 },
    Flying:   { Electric:0.5, Rock:0.5, Steel:0.5, Grass:2, Fighting:2, Bug:2 },
    Psychic:  { Psychic:0.5, Steel:0.5, Dark:0, Fighting:2, Poison:2 },
    Bug:      { Fire:0.5, Flying:0.5, Fighting:0.5, Ghost:0.5, Steel:0.5, Fairy:0.5, Grass:2, Psychic:2, Dark:2 },
    Rock:     { Fighting:0.5, Ground:0.5, Steel:0.5, Fire:2, Ice:2, Flying:2, Bug:2 },
    Ghost:    { Normal:0, Dark:0.5, Ghost:2, Psychic:2 },
    Dragon:   { Steel:0.5, Dragon:2, Fairy:0 },
    Dark:     { Fighting:0.5, Dark:0.5, Fairy:0.5, Ghost:2, Psychic:2 },
    Steel:    { Fire:0.5, Water:0.5, Electric:0.5, Steel:0.5, Ice:2, Rock:2, Fairy:2 },
    Fairy:    { Fire:0.5, Poison:0.5, Steel:0.5, Fighting:2, Dragon:2, Dark:2 },
  };

  function getMultiplier(atkType, defTypes) {
    let m = 1;
    const chart = TYPE_CHART[atkType] || {};
    defTypes.forEach(dt => { m *= chart[dt] ?? 1; });
    return m;
  }

  function multCell(m) {
    if (m === 0)    return { text:'0×',   cls:'cov-immune' };
    if (m >= 4)     return { text:'4×',   cls:'cov-se' };
    if (m >= 2)     return { text:'2×',   cls:'cov-se' };
    if (m <= 0.25)  return { text:'¼×',   cls:'cov-nve' };
    if (m < 1)      return { text:'½×',   cls:'cov-nve' };
    return           { text:'1×',   cls:'' };
  }

  async function renderCoverageChart(team, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<p style="color:var(--text-muted);font-size:12px">Loading type data…</p>';

    const pokemon = (team.pokemon || []).filter(p => p?.species);
    if (!pokemon.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No Pokémon in team.</p>'; return; }

    // Fetch types for each member
    const memberTypes = await Promise.all(pokemon.map(async pk => {
      try {
        const data = await getPokemonBaseData(pk.species);
        return { name: pk.species, types: data?.types || [] };
      } catch { return { name: pk.species, types: [] }; }
    }));

    // Fetch move types for offensive coverage
    const memberMovetypes = await Promise.all(pokemon.map(async pk => {
      const moveTypes = new Set();
      for (const mv of (pk.moves || []).filter(Boolean)) {
        try {
          const slug = mv.toLowerCase().replace(/[^a-z0-9]+/g,'-');
          const d = await fetchPokeAPI(`/move/${slug}`);
          if (d?.type?.name) moveTypes.add(d.type.name.charAt(0).toUpperCase() + d.type.name.slice(1));
        } catch {}
      }
      return [...moveTypes];
    }));

    // ── Defensive Coverage Table ──────────────────────────────────────────────
    const defHeader = `<tr><th>Atk Type</th>${memberTypes.map(m=>`<th style="font-size:11px">${esc(m.name)}</th>`).join('')}<th>Weak</th><th>Res/Imm</th></tr>`;
    const defRows = ALL_TYPES.map(atkType => {
      let weakCount = 0, resCount = 0;
      const cells = memberTypes.map(m => {
        const mult = getMultiplier(atkType, m.types);
        const { text, cls } = multCell(mult);
        if (mult >= 2) weakCount++;
        if (mult <= 0.5) resCount++;
        return `<td class="${cls}">${text}</td>`;
      }).join('');
      return `<tr><td class="cov-type-label">${atkType}</td>${cells}<td class="cov-count cov-weak">${weakCount||''}</td><td class="cov-count cov-res">${resCount||''}</td></tr>`;
    }).join('');

    // ── Offensive Coverage Table ──────────────────────────────────────────────
    const offHeader = `<tr><th>Def Type</th>${memberTypes.map(m=>`<th style="font-size:11px">${esc(m.name)}</th>`).join('')}<th>SE</th><th>NVE</th></tr>`;
    const offRows = ALL_TYPES.map(defType => {
      let seCount = 0, nveCount = 0;
      const cells = memberMovetypes.map(moveTypes => {
        let best = 0;
        moveTypes.forEach(mt => { best = Math.max(best, getMultiplier(mt, [defType])); });
        if (!moveTypes.length) return '<td style="opacity:.3">—</td>';
        const { text, cls } = multCell(best);
        if (best >= 2) seCount++;
        if (best < 1 && best > 0) nveCount++;
        return `<td class="${cls}">${text}</td>`;
      }).join('');
      return `<tr><td class="cov-type-label">${defType}</td>${cells}<td class="cov-count cov-se">${seCount||''}</td><td class="cov-count cov-nve">${nveCount||''}</td></tr>`;
    }).join('');

    el.innerHTML = `
      <div class="coverage-section">
        <h4 class="coverage-title">Defensive Coverage</h4>
        <div class="coverage-scroll">
          <table class="coverage-table"><thead>${defHeader}</thead><tbody>${defRows}</tbody></table>
        </div>
        <h4 class="coverage-title" style="margin-top:16px">Offensive Coverage</h4>
        <div class="coverage-scroll">
          <table class="coverage-table"><thead>${offHeader}</thead><tbody>${offRows}</tbody></table>
        </div>
      </div>
    `;
  }

  function toggleCoverage(team, btnId, containerId) {
    const btn = document.getElementById(btnId);
    const container = document.getElementById(containerId);
    if (!btn || !container) return;
    const isOpen = container.style.display !== 'none';
    if (isOpen) {
      container.style.display = 'none';
      btn.textContent = '▶ Type Coverage';
    } else {
      container.style.display = 'block';
      btn.textContent = '▼ Type Coverage';
      if (!container.dataset.loaded) {
        container.dataset.loaded = '1';
        renderCoverageChart(team, containerId);
      }
    }
  }

  // Expose for OpponentsManager to open a team editor directly
  function openTeamById(id) {
    const team = [..._myTeams, ..._oppTeams].find(t => t.id === id);
    if (team) openTeamEditor(team);
  }

  function reset() {
    _myTeams    = [];
    _oppTeams   = [];
    _activeTeam = null;
    // Clear sidebar lists and editor
    const myList  = document.getElementById('my-teams-list');
    const oppList = document.getElementById('opp-teams-list');
    const editor  = document.getElementById('team-editor');
    if (myList)  myList.innerHTML  = '';
    if (oppList) oppList.innerHTML = '';
    if (editor)  editor.innerHTML  = '<div class="placeholder-msg">Select a team from the sidebar or create a new one.</div>';
  }

  return { loadTeams, initNewTeamBtn, openTeamById, reset };
})();
