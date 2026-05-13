# demo

Static demo hub for prototypes hosted at <https://demo.michaelconnolly.tech/>.

## Demo Apps

- `financial-research/` - static review app for a yfinance plus SEC EDGAR financial research data workflow.
- `columbus-underground-event-map/` - unofficial static Columbus Underground Event Map prototype.

## Requirements

- Static file hosting from the repository root; no build step is required.
- Keep `.nojekyll`, `CNAME`, `favicon.png`, `assets/`, and each demo app directory committed.
- The financial research prototype loads committed fixture JSON from `financial-research/data/research-demo.json` and offers a sample workbook from `financial-research/downloads/financial-research-sample.xlsx`; live Yahoo/SEC fetching happens offline before deploy.
- The event map requires `columbus-underground-event-map/data/events.json`, the vendored Leaflet files, and the vendored Pretext files.
- The event map loads map tiles from `https://tile.openstreetmap.org`.
- Event links point to public Columbus Underground pages. Event data is a committed snapshot, not a live fetch.

## Local Preview

```sh
python3 -m http.server 4180
```

Open `http://127.0.0.1:4180/`.
