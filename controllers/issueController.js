const Issue = require('../models/issue');

// 이슈 목록 페이지
exports.listIssues = async (req, res) => {
    try {
        const issues = await Issue.getAll();
        res.render('issues/list', { 
            title: '이슈 목록', 
            issues,
            currentUser: req.session.user,
            page: 'issues'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 이슈 상세 보기
exports.getIssueDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const issue = await Issue.getById(id);
        if (!issue) {
            return res.status(404).send('이슈를 찾을 수 없습니다.');
        }
        res.render('issues/details', {
            title: '이슈 상세 정보',
            issue,
            currentUser: req.session.user,
            page: 'issues'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 이슈 등록 페이지
exports.showCreateForm = async (req, res) => {
    try {
        const { project_id } = req.query;
        const projects = await Issue.getAllProjects();
        const users = await Issue.getAllUsers();
        res.render('issues/form', {
            title: '새 이슈 등록',
            issue: { project_id: project_id },
            projects,
            users,
            currentUser: req.session.user,
            page: 'issue_create'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 이슈 생성
exports.createIssue = async (req, res) => {
    try {
        const creator_id = req.session.user.id;
        let { title, project_id, status, content, assignee_id } = req.body;
        if (project_id === '') {
            project_id = null;
        }
        if (assignee_id === '') {
            assignee_id = null;
        }
        await Issue.create({ title, project_id, status, content, creator_id, assignee_id });
        res.redirect('/issues');
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 이슈 수정 페이지
exports.showEditForm = async (req, res) => {
    try {
        const { id } = req.params;
        const issue = await Issue.getById(id);
        if (!issue) {
            return res.status(404).send('이슈를 찾을 수 없습니다.');
        }

        // Check for authorization
        if (req.session.user.id !== issue.creator_id && req.session.user.role !== 'admin') {
            return res.status(403).send('수정 권한이 없습니다.');
        }

        const projects = await Issue.getAllProjects();
        const users = await Issue.getAllUsers();

        res.render('issues/form', {
            title: '이슈 수정',
            issue,
            projects,
            users,
            currentUser: req.session.user,
            page: 'issue_edit'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 이슈 업데이트
exports.updateIssue = async (req, res) => {
    try {
        const { id } = req.params;
        let { title, project_id, status, content, assignee_id } = req.body;

        const issue = await Issue.getById(id);
        if (req.session.user.id !== issue.creator_id && req.session.user.role !== 'admin') {
            return res.status(403).send('수정 권한이 없습니다.');
        }

        if (project_id === '') {
            project_id = null;
        }
        if (assignee_id === '') {
            assignee_id = null;
        }

        await Issue.update(id, { title, project_id, status, content, assignee_id });
        res.redirect('/issues');
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 이슈 삭제
exports.deleteIssue = async (req, res) => {
    try {
        const { id } = req.params;
        const issue = await Issue.getById(id);

        if (req.session.user.id !== issue.creator_id && req.session.user.role !== 'admin') {
            return res.status(403).send('삭제 권한이 없습니다.');
        }

        await Issue.delete(id);
        res.redirect('/issues');
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};
