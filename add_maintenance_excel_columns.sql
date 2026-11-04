-- =====================================================================
-- 유지보수 총괄표(엑셀) 반영을 위한 스키마 확장
--
--  대상 DB : 애플리케이션의 config/db.js 에 설정된 데이터베이스
--  대상 테이블
--    - tb_maintenance_summary        (고객사/사업 단위 = 그룹 레벨)
--    - tb_maintenance_summary_items  (품목/장비 1건 단위)
--
--  ★ 이 스크립트는 "멱등(idempotent)" 입니다.
--    이미 있는 컬럼/인덱스는 건너뛰므로, 여러 번 실행해도 안전합니다.
--    (운영 중인 테이블에 붙여도 기존 데이터는 변경되지 않습니다)
--
--  ★ MySQL 5.7+ / 8.x, MariaDB 10.x+ 모두에서 동작합니다.
--    (ADD COLUMN IF NOT EXISTS 는 MariaDB 전용이라 사용하지 않고,
--     INFORMATION_SCHEMA 를 먼저 조회하는 방식으로 처리합니다)
--
--  실행 방법은 파일 맨 아래 [실행 방법] 을 참고하세요.
-- =====================================================================


/* ---------------------------------------------------------------------
   0) 사전 확인 — 어떤 DB 에 붙어 있는지 먼저 확인
   --------------------------------------------------------------------- */
SELECT DATABASE() AS `현재_데이터베이스`;

SELECT COUNT(*) AS `요약테이블_존재`
  FROM INFORMATION_SCHEMA.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'tb_maintenance_summary';

SELECT COUNT(*) AS `품목테이블_존재`
  FROM INFORMATION_SCHEMA.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'tb_maintenance_summary_items';


/* ---------------------------------------------------------------------
   1) 헬퍼 프로시저 (컬럼/인덱스가 없을 때만 ALTER)
   --------------------------------------------------------------------- */
DROP PROCEDURE IF EXISTS `_add_column_if_missing`;
DROP PROCEDURE IF EXISTS `_add_index_if_missing`;

DELIMITER $$

CREATE PROCEDURE `_add_column_if_missing`(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition TEXT
)
BEGIN
    DECLARE v_cnt INT DEFAULT 0;

    SELECT COUNT(*) INTO v_cnt
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = p_table
       AND COLUMN_NAME  = p_column;

    IF v_cnt = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('[추가] ', p_table, '.', p_column) AS `결과`;
    ELSE
        SELECT CONCAT('[유지] ', p_table, '.', p_column) AS `결과`;
    END IF;
END$$

CREATE PROCEDURE `_add_index_if_missing`(
    IN p_table VARCHAR(64),
    IN p_index VARCHAR(64),
    IN p_columns TEXT
)
BEGIN
    DECLARE v_cnt INT DEFAULT 0;

    SELECT COUNT(*) INTO v_cnt
      FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = p_table
       AND INDEX_NAME   = p_index;

    IF v_cnt = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('[인덱스 추가] ', p_table, '.', p_index) AS `결과`;
    ELSE
        SELECT CONCAT('[인덱스 유지] ', p_table, '.', p_index) AS `결과`;
    END IF;
END$$

DELIMITER ;


/* ---------------------------------------------------------------------
   2) tb_maintenance_summary — 8개 컬럼
      (검수일 / 도입일 / 유지보수 업체 3종 / 고객 부서·위치 / 견적서)
   --------------------------------------------------------------------- */
CALL `_add_column_if_missing`('tb_maintenance_summary', 'inspection_date',
     'VARCHAR(50) NULL DEFAULT NULL COMMENT ''검수일''');
CALL `_add_column_if_missing`('tb_maintenance_summary', 'introduction_date',
     'VARCHAR(50) NULL DEFAULT NULL COMMENT ''도입일''');
CALL `_add_column_if_missing`('tb_maintenance_summary', 'vendor_name',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''유지보수 업체명''');
CALL `_add_column_if_missing`('tb_maintenance_summary', 'vendor_contact_person',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''업체 담당자''');
CALL `_add_column_if_missing`('tb_maintenance_summary', 'vendor_contact',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''업체 연락처/이메일''');
CALL `_add_column_if_missing`('tb_maintenance_summary', 'customer_department',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''고객 부서명''');
CALL `_add_column_if_missing`('tb_maintenance_summary', 'customer_location',
     'VARCHAR(500) NULL DEFAULT NULL COMMENT ''고객사 위치''');
CALL `_add_column_if_missing`('tb_maintenance_summary', 'quote_file',
     'VARCHAR(500) NULL DEFAULT NULL COMMENT ''견적서 파일명''');


/* ---------------------------------------------------------------------
   3) tb_maintenance_summary_items — 7개 컬럼
      (수량 / 백계약 6종)
   --------------------------------------------------------------------- */
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'quantity',
     'INT NULL DEFAULT 1 COMMENT ''수량''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'contractor_company',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''백계약업체(매입처)''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'contractor_contract',
     'VARCHAR(100) NULL DEFAULT NULL COMMENT ''백계약 상태''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'contractor_start_date',
     'VARCHAR(50) NULL DEFAULT NULL COMMENT ''백계약 계약일''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'contractor_end_date',
     'VARCHAR(50) NULL DEFAULT NULL COMMENT ''백계약 종료일''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'contractor_contact_person',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''백계약 담당자''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'contractor_contact',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''백계약 연락처/이메일''');


