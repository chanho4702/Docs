# moves-approval-jira — Jira Cloud 승인 앱 (Forge)

> 현행화 기준: 2026-10-03 · 출발점: `moves-approval`(Confluence 판) 커밋 `fa07591` 을 `git archive` 로 복사
> 작업 규칙(스타일·불변식·보안·검증·배포·커밋)은 `AGENTS.md`, 제품·아키텍처 설계는 `docs/DESIGN.md`.

Confluence 승인 앱의 엔진(상태 머신·권한 가드·Forge SQL 계층·업무함·위임·서명/PIN·CC·독촉·감사·보관·증명서)을
Jira 로 옮기고, **워크로그(타임시트) 승인·기간 잠금**과 **이슈 상태 변경 승인**을 얹는다.
워크포스(`C:\CloudJira\moves-workforce`)와 같이 설치되면 연동되고, 없으면 단독으로 동작한다.

## 확정 결정

| 항목 | 결정 | 날짜 |
|---|---|---|
| 리포 | 별도 리포. 코어는 복사(B안), 나중에 모노레포 통합 검토 | 2026-10-03 |
| 첫 기능 | **타임시트 승인**(고객 핵심) → 그다음 이슈 상태 변경 승인 | 2026-10-03 |
| 타임시트 기본 단위 | **월**(정책값 `approvalUnit`, 주 단위로 변경 가능) | 2026-10-03 |
| 기간 잠금 | `jira:timeTrackingProvider` 로 Jira 기본 Log work 를 우리 화면으로 대체 + 나머지 경로는 감지·재승인 | 2026-10-03 |
| 미소속자 작성 금지 | Jira 권한 스킴("Work on work items" → 프로젝트 역할) — 고객 관리자 작업. 우리는 가이드·역할 동기화(워크포스) | 2026-10-03 |
| 워크포스 연동 | Jira 엔티티 프로퍼티 + 서명. **워크포스 DB 무증가** | 2026-10-02 |
| 워크포스 표시 | 전부 표시 + 상태 배지, 원가·정산만 "승인분만" | 2026-10-03 |
| 알림 | 앱 내 알림함 + Jira 코멘트 @멘션(외부 채널은 미결정) | — |
| 개발 사이트 | https://tom-chkim-dev.atlassian.net (development) | — |

## 디렉터리 (목표 구조 — 이식 작업 중)

```
src/
  domain/approval/   상태 머신. SQL 무발행, Jira API 무호출, now 주입 (Confluence 판에서 이식)
  domain/timesheet/  기간 키·워크로그 묶음 지문·제한선 판정 — 역시 순수
  permission/        guardedDefine · PermissionMap · PrincipalResolver · JiraPermission
  rdb/               schema/{ddl,migrate,TableReadiness} · query/{CommonQuery,QueryBuilder,SqlTime}
  api/jira/          RequestJira — asUser 기본, asApp 은 사유 인자 강제
  integration/       workforce/ — 엔티티 프로퍼티 계약·서명
  resolver/{도메인}/  XxxController · XxxService · XxxRepository
  trigger/           얇은 어댑터만 (워크로그 이벤트, 스윕)
static/ui/           별도 패키지. CRA/craco 멀티 엔트리
```

## 계층 규약 (Confluence 판과 동일)

**resolver 등록은 3단계다. 하나라도 빠지면 런타임에서만 죽는다.**
1. Controller 에서 `guardedDefine(resolver, name, handler)`
2. `src/permission/PermissionMap.js` 에 선언 — 미선언은 `PERMISSION_UNMAPPED` 로 원천 거부
3. `src/index.js` 의 `CONTROLLER_REGISTRARS` 에 추가
계약 테스트(`test/permission/permissionMap.contract.test.js`)가 세 곳을 대조한다.

**권한 축**: `'PUBLIC'` | `'SELF'` | `{issue:'view'|'edit', issueIdKey}` | `{project:'admin', projectIdKey}` | `{admin:true}` | `{jiraAdmin:true}` | `{teamLead:true}`(타임시트 결재자)

