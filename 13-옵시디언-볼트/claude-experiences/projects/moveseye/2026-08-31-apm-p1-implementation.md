# 2026-08-31 APM P1 구현 — 설계 v3.2에서 종단 검증·코덱스 2회·메뉴 단위 재구성까지 (하루+)

**상태**: P1 BE 전 구간 + FE 화면 10개 구현·커밋 4개(#ZM-122, 미푸시). 메뉴 단위 패키지 재구성은 미커밋(승인 대기). 정본: `_workspace/features/apm/core/devdesign_apm.md` v3.2, 로직 분석 `_workspace/features/apm/core/apm-p1-logic-analysis.md`, 도움말 정본 `_workspace/guides/apm-screen-chart-guide.md`.

## 흐름
R1 실측(Collector 0.159.0·javaagent 2.31.1, json 세 경로) → 에이전트 병렬(BE 메인 트리 + git worktree, FE 별도) → 계약서 §1~8 → self-monitoring 종단(빈 DB `dmove_apm`, BE 사본 :3001이 자기 자신을 감시, 데모 Zabbix 실 프로비저닝) → 코덱스 1차(🔴1·🟡2) → 차트 표 전환·툴팁·도움말 → 로직 분석 문서 → 결함 5건 수정 → 코덱스 2차(🔴3·🟡2) → 수집기 화면 → 패키지 재구성.

## 실측이 설계를 바꾼 것
- 🔴 **Collector는 HTTP 500을 Permanent error로 즉시 폐기**(재시도는 429·502·503·504만). "적재 실패=500이면 exporter가 재시도"라는 기존 AI 모니터링 주석은 틀렸었다 → 503으로 정정.
- 🔴 exemplar `filteredAttributes`에 원문 SQL·url.full·IP가 실리고 **Collector 프로세서는 exemplar를 안 만진다** → BE 폐기가 유일한 방어.
- delta 선호를 켜도 UpDownCounter(jvm.memory·pool count·active_requests)는 CUMULATIVE → 포인트 단위 temporality 판정.
- `history.push`: 아이템 생성 직후는 서버 설정 캐시 미동기로 "No permissions to referred object or it does not exist"(같은 문구가 권한 없음/없음/미동기를 겸함) · 응답 `response:success`는 수신 확인일 뿐 항목별 `data[i].error`를 봐야 함 · 잘못된 타입은 push 성공 후 NOT_SUPPORTED · `problem.get recent:true`는 최근 해소분 포함.
- Java 2.31.1은 `http.server.active_requests`를 플래그 없이 냄(설계의 "opt-in" 우려 해소). 404는 route `/**`, 필터 401은 `/*`.
- PG `extract(epoch from timestamp)`는 UTC, 자바는 시스템 TZ → KST에서 히트맵이 540칸 밀림(IT가 잡음).

## 교훈
1. **구현 직후 "코드 실동작 분석 문서"를 쓰게 하면 검수보다 결함을 더 찾는다**(코덱스 1차 4건 vs 분석 5건 — 알람 캐시 유예 영구 만족·sync 배지 리셋·비활성화 시 Zabbix 트리거 잔존·THEIRS 검증 우회·롤업/보존 비대칭).
2. 같은 트리에서 gradle 동시 실행 금지 → worktree 분리. **공유 IT DB(`moveseye_it`)는 두 에이전트가 동시에 drop&create하면 무더기 실패**(원인을 회귀로 오진하지 말 것).
3. dev DB에 새 마이그레이션을 먼저 적용하면 사용자의 구버전 BE 재기동이 깨진다 → 종단 검증은 **별도 DB**에.
4. FE 에이전트가 미커밋 로케일 파일에 `git checkout`을 써서 작업을 날렸다(dist 번들에서 복원). 이후 지시문에 `git checkout/stash/restore 금지`·`JSON round-trip 금지` 명시.
5. `TaskStop`으로 중단한 에이전트가 **끝까지 수행**한 사례 — FE 재구성이 요청 밖에서 완료됨. 중단 후에는 트리 상태를 반드시 확인.
6. 토큰 원문을 `useMutation` data에 두면 mutation cache에 잔존 — 비밀값은 mutation 우회.
7. exporter 응답 계약·마스킹·캐시 동기화 같은 "외부 시스템의 실제 동작"은 문서보다 1시간짜리 실측이 싸다(R1/R10/R11/R14 모두 하루 안에).
