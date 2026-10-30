async function swaggerCsrfInterceptor(request) {
  const api = new URL('../api/', window.location.href);
  const target = new URL(request.url, window.location.href);
  // Never send our session token to external servers or unrelated resources.
  if (target.origin !== api.origin || !target.pathname.startsWith(api.pathname)) {
    return request;
  }

  request.credentials = 'same-origin';
  const method = (request.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) return request;

  // Fetch on each write so login/logout token rotation cannot leave Swagger with a stale token.
  const response = await fetch(new URL('auth/csrf', api), {
    credentials: 'same-origin',
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Unable to obtain a CSRF token. Refresh Swagger and try again.');

  const csrf = await response.json();
  request.headers = request.headers || {};
  request.headers[csrf.headerName] = csrf.token;
  return request;
}
