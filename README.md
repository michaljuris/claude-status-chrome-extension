# Claude Code Status

A Chrome extension that shows the live status of Claude Code in your browser toolbar.

![Claude Code Status Extension](store-assets/screenshot-light.png)

## Features

- **Toolbar icon** — a Claude spark icon that changes color based on current Claude Code status (green/yellow/orange/red)
- **Tooltip** — hover to see the current status at a glance ("Claude Code: Operational")
- **7-day history bar** — gradient-colored bars matching status.claude.com, with rich tooltips showing outage type, duration, and related incidents
- **Other services** — compact view of all Claude services (claude.ai, API, platform, Cowork, Government)
- **Recent incidents** — last 7 days of incidents affecting Claude Code, with color-coded status labels
- **Warm light/dark theme** — follows your system theme automatically
- **Auto-refresh** — polls status.claude.com every 30 seconds
- **Accurate outage durations** — uses component-level status transitions (not incident timestamps) to match status.claude.com exactly

## Install

### From source (developer mode)

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the cloned directory
5. The Claude spark icon appears in your toolbar

### From Chrome Web Store

*Coming soon*

## How it works

The extension polls the [Statuspage.io public API](https://status.claude.com/api/v2/summary.json) for Claude's service status. A background service worker fetches data every 30 seconds using `chrome.alarms`, processes it, and caches results in `chrome.storage.local`. The popup reads cached data on open — no network requests when you click the icon.

### Outage duration calculation

Outage durations are calculated from **component-level status transitions** in the incident API, not from incident start/end timestamps. This matches how status.claude.com computes durations:

- Only `partial_outage` and `major_outage` count as downtime
- `degraded_performance` does not contribute to outage duration (matches the status page)
- Overlapping incidents are merged to avoid double-counting

### Bar color gradient

Bar colors use a continuous gradient matching status.claude.com, not fixed color buckets. The algorithm was reverse-engineered from all 90 bars on the status page:

1. Compute weighted downtime: `weighted = partial_seconds * 0.3 + major_seconds * 1.0`
2. Interpolate through 4 stops from `window.pageColorData`:

| Weighted seconds | Color | Hex |
|-----------------|-------|-----|
| 0 | Green | `#76AD2A` |
| 1175 | Yellow | `#FAA72A` |
| 2000 | Orange | `#E86235` |
| 3600+ | Red | `#E04343` |

The green-to-yellow segment uses a power curve (`t^0.4`) for natural color spread at low outage values. Major outage seconds weigh 3.3x more than partial, so even short major outages shift the bar toward red. Validated against 27 non-green bars from the status page with an average color distance of 2.2 RGB units.

### Permissions

- **`alarms`** — periodic polling every 30 seconds
- **`storage`** — cache status data locally
- **`host_permissions: status.claude.com`** — fetch status API

No user data is collected or transmitted. See [Privacy Policy](PRIVACY.md).

## Project structure

```
├── manifest.json         # Chrome extension manifest (V3)
├── background.js         # Service worker: polling, data processing, icon rendering, gradient calculation
├── popup.html            # Popup markup
├── popup.js              # Popup rendering logic
├── popup.css             # Warm light/dark theme styles
├── test-bar-color.js     # Tests for bar color gradient (node test-bar-color.js)
└── icons/                # Static fallback icon PNGs
```

## Tests

```bash
node test-bar-color.js
```

Validates the gradient color function against all 27 non-green bars scraped from status.claude.com (79 tests covering edge cases, monotonicity, weighting, gradient stops, and per-bar accuracy).

## License

MIT
