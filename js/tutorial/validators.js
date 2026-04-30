/**
 * validators.js — read-only checks against the live scene.
 *
 * Each validator returns:
 *   { ok: boolean, message: string, details?: any }
 *
 * Validators MUST NOT mutate persistent scene state. The truthTable validator
 * temporarily writes input.fixedValue, but always restores the originals in a
 * try/finally before returning, so the canvas is left identical to how the
 * learner had it.
 */

import { evaluate } from '../engine/SimulationEngine.js';
import { COMPONENT_TYPES } from '../components/Component.js';

function _sortedIO(scene, type) {
  return scene.nodes
    .filter(n => n.type === type)
    .slice()
    .sort((a, b) => {
      const la = (a.label || '').toUpperCase();
      const lb = (b.label || '').toUpperCase();
      if (la !== lb) return la < lb ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
}

export function validateTruthTable(scene, expected) {
  const ins  = _sortedIO(scene, COMPONENT_TYPES.INPUT);
  const outs = _sortedIO(scene, COMPONENT_TYPES.OUTPUT);

  if (ins.length === 0)  return { ok: false, message: 'אין שום INPUT על ה-canvas.' };
  if (outs.length === 0) return { ok: false, message: 'אין שום OUTPUT על ה-canvas.' };

  const expectedCols = expected[0]?.length ?? 0;
  const expectedIns  = Math.log2(expected.length);
  if (!Number.isInteger(expectedIns) || expectedIns !== ins.length) {
    return {
      ok: false,
      message: `המעגל זקוק לבדיוק ${Math.log2(expected.length)} קלטים — מצאתי ${ins.length}.`,
    };
  }
  const expectedOuts = expectedCols - ins.length;
  if (outs.length !== expectedOuts) {
    return {
      ok: false,
      message: `המעגל זקוק לבדיוק ${expectedOuts} פלטים — מצאתי ${outs.length}.`,
    };
  }

  const numCombos = expected.length;
  const originals = ins.map(n => n.fixedValue);
  const actualRows = [];

  try {
    for (let combo = 0; combo < numCombos; combo++) {
      for (let i = 0; i < ins.length; i++) {
        ins[i].fixedValue = (combo >> (ins.length - 1 - i)) & 1;
      }
      const result = evaluate(scene.nodes, scene.wires, new Map(), 0);
      const row = [];
      for (let i = 0; i < ins.length; i++) row.push(ins[i].fixedValue);
      for (const o of outs) row.push(result.nodeValues.get(o.id) ?? null);
      actualRows.push(row);
    }
  } finally {
    for (let i = 0; i < ins.length; i++) ins[i].fixedValue = originals[i];
  }

  for (let r = 0; r < numCombos; r++) {
    for (let c = 0; c < expectedCols; c++) {
      if (actualRows[r][c] !== expected[r][c]) {
        const inputStr = expected[r].slice(0, ins.length).join('');
        return {
          ok: false,
          message: `שורה ${inputStr}: ציפיתי לפלט ${expected[r].slice(ins.length).join('')}, קיבלתי ${actualRows[r].slice(ins.length).map(v => v ?? '?').join('')}.`,
          details: { actualRows, expected },
        };
      }
    }
  }

  return { ok: true, message: 'מעולה! טבלת האמת תואמת בדיוק.' };
}

export function validateHasComponent(scene, kind, count = 1) {
  const target = String(kind).toUpperCase();
  const found = scene.nodes.filter(n => String(n.type).toUpperCase() === target).length;
  if (found >= count) {
    return { ok: true, message: `נמצאו ${found} רכיבי ${target}.` };
  }
  return {
    ok: false,
    message: `דרושים ${count} רכיבי ${target} לפחות, מצאתי ${found}.`,
  };
}

export function runValidator(scene, spec) {
  if (!spec || !spec.type) return { ok: true, message: 'ידני — סמן השלמה.' };
  switch (spec.type) {
    case 'truthTable':
      return validateTruthTable(scene, spec.expected);
    case 'hasComponent':
      return validateHasComponent(scene, spec.kind, spec.count ?? 1);
    case 'manual':
      return { ok: true, message: 'ידני — סמן השלמה.' };
    default:
      return { ok: false, message: `Validator לא מוכר: ${spec.type}` };
  }
}
