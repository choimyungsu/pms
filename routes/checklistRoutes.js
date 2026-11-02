const express = require('express');
const router = express.Router();
const checklistController = require('../controllers/checklistController');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/checklist');
    },
    filename: function (req, file, cb) {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const hash = crypto.createHash('sha256').update(decodedName).digest('hex');
        const ext = path.extname(decodedName);
        const safeFilename = `${hash}_${Date.now()}${ext}`;
        cb(null, safeFilename);
    }
});
const upload = multer({ storage: storage });

const handleKoreanFileNames = (req, res, next) => {
    if (req.files) {
        req.files.forEach(file => {
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        });
    }
    next();
};

// Checklist Categories API
router.get('/api/categories', isAuthenticated, checklistController.getCategories);
router.post('/api/categories', isAuthenticated, checklistController.createCategory);
router.put('/api/categories/:id', isAuthenticated, checklistController.updateCategory);
router.delete('/api/categories/:id', isAuthenticated, checklistController.deleteCategory);

// Checklist Items API
router.get('/api/items', isAuthenticated, checklistController.getChecklistItems);
router.post('/api/items', isAuthenticated, upload.array('attachments', 10), handleKoreanFileNames, checklistController.createChecklistItem);
router.put('/api/items/:id', isAuthenticated, upload.array('attachments', 10), handleKoreanFileNames, checklistController.updateChecklistItem);
router.delete('/api/items/:id', isAuthenticated, checklistController.deleteChecklistItem);

// Download Attachment
router.get('/api/attachments/:id/download', isAuthenticated, checklistController.downloadAttachment);

// Checklist Item Detail Page
router.get('/detail/:id', isAuthenticated, checklistController.getChecklistDetail);

// Checklist Item Edit Page
router.get('/edit/:id', isAuthenticated, checklistController.getChecklistEditPage);

// Main checklist page
router.get('/', isAuthenticated, checklistController.getChecklistPage);

module.exports = router;