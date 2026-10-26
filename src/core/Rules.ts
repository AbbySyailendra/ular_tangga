import { BOARD_SIZE, TILE_COUNT, type BoardMap } from '../config';
import type { GameState } from './GameState';

// Catatan: file ini TIDAK boleh mengimpor three.js (dipakai bersama unit test).

export interface RuleOptions {
  /** dapat 6 -> lempar lagi (6 ketiga beruntun = giliran hangus) */
  sixRollsAgain: boolean;
  /** harus pas di 100, kalau lebih pion memantul mundur */
  exactFinish: boolean;
}

export const DEFAULT_OPTIONS: RuleOptions = { sixRollsAgain: true, exactFinish: true };
export const MAX_CONSECUTIVE_SIXES = 3;

export type JumpKind = 'ladder' | 'snake';
export interface Jump {
  from: number;
  to: number;
  kind: JumpKind;
}

export interface MoveResult {
  start: number;
  /** petak yang dilewati satu per satu (tanpa petak awal), termasuk pantulan */
  path: number[];
  /** petak tempat berhenti sebelum ular/tangga */
  landed: number;
  jump?: Jump;
  final: number;
  bounced: boolean;
}

export interface TurnOutcome {
  playerId: string;
  value: number;
  forfeited: boolean;
  move: MoveResult | null;
  extraTurn: boolean;
  won: boolean;
}

export function tileToGrid(n: number): { row: number; col: number } {
  const idx = n - 1;
  const row = Math.floor(idx / BOARD_SIZE);
  const colRaw = idx % BOARD_SIZE;
  const col = row % 2 === 0 ? colRaw : BOARD_SIZE - 1 - colRaw; // zig-zag
  return { row, col };
}

export function resolveMove(
  start: number,
  dice: number,
  board: BoardMap,
  opts: RuleOptions,
): MoveResult {
  const path: number[] = [];
  let bounced = false;
  let landed: number;
  const target = start + dice;

  if (target <= TILE_COUNT) {
    for (let t = start + 1; t <= target; t++) path.push(t);
    landed = target;
  } else if (opts.exactFinish) {
    // maju sampai 100 lalu memantul mundur sisa langkahnya
    for (let t = start + 1; t <= TILE_COUNT; t++) path.push(t);
    landed = 2 * TILE_COUNT - target;
    for (let t = TILE_COUNT - 1; t >= landed; t--) path.push(t);
    bounced = true;
  } else {
    for (let t = start + 1; t <= TILE_COUNT; t++) path.push(t);
    landed = TILE_COUNT;
  }

  let jump: Jump | undefined;
  if (board.ladders[landed] !== undefined) {
    jump = { from: landed, to: board.ladders[landed], kind: 'ladder' };
  } else if (board.snakes[landed] !== undefined) {
    jump = { from: landed, to: board.snakes[landed], kind: 'snake' };
  }

  return { start, path, landed, jump, final: jump ? jump.to : landed, bounced };
}

/**
 * Lempar dadu. `boosted` (lemparan sempurna): dua dadu dilempar dan diambil yang terbesar,
 * jadi peluang angka 6 naik dari 1/6 (16,7%) menjadi 11/36 (30,6%).
 * Selalu memakai RNG yang sama sehingga hasil tetap seed-able.
 */
export function rollDie(rng: { int(a: number, b: number): number }, boosted = false): number {
  const a = rng.int(1, 6);
  return boosted ? Math.max(a, rng.int(1, 6)) : a;
}

export function computeRanking(state: GameState): string[] {
  const rest = state.players
    .filter((p) => p.id !== state.winnerId)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.position - a.p.position || a.i - b.i)
    .map((x) => x.p.id);
  return state.winnerId ? [state.winnerId, ...rest] : rest;
}

