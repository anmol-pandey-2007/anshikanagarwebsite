# Next-Shuttle Countdown Board — P05 Prototype

A web prototype of the chosen concept for **INT335 Design Thinking, Project P05: Waiting for the Shuttle** (Group 5).

**HMW:** How might we help a day scholar at the gate stop decide quickly whether to wait for the shuttle or walk?

The board at the main gate stop shows:

- minutes until the **next shuttle** and the **shuttle after that**
- **walking time** to each academic block, so students can compare waiting with walking
- the **last updated** time, so students know how fresh the estimate is
- optionally, whether the next shuttle has **seats available or is full** (idea B7)

## How it works

The prototype is "Wizard of Oz": there is no GPS tracking. A teammate reports shuttles by hand.

| View | Device | Who uses it |
| --- | --- | --- |
| **Board** (`#board`) | Laptop or tablet at the gate stop | Students waiting at the stop |
| **Control** (`#control`) | Teammate's phone | Team member acting as the spotter |

1. Open the Board. It shows a 4-digit **board code**.
2. Open Control on a phone, enter the code and press **Connect**.
3. In **Settings**, enter the travel time from the previous stop to the gate and the walking times to each block. **Measure these yourselves.**
4. When a shuttle leaves the previous stop, press **Shuttle left**. The board starts counting down.
5. When the shuttle reaches the gate, press **Arrived**. The arrival log records predicted vs actual time.
6. Press **Export CSV** to download the log for the report (assumption A2: estimates within about 2 minutes).

Two tabs on the same device sync automatically. Different devices sync through [PeerJS](https://peerjs.com/), which needs an internet connection on both.

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `p05-shuttle-board`.
2. Upload `index.html`, `style.css`, `app.js` and `README.md` (Add file → Upload files → Commit).
3. Go to **Settings → Pages**, set Source to **Deploy from a branch**, Branch **main**, folder **/ (root)**, and save.
4. After about a minute the site is live at `https://<your-username>.github.io/p05-shuttle-board/`.
   - Board: `…/p05-shuttle-board/#board`
   - Control: `…/p05-shuttle-board/#control`

## What this prototype tests

| Assumption | How the prototype helps |
| --- | --- |
| A1: Students use the board to decide | Observe students at the stop while the board is running |
| A2: Estimates are accurate within ~2 min | Arrival log + CSV export |
| A3: Position can be reported without disrupting drivers | The spotter reports, not the driver |
| A4: The board is readable in a crowd | Large high-contrast digits, full-screen button |

## Notes

- No personal data is collected. Everything is stored in the browser (`localStorage`).
- All numbers on the board come from what the team enters; nothing is pre-filled.
- Built with AI assistance (Claude) for the code; this is disclosed in the project report.
