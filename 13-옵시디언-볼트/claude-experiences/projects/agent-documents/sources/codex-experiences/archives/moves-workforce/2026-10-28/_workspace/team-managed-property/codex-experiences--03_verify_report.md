# 통합 정합성 검증 리포트 — 팀 관리형 프로젝트 지원(코워커·등록일·등록자 이슈 프로퍼티 이전)

- 날짜: 2026-07-14 · 브랜치: RFC-155 · 검증자: integration-verifier
- 입력: `01_architect_design.md`(§12 검증기준), `02_backend_report.md`, `02_frontend_report.md`, 실제 소스
- 결론: **통과 11 / 실패 0 / 미검증 1(E2E 런타임 — 하네스 범위 밖)**

---

## 요약 판정

| # | 검증 항목 | 판정 |
|---|---|---|
| 1 | 경계면 교차 비교(3 resolver 응답 shape ↔ 프론트 소비) | 통과 |
| 2 | 서비스 내부 소비자 전수(normalizeIssue/페처 시그니처) | 통과 |
| 3 | coworker read 잔존 grep(프로퍼티 전환 누락 0건) | 통과 |
| 4 | N+1 금지(bulk resolve 루프 밖 1회) | 통과 |
| 5 | 응답 계약 무회귀(coworkers = user객체 배열) | 통과 |
| 6 | JQL alias 4곳 치환 + projectId 무변경 + 문자열 잔존 0 | 통과 |
| 7 | date 함정(assignedAt date-only, assignedAtIso 분리) | 통과 |
| 8 | manifest(entityProperty + PoC 3블록/src/poc 제거) | 통과 |
| 9 | PermissionMap 신규 2키 + 계약 테스트 | 통과 |
| 10 | i18n merge(ko-KR/en-US 반영, 키 경로 일치) | 통과 |
| 11 | 테스트/빌드 실행 | 통과 |
| — | E2E 실사용(Forge 배포 후 프로퍼티 인덱스/JQL 동작) | **미검증** |

---

## 1. 경계면 교차 비교 (통과)

**updateIssueCoworkers**
- 생산자: `src/resolver/projectIssue/ProjectUsersService.js:334-340` → `{content:{issueId, coworkers: string[]}}`, responseWrapper → `{success:true, content:{...}}`
- 컨트롤러: `ProjectUsersController.js:30` `guardedDefine('updateIssueCoworkers', ({payload})=>...)`
- 소비자: `ProjectIssueTable.jsx:255` `invoke('updateIssueCoworkers', {issueId: issue.id, accountIds})` → `result.success` 분기, content 미사용 후 `searchByIssueId` 재조회. payload/응답 키 일치.

**recordIssueAssignedDate**
- 생산자: `ProjectUsersService.js:355-387` → `{recorded, skipped}`(기존 shape 유지). accountId는 context 취득.
- 컨트롤러: `ProjectUsersController.js:33-35` `recordIssueAssignedDateService({...payload, accountId: context?.accountId})` — 위변조 방지 정상.
- 소비자: `IssueAddModal.jsx:80` `invoke('recordIssueAssignedDate', {issueIds: checkItems})` — 필드 id 인자 제거됨, 비차단 로깅만. 일치.

**runFieldToPropertyMigration**
- 생산자: `src/resolver/migration/MigrationService.js:80-89` → `{content:{scanned,migrated,skipped,failed,nextPageToken,done}}`
- 컨트롤러: `MigrationController.js:9` 등록, `index.js:31,66` import+호출.
- 소비자: `MigrationSetting.jsx:40-54` `result.content.{...}` 누적, `done`(=`!nextPageToken`)까지 do-while 반복. 키·루프 조건 일치.

## 2. 서비스 내부 소비자 전수 (통과)
- `normalizeIssue` 시그니처 축소(ProgressCalculator): 호출부 ProjectCost/PortfolioAggregator는 2번째 인자를 계속 넘겨도 무시 → 파일 무수정, 회귀 없음. jest `ProgressCalculator`/`PortfolioAggregator`/`CostCalculator` 통과.
- 페처 시그니처(getProjectIssuesByFilter/getProjectGanttIssues/getAssigneeStats/getIssueParticipantStats)의 `coworkerFieldId` 6번째 인자 위치 유지 → `PortfolioAggregatorAsApp.test`의 `as` 위치 검증 무회귀.
- `MOVES_PROPERTY_KEY` import 확인: IssueAnalysisService.js:5, GanttMapper.js:8(로컬 상수), CoworkerResolver.js:12 — 사용 지점 전부 정의 존재(ReferenceError 없음).