/** Terapkan satu lemparan dadu. Murni: mengembalikan state baru, input tidak diubah. */
export function applyRoll(
  state: GameState,
  value: number,
): { state: GameState; outcome: TurnOutcome } {
  const s: GameState = structuredClone(state);
  const player = s.players[s.current];
  const { sixRollsAgain } = s.options;
  const streak = sixRollsAgain && value === 6 ? s.consecutiveSixes + 1 : 0;

  const nextPlayer = () => {
    s.consecutiveSixes = 0;
    s.current = (s.current + 1) % s.players.length;
    s.turn += 1;
  };

  if (sixRollsAgain && streak >= MAX_CONSECUTIVE_SIXES) {
    nextPlayer();
    return {
      state: s,
      outcome: {
        playerId: player.id,
        value,
        forfeited: true,
        move: null,
        extraTurn: false,
        won: false,
      },
    };
  }

  const move = resolveMove(player.position, value, s.board, s.options);
  player.position = move.final;
  const won = move.final === TILE_COUNT;
  const extraTurn = !won && sixRollsAgain && value === 6;

  if (won) {
    s.winnerId = player.id;
    s.ranking = computeRanking(s);
  } else if (extraTurn) {
    s.consecutiveSixes = streak;
    s.turn += 1;
  } else {
    nextPlayer();
  }

  return {
    state: s,
    outcome: { playerId: player.id, value, forfeited: false, move, extraTurn, won },
  };
}

/** Daftar pelanggaran aturan papan; kosong = valid. */
export function validateBoard(board: BoardMap): string[] {
  const errors: string[] = [];
  const seen = new Map<number, string>();
  const check = (n: number, label: string) => {
    if (!Number.isInteger(n) || n < 2 || n > TILE_COUNT - 1) {
      errors.push(`${label}: petak ${n} di luar rentang 2..99`);
    }
    const prev = seen.get(n);
    if (prev) errors.push(`petak ${n} bertumpuk (${prev} & ${label})`);
    else seen.set(n, label);
  };
  for (const [from, to] of Object.entries(board.ladders)) {
    const a = Number(from);
    check(a, `kaki tangga ${a}`);
    check(to, `ujung tangga ${a}`);
    if (to <= a) errors.push(`tangga ${a}->${to} tidak naik`);
  }
  for (const [from, to] of Object.entries(board.snakes)) {
    const a = Number(from);
    check(a, `kepala ular ${a}`);
    check(to, `ekor ular ${a}`);
    if (to >= a) errors.push(`ular ${a}->${to} tidak turun`);
  }
  return errors;
}

// fallback aman bila generator gagal (praktis tak pernah terjadi)
const FALLBACK_BOARD: BoardMap = {
  ladders: { 4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91 },
  snakes: { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 },
};

/** Papan acak tervalidasi: ujung tidak bertumpuk, bukan di petak 1 & 100, panjang cukup. */
export function generateRandomBoard(
  rng: { next(): number; int(a: number, b: number): number },
  ladderCount = 7,
  snakeCount = 8,
): BoardMap {
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Set<number>();
    const board: BoardMap = { ladders: {}, snakes: {} };
    const rowOf = (n: number) => tileToGrid(n).row;
    let ok = true;

    const place = (count: number, kind: JumpKind) => {
      for (let i = 0; i < count && ok; i++) {
        let placed = false;
        for (let tries = 0; tries < 80 && !placed; tries++) {
          const x = rng.int(2, 99);
          const y = rng.int(2, 99);
          if (x === y || used.has(x) || used.has(y)) continue;
          const [a, b] = x < y ? [x, y] : [y, x];
          if (b - a < 9 || rowOf(a) === rowOf(b)) continue;
          used.add(a);
          used.add(b);
          if (kind === 'ladder') board.ladders[a] = b;
          else board.snakes[b] = a;
          placed = true;
        }
        if (!placed) ok = false;
      }
    };
    place(ladderCount, 'ladder');
    place(snakeCount, 'snake');
    if (ok && validateBoard(board).length === 0) return board;
  }
  return structuredClone(FALLBACK_BOARD);
}
