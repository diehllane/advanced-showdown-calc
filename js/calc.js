// ── calc.js ──────────────────────────────────────────────────────────────────
// Wraps @smogon/calc (window.calc from the UMD build) to perform damage
// calculations and update the results panel.

// ── PVE Map Boost Definitions ─────────────────────────────────────────────────
// Multipliers applied to the computed stat value before passing to smogon/calc.
// Keys match the <select id="map-boost-select"> option values.
// 'left' = player side (Left panel), 'right' = wild side (Right panel).
// Stats: { hp, atk, def, spa, spd, spe } — omitted keys = no boost (1×).
const MAP_BOOSTS = {
  'none': {
    left:  {},
    right: {},
  },
  'ancient-dungeon': {
    // All stats except Speed boosted 1.65× for both sides
    left:  { atk: 1.65, def: 1.65, spa: 1.65, spd: 1.65 },
    right: { atk: 1.65, def: 1.65, spa: 1.65, spd: 1.65 },
  },
  'battle-zone': {
    // All stats except Speed boosted 1.5× for both sides
    left:  { atk: 1.5, def: 1.5, spa: 1.5, spd: 1.5 },
    right: { atk: 1.5, def: 1.5, spa: 1.5, spd: 1.5 },
  },
  'legendary': {
    // Player (left) gets large offensive/defensive buffs
    left:  { atk: 2.5, def: 2.0, spa: 2.5, spd: 2.0, spe: 2.0 },
    // Wild (right) gets HP-heavy defensive buffs with moderate offensive
    right: { hp: 2.0, atk: 1.33, def: 2.0, spa: 1.33, spd: 2.0 },
  },
};

// Maps that boost non-HP stats (used to gate Elite non-HP boost suppression)
const STAT_BOOSTING_MAPS = new Set(['ancient-dungeon', 'battle-zone', 'legendary']);

class CalcEngine {
  constructor() {
    this._calcTimer = null;
  }

  scheduleCalc() {
    clearTimeout(this._calcTimer);
    this._calcTimer = setTimeout(() => this.runCalc(), 100);
  }

