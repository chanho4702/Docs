# APM P1 런타임 QA — WBS 8.6 / 8.10 / 1.9 R12

- 일시: 2026-09-01
- 대상: BE 사본 `:3001`(커밋 `dbe9bc6`, dev, DB `dmove_apm`) / FE Vite `:5174` / Collector `otelcol-contrib 0.159.0`(:4317·:4318)
- 라이선스: PREMIUM 기간제(만료 28일 남음), features 에 APM 포함 — 화면 배너로 확인
- 계정: admin / ADMIN, `x-visitor-id` 필수
- 원칙: 판정은 **API 응답 + DOM 어서션**. 스크린샷은 시각 판정이 불가피한 항목만.
- 🔴 사용자의 `:3000`·`:5173`은 건드리지 않았다. 제품 코드 수정 0.

---

## 0. 요약표

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A-1 | 수집기 > 상태 탭(표·시계열·수신확인·폐기표) | **PASS** | 표 2행 UP/STALE, 파이프라인 차트, "수신 있음 배치23·저장303·폐기49" |
| A-2 | 토큰 발급 → 1회 노출 모달 → 재표시 불가 | **PASS** | closable=false·ack 체크박스 게이트·닫은 뒤 DOM에서 원문 소거 |
| A-3 | withConfig yaml + `otelcol validate` | **PASS** | 완성본/자리표시자 두 변형 모두 `validate` EXIT=0 |
| A-4 | config-defaults 기본값 주입(queueDir 등) | **PASS** | 6개 필드 일치, OS 토글로 queueDir 교체 확인 |
| A-5 | 설정 재생성 폼 | **PASS** | 자리표시자 경고 문구 정확 |
| A-6 | 설치 가이드 os×stack | **PASS**(D6) | 10조합 200, OS·스택별 내용 분기 |
| A-7 | 등록·설정 저장 PUT 왕복 | **PASS** | staleMinutes 5→9 반영·복원 |
| A-8 | 비관리자 읽기전용 | **미검증** | 비관리자 계정이 환경에 없음 |
| B-1 | 서비스 목록 | **PASS** | 실데이터 3행 |
| B-2 | 서비스 상세 5탭 렌더 | **PASS**(D2) | 개요·트랜잭션·런타임·인스턴스·설정 |
| B-3 | 표 전환 토글 / 카드 `?` Popover | **PASS** | 차트↔표 전환, 값 일치, Popover 본문 렌더 |
| B-4 | 가용성 스트립 | **FAIL** | 288칸 전부 배경색 없음(투명) — D3 |
| B-5 | 알람규칙 `effective` 배지 + 서비스 설정 탭 | **PASS** | 두 줄 + "전역 규칙 적용 중" 배지 실물 확인 — §5 |
| B-6 | 개요 화면 / 알람규칙 3탭 UI / 도움말 Drawer | **미완료** | §8 |
| C-1 | 토큰 회수 → 401 → 재발급 복구 | **PASS** | 401 Permanent error·데이터 폐기·재기동 복구 — §5 |
| C-2 | scope 위반 → 403 | **PASS** | RUM 토큰 → 403, 무토큰/오토큰 → 401 |
| C-3 | 라이선스 제거 → OTLP 403 → 복구 | **PASS** | OTLP 403·화면 잠금·재등록 완전 복구 — §5 |
| C-4 | 500 미발생(400/413/415) | **부분 PASS** | 인제스트 경로는 완벽. REST 관리 API는 메서드 오류 시 500 — D8 |
| D | R12 Node·Python 자동계측 실측 | **완료**(D1) | §6 |
| E | 배치·Zabbix 프로비저닝 | **PASS**(주의 1) | §7 |

발견 결함 8건: HIGH 1 / MED-HIGH 1 / MED 3 / LOW-MED 1 / LOW 2.

> **BE 수정 현황 (2026-09-01)** — 각 결함 항목 끝의 `→ 수정` 줄에 원인·파일·테스트가 있다.
> **완료(BE)**: D1(구 semconv 별칭 + 가이드 문구) · D2(백분위를 기록된 min/max로 검증 — 🔴 원인이 실측으로 **재확정**됐다: 이중 환산이 아니라 **SDK 기본 격자가 초 단위 값을 담지 못한 것**) · D5(완전 URL) · D6(PowerShell 단일) · D8(405·415).
> **FE 담당**: D3(가용성 스트립 색) · D4(i18n `{{value}}`) · D7(문구, 별도 세션에서 완료).
> 검증: `:test` **2186건 green**(기준 2157 + 신규 29, 회귀 0). 🔴 **런타임 재확인은 미실시** — 정적·단위 검증까지다.

---

## 1. 결함 목록

### 🔴 D1 [HIGH] Python 자동계측이 기본 설정에서 RED 지표를 전부 잃는다 — 그런데 설치 가이드는 "정상"이라고 적는다

- 현상: 공식 방식(`opentelemetry-distro` + `opentelemetry-bootstrap -a install` + `opentelemetry-instrument`)으로 띄운 Flask 앱이
  서비스로 **ACTIVE 등록되고 화면에 "정상"으로 뜨지만**, rps·오류율·p50/p95/p99가 전부 비어 있다.
- 원인: WSGI 계측(0.65b0)은 `OTEL_SEMCONV_STABILITY_OPT_IN=http` 가 없으면 **구 semconv `http.server.duration`**(ms)을 내보낸다.
  BE `ApmMetricAllowlist` 는 `http.server.request.duration` 만 인정하므로 전량 `NOT_ALLOWLISTED` 로 폐기된다.
  (`opentelemetry/instrumentation/wsgi/__init__.py` 596-614 의 `_report_old`/`_report_new` 분기)
- **우리 문서가 틀렸다**: `GET /apm/install-guide?os=linux&stack=python` 의 `app.restart` 노트가
  *"⚠️ Python 런타임 지표는 아직 수신 허용목록에 없습니다. HTTP·DB 지표는 정상입니다."* 라고 단언한다.
  실제로는 HTTP 지표도 안 들어온다. 가이드 전문에 `SEMCONV` 문자열은 **0건**이다.
