import { randomBytes } from 'node:crypto';
import {
  BOARD_PRESETS,
  CHARACTERS,
  CHARGE_FILL_SECONDS,
  CHARGE_OVERHEAT_GRACE,
  CHARGE_PERFECT_FROM,
  PLAYER_COLORS,
  type BoardPresetId,
} from '../src/config';
import { createInitialState, type GameState } from '../src/core/GameState';
import { DEFAULT_OPTIONS, applyRoll, generateRandomBoard, rollDie, type RuleOptions } from '../src/core/Rules';
import {
  EMOTES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX,
  TURN_SECONDS,
  estimateAnimationMs,
  type RoomInfo,
  type RoomPhase,
  type RoomSettings,
  type ServerMsg,
  type TurnSnapshot,
} from '../src/network/protocol';
import { createRng, randomSeed, type Rng } from '../src/utils/random';

/** toleransi latensi jaringan saat menilai lemparan sempurna (detik) */
const LATENCY_SLACK = 0.3;
/** pengali semua jeda server (uji otomatis memakai nilai kecil agar permainan penuh berjalan cepat) */
const TIME_SCALE = Number(process.env.SL3D_TIME_SCALE ?? 1);
const ms = (v: number) => v * TIME_SCALE;
const LOBBY_GRACE_MS = 20_000;
const EMPTY_ROOM_MS = 60_000;

export interface ServerPlayer {
  id: string;
  token: string;
  socketId: string | null;
  name: string;
  character: string;
  slot: number;
  ready: boolean;
}

type Send = (socketId: string, msg: ServerMsg) => void;

export class RoomError extends Error {}

/** Satu room: lobby, lalu permainan yang dijalankan server (server authoritative). */
export class Room {
  phase: RoomPhase = 'lobby';
  hostId = '';
  readonly players: ServerPlayer[] = [];
  settings: RoomSettings = { boardPreset: 'normal', options: { ...DEFAULT_OPTIONS } };

  private state: GameState | null = null;
  private rng: Rng = createRng(1);
  private seq = 0;
  private turnTimer: NodeJS.Timeout | null = null;
  private rollTimer: NodeJS.Timeout | null = null;
  private emptyTimer: NodeJS.Timeout | null = null;
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private chargeStart = new Map<string, number>();
  /** lemparan baru boleh diproses setelah animasi giliran sebelumnya kira-kira selesai */
  private canRollAt = 0;

  constructor(
    readonly code: string,
    private send: Send,
    private onEmpty: () => void,
  ) {}

  // ───────────────────────── Info & siaran ─────────────────────────

