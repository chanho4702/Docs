# Moves Approval 워크로그 정책 계층과 비용 제약 (2026-10-06)

## 배경

워크로그 작성·수정·삭제 정책을 사이트 기본, Workforce 프로젝트, Jira 프로젝트, Jira 이슈 순으로 상속하고 각 키의 출처·revision·잠금을 보여 주도록 확장했다. Forge 비용이 커질 수 있어 외부 property를 런타임마다 읽지 않고 검증된 Workforce 정책을 SQL cache에서 해석한다.

## 핵심 결정

- sparse override만 저장하고 `site < Workforce project/issue < Jira project < Jira issue` 순서로 merge한다.
- Workforce locked 값은 완화할 수 없고 비교 가능한 키만 로컬에서 강화할 수 있다.
- Workforce 정책은 issuer/cloud/target/time/kid/Ed25519/revision을 검증한 뒤 `VERIFIED` cache만 판정에 사용한다.
- 만료 뒤 24시간 grace 동안 마지막 검증본을 쓰고, 이후 unlocked 키는 fallback하며 locked 관련 mutation/submit은 fail-close한다.
- 보존 기간은 삭제 후보별 안전한 정책 판정을 완성하기 전까지 site-only로 유지한다. `0`은 기존 무기한 의미를 보존한다.
- WARN과 legacy EXTRA_STEP mutation은 시간 합계를 위해 Jira를 조회하지 않는다. BLOCK만 기록 전에 합계를 읽는다.
- history event는 전체 설정 34키 대신 catalog subset을 읽고 기능 off/no-target이면 Jira·lease 전에 끝낸다.

## 검토에서 확인한 교훈

1. 같은 JSON row를 legacy UI와 신규 hierarchy UI가 함께 쓰면 key ownership을 분리해야 한다. 서버에서 방금 읽은 revision으로 저장하면 stale client를 검출하지 못하므로 row CAS 계약을 유지해야 한다.
2. project policy row 생성은 `enabled`를 켜는 부수효과가 없어야 한다. 정책 편집 권한과 앱 적용 범위 변경 권한은 다르다.
3. legacy `EXTRA_STEP`을 새 catalog의 `BLOCK`으로 정규화해도 mutation 의미까지 바꾸면 업그레이드만으로 사용자 흐름이 막힌다. 원본 source metadata를 보존해야 한다.
4. 타임시트 전체 action은 모든 entry가 아니라 실제 violation을 만든 entry의 정책으로 결정해야 한다.
5. read/preview는 권위 정책 만료를 경고로 보여 주고, 실제 mutation/submit 경계만 fail-close해야 사용자가 제한 이유를 볼 수 있다.
6. 삭제에는 생성·수정 날짜 규칙을 재사용하지 않고 delete window만 적용해야 잘못된 기록을 정리할 수 있다.
7. 손상된 scope JSON 하나는 행 단위로 격리해야 하며, 정책 해석 실패가 인증 무효화 관찰을 건너뛰게 해서는 안 된다.
8. 이슈 이동 뒤 override 재귀속은 현재 Jira project 권한 확인 후 old project id와 rev를 predicate로 삼는 CAS가 필요하다.

## 비용 관측 기준

현재 고정 schedule은 five-minute 1개, hourly 2개, daily 1개로 30일 기준 약 10,110 invocation이다. 함수 비용은 실행 시간으로, SQL은 요청·compute·storage로 과금되므로 Developer Console에서 SQL requests, scheduled duration, worklog event 수, history 행 증가량을 함께 본다. 전체 설명 이력은 기본 off이고, retention purge는 export 확인 후 수동 수행이므로 미정리 시 저장량이 계속 증가한다.

## 검증

- Backend 100 suites / 1,396 tests PASS
- UI 46 suites / 382 tests PASS
- production UI build 성공
- Forge lint No issues found
- Claude Opus 독립 리뷰 P0 0, P1 3, P2 7을 재현 검토하고 모두 보완

## 남은 실환경 항목

- 실제 moves-workforce sender envelope와 운영 keyring/kid
- Forge SQL v042~v045 migration 적용
- trigger/sweep KVS·SQL·Jira 호출량과 BLOCK mutation latency
- native/REST/automation 워크로그는 앱 밖 경로라 사전 차단 불가하며 감지·이력·재승인으로 관리

관련: [[projects/moves-approval-transition-auto-worklog-certification-2026-10-06]]
