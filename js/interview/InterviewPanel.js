/**
 * InterviewPanel — right-side overlay UI for interview prep.
 *
 * Two views (mirrors LessonPanel):
 *   - catalog:  topic tabs + question cards with status badges
 *   - question: intro + the active part (one at a time), hints reveal one by
 *               one, "הצג תשובה" toggle, prev/next part, mark-mastered
 *
 * Built lazily on first show; pure DOM, no framework. RTL Hebrew body;
 * technical terms (setup, hold, FF, MUX, etc.) stay LTR/English.
 */

import { TOPICS, serialFor } from './topics.js';
import { findQuestion as _findQuestion } from './questions.js';

export class InterviewPanel {
  constructor(engine) {
    this.engine = engine;
    this.engine.onChange = () => this.render();
    this.root = null;
    this.view = 'catalog';
    this.activeTopic = TOPICS[0].id;
    /** Typed answer in the active part's input. Cleared when part changes. */
    this._typedAnswer = '';
    this._lastPartKey = null;
    /** Active CodeMirror editor (one at a time). */
    this._cmEditor = null;
    this._cmKey    = null;
  }

  show()       { if (!this.root) this._build(); this.root.classList.remove('hidden');
                  this.view = this.engine.active ? 'question' : 'catalog';
                  this.render(); }
  hide()       { if (this.root) this.root.classList.add('hidden'); }
  isVisible()  { return this.root && !this.root.classList.contains('hidden'); }
  toggle()     { if (this.isVisible()) this.hide(); else this.show(); }

