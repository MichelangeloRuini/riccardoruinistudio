const {
  HttpError,
  assertAdmin,
  assertAllowedOrigin,
  assertMethod,
  parseJsonBody,
  rateLimitHash,
  requestSupabase,
  sendError,
  sendJson,
  setSessionCookies
} = require("../_lib/server");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function login(req, res) {
  try {
    assertMethod(req, ["POST"]);
    assertAllowedOrigin(req);
    const body = parseJsonBody(req, 8 * 1024);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!EMAIL_PATTERN.test(email) || email.length > 254 || password.length < 8 || password.length > 1024) {
      throw new HttpError(400, "invalid_credentials", "Enter a valid email and password.");
    }

    const keyHash = rateLimitHash(req, "admin-login");
    const rateLimit = await requestSupabase("/rest/v1/rpc/check_project_inquiry_rate_limit", {
      method: "POST",
      serviceRole: true,
      body: { p_key_hash: keyHash, p_max_requests: 10, p_window_seconds: 900 }
    });
    if (!rateLimit.ok) throw new Error(`login_rate_limit_${rateLimit.status}`);
    if (rateLimit.data !== true) {
      res.setHeader("Retry-After", "900");
      throw new HttpError(429, "rate_limited", "Too many login attempts. Please try again later.");
    }

    const result = await requestSupabase("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password }
    });

    if (
      !result.ok
      || !result.data
      || !result.data.access_token
      || !result.data.refresh_token
      || !result.data.user
    ) {
      throw new HttpError(401, "invalid_credentials", "Email or password is not valid.");
    }
    if (!await assertAdmin(result.data.access_token, result.data.user.id)) {
      throw new HttpError(403, "admin_required", "This account is not authorized for the CMS.");
    }

    setSessionCookies(res, result.data);
    sendJson(res, 200, {
      ok: true,
      user: { id: result.data.user.id, email: result.data.user.email }
    });
  } catch (error) {
    sendError(res, error);
  }
};
