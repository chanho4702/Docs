# APM 운영 기능 감사 — 2026-10-06

대상은 BE `e55948c`의 알람, SLO, synthetic, archive/export, 공통 스케줄러다. 실제 Java 구현과 Flyway DDL을 읽었고, 기존 테스트의 범위를 확인했다. 이번 감사에서 테스트·DB 부하시험·서버 재기동은 실행하지 않았다. 아래의 `확인`은 소스에서 확인한 동작이며 운영 사고 재현을 뜻하지 않는다.

파일 경로는 별도 표기가 없으면 `C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/` 기준이다. `apm/`는 `premium/apm/`를 줄여 썼다. 알람 개선은 기존 결정대로 **Zabbix 분리·독자 알림 체계 작업에 통합할 제안**이며 이번에 구조를 수정하지 않았다.

## 평가

운영 기능은 단순한 화면 시제품 수준을 넘었다. 특히 SLO의 누락·부분 관측 표현, synthetic의 오래된 성공값 구별, archive의 원장·잠금·보존 연동, export의 권한·절단 표시가 구현돼 있다. 그러나 장기 실행·다중 노드·외부 시스템 장애·이력 누적에서 동일한 품질을 보장하는 구조는 덜 완성됐다. **기능 제공 범위는 넓지만 HA와 장기간 대규모 운영의 완성도는 중간 단계**로 평가한다.

## 개선 우선순위

### 1. 장기 배치의 실행 소유권 유지와 fencing — P1, HA 확대 전 필수

- **확인/근거:** `scheduler/SchedulerLeaseService.java:40`의 TTL은 30분 고정이고 `:64`의 만료 lease 탈취 뒤 갱신 경로가 없다. `scheduler/SchedulerManager.java:177`은 배치를 직접 실행하고 종료할 때만 반납한다. 공통 실행 deadline·소유권 상실 검사·fencing token 전달이 없다.
- **발동 조건/영향:** 알람 평가, SLO backfill, 리포트 등 한 실행이 30분을 넘고 다른 노드에서 같은 job이 발동하면 두 실행이 함께 진행할 수 있다. 중복 외부 호출, 갱신 역전, 알람 중복 생성 위험이다. 이는 조건부 추론이며 실제 30분 초과 빈도와 다중 노드 재현은 검증하지 않았다.
- **현재 방어:** 원자적 lease 획득, owner 일치 시만 반납, 실패 `finally` 반납과 실행 이력은 있다. archive는 별도로 28분 hard stop·일자 잠금·RUNNING 유일 원장을 둔다(`apm/archive/ApmArchiveService.java:70`, `:182`, `:264`). 따라서 모든 배치가 무방비라고 평가하면 안 된다.
- **개선:** lease heartbeat와 실패 감지, 실행마다 UUID 소유권·fencing 세대 번호, 쓰기 직전 소유권 확인, 작업별 시간 예산 및 작은 재개 가능한 배치. 다른 노드 시계 차이의 영향을 줄이도록 DB 시간 기준도 검토한다.
- **완료 기준:** 두 노드 시험에서 한 노드를 TTL 이상 정지시켰다가 재개해도 예전 소유자의 쓰기·외부 전송이 차단되고 새 실행만 완료한다. 정상 장기 실행은 갱신돼 탈취되지 않으며 종료·DB 단절 후 안전하게 재개한다.

### 2. 알람 판정 저장과 외부 알림 전송 분리, 열린 이벤트 유일성 — P1

