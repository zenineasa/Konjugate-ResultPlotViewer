/* Copyright © 2026 Zenin Easa Panthakkalakath */

// The parameters that were changed while the run was going (Konjugate's getParameterChanges) offered as signals beside the
// states. Pure functions, so they can be checked without a browser. A state signal's id is a number from the host; a control
// signal's id is "control:<parameterId>", so the two can never be mistaken for each other.

export const controlGroupId = 'controls';
const prefix = 'control:';

export const controlSignalId = (parameterId) => `${prefix}${parameterId}`;
export const isControlSignalId = (signalId) => typeof signalId === 'string' && signalId.startsWith(prefix);

// What a picker's text value stands for: a control id stays text, a state id becomes the number the host knows it by.
export function parseSignalId(text) {
    if (isControlSignalId(text)) return text;
    const number = Number(text);
    return text !== '' && text !== null && text !== undefined && Number.isFinite(number) ? number : null;
}

// The entries as signals, in the shape of the host's listSignals.
export function controlSignals(entries) {
    return entries.map((entry) => ({
        signalId: controlSignalId(entry.parameterId), entityId: controlGroupId, entityName: 'Controls',
        name: entry.ownerLabel ? `${entry.ownerLabel}: ${entry.name}` : entry.name, symbol: 'control', unit: entry.unit ?? '', control: true
    }));
}

// The value at `time` of a series that is as long as the changes were recorded: between its points it follows the line
// between them (a jump is recorded with a point just before it, so it reads as a jump), and past its end it holds the last value.
export function valueAtTime(series, time) {
    const { times, values } = series;
    if (!times.length) return NaN;
    if (time <= times[0]) return values[0];
    if (time >= times.at(-1)) return values.at(-1);
    let low = 0;
    let high = times.length - 1;
    while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (times[middle] <= time) low = middle; else high = middle;
    }
    const span = times[high] - times[low];
    return span > 0 ? values[low] + ((time - times[low]) / span) * (values[high] - values[low]) : values[high];
}

// One entry as a series like the host's readSeries gives. With `sampleTimes` the values are taken at those times, which is what a
// scatter, a distribution, a spectrum, a correlation and a CSV need (they pair values by sample); without them the series is
// returned as recorded, which a chart against time can draw as it is.
export function controlSeries(entry, sampleTimes = null) {
    const [signal] = controlSignals([entry]);
    const times = sampleTimes ?? entry.series.times;
    return {
        signalId: signal.signalId, entityId: signal.entityId, entityName: signal.entityName, name: signal.name, symbol: signal.symbol, unit: signal.unit,
        samples: times.map((time, index) => ({ time, value: sampleTimes ? valueAtTime(entry.series, time) : entry.series.values[index] }))
    };
}
