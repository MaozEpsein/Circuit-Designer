/**
 * Tutorial entry — single function the host app awaits on first toggle.
 * Lazy-loaded by app.js so users who never click 🎓 pay zero cost.
 */
import { TutorialEngine } from './TutorialEngine.js';
import { LessonPanel }    from './LessonPanel.js';

export function createTutorial(deps) {
  const engine = new TutorialEngine(deps);
  const panel  = new LessonPanel(engine);
  return { engine, panel };
}
