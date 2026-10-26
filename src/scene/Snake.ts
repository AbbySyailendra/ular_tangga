import * as THREE from 'three';
import gsap from 'gsap';
import { TILE_TOP, tileToWorld } from './coords';

export const SNAKE_COLORS = [0x2ecc71, 0xe67e22, 0x9b59b6, 0xe74c3c, 0x1abc9c, 0xf1c40f, 0x3498db, 0xe84393];

const HEAD_RADIUS = 0.17;
const TAIL_RADIUS = 0.045;
const radiusAt = (t: number) => THREE.MathUtils.lerp(HEAD_RADIUS, TAIL_RADIUS, Math.pow(t, 0.8));

/** Ular: CatmullRomCurve3 + TubeGeometry meruncing, kepala terpisah (mulut & lidah beranimasi). */
export class Snake {
  readonly group = new THREE.Group();
  readonly curve: THREE.CatmullRomCurve3;
  private head = new THREE.Group();
  private jaw: THREE.Mesh;
  private tongue: THREE.Mesh;
  private headBase = new THREE.Vector3();
  private headDir = new THREE.Vector3();
  private baseYaw = 0;
  private flick = 0;
  private lunge = 0;

  constructor(
    readonly headTile: number,
    readonly tailTile: number,
    colorHex: number,
  ) {
    const a = tileToWorld(headTile);
    const b = tileToWorld(tailTile);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);

    const waves = Math.max(1.5, Math.round(len / 3.2) + 0.5);
    const amp = Math.min(0.75, 0.3 + len * 0.04);
    const sign = headTile % 2 ? 1 : -1;
    const N = Math.max(8, Math.round(len * 1.6));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const lateral = Math.sin(t * Math.PI * waves * 2) * amp * Math.sin(Math.PI * t) ** 0.6 * sign;
      const r = radiusAt(t);
      pts.push(
        new THREE.Vector3(
          a.x + dir.x * len * t + side.x * lateral,
          TILE_TOP + r + Math.sin(t * Math.PI) * 0.05,
          a.z + dir.z * len * t + side.z * lateral,
        ),
      );
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);

    // tubuh meruncing + pita warna belang
    const tubular = Math.round(len * 14);
    const radial = 12;
    const geo = new THREE.TubeGeometry(this.curve, tubular, HEAD_RADIUS, radial, false);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(colorHex);
    const stripe = base.clone().offsetHSL(0.02, -0.1, 0.22);
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      const t = i / tubular;
      const scale = radiusAt(t) / HEAD_RADIUS;
      this.curve.getPointAt(t, c);
      const col = Math.floor(i / 5) % 2 === 0 ? base : stripe;
      for (let j = 0; j <= radial; j++) {
        const idx = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(scale).add(c);
        pos.setXYZ(idx, v.x, v.y, v.z);
        colors.set([col.r, col.g, col.b], idx * 3);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // kepala
    const skin = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), skin);
    upper.scale.set(1.0, 0.8, 1.25);
    upper.position.set(0, 0.03, 0.05);
    upper.castShadow = true;
    this.head.add(upper);

    this.jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 10),
      new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, 0, 0.15), roughness: 0.5 }),
    );
    this.jaw.scale.set(0.95, 0.4, 1.15);
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.02, -0.08);
    this.jaw.position.set(0, -0.06, 0.14);
    jawPivot.add(this.jaw);
    jawPivot.name = 'jaw';
    this.head.add(jawPivot);

    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
      );
      eye.position.set(s * 0.11, 0.12, 0.13);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      pupil.position.set(0, 0, 0.055);
      eye.add(pupil);
      this.head.add(eye);
    }

    // lidah bercabang
    this.tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.012, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff2d55, roughness: 0.4 }),
    );
    this.tongue.position.set(0, -0.015, 0.4);
    for (const s of [-1, 1]) {
      const fork = new THREE.Mesh(this.tongue.geometry, this.tongue.material);
      fork.scale.set(0.8, 1, 0.35);
      fork.position.set(s * 0.03, 0, 0.19);
      fork.rotation.y = s * 0.5;
      this.tongue.add(fork);
    }
    this.head.add(this.tongue);
    this.tongue.scale.z = 0.05;

    // posisi & arah kepala (menghadap berlawanan dengan tubuh)
    this.curve.getPointAt(0, this.headBase);
    this.headBase.y = TILE_TOP + 0.2;
    const tangent = this.curve.getTangentAt(0).setY(0).normalize();
    this.headDir.copy(tangent).negate();
    this.head.position.copy(this.headBase);
    this.baseYaw = Math.atan2(this.headDir.x, this.headDir.z);
    this.head.rotation.set(0, this.baseYaw, 0);
    this.group.add(this.head);
  }

  /** Titik di punggung ular; t=0 kepala, t=1 ekor. Dipakai pion yang meluncur. */
  pointOnBody(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    this.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), out);
    out.y += radiusAt(t) * 0.9;
    return out;
  }

  /** Kepala membuka mulut & menerjang. */
  bite(): Promise<void> {
    return new Promise((resolve) => {
      const jaw = this.head.getObjectByName('jaw')!;
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(jaw.rotation, { x: 0.75, duration: 0.18, ease: 'power2.out' }, 0)
        .to(this, { lunge: 1, duration: 0.2, ease: 'power3.in' }, 0)
        .to(this, { flick: 1, duration: 0.2 }, 0)
        .to(jaw.rotation, { x: 0, duration: 0.12, ease: 'power4.in' }, 0.45)
        .to(this, { lunge: 0, duration: 0.45, ease: 'power2.out' }, 0.5)
        .to(this, { flick: 0, duration: 0.2 }, 0.5);
    });
  }

  update(_dt: number, time: number): void {
    const sway = Math.sin(time * 1.7 + this.headTile) * 0.08;
    this.head.position.copy(this.headBase).addScaledVector(this.headDir, this.lunge * 0.4);
    this.head.position.y = this.headBase.y + Math.sin(time * 2.3 + this.headTile) * 0.015 + this.lunge * 0.04;
    this.head.rotation.y = this.baseYaw + sway;
    // lidah keluar-masuk
    const idleFlick = Math.max(0, Math.sin(time * 3 + this.headTile * 2)) ** 6;
    this.tongue.scale.z = 0.05 + Math.max(this.flick, idleFlick) * 0.95;
  }
}
