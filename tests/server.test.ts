// @vitest-environment node
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/GameState';
import { applyRoll } from '../src/core/Rules';
import type { ClientMsg, RoomInfo, ServerMsg } from '../src/network/protocol';

// jeda server dipercepat 100x agar permainan penuh selesai dalam detik
process.env.SL3D_TIME_SCALE = '0.01';

let http: HttpServer;
let url: string;

beforeAll(async () => {
  const { RoomManager } = await import('../server/RoomManager');
  const manager = new RoomManager();
  http = createServer();
  const io = new Server(http, { cors: { origin: true } });
  io.on('connection', (s) => manager.attach(s));
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
  http.close();
});

/** Klien uji: mengumpulkan semua pesan server dan menyediakan helper menunggu. */
class TestClient {
  socket: Socket;
  msgs: ServerMsg[] = [];
  me = '';
  token = '';
  room: RoomInfo | null = null;
  state: GameState | null = null;

  constructor() {
    this.socket = connect(url, { forceNew: true, transports: ['websocket'] });
    this.socket.on('msg', (m: ServerMsg) => {
      this.msgs.push(m);
      if (m.t === 'joined') {
        this.me = m.you;
        this.token = m.token;
        this.room = m.room;
      } else if (m.t === 'room_state') this.room = m.room;
      else if (m.t === 'game_start' || m.t === 'game_snapshot') this.state = m.state;
    });
  }

  send(msg: ClientMsg): void {
    this.socket.emit('msg', msg);
  }

