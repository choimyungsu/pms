const db = require('../config/db');
const xlsx = require('xlsx');

/**
 * 패치관리 (Patch Management)
 *
 * 기준 테이블
 *  - tb_maintenance_summary        : 고객사(customer_company) / 사업명 / 담당자(정·부)
 *  - tb_maintenance_summary_items  : 품목(item_name) / 버전(item_version) / 상세(item_detail)
 *
 * 패치필요 필드
 *  - 현재는 tb_maintenance_summary_items.patch_required 를 사용합니다.
 *  - 패치 전용 테이블은 추후 별도 설계 예정이며, 교체 시 아래 ITEM_SOURCE 상수와
 *    UPDATE 대상만 바꾸면 되도록 한 곳에 모아 두었습니다.
 */

const PAGE_SIZE = 30;
const MAX_IN_LIST = 500;

/* ------------------------------------------------------------------ */
/* 헬퍼                                                                */
/* ------------------------------------------------------------------ */

function toArray(value) {
    if (value === undefined || value === null) return [];
    const arr = Array.isArray(value) ? value : [value];
    return arr
        .map((v) => String(v).trim())
        .filter((v) => v !== '' && v !== 'undefined' && v !== 'null')
        .slice(0, MAX_IN_LIST);
}

function placeholders(arr) {
    return arr.map(() => '?').join(', ');
}

function normalizeFilters(query) {
    // body/query 가 undefined 인 경우(예: body 없이 호출되는 POST) 안전하게 처리
    const source = query || {};
    return {
        search: (source.search || '').toString().trim(),
        items: toArray(source.items),
        versions: toArray(source.versions),
        customers: toArray(source.customers),
        patch: ['1', '0'].includes(source.patch) ? source.patch : '',
        activeOnly: source.active_only === '1'
    };
}

