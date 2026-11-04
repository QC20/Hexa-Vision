// ─────────────────────────────────────────────────────────────────────────────
// Hexa Vision — Palettes
//
// outline   → colour of the Voronoi ridges
// fill      → colour of the cell interiors
// highlight → light added on top, also used as the UI accent
// ─────────────────────────────────────────────────────────────────────────────

export const PALETTES = [
  { name: 'Original', outline: '#0a0060', fill: '#ff005f', highlight: '#00ff00' },
  { name: 'Reef',     outline: '#0b1e8a', fill: '#ff5a3c', highlight: '#00ffb0' },
  { name: 'Ember',    outline: '#2a0500', fill: '#ff6a00', highlight: '#ffd36b' },
  { name: 'Glacier',  outline: '#00163a', fill: '#5fd0ff', highlight: '#d8f6ff' },
  { name: 'Orchid',   outline: '#1d0038', fill: '#c13cff', highlight: '#ff7ad9' },
  { name: 'Acid',     outline: '#002914', fill: '#b6ff00', highlight: '#00ffd5' },
  { name: 'Pearl',    outline: '#141414', fill: '#9a9a9a', highlight: '#ffffff' },
  { name: 'Dusk',     outline: '#26093d', fill: '#ff3d6e', highlight: '#ffb347' },
];

// Fully random hex colours usually clash, so this works in hue space: a dark
// base, a fill pushed around the wheel, and a bright highlight in between.
export function randomPalette() {
  const base = Math.random() * 360;
  const fill = base + 120 + Math.random() * 110;
  const highlight = base + 35 + Math.random() * 50;

  return {
    name: 'Random',
    outline: hsl(base, 85, 14),
    fill: hsl(fill, 90, 55),
    highlight: hsl(highlight, 100, 60),
  };
}

// three.js only parses integer percentages in hsl() strings.
function hsl(h, s, l) {
  return `hsl(${Math.round(h % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}
