const db = require('../config/db');
const Schedule = require('../models/schedule');

// 일정 페이지 렌더링
exports.getSchedulePage = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, name, department_id FROM tb_user ORDER BY name');
        res.render('schedule/index', {
            message: req.session.message,
            error: req.session.error,
            currentUser: req.session.user,
            users: users, // 사용자 목록 추가
            userColor: req.session.user ? req.session.user.color : '#3788d8'
        });
        req.session.message = null;
        req.session.error = null;
    } catch (err) {
        console.error('사용자 조회 오류:', err);
        res.status(500).send('서버 오류');
    }
};

// 일정 생성 페이지 렌더링
exports.getCreatePage = (req, res) => {
    res.render('schedule/create', {
        message: req.session.message,
        error: req.session.error,
        currentUser: req.session.user,
        userColor: req.session.user ? req.session.user.color : '#3788d8', // 사용자 색상 추가
        page: 'schedule_create'
    });
    req.session.message = null;
    req.session.error = null;
};

// 부서 조회 (API)
exports.getDepartments = async (req, res) => {
    try {
        const [departments] = await db.query('SELECT id, text FROM tb_dept');
        res.json(departments);
    } catch (err) {
        console.error('부서 조회 오류:', err);
        res.status(500).json({ message: '부서 조회 중 오류가 발생했습니다.' });
    }
};

