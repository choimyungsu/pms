const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/checklist');
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created uploads/checklist directory.');
    } catch (err) {
        console.error('Failed to create uploads/checklist directory:', err);
    }
}

// Render checklist page
exports.getChecklistPage = (req, res) => {
    const user = req.session.user || {};
    res.render('checklist/index', { currentUser: user, isAdmin: user.role === 'admin' });
};

// Category Management
exports.getCategories = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM tb_checklist_categories ORDER BY name');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ message: '카테고리를 불러오는 중 오류가 발생했습니다.' });
    }
};

exports.createCategory = async (req, res) => {
    const { name, parent_id } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO tb_checklist_categories (name, parent_id) VALUES (?, ?)',
            [name, parent_id || null]
        );
        res.status(201).json({ id: result.insertId, name, parent_id });
    } catch (err) {
        console.error('Error creating category:', err);
        res.status(500).json({ message: '카테고리 생성 중 오류가 발생했습니다.' });
    }
};

exports.updateCategory = async (req, res) => {
    const { id } = req.params;
    const { name, parent_id } = req.body;
    try {
        await db.query(
            'UPDATE tb_checklist_categories SET name = ?, parent_id = ? WHERE id = ?',
            [name, parent_id || null, id]
        );
        res.json({ message: '카테고리가 성공적으로 업데이트되었습니다.' });
    } catch (err) {
        console.error('Error updating category:', err);
        res.status(500).json({ message: '카테고리 업데이트 중 오류가 발생했습니다.' });
    }
};

