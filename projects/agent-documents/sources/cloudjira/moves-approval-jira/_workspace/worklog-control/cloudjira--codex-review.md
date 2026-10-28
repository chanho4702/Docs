## 결론

**현재 설계 그대로 `VISIBILITY`와 자동 `DELETE`를 운영 활성화하는 것은 보류해야 합니다.**
visibility를 이용한 수정·삭제 차단은 공식 REST 권한 조건에 근거가 있지만, 설계가 주장하는 **“등록 시점부터 완전한 통제”**까지 보장하지는 않습니다.
가장 큰 결함은 워크포스 정상 입력의 출처 증명 누락, 오래되거나 불완전한 서명 문서를 이용한 쓰기 허가, 제한·해제 작업의 장애 및 경합 처리입니다.
두 저장소와 공식 OpenAPI·Atlassian 문서를 읽기 전용으로 검토했습니다. 코드·문서는 수정하지 않았으며, 개발 사이트 실측이나 테스트 실행은 하지 않았습니다.

## 질문별 판정

**1. visibility가 Jira 경로의 수정·삭제를 막는가 — 부분: 권한 해석은 맞고, 전체 보장 주장은 과합니다.**

공식 REST 문서에서 연결하는 [OpenAPI 원문](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.8516.130)의 `getWorklog`, `updateWorklog`, `deleteWorklog`를 직접 확인했습니다.

| 작업 | 문서상 필요한 조건 |
|---|---|
| GET | Browse Projects + 이슈 보안 수준 충족 + 제한된 그룹·역할의 멤버십 |
| PUT | 위 조건 + Edit own 또는 Edit all worklogs |
| DELETE | 위 조건 + Delete own 또는 Delete all worklogs |

**작성자 예외는 명시되어 있지 않습니다.** `Edit all`·`Delete all`도 visibility 조건을 대체하는 권한으로 기술되어 있지 않습니다. 따라서 제한 역할의 멤버가 아닌 작성자나 관리자에게 직접 PUT·DELETE가 허용된다고 해석할 근거는 없습니다. [공식 Worklogs API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/)

visibility 해제도 동일한 PUT입니다. 문서에는 별도의 “visibility 해제 권한”이 없으므로, **기존 제한을 통과하지 못하는 사용자가 본문에 공개 visibility를 넣어 우회할 수 있다는 근거도 없습니다.** 다만 실제 서버의 검사 순서는 V4에서 해제 본문까지 보내 확인해야 합니다.

다음 이유로 설계의 “요구 충족” 표는 수정해야 합니다.

- 생성 POST와 제한 PUT 사이에 변경 가능한 시간이 있습니다.
- 승인·인증 뒤 큐 처리 전에도 같은 공백이 있습니다.
- 원래 제한된 워크로그는 `SKIPPED_RESTRICTED`로 남깁니다. 작성자가 속한 그룹으로 직접 생성하면 통제를 피할 수 있는 경로입니다.
- 닫힌 이슈나 권한 부족으로 제한 PUT이 실패한 건도 존재합니다.
- 앱 역할을 공유하는 다른 앱의 권한까지 제거하는 수단은 아닙니다.

이 예외들은 설계 자체에 있습니다. [설계:90](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:90), [설계:118](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:118), [설계:328](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:328)

또한 V4의 성공 기준을 **“403 반환”으로 고정하면 안 됩니다.** 공식 스펙은 권한 부족을 400·404로 표현하는 경우도 명시합니다. 판단 기준은 **실제 변경·삭제가 발생하지 않았는가**입니다.

**2. Forge 앱 사용자가 해당 역할의 멤버인가 — 부분: 공식 문서만으로 확정할 수 없습니다.**

