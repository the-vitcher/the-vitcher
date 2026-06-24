# Greywater: The Fallout Edit

A quest-design brief. Tone: New Reno by way of the Bog. Read it in Ron Perlman's voice.
Companion to `greywater-level-brief.md` (geography) and `greywater-quest-brief.md` (the
straight version). This is the amoral, Fallout-2 rewrite: dark humor, cartoon violence, and
extreme freedom of choice, where every choice is actually played out in the world.

> Status: design only. No quest content or engine code ships from this doc; it specifies a
> future build. The one structural dependency it assumes (a much larger Greywater region with
> room for every environment below) is being built separately.

## 0. The pitch
Same valley, same five givers, same drowned trade road. But the camera pulls back from the
tragedy and starts laughing at it. Greywater is a place where every catastrophe has a price
tag, every saint has a side hustle, and the witcher is less a brooding monster-slayer than a
heavily armed problem the locals can point at things. You can solve any quest six ways: three
appalling, two hilarious, and one by simply killing the person who asked. The game never
tells you that you are a bad person. It writes it down, gives you a title, and has the next
NPC mention it.

## 1. The five tonal laws (apply to every line)
1. Whiplash, not weight. Set up bleak, pay off funny. A child is dead (bleak); the town is
   mostly upset because the gallows were expensive and they want their money's worth (funny).
2. Amoral, never preachy. The narrator does not editorialize. Slavery, murder, and fraud are
   presented with the same flat cheer as a fetch quest. Judgment is the world's job
   (reputation plus NPC reactions), never the prose's.
3. Reactivity is the punchline. Every choice gets a "slide": a deadpan, specific
   ending-card line about what your cleverness actually did, usually worse than you intended.
