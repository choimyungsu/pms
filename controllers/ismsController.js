const db = require('../config/db');
const xlsx = require('xlsx');
const fs = require('fs');

// ISMS 목록 페이지
exports.getAllIsms = async (req, res) => {
    try {
        const query = `
            SELECT 
                a.gubun_no, a.gubun, a.item_no, a.item, a.item_detail,
                b.id as checklist_id, b.checklist
            FROM tb_isms_item a
            LEFT JOIN tb_isms_item_checklist b ON a.item_no = b.item_no
            ORDER BY a.gubun_no, a.item_no, b.id;
        `;
        const [items] = await db.query(query);

        const structuredData = {};
        items.forEach(item => {
            if (!structuredData[item.item_no]) {
                structuredData[item.item_no] = {
                    gubun_no: item.gubun_no,
                    gubun: item.gubun,
                    item_no: item.item_no,
                    item: item.item,
                    item_detail: item.item_detail,
                    checklists: []
                };
            }
            if(item.checklist_id) {
                structuredData[item.item_no].checklists.push({
                    id: item.checklist_id,
                    text: item.checklist
                });
            }
        });

        res.render('isms/index', { 
            user: req.session.user, // req.user 대신 req.session.user 사용
            data: Object.values(structuredData),
            page: 'isms' // for sidebar active state
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 항목 및 체크리스트 추가
exports.createIsms = async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('권한이 없습니다.');
    }
    const { gubun_no, gubun, item_no, item, item_detail, checklist } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const upsertItemQuery = `
            INSERT INTO tb_isms_item (item_no, gubun_no, gubun, item, item_detail)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE gubun_no=VALUES(gubun_no), gubun=VALUES(gubun), item=VALUES(item), item_detail=VALUES(item_detail);
        `;
        await connection.query(upsertItemQuery, [item_no, gubun_no, gubun, item, item_detail]);

        const insertChecklistQuery = 'INSERT INTO tb_isms_item_checklist (item_no, checklist) VALUES (?, ?)';
        await connection.query(insertChecklistQuery, [item_no, checklist]);

        await connection.commit();
        res.redirect('/isms');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        connection.release();
    }
};

// 수정 페이지
exports.editIsmsPage = async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('권한이 없습니다.');
    }
    try {
        const query = `
            SELECT 
                a.gubun_no, a.gubun, a.item_no, a.item, a.item_detail,
                b.id as checklist_id, b.checklist
            FROM tb_isms_item a
            JOIN tb_isms_item_checklist b ON a.item_no = b.item_no
            WHERE b.id = ?;
        `;
        const [rows] = await db.query(query, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).send('Item not found');
        }
        res.render('isms/edit', { user: req.session.user, item: rows[0] }); // req.user 대신 req.session.user 사용
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 항목 및 체크리스트 수정
exports.updateIsms = async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('권한이 없습니다.');
    }
    const { gubun_no, gubun, item_no, item, item_detail, checklist } = req.body;
    const checklist_id = req.params.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const updateItemQuery = `
            UPDATE tb_isms_item SET gubun_no=?, gubun=?, item=?, item_detail=? 
            WHERE item_no=?;
        `;
        await connection.query(updateItemQuery, [gubun_no, gubun, item, item_detail, item_no]);

        const updateChecklistQuery = 'UPDATE tb_isms_item_checklist SET checklist=? WHERE id=?';
        await connection.query(updateChecklistQuery, [checklist, checklist_id]);

        await connection.commit();
        res.redirect('/isms');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        connection.release();
    }
};

