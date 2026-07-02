// The Clash battleground: the outdoor MOBA world, built at the battleground's
// instance origin instead of a KayKit dungeon interior. Everything here derives
// from the SAME sim data the colliders and minimap read (sim/moba.ts:
// mobaHeightAt, mobaSurfaceAt, MOBA_WALL_SEGMENTS, MOBA_JUNGLE_TREES, ...), so
// what you see is what you collide with. The ground is a displaced grid mesh
// riding the sim heightfield (plateaus, sunken river, boss pit); the painted
// albedo shades cliffs by slope and depth; walls, bridge rails, pit stones,
// and trees dress the same authored data. Towers, cores, minions, creeps, and
// shopkeepers are ENTITIES - the normal entity-view path renders them.
import * as THREE from 'three';
import {
  MOBA_MAP, MOBA_JUNGLE_TREES, MOBA_WALL_SEGMENTS, MOBA_BOSS_PIT, MOBA_RIVER,
  mobaSurfaceAt, mobaHeightAt, mobaHeroSpawn, mobaLanePath, type MobaTeam,
} from '../sim/moba';
import { surfaceMat } from './gfx';
import { barkTexture, foliageTexture, plankTexture, stoneTexture, waterNormalish } from './textures';

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

// Paint the whole map top-down into a canvas: the ground albedo. Surface
// classes come from the shared classifier; cliffs (steep heightfield slopes)
// shade to rock and depth tints the riverbed/pit so elevation reads at a
// glance. The minimap paints the same classifier (src/ui/clash_map.ts).
function paintGroundCanvas(sizePx: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry(0xc1a5);
  const half = MOBA_MAP.half;
  const span = half * 2;
  // one height sample per pixel, reused for slope + depth shading
  const heights = new Float32Array(sizePx * sizePx);
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      const wx = (px / (sizePx - 1)) * span - half;
      const wz = half - (py / (sizePx - 1)) * span;
      heights[py * sizePx + px] = mobaHeightAt(wx, wz);
    }
  }
  const img = ctx.createImageData(sizePx, sizePx);
  const d = img.data;
  const pxYards = span / (sizePx - 1);
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      // canvas +y (down) maps to world -z so north (+z) is up in texture space
      const wx = (px / (sizePx - 1)) * span - half;
      const wz = half - (py / (sizePx - 1)) * span;
      const i = py * sizePx + px;
      const h = heights[i];
      const hx = heights[py * sizePx + Math.min(sizePx - 1, px + 1)];
      const hy = heights[Math.min(sizePx - 1, py + 1) * sizePx + px];
      const slope = Math.max(Math.abs(hx - h), Math.abs(hy - h)) / pxYards;
      const s = mobaSurfaceAt(wx, wz);
      const n = rnd() * 0.16 - 0.08; // per-pixel grain
      let r: number, g: number, b: number;
      if (slope > 1.2) { r = 0.42; g = 0.39; b = 0.35; } // cliff faces read as bare rock
      else if (s === 'lane') { r = 0.55; g = 0.46; b = 0.32; } // packed dirt road
      else if (s === 'ford') { r = 0.58; g = 0.52; b = 0.38; } // sandy shallows
      else if (s === 'river') { r = 0.16; g = 0.32; b = 0.38; } // wet riverbed
      else if (s === 'pit') { r = 0.24; g = 0.20; b = 0.18; } // scorched boss bowl
      else if (s === 'base') {
        const teamA = wx + wz < 0;
        r = teamA ? 0.30 : 0.40; g = 0.32; b = teamA ? 0.42 : 0.30; // tinted stone plazas
      } else { r = 0.22; g = 0.40; b = 0.20; } // grass field
      // height tint: plateaus catch more sun, depressions sit in shadow
      const lift = 1 + Math.max(-0.3, Math.min(0.22, h * 0.09));
      r *= lift; g *= lift; b *= lift;
      const o = i * 4;
      d[o] = Math.max(0, Math.min(255, (r + n * r) * 255));
      d[o + 1] = Math.max(0, Math.min(255, (g + n * g) * 255));
      d[o + 2] = Math.max(0, Math.min(255, (b + n * b) * 255));
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// The terrain mesh: a grid displaced by the sim heightfield. Sampling the SAME
// pure function movement uses is the hard invariant - visuals and collision
// cannot drift.
function buildTerrainMesh(ox: number, oz: number, lowGfx: boolean): THREE.Mesh {
  const half = MOBA_MAP.half;
  const size = half * 2 + 4;
  const segs = lowGfx ? 144 : 288;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2); // plane XY -> ground XZ (+z south before rotation flips it)
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, mobaHeightAt(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const groundTex = new THREE.CanvasTexture(paintGroundCanvas(lowGfx ? 512 : 1024));
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 4;
  const mesh = new THREE.Mesh(geo, surfaceMat({ map: groundTex, roughness: 0.96 }));
  mesh.position.set(ox, 0, oz);
  mesh.receiveShadow = true;
  return mesh;
}