4. Violence is an option and a comedy beat. Death is gory and dryly narrated ("the reeve
   discovers he is not, in fact, bulletproof"). It is always a solution, never the solution.
5. Crude is fine, cruel is the point, but it has to be funny. Full edge: chems, the
   comfort-house, organ math, slaver humor. If a line is just nasty without a joke, cut it.

## 2. The freedom engine: a wide-open buffet (no class gates)
Freedom is breadth, not build. Every quest fans out into 6 or more solutions, and every one
is available to every character. Class never gates a choice. A witcher is a witcher: steel,
signs, alchemy, and guile are all on the table for everyone, so the warrior can pick the
lock, the mage can break the jaw, the priest can raise the dead, if that is the play they
want. The only gate is your past (Section 5): a flag you set or a reputation you earned can
unlock extra options (your fence only deals with you once you are already dirty), but nothing
is ever locked behind your School.

Mechanically (future build, not this doc): raise the choice cap from 4 to 6 and extend
`QuestChoice` (`src/sim/types.ts`) with only `requiresFlag?` and `requiresRep?: {faction,
min}` for past-deed unlocks. No `requiresClass`. The HUD shows the full fan in
`renderQuestDetail` (`hud.ts`) via `src/ui/quest_choices.ts`.

The witcher's toolkit (flavor on the solutions, open to all, never a lock): Steel/Brute
(intimidate, break the furniture, kill the problem), Signs/Arcana (Axii a witness, polymorph
someone into a sheep, conjure a fraud), Necromancy (raise the dead to testify), Alchemy/Chems
(poison a bracket, brew a draught that makes a man briefly and ruinously honest), Guile/
Larceny (steal it, fence it, sell it twice, forge the paper), Tracking/Traps (find the real
culprit, set the ambush), Doctoring (last rites, creative autopsies, organ resale).

## 2b. Every choice is PLAYED, then every consequence is SEEN (the load-bearing rule)
This is the difference between a menu and a quest, and it has two halves. Both are mandatory;
neither alone is enough.

**Half one: the deed is played, not narrated.** A choice does not resolve in a text box at
turn-in. It commits you to a deed, and that deed becomes a short follow-through stage you
actually go and do, somewhere real, against actual opposition. If you raise a corpse to
testify, you escort it across the valley to the Eastbrook court and trigger the testimony
there (and the slavers try to stop you on the road). If you fence the manifest, you carry it
to the slaver camp and hand it to the fence in person (and find out whether they pay or just
take it).

**Half two: the consequence is physical, not imagined.** A slide is a caption ON a world
change you can walk to and witness, never a substitute for one. The narrator may only describe
what the simulation actually did. If the slide says Calla opened an operation two valleys over,
then Calla's NPC is physically gone from the ford and physically present at that operation,
reachable, doing it. If the slide says three families never learn what happened, then three
grieving relatives physically spawn and search the riverbank. If the slide says the town
develops a waiting list for hangings, then the gallows POI gets a queue of NPCs and a posted
list object you can read. Nothing important happens off-camera. The acceptance test for every
line of consequence prose: can the player travel somewhere and see the thing the line claims?
If not, the line does not ship until the world change that backs it does.

Engine pattern (already proven by `gw_jail_chest` in `greywater.ts`): the choice sets a flag;
the flag unlocks a **follow-up quest** with real `objectives` (travel implied by a distant
giver/object, plus `kill` / `collect` / `interact` beats); that follow-up's completion both (a)
fires the slide and the reputation/flag deltas AND (b) commits the **physical world delta** the
slide describes: spawn/move/despawn the named NPCs, swap the POI state, drop the object, set the
nameplate. So every consequential choice ships as a tiny 1-to-3 objective epilogue quest whose
completion visibly rearranges the map, not a paragraph. This is why the region must be big
(Section 8): each deed and each of its aftermaths needs its own place on the map.

Worked examples, deed plus the world delta it commits:
- Raise the drowned slave (Caravan): escort the risen witness to the Eastbrook court object;
  `interact court_dock`; fight the fence's knives who come to silence it; testimony fires. World
  delta: the slaver captain NPC is moved into the jail cell POI and stays there; the witness
  corpse remains slumped at the dock as a permanent fixture you walk past later.
- Fence the manifest (Caravan): travel to the **Slaver Camp** POI (new), `interact` the fence
  NPC to complete the sale; optional ambush if your underworld rep is low. World delta: Calla's
  NPC despawns from the ford and respawns in the camp's pen as a captive you can later find.
- Animate the margrave (Velvet): drag the corpse to the pass gatehouse, `interact seal_stone`
  to sign the road open; the notary flees. World delta: the gate POI flips to open and stays
  open (caravan NPCs now traverse the pass); the notary NPC despawns from his desk for good.
- Poison the bracket (Champion): `collect` three doses from the chem-dealer, `interact` each
  rival's waterskin in the staging tents before the bout. World delta: the three rival NPCs
  drop to a sickened state at the lists and are replaced by you in the winner's circle POI.
- Triple-sell the deed (Mill): visit all three downstream **village** POIs (new), `interact`
  each registrar to sell the same deed; race the rising water. World delta: all three villages
  flood (POI state flips to drowned, NPCs relocate to rooftops) while three deed objects with
  your mark sit in three registrars' hands.

## 3. New amoral systems and the places they need
Each is a real location the expanded region must hold (Section 8 sizes the map for them).
- Chems. A bog hedge-alchemist at a still cooks a Jet-analog ("Bog-Breath") and a truth-serum;
  any character can buy and use them in quests. Mildly addictive as a gag; the dealer is his
  own best customer. Place: the Still, a shack off the marsh.
- The Comfort-House. A bog brothel-tavern, the valley's real information broker. Quests route
  gossip through it. Jokes, not explicit content: the madame out-negotiates everyone; the
  "entertainment" is mostly very tired people who would rather be fishing. Place: a stilt-
  house over the water.
- The Slaver Camp. The ring is a faction you can join; the manifest is a business card. Side
  with them and later quests open a "sell them all" option and a branding-iron title. Place:
  a stockade in the far fen.
- Fixed fights and gambling. The tournament becomes a bookmaking operation: bet, fix, throw,
  or poison. Place: the existing tournament ground plus a bookmakers' row.
- The Organ Market. The doctoring path quietly monetizes the dead; the math is always darkly
  favorable. Place: a back room at the Comfort-House.
- The Eastbrook court. Where testimony, writs, and the law actually happen. Place: extend the
  existing magistrate/jail set in town.
- Karmic titles (later tier). Reputation thresholds grant titles on the nameplate: Butcher of
  Greywater, Slaver's Friend, The People's Dog, Mill-Baron, Childkiller. Reuse the existing
  `reputation` map.

## 4. The quests (theme, the played-out buffet, the slides)
Each keeps its id, giver, and a 4-choice spine, then fans out into 6 or more solutions, all
open to every class, each with its real follow-through stage, plus a literal kill-the-giver
path. Every option names its flag(s), reputation deltas, and slide.

### 4.1 The Drowned Caravan (Calla): "Everyone's Selling Something"
Theme: complicity, except now it is a market and you set the price.
- Spine (kept, re-voiced): looters / give-Calla / magistrate / burn.
- Fence it (guile). Travel to the Slaver Camp, hand the manifest to the fence for double; tip
  them to Calla as a loose end. Slide: "The ring sends a fruit basket. The fruit is a
  metaphor. Calla is the fruit." Played out: Calla's NPC despawns from the ford and reappears,
  branded, in the camp's slave pen, where you can later find her; a literal fruit basket object
  spawns at your homestead. Flag `caravan__fenced`, plus underworld.
- Star witness (necromancy). Raise a drowned slave and escort it to the Eastbrook court to
  testify; the fence's knives ambush you on the road. It works perfectly, which everyone finds
  more disturbing than the slavery. Played out: the slaver captain NPC is moved into the
  Eastbrook jail cell and stays there; the risen witness remains slumped at the court dock as a
  permanent fixture. Flag `caravan__witness`, plus justice.
- Honest hour (alchemy). Buy truth-serum at the Still, dose the slaver captain at the
  Comfort-House; he confesses to a tax auditor by mistake. Played out: the tax auditor NPC
  physically stands the captain up and walks him to the jail in front of you; his stall in the
  market goes dark. Funniest non-violent win.
- Take Calla into your keeping (companion). She has nowhere to go and you have a roof. Set her
  up at a homestead you can return to; over later visits it warms into a romance. The intimacy
  is handled the way mature RPGs do, fade to black at the threshold, never on the page; what
  the doc specifies is the beat and its consequences, not a scene. The valley has opinions:
  to some you saved a drowning woman, to others you bought one, and the game lets both be
  true. Flag `caravan__calla_kept`; later quests have Calla waiting at the homestead with a
  line about what you have become. Plays out in the world: a Homestead POI, a recurring
  companion NPC physically standing at the hearth, a visit interaction. Reputation: small
  smallfolk gain, a wry underworld smirk; the comfort-house madame charges you extra now, on
  principle.
- Kill-path: drown the mudlarks because they were rude. Played out: three mudlark NPCs die and
  float in the ford shallows, and three grieving relatives spawn and pace the riverbank
  searching for them, indefinitely. Slide: "Three families never learn what happened. The river
  is discreet." Plus underworld, the gemstones, Butcher progress.
- Kill the giver. Cut Calla down and loot the strongbox off her body. She respawns by the time
  the blood dries, but your log remembers and so does the valley. Played out: the witness corpse
  the manifest needed is gone from the dock for good, so the court POI's testimony hook is dead;
  Calla respawns at the ford but now turns her back when you approach. Plus underworld, minus
  smallfolk, Butcher.
- Crude slide (give-Calla): "Turns out the only thing she lacked was capital." Played out: Calla
  despawns from the ford and a new Calla's-Operation POI opens at the eastern edge of the
  region, where her NPC physically runs it and greets you as a competitor; the manifest object
  is gone from the world.

### 4.2 An Eye for Aldermere (Reeve Ondrin): "The Town That Loved Hanging"
Theme: justice versus mercy, as a town with a new favorite hobby.
- Spine (kept): bless / name-the-uncle / free-Hask / defer-to-judge.
- Creative autopsy (doctoring). Examine the corpse at the gallows, then carry your "findings"
  to the reeve to frame literally anyone; he signs whatever you say. Travel + two interacts.
  Played out: the framed NPC is dragged from their home to the gallows cage and stays there; the
  real culprit walks free past you in the square.
- Redirect the mob (signs). Axii the crowd into hanging the reeve instead. He does not see the
  irony coming, which is the point. Played out: the reeve NPC is hauled onto the scaffold and
  hangs there as a fixture; the crowd NPCs reorient to cheer it.
- Sell the alibi (guile). Track the uncle to his cottage, sell him a clean story; coin, plus
  underworld, and a healer who now owes you. Slide: "He poisons three more relatives, relaxed
  and well-defended." Played out: the uncle's cottage POI gains three fresh grave-mounds in the
  yard and two new hired guards at the door; a holiday-card object arrives at your homestead.
- Kill-path: settle it with steel in the yard. Played out: the accused NPC walks free and the
  reeve posts a bounty board at the gallows listing you for next week's hanging, which the
  budget no longer covers. The town is briefly appalled, then asks if you are available.
- Kill the giver. Drop Reeve Ondrin and take the writ off his corpse; he is back at his post in
  ten seconds, paler and more agreeable. Played out: with no reeve to call it, the gallows trap
  drops on its own schedule and the accused hangs unattended; the crowd disperses and does not
  re-gather while you are present.
- Slide (bless): "The town discovers it enjoys this. By autumn there is a waiting list." Played
  out: the gallows POI gains a standing queue of condemned NPCs and a posted waiting-list object
  you can read, names and all.

### 4.3 The Velvet Debt (Ines): "A Marriage of Inconvenience"
Theme: love as ownership, escalated to a hostage farce.
- Spine (kept): betray / truth / fake-death / frame-steward.
- Sign here (necromancy). Kill the lovesick margrave, drag him to the gatehouse, animate him
  long enough to sign the road open, let him lie back down. Slide: "The clerk who notarized a
  corpse retires to drink." Played out: the gate POI flips open and caravan NPCs start
  traversing the pass; the margrave's corpse lies permanently at the seal-stone; the clerk NPC
  relocates from his desk to a stool at the Comfort-House bar for good.
- Double sale (guile). Sell both Ines and the margrave to his rival, separately, at full
  price. Played out: Ines and the margrave NPCs both despawn and reappear at the rival's manor
  POI, placed at the same dinner table, where you can return to find the standoff frozen in
  progress.
- Sheep (signs). Polymorph the margrave at the negotiation. Played out: a sheep NPC now wanders
  the margrave's hall where he stood, permanently; the pass opens because nobody is left to keep
  it shut. Ines is impressed and slightly afraid of you.
- Kill-path: cut the lock, cut the guards, cut the conversation short. Played out: the gate
  guards lie dead at the gatehouse and the gate POI flips open; the lock object is gone.
- Kill the giver. Kill Ines herself and take the toll-token off her. Played out: the debt's
  quest hook goes dead and the toll-gate POI stays shut for good; Ines respawns at her manor but
  turns cold and will not re-offer the quest. The one NPC who would have vouched for you no
  longer will.
- Slide (any "freed" path): "She sends regards from a third valley you have never heard of."
  Played out: Ines despawns from the manor and a single regards-letter object arrives at your
  homestead; the manor POI is left to the warring suitors' guards, who now skirmish there
  whenever you pass.

### 4.4 The People's Champion (Ortega): "Throwing the Fight"
Theme: power versus principle, as a sports-betting scandal.
- Spine (kept): rig / captaincy / revolt / neutral.
- Poison the bracket (alchemy). Collect three doses at the Still, dose each rival's waterskin
  in the staging tents. Played out: the three rival NPCs drop to a sickened, doubled-over state
  at the lists and stay benched; you are physically placed in the winner's-circle POI with the
  laurel.
- Throw it (guile). Take the bookmakers' purse to lose convincingly. Slide: "More famous for
  losing than most are for winning." Played out: the winner NPC takes the laurel, the bookmakers'
  row POI fills with cheering bettors, and a commemorative loser's-effigy object is raised at the
  tournament ground that NPCs gather around.
- Double-agent. Lead the revolt and sell its plans to the governor; carry the plans to the
  keep yourself. Played out: two statue objects of you are erected, one in the rebel camp POI and
  one in the keep courtyard POI, physically facing away from each other; the revolt's leader NPCs
  are arrested and moved to the keep cells.
- Kill-path: skip the bracket. Walk to the winner's circle over the bracket. Played out: the
  bracket of fighter NPCs lies dead across the lists and you stand alone in the winner's-circle
  POI.
- Kill the giver. Gut Ortega in the stands and take the laurel off him. Played out: the revolt's
  rally-point POI empties and its banners come down for good; a governor's-gift object arrives at
  your homestead; Ortega respawns but no longer rallies a crowd.
- Slide (neutral): "There is a word for that in this valley. The word is governor." Played out: a
  governor's-seat object appears for you at the keep and the governor NPC greets you as a peer
  whenever you enter.

### 4.5 The Inheritance of Greywater Mill (Goodwife Sera): "Location, Location, Location"
Theme: ends versus means, as a real-estate crime.
- Spine (kept): sell / evict / commune / tenancy.
- Slumlord. Dam it yourself and charge the toll the company would have. Played out: a dam object
  is physically built across the millrace POI and a toll-collector NPC you own stands at it
  taking coin from passing caravans; Mill-Baron title on your nameplate.
- Triple-sell (forgery). Visit all three downstream village POIs and sell the one deed to each
  registrar before the water arrives. Slide: "Three villages drown holding three valid deeds to
  the same dry mill. The lawyers, at least, do very well." Played out: all three village POIs
  flip to a drowned state with their NPCs stranded on rooftops, while three deed objects bearing
  your forged mark sit in the three registrars' hands.
- Sic the hag (parley). Travel to the millpond, negotiate with the water hag instead of killing
  her; point her at the survey crew. Played out: the water-hag NPC relocates to the survey camp
  POI and the survey-crew NPCs are found dead and half-submerged there next you pass; the millpond
  is left still and empty.
- Kill-path: burn the mill for the "insurance," with everyone's blessing except everyone's.
  Slide: "A worse landlord than the company, and you do not even own a roof." Played out: the
  mill POI is replaced by a permanent burned-ruin object and the mill-yard NPCs relocate to a
  refugee cluster on the road.
- Kill the giver. Kill Goodwife Sera and take the deed off her body. Played out: the mill POI's
  ownership flips to you uncontested and the yard NPCs turn their backs whenever you enter; Sera
  respawns at her wheel by nightfall and will not look at you again.
- Slide (commune): "You gave them the land. The company dams downstream anyway. The free people
  drown free." Played out: the deed transfers to a free-tenants NPC group at the mill, then a
  company dam object is built at the downstream bend and the mill POI floods around the tenants,
  who remain in place, free and waist-deep.

## 5. Master reactivity (the slide web), and it is all on the map
- Keystone flags re-skin the back half: `joinedSlavers`, `townLovesHanging`, `mill_baron`,
  `double_agent`, `childkiller`, `caravan__calla_kept`. Each is set by a Section-4 choice and
  read by a later quest's `callbacks` (the mechanism already exists in `greywater.ts`).
- Every keystone flag also owns a **standing world change** that persists once set, so the
  reactivity is visible without re-reading a quest log: `joinedSlavers` keeps the Slaver Camp
  gate open to you and posts your name on its roster object; `townLovesHanging` keeps the gallows
  queue and waiting-list object up; `mill_baron` keeps your dam and toll-collector in place;
  `double_agent` keeps both facing-away statues standing; `childkiller` keeps the grieving
  relatives pacing the riverbank; `caravan__calla_kept` keeps Calla at the Homestead. A flag the
  player cannot walk to and see is not done.
- Titles (later tier) derive from `reputation` thresholds, surfaced on the nameplate; NPCs
  greet you by the worst one. The nameplate is the physical surface, not a hidden stat.
- Convergence: the Comfort-House madame is the recurring chorus. She has heard what you did at
  the ford, the gallows, the manor, the lists, and the mill, and prices her gossip to match. The
  pricing is a real, observable change at her vendor interaction, not a line of flavor: each
  keystone flag visibly bumps her rates. If you kept Calla, the madame has opinions about that
  too, and the surcharge is itemized.

## 6. Engine changes the future build needs (NOT this doc)
- `QuestChoice.requiresFlag? / requiresRep?: {faction, min}` (past-deed unlocks only, no class
  gate), with server-side validation in `turnInQuest` (sim.ts).
- HUD renders up to 6 choices (`quest_choices.ts`, `renderQuestDetail`).
- Choice-to-deed pipeline: a choice sets a flag that unlocks a small follow-up quest (the
  played-out stage). Reuse the `gw_jail_chest` follow-up pattern; this is the most important
  build mechanic.
- Consequence-to-world pipeline (the other half of 2b): the follow-up quest's completion must
  also commit the physical world delta its slide describes, never just print the slide. Concretely
  this means a small set of reusable, flag-gated world mutators the completion calls: spawn an
  NPC at a POI, despawn/relocate an existing NPC, swap a POI's state (open/closed, intact/drowned/
  burned), and drop a world object. Build these as lazy, deterministic, per-player-flag effects
  (Section 8 constraints), so the map visibly rearranges when the deed lands and stays rearranged
  on return. A slide with no matching world delta does not pass review.
