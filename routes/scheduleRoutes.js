const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const { isAuthenticated } = require('../middleware/auth');

// 일정 페이지 렌더링
router.get('/', isAuthenticated, scheduleController.getSchedulePage);

// 일정 생성 페이지 렌더링
router.get('/create', isAuthenticated, scheduleController.getCreatePage);

// 일정 조회 (API)
router.get('/api/events', isAuthenticated, scheduleController.getEvents);

// 부서 조회 (API)
router.get('/api/departments', isAuthenticated, scheduleController.getDepartments);

// 일정 추가 (API)
router.post('/api/events', isAuthenticated, scheduleController.addEvent);

// 일정 수정 (API)
router.put('/api/events/:id', isAuthenticated, scheduleController.updateEvent);

// 단일 일정 조회 (API)
router.get('/api/events/:id', isAuthenticated, scheduleController.getEventById);

// 일정 삭제 (API)
router.delete('/api/events/:id', isAuthenticated, scheduleController.deleteEvent);

module.exports = router;