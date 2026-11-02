
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, Footer } = require("docx");
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const MeetingMinutes = require('../models/minutes');
const sanitizeHtml = require('../utils/sanitizeHtml');

// 회의록 작성 페이지 렌더링
exports.getCreatePage = async (req, res) => {
    const projectId = req.query.projectId;
    let selectedProject = null;

    if (projectId) {
        const [projectRows] = await db.query('SELECT id, name FROM tb_projects WHERE id = ?', [projectId]);
        if (projectRows.length > 0) {
            selectedProject = projectRows[0];
        }
    }

    const [projects] = await db.query('SELECT id, name FROM tb_projects ORDER BY name');
    res.render('minutes/create', {
        message: req.session.message,
        error: req.session.error,
        user: req.session.user, // 사용자 정보 전달
        projects,
        selectedProject,
        currentUser: req.session.user,
        page: 'minutes_create'
    });
    req.session.message = null;
    req.session.error = null;
};

// 회의록 저장 처리
exports.saveMeetingMinutes = async (req, res) => {
    const {
        title,
        meeting_date,
        location,
        host,
        attendees,
        agenda,
        summary,
        remarks,
        project_id
    } = req.body;
    const user_id = req.session.user ? req.session.user.id : null;

    try {
        await db.query(
            'INSERT INTO tb_meeting_minutes (user_id, title, meeting_date, location, host, attendees, agenda, summary, remarks, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [user_id, title, meeting_date, location, host, attendees, JSON.stringify(agenda), summary, remarks, project_id || null]
        );

        req.session.message = '회의록이 성공적으로 저장되었습니다.';
        res.redirect('/minutes/list');
    } catch (err) {
        console.error('회의록 저장 오류:', err);
        req.session.error = '회의록 저장 중 오류가 발생했습니다.';
        res.redirect('/minutes/create');
    }
};

