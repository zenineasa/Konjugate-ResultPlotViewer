/* Copyright © 2026 Zenin Easa Panthakkalakath */

import {
    buildCorrelationFigure, buildDistributionFigure, buildScatterFigure, buildSpectrumFigure,
    buildTimeSeriesFigure, cursorShape, trailUpdate
} from './charts.mjs';
import { seriesToCsv } from './csvExport.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const selectedSignals = new Set();
let context = null;
let signals = [];
let plotReady = false;
let pendingLiveRender = null;
let liveRenderRequested = false;
let plotRendering = false;
let chartMode = 'timeSeries'; // 'timeSeries' | 'scatter' | 'distribution' | 'spectrum' | 'correlation'
let lastSeries = []; // the full series backing the current scatter/distribution chart, cached so
                      // timeline scrubbing can re-filter the revealed trail without a fresh IPC round trip
// The one secondary choice each chart type offers, and what to say when it has nothing to draw.
// The first option is the default; each type remembers its own choice across switches.
const chartModes = {
    timeSeries: { variantLabel: 'Layout', variants: [['overlaid', 'Overlaid'], ['stackedByUnit', 'Stacked by unit'], ['stackedBySignal', 'Stacked by signal']], empty: 'Select signals to compare' },
    scatter: { variantLabel: 'Draw', variants: [['points', 'Points'], ['trajectory', 'Trajectory']], empty: 'Choose X and Y signals', trail: true },
    distribution: { variantLabel: 'Shape', variants: [['histogram', 'Histogram'], ['box', 'Box'], ['violin', 'Violin']], empty: 'Select signals to compare', trail: true },
    spectrum: { variantLabel: 'Amplitude', variants: [['linear', 'Linear'], ['log', 'Logarithmic']], empty: 'Select signals to compare' },
    correlation: { variants: [], empty: 'Select at least two signals to correlate' }
};
const chartVariant = Object.fromEntries(Object.entries(chartModes).map(([mode, { variants }]) => [mode, variants[0]?.[0]]));
const scatterSelectors = ['#scatterX', '#scatterY', '#scatterZ', '#scatterColor', '#scatterSize'];

function formatTime(time) {
    return `${Number(time).toLocaleString(undefined, { maximumSignificantDigits: 6 })} s`;
}

function renderRunStatus(run) {
    context.run = { ...context.run, ...run };
    const live = context.run.lifecycle === 'running';
    $('#runLifecycle').textContent = live ? `Live · ${formatTime(context.run.availableResultTime)}` : 'Completed';
    $('#pacing').hidden = !live;
    const pacing = context.run.pacing;
    if (pacing) {
        const value = pacing.mode === 'limitedRatio' ? `limitedRatio:${pacing.simulationSecondsPerWallSecond}` : pacing.mode;
        if ([...$('#pacing').options].some((option) => option.value === value)) $('#pacing').value = value;
    }
}

function scheduleLiveRender() {
    liveRenderRequested = true;
    if (pendingLiveRender || document.hidden) return;
    pendingLiveRender = setTimeout(async () => {
        pendingLiveRender = null;
        if (!liveRenderRequested || plotRendering || document.hidden) return;
        liveRenderRequested = false;
        plotRendering = true;
        try { await renderPlot(); } finally {
            plotRendering = false;
            if (liveRenderRequested) scheduleLiveRender();
        }
    }, 250);
}

function buildFigure(series, time) {
    const variant = chartVariant[chartMode];
    if (chartMode === 'scatter') {
        const [xId, yId, zId, colorId, sizeId] = scatterSelectors.map((selector) => Number($(selector).value) || null);
        return buildScatterFigure(series, { xId, yId, zId, colorId, sizeId, time, style: variant });
    }
    if (chartMode === 'distribution') return buildDistributionFigure(series, { time, style: variant });
    if (chartMode === 'spectrum') return buildSpectrumFigure(series, { scale: variant });
    if (chartMode === 'correlation') return buildCorrelationFigure(series);
    return buildTimeSeriesFigure(series, { time, arrangement: variant });
}

// Cheap trail-position update for a scrub/live tick: restyles trace data only, in place, so any
// zoom/pan the user has set on the chart survives (unlike renderPlot's full Plotly.react, which
// legitimately rebuilds -- and re-ranges -- the chart because the selection itself changed).
function applyTrail(time) {
    if (!plotReady || !chartModes[chartMode].trail) return;
    const figure = buildFigure(lastSeries, time);
    if (figure) Plotly.restyle($('#analysisPlot'), trailUpdate(figure.traces));
}

