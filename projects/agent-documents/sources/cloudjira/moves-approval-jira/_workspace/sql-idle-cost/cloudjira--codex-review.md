유휴 스윕이 반복 비용을 만든다는 진단은 맞습니다. 다만 **17~19회는 readiness 캐시가 채워진 경우의 수치이고, 캐시가 완전히 비어 있으면 5분당 34~38회**입니다. “스케줄 호출은 항상 콜드 스타트”라는 가정도 성립하지 않습니다.

세 운영안 중에는 **(c) 시간당 통합 스윕**을 우선 권합니다. 기존 결정 직후 자동 적용과 이벤트 처리는 유지하고, 보정·게시의 지연을 약 한 시간까지 허용하는 절충안입니다. 현재의 수분 내 반영이 필수라면 **(a)**를 선택해야 합니다. **(b) 앱 실행 시 처리 + 하루 1회**를 모든 작업에 일괄 적용하는 것은 권하지 않습니다.

코드는 변경하지 않았습니다. 아래 수치는 소스 추적과 실제 모듈에 SQL 응답을 주입한 메모리 내 모의 실행 결과이며, 운영 환경의 실행 시간·청구액 실측은 아닙니다.

## 쿼리 수 실측(코드 기준)

**계산 조건**

스키마가 모두 준비되어 있고, 리스 획득에 성공하며, 기존 스캔 커서는 존재하지만 처리할 전환·변경 요청·게시물·만료 이어받기 작업은 없는 정상 유휴 상태입니다. 최초 초기화, 리스 경합, 오류, 적체 처리는 별도입니다.

`runFiveMinuteSweep`이 세 작업을 병렬 호출한다는 설명은 맞습니다. [runFiveMinuteSweep.js:9](C:/CloudJira/moves-approval-jira/src/trigger/runFiveMinuteSweep.js:9)

| 작업 | 캐시가 채워진 경우 | 캐시가 완전히 빈 경우 | 계산과 근거 |
|---|---:|---:|---|
| 전환 자동 적용 | **5회** | **19~20회** | 리스 `INSERT + UPDATE + SELECT` 3회, 후보 조회 1회, 해제 1회. 콜드 상태에서는 테이블 2개와 **컬럼 12개** 확인이 추가되고, `approval_job_state` 확인이 0~1회 추가됨. [runTransitionApplySweep.js:9](C:/CloudJira/moves-approval-jira/src/trigger/runTransitionApplySweep.js:9), [TransitionRepository.js:73](C:/CloudJira/moves-approval-jira/src/resolver/transition/TransitionRepository.js:73), [JobLease.js:39](C:/CloudJira/moves-approval-jira/src/resolver/worklogHistory/JobLease.js:39) |
| Workforce 게시 차단 상태 | **10회** | **13~14회** | 리스 3회, marker 조회 1회, 스캔 상태 조회 1회, 열린/닫힌 요청 조회 2회, 커서 저장 2회, 해제 1회. 테이블 3개와 잡 테이블 확인이 추가될 수 있음. [WorkforcePublisher.js:325](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:325), [WorkforceLinkRepository.js:74](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceLinkRepository.js:74) |
| Workforce 게시 가능 상태 | **12회** | **15~16회** | 위 비용에 `touchKidMismatch` UPDATE와 `listDue` SELECT가 각각 추가됨. 대상 행이 없어도 실행함. [WorkforcePublisher.js:246](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:246) |
| 만료 작업 이어받기 | **2회** | **2회** | 테이블 목록 일괄 조회 1회, 잔여 커서 조회 1회. 일괄 조회가 성공하면 바로 뒤 `tableReady`는 캐시를 사용함. [ExpiryService.js:390](C:/CloudJira/moves-approval-jira/src/resolver/approval/ExpiryService.js:390) |
| **합계: 게시 차단** | **17회** | **34~36회** | 정책 OFF, 키 미설정 등으로 `drain`이 차단되는 경우 |
| **합계: 게시 가능** | **19회** | **36~38회** | 게시 준비가 되었으나 대상이 없는 경우 |

콜드 합계가 범위인 이유는 **병렬 작업 간 캐시 공유와 완료 순서**입니다.

- 전환의 테이블 2개, Workforce의 테이블 3개 조회는 `ExpiryService`의 일괄 조회와 함께 시작합니다.
- 일괄 조회가 먼저 완료되면 후속 `approval_job_state` 프로브를 생략합니다.
- 늦게 완료되면 두 작업에서 추가 조회가 나갈 수 있습니다.
- `primeTableReadiness`는 **테이블 캐시만** 채웁니다. 전환의 컬럼 12개 조회는 없애지 못합니다.
- 진행 중인 동일 프로브를 합치는 Promise 캐시는 없습니다.

