import * as THREE from 'three';
import gsap from 'gsap';
import { BOARD_SIZE, TILE_COUNT } from '../config';
import { tileToGrid } from '../core/Rules';
import { START_CENTER, TILE_TOP, tileToWorld } from './coords';

const TILE_PALETTE = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa, 0xf783ac];

/** Papan 10x10: petak InstancedMesh + nomor via satu texture + panggung + piala di petak 100. */
export class Board {
  readonly group = new THREE.Group();
  private tiles: THREE.InstancedMesh;
  private trophy = new THREE.Group();
  private glow: THREE.Mesh;
  private lift = new Float32Array(TILE_COUNT + 1);
  private dummy = new THREE.Object3D();
  private time = 0;

  constructor() {
    // panggung / bingkai
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(10.7, 0.5, 10.7),
      new THREE.MeshStandardMaterial({ color: 0x3d2f7a, roughness: 0.7 }),
    );
    frame.position.y = -0.15;
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.group.add(frame);

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(11.1, 0.18, 11.1),
      new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.5 }),
    );
    rim.position.y = -0.26;
    rim.castShadow = true;
    this.group.add(rim);

    // petak
    const geo = new THREE.BoxGeometry(0.96, 0.2, 0.96);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    this.tiles = new THREE.InstancedMesh(geo, mat, TILE_COUNT);
    this.tiles.receiveShadow = true;
    const color = new THREE.Color();
    for (let n = 1; n <= TILE_COUNT; n++) {
      const { row, col } = tileToGrid(n);
      color.setHex(TILE_PALETTE[(row + col * 2 + (n % 2)) % TILE_PALETTE.length]);
      color.offsetHSL(0, -0.1, 0.02);
      this.tiles.setColorAt(n - 1, color);
      this.writeTile(n);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.instanceColor!.needsUpdate = true;
    this.group.add(this.tiles);

    // nomor petak (satu texture untuk seluruh papan)
    const numbers = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE),
      new THREE.MeshBasicMaterial({ map: this.makeNumberTexture(), transparent: true, depthWrite: false }),
    );
    numbers.rotation.x = -Math.PI / 2;
    numbers.position.y = TILE_TOP + 0.004;
    this.group.add(numbers);

    this.group.add(this.makeStartPad());

    // petak 100: glow + piala berputar
    const p100 = tileToWorld(TILE_COUNT);
    this.glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.03, 32),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc400, emissiveIntensity: 2.2 }),
    );
    this.glow.position.set(p100.x, TILE_TOP + 0.02, p100.z);
    this.group.add(this.glow);
    this.trophy = this.makeTrophy();
    this.trophy.position.set(p100.x, TILE_TOP + 0.05, p100.z);
    this.group.add(this.trophy);
  }

  private writeTile(n: number): void {
    const p = tileToWorld(n);
    this.dummy.position.set(p.x, 0.1 + this.lift[n], p.z);
    this.dummy.updateMatrix();
    this.tiles.setMatrixAt(n - 1, this.dummy.matrix);
  }

  /** Petak melompat kecil saat pion mendarat. */
  bounceTile(n: number): void {
    if (n < 1 || n > TILE_COUNT) return;
    const o = { v: 0 };
    gsap.to(o, {
      v: 1,
      duration: 0.36,
      ease: 'none',
      onUpdate: () => {
        this.lift[n] = Math.sin(o.v * Math.PI) * 0.09;
        this.writeTile(n);
        this.tiles.instanceMatrix.needsUpdate = true;
      },
      onComplete: () => {
        this.lift[n] = 0;
        this.writeTile(n);
        this.tiles.instanceMatrix.needsUpdate = true;
      },
    });
  }

  private makeNumberTexture(): THREE.CanvasTexture {
    const cell = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = cell * BOARD_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${cell * 0.3}px Fredoka, 'Baloo 2', system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    for (let n = 1; n <= TILE_COUNT; n++) {
      const { row, col } = tileToGrid(n);
      const x = col * cell + 14;
      const y = (BOARD_SIZE - 1 - row) * cell + 10;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(String(n), x, y);
      ctx.fillStyle = '#2a2350';
      ctx.fillText(String(n), x, y);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  private makeStartPad(): THREE.Group {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.1, 2.7),
      new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.6 }),
    );
    pad.position.set(START_CENTER.x, 0.05, START_CENTER.z);
    pad.receiveShadow = true;
    pad.castShadow = true;
    g.add(pad);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.font = "700 92px Fredoka, system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(128, 256);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('START', 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1.0),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(START_CENTER.x - 0.4, 0.105, START_CENTER.z);
    g.add(label);

    // bendera start
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    pole.position.set(START_CENTER.x - 0.6, 0.85, START_CENTER.z - 1.2);
    pole.castShadow = true;
    g.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.38),
      new THREE.MeshStandardMaterial({ color: 0xff4d6d, side: THREE.DoubleSide }),
    );
    flag.position.set(START_CENTER.x - 0.3, 1.4, START_CENTER.z - 1.2);
    flag.name = 'flag';
    g.add(flag);
    return g;
  }

  private makeTrophy(): THREE.Group {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffd23f,
      metalness: 0.7,
      roughness: 0.25,
      emissive: 0xff9f00,
      emissiveIntensity: 1.4,
    });
    const pts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.17, 0.0),
      new THREE.Vector2(0.17, 0.05),
      new THREE.Vector2(0.05, 0.1),
      new THREE.Vector2(0.05, 0.28),
      new THREE.Vector2(0.09, 0.32),
      new THREE.Vector2(0.22, 0.52),
      new THREE.Vector2(0.24, 0.62),
      new THREE.Vector2(0.19, 0.62),
      new THREE.Vector2(0.0, 0.5),
    ];
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), gold);
    cup.castShadow = true;
    g.add(cup);
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 16, Math.PI), gold);
      handle.position.set(s * 0.24, 0.5, 0);
      handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(handle);
    }
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), gold);
    star.position.y = 0.78;
    star.name = 'star';
    g.add(star);
    return g;
  }

  update(dt: number): void {
    this.time += dt;
    this.trophy.rotation.y += dt * 1.6;
    this.trophy.position.y = TILE_TOP + 0.05 + Math.sin(this.time * 2.2) * 0.03;
    const star = this.trophy.getObjectByName('star');
    if (star) {
      star.rotation.y -= dt * 3;
      star.position.y = 0.78 + Math.sin(this.time * 3) * 0.03;
    }
    const m = this.glow.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 1.8 + Math.sin(this.time * 3) * 0.6;
    const flag = this.group.getObjectByName('flag');
    if (flag) flag.rotation.y = Math.sin(this.time * 4) * 0.25;
  }
}
