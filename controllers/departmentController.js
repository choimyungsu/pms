const db = require('../config/db');

exports.getDepartments = async (req, res) => {
    try {
        const [departments] = await db.query('SELECT id, parent_id as parent, text FROM tb_dept ORDER BY position');
        // jstree format requires parent to be '#' for root nodes
        const formattedDepartments = departments.map(d => ({...d, parent: d.parent || '#'}));
        res.json(formattedDepartments);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.createDepartment = async (req, res) => {
    try {
        const { text, parent_id } = req.body;
        const parent = parent_id === '#' ? null : parent_id;
        const [result] = await db.query('INSERT INTO tb_dept (text, parent_id) VALUES (?, ?)', [text, parent]);
        res.json({ id: result.insertId, text: text, parent: parent_id });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.updateDepartment = async (req, res) => {
    try {
        const { id, text } = req.body;
        await db.query('UPDATE tb_dept SET text = ? WHERE id = ?', [text, id]);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.deleteDepartment = async (req, res) => {
    try {
        const { id } = req.body;
        // You might want to handle child departments before deleting
        await db.query('DELETE FROM tb_dept WHERE id = ?', [id]);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.moveDepartment = async (req, res) => {
    try {
        const { id, parent_id, position } = req.body;
        const parent = parent_id === '#' ? null : parent_id;
        await db.query('UPDATE tb_dept SET parent_id = ?, position = ? WHERE id = ?', [parent, position, id]);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.getDepartmentUsers = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const [users] = await db.query('SELECT id, name, email FROM tb_user WHERE department_id = ?', [departmentId]);
        res.json(users);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.addUserToDepartment = async (req, res) => {
    try {
        const { userId, departmentId } = req.body;
        await db.query('UPDATE tb_user SET department_id = ? WHERE id = ?', [departmentId, userId]);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.removeUserFromDepartment = async (req, res) => {
    try {
        const { userId } = req.body;
        await db.query('UPDATE tb_user SET department_id = null WHERE id = ?', [userId]);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error.message);
    }
};