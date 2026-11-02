const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const knowledgeController = require('./knowledgeController'); // knowledgeController 임포트

const formatDate = (date) => {
    if (!date || !(date instanceof Date)) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 프로젝트 목록 페이지
exports.getProjectList = async (req, res) => {
    try {
        const query = `
            SELECT 
                p.*,
                pm.name AS pm_name,
                sales_rep.name AS sales_rep_name,
                creator.name AS creator_name
            FROM tb_projects p
            LEFT JOIN tb_user pm ON p.pm_id = pm.id
            LEFT JOIN tb_user sales_rep ON p.sales_rep_id = sales_rep.id
            LEFT JOIN tb_user creator ON p.creator_id = creator.id
            ORDER BY p.created_at DESC;
        `;
        const [projects] = await db.query(query);
        res.render('projects/list', { 
            title: '프로젝트 목록', 
            projects,
            currentUser: req.session.user,
            page: 'project_list'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 프로젝트 등록 페이지
exports.getCreateProjectPage = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, name FROM tb_user');
        res.render('projects/create', {
            title: '새 프로젝트 등록',
            currentUser: req.session.user,
            page: 'project_create',
            users: users
        });
    } catch (err) {
        console.error('Error fetching users for project creation:', err);
        res.status(500).send('서버 오류');
    }
};

// 프로젝트 생성
exports.createProject = async (req, res) => {
    const { name, description, start_date, end_date, status, pm_id, sales_rep_id, progress } = req.body;
    const creator_id = req.session.user.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [projectResult] = await connection.query('INSERT INTO tb_projects (name, description, start_date, end_date, status, pm_id, sales_rep_id, progress, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
            [name, description, start_date, end_date, status, pm_id, sales_rep_id, progress || 0, creator_id]);
        const projectId = projectResult.insertId;

        await connection.commit();
        res.redirect('/projects');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('서버 오류');
    } finally {
        connection.release();
    }
};

// 프로젝트 상세 정보
exports.getProjectDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT 
                p.*,
                pm.name AS pm_name,
                sales_rep.name AS sales_rep_name
            FROM tb_projects p
            LEFT JOIN tb_user pm ON p.pm_id = pm.id
            LEFT JOIN tb_user sales_rep ON p.sales_rep_id = sales_rep.id
            WHERE p.id = ?;
        `;
        const [projects] = await db.query(query, [id]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];

        const [assignedUsers] = await db.query('SELECT u.id, u.name FROM tb_user u JOIN tb_project_users pu ON u.id = pu.user_id WHERE pu.project_id = ?', [id]);

        if (project.pm_id) {
            const [pmUser] = await db.query('SELECT id, name FROM tb_user WHERE id = ?', [project.pm_id]);
            if (pmUser.length > 0) {
                const isPmAlreadyAssigned = assignedUsers.some(user => user.id === pmUser[0].id);
                if (!isPmAlreadyAssigned) {
                    assignedUsers.push({ id: pmUser[0].id, name: `${pmUser[0].name} (PM)` });
                } else {
                    const pmIndex = assignedUsers.findIndex(user => user.id === pmUser[0].id);
                    assignedUsers[pmIndex].name = `${assignedUsers[pmIndex].name} (PM)`;
                }
            }
        }
        const [allUsers] = await db.query('SELECT id, name FROM tb_user');
        const [wbsTasks] = await db.query('SELECT t.*, u.name as assigned_user_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id WHERE t.project_id = ? ORDER BY t.id', [id]);
        const [linkedKnowledge] = await db.query('SELECT k.id, k.title, k.type, k.status, k.start_date, k.end_date, k.description1, k.created_at, pkl.creator_id FROM tb_knowledge k JOIN tb_project_knowledge_links pkl ON k.id = pkl.knowledge_id WHERE pkl.project_id = ? ORDER BY pkl.created_at DESC', [id]);
        const [memos] = await db.query('SELECT m.id, m.title, u.name as creator_name, m.created_at FROM tb_memo m JOIN tb_user u ON m.creator_id = u.id WHERE m.project_id = ? ORDER BY m.created_at DESC', [id]);
        const [minutes] = await db.query('SELECT m.id, m.title, u.name as creator_name, m.meeting_date FROM tb_meeting_minutes m JOIN tb_user u ON m.user_id = u.id WHERE m.project_id = ? ORDER BY m.meeting_date DESC', [id]);
        const [issues] = await db.query('SELECT i.*, u.name as assignee_name FROM tb_issues i LEFT JOIN tb_user u ON i.assignee_id = u.id WHERE i.project_id = ? ORDER BY i.created_at DESC', [id]);

        for (const knowledgeItem of linkedKnowledge) {
            const [attachments] = await db.query(
                'SELECT id, file_path, original_name FROM tb_knowledge_attachments WHERE knowledge_id = ?',
                [knowledgeItem.id]
            );
            knowledgeItem.attachments = attachments;
        }

        const formatWbsForJstree = (tasks) => {
            return tasks.map(task => {
                const text = `${task.task_name}`;
                return {
                    id: task.id,
                    parent: task.parent_id || '#',
                    text: text,
                    data: {
                        task_name: task.task_name,
                        start_date: task.start_date ? new Date(task.start_date).toISOString().split('T')[0] : '',
                        end_date: task.end_date ? new Date(task.end_date).toISOString().split('T')[0] : '',
                        progress: task.progress,
                        assigned_user_id: task.assigned_user_id,
                        duration: task.duration
                    }
                };
            });
        };
        const wbsJstreeData = formatWbsForJstree(wbsTasks);

        const [knowledgeCategories] = await db.query(`SELECT id, name, parent_id FROM tb_knowledge_categories ORDER BY name`);
        const [knowledgeTypes] = await db.query(`SELECT DISTINCT type FROM tb_knowledge WHERE type IS NOT NULL AND type != '' ORDER BY type`);

        res.render('projects/details', {
            title: `프로젝트: ${project.name}`,
            project,
            assignedUsers,
            allUsers,
            wbsTasks: wbsJstreeData,
            linkedKnowledge,
            memos,
            minutes,
            issues,
            currentUser: req.session.user,
            page: 'project_details',
            knowledgeCategories: knowledgeCategories,
            knowledgeTypes: knowledgeTypes.map(row => row.type)
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// WBS 엑셀 업로드
exports.uploadWbsExcel = async (req, res) => {
    const { id: projectId } = req.params;
    const { deleteExistingWbs } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' });
    }

    const connection = await db.getConnection();
    try {
        const [projects] = await connection.query('SELECT pm_id FROM tb_projects WHERE id = ?', [projectId]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== project.pm_id)) {
            return res.status(403).send('권한이 없습니다.');
        }

        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });

        const tasks = rows.slice(1).map(row => {
            if (!row[0]) return null;

            const parseDate = (dateString) => {
                if (!dateString) return null;
                const date = new Date(dateString);
                return isNaN(date.getTime()) ? null : date;
            };

            const progress = parseInt(row[3], 10);

            return {
                task_name: row[0],
                start_date: parseDate(row[1]),
                end_date: parseDate(row[2]),
                progress: !isNaN(progress) ? progress : 0,
                assigned_user_name: row[4] || null,
                parent_task_name: row[5] || null
            };
        }).filter(task => task !== null);

        await connection.beginTransaction();

        if (deleteExistingWbs === 'true') {
            await connection.query('DELETE FROM tb_wbs_tasks WHERE project_id = ?', [projectId]);
        }

        const [users] = await connection.query('SELECT id, name FROM tb_user');
        const userMap = new Map(users.map(user => [user.name, user.id]));

        const taskNameMap = new Map();

        for (const task of tasks) {
            const assigned_user_id = task.assigned_user_name ? userMap.get(task.assigned_user_name) : null;
            const startDate = formatDate(task.start_date);
            const endDate = formatDate(task.end_date);

            const [result] = await connection.query(
                'INSERT INTO tb_wbs_tasks (project_id, task_name, start_date, end_date, progress, assigned_user_id) VALUES (?, ?, ?, ?, ?, ?)',
                [projectId, task.task_name, startDate, endDate, task.progress, assigned_user_id]
            );
            taskNameMap.set(task.task_name, result.insertId);
        }

        for (const task of tasks) {
            if (task.parent_task_name) {
                const parent_id = taskNameMap.get(task.parent_task_name);
                const child_id = taskNameMap.get(task.task_name);
                if (parent_id && child_id) {
                    await connection.query('UPDATE tb_wbs_tasks SET parent_id = ? WHERE id = ?', [parent_id, child_id]);
                }
            }
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: '엑셀 업로드 중 오류가 발생했습니다.' });
    } finally {
        connection.release();
        if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    }
};

// WBS 엑셀 다운로드
exports.downloadWbsExcel = async (req, res) => {
    const { id: projectId } = req.params;

    try {
        const [tasks] = await db.query('SELECT t.*, u.name as assigned_user_name, p.task_name as parent_task_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id LEFT JOIN tb_wbs_tasks p ON t.parent_id = p.id WHERE t.project_id = ? ORDER BY t.id', [projectId]);

        const data = tasks.map(task => ([
            task.id,
            task.task_name,
            task.start_date ? new Date(task.start_date).toLocaleDateString() : '',
            task.end_date ? new Date(task.end_date).toLocaleDateString() : '',
            task.progress,
            task.assigned_user_name,
            task.parent_task_name
        ]));

        data.unshift(['ID', 'Task Name', 'Start Date', 'End Date', 'Progress', 'Assigned To', 'Parent Task']);

        const ws = xlsx.utils.aoa_to_sheet(data);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'WBS');

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=wbs.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 프로젝트에 사용자 할당
exports.assignUserToProject = async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body;
    try {
        const [projects] = await db.query('SELECT pm_id FROM tb_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== project.pm_id)) {
            return res.status(403).send('권한이 없습니다.');
        }

        await db.query('INSERT INTO tb_project_users (project_id, user_id) VALUES (?, ?)', [id, user_id]);
        res.redirect(`/projects/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('사용자 할당 중 오류 발생');
    }
};

