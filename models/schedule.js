class Schedule {
    constructor() {
        this.user_id = null;     // 작성자 ID
        this.title = null;       // 일정 제목
        this.start = null;       // 시작 일시
        this.end = null;         // 종료 일시
        this.description = null; // 상세 내용
        this.allDay = false;     // 종일 여부
        this.color = null;       // 일정 색상
        this.createdAt = new Date(); // 생성일시
        this.updatedAt = new Date(); // 수정일시
        this.scheduleType = null; // 일정 유형
    }
}

module.exports = Schedule;