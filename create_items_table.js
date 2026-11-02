const pool = require('./config/db');

async function createItemsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tb_maintenance_summary_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                summary_id INT NOT NULL,
                item_name VARCHAR(255) NOT NULL,
                item_detail VARCHAR(255),
                FOREIGN KEY (summary_id) REFERENCES tb_maintenance_summary(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `);
        console.log("Successfully created tb_maintenance_summary_items table");
        process.exit(0);
    } catch (error) {
        console.error("Error creating table:", error);
        process.exit(1);
    }
}

createItemsTable();