  info(): RoomInfo {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        character: p.character,
        color: PLAYER_COLORS[p.slot],
        ready: p.ready,
        connected: p.socketId !== null,
        isHost: p.id === this.hostId,
      })),
    };
  }

  private to(p: ServerPlayer, msg: ServerMsg): void {
    if (p.socketId) this.send(p.socketId, msg);
  }

  broadcast(msg: ServerMsg): void {
    for (const p of this.players) this.to(p, msg);
  }

  broadcastRoom(): void {
    this.broadcast({ t: 'room_state', room: this.info() });
  }

  player(id: string): ServerPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  // ───────────────────────── Anggota ─────────────────────────

  add(socketId: string, rawName: string, character: string): ServerPlayer {
    if (this.phase !== 'lobby') throw new RoomError('Permainan sudah dimulai.');
    if (this.players.length >= MAX_PLAYERS) throw new RoomError(`Room penuh (maksimal ${MAX_PLAYERS} pemain).`);
    const slot = [0, 1, 2, 3].find((s) => !this.players.some((p) => p.slot === s))!;
    const p: ServerPlayer = {
      id: randomBytes(4).toString('hex'),
      token: randomBytes(16).toString('hex'),
      socketId,
      name: this.uniqueName(rawName),
      character: this.freeCharacter(character),
      slot,
      ready: false,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.cancelEmptyTimer();
    return p;
  }

  private uniqueName(raw: string): string {
    const base = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Pemain';
    let name = base;
    for (let i = 2; this.players.some((p) => p.name.toLowerCase() === name.toLowerCase()); i++) {
      name = `${base.slice(0, NAME_MAX - 2)} ${i}`;
    }
    return name;
  }

  private freeCharacter(wanted: string): string {
    const taken = new Set(this.players.map((p) => p.character));
    if (CHARACTERS.some((c) => c.id === wanted) && !taken.has(wanted)) return wanted;
    return CHARACTERS.find((c) => !taken.has(c.id))!.id;
  }

  setCharacter(id: string, character: string): void {
    const p = this.player(id);
    if (!p || this.phase !== 'lobby') return;
    if (!CHARACTERS.some((c) => c.id === character)) return;
    if (this.players.some((o) => o.id !== id && o.character === character)) {
      throw new RoomError('Karakter itu sudah dipakai pemain lain.');
    }
    p.character = character;
    p.ready = false;
    this.broadcastRoom();
  }

  setReady(id: string, ready: boolean): void {
    const p = this.player(id);
    if (!p || this.phase !== 'lobby') return;
    p.ready = ready;
    this.broadcastRoom();
  }

  updateSettings(id: string, boardPreset?: BoardPresetId, options?: Partial<RuleOptions>): void {
    if (id !== this.hostId) throw new RoomError('Hanya host yang boleh mengubah pengaturan.');
    if (this.phase !== 'lobby') return;
    if (boardPreset && (['easy', 'normal', 'chaos', 'random'] as string[]).includes(boardPreset)) {
      this.settings.boardPreset = boardPreset;
    }
    if (options) {
      if (typeof options.sixRollsAgain === 'boolean') this.settings.options.sixRollsAgain = options.sixRollsAgain;
      if (typeof options.exactFinish === 'boolean') this.settings.options.exactFinish = options.exactFinish;
    }
    for (const p of this.players) if (p.id !== this.hostId) p.ready = false;
    this.broadcastRoom();
  }

  /** Pemain keluar (atau diputus lama di lobby). Host berpindah ke pemain berikutnya. */
  remove(id: string): void {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    this.clearGrace(id);
    this.players.splice(idx, 1);
    if (this.players.length === 0) {
      this.destroy();
      this.onEmpty();
      return;
    }
    if (this.hostId === id) {
      this.hostId = this.players[0].id;
      this.players[0].ready = false;
    }
    if (this.phase === 'playing' && this.players.length < MIN_PLAYERS) {
      // lawan terakhir pergi: permainan tidak bisa dilanjutkan
      this.phase = 'lobby';
      this.stopTurn();
      this.state = null;
    }
    this.broadcastRoom();
  }

  // ───────────────────────── Koneksi ─────────────────────────

  disconnect(id: string): void {
    const p = this.player(id);
    if (!p) return;
    p.socketId = null;
    p.ready = false;
    if (this.phase === 'lobby') {
      // beri waktu menyambung ulang (mis. refresh halaman) sebelum slotnya dilepas
      this.graceTimers.set(id, setTimeout(() => this.remove(id), LOBBY_GRACE_MS));
    } else if (this.phase === 'playing' && this.state && this.state.players[this.state.current].id === id) {
      this.scheduleTurn(0); // giliran pemain yang terputus dimainkan otomatis
    }
    this.broadcastRoom();
    if (this.players.every((o) => o.socketId === null)) {
      this.emptyTimer = setTimeout(() => {
        this.destroy();
        this.onEmpty();
      }, EMPTY_ROOM_MS);
    }
  }

  reconnect(id: string, socketId: string): ServerPlayer | null {
    const p = this.player(id);
    if (!p) return null;
    p.socketId = socketId;
    this.clearGrace(id);
    this.cancelEmptyTimer();
    this.broadcastRoom();
    return p;
  }

  /** Kirim state terbaru ke satu pemain yang baru menyambung ulang. */
  resync(p: ServerPlayer): void {
    if (this.phase === 'playing' && this.state) {
      this.to(p, { t: 'game_snapshot', state: this.state, seq: this.seq });
      const cur = this.state.players[this.state.current];
      this.to(p, { t: 'turn', playerId: cur.id, deadline: Date.now() + ms(TURN_SECONDS * 1000) });
    }
  }

  private clearGrace(id: string): void {
    const t = this.graceTimers.get(id);
    if (t) clearTimeout(t);
    this.graceTimers.delete(id);
  }

  private cancelEmptyTimer(): void {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  // ───────────────────────── Permainan ─────────────────────────

  start(id: string): void {
    if (id !== this.hostId) throw new RoomError('Hanya host yang boleh memulai permainan.');
    if (this.phase !== 'lobby') return;
    if (this.players.length < MIN_PLAYERS) throw new RoomError(`Butuh minimal ${MIN_PLAYERS} pemain.`);
    if (this.players.some((p) => p.socketId === null)) throw new RoomError('Ada pemain yang terputus.');
    if (this.players.some((p) => p.id !== this.hostId && !p.ready)) throw new RoomError('Belum semua pemain siap.');

    this.rng = createRng(randomSeed());
    const board =
      this.settings.boardPreset === 'random'
        ? generateRandomBoard(this.rng)
        : structuredClone(BOARD_PRESETS[this.settings.boardPreset]);
    // urutan giliran diacak
    const order = this.rng.shuffle([...this.players]);
    this.state = createInitialState(
      order.map((p) => ({
        id: p.id,
        name: p.name,
        character: p.character,
        color: PLAYER_COLORS[p.slot],
        isBot: false,
      })),
      board,
      structuredClone(this.settings.options),
      this.rng.getState(),
    );
    this.phase = 'playing';
    this.seq = 0;
    this.canRollAt = 0;
    this.chargeStart.clear();
    this.broadcast({ t: 'game_start', state: this.state, seq: this.seq });
    this.broadcastRoom();
    this.scheduleTurn(ms(2500)); // waktu intro kamera di sisi client
  }

  noteChargeStart(id: string): void {
    if (this.phase === 'playing' && this.state?.players[this.state.current].id === id) {
      this.chargeStart.set(id, Date.now());
    }
  }

  /** Lemparan dari pemain: diproses bila gilirannya; ditunda sampai animasi sebelumnya selesai. */
  handleRoll(id: string): void {
    if (this.phase !== 'playing' || !this.state) return;
    if (this.state.players[this.state.current].id !== id) throw new RoomError('Bukan giliranmu.');
    if (this.rollTimer) return; // sudah menunggu
    // boost dinilai saat tombol dilepas, bukan saat lemparan akhirnya dieksekusi
    const boost = this.judgeBoost(id);
    const wait = this.canRollAt - Date.now();
    if (wait > 0) {
      this.rollTimer = setTimeout(() => {
        this.rollTimer = null;
        this.doRoll(id, boost);
      }, wait);
      return;
    }
    this.doRoll(id, boost);
  }

  private judgeBoost(id: string): boolean {
    const start = this.chargeStart.get(id);
    this.chargeStart.delete(id);
    if (start === undefined) return false;
    const elapsed = (Date.now() - start) / 1000;
    return (
      elapsed >= CHARGE_FILL_SECONDS * CHARGE_PERFECT_FROM - LATENCY_SLACK &&
      elapsed <= CHARGE_FILL_SECONDS + CHARGE_OVERHEAT_GRACE + LATENCY_SLACK
    );
  }

  private doRoll(id: string, boost: boolean): void {
    const s = this.state;
    if (this.phase !== 'playing' || !s || s.players[s.current].id !== id) return;
    this.stopTurn();
    this.rng.setState(s.rngState);
    const value = rollDie(this.rng, boost);
    const { state: next, outcome } = applyRoll(s, value);
    next.rngState = this.rng.getState();
    this.state = next;
    this.seq++;

    const after: TurnSnapshot = {
      positions: next.players.map((p) => p.position),
      current: next.current,
      consecutiveSixes: next.consecutiveSixes,
      turn: next.turn,
      winnerId: next.winnerId,
      ranking: next.ranking,
    };
    this.broadcast({ t: 'turn_result', seq: this.seq, playerId: id, value, boost, after });

    if (next.winnerId) {
      this.phase = 'finished';
      this.broadcastRoom();
      return;
    }
    const anim = ms(outcome.forfeited ? 2600 : estimateAnimationMs(outcome.move!.path.length, outcome.move!.jump?.kind ?? null));
    this.canRollAt = Date.now() + anim * 0.6;
    this.scheduleTurn(anim);
  }

  /** Umumkan giliran berikutnya dan pasang pewaktu (auto-roll bila AFK / terputus). */
  private scheduleTurn(animMs: number): void {
    const s = this.state;
    if (!s || this.phase !== 'playing') return;
    this.stopTurn();
    const cur = s.players[s.current];
    const p = this.player(cur.id);
    const away = !p || p.socketId === null;
    const wait = away ? animMs + ms(1200) : animMs + ms(TURN_SECONDS * 1000);
    this.broadcast({ t: 'turn', playerId: cur.id, deadline: Date.now() + wait });
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.doRoll(cur.id, false);
    }, wait);
  }

  private stopTurn(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    if (this.rollTimer) clearTimeout(this.rollTimer);
    this.rollTimer = null;
  }

  emote(id: string, emoteId: string): void {
    if (!this.player(id) || !(EMOTES as readonly string[]).includes(emoteId)) return;
    this.broadcast({ t: 'emote', playerId: id, id: emoteId });
  }

  /** Setelah permainan selesai: kembali ke lobby untuk main lagi. */
  backToLobby(): void {
    if (this.phase === 'finished') {
      this.phase = 'lobby';
      this.state = null;
      this.stopTurn();
      for (const p of this.players) p.ready = false;
      this.broadcastRoom();
    }
  }

  destroy(): void {
    this.stopTurn();
    this.cancelEmptyTimer();
    this.graceTimers.forEach((t) => clearTimeout(t));
    this.graceTimers.clear();
  }
}
