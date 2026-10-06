# ZM-154 작업 보고 — APM 데이터 기간 지정 내보내기(CSV/JSONL)

- 작성일: 2026-09-16 · 범위: **BE + 계약**(FE는 ZM-152와 같은 화면을 고치는 중이라 후속)
- 상태(09-22): ✅ **BE master 병합 `b2c564a`**(미푸시) · 회귀 2,018건 통과(IT 실행 확인) · 워크트리·브랜치 정리됨
- FE는 별도 보고 [`zm-154_apm-data-export-fe.md`](ZM-154-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0-FE.md) — FE master `39ece8e`
- 설계 [`../designs/devdesign_apm-data-export.md`](../02-%EC%84%A4%EA%B3%84/%EC%84%A4%EA%B3%84-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0%28CSV-JSONL%29-%28ZM-154%29.md) · 계약 [`../contract_apm-data-export.md`](../06-API-%EA%B3%84%EC%95%BD/%EA%B3%84%EC%95%BD-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0-%28ZM-154%29.md)
- 마이그레이션: **없음**(V61 미사용)

---

## 1. 만든 것 (파일별)

### 1.1 공통 작성기 — `src/main/java/com/dmove/moveseye/common/export/` (신규)

| 파일 | 내용 |
|---|---|
| `TabularWriter.java` | 행 단위 스트리밍 작성기 인터페이스(`row`·`flush`·`finish`·`fail`) + `open()` 팩토리 |
| `CsvTabularWriter.java` | RFC 4180 · UTF-8 BOM · CRLF · NULL=빈 칸 · 🔴 수식 주입 방어(텍스트·JSON 칸만) · 절단/실패 `#` 표지 |
| `JsonlTabularWriter.java` | `_meta` 첫 줄 · `_end` 끝 줄(없으면 불완전) · `_error` · JSON 칸 중첩 · 값 불변 |
| `TabularFormat.java` · `TabularColumn.java` | 형식(csv/jsonl) · 열 이름 + 칸 종류(TEXT/INTEGER/DECIMAL/BOOLEAN/JSON) |
| `package-info.java` | 🔴 왜 `common`인가 — I7(premium 밖)과 공유하려면 premium에 둘 수 없다(ArchUnit A1) |

### 1.2 APM 내보내기 — `src/main/java/com/dmove/moveseye/premium/apm/export/` (신규)

| 파일 | 내용 |
|---|---|
| `ApmExportController.java` | `GET /apm/exports/{dataset}/plan`(JSON) · `GET /apm/exports/{dataset}`(파일). `@RequiresFeature(APM)` · `requireRead` · `@VisitorIdCheck` |
| `ApmExportService.java` | 원문 판정 → 동시 실행(Semaphore) → 계획 → 상한 → 헤더 → 스트림 → 실패 표지 → 감사 로그(`[APM-EXPORT]`, 원문은 WARN) |
| `ApmExportRequest.java` | 🔴 엄격 검증(빈·역전 창 거절, step 60/300/3600만, 미래 끝은 지금으로 자름) |
| `ApmExportDataset.java` | 3종 + 열 정의(계약 §4). 스팬 제외 이유 주석 |
| `ApmExportPlanDto.java` | 계획 응답(실제 창·해상도·행 수·allowed·안내 문구·열) |
| `ApmExportProperties.java` | `app.apm.export.max-rows`(200,000) · `max-concurrent`(2) · `chunk-cells`(1,440) |
| `package-info.java` | 독립 세트인 이유·의존 방향 |
| `source/ApmExportSource.java` | SPI(plan / write) — 콜드 아카이브 `ArchiveSource`와 같은 모양 |
| `source/ApmExportPlan.java` · `ApmExportSink.java` · `ApmExportGrid.java` · `ApmExportCoverage.java` · `ApmExportTarget.java` | 계획 · 상한 2차 방어 싱크 · 칸 격자(화면과 동일 규칙) · 🔴 빈 칸 이유 · 대상 서비스 |
| `source/ApmRedSeriesExporter.java` | 칸마다 한 줄, chunk 단위 읽기, 전 서비스 = RED 수신 있는 서비스 |
| `source/ApmEndpointExporter.java` | route×method 합산(화면과 같은 원천), errors 건수 추가 |
| `source/ApmErrorGroupExporter.java` | 읽기 전용 트랜잭션 + fetchSize 500 커서, 스택은 view 경유, 보존 옵션 직접 읽기 |
| `source/package-info.java` | |

