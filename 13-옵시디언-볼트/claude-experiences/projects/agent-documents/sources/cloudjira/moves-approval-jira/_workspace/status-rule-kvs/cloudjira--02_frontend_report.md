# status-rule-kvs — 프론트 보고서

> frontend-engineer · 2026-10-21 · 입력 `01_architect_design.md` §7·§8, `02_backend_report.md`(실제 shape 우선)
> 재작업 회차: 1회차(최초)
> 결과: static/ui `npx jest` **98 suites / 939 tests 통과**, `npm run build` 성공(경고는 기존 source map·postcss-calc 만), root `npm run check:bundle` OK, `npm run merge` 실행. git·forge 명령 실행 안 함, docs/·src/ 수정 없음.

## 1. 소비하는 resolver 와 접근 경로 (`invokeApproval` 가 `content` 를 벗긴 값)

| resolver | 호출 위치 | 읽는 경로 |
|---|---|---|
| `listTransitionRules({projectId})` | `TransitionRuleSettings` (쿼리키 `transitionKeys.rules(projectId)`) | `rules[]`, `issueTypes`, `statuses[].categoryKey`, `flows[].autoRequestCapable`, `projectDefaults.autoRequest`, `setup.completed`, `template.{flowId,autoRequest}`, `limits.setupStatuses`, `featureEnabled`, `project.style` |
| RuleView | 규칙 표·폼 | `autoRequest`(true/false/null), `autoRequestEffective`, `autoRequestBlockedReason`, `validatorSeenAt`. **`updatedBy` 는 어디에도 표시하지 않음**(기존에도 미표시 — null 대응 불필요, 테스트 고정 값만 null) |
| `saveTransitionRule` | `TransitionRuleFormModal` → `transitionApi.saveTransitionRule` | 입력 `autoRequest`: 새 규칙은 고른 값 그대로(`null`=기본값 따름도 **키째** 전송), 편집은 **바꿨을 때만** 키 전송(안 바꾸면 생략 = 서버 유지). 응답 `rule` |
| `saveTransitionProjectDefaults({projectId, autoRequest})` | `TransitionRuleSettings` › `ProjectDefaultsRow` 토글 | 응답 `projectDefaults` 를 캐시에 병합 후 목록 재조회(규칙별 `autoRequestEffective` 가 바뀌므로) |
| `setupTransitionProject({projectId, toStatusIds, issueTypeId, flowId, autoRequest})` | `TransitionProjectSetup` | 응답 `rules`(프로젝트 전체)·`projectDefaults`·`setup` 을 캐시에 병합 → 표로 전환, `skipped.length > 0` 이면 안내. 목록 재조회 |
| `saveApprovalSettings` (patch `statusChangeTemplateFlowId` / `statusChangeTemplateAutoRequest`) | `IssueApprovalSettings` › `StatusChangeTemplateSection` | 값 하나씩 그 키만 patch, 응답을 `settingsKeys.policy()` 에 setQueryData + 감사 무효화 |
| `getApprovalSettings` | 같은 화면(기존) | `statusChangeTemplateFlowId`(''|UUID), `statusChangeTemplateAutoRequest` |
| `getRequestDefaults({})` | 템플릿 결재선 목록(쿼리키 `requestKeys.defaults()` — FlowSettings 와 같은 키) | `flows[].{flowId,name}` |
| `getIssueTransitionApprovals` | `TransitionApprovalList`·`StatusChangeApprovalCard`·`TransitionTargetRow` | `history[].autoRequested`, `targets[].latest.autoRequested` → "검사에서 자동으로 요청함" 배지(`AutoRequestedBadge`) |

신규 쿼리키 없음.

## 2. 화면 변경

