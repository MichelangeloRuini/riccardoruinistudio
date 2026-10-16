const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const startProject = require("../api/start-project");
const login = require("../api/admin/login");
const logout = require("../api/admin/logout");
const session = require("../api/admin/session");
const listInquiries = require("../api/admin/inquiries");
const inquiryDetail = require("../api/admin/inquiries/[id]");

const root = path.resolve(__dirname, "..");

function responseFixture() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(value = "") {
      this.body = value;
    },
    json() {
      return JSON.parse(this.body);
    }
  };
}

function requestFixture(overrides = {}) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://preview.example.com",
      "x-forwarded-for": "192.0.2.10"
    },
    body: {
      name: "Ada Lovelace",
      email: "ADA@EXAMPLE.COM",
      company: "Analytical Engines",
      service: "Creative Direction",
      description: "A concise project description.",
      budget: "€25K–50K",
      website: ""
    },
    query: {},
    ...overrides
  };
}

function installEnvironment() {
  const previous = { ...process.env };
  process.env.PROJECT_INQUIRIES_ENABLED = "true";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  process.env.RATE_LIMIT_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.ALLOWED_ORIGINS = "https://preview.example.com";
  return () => {
    process.env = previous;
  };
}

function fetchResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => data === undefined ? "" : JSON.stringify(data)
  };
}

function adminSession() {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    user: { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com" }
  };
}

test("server validation normalizes inquiry data and rejects unknown options", () => {
  const valid = startProject._test.validateInquiry({
    name: "  Ada Lovelace  ",
    email: "  ADA@EXAMPLE.COM ",
    company: "",
    service: "Brand Identity",
    description: "Line one\r\nLine two",
    budget: "Prefer not to say",
    website: ""
  });

  assert.deepEqual(valid, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: null,
    service: "Brand Identity",
    description: "Line one\nLine two",
    budget: "Prefer not to say"
  });
  assert.throws(
    () => startProject._test.validateInquiry({ ...valid, service: "Unexpected", website: "" }),
    error => error.status === 400 && error.code === "invalid_service"
  );
});