### 1.3 기존 파일 수정

| 파일 | 변경 |
|---|---|
| `engine-api/.../common/exception/ErrorCode.java` | `APM_EXPORT_INVALID` · `APM_EXPORT_TOO_LARGE` · `APM_EXPORT_BUSY` 추가 |
| `premium/apm/trace/errors/ApmErrorQueryService.java` | 🔴 `query()`의 필터 조립을 `windowFilter()`로 **추출**(동작 불변) + `countForExport` · `streamForExport` · `GroupExportRow` 추가 — 목록과 내보내기가 **같은 모집단**을 보게 SQL을 복제하지 않았다 |
| `src/main/resources/application.yml` | `app.apm.export.*` 블록(환경변수 `APM_EXPORT_MAX_ROWS` 등) |

### 1.4 테스트 (신규)

| 파일 | 건수 | 검증 |
|---|---|---|
| `common/export/CsvTabularWriterTest` | 9 | RFC 4180 왕복(따옴표·쉼표·CR/LF·한글), NULL/0 구분, 수식 주입(= + - @ 탭 CR), 음수 불변, NaN, JSON 칸, 열 수 불일치, 절단·실패 표지 |
| `common/export/JsonlTabularWriterTest` | 5 | _meta/_end, 중첩 JSON, 값 불변, 개행 이스케이프, 실패 시 _end 없음, 절단 |
| `common/export/CsvTestParser` | — | 작성기와 코드를 공유하지 않는 RFC 4180 파서(테스트 도우미) |
| `premium/apm/export/ApmExportRequestTest` | 8 | 누락·역전·미래 창, 모르는 dataset/format/step, service 필수·UUID, q 상한 |
| `premium/apm/export/ApmExportServiceTest` | 10 | 🔴 비관리자 원문 403(계획 전), 관리자도 기본 마스킹, 상한 초과 시 응답 미커밋·본문 0바이트, allowed=false, BUSY 429·허가 반납, CSV 헤더·노출 헤더·수식 방어, gzip+JSONL, 중간 실패 표지, 경합 절단 표지, 파일명 |
| `premium/apm/export/source/ApmExportCoverageTest` | 4 | DATA/NO_DATA, 1m 적재 여유 PARTIAL, 워터마크 NOT_ROLLED_UP, OUT_OF_RETENTION |
| `premium/apm/export/source/ApmRedSeriesExporterTest` | 8 | 🔴 빈 칸 vs 0, 창 정렬·행 수, 청크 읽기, 싱크 상한, 전 서비스 선정, 보존 승격, 미완 구간 |
| `premium/apm/export/source/ApmErrorGroupExporterTest` | 4 | 🔴 MASKED 스택(SQL 리터럴 → ?, 프레임 유지), RAW, 열 정렬, 서비스 소실 |
| `premium/apm/service/red/ApmExportGridParityTest` | 2 | 내보내기 격자 = 화면 격자(3 해상도) |
| `premium/apm/export/ApmExportIT` | 8 | **실 Postgres(5433) + 전체 웹 계층**: RED CSV(NO_DATA 빈 칸, envelope 미혼입), 계획 EP, 검증 실패 JSON(첨부 헤더 없음), 없는 서비스 404, 엔드포인트 CSV(route `'=cmd` 방어), 에러 그룹 JSONL.gz 마스킹/원문, 목록과 모집단 일치, 보존 옵션 읽기 |

---