## 3. coworker read 잔존 grep (통과)
- `[coworkerFieldId]`/`fields[coworker` 직접 read 잔존: **MigrationService.js:57 1건뿐**(구 커스텀필드→프로퍼티 이관 소스 read, 설계상 정당 예외).
- 프론트 표시 소비처 전수 프로퍼티 전환 확인: ProjectIssueTable / WorklogModal / MyIssueTable(§4 추가 수정, `MyIssueTable.jsx:14,131` `getIssueCoworkerIds`+`useUserInfos`) / taskHistory.transform. 공란 회귀 유발 소비처 0.

## 4. N+1 금지 (통과)
- 백엔드: `getAssigneeStats`(IssueApi.js:70-82) resolve는 **페이지 do-while 루프 밖 1회** `getBulkJiraUsersApi`. `getIssueParticipantStats`는 카운트만(resolve 없음). `CoworkerResolver.resolveCoworkerUsersMap`은 flat+dedup 후 1회. IssueAnalysis/Gantt 각 요청 1회.
- 프론트: ProjectIssueTable(페이지 1회 fetchBulkUsers), WorklogModal/MyIssueTable(`useUserInfos` bulk 1회). 루프 내 사용자 API 호출 0.

## 5. 응답 계약 무회귀 (통과)
- `getIssueAnalysisListService`(IssueAnalysisService.js:63-92): accountId[] → `coworkerUserMap.get(id)` → **user객체 배열** `coworkers` 유지, `totalWorkers=assignee?1:0+ids.length`.
- `GanttMapper.normalizeIssue`(GanttMapper.js:112-142): `coworkerUserMap` 주입, accountId→user객체 복원, `Task.coworkers` = user객체 배열 유지. 맵 미제공 단위테스트 시 빈 배열 안전.

## 6. JQL alias (통과)
- 치환 4곳: `IssueApi.getProjectIssuesByUser`(239, `movesRmsCoworkers`), `getJqlIssue.js`(24, `movesRmsCoworkers in`), `WorklogModal.jsx`(JQL `movesRmsCoworkers = currentUser()`), `TaskHistoryTable.jsx:51`(`ORDER BY ${MovesAlias.assignedAt} DESC`).
- `moves_RMS_projectId` JQL 전부 무변경(IssueApi 14/95/151/179/226/287/335/353/407/408, MigrationService:31, getJqlIssue:21/44, WorklogModal:325).
- `moves_RMS_coworkers` 문자열 잔존: FieldApi.js:7(COWORKER_FIELD_NAME, 마이그레이션 필드 name 매칭 — 정당 예외) + customField.js:22(CustomFieldKey 정의, JQL 참조처 0건 — `CustomFieldKey.coworkerIdField` grep 0). JQL로서의 잔존 0.

## 7. date 함정 (통과)
- `recordIssueAssignedDateService`(ProjectUsersService.js:358,373-374): `assignedAt=isoNow.slice(0,10)` date-only, `assignedAtIso=isoNow` 분리 저장.
- `runFieldToPropertyMigrationService`(MigrationService.js:69-70): `assignedAt=String(assignedIso).slice(0,10)`, `assignedAtIso=assignedIso` 분리. 둘 다 date 인덱스 함정 회피.

## 8. manifest (통과)
- `jira:entityProperty`(manifest.yml:56-69) movesRms, alias 3종(movesRmsCoworkers/movesRmsAssignedAt/movesRmsAssignedBy) 존재.
- PoC 제거 확인: `webtrigger`/`pocEntityProperty`/`moves-rms-poc` grep 0건. `src/poc/**` 디렉토리 삭제(Glob 0).
- `jira:customField`(coworkerIdField/assignedDateField/assignedByIdField/projectIdField) 선언 유지(파괴적 제거 금지 준수).

## 9. PermissionMap (통과)
- `updateIssueCoworkers: W('PROJECT','inherited')`(PermissionMap.js:79), `runFieldToPropertyMigration: W('SETTINGS')`(:209).
- `test/permission/permissionMap.contract.test.js` 통과(등록집합↔맵키 대조, 신규 2키 포함).

