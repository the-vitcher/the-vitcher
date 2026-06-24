// The Greywater Valley - a self-contained witcher questline that runs north up a
// walled western vale of Eastbrook. A witcher walks the valley to repay a life-debt
// to Ines, and the moral choices he makes early ripple forward into the quests that
// follow (the per-player choice/consequence system in sim.ts). Five quests, each a
// real gameplay loop (travel, kill, fetch from a drowned cave) that ENDS in a moral
// choice recorded as a personal flag; later quests read those flags via `callbacks`.
//
// Everything is merged into the flat engine tables by sim/data.ts, exactly the way
// the per-zone modules and content/temple.ts are. Levels ~2-10: a low-level journey
// a fresh character can begin from the start, parallel to the Eastbrook spineline.
//
// Witcher bestiary (existing combat mechanics, reflavored families): drowners and
// bog ghouls (undead), valley nekkers and human foes (humanoid), a water hag and a
// leshen as rare elites. No new art: families map to existing renderer models.

import type {
  CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, PlayerClass, QuestDef, ZonePropsDef,
} from '../types';

// Archetype class-locks (match content/items.ts so REWARD_ARCHETYPE hand-offs land
// on an item the whole group can equip).
const WAR: PlayerClass[] = ['warrior', 'paladin', 'shaman'];
const MAG: PlayerClass[] = ['mage', 'priest', 'warlock', 'druid'];
const ROG: PlayerClass[] = ['rogue', 'hunter'];

// The valley corridor runs north along the eastern edge of Eastbrook Vale (x ~ +120
// to +168), from the ford in the south to Greywater Mill in the far north. (Kept clear
// of the western test areas - Mirror Lake and the far-west corner - so the lazy camps
// never activate during the existing determinism tests.)
export const GREYWATER_FORD = { x: 148, z: -150 };
export const GREYWATER_CAVE = { x: 158, z: -120 };
export const GREYWATER_MILL = { x: 132, z: 160 };

// ---------------------------------------------------------------------------
// Mobs - the Witcher bestiary of the valley
// ---------------------------------------------------------------------------

export const GREYWATER_MOBS: Record<string, MobTemplate> = {
  greywater_drowner: {
    id: 'greywater_drowner', name: 'Drowner', minLevel: 2, maxLevel: 3, family: 'undead', canSwim: true,
    hpBase: 30, hpPerLevel: 9, dmgBase: 5, dmgPerLevel: 1.4, attackSpeed: 2.0,
    armorPerLevel: 6, moveSpeed: 7.5, aggroRadius: 11,
    loot: [
      { copper: 18, chance: 1 },
      { itemId: 'drowner_brain', chance: 0.35 },
      // The caravan strongbox: drops from a drowner while the quest needs it. The
      // quest-drop gate (needsQuestDrop) stops it after you have one, so chance:1
      // just guarantees the first kill yields it (no farming).
      { itemId: 'slaver_strongbox', chance: 1, questId: 'gw_caravan' },
    ],
    scale: 1.0, color: 0x5d7a63,
  },
  // River-thieves working the drowned caravan at the ford. They own the wreck the
  // way drowners own the water: a player reads "looters" off the wagon before a word.
  river_mudlark: {
    id: 'river_mudlark', name: 'River Mudlark', minLevel: 2, maxLevel: 3, family: 'humanoid',
    hpBase: 28, hpPerLevel: 8, dmgBase: 5, dmgPerLevel: 1.3, attackSpeed: 2.0,
    armorPerLevel: 5, moveSpeed: 7.5, aggroRadius: 10,
    loot: [
      { copper: 16, chance: 1 },
      { itemId: 'looted_gemstone', chance: 0.12 },
    ],
    scale: 0.95, color: 0x7a6a52,
  },
  bog_ghoul: {
    id: 'bog_ghoul', name: 'Bog Ghoul', minLevel: 3, maxLevel: 4, family: 'undead',
    hpBase: 40, hpPerLevel: 11, dmgBase: 6, dmgPerLevel: 1.6, attackSpeed: 2.0,
    armorPerLevel: 8, moveSpeed: 7, aggroRadius: 11,
    enrage: { belowHpPct: 0.3, dmgMult: 1.3, hasteMult: 1.2 },
    loot: [
      { copper: 26, chance: 1 },
      { itemId: 'ghoul_blood', chance: 0.35 },
    ],
    scale: 1.05, color: 0x6b6f55,
  },
  valley_nekker: {
    id: 'valley_nekker', name: 'Nekker', minLevel: 4, maxLevel: 5, family: 'humanoid',
    hpBase: 36, hpPerLevel: 10, dmgBase: 6, dmgPerLevel: 1.6, attackSpeed: 1.7,
    armorPerLevel: 7, moveSpeed: 8.5, aggroRadius: 12,
    packFrenzy: { radius: 10, hasteMult: 1.25, duration: 8 },
    loot: [
      { copper: 30, chance: 1 },
      { itemId: 'nekker_claw', chance: 0.4 },
      { itemId: 'wolfsbane_sprig', chance: 0.5, questId: 'gw_velvet' },
    ],
    scale: 0.85, color: 0x7d6b4f,
  },
  margrave_guard: {
    id: 'margrave_guard', name: "Margrave's Guard", minLevel: 5, maxLevel: 6, family: 'humanoid',
    hpBase: 52, hpPerLevel: 13, dmgBase: 8, dmgPerLevel: 1.9, attackSpeed: 2.2,
    armorPerLevel: 12, moveSpeed: 7, aggroRadius: 11,
    loot: [
      { copper: 44, chance: 1 },
      { itemId: 'gilded_braid', chance: 0.3 },
    ],
    scale: 1.05, color: 0x9a7b4f,
  },
  tournament_brawler: {
    id: 'tournament_brawler', name: 'Tournament Brawler', minLevel: 6, maxLevel: 7, family: 'humanoid',
    hpBase: 62, hpPerLevel: 14, dmgBase: 9, dmgPerLevel: 2.0, attackSpeed: 2.1,
    armorPerLevel: 12, moveSpeed: 7, aggroRadius: 11,
    loot: [
      { copper: 55, chance: 1 },
      { itemId: 'splintered_lance', chance: 0.3 },
    ],
    scale: 1.05, color: 0xcf8a3a,
  },
  tournament_champion: {
    id: 'tournament_champion', name: 'The Governor\'s Champion', minLevel: 8, maxLevel: 8, family: 'humanoid',
    rare: true, elite: true,
    hpBase: 150, hpPerLevel: 24, dmgBase: 11, dmgPerLevel: 2.4, attackSpeed: 2.3,
    armorPerLevel: 18, moveSpeed: 7, aggroRadius: 13,
    enrage: { belowHpPct: 0.3, dmgMult: 1.4, hasteMult: 1.3 },
    loot: [
      { copper: 400, chance: 1 },
      { itemId: 'champions_laurel', chance: 1, questId: 'gw_champion' },
      { itemId: 'gilded_braid', chance: 0.5 },
    ],
    scale: 1.2, color: 0xd9a441,
  },
  reclamation_mercenary: {
    id: 'reclamation_mercenary', name: 'Reclamation Mercenary', minLevel: 8, maxLevel: 9, family: 'humanoid',
    hpBase: 78, hpPerLevel: 16, dmgBase: 11, dmgPerLevel: 2.3, attackSpeed: 2.1,
    armorPerLevel: 14, moveSpeed: 7, aggroRadius: 11,
    loot: [
      { copper: 70, chance: 1 },
      { itemId: 'survey_stake', chance: 0.3 },
    ],
    scale: 1.05, color: 0x6f6f78,
  },
  greywater_hag: {
    id: 'greywater_hag', name: 'Greywater Water Hag', minLevel: 10, maxLevel: 10, family: 'humanoid',
    rare: true, elite: true, canSwim: true,
    hpBase: 200, hpPerLevel: 26, dmgBase: 12, dmgPerLevel: 2.6, attackSpeed: 2.2,
    armorPerLevel: 20, moveSpeed: 7, aggroRadius: 14,
    aoePulse: { min: 10, max: 16, radius: 8, every: 9, name: 'Mud Surge', school: 'nature' },
    enrage: { belowHpPct: 0.3, dmgMult: 1.4, hasteMult: 1.3 },
    loot: [
      { copper: 600, chance: 1 },
      { itemId: 'hag_tooth_charm', chance: 0.5 },
    ],
    scale: 1.25, color: 0x4f6b5a,
  },
  // Ambient rare elite (no quest tie): a forest spirit haunting the valley's woods.
  valley_leshen: {
    id: 'valley_leshen', name: 'Valley Leshen', minLevel: 9, maxLevel: 9, family: 'beast',
    rare: true, elite: true, respawnMult: 7.0,
    hpBase: 230, hpPerLevel: 30, dmgBase: 12, dmgPerLevel: 2.7, attackSpeed: 2.4,
    armorPerLevel: 22, moveSpeed: 7, aggroRadius: 14,
    thorns: { value: 6, name: 'Barkskin', school: 'nature' },
    enrage: { belowHpPct: 0.35, dmgMult: 1.4, hasteMult: 1.25 },
    loot: [
      { copper: 500, chance: 1 },
      { itemId: 'leshen_carving', chance: 0.5 },
    ],
    scale: 1.4, color: 0x3f5240,
  },
};

