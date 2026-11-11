const bcrypt = require('bcryptjs');
const db = require('../config/db');

/**
 * tb_user.team 컬럼 존재 여부 확인 (DB 스키마 버전 차이 대응)
 *  - 운영/개발 DB 중에는 team 컬럼이 없는 경우가 있으므로
 *    컬럼이 있을 때만 조회하고, 없으면 부서명 기준으로 팀을 구성한다.
 *  - information_schema 조회는 1회만 수행하고 결과를 캐시한다.
 */
let userTeamColumnCache = null;
const hasUserTeamColumn = async () => {
    if (userTeamColumnCache !== null) return userTeamColumnCache;
    try {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt
               FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tb_user'
                AND COLUMN_NAME = 'team'`
        );
        userTeamColumnCache = Number(rows[0] && rows[0].cnt) > 0;
    } catch (err) {
        console.warn('[tech-status] tb_user.team 컬럼 확인 실패:', err.code || err.message);
        userTeamColumnCache = false;
    }
    return userTeamColumnCache;
};

// 기술본부 현황 페이지 렌더링
exports.getTechStatusPage = async (req, res) => {
    try {
        const [projects] = await db.query(`
            SELECT 
                p.id, 
                p.name, 
                p.status, 
                p.progress,
                pm.name AS pm_name,
                sales_rep.name AS sales_rep_name
            FROM tb_projects p
            LEFT JOIN tb_user pm ON p.pm_id = pm.id
            LEFT JOIN tb_user sales_rep ON p.sales_rep_id = sales_rep.id
            WHERE p.status = '진행중'
            ORDER BY p.start_date DESC, p.id DESC
        `);

        const [weeklyReports] = await db.query(`
            SELECT id, reportWeek as title, createdAt as report_date, previousWeekPerformance, currentWeekPlan 
            FROM tb_weekly_reports 
            ORDER BY createdAt DESC, id DESC
            LIMIT 1
        `);

        const [issues] = await db.query(`
            SELECT
                i.id,
                i.title,
                i.status,
                i.created_at,
                u.name as assignee_name,
                p.name as project_name
            FROM tb_issues i
            LEFT JOIN tb_user u ON i.assignee_id = u.id
            LEFT JOIN tb_projects p ON i.project_id = p.id
            WHERE i.status = '진행중'
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT 5
        `);

        // --- 일정 현황 로직 시작 ---
        console.log('--- getTechStatusPage Request ---');
        console.log('1. req.query.date:', req.query.date);

        const rawDateParam = req.query.date;
        const parsedDateFromQuery = rawDateParam ? new Date(rawDateParam) : null;
        console.log('2. new Date(req.query.date) result:', parsedDateFromQuery);

        const dateParam = parsedDateFromQuery && !isNaN(parsedDateFromQuery.getTime()) ? parsedDateFromQuery : new Date();
        console.log('3. Final dateParam used:', dateParam.toISOString().split('T')[0]);
        
        // Ensure dateParam is valid
        if (isNaN(dateParam.getTime())) {
            console.error('Invalid date parameter received or parsed:', rawDateParam);
            throw new Error('Invalid date parameter');
        }

        const startOfWeek = new Date(dateParam);
        startOfWeek.setDate(dateParam.getDate() - (dateParam.getDay() === 0 ? 6 : dateParam.getDay() - 1));
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const prevWeek = new Date(startOfWeek);
        prevWeek.setDate(startOfWeek.getDate() - 7);

        const nextWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 7);

        const dateRange = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            dateRange.push(day);
        }

                const [users] = await db.query(`
                    SELECT u.id, u.name, u.department_id, d.text AS department_name
                    FROM tb_user u
                    LEFT JOIN tb_dept d ON u.department_id = d.id
                    WHERE d.text LIKE '%기술%' AND u.is_resigned = 0
                    ORDER BY u.name
                `);

                // tb_user.team 컬럼은 DB 버전에 따라 없을 수 있으므로
                // 존재할 때만 추가 조회한다. (없으면 부서명 기준으로 팀을 구성)
                if (await hasUserTeamColumn()) {
                    try {
                        const [teamRows] = await db.query(
                            'SELECT id, team FROM tb_user WHERE is_resigned = 0'
                        );
                        const teamById = new Map(teamRows.map((row) => [row.id, row.team]));
                        users.forEach((user) => {
                            user.team = teamById.has(user.id) ? teamById.get(user.id) : null;
                        });
                    } catch (teamErr) {
                        console.warn('[tech-status] tb_user.team 조회 실패(무시):', teamErr.code || teamErr.message);
                    }
                }

                const techUserIds = users.map(u => u.id);
        
                let schedules = [];
                let wbsTasks = [];
        
                if (techUserIds.length > 0) {
                    [schedules] = await db.query(`
                        SELECT user_id, title, start, end, scheduleType, '일반' as type
                        FROM tb_schedules
                        WHERE user_id IN (?) AND (DATE(start) <= ? AND DATE(IFNULL(end, start)) >= ?)
                    `, [techUserIds, endOfWeek, startOfWeek]);
        
                    [wbsTasks] = await db.query(`
                        SELECT assigned_user_id as user_id, task_name as title, start_date as start, end_date as end, 'WBS' as type
                        FROM tb_wbs_tasks
                        WHERE assigned_user_id IN (?) AND (DATE(start_date) <= ? AND DATE(IFNULL(end_date, start_date)) >= ?)
                    `, [techUserIds, endOfWeek, startOfWeek]);
                }
        const combinedSchedules = [...schedules, ...wbsTasks].filter(s => s.user_id);

        const [projectAssignments] = techUserIds.length > 0 ? await db.query(`
            SELECT DISTINCT p.id AS project_id, p.name AS project_name, p.status, p.progress,
                   p.start_date, p.end_date, a.user_id, u.name AS user_name
            FROM (
                SELECT project_id, user_id FROM tb_project_users
                UNION
                SELECT project_id, assigned_user_id AS user_id
                FROM tb_wbs_tasks
                WHERE assigned_user_id IS NOT NULL
            ) a
            JOIN tb_projects p ON p.id = a.project_id
            JOIN tb_user u ON u.id = a.user_id
            WHERE a.user_id IN (?)
            ORDER BY p.status, p.end_date, p.name, u.name
        `, [techUserIds]) : [[]];

        const scheduleMap = {};
        users.forEach(u => scheduleMap[u.id] = {});

        combinedSchedules.forEach(s => {
            const startDate = new Date(s.start);
            const endDate = s.end ? new Date(s.end) : startDate;
            
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                
                // Only add to map if the day is within the visible week
                const dayOfWeek = new Date(dateStr).getTime();
                if (dayOfWeek >= startOfWeek.getTime() && dayOfWeek <= endOfWeek.getTime()) {
                    if (!scheduleMap[s.user_id]) {
                        scheduleMap[s.user_id] = {};
                    }
                    if (!scheduleMap[s.user_id][dateStr]) {
                        scheduleMap[s.user_id][dateStr] = [];
                    }
                    scheduleMap[s.user_id][dateStr].push({ title: s.title, type: s.type, scheduleType: s.scheduleType });
                }
            }
        });

        const projectMap = {};
        projectAssignments.forEach(assignment => {
            if (!projectMap[assignment.project_id]) {
                projectMap[assignment.project_id] = {
                    id: assignment.project_id,
                    name: assignment.project_name,
                    status: assignment.status,
                    progress: assignment.progress || 0,
                    start_date: assignment.start_date,
                    end_date: assignment.end_date,
                    members: []
                };
            }
            projectMap[assignment.project_id].members.push({ id: assignment.user_id, name: assignment.user_name });
        });

        const weekStart = startOfWeek.toISOString().split('T')[0];
        const weekEnd = endOfWeek.toISOString().split('T')[0];
        const resourceMembers = users.map(user => {
            const memberSchedules = combinedSchedules.filter(schedule => schedule.user_id === user.id);
            const dates = new Set();
            const leaveDates = new Set();
            memberSchedules.forEach(schedule => {
                const start = new Date(schedule.start);
                const end = new Date(schedule.end || schedule.start);
                for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
                    const date = day.toISOString().split('T')[0];
                    if (date >= weekStart && date <= weekEnd) {
                        dates.add(date);
                        if (schedule.type === '일반' && ['연차', '오전반차', '오후반차'].includes(schedule.scheduleType)) {
                            leaveDates.add(date);
                        }
                    }
                }
            });
            const memberProjects = Object.values(projectMap).filter(project => project.members.some(member => member.id === user.id));
            return {
                ...user,
                scheduledDays: dates.size,
                leaveDays: leaveDates.size,
                projectCount: memberProjects.length,
                projects: memberProjects
            };
        });

        const teamSummary = {};
        resourceMembers.forEach(member => {
            const team = member.department_name || '기술본부';
            if (!teamSummary[team]) {
                teamSummary[team] = { name: team, memberCount: 0, scheduledDays: 0, leaveDays: 0, projectCount: 0 };
            }
            teamSummary[team].memberCount += 1;
            teamSummary[team].scheduledDays += member.scheduledDays;
            teamSummary[team].leaveDays += member.leaveDays;
            teamSummary[team].projectCount += member.projectCount;
        });
        // --- 일정 현황 로직 종료 ---

        // --- 기술본부 스킬 분석 (패치관리 Skill 보유 체크 기준) 시작 ---
        // 기준 데이터
        //   tb_maintenance_summary        : 고객사 / 정엔지니어 / 부엔지니어 / 유지보수 종료일
        //   tb_maintenance_summary_items  : 제조사 / 품목 / 모델 / skill_checked
        //
        //  - 패치관리 화면에서 품목별 "Skill 보유" 체크가 된 행만 집계합니다.
        //    (체크되지 않은 품목은 기술본부 스킬 분석 대상에서 제외)
        //  - 정/부엔지니어는 자유 입력 이름이므로 공백·대소문자를 제거한 뒤
        //    기술본부 인원(tb_user.name)과 매칭합니다.
        let engineerSkills = [];
        let unmatchedEngineers = [];
        let teamSkillCards = [];
        let skillTotals = { engineers: 0, records: 0, skills: 0, manufacturers: 0 };
        let companyAnalysis = {
            totals: { records: 0, activeRecords: 0, manufacturers: 0, items: 0, models: 0, customers: 0 },
            manufacturers: [],
            items: [],
            models: [],
            matrix: { items: [], rows: [], max: 0 },
            modelRecords: []
        };
        let skillBasis = { totalItems: 0, checkedItems: 0 };

        try {
            const [skillRows] = await db.query(`
                SELECT s.id AS summary_id,
                       s.customer_company,
                       s.main_engineer,
                       s.sub_engineer,
                       s.maintenance_end_date,
                       i.id AS item_id,
                       i.manufacturer,
                       i.item_name,
                       i.model_name,
                       COALESCE(i.skill_checked, 0) AS skill_checked
                  FROM tb_maintenance_summary s
                  JOIN tb_maintenance_summary_items i ON i.summary_id = s.id
            `);

            const norm = (value) => String(value == null ? '' : value).trim();
            const nameKey = (value) => String(value == null ? '' : value).replace(/\s+/g, '').toLowerCase();
            const todayStr = new Date().toISOString().split('T')[0];

            skillBasis.totalItems = skillRows.length;
            // Skill 보유 체크된 품목만 분석 대상
            const checkedRows = skillRows.filter((row) => Number(row.skill_checked) === 1);
            skillBasis.checkedItems = checkedRows.length;

            /* ---------- 1) 엔지니어별 스킬 보유 현황 ---------- */
            const memberByKey = new Map();
            resourceMembers.forEach((member) => memberByKey.set(nameKey(member.name), member));

            // 팀 구분: tb_user.team(직접 지정) → 소속 부서명 → '기술본부'
            const resolveTeam = (member) => {
                const byTeam = norm(member.team);
                if (byTeam) return byTeam;
                const byDept = norm(member.department_name);
                if (byDept) return byDept;
                return '기술본부';
            };

            const skillByMember = new Map();
            resourceMembers.forEach((member) => {
                skillByMember.set(member.id, {
                    id: member.id,
                    name: member.name,
                    team: resolveTeam(member),
                    departmentName: member.department_name || '기술본부',
                    totalCount: 0,
                    mainCount: 0,
                    subCount: 0,
                    skills: new Map()
                });
            });

            const unmatched = new Map();

            const addSkill = (rawName, role, row) => {
                const key = nameKey(rawName);
                if (!key) return;

                const member = memberByKey.get(key);
                if (!member) {
                    // 기술본부 소속이 아닌(또는 미등록) 엔지니어 이름
                    if (!unmatched.has(key)) {
                        unmatched.set(key, { name: norm(rawName), count: 0 });
                    }
                    unmatched.get(key).count += 1;
                    return;
                }

                const bucket = skillByMember.get(member.id);
                bucket.totalCount += 1;
                if (role === 'main') bucket.mainCount += 1;
                else bucket.subCount += 1;

                const manufacturer = norm(row.manufacturer) || '-';
                const item = norm(row.item_name) || '-';
                const model = norm(row.model_name) || '-';
                const skillKey = [manufacturer, item, model].join('||');

                if (!bucket.skills.has(skillKey)) {
                    bucket.skills.set(skillKey, {
                        manufacturer,
                        item,
                        model,
                        count: 0,
                        asMain: 0,
                        asSub: 0,
                        customers: new Set(),
                        endDates: []
                    });
                }

                const skill = bucket.skills.get(skillKey);
                skill.count += 1;
                if (role === 'main') skill.asMain += 1;
                else skill.asSub += 1;
                if (row.customer_company) skill.customers.add(norm(row.customer_company));
                if (row.maintenance_end_date) skill.endDates.push(String(row.maintenance_end_date).slice(0, 10));
            };

            checkedRows.forEach((row) => {
                addSkill(row.main_engineer, 'main', row);
                addSkill(row.sub_engineer, 'sub', row);
            });

            engineerSkills = Array.from(skillByMember.values()).map((bucket) => {
                const skills = Array.from(bucket.skills.values()).map((skill) => {
                    const endDates = skill.endDates.slice().sort();
                    const lastEndDate = endDates.length ? endDates[endDates.length - 1] : null;
                    return {
                        manufacturer: skill.manufacturer,
                        item: skill.item,
                        model: skill.model,
                        count: skill.count,
                        asMain: skill.asMain,
                        asSub: skill.asSub,
                        customers: Array.from(skill.customers),
                        lastEndDate,
                        isActive: !lastEndDate || lastEndDate >= todayStr
                    };
                }).sort((a, b) => {
                    if (a.manufacturer !== b.manufacturer) return a.manufacturer.localeCompare(b.manufacturer, 'ko');
                    if (a.item !== b.item) return a.item.localeCompare(b.item, 'ko');
                    return a.model.localeCompare(b.model, 'ko');
                });

                return {
                    id: bucket.id,
                    name: bucket.name,
                    team: bucket.team,
                    departmentName: bucket.departmentName,
                    totalCount: bucket.totalCount,
                    mainCount: bucket.mainCount,
                    subCount: bucket.subCount,
                    skillCount: skills.length,
                    manufacturers: Array.from(new Set(skills.map((s) => s.manufacturer))),
                    items: Array.from(new Set(skills.map((s) => s.item))),
                    skills
                };
            }).sort((a, b) => (b.totalCount - a.totalCount) || a.name.localeCompare(b.name, 'ko'));

            /* ---------- 1-2) 팀별 스킬 보유 카드 ---------- */
            // 기술본부 인원을 팀 단위로 묶어, 팀 카드 안에서
            // "누가 어떤 제조사/품목/모델 스킬을 보유하는지" 를 한눈에 보여준다.
            const teamMap = new Map();
            engineerSkills.forEach((engineer) => {
                const teamName = engineer.team || '기술본부';
                if (!teamMap.has(teamName)) {
                    teamMap.set(teamName, {
                        team: teamName,
                        members: [],
                        memberCount: 0,
                        skillMemberCount: 0,
                        totalCount: 0,
                        mainCount: 0,
                        subCount: 0,
                        skillCount: 0,
                        manufacturers: new Set(),
                        items: new Set(),
                        models: new Set()
                    });
                }
                const teamEntry = teamMap.get(teamName);
                teamEntry.members.push(engineer);
                teamEntry.memberCount += 1;
                if (engineer.skillCount > 0) teamEntry.skillMemberCount += 1;
                teamEntry.totalCount += engineer.totalCount;
                teamEntry.mainCount += engineer.mainCount;
                teamEntry.subCount += engineer.subCount;
                teamEntry.skillCount += engineer.skillCount;
                engineer.manufacturers.forEach((m) => teamEntry.manufacturers.add(m));
                engineer.items.forEach((i) => teamEntry.items.add(i));
                engineer.skills.forEach((s) => teamEntry.models.add(s.model));
            });

            /* 팀 카드 정렬 기준: 기술1팀 → 기술2팀 → 기술3팀 → 기타(가나다순) */
            const TEAM_RANK = { '기술1팀': 1, '기술2팀': 2, '기술3팀': 3 };
            const teamRank = (name) => {
                const key = String(name == null ? '' : name).replace(/\s+/g, '');
                return TEAM_RANK[key] || 99;
            };

            teamSkillCards = Array.from(teamMap.values())
                .map((entry) => ({
                    team: entry.team,
                    memberCount: entry.memberCount,
                    skillMemberCount: entry.skillMemberCount,
                    totalCount: entry.totalCount,
                    mainCount: entry.mainCount,
                    subCount: entry.subCount,
                    skillCount: entry.skillCount,
                    manufacturers: Array.from(entry.manufacturers).sort((a, b) => a.localeCompare(b, 'ko')),
                    items: Array.from(entry.items).sort((a, b) => a.localeCompare(b, 'ko')),
                    models: Array.from(entry.models).sort((a, b) => a.localeCompare(b, 'ko')),
                    members: entry.members.slice().sort((a, b) =>
                        (b.skillCount - a.skillCount) || a.name.localeCompare(b.name, 'ko'))
                }))
                .sort((a, b) => (teamRank(a.team) - teamRank(b.team)) || a.team.localeCompare(b.team, 'ko'));

            unmatchedEngineers = Array.from(unmatched.values())
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));

            skillTotals = {
                engineers: engineerSkills.filter((eng) => eng.skillCount > 0).length,
                records: engineerSkills.reduce((sum, eng) => sum + eng.totalCount, 0),
                skills: engineerSkills.reduce((sum, eng) => sum + eng.skillCount, 0),
                manufacturers: new Set(
                    engineerSkills.reduce((acc, eng) => acc.concat(eng.manufacturers), [])
                ).size
            };

            /* ---------- 2) 회사 전체 제조사 / 품목 / 모델 분석 ---------- */
            // 모델명 접두어 통합 검색은 화면(클라이언트)에서 modelRecords 로 처리한다.
            const mfrKey = (value) => String(value == null ? '' : value).replace(/\s+/g, '').toLowerCase();

            const mfrMap = new Map();
            const itemMap = new Map();
            const modelMap = new Map();
            const pairMap = new Map();
            const customerSet = new Set();
            let recordCount = 0;
            let activeRecordCount = 0;

            const ensure = (map, key, seed) => {
                if (!map.has(key)) map.set(key, Object.assign({ count: 0, active: 0 }, seed));
                return map.get(key);
            };

            checkedRows.forEach((row) => {
                const manufacturer = norm(row.manufacturer) || '-';
                const item = norm(row.item_name) || '-';
                const model = norm(row.model_name) || '-';
                const customer = norm(row.customer_company);
                const endDate = row.maintenance_end_date ? String(row.maintenance_end_date).slice(0, 10) : '';
                const isActive = !endDate || endDate >= todayStr;

                recordCount += 1;
                if (isActive) activeRecordCount += 1;
                if (customer) customerSet.add(customer);

                const mfrEntry = ensure(mfrMap, mfrKey(manufacturer), {
                    name: manufacturer, items: new Set(), models: new Set(), customers: new Set()
                });
                mfrEntry.count += 1;
                if (isActive) mfrEntry.active += 1;
                mfrEntry.items.add(item);
                mfrEntry.models.add(model);
                if (customer) mfrEntry.customers.add(customer);

                const itemEntry = ensure(itemMap, item, { name: item, manufacturers: new Set(), models: new Set() });
                itemEntry.count += 1;
                if (isActive) itemEntry.active += 1;
                itemEntry.manufacturers.add(manufacturer);
                itemEntry.models.add(model);

                const tripleKey = [manufacturer, item, model].join('||');
                const modelEntry = ensure(modelMap, tripleKey, {
                    manufacturer, item, name: model, customers: new Set()
                });
                modelEntry.count += 1;
                if (isActive) modelEntry.active += 1;
                if (customer) modelEntry.customers.add(customer);

                const pairEntry = ensure(pairMap, `${mfrKey(manufacturer)}||${item}`, { manufacturer, item });
                pairEntry.count += 1;
                if (isActive) pairEntry.active += 1;
            });

            const totalForBar = Math.max(recordCount, 1);
            const share = (count) => Math.round((count / totalForBar) * 1000) / 10;
            const sortByCount = (a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'ko');

            companyAnalysis.manufacturers = Array.from(mfrMap.values())
                .map((entry) => ({
                    name: entry.name,
                    count: entry.count,
                    active: entry.active,
                    share: share(entry.count),
                    itemCount: entry.items.size,
                    modelCount: entry.models.size,
                    items: Array.from(entry.items).sort((a, b) => a.localeCompare(b, 'ko')),
                    customers: Array.from(entry.customers)
                }))
                .sort(sortByCount);

            companyAnalysis.items = Array.from(itemMap.values())
                .map((entry) => ({
                    name: entry.name,
                    count: entry.count,
                    active: entry.active,
                    share: share(entry.count),
                    manufacturerCount: entry.manufacturers.size,
                    modelCount: entry.models.size,
                    manufacturers: Array.from(entry.manufacturers).sort((a, b) => a.localeCompare(b, 'ko'))
                }))
                .sort(sortByCount);

            companyAnalysis.models = Array.from(modelMap.values())
                .map((entry) => ({
                    name: entry.name,
                    manufacturer: entry.manufacturer,
                    item: entry.item,
                    count: entry.count,
                    active: entry.active,
                    share: share(entry.count),
                    customers: Array.from(entry.customers)
                }))
                .sort((a, b) => (b.count - a.count)
                    || a.manufacturer.localeCompare(b.manufacturer, 'ko')
                    || a.name.localeCompare(b.name, 'ko'));

            const matrixItemNames = Array.from(itemMap.values())
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
                .map((entry) => entry.name);

            let matrixMax = 0;
            const matrixRows = companyAnalysis.manufacturers.map((mfrEntry) => {
                const cells = matrixItemNames.map((itemName) => {
                    const pairEntry = pairMap.get(`${mfrKey(mfrEntry.name)}||${itemName}`);
                    const count = pairEntry ? pairEntry.count : 0;
                    if (count > matrixMax) matrixMax = count;
                    return count;
                });
                return { name: mfrEntry.name, total: mfrEntry.count, cells };
            });

            companyAnalysis.matrix = { items: matrixItemNames, rows: matrixRows, max: matrixMax };

            // 모델별 원본 레코드 (화면에서 접두어 통합·검색 집계용)
            companyAnalysis.modelRecords = Array.from(modelMap.values())
                .map((entry) => ({
                    mfr: entry.manufacturer,
                    item: entry.item,
                    model: entry.name,
                    count: entry.count,
                    active: entry.active,
                    customers: Array.from(entry.customers)
                }))
                .sort((a, b) => (b.count - a.count) || a.model.localeCompare(b.model, 'ko'));

            companyAnalysis.totals = {
                records: recordCount,
                activeRecords: activeRecordCount,
                manufacturers: companyAnalysis.manufacturers.length,
                items: companyAnalysis.items.length,
                models: companyAnalysis.models.length,
                customers: customerSet.size
            };
        } catch (err) {
            console.warn('[tech-status] 기술본부 스킬 분석 집계 실패:', err.code || err.message);
            engineerSkills = [];
            unmatchedEngineers = [];
        }
        // --- 기술본부 스킬 분석 종료 ---

        res.render('admin/tech_status', {
            page: 'tech_status',
            currentUser: req.session.user,
            projects,
            weeklyReports,
            issues,
            scheduleUsers: users,
            scheduleMap,
            dateRange,
            prevWeekLink: `/admin/tech-status?date=${prevWeek.toISOString().split('T')[0]}`,
            nextWeekLink: `/admin/tech-status?date=${nextWeek.toISOString().split('T')[0]}`,
            startOfWeek: startOfWeek,
            endOfWeek: endOfWeek,
            resourceMembers,
            resourceProjects: Object.values(projectMap),
            teamSummary: Object.values(teamSummary),
            engineerSkills,
            teamSkillCards,
            unmatchedEngineers,
            skillTotals,
            companyAnalysis,
            skillBasis
        });

    } catch (err) {
        console.error('기술본부 현황 페이지 로딩 중 오류 발생:', err);
        req.session.error = '페이지를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// 사용자 목록 페이지 렌더링
exports.getAdminUsersPage = async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT u.id, u.email, u.name, u.role, u.position, u.title, u.skill, u.is_resigned, u.join_date, u.education, u.certifications, u.construction_grade, d.text as department_name
            FROM tb_user u
            LEFT JOIN tb_dept d ON u.department_id = d.id
        `);
        res.render('admin/users', { 
            users: users,
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        req.session.error = '사용자 목록을 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// 사용자 추가 페이지 렌더링
exports.getAddUserPage = async (req, res) => {
    try {
        const [departments] = await db.query('SELECT id, text FROM tb_dept ORDER BY text');
        res.render('admin/add_user', {
            departments: departments,
            roles: ['admin', 'operations_manager', 'user'], // 역할 목록 추가
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        req.session.error = '부서 목록을 불러오는 중 오류가 발생했습니다.';
        res.redirect('/admin/users');
    }
};

// 사용자 추가 처리
exports.addUser = async (req, res) => {
    const { email, name, password, role, department_id, position, title, skill, join_date, education, certifications, construction_grade } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const deptId = department_id === '' ? null : department_id;
        
        await db.query(
            'INSERT INTO tb_user (email, name, password, role, department_id, position, title, skill, join_date, education, certifications, construction_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [email, name, hashedPassword, role, deptId, position, title, skill, join_date || null, education, certifications, construction_grade]
        );
        req.session.message = '사용자가 성공적으로 추가되었습니다.';
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            req.session.error = '이미 존재하는 이메일입니다.';
        } else {
            req.session.error = '사용자 추가 중 오류가 발생했습니다.';
        }
        res.redirect('/admin/users/add');
    }
};

// 사용자 수정 페이지 렌더링
exports.getEditUserPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [users] = await db.query('SELECT id, email, name, role, department_id, position, title, skill, is_resigned, join_date, education, certifications, construction_grade FROM tb_user WHERE id = ?', [id]);
        const [departments] = await db.query('SELECT id, text FROM tb_dept ORDER BY text');
        
        if (users.length > 0) {
            res.render('admin/edit_user', {
                user: users[0],
                departments: departments,
                roles: ['admin', 'operations_manager', 'user'], // 역할 목록 전달
                message: req.session.message,
                error: req.session.error
            });
            req.session.message = null;
            req.session.error = null;
        } else {
            req.session.error = '사용자를 찾을 수 없습니다.';
            res.redirect('/admin/users');
        }
    } catch (err) {
        console.error(err);
        req.session.error = '사용자 정보를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/admin/users');
    }
};

