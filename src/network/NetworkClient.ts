import { io, type Socket } from 'socket.io-client';
import type { ClientMsg, RoomInfo, ServerMsg } from './protocol';

export type NetStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

type MsgOf<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;
type Handler<T extends ServerMsg['t']> = (msg: MsgOf<T>) => void;

const SESSION_KEY = 'sl3d.session';

interface Session {
  code: string;
  token: string;
}

/** Pembungkus Socket.IO: koneksi, sambung ulang otomatis (rejoin), dan penyiar pesan bertipe. */
export class NetworkClient {
  status: NetStatus = 'idle';
  room: RoomInfo | null = null;
  myId = '';

  private socket: Socket | null = null;
  private handlers = new Map<string, Set<(msg: ServerMsg) => void>>();
  private statusListeners = new Set<(s: NetStatus) => void>();
  private session: Session | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) this.session = JSON.parse(raw) as Session;
    } catch {
      /* abaikan */
    }
  }

  get hasSession(): boolean {
    return this.session !== null;
  }

  get inRoom(): boolean {
    return this.room !== null;
  }

  get isHost(): boolean {
    return !!this.room && this.room.hostId === this.myId;
  }

  onStatus(fn: (s: NetStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  on<T extends ServerMsg['t']>(type: T, fn: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const h = fn as (msg: ServerMsg) => void;
    set.add(h);
    return () => set.delete(h);
  }

  private setStatus(s: NetStatus): void {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  /** Buka koneksi (sekali). Bila ada sesi room tersimpan, otomatis mencoba masuk kembali. */
  connect(): void {
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }
    this.setStatus('connecting');
    const url = import.meta.env.VITE_SERVER_URL as string | undefined;
    const socket = url ? io(url) : io();
    this.socket = socket;

    socket.on('connect', () => {
      this.setStatus('connected');
      if (this.session) this.send({ t: 'rejoin', code: this.session.code, token: this.session.token });
    });
    socket.on('disconnect', () => this.setStatus('disconnected'));
    socket.on('connect_error', () => this.setStatus('disconnected'));
    socket.on('msg', (msg: ServerMsg) => this.receive(msg));
  }

  private receive(msg: ServerMsg): void {
    switch (msg.t) {
      case 'joined':
        this.room = msg.room;
        this.myId = msg.you;
        this.saveSession({ code: msg.room.code, token: msg.token });
        break;
      case 'room_state':
        this.room = msg.room;
        break;
      case 'left':
        this.room = null;
        this.myId = '';
        this.saveSession(null);
        break;
      case 'error':
        if (msg.code === 'rejoin_failed') {
          this.room = null;
          this.saveSession(null);
        }
        break;
      default:
        break;
    }
    this.handlers.get(msg.t)?.forEach((fn) => fn(msg));
  }

  private saveSession(s: Session | null): void {
    this.session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* abaikan */
    }
  }

  send(msg: ClientMsg): void {
    this.socket?.emit('msg', msg);
  }

  /** Keluar dari room (sesi dihapus). Koneksi tetap terbuka untuk membuat/gabung room lain. */
  leave(): void {
    if (this.room) this.send({ t: 'leave' });
    this.room = null;
    this.myId = '';
    this.saveSession(null);
  }
}
