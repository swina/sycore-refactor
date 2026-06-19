# Vercel Deploy Instructions

This project has **two separate Vercel deployments**:

| Target | Vercel Project | Source | Output |
|--------|---------------|--------|--------|
| App (PWA) | `sycore-gen-app` | root repo | `dist/` |
| Website | `sycore-website` | `dist-site/` | `dist-site/` |

---

## Prerequisites

```bash
npm i -g vercel
vercel login
```

---

## App Deploy (PWA)

The app is a Vue 3 + Vite PWA. Vercel builds it from the repo root using `vercel.json`.

**Production deploy:**
```bash
npm run deploy:app
# or manually:
vercel deploy --prod
```

**Preview deploy:**
```bash
vercel deploy
```

`vercel.json` settings (root):
- Framework: `vite`
- Build command: `vite build`
- Output: `dist/`
- SPA rewrites: all routes → `index.html`
- Cache headers: `/icons/*` and `/assets/*` are immutable (1 year)

---

## Website Deploy

The website is a static marketing build with a separate entry point (`website.html`). It builds to `dist-site/` and injects its own `vercel.json` (no framework, no install/build step) so Vercel treats it as a static upload.

**Build then deploy:**
```bash
npm run deploy:website
# expands to:
npm run build:website
vercel link --cwd dist-site --project sycore-website --yes
vercel deploy --cwd dist-site --prod
```

**Build only (inspect output before deploying):**
```bash
npm run build:website
# output in dist-site/
```

**Preview the website locally:**
```bash
npm run preview:website
```

The build plugin (`website-html-as-index` in `vite.config.js`) automatically:
1. Renames `website.html` → `index.html` in the output
2. Writes a `vercel.json` into `dist-site/` that disables framework detection

---

## Environment Variables

Set env vars in the Vercel dashboard or via CLI:

```bash
# List current vars
vercel env ls

# Add a var
vercel env add MY_VAR production

# Pull all vars to .env.local
vercel env pull .env.local
```

Key vars used by this project:
- `VITE_FREESOUND_API_KEY` — Freesound API
- `VITE_GEMINI_API_KEY` — Google Gemini AI
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis (KV)

---

## Notes

- The app and website are **separate Vercel projects** — each has its own URL, env vars, and deploy history.
- The app's `vercel.json` at the repo root applies only to the app project.
- The website's `vercel.json` is generated at build time inside `dist-site/` and overrides any project-level settings.
- Do **not** run `vite build` (default) when deploying the website — always use `build:website` to target the correct entry and output dir.
