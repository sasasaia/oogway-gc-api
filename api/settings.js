const { getDb, sql } = require('./utils/db');
const { requireAuth } = require('./utils/auth');

export default async function handler(req, res) {
    if (req.method !== 'PUT') return res.status(405).send('Method Not Allowed');
    
    try {
        const user = requireAuth(req);
        const { theme } = req.body;
        const pool = await getDb();
        
        await pool.request()
            .input('uid', sql.Int, user.id)
            .input('theme', sql.NVarChar, theme)
            .query('UPDATE Users SET Theme = @theme WHERE Id = @uid');
            
        res.status(200).json({ message: 'Theme updated' });
    } catch (err) {
        const status = (err.message === 'Access Denied' || err.message === 'Invalid Token') ? 401 : 500;
        res.status(status).json({ error: err.message });
    }
}