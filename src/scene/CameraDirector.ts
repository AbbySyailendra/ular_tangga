import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { settings } from '../utils/settings';

const HOME_TARGET = new THREE.Vector3(-0.7, 0, 0.3);
const HOME_DIR = new THREE.Vector3(0, 0.8, 0.62).normalize();

/** Kamera: sudut isometrik 3/4, mengikuti pion aktif, cut sinematik singkat, OrbitControls terbatas. */
export class CameraDirector {
  readonly controls: OrbitControls;
  private followPoint: THREE.Vector3 | null = null;
  private shotActive = false;
  private lastFit = 1;

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 60;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.12; // jangan masuk ke bawah papan
    this.controls.autoRotateSpeed = 0.7;
    this.resetView(false);
  }

  /** Jarak kamera yang membuat seluruh papan muat di layar (portrait lebih jauh). */
  private fitDistance(): number {
    const a = this.camera.aspect || 1.6;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const byWidth = 7.4 / (t * a);
    const byHeight = 5.4 / t;
    return Math.max(byWidth, byHeight);
  }

  resetView(animate = true): void {
    this.followPoint = null; // Stage kembali mengikuti pion di awal giliran berikutnya
    const dist = this.fitDistance();
    this.lastFit = dist;
    const pos = HOME_TARGET.clone().addScaledVector(HOME_DIR, dist);
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(HOME_TARGET);
      this.controls.update();
      return;
    }
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 0.9, ease: 'power2.inOut' });
    gsap.to(this.controls.target, { x: HOME_TARGET.x, y: HOME_TARGET.y, z: HOME_TARGET.z, duration: 0.9, ease: 'power2.inOut' });
  }

  /** Dipanggil saat ukuran layar berubah: pertahankan faktor zoom pemain. */
  onResize(): void {
    const fit = this.fitDistance();
    if (Math.abs(fit - this.lastFit) < 0.01) return;
    const ratio = fit / this.lastFit;
    this.lastFit = fit;
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(ratio);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  /** Sapuan pembuka: dari tinggi turun ke sudut utama. */
  intro(): Promise<void> {
    const dist = this.fitDistance();
    this.lastFit = dist;
    const end = HOME_TARGET.clone().addScaledVector(HOME_DIR, dist);
    if (settings.get('reducedMotion')) {
      this.resetView(false);
      return Promise.resolve();
    }
    const start = HOME_TARGET.clone().addScaledVector(new THREE.Vector3(-0.5, 1.1, 0.5).normalize(), dist * 1.35);
    this.camera.position.copy(start);
    this.controls.target.copy(HOME_TARGET);
    return new Promise((resolve) => {
      gsap.to(this.camera.position, { x: end.x, y: end.y, z: end.z, duration: 1.4, ease: 'power3.inOut', onComplete: resolve });
    });
  }

  /** Ikuti titik (pion aktif) dengan halus; null = berhenti mengikuti. */
  follow(p: THREE.Vector3 | null): void {
    this.followPoint = p;
  }

  attract(on: boolean): void {
    this.controls.autoRotate = on && !settings.get('reducedMotion');
  }

  /** Cut sinematik singkat (<= ~2 dtk) ke `point`, lalu kembali. Dilewati bila kurangi gerakan. */
  shot(point: THREE.Vector3, distance = 6.2, hold = 0.9): Promise<void> {
    if (settings.get('reducedMotion') || this.shotActive) return Promise.resolve();
    this.shotActive = true;
    const savedTarget = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(savedTarget);
    const dir = offset.clone().normalize();
    dir.y = Math.max(dir.y, 0.45);
    dir.normalize();
    const toPos = point.clone().addScaledVector(dir, distance);
    const backPos = savedTarget.clone().add(offset);
    this.controls.enabled = false;
    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.controls.enabled = true;
          this.shotActive = false;
          resolve();
        },
      });
      tl.to(this.camera.position, { x: toPos.x, y: toPos.y, z: toPos.z, duration: 0.55, ease: 'power2.inOut' }, 0)
        .to(this.controls.target, { x: point.x, y: point.y, z: point.z, duration: 0.55, ease: 'power2.inOut' }, 0)
        .to({}, { duration: hold })
        .to(this.camera.position, { x: backPos.x, y: backPos.y, z: backPos.z, duration: 0.6, ease: 'power2.inOut' })
        .to(this.controls.target, { x: savedTarget.x, y: savedTarget.y, z: savedTarget.z, duration: 0.6, ease: 'power2.inOut' }, '<');
    });
  }

  /** Pindah permanen ke titik `p` (podium kemenangan). */
  moveTo(p: THREE.Vector3, distance = 8.5): Promise<void> {
    this.followPoint = null;
    const dir = new THREE.Vector3(0, 0.55, 1).normalize();
    const pos = p.clone().addScaledVector(dir, distance);
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    return new Promise((resolve) => {
      gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 1.2, ease: 'power2.inOut', onComplete: resolve });
      gsap.to(this.controls.target, { x: p.x, y: p.y, z: p.z, duration: 1.2, ease: 'power2.inOut' });
    });
  }

  update(dt: number): void {
    if (this.followPoint && !this.shotActive) {
      // sebagian saja mengikuti pion agar papan tetap terlihat
      const desired = HOME_TARGET.clone().lerp(this.followPoint, 0.38);
      const k = 1 - Math.exp(-dt * 2.2);
      const delta = desired.sub(this.controls.target).multiplyScalar(k);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update();
  }
}
