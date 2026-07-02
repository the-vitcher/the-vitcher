// The Clash battleground: the outdoor MOBA world, built at the battleground's
// instance origin instead of a KayKit dungeon interior. Everything here derives
// from the SAME sim data the colliders and minimap read (sim/moba.ts:
// mobaSurfaceAt, MOBA_JUNGLE_TREES, MOBA_MAP), so what you see is what you
// collide with. Procedural-everything: a painted ground canvas (grass field,
// dirt lanes, riverbed, stone base plazas), a translucent river strip on the
// anti-diagonal, instanced stylized trees for the jungle and the perimeter
// forest, low border walls matching the collider OBBs, and team-colored base
// pads. Towers, cores, minions, creeps, and shopkeepers are ENTITIES — the
// normal entity-view path renders them.
import * as THREE from 'three';
import {
  MOBA_MAP, MOBA_JUNGLE_TREES, mobaSurfaceAt, mobaHeroSpawn, type MobaTeam,
} from '../sim/moba';
import { surfaceMat } from './gfx';
import { barkTexture, foliageTexture, stoneTexture, waterNormalish } from './textures';

export interface ClashWorldView {
  group: THREE.Group;
}

// Deterministic tiny PRNG for cosmetic jitter (render-side only; the sim never
// reads this). Seeded constant so every client paints the identical world.
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paint the whole map top-down into a canvas: the ground albedo. The minimap
// paints the same classifier at a smaller size (src/ui/clash_map.ts), so the
// world and the map can never disagree.
function paintGroundCanvas(sizePx: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry(0xc1a5);
  const half = MOBA_MAP.half;
  const img = ctx.createImageData(sizePx, sizePx);
  const d = img.data;
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      // canvas +y (down) maps to world -z so north (+z) is up in texture space
      const wx = (px / (sizePx - 1)) * 2 * half - half;
      const wz = half - (py / (sizePx - 1)) * 2 * half;
      const s = mobaSurfaceAt(wx, wz);
      const n = rnd() * 0.16 - 0.08; // per-pixel grain
      let r: number, g: number, b: number;
      if (s === 'lane') { r = 0.55; g = 0.46; b = 0.32; } // packed dirt road
      else if (s === 'river') { r = 0.16; g = 0.32; b = 0.38; } // wet riverbed
      else if (s === 'base') {
        const teamA = wx + wz < 0;
        r = teamA ? 0.30 : 0.40; g = 0.32; b = teamA ? 0.42 : 0.30; // tinted stone plazas
      } else { r = 0.22; g = 0.40; b = 0.20; } // grass field
      const i = (py * sizePx + px) * 4;
      d[i] = Math.max(0, Math.min(255, (r + n * r) * 255));
      d[i + 1] = Math.max(0, Math.min(255, (g + n * g) * 255));
      d[i + 2] = Math.max(0, Math.min(255, (b + n * b) * 255));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// A stylized instanced tree: bark cylinder + two foliage cones. Reads as a
// dense pine forest without any GLB coupling; the trunk circle matches the
// collider radius from MOBA_JUNGLE_TREES.
function buildTrees(positions: { x: number; z: number }[], ox: number, oz: number, scaleJitter: () => number): THREE.Group {
  const group = new THREE.Group();
  if (positions.length === 0) return group;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6);
  trunkGeo.translate(0, 1.6, 0);
  const lowGeo = new THREE.ConeGeometry(2.6, 4.4, 7);
  lowGeo.translate(0, 4.4, 0);
  const topGeo = new THREE.ConeGeometry(1.7, 3.4, 7);
  topGeo.translate(0, 7.0, 0);
  // no color tint: surfaceMat multiplies color into the map, and the bark and
  // foliage canvases already carry their full palette (a tint reads as black)
  const trunkMat = surfaceMat({ map: barkTexture(), roughness: 0.95 });
  const leafMat = surfaceMat({ map: foliageTexture(), roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const lows = new THREE.InstancedMesh(lowGeo, leafMat, positions.length);
  const tops = new THREE.InstancedMesh(topGeo, leafMat, positions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const s = 0.85 + scaleJitter() * 0.5;
    q.setFromAxisAngle(up, scaleJitter() * Math.PI * 2);
    m.compose(new THREE.Vector3(ox + p.x, 0, oz + p.z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);
    lows.setMatrixAt(i, m);
    tops.setMatrixAt(i, m);
  }
  for (const mesh of [trunks, lows, tops]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function buildClashWorld(ox: number, oz: number, lowGfx: boolean): ClashWorldView {
  const group = new THREE.Group();
  const half = MOBA_MAP.half;
  const rnd = mulberry(0x50a7);

  // Skirt: a dark ground apron far past the borders so the horizon never reads
  // as void against the outdoor fog.
  const skirtMat = surfaceMat({ color: 0x16240f, roughness: 1 });
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), skirtMat);
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.set(ox, -0.25, oz);
  skirt.receiveShadow = true;
  group.add(skirt);

  // Ground: the painted map canvas.
  const groundTex = new THREE.CanvasTexture(paintGroundCanvas(lowGfx ? 512 : 1024));
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 4;
  const groundMat = surfaceMat({ map: groundTex, roughness: 0.96 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 4, half * 2 + 4), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ox, -0.02, oz);
  ground.receiveShadow = true;
  group.add(ground);

  // River: a translucent water strip along the NW->SE anti-diagonal, floating
  // just above the painted riverbed. Cosmetic only (no swim at the flat band).
  const riverMat = new THREE.MeshPhongMaterial({
    color: 0x2b6b7e,
    transparent: true,
    opacity: 0.62,
    shininess: 90,
    normalMap: waterNormalish(),
    depthWrite: false,
  });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 * Math.SQRT2, MOBA_MAP.riverBand * 1.35), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.rotation.z = -Math.PI / 4; // along the anti-diagonal
  river.position.set(ox, 0.06, oz);
  group.add(river);

  // Border walls: low stone ramparts matching the collider OBBs (sim
  // colliders.ts clashColliders — edge at half - 0.5, hd 1).
  // Low ramparts: the fountains sit in the map corners with the chase camera
  // often outside the square, so the walls must be short enough to see over
  // (the perimeter forest, not the wall, sells the boundary).
  const wallMat = surfaceMat({ map: stoneTexture(), roughness: 0.9 });
  const edge = half - 0.5;
  const mkWall = (w: number, d: number, x: number, z: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), wallMat);
    wall.position.set(ox + x, 0.7, oz + z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  };
  mkWall(half * 2 + 4, 2, 0, edge);
  mkWall(half * 2 + 4, 2, 0, -edge);
  mkWall(2, half * 2 + 4, edge, 0);
  mkWall(2, half * 2 + 4, -edge, 0);

  // Base pads: a raised stone disc under each fountain, tinted per team.
  for (const team of ['A', 'B'] as MobaTeam[]) {
    const f = mobaHeroSpawn(team);
    const padMat = surfaceMat({ color: team === 'A' ? 0x8ba0e8 : 0xe89a8b, map: stoneTexture(), roughness: 0.85 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 0.5, 24), padMat);
    pad.position.set(ox + f.x, 0.25, oz + f.z);
    pad.receiveShadow = true;
    group.add(pad);
    // a simple banner post so the base reads from across the map
    const postMat = surfaceMat({ color: 0x4a3a26, roughness: 0.9 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), postMat);
    post.position.set(ox + f.x + 2.4, 3.5, oz + f.z + 2.4);
    post.castShadow = true;
    group.add(post);
    const flagMat = surfaceMat({ color: team === 'A' ? 0x4a6cff : 0xff5a4a, roughness: 0.8, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), flagMat);
    flag.position.set(ox + f.x + 3.5, 6.1, oz + f.z + 2.4);
    group.add(flag);
  }

  // Jungle trees (the SAME list the colliders block on) + a perimeter forest
  // ring outside the walls for a horizon.
  group.add(buildTrees([...MOBA_JUNGLE_TREES], ox, oz, rnd));
  const ring: { x: number; z: number }[] = [];
  const ringCount = lowGfx ? 90 : 170;
  for (let i = 0; i < ringCount; i++) {
    const ang = (i / ringCount) * Math.PI * 2;
    const r = half + 6 + rnd() * 22;
    ring.push({ x: Math.sin(ang) * r, z: Math.cos(ang) * r });
  }
  group.add(buildTrees(ring, ox, oz, rnd));

  return { group };
}
