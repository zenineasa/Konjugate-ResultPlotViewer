/* Copyright © 2026 Zenin Easa Panthakkalakath */

// Vendored from Konjugate core's src/resultExport.mjs (the two functions this add-on actually
// uses) -- an add-on's own sandboxed window has no filesystem access into the host's source tree,
// so this can't be a relative import across repos the way it could when this lived inside core's
// own addons/ directory. Small and self-contained enough that a local copy is simpler and safer
// than inventing a host-exposed export API for it.

export function csvField(value) {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// series: [{signalId, samples: [{time, value}]}] -- exactly what window.engine.readResultSeries
// returns. signals: [{signalId, header}], same order as passed to readResultSeries.
export function seriesToCsv(series, signals) {
    const sampleCount = Math.max(0, ...series.map((item) => item.samples.length));
    const rows = Array.from({ length: sampleCount }, (_, index) => [
        series.find((item) => item.samples.length)?.samples[index]?.time ?? '',
        ...series.map((item) => item.samples[index]?.value ?? '')
    ]);
    return [['time (s)', ...signals.map((signal) => signal.header)], ...rows]
        .map((row) => row.map(csvField).join(',')).join('\n');
}
