const db = require('../config/db');

exports.getDashboard = async (req, res) => {
    try {
        const currentUser = req.session.user;

        // 1. 오늘 일정 (Today's Schedule)
        let [todaySchedules] = await db.execute(
            `SELECT s.id, s.title, s.start, s.description, u.name AS registrantName, d.text AS departmentName 
             FROM tb_schedules s 
             JOIN tb_user u ON s.user_id = u.id
             LEFT JOIN tb_dept d ON u.department_id = d.id
             WHERE DATE(s.start) = CURDATE() AND d.text IN ('기술1팀', '기술2팀', '기술3팀', '기술본부') ORDER BY s.start ASC`
        );
        todaySchedules = todaySchedules.map(schedule => ({
            ...schedule,
            start: new Date(schedule.start)
        }));

        // 2. 이슈 현황 (Issue Status)
        let [recentIssues] = await db.execute(
            `SELECT i.id, i.title, i.status, i.created_at, u.name as assignee_name FROM tb_issues i LEFT JOIN tb_user u ON i.assignee_id = u.id WHERE i.status = '진행중' ORDER BY i.created_at DESC LIMIT 5`
        );
        recentIssues = recentIssues.map(issue => ({
            ...issue,
            created_at: new Date(issue.created_at)
        }));

        // 3. 최근 지식 (Recent Knowledge)
        let [recentKnowledge] = await db.execute(
            `SELECT id, title, type, created_at FROM tb_knowledge ORDER BY created_at DESC LIMIT 5`
        );
        recentKnowledge = recentKnowledge.map(knowledge => ({
            ...knowledge,
            created_at: new Date(knowledge.created_at)
        }));

        // 4. 명함 (Business Cards)
        let [recentCards] = await db.execute(
            `SELECT id, name, company, created_at FROM tb_business_cards ORDER BY created_at DESC LIMIT 5`
        );
        recentCards = recentCards.map(card => ({
            ...card,
            created_at: new Date(card.created_at)
        }));

        // 5. 한 달 이내 유지보수 종료 예정 항목
        const oneMonthFromNow = new Date();
        oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
        oneMonthFromNow.setHours(23, 59, 59, 999);

        const [upcomingMaintenanceSummary] = await db.execute(
            `SELECT id, customer_company, item, maintenance_end_date FROM tb_maintenance_summary WHERE maintenance_end_date BETWEEN CURDATE() AND ? ORDER BY maintenance_end_date ASC`,
            [oneMonthFromNow]
        );

        // 6. 사용자별 지식 업로드 통계 (Resource Analysis)
        let knowledgeStats = [];
        const [stats] = await db.execute(
            `SELECT u.name AS userName, COUNT(k.id) AS uploadCount
             FROM tb_knowledge k
             JOIN tb_user u ON k.creator_id = u.id
             GROUP BY u.name
             ORDER BY uploadCount DESC`
        );
        knowledgeStats = stats;

        res.render('dashboard/index', {
            title: '대시보드',
            todaySchedules,
            recentIssues,
            recentKnowledge,
            recentCards,
            upcomingMaintenanceSummary,
            knowledgeStats, // Pass stats (or empty array) to the view
            currentUser: currentUser
        });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        // req.flash is not a standard express function, assuming it's custom middleware not shown
        // To avoid errors, we'll just log and redirect.
        res.status(500).send('대시보드 데이터를 불러오는 데 실패했습니다.');
    }
};