- **확인/근거:** `apm/alert/evaluate/ApmAlertEvaluationService.java:281`의 전체 평가가 단일 트랜잭션이며 `:324`의 프로비저닝과 `:395`의 Zabbix push가 안에 있다. `:367`에서 열린 이벤트 조회 후 `:370`에서 INSERT한다. `apm/core/domain/ApmAlertEventRepository.java:61`은 잠금 없는 조회다. `src/main/resources/db/migration/V38__apm_p1.sql:388`~`:402`에 열린 `(rule_id, service_id)` 유일 제약이 없고 후속 migration에서도 해당 제약을 찾지 못했다.
- **발동 조건/영향:** 느린 Zabbix·다수 전역 규칙은 DB 트랜잭션을 길게 붙잡는다. 외부 push 성공 후 DB commit 실패 시 두 시스템 상태가 갈릴 수 있다. 평가가 겹치면 같은 열린 이벤트가 둘 생길 수 있다. 구조는 확인, 실제 발생 여부는 검증 공백이다.
- **현재 방어:** scheduler lease, 같은 실행의 열린 이벤트 조회, 일괄 push, Zabbix drift·실패 배지, orphan 정리·외부 객체 삭제 재시도 큐가 있다.
- **개선:** 독자 알림 작업에서 판정+이벤트+outbox를 짧은 DB 트랜잭션으로 저장하고 전달 worker가 재시도하도록 한다. nullable collector 대상까지 포함한 열린 이벤트 partial unique index와 idempotent 전이를 둔다. 전역 규칙 대상 조회·측정도 배치화한다.
- **완료 기준:** 같은 규칙·대상을 동시에 평가해도 열린 이벤트 1개, commit 실패 시 알림 없음, 전달 후 프로세스 종료·재전송에도 전달 중복 통제, 알림 제공자 지연이 수집 API DB pool에 영향을 주지 않는다.

### 3. SLO의 관측 부족을 운영 상태·알림 정책에 반영 — P1/P2

- **확인/근거:** `apm/slo/ApmSloCalculator.java:663`은 히스토그램에서 임계 이하 수를 계산하고 `:675`는 실제 측정 수와 전체 요청 수를 구분한다. `:295`의 coverage는 계산되지만 `:734` burn rate와 `:936` status는 최소 coverage를 요구하지 않는다. `apm/slo/ApmSloService.java:425`도 이 status를 그대로 사용한다. `apm/alert/evaluate/ApmSloBurnEvaluator.java:121`은 완전 측정 불가에 음수를 보내며 일반 평가 `ApmAlertEvaluationService.java:361`~`:386`은 그 값을 기존 이벤트 해소로 처리한다.
- **발동 조건/영향:** 요청 10,000건 중 지연을 측정한 100건만 전부 정상이면 관측된 부분의 SLO가 양호하게 판정될 수 있다. 완전 수집 단절 때 번 알람이 해소될 수 있으며, 별도 STALE 알람·운영 정책이 없다면 알림 관점의 공백이 생긴다. 이는 현재 명시적인 설계 선택이며 계산식 버그로 단정하지 않는다.
- **현재 방어:** requests/measured/mixedBounds, 측정 시간·lag, UNKNOWN 사유를 제공한다. 트래픽 0을 100% 성공으로 만들지 않으며 네 창을 이용한 burn 판정이 있다. 수집 단절용 STALE 종류도 존재한다. 지연 임계의 히스토그램 보간은 근사값이라는 설명이 있다(`apm/core/metric/ApmPercentiles.java:228`).
- **개선:** coverage·freshness 최소 기준과 `INSUFFICIENT_DATA` 상태, 번 알람 해소 사유 구분, STALE/수집 파이프라인 이상 알람의 필수 연계를 정한다. 엄격한 SLA용 지연 SLO는 임계와 정확히 일치하는 버킷 사용 또는 근사 오차 범위를 안내한다.
- **완료 기준:** 부분 관측·수집 단절·정상 무트래픽·실제 복구를 각각 시험해 사용자와 알림 수신자가 구별한다. coverage 1%의 양호 표본이 정상 서비스로 오인되지 않는다. 이미 제공되는 메타데이터는 유지한다.

### 4. 알람 이력 조회·보존·삭제 정책 — P2, 데이터가 쌓이기 전에 수행

