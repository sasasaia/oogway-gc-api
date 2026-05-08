const { getDb, sql } = require('./utils/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    try {
        const { username, password } = req.body;
        const pool = await getDb();
        const result = await pool.request().input('user', sql.NVarChar, username).query('SELECT * FROM Users WHERE Username = @user');
        
        if (result.recordset.length === 0) return res.status(400).json({ error: 'User not found' });
        
        const user = result.recordset[0];
        const valid = await bcrypt.compare(password, user.PasswordHash);
        if (!valid) return res.status(400).json({ error: 'Invalid password' });

        const secret = process.env.JWT_SECRET || 'oogway_secret';
        const token = jwt.sign({ id: user.Id, theme: user.Theme, name: `${user.FirstName} ${user.LastName}` }, secret);
        
        res.status(200).json({ token, theme: user.Theme, user: { id: user.Id, name: `${user.FirstName} ${user.LastName}` }});
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
}