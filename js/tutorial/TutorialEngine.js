/**
 * TutorialEngine — orchestrates lesson state, snapshots, and validation.
 *
 * Design contract: this engine is a strict OVERLAY. Entering or exiting the
 * tutorial MUST leave the rest of the application functioning identically.
 *
 *   - On enter: snapshot the current scene + sequential state, so leaving the
 *     tutorial restores the exact circuit the learner was working on.
 *   - On exit:  restore the snapshot. No tutorial state leaks elsewhere.
 *   - Validators are read-only (see validators.js).
 *   - Progress is persisted under a single localStorage key, isolated from
 *     the existing 'circuit_designer_pro' key.
 */

import { LESSONS, findLesson } from './lessons.js';
import { runValidator } from './validators.js';
import { hasSolution, buildSolution } from './solutions.js';

const STORAGE_KEY = 'circuit_designer_pro__tutorial_progress_v1';

export class TutorialEngine {
  constructor({ scene, state, commands, renderer, onChange }) {
    this.scene    = scene;
    this.state    = state;
    this.commands = commands;
    this.renderer = renderer;          // { zoomToFit?, requestRender? }
    this.onChange = onChange || (() => {});

    this.active       = false;
    this.lessonId     = null;
    this.stepIndex    = 0;
    this.hintsShown   = 0;
    this._sceneSnapshot = null;
    this._lastResult    = null;       // last validator result

    this.progress = this._loadProgress();
  }

  // ── lesson catalog ──────────────────────────────────────────
  listLessons() {
    return LESSONS.map(l => ({
      id: l.id,
      track: l.track || 'basics',
      title: l.title,
      summary: l.summary,
      stepCount: l.steps.length,
      completed: !!this.progress[l.id]?.completed,
      furthestStep: this.progress[l.id]?.furthestStep ?? 0,
    }));
  }

  // ── enter / exit ────────────────────────────────────────────
  enter(lessonId) {
    const lesson = findLesson(lessonId);
    if (!lesson) return false;

    if (!this.active) this._snapshotScene();

    this.active     = true;
    this.lessonId   = lessonId;
    this.stepIndex  = 0;
    this.hintsShown = 0;
    this._lastResult = null;

    this._loadStepInitialCircuit();
    this.onChange();
    return true;
  }

  exit() {
    if (!this.active) return;
    this._restoreScene();
    this.active     = false;
    this.lessonId   = null;
    this.stepIndex  = 0;
    this.hintsShown = 0;
    this._lastResult = null;
    this.onChange();
  }

  // ── current view ────────────────────────────────────────────
  currentLesson() {
    return this.lessonId ? findLesson(this.lessonId) : null;
  }
  currentStep() {
    const l = this.currentLesson();
    return l ? l.steps[this.stepIndex] : null;
  }
  lastResult() { return this._lastResult; }

  // ── interactions ────────────────────────────────────────────
  check() {
    const step = this.currentStep();
    if (!step) return null;
    const result = runValidator(this.scene, step.validate);
    this._lastResult = result;
    if (result.ok) this._markFurthest(this.stepIndex);
    this.onChange();
    return result;
  }

  next() {
    const lesson = this.currentLesson();
    if (!lesson) return;
    if (this.stepIndex < lesson.steps.length - 1) {
      this.stepIndex++;
      this.hintsShown = 0;
      this._lastResult = null;
      this._loadStepInitialCircuit();
    } else {
      this._markCompleted();
    }
    this.onChange();
  }

  prev() {
    if (this.stepIndex > 0) {
      this.stepIndex--;
      this.hintsShown = 0;
      this._lastResult = null;
      this._loadStepInitialCircuit();
      this.onChange();
    }
  }

  hasSolutionForCurrentStep() {
    return this.lessonId != null && hasSolution(this.lessonId, this.stepIndex);
  }

  loadSolution() {
    if (!this.lessonId) return false;
    const data = buildSolution(this.lessonId, this.stepIndex);
    if (!data) return false;
    try {
      this.scene.deserialize(data);
      this.state?.resetSequentialState?.(this.scene.nodes);
      this.commands?.clear?.();
      setTimeout(() => this.renderer?.zoomToFit?.(this.scene.nodes), 50);
      this._lastResult = { ok: true, message: 'Solution loaded — your previous work is restored when you exit Learn Mode.' };
      this.onChange();
      return true;
    } catch (_) {
      return false;
    }
  }

  revealHint() {
    const step = this.currentStep();
    if (!step || !step.hints) return null;
    if (this.hintsShown >= step.hints.length) return null;
    const hint = step.hints[this.hintsShown];
    this.hintsShown++;
    this.onChange();
    return hint;
  }

  visibleHints() {
    const step = this.currentStep();
    if (!step || !step.hints) return [];
    return step.hints.slice(0, this.hintsShown);
  }

  // ── scene snapshot helpers ──────────────────────────────────
  _snapshotScene() {
    try {
      this._sceneSnapshot = JSON.stringify(this.scene.serialize());
    } catch (_) {
      this._sceneSnapshot = null;
    }
  }

  _restoreScene() {
    if (!this._sceneSnapshot) {
      this._clearScene();
      return;
    }
    try {
      const data = JSON.parse(this._sceneSnapshot);
      this.scene.deserialize(data);
      this.state?.resetSequentialState?.(this.scene.nodes);
      this.commands?.clear?.();
      setTimeout(() => this.renderer?.zoomToFit?.(this.scene.nodes), 50);
    } catch (_) {
      this._clearScene();
    }
    this._sceneSnapshot = null;
  }

  _loadStepInitialCircuit() {
    const step = this.currentStep();
    if (step && step.initialCircuit) {
      try {
        this.scene.deserialize(step.initialCircuit);
        this.state?.resetSequentialState?.(this.scene.nodes);
        this.commands?.clear?.();
        setTimeout(() => this.renderer?.zoomToFit?.(this.scene.nodes), 50);
      } catch (_) { /* ignore */ }
    }
  }

  _clearScene() {
    this.scene.deserialize({ nodes: [], wires: [] });
    this.commands?.clear?.();
  }

  // ── progress persistence ────────────────────────────────────
  _loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }
  _saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress)); } catch (_) {}
  }
  _markFurthest(idx) {
    if (!this.lessonId) return;
    const cur = this.progress[this.lessonId] || {};
    cur.furthestStep = Math.max(cur.furthestStep ?? 0, idx);
    this.progress[this.lessonId] = cur;
    this._saveProgress();
  }
  _markCompleted() {
    if (!this.lessonId) return;
    const cur = this.progress[this.lessonId] || {};
    cur.completed = true;
    cur.furthestStep = (this.currentLesson()?.steps.length ?? 1) - 1;
    this.progress[this.lessonId] = cur;
    this._saveProgress();
  }
}
