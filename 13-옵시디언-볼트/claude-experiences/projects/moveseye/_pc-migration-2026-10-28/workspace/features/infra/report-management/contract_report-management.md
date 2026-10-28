# API 계약 — 리포트 관리 (report-management)

작성: be-engineer / 2026-06-23
대상: fe-engineer, integration-qa, functional-qa
구현: **Spring 단일 채택** (`moveseye-be-spring`) — Nest 미반영(BE Spring 채택 확정).
베이스 데이터: `host_group_report` (features/infra/hostgroup-and-reports/contract_group-report.md / features/infra/hostgroup-and-reports/contract_group-report-hosts.md 의 스냅샷 테이블).

---

## 0. 공통 사항

- **권한**: 전 EP **관리자 전용**. ⚠️ **userRole 기준** 체크(2026-06-23 변경). 전역 `RolesInterceptor`(@RolesGuarded+@Roles)는 JWT `roleid`로 비교하는데 zabbix_userid=NULL인 순수 admin 계정은 roleid=null이라 `@Roles(ADMIN)`을 통과하지 못해 admin이 403으로 막혔다(functional-qa 진단, e2e_report-management.md). 그래서 이 컨트롤러는 `@RolesGuarded`/`@Roles`를 떼고 각 메서드 진입부에서 `AdminAccessChecker.requireAdmin(currentUser)`로 **`userRole`이 ADMIN 또는 SUPER_ADMIN**인지 명시 체크한다. SUPER_ADMIN 항상 통과, 일반 USER 거부. 전역 인터셉터 거동은 미변경(다른 화면 회귀 방지).
- **인증**: Bearer JWT + 헤더 `x-visitor-id` 필수(`@VisitorIdCheck`). 기존 host/admin EP 공통.
- **응답 envelope**: 표준 `ApiResult<T>`.
  ```json
  { "status": "success", "code": 200, "errorCode": null, "message": null, "data": <T> }
  ```
- ⚠️ **FE 언랩 깊이**: axios 인터셉터 + `useDmoveQuery`가 응답을 **2겹 언랩** → 훅 소비자는 아래 "응답 data"(= `T`)를 **직접** 수신.
- **권한 거부 → HTTP 200 + body `code:403`** (기존 거동 보존). 401만 실제 상태코드.

---

## 1. GET /admin/reports — 저장된 리포트 목록 (관리용)

저장된 `host_group_report` 스냅샷을 페이지네이션으로 반환. **목록은 가벼운 컬럼만**(resource/alerts/hosts jsonb 본문 제외).
정렬: `periodStart` desc (동률 시 `id` desc). `groupName`은 Zabbix host group 이름을 **1회 조회 후 매핑**(행마다 조인 아님).

### 요청 (query)
| 이름 | 타입 | 필수 | 기본 | 설명 |
|---|---|---|---|---|
| `groupId` | string | ❌ | — | 그룹 필터. 빈 문자열은 필터 없음 |
| `periodType` | `"WEEK" \| "MONTH"` | ❌ | — | 기간 단위 필터(대소문자 무관). 그 외 값은 필터 없음 |
| `limit` | number(int) | ❌ | 20 | 페이지 크기. 1~100 클램프 |
| `offset` | number(int) | ❌ | 0 | 오프셋. 음수면 0 |

### 응답 data: `PaginationResponseDto<ReportListItemDto>`
```jsonc
{
  "items": [
    {
      "id": 123,                       // number(int) — 삭제 API에 넣는 식별자
      "groupId": "10",                 // string — Zabbix host group id
      "groupName": "Production",       // string — Zabbix 그룹 이름(매핑 실패 시 groupId fallback)
      "periodType": "WEEK",            // "WEEK" | "MONTH"
      "periodStart": "2026-06-08",     // string YYYY-MM-DD (UTC)
      "periodEnd": "2026-06-14",       // string YYYY-MM-DD (UTC, 포함 마지막 날)
      "hostCount": 12,                 // number(int)
      "createdAt": "2026-06-15T03:00:00.000Z"  // string ISO(UTC, .SSS'Z' 패턴) — setting 엔티티와 동일
    }
  ],
  "total": 137                         // number(long) — 필터 적용 후 전체 개수(페이지 무관)
}
```
> ⚠️ 목록엔 `resource`/`alerts`/`hosts` 본문이 **없다**(가벼움). 상세 본문이 필요하면 기존 사용자용 EP(`GET /hosts/{groupid}/reports/detail`)를 쓴다.
> Zabbix 그룹 이름 조회가 실패해도 목록은 `groupName = groupId` fallback으로 정상 응답(에러 아님).

