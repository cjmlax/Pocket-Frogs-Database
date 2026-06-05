# Pocket Frogs Database

An unofficial, searchable database of information for the mobile game Pocket Frogs.

This website is a continuation of my [Google Spreadsheet](https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/), meant to present the data better and allow for a smoother experience (that's also less reliant on Google).

This website is also two terrible things combined — a work in progress and vibe-coded. Please be patient while I work out the kinks and improve the experience. If you feel the urge to help out, I'm throwing this up here for contributions. The Google Sheet won't go away until I feel I've hit feature parity, and beyond that I plan to keep it up for quite some time so that people reroute to the new site properly. I have some experience with change management (mostly on the recieving end...) so I'll use it to the best of my ability.

I am also newer to Github, especially managing a repo. Please don't hesitate to reach out and start a conversion in whatever way feels right, I'm happy to take input and make changes since this entire project is comunnity-driven at its heart.

## Changelog (`public/changelog.json`)

The App Updates panel on the homepage pulls from two sources:

1. **Automatic** — the latest iOS version is fetched live from the Apple App Store API by the worker. It appears automatically whenever a new version ships.
2. **Manual** — older entries are read from `public/changelog.json`. The worker deduplicates by version number so the live entry never appears twice.

### Adding an entry

Add new entries at the **top** of the array, above any existing ones.

```json
[
  {
    "version": "3.9.0",
    "date": "2025-03-10T00:00:00Z",
    "platform": "both",
    "notes": "• New frog habitats\n• Bug fixes"
  },
  {
    "version": "3.8.0",
    "date": "2024-01-01T00:00:00Z",
    "platform": "both",
    "notes": "Example older entry."
  }
]
```

### Format rules

- **Newest entry at the top** of the array
- **Commas** go after each `}` except the very last entry
- **Line breaks** in `notes` must be written as `\n` — actual newlines inside a JSON string will break the file
- **`date`** must be ISO 8601 format: `"YYYY-MM-DDT00:00:00Z"` — just swap the date portion
- **`platform`** accepts `"ios"`, `"android"`, or `"both"` — not currently displayed in the UI but kept for reference