import * as THREE from 'three';

const BALLOON_COLORS = [0xff4d6d, 0xffd23f, 0x4dabf7, 0x69db7c, 0xb197fc, 0xff922b];

/** Skybox gradien, pulau melayang, pohon low-poly, awan, balon, bendera segitiga, lampu hias berkedip. */
export class Environment {
  readonly group = new THREE.Group();
  readonly sky: THREE.Mesh;
  private clouds: THREE.Group[] = [];
  private balloons: { g: THREE.Group; base: number; phase: number }[] = [];
  private bulbs: THREE.InstancedMesh;
  private bulbCount: number;
  private color = new THREE.Color();
  private flags: THREE.Object3D[] = [];
  private bulbClock = 0;

  constructor() {
    // ── langit (gradien) ──
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(0x3d9bff) },
          mid: { value: new THREE.Color(0xbfe6ff) },
          bottom: { value: new THREE.Color(0xa9dcff) },
        },
        vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying float vY;' +
          'void main(){ vec3 c = vY > 0.0 ? mix(mid, top, pow(vY, 0.6)) : mix(mid, bottom, clamp(-vY * 2.0, 0.0, 1.0));' +
          'gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
      }),
    );
    this.sky.renderOrder = -1;
    this.group.add(this.sky);

    this.buildIsland();
    this.buildTrees();
    this.buildClouds();
    this.buildBalloons();
    this.buildBunting();

    // ── lampu hias di sekeliling panggung ──
    const pts: THREE.Vector3[] = [];
    const half = 5.62;
    const perSide = 12;
    for (let i = 0; i < perSide; i++) {
      const f = -half + (i / perSide) * 2 * half;
      pts.push(new THREE.Vector3(f, 0.0, half), new THREE.Vector3(half, 0.0, -f), new THREE.Vector3(-f, 0.0, -half), new THREE.Vector3(-half, 0.0, f));
    }
    this.bulbCount = pts.length;
    this.bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      this.bulbCount,
    );
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => {
      m.setPosition(p.x, -0.2, p.z);
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, this.color.setHex(0xffffff));
    });
    this.group.add(this.bulbs);
  }

  private buildIsland(): void {
    const dirt = new THREE.Mesh(
      new THREE.CylinderGeometry(9.4, 2.2, 6, 14, 1),
      new THREE.MeshStandardMaterial({ color: 0x8d6a4b, flatShading: true, roughness: 0.95 }),
    );
    dirt.position.y = -3.35;
    dirt.castShadow = true;
    dirt.receiveShadow = true;
    this.group.add(dirt);

    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(9.5, 9.4, 0.55, 14),
      new THREE.MeshStandardMaterial({ color: 0x6cc24a, flatShading: true, roughness: 0.9 }),
    );
    grass.position.y = -0.58;
    grass.receiveShadow = true;
    this.group.add(grass);

    // batu melayang kecil di bawah pulau
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9c8468, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + Math.random() * 0.5, 0), rockMat);
      const a = (i / 5) * Math.PI * 2 + 0.5;
      r.position.set(Math.cos(a) * (3 + Math.random()), -7.5 - Math.random() * 2, Math.sin(a) * (3 + Math.random()));
      this.group.add(r);
    }
  }

  private buildTrees(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.7, 6);
    const leafGeo = new THREE.ConeGeometry(0.55, 1.1, 7);
    const spots: { x: number; z: number; s: number }[] = [];
    const startPad = new THREE.Vector2(-6.25, 4.5);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (i % 2) * 0.1;
      const r = 8.1 + (i % 3) * 0.35;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (new THREE.Vector2(x, z).distanceTo(startPad) < 1.7) continue;
      // jaga sisi depan tetap terbuka agar papan terlihat jelas
      if (z > 6.2 && Math.abs(x) < 6) continue;
      spots.push({ x, z, s: 0.8 + ((i * 37) % 10) / 20 });
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7b5233 }), spots.length);
    const leaves1 = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2fa84f, flatShading: true }), spots.length);
    const leaves2 = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x3cc45f, flatShading: true }), spots.length);
    const o = new THREE.Object3D();
    spots.forEach((p, i) => {
      o.rotation.y = i;
      o.scale.setScalar(p.s);
      o.position.set(p.x, -0.3 + 0.35 * p.s, p.z);
      o.updateMatrix();
      trunks.setMatrixAt(i, o.matrix);
      o.position.set(p.x, -0.3 + 1.0 * p.s, p.z);
      o.updateMatrix();
      leaves1.setMatrixAt(i, o.matrix);
      o.position.set(p.x, -0.3 + 1.55 * p.s, p.z);
      o.scale.setScalar(p.s * 0.75);
      o.updateMatrix();
      leaves2.setMatrixAt(i, o.matrix);
    });
    for (const im of [trunks, leaves1, leaves2]) {
      im.castShadow = true;
      this.group.add(im);
    }
  }

  private buildClouds(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const blobs = 3 + (i % 3);
      for (let b = 0; b < blobs; b++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + Math.random() * 0.7, 1), mat);
        m.position.set(b * 1.3 - blobs * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.8);
        m.scale.y = 0.7;
        g.add(m);
      }
      g.position.set(-40 + i * 11, 7 + (i % 4) * 2.2, -18 - (i % 3) * 9);
      g.scale.setScalar(1.2 + (i % 3) * 0.4);
      this.clouds.push(g);
      this.group.add(g);
    }
  }

  private buildBalloons(): void {
    const stringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    const spots: [number, number, number][] = [
      [-9, 3.5, -4], [9.5, 4, 1], [-8.5, 2.8, 6], [8, 3.2, 7.5], [-4, 4.8, -9], [5, 4.4, -9.5], [10.5, 5, -5], [-10.5, 4.5, 0],
    ];
    spots.forEach(([x, y, z], i) => {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 12),
        new THREE.MeshStandardMaterial({ color: BALLOON_COLORS[i % BALLOON_COLORS.length], roughness: 0.25 }),
      );
      ball.scale.y = 1.2;
      g.add(ball);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 6), ball.material);
      knot.position.y = -0.64;
      knot.rotation.x = Math.PI;
      g.add(knot);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.7, 0), new THREE.Vector3(0.05, -2.4, 0)]),
        stringMat,
      );
      g.add(line);
      g.position.set(x, y, z);
      this.balloons.push({ g, base: y, phase: i * 1.3 });
      this.group.add(g);
    });
  }

  private buildBunting(): void {
    // tali bendera segitiga antara 4 tiang di sudut panggung (sisi depan dibiarkan terbuka)
    const h = 2.3;
    const c = 5.9;
    const corners = [
      new THREE.Vector3(-c, h, -c),
      new THREE.Vector3(c, h, -c),
      new THREE.Vector3(c, h, c),
      new THREE.Vector3(-c, h, c),
    ];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
    corners.forEach((p, i) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h + 0.3, 8), poleMat);
      pole.position.set(p.x, h / 2 - 0.4, p.z);
      pole.castShadow = true;
      this.group.add(pole);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: BALLOON_COLORS[i] }));
      top.position.set(p.x, h + 0.12, p.z);
      this.group.add(top);
    });
    const tri = new THREE.Shape();
    tri.moveTo(-0.17, 0);
    tri.lineTo(0.17, 0);
    tri.lineTo(0, -0.38);
    const flagGeo = new THREE.ShapeGeometry(tri);
    const strands: [THREE.Vector3, THREE.Vector3][] = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[3], corners[0]],
    ];
    const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 });
    const count = strands.length * 14;
    const flags = new THREE.InstancedMesh(flagGeo, flagMat, count);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    let idx = 0;
    for (const [a, b] of strands) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        p.y -= Math.sin(t * Math.PI) * 0.55;
        pts.push(p);
      }
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff })));
      for (let i = 0; i < 14; i++) {
        const t = (i + 0.5) / 14;
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        p.y -= Math.sin(t * Math.PI) * 0.55;
        o.position.copy(p);
        o.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, 0);
        o.updateMatrix();
        flags.setMatrixAt(idx, o.matrix);
        flags.setColorAt(idx, col.setHex(BALLOON_COLORS[idx % BALLOON_COLORS.length]));
        idx++;
      }
    }
    flags.castShadow = true;
    this.flags.push(flags);
    this.group.add(flags);
  }

  update(_dt: number, time: number): void {
    // awan bergeser pelan, muncul lagi dari ujung
    for (const [i, c] of this.clouds.entries()) {
      c.position.x += 0.004 + (i % 3) * 0.002;
      if (c.position.x > 50) c.position.x = -50;
    }
    for (const b of this.balloons) {
      b.g.position.y = b.base + Math.sin(time * 0.9 + b.phase) * 0.35;
      b.g.rotation.z = Math.sin(time * 0.7 + b.phase) * 0.08;
    }
    // lampu berkedip mengikuti "beat" ~120 bpm (pola berjalan di sekeliling panggung)
    this.bulbClock += _dt;
    if (this.bulbClock < 0.1) return;
    this.bulbClock = 0;
    const beat = time * 2;
    const hue = [0xff4d6d, 0xffd23f, 0x4dabf7, 0x69db7c];
    for (let i = 0; i < this.bulbCount; i++) {
      const on = (Math.floor(beat) + i) % 4;
      const k = on === 0 ? 1 : 0.25;
      this.color.setHex(hue[i % 4]).multiplyScalar(k);
      this.bulbs.setColorAt(i, this.color);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}
