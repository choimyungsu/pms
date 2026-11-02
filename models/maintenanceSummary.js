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
        // item_version / manufacturer 컬럼이 없을 수도 있으므로 존재 여부를 확인해 유연하게 대응
        const hasVersion = await this.hasItemVersionColumn();
        const hasManufacturer = await this.hasItemColumn('manufacturer');

        if (hasVersion && hasManufacturer) {
            const values = items.map(item => [
                summaryId,
                item.item_name,
                item.item_detail || null,
                item.item_version || null,
                item.manufacturer || null
            ]);
            await pool.query(
                'INSERT INTO tb_maintenance_summary_items (summary_id, item_name, item_detail, item_version, manufacturer) VALUES ?',
                [values]
            );
        } else if (hasVersion) {
            const values = items.map(item => [
                summaryId,
                item.item_name,
                item.item_detail || null,
                item.item_version || null
            ]);
            await pool.query(
                'INSERT INTO tb_maintenance_summary_items (summary_id, item_name, item_detail, item_version) VALUES ?',
                [values]
            );
        } else {
            const values = items.map(item => [summaryId, item.item_name, item.item_detail]);
            await pool.query('INSERT INTO tb_maintenance_summary_items (summary_id, item_name, item_detail) VALUES ?', [values]);
        }
    },

    // 특정 컬럼 존재 여부 (1회 캐시)
    async hasItemColumn(columnName) {
        this._itemColumnCache = this._itemColumnCache || {};
        if (typeof this._itemColumnCache[columnName] !== 'undefined') {
            return this._itemColumnCache[columnName];
        }
        try {
            const [rows] = await pool.query(
                `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'tb_maintenance_summary_items'
                    AND COLUMN_NAME = ?`,
                [columnName]
            );
            this._itemColumnCache[columnName] = Number(rows[0].cnt) > 0;
        } catch (err) {
            this._itemColumnCache[columnName] = false;
        }
        return this._itemColumnCache[columnName];
    },

    // tb_maintenance_summary_items.item_version 컬럼 존재 여부 (1회 캐시)
    async hasItemVersionColumn() {
        if (typeof this._hasItemVersion !== 'undefined') return this._hasItemVersion;
        this._hasItemVersion = await this.hasItemColumn('item_version');
        return this._hasItemVersion;
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
