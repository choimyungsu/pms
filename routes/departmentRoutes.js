const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const auth = require('../middleware/auth');

router.get('/', auth.isAdmin, departmentController.getDepartments);
router.post('/create', auth.isAdmin, departmentController.createDepartment);
router.post('/update', auth.isAdmin, departmentController.updateDepartment);
router.post('/delete', auth.isAdmin, departmentController.deleteDepartment);
router.post('/move', auth.isAdmin, departmentController.moveDepartment);
router.get('/users/:departmentId', auth.isAdmin, departmentController.getDepartmentUsers);
router.post('/users/add', auth.isAdmin, departmentController.addUserToDepartment);
router.post('/users/remove', auth.isAdmin, departmentController.removeUserFromDepartment);


module.exports = router;
