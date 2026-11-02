CREATE TABLE tb_issues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    project_id INT,
    status ENUM('진행중', '완료') NOT NULL DEFAULT '진행중',
    content TEXT,
    creator_id INT,
    assignee_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES tb_projects(id) ON DELETE SET NULL,
    FOREIGN KEY (creator_id) REFERENCES tb_users(id) ON DELETE SET NULL,
    FOREIGN KEY (assignee_id) REFERENCES tb_users(id) ON DELETE SET NULL
);
