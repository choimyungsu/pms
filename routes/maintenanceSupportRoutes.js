const express = require('express');
const router = express.Router();
const maintenanceSupportController = require('../controllers/maintenanceSupportController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/summary/:summaryId/support', isAuthenticated, maintenanceSupportController.getSupportLogPage);
router.post('/summary/:summaryId/support', isAuthenticated, maintenanceSupportController.createSupportLog);
router.post('/support/update/:id', isAuthenticated, maintenanceSupportController.updateSupportLog);
router.post('/support/delete/:id', isAuthenticated, maintenanceSupportController.deleteSupportLog);

module.exports = router;
