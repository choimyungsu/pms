CREATE TABLE `tb_maintenance_summary` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `division` VARCHAR(255) NULL DEFAULT NULL,
    `customer_company` VARCHAR(255) NULL DEFAULT NULL,
    `project_name` VARCHAR(255) NULL DEFAULT NULL,
    `maintenance_start_date` DATE NULL DEFAULT NULL,
    `maintenance_end_date` DATE NULL DEFAULT NULL,
    `item` VARCHAR(255) NULL DEFAULT NULL,
    `main_engineer` VARCHAR(255) NULL DEFAULT NULL,
    `sub_engineer` VARCHAR(255) NULL DEFAULT NULL,
    `sales_manager` VARCHAR(255) NULL DEFAULT NULL,
    `inspection_method` VARCHAR(255) NULL DEFAULT NULL,
    `customer_contact_person` VARCHAR(255) NULL DEFAULT NULL,
    `customer_contact` VARCHAR(255) NULL DEFAULT NULL,
    `customer_email` VARCHAR(255) NULL DEFAULT NULL,
    `inspection_location` VARCHAR(255) NULL DEFAULT NULL,
    `remarks` TEXT NULL DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;


ALTER TABLE `tb_maintenance_summary` ADD COLUMN `creator_id` INT(11) NULL AFTER `remarks`;
	