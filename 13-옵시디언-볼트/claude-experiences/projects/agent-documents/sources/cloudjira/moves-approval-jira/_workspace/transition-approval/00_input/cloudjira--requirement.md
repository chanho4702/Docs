# transition-approval — 이슈 상태 변경(전환) 승인

> 로드맵 5번(마지막). 근거: `docs/DESIGN.md` §0(이슈 전환은 강제 가능), §2 표 ①, **§2.1 이슈 전환 승인 흐름**, §6(ResourceType `ISSUE_TRANSITION` 추가, 불변식 8 이슈 열람 재필터), §7(모듈 매핑: workflowValidator·issuePanel·issueContext·issueAction·projectSettingsPage), §8(`approval_rule`·`consumed_at`), §10(validator 스파이크).
> CLAUDE.md 불변식 10: **워크플로 validator 는 함수형만** — Jira expression 형은 이슈 프로퍼티 위조로 통과된다.
> 불변식 1: 열린 요청은 대상당 하나 — `scopeKey = TRANSITION:{issueId}:{transitionId}` (DESIGN §2.1).
> QUESTIONS Q1(ISSUE 참조 어댑터 — 이슈 화면 진입점 미개방), Q3(Jira 코멘트 @멘션 알림을 이 기능에서 `write:jira-work` 와 함께 재도입) 반영.
> 리포 `C:\CloudJira\moves-approval-jira`. 선행: core-port·timesheet-approval·period-lock·workforce-link 완료(2026-10-03, 각 `03_verify_report.md`).
> 기준선 테스트: 백엔드 55 suites / 713 tests, UI 20 suites / 161 tests 통과. 마지막 마이그레이션 `v028_create_workforce_link_log_table` — 신규는 v029 부터.

## 목표

프로젝트 관리자가 "프로젝트 × 이슈 유형 × 전환" 승인 규칙을 걸면, 그 전환은 **승인된 요청이 있어야만** 통과한다(함수형 `jira:workflowValidator`).
사용자는 이슈 패널에서 승인 요청을 만들고, 결재자는 기존 업무함·결재 화면으로 결정한다. 승인 후 요청자가 다시 전환하면 validator 가 통과시키고 요청을 CONSUMED 처리한다.
엔진(상태 머신·결재선·위임·서명/PIN·CC·독촉·감사)은 재사용한다. 새로 만드는 것은 **대상 어댑터 + 규칙 + validator + 이슈 화면**이다.

## 해야 할 것

