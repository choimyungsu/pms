const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { isAuthenticated, isAdmin, isOpsOrAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Multer setup for knowledge file uploads
const knowledgeStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/knowledge');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const hash = crypto.createHash('sha256').update(decodedName).digest('hex');
        const ext = path.extname(decodedName);
        const safeFilename = `${hash}_${Date.now()}${ext}`;
        cb(null, safeFilename);
    }
});
const knowledgeUpload = multer({ storage: knowledgeStorage });

const handleKoreanFileNames = (req, res, next) => {
    if (req.files) {
        req.files.forEach(file => {
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        });
    }
    next();
};

const upload = multer({ dest: 'uploads/' }); // 기존 WBS 업로드용

// 프로젝트 목록
router.get('/', projectController.getProjectList);

// 프로젝트 등록 페이지
router.get('/create', isAuthenticated, projectController.getCreateProjectPage);
router.post('/create', isAuthenticated, projectController.createProject);

// 지식 관리 문서 검색
router.get('/knowledge/search', projectController.searchKnowledge);
router.get('/knowledge/categories', projectController.getKnowledgeCategories);
router.get('/knowledge/types', projectController.getKnowledgeTypes);

// 프로젝트 상세 및 사용자 관리
router.get('/:id', projectController.getProjectDetails);
router.post('/:id/users', isAdmin, projectController.assignUserToProject);
router.post('/:id/users/remove', isAdmin, projectController.removeUserFromProject);

// 프로젝트와 지식 문서 연결/해제
router.post('/:id/knowledge', projectController.linkKnowledgeToProject);
router.delete('/:id/knowledge/:knowledge_id', projectController.unlinkKnowledgeFromProject);

// 새 지식 자료 등록 및 프로젝트에 연결
router.post('/:id/knowledge/create-and-link', knowledgeUpload.array('attachments', 10), handleKoreanFileNames, projectController.createAndLinkKnowledge);

// 프로젝트 수정 및 삭제
router.get('/edit/:id', isAuthenticated, projectController.getEditProjectPage);
router.post('/update/:id', isAuthenticated, projectController.updateProject);
router.post('/delete/:id', isAuthenticated, projectController.deleteProject);

// WBS 엑셀 템플릿 다운로드
router.get('/wbs/template/download', projectController.downloadWbsTemplate);

// WBS 엑셀 업로드
router.post('/:id/wbs/upload-excel', isAdmin, upload.single('wbsExcelFile'), projectController.uploadWbsExcel);

// WBS 엑셀 다운로드
router.get('/:id/wbs/download', projectController.downloadWbsExcel);

// Gantt Chart
router.get('/:id/gantt', projectController.renderGanttChart);

module.exports = router;