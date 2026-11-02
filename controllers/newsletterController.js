
const transporter = require('../config/mailer');
const db = require('../config/db');
const sanitizeHtml = require('../utils/sanitizeHtml');

// 뉴스레터 작성 페이지 렌더링
exports.getCreatePage = (req, res) => {
    res.render('newsletter/create', {
        message: req.session.message,
        error: req.session.error,
        currentUser: req.session.user,
        page: 'newsletter_create'
    });
    req.session.message = null;
    req.session.error = null;
};

// 뉴스레터 발송 처리
exports.sendNewsletter = async (req, res) => {
    const { subject, content, recipients, newsletterId } = req.body; // newsletterId 추가
    const sanitizedContent = sanitizeHtml(content);

    if (!recipients || recipients.length === 0) {
        req.session.error = '수신자를 선택해주세요.';
        return res.redirect(newsletterId ? `/newsletter/edit/${newsletterId}` : '/newsletter/create');
    }

    try {
        let currentNewsletterId = newsletterId;

        // 1. 뉴스레터 내용 저장 또는 업데이트
        if (currentNewsletterId) {
            // 기존 초안 업데이트
            await db.query('UPDATE tb_newsletters SET subject = ?, content = ?, status = \'sent\' WHERE id = ?', [subject, sanitizedContent, currentNewsletterId]);
        } else {
            // 새 뉴스레터 저장
            const [newsletterResult] = await db.query('INSERT INTO tb_newsletters (subject, content, status) VALUES (?, ?, \'sent\')', [subject, sanitizedContent]);
            currentNewsletterId = newsletterResult.insertId;
        }

        // 2. 기존 수신자 목록 삭제 (중복 방지)
        await db.query('DELETE FROM tb_newsletter_recipients WHERE newsletter_id = ?', [currentNewsletterId]);

        // 3. 각 수신자에게 개인화된 이메일 발송
        for (const recipient of recipients) {
            const personalizedContent = `
                <p>안녕하세요, ${recipient.name || '고객'}님.</p>
                ${sanitizedContent}
                <hr>
                <!--<p style="font-size: 0.8em; color: #888;">
                    본 메일은 이메일 수신에 동의하신 분들께 발송되었습니다.<br>
                     더 이상 수신을 원하지 않으시면 <a href="https://localhost:3443/newsletter/unsubscribe?email=${encodeURIComponent(recipient.email)}">여기</a>를 클릭하여 수신을 거부하실 수 있습니다. 
                </p>-->
            `;

            const mailOptions = {
                from: 'sales@jwonit.com', // 실제 발신자 이메일
                to: recipient.email,
                subject: subject,
                html: personalizedContent
            };

            await transporter.sendMail(mailOptions);
        }

        // 4. 수신자 기록
        const recipientRecords = recipients.map(r => [
            currentNewsletterId,
            r.email,
            r.name || null,
            r.company || null,
            r.is_manual_add === 'true'
        ]);

        if (recipientRecords.length > 0) {
            await db.query('INSERT INTO tb_newsletter_recipients (newsletter_id, recipient_email, recipient_name, recipient_company, is_manual_add) VALUES ?', [recipientRecords]);
        }

        req.session.message = `뉴스레터가 ${recipients.length}명에게 성공적으로 발송되었습니다.`;
        res.redirect('/newsletter/list');

    } catch (err) {
        console.error('뉴스레터 발송 오류:', err);
        req.session.error = '뉴스레터 발송 중 오류가 발생했습니다.';
        res.redirect(newsletterId ? `/newsletter/edit/${newsletterId}` : '/newsletter/create');
    }
};

