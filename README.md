# URL Shortener

A URL shortening and management application built with Spring Boot and Angular.
Users can create short links, manage their availability and expiration, and view
click statistics. Administrators can manage user accounts and view all links.

## Features

- Registration, login and logout with session authentication and CSRF protection.
- Short links with optional custom aliases and public redirects.
- URL search, status filtering, sorting and pagination.
- Link activation, deactivation, expiration updates and deletion.
- Bulk activation, deactivation and deletion of owned links.
- Duplicate-destination warnings, with the option to create another link.
- QR code previews and PNG downloads for short links.
- Automatic deactivation of expired links.
- Click counts, last-access timestamps, dashboard totals and most-clicked links.
- Administrator access to user accounts and all shortened URLs.

## Requirements

- Java 17 or 21
- MySQL
- Node.js 22.12 or later in the Node 22 release line, with npm

The backend uses Spring Boot 3.5 and Maven; the frontend uses Angular 21.
A Maven wrapper is included in `backend/`.

## Run locally

The commands below use PowerShell and assume you have cloned the repository.

### 1. Create the database

Run the following in MySQL:

```sql
CREATE DATABASE url_shortener;
```

The default connection is `localhost:3306`, database `url_shortener`, user `root`.
If your connection differs, update `spring.datasource.url` and
`spring.datasource.username` in `backend/src/main/resources/application.properties`.
Hibernate creates and updates the tables when the application starts.

### 2. Configure and start the backend

From the repository root:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set your MySQL password in `backend/.env`:

```properties
DB_PASSWORD=your-mysql-password
```

Then start the API:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

The API runs at [http://localhost:8081](http://localhost:8081).
Keep this terminal open while using the application.

### 3. Start the frontend

In a second terminal, from the repository root:

```powershell
cd frontend
npm ci
npm start
```

Open [http://localhost:4200](http://localhost:4200) and register an account.
New accounts receive the `USER` role. After logging in, create a short link,
copy it and open it in another tab. The dashboard provides link management and
usage statistics.

Short links and QR codes generated on localhost work on the computer running
the application. Scanning them on another device requires an address that
device can reach.

The development server forwards `/api` and `/r` requests to the backend.
Both servers must be running.

### 4. Create an administrator (optional)

Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to `backend/.env`, using an email that
does not already belong to a regular user. The password must contain at least
8 characters and use at most 72 UTF-8 bytes.

Stop the backend, then run this from `backend/`:

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=bootstrap-admin"
```

After the administrator is created, stop the application and start it normally:

```powershell
.\mvnw.cmd spring-boot:run
```

Remove the bootstrap credentials from `.env` when finished. Log in through the
frontend with the administrator account to access user and link management.
An existing administrator is left unchanged by the bootstrap process.

## Link expiration

Links expire after 30 days by default. Users may choose a future expiration
when creating a link or change it later. Disabled and expired links do not
redirect visitors. Expired links are retained with their statistics and are
deactivated by a background task that runs every minute.

The frontend offers 1-day, 7-day and 30-day expiration presets. To reactivate
an expired link, choose a future expiration date and enable it.

The defaults are configured in `backend/src/main/resources/application.properties`:

```properties
app.urls.default-lifetime=P30D
app.urls.expiration.enabled=true
app.urls.expiration.check-interval=PT1M
app.urls.expiration.initial-delay=PT1M
```

Durations use ISO 8601 notation: `P30D` is 30 days and `PT1M` is one minute.
Redirects check expiration immediately, independently of the background task.

## API documentation

With the backend running, open
[Swagger UI](http://localhost:8081/swagger-ui/index.html).

| Path | Purpose |
| --- | --- |
| `/api/auth` | Registration, login, logout, current account, password changes and CSRF tokens |
| `/api/urls` | Create, list and manage the authenticated user's links |
| `GET /api/urls/duplicates` | Find existing links for a destination, with pagination and sorting |
| `PATCH /api/urls/bulk` | Activate or deactivate up to 100 owned links |
| `POST /api/urls/bulk-delete` | Delete up to 100 owned links |
| `/api/dashboard/statistics` | Statistics for the authenticated user's links |
| `/api/admin` | Administrator user and link management |
| `/r/{code}` | Public redirect to the original URL |

Passwords are hashed with BCrypt. Authentication uses an HTTP-only session
cookie; write requests require a CSRF token. Swagger obtains these tokens
automatically. Log in through `/api/auth/login` before testing protected
endpoints. Administrators use the same login endpoint.

Bulk requests succeed or fail as a whole. Missing or foreign URL IDs reject
the selection, and expired links must receive a future expiration before
they can be enabled. Duplicate checks are advisory and do not prevent creation.

## Tests and builds

From `backend/`:

```powershell
.\mvnw.cmd verify
```

Backend tests use H2 and do not require a running MySQL instance. Verification
includes an 80% overall backend line-coverage check. The coverage report is
generated at `backend/target/site/jacoco/index.html`, along with the application
JAR in `backend/target/`.

From `frontend/`:

```powershell
npm.cmd run test:coverage
npm.cmd run build
```

Frontend verification runs once and checks at least 80% coverage for
statements, branches, functions and lines. Open
`frontend/coverage/frontend/index.html` for the report. For watch mode during
development, run `npm.cmd test`.

The frontend build is generated in `frontend/dist/frontend/browser/`.
For deployment, serve the frontend and proxy `/api` and `/r` to the backend
under the same site. The Angular development proxy is only available with
`npm start`. Enable `SESSION_COOKIE_SECURE=true` when serving over HTTPS.

## Repository structure

```text
backend/       Spring Boot API, database access and backend tests
frontend/      Angular application and frontend tests
```

Local `.env` files, dependencies and generated build files are excluded from Git.
