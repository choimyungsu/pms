'use strict';

/**
 * 패치관리 목록 컬럼 레지스트리
 *
 * - 화면(thead/tbody)과 엑셀 다운로드가 동일한 정의를 공유합니다.
 * - 컬럼 순서(드래그 이동) / 표시 항목 선택은 `cols` 쿼리 파라미터(콤마 구분 key)로 전달됩니다.
 *
 *  type
 *   - 'editable' : 인라인 편집 input (item_name / manufacturer / item_version)
 *   - 'patch'    : 패치필요 체크박스
 *   - 'date'     : YYYY-MM-DD 표시
 *   - 'datetime' : YYYY-MM-DD HH:mm 표시
 *   - 'text'     : 일반 텍스트
 *
 *  required: true 인 컬럼은 숨길 수 없습니다.
 */

const COLUMNS = [
    /* ---- 품목 정보 (요청 순서: 제조사 → 품목 → 버전) --- */
    {
        key: 'manufacturer', label: '제조사', group: 'item', type: 'editable',
        sql: 'i.manufacturer', width: 170, defaultVisible: true, order: 10
    },
    {
        key: 'item_name', label: '품목', group: 'item', type: 'editable',
        sql: 'i.item_name', width: 180, defaultVisible: true, order: 20
    },
    {
        key: 'item_version', label: '버전', group: 'item', type: 'editable',
        sql: 'i.item_version', width: 200, defaultVisible: true, order: 30
    },

    /* ---- 품목 상세 정보 (신규) --- */
    {
        key: 'model_name', label: '모델명', group: 'item', type: 'editable',
        sql: 'i.model_name', width: 180, defaultVisible: true, order: 31
    },
    {
        key: 'eos_date', label: 'EoS', group: 'item', type: 'editable',
        sql: 'i.eos_date', width: 120, defaultVisible: true, order: 32
    },
    {
        key: 'eol_date', label: 'EoL', group: 'item', type: 'editable',
        sql: 'i.eol_date', width: 120, defaultVisible: true, order: 33
    },
    {
        key: 'serial_number', label: 'S/N', group: 'item', type: 'editable',
        sql: 'i.serial_number', width: 180, defaultVisible: true, order: 34
    },
    {
        key: 'fw_version', label: 'FW버전', group: 'item', type: 'editable',
        sql: 'i.fw_version', width: 140, defaultVisible: true, order: 35
    },
    {
        key: 'os_version', label: 'OS버전', group: 'item', type: 'editable',
        sql: 'i.os_version', width: 140, defaultVisible: true, order: 36
    },
    {
        key: 'inspection_location_item', label: '점검위치', group: 'item', type: 'editable',
        sql: 'i.inspection_location_item', width: 150, defaultVisible: false, order: 37
    },
    {
        key: 'quantity', label: '수량', group: 'item', type: 'text',
        sql: 'i.quantity', width: 80, defaultVisible: false, order: 38, align: 'center'
    },

    /* ---- 백계약 정보 (엑셀 총괄표) --- */
    {
        key: 'contractor_company', label: '백계약업체', group: 'contract', type: 'text',
        sql: 'i.contractor_company', width: 150, defaultVisible: false, order: 300
    },
    {
        key: 'contractor_contract', label: '백계약', group: 'contract', type: 'text',
        sql: 'i.contractor_contract', width: 100, defaultVisible: false, order: 301
    },
    {
        key: 'contractor_start_date', label: '백계약 계약일', group: 'contract', type: 'text',
        sql: 'i.contractor_start_date', width: 130, defaultVisible: false, order: 302
    },
    {
        key: 'contractor_end_date', label: '백계약 종료일', group: 'contract', type: 'text',
        sql: 'i.contractor_end_date', width: 130, defaultVisible: false, order: 303
    },
    {
        key: 'contractor_contact_person', label: '백계약 담당자', group: 'contract', type: 'text',
        sql: 'i.contractor_contact_person', width: 130, defaultVisible: false, order: 304
    },
    {
        key: 'contractor_contact', label: '백계약 연락처', group: 'contract', type: 'text',
        sql: 'i.contractor_contact', width: 200, defaultVisible: false, order: 305
    },

    /* ---- 유지보수 요약 신규 필드 (엑셀 총괄표) --- */
    {
        key: 'inspection_date', label: '검수일', group: 'summary', type: 'text',
        sql: 's.inspection_date', width: 120, defaultVisible: false, order: 306
    },
    {
        key: 'introduction_date', label: '도입일', group: 'summary', type: 'text',
        sql: 's.introduction_date', width: 120, defaultVisible: false, order: 307
    },
    {
        key: 'vendor_name', label: '업체명', group: 'summary', type: 'text',
        sql: 's.vendor_name', width: 140, defaultVisible: false, order: 308
    },
    {
        key: 'vendor_contact_person', label: '업체담당자', group: 'summary', type: 'text',
        sql: 's.vendor_contact_person', width: 120, defaultVisible: false, order: 309
    },
    {
        key: 'vendor_contact', label: '업체연락처', group: 'summary', type: 'text',
        sql: 's.vendor_contact', width: 200, defaultVisible: false, order: 310
    },
    {
        key: 'customer_department', label: '고객부서', group: 'summary', type: 'text',
        sql: 's.customer_department', width: 130, defaultVisible: false, order: 311
    },
    {
        key: 'customer_location', label: '고객사위치', group: 'summary', type: 'text',
        sql: 's.customer_location', width: 220, defaultVisible: false, order: 312
    },
    {
        key: 'quote_file', label: '견적서파일', group: 'summary', type: 'text',
        sql: 's.quote_file', width: 220, defaultVisible: false, order: 313
    },

    /* ---- 고객사 / 패치필요 --- */
    {
        key: 'customer_company', label: '고객사', group: 'summary', type: 'text',
        sql: 's.customer_company', width: 150, defaultVisible: true, order: 40
    },
    {
        key: 'patch_required', label: '패치필요', group: 'patch', type: 'patch',
        sql: 'COALESCE(i.patch_required, 0)', width: 110, defaultVisible: true, order: 50,
        required: true, align: 'center'
    },
    {
        key: 'skill_checked', label: 'Skill 보유', group: 'patch', type: 'skill',
        sql: 'COALESCE(i.skill_checked, 0)', width: 110, defaultVisible: true, order: 55,
        align: 'center'
    },

    /* ---- 선택 표시: 엔지니어 / 점검 정보 --- */
    {
        key: 'main_engineer', label: '정엔지니어', group: 'summary', type: 'text',
        sql: 's.main_engineer', width: 120, defaultVisible: false, order: 60
    },
    {
        key: 'sub_engineer', label: '부엔지니어', group: 'summary', type: 'text',
        sql: 's.sub_engineer', width: 120, defaultVisible: false, order: 70
    },
    {
        key: 'inspection_method', label: '점검방식', group: 'summary', type: 'text',
        sql: 's.inspection_method', width: 120, defaultVisible: false, order: 80
    },
    {
        key: 'inspection_location', label: '점검장소', group: 'summary', type: 'text',
        sql: 's.inspection_location', width: 140, defaultVisible: false, order: 90
    },
    {
        key: 'sales_manager', label: '영업담당', group: 'summary', type: 'text',
        sql: 's.sales_manager', width: 120, defaultVisible: false, order: 100
    },
    {
        key: 'division', label: '구분', group: 'summary', type: 'text',
        sql: 's.division', width: 110, defaultVisible: false, order: 110
    },
    {
        key: 'project_name', label: '사업명', group: 'summary', type: 'text',
        sql: 's.project_name', width: 200, defaultVisible: false, order: 120
    },
    {
        key: 'item_detail', label: '상세내용', group: 'item', type: 'text',
        sql: 'i.item_detail', width: 200, defaultVisible: false, order: 130
    },

    /* ---- 유지보수 기간 --- */
    {
        key: 'maintenance_start_date', label: '유지보수 시작일', group: 'summary', type: 'date',
        sql: 's.maintenance_start_date', width: 130, defaultVisible: false, order: 140
    },
    {
        key: 'maintenance_end_date', label: '유지보수 종료일', group: 'summary', type: 'date',
        sql: 's.maintenance_end_date', width: 130, defaultVisible: false, order: 150
    },

    /* ---- 고객 담당자 정보 --- */
    {
        key: 'customer_contact_person', label: '고객담당자', group: 'summary', type: 'text',
        sql: 's.customer_contact_person', width: 120, defaultVisible: false, order: 160
    },
    {
        key: 'customer_contact', label: '고객연락처', group: 'summary', type: 'text',
        sql: 's.customer_contact', width: 140, defaultVisible: false, order: 170
    },
    {
        key: 'customer_email', label: '고객이메일', group: 'summary', type: 'text',
        sql: 's.customer_email', width: 180, defaultVisible: false, order: 180
    },

    /* ---- 패치 판정 메타 --- */
    {
        key: 'patch_required_at', label: '판정일시', group: 'patch', type: 'datetime',
        sql: 'i.patch_required_at', width: 140, defaultVisible: false, order: 190
    },
    {
        key: 'patch_required_by', label: '판정자', group: 'patch', type: 'text',
        sql: 'i.patch_required_by', width: 110, defaultVisible: false, order: 200
    },
    {
        key: 'patch_condition', label: '판정조건', group: 'patch', type: 'text',
        sql: 'i.patch_condition', width: 240, defaultVisible: false, order: 210
    },

    /* ---- 비고 --- */
    {
        key: 'remarks', label: '비고', group: 'summary', type: 'text',
        sql: 's.remarks', width: 240, defaultVisible: false, order: 220
    }
].sort((a, b) => a.order - b.order);

