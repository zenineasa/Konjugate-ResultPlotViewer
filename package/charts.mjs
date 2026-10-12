/* Copyright © 2026 Zenin Easa Panthakkalakath */

// The figure builders: series in, Plotly traces and layout out. Nothing here touches the DOM, the
// Plotly global or the host bridge, so every chart can be tested without a browser.

const distributionPalette = ['#42c9bc', '#d98b54', '#7aa8d9', '#c16f55', '#8fcfc9'];
const axisStyle = { gridcolor: '#1d303a', zerolinecolor: '#2b414c' };
const baseLayout = {
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(7,15,21,.55)',
    font: { color: '#8297a1', family: 'system-ui, sans-serif', size: 10 }
};
const topLegend = { orientation: 'h', x: 0, y: 1.08, yanchor: 'bottom' };

function signalLabel(item) {
    return `${item.entityName} · ${item.symbol}`;
}

function axisLabel(item) {
    return `${signalLabel(item)}${item.unit ? ` (${item.unit})` : ''}`;
}

function valuesOf(samples) {
    return samples.map((sample) => sample.value);
}

// Plotly 3 ignores a title given as a bare string, so every title goes through here.
function title(text) {
    return { text };
}

export function paddedRange(values, ratio = 0.06) {
    const finite = values.map(Number).filter(Number.isFinite);
    if (!finite.length) return undefined;
    const minimum = Math.min(...finite);
    const maximum = Math.max(...finite);
    const span = maximum - minimum;
    const padding = span ? span * ratio : Math.max(Math.abs(minimum) * ratio, 1);
    return [minimum - padding, maximum + padding];
}

export function cursorShape(time) {
    return { type: 'line', x0: time, x1: time, y0: 0, y1: 1, yref: 'paper', line: { color: '#62e1d5', width: 1.5, dash: 'dot' } };
}

// Scatter and distribution modes reveal samples progressively as the timeline advances (a
// phase-space trail / a distribution building up) rather than always drawing the whole run --
// the sample at time 0 is the first one included, so scrubbing back to 0 empties the chart.
function upToTime(samples, time) {
    return samples.filter((sample) => sample.time <= time);
}

function fixedRange(fullValues) {
    const finite = fullValues.map(Number).filter(Number.isFinite);
    return finite.length ? [Math.min(...finite), Math.max(...finite)] : [0, 1];
}

// Bin edges/count are fixed from the full run so bars stay in place and comparable as the trail
// fills in -- only their heights grow. targetBinCount matches Plotly's own rough default.
function histogramBinning(fullValues, targetBinCount = 24) {
    const finite = fullValues.map(Number).filter(Number.isFinite);
    if (!finite.length) return null;
    const minimum = Math.min(...finite), maximum = Math.max(...finite);
    const span = maximum - minimum || Math.max(Math.abs(minimum), 1);
    const size = span / targetBinCount;
    return { start: minimum - size / 2, end: maximum + size / 2, size };
}

function binnedCounts(values, bins) {
    const counts = new Array(Math.max(1, Math.round((bins.end - bins.start) / bins.size))).fill(0);
    values.forEach((value) => {
        const index = Math.min(counts.length - 1, Math.max(0, Math.floor((value - bins.start) / bins.size)));
        counts[index] += 1;
    });
    return counts;
}

// Where the index-th overlaid y axis stands, as a fraction of the width: the first two flank the
// plot, and each one after that steps further in from the right.
function extraAxisPosition(index) {
    return Math.max(.72, 1 - Math.max(0, index - 1) * .07);
}

