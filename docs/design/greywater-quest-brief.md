# Greywater Valley — Quest Design Brief / Build Prompt

> Companion to `greywater-level-brief.md` (the geography). This one is the writers'-room
> bible: it takes the five authored Greywater quests and the prompt below turns each into a
> multi-stage, award-grade quest with real investigation, real gameplay, and a branching
> reckoning whose consequences ripple across the whole arc. Written to be executed against
> THIS engine's quest primitives, so every dramatic beat names the mechanic that carries it.

---

## The prompt, to hand an AI (or a quest writer)

```
ROLE
You are a senior quest designer (think the Bloody Baron, "Wandering in the Dark," Heart of
Stone) with a degree in interactive narrative design. You are fleshing out FIVE quests for
the Greywater Valley, a self-contained witcher region in an existing deterministic 3D MMO.
Spare no expense: the goal is an award-winning, replayable arc where the player's early
moral choices visibly haunt the later hours. Produce buildable, multi-stage quest designs,
not loglines.

THE ENGINE YOU MUST DESIGN WITHIN (non-negotiable)
- A quest is authored data: ordered objectives, each one type kill (a mob), collect (a
  ground item), or interact (a ground object / an NPC). Stages are expressed as objective
  sequences plus follow-up quests, NOT cutscene scripting. Gameplay must be real: travel,
  fight, gather, examine. No "talk to X" dialogue-only stages without a verb behind them.
- Branching is a per-player CHOICE/CONSEQUENCE system: a quest can end in up to 4 choices.
  Each choice writes personal FLAGS (questId__flag), shifts REPUTATION across factions
  (smallfolk, nobility, justice, underworld, plus named NPCs), grants a choice-specific
  reward (copper and/or a class-locked item), and may carry a "looming" line that foretells
  the cost. Flags are private to the player and MMO-safe (one player's choice never touches
  another's world).
- CROSS-QUEST CALLBACKS are the soul of the arc: a later quest reads an earlier quest's flag
  and surfaces a gated narrative beat (a line, an NPC reaction, sometimes a changed
  objective or reward). Every callback must be reachable: the flag it needs must be settable
  by some earlier choice. Design the web so a flag set in quest 1 pays off in quests 3 and 5.
- The world is server-authoritative and deterministic; quest credit, loot, and flags resolve
  server-side. Mobs spawn in lazy camps near the quest sites; quest items drop gated so they
  cannot be farmed. Each quest giver stands on a self-describing micro-environment (see the
  level brief): stage the fiction in props, not exposition.
- Player-facing text is English here, localized at the client boundary; write evocative,
  terse, witcher-grim prose. No em or en dashes, no emojis. $N = player name, $C = class.

THE FIVE QUESTS (expand each; keep the ids, givers, and the 4-choice spine)
1. The Drowned Caravan (giver: Calla, the ford). A strongbox lost in the drowned caravan
   turns out to hold a slaver's manifest with Calla's own name on it. Choices: cut in the
   mudlark looters; give Calla the box; carry the manifest to the magistrate (she hangs, a
   jail-chest reward and an assassin hunt open); or burn the proof and keep the gems.
2. An Eye for Aldermere (giver: Reeve Ondrin, the gallows-yard). A drifter is about to hang
   for a child's murder the evidence pins on her healer uncle. Choices: bless the hanging
   for coin; name the uncle (the valley loses its only healer); free the drifter; defer to
   the circuit judge (and be blackmailed by the uncle who learns you can be steered).
3. The Velvet Debt (giver: Ines, caged at the pass). Free Ines from a margrave who loves her
   and holds the road you need. Choices: sell her to his rival; tell him the truth (he shuts
   the pass); fake her death; or frame the steward (whose daughter will remember your face).
4. The People's Champion (giver: Ortega, the tournament). Win a rigged tournament, then
   decide the city's fate from the winner's circle. Choices: rig the bouts; take the
   governor's captaincy and keep; refuse the laurel and ignite a revolt; or stay neutral
   (and a debtor hangs on schedule because nothing changed).
5. The Inheritance of Greywater Mill (giver: Goodwife Sera, the mill). A deed names you owner
   of a working mill a reclamation company wants to dam, drowning three villages. Choices:
   sell the deed; evict the war-refugee millers and keep it; tear the deed and give them the
   land; or keep the deed and hold them as protected tenants.

DELIVER, PER QUEST, IN THIS ORDER
1. LOGLINE + THEME. One line of pitch; the moral question it actually interrogates (each of
   the five should probe a DIFFERENT one: complicity, justice-vs-mercy, love-as-ownership,
   power-vs-principle, ends-vs-means).
2. THREE-ACT STAGE BREAKDOWN, each act a concrete objective set the engine can author:
   - ACT 1 (HOOK): the giver's micro-set sells the problem before they speak; one travel +
     one light combat or gather objective gets the player invested.
   - ACT 2 (INVESTIGATION / ESCALATION): 2-3 objectives that COMPLICATE the obvious read,
     turning a simple job morally grey: a fetched object that reframes the victim, a fought
     enemy that turns out sympathetic, a witness that contradicts the giver. Use interact
     objectives (examine the shawl, read the manifest, open the strongbox) as the
     reveal beats. Each clue is a real, placed ground object on a real set.
   - ACT 3 (RECKONING): the 4-choice fork, each option with (a) immediate result prose, (b)
     a looming consequence, (c) flags set, (d) reputation deltas, (e) a distinct reward that
     fits the choice (mercy yields a healing draught; law yields a confiscated blade; greed
     yields raw coin). No choice is strictly optimal; each costs something legible.
3. THE INVESTIGATION CONTENT: list every clue object, every mob the player fights and WHY it
   lives there, and the one piece of environmental storytelling that lets a sharp player
   guess the twist before the text states it.
4. THE CONSEQUENCE WEB: which flags this quest can set, and which EARLIER flags it should
   read via callbacks. Specify at least two inbound callbacks (how quests 1-2 change THIS
   quest's framing) and the outbound flags later quests will read. Make the arc converge: by
   quest 5, the mill yard should be able to surface Calla alive (if freed), a city refugee
   (if you burned it), or the steward's daughter (if you framed him).
5. PACING + LENGTH: target level band, objective count, and the emotional beat each stage
   should land (curiosity -> unease -> complicity -> dread -> the weight of deciding).
6. VOICE: 2-3 sample lines for the giver in their distinct register (Calla numb, Ondrin
   greasing the rope, Ines elegant and transactional, Ortega conspiratorial, Sera plain and
   proud), plus the single hardest line in the quest.

THEN, ACROSS ALL FIVE
7. THE MASTER CONSEQUENCE MAP: a flag-by-flag table showing every choice flag and every
   later beat it unlocks, proving no callback references an unsettable flag and that each of
   the five quests both reads prior flags and writes flags later quests read. Mark the 3-4
   "keystone" choices that most reshape the back half.
8. REPLAY VECTORS: name 3 distinct playthrough personas (the lawful witcher, the coin-first
   mercenary, the people's hero) and trace how the arc feels different for each, so the
   designers can see the branching is meaningful, not cosmetic.
9. ACCEPTANCE CRITERIA (checklist): every stage has a real gameplay verb; every quest ends
   in 4 costed choices with distinct rewards; every callback flag is settable upstream; the
   arc converges in quest 5; no choice is dominant; investigation lets the player out-think
   the text; givers stay in voice; determinism/MMO-safety preserved (personal flags only).

STYLE
Confident showrunner voice. Specific objectives, flags, and reputation numbers, not vibes.
Multi-stage and ambitious. Every dramatic beat must name the engine mechanic (objective
type, flag, callback, reputation delta, ground object, lazy camp) that realizes it, so a
build team can author it directly. Grim, humane, witcher-grade. The player should never feel
clean.
```

