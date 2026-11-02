
const express = require('express');
const router = express.Router();
const minutesController = require('../controllers/minutesController');

router.get('/create', minutesController.getCreatePage);
router.post('/save', minutesController.saveMeetingMinutes);
router.get('/list', minutesController.getMeetingMinutesListPage);
router.get('/view/:id', minutesController.getViewMeetingMinutesPage);
router.get('/edit/:id', minutesController.getEditMeetingMinutesPage);
router.post('/update/:id', minutesController.updateMeetingMinutes);
router.post('/delete/:id', minutesController.deleteMeetingMinutes);
router.get('/download-docx/:id', minutesController.downloadMeetingMinutesAsDocx);

module.exports = router;
