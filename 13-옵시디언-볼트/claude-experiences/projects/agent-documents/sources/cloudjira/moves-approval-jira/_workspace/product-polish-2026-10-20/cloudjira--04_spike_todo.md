# product-polish-2026-10-20 — 실측 목록 (미검증)

> 작성: feature-architect · 2026-10-20. 설계서 `01_architect_design.md` §10 의 상세.
> 기존 상태 변경 승인 실측 목록 `_workspace/transition-approval/04_spike_todo.md`(X1~X31)는 **결과 칸이 전부 비어 있다** — 한 번도 실측되지 않았다.
> 2026-10-13 에 UI 를 걷어 낼 때 validator·트리거·자동 적용 코드는 남겼지만 `isIssueApprovalEnabled()` 가 `false` 고정이라 validator 는 늘 `PASS_DISABLED` 였다.
> 그래서 이번 재활성화의 배포 첫 회차는 아래 T 항목을 **기능을 켜기 전에** 확인한다(개발 사이트 `tom-chkim-dev`, development).
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값(`getIssueTransitionApprovals` 의 `latest.usability/armedAt/consumedAt/apply`, 상세 `target.transition`)과 DB 상태로 본다. `forge logs` 는 늦다.

## 배포 전제

- manifest: `transition-approval-action` issueAction 주석 해제(+ title 변경). scope·egress·SQL 무변경 → **minor 예상**(T0 에서 확인).
- `forge deploy -e development` → `forge install --upgrade --site tom-chkim-dev.atlassian.net --product jira -e development`.
- 개발 사이트 company-managed 프로젝트 1개(예: WORK)의 워크플로에서 "→ Done" 으로 가는 전환마다 "Moves Approval — approval required" validator 를 붙인다.
- 설정 > 기능 선택에서 "상태 변경 승인" 켬, 프로젝트 설정에서 규칙 1개(전체 유형 × Done × 결재선 1단계) 저장.

## 관문 (기능 켜기 전에 반드시)

| # | 항목 | 왜 관문인가 | 확인 방법 | 실패 시 |
|---|---|---|---|---|
| **T0** | manifest 변경이 major 인가 | major 면 고객 재동의·`--approve MAJOR_VERSION_RULE` 필요 | `forge deploy` 출력에 major 경고가 없는지, `forge install --upgrade` 가 동의 없이 끝나는지 | major 로 나오면 배포 묶음을 다른 major 변경(production egress S1 등)과 합친다 |
| **T1** (=X1·X21) | validator payload 에 `issue.id`·`transition.to.id`(목적 상태 id)·`transition.from.id` 가 오는가 | `to.id` 가 없으면 `PASS_NO_ISSUE` 로 **모든 전환이 조용히 통과(fail-open)** | 규칙이 걸린 전환을 승인 없이 시도 → 거부 문구가 떠야 한다. `forge logs` 의 `[VALIDATOR] <code>` 가 `REJECT_NO_REQUEST` 인지(`PASS_NO_ISSUE` 면 실패) | 설계 재검토 — `validatorPayload.parseValidatorPayload` 후보 경로 추가. 끝내 없으면 "이슈는 있는데 to 없음 → REJECT_UNAVAILABLE"로 판정 표 변경(fail-close) |
| **T2** (=X3) | validator 시간 제한·예외 시 Jira 처리 | fail-closed 설계의 실효 | 의도적 지연 빌드는 하지 않는다(이번 회차 범위 밖). 정상 경로 응답 시간만 `[VALIDATOR]` 로그 시각으로 본다 | 1초를 넘으면 규칙 조회 캐시(KVS) 도입 검토 |
| **T3** (=X2·X26) | validator 안 asApp 이슈 조회·라이선스 판정 동작 | 규칙 매칭에 이슈의 프로젝트·유형이 필요 | T1 시나리오가 `REJECT_NO_REQUEST` 까지 가면 성립 | — |

## 흐름 (관문 통과 후)

