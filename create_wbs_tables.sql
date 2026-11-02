CREATE TABLE tb_wbs_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    parent_id INT NULL, -- 부모 태스크 ID (최상위 태스크는 NULL)
    task_name VARCHAR(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    duration INT, -- 기간 (일 단위, 자동 계산)
    progress INT DEFAULT 0, -- 진척율 (0-100)
    assigned_user_id INT NULL, -- 담당자 ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES tb_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES tb_wbs_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_user_id) REFERENCES tb_user(id) ON DELETE SET NULL
);