exports.deleteCategory = async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ message: '삭제 권한이 없습니다.' });
    }
    const { id } = req.params;
    try {
        await db.query('DELETE FROM tb_checklist_categories WHERE id = ?', [id]);
        res.json({ message: '카테고리가 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(500).json({ message: '카테고리 삭제 중 오류가 발생했습니다.' });
    }
};

// Checklist Item Management
exports.getChecklistItems = async (req, res) => {
    const { category_id } = req.query;
    try {
        if (!category_id) {
            return res.json([]);
        }

        let query = `
            SELECT 
                c.id, c.title, c.creator_id, u_creator.name as creator_name,
                c.assignee_id, u_assignee.name as assignee_name, c.created_at
            FROM tb_checklists c
            JOIN tb_user u_creator ON c.creator_id = u_creator.id
            LEFT JOIN tb_user u_assignee ON c.assignee_id = u_assignee.id
            WHERE c.category_id = ?
            ORDER BY c.created_at DESC
        `;
        const params = [category_id];
        const [items] = await db.query(query, params);

        for (const item of items) {
            const [attachments] = await db.query(
                'SELECT id, file_path, original_name FROM tb_checklist_attachments WHERE checklist_id = ?',
                [item.id]
            );
            item.attachments = attachments;
        }

        res.json(items);
    } catch (err) {
        console.error('Error fetching checklist items:', err);
        res.status(500).json({ message: '체크리스트를 불러오는 중 오류가 발생했습니다.' });
    }
};

exports.createChecklistItem = async (req, res) => {
    const { category_id, title, content, assignee_id } = req.body;
    const creator_id = req.session.user.id;
    const final_assignee_id = assignee_id || creator_id; // Default to creator if not provided

    try {
        const [result] = await db.query(
            `INSERT INTO tb_checklists (category_id, title, content, creator_id, assignee_id)
             VALUES (?, ?, ?, ?, ?)`,
            [category_id, title, content, creator_id, final_assignee_id]
        );
        const checklistId = result.insertId;

        if (req.files && req.files.length > 0) {
            const attachmentPromises = req.files.map(file => {
                const filePath = '/uploads/checklist/' + file.filename;
                return db.query(
                    `INSERT INTO tb_checklist_attachments (checklist_id, file_path, original_name)
                     VALUES (?, ?, ?)`,
                    [checklistId, filePath, file.originalname]
                );
            });
            await Promise.all(attachmentPromises);
        }

        res.status(201).json({ id: checklistId, message: '체크리스트가 성공적으로 등록되었습니다.' });
    } catch (err) {
        console.error('Error creating checklist item:', err);
        res.status(500).json({ message: '체크리스트 등록 중 오류가 발생했습니다.' });
    }
};

exports.updateChecklistItem = async (req, res) => {
    const { id } = req.params;
    const { category_id, title, content, assignee_id, attachments_to_delete } = req.body;

    try {
        await db.query(
            `UPDATE tb_checklists 
             SET category_id = ?, title = ?, content = ?, assignee_id = ?
             WHERE id = ?`,
            [category_id, title, content, assignee_id, id]
        );

        if (attachments_to_delete) {
            try {
                const parsedAttachmentsToDelete = JSON.parse(attachments_to_delete);
                if (Array.isArray(parsedAttachmentsToDelete) && parsedAttachmentsToDelete.length > 0) {
                    const [filesToDelete] = await db.query(
                        `SELECT file_path FROM tb_checklist_attachments WHERE id IN (?) AND checklist_id = ?`,
                        [parsedAttachmentsToDelete, id]
                    );
                    
                    const deleteFilePromises = filesToDelete.map(file => {
                        const filePath = path.join(__dirname, '../', file.file_path);
                        if (fs.existsSync(filePath)) {
                            return fs.promises.unlink(filePath).catch(err => console.error(`Failed to delete file ${filePath}:`, err));
                        }
                        return Promise.resolve();
                    });
                    await Promise.all(deleteFilePromises);

                    await db.query(
                        `DELETE FROM tb_checklist_attachments WHERE id IN (?) AND checklist_id = ?`,
                        [parsedAttachmentsToDelete, id]
                    );
                }
            } catch (e) {
                console.error('Error parsing attachments_to_delete:', e);
            }
        }

        if (req.files && req.files.length > 0) {
            const attachmentPromises = req.files.map(file => {
                const filePath = '/uploads/checklist/' + file.filename;
                return db.query(
                    `INSERT INTO tb_checklist_attachments (checklist_id, file_path, original_name)
                     VALUES (?, ?, ?)`,
                    [id, filePath, file.originalname]
                );
            });
            await Promise.all(attachmentPromises);
        }

        res.json({ message: '체크리스트가 성공적으로 업데이트되었습니다.' });
    } catch (err) {
        console.error('Error updating checklist item:', err);
        res.status(500).json({ message: '체크리스트 업데이트 중 오류가 발생했습니다.' });
    }
};

exports.deleteChecklistItem = async (req, res) => {
    const { id } = req.params;
    const currentUserId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    try {
        const [items] = await db.query('SELECT creator_id FROM tb_checklists WHERE id = ?', [id]);
        if (items.length === 0) {
            return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
        }

        const item = items[0];
        if (item.creator_id !== currentUserId && !isAdmin) {
            return res.status(403).json({ message: '삭제 권한이 없습니다.' });
        }

        const [attachments] = await db.query(
            'SELECT file_path FROM tb_checklist_attachments WHERE checklist_id = ?', [id]
        );

        const deleteFilePromises = attachments.map(attachment => {
            const filePath = path.join(__dirname, '../', attachment.file_path);
            if (fs.existsSync(filePath)) {
                return fs.promises.unlink(filePath).catch(err => console.error(`Failed to delete file ${filePath}:`, err));
            }
            return Promise.resolve();
        });
        await Promise.all(deleteFilePromises);

        await db.query('DELETE FROM tb_checklist_attachments WHERE checklist_id = ?', [id]);
        await db.query('DELETE FROM tb_checklists WHERE id = ?', [id]);
        res.json({ message: '체크리스트가 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('Error deleting checklist item:', err);
        res.status(500).json({ message: '체크리스트 삭제 중 오류가 발생했습니다.' });
    }
};

exports.getChecklistDetail = async (req, res) => {
    const { id } = req.params;
    const user = req.session.user || {};
    const isAdmin = user.role === 'admin';

    try {
        const [rows] = await db.query(
            `SELECT c.*, u_creator.name as creator_name, u_assignee.name as assignee_name, cat.name as category_name 
             FROM tb_checklists c
             JOIN tb_user u_creator ON c.creator_id = u_creator.id 
             LEFT JOIN tb_user u_assignee ON c.assignee_id = u_assignee.id
             LEFT JOIN tb_checklist_categories cat ON c.category_id = cat.id 
             WHERE c.id = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).render('checklist/detail', {
                error: '체크리스트를 찾을 수 없습니다.', item: null, attachments: [], currentUser: user, isAdmin: isAdmin, page_title: '항목 없음'
            });
        }
        const item = rows[0];

        const [attachments] = await db.query(
            'SELECT id, file_path, original_name FROM tb_checklist_attachments WHERE checklist_id = ?', [id]
        );

        res.render('checklist/detail', {
            item: item, attachments: attachments, error: null, currentUser: user, isAdmin: isAdmin, page_title: item.title
        });
    } catch (err) {
        console.error('Error fetching checklist detail:', err);
        res.status(500).render('checklist/detail', {
            error: '체크리스트 조회 중 오류가 발생했습니다.', item: null, attachments: [], currentUser: user, isAdmin: isAdmin, page_title: '오류'
        });
    }
};

exports.getChecklistEditPage = async (req, res) => {
    const { id } = req.params;
    const user = req.session.user || {};
    const isAdmin = user.role === 'admin';

    try {
        const [rows] = await db.query(
            `SELECT c.*, u.name as creator_name FROM tb_checklists c JOIN tb_user u ON c.creator_id = u.id WHERE c.id = ?`, [id]
        );
        if (rows.length === 0) {
            return res.status(404).render('checklist/edit', { error: '체크리스트를 찾을 수 없습니다.', item: null, categories: [], allUsers: [], attachments: [], currentUser: user, isAdmin: isAdmin, page_title: '항목 없음' });
        }
        const item = rows[0];
        
        // Allow creator or admin to edit
        if (item.creator_id !== user.id && !isAdmin) {
            // Or, you might want to allow the assignee to edit as well
            // if (item.assignee_id !== user.id && item.creator_id !== user.id && !isAdmin)
            return res.status(403).send('Permission denied.');
        }

        const [categories] = await db.query('SELECT id, name, parent_id FROM tb_checklist_categories ORDER BY name');
        const [allUsers] = await db.query('SELECT id, name FROM tb_user');
        const [attachments] = await db.query(
            'SELECT id, file_path, original_name FROM tb_checklist_attachments WHERE checklist_id = ?', [id]
        );

        res.render('checklist/edit', {
            item: item, categories: categories, allUsers: allUsers, attachments: attachments, error: null, currentUser: user, isAdmin: isAdmin, page_title: `체크리스트 수정: ${item.title}`
        });
    } catch (err) {
        console.error('Error fetching checklist for edit:', err);
        res.status(500).render('checklist/edit', { error: '체크리스트를 불러오는 중 오류가 발생했습니다.', item: null, categories: [], allUsers: [], attachments: [], currentUser: user, isAdmin: isAdmin, page_title: '오류' });
    }
};

exports.downloadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const [attachment] = await db.query('SELECT * FROM tb_checklist_attachments WHERE id = ?', [id]);

        if (attachment.length > 0) {
            const filePath = path.join(__dirname, '..', attachment[0].file_path);
            const fileName = attachment[0].original_name;

            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.download(filePath, fileName);
        } else {
            res.status(404).send('파일을 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};