- **프로젝트 설정 › Moves Approval › 상태 변경 승인** (`entries/projectSettings.jsx` → `TransitionRuleSettings`)
  - `setup.completed !== true` 이고 규칙 0개 → 신규 `TransitionProjectSetup`: 1 목적 상태(체크박스, 이슈 유형 '모든 유형' 기본 + 유형 셀렉트, `categoryKey==='done'` 미리 선택, 상한 `limits.setupStatuses` 도달 시 나머지 비활성) → 2 결재선(`template.flowId` 가 `flows[]` 에 있을 때만 미리 선택, `autoRequestCapable===false` 면 그룹 경고) → 3 자동 요청 토글(`template.autoRequest` 미리 선택) → 4 검사 연결 안내(`guideKey(style)` + "저장 뒤 한 번 전환" + 기능 끔이면 한 줄) → [저장하고 시작] / [직접 규칙 추가](빈 표).
  - 표 위 "자동 요청 기본값" 토글(`ProjectDefaultsRow`).
  - 규칙 표 열 추가: **자동 요청**(켬/끔/기본값(켬)/기본값(끔), 실효값이 켬인데 `GROUP_FLOW`·`FLOW_MISSING` 이면 "자동 요청 불가" Lozenge + 이유), **검사 연결**(`validatorSeenAt` 있으면 "검사 호출 확인됨 · {날짜}" success Lozenge, 없으면 "아직 확인 안 됨"). 표 아래 관찰 한계 안내 한 줄(`seen.hint`). 날짜는 `useI18nStore.locale` + 브라우저 타임존.
  - 규칙 폼: 자동 요청 셀렉트 [프로젝트 기본값 따름 (켬|끔) / 켬 / 끔], 실효 켬 + 그룹 결재선이면 경고.
- **앱 설정 › 상태 변경 승인**: 사용 스위치 아래 "새 프로젝트 기본값" 섹션(기본 결재선 셀렉트 '선택 안 함' 포함, 목록에 없는 저장값은 "찾을 수 없는 결재선"으로 표시, 자동 요청 토글). 폼 너비 `.settings-form`(720px).
- **이슈 화면**: 자동 요청 배지(이력 행·목적 상태 행·카드 최근 요청). 자동 요청은 출발 상태 이름이 없으므로 `transitionLabel` 이 출발 없음이면 `"→ 목적"` 으로 보이게 바꿈(이전 `"— → 목적"`).
- 자동 적용 `TRANSITION_AMBIGUOUS` 는 기존 `TransitionApplyPanel` 이 `transitionApply.code.${code}` 로 표시(백엔드가 넣은 키), `canRetry:false` 라 재시도 버튼 없음 — 코드 변경 없음.
- 연동/단독 구분: 기존 규칙(`projectSettingsBodyKey(linkMode)`) 그대로, 새 UI 는 모드 무관(상태 변경 승인은 모드와 독립).
- 오류는 전부 `error.${code}` — `TRANSITION_RULE_LIMIT`, `CONCURRENT_MODIFICATION`, `INVALID_APPROVER_CONFIGURATION`, `INVALID_TARGET`.

## 3. 추가 i18n 키 (kr·en 동시)

- `transition.rules.setup.{title, description, step.{statuses,flow,autoRequest,validator}, statusesHint, noStatuses, autoRequestToggle, autoRequestHint, validatorHint, featureOff, save, skip, skipped, required}`
- `transition.rules.autoRequest.{column, inherit, inheritOn, inheritOff, projectDefault, projectDefaultHint, unavailable, groupFlow, flowMissing}`
- `transition.rules.seen.{column, yes, no, hint}` — `seen.yes` 는 요청 문구대로 "검사 호출 확인됨 · {date}"
- `transition.list.autoRequested`
- `policy.statusChange.template.{title, description, flow, flowNone, flowMissing, autoRequest}`
- (백엔드가 넣은 `transition.server.validator.REJECT_AUTO_REQUESTED(_NONAME)`, `transitionApply.code.TRANSITION_AMBIGUOUS`, `error.TRANSITION_RULE_LIMIT` 는 그대로 사용, `transitionI18n.test.js` SERVER_KEYS 에 추가해 고정)

