# APM 보안·규모·검증 감사 — 2026-10-06

기준 BE `e55948c`, FE `9dfcbe8`. 운영 데이터·자격증명을 읽거나 서버를 변경하지 않았다. 실제 컴파일 클래스의 합성 입력 재현과 코드 분석을 구분한다. 모든 BE 상대 경로는 `moveseye-be-spring/src/main/java/com/dmove/moveseye/` 기준이다.

## 1. 원문 보관 설정을 끈 후 과거 원문의 열람 권한 — P1, 조건 충족 시 배포 차단 권고

- `premium/apm/trace/query/ApmRawTextPolicy.java:48~52`는 현재 `keepRawSql=false`이면 원문 권한이 없는 사용자도 RAW를 반환한다.
- `premium/apm/core/setting/ApmSettingService.java:265~299`는 설정 갱신·캐시 무효화를 수행하며 과거 원문을 소급 마스킹하지 않는다. `premium/apm/export/ApmExportService.java:49~58`도 과거 원문 잔존을 명시하고, export에서는 현재 설정과 무관하게 기본 마스킹한다.
- 화면 trace/error 상세는 위 정책을 사용한다. 예: `premium/apm/trace/errors/ApmErrorController.java:98~102`, `ApmErrorQueryService.java:312`. `ApmRawTextView.java:33,38`의 RAW는 저장값을 그대로 반환한다.
- **발동 조건:** 원문 보관을 켠 동안 민감한 SQL/스택이 저장됐고, 이후 설정을 끈 뒤 `apm.view`를 가진 비관리자가 해당 과거 행을 조회한다. 처음부터 원문을 보관하지 않은 모든 설치본에 동일하게 발생한다고 주장하지 않는다.
- **직접 클래스 재현:** production `ApmRawTextPolicy`와 `ApmRawTextView`, 일반 USER를 사용. 설정 제공자만 boolean 대역으로 바꿨다. 합성 SQL의 `EXAMPLE_ONLY_VALUE`가 설정 ON에서는 `?`로 가려지고 OFF에서는 원문으로 반환됐다. DB/HTTP/실고객 정보 노출은 재현하지 않았다.
- 재현: `../verification/apm-20261006-assessment/RawPolicyProbe.java`, 결과 `raw-policy-result.txt`. JDK17과 현재 build 클래스를 사용했다.
- **개선:** 저장 정책과 열람 권한을 분리한다. 비관리자는 현재 저장 설정과 무관하게 조회 시 마스킹하거나 행별 원문/마스킹 provenance를 저장해 판정한다. 설정 전환·과거 행·캐시 지연·trace/error/export의 동일 권한 행렬을 시험한다. 기존 `ApmRawTextPolicyTest`는 false→RAW라는 잘못된 전제를 고정하고 있어 재작성해야 한다.
- **완료 조건:** ON→원문 저장→OFF→일반 사용자 상세 조회에서 원문이 나오지 않고, 관리자·기존 마스킹본·권한 변경 케이스도 일관된다.

## 2. 서비스 전량 집계와 쿼리 전체 비용 — P1/P2, 규모 확대 전 필수

- `premium/apm/service/list/ApmServiceQueryService.java:179`의 `findAll()` 뒤 `:189`에서 전체 후보를 조립한다. `:617~642`는 RED·활성 요청·spark·상태·runtime family·가용성·instance를 채운다. 서버 페이지 계약이 아니다.
- 최근 instance 배치 조회 수정과 시계열 시간축 20,000/120,000 제한은 이미 적용돼 있다. 이 보호를 없는 것으로 보고하지 않는다. 하지만 시간축 상한이 총계열·JSON bytes·SQL scan·동시 요청 상한은 아니다.
- 일반 APM 조회의 전체 deadline·동시 실행 budget은 이번 코드 검색에서 확인하지 못했다. archive는 별도 `SET LOCAL statement_timeout` 방어가 있다. 운영 DB 자체 설정까지 없다고 단정하지 않는다.
- `premium/apm/service/hostlink/ApmZabbixHostLinker.java:110~111,144~171`은 이름별 캐시 미스마다 자산 검색, 2,000개 캐시 상한에서 전체 clear다.
- **개선:** 목록 요약과 경량 선택 API 분리, DB 필터·정렬·pagination, 집계 대상 제한, query deadline·취소·요청별 총점/bytes/동시성 예산. 호스트 연결은 집합 조회·개별 만료 캐시.
- **완료 조건:** 목표 서비스 수에서 첫 페이지 비용이 전체 개수에 비례해 증가하지 않고, 긴 기간·다계열·동시 조회 중에도 수집 지연 기준을 유지한다. 실제 SQL 계획으로 검증한다.

## 3. 등록·계열 총량과 저장 용량 — P1/P2

