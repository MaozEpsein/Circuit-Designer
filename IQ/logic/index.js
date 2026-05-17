/**
 * IQ — logic questions. See IQ/README.md and IQ/timing-cdc/index.js for the
 * shape. Add entries to QUESTIONS and they appear in the panel automatically.
 */

import { build, h } from '../../js/interview/circuitHelpers.js';

// ─── transistor helpers (used by CMOS schematic SVGs below) ───
// Each transistor is drawn at (x, y) as a small box: top pin = source,
// bottom pin = drain, left = gate. PMOS has a bubble at the gate;
// NMOS does not. Colors mirror the rest of the app's palette.
const _PMOS_COLOR = '#f0d080';
const _NMOS_COLOR = '#80f080';
const _WIRE       = '#c8d8f0';
const _LABEL      = '#c8d8f0';

function _tx(kind, x, y, label) {
  const c = (kind === 'p') ? _PMOS_COLOR : _NMOS_COLOR;
  return `
    <g transform="translate(${x},${y})">
      <rect x="-8" y="-14" width="16" height="28" fill="#0a1520" stroke="${c}" stroke-width="1.6" rx="2"/>
      <line x1="-22" y1="0" x2="${kind === 'p' ? -13 : -8}" y2="0" stroke="${c}" stroke-width="1.5"/>
      ${kind === 'p' ? `<circle cx="-11" cy="0" r="2.5" fill="#0a1520" stroke="${c}" stroke-width="1.4"/>` : ''}
      ${label ? `<text x="14" y="4" fill="${c}" font-size="11" font-weight="bold">${label}</text>` : ''}
    </g>`;
}
function _pmos(x, y, label) { return _tx('p', x, y, label); }
function _nmos(x, y, label) { return _tx('n', x, y, label); }

function _vdd(cx, y) {
  return `
    <line x1="${cx - 20}" y1="${y}" x2="${cx + 20}" y2="${y}" stroke="${_WIRE}" stroke-width="2"/>
    <text x="${cx - 12}" y="${y - 6}" fill="${_LABEL}" font-size="11" font-weight="bold">Vdd</text>`;
}
function _vss(cx, y) {
  return `
    <line x1="${cx - 18}" y1="${y}"      x2="${cx + 18}" y2="${y}"      stroke="${_WIRE}" stroke-width="2"/>
    <line x1="${cx - 12}" y1="${y + 6}"  x2="${cx + 12}" y2="${y + 6}"  stroke="${_WIRE}" stroke-width="1.4"/>
    <line x1="${cx - 6}"  y1="${y + 12}" x2="${cx + 6}"  y2="${y + 12}" stroke="${_WIRE}" stroke-width="1.4"/>
    <text x="${cx - 8}"   y="${y + 28}" fill="${_LABEL}" font-size="11" font-weight="bold">Vss</text>`;
}
function _dot(x, y, color = _WIRE) {
  return `<circle cx="${x}" cy="${y}" r="2.6" fill="${color}"/>`;
}

// ─── reference inverter — shown as the question's `schematic` ───
const NOT_INVERTER_SVG = `
<svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="CMOS inverter (NOT gate)">
  ${_vdd(140, 20)}
  <line x1="140" y1="20" x2="140" y2="56" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_pmos(140, 70, 'P')}
  <line x1="140" y1="84" x2="140" y2="130" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_dot(140, 130, '#80f0a0')}
  <line x1="140" y1="130" x2="230" y2="130" stroke="#80f0a0" stroke-width="1.5"/>
  <text x="232" y="134" fill="#80f0a0" font-weight="bold">Out</text>
  <line x1="140" y1="130" x2="140" y2="156" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_nmos(140, 170, 'N')}
  <line x1="140" y1="184" x2="140" y2="216" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_vss(140, 216)}
  <!-- Shared gate input A -->
  <line x1="40" y1="130" x2="60"  y2="130" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="60" y1="70"  x2="60"  y2="170" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="60" y1="70"  x2="118" y2="70"  stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="60" y1="170" x2="118" y2="170" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(60, 130, '#80b0e0')}
  <text x="22" y="134" fill="#80b0e0" font-weight="bold">A</text>
</svg>
`;

// ─── FA K-maps (SUM + COUT) ─────────────────────────────────────
const FA_KMAP_SVG = `
<svg viewBox="0 0 620 340" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="K-maps for FA SUM and COUT">
  <text x="310" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">K-maps עבור FA</text>

  <!-- ===== SUM K-map (left) ===== -->
  <text x="155" y="50" text-anchor="middle" fill="#80f0a0" font-size="12" font-weight="bold">SUM = A ⊕ B ⊕ Cin</text>
  <text x="155" y="72" text-anchor="middle" fill="#80b0e0" font-size="10" font-weight="bold">B,Cin</text>
  <text x="50"  y="170" fill="#80b0e0" font-size="10" font-weight="bold">A</text>
  <g fill="#c8d8f0" font-size="10" text-anchor="middle">
    <text x="105" y="90">00</text>
    <text x="145" y="90">01</text>
    <text x="185" y="90">11</text>
    <text x="225" y="90">10</text>
  </g>
  <g fill="#c8d8f0" font-size="10" text-anchor="end">
    <text x="78" y="118">0</text>
    <text x="78" y="158">1</text>
  </g>
  <g stroke="#506080" stroke-width="1" fill="none">
    <rect x="85" y="100" width="160" height="80"/>
    <line x1="125" y1="100" x2="125" y2="180"/>
    <line x1="165" y1="100" x2="165" y2="180"/>
    <line x1="205" y1="100" x2="205" y2="180"/>
    <line x1="85"  y1="140" x2="245" y2="140"/>
  </g>
  <g fill="#c8d8f0" font-size="13" text-anchor="middle" font-weight="bold">
    <text x="105" y="125" fill="#506080">0</text>
    <text x="145" y="125">1</text>
    <text x="185" y="125" fill="#506080">0</text>
    <text x="225" y="125">1</text>
    <text x="105" y="165">1</text>
    <text x="145" y="165" fill="#506080">0</text>
    <text x="185" y="165">1</text>
    <text x="225" y="165" fill="#506080">0</text>
  </g>
  <text x="155" y="210" text-anchor="middle" fill="#c8d8f0" font-size="10">תבנית "שחמט" — אין קבוצות,</text>
  <text x="155" y="225" text-anchor="middle" fill="#c8d8f0" font-size="10">לכן SUM = A ⊕ B ⊕ Cin.</text>

  <!-- ===== COUT K-map (right) ===== -->
  <text x="465" y="50" text-anchor="middle" fill="#80f0a0" font-size="12" font-weight="bold">COUT = AB + A·Cin + B·Cin</text>
  <text x="465" y="72" text-anchor="middle" fill="#80b0e0" font-size="10" font-weight="bold">B,Cin</text>
  <text x="360" y="170" fill="#80b0e0" font-size="10" font-weight="bold">A</text>
  <g fill="#c8d8f0" font-size="10" text-anchor="middle">
    <text x="415" y="90">00</text>
    <text x="455" y="90">01</text>
    <text x="495" y="90">11</text>
    <text x="535" y="90">10</text>
  </g>
  <g fill="#c8d8f0" font-size="10" text-anchor="end">
    <text x="388" y="118">0</text>
    <text x="388" y="158">1</text>
  </g>
  <g stroke="#506080" stroke-width="1" fill="none">
    <rect x="395" y="100" width="160" height="80"/>
    <line x1="435" y1="100" x2="435" y2="180"/>
    <line x1="475" y1="100" x2="475" y2="180"/>
    <line x1="515" y1="100" x2="515" y2="180"/>
    <line x1="395" y1="140" x2="555" y2="140"/>
  </g>
  <g fill="#c8d8f0" font-size="13" text-anchor="middle" font-weight="bold">
    <text x="415" y="125" fill="#506080">0</text>
    <text x="455" y="125" fill="#506080">0</text>
    <text x="495" y="125">1</text>
    <text x="535" y="125" fill="#506080">0</text>
    <text x="415" y="165" fill="#506080">0</text>
    <text x="455" y="165">1</text>
    <text x="495" y="165">1</text>
    <text x="535" y="165">1</text>
  </g>
  <!-- B·Cin group (vertical, col=11) -->
  <rect x="478" y="106" width="34" height="68" rx="14" fill="none" stroke="#40d0f0" stroke-width="2.2"/>
  <text x="498" y="245" text-anchor="middle" fill="#40d0f0" font-size="10" font-weight="bold">B·Cin</text>
  <!-- A·Cin group (row A=1, cols 01,11) -->
  <rect x="441" y="148" width="74" height="28" rx="13" fill="none" stroke="#f0a040" stroke-width="2.2"/>
  <text x="478" y="265" text-anchor="middle" fill="#f0a040" font-size="10" font-weight="bold">A·Cin</text>
  <!-- A·B group (row A=1, cols 11,10) -->
  <rect x="481" y="152" width="74" height="24" rx="12" fill="none" stroke="#39ff80" stroke-width="2.2"/>
  <text x="518" y="285" text-anchor="middle" fill="#39ff80" font-size="10" font-weight="bold">A·B</text>
  <text x="465" y="305" text-anchor="middle" fill="#c8d8f0" font-size="10">3 קבוצות-2 → COUT = AB + ACin + BCin.</text>
  <text x="465" y="320" text-anchor="middle" fill="#c8d8f0" font-size="10">אופטימיזציה: AB + (A⊕B)·Cin — חולק XOR עם SUM.</text>
</svg>
`;

// ─── 2:4 Decoder K-maps + schematic ─────────────────────────────
const DEC24_KMAP_SVG = `
<svg viewBox="0 0 560 320" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="K-maps for 2:4 decoder">
  <text x="280" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">K-maps עבור Decoder 2:4</text>

  <!-- 4 small K-maps, 2x2 each. Layout: 4 columns. -->
  <!-- Generic axes label -->
  <text x="280" y="40" text-anchor="middle" fill="#c8d8f0" font-size="10">שורות = A1, עמודות = A0</text>

  <!-- Y0 -->
  <g transform="translate(40,60)">
    <text x="55" y="0" text-anchor="middle" fill="#80f0a0" font-weight="bold">Y0 = A1'·A0'</text>
    <g fill="#c8d8f0" font-size="10" text-anchor="middle">
      <text x="40" y="22">0</text><text x="80" y="22">1</text>
    </g>
    <g fill="#c8d8f0" font-size="10" text-anchor="end">
      <text x="18" y="50">0</text><text x="18" y="80">1</text>
    </g>
    <g stroke="#506080" fill="none"><rect x="25" y="30" width="80" height="60"/><line x1="65" y1="30" x2="65" y2="90"/><line x1="25" y1="60" x2="105" y2="60"/></g>
    <g fill="#c8d8f0" font-size="13" text-anchor="middle" font-weight="bold">
      <text x="40" y="52">1</text><text x="80" y="52" fill="#506080">0</text>
      <text x="40" y="82" fill="#506080">0</text><text x="80" y="82" fill="#506080">0</text>
    </g>
    <rect x="28" y="34" width="34" height="24" rx="10" fill="none" stroke="#39ff80" stroke-width="2"/>
  </g>

  <!-- Y1 -->
  <g transform="translate(170,60)">
    <text x="55" y="0" text-anchor="middle" fill="#80f0a0" font-weight="bold">Y1 = A1'·A0</text>
    <g fill="#c8d8f0" font-size="10" text-anchor="middle"><text x="40" y="22">0</text><text x="80" y="22">1</text></g>
    <g fill="#c8d8f0" font-size="10" text-anchor="end"><text x="18" y="50">0</text><text x="18" y="80">1</text></g>
    <g stroke="#506080" fill="none"><rect x="25" y="30" width="80" height="60"/><line x1="65" y1="30" x2="65" y2="90"/><line x1="25" y1="60" x2="105" y2="60"/></g>
    <g fill="#c8d8f0" font-size="13" text-anchor="middle" font-weight="bold">
      <text x="40" y="52" fill="#506080">0</text><text x="80" y="52">1</text>
      <text x="40" y="82" fill="#506080">0</text><text x="80" y="82" fill="#506080">0</text>
    </g>
    <rect x="68" y="34" width="34" height="24" rx="10" fill="none" stroke="#39ff80" stroke-width="2"/>
  </g>

  <!-- Y2 -->
  <g transform="translate(300,60)">
    <text x="55" y="0" text-anchor="middle" fill="#80f0a0" font-weight="bold">Y2 = A1·A0'</text>
    <g fill="#c8d8f0" font-size="10" text-anchor="middle"><text x="40" y="22">0</text><text x="80" y="22">1</text></g>
    <g fill="#c8d8f0" font-size="10" text-anchor="end"><text x="18" y="50">0</text><text x="18" y="80">1</text></g>
    <g stroke="#506080" fill="none"><rect x="25" y="30" width="80" height="60"/><line x1="65" y1="30" x2="65" y2="90"/><line x1="25" y1="60" x2="105" y2="60"/></g>
    <g fill="#c8d8f0" font-size="13" text-anchor="middle" font-weight="bold">
      <text x="40" y="52" fill="#506080">0</text><text x="80" y="52" fill="#506080">0</text>
      <text x="40" y="82">1</text><text x="80" y="82" fill="#506080">0</text>
    </g>
    <rect x="28" y="64" width="34" height="24" rx="10" fill="none" stroke="#39ff80" stroke-width="2"/>
  </g>

  <!-- Y3 -->
  <g transform="translate(430,60)">
    <text x="55" y="0" text-anchor="middle" fill="#80f0a0" font-weight="bold">Y3 = A1·A0</text>
    <g fill="#c8d8f0" font-size="10" text-anchor="middle"><text x="40" y="22">0</text><text x="80" y="22">1</text></g>
    <g fill="#c8d8f0" font-size="10" text-anchor="end"><text x="18" y="50">0</text><text x="18" y="80">1</text></g>
    <g stroke="#506080" fill="none"><rect x="25" y="30" width="80" height="60"/><line x1="65" y1="30" x2="65" y2="90"/><line x1="25" y1="60" x2="105" y2="60"/></g>
    <g fill="#c8d8f0" font-size="13" text-anchor="middle" font-weight="bold">
      <text x="40" y="52" fill="#506080">0</text><text x="80" y="52" fill="#506080">0</text>
      <text x="40" y="82" fill="#506080">0</text><text x="80" y="82">1</text>
    </g>
    <rect x="68" y="64" width="34" height="24" rx="10" fill="none" stroke="#39ff80" stroke-width="2"/>
  </g>

  <!-- Interpretation -->
  <text x="280" y="200" text-anchor="middle" fill="#c8d8f0" font-size="11">פירוש: לכל פלט יש בדיוק minterm אחד = "1" — אין מה לאחד.</text>
  <text x="280" y="218" text-anchor="middle" fill="#c8d8f0" font-size="11">כל Yi מקבל את הקומבינציה הייחודית של A1,A0 שמייצגת את i בבינארי.</text>
  <text x="280" y="248" text-anchor="middle" fill="#80f0a0" font-size="12" font-weight="bold">Y0=A1'A0' ,  Y1=A1'A0 ,  Y2=A1A0' ,  Y3=A1A0</text>
  <text x="280" y="278" text-anchor="middle" fill="#c8d8f0" font-size="11">מימוש: 2 NOT (ל-A1', A0') + 4 AND דו-קלטיים.</text>
  <text x="280" y="296" text-anchor="middle" fill="#c8d8f0" font-size="11">סה"כ: 6 שערים. עם Enable: הופכים את 4 ה-AND ל-3 קלטיים (AND עם EN).</text>
</svg>
`;

// ─── NOR (answer א) ─────────────────────────────────────────────
const NOR_SVG = `
<svg viewBox="0 0 380 360" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="CMOS NOR gate">
  ${_vdd(180, 20)}
  <line x1="180" y1="20" x2="180" y2="56" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_pmos(180, 70, 'P1')}
  <line x1="180" y1="84" x2="180" y2="116" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_pmos(180, 130, 'P2')}
  <line x1="180" y1="144" x2="180" y2="190" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_dot(180, 190, '#80f0a0')}
  <line x1="180" y1="190" x2="270" y2="190" stroke="#80f0a0" stroke-width="1.5"/>
  <text x="275" y="194" fill="#80f0a0" font-weight="bold">Out</text>
  <line x1="130" y1="190" x2="230" y2="190" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="130" y1="190" x2="130" y2="226" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="230" y1="190" x2="230" y2="226" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_nmos(130, 240, 'N1')}
  ${_nmos(230, 240, 'N2')}
  <line x1="130" y1="254" x2="130" y2="296" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="230" y1="254" x2="230" y2="296" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="130" y1="296" x2="230" y2="296" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="180" y1="296" x2="180" y2="306" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_vss(180, 306)}
  <!-- Gate A: left bus -->
  <line x1="40" y1="70" x2="158" y2="70" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="40" y1="70" x2="40" y2="240" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="40" y1="240" x2="108" y2="240" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(40, 155, '#80b0e0')}
  <text x="20" y="159" fill="#80b0e0" font-weight="bold">A</text>
  <!-- Gate B: right bus (around Out) -->
  <line x1="158" y1="130" x2="320" y2="130" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="320" y1="130" x2="320" y2="240" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="208" y1="240" x2="320" y2="240" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(320, 185, '#80b0e0')}
  <text x="332" y="189" fill="#80b0e0" font-weight="bold">B</text>
</svg>
`;

// ─── NAND (answer ב) ─────────────────────────────────────────────
const NAND_SVG = `
<svg viewBox="0 0 380 360" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="CMOS NAND gate">
  ${_vdd(180, 20)}
  <line x1="130" y1="20" x2="230" y2="20" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="130" y1="20" x2="130" y2="56" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="230" y1="20" x2="230" y2="56" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_pmos(130, 70, 'P1')}
  ${_pmos(230, 70, 'P2')}
  <line x1="130" y1="84" x2="130" y2="126" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="230" y1="84" x2="230" y2="126" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="130" y1="126" x2="230" y2="126" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="180" y1="126" x2="180" y2="160" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_dot(180, 160, '#80f0a0')}
  <line x1="180" y1="160" x2="270" y2="160" stroke="#80f0a0" stroke-width="1.5"/>
  <text x="275" y="164" fill="#80f0a0" font-weight="bold">Out</text>
  <line x1="180" y1="160" x2="180" y2="186" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_nmos(180, 200, 'N1')}
  <line x1="180" y1="214" x2="180" y2="246" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_nmos(180, 260, 'N2')}
  <line x1="180" y1="274" x2="180" y2="306" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_vss(180, 306)}
  <!-- Gate A: left bus -->
  <line x1="40" y1="70" x2="108" y2="70" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="40" y1="70" x2="40" y2="200" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="40" y1="200" x2="158" y2="200" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(40, 135, '#80b0e0')}
  <text x="20" y="139" fill="#80b0e0" font-weight="bold">A</text>
  <!-- Gate B: right bus -->
  <line x1="208" y1="70"  x2="320" y2="70"  stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="320" y1="70"  x2="320" y2="260" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="158" y1="260" x2="320" y2="260" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(320, 165, '#80b0e0')}
  <text x="332" y="169" fill="#80b0e0" font-weight="bold">B</text>
</svg>
`;

// ─── (C + B·A)' complex gate (answer ג) ─────────────────────────
const CBA_SVG = `
<svg viewBox="0 0 440 460" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="CMOS implementation of Y = (C + B·A)'">
  ${_vdd(210, 20)}
  <line x1="210" y1="20" x2="210" y2="56" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_pmos(210, 70, 'PC')}
  <line x1="210" y1="84" x2="210" y2="116" stroke="${_WIRE}" stroke-width="1.4"/>
  <!-- Split for PA || PB parallel -->
  <line x1="150" y1="116" x2="270" y2="116" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="150" y1="116" x2="150" y2="146" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="270" y1="116" x2="270" y2="146" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_pmos(150, 160, 'PA')}
  ${_pmos(270, 160, 'PB')}
  <line x1="150" y1="174" x2="150" y2="216" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="270" y1="174" x2="270" y2="216" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="150" y1="216" x2="270" y2="216" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="210" y1="216" x2="210" y2="240" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_dot(210, 240, '#80f0a0')}
  <line x1="210" y1="240" x2="335" y2="240" stroke="#80f0a0" stroke-width="1.5"/>
  <text x="340" y="244" fill="#80f0a0" font-weight="bold">Y</text>
  <!-- Pull-down: NC parallel with (NA series NB) -->
  <line x1="210" y1="240" x2="210" y2="266" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="150" y1="266" x2="270" y2="266" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="150" y1="266" x2="150" y2="296" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="270" y1="266" x2="270" y2="296" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_nmos(150, 310, 'NC')}
  ${_nmos(270, 310, 'NA')}
  <line x1="150" y1="324" x2="150" y2="396" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="270" y1="324" x2="270" y2="346" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_nmos(270, 360, 'NB')}
  <line x1="270" y1="374" x2="270" y2="396" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="150" y1="396" x2="270" y2="396" stroke="${_WIRE}" stroke-width="1.4"/>
  <line x1="210" y1="396" x2="210" y2="406" stroke="${_WIRE}" stroke-width="1.4"/>
  ${_vss(210, 406)}
  <!-- Gate C: far-left bus to PC and NC -->
  <line x1="40" y1="70"  x2="188" y2="70"  stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="40" y1="70"  x2="40"  y2="310" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="40" y1="310" x2="128" y2="310" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(40, 200, '#80b0e0')}
  <text x="20" y="204" fill="#80b0e0" font-weight="bold">C</text>
  <!-- Gate A: left-inner bus (x=80) to PA and NA, routed around -->
  <line x1="80"  y1="160" x2="128" y2="160" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="80"  y1="160" x2="80"  y2="288" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="80"  y1="288" x2="248" y2="288" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="248" y1="288" x2="248" y2="310" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(80, 220, '#80b0e0')}
  <text x="60" y="224" fill="#80b0e0" font-weight="bold">A</text>
  <!-- Gate B: right bus (x=390) to PB and NB -->
  <line x1="248" y1="160" x2="390" y2="160" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="390" y1="160" x2="390" y2="360" stroke="#80b0e0" stroke-width="1.5"/>
  <line x1="248" y1="360" x2="390" y2="360" stroke="#80b0e0" stroke-width="1.5"/>
  ${_dot(390, 260, '#80b0e0')}
  <text x="402" y="264" fill="#80b0e0" font-weight="bold">B</text>
</svg>
`;