- Killable quest-givers: an attackable mode plus HP, a quest-gated quest-item drop on death,
  and a ~10s respawn. Reuse the mob death/respawn and `needsQuestDrop` loot-gate paths; add a
  per-player "murdered X" flag on the killing blow.
- A companion/homestead system for the Calla path: a recurring companion NPC at a Homestead
  POI, a visit interaction, romance handled fade-to-black. No explicit content is authored.
- New flavor content and locations (Still, Comfort-House, Slaver Camp, court, downstream
  villages) as `src/sim/content/` records and POIs, which is why the region is being enlarged.
- Karmic titles: a pure helper mapping `reputation` to title, consumed by the nameplate.
- Constraints to honor: MMO shared-NPC safety (kill is real but respawns; consequence is
  per-player flags plus reputation), determinism (personal flags, lazy spawns), English-only
  i18n, no-dash and no-emoji house style. The two i18n-completeness suites stay red by design.

## 7. Acceptance criteria for a build of this doc
- Every quest has 6 or more solutions, all open to every class, including at least one literal
  kill-path, one kill-the-giver path, and one crude/comic path.
- Every consequential choice is PLAYED OUT: it spawns a follow-through stage with real travel
  plus kill/collect/interact objectives somewhere on the map, then fires its slide. No
  choice resolves in a text box alone.
- Every slide is BACKED BY A WORLD CHANGE the player can travel to and see: an NPC spawned,
  moved, or removed; a POI state swapped; or an object dropped. No slide asserts an off-screen
  consequence. The review test is literal: for each line of consequence prose, name the place on
  the map where it is visible. If you cannot, the line does not ship.
- The Calla companion path exists, plays out at a Homestead, and keeps intimacy fade-to-black.
- Every solution names its flags plus reputation deltas and carries a slide; no solution is
  dominant; each costs something legible and funny.
- All new environments fit because the Greywater region was enlarged first (Section 8).

## 8. The space: Greywater at full-game scale
This brief assumes the Greywater region is being expanded to roughly the footprint of the
original game, so each environment above gets its own real place: the ford and fen in the
south, the village and Comfort-House and Still in the centre, the tournament city and manor on
the rise, the mill and millpond and downstream villages in the north, the Slaver Camp out in
the far fen, and the Eastbrook court back west. The expansion is a separate, code-level change
(world.ts terrain bands plus data.ts world size, gated to preserve the Mirefen crater and
every determinism test); this doc only states the requirement that the room exist.
