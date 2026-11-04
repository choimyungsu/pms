'use strict';

/**
 * 패치관리 — 엑셀 붙여넣기(Copy & Paste) 대량 업데이트 지원
 *
 *  1) parsePasteText(text, options)
 *     엑셀에서 복사한 텍스트(탭 구분)를 파싱합니다.
 *     첫 줄이 헤더로 보이면 자동 인식하고, 아니면 기본 순서로 해석합니다.
 *
 *  2) matchRows(rows)
 *     파싱된 각 행을 tb_maintenance_summary_items 의 실제 품목과 매칭합니다.
 *      - S/N 이 있고 유일하게 매칭되면 그 행으로 확정
 *      - 아니면 품목명 (+고객사 / 제조사 / 모델명) 조합으로 후보를 좁힘
 *      - 후보 0건 → not_found, 2건 이상 → ambiguous
 *
 *  3) applyMatches(matches)
 *     매칭된 행만 트랜잭션으로 일괄 UPDATE 합니다.
 *     클라이언트가 보낸 id 는 신뢰하지 않고, 적용 시점에 서버가 다시 매칭합니다.
 */

const db = require('../config/db');

const MAX_PASTE_ROWS = 2000;
const MAX_TEXT_LENGTH = 1024 * 1024; // 1MB

/* ------------------------------------------------------------------ */
/* 필드 정의 (라벨 / 별칭으로 헤더 자동 인식)                          */
/* ------------------------------------------------------------------ */

const PASTE_FIELDS = [
    { key: 'customer_company', label: '고객사', aliases: ['고객사', '고객사명', '고객', '회사', '업체', '회사명'], column: null, matchOnly: true },
    { key: 'item_name', label: '품목', aliases: ['품목', '품목명', '제품', '제품명', '장비', '장비명', 'item'], column: 'item_name' },
    { key: 'manufacturer', label: '제조사', aliases: ['제조사', '제조업체', '제조사명', '벤더', 'vendor', 'maker'], column: 'manufacturer' },
    { key: 'model_name', label: '모델명', aliases: ['모델명', '모델', 'model', '모델번호', '모델no'], column: 'model_name' },
    { key: 'eos_date', label: 'EoS', aliases: ['eos', 'eos일자', 'eos날짜', 'eos일', '지원종료일', '지원종료'], column: 'eos_date', maxLength: 50 },
    { key: 'eol_date', label: 'EoL', aliases: ['eol', 'eol일자', 'eol날짜', 'eol일', '수명종료일', '수명종료'], column: 'eol_date', maxLength: 50 },
    { key: 'serial_number', label: 'S/N', aliases: ['s/n', 'sn', '시리얼', '시리얼넘버', '시리얼번호', '시리얼no', 'serial', 'serialnumber'], column: 'serial_number' },
    { key: 'fw_version', label: 'FW버전', aliases: ['fw버전', 'fw', 'fwversion', 'fw ver', '펌웨어', '펌웨어버전'], column: 'fw_version' },
    { key: 'os_version', label: 'OS버전', aliases: ['os버전', 'os', 'osversion', 'os ver'], column: 'os_version' },
    { key: 'inspection_location_item', label: '점검위치', aliases: ['점검위치', '위치', '설치위치', '설치장소', '장소'], column: 'inspection_location_item' },
    { key: 'item_detail', label: '상세내용', aliases: ['상세내용', '상세', '설명', '용도', '비고2'], column: 'item_detail' }
];

const FIELD_MAP = PASTE_FIELDS.reduce((acc, f) => {
    acc[f.key] = f;
    return acc;
}, {});

// 헤더 없이 붙여넣을 때의 기본 컬럼 순서 (사용자 요청 순서)
const PASTE_DEFAULT_ORDER = [
    'item_name',
    'manufacturer',
    'model_name',
    'eos_date',
    'eol_date',
    'serial_number',
    'fw_version',
    'os_version',
    'inspection_location_item'
];