**응답**: 성공 `{success:true, ...result}` / 실패 `{success:false, error:{name,code,message,cause}}`. 프론트는 **`error.code`** 로 분기.
**서버는 사람이 읽을 문구를 만들지 않는다.** 에러는 코드로, 알림·감사는 `{templateKey, vars}` 로 저장.

## 절대 깨면 안 되는 불변식

1. **열린 요청은 대상당 하나** — `scopeKey()` → `dedupe_key` UNIQUE. 타임시트는 `TIMESHEET:{accountId}:{periodKey}`.
2. **결정이 진실, 상태는 파생** — `approval_approver` 행이 원천.
3. **도메인은 순수** — `Date.now()` 금지, `now` 주입. 기간 키 계산도 타임존을 인자로 받는다.
4. **CAS UPDATE 의 SET 절에 `rev = rev + 1`.**
5. **승인자 행은 삭제-재삽입 금지** — `WHERE decision_type='PENDING'` 조건부 UPDATE.
6. **감사 이벤트 id 는 결정적.**
7. **가드 통과 ≠ 데이터 범위 확정** — 목록 resolver 는 건별 이슈 열람 권한으로 다시 좁힌다. 팀장은 자기 팀원 타임시트만.
8. **`asUser()` 가 기본** — `asApp()` 은 사용자 컨텍스트가 없는 경로(트리거·스윕)만, 그 결과를 사용자에게 반환하지 않는다.
   **예외(2026-10-10 사용자 승인, worklog-control Q127):** 앱이 visibility 로 숨긴(통제 중인) 워크로그는 asApp 으로 읽되, **서버가 판정한 작성자 본인**(또는 TeamScope+이슈 열람을 다시 확인한 팀장 인증 경로)에게만 돌려준다. **전부** 만족해야 한다:
   ① 호출자는 resolver context 의 `principal.accountId` ② 후보를 SQL 소유자 조건(작성자 = 호출자 또는 TeamScope 대상자)으로 **먼저** 줄이고 asApp 응답의 author·worklogId·issueId 를 다시 대조 ③ 반환 행 전부 조회자 asUser 이슈 열람 재확인 ④ **우리 통제로 가려진** 워크로그만(원래부터 제한된 것은 보충하지 않음) ⑤ 설명은 작성자 본인에게만, 팀장에게는 시간·일자·이슈만 ⑥ count·합계·내보내기·캐시에도 같은 범위, 캐시 키에 조회자 포함.
9. **엔티티 프로퍼티는 신뢰하지 않는다** — 편집 권한자 누구나 쓸 수 있다. 판정은 우리 DB, 앱 간 교환은 서명 검증 후에만.
10. **워크플로 validator 는 함수형만** — Jira expression 형은 이슈 프로퍼티 위조로 통과된다.

## 플랫폼 함정

### Confluence 판에서 실측해 그대로 유효한 것

