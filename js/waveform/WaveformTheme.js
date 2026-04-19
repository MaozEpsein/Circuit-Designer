/**
 * WaveformTheme — Colors, typography, and metric constants.
 * Single source of truth for the visual language of the waveform.
 * See README "Waveform Pro" → Design Principles for the rationale.
 */

// Narrow palette by design: 5 colors total + neutral text.
export const COLORS = {
  bg:       '#0a0e14',
  grid:     'rgba(100,150,170,0.10)',   // quieter than before
  gridText: '#4a6080',
  high:     '#39ff14',                    // green for HIGH
  low:      '#3a4a60',                    // blue-grey for LOW (not red — easier on eyes)
  clock:    '#ffcc00',
  accent:   '#00d4ff',                    // cyan for interaction
  text:     '#c8d8f0',
  border:   '#1e3a50',
  axisMinor: 'rgba(100,150,170,0.06)',
  axisMajor: 'rgba(100,150,170,0.25)',
};

export const METRICS = {
  ROW_H:        32,
  ROW_H_BUS:    38,    // taller row for multi-bit bus signals (room for labels)
  ROW_GAP:       4,    // vertical breathing space between rows
  LABEL_W:      96,
  HEADER_H:     28,
  BASE_STEP_W:  60,
  MIN_ZOOM:     0.25,
  MAX_ZOOM:     8,
  RESIZE_HANDLE_H: 6,
  MIN_PANEL_H:  120,
  MAX_PANEL_FRAC: 0.8, // max 80% of viewport height
};

export const TYPE = {
  axis:   '10px "JetBrains Mono", monospace',
  label:  'bold 11px "JetBrains Mono", monospace',
  value:  '11px "JetBrains Mono", monospace',
  valueSmall: '9px "JetBrains Mono", monospace',
  hint:   '12px "JetBrains Mono", monospace',
};

// Curated palette for per-signal color assignment — harmonious, readable,
// avoids pure red (tiring on the eyes per design principles).
export const SIGNAL_PALETTE = [
  '#39ff14', // green
  '#00d4ff', // cyan
  '#ff6b9d', // pink
  '#ffcc00', // yellow
  '#a060ff', // purple
  '#ff8a5a', // orange
  '#7fff8e', // mint
  '#5ab0ff', // sky blue
  '#e0a0f8', // lavender
  '#ffd780', // peach
];

/** Stable hash of a string → index in SIGNAL_PALETTE (djb2). */
export function colorForName(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
  return SIGNAL_PALETTE[h % SIGNAL_PALETTE.length];
}