  runCalc() {
    const result = document.getElementById('calc-result');
    if (!result) return;

    try {
      const { Generations, Pokemon, Move, Field, Side, calculate } = window.calc;

      const gen = window.appState?.currentGen ?? 7;
      const attState = window.attackerForm?.getState();
      const defState = window.defenderForm?.getState();

      if (!attState?.species || !defState?.species) {
        result.innerHTML = `<div class="result-placeholder">Enter both Pokémon species to calculate.</div>`;
        return;
      }

      const activeRole = window.appState?.activeMoveRole ?? 'attacker';
      const activeMoveSlug = window.appState?.[`${activeRole}ActiveMove`];
      if (!activeMoveSlug) {
        result.innerHTML = `<div class="result-placeholder">Press "Use" on a move to calculate damage.</div>`;
        return;
      }

      // Determine attacker/defender based on which panel pressed Use
      const atkState = activeRole === 'attacker' ? attState : defState;
      const defStateCalc = activeRole === 'attacker' ? defState : attState;
      const dirLabel = activeRole === 'attacker' ? 'Left → Right' : 'Right → Left';

      // Map boost / Elite context — always Left = player, Right = wild
      const mapBoostKey = document.getElementById('map-boost-select')?.value ?? 'none';
      const isEliteRight = document.getElementById('right-elite')?.checked ?? false;

      const genObj = Generations.get(gen);

      // Build Pokémon objects — Left panel always gets 'left' boosts, Right always 'right'
      const leftForm  = window.attackerForm;
      const rightForm = window.defenderForm;

      // attacker/defender depend on who pressed Use, but stat boosts are positional (L/R)
      const atkIsLeft = activeRole === 'attacker';
      const atkBoostSide = atkIsLeft ? 'left' : 'right';
      const defBoostSide = atkIsLeft ? 'right' : 'left';
      const atkIsElite  = atkIsLeft ? false : isEliteRight;
      const defIsElite  = atkIsLeft ? isEliteRight : false;

      const attacker = this._buildPokemon(genObj, atkState, mapBoostKey, atkBoostSide, atkIsElite, atkIsLeft ? leftForm : rightForm);
      const defender = this._buildPokemon(genObj, defStateCalc, mapBoostKey, defBoostSide, defIsElite, atkIsLeft ? rightForm : leftForm);

      // Track effective current HP in our own variables — don't rely on
      // defender.curHP persisting through calculate() on the smogon object.
      const atkMaxHP = attacker.maxHP();
      const defMaxHP = defender.maxHP();

      let atkCurHP = atkState.curHP && atkState.curHP < 100
        ? Math.floor(atkMaxHP * atkState.curHP / 100)
        : atkMaxHP;
      let defCurHP = defStateCalc.curHP && defStateCalc.curHP < 100
        ? Math.floor(defMaxHP * defStateCalc.curHP / 100)
        : defMaxHP;

      // Hazard prefix tracks which physical panel the pokemon is on (left=att, right=haz),
      // independent of which panel pressed Use. Form reference tracks the same.
      const atkForm   = atkIsLeft ? leftForm : rightForm;
      const defForm   = atkIsLeft ? rightForm : leftForm;
      const atkPrefix = atkIsLeft ? 'att' : 'haz';
      const defPrefix = atkIsLeft ? 'haz' : 'att';

      if (atkState.isSwitchingIn) {
        const chip = this._calcHazardChip(attacker, atkMaxHP, atkPrefix, atkForm);
        atkCurHP = Math.max(1, atkCurHP - chip);
      }
      if (defStateCalc.isSwitchingIn) {
        const chip = this._calcHazardChip(defender, defMaxHP, defPrefix, defForm);
        defCurHP = Math.max(1, defCurHP - chip);
      }

      // Set on the smogon object too (may or may not persist through calculate)
      attacker.curHP = atkCurHP;
      defender.curHP = defCurHP;

      const moveName = _moveName(activeMoveSlug);
      const move = new Move(genObj, moveName, {
        isCrit: atkState.isCriticalHit,
      });

      // Build field — pass switching-in state so hazards only affect desc when relevant
      const field = this._buildField(gen, atkState, defStateCalc);

      const calcResult = calculate(genObj, attacker, defender, move, field);

      this._renderResult(result, calcResult, attacker, defender, atkState, defStateCalc, gen, dirLabel, defCurHP, mapBoostKey, isEliteRight);
    } catch (e) {
      result.innerHTML = `<div class="result-placeholder" style="color:var(--accent3)">
        Calc error: ${e.message}<br><small>Check species names and move names match the selected generation.</small>
      </div>`;
      console.error('Calc error:', e);
    }
  }

  // ── Stat boost helpers ────────────────────────────────────────────────────

  /**
   * Returns the map stat multipliers for a given side ('left'|'right') and map key.
   * Merges Elite on top if applicable.
   *
   * Elite rules (right side only):
   *   - HP always gets ×1.3 on top of any map HP multiplier.
   *   - Non-HP stats get ×1.3 ONLY if the map does NOT already boost stats
   *     (i.e. not Ancient Dungeon, Battle Zone, or Legendary Maps).
   */
  _resolveStatMultipliers(mapKey, boostSide, isElite) {
    const mapMults = MAP_BOOSTS[mapKey]?.[boostSide] ?? {};
    const mults = { ...mapMults };

    if (isElite) {
      const mapBoostsStats = STAT_BOOSTING_MAPS.has(mapKey);
      // HP always boosted by Elite
      mults.hp = (mults.hp ?? 1) * 1.3;
      // Non-HP only boosted by Elite when not already in a stat-boosting map
      if (!mapBoostsStats) {
        for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) {
          mults[stat] = (mults[stat] ?? 1) * 1.3;
        }
      }
    }

