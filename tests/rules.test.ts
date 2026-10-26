import { describe, expect, it } from 'vitest';
import { BOARD_PRESETS, LADDERS, SNAKES } from '../src/config';
import { createInitialState } from '../src/core/GameState';
import {
  DEFAULT_OPTIONS,
  applyRoll,
  generateRandomBoard,
  rollDie,
  resolveMove,
  tileToGrid,
  validateBoard,
  type RuleOptions,
} from '../src/core/Rules';
import { createRng } from '../src/utils/random';

const board = { ladders: LADDERS, snakes: SNAKES };
const opts: RuleOptions = { ...DEFAULT_OPTIONS };

function stateAt(pos: number, extra: Partial<ReturnType<typeof createInitialState>> = {}) {
  const s = createInitialState(
    [
      { id: 'p1', name: 'A', character: 'kiko', color: 1, isBot: false },
      { id: 'p2', name: 'B', character: 'bobo', color: 2, isBot: true },
    ],
    board,
    opts,
    1,
  );
  s.players[0].position = pos;
  return Object.assign(s, extra);
}

describe('tileToGrid', () => {
  it('zig-zag dari kiri bawah', () => {
    expect(tileToGrid(1)).toEqual({ row: 0, col: 0 });
    expect(tileToGrid(10)).toEqual({ row: 0, col: 9 });
    expect(tileToGrid(11)).toEqual({ row: 1, col: 9 });
    expect(tileToGrid(20)).toEqual({ row: 1, col: 0 });
    expect(tileToGrid(21)).toEqual({ row: 2, col: 0 });
    expect(tileToGrid(100)).toEqual({ row: 9, col: 0 });
  });
});

describe('resolveMove', () => {
  it('maju langkah demi langkah', () => {
    const m = resolveMove(0, 3, board, opts);
    expect(m.path).toEqual([1, 2, 3]);
    expect(m.final).toBe(3);
    expect(m.jump).toBeUndefined();
  });

  it('kaki tangga -> naik ke ujung tangga', () => {
    const m = resolveMove(1, 3, board, opts); // 4 -> 14
    expect(m.landed).toBe(4);
    expect(m.jump).toEqual({ from: 4, to: 14, kind: 'ladder' });
    expect(m.final).toBe(14);
  });

  it('kepala ular -> turun ke ekor ular', () => {
    const m = resolveMove(12, 5, board, opts); // 17 -> 7
    expect(m.jump).toEqual({ from: 17, to: 7, kind: 'snake' });
    expect(m.final).toBe(7);
  });

  it('bounce di 100 bila harus pas', () => {
    const m = resolveMove(98, 5, board, opts); // 99,100,99,98,97
    expect(m.path).toEqual([99, 100, 99, 98, 97]);
    expect(m.bounced).toBe(true);
    expect(m.landed).toBe(97);
    expect(m.final).toBe(97);
  });

  it('bounce bisa mendarat di kepala ular', () => {
    const m = resolveMove(98, 3, board, opts); // target 101 -> mendarat 99 (kepala ular 99->78)
    expect(m.landed).toBe(99);
    expect(m.jump?.kind).toBe('snake');
    expect(m.final).toBe(78);
  });

  it('pas 100 menang tanpa bounce', () => {
    const m = resolveMove(96, 4, board, opts);
    expect(m.final).toBe(100);
    expect(m.bounced).toBe(false);
  });

  it('opsi >= 100 cukup', () => {
    const m = resolveMove(98, 5, board, { ...opts, exactFinish: false });
    expect(m.final).toBe(100);
    expect(m.path).toEqual([99, 100]);
  });
});