// ---------------------------------------------------------------------------
// NPCs - the five quest givers, strung north up the valley
// ---------------------------------------------------------------------------

export const GREYWATER_NPCS: Record<string, NpcDef> = {
  calla: {
    id: 'calla', name: 'Calla', title: 'Caravan Survivor',
    pos: { x: 146, z: -148 }, facing: 1.2, color: 0x6fae6f,
    questIds: ['gw_caravan'],
    greeting: "You're the witcher. Thank every god. The caravan went under at dawn, $C, and my master's strongbox went with it.",
  },
  reeve_ondrin: {
    id: 'reeve_ondrin', name: 'Reeve Ondrin', title: 'Reeve of Aldermere',
    pos: { x: 140, z: -60 }, facing: 2.2, color: 0x9a7b4f,
    questIds: ['gw_aldermere'],
    greeting: 'Witcher. Good. The gallows are built and the crowd is past patience. We need a word, $C, that the rope is righteous.',
  },
  ines: {
    id: 'ines', name: 'Ines', title: 'The Velvet Debt',
    pos: { x: 150, z: 4 }, facing: 0.4, color: 0xb05a8e,
    questIds: ['gw_velvet'],
    greeting: 'You took your time, $C. I once put a knife between your spine and a striga\'s claw, and now I am calling the whole debt in at once.',
  },
  ortega: {
    id: 'ortega', name: 'Ortega', title: 'Tournament Conspirator',
    pos: { x: 138, z: 92 }, facing: 3.0, color: 0xcf8a3a,
    questIds: ['gw_champion'],
    greeting: "Don't look at the banners, $C, look under them. This whole pageant is the governor's, and I have spent my blood setting this match.",
  },
  goodwife_sera: {
    id: 'goodwife_sera', name: 'Goodwife Sera', title: 'Miller of Greywater',
    pos: { x: 140, z: 148 }, facing: -1.6, color: 0x5f8fae,
    questIds: ['gw_mill'],
    greeting: "So you're the heir, $C. We wondered when paper would come walking. We made this dead mill breathe again; it feeds half the valley now.",
  },
  // In Eastbrook town: only relevant if you took the manifest to the law at the ford.
  magistrate_holt: {
    id: 'magistrate_holt', name: 'Magistrate Holt', title: 'Magistrate of Eastbrook',
    pos: { x: 13, z: 7 }, facing: -2.0, color: 0x8a8f9a,
    questIds: ['gw_jail_chest'],
    greeting: "You're the witcher who brought me the slaver's manifest, $C. The cells are full because of it. There's a chest in the jailhouse with your fee in it.",
  },
};

// ---------------------------------------------------------------------------
// Quests - five gameplay loops, each ending in a recorded moral choice
// ---------------------------------------------------------------------------

