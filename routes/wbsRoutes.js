const express = require('express');
const router = express.Router({ mergeParams: true }); // project_id를 받기 위해 mergeParams: true
const wbsController = require('../controllers/wbsController');
const { isAdmin } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // 엑셀 파일 임시 저장 경로

// WBS 태스크 생성
router.post('/', isAdmin, wbsController.createWbsTask);

// WBS 태스크 이름 변경
router.post('/:task_id/rename', isAdmin, wbsController.updateWbsTaskName);

// WBS 태스크 상세 업데이트 (모달을 통한 전체 업데이트)
router.post('/:task_id', isAdmin, wbsController.updateWbsTaskDetails);

// WBS 태스크 순서 및 부모 변경
router.post('/:task_id/order-parent', isAdmin, wbsController.updateWbsTaskOrderAndParent);

// WBS 태스크 삭제
router.post('/:task_id/delete', isAdmin, wbsController.deleteWbsTask);

// WBS 엑셀 업로드
router.post('/upload-excel', isAdmin, upload.single('wbsExcelFile'), wbsController.uploadWbsExcel);

// 특정 프로젝트의 모든 WBS 태스크 가져오기
router.get('/', wbsController.getWbsTasksForProject);

module.exports = router;