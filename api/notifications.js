const { getPool, sql } = require("../lib/db");
const cors = require("../lib/cors");
const { getSession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const pool = await getPool();
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Unauthorized." });

  const action = req.query.action;

  // ── LIST ──────────────────────────────────────────────────────
  if (req.method === "GET" && action === "list") {
    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .query(
        `SELECT n.notif_id, n.type, n.is_read, n.created_at, n.post_id,
                u.user_id AS actor_id, u.username AS actor_username,
                u.first_name AS actor_first_name, u.last_name AS actor_last_name,
                u.avatar_base64 AS actor_avatar
         FROM Notifications n
         JOIN Users u ON u.user_id = n.actor_id
         WHERE n.user_id = @uid
         ORDER BY n.created_at DESC
         OFFSET 0 ROWS FETCH NEXT 30 ROWS ONLY`
      );
    return res.status(200).json({ notifications: result.recordset });
  }

  // ── COUNT UNREAD ──────────────────────────────────────────────
  if (req.method === "GET" && action === "unread_count") {
    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .query("SELECT COUNT(*) AS cnt FROM Notifications WHERE user_id = @uid AND is_read = 0");
    return res.status(200).json({ count: result.recordset[0].cnt });
  }

  // ── MARK ALL READ ─────────────────────────────────────────────
  if (req.method === "POST" && action === "read_all") {
    await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .query("UPDATE Notifications SET is_read = 1 WHERE user_id = @uid");
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: "Not found." });
};