// 사용자 업데이트 처리
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { email, name, password, role, department_id, position, title, skill, is_resigned, join_date, education, certifications, construction_grade } = req.body;

    try {
        let updateSql, updateParams;
        const resignedStatus = is_resigned === 'on' ? 1 : 0; // checkbox value handling
        const deptId = department_id === '' ? null : department_id;

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateSql = 'UPDATE tb_user SET email = ?, name = ?, password = ?, role = ?, department_id = ?, position = ?, title = ?, skill = ?, is_resigned = ?, join_date = ?, education = ?, certifications = ?, construction_grade = ? WHERE id = ?';
            updateParams = [email, name, hashedPassword, role, deptId, position, title, skill, resignedStatus, join_date || null, education, certifications, construction_grade, id];
        } else {
            updateSql = 'UPDATE tb_user SET email = ?, name = ?, role = ?, department_id = ?, position = ?, title = ?, skill = ?, is_resigned = ?, join_date = ?, education = ?, certifications = ?, construction_grade = ? WHERE id = ?';
            updateParams = [email, name, role, deptId, position, title, skill, resignedStatus, join_date || null, education, certifications, construction_grade, id];
        }

        await db.query(updateSql, updateParams);
        req.session.message = '사용자 정보가 성공적으로 업데이트되었습니다.';
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            req.session.error = '이미 존재하는 이메일입니다.';
        } else {
            req.session.error = '사용자 업데이트 중 오류가 발생했습니다.';
        }
        res.redirect(`/admin/users/edit/${id}`);
    }
};

