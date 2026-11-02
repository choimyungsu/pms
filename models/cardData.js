
class CardData {
    constructor() {
        this.company = null;    // 회사명
        this.name = null;         // 이름
        this.department = null; // 부서
        this.position = null;     // 직책
        this.mobile = null;       // 핸드폰
        this.email = null;        // 이메일
        this.address = null;      // 주소
        this.phone = null;        // 전화
        this.fax = null;          // 팩스
        this.website = null;      // 홈페이지
        this.memo = null;         // 메모
        this.email_opt_in = false; // 이메일 수신여부
        this.userId = null;
    }
}

module.exports = CardData;
