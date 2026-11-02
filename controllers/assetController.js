const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Asset = require('../models/asset');
const crypto = require('crypto'); // Add crypto module

// Multer storage configuration for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'assets');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const hash = crypto.createHash('sha256').update(decodedName).digest('hex');
        const ext = path.extname(decodedName);
        const safeFilename = `${hash}_${Date.now()}${ext}`;
        cb(null, safeFilename);
    }
});

exports.upload = multer({ storage: storage });

// Display a list of all assets
exports.listAssets = async (req, res) => {
    try {
        const assets = await Asset.getAll();
        res.render('assets/list', {
            assets,
            currentUser: req.session.user,
            page: 'assets',
            message: req.session.message,
            error: req.session.error
        });
        req.session.message = null;
        req.session.error = null;
    } catch (error) {
        console.error('Error fetching assets:', error);
        req.session.error = '자산 목록을 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// Show the form for creating a new asset
exports.showNewAssetForm = async (req, res) => {
    try {
        const users = await Asset.getUsers();
        res.render('assets/new', {
            users,
            currentUser: req.session.user,
            page: 'assets_new',
            message: req.session.message,
            error: req.session.error
        });
        req.session.message = null;
        req.session.error = null;
    } catch (error) {
        console.error('Error fetching users for new asset form:', error);
        req.session.error = '자산 추가 페이지를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/assets');
    }
};

// Create a new asset
exports.createNewAsset = async (req, res) => {
    try {
        const assetData = req.body;
        
        if (req.files && req.files.photo) {
            assetData.photo_path = `/uploads/assets/${req.files.photo[0].filename}`;
        }
        assetData.creator_id = req.session.user.id;
        
        assetData.is_vehicle = assetData.is_vehicle ? true : false;
        
        if (!assetData.purchase_date) assetData.purchase_date = null;
        if (!assetData.warranty_end_date) assetData.warranty_end_date = null;
        if (!assetData.handler_id) assetData.handler_id = null;
        if (!assetData.purchase_price) assetData.purchase_price = null;
        if (!assetData.asset_value) assetData.asset_value = null;
        if (!assetData.serial_number) assetData.serial_number = null;
        if (!assetData.asset_management_number) assetData.asset_management_number = null;
        if (!assetData.engine_oil_change_date) assetData.engine_oil_change_date = null;
        if (!assetData.tire_replacement_date) assetData.tire_replacement_date = null;

        const assetId = await Asset.create(assetData);

        if (assetData.is_vehicle && req.files && req.files.vehicle_attachment && req.files.vehicle_attachment.length > 0) {
            const attachmentPromises = req.files.vehicle_attachment.map(file => {
                const filePath = `/uploads/assets/${file.filename}`;
                return Asset.addVehicleAttachment(assetId, filePath, file.originalname);
            });
            await Promise.all(attachmentPromises);
        }

        req.session.message = '자산이 성공적으로 추가되었습니다.';
        res.redirect('/assets');
    } catch (error) {
        console.error('Error creating asset:', error);
        req.session.error = '자산 추가 중 오류가 발생했습니다.';
        res.redirect('/assets/new');
    }
};

// Show the form for editing an asset
exports.showEditAssetForm = async (req, res) => {
    try {
        const asset = await Asset.getById(req.params.id);
        if (!asset) {
            req.session.error = '자산을 찾을 수 없습니다.';
            return res.redirect('/assets');
        }
        const users = await Asset.getUsers();
        res.render('assets/edit', {
            asset,
            users,
            currentUser: req.session.user,
            page: 'assets_edit',
            message: req.session.message,
            error: req.session.error
        });
        req.session.message = null;
        req.session.error = null;
    } catch (error) {
        console.error('Error fetching asset for edit:', error);
        req.session.error = '자산 정보를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/assets');
    }
};