- **확인/근거:** `apm/alert/rule/ApmAlertService.java:286`은 전체 이벤트를 읽고 Java에서 필터·정렬·페이징한다. `:293`, `:295`는 규칙·서비스도 전량 읽는다. 반환 limit 500은 DB/메모리 읽기량 상한이 아니다. `ApmAlertEventRepository.java:110`의 삭제 메서드는 호출처가 없고 `ApmRetentionService`에 이 테이블 정리가 없다. V38 `:390`~`:391`은 규칙·서비스 삭제 시 이력 CASCADE 삭제다.
- **발동 조건/영향:** 장기간 잦은 장애·flapping에서 이력이 무제한 늘고 최근 50건 조회조차 전체 이력 비용을 낸다. 반대로 규칙 정리나 서비스 삭제는 감사에 필요한 과거 이력까지 지울 수 있다.
- **현재 방어:** `(service_id, fired_at)` 인덱스, API 반환 페이지, 별도 개요용 SQL query store는 있다. 모든 알람 조회가 전량 조회인 것은 아니다.
- **개선:** DB 필터·keyset pagination 및 필요한 행만 조인, 열린 이벤트 보호와 종료 시점 기준 retention, 독립 이력 snapshot/soft delete 또는 삭제 시 FK 분리 정책을 독자 알림 전환에 포함한다.
- **완료 기준:** 큰 이력에서도 최근 페이지 조회가 인덱스로 제한되고, 미해소 사건은 유지되며, 규칙 삭제 후에도 정책 기간의 과거 사고 설명이 가능하다. retention 반복 실행이 멱등이다.

### 5. export의 전체 작업 예산과 느린 다운로드 격리 — P2

- **확인/근거:** `apm/export/ApmExportService.java:147`의 계획 조회는 semaphore 바깥이며 `:162`의 download만 노드별 permit을 얻는다. `apm/export/source/ApmRedSeriesExporter.java:183`은 전체 서비스, `:187`은 기간 내 관측을 조회한 후 예상 행 수를 산출한다. 따라서 maxRows는 계획 SQL 비용 자체를 제한하지 않는다. export 서비스/원천에 작업 전체 deadline은 확인되지 않았다. 오류 그룹은 읽기 tx와 커서를 유지하며 sink에 쓴다(`ApmErrorGroupExporter.java:122`).
- **발동 조건/영향:** 계획 API 집중 호출 또는 느린 다운로드는 행 상한 아래에서도 긴 SQL/응답·DB 점유를 만들 수 있다. 노드를 늘리면 동시 export도 노드 수만큼 늘어난다. 실제 점유 시간·DB pool 고갈은 미측정이다.
- **현재 방어:** 기본 20만 행·노드당 2개, RED chunk 1,440칸, 커서 fetchSize, 종료/실패·잘림 표시, rawText 관리자 확인, CSV 수식 방어, 계획 토큰의 창·해상도 고정이 있다. 토큰은 데이터 snapshot 보장이 아니다.
- **개선:** plan에도 비용·동시성 예산 적용, SQL timeout와 전체 deadline, 취소 전파, 사용자별·클러스터별 export 예산. 큰 요청은 비동기 생성→파일 다운로드 방식으로 전환해 DB 읽기와 클라이언트 전송 시간을 분리한다.
- **완료 기준:** plan 폭주·느린 클라이언트·취소 시험에서 정해진 시간 내 자원을 반환하고 일반 조회/수집의 지연 기준을 유지한다. 다중 노드에서도 합산 한도가 지켜진다.

### 6. synthetic 조회·실행 비용의 통합 예산 — P2