test("public endpoint persists only after persistent rate limiting succeeds", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/rpc/check_project_inquiry_rate_limit")) {
      return { ok: true, status: 200, text: async () => "true" };
    }
    return { ok: true, status: 201, text: async () => "" };
  };

  try {
    const res = responseFixture();
    await startProject(requestFixture(), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().ok, true);
    assert.equal(calls.length, 2);
    const inserted = JSON.parse(calls[1].options.body);
    assert.equal(inserted.email, "ada@example.com");
    assert.equal(Object.hasOwn(inserted, "website"), false);
    assert.equal(calls[1].options.headers.apikey, "service-test-key");
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("feature flag, origin, method, honeypot and payload limits fail closed", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("fetch must not run");
  };

  try {
    const scenarios = [
      [requestFixture({ method: "GET" }), 405],
      [requestFixture({ headers: { "content-type": "application/json", origin: "https://evil.example" } }), 403],
      [requestFixture({ headers: { "content-type": "application/json" } }), 403],
      [requestFixture({ headers: { origin: "https://preview.example.com" } }), 415],
      [requestFixture({ headers: { "content-type": "text/plain", origin: "https://preview.example.com" } }), 415],
      [requestFixture({ body: { ...requestFixture().body, website: "spam" } }), 400],
      [requestFixture({ headers: { "content-type": "application/json", origin: "https://preview.example.com", "content-length": "20000" } }), 413]
    ];

    for (const [req, expectedStatus] of scenarios) {
      const res = responseFixture();
      await startProject(req, res);
      assert.equal(res.statusCode, expectedStatus);
    }

    process.env.PROJECT_INQUIRIES_ENABLED = "false";
    const disabled = responseFixture();
    await startProject(requestFixture(), disabled);
    assert.equal(disabled.statusCode, 503);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("the sixth inquiry in one persistent rate-limit window is rejected", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  let checks = 0;
  let inserts = 0;
  global.fetch = async url => {
    if (url.endsWith("/rpc/check_project_inquiry_rate_limit")) {
      checks += 1;
      return { ok: true, status: 200, text: async () => checks <= 5 ? "true" : "false" };
    }
    inserts += 1;
    return fetchResponse(201);
  };

  try {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const res = responseFixture();
      await startProject(requestFixture(), res);
      assert.equal(res.statusCode, attempt <= 5 ? 201 : 429);
      if (attempt === 6) assert.equal(res.getHeader("retry-after"), "900");
    }
    assert.equal(inserts, 5);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("a failed database insert never reports a successful inquiry", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (url.endsWith("/rpc/check_project_inquiry_rate_limit")) {
      return fetchResponse(200, true);
    }
    return fetchResponse(503, { message: "upstream unavailable" });
  };

  try {
    const res = responseFixture();
    await startProject(requestFixture(), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.json().ok, false);
    assert.equal(res.json().code, "internal_error");
    assert.doesNotMatch(res.body, /upstream unavailable/);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("anonymous users receive 401 from every admin data endpoint", async () => {
  const restoreEnvironment = installEnvironment();
  try {
    const id = "22222222-2222-4222-8222-222222222222";
    const scenarios = [
      [session, requestFixture({ method: "GET", headers: {}, body: undefined })],
      [listInquiries, requestFixture({ method: "GET", headers: {}, body: undefined })],
      [inquiryDetail, requestFixture({ method: "GET", headers: {}, body: undefined, query: { id } })],
      [inquiryDetail, requestFixture({
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://preview.example.com" },
        body: { status: "read" },
        query: { id }
      })]
    ];

    for (const [handler, req] of scenarios) {
      const res = responseFixture();
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().code, "authentication_required");
    }
  } finally {
    restoreEnvironment();
  }
});

test("admin login verifies membership server-side and stores tokens only in HttpOnly cookies", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  const auth = adminSession();
  global.fetch = async url => {
    if (url.endsWith("/rpc/check_project_inquiry_rate_limit")) return fetchResponse(200, true);
    if (url.includes("grant_type=password")) return fetchResponse(200, auth);
    if (url.includes("/rest/v1/admin_users")) return fetchResponse(200, [{ user_id: auth.user.id }]);
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const res = responseFixture();
    await login(requestFixture({
      body: { email: "admin@example.com", password: "strong-password" }
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().user.email, "admin@example.com");
    const cookies = res.getHeader("set-cookie");
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every(value => value.includes("HttpOnly") && value.includes("SameSite=Strict")));
    assert.doesNotMatch(res.body, /access-token|refresh-token/);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("valid Supabase users without explicit admin membership receive 403", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  const auth = adminSession();
  global.fetch = async url => {
    if (url.endsWith("/rpc/check_project_inquiry_rate_limit")) return fetchResponse(200, true);
    if (url.includes("grant_type=password")) return fetchResponse(200, auth);
    if (url.includes("/rest/v1/admin_users")) return fetchResponse(200, []);
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const res = responseFixture();
    await login(requestFixture({
      body: { email: "user@example.com", password: "strong-password" }
    }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, "admin_required");
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("CMS login has an IP-keyed persistent rate limit independent from public inquiries", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/rpc/check_project_inquiry_rate_limit")) return fetchResponse(200, false);
    throw new Error("Supabase Auth must not run after a denied rate-limit check");
  };

  try {
    process.env.PROJECT_INQUIRIES_ENABLED = "false";
    const res = responseFixture();
    await login(requestFixture({
      body: { email: "admin@example.com", password: "strong-password" }
    }), res);

    assert.equal(res.statusCode, 429);
    assert.equal(res.getHeader("retry-after"), "900");
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.p_max_requests, 10);
    assert.equal(body.p_window_seconds, 900);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("an expired access token is refreshed before returning the CMS session", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  const auth = adminSession();
  global.fetch = async (url, options) => {
    if (url.endsWith("/auth/v1/user") && options.headers.Authorization === "Bearer expired-token") {
      return fetchResponse(401, { message: "expired" });
    }
    if (url.includes("grant_type=refresh_token")) return fetchResponse(200, auth);
    if (url.includes("/rest/v1/admin_users")) return fetchResponse(200, [{ user_id: auth.user.id }]);
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const res = responseFixture();
    await session(requestFixture({
      method: "GET",
      headers: { cookie: "rrs_admin_access=expired-token; rrs_admin_refresh=refresh-token" },
      body: undefined
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().user.id, auth.user.id);
    assert.equal(res.getHeader("set-cookie").length, 2);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("authenticated admins can list, inspect, and update inquiry status", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  const auth = adminSession();
  const inquiry = {
    id: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-10-15T10:00:00Z",
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: null,
    service: "Creative Direction",
    description: "A project.",
    budget: null,
    status: "new"
  };
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return fetchResponse(200, auth.user);
    if (url.includes("/rest/v1/admin_users")) return fetchResponse(200, [{ user_id: auth.user.id }]);
    if (url.includes("/rest/v1/project_inquiries")) {
      const status = options.method === "PATCH" ? JSON.parse(options.body).status : inquiry.status;
      return fetchResponse(200, [{ ...inquiry, status }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const headers = { cookie: "rrs_admin_access=access-token" };
    const listRes = responseFixture();
    await listInquiries(requestFixture({ method: "GET", headers, body: undefined, query: { status: "new" } }), listRes);
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.json().inquiries[0].id, inquiry.id);

    const detailRes = responseFixture();
    await inquiryDetail(requestFixture({ method: "GET", headers, body: undefined, query: { id: inquiry.id } }), detailRes);
    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailRes.json().inquiry.description, "A project.");

    const patchRes = responseFixture();
    await inquiryDetail(requestFixture({
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json", origin: "https://preview.example.com" },
      body: { status: "archived" },
      query: { id: inquiry.id }
    }), patchRes);
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.json().inquiry.status, "archived");
    assert.ok(calls.some(call => call.options.method === "PATCH"));
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("logout revokes the Supabase session and expires both browser cookies", async () => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = global.fetch;
  let revoked = false;
  global.fetch = async url => {
    if (url.endsWith("/auth/v1/logout")) {
      revoked = true;
      return fetchResponse(204);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const res = responseFixture();
    await logout(requestFixture({
      headers: {
        origin: "https://preview.example.com",
        cookie: "rrs_admin_access=access-token; rrs_admin_refresh=refresh-token"
      },
      body: undefined
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(revoked, true);
    assert.ok(res.getHeader("set-cookie").every(value => value.includes("Max-Age=0")));
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("browser code contains no Supabase credentials and no public signup flow", () => {
  const browserSources = [
    fs.readFileSync(path.join(root, "script.js"), "utf8"),
    fs.readFileSync(path.join(root, "online-cms/cms.js"), "utf8"),
    fs.readFileSync(path.join(root, "online-cms/index.html"), "utf8")
  ].join("\n");
  assert.doesNotMatch(browserSources, /SUPABASE_(?:URL|ANON_KEY|SERVICE_ROLE_KEY)/);
  assert.doesNotMatch(browserSources, /signUp|\/signup|Create account/i);
});

test("database and Vercel configuration keep privileged surfaces private", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/001_project_inquiries.sql"),
    "utf8"
  );
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const ignored = fs.readFileSync(path.join(root, ".vercelignore"), "utf8");

  assert.match(migration, /alter table public\.project_inquiries enable row level security/);
  assert.match(migration, /private\.is_project_admin/);
  assert.doesNotMatch(migration, /create or replace function public\.is_project_admin/);
  assert.match(migration, /grant insert on table public\.project_inquiries to service_role/);
  assert.match(migration, /check_project_inquiry_rate_limit[\s\S]+security invoker/);
  assert.doesNotMatch(migration, /grant insert[^;]+(?:anon|authenticated)/);
  assert.match(ignored, /^\.env\*$/m);
  assert.match(ignored, /^admin-server\.js$/m);
  assert.ok(vercel.routes.some(route => route.status === 404 && route.src.includes("admin")));
  assert.ok(vercel.headers.some(rule =>
    rule.source === "/online-cms/:path*"
      && rule.headers.some(header => header.key === "Content-Security-Policy")
  ));
});
