const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../db/pokedmgcalc.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS opponents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    notes      TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS teams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    owner      TEXT NOT NULL CHECK(owner IN ('mine', 'opponent')),
    opponent_id INTEGER REFERENCES opponents(id) ON DELETE SET NULL,
    notes      TEXT DEFAULT '',
    pokemon    TEXT NOT NULL DEFAULT '[]',  -- JSON array of pokemon objects
    gen        INTEGER NOT NULL DEFAULT 7,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS saved_pokemon (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname   TEXT,
    species    TEXT NOT NULL,
    owner      TEXT NOT NULL CHECK(owner IN ('mine', 'opponent')),
    gen        INTEGER NOT NULL DEFAULT 7,
    data       TEXT NOT NULL DEFAULT '{}',  -- Full Pokémon set JSON
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
