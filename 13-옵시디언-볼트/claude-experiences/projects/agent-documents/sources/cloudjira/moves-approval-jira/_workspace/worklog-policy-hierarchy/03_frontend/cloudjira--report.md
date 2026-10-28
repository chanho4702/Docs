# 프론트 구현 보고서

2026-10-06. 실제 `02_backend/report.md` 계약을 우선하여 정책 계층 UI와 한영 문서를 구현했다. backend source/manifest는 변경하지 않았고 build/Forge lint/deploy/commit/전체 검증을 실행하지 않았다. 기존 full-page sidebar와 사전승인·사후 인증 구현을 보존했다.

## 화면과 소비 계약

- 사이트: 기존 타임시트 정책 화면에 **사이트 워크로그 기본 정책**, **정책 진단 카운터**를 연결했다. `getWorklogPolicyCatalog`의 site/siteRevision을 읽고 기존 `saveApprovalSettings`로 **변경한 키만** legacy patch로 저장한다. seconds→minutes/invert boolean을 변환한다. 미수정 violationAction은 보내지 않으므로 legacy EXTRA_STEP을 정규화된 BLOCK으로 덮어쓰지 않는다. 사이트 저장에는 신규 CAS API가 없으며 기존 KVS 동시 쓰기 한계가 유지된다.
- Jira 프로젝트: 기존 프로젝트 정책 모달 안에 **프로젝트 워크로그 정책**. `getProjectWorklogPolicy`/`saveProjectWorklogPolicy`를 사용한다. `{projectId,expectedRevision,override}`를 보내며 sparse override에서 체크를 해제하면 해당 키를 제거한다. 편집 시작 당시 revision을 고정하여 백그라운드 재조회로 CAS가 우회되지 않게 했다. legacy 문자열 revision이면 저장을 막고 migration 안내를 표시한다.
- Jira 이슈: WorklogTab의 **이슈 워크로그 정책·상속** details를 펼칠 때만 lazy component와 query를 생성한다. `getIssueWorklogPolicy`/`saveIssueWorklogPolicy`의 `{issueId,projectId,expectedRevision,override}` 계약을 따른다. canAdmin=false면 읽기 전용이며 저장·Workforce 수신 버튼이 없다.
- 항목마다 실제 적용값/source/sourceRevision, explicit/inherited, Workforce lock authority/revision/allowTighten/unavailable, ignored override source/revision/reason을 표시한다. 잠금 비교 불가 항목은 신규 local override를 막되 기존 override 제거는 허용한다. 강화 가능 여부의 최종 검증은 서버가 한다.
- Workforce 값은 이 앱에서 편집하지 않는다. 외부 Workforce에서 수정·발행한 뒤 **Workforce 정책 새로 수신**으로 `{projectId,issueIds?}`를 요청한다. checked/updated/unchanged/failed와 항목별 code를 표시하며 FRESH/STALE/EXPIRED/INVALID/ABSENT, 서명·공개 키·trustedKids·대상·rev·실패 후 sticky 검증본을 설명한다.
- `historyRetentionMonths`, `approvalUnit`, `timeZone`은 site-only이며 프로젝트/이슈 입력 목록에서 제외하고 적용값·사이트 출처·리비전만 읽기 전용으로 보여 준다. 보존 선택지는 `[0,3,6,12,24,36]`, 0은 **무기한**이다. scope 보존 override나 자동 purge는 만들지 않았다. 기존 프로젝트 사전승인 필수는 CERTIFICATION 선택만으로 해제되지 않는다는 안내도 추가했다.

## 작성·수정·삭제와 정책 근거

WorklogDialog는 editor.policy, DeleteConfirm은 list.policy의 실제 제한과 출처를 쓰기 전에 고지한다. 날짜/원래 작성일 window, 일·주 상한, 제출/마감 잠금, WARN/BLOCK, PREAPPROVAL/CERTIFICATION을 표시한다. 서버 WORKLOG_POLICY_BLOCKED의 cause.notices를 코드·변수·출처에 따라 번역한다. WARN 성공은 모달을 즉시 닫지 않고 경고를 확인한 뒤 닫게 하며 같은 기록을 재전송하지 않는다. 삭제 성공 WARN 및 차단 notices는 WorklogTab에 표시한다.

history 수집 현재 on/off 표시는 issue effective.historyEnabled를 우선하고 과거 이력 메타데이터와 구분한다. 타임시트 위반에는 policy source/revision을, 상세에는 policyEvidence.scopes의 제출 당시 적용값·출처·리비전을 접어서 표시한다. 기존 타임시트 판정과 WORKLOG_CREATE/인증 요청의 백엔드 gate는 변경하지 않았다.

