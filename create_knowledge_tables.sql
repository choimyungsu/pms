CREATE TABLE `tb_knowledge_categories` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`name` VARCHAR(255) NOT NULL COLLATE 'utf8mb4_general_ci',
	`parent_id` INT(11) NULL DEFAULT NULL,
	`created_at` TIMESTAMP NULL DEFAULT current_timestamp(),
	`updated_at` TIMESTAMP NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
	PRIMARY KEY (`id`) USING BTREE,
	INDEX `parent_id` (`parent_id`) USING BTREE,
	CONSTRAINT `fk_knowledge_categories_parent` FOREIGN KEY (`parent_id`) REFERENCES `tb_knowledge_categories` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;

CREATE TABLE `tb_knowledge` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`category_id` INT(11) NOT NULL,
	`title` VARCHAR(255) NOT NULL COLLATE 'utf8mb4_general_ci',
	`type` VARCHAR(50) NOT NULL COLLATE 'utf8mb4_general_ci', -- 회의, 보고, 요구사항, 설명, 이슈, 자료
	`description1` TEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`description2` TEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`status` VARCHAR(50) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`creator_id` INT(11) NOT NULL,
	`assignee` VARCHAR(255) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`start_date` DATE NULL DEFAULT NULL,
	`end_date` DATE NULL DEFAULT NULL,
	`planned_date` DATE NULL DEFAULT NULL,
	`created_at` TIMESTAMP NULL DEFAULT current_timestamp(),
	`updated_at` TIMESTAMP NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
	PRIMARY KEY (`id`) USING BTREE,
	INDEX `category_id` (`category_id`) USING BTREE,
	INDEX `creator_id` (`creator_id`) USING BTREE,
	CONSTRAINT `fk_knowledge_category` FOREIGN KEY (`category_id`) REFERENCES `tb_knowledge_categories` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_knowledge_creator` FOREIGN KEY (`creator_id`) REFERENCES `tb_user` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;

CREATE TABLE `tb_knowledge_attachments` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `knowledge_id` INT(11) NOT NULL,
    `file_path` VARCHAR(255) NOT NULL COLLATE 'utf8mb4_general_ci',
    `original_name` VARCHAR(255) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
    `uploaded_at` TIMESTAMP NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`) USING BTREE,
    INDEX `knowledge_id` (`knowledge_id`) USING BTREE,
    CONSTRAINT `fk_knowledge_attachment` FOREIGN KEY (`knowledge_id`) REFERENCES `tb_knowledge` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;