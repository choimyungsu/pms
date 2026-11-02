const db = require('../config/db');
const XLSX = require('xlsx');
const fs = require('fs');

// Helper function to build WBS tree with depth limit
function buildWbsTree(tasks, parentId = null, currentDepth = 0, maxDepth = 5) {
    if (currentDepth >= maxDepth) {
        return [];
    }

    const children = tasks.filter(task => task.parent_id === parentId)
                          .sort((a, b) => a.order_index - b.order_index);

    return children.map(task => ({
        ...task,
        depth: currentDepth,
        children: buildWbsTree(tasks, task.id, currentDepth + 1, maxDepth)
    }));
}

// WBS 태스크 생성
exports.createWbsTask = async (req, res) => {
    const { project_id } = req.params;
    const { parent_id, task_name, start_date, end_date, progress, assigned_user_id } = req.body;

    let duration = null;
    if (start_date && end_date) {
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        const diffTime = Math.abs(endDateObj - startDateObj);
        duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    try {
        // Determine the order_index for the new task
        let order_index = 0;
        if (parent_id) {
            const [maxOrder] = await db.query(
                'SELECT MAX(order_index) as max_order FROM tb_wbs_tasks WHERE project_id = ? AND parent_id = ?',
                [project_id, parent_id]
            );
            order_index = (maxOrder[0].max_order !== null) ? maxOrder[0].max_order + 1 : 0;
        } else {
            const [maxOrder] = await db.query(
                'SELECT MAX(order_index) as max_order FROM tb_wbs_tasks WHERE project_id = ? AND parent_id IS NULL',
                [project_id]
            );
            order_index = (maxOrder[0].max_order !== null) ? maxOrder[0].max_order + 1 : 0;
        }

        const [result] = await db.query(
            'INSERT INTO tb_wbs_tasks (project_id, parent_id, task_name, start_date, end_date, duration, progress, assigned_user_id, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [project_id, parent_id || null, task_name, start_date, end_date, duration, progress, assigned_user_id || null, order_index]
        );

        // Fetch updated WBS tasks and return them in a hierarchical structure
        const [wbsTasks] = await db.query('SELECT t.*, u.name as assigned_user_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id WHERE t.project_id = ? ORDER BY t.parent_id ASC, t.order_index ASC', [project_id]);
        const wbsTree = buildWbsTree(wbsTasks);

        res.json({ success: true, wbsTasks: wbsTree, newTaskId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'WBS 태스크 생성 중 오류 발생' });
    }
};

// WBS 태스크 이름 업데이트
exports.updateWbsTaskName = async (req, res) => {
    const { project_id, task_id } = req.params;
    const { task_name } = req.body;

    try {
        await db.query(
            'UPDATE tb_wbs_tasks SET task_name = ? WHERE id = ? AND project_id = ?',
            [task_name, task_id, project_id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '태스크 이름 변경 중 오류 발생' });
    }
};

// WBS 태스크 상세 업데이트 (모달)
exports.updateWbsTaskDetails = async (req, res) => {
    if (!req.body) {
        console.error('updateWbsTaskDetails: req.body is', req.body, 'req.headers:', req.headers);
        return res.status(400).json({ message: '요청 body가 없습니다.', debug: { headers: req.headers } });
    }
    const { project_id, task_id } = req.params;
    const { parent_id, task_name, start_date, end_date, progress, assigned_user_id } = req.body;

    let duration = null;
    if (start_date && end_date) {
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        const diffTime = Math.abs(endDateObj - startDateObj);
        duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    try {
        await db.query(
            'UPDATE tb_wbs_tasks SET parent_id = ?, task_name = ?, start_date = ?, end_date = ?, duration = ?, progress = ?, assigned_user_id = ? WHERE id = ? AND project_id = ?',
            [parent_id || null, task_name, start_date, end_date, duration, progress, assigned_user_id || null, task_id, project_id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'WBS 태스크 업데이트 중 오류 발생' });
    }
};

// WBS 태스크 삭제
exports.deleteWbsTask = async (req, res) => {
    const { project_id, task_id } = req.params;
    try {
        // Get all children tasks recursively
        const getChildrenIds = async (id) => {
            const [children] = await db.query('SELECT id FROM tb_wbs_tasks WHERE parent_id = ?', [id]);
            let ids = [id];
            for (const child of children) {
                ids = ids.concat(await getChildrenIds(child.id));
            }
            return ids;
        };

        const idsToDelete = await getChildrenIds(task_id);

        await db.query('DELETE FROM tb_wbs_tasks WHERE id IN (?) AND project_id = ?', [idsToDelete, project_id]);

        // Re-index siblings after deletion
        const [wbsTasks] = await db.query('SELECT t.*, u.name as assigned_user_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id WHERE t.project_id = ? ORDER BY t.parent_id ASC, t.order_index ASC', [project_id]);
        const wbsTree = buildWbsTree(wbsTasks);

        res.json({ success: true, wbsTasks: wbsTree });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'WBS 태스크 삭제 중 오류 발생' });
    }
};

