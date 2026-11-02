const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/knowledge');
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created uploads/knowledge directory.');
    } catch (err) {
        console.error('Failed to create uploads/knowledge directory:', err);
    }
}

// Render knowledge management page
exports.getKnowledgePage = (req, res) => {
    const user = req.session.user || {};
    res.render('knowledge/index', { currentUser: user, isAdmin: user.role === 'admin' });
};

// Category Management
exports.getCategories = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM tb_knowledge_categories ORDER BY name');
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
            'INSERT INTO tb_knowledge_categories (name, parent_id) VALUES (?, ?)',
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
            'UPDATE tb_knowledge_categories SET name = ?, parent_id = ? WHERE id = ?',
            [name, parent_id || null, id]
        );
        res.json({ message: '카테고리가 성공적으로 업데이트되었습니다.' });
    } catch (err) {
        console.error('Error updating category:', err);
        res.status(500).json({ message: '카테고리 업데이트 중 오류가 발생했습니다.' });
    }
};

exports.deleteCategory = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM tb_knowledge_categories WHERE id = ?', [id]);
        res.json({ message: '카테고리가 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(500).json({ message: '카테고리 삭제 중 오류가 발생했습니다.' });
    }
};

// Knowledge Item Management
exports.getKnowledgeItems = async (req, res) => {
    const { category_id } = req.query;
    const user = req.session.user || {};
    const isAdmin = user.role === 'admin';

    try {
        if (!category_id) {
            return res.json([]);
        }

        let query = `
            SELECT 
                k.id, k.title, k.type, k.status, k.creator_id, u.name as creator_name, 
                k.assignee, k.start_date, k.end_date, k.planned_date, k.created_at
            FROM tb_knowledge k
            JOIN tb_user u ON k.creator_id = u.id
            WHERE k.category_id = ?
        `;
        const params = [category_id];

        if (!isAdmin) {
            query += `
                AND k.id NOT IN (
                    SELECT knowledge_id FROM tb_project_knowledge_links
                )
            `;
        }
        query += ` ORDER BY k.created_at DESC`;

        const [items] = await db.query(query, params);

        for (const item of items) {
            const [attachments] = await db.query(
                'SELECT id, file_path, original_name FROM tb_knowledge_attachments WHERE knowledge_id = ?',
                [item.id]
            );
            item.attachments = attachments;
        }

        res.json(items);
    } catch (err) {
        console.error('Error fetching knowledge items:', err);
        res.status(500).json({ message: '지식 정보를 불러오는 중 오류가 발생했습니다.' });
    }
};

exports.createKnowledgeItem = async (req, res) => {
    const {
        category_id, title, type, description1, description2,
        status, assignee, start_date, end_date, planned_date
    } = req.body;
    const creator_id = req.session.user.id;

    try {
        const [result] = await db.query(
            `INSERT INTO tb_knowledge 
             (category_id, title, type, description1, description2, status, creator_id, assignee, 
              start_date, end_date, planned_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) `,
            [
                category_id, title, type, description1, description2, status, creator_id, assignee,
                start_date || null, end_date || null, planned_date || null
            ]
        );
        const knowledgeId = result.insertId;

        if (req.files && req.files.length > 0) {
            const attachmentPromises = req.files.map(file => {
                const filePath = '/uploads/knowledge/' + file.filename;
                return db.query(
                    `INSERT INTO tb_knowledge_attachments (knowledge_id, file_path, original_name)
                     VALUES (?, ?, ?) `,
                    [knowledgeId, filePath, file.originalname]
                );
            });
            await Promise.all(attachmentPromises);
        }

        res.status(201).json({ id: knowledgeId, message: '지식 정보가 성공적으로 등록되었습니다.' });
    } catch (err) {
        console.error('Error creating knowledge item:', err);
        res.status(500).json({ message: '지식 정보 등록 중 오류가 발생했습니다.' });
    }
};

