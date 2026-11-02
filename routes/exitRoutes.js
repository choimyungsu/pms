const express = require('express');
const router = express.Router();
const exitController = require('../controllers/exitController');
const auth = require('../middleware/auth');

// 퇴실 점검 페이지 표시 (GET /exit)
router.get('/', auth.isAuthenticated, exitController.getExitChecklistPage);

// 퇴실 점검 내역 저장 (POST /exit)
router.post('/', auth.isAuthenticated, exitController.saveExitChecklist);

// 퇴실 점검 내역 삭제 (DELETE /exit/:id)
router.delete('/:id', auth.isAuthenticated, auth.isAdmin, exitController.deleteExitChecklist);

module.exports = router;
