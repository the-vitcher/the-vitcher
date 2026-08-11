// i18n source catalog - the Grayscale companion app (grayscale.html, src/grayscale/).
// English values only; the 13 locale translations live in
// src/ui/i18n.locales/<lang>.ts (the runtime-authoritative overlays), filled by
// the maintainer at release.
//
// Assembled into `en` by ./index.ts under the `grayscale` namespace. Kept as its
// own module (no per-locale blocks) so new keys are an English-only add.
//
// Raid, boss, and item names are duplicated here rather than pulled from
// src/sim/content/: the sim's copies are world entities resolved through
// world_entity_i18n for the game client, and the companion app needs them as
// plain catalog keys its own records can point at.

export const grayscaleStrings = {
  title: "Grayscale",
  tagline: "Your attention is the only currency here.",
  documentTitle: "Grayscale: focus, and your character raids",

  focus: {
    idle: "Not focusing",
    active: "Focusing",
    start: "Start focusing",
    stop: "Stop focusing",
    elapsed: "{minutes} min this session",
    hint: "Put the phone down. The timer is the only thing that moves the character.",
  },

  stats: {
    banked: "Banked",
    bankedUnit: "{minutes} min",
    today: "Today",
    todayOfGoal: "{minutes} / {goal} min",
    streak: "Streak",
    streakUnit: "{days} d",
    lifetime: "Lifetime focus",
    level: "Level {level}",
    xp: "{xp} / {next} XP",
    xpCapped: "{xp} XP past the cap",
    might: "Might",
    ward: "Ward",
  },

  raids: {
    heading: "Raids",
    send: "Send",
    cost: "{minutes} min",
    requiresLevel: "Requires level {level}",
    cleared: "Cleared",
    attempts: "{attempts} attempts",
    blocked: {
      level: "{levels} more levels",
      minutes: "{minutes} more minutes",
      focusing: "Bank the session first",
    },
    hollowCrypt: {
      name: "The Hollow Crypt",
      tagline: "Something in the dark keeps count of the days you skipped.",
    },
    sunkenBastion: {
      name: "The Sunken Bastion",
      tagline: "A garrison that drowned holding a line nobody remembers.",
    },
    nythraxis: {
      name: "Nythraxis",
      tagline: "The last thing that will ever ask for your full attention.",
    },
  },

  bosses: {
    sextonMarrow: "Sexton Marrow",
    morthen: "Morthen the Gravecaller",
    bastionRevenant: "Bastion Revenant",
    knightCommanderOlen: "Knight-Commander Olen",
    voskarEmberwing: "Voskar Emberwing",
    nythraxis: "Nythraxis",
  },

  items: {
    boneFragments: "Bone Fragments",
    cryptboneGreaves: "Cryptbone Greaves",
    cryptboneHelm: "Cryptbone Helm",
    mistveilCord: "Mistveil Cord",
    mistveilGrips: "Mistveil Grips",
    tideboundWard: "Tidebound Ward",
    emberwingScale: "Emberwing Scale",
    ashenCrown: "Ashen Crown",
    quietMind: "The Quiet Mind",
  },

  run: {
    heading: "Recent runs",
    empty: "No runs yet. Focus for a while, then send the character in.",
    cleared: "Cleared {raid}",
    wiped: "Wiped on {boss}",
    bossDefeated: "{boss} down",
    bossWipes: "{boss} down after {wipes} wipes",
    bossNotReached: "{boss} not reached",
    attemptsUsed: "{used} / {total} attempts",
    lootHeading: "Loot",
    lootEmpty: "Nothing dropped",
    spent: "Spent {minutes} min",
  },

  storage: {
    unavailable: "Progress cannot be saved in this browser, so this session will not persist.",
  },
};