---

## Why this prompt produces award-grade quests (designer's notes)

- **It forbids dialogue-only stages.** The single biggest failure mode of "moral choice"
  quests is the choice arriving as a menu after a conversation. Forcing every act onto a real
  objective verb (the engine's kill/collect/interact) means the player EARNS the dilemma by
  playing toward it: you wade into the drowned cave, you open the box, you read your friend's
  name on the manifest. The mechanic delivers the gut-punch, not a text box.
- **It demands the twist be guessable from the world.** Award quests respect the player's
  intelligence: the shawl that smells of a healer's herbs, the manifest in a child's hand,
  the manor that physically overlooks the homes it owns. A sharp player should reach the
  reveal a beat before the prose. That is the difference between a story you watch and one
  you solve.
- **It makes the consequence web load-bearing, not decorative.** The brief requires each
  quest to both READ upstream flags and WRITE flags consumed downstream, and to converge in
  quest 5. That is what turns five good quests into one arc you replay: the city you burned
  in quest 4 staffs the mill in quest 5; the friend you freed in quest 1 is kneading bread
  there; the man you framed in quest 3 sends his daughter to refuse you. The keystone-choice
  callout keeps the branching tractable for a build team.
- **It costs every choice.** "No dominant option" plus "looming consequence" plus
  "choice-specific reward" means greed, law, mercy, and cunning each buy something and each
  break something. The player is never clean. That discomfort is the award.

*Build to the brief, then trace one lawful, one mercenary, and one firebrand playthrough end
to end and confirm all three feel like different valleys.*
