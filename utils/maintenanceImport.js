'use strict';

/**
 * 유지보수 총괄표 엑셀 파서 / 임포터
 *
 *  대상: "2026 유지보수" 처럼 아래 2단 헤더 구조를 가진 총괄표 시트
 *
 *    r0 : 제목
 *    r2 : 그룹 헤더   (구분 | 고객사 | 사업명 | ... | 백계약 정보 | ... | 제이원아이티 | ... | 고객 정보 | 위치정보 | 견적서 파일 | 비고)
 *    r3 : 세부 헤더   (     |        |        | 검수일 | 도입일 | 유지보수 시작일 | ... | 백계약업체(매입처) | ...)
 *    r4~: 데이터
 *
 *  병합셀은 xlsx 가 첫 셀에만 값을 주므로, 고객사/사업명 같은 그룹 레벨 값은
 *  "블록 내 첫 값" 을 사용합니다.
 *
 *  산출 구조
 *    groups = [ { customer_company, project_name, summary: {...}, items: [ {...} ] } ]
 *
 *  두 테이블 매핑
 *    - tb_maintenance_summary       : 고객사/사업 단위 (summary)
 *    - tb_maintenance_summary_items : 장비 1건 단위 (items)
 */

const pool = require('../config/db');

/* ------------------------------------------------------------------ */
/* 필드 정의                                                            */
/* ------------------------------------------------------------------ */

// DB 상 실제 DATE 타입인 요약 컬럼 — 'YYYY-MM-DD' 로 확정된 값만 저장
// (나머지 신규 컬럼은 VARCHAR 이므로 원문 유지)
const SUMMARY_DATE_COLUMNS = ['maintenance_start_date', 'maintenance_end_date'];

// 요약(그룹) 레벨 필드 — 블록 내 첫 비어있지 않은 값 사용
const SUMMARY_FIELDS = [
    'division', 'customer_company', 'project_name',
    'inspection_date', 'introduction_date',
    'maintenance_start_date', 'maintenance_end_date',
    'main_engineer', 'sub_engineer', 'sales_manager', 'inspection_method',
    'vendor_name', 'vendor_contact_person', 'vendor_contact',
    'customer_department', 'customer_contact_person', 'customer_contact',
    'customer_location', 'quote_file', 'remarks'
];

// 품목(행) 레벨 필드 — 행마다 개별 값
const ITEM_FIELDS = [
    'item_name', 'manufacturer', 'model_name', 'eos_date', 'eol_date',
    'serial_number', 'fw_version', 'os_version', 'quantity',
    'contractor_company', 'contractor_contract', 'contractor_start_date',
    'contractor_end_date', 'contractor_contact_person', 'contractor_contact',
    'inspection_location_item'
];

// 한글 라벨 (화면/미리보기/문서 공용)
const FIELD_LABELS = {
    division: '구분',
    customer_company: '고객사',
    project_name: '사업명',
    inspection_date: '검수일',
    introduction_date: '도입일',
    maintenance_start_date: '유지보수 시작일',
    maintenance_end_date: '유지보수 종료일',
    item_name: '품목',
    manufacturer: '제조사',
    model_name: '모델명',
    eos_date: 'EoS',
    eol_date: 'EoL',
    serial_number: 'S/N',
    fw_version: 'FW버전',
    os_version: 'OS버전',
    quantity: '수량',
    contractor_company: '백계약업체',
    contractor_contract: '백계약',
    contractor_start_date: '백계약 계약일',
    contractor_end_date: '백계약 종료일',
    contractor_contact_person: '백계약 담당자',
    contractor_contact: '백계약 연락처',
    main_engineer: '정엔지니어',
    sub_engineer: '부엔지니어',
    sales_manager: '영업담당',
    inspection_method: '점검방식',
    vendor_name: '업체명',
    vendor_contact_person: '업체담당자',
    vendor_contact: '업체연락처',
    customer_department: '고객부서',
    customer_contact_person: '고객담당자',
    customer_contact: '고객연락처',
    customer_location: '고객사위치',
    inspection_location_item: '점검위치',
    quote_file: '견적서파일',
    remarks: '비고'
};

/* ------------------------------------------------------------------ */
/* 헤더 인식                                                            */
/* ------------------------------------------------------------------ */