export const GREYWATER_QUESTS: Record<string, QuestDef> = {
  gw_caravan: {
    id: 'gw_caravan', name: 'The Drowned Caravan',
    giverNpcId: 'calla', turnInNpcId: 'calla',
    text: "The river took the caravan at the ford, $N, and my master's strongbox with it. The current dragged it into the drowned cave to the west, and the drowners nest there now. Clear them, bring me the box, and his widow will have what she is owed.",
    completionText: "You went down where Calla could not and found no ledgers in the box: cut gems, and a manifest. Not goods. People, tallied by the head. Her gentle dead master was a slaver, and halfway down the list, in a child's hand, is Calla's own name. The box is in your hands now. What you do with it is yours to choose.",
    objectives: [
      { type: 'interact', targetObjectItemId: 'caravan_wreck', count: 1, label: 'Read the wrecked wagon (Witcher Senses)' },
      { type: 'kill', targetMobId: 'greywater_drowner', count: 5, label: 'Drowner slain' },
      { type: 'collect', itemId: 'slaver_strongbox', count: 1, label: "Slaver's Strongbox recovered" },
      { type: 'interact', targetObjectItemId: 'slaver_manifest', count: 1, label: 'Read the manifest (Witcher Senses)' },
    ],
    xpReward: 420, copperReward: 60, itemRewards: {},
    minLevel: 1, // entry quest: available from level 1 so Calla's map marker shows immediately
    choices: [
      {
        id: 'looters', label: 'Cut the mudlarks in. Split the gems, leave Calla nothing.',
        result: "Three river-thieves were already wading in. You bargain rather than argue, and the gems go into wet leather and into the reeds. Behind you, smaller and smaller, Calla is still calling your name across the water. You don't turn around. That's the trick of it: not turning around.",
        effect: { copper: 60, setFlags: ['soldOutCalla'], reputation: { justice: -2, smallfolk: -2, underworld: 1 },
          itemRewards: { warrior: 'looted_gemstone', mage: 'looted_gemstone', rogue: 'looted_gemstone' } },
      },
      {
        id: 'giveCalla', label: "Put the box in Calla's hands. The list is hers to burn.",
        result: "You press the cold box into her arms. She reads her own name on the manifest and her face does something you have no word for. No thanks, no tears, just a long breath let out over two years. Then she's gone into the reeds, box and gems and ghost, without looking back.",
        looming: 'Months on, two rumors reach you and never resolve: a gentle new ring spiriting branded folk to freedom, and a girl spending fistfuls of gems alone in a faraway port. You will never learn which one you made.',
        effect: { setFlags: ['callaFreed'], reputation: { smallfolk: 3, nobility: -1 },
          itemRewards: { warrior: 'callas_parting_gift', mage: 'callas_parting_gift', rogue: 'callas_parting_gift' } },
      },
      {
        id: 'magistrate', label: 'Carry the manifest to the magistrate. Let the law have it all.',
        result: "You carry the manifest the long road back to Eastbrook and lay it before Magistrate Holt. He reads it twice, grey to the lips, and tells you to come find him in town: there is a chest in the jailhouse, and a witcher's fee inside it. By nightfall a warehouse on the docks is chained shut. By the next, the cells are full.",
        looming: "Calla hangs as an accessory to her own captivity; the law cannot tell a name on a list from a person on it. Her cellmate, a fence with a long memory, learns who brought the manifest in. She will send knives down the road after you.",
        // Reward comes from Magistrate Holt's follow-up (gw_jail_chest), gated on this flag.
        effect: { setFlags: ['callaHanged', 'assassinHunt'], reputation: { justice: 4, nobility: 2, underworld: -2 } },
      },
      {
        id: 'burn', label: 'Keep the gems. Burn the manifest. End the trade with the proof.',
        result: 'You hold the manifest to your torch and watch a hundred names curl into ash and lift off the river like grey moths. No evidence, no trade, and the gems are warm and heavy in your palm.',
        looming: 'You burned the ledger, not the men who kept it. Untraceable now, the boss who owned that list simply moves his stock to a quieter road. A season on, you will walk that road and find it thick with the trade you were sure you had ended.',
        effect: { copper: 140, setFlags: ['tradeExpands'], reputation: { justice: -3 } },
      },
    ],
  },

  gw_aldermere: {
    id: 'gw_aldermere', name: 'An Eye for Aldermere',
    giverNpcId: 'reeve_ondrin', turnInNpcId: 'reeve_ondrin',
    text: "A child is dead and a drifter named Hask was found by the body with her ribbon in his fist. The crowd wants a neck. Before you say a word over the rope, walk the gallows-yard, $N: take the girl's shawl from my table, and put down the bog ghouls that have crept up from the fen to the corpse.",
    completionText: "Hask reeks of river-mud and terror and nothing else. But the dead girl's shawl carries another scent: bitter herbs, a healer's hands. Her uncle's hands. The reeve knows it too, and is begging you with his eyes to say the word over Hask anyway. The rope is greased. The choice is yours.",
    objectives: [
      { type: 'interact', targetObjectItemId: 'gallows_yard', count: 1, label: 'Walk the gallows-yard (Witcher Senses)' },
      { type: 'kill', targetMobId: 'bog_ghoul', count: 5, label: 'Bog Ghoul slain' },
      { type: 'collect', itemId: 'girls_shawl', count: 1, label: "The girl's shawl recovered" },
      { type: 'interact', targetObjectItemId: 'healers_herbs', count: 1, label: 'Examine the shawl (Witcher Senses)' },
    ],
    xpReward: 620, copperReward: 45, itemRewards: { warrior: 'witchers_oilcloak', mage: 'witchers_oilcloak', rogue: 'witchers_oilcloak' },
    requiresQuest: 'gw_caravan', minLevel: 3,
    choices: [
      {
        id: 'bless', label: "Take the purse. Bless the hanging. Don't make trouble.",
        result: "You give them the nod they paid for. The trap drops; the rope speaks once. Coins are pressed into hands that can't quite look at the hands they're filling. Everyone goes home. Nothing is solved. Everyone knew it wouldn't be.",
        effect: { copper: 45, setFlags: ['haskHanged'], reputation: { justice: -3, smallfolk: -1 } },
      },
      {
        id: 'expose', label: 'Name the uncle. The truth, whatever it costs the valley.',
        result: 'You lay the shawl on the table and say the name. The healer is dragged off, his bag spilling roots into the mud. The girl\'s mother does not thank you. She screams that you have taken the last two things she had, and she is not wrong.',
        looming: 'With no healer left in the valley, the winter fever comes and finds no one to turn it back. People you will never meet die of your being right. Justice, it turns out, has a body count too.',
        effect: { setFlags: ['healerGone'], reputation: { justice: 4, smallfolk: -2 } },
      },
      {
        id: 'freeHask', label: 'Cut Hask loose. Leave the crime unanswered.',
        result: "You sever the rope and put Hask on the dusk road with bread and a shove. He doesn't understand he's been saved, only that he's being sent away again, and he goes the way a kicked dog goes. The yard mutters at your back.",
        looming: 'A province over and a season later, you find Hask in a ditch. The rumor outran him on the road, and a different village finished what this one started. Your mercy only moved his grave.',
        effect: { setFlags: ['haskFreed'], reputation: { justice: 1 } },
      },
      {
        id: 'judge', label: 'Defer to the circuit judge. Let the law run its course.',
        result: 'You refuse the word and tell them to wait for the law. They wait. The judge arrives saddle-sore and hangs Hask before his boots are dry: the same rope, three days slower. You kept your hands clean by handing the knife to someone else.',
        looming: 'Afterward the uncle finds you alone and thanks you, softly, smiling, and lets slip that he knows you knew. He has learned that you can be steered by silence. He will use it.',
        effect: { setFlags: ['haskHanged', 'uncleBlackmail'], reputation: { nobility: 3, justice: -1 } },
      },
    ],
  },

  gw_velvet: {
    id: 'gw_velvet', name: 'The Velvet Debt',
    giverNpcId: 'ines', turnInNpcId: 'ines',
    text: "The margrave keeps me in a gilded cage at the only pass north, $N, and he holds the road you need open this season. Get me out. I don't care how, that's a lie, I care a great deal how. Brew me a sleeping-draught from wolfsbane the nekkers guard in the wood, and cut a path through his guards.",
    completionText: "The draught is brewed and the guards are down. The margrave loves Ines ruinously, the way men love a thing they are certain feels the same. He is not cruel. He is lonely, and patient, and he holds the only key. How Ines walks free, and what it costs, is yours to decide.",
    objectives: [
      { type: 'interact', targetObjectItemId: 'margrave_solar', count: 1, label: "Read the margrave's solar (Witcher Senses)" },
      { type: 'collect', itemId: 'wolfsbane_sprig', count: 3, label: 'Wolfsbane gathered' },
      { type: 'kill', targetMobId: 'margrave_guard', count: 6, label: "Margrave's Guard slain" },
      { type: 'interact', targetObjectItemId: 'love_letters', count: 1, label: 'Read the unsent letters (Witcher Senses)' },
    ],
    xpReward: 880, copperReward: 70, itemRewards: { warrior: 'pass_warden_blade', mage: 'pass_warden_wand', rogue: 'pass_warden_dirk' },
    requiresQuest: 'gw_aldermere', minLevel: 5,
    callbacks: [
      { requiresFlag: 'gw_caravan__callaHanged', text: "Ines: 'Before you speak, there's a story on the road already. A witcher hands the docks a slaver's ledger and a girl hangs for the names in it. Don't deny it; I can see it on you. It only tells me how literal you are willing to be about the law. I'll price every word I ask of you accordingly.'" },
      { requiresFlag: 'gw_caravan__soldOutCalla', text: "Ines: 'You still smell of the ford, of wet gems and other people's bad luck. I won't ask what you carried up out of that water. I'll only note that you carried it, and price my trust to match.'" },
      { requiresFlag: 'gw_caravan__tradeExpands', text: "Ines: 'They say the slaver trade runs louder than ever this season, down a quieter road. Funny, that, right after a witcher burned the only ledger that named it. I'll keep my own counsel about what you bring me.'" },
    ],
    choices: [
      {
        id: 'betray', label: 'Sell her to the rival noble, for the purse and the night.',
        result: "The margrave's rival pays well for a delivered woman and a settled score. Ines doesn't struggle when his men come. She just finds your eyes across the room and holds them once, with an expression you'll be paying off long after the purse is empty. Then she looks away, and never that way again.",
        effect: { copper: 70, setFlags: ['betrayedInes'], reputation: { smallfolk: -2, underworld: 1, ines: -10 } },
      },
      {
        id: 'truth', label: 'Tell the margrave the truth: that she never loved him.',
        result: 'You say the plain thing in the plain light of his solar. He folds in on himself like paper taking flame, and then, very quietly, gives the order that seals the pass: the one door he still controls. Ines walks out free.',
        looming: 'Ines respects you for the honesty and calls you a fool for it to your face, because the pass you needed is shut now behind a heartbroken man with a key and a grudge. Some truths only cost the person telling them.',
        effect: { setFlags: ['inesFreed', 'passClosed'], reputation: { nobility: -1, ines: 5 } },
      },
      {
        id: 'fake', label: 'Fake her death. Let him grieve a beautiful lie.',
        result: 'A sleeping-draught, a closed coffin, and nerve. He weeps the way only the truly fooled can weep, purely, and because grief makes men generous he reopens the pass in her memory. Ines is three valleys away before the flowers wilt.',
        looming: 'A faked grave is a debt with teeth. If the margrave ever lifts that lid, you make an enemy of a man with an army, a reason, and a tender broken heart turned hard.',
        effect: { setFlags: ['inesFreed', 'inesGhost', 'passOpen'], reputation: { underworld: 2, ines: 2 } },
      },
      {
        id: 'frame', label: 'Frame the jealous steward. Make the margrave exile her himself.',
        result: "You plant the letters where they'll be found and let the margrave's own suspicion do the cutting. The steward, sour but innocent this time, is cast out for an affair he never had, and in the noise Ines simply walks free. No one suspects the witcher. No one ever does.",
        looming: 'The steward had a daughter. She will surface an act from now, in a moment when you need a door opened, and she will know your face and remember exactly what it cost her family, and give you nothing.',
        effect: { setFlags: ['inesFreed', 'stewardRuined', 'passOpen'], reputation: { underworld: 2, justice: -2, ines: 1 } },
      },
    ],
  },

  gw_champion: {
    id: 'gw_champion', name: "The People's Champion",
    giverNpcId: 'ortega', turnInNpcId: 'ortega',
    text: "The tournament is the governor's pageant, $N, and I have spent my life rigging this one match. Win it clean: cut down the brawlers in the lists, then put down the Governor's Champion in the winner's bout. What you do from the winner's circle after that will decide whether this city rises or kneels.",
    completionText: "You stand in the winner's circle with the crown in your hands and the crowd drunk on a victory you won. Ortega wants you to throw the laurel down and name the governor's crimes until the city rises. The governor's man wants you to kneel quietly for a captaincy and a keep. Both want the same hour of your life. Only one of them is dying for it.",
    objectives: [
      { type: 'interact', targetObjectItemId: 'betting_ledger', count: 1, label: "Read the marshals' ledger (Witcher Senses)" },
      { type: 'kill', targetMobId: 'tournament_brawler', count: 6, label: 'Tournament Brawler defeated' },
      { type: 'kill', targetMobId: 'tournament_champion', count: 1, label: "Governor's Champion defeated" },
      { type: 'interact', targetObjectItemId: 'governors_writ', count: 1, label: "Read the governor's writ (Witcher Senses)" },
    ],
    xpReward: 1180, copperReward: 80, itemRewards: { warrior: 'champions_warhammer', mage: 'champions_focus', rogue: 'champions_rondel' },
    requiresQuest: 'gw_velvet', minLevel: 7,
    callbacks: [
      { requiresFlag: 'gw_caravan__assassinHunt', text: "Ortega: 'Word before you draw: knife-men have been asking after a witcher. That fence whose docks you emptied keeps a long arm, and a cheering crowd is a fine place to lose a body. Win quick. Mind the gaps in the noise.'" },
      { requiresFlag: 'gw_aldermere__uncleBlackmail', text: "The governor's man greets you by a name you never gave him, smiling like a buyer who already owns the stall. Somewhere a healer's brother has been writing letters. You arrive already known, and already thought biddable." },
      { requiresFlag: 'gw_caravan__tradeExpands', text: 'You came in on a road thick with coffles, the trade you were sure you drowned at the ford, only louder now and unashamed of the daylight. Over all of it the tournament banners hang bright and bored.' },
    ],
    choices: [
      {
        id: 'rig', label: 'Rig it. Poison a rival, bribe the marshals, win risk-free.',
        result: "A little something in a waterskin, a little something in a marshal's palm, and the bracket bends your way like a reed. As they raise your arm, the head marshal gives you a smile that says your secret has at least one more owner than you'd like.",
        looming: 'A rigged win is a rumor with a slow fuse. It will sit quiet for a year, then one drunk marshal in one wrong tavern will light it, and your shining name will curdle into a punchline.',
        effect: { setFlags: ['cheated'], reputation: { underworld: 1, justice: -1, fame: 2 } },
      },
      {
        id: 'captaincy', label: "Win clean. Take the governor's captaincy, title, and keep.",
        result: 'You win honestly, then kneel, and rise a captain with a keep of your own and a tyrant\'s warm hand on your shoulder like a yoke that fits. Ortega watches you do it from the crowd. He doesn\'t curse you. He just stops looking, which is worse.',
        looming: "Leaderless, Ortega's rising is crushed in a single ugly night you spend behind your new walls. In the valleys below, mothers will use your name to mean the man who could have, and instead was paid.",
        effect: { copper: 80, setFlags: ['collaborator', 'ownKeep'], reputation: { nobility: 4, smallfolk: -3, fame: 1 } },
      },
      {
        id: 'revolt', label: 'Win clean. Refuse the laurel. Light the city.',
        result: "You win, and at the apex of the cheering you hurl the crown into the dust and read out the governor's crimes until the cheering changes shape. The square ignites; joy and fury are the same color from a distance. By dark the people are chanting a name. Yours.",
        looming: 'Hundreds die in the rising you sparked; the arithmetic of liberation is never as clean as the speech. And the man you raised up lives just long enough to become exactly the kind of strongman you helped pull down.',
        effect: { setFlags: ['cityBurned', 'liberator'], reputation: { smallfolk: 4, nobility: -4, fame: 4 } },
      },
      {
        id: 'neutral', label: 'Win clean. Keep the laurel. Stay out of all of it.',
        result: 'You fight for yourself and no one else, take the crown and the purse, and ride out before the politics can stick to your boots. Clean hands, full purse, no blood you can name. The governor still governs. Nothing, anywhere, has changed by so much as an inch.',
        looming: 'Because nothing changed, the maimed tax-debtor who shared his last cup with you the night before is hanged on the next market day, on schedule, unremarked. You kept your hands clean. The world stayed as dirty as you left it.',
        effect: { copper: 30, setFlags: ['debtorExecuted'], reputation: { fame: 2 } },
      },
    ],
  },

  gw_mill: {
    id: 'gw_mill', name: 'The Inheritance of Greywater Mill',
    giverNpcId: 'goodwife_sera', turnInNpcId: 'goodwife_sera',
    text: "The deed in your pack calls Greywater Mill derelict. The deed is a liar, $N. We are war-folk; we found this place dead and made it breathe, and it feeds the valley now. But a reclamation company wants to buy your deed, turn us out, and dam the river, drowning three villages downstream. Drive their mercenaries off, and put down the water hag their digging has stirred from the mud.",
    completionText: "The mercenaries are routed and the hag is dead in the reeds. The paper says the mill is yours, stone and stream and all. The bread says it is theirs. The river, which would drown three villages if it were dammed, doesn't care either way. So, Sera asks: what does the witcher say?",
    objectives: [
      { type: 'interact', targetObjectItemId: 'water_survey', count: 1, label: 'Read the reclamation survey (Witcher Senses)' },
      { type: 'kill', targetMobId: 'reclamation_mercenary', count: 6, label: 'Reclamation Mercenary driven off' },
      { type: 'kill', targetMobId: 'greywater_hag', count: 1, label: 'Greywater Water Hag slain' },
      { type: 'interact', targetObjectItemId: 'contested_deed', count: 1, label: 'Examine the contested deed (Witcher Senses)' },
    ],
    xpReward: 1500, copperReward: 120, itemRewards: { warrior: 'millwardens_plate', mage: 'millwardens_drape', rogue: 'millwardens_jerkin' },
    requiresQuest: 'gw_champion', minLevel: 9,
    callbacks: [
      { requiresFlag: 'gw_caravan__callaFreed', text: "You'd know that face anywhere. Calla, alive, her sleeves white with flour, kneading bread in the mill yard as though born to it. She meets your eye and does not say your name. She only nods, once. It is enough. It is, somehow, the whole point of everything since the ford." },
      { requiresFlag: 'gw_champion__collaborator', text: "Goodwife Sera: 'We know what you became up at the keep, witcher, the governor's own captain, rid down here to read poor folk their own deed back to them. Say your piece. We haven't much say in the hearing, have we.'" },
      { requiresFlag: 'gw_champion__cityBurned', text: "Goodwife Sera: 'Half these hands walked in from the city with the smoke still in their hair, the month you set it alight. Some name you a saint. Some can't look at you at all. Most are only hungry, and past caring which you were.'" },
      { requiresFlag: 'gw_velvet__stewardRuined', text: 'A young woman among the refugees watches you the whole while and never once blinks: the steward\'s daughter, turned out of a great house by a letter you forged a valley south. Whatever help she might have been to you here shut like a door the day you signed another man\'s ruin.' },
    ],
    choices: [
      {
        id: 'sell', label: 'Sign the deed to the company, quietly, for the gold.',
        result: "You sign where the registrar points and take the heavy bag before the surveyors arrive with their stakes. You're over the next ridge by the time the shouting starts, and well past the river-bend before it could be anything but shouting. The gold doesn't make a sound. That's what you're paying it for.",
        looming: 'The company dams the river on schedule. Three villages downstream drown in their sleep, and the mill that fed the valley becomes a still pond behind a wall.',
        effect: { copper: 120, setFlags: ['soldMill', 'villagesFlooded'], reputation: { smallfolk: -3 } },
      },
      {
        id: 'evict', label: 'Read out the deed. Evict them. Keep the mill yourself.',
        result: "You read the law aloud in the swept yard, and the law does what it does. They don't fight you; that's the part that stays with you. They gather their children and their two years and file out onto the road in a quiet line, and Sera is the last to go, and she only looks back once, at the wheel still turning.",
        looming: 'You have a home now, and a yard that is always a little too quiet. One of the children you turned out today will grow up around the shape of this morning, and come back to it years from now, as a beggar at your gate or an enemy at your wall. You won\'t know which until they speak.',
        effect: { copper: 20, setFlags: ['ownMill', 'millOfTears'], reputation: { smallfolk: -2 } },
      },
      {
        id: 'commune', label: 'Tear the deed. Give the land to them, free.',
        result: "You tear the deed clean across and put the halves in Sera's flour-dusted hands. For a moment she doesn't understand; then she does, and the yard hears, and the cheer that goes up has your name in it, thrown at the sky like a cap. It's the cleanest you'll feel all year.",
        looming: 'But the deed was the only leash on the river. Thwarted here, the company buys a dam-site downstream and builds anyway; the three villages drown on schedule. Only the owner of Greywater could have fought the water-rights in court, and you gave that owner away to a cheering crowd.',
        effect: { setFlags: ['gaveMill', 'villagesFlooded'], reputation: { smallfolk: 4 } },
      },
      {
        id: 'tenancy', label: 'Keep the deed. Let them stay as tenants, under your roof and law.',
        result: 'You strike the hard middle bargain in front of everyone: the home stays theirs to work, the deed stays yours to defend, the river stays undammed because its owner says so. It is not a cheer and it is not a curse. It is a handshake, and a weight, and the particular loneliness of being the one who decides.',
        looming: "You kept both the people and the power to protect them, and made yourself the thing the company now has to remove. They won't send lawyers next time. They'll send men in the dark, and you will never quite be finished with this place.",
        effect: { setFlags: ['ownMill', 'protectRefugees'], reputation: { smallfolk: 2 } },
      },
    ],
  },

  // Branch follow-up: opens only if you handed the manifest to the law at the ford
  // (flag gw_caravan__callaHanged). Run back to town, open the jailhouse chest, claim
  // the witcher's fee from Magistrate Holt.
  gw_jail_chest: {
    id: 'gw_jail_chest', name: "The Magistrate's Fee",
    giverNpcId: 'magistrate_holt', turnInNpcId: 'magistrate_holt',
    text: "The law pays its debts, witcher. The strongbox you brought emptied a slaver ring into my cells, and the crown's bounty on them is yours. Open the chest in the jailhouse yard and take a confiscated blade for your trouble.",
    completionText: 'A fair blade, taken off a man who will not miss it. The trade is broken in Eastbrook, $N, and the law remembers who broke it.',
    objectives: [{ type: 'collect', itemId: 'jail_chest', count: 1, label: 'Jailhouse chest opened' }],
    xpReward: 380, copperReward: 200,
    itemRewards: { warrior: 'gallows_iron_blade', mage: 'gallows_iron_rod', rogue: 'gallows_iron_dirk' },
    requiresFlag: 'gw_caravan__callaHanged',
  },
};

