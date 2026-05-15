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
          steps: [
            {
              code: 'root: ∅ — אף איבר לא נבחר עדיין',
              explain: 'כל ענף שמאלה (\`−\`) = "דלג", כל ענף ימינה (\`+\`) = "כלול". בעומק \`n\` כל עלה הוא תת-קבוצה אחת.',
              viz: _powersetTreeSvg([1,2,3], [''], '', false),
            },
            {
              code: 'depth 1: החלטה על arr[0] = 1',
              explain: 'מתפצלים לשני סניפים: "בלי 1" ו"עם 1". מ-\`1\` צומת נהיו \`2\`.',
              viz: _powersetTreeSvg([1,2,3], ['','0','1'], '1', false),
            },
            {
              code: 'depth 2: החלטה על arr[1] = 2',
              explain: 'כל אחד מ-2 הצמתים מתפצל ל-2 ילדים. עכשיו \`4\` צמתים. הספירה הוקרית מתחילה.',
              viz: _powersetTreeSvg([1,2,3], ['','0','1','00','01','10','11'], '11', false),
            },
            {
              code: 'depth 3: החלטה על arr[2] = 3 (העומק האחרון)',
              explain: 'כל צומת ברמה 2 מתפצל בפעם האחרונה. \`8\` עלים = \`2³\` = כל תתי-הקבוצות.',
              viz: _powersetTreeSvg([1,2,3],
                ['','0','1','00','01','10','11','000','001','010','011','100','101','110','111'],
                '111', false),
            },
            {
              code: 'איסוף העלים → התוצאה הסופית',
              explain: '8 עלים = \`2ⁿ\` תתי-קבוצות. שמאל-לימין: \`[], [3], [2], [2,3], [1], [1,3], [1,2], [1,2,3]\`. כל מסלול שורש→עלה מקודד בחירה.',
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
          steps: [
            {
              code: 'initial: i = 0, j = 6   (n = 7)',
              explain: 'מציבים מצביע אחד בכל קצה של ה-buffer. הלולאה תיעצר רק כש-\`i >= j\`.',
              viz: _twoPointerSvg({ state: 'welcome', i: 0, j: 6 }),
            },
            {
              code: 'swap a[0] ↔ a[6]   "w"↔"e"',
              explain: 'מחליפים את הקצוות. \`i++, j--\` — מצמצמים את הטווח פנימה.',
              viz: _twoPointerSvg({ state: 'eelcomw', i: 1, j: 5, swapped: true }),
            },
            {
              code: 'swap a[1] ↔ a[5]   "e"↔"m"',
              explain: 'הזוג הפנימי הבא. שוב swap, שוב צמצום.',
              viz: _twoPointerSvg({ state: 'emlcoew', i: 2, j: 4, swapped: true }),
            },
            {
              code: 'swap a[2] ↔ a[4]   "l"↔"o"',
              explain: 'הזוג האחרון לפני שהמצביעים נפגשים.',
              viz: _twoPointerSvg({ state: 'emoclew', i: 3, j: 3, swapped: true }),
            },
            {
              code: 'i = 3, j = 3   →   stop',
              explain: 'המצביעים נפגשו באמצע — סיימנו ב-3 פעולות swap בלבד, **O(n)** זמן ו-**O(1)** מקום נוסף. התוצאה: \`"emoclew"\`.',
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
          steps: [
            {
              code: 'init: R1=3 (a), R2=2 (b), R3=R4=R5=0',
              explain: 'מצב התחלתי. R1, R2 הקלט; R3 ירכז את התוצאה; R4 temp לעותק של R1; R5 sentinel (לא בשימוש בגרסה זו).',
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
          steps: [
            {
              code: 'init: build graph + in_degree counts',
              explain: 'בנינו את הגרף המכוון. \\\`c → a → b\\\`, \\\`x → y → a\\\`. ה-in_degree של כל קודקוד: \\\`a:2, b:1, c:0, x:0, y:1\\\`. \\\`c\\\` ו-\\\`x\\\` הם "שורשים" — תלות-אפס.',
              viz: _topoGraphSvg({
                inDegree: { a: 2, b: 1, c: 0, x: 0, y: 1 },
                removed: [], queue: [], result: [],
              }),
            },
            {
              code: 'enqueue all zero-in-degree: queue = [c, x]',
              explain: 'הקודקודים \\\`c\\\` ו-\\\`x\\\` (in_deg=0) נכנסים לתור. הם ה"קודמים" — אין מי שמופיע לפניהם.',
              viz: _topoGraphSvg({
                inDegree: { a: 2, b: 1, c: 0, x: 0, y: 1 },
                removed: [], queue: ['c', 'x'], result: [],
              }),
            },
            {
              code: 'pop c → result = [c]; decrement a (2→1)',
              explain: 'מוציאים את \\\`c\\\`. מוסיפים לתוצאה. כל הקשתות היוצאות ממנו — מעדכנים את ה-in_deg של ה"שכנים". \\\`a\\\` יורד מ-2 ל-1 (עדיין לא מוכן).',
              viz: _topoGraphSvg({
                inDegree: { a: 1, b: 1, c: 0, x: 0, y: 1 },
                removed: ['c'], queue: ['x'], result: ['c'],
                highlight: 'c',
              }),
            },
            {
              code: 'pop x → result = [c, x]; decrement y (1→0) → queue',
              explain: 'מוציאים את \\\`x\\\`. \\\`y\\\` מצטמצם ל-0 → נכנס לתור.',
              viz: _topoGraphSvg({
                inDegree: { a: 1, b: 1, c: 0, x: 0, y: 0 },
                removed: ['c', 'x'], queue: ['y'], result: ['c', 'x'],
                highlight: 'x',
              }),
            },
            {
              code: 'pop y → result = [c, x, y]; decrement a (1→0) → queue',
              explain: '\\\`y\\\` יוצא. \\\`a\\\` יורד ל-0 → לתור. עכשיו כל הקודקודים שלפני \\\`a\\\` "טופלו".',
              viz: _topoGraphSvg({
                inDegree: { a: 0, b: 1, c: 0, x: 0, y: 0 },
                removed: ['c', 'x', 'y'], queue: ['a'], result: ['c', 'x', 'y'],
                highlight: 'y',
              }),
            },
            {
              code: 'pop a → result = [c, x, y, a]; decrement b (1→0) → queue',
              explain: '\\\`a\\\` יוצא. \\\`b\\\` מצטמצם ל-0.',
              viz: _topoGraphSvg({
                inDegree: { a: 0, b: 0, c: 0, x: 0, y: 0 },
                removed: ['c', 'x', 'y', 'a'], queue: ['b'], result: ['c', 'x', 'y', 'a'],
                highlight: 'a',
              }),
            },
            {
              code: 'pop b → result = [c, x, y, a, b]   queue empty',
              explain: '\\\`b\\\` יוצא. התור ריק, כל הקודקודים בתוצאה. \\\`len(result) == len(nodes)\\\` ⇒ אין מעגל ⇒ הסדר חוקי. **c < x < y < a < b** ✓',
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
          steps: [
            {
              code: 'init: a=3, b=5, result=0',
              explain: 'a הוא הכפלן (\\\`011\\\`), b הוא המכפיל (\\\`101\\\`). result יצטבר עם כל ביט דולק של b.',
              viz: _bitMultiplySvg({ a: 3, b: 5, result: 0, action: 'init' }),
            },
            {
              code: 'iter 1: b & 1 = 1   →   result += a',
              explain: 'ה-LSB של b דולק. מוסיפים \\\`a=3\\\` ל-result (באמצעות \\\`add_bits\\\`, לא \\\`+\\\` כי אסור).',
              viz: _bitMultiplySvg({ a: 3, b: 5, result: 3, action: 'add' }),
            },
            {
              code: 'iter 1: a <<= 1 (=6),  b >>= 1 (=2)',
              explain: 'מקדמים: a מוכפל ב-2, b מחולק ב-2. עכשיו ה-LSB של b הוא \\\`0\\\`.',
              viz: _bitMultiplySvg({ a: 6, b: 2, result: 3, action: 'shift' }),
            },
            {
              code: 'iter 2: b & 1 = 0   →   skip add',
              explain: 'הביט דלוק כבוי → לא מוסיפים. רק מקדמים.',
              viz: _bitMultiplySvg({ a: 6, b: 2, result: 3, action: 'skip' }),
            },
            {
              code: 'iter 2: a <<= 1 (=12),  b >>= 1 (=1)',
              explain: 'a הוכפל פעמיים כבר, b קטן ל-1.',
              viz: _bitMultiplySvg({ a: 12, b: 1, result: 3, action: 'shift' }),
            },
            {
              code: 'iter 3: b & 1 = 1   →   result += a',
              explain: 'הביט הדלוק האחרון של b. מוסיפים \\\`a=12\\\` ל-result. \\\`3 + 12 = 15\\\`.',
              viz: _bitMultiplySvg({ a: 12, b: 1, result: 15, action: 'add' }),
            },
            {
              code: 'iter 3: a <<= 1 (=24),  b >>= 1 (=0)',
              explain: 'אחרי ההזזה b=0. הלולאה תסיים.',
              viz: _bitMultiplySvg({ a: 24, b: 0, result: 15, action: 'shift' }),
            },
            {
              code: 'b == 0 → return 15',
              explain: '**\\\`3 × 5 = 15\\\`** ✓. סה"כ 3 איטרציות (= מספר הביטים הדלוקים ב-b הכי גבוה). זה bitwise shift-and-add = Russian-peasant multiplication.',
              viz: _bitMultiplySvg({ a: 24, b: 0, result: 15, action: 'done', done: true }),
            },
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
];
