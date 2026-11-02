
const db = require('../config/db');

// 통합 검색 페이지 렌더링
exports.getSearchPage = (req, res) => {
    res.render('search/index', {
        results: null,
        query: '',
        currentUser: req.session.user,
        page: 'search'
    });
};

// 통합 검색 수행
exports.performSearch = async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.redirect('/search');
    }

    try {
        const searchQuery = `
            SELECT id, CONVERT(name USING utf8mb4) AS title, CONVERT(company USING utf8mb4) AS content, '/cards/' AS url_prefix, '명함' AS type_display FROM tb_business_cards WHERE name LIKE ? OR company LIKE ?
            UNION ALL
            SELECT id, CONVERT(subject USING utf8mb4) AS title, CONVERT(content USING utf8mb4) AS content, '/newsletter/list' AS url_prefix, '뉴스레터' AS type_display FROM tb_newsletters WHERE subject LIKE ? OR content LIKE ?
            UNION ALL
            SELECT id, CONVERT(title USING utf8mb4) AS title, CONVERT(summary USING utf8mb4) AS content, '/minutes/view/' AS url_prefix, '회의록' AS type_display FROM tb_meeting_minutes WHERE title LIKE ? OR summary LIKE ?
            UNION ALL
            SELECT id, CONVERT(title USING utf8mb4) AS title, CONVERT(description USING utf8mb4) AS content, '/schedule' AS url_prefix, '일정' AS type_display FROM tb_schedules WHERE title LIKE ? OR description LIKE ?
            UNION ALL
            SELECT id, CONVERT(project_name USING utf8mb4) AS title, CONVERT(remarks USING utf8mb4) AS content, '/maintenance' AS url_prefix, '유지보수' AS type_display FROM tb_maintenance WHERE project_name LIKE ? OR remarks LIKE ?
            UNION ALL
            SELECT id, CONVERT(title USING utf8mb4) AS title, CONVERT(description1 USING utf8mb4) AS content, '/knowledge/detail/' AS url_prefix, '지식' AS type_display FROM tb_knowledge WHERE title LIKE ? OR description1 LIKE ? OR description2 LIKE ?
            UNION ALL
            SELECT id, CONVERT(title USING utf8mb4) AS title, CONVERT(content USING utf8mb4) AS content, '/memo/' AS url_prefix, '메모' AS type_display FROM tb_memo WHERE title LIKE ? OR content LIKE ?
            UNION ALL
            SELECT id, CONVERT(reportWeek USING utf8mb4) AS title, CONVERT(previousWeekPerformance USING utf8mb4) AS content, '/weekly-reports' AS url_prefix, '주간보고' AS type_display FROM tb_weekly_reports WHERE reportWeek LIKE ? OR previousWeekPerformance LIKE ? OR currentWeekPlan LIKE ? OR nextWeekPlan LIKE ?
            UNION ALL
            SELECT id, CONVERT(name USING utf8mb4) AS title, CONVERT(description USING utf8mb4) AS content, '/projects/' AS url_prefix, '프로젝트' AS type_display FROM tb_projects WHERE name LIKE ? OR description LIKE ?
        `;

        const likeQuery = `%${query}%`;
        const [rows] = await db.query(searchQuery, [
            likeQuery, likeQuery, // cards
            likeQuery, likeQuery, // newsletters
            likeQuery, likeQuery, // minutes
            likeQuery, likeQuery, // schedules
            likeQuery, likeQuery, // maintenances
            likeQuery, likeQuery, likeQuery, // knowledge
            likeQuery, likeQuery, // memos
            likeQuery, likeQuery, likeQuery, likeQuery, // weekly reports
            likeQuery, likeQuery  // projects
        ]);

        const groupedResults = {};
        rows.forEach(row => {
            if (!groupedResults[row.type_display]) {
                groupedResults[row.type_display] = [];
            }
            let url = row.url_prefix;
            if (row.url_prefix.endsWith('/')) {
                url += row.id;
            }


            groupedResults[row.type_display].push({
                id: row.id,
                title: row.title,
                url: url,
                type_display: row.type_display
            });
        });

        res.render('search/index', {
            results: groupedResults,
            query: query,
            currentUser: req.session.user,
            page: 'search'
        });

    } catch (err) {
        console.error('Search error:', err);
        req.session.error = '검색 중 오류가 발생했습니다.';
        res.redirect('/search');
    }
};