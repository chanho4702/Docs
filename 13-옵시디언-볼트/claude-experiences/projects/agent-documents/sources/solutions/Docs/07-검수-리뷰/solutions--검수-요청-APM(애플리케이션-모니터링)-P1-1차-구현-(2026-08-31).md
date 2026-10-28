# 검수 요청 — APM(애플리케이션 모니터링) P1 1차 구현 (2026-08-31)

> 코덱스 검수용. COLLAB.md §8. 구현은 Claude(에이전트 병렬), 검수는 Codex. **미커밋**(BE 메인 트리 + FE master, 커밋 전 승인 대기).

## 0. 범위·의도 한 줄
OTel Collector가 보내는 OTLP http/json **메트릭**을 받아 서비스 단위(RED·런타임·풀)로 저장·집계·조회하고, 알람을 Zabbix `history.push`로 배달하는 **P1 파이프라인 전 구간** + FE 화면(목록·상세 5탭·개요·알람 규칙). 설계 정본 `../designs/devdesign_apm.md` **v3.2**(실측 반영), WBS `../designs/devdesign_apm-screens-wbs.md`.

## 1. 실측 근거 (설계를 바꾼 것)
| 문서 | 핵심 |
|---|---|
| `../verification/r1_apm-collector-roundtrip.md` | Collector 0.159.0·javaagent 2.31.1 json OK. 🔴 **500은 exporter가 즉시 폐기**(503만 재시도) · exemplar `filteredAttributes`에 원문 SQL/IP → BE 폐기 · UpDownCounter는 delta 선호에도 CUMULATIVE → 포인트 단위 판정 · 정규 경계 4패밀리 · Java active_requests 플래그 불필요 · Collector `telemetry.metrics.readers` 형식 · R14 Collector 마스킹 체인 검증 |
| `../verification/r10_apm-zabbix-history-push.md` | `history.push` A안 성립. 🔴 아이템 생성 직후 push는 캐시 동기화 전 실패 → 재시도 · 응답은 항목 단위 error · 잘못된 타입은 NOT_SUPPORTED · `problem.get recent:true` 금지 · 매핑 키 태그 `apm_uid` |
| `../verification/e2e_apm-selfmonitoring.md` | 빈 DB+실 Collector+BE 자기 계측으로 **종단 성립**: 자동 등록→1m 적재→조회 API→롤업 5m→알람 평가→**데모 Zabbix에 호스트/아이템/트리거 실 프로비저닝·push ok**. 🔴 APM이 자기 자신의 500(`/hosts/manage/{hostid}`, Zabbix 미설정 DB)을 잡아 DEGRADED로 판정 |
| 픽스처 | `../_archive/data/apm-r1-fixtures/`(3라운드), BE `src/test/resources/otel/r1/`, 계약 표본 `src/test/resources/apm/contract/` |