| 함정 | 내용 |
|---|---|
| **route 인코딩** | `route` 는 보간값을 URL 인코딩한다. 쿼리스트링을 통째로 보간하면 필터가 사라진다. template strings 배열을 직접 만들어 `route(strings, ...values)` |
| **affectedRows** | `ON DUPLICATE KEY UPDATE` 는 신규 1, 갱신 **2** |
| **SQL 추가 = major upgrade** | `--approve MAJOR_VERSION_RULE` |
| **TIMESTAMP 에 숫자 바인딩 불가** | TiDB 는 epoch ms 를 TIMESTAMP 로 변환 못 한다. `rdb/query/SqlTime.js` 경계를 지킨다 |
| **컬럼 추가 = ALTER 마이그레이션** | `vNNN_alter_*`, 첫 resolver 호출의 `ensureMigratedOnce` 가 적용 |
| **정책 기본값과 KVS 키 맵은 같은 집합** | 어긋나면 정책 조회 전체가 죽는다. 계약 테스트가 대조 |
| **CRA 멀티 엔트리** | `entrypoints.main` 참조 플러그인 제거. 엔트리 추가는 `craco.config.js` ENTRIES + `public/<key>.html` + manifest `resources[].entry` 세 곳 |
| **lazy 청크 배포 직후 백지** | `importWithReloadOnce` 로 1회 reload |
| **모달 안 `100vh` 되먹임** | iframe 이 부풀어 하단 버튼이 잘린다. 높이는 내용이 정한다 |
| **잔존 `forge tunnel`** | iframe 이 localhost 로 떠 빈 화면. 배포 검증 전에 확인 |
| **resolver 예외는 서버 로그에 안 남는다** | `[RESOLVER]` 로그 + 상위 페이지 fetch 가로채기 |
| **`forge logs` 는 늦다** | 트리거 동작은 결과 상태(DB·화면)로 확인 |
| **아바타** | 절대 URL `<img>` 는 뜬다, 실패 시 `PersonAvatar` 이니셜 |

### Jira — 공식 문서로 확인 (2026-10-03, 실측 전)

| 항목 | 내용 |
|---|---|
| `jira:timeTrackingProvider` (Preview) | 관리자가 제공자로 선택하면 기본 "Log work" 버튼·작업 로그 탭이 숨겨진다. 대체 UI 는 `jira:issueAction`·`jira:issueActivity` 로 제공. **사이트당 제공자 하나**(Tempo 와 공존 불가). REST·자동화·모바일 경로는 문서에 언급 없음 |
| 시간 추적 권한 | Work on work items / Edit·Delete own·all worklogs. 기간 조건 없음 → 시간 기반 잠금은 권한으로 불가 |
| 워크로그 이벤트 | `avi:jira:{created,updated,deleted}:worklog`. 누락 보정은 `/rest/api/3/worklog/updated`·`/deleted` (since) |

### 미검증 (P0 스파이크 — `docs/DESIGN.md` §10)

timeTrackingProvider 의 비UI 경로 차단 여부 · 함수형 validator 의 team-managed 지원 · `worklog?expand=properties` 로 타 앱 프로퍼티 읽기 · 앱이 타 사용자 프로퍼티 쓰기 · 워크로그 삭제 이벤트 페이로드 · Forge 런타임 Ed25519.

## 하네스: Jira 승인 앱 기능 개발

**목표:** 설계 → 백엔드 → 프론트 → 경계면 검증 순차 파이프라인으로 기능을 구현한다.

**트리거:** 이 리포의 기능 구현·이식·수정·재실행 요청 시 `approval-harness` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**무인 실행(autopilot):** `scripts/autopilot/run.ps1` 이 회차마다 한 Phase 씩 `claude -p` 를 부른다. 5시간 한도면 초기화까지 대기, 주간 한도면 그 시각까지 `codex exec` 로 이어 간다. 인수인계는 `_workspace/PROGRESS.md` 하나, 사람에게 묻는 것은 `_workspace/QUESTIONS.md`(답은 `답:` 줄로). 중지는 `_workspace/autopilot/STOP` 파일, 기록은 `_workspace/autopilot/status.log`. 무인 회차는 `forge`·`git commit/add/push` 를 하지 않는다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-10-03 | autopilot 실행기 추가(Claude 한도 대기 → 주간 한도 시 Codex 인계) | scripts/autopilot | 끊김 없는 개발 요청 |
| 2026-10-03 | 초기 구성 — 워크포스 하네스(4 에이전트 순차 파이프라인)를 이 리포 규약에 맞춰 이식, 플랫폼 스파이크 목록 단계 추가 | 전체 | 리포 생성 |