// 'overlaid' shares one plot area, with an extra y axis on the right per additional unit.
// 'stackedByUnit' and 'stackedBySignal' give each unit (or each signal) its own row over a shared
// time axis, which stays readable when the overlaid axes would crowd each other.
export function buildTimeSeriesFigure(series, { time, arrangement = 'overlaid' }) {
    const bySignal = arrangement === 'stackedBySignal';
    const keyOf = bySignal ? (item) => item.signalId : (item) => item.unit || 'Value';
    const keys = [...new Set(series.map(keyOf))];
    const stacked = arrangement !== 'overlaid' && keys.length > 1;
    const traces = series.map((item) => ({
        type: 'scatter', mode: 'lines', name: signalLabel(item),
        x: item.samples.map((sample) => sample.time),
        y: valuesOf(item.samples),
        yaxis: keys.indexOf(keyOf(item)) ? `y${keys.indexOf(keyOf(item)) + 1}` : 'y',
        line: { width: 2 },
        hovertemplate: `${item.entityName}<br>${item.name}: %{y:.6g} ${item.unit}<br>t = %{x:.6g} s<extra></extra>`
    }));
    const layout = {
        ...baseLayout,
        margin: { l: 58, r: stacked || keys.length === 1 ? 24 : 52, t: 52, b: 48 },
        hovermode: 'x unified', showlegend: true,
        legend: { ...topLegend, itemclick: 'toggle', itemdoubleclick: 'toggleothers' },
        xaxis: {
            title: title('Time (s)'), range: paddedRange(series.flatMap((item) => item.samples.map((sample) => sample.time)), .03), ...axisStyle,
            // Overlaid, the third and later axes stand inside the plot's width, so the plot gives it up.
            ...(stacked ? { anchor: `y${keys.length}` } : { domain: [0, extraAxisPosition(keys.length - 1)] })
        },
        shapes: [cursorShape(time)]
    };
    const rowGap = 0.05;
    const rowHeight = (1 - rowGap * (keys.length - 1)) / keys.length;
    keys.forEach((key, index) => {
        const members = series.filter((item) => keyOf(item) === key);
        const top = 1 - index * (rowHeight + rowGap);
        layout[index ? `yaxis${index + 1}` : 'yaxis'] = {
            title: title(bySignal ? `${members[0].symbol}${members[0].unit ? ` (${members[0].unit})` : ''}` : key),
            range: paddedRange(members.flatMap((item) => valuesOf(item.samples))),
            ...axisStyle,
            ...(stacked
                ? { domain: [Math.max(0, top - rowHeight), top] }
                : { gridcolor: index ? 'rgba(0,0,0,0)' : axisStyle.gridcolor, ...(index ? { overlaying: 'y', side: 'right', anchor: 'free', position: extraAxisPosition(index) } : {}) })
        };
    });
    return { traces, layout };
}

// Marker size in pixels needs a bounded, human-legible range regardless of a signal's own raw
// magnitude -- min-max normalized into [6, 24], matching Plotly's own common bubble-chart
// convention. A constant (zero-span) size signal maps to the midpoint rather than dividing by
// zero. The scale itself is fixed from `fullValues` (the whole run) so marker sizes stay
// comparable as the trail reveals more points, while `values` is just what's drawn right now.
function normalizedMarkerSize(values, fullValues) {
    const finite = fullValues.map(Number).filter(Number.isFinite);
    const minimum = Math.min(...finite);
    const span = Math.max(...finite) - minimum;
    return values.map((value) => span ? 6 + ((value - minimum) / span) * 18 : 15);
}

