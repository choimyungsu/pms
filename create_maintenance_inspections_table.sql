CREATE TABLE `tb_maintenance_inspections` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `summary_id` INT(11) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `attachment_path` VARCHAR(1024) NULL DEFAULT NULL,
    `attachment_original_name` VARCHAR(255) NULL DEFAULT NULL,
    `inspection_date` DATE NOT NULL,
    `creator_id` INT(11) NOT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`summary_id`) REFERENCES `tb_maintenance_summary`(`id`) ON DELETE CASCADE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;
