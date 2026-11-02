-- =====================================================================
-- 패치관리 컬럼 추가 (기준: tb_maintenance_summary / tb_maintenance_summary_items)
--
--  - 고객사 : tb_maintenance_summary.customer_company   (기존 컬럼)
--  - 품목   : tb_maintenance_summary_items.item_name    (기존 컬럼)
--  - 제조사 : tb_maintenance_summary_items.manufacturer (신규 추가)
--  - 버전   : tb_maintenance_summary_items.item_version (신규 추가)
--
--  애플리케이션 기동 시 utils/patchSchema.js 의 ensurePatchColumns() 가
--  INFORMATION_SCHEMA 로 존재 여부를 확인한 뒤 없을 때만 자동 적용합니다.
--  아래 SQL 은 수동 실행용입니다.
-- =====================================================================

-- 1) 품목 제조사 (신규 입력 항목)
ALTER TABLE `tb_maintenance_summary_items`
    ADD COLUMN `manufacturer` VARCHAR(255) NULL DEFAULT NULL
    COMMENT '제조사';

-- 2) 품목 버전 (신규 입력 항목, 목록에서 복수행 수정 가능)
ALTER TABLE `tb_maintenance_summary_items`
    ADD COLUMN `item_version` VARCHAR(255) NULL DEFAULT NULL
    COMMENT '품목 버전';

-- 3) 패치필요 여부 (조건 적용 결과가 저장되는 필드)
ALTER TABLE `tb_maintenance_summary_items`
    ADD COLUMN `patch_required` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '패치필요 여부(0:불필요,1:필요)';

-- 4) 판정 메타데이터
ALTER TABLE `tb_maintenance_summary_items`
    ADD COLUMN `patch_required_at` DATETIME NULL DEFAULT NULL
    COMMENT '패치필요 판정 일시';

ALTER TABLE `tb_maintenance_summary_items`
    ADD COLUMN `patch_required_by` VARCHAR(255) NULL DEFAULT NULL
    COMMENT '패치필요 판정자';

ALTER TABLE `tb_maintenance_summary_items`
    ADD COLUMN `patch_condition` VARCHAR(500) NULL DEFAULT NULL
    COMMENT '패치필요 판정 조건 요약';

-- 5) 조회 성능 인덱스
CREATE INDEX `idx_summary_items_patch_required` ON `tb_maintenance_summary_items` (`patch_required`);
CREATE INDEX `idx_summary_items_name_version` ON `tb_maintenance_summary_items` (`item_name`, `item_version`);
