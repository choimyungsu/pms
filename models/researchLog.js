class ResearchLog {
    constructor(id, doc_classification, page_number, author, creation_date, department, author2, research_title, research_purpose, attendees, meeting_location, main_content, expected_outcome) {
        this.id = id;
        this.doc_classification = doc_classification;
        this.page_number = page_number;
        this.author = author;
        this.creation_date = creation_date;
        this.department = department;
        this.author2 = author2;
        this.research_title = research_title;
        this.research_purpose = research_purpose;
        this.attendees = attendees;
        this.meeting_location = meeting_location;
        this.main_content = main_content;
        this.expected_outcome = expected_outcome;
    }
}

module.exports = ResearchLog;
