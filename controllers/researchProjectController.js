const db = require('../config/db');

// 날짜 포맷 함수 (필요시)
const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 연구과제 목록
exports.getResearchProjectList = async (req, res) => {
    try {
        const [projects] = await db.query('SELECT id, project_name, start_date, end_date, participants FROM tb_research_projects ORDER BY created_at DESC');
        res.render('research-projects/index', {
            title: '연구과제 목록',
            projects,
            currentUser: req.session.user,
            page: 'research-projects'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구과제 등록 페이지
exports.getCreateResearchProjectPage = (req, res) => {
    res.render('research-projects/create', {
        title: '새 연구과제 등록',
        currentUser: req.session.user,
        page: 'research-projects-create'
    });
};

// 연구과제 생성
exports.createResearchProject = async (req, res) => {
    const { project_name, start_date, end_date, participants } = req.body;
    try {
        await db.query(
            `INSERT INTO tb_research_projects (project_name, start_date, end_date, participants)
             VALUES (?, ?, ?, ?)`, 
            [project_name, start_date, end_date, participants]
        );
        res.redirect('/research-projects');
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구과제 상세
exports.getResearchProjectDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const [projects] = await db.query('SELECT * FROM tb_research_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('연구과제를 찾을 수 없습니다.');
        }
        const project = projects[0];
        project.start_date = formatDate(project.start_date);
        project.end_date = formatDate(project.end_date);

        // 해당 연구과제에 연결된 연구일지 목록도 함께 가져오기
        const [relatedLogs] = await db.query('SELECT id, research_title, author, creation_date FROM tb_research_log WHERE project_id = ? ORDER BY creation_date DESC', [id]);

        res.render('research-projects/detail', {
            title: '연구과제 상세',
            project,
            relatedLogs, // 연결된 연구일지 데이터 추가
            currentUser: req.session.user,
            page: 'research-projects-detail'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구과제 수정 페이지
exports.getEditResearchProjectPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [projects] = await db.query('SELECT * FROM tb_research_projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).send('연구과제를 찾을 수 없습니다.');
        }
        const project = projects[0];
        project.start_date = formatDate(project.start_date);
        project.end_date = formatDate(project.end_date);

        res.render('research-projects/edit', {
            title: '연구과제 수정',
            project,
            currentUser: req.session.user,
            page: 'research-projects-edit'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구과제 업데이트
exports.updateResearchProject = async (req, res) => {
    const { id } = req.params;
    const { project_name, start_date, end_date, participants } = req.body;

    try {
        await db.query(
            `UPDATE tb_research_projects SET 
                project_name = ?, start_date = ?, end_date = ?, participants = ?
             WHERE id = ?`, 
            [project_name, start_date, end_date, participants, id]
        );
        res.redirect(`/research-projects/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구과제 삭제
exports.deleteResearchProject = async (req, res) => {
    const { id } = req.params;
    try {
        // 해당 연구과제에 연결된 연구일지의 project_id를 NULL로 설정 (ON DELETE SET NULL 제약조건에 따라 DB에서 자동 처리되지만, 명시적으로 처리할 수도 있음)
        // await db.query('UPDATE tb_research_log SET project_id = NULL WHERE project_id = ?', [id]);
        await db.query('DELETE FROM tb_research_projects WHERE id = ?', [id]);
        res.redirect('/research-projects');
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};
