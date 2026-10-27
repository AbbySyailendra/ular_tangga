import { randomBytes } from 'node:crypto';
import type { Socket } from 'socket.io';
import {
  NAME_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMsg,
  type ServerMsg,
} from '../src/network/protocol';
import { Room, RoomError } from './Room';

interface Binding {
  room: Room;
  playerId: string;
}

/** Menghubungkan socket ke room/pemain dan meneruskan pesan client ke Room. */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private bindings = new Map<string, Binding>();
  private sockets = new Map<string, Socket>();

  private sendTo = (socketId: string, msg: ServerMsg): void => {
    this.sockets.get(socketId)?.emit('msg', msg);
  };

  attach(socket: Socket): void {
    this.sockets.set(socket.id, socket);
    socket.on('msg', (raw: unknown) => {
      try {
        this.handle(socket, raw as ClientMsg);
      } catch (e) {
        if (e instanceof RoomError) this.sendTo(socket.id, { t: 'error', message: e.message });
        else {
          console.error('[server] error', e);
          this.sendTo(socket.id, { t: 'error', message: 'Terjadi kesalahan di server.' });
        }
      }
    });
    socket.on('disconnect', () => {
      const b = this.bindings.get(socket.id);
      this.bindings.delete(socket.id);
      this.sockets.delete(socket.id);
      if (b) b.room.disconnect(b.playerId);
    });
  }

  roomCount(): number {
    return this.rooms.size;
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      let code = '';
      for (const b of bytes) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
  }

  private normalizeCode(code: unknown): string {
    return String(code ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, ROOM_CODE_LENGTH);
  }

  private bind(socket: Socket, room: Room, playerId: string): void {
    this.bindings.set(socket.id, { room, playerId });
  }

  private leave(socket: Socket): void {
    const b = this.bindings.get(socket.id);
    if (!b) return;
    this.bindings.delete(socket.id);
    b.room.remove(b.playerId);
    this.sendTo(socket.id, { t: 'left' });
  }

  private handle(socket: Socket, msg: ClientMsg): void {
    if (!msg || typeof msg !== 'object') return;
    const bound = this.bindings.get(socket.id);

    switch (msg.t) {
      case 'create_room': {
        if (bound) this.leave(socket);
        const code = this.newCode();
        const room = new Room(code, this.sendTo, () => this.rooms.delete(code));
        this.rooms.set(code, room);
        const p = room.add(socket.id, String(msg.name ?? '').slice(0, NAME_MAX), String(msg.character));
        this.bind(socket, room, p.id);
        this.sendTo(socket.id, { t: 'joined', room: room.info(), you: p.id, token: p.token });
        return;
      }
      case 'join_room': {
        const room = this.rooms.get(this.normalizeCode(msg.code));
        if (!room) throw new RoomError('Room tidak ditemukan. Periksa kodenya.');
        if (bound) this.leave(socket);
        const p = room.add(socket.id, String(msg.name ?? '').slice(0, NAME_MAX), String(msg.character));
        this.bind(socket, room, p.id);
        this.sendTo(socket.id, { t: 'joined', room: room.info(), you: p.id, token: p.token });
        room.broadcastRoom();
        return;
      }
      case 'rejoin': {
        const room = this.rooms.get(this.normalizeCode(msg.code));
        const player = room?.players.find((p) => p.token === msg.token);
        if (!room || !player) {
          this.sendTo(socket.id, { t: 'error', code: 'rejoin_failed', message: 'Sesi room sudah berakhir.' });
          return;
        }
        // sambungan lama (tab lain) digantikan
        if (player.socketId && player.socketId !== socket.id) this.bindings.delete(player.socketId);
        room.reconnect(player.id, socket.id);
        this.bind(socket, room, player.id);
        this.sendTo(socket.id, { t: 'joined', room: room.info(), you: player.id, token: player.token });
        room.resync(player);
        return;
      }
      default:
        break;
    }

    if (!bound) throw new RoomError('Kamu belum berada di sebuah room.');
    const { room, playerId } = bound;
    switch (msg.t) {
      case 'set_character':
        room.setCharacter(playerId, String(msg.character));
        break;
      case 'ready':
        room.setReady(playerId, !!msg.ready);
        break;
      case 'settings':
        room.updateSettings(playerId, msg.boardPreset, msg.options);
        break;
      case 'start_game':
        room.start(playerId);
        break;
      case 'charge_start':
        room.noteChargeStart(playerId);
        break;
      case 'roll':
        room.handleRoll(playerId);
        break;
      case 'emote':
        room.emote(playerId, String(msg.id));
        break;
      case 'sync': {
        const me = room.player(playerId);
        if (me) room.resync(me);
        break;
      }
      case 'back_to_lobby':
        room.backToLobby();
        break;
      case 'leave':
        this.leave(socket);
        break;
    }
  }
}