- **확인/근거:** 실행은 MovesEye 자체 runner가 아닌 Zabbix HTTP test/server/proxy에 위임한다(`apm/synthetic/ApmSyntheticService.java:304`, `:308`). 목록 `:194`는 Zabbix 시나리오를 모두 읽고 서비스 필터는 `:200`에서 적용한다. history `:1167`은 타입당 최대 25페이지×20,000점을 리스트·중복 집합에 누적한다. 이는 화면 결과 상한 20,000점보다 큰 중간 데이터다. 검증 `:1347`은 재시도 1~10·주기 표기를 검사하지만 총 시나리오/단계/위치별 실행 비용 예산은 확인되지 않았다.
- **발동 조건/영향:** 많은 시나리오·짧은 주기·장기간 조회는 Zabbix API 호출과 BE 메모리를 함께 증가시킨다. Zabbix 장애는 synthetic 조회에도 직접 영향을 준다. 실행 비용은 Zabbix 자원에도 달려 있어 APM 코드만으로 지원 규모를 보증할 수 없다.
- **현재 방어:** history 페이지 상한, `truncated`, 오래된 마지막 성공값의 STALE 구별, 캘린더 최대 90일, 결과 점수 상한, 타입별 일괄 호출, 호스트 후보 상한이 있다. 비밀번호를 상세 응답으로 그대로 되돌리지 않는 설계도 존재한다.
- **개선:** 서버 측 목록 pagination·필터 선적용, 시간/행/바이트의 요청 전체 예산, history의 streaming 집계·사전 rollup/cache, 위치별 실행 예산과 Zabbix 이용률 관측. 외부 API 장애 시 마지막 관측 시간과 부분 결과/오류를 명시한다.
- **완료 기준:** 목표 시나리오 수·주기·동시 조회별 BE/Zabbix 부하 한계가 측정되고, history 절단과 stale 결과가 통계의 완전한 값으로 표시되지 않는다. 한 위치 장애가 다른 위치의 조회를 불필요하게 막지 않는다.

### 7. archive 무결성 검사 결과를 보존 삭제 판단에 연결하고 복구를 검증 — P2, 원본 삭제 전 검증 필요

- **확인/근거:** `apm/core/batch/archive/ApmArchiveDropGate.java:131`~`:133`은 OK 원장+관리 파일 존재로 원본 삭제를 허용한다. `archive/path/ArchivePathPolicy.java:335`는 관리 경로·존재 판정이며 내용 checksum 검사가 아니다. 수동 `archive/ArchiveFileService.java:132`~`:163`의 verify는 SHA-256 불일치를 응답하지만 원장 상태를 INVALID로 바꾸거나 hold를 설정하지 않는다.
- **발동 조건/영향:** 생성 후 파일이 손상됐는데 경로에 남아 있으면, 수동 검사가 불일치를 발견했더라도 기존 OK 원장 때문에 다음 retention에서 원본이 삭제될 수 있다. 경로 안전성 문제나 현재 파일 손상을 발견한 것은 아니다. 조건부 데이터 복구 위험이다.
- **현재 방어:** 작성 중 ZIP/entry checksum 검증, SHA-256 원장, 안전 경로, 일자 잠금, RUNNING 유일성, 미보관 hold·설정 손상 시 fail-closed, partial crash 청소, 수동 verify가 있다. `ApmColdArchiveIT`는 archive→drop, 일자 lock, 설정 충돌 등을 검증한다. 무결성 체계가 없는 것으로 평가하면 안 된다.
- **개선:** verify 실패를 영구 상태와 hold에 반영하고, retention에 충분히 최근의 유효 무결성/복구 점검 증거를 요구한다. 모든 drop 순간에 큰 파일 재해시하는 방식은 피하고 검사 결과의 파일 identity·크기·mtime 등과 연결한다. 스키마별 실제 복구 runbook·복구 도구·정기 복구 연습을 마련한다.
- **완료 기준:** 아카이브 파일을 의도적으로 손상→verify 실패→retention 실행 시 원본이 유지된다. 별도 DB에 복구한 자료가 대표 조회·행 수·시간 범위와 일치한다. 복구 시간과 복구 가능 데이터 범위가 문서화된다. 이번 감사에서는 복구 시험을 수행하지 않았다.

