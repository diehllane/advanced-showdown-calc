// ── calc.js ──────────────────────────────────────────────────────────────────
// Wraps @smogon/calc v0.9.0 (window.calc) to perform damage calculations.
//
// Either side can initiate damage. appState.activeMoveRole ('attacker'|'defender')
// determines which panel is attacking and which is defending for any given calc.

class CalcEngine {
  constructor() {
    this._calcTimer = null;
  }

  scheduleCalc() {
    clearTimeout(this._calcTimer);
    this._calcTimer = setTimeout(() => this.runCalc(), 100);
  }

  _getLib() {
    try {
      const lib = require('@smogon/calc');
      if (!lib || typeof lib.calculate !== 'function') return null;
      return lib;
    } catch(e) {
      return null;
    }
  }

  runCalc() {
    const resultEl = document.getElementById('calc-result');
    if (!resultEl) return;

    const lib = this._getLib();
    if (!lib) {
      resultEl.innerHTML = '<div class="result-placeholder" style="color:var(--accent3)">Calc library not loaded — refresh the page.<br><small>Check browser console (F12) for SmogonCalc errors.</small></div>';
      return;
    }

    try {
      const { calculate, Pokemon, Move, Field, Side } = lib;
      const gen = window.appState?.currentGen ?? 7;

      const activeMoveSlug = window.appState?.activeMoveSlug;
      const activeMoveRole = window.appState?.activeMoveRole;

      if (!activeMoveSlug || !activeMoveRole) {
        resultEl.innerHTML = '<div class="result-placeholder">Press "Use" on a move to calculate damage.</div>';
        return;
      }

      // Whichever panel pressed "Use" is the attacker for this calc.
      const attState = activeMoveRole === 'attacker'
        ? window.attackerForm?.getState()
        : window.defenderForm?.getState();
      const defState = activeMoveRole === 'attacker'
        ? window.defenderForm?.getState()
        : window.attackerForm?.getState();

      if (!attState?.species || !defState?.species) {
        resultEl.innerHTML = '<div class="result-placeholder">Enter both Pokémon species to calculate.</div>';
        return;
      }

      const attacker = this._buildPokemon(gen, attState, Pokemon);
      const defender = this._buildPokemon(gen, defState, Pokemon);
      const move     = this._buildMove(gen, activeMoveSlug, attState, Move);
      const field    = this._buildField(Field, Side);
      const result   = calculate(gen, attacker, defender, move, field);

      this._renderResult(resultEl, result, defender, activeMoveRole);
    } catch (e) {
      resultEl.innerHTML = '<div class="result-placeholder" style="color:var(--accent3)">Calc error: ' + e.message + '<br><small>Check species/move names match the selected generation.</small></div>';
      console.error('Calc error:', e);
    }
  }