새 query factory `worklogPolicyKeys`의 catalog/project/issue/diagnostics를 사용한다. 정책 저장/수신 뒤 settings/worklog/approval draft/certification/history/timesheet 키를 함께 무효화한다. 기존 사이트·프로젝트 설정 저장도 새 정책 query와 작업 로그 context를 갱신한다. scope mutation payload에는 화면에서 추정한 source/digest/lock을 보내지 않는다.

## 변경 파일

- 신규: `static/ui/src/features/worklogPolicy/{policyFields.js,WorklogPolicyPanel.jsx,WorklogPolicySummary.jsx,WorklogPolicyNotices.jsx,WorklogPolicyDiagnostics.jsx,WorklogPolicy.test.jsx}`.
- 수정: `static/ui/src/utils/queryKey/approvalKeys.js`, settings `TimesheetPolicySettings.jsx`/`ProjectPolicyModal.jsx`, worklog `WorklogDialog.jsx`/`WorklogTab.jsx`/`DeleteConfirm.jsx` 및 dialog 회귀, timesheet `ViolationList.jsx`/`TimesheetSnapshotSection.jsx`.
- locale: `locales/{kr,en}/worklogPolicy.json`, merge 생성물. error namespace의 백엔드 변경은 보존했다.
- docs: ko/en `06-worklog-period-lock`, `09-admin-guide`, `10-workforce-integration`, `11-data-security-privacy`, `12-faq-troubleshooting`, `13-marketplace-review-guide`에 정책 계층·서명 캐시·retention·live 검증 경계를 추가했다.

## Workforce 문서 내용

rms.policy/movesRms.policy explicit envelope, `moves-link/policy/1\n` + canonical JSON Ed25519 메시지, cloud/project/issue/issuer/kid/trustedKids/5분 skew/30일 TTL/notAfter 검증, 기본 빈 keyring, sender/fixture/키 provisioning live 미검증을 기술했다. 낮은 rev·동일 rev의 다른 body/expiry를 거부하고 동일 문서는 UPDATE하지 않는 계약, 마지막 검증본 보존, 24시간 stale grace 후 unlocked fallback/locked 관련 작업 차단을 설명했다.

resolve는 100 issue chunk당 범위 SELECT 최대 3개, runtime property N+1 없음. refresh는 최대 100 issues·5개 병렬·20초 예산이며 BUDGET_DEFERRED는 다시 수신해야 한다. 기존 schedule만 사용하며 보수적인 history hint와 추적 인증 때문에 scan이 남을 수 있음을 고지했다. diagnostics 카운터는 현재 응답이며 실제 물리 호출/누적 telemetry로 주장하지 않는다.

## 검증

- `npm run merge`: PASS, KO/EN 키 집합 일치.
- 초기 연결 회귀 `frontend-related-test.log`: **2 suites / 20 tests PASS**, exit 0.
- 신규 정책 UI `frontend-policy-retest.log`: **1 suite / 4 tests PASS**, exit 0. 최초 2개 실패는 compound text의 exact-match를 테스트에서 contains로 교정했다.
- 최종 관련 `frontend-final-retest.log`: **5 suites / 44 tests PASS**, exit 0. 이전 실행에서 발견한 외부 dialog의 completed state 잘못된 참조와 site 없는 응답의 draft null 오류를 수정했다.
- 변경 키만 site patch 및 canAdmin=false 추가 회귀 `frontend-policy-last-test.log`: **1 suite / 6 tests PASS**, exit 0.
- site-only 읽기 전용·기존 사전승인 floor 안내 이후 `frontend-policy-completed-test.log`: **1 suite / 6 tests PASS**, exit 0.
- `git diff --check`: exit 0. 기존 CRLF 변환 경고만 있다.
- 테스트는 UI 관련 스위트만 수행했으며 전체/backend/build/lint는 부모/verifier 단계에 남겼다.

## 남은 제약

Workforce sender와 keyring provisioning, 실제 Forge property/SQL v042–v045, 사이트 write latency와 브라우저 UX는 live 미실측이다. 정책 검사·외부 Jira 쓰기를 원자적으로 묶지 않으며 native/REST/자동화 사전 차단을 보장하지 않는다. issue 이동 후 이전 override row 재귀속 기능은 서버 범위 밖이며 저장 충돌을 코드로 안내한다. Workforce 편집은 상대 앱에서 수행해야 한다. 사이트 정책 editor와 기존 타임시트 폼은 같은 설정을 사용하므로 저장 뒤 캐시를 함께 갱신한다. Vault INDEX는 읽었고 외부 Vault 기록은 부모의 정리 단계에 넘긴다.
