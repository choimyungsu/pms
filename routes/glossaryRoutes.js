const express = require('express');
const router = express.Router();
const glossaryController = require('../controllers/glossaryController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware.isAuthenticated, glossaryController.getGlossaryPage);
router.get('/create', authMiddleware.isAuthenticated, glossaryController.getCreateGlossaryPage);
router.get('/edit/:id', authMiddleware.isAuthenticated, glossaryController.getEditGlossaryPage);
router.get('/api/terms', authMiddleware.isAuthenticated, glossaryController.getGlossaryTerms);
router.post('/', authMiddleware.isAuthenticated, glossaryController.upload.single('image'), glossaryController.addGlossaryTerm);
router.post('/edit/:id', authMiddleware.isAuthenticated, glossaryController.upload.single('image'), glossaryController.updateGlossaryTerm);
router.post('/upload-image', authMiddleware.isAuthenticated, glossaryController.upload.single('image'), glossaryController.uploadImage);
router.delete('/api/terms/:id', authMiddleware.isAuthenticated, glossaryController.deleteGlossaryTerm);

module.exports = router;