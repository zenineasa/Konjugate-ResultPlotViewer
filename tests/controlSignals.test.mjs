/* Copyright © 2026 Zenin Easa Panthakkalakath */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { controlSeries, controlSignalId, controlSignals, isControlSignalId, parseSignalId, valueAtTime } from '../package/controlSignals.mjs';
import { seriesToCsv } from '../package/csvExport.mjs';
import { repoRoot } from '../scripts/konjugatePaths.mjs';

// A parameter held at 1, set to 3 at 2 s (with the point just before the jump the host adds), then ramped to 5 by 4 s.
const entry = {
    parameterId: 7, name: 'Gain', ownerLabel: 'Heater', unit: 'W', ownValue: 1, endTime: 4, axisEnd: 10, changes: [],
    series: { times: [0, 2 - 1e-9, 2, 4], values: [1, 1, 3, 5] }
};

test('control ids cannot be mistaken for the host\'s numeric ids', () => {
    assert.equal(controlSignalId(7), 'control:7');
    assert.equal(isControlSignalId('control:7'), true);
    assert.equal(isControlSignalId(7), false);
    assert.equal(parseSignalId('control:7'), 'control:7');
    assert.equal(parseSignalId('12'), 12);
    assert.equal(parseSignalId(''), null);
    assert.equal(parseSignalId(null), null);
});

test('each changed parameter is one signal in a Controls group', () => {
    const [signal] = controlSignals([entry]);
    assert.deepEqual(signal, { signalId: 'control:7', entityId: 'controls', entityName: 'Controls', name: 'Heater: Gain', symbol: 'control', unit: 'W', control: true });
    assert.deepEqual(controlSignals([]), []);
});

test('a value is read at a time by following the series, holding past its end', () => {
    assert.equal(valueAtTime(entry.series, -1), 1);
    assert.equal(valueAtTime(entry.series, 1), 1);
    assert.equal(valueAtTime(entry.series, 2), 3);
    assert.equal(valueAtTime(entry.series, 3), 4);
    assert.equal(valueAtTime(entry.series, 9), 5);
    assert.ok(Number.isNaN(valueAtTime({ times: [], values: [] }, 1)));
});

test('a control series is as recorded for a chart against time, and at the samples\' times otherwise', () => {
    assert.deepEqual(controlSeries(entry).samples, [{ time: 0, value: 1 }, { time: 2 - 1e-9, value: 1 }, { time: 2, value: 3 }, { time: 4, value: 5 }]);
    const resampled = controlSeries(entry, [0, 1, 2, 3, 4, 6]);
    assert.deepEqual(resampled.samples.map((sample) => sample.value), [1, 1, 3, 4, 5, 5]);
    assert.deepEqual(resampled.samples.map((sample) => sample.time), [0, 1, 2, 3, 4, 6]);
    assert.equal(resampled.signalId, 'control:7');
});

test('a resampled control lines up with a state in the CSV', () => {
    const state = { signalId: 1, samples: [0, 2, 4].map((time) => ({ time, value: time * 10 })) };
    const csv = seriesToCsv([state, controlSeries(entry, [0, 2, 4])], [{ signalId: 1, header: 'Node — X' }, { signalId: 'control:7', header: 'Controls — Heater: Gain (W)' }]);
    assert.equal(csv, 'time (s),Node — X,Controls — Heater: Gain (W)\n0,0,1\n2,20,3\n4,40,5');
});

test('the viewer asks for the changes only where the host has the method', () => {
    const viewer = readFileSync(join(repoRoot, 'package', 'viewer.mjs'), 'utf8');
    assert.match(viewer, /typeof fetch === 'function'/);
    assert.match(viewer, /typeof window\.konjugateVisualizer\.getParameterChanges !== 'function'/);
});
