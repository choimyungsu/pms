const db = require('../config/db');

/**
 * 업무지원 대시보드 컨트롤러
 *
 * 설계 원칙
 *  - 각 섹션(위젯)은 독립적으로 조회한다. 한 위젯의 테이블이 없거나 쿼리가 실패해도
 *    대시보드 전체가 500으로 죽지 않고, 해당 위젯만 "표시할 수 없음" 상태가 된다.
 *  - config/db.js 의 dateStrings: true 설정에 맞춰 날짜/시간은 문자열로 다룬다.
 */

// ---------- 날짜 유틸 ----------
function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}

function toDateOnly(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function parseDate(value) {
    if (!value) return null;
    const str = String(value).replace(' ', 'T');
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
    const d = parseDate(value);
    if (!d) return '';
    return toDateOnly(d);
}

function formatTime(value) {
    const d = parseDate(value);
    if (!d) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function formatDateTime(value) {
    const d = parseDate(value);
    if (!d) return '';
    return toDateOnly(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** 오늘로부터 남은 일수 (음수 = 지남) */
function daysUntil(value) {
    const d = parseDate(value);
    if (!d) return null;
    const today = new Date();
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((target - base) / 86400000);
}

function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
}

/** 이번 주 월요일 ~ 일요일 */
function currentWeekRange() {
    const todayDate = new Date();
    const base = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    const dow = base.getDay(); // 0=일
    const offsetToMonday = (dow === 0 ? -6 : 1 - dow);
    const monday = new Date(base);
    monday.setDate(monday.getDate() + offsetToMonday);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { start: monday, end: sunday };
}

/**
 * 안전 조회 래퍼.
 * 실패하면 fallback 값을 돌려주고 콘솔에만 경고를 남긴다. (대시보드 전체 보호)
 */
async function safeQuery(label, sql, params, fallback) {
    try {
        const [rows] = await db.query(sql, params || []);
        return rows;
    } catch (err) {
        console.warn('[dashboard] 위젯 조회 실패 - ' + label + ':', err.code || err.message);
        return typeof fallback !== 'undefined' ? fallback : [];
    }
}

exports.getDashboard = async (req, res) => {
    const currentUser = req.session.user;
    const now = new Date();
    const todayStr = toDateOnly(now);
    const week = currentWeekRange();
    const weekStartStr = toDateOnly(week.start);
    const weekEndStr = toDateOnly(week.end);
    const monthAhead = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 30);

    // ===================== 1. 오늘 일정 =====================
    const todayScheduleRows = await safeQuery(
        '오늘 일정',
        `SELECT s.id, s.title, s.start, s.end, s.description, s.allDay, s.color,
                s.scheduleType, s.user_id, u.name AS userName, d.text AS departmentName
           FROM tb_schedules s
           JOIN tb_user u ON s.user_id = u.id
           LEFT JOIN tb_dept d ON u.department_id = d.id
          WHERE DATE(s.start) = CURDATE()
          ORDER BY s.start ASC
          LIMIT 20`,
        []
    );
    const todaySchedules = todayScheduleRows.map((row) => ({
        ...row,
        timeText: row.allDay ? '종일' : formatTime(row.start),
        endTimeText: row.end && !row.allDay ? formatTime(row.end) : '',
        isMine: Number(row.user_id) === Number(currentUser && currentUser.id)
    }));

    // ===================== 2. 이번 주 일정 수 =====================
    const weekScheduleRows = await safeQuery(
        '이번 주 일정',
        `SELECT COUNT(*) AS cnt FROM tb_schedules WHERE DATE(start) BETWEEN ? AND ?`,
        [weekStartStr, weekEndStr],
        [{ cnt: 0 }]
    );
    const weekScheduleCount = Number((weekScheduleRows[0] || {}).cnt || 0);

    // ===================== 3. 진행중 이슈 =====================
    const issueRows = await safeQuery(
        '진행중 이슈',
        `SELECT i.id, i.title, i.status, i.created_at, u.name AS assigneeName
           FROM tb_issues i
           LEFT JOIN tb_user u ON i.assignee_id = u.id
          WHERE i.status = '진행중'
          ORDER BY i.created_at DESC
          LIMIT 6`,
        []
    );
    const recentIssues = issueRows.map((row) => ({
        ...row,
        createdText: formatDate(row.created_at)
    }));

    const issueCountRows = await safeQuery(
        '이슈 집계',
        `SELECT
            SUM(CASE WHEN status = '진행중' THEN 1 ELSE 0 END) AS openCount,
            COUNT(*) AS totalCount
           FROM tb_issues`,
        [],
        [{ openCount: 0, totalCount: 0 }]
    );
    const issueStat = issueCountRows[0] || { openCount: 0, totalCount: 0 };

    // ===================== 4. 프로젝트 =====================
    const activeProjectRows = await safeQuery(
        '진행 프로젝트',
        `SELECT COUNT(*) AS cnt FROM tb_projects WHERE status IN ('진행중', '진행')`,
        [],
        [{ cnt: 0 }]
    );
    const activeProjectCount = Number((activeProjectRows[0] || {}).cnt || 0);

    const closingProjectRows = await safeQuery(
        '이번 주 마감 프로젝트',
        `SELECT p.id, p.name, p.end_date, p.progress, pm.name AS pmName
           FROM tb_projects p
           LEFT JOIN tb_user pm ON p.pm_id = pm.id
          WHERE p.end_date IS NOT NULL
            AND DATE(p.end_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)
          ORDER BY p.end_date ASC
          LIMIT 5`,
        []
    );
    const closingProjects = closingProjectRows.map((row) => ({
        ...row,
        endText: formatDate(row.end_date),
        dday: daysUntil(row.end_date),
        progress: Number(row.progress) || 0
    }));

    // ===================== 5. 유지보수 종료 예정 =====================
    const maintenanceRows = await safeQuery(
        '유지보수 종료 예정',
        `SELECT id, customer_company, project_name, item, maintenance_end_date, main_engineer
           FROM tb_maintenance_summary
          WHERE maintenance_end_date IS NOT NULL
            AND maintenance_end_date BETWEEN CURDATE() AND ?
          ORDER BY maintenance_end_date ASC
          LIMIT 8`,
        [toDateOnly(monthAhead)],
        []
    );
    const upcomingMaintenanceSummary = maintenanceRows.map((row) => ({
        ...row,
        endText: formatDate(row.maintenance_end_date),
        dday: daysUntil(row.maintenance_end_date)
    }));

    // ===================== 6. 지식 =====================
    const knowledgeRows = await safeQuery(
        '최근 지식',
        `SELECT k.id, k.title, k.type, k.status, k.created_at,
                u.name AS creatorName,
                (SELECT COUNT(*) FROM tb_knowledge_attachments a WHERE a.knowledge_id = k.id) AS attCount
           FROM tb_knowledge k
           LEFT JOIN tb_user u ON k.creator_id = u.id
          ORDER BY k.created_at DESC
          LIMIT 6`,
        []
    );
    const recentKnowledge = knowledgeRows.map((row) => ({
        ...row,
        createdText: formatDateTime(row.created_at),
        attCount: Number(row.attCount) || 0
    }));

    const knowledgeCountRows = await safeQuery(
        '지식 집계',
        `SELECT
            COUNT(*) AS totalCount,
            SUM(CASE WHEN status IN ('진행중', '진행') THEN 1 ELSE 0 END) AS inProgressCount,
            SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS weekCount
           FROM tb_knowledge`,
        [weekStartStr, weekEndStr],
        [{ totalCount: 0, inProgressCount: 0, weekCount: 0 }]
    );
    const knowledgeStat = knowledgeCountRows[0] || { totalCount: 0, inProgressCount: 0, weekCount: 0 };

    // ===================== 7. 명함 =====================
    const cardRows = await safeQuery(
        '최근 명함',
        `SELECT id, name, company, position, created_at
           FROM tb_business_cards
          ORDER BY created_at DESC
          LIMIT 5`,
        []
    );
    const recentCards = cardRows.map((row) => ({
        ...row,
        createdText: formatDate(row.created_at)
    }));

    // ===================== 8. 최근 문서 (회의록/메모) =====================
    const minutesRows = await safeQuery(
        '최근 회의록',
        `SELECT m.id, m.title, m.meeting_date, m.created_at, u.name AS creatorName
           FROM tb_meeting_minutes m
           LEFT JOIN tb_user u ON m.user_id = u.id
          ORDER BY COALESCE(m.meeting_date, m.created_at) DESC
          LIMIT 5`,
        []
    );
    const recentMinutes = minutesRows.map((row) => ({
        ...row,
        dateText: formatDate(row.meeting_date || row.created_at)
    }));

    // ===================== 9. 사용자별 지식 업로드 통계 =====================
    const knowledgeStats = await safeQuery(
        '지식 업로드 통계',
        `SELECT u.name AS userName, COUNT(k.id) AS uploadCount
           FROM tb_knowledge k
           JOIN tb_user u ON k.creator_id = u.id
          GROUP BY u.id, u.name
          ORDER BY uploadCount DESC, u.name ASC
          LIMIT 8`,
        []
    );

    // ===================== 10. 오늘의 업무 요약 문구 =====================
    const greetingHour = now.getHours();
    let greeting = '좋은 하루입니다';
    if (greetingHour < 6) greeting = '늦은 시간까지 수고 많으십니다';
    else if (greetingHour < 12) greeting = '좋은 아침입니다';
    else if (greetingHour < 18) greeting = '좋은 오후입니다';
    else greeting = '오늘도 수고 많으셨습니다';

    const todoCount =
        todaySchedules.length +
        Number(issueStat.openCount || 0) +
        upcomingMaintenanceSummary.length;

    res.render('dashboard/index', {
        title: '대시보드',
        page: 'dashboard',
        currentUser,
        todayStr,
        weekStartStr,
        weekEndStr,
        greeting,
        greetingName: (currentUser && currentUser.name) || '',
        todoCount,

        // 위젯 데이터
        todaySchedules,
        weekScheduleCount,
        recentIssues,
        issueStat,
        activeProjectCount,
        closingProjects,
        upcomingMaintenanceSummary,
        recentKnowledge,
        knowledgeStat,
        recentCards,
        recentMinutes,
        knowledgeStats,

        // 표시용 유틸 (뷰에서 사용)
        fmtDate: formatDate
    });
};
