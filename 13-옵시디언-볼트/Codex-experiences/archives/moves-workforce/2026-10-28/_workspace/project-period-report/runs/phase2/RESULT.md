# Phase 2 구현 결과

2026-09-07. **구현 반영, 최종 검증 미완료**. Windows 프로세스 초기화 장애(0xc0000142 / -1073741502)로 루트 npm test를 실행하지 못했다. 따라서 전체 테스트 통과를 완료 조건으로 삼은 요청은 아직 완료되지 않았다. 커밋·배포·프론트·locales 변경은 하지 않았다.

## 변경 파일

Phase 1 후속:
- src/rdb/query/ProjectPeriodSnapshotQuery.js
- src/resolver/projectPeriodReport/ProjectPeriodSnapshotRepository.js
- src/resolver/projectPeriodReport/ProjectPeriodReportService.js
- src/resolver/projectPeriodReport/__test__/ProjectPeriodSnapshotRepository.test.js
- src/resolver/projectPeriodReport/__test__/ProjectPeriodReportService.test.js

Phase 2:
- src/rdb/query/PeriodReportQuery.js (신규)
- src/resolver/projectPeriodReport/PeriodReportRepository.js (신규)
- src/resolver/projectPeriodReport/PeriodReportService.js (신규)
- src/resolver/projectPeriodReport/PeriodIssueFetcher.js (신규)
- src/resolver/projectPeriodReport/PeriodReportCalculator.js (신규)
- src/resolver/projectPeriodReport/ProjectPeriodReportController.js
- src/permission/PermissionMap.js — getProjectPeriodReport: R('REPORT', 'detail') 한 줄 추가
- src/utils/leaveDeduction.js (신규, 기존 휴가 계산 이동)
- src/resolver/resourceAnalysis/ResourceAnalysisService.js — 휴가 계산을 공용 모듈로 이동하고 기존 export 유지
- src/resolver/projectPeriodReport/__test__/PeriodIssueFetcher.test.js (신규)
- src/resolver/projectPeriodReport/__test__/PeriodReportCalculator.test.js (신규)
- src/resolver/projectPeriodReport/__test__/PeriodReportUnknownAuthor.test.js (신규)
- src/resolver/projectPeriodReport/__test__/PeriodReportService.test.js (신규)
- src/resolver/projectPeriodReport/__test__/PeriodReportRepository.test.js (신규)
- src/resolver/projectPeriodReport/__test__/ProjectPeriodReportController.test.js

src/index.js는 Phase 1에 컨트롤러가 이미 등록돼 있어 이번 실행에서 변경하지 않았다. 기존 다른 세션의 resourceManagement/personAnalysis, 프론트, locales, AGENTS.md, README.md, ErrorCodes.js 변경을 수정하지 않았다. 보호 파일의 최종 바이트 비교는 프로세스 장애 때문에 미검증이다.

## Phase 1 최적화

실행 범위 Map에 (periodType, periodKey)별 captured project ID Set을 보관한다. 각 조합은 SELECT 한 번으로 읽고 누락 프로젝트만 INSERT한다. UUID 대소문자를 정규화하며 duplicate-key 경합은 기존 ALREADY_CAPTURED no-op로 처리하고 Set에도 반영한다. 테이블 부재 skip, 오류 시 purge 미실행, 기존 purge 순서와 반환 계약은 유지했다.

## 설계서와 다르게 한 결정과 이유