### 8. SLO snapshot·리포트 배치를 작은 재개 단위로 나누기 — P2/P3

- **확인/근거:** `apm/slo/snapshot/ApmSloSnapshotService.java:99`는 모든 활성 SLO의 backfill을 단일 tx로 실행한다. `:116`은 SLO마다 보존된 모든 snapshot을 읽고 `:121`은 최대 30일 backfill을 돌며 `:176`, `:190`, `:194`, `:199`에서 일간·장기창·burn창을 각각 계산한다. 리포트도 `apm/report/ApmReportBuilder.java:144` 전체 서비스에서 `:175` 순차 반복하며 가용성·SLO·synthetic을 읽는다.
- **발동 조건/영향:** SLO와 서비스 수 증가·장기간 미실행·외부 synthetic 지연이 겹치면 같은 집계를 반복하고 전체 실행·트랜잭션이 길어진다. 특정 후반 실패는 앞서 처리한 전체 작업을 무효화할 수 있다. SLO daily 계산 예외만 잡는 부분과 나머지 예외 전파 범위도 구분해 관리할 필요가 있다.
- **현재 방어:** SLO backfill 30일 상한, finalized/미확정 구분과 재확정, 정의 버전·target 기록, 일자별 유일 제약이 있다. 대시보드 SLO 목록 측정에는 batch API가 이미 있으므로 확장 시 재사용할 기반이 있다.
- **개선:** 서비스/SLO·일자 단위 짧은 tx와 checkpoint, 동일 시간창 묶음 계산, deadline에 따른 다음 회차 재개, 외부 synthetic 부분 실패 격리. snapshot의 finalized 의미와 지연 수집 재정산 기간을 운영 정책으로 명확히 한다.
- **완료 기준:** 목표 SLO 수의 30일 backfill을 중단·재개해도 중복/누락 없이 진행하고, 한 SLO 실패가 다른 완료분을 되돌리지 않는다. 실행 시간을 측정해 scheduler lease 정책과 일치시킨다.

## 유지해야 할 장점

1. **관측 불확실성을 계약으로 드러냄:** SLO의 UNKNOWN/요청 수/측정 수/정의 버전, synthetic의 truncated·STALE, export의 coverage·보존 절단·미완성 구간이 있다. 개선 시 이런 설명 정보를 잃으면 안 된다.
2. **아카이브 보존 연동이 비교적 견고함:** 경로 통제, 원장, 부분 파일, checksum, 일자 잠금, 설정 변경과 retention 간 직렬화까지 구현돼 있다. 단순 파일 덤프 수준은 아니다.
3. **알람 외부 상태를 숨기지 않음:** drift, 프로비저닝/캐시 준비 상태, 소유권 확인, orphan 복구, 삭제 재시도가 존재한다. 독자 알림 전환에도 재시도·실패 가시성은 유지해야 한다.
4. **큰 다운로드의 기본 방어가 있음:** 행 수·동시성·chunk·권한·CSV 수식·로그·실패 표시가 있으며 계획과 다운로드의 창/해상도를 맞춘다.
5. **경계 조건을 다루는 기존 테스트가 있음:** `SchedulerLeaseServiceIT`, `ApmColdArchiveIT`, `ApmSloCalculatorTest`, `ApmSyntheticServiceTest`, `ApmExportIT`, 알람 평가 IT 등이 존재한다. 이번에 소스만 확인했으므로 이 감사 자체의 실행 통과 결과로 기록하지 않는다.

## 검증 경계

확인하지 않은 항목은 운영 데이터에서의 문제 발생률, 현재 활성 STALE 규칙/알림 경로, 실제 archive 손상 여부, 고객별 Zabbix runner 한계, 느린 클라이언트 점유 시간, 30분 이상 배치 비율, 다중 노드 장애 복구다. 위 항목은 미구현 주장과 성능 검증 공백을 구분해 읽어야 한다. 소스·설정·migration·서버 상태는 수정하지 않았다.