// (이하 다른 함수들은 이전과 동일, role 기반으로 수정된 부분만 반영)

// 사용자 삭제 처리
exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM tb_user WHERE id = ?', [id]);
        req.session.message = '사용자가 성공적으로 삭제되었습니다.';
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        req.session.error = '사용자 삭제 중 오류가 발생했습니다.';
        res.redirect('/admin/users');
    }
};

// 관리자 일정 페이지 렌더링
exports.getAdminSchedulePage = async (req, res) => {
    try {
        res.render('admin/schedule', {
            schedules: [],
            currentUser: req.session.user,
            page: 'admin_schedule'
        });
    } catch (err) {
        console.error(err);
        req.session.error = '일정 페이지를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// 특정 날짜의 일정 데이터를 가져오는 API
exports.getSchedulesForDate = async (req, res) => {
    try {
        const { date } = req.params;
        const [schedules] = await db.query(`
            SELECT s.id, s.user_id, s.title, s.start, s.end, s.description, u.name as user_name
            FROM tb_schedules s
            JOIN tb_user u ON s.user_id = u.id
            WHERE ? BETWEEN DATE(s.start) AND IFNULL(DATE(s.end) - INTERVAL 1 DAY, DATE(s.start))
            ORDER BY u.name, s.start, s.id
        `, [date]);

        // Group schedules by user
        const schedulesByUser = {};
        for (const schedule of schedules) {
            if (!schedulesByUser[schedule.user_id]) {
                schedulesByUser[schedule.user_id] = {
                    user_id: schedule.user_id,
                    user_name: schedule.user_name,
                    schedules: [],
                };
            }
            schedulesByUser[schedule.user_id].schedules.push(schedule);
        }

        // Merge schedules for each user
        const mergedSchedules = Object.values(schedulesByUser).map(userSchedules => {
            if (userSchedules.schedules.length > 1) {
                const firstSchedule = userSchedules.schedules[0];
                const mergedDescription = userSchedules.schedules
                    .map(s => `제목: ${s.title}\n내용: ${s.description || '없음'}`)
                    .join('\n--------------------\n');
                
                return {
                    ...firstSchedule,
                    title: `통합된 일정 ${userSchedules.schedules.length}건`,
                    description: mergedDescription,
                };
            } else {
                return userSchedules.schedules[0];
            }
        });

        res.json(mergedSchedules);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '일정 정보를 불러오는 중 오류가 발생했습니다.' });
    }
};


