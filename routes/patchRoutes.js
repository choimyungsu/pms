const express = require('express');
const router = express.Router();
const patchController = require('../controllers/patchController');
const { isAuthenticated } = require('../middleware/auth');

// 패치관리 목록
// 주의: '/patch' 하위 경로는 반드시 maintenanceRoutes 의 '/:id' 류 라우트보다 앞에 등록되어야 함
router.get('/patch', isAuthenticated, patchController.getPatchList);

// 조건(품목/버전 복수 선택) 적용 → 해당 항목 patch_required = 1
router.post('/patch/apply-condition', isAuthenticated, patchController.applyCondition);

// 개별 체크 토글 (AJAX)
router.post('/patch/toggle/:id', isAuthenticated, patchController.togglePatchRequired);

// 전체 패치필요 초기화
router.post('/patch/reset', isAuthenticated, patchController.resetPatchRequired);

// 엑셀 다운로드 (현재 필터 조건 그대로 반영)
router.get('/patch/download-excel', isAuthenticated, patchController.downloadPatchExcel);

// 조건 UI 미리보기 (선택 조건에 매칭되는 건수, AJAX)
router.get('/patch/preview-count', isAuthenticated, patchController.previewCount);

// 조건 UI 옵션(JSON)
router.get('/patch/options', isAuthenticated, patchController.getOptions);

module.exports = router;