// 프로젝트에서 사용자 제거
exports.removeUserFromProject = async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body;
    try {
        const [projects] = await db.query('SELECT pm_id FROM tb_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== project.pm_id)) {
            return res.status(403).send('권한이 없습니다.');
        }

        await db.query('DELETE FROM tb_project_users WHERE project_id = ? AND user_id = ?', [id, user_id]);
        res.redirect(`/projects/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('사용자 제거 중 오류 발생');
    }
};

// 프로젝트 수정 페이지
exports.getEditProjectPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [projects] = await db.query('SELECT * FROM tb_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== project.pm_id)) {
            return res.status(403).send('프로젝트를 수정할 권한이 없습니다.');
        }
        const [users] = await db.query('SELECT id, name FROM tb_user');
        res.render('projects/edit', {
            title: `프로젝트 수정: ${projects[0].name}`,
            project: projects[0],
            currentUser: req.session.user,
            page: 'project_edit',
            users: users
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 프로젝트 업데이트
exports.updateProject = async (req, res) => {
    const { id } = req.params;
    const { name, description, start_date, end_date, status, pm_id, sales_rep_id, progress } = req.body;
    try {
        const [projects] = await db.query('SELECT pm_id, creator_id FROM tb_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== project.pm_id)) {
            return res.status(403).send('프로젝트를 수정할 권한이 없습니다.');
        }

        let query;
        let params;

        if (currentUser.role === 'admin') {
            query = 'UPDATE tb_projects SET name = ?, description = ?, start_date = ?, end_date = ?, status = ?, pm_id = ?, sales_rep_id = ?, progress = ? WHERE id = ?';
            params = [name, description, start_date, end_date, status, pm_id, sales_rep_id, progress, id];
        } else {
            query = 'UPDATE tb_projects SET name = ?, description = ?, start_date = ?, end_date = ?, status = ?, sales_rep_id = ?, progress = ? WHERE id = ?';
            params = [name, description, start_date, end_date, status, sales_rep_id, progress, id];
        }

        await db.query(query, params);
        res.redirect(`/projects/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('프로젝트 업데이트 중 오류 발생');
    }
};

