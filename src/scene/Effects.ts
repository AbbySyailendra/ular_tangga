import * as THREE from 'three';

const CONFETTI_MAX = 700;
const SPARK_MAX = 2600;
const CONFETTI_COLORS = [0xff4d6d, 0xffd23f, 0x4dabf7, 0x69db7c, 0xb197fc, 0xff922b, 0xffffff];

/** Confetti (InstancedMesh) + percikan/kembang api (Points aditif), semuanya dari satu pool. */
export class Effects {
  readonly group = new THREE.Group();

  private confetti: THREE.InstancedMesh;
  private cPos = new Float32Array(CONFETTI_MAX * 3);
  private cVel = new Float32Array(CONFETTI_MAX * 3);
  private cRot = new Float32Array(CONFETTI_MAX * 3);
  private cSpin = new Float32Array(CONFETTI_MAX * 3);
  private cLife = new Float32Array(CONFETTI_MAX);
  private cNext = 0;

  private sparks: THREE.Points;
  private sPos: Float32Array;
  private sCol: Float32Array;
  private sBase = new Float32Array(SPARK_MAX * 3);
  private sVel = new Float32Array(SPARK_MAX * 3);
  private sLife = new Float32Array(SPARK_MAX);
  private sMax = new Float32Array(SPARK_MAX);
  private sGravity = new Float32Array(SPARK_MAX);
  private sNext = 0;

  private dummy = new THREE.Object3D();
  /** > 0 selama masih ada partikel hidup; saat 0 update & upload buffer dilewati */
  private activeUntil = 0;
  private clock = 0;
  private color = new THREE.Color();

