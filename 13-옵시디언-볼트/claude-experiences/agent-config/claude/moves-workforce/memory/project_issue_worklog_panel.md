---
name: issue-worklog-panel-rfc202
description: "RFC-202 Jira 이슈 화면 워크로그 패널(jira:issueActivity 활동 탭 + jira:issueContext 사이드바, 같은 issue-panel 번들) — 계획/투입 MM, 워크로그 생성·내 것 수정·삭제, Workforce 딥링크, 연결 표식 movesRmsLink + displayConditions. 2026-09-22 구현·검증·커밋(16b64a3, worktree .claude/worktrees/RFC-202), 배포·실측 V1~V4 미수행"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8ed44b1e-f015-4e17-b079-a4fe519aeff6
  modified: 2026-09-22T09:09:00.675Z
---

# RFC-202 이슈 화면 워크로그 패널 (2026-09-22)

**작업 공간**: git worktree `C:\CloudJira\moves-workforce\.claude\worktrees\RFC-202`(브랜치 `RFC-202`, develop `29f4453`에서 분기). node_modules는 main checkout으로 **정션**(mklink /J, 절대 경로 필수 — 상대 경로는 cwd 기준으로 풀려 깨졌다). `.claude/agents|skills`는 git 미추적이라 worktree에 없음 → 에이전트에 main의 스킬 경로를 읽기 전용으로 준다. 산출물 `_workspace/issue-worklog-panel/00~03`.

**Forge 사실(공식 문서, 설계서 §0)**
- `jira:issuePanel`은 **자동 노출 안 됨**(사용자가 이슈마다 Apps 버튼) → 사용자가 "Tempo처럼 삽입"을 원해 **issueActivity(활동 탭, 전체 폭) + issueContext(우측 사이드바)** 둘 다 선언. Tempo는 Connect webPanel이라 가능했던 것.
- `displayConditions.entityPropertyEqualTo`는 `objectName`으로 프로퍼티 내부 키 비교 지원, 프로퍼티 없으면 false. 불리언은 `"true"` 문자열로.
- `jira:issueActivity`에는 `label/icon/unlicensedAccess/allowMultiple` 없음(넣으면 검증 실패). 구 이슈 화면 미지원. `view.createHistory()` 미지원 → 딥링크는 `router.open`.
- UI Kit `ChromelessEditor`(Atlassian 편집기, ADF)는 **UI Kit 모듈 전용** — Custom UI iframe에서 못 씀. `@atlaskit/editor-core`는 6.7MB. → 마크다운 편집기 + ADF 변환 유지.

**설계 결정**
- 연결 표식은 **별도 키 `movesRmsLink = {linked:true, projectId}`**(기존 `movesRms` 안에 넣으면 백필이 이슈당 2요청). `ProjectLinkWriter.writeProjectLink/clearProjectLink`가 필드+표식 단일 관문(필드 실패 throw, 표식 실패는 `markerFailed`로 보고만). 연결 6경로·해제 3경로 전부 관문, `ProjectLinkPaths.contract.test`가 `src/` 스캔 allowlist로 우회 차단. 삭제 saga는 `property_cleared_at` 체크포인트 안에서 `movesRms`+`movesRmsLink` 함께 삭제.
- 팀 관리형은 `fields`에 앱 필드가 없으므로 패널은 **프로퍼티의 projectId만** 읽는다.
- MM = `utils/effort.js`(`secondsToMd`/`mdToMm`, hourRate 설정 + `workday.js` 현재 월 근무일). 기존 20+ 인라인 식은 미변경.
- 워크로그 저장 로직 `components/worklog/`로 공용화(마이워크 모달 동반 적용). **손실 ADF 가드**: `adf-to-md@1.2.1` 지원 노드 19/mark 5의 보집합 = 손실 → `COMMENT_LOAD.LOCKED`(날짜·시간만 수정, PUT에서 `comment` 생략). `canSubmitWorklog` 화이트리스트 확장과 comment 생략 분기는 **반드시 같은 커밋**(하나만 하면 원본 삭제).
- 번들: craco `paths` 훅(react-scripts paths 직접 mutate는 조용히 main 재생산 — 동작 안 함) + `build-panel/`, `bitbucket-pipelines.yml` artifacts에 `build-panel/**` 추가(없으면 Deploy에서 forge deploy 깨짐). panel gzip 329KB(예산 350KB, 마크다운 편집기는 lazy).
- 백필: `backfillIssueLinkMarkers`/`getIssueLinkBackfillStatus`(`W/R('SETTINGS')`), `issue-link-backfill-queue` 프로젝트당 1이벤트, bulk PUT 10,000 분할, `SYSTEM_PRINCIPAL`. 백오피스 설정 카드.

**Codex 반영 커밋 `9c443f4`**: 이슈 제외 시 customFieldId `isProjectIdFieldRef` 강제, bulk PUT 303 task 폴링(COMPLETE만 성공), 백필 cap 제거→시간 예산 continuation(nextPageToken 재적재)·단일 실행 포인터, 응답 `alreadyRunning` 추가, 패널 워크로그 오류 표시·딥링크 UUID 검증·`issuePanelKeys.project()`. Codex가 `git diff develop`로 본 "프로젝트 생성 idempotency·스킬·getProjectSkills 스코프 제거"는 **분기 후 develop에 들어온 RFC-180 커밋 4건의 오독** — 머지 충돌 후보는 `ko-KR/en-US.json`(merge 재실행), `PermissionMap.js`, `ProjectSubscriptionService.js`(주석 vs authority 'app').

**2026-09-22 저녁**: develop 머지(`11d32be`) + 구독 하위 이슈 수정 `656d0e9`(#RFC-180 태그, RFC-202 의존이라 develop 단독 cherry-pick 불가) → **`ed90f6d` "Merged RFC-202 into develop" 로 origin/develop 푸시 완료**(CI가 staging 빌드·배포, artifacts에 build-panel 포함). dev moves-rms에는 v5.3.x 배포됨. worktree는 남겨 둠. 사용자 실측: 패널 노출 "확인했음"(세부 V1~V4 결과 미보고).

**상태(푸시 전 검증)**: 백엔드 129/1759·프론트 123/2026 통과, CI 빌드·forge lint 통과, verifier 통과 24/실패 2(수정됨: CI artifacts, i18n 키 오용). **배포·실측 미수행** — V1 미선언 프로퍼티에 displayConditions 동작(안 되면 `jira:entityProperty` 블록 추가), V2 bulk PUT asApp 303, **V3 PUT worklog에서 comment 생략 시 원본 보존**(가드의 전제; 안 되면 원본 ADF 되돌려 보내기 폴백 `buildWorklogUpdateBody`), V4 구 이슈 화면. Codex 검토 결과 반영 여부는 세션 기록 참조.

**잔여 위험(안 만듦)**: 해제 시 표식 삭제만 실패하면 연결 없는 이슈에 패널이 남음(백필은 추가만). 패널 번들 329KB는 추후 축소 후보.

관련: [[forge-field-key-suffix]] · [[project-team-managed-field-gap]] · [[project-project-subscription]] · [[feedback-codex-review]]
