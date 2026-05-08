const { getPool, sql } = require("../lib/db");
const cors = require("../lib/cors");
const { getSession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const pool = await getPool();
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Unauthorized." });

  const action = req.query.action;

  // ── SEARCH USERS ─────────────────────────────────────────────
  if (req.method === "GET" && action === "search") {
    const q = req.query.q || "";
    const result = await pool
      .request()
      .input("q", sql.NVarChar, "%" + q + "%")
      .input("uid", sql.Int, session.user_id)
      .query(
        `SELECT u.user_id, u.username, u.first_name, u.last_name, u.avatar_base64,
                CASE WHEN EXISTS(SELECT 1 FROM Follows f WHERE f.follower_id = @uid AND f.followee_id = u.user_id) THEN 1 ELSE 0 END AS is_following
         FROM Users u
         WHERE (u.username LIKE @q OR u.first_name LIKE @q OR u.last_name LIKE @q)
           AND u.user_id <> @uid
         ORDER BY u.username`
      );
    return res.status(200).json({ users: result.recordset });
  }

  // ── GET PROFILE ───────────────────────────────────────────────
  if (req.method === "GET" && action === "profile") {
    const targetId = parseInt(req.query.user_id || session.user_id);
    const result = await pool
      .request()
      .input("tid", sql.Int, targetId)
      .input("uid", sql.Int, session.user_id)
      .query(
        `SELECT u.user_id, u.username, u.first_name, u.last_name, u.bio, u.avatar_base64, u.created_at,
                (SELECT COUNT(*) FROM Follows f WHERE f.followee_id = u.user_id) AS followers_count,
                (SELECT COUNT(*) FROM Follows f WHERE f.follower_id = u.user_id) AS following_count,
                (SELECT COUNT(*) FROM Posts p WHERE p.user_id = u.user_id) AS posts_count,
                CASE WHEN EXISTS(SELECT 1 FROM Follows f WHERE f.follower_id = @uid AND f.followee_id = u.user_id) THEN 1 ELSE 0 END AS is_following
         FROM Users u WHERE u.user_id = @tid`
      );
    if (!result.recordset.length) return res.status(404).json({ error: "User not found." });
    return res.status(200).json({ user: result.recordset[0] });
  }

  // ── FOLLOW / UNFOLLOW ─────────────────────────────────────────
  if (req.method === "POST" && action === "follow") {
    const { target_id } = req.body;
    if (target_id === session.user_id) return res.status(400).json({ error: "Cannot follow yourself." });

    const check = await pool
      .request()
      .input("frid", sql.Int, session.user_id)
      .input("feid", sql.Int, target_id)
      .query("SELECT 1 FROM Follows WHERE follower_id = @frid AND followee_id = @feid");

    if (check.recordset.length) {
      await pool
        .request()
        .input("frid", sql.Int, session.user_id)
        .input("feid", sql.Int, target_id)
        .query("DELETE FROM Follows WHERE follower_id = @frid AND followee_id = @feid");
      return res.status(200).json({ following: false });
    } else {
      await pool
        .request()
        .input("frid", sql.Int, session.user_id)
        .input("feid", sql.Int, target_id)
        .query("INSERT INTO Follows (follower_id, followee_id) VALUES (@frid, @feid)");

      await pool
        .request()
        .input("uid", sql.Int, target_id)
        .input("aid", sql.Int, session.user_id)
        .query("INSERT INTO Notifications (user_id, type, actor_id) VALUES (@uid, 'follow', @aid)");

      return res.status(200).json({ following: true });
    }
  }

  // ── UPDATE PROFILE ────────────────────────────────────────────
  if (req.method === "PUT" && action === "profile") {
    const { bio, avatar_base64 } = req.body;
    await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .input("bio", sql.NVarChar(500), bio || null)
      .input("av", sql.NVarChar(sql.MAX), avatar_base64 || null)
      .query("UPDATE Users SET bio = @bio, avatar_base64 = @av WHERE user_id = @uid");
    return res.status(200).json({ ok: true });
  }

  // ── UPDATE THEME ──────────────────────────────────────────────
  if (req.method === "PUT" && action === "theme") {
    const { theme } = req.body;
    await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .input("theme", sql.NVarChar(50), theme)
      .query("UPDATE Users SET theme = @theme WHERE user_id = @uid");
    return res.status(200).json({ ok: true });
  }

  // ── GET SUGGESTIONS (people to follow) ───────────────────────
  if (req.method === "GET" && action === "suggestions") {
    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .query(
        `SELECT TOP 8 u.user_id, u.username, u.first_name, u.last_name, u.avatar_base64,
                (SELECT COUNT(*) FROM Follows f WHERE f.followee_id = u.user_id) AS followers_count
         FROM Users u
         WHERE u.user_id <> @uid
           AND u.user_id NOT IN (SELECT followee_id FROM Follows WHERE follower_id = @uid)
         ORDER BY followers_count DESC`
      );
    return res.status(200).json({ users: result.recordset });
  }

  return res.status(404).json({ error: "Not found." });
};