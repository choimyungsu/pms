const express = require('express');
const router = express.Router();
const maintenanceSummaryController = require('../controllers/maintenanceSummaryController');
const { isAuthenticated, isAdmin, isOpsOrAdmin } = require('../middleware/auth'); // Added isAdmin

// 유지보수(요약) 라우트
router.get('/summary', isAuthenticated, maintenanceSummaryController.listSummary);
router.get('/summary/create', isAuthenticated, maintenanceSummaryController.getCreateSummaryPage);
router.post('/summary/create', isAuthenticated, maintenanceSummaryController.uploadAttachments.array('attachments'), maintenanceSummaryController.createSummary);

router.get('/summary/download-excel', isAuthenticated, maintenanceSummaryController.downloadMaintenanceSummaryExcel);
router.get('/summary/download-template', isAuthenticated, maintenanceSummaryController.downloadMaintenanceSummaryTemplate);
router.post('/summary/upload-excel', isAuthenticated, maintenanceSummaryController.uploadExcel.single('excelFile'), maintenanceSummaryController.uploadMaintenanceSummaryExcel);

// 상세 보기는 운영 관리자 이상만 가능
router.get('/summary/:id', isAuthenticated, maintenanceSummaryController.getSummaryById);

router.get('/summary/edit/:id', isAuthenticated, maintenanceSummaryController.getEditSummaryPage);
router.post('/summary/edit/:id', isAuthenticated, maintenanceSummaryController.uploadAttachments.array('attachments'), maintenanceSummaryController.updateSummary);
router.post('/summary/:id/delete', isAuthenticated, maintenanceSummaryController.deleteSummary);

// 첨부파일 다운로드
router.get('/summary/attachments/:id/download', isAuthenticated, maintenanceSummaryController.downloadAttachment);


module.exports = router;
