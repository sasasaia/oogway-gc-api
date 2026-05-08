const { getPool, sql } = require("../lib/db");
const cors = require("../lib/cors");
const { getSession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const pool = await getPool();
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Unauthorized." });

  const action = req.query.action;

  // ── LIST EVENTS ───────────────────────────────────────────────
  if (req.method === "GET" && action === "list") {
    const filterUser = req.query.user_id ? parseInt(req.query.user_id) : null;
    const filterCat = req.query.category || null;

    let query = `
      SELECT e.event_id, e.title, e.description, e.category, e.start_date, e.end_date, e.color, e.created_at,
             u.user_id, u.username, u.first_name, u.last_name
      FROM Events e
      JOIN Users u ON u.user_id = e.user_id
      WHERE 1=1
    `;
    const req2 = pool.request();

    if (filterUser) {
      query += " AND e.user_id = @fuid";
      req2.input("fuid", sql.Int, filterUser);
    }
    if (filterCat) {
      query += " AND e.category = @cat";
      req2.input("cat", sql.NVarChar, filterCat);
    }

    query += " ORDER BY e.start_date ASC";
    const result = await req2.query(query);
    return res.status(200).json({ events: result.recordset });
  }

  // ── CREATE EVENT ──────────────────────────────────────────────
  if (req.method === "POST" && action === "create") {
    const { title, description, category, start_date, end_date, color } = req.body;
    if (!title || !start_date) return res.status(400).json({ error: "Title and start date required." });

    const result = await pool
      .request()
      .input("uid", sql.Int, session.user_id)
      .input("title", sql.NVarChar(200), title)
      .input("desc", sql.NVarChar(1000), description || null)
      .input("cat", sql.NVarChar(100), category || null)
      .input("sd", sql.DateTime, new Date(start_date))
      .input("ed", sql.DateTime, end_date ? new Date(end_date) : null)
      .input("color", sql.NVarChar(20), color || "#1a73e8")
      .query(
        `INSERT INTO Events (user_id, title, description, category, start_date, end_date, color)
         OUTPUT INSERTED.*
         VALUES (@uid, @title, @desc, @cat, @sd, @ed, @color)`
      );
    return res.status(201).json({ event: result.recordset[0] });
  }

  // ── DELETE EVENT ──────────────────────────────────────────────
  if (req.method === "DELETE" && action === "delete") {
    const eventId = parseInt(req.query.event_id);
    await pool
      .request()
      .input("eid", sql.Int, eventId)
      .input("uid", sql.Int, session.user_id)
      .query("DELETE FROM Events WHERE event_id = @eid AND user_id = @uid");
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: "Not found." });
};