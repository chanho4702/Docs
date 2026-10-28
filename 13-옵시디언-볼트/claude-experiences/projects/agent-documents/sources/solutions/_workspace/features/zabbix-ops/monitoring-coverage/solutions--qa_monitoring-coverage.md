# 모니터링 커버리지 — 정적 계약 정합성 QA

검증일: 2026-08-21  
범위: Spring BE `GET /hosts/manage/coverage` ↔ React FE client/type/hook/page ↔ moveseye-ai `check_monitoring_coverage`

## 결과 요약

- 경로·HTTP method: 일치 (`GET /hosts/manage/coverage`).
- 요청 query: FE와 AI tool 모두 `groupId?: string`, `includeDisabled?: boolean`을 BE 계약대로 전달한다.
- 응답 shape: `MonitoringCoverageDto`/하위 DTO와 FE `TMonitoringCoverage`/`TCoverageFinding`의 필드명, nullable, scalar·배열 타입이 일치한다.
- envelope: BE `ApiResult<T>` → FE axios interceptor 1차 → `useDmoveQuery` 2차 언랩, AI `BeProxyClient` 언랩이 각각 올바르다.
- 인증: FE 공통 axios가 `x-visitor-id`를 주입하고, AI proxy도 사용자 cookie/Bearer 및 `x-visitor-id`를 BE로 전달한다.

| 항목 | 기대(BE/계약) | 실제(FE/AI) | 심각도 | 수정 제안 |
|---|---|---|---|---|
| HTTP 경로·메서드 | `GET /hosts/manage/coverage` | FE `API.get("/hosts/manage/coverage", { params })`, AI `be.get(..., "/hosts/manage/coverage", query)` | 통과 | 없음 |
| Query 계약 | `groupId` 선택, `includeDisabled` 기본 `false` | FE 타입이 두 필드를 optional로 선언. AI tool은 누락 시 `groupId=null`, `includeDisabled=false` | 통과 | 없음 |
| payload shape | summary 9개 number, 최상위 8개 필드, finding의 nullable `name/deviceType` 및 배열 `groups` | FE 타입이 1:1 일치 | 통과 | 없음 |
| envelope 언랩·오류 | `ApiResult<T>` 성공 data, 200+ERROR envelope도 query error | FE는 axios body 유지 후 `useDmoveQuery`에서 `envelope.data`; AI proxy는 SUCCESS 시 `root.data`, 실패 시 예외 | 통과 | 없음 |
| AI 분석 범위 보존 | 분석 버튼은 현재 선택한 `groupId`, `includeDisabled`, category/Host ID를 AI 문맥으로 전달 | 수정 후 전체·단건 프롬프트 모두 `groupId`(전체면 `null`) 및 boolean `includeDisabled`를 명시하고, tool에 같은 값을 사용하도록 지시한다. | 통과 (재검증) | 없음 |
| AI 프롬프트 재계산 의존성 | `groupId`를 사용하는 memoized prompt는 groupId 변경마다 재계산 | 수정 후 `useMemo` dependency array에 `groupId`가 포함되어, 그룹 ID 변경 시 프롬프트 범위도 함께 갱신된다. | 통과 (재검증) | 없음 |
| Host 단건 AI 문맥 | 선택 Host ID와 발견 category가 prompt에 있어야 함 | `ai_host_prompt`가 `hostId`, category를 전달한다. tool은 hostId filter를 제공하지 않아 결과 내 해당 ID를 모델이 골라 해석한다. | 정보 | 현 계약 범위에서는 정상. 단건 BE 재조회가 필요해질 때만 `hostId` query를 새 계약으로 추가한다. |

## 근거

- BE controller: `moveseye-be-spring/src/main/java/com/dmove/moveseye/host/coverage/MonitoringCoverageController.java:20-37`
- BE DTO: `moveseye-be-spring/src/main/java/com/dmove/moveseye/host/coverage/dto/*.java`
- FE type/client/hook: `moveseyee_fe/src/types/monitoring-coverage.ts:1-38`, `moveseyee_fe/src/services/monitoring-coverage.api.ts:7-10`, `moveseyee_fe/src/hooks/useMonitoringCoverage.ts:9-18`
- FE AI handoff: `moveseyee_fe/src/pages/zabbix-management/monitoring-coverage/MonitoringCoveragePage.tsx:63-74,119-128`, `moveseyee_fe/src/locales/kr.json:109-110`
- AI tool/proxy: `moveseye-ai/src/main/java/com/dmove/moveseyeai/tool/audit/CheckMonitoringCoverageTool.java:54-66`, `moveseye-ai/src/main/java/com/dmove/moveseyeai/be/BeProxyClient.java:82-123`
- FE envelope implementation: `moveseyee_fe/src/services/axiosInstance.ts:100-117`, `moveseyee_fe/src/hooks/useDmoveQuery.ts:43-57`

## 검증 한계

정적 대조만 수행했다. Spring endpoint 실호출/Swagger schema와 AI SSE의 실제 tool 선택은 별도 런타임 QA가 필요하다.

## 최종 판정

**통과.** 정적 BE·FE·AI 계약 불일치 및 미해결 항목 없음.