  async wait<T extends ServerMsg['t']>(type: T, timeout = 4000, from = 0): Promise<Extract<ServerMsg, { t: T }>> {
    const t0 = Date.now();
    for (;;) {
      const found = this.msgs.slice(from).find((m) => m.t === type);
      if (found) return found as Extract<ServerMsg, { t: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`timeout menunggu ${type}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  close(): void {
    this.socket.close();
  }
}

async function open(): Promise<TestClient> {
  const c = new TestClient();
  await new Promise<void>((r) => c.socket.on('connect', () => r()));
  return c;
}

async function makeRoom(n: number): Promise<TestClient[]> {
  const host = await open();
  host.send({ t: 'create_room', name: 'Host', character: 'kiko' });
  await host.wait('joined');
  const clients = [host];
  for (let i = 1; i < n; i++) {
    const c = await open();
    c.send({ t: 'join_room', code: host.room!.code, name: `P${i}`, character: 'kiko' });
    await c.wait('joined');
    clients.push(c);
  }
  return clients;
}

describe('room & lobby', () => {
  it('membuat room dengan kode 6 karakter, host otomatis', async () => {
    const [host] = await makeRoom(1);
    expect(host.room!.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(host.room!.hostId).toBe(host.me);
    host.close();
  });

  it('karakter bentrok otomatis diganti, nama kembar dibedakan', async () => {
    const [host, b] = await makeRoom(2);
    const chars = b.room!.players.map((p) => p.character);
    expect(new Set(chars).size).toBe(2);
    b.send({ t: 'set_character', character: host.room!.players[0].character });
    const err = await b.wait('error');
    expect(err.message).toMatch(/sudah dipakai/);
    host.close();
    b.close();
  });

  it('maksimal 4 pemain: pemain ke-5 ditolak', async () => {
    const clients = await makeRoom(4);
    const extra = await open();
    extra.send({ t: 'join_room', code: clients[0].room!.code, name: 'Lima', character: 'mimi' });
    const err = await extra.wait('error');
    expect(err.message).toMatch(/penuh/);
    [...clients, extra].forEach((c) => c.close());
  });

  it('kode salah ditolak', async () => {
    const c = await open();
    c.send({ t: 'join_room', code: 'ZZZZZZ', name: 'X', character: 'kiko' });
    expect((await c.wait('error')).message).toMatch(/tidak ditemukan/);
    c.close();
  });

  it('minimal 2 pemain dan semua siap sebelum mulai; hanya host yang boleh mulai', async () => {
    const [host, b] = await makeRoom(1).then(async ([h]) => {
      const c = await open();
      return [h, c] as const;
    });
    host.send({ t: 'start_game' });
    expect((await host.wait('error')).message).toMatch(/minimal 2/);

    b.send({ t: 'join_room', code: host.room!.code, name: 'B', character: 'bobo' });
    await b.wait('joined');
    b.send({ t: 'start_game' });
    expect((await b.wait('error')).message).toMatch(/host/);

    const from = host.msgs.length;
    host.send({ t: 'start_game' });
    expect((await host.wait('error', 4000, from)).message).toMatch(/siap/);

    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send({ t: 'start_game' });
    await host.wait('game_start');
    host.close();
    b.close();
  });
});

describe('permainan online', () => {
  it('4 pemain memainkan satu game penuh; simulasi client = server', async () => {
    const clients = await makeRoom(4);
    for (const c of clients.slice(1)) c.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 80));
    clients[0].send({ t: 'start_game' });
    const start = await clients[0].wait('game_start');
    expect(start.state.players).toHaveLength(4);
    const states = new Map<TestClient, GameState>();
    for (const c of clients) states.set(c, (await c.wait('game_start')).state);

    // setiap klien mereplikasi aturan dari hasil server dan harus selalu cocok
    let finished = false;
    const done = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('game tidak selesai')), 20000);
      for (const c of clients) {
        c.socket.on('msg', (m: ServerMsg) => {
          if (m.t === 'turn' && m.playerId === c.me) c.send({ t: 'roll' });
          if (m.t === 'turn_result') {
            const { state } = applyRoll(states.get(c)!, m.value);
            states.set(c, state);
            expect(state.players.map((p) => p.position)).toEqual(m.after.positions);
            expect(state.current).toBe(m.after.current);
            if (m.after.winnerId && !finished) {
              finished = true;
              clearTimeout(timeout);
              resolve();
            }
          }
        });
      }
    });
    await done;
    await new Promise((r) => setTimeout(r, 100)); // beri waktu pesan terakhir sampai ke semua klien
    const results = clients[0].msgs.filter((m) => m.t === 'turn_result');
    expect(results.length).toBeGreaterThan(10);
    // semua klien menerima urutan lemparan yang sama
    const seqs = clients.map((c) => c.msgs.filter((m) => m.t === 'turn_result').map((m) => (m as Extract<ServerMsg, { t: 'turn_result' }>).value).join(','));
    expect(new Set(seqs).size).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(clients[0].room!.phase).toBe('finished');

    // kembali ke lobby untuk main lagi
    clients[1].send({ t: 'back_to_lobby' });
    await new Promise((r) => setTimeout(r, 60));
    expect(clients[0].room!.phase).toBe('lobby');
    clients.forEach((c) => c.close());
  }, 30000);

  it('lemparan di luar giliran ditolak', async () => {
    const [host, b] = await makeRoom(2);
    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send({ t: 'start_game' });
    const start = await host.wait('game_start');
    const first = start.state.players[start.state.current].id;
    const other = first === host.me ? b : host;
    other.send({ t: 'roll' });
    expect((await other.wait('error')).message).toMatch(/giliran/);
    host.close();
    b.close();
  });

  it('pemain AFK dilempar otomatis oleh server (timeout giliran)', async () => {
    const [host, b] = await makeRoom(2);
    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send({ t: 'start_game' });
    await host.wait('game_start');
    const res = await host.wait('turn_result', 3000); // tidak ada yang melempar
    expect(res.value).toBeGreaterThanOrEqual(1);
    expect(res.boost).toBe(false);
    host.close();
    b.close();
  });

  it('terputus lalu masuk kembali dengan token: mendapat snapshot state', async () => {
    const [host, b] = await makeRoom(2);
    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send({ t: 'start_game' });
    await host.wait('game_start');
    await host.wait('turn_result', 3000);

    const code = host.room!.code;
    const token = b.token;
    b.close();
    await new Promise((r) => setTimeout(r, 60));
    expect(host.room!.players.find((p) => p.id !== host.me)!.connected).toBe(false);

    const back = await open();
    back.send({ t: 'rejoin', code, token });
    const joined = await back.wait('joined');
    expect(joined.you).toBe(b.me);
    const snap = await back.wait('game_snapshot');
    expect(snap.state.players).toHaveLength(2);
    expect(host.room!.players.every((p) => p.connected)).toBe(true);
    host.close();
    back.close();
  });

  it('token salah ditolak saat rejoin', async () => {
    const [host] = await makeRoom(1);
    const c = await open();
    c.send({ t: 'rejoin', code: host.room!.code, token: 'palsu' });
    const err = await c.wait('error');
    expect(err.code).toBe('rejoin_failed');
    host.close();
    c.close();
  });

  it('host keluar: host berpindah ke pemain berikutnya', async () => {
    const [host, b] = await makeRoom(2);
    host.send({ t: 'leave' });
    await new Promise((r) => setTimeout(r, 60));
    expect(b.room!.hostId).toBe(b.me);
    expect(b.room!.players).toHaveLength(1);
    host.close();
    b.close();
  });
});

describe('sambung ulang', () => {
  it('sync mengirim snapshot state terbaru saat bermain', async () => {
    const [host, b] = await makeRoom(2);
    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send({ t: 'start_game' });
    await host.wait('game_start');
    await host.wait('turn_result', 3000);
    const from = b.msgs.length;
    b.send({ t: 'sync' });
    const snap = await b.wait('game_snapshot', 3000, from);
    expect(snap.state.players).toHaveLength(2);
    expect(snap.state.turn).toBeGreaterThan(1);
    host.close();
    b.close();
  });

  it('pemain terputus tetap di room dan menerima snapshot saat kembali (dua kali berturut-turut)', async () => {
    const [host, b] = await makeRoom(2);
    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send({ t: 'start_game' });
    await host.wait('game_start');
    const code = host.room!.code;
    let token = b.token;
    let cur = b;
    for (let i = 0; i < 2; i++) {
      cur.close();
      await new Promise((r) => setTimeout(r, 60));
      expect(host.room!.players.some((p) => !p.connected)).toBe(true);
      const back = await open();
      back.send({ t: 'rejoin', code, token });
      await back.wait('game_snapshot');
      token = (await back.wait('joined')).token;
      expect(host.room!.players.every((p) => p.connected)).toBe(true);
      cur = back;
    }
    host.close();
    cur.close();
  });

  it('game selesai: pemain yang masuk kembali mendapat state akhir (pemenang terisi)', async () => {
    const [host, b] = await makeRoom(2);
    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send({ t: 'start_game' });
    await host.wait('game_start');
    // kedua pemain melempar begitu gilirannya tiba sampai ada pemenang
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('tidak selesai')), 25000);
      for (const c of [host, b]) {
        c.socket.on('msg', (m: ServerMsg) => {
          if (m.t === 'turn' && m.playerId === c.me) c.send({ t: 'roll' });
          if (c === host && m.t === 'turn_result' && m.after.winnerId) {
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    });
    const code = host.room!.code;
    const token = b.token;
    b.close();
    await new Promise((r) => setTimeout(r, 60));
    const back = await open();
    back.send({ t: 'rejoin', code, token });
    const snap = await back.wait('game_snapshot');
    expect(snap.state.winnerId).not.toBeNull();
    host.close();
    back.close();
  }, 30000);
});
