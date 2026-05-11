/**
 * Interview-prep entry — single function the host app awaits on first toggle.
 * Lazy-loaded by app.js so users who never click 💼 pay zero cost.
 *
 * `deps` are optional. When provided ({ scene, state, commands, renderer })
 * the engine can load a question's `circuit` onto the canvas and restore
 * the user's previous scene on exit.
 */
import { InterviewEngine } from './InterviewEngine.js';
import { InterviewPanel }  from './InterviewPanel.js';

export function createInterview(deps) {
  const engine = new InterviewEngine(deps);
  const panel  = new InterviewPanel(engine);
  return { engine, panel };
}