// WBS 태스크 순서 및 부모 변경
exports.updateWbsTaskOrderAndParent = async (req, res) => {
    const { project_id, task_id } = req.params;
    const { new_parent_id, new_order_index } = req.body; // new_order_index is the target index within the new parent's children

    try {
        await db.beginTransaction();

        // Get the task being moved
        const [taskToMoveRows] = await db.query('SELECT * FROM tb_wbs_tasks WHERE id = ? AND project_id = ?', [task_id, project_id]);
        if (taskToMoveRows.length === 0) {
            await db.rollback();
            return res.status(404).json({ success: false, message: '태스크를 찾을 수 없습니다.' });
        }
        const taskToMove = taskToMoveRows[0];
        const oldParentId = taskToMove.parent_id;
        const oldOrderIndex = taskToMove.order_index;

        // If parent changes, or order changes within the same parent
        if (oldParentId !== new_parent_id || oldOrderIndex !== new_order_index) {
            // 1. Re-index old siblings (if parent changed or moved within same parent)
            if (oldParentId !== new_parent_id) { // Parent changed
                await db.query(
                    'UPDATE tb_wbs_tasks SET order_index = order_index - 1 WHERE project_id = ? AND parent_id = ? AND order_index > ?',
                    [project_id, oldParentId, oldOrderIndex]
                );
            } else { // Moved within same parent
                if (new_order_index < oldOrderIndex) { // Moved up
                    await db.query(
                        'UPDATE tb_wbs_tasks SET order_index = order_index + 1 WHERE project_id = ? AND parent_id = ? AND order_index >= ? AND order_index < ?',
                        [project_id, oldParentId, new_order_index, oldOrderIndex]
                    );
                } else { // Moved down
                    await db.query(
                        'UPDATE tb_wbs_tasks SET order_index = order_index - 1 WHERE project_id = ? AND parent_id = ? AND order_index <= ? AND order_index > ?',
                        [project_id, oldParentId, new_order_index, oldOrderIndex]
                    );
                }
            }

            // 2. Re-index new siblings to make space for the moved task
            await db.query(
                'UPDATE tb_wbs_tasks SET order_index = order_index + 1 WHERE project_id = ? AND parent_id = ? AND order_index >= ?',
                [project_id, new_parent_id, new_order_index]
            );

            // 3. Update the moved task's parent_id and order_index
            await db.query(
                'UPDATE tb_wbs_tasks SET parent_id = ?, order_index = ? WHERE id = ? AND project_id = ?',
                [new_parent_id || null, new_order_index, task_id, project_id]
            );
        }

        await db.commit();

        // Fetch updated WBS tasks and return them in a hierarchical structure
        const [wbsTasks] = await db.query('SELECT t.*, u.name as assigned_user_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id WHERE t.project_id = ? ORDER BY t.parent_id ASC, t.order_index ASC', [project_id]);
        const wbsTree = buildWbsTree(wbsTasks);

        res.json({ success: true, wbsTasks: wbsTree });
    } catch (err) {
        await db.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'WBS 태스크 순서 및 부모 변경 중 오류 발생' });
    }
};


// WBS 엑셀 업로드
exports.uploadWbsExcel = async (req, res) => {
    const { project_id } = req.params;
    if (!req.file) {
        return res.status(400).json({ success: false, message: '업로드된 파일이 없습니다.' });
    }

    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // 임시 파일 삭제
        fs.unlinkSync(req.file.path);

        // 데이터베이스 트랜잭션 시작
        await db.beginTransaction();

        // 기존 WBS 태스크 삭제 (선택 사항, 필요에 따라 주석 처리)
        await db.query('DELETE FROM tb_wbs_tasks WHERE project_id = ?', [project_id]);

        let currentOrderIndex = 0;
        // 엑셀 데이터 삽입
        for (const row of data) {
            const task_name = row['Task Name'];
            const parent_id = row['Parent ID'] || null; // Assuming Excel can provide parent ID
            const start_date = row['Start Date'] ? new Date(row['Start Date']) : null;
            const end_date = row['End Date'] ? new Date(row['End Date']) : null;
            const progress = row['Progress'] || 0;
            const assigned_user_id = row['Assigned User ID'] || null;

            let duration = null;
            if (start_date && end_date) {
                const startDateObj = new Date(start_date);
                const endDateObj = new Date(end_date);
                const diffTime = Math.abs(endDateObj - startDateObj);
                duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            }

            // For simplicity in Excel upload, assign sequential order_index
            // A more robust solution would involve parsing depth from Excel and assigning order_index accordingly
            await db.query(
                'INSERT INTO tb_wbs_tasks (project_id, parent_id, task_name, start_date, end_date, duration, progress, assigned_user_id, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [project_id, parent_id, task_name, start_date, end_date, duration, progress, assigned_user_id, currentOrderIndex++]
            );
        }

        await db.commit();

        // Fetch updated WBS data and return them in a hierarchical structure
        const [wbsTasks] = await db.query('SELECT t.*, u.name as assigned_user_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id WHERE t.project_id = ? ORDER BY t.parent_id ASC, t.order_index ASC', [project_id]);
        const wbsTree = buildWbsTree(wbsTasks);

        res.json({ success: true, wbsTasks: wbsTree });

    } catch (err) {
        await db.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: '엑셀 업로드 및 처리 중 오류 발생' });
    }
};

// 프로젝트의 모든 WBS 태스크 가져오기 (계층 구조로 반환)
exports.getWbsTasksForProject = async (req, res) => {
    const { project_id } = req.params;
    try {
        const [wbsTasks] = await db.query('SELECT t.*, u.name as assigned_user_name FROM tb_wbs_tasks t LEFT JOIN tb_user u ON t.assigned_user_id = u.id WHERE t.project_id = ? ORDER BY t.parent_id ASC, t.order_index ASC', [project_id]);
        const wbsTree = buildWbsTree(wbsTasks);
        res.json({ success: true, wbsTasks: wbsTree });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'WBS 태스크를 가져오는 중 오류 발생' });
    }
};