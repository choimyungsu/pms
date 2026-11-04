(function () {
    let uploadedFiles = [];

    /* ------------------------------------------------------------------ */
    /* 품목 필드 정의                                                      */
    /* ------------------------------------------------------------------ */
    // data-field 값 == DB 컬럼명 == 서버 전송 키
    const ITEM_FIELDS = [
        { key: 'item_name',                 label: '품목명',         aliases: ['품목', '품목명', '장비', '장비명', 'item', 'itemname', 'item_name'] },
        { key: 'manufacturer',              label: '제조사',         aliases: ['제조사', '제조업체', '벤더', 'maker', 'manufacturer'] },
        { key: 'model_name',                label: '모델명',         aliases: ['모델명', '모델', 'model', 'modelname', 'model_name'] },
        { key: 'quantity',                  label: '수량',           aliases: ['수량', 'qty', 'quantity', '개수'] },
        { key: 'serial_number',             label: 'S/N',           aliases: ['s/n', 'sn', 'serial', 'serialnumber', 'serial_number', '시리얼', '시리얼넘버', '시리얼번호'] },
        { key: 'fw_version',                label: 'FW버전',         aliases: ['fw버전', 'fw', 'firmware', 'fwversion', 'fw_version', '펌웨어', '펌웨어버전'] },
        { key: 'os_version',                label: 'OS버전',         aliases: ['os버전', 'os', 'osversion', 'os_version'] },
        { key: 'eos_date',                  label: 'EoS',           aliases: ['eos', 'eos일자', 'eosdate', 'eos_date'] },
        { key: 'eol_date',                  label: 'EoL',           aliases: ['eol', 'eol일자', 'eoldate', 'eol_date'] },
        { key: 'inspection_location_item',  label: '점검위치',       aliases: ['점검위치', '위치', 'location', 'inspectionlocation', 'inspection_location_item'] },
        { key: 'contractor_company',        label: '백계약업체',     aliases: ['백계약업체', '백계약업체(매입처)', '매입처', 'contractor', 'contractorcompany', 'contractor_company'] },
        { key: 'contractor_contract',       label: '백계약상태',     aliases: ['백계약', '백계약상태', '계약상태', 'contractorcontract', 'contractor_contract'] },
        { key: 'contractor_start_date',     label: '백계약시작',     aliases: ['백계약 계약일', '백계약계약일', '백계약시작', '계약일', 'contractorstartdate', 'contractor_start_date'] },
        { key: 'contractor_end_date',       label: '백계약종료',     aliases: ['백계약 종료일', '백계약종료일', '백계약종료', 'contractorenddate', 'contractor_end_date'] },
        { key: 'contractor_contact_person', label: '백계약담당자',   aliases: ['백계약 담당자', '백계약담당자', 'contractorcontactperson', 'contractor_contact_person'] },
        { key: 'contractor_contact',        label: '백계약연락처',   aliases: ['백계약 연락처', '백계약연락처', '백계약 연락처/이메일', 'contractorcontact', 'contractor_contact'] },
        { key: 'item_version',              label: '버전',           aliases: ['버전', 'version', 'itemversion', 'item_version'] },
        { key: 'item_detail',               label: '상세내용',       aliases: ['상세내용', '상세', 'detail', 'itemdetail', 'item_detail', '상세내역'] }
    ];

    const FIELD_BY_KEY = ITEM_FIELDS.reduce(function (acc, f) { acc[f.key] = f; return acc; }, {});

    function normHeader(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s+/g, '')
            .replace(/[()（）\[\]]/g, '')
            .replace(/[*:]/g, '')
            .toLowerCase()
            .trim();
    }

    /** 머리글 문자열 → 필드 키 (없으면 null) */
    function resolveFieldKey(headerText) {
        const h = normHeader(headerText);
        if (!h) return null;
        for (const f of ITEM_FIELDS) {
            const names = [f.label].concat(f.aliases);
            for (const a of names) {
                if (normHeader(a) === h) return f.key;
            }
        }
        // 부분 일치 (마지막 수단) — 긴 라벨 우선
        const sorted = ITEM_FIELDS.slice().sort((a, b) => b.label.length - a.label.length);
        for (const f of sorted) {
            if (h.indexOf(normHeader(f.label)) !== -1) return f.key;
        }
        return null;
    }

    function initializeMaintenanceSummaryForm(config) {
        const form = document.getElementById(config.formId);
        const dropZone = document.getElementById(config.dropZoneId);
        const fileInput = document.getElementById(config.fileInputId);
        const fileList = document.getElementById(config.fileListId);
        const attachmentsToDeleteInput = document.getElementById(config.attachmentsToDeleteInputId);
        let attachmentsToDelete = [];

        if (!form || !dropZone || !fileInput || !fileList) {
            console.error('One or more form elements not found.');
            return;
        }

        /* -------------------- 품목 테이블 -------------------- */
        const table = document.getElementById(config.itemTableId || 'items-container-table');
        const tbody = table ? table.querySelector('tbody') : null;
        const rowCountEl = document.getElementById(config.itemRowCountId || 'item-row-count');

        function updateRowCount() {
            if (!rowCountEl || !tbody) return;
            rowCountEl.textContent = tbody.querySelectorAll('tr.item-row').length;
        }

        function makeRow(values) {
            const tr = document.createElement('tr');
            tr.className = 'item-row';
            let html = '';
            ITEM_FIELDS.forEach(function (f) {
                const v = values && values[f.key] !== undefined && values[f.key] !== null ? String(values[f.key]) : '';
                const esc = v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                if (f.key === 'quantity') {
                    html += '<td><input type="number" min="0" class="form-control form-control-sm text-center" data-field="quantity" value="' + esc + '" placeholder="1"></td>';
                } else if (f.key === 'eos_date' || f.key === 'eol_date' || f.key === 'contractor_start_date' || f.key === 'contractor_end_date') {
                    html += '<td><input type="text" class="form-control form-control-sm" data-field="' + f.key + '" value="' + esc + '" placeholder="YYYY-MM-DD"></td>';
                } else {
                    html += '<td><input type="text" class="form-control form-control-sm" data-field="' + f.key + '" value="' + esc + '"></td>';
                }
            });
            html += '<td class="text-center"><button type="button" class="btn btn-danger btn-sm remove-item" title="행 삭제"><i class="fas fa-times"></i></button></td>';
            tr.innerHTML = html;
            return tr;
        }

        function appendRows(list) {
            if (!tbody) return;
            // 완전히 빈 첫 행은 교체
            const rows = tbody.querySelectorAll('tr.item-row');
            if (rows.length === 1) {
                const only = rows[0];
                const hasValue = Array.prototype.some.call(
                    only.querySelectorAll('input'),
                    (inp) => inp.value.trim() !== ''
                );
                if (!hasValue) only.remove();
            }
            list.forEach(function (vals) { tbody.appendChild(makeRow(vals)); });
            updateRowCount();
        }

        const addBtn = document.getElementById(config.addItemBtnId || 'add-item');
        if (addBtn) {
            addBtn.addEventListener('click', function () { appendRows([{}]); });
        }

        if (tbody) {
            tbody.addEventListener('click', function (e) {
                const btn = e.target.closest('.remove-item');
                if (!btn) return;
                const tr = btn.closest('tr');
                if (tr) tr.remove();
                if (!tbody.querySelector('tr.item-row')) tbody.appendChild(makeRow({}));
                updateRowCount();
            });
        }

        /* -------------------- 엑셀 붙여넣기 -------------------- */
        const pasteBtn = document.getElementById(config.pasteBtnId || 'item-paste-btn');
        const pasteModalEl = document.getElementById('itemPasteModal');
        const pasteArea = document.getElementById('pasteArea');
        const pasteHasHeader = document.getElementById('pasteHasHeader');
        const pastePreviewBtn = document.getElementById('pastePreviewBtn');
        const pasteAppendBtn = document.getElementById('pasteAppendBtn');
        const pastePreviewInfo = document.getElementById('pastePreviewInfo');
        const pastePreviewWrap = document.getElementById('pastePreviewWrap');
        const pastePreviewHead = document.getElementById('pastePreviewHead');
        const pastePreviewBody = document.getElementById('pastePreviewBody');

        let parsedRows = [];
        let parsedMapping = [];

        function parsePaste() {
            const text = pasteArea ? pasteArea.value : '';
            // 탭 우선, 탭이 없으면 2개 이상 공백 또는 쉼표 구분
            let lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
                .filter((l) => l.trim() !== '');
            if (!lines.length) return { rows: [], mapping: [], hasHeader: false };

            let delim = '\t';
            if (lines[0].indexOf('\t') === -1) {
                if (lines[0].indexOf(',') !== -1) delim = ',';
            }

            const matrix = lines.map((l) => l.split(delim).map((c) => c.trim()));
            const useHeader = !!(pasteHasHeader && pasteHasHeader.checked);
            const head = matrix[0];

            let mapping;
            if (useHeader) {
                mapping = head.map((h) => resolveFieldKey(h));
            } else {
                // 머리글 없음 → 표 컬럼 순서대로
                mapping = ITEM_FIELDS.map((f, i) => (i < head.length ? f.key : null));
            }

            const dataRows = useHeader ? matrix.slice(1) : matrix;
            const rows = dataRows.map(function (cells) {
                const obj = {};
                cells.forEach(function (c, i) {
                    const key = mapping[i];
                    if (!key) return;
                    if (c === '' || c === '-' || c === '없음') return;
                    obj[key] = c;
                });
                return obj;
            }).filter((o) => o.item_name && String(o.item_name).trim() !== '');

            return { rows, mapping, hasHeader: useHeader, headerCells: head };
        }

        function renderPreview() {
            const res = parsePaste();
            parsedRows = res.rows;
            parsedMapping = res.mapping;

            if (!parsedRows.length) {
                if (pastePreviewInfo) {
                    pastePreviewInfo.innerHTML = '<span class="text-danger">유효한 행이 없습니다. 품목명이 있는 행만 추가됩니다.</span>';
                }
                if (pastePreviewWrap) pastePreviewWrap.style.display = 'none';
                return;
            }

            const mappedCount = res.mapping.filter(Boolean).length;
            const unmapped = (res.headerCells || []).filter((h, i) => h && !res.mapping[i]);

            if (pastePreviewInfo) {
                pastePreviewInfo.innerHTML =
                    '인식된 행 <strong>' + parsedRows.length + '건</strong> · 매핑된 컬럼 <strong>' + mappedCount + '개</strong>' +
                    (unmapped.length ? ' · <span class="text-warning">무시된 컬럼: ' + unmapped.join(', ') + '</span>' : '');
            }

            const keys = ITEM_FIELDS.map((f) => f.key);
            if (pastePreviewHead) {
                pastePreviewHead.innerHTML = '<tr>' + keys.map((k) => '<th class="small">' + FIELD_BY_KEY[k].label + '</th>').join('') + '</tr>';
            }
            if (pastePreviewBody) {
                const max = Math.min(parsedRows.length, 30);
                let html = '';
                for (let i = 0; i < max; i++) {
                    html += '<tr>' + keys.map(function (k) {
                        const v = parsedRows[i][k] === undefined ? '' : parsedRows[i][k];
                        return '<td class="small">' + String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td>';
                    }).join('') + '</tr>';
                }
                if (parsedRows.length > max) {
                    html += '<tr><td colspan="' + keys.length + '" class="text-muted small">… 외 ' + (parsedRows.length - max) + '건</td></tr>';
                }
                pastePreviewBody.innerHTML = html;
            }
            if (pastePreviewWrap) pastePreviewWrap.style.display = '';

            if (pasteAppendBtn) {
                pasteAppendBtn.disabled = false;
                pasteAppendBtn.textContent = parsedRows.length + '건 표에 추가';
            }
        }

        if (pasteBtn && pasteModalEl && window.bootstrap) {
            pasteBtn.addEventListener('click', function () {
                if (pasteArea) pasteArea.value = '';
                if (pastePreviewWrap) pastePreviewWrap.style.display = 'none';
                if (pastePreviewInfo) pastePreviewInfo.textContent = '';
                if (pasteAppendBtn) { pasteAppendBtn.disabled = true; pasteAppendBtn.textContent = '표에 추가'; }
                new bootstrap.Modal(pasteModalEl).show();
            });
        }

        if (pastePreviewBtn) pastePreviewBtn.addEventListener('click', renderPreview);
        if (pasteArea) {
            pasteArea.addEventListener('paste', function () {
                setTimeout(renderPreview, 50);
            });
        }

        if (pasteAppendBtn) {
            pasteAppendBtn.addEventListener('click', function () {
                if (!parsedRows.length) { renderPreview(); if (!parsedRows.length) return; }
                appendRows(parsedRows);
                const modal = window.bootstrap ? bootstrap.Modal.getInstance(pasteModalEl) : null;
                if (modal) modal.hide();
                parsedRows = [];
            });
        }

        /* -------------------- 첨부파일 -------------------- */
        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-primary');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-primary');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-primary');
            handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', () => handleFiles(fileInput.files));

        function handleFiles(files) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                    uploadedFiles.push(file);
                }
            }
            renderFileList();
        }

        function renderFileList() {
            fileList.innerHTML = '';
            uploadedFiles.forEach((file, index) => {
                const listItem = document.createElement('div');
                listItem.className = 'file-item';
                listItem.textContent = file.name;

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'btn btn-sm btn-danger ms-2';
                deleteBtn.textContent = '삭제';
                deleteBtn.onclick = () => {
                    uploadedFiles.splice(index, 1);
                    renderFileList();
                };

                listItem.appendChild(deleteBtn);
                fileList.appendChild(listItem);
            });
        }

        /* -------------------- 전송 -------------------- */
        function collectItems() {
            if (!tbody) return [];
            const out = [];
            tbody.querySelectorAll('tr.item-row').forEach(function (tr) {
                const obj = {};
                let hasAny = false;
                tr.querySelectorAll('input[data-field]').forEach(function (inp) {
                    const key = inp.getAttribute('data-field');
                    const val = (inp.value || '').trim();
                    if (val !== '') hasAny = true;
                    obj[key] = val;
                });
                if (!hasAny) return;                 // 완전히 빈 행은 제외
                if (!obj.item_name) return;          // 품목명 없으면 제외
                // 수량 정규화
                const q = parseInt(String(obj.quantity || '').replace(/[^0-9-]/g, ''), 10);
                obj.quantity = Number.isFinite(q) ? q : 1;
                // 빈 문자열은 서버에서 NULL 처리되므로 그대로 전송
                out.push(obj);
            });
            return out;
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const items = collectItems();
            if (items.length === 0) {
                alert('품목을 1건 이상 입력해 주세요. (품목명 필수)');
                return;
            }

            const formData = new FormData(form);

            if (config.editor) {
                formData.set('remarks', config.editor.getData());
            }

            formData.append('items', JSON.stringify(items));

            uploadedFiles.forEach(file => formData.append('attachments', file));

            if (attachmentsToDelete.length > 0) {
                formData.append('attachments_to_delete', JSON.stringify(attachmentsToDelete));
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '저장 중…'; }

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    if (config.isEdit) {
                        window.location.href = '/maintenance/summary/' + config.summaryId;
                    } else {
                        window.location.href = '/maintenance/summary';
                    }
                } else {
                    let msg = '저장 중 오류가 발생했습니다.';
                    try {
                        const result = await response.json();
                        msg = result.message || msg;
                    } catch (err) { /* ignore */ }
                    alert(msg);
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
                }
            } catch (error) {
                console.error('Submit error:', error);
                alert('저장 요청 중 오류가 발생했습니다.');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
            }
        });

        /* -------------------- 기존 첨부 삭제 -------------------- */
        document.querySelectorAll('.delete-attachment-btn').forEach(button => {
            button.addEventListener('click', function () {
                const attachmentId = this.dataset.attachmentId;
                if (confirm('이 첨부파일을 삭제하시겠습니까?')) {
                    attachmentsToDelete.push(attachmentId);
                    if (attachmentsToDeleteInput) {
                        attachmentsToDeleteInput.value = JSON.stringify(attachmentsToDelete);
                    }
                    this.closest('.attachment-item').remove();
                }
            });
        });

        updateRowCount();
    }

    window.initializeMaintenanceSummaryForm = initializeMaintenanceSummaryForm;
})();
