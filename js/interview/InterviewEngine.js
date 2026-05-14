/**
 * InterviewEngine — state, navigation, progress persistence for the
 * INTERVIEW panel. Mirrors TutorialEngine's architecture but without the
 * scene snapshot / restore (interview prep is non-canvas) and without
 * validators (answers are open-ended text).
 *
 * Per-question shape — see IQ/README.md and IQ/timing-cdc/index.js. A
 * question may declare `parts` for multi-section problems; each part is
 * shown one at a time in the panel, each carries its own hints + answer.
 */

import { QUESTIONS_BY_TOPIC, listForTopic, findQuestion } from './questions.js';

const STORAGE_KEY = 'circuit_designer_pro__interview_progress_v1';

export class InterviewEngine {
  constructor(deps = {}) {
    // Optional canvas hooks. When all four are provided, the engine can
    // load a question's circuit onto the canvas (after snapshotting the
    // user's current scene so their work is restorable).
    this.scene    = deps.scene    || null;
    this.state    = deps.state    || null;
    this.commands = deps.commands || null;
    this.renderer = deps.renderer || null;       // { zoomToFit?(nodes) }

    this.active        = false;
    this.topicId       = null;
    this.questionId    = null;
    this.partIndex     = 0;
    this._partState    = {};
    this._sceneSnapshot = null;                  // pre-load scene for restore
    this._circuitLoaded = false;                 // currently displayed circuit?
    this._loadedKey     = null;                  // which (topic,question,part) is currently on the canvas
    this.onChange      = () => {};

    this.progress = this._loadProgress();
  }

  // ── catalog ─────────────────────────────────────────────────
  listQuestions(topicId) {
    return listForTopic(topicId).map(q => ({
      id:         q.id,
      topicId,
      title:      q.title,
      difficulty: q.difficulty || null,
      partCount:  Array.isArray(q.parts) ? q.parts.length : 1,
      status:     this._statusOf(topicId, q.id),
    }));
  }

  totalForTopic(topicId) {
    return listForTopic(topicId).length;
  }

  countByStatus(topicId, status) {
    return listForTopic(topicId).filter(q => this._statusOf(topicId, q.id) === status).length;
  }

  _statusOf(topicId, questionId) {
    const k = this._key(topicId, questionId);
    const p = this.progress[k];
    if (p?.mastered) return 'mastered';
    if (p?.seen)     return 'seen';
    return 'new';
  }

  // ── enter / exit ────────────────────────────────────────────
  enter(topicId, questionId) {
    const q = findQuestion(topicId, questionId);
    if (!q) return false;
    this.active     = true;
    this.topicId    = topicId;
    this.questionId = questionId;
    this.partIndex  = 0;
    this._partState = {};
    this._markSeen(topicId, questionId);
    this.onChange();
    return true;
  }

  exit() {
    // If we previously loaded a circuit onto the canvas, restore the
    // user's original work before leaving.
    if (this._circuitLoaded) this.restoreCircuit();
    this.active     = false;
    this.topicId    = null;
    this.questionId = null;
    this.partIndex  = 0;
    this._partState = {};
    this.onChange();
  }

  // ── circuit load / restore ──────────────────────────────────
  /**
   * Returns the circuit-builder function for the current view. The part
   * may override the question — useful for multi-part questions where
   * each part shows a different circuit (e.g. FA in part א vs. a
   * popcount tree in part ב).
   */
  _activeCircuitFn() {
    const part = this.currentPart();
    if (part && typeof part.circuit === 'function') return part.circuit;
    const q = this.currentQuestion();
    if (q && typeof q.circuit === 'function') return q.circuit;
    return null;
  }

  /** Likewise: part-level flag wins over question-level. */
  _activeCircuitRevealsAnswer() {
    const part = this.currentPart();
    if (part && part.circuitRevealsAnswer != null) return !!part.circuitRevealsAnswer;
    const q = this.currentQuestion();
    return !!(q && q.circuitRevealsAnswer);
  }

  hasCircuit() {
    return !!(this._activeCircuitFn() && this.scene);
  }

