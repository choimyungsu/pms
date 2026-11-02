const express = require('express');
const router = express.Router();
const researchProjectController = require('../controllers/researchProjectController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware is used

// 모든 연구과제 목록 조회
router.get('/', authMiddleware.isAuthenticated, researchProjectController.getResearchProjectList);

// 새 연구과제 등록 페이지 표시
router.get('/create', authMiddleware.isAuthenticated, researchProjectController.getCreateResearchProjectPage);

// 새 연구과제 등록 처리
router.post('/', authMiddleware.isAuthenticated, researchProjectController.createResearchProject);

// 특정 연구과제 상세 조회
router.get('/:id', authMiddleware.isAuthenticated, researchProjectController.getResearchProjectDetails);

// 특정 연구과제 수정 페이지 표시
router.get('/:id/edit', authMiddleware.isAuthenticated, researchProjectController.getEditResearchProjectPage);

// 특정 연구과제 업데이트 처리
router.post('/:id/edit', authMiddleware.isAuthenticated, researchProjectController.updateResearchProject);

// 특정 연구과제 삭제 처리
router.post('/:id/delete', authMiddleware.isAuthenticated, researchProjectController.deleteResearchProject);

module.exports = router;
