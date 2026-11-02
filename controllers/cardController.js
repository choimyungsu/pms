const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs'); // 파일 시스템 모듈 추가
const CardData = require('../models/cardData');
const db = require('../config/db');

// 홈페이지 렌더링
exports.getRegisterCardPage = (req, res) => {
    res.render('cards/register', { title: '명함 인식 프로그램', data: null, currentUser: req.session.user, page: 'card_register' });
};

// 명함 처리
exports.processCard = async (req, res) => {
    if (!req.file) {
        return res.status(400).send('파일이 업로드되지 않았습니다.');
    }

    const imagePath = path.join(__dirname, '../', req.file.path);

    // Tesseract.js를 사용하여 한글과 영어를 인식
    Tesseract.recognize(
        imagePath,
        'kor+eng', // 한국어와 영어 동시 인식
        { logger: m => console.log(m) } // 진행 상황 로깅
    ).then(({ data: { text } }) => {
        // 1. 전체 텍스트 추출
        const rawText = text;

        // 2. 정보 추출 (정규식 활용)
        const structuredData = new CardData();

        structuredData.email = extractInfo(/(?:E|email|이메일)?:?\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i, rawText);
        structuredData.mobile = extractInfo(/(?:M|mobile|핸드폰)?:?\s*(010[\s.-]?\d{4}[\s.-]?\d{4})/i, rawText);
        structuredData.phone = extractInfo(/(?:T|tel|전화)?:?\s*((?:02|0[3-9]{1}[0-9]{1})[\s.-]?\d{3,4}[\s.-]?\d{4})/i, rawText);
        structuredData.fax = extractInfo(/(?:F|fax|팩스)?:?\s*((?:02|0[3-9]{1}[0-9]{1})[\s.-]?\d{3,4}[\s.-]?\d{4})/i, rawText);
        structuredData.website = extractInfo(/(?:W|web|홈페이지)?:?\s*([a-zA-Z0-9.-]+\.(?:com|co\.kr|net|kr|org|go\.kr))/i, rawText);
        // 이름, 회사명 등은 정규식만으로 한계가 있어, 여기서는 간단한 키워드 기반으로 남은 텍스트에서 추출을 시도합니다.
        structuredData.name = extractInfo(/이름?:?\s*([가-힣]{2,5})/, rawText);
        structuredData.company = extractInfo(/(주|유|\(주\)|\(유\))?[\s]*[가-힣a-zA-Z0-9]{2,}/, rawText, true);

        res.render('cards/register', {
            title: '명함 인식 결과',
            data: {
                rawText: rawText,
                structuredData: structuredData,
                imagePath: '/' + req.file.path.replace(/\\/g, '/') // 이미지 경로 추가
            },
            currentUser: req.session.user,
            page: 'card_register'
        });
    }).catch(err => {
        console.error(err);
        res.status(500).send('OCR 처리 중 오류가 발생했습니다.');
    });
};

// 정규식을 이용해 텍스트를 추출하는 헬퍼 함수
function extractInfo(regex, text, takeFirst = false) {
    const match = text.match(regex);
    if (match) {
        // 여러 그룹이 매칭될 경우, 마지막 그룹을 유효한 정보로 간주 (전체 매치 제외)
        return takeFirst ? match[0].trim() : match[match.length - 1].trim();
    }
    return null;
}