- 재현:
  ```
  opentelemetry-instrument --service_name=qa-python python app.py     # 가이드 그대로, 추가 env 없음
  curl http://127.0.0.1:8802/ok        # 여러 번
  docker exec dmove-postgres-test psql -U postgres -d dmove_apm -c \
    "select reason, metric_name, count from apm_ingest_drop_stat where metric_name='http.server.duration'"
  # -> NOT_ALLOWLISTED | http.server.duration | 12
  ```
- 화면으로도 확인됨: 서비스 목록에서 `qa-python` = **정상(UP)** 인데 초당요청·오류율·p95 열이 전부 `-`.
  요약 카운터도 "정상 2"에 이 서비스를 포함한다.
- 영향: 고객이 우리 가이드를 그대로 따르면 "초록불인데 데이터가 하나도 없는" 서비스가 생긴다. 명백한 실패보다 나쁘다.
- 선택지: (a) 가이드에 `OTEL_SEMCONV_STABILITY_OPT_IN=http` 추가, (b) 허용목록에 `http.server.duration`(ms)을 단위 변환과 함께 추가.
- **→ 수정(2026-09-01, (a)+(b) 둘 다)**: `ApmMetricAllowlist`(구 이름 별칭 `http.server.duration`·`http.client.duration` → 신 이름, ms→s 배수, 구 속성 `http.method`·`http.status_code`·`http.target`·`net.peer.name` 폴백표) · `ApmDimsNormalizer`(속성 폴백 `lookup()`, 빈 문자열도 "없음"으로) · `MetricIngestor`(이름·단위·sum/min/max/bounds 환산을 적재 한 곳에서, 차분 키도 신 이름) · `ApmInstallGuideService`(Python·Node env에 `OTEL_SEMCONV_STABILITY_OPT_IN=http,database` 추가, "HTTP·DB 지표는 정상입니다" 단언 삭제, Python `active_requests` 메서드 빈 값 안내). 테스트: `ApmMetricAllowlistTest.LegacySemconvAlias`(4) · `MetricIngestorTest.LegacySemconv`(4) · `ApmInstallGuideServiceTest`(3).

### 🔴 D2 [MED-HIGH] 런타임 탭 "풀 대기 시간 p95" 가 유휴 풀에서 4.7초로 표시된다

- `GET /apm/services/{uid}/runtime?step=60` (1시간, 37포인트):
  - `poolWaitP95Ms` min=**4734** max=**4755**
  - `poolPending` min=0 max=0 ← 대기가 **한 번도** 없었다
  - `poolIdle` 9.5~10 / `poolMax` 10
- 대기자가 0인 풀의 p95 대기가 4.7초일 수 없다.
- 추정 원인: `db.client.connection.wait_time` 의 semconv 단위는 **초(s)** 다. 기본 explicit bucket 경계에서 모든 표본이
  첫 버킷 `(0, 5]` 에 들어가고, 그 버킷 안에서 선형보간하면 ~4.75(초)가 나온다 → ×1000 → 4750 "ms".
  폐기·변형 표에도 이 메트릭이 `REBUCKETED`(경계 재버킷 / "저장됨(변형)")로 잡혀 있어 버킷 내 해상도가 이미 사라져 있다.
- 영향: 건강한 시스템의 런타임 탭이 파국적인 DB 대기를 보여준다. 운영자가 오진한다.
- 같은 사유로 `db.client.connection.use_time` 도 REBUCKETED 상태다(현재 화면에는 미노출).
- **→ 원인 확정(2026-09-01, DB 실측으로 추정 정정)**: 이중 환산이 아니었다. 자바 에이전트는 이 메트릭을 **`unit="s"`(초)** 로 보내는데(같은 행 `create_time`의 `max=0.03`=30ms가 증거 — ms였다면 30µs로 커넥션 생성 시간일 수 없다), 버킷 advice가 없어 **OTel SDK 기본 경계 `[0,5,…,10000]`**(밀리초 스케일 격자)이 씌워진다. 그래서 전 관측이 `(0,5]`**초** 한 칸에 들어가고, A24가 `unit=s`를 보고 고른 `pool_s`(0.005~10초 15단) 격자로 **재버킷하면서 그 한 칸을 12칸에 균등 분배**한다 — 없던 분포가 만들어져 p95가 `(2.5,5]`초 구간에 앉는다(4763ms). `×1000`은 초→ms로 **정상**이었고, 격자가 값을 담지 못한 것이 본체다. 결정적 증거: 같은 행의 `max`가 **0.0035857초(3.59ms)** 로, **행 스스로가 자기 히스토그램을 반증**하고 있었다.
- **→ 수정**: `HistogramRebucketer.percentile(bounds, counts, p, observedMin, observedMax)` 신설 — 보간 결과가 **실제 기록된 `[min, max]`를 벗어나면** 그 격자는 해상도가 없다는 뜻이므로 관측 구간 위에서 같은 비율로 다시 잡는다(`min + p×(max−min)`). min·max는 추정이 아니라 SDK가 관측한 값이라 새 통계 모델을 만들지 않으며, 결과는 항상 실측 최댓값 이하·최솟값 이상이다(숨기지도 지어내지도 않는다). 단위 환산은 `ApmHistBoundsCatalog.Entry.toMillis()` **한 곳**으로 모아 경계와 같은 배수를 쓴다. 파일: `otel/histogram/HistogramRebucketer.java` · `core/metric/ApmHistBoundsCatalog.java` · `core/metric/ApmPercentiles.java` · `service/red/ApmSeriesQueryService.java`(HIST_P95가 min/max 전달) · `otel/histogram/CanonicalBounds.java`(POOL_MS를 "HikariCP 실측 ms 경계"라고 적은 **틀린 주석** 정정 — A24가 그 문장 위에 서 있었다). 테스트: `HistogramRebucketerTest`(4, R1 실측 격자 → p95 ≤ 5ms) · `ApmPercentilesTest`(2).
- **⚠️ 남은 것(별도 과제)**: 저장된 히스토그램의 **모양**은 여전히 재버킷으로 흩어져 있다(p95는 위 방어로 정상화됨). 근본 해결은 "소스보다 **촘촘한** 격자로는 접지 않는다(분할=날조, 병합만 허용)"인데, 그러려면 `apm_hist_bounds`의 UNIQUE를 `(bounds)` → `(bounds, family)`로 바꾸는 마이그레이션이 필요하다 — `pool_ms`(id 5)와 이 초 단위 관측 격자가 **숫자가 완전히 같아** 지금 구조에서는 같은 행에 충돌하고, 그러면 초 값이 ms로 읽혀 1000배 **작게** 뜬다(더 나쁜 방향). 스키마 변경이라 이번 범위에서 제외했다.

