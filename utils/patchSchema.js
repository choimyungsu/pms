const pool = require('../config/db');

/**
 * tb_maintenance 테이블에 패치관리용 컬럼이 있는지 사전 체크하고,
 * 없으면 ALTER TABLE 로 추가합니다. (서버 기동 시 1회 호출)
 *
 * - 컬럼 존재 여부는 INFORMATION_SCHEMA.COLUMNS 로 확인
 * - 인덱스 존재 여부는 INFORMATION_SCHEMA.STATISTICS 로 확인
 * - 이미 있으면 아무 것도 하지 않음 (idempotent)
 */

const TABLE = 'tb_maintenance';

const REQUIRED_COLUMNS = [
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
        name: 'idx_maintenance_patch_required',
        ddl: 'ADD INDEX `idx_maintenance_patch_required` (`patch_required`)'
    }
];

async function getExistingColumns() {
    const [rows] = await pool.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?`,
        [TABLE]
    );
    return new Set(rows.map((r) => r.COLUMN_NAME));
}

async function getExistingIndexes() {
    const [rows] = await pool.query(
        `SELECT DISTINCT INDEX_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?`,
        [TABLE]
    );
    return new Set(rows.map((r) => r.INDEX_NAME));
}

async function tableExists() {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt
           FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?`,
        [TABLE]
    );
    return Number(rows[0] && rows[0].cnt) > 0;
}

async function ensurePatchColumns() {
    try {
        if (!(await tableExists())) {
            console.warn(`[patchSchema] ${TABLE} 테이블이 없어 컬럼 점검을 건너뜁니다.`);
            return { checked: false, addedColumns: [], addedIndexes: [] };
        }

        const existingColumns = await getExistingColumns();
        const addedColumns = [];

        for (const col of REQUIRED_COLUMNS) {
            if (!existingColumns.has(col.name)) {
                await pool.query(`ALTER TABLE \`${TABLE}\` ${col.ddl}`);
                addedColumns.push(col.name);
                console.log(`[patchSchema] 컬럼 추가: ${TABLE}.${col.name}`);
            }
        }

        const existingIndexes = await getExistingIndexes();
        const addedIndexes = [];

        for (const idx of REQUIRED_INDEXES) {
            if (!existingIndexes.has(idx.name)) {
                try {
                    await pool.query(`ALTER TABLE \`${TABLE}\` ${idx.ddl}`);
                    addedIndexes.push(idx.name);
                    console.log(`[patchSchema] 인덱스 추가: ${TABLE}.${idx.name}`);
                } catch (err) {
                    // 인덱스는 성능 옵션이므로 실패해도 서비스는 계속 동작
                    console.warn(`[patchSchema] 인덱스 추가 실패(${idx.name}):`, err.message);
                }
            }
        }

        if (addedColumns.length === 0 && addedIndexes.length === 0) {
            console.log('[patchSchema] 패치관리 컬럼/인덱스 점검 완료 (추가 필요 없음)');
        }

        return { checked: true, addedColumns, addedIndexes };
    } catch (err) {
        console.error('[patchSchema] 스키마 점검 중 오류:', err.message);
        return { checked: false, error: err.message, addedColumns: [], addedIndexes: [] };
    }
}

module.exports = { ensurePatchColumns, REQUIRED_COLUMNS, REQUIRED_INDEXES };

// 직접 실행 지원: node utils/patchSchema.js
if (require.main === module) {
    ensurePatchColumns()
        .then((result) => {
            console.log('[patchSchema] 결과:', JSON.stringify(result));
            process.exit(0);
        })
        .catch(() => process.exit(1));
}
