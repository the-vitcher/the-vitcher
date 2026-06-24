// The dev "give weapon" convenience (IWorld.devGiveWeapon): grants a class-appropriate
// level-20 epic, gated on Sim.devCommands so it can never spawn loot in a normal session.
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { ITEMS, niceDevWeaponFor } from '../src/sim/data';
import { canEquipItem } from '../src/sim/equipment_rules';
import type { PlayerClass } from '../src/sim/types';

const ALL_CLASSES: PlayerClass[] = [
  'warrior', 'paladin', 'shaman', 'rogue', 'hunter', 'mage', 'priest', 'warlock', 'druid',
];

describe('dev give-weapon convenience', () => {
  it('maps every class to an existing epic weapon it can actually equip', () => {
    for (const cls of ALL_CLASSES) {
      const id = niceDevWeaponFor(cls);
      const item = ITEMS[id];
      expect(item, `${cls} -> ${id} is not a real item`).toBeTruthy();
      expect(item.kind).toBe('weapon');
      expect(item.quality).toBe('epic');
      expect(canEquipItem(cls, item), `${cls} cannot equip ${id}`).toBe(true);
    }
  });

  it('grants the class-appropriate weapon when dev commands are enabled', () => {
    const sim = new Sim({ seed: 42, playerClass: 'mage', devCommands: true });
    const before = sim.countItem('staff_of_the_gravewyrm');
    sim.devGiveWeapon();
    expect(sim.countItem('staff_of_the_gravewyrm')).toBe(before + 1);
  });

  it('is a no-op when dev commands are disabled (no loot spawning in a normal session)', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior' }); // devCommands defaults to false
    const before = sim.countItem('wyrmfang_greatblade');
    sim.devGiveWeapon();
    expect(sim.countItem('wyrmfang_greatblade')).toBe(before);
  });
});
