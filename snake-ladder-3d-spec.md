# 🎲 Snake & Ladder 3D — Spesifikasi Proyek Web Game

> Game Ular Tangga berbasis web dengan visual 3D, karakter animasi, sound FX dan musik yang meriah.
> Dibangun dengan **Three.js** + **Vite**, mendukung **Single Player (vs AI)** dan **Multiplayer (Lokal & Online)**.

---

## 1. Ringkasan

| Item | Keterangan |
|---|---|
| Nama kerja | **Snake & Ladder 3D** (bisa diganti, mis. "Ular Tangga Ceria") |
| Platform | Browser desktop & mobile (WebGL 2) |
| Engine render | Three.js |
| Build tool | Vite (vanilla JS / TypeScript) |
| Mode | Single Player vs AI (1–3 bot), Multiplayer Lokal (hot-seat, 2–4 pemain), Multiplayer Online (room code, 2–4 pemain) |
| Gaya visual | Cartoon / low-poly, warna cerah, suasana karnaval |
| Target performa | 60 FPS desktop, ≥ 30 FPS mobile menengah |

---

## 2. Tech Stack

### Frontend
- **Vite** — dev server & bundler
- **Three.js** — rendering 3D
- **GSAP** — tween animasi (gerak pion, kamera, UI)
- **Howler.js** — manajemen audio (SFX + musik, sprite audio, fade)
- **three/examples/jsm**:
  - `GLTFLoader` + `DRACOLoader` — model karakter & dekorasi
  - `OrbitControls` — kamera (dibatasi)
  - `EffectComposer`, `UnrealBloomPass`, `OutlinePass` — efek glow
  - `CSS2DRenderer` — label nama pemain di atas karakter
- **cannon-es** *(opsional)* — fisika lemparan dadu 3D yang realistis
- **TypeScript** *(disarankan)*

### Backend (Multiplayer Online)
- **Node.js** + **Socket.IO** — server room & sinkronisasi state (server authoritative)
- Alternatif tanpa server khusus: **PeerJS (WebRTC)** dengan host sebagai authority

### Tooling
- ESLint + Prettier
- Vitest — unit test untuk logika game
- `vite-plugin-pwa` *(opsional)* — bisa di-install sebagai app

---

## 3. Struktur Folder

```
snake-ladder-3d/
├── index.html
├── package.json
├── vite.config.ts
├── public/
│   ├── models/          # .glb karakter, ular, tangga, dadu, dekorasi
│   ├── textures/        # papan, skybox, partikel
│   ├── audio/
│   │   ├── music/       # bgm_menu.mp3, bgm_game.mp3, bgm_victory.mp3
│   │   └── sfx/         # dice_roll, step, ladder_up, snake_bite, win, click, ...
│   └── fonts/
├── src/
│   ├── main.ts                  # entry point
│   ├── config.ts                # konstanta (ukuran papan, peta ular/tangga, warna)
│   ├── core/
│   │   ├── Game.ts              # orkestrator utama, game loop
│   │   ├── GameState.ts         # state murni (serializable)
│   │   ├── Rules.ts             # logika aturan (pure functions)
│   │   ├── StateMachine.ts      # fase giliran
│   │   └── EventBus.ts          # pub/sub antar modul
│   ├── scene/
│   │   ├── SceneManager.ts      # renderer, kamera, lighting, post-processing
│   │   ├── Board.ts             # papan 10x10 + nomor petak
│   │   ├── Snake.ts             # ular (curve + animasi)
│   │   ├── Ladder.ts            # tangga
│   │   ├── Dice.ts              # dadu 3D + animasi lempar
│   │   ├── Character.ts         # pion/karakter + animasi
│   │   ├── CameraDirector.ts    # transisi kamera sinematik
│   │   ├── Effects.ts           # confetti, partikel, kembang api
│   │   └── Environment.ts       # skybox, dekorasi, balon, bendera
│   ├── audio/
│   │   └── AudioManager.ts
│   ├── players/
│   │   ├── Player.ts
│   │   ├── HumanController.ts
│   │   ├── AIController.ts
│   │   └── RemoteController.ts
│   ├── network/
│   │   ├── NetworkClient.ts
│   │   └── protocol.ts          # tipe pesan client <-> server
│   ├── ui/
│   │   ├── MainMenu.ts
│   │   ├── Lobby.ts
│   │   ├── HUD.ts
│   │   ├── CharacterSelect.ts
│   │   ├── VictoryScreen.ts
│   │   └── styles.css
│   └── utils/
│       ├── assets.ts            # preload + progress bar
│       └── random.ts            # RNG (seedable)
├── server/
│   ├── index.ts                 # Socket.IO server
│   ├── RoomManager.ts
│   └── (re-use src/core/Rules.ts)
└── tests/
    └── rules.test.ts
```

