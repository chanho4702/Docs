# RFC-220 검토 결함 F1·F2·F3 수정 설계 — 연동 모드 워크로그 읽기 자격 전환

> 작성 2026-10-28. 근거: `03_verify_report.md`(결함 3건), 사용자 결정 2026-10-28:
> **"워크포스에서는 승인 여부와 관계없이 워크포스 권한으로 볼 수 있어야 한다. 앱 권한으로 보여 주면 된다."**
> 승인 앱 쪽 대응(cert.query BADGE 의 Browse 필터 제거)은 승인 앱 리포에서 같은 날 처리한다.

## 1. 원칙 (이번 변경의 규칙)

1. **승인 연동 모드(`approvalLinkMode === 'ON'`)에서 프로젝트 범위 워크로그 읽기는 앱 자격(asApp)으로 한다.** 승인 앱이 승인·확정분을 Jira visibility 로 숨기기 때문에 asUser 로는 승인된 기록이 사라지고, 그 결과 진척도·대시보드·개인별 목록이 승인할수록 줄어드는 것이 결함의 뿌리다. 숨기기는 수정 잠금이 목적이고 안 보이는 것은 부작용이다.
2. **보여 줄 범위는 워크포스 권한 모델이 정한다.** resolver 가드(프로젝트 스코프 `scopedProjectIds`·팀장 `leadingScopeAccountIds`·협업 `CollabAccess`)를 통과한 조회자는 그 프로젝트의 워크로그를 승인 여부와 무관하게 본다. Jira Browse 권한으로 다시 좁히지 않는다(F2 의 뿌리).
3. **포함하는 숨김 기록은 "승인 앱이 숨긴 것"만.** 작성자가 스스로 그룹·역할로 제한한 기록(원래부터 제한)은 전처럼 제외한다. 판정은 `issue.control`(purpose `AGGREGATE`, 전원 id — 승인 앱이 이미 활성 actor 누구에게나 답한다) 의 `hidden` 집합 ∋ worklogId. `visibility` 가 없는 행은 공개 행이다.
4. **승인 상태는 `cert.query` 로 1회 덧씌운다.** 읽어 온 행의 (작성자 × 월) 쌍으로 STATS(`as:'app'`, cacheScope 조회자) 를 묻고 `judgeRows` 로 `approval`·`countableSeconds` 를 붙인다. 행이 이미 전부 있으므로 **인증 문서 기반 "숨김 복원"(`hiddenCertifiedRowsOf` 경로)은 앱 자격 읽기에서는 쓰지 않는다**.
5. **승인 연동 모드가 아니면 지금 동작 그대로**(asUser 읽기, 변경 없음). Portfolio 배치(asApp + `applyWorklogApprovalForBatch`)·쓰기 경로(`write.judge`)·`src/integration/channel/*`(승인 앱과 바이트 동일 — 절대 수정 금지)는 건드리지 않는다.
6. SQL·KVS·manifest 추가 없음. Jira 호출은 asUser 읽기 → asApp 읽기로 **대체**되고, `applyWorklogApproval` 의 asUser `permissions/check`·`worklog/list` 재확인이 사라져 호출 수는 줄어든다.

## 2. 변경 지점

### 2.1 읽기 자격 판정 — 새 함수 `resolveWorklogReadAuthority`
- 위치: `src/permission/CollabAccess.js` 옆(또는 같은 파일) `resolveWorklogReadAuthority({ projectId, principal, settings? })` → `'app' | 'user'`. **절대 throw 하지 않는다.**
- 규칙: 승인 연동 모드 ON → `'app'`. 아니면 기존 `resolveCollabReadAuthority` 결과. 어떤 실패도 `'user'`.
- 설정 읽기는 `ApprovalCertReader` 가 쓰는 것과 같은 설정 소스(`approvalLinkMode`)를 쓴다. 조회자 principal 은 호출한 resolver 가드가 이미 프로젝트 스코프를 확인한 것을 전제로 한다(가드 없는 경로에서 부르지 않는다).

### 2.2 `ApprovalCertReader.applyWorklogApproval` — 앱 자격 읽기 분기
- 옵션 `readAs: 'user' | 'app'`(기본 `'user'`, 기존 동작 100% 유지).
- `readAs:'app'` 경로:
  1. 모드 OFF 면 그대로 반환(기존과 같음).
  2. 행 정규화(worklogId·accountId·issueId) 뒤 **asUser 재확인(permissions/check·worklog/list) 생략**.
  3. `visibility` 가 있는 행은 `createApprovalControlLookup({ cloudId, as:'app' })`(AGGREGATE) 의 `isApprovalHidden(log, issue)` 가 true 인 것만 남기고 나머지는 버린다(원칙 3). lookup 실패(`UNVERIFIED`·`NO_TRUST`)면 그 행은 **버린다**(fail-close — 숨긴 기록을 모르는 채로 내보내지 않는다).
  4. 쌍 = 남은 행의 (accountId, periodKey) 집합. `loadApprovalCertDocs({ as:'app', cacheScope: \`linked|${viewer.accountId}\` })` STATS 로 문서를 받아 `judgeRows`.
  5. `deletedApprovedRowsOf`(승인 후 삭제된 기록의 승인분 유지)는 기존대로 적용한다 — 범위는 요청 쌍.
  6. `onBasis` 는 기존과 같이 부른다.
- `includeHidden`·`selfOnly`·`issueIds`·`startDate/endDate` 는 `readAs:'app'` 에서 복원 용도로는 쓰지 않는다(날짜 범위 필터는 호출자가 이미 적용). 단 `selfOnly` 가 오면 `accountId === viewer` 행만 남긴다(내 작업 화면).
- 캐시 키에 조회자를 유지한다(워크포스 범위가 조회자마다 다르다).