export const GREYWATER_QUEST_ORDER = [
  'gw_caravan', 'gw_aldermere', 'gw_velvet', 'gw_champion', 'gw_mill', 'gw_jail_chest',
];

// ---------------------------------------------------------------------------
// Spawn camps - strung north up the western corridor (appended last in data.ts
// so the existing world's deterministic spawn RNG draw order is preserved).
// ---------------------------------------------------------------------------

// A road runs the length of the valley, from the ford in the south up to Greywater
// Mill in the north, threading past each quest giver. Lazy camps spawn their mobs
// clear of it (see spawnCamp's road-avoidance), so the player can walk the road in
// peace and choose when to wade into the monsters off to either side.
export const GREYWATER_ROADS: { x: number; z: number }[][] = [
  // Connector: from Eastbrook out east, through the pass notch (z~2.5), into the valley.
  [{ x: 10, z: 0 }, { x: 55, z: 2 }, { x: 100, z: 2 }, { x: 110, z: 2.5 }, { x: 124, z: 3 }, { x: 140, z: 4 }],
  // The spine: south ford up to the northern mill, threading every quest giver.
  [
    { x: 148, z: -150 }, // the ford (Calla)
    { x: 144, z: -100 },
    { x: 140, z: -60 },  // the Drowned Fen / Aldermere (Reeve Ondrin)
    { x: 146, z: -28 },
    { x: 150, z: 4 },    // the pass / Ines's cage
    { x: 144, z: 50 },
    { x: 140, z: 92 },   // the village / tournament approach (Ortega)
    { x: 136, z: 128 },
    { x: 134, z: 158 },  // Greywater Mill (Goodwife Sera)
  ],
  // Switchback spur up the eastern Rise to the margrave's manor (the Velvet Debt seat).
  [{ x: 146, z: 50 }, { x: 154, z: 55 }, { x: 160, z: 60 }, { x: 163, z: 62 }],
  // Short spur off the spine to the tournament ground below the manor.
  [{ x: 140, z: 96 }, { x: 145, z: 102 }, { x: 148, z: 105 }],
];

