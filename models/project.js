class Project {
    constructor(id, name, description, start_date, end_date, status, pm_id) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.start_date = start_date;
        this.end_date = end_date;
        this.status = status;
        this.pm_id = pm_id;
    }
}

module.exports = Project;

const db = require('../config/db');

// 모든 프로젝트 목록을 가져오는 함수
exports.getAllProjects = async () => {
    const [rows] = await db.query('SELECT *, (SELECT name FROM tb_user WHERE id = tb_projects.pm_id) as pm_name FROM tb_projects');
    return rows;
};

// ID로 특정 프로젝트를 가져오는 함수
exports.getProjectById = async (id) => {
    const [rows] = await db.query('SELECT *, (SELECT name FROM tb_user WHERE id = tb_projects.pm_id) as pm_name FROM tb_projects WHERE id = ?', [id]);
    return rows[0];
};

// 프로젝트에 참여하는 사용자 목록을 가져오는 함수
exports.getProjectUsers = async (projectId) => {
    const [rows] = await db.query(`
        SELECT u.id, u.name, u.email 
        FROM tb_user u
        JOIN tb_project_users pu ON u.id = pu.user_id
        WHERE pu.project_id = ?
    `, [projectId]);
    return rows;
};

// WBS 데이터를 가져오는 함수
exports.getWbsData = async (projectId) => {
    const [rows] = await db.query('SELECT * FROM tb_wbs_tasks WHERE project_id = ? ORDER BY start_date', [projectId]);
    return rows;
};

// 프로젝트 ID로 메모 목록을 가져오는 함수
exports.getMemosByProjectId = async (projectId) => {
    const [rows] = await db.query(`
        SELECT m.id, m.title, u.name as creator_name, m.created_at
        FROM tb_memo m
        JOIN tb_user u ON m.creator_id = u.id
        WHERE m.project_id = ?
        ORDER BY m.created_at DESC
    `, [projectId]);
    return rows;
};

// 프로젝트 ID로 회의록 목록을 가져오는 함수
exports.getMinutesByProjectId = async (projectId) => {
    const [rows] = await db.query(`
        SELECT m.id, m.title, u.name as creator_name, m.meeting_date
        FROM tb_meeting_minutes m
        JOIN tb_user u ON m.creator_id = u.id
        WHERE m.project_id = ?
        ORDER BY m.meeting_date DESC
    `, [projectId]);
    return rows;
};