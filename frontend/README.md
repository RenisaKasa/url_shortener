# Angular frontend

- `npm ci` installs dependencies.
- `npm start` serves the app at http://localhost:4200.
- `npm run build` creates the production build.
- `npm test -- --watch=false` runs the frontend tests.

Start the backend separately from `../backend/`.

Edit `src/environments/environment.ts` for the API base path.
`proxy.conf.json` forwards `/api` and `/r` to the backend on port 8081 during development.
Production should reverse-proxy these paths to the backend under the same site.

Edit `public/messages/en.json` for frontend labels, headings, validation messages,
and page text. Messages load at startup; refresh to load changes.