// Axis ranges, the color scale and the size scale are all fixed from the full run (not just the
// currently-revealed trail) so the chart doesn't visibly rescale itself as the trail grows --
// see buildDistributionFigure for the equivalent for histogram bins/counts. Plotly's own
// zoom/pan then persists across trail updates, since those go through Plotly.restyle (trace data
// only) rather than a full react that would reassert these ranges -- see trailUpdate.
//
// A Z signal makes it a 3D scatter. style 'trajectory' joins the points in time order and rings
// the latest one, so the path through phase space and where it currently is are both visible.
export function buildScatterFigure(series, { xId, yId, zId = null, colorId = null, sizeId = null, time, style = 'points' }) {
    const byId = new Map(series.map((item) => [item.signalId, item]));
    const x = byId.get(xId), y = byId.get(yId);
    if (!x || !y) return null;
    const z = zId ? byId.get(zId) : null;
    const colorItem = colorId ? byId.get(colorId) : null;
    const sizeItem = sizeId ? byId.get(sizeId) : null;
    const trajectory = style === 'trajectory';
    const type = z ? 'scatter3d' : 'scatter';
    const revealed = (item) => valuesOf(upToTime(item.samples, time));
    const [cmin, cmax] = colorItem ? fixedRange(valuesOf(colorItem.samples)) : [0, 1];
    const points = { x: revealed(x), y: revealed(y), ...(z ? { z: revealed(z) } : {}) };
    const hoverLine = (item, axis) => `${signalLabel(item)}: %{${axis}:.6g} ${item.unit}`;
    const traces = [{
        type, mode: trajectory ? 'lines+markers' : 'markers',
        ...points,
        ...(trajectory ? { line: { color: 'rgba(66,201,188,.45)', width: z ? 3 : 1.5 } } : {}),
        marker: {
            size: sizeItem
                ? normalizedMarkerSize(revealed(sizeItem), valuesOf(sizeItem.samples))
                : trajectory ? 4 : z ? 4 : 8,
            ...(colorItem ? {
                color: revealed(colorItem),
                colorscale: 'Viridis', showscale: true, cmin, cmax,
                colorbar: { title: title(colorItem.unit || colorItem.name), thickness: 12, len: 0.7 }
            } : { color: '#42c9bc' })
        },
        hovertemplate: `${[hoverLine(x, 'x'), hoverLine(y, 'y'), ...(z ? [hoverLine(z, 'z')] : [])].join('<br>')}<extra></extra>`
    }];
    if (trajectory) {
        traces.push({
            type, mode: 'markers', hoverinfo: 'skip',
            x: points.x.slice(-1), y: points.y.slice(-1), ...(z ? { z: points.z.slice(-1) } : {}),
            marker: { size: z ? 8 : 14, symbol: 'circle-open', color: '#62e1d5', line: { color: '#62e1d5', width: 2 } }
        });
    }
    const axis = (item) => ({ title: title(axisLabel(item)), range: paddedRange(valuesOf(item.samples)), ...axisStyle });
    const layout = {
        ...baseLayout,
        margin: z ? { l: 0, r: colorItem ? 90 : 0, t: 0, b: 0 } : { l: 58, r: colorItem ? 90 : 24, t: 24, b: 48 },
        showlegend: false,
        ...(z
            ? { scene: { xaxis: axis(x), yaxis: axis(y), zaxis: axis(z) } }
            : { xaxis: axis(x), yaxis: axis(y) })
    };
    return { traces, layout };
}

// style 'histogram' shows the shape of each signal's values; 'box' and 'violin' summarise each
// signal's median and spread side by side instead.
export function buildDistributionFigure(series, { time, style = 'histogram' }) {
    const colorOf = (index) => distributionPalette[index % distributionPalette.length];
    const single = series.length === 1 ? axisLabel(series[0]) : 'Value';
    if (style === 'box' || style === 'violin') {
        // One panel per signal, each with its own value axis: signals rarely share a scale, and
        // on a common axis the largest would flatten the rest.
        const traces = series.map((item, index) => ({
            type: style, name: signalLabel(item),
            y: valuesOf(upToTime(item.samples, time)),
            xaxis: index ? `x${index + 1}` : 'x', yaxis: index ? `y${index + 1}` : 'y',
            marker: { color: colorOf(index) }, line: { color: colorOf(index) },
            ...(style === 'box'
                ? { boxpoints: false, boxmean: true }
                : { points: false, box: { visible: true }, meanline: { visible: true } })
        }));
        const layout = {
            ...baseLayout,
            margin: { l: 58, r: 24, t: 24, b: 48 },
            showlegend: false,
            grid: { rows: 1, columns: series.length, pattern: 'independent', xgap: 0.35 }
        };
        series.forEach((item, index) => {
            layout[index ? `xaxis${index + 1}` : 'xaxis'] = { ...axisStyle, showgrid: false };
            layout[index ? `yaxis${index + 1}` : 'yaxis'] = { title: title(item.unit || 'Value'), range: paddedRange(valuesOf(item.samples)), ...axisStyle };
        });
        return { traces, layout };
    }
    const binsBySignal = series.map((item) => histogramBinning(valuesOf(item.samples)));
    const maxCount = Math.max(1, ...series.map((item, index) => {
        const bins = binsBySignal[index];
        return bins ? Math.max(...binnedCounts(valuesOf(item.samples), bins)) : 0;
    }));
    const traces = series.map((item, index) => ({
        type: 'histogram', name: signalLabel(item),
        x: valuesOf(upToTime(item.samples, time)),
        ...(binsBySignal[index] ? { xbins: binsBySignal[index] } : {}),
        opacity: series.length > 1 ? 0.65 : 1,
        marker: { color: colorOf(index) },
        hovertemplate: `${signalLabel(item)}: %{x:.6g} ${item.unit}<br>count: %{y}<extra></extra>`
    }));
    const layout = {
        ...baseLayout,
        margin: { l: 58, r: 24, t: series.length > 1 ? 52 : 24, b: 48 },
        showlegend: series.length > 1,
        legend: topLegend,
        barmode: 'overlay',
        xaxis: { title: title(single), ...axisStyle },
        yaxis: { title: title('Count'), range: [0, maxCount * 1.08], ...axisStyle }
    };
    return { traces, layout };
}