### 🔴 D3 [MED] 24시간 가용성 스트립이 통째로 안 보인다 (칸에 배경색이 안 칠해짐)

- `[data-testid="apm-availability-slot"]` 288칸이 DOM에 **정상 생성**되고 `data-tone`/`data-status`도 정확하다
  (`warning|STALE` 279칸, `good|UP` 9칸). 그런데 288칸 전부 `background-color: rgba(0,0,0,0)` 이고
  인라인 style이 `flex: 1 1 0%; min-width: 2px; border-radius: 1px;` 로 **background 속성 자체가 없다**.
- 즉 `backgroundColor: slot.tone ? toneColor[slot.tone] : undefined` 가 렌더 시점에 undefined로 평가된다.
  소스(`ApmAvailabilityStrip.tsx` 96-104)와 팔레트(`--health-good #1f9254`, `--health-warning #D46B08`, 둘 다 실제로 존재)는
  양쪽 다 정상이라 **톤→색 조회가 왜 비는지는 끝까지 좁히지 못했다**(미확정으로 남긴다).
- 스테일 번들 아님: 파일 mtime 15:31 < Vite 기동 16:30 이고, `ctrl+shift+r` 강제 새로고침 후에도 동일하게 재현된다.
- 재현: 서비스 상세 > 개요 > "24시간 가용성" 카드 — 큰 숫자와 각주만 보이고 띠 자리가 백지.
- **→ 수정(2026-09-01, `ApmAvailabilityStrip.tsx` 99-116 / 테스트 `src/__tests__/ApmAvailabilityStrip.test.tsx` 신설)**: 원인은 팔레트가 아니라 **React 인라인 style의 shorthand 충돌**이었다 — 한 style 객체에 `backgroundColor`(색)와 `background`(빗금)를 같이 넘기고 안 쓰는 쪽을 `undefined`로 뒀는데, React는 `undefined` 속성을 빈 문자열로 **지우고** 그 지우기가 뒤에 오는 shorthand `background`에서 일어나면 앞서 넣은 `background-color`까지 함께 날아간다. 배경을 `background` 한 속성으로 합쳐 해결. 브라우저 재확인(:5174): 288칸 `warning=rgb(212,107,8)`·`good=rgb(31,146,84)`(전부 채색, `rgba(0,0,0,0)` 0칸) — 스크린샷 `_archive/screenshots/apm/2026-09-01_D3_availability-strip-colored.png`.

### 🟡 D4 [MED] i18n `{{value}}` 미치환 — 수집기 3개 탭에서 "{{value}}분 전" 이 그대로 노출

- `apm.relative.*` 문구는 `{{value}}` 를 쓰는데(`kr.json`/`en.json` 555-558) 아래 3곳만 `count` 를 넘긴다:
  - `ApmCollectorStatusTab.tsx:169` — `t(\`apm.relative.${value.unit}\`, { count: value.value })`
  - `ApmCollectorRegistrationTab.tsx:115`
  - `ApmCollectorTokensTab.tsx:232`
- 나머지 6곳(서비스 목록·헤더·카드·인스턴스·상세개요·최근알람)은 `{ value: ... }` 로 올바르다.
- 실제 노출 위치: 수집기 표 "마지막 수신", 토큰 표 "마지막 수신", **폐기·변형 통계 표 43행 전부**.
- i18next에서 `count` 는 복수형 전용 예약어라 `{{value}}` 자리를 채우지 않는다.
  같은 함정을 `ApmAvailabilityStrip.tsx` 115행 주석이 이미 경고해 두었는데, 그 교훈이 수집기 탭에는 반영되지 않았다.
- "방금"(just now) 분기는 보간이 없어 멀쩡해서, 갓 띄운 환경에서는 증상이 안 보인다 — 그래서 지금까지 안 잡힌 것으로 보인다.
- **→ 수정(2026-09-01, 공용 헬퍼 `apmDisplay.ts`의 `apmRelativeText(t, iso)` 신설 + 호출 9곳 전부 교체 / 테스트 `src/__tests__/apmRelativeText.test.tsx` 신설)**: 원인은 `count`가 i18next 복수형 예약어라 `{{value}}`를 안 채우는 것. 호출부마다 `t()`를 직접 부르는 한 재발하므로 **`t` 호출 자체를 헬퍼로 흡수**해 보간 이름이 한 곳(`value`)에만 존재하게 했다. 기존 APM 테스트의 `t` mock이 보간을 흉내만 내(키만 돌려줌) 이 결함을 통과시켰으므로, 새 테스트는 **실제 `en.json` 문구 + 실제 보간**으로 렌더해 `{{` 잔존 0을 검사한다(되돌려 실패도 확인). 브라우저 재확인(:5174): 수집기 상태·토큰 탭에서 `{{` 0건, "28분 전"·"23시간 전" 정상 노출(등록 탭은 AUTO 모드라 표시할 행 자체가 0).

### 🟡 D5 [LOW-MED] 토큰 발급 응답의 `endpoint` 가 스킴·호스트 없는 경로다

- 요청 `{"withConfig":{"endpoint":"http://127.0.0.1:3001"}}` → 응답 `data.endpoint == "/apm/otlp"`.
- 같은 응답의 `configYaml` 은 `endpoint: "http://127.0.0.1:3001/apm/otlp"` 로 **정상**이다. FE는 BE가 준 값을 그대로 표시할 뿐(→ BE 결함).
- 발급 모달의 "수신 주소(endpoint)" 복사 칸이 `/apm/otlp` 만 담고 있다. 안내 문구가
  *"뒤에 /v1/metrics를 붙이지 마세요 — exporter가 스스로 붙입니다"* 라 이 값을 exporter에 그대로 넣으라는 뜻으로 읽히는데,
  yaml을 쓰지 않고 손으로 채우는 사용자는 반드시 실패한다.
