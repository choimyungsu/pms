# 패치관리 (Patch Management)

기존 아키텍처(Express + MySQL + EJS + xlsx)를 유지한 채 **유지보수 관리 > 패치관리** 메뉴를 추가했습니다.

## 1. 기준 테이블

| 구분 | 테이블 | 사용 컬럼 |
|---|---|---|
| 고객사 등 요약 | `tb_maintenance_summary` | `customer_company`, `project_name`, `main_engineer`, `sub_engineer`, `maintenance_start_date`, `maintenance_end_date` |
| 품목 / 제조사 / 버전 | `tb_maintenance_summary_items` | `item_name`, **`manufacturer`(신규)**, **`item_version`(신규)**, `item_detail`, `patch_required`(신규) |

> 패치 전용 테이블은 추후 별도 설계 예정입니다.
> 그 전까지 `tb_maintenance_summary_items` 의 패치필요 필드를 사용하며,
> `controllers/patchController.js` 의 `SELECT_ROW` / UPDATE 대상만 교체하면 이관됩니다.

## 2. 화면 구성

- **목록 테이블 기본 순서: 제조사 → 품목 → 버전 → 고객사 → 패치필요**
  - **제조사 / 품목 / 버전 3개 셀 모두 인라인 편집 input** — 여러 행을 동시에 수정하고 "변경사항 저장" 으로 일괄 반영
  - **헤더를 드래그하면 컬럼 순서를 변경**할 수 있습니다 (헤더와 모든 행의 셀이 함께 이동)
  - **"컬럼 선택" 드롭다운**에서 표시할 항목을 체크하면 해당 컬럼이 나타납니다 (정엔지니어, 부엔지니어, 점검방식, 점검장소 등)
  - 품목 상세내용(`item_detail`)은 "컬럼 선택"에서 켜면 별도 컬럼으로 표시
  - 버전 셀 하단에 판정자·판정일 표시
- 상단 요약: 전체 품목 / 전체 패치필요 / 조회 결과 / 조회 결과 중 패치필요
- 조건 설정: **고객사 / 품목 / 버전 복수 선택**(multiple select, Ctrl·Shift+클릭) + 실시간 미리보기
- 액션: 조건 항목 체크 / 조건 기준 재설정 / 조건 항목 체크 해제 / 패치필요·불필요 필터 / **엑셀 다운로드** / 전체 초기화

### 2-1. 컬럼 표시 · 순서 변경

| 항목 | 내용 |
|---|---|
| 컬럼 정의 | `utils/patchColumns.js` 한 곳에서 관리 (화면 · 엑셀 공용) |
| 기본 표시 | `manufacturer` → `item_name` → `item_version` → `customer_company` → `patch_required` |
| 선택 항목 | 정엔지니어(`main_engineer`), 부엔지니어, 점검방식, 점검장소, 영업담당, 구분, 사업명, 상세내용, 유지보수 기간, 고객담당자/연락처/이메일, 판정일시/판정자/판정조건, 비고 |
| 필수 컬럼 | `patch_required` — 체크 해제 불가(disabled) |
| 순서 변경 | 헤더 `th` HTML5 드래그&드롭. 헤더·본문 셀을 함께 이동하므로 편집 중 값도 유지 |
| 전달 방식 | `?cols=제조사key,품목key,...` (콤마 구분) — 필터·페이지네이션/엑셀 링크에 자동 반영 |
| 기억 | 변경된 순서는 `localStorage`(`patch:cols`)에 저장되어 재방문 시 복원 (컬럼 집합이 같을 때만) |
| 기본값 복원 | "컬럼 선택" → **기본값** 버튼 (localStorage 삭제 + `cols` 파라미터 제거) |
| 엑셀 | 화면과 **동일한 컬럼·순서**로 내려받기 (`download-excel?cols=...`) |

## 3. 패치필요 판정 로직

선택한 **품목 + 버전**에 매칭되는 `tb_maintenance_summary_items` 행만 `patch_required = 1`:

```sql
UPDATE tb_maintenance_summary_items i
  JOIN tb_maintenance_summary s ON s.id = i.summary_id
   SET i.patch_required = 1, i.patch_required_at = NOW(),
       i.patch_required_by = ?, i.patch_condition = ?
 WHERE i.item_name IN (선택 품목들)
   AND i.item_version IN (선택 버전들)
   [AND s.customer_company IN (선택 고객사들)]
```

모드 3가지
1. `check` — 조건 해당 행만 체크 (그 외 기존 값 유지)
2. `replace` — 전체 초기화 후 조건 해당 행만 체크 (트랜잭션)
3. `uncheck` — 조건 해당 행만 체크 해제

