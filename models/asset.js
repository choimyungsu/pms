const db = require('../config/db');

const Asset = {
    getAll: async () => {
        const query = `
            SELECT 
                a.*, 
                h.name as handler_name,
                c.name as creator_name
            FROM tb_assets a
            LEFT JOIN tb_user h ON a.handler_id = h.id
            LEFT JOIN tb_user c ON a.creator_id = c.id
            ORDER BY a.created_at DESC
        `;
        const [rows] = await db.query(query);
        return rows;
    },

    getVehicleAttachmentsByAssetId: async (assetId) => {
        const query = `
            SELECT id, file_path, original_name
            FROM tb_asset_vehicle_attachments
            WHERE asset_id = ?
        `;
        const [rows] = await db.query(query, [assetId]);
        return rows;
    },

    getById: async (id) => {
        const query = `
            SELECT 
                a.*, 
                h.name as handler_name,
                c.name as creator_name
            FROM tb_assets a
            LEFT JOIN tb_user h ON a.handler_id = h.id
            LEFT JOIN tb_user c ON a.creator_id = c.id
            WHERE a.id = ?
        `;
        const [rows] = await db.query(query, [id]);
        const asset = rows[0];
        if (asset) {
            asset.vehicle_attachments = await Asset.getVehicleAttachmentsByAssetId(id);
        }
        return asset;
    },

    create: async (assetData) => {
        const {
            name,
            photo_path,
            purchase_date,
            asset_value,
            handler_id,
            manufacturer,
            model_name,
            serial_number,
            asset_management_number,
            purchase_price,
            warranty_end_date,
            status,
            notes,
            creator_id,
            is_vehicle,
            engine_oil_change_date,
            tire_replacement_date
        } = assetData;

        const query = `
            INSERT INTO tb_assets (
                name, photo_path, purchase_date, asset_value, handler_id, manufacturer, 
                model_name, serial_number, asset_management_number, purchase_price, 
                warranty_end_date, status, notes, creator_id, is_vehicle, 
                engine_oil_change_date, tire_replacement_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(query, [
            name,
            photo_path,
            purchase_date || null,
            asset_value || null,
            handler_id || null,
            manufacturer,
            model_name,
            serial_number,
            asset_management_number,
            purchase_price || null,
            warranty_end_date || null,
            status,
            notes,
            creator_id,
            is_vehicle,
            engine_oil_change_date || null,
            tire_replacement_date || null
        ]);
        return result.insertId;
    },

    update: async (id, assetData) => {
        const {
            name,
            photo_path,
            purchase_date,
            asset_value,
            handler_id,
            manufacturer,
            model_name,
            serial_number,
            asset_management_number,
            purchase_price,
            warranty_end_date,
            status,
            notes,
            is_vehicle,
            engine_oil_change_date,
            tire_replacement_date
        } = assetData;

        const query = `
            UPDATE tb_assets SET
                name = ?, 
                photo_path = ?, 
                purchase_date = ?, 
                asset_value = ?, 
                handler_id = ?, 
                manufacturer = ?, 
                model_name = ?, 
                serial_number = ?, 
                asset_management_number = ?, 
                purchase_price = ?, 
                warranty_end_date = ?, 
                status = ?, 
                notes = ?,
                is_vehicle = ?,
                engine_oil_change_date = ?,
                tire_replacement_date = ?
            WHERE id = ?
        `;
        
        const params = [
            name, 
            photo_path, 
            purchase_date, 
            asset_value, 
            handler_id, 
            manufacturer,
            model_name, 
            serial_number, 
            asset_management_number, 
            purchase_price,
            warranty_end_date, 
            status, 
            notes, 
            is_vehicle,
            engine_oil_change_date,
            tire_replacement_date,
            id
        ];
        
        const [result] = await db.query(query, params);
        return result.affectedRows;
    },

    delete: async (id) => {
        const query = "DELETE FROM tb_assets WHERE id = ?";
        const [result] = await db.query(query, [id]);
        return result.affectedRows;
    },

    deleteAllVehicleAttachments: async (assetId) => {
        const query = `
            DELETE FROM tb_asset_vehicle_attachments
            WHERE asset_id = ?
        `;
        const [result] = await db.query(query, [assetId]);
        return result.affectedRows;
    },

    addVehicleAttachment: async (assetId, filePath, originalName) => {
        const query = `
            INSERT INTO tb_asset_vehicle_attachments (asset_id, file_path, original_name)
            VALUES (?, ?, ?)
        `;
        const [result] = await db.query(query, [assetId, filePath, originalName]);
        return result.insertId;
    },

    deleteVehicleAttachment: async (attachmentId) => {
        const query = `
            DELETE FROM tb_asset_vehicle_attachments
            WHERE id = ?
        `;
        const [result] = await db.query(query, [attachmentId]);
        return result.affectedRows;
    },

    getVehicleAttachmentById: async (attachmentId) => {
        const query = `
            SELECT file_path, original_name
            FROM tb_asset_vehicle_attachments
            WHERE id = ?
        `;
        const [rows] = await db.query(query, [attachmentId]);
        return rows[0];
    },

    getUsers: async () => {
        const [rows] = await db.query('SELECT id, name FROM tb_user ORDER BY name');
        return rows;
    }
};

module.exports = Asset;
