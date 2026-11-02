const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin, isOpsOrAdmin } = require('../middleware/auth');

// 사용자 관리 (시스템 관리자 전용)
router.get('/users', isAdmin, adminController.getAdminUsersPage);
router.get('/users/add', isAdmin, adminController.getAddUserPage);
router.post('/users/add', isAdmin, adminController.addUser);
router.get('/users/edit/:id', isAdmin, adminController.getEditUserPage);
router.post('/users/edit/:id', isAdmin, adminController.updateUser);
router.post('/users/delete/:id', isAdmin, adminController.deleteUser);
router.get('/users/json', adminController.getAllUsersJson);

// 부서 관리 (시스템 관리자 전용)
router.get('/departments', isAdmin, (req, res) => {
    res.render('admin/departments', { page: 'admin_departments' });
});

// 관리자 일정 (운영 관리자 이상)
router.get('/schedule', isOpsOrAdmin, adminController.getAdminSchedulePage);
router.get('/schedule/:date', isOpsOrAdmin, adminController.getSchedulesForDate);

// 리소스 분석 (운영 관리자 이상)
router.get('/resource-analysis', isOpsOrAdmin, adminController.getAdminResourceAnalysisPage);
router.get('/resource-analysis/schedules-by-week', isOpsOrAdmin, adminController.getScheduleAnalysisData);

// 사용자 가장 (시스템 관리자 전용)
router.get('/login-as/:userId', isAdmin, adminController.loginAsUser);
router.get('/return-to-admin', isAdmin, adminController.returnToAdmin);

// 기술본부 현황 (운영 관리자 이상)
router.get('/tech-status', isOpsOrAdmin, adminController.getTechStatusPage);

module.exports = router;