// 체크리스트 삭제
exports.deleteIsms = async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('권한이 없습니다.');
    }
    try {
        const query = 'DELETE FROM tb_isms_item_checklist WHERE id = ?';
        await db.query(query, [req.params.id]);
        res.redirect('/isms');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 엑셀 업로드 처리
exports.uploadIsmsExcel = async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('권한이 없습니다.');
    }
    const file = req.file;
    const deleteExisting = req.body.deleteExisting === 'true';

    if (!file) {
        return res.status(400).send('파일이 업로드되지 않았습니다.');
    }

    const connection = await db.getConnection();
    try {
        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        await connection.beginTransaction();

        for (const row of rows) {
            const item_no = row['항목번호'];
            if (!item_no) continue; // 항목번호는 필수

            // 1. tb_isms_item 에 INSERT 또는 UPDATE
            const itemData = {
                gubun_no: row['구분번호'],
                gubun: row['구분'],
                item_no: item_no,
                item: row['항목명'],
                item_detail: row['상세내용']
            };
            const upsertItemQuery = `
                INSERT INTO tb_isms_item (item_no, gubun_no, gubun, item, item_detail)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE gubun_no=VALUES(gubun_no), gubun=VALUES(gubun), item=VALUES(item), item_detail=VALUES(item_detail);
            `;
            // 순서를 보장하기 위해 Object.values 대신 배열을 명시적으로 사용
            const itemValues = [itemData.item_no, itemData.gubun_no, itemData.gubun, itemData.item, itemData.item_detail];
            await connection.query(upsertItemQuery, itemValues);

            // 2. tb_isms_item_checklist 처리
            const checklistText = row['주요 확인사항'];
            if (checklistText) {
                // 기존 체크리스트 삭제 옵션이 켜져있으면 삭제
                if (deleteExisting) {
                    await connection.query('DELETE FROM tb_isms_item_checklist WHERE item_no = ?', [item_no]);
                }

                const checklists = checklistText.split(/\r?\n/).filter(line => line.trim() !== '');
                for (const checklist of checklists) {
                    await connection.query('INSERT INTO tb_isms_item_checklist (item_no, checklist) VALUES (?, ?)', [item_no, checklist.trim()]);
                }
            }
        }

        await connection.commit();
        res.redirect('/isms');

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('엑셀 업로드 중 오류가 발생했습니다.');
    } finally {
        connection.release();
        fs.unlinkSync(file.path); // 임시 파일 삭제
    }
};

// 체크리스트 엑셀 업로드 처리
exports.uploadChecklistExcel = async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('권한이 없습니다.');
    }
    const file = req.file;
    const deleteExisting = req.body.deleteExisting === 'true';

    if (!file) {
        return res.status(400).send('파일이 업로드되지 않았습니다.');
    }

    const connection = await db.getConnection();
    try {
        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        await connection.beginTransaction();

        // 유니크한 item_no 목록을 먼저 처리 (삭제 옵션 때문)
        const itemNos = [...new Set(rows.map(row => row['항목번호']).filter(Boolean))];

        if (deleteExisting) {
            for (const item_no of itemNos) {
                await connection.query('DELETE FROM tb_isms_item_checklist WHERE item_no = ?', [item_no]);
            }
        }

        for (const row of rows) {
            const item_no = row['항목번호'];
            const checklistText = row['주요 확인사항'];

            if (!item_no || !checklistText) continue; // 필수 항목 확인

            const checklists = checklistText.split(/\r?\n/).filter(line => line.trim() !== '');
            for (const checklist of checklists) {
                // 부모 테이블(tb_isms_item)에 item_no가 존재하는지 확인하는 로직을 추가할 수 있으나,
                // 일단 foreign key constraint에 의해 자동으로 실패하도록 둡니다.
                await connection.query('INSERT INTO tb_isms_item_checklist (item_no, checklist) VALUES (?, ?)', [item_no, checklist.trim()]);
            }
        }

        await connection.commit();
        res.redirect('/isms');

    } catch (err) {
        await connection.rollback();
        console.error(err);
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).send(`엑셀 파일에 포함된 항목번호 중 일부가 DB에 존재하지 않습니다. 먼저 ISMS 기준 엑셀 업로드를 통해 항목을 등록해주세요. (오류 항목번호: ${err.sqlMessage.match(/'([^']*)'/g)[0]})`);
        }
        res.status(500).send('체크리스트 엑셀 업로드 중 오류가 발생했습니다.');
    } finally {
        connection.release();
        fs.unlinkSync(file.path); // 임시 파일 삭제
    }
};