// 모든 일정 조회 (API)
exports.getEvents = async (req, res) => {
    try {
        const { departmentName, userId, search } = req.query;
        const currentUser = req.session.user;

        let query = `
            SELECT 
                s.id, s.user_id, s.title, s.start, s.end, s.description, s.allDay, 
                s.color, s.scheduleType, s.group_id, u.name AS userName, d.text AS departmentName
            FROM tb_schedules s
            JOIN tb_user u ON s.user_id = u.id
            LEFT JOIN tb_dept d ON u.department_id = d.id
        `;
        const queryParams = [];
        let whereClauses = [];

        // 모든 사용자가 필터링 가능하도록 변경
        if (departmentName) {
            whereClauses.push(`d.text = ?`);
            queryParams.push(departmentName);
        }
        if (userId) {
            whereClauses.push(`s.user_id = ?`);
            queryParams.push(userId);
        }

        if (search) {
            whereClauses.push(`(s.title LIKE ? OR s.description LIKE ?)`);
            queryParams.push(`%${search}%`);
            queryParams.push(`%${search}%`);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        const [events] = await db.query(query, queryParams);

        const eventsWithCompanions = await Promise.all(events.map(async (event) => {
            let companions = [];
            if (event.group_id) {
                const [companionRows] = await db.query('SELECT user_id FROM tb_schedules WHERE group_id = ? AND user_id != ?', [event.group_id, event.user_id]);
                companions = companionRows.map(row => row.user_id);
            }

            let endDate = event.end;
            if (event.allDay && endDate) {
                const date = new Date(endDate);
                date.setDate(date.getDate() + 1);
                endDate = date.toISOString().slice(0, 10);
            }

            const displayTitle = `${event.title} (${event.userName})`;
            return {
                ...event,
                end: endDate,
                title: displayTitle,
                allDay: event.allDay === 1,
                companions: companions
            };
        }));

        res.json(eventsWithCompanions);
    } catch (err) {
        console.error('일정 조회 오류:', err);
        res.status(500).json({ message: '일정 조회 중 오류가 발생했습니다: ' + err.message });
    }
};


// 일정 추가 (API)
exports.addEvent = async (req, res) => {
    const { title, start, end, description, allDay, scheduleType, color, companions } = req.body;
    const user_id = req.session.user ? req.session.user.id : null;

    if (!user_id) {
        return res.status(401).json({ message: '로그인이 필요합니다.' });
    }

    const allowedScheduleTypes = ['정기점검(외근)', '정기점검(내근)', '사내업무', '출장', '교육', '연차', '오전반차', '오후반차', '장애지원', '기술지원', '미팅'];
    if (!allowedScheduleTypes.includes(scheduleType)) {
        return res.status(400).json({ message: '유효하지 않은 일정 유형입니다.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO tb_schedules (user_id, title, start, end, description, allDay, color, scheduleType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [user_id, title, start, end, description || null, allDay ? 1 : 0, color || '#3788d8', scheduleType]
        );
        const mainEventId = result.insertId;

        await connection.query('UPDATE tb_schedules SET group_id = ? WHERE id = ?', [mainEventId, mainEventId]);

        if (companions && companions.length > 0) {
            for (const companionId of companions) {
                await connection.query(
                    'INSERT INTO tb_schedules (user_id, title, start, end, description, allDay, color, scheduleType, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [companionId, title, start, end, description || null, allDay ? 1 : 0, color || '#3788d8', scheduleType, mainEventId]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ id: mainEventId, title: title, start, end, description, allDay, color });
    } catch (err) {
        await connection.rollback();
        console.error('일정 추가 오류:', err);
        res.status(500).json({ message: '일정 추가 중 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
};

// 일정 수정 (API)
exports.updateEvent = async (req, res) => {
    const { id } = req.params;
    const { title, start, end, description, allDay, scheduleType, color, companions } = req.body;
    const currentUser = req.session.user;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [eventRows] = await connection.query('SELECT user_id, group_id FROM tb_schedules WHERE id = ?', [id]);
        const event = eventRows[0];

        if (!event) {
            await connection.rollback();
            return res.status(404).json({ message: '일정을 찾을 수 없습니다.' });
        }

        // 관리자이거나 작성자인 경우에만 수정 허용
        if (currentUser && (currentUser.role === 'admin' || currentUser.id === event.user_id)) {
            const allowedScheduleTypes = ['정기점검(외근)', '정기점검(내근)', '사내업무', '출장', '교육', '연차', '오전반차', '오후반차', '장애지원', '기술지원', '미팅'];
            if (scheduleType && !allowedScheduleTypes.includes(scheduleType)) {
                await connection.rollback();
                return res.status(400).json({ message: '유효하지 않은 일정 유형입니다.' });
            }

            await connection.query(
                'UPDATE tb_schedules SET title = ?, start = ?, end = ?, description = ?, allDay = ?, color = ?, scheduleType = ?, updatedAt = NOW() WHERE id = ?',
                [title, start, end, description || null, allDay ? 1 : 0, color, scheduleType, id]
            );

            await connection.commit();
            res.status(200).json({ message: '일정이 성공적으로 업데이트되었습니다.' });
        } else {
            await connection.rollback();
            res.status(403).json({ message: '일정을 수정할 권한이 없습니다.' });
        }
    } catch (err) {
        await connection.rollback();
        console.error('일정 업데이트 오류:', err);
        res.status(500).json({ message: '일정 업데이트 중 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
};

// 일정 삭제 (API)
exports.deleteEvent = async (req, res) => {
    const { id } = req.params;
    const currentUser = req.session.user;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [eventRows] = await connection.query('SELECT user_id, group_id FROM tb_schedules WHERE id = ?', [id]);
        const event = eventRows[0];

        if (!event) {
            await connection.rollback();
            return res.status(404).json({ message: '일정을 찾을 수 없습니다.' });
        }

        // 관리자이거나 작성자인 경우에만 삭제 허용
        if (currentUser && (currentUser.role === 'admin' || currentUser.id === event.user_id)) {
            
            if (event.group_id && event.group_id == id) {
                const [companions] = await connection.query('SELECT id FROM tb_schedules WHERE group_id = ? AND id != ? ORDER BY id ASC', [id, id]);
                
                if (companions.length > 0) {
                    const newMainEventId = companions[0].id;
                    await connection.query('UPDATE tb_schedules SET group_id = ? WHERE group_id = ?', [newMainEventId, id]);
                }
            }

            await connection.query('DELETE FROM tb_schedules WHERE id = ?', [id]);
            
            await connection.commit();
            res.status(200).json({ message: '일정이 성공적으로 삭제되었습니다.' });
        } else {
            await connection.rollback();
            res.status(403).json({ message: '일정을 삭제할 권한이 없습니다.' });
        }
    } catch (err) {
        await connection.rollback();
        console.error('일정 삭제 오류:', err);
        res.status(500).json({ message: '일정 삭제 중 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
};

// 단일 일정 조회 (API)
  exports.getEventById = async (req, res) => {
      const { id } = req.params;
      try {
          const [eventRows] = await db.query(
              `SELECT
                  s.id, s.user_id, s.title, s.start, s.end, s.description, s.allDay,
                  s.color, s.scheduleType, s.group_id, u.name AS userName, d.text AS departmentName
              FROM tb_schedules s
              JOIN tb_user u ON s.user_id = u.id
              LEFT JOIN tb_dept d ON u.department_id = d.id
              WHERE s.id = ?`,
              [id]
          );

          if (eventRows.length === 0) {
              return res.status(404).json({ message: '일정을 찾을 수 없습니다.' });
          }

          const event = eventRows[0];

          // 동반자 정보도 함께 가져옵니다.
          let companions = [];
          if (event.group_id) {
              const [companionRows] = await db.query('SELECT user_id FROM tb_schedules WHERE group_id = ?  AND user_id != ?', [event.group_id, event.user_id]);
              companions = companionRows.map(row => row.user_id);
          }

          res.json({
              ...event,
              allDay: event.allDay === 1,
              companions: companions
          });

      } catch (err) {
          console.error('단일 일정 조회 오류:', err);
          res.status(500).json({ message: '단일 일정 조회 중 오류가 발생했습니다: ' + err.message });
      }
  };