// All lazy: the valley spawns only when a player walks into it, so adding this region
// never perturbs the shared world-gen / AI RNG stream elsewhere. Camps are placed by
// ECOLOGY: a witcher reads the fight off the land. Drowners and the hag own the carved
// water; bog ghouls the deep fen; nekkers the scree shoulders at the wall feet; the
// margrave's guard the manor rise; the leshen its grove off the spine. Difficulty climbs
// south-to-north and with distance from the road.
export const GREYWATER_CAMPS: CampDef[] = [
  // The Ford & drowned caravan: mudlarks picking the wreck, drowners in the pool/shallows.
  { mobId: 'river_mudlark', center: { x: 146, z: -146 }, radius: 8, count: 5, lazy: true },
  { mobId: 'greywater_drowner', center: { x: 143, z: -140 }, radius: 12, count: 7, lazy: true }, // the ford pool
  { mobId: 'greywater_drowner', center: { x: 138, z: -108 }, radius: 14, count: 6, lazy: true }, // marsh shallows
  // The Drowned Fen: bog ghouls crept up from the deep water.
  { mobId: 'bog_ghoul', center: { x: 128, z: -64 }, radius: 15, count: 7, lazy: true },
  { mobId: 'bog_ghoul', center: { x: 134, z: -28 }, radius: 12, count: 5, lazy: true },
  // Nekker warrens on the scree shoulders: the western wall foot and the eastern rise.
  { mobId: 'valley_nekker', center: { x: 120, z: 74 }, radius: 14, count: 8, lazy: true },
  { mobId: 'valley_nekker', center: { x: 160, z: 2 }, radius: 13, count: 7, lazy: true },
  // The pass: the margrave's guard keeping Ines caged; more on the manor rise above.
  { mobId: 'margrave_guard', center: { x: 152, z: 10 }, radius: 10, count: 5, lazy: true },
  { mobId: 'margrave_guard', center: { x: 159, z: 54 }, radius: 13, count: 7, lazy: true },
  // The Tournament Ground: brawlers in the lists, the champion in the winner's bout.
  { mobId: 'tournament_brawler', center: { x: 148, z: 104 }, radius: 13, count: 7, lazy: true },
  { mobId: 'tournament_champion', center: { x: 151, z: 112 }, radius: 4, count: 1, lazy: true },
  // The Mill: reclamation mercenaries, and the water hag stirred from the millpond.
  { mobId: 'reclamation_mercenary', center: { x: 138, z: 150 }, radius: 13, count: 7, lazy: true },
  { mobId: 'greywater_hag', center: { x: 150, z: 136 }, radius: 5, count: 1, lazy: true }, // the millpond / hag's pool
  // The Leshen Grove: the valley's apex predator, off the spine on the southern rise.
  { mobId: 'valley_leshen', center: { x: 168, z: -30 }, radius: 5, count: 1, lazy: true },
];

