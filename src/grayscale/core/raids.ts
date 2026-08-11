// Grayscale raid content, data-as-code. Mirrors the instances the game itself
// ships (src/sim/content/dungeons.ts, the Nythraxis finale) so the companion app
// and the world stay one fiction.
//
// Records are language-agnostic on purpose: every player-visible string is a
// `t()` key here, resolved by the host. Nothing in this file is a formatted
// sentence.

export interface RaidBossDef {
  id: string;
  nameKey: string;
  /** Difficulty weighed against the character's `might` by `pullChance`. */
  power: number;
}

export interface RaidLootDef {
  itemKey: string;
  /** Per-kill drop chance in [0, 1]. */
  chance: number;
}

export interface RaidDef {
  id: string;
  nameKey: string;
  taglineKey: string;
  /** Character level the raid gates on. */
  minLevel: number;
  /** Banked focus minutes a run consumes, win or lose. */
  costMinutes: number;
  /** Wipe budget shared across the whole raid, not per boss. */
  attempts: number;
  bosses: RaidBossDef[];
  loot: RaidLootDef[];
}

export const RAIDS: readonly RaidDef[] = [
  {
    id: 'hollow_crypt',
    nameKey: 'grayscale.raids.hollowCrypt.name',
    taglineKey: 'grayscale.raids.hollowCrypt.tagline',
    minLevel: 3,
    costMinutes: 45,
    attempts: 4,
    bosses: [
      { id: 'sexton_marrow', nameKey: 'grayscale.bosses.sextonMarrow', power: 34 },
      { id: 'morthen', nameKey: 'grayscale.bosses.morthen', power: 46 },
    ],
    loot: [
      { itemKey: 'grayscale.items.boneFragments', chance: 0.8 },
      { itemKey: 'grayscale.items.cryptboneGreaves', chance: 0.34 },
      { itemKey: 'grayscale.items.cryptboneHelm', chance: 0.18 },
    ],
  },
  {
    id: 'sunken_bastion',
    nameKey: 'grayscale.raids.sunkenBastion.name',
    taglineKey: 'grayscale.raids.sunkenBastion.tagline',
    minLevel: 8,
    costMinutes: 90,
    attempts: 5,
    bosses: [
      { id: 'bastion_revenant', nameKey: 'grayscale.bosses.bastionRevenant', power: 62 },
      { id: 'knight_commander_olen', nameKey: 'grayscale.bosses.knightCommanderOlen', power: 78 },
    ],
    loot: [
      { itemKey: 'grayscale.items.mistveilCord', chance: 0.5 },
      { itemKey: 'grayscale.items.mistveilGrips', chance: 0.3 },
      { itemKey: 'grayscale.items.tideboundWard', chance: 0.15 },
    ],
  },
  {
    id: 'nythraxis',
    nameKey: 'grayscale.raids.nythraxis.name',
    taglineKey: 'grayscale.raids.nythraxis.tagline',
    minLevel: 16,
    costMinutes: 180,
    attempts: 6,
    bosses: [
      { id: 'voskar_emberwing', nameKey: 'grayscale.bosses.voskarEmberwing', power: 148 },
      { id: 'nythraxis', nameKey: 'grayscale.bosses.nythraxis', power: 190 },
    ],
    loot: [
      { itemKey: 'grayscale.items.emberwingScale', chance: 0.45 },
      { itemKey: 'grayscale.items.ashenCrown', chance: 0.2 },
      { itemKey: 'grayscale.items.quietMind', chance: 0.08 },
    ],
  },
];

export function raidById(id: string): RaidDef | undefined {
  return RAIDS.find((raid) => raid.id === id);
}
