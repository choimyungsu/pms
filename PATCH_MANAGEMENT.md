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

- **목록 테이블: 고객사 / 품목 / 제조사 / 버전 / 패치필요** (요청사항)
  - **품목 / 제조사 / 버전 3개 셀 모두 인라인 편집 input** — 여러 행을 동시에 수정하고 "변경사항 저장" 으로 일괄 반영
  - 품목 셀 하단에 상세내용(`item_detail`, 읽기 전용) 표시
  - 버전 셀 하단에 판정자·판정일 표시
- 상단 요약: 전체 품목 / 전체 패치필요 / 조회 결과 / 조회 결과 중 패치필요
- 조건 설정: **고객사 / 품목 / 버전 복수 선택**(multiple select, Ctrl·Shift+클릭) + 실시간 미리보기
- 액션: 조건 항목 체크 / 조건 기준 재설정 / 조건 항목 체크 해제 / 패치필요·불필요 필터 / **엑셀 다운로드** / 전체 초기화

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
| GET | `/maintenance/patch` | 목록 (search, items[], versions[], customers[], patch, page) |
| GET | `/maintenance/patch/preview-count` | 조건 매칭 건수 미리보기 (JSON) |
| POST | `/maintenance/patch/apply-condition` | 조건 적용 (mode=check/replace/uncheck) |
| POST | `/maintenance/patch/toggle/:id` | 개별 패치필요 토글 (JSON) |
| POST | `/maintenance/patch/save-fields` | 품목/제조사/버전 복수행 일괄 저장 (JSON body `{rows:[{id,item_name?,manufacturer?,item_version?}]}`) |
| POST | `/maintenance/patch/save-versions` | 하위 호환 — 버전 전용 저장 (내부적으로 save-fields 와 동일 핸들러) |
| POST | `/maintenance/patch/reset` | 전체 초기화 |
| GET | `/maintenance/patch/download-excel` | 엑셀 다운로드 (현재 필터 반영) |
| GET | `/maintenance/patch/options` | 조건 옵션 목록 (JSON) |

## 7. 엑셀 컬럼

**고객사, 품목, 제조사, 버전, 패치필요(O), 판정일시, 판정자, 판정 조건**, 사업명, 상세내용, 담당자(정), 담당자(부), 유지보수 시작일, 유지보수 종료일

## 8. 라우트 등록 순서 주의

`app.js` 에서 `patchRoutes` 를 `maintenanceRoutes` **보다 먼저** 등록해야 합니다.
(`GET /maintenance/:id` 류 라우트가 `/patch` 를 삼키는 것을 방지)
