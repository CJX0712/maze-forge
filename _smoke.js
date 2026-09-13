// Smoke test for maze-forge engine. Extracts <script id="engine">, runs in vm sandbox,
// asserts determinism + perfect-maze property + solver correctness over many random mazes.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: engine script not found'); process.exit(1); }
const ctx = { console: console, Math: Math, Uint8Array: Uint8Array, Int32Array: Int32Array, Int8Array: Int8Array,
  Float64Array: Float64Array, Object: Object, Array: Array, JSON: JSON, isFinite: isFinite, Infinity: Infinity };
vm.createContext(ctx);
vm.runInContext(m[1], ctx, { filename: 'engine.js' });
const M = ctx.MAZE;
if (!M) { console.error('FAIL: MAZE not exposed'); process.exit(1); }

let pass = 0, fail = 0; const fails = [];
function ok(name, cond){ if (cond) pass++; else { fail++; fails.push(name); } }

// 1. PRNG determinism
const r1 = M.mulberry32(7), r2 = M.mulberry32(7); let same = true, seq = [];
for (let i = 0; i < 6; i++){ const a = r1(), b = r2(); seq.push(a); if (a !== b) same = false; }
ok('mulberry32 deterministic', same);
const r3 = M.mulberry32(8); let diff = false;
for (let i = 0; i < 6; i++){ if (seq[i] !== r3()){ diff = true; break; } }
ok('mulberry32 differs by seed', diff);

// 2. generation determinism per algo
['bt','prim','kruskal'].forEach(function(algo){
  const A = M.generate(15, 15, algo, 12345);
  const B = M.generate(15, 15, algo, 12345);
  const C = M.generate(15, 15, algo, 99999);
  ok('gen ' + algo + ' deterministic', M.hashMaze(A) === M.hashMaze(B));
  ok('gen ' + algo + ' seed changes maze', M.hashMaze(A) !== M.hashMaze(C));
});

// 3. perfect-maze property: reach==R*C and edges==R*C-1, across 200 mazes x3 algos
['bt','prim','kruskal'].forEach(function(algo){
  let allPerfect = true, reachOk = true, edgeOk = true;
  for (let s = 0; s < 200; s++){
    const rng = M.makeRng(1000 + s);
    const sz = 7 + (s % 6) * 4; // 7..27
    const mz = M.generate(sz, sz, algo, 1000 + s);
    const reach = M.bfsReach(mz, sz, sz, 0);
    if (reach.count !== sz * sz) reachOk = false;
    if (M.countEdges(mz, sz, sz) !== sz * sz - 1) edgeOk = false;
    if (!M.isPerfect(mz, sz, sz)) allPerfect = false;
  }
  ok('perfect ' + algo + ' reach==N (200)', reachOk);
  ok('perfect ' + algo + ' edges==N-1 (200)', edgeOk);
  ok('isPerfect ' + algo + ' (200)', allPerfect);
});

// 4. solvers: validity + optimality
function solverTests(algo){
  let valid = true, opt = true, exists = true;
  for (let s = 0; s < 120; s++){
    const sz = 9 + (s % 5) * 3;
    const mz = M.generate(sz, sz, ['bt','prim','kruskal'][s % 3], 500 + s);
    const start = 0, end = sz * sz - 1;
    const path = M.solve(mz, sz, sz, start, end, algo);
    if (!path){ exists = false; continue; }
    if (!M.validatePath(mz, sz, sz, path, start, end)) valid = false;
  }
  ok('solver ' + algo + ' all paths valid (120)', valid);
  ok('solver ' + algo + ' always finds path (120)', exists);
}
['bfs','astar','dfs'].forEach(solverTests);

// 5. BFS and A* both shortest, and equal length
let optLen = true;
for (let s = 0; s < 120; s++){
  const sz = 9 + (s % 5) * 3;
  const mz = M.generate(sz, sz, ['bt','prim','kruskal'][s % 3], 700 + s);
  const start = 0, end = sz * sz - 1;
  const bp = M.bfsPath(mz, sz, sz, start, end);
  const ap = M.astarPath(mz, sz, sz, start, end);
  if (!bp || !ap){ optLen = false; continue; }
  if (bp.length !== ap.length) optLen = false;
}
ok('A* length == BFS shortest (120)', optLen);

// 6. validatePath rejects tampered path
{
  const mz = M.generate(15, 15, 'bt', 42);
  const good = M.bfsPath(mz, 15, 15, 0, 224);
  ok('good path validates', M.validatePath(mz, 15, 15, good, 0, 224));
  const bad = good.slice(); bad[1] = (bad[1] + 3) % (15 * 15); // break adjacency
  ok('tampered path rejected', !M.validatePath(mz, 15, 15, bad, 0, 224));
  const wrongEnd = good.slice(); wrongEnd[wrongEnd.length - 1] = 0;
  ok('wrong-end path rejected', !M.validatePath(mz, 15, 15, wrongEnd, 0, 224));
}

// 7. edge cases: 1xN and Nx1 are perfect (single corridor) and solvable
[ [1,9], [9,1], [1,1] ].forEach(function(p){
  const R = p[0], C = p[1];
  ['bt','prim','kruskal'].forEach(function(algo){
    const mz = M.generate(R, C, algo, 55);
    const reach = M.bfsReach(mz, R, C, 0);
    ok('edge ' + R + 'x' + C + ' ' + algo + ' reach==N', reach.count === R * C);
    if (R * C > 1){
      const path = M.bfsPath(mz, R, C, 0, R * C - 1);
      ok('edge ' + R + 'x' + C + ' ' + algo + ' solvable', !!path && M.validatePath(mz, R, C, path, 0, R * C - 1));
    }
  });
});

// 8. cloneMaze independence
{
  const mz = M.generate(12, 12, 'bt', 3);
  const cp = M.cloneMaze(mz); cp[0] = 0;
  ok('cloneMaze independent', mz[0] !== 0);
}

console.log('\n=== maze-forge smoke ===');
console.log('PASS ' + pass + ' / ' + (pass + fail));
if (fail > 0){ console.log('FAILURES: ' + fails.join(' | ')); process.exit(1); }
console.log('ALL GREEN');
fs.writeFileSync(path.join(__dirname, '_smoke.log'), 'PASS ' + pass + ' / ' + (pass + fail) + '\n');
