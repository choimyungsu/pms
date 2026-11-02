const WeeklyReport = require('../models/weeklyReport');
const db = require('../config/db'); // Import the MySQL connection pool

// Helper function to get start and end dates of a week
const getWeekDateRange = (date) => {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - (startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1)); // Monday
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
  endOfWeek.setHours(23, 59, 59, 999);

  return { startOfWeek, endOfWeek };
};

// Helper function to format week string (e.g., "2025-W29")
const getWeekString = (date) => {
  const year = date.getFullYear();
  const d = new Date(Date.UTC(year, date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
};

// Helper function to group schedules by department
const groupSchedulesByDepartment = (schedules) => {
  const grouped = {};
  schedules.forEach(schedule => {
    const department = schedule.departmentName || '기타'; // Default to '기타' if departmentName is null
    if (!grouped[department]) {
      grouped[department] = [];
    }
    grouped[department].push(schedule);
  });
  return grouped;
};

// Helper function to format schedules for textarea, removing blank lines
const formatSchedulesForTextarea = (groupedSchedules) => {
  let formattedText = '';
  const departmentOrder = ['기술1팀', '기술2팀', '기술3팀']; // You can change this to your desired department order
  const allDepartments = Object.keys(groupedSchedules);
  const sortedDepartments = [
    ...departmentOrder.filter(dept => allDepartments.includes(dept)),
    ...allDepartments.filter(dept => !departmentOrder.includes(dept)).sort()
  ];
  for (const department of sortedDepartments) {
    formattedText += `${department}:\n`;
    groupedSchedules[department].forEach(schedule => {
      formattedText += `- ${schedule.date.toISOString().split('T')[0]}: ${schedule.title} (담당: ${schedule.registrantName})\n`;
    });
  }
  return formattedText.trim(); // Remove leading/trailing whitespace
};

// Helper function to get report week options
const getReportWeekOptions = (currentDate) => {
  const options = [];
  for (let i = -3; i <= 3; i++) { // 3 weeks before, current week, 3 weeks after
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() + (i * 7));
    options.push(getWeekString(date));
  }
  return options;
};

const fetchSchedulesForPeriod = async (startDate, endDate) => {
    let [schedules] = await db.execute(
      `SELECT s.title, s.start AS date, u.name AS registrantName, d.text AS departmentName 
       FROM tb_schedules s 
       JOIN tb_user u ON s.user_id = u.id
       LEFT JOIN tb_dept d ON u.department_id = d.id
       WHERE s.start >= ? AND s.start <= ?`,
      [startDate, endDate]
    );
    return schedules.map(schedule => ({...schedule, date: new Date(schedule.date)}));
}

exports.renderCreateForm = async (req, res) => {
  try {
    const today = new Date();
    const previousWeek = new Date(today);
    previousWeek.setDate(today.getDate() - 7);

    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const weekAfterNext = new Date(today);
    weekAfterNext.setDate(today.getDate() + 14);

    const { startOfWeek: prevWeekStart, endOfWeek: prevWeekEnd } = getWeekDateRange(previousWeek);
    const { startOfWeek: currWeekStart, endOfWeek: currWeekEnd } = getWeekDateRange(today);
    const { startOfWeek: nextWeekStart, endOfWeek: nextWeekEnd } = getWeekDateRange(nextWeek);
    const { startOfWeek: weekAfterNextStart, endOfWeek: weekAfterNextEnd } = getWeekDateRange(weekAfterNext);

    const previousWeekSchedules = await fetchSchedulesForPeriod(prevWeekStart, prevWeekEnd);
    const currentWeekSchedules = await fetchSchedulesForPeriod(currWeekStart, currWeekEnd);
    const nextWeekSchedules = await fetchSchedulesForPeriod(nextWeekStart, nextWeekEnd);
    const weekAfterNextSchedules = await fetchSchedulesForPeriod(weekAfterNextStart, weekAfterNextEnd);

    const groupedPreviousWeekSchedules = groupSchedulesByDepartment(previousWeekSchedules);
    const groupedCurrentWeekSchedules = groupSchedulesByDepartment(currentWeekSchedules);
    const groupedNextWeekSchedules = groupSchedulesByDepartment(nextWeekSchedules);
    const groupedWeekAfterNextSchedules = groupSchedulesByDepartment(weekAfterNextSchedules);

    const formattedPreviousWeekPerformance = formatSchedulesForTextarea(groupedPreviousWeekSchedules);
    const formattedCurrentWeekPlan = formatSchedulesForTextarea(groupedCurrentWeekSchedules);
    const formattedNextWeekPlan = formatSchedulesForTextarea(groupedNextWeekSchedules) + '\n\n' + 
                                  '다다음주 계획 (' + weekAfterNextStart.toISOString().split('T')[0] + ' ~ ' + weekAfterNextEnd.toISOString().split('T')[0] + ')\n' + 
                                  formatSchedulesForTextarea(groupedWeekAfterNextSchedules);

    const reportWeekOptions = getReportWeekOptions(today);
    const currentReportWeek = getWeekString(today);

    res.render('weekly-reports/create', {
      reportWeek: currentReportWeek,
      reportWeekOptions,
      formattedPreviousWeekPerformance,
      formattedCurrentWeekPlan,
      formattedNextWeekPlan,
      prevWeekStart: prevWeekStart.toISOString().split('T')[0],
      prevWeekEnd: prevWeekEnd.toISOString().split('T')[0],
      currWeekStart: currWeekStart.toISOString().split('T')[0],
      currWeekEnd: currWeekEnd.toISOString().split('T')[0],
      nextWeekStart: nextWeekStart.toISOString().split('T')[0],
      nextWeekEnd: nextWeekEnd.toISOString().split('T')[0],
      weekAfterNextStart: weekAfterNextStart.toISOString().split('T')[0],
      weekAfterNextEnd: weekAfterNextEnd.toISOString().split('T')[0],
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('Error rendering weekly report create form:', err);
    req.flash('error', '주간보고 생성 폼을 불러오는 데 실패했습니다.');
    res.redirect('/'); // Redirect to a suitable error page or home
  }
};

exports.createReport = async (req, res) => {
  try {
    const { reportWeek, previousWeekPerformance, currentWeekPlan, nextWeekPlan } = req.body;

    // Insert into MySQL
    await db.execute(
      `INSERT INTO tb_weekly_reports (reportWeek, previousWeekPerformance, currentWeekPlan, nextWeekPlan) VALUES (?, ?, ?, ?)`,
      [reportWeek, previousWeekPerformance, currentWeekPlan, nextWeekPlan]
    );

    req.flash('success', '주간보고서가 성공적으로 저장되었습니다.');
    res.redirect('/weekly-reports'); // Redirect to list page
  } catch (err) {
    console.error('Error creating weekly report:', err);
    req.flash('error', '주간보고서 저장에 실패했습니다.');
    res.redirect('/weekly-reports/create'); // Redirect back to create form
  }
};

exports.listReports = async (req, res) => {
  try {
    // Fetch from MySQL
    let [reports] = await db.execute(
      `SELECT id, reportWeek, createdAt FROM tb_weekly_reports ORDER BY createdAt DESC`
    );
    reports = reports.map(report => ({
      ...report,
      createdAt: new Date(report.createdAt) // Convert createdAt string to Date object
    }));

    res.render('weekly-reports/list', {
      reports,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('Error listing weekly reports:', err);
    req.flash('error', '주간보고 목록을 불러오는 데 실패했습니다.');
    res.redirect('/');
  }
};

exports.renderEditForm = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, reportWeek, previousWeekPerformance, currentWeekPlan, nextWeekPlan, createdAt FROM tb_weekly_reports WHERE id = ?`,
      [req.params.id]
    );
    const report = rows[0];

    if (!report) {
      req.flash('error', '주간보고서를 찾을 수 없습니다.');
      return res.redirect('/weekly-reports');
    }

    const reportWeekOptions = getReportWeekOptions(new Date(report.reportWeek)); // Use report's week for options

    res.render('weekly-reports/edit', {
      report,
      reportWeekOptions,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('Error rendering weekly report edit form:', err);
    req.flash('error', '주간보고서 수정 폼을 불러오는 데 실패했습니다.');
    res.redirect('/weekly-reports');
  }
};

exports.updateReport = async (req, res) => {
  try {
    const { reportWeek, previousWeekPerformance, currentWeekPlan, nextWeekPlan } = req.body;
    const { id } = req.params;

    await db.execute(
      `UPDATE tb_weekly_reports SET reportWeek = ?, previousWeekPerformance = ?, currentWeekPlan = ?, nextWeekPlan = ? WHERE id = ?`,
      [reportWeek, previousWeekPerformance, currentWeekPlan, nextWeekPlan, id]
    );

    req.flash('success', '주간보고서가 성공적으로 수정되었습니다.');
    res.redirect(`/weekly-reports/${id}`);
  } catch (err) {
    console.error('Error updating weekly report:', err);
    req.flash('error', '주간보고서 수정에 실패했습니다.');
    res.redirect(`/weekly-reports/${req.params.id}/edit`);
  }
};

exports.deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(`DELETE FROM tb_weekly_reports WHERE id = ?`, [id]);
    req.flash('success', '주간보고서가 성공적으로 삭제되었습니다.');
    res.redirect('/weekly-reports');
  }
  catch (err) {
    console.error('Error deleting weekly report:', err);
    req.flash('error', '주간보고서 삭제에 실패했습니다.');
    res.redirect('/weekly-reports');
  }
};

exports.viewReport = async (req, res) => {
  try {
    // Fetch from MySQL by ID
    const [rows] = await db.execute(
      `SELECT id, reportWeek, previousWeekPerformance, currentWeekPlan, nextWeekPlan, createdAt FROM tb_weekly_reports WHERE id = ?`,
      [req.params.id]
    );
    const report = rows[0];

    if (report) {
      report.createdAt = new Date(report.createdAt); // Convert createdAt string to Date object
    }

    if (!report) {
      req.flash('error', '주간보고서를 찾을 수 없습니다.');
      return res.redirect('/weekly-reports');
    }
    res.render('weekly-reports/view', {
      report,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('Error viewing weekly report:', err);
    req.flash('error', '주간보고서를 불러오는 데 실패했습니다.');
    res.redirect('/weekly-reports');
  }
};