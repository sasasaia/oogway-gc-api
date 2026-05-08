const { getPool, sql } = require("../lib/db");
const cors = require("../lib/cors");
const { getSession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const pool = await getPool();
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Unauthorized." });

  const action = req.query.action;

  // ── GET FEED ─────────────────────────────────────────────────
  if (req.method === "GET" && action === "feed") {
    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .query(
        `SELECT p.post_id, p.content, p.image_base64, p.created_at,
                u.user_id, u.username, u.first_name, u.last_name, u.avatar_base64,
                (SELECT COUNT(*) FROM Likes l WHERE l.post_id = p.post_id) AS like_count,
                (SELECT COUNT(*) FROM Comments c WHERE c.post_id = p.post_id) AS comment_count,
                CASE WHEN EXISTS(SELECT 1 FROM Likes lk WHERE lk.post_id = p.post_id AND lk.user_id = @uid) THEN 1 ELSE 0 END AS user_liked
         FROM Posts p
         JOIN Users u ON u.user_id = p.user_id
         WHERE p.user_id IN (SELECT followee_id FROM Follows WHERE follower_id = @uid)
            OR p.user_id = @uid
         ORDER BY p.created_at DESC
         OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY`
      );
    return res.status(200).json({ posts: result.recordset });
  }

  // ── GET SINGLE USER POSTS ─────────────────────────────────────
  if (req.method === "GET" && action === "user") {
    const targetId = parseInt(req.query.user_id);
    const result = await pool
      .request()
      .input("tid", sql.Int, targetId)
      .input("uid", sql.Int, session.user_id)
      .query(
        `SELECT p.post_id, p.content, p.image_base64, p.created_at,
                u.user_id, u.username, u.first_name, u.last_name, u.avatar_base64,
                (SELECT COUNT(*) FROM Likes l WHERE l.post_id = p.post_id) AS like_count,
                (SELECT COUNT(*) FROM Comments c WHERE c.post_id = p.post_id) AS comment_count,
                CASE WHEN EXISTS(SELECT 1 FROM Likes lk WHERE lk.post_id = p.post_id AND lk.user_id = @uid) THEN 1 ELSE 0 END AS user_liked
         FROM Posts p
         JOIN Users u ON u.user_id = p.user_id
         WHERE p.user_id = @tid
         ORDER BY p.created_at DESC`
      );
    return res.status(200).json({ posts: result.recordset });
  }

  // ── CREATE POST ───────────────────────────────────────────────
  if (req.method === "POST" && action === "create") {
    const { content, image_base64 } = req.body;
    if (!content && !image_base64) {
      return res.status(400).json({ error: "Post content is required." });
    }
    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .input("content", sql.NVarChar(sql.MAX), content || "")
      .input("img", sql.NVarChar(sql.MAX), image_base64 || null)
      .query(
        `INSERT INTO Posts (user_id, content, image_base64)
         OUTPUT INSERTED.post_id, INSERTED.content, INSERTED.image_base64, INSERTED.created_at
         VALUES (@uid, @content, @img)`
      );
    return res.status(201).json({ post: result.recordset[0] });
  }

  // ── DELETE POST ───────────────────────────────────────────────
  if (req.method === "DELETE" && action === "delete") {
    const postId = parseInt(req.query.post_id);
    await pool
      .request()
      .input("pid", sql.Int, postId)
      .input("uid", sql.Int, session.user_id)
      .query("DELETE FROM Posts WHERE post_id = @pid AND user_id = @uid");
    return res.status(200).json({ ok: true });
  }

  // ── LIKE / UNLIKE ─────────────────────────────────────────────
  if (req.method === "POST" && action === "like") {
    const { post_id } = req.body;
    const check = await pool
      .request()
      .input("pid", sql.Int, post_id)
      .input("uid", sql.Int, session.user_id)
      .query("SELECT 1 FROM Likes WHERE post_id = @pid AND user_id = @uid");

    if (check.recordset.length) {
      await pool
        .request()
        .input("pid", sql.Int, post_id)
        .input("uid", sql.Int, session.user_id)
        .query("DELETE FROM Likes WHERE post_id = @pid AND user_id = @uid");
      return res.status(200).json({ liked: false });
    } else {
      await pool
        .request()
        .input("pid", sql.Int, post_id)
        .input("uid", sql.Int, session.user_id)
        .query("INSERT INTO Likes (user_id, post_id) VALUES (@uid, @pid)");

      // Notify post owner
      const postOwner = await pool
        .request()
        .input("pid", sql.Int, post_id)
        .query("SELECT user_id FROM Posts WHERE post_id = @pid");
      if (postOwner.recordset.length && postOwner.recordset[0].user_id !== session.user_id) {
        await pool
          .request()
          .input("uid", sql.Int, postOwner.recordset[0].user_id)
          .input("aid", sql.Int, session.user_id)
          .input("pid", sql.Int, post_id)
          .query("INSERT INTO Notifications (user_id, type, actor_id, post_id) VALUES (@uid, 'like', @aid, @pid)");
      }
      return res.status(200).json({ liked: true });
    }
  }

  // ── GET COMMENTS ──────────────────────────────────────────────
  if (req.method === "GET" && action === "comments") {
    const postId = parseInt(req.query.post_id);
    const result = await pool
      .request()
      .input("pid", sql.Int, postId)
      .query(
        `SELECT c.comment_id, c.content, c.created_at,
                u.user_id, u.username, u.first_name, u.last_name, u.avatar_base64
         FROM Comments c JOIN Users u ON u.user_id = c.user_id
         WHERE c.post_id = @pid ORDER BY c.created_at ASC`
      );
    return res.status(200).json({ comments: result.recordset });
  }

  // ── ADD COMMENT ───────────────────────────────────────────────
  if (req.method === "POST" && action === "comment") {
    const { post_id, content } = req.body;
    if (!content) return res.status(400).json({ error: "Comment required." });
    const result = await pool
      .request()
      .input("pid", sql.Int, post_id)
      .input("uid", sql.Int, session.user_id)
      .input("content", sql.NVarChar(1000), content)
      .query(
        `INSERT INTO Comments (post_id, user_id, content)
         OUTPUT INSERTED.comment_id, INSERTED.content, INSERTED.created_at
         VALUES (@pid, @uid, @content)`
      );

    // Notify post owner
    const postOwner = await pool
      .request()
      .input("pid", sql.Int, post_id)
      .query("SELECT user_id FROM Posts WHERE post_id = @pid");
    if (postOwner.recordset.length && postOwner.recordset[0].user_id !== session.user_id) {
      await pool
        .request()
        .input("uid", sql.Int, postOwner.recordset[0].user_id)
        .input("aid", sql.Int, session.user_id)
        .input("pid", sql.Int, post_id)
        .query("INSERT INTO Notifications (user_id, type, actor_id, post_id) VALUES (@uid, 'comment', @aid, @pid)");
    }

    return res.status(201).json({ comment: result.recordset[0] });
  }

  return res.status(404).json({ error: "Not found." });
};