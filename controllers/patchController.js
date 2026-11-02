const db = require('../config/db');
const xlsx = require('xlsx');

/**
 * 패치관리(Patch Management)
 * - 데이터 원천: tb_maintenance (고객사 / 품목 / 버전 / 담당자(정·부) )
 * - 패치필요 여부: tb_maintenance.patch_required (+ patch_required_at / patch_required_by / patch_condition)
 * - 조건 UI 에서 품목·버전(복수)을 선택하면 해당 조합의 행이 패치필요로 체크됩니다.
 */

const PAGE_SIZE = 30;
const MAX_IN_LIST = 500;

// 버전 표시용 SQL 식 (펌웨어 / OS 를 함께 보여줌)
const VERSION_DISPLAY_SQL = `CONCAT_WS(' / ', NULLIF(m.firmware_version, ''), NULLIF(m.os_version, ''))`;

// 담당자(정/부) SQL 식 : 정 담당자는 main_engineer, 없으면 유지보수담당자로 대체
const MANAGER_PRIMARY_SQL = `COALESCE(NULLIF(m.main_engineer, ''), NULLIF(m.maintenance_manager, ''))`;
const MANAGER_SECONDARY_SQL = `NULLIF(m.sub_engineer, '')`;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

// body 에서 배열 파라미터를 안전하게 추출 (items, items[] 둘 다 지원)
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

/**
 * 목록/엑셀 공통 WHERE 절 생성
 * filters: { search, items, versions, customers, patch, activeOnly }
 */
