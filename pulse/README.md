# Pulse

Real-time production error tracker: ingest API, JavaScript SDK, and a live dashboard.

## Stack

- API: Fastify, Socket.IO, Zod, better-sqlite3
- SDK: browser + Node (`window.onerror`, unhandled rejections, breadcrumbs)
- Dashboard: React, Vite, Tailwind, Recharts
- Agent: Gemini, Octokit PRs, Nodemailer

Errors are fingerprinted and grouped. New events stream into the UI over WebSockets.

## Run Pulse itself

```bash
cd pulse
npm run setup
npm run dev
```

- Dashboard: http://127.0.0.1:5173
- API health: http://127.0.0.1:8787/health
- Demo DSN: `http://127.0.0.1:8787/ingest/pk_live_demo_pulse`

Set `GEMINI_API_KEY`, `GITHUB_TOKEN`, and SMTP in `pulse/.env`. The **PR alert inbox is not only in .env** — pick it per project in **Setup**.

## Add Pulse to any project

1. Open Pulse dashboard → **Setup / SDK**.
2. Create a project (or use Production App).
3. Save the **PR email** on that project. That inbox gets the AI fix + PR mail.
4. Copy the project DSN into the app:

**Local app**

```js
import { init, captureException } from '@pulse/sdk';

init({
  dsn: 'http://127.0.0.1:8787/ingest/YOUR_PROJECT_KEY',
  environment: 'local',
  release: 'dev',
});
```

**Production app** — deploy Pulse API, then use the public host with the same key:

```js
init({
  dsn: 'https://pulse.yourdomain.com/ingest/YOUR_PROJECT_KEY',
  environment: 'production',
  release: process.env.APP_VERSION,
});
```

5. Call `captureException(error)` in `catch`, or let the SDK catch `window.onerror` / unhandled rejections.

Same SDK, same project key. Only the DSN host changes: localhost vs your Pulse server. `environment: 'local'` vs `'production'` keeps events labeled in the dashboard.

## Flow

```
Any app SDK  →  POST /ingest/:key  →  SQLite group  →  live dashboard
                                      ↓
                               new error/fatal
                                      ↓
                    Gemini fix → GitHub PR → email saved on that project
```

Issue detail shows which inbox was used. Change it anytime from Setup; the next issue uses the new address.