// UPDATE 가능한 컬럼만
const UPDATABLE_KEYS = PASTE_FIELDS.filter((f) => f.column).map((f) => f.key);

/* ------------------------------------------------------------------ */
/* 파싱                                                                */
/* ------------------------------------------------------------------ */

function normalizeHeader(value) {
    return String(value === undefined || value === null ? '' : value)
        .toLowerCase()
        .replace(/[\s_\-()[\]{}./:*'"`]/g, '');
}

const HEADER_ALIAS_INDEX = (() => {
    const idx = new Map();
    PASTE_FIELDS.forEach((field) => {
        [field.key, field.label, ...(field.aliases || [])].forEach((alias) => {
            const k = normalizeHeader(alias);
            if (k && !idx.has(k)) idx.set(k, field.key);
        });
    });
    return idx;
})();

function detectDelimiter(lines) {
    const sample = lines.slice(0, 20);
    if (sample.some((l) => l.indexOf('\t') !== -1)) return '\t';
    if (sample.some((l) => l.indexOf(',') !== -1)) return ',';
    return '\t';
}

function splitCsvLine(line, delimiter) {
    if (delimiter !== ',') {
        return line.split(delimiter).map((c) => c.trim());
    }
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
            else if (ch === '"') quoted = false;
            else cur += ch;
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            cells.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    cells.push(cur.trim());
    return cells;
}

function cleanValue(value, maxLength) {
    const v = String(value === undefined || value === null ? '' : value).trim();
    if (!v) return '';
    return maxLength ? v.slice(0, maxLength) : v.slice(0, 255);
}

/**
 * @param {string} text 엑셀에서 복사한 텍스트
 * @param {{hasHeader?: boolean|null, columnOrder?: string[]}} options
 */
function parsePasteText(text, options) {
    const opts = options || {};
    const source = String(text === undefined || text === null ? '' : text).slice(0, MAX_TEXT_LENGTH);

    const raw = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const allLines = raw.split('\n');
    const lines = allLines.filter((line) => line.trim() !== '');

    if (lines.length === 0) {
        return {
            ok: false,
            message: '붙여넣은 내용이 없습니다.',
            headerDetected: false,
            delimiter: 'TAB',
            fields: [],
            columnLabels: [],
            rows: [],
            ignoredHeaders: [],
            truncated: false
        };
    }

    const truncated = lines.length > MAX_PASTE_ROWS + 1;
    const useLines = truncated ? lines.slice(0, MAX_PASTE_ROWS + 1) : lines;

    const delimiter = detectDelimiter(useLines);
    const matrix = useLines.map((line) => splitCsvLine(line, delimiter));
    const maxCols = matrix.reduce((m, cells) => Math.max(m, cells.length), 0);

    let fields = new Array(maxCols).fill(null);
    let headerDetected = false;
    let bodyStart = 0;
    const ignoredHeaders = [];

    const firstRow = matrix[0] || [];
    const headerHits = firstRow.filter((cell) => HEADER_ALIAS_INDEX.has(normalizeHeader(cell)));

    if (opts.hasHeader === true || (opts.hasHeader !== false && headerHits.length >= 1)) {
        if (headerHits.length >= 1) {
            headerDetected = true;
            bodyStart = 1;
            firstRow.forEach((cell, i) => {
                const key = HEADER_ALIAS_INDEX.get(normalizeHeader(cell));
                fields[i] = key || null;
                const label = String(cell).trim();
                if (!key && label !== '') ignoredHeaders.push(label);
            });
        }
    }

    if (!headerDetected) {
        const order = Array.isArray(opts.columnOrder) && opts.columnOrder.length
            ? opts.columnOrder.filter((k) => Boolean(FIELD_MAP[k]))
            : PASTE_DEFAULT_ORDER;
        fields = new Array(maxCols).fill(null);
        order.forEach((key, i) => {
            if (i < maxCols) fields[i] = key;
        });
        bodyStart = 0;
    }

    const rows = [];
    for (let li = bodyStart; li < matrix.length; li += 1) {
        const cells = matrix[li];
        const row = { __line: li + 1 };
        let hasValue = false;
        fields.forEach((key, ci) => {
            if (!key) return;
            const def = FIELD_MAP[key];
            const value = cleanValue(cells[ci], def ? def.maxLength : 255);
            row[key] = value;
            if (value !== '') hasValue = true;
        });
        if (hasValue) rows.push(row);
    }

    const recognizedKeys = fields.filter(Boolean);

    if (rows.length === 0) {
        return {
            ok: false,
            message: '헤더만 있고 데이터 행이 없습니다.',
            headerDetected,
            delimiter: delimiter === '\t' ? 'TAB' : 'COMMA',
            fields: recognizedKeys,
            columnLabels: recognizedKeys.map((k) => FIELD_MAP[k].label),
            rows: [],
            ignoredHeaders,
            truncated
        };
    }

    return {
        ok: true,
        headerDetected,
        delimiter: delimiter === '\t' ? 'TAB' : 'COMMA',
        fields: recognizedKeys,
        columnLabels: recognizedKeys.map((k) => FIELD_MAP[k].label),
        rows,
        ignoredHeaders,
        truncated
    };
}

/* ------------------------------------------------------------------ */
/* 매칭                                                                */
/* ------------------------------------------------------------------ */

function sqlPlaceholders(arr) {
    return arr.map(() => '?').join(', ');
}

function lower(v) {
    return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
}

async function loadCandidateItems(rows) {
    const names = Array.from(new Set(rows.map((r) => r.item_name).filter(Boolean))).slice(0, 2000);
    const serials = Array.from(new Set(rows.map((r) => r.serial_number).filter(Boolean))).slice(0, 2000);

    if (names.length === 0 && serials.length === 0) return [];

    const where = [];
    const params = [];
    if (names.length > 0) {
        where.push(`i.item_name IN (${sqlPlaceholders(names)})`);
        params.push(...names);
    }
    if (serials.length > 0) {
        where.push(`i.serial_number IN (${sqlPlaceholders(serials)})`);
        params.push(...serials);
    }

    const [items] = await db.query(
        `SELECT i.id, i.summary_id, i.item_name, i.manufacturer, i.model_name,
                i.serial_number, i.item_version, i.eos_date, i.eol_date,
                i.fw_version, i.os_version, i.inspection_location_item, i.item_detail,
                s.customer_company
           FROM tb_maintenance_summary_items i
           JOIN tb_maintenance_summary s ON s.id = i.summary_id
          WHERE ${where.join(' OR ')}`,
        params
    );
    return items;
}

/**
 * 행 배열을 DB 품목과 매칭합니다.
 * @returns {Promise<Array<{row, status, strategy, item, candidates}>>}
 *   status: 'matched' | 'not_found' | 'ambiguous'
 */
async function matchRows(rows) {
    const items = await loadCandidateItems(rows);

    const bySerial = new Map();
    const byName = new Map();

    items.forEach((it) => {
        const sn = lower(it.serial_number);
        if (sn) {
            if (!bySerial.has(sn)) bySerial.set(sn, []);
            bySerial.get(sn).push(it);
        }
        const nm = lower(it.item_name);
        if (!byName.has(nm)) byName.set(nm, []);
        byName.get(nm).push(it);
    });

    const narrow = (list, row) => {
        let list2 = list;
        const filters = [
            ['customer_company', (it) => it.customer_company],
            ['manufacturer', (it) => it.manufacturer],
            ['model_name', (it) => it.model_name]
        ];
        filters.forEach(([key, getter]) => {
            const want = lower(row[key]);
            if (!want) return;
            const filtered = list2.filter((it) => lower(getter(it)) === want);
            if (filtered.length > 0) list2 = filtered;
        });
        return list2;
    };

    return rows.map((row) => {
        const sn = lower(row.serial_number);
        if (sn && bySerial.has(sn)) {
            const list = bySerial.get(sn);
            if (list.length === 1) {
                return { row, status: 'matched', strategy: 'S/N', item: list[0], candidates: list };
            }
            const narrowed = narrow(list, row);
            if (narrowed.length === 1) {
                return { row, status: 'matched', strategy: 'S/N+상세', item: narrowed[0], candidates: narrowed };
            }
            return { row, status: 'ambiguous', strategy: 'S/N 중복', item: null, candidates: narrowed };
        }

        if (!row.item_name) {
            return { row, status: 'not_found', strategy: '품목명 없음', item: null, candidates: [] };
        }

        const base = byName.get(lower(row.item_name)) || [];
        if (base.length === 0) {
            return { row, status: 'not_found', strategy: '품목명', item: null, candidates: [] };
        }
        if (base.length === 1) {
            return { row, status: 'matched', strategy: '품목명', item: base[0], candidates: base };
        }
        const narrowed = narrow(base, row);
        if (narrowed.length === 1) {
            return { row, status: 'matched', strategy: '품목명+상세', item: narrowed[0], candidates: narrowed };
        }
        return { row, status: 'ambiguous', strategy: '품목명 중복', item: null, candidates: narrowed };
    });
}

/** 매칭 결과에서 실제 변경되는 필드만 추려냅니다. */
function buildChanges(match) {
    if (match.status !== 'matched' || !match.item) return null;
    const row = match.row;
    const item = match.item;
    const changes = {};

    UPDATABLE_KEYS.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(row, key)) return;
        const def = FIELD_MAP[key];
        const next = cleanValue(row[key], def.maxLength);
        if (next === '') return; // 빈 셀은 기존 값 유지
        const prev = item[key] === undefined || item[key] === null ? '' : String(item[key]).trim();
        if (prev !== next) changes[key] = { before: prev, after: next };
    });

    return changes;
}

