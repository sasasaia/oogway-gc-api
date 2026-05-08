const { getPool, sql } = require("../lib/db");
const cors = require("../lib/cors");
const { getSession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const pool = await getPool();
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Unauthorized." });

  const action = req.query.action;

  // ── GET CONVERSATIONS ─────────────────────────────────────────
  if (req.method === "GET" && action === "conversations") {
    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .query(
        `SELECT DISTINCT
           CASE WHEN m.sender_id = @uid THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
           u.username, u.first_name, u.last_name, u.avatar_base64,
           (SELECT TOP 1 content FROM Messages
            WHERE (sender_id = @uid AND receiver_id = u.user_id)
               OR (sender_id = u.user_id AND receiver_id = @uid)
            ORDER BY created_at DESC) AS last_message,
           (SELECT TOP 1 created_at FROM Messages
            WHERE (sender_id = @uid AND receiver_id = u.user_id)
               OR (sender_id = u.user_id AND receiver_id = @uid)
            ORDER BY created_at DESC) AS last_message_time,
           (SELECT COUNT(*) FROM Messages
            WHERE sender_id = u.user_id AND receiver_id = @uid AND is_read = 0) AS unread_count
         FROM Messages m
         JOIN Users u ON u.user_id = CASE WHEN m.sender_id = @uid THEN m.receiver_id ELSE m.sender_id END
         WHERE m.sender_id = @uid OR m.receiver_id = @uid
         ORDER BY last_message_time DESC`
      );
    return res.status(200).json({ conversations: result.recordset });
  }

  // ── GET MESSAGES WITH USER ────────────────────────────────────
  if (req.method === "GET" && action === "thread") {
    const otherId = parseInt(req.query.other_id);
    await pool
      .request()
      .input("sid", sql.Int, otherId)
      .input("rid", sql.Int, session.user_id)
      .query("UPDATE Messages SET is_read = 1 WHERE sender_id = @sid AND receiver_id = @rid AND is_read = 0");

    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .input("oid", sql.Int, otherId)
      .query(
        `SELECT m.msg_id, m.content, m.created_at, m.is_read,
                m.sender_id, u.username, u.first_name, u.last_name, u.avatar_base64
         FROM Messages m
         JOIN Users u ON u.user_id = m.sender_id
         WHERE (m.sender_id = @uid AND m.receiver_id = @oid)
            OR (m.sender_id = @oid AND m.receiver_id = @uid)
         ORDER BY m.created_at ASC`
      );
    return res.status(200).json({ messages: result.recordset });
  }

  // ── SEND MESSAGE ──────────────────────────────────────────────
  if (req.method === "POST" && action === "send") {
    const { receiver_id, content } = req.body;
    if (!content) return res.status(400).json({ error: "Message content required." });
    const result = await pool
      .request()
      .input("sid", sql.Int, session.user_id)
      .input("rid", sql.Int, receiver_id)
      .input("content", sql.NVarChar(sql.MAX), content)
      .query(
        `INSERT INTO Messages (sender_id, receiver_id, content)
         OUTPUT INSERTED.msg_id, INSERTED.content, INSERTED.created_at, INSERTED.sender_id
         VALUES (@sid, @rid, @content)`
      );
    return res.status(201).json({ message: result.recordset[0] });
  }

  return res.status(404).json({ error: "Not found." });
};