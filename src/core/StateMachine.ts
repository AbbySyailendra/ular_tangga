export type Phase =
  | 'LOBBY'
  | 'INTRO'
  | 'TURN_START'
  | 'AWAIT_ROLL'
  | 'ROLLING'
  | 'MOVING'
  | 'RESOLVE_TILE'
  | 'CHECK_WIN'
  | 'NEXT_TURN'
  | 'GAME_OVER';

const TRANSITIONS: Record<Phase, Phase[]> = {
  // TURN_START langsung dari LOBBY: melanjutkan game; GAME_OVER: masuk kembali ke game online yang sudah selesai
  LOBBY: ['INTRO', 'TURN_START', 'GAME_OVER'],
  INTRO: ['TURN_START'],
  TURN_START: ['AWAIT_ROLL'],
  AWAIT_ROLL: ['ROLLING'],
  // giliran hangus (6 ketiga) langsung lompat ke NEXT_TURN
  ROLLING: ['MOVING', 'NEXT_TURN'],
  MOVING: ['RESOLVE_TILE'],
  RESOLVE_TILE: ['CHECK_WIN'],
  // dapat 6 -> pemain yang sama lempar lagi
  CHECK_WIN: ['NEXT_TURN', 'TURN_START', 'GAME_OVER'],
  NEXT_TURN: ['TURN_START'],
  GAME_OVER: [],
};

/** State machine fase giliran. `reset()` boleh dari fase mana pun (keluar ke menu). */
export class StateMachine {
  phase: Phase = 'LOBBY';

  constructor(private onChange?: (from: Phase, to: Phase) => void) {}

  go(to: Phase): void {
    if (!TRANSITIONS[this.phase].includes(to)) {
      throw new Error(`Transisi fase tidak valid: ${this.phase} -> ${to}`);
    }
    const from = this.phase;
    this.phase = to;
    this.onChange?.(from, to);
  }

  reset(): void {
    const from = this.phase;
    this.phase = 'LOBBY';
    if (from !== 'LOBBY') this.onChange?.(from, 'LOBBY');
  }
}