// 보낸 뉴스레터 목록 페이지 렌더링
exports.getSentNewslettersPage = async (req, res) => {
    try {
        // 모든 상태의 뉴스레터를 가져오도록 쿼리 수정
        const [newsletters] = await db.query('SELECT id, subject, sent_at, status FROM tb_newsletters ORDER BY sent_at DESC');
        res.render('newsletter/list', {
            newsletters: newsletters,
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user,
            page: 'newsletter_list'
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        req.session.error = '보낸 뉴스레터 목록을 불러오는 중 오류가 발생했습니다.';
        res.redirect('/');
    }
};

// 보낸 뉴스레터 상세 보기 페이지 렌더링
exports.getViewNewsletterPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [newsletterRows] = await db.query('SELECT * FROM tb_newsletters WHERE id = ?', [id]);
        const newsletter = newsletterRows[0];

        if (!newsletter) {
            req.session.error = '해당 뉴스레터를 찾을 수 없습니다.';
            return res.redirect('/newsletter/list');
        }

        const [recipientRows] = await db.query('SELECT recipient_email, recipient_name, recipient_company FROM tb_newsletter_recipients WHERE newsletter_id = ?', [id]);
        const recipients = recipientRows;

        res.render('newsletter/view', {
            newsletter: newsletter,
            recipients: recipients,
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user,
            page: 'newsletter_list' // Or 'newsletter_view' if you prefer
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        req.session.error = '뉴스레터 상세 정보를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/newsletter/list');
    }
};

// 수신자 목록 조회 (AJAX 요청용)
exports.getRecipients = async (req, res) => {
    const { customer_type, customer_subtype, contract_status } = req.query;

    try {
        let query = 'SELECT company, name, email, customer_type, customer_subtype, contract_status FROM tb_business_cards WHERE email_opt_in = TRUE AND email IS NOT NULL AND LENGTH(email) > 0';
        const params = [];

        if (customer_type) {
            query += ' AND customer_type = ?';
            params.push(customer_type);
        }
        if (customer_subtype) {
            query += ' AND customer_subtype = ?';
            params.push(customer_subtype);
        }
        if (contract_status) {
            query += ' AND contract_status = ?';
            params.push(contract_status);
        }

        const [optedInUsers] = await db.query(query, params);
        res.json({ success: true, recipients: optedInUsers });
    } catch (err) {
        console.error('수신자 목록 조회 오류:', err);
        res.status(500).json({ success: false, message: '수신자 목록을 불러오는 중 오류가 발생했습니다.' });
    }
};

exports.unsubscribe = async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).send('이메일 주소가 제공되지 않았습니다.');
    }

    try {
        await db.query('UPDATE tb_business_cards SET email_opt_in = FALSE WHERE email = ?', [email]);
        res.send('뉴스레터 수신이 거부되었습니다.');
    } catch (err) {
        console.error('수신 거부 처리 오류:', err);
        res.status(500).send('수신 거부 처리 중 오류가 발생했습니다.');
    }
};

exports.deleteNewsletter = async (req, res) => {
    const { id } = req.params;
    // 관리자만 삭제 가능하도록 체크
    if (!req.session.user || req.session.user.role !== 'admin') {
        req.session.error = '삭제 권한이 없습니다.';
        return res.redirect('/newsletter/list');
    }

    try {
        await db.query('DELETE FROM tb_newsletters WHERE id = ?', [id]);
        req.session.message = '뉴스레터가 삭제되었습니다.';
        res.redirect('/newsletter/list');
    } catch (err) {
        console.error('뉴스레터 삭제 오류:', err);
        req.session.error = '뉴스레터 삭제 중 오류가 발생했습니다.';
        res.redirect('/newsletter/list');
    }
};

exports.saveDraft = async (req, res) => {
    const { subject, content, recipients, newsletterId } = req.body;
    const sanitizedContent = sanitizeHtml(content);

    try {
        let currentNewsletterId = newsletterId;
        if (currentNewsletterId) {
            // 기존 초안 업데이트
            await db.query('UPDATE tb_newsletters SET subject = ?, content = ? WHERE id = ?', [subject, sanitizedContent, currentNewsletterId]);
        } else {
            // 새 초안 저장
            const [result] = await db.query('INSERT INTO tb_newsletters (subject, content, status) VALUES (?, ?, \'draft\')', [subject, sanitizedContent]);
            currentNewsletterId = result.insertId;
        }

        // 수신자 정보도 임시 저장 (recipients가 undefined일 경우 빈 배열로 초기화)
        const actualRecipients = recipients || [];
        await db.query('DELETE FROM tb_newsletter_recipients WHERE newsletter_id = ?', [currentNewsletterId]);
        const recipientRecords = actualRecipients.map(r => [
            currentNewsletterId,
            r.email,
            r.name || null,
            r.company || null,
            r.is_manual_add === 'true'
        ]);

        if (recipientRecords.length > 0) {
            await db.query('INSERT INTO tb_newsletter_recipients (newsletter_id, recipient_email, recipient_name, recipient_company, is_manual_add) VALUES ?', [recipientRecords]);
        }

        req.session.message = '뉴스레터가 임시저장되었습니다.';
        res.redirect(`/newsletter/edit/${currentNewsletterId}`);
    } catch (err) {
        console.error('임시저장 오류:', err);
        req.session.error = '임시저장 중 오류가 발생했습니다.';
        res.redirect(newsletterId ? `/newsletter/edit/${newsletterId}` : '/newsletter/create');
    }
};

exports.getEditNewsletterPage = async (req, res) => {
    const { id } = req.params;
    try {
        const [newsletterRows] = await db.query('SELECT * FROM tb_newsletters WHERE id = ?', [id]);
        const newsletter = newsletterRows[0];

        if (!newsletter || newsletter.status !== 'draft') {
            req.session.error = '수정할 수 없는 뉴스레터입니다.';
            return res.redirect('/newsletter/list');
        }

        const [recipientRows] = await db.query('SELECT * FROM tb_newsletter_recipients WHERE newsletter_id = ?', [id]);

        res.render('newsletter/edit', {
            newsletter,
            recipients: recipientRows,
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user,
            page: 'newsletter_create'
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        req.session.error = '수정 페이지를 불러오는 중 오류가 발생했습니다.';
        res.redirect('/newsletter/list');
    }
};
