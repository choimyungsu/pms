# 패치관리 (Patch Management)

기존 아키텍처(Express + MySQL + EJS + xlsx)를 그대로 유지한 채 "유지보수 관리 > 패치관리" 메뉴를 추가했습니다.

## 1. 메뉴 위치
- 사이드바: 유지보수 관리 > **패치관리**
- URL: `GET /maintenance/patch`

## 2. 화면 구성
| 영역 | 내용 |
|---|---|
| 상단 요약 | 전체 대상 / 전체 패치필요 / 조회 결과 / 조회 결과 중 패치필요 |
| 조건 설정 | **고객사 / 품목 / 버전 복수 선택**(multiple select, Ctrl·Shift+클릭) + 실시간 미리보기(매칭 건수) |
| 목록 테이블 | NO, 고객사, 품목, 제조사/모델, 버전, 담당자(정), 담당자(부), 유지보수 기간, 패치필요(체크박스), 판정 정보 |
| 액션 | 조건 항목 체크 / 조건 기준 재설정 / 조건 항목 체크 해제 / 패치필요·불필요 필터 / **엑셀 다운로드** / 전체 초기화 |

## 3. 패치필요 판정 로직
조건 UI 에서 선택한 **품목**과 **버전**에 해당하는 행의 `patch_required` 필드만 1로 세팅합니다.

- `item IN (선택 품목들)`
- `(firmware_version IN (선택 버전들) OR os_version IN (선택 버전들))` — 버전은 펌웨어/OS 양쪽 매칭
- 고객사를 선택한 경우 `customer_company IN (선택 고객사들)` 조건 추가 (AND)

적용 모드 3가지
1. `check` — 조건 해당 행만 체크 (그 외 기존 값 유지)
2. `replace` — 전체 초기화 후 조건 해당 행만 체크 (트랜잭션)
3. `uncheck` — 조건 해당 행만 체크 해제

개별 체크박스 토글(`POST /maintenance/patch/toggle/:id`)과 전체 초기화(`POST /maintenance/patch/reset`)도 지원합니다.

## 4. 데이터
데이터 원천은 기존 `tb_maintenance` 테이블입니다. (고객사 customer_company / 품목 item / 버전 firmware_version·os_version / 담당자 main_engineer·sub_engineer)

추가 컬럼 (서버 기동 시 자동 점검 후 없을 때만 `ALTER`)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| patch_required | TINYINT(1) DEFAULT 0 | 패치필요 여부 |
| patch_required_at | DATETIME NULL | 판정 일시 |
| patch_required_by | VARCHAR(255) NULL | 판정자 |
| patch_condition | VARCHAR(500) NULL | 판정 조건 요약 |

- 스키마 점검: `utils/patchSchema.js` (INFORMATION_SCHEMA 로 존재 여부 확인 → 없으면 ALTER, idempotent)
- 수동 실행: `node utils/patchSchema.js`
- 수동 SQL: `add_patch_management_columns.sql`

## 5. 엔드포인트
| Method | Path | 설명 |
|---|---|---|
| GET | `/maintenance/patch` | 목록 (search, items[], versions[], customers[], patch, active_only, page) |
| GET | `/maintenance/patch/preview-count` | 조건 매칭 건수 미리보기 (JSON) |
| POST | `/maintenance/patch/apply-condition` | 조건 적용 (mode=check/replace/uncheck) |
| POST | `/maintenance/patch/toggle/:id` | 개별 패치필요 토글 (JSON) |
| POST | `/maintenance/patch/reset` | 전체 초기화 |
| GET | `/maintenance/patch/download-excel` | 엑셀 다운로드 (현재 필터 그대로 반영) |
| GET | `/maintenance/patch/options` | 조건 옵션 목록 (JSON) |

## 6. 엑셀 컬럼
고객사, 사업명, 품목, 제조사, 모델, S/N, 펌웨어 버전, OS 버전, 버전, 담당자(정), 담당자(부), 유지보수 담당자, 유지보수 시작일, 유지보수 종료일, **패치필요(O)**, 판정일시, 판정자, 판정 조건

## 7. 라우트 등록 순서 주의
`app.js` 에서 `patchRoutes` 를 `maintenanceRoutes` **보다 먼저** 등록해야 합니다.
(그렇지 않으면 `GET /maintenance/edit/:id` 형태의 기존 라우트가 `/patch` 를 삼킬 수 있음)
