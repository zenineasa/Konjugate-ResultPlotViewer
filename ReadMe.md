# Konjugate Results Analysis

A [Konjugate](https://github.com/zenineasa/Konjugate) add-on for comparing and exploring simulation result signals -- time-series, scatter and distribution plots (via Plotly), signal search, live pacing controls, and CSV export.

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
