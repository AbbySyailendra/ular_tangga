import * as THREE from 'three';
import gsap from 'gsap';
import { TILE_TOP, tileSurface } from './coords';

export const LADDER_COLORS = [0xff7043, 0x26a69a, 0x7e57c2, 0xffca28, 0x42a5f5, 0xec407a, 0x9ccc65, 0x8d6e63];

/** Tangga: dua rel + anak tangga (menyala berurutan saat dipakai), sedikit menanjak. */
export class Ladder {
  readonly group = new THREE.Group();
  readonly start = new THREE.Vector3();
  readonly end = new THREE.Vector3();
  readonly length: number;
  private rungs: THREE.Mesh[] = [];

  constructor(
    readonly footTile: number,
    readonly topTile: number,
    colorHex: number,
  ) {
    this.start.copy(tileSurface(footTile));
    this.end.copy(tileSurface(topTile));
    const flat = this.start.distanceTo(this.end);
    this.start.y = TILE_TOP + 0.12;
    this.end.y = TILE_TOP + 0.12 + Math.min(1.1, flat * 0.1);
    this.length = this.start.distanceTo(this.end);

    const railMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 });
    const rungGeo = new THREE.BoxGeometry(0.56, 0.05, 0.07);
    const root = new THREE.Group();
    root.position.copy(this.start);
    root.lookAt(this.end);
    this.group.add(root);

    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, this.length), railMat);
      rail.position.set(s * 0.27, 0, this.length / 2);
      rail.castShadow = true;
      root.add(rail);
    }
    const step = 0.4;
    const count = Math.max(3, Math.floor(this.length / step));
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xf3d9a4,
        roughness: 0.6,
        emissive: 0xffc107,
        emissiveIntensity: 0,
      });
      const rung = new THREE.Mesh(rungGeo, mat);
      rung.position.set(0, 0.01, (i + 0.5) * (this.length / count));
      rung.castShadow = true;
      root.add(rung);
      this.rungs.push(rung);
    }

    // kaki penyangga agar tangga tidak melayang
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 });
    const legs = Math.max(1, Math.round(this.length / 3));
    for (let i = 1; i <= legs; i++) {
      const f = i / legs;
      const y = THREE.MathUtils.lerp(this.start.y, this.end.y, f);
      const h = y - TILE_TOP - 0.04;
      if (h < 0.1) continue;
      const p = new THREE.Vector3().lerpVectors(this.start, this.end, f);
      const side = new THREE.Vector3().subVectors(this.end, this.start).setY(0).normalize();
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 8), legMat);
        leg.position.set(p.x + -side.z * s * 0.27, TILE_TOP + h / 2, p.z + side.x * s * 0.27);
        leg.castShadow = true;
        this.group.add(leg);
      }
    }
  }

  /** Titik pijakan pion; t=0 kaki, t=1 ujung. */
  pointAt(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.lerpVectors(this.start, this.end, THREE.MathUtils.clamp(t, 0, 1));
    out.y += 0.06;
    return out;
  }

  /** Anak tangga menyala berurutan dari bawah ke atas. */
  light(duration: number): void {
    const per = duration / this.rungs.length;
    this.rungs.forEach((rung, i) => {
      const m = rung.material as THREE.MeshStandardMaterial;
      gsap.timeline({ delay: i * per })
        .to(m, { emissiveIntensity: 2.6, duration: 0.12 })
        .to(m, { emissiveIntensity: 0, duration: 0.7, ease: 'power2.in' }, '+=0.25');
    });
  }
}
