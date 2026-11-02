const db = require('../config/db');

// 퇴실 점검 페이지 렌더링 및 점검 목록 조회
exports.getExitChecklistPage = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, check_date, checker_name, ac_check, light_check, server_room_check,air_purifier_check, tech_lab_light_check, tech_lab_ac_check, created_at FROM tb_exit_checklist ORDER BY created_at DESC LIMIT 20');
        console.log('Fetched checklist rows:', rows); // 데이터 확인을 위한 로그 추가
        res.render('exit/index', {
            user: res.locals.user,
            checklist: rows,
            page_title: '퇴실관리'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 퇴실 점검 내역 저장
exports.saveExitChecklist = async (req, res) => {
    const { check_date, ac_check, light_check, server_room_check, air_purifier_check, tech_lab_light_check, tech_lab_ac_check } = req.body;
    const checker_name = res.locals.user.name; 

    try {
        const query = `
            INSERT INTO tb_exit_checklist (check_date, checker_name, ac_check, light_check, server_room_check, air_purifier_check, tech_lab_light_check, tech_lab_ac_check)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(query, [
            check_date,
            checker_name,
            ac_check === 'on',
            light_check === 'on',
            server_room_check === 'on',
            air_purifier_check === 'on',
            tech_lab_light_check === 'on',
            tech_lab_ac_check === 'on'
        ]);
        res.redirect('/exit');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 퇴실 점검 내역 삭제
exports.deleteExitChecklist = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM tb_exit_checklist WHERE id = ?', [id]);
        res.status(200).send('삭제 완료');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};