/* ---------------------------------------------------------------------
   4) (안전장치) 이전 라운드의 패치관리 컬럼도 함께 점검
      - 이미 있으면 [유지] 로 표시되고 아무 것도 하지 않습니다.
      - 새 환경에 배포할 때 이 파일 하나로 정리가 끝나도록 포함했습니다.
   --------------------------------------------------------------------- */
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'item_version',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''품목 버전''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'manufacturer',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''제조사''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'model_name',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''모델명''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'eos_date',
     'VARCHAR(50) NULL DEFAULT NULL COMMENT ''EoS (지원종료일)''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'eol_date',
     'VARCHAR(50) NULL DEFAULT NULL COMMENT ''EoL (수명종료일)''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'serial_number',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''S/N (시리얼넘버)''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'fw_version',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''FW 버전''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'os_version',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''OS 버전''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'inspection_location_item',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''점검위치(품목별)''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'patch_required',
     'TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''패치필요 여부(0:불필요,1:필요)''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'patch_required_at',
     'DATETIME NULL DEFAULT NULL COMMENT ''패치필요 판정 일시''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'patch_required_by',
     'VARCHAR(255) NULL DEFAULT NULL COMMENT ''패치필요 판정자''');
CALL `_add_column_if_missing`('tb_maintenance_summary_items', 'patch_condition',
     'VARCHAR(500) NULL DEFAULT NULL COMMENT ''패치필요 판정 조건 요약''');


/* ---------------------------------------------------------------------
   5) 조회 성능 인덱스 (없을 때만)
   --------------------------------------------------------------------- */
CALL `_add_index_if_missing`('tb_maintenance_summary', 'idx_summary_customer_project',
     '`customer_company`, `project_name`');
CALL `_add_index_if_missing`('tb_maintenance_summary_items', 'idx_summary_items_serial',
     '`serial_number`');
CALL `_add_index_if_missing`('tb_maintenance_summary_items', 'idx_summary_items_patch_required',
     '`patch_required`');
CALL `_add_index_if_missing`('tb_maintenance_summary_items', 'idx_summary_items_name_version',
     '`item_name`, `item_version`');


/* ---------------------------------------------------------------------
   6) 헬퍼 프로시저 정리 (DB 에 남기지 않음)
   --------------------------------------------------------------------- */
DROP PROCEDURE IF EXISTS `_add_column_if_missing`;
DROP PROCEDURE IF EXISTS `_add_index_if_missing`;


/* ---------------------------------------------------------------------
   7) 최종 확인 — 새 컬럼이 모두 보이면 성공
   --------------------------------------------------------------------- */
SELECT TABLE_NAME AS `테이블`, COLUMN_NAME AS `컬럼`, COLUMN_TYPE AS `타입`
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND (
        (TABLE_NAME = 'tb_maintenance_summary'
         AND COLUMN_NAME IN ('inspection_date','introduction_date','vendor_name',
                             'vendor_contact_person','vendor_contact',
                             'customer_department','customer_location','quote_file'))
     OR (TABLE_NAME = 'tb_maintenance_summary_items'
         AND COLUMN_NAME IN ('quantity','contractor_company','contractor_contract',
                             'contractor_start_date','contractor_end_date',
                             'contractor_contact_person','contractor_contact'))
   )
 ORDER BY TABLE_NAME, ORDINAL_POSITION;
-- 기대 결과: 15행 (요약 8 + 품목 7)


-- =====================================================================
-- [실행 방법]
--
--  방법 A) phpMyAdmin  (가장 간단)
--    1. 접속 → 좌측에서 애플리케이션이 쓰는 DB 선택
--    2. 상단 [SQL] 탭 클릭
--    3. 이 파일 내용 전체를 붙여넣기
--    4. 우측 하단 [실행(Go)] 클릭
--    5. 맨 아래 결과에서 15행이 나오면 성공
--
--  방법 B) HeidiSQL / DBeaver / MySQL Workbench
--    - 해당 DB 에 연결 → SQL 편집기 → 파일 열기 → 전체 실행(F5 / Ctrl+Enter)
--    - DELIMITER 를 지원하므로 이 파일을 그대로 실행할 수 있습니다.
--
--  방법 C) 명령 프롬프트 (mysql 클라이언트가 PATH 에 있을 때)
--    mysql -u root -p <DB이름> < add_maintenance_excel_columns.sql
--    예) mysql -u root -p business_cards < add_maintenance_excel_columns.sql
--
--  ※ DB 이름은 E:\dev\gemini\config\db.js 의 `database` 값을 확인하세요.
--     (config/ 는 gitignore 대상이라 저장소에는 없습니다)
--
--  ※ 실행 후 반드시 Node 서버를 재시작하세요.
--     (스키마 캐시를 쓰는 부분이 있어 재시작이 가장 확실합니다)
--        pm2 restart <앱이름>      또는      Ctrl+C 후 npm start
-- =====================================================================
