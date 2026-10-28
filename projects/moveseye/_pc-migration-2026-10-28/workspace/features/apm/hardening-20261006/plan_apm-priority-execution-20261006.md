# APM 우선순위별 실행 기록 — 2026-10-06

사용자 승인: 전체 평가 후 “순차적으로 진행”. 기준 BE `e55948c`, FE `9dfcbe8`. 평가 정본은 `moveseye-docs/overview/apm-overall-assessment.md`다. 단계별 구현→회귀→독립 검토→문서/커밋 순으로 진행한다. 이 기록의 미착수 항목을 완료로 간주하지 않는다.

## 보호할 기존 작업

- BE `ApmCollectorController.java`의 기존 import 정리는 이번 커밋에서 제외한다.
- 문서 저장소의 기존 staged rename과 다른 편집은 보존하고 APM 산출물만 선택 커밋한다.
- 공유 BE/FE 재기동·원격 push·운영 배포는 이번 소스 보완과 구분한다.
- PostgreSQL을 쓰는 Gradle 시험은 루트가 순차 실행한다. 에이전트가 동시에 시험 DB를 재생성하지 않는다.

## 실행 상태

| 평가 순위 | 작업 | 상태 | 범위·다음 게이트 |
|---|---|---|---|
| 1 | 과거 원문 열람 권한 | 완료 | BE `aab73fc`. 79개/6클래스 실패·오류·skip0. 실제 DB/JWT 설정 전환·상세 조회 및 독립 QA |
| 2~4 | 원시 누적계열·관측 순서·histogram 경계 | 완료 | BE `22eeff8` 203개·bootJar, FE `59186c0` 117개·tsc, 실패·skip0. 14번 중 tracker 예산 포함 |
| 5 | 지연 데이터 재집계·보존 | 부분 완료 | durable dirty·generation ACK·재집계·보존 게이트 구현. stage5 별도 148개 통과. **SLO/availability/RED·endpoint export가 dirty·legacy completeness를 반영하는 후속 구현은 필수 잔여** |
| 6 | trace 재분류의 옛 집계 | 완료 | 옛 키 제거·empty forward 교정·RR snapshot·source relation lock. PG 39개 통과 |
| 7 | 관측 시각·partition 제한 | 부분 완료 | 메트릭은 5번과 통합, RUM 53개 통과. **서버 trace timestamp/partition guard 잔여** |
| 8 | archive 무결성→삭제 차단 | 완료 | CORRUPT·CAS·강제 HOLD·재생성/삭제. BE 55개, FE Jest 84개·tsc 통과 |
| 9~10 | 환경 필터·수동 갱신 | 계약 준비 | BE 구현 전 계약 작성. FE 조사 완료. BE→FE→경계면·브라우저 QA 순서 |
| 11 | 알람 원자성·전송 | 미착수 | 기존 독자 알림 전환 작업과 통합 |
| 12 | 목표 규모·복합 부하 | 미착수 | 입력 부하·지연·유실 기준과 시험 환경 필요 |
| 13~14 | 목록 페이지·총량 예산 | 미착수 | tracker 예산 일부는 2~4와 함께 선행 |
| 15 | HA 상태·공유 예산·fencing | 미착수 | 시계열 소유권·노드 라우팅·durable checkpoint 설계 |
| 16~19 | 비용·수명주기·SLO·자체 관측 | 미착수 | 앞선 데이터/운영 계약을 기반으로 확장 |
| 20~23 | 실환경·조사 UX·RUM·심화 진단 | 미착수 | 지원 환경·제품 요구별 완료 조건 적용 |

## 검증 기록

### stage5~8 통합 확인 및 커밋

현재 `moveseye-be-spring` tree에서 stage5(관련 일부 클래스), stage6, RUM, archive 회귀 188개를 한 번의 `:test`로 실행했다. **188개·14 클래스, 실패/오류/skip 0**, BUILD SUCCESSFUL. 실제 PostgreSQL 통합 클래스도 포함된다. 이 숫자는 stage별 별도 실행 총합(295)과 다르며, 통합 command에 포함한 클래스만 센다. archive BE만의 별도 확인은 55개(서비스 11, gate 21, cold archive IT 23)로 모두 통과했다. 최초 실행에서 `ApmColdArchiveIT` 9개가 동일 날짜를 stage5의 `retired_before` 뒤 다시 만들려다 실패했다. 전역 tombstone을 지우지 않고 테스트별로 새로운 만료 날짜를 배정하도록 fixture를 바꾼 뒤 통과했다.

FE archive Jest 84개와 전체 `npx tsc --noEmit` 통과. Browser E2E는 실행하지 않았다. BE stage5 소비자의 dirty/legacy completeness는 코드상 남아 있어 순위 5 전체 완료로 처리하지 않는다.

BE 변경은 `2f84b554b33eea573f9128d8b69a561f02902a01`, FE archive 표현/동작은 `b8081cc61190e9db2123163ade46384c1dcf7450`에 커밋했다. 보호된 `ApmCollectorController.java` import-only diff는 BE 커밋에서 제외했다. 원격 push·공유 서버 재시작·배포는 하지 않았다.

### 단계 1

JDK17에서 `:test --max-workers=1`에 `ApmRawTextPolicyTest`, `ApmRawTextPolicyIT`, `ApmReadAccessMvcTest`, `ApmTraceAggQueryIT`, `ApmExportServiceTest`, `ApmExportIT` 필터를 주어 실행했다. 3분 24초, 79개/6클래스 실패·오류·skip0. 결과 XML은 `_archive/features/apm/hardening-20261006/apm-priority-20261006/stage1/`에 보존했다. 독립 검토 `features/apm/hardening-20261006/apm-stage1-qa-20261006.md`에 차단 결함 없음. 구현 BE `aab73fc`.