### 2.3 `ResourceWorklogFetcher.getResourceProjectWorklogs`
- `as:'app'` 이면 `applyWorklogApproval(rows, viewer, { readAs:'app', selfOnly?, onBasis })`. `as:'user'` 는 기존 그대로.
- `viewer` 가 없으면(`ProjectProgressService` 처럼) `/myself` 가 아니라 **호출한 resolver 의 principal 을 넘기도록 호출자를 고친다**(채널 scope 와 캐시 키에 필요).

### 2.4 호출자 전환 (승인 연동 ON 이면 `readAs:'app'`)
| 호출자 | 변경 | 결함 |
|---|---|---|
| `projectProgress/ProjectProgressService.js:64,:218` | `resolveWorklogReadAuthority` → `getResourceProjectWorklogs({ projectId, as, viewer, onBasis })`. `withApprovedActual` 은 그대로(이제 승인분이 행에 있어 총계가 맞는다) | **F1** |
| `api/jira/worklog/CollabWorklogFetcher.js:226 getProjectWorklogsAsApp` | `applyWorklogApproval(rows, viewer, { readAs:'app', onBasis })` — asUser 재확인 제거. `collabControlOf` 의 숨김 판정은 유지(원칙 3 과 같은 판정) | **F2** |
| `projectDashboard/RelationGraphService.js:305` | 토폴로지와 같은 자격으로 `getResourceProjectWorklogs({ as, viewer, ... })` | F2 형제 |
| `projectCollab/CollabCalendarService.js:61`·`CollabIssueWorklogService.js:47` | `collabControlOf(cloudId, { aggregateOnly:true })`(AGGREGATE, 전원) 로 숨김 판정 → 협업 참여자는 남의 승인 기록도 **행**으로 본다(사용자 결정). `approvalFromDocs` 유지 | 결정 반영 |
| `projectCalendar/ProjectCalendarService.js:113` | `as`·`readAs:'app'`(연동 ON). 빈 워크로그 이슈 유지 패턴 그대로 | — |
| `utils/worklog/WorklogService.js:153 getProjectWorklogs` | 연동 ON 이면 asApp 읽기 + `readAs:'app'`; 작성자 필터는 뒤에 그대로 | — |
| `issueAnalysis/IssueAnalysisService.js:153` | 같음 | — |
| `resourceAnalysis/ResourceAnalysisService.js:155,:240` | 같음. `:240` 상세의 `withCertBadges` 는 유지(BADGE·STATS) | — |
| `projectCost/ProjectCostService.js:148,:269` | `as:'app'` 읽기 + `readAs:'app'`. `certifyCostRows` 는 유지하되 앱 자격 읽기면 `hiddenCertifiedRowsOf` 보충이 중복되지 않게(이미 행에 있음) — 중복 합산 금지 테스트 추가 | — |
| `myWork/MyWorkService.jsx:79,:191,:244,:267` | 연동 ON 이면 asApp 읽기 + `readAs:'app', selfOnly:true`(본인 행만). 연동 OFF 경로에서도 **F3 순서 결함은 고친다**: `processIssue`/`processMyIssue` 가 null 로 만든 이슈의 id 를 `withIssueApproval` 의 `issueIds` 에 포함하고(빈 컨테이너 보존), 복원 뒤에 빈 결과를 걸러낸다 | **F3** |

### 2.5 테스트
- `_workspace/rfc220-review/reproduce.case.js` 4건(F1·F2·F3×2) + 대조군 → 전부 통과해야 한다. 끝나면 이 파일은 그대로 두되 `.case.js` 유지(기본 테스트에 섞지 않음).
- `ApprovalDisplayPaths.test.js:151-157` 의 `approvalFromDocs` 호출 파일 허용 목록 갱신.
- 새 테스트: `readAs:'app'` 경로 — ① asUser 재확인 호출 0 ② `visibility` 행은 AGGREGATE hidden ∋ id 만 통과, lookup 실패 시 제외 ③ 원래부터 제한된 행 제외 ④ `selfOnly` 는 본인만 ⑤ 쌍은 행의 (작성자×월) 집합 ⑥ 연동 OFF 면 기존 경로 그대로(회귀) ⑦ 진척도 총계·누적선·구성원별이 같은 행 집합에서 나옴 ⑧ 원가 `certifyCostRows` 중복 합산 없음.
- 백엔드 전체 `npm.cmd test -- --runInBand` 녹색. 프론트는 변경 없음(응답 shape 불변).

### 2.6 문서
- `AGENTS.md` ⑦·⑧ 절(:55~58)·:129~131 — "숨긴 기록은 본인 행만(ROWS)·남의 것은 집계만(AGGREGATE)" 서술을 **"연동 모드 프로젝트 워크로그는 앱 자격으로 읽고 범위는 워크포스 권한 모델"** 로 바꾸고, asApp 예외 목록에 ⑨ 로 추가(:51 "열거된 플랫폼 예외").
- `CLAUDE.md` 변경 이력에 2026-10-28 행.

## 3. 하지 않는 것
- `src/integration/channel/*` 수정(공유 원본). `ops.js` 스키마 변경 없음 — 쓰는 op 는 기존 `cert.query`(STATS)·`issue.control`(AGGREGATE)만.
- 워크로그 프로퍼티에 승인 표식 쓰기(불변식 9, 사용자 결정으로 거부).
- 쓰기 경로·Portfolio 배치·설정 화면 변경.
- git add/commit/push/deploy — 리더가 Codex 검토 뒤 수행. 미추적 파일(LeaderTeamBackfill.test.js·custom-scopes.yaml·pptx·png·캡처.png·docs/external-api/*) 절대 건드리지 않음.
