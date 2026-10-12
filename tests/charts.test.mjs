/* Copyright © 2026 Zenin Easa Panthakkalakath */

// The figure builders are pure (series in, Plotly traces and layout out), so what each chart draws
// can be checked here without a browser or the Plotly bundle.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    amplitudeSpectrum, buildCorrelationFigure, buildDistributionFigure, buildScatterFigure,
    buildSpectrumFigure, buildTimeSeriesFigure, pearsonCorrelation, trailUpdate
} from '../package/charts.mjs';
import { repoRoot } from '../scripts/konjugatePaths.mjs';

function signal(signalId, unit, valueAt, { count = 101, step = 0.1 } = {}) {
    return {
        signalId, entityId: 1, entityName: 'Node', name: `signal ${signalId}`, symbol: `s${signalId}`, unit,
        samples: Array.from({ length: count }, (_, index) => ({ time: index * step, value: valueAt(index * step) }))
    };
}

const position = signal(1, 'm', (time) => Math.sin(time));
const velocity = signal(2, 'm/s', (time) => Math.cos(time));
const height = signal(3, 'm', (time) => 2 * time);

function axisTitles(layout) {
    return Object.entries({ ...layout, ...layout.scene }).filter(([key]) => /^[xyz]axis\d*$/.test(key)).map(([, axis]) => axis.title);
}

test('axis titles are objects, the only form Plotly 3 draws', () => {
    const figures = [
        buildTimeSeriesFigure([position, velocity], { time: 0 }),
        buildTimeSeriesFigure([position, velocity], { time: 0, arrangement: 'stackedByUnit' }),
        buildScatterFigure([position, velocity], { xId: 1, yId: 2, time: 5 }),
        buildScatterFigure([position, velocity, height], { xId: 1, yId: 2, zId: 3, time: 5 }),
        buildDistributionFigure([position], { time: 5 }),
        buildDistributionFigure([position, velocity], { time: 5, style: 'box' }),
        buildSpectrumFigure([position])
    ];
    for (const { layout } of figures) {
        const titles = axisTitles(layout).filter((title) => title !== undefined);
        assert.ok(titles.length);
        for (const title of titles) assert.equal(typeof title.text, 'string');
    }
});

test('overlaid time series keeps one plot area with an extra right-hand axis per unit', () => {
    const { traces, layout } = buildTimeSeriesFigure([position, velocity, height], { time: 3 });
    assert.deepEqual(traces.map((trace) => trace.yaxis), ['y', 'y2', 'y']);
    assert.equal(layout.yaxis2.overlaying, 'y');
    assert.equal(layout.yaxis.domain, undefined);
    assert.equal(layout.shapes[0].x0, 3);
});

test('overlaid axes beyond the second stand beside the plot, not on top of it', () => {
    const temperature = signal(6, 'K', (time) => 300 + time);
    const { layout } = buildTimeSeriesFigure([position, velocity, temperature], { time: 0 });
    assert.equal(layout.yaxis2.position, 1);
    assert.ok(layout.yaxis3.position < 1);
    assert.equal(layout.xaxis.domain[1], layout.yaxis3.position);
    assert.deepEqual(buildTimeSeriesFigure([position, velocity], { time: 0 }).layout.xaxis.domain, [0, 1]);
});

test('stacked time series gives each unit, or each signal, its own non-overlapping row', () => {
    const byUnit = buildTimeSeriesFigure([position, velocity, height], { time: 0, arrangement: 'stackedByUnit' });
    assert.deepEqual(byUnit.traces.map((trace) => trace.yaxis), ['y', 'y2', 'y']);
    assert.equal(byUnit.layout.yaxis2.overlaying, undefined);
    assert.ok(byUnit.layout.yaxis.domain[0] > byUnit.layout.yaxis2.domain[1], 'first row sits above the second');
    assert.equal(byUnit.layout.xaxis.anchor, 'y2');

    const bySignal = buildTimeSeriesFigure([position, velocity, height], { time: 0, arrangement: 'stackedBySignal' });
    assert.deepEqual(bySignal.traces.map((trace) => trace.yaxis), ['y', 'y2', 'y3']);
    const domains = [bySignal.layout.yaxis, bySignal.layout.yaxis2, bySignal.layout.yaxis3].map((axis) => axis.domain);
    domains.forEach(([low, high]) => assert.ok(low >= 0 && high <= 1 && low < high));
    assert.ok(domains[1][1] < domains[0][0] && domains[2][1] < domains[1][0]);
});

test('scatter reveals only the samples up to the current time', () => {
    const { traces } = buildScatterFigure([position, velocity], { xId: 1, yId: 2, time: 2 });
    assert.equal(traces.length, 1);
    assert.equal(traces[0].type, 'scatter');
    assert.equal(traces[0].x.length, 21);
    assert.equal(buildScatterFigure([position], { xId: 1, yId: 2, time: 2 }), null);
});

test('a trajectory scatter joins the points and rings the latest one', () => {
    const { traces } = buildScatterFigure([position, velocity], { xId: 1, yId: 2, time: 2, style: 'trajectory' });
    assert.equal(traces[0].mode, 'lines+markers');
    assert.deepEqual([traces[1].x, traces[1].y], [[traces[0].x.at(-1)], [traces[0].y.at(-1)]]);
});

test('a Z signal makes the scatter three-dimensional', () => {
    const { traces, layout } = buildScatterFigure([position, velocity, height], { xId: 1, yId: 2, zId: 3, time: 2, style: 'trajectory' });
    assert.deepEqual(traces.map((trace) => trace.type), ['scatter3d', 'scatter3d']);
    assert.equal(traces[0].z.length, 21);
    assert.equal(layout.scene.zaxis.title.text, 'Node · s3 (m)');
    assert.equal(layout.xaxis, undefined);
});

