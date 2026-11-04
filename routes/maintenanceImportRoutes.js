const express = require('express');
const router = express.Router();
const importController = require('../controllers/maintenanceImportController');
const { isAuthenticated } = require('../middleware/auth');

/**
 * 유지보수 총괄표 엑셀 일괄 반영
 *
 *  주의: maintenanceRoutes 의 '/:id' 류 라우트보다 먼저 등록되어야 합니다.
 *        (app.js 에서 patchRoutes → importRoutes → maintenanceRoutes 순서)
 */

// 엑셀 분석(미리보기) — DB 변경 없음
router.post(
    '/import/preview',
    isAuthenticated,
    importController.upload.single('excelFile'),
    importController.preview
);

// 실제 DB 반영 (트랜잭션)
router.post('/import/apply', isAuthenticated, importController.apply);

// 반영용 SQL 스크립트 다운로드
router.post('/import/sql', isAuthenticated, importController.downloadSql);

// 임시 업로드 파일 삭제
router.post('/import/discard', isAuthenticated, importController.discard);

// 업로드 양식(템플릿) 다운로드
router.get('/import/template', isAuthenticated, importController.downloadTemplate);

module.exports = router;
