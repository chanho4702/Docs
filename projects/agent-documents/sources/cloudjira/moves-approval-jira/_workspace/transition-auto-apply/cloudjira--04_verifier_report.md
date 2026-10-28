# 통합 검증 리포트

기준일: 2026-10-06

## 요약

- 결과: **통과 10 / 실패 0 / 실환경 미검증 6**
- 검증 중 결함 3건을 수정했다.
  1. 정확한 changelog 증거가 있어도 issue trigger가 먼저 소비한 경쟁에서는 자동 적용 ledger가 `UNKNOWN`에 남을 수 있었다. 소비 결과를 다시 읽어 `APPLIED`로 수렴하게 했다.
  2. 프로젝트의 워크로그 이력 수집을 끄면 해당 프로젝트의 기존 인증도 수정·삭제 관찰을 건너뛰었다. 이력 수집 범위와 사후 인증 관찰을 분리했다.
  3. 워크로그 인증 알림 제목의 구분자가 `?`로 표시됐다. `·`로 수정하고 회귀 테스트를 추가했다.
- 승인 상태와 Jira 적용 상태는 별도 사실이다. 워크로그의 기본 흐름은 Jira 원본 저장 후 사후 인증이며, `WORKLOG_CREATE` 사전 승인은 별도의 선택적 고통제 모드다.

## 계약·보안 검증

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 신규 전환만 자동 적용 | 통과 | 신규 `transition_request` INSERT만 `AUTO`; v039 ALTER 기본값은 `LEGACY_MANUAL`; pending/rejected/expired/cancelled/legacy POST 0 회귀 테스트 |
| 요청자 권한으로 Jira POST | 통과 | `TransitionOfflineGateway`가 저장된 `requesterKey`로 `api.asUser(accountId)`를 사용한다. 전환 경로의 `asApp` 쓰기는 0건 |
| 승인/적용 상태 분리 | 통과 | approval status와 `WAITING/APPLYING/APPLIED/FAILED/UNKNOWN/BLOCKED` ledger를 상세·업무함·알림·증명서에서 별도 표시 |
| SQL 경쟁 경계 | 통과 | apply claim은 owner predicate, expected `rev`, `rev=rev+1`, token, `post_started_at IS NULL`, AUTO/APPROVED/LIVE 조건을 사용 |
| 모호한 POST 결과 | 통과 | marker 뒤 network/timeout/5xx는 `UNKNOWN`; 자동·수동 retry 모두 재POST 0. 정확한 requester/from/to/time/anchor 단일 changelog만 대조 |
| validator/trigger/executor 소비 경쟁 | 통과 | 상태 변경 후보 한 건 선택과 `consumed_at IS NULL` CAS를 사용. trigger 선소비 후 reconcile도 재조회하여 정확한 증거를 `APPLIED`로 수렴 |
| resolver 3종 등록 | 통과 | 신규 resolver 모두 `guardedDefine`, `PermissionMap`, `CONTROLLER_REGISTRARS`에 등록. 전체 permission 계약 테스트 통과 |
| 워크로그 사후 인증 | 통과 | Jira 원본 우선, 작성자만 요청, immutable fingerprint, 승인/반려 ledger, 수정·삭제 시 `CHANGED_AFTER_VERIFICATION`, 원값 복원 자동 복구 없음 |
| 목록 권한과 보강 | 통과 | 대상별 batch 가시성 필터 후 requestId 일괄 보강. 빈 입력 SQL 0, 다른 요청 결과 혼합 없음, 인증 worklog 조회도 `/worklog/list` 일괄 처리 |
| manifest 최소 범위 | 통과 | `read:jira-work`, `write:jira-work`만 `allowImpersonation:true`; `storage:app`, `read:jira-user`에는 impersonation 없음 |

## 문서·UI 검증

- 한국어/영어 전환 가이드는 신규 AUTO와 기존 `LEGACY_MANUAL`, 요청자 offline 권한, `UNKNOWN` 재POST 금지, 승인/적용 상태 분리를 설명한다.
- 한국어/영어 워크로그 가이드는 사후 인증 fingerprint와 수정·삭제 무효화, 사전 승인 `WORKLOG_CREATE`, 타임시트 승인을 별도 절차로 설명한다.
- Marketplace 설명과 개요의 기본 워크로그 표현을 “저장된 원본의 사후 인증”으로 교정하고, 사전 승인은 선택 모드로 명시했다.
- 적용/인증 상태는 상세·업무함·알림·증명서에 표시되며, `UNKNOWN`에는 대조 버튼만 제공하고 재시도 버튼을 제공하지 않는다.
- `npm.cmd run merge`로 ko/en 통합 locale 생성에 성공했다.

## 실행 결과

- 관련 회귀: **2 suites / 38 tests PASS**
- `npm.cmd test -- --runInBand`: **96 suites / 1,351 tests PASS**, exit 0
- `npm.cmd --prefix static/ui test -- --runInBand`: **45 suites / 375 tests PASS**, exit 0
- `npm.cmd run merge`: PASS
- `git diff --check`: 오류 없음. 기존 작업 트리의 CRLF 변환 경고만 출력
- build와 `forge lint`는 파이프라인 지시에 따라 root 단계에서 실행한다.

## 실환경 미검증

1. Forge 설치 업그레이드 후 offline impersonation 동의와 사용자 접근 제한 동작
2. REST 전환이 workflow validator를 실제로 재진입하는지와 Jira changelog actor가 요청자로 남는지
3. Forge SQL v039~v041 실제 migration과 다중 `ALTER TABLE` 수용 여부
4. 5분 scheduled trigger 실행, 리스, 실행 시간·요청량
5. company-managed/team-managed 워크플로 및 필수 transition screen 필드
6. native/REST/자동화 워크로그 수정·삭제 이벤트와 누락 보정 sweep

이 항목은 테스트 통과만으로 Marketplace 실측 증빙으로 주장하지 않는다.
