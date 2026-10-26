import type { Personality } from '../config';

export type ReactionEvent =
  | 'self_ladder'
  | 'self_snake'
  | 'other_ladder'
  | 'other_snake'
  | 'win'
  | 'lose';

const REACTIONS: Record<Personality, Record<ReactionEvent, string[]>> = {
  cheerful: {
    self_ladder: ['🎉', '😄'],
    self_snake: ['😅', '🙃'],
    other_ladder: ['👏', '🎉'],
    other_snake: ['😮', '😂'],
    win: ['🥳', '🏆'],
    lose: ['👏', '😄'],
  },
  shy: {
    self_ladder: ['😊'],
    self_snake: ['😭', '🥺'],
    other_ladder: ['😳'],
    other_snake: ['🥺'],
    win: ['😳', '😊'],
    lose: ['😢'],
  },
  proud: {
    self_ladder: ['😎', '💪'],
    self_snake: ['😤', '🙄'],
    other_ladder: ['😒'],
    other_snake: ['😂', '😏'],
    win: ['😎', '👑'],
    lose: ['😠', '😤'],
  },
};

/** Waktu "berpikir" sebelum melempar dadu (detik) — kepribadian hanya memengaruhi gaya, bukan peluang. */
const THINK: Record<Personality, [number, number]> = {
  cheerful: [0.7, 1.2],
  shy: [1.0, 1.5],
  proud: [0.8, 1.0],
};

/**
 * Bot: ular tangga murni keberuntungan, jadi "kecerdasan" bot hanya soal jeda natural
 * (0.8–1.5 dtk) dan emote sesuai kepribadian.
 */
export class AIController {
  constructor(readonly personality: Personality) {}

  thinkTime(): number {
    const [a, b] = THINK[this.personality];
    return a + Math.random() * (b - a);
  }

  /** Emoji reaksi atau null (tidak selalu bereaksi). */
  react(event: ReactionEvent): string | null {
    const self = event.startsWith('self') || event === 'win';
    if (Math.random() > (self ? 0.85 : 0.5)) return null;
    const list = REACTIONS[this.personality][event];
    return list[Math.floor(Math.random() * list.length)];
  }
}
