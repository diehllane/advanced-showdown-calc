// ── app.js ────────────────────────────────────────────────────────────────────
// Entry point: initialises all modules and wires up global interactions.

window.appState = {
  currentGen: 7,
  activeMoveSlot: null,
  attackerActiveMove: null,
};

// ── View Switching ────────────────────────────────────────────────────────────

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const viewEl = document.getElementById(`view-${viewName}`);
  if (viewEl) viewEl.classList.add('active');
  const navBtn = document.querySelector(`[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (viewName === 'myteams') TeamsManager.loadTeams();
  if (viewName === 'opponents') OpponentsManager.loadOpponents();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ── Generation Selector ───────────────────────────────────────────────────────

document.querySelectorAll('.gen-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gen-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const gen = parseInt(btn.dataset.gen);
    window.appState.currentGen = gen;
    document.getElementById('gen-badge').textContent = `GEN ${gen}`;
    window.attackerForm?.setGen(gen);
    window.defenderForm?.setGen(gen);
  });
});

// ── Field Toggles (Weather / Terrain) ────────────────────────────────────────

document.querySelectorAll('.toggle-group').forEach(group => {
  group.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.appCalc?.scheduleCalc();
    });
  });
});

// Hazard checkboxes trigger recalc
document.querySelectorAll('.hazard-group input[type=checkbox]').forEach(cb => {
  cb.addEventListener('change', () => window.appCalc?.scheduleCalc());
});
document.getElementById('haz-spikes-layers')?.addEventListener('change', () => window.appCalc?.scheduleCalc());

// ── Pokémon Forms ─────────────────────────────────────────────────────────────

window.attackerForm = new PokemonForm('attacker-form', 'attacker');
window.defenderForm = new PokemonForm('defender-form', 'defender');

// ── Save/Load Pokémon buttons ─────────────────────────────────────────────────

document.getElementById('save-attacker-btn')?.addEventListener('click', () => savePokemon('attacker'));
document.getElementById('save-defender-btn')?.addEventListener('click', () => savePokemon('defender'));
document.getElementById('load-attacker-btn')?.addEventListener('click', () => loadPokemonModal('attacker'));
document.getElementById('load-defender-btn')?.addEventListener('click', () => loadPokemonModal('defender'));

async function savePokemon(role) {
  const form = role === 'attacker' ? window.attackerForm : window.defenderForm;
  const state = form.getState();
  if (!state.species) { showToast('Enter a species first', 'error'); return; }

  openModal(`Save ${role === 'attacker' ? 'Attacker' : 'Defender'}`, `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="form-row"><label>Nickname / Label</label>
        <input type="text" id="save-pk-nickname" value="${esc(state.nickname || state.species)}" /></div>
      <div class="form-row"><label>Owner</label>
        <select id="save-pk-owner">
          <option value="mine">My Pokémon</option>
          <option value="opponent">Opponent's Pokémon</option>
        </select></div>
      <button class="action-btn" id="confirm-save-pk-btn">Save</button>
    </div>
  `);

  document.getElementById('confirm-save-pk-btn')?.addEventListener('click', async () => {
    const nickname = document.getElementById('save-pk-nickname').value.trim();
    const owner = document.getElementById('save-pk-owner').value;
    try {
      await fetch('/api/pokemon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          species: state.species,
          owner,
          gen: window.appState.currentGen,
          data: state,
        })
      });
      closeModal();
      showToast(`${nickname} saved!`, 'success');
    } catch(e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  });
}

async function loadPokemonModal(role) {
  let saved = [];
  try {
    saved = await fetch(`/api/pokemon?gen=${window.appState.currentGen}`).then(r => r.json());
  } catch(e) {}

  if (!saved.length) {
    showToast('No saved Pokémon for this generation', 'error');
    return;
  }

  const items = saved.map(pk => `
    <div class="team-item load-pk-item" data-id="${pk.id}" style="cursor:pointer">
      <div class="team-item-name">${esc(pk.nickname || pk.species)}</div>
      <div class="team-item-meta">${esc(pk.species)} · ${pk.owner === 'mine' ? '🟢 Mine' : '🔴 Opponent'}</div>
    </div>
  `).join('');

  openModal('Load Pokémon', `<div class="team-list">${items}</div>`);

  document.querySelectorAll('.load-pk-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      const pk = saved.find(p => p.id === id);
      if (!pk) return;
      const form = role === 'attacker' ? window.attackerForm : window.defenderForm;
      form.setState(pk.data);
      closeModal();
      showToast(`${pk.nickname || pk.species} loaded!`, 'success');
    });
  });
}

// ── Calculate button ──────────────────────────────────────────────────────────

document.getElementById('calc-btn')?.addEventListener('click', () => {
  window.appCalc?.runCalc();
});

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.getElementById('modal-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
}

// ── Smogon Sets modal via attacker/defender load btns ─────────────────────────

async function showSmogonSets(species, gen, targetRole) {
  const sets = await getSmogonSets(species, gen);
  if (!sets || !Object.keys(sets).length) {
    showToast('No Smogon sets available for this Pokémon in this gen', 'error');
    return;
  }
  const setNames = Object.keys(sets);
  const items = setNames.map(name => `
    <div class="team-item load-pk-item" data-set="${esc(name)}" style="cursor:pointer">
      <div class="team-item-name">${esc(name)}</div>
      <div class="team-item-meta">
        ${sets[name].item || 'No Item'} · ${sets[name].ability || ''} · ${sets[name].nature || ''}
      </div>
    </div>
  `).join('');

  openModal(`${species} — Smogon Sets (Gen ${gen})`, `<div class="team-list">${items}</div>`);

  document.querySelectorAll('.load-pk-item').forEach(item => {
    item.addEventListener('click', () => {
      const setName = item.dataset.set;
      const raw = sets[setName];
      // Map smogon set format to our state format
      const state = {
        species,
        level: 50,
        nature: raw.nature || 'Hardy',
        item: raw.item || 'None',
        ability: raw.ability || '',
        moves: (raw.moves || []).map(m => Array.isArray(m) ? m[0] : m).slice(0,4),
        evs: _smogonEVsToArray(raw.evs),
        ivs: _smogonIVsToArray(raw.ivs),
        boosts: [0,0,0,0,0],
        status: '',
        gender: 'M',
      };
      const form = targetRole === 'attacker' ? window.attackerForm : window.defenderForm;
      form.setState(state);
      closeModal();
      showToast(`"${setName}" loaded!`, 'success');
    });
  });
}

function _smogonEVsToArray(evs) {
  if (!evs) return [0,0,0,0,0,0];
  return [evs.hp||0, evs.atk||0, evs.def||0, evs.spa||0, evs.spd||0, evs.spe||0];
}
function _smogonIVsToArray(ivs) {
  if (!ivs) return [31,31,31,31,31,31];
  return [
    ivs.hp  ?? 31, ivs.atk ?? 31, ivs.def ?? 31,
    ivs.spa ?? 31, ivs.spd ?? 31, ivs.spe ?? 31
  ];
}

// Expose for species fields to call after load
window.showSmogonSets = showSmogonSets;

// ── Utility ───────────────────────────────────────────────────────────────────

function esc(str) {
  return (str ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

TeamsManager.initNewTeamBtn();
OpponentsManager.initAddBtn();

console.log('PokéDmgCalc initialised — Gen 7 (SM) default');
