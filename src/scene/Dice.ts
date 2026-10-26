import * as THREE from 'three';
import gsap from 'gsap';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE_TOP } from './coords';

const SIZE = 0.95;

// Urutan material BoxGeometry: +x, -x, +y, -y, +z, -z. Sisi berlawanan berjumlah 7.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
};

function faceTexture(value: number): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, s, s);
  g.fillStyle = value === 1 ? '#e53935' : '#25203d';
  for (const [x, y] of PIPS[value]) {
    g.beginPath();
    g.arc(x * s, y * s, value === 1 ? 38 : 27, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Dadu 3D (rounded box). Hasil ditentukan lebih dulu; animasi hanya mendarat ke sisi yang benar. */
export class Dice {
  readonly mesh: THREE.Mesh;
  private shadowBlob: THREE.Mesh;
  private busy = false;

  constructor() {
    const mats = FACE_VALUES.map(
      (v) => new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.35, metalness: 0 }),
    );
    this.mesh = new THREE.Mesh(new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.14), mats);
    this.mesh.castShadow = true;
    this.mesh.visible = false;

    this.shadowBlob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.visible = false;
  }

  get objects(): THREE.Object3D[] {
    return [this.mesh, this.shadowBlob];
  }

  /** Rotasi akhir yang membuat sisi `value` menghadap ke atas (+ putaran acak di sumbu Y). */
  private finalQuaternion(value: number): THREE.Quaternion {
    const idx = FACE_VALUES.indexOf(value);
    const q = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[idx], new THREE.Vector3(0, 1, 0));
    const spinY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    return spinY.multiply(q);
  }

  /**
   * Lempar dadu dari depan-atas papan ke tengah papan. Resolve saat selesai memantul;
   * `onLand` dipanggil tepat saat menyentuh papan (untuk SFX).
   */
  throw(value: number, onLand?: () => void): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    const mesh = this.mesh;
    const restY = TILE_TOP + SIZE / 2;
    const from = new THREE.Vector3((Math.random() - 0.5) * 3, 5.2, 7.5);
    const land = new THREE.Vector3((Math.random() - 0.5) * 1.6, restY, 0.6 + Math.random());
    const finalQ = this.finalQuaternion(value);
    const fallStartQ = new THREE.Quaternion();
    const spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const spinQ = new THREE.Quaternion();
    const spins = 3 + Math.floor(Math.random() * 2);

    mesh.visible = true;
    mesh.scale.setScalar(1);
    mesh.position.copy(from);
    mesh.quaternion.random();
    this.shadowBlob.visible = true;
    this.syncShadow(restY);

    const fall = { p: 0 };
    const hover = { v: 0 };

    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.busy = false;
          resolve();
        },
      });
      // 1) dikocok di udara
      tl.to(hover, {
        v: 1,
        duration: 0.5,
        ease: 'none',
        onUpdate: () => {
          mesh.position.set(from.x + Math.sin(hover.v * 38) * 0.1, from.y + Math.sin(hover.v * Math.PI) * 0.5, from.z);
          mesh.rotation.x += 0.42;
          mesh.rotation.z += 0.31;
          this.syncShadow(restY);
        },
      })
        // 2) jatuh sambil berputar, rotasi akhir selalu sisi yang sudah ditentukan
        .add(() => {
          from.copy(mesh.position);
          fallStartQ.copy(mesh.quaternion);
        })
        .to(fall, {
          p: 1,
          duration: 0.7,
          ease: 'none',
          onUpdate: () => {
            const p = fall.p;
            const fallEase = p * p;
            mesh.position.x = THREE.MathUtils.lerp(from.x, land.x, p);
            mesh.position.z = THREE.MathUtils.lerp(from.z, land.z, p);
            mesh.position.y = THREE.MathUtils.lerp(from.y, land.y, fallEase);
            const settle = 1 - Math.pow(1 - p, 3);
            mesh.quaternion.slerpQuaternions(fallStartQ, finalQ, settle);
            spinQ.setFromAxisAngle(spinAxis, (1 - settle) * spins * Math.PI * 2);
            mesh.quaternion.premultiply(spinQ);
            this.syncShadow(restY);
          },
        })
        // 3) mendarat + pantulan kecil
        .add(() => onLand?.())
        .to(mesh.position, { y: restY + 0.3, duration: 0.13, ease: 'power2.out', onUpdate: () => this.syncShadow(restY) })
        .to(mesh.position, { y: restY, duration: 0.15, ease: 'power2.in', onUpdate: () => this.syncShadow(restY) });
    });
  }

  private syncShadow(restY: number): void {
    const m = this.mesh.position;
    this.shadowBlob.position.set(m.x, TILE_TOP + 0.012, m.z);
    this.shadowBlob.scale.setScalar(Math.max(0.35, 1.15 - Math.max(0, m.y - restY) * 0.14));
  }

  /** Hentikan dan sembunyikan seketika (keluar dari game). */
  reset(): void {
    gsap.killTweensOf(this.mesh.position);
    gsap.killTweensOf(this.mesh.scale);
    this.busy = false;
    this.mesh.visible = false;
    this.shadowBlob.visible = false;
  }

  /** Dadu mengecil lalu hilang. */
  hide(): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this.mesh.scale, {
        x: 0.01,
        y: 0.01,
        z: 0.01,
        duration: 0.25,
        ease: 'back.in(2)',
        onComplete: () => {
          this.mesh.visible = false;
          this.shadowBlob.visible = false;
          resolve();
        },
      });
    });
  }
}