- **→ 수정(2026-09-01)**: `ApmReceiveTokenService.resolveIssuedEndpoint()` 신설 — `withConfig.endpoint`가 있으면 그 주소, 없으면 `ApmCollectorProperties.endpointHint` 기준으로 **완전 URL**(`http(s)://호스트[:포트]/apm/otlp`)을 만든다. 규칙을 복사하지 않고 `ApmCollectorConfigGenerator.normalizeEndpoint`(→ `public`)를 그대로 불러 **yaml과 같은 값**임을 보장한다. 힌트가 URL이 아니어도 발급은 실패시키지 않고 경로로 폴백(+WARN). 파일: `collector/token/ApmReceiveTokenService.java` · `collector/token/ApmTokenIssuedDto.java`(@Schema) · `collector/config/ApmCollectorConfigGenerator.java` · 계약 `_workspace/features/apm/core/contract_apm.md` §2. 테스트: `ApmReceiveTokenServiceTest`(2).

### 🟡 D6 [LOW] Windows 설치 가이드가 셸을 섞어 쓴다

- `windows/python`·`windows/nodejs` 명령이 `pip install ... && opentelemetry-bootstrap ...` 처럼 `&&` 를 쓴다(cmd.exe 문법).
- 같은 OS의 `windows/dotnet` 단계는 PowerShell(`$module = (New-Object System.Net.WebClient)...`)이다.
- PowerShell 5.1에는 `&&` 가 없어 파서 오류가 난다. 어느 셸을 열어야 하는지 사용자가 알 수 없다.
- **→ 수정(2026-09-01)**: Windows 명령을 **PowerShell 5.1 단일**로 통일했다 — 구분자 `;`, 다운로드 `Invoke-WebRequest`(+`$ProgressPreference` 끄기), 디렉터리 `New-Item -Force`, 복사 `Copy-Item`, `%TEMP%`→`$env:TEMP`. 서비스 등록은 `sc.exe create`→**`New-Service`**(PowerShell 인자 파서가 `binPath= "\"…\""`의 따옴표를 한 번 더 먹어 "경로를 못 찾는 서비스"가 조용히 등록된다), 시작은 `Start-Service`. Windows 단계 **제목에 "(PowerShell)"** 을 붙였다 — 명령만 고치면 사용자는 여전히 cmd에 붙여 넣는다. Python 설치 명령의 `&&`도 windows에서만 `;`로 갈랐다. 파일: `collector/install/ApmInstallGuideService.java`. 테스트: `ApmInstallGuideServiceTest.windowsCommandsAreSingleShell`(5스택 전수 — `&&`·` & `·`%TEMP%` 없음) · `windowsTitlesNameTheShell` · `windowsUsesNewServiceAndIcacls`.

### 🟡 D7 [LOW] 서비스 설정 탭 안내문이 "1단계에서는 전역 규칙만 적용됩니다" 라고 하는데 사실이 아니다

- 그 문구 바로 아래 표가 **"이 서비스" 범위 규칙 행을 실제로 보여준다**.
- API로 서비스 범위 `ERROR_RATE` 규칙을 만들면 `source=SERVICE`, `effective=true` 로 **전역 규칙을 실제로 가린다**(§5-3 실측).
  즉 BE는 서비스 범위 규칙을 온전히 적용하는데 화면 문구만 "전역만"이라고 말한다.
- UI에 서비스 규칙 생성 경로가 없어서 생긴 표현으로 보이나, API를 쓰는 사용자·후속 개발자에게는 오해를 준다.
- **→ 수정(2026-09-01, `kr.json`/`en.json`의 `apm.settings.alert_rules_hint` 문구 치환 / 테스트 `ApmServiceSettingsTab.test.tsx`에 문구 회귀 검사 추가)**: "활성 서비스별 규칙이 있으면 그것이, 없으면 같은 종류의 전역 규칙이 적용됩니다('전역 규칙 적용 중' 배지 참고)"로 정정 — 같은 화면의 표가 이미 `effective`/`appliedRuleUid`로 그 동작을 그리고 있어 문구만 어긋나 있었다. 브라우저 재확인(:5174) 설정 탭에서 새 문구 렌더, "전역 규칙만" 문자열 0건.

### 🟡 D8 [MED] 지원하지 않는 HTTP 메서드가 405가 아니라 **500**을 낸다 (APM REST 전역)

- 존재하는 경로 + 잘못된 메서드 → 500:
  ```
  DELETE /apm/settings        -> 500   POST /apm/collectors     -> 500
  PUT    /apm/overview        -> 500   PUT  /apm/receive-tokens -> 500
  GET/PUT/PATCH /settings/license -> 500
  ```
- 반면 아예 없는 경로는 정상적으로 404다(`GET /settings/definitely-not-a-route` → 404).
- 즉 Spring의 `HttpRequestMethodNotSupportedException`(→405) 이 매핑되지 않고 전역 500 핸들러로 떨어진다. APM 전용이 아니라 공통 예외 매핑 구멍이다.
- 영향: (1) 클라이언트가 "서버 장애"로 오인한다, (2) 서버 에러 알람·로그가 오염된다, (3) 스캐너에 취약점처럼 보인다.
- 참고: **OTLP 인제스트 경로는 이 문제가 없다** — 거기서는 400/401/403/413/415를 정확히 낸다(§4). REST 관리 API 쪽만의 문제다.
- **→ 수정(2026-09-01)**: `common/exception/GlobalExceptionHandler.java`에 `handleMethodNotAllowed`(**실제 405** + `Allow` 헤더) · `handleUnsupportedMediaType`(**실제 415**) 추가. 원인은 짚은 그대로 — `HttpRequestMethodNotSupportedException`에 전용 매핑이 없어 catch-all(`Exception` → 500)이 먹었다. 형제 격인 `NoResourceFoundException`(404)은 이미 전용 매핑이 있었는데 이쪽만 빠져 있었고, `HttpMediaTypeNotSupportedException`(415)도 **같은 구멍**이라 함께 막았다.
  🔴 **200 + body code로 접지 않았다.** 이 레포의 "에러는 200"은 FE가 body `code`로 화면을 가르는 **비즈니스 오류** 규약이고, 메서드 불일치는 FE가 만들지도 않는 **프로토콜 오류**라 분기할 화면이 없다 — 같은 파일의 404 핸들러·catch-all(500)과 같은 판단이고 응답 바디 모양(`statusCode`·`message`)도 그 둘에 맞췄다. 실제 401만이 FE 자동 refresh 트리거라 405는 재로그인 루프를 만들지 않는다. OTLP 수신 경로도 **실제 405**여야 한다 — 200을 주면 exporter가 "받아졌다"로 읽고 그 배치를 큐에서 지운다.
  테스트: `GlobalExceptionHandlerTest`(3, Allow 헤더 유/무 포함) · `ApmCollectorApiMvcTest.wrongHttpMethodIsMethodNotAllowed`(MockMvc, `PUT /apm/install-guide`·`PATCH /apm/collectors`).

