ALTER TABLE tb_projects
ADD COLUMN creator_id INT;

-- 데이터 무결성을 위해 외래 키 제약 조건을 추가하는 것을 권장합니다.
-- 기존 데이터에 creator_id가 없는 경우 오류가 발생할 수 있으므로, 
-- 모든 기존 프로젝트에 creator_id를 설정한 후에 이 제약 조건을 추가하거나,
-- ON DELETE SET NULL 옵션을 고려할 수 있습니다.
-- ALTER TABLE tb_projects
-- ADD CONSTRAINT fk_projects_creator_id
-- FOREIGN KEY (creator_id) REFERENCES tb_user(id)
-- ON DELETE SET NULL; -- 또는 ON DELETE CASCADE (프로젝트 생성자 삭제 시 프로젝트도 삭제)