## 2. 조사 결과

### 2.1 APM에 이미 있는 내보내기/다운로드

| 무엇 | 어디 | 이번 설계와의 관계 |
|---|---|---|
| Collector 설정 yaml 다운로드 | BE `POST /apm/collector-config`(text/yaml attachment, 오류만 JSON) · FE `ApmCollectorTokensTab`(`file-saver`) | "성공은 파일, 실패는 JSON envelope" 패턴이 **같다** — 이번 EP도 따랐다. 겹치지 않음 |
| Collector 바이너리 링크 | FE `ApmCollectorInstallTab`(외부 URL `href`) | 무관 |
| APM 리포트 PDF/이미지 저장 | FE 리포트 관리(클라이언트 렌더링) | 무관(데이터 내보내기 아님) |
| 비용 템플릿 CSV | BE `GET /costs/hw/template`(UTF-8+BOM) · FE `cost.api.ts`(blob + JSON 분기) | **같은 규칙**(BOM·blob 분기)을 채택 — FE가 그 패턴을 재사용하면 된다 |

→ **APM 데이터(시계열·표)를 파일로 받는 기능은 없었다.** 모순되는 기존 규칙 없음.

### 2.2 "export 10000 vs 15000" 불일치 — 🔴 이 기능과 **무관**

- 정체: **OTel 메트릭 전송 주기** `OTEL_METRIC_EXPORT_INTERVAL`(ms). Live 설계(`devdesign_apm-live.md` §1)는 10000(10초)을 "안내해야 한다"고 적었고, 설치 가이드 코드(`ApmInstallGuideService` Java env)는 15000을 "선택"으로 낸다.
- 근거: `guides/apm-handbook/12-operations.md` 88행 · `13-verification.md` 불일치 #6 · BE `ApmLiveProperties`(권장 10초 주석) · `ApmRollupService`(15초 주석).
- 데이터 내보내기의 행 상한과는 이름만 겹친다(여기 상한은 `max-rows` 200,000). 결정은 여전히 열려 있다(메모리 추천 15000) — 이번 작업에서 건드리지 않았다.

### 2.3 권한·원문 축

- 조회: `ApmAccessChecker.requireRead`(apm.view) — 내보내기도 같은 칸. 파일이 조회 권한을 넓히지 않는다.
- 원문: `ApmAccessChecker.canViewRawText`(ADMIN ∪ SUPER_ADMIN, 역할 축). 내보내기는 **명시 요청 + 관리자**에서만 원문. 🔴 화면보다 엄격한 이유와 발견한 틈은 §5 #3.

### 2.4 대상 원천·보존

| 데이터셋 | 원천 | 조회 서비스(재사용) | 보존 |
|---|---|---|---|
| RED 시계열 | `apm_metric_1m/5m/1h` | `ApmMetricStore.redSeries`·`gaugeSeries` | 7 / 30 / 400일(승격) |
| 엔드포인트 | 같음 | `ApmMetricStore.routeTable` | 같음 |
| 예외 그룹 | `apm_error_group` + `_1h` | `ApmErrorQueryService`(필터 추출·메서드 추가) | `_1h` 90일(옵션 `errorGroup1hDays`) · 본체 마지막 발생 90일 |
| (제외) 스팬·요약 | `apm_span`·`apm_trace_summary` | — | 7일 |

---

## 3. 🔴 FE 작업 목록 (ZM-152 FE 작업이 끝난 뒤 착수)