## 2. 변경 범위
### BE `moveseye-be-spring` (전체 `:test` 최종 **2051 green**, IT 포함·skip 0 — 수집기 API 병합 직전엔 2070이었다. **테스트 수가 줄어든 경위(리팩터링 통합인지 누락인지) 확인 요망**)
| 영역 | 내용 |
|---|---|
| 선행 수정 | `FeatureInterceptor`가 `@LicenseExempt` 메서드를 건너뜀(OTLP가 403을 직접 내기 위함) · ArchUnit A3를 "premium 밖 Repository만 금지"로 정정(+Spring Data 상속 제외) · A5 허용을 클래스 목록(`AiMonitorOtlpController`·`ApmOtlpController`)으로, A5-c는 그 클래스의 `@LicenseExempt` 메서드 전수 검증 |
| `otel/` 공용 승격 | `aimonitor/otel/{OtlpMetricsParser,OtlpModels,ReceiveTokenService}` 이동 + `OtlpJson` 유틸 + **범용 리더** `OtlpMetricsReader`(`OtlpMetricPoint`·exponential→explicit 변환·exemplar traceId/spanId만) + `HistogramRebucketer`(선형 보간·percentile) + `CanonicalBounds`(4패밀리). `OtelArchitectureTest`(otel↛aimonitor/premium, premium↛aimonitor). **AI 컨트롤러 적재 실패 500→503 정정** |
| 스키마 | V38(`apm_*` 14테이블·파티션 3·시드·`apm_int_array_add`) · V39(`apm_setting.updated_by`) · V40(`apm_int_array_sum` 집계) · V41(알람 바인딩·전역 규칙 시드 2·잡 시드 2) |
| `premium/apm/` | `domain`(엔티티 12·리포지토리) · `store/ApmPartitionService` · `token`(발급 1회·회수·인증) · `setting` · `registry`(등록 엔진: (name,env) 정규화·UUID·모드 3종·unknown_service·otelcol 분류·캐시·경합) · `ingest`(`ApmOtlpController` 415/413/401/403/400/503·gzip·dedup, `MetricIngestPipeline` 결선, 전량 예외 시 503) · `metric`(허용목록·dims canonical/hash·route 상한·CUMULATIVE→delta·1m UPSERT·재버킷·드롭 카운터 flush) · `collector`(수집기 상태) · `batch`(롤업 1m→5m→1h 워터마크·파티션 유지·보존/자동 숨김) · `query`(`ApmMetricStore` SQL 컬럼 전개 벡터 합·퍼센타일/Apdex·상태 판정·가용성·런타임 대응표) · `api`(서비스·개요 EP 15) · `alert`(engine-api `ZabbixHistoryPush` 계약+engine-zabbix 구현·`ZabbixAlertBridge` 프로비저닝·평가 잡·규칙 CRUD/미리보기·드리프트 동기화 잡·zabbix-status 진단) |
| `premium/apm/collector/` (수집기 화면 API §8) | `GET /apm/collectors`·`/{id}/series`(센티널 JDBC) · `POST /apm/collector-config`(정본 템플릿 치환·토큰 자리표시·`keepRawSql`이면 `transform/sql` 정의+파이프라인 양쪽 제거·snakeyaml 키 트리 동일 검증) · `POST /apm/receive-tokens` `withConfig`(발급 응답에만 완성 yaml) · `GET /apm/install-guide`(os×stack 10조합·한국어 원문+안정 key·notices) · `GET /apm/ingest/drops`(+ROUTE_OVERFLOW 서비스별 — 적재 측 `metric_name`에 `@svc:<id>` 접미 추가) · `endpoints sort=route`. 🔴 `build.gradle.kts` `test.maxHeapSize=1g`(ArchUnit 임포트 OOM 실발생) |
| 리소스 | `src/main/resources/apm/collector-template.yaml`(정본, validate 통과) |

### FE `moveseyee_fe` (전체 jest 1782/1784 — 실패 2건은 선재 `TriggerFormDrawer`·`AiAssistantPage`; tsc·`typecheck:contract` 0)
라우트 13·SideNav 하위 6 노출·설정 ⚙ 2·글로벌 검색 13·브레드크럼 override·i18n `apm.*` · 공통 부품(`ApmToolbar`·`useApmTimeRange` URL 상태·C1 빌더 3종·히트맵/게이지 빌더·StatCard 스파크/대비) · API 클라이언트/타입/훅(계약 픽스처 게이트) · 화면: 서비스 목록(+온보딩 빈 상태)·상세(개요·트랜잭션·런타임·인스턴스·설정 탭)·**APM 개요**(도넛·StatCard×4 전일 대비·서비스×시간 히트맵·Top5·최근 알람)·**알람 규칙**(규칙 표+Drawer 폼+미리보기 markArea·발화 이력·Zabbix 상태 진단 탭). 최종 jest **1837/1839**. 브라우저 확인: 목록·상세 개요·트랜잭션 탭 **실데이터 렌더 확인**(`../_archive/screenshots/apm/`).

### 계약 문서
`../contract_apm.md` §1~§6(스키마·수신/토큰/설정/등록·적재·배치·알람) · `../contract_apm-read-api.md`(읽기 API·§6 FE 요청 결정·§7 구현 상태·§8 수집기 화면 API).

