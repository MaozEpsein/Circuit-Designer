// Pure-function tests for the geometric routing engine.
// No simulation, no nodes — just (x, y) → path arrays.
//
// What we lock down:
//   - computeRoute basic shapes: straight, L, backward, degenerate.
//   - User waypoints appear in the resulting path (snapped to grid).
//   - channelOffset changes the route topology (parallel-wire spacing).
//   - The obstacles parameter is accepted without throwing.
//   - simplifyPath collapses duplicate and collinear points; preserves
//     real bends; handles empty / single-point inputs.
//   - detectJunctions takes a Map<wireId, path[]> and finds shared
//     endpoints/bends (does NOT detect arbitrary segment crossings —
//     that's a separate, intentional design decision).
//   - computeChannelOffset returns 0 for a lone wire.
//
// Note on "obstacle avoidance": the router scores 4 fixed candidate
// paths (HVH, VHV, HVH-shifted, L-bend) and picks the lowest-cost,
// where each collision with an obstacle bbox costs 10000. If ALL
// 4 candidates collide, it picks the simplest anyway. This means
// the router avoids obstacles "when at least one of the 4 standard
// patterns naturally goes around" — not in arbitrary cases. This
// test verifies the API contract (no throw, returns a valid path)
// rather than a specific avoidance trajectory, since the trajectory
// is a heuristic that may evolve.
//
// Run:  node examples/tests/test-wire-routing.mjs

import {
  computeRoute, simplifyPath, detectJunctions, computeChannelOffset,
} from '../../js/routing/WireRouter.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// All paths returned by computeRoute should be Manhattan: every pair
// of consecutive points shares either the same x or the same y.
function isManhattan(path) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}
const eq = (a, b) => a.x === b.x && a.y === b.y;

// ── 1. Straight routes ────────────────────────────────────────
console.log('[1] computeRoute — straight routes');
{
  const horiz = computeRoute({ x: 0, y: 0 }, { x: 100, y: 0 });
  check('straight horizontal: 2 points',                horiz.length === 2);
  check('straight horizontal: src + dst',                eq(horiz[0], { x: 0, y: 0 }) && eq(horiz[1], { x: 100, y: 0 }));
  check('straight horizontal: Manhattan',                isManhattan(horiz));

  const vert = computeRoute({ x: 0, y: 0 }, { x: 0, y: 100 });
  check('straight vertical: 2 points',                  vert.length === 2);
  check('straight vertical: src + dst',                  eq(vert[0], { x: 0, y: 0 }) && eq(vert[1], { x: 0, y: 100 }));
}

// ── 2. L-shaped routes ────────────────────────────────────────
console.log('\n[2] computeRoute — L-shape with one bend');
{
  const route = computeRoute({ x: 0, y: 0 }, { x: 100, y: 50 });
  check('L-shape: 3 points',                             route.length === 3);
  check('L-shape: starts at src',                        eq(route[0], { x: 0, y: 0 }));
  check('L-shape: ends at dst',                          eq(route[route.length - 1], { x: 100, y: 50 }));
  check('L-shape: Manhattan',                            isManhattan(route));
}

// ── 3. Backward routes ────────────────────────────────────────
console.log('\n[3] computeRoute — backward (dst left of src)');
{
  const route = computeRoute({ x: 100, y: 0 }, { x: 0, y: 0 });
  check('backward: still 2 points (still straight)',     route.length === 2);
  check('backward: starts at src',                       eq(route[0], { x: 100, y: 0 }));
  check('backward: ends at dst',                         eq(route[route.length - 1], { x: 0, y: 0 }));
}

// ── 4. Degenerate (src == dst) ────────────────────────────────
console.log('\n[4] computeRoute — degenerate (src == dst)');
{
  const route = computeRoute({ x: 50, y: 50 }, { x: 50, y: 50 });
  check('degenerate: collapses to 1 point',              route.length === 1);
  check('degenerate: that point is src',                 eq(route[0], { x: 50, y: 50 }));
}

// ── 5. User waypoints honored (snapped to grid) ───────────────
console.log('\n[5] computeRoute — user waypoints appear in the path');
{
  const route = computeRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 50, y: 50 }]);
  // Path should include the snapped waypoint (50, 50).
  check('waypoint (50,50) appears in path',              route.some(p => p.x === 50 && p.y === 50));
  check('starts at src',                                 eq(route[0], { x: 0, y: 0 }));
  check('ends at dst',                                   eq(route[route.length - 1], { x: 100, y: 0 }));
  check('still Manhattan',                               isManhattan(route));
}