기존 Collector diff와 문서 staged diff의 SHA-256이 시작 기준과 일치했다. 전체 OTLP E2E나 범용 PII 제거까지 검증했다고 주장하지 않는다. 공유 서버 재시작·배포는 하지 않았다. 기존 521개 결과를 이번 변경의 새 실행 결과로 재사용하지 않는다.

### 단계 2~4

BE JDK17의 선별 회귀 203개 실패·오류·skip0, `:bootJar` 성공. 실제 PG Atomicity 14개·Store 11개 포함. FE Jest 117개 실패·skip0 및 전체 tsc 통과. 독립 QA 완료. Claude 실제 CLI 읽기 전용 설계 검토(28턴)에서 self-sweep·예산 포화·미래 checkpoint·원시 신원 전환·ProtoJSON 표현 경계를 반영했다. 커밋 BE `22eeff8`, FE `59186c0`.

증빙: `_archive/features/apm/hardening-20261006/apm-priority-20261006/cumulative-be/`, `cumulative-fe-jest.json`, `features/apm/hardening-20261006/apm-cumulative-qa-20261006.md`, `features/apm/hardening-20261006/qa_apm-cumulative-fe-20261006.md`, `features/apm/hardening-20261006/review_apm-cumulative-design-20261006-claude.md`.

사용자 후속 요청 “작업 다하고 문서 작성해”에 따라 제품 보완·검증을 계속하고 정식 문서는 최종 단계에서 통합 갱신한다. 그 전에 쓰는 이 실행 기록·계약·QA는 작업 중 근거다. 전체 23개 완료로 표시하지 않는다.

### RUM 후속의 분리 검증

5~6번 소스 작성 중 간섭을 피하려고 `22eeff8` 기반 detached worktree `_workspace/worktrees/apm-rum-time-20261006`에 RUM 7파일만 적용했다. `RumParserTest` 14개, `RumStoreTest` 11개, `ApmRumIngestMvcTest` 18개, 실제 PG `RumSchemaIT` 10개 = 총53개 실패·오류·skip0. 빌드 포함 5분31초. 결과는 `_archive/features/apm/hardening-20261006/apm-priority-20261006/rum-time/`에 보존했다. 커밋은 5~6번 이후 별도로 할 예정이며, 서버 trace 시간창까지 완료된 것은 아니다. Collector 기존 diff와 문서 staged diff 해시 모두 기준과 일치했다.

## 2026-10-07 Claude 인수 (COLLAB `SOLO-CLAUDE`, Codex는 검수)

| 평가 순위 | 작업 | 상태 | 커밋·근거 |
|---|---|---|---|
| 5 후속 | 소비자 완전성(`c05bd85`) 코덱스 자기 검토 지적 3건 — 1h coverage의 5m 상태 상속·SLO 시계열/오늘 칸·RED export 게이지 | 완료 | BE `9a35de1`·`ab78f4f`, FE `a1e258e`·`26795a4`. 코덱스 1차 반려(🔴1·🟡3)→전건 반영. `features/apm/hardening-20261006/review_apm-c05-followup-20261007.md` |
| APC-07 | `live.max-services` 201~2000 기동 실패 | 완료 | BE `9a35de1`(`@Max(200)`), 검증 경계 테스트 `ab78f4f` |
| 7 | 서버 trace 관측 시각·파티션 제한 | **완료** | BE `fd4fcfb`, FE `dfb0442`. 실 PG `ApmTraceTimeWindowIT`. 코덱스 조건부 승인→회귀 보강. retired tombstone은 공통 partition 경계 과제로 보류. `features/apm/hardening-20261006/review_apm-trace-time-window-20261007.md` |
| 9~10 | env 필터·행 선택·수동 갱신 | **완료** | BE `1c094a1`(master ff), FE `707bf84`. 코덱스 BE 1차 반려→2차 승인, FE 1차 보완→2차 조건부 승인→반영. 브라우저 런타임 미검증. `reviews/review_apm-query-controls-{be,fe}-20261007.md` |
| 11 | 알람 원자성 **1차** | **완료(10-08)** | BE `3de55ec`(master ff). V74 부분 UNIQUE+ON CONFLICT 열기+STUCK 전이 감시기 단일화. 코덱스 3차 승인. `features/apm/alerts/review_apm-alert-atomicity-20261008.md`. **2차(커밋 뒤 Zabbix outbox)는 09-30 "APM 알람 자빅스 분리·독자 알림" 작업의 일부 — 지시 전 착수 금지.** docs PG 15 명시는 docs 트리 타 세션 재편 중이라 미커밋 |
| (신규) | **"장애 및 에러" 메뉴**(사용자 10-08 요청) | **완료(10-10)** | BE `b61d33e`(master ff)·FE `cbadb3e`. 코덱스 BE 3회·FE 2회 승인. 설계 `features/apm/alerts/apm-incidents-menu-20261008.md` §4, 검수 `reviews/review_apm-incidents-menu-{be,fe}-20261008.md`. 🔴규칙·서비스 삭제=알람 이력 CASCADE 삭제(제품 결정 대기)·브라우저 런타임 미검증 |

⚠️ 같은 날 Codex 대화형 세션이 BE 메인 트리에서 `2b17971`(수신 컨트롤러 → `collector/ingest/receive`) 커밋. Claude는 워크트리 브랜치→rebase→ff-only로만 합친다.
