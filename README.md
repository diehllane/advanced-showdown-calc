# Advanced Showdown Calc

A locally hosted Pokémon damage calculator built on the same engine as Pokémon Showdown. Supports Gen 1–9, full field conditions, team management, opponent tracking, pokepaste import, and per-team type coverage charts.

Designed to run on a always-on machine and be accessible from any device on your home network.

---

## Features

- Damage calculator for Gen 1–9 (default Gen 7)
- Weather, terrain, hazards, screens, Tailwind, Helping Hand
- Full attacker/defender inputs — species, level, nature, item, ability, EVs, IVs, stat boosts, status, battle flags, current HP%
- Either side can initiate damage — press **Use** on any move to calculate
- Move learn method display (Level Up / TM / Egg / Tutor) via PokéAPI
- Save and load individual Pokémon per generation
- **My Teams** — 6-slot team builder with pokepaste import from Showdown export format
- **Opponents** — track recurring opponents and their team history
- **Type Coverage charts** — defensive and offensive coverage per team, lazy-loaded on demand
- Responsive dark theme, accessible from mobile

---

## Requirements

- [Node.js LTS](https://nodejs.org/) (v18 or later recommended)
- npm (included with Node)
- Git

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/diehllane/advanced-showdown-calc.git
cd advanced-showdown-calc
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the Smogon calc bundle

The damage engine (`@smogon/calc`) ships as a CommonJS module and needs to be bundled for browser use. Run this once after install:

```bash
npm run build:calc
```

This produces `public/js/smogon-calc.bundle.js`. You only need to rerun this if you update the `@smogon/calc` package version.

> **Windows note:** if you see `'browserify' is not recognized`, run `npm install -g browserify` first, then retry.

### 4. Start the server

```bash
npm start
```

The app will be available at [http://localhost:3000](http://localhost:3000).

The SQLite database (`db/pokedmgcalc.sqlite`) is created automatically on first run — no setup required.

---

## Accessing from other devices on your network

1. Find your machine's local IP address:
   - **Windows:** open Command Prompt and run `ipconfig` — look for **IPv4 Address** under your active adapter
   - **Mac/Linux:** run `ifconfig` or `ip addr` — look for `inet` under `en0` or `eth0`
2. On any other device connected to the same network, open a browser and go to `http://YOUR_IP:3000`

---

## Running as an always-on service (optional)

If you want the calculator to survive reboots without manually restarting it, use [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start server/index.js --name advanced-showdown-calc
pm2 save
pm2 startup
```

Run the command that `pm2 startup` outputs — it registers pm2 as a system service. After that, the app starts automatically on boot.

To stop or restart:

```bash
pm2 stop advanced-showdown-calc
pm2 restart advanced-showdown-calc
```

---

## Project structure

```
advanced-showdown-calc/
  server/
    index.js        — Express server and API routes
    database.js     — SQLite schema and connection
  public/
    index.html      — Main HTML
    css/
      style.css     — Dark tactical theme (Syne + Space Mono)
    js/
      data.js       — Static data: natures, gens, PokéAPI helpers
      pokemonForm.js — Species/move form builder
      calc.js       — Damage calc engine
      teams.js      — Team management and type coverage charts
      opponents.js  — Opponent tracking
      app.js        — App init, view switching, modals, toasts
  db/
    pokedmgcalc.sqlite  — Created automatically on first run
  package.json
  README.md
```

---

## Data and privacy

Move lists, base stats, and learn methods are fetched live from [PokéAPI](https://pokeapi.co/) — no API key required. All team and opponent data is stored locally in the SQLite database on your own machine. Nothing is sent to any external server.

---

## Credits

Damage calculations powered by [@smogon/calc](https://github.com/smogon/damage-calc) — the same engine used by [Pokémon Showdown](https://pokemonshowdown.com/).

Pokémon data provided by [PokéAPI](https://pokeapi.co/).