test('box and violin distributions give each signal its own panel and value axis', () => {
    for (const style of ['box', 'violin']) {
        const { traces, layout } = buildDistributionFigure([position, height], { time: 2, style });
        assert.deepEqual(traces.map((trace) => trace.type), [style, style]);
        assert.deepEqual(traces.map((trace) => trace.yaxis), ['y', 'y2']);
        assert.equal(traces[1].y.length, 21);
        assert.ok(layout.yaxis.range[1] < 2, 'a small signal is not flattened by a large one');
        assert.ok(layout.yaxis2.range[1] > 20, 'range covers the whole run, not just the trail');
    }
    assert.equal(buildDistributionFigure([position], { time: 2 }).traces[0].type, 'histogram');
});

test('a trail update carries every revealed array and nothing else', () => {
    const colored = buildScatterFigure([position, velocity, height], { xId: 1, yId: 2, colorId: 3, sizeId: 3, time: 2, style: 'trajectory' });
    const update = trailUpdate(colored.traces);
    assert.deepEqual(Object.keys(update).sort(), ['marker.color', 'marker.size', 'x', 'y']);
    assert.equal(update.x[0].length, 21);
    assert.equal(update.x[1].length, 1);
    assert.equal(update['marker.color'][0].length, 21);
    assert.equal(update['marker.color'][1], undefined, 'the ring keeps its fixed colour');

    const boxes = trailUpdate(buildDistributionFigure([position, height], { time: 2, style: 'box' }).traces);
    assert.deepEqual(Object.keys(boxes), ['y']);
    const bars = trailUpdate(buildDistributionFigure([position, height], { time: 2 }).traces);
    assert.deepEqual(Object.keys(bars), ['x']);
});

test('the amplitude spectrum finds a sine at its frequency and amplitude', () => {
    const tone = signal(4, 'm', (time) => 7 + 2 * Math.sin(2 * Math.PI * 5 * time), { count: 1001, step: 0.01 });
    const { frequency, amplitude } = amplitudeSpectrum(tone.samples);
    const peak = amplitude.indexOf(Math.max(...amplitude));
    assert.ok(Math.abs(frequency[peak] - 5) <= frequency[1] - frequency[0], `peak at ${frequency[peak]} Hz`);
    assert.ok(Math.abs(amplitude[peak] - 2) < 0.4, `peak amplitude ${amplitude[peak]}`);
    assert.ok(Math.abs(frequency.at(-1) - 50) < 1e-9, 'stops at the Nyquist limit of the samples');
    assert.ok(frequency[0] > 0, 'the constant offset is not plotted');
    const floor = Math.max(...amplitude.filter((_, index) => frequency[index] > 25));
    assert.ok(floor < 1e-6, `nothing but the tone: ${floor} away from it`);
});

test('unevenly spaced samples give the same spectrum as even ones', () => {
    const value = (time) => 3 * Math.sin(2 * Math.PI * 2 * time);
    const uneven = Array.from({ length: 2001 }, (_, index) => index * 0.005).filter((_, index) => index % 7 !== 3)
        .map((time) => ({ time, value: value(time) }));
    const { frequency, amplitude } = amplitudeSpectrum(uneven);
    const peak = amplitude.indexOf(Math.max(...amplitude));
    assert.ok(Math.abs(frequency[peak] - 2) <= frequency[1] - frequency[0], `peak at ${frequency[peak]} Hz`);
    assert.ok(Math.abs(amplitude[peak] - 3) < 0.6, `peak amplitude ${amplitude[peak]}`);
});

test('the spectrum skips signals too short to transform', () => {
    assert.equal(amplitudeSpectrum([{ time: 0, value: 1 }, { time: 1, value: 2 }]), null);
    assert.equal(buildSpectrumFigure([signal(5, 'm', () => 1, { count: 2 })]), null);
    const figure = buildSpectrumFigure([position, velocity], { scale: 'log' });
    assert.equal(figure.traces.length, 2);
    assert.equal(figure.layout.yaxis.type, 'log');
    assert.equal(figure.layout.yaxis.title.text, 'Amplitude');
    assert.equal(buildSpectrumFigure([position, height]).layout.yaxis.title.text, 'Amplitude (m)');
});

test('correlation is 1 with itself, -1 with its negation and undefined for a constant', () => {
    const values = position.samples.map((sample) => sample.value);
    assert.ok(Math.abs(pearsonCorrelation(values, values) - 1) < 1e-12);
    assert.ok(Math.abs(pearsonCorrelation(values, values.map((value) => 3 - 2 * value)) + 1) < 1e-12);
    assert.equal(pearsonCorrelation(values, values.map(() => 4)), null);
});

test('the correlation matrix is symmetric and remembers which signal each cell belongs to', () => {
    assert.equal(buildCorrelationFigure([position]), null);
    const { traces: [heatmap], signalIds } = buildCorrelationFigure([position, velocity, height]);
    assert.deepEqual(signalIds, [1, 2, 3]);
    assert.equal(heatmap.z.length, 3);
    heatmap.z.forEach((row, index) => {
        assert.ok(Math.abs(row[index] - 1) < 1e-12);
        row.forEach((value, column) => assert.equal(value, heatmap.z[column][index]));
    });
    assert.deepEqual([heatmap.zmin, heatmap.zmax], [-1, 1]);
});

test('the viewer never builds its page from markup, so a signal name cannot inject HTML', () => {
    assert.doesNotMatch(readFileSync(join(repoRoot, 'package/viewer.mjs'), 'utf8'), /innerHTML|insertAdjacentHTML/);
});