// 그룹 헤더 → 컨텍스트 (담당자/연락처 등 중복 라벨 구분용)
function resolveContext(groupText) {
    const g = normalizeHeader(groupText);
    if (!g) return '';
    if (g.indexOf('백계약') !== -1) return 'contractor';
    if (g.indexOf('제이원아이티') !== -1) return 'vendor';
    if (g.indexOf('통합유지보수') !== -1) return 'vendor';
    if (g.indexOf('고객정보') !== -1) return 'customer';
    if (g.indexOf('고객사정보') !== -1) return 'customer';
    if (g.indexOf('위치정보') !== -1) return 'location';
    if (g.indexOf('견적서') !== -1) return 'quote';
    return '';
}

// 병합셀 자리표시자 (그룹 헤더로 쓰면 안 되는 값)
const GROUP_PLACEHOLDERS = ['-', '–', '—', '없음']; 

function normalizeHeader(text) {
    return String(text === undefined || text === null ? '' : text)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, '')
        .replace(/[()（）\[\]]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * 헤더 텍스트(+컨텍스트)로 필드 판별
 *  - 위에서부터 먼저 매칭되는 규칙을 사용 (순서 중요)
 */
function matchField(subText, groupText) {
    const s = normalizeHeader(subText);
    const ctx = resolveContext(groupText);
    if (!s) return null;

    // --- 명시적 단일 라벨 ---
    if (s === '구분') return 'division';
    if (s === '고객사' || s === '고객사명' || s === '거래처') return 'customer_company';
    if (s === '사업명' || s === '사업' || s === '프로젝트' || s === '프로젝트명') return 'project_name';
    if (s === '검수일' || s === '검수일자') return 'inspection_date';
    if (s === '도입일' || s === '도입일자' || s === '설치일') return 'introduction_date';
    if (/유지보수.*시작|보수.*시작/.test(s)) return 'maintenance_start_date';
    if (/유지보수.*종료|보수.*종료/.test(s)) return 'maintenance_end_date';
    if (s === '품목' || s === '품목명' || s === '제품' || s === '장비' || s === '장비명') return 'item_name';
    if (s === '제조사' || s === '제조업체' || s === '벤더' || s === '제조사명') return 'manufacturer';
    if (s === '모델' || s === '모델명' || s === '모델번호' || s === '모델no') return 'model_name';
    if (/^eos/.test(s)) return 'eos_date';
    if (/^eol/.test(s)) return 'eol_date';
    if (/^(sn|s\/n|시리얼|시리얼넘버|시리얼번호|serial|serialnumber)/.test(s)) return 'serial_number';
    if (/firmware|fw/.test(s)) return 'fw_version';
    if (/^os/.test(s)) return 'os_version';
    if (s === '수량' || s === 'qty' || s === 'quantity') return 'quantity';
    if (s === '백계약업체' || s === '매입처' || s === '백계약업체매입처') return 'contractor_company';
    if (s === '백계약' || s === '백계약여부' || s === '백계약상태') return 'contractor_contract';
    if (s === '계약일' || s === '백계약계약일') return 'contractor_start_date';
    if (s === '종료일' || s === '백계약종료일') return 'contractor_end_date';
    if (s === '점검방식' || s === '점검방법') return 'inspection_method';
    if (s === '업체명' || s === '유지보수업체' || s === '유지보수업체명') return 'vendor_name';
    if (s === '부서명' || s === '고객부서' || s === '부서') return 'customer_department';
    if (s === '고객사위치' || s === '고객사주소') return 'customer_location';
    if (s === '점검위치' || s === '설치위치' || s === '설치장소') return 'inspection_location_item';
    if (/견적서/.test(s)) return 'quote_file';
    if (s === '비고' || s === '비고사항') return 'remarks';
    if (s === '정' || s === '정엔지니어') return 'main_engineer';
    if (s === '부' || s === '부엔지니어') return 'sub_engineer';
    if (s === '영업담당' || s === '영업' || s === '영업담당자') return 'sales_manager';

    // --- 컨텍스트가 필요한 중복 라벨 ---
    if (s.indexOf('담당자') !== -1 || s === '담당') {
        if (ctx === 'contractor') return 'contractor_contact_person';
        if (ctx === 'vendor') return 'vendor_contact_person';
        if (ctx === 'customer') return 'customer_contact_person';
    }
    if (s.indexOf('연락처') !== -1 || s.indexOf('이메일') !== -1 || s === '연락') {
        if (ctx === 'contractor') return 'contractor_contact';
        if (ctx === 'vendor') return 'vendor_contact';
        if (ctx === 'customer') return 'customer_contact';
    }

    return null;
}

/** 헤더 행 탐색: '고객사' + '품목' 이 함께 있는 행 */
function findHeaderRow(rows, maxScan) {
    const limit = Math.min(rows.length, maxScan || 15);
    for (let r = 0; r < limit; r++) {
        const row = rows[r] || [];
        const texts = row.map(normalizeHeader);
        const hasCustomer = texts.some((t) => t === '고객사' || t === '고객사명');
        const hasItem = texts.some((t) => t === '품목' || t === '품목명' || t === '장비');
        if (hasCustomer && hasItem) return r;
    }
    return -1;
}

/**
 * 헤더 2줄(그룹 + 세부)을 합쳐 컬럼→필드 매핑 생성
 * @returns { columns: [{index, group, header, field}], fields: [...] }
 */
function buildColumnMap(rows, headerRow) {
    const groupRow = rows[headerRow] || [];
    const subRow = rows[headerRow + 1] || [];
    const subIsHeader = subRow.some((c) => normalizeHeader(c) !== '');

    const width = Math.max(groupRow.length, subIsHeader ? subRow.length : 0);
    const columns = [];
    let currentGroup = '';

    for (let c = 0; c < width; c++) {
        const g = String(groupRow[c] === undefined || groupRow[c] === null ? '' : groupRow[c]).trim();
        // '-' 같은 자리표시자는 그룹 헤더가 아님 (병합셀 나머지 칸)
        if (g && GROUP_PLACEHOLDERS.indexOf(g) === -1) currentGroup = g;

        const sub = subIsHeader ? String(subRow[c] === undefined || subRow[c] === null ? '' : subRow[c]).trim() : '';
        const subIsPlaceholder = GROUP_PLACEHOLDERS.indexOf(sub) !== -1;
        const headerText = (sub && !subIsPlaceholder) ? sub : g;

        // 세부 헤더 → 그룹 헤더 순으로 필드 판별
        let field = null;
        if (sub && !subIsPlaceholder) {
            field = matchField(sub, currentGroup);
        }
        // 세부 헤더가 없거나 '-'(병합셀)이면 그룹 헤더로 판별
        if (!field && g && GROUP_PLACEHOLDERS.indexOf(g) === -1) {
            field = matchField(g, currentGroup);
        }

        columns.push({
            index: c,
            group: currentGroup,
            header: headerText,
            field: field || null
        });
    }

    const fields = [];
    columns.forEach((col) => {
        if (col.field && fields.indexOf(col.field) === -1) fields.push(col.field);
    });

    return { columns, fields, subIsHeader };
}

/* ------------------------------------------------------------------ */
/* 값 정규화                                                            */
/* ------------------------------------------------------------------ */

const EMPTY_TOKENS = ['', '-', '–', '—', '없음', 'n/a', 'na', 'null', '미정'];

function pad2(n) {
    return String(n).padStart(2, '0');
}

/** Date → 'YYYY-MM-DD' */
function formatDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function cleanValue(raw) {
    if (raw === undefined || raw === null) return null;

    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : formatDate(raw);
    }

    if (typeof raw === 'number') {
        return String(raw);
    }

    const s = String(raw).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (s === '') return null;
    if (EMPTY_TOKENS.indexOf(s.toLowerCase()) !== -1) return null;
    return s.slice(0, 500);
}

