const express = require('express');
const router = express.Router();
const researchLogController = require('../controllers/researchLogController');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// 모든 연구일지 라우트에 로그인 필요
router.use(isAuthenticated);

// 연구일지 목록
router.get('/', researchLogController.getResearchLogList);

// 연구일지 등록
router.get('/create', isAdmin, researchLogController.getCreateResearchLogPage);
router.post('/', isAdmin, researchLogController.createResearchLog);

// 연구일지 상세
router.get('/:id', researchLogController.getResearchLogDetails);

// 연구일지 수정
router.get('/edit/:id', isAdmin, researchLogController.getEditResearchLogPage);
router.post('/update/:id', isAdmin, researchLogController.updateResearchLog);

// 연구일지 삭제
router.post('/delete/:id', isAdmin, researchLogController.deleteResearchLog);

// DOCX 다운로드
router.get('/download-docx/:id', researchLogController.downloadDocx);

module.exports = router;
