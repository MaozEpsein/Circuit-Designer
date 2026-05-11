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
        <button class="iv-x" data-act="close" title="Close">CLOSE</button>
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
      }
    });
    this._wireResizeGrip(el);
  }

  _onClick(e) {
    const t = e.target.closest('[data-act], [data-topic], [data-question]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'close')              { this.hide(); return; }
    if (t.dataset.topic)              { this.activeTopic = t.dataset.topic; this.render(); return; }
    if (act === 'open-question')      { this.engine.enter(this.activeTopic, t.dataset.question); this.view = 'question'; return; }
    if (act === 'back-to-catalog')    { this.engine.exit(); this.view = 'catalog'; this.render(); return; }
    if (act === 'hint')               { this.engine.revealHint(); return; }
    if (act === 'show-answer')        { this.engine.showAnswer(); return; }
    if (act === 'hide-answer')        { this.engine.hideAnswer(); return; }
    if (act === 'prev-part')          { this.engine.prevPart(); return; }
    if (act === 'next-part')          { this.engine.nextPart(); return; }
    if (act === 'toggle-mastered')    { this.engine.toggleMastered(); return; }
    if (act === 'check-answer')       { this._handleCheckAnswer(); return; }
    if (act === 'load-circuit')       { this.engine.loadCircuit();    return; }
    if (act === 'restore-circuit')    { this.engine.restoreCircuit(); return; }
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

    const html = (this.view === 'question' && this.engine.active)
      ? this._renderQuestion()
      : this._renderCatalog();

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

    // Restore scroll + focus + caret position.
    body.scrollTop = scrollTop;
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

    // Different part (or first time): tear down old, mount new.
    if (this._cmEditor) {
      this._cmEditor.destroy();
      this._cmEditor = null;
    }
    this._cmKey = partKey;
    const wantKey = partKey;
    const starterDoc = this._typedAnswer || '';

    import('./codeEditor.js')
      .then(({ createVerilogEditor }) => createVerilogEditor({
        container: host,
        initialDoc: starterDoc,
        onChange: (val) => { this._typedAnswer = val; },
      }))
      .then((editor) => {
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
      })
      .catch((err) => {
        console.error('[interview] CodeMirror failed to load:', err);
        host.innerHTML = '<div class="iv-empty" dir="rtl">לא הצלחנו לטעון את עורך הקוד.</div>';
      });
  }

  _renderCatalog() {
    const tabsHtml = TOPICS.map(t => {
      const total = this.engine.totalForTopic(t.id);
      const done  = this.engine.countByStatus(t.id, 'mastered');
      const isActive = t.id === this.activeTopic;
      return `
        <button class="iv-tab${isActive ? ' iv-tab-active' : ''}" data-topic="${t.id}" title="${_esc(t.description)}">
          <span class="iv-tab-num">${t.tabNumber}</span>
          <span class="iv-tab-icon">${t.icon}</span>${_esc(t.label)}
          <span class="iv-tab-count">${done}/${total}</span>
        </button>`;
    }).join('');

    const list = this.engine.listQuestions(this.activeTopic);
    const cards = list.length === 0
      ? `<div class="iv-empty" dir="rtl">
           עדיין אין שאלות לנושא הזה.<br/>
           הוסף קבצים לתיקייה <code dir="ltr">IQ/${_esc(this.activeTopic)}/</code> לפי הפורמט שמתואר ב-<code dir="ltr">IQ/README.md</code>.
         </div>`
      : `<div class="iv-cards">${list.map((q, i) => this._renderCard(q, i)).join('')}</div>`;

    const topic = TOPICS.find(t => t.id === this.activeTopic);

    return `
      <div class="iv-catalog-intro" dir="rtl">
        מאגר שאלות לראיונות עבודה בתחום עיצוב דיגיטלי.
        בחר נושא מהלשוניות למטה — כל נושא מציג את השאלות שהוספת ל-<code dir="ltr">IQ/&lt;topic&gt;/</code>.
      </div>
      <div class="iv-tabs">${tabsHtml}</div>
      ${topic ? `
        <div class="iv-topic-head" dir="rtl">
          <div class="iv-topic-title">${topic.icon} <span dir="ltr">${_esc(topic.label)}</span></div>
          <div class="iv-topic-desc" dir="ltr">${_esc(topic.description)}</div>
        </div>` : ''}
      ${cards}
    `;
  }

  _renderCard(q, indexWithinTopic) {
    const badge = q.status === 'mastered'
      ? '<span class="iv-badge iv-badge-mastered">✓ MASTERED</span>'
      : (q.status === 'seen'
          ? '<span class="iv-badge iv-badge-seen">SEEN</span>'
          : '<span class="iv-badge">NEW</span>');
    const diff = q.difficulty
      ? `<span class="iv-diff iv-diff-${_esc(q.difficulty)}">${_esc(q.difficulty)}</span>`
      : '';
    const partsLabel = q.partCount > 1 ? `<span class="iv-card-parts">${q.partCount} סעיפים</span>` : '';
    const serial = serialFor(this.activeTopic, indexWithinTopic);
    return `
      <div class="iv-card" data-act="open-question" data-question="${_esc(q.id)}">
        <div class="iv-card-head">
          <span class="iv-card-serial" dir="ltr">#${serial}</span>
          <div class="iv-card-title" dir="rtl">${_esc(q.title)}</div>
          ${badge}
        </div>
        <div class="iv-card-meta">${diff}${partsLabel}</div>
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
    if (part?.editor === 'verilog') {
      // Render an empty host; the actual CodeMirror view is mounted by
      // render() after the innerHTML swap and is preserved across renders.
      return `
        <div class="iv-check-wrap iv-check-wrap-code" dir="rtl">
          <div class="iv-code-header">
            <span class="iv-code-label">Verilog</span>
            <span class="iv-code-hint">כתוב את המודול בעורך למטה ולחץ "בדוק"</span>
          </div>
          <div class="iv-code-host" id="iv-cm-host" dir="ltr"></div>
          ${resultHtml}
          <div class="iv-code-actions">
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
               <span class="iv-circuit-hint">${q.circuitRevealsAnswer ? 'המעגל המלא של הפתרון — אפשר לטעון לקנבס ולהריץ.' : 'רוצה לבדוק בעצמך? אפשר לטעון את המעגל הזה לקנבס ולהריץ אותו.'}</span>
               <button class="iv-btn iv-btn-primary" data-act="load-circuit" title="המעגל הנוכחי שלך יישמר ויחזור כשתסיים">⤓ טען על הקנבס</button>
             </div>`)
      : '';
    const circuitHtml         = (this.engine.hasCircuit() && !q.circuitRevealsAnswer) ? circuitBarHtml : '';
    const circuitInAnswerHtml = (this.engine.hasCircuit() &&  q.circuitRevealsAnswer && answerShown) ? circuitBarHtml : '';

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

    const answerHtml = answerShown
      ? `<div class="iv-answer" dir="rtl">
           <div class="iv-answer-head">תשובה</div>
           ${answerSvgHtml}
           <div class="iv-answer-body">${_renderRichText(part.answer || '')}</div>
           ${circuitInAnswerHtml}
           <button class="iv-btn iv-btn-link" data-act="hide-answer">הסתר תשובה</button>
         </div>`
      : '';

    const qList = this.engine.listQuestions(this.topicId);
    const qIdx  = qList.findIndex(x => x.id === q.id);
    const serial = qIdx >= 0 ? serialFor(this.topicId, qIdx) : null;

    return `
      <div class="iv-question-head">
        ${serial ? `<span class="iv-question-serial" dir="ltr">#${serial}</span>` : ''}
        <div class="iv-question-title" dir="rtl">${_esc(q.title)}</div>
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
        ${this._renderAnswerCheck()}
        ${hintsHtml}
        ${answerHtml}
      </div>
      <div class="iv-actions">
        ${moreHints ? '<button class="iv-btn" data-act="hint">💡 רמז</button>' : ''}
        ${!answerShown ? '<button class="iv-btn iv-btn-warn" data-act="show-answer">הצג תשובה</button>' : ''}
        ${total > 1 ? `<button class="iv-btn" data-act="prev-part" ${this.engine.isFirstPart() ? 'disabled' : ''}>← סעיף קודם</button>` : ''}
        ${total > 1 ? `<button class="iv-btn iv-btn-primary" data-act="next-part" ${this.engine.isLastPart() ? 'disabled' : ''}>סעיף הבא →</button>` : ''}
        <button class="iv-btn ${isMastered ? 'iv-btn-mastered' : ''}" data-act="toggle-mastered" title="סמן/בטל סימון של 'אני שולט בזה'">
          ${isMastered ? '✓ שולט' : '✓ סמן כ-Mastered'}
        </button>
        <button class="iv-btn" data-act="back-to-catalog" title="חזרה לרשימת השאלות">↩ חזרה לתפריט</button>
      </div>
    `;
  }
}

// ── helpers ───────────────────────────────────────────────────

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
  const withMarkers = String(s).replace(/```(\w*)\n([\s\S]*?)\n```/g, (_, lang, code) => {
    codeBlocks.push({ lang: lang || '', code });
    return marker(codeBlocks.length - 1);
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
