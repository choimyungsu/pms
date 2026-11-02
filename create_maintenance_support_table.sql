CREATE TABLE IF NOT EXISTS `tb_maintenance_support` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `summary_id` INT(11) NOT NULL,
    `support_date` DATE NOT NULL,
    `input_time` DECIMAL(5, 2) NOT NULL,
    `support_type` ENUM('field', 'remote') NOT NULL,
    `is_direct_commute` TINYINT(1) DEFAULT 0,
    `creator_id` INT(11) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_maintenance_summary` FOREIGN KEY (`summary_id`) REFERENCES `tb_maintenance_summary` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_support_creator` FOREIGN KEY (`creator_id`) REFERENCES `tb_user` (`id`)
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;
