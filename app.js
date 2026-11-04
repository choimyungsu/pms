const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const session = require('express-session'); // express-session 추가
const flash = require('connect-flash'); // connect-flash 추가
const cookieParser = require('cookie-parser'); // cookie-parser 추가
const cardRoutes = require('./routes/cardRoutes');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes'); // newsletterRoutes 추가
const minutesRoutes = require('./routes/minutesRoutes'); // minutesRoutes 추가
const minutesController = require('./controllers/minutesController'); // minutesController 추가
const scheduleRoutes = require('./routes/scheduleRoutes'); // scheduleRoutes 추가
const patchRoutes = require('./routes/patchRoutes'); // 패치관리 라우트 추가 (maintenanceRoutes 보다 먼저 등록)
const maintenanceImportRoutes = require('./routes/maintenanceImportRoutes'); // 엑셀 일괄 반영 (maintenanceRoutes 보다 먼저)
const maintenanceRoutes = require('./routes/maintenanceRoutes'); // 유지보수 라우트 추가
const maintenanceSummaryRoutes = require('./routes/maintenanceSummaryRoutes');
const maintenanceSupportRoutes = require('./routes/maintenanceSupportRoutes');
const maintenanceInspectionRoutes = require('./routes/maintenanceInspectionRoutes');
const knowledgeRoutes = require('./routes/knowledgeRoutes'); // 지식관리 라우트 추가
const weeklyReportRoutes = require('./routes/weeklyReportRoutes'); // 주간보고 라우트 추가
const projectRoutes = require('./routes/projectRoutes'); // 프로젝트 라우트 추가
const wbsRoutes = require('./routes/wbsRoutes'); // WBS 라우트 추가
const dashboardRoutes = require('./routes/dashboardRoutes'); // 대시보드 라우트 추가
const exitRoutes = require('./routes/exitRoutes'); // 퇴실관리 라우트 추가
const parkingRoutes = require('./routes/parkingRoutes'); // 주차지원 라우트 추가
const memoRoutes = require('./routes/memoRoutes'); // 메모 라우트 추가
const researchLogRoutes = require('./routes/researchLogRoutes'); // 연구일지 라우트 추가
const researchProjectRoutes = require('./routes/researchProjectRoutes'); // 연구과제 라우트 추가
const departmentRoutes = require('./routes/departmentRoutes'); // 부서관리 라우트 추가
const ismsRoutes = require('./routes/ismsRoutes'); // ISMS 라우트 추가
const searchRoutes = require('./routes/searchRoutes'); // 통합검색 라우트 추가
const glossaryRoutes = require('./routes/glossaryRoutes'); // 용어사전 라우트 추가
const issueRoutes = require('./routes/issueRoutes'); // 이슈관리 라우트 추가
const assetRoutes = require('./routes/assetRoutes'); // 자산관리 라우트 추가
const checklistRoutes = require('./routes/checklistRoutes'); // 체크리스트 라우트 추가

const { isAuthenticated, isAdmin } = require('./middleware/auth');
const helmet = require('helmet');

const app = express();
const port = 3000;

// 세션 설정
app.use(session({
    secret: 'your_secret_key', // 실제 배포 시에는 강력한 비밀 키로 변경
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // HTTPS를 사용하지 않는 경우 false로 설정
}));

// cookie-parser 미들웨어 초기화
app.use(cookieParser());

// connect-flash 미들웨어 초기화
app.use(flash());

// request body 사이즈 제한 상향
app.use(express.json({ limit: '50mb' }));  // JSON 데이터
app.use(express.urlencoded({ limit: '50mb', extended: true }));  // form-urlencoded 데이터

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        "code.jquery.com",
        "cdn.jsdelivr.net",
        "cdnjs.cloudflare.com",
        "cdn.datatables.net",
        "cdn.ckeditor.com"
      ],
      "style-src": [
        "'self'",
        "'unsafe-inline'",
        "fonts.googleapis.com",
        "cdnjs.cloudflare.com",
        "cdn.datatables.net",
        "code.jquery.com",
        "cdn.jsdelivr.net",
        "cdn.ckeditor.com"
      ],
      "font-src": ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com", "data:", "cdn.jsdelivr.net"],
      "connect-src": ["'self'", "https://localhost:3443", "http://localhost:3443", "https://cdn.jsdelivr.net", "*.ckeditor.com", "https://cdn.datatables.net"],
      "img-src": ["'self'", "data:", "*.ckeditor.com", "cdnjs.cloudflare.com"],
      "frame-src": ["'self'", "*.ckeditor.com"],
      "script-src-attr": ["'self'", "'unsafe-inline'"],
      "worker-src": ["'self'", "blob:"],
    },
  })
);


// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 인증 라우트 (인증 미들웨어 적용 전)
app.use('/', authRoutes);

// 보호할 라우트에 인증 미들웨어 적용
app.use('/', isAuthenticated, dashboardRoutes);
app.use('/cards', isAuthenticated, cardRoutes);

app.use('/admin', isAuthenticated, adminRoutes);
app.use('/newsletter', newsletterRoutes); // 뉴스레터 라우트 추가
// Temporarily bypass authentication for DOCX download for debugging
app.get('/minutes/download-docx/:id', minutesController.downloadMeetingMinutesAsDocx);
app.use('/minutes', isAuthenticated, minutesRoutes); // 회의록 라우트 추가
app.use('/schedule', isAuthenticated, scheduleRoutes); // 일정 라우트 추가
app.use('/maintenance', isAuthenticated, patchRoutes); // 패치관리 라우트 (유지보수 라우트보다 먼저 등록)
app.use('/maintenance', isAuthenticated, maintenanceImportRoutes); // 엑셀 일괄 반영 (maintenanceRoutes '/:id' 보다 먼저)
app.use('/maintenance', isAuthenticated, maintenanceRoutes); // 유지보수 라우트 추가
app.use('/maintenance', isAuthenticated, maintenanceSummaryRoutes);
app.use('/maintenance', isAuthenticated, maintenanceSupportRoutes);
app.use('/maintenance', isAuthenticated, maintenanceInspectionRoutes);
app.use('/knowledge', isAuthenticated, knowledgeRoutes); // 지식관리 라우트 추가
app.use('/weekly-reports', isAuthenticated, weeklyReportRoutes); // 주간보고 라우트 추가
app.use('/projects', isAuthenticated, projectRoutes); // 프로젝트 라우트 추가
app.use('/projects/:project_id/wbs', isAuthenticated, wbsRoutes); // WBS 라우트 추가
app.use('/exit', isAuthenticated, exitRoutes); // 퇴실관리 라우트 추가
app.use('/parking', isAuthenticated, parkingRoutes); // 주차지원 라우트 연결
app.use('/memo', isAuthenticated, memoRoutes); // 메모 라우트 연결
app.use('/research-log', isAuthenticated, researchLogRoutes); // 연구일지 라우트 연결
app.use('/research-projects', isAuthenticated, researchProjectRoutes); // 연구과제 라우트 연결
app.use('/departments', isAuthenticated, isAdmin, departmentRoutes); // 부서관리 라우트 연결
app.use('/isms', isAuthenticated, ismsRoutes); // ISMS 라우트 연결
app.use('/', isAuthenticated, searchRoutes); // 통합검색 라우트 연결
app.use('/glossary', isAuthenticated, glossaryRoutes); // 용어사전 라우트 연결
app.use('/issues', isAuthenticated, issueRoutes); // 이슈관리 라우트 연결
app.use('/assets', isAuthenticated, assetRoutes); // 자산관리 라우트 연결
app.use('/checklist', isAuthenticated, checklistRoutes); // 체크리스트 라우트 연결


// 패치관리용 컬럼/인덱스 사전 점검 (없을 때만 ALTER, 실패해도 서버는 기동)
const { ensurePatchColumns } = require('./utils/patchSchema');

// SSL/TLS 인증서와 개인 키 읽기
const options = {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem')
};

// 서버 시작
ensurePatchColumns().finally(() => {
  https.createServer(options, app).listen(3443, () => {
    console.log(`서버가 https://localhost:3443 에서 실행 중입니다.`);
  });
});
