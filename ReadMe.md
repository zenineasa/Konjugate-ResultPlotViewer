# Konjugate Results Analysis

A [Konjugate](https://github.com/zenineasa/Konjugate) add-on for comparing and exploring simulation result signals, with signal search, live pacing controls, and CSV export. Charts are drawn with Plotly:

| Chart | Shows | Options |
| --- | --- | --- |
| Time series | Signals against time; click to move the timeline there | Overlaid on one plot, or stacked in rows by unit or by signal |
| Scatter | One signal against another, revealed up to the current time | Points or a joined trajectory; a Z signal for 3D; colour and size by further signals |
| Distribution | How each signal's values are spread, up to the current time | Histogram, box or violin |
| Spectrum | The amplitude of each frequency in each signal, over the whole run | Linear or logarithmic amplitude |
| Correlation | How strongly each pair of selected signals moves together, over the whole run; click a cell to open that pair as a scatter | |

Parameters that were changed while the run was going (by a live control or a schedule) appear as signals in a "Controls" group, with nothing added when none were. They need Konjugate 1.2.3 or later. Charts against time draw them as the changes happened; the other charts and the CSV export read their value at each sample's time.

## Installing

Open Konjugate's Extensions dialog, switch to Discover, and install "Results Analysis" from there.

## Building from source

This repo builds against a sibling checkout of Konjugate core -- clone both side by side:

```
git clone https://github.com/zenineasa/Konjugate
git clone https://github.com/zenineasa/Konjugate-ResultPlotViewer
cd Konjugate-ResultPlotViewer
npm run build        # writes out/konjugate.resultPlotViewer-<version>.kja
npm run install:dev  # also installs it into your local Konjugate's userData
```

`KONJUGATE_DIR` overrides the sibling-checkout assumption if you keep it elsewhere.

## Third-party software

Vendors [Plotly.js](https://plotly.com/javascript/) (MIT) -- see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## License

[MPL-2.0](LICENSE), matching Konjugate core.
