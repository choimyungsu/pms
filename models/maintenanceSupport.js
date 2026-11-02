const pool = require('../config/db');

const MaintenanceSupport = {
    async create(data) {
        const [result] = await pool.query('INSERT INTO tb_maintenance_support SET ?', data);
        return result.insertId;
    },

    async findAllBySummaryId(summaryId) {
        const [rows] = await pool.query(`
            SELECT 
                s.*, 
                u.name as creator_name 
            FROM 
                tb_maintenance_support s
            LEFT JOIN tb_user u ON s.creator_id = u.id
            WHERE 
                s.summary_id = ?
            ORDER BY 
                s.support_date DESC, s.created_at DESC
        `, [summaryId]);
        return rows;
    },

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_support WHERE id = ?', [id]);
        return rows[0];
    },

    async update(id, data) {
        const [result] = await pool.query('UPDATE tb_maintenance_support SET ? WHERE id = ?', [data, id]);
        return result.affectedRows;
    },

    async delete(id) {
        const [result] = await pool.query('DELETE FROM tb_maintenance_support WHERE id = ?', [id]);
        return result.affectedRows;
    }
};

module.exports = MaintenanceSupport;
