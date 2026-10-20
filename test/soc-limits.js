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
 * The SoC limit capabilities hold 0-1 (Homey's '%' slider shows a value x100); the registers 0-100.
 */

const assert = require('assert');
const { battery } = require('../lib/solarwattPointMap');

const regsOf = (entries) => new Map(Object.entries(entries).map(([address, value]) => [Number(address), value]));
const regs = regsOf({ 46609: 10, 46610: 95, 46611: 20 });
assert.strictEqual(battery.capabilities.battery_min_soc(regs), 0.1);
assert.strictEqual(battery.capabilities.battery_max_soc(regs), 0.95);
assert.strictEqual(battery.capabilities.battery_min_soc_ongrid(regs), 0.2);
assert.strictEqual(battery.capabilities.battery_min_soc(regsOf({})), undefined, 'failed read shows nothing');

const shown = { battery_min_soc: 0.1, battery_max_soc: 0.95, battery_min_soc_ongrid: 0.2 };
const device = { getCapabilityValue: (cap) => shown[cap] };
const control = battery.controls.find((c) => c.capabilities.includes('battery_min_soc'));
assert.strictEqual(control.guard({ device, values: { battery_min_soc: 0.15 } }), null);
assert.strictEqual(control.guard({ device, values: { battery_min_soc: 0.29 } }), 'errors.socRange', 'min above on-grid min');
assert.strictEqual(control.guard({ device, values: { battery_max_soc: 0.05 } }), 'errors.socRange', 'below 10%');

(async () => {
  const written = [];
  const client = { writeRegister: async (address, value) => written.push([address, value]) };
  await control.write({ client, device, values: { battery_min_soc: 0.29, battery_min_soc_ongrid: 0.3 } });
  assert.deepStrictEqual(written, [[46610, 95], [46611, 30], [46609, 29]], 'whole percents, in a valid order');
  console.log('soc limits: all checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
