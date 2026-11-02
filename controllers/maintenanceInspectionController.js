const MaintenanceInspection = require('../models/maintenanceInspection');
const MaintenanceSummary = require('../models/maintenanceSummary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer setup for file uploads
const uploadDir = path.join(__dirname, '../uploads/maintenance');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const base = path.basename(decodedName, ext);
        const safeBase = encodeURIComponent(base).replace(/[^a-zA-Z0-9]/g, '_');
        const safeFilename = `${safeBase}_${Date.now()}${ext}`;
        cb(null, safeFilename);
    }
});
exports.upload = multer({ storage: storage });

// 정기점검 페이지 렌더링
exports.getInspectionPage = async (req, res) => {
    try {
        const { summaryId } = req.params;
        const summary = await MaintenanceSummary.findById(summaryId);
        const inspections = await MaintenanceInspection.findBySummaryId(summaryId);
        res.render('maintenance/inspections', {
            summary,
            inspections,
            user: req.session.user,
            page_title: '정기점검 관리',
            page: 'maintenance_summary'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 정기점검 등록
exports.createInspection = async (req, res) => {
    try {
        const { summaryId } = req.params;
        const { title, inspection_date } = req.body;
        let attachment_path = null;
        let attachment_original_name = null;

        if (req.file) {
            attachment_path = '/uploads/maintenance/' + req.file.filename;
            attachment_original_name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        }

        const inspectionData = {
            summary_id: summaryId,
            title,
            inspection_date,
            attachment_path,
            attachment_original_name,
            creator_id: req.session.user.id
        };

        await MaintenanceInspection.create(inspectionData);
        res.redirect(`/maintenance/summary/${summaryId}/inspections`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 정기점검 삭제
exports.deleteInspection = async (req, res) => {
    try {
        const { summaryId, inspectionId } = req.params;
        const inspection = await MaintenanceInspection.findById(inspectionId);

        if (!inspection) {
            return res.status(404).send('Not Found');
        }

        // Check if user is admin or creator
        if (req.session.user.role === 'admin' || req.session.user.id === inspection.creator_id) {
            // Delete attachment file if it exists
            if (inspection.attachment_path) {
                const filePath = path.join(__dirname, '../', inspection.attachment_path);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            await MaintenanceInspection.delete(inspectionId);
            res.redirect(`/maintenance/summary/${summaryId}/inspections`);
        } else {
            res.status(403).send('Forbidden');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};