## 10. i18n (통과)
- 소스: `locales/kr/migration.json`·`locales/en/migration.json`에 `field2property` 중첩 구조(파일명=namespace 규약) → merge 후 `migration.field2property.*`.
- merge 결과: `locales/ko-KR.json:628`, `locales/en-US.json:628` `migration.field2property` 블록 존재. UI `t('migration.field2property.*')`(MigrationSetting.jsx) 키 경로 일치. ko-KR/en-US 직접 수정 없음.

## 11. 테스트/빌드 (통과)
```
루트 npm test          → Test Suites: 14 passed / Tests: 219 passed
static/ui jest         → Test Suites: 8 passed / Tests: 74 passed (taskHistory.transform 9 포함)
static/ui npm run build → Compiled with warnings(node_modules source-map만) / build 성공
```

---

## 미검증 (추측 통과 금지)
- **E2E 런타임**: manifest `jira:entityProperty` 배포 + `forge install --upgrade` 후에야 프로퍼티 인덱스/alias JQL이 실제 동작한다. 검증 환경에서 Forge 배포·실 이슈 프로퍼티 write/JQL 정렬은 미수행. 배포 순서(선언 배포 → 마이그레이션 배치) 준수 필요. 정적 교차검증 범위에서는 결함 없음.

## 실패 항목
없음.

---

# wbsParent 델타 검증 (설계 §11-B / 백엔드 리포트 §7, 2026-07-14 추가)

- 결론: **통과 5 / 실패 0 / 미검증 1(E2E 런타임)**

| # | 항목 | 판정 |
|---|---|---|
| 1 | 경계면 무회귀(getProjectGanttData Task shape·setGanttParent 응답 ↔ 프론트 소비) | 통과 |
| 2 | 잔존 grep(wbsParentFieldId fields-read / getAppFieldIds / updateAppCustomFieldValue 참조) | 통과 |
| 3 | write 경로(mergeIssueProperty 보존 + null 정규화 read/write 정합) | 통과 |
| 4 | 마이그레이션 wbsParent 복사·멱등 | 통과 |
| 5 | 테스트/빌드 | 통과 |
| — | E2E(미선언 path 저장·프로퍼티 read 실동작) | 미검증 |

## 1. 경계면 무회귀 (통과) — 양쪽 동시 읽기
- 생산자 `getProjectGanttData`(GanttService.js:112-127): `content.tasks` 각 Task에 `wbsParent`(GanttMapper.js:131) + `effectiveParent`(buildTasksAndLinks §6 병합, GanttMapper.js:169-177) 그대로 존재. Task shape 무변경.
- 생산자 `setGanttParent`(GanttService.js:239-245): `{content:{issueKey, parentKey, effectiveParent}}` — 응답 계약 무변경(write 메커니즘만 app/field→mergeIssueProperty 교체).
- 소비자 `useGanttMutations.useSetParent`(useGanttMutations.js:168-179): mutationFn이 `result.content ?? result` 언랩 → `data={issueKey,parentKey,effectiveParent}`. onSuccess(:244-264)가 `data.issueKey`/`data.parentKey`/`data.effectiveParent` 정확히 매핑. onMutate 낙관 패치(:235)도 `wbsParent`/`effectiveParent` 동형. 키 완전 일치.
- 소비자 `ganttAdapter.js`(:136 `t.wbsParent === eff`, :199 `wbsParent: task.wbsParent ?? null`) + `useGanttData`: `content.tasks[].wbsParent/effectiveParent` 소비 — 필드 존치로 무회귀.

## 2. 잔존 grep (통과)
- `wbsParentFieldId` fields-read 잔존: **MigrationService.js:62 1건뿐**(구 필드→프로퍼티 이관 소스 read — 정당 예외). GanttMapper/GanttService/IssueApi read 경로는 전부 `issue.properties.movesRms.wbsParent`.
- `getAppFieldIds`: 전역 grep **0건**(정의·호출 모두 삭제 완료, FieldApi에서 제거됨). 프론트 포함 0.
- `updateAppCustomFieldValue`: 호출/참조 **0건**. 정의만 IssueApi.js:446에 잔존(사용처 0인 dead export — 아래 §관찰). "참조 잔존 0" 기준 충족.

