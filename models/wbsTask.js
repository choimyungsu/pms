class WbsTask {
    constructor(id, project_id, parent_id, task_name, start_date, end_date, duration, progress, assigned_user_id) {
        this.id = id;
        this.project_id = project_id;
        this.parent_id = parent_id;
        this.task_name = task_name;
        this.start_date = start_date;
        this.end_date = end_date;
        this.duration = duration;
        this.progress = progress;
        this.assigned_user_id = assigned_user_id;
    }
}

module.exports = WbsTask;