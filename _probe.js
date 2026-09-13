// ASCII probe for maze-forge: render a small maze (walls) + solved path as text grid.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const ctx = { console: console, Math: Math, Uint8Array: Uint8Array, Int32Array: Int32Array, Int8Array: Int8Array,
  Float64Array: Float64Array, Object: Object, Array: Array, JSON: JSON, isFinite: isFinite, Infinity: Infinity };
vm.createContext(ctx);
vm.runInContext(m[1], ctx, { filename: 'engine.js' });
const M = ctx.MAZE;

function ascii(R, C, algo, seed, solver){
  const mz = M.generate(R, C, algo, seed);
  const start = 0, end = R * C - 1;
  const path = M.solve(mz, R, C, start, end, solver);
  const pathSet = new Set(path || []);
  const GW = 2 * R + 1, GH = 2 * C + 1;
  const grid = [];
  for (let y = 0; y < GH; y++) grid.push(new Array(GW).fill('#'));
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++){
    grid[2 * r + 1][2 * c + 1] = (r * C + c === start) ? 'S' : (r * C + c === end ? 'E' : (pathSet.has(r * C + c) ? '.' : ' '));
    const id = r * C + c;
    if ((mz[id] & M.E) === 0 && c < C - 1) grid[2 * r + 1][2 * c + 2] = (pathSet.has(id) && pathSet.has(id + 1)) ? '.' : ' ';
    if ((mz[id] & M.S) === 0 && r < R - 1) grid[2 * r + 2][2 * c + 1] = (pathSet.has(id) && pathSet.has(id + C)) ? '.' : ' ';
  }
  let out = '';
  for (let y = 0; y < GH; y++) out += grid[y].join('') + '\n';
  return out;
}

let txt = '';
txt += '--- 11x11 Backtracker + BFS path (S=start, E=end, .=path) ---\n';
txt += ascii(11, 11, 'bt', 12345, 'bfs');
txt += '\n--- 9x9 Prim + A* path ---\n';
txt += ascii(9, 9, 'prim', 777, 'astar');

fs.writeFileSync(path.join(__dirname, '_probe.txt'), txt);
console.log(txt);
console.log('written _probe.txt');