// 회의록 목록 페이지 렌더링
exports.getMeetingMinutesListPage = async (req, res) => {
    try {
        const [minutes] = await db.query('SELECT mm.id, mm.user_id, mm.title, mm.createdAt, u.name as author_name FROM tb_meeting_minutes mm LEFT JOIN tb_user u ON mm.user_id = u.id ORDER BY mm.createdAt DESC');
        res.render('minutes/list', {
            minutes: minutes,
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user, // 현재 사용자 정보 전달
            page: 'minutes_list'
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        req.session.error = '회의록 목록을 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// 회의록 상세 보기 페이지 렌더링
exports.getViewMeetingMinutesPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [minutesRows] = await db.query('SELECT mm.*, u.name as author_name FROM tb_meeting_minutes mm LEFT JOIN tb_user u ON mm.user_id = u.id WHERE mm.id = ?', [id]);
        const minutes = minutesRows[0];

        if (!minutes) {
            req.session.error = '해당 회의록을 찾을 수 없습니다.';
            return res.redirect('/minutes/list');
        }

        // agenda가 JSON 문자열일 경우 파싱
        if (typeof minutes.agenda === 'string') {
            minutes.agenda = JSON.parse(minutes.agenda);
        }

        res.render('minutes/view', {
            minutes: minutes,
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user // 현재 사용자 정보 전달
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        req.session.error = '회의록 상세 정보를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/minutes/list');
    }
};

// 회의록 수정 페이지 렌더링
exports.getEditMeetingMinutesPage = async (req, res) => {
    const { id } = req.params;
    const currentUser = req.session.user;

    try {
        const [minutesRows] = await db.query('SELECT * FROM tb_meeting_minutes WHERE id = ?', [id]);
        const minutes = minutesRows[0];

        if (!minutes) {
            req.session.error = '해당 회의록을 찾을 수 없습니다.';
            return res.redirect('/minutes/list');
        }

        // 관리자이거나 작성자인 경우에만 수정 페이지 접근 허용
        if (currentUser && (currentUser.role === 'admin' || currentUser.id === minutes.user_id)) {
            if (typeof minutes.agenda === 'string') {
                minutes.agenda = JSON.parse(minutes.agenda);
            }
            const [projects] = await db.query('SELECT id, name FROM tb_projects ORDER BY name');
            res.render('minutes/edit', {
                minutes: minutes,
                projects,
                message: req.session.message,
                error: req.session.error,
                currentUser: req.session.user
            });
            req.session.message = null;
            req.session.error = null;
        } else {
            req.session.error = '회의록을 수정할 권한이 없습니다.';
            res.redirect('/minutes/list');
        }
    } catch (err) {
        console.error(err);
        req.session.error = '회의록 수정 페이지를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/minutes/list');
    }
};

// 회의록 업데이트 처리
exports.updateMeetingMinutes = async (req, res) => {
    const { id } = req.params;
    const {
        title,
        meeting_date,
        location,
        host,
        attendees,
        agenda,
        summary,
        remarks,
        project_id
    } = req.body;
    const currentUser = req.session.user;

    try {
        const [minutesRows] = await db.query('SELECT user_id FROM tb_meeting_minutes WHERE id = ?', [id]);
        const minutes = minutesRows[0];

        if (!minutes) {
            req.session.error = '해당 회의록을 찾을 수 없습니다.';
            return res.redirect('/minutes/list');
        }

        // 관리자이거나 작성자인 경우에만 업데이트 허용
        if (currentUser && (currentUser.role === 'admin' || currentUser.id === minutes.user_id)) {
            await db.query(
                'UPDATE tb_meeting_minutes SET title = ?, meeting_date = ?, location = ?, host = ?, attendees = ?, agenda = ?, summary = ?, remarks = ?, project_id = ?, updatedAt = NOW() WHERE id = ?',
                [title, meeting_date, location, host, attendees, JSON.stringify(agenda), summary, remarks, project_id || null, id]
            );

            req.session.message = '회의록이 성공적으로 수정되었습니다.';
            res.redirect('/minutes/list');
        } else {
            req.session.error = '회의록을 수정할 권한이 없습니다.';
            res.redirect('/minutes/list');
        }
    } catch (err) {
        console.error('회의록 업데이트 오류:', err);
        req.session.error = '회의록 업데이트 중 오류가 발생했습니다.';
        res.redirect(`/minutes/edit/${id}`);
    }
};

// 회의록 삭제 처리
exports.deleteMeetingMinutes = async (req, res) => {
    const { id } = req.params;
    const currentUser = req.session.user;

    try {
        const [minutesRows] = await db.query('SELECT user_id FROM tb_meeting_minutes WHERE id = ?', [id]);
        const minutes = minutesRows[0];

        if (!minutes) {
            req.session.error = '해당 회의록을 찾을 수 없습니다.';
            return res.redirect('/minutes/list');
        }

        // 관리자이거나 작성자인 경우에만 삭제 허용
        if (currentUser && (currentUser.role === 'admin' || currentUser.id === minutes.user_id)) {
            await db.query('DELETE FROM tb_meeting_minutes WHERE id = ?', [id]);
            req.session.message = '회의록이 성공적으로 삭제되었습니다.';
            res.redirect('/minutes/list');
        } else {
            req.session.error = '회의록을 삭제할 권한이 없습니다.';
            res.redirect('/minutes/list');
        }
    } catch (err) {
        console.error('회의록 삭제 오류:', err);
        req.session.error = '회의록 삭제 중 오류가 발생했습니다.';
        res.redirect('/minutes/list');
    }
};

// DOCX 다운로드 처리
exports.downloadMeetingMinutesAsDocx = async (req, res) => {
    const { id } = req.params;
    try {
        const [minutesRows] = await db.query('SELECT mm.*, u.name as author_name FROM tb_meeting_minutes mm LEFT JOIN tb_user u ON mm.user_id = u.id WHERE mm.id = ?', [id]);
        const minutes = minutesRows[0];

        if (!minutes) {
            req.session.error = '해당 회의록을 찾을 수 없습니다.';
            return res.redirect('/minutes/list');
        }

        const agenda = JSON.parse(minutes.agenda);

        const doc = new Document({
            sections: [{
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                children: [
                                    new ImageRun({
                                        data: fs.readFileSync(path.join(__dirname, '../public/images/company_logo.png')),
                                        transformation: {
                                            width: 100,
                                            height: 20,
                                        },
                                    }),
                                ],
                                alignment: "right",
                            }),
                        ],
                    }),
                },
                children: [
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: minutes.title,
                                bold: true,
                                size: 36, // 18pt
                            }),
                        ],
                        alignment: "center",
                    }),
                    new Paragraph(""), // 빈 줄

                    new Paragraph({
                        children: [
                            new TextRun({ text: `일시: ${new Date(minutes.meeting_date).toLocaleString()}` }),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `장소: ${minutes.location}` }),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `주관: ${minutes.host}` }),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `작성자: ${minutes.author_name}` }),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `참석자: ${minutes.attendees}` }),
                        ],
                    }),
                    new Paragraph(""), // 빈 줄

                    new Paragraph({
                        children: [
                            new TextRun({ text: "안건", bold: true, size: 24 }), // 12pt
                        ],
                    }),
                    new Table({
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph("순번")], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                    new TableCell({ children: [new Paragraph("안건")], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                    new TableCell({ children: [new Paragraph("담당자")], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                    new TableCell({ children: [new Paragraph("예상시간(분)")], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                ],
                            }),
                            ...agenda.map((item, index) => {
                                return new TableRow({
                                    children: [
                                        new TableCell({ children: [new Paragraph(`${index + 1}`)], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                        new TableCell({ children: [new Paragraph(item.topic)], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                        new TableCell({ children: [new Paragraph(item.presenter)], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                        new TableCell({ children: [new Paragraph(`${item.time}`)], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                    ],
                                });
                            }),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                    new Paragraph(""), // 빈 줄

                    new Paragraph({
                        children: [
                            new TextRun({ text: "회의내용 요약", bold: true, size: 24 }),
                        ],
                    }),
                    new Table({
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ children: minutes.summary.split('\n').flatMap(line => [new TextRun(line), new TextRun({ text: '', break: 1 })]).slice(0, -1) })], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                ],
                            }),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                    new Paragraph(""), // 빈 줄

                    new Paragraph({
                        children: [
                            new TextRun({ text: "비고", bold: true, size: 24 }),
                        ],
                    }),
                    new Table({
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ children: minutes.remarks.split('\n').flatMap(line => [new TextRun(line), new TextRun({ text: '', break: 1 })]).slice(0, -1) })], borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } } }),
                                ],
                            }),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                ],
            }],
        });

        // 파일명 정리 (회의록 제목 사용, 특수문자 처리)
        const sanitizedTitle = minutes.title.replace(/[\/:*?"<>|]/g, '_');
        const filename = `${sanitizedTitle}.docx`;

        console.log('Original Title:', minutes.title);
        console.log('Generated Filename:', filename);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        Packer.toBuffer(doc).then((buffer) => {
            res.end(buffer);
        }).catch((err) => {
            console.error('DOCX 생성 오류:', err);
            req.session.error = 'DOCX 다운로드 중 오류가 발생했습니다.';
            res.redirect('/minutes/view/' + id);
        });

    } catch (err) {
        console.error('DOCX 다운로드 오류:', err);
        req.session.error = 'DOCX 다운로드 중 오류가 발생했습니다.';
        res.redirect('/minutes/view/' + id);
    }
};