| # | 화면 | 필요한 것 | 비고 |
|---|---|---|---|
| F1 | `services/api`: `apm.api.ts` + `types/apm.ts` | `getExportPlan(dataset, params)`(JSON) · `downloadExport(dataset, params)`(blob, `application/json`이면 `ApiEnvelopeError`) · `TApmExportPlan`·`TApmExportDataset`·`TApmExportParams` 타입 | 패턴은 `cost.api.ts downloadTemplate`. 🔴 언랩 깊이 규칙(메모리 fe-usedmovequery-unwrap) 확인 |
| F2 | 공용 컴포넌트 `components/apm/ApmExportButton`(가칭) | 버튼 → 모달: 데이터셋(화면별 고정 또는 선택)·형식(CSV 기본/JSONL)·gzip 체크·해상도(자동/1분/5분/1시간, red-series만)·(관리자만) "원문 포함" 체크 + 경고 문구 → 계획 조회 → 행 수·실제 기간·`notes` 표시 → `allowed=false`면 다운로드 비활성 → 다운로드(`saveAs(blob, plan.filename)`) | 기간은 화면의 `useApmTimeRange()` 값을 그대로. 원문 체크박스는 **관리자에게만** 노출(비관리자는 403이 난다) |
| F3 | 서비스 상세 › **개요 탭**(`ApmServiceOverviewTab`) | "RED 내보내기" 버튼(`red-series`, service=현재 uid) | |
| F4 | 서비스 상세 › **트랜잭션 탭**(`ApmServiceTransactionsTab`) | "엔드포인트 내보내기"(`endpoints`, service 필수) | ⚠️ 파일의 오류율은 요청 0건이면 빈 칸(화면은 0%) — 모달 안내 한 줄 |
| F5 | **에러 메뉴**(`errors/ApmErrorsPage` 또는 `ApmErrorExplorer` 툴바) + 서비스 상세 › 에러 탭 | "예외 그룹 내보내기"(`error-groups`, 검색어 `q`·서비스 필터 전달) | 원문 체크는 관리자만. `countFromMs` 안내(1시간 단위 근사) |
| F6 | **APM 개요**(`overview`) (선택) | "전체 서비스 RED 내보내기"(service 생략) | 행 수가 쉽게 커진다 → 계획에서 `allowed=false`가 자주 뜰 것. 해상도 선택을 앞세울 것 |
| F7 | 오류 문구 i18n(`kr.json`) | `APM_EXPORT_INVALID`·`APM_EXPORT_TOO_LARGE`(data.rows/maxRows 보간)·`APM_EXPORT_BUSY`(잠시 뒤 재시도) | |
| F8 | 도움말(`page_guide.apm_*`) | 빈 칸의 뜻(`coverage` 5종)·CSV `'` 접두·JSONL `_end`·원문 기본 마스킹 | ZM-152(화면이 스스로 설명하게)와 문구 톤 맞출 것 |
| F9 | 테스트 | api 계층(blob JSON 분기), 버튼 모달(계획 → allowed=false 비활성 → 다운로드), 관리자/비관리자 원문 체크 노출 | 계약 픽스처 게이트 `npm run typecheck:contract`에 계획 DTO 추가 |

---

## 4. 테스트 결과

- 신규 테스트만: **58건 통과**(IT 8건 포함, skip 0 — 도커 PG 5433 실연결).
- 회귀(`:test --tests 'com.dmove.moveseye.premium.apm.*' --tests '*ArchitectureTest' --tests 'com.dmove.moveseye.common.export.*'`): **169개 클래스 · 1,961건 중 1,952건 통과, IT 9건 실패 → 단독 재실행에서 전부 통과**(2026-09-16 18:33 확인).
  - 🔴 실패 9건은 **공유 IT DB 충돌**이었다. 같은 시각(18:26)에 다른 세션(`moveseye-be-spring-p5` 워크트리)이 IT를 돌리고 있었고, IT는 도커 DB 안의 `moveseye_it`을 매번 지우고 새로 만든다. 증상: 라이선스 INSERT 중복 키, 있어야 할 컬럼 없음(`container_oom_at`), 시드 개수 8→9.
  - 실패했던 5개 클래스(`ApmSchemaIT` 20 · `LiveMetadataCacheIT` 14 · `ApmExportIT` 8 · `ApmJobRollupIT` 11 · `ApmMessagingJobQueryIT` 15)를 그 세션 테스트가 끝난 뒤 단독 실행 → **68건 모두 통과**.
  - ⚠️ 같은 DB를 여러 워크트리가 IT로 쓰면 이런 가짜 실패가 난다. 워크트리마다 IT DB 이름을 가르는 것이 근본 해결(별도 과제).
  - ✅ **전체 재실행(다른 세션 워커 종료 후): 1,961건 전부 통과 · 실패 0 · skip 0**(BUILD SUCCESSFUL 4m39s, `LicenseArchitectureTest`·`OtelArchitectureTest` 포함).
