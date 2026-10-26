import type { BoardPresetId } from '../config';
import type { GameState } from '../core/GameState';
import type { RuleOptions } from '../core/Rules';

// Catatan: dipakai bersama oleh client dan server — jangan impor three.js / DOM di sini.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 6;
/** huruf/angka yang tidak membingungkan (tanpa 0/O, 1/I/L) */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const NAME_MAX = 14;
/** batas waktu memutuskan lemparan sebelum otomatis dilemparkan server (detik) */
export const TURN_SECONDS = 25;
export const EMOTES = ['👏', '😂', '😱', '🎉'] as const;

export interface RoomSettings {
  boardPreset: BoardPresetId;
  options: RuleOptions;
}

export interface RoomPlayerInfo {
  id: string;
  name: string;
  character: string;
  color: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface RoomInfo {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: RoomPlayerInfo[];
  settings: RoomSettings;
}

/** Ringkasan state setelah satu lemparan — dipakai client untuk memverifikasi simulasinya sendiri. */
export interface TurnSnapshot {
  positions: number[];
  current: number;
  consecutiveSixes: number;
  turn: number;
  winnerId: string | null;
  ranking: string[];
}

// Client -> Server
export type ClientMsg =
  | { t: 'create_room'; name: string; character: string }
  | { t: 'join_room'; code: string; name: string; character: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'set_character'; character: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; boardPreset?: BoardPresetId; options?: Partial<RuleOptions> } // host saja
  | { t: 'start_game' } // host saja
  | { t: 'charge_start' }
  | { t: 'roll' }
  | { t: 'emote'; id: string }
  | { t: 'back_to_lobby' }
  | { t: 'leave' };

// Server -> Client
export type ServerMsg =
  | { t: 'joined'; room: RoomInfo; you: string; token: string }
  | { t: 'room_state'; room: RoomInfo }
  | { t: 'left' }
  | { t: 'game_start'; state: GameState; seq: number }
  | { t: 'game_snapshot'; state: GameState; seq: number }
  | { t: 'turn'; playerId: string; deadline: number }
  | {
      t: 'turn_result';
      seq: number;
      playerId: string;
      value: number;
      boost: boolean;
      after: TurnSnapshot;
    }
  | { t: 'emote'; playerId: string; id: string }
  | { t: 'error'; message: string; code?: string };

/** Perkiraan lama animasi satu giliran (ms) — server memberi tambahan waktu sebelum batas giliran berikutnya. */
export function estimateAnimationMs(steps: number, jump: 'ladder' | 'snake' | null): number {
  return 2400 + steps * 330 + (jump === 'ladder' ? 2600 : jump === 'snake' ? 4200 : 0);
}
