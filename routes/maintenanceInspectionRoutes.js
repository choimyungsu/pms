const express = require('express');
const router = express.Router();
const maintenanceInspectionController = require('../controllers/maintenanceInspectionController');
const { isAuthenticated, isOpsOrAdmin } = require('../middleware/auth');

// 정기점검 라우트
// 상세 보기는 운영 관리자 이상만 가능
router.get('/summary/:summaryId/inspections', isAuthenticated, maintenanceInspectionController.getInspectionPage);

// 생성 및 삭제는 로그인한 사용자만 가능
router.post('/summary/:summaryId/inspections', isAuthenticated, maintenanceInspectionController.upload.single('attachment'), maintenanceInspectionController.createInspection);
router.post('/summary/:summaryId/inspections/:inspectionId/delete', isAuthenticated, maintenanceInspectionController.deleteInspection);


module.exports = router;