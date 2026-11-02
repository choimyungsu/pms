const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Department = sequelize.define('Department', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    parent_id: {
        type: DataTypes.INTEGER,
        references: {
            model: 'tb_dept',
            key: 'id'
        }
    },
    text: {
        type: DataTypes.STRING,
        allowNull: false
    },
    position: {
        type: DataTypes.INTEGER
    }
}, {
    tableName: 'tb_dept',
    timestamps: false
});

module.exports = Department;