개별 체크박스 토글, 전체 초기화도 지원합니다.

## 4. 제조사 / 버전 정보 입력·관리

`tb_maintenance_summary_items` 에 `manufacturer`, `item_version` 을 추가하고 아래 화면에 입력 필드를 연결했습니다.

- 유지보수(요약) **등록** 폼: 품목명 / **제조사** / **버전** / 상세내용 4열 입력
- 유지보수(요약) **수정** 폼: 기존 값 로드 + 신규 행 추가 시 제조사·버전 입력
- 유지보수(요약) **목록/상세**: 품목 옆 버전 배지, 패치필요 배지 표시
- 저장 경로: `public/js/maintenanceSummaryFormHandler.js` → `items` JSON(`manufacturer`, `item_version`) → `MaintenanceSummary.addItems()`

`addItems()` 는 `manufacturer` / `item_version` 컬럼 존재 여부를 각각 확인 후 분기하므로, 컬럼 추가 전 DB에서도 오류 없이 동작합니다.

### 4-1. 품목 / 제조사 / 버전 복수행 인라인 수정 (패치관리 목록)

| 항목 | 내용 |
|---|---|
| UI | 품목·제조사·버전 3개 셀이 `<input class="form-control field-input" data-id data-field data-original>` 로 렌더링 |
| 편집 필드 | `item_name`(품목), `manufacturer`(제조사), `item_version`(버전) |
| 변경 감지 | 입력값 ≠ `data-original` 인 셀을 dirty(노란 배경)로, 해당 행은 `row-dirty` 로 표시 + `변경 N건` 배지 |
| 저장 | 툴바의 **변경사항 저장** 버튼 → `POST /maintenance/patch/save-fields` |
| 요청 본문 | `{ rows: [{ id, item_name?, manufacturer?, item_version? }] }` — **변경된 필드만** 전송, 최대 500행 |
| 서버 처리 | 화이트리스트 필드만 반영 → id 존재 확인 → 트랜잭션 일괄 `UPDATE` → `{ success, updated, skipped, message }` |
| 저장 후 | 해당 필드의 `data-original` 갱신, dirty 해제, SweetAlert/알림 표시 |
| 되돌리기 | **되돌리기** 버튼(또는 Esc) — 편집 중 값을 원래대로 복원 |
| 안전장치 | 저장하지 않고 페이지 이탈 시 `beforeunload` 경고 / Enter 로 편집 확정 |

제약 및 처리
- **품목명은 DB 상 `NOT NULL`** → 빈 값으로 저장 시 400 응답 (`품목명은 비워둘 수 없습니다.`) 및 해당 input 빨간 테두리 표시
- 제조사·버전은 빈 값 저장 시 `NULL` 처리
- 하위 호환: 기존 `POST /maintenance/patch/save-versions` (버전 전용) 경로도 그대로 동작

### 4-2. 라인 선택 → 품목 추가 (행추가)

기존 유지보수(요약)에 등록된 **고객사 라인을 선택하고, 그 라인에 품목 행을 추가**하는 기능입니다.

| 항목 | 내용 |
|---|---|
| 라인 선택 | 목록의 행(tr)을 클릭하면 선택됩니다. 선택된 행은 파란 배경(`.row-selected`)으로 강조되고 툴바에 고객사명이 표시됩니다. |
| 선택 해제 | 같은 행을 다시 클릭하거나 다른 행을 클릭하면 이동/해제됩니다. (편집 input·체크박스·버튼 클릭은 선택으로 처리하지 않음) |
| 진입 | **품목 추가** 버튼 (라인 미선택 시 비활성) → 모달 오픈 |
| 모달 - 고객사 | `tb_maintenance_summary` 목록을 select 로 표시. 선택한 라인이 자동 지정되며, 다른 고객사로 변경도 가능 |
| 모달 - 행추가 | **행 추가** 버튼으로 입력 행을 계속 늘릴 수 있음 (Enter 로도 다음 행 이동 / 마지막 행에서는 새 행 생성) |
| 입력 항목 | 품목명(필수) · 제조사 · 버전 · 상세내용 — 기존 값은 `datalist` 로 자동완성 |
| 요청 | `POST /maintenance/patch/add-item` · `{ summary_id, items: [{item_name, manufacturer, item_version, item_detail}] }` |
| 서버 검증 | `summary_id` 존재 확인(404) · 품목명 필수(누락 행만 제외하고 나머지 추가, 전부 누락 시 400) · 255자 절단 |
| 컬럼 대응 | DB에 `manufacturer` / `item_version` 컬럼이 없어도 존재하는 컬럼만 골라 INSERT |
| 결과 | `{ success, added, firstId, ids, invalidRows, message }` · 성공 시 목록을 새로고침해 추가된 행이 바로 보임 |
| XSS | 모달 입력 행은 `createElement` / `textContent` 로만 생성 (innerHTML 미사용) |