// In-place radix-2 FFT; real.length must be a power of two.
function fft(real, imaginary) {
    const size = real.length;
    for (let index = 1, reversed = 0; index < size; index += 1) {
        let bit = size >> 1;
        for (; reversed & bit; bit >>= 1) reversed ^= bit;
        reversed ^= bit;
        if (index < reversed) {
            [real[index], real[reversed]] = [real[reversed], real[index]];
            [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
        }
    }
    for (let length = 2; length <= size; length <<= 1) {
        const angle = -2 * Math.PI / length;
        for (let start = 0; start < size; start += length) {
            for (let offset = 0; offset < length / 2; offset += 1) {
                const cos = Math.cos(angle * offset), sin = Math.sin(angle * offset);
                const even = start + offset, odd = even + length / 2;
                const oddReal = real[odd] * cos - imaginary[odd] * sin;
                const oddImaginary = real[odd] * sin + imaginary[odd] * cos;
                real[odd] = real[even] - oddReal;
                imaginary[odd] = imaginary[even] - oddImaginary;
                real[even] += oddReal;
                imaginary[even] += oddImaginary;
            }
        }
    }
}

// One-sided amplitude spectrum: a sine of amplitude A shows up as a peak of about A at its
// frequency. The mean is removed so the constant offset doesn't swamp the plot, a Hann window
// keeps a run that ends mid-cycle from smearing across every bin, and the windowed samples are
// zero-padded up to the power of two the FFT needs. Samples are taken as they are when evenly
// spaced, which is the usual case, and otherwise interpolated onto an even grid of the same size
// -- never onto a finer one, which would add periodic artefacts of its own.
export function amplitudeSpectrum(samples, maxSize = 8192) {
    const points = samples.filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.value));
    const count = Math.min(points.length, maxSize);
    if (count < 4) return null;
    const startTime = points[0].time;
    const duration = points.at(-1).time - startTime;
    if (!(duration > 0)) return null;
    const size = 2 ** Math.ceil(Math.log2(count));
    const real = new Float64Array(size), imaginary = new Float64Array(size);
    for (let index = 0, cursor = 0; index < count; index += 1) {
        const time = startTime + duration * index / (count - 1);
        while (cursor < points.length - 2 && points[cursor + 1].time <= time) cursor += 1;
        const before = points[cursor], after = points[cursor + 1];
        const span = after.time - before.time;
        real[index] = span > 0 ? before.value + (after.value - before.value) * Math.min(1, Math.max(0, (time - before.time) / span)) : before.value;
    }
    let mean = 0;
    for (let index = 0; index < count; index += 1) mean += real[index] / count;
    let windowSum = 0;
    for (let index = 0; index < count; index += 1) {
        const weight = 0.5 * (1 - Math.cos(2 * Math.PI * index / (count - 1)));
        real[index] = (real[index] - mean) * weight;
        windowSum += weight;
    }
    fft(real, imaginary);
    const binWidth = (count - 1) / duration / size;
    const frequency = [], amplitude = [];
    for (let bin = 1; bin <= size / 2; bin += 1) {
        frequency.push(bin * binWidth);
        amplitude.push(2 * Math.hypot(real[bin], imaginary[bin]) / windowSum);
    }
    return { frequency, amplitude };
}

