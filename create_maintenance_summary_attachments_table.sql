CREATE TABLE `tb_maintenance_summary_attachments` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `summary_id` INT(11) NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`summary_id`) REFERENCES `tb_maintenance_summary`(`id`) ON DELETE CASCADE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;
