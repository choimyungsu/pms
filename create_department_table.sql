CREATE TABLE tb_dept (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT,
    text VARCHAR(255) NOT NULL,
    position INT
);
