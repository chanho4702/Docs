# 검수 요청 — ZM-127 이벤트 동기화 증분화 및 주기 단축 (1분 → 15초)

- 커밋: `c1a75bd` (브랜치 `ZM-123`, 워크트리 `C:/worktrees/zm-123-be`)
- 에픽: ZM-123 무브스아이 성능 향상
- 작성: 2026-09-03

## 범위·의도

동기화가 1분마다 30일 전량(problem.get + trigger.get + acknowledges + user.get)을 재조회하던 것을 이원화:

- **증분 사이클(15초)**: 경량 problem.get **1콜**(규칙·조치 미포함) →
  ① 사본에 없는 신규 → 표적 완전 동기화(resyncEvents 재사용, 규칙·그룹·조치까지)
  ② 기존 열린 알람 → 휘발 필드(이름·심각도·억제·원인)만 UPDATE(규칙·그룹 컬럼 보존)
  ③ 사라진 알람 → 해소 되짚기(reconcileResolved, 매 사이클)
- **보정 사이클(5분)**: 종전 전체 로직(규칙 변경·타인 조치·읽음 상태 크로스 프로덕트).
- **V50**: `scheduler_setting.interval_seconds` — 분 단위 스키마로 15초를 표현 못 해 초 override 추가.
  기본값(1분) 설치본만 15초로 당기고, 🔴 화면에서 주기를 저장하면 override는 해제(apply)된다 —
  UI가 모르는 값이 화면 편집을 이기지 않게.
- `updateIsRead` upsert화 — 증분 사이클은 read-status 행을 안 만들므로(보정 소관), 새 알람을 5분 안에
  읽음 처리하면 행이 없어 터지던 것을 생성으로 바꿈(행 없음=unread라 의미 동일).

순부하: 전량+trigger.get+user.get이 분당 1회 → 5분당 1회, 대신 경량 problem.get 4콜/분.
신선도: 신규 알람·해소·심각도 변경이 사본에 최대 15초 내 반영(종전 1분).

## 불안한 지점 (여기를 봐 달라)

1. **증분의 커버리지 공백**: 규칙 on/off, 그룹 변경, 타인(외부)의 조치·읽음 상태는 최대 5분 늦는다 —
   수용으로 판단(조치는 우리 앱 경유 시 ZM-125 표적 재동기화가 즉시). 반박 여지.
2. **suppressed 갱신 축**: 경량 problem.get 응답에 suppressed가 실리는지(output 기본 필드) —
   어댑터 toAlert가 파싱하는 필드가 경량 응답에도 있는지 확인 필요.
3. **lastFullSyncMillis가 JVM 로컬**: 다중 인스턴스에서 인스턴스마다 보정 주기를 따로 잰다 —
   lease가 실행을 직렬화하므로 최악 케이스는 "보정이 더 자주 도는 것"(무해)으로 판단.
4. **15초 × isSyncing/lease**: 한 사이클이 15초를 넘으면 fixedDelay라 겹치진 않지만 주기가 늘어진다 —
   증분은 콜 1~2개라 통상 1초 미만, 보정만 종전과 동일.
5. V50이 커스텀 주기 설치본을 건드리지 않는 조건(`interval_minutes=1 OR NULL`)이 맞는지.

## 검증 / 미검증

- ✅ BE 전체 테스트 그린(2m44s). 신규: 보정→증분 사이클 전환(경량 질의 검증·user.get 보정 전용),
  신규/기존 분기(표적 동기화 대상·휘발 UPDATE SQL), interval_seconds 우선·apply 해제.
- ❌ 실제 15초 트리거 동작(PeriodicTrigger)·V50 적용 후 스케줄러 재로딩은 런타임 실측 대상(병합 후).

## 검수 결과 및 반영 (2026-09-03, codex exec → 픽스 커밋 `4ce07b6`)

**HIGH 1건 발견, 반영 완료** — 불안한 지점 2번이 실제 결함으로 확정:

경량 problem.get 타입 경로(`ZabbixProblem` 레코드 + `toAlert(ZabbixProblem)`)가 억제·원인·복구
필드를 모델링하지 않아, 증분 UPDATE가 매 15초 suppressed→NULL, cause→"0"으로 **훼손**
(사본 목록의 원인 트리가 풀리고 억제 배지가 최대 5분 오표시, 표적 재동기화 값도 다음 사이클에 덮임).

반영: `ZabbixProblem`에 r_eventid·cause_eventid·suppressed·acknowledged 추가(응답은 extend라 값이
이미 오고 있었음), `toAlert`가 Map 경로와 같은 규칙("0"→null, 부재→null)으로 정규화. 어댑터 경량
매핑 테스트 + 증분 UPDATE 바인딩 값(억제·원인 보존) 테스트 추가. 전체 그린.
