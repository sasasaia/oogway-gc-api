const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { getPool, sql } = require("../lib/db");
const cors = require("../lib/cors");
const { getSession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const pool = await getPool();
  const action = req.query.action;

  // ── REGISTER ────────────────────────────────────────────────
  if (action === "register" && req.method === "POST") {
    const { first_name, last_name, username, password } = req.body;
    if (!first_name || !last_name || !username || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Check duplicate username
    const dup = await pool
      .request()
      .input("un", sql.NVarChar, username)
      .query("SELECT 1 FROM Users WHERE username = @un");
    if (dup.recordset.length) {
      return res.status(409).json({ error: "Username already taken." });
    }

    const hash = await bcrypt.hash(password, 12);
    const insert = await pool
      .request()
      .input("fn", sql.NVarChar, first_name)
      .input("ln", sql.NVarChar, last_name)
      .input("un", sql.NVarChar, username)
      .input("pw", sql.NVarChar, hash)
      .query(
        `INSERT INTO Users (first_name, last_name, username, password_hash)
         OUTPUT INSERTED.user_id, INSERTED.username, INSERTED.first_name, INSERTED.last_name, INSERTED.theme
         VALUES (@fn, @ln, @un, @pw)`
      );

    const user = insert.recordset[0];
    const sessionId = uuidv4();
    await pool
      .request()
      .input("sid", sql.NVarChar, sessionId)
      .input("uid", sql.Int, user.user_id)
      .query(
        `INSERT INTO Sessions (session_id, user_id, expires_at)
         VALUES (@sid, @uid, DATEADD(day, 30, GETDATE()))`
      );

    return res.status(201).json({ sessionId, user });
  }

  // ── LOGIN ────────────────────────────────────────────────────
  if (action === "login" && req.method === "POST") {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required." });
    }

    const result = await pool
      .request()
      .input("un", sql.NVarChar, username)
      .query(
        `SELECT user_id, username, first_name, last_name, password_hash, avatar_base64, theme
         FROM Users WHERE username = @un`
      );

    if (!result.recordset.length) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const user = result.recordset[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const sessionId = uuidv4();
    await pool
      .request()
      .input("sid", sql.NVarChar, sessionId)
      .input("uid", sql.Int, user.user_id)
      .query(
        `INSERT INTO Sessions (session_id, user_id, expires_at)
         VALUES (@sid, @uid, DATEADD(day, 30, GETDATE()))`
      );

    delete user.password_hash;
    return res.status(200).json({ sessionId, user });
  }

  // ── LOGOUT ───────────────────────────────────────────────────
  if (action === "logout" && req.method === "POST") {
    const sessionId = req.headers["x-session-id"];
    if (sessionId) {
      await pool
        .request()
        .input("sid", sql.NVarChar, sessionId)
        .query("DELETE FROM Sessions WHERE session_id = @sid");
    }
    return res.status(200).json({ ok: true });
  }

  // ── ME ───────────────────────────────────────────────────────
  if (action === "me" && req.method === "GET") {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized." });
    return res.status(200).json({ user: session });
  }

  return res.status(404).json({ error: "Not found." });
};