const express = require('express');
const router = express.Router();
const weeklyReportController = require('../controllers/weeklyReportController');
const authMiddleware = require('../middleware/auth'); // Assuming you have an auth middleware

// Apply authentication middleware to all weekly report routes
router.use(authMiddleware.isAuthenticated);

// GET route for rendering the create weekly report form
router.get('/create', weeklyReportController.renderCreateForm);

// POST route for creating a new weekly report
router.post('/', weeklyReportController.createReport);

// GET route for listing all weekly reports
router.get('/', weeklyReportController.listReports);

// GET route for rendering the edit weekly report form (Admin only)
router.get('/:id/edit', authMiddleware.isAdmin, weeklyReportController.renderEditForm);

// POST route for updating a weekly report (Admin only)
router.post('/:id', authMiddleware.isAdmin, weeklyReportController.updateReport);

// POST route for deleting a weekly report (Admin only)
router.post('/:id/delete', authMiddleware.isAdmin, weeklyReportController.deleteReport);

// GET route for viewing a single weekly report by ID (This should be last to avoid matching /:id/edit or /:id/delete)
router.get('/:id', weeklyReportController.viewReport);

module.exports = router;