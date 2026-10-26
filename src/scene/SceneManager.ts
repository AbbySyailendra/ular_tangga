import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { effectiveQuality, settings, type QualityTier } from '../utils/settings';

type Updater = (dt: number, time: number) => void;

/** batas pixel ratio per tingkat kualitas: fill-rate adalah beban GPU terbesar game ini */
const PIXEL_RATIO_CAP: Record<QualityTier, number> = { high: 1.5, medium: 1.25, low: 1 };
const MIN_PIXEL_RATIO = 0.75;
const TIERS: QualityTier[] = ['low', 'medium', 'high'];

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly scene = new THREE.Scene();
  /** semua objek dunia masuk ke grup ini supaya bisa diguncang (screen shake) */
  readonly world = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;

  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private updaters = new Set<Updater>();
  private lastTime = 0;
  private tier: QualityTier = 'high';
  private pixelRatio = 1;
  private shakeAmp = 0;
  private running = true;
  /** pengali waktu simulasi (0 saat pause) */
  timeScale = 1;
  private elapsed = 0;

  // pengatur performa otomatis (hanya saat kualitas = Otomatis)
  private govTime = 0;
  private govFrames = 0;
  private govGood = 0;
  private govWarmup = 2;

  constructor(canvas: HTMLCanvasElement, labelRoot: HTMLElement) {
    // MSAA bawaan kanvas tidak berlaku untuk composer, jadi dimatikan agar tidak boros
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.labelRenderer = new CSS2DRenderer({ element: labelRoot });
    labelRoot.style.position = 'fixed';
    labelRoot.style.inset = '0';
    labelRoot.style.pointerEvents = 'none';

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.scene.add(this.world);

    // Cahaya: matahari + hemisphere (langit/tanah)
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x9a8a5a, 1.1);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
    this.sun.position.set(-8, 14, 9);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 9;
    sc.bottom = -9;
    sc.near = 1;
    sc.far = 36;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);

    this.applyQuality(effectiveQuality());
    settings.subscribe((_s, k) => {
      if (k === 'quality') {
        this.govWarmup = 2;
        this.applyQuality(effectiveQuality());
      }
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Terapkan satu tingkat kualitas: high = bloom + bayangan 1024, medium = bayangan saja, low = polos. */
  private applyQuality(tier: QualityTier): void {
    const prevTier = this.tier;
    this.tier = tier;
    const shadows = tier !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    if (shadows) {
      const size = tier === 'high' ? 1024 : 512;
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
    }
    if (prevTier !== tier) {
      // material perlu dikompilasi ulang bila bayangan dinyalakan/dimatikan
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    this.pixelRatio = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP[tier]);
    if (tier === 'high') this.ensureComposer();
    else this.disposeComposer();
    this.resize();
  }

  private ensureComposer(): void {
    if (this.composer) return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom ringan: hanya benda dengan emissive > 1 (tangga menyala, petak 100, confetti) yang berpendar.
    // Dihitung pada setengah resolusi supaya murah.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  private disposeComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
      this.bloom?.resolution.set(w / 2, h / 2);
    }
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  addUpdater(fn: Updater): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  /** Guncangan layar ringan (diabaikan bila "kurangi gerakan" aktif). */
  shake(amplitude = 0.12): void {
    if (settings.get('reducedMotion')) return;
    this.shakeAmp = Math.max(this.shakeAmp, amplitude);
  }

  /**
   * Pengatur performa: bila rata-rata frame lambat, turunkan resolusi dulu (paling berpengaruh),
   * lalu matikan bloom/bayangan. Bila lancar lama, resolusi dinaikkan lagi pelan-pelan.
   */
  private govern(rawDt: number): void {
    if (settings.get('quality') !== 'auto' || document.hidden) return;
    if (this.govWarmup > 0) {
      this.govWarmup -= rawDt; // abaikan awal (kompilasi shader, ganti layar)
      return;
    }
    this.govTime += rawDt;
    this.govFrames++;
    if (this.govTime < 1.5) return;
    const avgMs = (this.govTime / this.govFrames) * 1000;
    this.govTime = 0;
    this.govFrames = 0;

    if (avgMs > 26) {
      this.govGood = 0;
      if (this.pixelRatio > MIN_PIXEL_RATIO + 0.01) {
        this.pixelRatio = Math.max(MIN_PIXEL_RATIO, this.pixelRatio - 0.25);
        this.resize();
      } else if (this.tier !== 'low') {
        this.applyQuality(TIERS[TIERS.indexOf(this.tier) - 1]);
        this.pixelRatio = Math.min(window.devicePixelRatio, 1);
        this.resize();
      }
      this.govWarmup = 1;
    } else if (avgMs < 15) {
      const cap = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP[this.tier]);
      if (++this.govGood >= 4 && this.pixelRatio < cap - 0.01) {
        this.pixelRatio = Math.min(cap, this.pixelRatio + 0.25);
        this.govGood = 0;
        this.resize();
      }
    } else {
      this.govGood = 0;
    }
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const raw = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      const dt = raw * this.timeScale;
      this.elapsed += dt;
      this.govern(raw);
      this.updaters.forEach((fn) => fn(dt, this.elapsed));

      if (this.shakeAmp > 0.001) {
        const a = this.shakeAmp;
        this.world.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
        this.shakeAmp *= Math.pow(0.001, raw * 1.6); // meluruh cepat
      } else if (this.world.position.lengthSq() > 0) {
        this.world.position.set(0, 0, 0);
      }

      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    };
    loop();
  }

  get isLow(): boolean {
    return this.tier === 'low';
  }

  /** Bloom diperkuat sesaat (mis. kembang api). */
  setBloomStrength(v: number): void {
    if (this.bloom) this.bloom.strength = v;
  }
}
