const db = require('../config/db');
const htmlToDocx = require('html-to-docx');
const path = require('path');

// 날짜 포맷 함수
const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 연구일지 목록
exports.getResearchLogList = async (req, res) => {
    try {
        const { project_id } = req.query; // project_id 쿼리 파라미터 받기
        let query = `
            SELECT 
                rl.id, rl.research_title, rl.author, rl.creation_date, rl.department, rl.research_purpose,
                rp.project_name
            FROM tb_research_log rl
            LEFT JOIN tb_research_projects rp ON rl.project_id = rp.id
        `;
        const queryParams = [];

        if (project_id) {
            query += ` WHERE rl.project_id = ?`;
            queryParams.push(project_id);
        }

        query += ` ORDER BY rl.creation_date DESC`;

        const [logs] = await db.query(query, queryParams);
        const [projects] = await db.query('SELECT id, project_name FROM tb_research_projects ORDER BY project_name ASC'); // 모든 연구과제 목록 가져오기

        res.render('research-log/index', {
            title: '연구일지 목록',
            logs,
            projects, // 연구과제 목록 전달
            selectedProjectId: project_id, // 현재 선택된 project_id 전달
            currentUser: req.session.user,
            page: 'research-log'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구일지 등록 페이지
exports.getCreateResearchLogPage = async (req, res) => {
    try {
        const [projects] = await db.query('SELECT id, project_name FROM tb_research_projects ORDER BY project_name ASC');
        res.render('research-log/create', {
            title: '새 연구일지 작성',
            currentUser: req.session.user,
            page: 'research-log-create',
            projects // 연구과제 목록 전달
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구일지 생성
exports.createResearchLog = async (req, res) => {
    const { 
        doc_classification, page_number, creation_date, department, author2, 
        research_title, research_purpose, attendees, meeting_location, 
        main_content, expected_outcome, project_id // project_id 추가
    } = req.body;
    const author = req.session.user.name; // 현재 로그인한 사용자 이름

    try {
        await db.query(
            `INSERT INTO tb_research_log (doc_classification, page_number, author, creation_date, department, author2, research_title, research_purpose, attendees, meeting_location, main_content, expected_outcome, project_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [doc_classification, page_number, author, creation_date, department, author2, research_title, research_purpose, attendees, meeting_location, main_content, expected_outcome, project_id]
        );
        res.redirect('/research-log');
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구일지 상세
exports.getResearchLogDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const [logs] = await db.query(`
            SELECT 
                rl.*, 
                rp.project_name 
            FROM tb_research_log rl
            LEFT JOIN tb_research_projects rp ON rl.project_id = rp.id
            WHERE rl.id = ?
        `, [id]);
        if (logs.length === 0) {
            return res.status(404).send('연구일지를 찾을 수 없습니다.');
        }
        const log = logs[0];
        // 날짜 필드를 YYYY-MM-DD 형식으로 포맷
        log.creation_date = formatDate(log.creation_date);

        res.render('research-log/detail', {
            title: '연구일지 상세',
            log,
            currentUser: req.session.user,
            page: 'research-log-detail'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구일지 수정 페이지
exports.getEditResearchLogPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [logs] = await db.query('SELECT * FROM tb_research_log WHERE id = ?', [id]);
        if (logs.length === 0) {
            return res.status(404).send('연구일지를 찾을 수 없습니다.');
        }
        const log = logs[0];
        // 날짜 필드를 YYYY-MM-DD 형식으로 포맷
        log.creation_date = formatDate(log.creation_date);

        const [projects] = await db.query('SELECT id, project_name FROM tb_research_projects ORDER BY project_name ASC'); // 연구과제 목록 가져오기

        res.render('research-log/edit', {
            title: '연구일지 수정',
            log,
            currentUser: req.session.user,
            page: 'research-log-edit',
            projects // 연구과제 목록 전달
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구일지 업데이트
exports.updateResearchLog = async (req, res) => {
    const { id } = req.params;
    const { 
        doc_classification, page_number, creation_date, department, author2, 
        research_title, research_purpose, attendees, meeting_location, 
        main_content, expected_outcome, project_id // project_id 추가
    } = req.body;

    try {
        await db.query(
            `UPDATE tb_research_log SET 
                doc_classification = ?, page_number = ?, creation_date = ?, department = ?, author2 = ?, 
                research_title = ?, research_purpose = ?, attendees = ?, meeting_location = ?, 
                main_content = ?, expected_outcome = ?, project_id = ?
             WHERE id = ?`, 
            [doc_classification, page_number, creation_date, department, author2, research_title, research_purpose, attendees, meeting_location, main_content, expected_outcome, project_id, id]
        );
        res.redirect(`/research-log/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// 연구일지 삭제
exports.deleteResearchLog = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM tb_research_log WHERE id = ?', [id]);
        res.redirect('/research-log');
    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};

// DOCX 다운로드 기능
exports.downloadDocx = async (req, res) => {
    const { id } = req.params;
    try {
        const [logs] = await db.query('SELECT * FROM tb_research_log WHERE id = ?', [id]);
        if (logs.length === 0) {
            return res.status(404).send('연구일지를 찾을 수 없습니다.');
        }
        const log = logs[0];

        // 날짜 포맷팅
        const creationDate = new Date(log.creation_date).toLocaleDateString('ko-KR');

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="ko">
            <head><meta charset="UTF-8"></head>
            <body>
                <main>
                    <h1 style="text-align: center;">연구일지</h1>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">문서분류</th>
                            <td style="border: 1px solid #000; padding: 8px;">${log.doc_classification || ''}</td>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">페이지번호</th>
                            <td style="border: 1px solid #000; padding: 8px;">${log.page_number || ''}</td>
                        </tr>
                        <tr>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">작성자</th>
                            <td style="border: 1px solid #000; padding: 8px;">${log.author || ''}</td>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">작성일자</th>
                            <td style="border: 1px solid #000; padding: 8px;">${creationDate}</td>
                        </tr>
                    </table>
                    <p style="text-align: center;">아래와 같이 연구 일지를 제출합니다.</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 12px 0;">
                        <tr>
                            <td rowspan="2" style="width: 80px; text-align: center; font-weight: bold; border: 1px solid #000; padding: 8px;">결<br>재</td>
                            <td style="border: 1px solid #000; padding: 8px; font-weight: bold; background-color: #f2f2f2; text-align: center;">담당</td>
                            <td style="border: 1px solid #000; padding: 8px; font-weight: bold; background-color: #f2f2f2; text-align: center;">팀장</td>
                            <td style="border: 1px solid #000; padding: 8px; font-weight: bold; background-color: #f2f2f2; text-align: center;">소장</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; height: 100px;">&nbsp;</td>
                            <td style="border: 1px solid #000; height: 100px;">&nbsp;</td>
                            <td style="border: 1px solid #000; height: 100px;">&nbsp;</td>
                        </tr>
                    </table>

                    <table style="width: 100%; border-collapse: collapse;">
                         <tr>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">소속</th>
                            <td style="border: 1px solid #000; padding: 8px;">${log.department || ''}</td>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">작성자</th>
                            <td style="border: 1px solid #000; padding: 8px;">${log.author2 || log.author || ''}</td>
                        </tr>
                        <tr>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">연구제목</th>
                            <td colspan="3" style="border: 1px solid #000; padding: 8px;">${log.research_title || ''}</td>
                        </tr>
                        <tr>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2; height: 100px;">연구목적</th>
                            <td colspan="3" style="border: 1px solid #000; padding: 8px;">${(log.research_purpose || '').replace(/\n/g, '<br/>')}</td>
                        </tr>
                        <tr>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">참석자</th>
                            <td colspan="3" style="border: 1px solid #000; padding: 8px;">${log.attendees || ''}</td>
                        </tr>
                        <tr>
                            <th style="border: 1px solid #000; padding: 8px; background-color: #f2f2f2;">회의장소</th>
                            <td colspan="3" style="border: 1px solid #000; padding: 8px;">${log.meeting_location || ''}</td>
                        </tr>
                    </table>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <thead>
                            <tr>
                                <th style="border: 1px solid #222; padding: 8px; background-color: #f2f2f2; font-weight: bold; text-align: center;">
                                    연 구 주 요 내 용
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="border: 1px solid #222; padding: 8px; height: 200px; vertical-align: top;">
                                    ${(log.main_content || '').replace(/\n/g, '<br/>')}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <thead>
                            <tr>
                                <th style="border: 1px solid #222; padding: 8px; background-color: #f2f2f2; font-weight: bold; text-align: center;">
                                    연 구 기 대 효 과
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="border: 1px solid #222; padding: 8px; height: 150px; vertical-align: top;">
                                    ${(log.expected_outcome || '').replace(/\n/g, '<br/>')}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div style="text-align: center; margin-top: 16px;">㈜제이원아이티 기업부설연구소</div>
                </main>
            </body>
            </html>
        `;

        const fileBuffer = await htmlToDocx(
            htmlContent,
            { margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } // A4 margins in twips (1 inch = 1440 twips)
        );

        const fileName = `연구일지_${log.research_title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${log.id}.docx`;
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(fileBuffer);

    } catch (err) {
        console.error(err);
        res.status(500).send('서버 오류');
    }
};