1. 실제 fetchAllProjectIssues는 IssueApi.js가 아니라 ProjectIssuesFetcher.js에 분리돼 있다. 이를 읽고 같은 100건 + nextPageToken 순회를 기간 전용 페처에 구현했다. getBulkIssuesByProject 및 기존 페처는 변경·사용하지 않는다.
2. JQL 날짜는 Jira viewer 시간대의 영향을 받는다. KST 경계 누락을 막기 위해 워크로그 검색 후보를 시작 -1일/종료 +1일로 넓히고, 받은 워크로그는 KST 실제 기간으로 재필터한다. 이슈 후보 created 범위도 넓혀 가져오고 계산에서 실제 KST 날짜를 적용한다.
3. projectusers에는 개인별 배정 시작·종료일과 과거 멤버십 이력이 없다. 기존 프로젝트 배정 조회와 동일하게 현재 명단과 project.start_date/end_date를 사용한다. calculator 자체는 멤버별 기간 교집합을 지원하며, 서비스는 프로젝트 기간을 주입한다. meta.membersApprox:true로 근사를 명시한다.
4. computeLeaveDeductionMap은 Forge 의존 서비스 안에 있었으므로 src/utils/leaveDeduction.js로 이동했다. ResourceAnalysisService의 기존 export를 유지하고 양쪽이 동일 함수와 날짜 검증을 import한다. 영업일 계산은 utils/workday, 이슈 상태 분류는 ProgressCalculator를 import한다.
5. 현재/미래 기간은 계산 종료일을 KST 오늘까지 제한한다. period.endDate는 요청한 기간의 실제 종료일을 유지하고 meta.effectiveEndDate에 적용 종료일을 제공한다. 미래 기간의 기대 근무일·활동은 0이다.
6. 비용의 기간 산식은 설계서에 지정되지 않았다. 기존 비용 분석의 유효급여(INDIVIDUAL/LEVEL_BAND)와 영업일 기반 시간 안분을 재사용한다. totalInPeriod = round(전체 유효 투입급여 × 기간과 프로젝트가 겹치는 영업일 / 프로젝트 전체 영업일). 유급휴가는 비용에서 차감하지 않는다. 프로젝트 기간이 없거나 역전되면 totalInPeriod:null로 계산 불가를 표시한다. 비용은 지출 원장 실적이 아닌 현재 급여 정책에 따른 안분 추정값이다.
7. 비용은 캐시에 저장하지 않는다. 캐시 hit에도 canReadCost(principal)를 적용하고 허용된 경우에만 현재 정책·급여로 계산한다. 권한 회수, INDIVIDUAL↔LEVEL_BAND 전환의 오래된 비용 노출을 막는다. 일반 명단 SQL은 급여 컬럼을 읽지 않는다.
8. 캐시는 viewer accountId를 포함하고 열린 기간 10분/닫힌 기간 60분 TTL을 쓴다. 캐시 장애나 128 KiB 초과 시 계산된 응답은 그대로 반환하고 저장만 생략한다. 워크로그 원문·개별 급여·스케줄 원문은 저장하지 않으며 비용을 제외한 파생 리포트 응답만 TTL 캐시한다. 영구 기간 스냅샷 저장 계약은 그대로다.
9. 불완전 페이지·반복 cursor·워크로그 중복/누락 의심은 PERIOD_REPORT_INCOMPLETE로 실패시킨다. 부분 합계를 정상값으로 저장하지 않는다. 성공 응답의 meta.truncated는 현재 false다.
10. MD는 초 합산 후 환산하며 반올림하지 않아 작은 기록을 미기록으로 오판하지 않는다. share는 초 비율을 사용하고 마지막 항목의 부동소수점 잔여분만 보정한다. 작성자 정보가 없는 워크로그는 accountId:null로 공수를 보존한다.

## 최종 응답 계약

invoke('getProjectPeriodReport', { projectId, periodType: 'W' | 'M', periodKey })

- projectId: UUID 필수.
- W는 유효한 ISO 주 YYYY-Www, M은 YYYY-MM. 예: 2026-W36, 2026-09.
- 한 기간만 반환한다. 직전 기간은 프론트가 periodKey를 바꿔 별도 호출한다.
- REPORT 읽기 권한과 프로젝트 범위는 guardedDefine과 서비스에서 확인한다. principal/accountId 누락은 거부한다.
- 기존 컨트롤러의 CONTROLLER_REGISTRARS 등록을 그대로 사용한다.

```ts
{
  success: true,
  period: {
    type: 'W' | 'M',
    key: string,
    startDate: string, // KST YYYY-MM-DD
    endDate: string    // 요청 기간의 종료일, inclusive
  },
  effort: {
    totalMd: number,
    byMember: [{
      accountId: string | null,
      displayName: string, // 작성자 미상 시 '알 수 없는 사용자'
      md: number
    }],
    byIssue: [{
      issueKey: string,
      summary: string,
      md: number,
      share: number       // 0~1, 공수 양수인 이슈들
    }]
  },
  issues: {
    done: { count: number, keys: string[] },
    created: { count: number, keys: string[] },
    overdue: [{
      issueKey: string,
      summary: string,
      dueDate: string,
      assignee: { accountId: string, displayName: string } | null
    }],
    openTotal: number,
    approx: true
  },
  members: {
    active: [{
      accountId: string,
      displayName: string,
      expectedWorkdays: number,
      loggedDays: number,
      md: number
    }],
    unlogged: [{
      accountId: string,
      displayName: string,
      expectedWorkdays: number
    }]
  },
  // canReadCost(principal)가 true일 때만 키가 존재
  cost?: { totalInPeriod: number | null, currency: string },
  meta: {
    computedAt: string,       // 비비용 리포트 최초 계산 ISO 시각, 캐시 hit에서 유지
    cached: boolean,
    truncated: boolean,
    effectiveEndDate: string, // min(요청 종료일, KST 오늘)
    membersApprox: true
  }
}
```

