# 통합 검수 보고 (회차 1)

## 요약
경계면 8개 통과 / 실패 0 / 미검증 3. backend 전체 및 UI 전체 실제 실행 결과를 확인했으며 마지막 schema·legacy 보강 후 backend 전체 재실행 결과는 아래에 추가한다. 빌드·forge lint·실제 Forge SQL/Jira 환경 검증은 root 담당이다.

## 생산자와 소비자 교차 비교
| 계약 | 생산자 | 소비자 | 결과 |
|---|---|---|---|
| 승인 내보내기 session/cursor | RetentionService.js:136 | exportRetentionExcel.js:51 | 동일 서버 session으로 후속 페이지, 빈 페이지도 cursor 계속 — 통과 |
| 승인 확인 | RetentionService.js:239 | exportRetentionExcel.js:209 | 다운로드 성공 뒤 sessionId만 전달 — 통과 |
| 이력 내보내기 | WorklogHistoryRetentionService.js:93 | exportWorklogHistoryExcel.js:116 | sessionId/불투명 cursor, Q73 mask 유지 — 통과 |
| 이력 확인 | WorklogHistoryRetentionService.js:148 | exportWorklogHistoryExcel.js:140 | sessionId 확인, 중간 실패 금지 — 통과 |
| 상태·내 차례 집계 | InboxService.js:250 | InboxPage.jsx:236, InboxFilters.jsx:25 | statusCounts/myTurnCount/incomplete 일치 — 통과 |
| 미읽음 집계 | NotificationService.js:371 | InboxPage.jsx:237 | unread/incomplete 및 수신자 owner 조회 일치 — 통과 |
| UNKNOWN 적용 결과 | FieldChangeApplier.js, FieldChangeRepository.js | fieldChangeModel.js:100, FieldChangeTargetHeader.jsx | UNKNOWN/legacy TIMEOUT 읽기 정규화, 재전송 숨김 — 통과 |
| 삭제 후보 상한 | 두 retention service의 getRetention | DataSettings.jsx, WorklogHistoryRetentionSection.jsx | 현재 owner/TTL session에 따른 상한 안내/7일 허가 — 통과 |

## 등록·권한·불변식
기존 resolver 이름만 확장했다. StorageController/WorklogHistoryController의 guardedDefine, PermissionMap의 admin 정책, index.js CONTROLLER_REGISTRARS의 두 controller 등록을 함께 확인했다. 집계 SELF의 principal은 repository actorKeys/recipientKey SQL 범위로 전달된다. Approval export와 history export 형제 경계는 모두 server session을 사용한다. history의 masked 삭제는 Q73 기존 계약이며 승인 원문 export의 비가시 대상은 허가에서 제외된다.

PIN과 export session/entry CAS UPDATE의 rev 증가, owner/세대 predicate, empty IDs fail-close를 확인했다. v046→v047→v048은 기존 배포 migration 이름을 바꾸지 않고 추가했다. Session/entry table readiness, FIELD_CHANGE 신규 subquery readiness, export 전용 metadata readiness가 적용된다. 신규 asApp scope/모듈은 없다. 변경 도메인 함수는 clock 외부 주입/순수 입력을 사용한다. 프론트는 invokeApproval 결과를 직접 소비하고 content 이중 접근이 없다. 신규 인라인 query key나 엔트리는 없다.

i18n merge가 양쪽 키 일치를 검증했으며 kr 신규 문자열을 직접 읽어 물음표 인코딩 손상이 없음을 확인했다. UNKNOWN/retention/incomplete 오류 안내 키를 화면 소비와 대조했다. git diff --check는 whitespace 오류 없이 통과했다.

## 실행
- npm run merge: 통과.
- backend 전체: 최종 결과 아래 추가.
- npm run test:ui -- --runInBand: 50 suites / 416 tests PASS, 16.037초, JSON success=true.
- field 최종 targeted: 2 suites / 40 tests PASS.
- retention readiness/legacy 보호 targeted: 1 suite / 11 tests PASS(기존 테스트 보존).

## 미검증
1. UI build/번들 예산: AGENTS 병렬 빌드 금지 및 root 소유에 따라 실행하지 않음.
2. forge lint: root 최종 수행.
3. 실제 Forge SQL migration·Jira 권한/PUT 응답·scheduled latency: 배포하지 않아 미검증. JSON/SQL mock 계약 테스트로 확인한 범위와 구분한다.

## 잔여 설계 한계
부모 revision을 갱신하지 않는 자식 생산자의 fingerprint 검사 이후 삭제 경쟁은 완전한 다중 테이블 fencing이 아니다. 현재 허가 ID/부모세대/현재 권한/현재 보호 조건은 확인하고 부분 실패 재개를 검증했다. UNKNOWN 자동 결과 확정은 제공하지 않는다. 계속 실패하는 수집 페이지는 누락시키지 않으므로 운영 복구 전 뒤 자료가 지연될 수 있다. 동적 candidate window에서 이전 key로 새 후보가 생기면 다음 원점 주기에 처리한다.

최종 backend 전체 재실행: **108 suites / 1479 tests PASS**, 17.509초. backend-tests.json success=true, failed=0. 마지막 legacy TIMEOUT/readiness 보강까지 포함한다.

## root 최종 재검증 (2026-10-10)

- 구현 에이전트 종료를 확인한 뒤 백엔드 → UI → build → lint 순서로 실행한다.
- 백엔드: 108 suites / 1,479 tests PASS, 23.661초. `backend-final.json` success=true, failed=0, 프로세스 exit 0.
- UI: 50 suites / 419 tests PASS, 18.269초. `frontend-final.json` success=true, failed=0, 프로세스 exit 0.
- 알림 패널의 전체 읽음 버튼도 incomplete/error의 0을 확정된 0으로 해석하지 않도록 보강했다. 정상 0·불완전 0·조회 실패의 실제 버튼 상태 회귀 3개를 추가했다.
- UI build: exit 0. 업무함 gzip 45.73 kB(+187 B). 의존성 source map 및 Atlaskit CSS 계산 경고는 `build-final.log`에 보존한다. 앱 소스 컴파일 실패는 없다. 별도 수치 예산 실패 조건이 없어 출력 크기를 직접 확인했다.
- Forge lint: exit 0, `No issues found.` (`lint-final.log`).
- 총 6개 기능 단위 커밋 완료. 빌드 산출물·생성 번역 제외 및 작업 트리 clean 확인. 배포·푸시 미수행.

위 미검증 목록의 1번 빌드·2번 lint는 root 최종 검증으로 해소했다. 실제 Forge SQL/Jira 동작·실행 지연 검증은 남는다.
