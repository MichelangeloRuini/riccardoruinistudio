const {
  assertMethod,
  sendError,
  sendJson
} = require("./_lib/server");

module.exports = function startProjectStatus(req, res) {
  try {
    assertMethod(req, ["GET"]);
    sendJson(res, 200, {
      enabled: process.env.PROJECT_INQUIRIES_ENABLED === "true"
    });
  } catch (error) {
    sendError(res, error);
  }
};
