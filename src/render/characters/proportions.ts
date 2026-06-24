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

/** Prototype gate: on by default, `?proportions=stylized` returns the original look. */
export function humanProportionsEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  let mode = 'human';
  if (typeof window !== 'undefined' && window.location?.search) {
    const v = new URLSearchParams(window.location.search).get('proportions');
    if (v) mode = v;
  }
  enabledCache = mode !== 'stylized' && mode !== 'off';
  return enabledCache;
}

/** A bone reference paired with the rule that drives it (resolved once per clone). */
export interface ProportionTarget {
  bone: THREE.Object3D;
  mode: 'scale' | 'position';
  factor: number;
}

/** Resolve the plan against a clone's skeleton. Returns [] when the rig is not the
 *  KayKit humanoid (no matching bones) or the feature is off, so every other rig and
 *  the stylized mode are exact no-ops. */
export function collectProportionTargets(root: THREE.Object3D): ProportionTarget[] {
  if (!humanProportionsEnabled()) return [];
  const targets: ProportionTarget[] = [];
  for (const rule of PROPORTION_PLAN) {
    const bone = root.getObjectByName(rule.bone) ?? root.getObjectByName(sanitize(rule.bone));
    if (bone) targets.push({ bone, mode: rule.mode, factor: rule.factor });
  }
  return targets;
}

/** Re-apply the proportion factors on top of the current (clip-driven) bone state.
 *  Call once immediately after each mixer.update() — it multiplies the fresh clip
 *  value, so it never compounds across frames. */
export function applyProportionTargets(targets: readonly ProportionTarget[]): void {
  for (const t of targets) {
    if (t.mode === 'scale') t.bone.scale.multiplyScalar(t.factor);
    else t.bone.position.multiplyScalar(t.factor);
  }
}