exports.updateKnowledgeItem = async (req, res) => {
    const { id } = req.params;
    const {
        category_id, title, type, description1, description2,
        status, assignee, start_date, end_date, planned_date,
        attachments_to_delete
    } = req.body;

    try {
        await db.query(
            `UPDATE tb_knowledge 
             SET category_id = ?, title = ?, type = ?, description1 = ?, description2 = ?, status = ?, 
                 assignee = ?, start_date = ?, end_date = ?, planned_date = ?
             WHERE id = ? `,
            [
                category_id, title, type, description1, description2, status,
                assignee, start_date || null, end_date || null, planned_date || null,
                id
            ]
        );

        if (attachments_to_delete) {
            try {
                const parsedAttachmentsToDelete = JSON.parse(attachments_to_delete);
                if (Array.isArray(parsedAttachmentsToDelete) && parsedAttachmentsToDelete.length > 0) {
                    const [filesToDelete] = await db.query(
                        `SELECT file_path FROM tb_knowledge_attachments WHERE id IN (?) AND knowledge_id = ? `,
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
                        `DELETE FROM tb_knowledge_attachments WHERE id IN (?) AND knowledge_id = ? `,
                        [parsedAttachmentsToDelete, id]
                    );
                }
            } catch (e) {
                console.error('Error parsing attachments_to_delete:', e);
            }
        }

        if (req.files && req.files.length > 0) {
            const attachmentPromises = req.files.map(file => {
                const filePath = '/uploads/knowledge/' + file.filename;
                return db.query(
                    `INSERT INTO tb_knowledge_attachments (knowledge_id, file_path, original_name)
                     VALUES (?, ?, ?) `,
                    [id, filePath, file.originalname]
                );
            });
            await Promise.all(attachmentPromises);
        }

        res.json({ message: '지식 정보가 성공적으로 업데이트되었습니다.' });
    } catch (err) {
        console.error('Error updating knowledge item:', err);
        res.status(500).json({ message: '지식 정보 업데이트 중 오류가 발생했습니다.' });
    }
};

