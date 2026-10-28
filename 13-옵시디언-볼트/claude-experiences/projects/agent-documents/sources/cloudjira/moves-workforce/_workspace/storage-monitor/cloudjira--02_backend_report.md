# 02 Backend Report — 저장공간 관리 (구 "DB 사용량 모니터링")

> 작성: backend-engineer
> 작성일: 2026-07-02
> 작업 위치(코드): 워크트리 `C:\CloudJira\moves-workforce-rfc151\` (브랜치 RFC-151)
> 입력: `_workspace/storage-monitor/DESIGN.md` §2 경계면 계약 / §3 백엔드 설계 / §10 backend 체크리스트
> 리더 확정 반영: 이름 "저장공간 관리", §7.3=(A) 수용, §3.4 에러코드 추가(선택 아님), §2 content 래핑 확정, P0 실측 생략(배포 검증 갈음)

---

## 1. 구현한 resolver 함수 + 실제 응답 shape (frontend 소비 계약)

### resolver: `getStorageUsage`
- 입력 파라미터: **없음** (`invoke('getStorageUsage')`)
- 등록 위치: `src/resolver/storage/StorageController.js` → `registerStorageController(resolver)` → `src/index.js` 등록 완료
- Service 반환: `{ content: StorageUsage }` → `responseWrapper`가 `{ success:true, ...result }`로 펼침

### 성공 응답 shape (글자 그대로 — frontend는 `res.content` 소비)

```jsonc
{
  "success": true,
  "content": {
    "limitBytes": 1073741824,      // number. resolveLimitBytes() 결과. 기본 1 GiB, STORAGE_LIMIT_BYTES 오버라이드
    "totalBytes": 734556160,       // number. Σ tables[].dataBytes
    "totalRows": 101712,           // number. Σ tables[].rows (근사치)
    "usedPercent": 68.4,           // number. round(totalBytes/limitBytes*1000)/10 (소수1자리). 100 초과 가능. limitBytes=0 방어 시 0
    "tables": [                    // dataBytes 내림차순 정렬 완료(backend 정렬)
      { "name": "worklog", "dataBytes": 524288000, "rows": 98000 },
      { "name": "users",   "dataBytes": 134217728, "rows": 3200  },
      { "name": "project", "dataBytes": 76050432,  "rows": 512   }
    ],
    "generatedAt": "2026-07-02T00:00:00.000Z"  // ISO 8601. new Date().toISOString()
  }
}
```

**필드 규약(구현 실제):**
- `tables[].name` = `information_schema.tables.table_name` 원본(스키마 접두 없음).
- `tables[].dataBytes` = `Number(COALESCE(data_length,0) + COALESCE(index_length,0))`.
- `tables[].rows` = `Number(COALESCE(table_rows,0))`.
- `tables`는 SQL `ORDER BY data_bytes DESC` + Service `.sort((a,b)=>b.dataBytes-a.dataBytes)` 이중 정렬(방어).
- 문자열 수치는 `Number()` 캐스팅, NULL/undefined는 `?? 0` 방어.
- 빈 결과 → `tables:[]`, `totalBytes:0`, `totalRows:0`, `usedPercent:0`.
- **임계치(80/90%)는 응답에 미포함** — 프론트가 `usedPercent`로 판정(서버 이중 정의 없음).

### 실패 응답 shape (responseWrapper 표준)

```jsonc
{
  "success": false,
  "error": {
    "name": "SqlError",
    "code": "STORAGE_USAGE_QUERY_FAILED",
    "message": "...",   // 원 에러 메시지
    "cause": "..."      // 원 SqlError(information_schema 접근 실패 등)
  }
}
```
- Service가 `findTableStats()` 예외를 `SqlError(ErrorCodes.STORAGE_USAGE_QUERY_FAILED, ...)`로 재-throw → responseWrapper 직렬화.
- 프론트 `useStorageUsage`는 `res.success===false || !res.content`면 `throw new Error(res.error?.code)` → React Query `isError` 경로.

> **계약 이탈 없음.** DESIGN §2-B / §2-C와 필드명·중첩·정렬·계산식 모두 일치. `content` 래핑 확정안 그대로.

---

## 2. 변경/신규 파일 (전부 워크트리 `moves-workforce-rfc151`)

### 신규 (도메인 `src/resolver/storage/`)
| 파일 | 내용 |
|------|------|
| `src/resolver/storage/StorageQuery.js` | `TABLE_STATS` SQL 상수(information_schema, `table_schema=DATABASE()`, `ORDER BY data_bytes DESC`) |
| `src/resolver/storage/storageConstants.js` | `DEFAULT_LIMIT_BYTES=1073741824`, `resolveLimitBytes()`(STORAGE_LIMIT_BYTES 오버라이드) |
| `src/resolver/storage/StorageRepository.js` | `findTableStats()` — `executeQuery(StorageQuery.TABLE_STATS)` 재사용, `rows ?? []` |
| `src/resolver/storage/StorageService.js` | `getStorageUsageService()` — 매핑·합산·정렬·usedPercent·`{content}` 반환, SQL 실패 시 STORAGE_USAGE_QUERY_FAILED 재-throw |
| `src/resolver/storage/StorageController.js` | `registerStorageController(resolver)` + `getStorageUsage` define(responseWrapper) |
| `src/resolver/storage/__test__/StorageService.test.js` | jest 순수 로직 테스트(Repository mock) 7건 |

### 수정
| 파일 | 변경 |
|------|------|
| `src/index.js` | `import { registerStorageController }` + `registerStorageController(resolver)` 등록 |
| `src/utils/errors/ErrorCodes.js` | `STORAGE_USAGE_QUERY_FAILED: 'STORAGE_USAGE_QUERY_FAILED'` 추가 |
| `src/seed/SeedData.js` | `addPermissionSeed`: Admin `STORAGE_MONITORING {read:true,write:true}`, Member `{read:false,write:false}` 추가 |
| `src/resolver/backoffice/permission/PermissionService.js` | 미등록 사용자 fallback 배열에 `STORAGE_MONITORING {read:false,write:false}` 추가 |

### 불변(설계대로 손대지 않음)
- MySQL 스키마/DDL/마이그레이션(`src/rdb/schema/`) — information_schema 읽기 전용, 신규 테이블 없음.
- KVS 엔티티 구조 — permission 시드 값만 추가(엔티티 신규 없음).
- `package.json`/`package-lock` — 무수정(node_modules 정션 공유).

---

## 3. 테스트 결과

명령: `npx jest src/resolver/storage` (워크트리 루트에서)

```
PASS src/resolver/storage/__test__/StorageService.test.js
  getStorageUsageService — 매핑/합산/정렬/usedPercent
    √ 정상: 매핑 + dataBytes DESC 정렬 + totalBytes/totalRows 합산 + usedPercent 소수1자리
    √ 문자열 수치(드라이버) → Number 캐스팅
    √ NULL/undefined 수치 방어 → 0
    √ 빈 결과 → tables:[], 전부 0
    √ usedPercent 는 100 을 초과할 수 있다(한도 초과)
    √ STORAGE_LIMIT_BYTES 환경변수 오버라이드 반영
    √ Repository 실패 → STORAGE_USAGE_QUERY_FAILED 코드 SqlError 재-throw

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

