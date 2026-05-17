/**
 * IQ — DFT questions. See IQ/README.md and IQ/timing-cdc/index.js for the
 * shape. Add entries to QUESTIONS and they appear in the panel automatically.
 */

import { build, h } from '../../js/interview/circuitHelpers.js';

const LFSR4_SVG = `
<svg viewBox="0 0 560 260" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="4-bit Fibonacci LFSR with taps 3,0">
  <text x="280" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">4-bit Fibonacci LFSR — taps [3,0]</text>
  <text x="280" y="38" text-anchor="middle" fill="#c8d8f0" font-size="10">x⁴ + x + 1  (primitive, period 15)</text>

  <!-- 4 FFs in a row (left = high bit = b3, right = low = b0) -->
  <g stroke="#80b0e0" stroke-width="1.6" fill="#0a1520">
    <rect x="80"  y="100" width="60" height="60"/>
    <rect x="180" y="100" width="60" height="60"/>
    <rect x="280" y="100" width="60" height="60"/>
    <rect x="380" y="100" width="60" height="60"/>
  </g>
  <g fill="#c8d8f0" text-anchor="middle" font-size="11">
    <text x="110" y="135">b3</text>
    <text x="210" y="135">b2</text>
    <text x="310" y="135">b1</text>
    <text x="410" y="135">b0</text>
  </g>
  <g fill="#80b0e0" text-anchor="middle" font-size="9">
    <text x="110" y="178">FF3</text>
    <text x="210" y="178">FF2</text>
    <text x="310" y="178">FF1</text>
    <text x="410" y="178">FF0</text>
  </g>

  <!-- Shift connections: b3 ← b2, b2 ← b1, b1 ← b0 -->
  <path d="M 240 130 L 280 130" stroke="#c8d8f0" fill="none" marker-end="url(#l-arr)"/>
  <path d="M 340 130 L 380 130" stroke="#c8d8f0" fill="none" marker-end="url(#l-arr)"/>
  <path d="M 140 130 L 180 130" stroke="#c8d8f0" fill="none" marker-end="url(#l-arr)"/>

  <!-- Feedback XOR: taps are b3 (high) and b0 (low) -->
  <circle cx="40" cy="220" r="14" fill="#0a1520" stroke="#ffb878" stroke-width="1.8"/>
  <text x="40" y="225" text-anchor="middle" fill="#ffb878" font-weight="bold" font-size="14">⊕</text>
  <text x="40" y="248" text-anchor="middle" fill="#ffb878" font-size="9">XOR</text>

  <!-- b3 → XOR (top tap) -->
  <path d="M 110 160 L 110 200 L 54 200 L 54 214" stroke="#80f0a0" fill="none" stroke-width="1.3" marker-end="url(#l-arr-g)"/>
  <text x="78" y="195" fill="#80f0a0" font-size="9">tap b3</text>
  <!-- b0 → XOR (bottom tap) -->
  <path d="M 410 160 L 410 230 L 54 230 L 54 226" stroke="#80f0a0" fill="none" stroke-width="1.3" marker-end="url(#l-arr-g)"/>
  <text x="240" y="245" fill="#80f0a0" font-size="9">tap b0</text>

  <!-- XOR → b3.D -->
  <path d="M 40 206 L 40 75 L 110 75 L 110 100" stroke="#ffb878" fill="none" stroke-width="1.5" marker-end="url(#l-arr-o)"/>
  <text x="75" y="70" fill="#ffb878" font-size="10" font-weight="bold">new bit</text>

  <!-- Serial Q output = b3 -->
  <path d="M 440 130 L 510 130" stroke="#80c8ff" stroke-width="1.8" marker-end="url(#l-arr-b)"/>
  <text x="475" y="124" text-anchor="middle" fill="#80c8ff" font-weight="bold" font-size="11">Q</text>
  <text x="475" y="147" text-anchor="middle" fill="#80c8ff" font-size="9">(serial out = b3)</text>

  <defs>
    <marker id="l-arr"   viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c8d8f0"/></marker>
    <marker id="l-arr-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="l-arr-o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb878"/></marker>
    <marker id="l-arr-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#80c8ff"/></marker>
  </defs>
</svg>
`;

