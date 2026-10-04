# Hub

Saathvik's personal command center: Gmail, Google Calendar, Google Tasks, synced notes, GitHub updates, a focus timer and the portfolio, all in one app.

**Live:** https://saathvikiscoding.github.io/hub/

It is a single web app (no build step, plain HTML/CSS/JS) hosted on GitHub Pages and installable as an app:

- **Windows:** open the link in Edge or Chrome, then click *Install* in the address bar. It gets its own window, Start-menu entry and taskbar icon (and can start at login from `edge://apps`).
- **iPhone:** open the link in Safari, tap *Share > Add to Home Screen*.
- **Any browser:** just use the link.

Everything syncs through your own Google and GitHub accounts, so every device sees the same data. There is no server and no database: the app talks to Google and GitHub directly from your browser.

## Screens

| Screen | What it does |
| --- | --- |
| Today | Next events, tasks due/overdue, unread mail, GitHub activity, focus timer, quick add (task / event in plain English / note) |
| Mail | Inbox, Unread, Starred, Important, Sent, Gmail search, read (safe HTML, images blocked until you allow them), reply, reply all, compose, archive, star, trash, turn an email into a task |
| Calendar | 30-day agenda across your calendars, plain-English quick add, new event, join call, map, delete |
| Tasks | Google Tasks lists, overdue / today / upcoming / no date, add with due date, edit, complete with undo |
| Jams | Game jam countdowns (upload target + deadline), submission checklist, progress updates (devlog), links, add deadlines to Google Calendar. Also shown on Today |
| Notes | Notes and ideas, pin, search, synced through a hidden app folder in Google Drive |
| Updates | GitHub notifications (with token), your activity, your repos |
| Portfolio | Live portfolio content, project and certificate links, edit/admin shortcut, latest commits, Pages deploy status |
| Settings | Connect Google and GitHub, notifications, install, setup guide |

Shortcuts: `Ctrl+K` command palette, `1`–`8` switch screens, `/` search, `c` compose, `r` refresh.

## One-time Google setup

1. Create a project at https://console.cloud.google.com.
2. Enable **Gmail API, Google Calendar API, Google Tasks API, Google Drive API**.
3. OAuth consent screen: External, add yourself as a test user.
4. Create an OAuth client ID of type **Web application** with
   - JavaScript origins: `https://saathvikiscoding.github.io`, `http://localhost:5174`
   - Redirect URIs: `https://saathvikiscoding.github.io/hub/`, `http://localhost:5174/`
5. Put the client ID in `config.js` (`googleClientId`), or paste it in Settings on each device.

The client ID is public by design. Tokens stay in your browser only; nothing secret is in this repo.

## Local preview

```bash
node tools/serve.mjs
```

Then open http://localhost:5174. To redraw the app icons: `node tools/make-icons.mjs`.
