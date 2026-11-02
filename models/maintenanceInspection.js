const pool = require('../config/db');

const MaintenanceInspection = {
    async create(data) {
        const [result] = await pool.query('INSERT INTO tb_maintenance_inspections SET ?', data);
        return result.insertId;
    },

    async findBySummaryId(summaryId) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_inspections WHERE summary_id = ? ORDER BY inspection_date DESC', [summaryId]);
        return rows;
    },

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_inspections WHERE id = ?', [id]);
        return rows[0];
    },

    async delete(id) {
        const [result] = await pool.query('DELETE FROM tb_maintenance_inspections WHERE id = ?', [id]);
        return result.affectedRows;
    }
};

module.exports = MaintenanceInspection;