// 모든 사용자를 JSON으로 반환
exports.getAllUsersJson = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, email, name FROM tb_user WHERE is_resigned = 0');
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '사용자 목록을 불러오는 중 오류가 발생했습니다.' });
    }
};

// 주간 일정 분석 데이터를 가져오는 API
exports.getScheduleAnalysisData = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'startDate와 endDate는 필수 파라미터입니다.' });
        }

        const [allSchedules] = await db.query(`
            SELECT s.id, s.user_id, s.title, s.start, s.end, u.name as user_name, d.text as department_name, 'schedule' as type
            FROM tb_schedules s
            JOIN tb_user u ON s.user_id = u.id
            LEFT JOIN tb_dept d ON u.department_id = d.id
            WHERE s.start >= ? AND s.start <= ?
        `, [startDate, endDate]);

        const [wbsSchedules] = await db.query(`
            SELECT 
                wt.id, 
                wt.assigned_user_id as user_id, 
                wt.task_name as title, 
                wt.start_date as start, 
                wt.end_date as end, 
                u.name as user_name, 
                d.text as department_name, 
                wt.project_id, 
                'wbs' as type
            FROM tb_wbs_tasks wt
            JOIN tb_user u ON wt.assigned_user_id = u.id
            LEFT JOIN tb_dept d ON u.department_id = d.id
            WHERE wt.start_date >= ? AND wt.start_date <= ?
        `, [startDate, endDate]);

        const combinedSchedules = [...allSchedules, ...wbsSchedules];

        const usersWithSchedules = {};
        combinedSchedules.forEach(schedule => {
            if (!usersWithSchedules[schedule.user_id]) {
                usersWithSchedules[schedule.user_id] = {
                    id: schedule.user_id,
                    name: schedule.user_name,
                    department_name: schedule.department_name,
                    project_participation_count: 0, // Initialize
                    schedules: [],
                    schedulesByDate: {} // Initialize
                };
            }
            usersWithSchedules[schedule.user_id].schedules.push({
                id: schedule.id,
                title: schedule.title,
                start: schedule.start,
                end: schedule.end,
                type: schedule.type // Add type to distinguish schedule and wbs
            });
            
            // Mark all days between start and end date as having a schedule
            let currentDay = new Date(schedule.start);
            const endDate = new Date(schedule.end || schedule.start); // Use end date if available, otherwise start date
            
            // Adjust endDate for allDay events if necessary (FullCalendar exclusive vs DB inclusive)
            // For WBS tasks, assume start_date and end_date are inclusive
            
            while (currentDay <= endDate) {
                const scheduleDate = currentDay.toISOString().split('T')[0];
                if (!usersWithSchedules[schedule.user_id].schedulesByDate[scheduleDate]) {
                    usersWithSchedules[schedule.user_id].schedulesByDate[scheduleDate] = [];
                }
                usersWithSchedules[schedule.user_id].schedulesByDate[scheduleDate].push({
                    title: schedule.title,
                    type: schedule.type
                });
                currentDay.setDate(currentDay.getDate() + 1);
            }
        });

        // Fetch project participation count for each user, including WBS assignments
        const [projectParticipationCounts] = await db.query(`
            SELECT user_id, COUNT(DISTINCT project_id) as project_count
            FROM (
                SELECT user_id, project_id FROM tb_project_users
                UNION ALL
                SELECT assigned_user_id as user_id, project_id FROM tb_wbs_tasks WHERE assigned_user_id IS NOT NULL
            ) AS combined_project_assignments
            GROUP BY user_id
        `);

        projectParticipationCounts.forEach(ppc => {
            if (usersWithSchedules[ppc.user_id]) {
                usersWithSchedules[ppc.user_id].project_participation_count = ppc.project_count;
            }
        });

        // Calculate dateRange for the week
        const dateRange = [];
        let currentDate = new Date(startDate);
        while (currentDate <= new Date(endDate)) {
            dateRange.push(currentDate.toISOString().split('T')[0]); // Store as YYYY-MM-DD string
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const totalDaysInPeriod = dateRange.length;

        // Calculate total working days in the period
        let totalWorkingDaysInPeriod = 0;
        dateRange.forEach(dateStr => {
            const day = new Date(dateStr).getDay(); // 0 = Sunday, 6 = Saturday
            if (day !== 0 && day !== 6) { // If not Sunday and not Saturday
                totalWorkingDaysInPeriod++;
            }
        });

        // Calculate availability rate for each user
        Object.values(usersWithSchedules).forEach(user => {
            let daysWithSchedulesOnWorkingDays = 0;
            Object.keys(user.schedulesByDate).forEach(scheduleDateStr => {
                const day = new Date(scheduleDateStr).getDay();
                if (day !== 0 && day !== 6) { // If it's a weekday and has a schedule
                    daysWithSchedulesOnWorkingDays++;
                }
            });
            user.availabilityRate = totalWorkingDaysInPeriod > 0 ? ((daysWithSchedulesOnWorkingDays / totalWorkingDaysInPeriod) * 100).toFixed(1) : 0;
        });

        res.json({
            finalUsersWithSchedules: Object.values(usersWithSchedules),
            dateRange: dateRange
        });
    } catch (err) {
        console.error('주간 일정 분석 데이터를 불러오는 중 오류가 발생했습니다:', err);
        res.status(500).json({ message: '주간 일정 분석 데이터를 불러오는 중 오류가 발생했습니다.' });
    }
};