/** 2자리 연도(YY)를 4자리로 확장 — 00~69 → 20xx, 70~99 → 19xx */
function expandYear(y) {
    const n = Number(y);
    if (String(y).length === 4) return n;
    return n >= 70 ? 1900 + n : 2000 + n;
}

function isValidYmd(y, m, d) {
    const yy = Number(y), mm = Number(m), dd = Number(d);
    if (!(yy >= 1900 && yy <= 2999)) return false;
    if (!(mm >= 1 && mm <= 12)) return false;
    if (!(dd >= 1 && dd <= 31)) return false;
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    return dt.getUTCFullYear() === yy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd;
}

/**
 * 날짜 문자열을 'YYYY-MM-DD' 로 정규화한다.
 *  - 2026-10-01 / 2026.10.01 / 2026/10/01  → 2026-10-01
 *  - 9/30/27 / 9/30/2027 / 9-30-27         → 2027-09-30  (미국식 M/D/Y)
 *  - 그 외(예: '2026년 10월', '협의중')     → 원문 유지
 * @returns {string|null} 원문 또는 정규화 값
 */
function normalizeDateText(value) {
    if (value === null || value === undefined || value === '') return null;

    const raw = String(value).trim();

    // 1) ISO 계열: YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    let m = raw.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
    if (m && isValidYmd(m[1], m[2], m[3])) {
        return `${Number(m[1])}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
    }

    // 2) 한국식: YYYY년 MM월 DD일
    m = raw.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
    if (m && isValidYmd(m[1], m[2], m[3])) {
        return `${Number(m[1])}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
    }

    // 3) 미국식: M/D/YY (연도 2자리 또는 4자리)
    m = raw.match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{2}|\d{4})$/);
    if (m) {
        const y = expandYear(m[3]);
        const mon = Number(m[1]);
        const day = Number(m[2]);
        if (isValidYmd(y, mon, day)) return `${y}-${pad2(mon)}-${pad2(day)}`;
        // M/D 해석이 불가하면 D/M 으로 한 번 더 시도
        if (isValidYmd(y, day, mon)) return `${y}-${pad2(day)}-${pad2(mon)}`;
    }

    // 4) 엑셀 시리얼 숫자 (예: 45000) — 1900 체계
    if (/^\d{5}$/.test(raw)) {
        const serial = Number(raw);
        if (serial > 20000 && serial < 80000) {
            const ms = Math.round((serial - 25569) * 86400 * 1000);
            const dt = new Date(ms);
            if (!Number.isNaN(dt.getTime())) {
                return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
            }
        }
    }

    return raw;
}

