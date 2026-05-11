/**
 * questions.js — single import surface for all interview-topic questions.
 *
 * Static imports per topic so the bundler / module loader resolves them at
 * load time. Adding a new topic? Add a folder under IQ/, add an empty
 * `export const QUESTIONS = []` to its index.js, and add an import line +
 * map entry below.
 */

import { QUESTIONS as logic }        from '../../IQ/logic/index.js';
import { QUESTIONS as sequential }   from '../../IQ/sequential/index.js';
import { QUESTIONS as verilog }      from '../../IQ/verilog/index.js';
import { QUESTIONS as architecture } from '../../IQ/architecture/index.js';
import { QUESTIONS as timingCdc }    from '../../IQ/timing-cdc/index.js';
import { QUESTIONS as dft }          from '../../IQ/dft/index.js';
import { QUESTIONS as puzzles }      from '../../IQ/puzzles/index.js';

/**
 * Topic id → array of question objects. Keys must match the `id` field in
 * `topics.js` so the panel's tab → questions lookup is direct.
 */
export const QUESTIONS_BY_TOPIC = {
  'logic':        logic,
  'sequential':   sequential,
  'verilog':      verilog,
  'architecture': architecture,
  'timing-cdc':   timingCdc,
  'dft':          dft,
  'puzzles':      puzzles,
};

export function listForTopic(topicId) {
  return QUESTIONS_BY_TOPIC[topicId] || [];
}

export function findQuestion(topicId, questionId) {
  return (QUESTIONS_BY_TOPIC[topicId] || []).find(q => q.id === questionId) || null;
}

/** Total question count across every topic — used in the catalog header. */
export function totalCount() {
  return Object.values(QUESTIONS_BY_TOPIC).reduce((n, arr) => n + arr.length, 0);
}