const MISR4_SVG = `
<svg viewBox="0 0 760 560" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="4-bit MISR — gate-level (4 D-FFs + 5 XORs)">
  <text x="380" y="22" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">4-bit MISR — gate-level (4 D-FFs + 5 XORs)</text>
  <text x="380" y="40" text-anchor="middle" fill="#c8d8f0" font-size="10">per-cell XOR mixes D[i] with the shifted bit; feedback XOR closes the loop (taps [3,0])</text>

  <!-- Column x centres -->
  <!-- col0 (LSB FF0): 110 | col1 (FF1): 290 | col2 (FF2): 470 | col3 (MSB FF3): 650 -->

  <!-- D inputs (green pads at top) -->
  <g>
    <circle cx="110" cy="80" r="15" fill="#0a2018" stroke="#80f0a0" stroke-width="1.8"/>
    <text x="110" y="84" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="12">D0</text>
    <circle cx="290" cy="80" r="15" fill="#0a2018" stroke="#80f0a0" stroke-width="1.8"/>
    <text x="290" y="84" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="12">D1</text>
    <circle cx="470" cy="80" r="15" fill="#0a2018" stroke="#80f0a0" stroke-width="1.8"/>
    <text x="470" y="84" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="12">D2</text>
    <circle cx="650" cy="80" r="15" fill="#0a2018" stroke="#80f0a0" stroke-width="1.8"/>
    <text x="650" y="84" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="12">D3</text>
  </g>

  <!-- D inputs drop wires -->
  <g stroke="#80f0a0" stroke-width="1.4" fill="none">
    <path d="M 110  95 L 110 175"/>
    <path d="M 290  95 L 290 175"/>
    <path d="M 470  95 L 470 175"/>
    <path d="M 650  95 L 650 175"/>
  </g>

  <!-- Per-cell XORs (block style, like the canvas) -->
  <g>
    <rect x="80"  y="175" width="60" height="36" rx="3" fill="#0a1520" stroke="#ffb878" stroke-width="1.8"/>
    <text x="110" y="195" text-anchor="middle" fill="#ffb878" font-weight="bold" font-size="12">XOR</text>
    <text x="110" y="208" text-anchor="middle" fill="#ffb878" font-size="9">▷ 0</text>

    <rect x="260" y="175" width="60" height="36" rx="3" fill="#0a1520" stroke="#ffb878" stroke-width="1.8"/>
    <text x="290" y="195" text-anchor="middle" fill="#ffb878" font-weight="bold" font-size="12">XOR</text>
    <text x="290" y="208" text-anchor="middle" fill="#ffb878" font-size="9">▷ 0</text>

    <rect x="440" y="175" width="60" height="36" rx="3" fill="#0a1520" stroke="#ffb878" stroke-width="1.8"/>
    <text x="470" y="195" text-anchor="middle" fill="#ffb878" font-weight="bold" font-size="12">XOR</text>
    <text x="470" y="208" text-anchor="middle" fill="#ffb878" font-size="9">▷ 0</text>

    <rect x="620" y="175" width="60" height="36" rx="3" fill="#0a1520" stroke="#ffb878" stroke-width="1.8"/>
    <text x="650" y="195" text-anchor="middle" fill="#ffb878" font-weight="bold" font-size="12">XOR</text>
    <text x="650" y="208" text-anchor="middle" fill="#ffb878" font-size="9">▷ 0</text>
  </g>

  <!-- XOR → FF D wires -->
  <g stroke="#ffb878" stroke-width="1.4" fill="none">
    <path d="M 110 211 L 110 260"/>
    <path d="M 290 211 L 290 260"/>
    <path d="M 470 211 L 470 260"/>
    <path d="M 650 211 L 650 260"/>
  </g>

  <!-- 4 D-FFs (block style) -->
  <g>
    <rect x="70"  y="260" width="80" height="70" rx="4" fill="#0a1520" stroke="#80b0e0" stroke-width="1.8"/>
    <text x="110" y="285" text-anchor="middle" fill="#c8d8f0" font-weight="bold" font-size="14">D</text>
    <text x="110" y="304" text-anchor="middle" fill="#80b0e0" font-size="9">FF0 (LSB)</text>
    <text x="138" y="278" text-anchor="end" fill="#c8d8f0" font-size="9">Q</text>
    <path d="M 75 320 L 84 314 L 75 308 z" fill="#80c8ff"/>

    <rect x="250" y="260" width="80" height="70" rx="4" fill="#0a1520" stroke="#80b0e0" stroke-width="1.8"/>
    <text x="290" y="285" text-anchor="middle" fill="#c8d8f0" font-weight="bold" font-size="14">D</text>
    <text x="290" y="304" text-anchor="middle" fill="#80b0e0" font-size="9">FF1</text>
    <text x="318" y="278" text-anchor="end" fill="#c8d8f0" font-size="9">Q</text>
    <path d="M 255 320 L 264 314 L 255 308 z" fill="#80c8ff"/>

    <rect x="430" y="260" width="80" height="70" rx="4" fill="#0a1520" stroke="#80b0e0" stroke-width="1.8"/>
    <text x="470" y="285" text-anchor="middle" fill="#c8d8f0" font-weight="bold" font-size="14">D</text>
    <text x="470" y="304" text-anchor="middle" fill="#80b0e0" font-size="9">FF2</text>
    <text x="498" y="278" text-anchor="end" fill="#c8d8f0" font-size="9">Q</text>
    <path d="M 435 320 L 444 314 L 435 308 z" fill="#80c8ff"/>

    <rect x="610" y="260" width="80" height="70" rx="4" fill="#0a1520" stroke="#80b0e0" stroke-width="1.8"/>
    <text x="650" y="285" text-anchor="middle" fill="#c8d8f0" font-weight="bold" font-size="14">D</text>
    <text x="650" y="304" text-anchor="middle" fill="#80b0e0" font-size="9">FF3 (MSB)</text>
    <text x="678" y="278" text-anchor="end" fill="#c8d8f0" font-size="9">Q</text>
    <path d="M 615 320 L 624 314 L 615 308 z" fill="#80c8ff"/>
  </g>

  <!-- CLK bus (cyan dashed, shared across all FFs) -->
  <g>
    <path d="M 40 350 L 720 350" stroke="#22ccff" stroke-width="1.4" stroke-dasharray="6 3" fill="none"/>
    <text x="20" y="354" fill="#22ccff" font-weight="bold" font-size="11">clk</text>
    <path d="M 110 350 L 110 320" stroke="#22ccff" stroke-width="1.4" stroke-dasharray="6 3" fill="none"/>
    <path d="M 290 350 L 290 320" stroke="#22ccff" stroke-width="1.4" stroke-dasharray="6 3" fill="none"/>
    <path d="M 470 350 L 470 320" stroke="#22ccff" stroke-width="1.4" stroke-dasharray="6 3" fill="none"/>
    <path d="M 650 350 L 650 320" stroke="#22ccff" stroke-width="1.4" stroke-dasharray="6 3" fill="none"/>
  </g>

  <!-- SIG output pads (red, like the canvas) -->
  <g>
    <text x="110" y="380" text-anchor="middle" fill="#80c8ff" font-size="10" font-weight="bold">SIG[0]</text>
    <circle cx="110" cy="405" r="18" fill="#2a0a14" stroke="#80c8ff" stroke-width="1.5"/>
    <text x="290" y="380" text-anchor="middle" fill="#80c8ff" font-size="10" font-weight="bold">SIG[1]</text>
    <circle cx="290" cy="405" r="18" fill="#2a0a14" stroke="#80c8ff" stroke-width="1.5"/>
    <text x="470" y="380" text-anchor="middle" fill="#80c8ff" font-size="10" font-weight="bold">SIG[2]</text>
    <circle cx="470" cy="405" r="18" fill="#2a0a14" stroke="#80c8ff" stroke-width="1.5"/>
    <text x="650" y="380" text-anchor="middle" fill="#80c8ff" font-size="10" font-weight="bold">SIG[3]</text>
    <circle cx="650" cy="405" r="18" fill="#2a0a14" stroke="#80c8ff" stroke-width="1.5"/>
  </g>
  <!-- FF.Q → SIG pad -->
  <g stroke="#80c8ff" stroke-width="1.4" fill="none">
    <path d="M 110 330 L 110 387"/>
    <path d="M 290 330 L 290 387"/>
    <path d="M 470 330 L 470 387"/>
    <path d="M 650 330 L 650 387"/>
  </g>

  <!-- Shift chain: FF_{i-1}.Q → XOR_i.in0 (white wires) -->
  <g stroke="#c8d8f0" stroke-width="1.4" fill="none">
    <!-- FF0.Q → XOR1.in0 -->
    <path d="M 140 290 L 220 290 L 220 192 L 260 192" marker-end="url(#mm-arr)"/>
    <!-- FF1.Q → XOR2.in0 -->
    <path d="M 320 290 L 400 290 L 400 192 L 440 192" marker-end="url(#mm-arr)"/>
    <!-- FF2.Q → XOR3.in0 -->
    <path d="M 500 290 L 580 290 L 580 192 L 620 192" marker-end="url(#mm-arr)"/>
  </g>

  <!-- Feedback XOR (bottom) — taps [3,0] -->
  <g>
    <rect x="320" y="480" width="80" height="36" rx="3" fill="#0a1520" stroke="#39ff80" stroke-width="2"/>
    <text x="360" y="500" text-anchor="middle" fill="#39ff80" font-weight="bold" font-size="12">XOR</text>
    <text x="360" y="513" text-anchor="middle" fill="#39ff80" font-size="9">▷ FB</text>
  </g>

  <!-- FF0.Q → FB (lower tap) -->
  <g stroke="#39ff80" stroke-width="1.4" fill="none">
    <path d="M 140 320 L 140 450 L 340 450 L 340 480" marker-end="url(#mm-arr-g)"/>
  </g>
  <!-- FF3.Q → FB (upper tap, longer path) -->
  <g stroke="#39ff80" stroke-width="1.4" fill="none">
    <path d="M 680 320 L 700 320 L 700 470 L 380 470 L 380 480" marker-end="url(#mm-arr-g)"/>
  </g>

  <!-- FB → XOR0.in0 (long path up the left side, into FF0's XOR top-left) -->
  <g stroke="#39ff80" stroke-width="1.4" fill="none">
    <path d="M 360 516 L 360 530 L 40 530 L 40 192 L 80 192" marker-end="url(#mm-arr-g)"/>
  </g>

  <!-- Labels -->
  <text x="220" y="282" fill="#c8d8f0" font-size="9">shift</text>
  <text x="400" y="282" fill="#c8d8f0" font-size="9">shift</text>
  <text x="580" y="282" fill="#c8d8f0" font-size="9">shift</text>
  <text x="370" y="540" fill="#39ff80" font-size="9" text-anchor="middle">feedback (FF3.Q ⊕ FF0.Q) → FF0's XOR</text>

  <defs>
    <marker id="mm-arr"   viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c8d8f0"/></marker>
    <marker id="mm-arr-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#39ff80"/></marker>
  </defs>
</svg>
`;