  _build() {
    const el = document.createElement('div');
    el.id = 'interview-panel';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="iv-resize-grip" title="Drag to resize"></div>
      <div id="interview-panel-header">
        <span>💼 INTERVIEW PREP</span>
        <div class="iv-header-actions">
          <button class="iv-btn iv-btn-mindset-index" data-act="show-mindset-index" title="כל הראש-של-המראיין בכל השלבים">🎯 הראש של המראיין</button>
          <button class="iv-btn iv-btn-maximize" data-act="toggle-maximize" title="הגדל / הקטן את הפאנל למסך מלא">⛶ הגדל</button>
          <button class="iv-x" data-act="close" title="Close">CLOSE</button>
        </div>
      </div>
      <div id="interview-panel-body"></div>
    `;
    document.body.appendChild(el);
    this.root = el;

    el.addEventListener('click', (e) => this._onClick(e));
    el.addEventListener('input', (e) => {
      if (e.target.classList?.contains('iv-answer-input')) {
        this._typedAnswer = e.target.value;
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList?.contains('iv-answer-input')) {
        e.preventDefault();
        this._handleCheckAnswer();
        return;
      }
      // ── Keyboard navigation for the code-trace player ─────────────
      // Only fires when (a) the user isn't typing in an input/textarea
      // /CodeMirror, AND (b) the current part actually has a trace.
      // Without these guards Left/Right would steal caret movement
      // inside the Python editor.
      const tag = (e.target.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea'
                   || e.target.isContentEditable
                   || e.target.closest?.('.cm-editor');
      if (inField) return;
      const part = this.engine.currentPart();
      const hasTrace = !!part?.trace?.steps?.length;
      if (!hasTrace || !this.engine.answerShown()) return;
      // RTL convention: right-arrow = "next" (advance through narrative
      // that reads right-to-left). Left = previous. R resets to step 1.
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this._traceMove(+1); return; }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); this._traceMove(-1); return; }
      if (e.key === 'r' || e.key === 'R')                  { e.preventDefault(); this._traceReset();  return; }
      if ((e.key === 'f' || e.key === 'F') && part.trace?.source) {
        e.preventDefault();
        this._openTraceFullscreen();
        return;
      }
    });
    this._wireResizeGrip(el);
  }

  _onClick(e) {
    const t = e.target.closest('[data-act], [data-topic], [data-mindset-topic], [data-question]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'close')              { this.hide(); return; }
    if (act === 'toggle-maximize')    { this._toggleMaximize(); return; }
    if (act === 'show-mindset-index') { this.view = 'mindset-index'; this.mindsetFilter = null; this.render(); return; }
    if (act === 'back-from-mindset')  { this.view = this.engine.active ? 'question' : 'catalog'; this.render(); return; }
    // Mindset-index has its own topic-filter tabs (data-mindset-topic) so
    // clicking them stays inside the index view rather than jumping to the
    // catalog like the regular catalog tabs do.
    if (t.dataset.mindsetTopic !== undefined) {
      this.mindsetFilter = t.dataset.mindsetTopic || null;
      this.render();
      return;
    }
    if (t.dataset.topic)              { this.activeTopic = t.dataset.topic; if (this.view === 'mindset-index') this.view = 'catalog'; this.render(); return; }
    if (act === 'open-question') {
      // Card may carry a `data-source-topic` (used when opened from
      // the virtual favourites tab where activeTopic is 'favorites'
      // but the question lives in a real topic).
      const sourceTopic = t.dataset.sourceTopic || this.activeTopic;
      this.engine.enter(sourceTopic, t.dataset.question);
      this.activeTopic = sourceTopic;
      this.view = 'question';
      return;
    }
    if (act === 'back-to-catalog')    { this.engine.exit(); this.view = 'catalog'; this.render(); return; }
    if (act === 'hint')               { this.engine.revealHint(); return; }
    if (act === 'show-answer')        { this.engine.showAnswer(); return; }
    if (act === 'hide-answer')        { this.engine.hideAnswer(); return; }
    if (act === 'toggle-mindset')     { this.engine.toggleMindset(); return; }
    if (act === 'prev-part')          { this.engine.prevPart(); return; }
    if (act === 'next-part')          { this.engine.nextPart(); return; }
    if (act === 'toggle-mastered')    { this.engine.toggleMastered(); return; }
    if (act === 'toggle-bookmark')    { this.engine.toggleBookmark(); return; }
    if (act === 'check-answer')       { this._handleCheckAnswer(); return; }
    if (act === 'paste-code')         { this._handlePasteCode();   return; }
    if (act === 'clear-code')         { this._handleClearCode();   return; }
    if (act === 'load-skeleton')      { this._handleLoadSkeleton(); return; }
    if (act === 'compare-solution')   { this._handleCompareSolution(); return; }
    if (act === 'close-compare')      { this._closeCompareModal();    return; }
    if (act === 'load-circuit')       { this.engine.loadCircuit();    return; }
    if (act === 'restore-circuit')    { this.engine.restoreCircuit(); return; }
    // Code-trace player — step forward / back / reset. The current step
    // is kept on this panel (not the engine) since it's pure view-state
    // that resets when the user navigates away.
    if (act === 'trace-prev')         { this._traceMove(-1); return; }
    if (act === 'trace-next')         { this._traceMove(+1); return; }
    if (act === 'trace-reset')        { this._traceReset(); return; }
    if (act === 'trace-fullscreen')   { this._openTraceFullscreen(); return; }
    if (act === 'close-trace-fs')     { this._closeTraceFullscreen(); return; }
  }

  _traceKey() {
    if (!this.engine.active) return null;
    return `${this.engine.questionId}:${this.engine.partIndex}`;
  }
  // localStorage-backed step persistence so a user who navigates away
  // (close panel / refresh / switch question) comes back to the same
  // step in the trace player. Mirrors the pattern used for `_cmPersist`.
  _traceStorageKey() {
    if (!this.engine.active) return null;
    return `circuit_designer_pro__iv_trace_step__${this.engine.topicId}::${this.engine.questionId}:${this.engine.partIndex}`;
  }
  _traceStepLoad() {
    const k = this._traceStorageKey();
    if (!k) return 0;
    try { return parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (_) { return 0; }
  }
  _traceStepPersist(step) {
    const k = this._traceStorageKey();
    if (!k) return;
    try { localStorage.setItem(k, String(step)); } catch (_) { /* ignore quota */ }
  }
  _traceMove(delta) {
    const k = this._traceKey(); if (!k) return;
    this._traceStep ||= {};
    const part = this.engine.currentPart();
    const total = part?.trace?.steps?.length || 0;
    if (!total) return;
    const cur = this._traceStep[k] ?? this._traceStepLoad();
    const next = Math.max(0, Math.min(total - 1, cur + delta));
    this._traceStep[k] = next;
    this._traceStepPersist(next);
    this.render();
  }
  _traceReset() {
    const k = this._traceKey(); if (!k) return;
    this._traceStep ||= {};
    this._traceStep[k] = 0;
    this._traceStepPersist(0);
    this.render();
  }

  async _handlePasteCode() {
    if (!this._cmEditor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      this._cmEditor.setValue(text);
      this._typedAnswer = text;
      this._cmEditor.focus();
    } catch (err) {
      // Most often: clipboard permission denied (Firefox without user
      // gesture, Safari, insecure context). Tell the user to use Ctrl+V.
      console.warn('[interview] clipboard.readText failed:', err);
      alert('הדפדפן חוסם קריאה מהלוח. השתמש ב-Ctrl+V בתוך העורך.');
    }
  }

  _handleClearCode() {
    if (!this._cmEditor) return;
    this._cmEditor.setValue('');
    this._typedAnswer = '';
    this._cmPersist('');
    this._cmEditor.focus();
  }

  // ── Compare-to-solution modal ────────────────────────────────────────
  // Side-by-side diff between the user's editor contents and the
  // canonical solution. Solution source preference order:
  //   1. part.approaches[best].code  — "best" is the last approach
  //      (usually the optimal one in our authoring convention).
  //   2. first ```python ... ``` block in part.answer.
  // If neither is present the button shouldn't render (we gate it
  // in _renderAnswerCheck above).
  _solutionCodeForCurrentPart() {
    const part = this.engine.currentPart();
    if (!part) return '';
    if (Array.isArray(part.approaches) && part.approaches.length > 0) {
      // Pick the last approach — by convention it's the optimal one
      // in our authoring style ("brute … then hash").
      const last = part.approaches[part.approaches.length - 1];
      if (last?.code) return last.code;
    }
    // Fallback: extract the first ```...``` block from the markdown answer.
    if (typeof part.answer === 'string') {
      const m = part.answer.match(/```\w*\n([\s\S]*?)\n```/);
      if (m) return m[1];
    }
    return '';
  }

  _handleCompareSolution() {
    const user = (this._cmEditor ? this._cmEditor.getValue() : this._typedAnswer) || '';
    const solution = this._solutionCodeForCurrentPart();
    if (!solution) {
      alert('אין פתרון רשמי זמין להשוואה לשאלה הזו.');
      return;
    }
    this._renderCompareModal(user, solution);
  }

  _closeCompareModal() {
    const m = document.getElementById('iv-compare-modal');
    if (m) m.remove();
  }

  // Build the diff modal. Line-level diff: each line is either common,
  // user-only, or solution-only. We use a simple longest-common-
  // subsequence on lines (textbook DP) — small inputs, so O(n·m) is
  // fine and we avoid a third-party diff dep.
  _renderCompareModal(userCode, solutionCode) {
    this._closeCompareModal();
    const diff = _lineDiff(userCode, solutionCode);
    const userHtml = diff.left.map(row =>
      `<div class="iv-diff-line iv-diff-${row.kind}"><span class="iv-diff-num">${row.num || ''}</span><pre>${_esc(row.text)}</pre></div>`
    ).join('');
    const solHtml = diff.right.map(row =>
      `<div class="iv-diff-line iv-diff-${row.kind}"><span class="iv-diff-num">${row.num || ''}</span><pre>${_esc(row.text)}</pre></div>`
    ).join('');
    const sameCount   = diff.left.filter(r => r.kind === 'same').length;
    const totalLines  = Math.max(diff.left.length, diff.right.length);
    const matchPct    = totalLines ? Math.round((sameCount / totalLines) * 100) : 100;

    const el = document.createElement('div');
    el.id = 'iv-compare-modal';
    el.className = 'iv-compare-modal';
    el.innerHTML = `
      <div class="iv-compare-backdrop" data-act="close-compare"></div>
      <div class="iv-compare-box" dir="rtl">
        <div class="iv-compare-head">
          <div class="iv-compare-title">⇄ השוואה לפתרון המומלץ</div>
          <div class="iv-compare-meta">
            <span class="iv-compare-pct">${matchPct}% התאמת שורות</span>
            <button class="iv-btn iv-x" data-act="close-compare">CLOSE</button>
          </div>
        </div>
        <div class="iv-compare-cols">
          <div class="iv-compare-col">
            <div class="iv-compare-col-head">הקוד שלך</div>
            <div class="iv-compare-pane" dir="ltr">${userHtml || '<div class="iv-compare-empty">(ריק)</div>'}</div>
          </div>
          <div class="iv-compare-col">
            <div class="iv-compare-col-head">פתרון מומלץ</div>
            <div class="iv-compare-pane" dir="ltr">${solHtml}</div>
          </div>
        </div>
        <div class="iv-compare-legend" dir="ltr">
          <span class="iv-diff-swatch iv-diff-same"></span>same
          <span class="iv-diff-swatch iv-diff-del"></span>only in yours
          <span class="iv-diff-swatch iv-diff-add"></span>only in solution
        </div>
      </div>`;
    document.body.appendChild(el);
    // Highlight the diff panes (user code + solution) — both live
    // outside the panel root, so the post-render hook can't reach them.
    this._highlightCodeBlocks(el);
    // The modal lives in document.body — outside the interview panel
    // root — so the panel's click handler never sees its events.
    // Wire dedicated handlers here. Backdrop click + CLOSE button +
    // Escape key all dismiss the modal.
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close-compare"]')) {
        this._closeCompareModal();
      }
    });
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this._closeCompareModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ── Full-screen trace view (code + viz side-by-side) ───────────────
  _openTraceFullscreen() {
    const part = this.engine.currentPart();
    if (!part?.trace?.source) return;
    this._traceFsOpen = true;
    this._renderTraceFullscreen();
    // Document-level keydown so arrow keys / R / ESC work even when
    // focus isn't inside the panel (the modal lives in document.body).
    this._traceFsEsc = (e) => {
      if (e.key === 'Escape') { this._closeTraceFullscreen(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this._traceMove(+1); this._renderTraceFullscreen(); return; }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); this._traceMove(-1); this._renderTraceFullscreen(); return; }
      if (e.key === 'r' || e.key === 'R')                  { e.preventDefault(); this._traceReset();  this._renderTraceFullscreen(); return; }
    };
    document.addEventListener('keydown', this._traceFsEsc);
  }

  _closeTraceFullscreen() {
    this._traceFsOpen = false;
    const m = document.getElementById('iv-trace-fs');
    if (m) m.remove();
    if (this._traceFsEsc) {
      document.removeEventListener('keydown', this._traceFsEsc);
      this._traceFsEsc = null;
    }
  }

  /** Re-render the modal in place (called after every step change). */
  _renderTraceFullscreen() {
    if (!this._traceFsOpen) return;
    const part = this.engine.currentPart();
    const trace = part?.trace;
    if (!trace?.source) { this._closeTraceFullscreen(); return; }
    const total = trace.steps.length;
    const tKey = `${this.engine.questionId}:${this.engine.partIndex}`;
    this._traceStep ||= {};
    if (this._traceStep[tKey] == null) this._traceStep[tKey] = this._traceStepLoad();
    const idx = Math.max(0, Math.min(total - 1, this._traceStep[tKey]));
    const cur = trace.steps[idx];
    const pct = total > 1 ? ((idx / (total - 1)) * 100) : 100;

    // Highlight source lines per step. Two distinct concepts:
    //   - `executed`  : explicit list of line numbers that ran THIS
    //                   step. Includes only lines Python actually
    //                   visited (skips e.g. the `return` in iterations
    //                   that didn't return). Get a soft tint.
    //   - `focusLine` : the one line whose effect IS the step. Gets a
    //                   strong tint + an arrow.
    // Legacy `lineRange:[lo,hi]` is supported for older trace data:
    // it's expanded to the contiguous range [lo..hi].
    const executed = Array.isArray(cur.executed)
      ? new Set(cur.executed)
      : (cur.lineRange ? new Set(_range(cur.lineRange[0], cur.lineRange[1])) : new Set());
    const focusLine = cur.focusLine;
    const lines = trace.source.split('\n');
    const codeHtml = lines.map((line, i) => {
      const n = i + 1;
      const inRange = executed.has(n);
      const isFocus = n === focusLine;
      const cls = isFocus ? 'iv-tfs-line iv-tfs-focus'
                : inRange ? 'iv-tfs-line iv-tfs-range'
                : 'iv-tfs-line';
      const arrow = isFocus ? '<span class="iv-tfs-arrow">▶</span>' : '<span class="iv-tfs-arrow"> </span>';
      return `<div class="${cls}">${arrow}<span class="iv-tfs-num">${n}</span><pre>${_esc(line) || ' '}</pre></div>`;
    }).join('');

    let host = document.getElementById('iv-trace-fs');
    if (!host) {
      host = document.createElement('div');
      host.id = 'iv-trace-fs';
      host.className = 'iv-trace-fs';
      document.body.appendChild(host);
      host.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="close-trace-fs"]')) this._closeTraceFullscreen();
        if (e.target.closest('[data-act="trace-prev"]'))     { this._traceMove(-1); this._renderTraceFullscreen(); }
        if (e.target.closest('[data-act="trace-next"]'))     { this._traceMove(+1); this._renderTraceFullscreen(); }
        if (e.target.closest('[data-act="trace-reset"]'))    { this._traceReset(); this._renderTraceFullscreen(); }
      });
    }
    host.innerHTML = `
      <div class="iv-trace-fs-backdrop" data-act="close-trace-fs"></div>
      <div class="iv-trace-fs-box" dir="rtl">
        <div class="iv-trace-fs-head">
          <div class="iv-trace-fs-title">▶ ${_esc(trace.title || 'מעקב הרצה')}</div>
          <div class="iv-trace-fs-meta">
            <span class="iv-trace-fs-counter" dir="ltr">${idx + 1} / ${total}</span>
            <button class="iv-btn iv-x" data-act="close-trace-fs">CLOSE  ⎋</button>
          </div>
        </div>
        <div class="iv-trace-fs-body">
          <div class="iv-trace-fs-code" dir="ltr">
            <div class="iv-trace-fs-code-head">${_esc(trace.sourceLang || 'code')}</div>
            <div class="iv-trace-fs-code-body">${codeHtml}</div>
          </div>
          <div class="iv-trace-fs-viz" dir="ltr">${cur.viz || ''}</div>
        </div>
        <div class="iv-trace-fs-narration" dir="rtl">
          ${cur.code    ? `<div class="iv-trace-fs-codeline">${_esc(cur.code)}</div>` : ''}
          ${cur.explain ? `<div class="iv-trace-fs-explain">${_renderInline(cur.explain)}</div>` : ''}
        </div>
        <div class="iv-trace-fs-controls">
          <button class="iv-btn" data-act="trace-prev" ${idx === 0 ? 'disabled' : ''}>◀ קודם</button>
          <div class="iv-trace-progress"><div class="iv-trace-progress-bar" style="width:${pct}%"></div></div>
          <button class="iv-btn iv-btn-primary" data-act="trace-next" ${idx === total - 1 ? 'disabled' : ''}>הבא ▶</button>
          <button class="iv-btn iv-btn-link" data-act="trace-reset">↺ אפס</button>
        </div>
        <div class="iv-trace-keys" dir="rtl">⌨ <kbd>←</kbd> קודם · <kbd>→</kbd> הבא · <kbd>R</kbd> אפס · <kbd>Esc</kbd> סגור</div>
      </div>`;
    // Highlight the embedded source-code listing each frame.
    this._highlightCodeBlocks(host);
  }

  _toggleMaximize() {
    if (!this.root) return;
    const on = !this.root.classList.contains('iv-panel-maximized');
    this.root.classList.toggle('iv-panel-maximized', on);
    const btn = this.root.querySelector('[data-act="toggle-maximize"]');
    if (btn) btn.textContent = on ? '⤢ הקטן' : '⛶ הגדל';
  }

  // ── Syntax highlighter (highlight.js, lazy from esm.sh) ─────────────
  // First call kicks off the dynamic import; subsequent calls reuse
  // the cached library. We highlight every <pre><code> inside the
  // panel root + the live trace-fullscreen modal (which lives in
  // document.body and is rendered separately).
  _highlightCodeBlocks(root) {
    if (this._hljsPromise === undefined) {
      this._hljsPromise = import('https://esm.sh/highlight.js@11.9.0/lib/core')
        .then(async (core) => {
          const [py, vlog] = await Promise.all([
            import('https://esm.sh/highlight.js@11.9.0/lib/languages/python'),
            import('https://esm.sh/highlight.js@11.9.0/lib/languages/verilog'),
          ]);
          const hljs = core.default;
          hljs.registerLanguage('python',  py.default);
          hljs.registerLanguage('verilog', vlog.default);
          return hljs;
        })
        .catch((err) => {
          console.warn('[interview] highlight.js failed to load:', err);
          return null;
        });
    }
    this._hljsPromise.then((hljs) => {
      if (!hljs || !root) return;
      // Inline code (`code`) inside prose stays plain; we only
      // colour fenced blocks rendered as `<pre><code>` or marked
      // with the `iv-code` family of classes.
      // NOTE: do NOT include `.iv-trace-fs-code-body` here — that
      // element wraps the *line-by-line* listing (each line in its
      // own div). Highlighting the wrapper would replace its inner
      // HTML with one big <span>, destroying the per-line structure.
      // We hit the per-line <pre>s individually via `.iv-tfs-line pre`.
      const blocks = root.querySelectorAll(
        'pre.iv-code code, pre.iv-code-hoisted code, pre.iv-approach-code, .iv-tfs-line pre'
      );
      blocks.forEach((el) => {
        if (el.dataset.hljsDone === '1') return;
        // Pick language: explicit data-lang attribute, then a CSS
        // class hint, then python as the algorithms-tab default.
        const langAttr = el.closest('[data-lang]')?.dataset.lang
                      || (el.className.match(/language-(\w+)/) || [])[1]
                      || 'python';
        try {
          const lang = hljs.getLanguage(langAttr) ? langAttr : 'python';
          const result = hljs.highlight(el.textContent, { language: lang, ignoreIllegals: true });
          el.innerHTML = result.value;
          el.classList.add('hljs');
          el.dataset.hljsDone = '1';
        } catch (_) { /* leave plain on error */ }
      });
    });
  }

  _handleLoadSkeleton() {
    if (!this._cmEditor) return;
    const part = this.engine.currentPart();
    const skeleton = part?.starterCode || _genericVerilogSkeleton();
    this._cmEditor.setValue(skeleton);
    this._typedAnswer = skeleton;
    this._cmPersist(skeleton);
    this._cmEditor.focus();
  }

  // ── per-question Verilog persistence (LS key: topic::question:part) ──
  _cmStorageKey() {
    if (!this.engine.active) return null;
    return `circuit_designer_pro__iv_verilog__${this.engine.topicId}::${this.engine.questionId}:${this.engine.partIndex}`;
  }
  _cmLoad() {
    const k = this._cmStorageKey();
    if (!k) return '';
    try { return localStorage.getItem(k) || ''; } catch (_) { return ''; }
  }
  _cmPersist(value) {
    const k = this._cmStorageKey();
    if (!k) return;
    try {
      if (value === '' || value == null) localStorage.removeItem(k);
      else                                localStorage.setItem(k, value);
    } catch (_) { /* quota / disabled — silent */ }
  }

  // ── editor height (LS-persisted across sessions) ──
  _cmSavedHeight() {
    try {
      const v = parseInt(localStorage.getItem('circuit_designer_pro__iv_verilog_h') || '', 10);
      if (Number.isFinite(v) && v >= 160 && v <= 800) return v;
    } catch (_) {}
    return 320;
  }
  _cmSaveHeight(px) {
    try { localStorage.setItem('circuit_designer_pro__iv_verilog_h', String(px)); } catch (_) {}
  }
  _wireCmResizeGrip(body) {
    const grip = body.querySelector('.iv-code-resize-grip');
    const host = body.querySelector('#iv-cm-host');
    if (!grip || !host) return;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startH = parseFloat(getComputedStyle(host).getPropertyValue('--cm-h')) || 320;
      const onMove = (ev) => {
        const dy = ev.clientY - startY;
        const next = Math.max(160, Math.min(800, startH + dy));
        host.style.setProperty('--cm-h', `${next}px`);
      };
      const onUp = () => {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', onUp);
        grip.removeEventListener('pointercancel', onUp);
        const final = parseFloat(getComputedStyle(host).getPropertyValue('--cm-h')) || 320;
        this._cmSaveHeight(Math.round(final));
      };
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp);
      grip.addEventListener('pointercancel', onUp);
    });
  }

  _handleCheckAnswer() {
    // Prefer the CodeMirror editor (Verilog parts); fall back to the
    // single-line input for plain text answers.
    let value;
    if (this._cmEditor) {
      value = this._cmEditor.getValue();
    } else {
      const inp = this.root?.querySelector('.iv-answer-input');
      if (!inp) return;
      value = inp.value;
    }
    this.engine.checkAnswer(value);
    // Re-render via onChange; preserve focus + value
    setTimeout(() => {
      if (this._cmEditor) { this._cmEditor.focus(); return; }
      const inp2 = this.root?.querySelector('.iv-answer-input');
      if (inp2) { inp2.focus(); }
    }, 0);
  }

  _wireResizeGrip(el) {
    const grip = el.querySelector('.iv-resize-grip');
    if (!grip) return;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startX = e.clientX, startY = e.clientY;
      const cs = getComputedStyle(el);
      const startTop   = parseFloat(cs.top)   || 0;
      const startWidth = parseFloat(cs.width) || el.offsetWidth;
      const MIN_W = 360, MIN_H = 240, TOP_PAD = 8, RIGHT_PAD = 8, BOTTOM_PAD = 8;
      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        const newTop   = Math.max(TOP_PAD, Math.min(window.innerHeight - MIN_H - BOTTOM_PAD, startTop + dy));
        const newWidth = Math.max(MIN_W,    Math.min(window.innerWidth - RIGHT_PAD * 2,    startWidth - dx));
        el.style.top = newTop + 'px';
        el.style.width = newWidth + 'px';
      };
      const onUp = () => {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', onUp);
        grip.removeEventListener('pointercancel', onUp);
      };
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp);
      grip.addEventListener('pointercancel', onUp);
    });
  }

  render() {
    if (!this.root) return;
    const body = this.root.querySelector('#interview-panel-body');
    if (!body) return;

    // Preserve scroll position + input focus across the innerHTML swap.
    // Without this, every click ("רמז", "הצג תשובה", "בדוק") yanked the
    // panel back to the top — perceived as flicker / jitter.
    const scrollTop = body.scrollTop;
    const focused   = document.activeElement;
    const focusedClass =
      (focused && body.contains(focused) && focused.classList?.contains('iv-answer-input'))
        ? 'iv-answer-input' : null;
    const selStart = focusedClass ? focused.selectionStart : null;
    const selEnd   = focusedClass ? focused.selectionEnd   : null;

    const html =
      this.view === 'mindset-index'                   ? this._renderMindsetIndex() :
      (this.view === 'question' && this.engine.active) ? this._renderQuestion()    :
                                                         this._renderCatalog();

    // Skip the swap entirely if the markup is identical — saves a paint and
    // any rare layout reflow noise.
    if (this._lastHtml === html) {
      body.scrollTop = scrollTop;
      return;
    }
    this._lastHtml = html;

    // If a CodeMirror editor is mounted, detach its DOM BEFORE the
    // innerHTML swap so the editor instance (and its caret / undo
    // history / focus) survives. We reattach right after.
    const detachedCm = this._cmEditor?.dom?.parentNode
      ? (() => { const d = this._cmEditor.dom; d.remove(); return d; })()
      : null;

    body.innerHTML = html;

    // Syntax-highlight every Python (and Verilog) code block we just
    // rendered. The highlighter is lazy-loaded once and then cached,
    // so subsequent renders cost ~nothing.
    this._highlightCodeBlocks(body);

    // Restore scroll + focus + caret position.
    body.scrollTop = scrollTop;
    // Second restore on the next frame: when the new markup contains
    // images, MathJax, or any late-layout content, the body's
    // scrollHeight finalizes AFTER this sync block — and a synchronous
    // `scrollTop = X` set BEFORE scrollHeight grew gets clamped to the
    // smaller maxScroll, leaving the panel at the top. rAF runs once
    // layout is committed so the second set takes the intended value.
    requestAnimationFrame(() => { body.scrollTop = scrollTop; });
    if (focusedClass) {
      const next = body.querySelector('.' + focusedClass);
      if (next) {
        next.focus({ preventScroll: true });
        if (selStart != null && next.setSelectionRange) {
          try { next.setSelectionRange(selStart, selEnd); } catch (_) { /* ignore */ }
        }
      }
    }

    // Re-attach / mount / dispose the CodeMirror editor depending on
    // whether the new markup has a host and whether the part changed.
    this._syncCmEditor(body, detachedCm);
    this._wireCmResizeGrip(body);
  }

  /**
   * Keep the CodeMirror editor in sync with the rendered DOM:
   *   • host present + same part   → re-attach existing editor DOM
   *   • host present + new part    → destroy old, mount fresh
   *   • host absent  + editor exists → destroy editor
   *
   * `detachedDom` is the editor's root DOM node that we removed before
   * the innerHTML swap (or null if there was no editor or it was never
   * attached). It must be re-inserted into the new host or it will be
   * garbage-collected by CodeMirror's destroy().
   */
  _syncCmEditor(body, detachedDom) {
    const host = body.querySelector('#iv-cm-host');
    const partKey = this.engine.active
      ? `${this.engine.questionId}:${this.engine.partIndex}`
      : null;

    if (!host) {
      if (this._cmEditor) {
        this._cmEditor.destroy();
        this._cmEditor = null;
        this._cmKey    = null;
      }
      return;
    }

    if (this._cmEditor && this._cmKey === partKey) {
      // Same part — re-attach the detached DOM into the new host.
      if (detachedDom) host.appendChild(detachedDom);
      return;
    }

    // A mount is already in flight for this part — let it complete and
    // append into whichever host is in DOM at completion time.
    if (this._cmMountPending === partKey) return;

    // Different part (or first time): tear down old, mount new.
    if (this._cmEditor) {
      this._cmEditor.destroy();
      this._cmEditor = null;
    }
    this._cmKey         = partKey;
    this._cmMountPending = partKey;
    const wantKey   = partKey;
    // Initial doc preference: in-memory typed answer (current session) →
    // localStorage (previous session) → empty. Saves the user from
    // losing work when the panel collapses or the page reloads.
    const starterDoc = this._typedAnswer || this._cmLoad() || '';
    if (starterDoc) this._typedAnswer = starterDoc;

    // Pick the highlighter language from the part. Defaults to Verilog
    // for legacy questions that don't specify (the loader treats
    // unknown values the same way).
    const part = this.engine.currentPart();
    const language = part?.editor === 'python' ? 'python' : 'verilog';

    import('./codeEditor.js')
      .then(({ createVerilogEditor }) => createVerilogEditor({
        container: host,
        initialDoc: starterDoc,
        language,
        onChange: (val) => {
          this._typedAnswer = val;
          this._cmPersist(val);
        },
      }))
      .then((editor) => {
        this._cmMountPending = null;
        // If the user navigated away while CodeMirror was loading,
        // throw the half-mounted editor away.
        const nowKey = this.engine.active
          ? `${this.engine.questionId}:${this.engine.partIndex}`
          : null;
        if (nowKey !== wantKey) {
          editor.destroy();
          return;
        }
        this._cmEditor = editor;
        // The host the editor mounted into may have been swapped out by
        // a render that ran during the async load. Re-home into the
        // current live host so events / focus work.
        const liveHost = this.root?.querySelector('#iv-cm-host');
        if (liveHost && editor.dom.parentNode !== liveHost) {
          liveHost.appendChild(editor.dom);
        }
      })
      .catch((err) => {
        this._cmMountPending = null;
        console.error('[interview] CodeMirror failed to load:', err);
        host.innerHTML = '<div class="iv-empty" dir="rtl">לא הצלחנו לטעון את עורך הקוד.</div>';
      });
  }

  /** Count of bookmarked questions across ALL topics — used for the
   *  "מועדפים" virtual tab badge. */
  _countAllBookmarks() {
    let n = 0;
    for (const t of TOPICS) {
      if (t.virtual) continue;
      for (const q of this.engine.listQuestions(t.id)) {
        if (this.engine.isBookmarked?.(t.id, q.id)) n++;
      }
    }
    return n;
  }

  /** Collect every bookmarked question from every real topic, paired
   *  with its source topic id and its 0-based index inside that topic
   *  (so serials and `engine.enter()` calls stay correct). */
  _favoriteEntries() {
    const out = [];
    for (const t of TOPICS) {
      if (t.virtual) continue;
      const list = this.engine.listQuestions(t.id);
      list.forEach((q, i) => {
        if (this.engine.isBookmarked?.(t.id, q.id)) {
          out.push({ q, sourceTopic: t.id, indexInTopic: i });
        }
      });
    }
    return out;
  }

  _renderCatalog() {
    const favCount = this._countAllBookmarks();
    const tabsHtml = TOPICS.map(t => {
      const isActive = t.id === this.activeTopic;
      // Virtual `favorites` tab counts bookmarks instead of mastered.
      const total = t.virtual ? favCount : this.engine.totalForTopic(t.id);
      const done  = t.virtual ? favCount : this.engine.countByStatus(t.id, 'mastered');
      return `
        <button class="iv-tab${isActive ? ' iv-tab-active' : ''}${t.virtual ? ' iv-tab-favorites' : ''}" data-topic="${t.id}" title="${_esc(t.description)}">
          ${t.virtual ? '' : `<span class="iv-tab-num">${t.tabNumber}</span>`}
          <span class="iv-tab-icon">${t.icon}</span>${_esc(t.label)}
          <span class="iv-tab-count">${t.virtual ? favCount : `${done}/${total}`}</span>
        </button>`;
    }).join('');

    const topic = TOPICS.find(t => t.id === this.activeTopic);
    let cards;

    if (topic?.virtual && this.activeTopic === 'favorites') {
      const entries = this._favoriteEntries();
      cards = entries.length === 0
        ? `<div class="iv-empty" dir="rtl">
             אין כרגע שאלות במועדפים.<br/>
             היכנס לכל שאלה ולחץ <span style="color:#ffd060">☆ סמן כמועדף</span> כדי שהיא תופיע כאן.
           </div>`
        : `<div class="iv-cards">${entries.map(e => this._renderCard(e.q, e.indexInTopic, e.sourceTopic)).join('')}</div>`;
    } else {
      const list = this.engine.listQuestions(this.activeTopic);
      cards = list.length === 0
        ? `<div class="iv-empty" dir="rtl">
             עדיין אין שאלות לנושא הזה.<br/>
             הוסף קבצים לתיקייה <code dir="ltr">IQ/${_esc(this.activeTopic)}/</code> לפי הפורמט שמתואר ב-<code dir="ltr">IQ/README.md</code>.
           </div>`
        : `<div class="iv-cards">${list.map((q, i) => this._renderCard(q, i)).join('')}</div>`;
    }

    return `
      <div class="iv-tabs">${tabsHtml}</div>
      ${topic ? `
        <div class="iv-topic-head" dir="rtl">
          <div class="iv-topic-title">${topic.icon} <span dir="ltr">${_esc(topic.label)}</span></div>
          <div class="iv-topic-desc" dir="ltr">${_esc(topic.description)}</div>
        </div>` : ''}
      ${cards}
    `;
  }

  /**
   * Mindset index: aggregate every interviewerMindset across all topics
   * and questions, grouped by topic. Each entry shows the part's full
   * serial (e.g. #2002·א) + title + the mindset text. Empty topics are
   * skipped.
   */
  _renderMindsetIndex() {
    const filter = this.mindsetFilter || null;

    // Per-topic tabs filter the index to a single topic. The "הכל" tab
    // (empty data-mindset-topic) is the default — show all topics
    // stacked, like before the filter feature was added.
    const tabsHtml = [
      `<button class="iv-mindset-tab${!filter ? ' iv-mindset-tab-active' : ''}" data-mindset-topic="">הכל</button>`,
      // Real topics only — the virtual "מועדפים" tab owns no questions
      // and shouldn't appear in the mindset filter row.
      ...TOPICS.filter(t => !t.virtual).map(t => `
        <button class="iv-mindset-tab${filter === t.id ? ' iv-mindset-tab-active' : ''}"
                data-mindset-topic="${_esc(t.id)}"
                title="${_esc(t.description)}">
          <span class="iv-tab-num">${t.tabNumber}</span>
          <span class="iv-tab-icon">${t.icon}</span>${_esc(t.label)}
        </button>`),
    ].join('');

    let html = `
      <div class="iv-mindset-index-head" dir="rtl">
        <div>
          <div class="iv-mindset-index-title">🎯 הראש של המראיין — כל השלבים</div>
          <div class="iv-mindset-index-sub">ריכוז של ההסברים "מה המראיין באמת בודק" מכל השאלות במאגר.</div>
        </div>
        <button class="iv-btn" data-act="back-from-mindset">↩ חזרה</button>
      </div>
      <div class="iv-mindset-tabs" dir="rtl">${tabsHtml}</div>
    `;

    for (const topic of TOPICS) {
      if (topic.virtual) continue;
      if (filter && topic.id !== filter) continue;
      const list = this.engine.listQuestions(topic.id);
      const entries = [];
      for (let qIdx = 0; qIdx < list.length; qIdx++) {
        const stub = list[qIdx];
        // Pull the full question object (need parts + mindset fields).
        const q = (typeof this.engine.currentQuestion === 'function')
          ? null  // not active; we need a direct lookup
          : null;
        // Use the questions module directly via engine helper-less path:
        const full = _findQuestion(topic.id, stub.id);
        if (!full) continue;
        const serialBase = serialFor(topic.id, qIdx);
        const parts = Array.isArray(full.parts) && full.parts.length > 0
          ? full.parts
          : [{ label: null, interviewerMindset: full.interviewerMindset }];
        const multi = parts.length > 1;
        parts.forEach((p, pIdx) => {
          const text = p?.interviewerMindset || (pIdx === 0 ? full.interviewerMindset : null);
          if (!text) return;
          const suffix = (multi && p.label != null) ? `·${p.label}` : '';
          entries.push({
            serial: `${serialBase}${suffix}`,
            title:  full.title,
            partLabel: p.label,
            text,
          });
        });
      }
      if (entries.length === 0) continue;
      html += `
        <div class="iv-mindset-topic" dir="rtl">
          <div class="iv-mindset-topic-head">
            <span class="iv-tab-num">${topic.tabNumber}</span>
            <span class="iv-mindset-topic-name">${topic.icon} <span dir="ltr">${_esc(topic.label)}</span></span>
          </div>
          ${entries.map(e => `
            <div class="iv-mindset-card">
              <div class="iv-mindset-card-head">
                <span class="iv-card-serial" dir="ltr">#${e.serial}</span>
                <span class="iv-mindset-card-title">${_esc(e.title)}${e.partLabel ? ` — סעיף ${_esc(e.partLabel)}` : ''}</span>
              </div>
              <div class="iv-mindset-body">${_renderRichText(e.text)}</div>
            </div>
          `).join('')}
        </div>`;
    }
    return html;
  }

  _renderCard(q, indexWithinTopic, sourceTopicOverride) {
    // `sourceTopicOverride` is set when we render this card under the
    // virtual "מועדפים" tab — `this.activeTopic === 'favorites'` but
    // serial / bookmark lookup / open need the REAL source topic.
    const cardTopic = sourceTopicOverride || this.activeTopic;
    const badge = q.status === 'mastered'
      ? '<span class="iv-badge iv-badge-mastered">✓ MASTERED</span>'
      : (q.status === 'seen'
          ? '<span class="iv-badge iv-badge-seen">SEEN</span>'
          : '<span class="iv-badge">NEW</span>');
    const diff = q.difficulty
      ? `<span class="iv-diff iv-diff-${_esc(q.difficulty)}">${_esc(q.difficulty)}</span>`
      : '';
    const partsLabel = q.partCount > 1 ? `<span class="iv-card-parts">${q.partCount} סעיפים</span>` : '';
    const serial = serialFor(cardTopic, indexWithinTopic);
    const bookmarked = this.engine.isBookmarked?.(cardTopic, q.id) ?? false;
    // When rendering inside the virtual favourites tab, show a small
    // origin-chip telling the user which topic this came from.
    const originChip = sourceTopicOverride
      ? (() => {
          const t = TOPICS.find(x => x.id === sourceTopicOverride);
          return t ? `<span class="iv-card-origin" title="מקור: ${_esc(t.description)}">${t.icon} ${_esc(t.label)}</span>` : '';
        })()
      : '';
    return `
      <div class="iv-card${bookmarked ? ' iv-card-bookmarked' : ''}" data-act="open-question" data-question="${_esc(q.id)}" data-source-topic="${_esc(cardTopic)}">
        <div class="iv-card-head">
          ${bookmarked ? '<span class="iv-card-star" title="במועדפים">★</span>' : ''}
          <span class="iv-card-serial" dir="ltr">#${serial}</span>
          <div class="iv-card-title" dir="rtl">${_esc(q.title)}</div>
          ${badge}
        </div>
        <div class="iv-card-meta">${diff}${partsLabel}${originChip}</div>
      </div>`;
  }

  _renderAnswerCheck() {
    if (!this.engine.hasCheckable()) return '';

    // Reset typed answer when navigating to a different part.
    const partKey = `${this.engine.questionId}:${this.engine.partIndex}`;
    if (this._lastPartKey !== partKey) {
      this._typedAnswer = '';
      this._lastPartKey = partKey;
    }

    const last = this.engine.lastCheck();
    const resultCls = last ? (last.ok ? 'iv-check-ok' : 'iv-check-bad') : '';
    const resultHtml = last
      ? `<div class="iv-check-result ${resultCls}" dir="rtl">${_esc(last.message)}</div>`
      : '';

    const part = this.engine.currentPart();
    if (part?.editor === 'verilog' || part?.editor === 'python') {
      // Render an empty host; the actual CodeMirror view is mounted by
      // render() after the innerHTML swap and is preserved across renders.
      const savedHeight = this._cmSavedHeight();
      const hostStyle = `--cm-h:${savedHeight}px`;
      const defaultLabel = part.editor === 'python' ? 'Python' : 'Verilog';
      const defaultHint  = part.editor === 'python'
        ? 'כתוב את הפתרון בפייתון בעורך למטה ולחץ "בדוק"'
        : 'כתוב את המודול בעורך למטה ולחץ "בדוק"';
      const label = part.editorLabel || defaultLabel;
      const hint  = part.editorHint  || defaultHint;
      return `
        <div class="iv-check-wrap-code" dir="rtl">
          <div class="iv-code-header">
            <span class="iv-code-label">${_esc(label)}</span>
            <span class="iv-code-hint">${_esc(hint)}</span>
          </div>
          <div class="iv-code-host" id="iv-cm-host" dir="ltr" style="${hostStyle}"></div>
          <div class="iv-code-resize-grip" title="גרור לשינוי גובה העורך"></div>
          ${resultHtml}
          <div class="iv-code-actions">
            ${part.starterCode || _hasGenericStarter() ? '<button class="iv-btn" data-act="load-skeleton" title="טען תבנית מודול ריקה לעורך">🧩 שלב מודול - רמז!</button>' : ''}
            <button class="iv-btn" data-act="paste-code" title="ייבא את התוכן של הלוח לתוך העורך (Ctrl+V עובד גם בעורך עצמו)">📋 הדבק מהלוח</button>
            <button class="iv-btn" data-act="clear-code" title="נקה את כל התוכן בעורך">🗑 נקה</button>
            ${part.approaches?.length || part.answer ? '<button class="iv-btn" data-act="compare-solution" title="השווה את הקוד שלך לפתרון המומלץ">⇄ השווה לפתרון</button>' : ''}
            <button class="iv-btn iv-btn-primary iv-btn-check" data-act="check-answer">✓ בדוק את הקוד</button>
          </div>
        </div>`;
    }

    return `
      <div class="iv-check-wrap" dir="rtl">
        <input type="text" class="iv-answer-input" dir="auto"
               value="${_esc(this._typedAnswer)}"
               placeholder="הקלד תשובה — לדוגמה: setup או hold" />
        <button class="iv-btn iv-btn-primary" data-act="check-answer">בדוק</button>
        ${resultHtml}
      </div>`;
  }

  _renderQuestion() {
    const q    = this.engine.currentQuestion();
    const part = this.engine.currentPart();
    if (!q || !part) return '';

    const total = this.engine.partCount();
    const idx   = this.engine.partIndex;
    const hints = this.engine.visibleHints();
    const moreHints = this.engine.remainingHintCount() > 0;
    const answerShown = this.engine.answerShown();

    const isMastered = (this.engine._statusOf(this.engine.topicId, q.id) === 'mastered');

    const partLabel = (part.label != null)
      ? `<span class="iv-part-label">סעיף ${_esc(part.label)}</span>`
      : '';

    const partProgress = total > 1
      ? `<span class="iv-part-progress">${idx + 1} / ${total}</span>`
      : '';

    const introHtml = q.intro
      ? `<div class="iv-intro" dir="rtl">${_renderRichText(q.intro)}</div>`
      : '';

    // Schematic field is trusted SVG/HTML authored by us in IQ/. Inline directly.
    const schematicHtml = q.schematic
      ? `<div class="iv-schematic">${q.schematic}</div>`
      : (q.image
          ? `<div class="iv-image-wrap"><img src="${_esc(q.image)}" alt="" class="iv-image" /></div>`
          : '');

    // "Load on canvas / Restore my work" — only when the question carries
    // a circuit() builder AND the engine has scene access.
    //
    // When `circuitRevealsAnswer` is set, the circuit IS the solution — so
    // we move the bar into the answer reveal block (rendered below) and
    // suppress it from its usual pre-answer slot.
    const circuitBarHtml = this.engine.hasCircuit()
      ? (this.engine.isCircuitLoaded()
          ? `<div class="iv-circuit-bar" dir="rtl">
               <span class="iv-circuit-status">המעגל טעון על הקנבס — הריצו אותו ב-STEP / AUTO CLK ובדקו את התשובה.</span>
               <button class="iv-btn" data-act="restore-circuit" title="חזרה למעגל שלך מלפני הטעינה">↩ שחזר את העבודה שלי</button>
             </div>`
          : `<div class="iv-circuit-bar" dir="rtl">
               <span class="iv-circuit-hint">${this.engine._activeCircuitRevealsAnswer() ? 'המעגל המלא של הפתרון — אפשר לטעון לקנבס ולהריץ.' : 'רוצה לבדוק בעצמך? אפשר לטעון את המעגל הזה לקנבס ולהריץ אותו.'}</span>
               <button class="iv-btn iv-btn-primary" data-act="load-circuit" title="המעגל הנוכחי שלך יישמר ויחזור כשתסיים">⤓ טען על הקנבס</button>
             </div>`)
      : '';
    const circuitHtml         = (this.engine.hasCircuit() && !this.engine._activeCircuitRevealsAnswer()) ? circuitBarHtml : '';
    const circuitInAnswerHtml = (this.engine.hasCircuit() &&  this.engine._activeCircuitRevealsAnswer() && answerShown) ? circuitBarHtml : '';

    const hintsHtml = hints.map((h, i) =>
      `<div class="iv-hint" dir="rtl">💡 רמז ${i + 1}: ${_renderInline(h)}</div>`
    ).join('');

    // Schematic that is shown ONLY when the answer is revealed. Part-level
    // wins over question-level so different parts can carry different
    // answer-time visuals (e.g., waveform on part 1, omitted on part 2).
    const answerSvg = part.answerSchematic || q.answerSchematic || '';
    const answerSvgHtml = answerSvg
      ? `<div class="iv-schematic iv-schematic-answer">${answerSvg}</div>`
      : '';

    // Pre-answer complexity pills: visible always (next to the prompt)
    // when the question wants to advertise the target Big-O up front —
    // doubles as a hint without being a spoiler.
    const promptCmplxHtml = _renderComplexities(part.complexities);

    // Inside the answer block: side-by-side approach cards (if the
    // part has multiple solution paths) and an optional code-trace
    // player. Both live under the "תשובה" reveal so they don't spoil
    // the user before they try.
    const approachesHtml = _renderApproaches(part.approaches);
    // Trace step preference: in-memory cache → localStorage (resumes
    // across visits / page reloads) → 0. The first read seeds the
    // in-memory cache so subsequent renders are O(1).
    const tKey = `${this.engine.questionId}:${this.engine.partIndex}`;
    this._traceStep ||= {};
    if (this._traceStep[tKey] == null) {
      this._traceStep[tKey] = this._traceStepLoad();
    }
    const traceStep = this._traceStep[tKey];
    const traceHtml = _renderTrace(part.trace, traceStep);

    // Consistent answer layout: **code → diagram → explanations**.
    // When the question doesn't use `approaches` (one-solution case),
    // we hoist the FIRST code block out of the markdown answer and
    // render it ABOVE the trace; the remainder of the answer
    // (intro/complexity/edge-cases prose) goes AFTER the trace as the
    // "explanations" section. This matches the convention requested
    // for the algorithms tab: solution-first, then visual, then prose.
    const { codeFirstHtml, restAnswer } = _hoistFirstCode(part, !!part.approaches?.length);

    const answerHtml = answerShown
      ? `<div class="iv-answer" dir="rtl">
           <div class="iv-answer-head">תשובה</div>
           ${answerSvgHtml}
           ${approachesHtml}
           ${codeFirstHtml}
           ${traceHtml}
           <div class="iv-answer-body">${_renderRichText(restAnswer)}</div>
           ${circuitInAnswerHtml}
           <button class="iv-btn iv-btn-link" data-act="hide-answer">הסתר תשובה</button>
         </div>`
      : '';

    const qList = this.engine.listQuestions(this.topicId);
    const qIdx  = qList.findIndex(x => x.id === q.id);
    const serial = qIdx >= 0 ? serialFor(this.topicId, qIdx) : null;
    // Per-part suffix: append "·<part-label>" (e.g. "5001·א") so each
    // sub-question gets a unique citable identifier. Single-part
    // questions stay as plain "5001".
    const partSuffix = (part.label != null && total > 1) ? `·${part.label}` : '';
    const fullSerial = serial ? `${serial}${partSuffix}` : null;

    // For multi-part questions, inline the part label into the title
    // itself so the section is visible at a glance even when the meta
    // chips below are off-screen / scrolled past.
    const titleSuffix = (part.label != null && total > 1)
      ? ` — סעיף ${_esc(part.label)}`
      : '';

    return `
      <div class="iv-question-head">
        ${fullSerial ? `<span class="iv-question-serial" dir="ltr">#${fullSerial}</span>` : ''}
        <div class="iv-question-title" dir="rtl">${_esc(q.title)}${titleSuffix}</div>
        <div class="iv-question-meta">
          ${partLabel}
          ${partProgress}
          ${q.difficulty ? `<span class="iv-diff iv-diff-${_esc(q.difficulty)}">${_esc(q.difficulty)}</span>` : ''}
        </div>
      </div>
      ${introHtml}
      ${schematicHtml}
      ${circuitHtml}
      <div class="iv-part-body">
        <div class="iv-prompt" dir="rtl">${_renderRichText(part.question || '')}</div>
        ${promptCmplxHtml}
        ${this._renderAnswerCheck()}
        ${hintsHtml}
        ${answerHtml}
        ${this.engine.mindsetShown() && this.engine.hasMindset()
          ? `<div class="iv-mindset" dir="rtl">
               <div class="iv-mindset-head">🎯 ראש המראיין</div>
               <div class="iv-mindset-body">${_renderRichText(this.engine.mindsetText())}</div>
             </div>`
          : ''}
      </div>
      <div class="iv-actions">
        ${moreHints ? '<button class="iv-btn" data-act="hint">💡 רמז</button>' : ''}
        ${this.engine.hasMindset() ? `<button class="iv-btn iv-btn-mindset" data-act="toggle-mindset">${this.engine.mindsetShown() ? '🎯 הסתר ראש המראיין' : '🎯 ראש המראיין'}</button>` : ''}
        ${!answerShown ? '<button class="iv-btn iv-btn-warn" data-act="show-answer">הצג תשובה</button>' : ''}
        ${total > 1 ? `<button class="iv-btn" data-act="prev-part" ${this.engine.isFirstPart() ? 'disabled' : ''}>← סעיף קודם</button>` : ''}
        ${total > 1 ? `<button class="iv-btn iv-btn-primary" data-act="next-part" ${this.engine.isLastPart() ? 'disabled' : ''}>סעיף הבא →</button>` : ''}
        <button class="iv-btn ${isMastered ? 'iv-btn-mastered' : ''}" data-act="toggle-mastered" title="סמן/בטל סימון של 'אני שולט בזה'">
          ${isMastered ? '✓ שולט' : '✓ סמן כ-Mastered'}
        </button>
        ${this.engine.isBookmarked ? `<button class="iv-btn ${this.engine.isBookmarked(this.engine.topicId, this.engine.questionId) ? 'iv-btn-bookmarked' : ''}" data-act="toggle-bookmark" title="הוסף/הסר מהמועדפים">
          ${this.engine.isBookmarked(this.engine.topicId, this.engine.questionId) ? '★ במועדפים' : '☆ סמן כמועדף'}
        </button>` : ''}
        <button class="iv-btn" data-act="back-to-catalog" title="חזרה לרשימת השאלות">↩ חזרה לתפריט</button>
      </div>
    `;
  }
}

// ── helpers ───────────────────────────────────────────────────

/**
 * Classify a complexity string (e.g. "O(n²)", "O(2ⁿ)") into one of
 * four buckets that map to CSS palettes. Lossy heuristic — we only
 * need it to colour-code the badge consistently, not to actually
 * compute order-of-growth.
 */
function _cmplxClass(s) {
  if (!s) return 'ok';
  const v = String(s).toLowerCase().replace(/\s+/g, '');
  if (/2\^n|2ⁿ|n!|n\^n|n·2\^n|n·2ⁿ|n\*2\^n/.test(v)) return 'exp';
  if (/n\^[2-9]|n²|n³|n\*n/.test(v))                  return 'bad';
  if (/o\(1\)|o\(log/.test(v))                         return 'good';
  return 'ok';
}

/**
 * Render a row of complexity pills. Accepts:
 *   complexities: [{ label, value }]     (free form)
 * Returns '' when input is empty so it's safe to inline.
 */
function _renderComplexities(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const pills = items.map(c => {
    const cls   = _cmplxClass(c.value);
    const label = c.label ? `<span class="iv-cmplx-prefix">${_esc(c.label)}:</span>` : '';
    return `<span class="iv-cmplx" data-class="${cls}">${label}${_esc(c.value)}</span>`;
  }).join('');
  return `<div class="iv-cmplx-row" dir="ltr">${pills}</div>`;
}

/** Side-by-side approach cards. Each card carries its own complexities. */
function _renderApproaches(approaches) {
  if (!Array.isArray(approaches) || approaches.length === 0) return '';
  const cards = approaches.map(a => {
    const cmplx = [];
    if (a.time)  cmplx.push({ label: 'Time',  value: a.time  });
    if (a.space) cmplx.push({ label: 'Space', value: a.space });
    return `
      <div class="iv-approach">
        <div class="iv-approach-head">
          <div class="iv-approach-name" dir="rtl">${_esc(a.name || '')}</div>
          ${_renderComplexities(cmplx)}
        </div>
        ${a.summary  ? `<div class="iv-approach-summary" dir="rtl">${_renderInline(a.summary)}</div>` : ''}
        ${a.code     ? `<pre class="iv-approach-code">${_esc(a.code)}</pre>` : ''}
        ${a.explain  ? `<div class="iv-approach-explain" dir="rtl">${_renderInline(a.explain)}</div>` : ''}
      </div>`;
  }).join('');
  return `<div class="iv-approaches">${cards}</div>`;
}

/**
 * Code-trace player — one step at a time with prev/next/reset.
 * `step` is the 0-based index of the step currently displayed; the
 * caller passes it from panel state so the player survives re-renders.
 */
function _renderTrace(trace, step) {
  if (!trace || !Array.isArray(trace.steps) || trace.steps.length === 0) return '';
  const total = trace.steps.length;
  const idx = Math.max(0, Math.min(total - 1, step || 0));
  const cur = trace.steps[idx];
  const pct = total > 1 ? ((idx / (total - 1)) * 100) : 100;
  return `
    <div class="iv-trace" dir="rtl">
      <div class="iv-trace-head">
        <div class="iv-trace-title">▶ ${_esc(trace.title || 'מעקב הרצה')}</div>
        <div class="iv-trace-step-num" dir="ltr">${idx + 1} / ${total}</div>
      </div>
      <div class="iv-trace-viz" dir="ltr">${cur.viz || ''}</div>
      ${cur.code    ? `<div class="iv-trace-line">${_esc(cur.code)}</div>` : ''}
      ${cur.explain ? `<div class="iv-trace-explain">${_renderInline(cur.explain)}</div>` : ''}
      <div class="iv-trace-controls">
        <button class="iv-btn" data-act="trace-prev" title="ניווט: ← או חץ למעלה" ${idx === 0 ? 'disabled' : ''}>◀ קודם</button>
        <div class="iv-trace-progress" title="${idx + 1} / ${total}">
          <div class="iv-trace-progress-bar" style="width:${pct}%"></div>
        </div>
        <button class="iv-btn iv-btn-primary" data-act="trace-next" title="ניווט: → או חץ למטה" ${idx === total - 1 ? 'disabled' : ''}>הבא ▶</button>
        <button class="iv-btn iv-btn-link" data-act="trace-reset" title="קיצור: R">↺ אפס</button>
        ${trace.source ? '<button class="iv-btn" data-act="trace-fullscreen" title="מסך מלא: קוד + ויזואליזציה זה לצד זה (F)">🖥 מסך מלא</button>' : ''}
      </div>
      <div class="iv-trace-keys" dir="rtl">⌨ ניווט מקלדת: <kbd>←</kbd> קודם · <kbd>→</kbd> הבא · <kbd>R</kbd> אפס${trace.source ? ' · <kbd>F</kbd> מסך מלא' : ''}</div>
    </div>`;
}

// ── Misc ────────────────────────────────────────────────────────────
function _range(lo, hi) {
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

// ── Line-level diff (small inputs only) ──────────────────────────────
// Returns { left: [{kind, num, text}], right: [...] } where `kind` is
// one of 'same' | 'del' | 'add'. Aligns lines using an LCS DP; gaps
// (one side has nothing) are rendered as blank rows so the two
// columns stay row-aligned in the modal.
function _lineDiff(a, b) {
  const aLines = String(a || '').split('\n');
  const bLines = String(b || '').split('\n');
  const m = aLines.length, n = bLines.length;
  // LCS DP table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = (aLines[i - 1] === bLines[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack
  const left = [], right = [];
  let i = m, j = n;
  const out = [];
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) {
      out.push({ kind: 'same', a: aLines[i - 1], b: bLines[j - 1], ai: i, bi: j });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ kind: 'del', a: aLines[i - 1], b: null, ai: i, bi: null });
      i--;
    } else {
      out.push({ kind: 'add', a: null, b: bLines[j - 1], ai: null, bi: j });
      j--;
    }
  }
  while (i > 0) { out.push({ kind: 'del', a: aLines[i - 1], b: null, ai: i, bi: null }); i--; }
  while (j > 0) { out.push({ kind: 'add', a: null, b: bLines[j - 1], ai: null, bi: j }); j--; }
  out.reverse();
  // Project to two parallel columns
  for (const e of out) {
    if (e.kind === 'same') {
      left.push({ kind: 'same', num: e.ai, text: e.a });
      right.push({ kind: 'same', num: e.bi, text: e.b });
    } else if (e.kind === 'del') {
      left.push({ kind: 'del', num: e.ai, text: e.a });
      right.push({ kind: 'blank', num: '', text: '' });
    } else {
      left.push({ kind: 'blank', num: '', text: '' });
      right.push({ kind: 'add', num: e.bi, text: e.b });
    }
  }
  return { left, right };
}

// Extract the FIRST fenced code block from `part.answer` and render
// it as an isolated `<pre class="iv-code">` BEFORE the trace player.
// The remaining answer markdown (intro line + complexity + edge-cases
// + steps-of-thinking) is returned as `restAnswer` to be rendered
// AFTER the trace. When the question already uses `approaches[]`
// (multi-solution case), the approach cards carry the code → we
// skip hoisting and let the markdown answer flow as-is.
function _hoistFirstCode(part, hasApproaches) {
  const answer = part.answer || '';
  if (hasApproaches) return { codeFirstHtml: '', restAnswer: answer };
  const m = answer.match(/```(\w*)\n([\s\S]*?)\n```/);
  if (!m) return { codeFirstHtml: '', restAnswer: answer };
  const lang = m[1] || '';
  const code = m[2];
  const langAttr = lang ? ` data-lang="${_esc(lang)}"` : '';
  const codeHtml =
    `<pre class="iv-code iv-code-hoisted"${langAttr} dir="ltr"><code>${_esc(code)}</code></pre>`;
  // Remove the *first* occurrence of the block from the answer so it
  // doesn't appear twice. `String.prototype.replace` with a string
  // arg replaces only the first match — exactly what we want.
  const rest = answer.replace(m[0], '').trim();
  return { codeFirstHtml: codeHtml, restAnswer: rest };
}

function _hasGenericStarter() { return true; }

function _genericVerilogSkeleton() {
  return `module top (
    input  wire clk,
    input  wire rst_n,
    // TODO: declare inputs
    // TODO: declare outputs
);

    // TODO: declare internal regs / wires

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            // TODO: reset state
        end else begin
            // TODO: clocked behaviour
        end
    end

    // TODO: combinational assigns

endmodule
`;
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render an inline string with minimal Markdown:
 *   `code` → <code>
 *   **bold** → <strong>
 * Used for hints (single-line content). Preserves newlines as <br/>.
 */
function _renderInline(s) {
  let out = _esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\n/g, '<br/>');
  return out;
}

/**
 * Render a multi-paragraph string with minimal Markdown:
 *   - fenced ```lang\n...\n``` blocks render as <pre><code> (LTR)
 *   - blank lines split blocks
 *   - tables (|...|) render as <table>
 *   - lines starting with "- " render as <ul><li>
 *   - everything else is a <p>
 * Authored by us (in IQ/), never user input — direct innerHTML is fine.
 */
function _renderRichText(s) {
  // Phase 1 — extract fenced code blocks first so the blank-line split
  // doesn't break a multi-paragraph code block. Each one becomes a marker
  // that we restore at the end.
  const codeBlocks = [];
  const marker = (i) => `IVCODE${i}`;
  // Wrap the marker in blank lines so the subsequent paragraph-split
  // *always* puts the marker in its own block. Without this, when the
  // author writes "**דוגמה:**\n```...```\n" (a label glued to the
  // fence) the marker stays inside the label paragraph, the `^IVCODE…$`
  // match fails, and `IVCODE0` leaks into the rendered output.
  const withMarkers = String(s).replace(/```(\w*)\n([\s\S]*?)\n```/g, (_, lang, code) => {
    codeBlocks.push({ lang: lang || '', code });
    return `\n\n${marker(codeBlocks.length - 1)}\n\n`;
  });

  return withMarkers.split(/\n\s*\n/).map(b => {
    const trimmed = b.trim();
    if (!trimmed) return '';

    const codeMatch = trimmed.match(/^IVCODE(\d+)$/);
    if (codeMatch) {
      const cb = codeBlocks[+codeMatch[1]];
      const langClass = cb.lang ? ` data-lang="${_esc(cb.lang)}"` : '';
      return `<pre class="iv-code"${langClass} dir="ltr"><code>${_esc(cb.code)}</code></pre>`;
    }
    if (/^\s*\|.*\|\s*$/m.test(trimmed) && trimmed.split('\n').length >= 2) {
      return _renderTable(trimmed);
    }
    const lines = trimmed.split('\n');
    if (lines.length >= 1 && lines.every(l => /^\s*-\s+/.test(l))) {
      const items = lines
        .map(l => `<li>${_renderInline(l.replace(/^\s*-\s+/, ''))}</li>`)
        .join('');
      return `<ul class="iv-list">${items}</ul>`;
    }
    return `<p>${_renderInline(trimmed)}</p>`;
  }).join('');
}

function _renderTable(src) {
  const lines = src.split('\n').filter(l => l.trim());
  // Drop the alignment line ( |---|---| ) if present.
  const rows = lines.filter(l => !/^\s*\|?\s*-+/.test(l));
  if (rows.length === 0) return '';
  const cells = rows.map(l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()));
  const head = cells[0];
  const body = cells.slice(1);
  const headHtml = `<tr>${head.map(c => `<th>${_renderInline(c)}</th>`).join('')}</tr>`;
  const bodyHtml = body.map(r => `<tr>${r.map(c => `<td>${_renderInline(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="iv-table">${headHtml}${bodyHtml}</table>`;
}
