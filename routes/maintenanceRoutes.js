const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');
const { isAuthenticated, isOpsOrAdmin } = require('../middleware/auth');

// Multer configuration for file uploads
const upload = maintenanceController.upload;

// 유지보수 목록 페이지
router.get('/', isAuthenticated, isOpsOrAdmin, maintenanceController.getMaintenanceList);


// 유지보수 등록 페이지
router.get('/create', isAuthenticated, maintenanceController.getCreateMaintenancePage);
router.post('/create', isAuthenticated, upload.single('attachment'), maintenanceController.createMaintenance);

// 유지보수 엑셀 업로드
router.post('/upload-excel', isAuthenticated, upload.single('maintenanceExcelFile'), maintenanceController.uploadMaintenanceExcel);

// 유지보수 엑셀 다운로드
router.get('/download-excel', isAuthenticated, maintenanceController.downloadMaintenanceExcel);

// 유지보수 엑셀 템플릿 다운로드
router.get('/download-template', isAuthenticated, maintenanceController.downloadMaintenanceTemplate);

// 유지보수 수정 페이지
router.get('/edit/:id', isAuthenticated, maintenanceController.getEditMaintenancePage);
router.post('/update/:id', isAuthenticated, upload.single('attachment'), maintenanceController.updateMaintenance);

// 유지보수 삭제
router.delete('/:id', isAuthenticated, maintenanceController.deleteMaintenance);

// 유지보수 종료 처리
router.post('/close/:id', isAuthenticated, maintenanceController.closeMaintenance);

// 첨부파일 다운로드
router.get('/download/:id', isAuthenticated, maintenanceController.downloadAttachment);

module.exports = router;