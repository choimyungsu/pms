const MaintenanceSupport = require('../models/maintenanceSupport');
const MaintenanceSummary = require('../models/maintenanceSummary');

exports.getSupportLogPage = async (req, res) => {
    const summaryId = req.params.summaryId;
    try {
        const summary = await MaintenanceSummary.findById(summaryId);
        if (!summary) {
            return res.status(404).send('Maintenance summary not found');
        }
        const supportLogs = await MaintenanceSupport.findAllBySummaryId(summaryId);
        
        res.render('maintenance/support_log', {
            summary,
            supportLogs,
            user: req.session.user,
            page_title: '유지보수 지원 이력'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
};

exports.createSupportLog = async (req, res) => {
    const summaryId = req.params.summaryId;
    const { support_date, input_time, support_type, is_direct_commute, work_details } = req.body;
    
    try {
        await MaintenanceSupport.create({
            summary_id: summaryId,
            support_date,
            input_time,
            support_type,
            is_direct_commute: support_type === 'field' ? (is_direct_commute === 'on' ? 1 : 0) : 0,
            work_details,
            creator_id: req.session.user.id
        });
        res.redirect(`/maintenance/summary/${summaryId}/support`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
};

exports.updateSupportLog = async (req, res) => {
    const { id } = req.params;
    const { support_date, input_time, support_type, is_direct_commute, work_details } = req.body;
    
    try {
        const log = await MaintenanceSupport.findById(id);
        if (!log) return res.status(404).send('Log not found');
        
        // Check permission
        if (req.session.user.role !== 'admin' && req.session.user.id !== log.creator_id) {
            return res.status(403).send('Forbidden');
        }
        
        await MaintenanceSupport.update(id, {
            support_date,
            input_time,
            support_type,
            is_direct_commute: support_type === 'field' ? (is_direct_commute === 'on' ? 1 : 0) : 0,
            work_details
        });
        
        res.redirect(`/maintenance/summary/${log.summary_id}/support`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
};

exports.deleteSupportLog = async (req, res) => {
    const { id } = req.params;
    
    try {
        const log = await MaintenanceSupport.findById(id);
        if (!log) return res.status(404).send('Log not found');
        
        // Check permission
        if (req.session.user.role !== 'admin' && req.session.user.id !== log.creator_id) {
            return res.status(403).send('Forbidden');
        }
        
        await MaintenanceSupport.delete(id);
        res.redirect(`/maintenance/summary/${log.summary_id}/support`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
};