[Atlassian KB](https://support.atlassian.com/jira/kb/the-atlassian-addons-project-access-project-role-in-jira-cloud/)는 이 역할을 Connect용 시스템 역할로 설명합니다. 따라서 이를 근거로 **두 Forge 앱이 모든 고객 프로젝트에서 자동으로 멤버가 된다**고 확정할 수 없습니다. 반대로 오래된 Forge 장애 사례만으로 현재도 멤버가 아니라고 단정해서도 안 됩니다.

KB에서 확인되는 사실은 다음과 같습니다.

- company-managed와 team-managed 모두 REST에서 역할을 조회할 수 있습니다.
- 시스템 역할의 멤버를 일반 역할처럼 수정할 수 없습니다.
- 역할과 앱 scope는 별개의 권한 조건입니다.

따라서 V1·V16은 **승인 앱과 워크포스 앱 각각의 실제 계정으로 제한 워크로그를 읽고 쓰는 시험**이어야 합니다. 역할 목록에 비슷한 이름의 앱 계정이 보이는 것만으로 통과시키면 안 됩니다.

대안은 다음 순서로 검토할 수 있습니다.

1. 두 앱 계정을 넣은 전용 프로젝트 역할.
2. 앱 계정과 복구 관리자를 넣은 전용 그룹.
3. 고객이 명시적으로 수용하는 권한 회수 방식.
4. 감지·인증 제외 방식.

1·2는 **실측할 후보이지 이미 보장된 대안은 아닙니다.** 일반 역할에는 사용자 actor를 추가하는 REST가 있지만, 해당 Forge 계정에 대한 적용 가능성을 확인해야 합니다. [Project role actors API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-role-actors/)

두 앱이 읽을 수 있고 일반 사용자는 속하지 않는 제한 대상을 확보하지 못하면, visibility 방식의 핵심 전제는 무너집니다. 이때 `asApp`이라는 이유만으로 제한을 통과한다고 가정해서는 안 됩니다.

**3. 부작용 평가가 충분한가 — 부분: 목록은 좋지만, 대응 경로가 덜 완성되어 있습니다.**

주요 누락은 다음과 같습니다.

- **인증 화면뿐 아니라 인증 실행도 바꿔야 합니다.** `certifyFor()`는 실행 직전 `fetchWorklogsByIdAsUser(ids)`로 다시 읽습니다. 연동 이슈에서 처음부터 숨겨진 워크로그, `MISMATCH` 재인증, 본인 인증의 상위자 확인 등이 목록에는 보여도 실행 시 실패할 수 있습니다. [WorklogCertService.js:539](C:/CloudJira/moves-approval-jira/src/resolver/worklogCert/WorklogCertService.js:539)
- **워크포스는 asApp으로 바꾸기만 해서는 집계가 복구되지 않습니다.** 기존 협업 수집기는 visibility가 있는 워크로그를 명시적으로 제외합니다. 이 필터를 무조건 제거하면 기존 제한 공개 데이터가 노출될 수 있으므로, 승인 앱이 통제한 기록임을 증명하는 별도 조건이 필요합니다. [CollabWorklogFetcher.js:28](C:/CloudJira/moves-workforce/src/api/jira/worklog/CollabWorklogFetcher.js:28), [CollabWorklogFetcher.js:64](C:/CloudJira/moves-workforce/src/api/jira/worklog/CollabWorklogFetcher.js:64)
- **내 타임시트 보충에는 건수·합계 외의 계약도 포함됩니다.** 현재 collector는 `issues`, `createdAtById`, `checksById`, `checksAvailable`도 반환합니다. 숨겨진 워크로그만 배열에 추가하면 이슈 메타데이터나 정책 점검 입력이 빠질 수 있습니다. ID 중복 제거, 기간 필터, 수집 상한도 병합 후 다시 적용해야 합니다. [WorklogCollector.js:177](C:/CloudJira/moves-approval-jira/src/resolver/timesheet/WorklogCollector.js:177)
- **JQL·리포트의 결과를 현재처럼 확정적으로 설명하면 안 됩니다.** 설계는 “검색·리포트에서 보이지 않는다”고 안내하면서 V22에서는 JQL 검색 여부를 미검증으로 남깁니다. 이슈 검색 결과, 반환되는 worklog 상세, `timespent`, 리포트 집계는 각각 측정해야 합니다. [설계:85](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:85), [설계:708](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:708)
- **“합계만 반환”도 별도의 인가가 필요합니다.** 한 명·한 건짜리 집계는 사실상 개인 상세이고, 워크포스의 기존 원가·팀 범위 제한을 우회해서는 안 됩니다. WF-7의 집계 기본 가정은 U-C의 “본인만” 결정만으로 정당화되지 않습니다. [설계:766](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:766)

앱 제거 부분은 최신 문서로 갱신해야 합니다. Forge에는 **`preUninstall` 모듈이 있습니다.** 다만 실행 시간은 55초이고 실패해도 제거가 계속되므로 대량 워크로그의 복원을 보장하지 않습니다. 수동 일괄 해제가 주 경로이고, 이 훅은 보조 정리 수단이어야 합니다. 추가하면 “manifest 모듈 추가 없음”도 달라집니다. [공식 pre-uninstall 문서](https://developer.atlassian.com/platform/forge/manifest-reference/modules/pre-uninstall-trigger/)

라이선스 만료 시 status·release를 허용하려는 방향은 맞습니다. 그러나 **해제 실패 재개, 원래 제한 대상 변경, 앱 접근 정책 차단, 앱 권한 상실**까지 복구 절차에 포함해야 합니다. 현재 해제 설계는 `RESTRICTED` 행만 열거합니다. [설계:409](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:409)

**4. 불변식 8의 예외가 안전하게 정의됐는가 — 부분: 작성자 판정은 타당하지만, 그것만으로 충분하지 않습니다.**

OpenAPI의 `Worklog.author`와 `updateAuthor`는 `readOnly`입니다. 일반 worklog POST·PUT의 클라이언트 본문으로 작성자를 바꾸는 것은 지원되는 계약이 아닙니다. **Jira에서 직접 받은 `author.accountId`를 서버의 호출자 ID와 비교하는 방식은 타당합니다.** 단, 작성자 일치는 “우리 화면에서 작성했다”는 증거가 아닙니다. [공식 OpenAPI](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.8516.130)

예외에는 다음 조건을 명시해야 합니다.

1. 호출자는 신뢰하는 resolver context에서 얻습니다.
2. SQL 소유자 조건으로 후보를 줄인 뒤, **현재 Jira 응답의 작성자·worklog ID·issue ID를 다시 대조**합니다.
3. 본인 또는 현재 팀원이라는 조건에 더해, **현재 조회자의 이슈 열람 권한을 모든 반환 행에 적용**합니다.
4. 원래부터 제한된 임의 워크로그가 아니라 **우리 통제로 가려진 워크로그임을 확인**합니다.
5. 팀장 응답에서 제한 공개 설명을 어디까지 보여 주는지 별도 명시합니다. 기존 AGENTS의 “설명은 작성자에게만” 규칙이 자동으로 없어지는 것은 아닙니다.
6. 캐시·count·합계·내보내기에도 같은 범위를 적용합니다.

단일 이슈 탭은 `issue:view` 가드를 활용할 수 있지만, 타임시트·팀장 화면에서 `TeamScope.leads`만 검사하고 asApp 결과를 보충하면 **팀원이 작성했다는 이유로 조회자가 볼 수 없는 이슈의 기록까지 노출될 수 있습니다.** 기존 인증 쓰기 경로에 이미 있는 `filterVisibleIssues`를 보존하고 읽기에도 적용해야 합니다. [WorklogCertService.js:549](C:/CloudJira/moves-approval-jira/src/resolver/worklogCert/WorklogCertService.js:549), [설계:401](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:401)

또한 `listForeignWorklogs`는 보이지 않는 이슈에 대해 `issueKey`만 null로 만들고 작성자·날짜·시간·issue ID를 반환하는 계약입니다. **메타데이터 일부를 가리는 것은 행의 접근 권한을 제한하는 것과 다릅니다.** [설계:161](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:161)

워크포스 WF-7의 `author.accountId === context.accountId`는 좋은 출발점입니다. 다만 연동 설정 문서의 서명과 작성자 일치만으로 임의의 제한 공개 워크로그를 반환하는 범위까지 확대해서는 안 됩니다.

**5. 작성 의도·90초 재확인·DELETE 안전장치는 충분한가 — 부분: 자동 삭제를 허용하기에는 부족합니다.**

가장 명확한 오탐 경로는 **워크포스 탭의 정상 작성**입니다.

현재 워크포스 작성 코드는 프론트에서 Jira에 직접 POST합니다. 설계 WF-7도 작성은 asUser를 유지하지만, 승인 앱의 intent·origin에 결속하거나 워크포스가 신뢰 가능한 작성 증명을 전달하는 계약은 없습니다. 따라서 승인 앱은 정상 입력을 `FOREIGN`으로 분류할 수 있습니다. 90초를 기다려도 생성되지 않는 증명은 생기지 않습니다. [worklogWrite.js:87](C:/CloudJira/moves-workforce/static/ui/src/components/worklog/worklogWrite.js:87), [설계:355](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:355), [설계:766](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:766)

그 밖에도 다음 경로가 있습니다.

- **동일한 값의 워크로그 두 건:** author·issue·started·seconds·시간 범위만으로는 출처를 구별하지 못합니다. 외부 생성분이 먼저 intent를 소비하면 정상 입력이 나중에 FOREIGN이 될 수 있습니다. intent의 원자적 1:1 결속과 고유 operation ID가 필요합니다. [설계:242](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:242)
- **정상 입력 뒤 빠른 수정:** 이벤트가 생성 당시 값이 아닌 최신 값을 읽으면 intent와 started·seconds가 달라질 수 있습니다.
- **출처 증거의 조기 삭제:** 비연동 정상 입력의 control 행과 intent를 모두 지우면, 지연·중복 생성 이벤트가 정상 출처를 다시 확인할 수 없습니다. 특히 `foreignScope=ALL`에서 문제가 됩니다. [설계:506](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:506)
- **삭제 유예 중 인증:** 인증 제외 조건은 `FLAGGED`만 명시하지만, S4는 삭제 직전 현재 승인·인증 상태를 검사하지 않습니다. `DELETE_PENDING`이 인증된 뒤 삭제되는 경로를 막아야 합니다. [설계:362](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:362), [설계:372](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:372)
- **취소·설정 변경과 경합:** 재조회 뒤 DELETE 사이에 오탐 해제, DELETE→FLAG/OFF, 연동 해제, 기간·소유 이슈 변경이 발생할 수 있습니다. 실행 직전 현재 설정과 행 상태를 검증하는 claim·세대 조건이 필요합니다.
- **일일 상한 경쟁:** KVS 카운터라는 설명만으로 50건 상한의 원자성이 보장되지 않습니다. 병렬 consumer가 동일한 잔여 수량을 보고 초과 삭제하지 않도록 해야 합니다.
- **불완전한 복원:** 설명 앞 2,000자의 평문은 원본 ADF·properties·원래 ID를 복원하지 못합니다. “다시 입력”은 복원이 아닙니다. [설계:373](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:373)

S4의 `updated > detectedAt`도 변경 여부의 충분한 증거가 아닙니다. 감지 시점에 이미 바뀐 기록과 시간 경합을 구분하려면 **감지 당시의 현재값·지문과 재조회 결과를 비교**해야 합니다. 자체 visibility PUT으로 바뀐 `updated`와 사용자 변경도 구분해야 합니다.

따라서 초기 배포는 FLAG가 적절합니다. **출처 불명은 삭제 근거가 되어서는 안 됩니다.**

**6. 유휴 SQL 추가 0 주장이 맞는가 — 맞음, 단 정상 유휴 상태에 한정됩니다.**

새 스케줄이나 `DAILY_JOBS` 항목을 추가하지 않고, 작업이 없는 상태에서 이벤트성 큐를 만들지 않으면 **기존 대비 유휴 SQL 추가 0**은 가능합니다. 현재 테스트 기준은 비연동 하루 27회 이하이고, 연동 워크포스 작업은 13회 이하입니다. 전체 SQL이 0이라는 뜻은 아닙니다. [idleSqlBudget.test.js:132](C:/CloudJira/moves-approval-jira/src/trigger/__test__/idleSqlBudget.test.js:132), [idleSqlBudget.test.js:193](C:/CloudJira/moves-approval-jira/src/trigger/__test__/idleSqlBudget.test.js:193)

이벤트가 있으면 intent INSERT·정리·결속, control 조회·CAS, 연동·인증 확인, 지연 재확인 등 추가 SQL이 발생합니다. visibility PUT 자체가 만드는 updated 이벤트와 기존 이력·관찰 비용도 포함해야 합니다. 설계의 표는 전체 호출 비용의 상한으로 보기 어렵습니다. [설계:668](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:668)

다만 비용과 별개로 두 가지 기능 결함이 있습니다.

- `lockMethod=NONE`이면 감지도 반환하므로, “NONE은 검사+감지”라는 설명과 맞지 않습니다.
- `foreignAction=OFF`이면 created 처리 전체가 반환하므로, 연동 이슈의 외부 생성분에 visibility를 적용하는 작업까지 사라집니다.

**통제 적용과 외부 입력 처리를 분리해야 합니다.** [설계:350](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:350), [설계:607](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:607)

큐 재사용도 단순한 enum 추가로 끝나지 않습니다. 현재 helper는 `job·round·cloudIdHint`만 전달하고, consumer는 최대 3회 이어달리기 뒤 다음 날 일일 작업이 재개한다는 전제를 갖습니다. 새 이벤트성 작업은 `op·worklogId·cursor` 보존과 독립적인 영속 재개 경로가 필요합니다. [sweepJobs.js:110](C:/CloudJira/moves-approval-jira/src/trigger/sweepJobs.js:110), [runSweepJob.js:31](C:/CloudJira/moves-approval-jira/src/trigger/runSweepJob.js:31)

**7. Start date 탐색 방식이 적절한가 — 부분: 이름 탐색은 후보 제안용으로만 적절합니다.**

`customfield_10015`를 고정하지 않으려는 방향은 맞습니다. 그러나 다음 문제가 있습니다.

- 이름과 datepicker 스키마만 같아도 다른 필드일 수 있습니다.
- 프로젝트·이슈 유형별 field context가 다를 수 있습니다.
- `/field` 결과는 호출자의 접근 가능 프로젝트 등에 영향을 받습니다. 첫 일반 호출자의 결과를 사이트 공통으로 7일 캐시하면 다른 프로젝트에 잘못 적용될 수 있습니다. [공식 Get fields 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/)
- 후보 없음·복수 후보·잘못된 날짜·`start > end`를 모두 “제한 없음”으로 처리합니다. **설정 실패가 제한 해제로 이어지는 fail-open**입니다. [설계:231](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:231), [설계:426](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:426)
- 워크포스 간트는 현재도 `customfield_10015`를 읽습니다. 승인 앱이 다른 필드를 선택하면 화면의 기간과 실제 허용 기간이 달라질 수 있습니다. [GanttMapper.js:93](C:/CloudJira/moves-workforce/src/resolver/gantt/GanttMapper.js:93)

권고는 **관리자 확정 매핑 + 대상 프로젝트의 실제 이슈에서 값 검증**입니다. 정상적으로 읽은 빈 날짜와 필드 미해결·조회 실패를 구분하고, 기간 제한 ON 상태에서 후자는 저장을 거부해야 합니다. 양 앱은 같은 필드 매핑과 timezone을 사용해야 합니다.

**8. 더 단순한 안이 있는가 — 맞음: 있으나 요구 충족 범위가 줄어듭니다.**

“확정분만 visibility 제한 + 나머지 FLAG”는 연동 이슈 전체 통제보다 작고 검증하기 쉽습니다. 하지만 연동 이슈의 미확정 워크로그까지 우리 화면으로만 수정·삭제한다는 요구는 충족하지 않습니다.

권한 회수안은 조회 경로를 유지할 수 있지만 고객 설정 부담과 비통제 워크로그에 대한 과잉 제한이 있습니다. **Edit own/Delete own만 회수해서는 부족하며, 사용자에게 남은 Edit all/Delete all 부여도 확인해야 합니다.**

요구별 비교와 권고 순서는 아래 `권고안`에 정리했습니다.

**9. V1~V24 중 현재 활성화 관문이 충분한가 — 부분: V1·V2·V3·V4·V10만으로 부족합니다.**

현재 관문은 제한을 걸 수 있고 작성자가 막히는지에 집중되어 있습니다. 두 앱의 정상 작동, 복구, 기간 필드, 기존 집계, DELETE 오탐을 포함하지 않습니다. [설계:712](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:712)

또한 V 목록에 없는 **서명 문서의 최신성·완전성, 큐 유실·중복, SQL/Jira 사이의 부분 성공**을 필수 검증에 추가해야 합니다. 구체적인 최소 집합과 절차는 마지막 절에 제시합니다.

## 설계 결함·누락

여기서 P0는 해당 모드를 활성화했을 때 데이터 손실 또는 핵심 통제 우회가 가능해 출시를 막아야 하는 항목입니다.

| 심각도 | 결함과 영향 | 필요한 보완 |
|---|---|---|
| **P0** | **워크포스 정상 입력을 FOREIGN으로 분류할 수 있습니다.** 승인 앱 intent에 연결되는 계약이 없어 DELETE 모드에서 정상 기록이 삭제될 수 있습니다. [설계:355](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:355), [설계:766](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:766) | 서버가 검증할 수 있는 작성 증명과 원자적 결속을 먼저 설계해야 합니다. 그전에는 DELETE를 비활성화합니다. |
| **P0** | **WF-8의 서명 게시물만으로 현재 수정 허가를 결정할 수 없습니다.** 서명은 최신 상태임을 증명하지 않습니다. 게시 실패·캐시·과거 문서 재생 외에도 인증 `w` 목록은 1,000건에서 잘립니다. 목록에 없다는 이유로 미인증으로 판단하면 확정분을 수정할 수 있습니다. [설계:767](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:767), [contract.js:86](C:/CloudJira/moves-approval-jira/src/integration/workforce/contract.js:86), [ApprovalCertReader.js:23](C:/CloudJira/moves-workforce/src/resolver/approvalLink/ApprovalCertReader.js:23) | 쓰기 직전 권위 있는 현재 판정을 받아야 합니다. 부재·검증 실패·`wt=true`를 허가로 해석하지 말고, `MISMATCH` 잠금도 보존해야 합니다. 서명 검증만으로 최신성 문제가 해결되지는 않습니다. |
| **P1** | **asApp 보충 조회의 범위가 불완전합니다.** TeamScope만으로 이슈 열람을 대체하거나 관리자 목록에서 key만 가리면 접근 불가 기록이 노출될 수 있습니다. [설계:161](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:161), [설계:402](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:402) | 현재 작성자·이슈 관계와 조회자 이슈 열람을 재확인하고, 설명·집계·캐시에 같은 범위를 적용합니다. |
| **P1** | **제한·해제 PUT이 동시 편집 값을 덮어쓸 수 있습니다.** GET으로 읽은 `started·timeSpentSeconds`를 재전송하는 동안 다른 호출이 수정하면 이전 값으로 되돌릴 수 있습니다. SQL CAS는 Jira 값을 보호하지 않습니다. [설계:520](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:520) | V10에서 visibility만 보내는 PUT을 우선 검증하고 불필요한 값 재전송을 제거합니다. 현재값 대조와 경합 처리도 별도로 정의합니다. |
| **P1** | **Jira 성공·SQL 실패 후 복구가 없습니다.** Jira에는 제한이 걸렸지만 DB가 PENDING/FAILED이면 RESTRICTED만 읽는 화면·해제 작업에서 빠질 수 있습니다. NONE으로 직접 변경하거나 제한 그룹을 바꿀 때도 같은 문제가 생깁니다. [설계:394](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:394), [설계:409](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:409) | 적용 결과 불명 상태, 행별 실제 적용 대상, 재대조를 정의합니다. 해제 중 신규 제한을 중지하고 잔여 제한이 해소되기 전에는 완료·NONE 전환을 허용하지 않습니다. |
| **P1** | **이벤트성 작업의 영속 재개가 불완전합니다.** 큐 push 실패를 삼키거나 기존 continuation 상한에 도달하면 일일 작업에 포함되지 않은 제한·해제 작업은 재개되지 않을 수 있습니다. [runSweepJob.js:37](C:/CloudJira/moves-approval-jira/src/trigger/runSweepJob.js:37) | 영속 작업 의도와 커서, 중복 실행 조건, 재개 수단을 명시합니다. 기존 일일 스윕에서 KVS pending 표식을 보고 필요한 때만 보정하는 방식도 가능합니다. |
| **P1** | **기능 전환 시 기존 데이터와 예외가 빠집니다.** 활성화 전에 승인·인증된 기록, 기존 워크로그가 있는 이슈의 신규 연동, 반려·해제와 오래된 restrict 큐의 순서가 정의되지 않았습니다. 해제 시 인증 여부만 보면 여전히 LINKED인 기록의 제한을 풀 수도 있습니다. [설계:391](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:391) | 활성화·연동·해제 때 대상 전량을 대조하고, 각 작업 실행 시 최신 `shouldRestrict`를 다시 계산합니다. |
| **P1** | **감사 수집용 연동 판정을 통제에 그대로 재사용하기 어렵습니다.** 기존 `verifiedLinkSignals`는 의도적으로 만료를 보지 않습니다. 프로젝트 신호가 그 프로젝트의 모든 이슈를 실제 워크포스 연동 이슈로 의미하는지도 계약에 없습니다. [WorkforceLinkRepository.js:416](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceLinkRepository.js:416) | 통제용 연결 상태에는 연결 해제·만료·현재 프로젝트·이슈 범위가 필요합니다. 프로젝트 정책 존재와 이슈의 실제 연결을 구분해야 합니다. |
| **P1** | **Start date 실패 시 제한이 풀리고, 인증 실행 경로가 여전히 asUser입니다.** 두 문제 모두 화면상 안내만으로 해결되지 않습니다. [설계:426](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:426), [WorklogCertService.js:539](C:/CloudJira/moves-approval-jira/src/resolver/worklogCert/WorklogCertService.js:539) | 필드 미해결은 쓰기 거부로 처리하고, 인증 실행까지 동일한 안전한 수집 경로를 사용합니다. |
| **P2** | **5분 내 마지막 앱 행위자로 감사 행위자를 추정하면 잘못 귀속될 수 있습니다.** 다른 앱의 수정·삭제도 이전 사람의 행동으로 기록될 수 있습니다. [설계:338](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/01_architect_design.md:338) | 앱 계정·operation ID·작업 종류·대상 지문을 대조하고, 불확실하면 행위자 미상으로 남깁니다. |
| **P2** | **`movesApproval.ctl` 게시의 구현 계약이 부족합니다.** 현재 outbox·publisher는 사용자 문서 중심이고 모르는 문서 종류를 실패 처리하며 `putUserProperty`로 게시합니다. [WorkforcePublisher.js:391](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:391), [WorkforcePublisher.js:437](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:437) | 프로젝트·이슈 대상 키, 문서 종류, 게시 게이트웨이, 재게시·삭제·초기 동기화 범위를 추가로 정의해야 합니다. |

추가로 S5의 삭제 스냅샷은 **복원 가능한 백업으로 표현하지 않아야 하며**, S8의 상한은 원자적 확보, S4는 현재 승인·인증·설정·취소 상태까지 포함하도록 보완해야 합니다.

## 권고안

사용자 확정 요구를 다음처럼 나누어 비교하는 것이 정확합니다. [요구서:7](C:/CloudJira/moves-approval-jira/_workspace/worklog-control/00_input/requirement.md:7)

| 안 | 연동 이슈를 등록부터 우리 화면으로 통제 | 이슈 기간 밖 CRUD 금지 | 미연동 확정분 수정·삭제 금지 | 미연동 미확정분 자유 | 고객 권한 변경 |
|---|---|---|---|---|---|
| **현재 H: 연동 전부 + 미연동 확정분 visibility** | **부분** — 외부 생성, 제한 전 공백·실패·skip 존재 | **부분** — 우리 쓰기 경로만 사전 검사 | **부분** — 제한 성공 이후 직접 접근 차단 | 대체로 충족 | 스킴 회수는 불필요하나 앱 접근 조건 확인 필요 |
| **확정분만 visibility + FLAG** | 미충족 | 우리 화면에서만 충족 | 제한 성공 이후 충족 | 충족 | 스킴 회수 불필요 |
| **Edit/Delete own·all 회수 + 앱 대행** | 수정·삭제는 가능, 외부 생성은 남음 | 앱 경유 수정·삭제에는 적용 가능, 외부 생성은 남음 | 충족 가능 | **Jira 경로까지 자유여야 한다면 미충족** | 필요 |
| **visibility·권한 회수 없이 감지+인증 제외** | 미충족 | 사후 감지 수준 | 미충족 — 변경 후 무효화만 가능 | 충족 | 불필요 |

**권고는 H를 최종 목표로 유지하되, 활성화 순서를 바꾸는 것입니다.**

1. **먼저 최소 스파이크로 역할·제한·복구 가능성을 확인합니다.** 두 Forge 앱의 접근이 성립하지 않으면 대규모 H 구현 전에 방향을 바꿉니다.
2. **초기 운영 범위는 FLAG로 둡니다.** 잠금 수단과 외부 입력 감지를 분리하고, 승인 앱·워크포스 양쪽 정상 입력의 출처 증명부터 완성합니다.
3. **수정·삭제의 최종 판단을 한 권위 경로로 모읍니다.** 워크포스 탭이라는 UI 결정은 유지할 수 있습니다. 그러나 오래된 서명 문서만 읽는 두 번째 asApp 실행기를 두는 방식으로는 현재 승인 상태의 일치를 보장하기 어렵습니다.
4. **조회·인증 실행·집계·해제를 함께 준비한 뒤 visibility를 활성화합니다.** 원래 제한된 기록과 닫힌 이슈는 지원 제외인지, 다른 통제 수단을 요구할지 명확히 표시합니다.
5. **자동 DELETE는 별도 출시 관문으로 둡니다.** 출처 불명 기록을 FLAG로 남기는 것과 자동 삭제하는 것은 요구되는 증거 수준이 다릅니다.

더 작은 첫 출시가 필요하다면 **확정분만 visibility 제한**이 합리적입니다. 다만 이를 사용자 요구 §1 전체의 완료로 보고해서는 안 됩니다.

외부 생성 자체를 원천 차단하는 문제는 별도로 남습니다. `timeTrackingProvider`의 공식 보장은 기본 UI 교체이며, 현재 `jira:actionValidator`도 `workItemTypeChanged`만 지원합니다. 이 설계의 근거만으로 모든 worklog 생성 경로를 가로채는 hook을 전제할 수 없습니다. [Time tracking provider](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-time-tracking-provider/), [Action validator](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-action-validator/)

## 배포 전 필수 실측

여기서 “배포 전”은 **운영에서 해당 모드를 활성화하기 전**을 뜻합니다. 시험용 진단 코드를 development에 올려 실측하는 과정은 필요합니다.

시험 계정은 최소한 작성자 A, 다른 사용자 B, A의 팀장 L, 다른 팀장 L2, Edit/Delete all 보유 관리자 M을 준비합니다. **M이 제한 대상 역할·그룹의 멤버가 아닌 조건**을 별도로 확인하고, 승인 앱과 워크포스 앱의 실제 계정도 구분합니다.

| 관문 | V 번호 | 개발 사이트 절차와 통과 기준 |
|---|---|---|
| **제한 대상과 두 앱 접근** | **V1·V2·V11·V16** | A가 만든 시험 워크로그를 승인 앱 asApp으로 제한합니다. 양 앱 계정의 역할·권한을 확인하고 각 앱으로 GET·PUT·DELETE를 별도 시험합니다. 역할 존재나 scope만으로 통과시키지 않습니다. |
| **작성자·관리자 우회 차단** | **V3·V4** | A·B·M으로 GET, 시간 변경 PUT, visibility 제거·다른 그룹 변경 PUT, DELETE를 시도합니다. API 토큰 경로도 시험합니다. 응답 코드와 함께 실제 기록 불변을 확인합니다. bulk delete·move도 사용하는 범위에서 포함합니다. |
| **생성 직후 통제 가능성** | **V7·V23** | A의 asUser POST에 제한 visibility를 직접 넣어 생성 가능한지 확인합니다. 가능하면 작성자 보존과 앱 접근을 검증합니다. 불가능하면 POST→제한 PUT 사이에 병렬 PUT·DELETE를 넣어 공백을 측정하고 “등록 즉시” 보장에서 제외합니다. provider 선택 후 직접 REST 생성도 확인합니다. |
| **데이터 보존과 닫힌 이슈** | **V5·V10·V17·V18** | 복잡한 ADF·properties·started·seconds·추정치를 가진 기록에 visibility만 PUT하고 다시 해제합니다. 필드 보존, author 유지, updateAuthor, 알림 설정을 확인합니다. 동시에 다른 PUT을 실행해 값이 되돌아가지 않는지 확인하고 닫힌 이슈에서도 반복합니다. |
| **화면·검색·집계 일치** | **V8·V22** | 제한 전후 `timespent·aggregatetimespent·timeestimate`, JQL 결과, worklog 상세를 비교합니다. 승인 앱 탭·내 타임시트·팀장 인증 조회 및 실행·재인증, 워크포스 본인 탭·원가·현황의 ID와 합계를 대조합니다. |
| **해제·라이선스·제거 복구** | **V15** | 테스트용 INACTIVE 조건에서도 관리자가 status·release에 접근하는지 확인합니다. 제한 PUT 성공 직후 DB 기록 실패, 해제 중단·재개, 그룹 변경, 오래된 restrict 큐 도착을 주입합니다. 잔여 제한 0을 확인한 뒤 시험 설치를 제거합니다. `preUninstall` 실패·55초 초과도 별도 설치에서 시험합니다. |
| **기간 필드** | **V13 — 기간 옵션 활성화 시 필수** | 동명 datepicker 두 개, 한글 표시, 프로젝트별 context 차이, 호출자 권한 차이, 삭제된 필드, 빈 값, 역전 날짜를 시험합니다. 필드 미해결은 허용으로 바뀌지 않아야 하고, 양 앱에서 동일한 경계·timezone을 사용해야 합니다. |
| **정상 출처와 자동 삭제** | **V6·V14·V24 — DELETE 활성화 시 추가 필수** | 양 앱 정상 입력, 동일 값 두 건, 빠른 수정, 응답 유실, 이벤트 중복·역순·지연, 사전 승인 APPLYING/UNKNOWN을 시험합니다. 정상 기록 삭제 0건이 기준입니다. 유예 중 인증·오탐 해제·설정 OFF, 50건 경계의 병렬 실행, 삭제 응답 유실도 포함합니다. |
| **그룹·team-managed 지원** | **V9·V20 — 해당 선택지를 제공할 때 필수** | 실제 앱 계정의 그룹 등록과 복구 관리자 접근을 확인합니다. team-managed는 역할 조회 성공뿐 아니라 제한·조회·수정·삭제·해제 전 과정을 검증합니다. 미지원이면 활성화를 서버에서 거부합니다. |

**V 목록 밖에서 반드시 추가할 검증은 세 가지입니다.**

- **인가 회귀:** 다른 사람 ID·다른 이슈 ID 주입, Jira 이슈 열람 권한 회수, 팀장 변경, 다른 cloud의 서명 문서, 원래부터 제한된 워크로그를 시험합니다. 상세뿐 아니라 count·합계·관리자 목록에서도 누출이 없어야 합니다.
- **서명 상태의 최신성·완전성:** 승인 직후 게시를 실패시키고, 캐시에 이전 문서를 남기고, 과거 정상 서명 문서를 재게시하고, `wt=true` 및 1,001번째 인증 기록을 만듭니다. 어느 경우에도 확정분 수정 허가로 바뀌면 안 됩니다.
- **영속 재개와 비용:** 큐 push 실패, 중복 배달, 실행 중단, continuation 상한 초과 후에도 제한·해제가 재개되어야 합니다. 작업이 끝난 정상 유휴 상태에서는 추가 SQL 0을 확인하고, 이벤트가 있는 경우에는 실제 SQL·Jira 호출 수를 별도로 기록합니다.

V12의 `getAssignedPermissionScheme`에 필요한 classic scope는 공식 스펙에서 `read:jira-work`로 확인됩니다. 추가 scope를 먼저 넣을 이유는 없습니다. V14의 큐 지연 최대 15분도 문서로 확인되므로 600초 설정 자체는 허용 범위입니다. 다만 **지연 상한의 문서 확인과 실제 전달·재개 보장은 별개**입니다. [공식 OpenAPI](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.8516.130), [Async Events API](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/)