const { getDb, sql } = require('./utils/db');
const { requireAuth } = require('./utils/auth');

// Vercel config to allow larger payloads for base64 images
export const config = {
    api: { bodyParser: { sizeLimit: '4mb' } }
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://oogway-gc.github.io');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // Notice we added Authorization here so JWT tokens can be sent!
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const user = requireAuth(req);
        const pool = await getDb();

        if (req.method === 'POST') {
            const { content, imageBase64 } = req.body;
            await pool.request()
                .input('uid', sql.Int, user.id)
                .input('content', sql.NVarChar, content || '')
                .input('img', sql.NVarChar, imageBase64 || null) 
                .query('INSERT INTO Posts (UserId, Content, ImageUrl) VALUES (@uid, @content, @img)');
            
            return res.status(200).json({ message: 'Post created!' });
        } 
        
        if (req.method === 'GET') {
            const posts = await pool.request()
                .input('uid', sql.Int, user.id)
                .query(`
                    SELECT p.*, u.FirstName, u.LastName FROM Posts p
                    JOIN Users u ON p.UserId = u.Id
                    WHERE p.UserId IN (SELECT FollowedId FROM Follows WHERE FollowerId = @uid) OR p.UserId = @uid
                    ORDER BY p.CreatedAt DESC
                `);
            return res.status(200).json(posts.recordset);
        }

        return res.status(405).send('Method Not Allowed');
    } catch (err) {
        const status = (err.message === 'Access Denied' || err.message === 'Invalid Token') ? 401 : 500;
        res.status(status).json({ error: err.message });
    }
}