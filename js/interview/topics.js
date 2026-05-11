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

export const TOPICS = [
  {
    id: 'logic',
    tabNumber: 1,
    label: 'Logic',
    icon: '⊕',
    description: 'Combinational logic, Boolean algebra, Karnaugh maps, MUX/DEMUX, decoders, encoders.',
  },
  {
    id: 'sequential',
    tabNumber: 2,
    label: 'Sequential',
    icon: '⏱',
    description: 'Flip-flops, latches, FSMs (Mealy / Moore), counters, shift registers.',
  },
  {
    id: 'verilog',
    tabNumber: 3,
    label: 'Verilog',
    icon: '⌘',
    description: 'Syntax, blocking vs non-blocking, race conditions, coding-style traps, synthesizable subset.',
  },
  {
    id: 'architecture',
    tabNumber: 4,
    label: 'Architecture',
    icon: '◉',
    description: 'Pipelining, hazards, forwarding, branch prediction, cache, ISA design.',
  },
  {
    id: 'timing-cdc',
    tabNumber: 5,
    label: 'Timing & CDC',
    icon: '⏲',
    description: 'Setup / hold, clock skew, metastability, synchronizers, clock-domain crossing.',
  },
  {
    id: 'dft',
    tabNumber: 6,
    label: 'DFT',
    icon: '⌬',
    description: 'Scan chains, BIST, JTAG, fault models, coverage.',
  },
  {
    id: 'puzzles',
    tabNumber: 7,
    label: 'חידות',
    icon: '★',
    description: 'Brain teasers, math / logic puzzles often asked in technical interviews.',
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