1. **도메인 (순수)** — `ResourceType.ISSUE_TRANSITION` 추가, `scopeKey()` 분기 `TRANSITION:{issueId}:{transitionId}`. CONSUMED(소비) 표현 방식 확정 — 새 상태인지, `consumed_at` 부속 칸인지(DESIGN §8 은 `consumed_at`). 상태 머신 변경이 필요하면 최소로 하고 전이 테스트 추가. 이슈 상태가 요청 시점과 달라졌을 때(다른 경로로 이미 전환됨 등)의 만료 사유(`ExpiryReason`) 정의. `now` 주입.
2. **승인 규칙** — `approval_rule`(프로젝트·이슈 유형·전환·결재선 flow·enabled) 테이블(v029~), 프로젝트 설정 화면(`approval-project-settings`, 축 `{project:'admin'}`)에서 CRUD. 전환 id 는 워크플로마다 다르므로 규칙 키를 무엇으로 잡을지(transitionId vs 목적 상태 statusId) 설계에서 확정하고 근거를 적는다. company-managed/team-managed 차이 기록.
3. **함수형 workflowValidator** — manifest `jira:workflowValidator`(function). 입력(이슈·전환·실행 사용자)에서 규칙 조회 → 규칙 없음 통과 / APPROVED 요청 있고 이슈 현재 상태·대상 전환이 요청과 일치 → 통과 + CONSUMED / 그 외 거부(`errorMessage` — validator 응답 문구는 서버가 만들 수밖에 없는 예외 지점이므로 i18n 처리 방식을 설계: 사용자 locale 기반 서버측 최소 사전 등). **validator 는 throw 하지 않는다**(실패 시 fail-closed 인지 fail-open 인지 정책으로 결정·기록, 기본 fail-closed 권장 근거 포함). 응답 시간 예산. 판정은 우리 DB 만(이슈 프로퍼티 불신, 불변식 9·10). validator 실행 컨텍스트가 asUser 인지 asApp 인지·accountId 제공 여부는 미검증으로.
4. **이슈 화면** — `jira:issuePanel`(결재 상태·요청·결재란), 필요하면 `jira:issueContext`(우측 요약)·`jira:issueAction`(••• 메뉴 진입). Q1 기본 가정과의 관계 정리: ISSUE 참조 어댑터는 그대로 닫아 두고 전환 승인 진입점만 연다. 엔트리 추가는 craco ENTRIES + `public/<key>.html` + manifest `resources[].entry` 3곳.
5. **resolver** — 요청 생성(가능한 전환 목록 조회는 asUser `GET /rest/api/3/issue/{id}/transitions`), 이슈별 요청 조회, 규칙 CRUD 등. 권한 축 `{issue:'view'|'edit', issueIdKey}`·`{project:'admin', projectIdKey}`. 3단계 등록. 목록 resolver 는 건별 이슈 열람 권한으로 재필터(불변식 7), 업무함에 ISSUE_TRANSITION 요청이 섞일 때도 동일.
6. **승인 후 요청자 알림** — 앱 내 알림함 + Q3: Jira 이슈 코멘트 @멘션(`CommentNotifier` 재도입, 정책 `commentNotifyEnabled`). Confluence 판 `C:\CloudJira\moves-approval\src\resolver\notification\CommentNotifier.js`(읽기만) 참고. asUser/asApp 선택과 사유(AGENTS.md asApp 허용 목록에 늘린다면 사유 문구까지) 설계에서. `write:jira-work` 는 이미 manifest 에 있음.
7. **자동 전환(승인 즉시 앱이 전환)** — DESIGN §2.1: asApp 이라 이력 작성자가 앱이 됨 → 기본 꺼짐. 이번 범위에 넣을지 설계에서 판단(넣지 않으면 열린 질문으로).
8. **변경 감지** — 요청 대기 중 이슈 상태가 다른 경로로 바뀐 경우 만료 처리 방법(트리거 `avi:jira:updated:issue` vs validator/조회 시 지연 판정 vs 스윕). 핫패스 트리거 throw 금지.
9. **워크포스 연동 자리** — 이슈 프로퍼티 `movesApproval`(전환 승인 요약) 계약 자리를 workforce-link 가 남겨 두었다. 게시할지·형식은 설계에서(기본: 이번엔 게시하지 않고 자리만 유지, 열린 질문).
10. **i18n** — kr/en 동시, `npm run merge`. 서버는 문구를 만들지 않는다(validator 거부 문구 예외는 3번).

## 완료 기준

- `npm run merge`, `npm test -- --runInBand`, `npm run test:ui -- --runInBand`, `npm run build:ui` 통과
- resolver 3단계 계약 테스트 통과, 신규 마이그레이션 v029 부터(기존 이름 변경 금지)
- 불변식 1~10 위반 없음 — 특히 1(TRANSITION scopeKey), 4·5(CAS·조건부 UPDATE, CONSUMED 처리 포함), 7(이슈 열람 재필터), 8(asUser 기본), 9·10(validator 는 함수형·DB 판정)
- validator 판정 표(규칙 없음/승인됨+일치/승인됨+상태 불일치/대기/반려/소비됨/DB 오류) 단위 테스트
- 기존 타임시트·잠금·연동 테스트 기준선 그대로 녹색

## 범위 밖

- 필드 변경 요청(DESIGN ③ FIELD_CHANGE) — P4
- 이슈 전체 일반 승인(ISSUE) 제품 노출 — Q1 기본 가정 유지
- 외부 채널 알림
- `forge` 명령·배포·실측 — 미검증은 `04_spike_todo.md`

## 기본 가정 (미회신 제품 결정 — 설계 열린 질문으로 QUESTIONS 에 올린다)

- validator 장애 시 fail-closed(승인 규칙이 걸린 전환만 막힘).
- 자동 전환 기본 꺼짐.
- 코멘트 @멘션 알림 기본 켬 여부는 설계에서 권장안 제시.
- 승인된 요청의 유효기간: 없음(소비될 때까지) — 대안은 열린 질문으로.