## 3. 🔴 불안한 지점 (검수 우선)
1. **`MetricIngestor`의 예외 흡수 경계**: 리졸버/스토어 예외로 저장 0이면 503(재시도)로 고쳤지만, **부분 실패**(일부 리소스만 예외)는 200 + WARN — 그 리소스 포인트는 exporter가 재전송하지 않는다. 의도된 절충인지 판단 필요.
2. **모노토닉 카운터의 `count` 컬럼은 `round(Δvalue)`** 산물이고 정본은 `sum`이다(§3 규약). 조회 계층이 `count`를 읽으면 조용히 틀린다 — `ApmMetricStore`가 규약을 지키는지 대조 필요.
3. **CUMULATIVE 히스토그램의 min/max**는 시리즈 전체 값(차분 불가) — delta 권고 설정에서만 정확.
4. **첫 관측 CUMULATIVE는 `time−startTime<120s`가 아니면 버린다**(`CUMULATIVE_FIRST_SKIPPED`) — 데이터 손실보다 부풀림 방지를 택한 결정.
5. **재버킷 오차**: 소표본(관측 6건)에서 p95 오차 최대 68% 실측 → `sampleWarning`(<20건) 배지로만 드러남. 흐리기/숨김 규칙은 미정.
6. **롤업 LAG 2분**: 늦게 도착한 1m 행은 5m/1h에 안 들어감(1m 원본은 정확). 최근 ~7분은 5m에 없어 가용성·상태 판정은 1m을 읽는다.
7. **알람 평가 잡이 프로비저닝 전부 실패 시 예외를 던지되 우리 이벤트 기록은 그 전에 끝난다** — 배달 실패 ≠ 판정 실패로 분리. 매 5분 ERROR 로그가 쌓이는 운영 소음은 검토 대상.
8. **가용성 시계열이 서비스 등록 전 구간을 STALE로 채운다**(E2E 발견 1) — 미수정.
9. **route 상한을 낮춰도 기존 캐시 집합은 줄지 않는다**(재기동 전까지).
10. **수집기 판정이 전역**(1m 행에 token_id 없음) — 수집기 여럿 중 하나만 끊기면 UNKNOWN 대신 STALE.
11. **ArchUnit A3 2차 정정**(Spring Data 상속 제외)·**FeatureInterceptor 면제 처리**는 라이선스 게이팅의 규칙 변경이다 — 구멍이 아닌지 독립 확인 요망.
12. `OtlpMetricsParser`(AI 전용 해석기)가 `otel/`에 있어 이름만 보고 재사용될 위험 — 문서·주석으로만 막음.
13. FE: `from`/`to` 쿼리 키가 다른 화면(초)과 공유되는데 APM만 ms(1e11 미만이면 초로 보고 보정) · 설정 ⚙ 메뉴에 라이선스 축 없음(미보유 고객에게도 APM 항목 노출→UpsellPanel) · `GlobalSearch`에 dedupe+`userRoleAdminOnly` 필터를 추가한 의도적 동작 변경 · 아주 작은 rps가 "0 rps"로 표기 · 개요 탭이 서비스당 조회 5건.
14. FE 알람 화면: 비관리자는 BE가 목록 조회까지 관리자로 막아 훅을 끄고 배너만 보임(사실상 빈 화면) · `recentAlerts`에 `thresholdUnit` 없어 kind→단위 파생 · Zabbix Problem 딥링크는 우리 `/event-alert/problem/{id}`로(같은 id 축) · 히트맵 색은 절대 기준(5% 시드).
15. BE 수집기 API: `drops.count`는 누적이고 `from/to`는 `lastSeenAt` 필터(시간축 없음) — 창을 주면 "폐기 없음"으로 오독 가능 · ROUTE_OVERFLOW 서비스별 분해는 규약 이전 행·삭제 서비스 제외 · `sc.exe`/`icacls` 명령은 미실행(문법만) · 생성 yaml로 otelcol 실기동은 미검증(단, 정본 템플릿 치환본은 E2E에서 기동 확인).
16. FE 로케일 사고: 한 에이전트가 `git checkout`으로 미커밋 kr/en.json을 날린 뒤 dist 번들에서 복원 — 최상위 키 890개 전량·APM 테스트로 누락 0 확인했으나 **기존 네임스페이스 하위에 넣은 키 중 테스트 미참조분**은 조용히 사라졌을 가능성이 이론상 남는다.

## 4. 검증/미검증
- 검증: BE 단위+IT(2070), FE jest·tsc·계약 픽스처 게이트, R1/R10/R11/R14(Collector측) 실측, self-monitoring 종단(수신→적재→조회→롤업→알람→Zabbix 프로비저닝·push), 브라우저 목록/상세 2탭.
- 미검증: FE 나머지 탭·개요·알람 화면 브라우저 렌더 · 다크모드 · Zabbix **알림 도달**(데모 서버에 우리 그룹을 조건으로 가진 액션 0 — 배지 동작만 확인) · 성능(6h/1m·서비스 20+) · 드리프트 동기화 잡 실행(daily) · 파티션 유지/보존 잡 실행(daily) · 다중 인스턴스 · .NET/Node/Python 계측(R12 잔여) · R14 BE측(PII 심은 요청) · 라이선스 만료 시나리오 QA(8.10).

