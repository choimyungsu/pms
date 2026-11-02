CREATE TABLE `tb_memo` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NULL DEFAULT NULL,
    `creator_id` INT(11) NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (`id`),
    INDEX `creator_id` (`creator_id`),
    CONSTRAINT `fk_memo_creator` FOREIGN KEY (`creator_id`) REFERENCES `tb_user` (`id`) ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB;