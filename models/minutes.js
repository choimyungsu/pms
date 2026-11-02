class MeetingMinutes {
    constructor() {
        this.user_id = null;         // 작성자 ID
        this.title = null;           // 회의명
        this.meeting_date = null;    // 일시
        this.location = null;        // 장소
        this.host = null;            // 주관
        this.attendees = null;       // 참석자
        this.agenda = null;          // 안건 (JSON)
        this.summary = null;         // 회의내용 요약
        this.remarks = null;         // 비고
        this.createdAt = new Date();     // 생성일시
        this.updatedAt = new Date();     // 수정일시
    }
}

module.exports = MeetingMinutes;