  isCircuitLoaded() { return this._circuitLoaded; }

  /**
   * Snapshot the user's current scene (idempotent — only snaps the first
   * time, so toggling load↔restore preserves the *original* canvas), then
   * deserialize the question's circuit.
   */
  loadCircuit() {
    const fn = this._activeCircuitFn();
    if (!fn || !this.scene) return false;
    try {
      if (!this._sceneSnapshot) {
        this._sceneSnapshot = JSON.stringify(this.scene.serialize());
      }
      const data = fn();
      this.scene.deserialize(data);
      this.state?.resetSequentialState?.(this.scene.nodes);
      this.commands?.clear?.();
      setTimeout(() => this.renderer?.zoomToFit?.(this.scene.nodes), 50);
      this._circuitLoaded = true;
      this._loadedKey     = `${this.topicId}::${this.questionId}:${this.partIndex}`;
      this.onChange();
      return true;
    } catch (err) {
      console.error('[interview] loadCircuit failed:', err);
      return false;
    }
  }

  restoreCircuit() {
    if (!this._sceneSnapshot || !this.scene) {
      this._circuitLoaded = false;
      this.onChange();
      return false;
    }
    try {
      const data = JSON.parse(this._sceneSnapshot);
      this.scene.deserialize(data);
      this.state?.resetSequentialState?.(this.scene.nodes);
      this.commands?.clear?.();
      setTimeout(() => this.renderer?.zoomToFit?.(this.scene.nodes), 50);
    } catch (err) {
      console.error('[interview] restoreCircuit failed:', err);
    }
    this._sceneSnapshot = null;
    this._circuitLoaded = false;
    this._loadedKey     = null;
    this.onChange();
    return true;
  }

  // ── current view ────────────────────────────────────────────
  currentQuestion() {
    if (!this.questionId) return null;
    return findQuestion(this.topicId, this.questionId);
  }

  /**
   * Returns the active "section" the user is reading: either a part of a
   * multi-part question, or — for a single-part question — the question
   * itself wrapped in the same shape so the panel renders uniformly.
   */
  currentPart() {
    const q = this.currentQuestion();
    if (!q) return null;
    if (Array.isArray(q.parts) && q.parts.length > 0) {
      return q.parts[this.partIndex] || null;
    }
    return {
      label:           null,
      question:        q.question || '',
      hints:           q.hints || [],
      answer:          q.answer || '',
      expectedAnswers: q.expectedAnswers || [],
    };
  }

  partCount() {
    const q = this.currentQuestion();
    if (!q) return 0;
    return Array.isArray(q.parts) ? q.parts.length : 1;
  }

  isLastPart() { return this.partIndex >= this.partCount() - 1; }
  isFirstPart() { return this.partIndex <= 0; }

  // ── per-part interactions ───────────────────────────────────
  _ps() {
    let s = this._partState[this.partIndex];
    if (!s) {
      s = { hintsShown: 0, answerShown: false, mindsetShown: false, lastCheck: null };
      this._partState[this.partIndex] = s;
    }
    return s;
  }

  mindsetShown() { return !!this._ps().mindsetShown; }
  hasMindset()   {
    const p = this.currentPart();
    const q = this.currentQuestion();
    return !!(p?.interviewerMindset || q?.interviewerMindset);
  }
  mindsetText() {
    const p = this.currentPart();
    if (p?.interviewerMindset) return p.interviewerMindset;
    return this.currentQuestion()?.interviewerMindset || '';
  }
  toggleMindset() {
    this._ps().mindsetShown = !this._ps().mindsetShown;
    this.onChange();
  }

