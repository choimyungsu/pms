CREATE TABLE `tb_knowledge_comments` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `knowledge_id` INT(11) NOT NULL,
    `user_id` INT(11) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (`id`),
    FOREIGN KEY (`knowledge_id`) REFERENCES `tb_knowledge` (`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `tb_user` (`id`) ON DELETE CASCADE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;
