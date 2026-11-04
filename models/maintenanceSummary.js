const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* tb_maintenance_summary 컬럼 정보 (1회 캐시)                          */
/* ------------------------------------------------------------------ */

const SUMMARY_COLUMN_CACHE = { meta: null };

async function getSummaryColumnMeta() {
    if (SUMMARY_COLUMN_CACHE.meta) return SUMMARY_COLUMN_CACHE.meta;
    const [rows] = await pool.query(
        `SELECT LOWER(COLUMN_NAME) AS name, LOWER(DATA_TYPE) AS type
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tb_maintenance_summary'`
    );
    const meta = new Map();
    rows.forEach((r) => meta.set(r.name, r.type));
    SUMMARY_COLUMN_CACHE.meta = meta;
    return meta;
}

// 날짜/숫자 컬럼에 빈 문자열을 넣으면 오류가 나므로 NULL 로 바꿔야 하는 타입
const EMPTY_TO_NULL_TYPES = new Set([
    'date', 'datetime', 'timestamp',
    'int', 'bigint', 'smallint', 'tinyint', 'mediumint',
    'decimal', 'float', 'double'
]);

// 폼으로 넘어와도 절대 갱신하면 안 되는 컬럼
const PROTECTED_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

function isNonScalar(value) {
    return value !== null && typeof value === 'object' && !(value instanceof Date);
}

/**
 * `SET ?` 로 넘길 데이터 정리
 *
 *  - 테이블에 실제로 존재하는 컬럼만 남깁니다. (DB 버전에 따라 cost 등이 없을 수 있음)
 *  - **배열 / 객체 값은 제외합니다.**
 *    폼의 `item_names[]`, `manufacturers[]`, `item_versions[]`, `item_details[]` 는
 *    qs 파서(extended: true)에서 각각 `item_names`, `manufacturers`, `item_versions`,
 *    `item_details` 라는 **배열**이 됩니다.
 *    이 값을 `SET ?` 에 그대로 넘기면 mysql2 가
 *      `manufacturers` = 'a', 'b', 'c'
 *    처럼 콤마로 전개하여 SQL 문법 오류(ER_PARSE_ERROR)가 발생합니다.
 *  - 날짜/숫자 컬럼의 빈 문자열은 NULL 로 변환합니다.
 */
async function sanitizeSummaryData(data) {
    const meta = await getSummaryColumnMeta();
    const clean = {};
    const skipped = [];

    Object.keys(data || {}).forEach((rawKey) => {
        const key = String(rawKey).toLowerCase();
        const type = meta.get(key);

        // 테이블에 없는 컬럼 (예: item_names, manufacturers, item_versions) → 제외
        if (!type) {
            skipped.push(rawKey);
            return;
        }

        // PK / 생성·수정 시각은 폼 값으로 덮어쓰지 않음
        if (PROTECTED_COLUMNS.has(key)) {
            skipped.push(rawKey);
            return;
        }

        let value = data[rawKey];

        // 배열 / 객체 → 제외 (SQL 전개 방지)
        if (isNonScalar(value)) {
            skipped.push(rawKey);
            return;
        }

        if (value === undefined) value = null;
        if (value === '' && EMPTY_TO_NULL_TYPES.has(type)) value = null;

        clean[key] = value;
    });

    if (skipped.length > 0) {
        console.warn('[maintenanceSummary] 저장 대상에서 제외된 필드:', skipped.join(', '));
    }

    return clean;
}

/**
 * 품목 INSERT 값 정규화
 *  - undefined → null
 *  - 문자열 trim, 빈 문자열 → null
 *  - quantity 는 정수로 변환 (실패 시 기본 1)
 */
function normalizeItemValue(column, value) {
    if (column === 'quantity') {
        const n = parseInt(String(value === null || value === undefined ? '' : value).replace(/[^0-9-]/g, ''), 10);
        return Number.isFinite(n) ? n : 1;
    }
    if (value === undefined || value === null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'string') return null;   // 배열/객체 방지
    const s = value.trim();
    return s === '' ? null : s.slice(0, 500);
}

