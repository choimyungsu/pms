const pool = require('./config/db');
const fs = require('fs');

async function runSQL() {
    const sql = fs.readFileSync('create_maintenance_support_table.sql', 'utf8');
    try {
        await pool.query(sql);
        console.log('SQL executed successfully');
    } catch (err) {
        console.error('Error executing SQL:', err);
    } finally {
        process.exit();
    }
}

runSQL();
