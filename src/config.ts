export const BOARD_SIZE = 10;
export const TILE_COUNT = BOARD_SIZE * BOARD_SIZE;

export interface BoardMap {
  ladders: Record<number, number>;
  snakes: Record<number, number>;
}

export type BoardPresetId = 'easy' | 'normal' | 'chaos' | 'random';

export const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};

export const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};

export const BOARD_PRESETS: Record<Exclude<BoardPresetId, 'random'>, BoardMap> = {
  easy: {
    ladders: { 2: 23, 6: 45, 8: 27, 15: 44, 21: 42, 36: 55, 50: 69, 57: 76, 62: 83, 72: 92 },
    snakes: { 48: 26, 56: 37, 73: 51, 88: 67, 97: 79 },
  },
  normal: { ladders: LADDERS, snakes: SNAKES },
  chaos: {
    ladders: { 3: 22, 11: 49, 26: 58, 38: 81, 66: 87 },
    snakes: {
      16: 6, 31: 12, 47: 25, 52: 28, 59: 18, 68: 44, 76: 34, 82: 41, 89: 53, 91: 57, 94: 72, 98: 63,
    },
  },
};

export const PLAYER_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835];

export interface CharacterDef {
  id: string;
  /** warna utama tubuh */
  color: number;
  emoji: string;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'kiko', color: 0xff8a2b, emoji: '🐱' },
  { id: 'bobo', color: 0x8d5a3b, emoji: '🐻' },
  { id: 'pipi', color: 0x2f7be5, emoji: '🐧' },
  { id: 'rara', color: 0xc7ccd4, emoji: '🤖' },
  { id: 'dino', color: 0x3fb950, emoji: '🦖' },
  { id: 'mimi', color: 0xff8fc7, emoji: '🐰' },
];

export type Personality = 'cheerful' | 'shy' | 'proud';

export const PERSONALITIES: Personality[] = ['cheerful', 'shy', 'proud'];

export const MAX_BOTS = 3;

/** Tahan-lalu-lepas untuk melempar dadu: bar terisi dalam FILL detik; lepas di zona hijau = peluang naik. */
export const CHARGE_FILL_SECONDS = 1.8;
export const CHARGE_PERFECT_FROM = 0.88;
/** setelah penuh, masih ada sedikit waktu sebelum tenaga "kepanasan" (hangus tanpa bonus) */
export const CHARGE_OVERHEAT_GRACE = 0.35;
