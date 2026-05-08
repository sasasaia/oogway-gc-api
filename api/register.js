const { getDb, sql } = require('./utils/db');
const bcrypt = require('bcryptjs');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    try {
        const { firstName, lastName, username, password } = req.body;
        const pool = await getDb();
        
        const check = await pool.request().input('user', sql.NVarChar, username).query('SELECT * FROM Users WHERE Username = @user');
        if (check.recordset.length > 0) return res.status(400).json({ error: 'Username already exists!' });

        const hashed = await bcrypt.hash(password, 10);
        await pool.request()
            .input('fn', sql.NVarChar, firstName)
            .input('ln', sql.NVarChar, lastName)
            .input('user', sql.NVarChar, username)
            .input('pass', sql.NVarChar, hashed)
            .query('INSERT INTO Users (FirstName, LastName, Username, PasswordHash) VALUES (@fn, @ln, @user, @pass)');
        
        res.status(200).json({ message: 'Registered successfully!' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
}