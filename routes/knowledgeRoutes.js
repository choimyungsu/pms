const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledgeController');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/knowledge');
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

// Knowledge Categories API
router.get('/api/categories', isAuthenticated, knowledgeController.getCategories);
router.post('/api/categories', isAuthenticated, knowledgeController.createCategory);
router.put('/api/categories/:id', isAuthenticated, knowledgeController.updateCategory);
router.delete('/api/categories/:id', isAuthenticated, knowledgeController.deleteCategory);

// Knowledge Items API
router.get('/api/items', isAuthenticated, knowledgeController.getKnowledgeItems);
router.post('/api/items', isAuthenticated, upload.array('attachments', 10), handleKoreanFileNames, knowledgeController.createKnowledgeItem);
router.put('/api/items/:id', isAuthenticated, upload.array('attachments', 10), handleKoreanFileNames, knowledgeController.updateKnowledgeItem);
router.delete('/api/items/:id', isAuthenticated, knowledgeController.deleteKnowledgeItem);

// Download Attachment
router.get('/api/attachments/:id/download', isAuthenticated, knowledgeController.downloadAttachment);

// Knowledge Item Detail Page
router.get('/detail/:id', isAuthenticated, knowledgeController.getKnowledgeDetail);

// Knowledge Item Edit Page
router.get('/edit/:id', isAuthenticated, knowledgeController.getKnowledgeEditPage);

// Comments API
router.get('/api/items/:id/comments', isAuthenticated, knowledgeController.getComments);
router.post('/api/items/:id/comments', isAuthenticated, knowledgeController.addComment);
router.delete('/api/comments/:commentId', isAuthenticated, knowledgeController.deleteComment);
router.put('/api/comments/:commentId', isAuthenticated, knowledgeController.updateComment);

// Knowledge Item Detail (for existing route)
router.get('/:id', isAuthenticated, knowledgeController.getKnowledgeDetail);

// Frontend routes
router.get('/', isAuthenticated, knowledgeController.getKnowledgePage);

module.exports = router;