  _buildPokemon(gen, state, Pokemon) {
    const evs    = state.evs    || [0,0,0,0,0,0];
    const ivs    = state.ivs    || [31,31,31,31,31,31];
    const boosts = state.boosts || [0,0,0,0,0,0];

    const opts = {
      level:  state.level  ?? 100,
      nature: state.nature ?? 'Hardy',
      evs:    { hp: evs[0], atk: evs[1], def: evs[2], spa: evs[3], spd: evs[4], spe: evs[5] },
      ivs:    { hp: ivs[0], atk: ivs[1], def: ivs[2], spa: ivs[3], spd: ivs[4], spe: ivs[5] },
      boosts: { atk: boosts[0]||0, def: boosts[1]||0, spa: boosts[2]||0, spd: boosts[3]||0, spe: boosts[4]||0 },
    };

    if (state.item    && state.item !== 'None') opts.item      = state.item;
    if (state.ability)                          opts.ability   = state.ability;
    if (state.status)                           opts.status    = state.status;
    if (state.gender  && state.gender !== 'N')  opts.gender    = state.gender;
    if (state.curHP   && state.curHP  < 100)    opts.curHP     = state.curHP / 100;
    if (state.isFlashFireActive)                opts.abilityOn = true;

    const speciesSlug = state.species.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/-$/, '');
    return new Pokemon(gen, speciesSlug, opts);
  }

  _buildMove(gen, moveSlug, attState, Move) {
    return new Move(gen, _moveName(moveSlug), {
      isCrit: attState.isCriticalHit ?? false,
    });
  }

  _buildField(Field, Side) {
    const weather = _fieldVal('weather-group');
    const terrain = _fieldVal('terrain-group');
    const spikes  = _checked('haz-spikes')
      ? parseInt(document.getElementById('haz-spikes-layers')?.value || 1) : 0;

    return new Field({
      weather:      weather === 'none' ? undefined : weather,
      terrain:      terrain === 'none' ? undefined : terrain,
      isGravity:    _checked('field-gravity'),
      isInverse:    _checked('field-inverse'),
      attackerSide: new Side({
        isTailwind:    _checked('att-tailwind'),
        isHelpingHand: _checked('att-helping'),
      }),
      defenderSide: new Side({
        isSR:          _checked('haz-sr'),
        spikes:        spikes,
        toxicSpikes:   _checked('haz-tspikes') ? 1 : 0,
        isStickyWeb:   _checked('haz-web'),
        isReflect:     _checked('def-reflect'),
        isLightScreen: _checked('def-lightscreen'),
        isAuroraVeil:  _checked('def-aurora'),
      }),
    });
  }

  _renderResult(container, result, defender, attackingRole) {
    const dmgRange = result.damage;
    if (!dmgRange || !dmgRange.length) {
      container.innerHTML = '<div class="result-placeholder">No damage — move may not deal damage, or species/move not found in this generation.</div>';
      return;
    }

    const minDmg  = Math.min(...dmgRange);
    const maxDmg  = Math.max(...dmgRange);
    const defHP   = defender.maxHP();
    const minPct  = ((minDmg / defHP) * 100).toFixed(1);
    const maxPct  = ((maxDmg / defHP) * 100).toFixed(1);
    const koText  = result.kochance?.text ?? this._koChanceText(dmgRange, defHP);
    const koClass = maxDmg >= defHP ? 'ohko' : parseFloat(minPct) >= 50 ? 'likely' : 'safe';
    const desc    = typeof result.desc === 'function' ? result.desc() : '';

    // Label which direction damage is flowing
    const directionLabel = attackingRole === 'attacker'
      ? '<div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Left → Right</div>'
      : '<div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Right → Left</div>';

    const rollPills = dmgRange.map(d => {
      const pct = ((d / defHP) * 100).toFixed(1);
      return '<span class="roll-pill">' + d + '<small style="opacity:.6"> (' + pct + '%)</small></span>';
    }).join('');

    container.innerHTML =
      '<div class="result-main">' +
        directionLabel +
        '<div class="result-range">' + minDmg + '\u2013' + maxDmg + '</div>' +
        '<div class="result-pct">(' + minPct + '% \u2013 ' + maxPct + '%)</div>' +
        '<div class="result-ko ' + koClass + '">' + koText + '</div>' +
        '<div class="result-rolls">' + rollPills + '</div>' +
        (desc ? '<div style="margin-top:12px;font-size:12px;color:var(--text-dim);font-family:var(--font-mono)">' + desc + '</div>' : '') +
      '</div>';
  }

  _koChanceText(dmgRange, defHP) {
    const ohkos   = dmgRange.filter(d => d >= defHP).length;
    if (ohkos === 16) return 'Guaranteed OHKO';
    if (ohkos  >  0)  return 'OHKO ' + Math.round((ohkos / 16) * 100) + '% of the time';
    const twoHKOs = dmgRange.filter(d => d * 2 >= defHP).length;
    if (twoHKOs === 16) return 'Guaranteed 2HKO';
    if (twoHKOs  >  0)  return '2HKO ' + Math.round((twoHKOs / 16) * 100) + '% of the time';
    return 'Does not 2HKO';
  }

  async showLearnMethod(species, moveSlug, gen) {
    const infoEl = document.getElementById('move-learn-info');
    if (!infoEl || !species || !moveSlug) return;
    infoEl.textContent = 'Loading learn method\u2026';
    const methods = await getMoveLearnMethods(species, moveSlug, gen);
    if (!methods.length) {
      infoEl.innerHTML = '<span style="color:var(--accent3)">Not available in Gen ' + gen + ' or data unavailable.</span>';
      return;
    }
    const pills = methods.map(m => {
      const label = LEARN_METHOD_LABELS[m.method] || m.method;
      const lvl   = m.level > 0 ? ' Lv.' + m.level : '';
      return '<span class="learn-method">' + label + lvl + '</span>';
    }).join(' ');
    infoEl.innerHTML = '<strong style="color:var(--text-dim)">Learned by:</strong> ' + pills;
  }
}

function _fieldVal(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return 'none';
  return group.querySelector('.toggle-btn.active')?.dataset.val ?? 'none';
}

function _checked(id) {
  return document.getElementById(id)?.checked ?? false;
}

window.appCalc = new CalcEngine();
