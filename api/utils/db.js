const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, 
    database: process.env.DB_NAME,
    options: { encrypt: true, trustServerCertificate: true } // Encrypt true for cloud DBs
};

let pool = null;

async function getDb() {
    if (!pool) {
        pool = await sql.connect(dbConfig);
    }
    return pool;
}

module.exports = { getDb, sql };