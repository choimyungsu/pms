

 CREATE TABLE `tb_isms_item` (
       `gubun_no` VARCHAR(50) NOT NULL COMMENT '구분번호',
       `gubun` VARCHAR(255) NOT NULL COMMENT '구분',
       `item_no` VARCHAR(50) NOT NULL COMMENT '항목번호',
       `item` VARCHAR(255) NOT NULL COMMENT '항목',
       `item_detail` TEXT NULL COMMENT '상세내용',
       PRIMARY KEY (`item_no`)
     ) COMMENT='ISMS 항목';
    
    CREATE TABLE `tb_isms_item_checklist` (
      `id` INT NOT NULL AUTO_INCREMENT COMMENT '체크리스트 ID',
      `item_no` VARCHAR(50) NOT NULL COMMENT '항목번호',
      `checklist` TEXT NOT NULL COMMENT '체크리스트',
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      FOREIGN KEY (`item_no`) REFERENCES `tb_isms_item` (`item_no`) ON DELETE CASCADE
    ) COMMENT='ISMS 항목별 체크리스트';