설계 §8 대비 차이: `setup.description`·`setup.noStatuses`·`setup.autoRequestToggle`·`setup.required`·`autoRequest.projectDefaultHint`·`autoRequest.unavailable`·`template.flowMissing` 추가.

## 4. 설계와 다른 점

1. 초기 세팅 4단계를 이전/다음 이동 마법사가 아니라 **한 화면에 번호 순서로** 둠(짧은 선택 넷 — 한눈에 보이는 편이 덜 헷갈림). 순서 자체는 요구대로이고 테스트가 DOM 순서를 고정.
2. Atlaskit `ProgressTracker` 미설치 → `SettingsSection level="sub"` 번호 제목.
3. `transitionLabel` 출발 없음 표기 변경(위 §2).
4. 목적 상태 행(`TransitionTargetRow`)에도 자동 요청 배지(설계는 이력 행만).

## 5. 테스트 (static/ui)

- 신규 `features/transition/__test__/TransitionProjectSetup.test.jsx`(8): 단계 순서, 완료 범주·템플릿 미리 선택, 템플릿 결재선이 목록 밖이면 미선택, 상한 비활성, 유형 변경 시 선택 정리, 저장 payload, 필수·`TRANSITION_RULE_LIMIT` 문구, 그룹 경고·기능 끔, 건너뛰기.
- `TransitionRuleSettings.test.jsx` +7: 세팅 분기·건너뛰기·완료 후 0개 표, 세팅 완료 → 표 + skipped 안내 + 기본값 반영, 자동 요청 칸·경고 조건, 검사 연결 칸, 기본값 토글 저장·재조회, 기본값 실패 code.
- `TransitionRuleFormModal.test.jsx` +4: 새 규칙 `autoRequest:null` 키 전송, 편집 무변경 시 키 생략, 켬→따름 null·끔 false, 그룹 경고. 기존 새 규칙 payload 기대값에 `autoRequest: null` 추가.
- `TransitionApprovalList.test.jsx` +1, `StatusChangeApprovalCard.test.jsx` +1: 자동 요청 배지·"→ Done".
- `transitionModel.test.js` +4 describe 항목, `transitionLabel` 기대값 갱신.
- `IssueApprovalSettings.test.jsx` +2: 템플릿 키 하나씩 patch, 목록 밖 결재선 표시·'선택 안 함' = `''`.
- `transitionI18n.test.js`: 서버·템플릿 키 고정 추가.
- 타이포 계약(`typographyRules.contract.test.js`) 통과 — 작은 글씨는 `MetaText` 만, `Text size="small"` 추가 0.

## 6. 실행 결과

```
npm run merge            → locales\ko-KR.json 생성 / locales\en-US.json 생성
static/ui npx jest       → Test Suites: 98 passed, 98 total / Tests: 939 passed, 939 total
static/ui npm run build  → Compiled with warnings.(기존: 외부 패키지 source map ENOENT, react-select postcss-calc) / The build folder is ready to be deployed.
npm run check:bundle     → [bundle-check] OK — exports: channelServer, onInstall, onIssueChanged, onPreUninstall, onWorklogChanged, runMigration, runSweep, runSweepJob, validateTransition, CONTROLLER_REGISTRARS, handler
root npx jest test/permission → 16 passed
```

## 7. 백엔드 요청 / 확인 필요

- 없음(차단 사항 없음). 참고: 세팅 화면은 `setup.completed` 와 규칙 0개 둘 다로 판정한다 — 세팅 없이 규칙을 직접 만든 뒤 모두 지운 프로젝트에는 시작 순서가 다시 뜬다(의도된 동작으로 둠).
- 자동 요청의 `summary.transitionName` 이 승인·적용 전 null 인 점은 화면이 전환 이름을 쓰지 않아 영향 없음(증명서는 이미 null 이면 생략).