  constructor() {
    const geo = new THREE.PlaneGeometry(0.12, 0.2);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.confetti = new THREE.InstancedMesh(geo, mat, CONFETTI_MAX);
    this.confetti.frustumCulled = false;
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < CONFETTI_MAX; i++) {
      this.confetti.setMatrixAt(i, this.dummy.matrix);
      this.confetti.setColorAt(i, this.color.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
    }
    this.group.add(this.confetti);

    const sg = new THREE.BufferGeometry();
    this.sPos = new Float32Array(SPARK_MAX * 3);
    this.sCol = new Float32Array(SPARK_MAX * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 0.16,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    this.sPos.fill(9999);
  }

  /** Confetti meledak dari titik `p` (naik tangga, menang). */
  private wake(seconds: number): void {
    this.activeUntil = Math.max(this.activeUntil, this.clock + seconds);
  }

  burstConfetti(p: THREE.Vector3, count = 90, power = 3.2): void {
    this.wake(4.5);
    for (let n = 0; n < count; n++) {
      const i = this.cNext++ % CONFETTI_MAX;
      const a = Math.random() * Math.PI * 2;
      const up = 0.5 + Math.random();
      const sp = (0.4 + Math.random()) * power;
      this.cPos.set([p.x, p.y + 0.3, p.z], i * 3);
      this.cVel.set([Math.cos(a) * sp * 0.6, up * sp * 1.1, Math.sin(a) * sp * 0.6], i * 3);
      this.cRot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.cSpin.set([(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16], i * 3);
      this.cLife[i] = 2.2 + Math.random() * 1.6;
    }
  }

  /** Hujan confetti dari atas (layar menang). */
  rainConfetti(center: THREE.Vector3, count = 60): void {
    this.wake(7);
    for (let n = 0; n < count; n++) {
      const i = this.cNext++ % CONFETTI_MAX;
      this.cPos.set([center.x + (Math.random() - 0.5) * 9, center.y + 5 + Math.random() * 2, center.z + (Math.random() - 0.5) * 7], i * 3);
      this.cVel.set([(Math.random() - 0.5) * 0.8, -0.3 - Math.random() * 0.8, (Math.random() - 0.5) * 0.8], i * 3);
      this.cRot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.cSpin.set([(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10], i * 3);
      this.cLife[i] = 4 + Math.random() * 2;
    }
  }

  /** Bintang/kilau kecil (pion mendarat). */
  sparkle(p: THREE.Vector3, color = 0xfff1a8, count = 10): void {
    this.wake(1.2);
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 0.9;
      this.spawnSpark(p.x, p.y + 0.15, p.z, Math.cos(a) * sp, 1 + Math.random() * 1.2, Math.sin(a) * sp, color, 0.5 + Math.random() * 0.3, 2.5);
    }
  }

  /** Kembang api: ledakan bola di titik `p`. */
  firework(p: THREE.Vector3, color?: number): void {
    this.wake(2.2);
    const hue = Math.random();
    const base = color ?? new THREE.Color().setHSL(hue, 1, 0.6).getHex();
    const alt = new THREE.Color().setHSL((hue + 0.12) % 1, 1, 0.65).getHex();
    const count = 90;
    for (let n = 0; n < count; n++) {
      // titik acak seragam di permukaan bola
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = 3 + Math.random() * 1.6;
      this.spawnSpark(p.x, p.y, p.z, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp, n % 3 ? base : alt, 1.1 + Math.random() * 0.7, 3.2);
    }
  }

  private spawnSpark(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, gravity: number): void {
    const i = this.sNext++ % SPARK_MAX;
    this.sPos.set([x, y, z], i * 3);
    this.sVel.set([vx, vy, vz], i * 3);
    this.color.setHex(color);
    this.sBase.set([this.color.r, this.color.g, this.color.b], i * 3);
    this.sLife[i] = life;
    this.sMax[i] = life;
    this.sGravity[i] = gravity;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.clock += dt;
    if (this.clock > this.activeUntil) return;
    // confetti
    const d = this.dummy;
    for (let i = 0; i < CONFETTI_MAX; i++) {
      if (this.cLife[i] <= 0) continue;
      this.cLife[i] -= dt;
      const k = i * 3;
      if (this.cLife[i] <= 0) {
        d.scale.setScalar(0);
      } else {
        // gravitasi ringan + hambatan udara (melayang pelan)
        this.cVel[k + 1] -= 6 * dt;
        const drag = Math.exp(-1.6 * dt);
        this.cVel[k] *= drag;
        this.cVel[k + 2] *= drag;
        if (this.cVel[k + 1] < -1.4) this.cVel[k + 1] = -1.4;
        for (let a = 0; a < 3; a++) {
          this.cPos[k + a] += this.cVel[k + a] * dt;
          this.cRot[k + a] += this.cSpin[k + a] * dt;
        }
        d.position.set(this.cPos[k], this.cPos[k + 1], this.cPos[k + 2]);
        d.rotation.set(this.cRot[k], this.cRot[k + 1], this.cRot[k + 2]);
        d.scale.setScalar(Math.min(1, this.cLife[i] * 2));
        if (this.cPos[k + 1] < 0.22 && this.cVel[k + 1] < 0) {
          // mendarat di papan: berhenti & memudar
          this.cVel[k] = this.cVel[k + 1] = this.cVel[k + 2] = 0;
          this.cSpin[k] = this.cSpin[k + 1] = this.cSpin[k + 2] = 0;
          this.cPos[k + 1] = 0.22;
        }
      }
      d.updateMatrix();
      this.confetti.setMatrixAt(i, d.matrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;

    // percikan
    for (let i = 0; i < SPARK_MAX; i++) {
      if (this.sLife[i] <= 0) continue;
      this.sLife[i] -= dt;
      const k = i * 3;
      if (this.sLife[i] <= 0) {
        this.sPos[k + 1] = 9999;
        this.sCol[k] = this.sCol[k + 1] = this.sCol[k + 2] = 0;
        continue;
      }
      this.sVel[k + 1] -= this.sGravity[i] * dt;
      const drag = Math.exp(-1.1 * dt);
      this.sVel[k] *= drag;
      this.sVel[k + 2] *= drag;
      this.sPos[k] += this.sVel[k] * dt;
      this.sPos[k + 1] += this.sVel[k + 1] * dt;
      this.sPos[k + 2] += this.sVel[k + 2] * dt;
      const f = this.sLife[i] / this.sMax[i];
      this.sCol[k] = this.sBase[k] * f;
      this.sCol[k + 1] = this.sBase[k + 1] * f;
      this.sCol[k + 2] = this.sBase[k + 2] * f;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;
  }

  clear(): void {
    this.activeUntil = this.clock + 0.05;
    this.cLife.fill(0);
    this.sLife.fill(0);
    this.sPos.fill(9999);
    this.sCol.fill(0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < CONFETTI_MAX; i++) this.confetti.setMatrixAt(i, this.dummy.matrix);
    this.confetti.instanceMatrix.needsUpdate = true;
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;
  }
}
