# 검증 리포트 — settings-design (회차 1)

작성: 2026-10-12 integration-verifier · 기준: `01_architect_design.md` §0~§6
범위: E~H. 코드 수정 없음, git 조작 없음.

## 요약  통과 3 / 실패 1(경미) / 미검증 1(실기기)

| 항목 | 결과 |
|---|---|
| E. 디자인 정리 불변(동작·resolver·쿼리키·testId·토큰) | 통과 (관찰 1건) |
| F. i18n | **실패(경미)** — 신규 키 1개 미사용, 기존 제목 키 5개 고아화 |
| G. lazy·엔트리 | 통과 |
| H. 테스트·빌드 | 통과 |

## 실패
- [`locales/kr/policy.json`·`locales/en/policy.json` `issueApproval.title`] 이번 미커밋 변경에서 추가된 키인데 소스(테스트 제외) 참조 0건. settings-design 이 `IssueApprovalSettings` 의 `Heading large` 를 지우면서 고아가 됐다(테스트도 `policy.issueApproval.hint` 로 바뀜). 재현: `grep -rn "issueApproval.title" static/ui/src src` → 0건.
  → 고치는 방법: kr/en 에서 `policy.issueApproval.title` 삭제 후 `npm run merge` (또는 메뉴 라벨 등으로 실제 사용). 담당: frontend.
- 같은 원인(페이지 `Heading large` 제거)으로 **기존 키** 5개가 참조 0건이 됐다(HEAD 에선 각 1건 참조): `audit.title`, `policy.title`, `policy.flows.title`, `project.title`, `workforce.title`. 동작 영향 없음. 정리할지 리더 판단(삭제 시 kr/en 동시 + merge). 담당: frontend.

## 미검증 (실기기)
- 카드 테두리·배경 라이트/다크 대비, sub 카드 중첩 위계, ≤760px 1열 전환, `<details>` 개폐 시 iframe 높이, `FormFooter align="start"` 배치. 개발 사이트 육안 필요(`forge` 미실행).

## 통과 상세

### E. 불변
- **testId 독립 확인**: 변경 전 집합은 `git stash -u` 대신 `git grep HEAD`(stash 결과와 동일한 트리 — 미추적 신규 파일은 HEAD 에 없음)로 추출했다. 다른 세션이 같은 트리를 쓰고 있어 stash/pop 이 그 작업을 건드릴 위험을 피하려고. 대상: `static/ui/src` 테스트 제외, 패턴 `testId="…"`·`testId: '…'`·`testId={'…'}`·`testId={\`…\`}`.
  - 변경 전 370종 / 변경 후 412종, **차집합(전 − 후) 0건**. 추가 42종(섹션 카드·모드 경고 등).
  - `data-testid="…"` 리터럴 차집합 0, `testId={변수}` 형태 출현 수 diff 없음.
- resolver 호출: diff 의 `invokeApproval('…')` 증감은 `republishWorkforceLink` 이동(−1/+1), `getApprovalSettings` 신규 1(`useOperatingMode` — operating-mode 몫), 나머지는 settings-restructure 신규 파일(`IssueApprovalPolicySettings`)의 이동분. 디자인 정리로 생긴 새 호출 없음.
- 쿼리키: diff 의 `queryKey` 줄은 `settingsKeys.workforceLink()`·`settingsKeys.audit()` 이동(−/+ 짝)뿐. `utils/queryKey` 무변경.
- 하드코딩 색: 추가 줄에 hex·rgb 0건. 숫자 inline 크기(width/height/padding 등에 숫자) 추가 0건.
- 관찰(비차단): `1px solid ${token('color.border')}` 가 `components/settings/SettingsSection.jsx`(신규)와 `ControlStatusPanel.jsx`(radius 만 토큰화한 기존 줄)에 남아 있다. 설계 §2 가 `border: 1px solid token('color.border')` 를 명시했으므로 설계 준수. 엄격히 하려면 `token('border.width')` 로 바꿀 수 있다.
- CSS(`app/appShell.css`) 추가분은 배치·반응형 규칙만(`.settings-rows`·`.settings-form{max-width:720px}`·≤760px 패딩 12px). 

### F. i18n (위 실패 외)
- `npm run merge` 통과(`ko-KR.json`·`en-US.json` 생성).
- kr/en 키 집합 차이 **0** (네임스페이스 접두 평탄화 비교, 스크립트로 직접 계산).
- HEAD 대비 추가 36키 중 35키 소스 참조 확인(동적 키 `timesheet.settings.tab.${key}`·`policy.settings.group.*`(settingsNavigation 39-42행)·`hintMoreKey` prop 포함). 미사용 1건은 위 실패.
- 제거 키 `policy.settings.tab.worklogHistory` 참조 0건.

### G. lazy·엔트리
- 새 lazy 는 전부 `importWithReloadOnce` 경유: `SettingsPage.jsx:13` `lazySetting`, `TimesheetSettings` `lazyTab`, `IssueApprovalSettings` `lazyTab`. 맨 `React.lazy(() => import(...))` 직접 사용 0.
- `manifest.yml`·`static/ui/craco.config.js`·`static/ui/public/*` diff 0 (엔트리 3곳 무변경).

### H. 실행 결과 (직접 재실행)
| 명령 | 결과 |
|---|---|
| 리포 루트 `npx jest` | 152 suites / 2360 tests 통과 |
| `static/ui` `CI=true npx jest` | **73 suites / 614 tests 통과** (보고서 수치 일치) |
| `static/ui` `CI=false npm run build` | 성공, 경고는 node_modules 소스맵 2건 + react-select postcss-calc 1건. 우리 코드 eslint 경고 0 |
| `npm run check:bundle` | OK |
| `npm run merge` | OK |

## 범위 밖 변경
- `src/integration/workforce/keyring.js` dev 공개키 추가는 작업 트리에 미커밋으로 남아 있지 않고 커밋 `7307eea` 에 이미 포함돼 있다. 검증하지 않음.
