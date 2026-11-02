const bcrypt = require('bcryptjs');
const db = require('../config/db');

// 로그인 페이지 렌더링
exports.getLoginPage = (req, res) => {
    const savedEmail = req.cookies.rememberMeEmail; // 쿠키에서 저장된 이메일 읽기
    res.render('login', { message: req.session.message, savedEmail: savedEmail });
    req.session.message = null; // 메시지 표시 후 초기화
};

// 로그인 처리
exports.loginUser = async (req, res) => {
    const { email, password, rememberMe } = req.body;

    try {
        // role 컬럼을 포함하여 사용자 정보 조회
        const [rows] = await db.query('SELECT * FROM tb_user WHERE email = ?', [email]);
        const user = rows[0];

        if (user && await bcrypt.compare(password, user.password)) {
            // 퇴사 여부 확인
            if (user.is_resigned) {
                req.session.message = '퇴사한 사용자는 로그인할 수 없습니다.';
                return res.redirect('/login');
            }

            // 세션에 is_admin 대신 role 저장
            req.session.user = {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role, // DB에서 직접 가져온 role 값 사용
                color: user.user_color
            };

            // '아이디 기억하기' 기능 구현
            if (rememberMe) {
                res.cookie('rememberMeEmail', email, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true }); // 30일
            } else {
                res.clearCookie('rememberMeEmail');
            }

            res.redirect('/'); // 로그인 성공 시 대시보드로 리다이렉트
        } else {
            req.session.message = '틀린 정보입니다.';
            res.redirect('/login');
        }
    } catch (err) {
        console.error(err);
        req.session.message = '로그인 중 오류가 발생했습니다.';
        res.redirect('/login');
    }
};

// 로그아웃 처리
exports.logoutUser = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err);
            return res.redirect('/');
        }
        res.redirect('/login');
    });
};

// 사용자 정보 변경 페이지 렌더링
exports.getProfilePage = async (req, res) => {
    try {
        // is_admin 대신 role 조회
        const [rows] = await db.query('SELECT id, email, name, role, user_color FROM tb_user WHERE id = ?', [req.session.user.id]);
        if (rows.length > 0) {
            res.render('profile', {
                user: rows[0],
                message: req.session.message,
                error: req.session.error,
                currentUser: req.session.user
            });
            req.session.message = null;
            req.session.error = null;
        } else {
            req.session.error = '사용자 정보를 찾을 수 없습니다.';
            res.redirect('/');
        }
    } catch (err) {
        console.error(err);
        req.session.error = '사용자 정보를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// 사용자 정보 업데이트
exports.updateProfile = async (req, res) => {
    const userId = req.session.user.id;
    const { email, name, user_color, current_password, new_password, confirm_new_password } = req.body;

    try {
        if (!current_password) {
            req.session.error = '현재 비밀번호를 입력해주세요.';
            return res.redirect('/profile');
        }

        const [rows] = await db.query('SELECT password FROM tb_user WHERE id = ?', [userId]);
        const user = rows[0];

        if (!user || !await bcrypt.compare(current_password, user.password)) {
            req.session.error = '현재 비밀번호가 올바르지 않습니다.';
            return res.redirect('/profile');
        }

        if (new_password) {
            if (new_password !== confirm_new_password) {
                req.session.error = '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.';
                return res.redirect('/profile');
            }

            const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
            if (!passwordRegex.test(new_password)) {
                req.session.error = '비밀번호는 최소 8자 이상, 숫자, 대소문자 및 특수문자를 포함해야 합니다.';
                return res.redirect('/profile');
            }
            
            const hashedNewPassword = await bcrypt.hash(new_password, 10);
            await db.query('UPDATE tb_user SET email = ?, name = ?, user_color = ?, password = ? WHERE id = ?', [email, name, user_color, hashedNewPassword, userId]);
        
        } else {
            await db.query('UPDATE tb_user SET email = ?, name = ?, user_color = ? WHERE id = ?', [email, name, user_color, userId]);
        }

        // 세션 정보 업데이트
        req.session.user.email = email;
        req.session.user.name = name;
        req.session.user.color = user_color; 
        req.session.message = '정보가 성공적으로 업데이트되었습니다.';
        res.redirect('/profile');

    } catch (err) {
        console.error(err);
        req.session.error = '정보 업데이트 중 오류가 발생했습니다.';
        res.redirect('/profile');
    }
};

// 색상 사용 가능 여부 확인
exports.checkColorAvailability = async (req, res) => {
    const { color } = req.body;
    const userId = req.session.user.id;

    try {
        const [rows] = await db.query('SELECT COUNT(*) AS count FROM tb_user WHERE user_color = ? AND id != ?', [color, userId]);
        const inUse = rows[0].count > 0;
        res.json({ inUse });
    } catch (err) {
        console.error('Error checking color availability:', err);
        res.status(500).json({ error: '색상 사용 가능 여부 확인 중 오류가 발생했습니다.' });
    }
};
