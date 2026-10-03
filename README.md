# Pocket Frogs Database

An unofficial, searchable database of information for the mobile game Pocket Frogs.

This website is a continuation of my [Google Spreadsheet](https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/), meant to present the data better and allow for a smoother experience (that's also less reliant on Google).

This website is also two terrible things combined — a work in progress and vibe-coded. Please be patient while I work out the kinks and improve the experience. If you feel the urge to help out, I'm throwing this up here for contributions. The Google Sheet won't go away until I feel I've hit feature parity, and beyond that I plan to keep it up for quite some time so that people reroute to the new site properly. I have some experience with change management (mostly on the recieving end...) so I'll use it to the best of my ability.

I am also newer to Github, especially managing a repo. Please don't hesitate to reach out and start a conversion in whatever way feels right, I'm happy to take input and make changes since this entire project is comunnity-driven at its heart.

## Changelog (Teable `Changelog` table)

The App Updates panel on the homepage reads from the `Changelog` table in Teable.

1. **Automatic** — the submissions worker polls the Apple App Store daily and adds a row for each new iOS version (`Source` = iTunes Poller). It skips a version that already has an iOS row.
2. **Manual** — older entries, Android releases, or corrections can be added directly in Teable (`Source` = Manual).

### Fields

| Field | Notes |
|---|---|
| **Version** | e.g. `3.9.0`. Not unique — the same version can appear once per platform. |
| **Date** | Release date. The feed is sorted by this, newest first. |
| **Platform** | `iOS`, `Android`, or `Both`. iOS/Android are shown on the entry; `Both` is hidden. |
| **Visible** | Unchecked entries are hidden from the site without deleting them. |
| **Source** | `iTunes Poller` or `Manual` — for reference only. |
| **Change Notes** | Release notes. Line breaks can be typed directly. |
