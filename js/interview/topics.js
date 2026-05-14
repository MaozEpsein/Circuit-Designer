/**
 * Interview prep — topic catalogue.
 *
 * One entry per tab in the INTERVIEW panel. Each topic owns a folder under
 * the project's `IQ/` directory; the panel reads question files from there
 * at runtime (currently no loader — the placeholder UI just lists the
 * topics until the user populates IQ/).
 *
 * To add / remove / rename a tab, edit the array below. The id is used as
 * the IQ subfolder name and as the active-tab key in panel state.
 */

// Tabs are listed in *display order*. `tabNumber` is a separate, stable
// identifier embedded in each question's 4-digit serial (see `serialFor`)
// — DO NOT renumber existing tabs, or saved/printed serials become wrong.
// New tabs take the next free integer.
export const TOPICS = [
  {
    id: 'logic',
    tabNumber: 1,
    label: 'לוגיקה קומבינטורית',
    icon: '⊕',
    description: 'אלגברה בוליאנית, מפות קרנו, MUX/DEMUX, מקודדים ומפענחים, סוגיות CMOS ברמת השער.',
  },
  {
    id: 'sequential',
    tabNumber: 2,
    label: 'מעגלים סדרתיים',
    icon: '⏱',
    description: 'Flip-flops, latches, מכונות מצב (Mealy / Moore), מונים, אוגרי הזזה, גלאי רצפים.',
  },
  {
    id: 'verilog',
    tabNumber: 3,
    label: 'Verilog',
    icon: '⌘',
    description: 'תחביר, blocking מול non-blocking, מרוצי תזמון, מלכודות סגנון, תת-הקבוצה הסינתזבילית.',
  },
  {
    id: 'architecture',
    tabNumber: 4,
    label: 'ארכיטקטורה',
    icon: '◉',
    description: 'Pipelining, hazards, forwarding, ניבוי הסתעפויות, מטמון, תכנון ISA.',
  },
  {
    id: 'timing-cdc',
    tabNumber: 5,
    label: 'תזמון ו-CDC',
    icon: '⏲',
    description: 'Setup / hold, clock skew, מטא-יציבות, סינכרונייזרים, מעבר בין תחומי שעון.',
  },
  {
    id: 'dft',
    tabNumber: 6,
    label: 'DFT וטסט',
    icon: '⌬',
    description: 'Scan chains, BIST, JTAG, מודלים של תקלות, fault coverage.',
  },
  {
    // Display this tab AFTER puzzles in the catalogue UI, but keep its
    // `tabNumber` higher than puzzles so the existing 7xxx serials of the
    // puzzles topic remain stable. New algorithm questions get 8xxx.
    id: 'algorithms',
    tabNumber: 8,
    label: 'קוד',
    icon: '⌗',
    description: 'שאלות תכנות אלגוריתמיות — מבני נתונים, מורכבות, פתרונות **בפייתון בלבד**.',
  },
  {
    id: 'puzzles',
    tabNumber: 7,
    label: 'חידות',
    icon: '★',
    description: 'חידות מתמטיקה/לוגיקה הנפוצות בראיונות טכניים.',
  },
];

export function findTopic(id) {
  return TOPICS.find(t => t.id === id) || null;
}

/**
 * 4-digit serial for an interview question.
 *   digit 1   = topic.tabNumber (1..7)
 *   digits 2-4 = 1-based index within the topic, zero-padded
 *
 * E.g. the 1st question under `sequential` (tabNumber 2) → "2001".
 * Returns null if the topic id is unknown.
 */
export function serialFor(topicId, indexWithinTopic) {
  const t = findTopic(topicId);
  if (!t) return null;
  return `${t.tabNumber}${String(indexWithinTopic + 1).padStart(3, '0')}`;
}

/**
 * Resolve a question id to its 4-digit serial. Returns null if not found.
 */
export function serialForQuestion(topicId, questionId, listForTopic) {
  const list = listForTopic(topicId);
  const idx = list.findIndex(q => q.id === questionId);
  if (idx < 0) return null;
  return serialFor(topicId, idx);
}