> **Penting:** `Rules.ts` dan `GameState.ts` harus **bebas dari Three.js** agar bisa dipakai bersama oleh client, server, dan unit test.

---

## 4. Aturan Permainan

1. Papan **10 × 10** (petak 1–100), penomoran **zig-zag (boustrophedon)** dimulai dari kiri bawah.
2. Semua pemain mulai di **petak 0** (di luar papan, area start).
3. Giliran bergantian; pemain melempar **1 dadu (1–6)**.
4. Pion maju sejumlah angka dadu, **langkah demi langkah** (animasi lompat per petak).
5. Berhenti di **kaki tangga** → naik ke ujung tangga.
6. Berhenti di **kepala ular** → turun ke ekor ular.
7. **Dapat 6** → lempar lagi (maksimal 3 kali beruntun; 6 ketiga kali = giliran hangus) — *bisa di-toggle di pengaturan*.
8. **Harus pas di 100** (opsi): jika lebih, pion **memantul mundur** (bounce back). Opsi alternatif: "cukup ≥ 100".
9. Pemenang = pemain pertama yang tiba di 100. Opsional: lanjutkan untuk peringkat 2, 3, 4.

### Peta Default Ular & Tangga (`config.ts`)

```ts
export const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};

export const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};
```

- Sediakan **3 preset papan** (Mudah / Normal / Kacau) + opsi **acak** dengan validasi (tidak boleh ada ujung yang bertumpuk, tidak ada di petak 1 & 100).

### Konversi Petak → Posisi 3D

```ts
export function tileToGrid(n: number) {
  const idx = n - 1;
  const row = Math.floor(idx / 10);
  const colRaw = idx % 10;
  const col = row % 2 === 0 ? colRaw : 9 - colRaw; // zig-zag
  return { row, col };
}

export function tileToWorld(n: number, tileSize = 1) {
  const { row, col } = tileToGrid(n);
  return new THREE.Vector3(
    (col - 4.5) * tileSize,
    0,
    -(row - 4.5) * tileSize,
  );
}
```

---

## 5. State Machine Giliran

```
LOBBY ─► INTRO ─► TURN_START ─► AWAIT_ROLL ─► ROLLING ─► MOVING
                      ▲                                     │
                      │                                     ▼
                      │                          RESOLVE_TILE (ular/tangga)
                      │                                     │
                      │              ┌──────── dapat 6? ────┤
                      │              ▼                      ▼
                      └──────── NEXT_TURN ◄────────── CHECK_WIN ─► GAME_OVER
```

- Setiap transisi meng-emit event lewat `EventBus` (`turn:start`, `dice:rolled`, `move:step`, `ladder:climb`, `snake:bite`, `game:win`).
- Lapisan visual & audio **hanya mendengarkan event** — tidak mengubah state.
- `GameState` harus serializable (JSON) untuk sinkronisasi online & fitur **save/resume**.

---

## 6. Visual 3D

### 6.1 Scene & Lighting
- `WebGLRenderer` dengan `antialias`, `toneMapping = ACESFilmic`, `outputColorSpace = SRGB`.
- Shadow: `PCFSoftShadowMap`, satu `DirectionalLight` (matahari) + `HemisphereLight` (langit/tanah).
- **Post-processing**: Bloom ringan untuk efek glow pada tangga, petak 100, dan confetti.
- Skybox gradien cerah / panorama karnaval; awan low-poly bergerak pelan.

### 6.2 Papan
- 100 petak berupa `InstancedMesh` (hemat draw call), warna selang-seling cerah (pastel/rainbow).
- Nomor petak via **texture atlas** atau `TextGeometry` tipis di atas petak.
- Petak 100 diberi **mahkota/piala berputar** + glow.
- Papan berada di atas "panggung" / pulau melayang dengan dekorasi: balon, bendera segitiga, pohon low-poly, lampu hias berkedip.