// 명함 정보 저장
exports.saveCard = async (req, res) => {
    const { company, name, department, position, email, mobile, phone, fax, website, address, imagePath, memo, customer_type, customer_subtype, manufacturer, contract_status, related_card_ids } = req.body;
    const email_opt_in = req.body.email_opt_in ? true : false;

    if (customer_type === '고객' && !contract_status) {
        return res.status(400).send('고객인 경우 계약여부는 필수입니다.');
    }

    const sql = `INSERT INTO tb_business_cards (company, name, department, position, email, mobile, phone, fax, website, address, image_path, memo, email_opt_in, customer_type, customer_subtype, manufacturer, contract_status, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    let conn;
    try {
        conn = await db.getConnection ? await db.getConnection() : db;
        const [result] = await conn.query(sql, [company, name, department, position, email, mobile, phone, fax, website, address, imagePath, memo, email_opt_in, customer_type, customer_subtype, manufacturer, contract_status, req.session.user.id]);
        const cardId = result.insertId;
        // 관련명함 저장
        if (related_card_ids) {
            const ids = related_card_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
            for (const rid of ids) {
                await conn.query('INSERT INTO tb_card_links (card_id, linked_card_id) VALUES (?, ?)', [cardId, rid]);
            }
        }
        res.redirect('/cards/list');
    } catch (err) {
        console.error(err);
        res.status(500).send('데이터베이스 저장 중 오류가 발생했습니다.');
    } finally { if (conn && conn.release) conn.release(); }
};

// 명함 목록 조회
exports.getCardList = async (req, res) => {
    try {
        // 1. 모든 명함 정보 + 관련명함(이름, 회사) LEFT JOIN
        const [rows] = await db.query(`
            SELECT c.*, 
                   rc.id AS related_id, rc.name AS related_name, rc.company AS related_company
            FROM tb_business_cards c
            LEFT JOIN tb_card_links l ON c.id = l.card_id
            LEFT JOIN tb_business_cards rc ON l.linked_card_id = rc.id
            ORDER BY c.id DESC
        `);
        // 2. 명함별로 관련명함을 묶어서 반환
        const cardMap = {};
        rows.forEach(row => {
            if (!cardMap[row.id]) {
                cardMap[row.id] = {
                    ...row,
                    related_cards: []
                };
            }
            if (row.related_id) {
                cardMap[row.id].related_cards.push({
                    id: row.related_id,
                    name: row.related_name,
                    company: row.related_company
                });
            }
        });
        const cards = Object.values(cardMap);
        res.render('cards/list', { title: '저장된 명함 목록', cards: cards, currentUser: req.session.user, page: 'card_list' });
    } catch (err) {
        console.error(err);
        res.status(500).send('목록을 불러오는 중 오류가 발생했습니다.');
    }
};

// 명함 상세 조회
exports.getCardViewPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM tb_business_cards WHERE id = ?', [id]);
        if (rows.length > 0) {
            const card = rows[0];
            card.created_at = new Date(card.created_at); // Convert to Date object
            // Fetch related cards
            const [related] = await db.query(`
                SELECT rc.id, rc.name, rc.company
                FROM tb_card_links l
                JOIN tb_business_cards rc ON l.linked_card_id = rc.id
                WHERE l.card_id = ?
            `, [id]);
            card.related_cards = related;
            res.render('cards/view', { 
                title: '명함 상세 정보', 
                card: card, 
                currentUser: req.session.user,
                error: req.flash('error'),
                success: req.flash('success'),
                page: 'card_list'
            });
        } else {
            req.flash('error', '명함을 찾을 수 없습니다.');
            res.redirect('/cards/list');
        }
    } catch (err) {
        console.error(err);
        req.flash('error', '명함 정보를 불러오는 중 오류가 발생했습니다.');
        res.redirect('/cards/list');
    }
};

// 수정 페이지 이동
exports.getEditPage = async (req, res) => {
    const { id } = req.params;
    try {
        // 명함 정보 + 관련명함
        const [rows] = await db.query('SELECT * FROM tb_business_cards WHERE id = ?', [id]);
        if (rows.length > 0) {
            const card = rows[0];
            // 관련명함
            const [related] = await db.query(`
                SELECT rc.id, rc.name, rc.company
                FROM tb_card_links l
                JOIN tb_business_cards rc ON l.linked_card_id = rc.id
                WHERE l.card_id = ?
            `, [id]);
            card.related_cards = related;
            res.render('edit', { title: '명함 정보 수정', card: card, currentUser: req.session.user, page: 'card_list' });
        } else {
            res.status(404).send('해당 정보를 찾을 수 없습니다.');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('정보를 불러오는 중 오류가 발생했습니다.');
    }
};

// 명함 정보 업데이트
exports.updateCard = async (req, res) => {
    const { id } = req.params;
    const { company, name, department, position, email, mobile, phone, fax, website, address, memo, oldImagePath, customer_type, customer_subtype, manufacturer, contract_status, related_card_ids } = req.body;
    const email_opt_in = req.body.email_opt_in ? true : false;

    if (customer_type === '고객' && !contract_status) {
        return res.status(400).send('고객인 경우 계약여부는 필수입니다.');
    }

    let imagePath = oldImagePath;
    if (req.file) {
        imagePath = '/' + req.file.path.replace(/\\/g, '/');
        if (oldImagePath && fs.existsSync(path.join(__dirname, '../', oldImagePath))) {
            fs.unlinkSync(path.join(__dirname, '../', oldImagePath));
        }
    }

    const sql = `UPDATE tb_business_cards SET 
                    company = ?, name = ?, department = ?, position = ?, email = ?, 
                    mobile = ?, phone = ?, fax = ?, website = ?, address = ?, 
                    memo = ?, email_opt_in = ?, image_path = ?, customer_type = ?, customer_subtype = ?, manufacturer = ?, contract_status = ?
                 WHERE id = ?`;

    let conn;
    try {
        conn = await db.getConnection ? await db.getConnection() : db;

        const [cardRows] = await conn.query('SELECT userId FROM tb_business_cards WHERE id = ?', [id]);
        const card = cardRows[0];

        if (card.userId !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).send('수정 권한이 없습니다.');
        }

        await conn.query(sql, [company, name, department, position, email, mobile, phone, fax, website, address, memo, email_opt_in, imagePath, customer_type, customer_subtype, manufacturer, contract_status, id]);
        // 관련명함 갱신: 기존 삭제 후 새로 추가
        await conn.query('DELETE FROM tb_card_links WHERE card_id = ?', [id]);
        if (related_card_ids) {
            const ids = related_card_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
            for (const rid of ids) {
                await conn.query('INSERT INTO tb_card_links (card_id, linked_card_id) VALUES (?, ?)', [id, rid]);
            }
        }
        res.redirect('/cards/list');
    } catch (err) {
        console.error(err);
        res.status(500).send('데이터베이스 업데이트 중 오류가 발생했습니다.');
    } finally { if (conn && conn.release) conn.release(); }
};

// 명함 검색 (자동완성용)
exports.searchCards = async (req, res) => {
    const { q } = req.query;
    const currentCardId = req.query.currentId; // 현재 수정 중인 명함 ID

    if (!q) {
        return res.json([]);
    }

    try {
        const searchTerm = `%${q}%`;
        let query = 'SELECT id, name, company FROM tb_business_cards WHERE (name LIKE ? OR company LIKE ?) AND id != ? AND id NOT IN (SELECT linked_card_id FROM tb_card_links WHERE card_id = ?) LIMIT 10';
        let params = [searchTerm, searchTerm, currentCardId, currentCardId];

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error searching cards:', err);
        res.status(500).json({ message: '카드 검색 중 오류가 발생했습니다.' });
    }
};

// 명함 정보 삭제
exports.deleteCard = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT image_path, userId FROM tb_business_cards WHERE id = ?', [id]);
        if (rows.length > 0) {
            const card = rows[0];
            if (card.userId !== req.session.user.id && req.session.user.role !== 'admin') {
                return res.status(403).send('삭제 권한이 없습니다.');
            }

            const imagePath = card.image_path;

            // DB 레코드 삭제
            await db.query('DELETE FROM tb_business_cards WHERE id = ?', [id]);

            // 서버에서 이미지 파일 삭제
            if (imagePath && fs.existsSync(path.join(__dirname, '../', imagePath))) {
                fs.unlinkSync(path.join(__dirname, '../', imagePath));
            }
        }
        res.redirect('/cards/list');
    } catch (err) {
        console.error(err);
        res.status(500).send('정보 삭제 중 오류가 발생했습니다.');
    }
};