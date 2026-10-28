---
type: project
tags: [project, moves-approval-jira, forge, settings, ux, workforce-link]
created: 2026-10-12
updated: 2026-10-12
status: active
---

# 설정 화면 재구성 + 운영 모드(단독/연동) + 디자인 정리 — moves-approval-jira

## 개요
- **요청**: "설정 UI/UX 가 너무 복잡. 상태 승인 쪽과 워크로그 쪽 분리 + 탭" → 이어서 "워크포스 연동 모드와 일반 모드 분리" → "디자인 개선" → "설치는 둘 다 했어도 연동 안 할 수도 있다".
- **경로**: `C:\CloudJira\moves-approval-jira`, `_workspace/{settings-restructure,operating-mode,settings-design}/`
- **진행**: approval-harness(리더가 설계서 직접 작성 → frontend/backend-engineer → integration-verifier). 세 작업 모두 검증 통과, 커밋·배포 전.

## 핵심 결정
- **메뉴 11개 평평 → 4묶음 9항목**(일반 / 이슈 승인 / 워크로그·타임시트 / 기록). 결재선·승인 그룹·승인자는 "이슈 승인" 한 항목의 탭. 타임시트 5섹션 세로 쌓기 → 4탭.
- **전역 정책 폼 분리**: 이슈 승인 전용 3항목(전환 승인·필드 변경 대체·상태 표시명)을 별도 폼으로. 서버 `saveApprovalSettings` 가 이미 부분 patch 라 백엔드 무변경.
- **운영 모드는 엔진을 나누지 않는다** — 백엔드는 이미 `workforceLinkEnabled` 하나로 "꺼짐 = 단독". 나눌 것은 화면: 연동 전용 UI 는 단독에서 **접기**(숨기지 않음, 값 유지), "켜져 있는데 무시 중" 상태는 반드시 경고.
- **모드 자동 감지 금지**(불변식 9) + **기본값 꺼짐**. 연동은 관리자의 명시적 선택. 사용자 0명 시점이라 기본값 변경 비용 최소.
- 하위 탭 URL 파라미터는 `section` 하나로 통일, 옛 `auditTab`·`setting=flows|…` 는 읽기 호환.

## 겪은 문제 & 해결
- 🔴 **KVS 값을 직접 읽어 `=== false` 로 판정하면 "미저장 = 켬"** — 소비처 5곳(ControlLinkJudge·IssueSignalRefresher·WorklogHistoryRecorder·WorkforceOrgSource·relinking)이 그랬다. 기본값 상수만 바꾸면 아무 효과 없음. → `SettingsRepository.isWorkforceLinkEnabled()` 하나로 모으고(미저장→기본값), 정책 객체 소비처도 `=== true`/`!== true` 로 통일. `getApprovalSettings` 응답은 항상 boolean 으로 정규화(KVS null 이 그대로 나가던 구멍도 막음).
- `settingsNavigation.js` 에서 Atlaskit `Lozenge` 를 import 하면 jest 가 `xcss is not a function` 으로 죽음 → 메뉴 배지는 토큰 색 span 으로.
- Git Bash 히어독에 백틱·`$` 가 있으면 깨진다(두 번 당함) → 문서·코드 작성은 Write/Edit, 짧은 치환은 python.
- 검증 에이전트가 `git stash -u` 로 변경 전 비교를 하려 했으나 **다른 세션이 같은 트리를 쓰는 중**이라 `git grep HEAD` 로 대체 — 공유 트리에서 stash 는 금지.
- `CI=true npm run build` 실패는 `@atlaskit/react-select` compiled CSS 의 postcss-calc 경고가 CI 에서 에러로 승격되는 것. 변경 전에도 동일(실측).