| # | 항목 | 확인 방법 | 기대 | 실패 시 |
|---|---|---|---|---|
| T4 (=X11·X28) | ••• 메뉴 issueAction 모달의 moduleKey 판독 → 전환 목록으로 바로 감 | ••• > "Request status change approval" | 목적 상태 목록(TransitionApprovalList full)이 뜬다. 일반 결재·필드 변경 칸은 **없어야** 한다 | `resolveModalTarget` 판정 키 수정 |
| T5 (=X27) | issueContext `extension.type` 으로 compact 판정 | 이슈 우측 요약 | 워크로그 안내 + (규칙 있을 때만) 상태 변경 승인 칸 | 판정 키 수정 |
| T6 | 규칙 없는 프로젝트의 이슈 | 우측 요약 | 상태 변경 승인 칸이 **안 보인다**(빈 안내 문구도 없음) | 프론트 분기 수정 |
| T7 | 요청 → 1단계 승인 → 자동 적용 | 결재자로 승인 후 이슈 새로 고침 | 이슈가 Done, 상세 `apply.status=APPLIED`, Jira 이력 작성자 = **요청자** | `FAILED/REQUESTER_IMPERSONATION_UNAVAILABLE` 면 T8 |
| **T8** | offline impersonation 동의 — 요청자가 이 앱에 동의한 적이 없을 때 | 앱을 한 번도 열지 않은 계정은 요청을 못 하니 실제로는 "동의함"이 전제. 대신 **upgrade 직후** 동의가 유지되는지(allowImpersonation 은 이미 있던 선언) | 자동 적용 성공 | 실패면 자동 적용을 정책으로 끄고(기본값 재검토) 요청자 직접 전환 안내 |
| T9 (=X5·X16) | REST 전환(자동 적용 POST)의 validator 재진입 | T7 과 같은 시나리오 | validator 가 같은 요청을 arm → 통과 → 트리거가 소비(`consumedAt`) | 재진입이 거부되면 TransitionExecutor 설계 재검토(자기 전환 표식) |
| T10 (=X8·X23) | `avi:jira:updated:issue` changelog 의 status id·행위자 | 요청자가 직접 전환(자동 적용 끈 시나리오 또는 BLOCKED 후) | 1분 안에 `consumedAt`, 이력 `CONSUMED` reason `TRIGGER` | 지연 판정(LAZY)만으로도 동작 — 기능 영향 작음 |
| T11 | 화면 필수 필드가 있는 전환 | 필수 필드 화면이 붙은 전환에 규칙 | `BLOCKED/SCREEN_FIELDS_REQUIRED`, 요청자가 직접 전환하면 통과 | 문구 확인 |
| T12 (=X6) | 보드 드래그·REST·자동화 규칙 전환에서 validator 실행 | 각 경로로 규칙 걸린 전환 시도 | 보드 드래그는 거부(문구 표시), REST·자동화는 결과 기록 | 실행되지 않는 경로는 프로젝트 설정 안내 문구에 명시 |
| T13 (=X4) | team-managed 프로젝트에 Forge validator 부착 가능 여부 | team-managed 프로젝트 워크플로 규칙 목록 | 보이면 OK | 안 보이면 규칙 화면에 "강제 불가 — 기록용" 경고(이미 `guide.nextGen` 키 있음) |
| T14 (=X17·X31) | 비 Jira 관리자 프로젝트 관리자가 projectSettingsPage 에서 규칙 저장 | 프로젝트 관리자 계정 | 저장 성공 | `{project:'admin'}` 가드 판독 수정 |
| T15 | 기능 끔 상태의 이슈 화면 비용 | 기능 끔 + 이슈 화면 로드 후 진단 | `getIssueTransitionApprovals` 가 KVS 1회·SQL 0·Jira 0 (설계 §2 조기 반환) | 조기 반환 위치 수정 |
| T16 | issueAction title 변경 반영 | 업그레이드 후 ••• 메뉴 | 새 title | 반영 안 되면 설치 재업그레이드, 그래도 안 되면 옛 title 수용(I5) |

## B·C (디자인·모드)

| # | 항목 | 확인 방법 | 기대 |
|---|---|---|---|
| U1 | 이슈 화면(issueContext 좁은 폭 320px·issuePanel) 하단 잘림 재발 여부 | 타이포 변경 후 iframe 높이 | body margin 0 유지(`app/base.css`), 마지막 줄 안 잘림 |
| U2 | 단독 모드 전 화면 워크포스 문구 0 | 단독 설치에서 업무함·설정·이슈 화면 순회 | 워크포스 연동 설정 화면 외 0 |
| U3 | 연동 모드 원장 값 읽기 전용 | 연동 설치에서 설정 > 팀·워크로그 규칙 | 편집 컨트롤 없음 + "워크포스에서 변경" |

## 실측 결과 (2026-10-21, development 5.12.0)

- **T1 통과(부분)** — WORK 워크플로(회사 관리형 간이) 전환 21 "Selected for Development" 에 validator 를 붙이고 REST 로 전환(REST 경로에서도 validator 실행 = T12 일부).
  `[VALIDATOR] shape` = keys `context,contextToken,issue,modifiedFields,transition,user` · transition `from,to` · issue `id,key`.
  해석: issueId·issueKey·fromStatusId·**toStatusId**·accountId = 있음 / projectId·issueTypeId·transitionId·locale = 없음.
  → 목적 상태는 온다. 프로젝트·유형이 없어 규칙이 걸린 전환은 asApp 이슈 조회 1회가 붙는다(T3 에서 확인). locale 없음 → 거부 문구는 한·영 두 줄.
  기능 끔이라 판정은 `PASS_FEATURE_DISABLED`(shape→판정 1.3초, 콜드). 목적 상태 없음은 `3fe95ae` 부터 `REJECT_TARGET_UNKNOWN`.
- validator 는 WORK 전환 21 에 붙인 채 둔다(기능 끔이라 통과). 기능을 켠 뒤 T1 나머지(규칙 걸린 전환 → `REJECT_NO_REQUEST`)·T3 를 이어서.
- ••• "Request status change approval" → "관리자가 상태 변경 승인을 꺼 두었습니다" 안내 표시(T4/T16), 첫 표시 약 8~12초(콜드).
- 이슈 오른쪽 Moves Approval 카드 — 잘림 없음(U1).