// Update an asset
exports.updateAsset = async (req, res) => {
    const { id } = req.params;
    try {
        const assetData = req.body;
        const oldAsset = await Asset.getById(id); // Fetch old asset to get existing photo path

        // Handle photo upload
        if (req.files && req.files.photo && req.files.photo.length > 0) {
            assetData.photo_path = `/uploads/assets/${req.files.photo[0].filename}`;
            if (oldAsset && oldAsset.photo_path) {
                const oldPath = path.join(__dirname, '..', oldAsset.photo_path);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
        } else {
            // If no new photo is uploaded, retain the old one
            assetData.photo_path = oldAsset ? oldAsset.photo_path : null;
        }

        assetData.is_vehicle = assetData.is_vehicle ? true : false;

        // If not a vehicle, clear all vehicle-specific data and attachments
        if (!assetData.is_vehicle) {
            assetData.engine_oil_change_date = null;
            assetData.tire_replacement_date = null;

            // Delete all associated vehicle attachments
            const existingAttachments = await Asset.getVehicleAttachmentsByAssetId(id);
            const deleteFilePromises = existingAttachments.map(async attachment => {
                const filePath = path.join(__dirname, '..', attachment.file_path);
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath).catch(err => console.error(`Failed to delete file ${filePath}:`, err));
                }
            });
            await Promise.all(deleteFilePromises);
            await Asset.deleteAllVehicleAttachments(id);

        } else {
            // Handle deletions of existing vehicle attachments
            if (assetData.attachments_to_delete) {
                try {
                    const parsedAttachmentsToDelete = JSON.parse(assetData.attachments_to_delete);
                    if (Array.isArray(parsedAttachmentsToDelete) && parsedAttachmentsToDelete.length > 0) {
                        const deletePromises = parsedAttachmentsToDelete.map(async attachmentId => {
                            const attachment = await Asset.getVehicleAttachmentById(attachmentId);
                            if (attachment) {
                                const filePath = path.join(__dirname, '..', attachment.file_path);
                                if (fs.existsSync(filePath)) {
                                    await fs.promises.unlink(filePath).catch(err => console.error(`Failed to delete file ${filePath}:`, err));
                                }
                                await Asset.deleteVehicleAttachment(attachmentId);
                            }
                        });
                        await Promise.all(deletePromises);
                    }
                } catch (e) {
                    console.error('Error parsing attachments_to_delete:', e);
                }
            }

            // Handle new vehicle attachments
            if (req.files && req.files.vehicle_attachment && req.files.vehicle_attachment.length > 0) {
                const attachmentPromises = req.files.vehicle_attachment.map(file => {
                    const filePath = `/uploads/assets/${file.filename}`;
                    return Asset.addVehicleAttachment(id, filePath, file.originalname);
                });
                await Promise.all(attachmentPromises);
            }
        }
        
        if (!assetData.purchase_date) assetData.purchase_date = null;
        if (!assetData.warranty_end_date) assetData.warranty_end_date = null;
        if (!assetData.handler_id) assetData.handler_id = null;
        if (!assetData.purchase_price) assetData.purchase_price = null;
        if (!assetData.asset_value) assetData.asset_value = null;
        if (!assetData.serial_number) assetData.serial_number = null;
        if (!assetData.asset_management_number) assetData.asset_management_number = null;
        if (!assetData.engine_oil_change_date) assetData.engine_oil_change_date = null;
        if (!assetData.tire_replacement_date) assetData.tire_replacement_date = null;

        await Asset.update(id, assetData); // Update basic asset data
        req.session.message = '자산 정보가 성공적으로 업데이트되었습니다.';
        res.redirect('/assets');
    } catch (error) {
        console.error('Error updating asset:', error);
        req.session.error = '자산 정보 업데이트 중 오류가 발생했습니다.';
        res.redirect(`/assets/edit/${id}`);
    }
};

// Delete an asset
exports.deleteAsset = async (req, res) => {
    const { id } = req.params;
    try {
        const asset = await Asset.getById(id);
        if (asset) {
            // Delete main photo if exists
            if (asset.photo_path) {
                const photoPath = path.join(__dirname, '..', asset.photo_path);
                 if (fs.existsSync(photoPath)) {
                    fs.unlinkSync(photoPath);
                }
            }

            // Delete all vehicle attachments if any
            if (asset.vehicle_attachments && asset.vehicle_attachments.length > 0) {
                const deleteFilePromises = asset.vehicle_attachments.map(async attachment => {
                    const filePath = path.join(__dirname, '..', attachment.file_path);
                    if (fs.existsSync(filePath)) {
                        await fs.promises.unlink(filePath).catch(err => console.error(`Failed to delete file ${filePath}:`, err));
                    }
                });
                await Promise.all(deleteFilePromises);
                await Asset.deleteAllVehicleAttachments(id); // Delete records from db
            }
        }
        
        await Asset.delete(id); // Delete asset record
        req.session.message = '자산이 성공적으로 삭제되었습니다.';
        res.redirect('/assets');
    } catch (error) {
        console.error('Error deleting asset:', error);
        req.session.error = '자산 삭제 중 오류가 발생했습니다.';
        res.redirect('/assets');
    }
};