// 리소스 분석 페이지 렌더링
exports.getAdminResourceAnalysisPage = async (req, res) => {
    try {
        // 카드 1: 총인원 및 팀별 인원수
        const [totalUsersResult] = await db.query('SELECT COUNT(*) AS total_users FROM tb_user WHERE is_resigned = 0');
        const totalUsers = totalUsersResult[0].total_users;

        const [usersByDepartment] = await db.query(`
            SELECT d.text as department_name, COUNT(u.id) as user_count
            FROM tb_user u
            LEFT JOIN tb_dept d ON u.department_id = d.id
            WHERE u.is_resigned = 0
            GROUP BY d.text
            ORDER BY d.text
        `);

        // Fetch Technology Division (기술본부) departments and their user counts
        let techDivisionId = null;
        const [techDivision] = await db.query('SELECT id FROM tb_dept WHERE text = ?', ['기술본부']);
        if (techDivision.length > 0) {
            techDivisionId = techDivision[0].id;
        }

        let techDivisionDepartments = [];
        if (techDivisionId) {
            const [departmentsUnderTechDivision] = await db.query(`
                SELECT d.text as department_name, COUNT(u.id) as user_count
                FROM tb_dept d
                LEFT JOIN tb_user u ON u.department_id = d.id
                WHERE (d.parent_id = ? OR d.id = ?) AND (u.is_resigned = 0 OR u.id IS NULL) -- Include tech division itself if it has users directly
                GROUP BY d.text
                ORDER BY d.text
            `, [techDivisionId, techDivisionId]);
            techDivisionDepartments = departmentsUnderTechDivision;
        }

        // 카드 2: 평균 배정률 및 과부하 인원수 (플레이스홀더)
        const avgAllocationRate = '85%'; // 예시 값
        const overloadedPersonnel = 3; // 예시 값

        // 카드 3: 유휴 인원 (플레이스홀더)
        const idlePersonnel = 2; // 예시 값

        // 카드 4: 월 인건비 (예상-실제) (플레이스홀더)
        const estimatedLaborCost = '50,000,000원'; // 예시 값
        const actualLaborCost = '48,500,000원'; // 예시 값

        // 직원 가용성 탭을 위한 데이터: 모든 사용자 정보
        const [allUsersWithDetails] = await db.query(`
            SELECT u.id, u.name, u.email, u.position, u.title, u.skill, d.text as department_name, u.role
            FROM tb_user u
            LEFT JOIN tb_dept d ON u.department_id = d.id
            WHERE u.is_resigned = 0
            ORDER BY u.name
        `);

        // 프로젝트 배정 탭을 위한 데이터: 프로젝트별 배정된 사용자 정보
        const [projectsWithAssignments] = await db.query(`
            SELECT p.id as project_id, p.name as project_name, p.status as project_status, p.start_date, p.end_date,
                   u.id as user_id, u.name as user_name, u.position, u.title, d.text as department_name
            FROM tb_projects p
            JOIN tb_project_users pu ON p.id = pu.project_id
            JOIN tb_user u ON pu.user_id = u.id
            LEFT JOIN tb_dept d ON u.department_id = d.id
            ORDER BY p.name, u.name
        `);

        // 프로젝트 데이터를 구조화 (프로젝트 아래에 사용자들을 그룹화)
        const structuredProjects = {};
        projectsWithAssignments.forEach(assignment => {
            if (!structuredProjects[assignment.project_id]) {
                structuredProjects[assignment.project_id] = {
                    id: assignment.project_id,
                    name: assignment.project_name,
                    status: assignment.project_status,
                    start_date: assignment.start_date,
                    end_date: assignment.end_date,
                    estimated_labor_cost: '5,000,000원', // 플레이스홀더
                    actual_labor_cost: '4,800,000원', // 플레이스홀더
                    progress_rate: (assignment.project_status === '완료') ? '100%' : '70%', // 플레이스홀더
                    assignedUsers: []
                };
            }
            structuredProjects[assignment.project_id].assignedUsers.push({
                id: assignment.user_id,
                name: assignment.user_name,
                position: assignment.position,
                title: assignment.title,
                department_name: assignment.department_name
            });
        });
        const finalProjects = Object.values(structuredProjects);

        // 일정 분석 탭을 위한 데이터: 사용자별 한 달간 일정 정보
        const today = new Date();
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        oneWeekAgo.setHours(0, 0, 0, 0);

        const threeWeeksLater = new Date(today);
        threeWeeksLater.setDate(today.getDate() + 21); // 3 weeks = 21 days
        threeWeeksLater.setHours(23, 59, 59, 999);

        const dateRange = [];
        let currentDate = new Date(oneWeekAgo);
        while (currentDate <= threeWeeksLater) {
            dateRange.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const [allSchedules] = await db.query(`
            SELECT s.id, s.user_id, s.title, s.start, s.end, u.name as user_name, d.text as department_name
            FROM tb_schedules s
            JOIN tb_user u ON s.user_id = u.id
            LEFT JOIN tb_dept d ON u.department_id = d.id
            WHERE s.start >= ? AND s.start <= ?
            ORDER BY u.name, s.start
        `, [oneWeekAgo, threeWeeksLater]);

        const usersWithSchedules = {};
        allSchedules.forEach(schedule => {
            if (!usersWithSchedules[schedule.user_id]) {
                usersWithSchedules[schedule.user_id] = {
                    id: schedule.user_id,
                    name: schedule.user_name,
                    department_name: schedule.department_name,
                    project_participation_count: 0, // Placeholder, will be filled below
                    schedulesByDate: {} // For quick lookup
                };
            }
            const scheduleDate = new Date(schedule.start).toISOString().split('T')[0];
            usersWithSchedules[schedule.user_id].schedulesByDate[scheduleDate] = true; // Mark date as having a schedule
        });

        // Fetch project participation count for each user
        const [projectParticipationCounts] = await db.query(`
            SELECT user_id, COUNT(DISTINCT project_id) as project_count
            FROM tb_project_users
            GROUP BY user_id
        `);

        projectParticipationCounts.forEach(ppc => {
            if (usersWithSchedules[ppc.user_id]) {
                usersWithSchedules[ppc.user_id].project_participation_count = ppc.project_count;
            }
        });

        const finalUsersWithSchedules = Object.values(usersWithSchedules);

        res.render('admin/resource_analysis', {
            totalUsers,
            usersByDepartment,
            avgAllocationRate,
            overloadedPersonnel,
            idlePersonnel,
            estimatedLaborCost,
            actualLaborCost,
            allUsersWithDetails,
            finalProjects,
            finalUsersWithSchedules,
            dateRange, // Pass dateRange to the view
            techDivisionDepartments, // Pass tech division departments data
            currentUser: req.session.user,
            page: 'admin_resource_analysis'
        });
    } catch (err) {
        console.error('Error fetching resource analysis data:', err);
        req.session.error = '리소스 분석 데이터를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// 다른 사용자로 로그인 (사용자 가장)
exports.loginAsUser = async (req, res) => {
    if (req.session.user && req.session.user.role === 'admin' && !req.session.originalUser) {
        const targetUserId = req.params.userId;
        try {
            const [targetUsers] = await db.query('SELECT * FROM tb_user WHERE id = ?', [targetUserId]);
            if (targetUsers.length > 0) {
                const targetUser = targetUsers[0];

                if (targetUser.role === 'admin') {
                    req.session.error = '다른 관리자 계정으로는 로그인할 수 없습니다.';
                    return res.redirect('back');
                }

                req.session.originalUser = req.session.user;
                req.session.user = {
                    id: targetUser.id,
                    email: targetUser.email,
                    name: targetUser.name,
                    role: targetUser.role,
                    color: targetUser.user_color
                };
                
                req.session.message = `${targetUser.name}님 계정으로 로그인되었습니다.`;
                return res.redirect('/');
            }
        } catch (err) {
            console.error(err);
            req.session.error = '사용자 전환 중 오류가 발생했습니다.';
            return res.redirect('back');
        }
    }
    req.session.error = '권한이 없습니다.';
    res.redirect('/');
};

// 원래 관리자 계정으로 복귀
exports.returnToAdmin = (req, res) => {
    if (req.session.originalUser) {
        const adminUser = req.session.originalUser;
        req.session.user = adminUser;
        delete req.session.originalUser;
        req.session.message = `${adminUser.name}님 계정으로 복귀했습니다.`;
        res.redirect('/admin/users');
    } else {
        req.session.error = '잘못된 접근입니다.';
        res.redirect('/');
    }
};