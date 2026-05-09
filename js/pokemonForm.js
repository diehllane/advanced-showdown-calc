// ── pokemonForm.js ───────────────────────────────────────────────────────────
// Builds and manages the attacker/defender Pokémon input forms.

class PokemonForm {
  constructor(containerId, role) {
    this.container = document.getElementById(containerId);
    this.role = role; // 'attacker' | 'defender'
    this.currentGen = 7;
    this.speciesData = null; // base stats + types from PokeAPI
    this.availableMoves = []; // move slugs for current species+gen
    this.state = this._defaultState();
    this.render();
  }

  _defaultState() {
    return {
      species: '',
      level: 50,
      gender: 'M',
      item: 'None',
      ability: '',
      nature: 'Hardy',
      ivs: [31,31,31,31,31,31],
      evs: [0,0,0,0,0,0],
      boosts: [0,0,0,0,0,0],
      status: '',
      moves: ['','','',''],
      // battle flags
      isCriticalHit: false,
      isFlashFireActive: false,
      isPumpedUp: false,
      isMicrobiomeActive: false,
      isMinimizeActive: false,
      isSwitchedIn: false,
      isSwitchingIn: false,
      curHP: null, // null = full HP
    };
  }

  setGen(gen) {
    this.currentGen = gen;
    this.state.moves = ['','','',''];
    this.speciesData = null;
    this.availableMoves = [];
    if (this.state.species) {
      this._loadSpeciesData(this.state.species);
    }
    this.render();
  }

  getState() { return this.state; }

  setState(s) {
    this.state = Object.assign(this._defaultState(), s);
    // Normalise move names to slug format so they match the dropdown values
    // "Hidden Power [Fire]" -> "hidden-power-fire"
    this.state.moves = (this.state.moves || []).map(m => {
      if (!m) return '';
      return m.toLowerCase()
        .replace(/\[|\]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/-$/, '');
    });
    this.render();
    if (this.state.species) this._loadSpeciesData(this.state.species);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const s = this.state;
    this.container.innerHTML = `
      ${this._renderSpeciesRow()}
      ${this._renderLevelGenderRow()}
      ${this._renderNatureItemRow()}
      ${this._renderAbilityRow()}
      ${this._renderStats()}
      ${this._renderBoosts()}
      ${this._renderStatus()}
      ${this._renderBattleFlags()}
      ${this._renderMoves()}
    `;
    this._bindEvents();
  }

