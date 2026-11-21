// Sokoban solver: push-optimal, room by room.
//
// One program answers five levels in a single run (Node 22, no deps).
// Each level is a hallway plus one to four rooms; a box pushed out of a
// room through its door can never come back, so every box stays in its
// room and the level's push-optimum is the sum of the rooms' optima.
// The solver therefore splits the level into rooms and solves each room
// on its own with a breadth-first search over pushes (the first solved
// state a push-BFS meets is push-optimal), then stitches the rooms'
// move strings together, walking the player on between rooms.
//
// A push-state is the boxes' squares plus the player's reachable region
// (named by its lowest square): two states with the same boxes and the
// same region are one state, whatever square the player stands on.
// Two deadlocks are pruned, and neither prunes a solvable state: a box
// on a dead square (one from which no push, ignoring the other boxes,
// brings a box to any goal), and a frozen 2x2 block of walls and boxes
// holding a box off its goal. The search is bounded by a fixed number
// of states, never by the clock, so two runs write identical bytes.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_STATES = 250_000;

// [dx, dy, step letter, push letter]
const DIRS: readonly (readonly [number, number, string, string])[] = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
];

interface Level {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
}

/** An XSB level: width, height, walls (1), goals, boxes, player. */
function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  boxes.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

/**
 * The squares a box can stand on and still be pushed to some goal:
 * start from the goals and pull backwards — a square `s` is live when
 * a box there can be pushed in some direction `d` onto a live square,
 * which needs `s` open and the square behind it (`s - d`, where the
 * player stands) open too.
 */
function liveSquares(w: number, wall: Uint8Array, goals: number[]): Uint8Array {
  const live = new Uint8Array(wall.length);
  const queue: number[] = [];
  for (const g of goals) {
    live[g] = 1;
    queue.push(g);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const s = c - d;
      if (!wall[s] && !wall[s - d] && !live[s]) {
        live[s] = 1;
        queue.push(s);
      }
    }
  }
  return live;
}

/**
 * Flood-fill from `from` over open floor that is not occupied, marking
 * the region in `seen` with `stamp`; returns the region's lowest
 * square, which names the region.
 */
function floodLow(
  w: number,
  wall: Uint8Array,
  occ: Uint8Array,
  from: number,
  seen: Int32Array,
  stamp: number,
  stack: Int32Array,
): number {
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    const up = p - w;
    const dn = p + w;
    const lf = p - 1;
    const rt = p + 1;
    if (wall[up] === 0 && occ[up] === 0 && seen[up] !== stamp) {
      seen[up] = stamp;
      stack[n++] = up;
    }
    if (wall[dn] === 0 && occ[dn] === 0 && seen[dn] !== stamp) {
      seen[dn] = stamp;
      stack[n++] = dn;
    }
    if (wall[lf] === 0 && occ[lf] === 0 && seen[lf] !== stamp) {
      seen[lf] = stamp;
      stack[n++] = lf;
    }
    if (wall[rt] === 0 && occ[rt] === 0 && seen[rt] !== stamp) {
      seen[rt] = stamp;
      stack[n++] = rt;
    }
  }
  return low;
}

/** True when the box just pushed to `t` sits in a frozen 2x2 block. */
function frozenBlock(
  w: number,
  wall: Uint8Array,
  occ: Uint8Array,
  goal: Uint8Array,
  t: number,
): boolean {
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!((wall[a] || occ[a]) && (wall[b] || occ[b]) && (wall[c] || occ[c]) && (wall[d] || occ[d]))) continue;
    if ((occ[a] && !goal[a]) || (occ[b] && !goal[b]) || (occ[c] && !goal[c]) || (occ[d] && !goal[d])) return true;
  }
  return false;
}

/**
 * The shortest walk from `from` to `to` over open floor that is not
 * occupied, as lower-case step letters (first direction first on ties).
 */