---

## 2. A. 수집기 화면

### A-1 상태 탭
- 수집기 표 2행: `501ef2a5…` 0.159.0 **정상**(방금) / `eca362d6…` **수신 끊김**. 큐 0, 샘플링 폐기 0.
- "전송 실패"는 두 행 다 `—`. 각주가 *"'—'는 0이 아니라 그 지표가 오지 않았다는 뜻"* 이라고 정확히 설명한다.
  실제로 `otelcol_exporter_send_failed_*` 는 실패가 한 번도 없어 Collector가 아예 노출하지 않았다(폐기표에도 없음) → **설계대로 동작**.
- 파이프라인 시계열: 받은 메트릭점 / 받은 스팬 / 받은 로그 / 보낸 메트릭점 / 전송 실패 / 큐 길이 6계열 렌더.
- **최근 60초 수신 확인**: `지금 확인` → 초록 배지 **"수신 있음 · 배치 23건 · 저장 303개 · 폐기 49개 · 마지막 수신 방금"**.
  `ApmIngestRecent` 쿼리는 버튼을 누르기 전까지 `disabled` 상태다(불필요한 폴링 없음 — 좋은 설계).
- 폐기·변형 통계: 누적 1338건, 사유 4종(미지원 신호 / 허용목록 밖 / 경계 재버킷 / 누적형 첫 관측 건너뜀). 값은 API와 일치.

### A-2 토큰 1회 노출 (핵심 보안 흐름) — 전부 통과
- 모달이 `closable={false} maskClosable={false} keyboard={false}` — X도 ESC도 마스크 클릭도 없다.
- `닫기` 는 **확인 체크박스**로만 열린다: *"토큰을 복사했거나 설정 파일을 저장했습니다."*
  클립보드 성공에 묶지 않은 것이 옳다 — 운영 서버가 HTTP면 `navigator.clipboard` 자체가 없어서, 복사 성공을 게이트로 삼았다면
  관리자가 모달에 갇혔을 것이다.
- 닫은 뒤 원문이 DOM에서 완전히 사라진다. `GET /apm/receive-tokens` 는 원문을 절대 주지 않는다(id·label·kind·scopes·시각·active만).
- 참고(UX, 결함 아님): yaml을 모달 안에 통째로 인라인해 모달 높이가 **3275px** 다. 확인 체크박스와 닫기 버튼이 맨 아래라
  사용자가 한참 스크롤해야 한다. 내부 스크롤 컨테이너를 두는 편이 낫다.

### A-3 yaml `validate`
```
otelcol-contrib.exe validate --config generated.yaml     # withConfig 완성본  -> EXIT=0
otelcol-contrib.exe validate --config placeholder.yaml   # ${RECEIVE_TOKEN}   -> EXIT=0
```
- 완성본: `endpoint: "http://127.0.0.1:3001/apm/otlp"`, `headers: { Authorization: "Bearer <원문>" }`,
  Windows 큐 경로 `"C:\\ProgramData\\moveseye\\otelcol-queue"` 이스케이프 정상.
- 자리표시자본도 `validate` 는 통과한다(= 문법은 맞고 런타임에 인증만 실패한다). 그래서 FE 경고가 중요한데 문구가 정확하다:
  *"인증 줄에 RECEIVE_TOKEN 자리표시자가 남아 있습니다. 그대로 배포하면 Collector는 기동에 성공한 채 인증에 실패하고,
  화면에는 '데이터가 안 온다'로만 보입니다."*
- 계약 메모: `POST /apm/collector-config` 는 JSON이 아니라 **raw text/yaml** 을 돌려준다
  (반면 `POST /apm/receive-tokens` 는 JSON의 `configYaml` 필드). 소비자가 헷갈릴 수 있는 지점.

### A-4 기본값 주입 (`GET /apm/collectors/config-defaults`)
| 필드 | config-defaults | 폼 |
|---|---|---|
| MovesEye 주소 | `https://moveseye.example.com` (endpointHint) | 일치 |
| 느린 요청 임계(ms) | 2000 | 일치 |
| 정상 트레이스 표본(%) | 2 | 일치 |
| 메모리 상한(MiB) | 512 | 일치 |
| 디스크 큐 경로(linux) | `/var/lib/moveseye/otelcol-queue` | 일치 |
| 디스크 큐 경로(windows) | `C:\ProgramData\moveseye\otelcol-queue` | **OS 토글 시 교체 확인** |
| 원문 SQL 보존 | settings.keepRawSql=false | "전역 기본값 (현재 끔)" |

### A-6 설치 가이드
- 2 OS × 5 스택 = **10조합 전부 200**. `collector` 6스텝(OS별 다운로드 URL 분기), `app` 3스텝(스택별 분기), `verify` 4, `notices` 5.
- Collector 스텝이 전용 계정 생성·`chmod 750/700`·systemd 유닛까지 포함해 실사용 가능한 수준이다.
- 결함은 D1(python 내용 오류)·D6(windows 셸 혼용).

### A-7 등록·설정 저장
```
GET  /apm/settings   staleMinutes=5
PUT  /apm/settings   staleMinutes=9   -> 200
GET  /apm/settings   staleMinutes=9, updatedAt 갱신 확인
PUT  /apm/settings   staleMinutes=5   -> 원복 완료
```
승인 대기(`/apm/services/pending`)·unknown(`/apm/services/unknown`) 은 registrationMode=AUTO 라 0건 — 빈 상태로 정상 렌더.

---

## 3. B. 화면 스모크

