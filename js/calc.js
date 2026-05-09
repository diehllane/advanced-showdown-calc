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
      const { Gen, Pokemon, Move, Field, Side, calculate } = window.calc;

      const gen = window.appState?.currentGen ?? 7;
      const attState = window.attackerForm?.getState();
      const defState = window.defenderForm?.getState();

      if (!attState?.species || !defState?.species) {
        result.innerHTML = `<div class="result-placeholder">Enter both Pokémon species to calculate.</div>`;
        return;
      }

      const activeMoveSlug = window.appState?.attackerActiveMove;
      if (!activeMoveSlug) {
        result.innerHTML = `<div class="result-placeholder">Press "Use" on a move to calculate damage.</div>`;
        return;
      }

      const genObj = new Gen(gen);

      // Build Pokémon objects
      const attacker = this._buildPokemon(genObj, attState);
      const defender = this._buildPokemon(genObj, defState);

      const moveName = _moveName(activeMoveSlug);
      const move = new Move(genObj, moveName, {
        isCrit: attState.isCriticalHit,
      });

      // Build field
      const field = this._buildField(gen);

      const calcResult = calculate(genObj, attacker, defender, move, field);

      this._renderResult(result, calcResult, defender);
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

    // Current HP override
    if (state.curHP && state.curHP < 100) {
      // We'll set this as a fraction after construction
      opts.curHP = state.curHP / 100;
    }

    // Battle flags
    if (state.isFlashFireActive) opts.abilityOn = true;

    return new Pokemon(genObj, state.species, opts);
  }

  _buildField(gen) {
    const { Field, Side } = window.calc;

    const weather = _fieldVal('weather-group');
    const terrain = _fieldVal('terrain-group');

    const attSide = new Side({
      isTailwind: _checked('att-tailwind'),
      isHelpingHand: _checked('att-helping'),
    });

    const spikeLayers = parseInt(document.getElementById('haz-spikes-layers')?.value || 1);
    const defSide = new Side({
      steelsurge: _checked('haz-sr'),   // Gen8+ Stealth Rock variant name varies
      spikes: _checked('haz-spikes') ? spikeLayers : 0,
      isSR: _checked('haz-sr'),
      toxicSpikes: _checked('haz-tspikes') ? 1 : 0,
      isStickyWeb: _checked('haz-web'),
      isReflect: _checked('def-reflect'),
      isLightScreen: _checked('def-lightscreen'),
      isAuroraVeil: _checked('def-aurora'),
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

  _renderResult(container, result, defender) {
    const dmgRange = result.damage;
    if (!dmgRange || !dmgRange.length) {
      container.innerHTML = `<div class="result-placeholder">No damage (move may not deal damage or data unavailable).</div>`;
      return;
    }

    const minDmg = Math.min(...dmgRange);
    const maxDmg = Math.max(...dmgRange);
    const defHP = defender.maxHP();

    const minPct = ((minDmg / defHP) * 100).toFixed(1);
    const maxPct = ((maxDmg / defHP) * 100).toFixed(1);

    // KO chance
    const koText = result.kochance?.text ?? this._koChanceText(dmgRange, defHP);

    // Rolls display (16 damage rolls)
    const rollPills = dmgRange.map((d, i) => {
      const pct = ((d / defHP) * 100).toFixed(1);
      return `<span class="roll-pill">${d}<small style="opacity:.6"> (${pct}%)</small></span>`;
    }).join('');

    // KO badge class
    let koClass = 'safe';
    if (maxPct >= 100) koClass = 'ohko';
    else if (parseFloat(minPct) >= 50) koClass = 'likely';

    container.innerHTML = `
      <div class="result-main">
        <div class="result-range">${minDmg}–${maxDmg}</div>
        <div class="result-pct">(${minPct}% – ${maxPct}%)</div>
        <div class="result-ko ${koClass}">${koText || (maxPct >= 100 ? 'OHKO' : '2HKO+')}</div>
        <div class="result-rolls">${rollPills}</div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-dim);font-family:var(--font-mono)">
          ${result.desc ? result.desc() : ''}
        </div>
      </div>
    `;
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
