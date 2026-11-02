const fs = require('fs');

// 로그 파일 경로
const LOG_FILE = 'debug.log';

// 로그를 파일에 기록하는 헬퍼 함수
const logToFile = (message) => {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' - ' + message + '\n');
};

exports.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        res.locals.user = req.session.user;
        return next();
    }
    res.redirect('/login');
};

exports.isAuthenticatedForApi = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.status(401).json({ message: '로그인이 필요합니다.' });
};

// 'admin' 역할만 허용
exports.isAdmin = (req, res, next) => {
    logToFile('isAdmin middleware triggered.');
    logToFile('  User in session: ' + !!req.session.user);
    if (req.session.user) {
        logToFile('  User role: ' + req.session.user.role);
    }

    if (req.session && req.session.user && req.session.user.role === 'admin') {
        logToFile('  isAdmin: Access granted.');
        return next();
    }
    logToFile('  isAdmin: Access denied.');
    // UI 요청일 경우 에러 페이지 또는 리다이렉트
    if (req.accepts('html')) {
        return res.status(403).send('권한이 없습니다. 시스템 관리자만 접근할 수 있습니다.');
    }
    // API 요청일 경우 JSON 응답
    res.status(403).json({ message: '권한이 없습니다. 시스템 관리자만 접근할 수 있습니다.' });
};

// 'operations_manager' 역할만 허용
exports.isOperationsManager = (req, res, next) => {
    logToFile('isOperationsManager middleware triggered.');
    logToFile('  User in session: ' + !!req.session.user);
    if (req.session.user) {
        logToFile('  User role: ' + req.session.user.role);
    }

    if (req.session && req.session.user && req.session.user.role === 'operations_manager') {
        logToFile('  isOperationsManager: Access granted.');
        return next();
    }
    logToFile('  isOperationsManager: Access denied.');
    if (req.accepts('html')) {
        return res.status(403).send('권한이 없습니다. 운영 관리자만 접근할 수 있습니다.');
    }
    res.status(403).json({ message: '권한이 없습니다. 운영 관리자만 접근할 수 있습니다.' });
};

// 'admin' 또는 'operations_manager' 역할 허용
exports.isOpsOrAdmin = (req, res, next) => {
    logToFile('isOpsOrAdmin middleware triggered.');
    logToFile('  User in session: ' + !!req.session.user);
    if (req.session.user) {
        logToFile('  User role: ' + req.session.user.role);
    }

    if (req.session && req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'operations_manager')) {
        logToFile('  isOpsOrAdmin: Access granted.');
        return next();
    }
    logToFile('  isOpsOrAdmin: Access denied.');
    if (req.accepts('html')) {
        return res.status(403).send('권한이 없습니다. 관리자 또는 운영자만 접근할 수 있습니다.');
    }
    res.status(403).json({ message: '권한이 없습니다. 관리자 또는 운영자만 접근할 수 있습니다.' });
};