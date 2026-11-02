const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');

// 한글 깨짐 방지용 디코딩 함수
const decodeFileName = (filename) => Buffer.from(filename, 'latin1').toString('utf8');

// Helper function to parse Excel dates
const parseExcelDate = (dateValue) => {
    if (dateValue === null || dateValue === undefined || dateValue === '-' || dateValue.trim() === '') {
        return null;
    }
    // Attempt to parse as a Date object directly if it's already a valid date string
    let date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10); // Format to YYYY-MM-DD
    }

    // Handle MM/DD/YY or MM/DD/YYYY format
    const parts = dateValue.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (parts) {
        let year = parseInt(parts[3], 10);
        // Adjust 2-digit year to 4-digit year (e.g., 25 -> 2025)
        if (year < 100) {
            year = (year < 70) ? 2000 + year : 1900 + year; // Assuming 1970-2069 range
        }
        date = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(date.getTime())) {
            return date.toISOString().slice(0, 10);
        }
    }

    // If all attempts fail, return null
    return null;
};

// Multer setup for file uploads
const uploadDir = path.join(__dirname, '../uploads/maintenance');
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created uploads/maintenance directory.');
    } catch (err) {
        console.error('Failed to create uploads/maintenance directory:', err);
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const decodedName = decodeFileName(file.originalname);
        const base = path.basename(decodedName, ext);
        const safeBase = encodeURIComponent(base).replace(/[^a-zA-Z0-9]/g, '_');
        const safeFilename = `${safeBase}_${Date.now()}${ext}`;
        cb(null, safeFilename);
    }
});
exports.upload = multer({ storage: storage });