// A stylized instanced tree: bark cylinder + two foliage cones. Reads as a
// dense pine forest without any GLB coupling; the trunk circle matches the
// collider radius from MOBA_JUNGLE_TREES. Each tree sits on the heightfield.
function buildTrees(positions: { x: number; z: number; y: number }[], ox: number, oz: number, scaleJitter: () => number): THREE.Group {
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
    m.compose(new THREE.Vector3(ox + p.x, p.y, oz + p.z), q, new THREE.Vector3(s, s, s));
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

// The lane walls: one instanced rampart block per sampled wall segment (the
// same list the colliders build OBBs from), grounded on the heightfield.
function buildWalls(ox: number, oz: number): THREE.InstancedMesh {
  const segs = MOBA_WALL_SEGMENTS;
  const geo = new THREE.BoxGeometry(1, 1.7, 1.8);
  geo.translate(0, 0.85, 0);
  const mat = surfaceMat({ map: stoneTexture(), roughness: 0.92 });
  const mesh = new THREE.InstancedMesh(geo, mat, segs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < segs.length; i++) {
    const w = segs[i];
    const cx = (w.x1 + w.x2) / 2;
    const cz = (w.z1 + w.z2) / 2;
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) + 0.8;
    q.setFromAxisAngle(up, Math.atan2(w.x2 - w.x1, w.z2 - w.z1) + Math.PI / 2);
    m.compose(
      new THREE.Vector3(ox + cx, mobaHeightAt(cx, cz), oz + cz),
      q,
      new THREE.Vector3(len, 1, 1),
    );
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildClashWorld(ox: number, oz: number, lowGfx: boolean): ClashWorldView {
  const group = new THREE.Group();
  const half = MOBA_MAP.half;
  const rnd = mulberry(0x50a7);

  // Skirt: a dark ground apron far past the borders so the horizon never reads
  // as void against the outdoor fog.
  const skirtMat = surfaceMat({ color: 0x16240f, roughness: 1 });
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), skirtMat);
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.set(ox, -0.25, oz);
  skirt.receiveShadow = true;
  group.add(skirt);

  // Ground: the displaced heightfield mesh with the painted map albedo.
  group.add(buildTerrainMesh(ox, oz, lowGfx));

  // River water: a translucent strip INSIDE the sunken channel, below the bank
  // tops (0) and above the bed (-1.8); the ford shallows (-0.27) rise clear of
  // it, so crossings read dry.
  const riverMat = new THREE.MeshPhongMaterial({
    color: 0x2b6b7e,
    transparent: true,
    opacity: 0.62,
    shininess: 90,
    normalMap: waterNormalish(),
    depthWrite: false,
  });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 * Math.SQRT2, (MOBA_RIVER.band * 2) / Math.SQRT2 - 2), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.rotation.z = -Math.PI / 4; // along the anti-diagonal
  river.position.set(ox, -0.9, oz);
  group.add(river);

  // Border walls: low stone ramparts matching the collider OBBs.
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

  // Lane walls (the jungle maze boundaries with their entrance gaps).
  group.add(buildWalls(ox, oz));

  // Center bridge dressing: plank rails flanking the mid lane's river crossing.
  const midPath = mobaLanePath('A', 1);
  const c0 = midPath[Math.floor(midPath.length / 2) - 1];
  const c1 = midPath[Math.floor(midPath.length / 2) + 1];
  const bridgeDir = Math.atan2(c1.x - c0.x, c1.z - c0.z);
  const railMat = surfaceMat({ map: plankTexture(), roughness: 0.85 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 24), railMat);
    const px = Math.cos(bridgeDir) * (MOBA_MAP.laneHalfW + 0.8) * side;
    const pz = -Math.sin(bridgeDir) * (MOBA_MAP.laneHalfW + 0.8) * side;
    rail.position.set(ox + px, 0.3, oz + pz);
    rail.rotation.y = bridgeDir;
    rail.castShadow = true;
    group.add(rail);
  }

  // Boss pit dressing: a ring of standing stones on the rim (the rim wall
  // itself is heightfield terrain), parted at the two mouths.
  const stoneMat = surfaceMat({ map: stoneTexture(), roughness: 0.95 });
  const pit = MOBA_BOSS_PIT;
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const sx = pit.x + Math.sin(ang) * (pit.r + 0.6);
    const sz = pit.z + Math.cos(ang) * (pit.r + 0.6);
    const nearMouth = pit.mouths.some((mo) => Math.hypot(sx - mo.x, sz - mo.z) < pit.mouthR + 1);
    if (nearMouth) continue;
    const stone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6 + rnd() * 1.2, 5), stoneMat);
    stone.position.set(ox + sx, mobaHeightAt(sx, sz) + 1.1, oz + sz);
    stone.rotation.y = rnd() * Math.PI;
    stone.castShadow = true;
    group.add(stone);
  }

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

  // Jungle trees (the SAME list the colliders block on), grounded on the
  // heightfield, + a perimeter forest ring outside the walls for a horizon.
  group.add(buildTrees(
    MOBA_JUNGLE_TREES.map((t) => ({ x: t.x, z: t.z, y: mobaHeightAt(t.x, t.z) })),
    ox, oz, rnd,
  ));
  const ring: { x: number; z: number; y: number }[] = [];
  const ringCount = lowGfx ? 110 : 210;
  for (let i = 0; i < ringCount; i++) {
    const ang = (i / ringCount) * Math.PI * 2;
    const r = half + 6 + rnd() * 26;
    ring.push({ x: Math.sin(ang) * r, z: Math.cos(ang) * r, y: 0 });
  }
  group.add(buildTrees(ring, ox, oz, rnd));

  return { group };
}
