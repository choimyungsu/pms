CREATE TABLE `tb_checklist_categories` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`name` VARCHAR(255) NOT NULL COLLATE 'utf8mb4_general_ci',
	`parent_id` INT(11) NULL DEFAULT NULL,
	`created_at` TIMESTAMP NULL DEFAULT current_timestamp(),
	`updated_at` TIMESTAMP NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
	PRIMARY KEY (`id`) USING BTREE,
	INDEX `parent_id` (`parent_id`) USING BTREE,
	CONSTRAINT `fk_checklist_categories_parent` FOREIGN KEY (`parent_id`) REFERENCES `tb_checklist_categories` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;

CREATE TABLE `tb_checklists` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`category_id` INT(11) NOT NULL,
	`title` VARCHAR(255) NOT NULL COLLATE 'utf8mb4_general_ci',
	`content` TEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`creator_id` INT(11) NOT NULL,
	`assignee_id` INT(11) NULL DEFAULT NULL,
	`created_at` TIMESTAMP NULL DEFAULT current_timestamp(),
	`updated_at` TIMESTAMP NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
	PRIMARY KEY (`id`) USING BTREE,
	INDEX `category_id` (`category_id`) USING BTREE,
	INDEX `creator_id` (`creator_id`) USING BTREE,
	INDEX `assignee_id` (`assignee_id`) USING BTREE,
	CONSTRAINT `fk_checklist_category` FOREIGN KEY (`category_id`) REFERENCES `tb_checklist_categories` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_checklist_creator` FOREIGN KEY (`creator_id`) REFERENCES `tb_user` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_checklist_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `tb_user` (`id`) ON UPDATE CASCADE ON DELETE SET NULL
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;

CREATE TABLE `tb_checklist_attachments` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `checklist_id` INT(11) NOT NULL,
    `file_path` VARCHAR(255) NOT NULL COLLATE 'utf8mb4_general_ci',
    `original_name` VARCHAR(255) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
    `uploaded_at` TIMESTAMP NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`) USING BTREE,
    INDEX `checklist_id` (`checklist_id`) USING BTREE,
    CONSTRAINT `fk_checklist_attachment` FOREIGN KEY (`checklist_id`) REFERENCES `tb_checklists` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;