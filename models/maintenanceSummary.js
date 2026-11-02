const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

const MaintenanceSummary = {
    pool: pool,
    async create(data) {
        const [result] = await pool.query('INSERT INTO tb_maintenance_summary SET ?', data);
        return result.insertId;
    },

    async addAttachment(summaryId, filePath, fileName) {
        const [result] = await pool.query('INSERT INTO tb_maintenance_summary_attachments SET ?', {
            summary_id: summaryId,
            file_path: filePath,
            file_name: fileName
        });
        return result.insertId;
    },

    async findAttachmentsBySummaryId(summaryId) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_summary_attachments WHERE summary_id = ?', [summaryId]);
        return rows;
    },

    async getAttachmentById(id) {
        const [rows] = await pool.query('SELECT id, file_path, file_name FROM tb_maintenance_summary_attachments WHERE id = ?', [id]);
        return rows[0];
    },

    async deleteAttachment(id) {
        const [result] = await pool.query('DELETE FROM tb_maintenance_summary_attachments WHERE id = ?', [id]);
        return result.affectedRows;
    },

    async findAll() {
        const [rows] = await pool.query(`
            SELECT 
                s.*, 
                (SELECT COUNT(*) FROM tb_maintenance_summary_attachments a WHERE a.summary_id = s.id) as attachment_count,
                d.text as dept_name
            FROM 
                tb_maintenance_summary s
            LEFT JOIN tb_user u ON s.main_engineer = u.name
            LEFT JOIN tb_dept d ON u.department_id = d.id
        `);
        return rows;
    },

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_summary WHERE id = ?', [id]);
        if (rows.length > 0) {
            const summary = rows[0];
            summary.attachments = await this.findAttachmentsBySummaryId(id);
            summary.items = await this.findItemsBySummaryId(id);
            return summary;
        }
        return null;
    },

    async findItemsBySummaryId(id) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_summary_items WHERE summary_id = ?', [id]);
        return rows;
    },

    async addItems(summaryId, items) {
        if (!items || items.length === 0) return;
        const values = items.map(item => [summaryId, item.item_name, item.item_detail]);
        await pool.query('INSERT INTO tb_maintenance_summary_items (summary_id, item_name, item_detail) VALUES ?', [values]);
    },

    async deleteItemsBySummaryId(summaryId) {
        await pool.query('DELETE FROM tb_maintenance_summary_items WHERE summary_id = ?', [summaryId]);
    },

    async update(id, data) {
        const [result] = await pool.query('UPDATE tb_maintenance_summary SET ? WHERE id = ?', [data, id]);
        return result.affectedRows;
    },

    async delete(id) {
        const attachments = await this.findAttachmentsBySummaryId(id);
        for (const attachment of attachments) {
            fs.unlink(path.join(__dirname, '..', attachment.file_path), (err) => {
                if (err) console.error(err);
            });
        }
        await pool.query('DELETE FROM tb_maintenance_summary_attachments WHERE summary_id = ?', [id]);
        const [result] = await pool.query('DELETE FROM tb_maintenance_summary WHERE id = ?', [id]);
        return result.affectedRows;
    }
};

module.exports = MaintenanceSummary;