/** 'YYYY-MM-DD' 형태로 확정된 값만 통과 (DB DATE 컬럼용) */
function toDateOnlyOrNull(value) {
    const n = normalizeDateText(value);
    if (!n) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(n)) ? n : null;
}

function toInt(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = parseInt(String(value).replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(n) ? n : fallback;
}

/* ------------------------------------------------------------------ */
/* 시트 → 그룹 변환                                                     */
/* ------------------------------------------------------------------ */

/**
 * 워크시트 rows(2차원 배열) 를 파싱해 그룹 목록으로 변환
 * @param {Array<Array>} rows  sheet_to_json({header:1}) 결과
 * @param {object} options { maxRows }
 */
function parseRows(rows, options) {
    const opts = options || {};
    const headerRow = findHeaderRow(rows);
    if (headerRow < 0) {
        return {
            ok: false,
            message: '헤더 행을 찾을 수 없습니다. (「고객사」「품목」 컬럼이 있는 시트인지 확인하세요)'
        };
    }

    const map = buildColumnMap(rows, headerRow);
    if (!map.fields.length) {
        return { ok: false, message: '컬럼을 인식하지 못했습니다. 헤더 형식을 확인하세요.' };
    }

    const dataStart = headerRow + (map.subIsHeader ? 2 : 1);
    const maxRows = opts.maxRows || 20000;

    const records = [];
    let skipped = 0;
    let truncated = false;

    for (let r = dataStart; r < rows.length; r++) {
        if (records.length >= maxRows) { truncated = true; break; }

        const row = rows[r] || [];
        const rec = { __line: r + 1, __raw: {} };

        let hasAny = false;
        map.columns.forEach((col) => {
            if (!col.field) return;
            const value = cleanValue(row[col.index]);
            rec.__raw[col.field] = value;
            if (value !== null && value !== '') hasAny = true;
        });

        // 완전히 빈 행 (또는 '-' 만 있는 행)은 버림
        if (!hasAny) { skipped++; continue; }

        // 품목명도 고객사도 없는 행은 잡음으로 간주
        if (!rec.__raw.item_name && !rec.__raw.customer_company) { skipped++; continue; }

        records.push(rec);
    }

    // 그룹 레벨 값 forward-fill (병합셀 대응)
    const groups = [];
    const groupIndex = new Map();
    let lastCustomer = null;
    let lastProject = null;

    records.forEach((rec) => {
        const raw = rec.__raw;

        if (raw.customer_company) {
            lastCustomer = raw.customer_company;
            lastProject = raw.project_name || null;   // 고객사가 바뀌면 사업명도 리셋
        } else if (raw.project_name) {
            lastProject = raw.project_name;
        }

        const customer = raw.customer_company || lastCustomer || '(고객사 미지정)';
        const project = raw.project_name || lastProject || null;
        const key = `${customer}||${project || ''}`;

        let group = groupIndex.get(key);
        if (!group) {
            group = {
                key,
                customer_company: customer,
                project_name: project,
                summary: {},
                items: []
            };
            SUMMARY_FIELDS.forEach((f) => { group.summary[f] = null; });
            group.summary.customer_company = customer;
            group.summary.project_name = project;
            groupIndex.set(key, group);
            groups.push(group);
        }

        // 요약 필드는 블록 내 첫 비어있지 않은 값
        SUMMARY_FIELDS.forEach((f) => {
            if (group.summary[f] !== null && group.summary[f] !== '') return;
            const v = raw[f];
            if (v !== null && v !== undefined && v !== '') group.summary[f] = v;
        });

        // 품목 필드
        const item = {};
        ITEM_FIELDS.forEach((f) => { item[f] = raw[f] === undefined ? null : raw[f]; });

        item.item_name = item.item_name || null;
        item.quantity = toInt(item.quantity, 1);
        item.eos_date = normalizeDateText(item.eos_date);
        item.eol_date = normalizeDateText(item.eol_date);
        item.contractor_start_date = normalizeDateText(item.contractor_start_date);
        item.contractor_end_date = normalizeDateText(item.contractor_end_date);
        item.__line = rec.__line;

        if (!item.item_name) { skipped++; return; }

        group.items.push(item);
    });

    // 날짜 정규화 (요약)
    groups.forEach((g) => {
        g.summary.maintenance_start_date = normalizeDateText(g.summary.maintenance_start_date);
        g.summary.maintenance_end_date = normalizeDateText(g.summary.maintenance_end_date);
        g.summary.inspection_date = normalizeDateText(g.summary.inspection_date);
        g.summary.introduction_date = normalizeDateText(g.summary.introduction_date);
    });

    const itemCount = groups.reduce((a, g) => a + g.items.length, 0);

    return {
        ok: true,
        headerRow: headerRow + 1,          // 1-based 로 안내
        dataStartRow: dataStart + 1,
        subHeaderUsed: map.subIsHeader,
        columns: map.columns.filter((c) => c.field).map((c) => ({
            index: c.index,
            header: c.header,
            field: c.field,
            label: FIELD_LABELS[c.field] || c.field
        })),
        unmappedColumns: map.columns.filter((c) => !c.field && c.header).map((c) => c.header),
        fields: map.fields,
        groups,
        stats: {
            groups: groups.length,
            items: itemCount,
            skipped,
            truncated
        }
    };
}

/* ------------------------------------------------------------------ */
/* 시트 선택                                                            */
/* ------------------------------------------------------------------ */

/** 워크북에서 총괄표 형태 시트 후보 찾기 (데이터가 가장 많은 시트 우선) */
function detectSheet(workbook) {
    const candidates = [];
    workbook.SheetNames.forEach((name) => {
        const ws = workbook.Sheets[name];
        if (!ws || !ws['!ref']) return;
        let rows;
        try {
            rows = require('xlsx').utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
        } catch (e) { return; }
        const headerRow = findHeaderRow(rows);
        if (headerRow < 0) return;
        const map = buildColumnMap(rows, headerRow);
        const dataRows = Math.max(0, rows.length - headerRow - 2);
        candidates.push({ name, headerRow, dataRows, fields: map.fields.length });
    });

    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.dataRows - a.dataRows) || (b.fields - a.fields));
    return { best: candidates[0], candidates };
}

