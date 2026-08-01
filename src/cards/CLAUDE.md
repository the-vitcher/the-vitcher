# src/cards - Pantheon card game (INCOMPLETE, DO NOT BUILD ON YET)

## Status: parked skeleton, pending the `warbond` source

This directory is a partial engine skeleton written while the upstream game it is
meant to merge into (`warbond`, on the author's local machine) was not reachable from
the session. **It does not compile**: `./content` is referenced by `board.ts` and
`evaluate.ts` but was never written, and there is no `engine.ts`, no card data, and no
tests. Nothing imports this directory, so it does not affect the client or server
build; `vite build` never reaches it and `npm test` never loads it.

Treat every design decision below as a PROPOSAL that `warbond` gets to overrule. The
merge target is warbond's asymmetry model plus the Pantheon roster, not this.

## What is here

| File | What it is |
|---|---|
| `types.ts` | Core types, tuning constants, and the `EffectCtx` / `OngoingCtx` ability surfaces. |
| `board.ts` | Zone and raw-power queries. Pure, no dependency on `evaluate.ts`, so `factions.ts` can share it without an import cycle. |
| `evaluate.ts` | Turns a `GameState` into final power plus the active rule set. |
| `factions.ts` | The asymmetry layer: one always-on passive per pantheon. |

## Design decisions worth keeping or arguing with

- **The one-pass Ongoing rule** (`evaluate.ts`). Ongoing abilities read RAW power
  (`def.power + counters`), never each other's modified power. Two Ongoings that buff
  each other would otherwise recurse forever, and evaluation order would silently
  become part of the balance. This is the single most load-bearing decision here.
- **Two evaluation passes.** Some Ongoings disable other Ongoings (Tsukuyomi), so pass
  one collects rules to find the silenced set and pass two recomputes rules and power
  with those cards switched off.
- **Faction asymmetry is a rule, not a stat line** (`factions.ts`). The roster spec
  gives each pantheon distinct cards, which is variety, not asymmetry. Each faction
  additionally plays by one different rule, budgeted at roughly one card of tempo over
  six turns.
- **Ascend as escalating stakes** (specified in `types.ts`, not yet implemented). A
  lane's `stake` is what winning it is worth; spending a token raises it, capped at 3,
  so one contested lane can outweigh the other two.

## If you are picking this up

Read `warbond` first. If its asymmetry model differs from `factions.ts`, delete
`factions.ts` and port the Pantheon roster onto warbond's model instead. The roster
source of truth is the uploaded `pantheoncardroster_1.md` spec: 12 factions, 15 cards
each, `Power ~= (Cost x 2) + 1` adjusted by ability strength.
