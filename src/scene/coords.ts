import * as THREE from 'three';
import { tileToGrid } from '../core/Rules';

export const TILE_SIZE = 1;
/** tinggi permukaan petak */
export const TILE_TOP = 0.2;
/** pusat area start (di kiri petak 1) */
export const START_CENTER = new THREE.Vector3(-6.25, 0, 4.5);

export function tileToWorld(n: number, tileSize = TILE_SIZE): THREE.Vector3 {
  if (n <= 0) return startToWorld(0);
  const { row, col } = tileToGrid(n);
  return new THREE.Vector3((col - 4.5) * tileSize, 0, -(row - 4.5) * tileSize);
}

/** Area start (petak 0); slot 0..3 membuat pion tidak bertumpuk. */
export function startToWorld(slot: number): THREE.Vector3 {
  return new THREE.Vector3(START_CENTER.x + (slot % 2 ? 0.25 : -0.25), 0, START_CENTER.z + (slot - 1.5) * 0.55);
}

/** titik di permukaan petak (tempat pion berdiri) */
export function tileSurface(n: number): THREE.Vector3 {
  const p = tileToWorld(n);
  p.y = n <= 0 ? 0.1 : TILE_TOP;
  return p;
}