    return mults;
  }

  /**
   * Compute a single boosted stat value.
   * We calculate the raw stat from base/IV/EV/nature/level, apply the multiplier,
   * then back-solve the EV that would produce that same value so smogon/calc's
   * internal stat engine arrives at the right number. This is cleaner than
   * overrides (which are undocumented in v0.9.0) and avoids floating-point drift
   * from post-multiply on the damage rolls.
   *
   * Actually, the cleanest approach for v0.9.0 is to pass the final boosted value
   * via the `overrides` option on the Pokemon constructor — it IS supported as an
   * undocumented internal property in the calc engine. We'll use it directly.
   *
   * stat:  'hp'|'atk'|'def'|'spa'|'spd'|'spe'
   * base:  base stat integer
   * iv/ev: integers
   * lvl:   integer
   * natMod: 1.1 | 0.9 | 1.0
   */
  _computeRawStat(statKey, base, iv, ev, lvl, natMod) {
    if (statKey === 'hp') {
      return Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100 + lvl + 10);
    }
    return Math.floor(Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100 + 5) * natMod);
  }

  _buildPokemon(genObj, state, mapKey, boostSide, isElite, form) {
    const { Pokemon } = window.calc;

    const [hp, atk, def, spa, spd, spe] = state.evs;
    const [hpIV, atkIV, defIV, spaIV, spdIV, speIV] = state.ivs;
    const [atkB, defB, spaB, spdB, speB] = state.boosts;

    const opts = {
      level: state.level,
      nature: state.nature,
      evs: { hp, atk, def, spa, spd, spe },
      ivs: { hp: hpIV, atk: atkIV, def: defIV, spa: spaIV, spd: spdIV, spe: speIV },
      boosts: { atk: atkB||0, def: defB||0, spa: spaB||0, spd: spdB||0, spe: speB||0 },
    };

    if (state.item && state.item !== 'None') opts.item = state.item;
    if (state.ability) opts.ability = state.ability;
    if (state.status) opts.status = state.status;
    if (state.gender && state.gender !== 'N') opts.gender = state.gender;

    // Battle flags
    if (state.isFlashFireActive) opts.abilityOn = true;
    if (state.isUnburdenActive) {
      delete opts.item;
      opts.abilityOn = true;
    }

    // ── Apply PVE map / Elite stat multipliers ──────────────────────────────
    // HP boosts: smogon's maxHP() uses its own internal formula and ignores
    // opts.overrides.hp entirely. We back-solve the EV that makes smogon's HP
    // formula produce the boosted value, then pass it via opts.evs.hp.
    //
    // Non-HP boosts: opts.overrides works for offensive/defensive stats in
    // v0.9.0 because those stats are read from _stats which overrides patches.
    const mults = this._resolveStatMultipliers(mapKey, boostSide, isElite);
    const hasMults = Object.keys(mults).length > 0;

    if (hasMults && form?.speciesData?.stats) {
      const baseStats = form.speciesData.stats;
      const nat = NATURE_EFFECTS[state.nature];
      const lvl = state.level ?? 100;

      const STAT_MAP = {
        hp:  { baseKey: 'hp',              iv: hpIV,  ev: hp,  natIdx: 0 },
        atk: { baseKey: 'attack',          iv: atkIV, ev: atk, natIdx: 1 },
        def: { baseKey: 'defense',         iv: defIV, ev: def, natIdx: 2 },
        spa: { baseKey: 'special-attack',  iv: spaIV, ev: spa, natIdx: 3 },
        spd: { baseKey: 'special-defense', iv: spdIV, ev: spd, natIdx: 4 },
        spe: { baseKey: 'speed',           iv: speIV, ev: spe, natIdx: 5 },
      };

      const overrides = {};

      for (const [statKey, mult] of Object.entries(mults)) {
        if (mult === 1) continue;
        const sm = STAT_MAP[statKey];
        if (!sm) continue;
        const base = baseStats[sm.baseKey];
        if (!base) continue;

        const natMod = nat && nat[0] === sm.natIdx ? 1.1
                     : nat && nat[1] === sm.natIdx ? 0.9 : 1.0;

        const rawStat = this._computeRawStat(statKey, base, sm.iv, sm.ev, lvl, natMod);
        const boostedStat = Math.floor(rawStat * mult);

        if (statKey === 'hp') {
          // smogon's HP formula: floor((2*base + iv + floor(ev/4)) * lvl/100 + lvl + 10)
          // Back-solve by iterating EV 0-252 (step 4) to find the smallest EV that
          // produces a stat >= boostedStat. Default to 252 if nothing lower suffices.
          const targetHP = boostedStat;
          let solvedEV = 252;
          for (let ev = 0; ev <= 252; ev += 4) {
            const candidate = Math.floor((2 * base + hpIV + Math.floor(ev / 4)) * lvl / 100 + lvl + 10);
            if (candidate >= targetHP) { solvedEV = ev; break; }
          }
          opts.evs = { ...opts.evs, hp: solvedEV };
          opts.ivs = { ...opts.ivs, hp: hpIV };
        } else {
          overrides[statKey] = boostedStat;
        }
      }

      if (Object.keys(overrides).length > 0) {
        opts.overrides = overrides;
      }
    }

    return new Pokemon(genObj, state.species, opts);
  }

  _buildField(gen, atkState, defState) {
    const { Field, Side } = window.calc;

    const weather = _fieldVal('weather-group');
    const terrain = _fieldVal('terrain-group');

    const attSwitchingIn = atkState?.isSwitchingIn ?? false;
    const defSwitchingIn = defState?.isSwitchingIn ?? false;

    const attSpikeLayers = parseInt(document.getElementById('att-spikes-layers')?.value || 1);
    const attSide = new Side({
      isTailwind:    _checked('att-tailwind'),
      isHelpingHand: _checked('att-helping'),
      isReflect:     _checked('att-reflect'),
      isLightScreen: _checked('att-lightscreen'),
      isAuroraVeil:  _checked('att-aurora'),
      isSR:         attSwitchingIn && _checked('att-sr'),
      spikes:       attSwitchingIn && _checked('att-spikes') ? attSpikeLayers : 0,
      toxicSpikes:  attSwitchingIn && _checked('att-tspikes') ? 1 : 0,
      isStickyWeb:  attSwitchingIn && _checked('att-web'),
    });

    const spikeLayers = parseInt(document.getElementById('haz-spikes-layers')?.value || 1);
    const defSide = new Side({
      isTailwind:    _checked('def-tailwind'),
      isReflect:     _checked('def-reflect'),
      isLightScreen: _checked('def-lightscreen'),
      isAuroraVeil:  _checked('def-aurora'),
      isSwitching:  defState?.isSwitchingOut ? 'out' : undefined,
      isSR:         defSwitchingIn && _checked('haz-sr'),
      spikes:       defSwitchingIn && _checked('haz-spikes') ? spikeLayers : 0,
      toxicSpikes:  defSwitchingIn && _checked('haz-tspikes') ? 1 : 0,
      isStickyWeb:  defSwitchingIn && _checked('haz-web'),
    });

    return new Field({
      weather: weather === 'none' ? undefined : weather,
      terrain: terrain === 'none' ? undefined : terrain,
      isGravity: _checked('field-gravity'),
      isInverse: _checked('field-inverse'),
      attackerSide: attSide,
      defenderSide: defSide,
    });
  }

  _renderResult(container, result, attacker, defender, attState, defState, gen, dirLabel, defCurHP, mapBoostKey, isEliteRight) {
    const dmgRange = result.damage;
    if (!dmgRange || !dmgRange.length) {
      container.innerHTML = `<div class="result-placeholder">No damage (move may not deal damage or data unavailable).</div>`;
      return;
    }

    const minDmg = Math.min(...dmgRange);
    const maxDmg = Math.max(...dmgRange);
    const defMaxHP = defender.maxHP();
    defCurHP = defCurHP ?? defMaxHP;

    const minPct = ((minDmg / defMaxHP) * 100).toFixed(1);
    const maxPct = ((maxDmg / defMaxHP) * 100).toFixed(1);

    const isSwitchingIn = attState.isSwitchingIn || defState.isSwitchingIn;
    const koText = isSwitchingIn
      ? this._koChanceText(dmgRange, defCurHP)
      : (result.kochance?.text ?? this._koChanceText(dmgRange, defCurHP));

    const rollPills = dmgRange.map((d) => {
      const pct = ((d / defMaxHP) * 100).toFixed(1);
      return `<span class="roll-pill">${d}<small style="opacity:.6"> (${pct}%)</small></span>`;
    }).join('');

    let koClass = 'safe';
    const koLower = koText.toLowerCase();
    if (koLower.includes('guaranteed ohko') || koLower.startsWith('ohko')) koClass = 'ohko';
    else if (koLower.includes('guaranteed 2hko') || koLower.includes('2hko')) koClass = 'likely';

    // ── Map boost / Elite indicator labels ──────────────────────────────────
    const mapLabel = this._buildMapBoostLabel(mapBoostKey, isEliteRight);

    container.innerHTML = `
      <div class="result-main">
        ${dirLabel ? `<div class="result-direction">${dirLabel}</div>` : ''}
        ${mapLabel}
        ${attState.isSwitchingIn || defState.isSwitchingIn ? `<div class="switch-chip-note">⚠ Switching In: HP reduced by hazard chip before this roll</div>` : ''}
        <div class="result-range">${minDmg}–${maxDmg}</div>
        <div class="result-pct">(${minPct}% – ${maxPct}%)</div>
        <div class="result-ko ${koClass}">${koText || (maxPct >= 100 ? 'OHKO' : '2HKO+')}</div>
        <div class="result-rolls">${rollPills}</div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-dim);font-family:var(--font-mono)">
          ${(() => {
            const isSwitchingIn = attState.isSwitchingIn || defState.isSwitchingIn;
            if (isSwitchingIn) {
              const curHPPct = ((defCurHP / defMaxHP) * 100).toFixed(1);
              const smogonBase = result.desc ? result.desc().replace(/ -- .+$/, '') : '';
              return smogonBase + ` -- ${koText} (at ${curHPPct}% HP after hazards)`;
            }
            return result.desc ? result.desc() : '';
          })()}
        </div>
        <div class="speed-tier" id="speed-tier-display"></div>
      </div>
    `;

    this._renderSpeedTier(attacker, defender, attState, defState);
  }

  _buildMapBoostLabel(mapKey, isEliteRight) {
    if (mapKey === 'none' && !isEliteRight) return '';

    const MAP_NAMES = {
      'none':            '',
      'ancient-dungeon': 'Ancient Dungeon',
      'battle-zone':     'Battle Zone',
      'legendary':       'Legendary Maps',
    };

    const parts = [];
    if (mapKey !== 'none') parts.push(`🗺 ${MAP_NAMES[mapKey]}`);
    if (isEliteRight)       parts.push(`<span style="background:linear-gradient(135deg,#f5a623,#e07b20);color:#1a1a1a;padding:1px 6px;border-radius:3px;font-weight:700;font-size:10px;letter-spacing:.05em">ELITE</span> Right`);

    return `<div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-bottom:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${parts.join(' · ')}</div>`;
  }

  _renderSpeedTier(attacker, defender, attState, defState) {
    const el = document.getElementById('speed-tier-display');
    if (!el) return;

    try {
      const activeRole = window.appState?.activeMoveRole ?? 'attacker';
      const leftForm  = window.attackerForm;
      const rightForm = window.defenderForm;
      const leftState  = activeRole === 'attacker' ? attState : defState;
      const rightState = activeRole === 'attacker' ? defState : attState;

      const mapBoostKey  = document.getElementById('map-boost-select')?.value ?? 'none';
      const isEliteRight = document.getElementById('right-elite')?.checked ?? false;

      // Left panel always gets 'left' boosts, right always 'right'
      const leftSpd0  = this._calcSpeed(leftState,  leftForm,  mapBoostKey, 'left',  false);
      const rightSpd0 = this._calcSpeed(rightState, rightForm, mapBoostKey, 'right', isEliteRight);

      const leftTailwind  = _checked('att-tailwind');
      const rightTailwind = _checked('def-tailwind');
      const isTrickRoom   = _checked('field-trickroom');
      const rightStickyWeb = _checked('haz-web');
      const leftStickyWeb  = _checked('att-web');
      const gen           = window.appState?.currentGen ?? 7;

      let leftSpd  = leftTailwind  ? leftSpd0 * 2 : leftSpd0;
      let rightSpd = rightTailwind ? rightSpd0 * 2 : rightSpd0;
      if (leftStickyWeb  && gen >= 6) leftSpd  = Math.floor(leftSpd  * 0.75);
      if (rightStickyWeb && gen >= 6) rightSpd = Math.floor(rightSpd * 0.75);

      const tie = leftSpd === rightSpd;
      let label, cls;

      const mods = [
        isTrickRoom              ? 'Trick Room' : '',
        leftTailwind             ? 'L-Tailwind'  : '',
        rightTailwind            ? 'R-Tailwind'  : '',
        (leftStickyWeb  && gen >= 6) ? 'L-Sticky Web' : '',
        (rightStickyWeb && gen >= 6) ? 'R-Sticky Web' : '',
      ].filter(Boolean).join(' · ');
      const modStr = mods ? ` · ${mods}` : '';

      if (tie) {
        label = `Speed tie (${leftSpd})${modStr}`;
        cls = 'spd-tie';
      } else if (leftSpd > rightSpd && !isTrickRoom || leftSpd < rightSpd && isTrickRoom) {
        label = `Left moves first (${leftSpd} vs ${rightSpd})${modStr}`;
        cls = 'spd-faster';
      } else {
        label = `Right moves first (${rightSpd} vs ${leftSpd})${modStr}`;
        cls = 'spd-slower';
      }

      el.innerHTML = `<span class="speed-badge ${cls}">⚡ ${label}</span>`;
    } catch(e) {
      el.innerHTML = '';
    }
  }

  _calcSpeed(state, form, mapKey, boostSide, isElite) {
    const baseSpd = form?.speciesData?.stats?.speed ?? 0;
    if (!baseSpd) return 0;

    const iv  = state.ivs?.[5] ?? 31;
    const ev  = state.evs?.[5] ?? 0;
    const lvl = state.level ?? 50;
    const nat = state.nature ?? 'Hardy';
    const natMod = ['Timid','Hasty','Jolly','Naive'].includes(nat) ? 1.1
                 : ['Brave','Relaxed','Quiet','Sassy'].includes(nat) ? 0.9 : 1;
    let spd = Math.floor(Math.floor((2 * baseSpd + iv + Math.floor(ev / 4)) * lvl / 100 + 5) * natMod);

    // Apply PVE speed multiplier if any
    const mults = this._resolveStatMultipliers(mapKey ?? 'none', boostSide ?? 'left', isElite ?? false);
    if (mults.spe && mults.spe !== 1) {
      spd = Math.floor(spd * mults.spe);
    }

    const boost = state.boosts?.[4] ?? 0;
    if (boost !== 0) {
      const stageMult = boost > 0 ? (2 + boost) / 2 : 2 / (2 - boost);
      spd = Math.floor(spd * stageMult);
    }

    const item = state.isUnburdenActive ? '' : (state.item ?? '');
    if (item === 'Choice Scarf')  spd = Math.floor(spd * 1.5);
    if (item === 'Iron Ball' || item === 'Macho Brace') spd = Math.floor(spd * 0.5);
    if (item === 'Quick Powder' && (state.species ?? '').toLowerCase() === 'ditto') spd = Math.floor(spd * 2);

    if (state.isUnburdenActive && (state.ability ?? '').toLowerCase() === 'unburden') {
      spd = spd * 2;
    }

    if (state.status === 'Paralysis') {
      const gen = window.appState?.currentGen ?? 7;
      spd = Math.floor(spd * (gen >= 7 ? 0.5 : 0.25));
    }

    return spd;
  }

  _calcHazardChip(pokemon, maxHP, prefix, form) {
    if (!form) form = prefix === 'att' ? window.attackerForm : window.defenderForm;
    const types = form?.speciesData?.types ?? [];
    const state = form?.getState() ?? {};
    const item  = state.item ?? '';
    const ability = (state.ability ?? '').toLowerCase();
    const isMagicGuard = ability === 'magic guard';

    let chip = 0;

    if (_checked(`${prefix}-sr`) && !isMagicGuard) {
      const SR_CHART = {
        Normal:1, Fire:2, Water:0.5, Electric:1, Grass:0.5, Ice:2,
        Fighting:0.5, Poison:1, Ground:0.5, Flying:2, Psychic:1, Bug:1,
        Rock:1, Ghost:1, Dragon:1, Dark:1, Steel:0.5, Fairy:1,
      };
      let mult = 1;
      types.forEach(t => { mult *= SR_CHART[t] ?? 1; });
      chip += Math.floor(maxHP * 0.125 * mult);
    }

    if (_checked(`${prefix}-spikes`) && !isMagicGuard) {
      const isFlying   = types.includes('Flying');
      const hasLevitate = ability === 'levitate';
      const hasAirBalloon = item === 'Air Balloon';
      const hasIronBall   = item === 'Iron Ball';
      const isGravity     = _checked('field-gravity');
      const ungrounded = (isFlying && !hasIronBall && !isGravity) || hasLevitate || hasAirBalloon;
      if (!ungrounded) {
        const layersEl = document.getElementById(`${prefix}-spikes-layers`);
        const layers = parseInt(layersEl?.value ?? 1);
        const spikeFrac = layers === 1 ? 1/8 : layers === 2 ? 1/6 : 1/4;
        chip += Math.floor(maxHP * spikeFrac);
      }
    }

    return chip;
  }

  _koChanceText(dmgRange, defHP) {
    const ohkos = dmgRange.filter(d => d >= defHP).length;
    if (ohkos === 16) return 'Guaranteed OHKO';
    if (ohkos > 0) return `OHKO ${Math.round((ohkos/16)*100)}% of the time`;
    const twoHKOs = dmgRange.filter(d => d * 2 >= defHP).length;
    if (twoHKOs === 16) return 'Guaranteed 2HKO';
    if (twoHKOs > 0) return `2HKO ${Math.round((twoHKOs/16)*100)}% of the time`;
    return 'Does not KO in 2 hits';
  }

  showMoveTypeCoverage(moveSlug, defState, defForm) {
    const el = document.getElementById('move-type-coverage');
    if (!el || !moveSlug || !defState?.species) { if (el) el.innerHTML = ''; return; }

    const targetForm = defForm ?? window.defenderForm;

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

    const moveApiSlug = moveSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const hpMatch = moveApiSlug.match(/^hidden-power-(.+)$/);
    const hpType = hpMatch ? hpMatch[1] : null;

    fetchPokeAPI(`/move/${hpType ? 'hidden-power' : moveApiSlug}`).then(moveData => {
      const rawType = hpType ?? moveData?.type?.name;
      if (!rawType) { el.innerHTML = ''; return; }
      const capType = rawType.charAt(0).toUpperCase() + rawType.slice(1);
      const chart = TYPE_CHART[capType] || {};

      const defSpeciesData = targetForm?.speciesData;
      const defTypes = defSpeciesData?.types || [];
      if (!defTypes.length) { el.innerHTML = ''; return; }

      let multiplier = 1;
      defTypes.forEach(dt => {
        multiplier *= chart[dt] ?? 1;
      });

      let badge, badgeCls;
      if (multiplier === 0)    { badge = 'Immune (0×)';    badgeCls = 'type-immune'; }
      else if (multiplier >= 4){ badge = 'Super Effective (4×)'; badgeCls = 'type-se'; }
      else if (multiplier >= 2){ badge = 'Super Effective (2×)'; badgeCls = 'type-se'; }
      else if (multiplier <= 0.25){ badge = 'Not Very Effective (¼×)'; badgeCls = 'type-nve'; }
      else if (multiplier < 1) { badge = 'Not Very Effective (½×)'; badgeCls = 'type-nve'; }
      else                     { badge = 'Neutral (1×)';   badgeCls = 'type-neutral'; }

      const typeColor = capType.toLowerCase();
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="type-badge type-${typeColor}">${capType}</span>
          <span class="coverage-badge ${badgeCls}">${badge}</span>
        </div>`;
    }).catch(() => { el.innerHTML = ''; });
  }

  async showLearnMethod(species, moveSlug, gen) {
    const infoEl = document.getElementById('move-learn-info');
    if (!infoEl || !species || !moveSlug) return;
    infoEl.textContent = 'Loading learn method…';
    const methods = await getMoveLearnMethods(species, moveSlug, gen);
    if (!methods.length) {
      infoEl.innerHTML = `<span style="color:var(--accent3)">Not available in Gen ${gen} or data unavailable.</span>`;
      return;
    }
    const pills = methods.map(m => {
      const label = LEARN_METHOD_LABELS[m.method] || m.method;
      const lvl = m.level > 0 ? ` Lv.${m.level}` : '';
      return `<span class="learn-method">${label}${lvl}</span>`;
    }).join(' ');
    infoEl.innerHTML = `<strong style="color:var(--text-dim)">Learned by:</strong> ${pills}`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _fieldVal(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return 'none';
  return group.querySelector('.active')?.dataset.val ?? 'none';
}

function _checked(id) {
  return document.getElementById(id)?.checked ?? false;
}

// ── Global PVE multiplier helper ─────────────────────────────────────────────
// Called by pokemonForm.js to apply map/Elite multipliers to the Total column.
// boostSide: 'left' | 'right'
// isElite: only ever true for the right (wild) side
window.getPVEMultipliers = function(boostSide, isElite) {
  const mapKey = document.getElementById('map-boost-select')?.value ?? 'none';
  const mapMults = MAP_BOOSTS[mapKey]?.[boostSide] ?? {};
  const mults = { ...mapMults };
  if (isElite) {
    const mapBoostsStats = STAT_BOOSTING_MAPS.has(mapKey);
    mults.hp = (mults.hp ?? 1) * 1.3;
    if (!mapBoostsStats) {
      for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) {
        mults[stat] = (mults[stat] ?? 1) * 1.3;
      }
    }
  }
  return mults;
};

// Wire up Map Boost controls to trigger recalc AND re-render both forms
document.addEventListener('DOMContentLoaded', () => {
  const onMapChange = () => {
    window.attackerForm?.render();
    window.defenderForm?.render();
    window.appCalc?.scheduleCalc();
  };
  document.getElementById('map-boost-select')?.addEventListener('change', onMapChange);
  document.getElementById('right-elite')?.addEventListener('change', onMapChange);
});

// Exposed globally
window.appCalc = new CalcEngine();