const COLUMN_MAP = COLUMNS.reduce((acc, col) => {
    acc[col.key] = col;
    return acc;
}, {});

const ALL_KEYS = COLUMNS.map((col) => col.key);
const REQUIRED_KEYS = COLUMNS.filter((col) => col.required).map((col) => col.key);
const DEFAULT_KEYS = COLUMNS.filter((col) => col.defaultVisible).map((col) => col.key);

/**
 * `cols` 파라미터(콤마 구분)를 실제 표시 컬럼 key 배열로 정규화합니다.
 *  - 알 수 없는 key 는 무시
 *  - required 컬럼은 항상 포함 (요청 순서 뒤에 보정)
 *  - 파라미터가 비어 있으면 기본 컬럼 목록
 */
function resolveColumns(raw) {
    let input = raw;
    if (Array.isArray(input)) input = input.join(',');

    const parts = String(input === undefined || input === null ? '' : input)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    if (parts.length === 0) return DEFAULT_KEYS.slice();

    const seen = new Set();
    const list = [];
    parts.forEach((key) => {
        if (COLUMN_MAP[key] && !seen.has(key)) {
            seen.add(key);
            list.push(key);
        }
    });

    REQUIRED_KEYS.forEach((key) => {
        if (!seen.has(key)) {
            seen.add(key);
            list.push(key);
        }
    });

    return list.length ? list : DEFAULT_KEYS.slice();
}

