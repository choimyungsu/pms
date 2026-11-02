
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cardController = require('../controllers/cardController');

const fs = require('fs');
const path = require('path');

// Multer 설정 (파일 저장을 위해)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/card';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// 라우트 정의
router.get('/register', cardController.getRegisterCardPage);
router.post('/upload', upload.single('businessCard'), cardController.processCard);



router.post('/save', cardController.saveCard);

// 목록 및 수정 관련 라우트
router.get('/list', cardController.getCardList);
router.get('/edit/:id', cardController.getEditPage);
router.get('/:id', cardController.getCardViewPage);
router.post('/update/:id', upload.single('businessCard'), cardController.updateCard);
router.post('/delete/:id', cardController.deleteCard);

// 명함 자동완성 검색 API
router.get('/api/cards/search', cardController.searchCards);

module.exports = router;
