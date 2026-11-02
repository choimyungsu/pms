
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/login', authController.getLoginPage);
router.post('/login', authController.loginUser);
router.get('/logout', authController.logoutUser);

router.get('/profile', isAuthenticated, authController.getProfilePage);
router.post('/profile', isAuthenticated, authController.updateProfile);
router.post('/profile/check-color', isAuthenticated, authController.checkColorAvailability);

module.exports = router;
