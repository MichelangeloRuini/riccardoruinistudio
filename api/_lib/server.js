const crypto = require("node:crypto");

const ACCESS_COOKIE = "rrs_admin_access";
const REFRESH_COOKIE = "rrs_admin_refresh";
const JSON_LIMIT_BYTES = 16 * 1024;
const ADMIN_STATUSES = new Set(["new", "read", "archived"]);
const SUPABASE_TIMEOUT_MS = 10 * 1000;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function sendError(res, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { ok: false, code: error.code, message: error.message });
    return;
  }

  const safeCode = error && (error.status || error.code);
  console.error("[online-cms] request failed", safeCode || "unknown_error");
  sendJson(res, 500, {
    ok: false,
    code: "internal_error",
    message: "The request could not be completed. Please try again."
  });
}

function assertMethod(req, allowedMethods) {
  if (!allowedMethods.includes(req.method)) {
    throw new HttpError(405, "method_not_allowed", "Method not allowed.");
  }
}

function parseJsonBody(req, maxBytes = JSON_LIMIT_BYTES) {
  const contentLength = Number(req.headers && req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", "The submitted data is too large.");
  }

  const contentType = String((req.headers && req.headers["content-type"]) || "").toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    throw new HttpError(415, "unsupported_media_type", "Only JSON requests are accepted.");
  }

  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString("utf8");

  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new HttpError(413, "payload_too_large", "The submitted data is too large.");
    }

    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, "invalid_json", "The request body is not valid JSON.");
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_json", "The request body must be a JSON object.");
  }

  if (Buffer.byteLength(JSON.stringify(body), "utf8") > maxBytes) {
    throw new HttpError(413, "payload_too_large", "The submitted data is too large.");
  }

  return body;
}

function getSupabaseConfig({ serviceRole = false } = {}) {
  const configuredUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!configuredUrl || !anonKey || (serviceRole && !serviceRoleKey)) {
    throw new HttpError(503, "service_not_configured", "This service is not configured yet.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    const error = new HttpError(503, "service_not_configured", "This service is not configured yet.");
    error.diagnosticType = "url_invalid";
    throw error;
  }

  const invalidProtocol = parsedUrl.protocol !== "https:"
    && !(process.env.NODE_ENV !== "production" && parsedUrl.protocol === "http:");
  const hasUnexpectedUrlParts = parsedUrl.username
    || parsedUrl.password
    || parsedUrl.search
    || parsedUrl.hash
    || (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "");
  if (invalidProtocol || hasUnexpectedUrlParts) {
    const error = new HttpError(503, "service_not_configured", "This service is not configured yet.");
    error.diagnosticType = "url_invalid";
    throw error;
  }

  if (/[^\x20-\x7e]/.test(anonKey) || /[^\x20-\x7e]/.test(serviceRoleKey)) {
    const error = new HttpError(503, "service_not_configured", "This service is not configured yet.");
    error.diagnosticType = "request_invalid";
    throw error;
  }

  const url = parsedUrl.origin;
  return { url, anonKey, serviceRoleKey };
}

function isLegacyJwtKey(value) {
  const parts = String(value || "").split(".");
  return parts.length === 3 && parts[0].startsWith("eyJ");
}

function classifySupabaseFetchError(error) {
  const name = String((error && error.name) || "").toUpperCase();
  const code = String(
    (error && error.code)
    || (error && error.cause && error.cause.code)
    || ""
  ).toUpperCase();

  if (name === "TIMEOUTERROR" || name === "ABORTERROR" || [
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT"
  ].includes(code)) return "timeout";

  if (["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "ENODATA"].includes(code)) return "dns";

  if ([
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  ].includes(code) || code.startsWith("ERR_TLS_")) return "tls";

  if ([
    "ECONNREFUSED",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "UND_ERR_SOCKET"
  ].includes(code)) return "connection";

  if (code === "ERR_INVALID_URL") return "url_invalid";
  if (["ERR_INVALID_CHAR", "ERR_HTTP_INVALID_HEADER_VALUE", "UND_ERR_INVALID_ARG"].includes(code)) {
    return "request_invalid";
  }
  return "network_or_runtime";
}

function logSupabaseFailure(phase, status, failureType = "http_response") {
  const safePhase = typeof phase === "string" && /^[a-z0-9_]{1,64}$/.test(phase)
    ? phase
    : "unknown";
  console.error("[online-cms] supabase request failed", {
    phase: safePhase,
    failureType,
    upstreamStatus: Number.isInteger(status) ? status : null
  });
}

async function requestSupabase(path, options = {}) {
  let config;
  try {
    config = getSupabaseConfig({ serviceRole: options.serviceRole });
  } catch (error) {
    logSupabaseFailure(options.phase, null, error.diagnosticType || "configuration");
    throw error;
  }
  const apiKey = options.serviceRole ? config.serviceRoleKey : config.anonKey;
  const headers = {
    apikey: apiKey,
    ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.prefer ? { Prefer: options.prefer } : {})
  };
  const authorization = options.accessToken || (isLegacyJwtKey(apiKey) ? apiKey : "");
  if (authorization) headers.Authorization = `Bearer ${authorization}`;

  let response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
    });
  } catch (error) {
    logSupabaseFailure(options.phase, null, classifySupabaseFetchError(error));
    throw new HttpError(500, "internal_error", "The request could not be completed. Please try again.");
  }
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  const expectedStatuses = Array.isArray(options.expectedStatuses)
    ? options.expectedStatuses
    : [];
  if (!response.ok && !expectedStatuses.includes(response.status)) {
    logSupabaseFailure(options.phase, response.status, "http_response");
  }

  return { ok: response.ok, status: response.status, data };
}