## 3. write 경로 (통과)
- `setGanttParent`(GanttService.js:224): `mergeIssueProperty(issueKey, {wbsParent: normParent})` — read-merge-write로 coworkers/assignedAt 등 다른 프로퍼티 필드 보존(IssuePropertyApi.mergeIssueProperty:85-88 `{...prev, ...patch}`).
- 해제=null 정규화 정합: write `normParent = parentKey || null`(GanttService.js:206) ↔ read `(typeof x==='string' && x.trim()) ? x.trim() : null`(GanttMapper.js:90). 빈문자/공백/null 모두 양쪽에서 null로 수렴 — 정합.

## 4. 마이그레이션 (통과)
- MigrationService.js: getMovesFieldIds에서 `wbsParentFieldId` 조달(:28), fieldList에 추가(:30), 소스 read+trim 정규화(:62-63), skip 조건에 `!wbsParent` 추가(:66 — 원본 전부 공란이면 skip), 프로퍼티 write 객체에 `wbsParent` 포함(:74). 멱등 조건(프로퍼티 존재 시 skip, :53-54) 동일 유지.
- FieldApi.js: `WBS_PARENT_FIELD_NAME='moves_RMS_wbsParent'`(:6), getMovesFieldIds 반환에 `wbsParentFieldId`(:62). manifest customField `wbsParentField`(manifest.yml:32-33) 선언 유지.

## 5. 테스트/빌드 (통과)
```
루트 npm test           → 14 suites / 219 passed (GanttMapper.test 포함, 신규 실패 0)
static/ui npm run build → Compiled with warnings(node_modules source-map만) / build 성공
```
- `GanttMapper.test.js`는 프로퍼티 shape(`properties.movesRms.wbsParent`, 3번째 인자)로 갱신되어 통과(wbsParent 우선/폴백/dangling 케이스 검증).

## 미검증
- **E2E**: `movesRms.wbsParent`는 manifest entityProperty에 미선언(JQL 미검색). 미선언 path 저장·프로퍼티 read 실동작은 PoC로만 확인됨, 실 배포 검증은 하네스 범위 밖. 정적 교차검증 범위에서 결함 없음.

## 관찰(비차단 — 실패 아님)
1. **dead export**: `updateAppCustomFieldValue`(IssueApi.js:446) 정의가 호출처 0인 채 잔존. 기능 영향 없음(참조 0). 후속 청소 시 제거 권장.
2. **stale comment**: useGanttMutations.js:154-155 주석이 "wbsParent write(app/field/value)는 search 인덱스 지연"이라 기술 — write가 mergeIssueProperty로 바뀌어 실제 원인은 아니나, onSettled-무invalidate + 서버응답 캐시 패치 정책 자체는 여전히 유효(동작 무영향). 주석만 갱신 권장.

---

# 최종 패스 (마이그레이션 제거 · 간트) — 2026-07-14

- 결론: **통과 4 / 실패 0 / 미검증 1(E2E 런타임)**

| # | 항목 | 판정 |
|---|---|---|
| 1 | 마이그레이션 제거 완전성(전역 grep 0 + 계약테스트 + locales) | 통과 |
| 2 | 간트 wbsParent 프로퍼티 체인 end-to-end 재확인 | 통과 |
| 3 | PortfolioAggregator getCoworkerFieldIdApi 성격 판정 | 통과(무해 잔재) |
| 4 | 테스트/빌드 | 통과 |
| — | E2E(Forge 배포 후 프로퍼티 실동작) | 미검증 |

## 1. 마이그레이션 제거 완전성 (통과)
- 전역 grep `runFieldToPropertyMigration|MigrationSetting|MigrationService|MigrationController|field2property|getMovesFieldIds|registerMigrationController` → **0건**(src/ + static/ui/ + manifest + locales 전체).
- 파일 삭제 확인: `src/resolver/migration/**`(Glob 0), `MigrationSetting.jsx`(Glob 0), `**/migration.json`(Glob 0 — 소스 kr/en 스텁도 제거).
- DB 마이그레이션(`migrate.js`/`runMigration`)은 별개 기능이므로 검증 대상에서 제외(간섭 없음).
- PermissionMap↔컨트롤러 등록 계약: `test/permission/permissionMap.contract.test.js` **통과** — `runFieldToPropertyMigration` 키가 맵·등록집합 양쪽에서 제거되어 대조 일치(잔존 키/미등록 키 0). index.js `registerMigrationController` import·호출 제거(grep 0).
- i18n: `ko-KR.json`/`en-US.json`에 `migration`/`field2property` 네임스페이스 **부재**(grep 0). build "Module not found" 없음 → SettingPage의 MigrationSetting import도 제거됨(dangling 0).