/* ------------------------------------------------------------------ */
/* 적용 (DB 반영)                                                       */
/* ------------------------------------------------------------------ */

/** 기존 품목을 S/N → 품목명+모델명 순으로 매칭 */
function matchExistingItem(items, incoming) {
    const ser = (v) => String(v === null || v === undefined ? '' : v).trim();
    const inSerial = ser(incoming.serial_number);

    // 1순위: S/N 완전 일치
    if (inSerial) {
        const bySerial = items.find((it) => ser(it.serial_number) === inSerial);
        if (bySerial) return bySerial;

        // ★ 중요: S/N 이 있는데 목록에 없으면 **다른 장비**입니다.
        //   여기서 품목명으로 폴백하면 S/N 만 다른 동일 모델 여러 대가
        //   한 건으로 합쳐져 데이터가 소실됩니다. → 신규로 취급.
        return null;
    }

    // S/N 이 없는 경우에만 품목명 기반 매칭 (S/N 이 비어있는 기존 행 대상)
    if (incoming.item_name) {
        const cands = items.filter((it) => !ser(it.serial_number)
            && String(it.item_name || '') === String(incoming.item_name));
        if (cands.length === 1) return cands[0];
        if (cands.length > 1 && incoming.model_name) {
            const narrowed = cands.filter((it) => String(it.model_name || '') === String(incoming.model_name));
            if (narrowed.length === 1) return narrowed[0];
        }
    }
    return null;
}

