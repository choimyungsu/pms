CREATE TABLE tb_research_projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_name VARCHAR(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    participants TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
