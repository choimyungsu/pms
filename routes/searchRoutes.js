const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const authMiddleware = require('../middleware/auth');

router.get('/search', authMiddleware.isAuthenticated, searchController.getSearchPage);
router.post('/search', authMiddleware.isAuthenticated, searchController.performSearch);

module.exports = router;