## 교훈
- **"기본값 변경"은 기본값을 적용하는 코드 경로가 하나뿐일 때만 기본값 변경이다.** 원시 저장소를 직접 읽는 소비처가 있으면 먼저 판정 함수로 모은다.
- 설정 화면의 복잡함은 대개 **제목 중첩(셸 제목·페이지 제목·섹션 제목·탭)과 안내문 과다**다. 공용 `SettingsSection`/`SettingsRows`/`SettingsPageIntro` 로 한 번에 정리하면 testId·동작은 그대로 두고 밀도만 낮출 수 있다.
- 표시 fail-open: 모드를 모르면(로딩·권한 거부) **전부 보여 준다**. 숨겼는데 동작 중인 상태가 가장 위험하다.
- 하네스에서 프론트 전용·백엔드 소규모 변경은 리더가 설계서를 직접 쓰고 architect 단계를 건너뛰어도 품질이 유지됐다. 단, 설계서의 숫자(11→8)는 에이전트가 실측으로 교정했다 — 설계서도 검증 대상.

## 후속(같은 날) — 기능 선택 + 워크로그 정책 화면
- 사용자 "복잡하지 않나?" → 코덱스 독립 검토(gpt-6.1-sol/high, 1차는 read-only 샌드박스에서 파일 못 읽어 폐기 → `workspace-write`+`windows.sandbox=unelevated` 로 재실행). 코덱스가 뒤집은 것: 비상 스위치를 기능 스위치로 겸용 금지 · 적용 프로젝트는 건별 워크로그 사전 승인에도 걸림 · 결재선·그룹은 공용 자원이라 묶음 통째 접기 금지 · "끔" 은 신규 접수만.
- 구현: 키 2개 + 단일 판정 + `createForTarget` 경계 게이트 + `featureGateScope.contract.test`(판정 읽는 파일 허용 목록 10개 고정). 설정 첫 화면 "사용할 기능".
- 워크로그 정책: 같은 12키를 두 편집기(분/초)가 보여 주던 중복이 "뭔 소리인지 모르겠음"의 정체. 하나만 남기고 지원용 정보는 details.
- 교훈: **같은 저장 키를 두 화면이 편집하면 사용자는 두 설정으로 읽는다** · "끔"의 정의(신규 접수/기존 결재/전체 종료)를 먼저 묻는다 · 공유 작업 트리에서 검증자는 `git stash` 대신 `git grep HEAD` · lazy 청크를 실제로 받는 테스트의 waitFor 는 틱 수가 아니라 시간.

## 후속 2 — 승인 종류 명확화 + 작업 로그 표·상세 모달, 커밋 4건
- "승인" 한 단어가 6종을 가리켜 모호 → 이름 고정 + 모델·배지 단일 원천, 업무함 종류 열/칩, 알림 접두, 이슈 섹션명, 설정 용어.
- 작업 로그 표는 5열 + "상세" 버튼 → Forge Modal(상세/변경 이력 탭, 수정·삭제 안쪽). 탭 iframe 안 모달은 높이가 잘려 **Forge Modal 경로 재사용**이 정답.
- 검증이 잡은 것: 이전 회차가 지운 이슈 범위 정책 진입점(보고서에 없던 변경) · 클라이언트 종류 필터의 빈 상태 오해 · 고아 키 · 잔존 옛 용어. **에이전트 보고서에 없는 변경은 검증자가 HEAD 대조로만 잡힌다.**
- 커밋은 백엔드 / 설정 화면 / 작업 로그·정책 패널 / 승인 종류 네 묶음(경로 지정 add, Co-Authored-By 없음, 메시지는 "왜").
- 교훈: 부하에서 흔들리는 lazy 테스트는 `beforeAll` 에서 모듈을 미리 import 해 React.lazy 를 즉시 풀리게 한다.

## 관련 노트
- [[2026-10-02-jira-approval-design]] · [[2026-10-07-paid-license-gate]]
- 배포 전 확인: 개발 사이트에 `workforceLinkEnabled` 가 저장된 적 없으면 배포 직후 단독 모드 → 워크포스 연동 화면에서 다시 켜야 함(켜면 전량 재게시).
