/**
 * LessonPanel — right-side overlay UI for the tutorial system.
 *
 * Two views:
 *   - catalog: list of lessons with progress
 *   - lesson:  current step, hint button, check/next/prev, exit
 *
 * "Show Solution" replaces the learner's current work with the canonical
 * answer. The original work is recoverable: the engine snapshotted it on
 * tutorial entry and restores it on exit.
 *
 * Built lazily on first show; pure DOM, no framework.
 */

import { TRACKS } from './lessons.js';

export class LessonPanel {
  constructor(engine) {
    this.engine = engine;
    this.engine.onChange = () => this.render();
    this.root = null;
    this.view = 'catalog';
    this.activeTrack = TRACKS[0].id;
  }

  show() {
    if (!this.root) this._build();
    this.root.classList.remove('hidden');
    this.view = this.engine.active ? 'lesson' : 'catalog';
    this.render();
  }

  hide() {
    if (this.root) this.root.classList.add('hidden');
  }

  isVisible() {
    return this.root && !this.root.classList.contains('hidden');
  }

  toggle() {
    if (this.isVisible()) this.hide(); else this.show();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'tutorial-panel';
    el.className = 'hidden';
    el.innerHTML = `
      <div id="tutorial-panel-header">
        <span>🎓 LEARN MODE</span>
        <button class="tut-x" data-act="close" title="Close (your circuit is restored)">CLOSE</button>
      </div>
      <div id="tutorial-panel-body"></div>
      <div id="tut-confirm" class="hidden">
        <div class="tut-confirm-box">
          <div class="tut-confirm-title">Show solution?</div>
          <div class="tut-confirm-text">
            Loading the solution will replace your current work on the canvas with the canonical answer.<br/><br/>
            Your original circuit (from before you entered Learn Mode) will still be restored automatically when you exit.<br/><br/>
            Continue?
          </div>
          <div class="tut-confirm-actions">
            <button class="tut-btn" data-act="confirm-no">Cancel</button>
            <button class="tut-btn tut-btn-danger" data-act="confirm-yes">Yes, show me</button>
          </div>
        </div>
      </div>
      <div id="tut-completion" class="hidden">
        <div class="tut-completion-box">
          <div class="tut-completion-title" id="tut-completion-title"></div>
          <div class="tut-completion-text" id="tut-completion-text"></div>
          <div class="tut-confirm-actions">
            <button class="tut-btn" data-act="completion-continue">Continue →</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    this.root = el;
    el.addEventListener('click', (e) => this._onClick(e));
  }

  _onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'close') {
      // Hide the panel without exiting the lesson — the learner keeps the
      // current circuit on the canvas to continue working with it outside
      // Learn Mode. Reopening LEARN returns them to the same lesson state.
      // To actually exit and restore the pre-tutorial circuit, use the
      // "↩ Back to menu" button inside a lesson (which calls engine.exit()).
      this.hide();
    } else if (act === 'open-lesson') {
      this.engine.enter(t.dataset.lessonId);
      this.view = 'lesson';
    } else if (act === 'switch-track') {
      this.activeTrack = t.dataset.track;
      this.render();
      return;
    } else if (act === 'check') {
      this.engine.check();
    } else if (act === 'next') {
      const lesson = this.engine.currentLesson();
      if (lesson && this.engine.stepIndex >= lesson.steps.length - 1) {
        // Last step. Mark completed first; then either show the lesson's
        // optional `completion` recap modal (which delays the exit) or
        // exit straight to the catalog as before.
        this.engine.next();          // marks completed
        if (lesson.completion) {
          this._showCompletion(lesson.completion);
        } else {
          this.engine.exit();
          this.view = 'catalog';
        }
      } else {
        this.engine.next();
      }
    } else if (act === 'completion-continue') {
      this._hideCompletion();
      this.engine.exit();
      this.view = 'catalog';
      this.render();
    } else if (act === 'prev') {
      this.engine.prev();
    } else if (act === 'hint') {
      this.engine.revealHint();
    } else if (act === 'back-to-catalog') {
      this.engine.exit();
      this.view = 'catalog';
      this.render();
    } else if (act === 'show-solution') {
      this._showConfirm();
    } else if (act === 'confirm-no') {
      this._hideConfirm();
    } else if (act === 'confirm-yes') {
      this._hideConfirm();
      this.engine.loadSolution();
    } else if (act === 'copy-code') {
      this._copyCode(t);
    }
  }

  _copyCode(btn) {
    const block = btn.closest('.tut-code')?.querySelector('.tut-code-text');
    if (!block) return;
    const text = block.textContent || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      }).catch(() => { btn.textContent = 'Copy failed'; });
    }
  }

  _renderCodeBlock(cb) {
    if (!cb || !cb.code) return '';
    const lang = (cb.language || 'code').toUpperCase();
    const title = cb.title ? _esc(cb.title) : '';
    return `
      <div class="tut-code">
        <div class="tut-code-head">
          <span class="tut-code-lang">${_esc(lang)}</span>
          ${title ? `<span class="tut-code-title">${title}</span>` : ''}
          <button class="tut-code-copy" data-act="copy-code">Copy</button>
        </div>
        <pre class="tut-code-text">${_esc(cb.code)}</pre>
      </div>`;
  }

  _showConfirm() {
    const c = this.root.querySelector('#tut-confirm');
    if (c) c.classList.remove('hidden');
  }
  _hideConfirm() {
    const c = this.root.querySelector('#tut-confirm');
    if (c) c.classList.add('hidden');
  }

  _showCompletion(payload) {
    const root  = this.root.querySelector('#tut-completion');
    const title = this.root.querySelector('#tut-completion-title');
    const text  = this.root.querySelector('#tut-completion-text');
    if (!root || !title || !text) return;
    title.textContent = payload.title || 'Lesson complete';
    // Body is intentionally HTML so lessons can use <ul>, <strong>,
    // <code>, <p>, etc. Only authored by us in lessons.js — never
    // user input — so direct innerHTML is acceptable here.
    text.innerHTML = payload.body || '';
    root.classList.remove('hidden');
  }
  _hideCompletion() {
    const c = this.root.querySelector('#tut-completion');
    if (c) c.classList.add('hidden');
  }

  render() {
    if (!this.root) return;
    const body = this.root.querySelector('#tutorial-panel-body');
    if (!body) return;
    body.innerHTML = (this.view === 'lesson' && this.engine.active)
      ? this._renderLesson()
      : this._renderCatalog();
  }

  _renderCatalog() {
    const allLessons = this.engine.listLessons();
    const byTrack = new Map();
    for (const l of allLessons) {
      const tr = (l.track || 'basics');
      if (!byTrack.has(tr)) byTrack.set(tr, []);
      byTrack.get(tr).push(l);
    }

    const tabsHtml = TRACKS.map(tr => {
      const lessons = byTrack.get(tr.id) || [];
      const done = lessons.filter(l => l.completed).length;
      const total = lessons.length;
      const isActive = tr.id === this.activeTrack;
      return `
        <button class="tut-tab${isActive ? ' tut-tab-active' : ''}" data-act="switch-track" data-track="${tr.id}">
          <span class="tut-tab-label">${_esc(tr.label)}</span>
          <span class="tut-tab-count">${done}/${total}</span>
        </button>`;
    }).join('');

    const lessons = byTrack.get(this.activeTrack) || [];
    const cards = lessons.length === 0
      ? '<div class="tut-catalog-empty">No lessons in this track yet.</div>'
      : lessons.map(l => {
          const badge = l.completed
            ? '<span class="tut-badge tut-badge-done">✓ DONE</span>'
            : (l.furthestStep > 0
                ? `<span class="tut-badge tut-badge-progress">${l.furthestStep + 1}/${l.stepCount}</span>`
                : '<span class="tut-badge">NEW</span>');
          return `
            <div class="tut-card" data-act="open-lesson" data-lesson-id="${l.id}">
              <div class="tut-card-head">
                <div class="tut-card-title">${_esc(l.title)}</div>
                ${badge}
              </div>
              <div class="tut-card-summary">${_esc(l.summary)}</div>
            </div>`;
        }).join('');

    return `
      <div class="tut-catalog-intro">
        Pick a guided lesson. Your current circuit is saved and will be restored when you close Learn Mode.
      </div>
      <div class="tut-tabs">${tabsHtml}</div>
      <div class="tut-cards">${cards}</div>
    `;
  }

  _renderLesson() {
    const lesson = this.engine.currentLesson();
    const step   = this.engine.currentStep();
    if (!lesson || !step) return '';
    const total = lesson.steps.length;
    const idx   = this.engine.stepIndex;
    const result = this.engine.lastResult();
    const hints = this.engine.visibleHints();
    const moreHints = (step.hints?.length ?? 0) > hints.length;
    const isLast = idx >= total - 1;
    const hasSolution = this.engine.hasSolutionForCurrentStep();

    const hintsHtml = hints.map((h, i) =>
      `<div class="tut-hint">💡 Hint ${i + 1}: ${_esc(h)}</div>`
    ).join('');

    let resultHtml = '';
    if (result) {
      const cls = result.ok ? 'tut-result-ok' : 'tut-result-bad';
      const icon = result.ok ? '✓' : '✗';
      resultHtml = `<div class="tut-result ${cls}">${icon} ${_esc(result.message)}</div>`;
    }

    const passed = !!result?.ok;
    const nextLabel = isLast ? 'Finish lesson' : 'Next step →';
    // Only allow advancing once the validator has accepted this step. The
    // legitimate way to bypass a step is "Show solution", which loads the
    // canonical answer (after which Check passes naturally).
    const nextBtn = passed
      ? `<button class="tut-btn tut-btn-primary" data-act="next">${nextLabel}</button>`
      : '';

    return `
      <div class="tut-lesson-head">
        <div class="tut-lesson-title">${_esc(lesson.title)}</div>
        <div class="tut-lesson-progress">Step ${idx + 1} / ${total}</div>
      </div>
      <div class="tut-instruction">${_esc(step.instruction)}</div>
      ${this._renderCodeBlock(step.codeBlock)}
      ${hintsHtml}
      ${resultHtml}
      <div class="tut-actions">
        <button class="tut-btn tut-btn-primary" data-act="check">Check</button>
        ${moreHints ? '<button class="tut-btn" data-act="hint">Hint</button>' : ''}
        ${hasSolution ? '<button class="tut-btn tut-btn-warn" data-act="show-solution" title="Replace your work with the solution">Show solution</button>' : ''}
        <button class="tut-btn" data-act="prev" ${idx === 0 ? 'disabled' : ''}>← Previous</button>
        ${nextBtn}
        <button class="tut-btn" data-act="back-to-catalog" title="Return to the lesson list — no progress is lost">↩ Back to menu</button>
      </div>
    `;
  }
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
