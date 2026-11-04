const pool = require('../config/db');

/**
 * 유지보수(요약/품목) 스키마 사전 점검 / 자동 마이그레이션
 *
 *  엑셀 총괄표(2026 유지보수 시트)의 36개 컬럼을 DB 에 1:1 로 담기 위해
 *  두 테이블에 부족한 컬럼을 추가합니다.
 *
 *  tb_maintenance_summary (고객사/사업 단위 = 그룹 레벨)
 *    기존: division, customer_company, project_name, maintenance_start_date,
 *          maintenance_end_date, main_engineer, sub_engineer, sales_manager,
 *          inspection_method, customer_contact_person, customer_contact,
 *          customer_email, inspection_location, remarks
 *    추가: inspection_date        (검수일)
 *          introduction_date      (도입일)
 *          vendor_name            (유지보수 업체명)
 *          vendor_contact_person  (업체 담당자)
 *          vendor_contact         (업체 연락처/이메일)
 *          customer_department    (고객 부서명)
 *          customer_location      (고객사 위치)
 *          quote_file             (견적서 파일명)
 *
 *  tb_maintenance_summary_items (품목 단위 = 개별 장비)
 *    기존: item_name, item_detail, item_version, manufacturer, model_name,
 *          eos_date, eol_date, serial_number, fw_version, os_version,
 *          inspection_location_item, patch_*
 *    추가: quantity                 (수량)
 *          contractor_company       (백계약업체/매입처)
 *          contractor_contract      (백계약 상태)
 *          contractor_start_date    (백계약 계약일)
 *          contractor_end_date      (백계약 종료일)
 *          contractor_contact_person(백계약 담당자)
 *          contractor_contact       (백계약 연락처/이메일)
 *
 *  INFORMATION_SCHEMA 로 존재 여부를 먼저 확인하고, 없을 때만 ALTER (idempotent).
 */

const SUMMARY_TABLE = 'tb_maintenance_summary';
const ITEMS_TABLE = 'tb_maintenance_summary_items';

const SUMMARY_COLUMNS = [
    { name: 'inspection_date', ddl: "ADD COLUMN `inspection_date` VARCHAR(50) NULL DEFAULT NULL COMMENT '검수일'" },
    { name: 'introduction_date', ddl: "ADD COLUMN `introduction_date` VARCHAR(50) NULL DEFAULT NULL COMMENT '도입일'" },
    { name: 'vendor_name', ddl: "ADD COLUMN `vendor_name` VARCHAR(255) NULL DEFAULT NULL COMMENT '유지보수 업체명'" },
    { name: 'vendor_contact_person', ddl: "ADD COLUMN `vendor_contact_person` VARCHAR(255) NULL DEFAULT NULL COMMENT '업체 담당자'" },
    { name: 'vendor_contact', ddl: "ADD COLUMN `vendor_contact` VARCHAR(255) NULL DEFAULT NULL COMMENT '업체 연락처/이메일'" },
    { name: 'customer_department', ddl: "ADD COLUMN `customer_department` VARCHAR(255) NULL DEFAULT NULL COMMENT '고객 부서명'" },
    { name: 'customer_location', ddl: "ADD COLUMN `customer_location` VARCHAR(500) NULL DEFAULT NULL COMMENT '고객사 위치'" },
    { name: 'quote_file', ddl: "ADD COLUMN `quote_file` VARCHAR(500) NULL DEFAULT NULL COMMENT '견적서 파일명'" }
];

const ITEM_COLUMNS = [
    { name: 'quantity', ddl: "ADD COLUMN `quantity` INT NULL DEFAULT 1 COMMENT '수량'" },
    { name: 'contractor_company', ddl: "ADD COLUMN `contractor_company` VARCHAR(255) NULL DEFAULT NULL COMMENT '백계약업체(매입처)'" },
    { name: 'contractor_contract', ddl: "ADD COLUMN `contractor_contract` VARCHAR(100) NULL DEFAULT NULL COMMENT '백계약 상태'" },
    { name: 'contractor_start_date', ddl: "ADD COLUMN `contractor_start_date` VARCHAR(50) NULL DEFAULT NULL COMMENT '백계약 계약일'" },
    { name: 'contractor_end_date', ddl: "ADD COLUMN `contractor_end_date` VARCHAR(50) NULL DEFAULT NULL COMMENT '백계약 종료일'" },
    { name: 'contractor_contact_person', ddl: "ADD COLUMN `contractor_contact_person` VARCHAR(255) NULL DEFAULT NULL COMMENT '백계약 담당자'" },
    { name: 'contractor_contact', ddl: "ADD COLUMN `contractor_contact` VARCHAR(255) NULL DEFAULT NULL COMMENT '백계약 연락처/이메일'" }
];

