import * as THREE from 'three';
import { CHARACTERS } from '../config';
import { Character } from '../scene/Character';

/** Pratinjau 3D karakter berputar (renderer kecil terpisah) untuk layar pilih karakter. */
export class CharacterPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  private current: Character | null = null;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;

  constructor() {
    this.canvas.className = 'preview-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setSize(280, 280, false);
    this.camera.position.set(0, 1.0, 3.6);
    this.camera.lookAt(0, 0.5, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b8d0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
  }

  setCharacter(id: string): void {
    if (this.current) {
      this.scene.remove(this.current.root);
      this.current.dispose();
    }
    const def = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
    const ch = new Character(def, '', 0xffffff);
    ch.label.visible = false;
    ch.root.scale.setScalar(1.5);
    ch.setPose('cheer');
    this.scene.add(ch.root);
    this.current = ch;
    window.setTimeout(() => {
      if (this.current === ch) ch.setPose('idle');
    }, 900);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.time += dt;
      if (this.current) {
        this.current.root.rotation.y += dt * 0.9;
        this.current.update(dt, this.time);
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