describe('applyRoll', () => {
  it('tidak mengubah state input', () => {
    const s = stateAt(10);
    const copy = structuredClone(s);
    applyRoll(s, 3);
    expect(s).toEqual(copy);
  });

  it('giliran pindah ke pemain berikutnya', () => {
    const { state, outcome } = applyRoll(stateAt(10), 3);
    expect(state.players[0].position).toBe(13);
    expect(state.current).toBe(1);
    expect(outcome.extraTurn).toBe(false);
  });

  it('dapat 6 -> lempar lagi', () => {
    const { state, outcome } = applyRoll(stateAt(10), 6);
    expect(outcome.extraTurn).toBe(true);
    expect(state.current).toBe(0);
    expect(state.consecutiveSixes).toBe(1);
  });

  it('6 ketiga beruntun -> giliran hangus, posisi tetap', () => {
    const s = stateAt(10, { consecutiveSixes: 2 });
    const { state, outcome } = applyRoll(s, 6);
    expect(outcome.forfeited).toBe(true);
    expect(state.players[0].position).toBe(10);
    expect(state.current).toBe(1);
    expect(state.consecutiveSixes).toBe(0);
  });

  it('angka non-6 mereset hitungan 6', () => {
    const s = stateAt(10, { consecutiveSixes: 2 });
    const { state } = applyRoll(s, 4);
    expect(state.consecutiveSixes).toBe(0);
    expect(state.current).toBe(1);
  });

  it('aturan 6 dimatikan -> 6 tidak lempar lagi', () => {
    const s = stateAt(10);
    s.options = { ...opts, sixRollsAgain: false };
    const { state, outcome } = applyRoll(s, 6);
    expect(outcome.extraTurn).toBe(false);
    expect(state.current).toBe(1);
  });

  it('menang di 100 dan menghitung peringkat', () => {
    const s = stateAt(96);
    s.players[1].position = 50;
    const { state, outcome } = applyRoll(s, 4);
    expect(outcome.won).toBe(true);
    expect(state.winnerId).toBe('p1');
    expect(state.ranking).toEqual(['p1', 'p2']);
    expect(state.current).toBe(0);
  });

  it('6 yang membawa menang tidak memberi giliran tambahan', () => {
    const { outcome } = applyRoll(stateAt(94), 6);
    expect(outcome.won).toBe(true);
    expect(outcome.extraTurn).toBe(false);
  });
});

describe('papan', () => {
  it('semua preset valid', () => {
    for (const [name, b] of Object.entries(BOARD_PRESETS)) {
      expect(validateBoard(b), name).toEqual([]);
    }
  });

  it('tidak ada rantai ular/tangga pada preset', () => {
    for (const b of Object.values(BOARD_PRESETS)) {
      const heads = new Set([...Object.keys(b.ladders), ...Object.keys(b.snakes)].map(Number));
      for (const to of [...Object.values(b.ladders), ...Object.values(b.snakes)]) {
        expect(heads.has(to)).toBe(false);
      }
    }
  });

  it('papan acak selalu valid', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const b = generateRandomBoard(createRng(seed));
      expect(validateBoard(b), `seed ${seed}`).toEqual([]);
      expect(Object.keys(b.ladders)).toHaveLength(7);
      expect(Object.keys(b.snakes)).toHaveLength(8);
    }
  });

  it('validateBoard menangkap ujung bertumpuk & petak 1/100', () => {
    expect(validateBoard({ ladders: { 4: 14 }, snakes: { 14: 3 } }).length).toBeGreaterThan(0);
    expect(validateBoard({ ladders: { 1: 14 }, snakes: {} }).length).toBeGreaterThan(0);
    expect(validateBoard({ ladders: { 4: 100 }, snakes: {} }).length).toBeGreaterThan(0);
  });
});

describe('simulasi penuh', () => {
  it('permainan selalu selesai dan konsisten', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      let s = stateAt(0);
      for (let i = 0; i < 5000 && !s.winnerId; i++) {
        s = applyRoll(s, rng.int(1, 6)).state;
        for (const p of s.players) {
          expect(p.position).toBeGreaterThanOrEqual(0);
          expect(p.position).toBeLessThanOrEqual(100);
        }
      }
      expect(s.winnerId, `seed ${seed}`).not.toBeNull();
    }
  });
});

describe('rollDie', () => {
  it('lemparan sempurna menaikkan peluang angka besar', () => {
    const rng = createRng(42);
    const n = 30000;
    let sumNormal = 0;
    let sumBoost = 0;
    let sixNormal = 0;
    let sixBoost = 0;
    for (let i = 0; i < n; i++) {
      const a = rollDie(rng, false);
      const b = rollDie(rng, true);
      sumNormal += a;
      sumBoost += b;
      if (a === 6) sixNormal++;
      if (b === 6) sixBoost++;
      if (b < 1 || b > 6) throw new Error(`nilai dadu di luar 1..6: ${b}`);
    }
    expect(sumNormal / n).toBeCloseTo(3.5, 1);
    expect(sumBoost / n).toBeCloseTo(4.47, 1);
    expect(sixNormal / n).toBeCloseTo(1 / 6, 1);
    expect(sixBoost / n).toBeCloseTo(11 / 36, 1);
  });

  it('deterministik untuk seed yang sama', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 50; i++) expect(rollDie(a, i % 2 === 0)).toBe(rollDie(b, i % 2 === 0));
  });
});
