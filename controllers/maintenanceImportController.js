'use strict';

/**
 * 유지보수 총괄표 엑셀 업로드 컨트롤러
 *
 *  POST /maintenance/import/preview   (multipart: file, sheet, maxRows)
 *      → 파일을 임시 저장하고 파싱 결과 요약(JSON) 반환. DB 변경 없음.
 *      → 파싱 결과는 세션에 보관하지 않고, **파일 경로 + 시트명**만 응답에 담아
 *        apply/sql 호출 시 다시 전달받아 재파싱합니다. (메모리/세션 부담 없음)
 *
 *  POST /maintenance/import/apply     (JSON: token, sheet, strategy)
 *      → 다시 파싱하여 트랜잭션으로 DB 반영
 *
 *  POST /maintenance/import/sql       (JSON: token, sheet, strategy)
 *      → 동일 내용을 반영하는 idempotent SQL 스크립트(.sql) 다운로드
 *
 *  POST /maintenance/import/discard   (JSON: token) → 임시 파일 삭제
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const multer = require('multer');

const maintenanceImport = require('../utils/maintenanceImport');

/* ------------------------------------------------------------------ */
/* 업로드 설정                                                          */
/* ------------------------------------------------------------------ */

const IMPORT_DIR = path.join(__dirname, '../uploads/maintenance_import');
if (!fs.existsSync(IMPORT_DIR)) {
    fs.mkdirSync(IMPORT_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMPORT_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '.xlsx') || '.xlsx';
        const token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        cb(null, `${token}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 40 * 1024 * 1024 },  // 40MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (['.xlsx', '.xlsm', '.xls', '.csv'].indexOf(ext) === -1) {
            return cb(new Error('엑셀 파일(.xlsx/.xls/.csv)만 업로드할 수 있습니다.'));
        }
        cb(null, true);
    }
});

exports.upload = upload;

/* ------------------------------------------------------------------ */
/* 헬퍼                                                                */
/* ------------------------------------------------------------------ */

const MAX_ROWS = 20000;

/** token(=저장된 파일명) 검증 — 디렉터리 탈출 방지 */
function resolveTokenFile(token) {
    if (!token || typeof token !== 'string') return null;
    const base = path.basename(token.trim());
    if (!/^[0-9]+_[a-z0-9]+\.(xlsx|xlsm|xls|csv)$/i.test(base)) return null;
    const full = path.join(IMPORT_DIR, base);
    if (!fs.existsSync(full)) return null;
    return full;
}

function readWorkbook(filePath) {
    return xlsx.readFile(filePath, { cellDates: true });
}

function sheetRows(workbook, sheetName) {
    const name = sheetName && workbook.Sheets[sheetName] ? sheetName : workbook.SheetNames[0];
    const ws = workbook.Sheets[name];
    if (!ws) return { name, rows: [] };
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    return { name, rows };
}

/** 워크북의 시트 후보 목록 (헤더 인식 여부 포함) */
function listSheets(workbook) {
    const out = [];
    workbook.SheetNames.forEach((name) => {
        const ws = workbook.Sheets[name];
        if (!ws || !ws['!ref']) {
            out.push({ name, usable: false, dataRows: 0, fields: 0, reason: '빈 시트' });
            return;
        }
        let rows;
        try {
            rows = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
        } catch (e) {
            out.push({ name, usable: false, dataRows: 0, fields: 0, reason: '읽기 실패' });
            return;
        }
        const headerRow = maintenanceImport.findHeaderRow(rows);
        if (headerRow < 0) {
            out.push({ name, usable: false, dataRows: 0, fields: 0, reason: '헤더(고객사/품목) 없음' });
            return;
        }
        const map = maintenanceImport.buildColumnMap(rows, headerRow);
        out.push({
            name,
            usable: true,
            headerRow: headerRow + 1,
            dataRows: Math.max(0, rows.length - headerRow - 2),
            fields: map.fields.length
        });
    });
    out.sort((a, b) => (b.usable ? 1 : 0) - (a.usable ? 1 : 0) || b.dataRows - a.dataRows);
    return out;
}

function parseToken(payload) {
    const tokenFile = resolveTokenFile(payload.token);
    if (!tokenFile) return { error: '업로드한 파일을 찾을 수 없습니다. 다시 업로드해 주세요.' };
    const workbook = readWorkbook(tokenFile);
    const { name, rows } = sheetRows(workbook, payload.sheet);
    const parsed = maintenanceImport.parseRows(rows, { maxRows: MAX_ROWS });
    return { tokenFile, workbook, sheetName: name, rows, parsed };
}

function pickStrategy(value) {
    return value === 'replace' ? 'replace' : 'merge';
}

/* ------------------------------------------------------------------ */
/* 미리보기                                                             */
/* ------------------------------------------------------------------ */

exports.preview = async (req, res) => {
    try {
        const file = req.file;
        // 파일 없이 token 만 온 경우 = 이미 업로드된 파일로 시트만 바꿔 재분석
        let filePath = file ? file.path : null;
        if (!filePath) {
            filePath = resolveTokenFile(req.body && req.body.token);
        }
        if (!filePath) {
            return res.status(400).json({ success: false, message: '엑셀 파일이 업로드되지 않았습니다.' });
        }

        let workbook;
        try {
            workbook = readWorkbook(filePath);
        } catch (err) {
            if (file) fs.unlink(filePath, () => {});
            return res.status(400).json({ success: false, message: '엑셀 파일을 읽을 수 없습니다: ' + err.message });
        }

        const sheets = listSheets(workbook);

        // 시트 자동 선택: 요청 시트 → 자동 감지 → 첫 시트
        let sheetName = req.body.sheet;
        if (!sheetName || !workbook.Sheets[sheetName]) {
            const detected = maintenanceImport.detectSheet(workbook);
            sheetName = detected ? detected.best.name : workbook.SheetNames[0];
        }

        const { rows } = sheetRows(workbook, sheetName);
        const parsed = maintenanceImport.parseRows(rows, { maxRows: MAX_ROWS });

        if (!parsed.ok) {
            return res.status(400).json({
                success: false,
                message: parsed.message,
                token: path.basename(filePath),
                fileName: file ? file.originalname : path.basename(filePath),
                sheetName,
                sheets
            });
        }

        const existingIndex = await maintenanceImport.loadExistingIndex();
        const preview = maintenanceImport.summarize(parsed.groups, existingIndex);

        return res.json({
            success: true,
            token: path.basename(filePath),
            fileName: file ? file.originalname : path.basename(filePath),
            sheetName,
            sheets,
            headerRow: parsed.headerRow,
            dataStartRow: parsed.dataStartRow,
            subHeaderUsed: parsed.subHeaderUsed,
            columns: parsed.columns,
            unmappedColumns: parsed.unmappedColumns,
            fields: parsed.fields,
            fieldLabels: maintenanceImport.FIELD_LABELS,
            stats: parsed.stats,
            counts: preview.counts,
            rows: preview.rows.slice(0, 200),
            previewLimited: preview.rows.length > 200
        });
    } catch (error) {
        console.error('[maintenanceImport] preview error:', error);
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(500).json({ success: false, message: '엑셀 분석 중 오류가 발생했습니다: ' + error.message });
    }
};

/* ------------------------------------------------------------------ */
/* 적용                                                                 */
/* ------------------------------------------------------------------ */

exports.apply = async (req, res) => {
    try {
        const body = req.body || {};
        const strategy = pickStrategy(body.strategy);
        const ctx = parseToken(body);

        if (ctx.error) return res.status(400).json({ success: false, message: ctx.error });
        if (!ctx.parsed.ok) return res.status(400).json({ success: false, message: ctx.parsed.message });

        const itemTotal = ctx.parsed.groups.reduce((a, g) => a + g.items.length, 0);
        if (itemTotal === 0) {
            return res.status(400).json({ success: false, message: '적용할 품목 데이터가 없습니다.' });
        }

        const result = await maintenanceImport.applyGroups(ctx.parsed.groups, {
            strategy,
            creatorId: req.session.user && req.session.user.id
        });

        const operator = (req.session.user && req.session.user.name) || 'system';
        console.log(`[maintenanceImport] apply by ${operator} sheet=${ctx.sheetName} strategy=${strategy}`, JSON.stringify(result));

        const parts = [];
        parts.push(`요약 ${result.createdSummaries + result.updatedSummaries}건 (신규 ${result.createdSummaries} / 갱신 ${result.updatedSummaries})`);
        parts.push(`품목 신규 ${result.createdItems}건 / 갱신 ${result.updatedItems}건`);
        if (result.deletedItems) parts.push(`삭제 ${result.deletedItems}건`);
        if (result.skippedGroups) parts.push(`건너뜀 ${result.skippedGroups}그룹`);

        return res.json({
            success: true,
            message: parts.join(' · '),
            result
        });
    } catch (error) {
        console.error('[maintenanceImport] apply error:', error);
        return res.status(500).json({ success: false, message: '적용 중 오류가 발생했습니다: ' + error.message });
    }
};

/* ------------------------------------------------------------------ */
/* SQL 스크립트 다운로드                                                 */
/* ------------------------------------------------------------------ */

exports.downloadSql = async (req, res) => {
    try {
        const body = req.body || {};
        const strategy = pickStrategy(body.strategy);
        const ctx = parseToken(body);

        if (ctx.error) return res.status(400).json({ success: false, message: ctx.error });
        if (!ctx.parsed.ok) return res.status(400).json({ success: false, message: ctx.parsed.message });

        const sql = maintenanceImport.buildSqlScript(ctx.parsed.groups, { strategy });

        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `maintenance_import_${stamp}.sql`;

        res.setHeader('Content-Type', 'application/sql; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send('\ufeff' + sql);   // BOM: Windows 메모장 한글 깨짐 방지
    } catch (error) {
        console.error('[maintenanceImport] downloadSql error:', error);
        return res.status(500).json({ success: false, message: 'SQL 생성 중 오류가 발생했습니다: ' + error.message });
    }
};

/* ------------------------------------------------------------------ */
/* 임시 파일 정리                                                        */
/* ------------------------------------------------------------------ */

exports.discard = (req, res) => {
    const tokenFile = resolveTokenFile((req.body || {}).token);
    if (tokenFile) fs.unlink(tokenFile, () => {});
    return res.json({ success: true });
};

/** 24시간 지난 임시 업로드 파일 청소 (기동 시 1회) */
exports.cleanupOldFiles = function cleanupOldFiles() {
    try {
        if (!fs.existsSync(IMPORT_DIR)) return;
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        fs.readdirSync(IMPORT_DIR).forEach((name) => {
            const full = path.join(IMPORT_DIR, name);
            try {
                const st = fs.statSync(full);
                if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(full);
            } catch (e) { /* ignore */ }
        });
    } catch (e) {
        console.warn('[maintenanceImport] cleanup 실패:', e.message);
    }
};

/** 업로드 템플릿(헤더만 있는 엑셀) 다운로드 */
exports.downloadTemplate = (req, res) => {
    const header = [
        '구분', '고객사', '사업명', '검수일', '도입일', '유지보수 시작일', '유지보수 종료일',
        '품목', '제조사', '모델명', 'EoS', 'EoL', 'S/N', 'Firmware Version', 'OS Version', '수량',
        '백계약업체(매입처)', '백계약', '계약일', '종료일', '담당자', '연락처/이메일',
        '정', '부', '영업담당', '점검방식', '업체명', '담당자', '연락처, 이메일',
        '부서명', '담당자', '연락처 / 이메일', '고객사위치', '점검위치', '견적서 파일', '비고'
    ];
    const sample = [
        '진행', '예시고객사', '예시 사업명', '2025-01-15', '2024-12-01', '2026-01-01', '2026-12-31',
        '방화벽', '시큐아이', 'BLUEMAX NGF 500', '2029-09-30', '2029-09-30', 'TSCD62001144', '7.0.12', 'CentOS 7.9', 1,
        '디비아이엔씨', '완료', '2025-10-01', '2026-09-30', '홍길동 프로', '010-0000-0000 / a@b.co.kr',
        '김용기', '-', '박재영', '분기점검', '제이원아이티', '-', '-',
        'IT팀', '최민우 매니저', '010-0000-0000 / c@d.co.kr', '서울시 ...', '서울시 ...', '견적서 파일명', '비고내용'
    ];

    const ws = xlsx.utils.aoa_to_sheet([header, sample]);
    ws['!cols'] = header.map(() => ({ wch: 16 }));
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, '유지보수 총괄표');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=maintenance_import_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
};