- 검증 커버리지: 매핑, dataBytes DESC 정렬(방어), totalBytes/totalRows 합산, usedPercent 소수1자리(68.4), 문자열/NULL 캐스팅, 빈 결과, 100% 초과, 환경변수 오버라이드, SQL 실패 재-throw.

---

## 4. 미검증 / 주의 (frontend·verifier 인계)

- **(P0 미검증) information_schema 실측**: 리더 지시대로 `forge tunnel` 실측은 생략. Forge SQL(TiDB)에서 `information_schema.tables` + `DATABASE()` 조회 가능 여부는 **배포 검증으로 갈음**한다. 조회 불가 시 `executeQuery`가 SqlError throw → Service가 STORAGE_USAGE_QUERY_FAILED로 감싸 → responseWrapper `{success:false,error}` → 프론트 `isError` 경로에서 SectionMessage로 graceful 처리됨(기능 크래시 아님).
- **TiDB 통계 근사치**: `data_length`/`index_length`/`table_rows`는 통계 기반 추정치이며 `ANALYZE TABLE` 이전엔 stale/0/NULL 가능. UI에 "추정치" 고지 권장(DESIGN §6 `storage.notice.estimate`).
- **기존 설치 Member 노출(§7.3)**: (A) 수용 — 시드 마이그레이션 없음. 기존 설치에서는 `STORAGE_MONITORING`이 permission 응답에 없어 프론트 fallback(`{read:true,write:true}`)으로 Member에게도 메뉴/페이지가 노출될 수 있음(읽기 전용·저민감이라 허용). 신규 설치는 Member=false 정상 적용.
- **환경별 한도**: 코드는 `STORAGE_LIMIT_BYTES` 오버라이드 훅만 제공. 실제 256/128 MiB 반영이 필요하면 배포 시 `forge variables set --environment <env> STORAGE_LIMIT_BYTES <bytes>` 운영 체크리스트 필요.
- **frontend 소비 포인트**: 반드시 `res.content`(중첩) 소비. `res` 최상위에는 `success`만 존재(사용량 필드는 flat이 아님).

