CREATE TABLE tb_research_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doc_classification VARCHAR(255),
    page_number VARCHAR(255),
    author VARCHAR(255),
    creation_date DATE,
    department VARCHAR(255),
    author2 VARCHAR(255),
    research_title TEXT,
    research_purpose TEXT,
    attendees TEXT,
    meeting_location VARCHAR(255),
    main_content TEXT,
    expected_outcome TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE tb_research_log
ADD COLUMN project_id INT,
     ADD CONSTRAINT fk_research_project
     FOREIGN KEY (project_id) REFERENCES tb_research_projects(id)
     ON DELETE SET NULL;