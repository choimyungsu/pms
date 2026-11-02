ALTER TABLE tb_user ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'

-- 기존 관리자를 'admin'으로 설정
      UPDATE tb_user SET role = 'admin' WHERE is_admin = 1;

-- 특정 사용자를 'operations_manager'로 설정 (예: user_id = 2)
      UPDATE tb_user SET role = 'operations_manager' WHERE id = 2;