- `premium/apm/service/registry/auto/ApmRegistrar.java:174~182` 자동 등록, 이후 instance 등록은 전역 등록 수 hard cap 없이 진행된다. AUTO 외 APPROVE/ALLOWLIST와 수집 중지·이름 정규화는 이미 방어한다. 캐시 20,000과 라이브 서비스 상한은 DB 등록 수 상한이 아니다.
- route 서비스당 기본 500은 method/status/runtime 등 모든 차원 조합 수의 상한이 아니다. 잘못된 instance.id 또는 동적 속성은 저장 행을 빠르게 늘릴 수 있다.
- V38의 `dims_hash char(64)`+`dims jsonb` 반복 저장 비용과 인덱스 비용이 있다. 과거 R3 합성 시험 686B/행·9.6GB/일은 해당 분포의 측정이며 현재 모든 고객의 비용이 아니다.
- **개선:** 서비스·인스턴스·계열별 예산, 등록률 제한, 수집 차단/격리 정책, 운영자 경보, 활성/만료 레지스트리 관리, 차원 사전·해시 표현의 저장비용 실험.
- **완료 조건:** 동적 이름 폭주에서도 메모리·DB 증가량이 정한 예산 안에 있고 폐기 사유·영향 서비스가 보인다. WAL·백업·아카이브까지 포함한 설치 용량을 계산한다.

## 4. 다중 BE의 상태 공유와 공정한 자원 예산 — HA 사용 전 P1

- `premium/apm/rum/security/RumRateLimiter.java:13~19,68~79`는 노드 로컬 일 예산이며 재시작 시 초기화된다. `collector/ingest/live/LiveTokenRateLimiter` 역시 노드 메모리다. live 링·SSE와 누적형 기준값도 노드에 있다.
- 단일 노드의 본문·동시 수신 제한, 예산과 메모리 상한은 장점이다. DB receipt 유일성이 있어 동일 메트릭 본문을 다중 노드가 모두 더한다는 주장은 하지 않는다.
- 다른 본문인 누적형 시계열을 A/B로 분산하면 각자의 이전값 기준으로 겹치는 구간을 계산할 수 있다. 데이터 감사 문서의 원시계열 식별·timestamp 보완 이후 상태 소유권까지 설계해야 한다.
- **개선:** 시계열 소유권·고정 라우팅 또는 공유 checkpoint, live fan-in/read routing, 노드별 제한과 클러스터 합산 제한 구분, 분산 예산. 공통 scheduler lease의 갱신·fencing은 운영 감사 문서에 별도 근거가 있다.
- **완료 조건:** 2개 BE의 교대 수신·롤링 재시작·장애 전환에서도 수량과 조회가 일관되고 합산 예산이 지켜진다. 단일 노드 지원만 할 경우 설치 문서에서 그 제약을 강제한다.

## 5. 검증과 자체 관측 — P1/P2, 규모 보증 전 필수

- 과거 SQL 합성 1,404만 행 시험은 OTLP 수신→가산 저장→rollup→조회→SSE 동시 시험이 아니다.
- 앞선 선별 Java 521·Node25·브라우저HTTP4는 실행한 시나리오의 증거다. 새 감사에서 발견한 원시계열 충돌·역순 도착·원문 설정 전환을 포함한 제품 전체 품질 보증은 아니다. 테스트 수를 완료율로 바꾸지 않는다.
- 수집 폐기 사유·SSE stats·Collector 상태 등 진단 경로는 있다. 다만 노드 로컬 누적 counter만으로 재시작을 포함한 종단 수량 보존·고객별 용량 이력을 증명하기 어렵다.
- **개선:** 입력 관측→허용→저장→rollup→조회 수량 대조, 고정 fixture의 속성 기반 정확성 시험, 목표 계열/분·span/초·서비스/인스턴스 수·동시 화면·보존기간의 복합 부하 및 장시간 시험. Collector 디스크 큐 재생, DB 단절, 느린 프록시와 재연결을 포함한다.
- **완료 조건:** 정한 입력에 대해 유실·중복·지연을 계수하고 수집 p95·조회 p95·SSE 지연·CPU·heap·GC·DB 부하·저장 증가를 함께 기록한다. 설치 사양과 지원 규모를 그 결과로 결정한다.

## 유지할 장점과 조건부 확장

- `ApmAccessChecker`는 view/edit와 원문 관리자 권한을 구분한다. 수신 토큰은 hash 저장·회수·용도 검사, 입력 본문 제한과 429/503, SQL/속성 정책이 있다. 위 원문 설정 전환 결함을 전체 인증 부재로 확대하지 않는다.
- 현재 APM 조회 권한은 모듈 단위다. 서비스/팀/환경 단위 권한은 다부서 격리 요구가 있을 때 별도 제품 과제이며, 그 요구 없이 즉시 보안 버그로 분류하지 않는다.
- 범용 로그 상관·연속 프로파일·DB 실행 계획 진단은 이후 기능 확장 후보다. 현재 정확성·운영 보완보다 먼저 구현할 이유는 확인하지 못했다.