function currentSignalIds() {
    if (chartMode === 'scatter') {
        return [...new Set(scatterSelectors.map((selector) => $(selector).value).filter(Boolean).map(Number))];
    }
    return [...selectedSignals];
}

// A time-series click seeks there; a correlation cell opens that pair of signals as a scatter.
function onPlotClick(figure, event) {
    const point = event.points?.[0];
    if (chartMode === 'timeSeries') {
        const time = Number(point?.x);
        if (Number.isFinite(time)) window.konjugateVisualizer.seek(time);
    } else if (chartMode === 'correlation') {
        const [row, column] = point?.pointIndex ?? [];
        if (row === undefined || row === column) return;
        $('#scatterX').value = String(figure.signalIds[column]);
        $('#scatterY').value = String(figure.signalIds[row]);
        $('#scatterZ').value = '';
        $('#chartMode').value = chartMode = 'scatter';
        applyChartModeVisibility();
        renderPlot();
    }
}

async function renderPlot() {
    const signalIds = currentSignalIds();
    const missingScatterAxis = chartMode === 'scatter' && (!$('#scatterX').value || !$('#scatterY').value);
    const series = missingScatterAxis ? [] : await window.konjugateVisualizer.readSeries(signalIds, { maxPoints: 5000 });
    const figure = series.length ? buildFigure(series, context.time) : null;
    $('.plotWorkspace').classList.toggle('hasSignals', Boolean(figure));
    $('#emptyPlot strong').textContent = chartModes[chartMode].empty;
    $('#exportCsv').disabled = !series.length;
    if (!figure) {
        if (plotReady) Plotly.purge($('#analysisPlot'));
        plotReady = false;
        return;
    }
    lastSeries = series;
    await Plotly.react($('#analysisPlot'), figure.traces, figure.layout, { responsive: true, displaylogo: false, scrollZoom: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
    $('#analysisPlot').removeAllListeners?.('plotly_click');
    $('#analysisPlot').on?.('plotly_click', (event) => onPlotClick(figure, event));
    plotReady = true;
}

// Built from DOM nodes rather than markup, so a node or signal name is never parsed as HTML.
function renderScatterPickers() {
    const required = ['#scatterX', '#scatterY'];
    scatterSelectors.forEach((selector) => {
        const select = $(selector);
        const previous = select.value;
        select.replaceChildren(...(required.includes(selector) ? [] : [new Option('None', '')]));
        Map.groupBy(signals, (signal) => signal.entityName).forEach((items, entityName) => {
            const group = document.createElement('optgroup');
            group.label = entityName;
            items.forEach((signal) => group.appendChild(new Option(`${signal.name} · ${signal.symbol}`, signal.signalId)));
            select.appendChild(group);
        });
        if (signals.some((signal) => String(signal.signalId) === previous)) select.value = previous;
        // Y starts on the second signal, so the first scatter isn't a signal against itself.
        else if (selector === '#scatterY' && signals[1]) select.value = String(signals[1].signalId);
    });
}

function applyChartModeVisibility() {
    const { variantLabel, variants, trail } = chartModes[chartMode];
    $('#chartVariantField').hidden = !variants.length;
    $('#chartVariantLabel').textContent = variantLabel ?? '';
    $('#chartVariant').replaceChildren(...variants.map(([value, label]) => new Option(label, value)));
    if (variants.length) $('#chartVariant').value = chartVariant[chartMode];
    $('#scatterPickers').hidden = chartMode !== 'scatter';
    $('#signalSearch').hidden = chartMode === 'scatter';
    $('#signalGroups').hidden = chartMode === 'scatter';
    $('#resetTrail').hidden = !trail;
}

function renderSignalBrowser(filter = '') {
    const normalizedFilter = filter.trim().toLowerCase();
    const groups = Map.groupBy(signals.filter((signal) => `${signal.entityName} ${signal.name} ${signal.symbol} ${signal.unit}`.toLowerCase().includes(normalizedFilter)), (signal) => signal.entityId);
    const container = $('#signalGroups');
    container.replaceChildren();
    groups.forEach((items, entityId) => {
        const group = document.createElement('section');
        group.className = 'signalGroup';
        group.dataset.entityId = entityId;
        group.classList.toggle('selectedEntity', context.selectedNodeId === entityId);
        const heading = document.createElement('strong');
        heading.textContent = items[0].entityName;
        group.appendChild(heading);
        items.forEach((signal) => {
            const label = document.createElement('label');
            label.className = 'signalOption';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = selectedSignals.has(signal.signalId);
            input.addEventListener('change', () => {
                if (input.checked) selectedSignals.add(signal.signalId);
                else selectedSignals.delete(signal.signalId);
                renderPlot();
            });
            const identity = document.createElement('span');
            const name = document.createElement('b');
            name.textContent = signal.name;
            const symbol = document.createElement('small');
            symbol.textContent = signal.symbol;
            identity.append(name, symbol);
            const unit = document.createElement('em');
            unit.textContent = signal.unit || '—';
            label.append(input, identity, unit);
            group.appendChild(label);
        });
        container.appendChild(group);
    });
}

async function loadSession() {
    context = await window.konjugateVisualizer.getContext();
    if (!context) return;
    signals = await window.konjugateVisualizer.listSignals();
    selectedSignals.clear();
    signals.filter((signal) => signal.entityId === context.selectedNodeId).forEach((signal) => selectedSignals.add(signal.signalId));
    $('#projectName').textContent = context.projectName;
    $('#runName').textContent = context.run.name;
    $('#timeline').max = String(context.run.targetTime);
    $('#timeline').value = String(context.time);
    $('#currentTime').value = formatTime(context.time);
    $('#targetTime').value = formatTime(context.run.targetTime);
    renderRunStatus(context.run);
    renderSignalBrowser();
    renderScatterPickers();
    applyChartModeVisibility();
    await renderPlot();
}

$('#chartMode').addEventListener('change', (event) => {
    chartMode = event.target.value;
    applyChartModeVisibility();
    renderPlot();
});
$('#chartVariant').addEventListener('change', (event) => {
    chartVariant[chartMode] = event.target.value;
    renderPlot();
});
scatterSelectors.forEach((selector) => {
    $(selector).addEventListener('change', () => renderPlot());
});
$('#signalSearch').addEventListener('input', (event) => renderSignalBrowser(event.target.value));
$('#clearSignals').addEventListener('click', () => {
    selectedSignals.clear();
    renderSignalBrowser($('#signalSearch').value);
    renderPlot();
});
$('#resetTrail').addEventListener('click', () => window.konjugateVisualizer.seek(0));
$('#exportCsv').addEventListener('click', async () => {
    const signalIds = currentSignalIds();
    if (!signalIds.length) return;
    const series = await window.konjugateVisualizer.readSeries(signalIds, { maxPoints: Infinity });
    const byId = new Map(series.map((item) => [item.signalId, item]));
    const orderedSeries = signalIds.map((id) => byId.get(id)).filter(Boolean);
    const csvSignals = orderedSeries.map((item) => ({
        signalId: item.signalId,
        header: `${item.entityName} — ${item.name}${item.unit ? ` (${item.unit})` : ''}`
    }));
    const csv = seriesToCsv(orderedSeries, csvSignals);
    const suggestedFilename = `${context.projectName} — ${context.run.name} (${chartMode}).csv`;
    await window.konjugateVisualizer.exportCsv(suggestedFilename, csv);
});
$('#timeline').addEventListener('input', (event) => window.konjugateVisualizer.seek(Number(event.target.value)));
$('#pacing').addEventListener('change', async (event) => {
    const [mode, ratio] = event.target.value.split(':');
    await window.konjugateVisualizer.requestPacing({
        mode,
        simulationSecondsPerWallSecond: mode === 'realTime' ? 1 : Number(ratio || 1)
    });
});
window.konjugateVisualizer.onTimelineChange((time) => {
    if (!context) return;
    context.time = Number(time);
    $('#timeline').value = String(time);
    $('#currentTime').value = formatTime(time);
    if (!plotReady) return;
    if (chartMode === 'timeSeries') Plotly.relayout($('#analysisPlot'), { shapes: [cursorShape(time)] });
    else applyTrail(time);
});
window.konjugateVisualizer.onSelectionChange((nodeId) => {
    if (!context) return;
    context.selectedNodeId = nodeId;
    document.querySelectorAll('.signalGroup').forEach((group) => group.classList.toggle('selectedEntity', Number(group.dataset.entityId) === nodeId));
});
window.konjugateVisualizer.onSamplesAvailable(({ availableResultTime }) => {
    if (!context) return;
    context.run.availableResultTime = availableResultTime;
    renderRunStatus(context.run);
    scheduleLiveRender();
});
window.konjugateVisualizer.onRunStatusChange((run) => {
    if (!context) return;
    renderRunStatus(run);
});
window.konjugateVisualizer.onPacingChange((pacing) => {
    if (!context) return;
    renderRunStatus({ pacing });
});
window.konjugateVisualizer.onSessionChange(loadSession);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && liveRenderRequested) scheduleLiveRender();
});

loadSession();
