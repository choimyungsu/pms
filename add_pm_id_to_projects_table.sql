ALTER TABLE tb_projects
ADD COLUMN pm_id INT,
ADD CONSTRAINT fk_pm_id
FOREIGN KEY (pm_id) REFERENCES tb_user(id);