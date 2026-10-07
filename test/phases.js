/*
Copyright 2025 - 2026, Robin de Gruijter (rmdegruijter@gmail.com)

This file is part of com.solarwatt.

com.solarwatt is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.solarwatt is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with com.solarwatt.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

// A developer script, not app code: it reports to the console and sets an exit status.
/* eslint-disable no-console */

/*
 * Phase detection: an absent phase reads 0 or nothing; no voltage at all decides nothing; a phase
 * once seen stays. The meter judges its own voltages, so a three-phase meter on a single-phase
 * inverter keeps its phases.
 */

const assert = require('assert');
const { inverter, meter } = require('../lib/solarwattPointMap');

const regsOf = (entries) => new Map(Object.entries(entries).map(([address, value]) => [Number(address), value]));
const phaseCaps = (n) => [`measure_power.${n}`, `measure_voltage.${n}`, `measure_current.${n}`];

// inverter: grid voltages 39123-39125 (0.1 V)
const gridPhases = (l1, l2, l3) => inverter.detect(regsOf({ 39123: l1, 39124: l2, 39125: l3 })).phases;
assert.strictEqual(gridPhases(2301, 2305, 2299), '123');
assert.strictEqual(gridPhases(2301, 0, 0), '1');
assert.strictEqual(inverter.detect(regsOf({ 39123: 0, 39124: 0, 39125: 0 })).phases, undefined, 'outage decides nothing');
assert.strictEqual(inverter.detect(regsOf({})).phases, undefined, 'failed read decides nothing');

// a phase once seen stays until repair clears previous
const later = (l1, l2, l3, phases) => inverter.detect(regsOf({ 39123: l1, 39124: l2, 39125: l3 }), { phases }).phases;
assert.strictEqual(later(2301, 0, 0, '123'), '123', 'restart with two phases down');
assert.strictEqual(later(2301, 2305, 2299, '1'), '123', 'phases appearing are added');
assert.strictEqual(later(2301, 0, 0, '1'), '1');
assert.strictEqual(later(0, 0, 0, '123'), '123');
const gridOnly = regsOf({
  38801: 0, 39123: 2301, 39124: 0, 39125: 0,
});
assert.strictEqual(meter.detect(gridOnly, { phases: '123' }).phases, '123');

const dropped = (definition, detected) => definition.unsupported(detected).filter((cap) => /\.[123]$/.test(cap));
assert.deepStrictEqual(dropped(inverter, { phases: '1' }), [...phaseCaps(2), ...phaseCaps(3)]);
assert.deepStrictEqual(dropped(inverter, { phases: '123' }), []);
assert.deepStrictEqual(dropped(inverter, {}), [], 'unknown keeps every phase');

// meter: its own voltages (I32, 0.1 V) while connected (38801 = 1), else the grid's
const meterRegs = (connected, meterVolts, gridVolts) => {
  const regs = { 38801: connected ? 1 : 0 };
  meterVolts.forEach((volts, i) => Object.assign(regs, { [38802 + 2 * i]: 0, [38803 + 2 * i]: volts }));
  gridVolts.forEach((volts, i) => Object.assign(regs, { [39123 + i]: volts }));
  return regsOf(regs);
};
assert.strictEqual(meter.detect(meterRegs(true, [2301, 2305, 2299], [2301, 0, 0])).phases, '123', 'three-phase meter, single-phase inverter');
assert.strictEqual(meter.detect(meterRegs(true, [2301, 0, 0], [2301, 0, 0])).phases, '1');
assert.strictEqual(meter.detect(meterRegs(false, [], [2301, 0, 0])).phases, '1', 'not connected: the grid voltages');
assert.deepStrictEqual(meter.unsupported({ phases: '1' }), [...phaseCaps(2), ...phaseCaps(3)]);
assert.deepStrictEqual(meter.unsupported({}), []);

// every dropped capability exists in the map
for (const definition of [inverter, meter]) {
  for (const cap of definition.unsupported({ phases: '' })) {
    if (/\.[123]$/.test(cap)) assert.ok(cap in definition.capabilities, cap);
  }
}

console.log('phases: all checks passed');