동작 예시
1. 목록에서 `A고객사` 라인 클릭 → 툴바에 `A고객사` 표시, **품목 추가** 활성화
2. 모달에서 **행 추가** 두 번 → 입력 행 3개
3. `FortiGate 100F / Fortinet / v7.0.12 / 방화벽` 등 입력 후 **추가**
4. `3건의 품목을 추가했습니다.` 알림 → 목록 갱신, 해당 고객사에 3행 추가됨

## 5. 스키마 자동 점검

`utils/patchSchema.js` — `INFORMATION_SCHEMA` 로 존재 여부 확인 후 없을 때만 `ALTER` (idempotent)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| manufacturer | VARCHAR(255) | 제조사 |
| item_version | VARCHAR(255) | 품목 버전 |
| patch_required | TINYINT(1) DEFAULT 0 | 패치필요 여부 |
| patch_required_at | DATETIME | 판정 일시 |
| patch_required_by | VARCHAR(255) | 판정자 |
| patch_condition | VARCHAR(500) | 판정 조건 요약 |

인덱스: `idx_summary_items_patch_required`, `idx_summary_items_name_version`

- 서버 기동 시 자동 1회 실행 (`app.js` → `ensurePatchColumns()`)
- 수동 실행: `node utils/patchSchema.js`
- 수동 SQL: `add_patch_management_columns.sql`

## 6. 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/maintenance/patch` | 목록 (search, items[], versions[], customers[], patch, page, **cols**) |
| GET | `/maintenance/patch/preview-count` | 조건 매칭 건수 미리보기 (JSON) |
| POST | `/maintenance/patch/apply-condition` | 조건 적용 (mode=check/replace/uncheck) |
| POST | `/maintenance/patch/toggle/:id` | 개별 패치필요 토글 (JSON) |
| POST | `/maintenance/patch/save-fields` | 품목/제조사/버전 복수행 일괄 저장 (JSON body `{rows:[{id,item_name?,manufacturer?,item_version?}]}`) |
| POST | `/maintenance/patch/save-versions` | 하위 호환 — 버전 전용 저장 (내부적으로 save-fields 와 동일 핸들러) |
| POST | `/maintenance/patch/add-item` | 선택한 고객사(라인)에 품목 추가 (JSON body `{summary_id, items:[{item_name,manufacturer,item_version,item_detail}]}`) |
| POST | `/maintenance/patch/paste-preview` | 엑셀 붙여넣기 **미리보기** — DB 변경 없음 (JSON body `{text, has_header, column_order}`) |
| POST | `/maintenance/patch/paste-apply` | 엑셀 붙여넣기 **실제 반영** — 서버 재매칭 후 트랜잭션 일괄 UPDATE (동일 body) |
| POST | `/maintenance/patch/reset` | 전체 초기화 |
| GET | `/maintenance/patch/download-excel` | 엑셀 다운로드 (현재 필터 반영) |
| GET | `/maintenance/patch/options` | 조건 옵션 목록 (JSON) |

## 7. 엑셀 다운로드

화면에 표시된 컬럼과 **동일한 순서/구성**으로 출력됩니다 (`?cols=...` 를 그대로 전달).

- 기본: `제조사 · 품목 · 버전 · 고객사 · 패치필요` (화면 순서 그대로)
- "컬럼 선택"으로 추가한 항목(정엔지니어, 점검방식, 판정일시 등)도 엑셀에 함께 포함
- 값 변환: `patch_required` → `O`/공백, 날짜는 `YYYY-MM-DD`, 일시는 `YYYY-MM-DD HH:mm`

## 7-1. 품목 상세 필드 (신규 컬럼)

`tb_maintenance_summary_items` 에 아래 7개 컬럼이 추가되었습니다.
(`utils/patchSchema.js` 가 서버 기동 시 `INFORMATION_SCHEMA` 를 조회해 **없을 때만** 자동 `ALTER TABLE`)