function summarize(matches) {
    const counts = { total: matches.length, matched: 0, changed: 0, unchanged: 0, notFound: 0, ambiguous: 0 };
    matches.forEach((m) => {
        if (m.status === 'matched') {
            counts.matched += 1;
            const changes = buildChanges(m);
            if (changes && Object.keys(changes).length > 0) counts.changed += 1;
            else counts.unchanged += 1;
        } else if (m.status === 'ambiguous') {
            counts.ambiguous += 1;
        } else {
            counts.notFound += 1;
        }
    });
    return counts;
}

/* ------------------------------------------------------------------ */
/* 적용 (일괄 UPDATE)                                                  */
/* ------------------------------------------------------------------ */

async function applyMatches(matches) {
    const targets = [];
    matches.forEach((m) => {
        if (m.status !== 'matched' || !m.item) return;
        const changes = buildChanges(m);
        if (!changes || Object.keys(changes).length === 0) return;
        targets.push({ id: m.item.id, changes });
    });

    if (targets.length === 0) {
        return { updated: 0, skipped: matches.length };
    }

    const conn = await db.getConnection();
    let updated = 0;
    try {
        await conn.beginTransaction();
        for (const t of targets) {
            const cols = Object.keys(t.changes);
            const setSql = cols.map((c) => `\`${FIELD_MAP[c].column}\` = ?`).join(', ');
            const params = cols.map((c) => t.changes[c].after);
            await conn.query(
                `UPDATE tb_maintenance_summary_items SET ${setSql} WHERE id = ?`,
                [...params, t.id]
            );
            updated += 1;
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return { updated, skipped: matches.length - updated };
}

module.exports = {
    PASTE_FIELDS,
    PASTE_DEFAULT_ORDER,
    UPDATABLE_KEYS,
    MAX_PASTE_ROWS,
    parsePasteText,
    matchRows,
    buildChanges,
    summarize,
    applyMatches
};