// ---------------------------------------------------------------------------
// Ground objects - the strongbox in the drowned cave, and the girl's shawl
// ---------------------------------------------------------------------------

// Greywater dressing, district by district. Each quest giver stands on a self-describing
// micro-set (Calla's wrecked wagon, Ondrin's inspection table, Ortega's tournament ring,
// Sera's mill, the manor over the rise) so a player reads the fiction before a word. Solid
// props (buildings/fences/wells/stalls/mines/docks/ruinRings/carts) are kept off the spine
// road and clear of the NPCs; tents/crates/campfires/graveyards are soft dressing.
export const GREYWATER_PROPS: ZonePropsDef = {
  buildings: [
    // Greywater Village (the floor): mean houses flanking the muddy lane.
    { kind: 'house', x: 150, z: 46, w: 6, d: 5, rot: -0.3 },
    { kind: 'house', x: 130, z: 54, w: 6, d: 5, rot: 0.4 },
    { kind: 'house', x: 150, z: 74, w: 5, d: 5, rot: 0.8 },
    { kind: 'house', x: 129, z: 82, w: 6, d: 5, rot: -0.5 },
    // The margrave's manor on the eastern Rise (the Velvet Debt seat), over the valley.
    { kind: 'inn', x: 165, z: 62, w: 7, d: 6, rot: 0.3 },
    { kind: 'chapel', x: 159, z: 68, w: 5, d: 6, rot: -0.6 },
    // Greywater Mill (the wheel-house over the millpond).
    { kind: 'house', x: 136, z: 150, w: 5, d: 5, rot: 0.5 },
  ],
  wells: [{ x: 139, z: 60, r: 1.5 }],
  stalls: [
    { x: 136, z: 64, rot: -2.7, r: 1.7 }, // village market
    { x: 144, z: 56, rot: 1.5, r: 1.7 },
    { x: 136, z: -57, rot: 1.0, r: 1.7 }, // Reeve Ondrin's inspection table (the shawl)
    { x: 142, z: 102, rot: 0.6, r: 1.7 }, // tournament betting stall
  ],
  mines: [
    { x: 120, z: 80, rot: 0.8 }, // nekker warren mouth, western scree
    { x: 162, z: 2, rot: 2.2 },  // nekker warren mouth, eastern rise
  ],
  docks: [
    { x: 147, z: 140, rot: -1.2, hutLocal: { x: 2.5, z: 2.2, hw: 1.6, hd: 1.4 } }, // millpond waterside
  ],
  tents: [
    { x: 143, z: -151, rot: 0.7, scale: 1.0 }, // Calla's camp at the ford
    { x: 102, z: -7, rot: 0.5, scale: 1.0 },   // pass guardpost
    { x: 143, z: -63, rot: 2.0, scale: 1.0 },  // Reeve Ondrin's tent
    { x: 153, z: 107, rot: -0.8, scale: 1.2 }, // tournament pavilion
  ],
  crates: [
    [150, -147], [148, -151], [142, -145], // ford cargo
    [135, 153], [139, 147],                // mill grain sacks
    [141, 108],                            // tournament
  ],
  campfires: [
    [145, -150], [104, -5], [141, -62], [139, 50], [161, 58], [138, 152],
  ],
  mudHuts: [[131, 44], [148, 66]],
  ruinRings: [
    { x: 106, z: 2, ringR: 5, columns: 6 },  // the ruined pass gate-arch
    { x: 130, z: -42, ringR: 3, columns: 4 }, // a sunken fen shrine
    { x: 167, z: -30, ringR: 6, columns: 7 }, // the leshen grove's standing stones
  ],
  fences: [
    { x1: 106, z1: 7, x2: 106, z2: 12 },   // pass gate flank (north of the notch)
    { x1: 106, z1: -3, x2: 106, z2: -8 },  // pass gate flank (south of the notch)
    { x1: 156, z1: 56, x2: 168, z2: 56 },  // manor wall
    { x1: 168, z1: 56, x2: 168, z2: 70 },  // manor wall
    { x1: 144, z1: 100, x2: 152, z2: 100 }, // tournament ring
    { x1: 152, z1: 100, x2: 152, z2: 110 },
    { x1: 152, z1: 110, x2: 144, z2: 110 },
    { x1: 144, z1: 110, x2: 144, z2: 100 },
  ],
  graveyards: [
    { x: 103, z: 9 },   // the gibbet at the gate
    { x: 126, z: -50 }, // fen offerings to the drowned
    { x: 170, z: -27 }, // animal skulls in the leshen grove
    { x: 167, z: 66 },  // the manor's private plot
  ],
  carts: [
    { x: 149, z: -149, rot: 1.2, scale: 1.4 }, // Calla's wagon on the verge
    { x: 141, z: -141, rot: 2.4, scale: 1.3 }, // the drowned caravan half-sunk in the ford pool
  ],
};