### 6.3 Ular
- Dibangun dari `CatmullRomCurve3` + `TubeGeometry` (berliku, sedikit melengkung di atas papan).
- Kepala model terpisah (mata besar, lidah keluar-masuk).
- Animasi idle: shader vertex sederhana untuk efek "bernapas"/bergoyang.
- Saat pion tergigit: kepala ular **membuka mulut & menerjang**, pion **meluncur mengikuti kurva** tubuh ular ke ekor.

### 6.4 Tangga
- Dua rel + anak tangga (merged geometry), warna kayu/pelangi.
- Saat dipakai: anak tangga **menyala berurutan**, pion **memanjat** sambil sedikit bergoyang.

### 6.5 Dadu
- Model dadu bulat-tepi (rounded box) dengan titik (pips) tekstur.
- **Opsi A (sederhana):** animasi GSAP berputar acak lalu mendarat dengan rotasi sesuai hasil (hasil ditentukan dulu oleh RNG/server).
- **Opsi B (fisika):** `cannon-es` — dadu dilempar ke "tray"; hasil **ditentukan dulu**, lalu rotasi awal disesuaikan agar sisi yang benar menghadap atas (deterministik & aman untuk multiplayer).
- Kamera zoom singkat ke dadu, angka hasil muncul besar dengan efek pop.

### 6.6 Karakter
Minimal **6 karakter** yang bisa dipilih, gaya chibi/low-poly, contoh:

| Karakter | Warna | Ciri |
|---|---|---|
| Kiko si Kucing | Oranye | Ekor bergoyang |
| Bobo si Beruang | Cokelat | Topi pesta |
| Pipi si Pinguin | Biru | Jalan meloncat-loncat |
| Rara si Robot | Perak | Antena berkedip |
| Dino si Dinosaurus | Hijau | Ekor besar |
| Mimi si Kelinci | Pink | Telinga panjang |

**Animasi yang dibutuhkan** (via `AnimationMixer` dari GLB, atau prosedural):
- `idle` — bernapas/melambai saat menunggu
- `hop` — lompat per petak (lintasan parabola GSAP)
- `climb` — memanjat tangga
- `slide` / `scared` — meluncur di tubuh ular dengan ekspresi kaget
- `cheer` — selebrasi saat dapat tangga / menang
- `sad` — lesu saat tergigit ular

**Sumber model (gratis, cek lisensi):** Quaternius, Kenney.nl, Poly Pizza, atau buat sendiri di Blender. Jika belum ada model, buat **karakter prosedural** dari primitif (kapsul + bola + kerucut) sebagai placeholder.

- Jika beberapa pion di petak yang sama → susun melingkar kecil (offset) agar tidak tumpang tindih.
- Label nama + warna pemain melayang di atas kepala (`CSS2DRenderer`).

### 6.7 Kamera (`CameraDirector`)
- Default: sudut isometrik 3/4 menghadap papan.
- Saat giliran: kamera **mengikuti pion** yang aktif secara halus.
- Momen spesial (tangga/ular/menang): **cut sinematik** singkat (≤ 2 detik) lalu kembali.
- Pemain bisa rotate/zoom terbatas dengan `OrbitControls` (clamp sudut & jarak); tombol "reset kamera".

### 6.8 Efek Meriah
- **Confetti** (partikel `InstancedMesh`) saat naik tangga & menang.
- **Kembang api** di langit saat ada pemenang.
- Bintang/kilau kecil saat pion mendarat.
- Screen shake ringan saat ular menggigit.
- Lampu hias papan berkedip mengikuti beat musik (opsional, pakai `AnalyserNode`).

---

## 7. Audio

### 7.1 Musik (loop, fade in/out antar layar)
| Track | Nuansa |
|---|---|
| `bgm_menu` | Ceria, upbeat, gaya karnaval/sirkus |
| `bgm_game` | Riang, tempo sedang, tidak melelahkan didengar lama |
| `bgm_tension` | Lebih cepat saat ada pemain di petak ≥ 90 (crossfade) |
| `bgm_victory` | Fanfare kemenangan |

### 7.2 Sound FX
| Event | SFX |
|---|---|
| Klik tombol | `click`, `hover` |
| Lempar dadu | `dice_shake`, `dice_roll`, `dice_land` |
| Pion melangkah | `step` (pitch naik tiap langkah) |
| Naik tangga | `ladder_up` (arpeggio naik) + `cheer` |
| Digigit ular | `snake_hiss`, `bite`, `slide_down` (nada turun) |
| Dapat 6 | `bonus` |
| Menang | `fanfare`, `fireworks`, `crowd_cheer` |
| Giliran pemain | `your_turn` (ding) |
| Voice karakter | `yay`, `oh_no` per karakter (opsional) |

