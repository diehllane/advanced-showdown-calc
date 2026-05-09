// ── supabase-client.js ────────────────────────────────────────────────────────
// Single source of truth for Supabase auth and all database operations.
// All functions are async and return data directly (throws on error).

const SUPABASE_URL = 'https://grjcbysbivlfcmvzxgeh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyamNieXNiaXZsZmNtdnp4Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMjgxMTAsImV4cCI6MjA5MzkwNDExMH0.O5Y8Y9trgVz42m7jokbtCHlQts28aOMzfZabTrvDuG0';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth ──────────────────────────────────────────────────────────────────────

async function sbSignIn(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignOut() {
  const { error } = await _sb.auth.signOut();
  if (error) throw error;
}

async function sbGetSession() {
  const { data } = await _sb.auth.getSession();
  return data?.session ?? null;
}

function sbOnAuthChange(callback) {
  return _sb.auth.onAuthStateChange(callback);
}

// ── Teams ─────────────────────────────────────────────────────────────────────

async function dbGetTeams(owner) {
  let q = _sb.from('teams').select('*').order('updated_at', { ascending: false });
  if (owner) q = q.eq('owner', owner);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function dbCreateTeam({ name, owner, notes, pokemon, gen, opponent_id }) {
  const { data, error } = await _sb.from('teams').insert({
    name,
    owner,
    notes: notes || '',
    pokemon: pokemon || [],
    gen: gen || 7,
    opponent_id: opponent_id || null,
  }).select().single();
  if (error) throw error;
  return data;
}

async function dbUpdateTeam(id, { name, owner, notes, pokemon, gen, opponent_id }) {
  const { error } = await _sb.from('teams').update({
    name,
    owner,
    notes: notes || '',
    pokemon: pokemon || [],
    gen: gen || 7,
    opponent_id: opponent_id ?? null,
  }).eq('id', id);
  if (error) throw error;
}

async function dbDeleteTeam(id) {
  const { error } = await _sb.from('teams').delete().eq('id', id);
  if (error) throw error;
}

// ── Saved Pokémon ─────────────────────────────────────────────────────────────

async function dbGetPokemon({ owner, gen } = {}) {
  let q = _sb.from('saved_pokemon').select('*').order('nickname', { ascending: true });
  if (owner) q = q.eq('owner', owner);
  if (gen)   q = q.eq('gen', gen);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function dbCreatePokemon({ nickname, species, owner, gen, data }) {
  const { data: row, error } = await _sb.from('saved_pokemon').insert({
    nickname: nickname || species,
    species,
    owner,
    gen,
    data,
  }).select().single();
  if (error) throw error;
  return row;
}

async function dbUpdatePokemon(id, { nickname, species, owner, gen, data }) {
  const { error } = await _sb.from('saved_pokemon').update({
    nickname: nickname || species,
    species,
    owner,
    gen,
    data,
  }).eq('id', id);
  if (error) throw error;
}

async function dbDeletePokemon(id) {
  const { error } = await _sb.from('saved_pokemon').delete().eq('id', id);
  if (error) throw error;
}

// ── Opponents ─────────────────────────────────────────────────────────────────

async function dbGetOpponents() {
  const { data, error } = await _sb.from('opponents').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data;
}

async function dbCreateOpponent({ name, notes }) {
  const { data, error } = await _sb.from('opponents').insert({
    name,
    notes: notes || '',
  }).select().single();
  if (error) throw error;
  return data;
}

async function dbUpdateOpponent(id, { name, notes }) {
  const { error } = await _sb.from('opponents').update({ name, notes: notes || '' }).eq('id', id);
  if (error) throw error;
}

async function dbDeleteOpponent(id) {
  const { error } = await _sb.from('opponents').delete().eq('id', id);
  if (error) throw error;
}

async function dbGetTeamsForOpponent(opponentId) {
  const { data, error } = await _sb.from('teams')
    .select('*')
    .eq('opponent_id', opponentId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Expose on window for access across script files
window.SB = {
  signIn: sbSignIn,
  signOut: sbSignOut,
  getSession: sbGetSession,
  onAuthChange: sbOnAuthChange,
  // Teams
  getTeams: dbGetTeams,
  createTeam: dbCreateTeam,
  updateTeam: dbUpdateTeam,
  deleteTeam: dbDeleteTeam,
  // Pokémon
  getPokemon: dbGetPokemon,
  createPokemon: dbCreatePokemon,
  updatePokemon: dbUpdatePokemon,
  deletePokemon: dbDeletePokemon,
  // Opponents
  getOpponents: dbGetOpponents,
  createOpponent: dbCreateOpponent,
  updateOpponent: dbUpdateOpponent,
  deleteOpponent: dbDeleteOpponent,
  getTeamsForOpponent: dbGetTeamsForOpponent,
};