export const GREYWATER_OBJECTS: GroundObjectDef[] = [
  // --- collect objects (recovered into the pack) ---
  {
    itemId: 'slaver_strongbox',
    name: "Slaver's Strongbox",
    // On the dry road causeway right beside Calla (in addition to the drowner drop),
    // so it is trivially findable while testing.
    positions: [{ x: 147, z: -146 }, { x: 145, z: -143 }, { x: 149, z: -148 }],
  },
  {
    itemId: 'girls_shawl',
    name: "The Girl's Shawl",
    positions: [{ x: 139, z: -57 }, { x: 137, z: -56 }],
  },
  {
    itemId: 'jail_chest',
    name: 'Jailhouse Chest',
    positions: [{ x: 17, z: 9 }, { x: 16, z: 11 }], // in the Eastbrook jail yard by Magistrate Holt
  },

  // --- witcher-senses clue objects (examined in place; each speaks a monologue) ---
  {
    itemId: 'caravan_wreck', name: 'The Wrecked Wagon',
    positions: [{ x: 141, z: -141 }, { x: 143, z: -144 }],
    examine: [
      'Hm. The wagon went off the ford sideways, not forward.',
      "It didn't lose the road in the current. The wheels were turned.",
      'Someone drove it under on purpose.',
    ],
  },
  {
    itemId: 'slaver_manifest', name: "The Slaver's Manifest",
    positions: [{ x: 146, z: -145 }, { x: 148, z: -147 }],
    examine: [
      'Not a ledger of goods. A tally of people, counted by the head.',
      "And halfway down, in a child's hand...",
      "Calla's own name.",
    ],
  },
  {
    itemId: 'gallows_yard', name: 'The Gallows-Yard',
    positions: [{ x: 139, z: -59 }, { x: 141, z: -61 }],
    examine: [
      'The drifter reeks of river-mud and fear. Nothing else.',
      "A child-killer's hands carry more than that. Blood. Lye. Something.",
      "Whoever did this, it wasn't the man they've built the rope for.",
    ],
  },
  {
    itemId: 'healers_herbs', name: 'The Shawl Examined',
    positions: [{ x: 137, z: -57 }, { x: 138, z: -55 }],
    examine: [
      'Under the mud the shawl carries another scent. Bitter. Crushed.',
      'Wolfsbane and feverfew, ground fine. A healer keeps these.',
      'Her uncle keeps these.',
    ],
  },
  {
    itemId: 'margrave_solar', name: "The Margrave's Solar",
    positions: [{ x: 150, z: 7 }, { x: 152, z: 6 }],
    examine: [
      'Her portrait hangs on three walls of this one room.',
      'This is not a jailer. This is a man who mistook a cage for an embrace.',
    ],
  },
  {
    itemId: 'love_letters', name: 'The Unsent Letters',
    positions: [{ x: 152, z: 5 }, { x: 149, z: 6 }],
    examine: [
      'Letters. Dozens. All written, none sent.',
      'He is not cruel. He is lonely, and patient, and he holds the only key.',
      'That is the harder kind of man to fight.',
    ],
  },
  {
    itemId: 'betting_ledger', name: "The Marshals' Ledger",
    positions: [{ x: 142, z: 101 }, { x: 144, z: 103 }],
    examine: [
      'The brackets are inked before a single blow is struck.',
      'Every bout bought, every fall priced.',
      'The crowd will cheer a thing they have already paid to lose.',
    ],
  },
  {
    itemId: 'governors_writ', name: "The Governor's Writ",
    positions: [{ x: 146, z: 103 }, { x: 145, z: 106 }],
    examine: [
      'A captaincy. A keep. A pension.',
      'A leash, dressed up as an honor.',
      'The governor does not want a champion. He wants a quiet one.',
    ],
  },
  {
    itemId: 'water_survey', name: 'The Reclamation Survey',
    positions: [{ x: 141, z: 147 }, { x: 143, z: 149 }],
    examine: [
      'Survey stakes. Sight-lines. A dam-wall drawn across the race in red.',
      'Dam it here and three villages downstream drown in their sleep.',
      "They know. It's written in the margins, and they staked it anyway.",
    ],
  },
  {
    itemId: 'contested_deed', name: 'The Contested Deed',
    positions: [{ x: 143, z: 145 }, { x: 145, z: 147 }],
    examine: [
      'The deed calls this mill derelict. The turning wheel says otherwise.',
      'Paper and bread, telling two different truths over the same stones.',
    ],
  },
];

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export const GREYWATER_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  slaver_strongbox: { id: 'slaver_strongbox', name: "Slaver's Strongbox", kind: 'quest', sellValue: 0, questId: 'gw_caravan' },
  girls_shawl: { id: 'girls_shawl', name: "The Girl's Shawl", kind: 'quest', sellValue: 0, questId: 'gw_aldermere' },
  wolfsbane_sprig: { id: 'wolfsbane_sprig', name: 'Wolfsbane Sprig', kind: 'quest', sellValue: 0, questId: 'gw_velvet' },
  champions_laurel: { id: 'champions_laurel', name: "Champion's Laurel", kind: 'quest', sellValue: 0, questId: 'gw_champion' },
  jail_chest: { id: 'jail_chest', name: 'Jailhouse Chest', kind: 'quest', sellValue: 0, questId: 'gw_jail_chest' },

  // --- quest reward gear (uncommon) ---
  witchers_oilcloak: {
    id: 'witchers_oilcloak', name: "Witcher's Oilcloak", kind: 'armor', slot: 'chest', quality: 'uncommon',
    stats: { armor: 40, sta: 2, agi: 2 }, sellValue: 240,
  },
  pass_warden_blade: {
    id: 'pass_warden_blade', name: 'Pass-Warden Blade', kind: 'weapon', slot: 'mainhand', quality: 'uncommon',
    weapon: { min: 9, max: 16, speed: 2.3 }, stats: { str: 3, sta: 1 }, sellValue: 320, requiredClass: WAR,
  },
  pass_warden_wand: {
    id: 'pass_warden_wand', name: 'Pass-Warden Wand', kind: 'weapon', slot: 'mainhand', quality: 'uncommon',
    weapon: { min: 10, max: 18, speed: 2.8 }, stats: { int: 4, spi: 1 }, sellValue: 320, requiredClass: MAG,
  },
  pass_warden_dirk: {
    id: 'pass_warden_dirk', name: 'Pass-Warden Dirk', kind: 'weapon', slot: 'mainhand', quality: 'uncommon',
    weapon: { min: 6, max: 11, speed: 1.7, dagger: true }, stats: { agi: 4 }, sellValue: 320, requiredClass: ROG,
  },
  champions_warhammer: {
    id: 'champions_warhammer', name: "Champion's Warhammer", kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 16, max: 26, speed: 2.6 }, stats: { str: 6, sta: 3 }, sellValue: 900, requiredClass: WAR,
  },
  champions_focus: {
    id: 'champions_focus', name: "Champion's Focus", kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 17, max: 29, speed: 3.0 }, stats: { int: 7, spi: 3 }, sellValue: 900, requiredClass: MAG,
  },
  champions_rondel: {
    id: 'champions_rondel', name: "Champion's Rondel", kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 11, max: 18, speed: 1.7, dagger: true }, stats: { agi: 7, sta: 2 }, sellValue: 900, requiredClass: ROG,
  },
  millwardens_plate: {
    id: 'millwardens_plate', name: "Millwarden's Plate", kind: 'armor', slot: 'chest', quality: 'rare',
    stats: { armor: 140, sta: 6, str: 3 }, sellValue: 1100, requiredClass: WAR,
  },
  millwardens_drape: {
    id: 'millwardens_drape', name: "Millwarden's Drape", kind: 'armor', slot: 'chest', quality: 'rare',
    stats: { armor: 55, int: 8, spi: 4 }, sellValue: 1100, requiredClass: MAG,
  },
  millwardens_jerkin: {
    id: 'millwardens_jerkin', name: "Millwarden's Jerkin", kind: 'armor', slot: 'chest', quality: 'rare',
    stats: { armor: 95, agi: 7, sta: 3 }, sellValue: 1100, requiredClass: ROG,
  },

  // --- per-choice rewards for The Drowned Caravan ---
  // Magistrate path: the special weapon from the jail chest he opens for you.
  gallows_iron_blade: {
    id: 'gallows_iron_blade', name: 'Gallows-Iron Blade', kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 12, max: 20, speed: 2.4 }, stats: { str: 4, sta: 2 }, sellValue: 600, requiredClass: WAR,
  },
  gallows_iron_rod: {
    id: 'gallows_iron_rod', name: 'Gallows-Iron Rod', kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 13, max: 22, speed: 2.9 }, stats: { int: 5, spi: 2 }, sellValue: 600, requiredClass: MAG,
  },
  gallows_iron_dirk: {
    id: 'gallows_iron_dirk', name: 'Gallows-Iron Dirk', kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 8, max: 14, speed: 1.7, dagger: true }, stats: { agi: 5 }, sellValue: 600, requiredClass: ROG,
  },
  // Free-Calla path: her parting gift, a witcher's healing draught.
  callas_parting_gift: {
    id: 'callas_parting_gift', name: "Calla's Parting Gift", kind: 'potion', quality: 'uncommon',
    potionHp: 220, sellValue: 40,
  },
  // Looter path: a cut gem, pure coin.
  looted_gemstone: { id: 'looted_gemstone', name: 'Looted Gemstone', kind: 'junk', quality: 'uncommon', sellValue: 120 },

  // --- junk / alchemy trophies (gray) ---
  drowner_brain: { id: 'drowner_brain', name: 'Drowner Brain', kind: 'junk', quality: 'poor', sellValue: 12 },
  ghoul_blood: { id: 'ghoul_blood', name: 'Ghoul Blood', kind: 'junk', quality: 'poor', sellValue: 14 },
  nekker_claw: { id: 'nekker_claw', name: 'Nekker Claw', kind: 'junk', quality: 'poor', sellValue: 14 },
  gilded_braid: { id: 'gilded_braid', name: 'Gilded Braid', kind: 'junk', quality: 'poor', sellValue: 20 },
  splintered_lance: { id: 'splintered_lance', name: 'Splintered Lance', kind: 'junk', quality: 'poor', sellValue: 16 },
  survey_stake: { id: 'survey_stake', name: 'Survey Stake', kind: 'junk', quality: 'poor', sellValue: 16 },
  hag_tooth_charm: { id: 'hag_tooth_charm', name: 'Hag-Tooth Charm', kind: 'junk', quality: 'poor', sellValue: 30 },
  leshen_carving: { id: 'leshen_carving', name: 'Leshen Carving', kind: 'junk', quality: 'poor', sellValue: 28 },
};
