const db = require('../config/db');

const Issue = {
    create: async (issue) => {
        const { title, project_id, status, content, creator_id, assignee_id } = issue;
        const [result] = await db.query(
            'INSERT INTO tb_issues (title, project_id, status, content, creator_id, assignee_id) VALUES (?, ?, ?, ?, ?, ?)',
            [title, project_id, status, content, creator_id, assignee_id]
        );
        return result.insertId;
    },

    getAll: async () => {
        const [rows] = await db.query(`
            SELECT 
                i.id, 
                i.title, 
                p.name AS project_name, 
                i.status, 
                i.content, 
                uc.name AS creator_name, 
                ua.name AS assignee_name, 
                i.created_at
            FROM tb_issues i
            LEFT JOIN tb_projects p ON i.project_id = p.id
            LEFT JOIN tb_user uc ON i.creator_id = uc.id
            LEFT JOIN tb_user ua ON i.assignee_id = ua.id
            ORDER BY i.created_at DESC
        `);
        return rows;
    },

    getById: async (id) => {
        const [rows] = await db.query(`
            SELECT 
                i.id, 
                i.title, 
                i.project_id,
                p.name AS project_name, 
                i.status, 
                i.content, 
                i.creator_id,
                uc.name AS creator_name, 
                i.assignee_id,
                ua.name AS assignee_name, 
                i.created_at
            FROM tb_issues i
            LEFT JOIN tb_projects p ON i.project_id = p.id
            LEFT JOIN tb_user uc ON i.creator_id = uc.id
            LEFT JOIN tb_user ua ON i.assignee_id = ua.id
            WHERE i.id = ?
        `, [id]);
        return rows[0];
    },

    update: async (id, issue) => {
        const { title, project_id, status, content, assignee_id } = issue;
        const [result] = await db.query(
            'UPDATE tb_issues SET title = ?, project_id = ?, status = ?, content = ?, assignee_id = ? WHERE id = ?',
            [title, project_id, status, content, assignee_id, id]
        );
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await db.query('DELETE FROM tb_issues WHERE id = ?', [id]);
        return result.affectedRows;
    },

    // For create/edit form
    getAllProjects: async () => {
        const [rows] = await db.query('SELECT id, name FROM tb_projects');
        return rows;
    },

    getAllUsers: async () => {
        const [rows] = await db.query('SELECT id, name FROM tb_user');
        return rows;
    }
};

module.exports = Issue;
