# 검증 리포트 — operating-mode (회차 1)

작성: 2026-10-12 integration-verifier · 기준: `01_architect_design.md` §1~§8, 요구 `00_input/requirement.md`
범위: 미커밋 변경 전체(settings-restructure + operating-mode + settings-design) 중 A~D·H·I. 코드 수정 없음, git 조작 없음.

## 요약  통과 6 / 실패 0 / 미검증 4(실기기)

| 항목 | 결과 |
|---|---|
| A. 연동 판정 단일화(백엔드) | 통과 |
| B. 프론트↔백엔드 shape 일치 | 통과 |
| C. "숨겼는데 동작 중" 금지 | 통과 (관찰 1건, 비차단) |
| D. 권한(`getApprovalSettings` admin) | 통과 (실기기 네트워크 확인은 미검증) |
| H. 테스트·빌드·번들 | 통과 |
| I. 유휴 SQL 예산 | 통과 (상한 수치 무변경) |

## 실패
- 없음.

## 미검증 (실기기 필요 — `forge` 미실행)
- 개발 사이트에서 연동 끔 → 메뉴 배지 "단독", 워크포스 연동 화면 접힘/펼침, Phase C "연동 전용", 데이터 관리 연결분 한 줄. 확인: 설정 화면 육안.
- 비관리자 업무함에서 설정 뷰 진입 전 `getApprovalSettings` 미호출. 코드·테스트(`InboxPage.test.jsx`)로는 확인, 네트워크 탭 실측은 안 함.
- 라이선스 INACTIVE 사이트에서 워크로그 통제 화면 정상. jest(`WorklogControlSettings.test.jsx` LICENSE_INACTIVE 거부 케이스)로만 확인.
- **배포 영향**: tom-chkim-dev 의 KVS `approval:settings:workforceLinkEnabled` 가 미저장이면 배포 직후 단독 모드가 된다(게시·인증 즉시 게시 DISABLED, ControlLinkJudge NOT_LINKED, 전량 재게시 `WORKFORCE_LINK_DISABLED`). 배포 전후 워크포스 연동 화면에서 토글 상태 확인·필요 시 다시 켜기(미저장→true 도 relinking 으로 전량 재게시됨).

## 통과 상세

### A. 연동 판정 단일화
- `grep -rn "workforceLinkEnabled" src --include=*.js | grep -v __test__` 직접 실행 → KVS 직접 읽기(`getValue(SETTINGS_KEYS.workforceLinkEnabled)`)는 `src/resolver/settings/SettingsRepository.js:276`(`isWorkforceLinkEnabled` 내부) **한 곳뿐**. `SETTINGS_KEYS.workforceLink*`·KVS 키 문자열 리터럴 다른 사용처 0.
- `isWorkforceLinkEnabled` 소비처: `WorkforceOrgSource.js:18`, `ControlLinkJudge.js:33`, `IssueSignalRefresher.js:46`, `WorklogHistoryRecorder.js:121`, `SettingsService.js:246`(relinking). 설계 §8.3 의 5곳 전부.
- 정책 객체 판정 통일: `WorkforceCertWake.js:39` `!== true`, `WorkforceLinkService.js:52` `=== true`·`:145` `!== true`, `WorkforcePublisher.js:367`·`:389` `!== true`. `=== false`/`!== false` 잔존 0.
- `getApprovalSettings` 응답: `SettingsService.js:231` `workforceLinkEnabled: policy.workforceLinkEnabled === true` → 항상 boolean. 테스트 `SettingsWorkforceLink.test.js` 가 undefined/null/true/false 4건 고정.
- 기본값 `SettingsRepository.js:119` `false`. 키 집합 무변경이라 `SettingsPolicyKeys.test.js`(기본값↔KVS 키 맵 계약) 통과(전체 jest 안에서 확인).
- relinking: `SettingsService.js:244-247` `!(await isWorkforceLinkEnabled().catch(() => true))` — 미저장→true 도 relinking. `TimesheetWorkforce.test.js:329` "미저장 → true 도 전량 재게시 touch", `:350` 조회 실패 시 재게시 안 함. 통과.
- 비고: `WorklogHistoryRecorder.js` 의 `SETTINGS_KEYS` import 는 다른 키(97·101·107행)에 쓰여 미사용 아님. `ControlLinkJudge`·`IssueSignalRefresher`·`WorkforceOrgSource` 는 불필요 import 제거됨.

### B. shape 일치 — 경계면 표

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| `getApprovalSettings` | `SettingsService.js:224-232` `{...policy, workforceLinkEnabled: boolean, approvalGroups}` | `operatingModeModel.js:8-12` `policy.workforceLinkEnabled === true ? 'LINKED' : 'STANDALONE'`, null→null; `WorkforceLinkSettings.jsx:40` `EnabledToggle` `=== true`; `AuditPage.jsx:59` `operatingModeOf(policy.data)` | 일치 (서버 `=== true` ↔ 프론트 `=== true`) |
| `saveApprovalSettings({workforceLinkEnabled})` | 같은 정책 shape 반환 | `WorkforceLinkSettings.jsx:43-49` `setQueryData(settingsKeys.policy())` → 같은 키를 쓰는 `useOperatingMode` 소비처 즉시 갱신 | 일치 |

