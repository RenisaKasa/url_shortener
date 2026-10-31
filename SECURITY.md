# Security implementation

This backend uses Spring Security sessions. The browser stores an HttpOnly
`JSESSIONID` cookie; credentials and authentication state stay on the server.
Passwords are BCrypt hashes. Public registration always creates a `USER`.
Registration accepts passwords of at least 8 characters and at most 72 UTF-8 bytes
(the BCrypt limit).

## API contract

| Method | Path | Access / result |
| --- | --- | --- |
| GET | `/api/auth/csrf` | Public; returns `token`, `headerName`, `parameterName` and starts a session |
| POST | `/api/auth/register` | Public + CSRF; JSON `email`, `password`; returns 201 |
| POST | `/api/auth/login` | Public + CSRF; JSON `email`, `password`; returns account details |
| GET | `/api/auth/me` | Logged-in user; returns `id`, `email`, `role`, `active` |
| POST | `/api/auth/logout` | CSRF required; invalidates session; returns 204 |
| GET | `/api/admin/users` | ADMIN; paginated account details |
| GET | `/api/admin/test` | ADMIN; returns `{"message":"Admin access confirmed"}` |
| GET | `/api/admin/urls` | ADMIN; paginated URLs, without nested user credentials |
| PATCH | `/api/admin/users/{id}/status` | ADMIN + CSRF; JSON `{"active":false}` or `{"active":true}` |
| GET | `/r/{code}` | Reserved public route; redirect implementation is future URL-management work |
| GET | `/swagger-ui/index.html` | Public API documentation |

All other application routes require authentication. A normal user receives 403
on admin routes. Missing authentication receives 401. CSRF failures receive 403,
including on anonymous registration and login requests. Invalid inputs receive
400 with `fieldErrors`; conflicting registration receives 409. Unknown account
status updates receive 404. Error responses use `status`, `message`, `fieldErrors`.

Pagination uses `?page=0&size=20&sort=email,asc` (use URL fields when listing URLs).
The maximum page size is 100.

## Angular integration

Swagger's **Try it out** automatically fetches a fresh session CSRF token before
each API write and attaches its header. Reload Swagger after updating the backend.
Direct curl/API clients must still fetch `/api/auth/csrf`, retain the session cookie,
and send the token in the header; the displayed curl snippet alone omits the cookie jar.

Prefer an Angular development proxy forwarding `/api` and `/r` to
`http://localhost:8081`. Use relative API URLs.
`frontend/` contains the Angular scaffold and development proxy. Authentication
pages, guards and the CSRF interceptor still need to be implemented there.

1. Fetch `GET /api/auth/csrf` and retain the returned token in memory.
2. Include that value in the `X-CSRF-TOKEN` header on POST, PATCH, PUT and DELETE.
   Include the session cookie on every call. For direct cross-origin development
   requests, Angular HttpClient needs `withCredentials: true`.
3. Submit registration or login with a JSON body.
4. After successful login, fetch `/api/auth/csrf` again: login deliberately rotates
   the session ID and clears the old CSRF token. Store the new token.
5. Use `/api/auth/me` to restore account details on page reload. Fetch a token on
   reload as well. Route guards should use this identity and its role.
6. Submit logout with the current token. Clear the frontend identity and token;
   fetch a new token before the next login/registration.

The CSRF token comes from a JSON response, not an Angular XSRF cookie. Implement
an interceptor that attaches this header only to your backend requests; Angular's
default cookie interceptor alone is insufficient. Never persist the password.
Backend authorization remains the enforcement point even when guards hide pages.

For a quick browser-console smoke test while viewing Swagger on localhost:8081:

```javascript
let csrf = await fetch('/api/auth/csrf').then(r => r.json());
let response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', [csrf.headerName]: csrf.token},
  body: JSON.stringify({email: 'your-account@example.com', password: 'your-password'})
});
console.log(response.status, await response.json());
csrf = await fetch('/api/auth/csrf').then(r => r.json());
console.log(await fetch('/api/auth/me').then(r => r.json()));
```

## Account deactivation and ownership

Each session carries the account ID and a `sessionVersion`. Every authenticated
request rechecks the account in the database. Deactivation increments the version,
so every old session loses access on its next request. Reactivation does not
restore old sessions; a fresh login is required. Deletion also revokes access.
An already executing request is not retroactively cancelled.

`UrlAccessService.requireOwnedUrl` reads the owner from the authenticated session,
then queries by **both URL ID and owner ID**. Use it from future
update/delete/statistics services. Missing and foreign URLs both return 404.
The URL CRUD endpoints do not exist yet; this service is the tested ownership
foundation for those endpoints, not a replacement for implementing them.

## First administrator

Register an ordinary account using the API. As the database operator, explicitly
promote that account in your local MySQL database:

```sql
UPDATE users
SET role = 'ADMIN', session_version = session_version + 1
WHERE email = 'your-account@example.com';
```

Then log in again. There is no public role-change endpoint, default administrator
password, or automatic promotion. If you change roles manually later, increment
`session_version` again so sessions cannot retain outdated permissions.

## Configuration and verification

- Spring Boot loads the local password file from either launch directory:
  `backend/.env` from the monorepo root, or `.env` from inside `backend/`.
- Keep `DB_PASSWORD` in your local environment or `.env`; do not commit credentials.
- `FRONTEND_ORIGIN` defaults to `http://localhost:4200`. CORS allows credentials
  only from this configured origin; use the actual frontend origin in deployment.
- `SESSION_COOKIE_SECURE=true` is required for the production HTTPS deployment.
  Cookies use HttpOnly and SameSite=Lax. Deploy the frontend/backend on the same
  site; a cross-site deployment requires a deliberate cookie/CSRF configuration.
- Sessions expire after 30 minutes of inactivity and are held in memory. Restarting
  the application requires logging in again.
- Hibernate's existing `ddl-auto=update` adds the `session_version` column locally.
  Use managed migrations before a production deployment.
- Run `mvn verify` inside `backend/` to test against an isolated H2 database, build
  the application and enforce at least 80% overall line coverage.
  HTML report: `backend/target/site/jacoco/index.html`.
- After Maven verification, `node --test src/test/js/swagger-csrf.test.cjs` inside
  `backend/` tests Swagger's token handling and the real generated initializer.
- Use JDK 17 or 21 to run the assignment, as required by the brief. The compiler
  targets Java 17. Explicit Lombok processing also permits verification on this
  workstation's installed JDK 25; that does not change the assignment's runtime requirement.

Swagger uses springdoc 2.8.x, compatible with Spring Boot 3.5. The project does not
yet implement the remaining URL-management features or the Angular application pages.