exports.deleteKnowledgeItem = async (req, res) => {
    const { id } = req.params;
    const creator_id = req.session.user.id;

    try {
        const [itemRows] = await db.query(
            'SELECT creator_id FROM tb_knowledge WHERE id = ?', [id]
        );
        if (itemRows.length === 0) {
            return res.status(404).json({ message: '지식 정보를 찾을 수 없습니다.' });
        }

        const item = itemRows[0];
        if (item.creator_id !== creator_id && req.session.user.role !== 'admin') {
            return res.status(403).json({ message: '삭제 권한이 없습니다.' });
        }

        const [attachments] = await db.query(
            'SELECT file_path FROM tb_knowledge_attachments WHERE knowledge_id = ?', [id]
        );

        const deleteFilePromises = attachments.map(attachment => {
            const filePath = path.join(__dirname, '../', attachment.file_path);
            if (fs.existsSync(filePath)) {
                return fs.promises.unlink(filePath).catch(err => console.error(`Failed to delete file ${filePath}:`, err));
            }
            return Promise.resolve();
        });
        await Promise.all(deleteFilePromises);

        await db.query('DELETE FROM tb_knowledge_attachments WHERE knowledge_id = ?', [id]);

        await db.query('DELETE FROM tb_knowledge WHERE id = ?', [id]);
        res.json({ message: '지식 정보가 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('Error deleting knowledge item:', err);
        res.status(500).json({ message: '지식 정보 삭제 중 오류가 발생했습니다.' });
    }
};

exports.getKnowledgeDetail = async (req, res) => {
    const { id } = req.params;
    const user = req.session.user || {};
    const isAdmin = user.role === 'admin';

    try {
        const [rows] = await db.query(
            `SELECT k.*, u.name as creator_name, c.name as category_name 
             FROM tb_knowledge k 
             JOIN tb_user u ON k.creator_id = u.id 
             LEFT JOIN tb_knowledge_categories c ON k.category_id = c.id 
             WHERE k.id = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).render('knowledge/detail', {
                error: '지식 정보를 찾을 수 없습니다.',
                item: null,
                attachments: [],
                currentUser: user,
                isAdmin: isAdmin,
                page_title: '지식 정보 없음'
            });
        }
        const item = rows[0];

        const [attachments] = await db.query(
            'SELECT id, file_path, original_name FROM tb_knowledge_attachments WHERE knowledge_id = ?',
            [id]
        );

        const [categories] = await db.query('SELECT id, name, parent_id FROM tb_knowledge_categories ORDER BY name');

        res.render('knowledge/detail', {
            item: item,
            attachments: attachments,
            categories: categories,
            error: null,
            currentUser: user,
            isAdmin: isAdmin,
            page_title: item.title
        });
    } catch (err) {
        console.error('Error fetching knowledge detail:', err);
        res.status(500).render('knowledge/detail', {
            error: '지식 정보 조회 중 오류가 발생했습니다.',
            item: null,
            attachments: [],
            currentUser: user,
            isAdmin: isAdmin,
            page_title: '오류'
        });
    }
};

exports.getKnowledgeEditPage = async (req, res) => {
    const { id } = req.params;
    const user = req.session.user || {};
    const isAdmin = user.role === 'admin';

    try {
        const [rows] = await db.query(
            `SELECT k.*, u.name as creator_name FROM tb_knowledge k JOIN tb_user u ON k.creator_id = u.id WHERE k.id = ? `,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).render('knowledge/edit', { error: '지식 정보를 찾을 수 없습니다.', item: null, categories: [], types: [], allUsers: [], attachments: [], currentUser: user, isAdmin: isAdmin, page_title: '지식 정보 없음' });
        }
        const item = rows[0];

        if (item.creator_id !== user.id && !isAdmin) {
            return res.status(403).send('Permission denied.');
        }

        const [categories] = await db.query('SELECT id, name, parent_id FROM tb_knowledge_categories ORDER BY name');
        const [types] = await db.query('SELECT DISTINCT type FROM tb_knowledge WHERE type IS NOT NULL AND type != \'\' ORDER BY type');
        const [allUsers] = await db.query('SELECT id, name FROM tb_user');
        const [attachments] = await db.query(
            'SELECT id, file_path, original_name FROM tb_knowledge_attachments WHERE knowledge_id = ?',
            [id]
        );

        res.render('knowledge/edit', {
            item: item,
            categories: categories,
            types: types.map(row => row.type),
            allUsers: allUsers,
            attachments: attachments,
            error: null,
            currentUser: user,
            isAdmin: isAdmin,
            page_title: `지식 수정: ${item.title}`
        });
    } catch (err) {
        console.error('Error fetching knowledge for edit:', err);
        res.status(500).render('knowledge/edit', { error: '지식 자료를 불러오는 중 오류가 발생했습니다.', item: null, categories: [], types: [], allUsers: [], attachments: [], currentUser: user, isAdmin: isAdmin, page_title: '오류' });
    }
};

// Comment Management
exports.getComments = async (req, res) => {
    const { id } = req.params;
    try {
        const [comments] = await db.query(
            `SELECT c.id, c.content, c.created_at, c.user_id, u.name as author
             FROM tb_knowledge_comments c
             JOIN tb_user u ON c.user_id = u.id
             WHERE c.knowledge_id = ?
             ORDER BY c.created_at DESC`,
            [id]
        );
        res.json(comments);
    } catch (err) {
        console.error('Error fetching comments:', err);
        res.status(500).json({ message: '댓글을 불러오는 중 오류가 발생했습니다.' });
    }
};

exports.addComment = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    const user_id = req.session.user.id;

    if (!content) {
        return res.status(400).json({ message: '댓글 내용이 필요합니다.' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO tb_knowledge_comments (knowledge_id, user_id, content) VALUES (?, ?, ?)',
            [id, user_id, content]
        );
        const commentId = result.insertId;
        const [newComment] = await db.query(
            `SELECT c.id, c.content, c.created_at, u.name as author
             FROM tb_knowledge_comments c
             JOIN tb_user u ON c.user_id = u.id
             WHERE c.id = ?`,
            [commentId]
        );
        res.status(201).json(newComment[0]);
    } catch (err) {
        console.error('Error adding comment:', err);
        res.status(500).json({ message: '댓글 추가 중 오류가 발생했습니다.' });
    }
};

exports.deleteComment = async (req, res) => {
    const { commentId } = req.params;
    const user_id = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    try {
        const [commentRows] = await db.query('SELECT user_id FROM tb_knowledge_comments WHERE id = ?', [commentId]);
        if (commentRows.length === 0) {
            return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
        }

        const comment = commentRows[0];
        if (comment.user_id !== user_id && !isAdmin) {
            return res.status(403).json({ message: '삭제 권한이 없습니다.' });
        }

        await db.query('DELETE FROM tb_knowledge_comments WHERE id = ?', [commentId]);
        res.json({ message: '댓글이 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('Error deleting comment:', err);
        res.status(500).json({ message: '댓글 삭제 중 오류가 발생했습니다.' });
    }
};

exports.downloadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const [attachment] = await db.query('SELECT * FROM tb_knowledge_attachments WHERE id = ?', [id]);

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

exports.updateComment = async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;
    const user_id = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    if (!content) {
        return res.status(400).json({ message: '댓글 내용이 필요합니다.' });
    }

    try {
        const [commentRows] = await db.query('SELECT user_id FROM tb_knowledge_comments WHERE id = ?', [commentId]);
        if (commentRows.length === 0) {
            return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
        }

        const comment = commentRows[0];
        if (comment.user_id !== user_id && !isAdmin) {
            return res.status(403).json({ message: '수정 권한이 없습니다.' });
        }

        await db.query('UPDATE tb_knowledge_comments SET content = ? WHERE id = ?', [content, commentId]);
        res.json({ message: '댓글이 성공적으로 수정되었습니다.' });
    } catch (err) {
        console.error('Error updating comment:', err);
        res.status(500).json({ message: '댓글 수정 중 오류가 발생했습니다.' });
    }
};