function buildFilter(filters) {
    const where = [];
    const params = [];

    if (filters.search) {
        const like = `%${filters.search}%`;
        const cols = [
            'm.customer_company', 'm.project_name', 'm.item', 'm.manufacturer', 'm.model',
            'm.serial_number', 'm.firmware_version', 'm.os_version',
            'm.main_engineer', 'm.sub_engineer', 'm.maintenance_manager'
        ];
        where.push(`(${cols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
        cols.forEach(() => params.push(like));
    }

    if (filters.items.length > 0) {
        where.push(`m.item IN (${placeholders(filters.items)})`);
        params.push(...filters.items);
    }

    if (filters.versions.length > 0) {
        // 선택한 버전이 펌웨어 또는 OS 어느 쪽에 있더라도 매칭
        where.push(`(m.firmware_version IN (${placeholders(filters.versions)}) OR m.os_version IN (${placeholders(filters.versions)}))`);
        params.push(...filters.versions, ...filters.versions);
    }

    if (filters.customers.length > 0) {
        where.push(`m.customer_company IN (${placeholders(filters.customers)})`);
        params.push(...filters.customers);
    }

    if (filters.patch === '1') {
        where.push('m.patch_required = 1');
    } else if (filters.patch === '0') {
        where.push('(m.patch_required = 0 OR m.patch_required IS NULL)');
    }

    if (filters.activeOnly) {
        where.push('m.closed_at IS NULL');
    }

    const whereString = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    return { whereString, params };
}

function normalizeFilters(query) {
    return {
        search: (query.search || '').toString().trim(),
        items: toArray(query.items),
        versions: toArray(query.versions),
        customers: toArray(query.customers),
        patch: ['1', '0'].includes(query.patch) ? query.patch : '',
        activeOnly: query.active_only === '1'
    };
}

// 조회 조건 요약 문자열 (patch_condition 컬럼 / 화면 표시용)
function describeCondition(items, versions, customers) {
    const parts = [];
    if (items.length) parts.push(`품목: ${items.join(', ')}`);
    if (versions.length) parts.push(`버전: ${versions.join(', ')}`);
    if (customers.length) parts.push(`고객사: ${customers.join(', ')}`);
    return parts.join(' | ').slice(0, 500);
}

// 필터 쿼리스트링 재생성 (리다이렉트 시 조건 유지)
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

// 조건 옵션(품목 / 버전 / 고객사) 목록
async function loadOptions() {
    const [[itemRows], [versionRows], [customerRows]] = await Promise.all([
        db.query(`SELECT DISTINCT item FROM tb_maintenance
                   WHERE item IS NOT NULL AND item <> '' ORDER BY item`),
        db.query(`SELECT v FROM (
                     SELECT DISTINCT firmware_version AS v FROM tb_maintenance
                      WHERE firmware_version IS NOT NULL AND firmware_version <> ''
                     UNION
                     SELECT DISTINCT os_version AS v FROM tb_maintenance
                      WHERE os_version IS NOT NULL AND os_version <> ''
                  ) t ORDER BY v`),
        db.query(`SELECT DISTINCT customer_company FROM tb_maintenance
                   WHERE customer_company IS NOT NULL AND customer_company <> ''
                   ORDER BY customer_company`)
    ]);

    return {
        itemOptions: itemRows.map((r) => r.item),
        versionOptions: versionRows.map((r) => r.v),
        customerOptions: customerRows.map((r) => r.customer_company)
    };
}

/* ------------------------------------------------------------------ */
/* 화면                                                                */
/* ------------------------------------------------------------------ */

// GET /maintenance/patch
exports.getPatchList = async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const offset = (page - 1) * PAGE_SIZE;

        const { whereString, params } = buildFilter(filters);

        const [[countRow]] = await db.query(
            `SELECT COUNT(*) AS cnt FROM tb_maintenance m${whereString}`,
            params
        );
        const totalRecords = Number(countRow.cnt) || 0;
        const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
        const currentPage = Math.min(page, totalPages);

        const [rows] = await db.query(
            `SELECT
                m.id,
                m.customer_company,
                m.project_name,
                m.item,
                m.manufacturer,
                m.model,
                m.serial_number,
                m.firmware_version,
                m.os_version,
                ${VERSION_DISPLAY_SQL} AS version_display,
                ${MANAGER_PRIMARY_SQL} AS manager_primary,
                ${MANAGER_SECONDARY_SQL} AS manager_secondary,
                m.maintenance_manager,
                m.maintenance_start_date,
                m.maintenance_end_date,
                COALESCE(m.patch_required, 0) AS patch_required,
                m.patch_required_at,
                m.patch_required_by,
                m.patch_condition
               FROM tb_maintenance m
               ${whereString}
               ORDER BY COALESCE(m.patch_required, 0) DESC, m.customer_company ASC, m.item ASC, m.id ASC
               LIMIT ?, ?`,
            [...params, (currentPage - 1) * PAGE_SIZE, PAGE_SIZE]
        );

        const options = await loadOptions();

        // 상단 요약 카운트
        const [[summaryRow]] = await db.query(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN COALESCE(patch_required, 0) = 1 THEN 1 ELSE 0 END) AS required_count
               FROM tb_maintenance m${whereString}`,
            params
        );

        const [[globalRow]] = await db.query(
            `SELECT
                COUNT(*) AS total_all,
                SUM(CASE WHEN COALESCE(patch_required, 0) = 1 THEN 1 ELSE 0 END) AS required_all
               FROM tb_maintenance`
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
            filteredTotal: Number(summaryRow.total) || 0,
            filteredRequired: Number(summaryRow.required_count) || 0,
            globalTotal: Number(globalRow.total_all) || 0,
            globalRequired: Number(globalRow.required_all) || 0,
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

// POST /maintenance/patch/apply-condition
exports.applyCondition = async (req, res) => {
    const filters = normalizeFilters(req.body);
    const { items, versions, customers } = filters;
    const mode = ['check', 'replace', 'uncheck'].includes(req.body.mode) ? req.body.mode : 'check';

    try {
        if (items.length === 0 && versions.length === 0 && customers.length === 0) {
            return res.redirect(`/maintenance/patch${queryFromFilters(filters, {
                notice: '품목 또는 버전을 최소 1개 이상 선택해야 합니다.',
                notice_type: 'warning'
            })}`);
        }

        const conditionSummary = describeCondition(items, versions, customers);
        const operator = req.session.user && req.session.user.name ? req.session.user.name : 'system';

        // 매칭 조건 생성 (고객사 조건은 선택했을 때만)
        const matchWhere = [];
        const matchParams = [];

        if (items.length) {
            matchWhere.push(`item IN (${placeholders(items)})`);
            matchParams.push(...items);
        }
        if (versions.length) {
            matchWhere.push(`(firmware_version IN (${placeholders(versions)}) OR os_version IN (${placeholders(versions)}))`);
            matchParams.push(...versions, ...versions);
        }
        if (customers.length) {
            matchWhere.push(`customer_company IN (${placeholders(customers)})`);
            matchParams.push(...customers);
        }
        const matchString = matchWhere.join(' AND ');

        let affected = 0;

        if (mode === 'check') {
            // 조건에 해당하는 항목만 패치필요 = 1 (그 외 기존 값 유지)
            const [result] = await db.query(
                `UPDATE tb_maintenance
                    SET patch_required = 1,
                        patch_required_at = NOW(),
                        patch_required_by = ?,
                        patch_condition = ?
                  WHERE ${matchString}`,
                [operator, conditionSummary, ...matchParams]
            );
            affected = result.affectedRows || 0;
        } else if (mode === 'uncheck') {
            // 조건에 해당하는 항목만 패치필요 = 0
            const [result] = await db.query(
                `UPDATE tb_maintenance
                    SET patch_required = 0,
                        patch_required_at = NULL,
                        patch_required_by = NULL,
                        patch_condition = NULL
                  WHERE ${matchString}`,
                [...matchParams]
            );
            affected = result.affectedRows || 0;
        } else {
            // replace : 전체 초기화 후 조건에 해당하는 항목만 체크
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                await connection.query(
                    `UPDATE tb_maintenance
                        SET patch_required = 0,
                            patch_required_at = NULL,
                            patch_required_by = NULL,
                            patch_condition = NULL`
                );
                const [result] = await connection.query(
                    `UPDATE tb_maintenance
                        SET patch_required = 1,
                            patch_required_at = NOW(),
                            patch_required_by = ?,
                            patch_condition = ?
                      WHERE ${matchString}`,
                    [operator, conditionSummary, ...matchParams]
                );
                affected = result.affectedRows || 0;
                await connection.commit();
            } catch (err) {
                await connection.rollback();
                throw err;
            } finally {
                connection.release();
            }
        }

        const modeLabel = mode === 'replace' ? '조건 기준으로 재설정' : mode === 'uncheck' ? '조건 항목 체크 해제' : '조건 항목 체크';
        const notice = `${modeLabel} 완료 — ${affected}건 반영 (${conditionSummary})`;

        return res.redirect(`/maintenance/patch${queryFromFilters(filters, {
            notice,
            notice_type: 'success'
        })}`);
    } catch (error) {
        console.error('[patch] applyCondition error:', error);
        return res.redirect(`/maintenance/patch${queryFromFilters(filters, {
            notice: '조건 적용 중 오류가 발생했습니다.',
            notice_type: 'error'
        })}`);
    }
};

/* ------------------------------------------------------------------ */
/* 개별 토글 / 전체 초기화                                              */
/* ------------------------------------------------------------------ */

// POST /maintenance/patch/toggle/:id  (AJAX)
exports.togglePatchRequired = async (req, res) => {
    const { id } = req.params;
    try {
        const next = req.body && req.body.patch_required !== undefined
            ? (['1', 'true', 1, true].includes(req.body.patch_required) ? 1 : 0)
            : null;

        if (next === null) {
            return res.status(400).json({ success: false, message: 'patch_required 값이 필요합니다.' });
        }

        const operator = req.session.user && req.session.user.name ? req.session.user.name : 'system';

        const [result] = next === 1
            ? await db.query(
                `UPDATE tb_maintenance
                    SET patch_required = 1, patch_required_at = NOW(), patch_required_by = ?, patch_condition = ?
                  WHERE id = ?`,
                [operator, '수동 지정', id]
            )
            : await db.query(
                `UPDATE tb_maintenance
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

// POST /maintenance/patch/reset
exports.resetPatchRequired = async (req, res) => {
    const filters = normalizeFilters(req.body);
    try {
        const [result] = await db.query(
            `UPDATE tb_maintenance
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
/* 엑셀 다운로드                                                        */
/* ------------------------------------------------------------------ */

// GET /maintenance/patch/download-excel
exports.downloadPatchExcel = async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const { whereString, params } = buildFilter(filters);

        const [rows] = await db.query(
            `SELECT
                m.customer_company,
                m.project_name,
                m.item,
                m.manufacturer,
                m.model,
                m.serial_number,
                m.firmware_version,
                m.os_version,
                ${VERSION_DISPLAY_SQL} AS version_display,
                ${MANAGER_PRIMARY_SQL} AS manager_primary,
                ${MANAGER_SECONDARY_SQL} AS manager_secondary,
                m.maintenance_manager,
                m.maintenance_start_date,
                m.maintenance_end_date,
                COALESCE(m.patch_required, 0) AS patch_required,
                m.patch_required_at,
                m.patch_required_by,
                m.patch_condition
               FROM tb_maintenance m
               ${whereString}
               ORDER BY COALESCE(m.patch_required, 0) DESC, m.customer_company ASC, m.item ASC, m.id ASC`,
            params
        );

        const header = [
            '고객사', '사업명', '품목', '제조사', '모델', 'S/N',
            '펌웨어 버전', 'OS 버전', '버전',
            '담당자(정)', '담당자(부)', '유지보수 담당자',
            '유지보수 시작일', '유지보수 종료일',
            '패치필요', '판정일시', '판정자', '판정 조건'
        ];

        const toYmd = (v) => {
            if (!v) return '';
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const toYmdHms = (v) => {
            if (!v) return '';
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            return `${toYmd(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        const data = rows.map((r) => [
            r.customer_company || '',
            r.project_name || '',
            r.item || '',
            r.manufacturer || '',
            r.model || '',
            r.serial_number || '',
            r.firmware_version || '',
            r.os_version || '',
            r.version_display || '',
            r.manager_primary || '',
            r.manager_secondary || '',
            r.maintenance_manager || '',
            toYmd(r.maintenance_start_date),
            toYmd(r.maintenance_end_date),
            Number(r.patch_required) === 1 ? 'O' : '',
            toYmdHms(r.patch_required_at),
            r.patch_required_by || '',
            r.patch_condition || ''
        ]);

        const ws = xlsx.utils.aoa_to_sheet([header, ...data]);
        ws['!cols'] = [
            { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
            { wch: 14 }, { wch: 14 }, { wch: 20 },
            { wch: 14 }, { wch: 14 }, { wch: 16 },
            { wch: 14 }, { wch: 14 },
            { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 40 }
        ];

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, '패치관리');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `patch_management_${stamp}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(`패치관리_${stamp}.xlsx`)}`
        );
        res.send(buf);
    } catch (error) {
        console.error('[patch] downloadPatchExcel error:', error);
        res.status(500).send('엑셀 다운로드 중 오류가 발생했습니다.');
    }
};

// GET /maintenance/patch/preview-count  (조건 UI 미리보기: 선택 조건에 매칭되는 건수)
exports.previewCount = async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const { items, versions, customers } = filters;

        if (items.length === 0 && versions.length === 0) {
            return res.json({ success: true, count: 0, checked: 0, ready: false });
        }

        const where = [];
        const params = [];
        if (items.length) {
            where.push(`item IN (${placeholders(items)})`);
            params.push(...items);
        }
        if (versions.length) {
            where.push(`(firmware_version IN (${placeholders(versions)}) OR os_version IN (${placeholders(versions)}))`);
            params.push(...versions, ...versions);
        }
        if (customers.length) {
            where.push(`customer_company IN (${placeholders(customers)})`);
            params.push(...customers);
        }

        const [[row]] = await db.query(
            `SELECT COUNT(*) AS cnt,
                    SUM(CASE WHEN COALESCE(patch_required, 0) = 1 THEN 1 ELSE 0 END) AS checked_cnt
               FROM tb_maintenance
              WHERE ${where.join(' AND ')}`,
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

// GET /maintenance/patch/options  (조건 UI 옵션을 JSON 으로 - 필요 시 사용)
exports.getOptions = async (req, res) => {
    try {
        const options = await loadOptions();
        res.json({ success: true, ...options });
    } catch (error) {
        console.error('[patch] getOptions error:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
};
