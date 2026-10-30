const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(fetch) {
  const sandbox = {
    URL,
    fetch,
    window: { location: { href: 'http://localhost:8081/swagger-ui/index.html' } }
  };
  const source = readFileSync(path.join(__dirname, '../../main/resources/swagger/csrf-interceptor.js'), 'utf8');
  return { sandbox, interceptor: vm.runInNewContext(`(${source})`, sandbox) };
}

test('writes obtain a fresh session token, including after login rotation', async () => {
  let calls = 0;
  const { interceptor } = setup(async (url, options) => {
    assert.equal(url.href, 'http://localhost:8081/api/auth/csrf');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    const token = `token-${++calls}`;
    return { ok: true, json: async () => ({ headerName: 'X-CSRF-TOKEN', token }) };
  });
  const register = await interceptor({ url: '/api/auth/register', method: 'POST' });
  assert.equal(register.headers['X-CSRF-TOKEN'], 'token-1');
  const login = await interceptor({ url: '/api/auth/login', method: 'POST', headers: {} });
  assert.equal(login.headers['X-CSRF-TOKEN'], 'token-2');
  const update = await interceptor({ url: '/api/admin/users/1/status', method: 'patch' });
  assert.equal(update.headers['X-CSRF-TOKEN'], 'token-3');
  assert.equal(update.credentials, 'same-origin');
});

test('safe requests, external APIs and unrelated paths do not receive tokens', async () => {
  const { interceptor } = setup(() => { throw new Error('Unexpected token fetch'); });
  for (const request of [
    { url: '/api/auth/me', method: 'GET' },
    { url: '/api/auth/me' },
    { url: 'https://external.example/api/users', method: 'POST' },
    { url: '/v3/api-docs', method: 'GET' },
    { url: '/unrelated', method: 'POST' }
  ]) {
    assert.equal(await interceptor(request), request);
    assert.equal(request.headers, undefined);
  }
});

test('a servlet context path is respected', async () => {
  const { sandbox, interceptor } = setup(async (url) => {
    assert.equal(url.pathname, '/shortener/api/auth/csrf');
    return { ok: true, json: async () => ({ headerName: 'X-CSRF-TOKEN', token: 'context-token' }) };
  });
  sandbox.window.location.href = 'http://localhost:8081/shortener/swagger-ui/index.html';
  const request = await interceptor({ url: '/shortener/api/auth/register', method: 'POST' });
  assert.equal(request.headers['X-CSRF-TOKEN'], 'context-token');
});

test('token-fetch failures prevent a write', async () => {
  const { interceptor } = setup(async () => ({ ok: false }));
  await assert.rejects(interceptor({ url: '/api/auth/register', method: 'POST' }), /Unable to obtain a CSRF token/);
});

test('the actual Spring-transformed Swagger initializer installs the interceptor', () => {
  const { sandbox } = setup(async () => {});
  let config;
  sandbox.SwaggerUIBundle = Object.assign((options) => {
    config = options;
    return {};
  }, { presets: { apis: {} }, plugins: { DownloadUrl: {} } });
  sandbox.SwaggerUIStandalonePreset = {};
  const source = readFileSync(path.join(__dirname, '../../../target/swagger-initializer.js'), 'utf8');
  vm.runInNewContext(source, sandbox);
  sandbox.window.onload();
  assert.equal(typeof config.requestInterceptor, 'function');
  assert.equal(config.requestInterceptor.name, 'swaggerCsrfInterceptor');
});
