class ResearchProject {
    constructor(id, project_name, start_date, end_date, participants) {
        this.id = id;
        this.project_name = project_name;
        this.start_date = start_date;
        this.end_date = end_date;
        this.participants = participants;
    }
}

module.exports = ResearchProject;