---

## 2. DELETE /admin/reports — 리포트 일괄 삭제

선택한 **id 목록**으로 삭제. 존재하지 않는 id는 무시(**멱등**), 실제 삭제 건수 반환.

### 요청 (JSON body)
```jsonc
{ "ids": [123, 124, 999] }   // number[] — @NotEmpty (빈 배열이면 검증 에러)
```
> ⚠️ DELETE에 **본문(body)** 사용. axios `delete(url, { data: { ids } })` 형태로 보낼 것.

### 응답 data: `DeleteReportsResDto`
```jsonc
{ "deletedCount": 2 }   // number(int) — 요청 id 중 실제 존재해 삭제된 건수
```

---

## 3. GET /admin/reports/retention — retention 설정 조회

자동삭제 정책 현재값. 설정 행이 없으면(시드 미적용 환경) 기본값을 노출(저장은 하지 않음).

### 응답 data: `RetentionSettingDto`
```jsonc
{
  "enabled": true,                // boolean — cleanup 배치 활성/비활성
  "weekRetentionWeeks": 52,       // number(int) — WEEK 스냅샷 보존 주 수(기본 52)
  "monthRetentionMonths": 24      // number(int) — MONTH 스냅샷 보존 개월 수(기본 24)
}
```

---

## 4. PUT /admin/reports/retention — retention 설정 저장

### 요청 (JSON body)
| 이름 | 타입 | 필수 | 제약 | 설명 |
|---|---|---|---|---|
| `enabled` | boolean | ✅ | not null | cleanup 활성 여부 |
| `weekRetentionWeeks` | number(int) | ✅ | 1~520 | WEEK 보존 주 수 |
| `monthRetentionMonths` | number(int) | ✅ | 1~120 | MONTH 보존 개월 수 |

```jsonc
{ "enabled": true, "weekRetentionWeeks": 52, "monthRetentionMonths": 24 }
```

### 응답 data: `RetentionSettingDto` (저장된 값, §3과 동일 shape)

> 유효성 위반(필드 누락/범위 밖)은 표준 검증 에러로 응답(`ApiResult` error envelope).

---

## 5. 상태코드 / 에러

| 상황 | HTTP | body |
|---|---|---|
| 정상 | 200 | `status:"success"`, `data` |
| 인증 실패 | 401 | `status:"error"`, `code:401` |
| 권한 거부(비-ADMIN) | **200** | `status:"error"`, `code:403` (기존 거동 보존) |
| 검증 실패(ids 빈 배열, retention 범위 밖 등) | 400/200 | `status:"error"` + 메시지 |

---

## 6. 설정 저장 방식 (확정)

- **전용 소형 테이블 `report_retention_setting`** (단일 행 id=1).
  - 기존 `setting` 테이블은 키가 **PG enum `setting_type_enum`(CLOUD/ZABBIX)** 이라 신규 키 추가가 enum 변경(위험·공유 dev DB)이라 부적합 → 전용 테이블로 분리.
