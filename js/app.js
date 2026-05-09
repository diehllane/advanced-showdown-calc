// ── app.js ────────────────────────────────────────────────────────────────────
// Entry point: handles auth, initialises all modules, wires global interactions.

window.appState = {
  currentGen: 7,
  activeMoveSlot: null,
  activeMoveRole: null,
  attackerActiveMove: null,
  defenderActiveMove: null,
};

// ── Auth & Login Screen ───────────────────────────────────────────────────────

const loginScreen = document.getElementById('login-screen');
const appEl       = document.getElementById('app');

async function initAuth() {
  const session = await SB.getSession();
  if (session) {
    showApp(session.user);
  } else {
    showLogin();
  }

  SB.onAuthChange((_event, session) => {
    if (session) {
      showApp(session.user);
    } else {
      showLogin();
    }
  });
}

function showApp(user) {
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  const usernameEl = document.getElementById('header-username');
  if (usernameEl) usernameEl.textContent = user.email;
}

function showLogin() {
  appEl.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

// Login form
document.getElementById('login-btn')?.addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.classList.add('hidden');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = 'Email and password are required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    await SB.signIn(email, password);
    // onAuthChange fires and calls showApp
  } catch (e) {
    errEl.textContent = e.message || 'Sign in failed.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// Allow Enter key on password field
document.getElementById('login-password')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn')?.click();
});

document.getElementById('signout-btn')?.addEventListener('click', async () => {
  await SB.signOut();
});

document.getElementById('change-password-btn')?.addEventListener('click', () => {
  openModal('Change Password', `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="form-row"><label>New Password</label>
        <input type="password" id="new-password" placeholder="Min 6 characters" autocomplete="new-password" /></div>
      <div class="form-row"><label>Confirm Password</label>
        <input type="password" id="confirm-password" placeholder="Repeat new password" autocomplete="new-password" /></div>
      <div id="pw-change-error" class="login-error hidden"></div>
      <button class="action-btn" id="confirm-pw-btn">Update Password</button>
    </div>
  `);

  document.getElementById('confirm-pw-btn')?.addEventListener('click', async () => {
    const newPw  = document.getElementById('new-password').value;
    const confPw = document.getElementById('confirm-password').value;
    const errEl  = document.getElementById('pw-change-error');
    errEl.classList.add('hidden');

    if (newPw.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters.';
      errEl.classList.remove('hidden');
      return;
    }
    if (newPw !== confPw) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    const btn = document.getElementById('confirm-pw-btn');
    btn.disabled = true;
    btn.textContent = 'Updating…';

    try {
      await SB.updatePassword(newPw);
      closeModal();
      showToast('Password updated!', 'success');
    } catch(e) {
      errEl.textContent = e.message || 'Update failed.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  });
});

// ── View Switching ────────────────────────────────────────────────────────────

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const viewEl = document.getElementById(`view-${viewName}`);
  if (viewEl) viewEl.classList.add('active');
  const navBtn = document.querySelector(`[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (viewName === 'myteams')   TeamsManager.loadTeams();
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

// ── Field Toggles ─────────────────────────────────────────────────────────────

document.querySelectorAll('.toggle-group').forEach(group => {
  group.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.appCalc?.scheduleCalc();
    });
  });
});

document.querySelectorAll('.hazard-group input[type=checkbox]').forEach(cb => {
  cb.addEventListener('change', () => window.appCalc?.scheduleCalc());
});
document.getElementById('haz-spikes-layers')?.addEventListener('change', () => window.appCalc?.scheduleCalc());

// ── Pokémon Forms ─────────────────────────────────────────────────────────────

window.attackerForm = new PokemonForm('attacker-form', 'attacker');
window.defenderForm = new PokemonForm('defender-form', 'defender');

// ── Save/Load Pokémon ─────────────────────────────────────────────────────────

document.getElementById('save-attacker-btn')?.addEventListener('click', () => savePokemon('attacker'));
document.getElementById('save-defender-btn')?.addEventListener('click', () => savePokemon('defender'));
document.getElementById('load-attacker-btn')?.addEventListener('click', () => loadPokemonModal('attacker'));
document.getElementById('load-defender-btn')?.addEventListener('click', () => loadPokemonModal('defender'));

async function savePokemon(role) {
  const form  = role === 'attacker' ? window.attackerForm : window.defenderForm;
  const state = form.getState();
  if (!state.species) { showToast('Enter a species first', 'error'); return; }

  openModal(`Save ${role === 'attacker' ? 'Left' : 'Right'} Pokémon`, `
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
    const owner    = document.getElementById('save-pk-owner').value;
    try {
      await SB.createPokemon({
        nickname,
        species: state.species,
        owner,
        gen: window.appState.currentGen,
        data: state,
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
    saved = await SB.getPokemon({ gen: window.appState.currentGen });
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

// ── Smogon Sets modal ─────────────────────────────────────────────────────────

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

window.showSmogonSets = showSmogonSets;

// ── Utility ───────────────────────────────────────────────────────────────────

function esc(str) {
  return (str ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

TeamsManager.initNewTeamBtn();
OpponentsManager.initAddBtn();
initAuth();

console.log('PokéDmgCalc initialised — Gen 7 (SM) default');