- 컴파일: `:compileJava`·`:compileTestJava` 통과(기존 경고만).
- 🔴 모든 빌드·테스트는 워크트리에서만 실행(master 작업 트리 미접촉).
- ~~⚠️ 런타임(:3000) 실측은 하지 않았다~~ → **09-22 실측 통과**(병합본을 포함한 실행 중 BE에 curl, 재기동 없음): 계획 EP·CSV BOM·JSONL gzip `_meta`/`_end`·실패 JSON envelope(HTTP 200)·해상도 승격·동시 3건 중 1건 `APM_EXPORT_BUSY` 429·관리자 `rawText`. 표는 FE 보고 [`zm-154_apm-data-export-fe.md`](ZM-154-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0-FE.md) §4.1. 미확인: 비관리자 403(계정 없음)·브라우저 저장·20만 행급 소요 시간.

---

## 5. 미결 · 사용자 결정 필요

| # | 항목 | 기본안(구현됨) | 결정이 필요한 이유 |
|---|---|---|---|
| 1 | 행 상한 20만 · 동시 2 | 프로퍼티로 조정 가능 | 서버 사양 기준 실측 없음(dev 1곳). 대형 고객사는 1분 RED 전 서비스 7일이 바로 넘는다 |
| 2 | 원문 내보내기 허용 여부 | 관리자 + 명시 요청 시 허용, WARN 로그 | 감사 체계가 없어 **로그로만** 남는다. 아예 막을지, 감사 테이블(ZM-156 Q8)을 먼저 만들지 |
| 3 | 🔴 **화면 원문 판정의 틈**(발견) | 내보내기는 항상 마스킹으로 회피 | `ApmRawTextPolicy`는 `keep_raw_sql=false`면 비관리자에게 저장값을 그대로 준다. **켰다가 끈** 설치본에는 켜져 있던 동안의 원문 스택·속성이 남아 있어 비관리자 화면에 원문이 보일 수 있다. 화면도 "항상 마스킹"으로 바꿀지 결정 필요(마스킹은 멱등이라 기술적 부담 작음) — 별도 이슈 권고 |
| 4 | 스팬·트레이스 요약 2차 | 제외 | 스팬 용량 실측이 선행(ZM-156 S0와 공유) |
| 5 | 감사 기록 | `[APM-EXPORT]` 로그 | 공통 감사 테이블 여부(ZM-156 Q8·ZM-155와 공유 결정) |
| 6 | 전 서비스 RED의 대상 | 창 안에 RED 수신이 있는 서비스만 | "숨김 서비스도 넣어야 하나" — 감사 요구에 따라 다름 |
| 7 | 엔드포인트 시간 칸별 표 | 창 합산 1종 | 요구가 있으면 새 SQL(route×bucket) + IT |
| 8 | 다중 노드 동시 실행 | 노드별 세마포어 | 전역 상한이 필요하면 `scheduler_lease` 같은 DB 잠금 |
| 9 | `ErrorCode`가 engine-api 모듈에 있다 | 그대로 추가 | 기존 관례를 따랐다(모든 APM 코드가 거기 있음) |

---

## 6. 커밋 시 참고

- 파일: §1의 신규 + 수정 3개. 🔴 `git add -A` 금지 — 워크트리에는 이 작업만 있다.
- 관례: `#ZM-154 [FEAT] APM 데이터 기간 지정 내보내기(CSV/JSONL) BE -09-16` (트레일러 없음)
