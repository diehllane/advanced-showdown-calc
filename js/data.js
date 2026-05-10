// ── data.js ─────────────────────────────────────────────────────────────────
// Static reference data used across the app.
// Move learn method data is fetched from PokeAPI (free, public JSON API).

const NATURES = [
  'Hardy','Lonely','Brave','Adamant','Naughty',
  'Bold','Docile','Relaxed','Impish','Lax',
  'Timid','Hasty','Serious','Jolly','Naive',
  'Modest','Mild','Quiet','Bashful','Rash',
  'Calm','Gentle','Sassy','Careful','Quirky'
];

// Which stat each nature boosts/reduces [boost, reduce] (0=Atk,1=Def,2=SpA,3=SpD,4=Spe)
const NATURE_EFFECTS = {
  Hardy:null, Docile:null, Serious:null, Bashful:null, Quirky:null,
  Lonely:[0,1], Brave:[0,4], Adamant:[0,2], Naughty:[0,3],
  Bold:[1,0], Relaxed:[1,4], Impish:[1,2], Lax:[1,3],
  Timid:[4,0], Hasty:[4,1], Jolly:[4,2], Naive:[4,3],
  Modest:[2,0], Mild:[2,1], Quiet:[2,4], Rash:[2,3],
  Calm:[3,0], Gentle:[3,1], Sassy:[3,4], Careful:[3,2],
};

const STAT_NAMES = ['HP','Atk','Def','SpA','SpD','Spe'];

// Generation metadata
const GENS = {
  1: { label:'RBY', name:'Red/Blue/Yellow', max:151 },
  2: { label:'GSC', name:'Gold/Silver/Crystal', max:251 },
  3: { label:'ADV', name:'Ruby/Sapphire/Emerald', max:386 },
  4: { label:'DPP', name:'Diamond/Pearl/Platinum', max:493 },
  5: { label:'BW',  name:'Black/White', max:649 },
  6: { label:'XY',  name:'X/Y/ORAS', max:721 },
  7: { label:'SM',  name:'Sun/Moon/USUM', max:809 },
  8: { label:'SS',  name:'Sword/Shield', max:898 },
  9: { label:'SV',  name:'Scarlet/Violet', max:1025 },
};

// Version groups per gen for learn method lookup via PokeAPI
const GEN_VERSION_GROUP = {
  1: 'red-blue',
  2: 'gold-silver',
  3: 'emerald',
  4: 'platinum',
  5: 'black-2-white-2',
  6: 'omega-ruby-alpha-sapphire',
  7: 'ultra-sun-ultra-moon',
  8: 'sword-shield',
  9: 'scarlet-violet',
};

// All version groups up to each gen — used for move lookup so we don't miss
// moves that PokeAPI only records in an earlier game within the same gen
// (e.g. Haze/Soft-Boiled in sun-moon but not ultra-sun-ultra-moon)
const GEN_VERSION_GROUPS_CUMULATIVE = {
  1: ['red-blue','yellow'],
  2: ['red-blue','yellow','gold-silver','crystal'],
  3: ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen'],
  4: ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen',
      'diamond-pearl','platinum','heartgold-soulsilver'],
  5: ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen',
      'diamond-pearl','platinum','heartgold-soulsilver','black-white','black-2-white-2'],
  6: ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen',
      'diamond-pearl','platinum','heartgold-soulsilver','black-white','black-2-white-2',
      'x-y','omega-ruby-alpha-sapphire'],
  7: ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen',
      'diamond-pearl','platinum','heartgold-soulsilver','black-white','black-2-white-2',
      'x-y','omega-ruby-alpha-sapphire','sun-moon','ultra-sun-ultra-moon'],
  8: ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen',
      'diamond-pearl','platinum','heartgold-soulsilver','black-white','black-2-white-2',
      'x-y','omega-ruby-alpha-sapphire','sun-moon','ultra-sun-ultra-moon','sword-shield'],
  9: ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen',
      'diamond-pearl','platinum','heartgold-soulsilver','black-white','black-2-white-2',
      'x-y','omega-ruby-alpha-sapphire','sun-moon','ultra-sun-ultra-moon','sword-shield',
      'scarlet-violet'],
};

// Learn method display labels
const LEARN_METHOD_LABELS = {
  'level-up':   'Level Up',
  'machine':    'TM/HM',
  'egg':        'Egg Move',
  'tutor':      'Move Tutor',
  'stadium-surfing-pikachu': 'Special',
  'light-ball-egg': 'Special Egg',
  'colosseum-purification': 'Colosseum',
  'xd-shadow':  'XD Shadow',
  'xd-purification': 'XD',
  'form-change': 'Form Change',
};

// Common held items (simplified; @smogon/calc has the full list internally)
const COMMON_ITEMS = [
  'None',
  'Choice Band','Choice Specs','Choice Scarf',
  'Life Orb','Expert Belt',
  'Leftovers','Black Sludge',
  'Rocky Helmet','Assault Vest',
  'Eviolite','Thick Club','Deep Sea Tooth','Deep Sea Scale',
  'Light Ball','Soul Dew',
  'Lum Berry','Sitrus Berry','Salac Berry','Petaya Berry','Liechi Berry',
  'Apicot Berry','Ganlon Berry','Lansat Berry','Starf Berry','Micle Berry',
  'Weakness Policy','Safety Goggles',
  'Air Balloon','Red Card',
  'Focus Sash','Focus Band',
  'Power Herb','White Herb',
  'Terrain Extender','Smooth Rock','Damp Rock','Icy Rock','Heat Rock',
  'Electric Seed','Grassy Seed','Misty Seed','Psychic Seed',
  'Flame Orb','Toxic Orb',
  'Muscle Band','Wise Glasses',
  'Mystic Water','Charcoal','Miracle Seed','Magnet','Never-Melt Ice',
  'Spell Tag','TwistedSpoon','Sharp Beak','Silvery','Hard Stone',
  'Dragon Fang','Poison Barb','Silk Scarf','Black Belt','Metal Coat',
  // Speed-modifying items
  'Iron Ball','Macho Brace','Power Weight','Power Bracer','Power Belt',
  'Power Lens','Power Band','Power Anklet',
  'Quick Powder',
  // Accuracy/evasion
  'Bright Powder','Lax Incense',
  // Gen 1–2 items
  'Pink Bow','Polkadot Bow','Stick',
  'Metronome',
  'Booster Energy','Loaded Dice',
  'Z-Crystal', // generic placeholder shown in selector
];

