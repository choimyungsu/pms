const pool = require('../config/db');

/**
 * 패치관리 기준 스키마 사전 점검 / 자동 마이그레이션
 *
 *  기준 테이블
 *   - tb_maintenance_summary        : 고객사(customer_company) 등 요약 정보
 *   - tb_maintenance_summary_items  : 품목(item_name) / 상세(item_detail)
 *
 *  필요한 추가 컬럼
 *   - tb_maintenance_summary_items.item_version             : 품목 버전 (신규 입력 항목)
 *   - tb_maintenance_summary_items.manufacturer             : 제조사
 *   - tb_maintenance_summary_items.model_name               : 모델명
 *   - tb_maintenance_summary_items.eos_date                 : EoS (지원종료일)
 *   - tb_maintenance_summary_items.eol_date                 : EoL (수명종료일)
 *   - tb_maintenance_summary_items.serial_number            : S/N (시리얼넘버)
 *   - tb_maintenance_summary_items.fw_version               : FW 버전
 *   - tb_maintenance_summary_items.os_version               : OS 버전
 *   - tb_maintenance_summary_items.inspection_location_item : 점검위치(품목별)
 *   - tb_maintenance_summary_items.patch_required           : 패치필요 여부
 *   - tb_maintenance_summary_items.patch_required_at        : 판정 일시
 *   - tb_maintenance_summary_items.patch_required_by        : 판정자
 *   - tb_maintenance_summary_items.patch_condition          : 판정 조건 요약
 *
 *  ※ 패치 전용 테이블은 추후 별도 설계 예정.
 *    그 전까지는 위 컬럼을 사용하며, 컨트롤러의 조회/갱신부만 교체하면 이관 가능하도록 분리해 두었습니다.
 *
 *  INFORMATION_SCHEMA 로 존재 여부를 먼저 확인하고, 없을 때만 ALTER (idempotent).
 */

const ITEMS_TABLE = 'tb_maintenance_summary_items';

const REQUIRED_COLUMNS = [
    {
        name: 'item_version',
        ddl: "ADD COLUMN `item_version` VARCHAR(255) NULL DEFAULT NULL COMMENT '품목 버전'"
    },
    {
        name: 'manufacturer',
        ddl: "ADD COLUMN `manufacturer` VARCHAR(255) NULL DEFAULT NULL COMMENT '제조사'"
    },
    {
        name: 'model_name',
        ddl: "ADD COLUMN `model_name` VARCHAR(255) NULL DEFAULT NULL COMMENT '모델명'"
    },
    {
        name: 'eos_date',
        ddl: "ADD COLUMN `eos_date` VARCHAR(50) NULL DEFAULT NULL COMMENT 'EoS (지원종료일)'"
    },
    {
        name: 'eol_date',
        ddl: "ADD COLUMN `eol_date` VARCHAR(50) NULL DEFAULT NULL COMMENT 'EoL (수명종료일)'"
    },
    {
        name: 'serial_number',
        ddl: "ADD COLUMN `serial_number` VARCHAR(255) NULL DEFAULT NULL COMMENT 'S/N (시리얼넘버)'"
    },
    {
        name: 'fw_version',
        ddl: "ADD COLUMN `fw_version` VARCHAR(255) NULL DEFAULT NULL COMMENT 'FW 버전'"
    },
    {
        name: 'os_version',
        ddl: "ADD COLUMN `os_version` VARCHAR(255) NULL DEFAULT NULL COMMENT 'OS 버전'"
    },
    {
        name: 'inspection_location_item',
        ddl: "ADD COLUMN `inspection_location_item` VARCHAR(255) NULL DEFAULT NULL COMMENT '점검위치(품목별)'"
    },
    {
        name: 'patch_required',
        ddl: "ADD COLUMN `patch_required` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '패치필요 여부(0:불필요,1:필요)'"
    },
    {
        name: 'patch_required_at',
        ddl: "ADD COLUMN `patch_required_at` DATETIME NULL DEFAULT NULL COMMENT '패치필요 판정 일시'"
    },
    {
        name: 'patch_required_by',
        ddl: "ADD COLUMN `patch_required_by` VARCHAR(255) NULL DEFAULT NULL COMMENT '패치필요 판정자'"
    },
    {
        name: 'patch_condition',
        ddl: "ADD COLUMN `patch_condition` VARCHAR(500) NULL DEFAULT NULL COMMENT '패치필요 판정 조건 요약'"
    }
];

const REQUIRED_INDEXES = [
    {
        name: 'idx_summary_items_patch_required',
        ddl: 'ADD INDEX `idx_summary_items_patch_required` (`patch_required`)'
    },
    {
        name: 'idx_summary_items_name_version',
        ddl: 'ADD INDEX `idx_summary_items_name_version` (`item_name`, `item_version`)'
    }
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
    return new Set(rows.map((r) => r.INDEX_NAME.toLowerCase()));
}

async function ensurePatchColumns() {
    const result = { checked: false, addedColumns: [], addedIndexes: [] };

    try {
        if (!(await tableExists(ITEMS_TABLE))) {
            console.warn(`[patchSchema] ${ITEMS_TABLE} 테이블이 없어 패치관리 마이그레이션을 건너뜁니다.`);
            return { ...result, error: `${ITEMS_TABLE} not found` };
        }

        result.checked = true;

        const existingColumns = await getColumns(ITEMS_TABLE);
        for (const col of REQUIRED_COLUMNS) {
            if (!existingColumns.has(col.name.toLowerCase())) {
                await pool.query(`ALTER TABLE \`${ITEMS_TABLE}\` ${col.ddl}`);
                existingColumns.add(col.name.toLowerCase());
                result.addedColumns.push(col.name);
                console.log(`[patchSchema] 컬럼 추가: ${ITEMS_TABLE}.${col.name}`);
            }
        }

        const existingIndexes = await getIndexes(ITEMS_TABLE);
        for (const idx of REQUIRED_INDEXES) {
            if (!existingIndexes.has(idx.name.toLowerCase())) {
                try {
                    await pool.query(`ALTER TABLE \`${ITEMS_TABLE}\` ${idx.ddl}`);
                    result.addedIndexes.push(idx.name);
                    console.log(`[patchSchema] 인덱스 추가: ${ITEMS_TABLE}.${idx.name}`);
                } catch (err) {
                    // 인덱스는 성능 옵션이므로 실패해도 서비스는 계속 동작
                    console.warn(`[patchSchema] 인덱스 추가 실패(${idx.name}):`, err.message);
                }
            }
        }

        if (result.addedColumns.length === 0 && result.addedIndexes.length === 0) {
            console.log('[patchSchema] 패치관리 컬럼/인덱스 점검 완료 (추가 필요 없음)');
        }

        return result;
    } catch (err) {
        console.error('[patchSchema] 스키마 점검 중 오류:', err.message);
        return { checked: false, error: err.message, addedColumns: [], addedIndexes: [] };
    }
}

module.exports = { ensurePatchColumns, REQUIRED_COLUMNS, REQUIRED_INDEXES, ITEMS_TABLE };

// 직접 실행 지원: node utils/patchSchema.js
if (require.main === module) {
    ensurePatchColumns()
        .then((r) => {
            console.log('[patchSchema] 결과:', JSON.stringify(r));
            process.exit(0);
        })
        .catch(() => process.exit(1));
}
