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
`\`SUM  = A ⊕ B ⊕ Cin\`
\`COUT = (A·B) + ((A⊕B)·Cin)\`

**5 שערים:** 2 XOR + 2 AND + 1 OR. ה-FA = (A+B+Cin) ב-2 ביטים: (COUT, SUM).`,
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
        label: null,
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
    ],
    source: 'מאגר ראיונות — מינימיזציה בוליאנית קלאסית',
    tags: ['karnaugh', 'k-map', 'minimization', 'sop', 'combinational', 'logic'],
  },
];