// 프로젝트 삭제
exports.deleteProject = async (req, res) => {
    const { id } = req.params;
    try {
        const [projects] = await db.query('SELECT creator_id FROM tb_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== project.creator_id)) {
            return res.status(403).send('프로젝트를 삭제할 권한이 없습니다.');
        }
        await db.query('DELETE FROM tb_projects WHERE id = ?', [id]);
        res.redirect('/projects');
    } catch (err) {
        console.error(err);
        res.status(500).send('프로젝트 삭제 중 오류 발생');
    }
};

// 지식 관리 문서 검색
exports.searchKnowledge = async (req, res) => {
    const { term } = req.query;
    try {
        const [knowledge] = await db.query('SELECT id, title FROM tb_knowledge WHERE title LIKE ?', [`%${term}%`]);
        res.json(knowledge);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '지식 검색 중 오류 발생' });
    }
};

// 프로젝트에 지식 문서 연결
exports.linkKnowledgeToProject = async (req, res) => {
    const { id } = req.params; // project_id
    const { knowledge_id } = req.body;
    const creator_id = req.session.user.id;

    try {
        await db.query(
            'INSERT INTO tb_project_knowledge_links (project_id, knowledge_id, creator_id) VALUES (?, ?, ?)',
            [id, knowledge_id, creator_id]
        );
        res.status(200).json({ message: '자료가 성공적으로 연결되었습니다.' });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: '이미 연결된 자료입니다.' });
        }
        res.status(500).json({ message: '자료 연결 중 오류 발생' });
    }
};

// 프로젝트에서 지식 문서 연결 해제
exports.unlinkKnowledgeFromProject = async (req, res) => {
    const { id, knowledge_id } = req.params;
    const currentUser = req.session.user;

    try {
        const [links] = await db.query(
            'SELECT creator_id FROM tb_project_knowledge_links WHERE project_id = ? AND knowledge_id = ?',
            [id, knowledge_id]
        );

        if (links.length === 0) {
            return res.status(404).send('연결된 자료를 찾을 수 없습니다.');
        }
        const link = links[0];

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== link.creator_id)) {
            return res.status(403).send('자료 연결을 해제할 권한이 없습니다.');
        }

        await db.query('DELETE FROM tb_project_knowledge_links WHERE project_id = ? AND knowledge_id = ?', [id, knowledge_id]);
        res.status(200).json({ message: '자료 연결이 성공적으로 해제되었습니다.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '자료 연결 해제 중 오류 발생' });
    }
};