/**
 * 그룹 목록을 DB 에 반영
 * @param {Array} groups
 * @param {object} options { strategy: 'merge' | 'replace', creatorId }
 */
async function applyGroups(groups, options) {
    const opts = options || {};
    const strategy = opts.strategy === 'replace' ? 'replace' : 'merge';

    const result = {
        strategy,
        createdSummaries: 0,
        updatedSummaries: 0,
        createdItems: 0,
        updatedItems: 0,
        deletedItems: 0,
        skippedGroups: 0,
        errors: [],
        warnings: []
    };

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        for (const group of groups) {
            if (!group.items.length) { result.skippedGroups++; continue; }

            const customer = group.summary.customer_company;
            const project = group.summary.project_name;

            // 1) 기존 요약 찾기 (고객사 + 사업명)
            const [existing] = await conn.query(
                `SELECT id FROM tb_maintenance_summary
                  WHERE customer_company = ? AND (project_name <=> ?)
                  ORDER BY id LIMIT 1`,
                [customer, project]
            );

            let summaryId;
            let isNew = false;
            if (existing.length) {
                summaryId = existing[0].id;
            } else {
                const [ins] = await conn.query(
                    'INSERT INTO tb_maintenance_summary (customer_company, project_name, creator_id) VALUES (?, ?, ?)',
                    [customer, project, opts.creatorId || null]
                );
                summaryId = ins.insertId;
                isNew = true;
            }

            // 2) 요약 필드 업데이트 (값이 있는 항목만)
            const summarySet = {};
            SUMMARY_FIELDS.forEach((f) => {
                let v = group.summary[f];
                if (v === null || v === undefined || v === '') return;
                if (f === 'customer_company' || f === 'project_name') return; // 키는 고정

                // DB DATE 컬럼은 'YYYY-MM-DD' 확정값만 허용 (아니면 건너뛰고 경고)
                if (SUMMARY_DATE_COLUMNS.indexOf(f) !== -1) {
                    const normalized = toDateOnlyOrNull(v);
                    if (!normalized) {
                        result.warnings.push({
                            scope: 'summary',
                            field: f,
                            label: FIELD_LABELS[f] || f,
                            value: String(v),
                            customer,
                            project,
                            message: `${FIELD_LABELS[f] || f} 값 '${v}' 은(는) 날짜 형식이 아니어서 저장하지 않았습니다.`
                        });
                        return;
                    }
                    v = normalized;
                }
                summarySet[f] = v;
            });

            if (Object.keys(summarySet).length) {
                await conn.query('UPDATE tb_maintenance_summary SET ? WHERE id = ?', [summarySet, summaryId]);
            }

            if (isNew) result.createdSummaries++;
            else result.updatedSummaries++;

            // 3) 품목 반영
            if (strategy === 'replace') {
                const [del] = await conn.query('DELETE FROM tb_maintenance_summary_items WHERE summary_id = ?', [summaryId]);
                result.deletedItems += del.affectedRows || 0;
            }

            const [currentItems] = await conn.query(
                'SELECT * FROM tb_maintenance_summary_items WHERE summary_id = ?',
                [summaryId]
            );
            let working = currentItems.slice();

            for (const item of group.items) {
                const match = strategy === 'replace' ? null : matchExistingItem(working, item);

                const values = {
                    item_name: item.item_name,
                    manufacturer: item.manufacturer,
                    model_name: item.model_name,
                    eos_date: item.eos_date,
                    eol_date: item.eol_date,
                    serial_number: item.serial_number,
                    fw_version: item.fw_version,
                    os_version: item.os_version,
                    quantity: item.quantity,
                    contractor_company: item.contractor_company,
                    contractor_contract: item.contractor_contract,
                    contractor_start_date: item.contractor_start_date,
                    contractor_end_date: item.contractor_end_date,
                    contractor_contact_person: item.contractor_contact_person,
                    contractor_contact: item.contractor_contact,
                    inspection_location_item: item.inspection_location_item
                };

                if (match) {
                    const patch = {};
                    Object.keys(values).forEach((k) => {
                        const v = values[k];
                        if (v === null || v === undefined || v === '') return;  // 빈 값은 기존 유지
                        const before = match[k];
                        const after = k === 'quantity' ? Number(v) : String(v);
                        const prev = k === 'quantity' ? Number(before || 0) : String(before === null || before === undefined ? '' : before);
                        if (String(prev) !== String(after)) patch[k] = v;
                    });
                    if (Object.keys(patch).length) {
                        await conn.query('UPDATE tb_maintenance_summary_items SET ? WHERE id = ?', [patch, match.id]);
                        Object.assign(match, patch);
                        result.updatedItems++;
                    }
                } else {
                    const row = Object.assign({ summary_id: summaryId }, values);
                    const [ins] = await conn.query('INSERT INTO tb_maintenance_summary_items SET ?', row);
                    working.push(Object.assign({ id: ins.insertId }, row));
                    result.createdItems++;
                }
            }
        }

        await conn.commit();
        return result;
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* ignore */ }
        result.errors.push(err.message);
        throw err;
    } finally {
        conn.release();
    }
}

