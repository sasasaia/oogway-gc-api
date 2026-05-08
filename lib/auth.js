const { getPool, sql } = require("./db");

async function getSession(req) {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) return null;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("sid", sql.NVarChar, sessionId)
    .query(
      `SELECT s.user_id, u.username, u.first_name, u.last_name, u.avatar_base64, u.theme
       FROM Sessions s
       JOIN Users u ON u.user_id = s.user_id
       WHERE s.session_id = @sid AND s.expires_at > GETDATE()`
    );
  if (!result.recordset.length) return null;
  return result.recordset[0];
}

module.exports = { getSession };