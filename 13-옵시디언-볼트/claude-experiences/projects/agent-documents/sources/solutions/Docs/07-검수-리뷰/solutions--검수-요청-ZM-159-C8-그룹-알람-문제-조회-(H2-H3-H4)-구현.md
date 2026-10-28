# 검수 요청 — ZM-159 C8 그룹 알람·문제 조회 (H2·H3·H4) 구현

- 요청: Claude · 2026-09-17 · 사용자 "다른 세션이랑 안 겹치게, 코덱스 시켜가면서"
- BE 워크트리 `C:/worktrees/zm-159-be`(브랜치 `ZM-159`, HEAD `8fa5ec2` = master) · **미커밋 변경 전부가 이번 범위**
- 설계: `_workspace/designs/devdesign_zm-159-c8-group-alert-scan.md` **§0 v1**(설계 검토 `review_zm-159-c8-design_codex.md` R1~R13 반영)

## 범위
| 층 | 변경 |
|---|---|
| engine-api | `AlertPort.countHistory`·`scanHistory`(abstract), `AlertScanOutcome(complete, stopReason, deliveredAlerts, calls)`, `AlertHistoryQuery.ofGroupWindowForScan` |
| engine-zabbix | `ZabbixAlertAdapter`: 필터/출력 조립을 `historyFilterParams`·`putHistoryOutput`로 분리(listHistory 요청 형태 불변), `countHistory`(event.get countOutput), `scanHistory`(`ZabbixQueryExecutor.scanByCursor` eventid/eventid_from, 예산 `max-scan-rows`, 조치·커서·상한 질의는 BAD_QUERY). `ZabbixCallLimits`: `zabbix.call.max-scan-rows`(기본 200만) |
| app | `LicenseGuardedAlertPort` 위임 2개 · **H3** `getProblemsByHostGroup` 흘려보내기 + 알람당 그룹 distinct + 완전 결과만 Redis 60초 캐시(키 principal·role·분 단위 from/to), 불완전 → ApiError · **H2-a** `getGroupAlertTrend` 버킷 총계 count → 0 아닌 버킷만 등급 count 5회(6번째=총계−합) · **H2-b** `ReportService.summarizeAlerts` 흘려보내기(eventid 오름차순 = 원본 순서), 불완전 → ApiError · **H4** `getHostGroupDetailProblems` 등급별 count 6회 + 호스트 조회 `output=[hostid]`·`selectTags=[tag,value]`, `recentEvents`=[]·`statusFilter`=statusCounts(`@Deprecated`), 원시 event/trigger/복구 조회 제거, 시그니처에 `CallerContext` 추가(컨트롤러 갱신), 미사용 private 3개(`calculateAlerts`·`countByStatus`·`formatDuration`) 제거 · `HostGroupProblemSummaryDto` `@Jacksonized`(캐시 되읽기 — 없으면 캐시 적중 시 500) |
| 테스트 | `ZabbixAlertAdapterScanTest`(신규 5) · `HostGroupProblemScanTest`(재작성 + 신규 5) · `HostGroupMonitoringTest`(알림 추이 건수 가짜) · `ReportServiceTest`(흘려보내기 가짜 + 신규 2) · `ZabbixClientBoundedReadTest`(빌더 필드) |

## 중점 확인 요청
1. **동작 동등성**: H3·H2-a·H2-b·H4의 숫자가 종전(전량 수신)과 같은가 — 특히 H2-a 버킷 경계([시작, 다음 시작−1], 첫 버킷은 from부터, 마지막은 to까지), 6번째 등급을 총계−합으로 두는 것(등급 값이 0~5 밖인 사건), H4 `alerts`/`safetyPercentage` 구분.
2. **H3 캐시**: 키 구성(권한 축 충분한가 — ZM-157 이후 `CallerContexts` 변화 포함), 분 단위 내림 키와 정확 초 집계의 불일치 허용 여부, 불완전 시 미캐시.
3. **어댑터 scanHistory**: 페이지 변환(`convertValue` → toAlert), deliveredAlerts 집계, `output`에 eventid 보장, 예외 번역 경로, `listHistory` 요청 형태가 리팩터 후에도 동일한가.
4. **H4 계약**: 폐기 필드 처리가 FE(`moveseyee_fe` `types/event-alert.ts`·`useTemplateInfo.ts`)·AI 서버(`moveseye-ai`)·Swagger에서 문제 없는가. 시그니처 변경의 다른 호출처.
5. **H2-a 호출 수**: 90일 창이면 버킷 91 × 최대 6 = 546 count 콜 — 허용 가능한가, 병렬·캐시(기존 60초) 외에 줄일 방법.
6. 테스트가 위를 실제로 고정하는가.

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정".

---

## 반영 기록 (2026-09-17, 코덱스 gpt-5.6-sol high → `review_zm-159-c8_codex.md`)
| 번호 | 판정 | 반영 |
|---|---|---|
| R1 필수 | 수용 | H3 집계 범위를 캐시 키와 같은 분 경계로 — `[floor(from), floor(to)+59]`. 테스트: 61..179 → 질의 60..179, 키 `60:120` |
| R2 필수 | 수용 | 알림 추이 기간 상한 93일(초과 → `INVALID_DATE`, 건수 질의 없음). FE는 7일 고정(최대 48콜), 상한에서 최대 약 560콜. 사전 집계는 범위 밖 |
| R3 필수 | 수용 | `ZabbixEventServiceImpl.getCount`가 `ZabbixQueryExecutor.strictCount`(public 전환)로 파싱 — null·객체·배열·비정수·음수는 `ZABBIX_API_ERROR`. 기존 계약 테스트(`{}`·null → 0)를 오류로 갱신, `ZabbixEventServiceImplCountTest` 신규 |
| R4 권장 | 수용 | 완전 스캔의 stopReason을 `"NONE"`으로 정규화. 테스트 추가 |
| R5 필수 | 수용 | `engine.proto`에 `CountHistory`·`ScanHistory`(server-streaming: 페이지들 + 마지막 `AlertScanOutcome`) 추가, `engine-api/README.md` 메서드 목록 갱신 |
| R6 권장 | 수용 | 알림 추이 3버킷 테스트 — 경계 시각(3599/3600), 첫·마지막 버킷 잘림, 6번째 등급 = 총계 − 5등급 합, DISASTER는 등급 질의에 없음 |