/* ------------------------------------------------------------------ */
/* SQL 스크립트 생성                                                    */
/* ------------------------------------------------------------------ */

function sqlString(value) {
    if (value === null || value === undefined) return 'NULL';
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/**
 * 동일 내용을 재실행해도 안전한(idempotent) SQL 스크립트 생성
 *  - 요약: 고객사 + 사업명 기준 → 없으면 INSERT, 있으면 UPDATE
 *  - 품목: replace 전략 → 해당 요약의 품목 삭제 후 재삽입
 */
function buildSqlScript(groups, options) {
    const opts = options || {};
    const strategy = opts.strategy === 'replace' ? 'replace' : 'merge';
    const lines = [];

    lines.push('-- =====================================================================');
    lines.push('-- 유지보수 총괄표 일괄 반영 SQL');
    lines.push(`-- 생성일시: ${formatDate(new Date())}`);
    lines.push(`-- 그룹(고객사/사업): ${groups.length}건 / 품목: ${groups.reduce((a, g) => a + g.items.length, 0)}건`);
    lines.push(`-- 반영 전략: ${strategy === 'replace' ? '품목 전체 교체' : '기존 품목 유지 + 신규 추가'}`);
    lines.push('-- 실행 전 백업을 권장합니다: mysqldump business_cards > backup.sql');
    lines.push('-- =====================================================================');
    lines.push('START TRANSACTION;');
    lines.push('');

    const summaryCols = SUMMARY_FIELDS.filter((f) => f !== 'customer_company' && f !== 'project_name');

    groups.forEach((group, gi) => {
        if (!group.items.length) return;

        const customer = group.summary.customer_company;
        const project = group.summary.project_name;

        lines.push(`-- ---------------------------------------------------------------------`);
        lines.push(`-- [${gi + 1}] ${customer}${project ? ' / ' + project : ''} (품목 ${group.items.length}건)`);
        lines.push(`-- ---------------------------------------------------------------------`);

        // 1) 요약 INSERT (없을 때만)
        const insertCols = ['customer_company', 'project_name'].concat(
            summaryCols.filter((f) => group.summary[f] !== null && group.summary[f] !== '')
        );
        const insertVals = insertCols.map((f) => sqlString(f === 'customer_company' ? customer : f === 'project_name' ? project : group.summary[f]));

        lines.push(`INSERT INTO tb_maintenance_summary (${insertCols.map((c) => '`' + c + '`').join(', ')})`);
        lines.push(`SELECT ${insertVals.map((v) => (v === 'NULL' ? 'NULL' : v)).join(', ')} FROM DUAL`);
        lines.push(` WHERE NOT EXISTS (SELECT 1 FROM tb_maintenance_summary WHERE customer_company = ${sqlString(customer)} AND project_name <=> ${sqlString(project)});`);

        // 2) 요약 UPDATE
        const setParts = summaryCols
            .filter((f) => group.summary[f] !== null && group.summary[f] !== '')
            .map((f) => `  \`${f}\` = ${sqlString(group.summary[f])}`);
        if (setParts.length) {
            lines.push('');
            lines.push('UPDATE tb_maintenance_summary SET');
            lines.push(setParts.join(',\n'));
            lines.push(` WHERE customer_company = ${sqlString(customer)} AND project_name <=> ${sqlString(project)};`);
        }

        // 3) summary_id 확보
        lines.push('');
        lines.push(`SET @sid = (SELECT id FROM tb_maintenance_summary WHERE customer_company = ${sqlString(customer)} AND project_name <=> ${sqlString(project)} ORDER BY id LIMIT 1);`);

        // 4) 품목 교체
        if (strategy === 'replace') {
            lines.push('DELETE FROM tb_maintenance_summary_items WHERE summary_id = @sid;');
        }

        const itemCols = ['summary_id'].concat(ITEM_FIELDS);
        const valueRows = group.items.map((item) => {
            const vals = itemCols.map((f) => {
                if (f === 'summary_id') return '@sid';
                const v = item[f];
                if (f === 'quantity') return String(toInt(v, 1));
                return sqlString(v);
            });
            return `  (${vals.join(', ')})`;
        });

        lines.push(`INSERT INTO tb_maintenance_summary_items (${itemCols.map((c) => '`' + c + '`').join(', ')}) VALUES`);
        lines.push(valueRows.join(',\n') + ';');
        lines.push('');
    });

    lines.push('COMMIT;');
    lines.push('');
    lines.push('-- =====================================================================');
    lines.push('-- 확인 쿼리');
    lines.push('-- SELECT s.customer_company, s.project_name, COUNT(i.id) AS items');
    lines.push('--   FROM tb_maintenance_summary s');
    lines.push('--   LEFT JOIN tb_maintenance_summary_items i ON i.summary_id = s.id');
    lines.push('--  GROUP BY s.id ORDER BY s.customer_company;');
    lines.push('-- =====================================================================');

    return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 미리보기 요약                                                        */
/* ------------------------------------------------------------------ */

function summarize(groups, existingIndex) {
    const idx = existingIndex || new Map();
    let newGroups = 0;
    let existGroups = 0;
    let totalItems = 0;

    const rows = groups.map((g, i) => {
        const existing = idx.get(g.key) || null;
        if (existing) existGroups++;
        else newGroups++;
        totalItems += g.items.length;

        return {
            index: i + 1,
            customerCompany: g.summary.customer_company,
            projectName: g.summary.project_name,
            itemCount: g.items.length,
            status: existing ? 'existing' : 'new',
            existingSummaryId: existing ? existing.id : null,
            existingItemCount: existing ? Number(existing.item_count) : 0,
            items: g.items.map((it) => ({
                itemName: it.item_name,
                manufacturer: it.manufacturer,
                modelName: it.model_name,
                serialNumber: it.serial_number,
                fwVersion: it.fw_version,
                osVersion: it.os_version,
                eosDate: it.eos_date,
                eolDate: it.eol_date,
                quantity: it.quantity,
                line: it.__line
            }))
        };
    });

    return {
        counts: {
            groups: groups.length,
            items: totalItems,
            newGroups,
            existingGroups: existGroups
        },
        rows
    };
}

/** 기존 요약(고객사+사업명) 색인 조회 */
async function loadExistingIndex() {
    const [rows] = await pool.query(
        `SELECT s.id, s.customer_company, s.project_name,
                (SELECT COUNT(*) FROM tb_maintenance_summary_items i WHERE i.summary_id = s.id) AS item_count
           FROM tb_maintenance_summary s`
    );
    const map = new Map();
    rows.forEach((r) => {
        map.set(`${r.customer_company}||${r.project_name || ''}`, r);
    });
    return map;
}

module.exports = {
    SUMMARY_FIELDS,
    ITEM_FIELDS,
    FIELD_LABELS,
    findHeaderRow,
    buildColumnMap,
    parseRows,
    detectSheet,
    applyGroups,
    buildSqlScript,
    summarize,
    loadExistingIndex,
    normalizeDateText,
    cleanValue
};