// 목록/엑셀 공통 WHERE
function buildFilter(filters) {
    const where = [];
    const params = [];

    if (filters.search) {
        const like = `%${filters.search}%`;
        const cols = [
            's.customer_company', 's.project_name',
            'i.item_name', 'i.manufacturer', 'i.item_version', 'i.item_detail',
            's.main_engineer', 's.sub_engineer'
        ];
        where.push(`(${cols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
        cols.forEach(() => params.push(like));
    }

    if (filters.customers.length) {
        where.push(`s.customer_company IN (${placeholders(filters.customers)})`);
        params.push(...filters.customers);
    }

    if (filters.items.length) {
        where.push(`i.item_name IN (${placeholders(filters.items)})`);
        params.push(...filters.items);
    }

    if (filters.versions.length) {
        where.push(`i.item_version IN (${placeholders(filters.versions)})`);
        params.push(...filters.versions);
    }

    if (filters.patch === '1') {
        where.push('COALESCE(i.patch_required, 0) = 1');
    } else if (filters.patch === '0') {
        where.push('COALESCE(i.patch_required, 0) = 0');
    }

    const whereString = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    return { whereString, params };
}

// 조건 적용용 매칭 WHERE (items 테이블 별칭 i, summary 별칭 s)
function buildMatch(filters) {
    const where = [];
    const params = [];

    if (filters.items.length) {
        where.push(`i.item_name IN (${placeholders(filters.items)})`);
        params.push(...filters.items);
    }
    if (filters.versions.length) {
        where.push(`i.item_version IN (${placeholders(filters.versions)})`);
        params.push(...filters.versions);
    }
    if (filters.customers.length) {
        where.push(`s.customer_company IN (${placeholders(filters.customers)})`);
        params.push(...filters.customers);
    }

    return { matchString: where.join(' AND '), params };
}

function describeCondition(items, versions, customers) {
    const parts = [];
    if (items.length) parts.push(`품목: ${items.join(', ')}`);
    if (versions.length) parts.push(`버전: ${versions.join(', ')}`);
    if (customers.length) parts.push(`고객사: ${customers.join(', ')}`);
    return parts.join(' | ').slice(0, 500);
}

function queryFromFilters(filters, extra = {}) {
    const sp = new URLSearchParams();
    if (filters.search) sp.set('search', filters.search);
    filters.items.forEach((v) => sp.append('items', v));
    filters.versions.forEach((v) => sp.append('versions', v));
    filters.customers.forEach((v) => sp.append('customers', v));
    if (filters.patch) sp.set('patch', filters.patch);
    if (filters.activeOnly) sp.set('active_only', '1');
    Object.entries(extra).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') sp.set(k, v);
    });
    const s = sp.toString();
    return s ? `?${s}` : '';
}

const SELECT_ROW = `
    SELECT
        i.id,
        i.summary_id,
        i.item_name,
        i.manufacturer,
        i.item_version,
        i.item_detail,
        COALESCE(i.patch_required, 0) AS patch_required,
        i.patch_required_at,
        i.patch_required_by,
        i.patch_condition,
        s.customer_company,
        s.project_name,
        s.division,
        s.main_engineer,
        s.sub_engineer,
        s.maintenance_start_date,
        s.maintenance_end_date
      FROM tb_maintenance_summary_items i
      JOIN tb_maintenance_summary s ON s.id = i.summary_id
`;

async function loadOptions() {
    const [[itemRows], [versionRows], [customerRows]] = await Promise.all([
        db.query(`SELECT DISTINCT item_name AS v FROM tb_maintenance_summary_items
                   WHERE item_name IS NOT NULL AND item_name <> '' ORDER BY item_name`),
        db.query(`SELECT DISTINCT item_version AS v FROM tb_maintenance_summary_items
                   WHERE item_version IS NOT NULL AND item_version <> '' ORDER BY item_version`),
        db.query(`SELECT DISTINCT customer_company AS v FROM tb_maintenance_summary
                   WHERE customer_company IS NOT NULL AND customer_company <> '' ORDER BY customer_company`)
    ]);

    return {
        itemOptions: itemRows.map((r) => r.v),
        versionOptions: versionRows.map((r) => r.v),
        customerOptions: customerRows.map((r) => r.v)
    };
}

/* ------------------------------------------------------------------ */
/* 목록 화면                                                           */
/* ------------------------------------------------------------------ */

exports.getPatchList = async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const { whereString, params } = buildFilter(filters);

        const [[countRow]] = await db.query(
            `SELECT COUNT(*) AS cnt
               FROM tb_maintenance_summary_items i
               JOIN tb_maintenance_summary s ON s.id = i.summary_id
               ${whereString}`,
            params
        );
        const totalRecords = Number(countRow.cnt) || 0;
        const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
        const currentPage = Math.min(page, totalPages);

        const [rows] = await db.query(
            `${SELECT_ROW}
             ${whereString}
             ORDER BY COALESCE(i.patch_required, 0) DESC, s.customer_company ASC, i.item_name ASC, i.id ASC
             LIMIT ?, ?`,
            [...params, (currentPage - 1) * PAGE_SIZE, PAGE_SIZE]
        );

        const options = await loadOptions();

        const [[filteredSummary]] = await db.query(
            `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN COALESCE(i.patch_required,0) = 1 THEN 1 ELSE 0 END) AS required_count
               FROM tb_maintenance_summary_items i
               JOIN tb_maintenance_summary s ON s.id = i.summary_id
               ${whereString}`,
            params
        );

        const [[globalSummary]] = await db.query(
            `SELECT COUNT(*) AS total_all,
                    SUM(CASE WHEN COALESCE(patch_required,0) = 1 THEN 1 ELSE 0 END) AS required_all
               FROM tb_maintenance_summary_items`
        );

        res.render('maintenance/patch_list', {
            user: req.session.user,
            currentUser: req.session.user,
            page_title: '패치관리',
            page: 'maintenance_patch',
            rows,
            filters,
            itemOptions: options.itemOptions,
            versionOptions: options.versionOptions,
            customerOptions: options.customerOptions,
            currentPage,
            totalPages,
            totalRecords,
            filteredTotal: Number(filteredSummary.total) || 0,
            filteredRequired: Number(filteredSummary.required_count) || 0,
            globalTotal: Number(globalSummary.total_all) || 0,
            globalRequired: Number(globalSummary.required_all) || 0,
            notice: req.query.notice || '',
            noticeType: req.query.notice_type || 'success',
            queryString: queryFromFilters(filters)
        });
    } catch (error) {
        console.error('[patch] getPatchList error:', error);
        res.status(500).send('서버 오류');
    }
};

/* ------------------------------------------------------------------ */
/* 조건 적용                                                           */
/* ------------------------------------------------------------------ */

exports.applyCondition = async (req, res) => {
    const filters = normalizeFilters(req.body);
    const { items, versions, customers } = filters;
    const mode = ['check', 'replace', 'uncheck'].includes(req.body.mode) ? req.body.mode : 'check';

    const back = (notice, type) =>
        res.redirect(`/maintenance/patch${queryFromFilters(filters, { notice, notice_type: type })}`);

    try {
        if (!items.length && !versions.length && !customers.length) {
            return back('품목 또는 버전을 최소 1개 이상 선택해야 합니다.', 'warning');
        }

        const conditionSummary = describeCondition(items, versions, customers);
        const operator = (req.session.user && req.session.user.name) || 'system';
        const { matchString, params } = buildMatch(filters);

        let affected = 0;

        if (mode === 'check') {
            const [result] = await db.query(
                `UPDATE tb_maintenance_summary_items i
                   JOIN tb_maintenance_summary s ON s.id = i.summary_id
                    SET i.patch_required = 1,
                        i.patch_required_at = NOW(),
                        i.patch_required_by = ?,
                        i.patch_condition = ?
                  WHERE ${matchString}`,
                [operator, conditionSummary, ...params]
            );
            affected = result.affectedRows || 0;
        } else if (mode === 'uncheck') {
            const [result] = await db.query(
                `UPDATE tb_maintenance_summary_items i
                   JOIN tb_maintenance_summary s ON s.id = i.summary_id
                    SET i.patch_required = 0,
                        i.patch_required_at = NULL,
                        i.patch_required_by = NULL,
                        i.patch_condition = NULL
                  WHERE ${matchString}`,
                params
            );
            affected = result.affectedRows || 0;
        } else {
            // replace : 전체 초기화 후 조건 해당 건만 체크 (트랜잭션)
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                await conn.query(
                    `UPDATE tb_maintenance_summary_items
                        SET patch_required = 0,
                            patch_required_at = NULL,
                            patch_required_by = NULL,
                            patch_condition = NULL`
                );
                const [result] = await conn.query(
                    `UPDATE tb_maintenance_summary_items i
                       JOIN tb_maintenance_summary s ON s.id = i.summary_id
                        SET i.patch_required = 1,
                            i.patch_required_at = NOW(),
                            i.patch_required_by = ?,
                            i.patch_condition = ?
                      WHERE ${matchString}`,
                    [operator, conditionSummary, ...params]
                );
                affected = result.affectedRows || 0;
                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }
        }

        const modeLabel = mode === 'replace' ? '조건 기준으로 재설정' : mode === 'uncheck' ? '조건 항목 체크 해제' : '조건 항목 체크';
        return back(`${modeLabel} 완료 — ${affected}건 반영 (${conditionSummary})`, 'success');
    } catch (error) {
        console.error('[patch] applyCondition error:', error);
        return back('조건 적용 중 오류가 발생했습니다.', 'error');
    }
};

/* ------------------------------------------------------------------ */
/* 개별 토글 / 전체 초기화                                              */
/* ------------------------------------------------------------------ */

exports.togglePatchRequired = async (req, res) => {
    const { id } = req.params;
    try {
        const raw = req.body ? req.body.patch_required : undefined;
        if (raw === undefined || raw === null) {
            return res.status(400).json({ success: false, message: 'patch_required 값이 필요합니다.' });
        }
        const next = ['1', 'true', 1, true].includes(raw) ? 1 : 0;
        const operator = (req.session.user && req.session.user.name) || 'system';

        const [result] = next === 1
            ? await db.query(
                `UPDATE tb_maintenance_summary_items
                    SET patch_required = 1, patch_required_at = NOW(), patch_required_by = ?, patch_condition = ?
                  WHERE id = ?`,
                [operator, '수동 지정', id]
            )
            : await db.query(
                `UPDATE tb_maintenance_summary_items
                    SET patch_required = 0, patch_required_at = NULL, patch_required_by = NULL, patch_condition = NULL
                  WHERE id = ?`,
                [id]
            );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: '대상을 찾을 수 없습니다.' });
        }
        return res.json({ success: true, patch_required: next });
    } catch (error) {
        console.error('[patch] togglePatchRequired error:', error);
        return res.status(500).json({ success: false, message: '서버 오류' });
    }
};

exports.resetPatchRequired = async (req, res) => {
    const filters = normalizeFilters(req.body);
    try {
        const [result] = await db.query(
            `UPDATE tb_maintenance_summary_items
                SET patch_required = 0, patch_required_at = NULL, patch_required_by = NULL, patch_condition = NULL
              WHERE COALESCE(patch_required, 0) = 1`
        );
        return res.redirect(`/maintenance/patch${queryFromFilters(filters, {
            notice: `전체 패치필요 체크를 초기화했습니다. (${result.affectedRows || 0}건)`,
            notice_type: 'success'
        })}`);
    } catch (error) {
        console.error('[patch] resetPatchRequired error:', error);
        return res.redirect(`/maintenance/patch${queryFromFilters(filters, {
            notice: '초기화 중 오류가 발생했습니다.',
            notice_type: 'error'
        })}`);
    }
};

/* ------------------------------------------------------------------ */
/* 미리보기 / 옵션                                                      */
/* ------------------------------------------------------------------ */

exports.previewCount = async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        if (!filters.items.length && !filters.versions.length) {
            return res.json({ success: true, count: 0, checked: 0, ready: false });
        }
        const { matchString, params } = buildMatch(filters);
        const [[row]] = await db.query(
            `SELECT COUNT(*) AS cnt,
                    SUM(CASE WHEN COALESCE(i.patch_required,0) = 1 THEN 1 ELSE 0 END) AS checked_cnt
               FROM tb_maintenance_summary_items i
               JOIN tb_maintenance_summary s ON s.id = i.summary_id
              WHERE ${matchString}`,
            params
        );
        return res.json({
            success: true,
            count: Number(row.cnt) || 0,
            checked: Number(row.checked_cnt) || 0,
            ready: true
        });
    } catch (error) {
        console.error('[patch] previewCount error:', error);
        return res.status(500).json({ success: false, message: '서버 오류' });
    }
};

exports.getOptions = async (req, res) => {
    try {
        const options = await loadOptions();
        res.json({ success: true, ...options });
    } catch (error) {
        console.error('[patch] getOptions error:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
};

/* ------------------------------------------------------------------ */
/* 버전 일괄(복수행) 저장                                              */
/* ------------------------------------------------------------------ */
/* 요청 형식: { rows: [{ id: 1, item_version: 'v7.0.2' }, ...] }
   - id 는 tb_maintenance_summary_items.id
   - 존재하지 않는 id 는 건너뛰고 skipped 로 집계
   - 트랜잭션으로 일괄 반영                                            */

exports.saveItemVersions = async (req, res) => {
    try {
        const body = req.body || {};
        let rows = body.rows;

        // 폼(form-urlencoded) 으로 들어온 경우 문자열 JSON 파싱
        if (typeof rows === 'string') {
            try { rows = JSON.parse(rows); } catch (e) { rows = null; }
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: '저장할 행이 없습니다.' });
        }

        // 정규화 + 검증
        const normalized = [];
        const seen = new Set();
        for (const row of rows.slice(0, MAX_IN_LIST)) {
            if (!row) continue;
            const id = parseInt(row.id, 10);
            if (!Number.isInteger(id) || id <= 0) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            const rawVersion = row.item_version;
            const version = rawVersion === null || rawVersion === undefined
                ? null
                : String(rawVersion).trim().slice(0, 255);
            normalized.push({ id, item_version: version === '' ? null : version });
        }

        if (normalized.length === 0) {
            return res.status(400).json({ success: false, message: '유효한 행이 없습니다.' });
        }

        // 대상 존재 확인
        const ids = normalized.map((r) => r.id);
        const [exists] = await db.query(
            `SELECT id FROM tb_maintenance_summary_items WHERE id IN (${placeholders(ids)})`,
            ids
        );
        const existsSet = new Set(exists.map((r) => Number(r.id)));
        const targets = normalized.filter((r) => existsSet.has(r.id));
        const skipped = normalized.length - targets.length;

        if (targets.length === 0) {
            return res.status(404).json({ success: false, message: '대상 품목을 찾을 수 없습니다.' });
        }

        // 트랜잭션 일괄 UPDATE
        const conn = await db.getConnection();
        let updated = 0;
        try {
            await conn.beginTransaction();
            for (const t of targets) {
                const [result] = await conn.query(
                    'UPDATE tb_maintenance_summary_items SET item_version = ? WHERE id = ?',
                    [t.item_version, t.id]
                );
                updated += result.affectedRows || 0;
            }
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        return res.json({
            success: true,
            updated,
            skipped,
            message: `버전 ${updated}건을 저장했습니다.${skipped ? ` (${skipped}건 제외)` : ''}`
        });
    } catch (error) {
        console.error('[patch] saveItemVersions error:', error);
        return res.status(500).json({ success: false, message: '버전 저장 중 오류가 발생했습니다.' });
    }
};

/* ------------------------------------------------------------------ */
/* 엑셀 다운로드                                                        */
/* ------------------------------------------------------------------ */

exports.downloadPatchExcel = async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const { whereString, params } = buildFilter(filters);

        const [rows] = await db.query(
            `${SELECT_ROW}
             ${whereString}
             ORDER BY COALESCE(i.patch_required, 0) DESC, s.customer_company ASC, i.item_name ASC, i.id ASC`,
            params
        );

        const header = [
            '고객사', '품목', '제조사', '버전',
            '패치필요', '판정일시', '판정자', '판정 조건',
            '사업명', '상세내용', '담당자(정)', '담당자(부)',
            '유지보수 시작일', '유지보수 종료일'
        ];

        const pad = (n) => String(n).padStart(2, '0');
        const toYmd = (v) => {
            if (!v) return '';
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        };
        const toYmdHm = (v) => {
            if (!v) return '';
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            return `${toYmd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        const data = rows.map((r) => [
            r.customer_company || '',
            r.item_name || '',
            r.manufacturer || '',
            r.item_version || '',
            Number(r.patch_required) === 1 ? 'O' : '',
            toYmdHm(r.patch_required_at),
            r.patch_required_by || '',
            r.patch_condition || '',
            r.project_name || '',
            r.item_detail || '',
            r.main_engineer || '',
            r.sub_engineer || '',
            toYmd(r.maintenance_start_date),
            toYmd(r.maintenance_end_date)
        ]);

        const ws = xlsx.utils.aoa_to_sheet([header, ...data]);
        ws['!cols'] = [
            { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
            { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 40 },
            { wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
            { wch: 14 }, { wch: 14 }
        ];

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, '패치관리');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const now = new Date();
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="patch_management_${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(`패치관리_${stamp}.xlsx`)}`
        );
        res.send(buf);
    } catch (error) {
        console.error('[patch] downloadPatchExcel error:', error);
        res.status(500).send('엑셀 다운로드 중 오류가 발생했습니다.');
    }
};
