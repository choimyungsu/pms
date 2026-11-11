-- ============================================================
-- tb_user.team 컬럼 제거
-- ============================================================
-- 배경
--   팀 구분은 소속 부서(tb_dept.text)만으로 결정한다.
--   tb_user.team 은 어떤 화면에서도 값을 입력/수정하지 않는 죽은 컬럼이었고,
--   과거 값이 남아 있는 경우 부서와 어긋나
--   "기술본부 현황 > 팀별 스킬 보유 현황" 카드에
--   다른 팀 인원이 섞여 표시되는 원인이 되었다.
--
-- 영향도 (제거 전 확인 완료)
--   - team 컬럼을 가진 테이블: tb_user 단 1개
--   - 쓰기 경로(INSERT/UPDATE/입력 폼): 없음
--   - 읽기 경로: controllers/adminController.js 의 tech-status 1곳 (제거 완료)
--   - SQL 마이그레이션 파일: team 관련 없음
--   - models/maintenance.js 의 team 은 tb_maintenance 레코드용 별개 필드 (무관)
--   - maintenanceSummaryController.js 는 이미 tb_dept.text 기준 (무관)
--
-- 실행 방법 (MySQL CLI)
--   mysql -h <host> -u <user> -p <database> < drop_team_from_user_table.sql
--
-- 실행 전 백업 권장 (아래 1번 주석 해제 후 먼저 실행)
-- ============================================================

-- 1) 백업 ---------------------------------------------------
-- CREATE TABLE IF NOT EXISTS tb_user_team_backup AS
-- SELECT id, name, team FROM tb_user;

-- 2) 컬럼 삭제 ---------------------------------------------
--    주의: MySQL 은 DROP COLUMN IF EXISTS 를 지원하지 않는다.
--          이미 컬럼이 없으면 "Unknown column" 오류가 나므로,
--          아래 확인 쿼리로 존재 여부를 먼저 본 뒤 실행한다.

-- 2-1) 존재 확인 (1 이면 아래 DROP 실행, 0 이면 이미 제거됨)
SELECT COUNT(*) AS team_column_exists
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'tb_user'
   AND COLUMN_NAME  = 'team';

-- 2-2) 삭제
ALTER TABLE tb_user DROP COLUMN team;