## 5. 진행 중·잔여(P1)
- 잔여 P1: FE 7.9 수집기 화면(XL)·7.9b 만료 UX · 8.1~8.4 설치 가이드/고객 문서/도움말 13 · 8.6 QA · 8.10 라이선스 QA · 홈 위젯(P3).

## 6. 코덱스 지적 반영 (2026-08-31, `review_apm-p1_codex.md` 4건)

| 항목 | 지적 | 수정 | 파일 | 테스트 |
|---|---|---|---|---|
| 1 🔴 | `@RequestBody byte[]`가 본문 전체를 올린 **뒤에** 8MB를 검사 — 수신 경계의 하드 리밋이 아니었다 | `@RequestBody` 제거. ① `Content-Length`가 회선 상한을 넘으면 **한 바이트도 읽지 않고** 413 ② 본문은 `getInputStream()`을 상한 있는 `readBounded()`로 스트리밍 복사(넘는 순간 중단·413) ③ gzip 해제도 **같은** `readBounded()`(압축 폭탄 방어와 한 함수로 합침) ④ gzip 회선 상한 신설 `app.apm.otlp.max-compressed-bytes`(기본 2MB, 비압축은 `max-body-bytes` 8MB). 크기 검사는 여전히 인증(401)보다 앞 | `premium/apm/collector/ingest/ApmOtlpController.java` | `ApmOtlpControllerTest` +3: Content-Length 초과 시 **스트림 미개봉** 증명 · chunked(길이 미상) 스트리밍 중 초과 413 · gzip 압축 원문 초과 413. 기존 압축폭탄·정상 gzip·415·401·403 계약 전건 유지. `LicenseArchitectureTest` A5·A5-c green(엔드포인트→`receive()`→`licenseProvider.current()` 한 단계 위임 구조 보존) |
| 2 🟡 | 이름·키만 같은 기존 Zabbix 호스트/아이템을 소유 확인 없이 재사용 | 조회에 `selectTags: extend`를 넣고 `owner=moveseye-apm` 태그가 **없으면 재사용도 생성도 하지 않는다**. 바인딩에 `error="ZABBIX_OBJECT_NOT_OWNED: host 'MovesEye APM'(hostid …)"`(아이템은 `item '<key>'(itemid …)`)를 남기고 프로비저닝 실패로 처리 → 고객 객체에 push하지 않는다. 태그를 못 받아 왔으면 "남의 것"으로 판정(fail-safe) | `premium/apm/alert/bridge/ZabbixAlertBridge.java` | `ZabbixAlertBridgeTest` +3: 미소유 동명 호스트 → 실패·바인딩 error·`createItem`/`createTrigger`/`createHost` 미호출 · 미소유 동명 아이템 → 실패 · 소유 태그 있으면 재사용(멱등 유지). 기존 재사용 테스트 4건의 스텁에 소유 태그 추가 |
| 2 🟡 | (진단 노출) | `ZabbixStatus`/`ApmAlertZabbixStatusDto`에 **`notOwnedConflicts`** 추가 — 동명 미소유 호스트 1 + 우리 호스트 위의 `apm.*` 키 미소유 아이템 수. 미소유 호스트면 아이템 목록을 아예 조회하지 않는다. 진단 아이템 조회는 서버측 태그 필터를 걷고 받아서 가른다(필터를 걸면 남의 객체가 진단에서 사라진다) | `alert/bridge/ZabbixAlertBridge.java` · `alert/bridge/ApmAlertZabbixStatusDto.java` · `alert/rule/ApmAlertService.java` | `ZabbixAlertBridgeTest` +2(호스트 충돌·아이템 충돌), `ApmAlertRuleMvcTest` `$.data.notOwnedConflicts` 어서션 |
| 3 🟡 | 액션 진단이 태그**명** `owner`만 확인 → `owner=다른값`도 집계(거짓 양성) | Zabbix 조건 필드 의미를 코드 주석 표로 못박고(25=Event tag: `value`=태그명 / 26=Event tag value: `value2`=태그명·`value`=태그값) 26은 **`value2=owner` ∧ `value=moveseye-apm`** 일 때만 집계. 25(`value=owner`, 값 무관)도 우리 이벤트를 실제로 태우므로 함께 집계. 호스트 그룹 조건(0)은 그룹 id 대조 유지. 🔴 옛 코드는 26의 `value`를 태그명으로 읽어 사실상 "태그 **값**이 owner인 조건"을 세고 있었다 | `ZabbixAlertBridge.java` | `ZabbixAlertBridgeTest` +1: `owner=other`(26) 미집계 · `env=owner`(26) 미집계 · `owner=moveseye-apm`(26) 집계 · `owner` 존재(25) 집계 |
| 4 🟢 | 런타임 `logs/`가 미추적 | `.gitignore`에 `logs/` 추가. 기존 `*.log` 패턴이 안 걸린 이유는 **롤링본이 `.gz`로 끝나기 때문**(`moveseye.2026-08-20.0.log.gz`) — 디렉터리째 제외로 정정. `git check-ignore`로 확인 | `.gitignore` | — |