**Sumber gratis:** Kenney Audio, freesound.org (CC0), Pixabay Music, OpenGameArt. Simpan lisensi di `public/audio/CREDITS.md`.

### 7.3 `AudioManager`
- Volume terpisah: **Master / Musik / SFX** + tombol mute, disimpan di `localStorage`.
- Audio di-*unlock* pada interaksi pertama (kebijakan autoplay browser).
- Gunakan **audio sprite** untuk SFX agar ringan.
- Format: `.webm/.ogg` + fallback `.mp3`.

---

## 8. Mode Permainan

### 8.1 Single Player (vs AI)
- 1 pemain manusia + 1–3 bot.
- Bot otomatis melempar dadu setelah jeda natural (0.8–1.5 dtk).
- Tingkat kesulitan hanya mempengaruhi "kepribadian" (reaksi/emote), karena ular tangga murni keberuntungan.
- Tombol **percepat (2x)** untuk animasi giliran bot.

### 8.2 Multiplayer Lokal (Hot-seat)
- 2–4 pemain di satu perangkat; tiap pemain pilih nama, karakter, warna.
- Banner besar "Giliran **Nama**!" sebelum tiap giliran.

### 8.3 Multiplayer Online
- **Buat Room** → dapat kode 6 karakter (+ link undangan).
- **Gabung Room** via kode; lobby menampilkan pemain, karakter, status siap.
- Host bisa mengatur: jumlah pemain, preset papan, aturan (6 = lempar lagi, harus pas 100), bot pengisi slot kosong.
- **Server authoritative**: RNG dadu & validasi langkah dilakukan di server; client hanya mengirim intent `ROLL`.
- **Reconnect**: pemain yang terputus bisa kembali dalam 60 detik; jika tidak, digantikan bot.
- **Timer giliran** 20 detik → auto-roll jika AFK.
- Fitur sosial: **emote cepat** (👏 😂 😱 🎉) yang muncul di atas karakter.

#### Protokol Pesan (`protocol.ts`)

```ts
// Client -> Server
type ClientMsg =
  | { t: 'create_room'; name: string; character: string }
  | { t: 'join_room'; code: string; name: string; character: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'start_game' }            // host only
  | { t: 'roll' }
  | { t: 'emote'; id: string };

// Server -> Client
type ServerMsg =
  | { t: 'room_state'; room: RoomInfo }
  | { t: 'game_start'; state: GameState }
  | { t: 'dice_result'; playerId: string; value: number }
  | { t: 'move'; playerId: string; path: number[]; jump?: { from: number; to: number; kind: 'ladder' | 'snake' } }
  | { t: 'turn'; playerId: string; deadline: number }
  | { t: 'game_over'; ranking: string[] }
  | { t: 'emote'; playerId: string; id: string }
  | { t: 'error'; message: string };
```

> Server mengirim **path lengkap** (daftar petak) agar animasi di semua client identik.

---

## 9. UI / UX

- Overlay HTML/CSS di atas canvas (bukan UI di dalam WebGL) agar mudah responsif.
- Font tebal & playful (mis. Fredoka / Baloo 2 dari Google Fonts).
- **Layar:**
  1. **Loading** — progress bar aset + tips lucu
  2. **Main Menu** — Main Sendiri / Main Bareng (Lokal) / Main Online / Pengaturan / Cara Main
  3. **Pilih Karakter** — preview 3D karakter berputar
  4. **Lobby Online**
  5. **HUD in-game** — daftar pemain + posisi, indikator giliran, tombol LEMPAR DADU besar, tombol pause, volume, emote
  6. **Pause** — lanjut, pengaturan, keluar
  7. **Victory** — podium 3D (juara 1-2-3), confetti, tombol Main Lagi
- Kontrol: klik/tap tombol dadu, atau **Spasi**; mobile: tombol besar di bawah layar.
- Bahasa: **Indonesia** (default) + English (i18n sederhana via file JSON).
- Aksesibilitas: mode kontras tinggi, opsi kurangi gerakan (matikan screen shake & cut kamera).

---

## 10. Performa