- fail-open: `invokeApproval.js:28` 은 `success:false` 면 throw → `useQuery.data` undefined → `operatingModeOf(undefined)` = null → `isStandalone(null)` false = 전부 보임. 로딩도 동일.
- `WorklogControlSettings.jsx:368` `isStandalone(useOperatingMode({enabled:true}))` — LICENSE_INACTIVE 거부 시 null → Phase C·경고 분기 미적용, 화면 본체(`getWorklogControlStatus`)와 독립. 에러 UI 없음. jest 케이스 통과.
- `useOperatingMode.js` `retry:false`, 에러를 화면에 올리지 않음.

### C. 숨김 ≠ 비활성
- 프론트: 단독 모드에서 저장 호출 없음(접힘은 렌더 분기만). `WorklogControlSettings.jsx:104-118` Phase C 켜짐+단독 → `wc-phase-C-inactive` 경고, 꺼짐+단독 → 켜기 버튼·사유 숨기고 `linked-only` 로젠지. `:198-200` 저장값 `foreignScope==='LINKED'`+단독 → `wc-foreign-linked-inactive` 경고(서버 `WorklogControlState.js:46` 이 기본 LINKED 를 항상 채워 엄격 비교 안전). `RecordRetentionSection.jsx:90` `exportRequired` 면 접지 않음.
- 백엔드 실제 무시 확인: `ControlLinkJudge.js:33` NOT_LINKED → `WorklogControlDetector.js:184-185` `needControl`/`needForeign`(LINKED 범위) 가 `link.linked` false 로 꺼짐, `WorklogControlWorker.js:117-131` `decide()` 도 `links.linkOf` 재판정 → 미확정분 제한 안 함. `WorklogHistoryRecorder.js:121` off, `IssueSignalRefresher.js:46` DISABLED. 각 미저장 케이스 테스트 존재·통과.
- 관찰(비차단, 기존 동작): `WorklogControlWorker.js:426-456` LINKED_ALL 백필은 `isWorkforceLinkEnabled` 를 보지 않고 `workforce_inbound` 의 옛 VERIFIED 신호로 이슈를 훑어 Jira 페이지 조회·`insertIgnore(linked:true, PENDING)` 를 한다. 실제 제한은 `decide()` 가 NOT_LINKED 로 막으므로 "숨겼는데 동작"은 아니지만, 단독+Phase C 저장 상태에서 세대가 바뀌면 불필요한 Jira 호출·SQL 이 생긴다. 이번 변경으로 생긴 회귀가 아니며 후속 검토 후보(백필 진입 전 `isWorkforceLinkEnabled` 확인).
- 참고: 단독+이력 범위 `LINKED_ONLY` 는 기존 경고 `ts-worklog-history-linked-only`("워크포스와 연결되지 않은 사이트에서는 아무것도 기록되지 않습니다")가 항상 보여 드러남.

### D. 권한
- `PermissionMap.js:59` `getApprovalSettings: { admin: true }`.
- 호출 지점: `useOperatingMode`(SettingsPage `enabled:true`, InboxPage `enabled: view==='settings'` (`InboxPage.jsx:264`), WorklogControlSettings·RecordRetentionSection·WorklogHistoryAuditSettings — 모두 설정 화면 안), 기존 `WorkforceLinkSettings`·`AuditPage RetentionNote`. 업무함 비설정 뷰에서 호출 경로 없음.
- 업무함 설정 뷰는 비관리자도 열 수 있는 메뉴지만, 거부 시 null → 배지 없음, 에러 UI 없음(InboxPage 테스트 "거부 시 조용히 배지 없음").

### H. 실행 결과 (직접 재실행)
| 명령 | 결과 |
|---|---|
| 리포 루트 `npx jest` | **152 suites / 2360 tests 통과** (보고서 수치와 일치) |
| `static/ui` `CI=true npx jest` | **73 suites / 614 tests 통과** |
| `static/ui` `CI=false npm run build` | 성공, `Compiled with warnings.` — 소스맵 누락 2건(`@atlaskit/analytics-next-stable-react-context`)·`@atlaskit/react-select` postcss-calc 1건뿐. 우리 코드 eslint 경고 0 |
| `npm run check:bundle` | `[bundle-check] OK` (exports 10개) |
| 리포 루트 `npm run merge` | 성공 |

### I. 유휴 SQL 예산
- `idleSqlBudget.test.js` 통과. diff 상 숫자 상한 변경 없음(추가는 `enableWorkforceLink()` 호출 4곳과 "미저장이면 관문 SQL 없이 정리 1회만" 1건, `toBeLessThanOrEqual(1)`). 판정 함수는 KVS 1회·SQL 0.

## 범위 밖 변경
- 지시서가 언급한 `src/integration/workforce/keyring.js` dev 공개키 추가는 현재 작업 트리에 **미커밋 변경으로 남아 있지 않다** — 이미 커밋 `7307eea`(다른 세션)에 들어가 있다. 검증 범위 밖, 손대지 않음.
- manifest·craco·public 무변경, 스키마·마이그레이션 무변경.
