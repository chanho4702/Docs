---
name: event-alert-history-mode
description: "이벤트/알림 이력 모드 — 기능은 08-20 커밋(bf66f9f), 성능 재설계(경량 스캔+페이지 하이드레이트)는 08-24 적용으로 12초·2000절단 해소(0.6~1.0초·정확한 total). Zabbix ok_period=5m라 problem.get recent 무의미, 이력은 event.get"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3562659e-89d6-4e69-8d26-295d509aeecb
  modified: 2026-08-20T08:52:11.248Z
---

**Zabbix는 해결된 문제를 `ok_period`(dev 실측 **5분**)만 `problem.get`에 남긴다.** 그래서
`recent=true`를 켜도 해결분이 사실상 0건이고, 상태(Problem/Resolved) 열·처리 일시 열·처리 일시
필터가 전부 죽은 UI가 된다. 해결 이력은 **다른 질의(`event.get`)** 로만 볼 수 있다 — Zabbix Problems
화면의 `Show: Recent problems / History`가 바로 그 축이고, 우리도 같은 토글로 감쌌다.

**2026-08-19 진행**
- ✅ 커밋 `a04fac7`(ZM-99) — 이벤트/알림 Problem + 호스트 그룹별 **화면 통합**(그룹별 현황 접이 패널,
  구 URL 리다이렉트, 메뉴 1개), 발생 일시 기본 범위 연초~ → **최근 30일**.
- ⏸ **미커밋 중단** — 필터 결함 4건 수정(그룹 목록 7→30 전체 · 심각도 칩/목록 건수 불일치 · placeholder ·
  처리일시 필터 BE 구현) + **이력 모드 신설**(엔진 계약 `AlertHistoryQuery`에 entities·severities·
  nameContains·nativeIds 4축 추가, `Alert.withResolvedAt`, `EventShowMode`, FE Segmented).
  기능·테스트는 green인데 **이력 모드가 12초 + 2000건 조용한 절단**이라 커밋 전 재설계 필요.

🔴 **재설계 방향(비용 측정 완료)**: `output=extend` 대량 조회가 범인(2000건 5.5초). **가벼운 4필드로 전부
받고(4822건 0.32초) 메모리에서 필터·집계·슬라이스 → 현재 페이지 10건만 상세 하이드레이트(0.25초)**,
복구 시각도 가벼운 전체 조회(0.15초) 1회로 맵. 예상 12초 → 1초 미만, 절단 소멸. 같은 뿌리로
`/hosts/hostgroup-problems`(긴 기간 500)도 해소된다.

🔴 이력 모드에선 "비활성 규칙 제외"를 적용하면 안 된다 — 지난 사건은 지금 규칙 상태와 무관하고,
event.get은 규칙을 함께 주지도 않는다(호스트는 selectHosts, 그룹은 인벤토리 맵으로 채운다).

**2026-08-24 해소** — 기능 커밋(BE bf66f9f·FE ed5f894, 08-20)에 재설계가 빠진 채 남아 있던 것을 실측
재확인(6~11초·2000 절단) 후 적용: `AlertHistoryQuery.lightOutput`+`ofWindowForScan`/`ofNativeIdsForList`,
어댑터 `EVENT_LIGHT_FIELDS` 8필드, EventService 경량 전량(상한 20000)→페이지만 하이드레이트.
결과: **0.6~1.0초, total 3913 정확(절단 소멸)**, 처리일시 필터·호스트/그룹/조치 하이드레이션 정상,
RECENT 회귀 없음, 전 모듈 1102 green. 커밋 `c60f0ad`(재설계, 병행 세션 rebase로 e4039fc에서 해시 변경·patch-id 동일)+`8038bfa`(정렬 폴백)·FE `b7bd5d2`(host 정렬 비활성) — 전부 08-24, 미푸시. Codex 검수 1차 "수정 필요"(🔴 이력 host 정렬=하이드레이션 전 null 정렬)→반영 후 재검수 "커밋 가능". 기록: _workspace/features/events/event-stats-history/review_event-history-redesign.md. ⚠️ 이력 정렬 축 host·totalActions는 페이지 값이라 부정확하나
FE가 정렬 미노출(전 컬럼 sorter:false)이라 실영향 0. (b) hostgroup-problems도 08-24 같은 처방으로 해소(`5b845fe`): 경량+selectHosts(조인은 싸다 — 90일
22,832건 1.0초 직접 실측, 비용 지배항은 extend 필드), 상한 없음(집계 정확성, Codex 🔴 반영 — 100k warn만).
30일 5.5초→0.55~0.90초, 90일 Zabbix 500→1.96초. 🔴교훈 둘: ① 테스트/기동 경합의 증분 빌드 오염
(NoClassDefFoundError)이 8.4초·500으로 보여 코드 결함 오진할 뻔 — clean 재빌드 후 재측정으로 판명.
② 병행 세션이 내 스테이징을 자기 메시지로 커밋(ddd6d24 사고) — 사용자가 히스토리 정리로 해소.
커밋 이력 재작성 잦음: 해시는 log 재확인 필수.

**Why:** 사용자가 이벤트/알림 화면을 직접 손보자고 해서 통합 → 필터 점검 중 5건 발견 → "A안(이력까지)"
채택 → 성능 문제로 정지 지시.
**How to apply:** 재개 지점·미커밋 파일 목록·측정표는 `_workspace/wip_event-alert-history.md`에 전부 있다.
재개하면 그 문서 §5(a)부터. 커밋은 승인 필요([[commit-requires-approval]]), 병행 세션이 있으니
헝크 선택 스테이징 + 커밋 후 생존 확인([[zabbix-wrapper-gaps]]의 교훈).

관련: [[zabbix-wrapper-gaps]] · [[zabbix-wrapper-principle]] · [[dev-runtime-startup]]