- `InstancedMesh` untuk petak, confetti, dekorasi berulang.
- Kompresi model: **Draco/Meshopt**, tekstur **KTX2** (opsional).
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Preset kualitas otomatis: **Low** (tanpa bloom & bayangan) untuk mobile lemah.
- Lazy-load audio musik; SFX dipreload.
- Dispose geometry/material saat keluar dari game.
- Target ukuran build awal < 5 MB (tanpa musik).

---

## 11. Setup & Perintah

```bash
# Buat proyek
npm create vite@latest snake-ladder-3d -- --template vanilla-ts
cd snake-ladder-3d

# Dependensi client
npm i three gsap howler socket.io-client
npm i -D @types/three @types/howler vitest

# (opsional) fisika dadu
npm i cannon-es

# Server
mkdir server && cd server
npm init -y
npm i socket.io
npm i -D typescript tsx @types/node

# Jalankan
npm run dev            # client (Vite)
npx tsx server/index.ts # server multiplayer
```

`.env`:
```
VITE_SERVER_URL=http://localhost:3001
```

---

## 12. Roadmap Pengembangan

| Fase | Isi | Hasil |
|---|---|---|
| **1. Fondasi** | Setup Vite + Three.js, scene, kamera, lighting, papan 10×10 dengan nomor | Papan 3D tampil |
| **2. Logika inti** | `Rules.ts`, `GameState`, state machine, unit test | Game jalan di console |
| **3. Gameplay visual** | Pion placeholder, dadu, animasi langkah, ular & tangga | Single player dasar bisa dimainkan |
| **4. Karakter** | Model GLB, animasi, pemilihan karakter, label nama | Karakter hidup |
| **5. Audio** | AudioManager, musik, semua SFX, pengaturan volume | Suasana meriah |
| **6. Efek & polish** | Confetti, kembang api, kamera sinematik, bloom, dekorasi | Visual "wow" |
| **7. Multiplayer lokal + AI** | Hot-seat 2–4 pemain, bot | Mode offline lengkap |
| **8. Multiplayer online** | Server Socket.IO, room, lobby, sinkronisasi, reconnect, emote | Main bareng online |
| **9. UI & mobile** | Semua layar, responsif, i18n, aksesibilitas | Siap dirilis |
| **10. Rilis** | Optimasi, PWA, deploy | Live |

---

## 13. Deploy

- **Client:** Vercel / Netlify / Cloudflare Pages (`npm run build` → folder `dist/`).
- **Server:** Railway / Render / Fly.io / VPS sendiri (Node + PM2 + Nginx reverse proxy, aktifkan WebSocket upgrade).
- Atur CORS server hanya untuk domain client.

---

## 14. Kriteria Selesai (Acceptance Criteria)

- [ ] Papan 3D 10×10 dengan penomoran zig-zag benar, ular & tangga sesuai `config.ts`.
- [ ] Dadu 3D teranimasi dan hasil yang ditampilkan **selalu sama** dengan nilai logika.
- [ ] Pion bergerak per petak dengan animasi lompat; naik tangga & turun ular teranimasi penuh.
- [ ] Minimal 6 karakter dapat dipilih, masing-masing dengan animasi idle, hop, cheer, sad.
- [ ] Musik latar + seluruh SFX di tabel bagian 7 berbunyi pada event yang tepat; volume & mute tersimpan.
- [ ] Single player vs 1–3 bot berjalan sampai selesai tanpa error.
- [ ] Hot-seat 2–4 pemain berfungsi.
- [ ] Online: buat/gabung room via kode, 2–4 pemain tersinkron, dadu ditentukan server, reconnect berfungsi.
- [ ] Layar kemenangan dengan podium, confetti, kembang api, dan fanfare.
- [ ] Berjalan ≥ 30 FPS di HP Android kelas menengah dan responsif di layar portrait & landscape.
- [ ] Unit test `Rules.ts` lulus (tangga, ular, bounce di 100, aturan angka 6).

---

## 15. Ide Pengembangan Lanjutan

- Petak spesial: ⭐ bonus lempar, ❄️ beku 1 giliran, 🌀 teleport acak.
- Tema papan: Hutan, Luar Angkasa, Bawah Laut, Candi Nusantara.
- Kostum/aksesori karakter yang bisa dibuka.
- Leaderboard & riwayat pertandingan.
- Mode turnamen dan spectator.
- Chat singkat dengan filter kata.