- 컬럼: `id`, `enabled boolean`, `week_retention_weeks int`, `month_retention_months int`, `updated_at timestamp`.
- Flyway: **신규 `V4__report_retention_setting.sql`** (기적용 V1~V3 무수정 — CLAUDE.md §3 #7).
  - `CREATE TABLE IF NOT EXISTS ...` + 기본 1행 `INSERT ... ON CONFLICT (id) DO NOTHING` (멱등).
  - ⚠️ 이 repo 현재 상태에선 `host_group_report.hosts` 컬럼이 **V3에 인라인 포함**(별도 V4 미존재) → 다음 가용 버전이 **V4**. (contract_group-report-hosts.md의 "V4=hosts" 메모는 다른 작업본 기준이며, 본 repo에는 hosts 전용 V4 파일이 없다.)

---

## 7. cleanup 배치 (확정)

- 위치: `ReportSchedule.cleanupReports()` — `@Scheduled(cron = "0 0 4 * * *")` **매일 04:00(UTC)**.
- 동작: retention `enabled`면 아래 삭제, `enabled=false`면 **skip(0 반환)**.
  - `period_type='WEEK' AND period_start < (today - weekRetentionWeeks주)`
  - `period_type='MONTH' AND period_start < (today - monthRetentionMonths개월)`
- 삭제 건수 로그. 중복 실행 방지 `isCleanupRunning` 가드(집계 배치와 분리).

---

## 8. FE 타입 제안 (TypeScript)

```ts
export type ReportPeriodType = 'WEEK' | 'MONTH';   // 기존 재사용

// GET /admin/reports → PaginationResponseDto<ReportListItem>
export interface ReportListItem {
  id: number;
  groupId: string;
  groupName: string;
  periodType: ReportPeriodType;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD
  hostCount: number;
  createdAt: string;     // ISO UTC (yyyy-MM-ddTHH:mm:ss.SSSZ)
}
export interface PaginationResponse<T> { items: T[]; total: number; }

// 목록 쿼리
export interface SearchReportListParams {
  groupId?: string;
  periodType?: ReportPeriodType;
  limit?: number;   // 기본 20, 1~100
  offset?: number;  // 기본 0
}

// DELETE /admin/reports  (body 사용)
export interface DeleteReportsBody { ids: number[]; }
export interface DeleteReportsResult { deletedCount: number; }

// GET/PUT /admin/reports/retention
export interface RetentionSetting {
  enabled: boolean;
  weekRetentionWeeks: number;
  monthRetentionMonths: number;
}
// PUT body = RetentionSetting (전 필드 필수, week 1~520 / month 1~120)
```

---

## 9. FE 주의점

- **목록 컬럼(테이블)**: `id`(삭제용 선택 키), `groupName`(표시), `groupId`, `periodType`, `periodStart`~`periodEnd`, `hostCount`, `createdAt`. resource/alerts 본문은 목록에 없음.
- **삭제 요청형태**: `DELETE /admin/reports` + **JSON body `{ ids: number[] }`**. 빈 배열은 검증 에러(서버 거부) → 선택 0개면 호출하지 말 것.
- **삭제 응답**: `{ deletedCount }`. 멱등이라 새로고침 후 사라진 행 재삭제해도 에러 아님(0 반환).
- **설정 폼 필드**: `enabled`(스위치/체크박스), `weekRetentionWeeks`(int, 1~520), `monthRetentionMonths`(int, 1~120). 기본값 true/52/24. PUT은 전 필드 필수.
- **권한**: ADMIN 메뉴에서만 노출. 비-ADMIN 접근은 200+code:403(기존 거동) → 기존 403 처리 로직 재사용.
- **페이지네이션**: `total` 기반 페이저. `limit`/`offset` 쿼리(admin 관례 동일).
- **2겹 언랩 규약 그대로**: 훅 소비자는 `PaginationResponse<ReportListItem>` / `DeleteReportsResult` / `RetentionSetting` 를 직접 수신.

---

## 10. 변경 파일 (Spring)

신규:
- `domain/ReportRetentionSetting.java` — 단일 행 설정 엔티티
- `host/repository/ReportRetentionSettingRepository.java`
- `host/report/ReportManagementService.java` — 목록/삭제/retention/cleanup
- `host/report/ReportManagementController.java` — `/admin/reports` 4개 EP
- `host/report/dto/` — `SearchReportListDto`, `ReportListItemDto`, `DeleteReportsReqDto`, `DeleteReportsResDto`, `RetentionSettingDto`, `UpdateRetentionSettingDto`
- `resources/db/migration/V4__report_retention_setting.sql`
- `test/.../host/report/ReportManagementServiceTest.java` (10 cases)

수정:
- `host/repository/HostGroupReportRepository.java` — `searchForAdmin`/`deleteByIdIn`/`deleteByPeriodTypeAndPeriodStartBefore`/`findDistinctGroupIds`
- `host/report/ReportSchedule.java` — `cleanupReports()` `@Scheduled` 매일 04:00 + `isCleanupRunning` 가드

---

## 11. 검증

- `JAVA_HOME=jdk-17 gradlew build`(전체 테스트 포함) ✅ **BUILD SUCCESSFUL**.
- `ReportManagementServiceTest` **10/10 pass**(목록 happy/이름 fallback/Zabbix 에러/필터 empty, 삭제 happy/empty, retention 기본값/저장, cleanup enabled cutoff/disabled skip).
- :3000 기동 프로세스 미접촉(빌드만 수행).
