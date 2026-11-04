const MaintenanceSummary = require('../models/maintenanceSummary');
const pool = require('../config/db'); // Direct pool import
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Multer setup for file uploads
const uploadDir = path.join(__dirname, '../uploads/maintenance_summary');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let destDir = uploadDir;
        if (file.fieldname === 'excelFile') {
            destDir = path.join(__dirname, '../uploads/maintenance');
        }
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        cb(null, destDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const base = path.basename(decodedName, ext);
        const safeBase = encodeURIComponent(base).replace(/[^a-zA-Z0-9]/g, '_');
        const safeFilename = `${Date.now()}_${safeBase}${ext}`;
        file.decodedName = decodedName; // Store decoded name for later use
        cb(null, safeFilename);
    }
});
exports.uploadAttachments = multer({ storage: storage });
exports.uploadExcel = multer({ storage: storage });

// 요약 등록 페이지 렌더링
exports.getCreateSummaryPage = (req, res) => {
    res.render('maintenance/create_summary', {
        user: req.session.user,
        page_title: '유지보수(요약) 등록',
        page: 'maintenance_summary'
    });
};

// 요약 정보 생성
exports.createSummary = async (req, res) => {
    try {
        // 품목 관련 폼 필드(item_names[], manufacturers[], item_versions[], item_details[])는
        // tb_maintenance_summary_items 에 따로 저장하므로 요약 테이블 데이터에서 제거합니다.
        // (배열 그대로 UPDATE/INSERT ... SET ? 에 넘기면 mysql2 가 콤마로 전개해 SQL 문법 오류 발생)
        const body = MaintenanceSummary.stripItemFields(req.body);
        const { cost, items, ...otherData } = body;

        const summaryData = {
            ...otherData,
            creator_id: req.session.user.id
        };

        // Only admin can set cost
        if (req.session.user.role === 'admin' && cost) {
            summaryData.cost = cost;
        }

        const summaryId = await MaintenanceSummary.create(summaryData);

        // Add multiple items
        if (items) {
            const parsedItems = Array.isArray(items) ? items : JSON.parse(items);
            if (parsedItems.length > 0) {
                await MaintenanceSummary.addItems(summaryId, parsedItems);
            }
        }

        if (req.files) {
            for (const file of req.files) {
                await MaintenanceSummary.addAttachment(summaryId, `uploads/maintenance_summary/${file.filename}`, file.decodedName);
            }
        }

        res.status(201).json({ message: 'Successfully created summary.', summaryId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// 요약 리스트 페이지
exports.listSummary = async (req, res) => {
    try {
        const summaries = await MaintenanceSummary.findAll();
        for (let summary of summaries) {
            summary.items = await MaintenanceSummary.findItemsBySummaryId(summary.id);
        }

        // 기술1팀, 기술2팀, 기술3팀의 사용자 목록 가져오기
        const [teamUsers] = await pool.query(`
            SELECT u.id, u.name, d.text as dept_name 
            FROM tb_user u 
            JOIN tb_dept d ON u.department_id = d.id 
            WHERE d.text IN ('기술1팀', '기술2팀', '기술3팀')
            ORDER BY d.text, u.name
        `);

        const teams = {
            '기술1팀': teamUsers.filter(u => u.dept_name === '기술1팀'),
            '기술2팀': teamUsers.filter(u => u.dept_name === '기술2팀'),
            '기술3팀': teamUsers.filter(u => u.dept_name === '기술3팀')
        };

        res.render('maintenance/summary_list', { 
            summaries, 
            teams,
            user: req.session.user,
            page_title: '유지보수(요약)',
            page: 'maintenance_summary' 
        });
    } catch (error) {
        console.error('Error in listSummary:', error);
        res.status(500).send('Server Error: ' + error.message);
    }
};

// 요약 정보 상세 보기
exports.getSummaryById = async (req, res) => {
    try {
        const { id } = req.params;
        const summary = await MaintenanceSummary.findById(id);
        if (!summary) {
            return res.status(404).send('Not Found');
        }
        res.render('maintenance/summary_show', { 
            summary, 
            user: req.session.user,
            page_title: '유지보수(요약) 상세',
            page: 'maintenance_summary' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 요약 수정 페이지 렌더링
exports.getEditSummaryPage = async (req, res) => {
    try {
        const { id } = req.params;
        const summary = await MaintenanceSummary.findById(id);
        if (!summary) {
            return res.status(404).send('Not Found');
        }
        
        res.render('maintenance/edit_summary', { 
            summary, 
            user: req.session.user,
            page_title: '유지보수(요약) 수정',
            page: 'maintenance_summary' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 요약 정보 업데이트
exports.updateSummary = async (req, res) => {
    try {
        const { id } = req.params;
        // 품목 폼 필드(item_names[], manufacturers[], item_versions[], item_details[])는
        // 배열로 파싱되므로 요약 테이블 UPDATE 대상에서 반드시 제거해야 합니다.
        // (배열을 SET ? 에 넘기면 mysql2 가 콤마로 전개 → ER_PARSE_ERROR)
        const body = MaintenanceSummary.stripItemFields(req.body);
        const { attachments_to_delete, cost, items, remarks, ...otherData } = body;
        const summary = await MaintenanceSummary.findById(id);

        if (!summary) {
            return res.status(404).json({ message: 'Not Found' });
        }

        const isAdmin = req.session.user.role === 'admin';
        const isOpsManager = req.session.user.role === 'operations_manager';
        const isCreator = req.session.user.id === summary.creator_id;

        let summaryData = {};

        if (isAdmin || isOpsManager || isCreator) {
            // Full update allowed for these roles
            summaryData = { ...otherData, remarks };

            // Only admin can set cost
            if (isAdmin) {
                summaryData.cost = cost;
            }

            await MaintenanceSummary.update(id, summaryData);

            // Update items: delete existing and add new ones
            if (items) {
                const parsedItems = Array.isArray(items) ? items : JSON.parse(items);
                await MaintenanceSummary.deleteItemsBySummaryId(id);
                if (parsedItems.length > 0) {
                    await MaintenanceSummary.addItems(id, parsedItems);
                }
            }
        } else {
            // Limited update for others: only remarks
            summaryData = { remarks };
            await MaintenanceSummary.update(id, summaryData);
        }

        // Attachments and deletions are allowed for anyone who can access this page
        if (attachments_to_delete && attachments_to_delete.length > 0) {
            const attachmentIds = JSON.parse(attachments_to_delete);
            for (const attachmentId of attachmentIds) {
                const attachment = summary.attachments.find(att => att.id == attachmentId);
                if (attachment) {
                    try {
                        await fs.promises.unlink(path.join(__dirname, '..', attachment.file_path));
                        await MaintenanceSummary.deleteAttachment(attachmentId);
                    } catch (err) {
                        console.error(`Error deleting file ${attachment.file_path}:`, err);
                    }
                }
            }
        }

        if (req.files) {
            for (const file of req.files) {
                await MaintenanceSummary.addAttachment(id, `uploads/maintenance_summary/${file.filename}`, file.decodedName);
            }
        }

        res.json({ message: 'Successfully updated summary.', summaryId: id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// 요약 정보 삭제
exports.deleteSummary = async (req, res) => {
    try {
        const { id } = req.params;
        const summary = await MaintenanceSummary.findById(id);
        if (!summary) {
            return res.status(404).send('Not Found');
        }
        if (req.session.user.role !== 'admin' && req.session.user.role !== 'operations_manager' && req.session.user.id !== summary.creator_id) {
            return res.status(403).send('Forbidden');
        }
        await MaintenanceSummary.delete(id);
        res.redirect('/maintenance/summary');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// Simple helper to strip HTML tags
const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '');
};

// 엑셀 다운로드
exports.downloadMaintenanceSummaryExcel = async (req, res) => {
    try {
        const summaries = await MaintenanceSummary.findAll();
        const isAdmin = req.session.user.role === 'admin';

        // Fetch items for each summary
        for (let summary of summaries) {
            summary.items = await MaintenanceSummary.findItemsBySummaryId(summary.id);
        }

        const header = [
            '구분', '고객사', '사업명', '유지보수시작일', '유지보수종료일', '품목', '정엔지니어', '부엔지니어', '영업담당', '점검방식', '고객담당자', '고객연락처', '고객이메일', '점검위치', '비고'
        ];
        if (isAdmin) {
            header.splice(3, 0, '비용');
        }

        const data = summaries.map(summary => {
            const itemsString = summary.items.map(i => `${i.item_name}(${i.item_detail || ''})`).join(', ');
            const row = [
                summary.division, summary.customer_company, summary.project_name,
                summary.maintenance_start_date, summary.maintenance_end_date, itemsString,
                summary.main_engineer, summary.sub_engineer, summary.sales_manager,
                summary.inspection_method, summary.customer_contact_person, summary.customer_contact,
                summary.customer_email, summary.inspection_location, stripHtml(summary.remarks)
            ];
            if (isAdmin) {
                row.splice(3, 0, summary.cost);
            }
            return row;
        });

        const ws = xlsx.utils.aoa_to_sheet([header, ...data]);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, '유지보수_요약');

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=maintenance_summary_list.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error('Error downloading maintenance summary excel:', error);
        res.status(500).send('엑셀 다운로드 중 오류가 발생했습니다.');
    }
};

// 엑셀 템플릿 다운로드
exports.downloadMaintenanceSummaryTemplate = (req, res) => {
    const isAdmin = req.session.user.role === 'admin';
    const header = [
        '구분', '고객사', '사업명', '유지보수시작일', '유지보수종료일', '품목', '정엔지니어', '부엔지니어', '영업담당', '점검방식', '고객담당자', '고객연락처', '고객이메일', '점검위치', '비고'
    ];
    if (isAdmin) {
        header.splice(3, 0, '비용');
    }

    const ws = xlsx.utils.aoa_to_sheet([header]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, '유지보수_요약_템플릿');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=maintenance_summary_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
};

// 엑셀 업로드
exports.uploadMaintenanceSummaryExcel = async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' });
    }

    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
    const isAdmin = req.session.user.role === 'admin';

    const summaryData = rows.slice(1).map(row => {
        const data = {
            division: row[0] || null,
            customer_company: row[1] || null,
            project_name: row[2] || null,
        };
        
        let offset = 0;
        if (isAdmin) {
            data.cost = row[3] || null;
            offset = 1;
        }

        data.maintenance_start_date = row[3 + offset] ? new Date(row[3 + offset]).toISOString().slice(0, 10) : null;
        data.maintenance_end_date = row[4 + offset] ? new Date(row[4 + offset]).toISOString().slice(0, 10) : null;
        data.item = row[5 + offset] || null;
        data.main_engineer = row[6 + offset] || null;
        data.sub_engineer = row[7 + offset] || null;
        data.sales_manager = row[8 + offset] || null;
        data.inspection_method = row[9 + offset] || null;
        data.customer_contact_person = row[10 + offset] || null;
        data.customer_contact = row[11 + offset] || null;
        data.customer_email = row[12 + offset] || null;
        data.inspection_location = row[13 + offset] || null;
        data.remarks = row[14 + offset] || null;
        
        return data;
    });

    try {
        for (const data of summaryData) {
            data.creator_id = req.session.user.id;
            await MaintenanceSummary.create(data);
        }
        res.redirect('/maintenance/summary');
    } catch (error) {
        console.error('Error uploading maintenance summary excel:', error);
        res.status(500).json({ success: false, message: '엑셀 업로드 중 오류가 발생했습니다.' });
    } finally {
        fs.unlinkSync(file.path);
    }
};

exports.downloadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const attachment = await MaintenanceSummary.getAttachmentById(id);

        if (!attachment) {
            return res.status(404).send('파일을 찾을 수 없습니다.');
        }

        const filePath = path.join(__dirname, '..', attachment.file_path);
        const fileName = attachment.file_name; // Use the stored original file name

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('파일이 존재하지 않습니다.');
        }

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.download(filePath, fileName);
    } catch (error) {
        console.error('Error downloading maintenance summary attachment:', error);
        res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
    }
};