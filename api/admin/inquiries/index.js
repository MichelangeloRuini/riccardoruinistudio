const {
  ADMIN_STATUSES,
  HttpError,
  assertMethod,
  authenticateAdmin,
  requestSupabase,
  sendError,
  sendJson
} = require("../../_lib/server");

module.exports = async function listInquiries(req, res) {
  try {
    assertMethod(req, ["GET"]);
    const auth = await authenticateAdmin(req, res);
    const requestedStatus = req.query && typeof req.query.status === "string"
      ? req.query.status.toLowerCase()
      : "";
    if (requestedStatus && !ADMIN_STATUSES.has(requestedStatus)) {
      throw new HttpError(400, "invalid_status", "Select a valid inquiry status.");
    }
    const query = new URLSearchParams({
      select: "id,created_at,name,email,company,status",
      order: "created_at.desc",
      limit: "500"
    });
    if (ADMIN_STATUSES.has(requestedStatus)) query.set("status", `eq.${requestedStatus}`);

    const result = await requestSupabase(`/rest/v1/project_inquiries?${query}`, {
      accessToken: auth.accessToken
    });
    if (!result.ok) throw new Error(`list_${result.status}`);

    sendJson(res, 200, { ok: true, inquiries: result.data || [] });
  } catch (error) {
    sendError(res, error);
  }
};
