const express = require('express');
const router = express.Router();
const memoController = require('../controllers/memoController');
const { isAuthenticated } = require('../middleware/auth');

// Memo list page
router.get('/', isAuthenticated, memoController.listMemos);

// Create memo form
router.get('/create', isAuthenticated, memoController.createMemoForm);

// Create memo action
router.post('/', isAuthenticated, memoController.createMemo);

// Upload image from clipboard
router.post('/upload-image', isAuthenticated, memoController.uploadImageMiddleware, memoController.handleUploadError, memoController.uploadPastedImage);

// View memo
router.get('/:id', isAuthenticated, memoController.viewMemo);

// Edit memo form
router.get('/:id/edit', isAuthenticated, memoController.editMemoForm);

// Update memo action
router.post('/:id', isAuthenticated, memoController.updateMemo);

// Delete memo action
router.post('/:id/delete', isAuthenticated, memoController.deleteMemo);

// Download memo as docx
router.get('/:id/download', isAuthenticated, memoController.downloadMemoAsDocx);

module.exports = router;