# URL Shortener

A single Git repository containing a Spring Boot API and an Angular application.

```text
backend/       Spring Boot, Maven, JPA, MySQL and security tests
frontend/      Angular application and development proxy
SECURITY.md    Authentication endpoints and frontend security contract
```

## Prerequisites

- JDK 17 or 21 and Maven (the assignment requires one of these Java versions).
- Node.js 22.12 or newer in the Node 22 line, and npm, for Angular 21.
- MySQL on localhost:3306, with a database named `url_shortener`.

## Backend

For a fresh checkout, copy `backend/.env.example` to `backend/.env` and set
`DB_PASSWORD`. An existing local `.env` has already been moved with the backend.
Never put database credentials in Angular code.

Run in the first terminal:

```powershell
cd backend
mvn spring-boot:run
```

The API listens on http://localhost:8081. Swagger is available at
http://localhost:8081/swagger-ui/index.html. Configuration loads `backend/.env`
when launched from the monorepo root, or `.env` when launched inside `backend/`.

In IntelliJ, import `backend/pom.xml` as a Maven project. Set the Spring Boot
run configuration's working directory to `$PROJECT_DIR$/backend` when opening
the monorepo root, or to the backend directory's absolute path.

## Frontend

Run in a second terminal, starting from the repository root:

```powershell
cd frontend
npm ci
npm start
```

Open http://localhost:4200. `npm start` enables `proxy.conf.json`, forwarding
`/api/**` and `/r/**` to Spring Boot on port 8081. Angular code should call
relative URLs such as `/api/auth/me`; do not hardcode port 8081 into services.
The browser uses the frontend origin and the proxy forwards session cookies.

The scaffold includes routing. Login/register pages, route guards, the CSRF
interceptor and URL-management screens are future application work. See
[SECURITY.md](SECURITY.md) for the backend contract and CSRF token lifecycle.

The development proxy only runs with `ng serve`. In production, serve the Angular
build and reverse-proxy `/api` and `/r` to Spring Boot under the same site.

## Verification

From `backend/`:

```powershell
mvn verify
```

Tests use H2 rather than your local MySQL database. JaCoCo enforces 80% overall
line coverage and writes `backend/target/site/jacoco/index.html`.

From `frontend/`:

```powershell
npm run build
npm test -- --watch=false
```

Commit source files and `frontend/package-lock.json`. Git ignores local `.env`
files, `node_modules/`, Maven `target/`, Angular `dist/` and `.angular/` output.
There is only one `.git` directory, at the repository root.
