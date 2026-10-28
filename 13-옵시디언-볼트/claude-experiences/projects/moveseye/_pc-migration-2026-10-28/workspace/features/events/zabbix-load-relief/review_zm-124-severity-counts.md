# 검수 요청 — ZM-124 알람 심각도 카운트 7콜 → 1콜 통합

- 커밋: `cf4c951` (브랜치 `ZM-123`, 워크트리 `C:/worktrees/zm-123-be`)
- 에픽: ZM-123 무브스아이 성능 향상
- 작성: 2026-09-03

## 범위·의도

알람 화면 배지·알림 벨·홈 KPI가 심각도별 카운트를 위해 `problem.get countOutput`을 등급마다
따로(전체 1+등급 6 = 7콜, 홈은 6콜) 부르던 것을 **경량 목록 1콜**로 통합.

- `engine-api`: `AlertPort.countActiveBySeverity` 신설 — **default 구현 = 기존 등급별 countActive 반복**
  (등급 분포를 싸게 못 내는 소스의 폴백), 반환 모델 `AlertSeverityCounts`(명시 필드 6개+파생 total).
- `engine-zabbix`: `ZabbixAlertAdapter`가 오버라이드 — `problem.get output:["severity"]` 1콜 후 자바 집계.
  `enabledRulesOnly`는 기존 countActive와 같은 재료(트리거 id 캐시·500청크·빈 objectids 차단) 재사용.
- 소비자 전환 3곳: `EventService.getStatusCounts`(7→1), `HostEventService.getStatusCounts`(7→1)
  + `getInfo`의 중복 `countActive` 제거(총 9→2콜, total은 전량 목록 크기로 대체),
  `HomeService.safeAlarm`(6→1).
- `LicenseGuardedAlertPort`: 새 메서드 오버라이드(안 하면 default가 데코레이터의 countActive를 7번 불러 최적화 무효).

## 불안한 지점 (여기를 봐 달라)

1. **집계 의미 동등성**: countOutput 7회 합산 ↔ 경량 목록 1회 자바 집계가 항상 같은 수인가.
   특히 `HostEventService.getInfo`의 `total`을 `countActive` → `alerts.size()`로 바꾼 것 —
   listActive(문제 파라미터 동일·무제한)와 countOutput이 다른 수를 줄 수 있는 Zabbix 엣지가 있는지.
2. **포트 계약의 severities 무시 축**: `countActiveBySeverity`는 query.severities를 무시한다(분포가 목적).
   기존 `withSeverities` 덮어쓰기 의미와 맞춰놨지만, 새 소비자가 "특정 등급만 집계"를 기대하면 함정.
3. **본문 크기 트레이드오프**: 활성 알람이 수만 건인 설치본이면 경량 목록 1콜의 응답 본문이
   카운트 7콜보다 커질 수 있다. (활성 problem은 통상 수백~수천이라 수용으로 판단 — 반박 환영)
4. `HostEventService.getStatusCounts`의 기존 정규화(4-인자 사본: 호스트/기간/키워드만 유지)를
   보존했는데, base의 다른 플래그를 버리는 게 맞는지 재확인.

## 검증 / 미검증

- ✅ BE 전체 테스트 그린(`:test`+`:engine-zabbix:test`, 2m50s). 어댑터 신규 테스트 3건(1콜·빈 트리거 차단·청크 합산),
  소비자·데코레이터 테스트 갱신.
- ❌ 실서버 런타임 대조(개편 전/후 카운트 동일성) 미실시 — dev 자빅스 대조 예정.

## 검수 결과 (2026-09-03, codex exec)

**결함 없음.** 근거: severity 제약만 제거하고 나머지 필터 보존 확인 · `alerts.size()` total 동등성 확인
(무제한 동일 필터) · 데코레이터 직접 위임·게이트 유지 · enabledRulesOnly 빈 objectids 차단·청크 합산
구현/테스트 확인. (원문: scratchpad codex-review-zm124.txt, 95k tokens)
