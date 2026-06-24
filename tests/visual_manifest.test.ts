import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  manifestUrls,
  manifestUrlsForGraphics,
  visibleAttachmentsForGraphics,
  visualKeyFor,
  VISUALS,
  type ClipMap,
} from '../src/render/characters/manifest';

function expectedClipNames(clips: ClipMap): string[] {
  return [
    clips.idle, clips.walk, clips.run, clips.death,
    clips.cast, clips.sitDown, clips.sitIdle, clips.swim, clips.jump, clips.walkBack, clips.flourish,
    ...clips.attack,
    ...(clips.hit ?? []),
    ...Object.values(clips.emote ?? {}).flatMap((spec) => spec.clips),
  ].filter((name): name is string => !!name);
}

async function glbAnimationNames(path: string): Promise<Set<string>> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path);
  return new Set(doc.getRoot().listAnimations().map((animation) => animation.getName()));
}

describe('character visual manifest', () => {
  it('uses the custom boar death clip without relying on a speed override', () => {
    expect(VISUALS.mob_boar.clips.death).toBe('Dying');
    expect(VISUALS.mob_boar.deathTimeScale).toBeUndefined();
  });

  it('points the Combat Mech manifest at animation clips baked into the GLB', async () => {
    const visual = VISUALS.player_mech;
    const animationNames = await glbAnimationNames(`public/${visual.url}`);

    expect(animationNames.size).toBeGreaterThan(0);
    expect([...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name))).toEqual([]);
  });

  it('binds the new Greywater creatures to real clips in their GLBs (no T-pose)', async () => {
    for (const key of ['mob_nekker', 'mob_ghoul', 'mob_leshen']) {
      const visual = VISUALS[key];
      const animationNames = await glbAnimationNames(`public/${visual.url}`);
      expect(animationNames.size, `${key} GLB has no clips`).toBeGreaterThan(0);
      const missing = [...new Set(expectedClipNames(visual.clips))].filter((n) => !animationNames.has(n));
      expect(missing, `${key} declares clips absent from ${visual.url}`).toEqual([]);
    }
  });

  it('gives every Greywater mob a distinct, non-skeleton model', () => {
    const keyFor = (templateId: string) => visualKeyFor({ kind: 'mob', templateId } as unknown as Parameters<typeof visualKeyFor>[0]);
    const greywaterMobs = [
      'greywater_drowner', 'river_mudlark', 'bog_ghoul', 'valley_nekker', 'margrave_guard',
      'tournament_brawler', 'tournament_champion', 'reclamation_mercenary', 'greywater_hag', 'valley_leshen',
    ];
    for (const id of greywaterMobs) {
      const key = keyFor(id);
      expect(key, `${id} still maps to a skeleton`).not.toMatch(/^skel_/);
      expect(VISUALS[key], `${id} -> ${key} is not a real visual`).toBeTruthy();
    }
    // The four monster types are all visually distinct from one another.
    const monsters = ['greywater_drowner', 'bog_ghoul', 'valley_nekker', 'valley_leshen'].map(keyFor);
    expect(new Set(monsters).size).toBe(4);
  });

  it('keeps held weapons and props available on low graphics', () => {
    const allWeaponUrls = manifestUrls().filter((url) => url.startsWith('models/weapons/'));
    expect(allWeaponUrls.length).toBeGreaterThan(0);
    expect(manifestUrlsForGraphics(false)).toEqual(expect.arrayContaining(allWeaponUrls));
    expect(visibleAttachmentsForGraphics(VISUALS.player_warrior).map((a) => a.url))
      .toContain('models/weapons/sword_1handed.glb');
    // School of the Cat: twin-sword witcher silhouette (steel + silver).
    expect(visibleAttachmentsForGraphics(VISUALS.player_rogue).map((a) => a.url))
      .toEqual(['models/weapons/sword_1handed.glb', 'models/weapons/sword_1handed.glb']);
  });
});