  _renderSpeciesRow() {
    const sprite = this.speciesData?.sprite
      ? `<img src="${this.speciesData.sprite}" class="pokemon-sprite" alt="" />`
      : '';
    const types = (this.speciesData?.types || [])
      .map(t => `<span class="type-badge type-${t.toLowerCase()}">${t}</span>`)
      .join(' ');
    return `
      <div class="form-row">
        <label>Pokémon</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="${this.role}-species" value="${s(this.state.species)}"
            placeholder="e.g. Garchomp" autocomplete="off" list="${this.role}-species-list" />
          <datalist id="${this.role}-species-list"></datalist>
        </div>
        ${sprite || types ? `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">${sprite}${types}</div>` : ''}
      </div>
    `;
  }

  _renderLevelGenderRow() {
    return `
      <div class="form-2col">
        <div class="form-row">
          <label>Level</label>
          <input type="number" id="${this.role}-level" value="${this.state.level}" min="1" max="100" />
        </div>
        <div class="form-row">
          <label>Gender</label>
          <select id="${this.role}-gender">
            <option value="M" ${this.state.gender==='M'?'selected':''}>Male ♂</option>
            <option value="F" ${this.state.gender==='F'?'selected':''}>Female ♀</option>
            <option value="N" ${this.state.gender==='N'?'selected':''}>Genderless</option>
          </select>
        </div>
      </div>
    `;
  }

  _renderNatureItemRow() {
    const natureOpts = NATURES.map(n =>
      `<option value="${n}" ${this.state.nature===n?'selected':''}>${n}</option>`
    ).join('');
    const itemOpts = COMMON_ITEMS.map(i =>
      `<option value="${i}" ${this.state.item===i?'selected':''}>${i}</option>`
    ).join('');
    return `
      <div class="form-2col">
        <div class="form-row">
          <label>Nature</label>
          <select id="${this.role}-nature">${natureOpts}</select>
        </div>
        <div class="form-row">
          <label>Item</label>
          <select id="${this.role}-item">${itemOpts}</select>
        </div>
      </div>
    `;
  }

  _renderAbilityRow() {
    return `
      <div class="form-row">
        <label>Ability</label>
        <input type="text" id="${this.role}-ability" value="${s(this.state.ability)}"
          placeholder="e.g. Rough Skin" list="${this.role}-ability-list" />
        <datalist id="${this.role}-ability-list"></datalist>
      </div>
    `;
  }

  _renderStats() {
    const nat = NATURE_EFFECTS[this.state.nature];
    const rows = STAT_NAMES.map((name, i) => {
      const isBoostStat = nat && nat[0] === i;
      const isReduceStat = nat && nat[1] === i;
      const cls = isBoostStat ? 'nat-up' : isReduceStat ? 'nat-down' : '';
      const base = this.speciesData?.stats ? this._baseStatForIndex(i) : '–';
      // EV bar width
      const evPct = Math.round((this.state.evs[i] / 252) * 100);
      return `
        <div class="stat-row">
          <span class="stat-label ${cls}">${name}</span>
          <input type="number" id="${this.role}-iv-${i}" value="${this.state.ivs[i]}"
            min="0" max="31" class="stat-input iv-input" data-stat="${i}" />
          <input type="number" id="${this.role}-ev-${i}" value="${this.state.evs[i]}"
            min="0" max="252" class="stat-input ev-input" data-stat="${i}" />
          <div class="stat-bar-wrap">
            <div class="stat-bar" style="width:${evPct}%"></div>
          </div>
          <span class="stat-label" style="text-align:right;color:var(--text-muted)">${base}</span>
          <input type="number" id="${this.role}-boost-${i > 0 ? i-1 : ''}" 
            ${i===0?'disabled':''} 
            value="${i > 0 ? this.state.boosts[i-1] : ''}"
            min="-6" max="6" class="stat-input boost-input" data-stat="${i}"
            placeholder="${i===0?'HP':'+/-'}" />
        </div>
      `;
    });
    return `
      <div class="form-row" style="gap:6px">
        <div style="display:grid;grid-template-columns:40px 64px 64px 1fr 50px 58px;gap:4px;margin-bottom:3px;">
          <span class="field-label">Stat</span>
          <span class="field-label">IV</span>
          <span class="field-label">EV</span>
          <span></span>
          <span class="field-label">Base</span>
          <span class="field-label">±</span>
        </div>
        ${rows.join('')}
      </div>
    `;
  }

  _baseStatForIndex(i) {
    const keys = ['hp','attack','defense','special-attack','special-defense','speed'];
    return this.speciesData?.stats?.[keys[i]] ?? '–';
  }

  _renderBoosts() { return ''; } // Boosts are inline in stat rows

  _renderStatus() {
    const statuses = ['','Burn','Paralysis','Poison','Toxic','Sleep','Freeze'];
    const opts = statuses.map(st =>
      `<option value="${st}" ${this.state.status===st?'selected':''}>${st||'None'}</option>`
    ).join('');
    return `
      <div class="form-row">
        <label>Status</label>
        <select id="${this.role}-status">${opts}</select>
      </div>
    `;
  }

  _renderBattleFlags() {
    const flags = [
      { id: 'isCriticalHit', label: 'Critical Hit' },
      { id: 'isFlashFireActive', label: 'Flash Fire' },
      { id: 'isMicrobiomeActive', label: 'Microbiome (Gen9)' },
      { id: 'isSwitchingOut', label: 'Switching Out (Pursuit)' },
      { id: 'isSwitchingIn',  label: 'Switching In (apply hazards)' },
    ];
    return `
      <div class="form-row">
        <label>Battle Flags</label>
        <div class="hazard-group">
          ${flags.map(f => `
            <label class="check-label">
              <input type="checkbox" id="${this.role}-${f.id}" ${this.state[f.id]?'checked':''}>
              ${f.label}
            </label>
          `).join('')}
          <div class="form-row" style="margin-top:4px">
            <label>Current HP %</label>
            <input type="number" id="${this.role}-curhp" value="${this.state.curHP ?? 100}" min="1" max="100" />
          </div>
        </div>
      </div>
    `;
  }

  _renderMoves() {
    const moves = this.state.moves.map((mv, i) => {
      // Match hidden-power-fire etc. against hidden-power in the available moves list
      const mvBase = mv.startsWith('hidden-power-') ? 'hidden-power' : mv;
      const opts = this.availableMoves.map(m =>
        `<option value="${m}" ${m===mv || m===mvBase?'selected':''}>${_moveName(m)}</option>`
      ).join('');
      return `
        <div class="move-select-row">
          <select id="${this.role}-move-${i}" class="move-sel" data-idx="${i}">
            <option value="">— Move ${i+1} —</option>
            ${opts}
          </select>
          <button class="use-move-btn" data-idx="${i}">Use</button>
        </div>
      `;
    }).join('');
    return `
      <div class="form-row">
        <label>Moves</label>
        <div class="moves-list">${moves}</div>
      </div>
    `;
  }

  // ── Event Binding ─────────────────────────────────────────────────────────

  _bindEvents() {
    const get = id => document.getElementById(id);
    const r = this.role;

    // Species
    const speciesInput = get(`${r}-species`);
    if (speciesInput) {
      speciesInput.addEventListener('change', async () => {
        this.state.species = speciesInput.value.trim();
        await this._loadSpeciesData(this.state.species);
        this.render();
      });
      speciesInput.addEventListener('input', () => {
        this._suggestSpecies(speciesInput.value);
      });
    }

    // Simple string/number fields
    const bind = (id, key, parser) => {
      const el = get(id);
      if (el) el.addEventListener('change', () => {
        this.state[key] = parser ? parser(el.value) : el.value;
        if (key === 'nature') this.render(); // re-render for colour highlights
      });
    };
    bind(`${r}-level`, 'level', parseInt);
    bind(`${r}-gender`, 'gender');
    bind(`${r}-nature`, 'nature');
    bind(`${r}-item`, 'item');
    bind(`${r}-ability`, 'ability');
    bind(`${r}-status`, 'status');

    // IVs / EVs / Boosts
    this.container.querySelectorAll('.iv-input').forEach(el => {
      el.addEventListener('change', () => {
        this.state.ivs[+el.dataset.stat] = parseInt(el.value) || 0;
      });
    });
    this.container.querySelectorAll('.ev-input').forEach(el => {
      el.addEventListener('change', () => {
        this.state.evs[+el.dataset.stat] = parseInt(el.value) || 0;
        // update bar
        const bar = el.closest('.stat-row')?.querySelector('.stat-bar');
        if (bar) bar.style.width = Math.round((+el.value/252)*100) + '%';
      });
    });
    this.container.querySelectorAll('.boost-input').forEach(el => {
      el.addEventListener('change', () => {
        const statIdx = +el.dataset.stat;
        if (statIdx > 0) this.state.boosts[statIdx - 1] = parseInt(el.value) || 0;
      });
    });

    // Current HP
    const curHPEl = get(`${r}-curhp`);
    if (curHPEl) curHPEl.addEventListener('change', () => {
      this.state.curHP = parseInt(curHPEl.value) || 100;
    });

    // Flags
    ['isCriticalHit','isFlashFireActive','isMicrobiomeActive','isSwitchingOut','isSwitchingIn'].forEach(flag => {
      const el = get(`${r}-${flag}`);
      if (el) el.addEventListener('change', () => { this.state[flag] = el.checked; });
    });

    // Move selects
    this.container.querySelectorAll('.move-sel').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = +sel.dataset.idx;
        this.state.moves[idx] = sel.value;
        // If this is the active move slot, trigger a re-calc
        if (window.appState && window.appState.activeMoveSlot === idx) {
          window.appCalc?.scheduleCalc();
        }
      });
    });

    // "Use" move buttons
    this.container.querySelectorAll('.use-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.idx;
        const moveSlug = this.state.moves[idx];
        if (!moveSlug) return;
        if (!window.appState) window.appState = {};
        window.appState.activeMoveSlot = idx;
        window.appState.activeMoveRole = this.role;
        window.appState[`${this.role}ActiveMove`] = moveSlug;
        window.appCalc?.scheduleCalc();
        // Show learn method and type coverage
        window.appCalc?.showLearnMethod(this.state.species, moveSlug, this.currentGen);
        window.appCalc?.showMoveTypeCoverage(moveSlug, window.defenderForm?.getState());
      });
    });
  }

  async _loadSpeciesData(species) {
    if (!species) return;
    this.speciesData = await getPokemonBaseData(species);
    this.availableMoves = await getPokemonMoves(species, this.currentGen);
    // Sort: alphabetical but by display name
    this.availableMoves.sort();
    this.render();
  }

  async _suggestSpecies(partial) {
    // Use PokeAPI's species list (first 1025 loaded once)
    if (!window._allSpecies) {
      try {
        const r = await fetch(`${POKEAPI}/pokemon?limit=1025`);
        const d = await r.json();
        window._allSpecies = d.results.map(p => p.name);
      } catch(e) { return; }
    }
    const q = partial.toLowerCase();
    const matches = window._allSpecies.filter(n => n.startsWith(q)).slice(0,20);
    const list = document.getElementById(`${this.role}-species-list`);
    if (list) {
      list.innerHTML = matches.map(m => `<option value="${_moveName(m)}">`).join('');
    }
  }
}

// Utility: convert slug to display name
function _moveName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function s(val) { return (val ?? '').toString().replace(/"/g, '&quot;'); }
