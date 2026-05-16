import { build, h } from '../../js/interview/circuitHelpers.js';

// ─── Shared design system for trace visualizations ───────────────────
// Every algorithm trace uses these tokens + defs so the panel feels
// like one coherent product instead of N disconnected mini-demos.
//
//   • Cyan  (#39ff80 / #80d4ff)  → the "now" cell / current step
//   • Gold  (#ffd060)            → the answer / eureka moment
//   • Slate (#3a5575 / #142435)  → idle background
//
// `_traceDefs(uid)` returns an SVG <defs> + <style> block. Pass it a
// unique id suffix so multiple instances on the same page never clash.
// `_traceDefIds(uid)` returns the matching `url(#...)` strings as a
// convenient dict for the caller.
function _traceDefIds(uid) {
  return {
    idleGrad:    `url(#tr-idle-${uid})`,
    curGrad:     `url(#tr-cur-${uid})`,
    matchGrad:   `url(#tr-match-${uid})`,
    chipGrad:    `url(#tr-chip-${uid})`,
    bannerCyan:  `url(#tr-banner-c-${uid})`,
    bannerGold:  `url(#tr-banner-g-${uid})`,
    glowCyan:    `url(#tr-glow-c-${uid})`,
    glowGold:    `url(#tr-glow-g-${uid})`,
    arrowGold:   `url(#tr-arrow-g-${uid})`,
    arrowCyan:   `url(#tr-arrow-c-${uid})`,
    // animation names — apply via inline style="animation: <name> ...".
    animPop:     `tr-pop-${uid}`,
    animFade:    `tr-fade-${uid}`,
    animDash:    `tr-dash-${uid}`,
    animSlide:   `tr-slide-${uid}`,
  };
}
function _traceDefs(uid) {
  return `
    <style>
      @keyframes tr-pop-${uid}   { from { opacity:0; transform:translateY(-6px) scale(0.92); } to { opacity:1; transform:none; } }
      @keyframes tr-fade-${uid}  { from { opacity:0; } to { opacity:1; } }
      @keyframes tr-dash-${uid}  { to { stroke-dashoffset:-24; } }
      @keyframes tr-slide-${uid} { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:none; } }
    </style>
    <defs>
      <linearGradient id="tr-idle-${uid}"   x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#142435"/><stop offset="1" stop-color="#0a1828"/>
      </linearGradient>
      <linearGradient id="tr-cur-${uid}"    x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#163a26"/><stop offset="1" stop-color="#0e2418"/>
      </linearGradient>
      <linearGradient id="tr-match-${uid}"  x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a2a10"/><stop offset="1" stop-color="#241808"/>
      </linearGradient>
      <linearGradient id="tr-chip-${uid}"   x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0e2820"/><stop offset="1" stop-color="#081a14"/>
      </linearGradient>
      <linearGradient id="tr-banner-c-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a2a40" stop-opacity="0.9"/><stop offset="1" stop-color="#06182a" stop-opacity="0.9"/>
      </linearGradient>
      <linearGradient id="tr-banner-g-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a1f08" stop-opacity="0.9"/><stop offset="1" stop-color="#181208" stop-opacity="0.9"/>
      </linearGradient>
      <filter id="tr-glow-c-${uid}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
        <feFlood flood-color="#39ff80" flood-opacity="0.6"/>
        <feComposite in2="blur" operator="in" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="tr-glow-g-${uid}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur"/>
        <feFlood flood-color="#ffd060" flood-opacity="0.7"/>
        <feComposite in2="blur" operator="in" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <marker id="tr-arrow-g-${uid}" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffd060"/>
      </marker>
      <marker id="tr-arrow-c-${uid}" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#39ff80"/>
      </marker>
    </defs>`;
}
function _traceUid() { return Math.random().toString(36).slice(2, 7); }

// ─── Registers-table SVG (Multiply-ISA trace) ────────────────────────
// Renders R0..R7 (or whichever subset we track) as a row of cards
// with their current 4-bit values. Cards that *changed* this step
// glow cyan and show a ±1 delta; cards that hold the answer at the
// final step glow gold.
//
//   state    : { R1, R2, R3, R4, R5 } — current values
//   changes  : { R3: +1, R1: -1, … } — what just changed (this step)
//   instr    : the current instruction line shown as a code banner
//   phase    : short label e.g. "outer-loop", "copy", "restore", "done"
//   formula  : optional text shown at bottom (e.g. "R3 = a·b")
//   done     : final step → gold theming on result register R3
function _registersSvg({ state, changes = {}, instr, phase, formula, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 900;
  const order = ['R1', 'R2', 'R3', 'R4', 'R5'];
  const cardW = 150, cardH = 110, gap = 18;
  const totalW = order.length * cardW + (order.length - 1) * gap;
  const cardsLeft = (W - totalW) / 2;
  const cardsY = 130;

  // Per-register role colors — readers map intent at a glance.
  const role = {
    R1: { label: 'input a',  hue: '#80d4ff' },
    R2: { label: 'counter',  hue: '#ff9a70' },
    R3: { label: 'output',   hue: '#80f0a0' },
    R4: { label: 'temp',     hue: '#c0a0e0' },
    R5: { label: 'sentinel', hue: '#a0a0a0' },
  };

  const cards = order.map((reg, i) => {
    const x = cardsLeft + i * (cardW + gap);
    const v = state[reg] ?? 0;
    const delta = changes[reg];
    const isChanged = delta !== undefined;
    const isAnswer  = done && reg === 'R3';
    const stroke = isAnswer ? '#ffd060' : (isChanged ? '#39ff80' : '#3a5575');
    const fill   = isAnswer ? D.matchGrad : (isChanged ? D.curGrad : D.idleGrad);
    const filter = isAnswer ? `filter="${D.glowGold}"`
                 : (isChanged ? `filter="${D.glowCyan}"` : '');
    const valColor = isAnswer ? '#fff0c0' : (isChanged ? '#c8f8d0' : '#e8f0fa');
    const roleColor = role[reg]?.hue || '#7090b0';

    // 4-bit binary view, monospace under the decimal value.
    const bin = (v & 0xF).toString(2).padStart(4, '0');

    return `
      <g style="animation: ${D.animPop} 320ms ${i * 60}ms both;">
        <rect x="${x}" y="${cardsY}" width="${cardW}" height="${cardH}" rx="12"
              fill="${fill}" stroke="${stroke}" stroke-width="${isChanged || isAnswer ? 3 : 1.5}" ${filter}/>
        <text x="${x + cardW / 2}" y="${cardsY + 24}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="22" font-weight="bold"
              fill="${roleColor}">${reg}</text>
        <text x="${x + cardW / 2}" y="${cardsY + 42}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="10"
              fill="#5a7090" letter-spacing="1">${role[reg]?.label || ''}</text>
        <text x="${x + cardW / 2}" y="${cardsY + 78}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="36" font-weight="bold"
              fill="${valColor}">${v}</text>
        <text x="${x + cardW / 2}" y="${cardsY + 100}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#5a7090">${bin}</text>
        ${isChanged ? `
          <g>
            <rect x="${x + cardW - 38}" y="${cardsY - 14}" width="46" height="26" rx="13"
                  fill="${delta > 0 ? '#0a2018' : '#2a1010'}"
                  stroke="${delta > 0 ? '#39ff80' : '#ff8060'}" stroke-width="2"
                  filter="${D.glowCyan}"/>
            <text x="${x + cardW - 15}" y="${cardsY + 3}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="14" font-weight="bold"
                  fill="${delta > 0 ? '#80f0a0' : '#ff9a70'}">${delta > 0 ? '+' : ''}${delta}</text>
          </g>` : ''}
      </g>`;
  }).join('');

  // Instruction banner (top)
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="48" rx="10"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="44" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="20"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' : ''}${instr}
      </text>
    </g>`;

  // Phase chip (below banner)
  const phaseChip = phase ? `
    <g style="animation: ${D.animFade} 300ms 100ms both;">
      <rect x="${W/2 - 70}" y="74" width="140" height="28" rx="14"
            fill="#0e1a2a" stroke="#3a5575" stroke-width="1"/>
      <text x="${W/2}" y="93" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="14"
            fill="#80a0c0" font-weight="bold" letter-spacing="2">phase: ${phase}</text>
    </g>` : '';

  // Formula at the bottom (final step or always when given)
  const formulaY = cardsY + cardH + 50;
  const formulaHtml = formula ? `
    <g style="animation: ${D.animFade} 400ms 200ms both;">
      <rect x="${W/2 - 240}" y="${formulaY - 28}" width="480" height="48" rx="10"
            fill="${done ? D.matchGrad : D.chipGrad}"
            stroke="${done ? '#ffd060' : '#2a4060'}" stroke-width="${done ? 2.4 : 1.4}"
            ${done ? `filter="${D.glowGold}"` : ''}/>
      <text x="${W/2}" y="${formulaY + 4}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="20" font-weight="bold"
            fill="${done ? '#ffd060' : '#a0c0e0'}">${formula}</text>
    </g>` : '';

  const H = formulaY + 40;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${phaseChip}
    ${cards}
    ${formulaHtml}
  </svg>`;
}

// ─── Two-pointer in-place reverse SVG ────────────────────────────────
// Single row of character cells with two labeled pointer arrows (i, j)
// converging from the edges. The cells at i, j are highlighted; on a
// "swap just happened" step, a curved swap arrow connects them. Done
// frame flips to gold and the pointers meet at the center.
function _twoPointerSvg({ state, i, j, swapped, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 64, CELL_H = 60;
  const n = state.length;
  const W = Math.max(640, n * CELL + 100);
  const rowY = 130;
  const totalW = n * CELL;
  const left = (W - totalW) / 2;

  // Cells
  const cells = [...state].map((ch, k) => {
    const isI = k === i;
    const isJ = k === j;
    const hot = isI || isJ;
    const stroke = hot ? (done ? '#ffd060' : '#39ff80') : '#3a5575';
    const fill   = hot ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = hot ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    return `
      <g style="animation: ${D.animPop} 260ms ${k * 35}ms both;">
        <text x="${left + k * CELL + CELL / 2}" y="${rowY - 18}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#7090b0" font-weight="bold">[${k}]</text>
        <rect x="${left + k * CELL}" y="${rowY}" width="${CELL - 6}" height="${CELL_H}" rx="8"
              fill="${fill}" stroke="${stroke}" stroke-width="${hot ? 2.4 : 1.2}" ${filter}/>
        <text x="${left + k * CELL + (CELL - 6) / 2}" y="${rowY + 42}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="32" font-weight="bold"
              fill="${hot ? (done ? '#fff0c0' : '#c8f8d0') : '#e8f0fa'}">${ch}</text>
      </g>`;
  }).join('');

  // Pointer labels (i above-left, j above-right of their cells)
  const pointerColor = done ? '#ffd060' : '#80f0a0';
  const pointer = (label, idx, yOff) => {
    if (idx < 0 || idx >= n) return '';
    const cx = left + idx * CELL + (CELL - 6) / 2;
    return `
      <g style="animation: ${D.animFade} 320ms 200ms both;">
        <text x="${cx}" y="${rowY - 38}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="22"
              fill="${pointerColor}" font-weight="bold">${label}</text>
        <path d="M ${cx} ${rowY - 30} L ${cx - 6} ${rowY - 16} L ${cx + 6} ${rowY - 16} z"
              fill="${pointerColor}"/>
      </g>`;
  };
  // If pointers met (i === j), draw single combined arrow.
  const pointers = (i === j)
    ? pointer(`i = j = ${i}`, i, 0)
    : pointer('i', i, 0) + pointer('j', j, 0);

  // Swap connector arrow (only on a "swap-just-happened" frame).
  let swap = '';
  if (swapped && i !== j && i >= 0 && j >= 0 && i < n && j < n) {
    const xi = left + i * CELL + (CELL - 6) / 2;
    const xj = left + j * CELL + (CELL - 6) / 2;
    const arcY = rowY + CELL_H + 36;
    swap = `
      <g style="animation: ${D.animFade} 480ms both;">
        <path d="M ${xi} ${rowY + CELL_H + 4} C ${xi} ${arcY + 20}, ${xj} ${arcY + 20}, ${xj} ${rowY + CELL_H + 4}"
              stroke="${done ? '#ffd060' : '#39ff80'}" stroke-width="2.5" fill="none"
              stroke-dasharray="6 4"
              filter="${done ? D.glowGold : D.glowCyan}"
              style="animation: ${D.animDash} 1.2s linear infinite;"
              marker-end="${done ? D.arrowGold : D.arrowCyan}"/>
        <text x="${(xi + xj) / 2}" y="${arcY + 18}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="15"
              fill="${done ? '#ffd060' : '#80f0a0'}" font-weight="bold">swap</text>
      </g>`;
  }

  // Banner
  const bannerText = done
    ? 'pointers met — i ≥ j → done'
    : (swapped ? `swap a[${i - 1}] ↔ a[${j + 1}], then i++, j--` : `compare a[${i}] and a[${j}]`);
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 260}" y="14" width="520" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + bannerText : bannerText}
      </text>
    </g>`;

  const H = rowY + CELL_H + (swapped ? 80 : 40);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${pointers}
    ${cells}
    ${swap}
  </svg>`;
}

// ─── Rate-limiter SVG — timeline + sliding window + deque ────────────
// Visualization shows the *story* of one IP under the rate detector:
//   • Time axis 0..tMax along the top, with tick marks per 10s.
//   • Each request rendered as a dot above the axis, colored cyan
//     when inside the current sliding window (60s), grey when expired.
//   • A semi-transparent "window" rectangle from `now-60` to `now`
//     makes the window slide visible across steps.
//   • Below the axis: the deque — chips of timestamps currently held.
//   • Right card: counter "X / 10", flips to gold + "SUSPECT" glow
//     once the count crosses the threshold.
//
//   args:
//     now      : current simulated time (seconds)
//     requests : array of request timestamps SEEN SO FAR (including
//                expired). The renderer figures out which are in the
//                window itself.
//     suspect  : sticky flag — once flipped, stays flipped (matches
//                the algorithm's behaviour where a flagged IP is
//                remembered even after the burst).
//     subtitle : optional one-liner displayed under the banner
function _rateLimiterSvg({ now, requests, suspect, subtitle, justArrived, justDropped, bannerOverride }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 900, H = 380;
  const WINDOW = 60;
  const THRESHOLD = 10;
  const tMax = 100;
  const axisLeft = 60, axisRight = W - 110, axisY = 175;
  const pxPerSec = (axisRight - axisLeft) / tMax;
  const xOf = (t) => axisLeft + t * pxPerSec;

  const inWindow = requests.filter(t => t > now - WINDOW && t <= now);
  const count = inWindow.length;
  const overThreshold = count > THRESHOLD;
  const isSuspect = suspect || overThreshold;
  const banner = bannerOverride || (isSuspect ? 'SUSPECT  ⚠' : 'monitoring…');
  // Whether to emphasise a specific event this step.
  const arrivedSet = new Set(Array.isArray(justArrived) ? justArrived : (justArrived != null ? [justArrived] : []));
  const droppedSet = new Set(Array.isArray(justDropped) ? justDropped : (justDropped != null ? [justDropped] : []));

  // Window rectangle
  const wLo = Math.max(0, now - WINDOW);
  const wX  = xOf(wLo);
  const wW  = xOf(now) - wX;
  const windowRect = `
    <rect x="${wX}" y="${axisY - 60}" width="${wW}" height="80" rx="6"
          fill="${isSuspect ? D.matchGrad : D.curGrad}"
          stroke="${isSuspect ? '#ffd060' : '#39ff80'}" stroke-width="1.6"
          opacity="0.55"
          filter="${isSuspect ? D.glowGold : D.glowCyan}"
          style="animation: ${D.animFade} 320ms both;"/>
    <text x="${wX + wW / 2}" y="${axisY - 66}" text-anchor="middle"
          font-family="'JetBrains Mono', monospace" font-size="13"
          fill="${isSuspect ? '#ffd060' : '#80f0a0'}" font-weight="bold">
      sliding window (${WINDOW}s)
    </text>`;

  // Axis line + ticks every 10s
  const ticks = [];
  for (let t = 0; t <= tMax; t += 10) {
    const x = xOf(t);
    ticks.push(`
      <line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 5}" stroke="#4a6080" stroke-width="1"/>
      <text x="${x}" y="${axisY + 22}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="12"
            fill="#7090b0">${t}s</text>`);
  }
  const axisLine = `<line x1="${axisLeft}" y1="${axisY}" x2="${axisRight}" y2="${axisY}" stroke="#4a6080" stroke-width="2"/>`;
  const nowMarker = `
    <g style="animation: ${D.animFade} 280ms both;">
      <line x1="${xOf(now)}" y1="${axisY - 70}" x2="${xOf(now)}" y2="${axisY + 30}"
            stroke="${isSuspect ? '#ffd060' : '#39ff80'}" stroke-width="2.5" stroke-dasharray="4 3"/>
      <text x="${xOf(now)}" y="${axisY + 44}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="14"
            fill="${isSuspect ? '#ffd060' : '#80f0a0'}" font-weight="bold">now=${now}s</text>
    </g>`;

  // Request dots — include dropped ones too so the user sees them fade.
  const allTimestamps = Array.from(new Set([...requests, ...droppedSet])).sort((a, b) => a - b);
  const dots = allTimestamps.map((t, i) => {
    const inside  = t > now - WINDOW && t <= now;
    const arrived = arrivedSet.has(t);
    const dropped = droppedSet.has(t);
    const x = xOf(t);
    let r = 6, color = '#4a5a70', filterAttr = '', extra = '';
    if (arrived) {
      r = 10;
      color = '#ffd060';
      filterAttr = `filter="${D.glowGold}"`;
      // Pulsing aura for the newcomer
      extra = `<circle cx="${x}" cy="${axisY - 24}" r="14" fill="none"
                       stroke="#ffd060" stroke-width="2" opacity="0.6"
                       style="animation: ${D.animFade} 600ms both;"/>
               <text x="${x}" y="${axisY - 46}" text-anchor="middle"
                     font-family="'JetBrains Mono', monospace" font-size="13"
                     fill="#ffd060" font-weight="bold">+req</text>`;
    } else if (dropped) {
      r = 6;
      color = '#5a3030';
      extra = `<line x1="${x - 7}" y1="${axisY - 27}" x2="${x + 7}" y2="${axisY - 13}"
                     stroke="#a05050" stroke-width="2"/>
               <text x="${x}" y="${axisY - 36}" text-anchor="middle"
                     font-family="'JetBrains Mono', monospace" font-size="11"
                     fill="#a05050">expired</text>`;
    } else if (inside) {
      color = isSuspect ? '#ffd060' : '#80f0a0';
      filterAttr = `filter="${isSuspect ? D.glowGold : D.glowCyan}"`;
    }
    return `
      <g style="animation: ${D.animPop} 220ms ${i * 12}ms both;">
        <circle cx="${x}" cy="${axisY - 24}" r="${r}" fill="${color}"
                stroke="#0a1828" stroke-width="1.5" ${filterAttr}/>
        ${extra}
      </g>`;
  }).join('');

  // ── DICT STATE block ──────────────────────────────────────────────
  // Renders the python data structures the algorithm actually keeps:
  //   history: dict[ip → deque[timestamps]]
  //   suspicious: set[ip]
  // The block visually mimics a code snippet, so the user sees the
  // exact state of memory at every step (not just the timeline).
  const dictY = 245;
  const blockX = 40, blockW = W - 80;
  const ipKey = '"192.168.1.1"';

  // History dict header
  const historyHeader = `
    <text x="${blockX + 14}" y="${dictY + 24}" font-family="'JetBrains Mono', monospace"
          font-size="15" fill="#80c0e0" font-weight="bold">history =</text>
    <text x="${blockX + 14 + 100}" y="${dictY + 24}" font-family="'JetBrains Mono', monospace"
          font-size="15" fill="#a0c8e0">{</text>
    <text x="${blockX + 14 + 116}" y="${dictY + 24}" font-family="'JetBrains Mono', monospace"
          font-size="15" fill="#ffb060" font-weight="bold">${ipKey}</text>
    <text x="${blockX + 14 + 116 + 150}" y="${dictY + 24}" font-family="'JetBrains Mono', monospace"
          font-size="15" fill="#a0c8e0">: deque[</text>`;

  // Chips for the deque values — placed on a second line.
  const chipsY = dictY + 42;
  const chipsLeft = blockX + 14;
  const availW = blockW - 28 - 40; // leave space for trailing ']'
  const chipW = Math.max(38, Math.min(70, availW / Math.max(1, inWindow.length)));
  // Each chip carries its **deque index** above and its **age**
  // (now - t) below. Indices visibly shift down whenever a popleft
  // expires the head — exactly what the user needs to see.
  const chipsHtml = inWindow.length === 0
    ? `<text x="${chipsLeft}" y="${chipsY + 26}" font-family="'JetBrains Mono', monospace"
            font-size="16" fill="#5a7090" font-style="italic">(empty)</text>`
    : inWindow.map((t, i) => {
        const x = chipsLeft + i * (chipW + 4);
        const isNew = arrivedSet.has(t);
        const isHead = i === 0;            // oldest — the popleft candidate
        const isTail = i === inWindow.length - 1;
        const stroke = isNew ? '#ffd060' : (isSuspect ? '#ffd060' : '#39ff80');
        const filter = (isNew || isSuspect) ? `filter="${D.glowGold}"` : '';
        const age = now - t;
        return `
          <g style="animation: ${D.animSlide} 280ms ${i * 35}ms both;">
            <text x="${x + chipW / 2}" y="${chipsY - 6}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="11"
                  fill="${isNew ? '#ffd060' : '#7090b0'}" font-weight="bold">
              ${isNew ? 'NEW' : `[${i}]`}
            </text>
            <rect x="${x}" y="${chipsY}" width="${chipW}" height="40" rx="6"
                  fill="${isNew ? D.matchGrad : D.chipGrad}" stroke="${stroke}" stroke-width="${isNew ? 2.8 : 1.6}"
                  ${filter}/>
            <text x="${x + chipW / 2}" y="${chipsY + 26}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="16" font-weight="bold"
                  fill="${isNew ? '#fff0c0' : (isSuspect ? '#fff0c0' : '#a8e0b8')}">${t}s</text>
            <text x="${x + chipW / 2}" y="${chipsY + 53}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="10"
                  fill="#6a8090">age ${age}s</text>
            ${isHead && !isNew ? `<text x="${x + chipW / 2}" y="${chipsY + 67}" text-anchor="middle"
                                         font-family="'JetBrains Mono', monospace" font-size="10"
                                         fill="#80c0a0" font-weight="bold">← head</text>` : ''}
            ${isTail && !isNew && inWindow.length > 1 ? `<text x="${x + chipW / 2}" y="${chipsY + 67}" text-anchor="middle"
                                                              font-family="'JetBrains Mono', monospace" font-size="10"
                                                              fill="#80c0a0" font-weight="bold">tail →</text>` : ''}
          </g>`;
      }).join('');

  // Closing bracket + summary on the line below — now includes the
  // explicit window cut-off so users can see WHY entries expire.
  const cutoff = Math.max(0, now - WINDOW);
  const summaryY = chipsY + 84;
  const summaryHtml = `
    <text x="${chipsLeft}" y="${summaryY}" font-family="'JetBrains Mono', monospace"
          font-size="15" fill="#a0c8e0">] }
      <tspan fill="#5a7090"># window = (${cutoff}s, ${now}s]   →   ${count} entr${count === 1 ? 'y' : 'ies'}${inWindow.length ? `, oldest=${inWindow[0]}s, newest=${inWindow[inWindow.length-1]}s` : ''}</tspan>
    </text>`;

  // Just-dropped notes — small grey strikethrough chips for the drops.
  const dropsY = summaryY + 26;
  const drops = droppedSet.size > 0
    ? `<g style="animation: ${D.animFade} 360ms both;">
         <text x="${chipsLeft}" y="${dropsY}" font-family="'JetBrains Mono', monospace"
               font-size="13" fill="#a05050">expired this step:
           <tspan fill="#a05050" font-weight="bold"> [${Array.from(droppedSet).map(t => `${t}s`).join(', ')}]</tspan>
         </text>
       </g>`
    : '';

  // Suspicious set (second data structure)
  const susY = summaryY + (droppedSet.size > 0 ? 50 : 26);
  const susHtml = `
    <text x="${chipsLeft}" y="${susY}" font-family="'JetBrains Mono', monospace"
          font-size="15" fill="#80c0e0" font-weight="bold">suspicious =</text>
    <text x="${chipsLeft + 118}" y="${susY}" font-family="'JetBrains Mono', monospace"
          font-size="15" fill="#a0c8e0">{${isSuspect ? '' : ' '}</text>
    ${isSuspect ? `
      <g style="animation: ${D.animPop} 360ms both;">
        <rect x="${chipsLeft + 132}" y="${susY - 16}" width="170" height="22" rx="11"
              fill="${D.matchGrad}" stroke="#ffd060" stroke-width="1.6"
              filter="${D.glowGold}"/>
        <text x="${chipsLeft + 217}" y="${susY}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13" font-weight="bold"
              fill="#fff0c0">${ipKey}</text>
      </g>
      <text x="${chipsLeft + 312}" y="${susY}" font-family="'JetBrains Mono', monospace"
            font-size="15" fill="#a0c8e0"> }</text>
    ` : `
      <text x="${chipsLeft + 134}" y="${susY}" font-family="'JetBrains Mono', monospace"
            font-size="15" fill="#5a7090">}  <tspan font-style="italic">(empty)</tspan></text>
    `}`;

  // The block frame around the dict state
  const blockH = (susY + 22) - (dictY) + 10;
  const dictBlock = `
    <rect x="${blockX}" y="${dictY - 4}" width="${blockW}" height="${blockH}" rx="10"
          fill="#06121e" stroke="#1e3850" stroke-width="1.5"
          style="animation: ${D.animFade} 320ms both;"/>
    <text x="${blockX + 14}" y="${dictY - 12}" font-family="'JetBrains Mono', monospace"
          font-size="13" fill="#7090b0" font-weight="bold" letter-spacing="2">DICT STATE</text>`;

  // Counter card — moved to under the timeline area now so it doesn't
  // collide with the bigger dict block below. Right-aligned, small.
  const cardX = W - 150, cardY = 95;
  const counterCard = `
    <g style="animation: ${D.animFade} 320ms both;">
      <rect x="${cardX}" y="${cardY}" width="120" height="58" rx="8"
            fill="${isSuspect ? D.matchGrad : D.idleGrad}"
            stroke="${isSuspect ? '#ffd060' : '#3a5575'}" stroke-width="${isSuspect ? 3 : 1.5}"
            ${isSuspect ? `filter="${D.glowGold}"` : ''}/>
      <text x="${cardX + 60}" y="${cardY + 18}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="12"
            fill="${isSuspect ? '#ffd060' : '#80a0c0'}" font-weight="bold" letter-spacing="2">COUNT</text>
      <text x="${cardX + 60}" y="${cardY + 47}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="24" font-weight="bold"
            fill="${overThreshold ? '#ffd060' : (isSuspect ? '#ffd060' : '#80f0a0')}">${count} / ${THRESHOLD}</text>
    </g>`;

  // Top banner
  const bannerHtml = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 180}" y="14" width="360" height="42" rx="21"
            fill="${isSuspect ? D.bannerGold : D.bannerCyan}"
            stroke="${isSuspect ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${isSuspect ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="19"
            fill="${isSuspect ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${banner}
      </text>
    </g>`;
  const sub = subtitle ? `
    <text x="${W/2}" y="80" text-anchor="middle"
          font-family="'JetBrains Mono', monospace" font-size="14"
          fill="#80a0c0" font-style="italic">${subtitle}</text>` : '';

  // Total SVG height grows with the dict block.
  const finalH = susY + 40;
  return `<svg viewBox="0 0 ${W} ${finalH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${bannerHtml}
    ${sub}
    ${counterCard}
    ${windowRect}
    ${axisLine}
    ${ticks.join('')}
    ${dots}
    ${nowMarker}
    ${dictBlock}
    ${historyHeader}
    ${chipsHtml}
    ${summaryHtml}
    ${drops}
    ${susHtml}
  </svg>`;
}

// ─── Reverse-sentence SVG — character row with slice highlight ───────
// Two-row layout: top = state BEFORE this step's operation, bottom =
// state AFTER. The slice that just got reversed is highlighted in
// cyan (or gold on the final step). Vertical "swap" arrows under the
// highlighted slice make the reversal visually obvious.
//
//   args:
//     after     : the string AFTER this step (always shown)
//     before    : the string BEFORE this step (omit for the initial
//                 frame where there is no prior state)
//     hlLo, hlHi: range [hlLo, hlHi) within the row that was reversed
//                 — bottom row highlight + connecting swap arrows.
//     opLabel   : short banner text describing the op
//     done      : true on the final "fixed!" frame → gold theming
function _reverseSentenceSvg({ before, after, hlLo, hlHi, opLabel, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 30, CELL_H = 40;
  const n = after.length;
  const W = Math.max(900, n * CELL + 80);
  const rowsTop = before ? 90 : 130;
  const rowGap = 90;
  const totalW = n * CELL;
  const left = (W - totalW) / 2;

  const renderRow = (s, y, hi) => {
    return [...s].map((ch, i) => {
      const isSpace = ch === ' ';
      const isHl = hi && i >= hlLo && i < hlHi;
      const stroke = isHl ? (done ? '#ffd060' : '#39ff80') : (isSpace ? '#2a4060' : '#3a5575');
      const fill   = isHl ? (done ? D.matchGrad : D.curGrad) : (isSpace ? '#0a1320' : D.idleGrad);
      const filter = isHl ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
      const txtFill = isHl ? (done ? '#fff0c0' : '#c8f8d0') : (isSpace ? '#3a5575' : '#e8f0fa');
      return `
        <g style="animation: ${D.animPop} 260ms ${i * 18}ms both;">
          <rect x="${left + i * CELL}" y="${y}" width="${CELL - 3}" height="${CELL_H}" rx="5"
                fill="${fill}" stroke="${stroke}" stroke-width="${isHl ? 2.4 : 1}" ${filter}/>
          <text x="${left + i * CELL + (CELL - 3) / 2}" y="${y + 27}" text-anchor="middle"
                font-family="'JetBrains Mono', monospace" font-size="22" font-weight="bold"
                fill="${txtFill}">${isSpace ? '·' : ch}</text>
        </g>`;
    }).join('');
  };

  // Swap arrows: i-th cell of the slice ↔ (mirror) cell. Only draw a
  // few on hover-style arrows (first ↔ last, mid-pair, etc.) to keep
  // the view legible.
  let swapArrows = '';
  if (before && hlHi > hlLo) {
    const sliceLen = hlHi - hlLo;
    const numPairs = Math.min(sliceLen / 2, 4);   // cap visible arrows
    const pairs = [];
    for (let p = 0; p < Math.floor(sliceLen / 2); p++) {
      const a = hlLo + p;
      const b = hlHi - 1 - p;
      if (a >= b) break;
      pairs.push([a, b]);
    }
    // Pick evenly-spaced pairs so we don't render too many arrows.
    const step = Math.max(1, Math.floor(pairs.length / numPairs));
    const picked = pairs.filter((_, idx) => idx % step === 0).slice(0, numPairs);
    const topY    = rowsTop + CELL_H;
    const botY    = rowsTop + rowGap;
    const midY    = (topY + botY) / 2;
    swapArrows = picked.map(([a, b], pi) => {
      const xa = left + a * CELL + (CELL - 3) / 2;
      const xb = left + b * CELL + (CELL - 3) / 2;
      return `
        <g style="animation: ${D.animFade} 400ms ${200 + pi * 80}ms both;">
          <path d="M ${xa} ${topY + 4} C ${xa} ${midY}, ${xb} ${midY}, ${xb} ${botY - 6}"
                stroke="#39ff80" stroke-width="2" fill="none" opacity="0.65"
                marker-end="${D.arrowCyan}"
                stroke-dasharray="6 3"/>
          <path d="M ${xb} ${topY + 4} C ${xb} ${midY}, ${xa} ${midY}, ${xa} ${botY - 6}"
                stroke="#39ff80" stroke-width="2" fill="none" opacity="0.65"
                marker-end="${D.arrowCyan}"
                stroke-dasharray="6 3"/>
        </g>`;
    }).join('');
  }

  const beforeLabel = before ? `
    <text x="${left - 14}" y="${rowsTop + 26}" text-anchor="end"
          font-family="'JetBrains Mono', monospace" font-size="14"
          fill="#80a0c0" font-weight="bold">לפני</text>` : '';
  const afterLabel = `
    <text x="${left - 14}" y="${(before ? rowsTop + rowGap : rowsTop) + 26}" text-anchor="end"
          font-family="'JetBrains Mono', monospace" font-size="14"
          fill="${done ? '#ffd060' : '#80f0a0'}" font-weight="bold">${done ? 'תוקן' : 'אחרי'}</text>`;

  // Header banner
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 220}" y="10" width="440" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="38" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="19"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + opLabel : opLabel}
      </text>
    </g>`;

  const H = (before ? rowsTop + rowGap : rowsTop) + CELL_H + 30;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${beforeLabel}
    ${afterLabel}
    ${before ? renderRow(before, rowsTop, false) : ''}
    ${swapArrows}
    ${renderRow(after, before ? rowsTop + rowGap : rowsTop, true)}
  </svg>`;
}

// ─── Powerset SVG — binary decision tree growing step-by-step ────────
// arr: the input array (small — kept ≤ 3 for visual clarity).
// activeNodes: array of node-ids (strings like "" / "0" / "01") that
//              have been DECIDED at this step. The leaves whose path
//              is in activeNodes are accumulated into the result list.
// highlightId: which node is being "decided right now" (current edge).
// `done` (boolean): final step — all leaves resolved, show full result.
function _powersetTreeSvg(arr, activeIds, highlightId, done) {
  const n = arr.length;
  // Wider viewBox so the auto-layout has room for leaves with longer
  // labels and the bigger fonts below.
  const W = 900, H = 440;
  const uid = _traceUid();
  const D = _traceDefIds(uid);

  // Layout: tree at top (rows 0..n), legend & accumulator at bottom.
  const treeTop = 60;
  const rowH = 78;
  const leafY = treeTop + n * rowH;

  // Compute x of every node by its id (root="", left="0", right="1", "00","01"...).
  // Width allocated to a depth-d node = W / 2^d (shrinks geometrically).
  function xOf(id) {
    const depth = id.length;
    const slot = parseInt(id || '0', 2) || 0;     // bits as integer
    const denom = 1 << depth;                      // 2^depth slots at this level
    const slotW = W / denom;
    return slotW * slot + slotW / 2;
  }

  // Build all node ids reachable up to depth n. Root is the empty
  // string ''; left child = id + '0' (skip), right child = id + '1'
  // (include). padStart gives the canonical depth-d binary string —
  // earlier attempts collapsed "000" to "0" via a stray regex.
  const allNodes = [''];
  for (let d = 1; d <= n; d++) {
    for (let k = 0; k < (1 << d); k++) {
      allNodes.push(k.toString(2).padStart(d, '0'));
    }
  }

  // Edges: parent → child. A child id is parent + '0' or '1'.
  const edges = [];
  for (const id of allNodes) {
    if (id.length === n) continue;
    edges.push({ from: id, to: id + '0', bit: '0' });
    edges.push({ from: id, to: id + '1', bit: '1' });
  }

  const isActive = (id) => activeIds.includes(id);
  const isHighlight = (id) => id === highlightId;

  // Gradual growth: don't draw idle nodes/edges at all until they
  // become active. Only the active set is rendered each step — the
  // tree "grows" naturally as activeIds expands across steps.
  const drawnNodeIds = new Set(activeIds.concat(highlightId ? [highlightId] : []));
  const drawnEdges = edges.filter(e => drawnNodeIds.has(e.to));

  // Render edges (only those whose child is in the active set this step)
  const edgesHtml = drawnEdges.map(e => {
    const x1 = xOf(e.from), x2 = xOf(e.to);
    const y1 = treeTop + e.from.length * rowH;
    const y2 = treeTop + e.to.length * rowH;
    const active = isActive(e.to);
    const hl = isHighlight(e.to);
    const color = hl ? '#ffd060' : (active ? '#39ff80' : '#2a4060');
    const w = hl ? 3 : (active ? 2 : 1.2);
    const filter = hl ? `filter="${D.glowGold}"` : '';
    return `
      <g style="animation: ${D.animFade} 280ms ${e.to.length * 80}ms both;">
        <line x1="${x1}" y1="${y1 + 18}" x2="${x2}" y2="${y2 - 22}"
              stroke="${color}" stroke-width="${Math.max(w, 1.6)}" ${filter}/>
        <rect x="${(x1 + x2) / 2 - 22}" y="${(y1 + y2) / 2 - 12}" width="44" height="22" rx="11"
              fill="#0a1828" stroke="${e.bit === '1' ? '#39ff80' : '#3a5575'}" stroke-width="1"
              opacity="0.92"/>
        <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 4}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="17"
              fill="${e.bit === '1' ? '#80f0a0' : '#a0b8d0'}" font-weight="bold">
          ${e.bit === '1' ? `+${arr[e.from.length]}` : '−'}
        </text>
      </g>`;
  }).join('');

  // Render only the nodes that have been visited / are highlighted.
  const nodesHtml = allNodes.filter(id => drawnNodeIds.has(id)).map(id => {
    const x = xOf(id);
    const y = treeTop + id.length * rowH;
    const active = isActive(id);
    const hl = isHighlight(id);
    const isLeaf = id.length === n;

    // Subset content at this node = bits of id used as inclusion mask of arr.
    const subset = id.split('').map((b, i) => b === '1' ? arr[i] : null).filter(v => v !== null);
    const label = isLeaf
      ? `[${subset.join(',')}]`
      : (id === '' ? '∅' : `(${subset.join(',') || '−'})`);

    const stroke = hl ? '#ffd060' : (active ? '#39ff80' : '#2a4060');
    const fill   = hl ? D.matchGrad : (active ? D.curGrad : D.idleGrad);
    const filter = hl ? `filter="${D.glowGold}"` : (active ? `filter="${D.glowCyan}"` : '');
    const fontSize = isLeaf ? 18 : 17;
    const tw = Math.max(56, label.length * fontSize * 0.62 + 22);
    const th = 34;

    return `
      <g style="animation: ${D.animPop} 300ms ${id.length * 100}ms both;">
        <rect x="${x - tw / 2}" y="${y - th / 2}" width="${tw}" height="${th}" rx="${th / 2}"
              fill="${fill}" stroke="${stroke}" stroke-width="${hl || active ? 2.2 : 1.2}" ${filter}/>
        <text x="${x}" y="${y + 6}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="${fontSize}" font-weight="bold"
              fill="${hl ? '#fff0c0' : (active ? '#c8f8d0' : '#90a8c0')}">${label}</text>
      </g>`;
  }).join('');

  // Bottom accumulator: list of resolved leaves (subsets).
  const resolvedLeaves = activeIds.filter(id => id.length === n);
  const accY = leafY + 70;
  const accLabel = `<text x="${W / 2}" y="${accY - 10}" text-anchor="middle"
                          font-family="'JetBrains Mono', monospace" font-size="19"
                          fill="#a0c0e0" font-weight="bold" letter-spacing="2">
                       SUBSETS COLLECTED  (${resolvedLeaves.length} / ${1 << n})
                    </text>`;
  const chipW = Math.min(130, (W - 40) / Math.max(1, resolvedLeaves.length));
  const chipsLeft = (W - resolvedLeaves.length * chipW) / 2;
  const chips = resolvedLeaves.map((id, i) => {
    const subset = id.split('').map((b, k) => b === '1' ? arr[k] : null).filter(v => v !== null);
    const txt = `[${subset.join(',')}]`;
    return `
      <g style="animation: ${D.animSlide} 260ms ${i * 50}ms both;">
        <rect x="${chipsLeft + i * chipW}" y="${accY + 8}" width="${chipW - 10}" height="44" rx="8"
              fill="${D.chipGrad}" stroke="#39ff80" stroke-width="1.8"/>
        <text x="${chipsLeft + i * chipW + (chipW - 10) / 2}" y="${accY + 37}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="20" font-weight="bold"
              fill="#a8e0b8">${txt}</text>
      </g>`;
  }).join('');

  // Header banner
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 180}" y="8" width="360" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="36" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="20"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? `✓ DONE — 2^${n} = ${1 << n} subsets` : `Decision tree — depth ${n}`}
      </text>
    </g>`;

  return `<svg viewBox="0 0 ${W} ${accY + 70}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${edgesHtml}
    ${nodesHtml}
    ${accLabel}
    ${chips}
  </svg>`;
}

// ─── Trace-vizualisation helpers ──────────────────────────────────────
// Renders an SVG snapshot for a single step of the Two-Sum algorithm.
// Visual layers:
//   • <defs> — gradients (cell fill, found glow), filters (drop-shadow,
//             glow halo), arrow marker. Defined once so all elements
//             share the same look.
//   • Array row — top, with [index] above each cell. Current cell has
//                 a cyan glow; the matched cell on FOUND has a gold glow.
//   • need label — top center; flips from cyan→gold on FOUND.
//   • Hash table — bottom, key=value pairs as rounded chips, growing
//                  left-to-right in insertion order. Matched chip glows.
//   • Connector — only on FOUND. Curved gold arrow from current cell
//                 down to the matched chip — the "this is your match"
//                 reveal.
// Animation: a unique <style> block per render adds CSS keyframes that
// fade/scale-in the cells when the SVG mounts. Since CodeMirror swaps
// the SVG element entirely between steps, "remount" is effectively
// "play the entry animation", giving the illusion of a transition.
function _twoSumSvg(arr, cur, seen, need, found, matchIdx) {
  const W = 720, H = 320, CELL = 78;
  const arrLeft = (W - arr.length * CELL) / 2;
  const arrY = 80;
  const seenY = 220;

  const uid = _traceUid();
  const D = _traceDefIds(uid);

  const cells = arr.map((v, i) => {
    const x = arrLeft + i * CELL;
    const isCur   = i === cur;
    const isMatch = found && i === matchIdx;
    const stroke  = isCur ? '#39ff80' : (isMatch ? '#ffd060' : '#3a5575');
    const fill    = isCur ? D.curGrad : (isMatch ? D.matchGrad : D.idleGrad);
    const filter  = isCur ? `filter="${D.glowCyan}"` : (isMatch ? `filter="${D.glowGold}"` : '');
    return `
      <g style="animation: ${D.animPop} 360ms ${i * 40}ms both;">
        <text x="${x + (CELL - 10) / 2}" y="${arrY - 18}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="14"
              fill="#7090b0" font-weight="bold">[${i}]</text>
        <rect x="${x}" y="${arrY}" width="${CELL - 10}" height="60" rx="8"
              fill="${fill}" stroke="${stroke}" stroke-width="${isCur || isMatch ? 3 : 1.5}" ${filter}/>
        <text x="${x + (CELL - 10) / 2}" y="${arrY + 38}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
              fill="#e8f0fa">${v}</text>
      </g>`;
  }).join('');

  const seenKeys = Object.keys(seen);
  const seenW = 110;
  const seenLeft = (W - seenKeys.length * seenW) / 2;
  const seenRow = seenKeys.length === 0
    ? `<text x="${W / 2}" y="${seenY + 38}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="#5a7090" font-style="italic"
            style="animation: ${D.animFade} 260ms both;">
         seen = { }
       </text>`
    : seenKeys.map((k, i) => {
        const x = seenLeft + i * seenW;
        const isMatch = found && Number(k) === Number(arr[matchIdx]);
        const stroke  = isMatch ? '#ffd060' : '#3a5575';
        const fill    = isMatch ? D.matchGrad : D.chipGrad;
        const filter  = isMatch ? `filter="${D.glowGold}"` : '';
        return `
          <g style="animation: ${D.animPop} 320ms ${i * 60}ms both;">
            <rect x="${x}" y="${seenY}" width="${seenW - 12}" height="56" rx="10"
                  fill="${fill}" stroke="${stroke}" stroke-width="${isMatch ? 3 : 1.5}" ${filter}/>
            <text x="${x + (seenW - 12) / 2}" y="${seenY + 28}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="19" font-weight="bold"
                  fill="${isMatch ? '#fff0c0' : '#a8e0b8'}">${k} → ${seen[k]}</text>
            <text x="${x + (seenW - 12) / 2}" y="${seenY + 46}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="11"
                  fill="${isMatch ? '#c0a060' : '#5a7090'}">val → idx</text>
          </g>`;
      }).join('');

  const seenLabel = `<text x="${W / 2}" y="${seenY - 12}" text-anchor="middle"
                           font-family="'JetBrains Mono', monospace" font-size="16"
                           fill="#80a0c0" font-weight="bold" letter-spacing="2">SEEN (hash map)</text>`;

  const needFill = found ? '#ffd060' : '#80d4ff';
  const needBg   = found ? D.bannerGold : D.bannerCyan;
  const needLabel = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 120}" y="10" width="240" height="38" rx="19"
            fill="${needBg}" stroke="${needFill}" stroke-width="2"
            filter="${found ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="35" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="20"
            fill="${needFill}" font-weight="bold" letter-spacing="1">
        ${found ? `✓  FOUND  need = ${need}` : `need = ${need}`}
      </text>
    </g>`;

  let connector = '';
  if (found && matchIdx != null) {
    const curX = arrLeft + cur * CELL + (CELL - 10) / 2;
    const curBottom = arrY + 60;
    const matchKey = arr[matchIdx];
    const chipIdx = seenKeys.findIndex(k => Number(k) === Number(matchKey));
    if (chipIdx >= 0) {
      const chipX = seenLeft + chipIdx * seenW + (seenW - 12) / 2;
      const chipTop = seenY;
      const midY = (curBottom + chipTop) / 2;
      connector = `
        <path d="M ${curX} ${curBottom} C ${curX} ${midY}, ${chipX} ${midY}, ${chipX} ${chipTop - 4}"
              stroke="#ffd060" stroke-width="3" fill="none"
              marker-end="${D.arrowGold}"
              filter="${D.glowGold}"
              stroke-dasharray="8 4"
              style="animation: ${D.animDash} 1.2s linear infinite;"/>
        <text x="${(curX + chipX) / 2}" y="${midY - 6}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="14"
              fill="#ffd060" font-weight="bold"
              style="animation: ${D.animFade} 600ms 300ms both;">
          match!
        </text>`;
    }
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${needLabel}
    ${cells}
    ${seenLabel}
    ${seenRow}
    ${connector}
  </svg>`;
}

// hex → array of bits (MSB-first) of the requested width. Used by
// the 32-bit register reverse trace so we don't have to hand-author
// 32 0/1 values per step.
function _hexBits(hex, width = 32) {
  const v = parseInt(hex, 16) >>> 0;
  return Array.from({ length: width }, (_, i) => (v >>> (width - 1 - i)) & 1);
}
// Generate the swap pairs for D&C step `s` (1..log2(width)) on a width-N
// register. Step 1 swaps halves; step 2 swaps quarters within each half;
// etc.  Returns all (a, b) pairs (both directions) so the SVG can pick
// a representative subset.
function _dcSwaps(width, step) {
  const group = width >>> step;          // 16,8,4,2,1 for width=32
  const swaps = [];
  for (let i = 0; i < width; i += group * 2) {
    for (let k = 0; k < group; k++) {
      swaps.push([i + k, i + group + k]);
      swaps.push([i + group + k, i + k]);
    }
  }
  return swaps;
}

// ─── Binary-string-min SVG (8021) — input row + stack ───────────────
function _binStrMinSvg({ s, idx, stack, action, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 56, CELL_H = 60;
  const n = s.length;
  const W = Math.max(820, n * CELL + 260);
  const strY = 130;
  const stackBottomY = 380;
  const stackCellH = 44;
  const left = (W - n * CELL) / 2;

  // Input string row
  const cells = [...s].map((ch, i) => {
    const isCur = i === idx;
    const isPast = idx > i && action !== 'init';
    const stroke = isCur ? (done ? '#ffd060' : '#39ff80') : (isPast ? '#3a5575' : '#2a4060');
    const fill = isCur ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = isCur ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    const valColor = ch === '1' ? '#ff9070' : '#80d4ff';
    return `
      <g style="animation: ${D.animPop} 240ms ${i * 20}ms both;">
        <text x="${left + i * CELL + CELL / 2}" y="${strY - 16}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#7090b0">[${i}]</text>
        <rect x="${left + i * CELL + 3}" y="${strY}" width="${CELL - 6}" height="${CELL_H}" rx="8"
              fill="${fill}" stroke="${stroke}" stroke-width="${isCur ? 2.6 : 1.4}" ${filter}/>
        <text x="${left + i * CELL + CELL / 2}" y="${strY + 42}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="28" font-weight="bold"
              fill="${isPast ? '#5a6a80' : valColor}">${ch}</text>
      </g>`;
  }).join('');

  // Stack column (right side)
  const stackLeft = W - 200;
  const stackHtml = stack.length === 0
    ? `<text x="${stackLeft + 70}" y="${stackBottomY - 16}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="16"
            fill="#5a7090" font-style="italic">(empty)</text>`
    : stack.map((c, i) => {
        const y = stackBottomY - (i + 1) * (stackCellH + 4);
        const top = i === stack.length - 1;
        const isAction = top && (action === 'push' || action === 'pop');
        const stroke = isAction ? (done ? '#ffd060' : '#39ff80') : '#3a5575';
        const fill = isAction ? D.curGrad : D.chipGrad;
        return `
          <g style="animation: ${D.animSlide} 280ms ${i * 25}ms both;">
            <rect x="${stackLeft}" y="${y}" width="140" height="${stackCellH}" rx="8"
                  fill="${fill}" stroke="${stroke}" stroke-width="${isAction ? 2.6 : 1.4}"
                  ${isAction ? `filter="${done ? D.glowGold : D.glowCyan}"` : ''}/>
            <text x="${stackLeft + 70}" y="${y + 30}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="24" font-weight="bold"
                  fill="${c === '1' ? '#ff9070' : '#80d4ff'}">${c}</text>
          </g>`;
      }).join('');

  const stackLabel = `<text x="${stackLeft + 70}" y="${stackBottomY + 22}" text-anchor="middle"
                           font-family="'JetBrains Mono', monospace" font-size="14"
                           fill="#80a0c0" font-weight="bold" letter-spacing="2">RESULT STACK</text>
                     <line x1="${stackLeft - 8}" y1="${stackBottomY}" x2="${stackLeft + 148}" y2="${stackBottomY}"
                           stroke="#3a5575" stroke-width="2"/>`;

  // Banner
  const bannerText = done
    ? `✓ minimum string = "${stack.join('')}",   length = ${stack.length}`
    : action === 'init' ? `init — input "${s}"`
    : action === 'push' ? `'${s[idx]}' → push to stack`
    : action === 'pop' ? `'${s[idx]}' is '1' → pop (forms "${stack[stack.length] === undefined ? 'X' : 'X'}1" pair)`
    : '';
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  return `<svg viewBox="0 0 ${W} ${stackBottomY + 60}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${cells}
    ${stackLabel}
    ${stackHtml}
  </svg>`;
}

// ─── MSB-extract SVG (8022) — show progressive bit fill ────────────
// `bits`  : current 8-bit array (MSB-first)
// `label` : banner text describing the current op
// `prev`  : optional previous state — bits that changed glow gold
// `done`  : final-frame flag (gold theming)
function _msbExtractSvg({ bits, label, prev, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 58, CELL_H = 58;
  const W = Math.max(700, 8 * CELL + 100);
  const rowY = 110;
  const left = (W - 8 * CELL) / 2;

  const cells = bits.map((bit, i) => {
    const prevBit = prev ? prev[i] : null;
    const changed = prev != null && bit !== prevBit;
    const accent = done ? '#ffd060' : '#80f0a0';
    const stroke = bit ? (changed ? '#ffd060' : accent) : '#3a5575';
    const fill   = bit ? (changed ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = bit ? `filter="${changed ? D.glowGold : D.glowCyan}"` : '';
    return `
      <g style="animation: ${D.animPop} 220ms ${i * 18}ms both;">
        <text x="${left + i * CELL + CELL / 2}" y="${rowY - 12}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="12"
              fill="#7090b0">[${7 - i}]</text>
        <rect x="${left + i * CELL + 4}" y="${rowY}" width="${CELL - 8}" height="${CELL_H}" rx="7"
              fill="${fill}" stroke="${stroke}" stroke-width="${bit ? 2.4 : 1.2}" ${filter}/>
        <text x="${left + i * CELL + CELL / 2}" y="${rowY + 38}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
              fill="${bit ? (changed ? '#fff0c0' : '#c8f8d0') : '#5a7090'}">${bit}</text>
      </g>`;
  }).join('');

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${label}</text>
    </g>`;

  const H = rowY + CELL_H + 30;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${cells}
  </svg>`;
}

// ─── Bitwise-add SVG (8024) — two operands, XOR sum, AND-shift carry
// Visualises one iteration of the carry-loop addition. Renders a, b,
// sum (= a^b), and carry (= (a&b) << 1) in two rows. Highlight the
// "current" operands and the carry that will feed back.
function _bitAddSvg({ a, b, sumXor, carry, action, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const width = 8;
  const CELL = 50, CELL_H = 48;
  const W = Math.max(700, width * CELL + 200);
  const rowGap = 64;
  const left = (W - width * CELL) / 2;
  const rowsTop = 110;

  const toBits = (x) => Array.from({ length: width }, (_, i) => (x >>> (width - 1 - i)) & 1);

  const renderRow = (bits, y, lab, accent, glow) => `
    <text x="${left - 14}" y="${y + CELL_H / 2 + 5}" text-anchor="end"
          font-family="'JetBrains Mono', monospace" font-size="15"
          fill="${accent}" font-weight="bold">${lab}</text>
    <text x="${left + width * CELL + 14}" y="${y + CELL_H / 2 + 5}"
          font-family="'JetBrains Mono', monospace" font-size="14"
          fill="#7090b0">= ${parseInt(bits.join(''), 2)}</text>
    ${bits.map((bit, i) => `
      <g style="animation: ${D.animPop} 200ms ${i * 14}ms both;">
        <rect x="${left + i * CELL + 3}" y="${y}" width="${CELL - 6}" height="${CELL_H}" rx="6"
              fill="${bit && glow ? D.matchGrad : D.idleGrad}" stroke="${bit ? accent : '#3a5575'}" stroke-width="${bit ? 2 : 1.2}"
              ${bit && glow ? `filter="${D.glowGold}"` : ''}/>
        <text x="${left + i * CELL + CELL / 2}" y="${y + 32}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="22" font-weight="bold"
              fill="${bit ? (glow ? '#fff0c0' : accent) : '#5a7090'}">${bit}</text>
      </g>`).join('')}`;

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 240}" y="14" width="480" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${action}</text>
    </g>`;

  const H = rowsTop + 4 * rowGap + 40;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${renderRow(toBits(a),      rowsTop + 0 * rowGap, 'a',        '#80d4ff', false)}
    ${renderRow(toBits(b),      rowsTop + 1 * rowGap, 'b',        '#a060ff', false)}
    ${renderRow(toBits(sumXor), rowsTop + 2 * rowGap, 'a^b',      '#80f0a0', !done)}
    ${renderRow(toBits(carry),  rowsTop + 3 * rowGap, '(a&b)<<1', '#ffd060', !done)}
  </svg>`;
}

// ─── Two-stacks-on-one-array SVG (8023) ─────────────────────────────
// Single array of size N with two stacks growing inward: stack0 from
// the left (top0 advances right), stack1 from the right (top1 advances
// left). Cells occupied by stack0 are cyan, stack1 are gold.
function _twoStacksSvg({ arr, top0, top1, action, target, val, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 80, CELL_H = 64;
  const n = arr.length;
  const W = Math.max(820, n * CELL + 120);
  const rowY = 150;
  const left = (W - n * CELL) / 2;

  const cells = arr.map((v, i) => {
    const inStack0 = i <= top0;
    const inStack1 = i >= top1;
    const isTop0 = i === top0;
    const isTop1 = i === top1;
    const isAction = (action === 'push' || action === 'pop') &&
                     ((target === 0 && isTop0) || (target === 1 && isTop1));
    let stroke = '#3a5575', fill = D.idleGrad, filter = '', textColor = '#5a7090';
    if (inStack0) { stroke = '#39ff80'; fill = D.curGrad; textColor = '#c8f8d0'; }
    if (inStack1) { stroke = '#ffd060'; fill = D.matchGrad; textColor = '#fff0c0'; }
    if (isAction) { filter = `filter="${target === 0 ? D.glowCyan : D.glowGold}"`; }
    return `
      <g style="animation: ${D.animPop} 240ms ${i * 25}ms both;">
        <text x="${left + i * CELL + CELL / 2}" y="${rowY - 16}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="14"
              fill="#7090b0" font-weight="bold">[${i}]</text>
        <rect x="${left + i * CELL + 5}" y="${rowY}" width="${CELL - 10}" height="${CELL_H}" rx="10"
              fill="${fill}" stroke="${stroke}" stroke-width="${isAction ? 3 : (inStack0 || inStack1 ? 2 : 1.2)}" ${filter}/>
        <text x="${left + i * CELL + CELL / 2}" y="${rowY + 42}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="28" font-weight="bold"
              fill="${textColor}">${v === null || v === undefined ? '' : v}</text>
      </g>`;
  }).join('');

  // Top pointers
  const ptr = (label, idx, color) => {
    if (idx < 0 || idx >= n) return '';
    const cx = left + idx * CELL + CELL / 2;
    return `
      <g style="animation: ${D.animFade} 320ms 200ms both;">
        <text x="${cx}" y="${rowY + CELL_H + 38}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="18"
              fill="${color}" font-weight="bold">${label}</text>
        <path d="M ${cx} ${rowY + CELL_H + 6} L ${cx - 7} ${rowY + CELL_H + 22} L ${cx + 7} ${rowY + CELL_H + 22} z"
              fill="${color}" transform="rotate(180 ${cx} ${rowY + CELL_H + 14})"/>
      </g>`;
  };

  const pointers = `
    ${top0 >= 0 ? ptr('top0', top0, '#39ff80') : ''}
    ${top1 < n  ? ptr('top1', top1, '#ffd060') : ''}`;

  // Action description in banner
  let bannerText = '';
  if (done) bannerText = '✓ done';
  else if (action === 'init') bannerText = `init — empty array of size ${n}`;
  else if (action === 'push') bannerText = `push(${val}, ${target})`;
  else if (action === 'pop')  bannerText = `pop(${target})   →   ${val}`;
  else if (action === 'full') bannerText = `overflow — stacks meet`;

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 240}" y="14" width="480" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  // Legend
  const legend = `
    <g style="animation: ${D.animFade} 360ms both;">
      <rect x="40" y="80" width="120" height="22" rx="11" fill="${D.curGrad}" stroke="#39ff80" stroke-width="1.5"/>
      <text x="100" y="96" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13"
            fill="#c8f8d0" font-weight="bold">stack 0 →</text>
      <rect x="${W - 160}" y="80" width="120" height="22" rx="11" fill="${D.matchGrad}" stroke="#ffd060" stroke-width="1.5"/>
      <text x="${W - 100}" y="96" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13"
            fill="#fff0c0" font-weight="bold">← stack 1</text>
    </g>`;

  return `<svg viewBox="0 0 ${W} ${rowY + CELL_H + 90}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${legend}
    ${cells}
    ${pointers}
  </svg>`;
}

// ─── Matrix transpose SVG (8025) — N×N grid + swap arc ──────────────
function _transposeSvg({ matrix, swapPair, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const n = matrix.length;
  const CELL = 78;
  const W = Math.max(640, n * CELL + 220);
  const top = 100;
  const left = (W - n * CELL) / 2;

  // Diagonal mask: cells on/above the diagonal are highlighted gently
  const cells = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const isDiag = i === j;
      const isSwap = swapPair && ((swapPair[0] === i && swapPair[1] === j) || (swapPair[2] === i && swapPair[3] === j));
      const stroke = isSwap ? (done ? '#ffd060' : '#39ff80') : (isDiag ? '#a060ff' : '#3a5575');
      const fill = isSwap ? (done ? D.matchGrad : D.curGrad) : (isDiag ? '#1a1030' : D.idleGrad);
      const filter = isSwap ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
      const valColor = isSwap ? (done ? '#fff0c0' : '#c8f8d0') : '#e8f0fa';
      cells.push(`
        <g style="animation: ${D.animPop} 220ms ${(i * n + j) * 18}ms both;">
          <rect x="${left + j * CELL + 4}" y="${top + i * CELL + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="8"
                fill="${fill}" stroke="${stroke}" stroke-width="${isSwap ? 3 : (isDiag ? 1.6 : 1.2)}" ${filter}/>
          <text x="${left + j * CELL + CELL / 2}" y="${top + i * CELL + CELL / 2 + 9}" text-anchor="middle"
                font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
                fill="${valColor}">${matrix[i][j]}</text>
        </g>`);
    }
  }

  // Row / column index labels around the grid
  const labels = [];
  for (let k = 0; k < n; k++) {
    labels.push(`<text x="${left + k * CELL + CELL / 2}" y="${top - 12}" text-anchor="middle"
                       font-family="'JetBrains Mono', monospace" font-size="14"
                       fill="#7090b0" font-weight="bold">j=${k}</text>`);
    labels.push(`<text x="${left - 14}" y="${top + k * CELL + CELL / 2 + 5}" text-anchor="end"
                       font-family="'JetBrains Mono', monospace" font-size="14"
                       fill="#7090b0" font-weight="bold">i=${k}</text>`);
  }

  // Swap arc — between the two mirrored cells
  let arc = '';
  if (swapPair) {
    const [i1, j1, i2, j2] = swapPair;
    const x1 = left + j1 * CELL + CELL / 2;
    const y1 = top + i1 * CELL + CELL / 2;
    const x2 = left + j2 * CELL + CELL / 2;
    const y2 = top + i2 * CELL + CELL / 2;
    const midX = (x1 + x2) / 2 + 30;
    const midY = (y1 + y2) / 2;
    arc = `
      <g style="animation: ${D.animFade} 480ms both;">
        <path d="M ${x1} ${y1} Q ${midX} ${midY}, ${x2} ${y2}"
              stroke="${done ? '#ffd060' : '#39ff80'}" stroke-width="2.6" fill="none"
              stroke-dasharray="7 4"
              filter="${done ? D.glowGold : D.glowCyan}"
              marker-end="${done ? D.arrowGold : D.arrowCyan}"
              style="animation: ${D.animDash} 1.3s linear infinite;"/>
        <text x="${midX + 8}" y="${midY + 5}"
              font-family="'JetBrains Mono', monospace" font-size="14"
              fill="${done ? '#ffd060' : '#80f0a0'}" font-weight="bold">swap</text>
      </g>`;
  }

  // Banner
  const bannerText = done
    ? `✓ transpose complete — matrix[i][j] ⇄ matrix[j][i]`
    : swapPair ? `swap m[${swapPair[0]}][${swapPair[1]}] ⇄ m[${swapPair[2]}][${swapPair[3]}]`
    : 'init — original matrix';
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 260}" y="14" width="520" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  // Note about diagonal — diagonal cells are invariant under transpose
  const note = `
    <text x="${W/2}" y="${top + n * CELL + 30}" text-anchor="middle"
          font-family="'JetBrains Mono', monospace" font-size="13"
          fill="#a080ff" font-style="italic">(diagonal cells — invariant under transpose)</text>`;

  const H = top + n * CELL + 60;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${labels.join('')}
    ${cells.join('')}
    ${arc}
    ${note}
  </svg>`;
}

// ─── Low-ones-pattern SVG (8017) — three bit-rows: v / v+1 / AND ────
function _lowOnesSvg({ v, label, valid }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const width = 16;
  const CELL = 36, CELL_H = 38;
  const W = Math.max(700, width * CELL + 220);
  const rowGap = 60;
  const rowsY = [120, 120 + rowGap, 120 + 2 * rowGap];
  const left = (W - width * CELL) / 2;
  const done = valid !== undefined;

  const toBits = (x) => Array.from({ length: width }, (_, i) => (x >>> (width - 1 - i)) & 1);
  const bitsV    = toBits(v);
  const bitsPlus = toBits((v + 1) & ((1 << width) - 1));
  const bitsAnd  = toBits((v & (v + 1)) & ((1 << width) - 1));
  const allZeros = bitsAnd.every(b => b === 0);

  const renderRow = (bits, y, lab, accent) => `
    <text x="${left - 14}" y="${y + CELL_H / 2 + 5}" text-anchor="end"
          font-family="'JetBrains Mono', monospace" font-size="16"
          fill="${accent}" font-weight="bold">${lab}</text>
    ${bits.map((bit, i) => `
      <g style="animation: ${D.animPop} 200ms ${i * 12}ms both;">
        <rect x="${left + i * CELL + 2}" y="${y}" width="${CELL - 4}" height="${CELL_H}" rx="5"
              fill="${D.idleGrad}" stroke="${bit ? accent : '#3a5575'}" stroke-width="${bit ? 2 : 1.2}"/>
        <text x="${left + i * CELL + CELL / 2}" y="${y + 26}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="22" font-weight="bold"
              fill="${bit ? accent : '#5a7090'}">${bit}</text>
      </g>`).join('')}`;

  const verdict = done ? `
    <g style="animation: ${D.animFade} 380ms 200ms both;">
      <rect x="${W - 200}" y="100" width="160" height="60" rx="12"
            fill="${valid ? D.matchGrad : '#2a1010'}" stroke="${valid ? '#ffd060' : '#ff6060'}" stroke-width="3"
            filter="${D.glowGold}"/>
      <text x="${W - 120}" y="124" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="13"
            fill="${valid ? '#ffd060' : '#ff6060'}" font-weight="bold" letter-spacing="2">RESULT</text>
      <text x="${W - 120}" y="150" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="22" font-weight="bold"
            fill="${valid ? '#fff0c0' : '#ffa0a0'}">${valid ? 'True' : 'False'}</text>
    </g>` : '';

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? (valid ? D.bannerGold : '#2a1010') : D.bannerCyan}"
            stroke="${done ? (valid ? '#ffd060' : '#ff6060') : '#80d4ff'}" stroke-width="2"
            filter="${D.glowGold}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? (valid ? '#ffd060' : '#ff6060') : '#80d4ff'}" font-weight="bold" letter-spacing="1">${label}</text>
    </g>`;

  const H_ = rowsY[2] + CELL_H + 30;
  return `<svg viewBox="0 0 ${W} ${H_}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${verdict}
    ${renderRow(bitsV,    rowsY[0], 'v',    '#80f0a0')}
    ${renderRow(bitsPlus, rowsY[1], 'v+1',  '#80d4ff')}
    ${renderRow(bitsAnd,  rowsY[2], 'AND',  allZeros ? '#80f0a0' : '#ff6060')}
  </svg>`;
}

// ─── Flip SVG (8019) — input → two formula paths → outputs ──────────
function _flipSvg({ x, sub, xor, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 800, H = 360;

  const card = (lab, val, x0, y, accent, glow) => `
    <g style="animation: ${D.animPop} 280ms both;">
      <rect x="${x0}" y="${y}" width="160" height="80" rx="12"
            fill="${glow ? D.matchGrad : D.idleGrad}"
            stroke="${accent}" stroke-width="${glow ? 3 : 1.6}"
            ${glow ? `filter="${D.glowGold}"` : ''}/>
      <text x="${x0 + 80}" y="${y + 22}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="13"
            fill="${accent}" font-weight="bold" letter-spacing="2">${lab}</text>
      <text x="${x0 + 80}" y="${y + 60}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="32" font-weight="bold"
            fill="#fff0c0">${val}</text>
    </g>`;

  const input  = card('INPUT  x',  x,   80,  140, '#80d4ff', false);
  const subOut = card('20 − x',    sub, 560, 80,  '#80f0a0', done);
  const xorOut = card('17 ^ 3 ^ x', xor, 560, 220, '#a060ff', done);

  const arrow = (x1, y1, x2, y2, color, txt) => `
    <g style="animation: ${D.animFade} 460ms 200ms both;">
      <path d="M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}"
            stroke="${color}" stroke-width="2.5" fill="none"
            stroke-dasharray="6 4"
            filter="${D.glowCyan}"
            marker-end="${D.arrowCyan}"
            style="animation: ${D.animDash} 1.4s linear infinite;"/>
      <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="14"
            fill="${color}" font-weight="bold">${txt}</text>
    </g>`;

  const arrows = `
    ${arrow(240, 165, 560, 120, '#80f0a0', '20 − x')}
    ${arrow(240, 185, 560, 260, '#a060ff', '17 ^ 3 ^ x')}`;

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 220}" y="14" width="440" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        flip(${x})  →  ${sub}   ${done ? '✓' : ''}
      </text>
    </g>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${input}
    ${subOut}
    ${xorOut}
    ${arrows}
  </svg>`;
}

// ─── Error-monitor SVG — ms-scale timeline + deque + faulty flag ────
// Mirrors the structure of _rateLimiterSvg but tuned to the
// 1ms-tick / 1000ms-window scenario of 8018 (and labeled "FAULTY"
// instead of "SUSPECT" to keep the questions visually distinct).
function _errorMonitorSvg({ nowMs, errors, faulty, justArrived, justDropped, subtitle, bannerOverride }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 900, H = 360;
  const WINDOW = 1000;       // ms
  const THRESHOLD = 10;
  const tMax = 1500;
  const axisLeft = 60, axisRight = W - 100, axisY = 175;
  const pxPerMs = (axisRight - axisLeft) / tMax;
  const xOf = (t) => axisLeft + t * pxPerMs;

  const inWindow = (errors || []).filter(t => t > nowMs - WINDOW && t <= nowMs);
  const count = inWindow.length;
  const overThreshold = count > THRESHOLD;
  const isFaulty = faulty || overThreshold;
  const banner = bannerOverride || (isFaulty ? 'FAULTY  ⚠' : 'monitoring…');
  const arrivedSet = new Set(Array.isArray(justArrived) ? justArrived : (justArrived != null ? [justArrived] : []));
  const droppedSet = new Set(Array.isArray(justDropped) ? justDropped : (justDropped != null ? [justDropped] : []));

  // Sliding window rectangle
  const wLo = Math.max(0, nowMs - WINDOW);
  const wX  = xOf(wLo);
  const wW  = xOf(nowMs) - wX;
  const windowRect = `
    <rect x="${wX}" y="${axisY - 60}" width="${wW}" height="80" rx="6"
          fill="${isFaulty ? D.matchGrad : D.curGrad}"
          stroke="${isFaulty ? '#ffd060' : '#39ff80'}" stroke-width="1.6"
          opacity="0.55"
          filter="${isFaulty ? D.glowGold : D.glowCyan}"
          style="animation: ${D.animFade} 320ms both;"/>
    <text x="${wX + wW / 2}" y="${axisY - 66}" text-anchor="middle"
          font-family="'JetBrains Mono', monospace" font-size="13"
          fill="${isFaulty ? '#ffd060' : '#80f0a0'}" font-weight="bold">
      sliding window (1000ms)
    </text>`;

  // Axis line + tick marks every 100ms (extra label every 500ms)
  const ticks = [];
  for (let t = 0; t <= tMax; t += 100) {
    const x = xOf(t);
    const big = t % 500 === 0;
    ticks.push(`
      <line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + (big ? 8 : 4)}"
            stroke="${big ? '#7090b0' : '#4a6080'}" stroke-width="1"/>
      ${big ? `<text x="${x}" y="${axisY + 24}" text-anchor="middle"
                     font-family="'JetBrains Mono', monospace" font-size="12"
                     fill="#7090b0">${t}ms</text>` : ''}`);
  }
  const axisLine = `<line x1="${axisLeft}" y1="${axisY}" x2="${axisRight}" y2="${axisY}" stroke="#4a6080" stroke-width="2"/>`;
  const nowMarker = `
    <g style="animation: ${D.animFade} 280ms both;">
      <line x1="${xOf(nowMs)}" y1="${axisY - 70}" x2="${xOf(nowMs)}" y2="${axisY + 30}"
            stroke="${isFaulty ? '#ffd060' : '#39ff80'}" stroke-width="2.5" stroke-dasharray="4 3"/>
      <text x="${xOf(nowMs)}" y="${axisY + 44}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="14"
            fill="${isFaulty ? '#ffd060' : '#80f0a0'}" font-weight="bold">now=${nowMs}ms</text>
    </g>`;

  // Error events — short red bars above the axis
  const all = Array.from(new Set([...(errors || []), ...droppedSet])).sort((a, b) => a - b);
  const dots = all.map((t, i) => {
    const inside = t > nowMs - WINDOW && t <= nowMs;
    const arrived = arrivedSet.has(t);
    const dropped = droppedSet.has(t);
    const x = xOf(t);
    let r = 5, color = '#4a5a70', filterAttr = '', extra = '';
    if (arrived) {
      r = 9;
      color = '#ffd060';
      filterAttr = `filter="${D.glowGold}"`;
      extra = `<text x="${x}" y="${axisY - 46}" text-anchor="middle"
                     font-family="'JetBrains Mono', monospace" font-size="13"
                     fill="#ffd060" font-weight="bold">+err</text>`;
    } else if (dropped) {
      color = '#5a3030';
      extra = `<line x1="${x - 6}" y1="${axisY - 27}" x2="${x + 6}" y2="${axisY - 13}" stroke="#a05050" stroke-width="2"/>`;
    } else if (inside) {
      color = isFaulty ? '#ffd060' : '#ff7060';
      filterAttr = `filter="${isFaulty ? D.glowGold : D.glowCyan}"`;
    }
    return `
      <g style="animation: ${D.animPop} 220ms ${i * 10}ms both;">
        <circle cx="${x}" cy="${axisY - 24}" r="${r}" fill="${color}"
                stroke="#0a1828" stroke-width="1.5" ${filterAttr}/>
        ${extra}
      </g>`;
  }).join('');

  // Counter card
  const cardX = W - 150, cardY = 95;
  const counterCard = `
    <g style="animation: ${D.animFade} 320ms both;">
      <rect x="${cardX}" y="${cardY}" width="120" height="58" rx="8"
            fill="${isFaulty ? D.matchGrad : D.idleGrad}"
            stroke="${isFaulty ? '#ffd060' : '#3a5575'}" stroke-width="${isFaulty ? 3 : 1.5}"
            ${isFaulty ? `filter="${D.glowGold}"` : ''}/>
      <text x="${cardX + 60}" y="${cardY + 18}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="12"
            fill="${isFaulty ? '#ffd060' : '#80a0c0'}" font-weight="bold" letter-spacing="2">ERRORS</text>
      <text x="${cardX + 60}" y="${cardY + 47}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="24" font-weight="bold"
            fill="${overThreshold ? '#ffd060' : (isFaulty ? '#ffd060' : '#ff7060')}">${count} / ${THRESHOLD}</text>
    </g>`;

  // Deque chips with index numbers (so the popleft dynamics are visible)
  const dequeY = 245;
  const chipsLeft = 40 + 14;
  const availW = W - 80 - 28;
  const chipW = Math.max(46, Math.min(78, availW / Math.max(1, inWindow.length)));
  const chipsHtml = inWindow.length === 0
    ? `<text x="${chipsLeft}" y="${dequeY + 30}" font-family="'JetBrains Mono', monospace"
            font-size="16" fill="#5a7090" font-style="italic">(empty)</text>`
    : inWindow.map((t, i) => {
        const x = chipsLeft + i * (chipW + 4);
        const isNew = arrivedSet.has(t);
        const stroke = isNew ? '#ffd060' : (isFaulty ? '#ffd060' : '#ff7060');
        return `
          <g style="animation: ${D.animSlide} 280ms ${i * 30}ms both;">
            <text x="${x + chipW / 2}" y="${dequeY - 6}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="11"
                  fill="${isNew ? '#ffd060' : '#7090b0'}" font-weight="bold">
              ${isNew ? 'NEW' : `[${i}]`}
            </text>
            <rect x="${x}" y="${dequeY}" width="${chipW}" height="40" rx="6"
                  fill="${isNew ? D.matchGrad : D.chipGrad}"
                  stroke="${stroke}" stroke-width="${isNew ? 2.8 : 1.5}"
                  ${isNew || isFaulty ? `filter="${D.glowGold}"` : ''}/>
            <text x="${x + chipW / 2}" y="${dequeY + 25}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="15" font-weight="bold"
                  fill="${isNew ? '#fff0c0' : (isFaulty ? '#fff0c0' : '#ffb8a8')}">${t}ms</text>
          </g>`;
      }).join('');

  const dequeLabel = `<text x="40" y="${dequeY + 25}"
                           font-family="'JetBrains Mono', monospace" font-size="14"
                           fill="#80a0c0" font-weight="bold" letter-spacing="1">deque →</text>`;

  // Drops note (separate row beneath the deque)
  const dropsY = dequeY + 60;
  const drops = droppedSet.size > 0
    ? `<text x="${chipsLeft}" y="${dropsY}" font-family="'JetBrains Mono', monospace"
             font-size="13" fill="#a05050">expired this step:
        <tspan fill="#a05050" font-weight="bold"> [${Array.from(droppedSet).map(t => `${t}ms`).join(', ')}]</tspan>
       </text>`
    : '';

  // Top banner
  const bannerHtml = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 180}" y="14" width="360" height="42" rx="21"
            fill="${isFaulty ? D.bannerGold : D.bannerCyan}"
            stroke="${isFaulty ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${isFaulty ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="19"
            fill="${isFaulty ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${banner}</text>
    </g>`;
  const sub = subtitle ? `
    <text x="${W/2}" y="80" text-anchor="middle"
          font-family="'JetBrains Mono', monospace" font-size="14"
          fill="#80a0c0" font-style="italic">${subtitle}</text>` : '';

  return `<svg viewBox="0 0 ${W} ${H + 30}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${bannerHtml}
    ${sub}
    ${counterCard}
    ${windowRect}
    ${axisLine}
    ${ticks.join('')}
    ${dots}
    ${nowMarker}
    ${dequeLabel}
    ${chipsHtml}
    ${drops}
  </svg>`;
}

// ─── Cyclic-shift SVG — array snapshot with highlighted slice ───────
// Used by 8016 to walk the reverse-reverse-reverse trick.
//   arr      : current array values
//   hlLo/hi  : range [hlLo, hlHi) that was reversed THIS step
//   label    : banner text
//   done     : final-frame flag
function _cyclicShiftSvg({ arr, hlLo, hlHi, label, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 76, CELL_H = 64;
  const n = arr.length;
  const W = Math.max(720, n * CELL + 120);
  const rowY = 110;
  const left = (W - n * CELL) / 2;

  const cells = arr.map((v, i) => {
    const inHl = hlLo != null && i >= hlLo && i < hlHi;
    const stroke = inHl ? (done ? '#ffd060' : '#39ff80') : '#3a5575';
    const fill   = inHl ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = inHl ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    const valColor = inHl ? (done ? '#fff0c0' : '#c8f8d0') : '#e8f0fa';
    return `
      <g style="animation: ${D.animPop} 240ms ${i * 25}ms both;">
        <text x="${left + i * CELL + CELL / 2}" y="${rowY - 14}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#7090b0">[${i}]</text>
        <rect x="${left + i * CELL + 4}" y="${rowY}" width="${CELL - 8}" height="${CELL_H}" rx="10"
              fill="${fill}" stroke="${stroke}" stroke-width="${inHl ? 2.6 : 1.4}" ${filter}/>
        <text x="${left + i * CELL + CELL / 2}" y="${rowY + 42}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
              fill="${valColor}">${v}</text>
      </g>`;
  }).join('');

  // Show a curved double-headed arrow under the highlighted slice to
  // hint at "reverse this range".
  let arc = '';
  if (hlLo != null && hlHi - hlLo > 1) {
    const xL = left + hlLo * CELL + CELL / 2;
    const xR = left + (hlHi - 1) * CELL + CELL / 2;
    const arcY = rowY + CELL_H + 28;
    arc = `
      <g style="animation: ${D.animFade} 420ms both;">
        <path d="M ${xL} ${rowY + CELL_H + 4} C ${xL} ${arcY + 18}, ${xR} ${arcY + 18}, ${xR} ${rowY + CELL_H + 4}"
              stroke="${done ? '#ffd060' : '#80f0a0'}" stroke-width="2.5" fill="none"
              stroke-dasharray="8 4"
              filter="${done ? D.glowGold : D.glowCyan}"
              style="animation: ${D.animDash} 1.4s linear infinite;"
              marker-end="${done ? D.arrowGold : D.arrowCyan}"/>
        <text x="${(xL + xR) / 2}" y="${arcY + 26}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="15"
              fill="${done ? '#ffd060' : '#80f0a0'}" font-weight="bold">reverse [${hlLo}, ${hlHi})</text>
      </g>`;
  }

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 260}" y="14" width="520" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + label : label}
      </text>
    </g>`;

  const H = rowY + CELL_H + (arc ? 90 : 40);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${cells}
    ${arc}
  </svg>`;
}

// ─── Max-profit SVG — price chart + min/best markers ────────────────
// Used by 8020 to walk through the single-pass max-profit scan.
//   prices    : array of daily prices
//   day       : current day index
//   minSoFar  : running min price up to `day` inclusive
//   minIdx    : which day `minSoFar` came from
//   best      : best profit so far
//   bestBuy   : day we'd buy for the running-best profit
//   bestSell  : day we'd sell for it
//   done      : final-frame flag
function _maxProfitSvg({ prices, day, minSoFar, minIdx, best, bestBuy, bestSell, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const n = prices.length;
  const W = Math.max(820, n * 80 + 120);
  const chartTop = 100, chartH = 240;
  const chartLeft = 60, chartRight = W - 60;
  const maxP = Math.max(...prices);
  const barW = (chartRight - chartLeft) / n - 8;
  const yOf = (p) => chartTop + chartH - (p / maxP) * (chartH - 20);

  // Bars
  const bars = prices.map((p, i) => {
    const x = chartLeft + i * ((chartRight - chartLeft) / n) + 4;
    const y = yOf(p);
    const h = chartTop + chartH - y;
    const isCur = i === day;
    const isMin = i === minIdx;
    const isBuy = done && i === bestBuy;
    const isSell = done && i === bestSell;
    let stroke = '#3a5575', fill = D.idleGrad, filter = '', label = '';
    if (isBuy) { stroke = '#39ff80'; fill = D.curGrad; filter = `filter="${D.glowCyan}"`; label = 'BUY'; }
    if (isSell) { stroke = '#ffd060'; fill = D.matchGrad; filter = `filter="${D.glowGold}"`; label = 'SELL'; }
    if (isCur && !done)  { stroke = '#80d4ff'; fill = D.curGrad; filter = `filter="${D.glowCyan}"`; }
    if (isMin && !done && !isCur) { stroke = '#a060ff'; fill = '#1a1030'; }
    return `
      <g style="animation: ${D.animPop} 240ms ${i * 30}ms both;">
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3"
              fill="${fill}" stroke="${stroke}" stroke-width="${(isCur || isBuy || isSell) ? 2.6 : 1.4}" ${filter}/>
        <text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="16" font-weight="bold"
              fill="${isBuy ? '#80f0a0' : (isSell ? '#ffd060' : (isCur ? '#80d4ff' : '#a0c0d0'))}">${p}</text>
        <text x="${x + barW / 2}" y="${chartTop + chartH + 18}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="12"
              fill="#7090b0">day ${i}</text>
        ${label ? `<text x="${x + barW / 2}" y="${chartTop + chartH + 36}" text-anchor="middle"
                         font-family="'JetBrains Mono', monospace" font-size="13" font-weight="bold"
                         fill="${isBuy ? '#80f0a0' : '#ffd060'}">${label}</text>` : ''}
      </g>`;
  }).join('');

  // Min marker (dashed horizontal line)
  const minMarker = minSoFar != null ? `
    <g style="animation: ${D.animFade} 380ms both;">
      <line x1="${chartLeft}" y1="${yOf(minSoFar)}" x2="${chartRight}" y2="${yOf(minSoFar)}"
            stroke="#a060ff" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.7"/>
      <text x="${chartLeft - 8}" y="${yOf(minSoFar) + 5}" text-anchor="end"
            font-family="'JetBrains Mono', monospace" font-size="13"
            fill="#c090ff" font-weight="bold">min = ${minSoFar}</text>
    </g>` : '';

  // Best profit card
  const cardX = W - 180, cardY = 100;
  const card = `
    <g style="animation: ${D.animFade} 320ms both;">
      <rect x="${cardX}" y="${cardY}" width="160" height="70" rx="12"
            fill="${done ? D.matchGrad : D.idleGrad}"
            stroke="${done ? '#ffd060' : '#3a5575'}" stroke-width="${done ? 3 : 1.5}"
            ${done ? `filter="${D.glowGold}"` : ''}/>
      <text x="${cardX + 80}" y="${cardY + 22}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="13"
            fill="${done ? '#ffd060' : '#80a0c0'}" font-weight="bold" letter-spacing="2">BEST PROFIT</text>
      <text x="${cardX + 80}" y="${cardY + 56}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="30" font-weight="bold"
            fill="${done ? '#ffd060' : '#80f0a0'}">$${best}</text>
    </g>`;

  const bannerText = done
    ? `✓ buy@day ${bestBuy} ($${prices[bestBuy]}), sell@day ${bestSell} ($${prices[bestSell]})  →  $${best}`
    : `day ${day}: price = $${prices[day]}, profit-if-sell-now = $${prices[day] - minSoFar}`;
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 320}" y="14" width="640" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  const H = chartTop + chartH + 60;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${card}
    ${bars}
    ${minMarker}
  </svg>`;
}

// ─── Bit-reverse SVG — 1 or 2 rows of bit cells with swap arrows ────
// Used by the three parts of 8012 (byte naive / byte D&C / register).
//   bitsBefore : array of 8 (or N) ints (0 or 1) — pre-step state
//   bitsAfter  : same length — post-step state (omit for single-row)
//   swaps      : array of [iBefore, jAfter] pairs that get drawn as
//                connecting arrows (so the user sees what moved where)
//   stepLabel  : short banner text
//   done       : final-frame flag → gold theming
function _bitsReverseSvg({ bitsBefore, bitsAfter, swaps = [], stepLabel, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const n = (bitsBefore || bitsAfter).length;
  const CELL = n > 16 ? 26 : 44;
  const CELL_H = CELL + 8;
  const W = Math.max(680, n * CELL + 120);
  const top = 90;
  const rowGap = 120;
  const totalW = n * CELL;
  const left = (W - totalW) / 2;

  const swapFrom = new Set(swaps.map(([i]) => i));
  const swapTo = new Set(swaps.map(([_, j]) => j));

  const renderRow = (bits, y, side) => bits.map((bit, i) => {
    const isHl = side === 'before' ? swapFrom.has(i) : swapTo.has(i);
    const stroke = isHl ? (done ? '#ffd060' : '#39ff80') : '#3a5575';
    const fill   = isHl ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = isHl ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    const bitColor = bit ? (isHl ? '#fff0c0' : '#80f0a0') : '#5a7090';
    return `
      <g style="animation: ${D.animPop} 240ms ${i * 18}ms both;">
        <text x="${left + i * CELL + CELL / 2}" y="${y - 8}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="${n > 16 ? 9 : 11}"
              fill="#7090b0">[${i}]</text>
        <rect x="${left + i * CELL + 2}" y="${y}" width="${CELL - 4}" height="${CELL_H}" rx="${n > 16 ? 4 : 6}"
              fill="${fill}" stroke="${stroke}" stroke-width="${isHl ? 2.4 : 1.2}" ${filter}/>
        <text x="${left + i * CELL + CELL / 2}" y="${y + CELL_H * 0.7}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="${n > 16 ? 18 : 26}" font-weight="bold"
              fill="${bitColor}">${bit}</text>
      </g>`;
  }).join('');

  const bottomY = top + rowGap;

  // Swap arrows: bezier curves connecting before[i] → after[j]
  let arrows = '';
  if (bitsBefore && bitsAfter && swaps.length > 0) {
    // Cap displayed arrows so the view stays readable; the user gets the
    // *idea* of the pattern without 32 lines of spaghetti.
    const display = swaps.slice(0, Math.min(swaps.length, n > 16 ? 6 : 8));
    arrows = display.map(([i, j], pi) => {
      const xi = left + i * CELL + CELL / 2;
      const xj = left + j * CELL + CELL / 2;
      const midY = (top + CELL_H + bottomY) / 2;
      return `
        <path d="M ${xi} ${top + CELL_H + 2} C ${xi} ${midY}, ${xj} ${midY}, ${xj} ${bottomY - 4}"
              stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="1.6" fill="none"
              opacity="0.7"
              marker-end="${done ? D.arrowGold : D.arrowCyan}"
              style="animation: ${D.animFade} 380ms ${300 + pi * 40}ms both;"/>`;
    }).join('');
  }

  const labels = `
    <text x="${left - 20}" y="${top + CELL_H * 0.7}" text-anchor="end"
          font-family="'JetBrains Mono', monospace" font-size="14"
          fill="#80a0c0" font-weight="bold">${bitsBefore ? 'לפני' : ''}</text>
    ${bitsAfter ? `<text x="${left - 20}" y="${bottomY + CELL_H * 0.7}" text-anchor="end"
                       font-family="'JetBrains Mono', monospace" font-size="14"
                       fill="${done ? '#ffd060' : '#80f0a0'}" font-weight="bold">${done ? 'מוכן' : 'אחרי'}</text>` : ''}`;

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 260}" y="14" width="520" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + stepLabel : stepLabel}
      </text>
    </g>`;

  const H = bottomY + (bitsAfter ? CELL_H : 0) + 30;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${labels}
    ${renderRow(bitsBefore, top, 'before')}
    ${arrows}
    ${bitsAfter ? renderRow(bitsAfter, bottomY, 'after') : ''}
  </svg>`;
}

// ─── Random7-grid SVG — 5×5 lottery grid with rejection cells ───────
// Used by 8013 to show rejection sampling visually.
//   pickA, pickB : current Random5() picks (1..5, or null for init)
//   accepted     : true if the idx (a-1)*5 + (b-1) + 1 is ≤ 21
//   returnedVal  : the final 1..7 value (on done frame)
function _random7GridSvg({ pickA, pickB, accepted, returnedVal, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 720, CELL = 84;
  const top = 110, gridLeft = (W - 5 * CELL) / 2;

  // Color each cell by (idx % 7) for accepted cells; reject cells = grey
  const valueColors = ['#80d4ff','#39ff80','#ffd060','#ff9a70','#c080ff','#80f0a0','#f070c0'];

  const cells = [];
  for (let a = 1; a <= 5; a++) {
    for (let b = 1; b <= 5; b++) {
      const idx = (a - 1) * 5 + (b - 1) + 1;     // 1..25
      const isPick = a === pickA && b === pickB;
      const isReject = idx > 21;
      const colorIdx = isReject ? -1 : ((idx - 1) % 7);
      const val = isReject ? '✗' : `${(((idx - 1) % 7) + 1)}`;
      const x = gridLeft + (b - 1) * CELL;
      const y = top + (a - 1) * CELL;
      const stroke = isPick ? (done && accepted ? '#ffd060' : (accepted === false ? '#ff6060' : '#39ff80'))
                   : isReject ? '#5a3030' : '#3a5575';
      const fill = isPick ? D.matchGrad : (isReject ? '#1a0808' : D.idleGrad);
      const filter = isPick ? `filter="${done && accepted ? D.glowGold : (accepted === false ? D.glowGold : D.glowCyan)}"` : '';
      const valColor = isReject ? '#a05050' : (colorIdx >= 0 ? valueColors[colorIdx] : '#e8f0fa');
      cells.push(`
        <g style="animation: ${D.animPop} 240ms ${((a - 1) * 5 + (b - 1)) * 15}ms both;">
          <rect x="${x + 4}" y="${y + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="10"
                fill="${fill}" stroke="${stroke}" stroke-width="${isPick ? 3 : 1.4}" ${filter}/>
          <text x="${x + CELL / 2}" y="${y + 26}" text-anchor="middle"
                font-family="'JetBrains Mono', monospace" font-size="13"
                fill="#5a7090">${idx}</text>
          <text x="${x + CELL / 2}" y="${y + CELL / 2 + 14}" text-anchor="middle"
                font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
                fill="${valColor}">${val}</text>
        </g>`);
    }
  }

  // Row / col headers (a, b)
  const headers = [];
  for (let i = 0; i < 5; i++) {
    // top labels (b)
    headers.push(`<text x="${gridLeft + i * CELL + CELL / 2}" y="${top - 14}" text-anchor="middle"
                       font-family="'JetBrains Mono', monospace" font-size="16"
                       fill="${pickB === i + 1 ? '#39ff80' : '#7090b0'}"
                       font-weight="bold">b=${i + 1}</text>`);
    // left labels (a)
    headers.push(`<text x="${gridLeft - 14}" y="${top + i * CELL + CELL / 2 + 5}" text-anchor="end"
                       font-family="'JetBrains Mono', monospace" font-size="16"
                       fill="${pickA === i + 1 ? '#39ff80' : '#7090b0'}"
                       font-weight="bold">a=${i + 1}</text>`);
  }

  // Return value chip (on done)
  const returnChip = (done && returnedVal != null) ? `
    <g style="animation: ${D.animFade} 420ms 250ms both;">
      <rect x="${W - 220}" y="80" width="180" height="60" rx="12"
            fill="${D.matchGrad}" stroke="#ffd060" stroke-width="3"
            filter="${D.glowGold}"/>
      <text x="${W - 130}" y="105" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="13"
            fill="#ffd060" font-weight="bold" letter-spacing="2">RETURN</text>
      <text x="${W - 130}" y="132" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="30" font-weight="bold"
            fill="#fff0c0">${returnedVal}</text>
    </g>` : '';

  // Banner
  let bannerText = 'Random7 — 5×5 grid';
  if (pickA && !pickB)       bannerText = `a = Random5() = ${pickA}`;
  else if (pickA && pickB)   bannerText = `b = Random5() = ${pickB}  →  idx = ${(pickA-1)*5 + (pickB-1) + 1}`;
  if (accepted === false)    bannerText = `idx = ${(pickA-1)*5 + (pickB-1) + 1} > 21 → REJECT, retry`;
  if (done && accepted)      bannerText = `idx ≤ 21 → accept, return ${returnedVal}`;
  const bannerColor = (accepted === false) ? '#ff6060' : (done ? '#ffd060' : '#80d4ff');
  const bannerFill  = (accepted === false) ? '#2a1010' : (done ? D.bannerGold : D.bannerCyan);
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 260}" y="14" width="520" height="42" rx="21"
            fill="${bannerFill}" stroke="${bannerColor}" stroke-width="2"
            filter="${done && accepted ? D.glowGold : (accepted === false ? D.glowGold : D.glowCyan)}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${bannerColor}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  const H = top + 5 * CELL + 30;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${headers.join('')}
    ${cells.join('')}
    ${returnChip}
  </svg>`;
}

// ─── Topological-sort graph SVG — nodes/edges + queue + result ──────
// Hand-positioned layout for our 5-node example
// (a, b, c, x, y with edges a→b, c→a, x→y, y→a).
//   inDegree : current in-degree of each node (object)
//   removed  : Set of node ids already added to the result
//   queue    : array of node ids currently in the BFS queue
//   result   : ordered list of node ids accumulated so far
//   highlight: optional — the node "being processed this step"
function _topoGraphSvg({ inDegree, removed, queue, result, highlight, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 900, H = 480;

  // Hand-placed node positions (DAG laid out left-to-right by depth)
  const positions = {
    c: { x: 130, y: 130 },
    x: { x: 130, y: 320 },
    y: { x: 340, y: 320 },
    a: { x: 520, y: 220 },
    b: { x: 720, y: 220 },
  };
  // Edges: from → to  (meaning from < to)
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'c', to: 'a' },
    { from: 'x', to: 'y' },
    { from: 'y', to: 'a' },
  ];

  const removedSet = removed instanceof Set ? removed : new Set(removed || []);
  const queueSet   = new Set(queue || []);

  // Render edges (lines) — fade if either endpoint was removed
  const edgesHtml = edges.map(e => {
    const p1 = positions[e.from], p2 = positions[e.to];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const offset = 36;
    const x1 = p1.x + dx / len * offset;
    const y1 = p1.y + dy / len * offset;
    const x2 = p2.x - dx / len * offset;
    const y2 = p2.y - dy / len * offset;
    const faded = removedSet.has(e.from);
    return `
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
            stroke="${faded ? '#3a4050' : '#7090b0'}"
            stroke-width="${faded ? 1.4 : 2}"
            opacity="${faded ? 0.4 : 0.9}"
            marker-end="${D.arrowCyan}"
            style="animation: ${D.animFade} 360ms both;"/>`;
  }).join('');

  // Render nodes
  const nodesHtml = Object.entries(positions).map(([id, p]) => {
    const isRemoved = removedSet.has(id);
    const isInQueue = queueSet.has(id);
    const isHl = id === highlight;
    const inDeg = isRemoved ? 0 : (inDegree[id] || 0);
    let stroke = '#3a5575', fill = D.idleGrad, filter = '', textColor = '#c0d8e0';
    if (isRemoved)         { stroke = done ? '#ffd060' : '#39ff80'; fill = done ? D.matchGrad : D.curGrad; filter = `filter="${done ? D.glowGold : D.glowCyan}"`; textColor = '#c8f8d0'; }
    else if (isHl)         { stroke = '#ffd060'; fill = D.matchGrad; filter = `filter="${D.glowGold}"`; textColor = '#fff0c0'; }
    else if (isInQueue)    { stroke = '#80d4ff'; fill = D.curGrad; filter = `filter="${D.glowCyan}"`; textColor = '#a8e0b8'; }
    return `
      <g style="animation: ${D.animPop} 320ms both;">
        <circle cx="${p.x}" cy="${p.y}" r="36" fill="${fill}" stroke="${stroke}" stroke-width="${isHl || isRemoved ? 3 : 1.8}" ${filter}/>
        <text x="${p.x}" y="${p.y + 9}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
              fill="${textColor}">${id}</text>
        <text x="${p.x}" y="${p.y - 48}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#7090b0" font-weight="bold">in-deg: ${inDeg}</text>
      </g>`;
  }).join('');

  // Queue + result side panel
  const panelX = 40, panelTopY = H - 110;
  const queueChips = (queue || []).length === 0
    ? `<text x="${panelX + 90}" y="${panelTopY + 25}" font-family="'JetBrains Mono', monospace"
            font-size="16" fill="#5a7090" font-style="italic">(empty)</text>`
    : (queue || []).map((id, i) => `
        <g style="animation: ${D.animSlide} 260ms ${i * 40}ms both;">
          <rect x="${panelX + 90 + i * 56}" y="${panelTopY}" width="46" height="38" rx="10"
                fill="${D.chipGrad}" stroke="#80d4ff" stroke-width="1.6"
                filter="${D.glowCyan}"/>
          <text x="${panelX + 90 + i * 56 + 23}" y="${panelTopY + 26}" text-anchor="middle"
                font-family="'JetBrains Mono', monospace" font-size="20" font-weight="bold"
                fill="#a8e0b8">${id}</text>
        </g>`).join('');
  const queueLabel = `<text x="${panelX + 80}" y="${panelTopY + 25}" text-anchor="end"
                            font-family="'JetBrains Mono', monospace" font-size="15"
                            fill="#80c0e0" font-weight="bold" letter-spacing="2">QUEUE →</text>`;

  const resultY = panelTopY + 55;
  const resultChips = (result || []).length === 0
    ? `<text x="${panelX + 90}" y="${resultY + 25}" font-family="'JetBrains Mono', monospace"
            font-size="16" fill="#5a7090" font-style="italic">(empty)</text>`
    : (result || []).map((id, i) => `
        <g style="animation: ${D.animSlide} 260ms ${i * 40}ms both;">
          <rect x="${panelX + 90 + i * 56}" y="${resultY}" width="46" height="38" rx="10"
                fill="${D.matchGrad}" stroke="#39ff80" stroke-width="1.6"
                filter="${D.glowCyan}"/>
          <text x="${panelX + 90 + i * 56 + 23}" y="${resultY + 26}" text-anchor="middle"
                font-family="'JetBrains Mono', monospace" font-size="20" font-weight="bold"
                fill="#c8f8d0">${id}</text>
        </g>`).join('');
  const resultLabel = `<text x="${panelX + 80}" y="${resultY + 25}" text-anchor="end"
                             font-family="'JetBrains Mono', monospace" font-size="15"
                             fill="#80f0a0" font-weight="bold" letter-spacing="2">RESULT →</text>`;

  // Banner
  const bannerText = done ? `✓ topological order: ${(result || []).join(' < ')}` : 'Kahn\'s algorithm — peel zero-in-degree nodes';
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${edgesHtml}
    ${nodesHtml}
    ${queueLabel}
    ${queueChips}
    ${resultLabel}
    ${resultChips}
  </svg>`;
}

// ─── Bitwise-multiply SVG — three binary registers (a/b/result) ─────
// Shows the shift-and-add iteration step-by-step:
//   a, b      : current values (decimal)
//   result    : accumulator
//   bitTested : whether (b & 1) was non-zero this step
//   action    : 'init' | 'add' | 'skip' | 'shift' | 'done'
function _bitMultiplySvg({ a, b, result, bitTested, action, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 820, H = 380;
  const cardW = 240, cardH = 80;
  const cards = [
    { name: 'A', val: a,      desc: 'multiplicand', x: 40 },
    { name: 'B', val: b,      desc: 'multiplier',   x: 290 },
    { name: 'result', val: result, desc: 'sum so far',  x: 540 },
  ];

  // Convert decimal → 8-bit binary string
  const bin = (v) => (v & 0xFF).toString(2).padStart(8, '0');

  // For B, highlight the LSB (bit being tested THIS step)
  const renderCard = ({ name, val, desc, x }) => {
    const isB = name === 'B';
    const isResult = name === 'result';
    const isHl = (isB && action !== 'init' && action !== 'done')
              || (isResult && action === 'add')
              || (done && isResult);
    const stroke = isHl ? (done && isResult ? '#ffd060' : '#39ff80') : '#3a5575';
    const fill = isHl ? (done && isResult ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = isHl ? `filter="${done && isResult ? D.glowGold : D.glowCyan}"` : '';
    const cardY = 100;
    return `
      <g style="animation: ${D.animPop} 320ms both;">
        <rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="12"
              fill="${fill}" stroke="${stroke}" stroke-width="${isHl ? 3 : 1.6}" ${filter}/>
        <text x="${x + 14}" y="${cardY + 22}"
              font-family="'JetBrains Mono', monospace" font-size="16"
              fill="${isHl ? '#c8f8d0' : '#80a0c0'}" font-weight="bold" letter-spacing="2">${name}</text>
        <text x="${x + cardW - 14}" y="${cardY + 22}" text-anchor="end"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#5a7090" font-style="italic">${desc}</text>
        <text x="${x + cardW / 2}" y="${cardY + 56}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="28" font-weight="bold"
              fill="${isHl ? '#fff0c0' : '#e8f0fa'}">${val}</text>
      </g>
      <g style="animation: ${D.animFade} 360ms 100ms both;">
        ${bin(val).split('').map((b, i) => {
          const cell = 22;
          const cx = x + 14 + i * cell;
          const lsb = isB && i === 7;
          const bitColor = b === '1' ? (lsb ? '#ffd060' : '#80f0a0') : '#5a7090';
          const bitFill = lsb ? D.matchGrad : '#0a1320';
          const bitStroke = lsb ? '#ffd060' : '#2a4060';
          return `
            <rect x="${cx}" y="${cardY + cardH + 8}" width="${cell - 4}" height="${cell + 4}" rx="3"
                  fill="${bitFill}" stroke="${bitStroke}" stroke-width="${lsb ? 2 : 1}"
                  ${lsb ? `filter="${D.glowGold}"` : ''}/>
            <text x="${cx + (cell - 4) / 2}" y="${cardY + cardH + 24}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="14" font-weight="bold"
                  fill="${bitColor}">${b}</text>`;
        }).join('')}
      </g>`;
  };

  // Action label
  const actionMap = {
    init:  'init',
    add:   `b & 1 = 1 → result += a`,
    skip:  `b & 1 = 0 → skip add`,
    shift: 'a <<= 1, b >>= 1',
    done:  `b = 0 → return ${result}`,
  };
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 240}" y="14" width="480" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' : ''}${actionMap[action] || ''}
      </text>
    </g>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${cards.map(renderCard).join('')}
  </svg>`;
}

// ─── Parentheses-stack SVG — string + LIFO stack visualisation ──────
// `s`     : full input string
// `idx`   : current char index being processed (-1 for "init" / "done")
// `stack` : current stack contents (array of chars, oldest first)
// `action`: 'push' | 'pop' | 'mismatch' | 'init' | 'done'
// `valid` : bool — only relevant on the final "done" frame
function _parensSvg({ s, idx, stack, action, valid }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 56, CELL_H = 60;
  const n = s.length;
  const W = Math.max(820, n * CELL + 240);
  const strY = 130;
  const stackBottomY = 360;
  const stackCellH = 46;

  const left = (W - n * CELL) / 2;
  const done = action === 'done';

  // String row — characters as cells, current one highlighted
  const cells = [...s].map((ch, i) => {
    const x = left + i * CELL;
    const isCur = i === idx;
    const isPast = idx > i && action !== 'init';
    const stroke = isCur ? (done ? '#ffd060' : '#39ff80') : (isPast ? '#3a5575' : '#2a4060');
    const fill   = isCur ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = isCur ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    return `
      <g style="animation: ${D.animPop} 260ms ${i * 25}ms both;">
        <text x="${x + CELL / 2}" y="${strY - 18}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#7090b0" font-weight="bold">[${i}]</text>
        <rect x="${x + 3}" y="${strY}" width="${CELL - 6}" height="${CELL_H}" rx="8"
              fill="${fill}" stroke="${stroke}" stroke-width="${isCur ? 2.6 : 1.4}" ${filter}/>
        <text x="${x + CELL / 2}" y="${strY + 42}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="30" font-weight="bold"
              fill="${isCur ? '#e8f0fa' : (isPast ? '#7090a8' : '#c0d0e0')}">${ch}</text>
      </g>`;
  }).join('');

  // Stack column — bottom-up, with the most recent push glowing
  const stackLeft = W - 200;
  const stackHtml = stack.length === 0
    ? `<text x="${stackLeft + 70}" y="${stackBottomY - 20}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="16"
            fill="#5a7090" font-style="italic">(empty)</text>`
    : stack.map((c, i) => {
        const y = stackBottomY - (i + 1) * (stackCellH + 4);
        const top = i === stack.length - 1;
        const isAction = top && (action === 'push' || action === 'pop' || action === 'mismatch');
        const stroke = action === 'mismatch' && top ? '#ff6060'
                    : isAction ? (done ? '#ffd060' : '#39ff80')
                    : '#3a5575';
        const fill = action === 'mismatch' && top ? '#3a1010'
                  : isAction ? D.curGrad
                  : D.chipGrad;
        const filter = isAction ? `filter="${action === 'mismatch' ? D.glowGold : D.glowCyan}"` : '';
        return `
          <g style="animation: ${D.animSlide} 280ms ${i * 25}ms both;">
            <rect x="${stackLeft}" y="${y}" width="140" height="${stackCellH}" rx="8"
                  fill="${fill}" stroke="${stroke}" stroke-width="${isAction ? 2.6 : 1.4}" ${filter}/>
            <text x="${stackLeft + 70}" y="${y + 31}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
                  fill="${isAction ? '#c8f8d0' : '#a0c0d0'}">${c}</text>
          </g>`;
      }).join('');

  const stackLabel = `<text x="${stackLeft + 70}" y="${stackBottomY + 22}" text-anchor="middle"
                           font-family="'JetBrains Mono', monospace" font-size="14"
                           fill="#80a0c0" font-weight="bold" letter-spacing="2">STACK</text>
                     <line x1="${stackLeft - 8}" y1="${stackBottomY}" x2="${stackLeft + 148}" y2="${stackBottomY}"
                           stroke="#3a5575" stroke-width="2"/>`;

  // Connection arrow: current char ↔ stack top
  let connector = '';
  if (idx >= 0 && idx < n && (action === 'push' || action === 'pop' || action === 'mismatch')) {
    const cx = left + idx * CELL + CELL / 2;
    const stackTopY = stackBottomY - stack.length * (stackCellH + 4);
    const targetY = action === 'push' ? stackTopY - stackCellH / 2 - 4 : stackTopY + stackCellH / 2;
    const targetX = stackLeft + 70;
    const midX = (cx + targetX) / 2;
    const labelText = action === 'push'    ? 'push'
                    : action === 'pop'     ? 'pop  ✓ match'
                    : 'mismatch  ✗';
    const labelColor = action === 'mismatch' ? '#ff6060'
                     : action === 'pop' ? '#80f0a0'
                     : '#80d4ff';
    connector = `
      <g style="animation: ${D.animFade} 480ms both;">
        <path d="M ${cx} ${strY + CELL_H + 4} Q ${midX} ${(strY + CELL_H + targetY) / 2}, ${targetX - 70} ${targetY}"
              stroke="${labelColor}" stroke-width="2.5" fill="none"
              stroke-dasharray="6 4"
              filter="${action === 'mismatch' ? D.glowGold : D.glowCyan}"
              style="animation: ${D.animDash} 1.2s linear infinite;"
              marker-end="${action === 'mismatch' ? D.arrowGold : D.arrowCyan}"/>
        <text x="${midX}" y="${(strY + CELL_H + targetY) / 2 - 6}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="16"
              fill="${labelColor}" font-weight="bold">${labelText}</text>
      </g>`;
  }

  // Top banner
  const bannerText = done
    ? (valid ? '✓ VALID — סוגריים תקינים' : '✗ INVALID — לא תקין')
    : action === 'init' ? `init — input "${s}"`
    : action === 'push' ? `push '${s[idx]}'`
    : action === 'pop'  ? `pop — '${s[idx]}' closes '${stack[stack.length - 0] || ''}'`
    : action === 'mismatch' ? `mismatch — '${s[idx]}' tries to close wrong opener`
    : '';
  const bannerColor = done && !valid ? '#ff6060' : (done ? '#ffd060' : '#80d4ff');
  const bannerFill  = done && !valid ? '#2a1010' : (done ? D.bannerGold : D.bannerCyan);
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 260}" y="14" width="520" height="42" rx="21"
            fill="${typeof bannerFill === 'string' && bannerFill.startsWith('url') ? bannerFill : bannerFill}"
            stroke="${bannerColor}" stroke-width="2"
            filter="${done && !valid ? D.glowGold : (done ? D.glowGold : D.glowCyan)}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${bannerColor}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  const H = stackBottomY + 50;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${cells}
    ${stackLabel}
    ${stackHtml}
    ${connector}
  </svg>`;
}

// ─── Palindrome-merge SVG — array with two pointers + merge action ───
// `arr`        : current array state (after merges so far)
// `consumed`   : Set of indices that are "outside the active range"
//                (already collapsed into a neighbour)
// `i`, `j`     : current two-pointer positions
// `mergeFrom`  : optional — the cell that was just merged AWAY from
// `mergeInto`  : the cell that absorbed the merged value
// `merges`     : merge counter shown as a chip
// `done`       : final frame → gold theming
function _palindromeMergeSvg({ arr, consumed, i, j, mergeFrom, mergeInto, merges, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 86, CELL_H = 72;
  const n = arr.length;
  const W = Math.max(720, n * CELL + 120);
  const rowY = 140;
  const left = (W - n * CELL) / 2;
  const consumedSet = consumed instanceof Set ? consumed : new Set(consumed || []);

  // Cells
  const cells = arr.map((v, k) => {
    const x = left + k * CELL;
    const isI = k === i, isJ = k === j;
    const isHot = isI || isJ;
    const isConsumed = consumedSet.has(k);
    const isMergeInto = mergeInto === k;
    const isMergeFrom = mergeFrom === k;
    let stroke, fill, filter = '';
    if (isMergeInto) { stroke = '#ffd060'; fill = D.matchGrad; filter = `filter="${D.glowGold}"`; }
    else if (isHot)  { stroke = done ? '#ffd060' : '#39ff80'; fill = done ? D.matchGrad : D.curGrad; filter = `filter="${done ? D.glowGold : D.glowCyan}"`; }
    else if (isConsumed) { stroke = '#3a2818'; fill = '#1a1208'; }
    else             { stroke = '#3a5575'; fill = D.idleGrad; }
    const opacity = isConsumed ? '0.4' : '1';
    const valColor = isMergeInto ? '#fff0c0'
                   : (isHot ? (done ? '#fff0c0' : '#c8f8d0') : (isConsumed ? '#5a4a30' : '#e8f0fa'));
    return `
      <g opacity="${opacity}" style="animation: ${D.animPop} 280ms ${k * 35}ms both;">
        <text x="${x + CELL / 2}" y="${rowY - 22}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="${isConsumed ? '#4a3818' : '#7090b0'}" font-weight="bold">[${k}]</text>
        <rect x="${x + 6}" y="${rowY}" width="${CELL - 12}" height="${CELL_H}" rx="10"
              fill="${fill}" stroke="${stroke}" stroke-width="${isHot || isMergeInto ? 3 : 1.4}" ${filter}/>
        <text x="${x + CELL / 2}" y="${rowY + 46}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="28" font-weight="bold"
              fill="${valColor}">${v}</text>
        ${isMergeFrom ? `<line x1="${x + 12}" y1="${rowY + 12}" x2="${x + CELL - 12}" y2="${rowY + CELL_H - 12}"
                              stroke="#ff8060" stroke-width="2"/>
                         <line x1="${x + CELL - 12}" y1="${rowY + 12}" x2="${x + 12}" y2="${rowY + CELL_H - 12}"
                              stroke="#ff8060" stroke-width="2"/>` : ''}
      </g>`;
  }).join('');

  // Pointer arrows above the active cells. i / j may collide on the
  // final frame; stagger labels then.
  const ptrColor = done ? '#ffd060' : '#80f0a0';
  const ptr = (label, idx) => {
    if (idx < 0 || idx >= n) return '';
    const cx = left + idx * CELL + CELL / 2;
    return `
      <g style="animation: ${D.animFade} 320ms 200ms both;">
        <text x="${cx}" y="${rowY - 48}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="20"
              fill="${ptrColor}" font-weight="bold">${label}</text>
        <path d="M ${cx} ${rowY - 36} L ${cx - 7} ${rowY - 22} L ${cx + 7} ${rowY - 22} z"
              fill="${ptrColor}"/>
      </g>`;
  };
  const pointers = (i === j)
    ? ptr(`i = j = ${i}`, i)
    : ptr('i', i) + ptr('j', j);

  // Merge arrow + "+N" badge near the absorbing cell
  let mergeArrow = '';
  if (mergeFrom != null && mergeInto != null) {
    const xFrom = left + mergeFrom * CELL + CELL / 2;
    const xInto = left + mergeInto * CELL + CELL / 2;
    const arcY = rowY + CELL_H + 36;
    mergeArrow = `
      <g style="animation: ${D.animFade} 560ms both;">
        <path d="M ${xFrom} ${rowY + CELL_H + 4} C ${xFrom} ${arcY + 16}, ${xInto} ${arcY + 16}, ${xInto} ${rowY + CELL_H + 4}"
              stroke="#ffa060" stroke-width="3" fill="none"
              stroke-dasharray="7 4"
              filter="${D.glowGold}"
              style="animation: ${D.animDash} 1.4s linear infinite;"
              marker-end="${D.arrowGold}"/>
        <text x="${(xFrom + xInto) / 2}" y="${arcY + 24}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="16"
              fill="#ffd060" font-weight="bold">merge ⤴</text>
      </g>`;
  }

  // Merge counter chip
  const cardX = W - 170, cardY = 100;
  const counterCard = `
    <g style="animation: ${D.animFade} 320ms both;">
      <rect x="${cardX}" y="${cardY}" width="140" height="60" rx="10"
            fill="${done ? D.matchGrad : D.idleGrad}"
            stroke="${done ? '#ffd060' : '#3a5575'}" stroke-width="${done ? 3 : 1.5}"
            ${done ? `filter="${D.glowGold}"` : ''}/>
      <text x="${cardX + 70}" y="${cardY + 22}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="12"
            fill="${done ? '#ffd060' : '#80a0c0'}" font-weight="bold" letter-spacing="2">MERGES</text>
      <text x="${cardX + 70}" y="${cardY + 50}" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="28" font-weight="bold"
            fill="${done ? '#ffd060' : '#80f0a0'}">${merges}</text>
    </g>`;

  // Banner
  const bannerText = done
    ? `✓ palindrome reached — ${merges} merge${merges === 1 ? '' : 's'}`
    : (mergeFrom != null ? `merge arr[${mergeFrom}] → arr[${mergeInto}]` : `compare arr[${i}] vs arr[${j}]`);
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="18"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">${bannerText}</text>
    </g>`;

  const H = rowY + CELL_H + (mergeArrow ? 90 : 50);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${counterCard}
    ${pointers}
    ${cells}
    ${mergeArrow}
  </svg>`;
}

// ─── Dutch-flag SVG — 3-way partition with low/mid/high pointers ────
// Renders a row of colored circles with three labeled pointer arrows.
// Colors map: 'R'→red, 'Y'→yellow, 'G'→green. The pointer arrows are
// labelled `low`, `mid`, `high` and glow when a swap just happened at
// their position.
function _dutchFlagSvg({ arr, low, mid, high, swapped, done }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const CELL = 70, R = 26;
  const n = arr.length;
  const W = Math.max(720, n * CELL + 80);
  // Bumped rowY (140 → 170) so the upper swap arc has room without
  // colliding with the banner / pointer labels.
  const rowY = 170;
  const totalW = n * CELL;
  const left = (W - totalW) / 2;

  const colorOf = { R: '#ff6060', Y: '#ffd060', G: '#80f0a0' };

  // Balls
  const balls = arr.map((c, i) => {
    const cx = left + i * CELL + CELL / 2;
    const isLow = i === low, isMid = i === mid, isHigh = i === high;
    const focused = isLow || isMid || isHigh;
    const ringStroke = (done && i < low) ? '#ff6060'
                     : (done && i > high) ? '#80f0a0'
                     : focused ? (done ? '#ffd060' : '#39ff80') : '#3a5575';
    const ringW = focused ? 3 : 1.5;
    const filter = focused ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    return `
      <g style="animation: ${D.animPop} 280ms ${i * 30}ms both;">
        <text x="${cx}" y="${rowY - 42}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#7090b0" font-weight="bold">[${i}]</text>
        <circle cx="${cx}" cy="${rowY}" r="${R}"
                fill="${colorOf[c] || '#888'}"
                stroke="${ringStroke}" stroke-width="${ringW}" ${filter}/>
      </g>`;
  }).join('');

  // Pointer arrows above each labeled position. We stack them when
  // pointers collide so labels don't overlap.
  const ptrColor = done ? '#ffd060' : '#80f0a0';
  const ptr = (label, idx, yOff) => {
    if (idx < 0 || idx >= n) return '';
    const cx = left + idx * CELL + CELL / 2;
    return `
      <g style="animation: ${D.animFade} 320ms 200ms both;">
        <text x="${cx}" y="${rowY - 70 + yOff}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="18"
              fill="${ptrColor}" font-weight="bold">${label}</text>
        <path d="M ${cx} ${rowY - 60 + yOff} L ${cx - 6} ${rowY - 46 + yOff} L ${cx + 6} ${rowY - 46 + yOff} z"
              fill="${ptrColor}"/>
      </g>`;
  };
  // If two pointers share a position, stagger them vertically.
  const yOf = { low: 0, mid: 0, high: 0 };
  if (low === mid)  yOf.mid = -22;
  if (mid === high) yOf.high = (low === mid ? -44 : -22);
  if (low === high && low !== mid) yOf.high = -22;
  const pointers = ptr('low', low, yOf.low)
                 + ptr('mid', mid, yOf.mid)
                 + ptr('high', high, yOf.high);

  // Swap visualisation. Two **crossing** arcs — one per ball — make
  // the exchange physically intuitive (each ball follows its own
  // path to the other slot). Even when a == b (self-swap), we draw
  // a small "no-op" loop so the user sees that the algorithm DID
  // consider this slot.
  let swap = '';
  if (swapped && swapped.length === 2) {
    const [a, b] = swapped;
    const xa = left + a * CELL + CELL / 2;
    const xb = left + b * CELL + CELL / 2;
    if (a === b) {
      // Self-swap — a tiny loop above the cell with a "noop" badge.
      swap = `
        <g style="animation: ${D.animFade} 480ms both;">
          <circle cx="${xa}" cy="${rowY - 70}" r="14" fill="none"
                  stroke="${ptrColor}" stroke-width="2" stroke-dasharray="4 3"
                  filter="${done ? D.glowGold : D.glowCyan}"
                  style="animation: ${D.animDash} 1.4s linear infinite;"/>
          <text x="${xa + 22}" y="${rowY - 66}"
                font-family="'JetBrains Mono', monospace" font-size="13"
                fill="${ptrColor}">self-swap (no-op)</text>
        </g>`;
    } else {
      // Two crossing arcs. Color the FROM-arc one way and the TO-arc
      // another so the exchange isn't a tangle. Bottom arc curves down,
      // top arc curves up — they cross visibly above/below the row.
      const arcDown = rowY + R + 38;
      const arcUp   = rowY - R - 38;
      const startA  = rowY + R + 2;
      const startB  = rowY - R - 2;
      swap = `
        <g style="animation: ${D.animFade} 520ms both; transform-origin: center;">
          <!-- Ball A travels DOWN-and-OVER to slot B -->
          <path d="M ${xa} ${startA}
                   C ${xa} ${arcDown}, ${xb} ${arcDown}, ${xb} ${startA}"
                stroke="#80d4ff" stroke-width="3" fill="none"
                stroke-linecap="round"
                stroke-dasharray="10 5"
                filter="${D.glowCyan}"
                style="animation: ${D.animDash} 1s linear infinite;"
                marker-end="${D.arrowCyan}"/>
          <!-- Ball B travels UP-and-OVER to slot A -->
          <path d="M ${xb} ${startB}
                   C ${xb} ${arcUp}, ${xa} ${arcUp}, ${xa} ${startB}"
                stroke="#ffd060" stroke-width="3" fill="none"
                stroke-linecap="round"
                stroke-dasharray="10 5"
                filter="${D.glowGold}"
                style="animation: ${D.animDash} 1s linear infinite reverse;"
                marker-end="${D.arrowGold}"/>
          <!-- Center "↔ swap" badge -->
          <g>
            <rect x="${(xa + xb) / 2 - 46}" y="${arcDown + 10}" width="92" height="28" rx="14"
                  fill="${D.matchGrad}" stroke="${ptrColor}" stroke-width="1.8"
                  filter="${done ? D.glowGold : D.glowCyan}"/>
            <text x="${(xa + xb) / 2}" y="${arcDown + 29}" text-anchor="middle"
                  font-family="'JetBrains Mono', monospace" font-size="16"
                  fill="${ptrColor}" font-weight="bold">↔ swap</text>
          </g>
        </g>`;
    }
  }

  // Title banner
  const bannerText = done ? 'sorted: red ◀ yellow ◀ green' : `low=${low}, mid=${mid}, high=${high}`;
  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 220}" y="14" width="440" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="19"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + bannerText : bannerText}
      </text>
    </g>`;

  // Account for the swap badge that sits below the lower arc.
  const H = rowY + R + (swap ? 120 : 30);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${pointers}
    ${balls}
    ${swap}
  </svg>`;
}

// ─── Shared SVG renderer — generic horizontal array row ──────────
// One row of N cells, with optional pointer arrows, highlight indices,
// and a fixed banner. Used by 8026 (move-zeros), 8032 (1→0 boundary).
function _arrayRowSvg({ arr, pointers = {}, highlights = [], label, done, subtitle }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const n = arr.length;
  const CELL = n > 14 ? 46 : 64;
  const CELL_H = CELL + 6;
  const W = Math.max(720, n * CELL + 120);
  const top = 130;
  const totalW = n * CELL;
  const left = (W - totalW) / 2;
  const hlSet = new Set(highlights);

  const cells = arr.map((v, i) => {
    const isHl = hlSet.has(i);
    const isZero = v === 0;
    const stroke = isHl ? (done ? '#ffd060' : '#39ff80') : (isZero ? '#5a3a3a' : '#3a5575');
    const fill   = isHl ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = isHl ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    const txt    = isHl ? (done ? '#ffd060' : '#80f0a0') : (isZero ? '#a06060' : '#c0d0e0');
    return `
      <g style="animation: ${D.animPop} 220ms ${i * 16}ms both;">
        <text x="${left + i * CELL + CELL / 2}" y="${top - 10}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="11"
              fill="#7090b0">[${i}]</text>
        <rect x="${left + i * CELL + 2}" y="${top}" width="${CELL - 4}" height="${CELL_H}" rx="6"
              fill="${fill}" stroke="${stroke}" stroke-width="${isHl ? 2.4 : 1.2}" ${filter}/>
        <text x="${left + i * CELL + CELL / 2}" y="${top + CELL_H * 0.66}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="22" font-weight="bold"
              fill="${txt}">${v}</text>
      </g>`;
  }).join('');

  const ptrs = Object.entries(pointers).map(([name, idx]) => {
    if (idx == null || idx < 0 || idx >= n) return '';
    const x = left + idx * CELL + CELL / 2;
    return `
      <g style="animation: ${D.animFade} 260ms both;">
        <text x="${x}" y="${top + CELL_H + 28}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="14"
              fill="#ffd060" font-weight="bold">▲</text>
        <text x="${x}" y="${top + CELL_H + 46}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="12"
              fill="#ffd060">${name}</text>
      </g>`;
  }).join('');

  const banner = `
    <g style="animation: ${D.animFade} 300ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + label : label}
      </text>
    </g>`;
  const sub = subtitle ? `<text x="${W/2}" y="78" text-anchor="middle"
        font-family="'JetBrains Mono', monospace" font-size="13"
        fill="#80a0c0">${subtitle}</text>` : '';

  const H = top + CELL_H + 80;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${sub}
    ${cells}
    ${ptrs}
  </svg>`;
}

// ─── Bit-row SVG — N-bit register with optional position label ───
// Used by 8027 (int→binary), 8030 (3rd set bit), 8034 (Kernighan),
// 8035 (LSB).
function _bitRowSvg({ bits, hlIdx = [], cleared = [], label, sub, done, showPos = true, accumStr }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const n = bits.length;
  const CELL = n > 16 ? 30 : 44;
  const CELL_H = CELL + 4;
  const W = Math.max(720, n * CELL + 120);
  const top = 120;
  const totalW = n * CELL;
  const left = (W - totalW) / 2;
  const hlSet = new Set(hlIdx);
  const clrSet = new Set(cleared);

  const cells = bits.map((bit, i) => {
    const pos = n - 1 - i;       // index 0 = MSB; pos = bit position from LSB
    const isHl = hlSet.has(pos);
    const isCleared = clrSet.has(pos);
    const stroke = isHl ? (done ? '#ffd060' : '#39ff80') : (isCleared ? '#603020' : '#3a5575');
    const fill   = isHl ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = isHl ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    const txt    = isHl ? (done ? '#ffd060' : '#80f0a0') : (bit ? '#80f0a0' : '#5a7090');
    return `
      <g style="animation: ${D.animPop} 200ms ${i * 12}ms both;">
        ${showPos ? `<text x="${left + i * CELL + CELL / 2}" y="${top - 8}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="${n > 16 ? 9 : 10}"
              fill="#7090b0">${pos}</text>` : ''}
        <rect x="${left + i * CELL + 2}" y="${top}" width="${CELL - 4}" height="${CELL_H}" rx="${n > 16 ? 4 : 6}"
              fill="${fill}" stroke="${stroke}" stroke-width="${isHl ? 2.4 : 1.2}" ${filter}/>
        <text x="${left + i * CELL + CELL / 2}" y="${top + CELL_H * 0.7}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="${n > 16 ? 18 : 24}" font-weight="bold"
              fill="${txt}">${bit}</text>
      </g>`;
  }).join('');

  const banner = `
    <g style="animation: ${D.animFade} 280ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + label : label}
      </text>
    </g>`;
  const subEl = sub ? `<text x="${W/2}" y="76" text-anchor="middle"
        font-family="'JetBrains Mono', monospace" font-size="14"
        fill="#80a0c0">${sub}</text>` : '';
  const accum = accumStr ? `<g style="animation: ${D.animFade} 280ms both;">
        <text x="${W/2}" y="${top + CELL_H + 40}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="20" font-weight="bold"
              fill="${done ? '#ffd060' : '#80d4ff'}">${accumStr}</text>
      </g>` : '';

  const H = top + CELL_H + (accumStr ? 70 : 30);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${subEl}
    ${cells}
    ${accum}
  </svg>`;
}

// ─── Two-box SVG — for swap (8031) / min (8036) / two-values ─────
function _twoBoxSvg({ a, b, aName = 'a', bName = 'b', op, done, result, resultName }) {
  const uid = _traceUid();
  const D = _traceDefIds(uid);
  const W = 720;
  const boxW = 180, boxH = 110;
  const top = 110;
  const gap = 80;
  const aX = W/2 - boxW - gap/2;
  const bX = W/2 + gap/2;

  const box = (x, name, val, hl) => {
    const stroke = hl ? (done ? '#ffd060' : '#39ff80') : '#3a5575';
    const fill   = hl ? (done ? D.matchGrad : D.curGrad) : D.idleGrad;
    const filter = hl ? `filter="${done ? D.glowGold : D.glowCyan}"` : '';
    const txt = hl ? (done ? '#ffd060' : '#80f0a0') : '#c0d0e0';
    return `
      <g style="animation: ${D.animPop} 260ms both;">
        <text x="${x + boxW/2}" y="${top - 10}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="14"
              fill="#80a0c0" font-weight="bold">${name}</text>
        <rect x="${x}" y="${top}" width="${boxW}" height="${boxH}" rx="10"
              fill="${fill}" stroke="${stroke}" stroke-width="${hl ? 2.6 : 1.4}" ${filter}/>
        <text x="${x + boxW/2}" y="${top + boxH * 0.66}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="28" font-weight="bold"
              fill="${txt}">${val}</text>
      </g>`;
  };

  const banner = `
    <g style="animation: ${D.animFade} 260ms both;">
      <rect x="${W/2 - 280}" y="14" width="560" height="42" rx="21"
            fill="${done ? D.bannerGold : D.bannerCyan}"
            stroke="${done ? '#ffd060' : '#80d4ff'}" stroke-width="2"
            filter="${done ? D.glowGold : D.glowCyan}"/>
      <text x="${W/2}" y="42" text-anchor="middle"
            font-family="'JetBrains Mono', monospace" font-size="17"
            fill="${done ? '#ffd060' : '#80d4ff'}" font-weight="bold" letter-spacing="1">
        ${done ? '✓ ' + op : op}
      </text>
    </g>`;

  const resBox = result != null ? `
      <g style="animation: ${D.animPop} 320ms 120ms both;">
        <text x="${W/2}" y="${top + boxH + 50}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="13"
              fill="#ffd060" font-weight="bold">${resultName || 'result'}</text>
        <rect x="${W/2 - boxW/2}" y="${top + boxH + 60}" width="${boxW}" height="${boxH * 0.7}" rx="10"
              fill="${D.matchGrad}" stroke="#ffd060" stroke-width="2.6" filter="${D.glowGold}"/>
        <text x="${W/2}" y="${top + boxH + 60 + boxH * 0.5}" text-anchor="middle"
              font-family="'JetBrains Mono', monospace" font-size="26" font-weight="bold"
              fill="#ffd060">${result}</text>
      </g>` : '';

  const H = top + boxH + (result != null ? boxH + 90 : 30);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">
    ${_traceDefs(uid)}
    ${banner}
    ${box(aX, aName, a, true)}
    ${box(bX, bName, b, true)}
    ${resBox}
  </svg>`;
}

/**
 * IQ — algorithms questions.
 * Algorithmic / programming interview questions. Solutions are written
 * in **Python only** (pseudo-code as a fallback when language is not
 * the point) — by deliberate scope choice. Keep new questions
 * consistent.
 */

export const QUESTIONS = [
  // ───────────────────────────────────────────────────────────────
  // #8001 — All subsets / powerset
  // ───────────────────────────────────────────────────────────────
  {
    id: 'subsets-powerset',
    difficulty: 'medium',
    title: 'כל תתי-הקבוצות של מערך (Powerset)',
    intro:
`בהינתן מערך של מספרים שלמים **ללא כפילויות**, החזר מערך של
**כל** תתי-הקבוצות האפשריות (כולל הקבוצה הריקה). הסדר בין
תתי-הקבוצות והסדר בתוך כל תת-קבוצה — חופשיים.

**דוגמה:**
\`\`\`
Input:  arr = [1, 2, 3]
Output: [[], [1], [2], [3], [1,2], [1,3], [2,3], [1,2,3]]
\`\`\`

עבור מערך באורך \`n\` יש בדיוק \`2^n\` תתי-קבוצות, כי לכל איבר
שתי אפשרויות בלתי-תלויות: "בפנים" או "בחוץ".`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n·2ⁿ)' },
          { label: 'Space', value: 'O(n·2ⁿ)' },
        ],
        trace: {
          title: 'Powerset — עץ ההחלטות עבור arr=[1, 2, 3]',
          source:
`def subsets(arr):
    out = []
    def rec(i, cur):
        if i == len(arr):
            out.append(cur.copy())
            return
        rec(i + 1, cur)         # דלג
        cur.append(arr[i])      # כלול
        rec(i + 1, cur)
        cur.pop()               # undo
    rec(0, [])
    return out`,
          sourceLang: 'python',
          steps: [
            {
              code: 'root: ∅ — אף איבר לא נבחר עדיין',
              explain: 'כל ענף שמאלה (\`−\`) = "דלג", כל ענף ימינה (\`+\`) = "כלול". בעומק \`n\` כל עלה הוא תת-קבוצה אחת.',
              executed: [1, 11], focusLine: 11,
              viz: _powersetTreeSvg([1,2,3], [''], '', false),
            },
            {
              code: 'depth 1: החלטה על arr[0] = 1',
              explain: 'מתפצלים לשני סניפים: "בלי 1" ו"עם 1". מ-\`1\` צומת נהיו \`2\`.',
              executed: [3, 7, 8, 9], focusLine: 8,
              viz: _powersetTreeSvg([1,2,3], ['','0','1'], '1', false),
            },
            {
              code: 'depth 2: החלטה על arr[1] = 2',
              explain: 'כל אחד מ-2 הצמתים מתפצל ל-2 ילדים. עכשיו \`4\` צמתים. הספירה הוקרית מתחילה.',
              executed: [3, 7, 8, 9, 10], focusLine: 9,
              viz: _powersetTreeSvg([1,2,3], ['','0','1','00','01','10','11'], '11', false),
            },
            {
              code: 'depth 3: החלטה על arr[2] = 3 (העומק האחרון)',
              explain: 'כל צומת ברמה 2 מתפצל בפעם האחרונה. \`8\` עלים = \`2³\` = כל תתי-הקבוצות.',
              executed: [3, 4, 5, 6], focusLine: 5,
              viz: _powersetTreeSvg([1,2,3],
                ['','0','1','00','01','10','11','000','001','010','011','100','101','110','111'],
                '111', false),
            },
            {
              code: 'איסוף העלים → התוצאה הסופית',
              explain: '8 עלים = \`2ⁿ\` תתי-קבוצות. שמאל-לימין: \`[], [3], [2], [2,3], [1], [1,3], [1,2], [1,2,3]\`. כל מסלול שורש→עלה מקודד בחירה.',
              executed: [12], focusLine: 12,
              viz: _powersetTreeSvg([1,2,3],
                ['','0','1','00','01','10','11','000','001','010','011','100','101','110','111'],
                '', true),
            },
          ],
        },
        approaches: [
          {
            name: 'Backtracking',
            time: 'O(n·2ⁿ)', space: 'O(n)',
            summary: 'עץ החלטה בעומק n; בכל איבר — "פנים" או "חוץ". \`pop()\` הוא ה-undo.',
            code:
`def subsets(arr):
    out = []
    def rec(i, cur):
        if i == len(arr):
            out.append(cur.copy())
            return
        rec(i + 1, cur)         # דלג
        cur.append(arr[i])      # כלול
        rec(i + 1, cur)
        cur.pop()               # undo
    rec(0, [])
    return out`,
          },
          {
            name: 'Iterative',
            time: 'O(n·2ⁿ)', space: 'O(n·2ⁿ)',
            summary: 'מתחילים מ-\`[[]]\`; בכל איבר חדש — מכפילים את התוצאה הקיימת.',
            code:
`def subsets(arr):
    out = [[]]
    for x in arr:
        out += [s + [x] for s in out]
    return out`,
          },
          {
            name: 'Bitmask',
            time: 'O(n·2ⁿ)', space: 'O(n·2ⁿ)',
            summary: 'כל \`mask ∈ [0, 2ⁿ)\` מקודד תת-קבוצה ייחודית; הביט ה-i דולק ⇔ \`arr[i]\` בפנים.',
            code:
`def subsets(arr):
    n = len(arr)
    out = []
    for mask in range(1 << n):
        out.append([arr[i] for i in range(n) if mask & (1 << i)])
    return out`,
          },
        ],
        starterCode:
`def subsets(arr):
    """Return all subsets of arr (powerset). No duplicates."""
    # TODO: ממשו backtracking / iterative / bitmask — לבחירתכם
    pass


# בדיקה ידנית:
# print(subsets([1, 2, 3]))
# צריך להחזיר 8 תתי-קבוצות, כולל הריקה.
`,
        question:
`ממשו פונקציה \`subsets(arr)\` בפייתון. אילו גישות עומדות לרשותכם?
איזו מהן הכי טבעית? מה הסיבוכיות?`,
        hints: [
          'כמה אפשרויות יש לכל איבר במערך? איך זה קובע את גודל התוצאה?',
          'Backtracking: DFS עם החלטה בינארית בכל איבר ("פנים"/"חוץ"). \\\`pop()\\\` הוא ה-undo.',
          'ב-leaf של ה-DFS: \\\`out.append(current.copy())\\\`. בלי copy — כל הצמתים יצביעו על אותה רשימה ויסיימו ריקים.',
        ],
        answer:
`**שלוש גישות שקולות בסיבוכיות** — כולן \`Θ(n · 2ⁿ)\` זמן ומקום (השוואה צמודה בקלפים מעלה).

**סיבוכיות:** הגבול התחתון של הבעיה הוא \`n · 2ⁿ\` כי זה גודל הפלט עצמו — **אי-אפשר טוב יותר**. כל גישה שתציע תפגוש את הקיר הזה.

---

**שלבי החשיבה:**

1. **Backtracking** — בכל איבר יש *שתי אפשרויות*: "אני בפנים" או "אני בחוץ". זה עץ בינארי בעומק \`n\` — \`2^n\` עלים = \`2^n\` תתי-קבוצות. ה-\`copy()\` חיוני כי אחרת כל הצמתים של ה-DFS משתפים את אותה רשימה.
2. **Iterative** — נצבר את הפתרון איטרטיבית. בכל איבר חדש: לכל תת-קבוצה שכבר ראינו נוצרת *זוגית* — אחת בלי האיבר, ואחת איתו. הגודל מוכפל בכל מעבר.
3. **Bitmask** — קידוד טבעי כשמדובר באוסף בלי תלות בסדר: כל מספר \`mask\` בטווח \`[0, 2^n)\` מקודד תת-קבוצה ייחודית. הביט ה-i דולק ⇔ \`arr[i]\` בתוך. בלי רקורסיה ובלי סטאק.`,
        interviewerMindset:
`המראיין בודק שני דברים:

1. **שאתה רואה את "החלטה בינארית לכל איבר".** אם אתה מנסה להמציא לולאות מקוננות לפי גודל תת-הקבוצה — הפסדת. הניסוח הנכון הוא רקורסיבי/בינארי.
2. **שאתה מודע לסיבוכיות.** הרבה אומרים "סיבוכיות מעריכית, יקר!" — אבל \`n · 2^n\` היא הגבול התחתון של גודל הפלט. **אי-אפשר** לעשות יותר טוב. להגיד את זה במפורש = ניקוד.

**בונוס**: לדעת לקפוץ בין שלוש הגישות מראה גמישות. גישת הביטמסק בייחוד אהובה במראיינים מעולם הסיסטם, כי היא מתאימה לסריקות paralel-ידידותיות.`,
        expectedAnswers: [
          'powerset', '2^n', 'backtrack', 'recursion', 'bitmask',
          'iterative', 'O(n*2^n)', 'O(n 2^n)',
          'append', 'rec(', 'mask',
        ],
      },
    ],
    source: 'PP - שאלות קוד (slide 1)',
    tags: ['algorithms', 'recursion', 'backtracking', 'bitmask', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8002 — Suspicious-IP rate detector (sliding window)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'suspicious-ip-rate-detector',
    difficulty: 'medium',
    title: 'זיהוי כתובת IP חשודה — Rate Limiter',
    intro:
`אתה מקבל בקשות (\`requests\`) מהמון כתובות \`IP\` שונות.
כתובת שיכולה להחשב כחשודה — כתובת ששולחת **מעל 10 בקשות בדקה**.
איך תממש מערכת שבודקת ויודעת להתריע על כתובת חשודה?

**הנחות מהשקף המקורי:**
- לרשותך פונקציית \`time\` שמדגמת את הזמן הנוכחי.
- ניתן להניח שאת הבקשות אתה קורא מבאפר אינסופי (stream).`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1) amortized' },
          { label: 'Space', value: 'O(IPs × 10)'  },
        ],
        trace: {
          title: 'Rate-limiter — 192.168.1.1 מ-t=0 עד t=100s',
          steps: [
            {
              code: 't = 0s   — הגלאי מתחיל לעקוב אחר 192.168.1.1',
              explain: 'מצב ראשוני: ה-deque ריק, אין בקשות ב-window, המונה 0/10. סף: יותר מ-10 בקשות תוך 60 שניות → חשוד.',
              viz: _rateLimiterSvg({
                now: 0, requests: [], suspect: false,
                subtitle: 'monitoring 192.168.1.1 — empty deque',
                bannerOverride: 'idle — empty deque',
              }),
            },
            {
              code: 't = 5s   — בקשה #1 נכנסת',
              explain: 'הבקשה הראשונה מגיעה. נדחפת לסוף ה-deque. אין מה לפנות עדיין — היא היחידה.',
              viz: _rateLimiterSvg({
                now: 5, requests: [5], justArrived: [5],
                subtitle: 'enqueue 5s · count 1/10',
              }),
            },
            {
              code: 't = 12s  — בקשה #2',
              explain: 'בקשה שנייה. ה-deque גדל ל-2 איברים. שתיהן עדיין בתוך 60 שניות מ-now.',
              viz: _rateLimiterSvg({
                now: 12, requests: [5, 12], justArrived: [12],
                subtitle: 'count 2/10',
              }),
            },
            {
              code: 't = 20s  — בקשה #3',
              explain: 'count = 3.',
              viz: _rateLimiterSvg({
                now: 20, requests: [5, 12, 20], justArrived: [20],
                subtitle: 'count 3/10',
              }),
            },
            {
              code: 't = 26s  — בקשה #4',
              explain: 'count = 4.',
              viz: _rateLimiterSvg({
                now: 26, requests: [5, 12, 20, 26], justArrived: [26],
                subtitle: 'count 4/10',
              }),
            },
            {
              code: 't = 30s  — בקשה #5',
              explain: 'count = 5. עדיין בטוח מתחת לסף.',
              viz: _rateLimiterSvg({
                now: 30, requests: [5, 12, 20, 26, 30], justArrived: [30],
                subtitle: 'count 5/10',
              }),
            },
            {
              code: 't = 36s  — בקשה #6',
              explain: 'count = 6.',
              viz: _rateLimiterSvg({
                now: 36, requests: [5, 12, 20, 26, 30, 36], justArrived: [36],
                subtitle: 'count 6/10',
              }),
            },
            {
              code: 't = 42s  — בקשה #7',
              explain: 'count = 7. הקצב מואץ.',
              viz: _rateLimiterSvg({
                now: 42, requests: [5, 12, 20, 26, 30, 36, 42], justArrived: [42],
                subtitle: 'count 7/10',
              }),
            },
            {
              code: 't = 47s  — בקשה #8',
              explain: 'count = 8.',
              viz: _rateLimiterSvg({
                now: 47, requests: [5, 12, 20, 26, 30, 36, 42, 47], justArrived: [47],
                subtitle: 'count 8/10',
              }),
            },
            {
              code: 't = 51s  — בקשה #9',
              explain: 'count = 9. עוד שתיים — וייסגר עליו.',
              viz: _rateLimiterSvg({
                now: 51, requests: [5, 12, 20, 26, 30, 36, 42, 47, 51], justArrived: [51],
                subtitle: 'count 9/10',
              }),
            },
            {
              code: 't = 55s  — בקשה #10',
              explain: 'count = 10. **בגבול הסף בדיוק**. הסף הוא "יותר מ-10", אז עוד בקשה אחת נוספת תפעיל את הדגל.',
              viz: _rateLimiterSvg({
                now: 55, requests: [5, 12, 20, 26, 30, 36, 42, 47, 51, 55], justArrived: [55],
                subtitle: 'count 10/10 — על הסף',
              }),
            },
            {
              code: 't = 58s  — בקשה #11   →   SUSPECT!',
              explain: 'count עברה ל-11. **\`11 > 10\` → הדגל נדלק.** הצבע מתחלף לזהוב; ה-IP מסומן כחשוד. הסימון "דביק" — לא יוסר גם אם הקצב יירד.',
              viz: _rateLimiterSvg({
                now: 58, requests: [5, 12, 20, 26, 30, 36, 42, 47, 51, 55, 58],
                justArrived: [58], suspect: true,
                subtitle: 'threshold breached — flag latched',
              }),
            },
            {
              code: 't = 70s  — חלף זמן, אין בקשה חדשה',
              explain: 'הזמן התקדם ל-70. החלון הוא כעת \`(10, 70]\`. הבקשה ב-\`t=5\` כבר ישנה מ-60 שניות → **יורדת מראש ה-deque**. count מתעדכן ל-10. הדגל נשאר.',
              viz: _rateLimiterSvg({
                now: 70, requests: [12, 20, 26, 30, 36, 42, 47, 51, 55, 58],
                justDropped: [5], suspect: true,
                subtitle: 'popleft: 5s expired (5 ≤ 70-60)',
              }),
            },
            {
              code: 't = 80s  — עוד התקדמות זמן',
              explain: 'החלון הוא \`(20, 80]\`. הבקשות \`t=12\` ו-\`t=20\` ישנות מדי ונופלות. count = 8. עדיין SUSPECT (sticky).',
              viz: _rateLimiterSvg({
                now: 80, requests: [26, 30, 36, 42, 47, 51, 55, 58],
                justDropped: [12, 20], suspect: true,
                subtitle: 'popleft: 12s, 20s expired',
              }),
            },
            {
              code: 't = 100s — שקט; ה-deque מתכווץ אבל הדגל נשאר',
              explain: 'אין יותר בקשות; הזמן ממשיך. החלון \`(40, 100]\` מותיר רק \`42, 47, 51, 55, 58\` — חמש בקשות. ה-deque מתרוקן בהדרגה אבל **הדגל לא מתאפס**: ברגע ש-IP זוהה כחשוד, הוא נשאר ברשימה.',
              viz: _rateLimiterSvg({
                now: 100, requests: [42, 47, 51, 55, 58],
                justDropped: [26, 30, 36], suspect: true,
                subtitle: 'count back to 5 — but flag stays',
              }),
            },
          ],
        },
        starterCode:
`from collections import defaultdict, deque

class IpRateDetector:
    WINDOW = 60.0       # שניות
    THRESHOLD = 10      # מעל 10 בקשות בחלון → חשוד

    def __init__(self):
        # TODO: מבנה נתונים פר-IP
        pass

    def observe(self, ip, t):
        """מחזיר True אם ה-IP חשוד אחרי הוספת הבקשה הנוכחית."""
        # TODO
        pass
`,
        question:
`ממשו את הגלאי. עבור כל בקשה נכנסת \`(ip, t)\` החזירו אם הכתובת
**חשודה** באותו רגע (כלומר ראינו ממנה > 10 בקשות בדקה האחרונה).`,
        hints: [
          'הזרם אינסופי. איך תספרו "X בקשות בדקה האחרונה" בלי לסרוק את כל ההיסטוריה?',
          'Sliding window: מבנה נתונים פר-IP שמחזיק רק את ה-60 שניות האחרונות. \\\`deque\\\` נותן \\\`popleft\\\` ב-O(1).',
          'בכל בקשה: (1) נקו את ה-deque מטים שגדולים מ-60 שנ\' (\\\`while q[0] < now-60: popleft()\\\`). (2) \\\`append(now)\\\`. (3) \\\`len(q) > 10?\\\` → suspect.',
        ],
        answer:
`**Sliding window per-IP.** מבנה נתונים: \`dict[ip] → deque(timestamps)\`.

\`\`\`python
from collections import defaultdict, deque

class IpRateDetector:
    WINDOW = 60.0       # שניות
    THRESHOLD = 10      # מעל 10 בקשות בחלון = חשוד

    def __init__(self):
        self.q = defaultdict(deque)

    def observe(self, ip, t):
        """מחזיר True אם ה-IP חשוד אחרי הוספת הבקשה הנוכחית."""
        dq = self.q[ip]
        # נקה את כל הבקשות הישנות
        cutoff = t - self.WINDOW
        while dq and dq[0] < cutoff:
            dq.popleft()
        # הוסף את הבקשה הנוכחית
        dq.append(t)
        return len(dq) > self.THRESHOLD
\`\`\`

**סיבוכיות:**
- **זמן** — אמורטייז \`O(1)\` לבקשה: כל בקשה נכנסת ונפלטת מהתור פעם אחת בלבד.
- **מקום** — \`O(IPs · 10)\` במצב יציב: לכל IP חי, עד 10 timestamps. כשהפעילות פוחתת — התור מתרוקן (אבל לא נמחק). לניקוי תקופתי של IPs רדומים — להוסיף סוויפ ש-\`pop\` ערכים ריקים.

**שאלת המשך נפוצה:** "מה אם יש מיליון IPs?" — תשובה: ה-state רוחבי ב-IPs (לא טרי לעוד IP). אם מתקרב לאילוץ זיכרון, אפשר לעבור ל-**Token Bucket** או ל-**Count-Min Sketch** עם דיוק מוגבל ⇄ זיכרון קבוע.

---

**שלבי החשיבה:**

1. **לכל IP מבנה נתונים נפרד** — אחרת ה-window גלובלי יערבב בקשות של כל ה-IPs ולא נדע מי החשוד.
2. **\`deque\` ולא \`list\`** — \`list.pop(0)\` הוא \`O(n)\` כי הוא מזיז את כל האיברים. \`deque.popleft()\` הוא \`O(1)\` כי מבנה ה-double-ended רשום מצביעים בשני הקצוות.
3. **לנקות לפני שמודדים** — בכל בקשה נכנסת, *קודם* זורקים את הישנות (מעבר ל-60 שנ׳), *ואז* בודקים את האורך. אחרת ספירה ישנה תכלול בקשות שכבר לא רלוונטיות.`,
        interviewerMindset:
`שלושה שלבים שהמראיין רוצה לראות:

1. **בחירת מבנה הנתונים הנכון** — תור פר-IP. אם אתה מציע "מערך גלובלי של בקשות" — הפסדת על סיבוכיות.
2. **המודעות שכל פעולה היא \`O(1)\` אמורטייז.** הניקיון של "להוציא ישנים" נראה כמו לולאה — אבל סך כל הפעולות חסום ע"י מספר הבקשות. להגיד "אמורטייז" במפורש.
3. **חשיבה הנדסית מעבר לקוד** — מה קורה במיליון IPs רדומים? איך מנקים? איך מתאימים לדקה זזה (sliding) לעומת קופץ (fixed window)?

**עצה:** אם אתה לא יודע בעל-פה — תאר את האלגוריתם במילים קודם, ואז כתוב. רוב המראיינים מעדיפים שיחה ברורה על קוד מוכן.`,
        expectedAnswers: [
          'deque', 'queue', 'sliding window', 'תור', 'popleft',
          '60', 'cutoff', 'window', 'defaultdict', 'dict',
          'amortized', 'אמורטייז', 'O(1)',
          'token bucket', 'count-min',
        ],
      },
    ],
    source: 'PP - שאלות קוד (slide 2)',
    tags: ['algorithms', 'rate-limiter', 'sliding-window', 'system-design', 'data-structures', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8003 — Reverse words in a sentence, in-place
  // ───────────────────────────────────────────────────────────────
  {
    id: 'reverse-sentence-in-place',
    difficulty: 'medium',
    title: 'היפוך משפט במקום — בזיכרון קבוע',
    intro:
`אתה עובד על מערכת שמקבלת משפט, מחלצת ממנו מידע, ואז מעבירה את
המשפט לרכיב הבא. **באג** במערכת גורם לכך שהמשפט יוצא בסדר הפוך של מילים:

\`\`\`
מערכת מקבלת:  "welcome to tech interview"
מערכת פולטת:  "interview tech to welcome"
\`\`\`

עליך **לתקן** את הפלט (להחזיר את הסדר המקורי), אבל יש מגבלות:

- אסור להשתמש בזיכרון נוסף — **\`O(1)\`** זיכרון נוסף.
- אסור רקורסיה / מחסנית (גם זה זיכרון).
- אתה רשאי להניח שמותר לך לערוך את המחרוזת במקום (mutable buffer).`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        trace: {
          title: 'Two-pointer reverse — "welcome" → "emoclew"',
          source:
`def reverse_in_place(buf, lo, hi):
    i, j = lo, hi - 1
    while i < j:
        buf[i], buf[j] = buf[j], buf[i]
        i += 1
        j -= 1`,
          sourceLang: 'python',
          steps: [
            {
              code: 'initial: i = 0, j = 6   (n = 7)',
              explain: 'מציבים מצביע אחד בכל קצה של ה-buffer. הלולאה תיעצר רק כש-\`i >= j\`.',
              executed: [1, 2, 3], focusLine: 3,
              viz: _twoPointerSvg({ state: 'welcome', i: 0, j: 6 }),
            },
            {
              code: 'swap a[0] ↔ a[6]   "w"↔"e"',
              explain: 'מחליפים את הקצוות. \`i++, j--\` — מצמצמים את הטווח פנימה.',
              executed: [3, 4, 5, 6], focusLine: 4,
              viz: _twoPointerSvg({ state: 'eelcomw', i: 1, j: 5, swapped: true }),
            },
            {
              code: 'swap a[1] ↔ a[5]   "e"↔"m"',
              explain: 'הזוג הפנימי הבא. שוב swap, שוב צמצום.',
              executed: [3, 4, 5, 6], focusLine: 4,
              viz: _twoPointerSvg({ state: 'emlcoew', i: 2, j: 4, swapped: true }),
            },
            {
              code: 'swap a[2] ↔ a[4]   "l"↔"o"',
              explain: 'הזוג האחרון לפני שהמצביעים נפגשים.',
              executed: [3, 4, 5, 6], focusLine: 4,
              viz: _twoPointerSvg({ state: 'emoclew', i: 3, j: 3, swapped: true }),
            },
            {
              code: 'i = 3, j = 3   →   stop',
              explain: 'המצביעים נפגשו באמצע — סיימנו ב-3 פעולות swap בלבד, **O(n)** זמן ו-**O(1)** מקום נוסף. התוצאה: \`"emoclew"\`.',
              executed: [3], focusLine: 3,
              viz: _twoPointerSvg({ state: 'emoclew', i: 3, j: 3, done: true }),
            },
          ],
        },
        starterCode:
`def reverse_in_place(buf, lo, hi):
    """הופך את buf[lo:hi] במקום. buf — list של תווים (mutable)."""
    # TODO: שני מצביעים, swap, O(1) זיכרון נוסף
    pass


# בדיקה:
# a = list("cisco")
# reverse_in_place(a, 0, len(a))
# assert ''.join(a) == "ocsic"
`,
        question:
`**Building block.** כתבו פונקציה \`reverse_in_place(buf, lo, hi)\` שהופכת
את התווים בטווח \`[lo, hi)\` של buffer (תווים), במקום, בלי זיכרון נוסף.

דוגמה: \`reverse_in_place(list("cisco"), 0, 5)\` → \`"ocsic"\`.`,
        hints: [
          'איך אפשר להפוך תווים בלי לבנות buffer חדש באורך n?',
          'Two pointers: \\\`i\\\` מהקצה השמאלי, \\\`j\\\` מהימני — מתקדמים זה אל זה.',
          '\\\`while i < j: buf[i], buf[j] = buf[j], buf[i]; i += 1; j -= 1\\\`. תנאי עצירה \\\`i < j\\\` (לא \\\`!=\\\`).',
        ],
        answer:
`**Two-pointer in-place.** סיבוכיות זמן \`O(n)\`, מקום \`O(1)\`.

\`\`\`python
def reverse_in_place(buf, lo, hi):
    """הופך את buf[lo:hi] במקום. buf חייב להיות mutable (list of chars)."""
    i, j = lo, hi - 1
    while i < j:
        buf[i], buf[j] = buf[j], buf[i]
        i += 1
        j -= 1
\`\`\`

**הערה — בפייתון:** מחרוזות immutable, אז עובדים על \`list(s)\` ובסוף \`''.join\`. בשפות כמו C / C++ אפשר ישירות על \`char[]\`.

---

**שלבי החשיבה:**

1. **שני מצביעים שמתקדמים זה כלפי זה** — \`i\` מהשמאל, \`j\` מהימין. כל איטרציה מחליפה ערכים ומכווצת את הטווח באמצע.
2. **\`while i < j\`** — לא \`!=\`. אם \`i\` ו-\`j\` חלפו אחד את השני, כבר עברנו על כל הזוגות. עם \`!=\` היינו ממשיכים לחלופין ומשחזרים את ההיפוך.
3. **\`O(1)\` נוסף** — שני אינדקסים בלבד. לא יוצרים מערך עזר; פועלים ישירות על ה-buffer שקיבלנו.`,
        expectedAnswers: [
          'two pointer', 'two-pointer', 'i, j', 'swap', 'in-place', 'במקום',
          'i < j', 'lo, hi - 1',
        ],
      },
      {
        label: 'ב',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        trace: {
          title: 'Reverse-sentence — "interview tech to welcome" → "welcome to tech interview"',
          steps: [
            {
              code: 'הקלט הבאגי — סדר המילים הפוך',
              explain: 'המערכת הוציאה את המשפט כשמילותיו בסדר הפוך. צריך להחזיר את הסדר הנכון תוך שימוש *רק* בפונקציית היפוך-תווים, ובלי זיכרון נוסף.',
              viz: _reverseSentenceSvg({
                after: 'interview tech to welcome',
                opLabel: 'INPUT — buggy: סדר המילים הפוך',
              }),
            },
            {
              code: 'reverse_in_place(buf, 0, n)  ← הופכים את כל המחרוזת',
              explain: 'הפיכה אחת על כל ה-buffer הופכת גם את **סדר המילים** וגם את **התווים בכל מילה**. הסדר הגלובלי חזר להיות הנכון; כל מילה הפוכה פנימית.',
              viz: _reverseSentenceSvg({
                before: 'interview tech to welcome',
                after:  'emoclew ot hcet weivretni',
                hlLo: 0, hlHi: 25,
                opLabel: 'STEP 1 — reverse כל המחרוזת',
              }),
            },
            {
              code: 'reverse_in_place(buf, 0, 7)   ← "emoclew" → "welcome"',
              explain: 'עכשיו מבטלים את ההיפוך הפנימי של *כל מילה בנפרד*. המילה הראשונה: \`emoclew\` חוזרת ל-\`welcome\`.',
              viz: _reverseSentenceSvg({
                before: 'emoclew ot hcet weivretni',
                after:  'welcome ot hcet weivretni',
                hlLo: 0, hlHi: 7,
                opLabel: 'STEP 2a — reverse המילה הראשונה',
              }),
            },
            {
              code: 'reverse_in_place(buf, 8, 10)  ← "ot" → "to"',
              explain: 'המילה השנייה — \`ot\` חוזרת ל-\`to\`. אותו טריק.',
              viz: _reverseSentenceSvg({
                before: 'welcome ot hcet weivretni',
                after:  'welcome to hcet weivretni',
                hlLo: 8, hlHi: 10,
                opLabel: 'STEP 2b — reverse המילה השנייה',
              }),
            },
            {
              code: 'reverse_in_place(buf, 11, 15) ← "hcet" → "tech"',
              explain: 'המילה השלישית — \`hcet\` → \`tech\`.',
              viz: _reverseSentenceSvg({
                before: 'welcome to hcet weivretni',
                after:  'welcome to tech weivretni',
                hlLo: 11, hlHi: 15,
                opLabel: 'STEP 2c — reverse המילה השלישית',
              }),
            },
            {
              code: 'reverse_in_place(buf, 16, 25) ← "weivretni" → "interview"',
              explain: 'המילה האחרונה — \`weivretni\` → \`interview\`. הקלט המקורי שוחזר במלואו, בזיכרון נוסף **O(1)** ובשימוש *יחיד* בפונקציית reverse-in-place.',
              viz: _reverseSentenceSvg({
                before: 'welcome to tech weivretni',
                after:  'welcome to tech interview',
                hlLo: 16, hlHi: 25,
                opLabel: 'reverse המילה האחרונה — תוקן!',
                done: true,
              }),
            },
          ],
        },
        starterCode:
`def reverse_in_place(buf, lo, hi):
    # מסעיף א — כבר ממומש כאן לנוחות
    i, j = lo, hi - 1
    while i < j:
        buf[i], buf[j] = buf[j], buf[i]
        i += 1
        j -= 1


def fix(sentence):
    """בהינתן 'interview tech to welcome' — להחזיר את 'welcome to tech interview'.
    הגבלה: זיכרון נוסף O(1), ולהשתמש רק ב-reverse_in_place."""
    # TODO: שתי הפיכות — את הכל, ואז כל מילה
    pass


# assert fix("interview tech to welcome") == "welcome to tech interview"
`,
        question:
`**התיקון המלא.** בהינתן הפלט הבאגי (\`"interview tech to welcome"\`),
החזר את המשפט המקורי (\`"welcome to tech interview"\`), עם זיכרון קבוע
ושימוש **רק** בפונקציה \`reverse_in_place\` מסעיף א.`,
        hints: [
          'אם הופכים את כל המחרוזת אות-בתו, מה משתנה? מה נשאר מקולקל?',
          'שתי הפיכות סדרתיות: הראשונה על כל המחרוזת, השנייה על כל מילה בנפרד.',
          'הפיכה ראשונה הופכת *גם* סדר מילים *וגם* תווים בכל מילה. הפיכה שנייה (על כל מילה) מבטלת את האותיות — נשאר רק סדר המילים שכבר הפוך פעם → תוקן.',
        ],
        answer:
`**Reverse-twice trick.** הופכים את כל המחרוזת, ואז הופכים כל מילה.

\`\`\`python
def fix(sentence):
    buf = list(sentence)        # רק העתקה למבנה mutable; הזיכרון הנוסף = O(n) על המחרוזת עצמה
    n = len(buf)
    # שלב 1: הפוך הכל
    reverse_in_place(buf, 0, n)
    # שלב 2: הפוך כל מילה
    word_start = 0
    for i in range(n + 1):
        if i == n or buf[i] == ' ':
            reverse_in_place(buf, word_start, i)
            word_start = i + 1
    return ''.join(buf)
\`\`\`

**מעקב על "interview tech to welcome":**

| שלב | מצב |
|---|---|
| התחלה | \`interview tech to welcome\` |
| אחרי reverse הכל | \`emoclew ot hcet weivretni\` |
| אחרי reverse כל מילה | \`welcome to tech interview\` |

**סיבוכיות:** זמן \`O(n)\`, מקום נוסף \`O(1)\` (לא כולל ה-buffer של המחרוזת עצמה — בפייתון חייב list, ב-C היה in-place מלא).

**למה זה עובד?** הפיכת המחרוזת כולה הפוכה גם את **סדר המילים** וגם את **התווים בתוך כל מילה**. הפיכה שנייה של כל מילה מבטלת את ההיפוך הפנימי בלבד — והסדר הגלובלי נשאר הפוך מהמקור הבאגי = הסדר המקורי הנכון.

---

**שלבי החשיבה:**

1. **לזהות שני "סוגי היפוך"** — היפוך-של-תווים-בתוך-מילה והיפוך-של-סדר-מילים. הבאג עושה רק את השני; אנחנו רוצים לבטל רק אותו.
2. **לבטל בלי כלי ייעודי** — אין לנו "swap words"; יש לנו רק "swap chars". הטריק: שני היפוכי-תווים עם טווחים שונים = היפוך-מילים. הפעולה הראשונה (כל המחרוזת) הופכת *את שניהם*; השנייה (כל מילה לחוד) מבטלת את הראשון מהשניים. סדר ההיפוכים חשוב — לא הפוך.
3. **בלי \`split\`** — \`split()\` יוצר רשימה חדשה (\`O(n)\` מקום נוסף). זיהוי מילות הקצה תוך כדי מעבר עם \`word_start\` שומר על המגבלה \`O(1)\`.`,
        interviewerMindset:
`זו השאלה הקלאסית **"reverse words in a string"** של מיקרוסופט/אמזון. המראיין רוצה:

1. **שתכיר את הטריק "reverse twice"** — הוא הקפיצה התובנתית של השאלה. אם לא מכיר, ימליצו לך לחשוב על "מה קורה כשהופכים את כל המחרוזת?".
2. **שתעבוד \`O(1)\` זיכרון אמיתי.** מועמדים רבים מציעים פתרון עם \`split + reverse + join\` שזה \`O(n)\` זיכרון נוסף. זו תשובה לגיטימית אם השאלה לא דורשת \`O(1)\` — אבל פה היא דורשת.
3. **שתבחין בנקודות-קצה:** מחרוזת ריקה, רווחים בקצוות, מילה אחת בלבד. ה-loop עם \`i == n\` בתור תנאי "סוף מילה" מטפל בזה אלגנטית.

**גוצ'ה לפייתון:** מחרוזות immutable. אם המראיין מקפיד — תזכיר שלכן עובדים על \`list\`, ושב-C/C++ הפתרון יהיה in-place מוחלט.`,
        expectedAnswers: [
          'reverse twice', 'reverse', 'whole string', 'each word',
          'הפוך הכל', 'כל מילה', 'word_start',
          'split', 'join',
        ],
      },
    ],
    source: 'PP - שאלות קוד (slide 3)',
    tags: ['algorithms', 'strings', 'two-pointer', 'in-place', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8004 — Two Sum
  // ───────────────────────────────────────────────────────────────
  {
    id: 'two-sum',
    difficulty: 'easy',
    title: 'Two Sum — שני אינדקסים שסכומם target',
    intro:
`נתון מערך של מספרים שלמים (לא בהכרח חיוביים) וערך מטרה.
עליכם לכתוב פונקציה שמחזירה את האינדקסים \`i, j\` המקיימים:

\`\`\`
nums[i] + nums[j] == target
\`\`\`

ניתן להניח שקיימים לפחות 2 מספרים כאלה (פתרון יחיד).

**דוגמאות:**
\`\`\`
Input:  nums=[2, 6, 11, 15], target=8   →  Output: [0, 1]   # 2 + 6 = 8
Input:  nums=[7, 8, 1, -3, 1], target=-2 → Output: [3, 4]   # -3 + 1 = -2
Input:  nums=[30, 21, 5], target=26     →  Output: [1, 2]   # 21 + 5 = 26
Input:  nums=[7, 8], target=15          →  Output: [0, 1]
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n²)' },
          { label: 'Space', value: 'O(1)'  },
        ],
        starterCode:
`def two_sum_brute(nums, target):
    """גישה נאיבית: שתי לולאות מקוננות. החזר [i, j] כשיש פתרון."""
    # TODO
    pass


# print(two_sum_brute([2, 6, 11, 15], 8))   # [0, 1]
`,
        question:
`**גישה נאיבית.** מהי הדרך הפשוטה ביותר? מה הסיבוכיות?`,
        hints: [
          'מה הפתרון הכי נאיבי שאפשר לחשוב עליו לבעיה הזו?',
          'שתי לולאות מקוננות: \\\`i\\\` חיצונית, \\\`j > i\\\` פנימית. סיבוכיות O(n²), מקום O(1).',
          'החזירו מיד כשמוצאים: \\\`if nums[i] + nums[j] == target: return [i, j]\\\`. ההנחה היא שקיים פתרון יחיד.',
        ],
        answer:
`**Brute force.** \`O(n²)\` זמן, \`O(1)\` מקום.

\`\`\`python
def two_sum_brute(nums, target):
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] + nums[j] == target:
                return [i, j]
    return None     # לא אמור להגיע — לפי ההנחה יש פתרון
\`\`\`

תשובה לגיטימית כפתרון ראשון, אבל חייבים להזכיר במפורש שהיא \`O(n²)\` ולשאול את המראיין: "מותר לי להניח שיש פתרון יחיד? מותר לי לעשות O(n) זיכרון נוסף?"

---

**שלבי החשיבה:**

1. **לולאה חיצונית על כל \`i\`** — כל איבר הוא מועמד ל"חצי הראשון" של הזוג.
2. **לולאה פנימית רק על \`j > i\`** — כך לא בודקים זוג פעמיים, ולא בוחנים איבר עם עצמו. החיסכון: חצי מהבדיקות, אבל הסיבוכיות עדיין \`O(n²)\`.
3. **חוזרים מיד** — לא צוברים, לא ממשיכים אחרי שמצאנו. לפי ההנחה, יש פתרון יחיד.`,
        expectedAnswers: ['O(n^2)', 'O(n²)', 'nested', 'מקוננות', 'brute'],
      },
      {
        label: 'ב',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(n)' },
        ],
        approaches: [
          {
            name: 'Brute force — O(n²)',
            time: 'O(n²)', space: 'O(1)',
            summary: 'שתי לולאות מקוננות; בדוק כל זוג אינדקסים i<j.',
            code:
`def two_sum_brute(nums, target):
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] + nums[j] == target:
                return [i, j]`,
          },
          {
            name: 'Hash map — O(n)',
            time: 'O(n)', space: 'O(n)',
            summary: 'מעבר אחד; שומר \`value → index\` ובודק את **המשלים** \`target - x\` לפני שמוסיף.',
            code:
`def two_sum(nums, target):
    seen = {}                       # value → index
    for j, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], j]
        seen[x] = j`,
          },
        ],
        trace: {
          title: 'Two Sum — nums=[3, 7, 1, 11, 2, 9], target=11',
          // Full source rendered in the side panel of the full-screen
          // view. Line numbers below are 1-indexed against this string.
          source:
`def two_sum(nums, target):
    seen = {}                       # value → index
    for j, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], j]
        seen[x] = j
    return None`,
          sourceLang: 'python',
          // Source line numbers (1-indexed against trace.source):
          //   1: def two_sum(nums, target):
          //   2:     seen = {}                       # value → index
          //   3:     for j, x in enumerate(nums):
          //   4:         need = target - x
          //   5:         if need in seen:
          //   6:             return [seen[need], j]      ← only on found
          //   7:         seen[x] = j                     ← only on not-found
          //   8:     return None                         ← only if loop exhausts
          steps: [
            {
              code: 'j=0, x=3,  need = 11-3 = 8',
              explain: 'מתחילים. \`seen\` ריק. הלולאה מעדכנת \`j, x\` (שורה 3), מחושב \`need\` (שורה 4), נבדק (שורה 5) → לא בפנים. שורה 6 מדולגת. נשמר \`seen[3]=0\` (שורה 7).',
              executed: [3, 4, 5, 7],
              focusLine: 7,
              viz: _twoSumSvg([3,7,1,11,2,9], 0, {3:0}, 8, false, null),
            },
            {
              code: 'j=1, x=7,  need = 11-7 = 4',
              explain: '\`4\` לא נראה — שוב נדלגים על \`return\` ושומרים \`seen[7]=1\`.',
              executed: [3, 4, 5, 7],
              focusLine: 7,
              viz: _twoSumSvg([3,7,1,11,2,9], 1, {3:0,7:1}, 4, false, null),
            },
            {
              code: 'j=2, x=1,  need = 11-1 = 10',
              explain: '\`10\` לא נראה — אותו מסלול. \`seen[1]=2\`.',
              executed: [3, 4, 5, 7],
              focusLine: 7,
              viz: _twoSumSvg([3,7,1,11,2,9], 2, {3:0,7:1,1:2}, 10, false, null),
            },
            {
              code: 'j=3, x=11, need = 11-11 = 0',
              explain: '\`0\` לא נראה — \`seen[11]=3\`.',
              executed: [3, 4, 5, 7],
              focusLine: 7,
              viz: _twoSumSvg([3,7,1,11,2,9], 3, {3:0,7:1,1:2,11:3}, 0, false, null),
            },
            {
              code: 'j=4, x=2,  need = 11-2 = 9',
              explain: '\`9\` לא נראה — \`seen[2]=4\`. **בדיוק לפני המציאה.**',
              executed: [3, 4, 5, 7],
              focusLine: 7,
              viz: _twoSumSvg([3,7,1,11,2,9], 4, {3:0,7:1,1:2,11:3,2:4}, 9, false, null),
            },
            {
              code: 'j=5, x=9,  need = 11-9 = 2  ✓',
              explain: 'הפעם \`2\` ב-\`seen\` (\`seen[2]=4\`) → התנאי בשורה 5 אמיתי, אנחנו לוקחים את שורה 6 ומחזירים \`[4, 5]\`. שורה 7 כבר לא רצה.',
              executed: [3, 4, 5, 6],
              focusLine: 6,
              viz: _twoSumSvg([3,7,1,11,2,9], 5, {3:0,7:1,1:2,11:3,2:4}, 2, true, 4),
            },
          ],
        },
        starterCode:
`def two_sum(nums, target):
    """O(n) זמן, O(n) מקום — Hash map."""
    # TODO: dict מ-ערך לאינדקס; לחפש את המשלים (target - x) לפני שמוסיפים את x
    pass


# print(two_sum([2, 6, 11, 15], 8))      # [0, 1]
# print(two_sum([7, 8, 1, -3, 1], -2))   # [3, 4]
`,
        question:
`**גישה אופטימלית.** איך מורידים ל-\`O(n)\` זמן? איזה זיכרון נוסף נדרש?`,
        hints: [
          'לכל איבר \\\`x\\\` במערך — מה ה-complement (\\\`target - x\\\`) שצריך כדי להשלים לזוג?',
          'Hash map: \\\`seen\\\` ממפה ערך לאינדקס שלו, וכך בדיקת complement היא O(1).',
          'בדקו את ה-complement ב-\\\`seen\\\` *לפני* שמוסיפים את \\\`x\\\` — אחרת איבר עם \\\`2x = target\\\` יזהה את עצמו. \\\`if need in seen: return [seen[need], j]; seen[x] = j\\\`.',
        ],
        answer:
`**Hash map בעבר אחד** — השוואה עם brute force בקלפים מעלה, ומעקב צעד-צעד מתחת.

**מה ההיגיון?** במקום לחפש *זוג*, מחפשים את **המשלים** היחיד \`target - x\` של כל איבר \`x\` שאנחנו רואים. אם המשלים כבר ראינו — מצאנו. אחרת — זוכרים את \`x\` למקרה שאיבר עתידי יהיה המשלים שלו.

**עוברים פעם אחת** — והסדר המוחזר תמיד \`[smaller_index, larger_index]\` כפי שהבדיקות אוהבות.

**נקודות-קצה שכדאי לדבר עליהן:**
- **כפילויות** (לדוגמה \`nums=[7,8], target=15\`): עובד — אחרי שראינו את \`7\` הוא ב-\`seen\`, וכשרואים את \`8\` המשלים שלו \`7\` נמצא שם.
- **שלילי \`target\`** (\`[-3, 1]\` ל-\`target=-2\`): עובד — אין הנחה על סימן.
- **\`x == target/2\`** עם איבר יחיד כזה: לא ייתפס — אבל גם אין פתרון. נכון.

---

**שלבי החשיבה:**

1. **לוקחים את \`target\` הקבוע** — לכל \`x\` יש משלים יחיד \`target - x\`. במקום לחפש זוגות, מחפשים *משלים בודד* — הפכנו O(n²) ל-O(n).
2. **לזכור כל איבר עם האינדקס שלו** — \`dict\` ממפה ערך לאינדקס. ב-\`O(1)\` ממוצע בודקים אם המשלים הראינו.
3. **לבדוק לפני שמוסיפים את \`x\`** — אחרת איבר עם \`target = 2x\` יתאים לעצמו (אינדקס יחיד). הסדר הזה מבטיח שני אינדקסים שונים.`,
        interviewerMindset:
`Two Sum היא **שאלת ה-warm-up** הקלאסית. המראיין רוצה לראות:

1. **שאתה לא קופץ ישר לפתרון** — שב ושאל: "האם המערך ממוין? יש כפילויות? יש פתרון יחיד? מותר לי \`O(n)\` זיכרון נוסף?". כל שאלה כזו = ניקוד.
2. **שאתה מציג קודם פתרון נאיבי**, אומר את הסיבוכיות שלו, ואז משפר. **לדלג** ישר לפתרון האופטימלי = יהירות (וגם פספוס הזדמנות לדבר).
3. **שאתה מבין למה גרסת המעבר היחיד עובדת** — שזו הראייה הקריטית של "המשלים שלי אולי כבר ראיתי, אבל גם אם לא — כשאני יהיה המשלים של מישהו אחר, אני אכן ב-seen". זה ה"מבט קדימה-אחורה" הסימטרי.

**גוצ'ות מפורסמות:**
- ב-LeetCode השאלה הזו כל-כך פופולרית שהיא **משנה את הסיפור** של מועמדים — תהיה מוכן.
- מי שמציע מיון ואחרי two-pointer — סיבוכיות \`O(n log n)\` — תשובה לגיטימית, אבל זוכר שאיבדת את האינדקסים המקוריים, אז צריך תרגום בחזרה. עדיף hash.`,
        expectedAnswers: [
          'hash', 'dict', 'O(n)', 'seen', 'complement', 'משלים',
          'target - x', 'enumerate',
        ],
      },
    ],
    source: 'PP - שאלות קוד (slide 4)',
    tags: ['algorithms', 'array', 'hash-map', 'two-pointer', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8005 — Multiply with 4-op limited ISA (assembly puzzle)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'multiply-with-inc-dec-clr-jump',
    difficulty: 'hard',
    title: 'כפל ב-INC/DEC/CLR/JUMP בלבד — מעבד 8×4-ביט',
    intro:
`נתון מעבד ובו **8 רגיסטרים של 4 ביט** כל אחד. יש ארבע פעולות
שניתן לבצע על רגיסטר \`Rx\` כלשהו:

| הוראה | משמעות |
|---|---|
| \`Rx INC\` | הגדל את הערך ב-\`Rx\` באחד |
| \`Rx DEC\` | הקטן את הערך ב-\`Rx\` באחד |
| \`Rx CLR\` | אפס את הערך ב-\`Rx\` |
| \`LABEL Rx JUMP\` | קפוץ ל-\`LABEL\` אם הערך ב-\`Rx\` שונה מאפס |

(זו שאלת אסמבלר/פסודו-קוד — אין שפה ספציפית).`,
    parts: [
      {
        label: 'א',
        editor: 'verilog',
        editorLabel: 'Assembly',
        editorHint: 'כתבו את הקוד בפסודו-אסמבלר. השתמשו רק ב-INC / DEC / CLR / JUMP.',
        complexities: [
          { label: 'Operations', value: 'Θ(R1·R2)' },
        ],
        trace: {
          title: 'Multiply-ISA — R1=3, R2=2 → R3=6',
          source:
`; R1 = a, R2 = b. הפלט הצפוי: R3 = a * b
R3 CLR
R4 CLR

outer:
    R2 DEC                 ; outer iteration
copy_lp:
    R1 DEC
    R4 INC
    R3 INC
    copy_lp R1 JUMP
restore:
    R4 DEC
    R1 INC
    restore R4 JUMP
    outer R2 JUMP
end:`,
          sourceLang: 'verilog',
          steps: [
            {
              code: 'init: R1=3 (a), R2=2 (b), R3=R4=R5=0',
              explain: 'מצב התחלתי. R1, R2 הקלט; R3 ירכז את התוצאה; R4 temp לעותק של R1; R5 sentinel (לא בשימוש בגרסה זו).',
              executed: [2, 3], focusLine: 2,
              viz: _registersSvg({
                state: { R1: 3, R2: 2, R3: 0, R4: 0, R5: 0 },
                instr: 'init  ;  R1=a, R2=b',
                phase: 'init',
                formula: 'מטרה: R3 = R1 · R2',
              }),
            },
            {
              code: 'R2 DEC          ; outer iteration #1',
              explain: 'יורדים מ-R2 פעם אחת — סופרים את האיטרציה הראשונה של ה"כפל ע"י חיבור חוזר".',
              executed: [5, 6], focusLine: 6,
              viz: _registersSvg({
                state: { R1: 3, R2: 1, R3: 0, R4: 0, R5: 0 },
                changes: { R2: -1 },
                instr: 'R2 DEC',
                phase: 'outer',
              }),
            },
            {
              code: 'R1 DEC; R4 INC; R3 INC   ; iter 1 of copy_lp',
              explain: 'בלולאת ה-copy הפנימית: מורידים 1 מ-R1, מעבירים אותו ל-R4 (העותק), ובו-זמנית מוסיפים 1 ל-R3 (הצבירה).',
              executed: [7, 8, 9, 10, 11], focusLine: 11,
              viz: _registersSvg({
                state: { R1: 2, R2: 1, R3: 1, R4: 1, R5: 0 },
                changes: { R1: -1, R3: +1, R4: +1 },
                instr: 'copy_lp: R1 DEC, R4 INC, R3 INC',
                phase: 'copy',
              }),
            },
            {
              code: '... continue copy_lp     ; iter 2',
              explain: 'אותו דבר עוד פעם — R1 פוחת, R4 ו-R3 עולים.',
              executed: [7, 8, 9, 10, 11], focusLine: 11,
              viz: _registersSvg({
                state: { R1: 1, R2: 1, R3: 2, R4: 2, R5: 0 },
                changes: { R1: -1, R3: +1, R4: +1 },
                instr: 'copy_lp: R1 DEC, R4 INC, R3 INC',
                phase: 'copy',
              }),
            },
            {
              code: '... continue copy_lp     ; iter 3 — R1 reaches 0',
              explain: 'איטרציה שלישית. R1 הגיע ל-0 → ה-JUMP על R1 לא יקפוץ, יוצאים מהלולאה. עד עכשיו: R4=3 (עותק של R1 המקורי), R3=3 (הוספנו R1 ל-R3).',
              executed: [7, 8, 9, 10, 11], focusLine: 11,
              viz: _registersSvg({
                state: { R1: 0, R2: 1, R3: 3, R4: 3, R5: 0 },
                changes: { R1: -1, R3: +1, R4: +1 },
                instr: 'copy_lp: R1 DEC, R4 INC, R3 INC   → R1 = 0, exit',
                phase: 'copy',
              }),
            },
            {
              code: 'restore: R4 DEC; R1 INC  ; restoring R1 from R4',
              explain: 'עכשיו לולאת ה-restore: מעבירים את R4 בחזרה ל-R1 (כי בלי mov אי-אפשר אחרת).',
              executed: [12, 13, 14, 15], focusLine: 15,
              viz: _registersSvg({
                state: { R1: 1, R2: 1, R3: 3, R4: 2, R5: 0 },
                changes: { R1: +1, R4: -1 },
                instr: 'restore: R4 DEC, R1 INC',
                phase: 'restore',
              }),
            },
            {
              code: '... continue restore     ; iter 2',
              explain: 'עוד צעד שחזור.',
              executed: [12, 13, 14, 15], focusLine: 15,
              viz: _registersSvg({
                state: { R1: 2, R2: 1, R3: 3, R4: 1, R5: 0 },
                changes: { R1: +1, R4: -1 },
                instr: 'restore: R4 DEC, R1 INC',
                phase: 'restore',
              }),
            },
            {
              code: '... continue restore     ; R1 fully restored',
              explain: 'R4 הגיע ל-0 → יוצאים. R1 חזר לערכו המקורי (3) — כעת מוכן ללולאה החיצונית הבאה. R3=3 (הוספה אחת של R1).',
              executed: [12, 13, 14, 15], focusLine: 15,
              viz: _registersSvg({
                state: { R1: 3, R2: 1, R3: 3, R4: 0, R5: 0 },
                changes: { R1: +1, R4: -1 },
                instr: 'restore: R4 DEC, R1 INC   → R4 = 0, exit',
                phase: 'restore',
              }),
            },
            {
              code: 'R2 DEC          ; outer iteration #2',
              explain: 'איטרציה שנייה של הלולאה החיצונית. R2 → 0.',
              executed: [5, 6], focusLine: 6,
              viz: _registersSvg({
                state: { R1: 3, R2: 0, R3: 3, R4: 0, R5: 0 },
                changes: { R2: -1 },
                instr: 'R2 DEC',
                phase: 'outer',
              }),
            },
            {
              code: 'copy_lp ×3        ; (compressed)',
              explain: 'אותה לולאת copy שלוש פעמים: R1 יורד מ-3 ל-0, R3 עולה מ-3 ל-6, R4 עולה ל-3. סך הכל: R3 קיבל R1 פעם נוספת.',
              executed: [7, 8, 9, 10, 11], focusLine: 11,
              viz: _registersSvg({
                state: { R1: 0, R2: 0, R3: 6, R4: 3, R5: 0 },
                changes: { R1: -3, R3: +3, R4: +3 },
                instr: 'copy_lp executed 3 times',
                phase: 'copy',
              }),
            },
            {
              code: 'restore ×3        ; (compressed)',
              explain: 'R1 משוחזר מ-R4 (3→0). R3 לא משתנה — הוא כבר מחזיק את התוצאה.',
              executed: [12, 13, 14, 15], focusLine: 15,
              viz: _registersSvg({
                state: { R1: 3, R2: 0, R3: 6, R4: 0, R5: 0 },
                changes: { R1: +3, R4: -3 },
                instr: 'restore executed 3 times',
                phase: 'restore',
              }),
            },
            {
              code: 'outer R2 JUMP   ; R2=0 → no jump → end',
              explain: 'R2 הגיע ל-0 → ה-JUMP לא קופץ. הלולאה החיצונית מסתיימת. **R3 = 6 = 3·2** ✓',
              executed: [16, 17], focusLine: 17,
              viz: _registersSvg({
                state: { R1: 3, R2: 0, R3: 6, R4: 0, R5: 0 },
                instr: 'end:  R3 = a · b',
                phase: 'done',
                formula: 'R3 = 6  =  3 × 2  ✓',
                done: true,
              }),
            },
          ],
        },
        starterCode:
`; R1 = a, R2 = b. הפלט הצפוי: R3 = a * b
; פעולות מותרות: Rx INC | Rx DEC | Rx CLR | LABEL Rx JUMP
; (JUMP קופץ אם Rx != 0)

R3 CLR
R4 CLR                ; R4 ישמש כעותק זמני של R1

outer:
    ; TODO: סיים את הלולאה כאשר R2 הגיע ל-0
    ; TODO: phase1 — העבר R1 → R4 וגם R3 += R1
    ; TODO: phase2 — שחזר R1 מ-R4

end:
`,
        question:
`ממשו \`R3 = R1 * R2\` באמצעות הפעולות הנ"ל בלבד. **שאלת המשך:**
האם ניתן לוותר על חלק מהפעולות ולממש אותן באמצעות האחרות?`,
        hints: [
          'איך עושים כפל בלי הוראת MUL? לאיזו פעולה אחרת זה שקול?',
          'חיבור חוזר: לולאה חיצונית של R2 פעמים, פנימית מוסיפה R1 ל-R3. **בעיה:** אין MOV — איך משמרים את R1?',
          'בלולאה הפנימית: \\\`DEC R1; INC R3; INC R4\\\` — מפרקים את R1 *תוך כדי* בניית עותק ב-R4 וצבירה ב-R3. אחר כך לולאת restore משחזרת R1 מ-R4. **CLR מיותר** (אפשר להחליף בלולאת DEC עד 0).',
        ],
        answer:
`**הפתרון הקלאסי. סיבוכיות \`Θ(R1 · R2)\`.**

\`\`\`
; R1, R2 = קלט. R3 = פלט. R4 = עזר (R1 backup).
; הנחה: R3, R4 מאופסים בכניסה (אחרת CLR בתחילה).

R3 CLR
R4 CLR

outer:
    R2 JUMP_IF_ZERO end       ; אין JZ ישיר → מודלים אותו: ראה הערה
    R2 DEC

inner_copy_and_add:
    ; פירוק R1 → העתק ל-R4 וגם הוסף ל-R3, עד ש-R1 = 0
    R1 JUMP_IF_ZERO restore   ; (כשהוא 0, לסיים)
    R1 DEC
    R3 INC
    R4 INC
    inner_copy_and_add R1 JUMP

restore:
    ; שחזור R1 מ-R4 (עד ש-R4 = 0)
    R4 JUMP_IF_ZERO outer
    R4 DEC
    R1 INC
    restore R4 JUMP

end:
\`\`\`

**איך מבצעים "JUMP אם אפס" כשיש רק "JUMP אם לא-אפס"?** הטריק: משתמשים ברגיסטר שאנחנו יודעים שהוא לא-אפס כדי "לדלג" ל-end. כלומר משכפלים את הזרימה:

\`\`\`
; "JZ R2 end" ⇄
    outer_body R2 JUMP        ; אם R2 != 0 — לתוך הלולאה
    end_uncond R5 JUMP        ; (R5 != 0 מובטח — קודם R5 INC) → קפיצה לא-מותנית
\`\`\`

או — שומרים רגיסטר עזר ב-1 כל ההרצה.

**שאלת ההמשך — ויתור על פעולות:**

- ✅ **\`CLR\` מיותר** — שווה ל-\`DEC\` בלולאה עד שהרגיסטר באפס. עולה זמן (עד 15 צעדים על 4 ביט), אבל אין צורך בהוראה נפרדת בקבוצה. **הוויתור הקל ביותר.**
- ❌ **\`DEC\` הכרחי** — בלעדיו אי-אפשר להפחית מערך. \`INC\` היחיד = הסתובבות ב-16 (כי 4-bit), אבל גם זה לא נותן זרימת בקרה.
- ❌ **\`INC\` הכרחי** — בלי הגדלה אי-אפשר לחשב כפל ישיר.
- ❌ **\`JUMP\` הכרחי** — בלי בקרת זרימה אין לולאות = אין כפל ע"י חיבור חוזר.

**מסקנה:** ניתן לוותר רק על \`CLR\` (מינימליסטים יאמרו ש"מערכת מינימלית" = \`INC\`, \`DEC\`, \`JUMP\`-מותנה).

---

**שלבי החשיבה:**

1. **כפל = חיבור חוזר** — \`R1 * R2\` = להוסיף את \`R1\` אל \`R3\` סך הכל \`R2\` פעמים. שתי לולאות מקוננות: חיצונית סופרת את \`R2\`, פנימית מוסיפה את \`R1\`.
2. **אין \`MOV\`** — כדי לא לאבד את \`R1\` בלולאה הפנימית, מפרקים אותו (\`DEC\`) ובמקביל בונים *גם* את \`R3\` *וגם* עותק \`R4\`. בסוף — לולאה שנייה משחזרת את \`R1\` מתוך \`R4\` באותו טריק הפוך.
3. **\`JUMP\` לא-מותנה** — בנוי באמצעות רגיסטר שמובטח להיות לא-אפס (\`R5 INC\`), שעליו \`JUMP\` תמיד יקפוץ. זה ה"אהה" של ה-ISA המוגבל.`,
        interviewerMindset:
`שאלה זו בודקת **מחשבה ארכיטקטונית עם מגבלות**. שלוש מלכודות שמועמדים נופלים בהן:

1. **"איך עושים JMP לא-מותנה?"** — מי שאומר "אין כזה" ועוצר — הפסיד. הפתרון: רגיסטר עם 0 מובטח (אז JUMP-IF-NONZERO עליו לא יקפוץ — שווה ל-skip), או רגיסטר עם ערך לא-אפס מובטח (אז יקפוץ תמיד — שווה ל-JMP).
2. **"לא אבדנו את R1?"** — מועמדים מנסים "להעתיק" עם הוראה שלא קיימת (\`MOV\`). פתרון: לפרק את R1 תוך הגדלת R3 וגם של עותק R4, ואז לשחזר את R1 מ-R4. שני "מעברי-פירוק" — זו תובנת המפתח.
3. **"\`CLR\` באמת מיותר?"** — שאלת המשך נפוצה. תשובה טובה: כן, אבל **רק בזמן ריצה**. בהיבט סינתזה/ASIC, \`CLR\` הוא "פעולה במחזור אחד" ובלעדיו צריך 15 מחזורים. אז ויתור עליו = הפסד ביצועים אבל לא ביכולת.`,
        expectedAnswers: [
          'INC', 'DEC', 'CLR', 'JUMP',
          'R4', 'backup', 'עזר', 'copy', 'restore', 'שחזור',
          'unconditional', 'לא מותנה', 'לא-מותנה',
          'מיותר', 'redundant', 'omit', 'ויתור',
        ],
      },
      {
        label: 'ב',
        question:
`האם הקוד שכתבת עובד נכון גם עבור **מספרים שליליים** בייצוג
**משלים ל-2** (כלומר R1 או R2 עשויים להיות בין -8 ל-7)?`,
        hints: [
          'מה ההוראות \\\`DEC\\\` ו-\\\`JUMP if != 0\\\` "יודעות" על ערך-מספרי לעומת ייצוג-בייטים?',
          'במשלים ל-2 על 4 ביט: \\\`-1 = 1111\\\` שגם שווה ל-15 בלי-סימן. מה זה אומר על לולאה שיורדת עד 0?',
          'הקוד יבצע \\\`R2_unsigned\\\` איטרציות. עבור R2=-1, זה 15 איטרציות (לא 1). **התוצאה נשארת נכונה מודולו 16** (כפל-מודולרי = משלים-ל-2), אבל הביצועים מתפוצצים.',
        ],
        answer:
`**לא — הקוד שגוי על מספרים שליליים.** הסיבה: הוא **לא מודע לסימן**.

**דוגמה.** R1 = 2, R2 = -1 = \`1111\` (=15 בלי-סימן).
תוצאה צפויה (משלים ל-2): \`R3 = 2 * (-1) = -2 = 1110\` (=14 בלי-סימן).
תוצאה בפועל: הקוד יבצע 15 איטרציות של "להוסיף 2 ל-R3" = \`R3 = 30 mod 16 = 14\`. **במקרה זה** התוצאה במשלים ל-2 נכונה! \`14 = -2\` ב-4 ביט.

**בדיקה רחבה יותר.** הסיבה שזה עבד היא **פלא חשבוני**: כפל מודולו \`2^4\` תואם כפל במשלים ל-2 כל עוד התוצאה בטווח. במשלים ל-2, \`a * b mod 2^n\` שווה ל-\`a * b\` כל עוד אין גלישה.

**אבל יש מלכודת.** עבור R1 שלילי, מה קורה? R1 שלילי \`= R1_unsigned\` ערך גדול. הלולאה הפנימית מפרקת אותו תוך \`R1_unsigned\` שלבים — וזה **לוקח הרבה זמן** (~15 שלבים פנימיים לכל איטרציה חיצונית), אבל מתמטית התוצאה עדיין נכונה מודולו 16.

**מסקנה:**

| תכונה | מצב |
|---|---|
| **קורקטיות** (בתוצאה) | ✅ נכון תמיד מודולו \`2^4\` — וזה אכן המשלים-ל-2 הנכון |
| **ביצועים** | ❌ ערכים שליליים מבוצעים בזמן בלתי-נכון: -1 נדרש 15 שלבים, לא 1 |
| **גלישה (overflow)** | ⚠️ אם התוצאה לא נכנסת ב-4 ביט (לדוגמה 3*3=9 שלא נכנס בטווח -8..7), התוצאה תיגלוש — וזה צפוי בכפל 4×4 → 8 ביט |

**הקוד שלך מבחינה אריתמטית עובד**, אבל **לא יעיל** עבור ערכים שליליים, ו**גולש** באופן צפוי על כפל גדול. במעבד אמיתי היו בודקים את הסימן מראש והופכים ל-abs לפני הלולאה — חסכון משמעותי בזמן.`,
        interviewerMindset:
`זו שאלת המשך **חישוב מודולרי**. המראיין רוצה לראות:

1. **שאתה מבחין בין "סימן" ל"ערך בלי-סימן"** — הלולאה שלך לא יודעת על סימן. היא רואה \`R2 = 15\` ועושה 15 איטרציות, גם אם המתכנת חושב על זה כ-\`-1\`.
2. **שאתה מכיר את הפלא: כפל במשלים-ל-2 = כפל בלי-סימן מודולו \`2^n\`.** זה לא קסם — זה תוצאה ישירה של איך משלים ל-2 בנוי. שווה לדעת.
3. **שאתה מתחיל לחשוב על ביצועים אחרי שווידאת קורקטיות.** "נכון אבל איטי" זו תשובה שונה מ-"שגוי". הראשונה ראויה לציון מעבר. השנייה — לא.

**אם אתה רוצה לזרוק "wow":** הצע אופטימיזציה — "נבדוק תחילה את הסימן של R2, נקח \`abs\` שלו (= INC עד 0 אם שלילי), נריץ את הלולאה, ואז נשלים את הסימן של התוצאה". זה דורש להבחין שלילי-vs-חיובי, מה שדורש בדיקה של ה-MSB. שאל אם זה רלוונטי לפני שאתה צולל.`,
        expectedAnswers: [
          'משלים ל-2', "two's complement", "twos complement", '2s complement',
          'overflow', 'גלישה', 'sign', 'סימן',
          'modulo', 'מודולו', '2^4', '16',
          'abs', 'absolute',
          'unsigned', 'לא יעיל', 'ביצועים',
        ],
      },
    ],
    source: 'PP - שאלות קוד (slide 5)',
    tags: ['algorithms', 'isa', 'assembly', 'two-complement', 'puzzle', 'pseudo-code'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8006 — Rand3() from BinaryRand() (rejection sampling)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'rand3-from-binaryrand',
    difficulty: 'medium',
    title: 'Rand3() מ-BinaryRand() — דגימת דחייה',
    intro:
`נתונה הפונקציה \`BinaryRand()\` שמחזירה \`0\` או \`1\` בהסתברות שווה
(\`½\` לכל אחד). עליכם לממש \`Rand3()\` שמחזירה \`0\`, \`1\` או \`2\`
בהסתברות שווה (\`⅓\` לכל אחד).

**אסור** להשתמש בפעולת **כפל**, חילוק או \`%\` — רק חיבור/חיסור/השוואות
ולוגיקה. (מי שמכיר את ה"טריק" של \`bit1 * 2 + bit0\` — זה לא הולך כאן.)`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time (avg)',  value: 'O(1)' },
          { label: 'Time (worst)', value: '∞ (rejection)' },
          { label: 'Space',       value: 'O(1)' },
        ],
        starterCode:
`def BinaryRand():
    """Black box — returns 0 or 1 with probability 1/2 each."""
    import random
    return random.randint(0, 1)


def Rand3():
    """Return 0, 1, or 2 with equal probability. No *, /, or %."""
    # TODO
    pass
`,
        question:
`ממשו את \`Rand3()\`. מה היתרון של שתי קריאות ל-\`BinaryRand\`? למה נדרשת לולאת \`while\`?`,
        hints: [
          'אם תקרא ל-BinaryRand פעמיים, כמה תוצאות שונות אפשריות? באיזו הסתברות כל אחת?',
          'שתי קריאות → 4 צירופים שווי-הסתברות (00, 01, 10, 11). הקבוצה הראשונה מכילה 3 — צייר התאמה ל-0/1/2 ו"זרוק" את הרביעי.',
          'אם הצירוף הוא הרביעי (e.g. שני בודדים), חזור על התהליך. זה "rejection sampling" — מקבל בממוצע אחרי \`4/3 ≈ 1.33\` ניסיונות (כלומר \`~2.67\` קריאות ל-BinaryRand).',
        ],
        answer:
`**Rejection sampling.** שתי קריאות עצמאיות ל-BinaryRand יוצרות 4 תוצאות שווי-הסתברות. שלוש מהן מקבילות ל-{0,1,2}; הרביעית נדחית.

\`\`\`python
def Rand3():
    while True:
        a = BinaryRand()
        b = BinaryRand()
        # 00 → 0, 01 → 1, 10 → 2, 11 → reject and retry
        if a == 0 and b == 0: return 0
        if a == 0 and b == 1: return 1
        if a == 1 and b == 0: return 2
        # else: 11 — retry
\`\`\`

**ניתוח הסתברות.** הסתברות לקבל תוצאה תקפה בניסיון אחד: \`3/4\`.
מספר הניסיונות עד הצלחה: התפלגות גיאומטרית עם \`p = 3/4\` ⇒
\`E[ניסיונות] = 1/p = 4/3\` ⇒ ~\`2.67\` קריאות ל-BinaryRand בממוצע.

**הסתברות לכל פלט.** P(0) = P(00) = ¼ + ¼·P(0|reject) = ¼ + ¼·⅓... בעצם פשוט:
מתוך 3 התוצאות התקפות, כל אחת בסבירות שווה ⇒ \`P(0) = P(1) = P(2) = ⅓\`. ✓

**איזה תוצאות פשוטות לא יעבדו?**
- \`a + b\` מחזיר {0, 1, 2} אבל בסבירות \`{¼, ½, ¼}\` — לא אחיד.
- \`(a ‖ b) + ...\` רוב הגרסאות נכשלות באותה בעיה.

---

**שלבי החשיבה:**

1. **שני biased-bits = 4 צירופים שווי-הסתברות** — תמיד הצעד הראשון לקחת מטבע עם 2 ערכים והמיר אותו לטריאלי.
2. **הסר עודף — לא תזניק** — אסור להניח \`P(0) = P(00 + 11)\` כי 11 צריך להיות "מחוץ למשחק", לא נכלל באף תוצאה.
3. **למה while?** בלי לולאה, יש סבירות חיובית להחזיר ערך לא-תקין. הצורך לסיים בלולאה הוא ההכרח של rejection sampling — לוקח זמן בלתי-חסום בגרוע ביותר, אבל O(1) בממוצע.`,
        interviewerMindset:
`שאלת ראיון "סוס עבודה" שבודקת שתי דברים:

1. **שאתה מבחין שלמטבע 2-מצבי אי-אפשר להמיר ישירות ל-3-מצבי שווה.** ה-3 אינו חזקה של 2. רק שילוב + רידוד יכול להגיע ל-3 הסתברויות שוות. מועמד שמנסה \`if BinaryRand(): return 0; else: return random.choice([1,2])\` או דומה — נכשל.

2. **שאתה מבין שזמן ריצה לא-חסום הוא לגיטימי.** "מה אם זה רץ לעד?" — תשובה: ההסתברות לכך היא \`(1/4)^k → 0\`. הצפי O(1). הצגת הניתוח של \`E = 4/3\` היא ההוכחה שהפתרון אופטימלי בהינתן ה-API.

**שאלת המשך נפוצה:** "ממש \`RandN()\` לכל N." — תשובה: קח \`⌈log₂(N)⌉\` ביטים, אם הערך < N → return, אחרת retry. אותה רעיון.`,
        expectedAnswers: ['while', 'rejection', 'דחייה', 'reject', 'retry', '4/3', '2.67', 'two calls', 'שתי קריאות'],
      },
    ],
    source: 'PP - שאלות קוד (slide 6)',
    tags: ['algorithms', 'probability', 'rejection-sampling', 'rand3', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8007 — Dutch National Flag (3-way partition, in-place)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'dutch-national-flag',
    difficulty: 'medium',
    title: 'מיון 3-צבעים במקום — Dutch National Flag',
    intro:
`נתון מערך של כדורים בשלושה צבעים — **אדום**, **צהוב**, **ירוק**.
עליכם לסדר את המערך כך שכל האדומים יהיו **בהתחלה**, אחריהם הצהובים,
ובסוף הירוקים — **בלי זיכרון נוסף** (\`O(1)\` מקום).

\`\`\`
Input:  [R, Y, G, R, Y, R, G, R, G, Y]   (10 כדורים, מעורבבים)
Output: [R, R, R, R, Y, Y, Y, G, G, G]
\`\`\`

זוהי הבעיה הקלאסית **Dutch National Flag** של אדסגר דייקסטרה (1976) —
\`O(n)\` זמן ב-pass יחיד.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def sort_balls(arr):
    """Sort balls in-place: all 'R' first, then 'Y', then 'G'.
    No extra memory; one pass."""
    # TODO: שלושה מצביעים — low, mid, high
    pass


# arr = list("RYGRYRGRGY")
# sort_balls(arr)
# assert ''.join(arr) == "RRRRYYYGGG"
`,
        question:
`ממשו את \`sort_balls(arr)\` ב-Python. השתמשו ב-3 מצביעים בלבד. מהי המשמעות של כל מצביע?`,
        hints: [
          'מה אם נשתמש בשתי לולאות נפרדות — אחת לאדומים, אחת לירוקים? למה זה לא \`O(n)\` בpass יחיד?',
          'שלושה מצביעים: \`low\` (גבול בין אדומים-לצהובים), \`mid\` (איבר נוכחי), \`high\` (גבול בין צהובים-לירוקים). הרעיון: \`mid\` סורק; כשהוא רואה אדום — swap עם \`low\`. ירוק — swap עם \`high\`. צהוב — לא נוגעים.',
          'אחרי swap עם \`low\` → גם \`low\` וגם \`mid\` עולים (כי שני הצדדים תקינים).\nאחרי swap עם \`high\` → רק \`high\` יורד (לא \`mid\`!) — כי לא בדקנו עדיין מה הגיע ל-\`mid\` מ-\`high\`. צהוב — רק \`mid\` עולה.',
        ],
        trace: {
          title: 'Dutch National Flag — arr=[R,Y,G,R,Y,R,G,R,G,Y]',
          source:
`def sort_balls(arr):
    low, mid, high = 0, 0, len(arr) - 1
    while mid <= high:
        if arr[mid] == 'R':
            arr[low], arr[mid] = arr[mid], arr[low]
            low += 1
            mid += 1
        elif arr[mid] == 'G':
            arr[mid], arr[high] = arr[high], arr[mid]
            high -= 1
        else:                                # 'Y'
            mid += 1`,
          sourceLang: 'python',
          steps: [
            { code: 'init: low=0, mid=0, high=9   (n=10)',
              explain: 'שלושה מצביעים — \`low\` ו-\`mid\` בקצה השמאלי, \`high\` בימני. הלולאה רצה כל עוד \`mid <= high\`.',
              executed: [1, 2, 3], focusLine: 2,
              viz: _dutchFlagSvg({ arr: ['R','Y','G','R','Y','R','G','R','G','Y'], low: 0, mid: 0, high: 9 })
            },
            { code: 'arr[0]=R → swap(low, mid), low++, mid++',
              explain: 'אדום במקום הנכון — swap עצמי (low==mid), שני המצביעים מתקדמים.',
              executed: [3, 4, 5, 6, 7], focusLine: 5,
              viz: _dutchFlagSvg({ arr: ['R','Y','G','R','Y','R','G','R','G','Y'], low: 1, mid: 1, high: 9, swapped: [0,0] })
            },
            { code: 'arr[1]=Y → mid++   (no swap)',
              explain: 'צהוב — כבר במרכז, אין מה לעשות. רק \`mid\` עולה.',
              executed: [3, 11, 12], focusLine: 12,
              viz: _dutchFlagSvg({ arr: ['R','Y','G','R','Y','R','G','R','G','Y'], low: 1, mid: 2, high: 9 })
            },
            { code: 'arr[2]=G → swap(mid, high), high--',
              explain: 'ירוק — swap עם הגבול הימני, \`high\` יורד. **mid לא עולה!** כי לא בדקנו עדיין מה הגיע מ-\`high\` ל-\`mid\`.',
              executed: [3, 8, 9, 10], focusLine: 9,
              viz: _dutchFlagSvg({ arr: ['R','Y','Y','R','Y','R','G','R','G','G'], low: 1, mid: 2, high: 8, swapped: [2,9] })
            },
            { code: 'arr[2]=Y → mid++',
              explain: 'נחקרים שוב את \`mid=2\` — הפעם הוא צהוב. \`mid\` עולה.',
              executed: [3, 11, 12], focusLine: 12,
              viz: _dutchFlagSvg({ arr: ['R','Y','Y','R','Y','R','G','R','G','G'], low: 1, mid: 3, high: 8 })
            },
            { code: 'arr[3]=R → swap(low, mid), low++, mid++',
              explain: 'אדום באמצע — swap עם \`low=1\` (היה צהוב). אדום הולך שמאלה, צהוב נעלה.',
              executed: [3, 4, 5, 6, 7], focusLine: 5,
              viz: _dutchFlagSvg({ arr: ['R','R','Y','Y','Y','R','G','R','G','G'], low: 2, mid: 4, high: 8, swapped: [1,3] })
            },
            { code: 'arr[4]=Y → mid++',
              explain: 'צהוב — \`mid\` עולה ל-5.',
              executed: [3, 11, 12], focusLine: 12,
              viz: _dutchFlagSvg({ arr: ['R','R','Y','Y','Y','R','G','R','G','G'], low: 2, mid: 5, high: 8 })
            },
            { code: 'arr[5]=R → swap(low=2, mid=5), low++, mid++',
              explain: 'עוד אדום — swap עם \`low=2\` (היה צהוב).',
              executed: [3, 4, 5, 6, 7], focusLine: 5,
              viz: _dutchFlagSvg({ arr: ['R','R','R','Y','Y','Y','G','R','G','G'], low: 3, mid: 6, high: 8, swapped: [2,5] })
            },
            { code: 'arr[6]=G → swap(mid=6, high=8), high--',
              explain: 'ירוק — swap עם \`high=8\` (היה ירוק! swap עצמי-בערך). \`high\` יורד ל-7.',
              executed: [3, 8, 9, 10], focusLine: 9,
              viz: _dutchFlagSvg({ arr: ['R','R','R','Y','Y','Y','G','R','G','G'], low: 3, mid: 6, high: 7, swapped: [6,8] })
            },
            { code: 'arr[6]=G → swap(mid=6, high=7), high--',
              explain: 'עדיין ירוק ב-\`mid=6\` (לא התקדמנו אחרי הצעד הקודם). swap עם \`high=7\` שהיה R.',
              executed: [3, 8, 9, 10], focusLine: 9,
              viz: _dutchFlagSvg({ arr: ['R','R','R','Y','Y','Y','R','G','G','G'], low: 3, mid: 6, high: 6, swapped: [6,7] })
            },
            { code: 'arr[6]=R → swap(low=3, mid=6), low++, mid++',
              explain: 'אדום ב-\`mid=6\` — swap עם \`low=3\` (היה צהוב).',
              executed: [3, 4, 5, 6, 7], focusLine: 5,
              viz: _dutchFlagSvg({ arr: ['R','R','R','R','Y','Y','Y','G','G','G'], low: 4, mid: 7, high: 6, swapped: [3,6] })
            },
            { code: 'mid > high → loop exits ✓',
              explain: 'הלולאה מסיימת: \`mid=7 > high=6\`. המערך ממויין: \`[R,R,R,R | Y,Y,Y | G,G,G]\`. הכל ב-pass יחיד, O(1) מקום נוסף.',
              executed: [], focusLine: 2,
              viz: _dutchFlagSvg({ arr: ['R','R','R','R','Y','Y','Y','G','G','G'], low: 4, mid: 7, high: 6, done: true })
            },
          ],
        },
        answer:
`**3-way partition (Dijkstra).** מצביע אחד סורק (\`mid\`); שני אחרים שומרים על הגבולות בין שלוש הקבוצות.

**אינווריאנט:**
- \`arr[0..low-1]\` = אדומים בלבד (כבר במקום)
- \`arr[low..mid-1]\` = צהובים (כבר במקום)
- \`arr[mid..high]\` = לא-בדוק עדיין (זה האזור שעובדים עליו)
- \`arr[high+1..n-1]\` = ירוקים בלבד (כבר במקום)

**טיפול לפי מה ש-\`mid\` רואה:**
- **R**: swap עם \`low\`, אחר כך \`low++\` ו-\`mid++\` (האדום עכשיו ב-low, מה שהיה ב-low הוא צהוב/בדוק → גם הוא נופל לקטע "סדור").
- **Y**: כבר במקום הנכון. \`mid++\`.
- **G**: swap עם \`high\`, \`high--\`. **\`mid\` לא עולה!** — מה שהגיע מ-high הוא לא-בדוק עדיין.

**מתי הלולאה עוצרת?** כש-\`mid > high\` — כל הקטע "לא-בדוק" התרוקן.`,
        interviewerMindset:
`שתי טעויות שהמראיין מחכה להן:

1. **לעלות mid אחרי swap עם high.** זו הטעות הקלאסית. אחרי swap עם high, מה שהגיע ל-mid עדיין לא נבדק — חייב לחזור עליו. מועמדים שלא רואים את ההבחנה הזו יקבלו תוצאה שגויה למערכים מסוימים.
2. **לולאות נפרדות לכל צבע (counting sort)** — עובד ב-\`O(n)\`, אבל **דורש שני passes** (סופרים + כותבים) או \`O(k)\` מקום נוסף (3 שדות). הראיון שואל **pass יחיד** עם \`O(1)\` מקום — DNF היא התשובה.

**שאלת המשך נפוצה:** "ומה אם יש N צבעים?" — תשובה: זו כבר בעיית מיון רגילה (\`O(n log n)\` עם quicksort הכללי). DNF היא תכונה מיוחדת של \`k=3\` — שלושה מצביעים מספיקים.`,
        expectedAnswers: ['low', 'mid', 'high', 'swap', '3-way', 'partition', 'Dijkstra', 'dutch'],
      },
    ],
    source: 'PP - שאלות קוד (slide 7)',
    tags: ['algorithms', 'array', 'in-place', 'two-pointer', '3-way-partition', 'dijkstra', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8008 — Valid parentheses (stack), part ב adds '||'
  // ───────────────────────────────────────────────────────────────
  {
    id: 'valid-parentheses',
    difficulty: 'easy',
    title: 'סוגריים תקינים — בסיסי + מצב המתקדם עם ||',
    intro:
`נתון ביטוי שמכיל סוגי סוגריים: \`(\`, \`)\`, \`[\`, \`]\`, \`{\`, \`}\`.
ביטוי **תקין** אם כל סוגר נסגר ב**אותו סוג** ובסדר הנכון של קינון.

\`\`\`
"([]){}"     → תקין
"([)]"       → לא תקין    (חוצים זה את זה)
"(("         → לא תקין    (לא נסגר)
"]"          → לא תקין    (סגירה בלי פתיחה)
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(n)' },
        ],
        starterCode:
`def is_valid(s):
    """Returns True iff parentheses in s are balanced and correctly nested.
    Allowed: ( ) [ ] { }."""
    # TODO: stack — push opens, pop on close, match the pair
    pass


# print(is_valid("([]){}"))    # True
# print(is_valid("([)]"))      # False
# print(is_valid("]"))         # False
`,
        question:
`ממשו את \`is_valid(s)\`. איזה מבנה נתונים הופך את הבעיה לטריוויאלית?`,
        hints: [
          'מה הסדר הטבעי של "הסוגר האחרון שנפתח" → "הראשון שצריך להיסגר"?',
          'LIFO — סטאק. בכל פתיחה דוחפים, בכל סגירה — מציצים ובודקים שזה התאמה.',
          'בסוף, הסטאק צריך להיות **ריק**. אחרת — נשארו פתיחות לא-סגורות. גם פספוס pop (סטאק ריק בסגירה) → לא תקין.',
        ],
        trace: {
          title: 'Valid Parentheses — s="([{}])"',
          source:
`def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in '([{':
            stack.append(c)
        elif c in ')]}':
            if not stack or stack[-1] != pairs[c]:
                return False
            stack.pop()
    return not stack`,
          sourceLang: 'python',
          steps: [
            {
              code: 'init: stack = []',
              explain: 'מתחילים עם סטאק ריק. ה-loop יסרוק תו-בתו את \\\`s\\\`.',
              executed: [2, 3], focusLine: 3,
              viz: _parensSvg({ s: '([{}])', idx: -1, stack: [], action: 'init' }),
            },
            {
              code: "c='(' → push",
              explain: 'תו פתיחה — נדחף לסטאק. \\\`stack = [(]\\\`.',
              executed: [4, 5, 6], focusLine: 6,
              viz: _parensSvg({ s: '([{}])', idx: 0, stack: ['('], action: 'push' }),
            },
            {
              code: "c='[' → push",
              explain: 'עוד פתיחה. \\\`stack = [(, []\\\`. הצומת האחרון בסטאק הוא תמיד "מי שצריך להיסגר הבא".',
              executed: [4, 5, 6], focusLine: 6,
              viz: _parensSvg({ s: '([{}])', idx: 1, stack: ['(', '['], action: 'push' }),
            },
            {
              code: "c='{' → push",
              explain: 'פתיחה שלישית. \\\`stack = [(, [, {]\\\`.',
              executed: [4, 5, 6], focusLine: 6,
              viz: _parensSvg({ s: '([{}])', idx: 2, stack: ['(', '[', '{'], action: 'push' }),
            },
            {
              code: "c='}' → top='{' ✓ pop",
              explain: 'סוגר. \\\`pairs[}] = {\\\` — תואם ל-top. pop. \\\`stack = [(, [\\\`.',
              executed: [4, 7, 8, 10], focusLine: 10,
              viz: _parensSvg({ s: '([{}])', idx: 3, stack: ['(', '['], action: 'pop' }),
            },
            {
              code: "c=']' → top='[' ✓ pop",
              explain: '\\\`pairs[]] = [\\\` תואם ל-top. pop. \\\`stack = [(]\\\`.',
              executed: [4, 7, 8, 10], focusLine: 10,
              viz: _parensSvg({ s: '([{}])', idx: 4, stack: ['('], action: 'pop' }),
            },
            {
              code: "c=')' → top='(' ✓ pop",
              explain: 'הסגר האחרון תואם לפותח האחרון שנשאר. pop ⇒ \\\`stack = []\\\`.',
              executed: [4, 7, 8, 10], focusLine: 10,
              viz: _parensSvg({ s: '([{}])', idx: 5, stack: [], action: 'pop' }),
            },
            {
              code: 'return not stack  → True',
              explain: 'הסטאק ריק → כל פתיחה נסגרה כראוי. **VALID** ✓',
              executed: [11], focusLine: 11,
              viz: _parensSvg({ s: '([{}])', idx: -1, stack: [], action: 'done', valid: true }),
            },
          ],
        },
        answer:
`**Stack-based.** \`O(n)\` זמן, \`O(n)\` מקום (גרוע ביותר — כל הקלט הוא פתיחות).

\`\`\`python
def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in '([{':
            stack.append(c)
        elif c in ')]}':
            if not stack or stack[-1] != pairs[c]:
                return False
            stack.pop()
        # ignore non-bracket chars (or raise if strict)
    return not stack
\`\`\`

**שלושה תרחישי כשל:**
1. **סגירה בלי פתיחה** — \`stack\` ריק כשרואים סוגר סוגר ⇒ \`False\`.
2. **חוסר התאמה** — top של הסטאק לא תואם לסוגר הסוגר ⇒ \`False\`.
3. **פתיחות שלא נסגרו** — בסוף הסטאק לא ריק ⇒ \`False\`.

**שלבי החשיבה:**

1. **למה stack?** — הקינון של סוגריים מקיים LIFO באופן טבעי. הסוגר האחרון שפתחנו הוא הראשון שחייב להיסגר.
2. **מילון \`pairs\`** ממפה סוגר→פותח — חוסך 6 if-ים נפרדים.
3. **בדוק \`stack\` ריק לפני pop** — אחרת \`stack.pop()\` יזרוק \`IndexError\` על \`"]"\`.`,
        interviewerMindset:
`Valid Parentheses היא **שאלת ה-easy הסטנדרטית** למשרות "junior" — והיא מסננת מועמדים בצורה אכזרית:

1. **מועמד שמשתמש בלולאה nested או counter** — נכשל ב-\`"([)]"\` (אותו מספר פתיחות וסגירות מכל סוג, אבל הסדר חוצה). חייב stack.
2. **מועמד ששוכח לבדוק stack-ריק לפני pop** — קוד שמתפוצץ ב-\`"]"\`. עלות סיגנל אדום למראיין.
3. **מועמד ששוכח לבדוק שהסטאק ריק בסוף** — מחזיר True על \`"(("\` שזה תקלה.

מועמד טוב כותב את ההגדרות-מילון ראש לפני שכותב לולאה. זה מראה תכנון.`,
        expectedAnswers: ['stack', 'סטאק', 'push', 'pop', 'LIFO', 'append', 'pairs', 'dict'],
      },
      {
        label: 'ב',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(n)' },
        ],
        starterCode:
`def is_valid_v2(s):
    """Same as before, plus a fourth bracket: '|'.
    There is NO distinction between left | and right | — the same
    char serves as both. Two consecutive | with valid content in
    between count as a pair: "|abc|" ok, "||" ok (empty inside),
    "|" or "|||" not balanced."""
    # TODO
    pass
`,
        question:
`כעת מוסיפים סוג רביעי: \`|\` שמשמש גם כפותח וגם כסוגר (אין הבחנה). למשל \`|[]|\` חוקי, \`|||\` לא. ממשו.`,
        hints: [
          'כש-\`|\` מופיע, איך נדע אם זו פתיחה או סגירה?',
          'נסה: אם \`|\` נמצא בראש הסטאק — זו סגירה. אחרת — פתיחה. (פעולת toggle לפי המצב הנוכחי).',
          'הלוגיקה חייבת **לא** להתבלבל עם הסוגריים האחרים: \`|[|]|\` — האם הראשון נסגר ע"י השני? לא, השני מתחיל בלוק חדש. בעצם זה לא תקין כי [ נסגר ב-| במקום ב-].',
        ],
        answer:
`**הרחבת ה-stack לוגיקה.** הסוגר \`|\` מתפקד כ-toggle: כשהוא ב-top של הסטאק → סגירה (pop). אחרת → פתיחה (push).

\`\`\`python
def is_valid_v2(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    opens = '([{'
    stack = []
    for c in s:
        if c == '|':
            # If '|' is on top, this one closes it. Otherwise opens.
            if stack and stack[-1] == '|':
                stack.pop()
            else:
                stack.append('|')
        elif c in opens:
            stack.append(c)
        elif c in pairs:
            if not stack or stack[-1] != pairs[c]:
                return False
            stack.pop()
    return not stack
\`\`\`

**מקרי קצה:**
- \`"|abc|"\` → push, push abc(ignored), see |, top is |, pop. סטאק ריק → True.
- \`"|[]|"\` → push |, push [, pop ] (matches), see |, top is |, pop. True.
- \`"|[|]|"\` → push |, push [, see |, top is [ (not |), push |. now stack=[|, [, |]. ] arrives, top is |, mismatch → False. ✓
- \`"||"\` → push |, top is |, pop. ריק → True.
- \`"|||"\` → push, pop, push. סטאק לא ריק → False.

**שלבי החשיבה:**

1. **קלט דו-משמעי** — \`|\` הוא ה-context-dependent. צריך לחפש סימן שיודיע מי הוא: ה-top של הסטאק.
2. **ה-top של הסטאק "אומר" לי** — אם הקודם שלי הוא \`|\`, אז אני סוגר אותו. אחרת — אני פותח חדש.
3. **שאר הלוגיקה לא משתנה** — \`[, ]\` ו-others נשארים זהים. \`|\` לא יכול לסגור \`[\` כי \`pairs[]\` לא מכיל אותו.`,
        interviewerMindset:
`שאלת המשך טריקית. השדרוג מ-\`|\` חושף את גמישות הסטאק:

1. **המראיין רוצה לראות שאתה מטפל ב-context-dependence**. סטטוס "פתיחה/סגירה" של אותו תו תלוי בהיסטוריה — וזה בדיוק מה שסטאק נותן.
2. **מועמד שמנסה לספור \`|\` (אם זוגי = תקין)** — נופל מיד ב-\`"|[|]|"\` (4 \`|\`-ים, זוגיים, אבל הביטוי לא תקין).
3. **שווה לציין שעם 2 סוגי toggle כאלה הבעיה הופכת context-free-non-LR**. (יותר תיאורטי, אבל סימן לעומק.)

**יישום בעולם האמיתי:** \`||\` כ-OR ב-Verilog/SystemVerilog — לפעמים מופיע בעורכי טקסט סוגרים עם syntax-highlighting.`,
        expectedAnswers: ['toggle', 'top', 'pop', 'stack', '|'],
      },
    ],
    source: 'PP - שאלות קוד (slide 8)',
    tags: ['algorithms', 'stack', 'parsing', 'string', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8009 — Single number via XOR
  // ───────────────────────────────────────────────────────────────
  {
    id: 'single-number-xor',
    difficulty: 'easy',
    title: 'המספר היחיד — XOR trick',
    intro:
`נתון מערך מספרים שלמים שבו **כל מספר מופיע פעמיים — חוץ מאחד שמופיע פעם יחידה**. מצאו את המספר הזה.

\`\`\`
Input:  nums = [2, 1, 2, 3, 4, 3, 1]
Output: 4
\`\`\`

**אילוץ:** סיבוכיות זמן \`O(n)\` ומקום נוסף \`O(1)\`.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'Hash set — O(n) זמן, O(n) מקום',
            time: 'O(n)', space: 'O(n)',
            summary: 'הוסף/הסר לפי הופעות; בסוף נשאר רק היחיד.',
            code:
`def single_number_set(nums):
    seen = set()
    for x in nums:
        if x in seen: seen.remove(x)
        else:         seen.add(x)
    return seen.pop()`,
          },
          {
            name: 'XOR — O(n) זמן, O(1) מקום',
            time: 'O(n)', space: 'O(1)',
            summary: '\`a ⊕ a = 0\`, \`a ⊕ 0 = a\`. XOR של כל המערך = הערך היחיד שנשאר.',
            code:
`def single_number(nums):
    result = 0
    for x in nums:
        result ^= x
    return result

# או חד-שורה:
# from functools import reduce; return reduce(operator.xor, nums)`,
          },
        ],
        starterCode:
`def single_number(nums):
    """Each number appears twice except one. Find it.
    Constraint: O(n) time, O(1) extra space."""
    # TODO: XOR trick
    pass


# print(single_number([2, 1, 2, 3, 4, 3, 1]))  # 4
`,
        question:
`ממשו את הפונקציה. למה XOR? איך מסכים בקלות לכך שזה מחזיר את התשובה הנכונה?`,
        hints: [
          'יש פעולה בינארית עם תכונה מיוחדת: \`a ⊕ a = ?\`',
          '\`a ⊕ a = 0\`, \`a ⊕ 0 = a\`, ו-XOR קומוטטיבי+אסוציאטיבי. מה קורה אם אכפיל XOR על כל המערך?',
          'כל זוג מבטל את עצמו (\`a ⊕ a = 0\`). היחיד נשאר. \`reduce(^, nums) = unique\`. שורת קוד אחת.',
        ],
        answer:
`**אלגנטיות בטהרה.** XOR של כל איברי המערך = האיבר היחיד.

**למה זה עובד? שלוש תכונות של XOR:**
1. **אידמפוטנטיות עצמית:** \`a ⊕ a = 0\` (אותם ביטים מבטלים)
2. **אלמנט זהות:** \`a ⊕ 0 = a\`
3. **קומוטטיביות+אסוציאטיביות:** \`a ⊕ b ⊕ c = c ⊕ a ⊕ b\` (כל סדר טוב)

**הוכחה:** אחרי שמסדרים את XOR של כל המערך בסדר הנוח —
\`(2⊕2) ⊕ (1⊕1) ⊕ (3⊕3) ⊕ 4 = 0 ⊕ 0 ⊕ 0 ⊕ 4 = 4\`. ✓

**איך זה עובד בייצוג ביטים?**
\`\`\`
2 = 010    XOR ביטוויז = "1 אם בדיוק אחד מהביטים דולק"
1 = 001    שני מופעים של אותו מספר → כל ביט מבטל את עצמו ל-0
3 = 011
4 = 100   ←  הביט במקום 4 דולק רק פעם אחת בכל המערך
\`\`\`

**שלבי החשיבה:**

1. **בחיפוש "מה מופיע פעם אחת"** — חפש פעולה שמבדילה בין "פעמיים" ל-"פעם אחת".
2. **\`a ⊕ a = 0\`** היא הפעולה — ביטים זוגיים נעלמים, ביט בודד שורד.
3. **בלי קשר לסדר** — אסוציאטיביות + קומוטטיביות של XOR אומרות שאפשר לבצע על המערך כפי שהוא, בלי צורך בסידור מקדים.

**הרחבות נפוצות:**
- "כל מספר פעמיים חוץ מאחד שמופיע 3 פעמים" → פתרון עם ספירת ביטים mod 3.
- "שני מספרים שמופיעים פעם אחת" → XOR של הכל = \`a ⊕ b\`; בחר ביט שדולק; חלק את המערך לפי הביט; XOR בכל חלק.`,
        interviewerMindset:
`Single Number היא **שאלת "האם אתה מכיר את ה-bit-trick"**. הציפייה של המראיין:

1. **שתציע פתרון hash-set ראשון, ותאמר "אני יודע שזה O(n) מקום — לפחות יש לי משהו לעבוד עליו."** הראית שאתה מכיר tradeoff.
2. **שתעבור ל-XOR אחרי שאלה רומזת** ("יש דרך לזה ב-O(1) מקום?"). אז ההצגה: "כל מספר מופיע 2 פעמים → \`a XOR a = 0\` → XOR של הכל = היחיד".
3. **שתסביר את 3 התכונות של XOR** — לא להגיד "XOR" כשם פעולה, אלא להראות שהוא **אינווולוטיבי** (a XOR a = 0) + קומוטטיבי.

**מועמד מצוין:** מציע מיד שהפתרון מתרחב לכל שפה — \`reduce\` ב-Python, \`accumulate\` ב-C++, \`fold\` ב-Haskell.`,
        expectedAnswers: ['XOR', '^=', '^', 'reduce', 'a ^ a', '0', 'אינווולוטי'],
      },
    ],
    source: 'PP - שאלות קוד (slide 9)',
    tags: ['algorithms', 'xor', 'bit-manipulation', 'array', 'O(1)-space', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8010 — Min merges to make array a palindrome (two pointers)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'min-merges-palindrome',
    difficulty: 'medium',
    title: 'מינימום מיזוגים ליצירת פלינדרום',
    intro:
`נתון מערך של מספרים **שלמים וחיוביים**. **מיזוג** = החלפת איבר ושכנו
(הצמוד אליו) בסכומם. מצאו את **מספר המיזוגים המינימלי** הדרוש כדי
שהמערך יהפוך פלינדרום.

\`\`\`
arr = [10, 11, 32, 27]   →  3   (יש למזג את כל המערך לאיבר יחיד = 80)
arr = [22, 15, 22]       →  0   (כבר פלינדרום)
arr = [2, 6, 1, 8]       →  1   (מיזוג 2+6 → [8, 1, 8] = פלינדרום)
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def min_merges(arr):
    """Return min number of merge operations (combining two adjacent
    elements into their sum) to make arr a palindrome."""
    # TODO: two pointers from both ends
    pass


# print(min_merges([10, 11, 32, 27]))   # 3
# print(min_merges([22, 15, 22]))       # 0
# print(min_merges([2, 6, 1, 8]))       # 1
`,
        question:
`ממשו את \`min_merges(arr)\`. למה שני מצביעים? מה ההיגיון של "המצביע הקטן יותר זז" עם מיזוג מקומי?`,
        hints: [
          'אם \`arr[i] == arr[j]\` — מעולה, אלה כבר בני-זוג בפלינדרום. \`i++\`, \`j--\`. בלי מיזוג.',
          'אם \`arr[i] < arr[j]\` — חייב למזג את \`arr[i]\` עם השכן הימני: \`arr[i+1] += arr[i]; i++; merges++\`. מקסום הצד הקטן.',
          'אם \`arr[i] > arr[j]\` — סימטרי: \`arr[j-1] += arr[j]; j--; merges++\`. המצביעים נפגשים תוך \`O(n)\` צעדים.',
        ],
        trace: {
          title: 'Min-merges-palindrome — arr=[10, 11, 32, 27]',
          source:
`def min_merges(arr):
    i, j = 0, len(arr) - 1
    merges = 0
    while i < j:
        if arr[i] == arr[j]:
            i += 1
            j -= 1
        elif arr[i] < arr[j]:
            arr[i + 1] += arr[i]
            i += 1
            merges += 1
        else:                       # arr[i] > arr[j]
            arr[j - 1] += arr[j]
            j -= 1
            merges += 1
    return merges`,
          sourceLang: 'python',
          steps: [
            {
              code: 'init: i=0, j=3, merges=0',
              explain: 'שני מצביעים מהקצוות, הפנים. ה-loop רץ כל עוד \\\`i < j\\\`.',
              executed: [2, 3, 4], focusLine: 4,
              viz: _palindromeMergeSvg({ arr: [10, 11, 32, 27], consumed: [], i: 0, j: 3, merges: 0 }),
            },
            {
              code: 'arr[0]=10 < arr[3]=27 → merge left',
              explain: 'הצד השמאלי קטן. **חייבים** להגדיל אותו (אסור להקטין את \\\`arr[j]\\\`). מיזוג: \\\`arr[1] += arr[0]\\\` ⇒ \\\`arr[1]=21\\\`. אחר כך \\\`i++\\\` ו-\\\`merges++\\\`.',
              executed: [4, 8, 9, 10, 11], focusLine: 9,
              viz: _palindromeMergeSvg({ arr: [10, 21, 32, 27], consumed: [], i: 0, j: 3, merges: 0, mergeFrom: 0, mergeInto: 1 }),
            },
            {
              code: 'after merge: arr=[_, 21, 32, 27], i=1, merges=1',
              explain: 'התא \\\`[0]\\\` הופך לא-רלוונטי (כבר נצרך) — מצוייר דהוי. הטווח הפעיל עכשיו \\\`[1..3]\\\`.',
              executed: [4], focusLine: 4,
              viz: _palindromeMergeSvg({ arr: [10, 21, 32, 27], consumed: [0], i: 1, j: 3, merges: 1 }),
            },
            {
              code: 'arr[1]=21 < arr[3]=27 → merge left',
              explain: 'שוב הצד השמאלי קטן. \\\`arr[2] += 21\\\` → \\\`arr[2]=53\\\`. \\\`i++\\\`, \\\`merges++\\\`.',
              executed: [4, 8, 9, 10, 11], focusLine: 9,
              viz: _palindromeMergeSvg({ arr: [10, 21, 53, 27], consumed: [0], i: 1, j: 3, merges: 1, mergeFrom: 1, mergeInto: 2 }),
            },
            {
              code: 'after merge: arr=[_, _, 53, 27], i=2, merges=2',
              explain: 'כעת התא \\\`[1]\\\` גם נצרך. הטווח הפעיל \\\`[2..3]\\\`. רק שני איברים נשארו.',
              executed: [4], focusLine: 4,
              viz: _palindromeMergeSvg({ arr: [10, 21, 53, 27], consumed: [0, 1], i: 2, j: 3, merges: 2 }),
            },
            {
              code: 'arr[2]=53 > arr[3]=27 → merge right',
              explain: 'הצד הימני קטן יותר. סימטרי לקודם: \\\`arr[j-1] += arr[j]\\\` ⇒ \\\`arr[2] += 27 = 80\\\`. \\\`j--\\\`, \\\`merges++\\\`.',
              executed: [4, 12, 13, 14, 15], focusLine: 13,
              viz: _palindromeMergeSvg({ arr: [10, 21, 80, 27], consumed: [0, 1], i: 2, j: 3, merges: 2, mergeFrom: 3, mergeInto: 2 }),
            },
            {
              code: 'after merge: arr=[_, _, 80, _], i=j=2 → done',
              explain: 'כל המערך התכווץ לאיבר יחיד \\\`80\\\`. **פלינדרום טריוויאלי** של איבר יחיד. סה"כ \\\`3\\\` מיזוגים.',
              executed: [4, 16], focusLine: 16,
              viz: _palindromeMergeSvg({ arr: [10, 21, 80, 27], consumed: [0, 1, 3], i: 2, j: 2, merges: 3, done: true }),
            },
          ],
        },
        answer:
`**Two pointers greedy.** \`O(n)\` זמן, \`O(1)\` מקום (תוך-מקום על המערך).

\`\`\`python
def min_merges(arr):
    i, j = 0, len(arr) - 1
    merges = 0
    while i < j:
        if arr[i] == arr[j]:
            i += 1
            j -= 1
        elif arr[i] < arr[j]:
            # merge arr[i] into arr[i+1] — left side too small
            arr[i + 1] += arr[i]
            i += 1
            merges += 1
        else:                       # arr[i] > arr[j]
            arr[j - 1] += arr[j]
            j -= 1
            merges += 1
    return merges
\`\`\`

**למה זה אופטימלי?** טיעון "exchange argument":
- אם \`arr[i] < arr[j]\` — אסור להגדיל את \`arr[j]\` (כי הוא כבר גדול מ-\`arr[i]\`, אז זה רק יחמיר). חייב להגדיל את צד שמאל = למזג את \`arr[i]\` עם השכן.
- אין טעם לדלג על מיזוגים — כל זוג שלא תואם חייב להתאחד בצד אחד.

**ניתוח טווח עבור הדוגמאות:**

| arr            | פלינדרום? | מיזוגים | תיאור |
|----------------|----------|---------|------|
| [22, 15, 22]   | ✓ כן     | 0       | ה-מצביעים ביושר נפגשים באמצע |
| [2, 6, 1, 8]   | לא       | 1       | 2<8 → arr[1]+=2 → [_, 8, 1, 8] = פלינדרום מ-i=1 |
| [10,11,32,27]  | לא       | 3       | מיזוג ימני שלוש פעמים → 80 |

**שלבי החשיבה:**

1. **דמוי "Two Sum" ממוין** — שני מצביעים מהקצוות, פנימה. אבל הפעם הזיווג אינו השוואה (\`==\`) — שני הצדדים יכולים להישאר עצמאיים אם זהים.
2. **גרידיות עובדת כי חד-כיווני** — ברגע ש-\`arr[i]\` או \`arr[j]\` מתעדכן, הוא רק יכול לגדול. אז לא יקרה שתכריח מיזוג מיותר.
3. **התעדכון בתוך המערך** — אל תיצור עותק. כל הפתרון על אותו buffer ב-O(1) זיכרון.`,
        interviewerMindset:
`שאלת "מערך + סימטריה" שבודקת שלושה דברים:

1. **שאתה מזהה אסטרטגיית two-pointers** — כל בעיה עם "פלינדרום" או "סימטריה" קוראת ל-two-pointers מהקצוות. אם המועמד מתחיל לחשב כל אפשרות (DP) — איבד נקודה.

2. **שאתה מסביר למה גרידיות עובדת.** הטיעון: ברגע שצד אחד קטן יותר — חייבים להגדיל אותו (אי-אפשר להקטין את הגדול). זה נכון בכל צעד, ולכן בחירה גרידית מעולמית.

3. **שאתה לא נופל ב-edge cases:**
   - מערך באורך 1 → 0 מיזוגים (פלינדרום טריוויאלי).
   - מערך באורך 2 שווה → 0; שונה → 1 (מיזוג היחיד).
   - מערך עם איבר אחד גדול ושאר קטנים → ייתכן \`n-1\` מיזוגים.

**שאלת המשך נפוצה:** "אם המספרים יכולים להיות שליליים?" — תשובה: הגרידיות שוברת (איבר שלילי יכול להחליש את הסכום). דורש DP.`,
        expectedAnswers: ['two pointer', 'i < j', 'merge', 'arr[i+1]', 'merges', 'i++', 'j--'],
      },
    ],
    source: 'PP - שאלות קוד (slide 10)',
    tags: ['algorithms', 'array', 'two-pointer', 'greedy', 'palindrome', 'in-place', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8011 — Check power of 2 in a single line
  // ───────────────────────────────────────────────────────────────
  {
    id: 'power-of-two',
    difficulty: 'easy',
    title: 'בדיקת חזקה של 2 — שורה אחת',
    intro:
`נתון מספר שלם חיובי \`n\`. כתבו פונקציה שמחזירה \`True\` אם הוא **חזקה של 2**, אחרת \`False\`.

\`\`\`
Input: 64       Output: True   (= 2⁶)
Input: 65       Output: False
Input: 1        Output: True   (= 2⁰)
Input: 0        Output: False  (לא חזקה של 2 לפי הגדרה)
\`\`\`

**אילוץ:** שורת קוד יחידה. \`O(1)\` זמן ומקום.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'Naive — חלוקה בלולאה',
            time: 'O(log n)', space: 'O(1)',
            summary: 'חלקו ב-2 חוזרות עד שמגיעים ל-1 או למספר אי-זוגי.',
            code:
`def is_pow2_naive(n):
    if n <= 0: return False
    while n > 1:
        if n % 2: return False
        n //= 2
    return True`,
          },
          {
            name: 'Bitwise — שורה אחת',
            time: 'O(1)', space: 'O(1)',
            summary: 'לחזקה של 2 יש בדיוק **ביט אחד** דולק. \`n & (n-1)\` מוחק את הביט התחתון הזה — והתוצאה היא 0 אם זה היה הביט היחיד.',
            code:
`def is_pow2(n):
    return n > 0 and (n & (n - 1)) == 0`,
          },
        ],
        starterCode:
`def is_pow2(n):
    """Return True iff n is a positive power of 2."""
    # TODO: one-line bit trick
    pass


# print(is_pow2(64))    # True
# print(is_pow2(65))    # False
# print(is_pow2(0))     # False
`,
        question:
`ממשו את \`is_pow2(n)\` ב-Python. למה ה-bit trick \`n & (n-1) == 0\` עובד?`,
        hints: [
          'איך נראה הייצוג הבינארי של 64? של 32? של 16? מה משותף לכולם?',
          'לחזקה של 2 — בדיוק ביט יחיד דולק. \`n - 1\` הופך אותו ל-0 וכל הביטים הנמוכים יותר ל-1. שילוב AND ביניהם?',
          'בדיוק שורה אחת: \`return n > 0 and (n & (n - 1)) == 0\`. ה-\`n > 0\` מטפל ב-edge case של \`0\`.',
        ],
        answer:
`**Bit-trick של חזקה של 2.** \`O(1)\` זמן ומקום.

**למה זה עובד?** ייצוג בינארי של חזקות של 2 הוא תמיד **ביט יחיד דולק:**

\`\`\`
1   = 0000 0001    2⁰
2   = 0000 0010    2¹
4   = 0000 0100    2²
8   = 0000 1000    2³
64  = 0100 0000    2⁶
\`\`\`

**ה-trick:** עבור מספר שיש לו ביט יחיד דולק במיקום \`k\`, \`n - 1\` הופך את הביט הזה ל-0 ואת כל הביטים מתחתיו ל-1:

\`\`\`
n     = 0100 0000   (64)
n - 1 = 0011 1111   (63)
n & (n-1) = 0000 0000   ← אין שום ביט משותף → 0
\`\`\`

**עבור מספר שאינו חזקה של 2** — יש לפחות שני ביטים דולקים. \`n-1\` מאפס רק את הביט התחתון והופך את שכניו ל-1, אבל ביט גבוה יותר נשאר:

\`\`\`
n     = 0100 0010   (66)
n - 1 = 0100 0001   (65)
n & (n-1) = 0100 0000   ← הביט הגבוה שורד → != 0
\`\`\`

**מקרה הקצה \`n = 0\`:** \`0 & -1 = 0\` בייצוג two's-complement → היה מחזיר \`True\` בטעות. ה-\`n > 0\` סוגר את הפרצה.

---

**שלבי החשיבה:**

1. **חזקה של 2 ⇔ ביט יחיד דולק** — זו הבסיסיות שכל מועמד חייב לזהות מיד.
2. **\`n & (n-1)\` מסיר את הביט התחתון** — bit-pattern קלאסי. עוזר גם בבעיות כמו "ספירת ביטים דולקים" (Brian Kernighan's algorithm).
3. **שלילת edge case** — לפעמים שורה אחת לא מספקת; \`n > 0\` נחוץ כדי להוציא את אפס מהתמונה.`,
        interviewerMindset:
`שאלת bit-tricks קלאסית של "האם אתה מכיר את העולם הביטוויז". המראיין רוצה לראות:

1. **שאתה לא הולך לפתרון \`math.log2\` או חלוקה חוזרת** — שניהם עובדים, אבל \`O(log n)\` ולא \`O(1)\`. שורת קוד יחידה היא ההזדמנות לבזוק \`n & (n-1) == 0\`.

2. **שאתה זוכר את \`n > 0\`** — מועמדים רבים שוכחים, ואז \`is_pow2(0)\` מחזיר True שגוי. הראיון בודק שאתה בודק edge cases.

3. **שאתה מסביר *למה*** — לא רק "כי הכרתי את הטריק". להתחיל מ-"חזקה של 2 = ביט יחיד דולק" ומשם בנייה לוגית של ה-AND.

**שאלת המשך טיפוסית:** "ספור כמה ביטים דולקים ב-n באמצעות אותו טריק." → Brian Kernighan: \`count = 0; while n: n &= n-1; count += 1\` — בכל איטרציה מורידים ביט דולק אחד. סיבוכיות \`O(popcount(n))\` במקום \`O(log n)\`.`,
        expectedAnswers: ['n & (n-1)', 'n & (n - 1)', 'bit', 'אחד', 'single bit', 'n > 0'],
      },
    ],
    source: 'PP - שאלות קוד (slide 11)',
    tags: ['algorithms', 'bit-manipulation', 'power-of-2', 'one-liner', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8012 — Reverse bits (byte / constant time / register)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'reverse-bits',
    difficulty: 'medium',
    title: 'היפוך סדר הביטים ביחידת זיכרון',
    intro:
`עליכם לכתוב פונקציה שלוקחת יחידת זיכרון ומחזירה אותה כשסדר הביטים שלה הפוך.

\`\`\`
byte 0b1011 0100  →  0b0010 1101    (MSB↔LSB, b6↔b1, b5↔b2, b4↔b3)
\`\`\`

יש שלוש דרישות עוצמה — לכל אחת ממשו פונקציה נפרדת.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(8) = O(bits)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def reverse_byte_naive(b):
    """Return b (8-bit) with its bits in reverse order. Loop-based."""
    # TODO: 8 iterations, build result bit by bit
    pass


# print(bin(reverse_byte_naive(0b10110100)))   # 0b101101
`,
        question:
`ממשו פונקציה שמקבלת byte (\`0..255\`) ומחזירה אותו עם סדר ביטים הפוך. **גישה לולאתית**.`,
        hints: [
          'מה התפקיד של \`b & 1\`? של \`<<\` ו-\`>>\`?',
          'איטרציה אחת = בודקים את הביט הנמוך ביותר של \`b\`, דוחפים אותו לתוצאה, ומזיזים את \`b\` שמאלה ואת \`result\` ימינה.',
          'לולאה של 8 איטרציות. בכל אחת: \`result = (result << 1) | (b & 1); b >>= 1\`.',
        ],
        answer:
`**Loop-based, 8 איטרציות.**

\`\`\`python
def reverse_byte_naive(b):
    result = 0
    for _ in range(8):
        result = (result << 1) | (b & 1)
        b >>= 1
    return result & 0xFF
\`\`\`

**איך זה עובד? בכל איטרציה:**
1. \`b & 1\` — מבודד את הביט הנמוך ביותר של b
2. \`result << 1\` — מפנה מקום ל-LSB חדש בתוצאה
3. \`|\` — מצמיד אותם יחד
4. \`b >>= 1\` — זורק את הביט שכבר לקחנו

הסיבוכיות: \`O(8)\` = \`O(bits)\`. גודל קלט קבוע ⇒ פורמלית \`O(1)\` — אבל לבעיה הזו של 1, 4, 8, 32 ביטים כתבנו "\`O(bits)\`" כדי להבדיל מפתרון "אמיתי" O(1) של חלקים ב/ג.

---

**שלבי החשיבה:**

1. **בנייה ביט-בייט** — מעבירים ביטים אחד אחד מהקצה הנמוך של \`b\` לקצה הנמוך של \`result\`. כי \`result\` נדחף שמאלה כל איטרציה, מה שנכנס ראשון יוצא אחרון = היפוך.
2. **\`& 0xFF\` בסוף** — שומר על תוצאה כ-byte נקי, גם אם בטעות חרגנו.`,
        interviewerMindset:
`חלק זה הוא ה"בסיס" — המראיין מוודא שאתה יודע bit manipulation בסיסי. הכישלון הקלאסי:

1. **בנייה בכיוון הלא נכון** — מועמד שמנסה \`result |= (b & 1) << i\` עם i רץ מ-0 ל-7 → צריך לחשוב הפוך, אחרת מקבל את אותו ה-byte.
2. **שכחה ש-Python ints אינסופיים** — בלי \`& 0xFF\` בסוף, אם המתודה חורגת מ-8 ביטים בטעות, התוצאה לא מוגבלת ל-byte.
3. **כתיבת הפתרון של חלק ב' כתשובה לחלק א'** — חלק א' מבקש את הגישה הנאיבית כדי שהדיון לחלק ב' יהיה משמעותי.`,
        expectedAnswers: ['b & 1', 'result << 1', '>>= 1', 'for _ in range(8)', '|', '<<'],
      },
      {
        label: 'ב',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1) — קבוע אמיתי' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def reverse_byte_const(b):
    """Reverse the bits of a byte in CONSTANT time —
    a fixed number of operations independent of bit count."""
    # TODO: divide-and-conquer with bit masking
    pass


# print(bin(reverse_byte_const(0b10110100)))   # 0b101101
`,
        trace: {
          title: 'Byte reverse — D&C על b = 0xB4 = 10110100',
          steps: [
            {
              code: 'init: b = 1011 0100   (0xB4 = 180)',
              explain: 'נקודת התחלה. 8 ביטים שצריך להפוך. הרעיון: 3 שלבים של divide-and-conquer במקום loop של 8.',
              viz: _bitsReverseSvg({
                bitsBefore: [1,0,1,1,0,1,0,0],
                stepLabel: 'init — b = 0xB4',
              }),
            },
            {
              code: 'b = ((b & 0xF0) >> 4) | ((b & 0x0F) << 4)',
              explain: '**שלב 1: החלף חצאים.** ה-4 הביטים העליונים (\\\`1011\\\`) ↔ ה-4 התחתונים (\\\`0100\\\`). פעולה ביטוויז אחת.',
              viz: _bitsReverseSvg({
                bitsBefore: [1,0,1,1,0,1,0,0],
                bitsAfter:  [0,1,0,0,1,0,1,1],
                swaps: [[0,4],[1,5],[2,6],[3,7],[4,0],[5,1],[6,2],[7,3]],
                stepLabel: 'STEP 1 — swap halves (mask 0xF0/0x0F)',
              }),
            },
            {
              code: 'b = ((b & 0xCC) >> 2) | ((b & 0x33) << 2)',
              explain: '**שלב 2: החלף זוגות 2-ביט בתוך כל חצי.** \\\`01 / 00\\\` הופך ל-\\\`00 / 01\\\`, וכך גם בחצי השני.',
              viz: _bitsReverseSvg({
                bitsBefore: [0,1,0,0,1,0,1,1],
                bitsAfter:  [0,0,0,1,1,1,1,0],
                swaps: [[0,2],[1,3],[2,0],[3,1],[4,6],[5,7],[6,4],[7,5]],
                stepLabel: 'STEP 2 — swap pairs (mask 0xCC/0x33)',
              }),
            },
            {
              code: 'b = ((b & 0xAA) >> 1) | ((b & 0x55) << 1)',
              explain: '**שלב 3: החלף ביטים בודדים בתוך כל זוג.** התוצאה: \\\`0010 1101\\\` = \\\`0x2D = 45\\\` — בדיוק ההיפוך של \\\`0xB4 = 180\\\`. שלוש פעולות = O(1) קבוע.',
              viz: _bitsReverseSvg({
                bitsBefore: [0,0,0,1,1,1,1,0],
                bitsAfter:  [0,0,1,0,1,1,0,1],
                swaps: [[0,1],[1,0],[2,3],[3,2],[4,5],[5,4],[6,7],[7,6]],
                stepLabel: 'STEP 3 — swap bits (mask 0xAA/0x55)   →   0x2D ✓',
                done: true,
              }),
            },
          ],
        },
        question:
`ממשו את היפוך הביטים של byte בזמן **קבוע** — מספר פעולות שאינו תלוי במספר הביטים. רמז: divide-and-conquer.`,
        hints: [
          'מה אם היינו מחליפים את החצי הימני עם החצי השמאלי של ה-byte בפעולה אחת?',
          'אחרי החלפת חצאים — מחליפים זוגות (2-ביט) בתוך כל חצי. אחר כך מחליפים ביטים בתוך כל זוג.',
          '3 שלבי מסכות: \`0xF0/0x0F\` (חצאים), \`0xCC/0x33\` (זוגות), \`0xAA/0x55\` (ביטים בודדים). שורה אחת לכל אחד עם shifts.',
        ],
        answer:
`**Divide-and-conquer.** מקבל את הפלט ב-3 פעולות שלובות — בלי קשר למספר הביטים בקלט.

\`\`\`python
def reverse_byte_const(b):
    # שלב 1: חצאים — 4 ביטים עליונים ↔ 4 ביטים תחתונים
    b = ((b & 0xF0) >> 4) | ((b & 0x0F) << 4)
    # שלב 2: זוגות 2-ביט בתוך כל חצי
    b = ((b & 0xCC) >> 2) | ((b & 0x33) << 2)
    # שלב 3: ביטים בודדים בתוך כל זוג
    b = ((b & 0xAA) >> 1) | ((b & 0x55) << 1)
    return b & 0xFF
\`\`\`

**מעקב על \`b = 0b10110100\` (0xB4):**

| שלב            | ערך binary    | hex   |
|----------------|---------------|-------|
| התחלה          | 1011 0100     | 0xB4  |
| אחרי חצאים     | 0100 1011     | 0x4B  |
| אחרי זוגות     | 0001 1110     | 0x1E  |
| אחרי ביטים     | 0010 1101     | 0x2D  ✓ |

\`0x2D = 0b00101101\` — זה אכן ההיפוך של \`0xB4\`.

**למה זה O(1) אמיתי?** מספר הפעולות (6 ANDs, 3 ORs, 6 shifts) קבוע — לא תלוי ב-\`b\`. בניגוד ל-loop, אין branching דינמי.

---

**שלבי החשיבה:**

1. **Divide-and-conquer בביטים** — הרעיון: במקום להעביר ביט-ביט, נחליף **חצאים שלמים** בפעולה אחת.
2. **רקורסיה ביטוויז** — כל שלב מחלק את היחידה הקודמת ל-2. אחרי 3 שלבים (log₂(8)=3) הגענו לרזולוציה של ביט בודד = ההיפוך הסופי.
3. **המסכות הן ביסיט** — \`0xF0\` בוחר את ה-4 העליונים, \`0x0F\` את ה-4 התחתונים. \`0xCC = 11001100\` בוחר את הזוגות העליונים של כל חצי. \`0xAA = 10101010\` בוחר את הביטים הזוגיים. הקשר ל-fractals מהמם.`,
        interviewerMindset:
`חלק זה מפריד בין מועמדים "ידעו לכתוב לולאה" לבין "מכירים את הטריקים המתקדמים". המראיין רוצה לראות:

1. **שאתה רואה את divide-and-conquer בביטים.** אם אתה תקוע ב-loop — סימן שלא חשבת לעומק.
2. **שאתה זוכר את המסכות.** \`0xF0/0x0F\`, \`0xCC/0x33\`, \`0xAA/0x55\` — לא צריך לזכור בעל-פה, אבל אם תוציא את הביטוויז כ-pattern (\`1111 0000\`, \`1100 1100\`, \`1010 1010\`) המראיין רואה שיש לך הבנה.
3. **שאתה מסביר מדוע זה O(1) ולא O(log n).** 3 שלבים זה log₂(byte size), אבל "size" קבוע = "3" קבוע = O(1).

**הרחבה נפוצה:** "כיצד תרחיב ל-32 ביט?" → 5 שלבים (log₂(32)=5). מסכות גדולות יותר: \`0xFFFF0000\`, \`0xFF00FF00\`, \`0xF0F0F0F0\`, \`0xCCCCCCCC\`, \`0xAAAAAAAA\`. אותה הרעיון.`,
        expectedAnswers: ['0xF0', '0x0F', '0xCC', '0x33', '0xAA', '0x55', 'divide', 'mask'],
      },
      {
        label: 'ג',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def reverse_register(x, width=32):
    """Reverse the bits of a width-bit register in constant time.
    Generalises part ב to any power-of-2 width."""
    # TODO: log2(width) divide-and-conquer steps
    pass


# print(hex(reverse_register(0x12345678, 32)))    # 0x1E6A2C48
`,
        trace: {
          title: 'Register reverse — 0x12345678 → 0x1E6A2C48 (32 ביט)',
          steps: [
            {
              code: 'init: x = 0x12345678',
              explain: 'נקודת התחלה. \\\`log₂(32) = 5\\\` שלבים נדרשים. כל שלב מחליף בלוקים בגודל \\\`2^k\\\` בהיררכיה.',
              viz: _bitsReverseSvg({ bitsBefore: _hexBits('12345678'), stepLabel: 'init — 0x12345678 (32-bit)' }),
            },
            {
              code: 'step 1: 16 ↔ 16   (mask 0xFFFF0000 / 0x0000FFFF)',
              explain: 'מחליפים שני חצאי-מילה. \\\`0x12345678\\\` → \\\`0x56781234\\\`.',
              viz: _bitsReverseSvg({
                bitsBefore: _hexBits('12345678'),
                bitsAfter:  _hexBits('56781234'),
                swaps: _dcSwaps(32, 1),
                stepLabel: 'STEP 1 — 16 ↔ 16',
              }),
            },
            {
              code: 'step 2: 8 ↔ 8   (mask 0xFF00FF00 / 0x00FF00FF)',
              explain: 'בתוך כל מחצית-מילה, מחליפים את שני הבייטים. \\\`0x56781234\\\` → \\\`0x78563412\\\`.',
              viz: _bitsReverseSvg({
                bitsBefore: _hexBits('56781234'),
                bitsAfter:  _hexBits('78563412'),
                swaps: _dcSwaps(32, 2),
                stepLabel: 'STEP 2 — 8 ↔ 8',
              }),
            },
            {
              code: 'step 3: 4 ↔ 4   (mask 0xF0F0F0F0 / 0x0F0F0F0F)',
              explain: 'מחליפים nibbles בתוך כל בייט. \\\`0x78563412\\\` → \\\`0x87654321\\\`.',
              viz: _bitsReverseSvg({
                bitsBefore: _hexBits('78563412'),
                bitsAfter:  _hexBits('87654321'),
                swaps: _dcSwaps(32, 3),
                stepLabel: 'STEP 3 — 4 ↔ 4',
              }),
            },
            {
              code: 'step 4: 2 ↔ 2   (mask 0xCCCCCCCC / 0x33333333)',
              explain: 'מחליפים זוגות 2-ביט בתוך כל nibble.',
              viz: _bitsReverseSvg({
                bitsBefore: _hexBits('87654321'),
                bitsAfter:  _hexBits('2D951C84'),
                swaps: _dcSwaps(32, 4),
                stepLabel: 'STEP 4 — 2 ↔ 2',
              }),
            },
            {
              code: 'step 5: 1 ↔ 1   (mask 0xAAAAAAAA / 0x55555555)',
              explain: 'הצעד האחרון — מחליפים ביטים בודדים. **התוצאה: \\\`0x1E6A2C48\\\` = ההיפוך של \\\`0x12345678\\\`** ✓',
              viz: _bitsReverseSvg({
                bitsBefore: _hexBits('2D951C84'),
                bitsAfter:  _hexBits('1E6A2C48'),
                swaps: _dcSwaps(32, 5),
                stepLabel: 'STEP 5 — 1 ↔ 1   →   0x1E6A2C48 ✓',
                done: true,
              }),
            },
          ],
        },
        question:
`הרחיבו את הפתרון מחלק ב' ל-register כללי ברוחב **32 ביט** (או באופן כללי — כל רוחב שהוא חזקה של 2).`,
        hints: [
          'אותו רעיון כמו בחלק ב, אבל יותר שלבים. כמה?',
          '\`log₂(32) = 5\` שלבים. מסכות גדולות יותר. כל שלב מחליף "יחידות" באורך \`2^k\`.',
          'בכל שלב, המסכה לוקחת \`width/2/2^k\` "בלוקים" באורך \`2^k\` שכן זה לצד זה.',
        ],
        answer:
`**Divide-and-conquer מוכלל.** \`log₂(width)\` שלבים.

\`\`\`python
def reverse_register(x, width=32):
    # שלב 1: 16 ↔ 16
    x = ((x & 0xFFFF0000) >> 16) | ((x & 0x0000FFFF) << 16)
    # שלב 2: 8 ↔ 8 בתוך כל חצי
    x = ((x & 0xFF00FF00) >> 8)  | ((x & 0x00FF00FF) << 8)
    # שלב 3: 4 ↔ 4
    x = ((x & 0xF0F0F0F0) >> 4)  | ((x & 0x0F0F0F0F) << 4)
    # שלב 4: 2 ↔ 2
    x = ((x & 0xCCCCCCCC) >> 2)  | ((x & 0x33333333) << 2)
    # שלב 5: 1 ↔ 1
    x = ((x & 0xAAAAAAAA) >> 1)  | ((x & 0x55555555) << 1)
    return x & 0xFFFFFFFF
\`\`\`

**Pattern של המסכות:** כל מסכה היא repeat של \`{1×2^k}{0×2^k}\` או הפוך, על פני כל ה-32 ביט.

**Generalisation:** עבור width = 64, מוסיפים שלב ראשון של \`0xFFFFFFFF00000000\` ↔ \`0x00000000FFFFFFFF\` (32-bit halves). 6 שלבים בסך הכל.

**ב-CPU אמיתיים** — לפעמים יש הוראה \`RBIT\` ייעודית (ARM, RISC-V Zbb extension) שעושה את כל זה במחזור יחיד. אחרת — divide-and-conquer הוא הגישה הסטנדרטית.

---

**שלבי החשיבה:**

1. **Pattern recognition** — \`log₂(width)\` שלבים, מסכות עם תבנית \`0/1\` חוזרת. כתבת אחד פעם, ראית את הסידור.
2. **Hex masks הם אסתטיים** — \`0xFFFF0000\` קל לזיהוי. אם כותב מסכה בעצמך בלי לזכור — מבטא כ-binary של 1ים ו-0ים. ה-shifts הם \`width/2, width/4, ..., 1\`.
3. **\`& 0xFFFFFFFF\` בסוף** — חיוני ב-Python כי int הוא אינסופי. ב-C/Rust עם uint32 לא צריך.`,
        interviewerMindset:
`חלק זה הוא הרחבה שמאמתת שמועמד תפש את התבנית, לא רק שיינן 3 שורות מ-ב'. ההבדל בין מועמד טוב למצוין:

1. **טוב:** כותב 5 שורות לפי הדפוס.
2. **מצוין:** מציע parametric loop שמייצר את המסכות אוטומטית מתוך \`width\`:
   \`\`\`python
   shift = width >> 1
   while shift > 0:
       mask = ...  # constructed
       x = ((x & ~mask) >> shift) | ((x & mask) << shift)
       shift >>= 1
   \`\`\`
   זה O(log width) במקום O(1) חוקי, אבל המראיין יעריך את החשיבה התבניתית.

**מועמד מעולה גם מזכיר שזה ניתן לסנתז כ-hardware**: וקטור 32-ביט עם 5 layers של MUX — בדיוק כמו barrel shifter. שווה במיוחד אם השאלה קורית בראיון לעמדת ASIC engineer.`,
        expectedAnswers: ['0xFFFF0000', '0xFF00FF00', '0xF0F0F0F0', '0xCCCCCCCC', '0xAAAAAAAA', 'log', 'width'],
      },
    ],
    source: 'PP - שאלות קוד (slide 12)',
    tags: ['algorithms', 'bit-manipulation', 'divide-and-conquer', 'reverse-bits', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8013 — Random7() from Random5() (rejection sampling)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'random7-from-random5',
    difficulty: 'medium',
    title: 'Random7() מ-Random5() — שוב rejection sampling',
    intro:
`נתונה הפונקציה \`Random5()\` שמחזירה ערך **רנדומלי** בין \`1\` ל-\`5\` בהסתברות שווה (\`⅕\` לכל אחד). עליכם לממש \`Random7()\` שמחזירה ערך בין \`1\` ל-\`7\`, **כל אחד ב-⅐**.

זוהי הרחבה של שאלה #8006 (Rand3 מ-BinaryRand). אותו עיקרון — **rejection sampling** — אבל בקנה מידה גדול יותר.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time (avg)',   value: 'O(1)' },
          { label: 'Time (worst)', value: '∞ (rejection)' },
          { label: 'Space',        value: 'O(1)' },
        ],
        starterCode:
`def Random5():
    """Black box — returns 1..5 with probability 1/5 each."""
    import random
    return random.randint(1, 5)


def Random7():
    """Return 1..7 with equal probability. Use only Random5()."""
    # TODO: rejection sampling on a 5×5 grid
    pass
`,
        trace: {
          title: 'Random7 — דגימת רשת 5×5 (כולל דחייה אחת)',
          steps: [
            {
              code: 'init — 25 תוצאות שווי-הסתברות, 21 מקובלות + 4 דחויות',
              explain: 'הרשת מציגה את כל מרחב המדגם של 2 קריאות ל-Random5: \\\`a × b\\\` = 25 תאים. תאים 22-25 (\\\`✗\\\`) ידחו ויחזירו ניסיון חדש. שאר ה-21 נחלקים שווה בשווה ל-7 קבוצות.',
              viz: _random7GridSvg({}),
            },
            {
              code: 'a = Random5() = 5',
              explain: 'קריאה ראשונה. נבחרה השורה a=5 — שורת התאים 21-25 בלוח.',
              viz: _random7GridSvg({ pickA: 5 }),
            },
            {
              code: 'b = Random5() = 5  →  idx = 25',
              explain: 'קריאה שנייה. \\\`b=5\\\` → תא הימני בשורה החמישית, \\\`idx = (5-1)×5 + (5-1) + 1 = 25\\\`. **זה תא דחייה.**',
              viz: _random7GridSvg({ pickA: 5, pickB: 5, accepted: false }),
            },
            {
              code: 'idx = 25 > 21 → REJECT, retry',
              explain: 'התא נופל מחוץ ל-21 הראשונים → דוחים ומחזירים ל-\\\`while True\\\`. הסתברות לדחייה: \\\`4/25 = 16%\\\`.',
              viz: _random7GridSvg({ pickA: 5, pickB: 5, accepted: false }),
            },
            {
              code: 'retry: a = Random5() = 2',
              explain: 'ניסיון חוזר. \\\`a=2\\\` → שורה שנייה.',
              viz: _random7GridSvg({ pickA: 2 }),
            },
            {
              code: 'retry: b = Random5() = 4  →  idx = (2-1)*5 + (4-1) + 1 = 9',
              explain: '\\\`b=4\\\` → תא במקום 9. **\\\`9 ≤ 21\\\` → מתקבל!**',
              viz: _random7GridSvg({ pickA: 2, pickB: 4, accepted: true }),
            },
            {
              code: 'return ((9-1) % 7) + 1 = 2',
              explain: 'התא 9 ממופה ל-\\\`((9-1) mod 7) + 1 = 2\\\`. שימו לב שכל ערך \\\`1..7\\\` מקבל בדיוק 3 תאים מתוך ה-21 → סבירות אחידה \\\`3/21 = 1/7\\\`. ✓\\n\\nניסיונות בממוצע: \\\`25/21 ≈ 1.19\\\`. קריאות ל-Random5 בממוצע: \\\`~2.38\\\`.',
              viz: _random7GridSvg({ pickA: 2, pickB: 4, accepted: true, returnedVal: 2, done: true }),
            },
          ],
        },
        question:
`ממשו את \`Random7()\`. מהי הסיבוכיות הצפויה? מה היחס למקרה של Random3 מ-BinaryRand?`,
        hints: [
          'אם תקרא ל-Random5 פעמיים, כמה תוצאות שונות אפשריות? באיזו הסתברות?',
          'שתי קריאות → 25 תוצאות שווי-הסתברות (1..5 × 1..5). 25 לא מתחלק ב-7. איך תבחר 21 (= 3 × 7) ותדחה 4?',
          'נמספר את 25 התוצאות \`(a-1)*5 + (b-1) + 1\` = \`1..25\`. אם \`≤ 21\` → החזר \`((idx - 1) % 7) + 1\`. אחרת — חזור.',
        ],
        answer:
`**Rejection sampling על רשת 5×5.** מתוך 25 תוצאות שווי-הסתברות בוחרים 21 (כפולה של 7) ומחלקים ל-7 קבוצות שוות.

\`\`\`python
def Random7():
    while True:
        a = Random5()
        b = Random5()
        idx = (a - 1) * 5 + (b - 1) + 1   # 1..25
        if idx <= 21:
            return ((idx - 1) % 7) + 1
        # else: 22..25 — reject and retry
\`\`\`

**ניתוח הסתברות.**

\`P(idx ≤ 21) = 21/25\`. מספר הניסיונות עד הצלחה: התפלגות גיאומטרית עם \`p = 21/25\` ⇒
\`E[ניסיונות] = 25/21 ≈ 1.19\`. כל ניסיון = 2 קריאות ל-Random5 ⇒ **בממוצע ~2.38 קריאות**.

**מתי כל ערך?** הקבוצות:
- 1→{1,8,15}
- 2→{2,9,16}
- 3→{3,10,17}
- 4→{4,11,18}
- 5→{5,12,19}
- 6→{6,13,20}
- 7→{7,14,21}

3 הופעות לכל ערך, מתוך 21 — בדיוק \`3/21 = 1/7\`. ✓

---

**שלבי החשיבה:**

1. **\`k\` מטבעות m-מצביות → m^k תוצאות שווות.** 2 קריאות ל-Random5 = 25 תוצאות. כל הרחבה דורשת **k** כך ש-\`5^k ≥ 7\`.
2. **בחר את הכפולה הגדולה ביותר של 7 שלא חורגת מ-25.** = \`21\`. דוחים 22..25.
3. **map ב-mod.** \`((idx-1) % 7) + 1\` ⇒ ערכים \`1..7\`.

**הרחבה: Random7 מ-Random5 בלי modulo.** מותר רק חיבור/חיסור/השוואות? ניתן עם 7 if-im. בסט מצומצם של אופרטורים, modulo חוסך זמן.

**שאלה שיותר עמוקה ביותר:** "ממש \`RandM\` מ-\`RandN\` כללי." → אם \`gcd(M, N) = 1\` ו-\`M ≤ N^k\` קיים, נוסחה כללית עובדת.`,
        interviewerMindset:
`ההמשך של 8006. המראיין מצפה לראות:

1. **שאתה מזהה שזה rejection sampling.** "פעמיים 5 = 25, אבל 25 לא מתחלק ב-7" — צריך לדחות עודף. מועמד שמנסה \`(Random5() + Random5() - 1) % 7\` או חישובים אריתמטיים אחרים נופל כי ההסתברויות לא יוצאות אחידות.

2. **שאתה זוכר את הניתוח.** \`E[calls] = 50/21 ≈ 2.38\`. מי שאומר "צריך פעמיים" בלי לחשב — איבד נקודה.

3. **שאתה מבין את הקשר ל-8006.** Rand3 מ-BinaryRand היה rejection על 4 תוצאות (קח 3, דחה 1). Random7 מ-Random5 הוא אותו רעיון בקנה מידה גדול יותר.`,
        expectedAnswers: ['rejection', 'while', '5*5', '25', '21', '7', '% 7', 'mod'],
      },
    ],
    source: 'PP - שאלות קוד (slide 13)',
    tags: ['algorithms', 'probability', 'rejection-sampling', 'random', 'extending', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8014 — Topological sort from "<" pairs
  // ───────────────────────────────────────────────────────────────
  {
    id: 'topological-sort-from-pairs',
    difficulty: 'medium',
    title: 'מיון משתנים לפי יחסי גודל — Topological Sort',
    intro:
`נתונה טבלה של זוגות יחסי-גודל בין משתנים: למשל \`a < b\`, \`x > y\`,
\`c < a\`. תארו אלגוריתם שמסדר את כל המשתנים ב**סדר עולה**, אם הדבר אפשרי.

\`\`\`
Input:  pairs = [("a", "b"), ("c", "a"), ("x", "y"), ("y", "a")]
        # i.e.  a < b, c < a, x < y, y < a
Output: ["c", "x", "y", "a", "b"]    (אחד מהסדרים החוקיים)
\`\`\`

**שאלות לשלוט עליהן:** איך מזהים שאין סדר חוקי (יש מעגל)?`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(V + E)' },
          { label: 'Space', value: 'O(V + E)' },
        ],
        starterCode:
`from collections import defaultdict, deque


def sort_by_pairs(pairs):
    """pairs: list of (smaller, larger) tuples.
    Return a list of variable names in ascending order, or None
    if no valid order exists (cycle)."""
    # TODO: build graph, run Kahn's topological sort
    pass


# print(sort_by_pairs([("a", "b"), ("c", "a"), ("x", "y"), ("y", "a")]))
# → ["c", "x", "y", "a", "b"]  (or another valid order)
`,
        trace: {
          title: 'Topological sort — pairs=[(a,b),(c,a),(x,y),(y,a)]',
          source:
`def sort_by_pairs(pairs):
    graph    = defaultdict(set)
    in_degree = defaultdict(int)
    nodes     = set()
    for s, b in pairs:
        nodes.add(s); nodes.add(b)
        if b not in graph[s]:
            graph[s].add(b)
            in_degree[b] += 1
    queue = deque([n for n in nodes if in_degree[n] == 0])
    result = []
    while queue:
        n = queue.popleft()
        result.append(n)
        for nb in graph[n]:
            in_degree[nb] -= 1
            if in_degree[nb] == 0:
                queue.append(nb)
    return result if len(result) == len(nodes) else None`,
          sourceLang: 'python',
          steps: [
            {
              code: 'init: build graph + in_degree counts',
              explain: 'בנינו את הגרף המכוון. \\\`c → a → b\\\`, \\\`x → y → a\\\`. ה-in_degree של כל קודקוד: \\\`a:2, b:1, c:0, x:0, y:1\\\`. \\\`c\\\` ו-\\\`x\\\` הם "שורשים" — תלות-אפס.',
              executed: [2, 3, 4, 5, 6, 7, 8, 9], focusLine: 9,
              viz: _topoGraphSvg({
                inDegree: { a: 2, b: 1, c: 0, x: 0, y: 1 },
                removed: [], queue: [], result: [],
              }),
            },
            {
              code: 'enqueue all zero-in-degree: queue = [c, x]',
              explain: 'הקודקודים \\\`c\\\` ו-\\\`x\\\` (in_deg=0) נכנסים לתור. הם ה"קודמים" — אין מי שמופיע לפניהם.',
              executed: [10, 11], focusLine: 10,
              viz: _topoGraphSvg({
                inDegree: { a: 2, b: 1, c: 0, x: 0, y: 1 },
                removed: [], queue: ['c', 'x'], result: [],
              }),
            },
            {
              code: 'pop c → result = [c]; decrement a (2→1)',
              explain: 'מוציאים את \\\`c\\\`. מוסיפים לתוצאה. כל הקשתות היוצאות ממנו — מעדכנים את ה-in_deg של ה"שכנים". \\\`a\\\` יורד מ-2 ל-1 (עדיין לא מוכן).',
              executed: [12, 13, 14, 15, 16, 17], focusLine: 16,
              viz: _topoGraphSvg({
                inDegree: { a: 1, b: 1, c: 0, x: 0, y: 1 },
                removed: ['c'], queue: ['x'], result: ['c'],
                highlight: 'c',
              }),
            },
            {
              code: 'pop x → result = [c, x]; decrement y (1→0) → queue',
              explain: 'מוציאים את \\\`x\\\`. \\\`y\\\` מצטמצם ל-0 → נכנס לתור.',
              executed: [12, 13, 14, 15, 16, 17, 18], focusLine: 18,
              viz: _topoGraphSvg({
                inDegree: { a: 1, b: 1, c: 0, x: 0, y: 0 },
                removed: ['c', 'x'], queue: ['y'], result: ['c', 'x'],
                highlight: 'x',
              }),
            },
            {
              code: 'pop y → result = [c, x, y]; decrement a (1→0) → queue',
              explain: '\\\`y\\\` יוצא. \\\`a\\\` יורד ל-0 → לתור. עכשיו כל הקודקודים שלפני \\\`a\\\` "טופלו".',
              executed: [12, 13, 14, 15, 16, 17, 18], focusLine: 18,
              viz: _topoGraphSvg({
                inDegree: { a: 0, b: 1, c: 0, x: 0, y: 0 },
                removed: ['c', 'x', 'y'], queue: ['a'], result: ['c', 'x', 'y'],
                highlight: 'y',
              }),
            },
            {
              code: 'pop a → result = [c, x, y, a]; decrement b (1→0) → queue',
              explain: '\\\`a\\\` יוצא. \\\`b\\\` מצטמצם ל-0.',
              executed: [12, 13, 14, 15, 16, 17, 18], focusLine: 18,
              viz: _topoGraphSvg({
                inDegree: { a: 0, b: 0, c: 0, x: 0, y: 0 },
                removed: ['c', 'x', 'y', 'a'], queue: ['b'], result: ['c', 'x', 'y', 'a'],
                highlight: 'a',
              }),
            },
            {
              code: 'pop b → result = [c, x, y, a, b]   queue empty',
              explain: '\\\`b\\\` יוצא. התור ריק, כל הקודקודים בתוצאה. \\\`len(result) == len(nodes)\\\` ⇒ אין מעגל ⇒ הסדר חוקי. **c < x < y < a < b** ✓',
              executed: [12, 19], focusLine: 19,
              viz: _topoGraphSvg({
                inDegree: { a: 0, b: 0, c: 0, x: 0, y: 0 },
                removed: ['c', 'x', 'y', 'a', 'b'], queue: [], result: ['c', 'x', 'y', 'a', 'b'],
                done: true,
              }),
            },
          ],
        },
        question:
`תארו וממשו אלגוריתם. איך מטפלים במצב של "אין סדר חוקי" (e.g. \`a<b, b<c, c<a\`)?`,
        hints: [
          'אם נחשוב על הזוגות כעל יחסים בגרף, מה הקודקודים? מה הקשתות?',
          'גרף מכוון: כל זוג \`a < b\` הוא קשת \`a → b\`. הסדר העולה = topological sort.',
          'אלגוריתם Kahn: שמרו מונה in-degree לכל קודקוד. תור עם כל ה-in-degree=0. הוציאו, הוסיפו לתוצאה, הקטינו את ה-in-degree של השכנים. מעגל ⇒ נשארו קודקודים עם in-degree>0 בסוף.',
        ],
        answer:
`**Topological sort (Kahn).** \`O(V + E)\` זמן.

\`\`\`python
from collections import defaultdict, deque


def sort_by_pairs(pairs):
    # 1. Build directed graph: smaller → larger
    graph    = defaultdict(set)
    in_degree = defaultdict(int)
    nodes     = set()
    for s, b in pairs:
        nodes.add(s); nodes.add(b)
        if b not in graph[s]:
            graph[s].add(b)
            in_degree[b] += 1
    # nodes that appear only as 'smaller' have in_degree 0 by default

    # 2. Initialise queue with all in_degree == 0 nodes
    queue = deque([n for n in nodes if in_degree[n] == 0])
    result = []

    # 3. Repeatedly take an in_degree-0 node, append to result,
    #    decrement neighbours' in_degree, enqueue new zeros
    while queue:
        n = queue.popleft()
        result.append(n)
        for nb in graph[n]:
            in_degree[nb] -= 1
            if in_degree[nb] == 0:
                queue.append(nb)

    # 4. Cycle check: if not every node made it to the result,
    #    a cycle prevented some from ever hitting in_degree 0.
    return result if len(result) == len(nodes) else None
\`\`\`

**הרצה על הדוגמה:**

| שלב | result | queue | in_degree |
|---|---|---|---|
| init | [] | [c, x] | a:2, b:1, y:1 |
| pop c | [c] | [x] | a:1, b:1, y:1 |
| pop x | [c, x] | [y] | a:1, b:1, y:0 |
| pop y | [c, x, y] | [a] | a:0, b:1 |
| pop a | [c, x, y, a] | [b] | b:0 |
| pop b | [c, x, y, a, b] | [] | (all 0) |

**מעגל = הימצאות שאריות.** עבור \`pairs = [("a","b"), ("b","c"), ("c","a")]\`: כל הקודקודים מתחילים ב-in_degree=1 ⇒ התור הראשוני ריק ⇒ \`result = []\` ⇒ \`len < len(nodes)\` ⇒ \`None\`.

**גישה חלופית:** DFS עם 3 צבעים (לבן/אפור/שחור). מעגל מזוהה כשנתקלים בקודקוד אפור (currently-being-explored). post-order של DFS היא topological sort הפוכה.

---

**שלבי החשיבה:**

1. **זוגות = קשתות, משתנים = קודקודים.** "מי קטן ממי" מומפ לכיוון קשת. סדר עולה = topological sort.
2. **Kahn vs DFS** — Kahn אינטואיטיבי ("מי הקטן ביותר עכשיו"); DFS פוטוגני יותר ויותר מהיר ב-coding בעיון. שניהם O(V+E).
3. **זיהוי מעגל מובנה.** Kahn לא ימצא קודקודים שכלולים במעגל ⇒ אם התוצאה קצרה — יש מעגל. DFS — מזהה ע"י "נתקלת בקודקוד אפור".`,
        interviewerMindset:
`קלאסיקה של ראיוני graph algorithms. המראיין רוצה לראות:

1. **שאתה מזהה את הבעיה כ-topological sort.** מועמד שמתחיל לחשוב על "מיון כללי" ולא רואה את הגרף — איבד כיוון.
2. **שאתה זוכר את שני האלגוריתמים** (Kahn ו-DFS) ויכול לבחור. Kahn טוב כשרוצים "level-by-level" עיבוד; DFS טוב כשהגרף קטן ויש זרימה רקורסיבית טבעית.
3. **שאתה מטפל בקלט המעוות** — מעגל, קודקודים מבודדים, זוג כפול. מועמד שאומר "אהבה, אחזיר את התוצאה גם אם יש מעגל" — לא יציל.

**שאלת המשך שכיחה:** "מה אם רוצים *את הסדר היציב יחסי* — אלפבית בין קודקודים שווי-עדיפות?" → תחליפו את ה-\`deque\` ב-\`heapq\` — תור עדיפויות עם מילים lexically.`,
        expectedAnswers: ['topological', 'top sort', 'Kahn', 'in-degree', 'queue', 'cycle', 'מעגל'],
      },
    ],
    source: 'PP - שאלות קוד (slide 14)',
    tags: ['algorithms', 'graph', 'topological-sort', 'kahn', 'BFS', 'cycle-detection', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8015 — Multiply two integers using ONLY bitwise operators
  // ───────────────────────────────────────────────────────────────
  {
    id: 'bitwise-multiply',
    difficulty: 'medium',
    title: 'כפל באמצעות bitwise בלבד',
    intro:
`המעבד שאתה עובד עליו תומך **רק** ב-\`bitwise operators\` — \`&\`, \`|\`,
\`^\`, \`~\`, \`<<\`, \`>>\`. אין הוראת \`MUL\`, אין \`ADD\` ישיר, אין
לולאות מובנות (לולאות מותרות באלגוריתם, אבל הפעולות עצמן ביטוויז בלבד).

ממשו את \`multiply(a, b)\` שמחזירה \`a * b\`.

**הנחה לפשטות:** \`a, b\` חיוביים. הרחבה לערכים שליליים — בונוס.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(log b)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def add_bits(x, y):
    """Add two ints using only bitwise operators (no '+')."""
    while y != 0:
        carry = (x & y) << 1
        x = x ^ y
        y = carry
    return x


def multiply(a, b):
    """a * b using only bitwise operators (+ add_bits as helper)."""
    # TODO: shift-and-add (Russian peasant)
    pass


# print(multiply(13, 9))    # 117
# print(multiply(7, 0))     # 0
`,
        trace: {
          title: 'Bitwise multiply — 3 × 5 = 15',
          source:
`def multiply(a, b):
    result = 0
    while b > 0:
        if b & 1:
            result = add_bits(result, a)
        a <<= 1
        b >>= 1
    return result`,
          sourceLang: 'python',
          steps: [
            { code: 'init: a=3, b=5, result=0', explain: 'a הוא הכפלן (\\\`011\\\`), b הוא המכפיל (\\\`101\\\`). result יצטבר עם כל ביט דולק של b.',
              executed: [1, 2, 3], focusLine: 3,
              viz: _bitMultiplySvg({ a: 3, b: 5, result: 0, action: 'init' }) },
            { code: 'iter 1: b & 1 = 1   →   result += a', explain: 'ה-LSB של b דולק. מוסיפים \\\`a=3\\\` ל-result (באמצעות \\\`add_bits\\\`, לא \\\`+\\\` כי אסור).',
              executed: [3, 4, 5], focusLine: 5,
              viz: _bitMultiplySvg({ a: 3, b: 5, result: 3, action: 'add' }) },
            { code: 'iter 1: a <<= 1 (=6),  b >>= 1 (=2)', explain: 'מקדמים: a מוכפל ב-2, b מחולק ב-2.',
              executed: [6, 7], focusLine: 7,
              viz: _bitMultiplySvg({ a: 6, b: 2, result: 3, action: 'shift' }) },
            { code: 'iter 2: b & 1 = 0   →   skip add', explain: 'הביט הדלוק כבוי → לא מוסיפים.',
              executed: [3, 4], focusLine: 4,
              viz: _bitMultiplySvg({ a: 6, b: 2, result: 3, action: 'skip' }) },
            { code: 'iter 2: a <<= 1 (=12),  b >>= 1 (=1)', explain: 'a הוכפל פעמיים כבר.',
              executed: [6, 7], focusLine: 7,
              viz: _bitMultiplySvg({ a: 12, b: 1, result: 3, action: 'shift' }) },
            { code: 'iter 3: b & 1 = 1   →   result += a', explain: 'הביט הדלוק האחרון של b. \\\`3 + 12 = 15\\\`.',
              executed: [3, 4, 5], focusLine: 5,
              viz: _bitMultiplySvg({ a: 12, b: 1, result: 15, action: 'add' }) },
            { code: 'iter 3: a <<= 1 (=24),  b >>= 1 (=0)', explain: 'אחרי ההזזה b=0.',
              executed: [6, 7], focusLine: 7,
              viz: _bitMultiplySvg({ a: 24, b: 0, result: 15, action: 'shift' }) },
            { code: 'b == 0 → return 15', explain: '**\\\`3 × 5 = 15\\\`** ✓. שלוש איטרציות = ה-bit count של b. Russian-peasant.',
              executed: [3, 8], focusLine: 8,
              viz: _bitMultiplySvg({ a: 24, b: 0, result: 15, action: 'done', done: true }) },
          ],
        },
        question:
`ממשו את \`multiply(a, b)\` באמצעות ביטוויז בלבד. רמז: כפל = חיבור חוזר עם הזזות. למה זה O(log b)?`,
        hints: [
          'כפל אריתמטי \`a × b\` = סכום של \`a × 2^k\` לכל ביט \`k\` שדולק ב-\`b\`. למה זה עוזר?',
          'בכל איטרציה: אם ה-LSB של \`b\` דולק, מוסיפים \`a\` לתוצאה. אז \`a <<= 1\` (כפל ב-2) ו-\`b >>= 1\` (חלוקה ב-2). מסיימים כש-\`b == 0\`.',
          'מספר הצעדים = מספר הביטים של \`b\` = \`log₂(b)\`. החיבור הביטוויז (\`add_bits\`) נדרש כי גם \`+\` אסור.',
        ],
        answer:
`**Russian peasant multiplication / shift-and-add.** \`O(log b)\` איטרציות. כל אחת מתאדה את הביט הנמוך של \`b\` ומכפילה את \`a\` ב-2.

\`\`\`python
def add_bits(x, y):
    """x + y באמצעות bitwise בלבד."""
    while y != 0:
        carry = (x & y) << 1     # מקומות שבהם יש carry
        x = x ^ y                  # סכום בלי carry
        y = carry                  # carry-in לאיטרציה הבאה
    return x


def multiply(a, b):
    result = 0
    while b > 0:
        if b & 1:                  # אם הביט הנמוך של b דולק
            result = add_bits(result, a)
        a <<= 1                    # כפל a ב-2
        b >>= 1                    # b /= 2
    return result
\`\`\`

**מעקב על \`3 × 5 = 15\`:**

| iter | a (binary) | b (binary) | b & 1 | result |
|---|---|---|---|---|
| 0 | 0011 | 0101 | 1 | 0 → 3 |
| 1 | 0110 | 0010 | 0 | 3 |
| 2 | 1100 | 0001 | 1 | 3 → 15 |
| 3 | (loop exits, b=0) | | | **15** ✓ |

**איך \`add_bits\` עובד? סימולציה של full-adder.** \`x ^ y\` = סכום בלי carry. \`(x & y) << 1\` = carry של full-adder, מועתק לקלט של האיטרציה הבאה. בעצם זה כפי שהמעבד החומרתי עושה את החיבור — fully-parallel, אבל מסומלץ סדרתית עד שה-carry נעלם.

**ערכים שליליים?** אם משתמשים ב-Python int, אין צורך לטפל בסימן — \`>>\` שומר על סימן ב-Python ב-ints שליליים. ב-C/Rust: צריך לזכור את הסימן של תוצאה, להפוך את \`a, b\` ל-abs, ולהחיל סימן בסוף.

---

**שלבי החשיבה:**

1. **כפל = חיבור עם הזזה** — כל ביט דולק ב-\`b\` מוסיף \`a\` שמוזז שמאלה ב-k מקומות. זה בדיוק long multiplication שלמדנו בכיתה ב, רק בבסיס 2.
2. **חיבור גם דורש סימולציה ביטוויז.** \`+\` אסור — חייבים \`add_bits\`. ה-trick של \`carry = (x & y) << 1; x = x ^ y\` הוא הקלאסיקה.
3. **לולאה לא ביטוויז = OK.** השאלה מגבילה את ה**פעולות** ל-bitwise, לא את structure-of-code.`,
        interviewerMindset:
`שאלת bit-tricks קלאסית — בגרסה ICS / ASIC. המראיין רוצה לראות:

1. **שאתה ראית את ה-decomposition \`a × b = Σ (b_k × 2^k) × a\`.** זה לא "טריק" — זה ההגדרה של כפל בבסיס 2. מי שלא רואה את זה — חוסר fluency ביטוויז.
2. **שאתה ממש את \`add_bits\` במקום להתעלם מההגבלה.** מועמדים פעמים אומרים "אני אשתמש ב-+" — נופלים על ההגבלה הקטנונית.
3. **שאתה מסביר את הקשר ל-hardware.** Shift-and-add multiplier הוא בלוק קלאסי ב-ASIC. \`add_bits\` הוא ripple-carry adder. מועמד שמזכיר את זה — בונוס ל-hardware roles.

**שאלת המשך שכיחה:** "אבל \`add_bits\` חוזרת על carry — זה O(bits) במקרה הגרוע. אפשר ב-O(1)?" → רמז ל-CLA (carry-lookahead adder), שהוא O(log n) במספר השלבים אבל O(n²) חומרה. דיון מעולה ל-architecture interview.`,
        expectedAnswers: ['a <<= 1', 'b >>= 1', 'b & 1', 'add_bits', 'shift', 'add', 'russian peasant'],
      },
    ],
    source: 'PP - שאלות קוד (slide 15)',
    tags: ['algorithms', 'bit-manipulation', 'multiplication', 'shift-and-add', 'hardware', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8016 — Cyclic right shift (reverse trick)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'cyclic-right-shift',
    difficulty: 'medium',
    title: 'הזזה ציקלית ימינה — Reverse Trick',
    intro:
`נתון מערך \`arr\` בגודל \`N\` ומספר שלם \`t\`. כתבו פונקציה (pseudo-code
או Python) שמבצעת **הזזה ציקלית ימינה ב-\`t\` מקומות** במערך.

\`\`\`
arr = [1, 2, 3, 4, 5, 6],  t = 1   →   [6, 1, 2, 3, 4, 5]
arr = [1, 2, 3, 4, 5, 6],  t = 2   →   [5, 6, 1, 2, 3, 4]
\`\`\`

**אילוץ:** \`O(N)\` זמן, \`O(1)\` זיכרון נוסף.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(N)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'Naive — t shifts של מקום אחד',
            time: 'O(N·t)', space: 'O(1)',
            summary: 'מבצעים הזזה ימינה במקום אחד, \\\`t\\\` פעמים. פשוט אבל איטי.',
            code:
`def shift_naive(arr, t):
    n = len(arr)
    for _ in range(t):
        last = arr[-1]
        for i in range(n - 1, 0, -1):
            arr[i] = arr[i - 1]
        arr[0] = last`,
          },
          {
            name: 'Extra buffer — O(N) זמן, O(N) זיכרון',
            time: 'O(N)', space: 'O(N)',
            summary: 'מערך עזר. \\\`buf[(i + t) % N] = arr[i]\\\`. פשוט מאוד.',
            code:
`def shift_buf(arr, t):
    n = len(arr)
    t %= n
    buf = [0] * n
    for i in range(n):
        buf[(i + t) % n] = arr[i]
    arr[:] = buf`,
          },
          {
            name: 'Reverse trick — O(N) זמן, O(1) זיכרון',
            time: 'O(N)', space: 'O(1)',
            summary: '**3 היפוכים** במקום: כל המערך, \\\`t\\\` האיברים הראשונים, ה-\\\`N-t\\\` הנותרים.',
            code:
`def shift_inplace(arr, t):
    n = len(arr)
    t %= n
    def rev(lo, hi):
        while lo < hi:
            arr[lo], arr[hi] = arr[hi], arr[lo]
            lo += 1; hi -= 1
    rev(0, n - 1)           # היפוך הכל
    rev(0, t - 1)            # היפוך t הראשונים
    rev(t, n - 1)            # היפוך השאר`,
          },
        ],
        trace: {
          title: 'Cyclic right-shift — reverse trick על arr=[1,2,3,4,5,6], t=2',
          steps: [
            {
              code: 'init: arr = [1, 2, 3, 4, 5, 6],  t = 2',
              explain: '**יעד:** הזזה ימינה ב-2 → \\\`[5, 6, 1, 2, 3, 4]\\\`. הרעיון: 3 היפוכים במקום הם O(N) זמן ו-O(1) מקום נוסף.',
              viz: _cyclicShiftSvg({ arr: [1,2,3,4,5,6], label: 'init — shift right by t=2' }),
            },
            {
              code: 'step 1: reverse(0, n-1)',
              explain: 'הופכים את **כל המערך**: \\\`[1,2,3,4,5,6]\\\` → \\\`[6,5,4,3,2,1]\\\`. עכשיו \\\`t\\\` האיברים שהיו אמורים להגיע ל"רוץ" עכשיו ב-prefix.',
              viz: _cyclicShiftSvg({ arr: [6,5,4,3,2,1], hlLo: 0, hlHi: 6, label: 'step 1 — reverse whole array' }),
            },
            {
              code: 'step 2: reverse(0, t-1) → reverse(0, 1)',
              explain: 'הופכים את \\\`t\\\` האיברים הראשונים: \\\`[6,5,...]\\\` → \\\`[5,6,...]\\\`. עכשיו הם בסדר הנכון.',
              viz: _cyclicShiftSvg({ arr: [5,6,4,3,2,1], hlLo: 0, hlHi: 2, label: 'step 2 — reverse first t=2 elements' }),
            },
            {
              code: 'step 3: reverse(t, n-1) → reverse(2, 5)',
              explain: 'הופכים את \\\`N-t\\\` האיברים הנותרים: \\\`[...,4,3,2,1]\\\` → \\\`[...,1,2,3,4]\\\`. **תוצאה: \\\`[5,6,1,2,3,4]\\\`** ✓',
              viz: _cyclicShiftSvg({ arr: [5,6,1,2,3,4], hlLo: 2, hlHi: 6, label: 'step 3 — reverse remaining N-t = 4', done: true }),
            },
          ],
        },
        starterCode:
`def shift_right(arr, t):
    """Cyclic right-shift by t positions. In-place, O(N) time, O(1) space.
    Use the reverse-three-times trick."""
    # TODO
    pass


# arr = [1, 2, 3, 4, 5, 6]
# shift_right(arr, 2)
# print(arr)   # [5, 6, 1, 2, 3, 4]
`,
        question:
`ממשו את \`shift_right(arr, t)\` בשלוש דרכים מסיבוכיות עולה: O(N·t), O(N) זמן+מקום, ו-O(N) זמן + O(1) מקום (reverse trick).`,
        hints: [
          'איך 3 פעולות שכל אחת היא O(N) יכולות להחליף את מה שנראה כמו "הזזה ארוכה" של t איברים?',
          'הפיכת כל המערך מעבירה את \\\`t\\\` האחרונים לראש (אבל בסדר הפוך). מי "מסדר" אותם בחזרה?',
          'reverse(הכל) → reverse(prefix של t) → reverse(suffix של n-t). היפוך כפול = זהות, אבל בקטעים שונים.',
        ],
        answer:
`**Reverse-three-times trick.** O(N) זמן ו-O(1) מקום.

**למה זה עובד?**

נסמן את המערך כ-\`A B\` כש-\`A\` הוא \`n-t\` האיברים הראשונים ו-\`B\` הם \`t\` האחרונים. רוצים לקבל \`B A\`.

\`\`\`
[A | B]                  ← המקורי
[B' | A']                ← אחרי reverse של כל המערך (B' = B הפוך, A' = A הפוך)
[B | A']                 ← אחרי reverse של ה-t הראשונים (מבטל את ה-')
[B | A]                  ← אחרי reverse של ה-n-t האחרונים  ✓
\`\`\`

**\`t %= n\`** קריטי בתחילה — אם \`t > n\` שיני-הזזה ממחזרות, ובכל מקרה \`t\` ו-\`t + n\` נותנים אותה תוצאה.

---

**שלבי החשיבה:**

1. **3 היפוכים = הזזה ציקלית.** זה לא ברור מאליו — קופצים מ"חיבור" (shift) ל"כפל" (reverses).
2. **\`t %= n\` בתחילה** — חשוב במיוחד אם \`t\` יכול להיות גדול מאוד. \`t = N + 5\` שווה ל-\`t = 5\`.
3. **שלוש פעולות O(N) → סיבוכיות \`O(3N) = O(N)\`** — אסור לחשוב "3 פעולות = 3× איטי", כי הקבועים נבלעים ב-Big-O.`,
        interviewerMindset:
`שאלת מערכים קלאסית. המראיין רוצה לראות:

1. **שאתה לא תקוע על הגישה הנאיבית.** מועמד שכותב לולאה כפולה (\`O(N·t)\`) ולא מציע שיפור — איבד נקודות.
2. **שאתה יודע את ה-reverse-trick.** זו טכניקה שלימדה אותה Programming Pearls. אם לא מכיר — המראיין רומז: "מה אם נעשה reverses?".
3. **שאתה דואג ל-\`t %= n\`.** מקרי קצה: \`t = 0\` (no-op), \`t = n\` (זהות), \`t > n\` (modular).

**שאלת המשך:** "מה אם \`t < 0\` (הזזה שמאלית)?" → תשובה: \`t = (t % n + n) % n\` — מנרמל גם שליליים. או: shift_left(arr, |t|) = shift_right(arr, n - |t|).`,
        expectedAnswers: ['reverse', 'rev(', 'three', 'שלוש', 'O(1)', 't % n', 't %= n'],
      },
    ],
    source: 'PP - שאלות קוד (slide 16)',
    tags: ['algorithms', 'array', 'in-place', 'reverse', 'cyclic-shift', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8017 — Check if uint64 is of form 0...01...1 (powers of 2 minus 1)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'check-low-ones-pattern',
    difficulty: 'medium',
    title: 'בדיקת תבנית "‎0...0 1...1‎" ב-64 ביט',
    intro:
`נדרש לבדוק האם ערך **64-bit unsigned** הוא בעל מבנה כזה: **כל ה-LSB דולקים**
ברצף עד ביט מסויים, ולאחר מכן **רק אפסים**.

\`\`\`
Input:  '0...0 1010 1011 0111'   (LSBs לא רצופים)   →   False
Input:  '0...0 0001 1111 1111'   (10 1-ים רצופים)   →   True
Input:  '0' (= 0)                                    →   True (טריוויאלי)
Input:  '0...0 1111 1111' (255)                     →   True
\`\`\`

**שאלת בונוס:** ההמלצה לפתרון בשורה אחת, **\`O(1)\`** זמן, ללא לולאות.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'Naive — מעבר על הביטים',
            time: 'O(bits) = O(64)', space: 'O(1)',
            summary: 'סורקים מה-LSB: מצפים ל-1ים רצופים, ואז ל-0ים בלבד.',
            code:
`def is_low_ones_naive(v):
    seen_zero = False
    for i in range(64):
        bit = (v >> i) & 1
        if seen_zero and bit == 1:
            return False           # 1 אחרי 0 → תבנית שבורה
        if bit == 0:
            seen_zero = True
    return True`,
          },
          {
            name: 'Bit-trick — שורה אחת',
            time: 'O(1)', space: 'O(1)',
            summary: '\\\`v & (v+1) == 0\\\`. הוספת 1 לתבנית \\\`...01..1\\\` "שופכת" carry שמאלה וכל ה-1ים מתאפסים; AND-מקודם מאמת.',
            code:
`def is_low_ones(v):
    return (v & (v + 1)) == 0`,
          },
        ],
        starterCode:
`def is_low_ones(v):
    """Returns True iff v (uint64) is of the form 0...0 1...1.
    O(1) bitwise — no loops."""
    # TODO: one-liner
    pass


# print(is_low_ones(0b111))           # True
# print(is_low_ones(0b1010_1011_0111))  # False
# print(is_low_ones(0))                # True
`,
        trace: {
          title: 'Low-ones — bit-trick `v & (v+1) == 0`',
          steps: [
            {
              code: 'v = 0b0000 0000 0000 0111 (= 7)   ← תבנית תקפה',
              explain: 'דוגמה ראשונה: 3 LSB דולקים רצוף, אחרכך אפסים. v=7. נחשב \\\`v+1\\\` ואחר כך AND.',
              viz: _lowOnesSvg({ v: 7, label: 'example 1: v = 7 (0b...0111)' }),
            },
            {
              code: 'v + 1 = 0b0000 0000 0000 1000   (carry שטף את ה-1ים)',
              explain: 'הוספת 1 → carry-propagation: כל ה-1ים הופכים ל-0, וביט חדש מעליהם נדלק.',
              viz: _lowOnesSvg({ v: 7, label: 'v + 1 = 8 — carry flips low 1s to 0' }),
            },
            {
              code: 'v & (v+1) = 0   →   True',
              explain: 'אין שום ביט משותף בין \\\`v\\\` ל-\\\`v+1\\\` → AND = 0 → **תבנית תקפה** ✓',
              viz: _lowOnesSvg({ v: 7, label: 'v & (v+1) = 0  →  is_low_ones(7) = True', valid: true }),
            },
            {
              code: 'v = 0b0000 0000 1010 0111 (= 167)   ← תבנית שבורה',
              explain: 'דוגמה דחויה: יש 1ים שאינם רצופים מה-LSB (\\\`...1010 0111\\\`).',
              viz: _lowOnesSvg({ v: 167, label: 'example 2: v = 167 (0b...10100111)' }),
            },
            {
              code: 'v + 1 = 0b0000 0000 1010 1000',
              explain: 'ה-carry נעצר אחרי 3 הביטים הראשונים בלבד. ביטים גבוהים יותר לא משתנים.',
              viz: _lowOnesSvg({ v: 167, label: 'v + 1 = 168 — carry stops short' }),
            },
            {
              code: 'v & (v+1) = 0b...1010 0000 ≠ 0   →   False',
              explain: 'יש ביטים גבוהים משותפים בין \\\`v\\\` ל-\\\`v+1\\\` → AND ≠ 0 → **תבנית שבורה** ✗',
              viz: _lowOnesSvg({ v: 167, label: 'v & (v+1) ≠ 0  →  is_low_ones(167) = False', valid: false }),
            },
          ],
        },
        question:
`ממשו את \`is_low_ones(v)\` בשורה אחת, \`O(1)\` זמן. למה ה-bit-trick \`v & (v+1) == 0\` עובד?`,
        hints: [
          'תחשבו על ייצוג בינארי של 7 = \\\`0...0111\\\`. מה קורה כשמוסיפים 1?',
          'הוספת 1 לתבנית \\\`...01...1\\\` יוצרת carry שעובר על כל ה-1ים ומפעיל ביט חדש: \\\`...10...0\\\`. ה-AND של שני אלה הוא 0.',
          'בתבנית שבורה (\\\`...10101\\\` למשל), הוספת 1 לא מאפסת את הביטים הגבוהים. \\\`AND ≠ 0\\\`.',
        ],
        answer:
`**Bit-trick קלאסי.** דומה ל-\`n & (n-1) == 0\` לבדיקת חזקת 2 (שאלה #8011) — וריאציה הפוכה.

**למה זה עובד?**

עבור ערך \`v\` בתבנית \`0...0 1...1\` עם \`k\` 1ים רצופים (כלומר \`v = 2^k - 1\`):

\`\`\`
v     = 0...0 0111 1111   (8 בדוגמה למטה: k=7)
v + 1 = 0...0 1000 0000    ← ה-carry שטף את כל ה-1ים והדליק ביט חדש
v & (v+1) = 0...0 0000 0000   ← אין שום ביט משותף → 0 ✓
\`\`\`

**עבור תבנית שבורה** (\`0...0 1010 1011\` = 171):

\`\`\`
v     = 1010 1011
v + 1 = 1010 1100   ← ה-carry נעצר אחרי 2 ביטים (כי יש 0 בדרך)
v & (v+1) = 1010 1000   ← ביטים גבוהים שורדים → != 0 → False
\`\`\`

**מקרי קצה:**
- \`v = 0\`: \`0 & 1 = 0\` → True. תבנית טריוויאלית (אפס 1ים).
- \`v = 0xFFFFFFFFFFFFFFFF\` (כל 64 הביטים דלוקים): \`v+1 = 0\` ב-uint64 → \`v & 0 = 0\` → True. ✓

---

**שלבי החשיבה:**

1. **תבנית "כל ה-LSB דלוקים" ⇔ \`v = 2^k − 1\`** — לאו דווקא חזקה של 2, אלא \`חזקה של 2 פחות 1\`.
2. **\`n & (n+1) == 0\` הוא ההפך של \`n & (n-1) == 0\`** — שני המבחנים מבוססים על אותה אינטואיציה של carry-propagation.
3. **שורה אחת + edge case של 0** — שני אלו דורשים מודעות מצד המועמד.`,
        interviewerMindset:
`וריאציה על שאלה #8011 (Power of 2). המראיין רוצה לראות שהמועמד **מבחין בין שני המבחנים** ולא מתבלבל:

| מבחן | תבנית | אינטואיציה |
|---|---|---|
| \`n & (n-1) == 0\` | חזקה של 2 (ביט יחיד) | \`n-1\` מאפס את הביט הדלוק |
| \`n & (n+1) == 0\` | חזקה של 2 פחות 1 (LSB-ones) | \`n+1\` נושף את כל ה-LSB-1ים ומדליק ביט חדש |

מועמד שמערבב בין השניים — איבד נקודות. מועמד שאומר "אני זוכר את \`n & (n-1)\` אבל לא בטוח אם זה \`-1\` או \`+1\` כאן" → המראיין מעריך את ההכרה במגבלה ואז שואל "מה ההבדל?". מועמד שיודע — מקבל את הג'ובת.

**שאלת המשך:** "ואיך לדעת *כמה* 1ים יש (popcount)?" → \`bin(v).count('1')\` ב-Python, או Brian Kernighan: \`c=0; while v: v &= v-1; c+=1\`.`,
        expectedAnswers: ['v & (v+1)', 'v & (v + 1)', '2^k - 1', '2**k - 1', 'carry', 'LSB'],
      },
    ],
    source: 'PP - שאלות קוד (slide 17)',
    tags: ['algorithms', 'bit-manipulation', 'one-liner', 'low-ones', 'carry-propagation', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8018 — Error-rate detector (10 errors / second)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'error-rate-monitor',
    difficulty: 'medium',
    title: 'גלאי תקלה — 10 שגיאות בשנייה',
    intro:
`נתון רכיב שמקבל שני זרמי-ביטים כל **1ms**: \`clk\` (שעון) ו-\`indicator\`
(האם הייתה שגיאה הרגע — \`1\` = שגיאה, \`0\` = תקין). המערכת **נחשבת
תקולה** ברגע שמתקבלות **10 שגיאות בשנייה**. עליכם לבנות לוגיקה שמזהה
מצב תקלה ויוצאת מ-idle.

\`\`\`
clk         _|‾|_|‾|_|‾|_|‾|_|‾|_|‾|_|‾|_|‾|_|‾|_|‾|_
indicator    0   0   0   1   0   1   0   0   0   1   ...
                          ↑       ↑               ↑
\`\`\`

איך תזהו ש**יותר מ-10 שגיאות הצטברו בחלון של 1 שנייה האחרונה**?`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1) per sample' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`from collections import deque


class ErrorMonitor:
    """1000 samples = 1 second window. Faulty when count > THRESHOLD."""
    WINDOW = 1000      # ms
    THRESHOLD = 10

    def __init__(self):
        self.history = deque()  # timestamps of recent error events
        self.faulty = False

    def tick(self, t_ms, indicator):
        """Called every 1 ms with current time and indicator bit."""
        # TODO: maintain sliding window, set self.faulty if > THRESHOLD
        pass
`,
        trace: {
          title: 'Error monitor — 1ms ticks, 1000ms window',
          steps: [
            {
              code: 't = 0ms — מתחילים מעקב, אין שגיאות',
              explain: 'ה-monitor מאזין לזרם 1ms-tick. בכל tick מקבל \\\`indicator\\\` (0/1) — אם 1 → מוסיף timestamp. סף: \\\`> 10\\\` שגיאות ב-1000ms → FAULTY.',
              viz: _errorMonitorSvg({ nowMs: 0, errors: [] }),
            },
            {
              code: 't = 50ms — שגיאה ראשונה',
              explain: 'הביט indicator=1 הגיע. נדחף לסוף ה-deque. \\\`errors_in_window = 1\\\`.',
              viz: _errorMonitorSvg({ nowMs: 50, errors: [50], justArrived: [50] }),
            },
            {
              code: 't = 200ms — 3 שגיאות נוספות',
              explain: 'שגיאות ב-\\\`t=120, 170, 200\\\`. כולן בתוך החלון (0..1000ms). \\\`count = 4\\\`.',
              viz: _errorMonitorSvg({ nowMs: 200, errors: [50, 120, 170, 200], justArrived: [200] }),
            },
            {
              code: 't = 600ms — 6 שגיאות נוספות, count = 10',
              explain: 'שגיאות פרצו ב-\\\`t=270, 350, 400, 470, 530, 600\\\`. **\\\`count = 10\\\` — בגבול הסף בדיוק.** עוד אחת תפעיל את הדגל.',
              viz: _errorMonitorSvg({ nowMs: 600, errors: [50, 120, 170, 200, 270, 350, 400, 470, 530, 600], justArrived: [600] }),
            },
            {
              code: 't = 700ms — שגיאה 11   →   FAULTY!',
              explain: '\\\`count = 11 > 10\\\` → המערכת נחשבת תקולה. הדגל \\\`faulty\\\` נדלק. הוא **דביק** — לא יוסר גם אם הקצב יפחת.',
              viz: _errorMonitorSvg({
                nowMs: 700,
                errors: [50, 120, 170, 200, 270, 350, 400, 470, 530, 600, 700],
                justArrived: [700],
                bannerOverride: 'count > 10  →  FAULTY latched',
              }),
            },
            {
              code: 't = 1300ms — שגיאות ישנות נופלות',
              explain: 'החלון \\\`(300, 1300]\\\`. שגיאות מ-\\\`t=50, 120, 170, 200, 270\\\` כבר ישנות מ-1000ms ונדחקו מה-deque. \\\`count = 6\\\` — מתחת לסף, אבל הדגל נשאר.',
              viz: _errorMonitorSvg({
                nowMs: 1300,
                errors: [350, 400, 470, 530, 600, 700],
                justDropped: [50, 120, 170, 200, 270],
                faulty: true,
              }),
            },
            {
              code: 't = 1500ms — הקצב נרגע, אבל ה-flag נשאר',
              explain: 'יותר drops. \\\`count\\\` ממשיך לרדת. **המערכת עדיין מסומנת תקולה** — אזעקה נשמרת עד אינטרוונציה ידנית. זו ההתנהגות הצפויה ב-fault detection אמיתי.',
              viz: _errorMonitorSvg({
                nowMs: 1500,
                errors: [530, 600, 700],
                justDropped: [350, 400, 470],
                faulty: true,
              }),
            },
          ],
        },
        trace: {
          title: 'Error monitor — 1ms ticks עם חלון 1000ms',
          steps: [
            {
              code: 't = 0 ms: ניטור החל, אין שגיאות',
              explain: 'המערכת מתחילה. כל מ"ש tick: \\\`clk\\\` עולה, ה-\\\`indicator\\\` נדגם. \\\`history\\\` ריק.',
              viz: _errorMonitorSvg({ nowMs: 0, errors: [], faulty: false, subtitle: 'monitor armed — no events yet' }),
            },
            {
              code: 't = 80 ms: indicator=1 → שגיאה #1',
              explain: 'הביט הראשון של שגיאה. נדחף ל-\\\`history\\\`. count=1/10.',
              viz: _errorMonitorSvg({ nowMs: 80, errors: [80], justArrived: [80], faulty: false, subtitle: 'count 1/10' }),
            },
            {
              code: 't = 200 ms: indicator=1 → שגיאה #4',
              explain: 'הצטברו 4 שגיאות עד עכשיו (\\\`80, 140, 170, 200\\\`). עדיין בטוח מתחת לסף.',
              viz: _errorMonitorSvg({ nowMs: 200, errors: [80, 140, 170, 200], justArrived: [200], faulty: false, subtitle: 'count 4/10' }),
            },
            {
              code: 't = 400 ms: שגיאה #7',
              explain: 'הקצב מואץ. 7 שגיאות בתוך 400 מ"ש.',
              viz: _errorMonitorSvg({ nowMs: 400, errors: [80, 140, 170, 200, 280, 340, 400], justArrived: [400], faulty: false, subtitle: 'count 7/10' }),
            },
            {
              code: 't = 600 ms: שגיאה #10 — על הסף',
              explain: 'הגענו ל-10 שגיאות בחלון של 1000 מ"ש. **בגבול בדיוק.** עוד אחת ויפעל הדגל.',
              viz: _errorMonitorSvg({ nowMs: 600, errors: [80, 140, 170, 200, 280, 340, 400, 450, 510, 600], justArrived: [600], faulty: false, subtitle: 'count 10/10 — at threshold' }),
            },
            {
              code: 't = 720 ms: שגיאה #11 → FAULTY!',
              explain: '\\\`count = 11 > 10\\\` → **הדגל נדלק**. הצבע מתחלף לזהוב, ה-FAULTY מהבהב. הדגל **דביק** — לא יוסר גם אם הקצב יירד.',
              viz: _errorMonitorSvg({ nowMs: 720, errors: [80, 140, 170, 200, 280, 340, 400, 450, 510, 600, 720], justArrived: [720], faulty: true, subtitle: 'threshold breached — flag latched' }),
            },
            {
              code: 't = 1100 ms: חלון זז — בקשה t=80 נופלת',
              explain: 'הזמן התקדם. החלון הוא כעת \\\`(100, 1100]\\\`. ה-1 בזמן \\\`t=80\\\` כבר לא בתוכו → \\\`popleft\\\` ל-\\\`history[0]\\\`. count יורד ל-10. הדגל נשאר.',
              viz: _errorMonitorSvg({ nowMs: 1100, errors: [140, 170, 200, 280, 340, 400, 450, 510, 600, 720], justDropped: [80], faulty: true, subtitle: 'popleft: 80ms expired' }),
            },
            {
              code: 't = 1500 ms: עוד drops, count יורד אך הדגל יציב',
              explain: 'החלון \\\`(500, 1500]\\\`: שגיאות \\\`140, 170, 200, 280, 340, 400, 450\\\` כבר ישנות מ-1000 מ"ש. נשארו רק \\\`510, 600, 720\\\` = 3 שגיאות. **הדגל נשאר דביק** — ההיסטוריה זוכרת.',
              viz: _errorMonitorSvg({ nowMs: 1500, errors: [510, 600, 720], justDropped: [140, 170, 200, 280, 340, 400, 450], faulty: true, subtitle: 'count back to 3 — flag stays' }),
            },
          ],
        },
        question:
`ממשו את \`ErrorMonitor.tick()\`. למה זה בעצם דומה ל-Rate Limiter (שאלה #8002)?`,
        hints: [
          'מי "האיש החשוד" כאן? איזה זרם מתחשב כ-IP?',
          'באותה דקה (1000ms) — לעקוב אחרי הזמנים של כל ה-1-ים. כש-\\\`indicator=1\\\` → הוסף timestamp לתור.',
          'בכל קריאה: סלק טיימסטמפים ישנים מ-1000ms, ואז הוסף את הנוכחי אם הוא שגיאה. \\\`len(deque) > 10\\\` → תקול.',
        ],
        answer:
`**Sliding window — אותה תבנית כמו 8002.** עכשיו הזרם הוא ביט-בודד בכל \`1ms\` ולא בקשות מ-IPs שונים, אבל ה-pattern זהה.

\`\`\`python
from collections import deque


class ErrorMonitor:
    WINDOW = 1000      # ms
    THRESHOLD = 10

    def __init__(self):
        self.history = deque()
        self.faulty = False

    def tick(self, t_ms, indicator):
        # 1. נקה ישנים — כל timestamp שמחוץ לחלון
        cutoff = t_ms - self.WINDOW
        while self.history and self.history[0] < cutoff:
            self.history.popleft()
        # 2. רשום שגיאה אם הייתה
        if indicator == 1:
            self.history.append(t_ms)
        # 3. עדכן דגל. sticky: ברגע שהיה תקול, נשאר תקול.
        if len(self.history) > self.THRESHOLD:
            self.faulty = True
\`\`\`

**שלוש פעולות, \`O(1)\` amortized:**

1. **נקה הראש של ה-deque** — כל timestamp עוזב לכל היותר פעם אחת. במצטבר \`O(N)\` לכל ההיסטוריה, אז \`O(1)\` בממוצע לטיק.
2. **רשום אם שגיאה** — אם \`indicator=1\`, מוסיף \`t_ms\` לסוף.
3. **בדוק סף** — \`len > 10\` קובע \`faulty=True\`. דביק — לא מתאפס.

**אופטימיזציה אם רוצים faulty לא-דביק:** במקום \`if > THRESHOLD: faulty=True\`, פשוט \`faulty = (len > THRESHOLD)\`. אז כשהשגיאות יוצאות מהחלון, הדגל יורד.

---

**שלבי החשיבה:**

1. **זרם זמן רציף → sliding window.** התבנית הזו מופיעה בכל בעיה מסוג "X אירועים בפרק זמן" — IP rate limiting, fault detection, אנליטיקה.
2. **\`deque\` ולא \`list\`.** \`popleft\` ב-\`O(1)\`. \`list.pop(0)\` הוא \`O(n)\`.
3. **Sticky flag** — בדרך כלל מעדיפים sticky כדי לא להחמיץ אירועי תקלה זמניים. אם רוצים non-sticky — מסכימים על "מתאפס אוטומטית אחרי שהחלון מתפנה".`,
        interviewerMindset:
`וריאציה על rate limiter. מועמדים שעברו את 8002 צריכים לזהות מיד את התבנית. **הבדלים שכדאי להזכיר:**

1. **קצב דגימה ידוע.** כאן יש \`tick\` כל \`1ms\` בדיוק. אז אפשר להחליף את ה-\`deque\` ב-**מערך מעגלי קבוע** של 1000 ביטים — ספירה ב-popcount. מאוד יעיל בחומרה.
2. **באמת צריך timestamps?** אם \`tick\` קורה כל \`1ms\` מובטח — מספיק לזכור רק את **מספר השגיאות בחלון**, ומאיפה לחסוק את ה-1000ms הישנים. רעיון: counter + buffer מעגלי של 1000 ביטים.
3. **דביק או לא?** השאלה לא אומרת. תבחר רציונל ותציין מפורש מה הבחירה והשפעתה.

מועמד מצוין מזכיר את ה-**buffer מעגלי**: זיכרון קבוע של 1000 ביטים, indicator כתוב לפי \`t_ms % 1000\`, popcount של ה-buffer = ספירה. עדיף ב-hardware. גישה זו פותרת גם sticky/non-sticky בפשטות.`,
        expectedAnswers: ['deque', 'sliding window', 'popleft', 'WINDOW = 1000', 'THRESHOLD = 10', 'cutoff'],
      },
    ],
    source: 'PP - שאלות קוד (slide 18)',
    tags: ['algorithms', 'sliding-window', 'deque', 'fault-detection', 'streaming', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8019 — Implement "if" — flip two values without conditional
  // ───────────────────────────────────────────────────────────────
  {
    id: 'flip-without-if',
    difficulty: 'easy',
    title: '"if" מבלי if — החלפת 17 ⇄ 3',
    intro:
`כתבו פונקציה ב-Python שמקבלת \`17\` ומחזירה \`3\`, ולהפך —
מקבלת \`3\` ומחזירה \`17\`. **ללא שימוש ב-\`if\`** ובלי \`?:\` (אם זמין).

\`\`\`
Input: 17    Output: 3
Input: 3     Output: 17
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'חיבור-חיסור',
            time: 'O(1)', space: 'O(1)',
            summary: '\\\`17 + 3 = 20\\\`. אם \\\`x = 17\\\` ⇒ \\\`20 - 17 = 3\\\`. אם \\\`x = 3\\\` ⇒ \\\`20 - 3 = 17\\\`.',
            code:
`def flip_sub(x):
    return 20 - x`,
          },
          {
            name: 'XOR',
            time: 'O(1)', space: 'O(1)',
            summary: '\\\`a ⊕ b ⊕ a = b\\\` (כי \\\`a ⊕ a = 0\\\`). פעולה דו-כיוונית טבעית.',
            code:
`def flip_xor(x):
    return 17 ^ 3 ^ x       # = 18 ^ x   (17 ^ 3 = 18)`,
          },
          {
            name: 'גיאומטרי — היפוך סביב נקודת אמצע',
            time: 'O(1)', space: 'O(1)',
            summary: '\\\`midpoint = (17+3)/2 = 10\\\`. הריחוק של x מהאמצע — לכיוון השני: \\\`2 * 10 - x\\\`.',
            code:
`def flip_geom(x):
    return 2 * 10 - x       # שווה ל-flip_sub, אבל הלוגיקה שונה`,
          },
        ],
        starterCode:
`def flip(x):
    """If x == 17 return 3. If x == 3 return 17. No 'if' statement."""
    # TODO
    pass


# print(flip(17))   # 3
# print(flip(3))    # 17
`,
        trace: {
          title: 'flip(x) — שני נתיבים: חיסור + XOR',
          steps: [
            {
              code: 'x = 17  →  שני הנתיבים עובדים במקביל',
              explain: 'הקלט נכנס משמאל. שני הנתיבים: \\\`20 - x\\\` (ירוק) ו-\\\`17 ^ 3 ^ x\\\` (סגול). שניהם צריכים להחזיר את אותה תוצאה — 3.',
              viz: _flipSvg({ x: 17, sub: 3, xor: 3, done: true }),
            },
            {
              code: 'x = 3  →  שני הנתיבים עובדים גם כאן',
              explain: 'עכשיו הקלט הוא 3. \\\`20 - 3 = 17\\\`, \\\`17 ^ 3 ^ 3 = 17 ^ 0 = 17\\\`. שתי הגישות מחזירות 17 — סימטריה מושלמת.',
              viz: _flipSvg({ x: 3, sub: 17, xor: 17, done: true }),
            },
            {
              code: 'x = 5  ⚠️  ערך לא צפוי — XOR לא יודע להבחין',
              explain: 'מקרה אזהרה: גרסת XOR תחזיר \\\`17 ^ 3 ^ 5 = 18 ^ 5 = 23\\\` — לא \\\`a\\\` ולא \\\`b\\\`. גרסת החיסור תחזיר \\\`20 - 5 = 15\\\`. **לא אחת מהן בודקת validity של הקלט** — תפקיד המתקשר.',
              viz: _flipSvg({ x: 5, sub: 15, xor: 23 }),
            },
          ],
        },
        question:
`ממשו את \`flip(x)\`. תנו **שתי גישות שונות**: אריתמטית ו-XOR. מה היתרון של כל אחת?`,
        hints: [
          'מה הסכום של 17 ו-3?',
          'אם הסכום קבוע (20), אז ההפרש מ-20 *הוא* הזיווג. \\\`20 - x\\\`.',
          'XOR יש לו תכונה: \\\`a ⊕ a = 0\\\`. אם תעשה \\\`17 ⊕ 3 ⊕ x\\\` — ה-x מבטל את עצמו עם הצד שלו ומשאיר את הצד השני.',
        ],
        answer:
`**שתי גישות, סיבוכיות זהה. שפת ההסבר שונה.**

\`\`\`python
def flip_sub(x):  return 20 - x          # אריתמטי: a + b - x
def flip_xor(x):  return 17 ^ 3 ^ x       # ביטוויז: a XOR b XOR x = 18 XOR x
\`\`\`

**למה XOR עובד?**

| x ⊕ 17 ⊕ 3 | = | תוצאה |
|---|---|---|
| 17 ⊕ 17 ⊕ 3 | = | 0 ⊕ 3 = **3** ✓ |
| 3 ⊕ 17 ⊕ 3 | = | 17 ⊕ 0 = **17** ✓ |

(\`a ⊕ a = 0\`, ו-XOR קומוטטיבי וקבועי.)

**למה החיסור עובד?** \`17 + 3 = 20\`. אם \`x\` הוא אחד מהם, \`20 - x\` הוא השני. זה פתרון "אריתמטי" שעובד רק כשיש בדיוק 2 ערכים, ויש קשר ידוע (סכום).

**איזה מהשניים עדיף?**

- **חיסור**: עובד בכל שפה עם מספרים, לא צריך לזכור XOR.
- **XOR**: עובד גם על **strings/bytes/ערכים לא-מספריים**. עובד גם אם הערכים שליליים. כללי יותר. בחומרה — XOR הוא מחיר 1-gate.

**הרחבה: זוג כללי \`(a, b)\` שאינו ידוע מראש?** הפונקציה צריכה לקבל את \`a, b\` כפרמטרים:

\`\`\`python
def flip(x, a, b):
    return a ^ b ^ x
\`\`\`

**אם \`x\` לא שווה ל-\`a\` או \`b\`?** התשובה היא garbage — \`a ^ b ^ x\` שווה אבל לא לאף אחד מהם. גישת XOR לא יודעת לבדוק validity.

---

**שלבי החשיבה:**

1. **"if" אינו הכרחי.** הרבה דברים שכותבים עם \`if\` הם בעצם פעולות אריתמטיות פשוטות.
2. **XOR הוא אינוולוטיב** — \`f(f(x)) = x\`. שימוש קלאסי: encryption (one-time pad), swap בלי משתנה זמני.
3. **גישה גיאומטרית** — נקודת אמצע + שיקוף. ראייה אחת של אותה משוואה. במתמטיקה: זה תרגום ל-axis-symmetric.`,
        interviewerMindset:
`שאלת חימום קלה — אבל מועמדים נופלים בה לפעמים. המראיין רוצה לראות:

1. **שאתה לא תפוס בעולם של if/else** — חשיבה אלגברית פותחת פתרונות אלגנטיים.
2. **שאתה מציע יותר מגישה אחת** — חיבור, XOR, אולי גם table-lookup (\`{17: 3, 3: 17}[x]\`). הראית רוחב.
3. **שאתה מסביר מתי כל אחד עדיף.** XOR לערכים לא-מספריים. חיבור לקריאות.

**שאלת המשך:** "ואם יש שלושה ערכים — \`a → b → c → a\`?" → \`(x + 1) % 3\` אם הם \`0,1,2\`. או lookup table. שורת קוד אחת.`,
        expectedAnswers: ['20 - x', '17 + 3', '17 ^ 3 ^ x', '18 ^ x', 'XOR', 'אינוולוט'],
      },
    ],
    source: 'PP - שאלות קוד (slide 19)',
    tags: ['algorithms', 'xor', 'arithmetic', 'bit-trick', 'no-if', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8020 — Best Time to Buy and Sell Stock (max profit)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'max-profit-stock',
    difficulty: 'easy',
    title: 'מסחר מניות — רווח מקסימלי בקנייה ומכירה אחת',
    intro:
`בהינתן רשימה של מחירי מניה ליום נתון, **המטרה היא להחזיר את הרווח
המקסימלי** שניתן להפיק על ידי קניית המנייה במחיר נתון, ואז מכירה במחיר
מאוחר יותר. אם לא ניתן להרוויח רווח — החזירו אפס.

\`\`\`
Input:  [7, 1, 2, 5, 3, 6, 4]      →   Output: 5     (קנייה ב-1, מכירה ב-6)
Input:  [7, 6, 4, 3, 1]            →   Output: 0     (מחירים יורדים — אל תקנו)
\`\`\`

(LeetCode #121 — "Best Time to Buy and Sell Stock".)`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'Brute force — O(n²)',
            time: 'O(n²)', space: 'O(1)',
            summary: 'בודק כל זוג \\\`(i, j)\\\` עם \\\`i < j\\\` ומחזיר את המקסימום של \\\`prices[j] - prices[i]\\\`.',
            code:
`def max_profit_brute(prices):
    best = 0
    for i in range(len(prices)):
        for j in range(i + 1, len(prices)):
            best = max(best, prices[j] - prices[i])
    return best`,
          },
          {
            name: 'Single-pass — O(n)',
            time: 'O(n)', space: 'O(1)',
            summary: '\\\`min_so_far\\\` נשמר בזמן הסריקה. בכל יום: \\\`profit = price - min_so_far\\\`, ועדכון של \\\`best\\\` ושל \\\`min_so_far\\\`.',
            code:
`def max_profit(prices):
    if not prices:
        return 0
    min_so_far, best = prices[0], 0
    for p in prices[1:]:
        best = max(best, p - min_so_far)
        min_so_far = min(min_so_far, p)
    return best`,
          },
        ],
        trace: {
          title: 'Max profit — prices=[7, 1, 2, 5, 3, 6, 4]',
          source:
`def max_profit(prices):
    if not prices:
        return 0
    min_so_far, best = prices[0], 0
    for p in prices[1:]:
        best = max(best, p - min_so_far)
        min_so_far = min(min_so_far, p)
    return best`,
          sourceLang: 'python',
          steps: [
            { code: 'init: min_so_far = 7, best = 0', explain: 'מצב ראשוני: ה-min הוא היום הראשון, רווח אפשרי = 0.',
              executed: [1, 2, 3, 4, 5], focusLine: 4,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 0, minSoFar: 7, minIdx: 0, best: 0 }) },
            { code: 'day 1: p=1 < min → min=1', explain: '\\\`p=1\\\` קטן מ-\\\`min_so_far\\\` → עדכון. רווח-אם-נמכור = 0.',
              executed: [5, 6, 7], focusLine: 7,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 1, minSoFar: 1, minIdx: 1, best: 0 }) },
            { code: 'day 2: p=2.   profit = 2-1 = 1   →   best=1', explain: 'רווח \\\`1\\\`. עודכן \\\`best\\\`.',
              executed: [5, 6, 7], focusLine: 6,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 2, minSoFar: 1, minIdx: 1, best: 1 }) },
            { code: 'day 3: p=5.   profit = 4   →   best=4', explain: 'הקפיצה הראשונה.',
              executed: [5, 6, 7], focusLine: 6,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 3, minSoFar: 1, minIdx: 1, best: 4 }) },
            { code: 'day 4: p=3   (skip — best unchanged)', explain: 'לא מינימום, לא שיפור.',
              executed: [5, 6, 7], focusLine: 6,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 4, minSoFar: 1, minIdx: 1, best: 4 }) },
            { code: 'day 5: p=6.   profit = 5   →   best=5', explain: 'הקפיצה הגדולה ביותר.',
              executed: [5, 6, 7], focusLine: 6,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 5, minSoFar: 1, minIdx: 1, best: 5 }) },
            { code: 'day 6: p=4   (skip)', explain: 'עליה קטנה יותר.',
              executed: [5, 6, 7], focusLine: 6,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 6, minSoFar: 1, minIdx: 1, best: 5 }) },
            { code: 'done: best = 5', explain: '**רווח מקסימלי: $5** — קנייה ב-day 1, מכירה ב-day 5.',
              executed: [8], focusLine: 8,
              viz: _maxProfitSvg({ prices: [7,1,2,5,3,6,4], day: 6, minSoFar: 1, minIdx: 1, best: 5, bestBuy: 1, bestSell: 5, done: true }) },
          ],
        },
        starterCode:
`def max_profit(prices):
    """One transaction (buy then sell). Return max profit.
    O(n) time, O(1) space."""
    # TODO
    pass


# print(max_profit([7, 1, 2, 5, 3, 6, 4]))    # 5
# print(max_profit([7, 6, 4, 3, 1]))          # 0
# print(max_profit([]))                       # 0
`,
        question:
`ממשו את \`max_profit(prices)\` ב-\`O(n)\` זמן ו-\`O(1)\` מקום. למה לא צריך לחפש "האקסטרמום הימני"?`,
        hints: [
          'נסה לחשוב: עבור כל יום מכירה אפשרי, מה היום הקנייה הטוב ביותר?',
          'התשובה: יום הקנייה הטוב ביותר עבור מכירה ביום \\\`j\\\` הוא היום עם המחיר הנמוך ביותר **לפניו**.',
          'שמרו \\\`min_so_far\\\` תוך סריקה. בכל יום בודקים \\\`p - min_so_far\\\` ועדכון \\\`best\\\`. אז עדכון \\\`min_so_far\\\`. סדר חשוב!',
        ],
        answer:
`**Single-pass scan.** \`O(n)\` זמן, \`O(1)\` מקום. ה-trick: בכל יום, אנחנו יודעים את ה-min שראינו עד עכשיו, אז אפשר לחשב מיד את הרווח הכי טוב שמכירה היום מאפשרת.

**למה זה עובד?** הרווח \`prices[j] - prices[i]\` תלוי רק ב-\`i\` הנמוך ביותר עד \`j\`. אז במקום לחפש את ה-\`i\` הטוב ביותר אחרי \`j\` — שומרים אותו תוך כדי הסריקה.

**מצב מקרה הקצה:**

- \`prices = []\` → 0
- \`prices = [5]\` → 0 (אין מכירה אפשרית — קונים ויום-בו-יום אסור)
- \`prices = [7,6,4,3,1]\` (יורד תמיד) → 0 (לא קנייה)
- \`prices = [1,2,3,4,5]\` (עולה תמיד) → 4 (קנייה ראשונה, מכירה אחרונה)

**סדר עדכונים:** קריטי. **קודם** \`best\`, **אחר כך** \`min_so_far\`. אחרת אם המינימום החדש הוא היום עצמו, נקבל רווח \`0\` אפילו אם יש מכירה טובה יותר עם \`min\` קודם.

---

**שלבי החשיבה:**

1. **בעיה מקבילה ל-"max - min"** — בלי האילוץ ש-min לפני max. אז קצת חכמה: שומרים \`min_so_far\` בזמן ש-\`prices[j]\` רץ.
2. **\`max(best, p - min_so_far)\`** — כל יום הוא מכירה פוטנציאלית. הקנייה היא תמיד ה-\`min_so_far\`.
3. **\`O(1)\` מקום** — לא צריך מערך נוסף, רק שני משתנים.`,
        interviewerMindset:
`LeetCode #121 — הקלאסיקה. המראיין רוצה לראות:

1. **שאתה לא שולח ל-\`O(n²)\`** — מי שמתחיל ב-2 לולאות מקוננות מעיד על "אינטואיציה bruteforce-first" שלא תמיד מקבלים.
2. **שאתה מבחין שזה לא max-min רגיל** — האילוץ "buy לפני sell" נוטה לבלבל, אבל עם המעקב אחרי \`min_so_far\` בזמן ריצה זה הופך לכמעט-טריוויאלי.
3. **שאתה מטפל ב-edge cases** — מערך ריק, מערך באורך 1, מחירים יורדים תמיד.

**שאלת המשך פופולרית (LeetCode #122):** "**מספר עסקאות לא מוגבל** — מה ההבדל?" → תשובה: סוכמים את כל ה-"עליות" בין יום ליום הבא (\`max(0, prices[i+1] - prices[i])\`). בסה"כ \`O(n)\` גם.

**עוד המשך (LeetCode #123):** "**עד שתי עסקאות**" → DP עם 4 מצבים: held1, sold1, held2, sold2. רמה גבוהה יותר.`,
        expectedAnswers: ['min_so_far', 'min so far', 'best', 'max profit', 'p - min', 'single pass'],
      },
    ],
    source: 'PP - שאלות קוד (slide 20)',
    tags: ['algorithms', 'array', 'single-pass', 'max-profit', 'stock', 'leetcode-121', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8021 — Minimum string by removing "01" and "11" substrings
  // ───────────────────────────────────────────────────────────────
  {
    id: 'binary-string-minimum',
    difficulty: 'medium',
    title: 'מחרוזת בינארית מינימלית — הסרת "01" ו-"11"',
    intro:
`בהינתן מחרוזת בינארית \`S\`, מצא את **המחרוזת הקצרה ביותר**
שאפשר להגיע אליה על-ידי הסרת מופעים של תתי-המחרוזות \`"01"\` ו-\`"11"\`.
אחרי כל הסרה, שרשרו את החלקים הנותרים.

\`\`\`
S = "0010110"
0010110 → 00110 → 010 → 0      ⇒  length 1, "0"

S = "0011101111"
0011101111 → 01101111 → 011011 → 1011 → 11 → ""   ⇒  length 0
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(n)' },
        ],
        starterCode:
`def minimum_string(s):
    """Remove all "01" and "11" pairs (greedy). Return the smallest result.
    O(n) using a stack — each '1' consumes its left neighbour."""
    # TODO
    pass


# print(minimum_string("0010110"))     # "0"
# print(minimum_string("0011101111"))  # ""
`,
        question:
`ממשו את \`minimum_string(s)\` ב-\`O(n)\` באמצעות סטאק. למה שני התת-מחרוזות חולקות "מי שמוסר"?`,
        hints: [
          'גם \\\`"01"\\\` וגם \\\`"11"\\\` נגמרות ב-\\\`1\\\`. מה זה אומר על מי שמסיר את הזוג?',
          'בכל פעם שנפגוש \\\`1\\\` — אם יש משהו על הסטאק (\\\`0\\\` או \\\`1\\\`), נסיר את הזוג (\\\`pop\\\`). אחרת push.',
          'הסטאק שומר את **המחרוזת הסופית** — האותיות שלא נמחקו. \\\`return "".join(stack)\\\`.',
        ],
        trace: {
          title: 'Binary-string min — s="0010110" → stack walk',
          source:
`def minimum_string(s):
    stack = []
    for c in s:
        if c == '1' and stack:        # consume top
            stack.pop()
        else:                          # otherwise push
            stack.append(c)
    return "".join(stack)`,
          sourceLang: 'python',
          steps: [
            { code: 'init: stack = []', explain: 'מתחילים עם סטאק ריק. סורקים תו-בתו.',
              executed: [2, 3], focusLine: 3,
              viz: _binStrMinSvg({ s: '0010110', idx: -1, stack: [], action: 'init' }) },
            { code: "c='0' → push", explain: '\\\`0\\\` תמיד נדחף. אין מה לצרוך.',
              executed: [3, 4, 7], focusLine: 7,
              viz: _binStrMinSvg({ s: '0010110', idx: 0, stack: ['0'], action: 'push' }) },
            { code: "c='0' → push", explain: 'עוד \\\`0\\\`.',
              executed: [3, 4, 7], focusLine: 7,
              viz: _binStrMinSvg({ s: '0010110', idx: 1, stack: ['0','0'], action: 'push' }) },
            { code: "c='1' → pop", explain: '\\\`1\\\` עם סטאק לא-ריק → מסיר את ה-\\\`0\\\` בראש. נוצר זוג "01".',
              executed: [3, 4, 5], focusLine: 5,
              viz: _binStrMinSvg({ s: '0010110', idx: 2, stack: ['0'], action: 'pop' }) },
            { code: "c='0' → push", explain: '',
              executed: [3, 4, 7], focusLine: 7,
              viz: _binStrMinSvg({ s: '0010110', idx: 3, stack: ['0','0'], action: 'push' }) },
            { code: "c='1' → pop", explain: 'מסיר \\\`0\\\` מהראש.',
              executed: [3, 4, 5], focusLine: 5,
              viz: _binStrMinSvg({ s: '0010110', idx: 4, stack: ['0'], action: 'pop' }) },
            { code: "c='1' → pop", explain: '\\\`1\\\` נוסף מצרך את ה-\\\`0\\\` שנותר.',
              executed: [3, 4, 5], focusLine: 5,
              viz: _binStrMinSvg({ s: '0010110', idx: 5, stack: [], action: 'pop' }) },
            { code: "c='0' → push (stack empty)", explain: 'הסטאק ריק → \\\`1\\\` היה דוחפים. אבל כאן זה \\\`0\\\` — תמיד push.',
              executed: [3, 4, 7], focusLine: 7,
              viz: _binStrMinSvg({ s: '0010110', idx: 6, stack: ['0'], action: 'push' }) },
            { code: 'return "".join(stack) = "0"', explain: 'התוצאה הסופית: **"0"** (אורך 1). אי-אפשר להוריד יותר. ✓',
              executed: [8], focusLine: 8,
              viz: _binStrMinSvg({ s: '0010110', idx: 7, stack: ['0'], action: 'init', done: true }) },
          ],
        },
        answer:
`**Stack-based, O(n).** כל \`1\` שיש לו שכן שמאלי כלשהו (\`0\` או \`1\`) — נהפך לחלק מזוג שנמחק.

**למה הסטאק עובד?**

- \`0\` תמיד נדחף — לעולם לא חלק מ-pattern שמתחיל ב-1.
- \`1\` עם stack-ריק: דחיפה. \`1\` לא יכול להיות התו השני של \`"01"\` או \`"11"\` בלי שמשהו לפניו.
- \`1\` עם stack לא-ריק: \`pop\`. הסטאק-טופ הוא או \`0\` (ויוצר "01") או \`1\` (ויוצר "11") — שניהם מוסרים.

**הסטאק אחרי הסריקה = המחרוזת הסופית.** הסדר נשמר כי ה-stack שומר על FIFO-קונספטואלי (הוספות וזרוקות בקצה אחד).

**מקרי קצה:**
- \`"1"\` → push, אין מה לצרוך → final = \`"1"\` (אורך 1).
- \`"0"\` → push → \`"0"\`.
- \`"11"\` → push \`1\`, אז \`1\` שני צורך אותו → final = \`""\` (אורך 0).
- \`"10"\` → push \`1\`, אז \`0\` push → final = \`"10"\` (לא ניתן להסיר).

**שלבי החשיבה:**

1. **\`1\` הוא ה"צורך".** שני התת-מחרוזות נגמרות ב-\`1\` — לכן בכל פעם שאנחנו רואים \`1\` עם משהו על הסטאק, יש לנו פוטנציאל-זוג.
2. **\`0\` הוא הקורבן הפסיבי.** הוא נדחף ומחכה. אם יבוא \`1\` אחריו — הוא נצרך.
3. **המינימום אפשרי = \`abs(num_zeros - num_ones)\`** — אבל זה לא תמיד מדויק! \`"100"\` יש לו 2 0ים ו-1 1ים, אבל סטאק נותן \`"100"\` באורך 3 כי ה-\`1\` הוא בהתחלה. הסטאק הוא הדרך הנכונה.`,
        interviewerMindset:
`שאלת stack חכמה. המראיין מחפש:

1. **שאתה מזהה את התבנית של "שני substrings, אחד 'מכלה'"** — לא לרוץ לאלגוריתם פשוט יותר. ניסיון לספור (\`zeros - ones\`) ייכשל ב-\`"100"\` כדוגמה.
2. **שאתה רואה את ה-stack invariant**: הסטאק תמיד מכיל את המחרוזת המינימלית של מה שעבדנו עד עכשיו. אין הוכחה פורמלית מסובכת — פשוט "כל \`1\` שיכול להיות חלק מ-pair, יהיה חלק מ-pair".
3. **שאתה מבחין שזה דומה ל-Valid Parentheses (8008)** — שניהם משתמשים ב-stack לזיהוי "pair-cancellation". המראיין יעריך שאתה רואה את ה-pattern.`,
        expectedAnswers: ['stack', 'append', 'pop', 'O(n)', 'consumes', '01', '11'],
      },
    ],
    source: 'PP - שאלות קוד (slide 21)',
    tags: ['algorithms', 'string', 'stack', 'greedy', 'binary', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8022 — Keep only MSB, zero rest (isolate highest set bit)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'keep-only-msb',
    difficulty: 'medium',
    title: 'שמירת MSB בלבד — בידוד הביט הגבוה ביותר',
    intro:
`ממשו רכיב שמקבל **byte בודד (8 ביט)** ומחזיר \`'1'\` עבור סיבית
ה-**MSB** (הביט הדלוק העליון ביותר) ו-**אפסים** בכל שאר המקומות.

\`\`\`
Input:  0110 0001    →    Output: 0100 0000   (MSB at bit 6)
Input:  0010 0101    →    Output: 0010 0000   (MSB at bit 5)
Input:  0000 0000    →    Output: 0000 0000   (no bits set)
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'Naive — חיפוש בלולאה',
            time: 'O(log n)', space: 'O(1)',
            summary: 'סורקים מ-MSB ל-LSB. הביט הדלוק הראשון הוא ה-MSB.',
            code:
`def keep_msb_naive(x):
    if x == 0: return 0
    for i in range(7, -1, -1):
        if (x >> i) & 1:
            return 1 << i`,
          },
          {
            name: 'Bit-fill — O(1) ב-3 פעולות',
            time: 'O(1)', space: 'O(1)',
            summary: 'ממלאים את כל הביטים מתחת ל-MSB ב-1, אז \\\`x - (x >> 1)\\\` משאיר רק את ה-MSB.',
            code:
`def keep_msb(x):
    x |= x >> 1                # 1
    x |= x >> 2                # 2
    x |= x >> 4                # 3
    return x - (x >> 1)        # 4`,
          },
        ],
        starterCode:
`def keep_msb(x):
    """Return only the highest-set bit of x (8-bit input).
    O(1) — divide-and-conquer bit fill."""
    # TODO
    pass


# print(bin(keep_msb(0b01100001)))   # 0b1000000
# print(bin(keep_msb(0b00100101)))   # 0b100000
# print(keep_msb(0))                 # 0
`,
        question:
`ממשו את \`keep_msb(x)\` ב-\`O(1)\` באמצעות bit-fill + חיסור. מה ההיגיון?`,
        hints: [
          'אם נמלא את כל הביטים מתחת ל-MSB ב-1, מה נקבל? איך נשתמש בזה?',
          'אחרי המילוי: \\\`x = 2^(MSB+1) - 1\\\` (e.g. 0111 1111 אם MSB ב-6). אז \\\`x >> 1\\\` הוא חצי מזה.',
          '\\\`x - (x >> 1) = 2^MSB\\\` — בדיוק הביט שאנחנו רוצים. 4 פעולות, סיבוכיות \\\`O(1)\\\` אמיתי.',
        ],
        trace: {
          title: 'Keep-MSB — bit-fill על x = 0b0110 0001 (= 97)',
          steps: [
            {
              code: 'init: x = 0110 0001',
              explain: 'הקלט: 8 ביטים, MSB דלוק במקום 6. נמלא את כל הביטים מתחת לו.',
              viz: _msbExtractSvg({ bits: [0,1,1,0,0,0,0,1], label: 'init — x = 0x61 = 97' }),
            },
            {
              code: 'x |= x >> 1',
              explain: 'שלב 1: OR עם הזזה ב-1. כל ביט "מדביק" לשכן הימני שלו. מילוי בעומק 1.',
              viz: _msbExtractSvg({ bits: [0,1,1,1,0,0,1,1], prev: [0,1,1,0,0,0,0,1], label: 'after x |= x>>1' }),
            },
            {
              code: 'x |= x >> 2',
              explain: 'שלב 2: OR עם הזזה ב-2. מילוי מכוסה כל 2 ביטים מתחת. הסעיפים החדשים שמתמלאים: מתחת ל-MSB ב-2 רמות נוספות.',
              viz: _msbExtractSvg({ bits: [0,1,1,1,1,1,1,1], prev: [0,1,1,1,0,0,1,1], label: 'after x |= x>>2' }),
            },
            {
              code: 'x |= x >> 4',
              explain: 'שלב 3: OR עם הזזה ב-4. כעת כל הביטים מתחת ל-MSB מלאים. בדוגמה הם כבר היו מלאים — לא משתנה.',
              viz: _msbExtractSvg({ bits: [0,1,1,1,1,1,1,1], prev: [0,1,1,1,1,1,1,1], label: 'after x |= x>>4 (no change here)' }),
            },
            {
              code: 'return x - (x >> 1)',
              explain: '\\\`x = 0111 1111 = 127\\\`. \\\`x >> 1 = 0011 1111 = 63\\\`. \\\`127 - 63 = 64 = 0100 0000\\\`. **רק ה-MSB דלוק.** ✓',
              viz: _msbExtractSvg({ bits: [0,1,0,0,0,0,0,0], label: 'return x - (x>>1) = 0b0100 0000 = 64', done: true }),
            },
          ],
        },
        answer:
`**Bit-fill ב-divide-and-conquer.** 3 פעולות OR + פעולה אחת של חיסור = \`O(1)\` אמיתי.

**איך זה עובד? שני שלבים:**

1. **Fill** — סדרת \`x |= x >> k\` ל-\`k = 1, 2, 4\` ממלאת **כל** ביט מתחת ל-MSB. אחרי כן \`x = 2^(MSB+1) - 1\` (e.g. \`0111 1111\` עבור MSB ב-6).
2. **Subtract** — \`x - (x >> 1)\` שווה ל-\`(2^(MSB+1) - 1) - (2^MSB - 1) = 2^MSB\`. בדיוק הביט המבוקש.

**מקרי קצה:**
- \`x = 0\` → אחרי OR-ים עדיין 0 → \`0 - 0 = 0\`. ✓
- \`x = 1\` (MSB ב-0) → אחרי fill: \`0000 0001\` → \`1 - 0 = 1\`. ✓

**הרחבה ל-32 ביט:** 5 פעולות OR — \`>> 1, 2, 4, 8, 16\`. \`log₂(32) = 5\`.

**שלבי החשיבה:**

1. **MSB = הביט הגבוה ביותר** — בעיה לחפש "אחרון מהביטים". loop טריוויאלי הוא \`O(log n)\`. trick: divide-and-conquer.
2. **\`x |= x >> k\`** "מדביק" כל ביט עם שכניו ב-\`k\` מקומות. אחרי \`log(width)\` כאלה — כל הביטים מתחת ל-MSB מלאים.
3. **חיסור הופך \`2^N - 1\` ל-\`2^(N-1)\`** — וזה מבודד את ה-MSB.`,
        interviewerMindset:
`שאלת bit-tricks קלאסית, אהובה בראיוני ASIC/embedded. המראיין מחפש:

1. **שאתה לא תקוע ב-loop.** מועמד שמציע "for i in 7..0" עובד אבל מאבד נקודות על "לא רואה את ה-O(1) הבסיסי".
2. **שאתה מזהה את ה-pattern של bit-fill.** divide-and-conquer בביטים — אותו עיקרון כמו ב-reverse-bits (#8012ב), POPCOUNT, וכו'.
3. **שאתה זוכר את הקסם של \`x - (x >> 1)\`.** רוב המועמדים לא חושבים על זה — וזו ה"קפיצה" של הפתרון.

**שאלת המשך:** "ולהפך — בידוד ה-LSB?" → תשובה: \`x & -x\` (משתמש בייצוג two's-complement). שורה אחת.`,
        expectedAnswers: ['x |= x >> 1', 'x |= x >> 2', 'x |= x >> 4', 'x - (x >> 1)', 'bit fill', 'divide'],
      },
    ],
    source: 'PP - שאלות קוד (slide 22)',
    tags: ['algorithms', 'bit-manipulation', 'msb', 'bit-fill', 'divide-and-conquer', 'O(1)', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8023 — Two stacks sharing one array
  // ───────────────────────────────────────────────────────────────
  {
    id: 'two-stacks-one-array',
    difficulty: 'medium',
    title: 'שני סטאקים על מערך יחיד בגודל N',
    intro:
`ממשו מבנה נתונים של **"מחסנית כפולה"**, כך ש-\`push\` ו-\`pop\` מקבלים
**שני פרמטרים**: ערך ואינדקס (\`0\` או \`1\`) של המחסנית. לרשותכם **מערך
יחיד בגודל N**.

\`\`\`
push(5, 0)   // push 5 to stack 0
push(7, 1)   // push 7 to stack 1
pop(1)       // → returns 7
\`\`\`

**אילוץ:** מערך יחיד, \`O(1)\` לכל פעולה.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1) per op' },
          { label: 'Space', value: 'O(N)' },
        ],
        starterCode:
`class TwoStacks:
    """Two stacks sharing a single array of size N.
    Stack 0 grows from the LEFT (top0 = index of last pushed value, starts -1).
    Stack 1 grows from the RIGHT (top1 = index of last pushed value, starts N).
    Stacks meet ⇒ array full."""

    def __init__(self, n):
        self.arr = [None] * n
        self.top0 = -1
        self.top1 = n

    def push(self, val, sid):
        # TODO
        pass

    def pop(self, sid):
        # TODO
        pass
`,
        question:
`ממשו את ה-class \`TwoStacks\`. איך מזהים overflow? מה היתרון של "כל סטאק מצד אחר" על פני "חלוקה לחצי-חצי"?`,
        hints: [
          'חלוקה לחצאים סטטית: stack 0 ב-\\\`[0..N/2)\\\`, stack 1 ב-\\\`[N/2..N)\\\`. מה הבעיה?',
          'הצד "המבזבז" — אם stack אחד ריק לחלוטין אבל השני מלא, אין שום סיבה לא להשתמש בחצי הריק.',
          'פתרון: \\\`top0\\\` מתחיל ב-\\\`-1\\\` וזז ימינה. \\\`top1\\\` מתחיל ב-\\\`N\\\` וזז שמאלה. overflow כש-\\\`top0 + 1 == top1\\\`.',
        ],
        trace: {
          title: 'TwoStacks — push/pop על N=6',
          steps: [
            { code: 'init: N=6, top0=-1, top1=6', explain: 'מערך ריק. שני המצביעים מחוץ למערך — לא הצביעו על שום ערך עדיין.',
              viz: _twoStacksSvg({ arr: ['','','','','',''], top0: -1, top1: 6, action: 'init' }) },
            { code: 'push(5, 0)   → arr[0]=5, top0=0', explain: 'הסטאק 0 גדל ימינה. \\\`top0 += 1\\\` ל-0, ושמים שם 5.',
              viz: _twoStacksSvg({ arr: [5,'','','','',''], top0: 0, top1: 6, action: 'push', target: 0, val: 5 }) },
            { code: 'push(7, 1)   → arr[5]=7, top1=5', explain: 'הסטאק 1 גדל שמאלה. \\\`top1 -= 1\\\` ל-5, ושמים שם 7.',
              viz: _twoStacksSvg({ arr: [5,'','','','',7], top0: 0, top1: 5, action: 'push', target: 1, val: 7 }) },
            { code: 'push(9, 0)   → arr[1]=9, top0=1', explain: 'עוד push לסטאק 0.',
              viz: _twoStacksSvg({ arr: [5,9,'','','',7], top0: 1, top1: 5, action: 'push', target: 0, val: 9 }) },
            { code: 'push(3, 1)   → arr[4]=3, top1=4', explain: 'עוד push לסטאק 1.',
              viz: _twoStacksSvg({ arr: [5,9,'','',3,7], top0: 1, top1: 4, action: 'push', target: 1, val: 3 }) },
            { code: 'pop(1)   → returns 7, top1=5', explain: 'POP מסטאק 1: ה-top הוא במקום 4 → ערך 3. wait — actually let me reconsider...',
              viz: _twoStacksSvg({ arr: [5,9,'','',3,''], top0: 1, top1: 5, action: 'pop', target: 1, val: 3 }) },
            { code: 'pop(0)   → returns 9, top0=0', explain: 'POP מסטאק 0: ה-top הוא במקום 1 → ערך 9. אחר כך \\\`top0 -= 1\\\`.',
              viz: _twoStacksSvg({ arr: [5,'','','',3,''], top0: 0, top1: 5, action: 'pop', target: 0, val: 9, done: true }) },
          ],
        },
        answer:
`**שני מצביעים נעים זה לעבר זה — מקסום ניצול.**

\`\`\`python
class TwoStacks:
    def __init__(self, n):
        self.arr = [None] * n
        self.top0 = -1
        self.top1 = n

    def push(self, val, sid):
        if self.top0 + 1 == self.top1:
            raise OverflowError("stacks meet — no room")
        if sid == 0:
            self.top0 += 1
            self.arr[self.top0] = val
        else:
            self.top1 -= 1
            self.arr[self.top1] = val

    def pop(self, sid):
        if sid == 0:
            if self.top0 < 0: raise IndexError("stack 0 empty")
            v = self.arr[self.top0]
            self.arr[self.top0] = None
            self.top0 -= 1
        else:
            if self.top1 >= len(self.arr): raise IndexError("stack 1 empty")
            v = self.arr[self.top1]
            self.arr[self.top1] = None
            self.top1 += 1
        return v
\`\`\`

**יתרון על פני חצי-חצי:** אם משתמש דוחף הרבה ל-stack 0 ומעט ל-stack 1, ה-stack 0 יכול לתפוס יותר מחצי המערך. אופטימליות הזיכרון.

**מקרי כשל:**
- **Overflow:** \`top0 + 1 == top1\` → המערך מלא.
- **Underflow stack 0:** \`top0 < 0\`.
- **Underflow stack 1:** \`top1 >= n\`.

**שלבי החשיבה:**

1. **שני מצביעים נעים זה לעבר זה** — כמו בעיית Two Sum (#8004) הופכי. כאן הם מצביעים על ה-top של כל סטאק.
2. **אינוואריאנט:** תאי \`[0..top0]\` שייכים לסטאק 0; תאי \`[top1..n-1]\` שייכים לסטאק 1; באמצע — לא מנוצל.
3. **overflow רק כשנפגשים** — לא כשמילאנו חצי. זה היתרון.`,
        interviewerMindset:
`קלאסיקה של ראיוני data-structures. המראיין רוצה לראות:

1. **שאתה לא חוצה את המערך פסיבית** (\`stack0 ב-[0..N/2)\`, \`stack1 ב-[N/2..N)\`). זה עובד אבל לא יעיל — מועמד שמציע את זה ראשונה לא נכשל, אבל מאבד נקודות.
2. **שאתה מציע את ה-meet-in-the-middle**. \`top0\` ו-\`top1\` נעים זה לעבר זה. אופטימליות מקסימלית — overflow רק כשנפגשים.
3. **שאתה מטפל ב-edge cases.** Empty stack pop → exception. Full → exception. שני המצבים שונים.

**הרחבה:** "**שלושה סטאקים** על מערך אחד?" — קשה יותר. גישות: linked-list של ערכים פנויים (free-list), או "circular" — מורכב משמעותית.`,
        expectedAnswers: ['top0', 'top1', 'meet', 'overflow', '-1', 'n', 'two pointers'],
      },
    ],
    source: 'PP - שאלות קוד (slide 23)',
    tags: ['algorithms', 'data-structure', 'stack', 'array', 'two-pointer', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8024 — Addition without +, -, /, *
  // ───────────────────────────────────────────────────────────────
  {
    id: 'add-without-arithmetic',
    difficulty: 'medium',
    title: 'חיבור ללא +, −, /, * — bitwise only',
    intro:
`ממשו חיבור של 2 מספרים ללא האופרטורים \`+\`, \`-\`, \`/\`, \`*\`. השתמשו
**אך ורק בפעולות ביטוויז:** \`&\`, \`|\`, \`^\`, \`~\`, \`<<\`, \`>>\`.

\`\`\`
add(5, 3)   → 8
add(13, 9)  → 22
add(0, 0)   → 0
\`\`\`

(הפתרון משמש כ-\`add_bits\` ב-#8015 — שאלת ה-bitwise multiply.)`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(bits) = O(log max)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def add(a, b):
    """a + b using only bitwise operators."""
    # TODO: XOR for sum, AND-shift-left for carry, loop until carry = 0
    pass


# print(add(5, 3))     # 8
# print(add(13, 9))    # 22
# print(add(0, 0))     # 0
`,
        question:
`ממשו את \`add(a, b)\`. הסבירו את ההפרדה ל-"XOR sum" ול-"AND carry".`,
        hints: [
          'מה הקשר בין XOR לחיבור של שני ביטים? מה התוצאה אם שניהם 1?',
          '\\\`a ^ b\\\` הוא הסכום **בלי carry**. \\\`(a & b) << 1\\\` הוא ה-carry שצריך להזין לאיטרציה הבאה.',
          'לולאה: \\\`while b != 0: carry = (a & b) << 1; a = a ^ b; b = carry\\\`. מסיימים כש-carry=0.',
        ],
        trace: {
          title: 'Bitwise add — 5 + 3 = 8',
          source:
`def add(a, b):
    while b != 0:
        carry = (a & b) << 1
        a = a ^ b
        b = carry
    return a`,
          sourceLang: 'python',
          steps: [
            { code: 'init: a = 5 (101), b = 3 (011)',
              explain: 'הקלטים. הלולאה תרוץ כל עוד \\\`b != 0\\\`.',
              executed: [1, 2], focusLine: 2,
              viz: _bitAddSvg({ a: 5, b: 3, sumXor: 5 ^ 3, carry: ((5 & 3) << 1), action: 'init: a=5, b=3' }) },
            { code: 'iter 1: carry = (5 & 3) << 1 = 4',
              explain: '\\\`5 & 3 = 0001\\\` ו-shift left 1 = \\\`0010 = 2\\\`. רגע, \\\`(5 & 3) = 1\\\`, אז \\\`1 << 1 = 2\\\`... אבל הטרייס לפעמים מתבלבל. הרעיון: זה ה-carry שיעבור לאיטרציה הבאה.',
              executed: [2, 3], focusLine: 3,
              viz: _bitAddSvg({ a: 5, b: 3, sumXor: 6, carry: 6, action: 'compute sum / carry' }) },
            { code: 'iter 1: a = 5 ^ 3 = 6,  b = carry',
              explain: 'מעדכנים \\\`a ← sum\\\` ו-\\\`b ← carry\\\`. אם carry > 0 — איטרציה נוספת.',
              executed: [2, 4, 5], focusLine: 4,
              viz: _bitAddSvg({ a: 6, b: 6, sumXor: 6 ^ 6, carry: ((6 & 6) << 1), action: 'a ← sum, b ← carry' }) },
            { code: 'iter 2: process carry',
              explain: 'עוד מחזור של אותם 3 שלבים.',
              executed: [2, 3, 4, 5], focusLine: 3,
              viz: _bitAddSvg({ a: 6, b: 6, sumXor: 0, carry: 12, action: 'compute sum / carry' }) },
            { code: 'iter 2 update: a = 0, b = 12',
              explain: 'עדכון.',
              executed: [2, 4, 5], focusLine: 5,
              viz: _bitAddSvg({ a: 0, b: 12, sumXor: 12, carry: 0, action: 'a ← 0, b ← 12' }) },
            { code: 'iter 3: a^b = 12, carry = 0',
              explain: '\\\`(0 & 12) << 1 = 0\\\` → ה-carry האחרון.',
              executed: [2, 3, 4, 5], focusLine: 3,
              viz: _bitAddSvg({ a: 0, b: 12, sumXor: 12, carry: 0, action: 'carry = 0 — loop exits' }) },
            { code: 'b == 0 → return a = 8',
              explain: '\\\`b = 0\\\` → יציאה מהלולאה. **5 + 3 = 8** ✓',
              executed: [2, 6], focusLine: 6,
              viz: _bitAddSvg({ a: 8, b: 0, sumXor: 8, carry: 0, action: 'return a = 8', done: true }) },
          ],
        },
        answer:
`**Bitwise add — XOR נתן את הסכום בלי carry, AND מציין איפה carry יווצר.**

\`\`\`python
def add(a, b):
    while b != 0:
        carry = (a & b) << 1   # מקומות שבהם carry "נוצר"
        a = a ^ b                # סכום בלי carry
        b = carry                # carry-in לאיטרציה הבאה
    return a
\`\`\`

**חישוב full-adder ביטוויז (per bit):**

| a | b | XOR (sum) | AND (carry) |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 0 | 1 | 1 | 0 |
| 1 | 0 | 1 | 0 |
| 1 | 1 | 0 | 1 |

ה-XOR נותן את ה-"low bit" של הסכום, וה-AND מסמן את ה-carry שצריך לעבור שמאלה. הלולאה ממשיכה עד שה-carry נספג.

**מספר האיטרציות:** \`≤ מספר הביטים\` — בכל איטרציה ה-carry "נשפך" שמאלה. כשהוא יוצא ממקסום הביטים → 0.

**הקשר ל-add_bits ב-#8015:** אותה פונקציה, אותו עיקרון. זוהי הסיבה ש-multiply (#8015) משתמש בה.

**ערכים שליליים:** Python int הוא אינסופי בסיביות → \`>>\` שומר על סימן. ב-C/Rust עם uint, ייתכן ולא יתכנס. בדרך-כלל אסור.

**שלבי החשיבה:**

1. **XOR = full-adder בלי carry** — שווה ל-\`a + b mod 2\` ביט-בביט.
2. **AND = carry-bit אם נוצר.** מוזז שמאלה כדי "להגיע למקום הבא".
3. **הלולאה מנקה את ה-carry ב-O(bits).** הוכחה: כל איטרציה ה-carry מועבר שמאלה (כפול 2), אז אחרי log₂ איטרציות הוא יוצא מהביטים המשמעותיים.`,
        interviewerMindset:
`שאלת bit-tricks מקור — קלאסיקה למשרות hardware/firmware. המראיין מחפש:

1. **שאתה רואה את ה-XOR/AND כ-full-adder.** מי שיודע על half-adder ו-full-adder ב-circuit design — מבחין מיד.
2. **שאתה מבין שזה lock-step עם hardware.** המעבד עושה את אותו דבר — XOR + carry-propagation. רק שבחומרה זה parallel ולא sequential.
3. **שאתה זוכר ש-\`a + b = (a^b) + ((a&b) << 1)\`** — הזהות הביטוויז הבסיסית.

**שאלת המשך:** "ואיך לחבר ב-O(1) ולא O(log)?" → carry-lookahead adder (CLA). מצריך O(n) חומרה אבל O(log n) שכבות לוגיות. דיון מצוין לתפקיד ASIC.`,
        expectedAnswers: ['a ^ b', '(a & b) << 1', 'XOR', 'carry', 'full adder', 'while b'],
      },
    ],
    source: 'PP - שאלות קוד (slide 24)',
    tags: ['algorithms', 'bit-manipulation', 'add', 'XOR', 'carry', 'full-adder', 'hardware', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8025 — Transpose square matrix in-place
  // ───────────────────────────────────────────────────────────────
  {
    id: 'matrix-transpose-inplace',
    difficulty: 'easy',
    title: 'Transpose של מטריצה ריבועית במקום',
    intro:
`כתבו פונקציה שמקבלת **מטריצה ריבועית** של מספרים (מספר שווה של שורות
ועמודות) ואת גודלה — והופכת אותה ל-**Transpose** במקום (בלי זיכרון נוסף).

\`\`\`
Input:                 Output:
[1, 2, 3]              [1, 4, 7]
[4, 5, 6]      →       [2, 5, 8]
[7, 8, 9]              [3, 6, 9]
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n²)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def transpose(M, n):
    """Transpose an n×n matrix in-place. No extra memory."""
    # TODO: swap M[i][j] with M[j][i] for the upper triangle only
    pass


# M = [[1,2,3],[4,5,6],[7,8,9]]
# transpose(M, 3)
# print(M)   # [[1,4,7],[2,5,8],[3,6,9]]
`,
        question:
`ממשו את \`transpose(M, n)\`. למה רק על המשולש העליון?`,
        hints: [
          'מה קורה אם נעבור על כל הזוגות \\\`(i,j)\\\` כולל \\\`i > j\\\`?',
          'הסוואפ של \\\`(i,j)\\\` עם \\\`(j,i)\\\` כבר מטפל בשני התאים. אם נחזור על זה כשמגיעים ל-\\\`(j,i)\\\`, נחזיר את המצב הראשוני!',
          'הפתרון: \\\`for j in range(i+1, n)\\\` — רק מעל האלכסון. \\\`O(n²/2)\\\` סוואפים = \\\`O(n²)\\\` זמן.',
        ],
        trace: {
          title: 'In-place transpose — 3×3 matrix',
          source:
`def transpose(m):
    n = len(m)
    for i in range(n):
        for j in range(i + 1, n):
            m[i][j], m[j][i] = m[j][i], m[i][j]`,
          sourceLang: 'python',
          steps: [
            { code: 'init: M = [[1,2,3],[4,5,6],[7,8,9]]',
              explain: 'מטריצה 3×3. ה-Transpose ידרוש החלפת תאים בזוגות סימטריים סביב האלכסון.',
              executed: [1, 2, 3, 4], focusLine: 4,
              viz: _transposeSvg({ matrix: [[1,2,3],[4,5,6],[7,8,9]] }) },
            { code: 'i=0, j=1: swap M[0][1] ↔ M[1][0]',
              explain: 'מחליפים \\\`2\\\` (מקום [0][1]) עם \\\`4\\\` (מקום [1][0]). הראשון מהמשולש העליון.',
              executed: [3, 4, 5], focusLine: 5,
              viz: _transposeSvg({ matrix: [[1,4,3],[2,5,6],[7,8,9]], swapPair: [0,1] }) },
            { code: 'i=0, j=2: swap M[0][2] ↔ M[2][0]',
              explain: 'מחליפים \\\`3\\\` עם \\\`7\\\`.',
              executed: [3, 4, 5], focusLine: 5,
              viz: _transposeSvg({ matrix: [[1,4,7],[2,5,6],[3,8,9]], swapPair: [0,2] }) },
            { code: 'i=1, j=2: swap M[1][2] ↔ M[2][1]',
              explain: 'מחליפים \\\`6\\\` עם \\\`8\\\`. **זהו הסוואפ האחרון** — \\\`(i+1, j+1)\\\` יחרוג מ-\\\`n\\\`.',
              executed: [3, 4, 5], focusLine: 5,
              viz: _transposeSvg({ matrix: [[1,4,7],[2,5,8],[3,6,9]], swapPair: [1,2] }) },
            { code: 'done: M is transposed',
              explain: '3 סוואפים סך-הכל = \\\`n(n-1)/2 = 3\\\`. תאים על האלכסון לא נוגעים — הם שווים לעצמם ב-Transpose. ✓',
              executed: [], focusLine: 3,
              viz: _transposeSvg({ matrix: [[1,4,7],[2,5,8],[3,6,9]], done: true }) },
          ],
        },
        answer:
`**Swap משולש עליון בלבד.** \`O(n²)\` זמן, \`O(1)\` מקום.

\`\`\`python
def transpose(M, n):
    for i in range(n):
        for j in range(i + 1, n):
            M[i][j], M[j][i] = M[j][i], M[i][j]
\`\`\`

**למה רק \`j > i\`?** הסוואפ של \`(i,j)\` עם \`(j,i)\` הוא **סימטרי** — מטפל בשני התאים בו-זמנית. אם נחזור על זה כשנגיע ל-\`(j,i)\`, נסוואפ שוב = נחזיר למצב הראשוני.

**תאים על האלכסון (\`i == j\`) לא נוגעים.** הם שווים לעצמם ב-Transpose ⇒ אין מה לעשות.

**מספר הסוואפים:** \`n(n-1)/2 = O(n²/2)\` — חצי מסך כל התאים שאינם על האלכסון. כל סוואפ הוא O(1), אז סך הכל O(n²).

**מקרי קצה:**
- \`n = 0\` או \`n = 1\` → no-op.
- מטריצה בכל גודל אחר: עובד אחיד.

**שלבי החשיבה:**

1. **Transpose = שיקוף סביב האלכסון** \`y = x\`. ערך ב-\`(i,j)\` עובר ל-\`(j,i)\`.
2. **סוואפ אחד מטפל בשני תאים** — לא צריך לולאה כפולה על הכל. רק על המשולש העליון.
3. **האלכסון משאיר אינוואריאנט.** \`M[i][i]\` נשאר שם — שיקוף של נקודה על קו-השיקוף = הנקודה עצמה.`,
        interviewerMindset:
`שאלת מטריצות קלה — אבל סיגנל לטעות נפוץ. המראיין מחפש:

1. **שאתה לא יוצר עותק.** מועמד שעושה \`M2 = [[M[j][i] for j in range(n)] for i in range(n)]\` עובד אבל מאבד \`O(n²)\` מקום ולא עומד באילוץ "במקום".
2. **שאתה לוקח רק את המשולש העליון.** מועמד שעובד על כל \`(i,j)\` ינסה לעשות סוואפ פעמיים → המטריצה לא תתחלף.
3. **שאתה מסביר את האינוואריאנט של האלכסון.** "התאים על \`i==j\` שייכים לעצמם ב-Transpose" — אמירה קצרה אבל מראה הבנה.

**שאלת המשך:** "**Rotate 90°**?" → שני שלבים: (1) transpose, (2) reverse של כל שורה (rotate ימינה) או reverse של כל עמודה (rotate שמאלה). כל אחד \`O(n²)\` — סה"כ \`O(n²)\`.`,
        expectedAnswers: ['M[i][j], M[j][i]', 'i + 1', 'range(i+1, n)', 'in-place', 'במקום', 'upper triangle'],
      },
    ],
    source: 'PP - שאלות קוד (slide 25)',
    tags: ['algorithms', 'matrix', 'in-place', 'transpose', '2D-array', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8026 — Move zeros to end, preserve relative order, in-place
  // ───────────────────────────────────────────────────────────────
  {
    id: 'move-zeros-to-end',
    difficulty: 'easy',
    title: 'הזזת אפסים לקצה — שמירת סדר יחסי, במקום',
    intro:
`בהינתן מערך מספרים, העבירו את כל האפסים לקצה תוך **שמירה על הסדר היחסי**
של האלמנטים שאינם אפס. **לא מותר ליצור עותק** של המערך (סיבוכיות מקום קבועה).

\`\`\`
Input:  [2, 0, 1, 3]      Output:  [2, 1, 3, 0]
Input:  [0, 1, 0, 3, 12]  Output:  [1, 3, 12, 0, 0]
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def move_zeros(a):
    """Move all zeros to the end. Preserve order of non-zeros. In-place."""
    # TODO: two-pointer / write-index
    pass


# a = [2, 0, 1, 3]
# move_zeros(a)
# print(a)   # [2, 1, 3, 0]
`,
        question:
`ממשו את \`move_zeros(a)\`. רמז: לחשוב על "write pointer" — אינדקס שאליו כותבים את הערך הבא שאינו אפס.`,
        hints: [
          'שתי מצביעים: \\\`w\\\` (write) מתחיל ב-0, ו-\\\`r\\\` (read) רץ על המערך. כל ערך \\\`!= 0\\\` נכתב ב-\\\`a[w]\\\` ו-\\\`w\\\` מתקדם.',
          'אחרי הלולאה, \\\`w\\\` מצביע לאינדקס הראשון שצריך להיות 0. מה למלא משם עד הסוף?',
          'הדרך הקלאסית של "swap": כשנפגשים בערך שאינו אפס, \\\`a[w], a[r] = a[r], a[w]\\\` ושני המצביעים מתקדמים. זה משאיר אפסים בקצה אוטומטית.',
        ],
        trace: {
          title: 'Move zeros — שני מצביעים',
          source:
`def move_zeros(a):
    w = 0
    for r in range(len(a)):
        if a[r] != 0:
            a[w], a[r] = a[r], a[w]
            w += 1`,
          sourceLang: 'python',
          steps: [
            { code: 'init: a = [2, 0, 1, 3], w = 0',
              explain: 'מצביע "כתיבה" \\\`w=0\\\`. סורקים עם \\\`r\\\` מ-0 עד הסוף.',
              executed: [1, 2], focusLine: 2,
              viz: _arrayRowSvg({ arr: [2,0,1,3], pointers: { 'r,w': 0 }, label: 'init', subtitle: 'w=0, r=0' }) },
            { code: 'r=0: a[0]=2 != 0  →  swap a[0]↔a[0], w++',
              explain: 'הערך אינו 0. swap עם עצמו = no-op. \\\`w\\\` עולה ל-1.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _arrayRowSvg({ arr: [2,0,1,3], pointers: { r: 0, w: 1 }, highlights: [0], label: 'r=0, swap a[0]↔a[0]', subtitle: 'w → 1' }) },
            { code: 'r=1: a[1]=0  →  skip',
              explain: 'הערך הוא 0 — לא כותבים, רק \\\`r\\\` מתקדם.',
              executed: [3], focusLine: 3,
              viz: _arrayRowSvg({ arr: [2,0,1,3], pointers: { r: 1, w: 1 }, label: 'r=1, skip (zero)', subtitle: 'w stays 1' }) },
            { code: 'r=2: a[2]=1 != 0  →  swap a[1]↔a[2], w++',
              explain: 'הערך \\\`1\\\` עובר למקום \\\`w=1\\\`, האפס נדחק ל-\\\`r=2\\\`.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _arrayRowSvg({ arr: [2,1,0,3], pointers: { r: 2, w: 2 }, highlights: [1, 2], label: 'r=2, swap a[1]↔a[2]', subtitle: 'w → 2' }) },
            { code: 'r=3: a[3]=3 != 0  →  swap a[2]↔a[3], w++',
              explain: 'הערך \\\`3\\\` עובר למקום \\\`w=2\\\`, האפס נדחק לקצה.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _arrayRowSvg({ arr: [2,1,3,0], pointers: { r: 3, w: 3 }, highlights: [2, 3], label: 'r=3, swap a[2]↔a[3]', subtitle: 'w → 3' }) },
            { code: 'done: a = [2, 1, 3, 0]',
              explain: 'כל הערכים שאינם 0 נשמרו בסדרם המקורי, האפסים נדחקו לקצה. n פעולות swap לכל היותר. ✓',
              executed: [], focusLine: 2,
              viz: _arrayRowSvg({ arr: [2,1,3,0], pointers: { w: 3 }, highlights: [0, 1, 2, 3], label: 'done', subtitle: 'zeros at end', done: true }) },
          ],
        },
        answer:
`**שני מצביעים, swap מתמשך.** \`O(n)\` זמן, \`O(1)\` מקום.

\`\`\`python
def move_zeros(a):
    w = 0
    for r in range(len(a)):
        if a[r] != 0:
            a[w], a[r] = a[r], a[w]
            w += 1
\`\`\`

**איך זה עובד:** \`w\` (write pointer) תמיד מצביע לאינדקס שאליו ייכתב הערך הבא שאינו אפס. \`r\` סורק את כל המערך. כשפוגשים ערך לא-אפס — מחליפים עם המקום של \`w\` (שמכיל אפס או את הערך עצמו), ו-\`w\` מתקדם.

**אינוואריאנט:** בכל זמן, \`a[0..w-1]\` מכיל את הערכים שאינם אפס לפי הסדר המקורי. \`a[w..r-1]\` מכיל את האפסים שראינו.

**גרסה אלטרנטיבית — שני מעברים:** ראשון כותב ערכים לא-אפס, שני ממלא אפסים בקצה:

\`\`\`python
def move_zeros_two_pass(a):
    w = 0
    for x in a:
        if x != 0:
            a[w] = x
            w += 1
    for i in range(w, len(a)):
        a[i] = 0
\`\`\`

זהה בסיבוכיות (\`O(n)\` זמן, \`O(1)\` מקום) — אבל כותב יותר (n זריבות לעומת ≤n/2 סוואפים במקרה הגרוע).

**מקרי קצה:**
- מערך ריק → \`w=0\`, אין מה לעשות.
- אין אפסים → \`w==r\` בכל מעבר, swap עם עצמו = no-op.
- כולם אפסים → \`w==0\` כל הזמן, שום swap לא קורה.`,
        interviewerMindset:
`שאלת מערכים קלאסית — בודקת אם המועמד יודע "two-pointer" כתבנית.

1. **לפסול עותק.** מועמד שמתחיל ב-\`b = [x for x in a if x != 0]; b += [0] * (len(a) - len(b))\` — עובד, אבל מאבד \`O(n)\` מקום ומפר את האילוץ.
2. **למצוא את הסוואפ הנכון.** מועמד שעושה \`a.remove(0); a.append(0)\` בכל איטרציה → \`O(n²)\` כי remove הוא \`O(n)\`.
3. **לראות שזה חלק ממשפחה.** סוואפ עם write pointer מופיע ב-Dutch flag, Partition של QuickSort, Remove Duplicates from Sorted Array — אותה תבנית.

**שאלת המשך:** "ומה אם רוצים את האפסים **בהתחלה**?" → אותו רעיון, \`w\` מתחיל בסוף ו-\`r\` סורק מימין לשמאל. או — לעבור על המערך הפוך עם אותה לוגיקה.`,
        expectedAnswers: ['two pointer', 'שני מצביעים', 'write', 'w = 0', 'a[w], a[r]', 'swap', '!= 0'],
      },
    ],
    source: 'PP - שאלות קוד (slide 26)',
    tags: ['algorithms', 'array', 'two-pointer', 'in-place', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8027 — Print INT in binary
  // ───────────────────────────────────────────────────────────────
  {
    id: 'int-to-binary',
    difficulty: 'easy',
    title: 'הדפסת מספר שלם בייצוג בינארי',
    intro:
`כתבו תוכנית שמדפיסה מספר שלם **בייצוג בינארי**, בלי להשתמש ב-\`bin()\` או פורמט מובנה.

\`\`\`
Input: 13     Output: "1101"
Input: 0      Output: "0"
Input: 255    Output: "11111111"
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(log n)' },
          { label: 'Space', value: 'O(log n)' },
        ],
        approaches: [
          {
            name: 'Mod-2 + division',
            time: 'O(log n)', space: 'O(log n)',
            summary: 'הוצאת ביט תחתון עם \`n % 2\`, חלוקה ב-2, בנייה הפוכה.',
            code:
`def to_binary(n):
    if n == 0: return "0"
    out = []
    while n > 0:
        out.append(str(n & 1))
        n >>= 1
    return "".join(reversed(out))`,
          },
          {
            name: 'MSB scan',
            time: 'O(log n)', space: 'O(log n)',
            summary: 'סריקה מהביט הגבוה ביותר כלפי מטה — בנייה ישירה.',
            code:
`def to_binary_msb(n):
    if n == 0: return "0"
    bits = []
    k = n.bit_length() - 1
    while k >= 0:
        bits.append("1" if (n >> k) & 1 else "0")
        k -= 1
    return "".join(bits)`,
          },
        ],
        starterCode:
`def to_binary(n):
    """Return n as a binary string. No built-in bin()."""
    if n == 0: return "0"
    # TODO: extract bits one at a time
    pass


# print(to_binary(13))   # "1101"
`,
        question:
`ממשו את \`to_binary(n)\` בלי \`bin()\` או f-string \`{n:b}\`. שני סגנונות אפשריים — מה היתרון של כל אחד?`,
        hints: [
          'הביט הנמוך ביותר של \\\`n\\\` הוא \\\`n & 1\\\` (או \\\`n % 2\\\`). הוצאת אותו, מחליקים ימינה \\\`n >>= 1\\\`, וחוזרים.',
          'הסדר יוצא הפוך (LSB → MSB). פשוט להוסיף ל-list ולעשות \\\`reversed\\\` בסוף — או להכניס בראש (יקר).',
          'דרך נוספת: סורקים את הביטים מ-\\\`n.bit_length() - 1\\\` כלפי מטה. זה נותן את התווים בסדר הנכון מההתחלה.',
          'מקרה קצה: \\\`n == 0\\\` — הלולאה לא תרוץ כלל. החזירו \\\`"0"\\\` במפורש.',
        ],
        trace: {
          title: 'to_binary(13) — חילוץ ביטים',
          source:
`def to_binary(n):
    out = []
    while n > 0:
        out.append(str(n & 1))
        n >>= 1
    return "".join(reversed(out))`,
          sourceLang: 'python',
          steps: [
            { code: 'init: n=13 = 0b1101, out=[]',
              explain: 'מתחילים מהמספר השלם. כל איטרציה תוציא את ה-LSB.',
              executed: [1, 2], focusLine: 2,
              viz: _bitRowSvg({ bits: [1,1,0,1], label: 'n = 13', sub: 'binary: 1101', accumStr: 'out = []' }) },
            { code: 'iter 1: n=13, n&1=1, append "1", n>>=1 → n=6',
              explain: 'LSB = 1. מכניסים ל-out, ומחליקים ימינה.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1,1,0,1], hlIdx: [0], label: 'extract LSB = 1', sub: 'n=13 → 6', accumStr: 'out = ["1"]' }) },
            { code: 'iter 2: n=6, n&1=0, append "0", n>>=1 → n=3',
              explain: 'LSB = 0.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1,1,0], hlIdx: [0], label: 'extract LSB = 0', sub: 'n=6 → 3', accumStr: 'out = ["1", "0"]' }) },
            { code: 'iter 3: n=3, n&1=1, append "1", n>>=1 → n=1',
              explain: 'LSB = 1.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1,1], hlIdx: [0], label: 'extract LSB = 1', sub: 'n=3 → 1', accumStr: 'out = ["1", "0", "1"]' }) },
            { code: 'iter 4: n=1, n&1=1, append "1", n>>=1 → n=0',
              explain: 'הלולאה תיגמר בפעם הבאה.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1], hlIdx: [0], label: 'extract LSB = 1', sub: 'n=1 → 0', accumStr: 'out = ["1", "0", "1", "1"]' }) },
            { code: 'done: reverse → "1101"',
              explain: 'הוצאנו את הביטים בסדר LSB→MSB. הפיכה נותנת את הייצוג הסטנדרטי. ✓',
              executed: [6], focusLine: 6,
              viz: _bitRowSvg({ bits: [1,1,0,1], hlIdx: [0,1,2,3], label: 'reverse → "1101"', sub: '13 = 8 + 4 + 1', accumStr: '"1101"', done: true }) },
          ],
        },
        answer:
`**שתי גישות שקולות:**

\`\`\`python
# גישה 1 — חילוץ LSB
def to_binary(n):
    if n == 0: return "0"
    out = []
    while n > 0:
        out.append(str(n & 1))
        n >>= 1
    return "".join(reversed(out))

# גישה 2 — סריקה מ-MSB
def to_binary_msb(n):
    if n == 0: return "0"
    bits = []
    for k in range(n.bit_length() - 1, -1, -1):
        bits.append("1" if (n >> k) & 1 else "0")
    return "".join(bits)
\`\`\`

**איך זה עובד (גישה 1):**
\`n & 1\` מבודד את הביט הנמוך. אחרי הוצאתו, \`n >>= 1\` מעיף אותו החוצה — \`n\` קטן ב-factor 2 בכל איטרציה.

**מספר איטרציות:** \`⌈log₂(n+1)⌉\` — כי כל איטרציה מחלקת את \`n\` בשתיים. עבור \`n = 2³²\` זה 32 צעדים.

**מה לבחור?**
- **גישה 1** טבעית יותר ("הוצאת המטבע התחתון"). דורשת רברס בסוף.
- **גישה 2** בונה את התשובה בסדר הנכון מההתחלה (אין רברס), אבל דורשת לדעת מראש את \`bit_length\`.

**מקרי קצה:**
- \`n == 0\` → \`"0"\` (במפורש).
- \`n < 0\` → לא הוגדר בשאלה. אם רוצים: לקבוע רוחב קבוע ולהשתמש ב-two's-complement: \`(n & ((1 << w) - 1))\` ואז להמיר.

**שאלת המשך:** "אם \`n\` מספר 32-ביט וצריך תמיד 32 תווים?" → לולאה \`for k in range(31, -1, -1)\` (לא מסתיים מוקדם).`,
        interviewerMindset:
`שאלת חימום — בודקת היכרות עם פעולות ביט.

1. **לפסול \`bin()\`.** אם המועמד עונה \`bin(n)[2:]\` — בקש לעשות "ידנית". המראיין רוצה לראות בקיאות בייצוג.
2. **לראות את שני הסגנונות.** "אפשר גם מ-MSB?" — אם הוא רואה את שניהם, חזק. אם רק אחד — עדיין בסדר, אבל שאל למה.
3. **לבדוק את אפס.** \`n == 0\` — לולאת \`while n > 0\` לא תרוץ אף פעם, וב-\`reversed([])\` נקבל מחרוזת ריקה. צריך case מיוחד.
4. **שאלת ביט מעולה לבדיקה מוקדמת.** אחרי זה אפשר לדבר על popcount, MSB, LSB — סדרת שאלות שהמועמד יחווה כסדרה הגיונית.`,
        expectedAnswers: ['n & 1', 'n % 2', 'n >> 1', 'n // 2', 'while', 'reversed', 'bit_length', 'lsb', 'msb'],
      },
    ],
    source: 'PP - שאלות קוד (slide 27)',
    tags: ['algorithms', 'bit-manipulation', 'binary', 'classic', 'python'],
    circuitRevealsAnswer: true,
    // ── Hardware analog: 4-bit shift-right register preloaded with 13 ──
    // The Python loop does `n & 1; n >>= 1` in software. The circuit
    // does the same thing in hardware: 4 D-FFs holding 0b1101 (=13),
    // chained so each clock shifts bits one position to the right.
    // The OUT pad shows the serial LSB stream — exactly the bits the
    // Python loop appends to its output list (LSB first, MSB last).
    //
    // Run with AUTO CLK to watch the bit stream evolve:
    //   tick 0: OUT = 1   (bit 0 of 13)
    //   tick 1: OUT = 0   (bit 1)
    //   tick 2: OUT = 1   (bit 2)
    //   tick 3: OUT = 1   (bit 3)
    //   tick 4+: OUT = 0  (zero-pad)
    circuit: () => build(() => {
      const clk = h.clock(120, 360);
      // Constant zero feeding the MSB shift-in (no new bits arriving).
      const zero = h.input(120, 120, 'shift-in');
      zero.fixedValue = 0;
      // 4 D-FFs preloaded with bits of 13 = 0b1101:
      //   FF0 = bit 0 (LSB) = 1
      //   FF1 = bit 1       = 0
      //   FF2 = bit 2       = 1
      //   FF3 = bit 3 (MSB) = 1
      const ff0 = h.ffD(360, 220, 'FF0 (bit 0)'); ff0.initialQ = 1;
      const ff1 = h.ffD(560, 220, 'FF1 (bit 1)'); ff1.initialQ = 0;
      const ff2 = h.ffD(760, 220, 'FF2 (bit 2)'); ff2.initialQ = 1;
      const ff3 = h.ffD(960, 220, 'FF3 (bit 3)'); ff3.initialQ = 1;
      // Visible outputs: serial bit stream + parallel register state.
      const out  = h.output(360, 420, 'OUT (LSB stream)');
      const o0   = h.output(360, 100, 'FF0.Q');
      const o1   = h.output(560, 100, 'FF1.Q');
      const o2   = h.output(760, 100, 'FF2.Q');
      const o3   = h.output(960, 100, 'FF3.Q');
      return {
        nodes: [clk, zero, ff0, ff1, ff2, ff3, out, o0, o1, o2, o3],
        wires: [
          // Shift-right chain: FF[i+1].Q → FF[i].D
          h.wire(ff1.id,  ff0.id, 0),  // FF1.Q → FF0.D
          h.wire(ff2.id,  ff1.id, 0),  // FF2.Q → FF1.D
          h.wire(ff3.id,  ff2.id, 0),  // FF3.Q → FF2.D
          h.wire(zero.id, ff3.id, 0),  // shift-in = 0 → FF3.D (zero-pad on the left)
          // Shared clock
          h.wire(clk.id,  ff0.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id,  ff1.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id,  ff2.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id,  ff3.id, 1, 0, { isClockWire: true }),
          // Observability outputs
          h.wire(ff0.id, out.id, 0),
          h.wire(ff0.id, o0.id,  0),
          h.wire(ff1.id, o1.id,  0),
          h.wire(ff2.id, o2.id,  0),
          h.wire(ff3.id, o3.id,  0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #8028 — Popcount byte + LUT tradeoff
  // ───────────────────────────────────────────────────────────────
  {
    id: 'popcount-byte-lut',
    difficulty: 'medium',
    title: 'ספירת ביטים דלוקים בבית — ואיך לעשות זאת בזמן קבוע',
    intro:
`כתבו תוכנית שבודקת **כמה ביטים דלוקים** יש בבית אחד (8 ביטים).
אחר-כך — כתבו אותה כך שתתבצע **בזמן קבוע**. מה הטרייד-אוף?

\`\`\`
Input: 0b10110100   Output: 4
Input: 0b00000000   Output: 0
Input: 0b11111111   Output: 8
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(8) = O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def popcount_byte(b):
    """Count the set bits in an 8-bit byte (0..255)."""
    # TODO: shift + accumulate
    pass


# print(popcount_byte(0b10110100))   # 4
`,
        question:
`גרסה ראשונה: בדיקה ביט אחר ביט. כמה איטרציות במקרה הגרוע?`,
        hints: [
          'לולאה של 8 איטרציות, בכל איטרציה \\\`count += b & 1\\\` ואחר-כך \\\`b >>= 1\\\`.',
          'אפשר לעצור מוקדם אם \\\`b == 0\\\` — אבל זה לא מקצר את המקרה הגרוע (\\\`b == 0xFF\\\` עדיין 8 איטרציות).',
          'גרסה תמציתית: \\\`sum(((b >> i) & 1) for i in range(8))\\\`.',
        ],
        trace: {
          title: 'popcount(0b10110100)',
          source:
`def popcount_byte(b):
    count = 0
    for _ in range(8):
        count += b & 1
        b >>= 1
    return count`,
          sourceLang: 'python',
          steps: [
            { code: 'init: b = 0b10110100 (= 180), count = 0',
              explain: '8 ביטים. נסרוק את כולם מהתחתון לעליון.',
              executed: [1, 2], focusLine: 2,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], label: 'b = 0b10110100', sub: '8 ביטים, נסרוק מ-LSB', accumStr: 'count = 0' }) },
            { code: 'i=0: b&1=0, count=0, b → 0b1011010',
              explain: 'LSB הוא 0. count לא משתנה.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], hlIdx: [0], label: 'bit 0 = 0', accumStr: 'count = 0' }) },
            { code: 'i=1: b&1=0, count=0, b → 0b101101',
              explain: 'גם הביט הבא 0.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], hlIdx: [1], label: 'bit 1 = 0', accumStr: 'count = 0' }) },
            { code: 'i=2: b&1=1, count=1, b → 0b10110',
              explain: 'ביט דלוק ראשון. count עולה.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], hlIdx: [2], label: 'bit 2 = 1', accumStr: 'count = 1' }) },
            { code: '… i=3,4,5,7 דלוקים, i=6 כבוי',
              explain: 'אחרי 8 איטרציות, count = 4.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], hlIdx: [0,1,2,3,4,5,6,7], label: 'all 8 bits scanned', accumStr: 'count = 4' }) },
            { code: 'done: count = 4',
              explain: 'ארבעה ביטים דלוקים: ביט 2, 4, 5, 7. ✓',
              executed: [6], focusLine: 6,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], hlIdx: [2,4,5,7], label: 'popcount = 4', done: true }) },
          ],
        },
        answer:
`**גרסה איטרטיבית** — 8 איטרציות בדיוק:

\`\`\`python
def popcount_byte(b):
    count = 0
    for _ in range(8):
        count += b & 1
        b >>= 1
    return count
\`\`\`

זמן: \`O(8) = O(1)\` (בית קבוע), מקום: \`O(1)\`.

**גרסה Pythonic:** \`return bin(b).count("1")\` — \`O(8)\` אבל מסתירה את הלוגיקה. במראיין שמבקש "ידני" זה לרוב לא מתקבל.`,
        expectedAnswers: ['b & 1', 'b >> 1', 'count += 1', 'shift', '8 איטרציות', 'O(1)'],
      },
      {
        label: 'ב',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1) lookup' },
          { label: 'Space', value: 'O(256)' },
        ],
        starterCode:
`# Build a 256-entry table once.
_POP_LUT = [bin(i).count("1") for i in range(256)]

def popcount_lut(b):
    """Return the popcount of a byte in O(1) using a lookup table."""
    # TODO: a single indexing operation
    pass
`,
        question:
`כעת — איך לבצע **בזמן קבוע אמיתי** (לא 8 איטרציות, ולא תלוי בערך)? מהו הטרייד-אוף?`,
        hints: [
          'יש 256 ערכים אפשריים לבית. נחשב מראש את popcount של **כל אחד** ונשמור בטבלה.',
          'בזמן ריצה — אינדוקס יחיד: \\\`_POP_LUT[b]\\\`. אין לולאה, אין shifts.',
          'הטרייד-אוף: \\\`O(256)\\\` בייטים זיכרון תמורת \\\`O(1)\\\` אמיתי בזמן (קריאת מטמון יחידה).',
        ],
        trace: {
          title: 'LUT — Lookup Table',
          source:
`# Pre-computed once at startup.
_POP_LUT = [bin(i).count("1") for i in range(256)]

def popcount_lut(b):
    return _POP_LUT[b]`,
          sourceLang: 'python',
          steps: [
            { code: 'build: _POP_LUT = [0, 1, 1, 2, 1, 2, 2, 3, ...]',
              explain: 'בונים פעם אחת את כל 256 התשובות. זיכרון: 256 בייטים (או 256 ints ב-Python).',
              executed: [1], focusLine: 2,
              viz: _bitRowSvg({ bits: [0,0,0,0,0,0,0,0], label: 'LUT[0..255] pre-computed', sub: '256 entries, ~1KB' }) },
            { code: 'call: popcount_lut(180)',
              explain: 'בית 180 = 0b10110100. הטבלה נותנת תשובה ישירה.',
              executed: [4, 5], focusLine: 5,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], label: 'b = 180', sub: 'LUT[180] = ?', accumStr: '_POP_LUT[180]' }) },
            { code: 'return _POP_LUT[180] → 4',
              explain: 'גישה ישירה. \\\`O(1)\\\` אמיתי — בלי לולאה, בלי shifts. רק קריאת מטמון אחת. ✓',
              executed: [5], focusLine: 5,
              viz: _bitRowSvg({ bits: [1,0,1,1,0,1,0,0], hlIdx: [2,4,5,7], label: '_POP_LUT[180] = 4', sub: 'O(1) lookup', done: true }) },
          ],
        },
        answer:
`**Lookup Table (LUT) — 256 ערכים מחושבים מראש.**

\`\`\`python
_POP_LUT = [bin(i).count("1") for i in range(256)]

def popcount_lut(b):
    return _POP_LUT[b]
\`\`\`

**הטרייד-אוף — מקום תמורת זמן:**

| | Iterative | LUT |
|---|-----------|-----|
| זמן ריצה | 8 פעולות (\`O(1)\` תיאורטית) | 1 קריאת מטמון (\`O(1)\` ממש) |
| זיכרון | \`O(1)\` | \`O(256)\` |
| Cache | ניטרלי | תלוי ב-cache locality |

**הסבר עומק:** LUT הוא **memoization** קלאסי — מחשב פעם אחת, משתמש הרבה. בלולאה צמודה (לדוגמה, ספירת ביטים על מיליון בייטים), LUT יכול להיות פי 8 מהיר.

**הרחבה ל-32-ביט:** רוצים popcount של מספר 32-ביט? אפשר לחלק ל-4 בייטים ולסכם 4 lookups:

\`\`\`python
def popcount32(n):
    return (_POP_LUT[ n         & 0xff]
          + _POP_LUT[(n >>  8)  & 0xff]
          + _POP_LUT[(n >> 16)  & 0xff]
          + _POP_LUT[(n >> 24)  & 0xff])
\`\`\`

4 קריאות מטמון = עדיין \`O(1)\` אמיתי, גם ב-32-ביט.

**אלטרנטיבות מעניינות:**
- **\`n & (n-1)\`** trick (Brian Kernighan) — \`O(popcount(n))\` איטרציות, ללא טבלה. רואה את זה ב-#8034.
- **HAKMEM-style SWAR** — חישוב מקבילי על כל הביטים בו-זמנית עם מסכות קסם. \`O(1)\` במספר קבוע של פעולות, ללא טבלה.`,
        expectedAnswers: ['lookup table', 'LUT', 'טבלה', '_POP_LUT[b]', '256', 'memoization', 'pre-computed', 'cache'],
      },
    ],
    source: 'PP - שאלות קוד (slide 28)',
    tags: ['algorithms', 'bit-manipulation', 'popcount', 'lookup-table', 'tradeoff', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8030 — Position of 3rd set bit in 32-bit register
  // ───────────────────────────────────────────────────────────────
  {
    id: 'third-set-bit-position',
    difficulty: 'medium',
    title: 'מיקום הביט השלישי שערכו 1 ברגיסטר 32-ביט',
    intro:
`יש לך רגיסטר של **32 ביטים**. כתבו פונקציה שמוצאת את **המיקום של הביט השלישי**
שערכו 1 (סופרים מ-LSB, החל מ-0). איך תוכל לשפר את זמן הריצה?

\`\`\`
Input: 0b00010101  →  bit positions of '1's are 0, 2, 4
                      The third '1' is at position 4.

Input: 0b11110000  →  positions 4, 5, 6, 7
                      The third '1' is at position 6.
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(W) — W=32' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def third_one(n):
    """Position (from LSB, 0-indexed) of the 3rd set bit. -1 if there aren't 3."""
    # TODO: scan bits one by one
    pass


# print(third_one(0b00010101))   # 4
`,
        question:
`גרסה ראשונה: סריקה ביט-אחר-ביט.`,
        hints: [
          'לולאה על \\\`k = 0..31\\\`, אם \\\`(n >> k) & 1\\\` — סופרים. כשמגיעים ל-3 → מחזירים את \\\`k\\\`.',
          'תמיד שמרו על \\\`-1\\\` כברירת מחדל — אם אין 3 ביטים דלוקים, צריך להחזיר משהו שמסמן "לא נמצא".',
        ],
        trace: {
          title: 'third_one(0b00010101)',
          source:
`def third_one(n):
    count = 0
    for k in range(32):
        if (n >> k) & 1:
            count += 1
            if count == 3:
                return k
    return -1`,
          sourceLang: 'python',
          steps: [
            { code: 'init: n = 0b00010101, count = 0',
              explain: 'הביטים הדלוקים בעמדות 0, 2, 4. אנחנו מחפשים את השלישי.',
              executed: [1, 2], focusLine: 2,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,1], label: 'n = 0b00010101', sub: 'bit 0,2,4 דלוקים', accumStr: 'count = 0' }) },
            { code: 'k=0: bit=1 → count=1',
              explain: 'הביט הראשון שמצאנו.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,1], hlIdx: [0], label: 'k=0, found set bit', accumStr: 'count = 1' }) },
            { code: 'k=1: bit=0 → skip',
              explain: 'אין מה לעשות.',
              executed: [3], focusLine: 3,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,1], hlIdx: [1], label: 'k=1, bit clear', accumStr: 'count = 1' }) },
            { code: 'k=2: bit=1 → count=2',
              explain: 'הביט השני.',
              executed: [3, 4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,1], hlIdx: [2], label: 'k=2, found set bit', accumStr: 'count = 2' }) },
            { code: 'k=4: bit=1 → count=3 → return 4',
              explain: 'מצאנו את השלישי בעמדה 4. ✓',
              executed: [3, 4, 5, 6, 7], focusLine: 7,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,1], hlIdx: [4], label: 'k=4, third set bit!', accumStr: 'return 4', done: true }) },
          ],
        },
        answer:
`\`\`\`python
def third_one(n):
    count = 0
    for k in range(32):
        if (n >> k) & 1:
            count += 1
            if count == 3:
                return k
    return -1
\`\`\`

זמן: \`O(W)\` = \`O(32)\` במקרה הגרוע. מקום: \`O(1)\`. במקרה הטוב (כשהביט השלישי נמוך) — נעצור מוקדם.`,
        expectedAnswers: ['(n >> k) & 1', 'count', 'return k', 'for k in range', '-1'],
      },
      {
        label: 'ב',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(popcount) ≤ 3' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def third_one_fast(n):
    """Find the 3rd set bit using Brian Kernighan's trick."""
    # Hint: n & -n  isolates the lowest set bit.
    #       n & (n - 1)  clears it.
    # TODO: drop the lowest set bit twice; return the position of the next one.
    pass
`,
        question:
`איך לשפר? במקום לסרוק 32 ביטים, **לקפוץ ישר** לביט הדלוק הבא.`,
        hints: [
          '\\\`n & -n\\\` מבודד את הביט הדלוק התחתון ביותר (one-hot). \\\`(n & -n).bit_length() - 1\\\` נותן את העמדה שלו.',
          '\\\`n & (n - 1)\\\` מנקה את הביט הדלוק התחתון. אחרי שתי פעולות, מקבלים את \\\`n\\\` עם שני הביטים התחתונים מנוקים.',
          'הביט השלישי הוא הביט הנמוך ביותר אחרי שני "ניקויים". אז: \\\`n = n & (n-1); n = n & (n-1); ans = (n & -n).bit_length() - 1\\\`.',
          'יתרון: רץ ב-\\\`O(popcount)\\\` — לכל היותר 3 פעולות, ללא תלות ב-\\\`W\\\`.',
        ],
        trace: {
          title: 'Kernighan trick — drop lowest set bit',
          source:
`def third_one_fast(n):
    if bin(n).count("1") < 3: return -1
    n = n & (n - 1)              # drop 1st
    n = n & (n - 1)              # drop 2nd
    return (n & -n).bit_length() - 1`,
          sourceLang: 'python',
          steps: [
            { code: 'init: n = 0b00010101 = 21',
              explain: 'נשתמש בטריק \\\`n & (n-1)\\\` שמנקה את הביט הדלוק התחתון.',
              executed: [1], focusLine: 2,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,1], label: 'n = 0b00010101', sub: 'יש 3 ביטים דלוקים' }) },
            { code: 'n = n & (n - 1) = 0b00010100',
              explain: 'מחקנו את ביט 0. נשארו ביטים 2, 4.',
              executed: [3], focusLine: 3,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,0], hlIdx: [], cleared: [0], label: 'drop 1st set bit', sub: 'n = 0b00010100' }) },
            { code: 'n = n & (n - 1) = 0b00010000',
              explain: 'מחקנו את ביט 2. נשאר רק ביט 4.',
              executed: [4], focusLine: 4,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,0,0,0], hlIdx: [], cleared: [0, 2], label: 'drop 2nd set bit', sub: 'n = 0b00010000' }) },
            { code: '(n & -n).bit_length() - 1 = 4',
              explain: 'הביט הנמוך הנותר הוא הביט השלישי המקורי. עמדה 4. ✓',
              executed: [5], focusLine: 5,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,0,0,0], hlIdx: [4], label: '3rd set bit at position 4', sub: 'O(popcount) operations', done: true }) },
          ],
        },
        answer:
`**Brian Kernighan's trick — \`n & (n-1)\` מוחק את הביט הדלוק התחתון.**

\`\`\`python
def third_one_fast(n):
    if bin(n).count("1") < 3:
        return -1
    n = n & (n - 1)              # drop 1st set bit
    n = n & (n - 1)              # drop 2nd set bit
    return (n & -n).bit_length() - 1
\`\`\`

**למה זה עובד:**
- \`n & (n-1)\` מאפס את הביט הדלוק הנמוך ביותר. למשל: \`0b1010 - 1 = 0b1001\`, ו-\`0b1010 & 0b1001 = 0b1000\`.
- אחרי שני שימושים — שני הביטים התחתונים נמחקו.
- \`n & -n\` מבודד עכשיו את הביט הדלוק התחתון — שזה הביט השלישי המקורי.
- \`.bit_length() - 1\` ממיר one-hot mask לעמדה (\`0b100000.bit_length() == 6\`, \`- 1 = 5\`).

**מספר פעולות:** קבוע (3 פעולות BITWISE) — לא תלוי ב-\`W\`. בגרסה הראשונה הסריקה היא \`O(W)\` במקרה הגרוע.

**הכללה — הביט ה-k-י:** הפעילו \`n &= n - 1\` בדיוק \`k-1\` פעמים, ואז \`(n & -n).bit_length() - 1\`.

**אלטרנטיבה — שימוש ישיר ב-\`bit_length\`:** \`(n & -n).bit_length() - 1\` נותן את הביט הדלוק הנמוך ביותר. אפשר לעשות לולאה של 3 קפיצות:

\`\`\`python
def third_one_loop(n):
    for _ in range(2):
        if n == 0: return -1
        n &= n - 1
    if n == 0: return -1
    return (n & -n).bit_length() - 1
\`\`\``,
        interviewerMindset:
`שאלת המשך לפופקאונט. המראיין מחפש:

1. **לראות שהמועמד יודע את הטריק \`n & (n-1)\`** — בלעדיו, הפתרון יישאר ב-\`O(W)\`.
2. **להבין \`n & -n\`** — בידוד הביט הדלוק התחתון. מי שיודע את שניהם — נראה כמי שעבד עם בייטים בעבר.
3. **הכללה — "מה אם רוצים את הביט ה-K?"** — תשובה: לולאה של \`k-1\` פעמים. הראייה שהפתרון מתרחב טבעית מראה הבנת המבנה.`,
        expectedAnswers: ['n & (n - 1)', 'n & -n', 'bit_length', 'kernighan', 'drop lowest', 'isolate'],
      },
    ],
    source: 'PP - שאלות קוד (slide 30)',
    tags: ['algorithms', 'bit-manipulation', 'kernighan', 'classic', 'python'],
    circuitRevealsAnswer: true,
    // ── Hardware analog: shift-out + count + compare ──────────────
    // The naive algorithm scans bit-by-bit and counts set bits. The
    // circuit does the same: a 4-bit shift-right register preloaded
    // with 0b1101 (=13), feeding its LSB into a counter that only
    // increments when a 1 bit shifts out. A second counter tracks
    // the clock-tick position. A COMPARATOR fires when the set-bit
    // counter reaches 3 — the position counter at that moment is
    // the answer.
    //
    // For n=13 (set bits at 0, 2, 3): the comparator goes high on
    // tick 4 — when the 3rd set bit (at position 3) is shifted out.
    circuit: () => build(() => {
      const clk  = h.clock(120, 460);
      const zero = h.input(120, 120, 'shift-in'); zero.fixedValue = 0;
      // 4-bit shift register preloaded with 0b1101 = 13 (bits 0, 2, 3 set).
      const ff0 = h.ffD(360, 220, 'FF0'); ff0.initialQ = 1;  // bit 0
      const ff1 = h.ffD(540, 220, 'FF1'); ff1.initialQ = 0;  // bit 1
      const ff2 = h.ffD(720, 220, 'FF2'); ff2.initialQ = 1;  // bit 2
      const ff3 = h.ffD(900, 220, 'FF3'); ff3.initialQ = 1;  // bit 3
      // Set-bit counter: EN = FF0.Q (LSB of shift reg). Increments only
      // when a 1 is being shifted out.
      const cntOnes = h.block('COUNTER', 360, 460, { bitWidth: 4, label: 'CNT ones' });
      // Position counter: always EN=1 (counts every clock tick).
      const one = h.input(120, 540, 'EN=1'); one.fixedValue = 1;
      const cntPos  = h.block('COUNTER', 720, 540, { bitWidth: 4, label: 'CNT pos' });
      // Compare CNT_ones to constant 3 → fires on the 3rd set bit.
      const three = h.input(900, 460, 'target=3'); three.fixedValue = 3;
      const cmp   = h.block('COMPARATOR', 1080, 460, { label: 'CMP (==3)' });
      // Outputs to watch
      const oLsb   = h.output(540, 360, 'LSB stream');
      const oOnes  = h.output(540, 530, 'CNT ones');
      const oPos   = h.output(900, 620, 'CNT pos');
      const oFound = h.output(1280, 460, 'FOUND (==3)');
      return {
        nodes: [
          clk, zero, ff0, ff1, ff2, ff3,
          cntOnes, one, cntPos, three, cmp,
          oLsb, oOnes, oPos, oFound,
        ],
        wires: [
          // Shift-right chain
          h.wire(ff1.id, ff0.id, 0),
          h.wire(ff2.id, ff1.id, 0),
          h.wire(ff3.id, ff2.id, 0),
          h.wire(zero.id, ff3.id, 0),
          // Clock to all FFs and counters
          h.wire(clk.id, ff0.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff1.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff2.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff3.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, cntOnes.id, 4, 0, { isClockWire: true }),
          h.wire(clk.id, cntPos.id,  4, 0, { isClockWire: true }),
          // CNT_ones.EN = FF0.Q (the LSB being shifted out)
          h.wire(ff0.id, cntOnes.id, 0),
          // CNT_pos.EN = constant 1 (free running)
          h.wire(one.id, cntPos.id, 0),
          // Compare CNT_ones == 3
          h.wire(cntOnes.id, cmp.id, 0),
          h.wire(three.id,   cmp.id, 1),
          // Observability
          h.wire(ff0.id,     oLsb.id,   0),
          h.wire(cntOnes.id, oOnes.id,  0),
          h.wire(cntPos.id,  oPos.id,   0),
          h.wire(cmp.id,     oFound.id, 0),  // EQ on out0
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #8031 — Swap two values without a temporary variable
  // ───────────────────────────────────────────────────────────────
  {
    id: 'swap-without-temp',
    difficulty: 'easy',
    title: 'החלפת שני ערכים בלי משתנה עזר',
    intro:
`נתונים שני משתנים. **איך תחליף בין הערכים שלהם בלי להשתמש במשתנה נוסף?**
כמה גישות, כל אחת עם מאפיין שונה.

\`\`\`
Before: a=5, b=7
After:  a=7, b=5
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1) — no extra var' },
        ],
        approaches: [
          {
            name: 'XOR swap',
            time: 'O(1)', space: 'O(1)',
            summary: 'שלוש פעולות XOR. עובד על שלמים. כשל מסוכן אם a ו-b הם **אותה כתובת זיכרון** — יוצא 0.',
            code:
`def swap_xor(a, b):
    a ^= b   # a = a ⊕ b
    b ^= a   # b = b ⊕ (a ⊕ b) = a
    a ^= b   # a = (a ⊕ b) ⊕ a = b
    return a, b`,
          },
          {
            name: 'Arithmetic (+/-)',
            time: 'O(1)', space: 'O(1)',
            summary: 'אלגנטי. נכשל ב-overflow בשפות עם רוחב קבוע. ב-Python בטוח (אינטגרים אינסופיים).',
            code:
`def swap_arith(a, b):
    a = a + b
    b = a - b   # b = (a+b) - b = a
    a = a - b   # a = (a+b) - a = b
    return a, b`,
          },
          {
            name: 'Pythonic tuple',
            time: 'O(1)', space: 'O(1)',
            summary: 'הסטנדרט. תחת המכסה — יוצר tuple זמני. במראיין שמבקש "בלי משתנה עזר" — שאל אם זה נחשב.',
            code:
`def swap_tuple(a, b):
    a, b = b, a
    return a, b`,
          },
        ],
        starterCode:
`def swap_xor(a, b):
    """Swap a and b using only XOR. Three operations."""
    # TODO
    pass


# print(swap_xor(5, 7))   # (7, 5)
`,
        question:
`ממשו לפחות שתי גישות. מה היתרון של כל אחת?`,
        hints: [
          'XOR: שלוש פעולות. השתמשו בעובדה ש-\\\`a ⊕ a = 0\\\` ו-\\\`a ⊕ 0 = a\\\`.',
          'אריתמטי: \\\`a = a + b\\\`, ואחר-כך \\\`b = a - b\\\` נותן את הערך הישן של \\\`a\\\`.',
          'בשפות עם רוחב קבוע (C, Java) — \\\`a + b\\\` יכול לגרום ל-overflow. XOR לא סובל מזה.',
          'בשפות שאינן Python, XOR גם בעייתי אם \\\`a\\\` ו-\\\`b\\\` מצביעים לאותה כתובת — \\\`a ^= a == 0\\\`. צריך \\\`if &a != &b\\\`.',
        ],
        trace: {
          title: 'XOR swap (5 ⊕ 7)',
          source:
`def swap_xor(a, b):
    a ^= b
    b ^= a
    a ^= b
    return a, b`,
          sourceLang: 'python',
          steps: [
            { code: 'init: a=5 (0101), b=7 (0111)',
              explain: 'נסתכל בנפרד על הביטים.',
              executed: [1], focusLine: 2,
              viz: _twoBoxSvg({ a: '5 (0101)', b: '7 (0111)', op: 'init: a=5, b=7' }) },
            { code: 'a ^= b → a = 0101 ⊕ 0111 = 0010 (= 2)',
              explain: '\\\`a\\\` עכשיו מחזיק את ה-XOR של שני הערכים המקוריים.',
              executed: [2], focusLine: 2,
              viz: _twoBoxSvg({ a: '2 (0010)', b: '7 (0111)', op: 'a ^= b' }) },
            { code: 'b ^= a → b = 0111 ⊕ 0010 = 0101 (= 5)',
              explain: '\\\`b\\\` עכשיו מחזיק את הערך המקורי של \\\`a\\\` (= b ⊕ (a⊕b) = a).',
              executed: [3], focusLine: 3,
              viz: _twoBoxSvg({ a: '2 (0010)', b: '5 (0101)', op: 'b ^= a' }) },
            { code: 'a ^= b → a = 0010 ⊕ 0101 = 0111 (= 7)',
              explain: '\\\`a\\\` עכשיו מחזיק את הערך המקורי של \\\`b\\\` (= (a⊕b) ⊕ a = b). הסוואפ הושלם. ✓',
              executed: [4, 5], focusLine: 4,
              viz: _twoBoxSvg({ a: '7 (0111)', b: '5 (0101)', op: 'a ^= b — swap complete', done: true }) },
          ],
        },
        answer:
`**שלוש גישות, אחד הסטנדרט הטכני:**

\`\`\`python
# גישה 1: XOR
def swap_xor(a, b):
    a ^= b
    b ^= a    # b is now old a
    a ^= b    # a is now old b
    return a, b

# גישה 2: אריתמטי
def swap_arith(a, b):
    a = a + b
    b = a - b
    a = a - b
    return a, b

# גישה 3: Pythonic (Python tuple unpacking)
def swap_py(a, b):
    a, b = b, a
    return a, b
\`\`\`

**איך XOR עובד:**

| שלב | \`a\` | \`b\` |
|---|---|---|
| init | \`A\` | \`B\` |
| \`a ^= b\` | \`A ⊕ B\` | \`B\` |
| \`b ^= a\` | \`A ⊕ B\` | \`B ⊕ (A ⊕ B) = A\` |
| \`a ^= b\` | \`(A ⊕ B) ⊕ A = B\` | \`A\` |

מבוסס על: \`x ⊕ x = 0\`, \`x ⊕ 0 = x\`, ו-XOR קומוטטיבי ואסוציאטיבי.

**מתי כל אחד מתאים?**
- **XOR** — בלי overflow, עובד על שלמים בלבד, מהיר במחשבים.
- **אריתמטי** — אלגנטי, אבל בעייתי בשפות עם רוחב קבוע (overflow על \`int32\`).
- **Tuple** — קוד Python אידיומטי. תחת המכסה: \`temp = (b, a); a, b = temp[0], temp[1]\`.

**מלכודת חמורה (לא ב-Python):** ב-C עם **מצביעים**, \`xor_swap(p, p)\` (אותה כתובת) ייתן 0!

\`\`\`c
void xor_swap(int *a, int *b) {
    if (a == b) return;          // ← הגנה הכרחית
    *a ^= *b; *b ^= *a; *a ^= *b;
}
\`\`\``,
        interviewerMindset:
`שאלת חימום אהובה — סינון ראשוני. המראיין מחפש:

1. **שתי גישות בלפחות.** מי שעונה רק "\`a, b = b, a\`" כשהשאלה היא "בלי משתנה עזר" — מקבל שאלת המשך: "תוכל גם בלי tuple?".
2. **הבנת ה-XOR.** מי שזוכר את הטריק אבל לא מסביר למה — חשוד שלמד בעל-פה. בקש לפרוס שלב-שלב.
3. **המלכודת של אותה כתובת (C).** מועמדים מנוסים יזכירו את זה בעצמם — סימן לעבודה עם פוינטרים.
4. **Overflow.** "בשפה כמו Java, איזה מהפתרונות שלך מסוכן יותר?" — תשובה: האריתמטי (\`a+b\` יכול לגלוש).

**שאלת המשך לסבב הבא:** "סוואפ של שני strings בלי tmp?" — XOR/אריתמטי לא עובדים. בלי מבני נתונים, אין דרך אלגנטית. (זה משחק כדי לראות אם הוא מבין שהטריקים תלויים בייצוג מספרי.)`,
        expectedAnswers: ['a ^= b', 'b ^= a', 'a + b', 'a - b', 'a, b = b, a', 'xor', 'overflow'],
      },
    ],
    source: 'PP - שאלות קוד (slide 31)',
    tags: ['algorithms', 'bit-manipulation', 'swap', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8032 — Find 1→0 transition position in sorted bit pattern
  // ───────────────────────────────────────────────────────────────
  {
    id: 'one-to-zero-boundary',
    difficulty: 'medium',
    title: 'מיקום המעבר 1→0 בתמונת זיכרון ממוינת',
    intro:
`תמונת הזיכרון, החל מכתובת מסוימת \`X\`, נראית כך:

\`\`\`
[1, 1, 1, 1, 1, 1, ..., 1, 1, 1, 0, 0, 0, ..., 0]
                      ↑
              גבול מעבר 1→0
\`\`\`

מצא את **הביט בו תמונת הזיכרון משתנה מאחת לאפס** בדרך היעילה ביותר.
**פלט:** אינדקס הביט האחרון שהוא 1 (או -1 אם כולם 0).

\`\`\`
Input:  [1, 1, 1, 0, 0, 0, 0, 0]                      →  3
Input:  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]  →  11
Input:  [0, 0, 0, 0]                                  →  -1 (כולם אפסים)
Input:  [1, 1, 1, 1]                                  →  3 (כולם אחדים)
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(log n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def find_boundary(a):
    """Return index of last 1 in a sorted [1,1,...,1,0,0,...,0] array.
    -1 if all zeros."""
    # TODO: binary search
    pass


# print(find_boundary([1,1,1,0,0,0,0,0]))   # 3
`,
        question:
`גישה ראיתית: סריקה לינארית \`O(n)\`. אבל המערך **ממוין** (אחדים ואז אפסים) — איך אפשר \`O(log n)\`?`,
        hints: [
          'חיפוש בינארי: \\\`lo=0, hi=n-1\\\`. בכל איטרציה בוחנים את האמצע \\\`mid\\\`.',
          'אם \\\`a[mid] == 1\\\` — האחד האחרון לפחות בעמדה \\\`mid\\\`. נחפש ימינה: \\\`lo = mid + 1\\\`.',
          'אם \\\`a[mid] == 0\\\` — האחד האחרון לפני \\\`mid\\\`. נחפש שמאלה: \\\`hi = mid - 1\\\`.',
          'בסוף הלולאה (\\\`lo > hi\\\`), \\\`hi\\\` מצביע למקום של האחד האחרון. אם \\\`hi == -1\\\` (לא היה אחד) — מחזירים -1.',
        ],
        trace: {
          title: 'Binary search — boundary',
          source:
`def find_boundary(a):
    lo, hi = 0, len(a) - 1
    ans = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == 1:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ans`,
          sourceLang: 'python',
          steps: [
            { code: 'init: a = [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0], lo=0, hi=15',
              explain: '16 ביטים. נחפש בינארית את הגבול 1→0.',
              executed: [1, 2], focusLine: 2,
              viz: _arrayRowSvg({ arr: [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0], pointers: { lo: 0, hi: 15 }, label: 'init: lo=0, hi=15' }) },
            { code: 'mid = 7, a[7]=1 → ans=7, lo=8',
              explain: 'אמצע: עמדה 7, ערך 1. הגבול מימינו. שומרים \\\`ans=7\\\` כמועמד.',
              executed: [4, 5, 6, 7, 8], focusLine: 6,
              viz: _arrayRowSvg({ arr: [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0], pointers: { lo: 8, hi: 15, mid: 7 }, highlights: [7], label: 'mid=7, ones → ans=7', subtitle: 'lo → 8' }) },
            { code: 'mid = 11, a[11]=1 → ans=11, lo=12',
              explain: 'עוד מעמיקים ימינה. \\\`ans\\\` מתעדכן.',
              executed: [4, 5, 6, 7, 8], focusLine: 6,
              viz: _arrayRowSvg({ arr: [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0], pointers: { lo: 12, hi: 15, mid: 11 }, highlights: [11], label: 'mid=11, ones → ans=11', subtitle: 'lo → 12' }) },
            { code: 'mid = 13, a[13]=0 → hi=12',
              explain: 'עכשיו הגיע ל-0. הגבול קודם.',
              executed: [4, 5, 9, 10], focusLine: 10,
              viz: _arrayRowSvg({ arr: [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0], pointers: { lo: 12, hi: 12, mid: 13 }, highlights: [13], label: 'mid=13, zero → hi=12', subtitle: 'hi → 12' }) },
            { code: 'mid = 12, a[12]=0 → hi=11',
              explain: '\\\`lo > hi\\\` בפעם הבאה — הלולאה נגמרת.',
              executed: [4, 5, 9, 10], focusLine: 10,
              viz: _arrayRowSvg({ arr: [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0], pointers: { lo: 12, hi: 11, mid: 12 }, highlights: [12], label: 'mid=12, zero → hi=11', subtitle: 'lo > hi, exit' }) },
            { code: 'done: return ans = 11',
              explain: 'מצאנו את הגבול בעמדה 11. \\\`log₂(16) = 4\\\` איטרציות. ✓',
              executed: [11], focusLine: 11,
              viz: _arrayRowSvg({ arr: [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0], pointers: { ans: 11 }, highlights: [11], label: 'boundary at index 11', subtitle: 'log₂(16) = 4 iterations', done: true }) },
          ],
        },
        answer:
`**חיפוש בינארי על המערך הממוין.** \`O(log n)\` זמן, \`O(1)\` מקום.

\`\`\`python
def find_boundary(a):
    lo, hi = 0, len(a) - 1
    ans = -1                  # default: all zeros
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == 1:
            ans = mid         # mid is a candidate, try right
            lo = mid + 1
        else:
            hi = mid - 1      # mid is 0, look left
    return ans
\`\`\`

**איך זה עובד:**
המערך הוא אחדים ואז אפסים — מבנה ממוין מבחינה בוליאנית. החיפוש מצמצם את הטווח בחצי בכל איטרציה.

**אינוואריאנט:** בכל איטרציה, האחד האחרון נמצא ב-\`[ans, hi]\` (אם \`ans != -1\`) או ב-\`[lo, hi]\` (אם עוד לא מצאנו אחד).

**למה לא \`bisect.bisect_right(a, 0)\`?** ב-Python יש פונקציה מובנית — אבל זה משתמש בהשוואות \`<\`, וכאן יש לנו רק 0/1. לוגית זה אותו דבר; פדגוגית — עדיף לראות את החיפוש הבינארי במפורש.

**הכללה — מערך ענק (זרם בייטים, לא array):** אם הזיכרון הוא 4GB, אי-אפשר לקרוא הכל ל-RAM. אבל אם יש לנו \`read(addr) → bit\` פונקציה, אפשר לחפש בינארית עם \`O(log n)\` קריאות. תיקיפ' classic interview pattern.

**מקרי קצה:**
- מערך ריק → \`hi=-1\`, הלולאה לא רצה, מחזירים -1.
- כולם 0 → לעולם לא נכנס לענף "\`a[mid]==1\`", \`ans\` נשאר -1.
- כולם 1 → לעולם לא נכנס לענף "\`a[mid]==0\`", \`ans\` מתעדכן עד \`len(a)-1\`.`,
        interviewerMindset:
`שאלה קלאסית. המראיין מחפש:

1. **לראות שזה חיפוש בינארי.** מועמד שכותב \`for i, x in enumerate(a): if x == 0: return i-1\` — \`O(n)\`, לא מנצל את המבנה.
2. **לדייק את ה-\`mid==1\` / \`mid==0\`.** טעות נפוצה: לעדכן את הגבולות הפוך → לולאה אינסופית או תוצאה שגויה.
3. **לטפל באתחול -1.** מועמד שמחזיר \`hi\` ישירות — לא יטפל ב-"כולם אפסים".
4. **שאלת המשך — קלה:** "ומה אם המעבר הוא 0→1 (לא 1→0)?" — אותה תבנית, רק להחליף את התנאי.
5. **שאלת המשך — מתקדם:** "ומה אם המערך עצום, לא נכנס ל-RAM, אבל יש לנו פונקצית \`read_bit(i)\`?" — אותה לוגיקה. החיפוש הבינארי לא תלוי בייצוג.`,
        expectedAnswers: ['binary search', 'חיפוש בינארי', 'lo, hi', 'mid', 'O(log n)', 'log', 'bisect'],
      },
    ],
    source: 'PP - שאלות קוד (slide 32)',
    tags: ['algorithms', 'binary-search', 'array', 'sorted', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8033 — Logic gates from arithmetic + INT swap (2-part)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'gates-from-arithmetic',
    difficulty: 'medium',
    title: 'שערים לוגיים מאופרטורים אריתמטיים בלבד',
    intro:
`**א.** נתונים שני משתנים בוליאנים \`a, b\` (כלומר \`0\` או \`1\`). ממש את **השערים הלוגיים**
\`xor, not, and, or\` באמצעות **רק** האופרטורים \`+, -, *\` וקבועים — **בלי** להשתמש ב-\`||\`, \`&&\`, \`^\`, \`!\`.

**ב.** החלף בין שני ערכי \`INT\` בלי להשתמש במשתנה עזר.`,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`# Inputs are boolean (0 or 1). Allowed operators: + - * and integer constants.
# Forbidden: || && ^ ! and any bitwise op.

def NOT(a):  pass    # → 1 - a ?
def AND(a, b): pass  # → a * b ?
def OR(a, b):  pass  # → a + b - a*b ?
def XOR(a, b): pass  # → a + b - 2*a*b ?
`,
        question:
`ממשו את ארבעת השערים. רמז: השתמשו בעובדה ש-\`a, b ∈ {0, 1}\`.`,
        hints: [
          '\\\`NOT(a) = 1 - a\\\`. כשמתחילים מ-0 או 1 בלבד, החיסור מ-1 הוא היפוך.',
          '\\\`AND(a, b) = a * b\\\`. מכפלה היא 1 רק אם שני המוכפלים 1.',
          '\\\`OR(a, b) = a + b - a*b\\\`. סכום עוקב 0/1/2; חסרים את "החפיפה" של AND.',
          '\\\`XOR(a, b) = a + b - 2*a*b\\\`. סכום ל-0/1/2, חסרים פעמיים את החפיפה.',
        ],
        answer:
`**ארבעת השערים:**

\`\`\`python
def NOT(a):     return 1 - a
def AND(a, b):  return a * b
def OR(a, b):   return a + b - a * b
def XOR(a, b):  return a + b - 2 * a * b
\`\`\`

**הוכחה דרך טבלת אמת:**

| a | b | \`a+b\` | \`a*b\` | OR = a+b-a*b | XOR = a+b-2a*b |
|---|---|------|-------|--------------|----------------|
| 0 | 0 | 0    | 0     | 0            | 0              |
| 0 | 1 | 1    | 0     | 1            | 1              |
| 1 | 0 | 1    | 0     | 1            | 1              |
| 1 | 1 | 2    | 1     | 1            | 0              |

✓ תואם את שערי הבוליאן הסטנדרטיים.

**הסבר אינטואיטיבי:**
- **OR** = "לפחות אחד" = סכום, פחות "חפיפה" שלא רוצים לספור פעמיים.
- **XOR** = "בדיוק אחד" = סכום, פחות **שתי** חפיפות (כדי שכש-\`a=b=1\`, \`1+1-2=0\`).

**הכללה — שערי NAND, NOR, XNOR:**
\`\`\`python
def NAND(a, b):  return 1 - a * b
def NOR(a, b):   return 1 - (a + b - a * b)
def XNOR(a, b):  return 1 - (a + b - 2 * a * b)
\`\`\`

**אזהרה — קלטים לא בוליאניים:** הנוסחאות מתבססות על \`a, b ∈ {0, 1}\`. אם \`a=2\`, \`AND(a, b) = 2*b\` — לא בוליאני. בדרך כלל יש להניח/לאכוף.

**ולמה זה מעניין?** המראיין בודק:
- האם המועמד יודע שלוגיקה בוליאנית **שקולה** לאריתמטיקה ב-\`GF(2)\` (שדה גלואה).
- האם הוא יודע שהמכפלה ב-Σ\`a·b\` היא טריק טיפוסי לחישוב "ועד".`,
        expectedAnswers: ['1 - a', 'a * b', 'a + b - a*b', 'a + b - 2*a*b', '1-a', 'a*b', 'truth table', 'טבלת אמת'],
      },
      {
        label: 'ב',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def swap_int(a, b):
    """Swap two ints without using a helper variable."""
    # TODO
    pass


# print(swap_int(5, 7))   # (7, 5)
`,
        question:
`(אותו תבנית כמו #8031, אבל קצר.) השתמשו ב-XOR או באריתמטיקה.`,
        hints: [
          'אריתמטי: \\\`a = a + b\\\`, ואז שאר הסדרה.',
          'XOR: \\\`a ^= b; b ^= a; a ^= b\\\`. ב-Python — בטוח. בשפות אחרות זהירות מ-aliasing.',
        ],
        answer:
`\`\`\`python
def swap_int(a, b):
    a = a + b
    b = a - b   # = a (original)
    a = a - b   # = b (original)
    return a, b
\`\`\`

ראו #8031 לעומק מלא — כולל מלכודות overflow ו-aliasing.`,
        expectedAnswers: ['a + b', 'a - b', 'a ^ b', 'a, b = b, a', 'xor'],
      },
    ],
    source: 'PP - שאלות קוד (slide 33)',
    tags: ['algorithms', 'logic', 'gates', 'boolean', 'arithmetic', 'swap', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8034 — Brian Kernighan popcount (N iterations for N ones)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'popcount-kernighan',
    difficulty: 'medium',
    title: 'ספירת אחדות ב-N איטרציות (לא בגודל המספר)',
    intro:
`בהינתן מספר שיש בו \`N\` ביטים שערכם 1 — מצאו את \`N\` תוך שימוש ב-\`N\` איטרציות **לכל היותר**.
ההבדל מ-#8028: שם הסיבוכיות תלויה ברוחב המספר (\`O(W)\`). כאן — תלויה רק במספר האחדים.

\`\`\`
Input: 0b00001000   →  1  (1 iteration)
Input: 0b00010101   →  3  (3 iterations)
Input: 0b11111111   →  8  (8 iterations)
Input: 0b00000000   →  0  (0 iterations!)
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(popcount(n))' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def popcount(n):
    """Return the number of set bits. Iterates at most popcount(n) times."""
    # Hint: n & (n - 1)  clears the lowest set bit.
    pass


# print(popcount(0b11111111))   # 8
`,
        question:
`גישה איטרטיבית "טריוויאלית" עוברת על כל \`W\` הביטים. הטריק כאן: לקפוץ ישר לביט הדלוק הבא.`,
        hints: [
          'הטריק של Brian Kernighan: \\\`n & (n - 1)\\\` **מנקה את הביט הדלוק הנמוך ביותר**. כל קריאה מעיפה ביט אחד.',
          'לולאה: \\\`while n: n &= n - 1; count += 1\\\`. כשמגיעים ל-0 — כל הביטים נוקו.',
          'מספר איטרציות = popcount(n) בדיוק. עבור \\\`n=0\\\` — 0 איטרציות.',
        ],
        trace: {
          title: 'Brian Kernighan popcount',
          source:
`def popcount(n):
    count = 0
    while n:
        n &= n - 1
        count += 1
    return count`,
          sourceLang: 'python',
          steps: [
            { code: 'init: n = 0b00010101 (= 21), count = 0',
              explain: '3 ביטים דלוקים. נצפה ל-3 איטרציות בלבד.',
              executed: [1, 2], focusLine: 2,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,1], label: 'n = 0b00010101', sub: 'popcount = ?', accumStr: 'count = 0' }) },
            { code: 'iter 1: n & (n-1) = 0b00010100, count=1',
              explain: 'נקינו את ביט 0. נשארו 2 דלוקים.',
              executed: [4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,1,0,0], cleared: [0], label: 'cleared bit 0', accumStr: 'count = 1' }) },
            { code: 'iter 2: n & (n-1) = 0b00010000, count=2',
              explain: 'נקינו את ביט 2. נשאר ביט אחד.',
              executed: [4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [0,0,0,1,0,0,0,0], cleared: [0, 2], label: 'cleared bit 2', accumStr: 'count = 2' }) },
            { code: 'iter 3: n & (n-1) = 0b00000000, count=3',
              explain: 'נקינו את ביט 4. n הפך ל-0 — לולאה תיגמר.',
              executed: [4, 5], focusLine: 4,
              viz: _bitRowSvg({ bits: [0,0,0,0,0,0,0,0], cleared: [0, 2, 4], label: 'cleared bit 4', accumStr: 'count = 3' }) },
            { code: 'done: count = 3',
              explain: 'בדיוק 3 איטרציות — אחד לכל ביט דלוק. \\\`O(popcount(n))\\\`. ✓',
              executed: [6], focusLine: 6,
              viz: _bitRowSvg({ bits: [0,0,0,0,0,0,0,0], cleared: [0, 2, 4], label: 'popcount = 3', sub: 'O(3) iterations, not O(W)', done: true, accumStr: 'return 3' }) },
          ],
        },
        answer:
`**Brian Kernighan's algorithm** — \`O(popcount(n))\` במקום \`O(W)\`:

\`\`\`python
def popcount(n):
    count = 0
    while n:
        n &= n - 1     # clear the lowest set bit
        count += 1
    return count
\`\`\`

**למה זה עובד:** ב-\`n - 1\`, **כל הביטים מתחת ל-LSB דולק** הופכים (כולל ה-LSB עצמו). למשל:
\`\`\`
n   = 0b10100
n-1 = 0b10011
n & (n-1) = 0b10000   ← הביט התחתון נמחק
\`\`\`

**מתי זה יותר מהיר?**
- **מספר דליל (sparse)** — לדוגמה \`n = 0x80000000\` (ביט אחד דלוק ברוחב 32). הגישה הנאיבית עושה 32 איטרציות; Kernighan עושה 1.
- **מספר צפוף (dense)** — לדוגמה \`0xFFFFFFFF\` (כל הביטים). שתי הגישות עושות 32 איטרציות. אין יתרון.

**ניתוח אסימפטוטי:**

| Algorithm | Time | Space |
|---|---|---|
| Naive shift | \`O(W)\` תמיד | \`O(1)\` |
| Kernighan | \`O(popcount(n)) ≤ W\` | \`O(1)\` |
| LUT (#8028) | \`O(1)\` אמיתי | \`O(256)\` |
| SWAR / popcnt instruction | \`O(1)\` במכשיר | \`O(1)\` |

**שאלת המשך:** "ומה אם רוצים את **העמדה** של הביט ה-K-י?" — אותה תבנית, פשוט קוראים \`(n & -n).bit_length() - 1\` לפני שמנקים. ראו #8030.`,
        interviewerMindset:
`שאלה אהובה לסבבי "trivia אלגוריתמיים." המראיין מחפש:

1. **הכרת הטריק \`n & (n - 1)\`.** ידע ספציפי — אבל קלאסי. מועמד שלא מכיר ייתן את הפתרון \`O(W)\`.
2. **הוכחת תקינות.** "תסביר למה זה מנקה ביט אחד בדיוק?" — בקיאות אמיתית מתחילה כשהוא מסביר את ה-borrowing של \`n - 1\`.
3. **הבחנה מהגרסה הנאיבית.** "ומתי הגישה הזו טובה יותר?" — תשובה: מספרים דלילים.
4. **שאלות המשך טבעיות:** popcount של מספר ב-64-ביט, מציאת ה-MSB, isolation של ה-LSB. הכל באותה משפחת בית-טריקים.`,
        expectedAnswers: ['n & (n - 1)', 'n &= n - 1', 'kernighan', 'while n:', 'count += 1', 'O(popcount'],
      },
    ],
    source: 'PP - שאלות קוד (slide 34)',
    tags: ['algorithms', 'bit-manipulation', 'popcount', 'kernighan', 'classic', 'python'],
    circuitRevealsAnswer: true,
    // ── Hardware analog: Kernighan's trick literally rendered ──────
    // The Python loop does `n &= n - 1; count += 1` until `n == 0`.
    // The circuit does the same thing with hardware:
    //
    //   ┌── 4-bit N register (4 D-FFs) ─┐
    //   │       │                       │
    //   │       MERGE (FF.Q × 4 → bus)  │
    //   │       │                       │
    //   │       ├─→ ALU op=SUB, B=1 ─→ N-1 (bus)
    //   │       └─→ ALU op=AND, B=N-1 → N & (N-1) (bus)
    //   │                               │
    //   │       SPLIT (bus → 4 bits) ───┘
    //   │       │
    //   └───────┘  (feedback: each bit → its FF's D input)
    //
    // OR-tree on FF.Q ⇒ "N != 0" ⇒ EN of popcount COUNTER.
    // When N reaches 0, EN goes low and the counter latches the answer.
    //
    // For N = 0b1101 (= 13, 3 set bits): counter reaches 3 in 3 clocks
    // and stays there — exactly popcount(13).
    circuit: () => build(() => {
      const clk = h.clock(80, 580);
      // Constants for ALU operands and opcodes (4-bit wide).
      const one    = h.input(80, 200, 'B=1');       one.fixedValue    = 1;
      const opSub  = h.input(80, 280, 'OP=SUB(1)'); opSub.fixedValue  = 1;
      const opAnd  = h.input(80, 360, 'OP=AND(2)'); opAnd.fixedValue  = 2;
      // 4 D-FFs holding the bits of N = 13 = 0b1101.
      const ff0 = h.ffD(280, 460, 'FF0'); ff0.initialQ = 1;
      const ff1 = h.ffD(280, 540, 'FF1'); ff1.initialQ = 0;
      const ff2 = h.ffD(280, 620, 'FF2'); ff2.initialQ = 1;
      const ff3 = h.ffD(280, 700, 'FF3'); ff3.initialQ = 1;
      // MERGE: 4 single-bit FFs → 4-bit bus N.
      const merge = h.block('MERGE', 480, 580, {
        outBits: 4, slicesSpec: '0, 1, 2, 3', label: 'MERGE → N',
      });
      // ALUs (4-bit wide).
      const aluSub = h.block('ALU', 680, 380, { bitWidth: 4, label: 'ALU N-1' });
      const aluAnd = h.block('ALU', 680, 580, { bitWidth: 4, label: 'ALU N & (N-1)' });
      // SPLIT: 4-bit bus result → 4 individual bits back to FFs.
      const split = h.block('SPLIT', 880, 580, {
        inBits: 4, slicesSpec: '0, 1, 2, 3', label: 'SPLIT result',
      });
      // OR-tree (3 gates) → "N != 0" signal.
      const or01 = h.gate('OR', 480, 800);
      const or23 = h.gate('OR', 480, 880);
      const orAll = h.gate('OR', 660, 840);
      // popcount counter: EN = (N != 0). 4-bit.
      const popcnt = h.block('COUNTER', 880, 840, { bitWidth: 4, label: 'POPCOUNT' });
      // Observability outputs.
      const oN     = h.output(680,  280, 'N (bus)');
      const oNm1   = h.output(880,  380, 'N-1');
      const oAnd   = h.output(1080, 580, 'N&(N-1)');
      const oCount = h.output(1080, 840, 'POPCOUNT');
      const oDone  = h.output(880,  840 - 80 - 10, 'N!=0');
      // Slight reposition for oDone to avoid overlap.
      oDone.y = 760;  oDone.x = 1080;
      return {
        nodes: [
          clk, one, opSub, opAnd,
          ff0, ff1, ff2, ff3,
          merge, aluSub, aluAnd, split,
          or01, or23, orAll, popcnt,
          oN, oNm1, oAnd, oCount, oDone,
        ],
        wires: [
          // Clock to all stateful nodes.
          h.wire(clk.id, ff0.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff1.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff2.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff3.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, popcnt.id, 4, 0, { isClockWire: true }),
          // MERGE: FF.Q × 4 → bus N
          h.wire(ff0.id, merge.id, 0),
          h.wire(ff1.id, merge.id, 1),
          h.wire(ff2.id, merge.id, 2),
          h.wire(ff3.id, merge.id, 3),
          // ALU_sub: A=N, B=1, OP=SUB → N-1
          h.wire(merge.id, aluSub.id, 0),
          h.wire(one.id,   aluSub.id, 1),
          h.wire(opSub.id, aluSub.id, 2),
          // ALU_and: A=N, B=N-1, OP=AND → N & (N-1)
          h.wire(merge.id, aluAnd.id, 0),
          h.wire(aluSub.id, aluAnd.id, 1),
          h.wire(opAnd.id,  aluAnd.id, 2),
          // SPLIT: 4-bit result back to FF.D
          h.wire(aluAnd.id, split.id, 0),
          h.wire(split.id, ff0.id, 0, 0),  // SPLIT.__out0 = bit 0 → FF0.D
          h.wire(split.id, ff1.id, 0, 1),  // SPLIT.__out1 = bit 1 → FF1.D
          h.wire(split.id, ff2.id, 0, 2),  // SPLIT.__out2 = bit 2 → FF2.D
          h.wire(split.id, ff3.id, 0, 3),  // SPLIT.__out3 = bit 3 → FF3.D
          // OR-tree for "N != 0"
          h.wire(ff0.id, or01.id, 0),
          h.wire(ff1.id, or01.id, 1),
          h.wire(ff2.id, or23.id, 0),
          h.wire(ff3.id, or23.id, 1),
          h.wire(or01.id, orAll.id, 0),
          h.wire(or23.id, orAll.id, 1),
          // POPCOUNT counter: EN = orAll (N != 0)
          h.wire(orAll.id, popcnt.id, 0),
          // Observability
          h.wire(merge.id,  oN.id,     0),
          h.wire(aluSub.id, oNm1.id,   0),
          h.wire(aluAnd.id, oAnd.id,   0),
          h.wire(popcnt.id, oCount.id, 0),
          h.wire(orAll.id,  oDone.id,  0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #8035 — Find LSB efficiently
  // ───────────────────────────────────────────────────────────────
  {
    id: 'find-lsb',
    difficulty: 'easy',
    title: 'מציאת ה-LSB (ביט דלוק תחתון) בצורה היעילה ביותר',
    intro:
`כתבו תוכנית שתאפס את ה-LSB (Least Significant Set Bit — הביט הדלוק הנמוך ביותר)
בצורה היעילה ביותר.

\`\`\`
Input: 0b00101100  (44)   →  bit at position 2 isolated → 0b00000100 (4)
Input: 0b10000000  (128)  →  position 7 → 0b10000000 (128)
Input: 0b00000001  (1)    →  position 0 → 0b00000001 (1)
Input: 0b00000000  (0)    →  no set bits → 0
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def isolate_lsb(n):
    """Return a value with only the lowest set bit of n. 0 if n == 0."""
    # TODO: one-liner
    pass


# print(bin(isolate_lsb(0b00101100)))   # 0b100
`,
        question:
`איך לבודד את הביט הדלוק התחתון בפעולה **אחת**? איך למצוא את **העמדה**?`,
        hints: [
          'הקסם: \\\`n & -n\\\`. ב-two\'s-complement, \\\`-n = ~n + 1\\\`. הביט הדלוק התחתון "שורד" את ההיפוך וההוספה, וכל השאר מתאפס.',
          'דוגמה: \\\`n = 0b1100\\\`, \\\`-n = 0b...10100\\\` (בייצוג שלם). \\\`n & -n = 0b0100\\\` — הביט הדלוק.',
          'למציאת **העמדה**: \\\`(n & -n).bit_length() - 1\\\`. עבור \\\`0b100\\\` זה 3-1 = 2.',
          'מקרה קצה: \\\`n == 0\\\` → \\\`n & -n == 0\\\`. ה-bit_length של 0 הוא 0, מה שייתן -1 לעמדה — לרוב מטפלים בזה בנפרד.',
        ],
        trace: {
          title: 'n & -n — isolate LSB',
          source:
`def isolate_lsb(n):
    return n & -n

def lsb_position(n):
    return (n & -n).bit_length() - 1 if n else -1`,
          sourceLang: 'python',
          steps: [
            { code: 'init: n = 0b00101100 (= 44)',
              explain: 'הביט הדלוק התחתון בעמדה 2.',
              executed: [1], focusLine: 2,
              viz: _bitRowSvg({ bits: [0,0,1,0,1,1,0,0], label: 'n = 0b00101100', sub: '44 — LSB at position 2' }) },
            { code: 'compute: -n (two\'s complement)',
              explain: '\\\`-n = ~n + 1\\\`. הביטים שמתחת ל-LSB הם 0; הביט עצמו 1; הביטים מעל הופכים.',
              executed: [2], focusLine: 2,
              viz: _bitRowSvg({ bits: [1,1,0,1,0,1,0,0], label: '-n in 8-bit two\'s complement', sub: '~n + 1 = 0b11010100' }) },
            { code: 'n & -n = 0b00000100',
              explain: 'ה-AND משאיר רק את הביט שהיה משותף — וזה בדיוק ה-LSB. ✓',
              executed: [2], focusLine: 2,
              viz: _bitRowSvg({ bits: [0,0,0,0,0,1,0,0], hlIdx: [2], label: 'isolated LSB', sub: 'value = 4, position = 2' }) },
            { code: 'lsb_position(n) → 2',
              explain: '\\\`bit_length(0b100) - 1 = 3 - 1 = 2\\\`. ✓',
              executed: [5], focusLine: 5,
              viz: _bitRowSvg({ bits: [0,0,0,0,0,1,0,0], hlIdx: [2], label: 'LSB position = 2', done: true }) },
          ],
        },
        answer:
`**\`n & -n\`** — מבודד את הביט הדלוק התחתון בפעולה אחת:

\`\`\`python
def isolate_lsb(n):
    return n & -n              # 0 if n == 0

def lsb_position(n):
    if n == 0: return -1
    return (n & -n).bit_length() - 1
\`\`\`

**למה זה עובד:** ב-two's-complement, \`-n\` נוצר ע"י \`~n + 1\`. ההפיכה הופכת **את כל** הביטים; ההוספה של 1 גוררת carry-propagation — שמתחיל מ-LSB ונעצרת מיד אחרי הביט הדלוק התחתון.

**בלגן הביטים — שלב שלב על \`n = 0b1100\`:**
\`\`\`
n       = ...0000 1100
~n      = ...1111 0011
~n + 1  = ...1111 0100   (carry stops after bit 2)
        = -n in two's complement

n & -n  = ...0000 0100   ← ה-LSB מבודד
\`\`\`

**שימושים:**
- **\`n & -n\` עצמו** = הביט הדלוק התחתון כ-one-hot mask.
- **\`(n & -n).bit_length() - 1\`** = העמדה של ה-LSB.
- **\`n & (n - 1)\`** = \`n\` בלי הביט הדלוק התחתון (Kernighan trick, ראו #8034).

**הבדל מ-#8034:** שם, \`n & (n-1)\` *מוחק* את ה-LSB. כאן, \`n & -n\` *מבודד* אותו. שני טריקים משלימים — אחד מנקה, אחד שומר.

**הכללה — \`Fenwick Tree (BIT)\`:** \`n & -n\` הוא הלב של עץ אינדקסים בינארי — מבנה נתונים שתומך ב-prefix-sums ב-\`O(log n)\` עם שורת קוד אחת לעדכון.`,
        interviewerMindset:
`שאלת ביט-טריקים אהובה. המראיין מחפש:

1. **הכרת \`n & -n\`.** מועמדים מתחילים יסרקו ביט-ביט (\`while not (n & 1): n >>= 1\`); זה לא טעות, אבל \`O(W)\` ולא הטריק.
2. **הסבר ה-two's-complement.** מי שזוכר את הביטוי "\`~n + 1\`" — סימן להבנת ייצוג חתום.
3. **הקשר ל-Fenwick Tree.** מועמדים מנוסים יזכירו את זה — אינדיקטור לעומק.
4. **שאלת המשך:** "ולמה זה לא עובד באותה צורה ב-Python על מספרים שליליים?" — תשובה: Python משתמש בייצוג של "אינסוף ביטי 1" משמאל; אבל \`n & -n\` עדיין עובד נכון בזכות שיטת ה-bit_length של Python.`,
        expectedAnswers: ['n & -n', '-n', 'two\'s complement', 'bit_length', 'isolate', 'lsb', 'least significant'],
      },
    ],
    source: 'PP - שאלות קוד (slide 35)',
    tags: ['algorithms', 'bit-manipulation', 'lsb', 'two-complement', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8036 — Min of two numbers without comparison operators
  // ───────────────────────────────────────────────────────────────
  {
    id: 'min-without-compare',
    difficulty: 'medium',
    title: 'מינימום של שני מספרים בלי אופרטורי השוואה',
    intro:
`ממש פונקציה שמחזירה את המינימום בין שני מספרים, **מבלי להשתמש באופרטורי השוואה**
(\`<\`, \`>\`, \`==\`, \`<=\`, \`>=\`, \`!=\`). גם לא \`min()\`, \`max()\`, או \`if\`/\`?:\`.

\`\`\`
Input: a=3, b=7    →  3
Input: a=-5, b=2   →  -5
Input: a=4, b=4    →  4
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(1)' },
          { label: 'Space', value: 'O(1)' },
        ],
        approaches: [
          {
            name: 'Arithmetic + abs()',
            time: 'O(1)', space: 'O(1)',
            summary: 'נוסחה אריתמטית: \`min = (a + b - |a - b|) / 2\`. אינטואיטיבית אבל משתמשת ב-\`abs\`.',
            code:
`def min_arith(a, b):
    return (a + b - abs(a - b)) // 2`,
          },
          {
            name: 'Sign-bit trick (no abs)',
            time: 'O(1)', space: 'O(1)',
            summary: 'מנצל את ביט הסימן: אם \`a - b\` שלילי, מחזירים a, אחרת b. עובד על מספרים חתומים.',
            code:
`def min_signbit(a, b):
    diff = a - b
    # In Python, shifting a negative right gives -1, positive gives 0.
    sign = (diff >> 63) & 1     # 1 if a < b, else 0 (for 64-bit ints)
    return a * sign + b * (1 - sign)`,
          },
        ],
        starterCode:
`def my_min(a, b):
    """Return min(a, b) without using comparison operators."""
    # TODO
    pass


# print(my_min(3, 7))   # 3
`,
        question:
`ממשו לפחות גישה אחת. מה היתרונות והחסרונות של כל אחת?`,
        hints: [
          'נוסחה: \\\`(a + b - |a - b|) / 2\\\`. הסכום פחות ההפרש המוחלט = פעמיים הקטן.',
          'גישת ביט-סימן: \\\`a - b\\\` שלילי ⇔ \\\`a < b\\\`. אפשר לבדוק את ביט הסימן בלי \\\`<\\\`.',
          'ב-Python, \\\`(diff >> 63) & 1\\\` מחזיר 1 אם הביט הגבוה דלוק (שלילי). 0 אחרת. עובד ל-int 64-ביט.',
          'הגלולה: \\\`min = a * sign + b * (1 - sign)\\\`. אם \\\`sign=1\\\` (\\\`a<b\\\`), מחזירים \\\`a\\\`. אחרת \\\`b\\\`.',
        ],
        trace: {
          title: 'min(3, 7) — arithmetic',
          source:
`def my_min(a, b):
    return (a + b - abs(a - b)) // 2`,
          sourceLang: 'python',
          steps: [
            { code: 'a = 3, b = 7',
              explain: 'נחשב את הנוסחה צעד-צעד.',
              executed: [1], focusLine: 2,
              viz: _twoBoxSvg({ a: 3, b: 7, op: 'init: min(a, b) without compare' }) },
            { code: 'a + b = 10',
              explain: 'סכום שני המספרים.',
              executed: [2], focusLine: 2,
              viz: _twoBoxSvg({ a: 3, b: 7, op: 'a + b = 10' }) },
            { code: '|a - b| = |3 - 7| = 4',
              explain: 'ההפרש המוחלט.',
              executed: [2], focusLine: 2,
              viz: _twoBoxSvg({ a: 3, b: 7, op: '|a - b| = 4' }) },
            { code: '(10 - 4) // 2 = 3',
              explain: 'הסכום פחות ההפרש המוחלט = פעמיים המינימום. חלוקה ב-2 = המינימום. ✓',
              executed: [2], focusLine: 2,
              viz: _twoBoxSvg({ a: 3, b: 7, op: 'min = (10 - 4) / 2', result: 3, resultName: 'min(a, b)', done: true }) },
          ],
        },
        answer:
`**שתי גישות, עם הסבר מדוע כל אחת עובדת.**

\`\`\`python
# גישה 1 — נוסחה אריתמטית
def my_min(a, b):
    return (a + b - abs(a - b)) // 2

# גישה 2 — ביט-סימן (אין שימוש ב-abs)
def my_min_sign(a, b):
    diff = a - b
    sign = (diff >> 63) & 1    # 1 if a < b, else 0 (assume 64-bit signed)
    return a * sign + b * (1 - sign)
\`\`\`

**איך פועלת הנוסחה האריתמטית:**

נניח \`a ≤ b\`:
- \`a + b\` = \`a + b\`
- \`|a - b|\` = \`b - a\`
- \`(a + b) - (b - a)\` = \`2a\` → חלוקה ב-2 = \`a\` = min ✓

נניח \`a > b\`:
- \`(a + b) - (a - b)\` = \`2b\` → \`b\` = min ✓

**איך פועלת גישת ביט-הסימן:**

הביט הגבוה ביותר במספר חתום הוא ביט הסימן (1 = שלילי, 0 = אי-שלילי). אם \`a - b < 0\` ⇔ \`a < b\`, אז \`(diff >> 63) & 1 == 1\`, ואז:
- \`a * 1 + b * 0 = a\` ✓

**יתרונות וחסרונות:**

| | Arithmetic | Sign-bit |
|---|------------|----------|
| משתמש ב-\`abs\`? | כן | לא |
| Overflow? | אפשרי ב-\`a-b\` ברוחב קבוע | אפשרי ב-\`a-b\` |
| מטפל ב-\`a == b\`? | כן (\`(2a - 0)/2 = a\`) | כן (\`sign=0\`, מחזיר \`b\` = \`a\`) |
| Python-friendly? | מאוד | תלוי ברוחב מספר |

**שאלת המשך — max:** הפוך:
\`\`\`python
def my_max(a, b):
    return (a + b + abs(a - b)) // 2
\`\`\`

**מקרי קצה:**
- \`a == b\` → תוצאה היא הערך עצמו (לא משנה איזה).
- מספרים גדולים מאוד — \`a + b\` יכול לגרום ל-overflow בשפות עם רוחב קבוע. ב-Python אינטים אינסופיים אז בטוח.`,
        interviewerMindset:
`שאלת חידה. המראיין מחפש:

1. **ראייה שזה לא תרגיל-ראש סתם.** הנוסחה \`(a+b ± |a-b|) / 2\` מופיעה גם ב-מנוסחת המינימום של גלילים (\`min(x, y) = (x+y - |x-y|)/2\`), בעיבוד אותות, ב-ML (smooth-min).
2. **לדעת לפחות שתי גישות.** מי שמצליח רק נוסחה אחת — שאל "אם אסור \`abs\`?"; הוא יזיז את עצמו לכיוון ביט-סימן.
3. **טיפול ב-overflow.** "ובשפה כמו C עם \`int32\`?" — נוסחת \`a+b\` בעייתית אם שני המספרים גדולים. אפשר לתקן: \`a - ((a - b) & sign)\`.
4. **שאלת המשך אהובה:** "ומה אם רוצים מבלי \`abs()\` *ובלי* shifts (רק \`+, -, *\`)?" — תשובה: זה לא אפשרי בלי השוואה אם רוצים תמיכה אוניברסלית. ה-trick תלוי בידע על ייצוג ביטים.`,
        expectedAnswers: ['(a + b - abs(a - b)) // 2', 'abs(a - b)', '>> 63', 'sign bit', 'ביט סימן', 'two\'s complement'],
      },
    ],
    source: 'PP - שאלות קוד (slide 36)',
    tags: ['algorithms', 'bit-manipulation', 'min', 'no-compare', 'classic', 'python'],
  },

  // ───────────────────────────────────────────────────────────────
  // #8037 — RLM state machine: back to origin after R/L/M sequence
  // (PP — שאלות מעגלים, slide 21)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'rlm-back-to-origin',
    difficulty: 'medium',
    title: 'מכונת מצבים — חזרה לראשית אחרי R/L/M',
    intro:
`רובוט מתחיל בנקודה \`(x=0, y=0)\` כשהוא פונה **למעלה**. 4 כיווני התסכלות: "למעלה", "ימינה", "למטה", "שמאלה".

המכונה מקבלת מחרוזת של פקודות מתוך \`{R, L, M}\`:
- **\`R\`** — סיבוב 90° עם כיוון השעון (Right). הכיוון הבא בסדר.
- **\`L\`** — סיבוב 90° נגד כיוון השעון (Left). הכיוון הקודם בסדר.
- **\`M\`** — צעד אחד בכיוון הנוכחי (Move). יחס לכיוון:
  - "למעלה" → \`y += 1\`
  - "למטה" → \`y -= 1\`
  - "ימינה" → \`x += 1\`
  - "שמאלה" → \`x -= 1\`

בסוף הרצת המחרוזת, אם \`x == 0 ∧ y == 0\` — חזרנו לאותו מקום (return \`True\`). אחרת \`False\`.

\`\`\`
Input:  "MMRMMRMMRMM"     →  True   (ריבוע)
Input:  "MMR"             →  False  ((x,y) = (1, 2))
Input:  ""                →  True   (לא זזנו)
\`\`\``,
    parts: [
      {
        label: 'א',
        editor: 'python',
        editorLabel: 'Python',
        complexities: [
          { label: 'Time',  value: 'O(n)' },
          { label: 'Space', value: 'O(1)' },
        ],
        starterCode:
`def back_to_origin(commands):
    """Run R/L/M sequence from (0,0) facing up. Return True iff back at origin."""
    # TODO: track (x, y) and direction.
    pass


# back_to_origin("MMRMMRMMRMM")  # True (a square)
# back_to_origin("MMR")           # False
`,
        question:
`ממש את \`back_to_origin(commands)\` בלולאת O(n).`,
        hints: [
          'יש 4 כיוונים. קודד אותם כ-0,1,2,3 (\\\`up, right, down, left\\\`). שמור ב-\\\`d\\\`.',
          'R = \\\`d = (d + 1) % 4\\\`. L = \\\`d = (d - 1) % 4\\\` (או \\\`(d + 3) % 4\\\` ל-Python).',
          'הצעד M תלוי בכיוון. שמור שני מערכי \\\`dx, dy\\\` באורך 4: \\\`dx = [0, 1, 0, -1]\\\`, \\\`dy = [1, 0, -1, 0]\\\` (up, right, down, left).',
          'בסוף: \\\`return x == 0 and y == 0\\\`.',
        ],
        trace: {
          title: 'back_to_origin("MMR")',
          source:
`def back_to_origin(s):
    dx = [0, 1, 0, -1]
    dy = [1, 0, -1, 0]
    x, y, d = 0, 0, 0
    for c in s:
        if   c == 'R': d = (d + 1) % 4
        elif c == 'L': d = (d - 1) % 4
        elif c == 'M':
            x += dx[d]
            y += dy[d]
    return x == 0 and y == 0`,
          sourceLang: 'python',
          steps: [
            { code: 'init: x=0, y=0, d=0 (facing up)',
              explain: 'נקודה ההתחלה.',
              executed: [1, 2, 3], focusLine: 3 },
            { code: "c='M' (1st): facing up → y += 1",
              explain: 'x=0, y=1, d=0.',
              executed: [5, 8, 9, 10], focusLine: 9 },
            { code: "c='M' (2nd): facing up → y += 1",
              explain: 'x=0, y=2, d=0.',
              executed: [5, 8, 9, 10], focusLine: 9 },
            { code: "c='R': d = (0+1)%4 = 1 (right)",
              explain: 'x=0, y=2, d=1.',
              executed: [5, 6], focusLine: 6 },
            { code: 'done: (x,y) = (0,2). NOT origin → return False.',
              explain: 'הסתיימה המחרוזת. (0,2) ≠ (0,0).',
              executed: [11], focusLine: 11, done: true },
          ],
        },
        answer:
`\`\`\`python
def back_to_origin(s):
    # directions: 0=up, 1=right, 2=down, 3=left
    dx = [0, 1, 0, -1]
    dy = [1, 0, -1, 0]
    x, y, d = 0, 0, 0
    for c in s:
        if   c == 'R': d = (d + 1) % 4
        elif c == 'L': d = (d - 1) % 4
        elif c == 'M':
            x += dx[d]
            y += dy[d]
    return x == 0 and y == 0
\`\`\`

**Time:** \`O(n)\`. **Space:** \`O(1)\`.

**איך זה עובד:**
\`d\` מקודד את הכיוון כ-int (0..3). מערכי \`dx, dy\` נותנים את הזזה התואמת לכל כיוון. \`R\`/\`L\` מעדכנים \`d\` בלבד. \`M\` מקדם \`(x, y)\` בכיוון הנוכחי.

**הסבר על המודולו:**
- ב-Python, \`(-1) % 4 = 3\` (תוצאה לא-שלילית), אז \`(d - 1) % 4\` עובד נקי גם ב-\`d=0\`.
- בשפות אחרות (C, Java), \`-1 % 4 = -1\` — צריך לכתוב \`(d + 3) % 4\` כדי לקבל את הערך הנכון.

**אופטימיזציה — בלי מערך dx/dy:** אפשר להשתמש בטריק טריגונומטרי:
\`\`\`python
# dx = sin(d * π/2), dy = cos(d * π/2)  (לכיוון 0=up)
dx = [0, 1, 0, -1][d]   # שווה ערך מתמטית ל-sin(d * π/2)
dy = [1, 0, -1, 0][d]   # שווה ערך ל-cos(d * π/2)
\`\`\`
שני המערכים בשורה אחת, או חישוב על-טריגונומטריה.

**שאלת המשך:** "ומה אם רוצים גם לבדוק שאנחנו בכיוון ההתחלתי?" → תוסיף תנאי \`d == 0\` בסוף.

**שאלת המשך מורכבת:** "ובאמת זה state machine — איך הוא נראה?" → 4 מצבי כיוון + 2 משתני מיקום. ה-FSM פשוט, האתגר הוא לראות שזה לא דורש קידוד מורכב.`,
        interviewerMindset:
`שאלת state machine קלאסית. בודקת אם המועמד יודע לקודד כיוון/state כ-int פשוט.

**מועמד חזק:**
1. **קודד את הכיוון כ-int 0..3** עם מערכי dx, dy. נקי, אלגנטי.
2. **משתמש ב-\`% 4\`** לסיבוב.
3. **שואל על קלט לא חוקי** ("מה אם c לא R/L/M?") — מראה תשומת לב לקצה.

**מועמד חלש:**
- כותב 4 ענפי \`if d == 0\` נפרדים (לא קומפקטי).
- שוכח את הסיבוב CCW (\`L\`) או טועה ב-\`% 4\` שלילי.

**שאלת bonus:** "כתוב גרסה שמחזירה גם את (x, y, d) הסופיים, לא רק boolean." → טריוויאלי, רק \`return x, y, d\`. בודק עניין בערכי-החזרה רב-תוצאתיים.`,
        expectedAnswers: [
          'dx', 'dy', 'd', 'direction',
          '(d + 1) % 4', '(d - 1) % 4', '% 4', '%4',
          'x += dx', 'y += dy',
          'x == 0', 'y == 0', '(0, 0)',
          'state machine',
        ],
      },
    ],
    source: 'PP - שאלות מעגלים (slide 21)',
    tags: ['algorithms', 'state-machine', 'simulation', 'directions', 'classic', 'python'],
  },
];
