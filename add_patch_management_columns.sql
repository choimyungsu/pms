-- =====================================================================
-- 패치관리 메뉴용 컬럼 추가 (tb_maintenance)
-- 애플리케이션 시작 시 utils/patchSchema.js 가 동일 내용을 자동 점검/반영합니다.
-- (컬럼 존재 여부를 INFORMATION_SCHEMA 로 먼저 확인한 뒤 없을 때만 ALTER)
-- =====================================================================

-- 1) 패치 필요 여부 (조건 적용/수동 토글 결과가 저장되는 필드)
ALTER TABLE `tb_maintenance`
    ADD COLUMN `patch_required` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '패치필요 여부(0:불필요,1:필요)';

-- 2) 패치 필요 판정 시각 / 판정자 / 적용 조건 요약 (이력 추적용)
ALTER TABLE `tb_maintenance`
    ADD COLUMN `patch_required_at` DATETIME NULL DEFAULT NULL COMMENT '패치필요 판정 일시';

ALTER TABLE `tb_maintenance`
    ADD COLUMN `patch_required_by` VARCHAR(255) NULL DEFAULT NULL COMMENT '패치필요 판정자';

ALTER TABLE `tb_maintenance`
    ADD COLUMN `patch_condition` VARCHAR(500) NULL DEFAULT NULL COMMENT '패치필요 판정 조건 요약';

-- 3) 목록 조회 성능용 인덱스 (선택)
ALTER TABLE `tb_maintenance`
    ADD INDEX `idx_maintenance_patch_required` (`patch_required`);
