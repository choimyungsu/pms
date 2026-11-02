const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const authMiddleware = require('../middleware/auth');

const isAuthenticated = authMiddleware.isAuthenticated;
const isAdmin = authMiddleware.isAdmin;

const uploadFields = assetController.upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'vehicle_attachment' } // Allow multiple files for vehicle_attachment
]);

const handleKoreanFileNames = (req, res, next) => {
    if (req.files && req.files.vehicle_attachment) {
        req.files.vehicle_attachment.forEach(file => {
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        });
    }
    next();
};

// Asset List
router.get('/', isAuthenticated, assetController.listAssets);

// Create Asset
router.get('/new', isAuthenticated, isAdmin, assetController.showNewAssetForm);
router.post('/', isAuthenticated, isAdmin, uploadFields, handleKoreanFileNames, assetController.createNewAsset);

// Edit Asset
router.get('/edit/:id', isAuthenticated, isAdmin, assetController.showEditAssetForm);
router.post('/edit/:id', isAuthenticated, isAdmin, uploadFields, handleKoreanFileNames, assetController.updateAsset);

// Delete Asset
router.post('/delete/:id', isAuthenticated, isAdmin, assetController.deleteAsset);

module.exports = router;