  /**
   * Check the user's typed answer against `part.expectedAnswers`. Returns
   * (and stores in lastCheck) `{ ok, message }`. Match logic:
   *   • case-insensitive
   *   • whitespace trimmed
   *   • passes if any expectedAnswers[] entry is a substring of the typed
   *     input — accommodates "hold" vs "hold time" vs "tHold" naturally.
   */
  checkAnswer(typed) {
    const part = this.currentPart();
    if (!part?.expectedAnswers?.length) return null;
    const normTyped = String(typed || '').trim().toLowerCase();
    if (!normTyped) {
      const r = { ok: false, message: 'הקלד תשובה לפני הבדיקה.' };
      this._ps().lastCheck = r; this.onChange(); return r;
    }
    const ok = part.expectedAnswers.some(a => normTyped.includes(String(a).trim().toLowerCase()));
    const r = ok
      ? { ok: true,  message: '✓ נכון!' }
      : { ok: false, message: '✗ לא בדיוק. נסה שוב או הסתכל ברמזים.' };
    this._ps().lastCheck = r;
    this.onChange();
    return r;
  }

  lastCheck() { return this._ps().lastCheck; }
  hasCheckable() { return Array.isArray(this.currentPart()?.expectedAnswers) && this.currentPart().expectedAnswers.length > 0; }

  visibleHints() {
    const part = this.currentPart();
    if (!part?.hints) return [];
    return part.hints.slice(0, this._ps().hintsShown);
  }

  remainingHintCount() {
    const part = this.currentPart();
    if (!part?.hints) return 0;
    return Math.max(0, part.hints.length - this._ps().hintsShown);
  }

  revealHint() {
    const part = this.currentPart();
    if (!part?.hints) return null;
    const s = this._ps();
    if (s.hintsShown >= part.hints.length) return null;
    const hint = part.hints[s.hintsShown];
    s.hintsShown++;
    this.onChange();
    return hint;
  }

  answerShown() { return !!this._ps().answerShown; }

  showAnswer() {
    this._ps().answerShown = true;
    // When the circuit IS the solution, drop it onto the canvas right
    // away — saves the user a second click and matches the "reveal
    // the answer" mental model. Part-level circuit takes precedence,
    // so a multi-part question can reveal a different circuit per part.
    //
    // Reload also when a DIFFERENT part's circuit is already loaded
    // (otherwise navigating from part א → part ב would leave the old
    // canvas in place even though this part has its own circuit).
    if (this._activeCircuitRevealsAnswer() && this.hasCircuit()) {
      const wantKey = `${this.topicId}::${this.questionId}:${this.partIndex}`;
      if (!this._circuitLoaded || this._loadedKey !== wantKey) {
        this.loadCircuit();
        return; // loadCircuit() already fired onChange()
      }
    }
    this.onChange();
  }

  hideAnswer() {
    this._ps().answerShown = false;
    this.onChange();
  }

  // ── navigation ──────────────────────────────────────────────
  nextPart() {
    if (this.partIndex < this.partCount() - 1) {
      this.partIndex++;
      this.onChange();
    }
  }

  prevPart() {
    if (this.partIndex > 0) {
      this.partIndex--;
      this.onChange();
    }
  }

  // ── progress persistence ────────────────────────────────────
  toggleMastered() {
    if (!this.questionId) return;
    const k = this._key(this.topicId, this.questionId);
    const cur = this.progress[k] || { seen: true };
    cur.mastered = !cur.mastered;
    cur.seen = true;
    this.progress[k] = cur;
    this._saveProgress();
    this.onChange();
  }

  /** Toggle the "bookmarked" flag on the active question. Orthogonal
   *  to `mastered` — a user can star a question they haven't solved
   *  to come back to it later. */
  toggleBookmark() {
    if (!this.questionId) return;
    const k = this._key(this.topicId, this.questionId);
    const cur = this.progress[k] || { seen: true };
    cur.bookmarked = !cur.bookmarked;
    cur.seen = true;
    this.progress[k] = cur;
    this._saveProgress();
    this.onChange();
  }

  isBookmarked(topicId, questionId) {
    const k = this._key(topicId, questionId);
    return !!this.progress[k]?.bookmarked;
  }

  _markSeen(topicId, questionId) {
    const k = this._key(topicId, questionId);
    const cur = this.progress[k] || {};
    if (!cur.seen) {
      cur.seen = true;
      this.progress[k] = cur;
      this._saveProgress();
    }
  }

  _key(topicId, questionId) { return `${topicId}::${questionId}`; }

  _loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  _saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress)); } catch (_) {}
  }
}
