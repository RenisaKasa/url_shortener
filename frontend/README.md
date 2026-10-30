# Angular frontend

From this directory:

- `npm ci` installs the locked dependencies.
- `npm start` serves http://localhost:4200 with the backend development proxy.
- `npm run build` creates the production build under `dist/frontend/browser/`.
- `npm test -- --watch=false` runs the component tests once.

Use relative `/api/...` URLs with Angular HttpClient. The configured proxy sends
`/api/**` and `/r/**` to http://localhost:8081. Start Spring Boot separately from
`../backend/`.

See the root README.md for setup and SECURITY.md for the session/CSRF contract.
The app has routing and HttpClient configured; application pages are not built yet.
