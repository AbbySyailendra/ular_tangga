import type { BoardMap, Personality } from '../config';
import type { RuleOptions } from './Rules';

export interface PlayerState {
  id: string;
  name: string;
  character: string;
  /** warna penanda pemain (cincin pion + label) */
  color: number;
  isBot: boolean;
  personality?: Personality;
  position: number;
}

/** State murni & serializable (JSON) — dipakai game, unit test, dan save/resume. */
export interface GameState {
  players: PlayerState[];
  current: number;
  consecutiveSixes: number;
  turn: number;
  winnerId: string | null;
  ranking: string[];
  board: BoardMap;
  options: RuleOptions;
  rngState: number;
}

export function createInitialState(
  players: Omit<PlayerState, 'position'>[],
  board: BoardMap,
  options: RuleOptions,
  rngState: number,
): GameState {
  return {
    players: players.map((p) => ({ ...p, position: 0 })),
    current: 0,
    consecutiveSixes: 0,
    turn: 1,
    winnerId: null,
    ranking: [],
    board,
    options,
    rngState,
  };
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.current];
}
