# site-customer

Customer-facing product site and engineering blog for **AeroFlow Air** (fictional airport product; real platform engineering portfolio).

- **Organisation repo:** [aeroflow-air/site-customer](https://github.com/aeroflow-air/site-customer)
- **Live URL (GitHub Pages):** https://aeroflow-air.github.io/site-customer/
- **Decision:** [ADR-0003 — Public site and engineering blog](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/adr/0003-public-site-and-engineering-blog.md) (draft). PR: [platform-handbook#6](https://github.com/aeroflow-air/platform-handbook/pull/6).

Static Astro site. Blog posts use a content collection; the Platform page **links** into `platform-handbook` ADRs and does not copy them.

## Local run

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm run dev
```

Open the URL Astro prints (usually `http://localhost:4321/site-customer/`). The `base` path is `/site-customer/` so project Pages URLs match production.

```bash
npm run build    # output → dist/
npm run preview  # serve the production build locally
```

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) builds on `main` and deploys with `actions/upload-pages-artifact` + `actions/deploy-pages`.

Enable **Pages** for the repository: Source = **GitHub Actions**.

Required workflow permissions: `pages: write`, `id-token: write`, `contents: read`.

## Site map

| Path | Purpose |
| --- | --- |
| `/` | Product home (airport ops face) |
| `/engineering/` | Blog index |
| `/engineering/<slug>/` | Blog post |
| `/platform/` | Links to handbook ADRs and related repos |

## Stack notes

- Astro 5.x, `output: 'static'`
- `site`: `https://aeroflow-air.github.io`
- `base`: `/site-customer/`
- Content collections: `src/content.config.ts` + `src/content/blog/`

British English. Keep the tone like a squad of six — clear, not enterprise theatre.
