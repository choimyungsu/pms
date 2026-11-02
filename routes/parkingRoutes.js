const express = require('express');
const router = express.Router();
const parkingController = require('../controllers/parkingController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, parkingController.getParkingSupportPage);

module.exports = router;