// Species slug overrides — PokeAPI uses different slugs for some Pokémon
// than their display names or Showdown names would produce
const SPECIES_SLUG_OVERRIDES = {
  'mimikyu':         'mimikyu-disguised',
  'wishiwashi':      'wishiwashi-solo',
  'minior':          'minior-red-meteor',
  'lycanroc':        'lycanroc-midday',
  'oricorio':        'oricorio-baile',
  'silvally':        'silvally',
  'kommo-o':         'kommo-o',
  'hakamo-o':        'hakamo-o',
  'jangmo-o':        'jangmo-o',
  'type-null':       'type-null',
  'tapu-koko':       'tapu-koko',
  'tapu-lele':       'tapu-lele',
  'tapu-bulu':       'tapu-bulu',
  'tapu-fini':       'tapu-fini',
  'mr-mime':         'mr-mime',
  'mime-jr':         'mime-jr',
  'mr-rime':         'mr-rime',
  'porygon-z':       'porygon-z',
  'ho-oh':           'ho-oh',
  'jangmo-o':        'jangmo-o',
  'nidoran-f':       'nidoran-f',
  'nidoran-m':       'nidoran-m',
  'farfetchd':       'farfetchd',
  'sirfetchd':       'sirfetchd',
  'flabebe':         'flabebe',
};

function speciesSlug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
  return SPECIES_SLUG_OVERRIDES[base] ?? base;
}

// PokeAPI base
const POKEAPI = 'https://pokeapi.co/api/v2';

// Cache for API results (session only)
const _apiCache = {};

async function fetchPokeAPI(endpoint) {
  if (_apiCache[endpoint]) return _apiCache[endpoint];
  const r = await fetch(POKEAPI + endpoint);
  if (!r.ok) throw new Error(`PokeAPI ${r.status}: ${endpoint}`);
  const data = await r.json();
  _apiCache[endpoint] = data;
  return data;
}

/**
 * Get move learn methods for a Pokémon + move in a given gen.
 * Returns array of {method, level} objects.
 */
async function getMoveLearnMethods(speciesName, moveName, gen) {
  try {
    const slug = speciesSlug(speciesName);
    const moveSlug = moveName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g,'-');
    const data = await fetchPokeAPI(`/pokemon/${slug}`);
    const vg = GEN_VERSION_GROUP[gen] || GEN_VERSION_GROUP[7];

    const entry = data.moves.find(m => m.move.name === moveSlug);
    if (!entry) return [];

    const methods = entry.version_group_details
      .filter(d => d.version_group.name === vg)
      .map(d => ({
        method: d.move_learn_method.name,
        level: d.level_learned_at,
      }));
    return methods;
  } catch (e) {
    console.warn('getMoveLearnMethods:', e.message);
    return [];
  }
}

/**
 * Fetch all moves available to a species in a given gen via PokeAPI.
 * Returns array of move name strings (slug format).
 */
async function getPokemonMoves(speciesName, gen) {
  try {
    const slug = speciesSlug(speciesName);
    const data = await fetchPokeAPI(`/pokemon/${slug}`);
    // Return all moves across all generations — version group filtering was too aggressive
    // and dropped valid moves PokeAPI records under different groups (e.g. Haze on Toxapex,
    // Moonblast on Clefable). Smogon/calc handles actual move legality per gen internally.
    return data.moves.map(m => m.move.name);
  } catch (e) {
    console.warn('getPokemonMoves:', e.message);
    return [];
  }
}

/**
 * Fetch base stats + types for a species via PokeAPI.
 */
async function getPokemonBaseData(speciesName) {
  try {
    const slug = speciesSlug(speciesName);
    const data = await fetchPokeAPI(`/pokemon/${slug}`);
    const stats = {};
    data.stats.forEach(s => {
      const key = s.stat.name; // hp, attack, defense, special-attack, special-defense, speed
      stats[key] = s.base_stat;
    });
    const types = data.types.map(t => capitalise(t.type.name));
    const sprite = data.sprites?.front_default || null;
    return { stats, types, sprite };
  } catch (e) {
    console.warn('getPokemonBaseData:', e.message);
    return null;
  }
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Smogon sets (Gen 7 examples baked in; more loaded from Smogon's public JSON at runtime)
// Smogon exposes sets at: https://www.smogon.com/dex/sm/pokemon/<name>/
// Their raw JSON endpoint (unofficial but stable): 
// https://smogon.com/stats/ (usage) and https://pikalytics.com/api/ (sets)
// We use the Smogon damage calc's own sets data which ships with @smogon/calc
// Access: Calc.Sets[gen][species] if available via the UMD build

async function getSmogonSets(speciesName, gen) {
  // The @smogon/calc UMD build exposes window.calc.Sets
  try {
    if (window.calc && window.calc.Sets) {
      const genSets = window.calc.Sets[gen];
      if (genSets) {
        const key = Object.keys(genSets).find(k => k.toLowerCase() === speciesName.toLowerCase());
        if (key) return genSets[key];
      }
    }
  } catch(e) {}
  return null;
}
