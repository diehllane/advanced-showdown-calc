// ── calc.js ──────────────────────────────────────────────────────────────────
// Wraps @smogon/calc (window.calc from the UMD build) to perform damage
// calculations and update the results panel.

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

      const genObj = Generations.get(gen);

      // Build Pokémon objects
      const attacker = this._buildPokemon(genObj, atkState);
      const defender = this._buildPokemon(genObj, defStateCalc);

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

      // Apply hazard chip for switching-in and reduce our tracked curHP
      if (atkState.isSwitchingIn) {
        const chip = this._calcHazardChip(attacker, atkMaxHP, 'att');
        atkCurHP = Math.max(1, atkCurHP - chip);
      }
      if (defStateCalc.isSwitchingIn) {
        const chip = this._calcHazardChip(defender, defMaxHP, 'haz');
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

      this._renderResult(result, calcResult, attacker, defender, atkState, defStateCalc, gen, dirLabel, defCurHP);
    } catch (e) {
      result.innerHTML = `<div class="result-placeholder" style="color:var(--accent3)">
        Calc error: ${e.message}<br><small>Check species names and move names match the selected generation.</small>
      </div>`;
      console.error('Calc error:', e);
    }
  }

  _buildPokemon(genObj, state) {
    const { Pokemon } = window.calc;

    // Map stat arrays to smogon format
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
    // NOTE: isSwitchingOut belongs on field.defenderSide.isSwitching, not on the Pokemon object

    return new Pokemon(genObj, state.species, opts);
  }

  _buildField(gen, atkState, defState) {
    const { Field, Side } = window.calc;

    const weather = _fieldVal('weather-group');
    const terrain = _fieldVal('terrain-group');

    // Hazards (SR, Spikes, T-Spikes, Sticky Web) only feed into the smogon Side
    // when the Pokémon on that side is switching in — otherwise they don't affect
    // the damage calc or desc, and would cause spurious "after Stealth Rock" text.
    const attSwitchingIn = atkState?.isSwitchingIn ?? false;
    const defSwitchingIn = defState?.isSwitchingIn ?? false;

    const attSpikeLayers = parseInt(document.getElementById('att-spikes-layers')?.value || 1);
    const attSide = new Side({
      isTailwind:    _checked('att-tailwind'),
      isHelpingHand: _checked('att-helping'),
      isReflect:     _checked('att-reflect'),
      isLightScreen: _checked('att-lightscreen'),
      isAuroraVeil:  _checked('att-aurora'),
      // Hazards only when switching in
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
      // Pursuit: isSwitching = 'out' on defenderSide is how smogon/calc doubles Pursuit BP
      isSwitching:  defState?.isSwitchingOut ? 'out' : undefined,
      // Hazards only when switching in
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

  _renderResult(container, result, attacker, defender, attState, defState, gen, dirLabel, defCurHP) {
    const dmgRange = result.damage;
    if (!dmgRange || !dmgRange.length) {
      container.innerHTML = `<div class="result-placeholder">No damage (move may not deal damage or data unavailable).</div>`;
      return;
    }

    const minDmg = Math.min(...dmgRange);
    const maxDmg = Math.max(...dmgRange);
    const defMaxHP = defender.maxHP();
    // Use explicitly passed defCurHP — defender.curHP may not persist through calculate()
    defCurHP = defCurHP ?? defMaxHP;

    // Percentages shown relative to max HP for context
    const minPct = ((minDmg / defMaxHP) * 100).toFixed(1);
    const maxPct = ((maxDmg / defMaxHP) * 100).toFixed(1);

    // When switching in, we manually reduced defender.curHP before calculate().
    // Smogon's kochance also internally models chip, so using both would double-count.
    // Use our own _koChanceText against defCurHP when switching in (chip already applied).
    // Use smogon's kochance when not switching in (more accurate for multi-hit scenarios).
    const isSwitchingIn = attState.isSwitchingIn || defState.isSwitchingIn;
    const koText = isSwitchingIn
      ? this._koChanceText(dmgRange, defCurHP)
      : (result.kochance?.text ?? this._koChanceText(dmgRange, defCurHP));

    // Rolls display (16 damage rolls) — show pct of max HP for readability
    const rollPills = dmgRange.map((d, i) => {
      const pct = ((d / defMaxHP) * 100).toFixed(1);
      return `<span class="roll-pill">${d}<small style="opacity:.6"> (${pct}%)</small></span>`;
    }).join('');

    // Badge color: derive from the KO text so green box and label always agree
    let koClass = 'safe';
    const koLower = koText.toLowerCase();
    if (koLower.includes('guaranteed ohko') || koLower.startsWith('ohko')) koClass = 'ohko';
    else if (koLower.includes('guaranteed 2hko') || koLower.includes('2hko')) koClass = 'likely';

    container.innerHTML = `
      <div class="result-main">
        ${dirLabel ? `<div class="result-direction">${dirLabel}</div>` : ''}
        ${attState.isSwitchingIn || defState.isSwitchingIn ? `<div class="switch-chip-note">⚠ Switching In: HP reduced by hazard chip before this roll</div>` : ''}
        <div class="result-range">${minDmg}–${maxDmg}</div>
        <div class="result-pct">(${minPct}% – ${maxPct}%)</div>
        <div class="result-ko ${koClass}">${koText || (maxPct >= 100 ? 'OHKO' : '2HKO+')}</div>
        <div class="result-rolls">${rollPills}</div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-dim);font-family:var(--font-mono)">
          ${(() => {
            const isSwitchingIn = attState.isSwitchingIn || defState.isSwitchingIn;
            if (isSwitchingIn) {
              // Build our own desc reflecting actual curHP, not smogon's internal full-HP calc
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

    // Speed tier comparison
    this._renderSpeedTier(attacker, defender, attState, defState);
  }

  _renderSpeedTier(attacker, defender, attState, defState) {
    const el = document.getElementById('speed-tier-display');
    if (!el) return;

    try {
      // Use smogon/calc's computed stats directly — available after calculate()
      // attState here is the state of whichever panel pressed Use (may be left or right)
      // We need the original left/right forms to look up speciesData correctly
      const activeRole = window.appState?.activeMoveRole ?? 'attacker';
      const leftForm  = window.attackerForm;
      const rightForm = window.defenderForm;
      const leftState  = activeRole === 'attacker' ? attState : defState;
      const rightState = activeRole === 'attacker' ? defState : attState;
      const leftSpd0  = attacker.stats?.spe ?? this._calcSpeed(leftState,  leftForm);
      const rightSpd0 = defender.stats?.spe ?? this._calcSpeed(rightState, rightForm);

      const leftTailwind  = _checked('att-tailwind');
      const rightTailwind = _checked('def-tailwind');
      const isTrickRoom   = _checked('field-trickroom');
      const rightStickyWeb = _checked('haz-web');  // right side hazard
      const leftStickyWeb  = _checked('att-web');  // left side hazard
      const gen           = window.appState?.currentGen ?? 7;

      // Apply tailwind (×2) and Sticky Web (×0.75 in Gen 6+) per side
      let leftSpd  = leftTailwind  ? leftSpd0 * 2 : leftSpd0;
      let rightSpd = rightTailwind ? rightSpd0 * 2 : rightSpd0;
      // Sticky Web slows whichever side it's on
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

  _calcSpeed(state, form) {
    // Step 1: base stat from PokeAPI species data
    const baseSpd = form?.speciesData?.stats?.speed ?? 0;
    if (!baseSpd) return 0;

    // Step 2: stat value from EVs/IVs/nature/level (Gen 3+ formula)
    const iv  = state.ivs?.[5] ?? 31;
    const ev  = state.evs?.[5] ?? 0;
    const lvl = state.level ?? 50;
    const nat = state.nature ?? 'Hardy';
    const natMod = ['Timid','Hasty','Jolly','Naive'].includes(nat) ? 1.1
                 : ['Brave','Relaxed','Quiet','Sassy'].includes(nat) ? 0.9 : 1;
    let spd = Math.floor(Math.floor((2 * baseSpd + iv + Math.floor(ev / 4)) * lvl / 100 + 5) * natMod);

    // Step 3: stat stage boosts (index 4 = speed in boosts array [atk,def,spa,spd,spe])
    const boost = state.boosts?.[4] ?? 0;
    if (boost !== 0) {
      const stageMult = boost > 0 ? (2 + boost) / 2 : 2 / (2 - boost);
      spd = Math.floor(spd * stageMult);
    }

    // Step 4: held item modifiers
    const item = state.item ?? '';
    if (item === 'Choice Scarf')  spd = Math.floor(spd * 1.5);
    if (item === 'Iron Ball' || item === 'Macho Brace') spd = Math.floor(spd * 0.5);
    if (item === 'Quick Powder' && (state.species ?? '').toLowerCase() === 'ditto') spd = Math.floor(spd * 2);

    // Step 5: status (paralysis halves speed in Gen 7+, 1/4 in earlier gens)
    if (state.status === 'Paralysis') {
      const gen = window.appState?.currentGen ?? 7;
      spd = Math.floor(spd * (gen >= 7 ? 0.5 : 0.25));
    }

    return spd;
  }

  _calcHazardChip(pokemon, maxHP, prefix) {
    // Returns HP lost on switch-in from hazards (integer)
    // prefix = 'att' for left-side hazards, 'haz' for right-side hazards
    const form  = prefix === 'att' ? window.attackerForm : window.defenderForm;
    const types = form?.speciesData?.types ?? [];
    const state = form?.getState() ?? {};
    const item  = state.item ?? '';
    const ability = (state.ability ?? '').toLowerCase();
    const isMagicGuard = ability === 'magic guard';

    let chip = 0;

    // Stealth Rock: Rock-type effectiveness multiplier on 12.5% base
    // Magic Guard immune; no type is fully immune to SR (0× doesn't exist for Rock attacking)
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

    // Spikes: 1/8, 1/6, 1/4 for 1/2/3 layers
    // Immune: Flying-types, Levitate, Air Balloon, Magic Guard
    // Iron Ball or Gravity grounds Flying (simple check — Gravity is a field condition)
    if (_checked(`${prefix}-spikes`) && !isMagicGuard) {
      const isFlying   = types.includes('Flying');
      const hasLevitate = ability === 'levitate';
      const hasAirBalloon = item === 'Air Balloon';
      const hasIronBall   = item === 'Iron Ball';
      const isGravity     = _checked('field-gravity');
      // Grounded if: not Flying (or Iron Ball/Gravity negates Flying), no Levitate, no Air Balloon
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

  showMoveTypeCoverage(moveSlug, defState) {
    const el = document.getElementById('move-type-coverage');
    if (!el || !moveSlug || !defState?.species) { if (el) el.innerHTML = ''; return; }

    // Type chart: attacking type -> array of [defending type, multiplier]
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

    // Get move type — Hidden Power type comes from slug, not PokeAPI (which returns Normal)
    const moveApiSlug = moveSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const hpMatch = moveApiSlug.match(/^hidden-power-(.+)$/);
    const hpType = hpMatch ? hpMatch[1] : null;

    fetchPokeAPI(`/move/${hpType ? 'hidden-power' : moveApiSlug}`).then(moveData => {
      const rawType = hpType ?? moveData?.type?.name;
      if (!rawType) { el.innerHTML = ''; return; }
      const capType = rawType.charAt(0).toUpperCase() + rawType.slice(1);
      const chart = TYPE_CHART[capType] || {};

      // Get defender types from speciesData on the defender form
      const defSpeciesData = window.defenderForm?.speciesData;
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

// Exposed globally
window.appCalc = new CalcEngine();
