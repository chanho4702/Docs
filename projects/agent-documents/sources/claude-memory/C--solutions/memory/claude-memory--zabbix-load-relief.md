---
name: zabbix-load-relief
description: "ZM-123 에픽(자빅스 부하 절감) — 병합·실측·통합 최종검수 8건 반영까지 완료(FIX 2커밋), ZM-134 보류. 미푸시"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7e5c77a3-f567-401c-8464-753c8f462ada
  modified: 2026-09-03T07:43:32.213Z
---

2026-09-03 ZM-123 에픽 구현 완료(계획은 09-02 분석 세션 — 정본 `_workspace/{analysis,planning}/*zabbix-load-relief*`).

- **✅ 2026-09-03 병합·런타임 실측 완료**: 사용자 승인으로 BE·FE 모두 master에 ff 병합(BE `922a708`·FE `ef951b0`, **미푸시**), zm-123 워크트리 제거. dev DB(5433)에 V42~V50 적용됨. :3002 실측 결과 — event_sync `every 15s` 등록·보정 1.6초/56건·증분 "0 new 0 changed"(무변화 무신호)·목록/벨 사본 서빙(그룹 JSON·조치 하이드레이션)·SSE 접속 즉시 events-changed+무visitorId 401·서버목록 1056→117ms(캐시)·3일 차트 정각 버킷 71점(trends, itemid 보존)·`[zabbix-calls]` 요약 로그 정상. 미실측 잔여: 조치(ack) 라운드트립(실 자빅스 쓰기라 보류)·FE 브라우저 E2E·풀 포화.
- **✅ 2026-09-07 통합 최종검수 반영 완료**: FIX 커밋 7개 미재검수 공백을 메우려 돌린 통합 codex 검수에서 HIGH2·MED6=8건 → 전건 반영, 커밋 `e0eea42`(이벤트 사본: 태그 권한 축 ProblemTagFilterGuard+usergroup selectTagFilters 감지·활성 시만 사용자 토큰 검증 fail-closed / 동기화 시간창 제거+좀비 정리 updated_at 2일 / recent 포함+창 내 해소 fillResolutions 즉석 채움+reconcile은 미해소만 / 호스트 필터 host_ids 축 / ack 읽음→broadcast 순서)·`b96e912`(메트릭: trends 전부-빈 RAW 폴백 / stats 문턴 1h 초과 판정(정확히 1h는 RAW 직행) / 상한 도달 그룹 원시 폐기→trends / 긴 창 trends-빈 아이템 원시 보완). 정본 `_workspace/features/events/zabbix-load-relief/review_zm123-final-integrated.md`. 🔴 검증은 격리 worktree에서 — 본체 트리에 APM 세션 미커밋 진행분(ApmAlertService 등 테스트 컴파일 불가)이 섞여 있어 전체 테스트는 본체에서 못 돈다. FIX 2커밋 재검수 진행.
- **✅ 2026-09-07 자체 재검수 2건 반영(`ff1822a`)** — 태그 가드 캐시 get/set JSON 대칭화(getRaw면 검증 5분 꺼짐)·업서트 r_clock CASE 가드. **문서화 완료**: moveseye-docs `features/자빅스-부하-절감-아키텍쳐.md` + **`improvements/` 개선 기록 6편**(전/후·설계 포인트·함정·성과 양식, `2b9e4fc`)(main `c50baf1`, pathspec 커밋 — 타 세션 30건 미커밋 재구성 존재) + 옵시디언 경험 노트. BE 총 19커밋(master, 미푸시).
- **완료 티켓**(작업당 커밋+`_workspace/reviews/review_zm-12x-*.md`+코덱스 검수 왕복): ZM-124 카운트7→1콜(cf4c951, 결함0) · ZM-125 목록/벨 사본 전환(7b6d228+c2706b7 — HIGH 권한 host_ids AND·fail-closed 반영) · ZM-126 호스트목록/가시성 캐시(592f437+2b8937e) · ZM-127 증분 15초/보정 5분(c1a75bd+4ce07b6 — HIGH: 경량 ZabbixProblem이 억제·원인 미탑재로 매 사이클 훼손) · ZM-128 SSE 스트림 BE(11bd25e+504f5e3)/FE(ef951b0) — 검수 5건 반영(세션 재검·단일 push·홈 키·5분 안전폴링) · ZM-129 풀+계측(6bf98b7+4073808) · ZM-130 trends 확산(24fecff+3b8ef5e) · ZM-131 상한+N+1(29bf466+922a708 — HIGH: getRange 무정렬 조각·아이템차트 48h trends 직행·인터페이스 상세 DESC+putIfAbsent) · ZM-133 책임경계 문서(moveseye-docs 4aae444 — 🔴 그 레포에 타 세션 재구성 미커밋 30건 있어 pathspec 커밋)
- **보류**: ZM-134(Connector 라이브 관제) — 태스크 문서의 착수 조건(주기·아이템 수 명세) 미충족으로 착수 안 함(사용자 보고 필요). T3.5(새로고침 셀렉터)는 티켓 미발급이라 미작업.
- 🔴 **마이그레이션 함정**: V49(event_problems 확장)·V50(interval_seconds)이 워크트리에만 있음 — **워크트리 BE를 dev DB(5433)에 기동하면 master(:3000) 기동이 Flyway validate로 깨진다** → 런타임 실측을 의도적으로 병합 후로 미룸.
- **병합 후 런타임 체크리스트**: 알람 목록/벨 응답 대조(권한 계정 포함)·조치 직후 반영·SSE 실연결(EventSource·프록시 buffering)·15초 동기화 로그·[zabbix-calls] 계측 로그·풀 포화·48h+ 차트 trends 렌더·9키→1콜 round-trip·스케줄러 화면의 event_sync 표시(15s vs 분 표기).
- 실측 함정(이번에 배움): 경량 problem.get 타입경로(ZabbixProblem)는 응답에 있어도 모델이 안 담으면 조용히 소실 · SseEmitter는 컨테이너 없으면 complete 콜백 비동기 · FE jest는 CPU 경합 시 대형 스위트가 타임아웃성 실패(master 기저 대조로 판별) · Zabbix 트리거 가시성=전 호스트 AND
- 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--collector-engine-direction|collector-engine-direction]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--event-stats-and-resolution-fix|event-stats-and-resolution-fix]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--architecture-onprem-scaleout-audit|architecture-onprem-scaleout-audit]]