// ── 6. Channel offset shifts routing topology ─────────────────
// channelOffset is meant to space parallel wires apart. For an L-shape
// route, offset=0 picks one corner; offset=2 picks a different corner
// (HVH vs VHV strategy switch).
console.log('\n[6] channelOffset shifts the route');
{
  const r0 = computeRoute({ x: 0, y: 0 }, { x: 100, y: 50 }, undefined, undefined, 0);
  const r2 = computeRoute({ x: 0, y: 0 }, { x: 100, y: 50 }, undefined, undefined, 2);
  // Both must still start at src and end at dst, and both must be Manhattan.
  check('offset=0 starts at src',                        eq(r0[0], { x: 0, y: 0 }));
  check('offset=2 starts at src',                        eq(r2[0], { x: 0, y: 0 }));
  check('offset=0 ends at dst',                          eq(r0[r0.length - 1], { x: 100, y: 50 }));
  check('offset=2 ends at dst',                          eq(r2[r2.length - 1], { x: 100, y: 50 }));
  check('offset=0 Manhattan',                            isManhattan(r0));
  check('offset=2 Manhattan',                            isManhattan(r2));
  // Different offset should produce visibly different middle bend.
  const r0Mid = JSON.stringify(r0.slice(1, -1));
  const r2Mid = JSON.stringify(r2.slice(1, -1));
  check('offset=0 vs offset=2 produce different middle points',  r0Mid !== r2Mid);
}

// ── 7. Obstacles parameter accepted (no throw) ───────────────
console.log('\n[7] obstacles parameter — API contract');
{
  let threw = false;
  let result;
  try {
    result = computeRoute(
      { x: 0, y: 0 }, { x: 100, y: 100 },
      undefined,
      [{ type: 'GATE_SLOT', x: 50, y: 50 }],
    );
  } catch (e) { threw = true; }
  check('obstacles array accepted, no throw',            !threw);
  check('returns a valid Manhattan path',                 result && result.length >= 2 && isManhattan(result));
  check('starts at src',                                  eq(result[0], { x: 0, y: 0 }));
  check('ends at dst',                                    eq(result[result.length - 1], { x: 100, y: 100 }));
  // Empty obstacle list should also work.
  let r2;
  try { r2 = computeRoute({ x: 0, y: 0 }, { x: 50, y: 50 }, undefined, []); } catch { threw = true; }
  check('empty obstacles array also fine',               r2 && r2.length >= 2);
}

// ── 8. simplifyPath collapses duplicates and collinear points ─
console.log('\n[8] simplifyPath');
{
  // Duplicate consecutive points removed.
  let s = simplifyPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]);
  check('collapses dup → straight 2-point line',
        s.length === 2 && eq(s[0], { x: 0, y: 0 }) && eq(s[1], { x: 100, y: 0 }));

  // Three collinear horizontal points → 2 (middle removed).
  s = simplifyPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]);
  check('collapses 3 collinear horizontal points → 2',   s.length === 2);

  // Real L-bend preserved.
  s = simplifyPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]);
  check('preserves L-bend (3 points stay 3)',            s.length === 3);

  // Empty array → empty.
  s = simplifyPath([]);
  check('empty input → empty output',                    s.length === 0);

  // Single-point input → single point.
  s = simplifyPath([{ x: 5, y: 5 }]);
  check('single point → single point unchanged',         s.length === 1 && eq(s[0], { x: 5, y: 5 }));
}

// ── 9. detectJunctions ────────────────────────────────────────
// Function signature: (wirePaths: Map<id, points[]>) → {x,y}[]
// Detects shared endpoints / bend points. Does NOT detect arbitrary
// segment crossings (that's the documented design).
console.log('\n[9] detectJunctions');
{
  // Two wires sharing an endpoint at (50, 50).
  const wp = new Map([
    ['w1', [{ x: 0,   y: 50 }, { x: 50,  y: 50 }]],
    ['w2', [{ x: 100, y: 50 }, { x: 50,  y: 50 }]],
  ]);
  const j = detectJunctions(wp);
  check('shared endpoint at (50,50) detected', j.length === 1 && j[0].x === 50 && j[0].y === 50);

  // Two wires that cross at (50,0) but share no point — not detected.
  // (Documented design: only shared endpoints/bends become junctions.)
  const wpCross = new Map([
    ['w1', [{ x: 0,  y: 0 },   { x: 100, y: 0 }]],   // horizontal at y=0
    ['w2', [{ x: 50, y: -50 }, { x: 50,  y: 50 }]],  // vertical at x=50
  ]);
  const jCross = detectJunctions(wpCross);
  check('plain segment crossing (no shared point) → no junction', jCross.length === 0);

  // Empty Map → empty result.
  const jEmpty = detectJunctions(new Map());
  check('empty Map → empty result',                     jEmpty.length === 0);

  // Single wire → no junctions (need at least 2 wires).
  const jOne = detectJunctions(new Map([['w1', [{ x: 0, y: 0 }, { x: 100, y: 0 }]]]));
  check('single wire → no junctions',                   jOne.length === 0);
}

// ── 10. computeChannelOffset basic contract ──────────────────
console.log('\n[10] computeChannelOffset');
{
  const w = { sourceId: 'A', targetId: 'B' };
  const offset = computeChannelOffset(w, [w]);
  check('lone wire → offset 0', offset === 0);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