// 새 지식 자료 등록 및 프로젝트에 연결
exports.createAndLinkKnowledge = async (req, res) => {
    const {
        title, type, description1, description2,
        status, assignee, start_date, end_date, planned_date, category_id
    } = req.body;
    const { id: projectId } = req.params;
    const creator_id = req.session.user.id;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [knowledgeResult] = await connection.query(
            `INSERT INTO tb_knowledge
             (category_id, title, type, description1, description2, status, creator_id, assignee,
              start_date, end_date, planned_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [
                category_id || null,
                title, type, description1, description2, status, creator_id, assignee,
                start_date || null, end_date || null, planned_date || null
            ]
        );
        const newKnowledgeId = knowledgeResult.insertId;

        if (req.files && req.files.length > 0) {
            const attachmentPromises = req.files.map(file => {
                const filePath = '/uploads/knowledge/' + file.filename;
                return connection.query(
                    `INSERT INTO tb_knowledge_attachments (knowledge_id, file_path, original_name)
                     VALUES (?, ?, ?)`, 
                    [newKnowledgeId, filePath, file.originalname]
                );
            });
            await Promise.all(attachmentPromises);
        }

        await connection.query(
            'INSERT INTO tb_project_knowledge_links (project_id, knowledge_id, creator_id) VALUES (?, ?, ?)',
            [projectId, newKnowledgeId, creator_id]
        );

        await connection.commit();
        res.status(201).json({ message: '새 자료가 성공적으로 등록 및 연결되었습니다.' });
    } catch (err) {
        await connection.rollback();
        console.error('Error creating and linking knowledge item:', err);
        res.status(500).json({ message: '자료 등록 및 연결 중 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
};

// 지식 카테고리 목록 조회
exports.getKnowledgeCategories = async (req, res) => {
    try {
        const [categories] = await db.query('SELECT id, name, parent_id FROM tb_knowledge_categories ORDER BY name');
        res.json(categories);
    } catch (err) {
        console.error('Error fetching knowledge categories:', err);
        res.status(500).json({ message: '카테고리를 불러오는 중 오류가 발생했습니다.' });
    }
};

// 지식 구분(type) 목록 조회
exports.getKnowledgeTypes = async (req, res) => {
    try {
                const [types] = await db.query(`SELECT DISTINCT type FROM tb_knowledge WHERE type IS NOT NULL AND type != '' ORDER BY type`);
        res.json(types.map(row => row.type));
    } catch (err) {
        console.error('Error fetching knowledge types:', err);
        res.status(500).json({ message: '구분 목록을 불러오는 중 오류가 발생했습니다.' });
    }
};
exports.downloadWbsTemplate = (req, res) => {
    const filePath = path.join(__dirname, '../public/templates/wbs_template.xlsx');
    res.download(filePath, 'wbs_template.xlsx', (err) => {
        if (err) {
            console.error('Error downloading WBS template:', err);
            res.status(500).send('템플릿 파일을 찾을 수 없거나 다운로드 중 오류가 발생했습니다.');
        }
    });
};

// Gantt 차트 렌더링
exports.renderGanttChart = async (req, res) => {
    const { id } = req.params;
    try {
        const [projects] = await db.query('SELECT *, (SELECT name FROM tb_user WHERE id = tb_projects.pm_id) as pm_name FROM tb_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('프로젝트를 찾을 수 없습니다.');
        }
        const project = projects[0];

        const [wbsTasks] = await db.query('SELECT t.*, u.name as assigned_user_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id WHERE t.project_id = ? ORDER BY t.id', [id]);

        const formatWbsForFrappeGantt = (tasks) => {
            return tasks.map(task => ({
                id: String(task.id),
                name: task.task_name,
                start: task.start_date ? new Date(task.start_date).toISOString().split('T')[0] : '',
                end: task.end_date ? new Date(task.end_date).toISOString().split('T')[0] : '',
                progress: task.progress || 0,
                dependencies: task.parent_id ? String(task.parent_id) : '',
                custom_class: task.progress === 100 ? 'bar-milestone' : ''
            }));
        };
        const frappeGanttData = formatWbsForFrappeGantt(wbsTasks);

        res.render('projects/gantt', {
            title: `프로젝트 간트 차트: ${project.name}`,
            project,
            ganttTasks: frappeGanttData,
            currentUser: req.session.user,
            page: 'project_gantt'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};