// 유지보수 목록 조회
exports.getMaintenanceList = async (req, res) => {
    try {
        const { search, status, page = 1 } = req.query;
        const [users] = await db.query('SELECT id, name, department_id FROM tb_user ORDER BY name');

        const perPage = 20;
        const currentPage = parseInt(page, 10);
        const offset = (currentPage - 1) * perPage;

        let countQuery = 'SELECT COUNT(*) as count FROM tb_maintenance';
        let query = 'SELECT * FROM tb_maintenance';
        const queryParams = [];

        let whereClauses = [];
        if (status === 'closed') {
            whereClauses.push('closed_at IS NOT NULL');
        } else if (status === 'upcoming_due_date') {
            whereClauses.push('closed_at IS NULL AND maintenance_end_date >= CURDATE() AND maintenance_end_date <= DATE_ADD(CURDATE(), INTERVAL 1 MONTH)');
        } else {
            whereClauses.push('closed_at IS NULL');
        }

        if (search) {
            const searchColumns = ['division', 'customer_company', 'project_name', 'item', 'manufacturer', 'model', 'serial_number'];
            const searchClauses = searchColumns.map(col => `${col} LIKE ?`);
            whereClauses.push(`(${searchClauses.join(' OR ')})`);
            queryParams.push(...searchColumns.map(() => `%${search}%`));
        }

        if (whereClauses.length > 0) {
            const whereString = ' WHERE ' + whereClauses.join(' AND ');
            query += whereString;
            countQuery += whereString;
        }

        const [totalRecords] = await db.query(countQuery, queryParams);
        const totalPages = Math.ceil(totalRecords[0].count / perPage);

        query += ` ORDER BY created_at DESC LIMIT ?, ?`;
        queryParams.push(offset, perPage);

        const [rows] = await db.query(query, queryParams);

        res.render('maintenance/list', {
            maintenanceList: rows,
            user: req.session.user,
            page_title: '유지보수 관리',
            page: 'maintenance_detail',
            currentStatus: status || 'open',
            users: users,
            currentUser: req.session.user,
            userColor: req.session.user ? req.session.user.color : '#3788d8',
            search: search,
            currentPage: currentPage,
            totalPages: totalPages
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('서버 오류');
    }
};

// 유지보수 등록 페이지 렌더링
exports.getCreateMaintenancePage = (req, res) => {
    res.render('maintenance/create', {
        user: req.session.user,
        page_title: '유지보수 등록',
        page: 'maintenance'
    });
};

// 유지보수 기록 생성
exports.createMaintenance = async (req, res) => {
    const {
        division, customer_company, project_name, inspection_date, introduction_date,
        maintenance_start_date, maintenance_end_date, item, manufacturer, model,
        eos, eol, serial_number, firmware_version, os_version, quantity,
        back_contract_company, back_contract_details, back_contract_date, back_contract_end_date,
        back_contract_manager, back_contract_contact, back_contract_email,
        main_engineer, sub_engineer, sales_manager, inspection_method,
        maintenance_department_company, maintenance_manager, maintenance_manager_contact,
        maintenance_manager_email, customer_contact_person, customer_contact, customer_email,
        customer_location, inspection_location, quotation_filename, remarks
    } = req.body;

    let attachment_path = null;
    let attachment_original_name = null;

    if (req.file) {
        attachment_path = '/uploads/maintenance/' + req.file.filename;
        attachment_original_name = decodeFileName(req.file.originalname);
    }

    try {
        const query = `
            INSERT INTO tb_maintenance (
                division, customer_company, project_name, inspection_date, introduction_date,
                maintenance_start_date, maintenance_end_date, item, manufacturer, model,
                eos, eol, serial_number, firmware_version, os_version, quantity,
                back_contract_company, back_contract_details, back_contract_date, back_contract_end_date,
                back_contract_manager, back_contract_contact, back_contract_email,
                main_engineer, sub_engineer, sales_manager, inspection_method,
                maintenance_department_company, maintenance_manager, maintenance_manager_contact,
                maintenance_manager_email, customer_contact_person, customer_contact, customer_email,
                customer_location, inspection_location, quotation_filename, remarks,
                attachment_path, attachment_original_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            division, customer_company, project_name, inspection_date || null, introduction_date || null,
            maintenance_start_date || null, maintenance_end_date || null, item, manufacturer, model,
            eos, eol, serial_number, firmware_version, os_version, quantity || null,
            back_contract_company, back_contract_details, back_contract_date || null, back_contract_end_date || null,
            back_contract_manager, back_contract_contact, back_contract_email,
            main_engineer, sub_engineer, sales_manager, inspection_method,
            maintenance_department_company, maintenance_manager, maintenance_manager_contact,
            maintenance_manager_email, customer_contact_person, customer_contact, customer_email,
            customer_location, inspection_location, quotation_filename, remarks,
            attachment_path, attachment_original_name
        ];
        await db.query(query, params);
        res.redirect('/maintenance');
    } catch (error) {
        console.error(error);
        res.status(500).send('서버 오류');
    } finally {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path); // Multer가 저장한 임시 파일 삭제
        }
    }
};

// 유지보수 수정 페이지 렌더링
exports.getEditMaintenancePage = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM tb_maintenance WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('유지보수 기록을 찾을 수 없습니다.');
        }
        res.render('maintenance/edit', {
            maintenance: rows[0],
            user: req.session.user,
            page_title: '유지보수 수정',
            page: 'maintenance'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('서버 오류');
    }
};

// 유지보수 기록 업데이트
exports.updateMaintenance = async (req, res) => {
    const { id } = req.params;
    const {
        division, customer_company, project_name, inspection_date, introduction_date,
        maintenance_start_date, maintenance_end_date, item, manufacturer, model,
        eos, eol, serial_number, firmware_version, os_version, quantity,
        back_contract_company, back_contract_details, back_contract_date, back_contract_end_date,
        back_contract_manager, back_contract_contact, back_contract_email,
        main_engineer, sub_engineer, sales_manager, inspection_method,
        maintenance_department_company, maintenance_manager, maintenance_manager_contact,
        maintenance_manager_email, customer_contact_person, customer_contact, customer_email,
        customer_location, inspection_location, quotation_filename, remarks,
        existing_attachment_path, existing_attachment_original_name // 기존 파일 정보
    } = req.body;

    let attachment_path = existing_attachment_path || null;
    let attachment_original_name = existing_attachment_original_name || null;

    try {
        // 기존 파일 삭제 처리 (새 파일이 업로드되거나 기존 파일이 명시적으로 삭제될 경우)
        if (req.file) {
            // 기존 파일이 있다면 삭제
            if (existing_attachment_path && fs.existsSync(path.join(__dirname, '../', existing_attachment_path))) {
                fs.unlinkSync(path.join(__dirname, '../', existing_attachment_path));
            }
            attachment_path = '/uploads/maintenance/' + req.file.filename;
            attachment_original_name = decodeFileName(req.file.originalname);
        } else if (req.body.delete_attachment === 'true') { // 파일 삭제 체크박스 등이 있을 경우
            if (existing_attachment_path && fs.existsSync(path.join(__dirname, '../', existing_attachment_path))) {
                fs.unlinkSync(path.join(__dirname, '../', existing_attachment_path));
            }
            attachment_path = null;
            attachment_original_name = null;
        }

        const query = `
            UPDATE tb_maintenance SET
                division = ?, customer_company = ?, project_name = ?, inspection_date = ?, introduction_date = ?,
                maintenance_start_date = ?, maintenance_end_date = ?, item = ?, manufacturer = ?, model = ?,
                eos = ?, eol = ?, serial_number = ?, firmware_version = ?, os_version = ?, quantity = ?,
                back_contract_company = ?, back_contract_details = ?, back_contract_date = ?, back_contract_end_date = ?,
                back_contract_manager = ?, back_contract_contact = ?, back_contract_email = ?,
                main_engineer = ?, sub_engineer = ?, sales_manager = ?, inspection_method = ?,
                maintenance_department_company = ?, maintenance_manager = ?, maintenance_manager_contact = ?,
                maintenance_manager_email = ?, customer_contact_person = ?, customer_contact = ?, customer_email = ?,
                customer_location = ?, inspection_location = ?, quotation_filename = ?, remarks = ?,
                attachment_path = ?, attachment_original_name = ?,
        closed_at = ?
            WHERE id = ?
        `;
        const params = [
            division, customer_company, project_name, inspection_date || null, introduction_date || null,
            maintenance_start_date || null, maintenance_end_date || null, item, manufacturer, model,
            eos, eol, serial_number, firmware_version, os_version, quantity || null,
            back_contract_company, back_contract_details, back_contract_date || null, back_contract_end_date || null,
            back_contract_manager, back_contract_contact, back_contract_email,
            main_engineer, sub_engineer, sales_manager, inspection_method,
            maintenance_department_company, maintenance_manager, maintenance_manager_contact,
            maintenance_manager_email, customer_contact_person, customer_contact, customer_email,
            customer_location, inspection_location, quotation_filename, remarks,
            attachment_path, attachment_original_name, req.body.closed_at === 'true' ? new Date() : null, id
        ];
        await db.query(query, params);
        res.redirect('/maintenance');
    } catch (error) {
        console.error(error);
        res.status(500).send('서버 오류');
    } finally {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path); // Multer가 저장한 임시 파일 삭제
        }
    }
};

// 유지보수 기록 종료 처리
exports.closeMaintenance = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE tb_maintenance SET closed_at = NOW() WHERE id = ?', [id]);
        res.status(200).json({ success: true, message: '유지보수 기록이 성공적으로 종료 처리되었습니다.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '유지보수 기록 종료 처리 중 오류가 발생했습니다.' });
    }
};

// 유지보수 기록 삭제
exports.deleteMaintenance = async (req, res) => {
    console.log('User session for delete:', req.session.user);
    console.log('Is Admin:', req.session.user ? req.session.user.role === 'admin' : 'N/A');
    console.log('User Email:', req.session.user ? req.session.user.email : 'N/A');

    // 관리자이거나 특정 이메일(jylee@jwonit.com) 사용자만 삭제 가능
    // if (!req.session.user || (!req.session.user.is_admin && req.session.user.email !== 'jylee@jwonit.com')) {
    //     return res.status(403).send('삭제 권한이 없습니다.');
    // }

    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT attachment_path FROM tb_maintenance WHERE id = ?', [id]);
        if (rows.length > 0 && rows[0].attachment_path) {
            const filePath = path.join(__dirname, '../', rows[0].attachment_path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        await db.query('DELETE FROM tb_maintenance WHERE id = ?', [id]);
        res.status(200).json({ success: true, message: '유지보수 기록이 성공적으로 삭제되었습니다.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '유지보수 기록 삭제 중 오류가 발생했습니다.' });
    }
};

// 첨부파일 다운로드
exports.downloadAttachment = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT attachment_path, attachment_original_name FROM tb_maintenance WHERE id = ?', [id]);
        if (rows.length === 0 || !rows[0].attachment_path) {
            return res.status(404).send('파일을 찾을 수 없습니다.');
        }
        const filePath = path.join(__dirname, '../', rows[0].attachment_path);
        const fileName = rows[0].attachment_original_name || path.basename(filePath);

        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('서버 오류');
    }
};

// 유지보수 엑셀 업로드
exports.uploadMaintenanceExcel = async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' });
    }

    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });

    const maintenanceData = rows.slice(1).map(row => ({
        division: row[0] || null,
        customer_company: row[1] || null,
        project_name: row[2] || null,
        inspection_date: parseExcelDate(row[3]),
        introduction_date: parseExcelDate(row[4]),
        maintenance_start_date: parseExcelDate(row[5]),
        maintenance_end_date: parseExcelDate(row[6]),
        item: row[7] || null,
        manufacturer: row[8] || null,
        model: row[9] || null,
        eos: row[10] || null,
        eol: row[11] || null,
        serial_number: row[12] || null,
        firmware_version: row[13] || null,
        os_version: row[14] || null,
        quantity: row[15] || null,
        back_contract_company: row[16] || null,
        back_contract_details: row[17] || null,
        back_contract_date: parseExcelDate(row[18]),
        back_contract_end_date: parseExcelDate(row[19]),
        back_contract_manager: row[20] || null,
        back_contract_contact: row[21] || null,
        back_contract_email: row[22] || null,
        main_engineer: row[23] || null,
        sub_engineer: row[24] || null,
        sales_manager: row[25] || null,
        inspection_method: row[26] || null,
        maintenance_department_company: row[27] || null,
        maintenance_manager: row[28] || null,
        maintenance_manager_contact: row[29] || null,
        maintenance_manager_email: row[30] || null,
        customer_contact_person: row[31] || null,
        customer_contact: row[32] || null,
        customer_email: row[33] || null,
        customer_location: row[34] || null,
        inspection_location: row[35] || null,
        quotation_filename: row[36] || null,
        remarks: row[37] || null
    }));

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        for (const data of maintenanceData) {
            console.log('--- Debugging Date Values for row ---');
            console.log('inspection_date:', data.inspection_date);
            console.log('introduction_date:', data.introduction_date);
            console.log('maintenance_start_date:', data.maintenance_start_date);
            console.log('maintenance_end_date:', data.maintenance_end_date);
            console.log('back_contract_date:', data.back_contract_date);
            console.log('back_contract_end_date:', data.back_contract_end_date);
            console.log('-------------------------------------');

            const query = `
                INSERT INTO tb_maintenance (
                    division, customer_company, project_name, inspection_date, introduction_date,
                    maintenance_start_date, maintenance_end_date, item, manufacturer, model,
                    eos, eol, serial_number, firmware_version, os_version, quantity,
                    back_contract_company, back_contract_details, back_contract_date, back_contract_end_date,
                    back_contract_manager, back_contract_contact, back_contract_email,
                    main_engineer, sub_engineer, sales_manager, inspection_method,
                    maintenance_department_company, maintenance_manager, maintenance_manager_contact,
                    maintenance_manager_email, customer_contact_person, customer_contact, customer_email,
                    customer_location, inspection_location, quotation_filename, remarks
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    division = VALUES(division), customer_company = VALUES(customer_company), project_name = VALUES(project_name),
                    inspection_date = VALUES(inspection_date), introduction_date = VALUES(introduction_date),
                    maintenance_start_date = VALUES(maintenance_start_date), maintenance_end_date = VALUES(maintenance_end_date),
                    item = VALUES(item), manufacturer = VALUES(manufacturer), model = VALUES(model),
                    eos = VALUES(eos), eol = VALUES(eol), serial_number = VALUES(serial_number),
                    firmware_version = VALUES(firmware_version), os_version = VALUES(os_version), quantity = VALUES(quantity),
                    back_contract_company = VALUES(back_contract_company), back_contract_details = VALUES(back_contract_details),
                    back_contract_date = VALUES(back_contract_date), back_contract_end_date = VALUES(back_contract_end_date),
                    back_contract_manager = VALUES(back_contract_manager), back_contract_contact = VALUES(back_contract_contact),
                    back_contract_email = VALUES(back_contract_email), main_engineer = VALUES(main_engineer),
                    sub_engineer = VALUES(sub_engineer), sales_manager = VALUES(sales_manager), inspection_method = VALUES(inspection_method),
                    maintenance_department_company = VALUES(maintenance_department_company),
                    maintenance_manager = VALUES(maintenance_manager), maintenance_manager_contact = VALUES(maintenance_manager_contact),
                    maintenance_manager_email = VALUES(maintenance_manager_email),
                    customer_contact_person = VALUES(customer_contact_person), customer_contact = VALUES(customer_contact),
                    customer_email = VALUES(customer_email), customer_location = VALUES(customer_location),
                    inspection_location = VALUES(inspection_location), quotation_filename = VALUES(quotation_filename),
                    remarks = VALUES(remarks)
            `;
            const params = [
                data.division, data.customer_company, data.project_name, data.inspection_date,
                data.introduction_date, data.maintenance_start_date, data.maintenance_end_date,
                data.item, data.manufacturer, data.model, data.eos, data.eol, data.serial_number,
                data.firmware_version, data.os_version, data.quantity, data.back_contract_company,
                data.back_contract_details, data.back_contract_date, data.back_contract_end_date,
                data.back_contract_manager, data.back_contract_contact, data.back_contract_email,
                data.main_engineer, data.sub_engineer, data.sales_manager, data.inspection_method,
                data.maintenance_department_company, data.maintenance_manager, data.maintenance_manager_contact,
                data.maintenance_manager_email, data.customer_contact_person, data.customer_contact,
                data.customer_email, data.customer_location, data.inspection_location,
                data.quotation_filename, data.remarks
            ];
            await connection.query(query, params);
        }

        await connection.commit();
        res.redirect('/maintenance');
    } catch (error) {
        await connection.rollback();
        console.error('Error uploading maintenance excel:', error);
        res.status(500).json({ success: false, message: '엑셀 업로드 중 오류가 발생했습니다.' });
    } finally {
        connection.release();
        fs.unlinkSync(file.path);
    }
};

// 유지보수 엑셀 다운로드
exports.downloadMaintenanceExcel = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM tb_maintenance ORDER BY created_at DESC');

        const header = [
            '구분', '고객사', '사업명', '검수일', '도입일', '유지보수시작일', '유지보수종료일', '품목',
            '제조사', '모델', 'EoS', 'EoL', 'S/N', 'Firmware Version', 'OS Version', '수량',
            '백계약업체', '백계약', '백계약일', '백계약종료일', '백계약담당자', '백계약연락처', '백계약이메일',
            '정엔지니어', '부엔지니어', '영업담당', '점검방식', '유지부서업체명', '유지보수담당자',
            '유지부수담장자연락처', '유지보수담당자이메일', '고객담당자', '고객연락처', '고객이메일',
            '고객사위치', '점검위치', '견적파일명', '비고'
        ];

        const data = rows.map(row => [
            row.division, row.customer_company, row.project_name,
            row.inspection_date ? new Date(row.inspection_date).toISOString().slice(0, 10) : '',
            row.introduction_date ? new Date(row.introduction_date).toISOString().slice(0, 10) : '',
            row.maintenance_start_date ? new Date(row.maintenance_start_date).toISOString().slice(0, 10) : '',
            row.maintenance_end_date ? new Date(row.maintenance_end_date).toISOString().slice(0, 10) : '',
            row.item, row.manufacturer, row.model, row.eos, row.eol, row.serial_number,
            row.firmware_version, row.os_version, row.quantity,
            row.back_contract_company, row.back_contract_details,
            row.back_contract_date ? new Date(row.back_contract_date).toISOString().slice(0, 10) : '',
            row.back_contract_end_date ? new Date(row.back_contract_end_date).toISOString().slice(0, 10) : '',
            row.back_contract_manager, row.back_contract_contact, row.back_contract_email,
            row.main_engineer, row.sub_engineer, row.sales_manager, row.inspection_method,
            row.maintenance_department_company, row.maintenance_manager, row.maintenance_manager_contact,
            row.maintenance_manager_email, row.customer_contact_person, row.customer_contact,
            row.customer_email, row.customer_location, row.inspection_location,
            row.quotation_filename, row.remarks
        ]);

        const ws = xlsx.utils.aoa_to_sheet([header, ...data]);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, '유지보수');

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=maintenance_list.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error('Error downloading maintenance excel:', error);
        res.status(500).send('엑셀 다운로드 중 오류가 발생했습니다.');
    }
};

// 유지보수 엑셀 템플릿 다운로드
exports.downloadMaintenanceTemplate = (req, res) => {
    const header = [
        '구분', '고객사', '사업명', '검수일', '도입일', '유지보수시작일', '유지보수종료일', '품목',
        '제조사', '모델', 'EoS', 'EoL', 'S/N', 'Firmware Version', 'OS Version', '수량',
        '백계약업체', '백계약', '백계약일', '백계약종료일', '백계약담당자', '백계약연락처', '백계약이메일',
        '정엔지니어', '부엔지니어', '영업담당', '점검방식', '유지부서업체명', '유지보수담당자',
        '유지부수담장자연락처', '유지보수담당자이메일', '고객담당자', '고객연락처', '고객이메일',
        '고객사위치', '점검위치', '견적파일명', '비고'
    ];

    const ws = xlsx.utils.aoa_to_sheet([header]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, '유지보수_템플릿');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=maintenance_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
};