근거: [TableReadiness.js:42](C:/CloudJira/moves-approval-jira/src/rdb/schema/TableReadiness.js:42), [TableReadiness.js:70](C:/CloudJira/moves-approval-jira/src/rdb/schema/TableReadiness.js:70), [TableReadiness.js:116](C:/CloudJira/moves-approval-jira/src/rdb/schema/TableReadiness.js:116).

모의 실행에서도 일괄 조회의 완료 순서를 바꾸어 **34/36회와 36/38회**, 같은 모듈의 다음 실행에서 **17/19회**를 확인했습니다.

**Workforce에서 특히 빠진 계산**

`changeScan`은 빈 상태여도 다음 **5회**를 실행합니다.

1. `wf-change-scan` 상태 SELECT.
2. 열린 요청 SELECT.
3. 닫힌 요청 SELECT.
4. 커서 행 `INSERT IGNORE`.
5. 커서 UPDATE.

커서가 바뀌지 않아도 마지막 두 문장은 실행됩니다. 리스 획득 때 읽는 `wf-publish` 상태와 스캔 커서는 서로 다른 조회입니다. [WorkforcePublisher.js:161](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:161), [WorkforceLinkRepository.js:310](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceLinkRepository.js:310), [WorkforceLinkRepository.js:351](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceLinkRepository.js:351)

**일·월 환산**

5분마다 하루 288회, 한 달을 30일로 계산하면 다음과 같습니다.

| 상태 | 5분당 | 하루 | 30일 |
|---|---:|---:|---:|
| 캐시가 채워진 실행 | 17~19 | 4,896~5,472 | 146,880~164,160 |
| 캐시가 완전히 빈 실행 | 34~38 | 9,792~10,944 | 293,760~328,320 |

따라서 “하루 약 5천, 월 약 15만”은 **warm 상태의 근사치로는 맞지만, 콜드 스타트를 전제로 한 수치로는 과소 추정**입니다. 실제 월간 값은 캐시 재사용률과 데이터·오류 상태에 따라 달라집니다.

**시간당 스윕도 조건별로 구분해야 합니다.**

| 작업 | 정상적인 빈 상태의 비용 |
|---|---|
| 타임시트 보정 | 자동 마감 OFF, 제출·마감 행 없음 기준 **SQL 13회, Jira 0회**. 일괄 프로브 1 + 존재 조회 2 + 삭제/수정 잡 각각 리스·해제 4 + 고아 정리 DELETE 2. |
| 이력 보정 | 기본 이력 ON, 변경 목록이 빈 경우 **SQL 11회, Jira 2회**. 일괄 프로브 1 + 기능 인덱스·인증 추적 여부 조회 2 + 삭제/수정 잡 각각 리스·해제 4. |
| 이력 기능이 모두 OFF | 전역·하위 정책 이력 OFF, 인증 추적 행 없음 기준 **SQL 3회, Jira 0회, 리스 쓰기 0회**. 이미 조기 반환이 있으나 SQL 진입 전 반환은 아님. |

근거: [TimesheetDriftService.js:491](C:/CloudJira/moves-approval-jira/src/resolver/timesheet/TimesheetDriftService.js:491), [TimesheetDriftService.js:417](C:/CloudJira/moves-approval-jira/src/resolver/timesheet/TimesheetDriftService.js:417), [TimesheetRepository.js:410](C:/CloudJira/moves-approval-jira/src/resolver/timesheet/TimesheetRepository.js:410), [WorklogHistoryRecorder.js:430](C:/CloudJira/moves-approval-jira/src/resolver/worklogHistory/WorklogHistoryRecorder.js:430).

**콜드 스타트 가정: 틀림**

