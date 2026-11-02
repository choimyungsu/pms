const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer configuration for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'glossary');
        // Ensure the directory exists
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

exports.upload = multer({ storage: storage });

exports.getGlossaryPage = async (req, res) => {
    try {
        res.render('glossary/index', {
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user,
            page: 'glossary'
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error('용어사전 페이지 로드 오류:', err);
        res.status(500).send('서버 오류');
    }
};

exports.getCreateGlossaryPage = (req, res) => {
    res.render('glossary/create', {
        message: req.session.message,
        error: req.session.error,
        currentUser: req.session.user,
        page: 'glossary_create'
    });
    req.session.message = null;
    req.session.error = null;
};

exports.getEditGlossaryPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [terms] = await db.query('SELECT id, term, description, image_path FROM TB_GLOSSARY WHERE id = ?', [id]);
        if (terms.length === 0) {
            req.session.error = '용어를 찾을 수 없습니다.';
            return res.redirect('/glossary');
        }
        res.render('glossary/edit', {
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user,
            term: terms[0],
            page: 'glossary_edit'
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error('용어 수정 페이지 로드 오류:', err);
        req.session.error = '용어 수정 페이지 로드 중 오류가 발생했습니다.';
        res.redirect('/glossary');
    }
};

exports.getGlossaryTerms = async (req, res) => {
    try {
        const { initialChar, searchTerm } = req.query;
        let query = 'SELECT id, term, description, image_path FROM TB_GLOSSARY';
        const queryParams = [];
        const whereClauses = [];

        if (initialChar) {
            whereClauses.push('initial_char = ?');
            queryParams.push(initialChar);
        }

        if (searchTerm) {
            whereClauses.push('(term LIKE ? OR description LIKE ?)');
            queryParams.push(`%${searchTerm}%`);
            queryParams.push(`%${searchTerm}%`);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += ' ORDER BY term';

        const [terms] = await db.query(query, queryParams);
        res.json(terms);
    } catch (err) {
        console.error('용어사전 용어 조회 오류:', err);
        res.status(500).json({ message: '용어 조회 중 오류가 발생했습니다.' });
    }
};

exports.addGlossaryTerm = async (req, res) => {
    const { term, description } = req.body;
    const image_path = req.file ? req.file.filename : null; // This is for the main image, not CKEditor embedded images

    if (!term || !description) {
        req.session.error = '용어와 설명은 필수입니다.';
        return res.redirect('/glossary/create');
    }

    // Determine initial_char based on the first character of the term
    const firstChar = term.charAt(0).toUpperCase();
    let initial_char;
    if (/[A-Z]/.test(firstChar)) {
        initial_char = firstChar;
    } else if (/[가-힣]/.test(firstChar)) {
        const charCode = firstChar.charCodeAt(0);
        // Korean initial consonant ranges (approximate)
        if (charCode >= 0xAC00 && charCode <= 0xD7A3) { // 가-힣
            const unicode = (charCode - 0xAC00);
            const jong = unicode % 28; // 종성
            const jung = ((unicode - jong) / 28) % 21; // 중성
            const cho = (((unicode - jong) / 28) - jung) / 21; // 초성

            const cho_chars = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
            initial_char = cho_chars[cho];
        } else {
            initial_char = '기타'; // Fallback for other Korean characters
        }
    } else {
        initial_char = '기타'; // Fallback for non-alphanumeric/non-Korean
    }

    try {
        const [result] = await db.query(
            'INSERT INTO TB_GLOSSARY (term, initial_char, description, image_path) VALUES (?, ?, ?, ?)',
            [term, initial_char, description, image_path]
        );
        req.session.message = '용어가 성공적으로 등록되었습니다.';
        res.redirect('/glossary');
    } catch (err) {
        console.error('용어 추가 오류:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            req.session.error = '이미 존재하는 용어입니다.';
        } else {
            req.session.error = '용어 추가 중 오류가 발생했습니다.';
        }
        res.redirect('/glossary/create');
    }
};

exports.updateGlossaryTerm = async (req, res) => {
    const { id } = req.params;
    const { term, description, existing_image_path } = req.body;
    const image_path = req.file ? req.file.filename : (existing_image_path || null); // This is for the main image, not CKEditor embedded images

    if (!term || !description) {
        req.session.error = '용어와 설명은 필수입니다.';
        return res.redirect(`/glossary/edit/${id}`);
    }

    // Determine initial_char based on the first character of the term
    const firstChar = term.charAt(0).toUpperCase();
    let initial_char;
    if (/[A-Z]/.test(firstChar)) {
        initial_char = firstChar;
    } else if (/[가-힣]/.test(firstChar)) {
        const charCode = firstChar.charCodeAt(0);
        if (charCode >= 0xAC00 && charCode <= 0xD7A3) {
            const unicode = (charCode - 0xAC00);
            const jong = unicode % 28;
            const jung = ((unicode - jong) / 28) % 21;
            const cho = (((unicode - jong) / 28) - jung) / 21;

            const cho_chars = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
            initial_char = cho_chars[cho];
        } else {
            initial_char = '기타';
        }
    } else {
        initial_char = '기타';
    }

    try {
        // If a new image is uploaded, delete the old one if it exists
        if (req.file && existing_image_path) {
            const oldImagePath = path.join(__dirname, '..', 'uploads', 'glossary', existing_image_path);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        const [result] = await db.query(
            'UPDATE TB_GLOSSARY SET term = ?, initial_char = ?, description = ?, image_path = ? WHERE id = ?',
            [term, initial_char, description, image_path, id]
        );
        if (result.affectedRows === 0) {
            req.session.error = '용어를 찾을 수 없습니다.';
            return res.redirect(`/glossary/edit/${id}`);
        }
        req.session.message = '용어가 성공적으로 업데이트되었습니다.';
        res.redirect('/glossary');
    } catch (err) {
        console.error('용어 업데이트 오류:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            req.session.error = '이미 존재하는 용어입니다.';
        } else {
            req.session.error = '용어 업데이트 중 오류가 발생했습니다.';
        }
        res.redirect(`/glossary/edit/${id}`);
    }
};

exports.deleteGlossaryTerm = async (req, res) => {
    const { id } = req.params;

    try {
        // Get image path before deleting the term
        const [termRows] = await db.query('SELECT image_path FROM TB_GLOSSARY WHERE id = ?', [id]);
        const image_path = termRows[0] ? termRows[0].image_path : null;

        const [result] = await db.query('DELETE FROM TB_GLOSSARY WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '용어를 찾을 수 없습니다.' });
        }

        // Delete the image file if it exists
        if (image_path) {
            const fullImagePath = path.join(__dirname, '..', 'uploads', 'glossary', image_path);
            if (fs.existsSync(fullImagePath)) {
                fs.unlinkSync(fullImagePath);
            }
        }

        res.status(200).json({ message: '용어가 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('용어 삭제 오류:', err);
        res.status(500).json({ message: '용어 삭제 중 오류가 발생했습니다.' });
    }
};

exports.uploadImage = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    // CKEditor expects a 'default' key with the URL to the uploaded image
    res.json({ success: true, filePath: `/uploads/glossary/${req.file.filename}` });
};