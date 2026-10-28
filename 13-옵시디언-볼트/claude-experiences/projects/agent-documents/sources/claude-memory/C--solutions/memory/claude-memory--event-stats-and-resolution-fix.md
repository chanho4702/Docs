---
name: event-stats-and-resolution-fix
description: 2026-08-26 ZM-99 이벤트 해소 시각 되짚기 + 정리 배치 데이터 손실 버그 + 현황 차트 탭. BE 7d33049 / FE d2bd558(미푸시)
metadata: 
  node_type: memory
  type: project
  originSessionId: 3d9d2189-1239-4593-9e1e-925f6e327076
  modified: 2026-08-26T08:21:16.479Z
---

2026-08-26 "이벤트 알림도 차트화" 요청으로 시작했으나 **착수하자마자 데이터가 반쪽**이라 작업이 셋이 됐다.
BE `7d33049` · FE `d2bd558`(둘 다 미푸시, BE=ZM-79 / FE=master 본 체크아웃 작업).
정본: `_workspace/features/events/event-stats-history/devdesign_event-stats.md` · 검수 `_workspace/features/events/event-stats-history/review_event-stats.md`

🔴 **가장 중요한 발견 — 가짜 지표를 낼 뻔했다**
`EventSyncService`가 `problem.get`(열린 문제만)으로만 동기화해서, 문제가 해결되면 Zabbix 응답에서
**사라질 뿐**이라 우리 행의 `r_clock`이 0으로 영구 잔류했다(dev 실측 `r_clock>0`이 254건 중 **0건**).
그 상태로 MTTR을 뽑으면 `r_clock - clock`이 **음수 17억**이 되고, 구간화하면
**"224건 전부 5분 안에 해결"** 이라는 그럴듯한 차트가 나온다. 실제로 처음 뽑았을 때 그랬다.
→ 고친 뒤 진짜 값: **하루 넘게 방치 12건, 최장 28일**. 정반대 결론을 줄 뻔했다.

🔴 **데이터 손실 버그 (그 빈칸이 만든 것)**
`cleanupOldEvents`가 `r_clock < (now-30d)`로 지웠는데 미해소의 r_clock이 0이라 **조건이 항상 참** —
**열린 문제까지 매일 자정에 삭제**되는 구조였다(254건 중 226건이 대상).
드러나지 않은 이유는 그 배치가 **한 번도 실행된 적이 없어서**(`scheduler_run_log` 0건).
→ 해소분(`r_clock>0` AND 30일)과 좀비(`r_clock=0` AND clock 90일)로 분리.
**교훈: "0을 센티넬로 쓰는 컬럼"에 부등호 조건을 걸 때는 센티넬 제외를 먼저 쓴다.**

🔴 **해소 시각은 2단 조회로만 얻는다**
발생 사건에는 복구 *식별자*만 있고 **시각이 없다**. `listHistory(ofNativeIds(사건들))` → recoveryNativeId,
다시 `listHistory(ofNativeIds(복구id들))` → 그 발생 시각 = 해소 시각. ZM-99 화면 이력 모드가 쓰던 방식 재사용.
"사라진 것 = 해결된 것"으로 후보를 좁히므로 사라진 게 없으면 콜 0.
🔴 제외·개수 제한은 **DB에서** 한다(`findVanishedCandidates(openIds, Pageable)`) — 앱에서 거르면
열린 문제가 수만 건인 환경에서 1분마다 전건 스캔이 돈다(검수 전 자체 발견해 수정).

**차트(현황 탭)**
- 소스는 **우리 DB `event_problems`**(Zabbix 재조회 0, 실측 0.16초). 인덱스는 `clock`·`severity`에 이미 있다.
- `/event/stats?from=&to=` — 요약·심각도·일자별 추이·상위 호스트·**반복 상위**·해소 소요·미해소 경과
- 🔴 **관리자 전용이 아니다**(문제 목록은 전 사용자 화면이라 같은 범위)
- 🔴 추이는 **발생 없는 날을 빼고** 준다 — 빈 날 채우기는 화면 몫(서버가 만들면 응답만 커진다)
- 화면: `/event-alert/problem`에 `[현황][문제 목록]` 탭. **기본은 목록**(`?tab=` 없으면 예전 그대로 —
  알림벨·딥링크 보존). 기간은 두 탭이 공유. 차트 프리미티브는 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-config-overview|zabbix-config-overview]]와 공유.

🔴 **환경 함정 (또 당했다)**
cmd의 `set VAR=값 && cmd`는 **값 뒤에 공백이 붙는다** → `VITE_API_URL=http://localhost:3002 `가 되어
axios 요청이 아예 안 나갔다(화면은 빈 채로 에러도 없음). `set "VAR=값"`처럼 **따옴표를 값 전체에** 씌운다.
그리고 커밋 메시지에 PowerShell here-string(`@'…'@`)을 Bash에서 써서 제목에 `@`가 박혔다 — Bash는 heredoc.

**남은 것**: 푸시 · 보관 기간 넘긴 과거는 복구 불가(첫 실행에서 185건 중 1건) · 좀비 90일 근거 약함 ·
"해결 아닌 사라짐"(호스트 삭제·억제) 경로 미검증 · 대량 해소 시 다주기 분할 미검증

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-config-overview|zabbix-config-overview]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-review-handoff|codex-review-handoff]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

이벤트 현황 차트·해소 시각 복구 — 2026-08-26 ZM-99 커밋(BE `7d33049`·FE `d2bd558`, 미푸시). 🔴차트화 요청이었는데 **해소 정보가 DB에 0건**이라 MTTR이 "전부 5분 내 해결"이라는 가짜였다(실제는 하루 넘게 방치 12건·최장 28일) · 🔴정리 배치가 r_clock=0을 "오래전 해소"로 읽어 **열린 문제까지 매일 삭제**할 뻔(254중 226, 배치가 한 번도 안 돌아 안 드러남) · 해소 시각은 복구 사건에만 있어 2단 조회 · 집계는 우리 DB(0.16초) · 탭 기본은 목록 · 🔴cmd `set VAR=값 &&`는 값 뒤 공백이 붙는다