- done: 현재 statusCategory done이면서 resolutiondate가 실제 계산 기간에 속하는 이슈.
- created: created의 KST 날짜가 실제 계산 기간에 속하는 이슈.
- openTotal/overdue: 계산 종료일까지 생성된 이슈의 현재 미완료 상태를 사용한다. overdue는 duedate <= 계산 종료일이다. 과거 상태 복원이 아니므로 issues.approx:true다.
- active: 요청 기간과 프로젝트 배정 기간이 겹치는 현재 명단. 기대 근무일 계산만 오늘까지 제한한다.
- loggedDays: 기간 내 양수 워크로그가 기록된 서로 다른 KST 날짜 수. 주말에 실제 기록했다면 포함한다.
- unlogged: expectedWorkdays > 0 && md === 0. 전일 휴가 등 기대 근무일 0은 제외한다.
- effort에는 현재 명단에서 빠진 작성자의 해당 기간 기록도 포함될 수 있다.
- 개인 급여·연봉·급여 원천 필드는 어떤 응답에도 포함하지 않는다.
- 실패는 기존 wrapper 계약: { success:false, error:{name,code,message,cause} }. 신규 입력/조회 오류 코드는 기존 다른 세션 ErrorCodes.js를 수정하지 않고 로컬 문자열로 전달했다.

## 테스트 결과

통과:
- Phase 1 후속 관련 3 suites / 33 tests, npm.cmd test -- --runInBand, exit 0 (담당 에이전트 실행).
- PeriodIssueFetcher.test.js 12 tests, npm.cmd test -- --runInBand, exit 0 (담당 에이전트 실행).
- Phase 1 후속 시점 git diff --check, exit 0.

미검증:
- 최종 루트 npm.cmd test -- --runInBand: 실행 프로세스 생성 전 실패. helper exit -1073741502(0xc0000142).
- 신규 순수 계산·작성자 누락 테스트, 서비스·repository·컨트롤러 회귀 테스트 및 전체 PermissionMap 계약의 최종 실행.
- 기존 ResourceAnalysisDenominator.test.js를 포함한 순수 함수 이동 회귀.
- 최종 git diff --check와 baseline 해시 비교.
- Forge lint: 동일 프로세스 장애로 명령을 실행할 수 없음.
- 실제 Jira/Forge SQL/KVS 호출, migration/설치 환경의 동작.

PowerShell 실행 정책 때문에 처음 npm.ps1 호출이 거부된 개별 테스트는 npm.cmd로 재실행했다. 이후 장애는 별개로 PowerShell·cmd·Node 및 파일 읽기 helper 전부의 프로세스 초기화가 실패했다. 승인 검토 거부가 아니라 실행 환경 오류다. 읽기/수정형 patch도 막혀, 이미 전문을 확보한 이번 작업 소유 파일은 Add File 방식으로 재작성했다. 쓰기 도구는 성공했으나 최종 재읽기는 미검증이다.

기존 테스트 수정 이유:
- ProjectPeriodSnapshotRepository.test.js: 프로젝트별 EXISTS 제거로 INSERT 호출 수·mock 응답이 달라졌다. duplicate-key 검증은 유지했다.
- ProjectPeriodReportService.test.js (Phase 1): 중복 판정이 repository의 EXISTS에서 실행 범위 Set으로 이동해 조합별 조회·누락 INSERT·경합·종료 유예 테스트를 추가했다.
- ProjectPeriodReportController.test.js: 등록 함수가 두 개가 되어 기존의 마지막 handler 선택을 resolver 이름별 선택으로 바꾸고 Phase 2 mock과 principal 전달/권한 거부 테스트를 추가했다. Phase 1 단언은 유지했다.
- 기존 다른 도메인 테스트는 수정하지 않았다.

## 남은 우려와 재개 작업

1. **전체 루트 테스트 통과가 확인되기 전에는 완료로 간주하지 않는다.** Windows 실행 환경 복구 후 npm.cmd test -- --runInBand, pwd 다음 forge lint, 최종 diff/보호 파일 비교를 실행해야 한다.
2. 검토에서 찾은 deletion_status 오타는 실제 deletion_state로 수정했다. null accountId 정렬은 문자열 비교로 보완하고 회귀 테스트를 추가했다. 두 수정 모두 최종 실행 검증이 남았다.
3. 프로젝트 규모가 크면 모든 이슈/워크로그 페이지를 읽는 작업이 Forge invoke 시간·메모리 제한에 걸릴 수 있다. 조용한 절단 대신 오류가 난다. 실제 대형 프로젝트 성능은 미검증이다.
4. 현재 명단/현재 이슈 상태/현재 급여를 사용하므로 과거 조직·배정·상태·금액을 완전히 재현하지 않는다.
5. viewer별 캐시라도 같은 viewer의 Jira 이슈 가시성이 TTL 중 바뀌면 기존 파생 결과가 TTL까지 남을 수 있다. 앱 REPORT/프로젝트 권한과 비용 권한은 요청마다 재확인한다.
6. Phase 1 조합별 SELECT는 PK 선두가 project_id여서 보조 인덱스 없이 스캔한다. 설계의 보조 인덱스 없음 결정을 유지했다.
7. 프론트/번역은 요청 범위 밖이다. frontend build의 prebuild가 보호된 locales를 생성하므로 실행하지 않았다.
8. 경험 Vault는 작업 공간 밖이며 실행 환경이 차단돼 이번 경험 노트와 INDEX 연결은 기록하지 못했다. 관련 결정·교훈은 이 보고서에 보존했다.