const MaintenanceSummary = {
    pool: pool,
    getSummaryColumnMeta: getSummaryColumnMeta,
    sanitizeSummaryData: sanitizeSummaryData,

    async create(data) {
        const clean = await sanitizeSummaryData(data);
        if (Object.keys(clean).length === 0) {
            throw new Error('저장할 수 있는 항목이 없습니다.');
        }
        const [result] = await pool.query('INSERT INTO tb_maintenance_summary SET ?', clean);
        return result.insertId;
    },

    async addAttachment(summaryId, filePath, fileName) {
        const [result] = await pool.query('INSERT INTO tb_maintenance_summary_attachments SET ?', {
            summary_id: summaryId,
            file_path: filePath,
            file_name: fileName
        });
        return result.insertId;
    },

    async findAttachmentsBySummaryId(summaryId) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_summary_attachments WHERE summary_id = ?', [summaryId]);
        return rows;
    },

    async getAttachmentById(id) {
        const [rows] = await pool.query('SELECT id, file_path, file_name FROM tb_maintenance_summary_attachments WHERE id = ?', [id]);
        return rows[0];
    },

    async deleteAttachment(id) {
        const [result] = await pool.query('DELETE FROM tb_maintenance_summary_attachments WHERE id = ?', [id]);
        return result.affectedRows;
    },

    async findAll() {
        const [rows] = await pool.query(`
            SELECT 
                s.*, 
                (SELECT COUNT(*) FROM tb_maintenance_summary_attachments a WHERE a.summary_id = s.id) as attachment_count,
                d.text as dept_name
            FROM 
                tb_maintenance_summary s
            LEFT JOIN tb_user u ON s.main_engineer = u.name
            LEFT JOIN tb_dept d ON u.department_id = d.id
        `);
        return rows;
    },

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_summary WHERE id = ?', [id]);
        if (rows.length > 0) {
            const summary = rows[0];
            summary.attachments = await this.findAttachmentsBySummaryId(id);
            summary.items = await this.findItemsBySummaryId(id);
            return summary;
        }
        return null;
    },

    async findItemsBySummaryId(id) {
        const [rows] = await pool.query('SELECT * FROM tb_maintenance_summary_items WHERE summary_id = ?', [id]);
        return rows;
    },

    /**
     * 품목 여러 건을 한 번에 저장
     *
     * tb_maintenance_summary_items 의 실제 컬럼 목록을 조회해 **존재하는 컬럼만** INSERT 합니다.
     * (DB 버전에 따라 item_version / manufacturer / 신규 15개 컬럼이 없을 수 있음)
     *
     * item 객체가 가질 수 있는 키 (없는 키는 NULL 로 저장):
     *   item_name, item_detail, item_version, manufacturer,
     *   model_name, eos_date, eol_date, serial_number, fw_version, os_version,
     *   inspection_location_item, quantity,
     *   contractor_company, contractor_contract, contractor_start_date,
     *   contractor_end_date, contractor_contact_person, contractor_contact
     */
    async addItems(summaryId, items) {
        if (!items || items.length === 0) return;

        const metas = await this.getItemColumnMeta();
        if (!metas.length) return;

        // 값이 실제로 존재하는 컬럼만 INSERT 대상으로 삼는다.
        // (patch_required 처럼 NOT NULL + DEFAULT 0 인 컬럼에 NULL 을 밀어넣으면
        //  ER_BAD_NULL_ERROR 가 발생하므로, 값이 없으면 컬럼 자체를 생략한다)
        const provided = new Set();
        const rows = items.map((item) => {
            const out = {};
            for (const meta of metas) {
                const raw = item[meta.name];
                const val = normalizeItemValue(meta.name, raw);
                if (val !== null && val !== undefined) {
                    out[meta.name] = val;
                    provided.add(meta.name);
                }
            }
            return out;
        });

        // INSERT 목록: 값이 하나라도 있는 컬럼만 사용
        const columns = ['summary_id'].concat(metas.map((m) => m.name).filter((n) => provided.has(n)));
        if (columns.length <= 1) return;   // 품목명조차 없으면 저장 안 함

        const rowsValues = rows.map((row) => {
            const vals = [summaryId];
            columns.slice(1).forEach((col) => {
                vals.push(row[col] === undefined ? null : row[col]);
            });
            return vals;
        });

        const placeholders = rowsValues
            .map(() => '(' + columns.map(() => '?').join(', ') + ')')
            .join(', ');

        await pool.query(
            `INSERT INTO tb_maintenance_summary_items (${columns.map((c) => '`' + c + '`').join(', ')}) VALUES ${placeholders}`,
            rowsValues.flat()
        );
    },

    /**
     * 품목 테이블 컬럼 메타(이름/널허용/기본값) 조회 (1회 캐시)
     */
    async getItemColumnMeta() {
        if (this._itemColumnMeta) return this._itemColumnMeta;
        try {
            const [rows] = await pool.query(
                `SELECT LOWER(COLUMN_NAME) AS name,
                        IS_NULLABLE AS nullable,
                        COLUMN_DEFAULT AS dflt,
                        LOWER(DATA_TYPE) AS type
                   FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'tb_maintenance_summary_items'
                  ORDER BY ORDINAL_POSITION`
            );
            const excluded = new Set(['id', 'summary_id', 'created_at', 'updated_at']);
            this._itemColumnMeta = rows
                .map((r) => ({
                    name: r.name,
                    nullable: String(r.nullable).toUpperCase() === 'YES',
                    hasDefault: r.dflt !== null && r.dflt !== undefined,
                    default: r.dflt,
                    type: r.type
                }))
                .filter((m) => !excluded.has(m.name));
        } catch (err) {
            console.error('[maintenanceSummary] 품목 컬럼 메타 조회 실패:', err.message);
            this._itemColumnMeta = [];
        }
        return this._itemColumnMeta;
    },

    /**
     * INSERT 가능한 품목 컬럼 이름 목록 (하위 호환)
     */
    async getItemWritableColumns() {
        const metas = await this.getItemColumnMeta();
        return metas.map((m) => m.name);
    },

    // 특정 컬럼 존재 여부 (1회 캐시)
    async hasItemColumn(columnName) {
        this._itemColumnCache = this._itemColumnCache || {};
        if (typeof this._itemColumnCache[columnName] !== 'undefined') {
            return this._itemColumnCache[columnName];
        }
        try {
            const [rows] = await pool.query(
                `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'tb_maintenance_summary_items'
                    AND COLUMN_NAME = ?`,
                [columnName]
            );
            this._itemColumnCache[columnName] = Number(rows[0].cnt) > 0;
        } catch (err) {
            this._itemColumnCache[columnName] = false;
        }
        return this._itemColumnCache[columnName];
    },

    // tb_maintenance_summary_items.item_version 컬럼 존재 여부 (1회 캐시)
    async hasItemVersionColumn() {
        if (typeof this._hasItemVersion !== 'undefined') return this._hasItemVersion;
        this._hasItemVersion = await this.hasItemColumn('item_version');
        return this._hasItemVersion;
    },

    async deleteItemsBySummaryId(summaryId) {
        await pool.query('DELETE FROM tb_maintenance_summary_items WHERE summary_id = ?', [summaryId]);
    },

    async update(id, data) {
        const clean = await sanitizeSummaryData(data);
        if (Object.keys(clean).length === 0) {
            // 변경할 항목이 없으면 아무 것도 하지 않음 (SQL 문법 오류 방지)
            return 0;
        }
        const [result] = await pool.query('UPDATE tb_maintenance_summary SET ? WHERE id = ?', [clean, id]);
        return result.affectedRows;
    },

    async delete(id) {
        const attachments = await this.findAttachmentsBySummaryId(id);
        for (const attachment of attachments) {
            fs.unlink(path.join(__dirname, '..', attachment.file_path), (err) => {
                if (err) console.error(err);
            });
        }
        await pool.query('DELETE FROM tb_maintenance_summary_attachments WHERE summary_id = ?', [id]);
        const [result] = await pool.query('DELETE FROM tb_maintenance_summary WHERE id = ?', [id]);
        return result.affectedRows;
    }
};

// 폼 배열 필드명 (qs 파서에서 배열이 되는 키들)
//  - item_names[] / manufacturers[] / item_versions[] / item_details[]
//  - extended: true 파서는 대괄호를 제거해 item_names, manufacturers ... 가 됩니다.
const ITEM_FORM_KEYS = new Set([
    'item_names', 'manufacturers', 'item_versions', 'item_details',
    'item_names[]', 'manufacturers[]', 'item_versions[]', 'item_details[]'
]);

/**
 * 요청 본문에서 tb_maintenance_summary 로 저장하면 안 되는 키를 제거합니다.
 * (품목 정보는 tb_maintenance_summary_items 에 별도 저장)
 */
function stripItemFields(body) {
    const out = {};
    Object.keys(body || {}).forEach((key) => {
        if (ITEM_FORM_KEYS.has(key)) return;
        out[key] = body[key];
    });
    return out;
}

MaintenanceSummary.ITEM_FORM_KEYS = ITEM_FORM_KEYS;
MaintenanceSummary.stripItemFields = stripItemFields;

module.exports = MaintenanceSummary;
