# Claude 1차 리뷰 보완 보고서

기준일: 2026-10-06

## 수정 완료

### P1-1 워크로그 인증 과수집

지적은 유효했다. 이력 수집이 꺼져도 certification table 준비만으로 모든 이벤트의 상세 워크로그를 asApp 조회하고, `observe`가 인증을 요청하지 않은 워크로그까지 ledger로 만들 수 있었다.

- 이벤트 prefetch는 이력 수집이 켜졌거나 해당 worklogId의 인증 ledger가 이미 있을 때만 수행한다.
- Recorder의 인증 관찰은 기존 ledger ID만 갱신한다. baseline 생성은 사용자의 인증 조회·요청 경로에만 남겼다.
- 이력 off sweep은 changed/deleted ID feed를 받은 뒤 기존 인증 ledger ID로 좁히고, 그 ID의 상세만 조회한다.
- 한국어/영어 개인정보 문서에 이 경계를 명시했다.
- 미인증 ID의 상세 조회 0·ledger 생성 0, 기존 인증 ID만 sweep 상세 조회하는 회귀를 추가했다.

### P1-2 소비된 전환의 WAITING 잔류

지적은 유효했다. 다른 Jira 경로가 승인 요청을 소비해도 AUTO ledger가 WAITING이면 배치 후보와 retention 보호에 남을 수 있었다.

- `consume` SQL에서 AUTO + WAITING + post marker 없음인 요청을 원자적으로 `BLOCKED / CONSUMED_BY_OTHER_PATH`로 종결한다.
- `AUTO_POST`와 `AUTO_RECONCILE` 소비는 이 종결을 적용하지 않아 executor 경쟁을 훼손하지 않는다.
- sweep 후보에 `consumed_at IS NULL`을 추가했다.
- retention은 consumed 종결 BLOCKED를 보호 대상에서 제외했다.
- 한영 적용 원인 문구를 추가했다.

## 함께 반영한 저위험 P2/P3

- legacy 수동 전환에서만 쓰이는 `readyHint`를 기존 요청 전용 문구로 교정했다.
- `AUTO_POST`, `AUTO_RECONCILE` 소비 원인의 한영 표시를 추가했다.
- 동일 fingerprint가 이미 `VERIFIED`면 `canRequest=false`이며 서버도 `WORKLOG_CERTIFICATION_ALREADY_VERIFIED`로 중복 요청을 차단한다. 기존 인증은 보존한다.
- restricted/unreadable Jira 조회는 기존처럼 `WORKLOG_PERMISSION_DENIED`/`WORKLOG_NOT_FOUND` 예외로 fail-closed되며 `CONTENT_CHANGED`로 변환되지 않음을 확인했다.

## 2차 재평가 전 추가 보완

- retry/reconcile은 실제 호출자의 `accountId`를 executor와 SQL owner predicate까지 전달한다. Jira 관리자 예외는 `adminOverride`로 명시적으로 분리했다.
- changelog 증거는 `postStartedAt - 5초`부터 `postStartedAt + APPLY_CLAIM_MS`까지만 인정해 뒤늦은 수동 전환을 자동 적용 성공으로 보지 않는다.
- 소비 종결 SQL은 `apply_code`를 `apply_status`보다 먼저 계산하고, marker가 없는 `APPLYING`도 다른 경로 소비 시 원자적으로 종결한다.
- POST marker CAS에 `consumed_at IS NULL`을 추가해 preflight 뒤 다른 경로가 먼저 소비한 요청은 POST하지 않는다.
- 소비된 `APPLYING` 중 marker가 있는 행은 sweep이 회수해 재POST 없이 `UNKNOWN`으로 수렴시킨다.

## 실환경 확인으로 보류

- v039 multi-clause ALTER 분리와 sweep index migration: 배포 전 Forge SQL 실측과 migration 이름 확정이 필요해 이번 verifier 단계에서 변경하지 않았다.
- UNKNOWN 관리자 수동 종결은 감사·권한 계약이 추가되므로 live 측정 뒤 설계한다.

## 검증

- 관련 backend 회귀: **6 suites / 76 tests PASS**
- 관련 UI 회귀: **2 suites / 8 tests PASS**
- 전체 backend: **97 suites / 1,357 tests PASS**
- 전체 UI: **45 suites / 375 tests PASS**
- locale merge: PASS
- `git diff --check`: 오류 없음. 기존 CRLF 변환 경고만 출력
- build, forge lint, Claude 재평가, 배포, commit은 실행하지 않았다.
