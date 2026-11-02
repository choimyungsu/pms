const db = require('../config/db');
const htmlToDocx = require('html-to-docx');
const { JSDOM } = require('jsdom');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'memo');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// List all memos
exports.listMemos = async (req, res) => {
    try {
        const [memos] = await db.query(`
            SELECT m.id, m.title, u.name as creator_name, m.created_at
            FROM tb_memo m
            JOIN tb_user u ON m.creator_id = u.id
            ORDER BY m.created_at DESC
        `);
        res.render('memo/index', {
            memos,
            currentUser: req.session.user,
            page_title: '메모 목록'
        });
    } catch (err) {
        console.error('Error fetching memos:', err);
        res.status(500).send('Internal Server Error');
    }
};

// Show form to create a new memo
exports.createMemoForm = async (req, res) => {
    const projectId = req.query.projectId;
    let selectedProject = null;

    if (projectId) {
        const [projectRows] = await db.query('SELECT id, name FROM tb_projects WHERE id = ?', [projectId]);
        if (projectRows.length > 0) {
            selectedProject = projectRows[0];
        }
    }

    const [projects] = await db.query('SELECT id, name FROM tb_projects ORDER BY name');
    res.render('memo/create', {
        projects,
        selectedProject,
        currentUser: req.session.user,
        page_title: '새 메모 작성'
    });
};

// Store a new memo
exports.createMemo = async (req, res) => {
    const { title, content, project_id } = req.body;
    const creator_id = req.session.user.id;
    try {
        await db.query(
            'INSERT INTO tb_memo (title, content, creator_id, project_id) VALUES (?, ?, ?, ?)',
            [title, content, creator_id, project_id || null]
        );
        res.redirect('/memo');
    } catch (err) {
        console.error('Error creating memo:', err);
        res.status(500).send('Internal Server Error');
    }
};

// View a single memo
exports.viewMemo = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            `SELECT m.*, u.name as creator_name 
             FROM tb_memo m 
             JOIN tb_user u ON m.creator_id = u.id 
             WHERE m.id = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).send('Memo not found');
        }
        const memo = rows[0];
        res.render('memo/view', {
            memo,
            currentUser: req.session.user,
            page_title: memo.title
        });
    } catch (err) {
        console.error('Error fetching memo:', err);
        res.status(500).send('Internal Server Error');
    }
};

// Show form to edit a memo
exports.editMemoForm = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM tb_memo WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Memo not found');
        }
        const memo = rows[0];
        // Authorization check
        if (memo.creator_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).send('Permission Denied');
        }
        const [projects] = await db.query('SELECT id, name FROM tb_projects ORDER BY name');
        res.render('memo/edit', {
            memo,
            projects,
            currentUser: req.session.user,
            page_title: `메모 수정: ${memo.title}`
        });
    } catch (err) {
        console.error('Error fetching memo for edit:', err);
        res.status(500).send('Internal Server Error');
    }
};

// Update a memo
exports.updateMemo = async (req, res) => {
    const { id } = req.params;
    const { title, content, project_id } = req.body;
    try {
        const [rows] = await db.query('SELECT creator_id FROM tb_memo WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Memo not found');
        }
        const memo = rows[0];
        // Authorization check
        if (memo.creator_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).send('Permission Denied');
        }
        await db.query(
            'UPDATE tb_memo SET title = ?, content = ?, project_id = ? WHERE id = ?',
            [title, content, project_id || null, id]
        );
        res.redirect(`/memo/${id}`);
    } catch (err) {
        console.error('Error updating memo:', err);
        res.status(500).send('Internal Server Error');
    }
};

// Delete a memo
exports.deleteMemo = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT creator_id FROM tb_memo WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Memo not found');
        }
        const memo = rows[0];
        // Authorization check
        if (memo.creator_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).send('Permission Denied');
        }
        await db.query('DELETE FROM tb_memo WHERE id = ?', [id]);
        res.redirect('/memo');
    } catch (err) {
        console.error('Error deleting memo:', err);
        res.status(500).send('Internal Server Error');
    }
};

exports.downloadMemoAsDocx = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM tb_memo WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Memo not found');
        }
        const memo = rows[0];

        // --- Start of new image processing logic ---
        const dom = new JSDOM(memo.content);
        const document = dom.window.document;
        const images = document.querySelectorAll('img');
        const imagePromises = [];

        images.forEach(img => {
            const src = img.getAttribute('src');
            // Process only local images
            if (src && src.startsWith('/uploads/')) {
                const promise = (async () => {
                    try {
                        const imagePath = path.join(__dirname, '..', src);
                        if (fs.existsSync(imagePath)) {
                            const imageBuffer = fs.readFileSync(imagePath);
                            const mimeType = path.extname(src).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
                            const base64Image = imageBuffer.toString('base64');
                            img.src = `data:${mimeType};base64,${base64Image}`;
                        }
                    } catch (err) {
                        console.error(`Could not process image ${src}:`, err);
                    }
                })();
                imagePromises.push(promise);
            }
        });

        await Promise.all(imagePromises);
        const processedContent = dom.window.document.body.innerHTML;
        // --- End of new image processing logic ---

        // Add inline styles to table elements for docx conversion
        let contentWithTableStyles = processedContent.replace(/<table/g, '<table style="border: 1px solid black; border-collapse: collapse;"');
        contentWithTableStyles = contentWithTableStyles.replace(/<th/g, '<th style="border: 1px solid black; border-collapse: collapse; padding: 8px;"');
        contentWithTableStyles = contentWithTableStyles.replace(/<td/g, '<td style="border: 1px solid black; border-collapse: collapse; padding: 8px;"');

        const htmlString = `
            <h1>${memo.title}</h1>
            <div>${contentWithTableStyles}</div>
        `;

        const fileBuffer = await htmlToDocx(htmlString, null, {
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        });

        const sanitizedTitle = memo.title.replace(/[\\/:*?"<>|]/g, '_');
        const filename = `${sanitizedTitle}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(fileBuffer);
    } catch (err) {
        console.error('Error downloading memo as docx:', err);
        res.status(500).send('Internal Server Error');
    }
};

// Middleware for handling single image uploads
exports.uploadImageMiddleware = upload.single('image');

// Handle pasted image upload
exports.uploadPastedImage = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const filePath = '/uploads/memo/' + req.file.filename;
    res.json({ success: true, filePath: filePath });
};

exports.handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        return res.status(500).json({ success: false, message: `Multer error: ${err.message}` });
    } else if (err) {
        // An unknown error occurred when uploading.
        return res.status(500).json({ success: false, message: `Unknown upload error: ${err.message}` });
    }
    // Everything went fine.
    next();
};