function configuredOrigins() {
  const values = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (process.env.VERCEL_URL) values.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.NODE_ENV !== "production") {
    values.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return new Set(values);
}

function assertAllowedOrigin(req) {
  const origin = String((req.headers && req.headers.origin) || "").replace(/\/$/, "");
  if (!origin || !configuredOrigins().has(origin)) {
    throw new HttpError(403, "origin_not_allowed", "This request origin is not allowed.");
  }
}

function parseCookies(req) {
  const cookieHeader = String((req.headers && req.headers.cookie) || "");
  return cookieHeader.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return cookies;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!name) return cookies;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = "";
    }
    return cookies;
  }, {});
}

function cookie(name, value, { maxAge = 0 } = {}) {
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/api/admin",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`
  ].filter(Boolean).join("; ");
}

function setSessionCookies(res, session) {
  const accessMaxAge = Number(session.expires_in) || 3600;
  res.setHeader("Set-Cookie", [
    cookie(ACCESS_COOKIE, session.access_token, { maxAge: accessMaxAge }),
    cookie(REFRESH_COOKIE, session.refresh_token, { maxAge: 60 * 60 * 24 * 30 })
  ]);
}

function clearSessionCookies(res) {
  res.setHeader("Set-Cookie", [
    cookie(ACCESS_COOKIE, "", { maxAge: 0 }),
    cookie(REFRESH_COOKIE, "", { maxAge: 0 })
  ]);
}

async function getAuthUser(accessToken) {
  if (!accessToken) return null;
  const result = await requestSupabase("/auth/v1/user", {
    accessToken,
    phase: "admin_session_user",
    expectedStatuses: [401, 403]
  });
  if (!result.ok && ![401, 403].includes(result.status)) {
    throw new HttpError(500, "internal_error", "The request could not be completed. Please try again.");
  }
  return result.ok && result.data && result.data.id ? result.data : null;
}

async function refreshSession(refreshToken) {
  if (!refreshToken) return null;
  const result = await requestSupabase("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
    phase: "admin_session_refresh",
    expectedStatuses: [400, 401, 403]
  });
  if (!result.ok && ![400, 401, 403].includes(result.status)) {
    throw new HttpError(500, "internal_error", "The request could not be completed. Please try again.");
  }
  return result.ok
    && result.data
    && result.data.access_token
    && result.data.refresh_token
    ? result.data
    : null;
}

async function assertAdmin(accessToken, userId) {
  const query = new URLSearchParams({
    select: "user_id",
    user_id: `eq.${userId}`,
    limit: "1"
  });
  const result = await requestSupabase(`/rest/v1/admin_users?${query}`, {
    accessToken,
    phase: "admin_membership_check"
  });
  if (!result.ok) {
    throw new HttpError(500, "internal_error", "The request could not be completed. Please try again.");
  }
  return result.ok && Array.isArray(result.data) && result.data.length === 1;
}

async function authenticateAdmin(req, res) {
  const cookies = parseCookies(req);
  let accessToken = cookies[ACCESS_COOKIE];
  let user = await getAuthUser(accessToken);

  if (!user) {
    const session = await refreshSession(cookies[REFRESH_COOKIE]);
    if (!session) {
      clearSessionCookies(res);
      throw new HttpError(401, "authentication_required", "Your session has expired. Please log in again.");
    }
    setSessionCookies(res, session);
    accessToken = session.access_token;
    user = session.user || await getAuthUser(accessToken);
  }

  if (!user || !await assertAdmin(accessToken, user.id)) {
    clearSessionCookies(res);
    throw new HttpError(403, "admin_required", "This account is not authorized for the CMS.");
  }

  return { accessToken, user };
}

function clientAddress(req) {
  const headers = (req && req.headers) || {};
  const forwardedHeader = process.env.VERCEL
    ? headers["x-vercel-forwarded-for"] || headers["x-forwarded-for"]
    : headers["x-forwarded-for"];
  const forwarded = String(forwardedHeader || "")
    .split(",")[0]
    .trim();
  return forwarded || (req.socket && req.socket.remoteAddress) || "unknown";
}

function rateLimitHash(req, namespace = "project-inquiry") {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) {
    throw new HttpError(503, "service_not_configured", "This service is not configured yet.");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`${namespace}\0${clientAddress(req)}`)
    .digest("hex");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

module.exports = {
  ACCESS_COOKIE,
  ADMIN_STATUSES,
  HttpError,
  assertAdmin,
  assertAllowedOrigin,
  assertMethod,
  authenticateAdmin,
  clearSessionCookies,
  isUuid,
  parseCookies,
  parseJsonBody,
  rateLimitHash,
  requestSupabase,
  sendError,
  sendJson,
  setSessionCookies
};