---

## 5. 후속 확장 — 프로젝트별 사용량 (additive, 2026-07-03)

> 작업 위치: **메인 트리 `C:\CloudJira\moves-workforce\` (브랜치 RFC-134)** — RFC-151 머지 완료, 워크트리 삭제됨.
> 계약: 기존 `content` 필드 **전부 무변경**, `projects` / `unassignedBytes` **2필드만 추가**(additive). 기존 게이지/테이블 소비 경로 무회귀.

### 5-1. 확장된 성공 응답 shape (글자 그대로 — 추가분 강조)

```jsonc
{
  "success": true,
  "content": {
    "limitBytes": 1073741824,     // (기존) 무변경
    "totalBytes": 734556160,      // (기존) 무변경. Σ tables[].dataBytes
    "totalRows": 101712,          // (기존) 무변경
    "usedPercent": 68.4,          // (기존) 무변경
    "tables": [ /* (기존) 무변경. dataBytes DESC */ ],

    // ▼▼▼ 신규 추가 2필드 ▼▼▼
    "projects": [                 // estimatedBytes DESC 정렬
      { "projectId": "abc-uuid", "name": "테스트 프로젝트", "estimatedBytes": 12345678, "rows": 4321 }
    ],
    "unassignedBytes": 23456789,  // number. max(0, totalBytes - Σ projects[].estimatedBytes). 공통 영역(프로젝트 무관 테이블 + 미분배 잔여)
    // ▲▲▲ 신규 추가 2필드 ▲▲▲

    "generatedAt": "2026-07-03T00:00:00.000Z"  // (기존) 무변경
  }
}
```

**`projects[]` 항목 규약(구현 실제):**
- `projectId` = `BIN_TO_UUID(project_id)` 문자열(BINARY(16) → UUID 문자열).
- `name` = `project` 테이블 `project_name` 매핑. 매핑 없으면(삭제 잔재 등) `projectId` 그대로.
- `estimatedBytes` = `Math.round(Σ(프로젝트 행수 × 그 테이블 평균 행 크기))`. 평균 행 크기 = `dataBytes / max(rows,1)` (TABLE_STATS 결과 재사용, 인덱스 포함 근사).
- `rows` = 프로젝트가 project-scope 테이블들에서 차지하는 행수 합.
- `projects`는 **backend에서 `estimatedBytes DESC` 정렬 완료**.
- `unassignedBytes` = `max(0, totalBytes − Σ projects[].estimatedBytes)` — 음수 방어.
- NULL `project_id`(고아행)는 프로젝트에서 제외 → 공통 잔여(`unassignedBytes`)로 귀속.

### 5-2. 산정 방식 (근사 — 리더 확정)
- project-scope 테이블별 `SELECT BIN_TO_UUID(project_id) AS project_id, COUNT(*) AS cnt ... GROUP BY project_id`를 **병렬 실행**(`Promise.all`).
- 평균 행 크기 = information_schema `dataBytes ÷ max(rows,1)` (기존 `TABLE_STATS` 결과 재사용, 추가 information_schema 조회 없음).
- 프로젝트별 estimatedBytes = Σ(행수 × 평균 행 크기), rows = Σ 행수.

### 5-3. ⚠ 대상 테이블 — DDL 실측으로 정정 (코디네이터 가정과 상이)
`src/rdb/schema/ddl/` 실측 결과, 코디네이터 지시의 테이블명 2건이 실제와 달라 **실제 DDL 이름으로 구현**:
| 코디네이터 지시 | 실제 테이블명(DDL) | project 식별 컬럼 |
|----------------|-------------------|------------------|
| `project` | `project` | `project_id` (PK 자체, 프로젝트당 1행) |
| `project_users` | **`projectusers`** (언더스코어 없음) | `project_id` |
| `project_dashboard` | `project_dashboard` | `project_id` |
| `portfolio_snapshot` | **`portfolio_project_snapshot`** | `project_id` |
| `gantt_folder` | `gantt_folder` | `project_id` |
| `gantt_folder_issue` | `gantt_folder_issue` | `project_id` |

→ 6개 테이블 모두 project 식별 컬럼은 `project_id BINARY(16)`. 테이블명은 `information_schema.table_name`(소문자)과 정확히 일치하도록 상수화(평균 행 크기 매칭 조건).

### 5-4. 예외 방어 (safeFolderRows 패턴)
- **테이블별 격리**(`findProjectRowCounts`): 각 count 쿼리를 개별 try/catch로 감싸 실패 테이블은 빈 배열 처리 → 미마이그레이션 테이블(예: 아직 배포 안 된 gantt_*) 하나가 전체 breakdown을 무너뜨리지 않음.
- **외곽 폴백**(`getStorageUsageService`): breakdown 전체(이름 조회 등) 실패 시 `projects:[]`, `unassignedBytes:totalBytes`로 폴백 → **기존 게이지/테이블 응답 무회귀**(리더 확정).

### 5-5. 변경/신규 파일 (메인 트리)
| 파일 | 변경 |
|------|------|
| `src/resolver/storage/StorageQuery.js` | `PROJECT_NAMES` + `PROJECT_ROW_COUNTS`(6 테이블 상수 배열) 추가 |
| `src/resolver/storage/StorageRepository.js` | `findProjectNames()`, `findProjectRowCounts()`(병렬+테이블별 격리) 추가 |
| `src/resolver/storage/StorageService.js` | `buildAvgRowBytesMap`(비공개) + `computeProjectBreakdown`(export, 순수) 추가, `getStorageUsageService`에 `projects`/`unassignedBytes` additive 조립 + 외곽 폴백 |
| `src/resolver/storage/__test__/StorageService.test.js` | 프로젝트 breakdown 8건 추가(총 15건) |

> `StorageController.js` / `storageConstants.js` / `src/index.js` / `ErrorCodes.js` / `SeedData.js` / `PermissionService.js` — 확장에서 무변경.

### 5-6. 테스트 결과 (메인 트리)
명령: `npx jest src/resolver/storage`

```
Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```
추가 커버리지: 평균행크기×행수 합산·estimatedBytes DESC 정렬·unassignedBytes 산출, 이름 없는 프로젝트(id 폴백), unassignedBytes 음수 방어(max 0), breakdown 실패 폴백(게이지 무회귀), NULL project_id 제외, `computeProjectBreakdown` 순수 로직(빈입력/rows=0 방어/미존재 테이블 avg=0).
> 폴백 테스트 로그의 `console.error('storage project breakdown failed...')`는 의도된 폴백 경로 출력(실패 아님).

### 5-7. 미검증 / 주의 (확장분)
- **estimatedBytes는 근사치**: 평균 행 크기(테이블 전체 dataBytes÷rows, 인덱스 포함) × 프로젝트 행수. 프로젝트별 실제 행 크기 편차·JSON 컬럼(members_json 등) 크기 편차는 반영 안 됨. UI에 "추정치" 고지 권장.
- **P0 동일**: information_schema + `BIN_TO_UUID`/GROUP BY 실측은 배포 검증으로 갈음(tunnel 미실측). breakdown 쿼리 실패는 폴백으로 graceful.
- **frontend 소비**: `content.projects`(배열, estimatedBytes DESC 정렬 완료), `content.unassignedBytes`(number). 둘 다 실패 시에도 항상 존재(`[]` / `totalBytes`) → 안전하게 소비 가능.
