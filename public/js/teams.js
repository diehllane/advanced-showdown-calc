// ── teams.js ──────────────────────────────────────────────────────────────────
// Handles My Teams and Opponent Teams views.

const TeamsManager = (() => {
  let _myTeams = [];
  let _oppTeams = [];
  let _activeTeam = null;

  async function loadTeams() {
    try {
      const [mine, opp] = await Promise.all([
        fetch('/api/teams?owner=mine').then(r => r.json()),
        fetch('/api/teams?owner=opponent').then(r => r.json()),
      ]);
      _myTeams = mine;
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
          ${t.pokemon?.length ?? 0} Pokémon · Gen ${t.gen ?? 7}
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
        <button class="action-btn secondary" id="import-paste-btn">⬇ Poképaste</button>
        <button class="action-btn secondary" id="edit-team-meta-btn">Edit Name/Notes</button>
        <button class="action-btn danger" id="delete-team-btn">Delete Team</button>
      </div>
      ${team.notes ? `<p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">${esc(team.notes)}</p>` : ''}
      <div class="team-slots">${slots}</div>
      <button class="action-btn" id="save-team-btn">Save Team</button>
      <div class="coverage-chart-wrapper">
        <button class="coverage-toggle" id="coverage-toggle" aria-expanded="false">
          <span class="coverage-toggle-icon">▶</span> Type Coverage
        </button>
        <div id="coverage-chart-container" class="coverage-chart-container collapsed"></div>
      </div>
    `;

    // Bind slot actions
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
          // My Team → left panel (attacker), Opponent Team → right panel (defender)
          if (team.owner === 'mine') {
            window.attackerForm?.setState(pk);
            switchView('calc');
            showToast(`${pk.species} sent to left panel`, 'success');
          } else {
            window.defenderForm?.setState(pk);
            switchView('calc');
            showToast(`${pk.species} sent to right panel`, 'success');
          }

        }
      });
    });

    document.getElementById('save-team-btn')?.addEventListener('click', () => saveTeam(team));
    document.getElementById('delete-team-btn')?.addEventListener('click', () => deleteTeam(team));
    document.getElementById('edit-team-meta-btn')?.addEventListener('click', () => openTeamMetaModal(team));
    document.getElementById('import-paste-btn')?.addEventListener('click', () => openPokepasteModal(team));

    // Coverage chart — lazy load on first expand
    let chartLoaded = false;
    const toggleBtn = document.getElementById('coverage-toggle');
    const chartContainer = document.getElementById('coverage-chart-container');
    toggleBtn?.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      toggleBtn.querySelector('.coverage-toggle-icon').textContent = expanded ? '▶' : '▼';
      chartContainer.classList.toggle('collapsed', expanded);
      if (!expanded && !chartLoaded) {
        chartLoaded = true;
        chartContainer.innerHTML = '<div class="coverage-loading">Loading type coverage…</div>';
        renderCoverageChart(team);
      }
    });
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
        species: document.getElementById('slot-species').value.trim(),
        nickname: document.getElementById('slot-nickname').value.trim(),
        level: parseInt(document.getElementById('slot-level').value)||100,
        nature: document.getElementById('slot-nature').value,
        item: document.getElementById('slot-item').value,
        ability: document.getElementById('slot-ability').value.trim(),
        moves: document.getElementById('slot-moves').value.split('\n').map(m=>m.trim()).filter(Boolean).slice(0,4),
        evs: document.getElementById('slot-evs').value.split(/\s+/).map(Number).slice(0,6),
        ivs: document.getElementById('slot-ivs').value.split(/\s+/).map(Number).slice(0,6),
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
        <div class="form-row"><label>Notes / Opponent</label>
          <textarea id="meta-notes" rows="3">${esc(team.notes||'')}</textarea></div>
        <button class="action-btn" id="save-meta-btn">Save</button>
      </div>
    `);
    document.getElementById('save-meta-btn')?.addEventListener('click', () => {
      team.name = document.getElementById('meta-name').value.trim() || team.name;
      team.notes = document.getElementById('meta-notes').value.trim();
      closeModal();
      openTeamEditor(team);
    });
  }

  async function saveTeam(team) {
    try {
      const body = {
        name: team.name,
        owner: team.owner,
        notes: team.notes || '',
        pokemon: team.pokemon || [],
        gen: window.appState?.currentGen ?? 7,
      };
      let res;
      if (team.id) {
        res = await fetch(`/api/teams/${team.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      } else {
        res = await fetch('/api/teams', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const d = await res.json();
        team.id = d.id;
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
    await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });
    _activeTeam = null;
    document.getElementById('team-editor').innerHTML = `<div class="placeholder-msg">Team deleted.</div>`;
    await loadTeams();
    showToast('Team deleted', 'success');
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
        const name = document.getElementById('new-team-name').value.trim();
        const owner = document.getElementById('new-team-owner').value;
        const notes = document.getElementById('new-team-notes').value.trim();
        if (!name) { showToast('Team name required', 'error'); return; }
        closeModal();
        const team = { name, owner, notes, pokemon: [], gen: window.appState?.currentGen ?? 7 };
        await saveTeam(team);
      });
    });
  }

  // ── Poképaste Import ────────────────────────────────────────────────────────

  function openPokepasteModal(team) {
    openModal('Import Poképaste', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <p style="color:var(--text-dim);font-size:12px">
          Paste a team exported from Pokémon Showdown, Poképaste, or any standard team builder.
          This will replace the current team slots.
        </p>
        <div class="form-row">
          <label>Paste Team</label>
          <textarea id="pokepaste-input" rows="16" style="font-family:var(--font-mono);font-size:12px"
            placeholder="Garchomp @ Rocky Helmet&#10;Ability: Rough Skin&#10;EVs: 252 HP / 4 Atk / 252 Def&#10;Impish Nature&#10;- Stealth Rock&#10;- Earthquake&#10;..."></textarea>
        </div>
        <div id="paste-preview" style="font-size:12px;color:var(--text-dim)"></div>
        <div style="display:flex;gap:8px">
          <button class="action-btn secondary" id="preview-paste-btn">Preview</button>
          <button class="action-btn" id="confirm-paste-btn">Import Team</button>
        </div>
      </div>
    `);

    document.getElementById('preview-paste-btn')?.addEventListener('click', () => {
      const raw = document.getElementById('pokepaste-input').value;
      const parsed = parsePokepasteText(raw);
      const preview = document.getElementById('paste-preview');
      if (!parsed.length) {
        preview.innerHTML = `<span style="color:var(--accent3)">Could not parse any Pokémon. Check the format.</span>`;
        return;
      }
      preview.innerHTML = `<strong style="color:var(--success)">Parsed ${parsed.length} Pokémon:</strong><br>` +
        parsed.map(p => `• ${p.nickname ? `${p.nickname} (${p.species})` : p.species} @ ${p.item || 'No Item'} — ${p.moves.filter(Boolean).join(', ')}`).join('<br>');
    });

    document.getElementById('confirm-paste-btn')?.addEventListener('click', () => {
      const raw = document.getElementById('pokepaste-input').value;
      const parsed = parsePokepasteText(raw);
      if (!parsed.length) {
        showToast('Could not parse paste — check the format', 'error');
        return;
      }
      if (parsed.length > 6) {
        showToast('More than 6 Pokémon found — only first 6 imported', 'error');
      }
      team.pokemon = parsed.slice(0, 6);
      closeModal();
      openTeamEditor(team);
      showToast(`${parsed.length} Pokémon imported — save the team to keep them`, 'success');
    });
  }

  /**
   * Parse a Showdown/Poképaste format string into an array of Pokémon state objects.
   *
   * Format per Pokémon block (blank line separates each):
   *   Nickname (Species) @ Item       ← nickname optional
   *   Ability: Ability Name
   *   Level: 50                       ← optional, defaults to 100
   *   Shiny: Yes                      ← ignored
   *   EVs: 252 HP / 4 Atk / 252 SpD
   *   Nature Nature
   *   IVs: 0 Atk                      ← optional, unspecified = 31
   *   - Move Name
   *   - Move Name
   */
  function parsePokepasteText(raw) {
    const blocks = raw.trim().split(/\n\s*\n/).filter(b => b.trim());
    const results = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;

      const pk = {
        species: '',
        nickname: '',
        item: 'None',
        ability: '',
        level: 100,
        nature: 'Hardy',
        evs: [0, 0, 0, 0, 0, 0],
        ivs: [31, 31, 31, 31, 31, 31],
        moves: [],
        boosts: [0, 0, 0, 0, 0],
        status: '',
        gender: 'M',
      };

      // Line 1 formats (Showdown export):
      //   "Nickname (Species) @ Item"   — nicknamed, with item
      //   "Species (M) @ Item"          — gender marker, with item
      //   "Species @ Item"              — no nickname/gender
      //   "Species"                     — bare
      // Gender markers are always a single M or F inside parens.
      // Species names never consist of a single letter, so we disambiguate on that.
      const firstLine = lines[0];
      const atIdx = firstLine.indexOf(' @ ');
      const namepart = atIdx >= 0 ? firstLine.slice(0, atIdx).trim() : firstLine.trim();
      if (atIdx >= 0) pk.item = firstLine.slice(atIdx + 3).trim();

      // Check for trailing gender marker first: "Something (M)" or "Something (F)"
      const genderTrail = namepart.match(/^(.+?)\s+\(([MF])\)$/);
      if (genderTrail) {
        pk.gender = genderTrail[2];
        const inner = genderTrail[1].trim();
        // inner could be "Nickname (Species)" or just "Species"
        const nickSpecies = inner.match(/^(.+?)\s+\((.+)\)$/);
        if (nickSpecies) {
          pk.nickname = nickSpecies[1].trim();
          pk.species  = nickSpecies[2].trim();
        } else {
          pk.species = inner;
        }
      } else {
        // No gender marker — could be "Nickname (Species)" or just "Species"
        const nickSpecies = namepart.match(/^(.+?)\s+\((.+)\)$/);
        if (nickSpecies) {
          pk.nickname = nickSpecies[1].trim();
          pk.species  = nickSpecies[2].trim();
        } else {
          pk.species = namepart;
        }
      }

      // Remove form indicators appended by Showdown (e.g. "-Mega", "-Alola") — keep species clean
      // We keep them as-is; the calc engine understands them.

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('- ')) {
          pk.moves.push(line.slice(2).trim());
          continue;
        }

        // Nature in Showdown format has no colon: "Jolly Nature"
        const natureMatch = line.match(/^([A-Z][a-z]+)\s+Nature$/);
        if (natureMatch) {
          pk.nature = natureMatch[1];
          continue;
        }

        const [key, ...rest] = line.split(':');
        const val = rest.join(':').trim();

        switch (key.trim().toLowerCase()) {
          case 'ability': pk.ability = val; break;
          case 'level':   pk.level   = parseInt(val) || 100; break;
          case 'evs':     pk.evs = _parseStatLine(val, pk.evs); break;
          case 'ivs':     pk.ivs = _parseStatLine(val, pk.ivs); break;
          case 'shiny':   break; // intentionally ignored
          case 'tera type': break; // Gen 9 - ignored for now
          default: break;
        }
      }

      // Pad moves to 4
      while (pk.moves.length < 4) pk.moves.push('');

      if (pk.species) results.push(pk);
    }

    return results;
  }

  /**
   * Parse "252 HP / 4 Atk / 252 SpD" into [hp, atk, def, spa, spd, spe] array.
   * Starts from a default array (all 0 for EVs, all 31 for IVs).
   */
  function _parseStatLine(val, defaults) {
    const result = [...defaults];
    const statMap = {
      'hp': 0, 'atk': 1, 'def': 2,
      'spa': 3, 'spatk': 3, 'sp. atk': 3, 'special attack': 3,
      'spd': 4, 'spdef': 4, 'sp. def': 4, 'special defense': 4,
      'spe': 5, 'spd': 5, 'speed': 5,
    };
    // "SpD" and "Spe" disambiguation: showdown uses SpA / SpD / Spe
    const showdownMap = { 'spa': 3, 'spd': 4, 'spe': 5 };

    val.split('/').forEach(chunk => {
      const m = chunk.trim().match(/^(\d+)\s+(.+)$/);
      if (!m) return;
      const amount = parseInt(m[1]);
      const statRaw = m[2].trim().toLowerCase();

      // Try showdown abbreviations first (case-insensitive exact)
      const sdKey = m[2].trim();
      if (sdKey === 'SpA') { result[3] = amount; return; }
      if (sdKey === 'SpD') { result[4] = amount; return; }
      if (sdKey === 'Spe') { result[5] = amount; return; }

      const idx = statMap[statRaw];
      if (idx !== undefined) result[idx] = amount;
    });

    return result;
  }

  // ── Coverage Chart ──────────────────────────────────────────────────────────

  const ALL_TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting',
    'Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];

  // Defensive type chart: defType → { attackingType: multiplier }
  // Only non-1× entries listed; everything else defaults to 1.
  const TYPE_CHART = {
    Normal:   { Rock:0.5, Ghost:0, Steel:0.5, Fighting:2 },
    Fire:     { Fire:0.5, Water:2, Grass:0.5, Ice:0.5, Ground:2, Bug:0.5, Rock:2, Steel:0.5, Fairy:0.5 },
    Water:    { Fire:0.5, Water:0.5, Electric:2, Grass:2, Ice:0.5, Steel:0.5 },
    Electric: { Electric:0.5, Ground:2, Flying:0.5, Steel:0.5 },
    Grass:    { Fire:2, Water:0.5, Electric:0.5, Grass:0.5, Ice:2, Poison:2, Ground:0.5, Flying:2, Bug:2, Steel:0.5 },
    Ice:      { Fire:2, Ice:0.5, Fighting:2, Rock:2, Steel:2 },
    Fighting: { Bug:0.5, Rock:0.5, Psychic:2, Flying:2, Fairy:2, Dark:0.5 },
    Poison:   { Grass:0.5, Fighting:0.5, Poison:0.5, Ground:2, Bug:0.5, Psychic:2, Fairy:0.5 },
    Ground:   { Electric:0, Grass:2, Ice:2, Poison:0.5, Rock:0.5, Water:2 },
    Flying:   { Electric:2, Grass:0.5, Ice:2, Fighting:0.5, Ground:0, Bug:0.5, Rock:2, Steel:0.5 },
    Psychic:  { Fighting:0.5, Psychic:0.5, Bug:2, Ghost:2, Dark:2, Steel:0.5 },
    Bug:      { Fire:2, Grass:0.5, Fighting:0.5, Ground:0.5, Flying:2, Rock:2, Steel:0.5 },
    Rock:     { Normal:0.5, Fire:0.5, Water:2, Electric:0.5, Grass:2, Ice:0.5, Fighting:2, Ground:2, Flying:0.5, Steel:2 },
    Ghost:    { Normal:0, Fighting:0, Poison:0.5, Bug:0.5, Ghost:2, Dark:2 },
    Dragon:   { Fire:0.5, Water:0.5, Electric:0.5, Grass:0.5, Ice:2, Dragon:2, Steel:0.5, Fairy:2 },
    Dark:     { Fighting:2, Psychic:0, Bug:2, Ghost:0.5, Dark:0.5, Fairy:2 },
    Steel:    { Normal:0.5, Fire:2, Grass:0.5, Ice:0.5, Fighting:2, Poison:0, Ground:2, Flying:0.5, Psychic:0.5,
                Bug:0.5, Rock:0.5, Dragon:0.5, Steel:0.5, Fairy:0.5, Water:0.5, Electric:0.5 },
    Fairy:    { Fighting:0.5, Bug:0.5, Dragon:0, Dark:0.5, Poison:2, Steel:2 },
  };

  function _defMultiplier(attackingType, defTypes) {
    let mult = 1;
    for (const dt of defTypes) {
      mult *= (TYPE_CHART[dt]?.[attackingType] ?? 1);
    }
    return mult;
  }

  function _offMultiplier(moveType, defTypes) {
    // Offensive: how effective is moveType against defender with defTypes
    let mult = 1;
    for (const dt of defTypes) {
      mult *= (TYPE_CHART[dt]?.[moveType] ?? 1);
    }
    return mult;
  }

  function _multCell(mult) {
    if (mult === 0)   return { label: '0×',   cls: 'cov-immune' };
    if (mult === 0.25) return { label: '¼×',  cls: 'cov-quartx' };
    if (mult === 0.5) return { label: '½×',   cls: 'cov-halfx' };
    if (mult === 2)   return { label: '2×',   cls: 'cov-2x' };
    if (mult === 4)   return { label: '4×',   cls: 'cov-4x' };
    return { label: '—', cls: 'cov-neutral' };
  }

  async function _fetchPokemonTypes(species) {
    if (!species) return [];
    try {
      const slug = species.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/-$/, '');
      const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.types.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1));
    } catch { return []; }
  }

  async function _fetchMoveType(moveName) {
    if (!moveName) return null;
    try {
      const slug = moveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/-$/, '');
      const r = await fetch(`https://pokeapi.co/api/v2/move/${slug}`);
      if (!r.ok) return null;
      const d = await r.json();
      const t = d.type.name;
      return t.charAt(0).toUpperCase() + t.slice(1);
    } catch { return null; }
  }

  async function renderCoverageChart(team) {
    const container = document.getElementById('coverage-chart-container');
    if (!container) return;

    const filled = (team.pokemon || []).filter(pk => pk?.species);
    if (!filled.length) {
      container.innerHTML = '<div class="coverage-loading" style="color:var(--text-muted)">Add Pokémon to see coverage.</div>';
      return;
    }

    // Fetch all types in parallel
    const typeData = await Promise.all(filled.map(pk => _fetchPokemonTypes(pk.species)));

    // Fetch move types for offensive chart (up to 4 moves per mon, deduplicated)
    const allMoveNames = [...new Set(
      filled.flatMap(pk => (pk.moves || []).filter(Boolean))
    )];
    const moveTypeMap = {};
    await Promise.all(allMoveNames.map(async mv => {
      moveTypeMap[mv] = await _fetchMoveType(mv);
    }));

    // Per-pokemon move types (unique, non-null, non-Status placeholder)
    const pkMoveTypes = filled.map(pk =>
      [...new Set((pk.moves || []).filter(Boolean).map(m => moveTypeMap[m]).filter(Boolean))]
    );

    const names = filled.map(pk => pk.nickname || pk.species);

    // ── Defensive Coverage ────────────────────────────────────────────────────
    // Rows = attacking types, Cols = team members
    // Track total weak (>1) and total resist (<1) per row
    const defRows = ALL_TYPES.map(atkType => {
      const cells = typeData.map(defTypes => _defMultiplier(atkType, defTypes));
      const totalWeak = cells.filter(m => m > 1).length;
      const totalResist = cells.filter(m => m < 1 && m > 0).length;
      const totalImmune = cells.filter(m => m === 0).length;
      return { atkType, cells, totalWeak, totalResist, totalImmune };
    });

    // ── Offensive Coverage ────────────────────────────────────────────────────
    // Rows = defending types (what the team attacks into)
    // Cols = team members (best multiplier across their move types)
    const offRows = ALL_TYPES.map(defType => {
      const cells = pkMoveTypes.map(moveTypes => {
        if (!moveTypes.length) return null;
        return Math.max(...moveTypes.map(mt => _offMultiplier(mt, [defType])));
      });
      const superEff = cells.filter(m => m !== null && m > 1).length;
      const notVery  = cells.filter(m => m !== null && m < 1).length;
      return { defType, cells, superEff, notVery };
    });

    const typeColors = {
      Normal:'#A8A878',Fire:'#F08030',Water:'#6890F0',Electric:'#F8D030',
      Grass:'#78C850',Ice:'#98D8D8',Fighting:'#C03028',Poison:'#A040A0',
      Ground:'#E0C068',Flying:'#A890F0',Psychic:'#F85888',Bug:'#A8B820',
      Rock:'#B8A038',Ghost:'#705898',Dragon:'#7038F8',Dark:'#705848',
      Steel:'#B8B8D0',Fairy:'#EE99AC',
    };

    const typeBadge = t => `<span class="cov-type-badge" style="background:${typeColors[t]||'#888'}">${t}</span>`;
    const monHeader = names.map(n => `<th class="cov-mon-header" title="${esc(n)}">${esc(n.length > 8 ? n.slice(0,7)+'…' : n)}</th>`).join('');

    const defTableRows = defRows.map(({ atkType, cells, totalWeak, totalResist, totalImmune }) => {
      const tds = cells.map(m => {
        const { label, cls } = _multCell(m);
        return `<td class="cov-cell ${cls}">${label}</td>`;
      }).join('');
      const weakTd = totalWeak > 0
        ? `<td class="cov-total cov-total-weak">${totalWeak}</td>`
        : `<td class="cov-total">—</td>`;
      const resTd = (totalResist + totalImmune) > 0
        ? `<td class="cov-total cov-total-resist">${totalResist + totalImmune}</td>`
        : `<td class="cov-total">—</td>`;
      return `<tr><td class="cov-type-cell">${typeBadge(atkType)}</td>${tds}${weakTd}${resTd}</tr>`;
    }).join('');

    const offTableRows = offRows.map(({ defType, cells, superEff, notVery }) => {
      const tds = cells.map(m => {
        if (m === null) return `<td class="cov-cell cov-neutral" title="No damaging moves">–</td>`;
        const { label, cls } = _multCell(m);
        return `<td class="cov-cell ${cls}">${label}</td>`;
      }).join('');
      const seTd = superEff > 0
        ? `<td class="cov-total cov-total-weak">${superEff}</td>`
        : `<td class="cov-total">—</td>`;
      const nveTd = notVery > 0
        ? `<td class="cov-total cov-total-resist">${notVery}</td>`
        : `<td class="cov-total">—</td>`;
      return `<tr><td class="cov-type-cell">${typeBadge(defType)}</td>${tds}${seTd}${nveTd}</tr>`;
    }).join('');

    container.innerHTML = `
      <div class="coverage-section">
        <h3 class="coverage-title">Defensive Coverage
          <span class="coverage-subtitle">How each type hits your team</span>
        </h3>
        <div class="cov-table-wrap">
          <table class="cov-table">
            <thead>
              <tr>
                <th class="cov-type-cell">Attacking →</th>
                ${monHeader}
                <th class="cov-total cov-total-weak" title="Number of team members weak to this type">Weak</th>
                <th class="cov-total cov-total-resist" title="Number of team members that resist or are immune">Res/Imm</th>
              </tr>
            </thead>
            <tbody>${defTableRows}</tbody>
          </table>
        </div>
      </div>
      <div class="coverage-section">
        <h3 class="coverage-title">Offensive Coverage
          <span class="coverage-subtitle">Best effectiveness per member vs each type</span>
        </h3>
        <div class="cov-table-wrap">
          <table class="cov-table">
            <thead>
              <tr>
                <th class="cov-type-cell">Defending →</th>
                ${monHeader}
                <th class="cov-total cov-total-weak" title="Members with a super-effective move">SE</th>
                <th class="cov-total cov-total-resist" title="Members with no better than not-very-effective">NVE</th>
              </tr>
            </thead>
            <tbody>${offTableRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  return { loadTeams, initNewTeamBtn };
})();