## 2. 간트 wbsParent 체인 end-to-end (통과)
- **① read 경로**: `getProjectGanttIssues(projectId)`(IssueApi.js:383-417)가 `&properties=movesRms` 동봉(coworkerFieldId 인자 미사용, fieldList에 coworker/wbsParent 없음) → `GanttMapper.normalizeIssue`(:88-90)가 `issue.properties.movesRms.wbsParent` → trim/빈문자→null 정규화 → `Task.wbsParent`(:131) → `buildTasksAndLinks`(:169-177)가 `effectiveParent = wbsParent ?? jiraParent ?? null`(페치집합 멤버십 검증) → 프론트 `ganttAdapter.js`(:136 viaWbs 판정, :199 폴더드롭 override 판단)·`GanttChart.jsx`(:898 드래그 wbsParent 조회) 소비. 체인 무결.
- **② write 경로**: `setGanttParent`(GanttService.js:198-246)가 `fetchGanttGraph`로 그래프 1패스 조달 → **순환 방어 유지**(`detectTreeCycle` :220, keySet 멤버십 :211) → 통과 시 `mergeIssueProperty(issueKey,{wbsParent:normParent})`(:224, 다른 프로퍼티 필드 보존) → `{content:{issueKey,parentKey,effectiveParent}}` 반환 → `useGanttMutations.useSetParent` mutationFn `result.content` 언랩(:179) → onSuccess 캐시 패치 `data.parentKey/effectiveParent`(:257-258). 순환/self/교차프로젝트 검증 로직 무변경.
- **③ 폴더 기능 간섭 없음**: 간트 폴더는 SQL 기반(`findFoldersByProjectRepository`/`findFolderIssuesByProjectRepository`/`findFolderLinksByProjectRepository`, GanttService.js:66-97, best-effort 폴백)으로 wbsParent 프로퍼티와 완전 분리. Task shape·folders/folderIssues/folderLinks 응답 additive 무변경.
- **④ 마이그레이션 제거 영향 0**: 간트 read/write 어느 경로도 마이그레이션·getMovesFieldIds에 의존한 적 없음(간트는 getProjectGanttIssues 프로퍼티 동봉으로 자립). 제거가 간트에 미치는 영향 없음.

## 3. PortfolioAggregator getCoworkerFieldIdApi (통과 — 무해 잔재)
- **판정: 잔재(무해), 후속 청소 후보. 실소비 아님 → 회귀 위험 없음.**
- 호출 체인: `getPortfolioDashboard` → `getCoworkerFieldIdApi()`(PortfolioAggregator.js:485) → `aggregateOneProject(...,coworkerFieldId)`(:248) → (a) `fetchAllIssues`(:426) → `getProjectIssuesByFilter(...,coworkerFieldId,'app')`(:430) — **coworkerFieldId 미사용**(IssueApi.js:351-368: fields 고정 문자열, coworker 없음, 항상 `&properties=movesRms`), (b) `normalizeIssue(i, coworkerFieldId)`(:317) — **normalizeIssue는 단일 인자**(ProgressCalculator.js:17, 2번째 인자 무시, coworker 카운트를 `issue.properties.movesRms.coworkers.length`에서 산출).
- 결론: 필드 id를 조달해 넘기지만 페처·정규화 어디서도 fields 기반 coworker를 읽지 않음. `totalWorkers` 카운트는 프로퍼티에서 정확히 나옴 → **coworker 데이터 유실/회귀 없음**. 유일한 비용은 포트폴리오 집계당 `/rest/api/3/field` 호출 1회(무시 가능). `getCoworkerFieldIdApi` 조달 + 인자 전달 제거는 안전한 후속 청소.

## 4. 테스트/빌드 (통과)
```
루트 npm test           → 14 suites / 219 passed (permissionMap.contract 포함, 신규 실패 0)
static/ui npm run build → Compiled with warnings(node_modules source-map만) / build 성공 (Module not found 0)
```

## 미검증
- **E2E**: Forge 배포(`jira:entityProperty` 선언 + `forge install --upgrade`) 후 프로퍼티 인덱스/alias JQL/미선언 wbsParent path 저장의 실동작은 하네스 범위 밖. 정적 교차검증 범위에서 결함 없음.

## 실패 항목
없음.
