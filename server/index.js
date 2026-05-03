const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Serve @smogon/calc production bundle directly.
// The bundle assigns its API to window.calc automatically — no wrapper needed.
app.get('/vendor/calc.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../node_modules/@smogon/calc/dist/production.min.js'));
});

// ── Teams ──────────────────────────────────────────────────────────────────

app.get('/api/teams', (req, res) => {
  try {
    const { owner } = req.query;
    let rows;
    if (owner) {
      rows = db.prepare('SELECT * FROM teams WHERE owner = ? ORDER BY updated_at DESC').all(owner);
    } else {
      rows = db.prepare('SELECT * FROM teams ORDER BY updated_at DESC').all();
    }
    rows.forEach(r => { r.pokemon = JSON.parse(r.pokemon); });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/teams', (req, res) => {
  try {
    const { name, owner, notes, pokemon } = req.body;
    if (!name || !owner || !pokemon) return res.status(400).json({ error: 'name, owner, and pokemon required' });
    const stmt = db.prepare(
      'INSERT INTO teams (name, owner, notes, pokemon) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(name, owner, notes || '', JSON.stringify(pokemon));
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/teams/:id', (req, res) => {
  try {
    const { name, owner, notes, pokemon } = req.body;
    db.prepare(
      'UPDATE teams SET name=?, owner=?, notes=?, pokemon=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).run(name, owner, notes || '', JSON.stringify(pokemon), req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/teams/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM teams WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Saved Pokémon (individual) ─────────────────────────────────────────────

app.get('/api/pokemon', (req, res) => {
  try {
    const { owner, gen } = req.query;
    let query = 'SELECT * FROM saved_pokemon WHERE 1=1';
    const params = [];
    if (owner) { query += ' AND owner = ?'; params.push(owner); }
    if (gen)   { query += ' AND gen = ?';   params.push(parseInt(gen)); }
    query += ' ORDER BY nickname ASC';
    const rows = db.prepare(query).all(...params);
    rows.forEach(r => { r.data = JSON.parse(r.data); });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pokemon', (req, res) => {
  try {
    const { nickname, species, owner, gen, data } = req.body;
    if (!species || !owner || !gen || !data) return res.status(400).json({ error: 'species, owner, gen, data required' });
    const result = db.prepare(
      'INSERT INTO saved_pokemon (nickname, species, owner, gen, data) VALUES (?, ?, ?, ?, ?)'
    ).run(nickname || species, species, owner, gen, JSON.stringify(data));
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/pokemon/:id', (req, res) => {
  try {
    const { nickname, species, owner, gen, data } = req.body;
    db.prepare(
      'UPDATE saved_pokemon SET nickname=?, species=?, owner=?, gen=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).run(nickname || species, species, owner, gen, JSON.stringify(data), req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/pokemon/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM saved_pokemon WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Opponents ──────────────────────────────────────────────────────────────

app.get('/api/opponents', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM opponents ORDER BY name ASC').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/opponents', (req, res) => {
  try {
    const { name, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = db.prepare('INSERT INTO opponents (name, notes) VALUES (?, ?)').run(name, notes || '');
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/opponents/:id', (req, res) => {
  try {
    const { name, notes } = req.body;
    db.prepare('UPDATE opponents SET name=?, notes=? WHERE id=?').run(name, notes || '', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/opponents/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM opponents WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Catch-all → index.html ─────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PokéDmgCalc running at http://0.0.0.0:${PORT}`);
  console.log(`Access from other devices via your local IP on port ${PORT}`);
});
