# Moves Approval 자동 전환·워크로그 인증 (2026-10-06)

## 결정

- 상태 전환은 사전 승인으로 막고 최종 승인 뒤 요청자의 offline `asUser(accountId)` 권한으로 고정 transition을 자동 실행한다.
- 승인 상태와 Jira 적용 상태는 별도 원장으로 관리한다. POST 결과가 모호하면 `UNKNOWN`으로 두고 재전송하지 않는다.
- 업그레이드 전 요청은 `LEGACY_MANUAL`, 신규 요청만 `AUTO`로 생성한다.
- 워크로그 기본 흐름은 Jira 원본을 먼저 기록한 뒤 fingerprint를 승인하는 사후 인증이다. 기존 `WORKLOG_CREATE` 사전 승인은 고통제 호환 모드로 유지한다.

## 구현 교훈

- 외부 POST와 SQL은 원자적이지 않으므로 claim CAS → changelog anchor → `post_started_at` marker CAS → POST → finish 순서를 쓴다. marker 뒤에는 자동·수동 재POST를 금지한다.
- preflight와 marker 사이에도 다른 경로 소비가 들어올 수 있다. marker CAS에 `consumed_at IS NULL`을 다시 검사해야 한다.
- POST 후 프로세스가 끝나 trigger만 소비한 `APPLYING`은 sweep에서 제외하면 영구 고착된다. marker가 있는 소비 `APPLYING`은 회수해 `UNKNOWN`으로 수렴시킨다.
- MySQL/TiDB UPDATE SET은 왼쪽부터 평가될 수 있으므로 같은 UPDATE에서 상태와 원인 코드를 바꿀 때 원인 코드를 먼저 계산한다.
- reconcile은 requester/from/to/anchor뿐 아니라 POST 시점의 제한된 시간 창도 확인해야 뒤늦은 수동 전환을 자동 적용 성공으로 오인하지 않는다.
- worklog 인증 관찰은 이력 수집 설정과 분리하되 이미 인증 원장이 있는 ID만 상세 조회한다. table readiness만으로 모든 worklog를 읽거나 ledger를 만들면 개인정보 과수집이 된다.
- 인증 패널의 단순 조회는 baseline을 저장하지 않는다. 실제 인증 요청에서만 baseline을 만들고, 수정·삭제 시 `CHANGED_AFTER_VERIFICATION`으로 바꾼다.
- Forge manifest는 같은 `fiveMinute` interval trigger 두 개를 거부했다. 독립 작업을 단일 오케스트레이터에서 `Promise.allSettled`로 병렬 실행해 hot path가 throw하지 않게 했다.

## 검증

- Backend 97 suites / 1,363 tests PASS.
- UI 45 suites / 375 tests PASS.
- UI production build 성공. Atlaskit source map·CSS calc 기존 경고만 남음.
- `forge lint`: No issues found.
- Claude 3차 독립 검토: 코드 기준 PASS, P0/P1/P2 0건, 출시 차단 코드 결함 없음.

## 남은 실측

- `forge install --upgrade` 후 offline impersonation 동의와 요청자 actor 기록.
- REST transition의 workflow validator 재진입과 필수 screen field 동작.
- Forge SQL v039~v041 migration, boolean IF 바인딩, 다중 ALTER 지원.
- `fiveMinute` 오케스트레이터 실행 시간과 Jira event/sweep 누락 보정.
