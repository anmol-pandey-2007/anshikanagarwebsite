# Next-Shuttle Countdown Board — P05 Prototype

A web prototype of the chosen concept for **INT335 Design Thinking, Project P05: Waiting for the Shuttle** (Group 5).

**HMW:** How might we help a day scholar at the gate stop decide quickly whether to wait for the shuttle or walk?

## Pages

| Page | Address | Who uses it | What it does |
| --- | --- | --- | --- |
| Home | `#home` | Everyone | Overview and test-day setup steps |
| Board | `#board` | Students at the stop | Next shuttle, shuttle after that, seats badge, walking times, board message, freshness of the data |
| Control | `#control` | Spotter (teammate) | **Report** tab: shuttle left / minutes away, board message. **Log** tab: predicted vs actual arrivals, CSV export. **Settings** tab: stop names, travel time, walking times, range mode, backup/restore/reset |

## How it works

The prototype is "Wizard of Oz": there is no GPS tracking. A teammate reports shuttles by hand.

1. Open **Board** on a laptop or tablet at the stop. It shows a 4-digit **board code**.
2. Open **Control** on the spotter's phone, enter the code and tap **Connect**.
3. In **Control → Settings**, enter the travel time from the previous stop and the walking times. **Measure these yourselves.**
4. When a shuttle leaves the previous stop, tap **Shuttle left**. When it reaches the gate, tap **Arrived**.
5. In **Control → Log**, tap **Export CSV** to download the arrival log for the report.

Tabs on the same device sync automatically. A board on a different device syncs through [PeerJS](https://peerjs.com/) (internet needed on both).

## Put it on GitHub Pages

1. Create a new repository, for example `p05-shuttle-board`.
2. Upload `index.html`, `style.css`, `app.js` and `README.md` (Add file → Upload files → Commit).
3. **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → Save.
4. After about a minute: `https://<your-username>.github.io/p05-shuttle-board/`

## What it tests

| Assumption | Where |
| --- | --- |
| A1: Students use the board to decide | Watch and ask students at the stop (paper observation sheet) |
| A2: Estimates within about 2 minutes | Control → Log (within-2-min count, CSV export) |
| A3: Reporting without disrupting drivers | The spotter reports, not the driver; ask the driver afterwards |
| A4: Readable in a crowd | Large high-contrast digits, full-screen button; check from different spots |

## Notes

- No names or personal details are collected.
- All numbers come from what the team enters; nothing is pre-filled. The small board on the Home page is an illustration only.
- Fonts: Plus Jakarta Sans and Space Grotesk (Google Fonts).
- Built with AI assistance (Claude) for the code; this is disclosed in the project report.
