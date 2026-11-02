const express = require('express');
const router = express.Router();
const issueController = require('../controllers/issueController');
const { isAuthenticated } = require('../middleware/auth');

// 이슈 목록
router.get('/', isAuthenticated, issueController.listIssues);

// 이슈 등록 페이지 (가장 먼저 와야 함)
router.get('/create', isAuthenticated, issueController.showCreateForm);

// 이슈 상세 보기
router.get('/:id', isAuthenticated, issueController.getIssueDetails);

// 이슈 생성
router.post('/', isAuthenticated, issueController.createIssue);

// 이슈 수정 페이지
router.get('/:id/edit', isAuthenticated, issueController.showEditForm);

// 이슈 업데이트
router.post('/:id/update', isAuthenticated, issueController.updateIssue);

// 이슈 삭제
router.post('/:id/delete', isAuthenticated, issueController.deleteIssue);

module.exports = router;
