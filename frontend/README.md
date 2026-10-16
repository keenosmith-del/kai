# kai frontend

Run `npm ci` then `npm run dev` from this directory. Vite runs on port 5175 and proxies `/api` to the API on port 5051. Start PostgreSQL, run migrations and start Express as described in the [root README](../README.md).

Pages retain `src/pages/<PageName>/<PageName>.jsx` and `.css`. Shared application styling and tokens live in `src/components/AppShell.css`; approved SignIn and Welcome styling remains local to those pages. Publication lists reuse `Feed` and `PublicationCard`. The Tiptap composer is loaded on demand.

`npm run build` produces `dist`; `npm run lint` runs Oxlint. A production host must route `/api` to Express and fall back to `index.html` for frontend deep links.
