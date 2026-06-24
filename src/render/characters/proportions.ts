// Human-proportion retarget (prototype). The KayKit Adventurers rig the players
// and humanoid NPCs use is authored in a stylized "heroic" proportion: an
// oversized head and short, stocky limbs (~4.5 heads tall vs a real ~7.5). This
// module nudges those proportions toward a natural human figure WITHOUT new art,
// by rescaling a handful of named bones every frame.
//
// Why per-frame: the KayKit clips key full translation/rotation/scale on every
// bone every frame, so the AnimationMixer overwrites any rest-pose edit. We
// instead re-apply the proportion factors AFTER each mixer.update() (multiplying
// the clip-driven value), which survives animation. The same pass runs once on
// the baked idle-pose measurement (assets.ts) so the far LOD matches the near model.
//
// Self-limiting: only rigs that expose the KayKit bone names are touched; every
// creature/other rig resolves no targets and is left exactly as-is. Toggle off for
// an A/B compare with `?proportions=stylized` (or force on with `?proportions=human`).
import type * as THREE from 'three';

// One tunable plan. `scale` multiplies the bone's local scale (shrinks the head
// mesh); `position` multiplies the bone's local offset from its parent (pushes the
// joint farther out, lengthening the parent segment). Hands/handslots are left
// untouched so weapon grips keep their size and placement.
export interface ProportionRule {
  /** authored bone name (GLTFLoader-sanitized at runtime; both forms are tried) */
  bone: string;
  mode: 'scale' | 'position';
  factor: number;
}

// Tuned by eye for the KayKit Adventurers rig. Head down hard (the single biggest
// "chibi" tell), legs longest, then forearms/upper-arms and torso, plus a touch of
// neck. Leaf-segment joints carry the lengthening (knee + ankle = whole leg).
export const PROPORTION_PLAN: readonly ProportionRule[] = [
  { bone: 'head', mode: 'scale', factor: 0.72 },
  { bone: 'head', mode: 'position', factor: 1.05 }, // neck a touch longer
  // legs: lowerleg = knee (lengthens thigh), foot = ankle (lengthens shin)
  { bone: 'lowerleg.l', mode: 'position', factor: 1.18 },
  { bone: 'lowerleg.r', mode: 'position', factor: 1.18 },
  { bone: 'foot.l', mode: 'position', factor: 1.18 },
  { bone: 'foot.r', mode: 'position', factor: 1.18 },
  // arms: lowerarm = elbow (lengthens upper arm), wrist = lengthens forearm
  { bone: 'lowerarm.l', mode: 'position', factor: 1.10 },
  { bone: 'lowerarm.r', mode: 'position', factor: 1.10 },
  { bone: 'wrist.l', mode: 'position', factor: 1.10 },
  { bone: 'wrist.r', mode: 'position', factor: 1.10 },
  // torso: lengthen the spine stack so the longer legs do not read as all-leg
  { bone: 'spine', mode: 'position', factor: 1.08 },
  { bone: 'chest', mode: 'position', factor: 1.08 },
];

function sanitize(name: string): string {
  return name.replace(/[[\].:/]/g, '');
}

let enabledCache: boolean | null = null;

/** Prototype gate: OFF by default (the stylized rig ships as-is); opt in to the human
 *  retarget with `?proportions=human` (alias `on`). Defaulted off after the
 *  per-frame-compounding regression so a bug here can never break the shipped look. */
export function humanProportionsEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  let mode = 'stylized';
  if (typeof window !== 'undefined' && window.location?.search) {
    const v = new URLSearchParams(window.location.search).get('proportions');
    if (v) mode = v;
  }
  enabledCache = mode === 'human' || mode === 'on';
  return enabledCache;
}

/** A bone reference paired with its rule AND the bone's captured REST scale/position.
 *  We re-derive from this baseline every frame (set, never multiply the live value),
 *  so the retarget can never compound. The earlier multiply-the-live-value version was
 *  the "stretch to the sky" bug: the KayKit clips key only ROTATION on the limb bones,
 *  so the mixer never reset the position we kept multiplying, and it grew unbounded. */
export interface ProportionTarget {
  bone: THREE.Object3D;
  mode: 'scale' | 'position';
  factor: number;
  baseScale: THREE.Vector3;
  basePos: THREE.Vector3;
}

/** Resolve the plan against a clone's skeleton, capturing each bone's rest pose.
 *  Returns [] when the rig is not the KayKit humanoid (no matching bones) or the
 *  feature is off, so every other rig and the stylized mode are exact no-ops. */
export function collectProportionTargets(root: THREE.Object3D): ProportionTarget[] {
  if (!humanProportionsEnabled()) return [];
  const targets: ProportionTarget[] = [];
  for (const rule of PROPORTION_PLAN) {
    const bone = root.getObjectByName(rule.bone) ?? root.getObjectByName(sanitize(rule.bone));
    if (bone) targets.push({ bone, mode: rule.mode, factor: rule.factor, baseScale: bone.scale.clone(), basePos: bone.position.clone() });
  }
  return targets;
}

/** Re-derive each retargeted bone from its captured REST value times the factor.
 *  Idempotent: because it SETS from the baseline (never multiplies the current value),
 *  calling it every frame after mixer.update() can never compound, whether or not the
 *  clip keys that bone. Safe for the targeted joints, which only rotate in the clips. */
export function applyProportionTargets(targets: readonly ProportionTarget[]): void {
  for (const t of targets) {
    if (t.mode === 'scale') t.bone.scale.copy(t.baseScale).multiplyScalar(t.factor);
    else t.bone.position.copy(t.basePos).multiplyScalar(t.factor);
  }
}