/** 화면/엑셀에 넘길 컬럼 메타 */
function describe(key) {
    const col = COLUMN_MAP[key];
    if (!col) return null;
    return {
        key: col.key,
        label: col.label,
        type: col.type,
        group: col.group,
        width: col.width,
        align: col.align || 'left',
        editable: col.type === 'editable',
        required: Boolean(col.required)
    };
}

/** 목록/엑셀 SELECT 절 — 모든 컬럼을 key 라는 이름의 별칭으로 조회 */
function selectClause() {
    const exprs = ['i.id AS `id`', 'i.summary_id AS `summary_id`'];
    COLUMNS.forEach((col) => {
        exprs.push(`${col.sql} AS \`${col.key}\``);
    });
    return `SELECT ${exprs.join(', ')}`;
}

/** 컬럼 선택 UI 용 그룹 목록 */
const GROUPS = [
    { key: 'item', label: '품목 정보' },
    { key: 'contract', label: '백계약 정보' },
    { key: 'summary', label: '유지보수 정보' },
    { key: 'patch', label: '패치 판정' }
];

module.exports = {
    COLUMNS,
    COLUMN_MAP,
    GROUPS,
    ALL_KEYS,
    REQUIRED_KEYS,
    DEFAULT_KEYS,
    resolveColumns,
    describe,
    selectClause
};