const REQUIRED_INDEXES = [
    { table: SUMMARY_TABLE, name: 'idx_summary_customer_project', ddl: 'ADD INDEX `idx_summary_customer_project` (`customer_company`, `project_name`)' },
    { table: ITEMS_TABLE, name: 'idx_summary_items_serial', ddl: 'ADD INDEX `idx_summary_items_serial` (`serial_number`)' }
];

async function tableExists(table) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt
           FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
        [table]
    );
    return Number(rows[0] && rows[0].cnt) > 0;
}

async function getColumns(table) {
    const [rows] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
        [table]
    );
    return new Set(rows.map((r) => r.COLUMN_NAME.toLowerCase()));
}

async function getIndexes(table) {
    const [rows] = await pool.query(
        `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
        [table]
    );
    return new Set(rows.map((r) => String(r.INDEX_NAME).toLowerCase()));
}

async function addColumns(table, columns, result) {
    const existing = await getColumns(table);
    for (const col of columns) {
        if (existing.has(col.name.toLowerCase())) continue;
        await pool.query(`ALTER TABLE \`${table}\` ${col.ddl}`);
        existing.add(col.name.toLowerCase());
        result.addedColumns.push(`${table}.${col.name}`);
        console.log(`[maintenanceSchema] 컬럼 추가: ${table}.${col.name}`);
    }
}

async function ensureMaintenanceColumns() {
    const result = { checked: false, addedColumns: [], addedIndexes: [] };

    try {
        if (!(await tableExists(SUMMARY_TABLE)) || !(await tableExists(ITEMS_TABLE))) {
            console.warn('[maintenanceSchema] 유지보수 테이블이 없어 마이그레이션을 건너뜁니다.');
            return { ...result, error: 'table not found' };
        }

        result.checked = true;

        await addColumns(SUMMARY_TABLE, SUMMARY_COLUMNS, result);
        await addColumns(ITEMS_TABLE, ITEM_COLUMNS, result);

        for (const idx of REQUIRED_INDEXES) {
            const existing = await getIndexes(idx.table);
            if (existing.has(idx.name.toLowerCase())) continue;
            try {
                await pool.query(`ALTER TABLE \`${idx.table}\` ${idx.ddl}`);
                result.addedIndexes.push(idx.name);
                console.log(`[maintenanceSchema] 인덱스 추가: ${idx.name}`);
            } catch (err) {
                console.warn(`[maintenanceSchema] 인덱스 추가 실패(${idx.name}):`, err.message);
            }
        }

        if (result.addedColumns.length === 0 && result.addedIndexes.length === 0) {
            console.log('[maintenanceSchema] 유지보수 컬럼/인덱스 점검 완료 (추가 필요 없음)');
        }

        return result;
    } catch (err) {
        console.error('[maintenanceSchema] 스키마 점검 중 오류:', err.message);
        return { checked: false, error: err.message, addedColumns: [], addedIndexes: [] };
    }
}

module.exports = {
    ensureMaintenanceColumns,
    SUMMARY_COLUMNS,
    ITEM_COLUMNS,
    REQUIRED_INDEXES,
    SUMMARY_TABLE,
    ITEMS_TABLE
};

// 직접 실행 지원: node utils/maintenanceSchema.js
if (require.main === module) {
    ensureMaintenanceColumns()
        .then((r) => {
            console.log('[maintenanceSchema] 결과:', JSON.stringify(r));
            process.exit(0);
        })
        .catch(() => process.exit(1));
}