- **서비스 목록**: 3행. `moveseye-be` 정상 0.28rps / `qa-node` 수신끊김 0.02rps 16.47% 418.3ms / `qa-python` 정상이지만 지표 전부 `-`(→ D1).
- **상세 5탭**(P1 활성): 개요 · 트랜잭션 · 런타임 · 인스턴스 · 설정. 나머지 7탭은 "2단계/3단계/4단계" 배지와 함께 disabled — 이유가 보이는 좋은 처리.
- **트랜잭션**: 전체 81개, 엔드포인트/메서드/호출수/초당요청/p50/p95/오류율 정렬 가능. 경로가 템플릿으로 저장됨
  (`/apm/services/{uid}/endpoints`, `/auth/login`, `/event/bells` …) — 카디널리티 폭발 없음.
- **런타임**: `JVM` 배지 + 힙/논힙/GC(시간·횟수 이중축)/스레드/CPU/로드된 클래스/커넥션 풀/풀 대기 p95. 값 정상, 단 풀 대기 p95는 D2.
- **표 전환 토글(`ChartViewToggle`)**: 요청수 카드에서 표로 전환 → `시각 / 초당 요청` 스크롤 표, 값이 차트와 일치. 되돌리기도 정상.
- **카드 `?` Popover**: 제목 + 본문 렌더 확인(예: 요청수 — *"구간마다 초당 처리한 요청 수. 요청이 없던 구간은 0입니다. HTTP 서버 요청
  히스토그램의 건수를 시간 구간(step)으로 나눈 값입니다…"*). 호버 툴팁과 클릭 팝오버가 첫 줄을 중복 표시하는 점은 사소한 UX 중복.
- **가용성 스트립**: D3으로 **FAIL**.

---

## 4. C-4 오류 경로 (500 미발생)

| 입력 | 기대 | 실제 |
|---|---|---|
| 깨진 JSON | 400 | **400** `{"error":"malformed json"}` |
| `Content-Type: application/x-protobuf` | 4xx | **415** `{"error":"unsupported content type","hint":"use otlphttp exporter with 'encoding: json' (protobuf/grpc is not accepted)"}` |
| raw 9MB 본문 | 413 | **413** `{"error":"payload too large"}` |
| gzip → 3MB 해제 | 통과 | **200** (상한 8MB 미만이라 정상) |
| gzip → 9 / 30 / 100MB 해제 | 413 | **413** 전부. 응답이 즉시 와서 **완전 해제 전에 차단**됨(zip bomb 방어 동작) |
| RUM scope 토큰으로 metrics 인제스트 | 403 | **403** `{"error":"token not allowed to ingest"}` |
| 토큰 없음 / 잘못된 토큰 | 401 | **401** `{"error":"invalid receive token"}` |

**OTLP 인제스트 경로에서는 500이 한 번도 발생하지 않았다.** 해제 후 크기 상한이 raw 상한과 동일(8MB)하게 걸린다.
과제에 적힌 "gzip 원문 2MB 초과 → 413" 기대치는 실제와 다르다 — 실제 임계는 8MB이며, 그 자체는 일관되고 합리적이다.

⚠️ 단, **REST 관리 API는 다르다**: 지원하지 않는 메서드로 부르면 405가 아니라 **500**이 난다(D8).
따라서 "APM에서 500이 안 난다"고 말할 수 있는 범위는 **인제스트 경로에 한정**된다.

---

## 5. C. 라이선스·토큰 시나리오 (WBS 8.10)

### 5-1. C-1 토큰 회수 → 수신 정지 → 재발급 복구 — **PASS**

1. 회수 전: `POST /apm/otlp/v1/metrics` → 200. 수집기 표 id=2 **정상**.
2. `DELETE /apm/receive-tokens/1` → 200.
3. 약 40초 뒤 Collector 로그에 인증 실패가 나타났다. **재시도 없이 즉시 폐기**한다:
   ```
   error internal/queue_sender.go:62  Exporting failed. Dropping data.
     "otelcol.component.id": "otlphttp/moveseye", "otelcol.signal": "metrics",
     "error": "not retryable error: Permanent error: rpc error: code = Unauthenticated
               desc = ... responded with HTTP Status Code 401",
     "dropped_items": 79
   ```
   metrics·logs 양쪽 파이프라인에서 반복 발생. 한 배치에 **79건이 그대로 소실**됐다 —
   설정 템플릿 주석의 경고("BE가 401/403/413을 주면 exporter는 재시도 없이 즉시 폐기한다")가 실측으로 확인된다.
4. 복구: 새 토큰 발급(`selfmon-collector-2`, id=5) → yaml의 `Authorization` 줄만 교체 → `validate` OK → Collector 재기동.
   ```
   service@v0.159.0/service.go:282  Everything is ready. Begin running and processing data.
   ```
5. 복구 확인: `GET /apm/collectors` 에 id=3 `selfmon-collector-2` **UP**(lastSeenAt 갱신),
   `GET /apm/ingest/recent` → `received:true, batches:8, points:77`.

> 관찰: 재기동하면 Collector의 `service.instance.id` 가 새로 생겨 **수집기 표에 새 행이 추가**되고 옛 행은 STALE로 남는다.
> 설계상 자연스러운 동작이지만, 재기동을 반복하면 표에 유령 행이 쌓인다(현재 3행 중 2행이 죽은 인스턴스). 정리 정책이 필요해 보인다.

### 5-2. C-3 라이선스 제거 → 차단 → 재등록 복구 — **PASS**

| 단계 | OTLP 인제스트 | APM 조회 API | 화면 |
|---|---|---|---|
| 제거 전 | 200 | 200 | 정상 |
| `DELETE /settings/license` | — | 응답 `state:NONE, mode:LOCKED, allowsLiveQuery:false` | — |
| 제거 후 | **403** `{"error":"APM feature not licensed"}` | **403** `errorCode:"LICENSE_REQUIRED"` | **잠금 화면** |
| 재등록 후 | **200** | **200** (services 3건 정상) | 정상 |

- 잠금 화면 문구: *"라이선스가 필요합니다 / 제품을 사용하려면 라이선스 키를 등록해야 합니다. 발급받은 .lic 파일을 올리거나 키를 붙여넣어 주세요.
  / 라이선스 등록하기 / 로그인과 라이선스 등록은 잠금 상태에서도 사용할 수 있습니다."* — 설계 P18(라이선스는 인증 뒤)과 일치한다.
- 재등록 결과가 제거 전과 **완전히 동일**하다: `state:EXPIRING, mode:FULL, edition:PREMIUM, features:[APM, DB_MONITORING, GPU_MONITORING], daysRemaining:28`.
  `jti` 는 최초 활성화 시각을 고정할 뿐 재등록을 막지 않는다(`LicenseService` 주석: "지웠다 다시 등록해도 기간이 늘지 않는다") — 그래서 이 검증이 안전했다.
- `features` 클레임은 키 안에서 `[]` 이고, PREMIEM 판정은 `editionDefaults` 로 채워진다(설계대로).

### 5-3. 알람 규칙 `effective` / `appliedRuleUid` 계약 — **PASS**

서비스 범위 `ERROR_RATE` 12.5% 규칙을 만들고 껐다.

| 상태 | `GET /apm/services/{uid}/alert-rules` 결과 |
|---|---|
| 규칙 **켬** | 2행 — SERVICE ERROR_RATE 12.5% `effective=true` (전역 5%를 **가림**), GLOBAL P95 `effective=true` |
| 규칙 **끔** | **3행** — GLOBAL ERROR_RATE 5% `effective=true` / SERVICE 12.5% `enabled=false, effective=false, appliedRuleUid=…a1`(전역을 가리킴) / GLOBAL P95 |

화면(서비스 상세 > 설정 > "적용 중인 알람 규칙")도 그대로 렌더된다:
```
오류율        5%      5분  전역       켬  감시 중
오류율        12.5%   5분  이 서비스  끔  전역 규칙 적용 중   ← 배지
응답시간 p95  2000ms  5분  전역       켬  감시 중
```
꺼진 규칙 행이 사라지지 않고 "왜 안 도는지 + 대신 무엇이 감시 중인지"를 같이 보여주는 설계가 의도대로 작동한다.
검증 후 테스트 규칙은 `DELETE` 로 제거했고 전역 2건만 남은 것을 확인했다.

---

## 6. D. R12 — Node·Python 자동계측 실측

| | **qa-node** (Express + `auto-instrumentations-node`) | **qa-python** (Flask + `opentelemetry-instrument`, distro 0.65b0) |
|---|---|---|
| 등록 | ACTIVE 즉시(pending/unknown 안 거침, registrationMode=AUTO) | ACTIVE 즉시 |
| `runtimeFamily` | `unknown` | `unknown` |
| 저장된 메트릭 | `http.server.request.duration`, `http.client.request.duration` | `http.server.active_requests` **만** |
| `NOT_ALLOWLISTED` 폐기 | 없음 | **`http.server.duration`** (구 semconv, 12건) ← D1 |
| route 차원 | **있음·템플릿화**: `/ok` `/slow` `/err` `/items/:id` (원시 경로 아님) | 없음(duration 자체가 안 들어옴) |
| status 차원 | `status_class` `2xx`/`5xx` 파생 저장 | 없음 |
| `active_requests` | **없음** — 해당 `instrumentation-http` 빌드에 미구현 | 있음(단 `http.request.method` 가 빈 문자열) |

- **route 카디널리티 문제 없음** — Node는 템플릿(`/items/:id`)으로 정확히 들어온다. 원시 경로 폭주 아님.
- `runtimeFamily=unknown` 은 **설계상 예상된 값이지 회귀가 아니다**. `RuntimeSlotMap.familyOf()` 는
  `jvm.*` / `nodejs.`·`v8js.*` / `process.runtime.cpython.*` 접두로 판정하는데,
  (a) Node·Python 자동계측 기본 설치가 런타임 메트릭 패키지를 넣지 않고
      (각각 `@opentelemetry/instrumentation-runtime-node`, `opentelemetry-instrumentation-system-metrics` 를 별도로 넣어야 함),
  (b) `RuntimeSlotMap` 의 Node/Python 바인딩이 아직 전부 `ingestible=false` 다(코드 주석이 "미실측"으로 명시).
  두 스택이 실제로 보낸 이름은 전부 런타임 중립이라 판정할 재료가 애초에 없었다.
- 트레이스: 양쪽 다 스팬이 200으로 수락된 뒤 `SIGNAL_NOT_SUPPORTED` 로 폐기(누적 293건).
  "P1은 트레이스를 저장하지 않는다"는 설계대로 파이프라인이 끝까지 살아 있다는 뜻이다.

### 허용목록 확장 근거 (실측 폐기 목록)
| 메트릭 | 사유 | 우선순위 |
|---|---|---|
| `http.server.duration` | NOT_ALLOWLISTED | **Python 지원에 필수(D1)** |
| `jvm.memory.used_after_last_gc` | NOT_ALLOWLISTED | GC 압력 판단에 유용 |
| `http.server.request.body.size` / `http.server.response.body.size` / `http.client.request.body.size` | NOT_ALLOWLISTED | 대역폭 지표 |
| `jvm.class.loaded` / `jvm.class.unloaded` | NOT_ALLOWLISTED | 현재는 gauge(`classCount`)로 충분 — 낮음 |
| `jvm.cpu.time` | NOT_ALLOWLISTED | `cpuUtilizationPct` 로 대체 중 — 낮음 |

> 참고: 런타임 탭의 "로드된 클래스" 카드는 `jvm.class.loaded` 가 폐기되는데도 정상 렌더된다.
> 카드가 쓰는 값은 게이지 `classCount`(≈29.6k)이고 허용목록은 누적 카운터만 거부하기 때문 — **정상 동작이며 결함이 아니다**.

---

## 7. E. 배치·Zabbix

```
Scheduler 'apm_rollup' registered (every 5m)
Scheduler 'apm_alert_evaluate' registered (every 5m)
ApmRollupService : apm_metric_1m → apm_metric_5m 롤업 첫 실행 — 2026-08-31T17:55부터 시작한다
ApmRollupService : apm_metric_5m → apm_metric_1h 롤업 첫 실행 — 2026-08-31T17:00부터 시작한다
Scheduler 'apm_rollup' done in 102ms (5m=15 1h=15)
ZabbixAlertBridge : APM 알람 — 호스트 그룹 'MovesEye APM' 생성(groupid=55)
ZabbixAlertBridge : APM 알람 — 가상 호스트 'MovesEye APM' 생성(hostid=10758)
Scheduler 'apm_alert_evaluate' done in 930ms (rules=2 targets=2 values=2 fired=0 resolved=0 push(ok=0 wait=2 fail=0) provFail=0)
```
- `GET /apm/alert-rules/zabbix-status`: reachable=true, groupId=**55**, hostId=**10758**,
  itemsVisible=2, notSupportedItems=0, bindingSynced=0, **bindingPendingCache=2**, notOwnedConflicts=0.
- `push(ok=0 wait=2)` 는 Zabbix 서버 설정 캐시가 아직 새 아이템을 모르는 첫 사이클 상태였고, **세션 후반에 해소를 확인했다**:
  `itemsVisible=6, bindingTotal=7, bindingSynced=4, bindingPendingCache=3, bindingDrift=0, bindingMissing=0`.
  즉 캐시가 따라잡으면서 바인딩이 정상적으로 synced로 넘어간다 — 프로비저닝 경로에 문제 없음.
- 🔴 데모 Zabbix에 남긴 것 — 사용자 결정에 따라 **정리하지 않았다**:
  호스트 그룹 `MovesEye APM`(groupid **55**), 호스트 `MovesEye APM`(hostid **10758**), 아이템 2개.

---

## 8. 미완료 / 미검증 항목

| 항목 | 상태 | 사유 |
|---|---|---|
| APM 개요 화면(도넛·히트맵·Top5·최근알람) **브라우저 렌더** | 미완료 | `GET /apm/overview` 는 200이고 summary·heatmap(cells/ts/step)·slowestTop5·errorTop5·recentAlerts 구조를 **API로는 확인**했다. 화면 렌더만 미확인 |
| 알람 규칙 화면 3탭 UI(규칙/이력/Zabbix 탭 전환·생성 Drawer) | 미완료 | 규칙 계약 자체는 API+설정 탭으로 검증 완료(§5-3). 전용 화면의 탭 전환·Drawer UI만 미확인 |
| 도움말 HelpDrawer(page_guide) 탭별 전환 | 미완료 | 미실시 |
| A-8 비관리자 읽기전용 | 미검증 | 환경에 비관리자 계정이 없음(사용자 1명, ADMIN) |
| .NET 자동계측 | 미검증 | 머신에 dotnet 미설치 |
| 카드 `?` Popover 전수 | 부분 | 요청수 카드에서 동작 확인. 카드 18종 전수는 미실시 |

파괴적 시나리오(C-1·C-3)는 비파괴 검증을 모두 끝낸 뒤 마지막에 실행했고, **둘 다 완료 후 환경을 원상 복구**했다.
남은 것은 전부 "화면을 눈으로 더 본다"류이며, 계약·동작은 API 수준에서 확인된 항목들이다.

---

## 9. 검증했으나 결함이 아니었던 것 (오탐 방지용 기록)

- "로드된 클래스" 카드가 `jvm.class.loaded` 폐기에도 렌더됨 → 게이지 `classCount` 를 쓰므로 정상.
- red-series 차트가 중간에 끊겨 보임 / 트랜잭션 0건 / 수집기 표 빈 상태 → **전부 렌더 도중 읽은 것**.
  8~10초 대기 후에는 정상(81 엔드포인트 등). APM 화면은 쿼리가 많아 4초 대기로는 부족하다.
- gzip 3MB 수락 → 8MB 상한 미만이라 정상. 9/30/100MB는 413.
- "표본 부족" 배지 → BE가 `red-series.sampleWarning: true` 로 내려주는 값이고 FE가 그대로 반영. BE/FE 일치.
- 발급 모달의 닫기 버튼이 disabled → 클립보드 실패 게이트가 아니라 **확인 체크박스** 게이트. 의도된 안전장치.

---

## 10. 환경 메모

- BE가 사용자당 활성 세션을 하나만 유지하는 것으로 보인다 — 브라우저 세션과 curl 세션이 서로를 무효화해 간헐적 401이 났다.
  QA는 401 시 자동 재로그인하는 래퍼(`scratchpad/qa/api.sh`)로 우회했다.
  **제품 결함으로 단정하지 않는다**(토큰 갱신 경합일 수 있음, 미확정). 같은 환경에서 이어서 검증할 사람은 이 함정을 알고 시작해야 한다.
- 산출물 위치: 스크립트·yaml·응답 덤프 `…/scratchpad/qa/`, R12 샘플 앱·로그 `…/scratchpad/qa/r12/`.
  API 호출용 자동 재로그인 래퍼는 `…/scratchpad/qa/api.sh` (`./api.sh GET /apm/settings` 형태로 사용).

### 환경 최종 상태 (검증 종료 시점, 전부 살아 있음)
| 대상 | 상태 |
|---|---|
| 라이선스 | **원상 복구 완료** — PREMIUM / EXPIRING / mode=FULL / daysRemaining 28 (제거 전과 동일) |
| Collector | **재기동됨**(옛 PID 33012 → 새 PID 22576). 설정 `r1/collector-selfmon.yaml` 의 Authorization 줄만 새 토큰으로 교체. 원본은 `qa/collector-selfmon.yaml.bak` 에 백업 |
| 수신 토큰 | id 1 `selfmon-collector` **회수됨**(C-1) / id 2·3·4 테스트용 / **id 5 `selfmon-collector-2` 가 현재 가동 중인 토큰** |
| 알람 규칙 | 테스트 규칙 삭제 완료 — 전역 2건만 남음(원래 상태) |
| APM 설정 | `staleMinutes` 5로 원복 완료 |
| 서비스 | `moveseye-be` + R12가 만든 `qa-node`·`qa-python` 2개가 남아 있음 |
| R12 샘플 앱 | 계속 실행 중 — Node PID 26376(:8801), Python PID 38216(:8802). 정리하려면 `taskkill /F /PID <pid>` |
| 데모 Zabbix | **정리하지 않음**(사용자 결정) — 그룹 `MovesEye APM`(55), 호스트(10758), 아이템 6 |

🔴 다음 세션에서 Collector를 다시 손볼 때: 현재 유효한 토큰은 **id 5** 하나뿐이다. id 1은 회수되어 다시 쓸 수 없다.