export const QUESTIONS = [
  // ─────────────────────────────────────────────────────────────
  // #6001 — LFSR design (Fibonacci, 4-bit, primitive polynomial)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'lfsr-fibonacci-4bit',
    difficulty: 'medium',
    title: 'בנה LFSR 4-bit (Fibonacci, taps [3,0])',
    intro:
`**Linear-Feedback Shift Register** — לב הלב של pseudo-random pattern generation ל-BIST. עליך לבנות LFSR Fibonacci ברוחב 4 ביטים עם taps בעמדות 3 ו-0 (פולינום \`x⁴ + x + 1\`), ולנתח את התנהגותו.`,
    parts: [
      {
        label: 'א',
        question: 'תכן את ה-LFSR — בלוקים, חיווט, וביטוי next-state.',
        hints: [
          '4 D-FFs בשרשרת — b3 (MSB) → b2 → b1 → b0 (LSB).',
          'כל cycle: כל FF מקבל את ערך השכן (shift), פרט ל-FF הגבוה (b3) שמקבל את פלט ה-XOR של ה-taps.',
          'XOR feedback: `new_bit = b3 ⊕ b0` (taps [3,0]).',
          'next state: `{b2, b1, b0, new_bit}` — או אקוויוולנטית: \`(state << 1) | XOR(taps)\` עם mask של 4-bit.',
          'הזרע (seed) מאותחל פעם אחת — לעולם לא 0.',
        ],
        answer:
`**שרשרת shift 4-bit + XOR לחזרה:**

\`\`\`
b3 ← (b3 ⊕ b0)      // ה-tap feedback נכנס לקצה הגבוה
b2 ← b3              // shift left
b1 ← b2
b0 ← b1
\`\`\`

ב-Fibonacci form, כל ה-taps מצורפים ב-XOR יחיד שמזין את הקצה הגבוה. ה-state אחרי cycle: \`{old_b2, old_b1, old_b0, old_b3 ⊕ old_b0}\`.

**רכיבים:** 4 D-FFs (קולטים על posedge clk) + שער XOR יחיד. סה"כ ~5 רכיבים.

**הפלט הסדרתי \`Q\`** הוא ה-MSB (b3) — הביט שיוצא מהקצה ונכנס ל-XOR. גוף הרגיסטר עצמו זמין כפלט מקבילי.`,
        schematic: LFSR4_SVG,
        interviewerMindset:
`רוצה לראות שאתה מבחין בין ה-FFs לבין ה-XOR, ושאתה יודע איזה ביט הולך לאיזה.

**מקפיץ לטובה:**
- לציין שזה Fibonacci form ולהזכיר שיש גם Galois (פיזיקה זהה, מבנה שונה — ראה סעיף ד׳).
- לכתוב את ה-Verilog ב-non-blocking (\`<=\`) ב-always block — מי שכותב blocking יוצר race.
- להזכיר שה-seed מוגדר ב-\`initial\` או דרך reset, לא בכל cycle.`,
        expectedAnswers: [
          '4', 'four', 'ארבעה',
          'xor', '⊕', 'feedback',
          'b3', 'b0', 'msb', 'lsb',
          'shift', 'fibonacci',
          'seed', 'זרע',
        ],
      },
      {
        label: 'ב',
        editor: 'verilog',
        question: 'ממש ב-Verilog. תמיכה ב-reset אסינכרוני אקטיב-נמוך, רוחב פרמטרי.',
        starterCode:
`module lfsr #(
    parameter N = 4,
    parameter SEED = 4'h1    // never 0!
) (
    input  wire         clk,
    input  wire         rst_n,
    output wire [N-1:0] state,
    output wire         q       // serial output (MSB)
);
    // TODO: declare state register

    // TODO: clocked block — async-reset to SEED, else shift+XOR feedback

    // TODO: drive outputs

endmodule
`,
        hints: [
          'משתנה state ברוחב N-bit, מוצהר כ-`reg`.',
          'always @(posedge clk or negedge rst_n) — non-blocking assignments.',
          'next-state בתוך ה-always: `state <= {state[N-2:0], state[N-1] ^ state[0]};` — `^` ב-Verilog הוא XOR.',
          '`q = state[N-1]` (MSB) דרך `assign`.',
        ],
        answer:
`\`\`\`verilog
module lfsr #(
    parameter N = 4,
    parameter SEED = 4'h1
) (
    input  wire         clk,
    input  wire         rst_n,
    output wire [N-1:0] state,
    output wire         q
);
    reg [N-1:0] r;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) r <= SEED;
        else        r <= { r[N-2:0], r[N-1] ^ r[0] };
    end

    assign state = r;
    assign q     = r[N-1];
endmodule
\`\`\`

**מפתח:**
- ה-shift הוא \`{r[N-2:0], new_bit}\` — מצרף את \`new_bit\` כ-LSB.
- \`new_bit = r[N-1] ^ r[0]\` — taps בעמדות 3 ו-0 (עבור N=4).
- non-blocking (\`<=\`) — מבטיח שכל ה-FFs דוגמים את ה-state הישן באותו edge.

עבור פולינומים אחרים: שנה את ביטוי ה-XOR. למשל ל-N=8 פולינום primitive נפוץ: taps [7,5,4,3] → \`r[7] ^ r[5] ^ r[4] ^ r[3]\`.`,
        expectedAnswers: [
          'always', 'posedge', 'negedge', 'rst_n',
          'reg', 'assign',
          '^', 'xor',
          'state[n-1]', 'r[n-1]', 'r[0]',
          '<=', 'non-blocking',
        ],
      },
      {
        label: 'ג',
        question: 'מה התקופה (period) של ה-LFSR הזה? מה קורה כאשר seed=0?',
        hints: [
          'period מקסימלי של N-bit LFSR = `2^N - 1` (מצב 0 חסר).',
          'עבור N=4: period מקסימלי = 15. עם taps primitive (כמו [3,0]) — מגיעים ל-15 בדיוק.',
          'taps לא-primitive נותנים period קצר יותר — הרצף "תקוע" בתת-מחזור.',
          'seed=0: כל הביטים אפס → b3⊕b0 = 0 → new_bit = 0 → state נשאר 0 לנצח. **lock state**.',
        ],
        answer:
`**תקופה: 15** (= 2⁴ - 1).

ה-LFSR עובר על כל 15 המצבים הלא-אפסיים מ-0001 עד 1000 ואז חוזר. דוגמה (מתחילים מ-seed=1):

| step | state | b3⊕b0 |
|------|-------|-------|
| 0    | 0001  | 1     |
| 1    | 0011  | 1     |
| 2    | 0111  | 1     |
| 3    | 1111  | 0     |
| 4    | 1110  | 1     |
| ...  | ...   | ...   |
| 14   | 1000  | 1     |
| 15   | 0001  | (חזרה) |

**state=0 = lock**:
\`\`\`
0000 → b3=0, b0=0 → 0⊕0=0 → new=0 → state נשאר 0000
\`\`\`

המצב 0 הוא **fixed point** של ה-LFSR — נכנסת אליו, לא יוצאת. **לכן ה-seed חייב להיות ≠ 0**. בסיליקון מבטיחים את זה ע"י reset שטוען seed קבוע מ-ROM (לרוב 1, או patter פסאודו-יחודי).

**taps לא-primitive** ייתנו תקופה < 15. למשל [2,0] (פולינום x⁴+x²+1 = (x²+x+1)²) — תקופה 6 בלבד. ה-15 דורש **primitive polynomial**, ויש טבלאות סטנדרטיות.`,
        expectedAnswers: [
          '15', 'fifteen', 'חמש-עשרה',
          '2^n - 1', '2**n-1',
          'primitive', 'פרימיטיבי',
          'lock', 'נתקע', 'fixed point',
          'seed', 'זרע',
          'never', 'אסור',
        ],
      },
      {
        label: 'ד',
        question: 'מתי תעדיף Galois LFSR על Fibonacci? מה ההבדל?',
        hints: [
          'Fibonacci: XOR יחיד גדול שמזין את הקצה. Critical path עובר דרך XOR-tree של k כניסות (k = מספר taps).',
          'Galois: כל tap הוא XOR ייעודי בין שני FFs שכנים, מקבל את ה-bit היוצא. Critical path = XOR יחיד בלבד.',
          'התנהגות מתמטית **זהה** (אותו פולינום מינימלי, אותה period).',
          'ב-ASIC עם clock מהיר: Galois עדיף כי f_max גבוה יותר.',
          'בלוגיקה פשוטה / FPGA קטן: Fibonacci פשוט יותר לכתוב ולקרוא.',
        ],
        answer:
`**שתי צורות, אותה פונקציה מתמטית** — אבל מבנה שונה:

**Fibonacci (מה שבנינו):**
- \`new_bit = b3 ⊕ b0 ⊕ ... ⊕ b_k\` (XOR-tree של כל ה-taps)
- Critical path: clk→Q של FF → XOR-tree של k כניסות → D של FF הבא.
- ל-N=4 עם 2 taps זה זול. ל-N=32 עם 4 taps זה XOR-tree של 4 → log₂(4)=2 רמות → 2 גייטים בנתיב.

**Galois (אקוויוולנטי):**
- ה-shift עובר כרגיל, אבל בכל מקום שיש tap, מוסיפים XOR בודד עם ה-MSB שיוצא.
- \`b_i ← b_{i+1} ⊕ (MSB & tap_i)\`
- Critical path: clk→Q → XOR יחיד → D. **קבוע, לא תלוי במספר ה-taps**.

**מתי Galois עדיף:**
- פולינומים עם הרבה taps (8+): Fibonacci נהיה אטי, Galois נשאר מהיר.
- target frequency גבוה: Galois נותן f_max שכמעט שווה לזה של D-FF סטנדרטי.
- CRC-32 / CRC-64 בתעשייה — תמיד Galois.

**מתי Fibonacci עדיף:**
- קריאות הקוד: בולט מה ה-taps. Galois מפזר אותם בין FFs ופחות אינטואיטיבי.
- מעט taps (2-3) ו-frequency צנוע: ההפרש ב-f_max זניח.
- BIST פדגוגי / סימולציה: Fibonacci מתאים יותר להסבר.

**זהות תוצאה:** שתי הצורות מייצרות את אותו סט מצבים בסדר שונה (קשור ב-bit-reversal). ה-period זהה.`,
        interviewerMindset:
`רוצה לשמוע "Critical path קבוע ב-Galois" — זה הטיעון המכריע. מי שאומר רק "Galois מהיר יותר" בלי לנמק, חצי-נקודה.

**נוקאאוט:** להזכיר ש-CRC-32 ב-Ethernet הוא Galois — דוגמה חיה ולא תיאורטית.`,
        expectedAnswers: [
          'galois', 'fibonacci',
          'critical path', 'נתיב קריטי',
          'f_max', 'fmax', 'תדר',
          'crc', 'crc-32', 'crc32',
          'xor', 'shift',
          'taps',
        ],
      },
    ],
    source: 'מאגר ראיונות — DFT classic: pseudo-random pattern generation',
    tags: ['lfsr', 'fibonacci', 'galois', 'shift-register', 'feedback', 'pseudo-random', 'bist', 'dft'],
    circuitRevealsAnswer: true,
    circuit: () => build(() => {
      // Gate-level Fibonacci LFSR — 4 D-FFs + 1 XOR.
      //   Shift LEFT, new_bit at LSB, Q (serial) = MSB.
      //   new_bit = FF3.Q ^ FF0.Q   (taps [3,0])
      //   Seed = 1 → only FF0 starts at Q=1; others at 0.
      const clk = h.clock(60, 220);
      const ff0 = h.ffD(180,  220, 'FF0 (LSB)');  ff0.initialQ = 1;
      const ff1 = h.ffD(360,  220, 'FF1');
      const ff2 = h.ffD(540,  220, 'FF2');
      const ff3 = h.ffD(720,  220, 'FF3 (MSB)');
      const xorFb = h.gate('XOR', 450, 400);
      const qOut = h.output(880, 220, 'Q (serial)');
      const b0Out = h.output(180, 100, 'b0');
      const b1Out = h.output(360, 100, 'b1');
      const b2Out = h.output(540, 100, 'b2');
      const b3Out = h.output(720, 100, 'b3');
      return {
        nodes: [clk, ff0, ff1, ff2, ff3, xorFb, qOut, b0Out, b1Out, b2Out, b3Out],
        wires: [
          // XOR feedback: FF3.Q ^ FF0.Q → FF0.D (new bit lands at LSB)
          h.wire(ff3.id,  xorFb.id, 0),     // FF3.Q → XOR.in0
          h.wire(ff0.id,  xorFb.id, 1),     // FF0.Q → XOR.in1
          h.wire(xorFb.id, ff0.id, 0),      // XOR.out → FF0.D
          // Shift chain LSB→MSB
          h.wire(ff0.id, ff1.id, 0),
          h.wire(ff1.id, ff2.id, 0),
          h.wire(ff2.id, ff3.id, 0),
          // Clock to all 4 FFs (D-FF.CLK = input 1)
          h.wire(clk.id, ff0.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff1.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff2.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff3.id, 1, 0, { isClockWire: true }),
          // Output Q = FF3 (MSB shifts out as the serial bit)
          h.wire(ff3.id, qOut.id, 0),
          // Per-bit observation pads
          h.wire(ff0.id, b0Out.id, 0),
          h.wire(ff1.id, b1Out.id, 0),
          h.wire(ff2.id, b2Out.id, 0),
          h.wire(ff3.id, b3Out.id, 0),
        ],
      };
    }),
  },

  // ─────────────────────────────────────────────────────────────
  // #6002 — MISR signature compaction
  // ─────────────────────────────────────────────────────────────
  {
    id: 'misr-signature-compactor',
    difficulty: 'medium',
    title: 'בנה MISR 4-bit — דחיסת תגובות לסיגנטורה',
    intro:
`**Multiple-Input Signature Register** — מה שעושים ב-BIST אחרי שמפעילים את ה-DUT עם דפוסי LFSR. ה-MISR לוקח את ה-N ביטים שיוצאים מה-DUT בכל מחזור ו"דוחס" אותם לתוך אוגר N-bit. הסיגנטורה הסופית מושווית מול ערך גולדן — אם זהה: DUT תקין; אם שונה: יש תקלה.

עליך לבנות MISR ברוחב 4 ביטים ולנתח את חוזק הזיהוי שלו.`,
    parts: [
      {
        label: 'א',
        question: 'מהו השוני המבני בין LFSR ל-MISR? צייר את הלולאה.',
        hints: [
          'LFSR אין לו inputs — רק clk. כל cycle: shift + feedback.',
          'MISR יש N inputs מקבילים (`D[N-1:0]` = תגובת ה-DUT). כל cycle: shift + feedback + XOR עם הקלט המקביל.',
          'הוספת ה-D inputs: `state_next[i] = state_current[i-1] ⊕ D[i]` עבור i > 0; `state_next[0] = (feedback XOR taps) ⊕ D[0]`.',
          'מבחינת פולינום — שניהם מבוססים על אותו x⁴+x+1, אבל ה-MISR מערבב את ה-D עם ה-shift state.',
        ],
        answer:
`**MISR = LFSR + parallel-input XOR בכל cell.**

מבנה (N=4, taps [3,0]):
\`\`\`
b3_next = b2 ⊕ D3
b2_next = b1 ⊕ D2
b1_next = b0 ⊕ D1
b0_next = (b3 ⊕ b0) ⊕ D0      ← XOR feedback + D0
\`\`\`

(טבלת ה-LFSR הייתה זהה, רק בלי ה-D האחרון בכל שורה.)

**רכיבים:** 4 D-FFs + 4 XORs מקבילים (אחד לכל cell) + שער XOR יחיד ל-feedback. ~9 רכיבים.

**הפונקציה:** קלטי ה-DUT שהשתנו בקלט מתערבבים עם המצב הקיים — אחרי K cycles, ה-state הוא פונקציה דחוסה של כל ה-K×N הביטים שעברו.`,
        schematic: MISR4_SVG,
        interviewerMindset:
`מי שמתחיל מ-"זה LFSR עם inputs" קלע נכון. מי שמסביר נכון את ה-XOR-per-cell ולמה זה מקבל את ה-D ולא במקום ה-shift — מקבל ניקוד מלא.

**נוקאאוט:** להזכיר שהשם הפורמלי הוא **Type-II MISR** (יש גם Type-I עם XOR משותף). רוב התעשייה משתמשת ב-Type-II כי הוא compactor יעיל יותר.`,
        expectedAnswers: [
          'misr', 'lfsr',
          'parallel', 'inputs', 'מקבילים',
          'xor', '⊕',
          'shift', 'feedback', 'taps',
          'signature', 'sig',
        ],
      },
      {
        label: 'ב',
        editor: 'verilog',
        question: 'ממש ב-Verilog. רוחב ופולינום פרמטריים, reset לסיד 0.',
        starterCode:
`module misr #(
    parameter N    = 4,
    parameter TAPS = 4'b1001  // bit-mask of taps (here: positions 3,0)
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire [N-1:0] din,
    output wire [N-1:0] sig
);
    // TODO: state register

    // TODO: clocked block — async-reset to 0, else shift + XOR(taps) + XOR(din)

    // TODO: expose sig

endmodule
`,
        hints: [
          'הזרע של MISR בד"כ 0 (בניגוד ל-LFSR שזה היה lock state) — כי ה-D inputs מספקים entropy.',
          'feedback bit: `^(state & TAPS)` — XOR של כל הביטים ב-state שבעמדות ה-taps.',
          'next-state: `{state[N-2:0], feedback} ^ din` — shift, ואז XOR עם din.',
        ],
        answer:
`\`\`\`verilog
module misr #(
    parameter N    = 4,
    parameter TAPS = 4'b1001
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire [N-1:0] din,
    output wire [N-1:0] sig
);
    reg [N-1:0] r;
    wire        fb = ^(r & TAPS);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) r <= {N{1'b0}};
        else        r <= ({ r[N-2:0], fb } ^ din);
    end

    assign sig = r;
endmodule
\`\`\`

**מפתח:**
- \`^(r & TAPS)\` — XOR-reduce של ה-state אחרי mask של ה-taps. עבור N=4, TAPS=4'b1001 (=bit 3 + bit 0): \`fb = r[3] ^ r[0]\`.
- \`{r[N-2:0], fb}\` — אותו shift כמו LFSR.
- ה-\`^ din\` בסוף — מערבב את הקלט המקבילי.
- ב-MISR seed=0 לא נתקע (בניגוד ל-LFSR) כי ה-din מספק את האנרגיה.`,
        expectedAnswers: [
          'always', 'posedge', 'rst_n',
          'reg', 'assign',
          '^', 'xor', 'reduction',
          'taps', 'din',
          'shift',
        ],
      },
      {
        label: 'ג',
        question: 'מה ההסתברות שתקלה ב-DUT לא תזוהה (aliasing)? איך משפרים?',
        hints: [
          'ה-MISR ממפה הסטוריה ארוכה של תגובות ל-state ב-N ביטים.',
          'יש 2^N סיגנטורות אפשריות. רק אחת מהן (`golden`) מתאימה ל-DUT תקין.',
          'אם יש תקלה, ההסתברות שהיא תיתן את הסיגנטורה הזהה (במקרה) = 1 / 2^N.',
          'עבור N=4: 1/16 ≈ 6.25%. **גרוע** ליישומי silicon.',
          'בתעשייה: MISR רחבים יותר. N=16 → 1/65536 ≈ 0.0015%. N=32 → 1 ל-4 מיליארד.',
        ],
        answer:
`**הסתברות aliasing ≈ 1 / 2ᴺ.**

ה-MISR הוא דחיסה בלתי-הפיכה — אין דרך לשחזר את הקלט המקורי מהסיגנטורה. **שתי תגובות שונות יכולות לתת אותה סיגנטורה** = false negative (תקלה לא זוהתה).

**N=4:** 1/16 ≈ 6.25% — ~6 מכל 100 chips פגומים יעברו את הבדיקה. **לא קביל בייצור.**

**N=16:** 1/2¹⁶ ≈ 1.5×10⁻⁵ — ~1.5 לכל 100k chips. **גבול מינימלי בייצור.**

**N=32:** 1/2³² ≈ 2.3×10⁻¹⁰ — שווה ערך לבדיקה מלאה. **סטנדרט תעשייתי.**

**שיפורים נוספים בייצור:**
1. **MISR רחב יותר** — N=64 (CRC-64) או 128.
2. **Multiple MISRs** — כמה MISRs במקביל על partitions שונים של הפלט. תקלה צריכה ליצור aliasing בכל ה-MISRs בו-זמנית → הסתברות מוכפלת.
3. **Different polynomials** — שני MISRs עם פולינומים שונים פוגעים בקורלציות שונות.
4. **Vector reduction (compaction)** — תגובות 100M cycles → סיגנטורה 32-bit. ההסתברות לא תלויה באורך הריצה, רק ברוחב ה-MISR.

**נקודה מתקדמת:** ה-aliasing הוא אחיד **רק** עבור פולינום primitive. עם פולינום לא-primitive, יש מצבים שמסתברים יותר → aliasing לא אחיד וגרוע יותר בפועל.`,
        expectedAnswers: [
          'aliasing',
          '1/2^n', '2^n', '1/16',
          '6%', '6.25',
          'wider', 'רחב', 'n=16', 'n=32',
          'primitive',
          'partition', 'multiple',
        ],
      },
    ],
    source: 'מאגר ראיונות — DFT classic: signature compaction',
    tags: ['misr', 'signature', 'aliasing', 'compaction', 'bist', 'dft'],
    circuitRevealsAnswer: true,
    circuit: () => build(() => {
      // Gate-level Type-II MISR — 4 D-FFs + 5 XORs.
      //   Per-cell XOR mixes D_i with the shifted bit; the LSB cell also
      //   XORs in the feedback (taps [3,0]).
      //   new_b0 = (FF3.Q ⊕ FF0.Q) ⊕ D0       (feedback + D0)
      //   new_b1 = FF0.Q ⊕ D1
      //   new_b2 = FF1.Q ⊕ D2
      //   new_b3 = FF2.Q ⊕ D3
      //   All FFs start at 0; D inputs supply entropy.
      const clk = h.clock(60, 280);
      // Parallel data inputs (top row)
      const d0 = h.input(180,  60, 'D0');
      const d1 = h.input(360,  60, 'D1');
      const d2 = h.input(540,  60, 'D2');
      const d3 = h.input(720,  60, 'D3');
      d0.stepValues = [1,0,1,1,0,1,0,1,0,1];
      d1.stepValues = [0,1,1,0,1,0,1,0,1,0];
      d2.stepValues = [1,1,0,1,0,1,1,0,0,1];
      d3.stepValues = [1,0,0,1,1,0,1,1,0,0];
      // Feedback XOR (taps [3,0]) — combines FF3.Q ⊕ FF0.Q into fb_bit
      const xorFb = h.gate('XOR', 450, 460);
      // Per-cell mixing XORs
      const xor0 = h.gate('XOR', 180, 160);
      const xor1 = h.gate('XOR', 360, 160);
      const xor2 = h.gate('XOR', 540, 160);
      const xor3 = h.gate('XOR', 720, 160);
      // 4 D-FFs (MISR cells)
      const ff0 = h.ffD(180, 280, 'FF0 (LSB)');
      const ff1 = h.ffD(360, 280, 'FF1');
      const ff2 = h.ffD(540, 280, 'FF2');
      const ff3 = h.ffD(720, 280, 'FF3 (MSB)');
      // Per-bit output pads
      const b0Out = h.output(180, 400, 'SIG[0]');
      const b1Out = h.output(360, 400, 'SIG[1]');
      const b2Out = h.output(540, 400, 'SIG[2]');
      const b3Out = h.output(720, 400, 'SIG[3]');
      return {
        nodes: [clk, d0, d1, d2, d3, xorFb, xor0, xor1, xor2, xor3,
                ff0, ff1, ff2, ff3, b0Out, b1Out, b2Out, b3Out],
        wires: [
          // Feedback XOR: FF3.Q ⊕ FF0.Q → fb_bit
          h.wire(ff3.id, xorFb.id, 0),
          h.wire(ff0.id, xorFb.id, 1),
          // Per-cell mixing XORs
          h.wire(xorFb.id, xor0.id, 0),   // fb_bit  → xor0.in0
          h.wire(d0.id,    xor0.id, 1),   // D0      → xor0.in1
          h.wire(ff0.id,   xor1.id, 0),   // FF0.Q   → xor1.in0
          h.wire(d1.id,    xor1.id, 1),   // D1      → xor1.in1
          h.wire(ff1.id,   xor2.id, 0),   // FF1.Q   → xor2.in0
          h.wire(d2.id,    xor2.id, 1),   // D2      → xor2.in1
          h.wire(ff2.id,   xor3.id, 0),   // FF2.Q   → xor3.in0
          h.wire(d3.id,    xor3.id, 1),   // D3      → xor3.in1
          // XOR outputs → FF inputs
          h.wire(xor0.id, ff0.id, 0),
          h.wire(xor1.id, ff1.id, 0),
          h.wire(xor2.id, ff2.id, 0),
          h.wire(xor3.id, ff3.id, 0),
          // Clock to all 4 FFs
          h.wire(clk.id, ff0.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff1.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff2.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff3.id, 1, 0, { isClockWire: true }),
          // Per-bit signature output
          h.wire(ff0.id, b0Out.id, 0),
          h.wire(ff1.id, b1Out.id, 0),
          h.wire(ff2.id, b2Out.id, 0),
          h.wire(ff3.id, b3Out.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #6003 — Stuck-at fault detection on a fanout-C / NOR+AND circuit
  //         (slide 40). The C signal fans out: one branch → AND directly,
  //         the other → inverter → NOR. The fault sits on the C net
  //         BEFORE the fanout split, so a stuck value propagates through
  //         both branches simultaneously. ATPG asks for the minimum test
  //         set that distinguishes fault-free / s-a-0 / s-a-1.
  // ───────────────────────────────────────────────────────────────
  {
    id: 'stuck-at-detection-nor-and-cfanout',
    difficulty: 'medium',
    title: 'זיהוי תקלת stuck-at על קו C עם פאן-אאוט — מינימום וקטורי בדיקה',
    intro:
`נתון המעגל בשרטוט:

- \`A\` נכנס ישירות ל-AND.
- \`B\` נכנס ל-NOR.
- **\`C\` עושה פאן-אאוט**: ענף אחד ממשיך ל-AND (קלט נפרד), ענף שני נכנס למהפך
  ומשם ל-NOR. ה-AND הוא 3-כניסות: \`A\`, \`C\`, ופלט ה-NOR.

ידוע שבנקודה המסומנת בעיגול הכחול — **על קו \`C\` לפני פיצול הפאן-אאוט** — קיימת תקלה.
או שהנקודה מקוצרת ל-\`'1'\` (stuck-at-1) או מקוצרת ל-\`'0'\` (stuck-at-0). כשהיא תקועה,
**שני הענפים** רואים את הערך התקוע (גם זה שנכנס ישירות ל-AND, גם זה שעובר ב-INV אל ה-NOR).

איך נכנס קלטים בנקודות \`A\`, \`B\`, \`C\` כדי לזהות את **סוג** הקצר — במספר וקטורי הבדיקה
המינימלי האפשרי?`,
    schematic: `
<svg viewBox="0 0 620 360" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="3-input AND fed by A, NOR, and C fanout. Fault marker on C net before fanout split.">
  <defs>
    <marker id="dft3arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
  </defs>

  <!-- Input labels -->
  <text direction="ltr" x="22" y="74" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">A</text>
  <text direction="ltr" x="22" y="164" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">B</text>
  <text direction="ltr" x="22" y="304" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">C</text>

  <!-- ── A wire: straight across to AND top input ───────────────── -->
  <line x1="40" y1="70" x2="430" y2="70" stroke="#f0d080" stroke-width="1.8"/>
  <line x1="430" y1="70" x2="430" y2="130" stroke="#f0d080" stroke-width="1.8"/>

  <!-- ── B wire: straight across to NOR top input ───────────────── -->
  <line x1="40" y1="160" x2="240" y2="160" stroke="#f0d080" stroke-width="1.8"/>

  <!-- ── C wire: from input C with FAULT MARKER, then fans out ─── -->
  <!-- segment from input to fault marker -->
  <line x1="40" y1="300" x2="100" y2="300" stroke="#f0d080" stroke-width="1.8"/>
  <!-- fault marker (blue circle, before the fanout split) -->
  <circle cx="120" cy="300" r="11" fill="#80c8ff" stroke="#3060a0" stroke-width="2.2"/>
  <text direction="ltr" x="120" y="282" text-anchor="middle" fill="#80c8ff" font-size="10" font-weight="bold">fault</text>
  <!-- continued C wire after fault -->
  <line x1="131" y1="300" x2="200" y2="300" stroke="#f0d080" stroke-width="1.8"/>
  <!-- fanout junction dot -->
  <circle cx="200" cy="300" r="3.5" fill="#f0d080"/>

  <!-- Branch 1: C → up to AND bottom input -->
  <line x1="200" y1="300" x2="200" y2="200" stroke="#f0d080" stroke-width="1.8"/>
  <line x1="200" y1="200" x2="430" y2="200" stroke="#f0d080" stroke-width="1.8"/>
  <text direction="ltr" x="318" y="193" text-anchor="middle" fill="#a0a0c0" font-size="10" font-style="italic">C → AND (fanout)</text>

  <!-- Branch 2: C → right to inverter -->
  <line x1="200" y1="300" x2="245" y2="300" stroke="#f0d080" stroke-width="1.8"/>

  <!-- Inverter (triangle + bubble) -->
  <polygon points="245,285 245,315 275,300" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="281" cy="300" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="260" y="332" text-anchor="middle" fill="#80d4ff" font-size="10">INV</text>

  <!-- Inverter output → up to NOR bottom input -->
  <line x1="286" y1="300" x2="320" y2="300" stroke="#80d4ff" stroke-width="1.8"/>
  <line x1="320" y1="300" x2="320" y2="200" stroke="#80d4ff" stroke-width="1.8"/>
  <line x1="320" y1="200" x2="240" y2="200" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="300" y="248" text-anchor="middle" fill="#80d4ff" font-size="10">C̄</text>

  <!-- ── NOR gate ──────────────────────────────────────────────── -->
  <path d="M 240 130 Q 272 180 240 230 Q 285 230 312 207 Q 335 180 312 153 Q 285 130 240 130 Z"
        fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="340" cy="180" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="278" y="184" text-anchor="middle" fill="#80d4ff" font-size="10" font-weight="bold">NOR</text>

  <!-- NOR output → AND middle input -->
  <line x1="345" y1="180" x2="430" y2="180" stroke="#80d4ff" stroke-width="1.8"/>

  <!-- ── 3-input AND gate (taller D-shape with 3 input lines) ──── -->
  <path d="M 430 105 L 430 215 L 480 215 A 55 55 0 0 0 480 105 Z" fill="#102818" stroke="#80f0a0" stroke-width="2"/>
  <text direction="ltr" x="460" y="166" text-anchor="middle" fill="#80f0a0" font-size="12" font-weight="bold">AND</text>
  <text direction="ltr" x="460" y="182" text-anchor="middle" fill="#80f0a0" font-size="9">(3-in)</text>

  <!-- AND output → Out -->
  <line x1="513" y1="160" x2="575" y2="160" stroke="#80f0a0" stroke-width="2.4" marker-end="url(#dft3arr)"/>
  <text direction="ltr" x="595" y="164" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">Out</text>
</svg>`,
    parts: [
      {
        label: null,
        question: 'כמה וקטורי בדיקה מינימליים נדרשים, ומה הם? אילו פלטים?',
        hints: [
          'התחל מחישוב הפונקציה הלוגית. עם פאן-אאוט של \\\`C\\\` (ענף ישיר ל-AND + ענף דרך INV ל-NOR), הפלט הוא \\\`Out = A · C · NOR(B, C̄) = A · C · B̄ · C = A · B̄ · C\\\` (כי \\\`C · C = C\\\`).',
          '**מעוררים את התקלה (activation):**\\n• עבור s-a-0 צריך \\\`C = 1\\\` אמיתית (כדי שהקצר מ-1 ל-0 ייצור הפרש).\\n• עבור s-a-1 צריך \\\`C = 0\\\` אמיתית.',
          '**מפיצים את התקלה (propagation):** הפלט הוא \\\`A · B̄ · C\\\`. צריך \\\`A = 1\\\` ו-\\\`B = 0\\\` כדי שכל שינוי ב-\\\`C\\\` יחלחל ל-Out. ל-s-a-1 (\\\`C = 0\\\` אמיתית, Out=0 אמיתי) צריך לוודא שעם \\\`C = 1\\\` תקוע נקבל פלט 1 — ולכן \\\`A · B̄\\\` חייב להיות 1 → \\\`A = 1, B = 0\\\`. אותה דרישה ל-s-a-0.',
          'אז:\\n• \\\`(A,B,C) = (1,0,1)\\\` מזהה s-a-0 — free Out=1, עם s-a-0 ה-\\\`C\\\` נראה 0 בכל מקום → Out=0.\\n• \\\`(A,B,C) = (1,0,0)\\\` מזהה s-a-1 — free Out=0, עם s-a-1 ה-\\\`C\\\` נראה 1 בכל מקום → Out=1.',
          '**מינימום = 2 וקטורי בדיקה.** עם 2 הקלטים האלה הסיגנטורות נפרדות לחלוטין: free=(1,0), s-a-0=(0,0), s-a-1=(1,1).',
          'בדיקת שפיות שלישית אופציונלית: \\\`(A,B,C) = (0,0,0)\\\` — Out=0 בכל המצבים. סיגנטורת free על 3 הוקטורים: \\\`(1, 0, 0)\\\`. כל סטייה מ-(1,0,0) מצביעה על איזו תקלה ספציפית פעילה.',
        ],
        answerSchematic: `
<svg viewBox="0 0 960 480" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Two faulty circuits: stuck-at-0 and stuck-at-1, with their respective detecting test vectors and propagated values.">
  <defs>
    <marker id="dft3aG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="dft3aR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8080"/></marker>
  </defs>

  <rect x="0" y="0" width="960" height="40" fill="#0c1a28"/>
  <text direction="ltr" x="480" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Two faulty variants — fault sits on C net before fanout; minimum test set = 2
  </text>

  <!-- ═══════════ LEFT: Stuck-at-0 circuit, pattern (A,B,C)=(1,0,1) ═══════════ -->
  <rect x="20" y="56" width="450" height="410" rx="8" fill="#1a1408" stroke="#aa6a3a" stroke-width="1.6"/>
  <text direction="ltr" x="245" y="82" text-anchor="middle" fill="#f0a060" font-weight="bold" font-size="13">
    Stuck-at-0 — test (A,B,C) = (1, 0, 1)
  </text>

  <!-- Input labels (left side) -->
  <text direction="ltr" x="50" y="124" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">A=1</text>
  <text direction="ltr" x="50" y="204" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">B=0</text>
  <text direction="ltr" x="50" y="354" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">C=1</text>

  <!-- A wire → AND top -->
  <line x1="80" y1="120" x2="360" y2="120" stroke="#80f0a0" stroke-width="1.8"/>
  <line x1="360" y1="120" x2="360" y2="180" stroke="#80f0a0" stroke-width="1.8"/>

  <!-- B wire → NOR top -->
  <line x1="80" y1="200" x2="220" y2="200" stroke="#80f0a0" stroke-width="1.8"/>

  <!-- C wire from input, value=1, with stuck-at-0 fault marker -->
  <line x1="80" y1="350" x2="115" y2="350" stroke="#80f0a0" stroke-width="1.8"/>
  <text direction="ltr" x="98" y="343" text-anchor="middle" fill="#80f0a0" font-size="9">c=1</text>
  <!-- fault marker -->
  <circle cx="135" cy="350" r="12" fill="#1a0808" stroke="#ff6060" stroke-width="2.4"/>
  <text direction="ltr" x="135" y="354" text-anchor="middle" fill="#ff6060" font-weight="bold" font-size="14">0</text>
  <text direction="ltr" x="135" y="332" text-anchor="middle" fill="#ff6060" font-size="9" font-weight="bold">s-a-0</text>
  <!-- After-fault wire: now stuck at 0 -->
  <line x1="147" y1="350" x2="200" y2="350" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>
  <text direction="ltr" x="173" y="343" text-anchor="middle" fill="#ff8080" font-size="10">→ 0</text>
  <!-- Fanout junction -->
  <circle cx="200" cy="350" r="3.5" fill="#ff8080"/>

  <!-- Branch 1: C-fanout up to AND bottom input -->
  <line x1="200" y1="350" x2="200" y2="250" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>
  <line x1="200" y1="250" x2="360" y2="250" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>
  <text direction="ltr" x="280" y="242" text-anchor="middle" fill="#ff8080" font-size="10">C→AND = 0</text>

  <!-- Branch 2: continues to inverter -->
  <line x1="200" y1="350" x2="240" y2="350" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>

  <!-- Inverter -->
  <polygon points="240,335 240,365 268,350" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="274" cy="350" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <!-- inverter output value=1 -->
  <line x1="279" y1="350" x2="320" y2="350" stroke="#80d4ff" stroke-width="1.8"/>
  <line x1="320" y1="350" x2="320" y2="240" stroke="#80d4ff" stroke-width="1.8"/>
  <line x1="320" y1="240" x2="220" y2="240" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="300" y="296" text-anchor="middle" fill="#80d4ff" font-size="10">C̄=1</text>

  <!-- NOR -->
  <path d="M 220 170 Q 250 220 220 270 Q 260 270 285 250 Q 305 220 285 195 Q 260 170 220 170 Z"
        fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="310" cy="220" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="252" y="224" text-anchor="middle" fill="#80d4ff" font-size="10" font-weight="bold">NOR</text>
  <!-- NOR output value = NOT(0+1) = 0 -->
  <line x1="315" y1="220" x2="360" y2="220" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="335" y="212" text-anchor="middle" fill="#80d4ff" font-size="10">NOR=0</text>

  <!-- 3-input AND -->
  <path d="M 360 100 L 360 270 L 405 270 A 85 85 0 0 0 405 100 Z" fill="#102818" stroke="#80f0a0" stroke-width="2"/>
  <text direction="ltr" x="385" y="184" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">AND</text>
  <text direction="ltr" x="385" y="200" text-anchor="middle" fill="#80f0a0" font-size="9">(3-in)</text>

  <line x1="435" y1="185" x2="445" y2="185" stroke="#80f0a0" stroke-width="2.4"/>
  <line x1="445" y1="185" x2="445" y2="185" stroke="#80f0a0" stroke-width="2.4" marker-end="url(#dft3aG)"/>
  <text direction="ltr" x="445" y="178" fill="#80f0a0" font-weight="bold" font-size="13">Out</text>

  <!-- Output summary box -->
  <rect x="50" y="410" width="380" height="42" rx="6" fill="#102010" stroke="#80f0a0" stroke-width="1.6"/>
  <text direction="ltr" x="240" y="428" text-anchor="middle" fill="#a0a0c0" font-size="11">
    fault-free: Out = A·B̄·C = 1·1·1 = <tspan fill="#80f0a0" font-weight="bold">1</tspan>
  </text>
  <text direction="ltr" x="240" y="445" text-anchor="middle" fill="#a0a0c0" font-size="11">
    with s-a-0: Out = A·0·NOR(0,1) = 1·0·0 = <tspan fill="#ff8080" font-weight="bold" font-size="14">0  ✓ detect</tspan>
  </text>

  <!-- ═══════════ RIGHT: Stuck-at-1 circuit, pattern (A,B,C)=(1,0,0) ═══════════ -->
  <rect x="490" y="56" width="450" height="410" rx="8" fill="#1a0808" stroke="#aa3a3a" stroke-width="1.6"/>
  <text direction="ltr" x="715" y="82" text-anchor="middle" fill="#f08080" font-weight="bold" font-size="13">
    Stuck-at-1 — test (A,B,C) = (1, 0, 0)
  </text>

  <!-- Input labels -->
  <text direction="ltr" x="520" y="124" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">A=1</text>
  <text direction="ltr" x="520" y="204" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">B=0</text>
  <text direction="ltr" x="520" y="354" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">C=0</text>

  <!-- A wire → AND top -->
  <line x1="550" y1="120" x2="830" y2="120" stroke="#80f0a0" stroke-width="1.8"/>
  <line x1="830" y1="120" x2="830" y2="180" stroke="#80f0a0" stroke-width="1.8"/>

  <!-- B wire → NOR top -->
  <line x1="550" y1="200" x2="690" y2="200" stroke="#80f0a0" stroke-width="1.8"/>

  <!-- C wire with stuck-at-1 fault -->
  <line x1="550" y1="350" x2="585" y2="350" stroke="#80f0a0" stroke-width="1.8"/>
  <text direction="ltr" x="568" y="343" text-anchor="middle" fill="#80f0a0" font-size="9">c=0</text>
  <circle cx="605" cy="350" r="12" fill="#1a0808" stroke="#ff6060" stroke-width="2.4"/>
  <text direction="ltr" x="605" y="354" text-anchor="middle" fill="#ff6060" font-weight="bold" font-size="14">1</text>
  <text direction="ltr" x="605" y="332" text-anchor="middle" fill="#ff6060" font-size="9" font-weight="bold">s-a-1</text>
  <line x1="617" y1="350" x2="670" y2="350" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>
  <text direction="ltr" x="643" y="343" text-anchor="middle" fill="#ff8080" font-size="10">→ 1</text>
  <circle cx="670" cy="350" r="3.5" fill="#ff8080"/>

  <!-- Branch 1: up to AND bottom input -->
  <line x1="670" y1="350" x2="670" y2="250" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>
  <line x1="670" y1="250" x2="830" y2="250" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>
  <text direction="ltr" x="750" y="242" text-anchor="middle" fill="#ff8080" font-size="10">C→AND = 1</text>

  <!-- Branch 2: to inverter -->
  <line x1="670" y1="350" x2="710" y2="350" stroke="#ff8080" stroke-width="1.8" stroke-dasharray="4 3"/>

  <!-- Inverter -->
  <polygon points="710,335 710,365 738,350" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="744" cy="350" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <line x1="749" y1="350" x2="790" y2="350" stroke="#80d4ff" stroke-width="1.8"/>
  <line x1="790" y1="350" x2="790" y2="240" stroke="#80d4ff" stroke-width="1.8"/>
  <line x1="790" y1="240" x2="690" y2="240" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="770" y="296" text-anchor="middle" fill="#80d4ff" font-size="10">C̄=0</text>

  <!-- NOR -->
  <path d="M 690 170 Q 720 220 690 270 Q 730 270 755 250 Q 775 220 755 195 Q 730 170 690 170 Z"
        fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <circle cx="780" cy="220" r="5" fill="#0a1825" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="722" y="224" text-anchor="middle" fill="#80d4ff" font-size="10" font-weight="bold">NOR</text>
  <line x1="785" y1="220" x2="830" y2="220" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="807" y="212" text-anchor="middle" fill="#80d4ff" font-size="10">NOR=1</text>

  <!-- 3-input AND -->
  <path d="M 830 100 L 830 270 L 875 270 A 85 85 0 0 0 875 100 Z" fill="#102818" stroke="#80f0a0" stroke-width="2"/>
  <text direction="ltr" x="855" y="184" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">AND</text>
  <text direction="ltr" x="855" y="200" text-anchor="middle" fill="#80f0a0" font-size="9">(3-in)</text>

  <line x1="905" y1="185" x2="915" y2="185" stroke="#80f0a0" stroke-width="2.4" marker-end="url(#dft3aG)"/>
  <text direction="ltr" x="915" y="178" fill="#80f0a0" font-weight="bold" font-size="13">Out</text>

  <!-- Output summary -->
  <rect x="520" y="410" width="380" height="42" rx="6" fill="#102010" stroke="#80f0a0" stroke-width="1.6"/>
  <text direction="ltr" x="710" y="428" text-anchor="middle" fill="#a0a0c0" font-size="11">
    fault-free: Out = A·B̄·C = 1·1·0 = <tspan fill="#80f0a0" font-weight="bold">0</tspan>
  </text>
  <text direction="ltr" x="710" y="445" text-anchor="middle" fill="#a0a0c0" font-size="11">
    with s-a-1: Out = A·1·NOR(0,0) = 1·1·1 = <tspan fill="#ff8080" font-weight="bold" font-size="14">1  ✓ detect</tspan>
  </text>
</svg>`,
        answer:
`**מינימום: 2 וקטורי בדיקה.**

| # | (A, B, C) | Free Out | s-a-0 Out | s-a-1 Out |
|:-:|:---------:|:--------:|:---------:|:---------:|
| 1 | (1, 0, 1) | **1**    | **0** ⚡  | 1         |
| 2 | (1, 0, 0) | **0**    | 0         | **1** ⚡  |

\`⚡\` = פלט שונה מ-free → תקלה התגלתה.

**הסיגנטורות (וקטור הפלט על 2 הקלטים):**
- Fault-free: \`(1, 0)\`
- s-a-0: \`(0, 0)\` — שונה מ-free בקלט #1 → \`s-a-0\` זוהתה.
- s-a-1: \`(1, 1)\` — שונה מ-free בקלט #2 → \`s-a-1\` זוהתה.

כל שלושת התסריטים נפרדים → ב-2 וקטורים אפשר לזהות לא רק *אם* יש תקלה, אלא גם *איזו*.

### למה אלה הוקטורים הנכונים?

הפונקציה ללא תקלה: \`Out = A · C · NOR(B, C̄) = A · C · B̄ · C = A · B̄ · C\`.

הקלפ של השאלה: **התקלה על קו \`C\` לפני הפאן-אאוט** מעוותת בו-זמנית את הענף שהולך ישירות ל-AND ואת הענף שעובר ב-INV ל-NOR. כשמדמיינים את המעגל "התקול", פשוט מחליפים את \`C\` בקבוע (0 או 1) בכל מקום.

**Sensitization (להעיר את התקלה):** צריך שהערך האמיתי של \`C\` יהיה שונה מהערך התקוע.
- \`s-a-0\`: \`C\` אמיתי = **1** (כך הקצר מ-1 ל-0 יוצר הפרש).
- \`s-a-1\`: \`C\` אמיתי = **0** (הקצר מ-0 ל-1 יוצר הפרש).

**Propagation (להעביר את ההפרש ל-Out):** מהביטוי \`Out = A · B̄ · C\`, כדי שערך \`C\` יחלחל ל-Out, נדרש \`A = 1\` ו-\`B = 0\` (אחרת ה-AND או ה-NOR יחתכו את הסיגנל).

לכן:
- וקטור 1 (\`s-a-0\`): \`A = 1, B = 0, C = 1\` → \`(1, 0, 1)\`.
- וקטור 2 (\`s-a-1\`): \`A = 1, B = 0, C = 0\` → \`(1, 0, 0)\`.

### חישוב מלא של הוקטורים

| מצב | \`(A,B,C) = (1,0,1)\` | \`(A,B,C) = (1,0,0)\` |
|:---:|:--------------------:|:--------------------:|
| Free | C̄=0, NOR(0,0)=1, AND(1,1,1)=**1** | C̄=1, NOR(0,1)=0, AND(1,0,0)=**0** |
| s-a-0 (C נראה 0) | C̄=1, NOR(0,1)=0, AND(1,0,0)=**0** | C̄=1, NOR(0,1)=0, AND(1,0,0)=**0** |
| s-a-1 (C נראה 1) | C̄=0, NOR(0,0)=1, AND(1,1,1)=**1** | C̄=0, NOR(0,0)=1, AND(1,1,1)=**1** |

### וקטור בדיקת שפיות (אופציונלי) — 3 קלטים → סיגנטורה (1, 0, 0)

מוסיפים קלט שלישי \`(A,B,C) = (0,0,0)\`:

| # | (A, B, C) | Free | s-a-0 | s-a-1 |
|:-:|:---------:|:----:|:-----:|:-----:|
| 1 | (1, 0, 1) | **1**| **0** | 1     |
| 2 | (1, 0, 0) | **0**| 0     | **1** |
| 3 | (0, 0, 0) | 0    | 0     | 0     |

**סיגנטורת ה-Free על 3 הוקטורים: \`(1, 0, 0)\`** — בדיוק התוצאה המבוקשת. כל סטייה ממנה:
- סטייה בקלט #1 (Out=0 במקום 1) → \`s-a-0\`.
- סטייה בקלט #2 (Out=1 במקום 0) → \`s-a-1\`.
- אין סטייה → המעגל תקין.

### למה לא וקטור יחיד?

עם וקטור אחד ישנן 2 אפשרויות פלט בלבד (0 או 1). יש 3 תסריטים שצריך להבחין ביניהם (free / s-a-0 / s-a-1). וקטור יחיד יכול לחלק לכל היותר ל-2 קבוצות → לא יכול להבחין בין 3. **2 וקטורים = 4 סיגנטורות אפשריות → מספיק.** זהו ה-information-theoretic lower bound.

### הכללה ל-stuck-at testing

זוהי דוגמה ל-**single-stuck-at fault model** — מודל התקלה הנפוץ ביותר ב-DFT. הכלים המקצועיים (Synopsys TetraMAX, Mentor Tessent) עושים בדיוק את התהליך הזה ב-ATPG (Automatic Test Pattern Generation):

1. **D-algorithm** — מסמן את הערך השונה (\`D\` = "fault active", \`D̄\` = "fault inverted") ומבצע backtrace דרך ה-justification (סיבוב כדי לקבל את הקלטים) ו-propagation (סיבוב כדי להעביר את ה-D ל-PO).
2. **PODEM / FAN** — אלגוריתמים מודרניים יעילים יותר.

**הערה על fanout:** כאשר אות עושה פאן-אאוט (כמו \`C\` כאן), תקלה על האות **לפני הפיצול** מתפשטת בכל הענפים — וזה מקרה "stem fault". תקלה על ענף ספציפי אחרי הפיצול היא "branch fault" וייתכן שלא תהיה זהה לתקלה על ה-stem. ATPG אמיתי מטפל בכל מיקום נפרדות.`,
        interviewerMindset:
`שאלת ATPG בסיסית עם טוויסט של fanout. המראיין מחפש:

1. **שאתה מזהה את ה-fanout של \`C\`** — מועמד שמתעלם מההסתעפות ומחשב Out = A·B̄·C ולא מבחין בכפילות התקלה (היא משפיעה גם על AND וגם על INV→NOR) — אזהרה. עם fanout, תקלה על ה-stem (לפני הפיצול) משפיעה על שני הענפים בו-זמנית.
2. **שאתה ניגש מהיציאה אחורה (backward justification)** — לא מנסה לרוץ על כל 8 הקומבינציות. ההסקה הלוגית של "\`A=1\`, \`B=0\` נדרשים, ו-\`C\` מתחלף" צריכה לקפוץ מיד.
3. **שאתה מבחין בין activation ל-propagation** — שני תנאים שונים. activation = \`C\` אמיתי שונה מהערך התקוע. propagation = \`A=1, B=0\` כדי שערך \`C\` יחלחל ל-Out.
4. **שאתה מצדיק את המינימום מתוך תאוריה** — וקטור יחיד = 2 תוצאות אפשריות, 3 תסריטים = דורש ≥ log₂(3) = 2 וקטורים. שאלת bonus.

**שאלת המשך נפוצה:** "ואם הקצר היה רק על ענף אחד של ה-fanout — נגיד רק על הענף ל-INV?" — תשובה: אז זו לא תקלת stem אלא תקלת branch. ה-AND עדיין רואה את \`C\` האמיתי, רק ה-NOR מקבל ערך תקוע. במקרה הזה s-a-0 על branch ל-INV הופך להיות **redundant fault** (לא ניתן לגלות) — כי כדי לגלות צריך \`C=0\` כדי שהערך אמיתי של \`C̄\` יהיה 1 (שונה מ-0 התקוע), אבל אז ה-\`C\` של ענף ה-AND מאפס את ה-Out לפני שזה משנה. זה מדגים למה ATPG מחשבן ענפים בנפרד.

**שאלת המשך מתקדמת:** "ולכמה תקלות יחידות אפשריות במעגל הזה ב-single-stuck-at model?" — ספירת קווים נפרדים (stem + branches): A (1 קו), B (1), C-stem (1), C-branch-to-AND (1), C-branch-to-INV (1), C̄ (1), NOR-out (1), AND-out=Out (1) → 8 קווים × 2 (s-a-0 / s-a-1) = **16 תקלות יחידות**. חלקן redundant.

**שאלת bonus:** "ומה ההבדל בין \`stem fault\` ל-\`branch fault\` בפאן-אאוט?" — stem = לפני הפיצול, משפיע על כל הענפים. branch = אחרי הפיצול, משפיע רק על ענף אחד. עבור מעגלי משובש או ATPG מדויק, חייבים למדל את שניהם נפרדות.`,
        expectedAnswers: [
          '2', 'two', 'שני', 'שניים',
          '(1,0,1)', '(1,1,1)',
          '101', '111',
          'minimum', 'מינימום', 'מינימלי',
          'stuck-at', 'stuck at', 's-a-0', 's-a-1',
          'activation', 'propagation',
          'sensitization', 'sensitize',
          'atpg', 'd-algorithm',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 40 (Stuck-at fault on C net with fanout)',
    tags: ['stuck-at', 'atpg', 'fault-detection', 'fanout', 'sensitization', 'propagation', 'test-vectors', 'dft'],
    circuitRevealsAnswer: true,
    // Canvas: THREE sub-circuits stacked vertically, all driven by the SAME
    // A and B inputs. Each row uses a different "C source" to model the
    // three possible scenarios as live, running gate-level netlists:
    //
    //   Row 1 — FAULT-FREE: C source is the real input C (user-controllable).
    //   Row 2 — STUCK-AT-0: C source is a constant 0 (the fault is wired in).
    //   Row 3 — STUCK-AT-1: C source is a constant 1.
    //
    // Each row implements the topology from the slide: C fanouts to both the
    // 3-input AND (cascaded as 2× AND-2) AND through an INV to a NOR whose
    // other input is B. The three Out labels are: Out (free), Out (s-a-0),
    // Out (s-a-1) — so the user can change A/B/C and watch how the three
    // outputs react. With defaults (1,0,1): free=1, s-a-0=0, s-a-1=1 → the
    // s-a-0 fault is "live" and visible. Set C=0 and the s-a-1 row will go
    // high while the others go low — exactly the test pattern (1,0,0).
    circuit: () => build(() => {
      // ── Shared inputs at the very left ────────────────────────────────
      const A = h.input(80,  140, 'A');      A.fixedValue = 1;
      const B = h.input(80,  240, 'B');      B.fixedValue = 0;
      const C = h.input(80,  360, 'C');      C.fixedValue = 1;
      // Constants that model the stuck-at faults — they look like inputs
      // but their value is hardcoded; the user shouldn't toggle them.
      const C0 = h.input(80,  640, 'C s-a-0 (=0)'); C0.fixedValue = 0;
      const C1 = h.input(80,  920, 'C s-a-1 (=1)'); C1.fixedValue = 1;

      // ── Row 1: FAULT-FREE ─────────────────────────────────────────────
      const inv1   = h.gate('NOT', 300, 360);
      const nor1   = h.gate('NOR', 500, 320);
      // 3-input AND: (A · C · NOR_out) cascaded as two AND-2 gates
      const and1a  = h.gate('AND', 500, 180);  // A · C
      const and1b  = h.gate('AND', 720, 250);  // (A·C) · NOR_out
      const Out1   = h.output(920, 250, 'Out (free)');

      // ── Row 2: STUCK-AT-0 (fault hard-wired in) ──────────────────────
      const inv2   = h.gate('NOT', 300, 640);
      const nor2   = h.gate('NOR', 500, 600);
      const and2a  = h.gate('AND', 500, 460);
      const and2b  = h.gate('AND', 720, 530);
      const Out2   = h.output(920, 530, 'Out (s-a-0)');

      // ── Row 3: STUCK-AT-1 (fault hard-wired in) ──────────────────────
      const inv3   = h.gate('NOT', 300, 920);
      const nor3   = h.gate('NOR', 500, 880);
      const and3a  = h.gate('AND', 500, 740);
      const and3b  = h.gate('AND', 720, 810);
      const Out3   = h.output(920, 810, 'Out (s-a-1)');

      return {
        nodes: [
          A, B, C, C0, C1,
          inv1, nor1, and1a, and1b, Out1,
          inv2, nor2, and2a, and2b, Out2,
          inv3, nor3, and3a, and3b, Out3,
        ],
        wires: [
          // ─── Row 1 — Fault-free ────────────────────────────────────
          // A fans out to all three AND1a's (top of each row)
          h.wire(A.id, and1a.id, 0),
          // B fans out to all three NORs (top input)
          h.wire(B.id, nor1.id, 0),
          // C fans out (within row 1) to INV1 AND directly to AND1a's second input
          h.wire(C.id, inv1.id, 0),
          h.wire(C.id, and1a.id, 1),
          // INV1 → NOR1 bottom input
          h.wire(inv1.id, nor1.id, 1),
          // (A · C) and NOR_out → AND1b → Out1
          h.wire(and1a.id, and1b.id, 0),
          h.wire(nor1.id,  and1b.id, 1),
          h.wire(and1b.id, Out1.id,  0),

          // ─── Row 2 — Stuck-at-0 ────────────────────────────────────
          h.wire(A.id,  and2a.id, 0),
          h.wire(B.id,  nor2.id, 0),
          // C-stem stuck at 0: both AND's C input AND inverter input are tied
          // to the constant C0 node. This is the "fault wired in".
          h.wire(C0.id, inv2.id,  0),
          h.wire(C0.id, and2a.id, 1),
          h.wire(inv2.id, nor2.id, 1),
          h.wire(and2a.id, and2b.id, 0),
          h.wire(nor2.id,  and2b.id, 1),
          h.wire(and2b.id, Out2.id, 0),

          // ─── Row 3 — Stuck-at-1 ────────────────────────────────────
          h.wire(A.id,  and3a.id, 0),
          h.wire(B.id,  nor3.id, 0),
          h.wire(C1.id, inv3.id,  0),
          h.wire(C1.id, and3a.id, 1),
          h.wire(inv3.id, nor3.id, 1),
          h.wire(and3a.id, and3b.id, 0),
          h.wire(nor3.id,  and3b.id, 1),
          h.wire(and3b.id, Out3.id, 0),
        ],
      };
    }),
  },
];