export const QUESTIONS = [
  {
    id: 'fa-and-popcount-7bit',
    difficulty: 'medium',
    title: 'FA + סופר אחדות 7-ביט',
    intro:
`**א.** ממש \`FA\` בשערים בסיסיים.
**ב.** ממש סופר אחדות לקלט בן 7 סיביות במספר מינימלי של FAs.`,
    parts: [
      {
        label: 'א',
        question: 'ממש \`FA\` (כניסות A, B, Cin) בשערי XOR/AND/OR.',
        hints: [
          '\`SUM = A ⊕ B ⊕ Cin\` (XOR נותן 1 כשמספר האחדות אי-זוגי).',
          '\`COUT = (A·B) + ((A⊕B)·Cin)\` — מנצל את ה-XOR הראשון.',
        ],
        answer:
`**טבלת אמת (A,B,Cin → SUM,COUT):**

| A | B | Cin | SUM | COUT |
|---|---|-----|-----|------|
| 0 | 0 | 0   | 0   | 0    |
| 0 | 0 | 1   | 1   | 0    |
| 0 | 1 | 0   | 1   | 0    |
| 0 | 1 | 1   | 0   | 1    |
| 1 | 0 | 0   | 1   | 0    |
| 1 | 0 | 1   | 0   | 1    |
| 1 | 1 | 0   | 0   | 1    |
| 1 | 1 | 1   | 1   | 1    |

**מפת קרנו ל-SUM** — אחדות ב-m1,m2,m4,m7 בתבנית "שחמט" → אף שתי משבצות סמוכות לא נותנות 1 → אין קבוצות → לא ניתן לפשט:
\`SUM = A ⊕ B ⊕ Cin\` (XOR ⇔ פריטי אחדות אי-זוגיים).

**מפת קרנו ל-COUT** — אחדות ב-m3,m5,m6,m7. שלוש קבוצות-2 חופפות:
- \`AB\` (m6,m7 — שורה A=1, עמודות BCin=11,10)
- \`A·Cin\` (m5,m7 — שורה A=1, עמודות BCin=01,11)
- \`B·Cin\` (m3,m7 — עמודה BCin=11, שני השורות)

\`COUT = AB + A·Cin + B·Cin\` — צורה "סימטרית-רוב": COUT=1 אם רוב הקלטים = 1.

**אופטימיזציה למימוש משותף עם SUM:**
\`COUT = (A·B) + ((A⊕B)·Cin)\` — ה-XOR שכבר חישבנו ל-SUM משמש שוב, חוסך שער.

**מימוש סופי — 5 שערים:** 2 XOR + 2 AND + 1 OR. הפלט (COUT,SUM) הוא A+B+Cin ב-2 ביטים.`,
        answerSchematic: FA_KMAP_SVG,
        expectedAnswers: [
          'a ⊕ b', 'a^b', 'a xor b', 'xor',
          'a · b', 'a*b', 'a&b', 'a and b',
          '(a·b)', 'sum', 'cout', '5',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          // Inputs
          const A   = h.input(120, 140, 'A');
          const B   = h.input(120, 240, 'B');
          const Cin = h.input(120, 420, 'Cin');
          A.fixedValue = 1;  B.fixedValue = 1;  Cin.fixedValue = 0;

          // Gates
          const xor1 = h.gate('XOR', 360, 180);
          const and1 = h.gate('AND', 360, 300);
          const xor2 = h.gate('XOR', 600, 240);
          const and2 = h.gate('AND', 600, 380);
          const orG  = h.gate('OR',  840, 340);

          // Outputs
          const SUM  = h.output(1080, 240, 'SUM');
          const COUT = h.output(1080, 340, 'COUT');

          return {
            nodes: [A, B, Cin, xor1, and1, xor2, and2, orG, SUM, COUT],
            wires: [
              h.wire(A.id,   xor1.id, 0),
              h.wire(B.id,   xor1.id, 1),
              h.wire(A.id,   and1.id, 0),
              h.wire(B.id,   and1.id, 1),
              h.wire(xor1.id, xor2.id, 0),
              h.wire(Cin.id,  xor2.id, 1),
              h.wire(xor1.id, and2.id, 0),
              h.wire(Cin.id,  and2.id, 1),
              h.wire(and1.id, orG.id,  0),
              h.wire(and2.id, orG.id,  1),
              h.wire(xor2.id, SUM.id,  0),
              h.wire(orG.id,  COUT.id, 0),
            ],
          };
        }),
      },
      {
        label: 'ב',
        question: 'כמה FAs צריך לסופר אחדות של 7 ביטים? תאר את הקישור.',
        hints: [
          'FA הוא 3:2 compressor — מצמצם ביט אחד בכל הפעלה.',
          '7→3 ביטים = חיסכון של 4 → 4 FAs.',
        ],
        answer:
`**4 FAs** (מינימום: כל FA מצמצם ביט, 7→3 דורש 4).

- FA1(a0,a1,a2) → s1, c1
- FA2(a3,a4,a5) → s2, c2
- FA3(s1,s2,a6) → **o0**=s3, c3
- FA4(c1,c2,c3) → **o1**=s4, **o2**=c4

פלט: \`(o2,o1,o0)\`. זהו Wallace tree קטן.`,
        interviewerMindset:
`לא רוצה את המספר 4 — רוצה לראות שאתה **גוזר** אותו. "FA = 3:2 compressor, חוסך ביט אחד. 7→3 = חיסכון של 4 → 4 FAs." בלי הגזירה, התשובה היא ניחוש.

**בונוס:** להזכיר ש-Wallace/Dadda trees משתמשים באותו עיקרון לכפלים רב-ביטיים → מראה שאתה מבין את הקונטקסט הרחב.`,
        expectedAnswers: [
          '4', 'four', 'ארבעה', 'ארבע',
          'wallace', 'compressor', '3:2',
          'fa1', 'fa2', 'fa3', 'fa4',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          // 7 inputs — example: 1010110 (4 ones) → output 100
          const a = [
            h.input(80,  80,  'a0'),
            h.input(80,  170, 'a1'),
            h.input(80,  260, 'a2'),
            h.input(80,  400, 'a3'),
            h.input(80,  490, 'a4'),
            h.input(80,  580, 'a5'),
            h.input(80,  720, 'a6'),
          ];
          // 1010110: a0=0,a1=1,a2=1,a3=0,a4=1,a5=0,a6=1 (LSB-first reading);
          // popcount = 4 → output should be (1,0,0).
          const sample = [0, 1, 1, 0, 1, 0, 1];
          a.forEach((n, i) => { n.fixedValue = sample[i]; });

          const fa1 = h.fa(360, 170, 'FA1');   // a0,a1,a2
          const fa2 = h.fa(360, 490, 'FA2');   // a3,a4,a5
          const fa3 = h.fa(640, 360, 'FA3');   // s1, s2, a6
          const fa4 = h.fa(900, 540, 'FA4');   // c1, c2, c3

          const o0 = h.output(1180, 360, 'o0=s3');
          const o1 = h.output(1180, 560, 'o1=s4');
          const o2 = h.output(1180, 460, 'o2=c4');

          return {
            nodes: [...a, fa1, fa2, fa3, fa4, o0, o1, o2],
            wires: [
              // FA1 ← a0, a1, a2
              h.wire(a[0].id, fa1.id, 0),
              h.wire(a[1].id, fa1.id, 1),
              h.wire(a[2].id, fa1.id, 2),
              // FA2 ← a3, a4, a5
              h.wire(a[3].id, fa2.id, 0),
              h.wire(a[4].id, fa2.id, 1),
              h.wire(a[5].id, fa2.id, 2),
              // FA3 ← FA1.SUM, FA2.SUM, a6
              h.wire(fa1.id,  fa3.id, 0, 0),   // srcPin=0 (SUM)
              h.wire(fa2.id,  fa3.id, 1, 0),
              h.wire(a[6].id, fa3.id, 2),
              // FA4 ← FA1.COUT, FA2.COUT, FA3.COUT
              h.wire(fa1.id,  fa4.id, 0, 1),   // srcPin=1 (COUT)
              h.wire(fa2.id,  fa4.id, 1, 1),
              h.wire(fa3.id,  fa4.id, 2, 1),
              // Outputs: o0=FA3.SUM, o1=FA4.SUM, o2=FA4.COUT
              h.wire(fa3.id,  o0.id, 0, 0),
              h.wire(fa4.id,  o1.id, 0, 0),
              h.wire(fa4.id,  o2.id, 0, 1),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — לוגיקה קומבינטורית: FA + ספירת אחדות (popcount)',
    tags: ['fa', 'full-adder', 'popcount', 'wallace', 'combinational', 'logic'],
  },

  // ─────────────────────────────────────────────────────────────
  // #1002 — CMOS gate implementation (NOR, NAND, (C+BA)')
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cmos-gate-design',
    difficulty: 'medium',
    title: 'תכן שערים ב-CMOS: NOR, NAND, (C+BA)’',
    intro:
`נתון מהפך (\`NOT\`) ב-CMOS. בצורה דומה ממש את השערים הבאים.`,
    schematic: NOT_INVERTER_SVG,
    parts: [
      {
        label: 'א',
        question: 'ממש שער \`NOR\` בעל שני קלטים בטכנולוגיית CMOS.',
        hints: [
          'מתי הפלט גבוה? רק כש-A=0 וגם B=0.',
          'PDN: A=1 **או** B=1 → שני NMOS במקביל.',
          'PUN: A=0 **וגם** B=0 → שני PMOS בטור.',
        ],
        answer:
`PUN: 2 PMOS **בטור** (A,B). PDN: 2 NMOS **במקביל** (A,B). סה"כ 4 טרנזיסטורים.`,
        answerSchematic: NOR_SVG,
        expectedAnswers: [
          'pmos', 'nmos', 'series', 'parallel', 'טור', 'מקביל', 'מקבילי',
          '4', 'four', 'ארבעה', 'pun', 'pdn', 'pull-up', 'pull-down',
        ],
      },
      {
        label: 'ב',
        question: 'ממש שער \`NAND\` בעל שני קלטים בטכנולוגיית CMOS.',
        hints: [
          'מתי הפלט נמוך? רק כש-A=1 וגם B=1.',
          'PUN: A=0 **או** B=0 → שני PMOS במקביל.',
          'PDN: A=1 **וגם** B=1 → שני NMOS בטור.',
        ],
        answer:
`PUN: 2 PMOS **במקביל** (A,B). PDN: 2 NMOS **בטור** (A,B). סה"כ 4 טרנזיסטורים.

NAND הוא ה-dual של NOR (טור↔מקביל). ב-ASIC מעדיפים NAND כי PMOS איטיים, וב-NAND הם במקביל.`,
        answerSchematic: NAND_SVG,
        expectedAnswers: [
          'pmos', 'nmos', 'series', 'parallel', 'טור', 'מקביל', 'מקבילי',
          '4', 'four', 'ארבעה', 'pun', 'pdn',
        ],
      },
      {
        label: 'ג',
        question: 'ממש את \`Y = (C + B·A)\'\` ב-CMOS ב-stage יחיד.',
        hints: [
          'הפלט נמוך כש-C=1 או (A=1 וגם B=1).',
          'PDN: שני נתיבים במקביל — NMOS-C לבדו, ו-(NMOS-A בטור עם NMOS-B).',
          'PUN הוא ה-dual: PMOS-C בטור עם (PMOS-A ‖ PMOS-B).',
        ],
        answer:
`**PDN** (במקביל): \`NMOS-C\` ‖ (\`NMOS-A\` בטור \`NMOS-B\`).

**PUN** (ה-dual): \`PMOS-C\` בטור עם (\`PMOS-A\` ‖ \`PMOS-B\`).

סה"כ **6 טרנזיסטורים** (3 PMOS + 3 NMOS). הכלל: PUN ↔ PDN dual, וטור↔מקביל מתחלפים.`,
        answerSchematic: CBA_SVG,
        expectedAnswers: [
          '6', 'six', 'שישה', 'שש',
          'pmos', 'nmos', 'series', 'parallel', 'טור', 'מקביל',
          'dual', 'pun', 'pdn', 'complex gate',
        ],
      },
    ],
    source: 'מאגר ראיונות — תכן שערים ברמת טרנזיסטור CMOS',
    tags: ['cmos', 'pmos', 'nmos', 'transistor', 'pull-up', 'pull-down', 'analog'],
  },

  // ─────────────────────────────────────────────────────────────
  // #1003 — Karnaugh map minimization (4-variable)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'karnaugh-4-var',
    difficulty: 'easy',
    title: 'מפת קרנו — מינימיזציה של פונקציה בוליאנית',
    intro:
`נתונה פונקציה בוליאנית של 4 משתנים:

\`F(A, B, C, D) = Σm(0, 2, 4, 5, 6, 7, 8, 10, 13, 15)\`

מצא את ביטוי ה-**SOP המינימלי** באמצעות מפת קרנו.`,
    parts: [
      {
        label: 'א',
        question: 'בנה את המפה, סמן קבוצות, וכתוב את הביטוי המינימלי.',
        hints: [
          'סדר את המפה בקוד Gray: שורות \`AB ∈ {00,01,11,10}\`, עמודות \`CD ∈ {00,01,11,10}\`.',
          'חפש קבוצות בגדלים 8 → 4 → 2 → 1. גדול יותר = פחות משתנים בביטוי.',
          'זכור wrap-around: 4 הפינות הן קבוצה תקפה אם כולן 1.',
        ],
        answer:
`**SOP מינימלי:** \`F = A'B + B'D' + BD\`

**3 קבוצות של 4 תאים** (כל אחת מבטלת 2 משתנים מתוך 4):
- **A'B** (שורה \`AB=01\` שלמה) → מכסה m4,m5,m6,m7
- **B'D'** (4 פינות, wrap-around) → מכסה m0,m2,m8,m10
- **BD** (עמודות \`CD=01,11\` בשורות \`AB=01,11\`) → מכסה m5,m7,m13,m15

כל minterm מכוסה. אין קבוצה גדולה יותר ולא ניתן לאחד.`,
        answerSchematic: `
<svg viewBox="0 0 360 320" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Karnaugh map for F(A,B,C,D) with three groups colored">
  <!-- Title -->
  <text x="180" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">K-map: F(A,B,C,D)</text>

  <!-- Axis labels -->
  <text x="180" y="50" text-anchor="middle" fill="#80b0e0" font-size="10" font-weight="bold">CD</text>
  <text x="60" y="155" fill="#80b0e0" font-size="10" font-weight="bold">AB</text>

  <!-- Column headers -->
  <g fill="#c8d8f0" font-size="10" text-anchor="middle">
    <text x="115" y="68">00</text>
    <text x="165" y="68">01</text>
    <text x="215" y="68">11</text>
    <text x="265" y="68">10</text>
  </g>

  <!-- Row headers -->
  <g fill="#c8d8f0" font-size="10" text-anchor="end">
    <text x="78" y="100">00</text>
    <text x="78" y="150">01</text>
    <text x="78" y="200">11</text>
    <text x="78" y="250">10</text>
  </g>

  <!-- Grid -->
  <g stroke="#506080" stroke-width="1" fill="none">
    <rect x="90" y="80"  width="200" height="200"/>
    <line x1="140" y1="80"  x2="140" y2="280"/>
    <line x1="190" y1="80"  x2="190" y2="280"/>
    <line x1="240" y1="80"  x2="240" y2="280"/>
    <line x1="90"  y1="130" x2="290" y2="130"/>
    <line x1="90"  y1="180" x2="290" y2="180"/>
    <line x1="90"  y1="230" x2="290" y2="230"/>
  </g>

  <!-- Group 1: A'B — solid row AB=01 (green) -->
  <rect x="96" y="136" width="188" height="38" rx="18" fill="none" stroke="#39ff80" stroke-width="2.5"/>
  <text x="296" y="158" fill="#39ff80" font-size="11" font-weight="bold">A'B</text>

  <!-- Group 2: B'D' — corners wrap-around (orange). Left two cells + right two cells. -->
  <rect x="96" y="86" width="42" height="38" rx="18" fill="none" stroke="#f0a040" stroke-width="2.5"/>
  <rect x="246" y="86" width="42" height="38" rx="18" fill="none" stroke="#f0a040" stroke-width="2.5"/>
  <rect x="96" y="236" width="42" height="38" rx="18" fill="none" stroke="#f0a040" stroke-width="2.5"/>
  <rect x="246" y="236" width="42" height="38" rx="18" fill="none" stroke="#f0a040" stroke-width="2.5"/>
  <text x="20" y="100" fill="#f0a040" font-size="11" font-weight="bold">B'D'</text>
  <!-- Hint dashed lines showing wrap-around -->
  <path d="M 138 95 L 144 95" stroke="#f0a040" stroke-width="1" stroke-dasharray="3 2"/>
  <path d="M 240 95 L 246 95" stroke="#f0a040" stroke-width="1" stroke-dasharray="3 2"/>

  <!-- Group 3: BD — vertical pair of columns 01, 11 across rows 01, 11 (cyan) -->
  <rect x="146" y="136" width="88" height="88" rx="18" fill="none" stroke="#40d0f0" stroke-width="2.5"/>
  <text x="296" y="208" fill="#40d0f0" font-size="11" font-weight="bold">BD</text>

  <!-- Cell values -->
  <g fill="#c8d8f0" font-size="13" text-anchor="middle" font-weight="bold">
    <!-- AB=00 row: m0,m1,m3,m2 = 1,0,0,1 -->
    <text x="115" y="110">1</text>
    <text x="165" y="110" fill="#506080">0</text>
    <text x="215" y="110" fill="#506080">0</text>
    <text x="265" y="110">1</text>
    <!-- AB=01 row: m4,m5,m7,m6 = 1,1,1,1 -->
    <text x="115" y="160">1</text>
    <text x="165" y="160">1</text>
    <text x="215" y="160">1</text>
    <text x="265" y="160">1</text>
    <!-- AB=11 row: m12,m13,m15,m14 = 0,1,1,0 -->
    <text x="115" y="210" fill="#506080">0</text>
    <text x="165" y="210">1</text>
    <text x="215" y="210">1</text>
    <text x="265" y="210" fill="#506080">0</text>
    <!-- AB=10 row: m8,m9,m11,m10 = 1,0,0,1 -->
    <text x="115" y="260">1</text>
    <text x="165" y="260" fill="#506080">0</text>
    <text x="215" y="260" fill="#506080">0</text>
    <text x="265" y="260">1</text>
  </g>

  <!-- Final expression -->
  <text x="180" y="305" text-anchor="middle" fill="#80f0a0" font-size="13" font-weight="bold">F = A'B + B'D' + BD</text>
</svg>
`,
        interviewerMindset:
`לא דורש ממך משהו מתוחכם — רוצה לוודא שאתה לא מסתבך כשמראים לך הפשטה לוגית בלוח לבן.

**מקפיץ אותך לטובה:**
- לזהות wrap-around (4 הפינות) בלי שצריך לרמוז.
- להעדיף קבוצות גדולות (4-cell) על פני אוסף של 2-cell.

**מקפיץ אותך לרעה:** לכתוב SOP לפי minterms ישירות בלי למזער. ה-SOP "הגולמי" הוא 10 איברים — צריך 3.`,
        expectedAnswers: [
          "a'b", 'ab', "b'd'", 'bd',
          'corners', 'פינות', 'wrap',
          '3', 'שלוש', 'three',
          'sop', 'minimal', 'מינימלי',
        ],
      },
      {
        label: 'ב',
        editor: 'verilog',
        question: 'ממש את הפונקציה \`F = A\'B + B\'D\' + BD\` ב-Verilog כמודול קומבינטורי.',
        hints: [
          'מודול קומבינטורי — \`assign\` (continuous assignment) מתאים, או \`always @(*)\` עם \`=\` בלוקינג.',
          'אופרטורים ב-Verilog: \`&\` = AND, \`|\` = OR, \`~\` = NOT.',
          'לדוגמה: \`assign F = (~A & B) | (~B & ~D) | (B & D);\`',
          'אפשר גם בגרסה הקריאה יותר עם signals ביניים (\`wire t1, t2, t3;\`).',
        ],
        starterCode:
`module f_kmap (
    input  wire A,
    input  wire B,
    input  wire C,
    input  wire D,
    output wire F
);
    // TODO: implement F = A'B + B'D' + BD
endmodule
`,
        answer:
`\`\`\`verilog
module f_kmap (
    input  wire A,
    input  wire B,
    input  wire C,   // unused — K-map showed C is "don't care" after minimization
    input  wire D,
    output wire F
);
    assign F = (~A & B) | (~B & ~D) | (B & D);
endmodule
\`\`\`

**הערה חשובה:** אחרי המינימיזציה, **C נשמט לחלוטין** מהביטוי — שלוש הקבוצות מכסות את שני הערכים של C כל אחת. C נשאר בפורט של המודול כדי להתאים לחתימה המקורית של 4 משתנים, אבל לא משמש בלוגיקה. סינתסייזר טוב יזהיר על "unused input".

**גרסה אלטרנטיבית** עם בלוק קומבינטורי מפורש:

\`\`\`verilog
always @(*) begin
    F = (~A & B) | (~B & ~D) | (B & D);
end
\`\`\`
(אז F צריך להיות \`reg\`, לא \`wire\`).

**גרסה קריאה יותר** עם signals ביניים:

\`\`\`verilog
wire g1 = ~A & B;     // A'B
wire g2 = ~B & ~D;    // B'D'
wire g3 = B  & D;     // BD
assign F = g1 | g2 | g3;
\`\`\`

**טעויות נפוצות בראיון:**
- לכתוב \`&&\`/\`||\` (logical) במקום \`&\`/\`|\` (bitwise). על ביט יחיד התוצאה זהה, אבל זו ריח-קוד.
- לשכוח שאחרי K-map הצלחנו לסלק את \`C\` — חלק מנסים "להחזיר" אותו לביטוי.
- להגדיר \`F\` כ-\`wire\` ולכתוב לתוכו ב-\`always\` (זה שגיאת קומפילציה).`,
        interviewerMindset:
`השאלה הזו בודקת **תרגום נקי** מ-SOP ל-Verilog. הראיין רוצה לראות שלוש דברים:

1. **בחירה נכונה של construct:** \`assign\` לקומבינטורי. אם השתמשת ב-\`always @(*)\` — חייב \`reg\` ובלוקינג \`=\`.
2. **שימוש ב-bitwise (\`&\`, \`|\`, \`~\`), לא ב-logical** (\`&&\`, \`||\`, \`!\`). על 1-bit זה עובד בכל מקרה — אבל מי שמערבב, מערבב גם בקוד הרחב יותר.
3. **לזהות שה-C מיותר.** אם אתה משאיר \`C\` "ליתר ביטחון" בביטוי, זה אומר שלא באמת הבנת מה K-map עשה.

**מקפיץ לטובה:** להזכיר שאפשר לכתוב \`assign F = ~((A & ~B) | ...);\` (POS) ולשאול אם רוצים SOP או POS. או להציע testbench קצר.`,
        expectedAnswers: [
          'assign', '~a & b', "~a&b", '~b & ~d', 'b & d',
          'always @(*)', 'always@(*)',
          'bitwise', '&', '|', '~',
          'unused', 'c is', 'unused input',
        ],
      },
    ],
    source: 'מאגר ראיונות — מינימיזציה בוליאנית קלאסית',
    tags: ['karnaugh', 'k-map', 'minimization', 'sop', 'combinational', 'logic'],
  },

  // ─────────────────────────────────────────────────────────────
  // #1004 — 2:4 Decoder from basic gates (with K-maps)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'decoder-2to4-gates',
    difficulty: 'easy',
    title: 'מימוש Decoder 2:4 משערים לוגיים',
    intro:
`ממש מקודד-פענוח (\`Decoder\`) **2:4** משערים לוגיים בסיסיים בלבד (AND/OR/NOT).

קלטים: \`A1\`, \`A0\`. פלטים: \`Y0..Y3\` כך שבדיוק פלט אחד דולק בכל רגע — זה שהאינדקס שלו שווה לערך הבינארי של \`A1 A0\`.`,
    parts: [
      {
        label: null,
        question: 'בנה את טבלת האמת, סרטט 4 מפות קרנו (אחת לכל פלט), ומצא את ביטויי ה-SOP. כמה שערים סך-הכל צריך?',
        hints: [
          'טבלת האמת: בכל שורה רק פלט אחד = 1 — זה שמתאים לערך הבינארי של (A1,A0).',
          'כל מפת קרנו תכיל בדיוק "1" אחד → אי-אפשר לאחד → כל פלט = minterm יחיד.',
          'Y_i = AND של הליטרלים המתאימים. צריך גם NOT עבור A1\' ו-A0\'.',
          'ספירה: 2 NOT + 4 AND = 6 שערים.',
        ],
        answer:
`**טבלת אמת:**

| A1 | A0 | Y0 | Y1 | Y2 | Y3 |
|----|----|----|----|----|-----|
| 0  | 0  | 1  | 0  | 0  | 0  |
| 0  | 1  | 0  | 1  | 0  | 0  |
| 1  | 0  | 0  | 0  | 1  | 0  |
| 1  | 1  | 0  | 0  | 0  | 1  |

**4 מפות קרנו (2×2):** לכל פלט בדיוק "1" אחד — אין שתי תאים סמוכים, ולכן **אי-אפשר לאחד**. כל פלט הוא minterm בודד:

- \`Y0 = A1' · A0'\` (minterm m0)
- \`Y1 = A1' · A0\`  (minterm m1)
- \`Y2 = A1 · A0'\`  (minterm m2)
- \`Y3 = A1 · A0\`   (minterm m3)

**פירוש הקרנו:** מפה עם נקודת-1 בודדת מבטאת בדיוק מצב יחיד — מה שמגדיר decoder: זיהוי קומבינציה אחת לכל פלט.

**מימוש — 6 שערים סך-הכל:**
- 2 × \`NOT\` ⟶ מייצרים \`A1'\` ו-\`A0'\`
- 4 × \`AND\` דו-קלטי ⟶ כל אחד מאַנדד את זוג הליטרלים המתאים

**הרחבה — Decoder עם Enable:** מחליפים את ה-AND-ים ל-3-קלטי ומוסיפים את \`EN\`. כש-\`EN=0\` כל הפלטים = 0.`,
        answerSchematic: DEC24_KMAP_SVG,
        interviewerMindset:
`שאלת "חימום" — מטרתה לוודא שאתה זורם נקי בין טבלת אמת → קרנו → SOP → סכמטיקה. **מקפיץ לרעה:** לקפוץ ישר ל"4 AND-ים" בלי לעבור דרך הטבלה/קרנו. הראיין רוצה לראות שיטה, לא שינון.

**מקפיץ לטובה:**
- להזכיר ש-decoder עם n כניסות = 2^n פלטים, וקרנו הוא בעצם "תצוגה ויזואלית" של ה-decoder עצמו.
- להציע את הגרסה עם \`EN\` (השימוש האמיתי ב-decoder כ-address decoder בזיכרון).
- לציין שאפשר גם לממש משני NAND-ים אם המעבדה תומכת רק ב-NAND universal.`,
        expectedAnswers: [
          'and', 'not', "a1'", "a0'", 'a1·a0', 'a1*a0',
          'minterm', 'minterms', 'decoder',
          '6', 'six', 'שישה', 'שש',
          '4 and', '2 not', 'enable', 'en',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const A1 = h.input(120, 200, 'A1');
          const A0 = h.input(120, 440, 'A0');
          A1.fixedValue = 1; A0.fixedValue = 0;  // demo: selects Y2

          const nA1 = h.gate('NOT', 320, 260);
          const nA0 = h.gate('NOT', 320, 500);

          const aY0 = h.gate('AND', 620, 120);   // A1' · A0'
          const aY1 = h.gate('AND', 620, 280);   // A1' · A0
          const aY2 = h.gate('AND', 620, 440);   // A1  · A0'
          const aY3 = h.gate('AND', 620, 600);   // A1  · A0

          const Y0 = h.output(900, 120, 'Y0');
          const Y1 = h.output(900, 280, 'Y1');
          const Y2 = h.output(900, 440, 'Y2');
          const Y3 = h.output(900, 600, 'Y3');

          return {
            nodes: [A1, A0, nA1, nA0, aY0, aY1, aY2, aY3, Y0, Y1, Y2, Y3],
            wires: [
              h.wire(A1.id, nA1.id, 0),
              h.wire(A0.id, nA0.id, 0),
              // Y0 = A1' · A0'
              h.wire(nA1.id, aY0.id, 0),
              h.wire(nA0.id, aY0.id, 1),
              // Y1 = A1' · A0
              h.wire(nA1.id, aY1.id, 0),
              h.wire(A0.id,  aY1.id, 1),
              // Y2 = A1 · A0'
              h.wire(A1.id,  aY2.id, 0),
              h.wire(nA0.id, aY2.id, 1),
              // Y3 = A1 · A0
              h.wire(A1.id, aY3.id, 0),
              h.wire(A0.id, aY3.id, 1),
              // Outputs
              h.wire(aY0.id, Y0.id, 0),
              h.wire(aY1.id, Y1.id, 0),
              h.wire(aY2.id, Y2.id, 0),
              h.wire(aY3.id, Y3.id, 0),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — לוגיקה קומבינטורית: decoders',
    tags: ['decoder', '2-to-4', 'combinational', 'k-map', 'sop', 'logic'],
  },

  // ─────────────────────────────────────────────────────────────
  // #1005 — Full Adder from minimum 2:1 MUXes
  // Source slide: IQ/PP/slides/circuits_s03_1.png (מעגלים שקף 3).
  // ─────────────────────────────────────────────────────────────
  {
    id: 'fa-from-2to1-mux',
    difficulty: 'medium',
    title: 'FA ממספר מינימלי של MUX 2:1',
    intro:
`ה-MUX 2:1 הבסיסי מקבל שני קלטים (\`d0\`, \`d1\`) ושורת בחירה אחת (\`s\`), והפלט הוא:

\`\`\`
y = s ? d1 : d0
\`\`\`

**המשימה:** ממש Full Adder (קלטים: \`a\`, \`b\`, \`c\`; פלטים: \`sum\`, \`carry\`) במספר **מינימלי** של MUXes 2:1. הסבר מדוע זה אכן המינימום.

**הנחות:** ניתן להניח שמכל אות יש גם את ההיפוך (NOT זמין). אם הראיין מבקש "MUXes בלבד, ללא NOT" — נראה שגם זה אפשרי במחיר MUX נוסף.`,
    parts: [
      {
        label: 'א',
        question: 'גזור את המשוואות הבוליאניות של FA וכתב אותן בצורה מתאימה ל-MUX (כל אחת בצורת ternary).',
        hints: [
          '`sum = a ⊕ b ⊕ c`. כל XOR ניתן לבטא כ-`a ⊕ b = a ? ¬b : b`.',
          '`carry = a·b + c·(a ⊕ b)`. אבל אפשר לכתוב גם: `carry = (a ⊕ b) ? c : a·b` או `carry = (a ⊕ b) ? c : a` (כש-a⊕b=0 הסיביות שוות, אז a=b, ולכן `a·b = a`).',
          'ה-MUX מבטא ternary בדיוק: `y = s ? d1 : d0` — אז כל אחד מהביטויים לעיל הופך ל-MUX אחד.',
        ],
        answer:
`**משוואות FA:**
\`\`\`
sum   = a ⊕ b ⊕ c
carry = a·b + c·(a ⊕ b)
\`\`\`

**כתיבה ב-ternary (=MUX-friendly):**

1. \`a ⊕ b = a ? ¬b : b\`  — XOR יחיד דרך MUX, sel=a. (טריק: כש-a=1 נדרש ¬b, כש-a=0 נדרש b.)

2. \`sum = (a ⊕ b) ⊕ c = (a⊕b) ? ¬c : c\`  — XOR שני, sel = הביטוי הקודם.

3. \`carry = (a ⊕ b) ? c : a\`  — **טריק חשוב!** כש-\`a⊕b=0\` (כלומר \`a=b\`), אז \`a·b = a\` (וגם \`= b\`), כך שאפשר לקחת \`a\` ישירות במקום \`a·b\`. כש-\`a⊕b=1\` (\`a≠b\`), הקאר הוא \`c\` (כי בדיוק אחד מ-\`a,b\` הוא 1 ואז קאר רק אם גם \`c=1\`).

**שלוש משוואות → שלושה MUXes.** וכולן יכולות לחלוק את אותו "אות עזר" \`(a⊕b)\`.`,
        expectedAnswers: [
          'sum', 'carry', 'xor', '⊕',
          'ternary', 'a ? b : c',
          'a·b', 'ab',
          '3', 'שלושה', 'three',
        ],
      },
      {
        label: 'ב',
        question: 'בנה את ה-FA בפועל — כמה MUXes? סדר את החיווט והסבר מה כל MUX מחשב.',
        hints: [
          'MUX1: מחשב `T = a ⊕ b`. sel=a, d0=b, d1=¬b. דרוש ¬b → ניתן ע"י NOT, או ע"י MUX שמייצר ¬b מ-(1, 0, sel=b).',
          'MUX2: מחשב `sum = T ⊕ c`. sel=T, d0=c, d1=¬c.',
          'MUX3: מחשב `carry = T ? c : a`. sel=T, d0=a, d1=c.',
          'סך הכול: **3 MUXes** אם NOT זמין (משתי הקלטים b ו-c). 4 MUXes אם רוצים פתרון "טהור" ללא inverter.',
          'מינימום מוחלט: אי אפשר ב-2 MUXes כי FA הוא פונקציה לא טריוויאלית של 3 משתנים עם 2 פלטים — צריך לפחות 2 פלטים נפרדים, ושום ביטוי בודד של MUX 2:1 אינו `sum` או `carry` ישירות.',
        ],
        answer:
`**3 MUXes 2:1** (בהנחה ש-\`¬b\` ו-\`¬c\` זמינים — אינוורטרים סטנדרטיים בכל ספרייה):

| # | sel | d0 | d1 | מחשב |
|---|-----|----|----|------|
| MUX1 | \`a\` | \`b\`   | \`¬b\` | \`T = a ⊕ b\` |
| MUX2 | \`T\` | \`c\`   | \`¬c\` | \`sum = T ⊕ c = a⊕b⊕c\` |
| MUX3 | \`T\` | \`a\`   | \`c\`  | \`carry = a·b + c·T\` |

**אינטואיציה ל-MUX3 (החלק היפה):**
- אם \`T=0\` (כלומר \`a=b\`): \`carry = a = b = a·b\`. ✓
- אם \`T=1\` (כלומר \`a≠b\`): בדיוק אחד מהם 1, אז \`a·b=0\`. אם גם \`c=1\` → קאר=1 (כי 1+1=10). אם \`c=0\` → קאר=0. כלומר \`carry = c\` במקרה הזה. ✓

**גרסה "טהורה" ללא NOT — 4 MUXes:**
החליפו את ה-\`¬b\` ב-\`MUX(d0=1, d1=0, sel=b)\` ואת ה-\`¬c\` באופן דומה — כל אינוורטר עולה MUX אחד. במקום \`¬c\` ב-MUX2 אפשר לעשות טריק עדין: שני XORs מאותו רעיון לאחד, מה שמחזיר למעשה ל-3 MUXes אם משתפים. הקונבנציה: **3 הוא המינימום המקובל ל-FA מ-MUXes 2:1**.

**למה לא 2 MUXes?**
- כל MUX 2:1 הוא פונקציה של 3 משתנים (\`sel, d0, d1\`) — אבל בעלת מבנה מוגבל (לינארית ב-sel).
- ל-FA יש **2 פלטים** (\`sum\` ו-\`carry\`), כל אחד תלוי בכל 3 הקלטים \`a,b,c\`.
- אם נשתמש רק ב-MUX אחד, יש לנו פלט יחיד. שני MUXes — שני פלטים, אבל **שניהם** נדרשים להיות פונקציה מלאה של 3 משתנים. ה-fan-in המוגבל של MUX 2:1 (3 sources) מחייב לפחות שכבה אחת של "הכנה" — לכן MUX3 הכרחי.`,
        answerSchematic: `
<svg viewBox="0 0 660 320" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Full Adder built from 3 2:1 MUXes">
  <text x="330" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">FA = 3 × MUX 2:1</text>

  <!-- MUX1: T = a XOR b -->
  <g>
    <polygon points="170,80 240,100 240,180 170,200" fill="#0a1520" stroke="#80b0e0" stroke-width="1.6"/>
    <text x="205" y="148" text-anchor="middle" fill="#c8d8f0" font-weight="bold">M1</text>
    <text x="158" y="108" text-anchor="end" fill="#80b0e0">b</text>
    <text x="158" y="142" text-anchor="end" fill="#80b0e0">¬b</text>
    <text x="205" y="218" text-anchor="middle" fill="#80b0e0">sel=a</text>
    <text x="260" y="144" fill="#39ff80">T = a⊕b</text>
    <line x1="140" y1="105" x2="170" y2="105" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="140" y1="140" x2="170" y2="140" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="205" y1="200" x2="205" y2="220" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="240" y1="140" x2="320" y2="140" stroke="#39ff80" stroke-width="1.5"/>
  </g>

  <!-- MUX2: sum = T XOR c -->
  <g>
    <polygon points="340,40 410,60 410,140 340,160" fill="#0a1520" stroke="#80b0e0" stroke-width="1.6"/>
    <text x="375" y="108" text-anchor="middle" fill="#c8d8f0" font-weight="bold">M2</text>
    <text x="328" y="68" text-anchor="end" fill="#80b0e0">c</text>
    <text x="328" y="102" text-anchor="end" fill="#80b0e0">¬c</text>
    <text x="375" y="178" text-anchor="middle" fill="#80b0e0">sel=T</text>
    <text x="430" y="104" fill="#80f0a0" font-weight="bold">sum</text>
    <line x1="320" y1="65"  x2="340" y2="65"  stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="320" y1="100" x2="340" y2="100" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="375" y1="160" x2="375" y2="178" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="320" y1="140" x2="320" y2="178" stroke="#39ff80" stroke-width="1.2" stroke-dasharray="3 2"/>
    <line x1="320" y1="178" x2="375" y2="178" stroke="#39ff80" stroke-width="1.2" stroke-dasharray="3 2"/>
    <line x1="410" y1="100" x2="500" y2="100" stroke="#80f0a0" stroke-width="1.8"/>
  </g>

  <!-- MUX3: carry = T ? c : a -->
  <g>
    <polygon points="340,200 410,220 410,300 340,320" fill="#0a1520" stroke="#80b0e0" stroke-width="1.6"/>
    <text x="375" y="268" text-anchor="middle" fill="#c8d8f0" font-weight="bold">M3</text>
    <text x="328" y="228" text-anchor="end" fill="#80b0e0">a</text>
    <text x="328" y="262" text-anchor="end" fill="#80b0e0">c</text>
    <text x="430" y="264" fill="#80f0a0" font-weight="bold">carry</text>
    <line x1="320" y1="225" x2="340" y2="225" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="320" y1="260" x2="340" y2="260" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="375" y1="320" x2="375" y2="312" stroke="#80b0e0" stroke-width="1.2"/>
    <line x1="375" y1="312" x2="500" y2="312" stroke="#39ff80" stroke-width="1.2" stroke-dasharray="3 2"/>
    <line x1="500" y1="312" x2="500" y2="140" stroke="#39ff80" stroke-width="1.2" stroke-dasharray="3 2"/>
    <line x1="410" y1="260" x2="500" y2="260" stroke="#80f0a0" stroke-width="1.8"/>
  </g>

  <text x="330" y="305" text-anchor="middle" fill="#c8d8f0" font-size="10">קווים ירוקים מקווקווים = T (אות עזר משותף).</text>
</svg>
`,
        interviewerMindset:
`הראיין רוצה לראות **שתי תובנות שמתחבאות בפרטים:**

1. \`a ⊕ b = a ? ¬b : b\` — XOR ב-MUX יחיד. רוב המועמדים לא רואים את זה ונופלים לידי שערים נוספים.
2. \`carry = T ? c : a\` (ולא \`carry = T ? c : a·b\`) — ניצול שכש-\`T=0\` יש \`a=b\` ולכן \`a·b=a\`. זה מבטל את הצורך ב-AND חיצוני.

**מקפיץ לטובה:** לפתוח עם "FA הוא XOR-3 ל-sum ו-majority ל-carry, ועל זה נבנה" — מראה שאתה מבחין במבנה הסימטרי. לציין שגם **majority(a,b,c)** ניתן ל-2 MUXes טהורים — וזה למעשה ה-carry.`,
        expectedAnswers: [
          '3', 'שלושה', 'three',
          'mux', 'mux2', '2:1',
          'xor', 'sum', 'carry',
          't = a', 'a xor b', 'a⊕b',
          'majority',
        ],
      },
      {
        label: 'ג',
        editor: 'verilog',
        starterCode:
`module fa_from_mux (
    input  wire a,
    input  wire b,
    input  wire c,
    output wire sum,
    output wire carry
);

    // TODO: build sum and carry using only 2:1 muxes (ternary operator)
    //   hint: T = a ^ b  ⇒  T = a ? ~b : b
    //         sum = T ? ~c : c
    //         carry = T ? c : a

endmodule
`,
        question: 'ממש את ה-FA ב-Verilog תוך שימוש ב-ternary בלבד (כל ternary = MUX 2:1).',
        answer:
`\`\`\`verilog
module fa_from_mux (
    input  wire a, b, c,
    output wire sum, carry
);
    wire T;
    assign T     = a ? ~b : b;     // MUX1 → T = a ^ b
    assign sum   = T ? ~c : c;     // MUX2 → sum = T ^ c
    assign carry = T ? c : a;      // MUX3 → carry = a·b + c·T
endmodule
\`\`\`

שלושה \`assign\` עם ternary = שלושה MUXes פיזיים אחרי סינתזה (Synopsys / Yosys ימפו את כל אחד ל-\`MUX2\` ישיר).`,
        expectedAnswers: [
          'assign', 'wire', 'ternary',
          'a ? ~b', 'a?~b', '~b : b',
          't ? ~c', 't ? c', '? c : a',
          'sum', 'carry',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 3 (FA ממספר מינימלי של MUX 2:1)',
    tags: ['fa', 'full-adder', 'mux', '2:1-mux', 'minimum', 'combinational', 'logic', 'verilog'],
    circuitRevealsAnswer: true,
    circuit: () => build(() => {
      // Realize the 3-MUX FA on the canvas. The schematic uses MUX (inputCount=2),
      // a single NOT gate to expose ¬b and ¬c (shared inverters).
      const A = h.input(120, 200, 'a');
      const B = h.input(120, 280, 'b');
      const C = h.input(120, 380, 'c');
      const notB = h.gate('NOT', 260, 280);
      const notC = h.gate('NOT', 260, 380);

      // MUX1: sel=A, d0=B, d1=¬B → T = a ⊕ b
      const m1 = h.mux(420, 240, 'M1: T');
      // MUX2: sel=T, d0=C, d1=¬C → sum
      const m2 = h.mux(620, 320, 'M2: sum');
      // MUX3: sel=T, d0=A, d1=C → carry
      const m3 = h.mux(620, 460, 'M3: carry');

      const SUM   = h.output(820, 320, 'sum');
      const CARRY = h.output(820, 460, 'carry');

      return {
        nodes: [A, B, C, notB, notC, m1, m2, m3, SUM, CARRY],
        wires: [
          h.wire(B.id, notB.id, 0),
          h.wire(C.id, notC.id, 0),

          // MUX1: d0=B(in 0), d1=¬B(in 1), sel=A(in 2)
          h.wire(B.id,    m1.id, 0),
          h.wire(notB.id, m1.id, 1),
          h.wire(A.id,    m1.id, 2),

          // MUX2: d0=C, d1=¬C, sel=T(=m1)
          h.wire(C.id,    m2.id, 0),
          h.wire(notC.id, m2.id, 1),
          h.wire(m1.id,   m2.id, 2),

          // MUX3: d0=A, d1=C, sel=T(=m1)
          h.wire(A.id,  m3.id, 0),
          h.wire(C.id,  m3.id, 1),
          h.wire(m1.id, m3.id, 2),

          h.wire(m2.id, SUM.id,   0),
          h.wire(m3.id, CARRY.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1006 — BlackBox (x, x+2) → x+1, no adders/subtractors (slide 7)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'blackbox-xp1-from-x-and-xp2',
    difficulty: 'medium',
    title: 'BlackBox: (x, x+2) → x+1 בלי מחברים ומחסרים',
    intro:
`נתונה מערכת עם שתי כניסות, \`X\` (4-bit) ו-\`X+2\` (4-bit). הפלט הוא \`X+1\` (4-bit).
**צריך לממש את המערכת בלי להשתמש במחברים או מחסרים** — רק שערים לוגיים ו-MUXes.

**רמז ראשון:** מאחר ש-\`(X+1) = (X + (X+2)) / 2\` (ממוצע), הפתרון הוא חישוב הממוצע בצורה ביטית — אבל **ללא חיבור**.`,
    schematic: `
<svg viewBox="0 0 420 200" xmlns="http://www.w3.org/2000/svg" direction="ltr" font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="BlackBox with X and X+2 inputs, X+1 output">
  <!-- BlackBox body -->
  <rect x="140" y="50" width="160" height="100" rx="6" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8" stroke-dasharray="6 3"/>
  <text x="220" y="106" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">BlackBox</text>

  <!-- X input (top) -->
  <text x="80" y="76" text-anchor="middle" fill="#f0d080" font-weight="bold">X</text>
  <text x="80" y="92" text-anchor="middle" fill="#a09080" font-size="10">(4-bit)</text>
  <line x1="100" y1="80" x2="140" y2="80" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="140,80 134,76 134,84" fill="#f0d080"/>

  <!-- X+2 input (bottom) -->
  <text x="80" y="124" text-anchor="middle" fill="#f0d080" font-weight="bold">X+2</text>
  <text x="80" y="140" text-anchor="middle" fill="#a09080" font-size="10">(4-bit)</text>
  <line x1="100" y1="128" x2="140" y2="128" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="140,128 134,124 134,132" fill="#f0d080"/>

  <!-- X+1 output -->
  <line x1="300" y1="100" x2="360" y2="100" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="360,100 354,96 354,104" fill="#80f0a0"/>
  <text x="380" y="98" text-anchor="middle" fill="#80f0a0" font-weight="bold">X+1</text>
  <text x="380" y="114" text-anchor="middle" fill="#80a080" font-size="10">(4-bit)</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. כמה MUXים וכמה שערים?',
        hints: [
          'הסתכל על LSB: \\\`(X+1)[0] = ¬X[0]\\\` תמיד. למה? כי X ו-X+2 חולקים אותו LSB, ו-X+1 הוא בדיוק "ההפך" שלהם בביט הזה.',
          'הסתכל על ביטים גבוהים. אם \\\`X\\\` הוא **זוגי** (X[0]=0) — אז \\\`X+1 = X\\\` עם LSB מתחלף, כל ביט גבוה נשאר כמו X.',
          'אם \\\`X\\\` הוא **אי-זוגי** (X[0]=1) — אז \\\`X+1 = (X+2) - 1\\\` = (X+2) עם ה-LSB שלו מתאפס. כלומר ה-MSBs של X+1 שווים ל-MSBs של X+2 (וה-LSB של X+1 הוא 0).',
          'הכלל: לכל ביט i ≥ 1, \\\`(X+1)[i] = MUX(sel=X[0], in0=X[i], in1=(X+2)[i])\\\`. LSB תמיד \\\`¬X[0]\\\`.',
          'סה"כ: 1 NOT + 3 MUXים 2:1.',
        ],
        answerSchematic: `
<svg viewBox="0 0 800 640" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', 'Consolas', monospace" font-size="12"
     role="img" aria-label="1 NOT + 3 MUX 2:1 implementing X+1 from X and X+2">
  <defs>
    <linearGradient id="bbMuxGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/>
      <stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <linearGradient id="bbNotGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a2438"/>
      <stop offset="1" stop-color="#0a1420"/>
    </linearGradient>
    <linearGradient id="bbTitleGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#142840"/>
      <stop offset="1" stop-color="#0a1828"/>
    </linearGradient>
    <marker id="bbArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/>
    </marker>
    <marker id="bbArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/>
    </marker>
    <marker id="bbArrO" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8060"/>
    </marker>
    <filter id="bbGlowO" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feFlood flood-color="#ff8060" flood-opacity="0.5"/>
      <feComposite in2="SourceAlpha" operator="in" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- ─── Title banner ─── -->
  <rect x="0" y="0" width="800" height="64" fill="url(#bbTitleGrad)"/>
  <text direction="ltr" x="400" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    (X+1)[0] = ¬X[0]
  </text>
  <text direction="ltr" x="400" y="48" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    (X+1)[i] = MUX(sel = X[0], in0 = X[i], in1 = (X+2)[i])    for i = 1, 2, 3
  </text>

  <!-- ─── Subtle row backgrounds (alternating) ─── -->
  <rect x="0" y="80"  width="800" height="120" fill="#0a1825" opacity="0.45"/>
  <rect x="0" y="200" width="800" height="120" fill="#0a1420" opacity="0.55"/>
  <rect x="0" y="320" width="800" height="120" fill="#0a1825" opacity="0.45"/>
  <rect x="0" y="440" width="800" height="160" fill="#0a1420" opacity="0.55"/>

  <!-- Row labels (LTR) -->
  <text direction="ltr" x="40" y="146" text-anchor="middle" fill="#7090b0" font-size="11">bit 0</text>
  <text direction="ltr" x="40" y="266" text-anchor="middle" fill="#7090b0" font-size="11">bit 1</text>
  <text direction="ltr" x="40" y="386" text-anchor="middle" fill="#7090b0" font-size="11">bit 2</text>
  <text direction="ltr" x="40" y="516" text-anchor="middle" fill="#7090b0" font-size="11">bit 3</text>

  <!-- ═══════════════════════════════════════════════════════════════════════
       Bit 0 row:  X[0] enters from far left, branches at junction P0:
         (a) RIGHT  →  NOT  →  (X+1)[0]
         (b) DOWN   →  sel rail for bits 1, 2, 3
       ═══════════════════════════════════════════════════════════════════════ -->
  <!-- X[0] input label -->
  <text direction="ltr" x="106" y="142" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="14">X[0]</text>
  <!-- X[0] data wire from label to junction -->
  <line x1="138" y1="146" x2="230" y2="146" stroke="#ff8060" stroke-width="1.8"/>
  <!-- Junction P0 — the fan-out point (this is the KEY visual) -->
  <circle cx="230" cy="146" r="6" fill="#ff8060" filter="url(#bbGlowO)"/>
  <text direction="ltr" x="230" y="124" text-anchor="middle" fill="#ff8060" font-size="10" font-weight="bold">fan-out</text>
  <!-- Branch (a): junction → NOT (right) -->
  <line x1="230" y1="146" x2="380" y2="146" stroke="#ff8060" stroke-width="1.8"/>
  <!-- NOT triangle + bubble -->
  <polygon points="380,124 380,168 426,146" fill="url(#bbNotGrad)" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="434" cy="146" r="6" fill="#0a1420" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="400" y="151" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="12">NOT</text>
  <!-- NOT output → (X+1)[0] -->
  <line x1="440" y1="146" x2="650" y2="146" stroke="#80f0a0" stroke-width="2" marker-end="url(#bbArrG)"/>
  <text direction="ltr" x="720" y="142" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">(X+1)[0]</text>

  <!-- Branch (b): junction P0 → DOWN as the shared sel rail -->
  <line x1="230" y1="146" x2="230" y2="572" stroke="#ff8060" stroke-width="2.4" stroke-dasharray="6 3"/>
  <text direction="ltr" x="246" y="182" fill="#ff8060" font-size="11" font-weight="bold">sel rail (X[0])</text>

  <!-- ═══════════════════════════════════════════════════════════════════════
       Bit 1 row (y centre ≈ 260)
       ═══════════════════════════════════════════════════════════════════════ -->
  <text direction="ltr" x="106" y="246" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">X[1]</text>
  <line x1="138" y1="250" x2="378" y2="250" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#bbArrB)"/>
  <text direction="ltr" x="326" y="244" text-anchor="middle" fill="#a0c0e0" font-size="10">in0</text>

  <text direction="ltr" x="106" y="294" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">(X+2)[1]</text>
  <line x1="160" y1="298" x2="378" y2="298" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#bbArrB)"/>
  <text direction="ltr" x="326" y="292" text-anchor="middle" fill="#a0c0e0" font-size="10">in1</text>

  <!-- MUX trapezoid for bit 1 -->
  <polygon points="380,232 446,250 446,298 380,316" fill="url(#bbMuxGrad)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="413" y="278" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">MUX</text>

  <!-- sel tap: from rail (x=230) to MUX bottom (x=413, y=316) → up to bottom edge -->
  <line x1="230" y1="316" x2="413" y2="316" stroke="#ff8060" stroke-width="1.6"/>
  <circle cx="230" cy="316" r="4" fill="#ff8060"/>
  <line x1="413" y1="316" x2="413" y2="307" stroke="#ff8060" stroke-width="1.6" marker-end="url(#bbArrO)"/>
  <text direction="ltr" x="430" y="322" fill="#ff8060" font-size="10">sel</text>

  <!-- output -->
  <line x1="446" y1="274" x2="650" y2="274" stroke="#80f0a0" stroke-width="2" marker-end="url(#bbArrG)"/>
  <text direction="ltr" x="720" y="270" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">(X+1)[1]</text>

  <!-- ═══════════════════════════════════════════════════════════════════════
       Bit 2 row (y centre ≈ 380)
       ═══════════════════════════════════════════════════════════════════════ -->
  <text direction="ltr" x="106" y="366" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">X[2]</text>
  <line x1="138" y1="370" x2="378" y2="370" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#bbArrB)"/>
  <text direction="ltr" x="326" y="364" text-anchor="middle" fill="#a0c0e0" font-size="10">in0</text>

  <text direction="ltr" x="106" y="414" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">(X+2)[2]</text>
  <line x1="160" y1="418" x2="378" y2="418" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#bbArrB)"/>
  <text direction="ltr" x="326" y="412" text-anchor="middle" fill="#a0c0e0" font-size="10">in1</text>

  <polygon points="380,352 446,370 446,418 380,436" fill="url(#bbMuxGrad)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="413" y="398" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">MUX</text>

  <line x1="230" y1="436" x2="413" y2="436" stroke="#ff8060" stroke-width="1.6"/>
  <circle cx="230" cy="436" r="4" fill="#ff8060"/>
  <line x1="413" y1="436" x2="413" y2="427" stroke="#ff8060" stroke-width="1.6" marker-end="url(#bbArrO)"/>
  <text direction="ltr" x="430" y="442" fill="#ff8060" font-size="10">sel</text>

  <line x1="446" y1="394" x2="650" y2="394" stroke="#80f0a0" stroke-width="2" marker-end="url(#bbArrG)"/>
  <text direction="ltr" x="720" y="390" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">(X+1)[2]</text>

  <!-- ═══════════════════════════════════════════════════════════════════════
       Bit 3 row (y centre ≈ 510; extra spacing so sel doesn't overlap (X+2)[3])
       ═══════════════════════════════════════════════════════════════════════ -->
  <text direction="ltr" x="106" y="486" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">X[3]</text>
  <line x1="138" y1="490" x2="378" y2="490" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#bbArrB)"/>
  <text direction="ltr" x="326" y="484" text-anchor="middle" fill="#a0c0e0" font-size="10">in0</text>

  <text direction="ltr" x="106" y="538" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">(X+2)[3]</text>
  <line x1="160" y1="542" x2="378" y2="542" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#bbArrB)"/>
  <text direction="ltr" x="326" y="536" text-anchor="middle" fill="#a0c0e0" font-size="10">in1</text>

  <polygon points="380,472 446,490 446,542 380,560" fill="url(#bbMuxGrad)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="413" y="520" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">MUX</text>

  <!-- sel for bit 3: rail endpoint at (230, 572), curls right under the MUX -->
  <line x1="230" y1="572" x2="413" y2="572" stroke="#ff8060" stroke-width="1.6"/>
  <circle cx="230" cy="572" r="4" fill="#ff8060"/>
  <line x1="413" y1="572" x2="413" y2="563" stroke="#ff8060" stroke-width="1.6" marker-end="url(#bbArrO)"/>
  <text direction="ltr" x="430" y="578" fill="#ff8060" font-size="10">sel</text>

  <line x1="446" y1="516" x2="650" y2="516" stroke="#80f0a0" stroke-width="2" marker-end="url(#bbArrG)"/>
  <text direction="ltr" x="720" y="512" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">(X+1)[3]</text>

  <!-- ─── Footer: total gate count ─── -->
  <text direction="ltr" x="400" y="616" text-anchor="middle" fill="#a0a0c0" font-size="12" font-style="italic">
    Total:  1 NOT  +  3 MUX 2:1   (sel shared across all 3 MUXes)
  </text>
</svg>`,
        answer:
`**ההבחנה המפתחית:** \`X+1\` הוא תמיד **המוצע** של \`X\` ו-\`X+2\`. הממוצע נבדק bit-by-bit לפי LSB של \`X\`:

| תנאי | מה זה אומר על X+1 |
|------|-------------------|
| \`X[0] = 0\` (X זוגי) | \`X+1 = X | 1\` — ביט תחתון מתחלף, MSBs זהים ל-\`X\` |
| \`X[0] = 1\` (X אי-זוגי) | \`X+1 = (X+2) & ~1\` — ביט תחתון מתאפס, MSBs זהים ל-\`X+2\` |

**שני המקרים מאוחדים:**
- LSB: \`(X+1)[0] = ¬X[0]\` (תמיד).
- בית \`i ≥ 1\`: \`(X+1)[i] = X[0] ? (X+2)[i] : X[i]\` (MUX 2:1 עם \`sel = X[0]\`).

**מימוש** (ראה הסכמה למעלה — 1 NOT + 3 MUX 2:1, sel משותף = X[0]).

**ספירה:** 1 NOT + 3 MUXים. אם רוצים גם בלי MUX (רק שערים בסיסיים), אפשר לפתוח כל MUX ל-\`(in0 ∧ ¬sel) ∨ (in1 ∧ sel)\` = 2 AND + NOT + OR לכל MUX = 12 שערים נוספים. סה"כ 13 שערים בסיסיים.

**הוכחה (לחיזוק):**
- \`X = 0011 (=3)\`, \`X+2 = 0101 (=5)\`. \`X[0] = 1\` → MUXים בוחרים מ-(X+2). \`(X+1) = ¬1, 1, 0, 1 = wait...\`
  - LSB: ¬1 = 0 ✓
  - bit 1: sel=1, in1=(X+2)[1]=0. ✓
  - bit 2: sel=1, in1=(X+2)[2]=1. ✓
  - bit 3: sel=1, in1=(X+2)[3]=0. ✓
  - תוצאה: 0100 = 4. ✓
- \`X = 0010 (=2)\`, \`X+2 = 0100 (=4)\`. \`X[0] = 0\` → MUXים בוחרים מ-X.
  - LSB: ¬0 = 1 ✓
  - bit 1: sel=0, in0=X[1]=1. ✓
  - bit 2: sel=0, in0=X[2]=0. ✓
  - bit 3: sel=0, in0=X[3]=0. ✓
  - תוצאה: 0011 = 3. ✓`,
        interviewerMindset:
`חידה אהובה. השלב הראשון של המראיין: לראות אם המועמד מזהה את ההבחנה "X+1 הוא הממוצע".

**סיגנל חזק:**
- "X+1 = ((X) + (X+2)) / 2 = avg".
- "אבל אם אסור חיבור, איך מחשבים ממוצע ביטית?"
- "תלוי בקריות של X" → פיתוח שתי המקרים.

**טעויות נפוצות:**
- ניסיון לבנות half-adder עם carries וקריאה לזה "לא חיבור" — לא יעבוד; המראיין יזהה.
- ניסיון \`X | (X+2)\` או \`X & (X+2)\` — לא מספיק.

**שאלת המשך:** "ולמערך 8-bit?" — אותו רעיון, פשוט 7 MUXים במקום 3.

**שאלת המשך גמורה:** "ומה אם נתון \`X\` ו-\`X+3\` ורוצים \`X+1\`?" — קשה יותר. כעת ההפרש 3 → המסלול שונה. \`X+1 = X + 1\`, \`X+3 = X + 3\`. הממוצע של X ו-(X+3) הוא X+1.5 → לא מתאים. הטריק לא מתבטל היטב.`,
        expectedAnswers: [
          'mux', 'multiplexer',
          'X[0]', 'x[0]', 'lsb',
          'not', '¬',
          'average', 'ממוצע',
          '3 mux', 'three mux',
          'sel', 'selector',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 7 (BlackBox x,x+2 → x+1)',
    tags: ['mux', '2:1-mux', 'combinational', 'puzzle', 'logic', 'arithmetic-trick'],
    circuit: () => build(() => {
      // Inputs: x[3..0] and (x+2)[3..0] — 8 separate 1-bit INPUT pads
      // (so the user can flip individual bits and watch the result).
      // Default: x = 5 (0101), x+2 = 7 (0111), expected x+1 = 6 (0110).
      const x0 = h.input(140, 120, 'x[0]');   x0.fixedValue = 1;
      const x1 = h.input(140, 200, 'x[1]');   x1.fixedValue = 0;
      const x2 = h.input(140, 280, 'x[2]');   x2.fixedValue = 1;
      const x3 = h.input(140, 360, 'x[3]');   x3.fixedValue = 0;
      const p0 = h.input(140, 480, '(x+2)[0]'); p0.fixedValue = 1;  // == x[0]
      const p1 = h.input(140, 560, '(x+2)[1]'); p1.fixedValue = 1;
      const p2 = h.input(140, 640, '(x+2)[2]'); p2.fixedValue = 1;
      const p3 = h.input(140, 720, '(x+2)[3]'); p3.fixedValue = 0;
      // Bit 0 of result = NOT x[0]
      const notX0 = h.gate('NOT', 380, 120);
      // Bits 1..3 = MUX(sel=x[0], in0=x[i], in1=(x+2)[i])
      const mux1 = h.mux(540, 240, 'MUX bit1');
      const mux2 = h.mux(540, 360, 'MUX bit2');
      const mux3 = h.mux(540, 480, 'MUX bit3');
      // Outputs
      const r0 = h.output(780, 120, '(x+1)[0]');
      const r1 = h.output(780, 240, '(x+1)[1]');
      const r2 = h.output(780, 360, '(x+1)[2]');
      const r3 = h.output(780, 480, '(x+1)[3]');
      return {
        nodes: [x0, x1, x2, x3, p0, p1, p2, p3, notX0, mux1, mux2, mux3, r0, r1, r2, r3],
        wires: [
          // bit 0
          h.wire(x0.id, notX0.id, 0),
          h.wire(notX0.id, r0.id, 0),
          // bit 1: MUX(sel=x[0], in0=x[1], in1=(x+2)[1])
          h.wire(x1.id, mux1.id, 0),
          h.wire(p1.id, mux1.id, 1),
          h.wire(x0.id, mux1.id, 2),
          h.wire(mux1.id, r1.id, 0),
          // bit 2
          h.wire(x2.id, mux2.id, 0),
          h.wire(p2.id, mux2.id, 1),
          h.wire(x0.id, mux2.id, 2),
          h.wire(mux2.id, r2.id, 0),
          // bit 3
          h.wire(x3.id, mux3.id, 0),
          h.wire(p3.id, mux3.id, 1),
          h.wire(x0.id, mux3.id, 2),
          h.wire(mux3.id, r3.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1007 — XOR from NAND gates only (slide 8)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'xor-from-nand-only',
    difficulty: 'easy',
    title: 'XOR משערי NAND בלבד',
    intro:
`ממש שער \`XOR\` באמצעות שערי \`NAND\` בלבד. כמה NANDs מינימליים נדרשים?

מאחר ש-\`NAND\` הוא **functionally complete** (אפשר לבנות כל פונקציה לוגית ממנו בלבד), הטריק כאן הוא להגיע למינימום.`,
    schematic: `
<svg viewBox="0 0 360 180" xmlns="http://www.w3.org/2000/svg" direction="ltr" font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="XOR gate with A, B inputs and Y output">
  <!-- A input -->
  <text x="40" y="64" text-anchor="middle" fill="#f0d080" font-weight="bold">A</text>
  <line x1="60" y1="60" x2="130" y2="60" stroke="#f0d080" stroke-width="1.6"/>
  <!-- B input -->
  <text x="40" y="126" text-anchor="middle" fill="#f0d080" font-weight="bold">B</text>
  <line x1="60" y1="120" x2="130" y2="120" stroke="#f0d080" stroke-width="1.6"/>
  <!-- XOR shape: D-shape body with extra curved input bar in front -->
  <path d="M 120 40 Q 145 90 120 140" stroke="#80d4ff" stroke-width="1.6" fill="none"/>
  <path d="M 130 40 Q 175 60 220 90 Q 175 120 130 140 Q 155 90 130 40 Z" fill="#0a1825" stroke="#80d4ff" stroke-width="1.6"/>
  <text x="166" y="96" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">⊕</text>
  <!-- Y output -->
  <line x1="220" y1="90" x2="290" y2="90" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="290,90 284,86 284,94" fill="#80f0a0"/>
  <text x="320" y="94" text-anchor="middle" fill="#80f0a0" font-weight="bold">Y = A ⊕ B</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'כמה שערי NAND? ציירו את המבנה.',
        hints: [
          'נסחו את \\\`XOR\\\` כפונקציית NAND-only. רמז: התחילו ב-\\\`A·B\\\` ההפוך = NAND(A,B).',
          'הגדירו עזר: \\\`N₁ = A NAND B = ¬(A∧B)\\\`. בעזרתו אפשר לבטא \\\`¬A + B\\\` ו-\\\`A + ¬B\\\`.',
          '\\\`N₂ = NAND(A, N₁) = ¬(A ∧ ¬(A·B)) = ¬A + (A·B) = ¬A + B\\\` (לאחר פישוט).',
          '\\\`N₃ = NAND(B, N₁) = A + ¬B\\\`.',
          '\\\`N₄ = NAND(N₂, N₃) = ¬((¬A + B) · (A + ¬B)) = ¬(¬A·A + ¬A·¬B + B·A + B·¬B) = ¬(¬A·¬B + A·B) = ¬XNOR = XOR\\\`. ✓',
          'סה"כ: **4 שערי NAND**.',
        ],
        answerSchematic: `
<svg viewBox="0 0 600 360" xmlns="http://www.w3.org/2000/svg" direction="ltr" font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="XOR built from 4 NAND gates">
  <!-- helper: NAND symbol = AND-shape body + bubble at output -->
  <!-- N1: NAND(A, B) — center-left -->
  <g>
    <path d="M 160 130 L 200 130 Q 240 130 240 160 Q 240 190 200 190 L 160 190 Z" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>
    <circle cx="250" cy="160" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>
    <text x="195" y="164" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="12">N1</text>
    <text x="195" y="180" text-anchor="middle" fill="#a0c0e0" font-size="9">NAND</text>
  </g>

  <!-- N2: NAND(A, N1) — top-right -->
  <g>
    <path d="M 380 50 L 420 50 Q 460 50 460 80 Q 460 110 420 110 L 380 110 Z" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>
    <circle cx="470" cy="80" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>
    <text x="415" y="84" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="12">N2</text>
    <text x="415" y="100" text-anchor="middle" fill="#a0c0e0" font-size="9">NAND</text>
  </g>

  <!-- N3: NAND(B, N1) — bottom-right -->
  <g>
    <path d="M 380 210 L 420 210 Q 460 210 460 240 Q 460 270 420 270 L 380 270 Z" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>
    <circle cx="470" cy="240" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>
    <text x="415" y="244" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="12">N3</text>
    <text x="415" y="260" text-anchor="middle" fill="#a0c0e0" font-size="9">NAND</text>
  </g>

  <!-- N4: NAND(N2, N3) — far-right (final) -->
  <g>
    <path d="M 510 130 L 550 130 Q 575 130 575 160 Q 575 190 550 190 L 510 190 Z" fill="#0a1825" stroke="#ffd060" stroke-width="1.8"/>
    <circle cx="585" cy="160" r="5" fill="#0a1825" stroke="#ffd060" stroke-width="1.8"/>
    <text x="545" y="164" text-anchor="middle" fill="#ffd060" font-weight="bold" font-size="12">N4</text>
    <text x="545" y="180" text-anchor="middle" fill="#e0c060" font-size="9">NAND</text>
  </g>

  <!-- inputs A and B -->
  <text x="40" y="64" fill="#f0d080" font-weight="bold">A</text>
  <text x="40" y="304" fill="#f0d080" font-weight="bold">B</text>

  <!-- A → N1 (in0) -->
  <line x1="60" y1="60" x2="120" y2="60" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="120" y1="60" x2="120" y2="142" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="120" y1="142" x2="160" y2="142" stroke="#f0d080" stroke-width="1.4"/>
  <circle cx="120" cy="60" r="3" fill="#f0d080"/>
  <!-- A → N2 (in0) -->
  <line x1="120" y1="60" x2="350" y2="60" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="350" y1="60" x2="350" y2="62" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="350" y1="62" x2="380" y2="62" stroke="#f0d080" stroke-width="1.4"/>

  <!-- B → N1 (in1) -->
  <line x1="60" y1="300" x2="140" y2="300" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="140" y1="300" x2="140" y2="178" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="140" y1="178" x2="160" y2="178" stroke="#f0d080" stroke-width="1.4"/>
  <circle cx="140" cy="300" r="3" fill="#f0d080"/>
  <!-- B → N3 (in0) -->
  <line x1="140" y1="300" x2="340" y2="300" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="340" y1="300" x2="340" y2="222" stroke="#f0d080" stroke-width="1.4"/>
  <line x1="340" y1="222" x2="380" y2="222" stroke="#f0d080" stroke-width="1.4"/>

  <!-- N1 output → N2 (in1) and N3 (in1) -->
  <line x1="255" y1="160" x2="290" y2="160" stroke="#80d4ff" stroke-width="1.4"/>
  <text x="270" y="154" fill="#80d4ff" font-size="10">N1</text>
  <line x1="290" y1="160" x2="290" y2="98" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="290" y1="98" x2="380" y2="98" stroke="#80d4ff" stroke-width="1.4"/>
  <circle cx="290" cy="160" r="3" fill="#80d4ff"/>
  <line x1="290" y1="160" x2="290" y2="258" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="290" y1="258" x2="380" y2="258" stroke="#80d4ff" stroke-width="1.4"/>

  <!-- N2 output → N4 (in0) -->
  <line x1="475" y1="80" x2="498" y2="80" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="498" y1="80" x2="498" y2="142" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="498" y1="142" x2="510" y2="142" stroke="#80d4ff" stroke-width="1.4"/>
  <text x="495" y="74" fill="#80d4ff" font-size="10">N2</text>

  <!-- N3 output → N4 (in1) -->
  <line x1="475" y1="240" x2="498" y2="240" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="498" y1="240" x2="498" y2="178" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="498" y1="178" x2="510" y2="178" stroke="#80d4ff" stroke-width="1.4"/>
  <text x="495" y="254" fill="#80d4ff" font-size="10">N3</text>

  <!-- N4 output → Y -->
  <line x1="590" y1="160" x2="600" y2="160" stroke="#ffd060" stroke-width="1.6"/>
  <polygon points="600,160 594,156 594,164" fill="#ffd060"/>

  <!-- Output label below -->
  <text x="585" y="200" text-anchor="middle" fill="#ffd060" font-weight="bold" font-size="13">Y = A ⊕ B</text>
</svg>`,
        answer:
`**4 שערי NAND** (ראה הסכמה למעלה).

**שלבים:**

| שער | חישוב | פישוט |
|-----|-------|--------|
| \`N₁\` | \`NAND(A, B)\` | \`¬(A·B)\` |
| \`N₂\` | \`NAND(A, N₁)\` | \`¬A + B\` |
| \`N₃\` | \`NAND(B, N₁)\` | \`A + ¬B\` |
| \`N₄\` | \`NAND(N₂, N₃)\` | \`(¬A·¬B) + (A·B)\` הוא XNOR; ה-NAND הופך אותו ל-XOR ✓ |

**הוכחה לפי טבלת אמת:**

| A | B | N₁ | N₂ | N₃ | N₄ = A⊕B |
|---|---|----|----|----|----------|
| 0 | 0 | 1  | 1  | 1  | **0** |
| 0 | 1 | 1  | 1  | 0  | **1** |
| 1 | 0 | 1  | 0  | 1  | **1** |
| 1 | 1 | 0  | 1  | 1  | **0** |

✓ זהה ל-XOR.

**למה NAND מינימלי?**
- NAND הוא **universal** (functionally complete) — אפשר לבנות כל פונקציה בוליאנית.
- מינימום מוכח ל-XOR מ-NANDs: **4** (לא ניתן ב-3).

**הכללה:** \`NOR\` גם universal. אפשר לבנות XOR גם מ-4 NORs בצורה מקבילה. תרגיל לבית.

**שאלת המשך (אם נשאלת):** "כמה לעשות AND? OR? NOT?"
- NOT: 1 NAND (חבר את שתי הכניסות יחד: \`¬A = NAND(A,A)\`).
- AND: 2 NANDs (\`A·B = NAND(NAND(A,B), NAND(A,B)) = ¬(¬(A·B)) = A·B\`).
- OR: 3 NANDs (קודם \`¬A, ¬B\` בעזרת 2 NANDs כל אחד, ואז NAND ביניהם — \`A + B = ¬(¬A · ¬B) = NAND(¬A, ¬B)\`).
- XOR: 4 NANDs (הפתרון לעיל).`,
        interviewerMindset:
`קלאסיקה. סינון מהיר ל-Junior/Mid.

**אם המועמד עונה 4** — ביציאה הוא מסביר את המבנה.
**אם המועמד מתעקש 5+** — הוא לא ראה את הטריק של reuse של \`N₁\`. שאלת המשך: "אפשר לחסוך אחד?"
**אם המועמד עונה "אי-אפשר"** — חמור. NAND universal.

**שאלת המשך אהובה:** "ובלי NAND, רק NOR?" — אותו רעיון בסימטריה: 4 NORs. הפיכת רכיב 0 ל-1.

**שאלת המשך-נסתרת:** "ולמה NAND/NOR universal אבל לא AND/OR לבד?" — תשובה: AND/OR לא יכולים לייצר NOT (אין דרך להחזיר 0 כשהקלט 1 וההפך). NAND/NOR בנויים על "השלילה המובנית" שמאפשרת לבטא NOT עם קלט יחיד.`,
        expectedAnswers: [
          '4', 'four', 'ארבע',
          'nand', 'NAND',
          'universal', 'functionally complete',
          'a nand b', 'NAND(a,b)',
          'n1', 'n2', 'n3', 'n4',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 8 (XOR משערי NAND)',
    tags: ['xor', 'nand', 'universal-gates', 'functional-completeness', 'combinational', 'logic'],
    circuit: () => build(() => {
      // 4 NAND gates: N1 = NAND(A,B), N2 = NAND(A,N1), N3 = NAND(B,N1),
      // Y = N4 = NAND(N2,N3).
      const a  = h.input(140, 200, 'A'); a.fixedValue = 1;
      const b  = h.input(140, 360, 'B'); b.fixedValue = 0;
      const n1 = h.gate('NAND', 380, 280);
      const n2 = h.gate('NAND', 580, 200);
      const n3 = h.gate('NAND', 580, 360);
      const n4 = h.gate('NAND', 800, 280);
      const y  = h.output(1020, 280, 'Y = A ⊕ B');
      return {
        nodes: [a, b, n1, n2, n3, n4, y],
        wires: [
          // N1 = NAND(A, B)
          h.wire(a.id, n1.id, 0),
          h.wire(b.id, n1.id, 1),
          // N2 = NAND(A, N1)
          h.wire(a.id,  n2.id, 0),
          h.wire(n1.id, n2.id, 1),
          // N3 = NAND(B, N1)
          h.wire(b.id,  n3.id, 0),
          h.wire(n1.id, n3.id, 1),
          // Y = NAND(N2, N3)
          h.wire(n2.id, n4.id, 0),
          h.wire(n3.id, n4.id, 1),
          h.wire(n4.id, y.id,  0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1008 — Barrel shifter from 2:1 MUX (slide 9)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'barrel-shifter-from-mux',
    difficulty: 'medium',
    title: 'Barrel shifter — מ-MUX 2:1 בלבד',
    intro:
`**א.** מה ההבדל בין \`regular shifter\` (Shift Register קלאסי) לבין \`barrel shifter\`?

**ב.** ממש \`barrel shifter\` של 4-bit (shift-right לוגי, 0..3 מקומות) באמצעות **MUXים 2:1 בלבד**.`,
    schematic: `
<svg viewBox="0 0 720 220" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12"
     role="img" aria-label="Barrel shifter: 4-bit X input + 2-bit S amount → 4-bit Y output">
  <!-- Body -->
  <rect x="220" y="50" width="280" height="120" rx="10" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8" stroke-dasharray="6 3"/>
  <text direction="ltr" x="360" y="92" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">Barrel Shifter</text>
  <text direction="ltr" x="360" y="116" text-anchor="middle" fill="#80a0c0" font-size="11">(combinational, 1 cycle)</text>
  <text direction="ltr" x="360" y="138" text-anchor="middle" fill="#a0c0e0" font-size="11">Y = X &gt;&gt; S</text>

  <!-- X input (top-left) -->
  <text direction="ltr" x="120" y="98" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">X</text>
  <text direction="ltr" x="120" y="114" text-anchor="middle" fill="#a09080" font-size="10">(4-bit)</text>
  <line x1="150" y1="100" x2="220" y2="100" stroke="#f0d080" stroke-width="1.8"/>
  <polygon points="220,100 214,96 214,104" fill="#f0d080"/>

  <!-- S input (bottom-left) — shift amount -->
  <text direction="ltr" x="120" y="148" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="14">S</text>
  <text direction="ltr" x="120" y="164" text-anchor="middle" fill="#806040" font-size="10">(2-bit amount)</text>
  <line x1="150" y1="150" x2="220" y2="150" stroke="#ff8060" stroke-width="1.8"/>
  <polygon points="220,150 214,146 214,154" fill="#ff8060"/>

  <!-- Y output -->
  <line x1="500" y1="110" x2="580" y2="110" stroke="#80f0a0" stroke-width="1.8"/>
  <polygon points="580,110 574,106 574,114" fill="#80f0a0"/>
  <text direction="ltr" x="620" y="106" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">Y</text>
  <text direction="ltr" x="620" y="122" text-anchor="middle" fill="#80a080" font-size="10">(4-bit)</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'מה ההבדל בין barrel shifter ל-regular shift register?',
        hints: [
          'Regular Shift Register מבוסס D-FFים — מסחנן ביט אחד **לכל קלוק**.',
          'Barrel shifter הוא **קומבינטורי** — מבצע הזזה בכל גודל בקלוק יחיד.',
          'Tradeoff: barrel דורש N·log₂(N) MUXים (אזור גדול), שיפט-רגיסטר דורש רק N FFים (אזור קטן אבל זמן N קלוקים).',
        ],
        answer:
`| תכונה | Regular shifter (Shift-Reg) | Barrel shifter |
|-------|------------------------------|-----------------|
| **מבנה** | N D-FFים בשרשרת | רשת קומבינטורית של MUXים |
| **זמן הזזה ב-k מקומות** | k קלוקים | קלוק יחיד (combinational) |
| **שטח (Area)** | \`O(N)\` FFים | \`O(N · log N)\` MUXים |
| **שימוש** | סדרתי, אטי, חסכוני | מהיר, ל-ALU/shift instructions |

**העיקרון של barrel:** במקום להזיז ביט-ביט, מבצעים **log₂(N)** הזזות בחזקות של 2 שונות, כל אחת מבוקרת ע"י ביט אחר של ה-shift-amount. שילוב הביטים בוחר את ההזזה הכוללת:
- ביט 0 של S → הזזה ב-1 (אופציונלית)
- ביט 1 של S → הזזה ב-2 (אופציונלית)
- ביט 2 של S → הזזה ב-4 (אופציונלית) — לרוחב 8-bit ומעלה
- ...
- ביט i של S → הזזה ב-\`2^i\`

מכפלת **כל** ההסתעפויות נותנת \`S = sum(2^i · S[i]) = 0..N-1\` — כל הזזה אפשרית.

**דוגמה ל-4-bit:** \`log₂(4) = 2\` שכבות. שכבה 0 מזיזה ב-0 או 1. שכבה 1 מזיזה ב-0 או 2. שתי השכבות יחד נותנות כל הזזה ב-{0,1,2,3}.`,
        expectedAnswers: [
          'combinational', 'קומבינטורי', 'sequential', 'סדרתי',
          'log', 'log2', 'log n',
          'mux', 'multiplexer',
          'one cycle', 'קלוק יחיד', 'instant',
          'shift register', 'shift-reg',
        ],
      },
      {
        label: 'ב',
        question: 'ממש barrel shift-right של 4-bit עם MUX 2:1 בלבד. כמה MUXים?',
        hints: [
          'שכבה 0 (S[0]): MUX לכל ביט — \\\`out[i] = S[0] ? X[i+1] : X[i]\\\`. בקצה: \\\`out[3] = S[0] ? 0 : X[3]\\\` (zero-fill).',
          'שכבה 1 (S[1]): MUX לכל ביט — \\\`Y[i] = S[1] ? out[i+2] : out[i]\\\`. בקצה: \\\`Y[2] = Y[3] = 0\\\` אם S[1]=1.',
          'סה"כ 8 MUXים: 4 לכל שכבה × 2 שכבות.',
          'הכללה: לרוחב N (חזקה של 2), \\\`N · log₂(N)\\\` MUXים.',
        ],
        answerSchematic: `
<svg viewBox="0 0 920 520" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', 'Consolas', monospace" font-size="11"
     role="img" aria-label="4-bit barrel shifter: 2 layers of 4 MUXes each">
  <defs>
    <linearGradient id="bsMux" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="bsArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="bsArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
    <marker id="bsArrO" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8060"/></marker>
    <marker id="bsArrY" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f0d080"/></marker>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="920" height="44" fill="#0c1a28"/>
  <text direction="ltr" x="460" y="28" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    4-bit Barrel Shift-Right:  2 layers × 4 MUX 2:1 = 8 MUXes total
  </text>

  <!-- Column headers -->
  <text direction="ltr" x="80"  y="78" text-anchor="middle" fill="#f0d080" font-weight="bold">X (input)</text>
  <text direction="ltr" x="340" y="78" text-anchor="middle" fill="#a0c0e0" font-weight="bold">Layer 0 — shift by S[0]</text>
  <text direction="ltr" x="600" y="78" text-anchor="middle" fill="#a0c0e0" font-weight="bold">Layer 1 — shift by 2·S[1]</text>
  <text direction="ltr" x="850" y="78" text-anchor="middle" fill="#80f0a0" font-weight="bold">Y (output)</text>

  <!-- ─── 4 X-inputs (column) ─── -->
  ${[
    { i: 0, y: 130 }, { i: 1, y: 220 }, { i: 2, y: 310 }, { i: 3, y: 400 },
  ].map(({ i, y }) => `
    <text direction="ltr" x="80" y="${y - 14}" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">X[${i}]</text>
    <circle cx="80" cy="${y}" r="3.5" fill="#f0d080"/>
    <line x1="80" y1="${y}" x2="${i === 3 ? 230 : 260}" y2="${y}" stroke="#f0d080" stroke-width="1.4"/>
  `).join('')}

  <!-- Layer 0: 4 MUXes (M00 .. M03) — each picks between X[i] and X[i+1] (or 0 for the top) -->
  ${[
    { i: 0, y: 130, in1FromY: 220, in1Lbl: 'X[1]' },
    { i: 1, y: 220, in1FromY: 310, in1Lbl: 'X[2]' },
    { i: 2, y: 310, in1FromY: 400, in1Lbl: 'X[3]' },
    { i: 3, y: 400, in1FromY: null, in1Lbl: '0'    },
  ].map(({ i, y, in1FromY, in1Lbl }) => {
    const muxTop = y - 22, muxBot = y + 38;
    return `
      <polygon points="260,${muxTop} 310,${y - 10} 310,${y + 26} 260,${muxBot}"
               fill="url(#bsMux)" stroke="#80d4ff" stroke-width="1.4"/>
      <text direction="ltr" x="285" y="${y + 12}" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="11">M0${i}</text>
      <text direction="ltr" x="270" y="${y - 1}" fill="#a0c0e0" font-size="8">in0</text>
      <text direction="ltr" x="270" y="${y + 22}" fill="#a0c0e0" font-size="8">in1</text>
      <!-- in1 input: either from X[i+1] (one row below) or '0' literal -->
      ${in1FromY != null
        ? `<line x1="${i === 3 ? 230 : 260}" y1="${y}" x2="${i === 3 ? 230 : 260}" y2="${y}" stroke="#f0d080"/>
           <line x1="240" y1="${in1FromY}" x2="240" y2="${y + 16}" stroke="#f0d080" stroke-width="1.4"/>
           <line x1="240" y1="${y + 16}" x2="260" y2="${y + 16}" stroke="#f0d080" stroke-width="1.4" marker-end="url(#bsArrY)"/>`
        : `<text direction="ltr" x="240" y="${y + 19}" text-anchor="middle" fill="#806040" font-size="11" font-weight="bold">0</text>
           <line x1="248" y1="${y + 16}" x2="260" y2="${y + 16}" stroke="#806040" stroke-width="1.2" marker-end="url(#bsArrY)"/>`
      }
      <!-- in0 arrow from X[i] direct -->
      <line x1="240" y1="${y}" x2="260" y2="${y}" stroke="#f0d080" stroke-width="1.4" marker-end="url(#bsArrY)"/>
      <!-- Layer 0 output to Layer 1 area -->
      <line x1="310" y1="${y + 8}" x2="500" y2="${y + 8}" stroke="#80d4ff" stroke-width="1.4"/>
      <circle cx="${(i === 0 || i === 1) ? 500 : 500}" cy="${y + 8}" r="3" fill="#80d4ff"/>
    `;
  }).join('')}

  <!-- S[0] sel rail running across all 4 Layer-0 MUXes -->
  <text direction="ltr" x="285" y="478" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="13">S[0]</text>
  <line x1="285" y1="160" x2="285" y2="462" stroke="#ff8060" stroke-width="2" stroke-dasharray="4 2"/>
  ${[130, 220, 310, 400].map(y => `
    <line x1="285" y1="${y + 38}" x2="285" y2="${y + 28}" stroke="#ff8060" stroke-width="1.4" marker-end="url(#bsArrO)"/>
    <circle cx="285" cy="${y + 38}" r="3" fill="#ff8060"/>
  `).join('')}

  <!-- Layer 1: 4 MUXes — pick between layer0_out[i] and layer0_out[i+2] (or 0 for top two) -->
  ${[
    { i: 0, y: 130, in1FromY: 310 },  // bit 0 picks from layer0 out[0] or out[2]
    { i: 1, y: 220, in1FromY: 400 },  // bit 1 picks from layer0 out[1] or out[3]
    { i: 2, y: 310, in1FromY: null }, // bit 2 picks from layer0 out[2] or 0
    { i: 3, y: 400, in1FromY: null }, // bit 3 picks from layer0 out[3] or 0
  ].map(({ i, y, in1FromY }) => `
    <polygon points="520,${y - 22} 570,${y - 10} 570,${y + 26} 520,${y + 38}"
             fill="url(#bsMux)" stroke="#80d4ff" stroke-width="1.4"/>
    <text direction="ltr" x="545" y="${y + 12}" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="11">M1${i}</text>
    <text direction="ltr" x="530" y="${y - 1}" fill="#a0c0e0" font-size="8">in0</text>
    <text direction="ltr" x="530" y="${y + 22}" fill="#a0c0e0" font-size="8">in1</text>
    <line x1="500" y1="${y + 8}" x2="520" y2="${y}" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#bsArrB)"/>
    ${in1FromY != null
      ? `<line x1="500" y1="${in1FromY + 8}" x2="500" y2="${y + 16}" stroke="#80d4ff" stroke-width="1.4"/>
         <line x1="500" y1="${y + 16}" x2="520" y2="${y + 16}" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#bsArrB)"/>`
      : `<text direction="ltr" x="500" y="${y + 19}" text-anchor="middle" fill="#806040" font-size="11" font-weight="bold">0</text>
         <line x1="508" y1="${y + 16}" x2="520" y2="${y + 16}" stroke="#806040" stroke-width="1.2" marker-end="url(#bsArrB)"/>`
    }
    <!-- Layer 1 output → Y[i] -->
    <line x1="570" y1="${y + 8}" x2="800" y2="${y + 8}" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#bsArrG)"/>
    <text direction="ltr" x="850" y="${y + 12}" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">Y[${i}]</text>
  `).join('')}

  <!-- S[1] sel rail across all 4 Layer-1 MUXes -->
  <text direction="ltr" x="545" y="478" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="13">S[1]</text>
  <line x1="545" y1="160" x2="545" y2="462" stroke="#ff8060" stroke-width="2" stroke-dasharray="4 2"/>
  ${[130, 220, 310, 400].map(y => `
    <line x1="545" y1="${y + 38}" x2="545" y2="${y + 28}" stroke="#ff8060" stroke-width="1.4" marker-end="url(#bsArrO)"/>
    <circle cx="545" cy="${y + 38}" r="3" fill="#ff8060"/>
  `).join('')}

  <!-- Footer -->
  <text direction="ltr" x="460" y="504" text-anchor="middle" fill="#a0a0c0" font-size="12" font-style="italic">
    Total: 8 MUX 2:1   (4-bit input × log₂4 layers).  S = (S[1] S[0]) selects shift amount 0..3.
  </text>
</svg>`,
        answer:
`**8 MUXים, 2 שכבות, log₂(4)=2 רמות בחירה.**

\`\`\`
שכבה 0 (S[0] = ביט נמוך):
  out0_0 = MUX(S[0], X[0], X[1])     # אם S[0]=1 → התקדמות ב-1
  out0_1 = MUX(S[0], X[1], X[2])
  out0_2 = MUX(S[0], X[2], X[3])
  out0_3 = MUX(S[0], X[3], 0)        # zero-fill

שכבה 1 (S[1] = ביט גבוה):
  Y[0] = MUX(S[1], out0_0, out0_2)   # אם S[1]=1 → התקדמות ב-2
  Y[1] = MUX(S[1], out0_1, out0_3)
  Y[2] = MUX(S[1], out0_2, 0)
  Y[3] = MUX(S[1], out0_3, 0)
\`\`\`

**ספירה:** 4 MUXים × 2 שכבות = **8 MUXים**.

**הכללה ל-N-bit (N חזקה של 2):** \`N · log₂(N)\` MUXים. ל-32-bit: \`32 · 5 = 160 MUXים\`.

**אימות:** עבור \`X = 1100 (= 12)\`, \`S = 11 (= 3)\`:
- Layer 0 (S[0]=1, shift-right by 1): out = \`0110\`
- Layer 1 (S[1]=1, shift-right by 2): Y = \`0001\` ✓ (\`12 >> 3 = 1\`)

**הרחבה לבחירת shift-left/right:** אפשר להוסיף XOR לפי כיוון בקלט המודר.

**הרחבה ל-arithmetic shift:** במקום zero-fill, להזין את ביט הסימן (\`X[N-1]\`) במקום \`0\`.

**עומק לוגי:** רק \`log₂(N)\` רמות MUX בין הקלט לפלט → תדר עבודה גבוה (פחות gate delays מאשר shift-register איטרטיבי).`,
        interviewerMindset:
`שאלה אהובה לראיוני junior/mid. המראיין מחפש:

1. **לראות שאתה מבחין בין סדרתי לקומבינטורי.** מועמד שמשתמש ב-D-FFים — לא הבין את השאלה.
2. **לראות log₂(N) במפורש.** "אם אני אומר 8-bit, כמה שכבות?" → "3, כי log₂(8) = 3". זו "הקצרה" של ה-trick.
3. **לטפל בקצה הביטים** (אילו ביטים מתמלאים באפסים בכל שכבה). מועמד שלא מתייחס ל-zero-fill — חסר במפרט.

**שאלת המשך נפוצה:** "ולמה לא להזיז את כל ה-3 ביטים בבת אחת (3 שכבות 0/1, 0/2, 0/4)?" — אפשרי תיאורטית אבל **בזבזני**: 3 שכבות במקום log₂(N). הברל היעיל מקודד את ה-shift בייצוג בינארי.

**שאלת המשך מתקדמת:** "ומה לרוחב שאינו חזקה של 2?" — מעגלים את N כלפי מעלה ומתעלמים מביטי-עיגול בקצה. שטח מבוזבז קצת אבל המבנה זהה.`,
        expectedAnswers: [
          '8', 'eight', 'שמונה',
          'mux', '2:1',
          'log', 'log2', 'log n',
          '2 layers', 'שתי שכבות', 'two layers',
          's[0]', 's[1]', 'shift amount',
          'zero-fill', 'zero fill',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 9 (Barrel shifter)',
    tags: ['barrel-shifter', 'mux', 'combinational', 'shift', 'log-depth', 'logic'],
    circuit: () => build(() => {
      // 4-bit barrel shift-right with 2 layers of 2:1 MUX (8 MUXes total).
      // Inputs: X[0..3] (data), S[0..1] (amount), ZERO (constant 0).
      // Outputs: Y[0..3].
      //
      // Default vector: X = 0b1100 (=12), S = 11 (=3) → expected Y = 0001 (=1).
      const zero = h.input(80, 720, '0');  zero.fixedValue = 0;
      const s0   = h.input(80, 580, 'S[0]'); s0.fixedValue = 1;
      const s1   = h.input(80, 660, 'S[1]'); s1.fixedValue = 1;
      const x0   = h.input(80, 120, 'X[0]'); x0.fixedValue = 0;  // LSB of 1100 → bit 0 = 0
      const x1   = h.input(80, 240, 'X[1]'); x1.fixedValue = 0;
      const x2   = h.input(80, 360, 'X[2]'); x2.fixedValue = 1;
      const x3   = h.input(80, 480, 'X[3]'); x3.fixedValue = 1;
      // Layer 0 MUXes
      const m00 = h.mux(320, 120, 'M00');
      const m01 = h.mux(320, 240, 'M01');
      const m02 = h.mux(320, 360, 'M02');
      const m03 = h.mux(320, 480, 'M03');
      // Layer 1 MUXes
      const m10 = h.mux(560, 120, 'M10');
      const m11 = h.mux(560, 240, 'M11');
      const m12 = h.mux(560, 360, 'M12');
      const m13 = h.mux(560, 480, 'M13');
      // Outputs
      const y0 = h.output(820, 120, 'Y[0]');
      const y1 = h.output(820, 240, 'Y[1]');
      const y2 = h.output(820, 360, 'Y[2]');
      const y3 = h.output(820, 480, 'Y[3]');
      return {
        nodes: [zero, s0, s1, x0, x1, x2, x3,
                m00, m01, m02, m03, m10, m11, m12, m13,
                y0, y1, y2, y3],
        wires: [
          // ── Layer 0 ── MUX 2:1 pins: in0(0), in1(1), sel(2)
          // M00: in0=X[0], in1=X[1], sel=S[0]
          h.wire(x0.id, m00.id, 0), h.wire(x1.id, m00.id, 1), h.wire(s0.id, m00.id, 2),
          // M01: in0=X[1], in1=X[2], sel=S[0]
          h.wire(x1.id, m01.id, 0), h.wire(x2.id, m01.id, 1), h.wire(s0.id, m01.id, 2),
          // M02: in0=X[2], in1=X[3], sel=S[0]
          h.wire(x2.id, m02.id, 0), h.wire(x3.id, m02.id, 1), h.wire(s0.id, m02.id, 2),
          // M03: in0=X[3], in1=0 (zero-fill), sel=S[0]
          h.wire(x3.id, m03.id, 0), h.wire(zero.id, m03.id, 1), h.wire(s0.id, m03.id, 2),

          // ── Layer 1 ── shift by 0 or 2
          // M10: in0=out0, in1=out2, sel=S[1] → Y[0]
          h.wire(m00.id, m10.id, 0), h.wire(m02.id, m10.id, 1), h.wire(s1.id, m10.id, 2),
          // M11: in0=out1, in1=out3, sel=S[1] → Y[1]
          h.wire(m01.id, m11.id, 0), h.wire(m03.id, m11.id, 1), h.wire(s1.id, m11.id, 2),
          // M12: in0=out2, in1=0, sel=S[1] → Y[2]
          h.wire(m02.id, m12.id, 0), h.wire(zero.id, m12.id, 1), h.wire(s1.id, m12.id, 2),
          // M13: in0=out3, in1=0, sel=S[1] → Y[3]
          h.wire(m03.id, m13.id, 0), h.wire(zero.id, m13.id, 1), h.wire(s1.id, m13.id, 2),

          // ── Outputs ──
          h.wire(m10.id, y0.id, 0),
          h.wire(m11.id, y1.id, 0),
          h.wire(m12.id, y2.id, 0),
          h.wire(m13.id, y3.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1009 — Swap 5 ↔ 7 in 3-bit (slide 13)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'swap-5-and-7-3bit',
    difficulty: 'easy',
    title: 'החלפת 5 ↔ 7 ב-3 ביטים — שערים בלבד',
    intro:
`באמצעות שערים לוגיים בלבד, ממש רכיב שמקבל 3 סיביות ומוציא את המספר שהתקבל,
**למעט** \`5\` שיהפוך ל-\`7\`, ו-\`7\` שיהפוך ל-\`5\`. כל שאר הערכים (0,1,2,3,4,6) עוברים בלי שינוי.

\`\`\`
  binary    in   →   out
  000       0    →   0
  001       1    →   1
  010       2    →   2
  011       3    →   3
  100       4    →   4
  101       5    →   7     ← swap
  110       6    →   6
  111       7    →   5     ← swap
\`\`\``,
    schematic: `
<svg viewBox="0 0 460 200" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="3-bit black box: 5↔7 swap, others identity">
  <rect x="160" y="50" width="160" height="100" rx="8" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8" stroke-dasharray="6 3"/>
  <text direction="ltr" x="240" y="86" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="15">Swap 5↔7</text>
  <text direction="ltr" x="240" y="110" text-anchor="middle" fill="#a0c0e0" font-size="11">others unchanged</text>

  <text direction="ltr" x="80" y="84" text-anchor="middle" fill="#f0d080" font-weight="bold">in (3 bits)</text>
  <line x1="120" y1="80" x2="160" y2="80" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="160,80 154,76 154,84" fill="#f0d080"/>

  <line x1="320" y1="120" x2="380" y2="120" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="380,120 374,116 374,124" fill="#80f0a0"/>
  <text direction="ltr" x="420" y="124" text-anchor="middle" fill="#80f0a0" font-weight="bold">out (3 bits)</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. כמה שערים?',
        hints: [
          'הסתכל בטבלה — איזה ביט משתנה ב-5↔7? B2 ו-B0 זהים בשני המקרים; רק \\\`B1\\\` משתנה.',
          'מתי להפוך את B1? כש-B2=1 וגם B0=1 (= הערך 5 או 7).',
          'הנוסחה: \\\`B1_out = B1 ⊕ (B2 ∧ B0)\\\`. ביטים אחרים: \\\`B0_out = B0\\\`, \\\`B2_out = B2\\\`.',
          'סה"כ: **1 AND + 1 XOR**. שני שערים בלבד.',
        ],
        answer:
`**1 AND + 1 XOR. שני שערים בלבד.**

\`\`\`
B0_out = B0                          (pass-through)
B2_out = B2                          (pass-through)
B1_out = B1 ⊕ (B2 ∧ B0)             ← הפיכה בתנאי
\`\`\`

**הסבר:** הערכים 5 ו-7 חולקים את אותם B0=1, B2=1. ההבדל ביניהם הוא ה-B1:
- 5 = \`101\` (B2=1, B1=**0**, B0=1)
- 7 = \`111\` (B2=1, B1=**1**, B0=1)

אז כדי להחליף ביניהם, יש להפוך את B1 **בדיוק** כש-B2=1 וגם B0=1 (תנאי שמתקיים רק עבור 5 ו-7).

**הביטוי הבוליאני \`B1 ⊕ (B2·B0)\`** עושה בדיוק את זה:
- אם \`B2·B0 = 0\` (כל המקרים פרט ל-5 ו-7) → \`B1 ⊕ 0 = B1\` (ללא שינוי).
- אם \`B2·B0 = 1\` (רק 5 ו-7) → \`B1 ⊕ 1 = ¬B1\` (הופך את הביט).

**ספירה:** 1 AND (\`B2·B0\`) + 1 XOR (\`B1 ⊕ ...\`). חסכוני מאוד.

**שאלת המשך:** "ומה אם רוצים להחליף 5 ↔ 3?" — 5 = 101, 3 = 011. הם נבדלים ב-B2 וב-B1. צריך לוגיקה יותר מסובכת — לא טריוויאלי.`,
        interviewerMindset:
`שאלה אהובה ב-junior. בודקת **מציאת התבנית** מתוך טבלת אמת.

**סיגנל חזק:** מועמד שמסתכל בטבלה ושואל "אילו ביטים שונים בין 5 ל-7?" — מציאת תבנית במקום כתיבת K-map מלא.

**סיגנל חלש:** מועמד שכותב מפת קרנו ל-3 משתנים ופותר אותה בקושי. עובד אבל לא יעיל לבעיה כל-כך מוגדרת.

**שאלת המשך:** "ולמה לא רק \`B1 ⊕ (B2·B0)\` בלי לתחזק את B0 ו-B2?" — כי הם פלטים שצריך! לא רק B1 מהפלט.`,
        expectedAnswers: [
          'b1 xor', 'b1 ⊕', 'xor',
          'b2 and b0', 'b2·b0', 'b2 ∧ b0',
          '1 and', '2 gates', 'שני שערים',
          '5', '7', 'swap',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 13 (Swap 5↔7)',
    tags: ['combinational', 'xor', 'truth-table', 'pattern', 'logic'],
    circuit: () => build(() => {
      // 3 single-bit inputs B0, B1, B2 + 1 AND + 1 XOR + 3 outputs.
      // Default: input = 5 (B2=1, B1=0, B0=1) → output should be 7 (B2=1, B1=1, B0=1).
      const b0 = h.input(120, 200, 'B0'); b0.fixedValue = 1;
      const b1 = h.input(120, 320, 'B1'); b1.fixedValue = 0;
      const b2 = h.input(120, 440, 'B2'); b2.fixedValue = 1;
      const and = h.gate('AND', 380, 320);          // B2 ∧ B0
      const xor = h.gate('XOR', 620, 320);          // B1 ⊕ (B2·B0)
      const out0 = h.output(880, 200, 'out[0] = B0');
      const out1 = h.output(880, 320, 'out[1]');
      const out2 = h.output(880, 440, 'out[2] = B2');
      return {
        nodes: [b0, b1, b2, and, xor, out0, out1, out2],
        wires: [
          // AND(B2, B0)
          h.wire(b2.id, and.id, 0),
          h.wire(b0.id, and.id, 1),
          // XOR(B1, AND_out)
          h.wire(b1.id,  xor.id, 0),
          h.wire(and.id, xor.id, 1),
          // outputs (B0 and B2 pass-through, B1_out from XOR)
          h.wire(b0.id,  out0.id, 0),
          h.wire(xor.id, out1.id, 0),
          h.wire(b2.id,  out2.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1010 — Cascaded comparator (slide 14)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'cascaded-comparator',
    difficulty: 'medium',
    title: 'משווה דו-ספרתי משערים + שרשור',
    intro:
`**א.** באמצעות שערים לוגיים בסיסיים, ממש רכיב **A** — משווה 2-ביט.
הרכיב מקבל \`X\` ו-\`Y\` (2 ביט כל אחד), ופלט בן 3 ביטים: \`X>Y\`, \`X==Y\`, \`X<Y\`.

**ב.** באמצעות הרכיב **A**, ממש רכיב **B** — משווה 2-ספרתי, כאשר כל ספרה היא 2 ביט.
הרכיב מקבל \`X\` ו-\`Y\` (4 ביט כל אחד = שתי ספרות בנות 2 ביט), ופלט בן 3 ביטים.`,
    schematic: `
<svg viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="Component A: 2-bit comparator with three outputs GT, EQ, LT">
  <rect x="170" y="50" width="160" height="100" rx="8" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8" stroke-dasharray="6 3"/>
  <text direction="ltr" x="250" y="92" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="18">A</text>
  <text direction="ltr" x="250" y="114" text-anchor="middle" fill="#a0c0e0" font-size="11">2-bit comparator</text>

  <text direction="ltr" x="100" y="80" text-anchor="middle" fill="#f0d080" font-weight="bold">X (2-bit)</text>
  <line x1="140" y1="76" x2="170" y2="76" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="170,76 164,72 164,80" fill="#f0d080"/>

  <text direction="ltr" x="100" y="128" text-anchor="middle" fill="#f0d080" font-weight="bold">Y (2-bit)</text>
  <line x1="140" y1="124" x2="170" y2="124" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="170,124 164,120 164,128" fill="#f0d080"/>

  <line x1="330" y1="70" x2="380" y2="70" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="380,70 374,66 374,74" fill="#80f0a0"/>
  <text direction="ltr" x="420" y="74" text-anchor="middle" fill="#80f0a0" font-weight="bold">X &gt; Y</text>

  <line x1="330" y1="100" x2="380" y2="100" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="380,100 374,96 374,104" fill="#80f0a0"/>
  <text direction="ltr" x="420" y="104" text-anchor="middle" fill="#80f0a0" font-weight="bold">X == Y</text>

  <line x1="330" y1="130" x2="380" y2="130" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="380,130 374,126 374,134" fill="#80f0a0"/>
  <text direction="ltr" x="420" y="134" text-anchor="middle" fill="#80f0a0" font-weight="bold">X &lt; Y</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'בנה את **A** משערים בסיסיים. רמז: התחל מ-EQ.',
        hints: [
          'EQ הוא הקל ביותר: \\\`X==Y\\\` ⇔ כל ביט תואם ⇔ \\\`(X[1] XNOR Y[1]) ∧ (X[0] XNOR Y[0])\\\`. שני XNOR + 1 AND.',
          'GT: \\\`X>Y\\\` קורה אם הביט הגבוה ב-X גבוה יותר, **או** הביטים הגבוהים שווים והנמוך ב-X גבוה יותר.',
          '\\\`X>Y = (X[1] ∧ ¬Y[1]) ∨ ((X[1] XNOR Y[1]) ∧ X[0] ∧ ¬Y[0])\\\`',
          'LT הוא ההופכי: \\\`X<Y = ¬(X>Y) ∧ ¬(X==Y)\\\`. אפשר גם להחיל את אותה נוסחה עם X ו-Y מוחלפים.',
        ],
        answer:
`**ביטויים בוליאניים (3 פלטים, 2-ביט):**

\`\`\`
EQ = (X[1] XNOR Y[1]) ∧ (X[0] XNOR Y[0])

GT = (X[1] ∧ ¬Y[1])                              ← הביט הגבוה של X גבוה
   ∨ ((X[1] XNOR Y[1]) ∧ X[0] ∧ ¬Y[0])           ← אחרת: ביטים גבוהים שווים, X[0]>Y[0]

LT = (¬X[1] ∧ Y[1])                              ← סימטרי ל-GT
   ∨ ((X[1] XNOR Y[1]) ∧ ¬X[0] ∧ Y[0])
\`\`\`

**ספירת שערים (אופציה אופטימלית):**
- \`x1_eq_y1 = X[1] XNOR Y[1]\` (1 XNOR)
- \`x0_eq_y0 = X[0] XNOR Y[0]\` (1 XNOR)
- \`EQ = x1_eq_y1 ∧ x0_eq_y0\` (1 AND)
- \`GT = (X[1] ∧ ¬Y[1]) ∨ (x1_eq_y1 ∧ X[0] ∧ ¬Y[0])\` (2 AND + 1 NOT + 1 AND2 + 1 OR = 5 שערים)
- \`LT = ...\` סימטרי (5 שערים, חלקם משותפים)

**סה"כ:** ~8-10 שערים בסיסיים. אם משתפים XNORs בין הפלטים — יורד עוד.

**אלטרנטיבה — שיטת חיסור:** ALU/Subtractor → אם \`X-Y\` שלילי = LT, אפס = EQ, חיובי = GT. אבל זה כבר ALU, לא שאלת comparator טהורה.`,
        expectedAnswers: [
          'xnor', 'eq', 'gt', 'lt',
          'x[1]', 'x[0]', 'y[1]', 'y[0]',
          'x > y', 'x == y', 'x < y',
          '8 gates', '10 gates',
        ],
      },
      {
        label: 'ב',
        question: 'בנה את **B** (משווה 2-ספרתי, 4 ביט) באמצעות מודולי **A** + שערים. כמה A?',
        hints: [
          'הסתכל על שתי ספרות בכל מספר: \\\`X = (X_hi, X_lo)\\\`, \\\`Y = (Y_hi, Y_lo)\\\` כאשר כל ספרה היא 2 ביט.',
          '**אם** הספרות הגבוהות שונות — הן קובעות לבדן.',
          '**אם** הספרות הגבוהות שוות — הספרות הנמוכות קובעות.',
          'שני מודולי A: \\\`A_hi\\\` למשווה הגבוה, \\\`A_lo\\\` למשווה הנמוך.',
          'נוסחאות סופיות: \\\`GT = A_hi.GT ∨ (A_hi.EQ ∧ A_lo.GT)\\\`, \\\`LT = A_hi.LT ∨ (A_hi.EQ ∧ A_lo.LT)\\\`, \\\`EQ = A_hi.EQ ∧ A_lo.EQ\\\`.',
          'סה"כ: **2 × A + 2 AND + 2 OR + 1 AND = 7 שערים נוספים** ל-2 רכיבי A.',
        ],
        answerSchematic: `
<svg viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="Cascaded comparator B: 2 A modules + cascade logic for GT/EQ/LT">
  <defs>
    <linearGradient id="ccBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="ccArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="ccArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="720" height="40" fill="#0c1a28"/>
  <text direction="ltr" x="360" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Cascade:  high digits decide first; low digits break ties
  </text>

  <!-- A_hi module -->
  <rect x="200" y="70" width="120" height="80" rx="6" fill="url(#ccBody)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="260" y="100" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="15">A_hi</text>
  <text direction="ltr" x="260" y="120" text-anchor="middle" fill="#a0c0e0" font-size="10">compare hi digits</text>

  <!-- A_lo module -->
  <rect x="200" y="220" width="120" height="80" rx="6" fill="url(#ccBody)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="260" y="250" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="15">A_lo</text>
  <text direction="ltr" x="260" y="270" text-anchor="middle" fill="#a0c0e0" font-size="10">compare lo digits</text>

  <!-- Inputs -->
  <text direction="ltr" x="80" y="94" fill="#f0d080" font-weight="bold">X_hi</text>
  <line x1="130" y1="90" x2="200" y2="90" stroke="#f0d080" stroke-width="1.6" marker-end="url(#ccArrB)"/>
  <text direction="ltr" x="80" y="134" fill="#f0d080" font-weight="bold">Y_hi</text>
  <line x1="130" y1="130" x2="200" y2="130" stroke="#f0d080" stroke-width="1.6" marker-end="url(#ccArrB)"/>

  <text direction="ltr" x="80" y="244" fill="#f0d080" font-weight="bold">X_lo</text>
  <line x1="130" y1="240" x2="200" y2="240" stroke="#f0d080" stroke-width="1.6" marker-end="url(#ccArrB)"/>
  <text direction="ltr" x="80" y="284" fill="#f0d080" font-weight="bold">Y_lo</text>
  <line x1="130" y1="280" x2="200" y2="280" stroke="#f0d080" stroke-width="1.6" marker-end="url(#ccArrB)"/>

  <!-- A_hi outputs labelled -->
  <line x1="320" y1="85" x2="400" y2="85" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="360" y="78" text-anchor="middle" fill="#80d4ff" font-size="10">A_hi.GT</text>
  <line x1="320" y1="110" x2="400" y2="110" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="360" y="104" text-anchor="middle" fill="#80d4ff" font-size="10">A_hi.EQ</text>
  <line x1="320" y1="135" x2="400" y2="135" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="360" y="128" text-anchor="middle" fill="#80d4ff" font-size="10">A_hi.LT</text>

  <!-- A_lo outputs labelled -->
  <line x1="320" y1="235" x2="400" y2="235" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="360" y="228" text-anchor="middle" fill="#80d4ff" font-size="10">A_lo.GT</text>
  <line x1="320" y1="260" x2="400" y2="260" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="360" y="254" text-anchor="middle" fill="#80d4ff" font-size="10">A_lo.EQ</text>
  <line x1="320" y1="285" x2="400" y2="285" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="360" y="278" text-anchor="middle" fill="#80d4ff" font-size="10">A_lo.LT</text>

  <!-- Cascade logic block -->
  <rect x="420" y="80" width="180" height="220" rx="8" fill="#0a1420" stroke="#ff8060" stroke-width="1.6" stroke-dasharray="4 2"/>
  <text direction="ltr" x="510" y="100" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="13">cascade logic</text>

  <text direction="ltr" x="510" y="140" text-anchor="middle" fill="#c0c0e0" font-size="11">GT = A_hi.GT</text>
  <text direction="ltr" x="510" y="156" text-anchor="middle" fill="#c0c0e0" font-size="11">∨ (A_hi.EQ · A_lo.GT)</text>

  <text direction="ltr" x="510" y="190" text-anchor="middle" fill="#c0c0e0" font-size="11">EQ = A_hi.EQ · A_lo.EQ</text>

  <text direction="ltr" x="510" y="234" text-anchor="middle" fill="#c0c0e0" font-size="11">LT = A_hi.LT</text>
  <text direction="ltr" x="510" y="250" text-anchor="middle" fill="#c0c0e0" font-size="11">∨ (A_hi.EQ · A_lo.LT)</text>

  <!-- Final outputs -->
  <line x1="600" y1="140" x2="660" y2="140" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#ccArrG)"/>
  <text direction="ltr" x="690" y="144" text-anchor="middle" fill="#80f0a0" font-weight="bold">X &gt; Y</text>

  <line x1="600" y1="190" x2="660" y2="190" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#ccArrG)"/>
  <text direction="ltr" x="690" y="194" text-anchor="middle" fill="#80f0a0" font-weight="bold">X == Y</text>

  <line x1="600" y1="240" x2="660" y2="240" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#ccArrG)"/>
  <text direction="ltr" x="690" y="244" text-anchor="middle" fill="#80f0a0" font-weight="bold">X &lt; Y</text>

  <text direction="ltr" x="360" y="340" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    2 × A modules  +  3 ANDs + 2 ORs  =  cascade for any width with N×A modules
  </text>
</svg>`,
        answer:
`**שני מודולי A + 5 שערים סה"כ** (לוגיקת cascade).

**הרעיון:** כשמשווים מספרים דו-ספרתיים, **הספרה הגבוהה מכריעה** — אם היא שונה, אין צורך להסתכל בנמוכה. **רק כשהגבוהות שוות** — הספרה הנמוכה מכריעה.

**הביטויים הסופיים:**

\`\`\`
EQ_total = A_hi.EQ ∧ A_lo.EQ           ← שניהם שווים
GT_total = A_hi.GT ∨ (A_hi.EQ ∧ A_lo.GT)
LT_total = A_hi.LT ∨ (A_hi.EQ ∧ A_lo.LT)
\`\`\`

**ספירה:**
- 2 × A (במודל מ-א' = 2 × ~10 שערים = ~20 שערים פנימיים)
- + 2 AND + 2 OR + 1 AND = 5 שערי cascade
- סה"כ ~25 שערים בסיסיים, או 2 A's + 5 שערים אם מתייחסים ל-A כקופסה שחורה.

**שאלת המשך — הרחבה ל-4 ספרות (16 ביט):** אותו רעיון ברקורסיה: 2 רכיבי B (כל אחד 2-ספרתי) + cascade זהה. או — שרשור ישיר של 4 A's עם cascade chain.

**הכללה ל-N ספרות:** \`N\` רכיבי A + cascade logic של עומק \`O(log N)\` (priority chain). מבנה זהה לקודן Priority encoder.`,
        interviewerMindset:
`שאלת cascade קלאסית. המראיין מחפש:

1. **שמצאת את עקרון ה-cascade**: "הגבוה תחילה". מועמד שמתחיל לבנות תאי AND ענקיים — מפספס.
2. **שדאגת ל-EQ_total**: שניהם שווים. מועמד שמדלג על EQ — חסר.
3. **שראית שזה משפחה רחבה יותר** — "ולמעשה אפשר להמשיך לכל רוחב". בונוס.

**שאלה חשובה:** "ומה אם רק GT דרוש (לא EQ ו-LT)?" → אפשר לחסוך — צריך רק A.GT ו-A.EQ (לא A.LT). הופך את A לפשוט יותר. סיגנל ל-cost-aware design.`,
        expectedAnswers: [
          '2', 'two', 'שניים',
          'a_hi', 'a_lo', 'high', 'low',
          'cascade', 'שרשור',
          'eq', 'gt', 'lt',
          'or', 'and',
          'a_hi.eq', 'a.eq',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 14 (משווה דו-ספרתי)',
    tags: ['comparator', 'cascade', 'combinational', 'composition', 'logic'],
    // Canvas demo: B-component with 2 COMPARATOR built-ins as the A modules.
    // Default: X = (2, 3) = 11, Y = (2, 1) = 9 → expect GT=1.
    circuit: () => build(() => {
      const xHi = h.input(120, 120, 'X_hi'); xHi.fixedValue = 2;
      const yHi = h.input(120, 200, 'Y_hi'); yHi.fixedValue = 2;
      const xLo = h.input(120, 360, 'X_lo'); xLo.fixedValue = 3;
      const yLo = h.input(120, 440, 'Y_lo'); yLo.fixedValue = 1;
      const aHi = h.block('COMPARATOR', 320, 160, { label: 'A_hi' });
      const aLo = h.block('COMPARATOR', 320, 400, { label: 'A_lo' });
      // Cascade gates
      const andGtTie = h.gate('AND', 560, 280);  // A_hi.EQ ∧ A_lo.GT
      const orGt     = h.gate('OR',  720, 200);  // A_hi.GT ∨ (above)
      const andLtTie = h.gate('AND', 560, 360);  // A_hi.EQ ∧ A_lo.LT
      const orLt     = h.gate('OR',  720, 440);  // A_hi.LT ∨ (above)
      const andEq    = h.gate('AND', 720, 320);  // A_hi.EQ ∧ A_lo.EQ
      // Outputs
      const oGt = h.output(900, 200, 'X > Y');
      const oEq = h.output(900, 320, 'X == Y');
      const oLt = h.output(900, 440, 'X < Y');
      return {
        nodes: [xHi, yHi, xLo, yLo, aHi, aLo,
                andGtTie, orGt, andLtTie, orLt, andEq,
                oGt, oEq, oLt],
        wires: [
          // A_hi inputs
          h.wire(xHi.id, aHi.id, 0),
          h.wire(yHi.id, aHi.id, 1),
          // A_lo inputs
          h.wire(xLo.id, aLo.id, 0),
          h.wire(yLo.id, aLo.id, 1),
          // GT cascade: A_hi.GT (out1) ∨ (A_hi.EQ (out0) ∧ A_lo.GT (out1))
          h.wire(aHi.id, andGtTie.id, 0, 0),   // A_hi.__out0 = EQ
          h.wire(aLo.id, andGtTie.id, 1, 1),   // A_lo.__out1 = GT
          h.wire(aHi.id, orGt.id, 0, 1),       // A_hi.__out1 = GT
          h.wire(andGtTie.id, orGt.id, 1),
          h.wire(orGt.id, oGt.id, 0),
          // EQ cascade: A_hi.EQ ∧ A_lo.EQ
          h.wire(aHi.id, andEq.id, 0, 0),
          h.wire(aLo.id, andEq.id, 1, 0),
          h.wire(andEq.id, oEq.id, 0),
          // LT cascade: A_hi.LT (out2) ∨ (A_hi.EQ ∧ A_lo.LT (out2))
          h.wire(aHi.id, andLtTie.id, 0, 0),
          h.wire(aLo.id, andLtTie.id, 1, 2),
          h.wire(aHi.id, orLt.id, 0, 2),
          h.wire(andLtTie.id, orLt.id, 1),
          h.wire(orLt.id, oLt.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1011 — 2^n:1 MUX from decoder + basic gates (slide 16)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'mux-from-decoder',
    difficulty: 'easy',
    title: 'MUX 2ⁿ:1 מ-decoder ושערים בסיסיים',
    intro:
`בעזרת \`decoder\` ושערים לוגיים בסיסיים, ממש \`MUX 2ⁿ:1\`.

ל-\`n = 2\` (MUX 4:1): יש 4 כניסות נתונים \`I₀..I₃\`, 2 קווי בחירה \`S₁ S₀\`, ופלט יחיד \`Y\`. הפלט שווה ל-\`I_k\` כאשר \`k\` הוא הערך הבינארי של \`(S₁ S₀)\`.`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל ל-MUX 4:1. כמה decoder, AND, OR?',
        hints: [
          'Decoder 2:4 ממיר את 2 קווי הבחירה ל-4 קווים one-hot (\\\`D₀..D₃\\\`): בדיוק אחד מהם דולק לפי \\\`k = (S₁ S₀)\\\`.',
          'לכל קלט \\\`I_k\\\`, השתמש ב-AND עם \\\`D_k\\\` — מקבל את \\\`I_k\\\` אם נבחר, אחרת 0.',
          'סוכמים את כל ה-AND עם OR-4 (או 3 OR-2 בעץ).',
          'סה"כ: **1 decoder + 4 AND + 3 OR-2** (או 1 OR-4).',
          'הכללה ל-2ⁿ:1: \\\`1 decoder n:2ⁿ + 2ⁿ AND + (2ⁿ-1) OR-2\\\`.',
        ],
        answerSchematic: `
<svg viewBox="0 0 840 460" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13"
     role="img" aria-label="4:1 MUX from 2:4 decoder + 4 ANDs + 4-input OR">
  <defs>
    <linearGradient id="muxDecGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="muxArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="muxArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
    <marker id="muxArrY" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f0d080"/></marker>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="840" height="44" fill="#0c1a28"/>
  <text direction="ltr" x="420" y="28" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Y = Σₖ (Dₖ · Iₖ)    ,   Dₖ = 1 ⇔ (S₁ S₀) == k
  </text>

  <!-- Decoder block -->
  <rect x="140" y="100" width="140" height="280" rx="10" fill="url(#muxDecGrad)" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="210" y="142" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">Decoder</text>
  <text direction="ltr" x="210" y="166" text-anchor="middle" fill="#a0c0e0" font-size="12">2 : 4</text>

  <!-- S1, S0 inputs -->
  <text direction="ltr" x="60" y="214" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="14">S₁</text>
  <line x1="84" y1="210" x2="140" y2="210" stroke="#ff8060" stroke-width="1.8" marker-end="url(#muxArrY)"/>
  <text direction="ltr" x="60" y="270" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="14">S₀</text>
  <line x1="84" y1="266" x2="140" y2="266" stroke="#ff8060" stroke-width="1.8" marker-end="url(#muxArrY)"/>

  <!-- D3, D2, D1, D0 outputs (top to bottom) -->
  <line x1="280" y1="130" x2="370" y2="130" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="324" y="124" text-anchor="middle" fill="#80d4ff" font-size="12" font-weight="bold">D₃</text>

  <line x1="280" y1="210" x2="370" y2="210" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="324" y="204" text-anchor="middle" fill="#80d4ff" font-size="12" font-weight="bold">D₂</text>

  <line x1="280" y1="290" x2="370" y2="290" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="324" y="284" text-anchor="middle" fill="#80d4ff" font-size="12" font-weight="bold">D₁</text>

  <line x1="280" y1="370" x2="370" y2="370" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="324" y="364" text-anchor="middle" fill="#80d4ff" font-size="12" font-weight="bold">D₀</text>

  <!-- AND gates (D-shape) -->
  ${[
    { y: 130, k: 3 },
    { y: 210, k: 2 },
    { y: 290, k: 1 },
    { y: 370, k: 0 },
  ].map(({ y, k }) => `
    <path d="M 370 ${y - 16} L 400 ${y - 16} Q 422 ${y - 16} 422 ${y} Q 422 ${y + 16} 400 ${y + 16} L 370 ${y + 16} Z"
          fill="${'url(#muxDecGrad)'}" stroke="#80d4ff" stroke-width="1.6"/>
    <text direction="ltr" x="395" y="${y + 4}" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="11">AND</text>
    <!-- I_k input arrow from below -->
    <line x1="385" y1="${y + 36}" x2="385" y2="${y + 16}" stroke="#f0d080" stroke-width="1.4" marker-end="url(#muxArrY)"/>
    <text direction="ltr" x="385" y="${y + 52}" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="12">I${'₀₁₂₃'[k]}</text>
    <!-- Output to OR -->
    <line x1="422" y1="${y}" x2="540" y2="${y}" stroke="#80d4ff" stroke-width="1.4"/>
  `).join('')}

  <!-- OR-4 gate (large D-shape) -->
  <path d="M 540 110 Q 590 130 590 250 Q 590 370 540 390 Q 565 250 540 110 Z M 540 110 L 600 110 Q 660 200 660 250 Q 660 300 600 390 L 540 390 Q 565 250 540 110 Z"
        fill="url(#muxDecGrad)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="610" y="246" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="15">OR-4</text>
  <text direction="ltr" x="610" y="266" text-anchor="middle" fill="#a0c0e0" font-size="10">(or tree of 3 OR-2)</text>

  <!-- Final output -->
  <line x1="660" y1="250" x2="760" y2="250" stroke="#80f0a0" stroke-width="2" marker-end="url(#muxArrG)"/>
  <text direction="ltr" x="800" y="246" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="18">Y</text>

  <!-- Legend at bottom -->
  <text direction="ltr" x="420" y="432" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    1 decoder 2:4  +  4 AND-2  +  3 OR-2 (or 1 OR-4)   •   exactly one Dₖ = 1 selects I_k
  </text>
</svg>`,
        answer:
`**מימוש MUX 4:1 (n=2): decoder 2:4 + 4 AND + OR-4** (ראה הסכמה).

**איך זה עובד:**
- Decoder 2:4 הופך \`(S₁,S₀)\` ל-one-hot signal \`(D₀,D₁,D₂,D₃)\`: בדיוק אחד מהם 1.
- כל AND מסך \`I_k\` עם \`D_k\` — אם הקלט נבחר → AND פלט = \`I_k\`; אחרת = 0.
- ה-OR סוכם הכל. מכיוון שבדיוק AND אחד הוא non-zero, התוצאה היא \`I_k\`.

**נוסחה כללית:**
\`\`\`
Y = Σₖ (Dₖ · Iₖ)    ,   Dₖ = 1 ⇔ (S₁S₀) = k
\`\`\`

**ספירת רכיבים:**
- 1 decoder 2:4 (מוכל)
- 4 AND-2 (אחד לכל input)
- 3 OR-2 (עץ) או 1 OR-4

**הכללה ל-MUX 2ⁿ:1:**
- 1 decoder n:2ⁿ
- 2ⁿ AND-2
- 2ⁿ−1 OR-2 (עץ ב-log n שכבות)

**שאלת המשך נפוצה:** "מה ההבדל בעומק לוגי בין מימוש זה לבין MUX 2:1 בעץ?"
- **MUX-tree:** 2ⁿ−1 MUXים, עומק \`log n\`. כל קלט עובר \`log n\` MUXים → \`O(log n)\` עומק.
- **Decoder+AND+OR:** decoder עצמו עומק \`O(log n)\`, ועוד 2 שכבות (AND ו-OR-tree עומק \`O(log n)\`). סה"כ \`O(log n)\` גם.

עומק זהה אסימפטוטית; הבדל בשטח/אופי, לא בעומק.`,
        interviewerMindset:
`שאלת חימום classic. המראיין מחפש:

1. **שאתה מבין מה decoder עושה** — one-hot encoding. אם לא — שאלת אבחון.
2. **שאתה רואה את הקשר decoder → MUX** — decoder + AND + OR = MUX. הכיוון ההפוך (encoder + ...) פחות שימושי.
3. **הכללה מנטלית ל-2ⁿ:1** — מועמד שעונה רק על המקרה המוגדר (4:1) ועוצר → מפספס את העקרון.

**שאלת המשך:** "ו-DEMUX?" → התשובה הפוכה: decoder עם enable = input. ה-decoder עצמו, עם enable מתפקד כ-DEMUX 1:2ⁿ.`,
        expectedAnswers: [
          'decoder', 'one-hot', 'one hot',
          'and', 'or',
          '4 and', '4 ands',
          'mux', '4:1', '2^n',
          'd_k', 'dk', 'd0', 'd1',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 16 (MUX from decoder)',
    tags: ['mux', 'decoder', 'combinational', 'composition', 'logic'],
    // Canvas demo: 4:1 MUX from 2:4 decoder + 4 AND + 3 OR.
    // Default: I0=0, I1=1, I2=2, I3=3 (one-hot-ish for illustration), S = 2 → Y = I2 = 2.
    circuit: () => build(() => {
      // Inputs: 2 sel bits + 4 data inputs
      const s1 = h.input(80, 80, 'S1');  s1.fixedValue = 1;
      const s0 = h.input(80, 160, 'S0'); s0.fixedValue = 0;
      const i0 = h.input(80, 280, 'I0'); i0.fixedValue = 0;
      const i1 = h.input(80, 360, 'I1'); i1.fixedValue = 0;
      const i2 = h.input(80, 440, 'I2'); i2.fixedValue = 1;   // selected (S=10)
      const i3 = h.input(80, 520, 'I3'); i3.fixedValue = 0;
      // Decoder 2:4 — pins: S[0]=in0, S[1]=in1 → out0..out3 one-hot
      const dec = h.block('DECODER', 300, 120, { inputBits: 2, label: 'DEC 2:4' });
      // 4 ANDs (one per input, gated by decoder output)
      const a0 = h.gate('AND', 520, 280);
      const a1 = h.gate('AND', 520, 360);
      const a2 = h.gate('AND', 520, 440);
      const a3 = h.gate('AND', 520, 520);
      // OR tree: 3 OR-2
      const or01 = h.gate('OR', 720, 320);   // a0 ∨ a1
      const or23 = h.gate('OR', 720, 480);   // a2 ∨ a3
      const orAll = h.gate('OR', 900, 400);  // (a0∨a1) ∨ (a2∨a3)
      const y = h.output(1100, 400, 'Y');
      return {
        nodes: [s1, s0, i0, i1, i2, i3, dec, a0, a1, a2, a3, or01, or23, orAll, y],
        wires: [
          // Decoder inputs: bit 0 = S0 (input 0), bit 1 = S1 (input 1)
          h.wire(s0.id, dec.id, 0),
          h.wire(s1.id, dec.id, 1),
          // Each AND: I_k AND D_k (D_k = dec.__out{k})
          h.wire(i0.id, a0.id, 0),
          h.wire(dec.id, a0.id, 1, 0),   // dec.__out0 = D0
          h.wire(i1.id, a1.id, 0),
          h.wire(dec.id, a1.id, 1, 1),   // dec.__out1 = D1
          h.wire(i2.id, a2.id, 0),
          h.wire(dec.id, a2.id, 1, 2),   // dec.__out2 = D2
          h.wire(i3.id, a3.id, 0),
          h.wire(dec.id, a3.id, 1, 3),   // dec.__out3 = D3
          // OR tree
          h.wire(a0.id, or01.id, 0),
          h.wire(a1.id, or01.id, 1),
          h.wire(a2.id, or23.id, 0),
          h.wire(a3.id, or23.id, 1),
          h.wire(or01.id, orAll.id, 0),
          h.wire(or23.id, orAll.id, 1),
          h.wire(orAll.id, y.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1012 — Sort-4 from Sort-2 components (slide 17)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'sort-4-from-sort-2',
    difficulty: 'medium',
    title: 'Sort-4 ממודולי Sort-2',
    intro:
`נתון הרכיב **Sort-2**: 2 כניסות (\`a, b\`), 2 יציאות — \`max(a,b)\` ו-\`min(a,b)\`.

באמצעות יחידות מסוג \`Sort-2\` בלבד, ממש את הרכיב **Sort-4**: 4 כניסות (\`a, b, c, d\`),
4 יציאות מסודרות בסדר עולה: \`Max, M₂, M₁, Min\` כך שהיציאה הראשונה היא הגדולה ביותר.
**המימוש צריך להיות פשוט ככל שניתן (שימוש במספר קטן ככל האפשר של יחידות).**`,
    schematic: `
<svg viewBox="0 0 720 240" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="Sort-2 and Sort-4 components">
  <!-- Sort-2 box -->
  <rect x="80"  y="60"  width="120" height="100" rx="8" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8" stroke-dasharray="6 3"/>
  <text direction="ltr" x="140" y="100" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">Sort-2</text>
  <text direction="ltr" x="140" y="120" text-anchor="middle" fill="#a0c0e0" font-size="10">2 in → 2 out</text>

  <text direction="ltr" x="40" y="86" fill="#f0d080" font-weight="bold">a</text>
  <line x1="56" y1="82" x2="80" y2="82" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="80,82 74,78 74,86" fill="#f0d080"/>
  <text direction="ltr" x="40" y="136" fill="#f0d080" font-weight="bold">b</text>
  <line x1="56" y1="132" x2="80" y2="132" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="80,132 74,128 74,136" fill="#f0d080"/>

  <line x1="200" y1="82" x2="240" y2="82" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="240,82 234,78 234,86" fill="#80f0a0"/>
  <text direction="ltr" x="278" y="86" text-anchor="middle" fill="#80f0a0" font-size="12">max(a,b)</text>

  <line x1="200" y1="132" x2="240" y2="132" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="240,132 234,128 234,136" fill="#80f0a0"/>
  <text direction="ltr" x="278" y="136" text-anchor="middle" fill="#80f0a0" font-size="12">min(a,b)</text>

  <!-- Sort-4 box -->
  <rect x="430" y="40" width="180" height="160" rx="8" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8" stroke-dasharray="6 3"/>
  <text direction="ltr" x="520" y="106" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="18">Sort-4</text>
  <text direction="ltr" x="520" y="128" text-anchor="middle" fill="#a0c0e0" font-size="11">4 in → 4 out (sorted)</text>

  <text direction="ltr" x="390" y="68" fill="#f0d080" font-weight="bold">a</text>
  <line x1="406" y1="64" x2="430" y2="64" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="430,64 424,60 424,68" fill="#f0d080"/>
  <text direction="ltr" x="390" y="108" fill="#f0d080" font-weight="bold">b</text>
  <line x1="406" y1="104" x2="430" y2="104" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="430,104 424,100 424,108" fill="#f0d080"/>
  <text direction="ltr" x="390" y="148" fill="#f0d080" font-weight="bold">c</text>
  <line x1="406" y1="144" x2="430" y2="144" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="430,144 424,140 424,148" fill="#f0d080"/>
  <text direction="ltr" x="390" y="188" fill="#f0d080" font-weight="bold">d</text>
  <line x1="406" y1="184" x2="430" y2="184" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="430,184 424,180 424,188" fill="#f0d080"/>

  <line x1="610" y1="64" x2="650" y2="64" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="650,64 644,60 644,68" fill="#80f0a0"/>
  <text direction="ltr" x="684" y="68" text-anchor="middle" fill="#80f0a0" font-size="11">Max</text>

  <line x1="610" y1="104" x2="650" y2="104" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="650,104 644,100 644,108" fill="#80f0a0"/>
  <text direction="ltr" x="684" y="108" text-anchor="middle" fill="#80f0a0" font-size="11">M₂</text>

  <line x1="610" y1="144" x2="650" y2="144" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="650,144 644,140 644,148" fill="#80f0a0"/>
  <text direction="ltr" x="684" y="148" text-anchor="middle" fill="#80f0a0" font-size="11">M₁</text>

  <line x1="610" y1="184" x2="650" y2="184" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="650,184 644,180 644,188" fill="#80f0a0"/>
  <text direction="ltr" x="684" y="188" text-anchor="middle" fill="#80f0a0" font-size="11">Min</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'בנה את Sort-4 ממינימום יחידות Sort-2. כמה צריך, ובאיזה topology?',
        hints: [
          'תחילה: סדר כל זוג בנפרד. \\\`Sort-2(a, b)\\\` ו-\\\`Sort-2(c, d)\\\`. כעת יש לך שני זוגות ממוינים.',
          'אחרי שלב 1: יודעים שב-(a₁, b₁) הקטן ראשון; ב-(c₁, d₁) הקטן ראשון. ה-Min הגלובלי הוא \\\`min(a₁, c₁)\\\`. ה-Max הגלובלי הוא \\\`max(b₁, d₁)\\\`.',
          'שלב 2: \\\`Sort-2(a₁, c₁)\\\` נותן את ה-Min הגלובלי + ערך אמצעי-נמוך. \\\`Sort-2(b₁, d₁)\\\` נותן ערך אמצעי-גבוה + Max הגלובלי.',
          'שלב 3: יש לנו 2 ערכים אמצעיים שטרם הושוו זה לזה. \\\`Sort-2(אמצעי-נמוך, אמצעי-גבוה)\\\` נותן את \\\`M₁\\\` (קטן יותר) ו-\\\`M₂\\\` (גדול יותר).',
          'סה"כ: **5 יחידות Sort-2 ב-3 שכבות**. זוהי רשת מיון אופטימלית ל-4 קלטים (sorting network).',
        ],
        answerSchematic: `
<svg viewBox="0 0 880 480" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="Sort-4 from 5 Sort-2 modules in 3 stages">
  <defs>
    <linearGradient id="s2Body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="srtArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="srtArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="880" height="44" fill="#0c1a28"/>
  <text direction="ltr" x="440" y="28" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Sort-4 = 5 × Sort-2  (3 stages, optimal sorting network for n=4)
  </text>

  <!-- Stage column headers -->
  <text direction="ltr" x="190" y="74" text-anchor="middle" fill="#a0c0e0" font-weight="bold">Stage 1</text>
  <text direction="ltr" x="190" y="88" text-anchor="middle" fill="#a0c0e0" font-size="10">sort pairs</text>
  <text direction="ltr" x="440" y="74" text-anchor="middle" fill="#a0c0e0" font-weight="bold">Stage 2</text>
  <text direction="ltr" x="440" y="88" text-anchor="middle" fill="#a0c0e0" font-size="10">find extremes</text>
  <text direction="ltr" x="690" y="74" text-anchor="middle" fill="#a0c0e0" font-weight="bold">Stage 3</text>
  <text direction="ltr" x="690" y="88" text-anchor="middle" fill="#a0c0e0" font-size="10">sort middles</text>

  <!-- ── Stage 1: S1 (a,b) and S2 (c,d) ── -->
  <rect x="140" y="120" width="100" height="80" rx="8" fill="url(#s2Body)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="190" y="150" text-anchor="middle" fill="#80d4ff" font-weight="bold">S1</text>
  <text direction="ltr" x="190" y="170" text-anchor="middle" fill="#a0c0e0" font-size="10">Sort-2</text>

  <rect x="140" y="240" width="100" height="80" rx="8" fill="url(#s2Body)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="190" y="270" text-anchor="middle" fill="#80d4ff" font-weight="bold">S2</text>
  <text direction="ltr" x="190" y="290" text-anchor="middle" fill="#a0c0e0" font-size="10">Sort-2</text>

  <!-- Stage 1 inputs -->
  <text direction="ltr" x="60" y="144" fill="#f0d080" font-weight="bold" font-size="14">a</text>
  <line x1="80" y1="140" x2="140" y2="140" stroke="#f0d080" stroke-width="1.6" marker-end="url(#srtArrB)"/>
  <text direction="ltr" x="60" y="184" fill="#f0d080" font-weight="bold" font-size="14">b</text>
  <line x1="80" y1="180" x2="140" y2="180" stroke="#f0d080" stroke-width="1.6" marker-end="url(#srtArrB)"/>
  <text direction="ltr" x="60" y="264" fill="#f0d080" font-weight="bold" font-size="14">c</text>
  <line x1="80" y1="260" x2="140" y2="260" stroke="#f0d080" stroke-width="1.6" marker-end="url(#srtArrB)"/>
  <text direction="ltr" x="60" y="304" fill="#f0d080" font-weight="bold" font-size="14">d</text>
  <line x1="80" y1="300" x2="140" y2="300" stroke="#f0d080" stroke-width="1.6" marker-end="url(#srtArrB)"/>

  <!-- ── Stage 2: S3 (a₁,c₁) and S4 (b₁,d₁) ── -->
  <rect x="390" y="120" width="100" height="80" rx="8" fill="url(#s2Body)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="440" y="150" text-anchor="middle" fill="#80d4ff" font-weight="bold">S3</text>
  <text direction="ltr" x="440" y="170" text-anchor="middle" fill="#a0c0e0" font-size="10">sort min-of-pairs</text>

  <rect x="390" y="240" width="100" height="80" rx="8" fill="url(#s2Body)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="440" y="270" text-anchor="middle" fill="#80d4ff" font-weight="bold">S4</text>
  <text direction="ltr" x="440" y="290" text-anchor="middle" fill="#a0c0e0" font-size="10">sort max-of-pairs</text>

  <!-- Stage 1 → Stage 2 wiring -->
  <!-- S1 max (b₁) at output top → S4 input top -->
  <line x1="240" y1="140" x2="320" y2="140" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="280" y="134" text-anchor="middle" fill="#80d4ff" font-size="10">b₁=max(a,b)</text>
  <line x1="320" y1="140" x2="320" y2="260" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="320" y1="260" x2="390" y2="260" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#srtArrB)"/>

  <!-- S1 min (a₁) at output bottom → S3 input top -->
  <line x1="240" y1="180" x2="320" y2="180" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="280" y="196" text-anchor="middle" fill="#80d4ff" font-size="10">a₁=min(a,b)</text>
  <line x1="320" y1="180" x2="320" y2="140" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="320" y1="140" x2="390" y2="140" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#srtArrB)"/>

  <!-- S2 max (d₁) → S4 input bottom -->
  <line x1="240" y1="260" x2="350" y2="260" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="290" y="254" text-anchor="middle" fill="#80d4ff" font-size="10">d₁=max(c,d)</text>
  <line x1="350" y1="260" x2="350" y2="300" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="350" y1="300" x2="390" y2="300" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#srtArrB)"/>

  <!-- S2 min (c₁) → S3 input bottom -->
  <line x1="240" y1="300" x2="350" y2="300" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="290" y="316" text-anchor="middle" fill="#80d4ff" font-size="10">c₁=min(c,d)</text>
  <line x1="350" y1="300" x2="350" y2="180" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="350" y1="180" x2="390" y2="180" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#srtArrB)"/>

  <!-- ── Stage 3: S5 (m₁, m₂) ── -->
  <rect x="640" y="180" width="100" height="80" rx="8" fill="url(#s2Body)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="690" y="210" text-anchor="middle" fill="#80d4ff" font-weight="bold">S5</text>
  <text direction="ltr" x="690" y="230" text-anchor="middle" fill="#a0c0e0" font-size="10">sort middles</text>

  <!-- S3 max → Min global -->
  <line x1="490" y1="140" x2="800" y2="140" stroke="#80f0a0" stroke-width="1.6" marker-end="url(#srtArrG)"/>
  <text direction="ltr" x="850" y="144" text-anchor="middle" fill="#80f0a0" font-weight="bold">Min</text>

  <!-- S3 min (= median-low) → S5 input top -->
  <line x1="490" y1="180" x2="580" y2="180" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="540" y="174" text-anchor="middle" fill="#80d4ff" font-size="10">m₁</text>
  <line x1="580" y1="180" x2="580" y2="200" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="580" y1="200" x2="640" y2="200" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#srtArrB)"/>

  <!-- S4 max → Max global -->
  <line x1="490" y1="300" x2="800" y2="300" stroke="#80f0a0" stroke-width="1.6" marker-end="url(#srtArrG)"/>
  <text direction="ltr" x="850" y="304" text-anchor="middle" fill="#80f0a0" font-weight="bold">Max</text>

  <!-- S4 min (= median-high) → S5 input bottom -->
  <line x1="490" y1="260" x2="580" y2="260" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="540" y="276" text-anchor="middle" fill="#80d4ff" font-size="10">m₂</text>
  <line x1="580" y1="260" x2="580" y2="240" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="580" y1="240" x2="640" y2="240" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#srtArrB)"/>

  <!-- S5 outputs → M₁, M₂ -->
  <line x1="740" y1="200" x2="800" y2="200" stroke="#80f0a0" stroke-width="1.6" marker-end="url(#srtArrG)"/>
  <text direction="ltr" x="850" y="204" text-anchor="middle" fill="#80f0a0" font-weight="bold">M₂</text>
  <line x1="740" y1="240" x2="800" y2="240" stroke="#80f0a0" stroke-width="1.6" marker-end="url(#srtArrG)"/>
  <text direction="ltr" x="850" y="244" text-anchor="middle" fill="#80f0a0" font-weight="bold">M₁</text>

  <!-- Footer -->
  <text direction="ltr" x="440" y="430" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    5 Sort-2 modules.  Depth = 3 stages.  Optimal for n=4 (proven).
  </text>
  <text direction="ltr" x="440" y="452" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    Output order: Min &lt; M₁ &lt; M₂ &lt; Max  ✓
  </text>
</svg>`,
        answer:
`**5 יחידות Sort-2, 3 שכבות.**

**שלב 1 — מיון זוגות:**
\`\`\`
S₁: (a, b)  →  (a₁=min, b₁=max)
S₂: (c, d)  →  (c₁=min, d₁=max)
\`\`\`

**שלב 2 — מציאת הקצוות:**
\`\`\`
S₃: (a₁, c₁)  →  (Min, m₁)        ← Min גלובלי (קטן בין שני המינימומים)
S₄: (b₁, d₁)  →  (m₂, Max)        ← Max גלובלי (גדול בין שני המקסימומים)
\`\`\`

\`m₁\` הוא ה"קטן הגדול יותר" — הוא גדול מ-Min אבל קטן מ-Max. דומה למ-\`m₂\`.

**שלב 3 — מיון האמצעיים:**
\`\`\`
S₅: (m₁, m₂)  →  (M₁, M₂)         ← שני האמצעיים, ממוינים
\`\`\`

**יציאה סופית (סדר עולה):**
\`\`\`
Min  <  M₁  <  M₂  <  Max
\`\`\`

**ספירה: 5 Sort-2 modules. עומק 3 שלבים.**

זוהי **רשת המיון האופטימלית** ל-4 קלטים — הוכח (Knuth, "The Art of Computer Programming" Vol. 3) ש-5 משווים זה המינימום ושעומק 3 הוא המינימום.

**שאלת המשך מתבקשת:** "ולמה לא 4 משווים?" → אם רק 4 משווים, יש לפחות זוג קלטים שלא הושוו ישירות או בעקיפין. דורש הוכחת תחתון (lower bound) מבוסס תורת המידע.

**שאלת המשך — Sort-N:** רשת המיון של Batcher (bitonic) דורשת \`O(N · log²N)\` משווים בעומק \`O(log²N)\`. AKS-network (תאורטי) משיג \`O(N log N)\` משווים בעומק \`O(log N)\` — אבל קשה לבנות בפועל.`,
        interviewerMindset:
`שאלת sorting network קלאסית — בודקת חשיבה מבנית.

**מועמד חזק:**
1. **מזהה את הסימטריה:** "סדר זוגות ראשון, אז ה-Min הגלובלי מבין שני המינימומים, וה-Max מבין שני המקסימומים."
2. **עוצר על 5** ולא נכנס לסיבוכים. אם בונה 6+ — מפספס את האופטימליות.
3. **מזכיר sorting networks** ו-AKS/Batcher בשאלת המשך — מוכיח ידע נרחב.

**מועמד חלש:**
- בונה bubble sort עם 6 משווים — עובד אבל לא אופטימלי.
- לא מבחין בין "כל זוג קלטים" (\`C(4,2)=6\`) ל-"מספיק כדי למיין" (5).

**שאלת bonus:** "ומה אם מספיק רק לקבל את ה-Min וה-Max, לא את הסדר המלא?" → 4 משווים מספיקים. אחרי שלב 1 (2 משווים), Min הוא min(a₁,c₁) (משווה 3) ו-Max הוא max(b₁,d₁) (משווה 4). חוסכים את S₅.`,
        expectedAnswers: [
          '5', 'five', 'חמש',
          'sort-2', 'sort2', 'sort 2',
          'stages', 'שכבות', '3', 'three',
          'min', 'max', 'מינימום', 'מקסימום',
          'sorting network',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 17 (Sort-4 from Sort-2)',
    tags: ['sorting-network', 'sort-2', 'sort-4', 'combinational', 'composition', 'optimal'],
  },

  // ───────────────────────────────────────────────────────────────
  // #1013 — Majority-3-of-4 + reverse build M2 (slide 23)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'majority-3-of-4',
    difficulty: 'medium',
    title: 'רכיב רוב 3-מתוך-4 — ביטוי, מימוש, ושימוש להרכבת רוב 2-מתוך-4',
    intro:
`נתון רכיב עם 4 כניסות בינאריות. הרכיב מחזיר \`1\` אם **לפחות 3** מהכניסות הן \`1\`, אחרת \`0\`.

**א.** כתוב את הביטוי הבוליאני עבור הרכיב.
**ב.** ממש אותו באמצעות שערים לוגיים.
**ג.** ממש באמצעות רכיב זה רכיב המחזיר \`1\` אם **לפחות 2** כניסות הן \`1\`.`,
    schematic: `
<svg viewBox="0 0 460 180" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="Majority 3-of-4 component">
  <rect x="170" y="40" width="140" height="100" rx="8" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8" stroke-dasharray="6 3"/>
  <text direction="ltr" x="240" y="78" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">M₃-of-4</text>
  <text direction="ltr" x="240" y="100" text-anchor="middle" fill="#a0c0e0" font-size="11">≥ 3 of 4 inputs = 1</text>

  <text direction="ltr" x="120" y="64" text-anchor="middle" fill="#f0d080" font-weight="bold">a</text>
  <line x1="140" y1="60" x2="170" y2="60" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="170,60 164,56 164,64" fill="#f0d080"/>
  <text direction="ltr" x="120" y="88" text-anchor="middle" fill="#f0d080" font-weight="bold">b</text>
  <line x1="140" y1="84" x2="170" y2="84" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="170,84 164,80 164,88" fill="#f0d080"/>
  <text direction="ltr" x="120" y="112" text-anchor="middle" fill="#f0d080" font-weight="bold">c</text>
  <line x1="140" y1="108" x2="170" y2="108" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="170,108 164,104 164,112" fill="#f0d080"/>
  <text direction="ltr" x="120" y="136" text-anchor="middle" fill="#f0d080" font-weight="bold">d</text>
  <line x1="140" y1="132" x2="170" y2="132" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="170,132 164,128 164,136" fill="#f0d080"/>

  <line x1="310" y1="90" x2="370" y2="90" stroke="#80f0a0" stroke-width="1.6"/>
  <polygon points="370,90 364,86 364,94" fill="#80f0a0"/>
  <text direction="ltr" x="402" y="94" text-anchor="middle" fill="#80f0a0" font-weight="bold">Y</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'כתוב את הביטוי הבוליאני של הרכיב.',
        hints: [
          '"לפחות 3 מתוך 4" = OR של כל 4 השילובים האפשריים של 3-מתוך-4 כניסות פעילות.',
          'יש \\\`C(4,3) = 4\\\` שילובים: \\\`abc, abd, acd, bcd\\\` (לכלול את 4 הכניסות).',
          'הביטוי: \\\`Y = abc + abd + acd + bcd\\\` (+ = OR).',
        ],
        answer:
`**ביטוי "Sum of Products":**

\`\`\`
Y = abc + abd + acd + bcd
\`\`\`

(כאשר \`+\` הוא OR ומכפלה ללא סימן היא AND.)

**הסבר:** כל אחד מ-4 ה-AND-3's מזהה צירוף של 3 כניסות מהן 4. כש**לפחות** 3 הן 1, לפחות אחד מה-ANDs יוצא 1 → ה-OR מספיק.

**פישוט אופציונלי** (פקטוריזציה):
\`\`\`
Y = ab(c + d) + cd(a + b)
\`\`\`

(הוצאת \`ab\` מ-\`abc + abd\`, ו-\`cd\` מ-\`acd + bcd\`.)

זהו ביטוי "monotone" — מונוטוני, אין שלילה. סימן לפונקציה המעדיפה גידול. כל פונקציית רוב היא monotone.`,
        expectedAnswers: [
          'abc + abd + acd + bcd',
          'abc+abd+acd+bcd',
          'abc',
          'sum of products',
          'sop',
          'majority', 'רוב',
          'ab(c+d) + cd(a+b)',
        ],
      },
      {
        label: 'ב',
        question: 'ממש את הרכיב באמצעות שערים לוגיים. כמה?',
        hints: [
          'מימוש ישיר: 4 שערי AND-3 + שער OR-4. סה"כ **5 שערים** במבנה השטוח.',
          'אופציה ראשונה: \\\`AND(a,b,c) ∨ AND(a,b,d) ∨ AND(a,c,d) ∨ AND(b,c,d)\\\`.',
          'אופציה אופטימלית: שתף תוצאות ביניים. \\\`x = ab\\\`, \\\`y = cd\\\`. אז \\\`Y = x·(c+d) + y·(a+b)\\\`. סה"כ 2 AND + 2 OR + 2 AND + 1 OR = ~7 שערים אבל עומק קטן יותר.',
          'דוגמת מימוש קומפקטית: \\\`Y = MAJ(a, b, c) + MAJ(a, b, d) + MAJ(a, c, d) + MAJ(b, c, d)\\\` כאשר MAJ הוא רוב-3 — שווה ל-\\\`ab + ac + bc\\\`.',
        ],
        answerSchematic: `
<svg viewBox="0 0 760 360" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="M3-of-4 implementation: 4 AND-3 + 1 OR-4">
  <defs>
    <linearGradient id="m3g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="m3arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
  </defs>

  <rect x="0" y="0" width="760" height="40" fill="#0c1a28"/>
  <text direction="ltr" x="380" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Y = abc + abd + acd + bcd   (4 × AND-3 + 1 × OR-4)
  </text>

  <!-- Inputs -->
  ${['a', 'b', 'c', 'd'].map((name, i) => {
    const y = 80 + i * 60;
    return `
      <text direction="ltr" x="40" y="${y + 4}" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">${name}</text>
      <circle cx="80" cy="${y}" r="3" fill="#f0d080"/>
      <line x1="80" y1="${y}" x2="200" y2="${y}" stroke="#f0d080" stroke-width="1.4"/>
    `;
  }).join('')}

  <!-- 4 AND-3 gates -->
  ${[
    { y: 80, label: 'abc', ins: [80, 140, 200] },
    { y: 160, label: 'abd', ins: [80, 140, 260] },
    { y: 240, label: 'acd', ins: [80, 200, 260] },
    { y: 320, label: 'bcd', ins: [140, 200, 260] },
  ].map(({ y, label, ins }, i) => `
    <path d="M 280 ${y - 22} L 320 ${y - 22} Q 360 ${y - 22} 360 ${y} Q 360 ${y + 22} 320 ${y + 22} L 280 ${y + 22} Z"
          fill="url(#m3g)" stroke="#80d4ff" stroke-width="1.6"/>
    <text direction="ltr" x="320" y="${y + 4}" text-anchor="middle" fill="#80d4ff" font-size="11" font-weight="bold">AND</text>
    <text direction="ltr" x="280" y="${y - 30}" text-anchor="start" fill="#a0c0e0" font-size="10">${label}</text>
    <!-- 3 input lines from the input rails -->
    ${ins.map((x, k) => `
      <line x1="${x}" y1="${ins.length === 3 ? (y - 16 + k * 16) : y}" x2="280" y2="${y - 16 + k * 16}" stroke="#80d4ff" stroke-width="1.2" opacity="0.6"/>
      <line x1="${x}" y1="${y - 16 + k * 16}" x2="${x}" y2="${(['a','b','c','d'].indexOf(label[k])) * 60 + 80}" stroke="#80d4ff" stroke-width="1.2" opacity="0.4" stroke-dasharray="2 2"/>
    `).join('')}
    <!-- Output to OR -->
    <line x1="360" y1="${y}" x2="500" y2="${y}" stroke="#80d4ff" stroke-width="1.4"/>
  `).join('')}

  <!-- OR-4 gate -->
  <path d="M 500 60 Q 555 200 500 340 Q 530 340 580 280 Q 620 200 580 120 Q 530 60 500 60 Z"
        fill="url(#m3g)" stroke="#80f0a0" stroke-width="1.8"/>
  <text direction="ltr" x="555" y="204" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">OR-4</text>

  <!-- Final output -->
  <line x1="620" y1="200" x2="700" y2="200" stroke="#80f0a0" stroke-width="2" marker-end="url(#m3arr)"/>
  <text direction="ltr" x="730" y="206" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="18">Y</text>
</svg>`,
        answer:
`**מימוש ישיר: 4 × AND-3 + 1 × OR-4 = 5 שערים.**

\`\`\`
g1 = AND(a, b, c)
g2 = AND(a, b, d)
g3 = AND(a, c, d)
g4 = AND(b, c, d)
Y  = OR(g1, g2, g3, g4)
\`\`\`

**אם רק AND-2 ו-OR-2 זמינים:** AND-3 הופך ל-2 × AND-2, ו-OR-4 הופך ל-3 × OR-2. סה"כ:
- 4 × 2 = **8 AND-2**
- **3 OR-2** (עץ)
- = **11 שערים**.

**אופטימיזציה — שיתוף תוצאות:**
\`\`\`
x = a·b              ← 1 AND
y = c·d              ← 1 AND
m1 = x·c             ← 1 AND  (=abc)
m2 = x·d             ← 1 AND  (=abd)
m3 = a·y             ← 1 AND  (=acd)
m4 = b·y             ← 1 AND  (=bcd)
Y = OR(m1, m2, m3, m4)   ← 3 OR-2
\`\`\`
**= 6 AND-2 + 3 OR-2 = 9 שערים.**

**עוד אופטימיזציה — פקטוריזציה:**
\`\`\`
Y = ab(c+d) + cd(a+b)
\`\`\`
- \`p = a+b\` (OR), \`q = c+d\` (OR)
- \`r = a·b\` (AND), \`s = c·d\` (AND)
- \`u = r·q\` (AND, = ab(c+d))
- \`v = s·p\` (AND, = cd(a+b))
- \`Y = u + v\` (OR)
- **= 4 AND + 3 OR = 7 שערים.** המינימום ידוע ל-Boolean function זו.`,
        expectedAnswers: [
          '4 and', '4 and-3', '5 gates', '5 שערים',
          'and', 'or', 'and-3', 'or-4',
          '7 gates', '9 gates',
          'ab(c+d)', 'cd(a+b)',
          'factorize', 'פקטוריזציה',
        ],
        // Canvas: SOP decomposition Y = abc + abd + acd + bcd.
        // The simulator's AND/OR are 2-input, so each AND-3 minterm is a
        // chain of 2 AND-2 gates, and the OR-4 is a 3-stage OR-2 tree.
        // Total: 8 AND-2 + 3 OR-2 = 11 gates (matches the "AND-2 only"
        // decomposition listed in the answer body).
        // Default inputs: a=b=c=1, d=0 → minterm abc=1 → Y=1 (≥3 ones).
        circuit: () => build(() => {
          const a = h.input(80,  100, 'a'); a.fixedValue = 1;
          const b = h.input(80,  220, 'b'); b.fixedValue = 1;
          const c = h.input(80,  360, 'c'); c.fixedValue = 1;
          const d = h.input(80,  500, 'd'); d.fixedValue = 0;

          // 4 minterm chains, each = 2 cascaded AND-2 gates (= AND-3).
          // abc: AND(a,b) → AND(_,c)
          const and_ab1  = h.gate('AND', 340, 140);
          const and_abc  = h.gate('AND', 560, 160);
          // abd: AND(a,b) → AND(_,d)
          const and_ab2  = h.gate('AND', 340, 260);
          const and_abd  = h.gate('AND', 560, 280);
          // acd: AND(a,c) → AND(_,d)
          const and_ac   = h.gate('AND', 340, 380);
          const and_acd  = h.gate('AND', 560, 400);
          // bcd: AND(b,c) → AND(_,d)
          const and_bc   = h.gate('AND', 340, 500);
          const and_bcd  = h.gate('AND', 560, 520);

          // OR-4 → 3-stage OR-2 tree.
          const or_top   = h.gate('OR',  760, 220);  // abc ∨ abd
          const or_bot   = h.gate('OR',  760, 460);  // acd ∨ bcd
          const or_final = h.gate('OR',  960, 340);  // top ∨ bot

          const Y = h.output(1180, 340, 'Y');

          return {
            nodes: [
              a, b, c, d,
              and_ab1, and_abc, and_ab2, and_abd,
              and_ac,  and_acd, and_bc,  and_bcd,
              or_top, or_bot, or_final, Y,
            ],
            wires: [
              // abc = a · b · c
              h.wire(a.id,       and_ab1.id, 0),
              h.wire(b.id,       and_ab1.id, 1),
              h.wire(and_ab1.id, and_abc.id, 0),
              h.wire(c.id,       and_abc.id, 1),
              // abd = a · b · d
              h.wire(a.id,       and_ab2.id, 0),
              h.wire(b.id,       and_ab2.id, 1),
              h.wire(and_ab2.id, and_abd.id, 0),
              h.wire(d.id,       and_abd.id, 1),
              // acd = a · c · d
              h.wire(a.id,       and_ac.id, 0),
              h.wire(c.id,       and_ac.id, 1),
              h.wire(and_ac.id,  and_acd.id, 0),
              h.wire(d.id,       and_acd.id, 1),
              // bcd = b · c · d
              h.wire(b.id,       and_bc.id, 0),
              h.wire(c.id,       and_bc.id, 1),
              h.wire(and_bc.id,  and_bcd.id, 0),
              h.wire(d.id,       and_bcd.id, 1),
              // OR tree
              h.wire(and_abc.id, or_top.id, 0),
              h.wire(and_abd.id, or_top.id, 1),
              h.wire(and_acd.id, or_bot.id, 0),
              h.wire(and_bcd.id, or_bot.id, 1),
              h.wire(or_top.id,  or_final.id, 0),
              h.wire(or_bot.id,  or_final.id, 1),
              h.wire(or_final.id, Y.id, 0),
            ],
          };
        }),
      },
      {
        label: 'ג',
        question: 'ממש באמצעות רכיב M₃-of-4 (וקבועים) רכיב שמחזיר \\\`1\\\` אם **לפחות 2** מהכניסות הן \\\`1\\\`.',
        hints: [
          'הטריק: M₃ הוא **monotone** — לא יכול לעשות NOT ישירות. אבל יש דרך חכמה.',
          'הבחנה: \\\`M₃(a, b, c, 1) = "≥3 ones in {a,b,c,1}"\\\` = "≥2 ones in {a,b,c}" — בדיוק M₂-of-3 (לפחות 2 מתוך 3)!',
          'ל-M₂-of-4(a,b,c,d) — צריך "לפחות 2 מתוך 4". זה שווה ל-OR של 4 M₂-of-3 (לכל 3 מתוך 4 הכניסות).',
          'נוסחה: \\\`M₂(a,b,c,d) = M₃(a,b,c,1) ∨ M₃(a,b,d,1) ∨ M₃(a,c,d,1) ∨ M₃(b,c,d,1)\\\`.',
          'סה"כ: **4 × M₃ + 1 × OR-4** (או 3 × OR-2).',
        ],
        answer:
`**4 קריאות M₃ + OR-4.**

\`\`\`
M₂(a,b,c,d) = M₃(a, b, c, 1)  ∨
              M₃(a, b, d, 1)  ∨
              M₃(a, c, d, 1)  ∨
              M₃(b, c, d, 1)
\`\`\`

**איך זה עובד:**

\`M₃(x, y, z, 1)\` בודק "האם לפחות 3 מתוך {x, y, z, 1} הן 1." אבל הקבוע 1 תמיד תורם — אז התנאי מצטמצם ל-"לפחות 2 מתוך {x, y, z} הן 1" = M₂-of-3.

לכל 3 כניסות מתוך 4 (\`C(4,3) = 4\` שילובים), בודקים אם הן M₂-of-3. אם **לפחות אחד** מ-4 הצירופים בנמצא ≥2 ones, אזי בכל המערך יש ≥2 ones. OR של ה-4.

**אימות בקצוות:**
- כל 4 הכניסות הן 1: כל M₃ מתוך {a,b,c,1} = M₃(1,1,1,1) = 1. OR = 1. ✓
- בדיוק 2 ones (a=b=1, c=d=0): M₃(a,b,c,1)=M₃(1,1,0,1)=1, M₃(a,b,d,1)=1, השאר = 0. OR = 1. ✓
- בדיוק 1 one (a=1, b=c=d=0): כל M₃(_,_,_,1) דורש 3 ones, יש לכל היותר 2 (a + 1). 2 < 3 → M₃ = 0. כל ה-4 = 0. OR = 0. ✓
- כל הכניסות 0: M₃ נוסף 1 → רק 1 one, < 3 → M₃ = 0. OR = 0. ✓

**הסבר עומק — Monotone Identity:**
\`\`\`
M₂(x, y, z) ⇔ M₃(x, y, z, 1)
\`\`\`
"הוספת קבוע 1 לכניסה" מוריד את הסף הנדרש ב-1.

**הכללה — Mₖ ↔ Mₖ₊₁ עם קבוע 1:** ניתן "להעלות" את ה-threshold של רכיב majority ע"י הוספת קלט 1, או "להוריד" ע"י הוספת קלט 0 (במגבלת monotone).

**שאלת המשך:** "ולעשות הפוך — M₃ מ-M₂?" (תרגיל s19) — זה דורש 4 קריאות M₂ + AND-4: \`M₃(a,b,c,d) = M₂(a,b,c,0) ∧ M₂(a,b,d,0) ∧ M₂(a,c,d,0) ∧ M₂(b,c,d,0)\`. הקבוע 0 מעלה את הסף ב-1 (הופך M₂-of-4 ל-M₂-of-3 = "≥2 of 3 = exactly all 3 or 2 of 3" → AND פוסל מקרים).`,
        expectedAnswers: [
          '4', 'four',
          'm3', 'm₃',
          'constant', 'קבוע', '1',
          'or-4', 'or 4',
          'm3(a,b,c,1)',
          'monotone',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 23 (M₃-of-4 majority)',
    tags: ['majority', 'monotone', 'boolean', 'composition', 'logic'],
  },

  // ───────────────────────────────────────────────────────────────
  // #1014 — Build a 100ns delay from buffers + inverters (slide 28)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'delay-100ns-from-gates',
    difficulty: 'medium',
    title: 'השהיית סיגנל ב-100ns — מ-buffer + inverter',
    intro:
`נתון סיגנל \`signal\` שצריך להעביר בהשהיה של **100ns** — ההשהיה זהה ב-rising-edge וב-falling-edge,
והסיגנל המתקבל **לא הפוך** (זהה לקלט בצורה).

הרכיבים הזמינים:
- **Buffer** (משולש בלי בועה): rising delay = \`12ns\`, falling delay = \`8ns\`.
- **Inverter** (משולש עם בועה): rising delay = \`5ns\`, falling delay = \`5ns\`.

כמה רכיבים נדרשים, ובאיזה צירוף?`,
    schematic: `
<svg viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="Goal: 100ns symmetric delay built from buffer and inverter">

  <!-- ── Row 1: goal — signal in → black-box → signal out ─────────────── -->
  <text direction="ltr" x="100" y="50" text-anchor="start" fill="#80a0c0" font-size="11"
        letter-spacing="2" font-weight="bold">GOAL</text>

  <!-- input port -->
  <circle cx="105" cy="100" r="6" fill="#80f0a0" stroke="#80f0a0" stroke-width="1.5"/>
  <text direction="ltr" x="105" y="82" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">in</text>

  <!-- wire in → box -->
  <line x1="111" y1="100" x2="240" y2="100" stroke="#506080" stroke-width="2"/>

  <!-- the box you have to build (dashed orange = unknown / TODO) -->
  <rect x="240" y="65" width="220" height="70" rx="10"
        fill="#1a0e08" stroke="#ff8060" stroke-width="2.4" stroke-dasharray="6 4"/>
  <text direction="ltr" x="350" y="95" text-anchor="middle" fill="#ff8060"
        font-weight="bold" font-size="16">100 ns delay</text>
  <text direction="ltr" x="350" y="120" text-anchor="middle" fill="#ffb088"
        font-size="11" font-style="italic">symmetric · non-inverting</text>

  <!-- wire box → out -->
  <line x1="460" y1="100" x2="595" y2="100" stroke="#506080" stroke-width="2"/>
  <!-- arrow head -->
  <polygon points="595,95 605,100 595,105" fill="#506080"/>

  <!-- output port -->
  <circle cx="615" cy="100" r="6" fill="#80f0a0" stroke="#80f0a0" stroke-width="1.5"/>
  <text direction="ltr" x="615" y="82" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">out</text>

  <!-- divider between "goal" row and "parts" row -->
  <line x1="60" y1="185" x2="660" y2="185" stroke="#2a4060" stroke-width="1" stroke-dasharray="3 5"/>

  <!-- ── Row 2: available primitives (buffer + inverter) ──────────────── -->
  <text direction="ltr" x="100" y="215" text-anchor="start" fill="#80a0c0" font-size="11"
        letter-spacing="2" font-weight="bold">AVAILABLE PARTS</text>

  <!-- Buffer card -->
  <rect x="100" y="235" width="240" height="105" rx="8" fill="#0a1520" stroke="#2a4060" stroke-width="1"/>
  <text direction="ltr" x="220" y="258" text-anchor="middle" fill="#a0c0e0"
        font-size="12" font-weight="bold">Buffer</text>
  <!-- triangle -->
  <polygon points="135,275 135,325 185,300" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="158" y="304" text-anchor="middle" fill="#80d4ff" font-size="11" font-weight="bold">BUF</text>
  <!-- pin stubs -->
  <line x1="120" y1="300" x2="135" y2="300" stroke="#80d4ff" stroke-width="1.6"/>
  <line x1="185" y1="300" x2="200" y2="300" stroke="#80d4ff" stroke-width="1.6"/>
  <!-- timing block -->
  <text direction="ltr" x="280" y="285" text-anchor="middle" fill="#f0d080" font-size="12">rise: 12 ns</text>
  <text direction="ltr" x="280" y="305" text-anchor="middle" fill="#f0d080" font-size="12">fall: &nbsp; 8 ns</text>
  <text direction="ltr" x="280" y="325" text-anchor="middle" fill="#ff8080" font-size="10" font-style="italic">⚠ asymmetric</text>

  <!-- Inverter card -->
  <rect x="380" y="235" width="240" height="105" rx="8" fill="#0a1520" stroke="#2a4060" stroke-width="1"/>
  <text direction="ltr" x="500" y="258" text-anchor="middle" fill="#a0c0e0"
        font-size="12" font-weight="bold">Inverter</text>
  <!-- triangle + bubble -->
  <polygon points="415,275 415,325 465,300" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="473" cy="300" r="6" fill="#0a1825" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="440" y="304" text-anchor="middle" fill="#80d4ff" font-size="11" font-weight="bold">NOT</text>
  <!-- pin stubs -->
  <line x1="400" y1="300" x2="415" y2="300" stroke="#80d4ff" stroke-width="1.6"/>
  <line x1="479" y1="300" x2="495" y2="300" stroke="#80d4ff" stroke-width="1.6"/>
  <!-- timing block -->
  <text direction="ltr" x="560" y="285" text-anchor="middle" fill="#80f0a0" font-size="12">rise: 5 ns</text>
  <text direction="ltr" x="560" y="305" text-anchor="middle" fill="#80f0a0" font-size="12">fall: &nbsp;5 ns</text>
  <text direction="ltr" x="560" y="325" text-anchor="middle" fill="#80f0a0" font-size="10" font-style="italic">✓ symmetric</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'כמה רכיבים נדרשים? באיזה צירוף?',
        hints: [
          'בעיה ראשונה: Buffer **לא סימטרי** — rising delay (12ns) שונה מ-falling delay (8ns). אם נשים רק buffers, רוחב הפולס יתעוות (ייפסל).',
          'Inverter **סימטרי**: rise = fall = 5ns. **כל זוג Inverters בסדרה** = 10ns בכל קצה, ויחד לא הופך את הסיגנל.',
          'לכן: **20 Inverters בסדרה** = 20 × 5 = 100ns, ופלט לא הפוך (10 זוגות = הפיכה זוגית = שמירה על הסימן).',
          'אופציה אלטרנטיבית: לעטוף Buffer ב-2 Inverters יוצר "delay block" סימטרי. אבל מספר הרכיבים בדרך זו גדול יותר.',
        ],
        answer:
`**הפתרון: 20 Inverters בסדרה.**

\`\`\`
in → INV → INV → INV → ... (× 20) → out
\`\`\`

**חישוב:**
- כל Inverter: rise = 5ns, fall = 5ns (סימטרי).
- 20 Inverters בסדרה: סך delay = 20 × 5 = **100ns** עבור **כל** קצה.
- 20 הפיכות → אחרי 20 = 0 הפיכות (זוגי) → פלט **לא הפוך**.

### למה לא Buffer?

Buffer: rise = 12ns, fall = 8ns. **לא סימטרי**. בעיה כפולה:

1. **רוחב הפולס יתעוות:** אם הקלט הוא פולס של \`100ns\`, אחרי buffer יחיד הפולס נעשה רחב יותר (12ns למעלה, 8ns למטה → +4ns רוחב). אחרי N buffers, רוחב הפולס גדל ב-\`N · 4ns\`. עם 9 buffers נצליח 100ns delay, אבל הפולס יהיה רחב ב-\`9 × 4 = 36ns\` — לא מקובל.

2. **קיצוץ פולסים קצרים:** אם הפולס הוא קצר מ-\`fall - rise = -4ns\`, הוא ייעלם לגמרי (ה-falling edge מקדים את ה-rising edge).

### למה לא צירוף?

אפשר תיאורטית לשלב Buffer + Inverter כדי לקזז את האסימטריה (Buffer מאריך את הפולס, Inverter סימטרי). אבל זה דורש חישוב מדויק ולא מבטיח 100ns מדויק על שני הקצוות.

הפתרון הנקי = **רק Inverters**.

### חישוב מינימום

- 100ns / 5ns לכל Inverter = **20 Inverters** מינימום.
- אם נרצה פחות — חייבים להשתמש ב-Buffer, ואז נצטרך לקזז עיוות בעזרת Inverters נוספים → אין כדאיות.

### מקרה אחר (לידיעה): מה אם הקלט הוא **תדר** של 1MHz (period = 1μs)?

100ns delay = 10% מתקופה. בקצוות, השהיה זו ברורה. אבל ה-20 Inverters מוסיפים capacitance load → להבטיח שה-driver יכול לעמוד בעומס.

### שאלה למחשב: מה אם הקלט הוא **0.5MHz** עם duty cycle 90%?

הפולס הוא \`1.8μs\` רחב. 100ns delay = 5.5% — קטן. אין בעיה. ה-20 Inverters יעבירו אותו בסדר.`,
        interviewerMindset:
`שאלת timing קלאסית. המראיין מחפש:

1. **שאתה מבחין באסימטריה של Buffer** — מועמד שעונה "9 Buffers, 100ns" ⨯ — שכח את \`fall - rise\` ולא חשב על עיוות.
2. **שאתה רואה ש-Inverters בזוגות הם סימטריים** — אינטואיציה של hardware מנוסה.
3. **שאתה מספר את ההפיכות** — חייבים זוגי כדי לקבל פלט לא הפוך.

**שאלת המשך:** "ומה אם רוצים 100ns delay אבל **רק Buffers** זמינים?" — תשובה: בלתי אפשרי לקבל **השהיה זהה** בשני הקצוות אם ה-buffer לא סימטרי. אפשר rough approximation עם N buffers כש-N · (12+8)/2 = 100 → N = 10, אבל הפולס יתעוות ב-N · 4 = 40ns.

**שאלת bonus:** "מה אם הקלט הוא קלוק 100MHz (period 10ns)?" — הפולס במחזור הוא 5ns. אחרי inverter ראשון: 5ns delay. אבל הקצה הבא של הקלט מגיע אחרי 10ns — אם delay = 5ns, ה-output rising edge ייצור rising-input-2 כשה-output כבר עלה, וה-output ייגזר באמצע (glitch). בקיצור: לקצב גבוה מאוד, ה-100ns delay יחסום את הסיגנל לגמרי. במציאות — שאלת **frequency-vs-delay trade-off**.`,
        expectedAnswers: [
          '20', 'twenty', 'עשרים',
          'inverter', 'inverters',
          'symmetric', 'סימטרי',
          'pair', 'זוג', 'זוגי',
          'rise', 'fall', '5ns',
          'not buffer', 'buffer asymmetric',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 28 (100ns delay)',
    tags: ['timing', 'propagation-delay', 'buffer', 'inverter', 'gate-delay', 'logic'],
    // Canvas: 20 inverters in series (snake-pattern layout to fit canvas).
    // Each NOT has symmetric 5ns rise/fall (assumed); 20 × 5ns = 100ns,
    // and 20 (even count) of inverters means the output is non-inverted.
    circuit: () => build(() => {
      const inp = h.input(80, 200, 'signal_in'); inp.fixedValue = 1;
      const invs = [];
      for (let i = 0; i < 20; i++) {
        // Snake: row 0 left→right (i=0..9), row 1 right→left (i=10..19)
        const row = Math.floor(i / 10);
        const colInRow = i % 10;
        const col = (row === 0) ? colInRow : (9 - colInRow);
        const x = 200 + col * 110;
        const y = 200 + row * 200;
        invs.push(h.gate('NOT', x, y));
      }
      const out = h.output(80, 400, 'signal_out (100ns delay)');
      const wires = [
        // input → INV[0]
        h.wire(inp.id, invs[0].id, 0),
      ];
      // Chain INV[i] → INV[i+1]
      for (let i = 0; i < 19; i++) {
        wires.push(h.wire(invs[i].id, invs[i+1].id, 0));
      }
      // INV[19] → out
      wires.push(h.wire(invs[19].id, out.id, 0));
      return {
        nodes: [inp, ...invs, out],
        wires,
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1015 — MSB-first leading-1 detector (FSM) — slide 22 part 2
  // ───────────────────────────────────────────────────────────────
  {
    id: 'msb-first-leading-one-detector',
    difficulty: 'medium',
    title: 'זיהוי MSB בזרם סדרתי — FSM של רכיב אחד',
    intro:
`כתוב אוטומט סופי דטרמיניסטי (מכונת מצבים) שמקבל **זרם סדרתי** של ביטים, מהספרה הגדולה ביותר
לספרה הקטנה ביותר (MSB-first). הפלט מחזיר **'1' רק עבור ה-'1' הראשון שמתקבל בזרם** (ה-MSB
שדולק), ו-'0' לכל הביטים שאחריו (גם אם הם '1').

לדוגמה, עבור זרם של 8 ביטים:

\`\`\`
in:    0 → 1 → 1 → 0 → 1 → 1 → 1 → 0
out:   0 → 1 → 0 → 0 → 0 → 0 → 0 → 0
            ↑
       רק כאן הופיע '1' — ה-MSB הדלוק
\`\`\`

זה זיהוי **leading-1** בזרם סדרתי: אחרי שראינו '1' פעם אחת, הפלט נשאר '0' לתמיד (עד reset).`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את ה-FSM. כמה מצבים נדרשים? כמה D-FFים? אילו שערים?',
        hints: [
          'הקלט סדרתי — ביט אחד לכל קצה שעון. אין צורך לזכור את **המיקום** של ה-MSB, רק **האם כבר ראינו 1**.',
          '**שני מצבים מספיקים**: \\\`S0\\\` ("עוד לא ראינו 1") ו-\\\`S1\\\` ("כבר ראינו 1"). מ-S1 לא חוזרים ל-S0 אלא ב-reset.',
          'מצב יחיד = ביט יחיד = **D-FF אחד**. נקרא לו \\\`seen\\\` (אתחול \\\`= 0\\\`).',
          'הפלט הוא Mealy: \\\`Y = X ∧ ¬seen\\\` (דולק רק אם הקלט הוא 1 *ועוד לא ראינו 1*).',
          'מצב הבא: \\\`seen\\\\_d = seen ∨ X\\\` (ברגע שראינו 1, נישאר ב-1 לתמיד).',
          'סך הרכיבים: **1 D-FF + 1 AND + 1 OR + 1 NOT** = 4 רכיבים. סיבוכיות חומרה \\\`O(1)\\\` בלי קשר לאורך הזרם.',
        ],
        answerSchematic: `
<svg viewBox="0 0 760 420" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="MSB-first leading-1 detector: 1 D-FF + AND + OR + NOT">
  <defs>
    <marker id="ld1Arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
    <marker id="ld1ArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
  </defs>

  <rect x="0" y="0" width="760" height="40" fill="#0c1a28"/>
  <text direction="ltr" x="380" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Leading-1 detector — 1 D-FF + AND + OR + NOT
  </text>

  <!-- ── Input X ─────────────────────────────────────────────────────── -->
  <text direction="ltr" x="50" y="174" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="13">X</text>
  <line x1="70" y1="170" x2="180" y2="170" stroke="#f0d080" stroke-width="2"/>
  <circle cx="180" cy="170" r="3" fill="#f0d080"/>

  <!-- Tap from X down to OR (next-state) -->
  <line x1="180" y1="170" x2="180" y2="290" stroke="#f0d080" stroke-width="2"/>
  <line x1="180" y1="290" x2="330" y2="290" stroke="#f0d080" stroke-width="2"/>

  <!-- ── NOT gate on seen ───────────────────────────────────────────── -->
  <polygon points="240,100 240,140 280,120" fill="#0a1825" stroke="#ff8060" stroke-width="1.8"/>
  <circle cx="286" cy="120" r="5" fill="#0a1825" stroke="#ff8060" stroke-width="1.8"/>
  <text direction="ltr" x="260" y="124" text-anchor="middle" fill="#ff8060" font-size="10" font-weight="bold">NOT</text>

  <!-- wire NOT → AND input -->
  <line x1="291" y1="120" x2="330" y2="120" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="330" y1="120" x2="330" y2="160" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="330" y1="160" x2="370" y2="160" stroke="#ff8060" stroke-width="1.8"/>

  <!-- ── AND gate (output Y = X · ¬seen) ────────────────────────────── -->
  <path d="M 180 170 L 180 170 L 180 170" />  <!-- bridging X -->
  <line x1="180" y1="170" x2="370" y2="170" stroke="#f0d080" stroke-width="2"/>
  <line x1="370" y1="170" x2="370" y2="180" stroke="#f0d080" stroke-width="2"/>
  <line x1="370" y1="180" x2="370" y2="180"/>
  <path d="M 370 145 L 370 195 L 405 195 A 25 25 0 0 0 405 145 Z" fill="#102818" stroke="#80f0a0" stroke-width="2"/>
  <text direction="ltr" x="390" y="174" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">AND</text>

  <!-- wire AND → Y -->
  <line x1="430" y1="170" x2="540" y2="170" stroke="#80f0a0" stroke-width="2.4" marker-end="url(#ld1ArrG)"/>
  <text direction="ltr" x="570" y="174" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">Y</text>
  <text direction="ltr" x="570" y="190" text-anchor="middle" fill="#a0a0c0" font-size="9" font-style="italic">(leading-1 pulse)</text>

  <!-- ── OR gate (next-state = seen ∨ X) ────────────────────────────── -->
  <path d="M 330 270 Q 350 290 330 310 L 365 310 Q 395 290 365 270 Z" fill="#1a1430" stroke="#c080ff" stroke-width="2"/>
  <text direction="ltr" x="350" y="294" text-anchor="middle" fill="#c080ff" font-size="11" font-weight="bold">OR</text>

  <!-- wire OR → D-FF -->
  <line x1="380" y1="290" x2="450" y2="290" stroke="#c080ff" stroke-width="2" marker-end="url(#ld1Arr)"/>

  <!-- ── D-FF (seen) ─────────────────────────────────────────────────── -->
  <rect x="450" y="250" width="100" height="80" rx="6" fill="#0a1825" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="500" y="265" text-anchor="middle" fill="#80d4ff" font-size="11" font-weight="bold">D-FF</text>
  <text direction="ltr" x="500" y="282" text-anchor="middle" fill="#a0c0e0" font-size="10">seen</text>
  <text direction="ltr" x="468" y="298" fill="#80d4ff" font-size="11" font-weight="bold">D</text>
  <text direction="ltr" x="533" y="298" fill="#80d4ff" font-size="11" font-weight="bold">Q</text>
  <text direction="ltr" x="500" y="324" text-anchor="middle" fill="#a060ff" font-size="9">▷ clk</text>

  <!-- Feedback Q → OR (top input) + Q → NOT -->
  <line x1="550" y1="290" x2="600" y2="290" stroke="#80d4ff" stroke-width="2"/>
  <line x1="600" y1="290" x2="600" y2="370" stroke="#80d4ff" stroke-width="2"/>
  <line x1="600" y1="370" x2="200" y2="370" stroke="#80d4ff" stroke-width="2"/>
  <line x1="200" y1="370" x2="200" y2="270" stroke="#80d4ff" stroke-width="2"/>
  <line x1="200" y1="270" x2="330" y2="270" stroke="#80d4ff" stroke-width="2"/>
  <circle cx="200" cy="270" r="3" fill="#80d4ff"/>
  <!-- Branch from feedback to NOT -->
  <line x1="200" y1="270" x2="200" y2="120" stroke="#80d4ff" stroke-width="2"/>
  <line x1="200" y1="120" x2="240" y2="120" stroke="#80d4ff" stroke-width="2"/>

  <!-- Labels -->
  <text direction="ltr" x="148" y="262" text-anchor="middle" fill="#80d4ff" font-size="10" font-style="italic">seen</text>
  <text direction="ltr" x="226" y="108" text-anchor="middle" fill="#80d4ff" font-size="10" font-style="italic">seen</text>

  <!-- Boolean summary -->
  <text direction="ltr" x="380" y="405" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    Y = X · ¬seen  &nbsp;|&nbsp;  seen_d = seen + X  &nbsp;|&nbsp;  init: seen = 0
  </text>
</svg>`,
        answer:
`**Mealy FSM של מצב יחיד — \`1 D-FF + AND + OR + NOT\`.**

### למה הקטנה הזו מספיקה?

הקלט סדרתי MSB-first. אין צורך לזכור **איפה** היה ה-'1' (כי הקלט בכל מקרה ימשיך לרוץ ביט אחר ביט),
רק **האם** כבר ראינו אחד. זה אומר: שני מצבים, ביט יחיד של מצב, **D-FF אחד**.

### המשוואות

\`\`\`
state:    seen   ← D-FF, init = 0

output:   Y      = X · ¬seen          ← Mealy: ביט פלט יבש לפי קלט ומצב
next:     seen_d = seen + X            ← נדבק ל-1 ברגע שראינו 1
\`\`\`

| מצב נוכחי \`seen\` | קלט \`X\` | פלט \`Y\` | מצב הבא \`seen_d\` |
|:--:|:--:|:--:|:--:|
| 0 | 0 | 0 | 0 |
| 0 | **1** | **1** ← | **1** |
| 1 | 0 | 0 | 1 |
| 1 | 1 | 0 | 1 |

### Trace על דוגמת התרגיל

קלט: \`0, 1, 1, 0, 1, 1, 1, 0\` (MSB-first).

| cycle | X | seen (לפני) | Y | seen_d |
|------:|:-:|:-----------:|:-:|:------:|
| 1 | 0 | 0 | 0 | 0 |
| 2 | 1 | 0 | **1** | 1 |
| 3 | 1 | 1 | 0 | 1 |
| 4 | 0 | 1 | 0 | 1 |
| 5 | 1 | 1 | 0 | 1 |
| 6 | 1 | 1 | 0 | 1 |
| 7 | 1 | 1 | 0 | 1 |
| 8 | 0 | 1 | 0 | 1 |

זרם פלט: \`0, 1, 0, 0, 0, 0, 0, 0\` — בדיוק לפי הדוגמה.

### ספירת רכיבים

| רכיב | תפקיד |
|:-----|:------|
| 1 × D-FF | אחסון \`seen\` |
| 1 × AND | \`Y = X · ¬seen\` |
| 1 × OR  | \`seen_d = seen + X\` |
| 1 × NOT | \`¬seen\` עבור ה-AND |

**סך הכל: 4 רכיבים.** סיבוכיות חומרה \`O(1)\` — אין תלות באורך הזרם. השווה מול הגישה הקומבינטורית
המקבילית (priority encoder על N ביטים מקבילים): \`O(N)\` שערים, אך זמן התגובה הוא ציקל יחיד.
זו בדיוק ההחלפה של **שטח** מול **חביון**.

### איפוס (Reset)

ה-FF צריך אות \`rst\` שמחזיר את \`seen\` ל-0 בתחילת כל מילה חדשה. אחרת המעגל יישאר תקוע ב-\`seen = 1\`
אחרי המספר הראשון. סטנדרטית — \`async reset\` של ה-D-FF.

### למה לא Moore?

ב-Moore היינו צריכים מצב נוסף — "ראינו 1 הפעם" (מצב חולף). זה מוסיף עוד D-FF ולא משפר כלום
כי הפלט הזמני יוצא 1 רק לציקל אחד ממילא. **Mealy בוחר את הפלט מהקלט החיוני** ולכן יותר חסכוני.

### הכללה: 16 / 32 ביט?

הצורה זהה — **לא משתנה כלום**. גם זרם של 64 ביט יזוהה עם אותם 4 רכיבים. זה היתרון העצום של
הגרסה הסדרתית מול הקומבינטורית.

### גרסת floor(log₂) — תוספת אופציונלית

אם רוצים *מיקום* ה-MSB (במקום one-hot על קצה), צריך גם **מונה מיקום** שיורד מ-\`N-1\` ל-\`0\`
בכל קצה שעון, ו**רגיסטר תוצאה** שילכוד את ערך המונה כש-\`Y\` עולה. עבור 8 ביט: 3 D-FF של המונה,
3 D-FF של רגיסטר התוצאה, ועוד 4 הרכיבים של ה-FSM. סה"כ ~10 רכיבים. עדיין \`O(log N)\`, ועדיין
זול בהרבה מהקומבינטורי (priority encoder ב-O(N) שערים על W ביטים מקבילים).

### השוואה לשאלה האחות #1016

| | **#1015 (זה) — סדרתי** | **#1016 — מקבילי** |
|---|---|---|
| חומרה | 4 רכיבים (1 D-FF + AND + OR + NOT) | ~25 שערים |
| חביון | N קלוקים | קלוק יחיד |
| Scaling | \`O(1)\` חומרה | \`O(N)\` שערים |
| מתי לבחור? | זרם סדרתי (UART/SPI) | וקטור פנימי (CPU/ALU) |

זוג השאלות הזה הוא ה-trade-off הקלאסי של **שטח מול זמן** — מועמד שמכיר את שתי הגישות וזורם
בקלות ביניהן ("ומה אם הקלט יגיע סדרתי?" → מיד עובר ל-FSM) נחשב לעמוק יותר מאחד שמכיר רק אחת.`,
        interviewerMindset:
`שאלת FSM קלאסית של "מצב מינימלי". המראיין מחפש:

1. **שאתה רואה שאין צורך לזכור את המיקום, רק את העובדה.** מועמד שמתחיל בלהציע מונה מיקום \`O(log N)\` D-FFים מפספס את ההצמצום הקריטי: לא הפלט הוא המיקום — הפלט הוא ביט בודד שעולה פעם אחת.
2. **שאתה זוכר ש-Mealy יכול להוציא פלט מהקלט החיוני** (לא רק מהמצב). מועמד שטוען "צריך עוד מצב לסמן 'הפעם זה ה-MSB'" מתחזק כי לא מנצל את הקלט.
3. **שאתה מציין reset.** אחרת המעגל לא משחזר בין מילים.
4. **שאתה מתעלם משאלת floor(log₂)** — היא דורשת counter ולכן יותר חומרה. כאן הם רוצים לראות אותך **מצמצם**, לא להוסיף.

**שאלת המשך נפוצה:** "ומה אם מבטיחים שזה זרם **אינסופי**?" — תשובה: בלי reset, ה-FSM יזהה רק את ה-'1' הראשון ב-power-on. דורש או reset תקופתי, או מעבר ל-edge detector (\`Y = X · ¬prev_X\`) שמזהה כל **rising edge** ולא רק את הראשון.

**שאלת bonus:** "ולמה לא להשתמש ב-RS-latch במקום D-FF?" — תיאורטית עובד (S=X, R=reset), אבל RS-latch לא נכלל בלקסיקון של "שערים בסיסיים + D-FF" של רוב הראיונות. שמור על D-FF.`,
        expectedAnswers: [
          'fsm', 'מכונת מצבים', 'אוטומט',
          'd-ff', 'd flip flop', 'flipflop', 'פליפ-פלופ', 'פליפ פלופ',
          'mealy',
          'seen', 'leading 1', 'first 1', 'ה-1 הראשון',
          'and', 'or', 'not',
          '1 ff', 'one ff', 'one flip flop', '4 components', '4 רכיבים',
          'reset', 'איפוס',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 22 חלק ב (Leading-1 MSB detector)',
    tags: ['fsm', 'mealy', 'd-ff', 'leading-one', 'msb', 'serial', 'streaming', 'logic'],
    // Canvas: leading-1 detector — 1 D-FF (seen) + AND + OR + NOT.
    // Stream replicates the slide-22 example: 0,1,1,0,1,1,1,0 MSB-first.
    // Expected Y stream:                       0,1,0,0,0,0,0,0
    circuit: () => build(() => {
      const X    = h.input(120, 240, 'X');
      const clk  = h.clock(120, 540);
      X.fixedValue  = 0;
      // Slide-22 stream: 0,1,1,0,1,1,1,0 — leading-1 pulses on cycle 2.
      X.stepValues = [0, 1, 1, 0, 1, 1, 1, 0];

      // State element: `seen` holds 1 once we've observed a '1' in the stream.
      const ffSeen = h.ffD(560, 420, 'seen');

      // Next-state logic: seen_d = seen ∨ X
      const orNS   = h.gate('OR',  360, 420);

      // Output logic (Mealy): Y = X ∧ ¬seen
      const notS   = h.gate('NOT', 360, 220);
      const andY   = h.gate('AND', 760, 240);

      const Y      = h.output(1000, 240, 'Y');

      return {
        nodes: [X, clk, ffSeen, orNS, notS, andY, Y],
        wires: [
          // Next state: OR( seen.Q , X ) → seen.D
          h.wire(ffSeen.id, orNS.id, 0),     // seen.Q → OR.in0
          h.wire(X.id,      orNS.id, 1),     // X      → OR.in1
          h.wire(orNS.id,   ffSeen.id, 0),   // OR.out → seen.D
          h.wire(clk.id,    ffSeen.id, 1),   // clk    → seen.CLK
          // Output: AND( X , NOT(seen.Q) )
          h.wire(ffSeen.id, notS.id, 0),     // seen.Q → NOT
          h.wire(X.id,      andY.id, 0),     // X      → AND.in0
          h.wire(notS.id,   andY.id, 1),     // ¬seen  → AND.in1
          h.wire(andY.id,   Y.id, 0),        // AND.out → Y
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #1016 — floor(log2(X)) parallel — priority encoder 8-to-3 (slide 29)
  // Sister question to #1015 (serial FSM): same problem (locate MSB),
  // opposite paradigm (combinational vector).  Together they're the
  // canonical "time vs. area" tradeoff demo.
  // ───────────────────────────────────────────────────────────────
  {
    id: 'floor-log2-priority-encoder',
    difficulty: 'medium',
    title: 'floor(log₂(X)) — מקודד עדיפות מקבילי 8-bit',
    intro:
`ממש רכיב **קומבינטורי טהור** שמקבל מספר \`X\` בעל **8 סיביות במקביל** ומוציא את \`floor(log₂(X))\` —
מיקום ה-MSB הדלוק — כווקטור של 3 ביטים.

\`\`\`
00101011 (= 43)    →  101 (= 5)    [כי 2⁵ ≤ 43 < 2⁶]
00010000 (= 16)    →  100 (= 4)    [כי 2⁴ = 16]
11111111 (= 255)   →  111 (= 7)
00000001 (= 1)     →  000 (= 0)
00000000 (= 0)     →  ?            [log undefined — דגל valid או 000 בקונבנציה]
\`\`\`

זהו **priority encoder 8-to-3** קלאסי: מסתכלים על הביטים מ-MSB ל-LSB, והראשון שדלוק קובע את הפלט.

> **שאלה אחות — #1015** מציגה את אותה בעיה כזרם **סדרתי** (MSB-first) במקום וקטור מקבילי.
> שם הפתרון האלגנטי הוא FSM של 4 רכיבים בלבד. כאן, בגלל שהקלט במקביל, חייבים שערים על כל הביטים בו-זמנית.
> זוג השאלות הזה הוא ה-trade-off הקלאסי של **שטח (gates) מול זמן (clocks)**.`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. כמה ביטי פלט? איך מוצאים את ה-MSB ללא קלוק?',
        hints: [
          'ה-output הוא 3 ביטים (פוזיציה 0..7 → 3 ביטים).',
          'המבנה הקלאסי: **priority encoder 8-to-3.** מסתכל על הביטים מ-MSB ל-LSB; הראשון שדלוק (= MSB) קובע את הפלט.',
          'נוסחאות בוליאניות (ל-Y[2], Y[1], Y[0]):',
          '\\\`Y[2] = X[7] ∨ X[6] ∨ X[5] ∨ X[4]\\\` (MSB דלוק ⇔ position ≥ 4).',
          '\\\`Y[1] = X[7] ∨ X[6] ∨ (¬X[5] ∧ ¬X[4] ∧ (X[3] ∨ X[2]))\\\` (חצי עליון של 2 הגבוהים, או חצי עליון של 2 הנמוכים).',
          'כלל פשוט: \\\`Y[i] = OR( X[k] ∧ ¬(higher bits) )\\\` — קלאסיקה של priority encoder.',
        ],
        answerSchematic: `
<svg viewBox="0 0 760 460" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="8-bit priority encoder for floor(log2)">
  <defs>
    <linearGradient id="peBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="peArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
  </defs>

  <rect x="0" y="0" width="760" height="40" fill="#0c1a28"/>
  <text direction="ltr" x="380" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Priority encoder 8 → 3:  find position of MSB (highest set bit)
  </text>

  <!-- Inputs X[7..0] -->
  ${[7,6,5,4,3,2,1,0].map((bit, idx) => {
    const y = 80 + idx * 36;
    return `
      <text direction="ltr" x="60" y="${y + 4}" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="12">X[${bit}]</text>
      <line x1="100" y1="${y}" x2="240" y2="${y}" stroke="#f0d080" stroke-width="1.4"/>
      <circle cx="240" cy="${y}" r="3" fill="#f0d080"/>
    `;
  }).join('')}

  <!-- Priority encoder block -->
  <rect x="240" y="60" width="280" height="320" rx="10" fill="url(#peBody)" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="380" y="100" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">Priority Encoder</text>
  <text direction="ltr" x="380" y="124" text-anchor="middle" fill="#a0c0e0" font-size="11">8-to-3</text>

  <!-- Boolean formulas inside -->
  <text direction="ltr" x="380" y="170" text-anchor="middle" fill="#c0c0e0" font-size="11">Y[2] = OR(X[7..4])</text>
  <text direction="ltr" x="380" y="195" text-anchor="middle" fill="#c0c0e0" font-size="11">Y[1] = ...</text>
  <text direction="ltr" x="380" y="220" text-anchor="middle" fill="#c0c0e0" font-size="11">Y[0] = ...</text>
  <text direction="ltr" x="380" y="252" text-anchor="middle" fill="#a08060" font-size="10">(see answer for full SOP)</text>

  <!-- valid flag for X=0 case -->
  <text direction="ltr" x="380" y="300" text-anchor="middle" fill="#ff8060" font-size="11">valid = OR(X[7..0])</text>
  <text direction="ltr" x="380" y="318" text-anchor="middle" fill="#a08060" font-size="10">(= 0 only if X = 0)</text>

  <!-- 3-bit output -->
  <line x1="520" y1="160" x2="620" y2="160" stroke="#80f0a0" stroke-width="2" marker-end="url(#peArr)"/>
  <text direction="ltr" x="660" y="164" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Y[2]</text>

  <line x1="520" y1="200" x2="620" y2="200" stroke="#80f0a0" stroke-width="2" marker-end="url(#peArr)"/>
  <text direction="ltr" x="660" y="204" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Y[1]</text>

  <line x1="520" y1="240" x2="620" y2="240" stroke="#80f0a0" stroke-width="2" marker-end="url(#peArr)"/>
  <text direction="ltr" x="660" y="244" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Y[0]</text>

  <!-- valid output -->
  <line x1="520" y1="305" x2="620" y2="305" stroke="#ff8060" stroke-width="2" marker-end="url(#peArr)"/>
  <text direction="ltr" x="660" y="309" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="13">valid</text>

  <text direction="ltr" x="380" y="440" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    Output: 3-bit position of MSB.  valid=0 indicates undefined (X=0).
  </text>
</svg>`,
        answer:
`**Priority encoder 8-to-3.** 3 ביטי פלט (Y[2:0]) + 1 דגל \`valid\`.

### נוסחאות בוליאניות

הרעיון: \`Y[i] = 1\` אם המיקום של ה-MSB הדלוק שווה לאחד הערכים שמייצרים את \`Y[i]=1\`. ספציפית:

\`\`\`
Y[2] = X[7] ∨ X[6] ∨ X[5] ∨ X[4]
     = "MSB position ≥ 4"

Y[1] = X[7] ∨ X[6]
     ∨ (¬X[7] ∧ ¬X[6] ∧ ¬X[5] ∧ ¬X[4] ∧ (X[3] ∨ X[2]))
     = "MSB position ∈ {6, 7, 2, 3}"

Y[0] = X[7]
     ∨ (¬X[7] ∧ ¬X[6] ∧ X[5])
     ∨ (¬X[7] ∧ ¬X[6] ∧ ¬X[5] ∧ ¬X[4] ∧ X[3])
     ∨ (¬X[7..1] ∧ X[0])
     = "MSB position ∈ {7, 5, 3, 1}" (אי-זוגי)
\`\`\`

\`\`\`
valid = X[7] ∨ X[6] ∨ X[5] ∨ X[4] ∨ X[3] ∨ X[2] ∨ X[1] ∨ X[0]
\`\`\`

### דוגמת חישוב

עבור \`X = 0b00101011\` (= 43):
- X[7]=0, X[6]=0, X[5]=**1** ← MSB.
- Y[2] = X[7] ∨ X[6] ∨ X[5] ∨ X[4] = 0 ∨ 0 ∨ 1 ∨ 0 = 1.
- Y[1] = ... = 0.
- Y[0] = ¬X[7] ∧ ¬X[6] ∧ X[5] = 1 ∧ 1 ∧ 1 = 1.
- Y[2:0] = 101 = **5** ✓

### חישוב יעיל יותר — TREE structure

במקום SOP גדול, ניתן לחשב ב-2 שכבות:

**שכבה 1:** הפרד את 8 הביטים ל-2 קבוצות של 4. לכל קבוצה:
- \`hi_any = X[7] ∨ X[6] ∨ X[5] ∨ X[4]\` (= Y[2])
- \`lo_any = X[3] ∨ X[2] ∨ X[1] ∨ X[0]\`

**שכבה 2:** בחר את הקבוצה הגבוהה אם \`hi_any\`, אחרת הנמוכה:
- אם \`hi_any\`: ענן חיפוש על X[7..4] עם MUX.
- אחרת: על X[3..0].

זה תרגום ל-tree עם עומק \`O(log W)\` במקום SOP שטוח.

### מקרה X=0

לא מוגדר אריתמטית (\`log(0) = −∞\`). אפשרויות מימוש:
1. **\`valid\` flag:** מציין שהפלט תקין רק כש-\`valid = 1\`.
2. **החזרת 0:** ב-X=0, Y = 000 (קונבנציה).
3. **דגל error:** סיגנל נפרד.

### הכללה ל-16-bit

אותה תבנית, רק \`Y\` הוא 4-bit (כי MSB position ∈ 0..15). אורך הביטוי לכל \`Y[i]\` גדל אבל המבנה זהה. עומק לוגי = \`O(log 16) = 4\` שכבות.

### ספירת שערים (גישת tree)

לכל ביט פלט ~\`log_2(W)\` שכבות עץ. עבור 8-bit: 3 שכבות. סך ~25 שערים בסיסיים (אופטימיזציה).

### השוואה לשאלה האחות #1015

| | **#1015 — סדרתי (FSM)** | **#1016 — מקבילי (זה)** |
|---|---|---|
| חומרה | 4 רכיבים (1 D-FF + AND + OR + NOT) | ~25 שערים |
| חביון | N קלוקים (אחד לכל ביט) | קלוק יחיד |
| Scaling | \`O(1)\` חומרה — לא משתנה עם N | \`O(N)\` שערים — גדל עם רוחב הוקטור |
| מתי לבחור? | זרם סדרתי (UART, SPI) | וקטור פנימי (CPU, ALU) |

זוהי דוגמה קלאסית של trade-off **שטח-מול-זמן** שמראיין חומרה אוהב לבדוק.`,
        interviewerMindset:
`שאלת priority encoder קלאסית. המראיין מחפש:

1. **שאתה רואה שזה priority encoder** — לא "חישוב מתמטי" של log2 אלא חיפוש בעמדה.
2. **שיש דרך SOP ויש דרך tree** — מועמד שכותב רק SOP ארוך מפספס את האופטימיזציה.
3. **שאתה מטפל ב-X=0** — מקרה מיוחד שלא מוגדר. valid flag = bonus.
4. **שאתה מבחין בעומק:** \`O(log W)\` בעץ vs \`O(W)\` ב-SOP נאיבי. תזמון!

**שאלת המשך נפוצה:** "ולמעלה מ-32-bit?" — אותה תבנית. CPUs מודרניים יש להם פקודה ייעודית (\`bsr\` ב-x86, \`clz\` ב-ARM) שעושה את זה בקלוק יחיד.

**שאלת המשך לזוג:** "ומה אם הקלט יגיע **סדרתי** במקום במקביל?" — מועמד שעובר מיד ל-FSM של 4 רכיבים (כמו #1015) — מצוין. מועמד שמנסה להמשיך עם priority encoder + shift register — מפספס את היופי שב-FSM.

**שאלת bonus:** "\`floor(log_2(X))\` הוא **bit_length(X) - 1** ב-Python." — מועמד שמזכיר את זה — סימן ל-bridging between hardware ו-software.`,
        expectedAnswers: [
          'priority encoder', 'מקודד עדיפות',
          '8-to-3', '8:3',
          'msb', 'most significant bit',
          'bit position', 'מיקום',
          'valid', 'undefined',
          '3 bits', '3 ביטים',
          'log', 'log2',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 29 (floor(log2))',
    tags: ['priority-encoder', 'log2', 'bit-position', 'msb', 'combinational', 'parallel', 'logic'],
    // Canvas: 8-to-3 priority encoder (built-in) with 8 single-bit X[i] inputs
    // + valid flag OR-tree.  Default: X = 0b00101011 → bit 5 is MSB → Y = 5.
    circuit: () => build(() => {
      // 8 input bits, default X = 43 = 0b00101011
      const x0 = h.input(80, 100, 'X[0]'); x0.fixedValue = 1;
      const x1 = h.input(80, 160, 'X[1]'); x1.fixedValue = 1;
      const x2 = h.input(80, 220, 'X[2]'); x2.fixedValue = 0;
      const x3 = h.input(80, 280, 'X[3]'); x3.fixedValue = 1;
      const x4 = h.input(80, 340, 'X[4]'); x4.fixedValue = 0;
      const x5 = h.input(80, 400, 'X[5]'); x5.fixedValue = 1;
      const x6 = h.input(80, 460, 'X[6]'); x6.fixedValue = 0;
      const x7 = h.input(80, 520, 'X[7]'); x7.fixedValue = 0;
      // Priority encoder 8 → 3 (built-in)
      const enc = h.block('ENCODER', 320, 310, { inputLines: 8, label: 'PriEnc 8:3' });
      // valid = OR of all X[i]: 3 OR-2 in tree (or 7 in cascade)
      const or01 = h.gate('OR', 200, 130);
      const or23 = h.gate('OR', 200, 250);
      const or45 = h.gate('OR', 200, 370);
      const or67 = h.gate('OR', 200, 490);
      const orQ1 = h.gate('OR', 540, 200);   // (X0∨X1) ∨ (X2∨X3)
      const orQ2 = h.gate('OR', 540, 440);   // (X4∨X5) ∨ (X6∨X7)
      const orAll = h.gate('OR', 720, 320);  // valid = above two
      // Outputs
      const y2 = h.output(540, 280, 'Y[2]');
      const y1 = h.output(540, 320, 'Y[1]');
      const y0 = h.output(540, 360, 'Y[0]');
      const valid = h.output(900, 320, 'valid');
      return {
        nodes: [x0, x1, x2, x3, x4, x5, x6, x7,
                enc,
                or01, or23, or45, or67, orQ1, orQ2, orAll,
                y2, y1, y0, valid],
        wires: [
          // Encoder inputs 0..7
          h.wire(x0.id, enc.id, 0), h.wire(x1.id, enc.id, 1),
          h.wire(x2.id, enc.id, 2), h.wire(x3.id, enc.id, 3),
          h.wire(x4.id, enc.id, 4), h.wire(x5.id, enc.id, 5),
          h.wire(x6.id, enc.id, 6), h.wire(x7.id, enc.id, 7),
          // Encoder outputs to Y[0..2]
          h.wire(enc.id, y0.id, 0, 0),
          h.wire(enc.id, y1.id, 0, 1),
          h.wire(enc.id, y2.id, 0, 2),
          // valid = OR-tree of all X
          h.wire(x0.id, or01.id, 0), h.wire(x1.id, or01.id, 1),
          h.wire(x2.id, or23.id, 0), h.wire(x3.id, or23.id, 1),
          h.wire(x4.id, or45.id, 0), h.wire(x5.id, or45.id, 1),
          h.wire(x6.id, or67.id, 0), h.wire(x7.id, or67.id, 1),
          h.wire(or01.id, orQ1.id, 0), h.wire(or23.id, orQ1.id, 1),
          h.wire(or45.id, orQ2.id, 0), h.wire(or67.id, orQ2.id, 1),
          h.wire(orQ1.id, orAll.id, 0), h.wire(orQ2.id, orAll.id, 1),
          h.wire(orAll.id, valid.id, 0),
        ],
      };
    }),
  },
];
