# Privacy Policy — Claude Code Status Extension

**Last updated:** April 9, 2026

## Data collection

This extension does **not** collect, store, or transmit any personal data.

## What the extension does

- Fetches publicly available service status data from `status.claude.com` (Anthropic's public status page API)
- Caches the fetched status data locally in your browser using `chrome.storage.local`
- Displays the cached data in the extension popup

## Network requests

The extension makes requests only to:

- `https://status.claude.com/api/v2/summary.json`
- `https://status.claude.com/api/v2/incidents.json`

These are public, unauthenticated API endpoints. No cookies, tokens, or identifying information are sent with these requests.

## Local storage

Status data is cached in `chrome.storage.local` to avoid unnecessary network requests when opening the popup. This data is:

- Stored only on your device
- Never transmitted to any third party
- Automatically refreshed every 30 seconds
- Removed when the extension is uninstalled

## Third-party services

This extension is not affiliated with Anthropic. It reads from Anthropic's public status page API.

## Contact

For questions about this privacy policy, open an issue at [github.com/michaljuris/claude-status-chrome-extension](https://github.com/michaljuris/claude-status-chrome-extension).
