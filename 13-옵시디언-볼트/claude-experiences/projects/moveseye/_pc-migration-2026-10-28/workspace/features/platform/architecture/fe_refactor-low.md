# FE LOW 정리 (타입 계약 교정 + 죽은 코드 제거)

- 일자: 2026-07-01
- 대상: `moveseyee_fe` (FE만, BE 미변경)
- 검증: `npm run build`(tsc+vite) 통과. 각 변경 전 grep으로 소비처 확인.

## 처리 결과 (8항목)

| # | 항목 | 처리 | 근거/소비처 | 파일 |
|---|------|------|------------|------|
| 1 | `resolvedBy` string→객체 | 정정 | BE `EventDetailResDto.ResolvedBy(Long zabbixUserId, String username)`. FE 렌더 소비처 없음(타입 정의만) → 접근경로 수정 불필요. `TResolvedBy` 신설, `TEventDetails.resolvedBy?: TResolvedBy` | `types/event.ts` |
| 2 | event host `hostId`→`hostid` | 정정 | BE `EventInfoResDto.HostRef(String hostid, String name)`. 소비처 `ListEventsTable.tsx`는 `record.host.*` 미접근 → 런타임 회귀 없음 | `types/event.ts` |
| 3 | `TByHostGroup.hostNames` `string[]`→`string` | 정정 | BE `HostGroupProblemSummaryDto.hostNames: String`(콤마구분). `ByHostgroup.tsx:76`가 `value.split(",")` 하므로 런타임 이미 string 기준 정상, 라벨만 교정 | `types/event-alert.ts` |
| 4 | `RecentEvent.hostIp` 추가 | 추가 | BE `HostGroupDetailProblemDto.ProblemItem`에 `hostIp` 존재, `ByHostgroupDetail.tsx:42`가 `record.hostIp` 렌더 중이나 타입 누락이었음 | `types/event-alert.ts` |
| 5 | `TProblemDetail.triggerId` enum→`string` | 정정 | BE `ProblemDetailResDto.triggerId: String`(트리거 id). `E_PROBLEM_SCOPE` 오타이핑 → `string`. import는 `TEventDetailForm.scope`가 계속 사용해 유지 | `types/event.ts` |
| 6 | `TByHostGroupDetail.hostIp`(top-level) 제거 | 제거 | BE `HostGroupDetailProblemDto`에 대응 top-level 필드 없음. 소비처 없음(`record.hostIp`는 RecentEvent 소비 → #4에서 처리) | `types/event-alert.ts` |
| 7 | 고아 `createReport` 제거 | 제거 | `ReportService`는 어디서도 import 안됨(grep=self만), BE 매핑 없음. `report.api.ts` 파일 삭제 + `types/report.ts`의 `TReport`/`TReportRequest` 제거. `TProblemOverview`/`TReportChart`는 소비처(ReportChart/ProblemOverviewTable) 있어 존치 | `services/report.api.ts`(삭제), `types/report.ts` |
| 8a | 세션 `lastValue` number→`string` | 정정 | BE `SessionSummaryDto.lastValue: String`(scan_host-core #4 CONFIRMED). 소비 체인 `getIndicatorData`→`ListGraphIndicator`→`GrapthIndicator.sessionLastValue` 도 `number?`→`string?`로 함께 교정(텍스트 렌더라 회귀 없음) | `types/host-monitoring.ts`, `components/GrapthIndicator/GrapthIndicator.tsx` |
| 8b | 시계열 `TDataTimestamp.value` | **스킵** | BE `HistoryPointDto/DataTimestampDto.value`는 Java `Object`(number/string 미확정, Zabbix history는 통상 문자열값). 현재 FE `string` + `parseFloat`로 런타임 흡수(qa_fullscan-recheck #2 비차단 판정). number로 바꾸면 `parseDataChart` 시그니처·`useGroupResourceTrend`(`String(point.value)`) 등 차트 유틸 광범위 cascade + 회귀 위험만 → churn 회피 원칙에 따라 미변경 | — |

## 미처리(의도적 존치)
- `getProblemActionLogList`(`event.api.ts:72`): BE 정리와 짝지어 다음 BE 패스에서 제거 예정 → 이번엔 손대지 않음.
