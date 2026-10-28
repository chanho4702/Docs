# 모니터링 커버리지 API 계약

## 범위

AI 없이도 동작하는 관리자 read-only 진단 API다. Zabbix `host.get` 1회에서 `templates`, `itemCount`, `triggerCount`, agent interface의 `available` 상태를 얻어 판정한다. Host별 상세 조회와 `deep` 자원 계열 분석은 이번 범위에 포함하지 않는다.

## Endpoint

`GET /hosts/manage/coverage`

- 권한: `ADMIN`, `SUPER_ADMIN`만. `AdminAccessChecker.requireAdmin(currentUser)`를 사용한다.
- 응답 envelope: `ApiResult` (`status: "SUCCESS"`, `code: 200`, `data: MonitoringCoverageDto`). 권한 거부는 기존 규약대로 HTTP 200 + body `code: 403`.

### Query parameter

| 이름 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---:|---|---|
| `groupId` | string | 아니오 | 전체 | Zabbix Host group ID로 범위를 제한한다. |
| `includeDisabled` | boolean | 아니오 | `false` | `false`면 status=`"1"` Host를 판정에서 제외하고 `disabledSkipped`에 집계한다. |

## `data` — `MonitoringCoverageDto`

| 필드 | 타입 | 설명 |
|---|---|---|
| `summary` | `MonitoringCoverageSummaryDto` | 화면용 집계·점수 |
| `examined` | number | AI tool 호환: 실제 판정 Host 수 |
| `disabledSkipped` | number | AI tool 호환: 제외된 비활성 Host 수 |
| `noTemplate` | `CoverageFindingDto[]` | Template 미연결 Host |
| `collectingNothing` | `CoverageFindingDto[]` | Item 0개 Host |
| `noTrigger` | `CoverageFindingDto[]` | Item은 1개 이상, Trigger 0개 Host |
| `agentUnreachable` | `CoverageFindingDto[]` | type=`"1"` agent interface가 있고 `available="2"`인 Host. SNMP/ICMP 전용 장비는 제외 |
| `note` | string | AI tool 호환 안내 문구 |

### `summary` — `MonitoringCoverageSummaryDto`

`totalHosts`, `examinedHosts`, `disabledSkipped`, `findings`(사각지대가 하나 이상인 고유 Host 수), `coverageScore`(0~100), `noTemplateCount`, `collectingNothingCount`, `noTriggerCount`, `agentUnreachableCount` — 모두 `number`.

`coverageScore = 100 - round(findings * 100 / examinedHosts)`이며, `examinedHosts=0`이면 100이다.

### 목록 원소 — `CoverageFindingDto`

`hostId: string`, `host: string`, `name: string | null`, `deviceType: string | null`, `groups: string[]`, `items: number`, `triggers: number`, `why: string`.

## 🔄 FE 요청사항

- API client는 `/hosts/manage/coverage`를 사용한다. axios interceptor가 envelope를 한 번 벗기므로 hook의 결과는 위 `data` payload다.
- 기본 화면은 `includeDisabled=false`로 호출하고, 비활성 포함 토글을 제공할 수 있다.
- AI 분석 버튼에는 현재 `groupId`, `includeDisabled`, 그리고 선택한 category/Host ID를 prompt context로 넘긴다. 이 API 자체는 LLM을 호출하지 않는다.