function walkTo(
  w: number,
  wall: Uint8Array,
  occ: Uint8Array,
  from: number,
  to: number,
): string {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how: string[] = new Array<string>(wall.length);
  const queue: number[] = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const q = p + dy * w + dx;
      if (wall[q] || occ[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = letter;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: target out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

/**
 * Push-optimal solution of one (sub-)level by breadth-first search over
 * pushes: {pushes, moves}, or null when the search gives up (or a box
 * starts on a dead square). States are kept in the order found; the
 * first solved state met is push-optimal.
 */
function solvePushes(
  w: number,
  wall: Uint8Array,
  goals: number[],
  boxes0: number[],
  player0: number,
): { pushes: number; moves: string } | null {
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(w, wall, goals);
  if (boxes0.some((b) => !live[b])) return null;
  const occ = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const isSolved = (boxes: number[]): boolean => boxes.every((b) => goal[b]);
  if (isSolved(boxes0)) return { pushes: 0, moves: '' };

  // State key: boxes in base `size`, then the region's lowest square.
  const keyOf = (boxes: number[], low: number): number => {
    let k = boxes[0];
    for (let i = 1; i < boxes.length; i++) k = k * size + boxes[i];
    return k * size + low;
  };

  const stateBoxes: number[][] = [boxes0.slice()];
  const statePlayer: number[] = [player0];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const index = new Map<number, number>();
  for (const b of boxes0) occ[b] = 1;
  const low0 = floodLow(w, wall, occ, player0, seen, ++stamp, stack);
  for (const b of boxes0) occ[b] = 0;
  index.set(keyOf(boxes0, low0), 0);

  let found = -1;
  for (let head = 0; found < 0 && head < stateBoxes.length; head++) {
    const boxes = stateBoxes[head];
    for (const b of boxes) occ[b] = 1;
    floodLow(w, wall, occ, statePlayer[head], seen, ++stamp, stack);
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi];
      for (const [dx, dy] of DIRS) {
        const d = dy * w + dx;
        const t = b + d;
        if (seen[b - d] !== here || wall[t] || occ[t] || !live[t]) continue;
        occ[b] = 0;
        occ[t] = 1;
        const frozen = frozenBlock(w, wall, occ, goal, t);
        let key = -1;
        let next: number[] | null = null;
        if (!frozen) {
          next = boxes.slice();
          next[bi] = t;
          next.sort((a, b2) => a - b2);
          key = keyOf(next, floodLow(w, wall, occ, b, mark, ++stamp, stack));
        }
        occ[t] = 0;
        occ[b] = 1;
        if (frozen || index.has(key)) continue;
        if (stateBoxes.length >= MAX_STATES) {
          for (const x of boxes) occ[x] = 0;
          return null;
        }
        index.set(key, stateBoxes.length);
        stateBoxes.push(next!);
        statePlayer.push(b);
        parent.push(head);
        pushFrom.push(b);
        pushTo.push(t);
        if (isSolved(next!)) {
          found = stateBoxes.length - 1;
          break;
        }
      }
    }
    for (const x of boxes) occ[x] = 0;
  }
  if (found < 0) return null;

  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s]) path.push(s);
  path.reverse();
  let moves = '';
  let player = player0;
  let boxes = boxes0.slice();
  for (const s of path) {
    const from = pushFrom[s];
    const to = pushTo[s];
    const d = to - from;
    const dir = DIRS.find(([dx, dy]) => dy * w + dx === d)!;
    for (const b of boxes) occ[b] = 1;
    moves += walkTo(w, wall, occ, player, from - d);
    for (const b of boxes) occ[b] = 0;
    moves += dir[3];
    player = from;
    boxes = stateBoxes[s].slice();
  }
  return { pushes: path.length, moves };
}

/**
 * The level's rooms: cut the dead squares of the player's row (the
 * hallway — a box there reaches no goal) out of the floor, and each
 * part left that holds a box is a room. Null when a box starts in the
 * hallway, a goal lands in no part, or some part holds more boxes
 * than goals.
 */
function splitRooms(level: Level): { boxes: number[]; goals: number[] }[] | null {
  const { w, wall, goals, boxes, player } = level;
  const live = liveSquares(w, wall, goals);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let x = 0; x < w; x++) {
    const i = row * w + x;
    if (!wall[i] && !live[i]) cut[i] = 1;
  }
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms: { boxes: number[]; goals: number[] }[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const id = rooms.length;
    const squares: number[] = [s];
    part[s] = id;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = squares[i] + dy * w + dx;
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = id;
          squares.push(q);
        }
      }
    }
    rooms.push({ boxes: [], goals: [] });
  }
  for (const b of boxes) {
    if (part[b] < 0) return null;
    rooms[part[b]].boxes.push(b);
  }
  for (const g of goals) {
    if (part[g] < 0) return null;
    rooms[part[g]].goals.push(g);
  }
  if (rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/** The level solved room by room, or over the whole level when it is no set of rooms. */
function solveLevel(text: string): string {
  const level = parseLevel(text);
  const rooms = splitRooms(level);
  if (rooms === null) {
    const whole = solvePushes(level.w, level.wall, level.goals, level.boxes, level.player);
    return whole === null ? '' : whole.moves;
  }
  let player = level.player;
  let moves = '';
  const done: boolean[] = rooms.map(() => false);
  for (let ri = 0; ri < rooms.length; ri++) {
    const room = rooms[ri];
    const subWall = level.wall.slice();
    for (let oj = 0; oj < rooms.length; oj++) {
      if (oj === ri) continue;
      const other = rooms[oj];
      const standing = done[oj] ? other.goals : other.boxes;
      for (const b of standing) subWall[b] = 1;
    }
    const solved = solvePushes(
      level.w,
      subWall,
      room.goals.slice().sort((a, b) => a - b),
      room.boxes.slice().sort((a, b) => a - b),
      player,
    );
    if (solved === null) {
      // A room's search gave up: fall back to the whole level rather
      // than scoring nothing for the instance.
      const whole = solvePushes(level.w, level.wall, level.goals, level.boxes, level.player);
      return whole === null ? '' : whole.moves;
    }
    moves += solved.moves;
    player = endOf(level.w, player, solved.moves);
    done[ri] = true;
  }
  return moves;
}

/** The square the player stands on after `moves` from `from` on a board `w` wide. */
function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

for (const id of readdirSync(INPUT).sort()) {
  const moves = solveLevel(readFileSync(join(INPUT, id, 'level.txt'), 'utf8'));
  mkdirSync(join(OUTPUT, id), { recursive: true });
  writeFileSync(join(OUTPUT, id, 'solution.txt'), `${moves}\n`);
}
