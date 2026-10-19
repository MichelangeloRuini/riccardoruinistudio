const {
  assertMethod,
  authenticateAdmin,
  sendError,
  sendJson
} = require("../_lib/server");

module.exports = async function session(req, res) {
  try {
    assertMethod(req, ["GET"]);
    const auth = await authenticateAdmin(req, res);
    sendJson(res, 200, {
      ok: true,
      user: { id: auth.user.id, email: auth.user.email }
    });
  } catch (error) {
    sendError(res, error);
  }
};
