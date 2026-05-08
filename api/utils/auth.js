const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'oogway_secret';

function requireAuth(req) {
    const token = req.headers.authorization;
    if (!token) throw new Error('Access Denied');
    try { 
        return jwt.verify(token, secret); 
    } catch { 
        throw new Error('Invalid Token'); 
    }
}

module.exports = { requireAuth };