export function buildSpectrumFigure(series, { scale = 'linear' } = {}) {
    const spectra = series.map((item) => ({ item, spectrum: amplitudeSpectrum(item.samples) })).filter((entry) => entry.spectrum);
    if (!spectra.length) return null;
    const units = [...new Set(spectra.map((entry) => entry.item.unit).filter(Boolean))];
    const traces = spectra.map(({ item, spectrum }) => ({
        type: 'scatter', mode: 'lines', name: signalLabel(item),
        x: spectrum.frequency, y: spectrum.amplitude,
        line: { width: 1.5 },
        hovertemplate: `${signalLabel(item)}<br>amplitude: %{y:.4g} ${item.unit}<br>f = %{x:.6g} Hz<extra></extra>`
    }));
    const layout = {
        ...baseLayout,
        margin: { l: 58, r: 24, t: 52, b: 48 },
        showlegend: true,
        legend: { ...topLegend, itemclick: 'toggle', itemdoubleclick: 'toggleothers' },
        xaxis: { title: title('Frequency (Hz)'), ...axisStyle },
        yaxis: { title: title(units.length === 1 ? `Amplitude (${units[0]})` : 'Amplitude'), type: scale === 'log' ? 'log' : 'linear', ...axisStyle }
    };
    return { traces, layout };
}

// Pearson correlation of two equally-indexed value lists (every signal of a run shares one time
// grid). null when either side is constant, where the coefficient is undefined rather than zero.
export function pearsonCorrelation(first, second) {
    const pairs = [];
    for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
        if (Number.isFinite(first[index]) && Number.isFinite(second[index])) pairs.push([first[index], second[index]]);
    }
    if (pairs.length < 2) return null;
    const meanFirst = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const meanSecond = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    let covariance = 0, varianceFirst = 0, varianceSecond = 0;
    pairs.forEach(([a, b]) => {
        covariance += (a - meanFirst) * (b - meanSecond);
        varianceFirst += (a - meanFirst) ** 2;
        varianceSecond += (b - meanSecond) ** 2;
    });
    return varianceFirst && varianceSecond ? covariance / Math.sqrt(varianceFirst * varianceSecond) : null;
}

// Every selected signal against every other over the whole run. The scale is anchored at -1..1
// with the midpoint the colour of the plot background, so an uncorrelated pair fades away and a
// strong one stands out in either direction. signalIds lets a click on a cell be traced back to
// its pair of signals.
export function buildCorrelationFigure(series) {
    if (series.length < 2) return null;
    const values = series.map((item) => valuesOf(item.samples));
    const labels = series.map(signalLabel);
    const trace = {
        type: 'heatmap',
        x: labels, y: labels,
        z: values.map((row) => values.map((column) => pearsonCorrelation(row, column))),
        zmin: -1, zmax: 1,
        colorscale: [[0, '#4f8fd9'], [0.5, '#12222c'], [1, '#d98b54']],
        xgap: 2, ygap: 2, hoverongaps: false,
        texttemplate: '%{z:.2f}',
        colorbar: { title: title('r'), thickness: 12, len: 0.7 },
        hovertemplate: '%{y}<br>%{x}<br>r = %{z:.4f}<extra></extra>'
    };
    const layout = {
        ...baseLayout,
        margin: { l: 58, r: 90, t: 24, b: 48 },
        showlegend: false,
        xaxis: { type: 'category', automargin: true, showgrid: false },
        yaxis: { type: 'category', automargin: true, showgrid: false, autorange: 'reversed' }
    };
    return { traces: [trace], layout, signalIds: series.map((item) => item.signalId) };
}

// What a timeline move changes in a trail chart, as one Plotly.restyle update covering every
// trace: the same figure rebuilt at the new time, reduced to its data arrays. An undefined entry
// leaves that trace's attribute alone.
export function trailUpdate(traces) {
    const arrayOrNothing = (value) => Array.isArray(value) ? value : undefined;
    const update = {
        x: traces.map((trace) => trace.x),
        y: traces.map((trace) => trace.y),
        z: traces.map((trace) => trace.z),
        'marker.color': traces.map((trace) => arrayOrNothing(trace.marker?.color)),
        'marker.size': traces.map((trace) => arrayOrNothing(trace.marker?.size))
    };
    return Object.fromEntries(Object.entries(update).filter(([, perTrace]) => perTrace.some((value) => value !== undefined)));
}
