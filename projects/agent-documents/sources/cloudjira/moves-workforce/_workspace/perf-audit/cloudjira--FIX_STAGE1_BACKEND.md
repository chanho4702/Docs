# 성능 감사 1단계 백엔드 수정 — A-1 / A-8

기준 보고서: `_workspace/perf-audit/BACKEND_2026-08-12.md`
작업일: 2026-08-12 · 범위: **A-1, A-8 두 건만** (다른 항목 미변경)

---

## A-1. 워크로그 추가 조회 페이지 크기 20 → 100

### 수정 파일

| 파일 | 라인(수정 후) | 변경 |
|------|--------------|------|
| `src/resolver/myWork/MyWorkService.jsx` | 114-125 (`getExtraWorklogs`) | `maxResult: 20` 인자 **제거** + 근거 주석 3줄 |
| `src/resolver/utils/worklog/WorklogService.js` | 209-220 (`getExtraWorklogs`) | 동일 |

> 보고서의 소비자 ② 경로는 `src/resolver/worklog/`가 아니라 **`src/resolver/utils/worklog/WorklogService.js`** 다(보고서 :58 표기가 정확, 의뢰 메시지 경로가 축약형).

### 선택한 값과 방식: **100 (래퍼 기본값 승계)**

`src/api/jira/worklog/WorklogApi.js:4` 의 시그니처가 이미 `maxResult = 100` 이다.
두 호출부에서 `maxResult` 인자를 **빼서** 이 기본값을 그대로 타게 했다.

- **왜 100인가**: Jira 전용 엔드포인트(`GET /issue/{key}/worklog`)는 API 기본 5000까지 허용한다. 20은 검색 응답 인라인 상한(`worklog.maxResults`)을 페이지 크기로 오인해 재사용한 값이고 두 값은 무관하다. 리포 내 대조군 `ResourceWorklogFetcher.js:6`·`ProjectCalendarService.js:11` 이 이미 `EXTRA_PAGE_SIZE = 100` 으로 운영 중이라 **동일 값으로 수렴**시켰다.
- **왜 새 상수를 만들지 않았나**: 상수를 새로 export 하면 리포 안에 100 리터럴이 3벌째가 된다. 래퍼 기본값이 이미 단일 출처이므로 두 호출부가 `WorklogApi.js:4` **한 곳**을 공유하게 하는 쪽이 자연스럽다(의뢰의 "래퍼 기본값 활용" 옵션). 각 호출부에 출처를 가리키는 주석을 남겼다.
- **미변경 유지**: `startAt = 20` 기본값(동봉 20건 이후부터 조회), 루프 종료 조건(`currentStartAt >= res.total`), 반환값(`all` = 워크로그 배열).

### 반환 shape

**불변.** `getExtraWorklogs` 는 두 파일 모두 내부(non-export) 헬퍼이며 워크로그 객체 배열을 반환한다. 페이지 크기는 루프 산술에 쓰이지 않는다(`currentStartAt += logs.length`) — 페이지당 건수만 늘고 누적 결과 집합은 동일하다.

### 기대 효과 (보고서 산정)

워크로그 200건 이슈 1개: Jira 9회 순차 → 2회. `/myWork` 진입 275회 → 65회(−77%).

---

## A-8. 대시보드 요약 SQL — PK 인덱스 복구

### 수정 파일

`src/rdb/query/ProjectDashboard.js:16` (`GETSUMMARY`)

```sql
-- before
WHERE BIN_TO_UUID(p.project_id) = ?
-- after
WHERE p.project_id = UUID_TO_BIN(?)
```

### 파라미터 확인

- 바인딩: `ProjectDashboardRepository.getSummaryDataRepository(project_id)` → `.bindParams(project_id)` — **UUID 문자열 1개**.
- 호출부 4곳 전부 UUID 문자열을 넘긴다: `ProjectDashboardController.js:35`(payload) · `ProjectCostService.js:102` · `ProjectProgressService.js:58` · `ProjectUsersService.js:171`.
- 관례 일치: `src/rdb/query/` 9개 파일에서 `project_id = UUID_TO_BIN(?)` 형태가 46회 사용 중 — 동일 형태로 맞췄다.

### 안티패턴 잔존 여부 (검증)

`grep "WHERE BIN_TO_UUID"` / `BIN_TO_UUID(...) =` → `src/` 전체에서 **이 한 곳이 유일**. 보고서 :227 의 "앱 전체에서 이 한 곳만" 진술과 일치하며, **보고서에 없던 추가 발견 없음**.
(SELECT 절의 `BIN_TO_UUID(p.project_id) AS project_id` 는 출력 변환이라 인덱스와 무관 — 그대로 둠.)

### 반환 shape

**불변.** SELECT 절·`GROUP BY`·컬럼 별칭 전부 미변경. `{ project_id, project_name, start_date, end_date, total_member_count, total_salary }` 그대로.

> 보고서가 함께 언급한 후속(진척/비용을 `findProjectByIdRepository` PK 조회로 전환, 미사용 `total_salary` 조인 제거 = B-5)은 **범위 밖이라 미수행**.

---

## 테스트

루트 `npm test` (jest) 전체 실행:

```
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
Time:        27.007 s
```

`SalaryPolicyLeak.test.js` 의 `getSummaryDataService` 계약 테스트(#10, 서비스 shape 무변경 검증) 포함 전부 통과.
로그에 보이는 `[LICENSE] ... non-success status` 는 `LicenseGuard.test.js:151` 이 의도적으로 유발하는 상류 장애 시나리오의 `console.error` 로, 실패가 아니다.
