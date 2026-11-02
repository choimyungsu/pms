const express = require('express');
const router = express.Router();
const ismsController = require('../controllers/ismsController');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// ISMS 관리 페이지
router.get('/', isAuthenticated, ismsController.getAllIsms);

// 엑셀 업로드
router.post('/upload-excel', isAuthenticated, upload.single('ismsExcel'), ismsController.uploadIsmsExcel);

// 체크리스트 엑셀 업로드
router.post('/upload-checklist-excel', isAuthenticated, upload.single('ismsChecklistExcel'), ismsController.uploadChecklistExcel);

// 항목/체크리스트 추가
router.post('/add', isAuthenticated, ismsController.createIsms);

// 수정 페이지
router.get('/edit/:id', isAuthenticated, ismsController.editIsmsPage);

// 항목/체크리스트 수정
router.post('/edit/:id', isAuthenticated, ismsController.updateIsms);

// 체크리스트 삭제
router.get('/delete/:id', isAuthenticated, ismsController.deleteIsms);

module.exports = router;