## 변경 이력 (제품)

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-03 | 리포 생성. Confluence 판 `fa07591` 복사, manifest app id 제거(덮어쓰기 방지), 설계서 `docs/DESIGN.md`, 하네스 구성 | Jira 판 착수 |
| 2026-10-07 | 유료 앱 전환 — manifest `app.licensing.enabled`, 프론트 `LicenseGate`(mount 공통, 설정은 배너·나머지는 안내 화면 대체)·`useLicenseStore`·평가판 만료 배너, `locales/*/license.json`, 라이선스 테스트(BE 2·FE 3). 백엔드 가드는 이미 있었음 | 워크포스와 같은 과금 경계 — 결제 없이 못 쓰게 |
| 2026-10-10 | 유휴 SQL 비용 제거 — 5분·시간당 스윕 삭제, 일일 `approval-sweep` + 큐 fan-out, information_schema 프로브·리스·커서 쓰기 절감, 빈 상태 쿼리 수 테스트 고정. 하네스 점검표·설계 순서·AGENTS 에 "유휴 SQL 예산" 항목 추가 | Forge SQL 컴퓨트 과다(사용자 0명에 월 15만~30만 요청) — 코덱스 독립 검토 `_workspace/sql-idle-cost/codex-review.md` |
| 2026-10-10 | 워크로그 인증 모델(인증된 시간의 원본은 우리 DB, 팀장 인증·상위자/본인 서명, 워크포스엔 사용자×월 서명 문서) + 감사 이력(결재/인증/워크로그 변경/설정 탭) — RFC-220 | 워크로그 수정은 막을 수 없으니 "수정해도 인증된 시간은 안 바뀌게", 누가·언제·무엇을 확인 요구 |
| 2026-10-11 | 워크로그 통제권(worklog-control) — 수정·삭제는 우리 화면에서 앱이 판정 후 실행, 확정분·연동분 visibility 숨김(Phase B~D 기본 OFF·실측 관문 강제, 자동 삭제는 알림 전 서버 차단), 진단 도구, 불변식 8 예외(작성자 본인) | 고객 권한 스킴을 건드리지 않고 앱이 통제 — codex 독립 검토 반영 |
| 2026-10-12 | 설정 화면 재구성(settings-restructure) — 메뉴 11개 평평 → 4묶음 9항목(일반/이슈 승인/워크로그·타임시트/기록), 신규 "이슈 승인" 탭 페이지(정책·결재선·승인 그룹·승인자), 타임시트 탭(정책·인증·기간 마감·팀), 전역 정책 폼에서 이슈 승인 전용 3항목 분리(부분 patch), 하위 탭 URL 은 `section`(옛 `auditTab`·`setting=flows|groups|approvers|worklogHistory` 읽기 호환). 프론트 전용 | 사용자 요청 — 상태 승인과 워크로그 설정이 섞여 복잡 |
| 2026-10-12 | 운영 모드(operating-mode) — 모드 = `workforceLinkEnabled === true`(연동) / 그 외 단독. **서버 기본값 꺼짐으로 변경**, 판정은 `SettingsRepository.isWorkforceLinkEnabled()` 하나로(직접 `getValue`+`=== false` 금지 — 미저장이 켬으로 읽힘), `getApprovalSettings` 응답은 항상 boolean. 단독이면 연동 전용 UI(워크포스 상태·통제 Phase C·타 경로 LINKED·연결분 보관·이력 배지) 접기(값 유지, 무시 중 상태는 경고), 메뉴 배지. 모드 모르면 전부 표시. 자동 감지 없음 | 사용자 결정 — "설치는 둘 다 했어도 연동 안 할 수도 있다", 연동은 명시적 선택 |
| 2026-10-12 | 설정 디자인 정리(settings-design) — 공용 `components/settings/{SettingsSection,SettingsRows,SettingsPageIntro}`, 페이지 `Heading large` 제거(AppShell 제목과 중복), 안내문 페이지당 1개·2문장(나머지 details), 섹션 카드·키/값 그리드·폼 너비 720px, 토큰만. testId·동작·쿼리키 무변경 | 사용자 요청 — "너무 복잡해 보임" |
| 2026-10-12 | 사용할 기능 선택(feature-selection) — 정책 키 `issueApprovalEnabled`·`timesheetApprovalEnabled`(기본 true, GLOBAL_ONLY, 판정은 `SettingsRepository.is*Enabled()` 단일 함수). **끔 = 신규 접수만 중지**(`createForTarget` 경계·전환 요청·필드 변경 요청·타임시트 제출; validator 통과·자동 전환 BLOCKED/`FEATURE_DISABLED`·결재/인증/마감/통제는 그대로, `featureGateScope.contract.test` 로 범위 고정). 비상 스위치 `transitionApprovalEnabled` 는 분리 유지(감사 action `feature/*`·`transitionEnforce/*`). 비관리자는 `getTimesheetContext.features`. 설정 첫 진입 "사용할 기능", 결재선·그룹·승인자는 "결재 구성", 메뉴 배지, 라벨 15 평문화 | 코덱스 독립 검토 `_workspace/feature-selection/codex-review.md` 반영, 사용자 결정 "신규 접수만 중지" |
| 2026-10-12 | 워크로그 정책 화면 정리(worklog-policy-ux) — 타임시트 정책 탭의 중복 계층 패널(scope=site) 제거, 4키(create/edit/deleteWindowDays·approvalMode)는 기존 폼 평문 섹션, 진단은 details, 프로젝트·이슈 패널은 "여기서 다르게 적용할 항목" 행(적용값+출처 칩·여기서 바꾸기·워크포스 고정), 초→분, authority 경고는 본문 유지. `getWorklogPolicyCatalog` 는 프론트 미사용(백엔드 잔존) | 사용자 — "사이트 워크로그 기본 정책 뭔 소리인지 모르겠음" |
| 2026-10-12 | 승인 종류 명확화(approval-kind-naming) — 6종 이름 고정(이슈 결재·상태 변경 승인·필드 변경 승인·타임시트 승인·워크로그 사전 승인·워크로그 인증), `approvalKindModel`(= 서버 TargetKind)·`ApprovalKindBadge` 단일 원천, 업무함 종류 열·필터 칩(URL `kind`, 클라이언트 필터 — 빈 상태가 "더 보기" 안내), 알림 `[종류]` 접두(`templateWithKind.*`, targetKind 없으면 원문), 이슈 화면 섹션명·한 줄 설명, 설정 용어(결재 공통 정책·결재자 명부·결재 그룹). `inbox.type.*` 삭제 | 사용자 — "상태 변경 승인인지 워크로그 승인인지 모르겠음" |
| 2026-10-12 | 작업 로그 표·상세 모달(worklog-table) — 열 작성자/시작/소요/기간(periodKey+잠금·인증·통제 배지)/작업("상세"), 설명·행 내 수정·삭제·인라인 이력 제거. Forge Modal mode `detail`(요약 + 상세/변경 이력 탭, 수정·삭제는 모달 안, 남의 행은 버튼 미렌더·쓰기 판정은 서버). 이슈 범위 정책 패널은 표 아래 details 유지 | 사용자 요청 |
| 2026-10-13 | 연동 이슈 작성 기간·사전 승인(linked-issue-schedule) — 워크포스 팀장이 작업관리 "승인 설정"에서 작업별 작성 기간·사전 승인을 정하고 서명 게시(rms.issue·rms.kb), 승인 앱이 검증·저장·판정(더 엄한 쪽, 저장 실패 시 거부, 제출 때 재조회·DB 대조), 연동 작업 입력은 승인 앱 워크포스식 화면 하나로(approval.ctl ch·rx), ctl 1,000건 한도 결함 수정. 문서 `docs/LINKED-ISSUE-SCHEDULE.md` | 사용자 — 이슈 정책 상속이 너무 복잡, 워크포스 입력 경로가 승인 앱 검사를 우회, "팀장이 작업 목록에서 정하자" |