| 컬럼 | 타입 | 화면 라벨 | 비고 |
|---|---|---|---|
| `model_name` | VARCHAR(255) | 모델명 | |
| `eos_date` | VARCHAR(50) | EoS | 지원종료일. 엑셀 표기가 제각각이라 문자열로 보관 |
| `eol_date` | VARCHAR(50) | EoL | 수명종료일. 위와 동일 |
| `serial_number` | VARCHAR(255) | S/N | 시리얼넘버. 붙여넣기 매칭의 1순위 키 |
| `fw_version` | VARCHAR(255) | FW버전 | 펌웨어 |
| `os_version` | VARCHAR(255) | OS버전 | |
| `inspection_location_item` | VARCHAR(255) | 점검위치 | 기본 표시 항목에서는 제외(컬럼 선택으로 켜기) |

기존 `item_name`(품목), `manufacturer`(제조사) 는 그대로 사용합니다.
위 10개 필드가 모두 **목록에서 인라인 편집** 가능하며(`EDITABLE_FIELDS`), 엑셀 다운로드에도 포함됩니다.

## 7-2. 엑셀 복사&붙여넣기 일괄 업데이트

대량 데이터를 한 번에 갱신하기 위한 기능입니다. 목록 상단 **`엑셀 붙여넣기`** 버튼 → 모달.

### 사용 흐름
1. 엑셀에서 **머리글(컬럼명) 행을 포함**해 셀 범위를 복사 (Excel → 메모장 경유 시 탭 구분 유지)
2. 모달의 입력란에 붙여넣기 → `미리보기`
3. 결과 표에서 상태/변경 전→후 값을 확인 → `적용`

### 입력 해석 (`utils/patchPaste.js`)
- 구분자: **탭(TAB) 우선**, 없으면 쉼표(,) 자동 판별
- 머리글: 첫 줄 셀이 알려진 라벨/별칭과 일치하면 자동 인식 (모달에서 `있음`/`없음` 강제 가능)
- 인식 헤더/별칭 예: `고객사`, `품목`(품목명·제품·장비), `제조사`·`벤더`, `모델명`·`모델`,
  `EoS`·`지원종료일`, `EoL`·`수명종료일`, `S/N`·`시리얼`·`serial`, `FW버전`·`펌웨어`,
  `OS버전`, `점검위치`·`설치위치`, `상세내용`
- 머리글이 없으면 **컬럼 순서**를 지정 (`기본 순서 채우기` 버튼: 품목, 제조사, 모델명, EoS, EoL, S/N, FW버전, OS버전, 점검위치)
- 한도: 최대 2,000행 / 1MB

### 매칭 규칙 (`matchRows`)
1. **S/N 이 있으면 S/N 우선 매칭** (가장 정확)
2. S/N 이 없거나 미일치면 **품목명**으로 찾고, `고객사 · 제조사 · 모델명` 으로 후보를 좁힘
3. 결과 상태
   - `matched` — 1건으로 특정됨
   - `ambiguous` (중복매칭) — 후보가 2건 이상. **반영하지 않음** → S/N 을 함께 입력
   - `not_found` (미매칭) — 대상 없음. 반영하지 않음

> ⚠️ 고객사 컬럼을 **반드시 포함**하는 것을 권장합니다.
> 실제 데이터에는 동일 품목명이 여러 고객사에 존재하므로, 고객사 없이 품목명만 넣으면 `중복매칭` 이 다수 발생합니다.

### 값 반영 규칙
- **빈 칸은 기존 값을 유지**합니다 (덮어쓰지 않음)
- 기존 값과 동일한 칸은 변경 목록에서 제외
- 실제 변경이 있는 행만 `UPDATE` (변경된 컬럼만 SET)
- 전체가 **하나의 트랜잭션** — 중간 실패 시 전부 롤백
- 적용 시점에 **서버가 다시 매칭**합니다 (클라이언트가 보낸 id 를 신뢰하지 않음)
- SQL 은 `PASTE_FIELDS` 화이트리스트의 컬럼명만 사용 (SQL 인젝션 차단)

### 응답 예시 (`paste-preview`)
```json
{
  "success": true,
  "headerDetected": true,
  "delimiter": "TAB",
  "fields": ["customer_company","item_name","model_name","serial_number","fw_version"],
  "counts": { "total": 3, "matched": 2, "changed": 2, "unchanged": 0, "notFound": 1, "ambiguous": 0 },
  "rows": [ { "index":1, "status":"matched", "strategy":"품목명+상세",
              "changes": [{"label":"FW버전","before":"7.0.12","after":"7.0.13"}] } ]
}
```

## 8. 라우트 등록 순서 주의

`app.js` 에서 `patchRoutes` 를 `maintenanceRoutes` **보다 먼저** 등록해야 합니다.
(`GET /maintenance/:id` 류 라우트가 `/patch` 를 삼키는 것을 방지)
