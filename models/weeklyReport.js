class WeeklyReport {
    constructor(reportWeek, previousWeekPerformance, currentWeekPlan) {
        this.reportWeek = reportWeek;
        this.previousWeekPerformance = previousWeekPerformance;
        this.currentWeekPlan = currentWeekPlan;
        this.createdAt = new Date();
    }
}

module.exports = WeeklyReport;