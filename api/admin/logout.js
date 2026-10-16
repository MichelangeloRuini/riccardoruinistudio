const {
  ACCESS_COOKIE,
  assertAllowedOrigin,
  assertMethod,
  clearSessionCookies,
  parseCookies,
  requestSupabase,
  sendError,
  sendJson
} = require("../_lib/server");

module.exports = async function logout(req, res) {
  try {
    assertMethod(req, ["POST"]);
    assertAllowedOrigin(req);
    const accessToken = parseCookies(req)[ACCESS_COOKIE];
    if (accessToken) {
      try {
        await requestSupabase("/auth/v1/logout", { method: "POST", accessToken });
      } catch {
        // Always clear the browser session, even if upstream revocation is unavailable.
      }
    }
    clearSessionCookies(res);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
};