**검증**: `:test` 전량 **2060 green / 실패 0 / 신규 9건**(기준 2051 → 정확히 +9, 회귀 0). 대상 필터 `--tests "*premium.apm*" --tests "*License*Test" --tests "*Otlp*"` 611건도 green.

**이번 반영에서 남은 불안**
- 신규 상수 `app.apm.otlp.max-compressed-bytes`(2MB)는 **실측이 아니라 압축률 5~9배 추정에서 나온 값**이다. 정상 배치가 압축 후 수 KB라 300배 여유지만, 서비스·route가 크게 늘어난 설치본에서 상한에 닿으면 exporter는 413을 **재시도 없이 폐기**한다(조용한 손실). 상향은 설정 한 줄이지만 그 사실을 아는 사람이 있어야 한다.
- 소유 태그 검사는 **트리거에는 넣지 않았다**. `findTrigger`가 이미 `apm_uid`+`apm_service` 태그로 찾고 그 태그는 우리만 붙이므로 실질 위험은 낮다고 봤으나, 호스트·아이템과 판정 기준이 한 곳만 다른 상태다.
- `notOwnedConflicts`는 **BE만 추가했다** — FE 타입(`moveseyee_fe/src/types/apm.ts`)·`ApmAlertZabbixTab` 배지는 미반영이라 지금은 응답에만 있고 화면에 안 뜬다.
- 미소유 판정은 실 Zabbix **round-trip 미검증**이다. 특히 `host.get`의 `selectTags`가 태그 없는 호스트에 대해 무엇을 돌려주는지(빈 배열 vs 키 자체 없음)를 실측하지 않았다 — 둘 다 "미소유"로 떨어지므로 안전한 쪽이지만, 반대로 **우리 호스트인데 태그를 못 받아 오면 프로비저닝이 통째로 막힌다**. 실서버 1회 확인 필요.

## 7. 코덱스 검수 이후 추가분 (같은 날 저녁)
| 항목 | 내용 |
|---|---|
| 코덱스 지적 4건 | 전부 반영(§6). 3회차 E2E: 수정 jar로 실 Zabbix 재사용·push ok 확인(`e2e_apm-selfmonitoring.md` 3회차) |
| 사용자 요청 "차트 로우 데이터 표" | 기존 드릴다운 공용 3종(`ChartViewToggle`·`ChartTableView`·`useChartView`) 재사용, APM 차트 전부 표 전환(`apmChartTable.ts` 순수 빌더 5종). CSV는 기존 패턴에 없어 미도입 |
| 사용자 요청 "툴팁 가독성·줄바꿈" | `apmTooltip.ts` 공용 포매터(시각 첫 줄·시리즈 한 줄 flex·긴 라벨 break-all·null `—`·`confine`). ⚠️ `confine+appendToBody` 조합 브라우저 확인 필요 |
| 사용자 요청 "페이지별·차트별 상세 설명" | 정본 `../guides/apm-screen-chart-guide.md`(위젯 67·`?` 47쌍·FAQ 10) → FE page_guide 11 + `apm.chart_help.*` 삽입(진행) |
| 가이드 작성 중 발견 | 🔴 개요 StatCard "전일 동시간 대비" 라벨 vs BE `previous()`=직전 동일 길이 창 → FE 라벨 "이전 기간 대비"로 정정(BE 유지) · `rebucketed_hint` 문구 정정 · 목록 "24시간 추이"→"추이(선택 창)" · **오류율 임계 서비스별 덮어쓰기 미구현**(p95만 서비스 설정 사용) · STALE 연장 설정·4xx 포함 옵션은 설계만 — 잔여 |
| BE 잔여 | `notOwnedConflicts` FE 배지(진행) · `max-compressed-bytes` 2MB는 추정값 · 트리거엔 소유 태그 검사 없음(호스트·아이템만) |

