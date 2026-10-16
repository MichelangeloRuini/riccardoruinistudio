const {
  ADMIN_STATUSES,
  HttpError,
  assertAllowedOrigin,
  assertMethod,
  authenticateAdmin,
  isUuid,
  parseJsonBody,
  requestSupabase,
  sendError,
  sendJson
} = require("../../_lib/server");

module.exports = async function inquiryDetail(req, res) {
  try {
    assertMethod(req, ["GET", "PATCH"]);
    if (req.method === "PATCH") assertAllowedOrigin(req);
    const auth = await authenticateAdmin(req, res);
    const id = req.query.id;
    if (!isUuid(id)) throw new HttpError(400, "invalid_id", "The inquiry identifier is not valid.");

    const query = new URLSearchParams({ id: `eq.${id}`, limit: "1" });
    let result;

    if (req.method === "PATCH") {
      const body = parseJsonBody(req, 4 * 1024);
      const status = typeof body.status === "string" ? body.status.toLowerCase() : "";
      if (!ADMIN_STATUSES.has(status)) {
        throw new HttpError(400, "invalid_status", "Select a valid inquiry status.");
      }
      query.set("select", "id,created_at,name,email,company,service,description,budget,status");
      result = await requestSupabase(`/rest/v1/project_inquiries?${query}`, {
        method: "PATCH",
        accessToken: auth.accessToken,
        prefer: "return=representation",
        body: { status },
        phase: "admin_inquiry_update"
      });
    } else {
      query.set("select", "id,created_at,name,email,company,service,description,budget,status");
      result = await requestSupabase(`/rest/v1/project_inquiries?${query}`, {
        accessToken: auth.accessToken,
        phase: "admin_inquiry_detail"
      });
    }

    if (!result.ok) {
      throw new HttpError(500, "internal_error", "The request could not be completed. Please try again.");
    }
    if (!Array.isArray(result.data) || result.data.length === 0) {
      throw new HttpError(404, "not_found", "Inquiry not found.");
    }

    sendJson(res, 200, { ok: true, inquiry: result.data[0] });
  } catch (error) {
    sendError(res, error);
  }
};