Forge는 warm 실행 환경을 재사용합니다. 공식 문서는 모듈 전역 변수가 다음 호출에도 남을 수 있고, 다른 tenant의 호출에 재사용될 가능성까지 명시합니다. 따라서 “항상 비어 있다”도, “다음 호출에서도 캐시가 남는다”도 보장할 수 없습니다. [Forge tenant isolation](https://developer.atlassian.com/platform/forge/tenant-data-isolation/)

현재 코드에서는 다음을 구분해야 합니다.

- `isTableReady`·`isColumnReady`: 캐시 hit이면 조회를 생략합니다.
- `primeTableReadiness`: **캐시가 이미 채워져도 호출마다 조회합니다.**
- readiness 캐시를 장기 활용하려면 설치·환경별 구분이 필요합니다. 테이블명만 저장하는 전역 Set을 설치별 스키마 준비 상태의 영구 근거로 삼으면 안 됩니다.

**`information_schema`가 더 비싼가: 모름**

이 앱에서 일반 SELECT보다 쿼리당 실행 비용이 크다는 측정 근거는 없습니다. 확실한 것은 **별도 SQL 요청을 반복 발행한다는 사실**입니다. 비용 개선의 근거는 우선 호출 횟수이며, 메타데이터 조회 자체가 특별히 비싸다는 설명은 검증되지 않았습니다.

또한 Forge SQL 비용은 요청 수만으로 정해지지 않습니다. **Compute requests, Compute duration, Data stored**가 별도 항목이고, SQL duration은 쿼리 실행 시간 합계입니다. 함수 실행 시간과 로그도 별도입니다. [SQL 사용량 정의](https://developer.atlassian.com/platform/forge/monitor-usage-metrics/), [공식 요금표](https://developer.atlassian.com/platform/forge/forge-platform-pricing/)

현재 요청 요금만 보면 월 15만 회는 무료 10만 회를 차감한 뒤 약 **$0.10**입니다. 따라서 “컴퓨트가 매우 높다”는 보고를 설명하려면 **SQL duration인지 Functions duration인지**부터 확인해야 합니다. 환경별 사용량은 원칙적으로 합산되며, 일부 고객 sandbox에는 과금 예외가 있습니다. [공식 과금 기준](https://developer.atlassian.com/platform/forge/forge-platform-pricing/)

## 빠진 비용원

**1. 정책 조회와 cloudId 학습은 SQL이 아니라 KVS입니다.**

`getPolicy()`는 현재 **34개 정책 키를 각각 읽습니다.** Workforce는 게시 가능 여부를 판단하기 전에 이것을 실행합니다. 정책이 꺼져 있어도 스캔까지 진행합니다.

`cloudIds.learn`도 KVS GET과 필요할 때 SET을 사용합니다. 같은 프로세스에서 값이 캐시되어 있으면 생략하지만, SQL 비용에는 포함하지 않아야 합니다. [SettingsRepository.js:202](C:/CloudJira/moves-approval-jira/src/resolver/settings/SettingsRepository.js:202), [WorkforceCloudId.js:23](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceCloudId.js:23)

**2. 사용자가 없어도 초기화·적체·재게시 비용은 생깁니다.**

Workforce 첫 스캔은 현재·이전 연도 marker를 만듭니다. 다음 회차에는 사용자 집합 조회와 marker 완료 쓰기가 발생합니다. 데이터가 있으면 열린/닫힌 요청을 각각 여러 페이지 읽고, outbox를 갱신합니다. 서명 키 변경도 재게시를 유발합니다. [WorkforcePublisher.js:133](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:133), [WorkforcePublisher.js:164](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:164)

**3. 정상 유휴 tick마다 SQL 로그 INSERT를 하지는 않습니다.**

Workforce의 일반 실행 요약은 `console.log`입니다. SQL의 `recordLog`는 게시 실패, 원격 게시물 불일치 등에서 발생합니다. 실패가 반복되면 결정적 ID를 사용하더라도 SQL 쓰기 비용은 반복됩니다. [WorkforcePublisher.js:120](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:120), [WorkforcePublisher.js:228](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:228), [WorkforcePublisher.js:361](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:361)

**4. 일일 스윕이 별도로 있습니다.**

`runSweep`은 마이그레이션, 만료·임박·독촉·정리, Workforce 게시물 대조를 실행합니다. 현재 설치된 SQL SDK의 migration runner는 변경 사항이 없어도 `CREATE TABLE IF NOT EXISTS __migrations`와 이력 SELECT를 실행합니다. 이는 `CommonQuery.executeQuery` 바깥의 호출입니다. [runSweep.js:12](C:/CloudJira/moves-approval-jira/src/trigger/runSweep.js:12), [migration.js:16](C:/CloudJira/moves-approval-jira/node_modules/@forge/sql/out/migration.js:16)

**5. “Moves Approval을 아무도 사용하지 않음”과 “Jira 이벤트가 없음”은 다릅니다.**

- `onWorklogChanged`: 제출·마감이 없어도 그 사실을 확인하는 SQL이 나갑니다. 이력이 기본 ON이므로 워크로그 조회, 미러 조회, 정책 판정, 이력 저장도 발생할 수 있습니다. 앱 화면을 열 필요가 없습니다. [TimesheetDriftService.js:343](C:/CloudJira/moves-approval-jira/src/resolver/timesheet/TimesheetDriftService.js:343), [WorklogHistoryRecorder.js:98](C:/CloudJira/moves-approval-jira/src/resolver/worklogHistory/WorklogHistoryRecorder.js:98)
- `WorklogHistoryRecorder`: 프로젝트 범위 판정 전에 인증 컨텍스트·미러 등을 읽습니다. 범위 밖 이벤트도 항상 SQL 0은 아닙니다. [WorklogHistoryRecorder.js:164](C:/CloudJira/moves-approval-jira/src/resolver/worklogHistory/WorklogHistoryRecorder.js:164)
- `onIssueChanged`: 상태 변경도, 지원 대상 필드 변경도 아닌 업데이트는 SQL 없이 종료할 수 있습니다. 그러나 상태 변경은 승인 요청이 없어도 readiness와 후보 조회를 하고, 담당자·우선순위·마감일·지원 custom field 변경은 규칙 조회를 합니다. [TransitionChangeService.js:139](C:/CloudJira/moves-approval-jira/src/resolver/transition/TransitionChangeService.js:139), [FieldChangeEventService.js:99](C:/CloudJira/moves-approval-jira/src/resolver/fieldChange/FieldChangeEventService.js:99)
- 이슈의 `issueContext`·`issuePanel`도 앱 진입점입니다. 앱의 전용 업무함 방문 수만으로 resolver 사용량을 추정하면 안 됩니다. [manifest.yml:65](file:///C:/CloudJira/moves-approval-jira/manifest.yml%3A65)

**6. 라이선스 캐시는 SQL 비용원이 아닙니다.**

production에서 필요한 경우 KVS 캐시와 License API를 사용합니다. 정상 판정 TTL은 1시간, 판정 불가 TTL은 1분입니다. development/staging은 명시적 라이선스 정보가 없으면 API 조회를 생략합니다. 정상적인 빈 5분 스윕이 매번 라이선스 SQL을 추가하는 구조는 아닙니다. [LicenseGuard.js:8](C:/CloudJira/moves-approval-jira/src/utils/license/LicenseGuard.js:8), [LicenseGuard.js:112](C:/CloudJira/moves-approval-jira/src/utils/license/LicenseGuard.js:112)

## 수정안 판정

**1. KVS “할 일 있음” 플래그 — 부분**

유휴 SQL을 0으로 만드는 입구로 사용할 수 있습니다. 다만 **단순 boolean을 켰다 끄는 구현은 안전하지 않습니다.**

- **일관성:** `kvs.get`은 strictly consistent이고 `kvs.query`는 eventually consistent입니다. 완료된 SET을 직접 GET으로 읽는 문제와, 동시 쓰기가 덮어쓰는 문제를 구분해야 합니다. 기본 SET은 last-write-wins입니다. [KVS 일관성·충돌 처리](https://developer.atlassian.com/platform/forge/storage-reference/kvs/)
- **신호 유실:** worker가 빈 큐를 확인한 뒤 producer가 `true`를 쓰고, worker가 뒤늦게 `false`를 쓰면 작업이 있는데 플래그가 꺼집니다.
- **이중 쓰기:** SQL 성공 후 KVS 실패·함수 종료가 발생할 수 있습니다. KVS 쓰기를 먼저 해도 worker와의 실행 순서 문제가 남습니다. 플래그를 유일한 원장으로 삼으면 안 됩니다.
- **초기 도입:** 키가 없다는 이유로 바로 OFF로 보면 기존 대기 작업을 놓칩니다. 초기 스캔과 복구 경로가 필요합니다.
- **미래 작업:** backoff 중인 게시물, 실행 중인 전환, 아직 settle 구간 안에 있는 변경은 “지금 대상 없음”이어도 작업이 끝난 것이 아닙니다.
- **복구 지연:** 시간당 안전망이면 유실 시 지연이 시간 단위이고, 일일 안전망이면 하루 단위입니다. 안전망도 미완주하면 더 길어집니다.

**현재 빠지기 쉬운 producer는 이미 확인됩니다.** Workforce 엔진의 단건 결정·반려·회수·만료는 `touch` 없이 변경 스캔으로 찾아내도록 구현돼 있습니다. outbox `touch`만 계측해서는 이 경로를 놓칩니다. [WorkforcePublisher.js:157](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:157)

추가로 제출·drift·자동/수동 마감·재개방·정책 변경·관리자 재게시·일일 대조·키 교체·전환 결정 직후 중단·만료 배치 잔여 커서를 고려해야 합니다. outbox 자체도 실패를 삼키고 변경 스캔으로 복구합니다. [WorkforceOutbox.js:5](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceOutbox.js:5), [WorkforceLinkService.js:92](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceLinkService.js:92)

KVS는 설치·사이트·환경별로 분리됩니다. 같은 key를 써도 다른 설치와 공유되지 않으므로, 각 설치에서 플래그를 초기화·복구해야 합니다. [KVS partitioning](https://developer.atlassian.com/platform/forge/storage-reference/kvs/)

**대안 판단:** `approval_job_state`의 기존 `next_run_at`은 리스·재실행 시각이지, 새 전환이나 게시 작업의 존재를 뜻하지 않습니다. 그 테이블을 SELECT 한 번 읽는 것만으로 모든 작업을 안전하게 생략할 수는 없습니다. 실제 후보·outbox·잔여 커서를 확인하는 SQL 한 문장이나 별도 작업 신호 설계가 필요합니다. **간격을 시간당으로 바꾸는 쪽이 변경 범위는 더 작습니다.**

**2. KVS 스키마 버전으로 readiness 대체 — 부분**

가능하지만 **테이블 프로브를 단순 삭제하는 수정으로는 부족**합니다.

- 필요한 테이블뿐 아니라 **컬럼까지 준비되었음**을 해당 버전이 보증해야 합니다.
- 모든 필요한 마이그레이션이 성공한 뒤 marker를 기록해야 합니다.
- `onInstall`뿐 아니라 일일 마이그레이션과 resolver의 마이그레이션 경로에서도 기록해야 합니다.
- 기존 설치에 marker가 없거나, SQL 성공 후 KVS 기록이 실패했을 때 재검증·복구해야 합니다.
- 동시 실행되는 구버전 코드가 새 버전 marker를 낮추지 않도록 설계해야 합니다.
- marker 불명·부족 시 신규 테이블에 무조건 접근하면 기존 배포 시차 방어가 깨집니다.

현재 `ensureMigratedOnce`는 실패를 boolean으로 흡수하고 재시도하도록 되어 있습니다. 함수가 반환했다는 이유만으로 “완료” marker를 기록해서도 안 됩니다. [migrate.js:118](C:/CloudJira/moves-approval-jira/src/rdb/schema/migrate.js:118)

CAS의 `rev = rev + 1`과 직접 충돌하지는 않습니다. 다만 현행 “신규 테이블 접근 전 readiness 확인”을 **동등한 준비 상태 보증으로 대체**해야 합니다.

작은 변경부터 한다면 **컬럼 12개 확인을 한 번의 조회로 묶고, 테이블 일괄 준비를 병렬 작업 시작 전에 한 번 수행하는 것**이 먼저입니다.

**3. 리스 획득을 조건부 UPDATE 1회로 — 부분**

**소유권 획득만** UPDATE 1회로 줄이는 것은 타당합니다. 그러나 모든 작업에서 커서 SELECT까지 없앨 수는 없습니다.

- Workforce의 `wf-publish` 리스 반환값은 호출자가 사실상 성공 여부만 사용합니다. 이 SELECT는 제거 여지가 있습니다.
- 전환 스윕은 저장된 cursor를 사용합니다.
- 타임시트·이력 보정은 cursor와 watermark가 필요합니다.

일반적인 Forge SQL UPDATE 응답은 영향 행 수 등의 메타데이터이며, 갱신 행의 cursor/watermark를 반환하지 않습니다. TiDB의 문서화된 UPDATE 문법에도 `RETURNING`이 없습니다. 따라서 **“UPDATE 결과에서 커서를 읽는다”는 부분은 틀립니다.** [Forge SQL 결과 형식](https://developer.atlassian.com/platform/forge/storage-reference/sql-api/), [TiDB UPDATE 문법](https://docs.pingcap.com/tidb/stable/sql-statement-update/)

지켜야 할 조건은 다음입니다.

- 기존 설치를 포함해 잡 행을 먼저 생성합니다. 현재 `onInstall`은 마이그레이션만 실행하며 잡 행을 선생성하지 않습니다.
- `WHERE next_run_at <= now`와 `rowsAffected === 1` 판정을 유지합니다.
- SET의 **`rev = rev + 1`을 유지**합니다.
- 미완주 때 watermark를 전진시키지 않습니다.
- 행 유실·신규 잡 추가 시 복구 경로를 둡니다.

리스 해제도 주의해야 합니다. 현재 `JobLease.release`는 `job_key`만으로 UPDATE하며 소유자 token을 확인하지 않습니다. 실행 시간을 늘려 리스 만료 후에도 이전 worker가 살아 있을 수 있게 만들면, 새 worker의 상태를 덮을 수 있습니다. 통합 스윕의 시간 예산을 늘릴 때는 리스 기간과 소유권 확인을 함께 검토해야 합니다. [JobLease.js:62](C:/CloudJira/moves-approval-jira/src/resolver/worklogHistory/JobLease.js:62)

**4. 기능 OFF·Workforce 미연결이면 시간당 스윕 즉시 반환 — 부분**

**전체에 일괄 적용하면 틀립니다.**

이력 보정은 이미 다음 세 가지를 확인합니다.

- 전역 이력 설정.
- 프로젝트·이슈 등 하위 범위의 이력 활성화 인덱스.
- 기존 인증 워크로그 추적 여부.

셋 모두 필요 없을 때만 `FEATURE_OFF`로 반환합니다. 전역 `historyEnabled=false`만 확인하면 프로젝트별 이력과 `CHANGED_AFTER_VERIFICATION` 감지를 누락합니다. [WorklogHistoryRecorder.js:430](C:/CloudJira/moves-approval-jira/src/resolver/worklogHistory/WorklogHistoryRecorder.js:430), [WorklogHistoryRecorder.js:209](C:/CloudJira/moves-approval-jira/src/resolver/worklogHistory/WorklogHistoryRecorder.js:209)

타임시트 승인·기간 잠금·drift 감지는 **Workforce 없이도 동작하는 기능**입니다. Workforce 미연결을 이유로 타임시트 스윕을 끄면 안 됩니다.

반면 **Workforce publisher 자체**는 명시적인 정책 OFF를 readiness·리스보다 먼저 확인할 가치가 있습니다. 다만 현재 코드는 OFF여도 큐와 변경 스캔을 유지하므로, 이를 생략하려면 재활성화 시 밀린 범위를 복구해야 합니다. “유효한 수신 게시물이 아직 없음”을 “연동이 영구적으로 불필요함”으로 판단해서도 안 됩니다. [SettingsRepository.js:95](C:/CloudJira/moves-approval-jira/src/resolver/settings/SettingsRepository.js:95), [WorkforcePublisher.js:24](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:24)

**추가 질문 9: 앱 실행 시 처리 + 하루 1회**

먼저, **전환 자동 적용의 결정 직후 실행은 이미 있습니다.**

`ApprovalService`가 `afterDecide`를 await하고, `TransitionTargetAdapter`가 승인 완료 시 `TransitionExecutor.apply`를 await합니다. 추가 구현이 필요한 것이 아니라, 기존 후속 실행의 복구 주기를 바꾸는 문제입니다. [ApprovalService.js:930](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalService.js:930), [TransitionTargetAdapter.js:238](C:/CloudJira/moves-approval-jira/src/resolver/approval/target/TransitionTargetAdapter.js:238)

| 작업 | 앱 실행 시 처리로 옮길 수 있는가 | 하루 1회만 남겼을 때 영향 |
|---|---|---|
| **전환 자동 적용** | **부분.** 결정 직후 실행은 이미 존재. 관련 요청의 재시도·대조도 가능하지만 전체 대기열을 모든 조회에 붙이는 것은 부적절함. | 결정 후 함수 중단, bulk 예산 초과 등으로 남은 `WAITING`이 다음 날까지 남을 수 있음. “승인됐는데 Jira 상태가 안 바뀜”이 발생. |
| **Workforce 게시** | **부분.** 제한된 게시나 별도 background worker를 깨우는 방식은 가능. 전체 marker 확장·스캔·배출을 화면 응답에 넣기는 무거움. | 승인·재승인 필요·마감 상태와 Workforce 원가·정산 반영이 하루가량 늦어짐. Moves Approval을 열지 않고 Workforce만 사용하는 날에도 발생. |
| **만료 처리** | **맞음, 보조 처리로 적합.** 해당 요청의 기한 검사는 사용자 작업 시 수행하고 일일 스윕으로 정리 가능. | 전체 만료 정리는 원래 일일 구조. 다만 현재 5분 이어받기를 없애면 적체·실패분이 다음 날로 넘어가고 임박·독촉 알림 시기를 놓칠 수 있음. |
| **타임시트 보정** | **부분.** 관련 화면의 제한된 확인은 가능하지만 사이트 전체 보정은 background 작업으로 유지하는 편이 적합. | 누락된 변경의 승인 무효화·마감 후 변경 표시가 하루 이상 지연될 수 있음. 자동 마감 판정은 시각 계산으로 유지되지만 마감 행·감사·게시 기록은 늦어짐. |
| **이력 보정** | **부분.** 화면 접근을 보정 계기로 추가할 수 있지만 수집의 주된 실행 조건으로 삼으면 안 됨. | 이력 화면과 인증 변경 감지가 늦어짐. 스윕은 ID 목록을 얻고 현재 워크로그를 읽으므로, 누락 기간의 모든 중간 수정 버전을 복원하는 장치가 아님. |

만료된 요청의 결정은 이미 현장에서 거부·만료 처리합니다. 따라서 스윕을 매분 돌려야 기한 준수가 보장되는 구조는 아닙니다. 반면 만료 **알림과 저장 상태 정리**는 스윕 지연의 영향을 받습니다. [ApprovalService.js:862](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalService.js:862)

자동 마감도 판정은 시각 계산이고, `recordAutoCloses`는 감지 기준·감사·게시를 위한 기록입니다. 이 두 역할을 구분해야 합니다. [PeriodCloseService.js:260](C:/CloudJira/moves-approval-jira/src/resolver/timesheet/PeriodCloseService.js:260)

**asApp은 “사용자 컨텍스트가 없어야 호출할 수 있는 API”가 아닙니다.**

Forge 기술상 resolver 안에서도 `api.asApp()`을 호출할 수 있습니다. 호출 권한은 앱의 권한을 따릅니다. [Jira authentication](https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/)

다만 이 저장소는 asApp 경로를 명시적으로 제한합니다. 그대로 이식하려면 다음 경계를 보존해야 합니다.

- Workforce PUT·대조 GET은 `WorkforcePublisher`의 지정된 gateway만 사용합니다.
- 보정용 워크로그는 지문·상태 판정·이력 저장에만 사용하고 원문을 화면 호출자에게 반환하지 않습니다.
- 사용자에게 보여 주는 결과는 기존 asUser 권한 필터를 다시 거칩니다.
- 전환 POST는 화면을 연 사람이나 최종 결재자가 아니라 **승인 요청자의 offline `asUser(accountId)`**를 유지합니다.
- 전역 커서를 화면 호출자의 `asUser()`로 진행시키면, 그 사람이 못 보는 변경을 누락할 수 있으므로 권한 방식만 바꿔서는 안 됩니다.

근거: [WorkforcePropertyGateway.js:6](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePropertyGateway.js:6), [WorklogCollector.js:253](C:/CloudJira/moves-approval-jira/src/resolver/timesheet/WorklogCollector.js:253), [TransitionOfflineGateway.js:3](C:/CloudJira/moves-approval-jira/src/resolver/transition/TransitionOfflineGateway.js:3).

현행 background 경계를 유지하려면 **resolver는 작업을 영속적으로 예약하고, 별도 consumer가 처리하는 방식**이 더 명확합니다.

**fire-and-forget 완료는 보장되지 않습니다.**

응답 후 Promise가 계속 실행될 수는 있지만, 중단된 뒤 다음 호출에서 재개되거나 아예 실행되지 않을 수 있습니다. 공식 문서는 반환 전에 await하고, 응답 이후 작업에는 **Async Events API**를 사용하도록 명시합니다. [Node.js delayed execution](https://developer.atlassian.com/platform/forge/function-reference/nodejs-runtime/)

따라서 가능한 형태는 다음 둘입니다.

- 응답 전에 작고 제한된 작업을 **await**하고 나머지는 저장된 커서로 넘김.
- 응답 전에 큐 등록을 **await**하고 consumer에서 처리.

`Promise.race`로 2초 뒤 응답하는 것은 실행 중인 SQL·Jira 요청을 취소하지 않습니다. 또한 기존 스윕을 호출한다고 2초 안에 끝나는 것도 아닙니다. 전환 executor의 budget 검사는 진입 시점에 있으므로 이후 여러 Jira 요청까지 2초 이내로 제한하지 않습니다. [TransitionExecutor.js:19](C:/CloudJira/moves-approval-jira/src/resolver/transition/TransitionExecutor.js:19)

**25초 한도도 구분해야 합니다.** 현재 공식 기준에서 일반 resolver는 25초지만, scheduled trigger·async consumer는 기본 55초이고 전용 함수의 `timeoutSeconds`로 최대 900초까지 설정할 수 있습니다. 저장소의 “스윕도 25초” 주석은 현행 문서와 다릅니다. [Invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/)

마지막으로, 현재 일일 `runSweep`에는 **전환 적용, Workforce `tick`, 타임시트 보정, 이력 보정이 없습니다.** Workforce는 `verifyPublished`만 실행합니다. 기존 시간별 스케줄만 지우면 “하루 한 번 안전망”이 완성되는 것이 아닙니다. [runSweep.js:19](C:/CloudJira/moves-approval-jira/src/trigger/runSweep.js:19)

## 권고 순서

1. **사용량 항목과 실행 원인을 먼저 분리합니다.**  
   SQL requests·SQL duration·Functions duration을 사이트·환경별로 확인하고, 스케줄 호출과 Jira 이벤트 호출을 나눠 봅니다. 코드의 SQL 횟수만으로 높은 컴퓨트의 주원인을 확정할 수는 없습니다.

2. **보정·게시의 시간 단위 지연을 허용한다면, (c)를 먼저 적용합니다.**  
   기존 전환 결정 직후 실행과 이벤트 처리를 유지하고, 5분 작업을 시간당으로 옮깁니다. 이것만으로 **해당 작업의 주기적 호출은 288회/일에서 24회/일로 약 91.7% 감소**합니다. 다른 시간당·일일 작업까지 포함한 전체 SQL 비용이 같은 비율로 줄어든다는 뜻은 아닙니다.

3. **시간당 통합 시 작업별 주기·리스·커서를 유지합니다.**  
   자동 마감 기록 후 타임시트 보정이라는 순서를 보존하고, 실패가 다른 작업을 막지 않게 합니다. 일일 만료·마이그레이션·게시물 대조를 매시간 무조건 실행하지 않으며, 잔여 작업은 다음 시간에 이어갑니다. 공유 시간 예산과 리스 기간도 맞춰야 합니다.

4. **그다음 readiness와 무의미한 쓰기를 줄입니다.**  
   컬럼 12개 프로브 일괄화, 테이블 준비 조회 공유, 명시적 Workforce OFF의 조기 반환, 바뀌지 않은 스캔 커서 저장 생략, 불필요한 리스 상태 SELECT 제거 순서가 적절합니다. 변경 신호를 모든 producer에 추가하는 것보다 범위가 작습니다.

5. **수분 내 반영이 필수인 경우에만 (a)를 우선합니다.**  
   설치별 KVS 신호를 보조 수단으로 사용하되, producer 누락·동시 clear·SQL/KVS 이중 쓰기·미래 재시도·초기 설치 복구를 설계하고, 시간당 독립 스캔을 유지합니다. 단순 boolean 패치로 끝내면 안 됩니다.

6. **(b)는 제한된 보조 기능으로 사용합니다.**  
   관련 요청의 만료 판정이나 짧은 보정, background 작업 예약에는 적합합니다. 모든 resolver에 전체 스윕을 붙이면 화면 지연과 중복 리스 경합이 늘고, 이용자가 없는 설치에서는 작업이 정체됩니다. 라이선스 차단으로 resolver 본문이 실행되지 않는 경우도 있으므로 일일 안전망을 대체하지 못합니다. [ResponseWrapper.js:16](C:/CloudJira/moves-approval-jira/src/utils/ResponseWrapper.js:16)

## 판정 요약

| 검토 항목 | 판정 | 이유 |
|---|---|---|
| A: 5분마다 세 작업이 실행된다 | **맞음** | `Promise.allSettled`로 세 작업 호출 |
| A: 콜드 상태에서도 17~19 SQL이다 | **틀림** | 정상 유휴 콜드는 34~38회. 컬럼 12개 프로브 등이 빠짐 |
| A: 하루 약 5천·월 약 15만 | **부분** | warm 실행의 근사치. 콜드면 월 약 29.4만~32.8만 |
| B: 시간당 두 스윕의 리스·커서 비용이 있다 | **맞음** | 단, Jira 호출 여부는 기능·데이터 조건에 따라 다름 |
| C: 스케줄 실행은 매번 콜드 스타트다 | **틀림** | warm 재사용 가능. 실제 재사용률은 미측정 |
| C: `information_schema`가 일반 SELECT보다 비싸다 | **부분** | 반복 요청 비용은 확실하지만 상대 실행 비용은 **모름** |
| C: 리스 획득은 항상 3회다 | **부분** | 해당 리스의 성공 경로는 3회. 경합 시 2회이며 모든 리스 구현이 같지는 않음 |
| C: 세 작업을 묶은 것이 비용 원인이다 | **부분** | 불필요한 실행은 있으나 묶기 자체가 SQL을 늘리지는 않음 |
| D1: KVS 플래그 | **부분** | 가능하지만 신호 유실과 producer 누락 방어 필요 |
| D2: KVS 스키마 버전 | **부분** | 테이블·컬럼 준비 보증과 marker 복구 필요 |
| D3: 리스 UPDATE 1회 | **부분** | 획득은 가능. UPDATE 결과로 cursor를 읽는 전제는 틀림 |
| D4: OFF·미연결이면 즉시 반환 | **부분** | 하위 이력 정책·인증 추적·독립 타임시트 기능을 구분해야 함 |
| Q6: 전환을 결정 직후 실행하도록 바꾼다 | **부분** | 이미 구현됨. 바뀌는 것은 잔여 작업의 복구 주기 |
| Q9: resolver 종료 후 fire-and-forget | **틀림** | 실행 완료가 보장되지 않음 |
| Q9: 모든 작업을 앱 실행 시 처리하고 하루 1회만 보완 | **부분** | 만료 정리에는 적합하지만 전환 복구·게시·변경 감지는 지연과 누락 위험이 커짐 |
| 최종 권고 | **(c) 시간당 통합 스윕** | 변경 범위와 절감 효과의 균형이 좋음. 수분 내 반영이 필수이면 **(a)** 선택 |