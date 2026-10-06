---
title: APM 데이터 기간 지정 내보내기 (ZM-154)
doc_type: feature
audience: [개발, QA, 운영, 기획]
status: review
owner: MovesEye 팀
baseline: 2026-09-28
source_of_truth: moveseye-be-spring `premium/apm/export/**`(`ApmExportController`·`ApmExportService`·`ApmExportRequest`·`ApmExportPlanToken`·`ApmExportProperties`·`ApmExportPlanDto`·`ApmExportDataset`·`source/*`)·`premium/apm/service/red/ApmEndpointFilter`·`common/export/*`·`application.yml` `app.apm.export.*`, moveseyee_fe `pages/application-monitoring/shared/components/ApmExportButton.tsx`·`ApmExportModal.tsx`·`shared/apmExport.ts`·`services/apm.api.ts`·`services/axiosInstance.ts`·`services/linkCallerSignal.ts`, 계약서 `C:/solutions/_workspace/contract_apm-data-export.md`(v1 + §v2), 설계 `C:/solutions/_workspace/designs/devdesign_apm-data-export.md`
reviewed_at: 2026-09-28
review_cycle: event-driven
deployment_scope: source
be_commit: 213d875 (master, v2. v1 `b2c564a`·`83cc85f` 포함)
fe_commit: 01b7b28 (master, v2. v1 `39ece8e`·`9735c02` 포함)
latest_flyway: 없음 — 이 기능은 마이그레이션을 추가하지 않았다
qa_evidence: BE v2 회귀(IT 포함) 2,100건·`ApmExportIT` 15건, FE jest 9스위트 178건, Codex 검수 BE v3·FE v3 승인. 런타임은 v1 BE EP curl 실측(09-22)만 — v2·브라우저 다운로드 미실시
---

# APM 데이터 기간 지정 내보내기

> **이 문서로 답할 수 있는 질문** — APM 화면의 "내보내기" 버튼은 어떤 데이터를 어떤 파일로 주는가? 계획(plan)과 다운로드 두 단계는 왜 있고 `allowed=false`면 무엇을 줄여야 하는가? `planToken`은 무엇을 고정하고 무엇을 고정하지 않는가? 파일이 비어 있거나 `# NOTE:`·`# TRUNCATED:`·`# ERROR:` 줄이 붙었을 때 무슨 뜻인가? 원문(마스킹 전) 스택은 누가 받을 수 있는가? `APM_EXPORT_BUSY`·`TOO_LARGE`·`INVALID`가 나면 운영자는 무엇을 확인하는가?

> 한 줄 요약 — **APM 화면에서 보던 기간의 RED 시계열·엔드포인트 집계·예외 그룹을 CSV 또는 JSONL(선택적 gzip) 파일로 받는다.** 파일을 만들기 전에 계획 EP가 실제 창·해상도·행 수를 알려 주고, 행 상한을 넘으면 파일을 시작하지 않는다. 원문 스택은 관리자가 명시했을 때만 나가고, 기본은 항상 마스킹이다. (Jira **ZM-154**)
>
> 🔴 **배포 상태** — 두 레포 모두 master에 커밋됐다. v1(`b2c564a`·`83cc85f` / `39ece8e`·`9735c02`)은 `origin/master`에 포함돼 있고, **v2(`213d875` / `01b7b28`)는 2026-09-28 기준 로컬 master에만 있다(미푸시)**. 이 문서의 표에서 `현재`는 **master 소스에 구현됨**을 뜻하며, v2는 어떤 런타임에서도 실측하지 않았다.

이 문서는 내부 독자(개발·QA·운영)를 위한 것이다. 사용자 안내 문구는 FE 로케일 `apm.export.*`(kr/en)와 BE 계획 응답의 `notes`(한국어)가 정본이다. 설계 결정의 상세 근거는 `_workspace/designs/devdesign_apm-data-export.md` §1 결정 표에 있다.

## 1. 사용자 목표와 범위

- 해결하는 문제: APM 데이터(시계열·표)를 파일로 받는 수단이 없었다. 화면은 페이지·정렬·시간 창에 묶여 있어 감사 자료·외부 분석용으로 "이 기간 전체"를 가져갈 수 없었다.
- 주 사용자: APM을 조회할 수 있는 사용자(`applicationMonitoring/apm` `view`). 원문 스택 반출은 관리자(`ADMIN`·`SUPER_ADMIN`)만.
- 포함:
  - 데이터셋 3종(경로 변수 `{dataset}`)

    | 데이터셋 | 한 줄의 단위 | 원천 | 정렬 |
    |---|---|---|---|
    | `red-series` | 서비스 × 시간 칸 | `apm_metric_1m/5m/1h`(`ApmMetricStore.redSeries`·`gaugeSeries`) | 서비스 → 시간 |
    | `endpoints` | route × method(창 전체 합산 한 줄) | 같은 원천(`ApmMetricStore.routeTable`) | route(대소문자 무시) → method |
    | `error-groups` | 창 안에 발생이 있는 예외 그룹 | `apm_error_group`(+`_1h`), 목록과 같은 `windowFilter` | 창 안 발생 수 내림차순, 동점은 `groupId` |

  - 형식: CSV(기본, UTF-8 BOM·CRLF·RFC 4180) / JSONL(`_meta` 첫 줄·`_end` 끝 줄). 둘 다 `gzip=true`면 `application/gzip`으로 압축 파일 그대로 저장(`Content-Encoding` 미사용).
  - 붙은 화면(FE `ApmExportButton` 사용처 5곳)

    | 화면 | 데이터셋 | 넘기는 값 |
    |---|---|---|
    | 서비스 상세 › 개요 탭(`ApmServiceOverviewTab`) | `red-series` | `service`=현재 uid |
    | 서비스 상세 › 트랜잭션 탭(`ApmServiceTransactionsTab`) | `endpoints` | `service`=현재 uid, 표의 검색어 `q`·메서드 `method`(v2) |
    | 에러 메뉴·서비스 상세 › 에러 탭(`ApmErrorExplorer` 공유) | `error-groups` | 툴바 서비스 필터(없으면 전체)·검색어 `q`. 에러 탭은 서비스 고정 |
    | APM 개요(`ApmOverviewPage`, F6·v2) | `red-series` | `service` 생략 = 창 안에 RED 수신이 있는 전 서비스 |

  - 시간 창은 화면의 `useApmTimeRange()` 값을 버튼을 누른 순간 고정한다(§4).
- 제외:
  - 스팬·트레이스 요약 데이터셋 — 용량 실측 전이라 1차에서 뺐다(설계 §2).
  - APM 개요의 `env` 필터 — 내보내기 EP에 `env` 파라미터가 없어 전체 서비스 RED 파일은 env 무관이다. 모달이 그 사실을 안내한다(§10 열린 항목).
  - 화면의 정렬·페이지·`otherRoutes` 수 — 파일은 전량이고 정렬은 위 표의 고정 순서다.
  - 엔드포인트의 시간 칸별 표(route × bucket) — 창 합산 1종만.
  - 감사 테이블 — 로그(`[APM-EXPORT]`)로만 남는다(§7).

## 2. 현재 상태

`부분` — 소스 구현·단위/IT·정적 검수는 v2까지 끝났다. v2는 런타임 실측이 없고, v1도 브라우저 다운로드와 비관리자 계정 경로는 확인하지 않았다.

| 영역 | 상태 | 근거 |
|---|---|---|
| BE 계획·다운로드 EP(v1) | 현재 | `ApmExportController`·`ApmExportService`, 09-22 curl 실측(§9) |
| BE 파라미터 형식 오류 통일(`APM_EXPORT_INVALID`) | 현재 | `83cc85f` — 컨트롤러가 문자열로 받고 `ApmExportRequest.parse`가 변환 |
| BE `endpoints` `q`·`method` 필터(v2) | 현재 | `ApmEndpointFilter`, `ApmExportIT`가 목록 `total` = 파일 행 수 단언 |
| BE 계획 고정 토큰 `planToken`(v2) | 현재 | `ApmExportPlanToken`, `ApmExportPlanTokenTest` 13건 |
| BE 보존 결손 헤더·CSV `# NOTE:`(v2) | 현재 | `ApmExportService.stream`·`retentionNote` |
| FE 버튼·모달·3화면(v1) | 현재 | `39ece8e`·`9735c02` |
| FE APM 개요 전체 서비스 RED·요청 중단·v2 연동 | 현재 | `01b7b28` |
| v2 런타임 검증(토큰 왕복·필터·헤더) | 계획 | BE 재기동 후 |
| 브라우저 실제 다운로드(저장·gzip·취소 시 `(canceled)`) | 계획 | 전용 계정 발급 후 |
| 스팬 데이터셋·`env` 파라미터·감사 테이블 | 보류 | §10 |

## 3. 데이터 원천과 소유권

| 데이터 | 원천 | 읽기 | 쓰기 | cache/동기화 |
|---|---|---|---|---|
| RED 시계열(`red-series`) | `apm_metric_1m`(7일)·`_5m`(30일)·`_1h`(400일) | `ApmRedSeriesExporter` → `ApmMetricStore.redSeries`·`gaugeSeries`, `chunk-cells`(기본 1,440칸)씩 | 없음(읽기 전용) | 캐시 없음. 보존 일수는 `ApmResolution`의 사본(실제 삭제 주체는 `apm_retention` 잡) |
| 엔드포인트 집계(`endpoints`) | 같은 테이블 | `ApmEndpointExporter` → `ApmMetricStore.routeTable`(route 상한에 묶여 계획 단계에서 전량 읽음) + `ApmEndpointFilter` | 없음 | 같음 |
| 예외 그룹(`error-groups`) | `apm_error_group` + `apm_error_group_1h` | `ApmErrorGroupExporter` → `ApmErrorQueryService.countForExport`·`streamForExport`(읽기 전용 트랜잭션, fetchSize 500 커서). 스택은 `ApmRawTextView` 경유 | 없음 | 보존 일수는 `scheduler_setting.options->>'errorGroup1hDays'`를 직접 읽음(없으면 90) |
| 서비스 이름·env | `apm_service` | 계획의 `services[]`·행의 `serviceName`(display_name 우선)·`env` | 없음 | 서비스가 사라진 에러 그룹 행은 빈 칸 |
| 계획 고정 토큰 | 서버 저장 없음 | HMAC 검증만 | 없음 | 다중 노드에서도 같은 `JWT_SECRET`이면 검증된다 |
| 내보내기 이력 | 애플리케이션 로그 `[APM-EXPORT]` | — | `ApmExportService.audit` | 테이블 없음 |

DB 스키마 변경은 없다(Flyway 마이그레이션 0건). 새 SQL은 보존 옵션 조회 1줄뿐이고, 나머지는 화면이 쓰는 조회 서비스를 재사용한다.

## 4. 사용자 흐름

### 4.1 정상 흐름 — 계획 → 다운로드 2단계

```text
[버튼] 누른 순간 창 고정: from=화면 from, to=min(화면 to, Date.now())
   ↓
[모달] 형식(CSV/JSONL)·gzip·해상도(red-series만)·원문(관리자 + error-groups만) 선택
   ↓  조건이 바뀔 때마다
GET /apm/exports/{dataset}/plan?…   → 실제 창·해상도(승격 태그)·행 수/상한·대상 서비스·적용 필터·파일 이름·notes 표시
   ↓  allowed=true일 때만 [내려받기] 활성
GET /apm/exports/{dataset}?…&planToken=<계획의 planToken>   (계획과 같은 파라미터 + 토큰)
   ↓
saveAs(blob, plan.filename) → 성공 토스트 → 모달 닫힘
```

- 계획은 파일을 만들지 않는다. `rows > maxRows`여도 계획은 성공(200)이며 `allowed=false`로 온다. 이때 FE는 내려받기 버튼을 잠그고 "내보낼 행이 N개로 상한(M개)을 넘어 내려받을 수 없습니다"와 데이터셋별 권유(전체 서비스 RED: 해상도를 1시간으로 올리거나 기간을 줄이거나 서비스 상세에서 받기 / 단일 서비스 RED: 해상도·기간 / 엔드포인트·에러 그룹: 기간·조건)를 보여 준다.
- 다운로드는 계획과 **같은 파라미터**에 `planToken`만 더한다. 계획의 `stepSeconds`를 `step`으로 되보내지 않는다(되보내면 파일 메타의 `requestedStepSeconds`·`stepEscalated`가 계획과 달라진다).
- 파일 이름·행 수는 계획 응답에서 쓴다. 응답 헤더는 교차 오리진 배포에서 못 읽을 수 있다.
- 전체 서비스 RED(APM 개요)는 해상도 선택을 모달 맨 앞 줄에 두고, "1분은 5분보다 5배, 1시간보다 60배 많은 행"이라는 이유를 적는다.
- 다운로드 요청의 axios timeout은 이 요청만 10분(`APM_EXPORT_DOWNLOAD_TIMEOUT_MS`), 공통 1분이 아니다.

### 4.2 취소·닫기·화면 이탈·계정 전환 — 요청 자체를 끊는다

| 경로 | 요청 중단 | 파일 저장 | 오류 안내 |
|---|---|---|---|
| 취소 버튼·X·Esc | `AbortController.abort()` 후 닫힘 | 안 함 | 없음 |
| 언마운트(메뉴 이동) | effect cleanup에서 abort | 안 함 | 없음 |
| 계정 전환(모달 열린 채) | `onSessionSwitch` → abort | 안 함(세션 epoch 비교도 함께) | 없음, 받는 중 표시 해제 |
| 중단이 응답 도착 뒤에 닿음 | — | `signal.aborted`·`closedRef`·epoch 검사로 폐기 | 없음 |

끊지 않으면 BE가 스트림을 끝까지 만들며 동시 실행 슬롯(§6)을 붙들어 다음 사람이 `APM_EXPORT_BUSY`를 본다. FE의 공통 axios 인터셉터는 원래 중복 요청 취소용으로 `config.signal`을 자기 controller로 **덮어써** 호출부의 signal이 요청에 닿지 않았다. v2에서 `linkCallerSignal`로 **이어 붙이기**로 바꿨다(§6.4).

### 4.3 계획 토큰이 맞지 않을 때(`APM_EXPORT_INVALID`) — 재계획

다운로드가 `APM_EXPORT_INVALID`를 받으면(만료·조건 불일치·변조·형식 오류 전부 이 코드 하나) 모달은 오류 대신 계획을 `refetch()`하고 "유효 시간이 지났거나 조건이 바뀌어 계획을 다시 확인했습니다…" 안내를 띄운다. **자동으로 이어 받지 않는다** — 새 계획의 행 수·해상도·`allowed`가 달라질 수 있어 사용자가 다시 누른다. 재조회도 INVALID면(예: 검색어 200자 초과) 기존 계획 오류 Alert가 뜨고 버튼이 잠긴다(루프 없음).

FE는 `planTokenExpiresAtMs`로 만료를 **선판정하지 않는다** — 클라이언트 시계가 서버보다 빠르면 새 토큰도 늘 "만료"로 보여 영영 받을 수 없다. BE의 INVALID가 정본이다.

### 4.4 v1 서버와 v2 FE가 섞였을 때 — 필터 내보내기 차단

v1 BE는 계획에 `planToken`이 없고 `endpoints`의 `q`·`method`를 **조용히 무시**한다. 그대로 받으면 필터가 빠진 전량 파일이 정상 파일처럼 저장된다. 그래서 FE는 `계획에 planToken 없음 + endpoints + q 또는 method 있음`이면 내려받기를 막고 "서버 버전이 낮아 검색어·메서드 필터를 적용한 내보내기를 지원하지 않습니다. 필터를 지우면 전체 엔드포인트를 내보낼 수 있습니다"를 보여 준다(`apmExportNeedsServerFilterSupport`). 필터가 없으면 v1 동작(토큰 없이 다운로드)이다. `error-groups`의 `q`는 v1부터 있던 조건이라 대상이 아니다.

### 4.5 권한 없음

- `apm.view`가 없거나 APM 라이선스가 없으면 계획·다운로드 모두 HTTP 200 + body `code: 403`(레포 전역 계약). 화면에는 버튼 자체가 APM 화면 안에만 있으므로 주소 직접 호출에서 나타난다.
- 비관리자가 `rawText=true`를 보내면 계획 EP에서도 403이다(계획으로 원문 여부를 탐색할 수 없다). FE는 비관리자에게 원문 체크박스를 아예 그리지 않고, state가 남아 있어도 `rawText: showRawText && rawText`로 요청에서 뺀다.
- 미인증은 실제 HTTP 401 JSON이다(2026-09-28 실측).

### 4.6 빈 데이터

- `red-series`: 행이 없는 칸도 한 줄로 나가되 수치 칸은 **빈 칸**이고 `coverage` 열이 이유를 말한다(`NO_DATA`·`PARTIAL`·`NOT_ROLLED_UP`·`OUT_OF_RETENTION`). `DATA`인데 요청 0건이면 `requests=0`, 오류율·지연은 빈 칸. 화면처럼 0으로 채우지 않는 이유는 수집 중단과 무트래픽을 구분하기 위해서다.
- `endpoints`·`error-groups`: 조건에 맞는 행이 없으면 헤더(CSV)·`_meta`/`_end`(JSONL)만 있는 파일이 나간다. 계획의 `rows=0`으로 미리 알 수 있다.
- 보존 결손: 창 시작이 보존보다 오래되면 계획 `retentionClipped=true` + `notes` 안내, 다운로드 응답 헤더 `X-Apm-Export-Retention-Clipped: true`, CSV 파일 끝 `# NOTE: retention-clipped …` 줄. FE는 저장 후 모달을 닫지 않고 "{기준 시각} 이전 구간은 비어 있거나 일부만 있습니다. 파일은 저장되었습니다"를 경고한다(헤더를 못 읽으면 계획의 `retentionClipped`로 대신, 기준 시각 없는 문구).

### 4.7 외부 시스템 오류

- DB 오류가 **본문을 쓰기 전**에 나면 JSON envelope로 나간다(§5.4).
- 스트리밍 **도중** 실패는 HTTP로 알릴 수 없다 — 파일 끝에 표지(CSV `# ERROR:` 줄 / JSONL `_error` 줄, `_end` 없음)를 남긴다. 브라우저는 "완료"로 저장하므로 받는 쪽이 표지를 확인해야 한다. FE 모달 안내(`csv_incomplete`·`jsonl_end`)가 이 규칙을 적는다.
- 연결이 끊긴 경우(클라이언트 중단)는 표지를 쓸 곳이 없어 로그(`outcome=client-aborted`)만 남긴다.

## 5. API 계약

| Method | Path | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| GET | `/apm/exports/{dataset}/plan` | 아래 쿼리 파라미터(`planToken`은 무시) | `ApiResult<ApmExportPlanDto>` JSON | 라이선스 `Feature.APM` + `apm.view`. `rawText=true`는 관리자 |
| GET | `/apm/exports/{dataset}` | 같은 파라미터 + `planToken` | 성공: 파일 본문 / 본문 전 실패: JSON envelope(HTTP 200 + body code) | 같음 |

두 EP는 `@VisitorIdCheck`라 헤더 `x-visitor-id`와 인증 쿠키가 필요하다. 그래서 FE는 `window.open`·`<a href>`가 아니라 axios(`responseType: "blob"`)로 받는다.

### 5.1 쿼리 파라미터(두 EP 공통, `planToken`만 다운로드 전용)

| 이름 | 타입 | 필수 | 규칙 |
|---|---|---|---|
| `from` | long(ms) | ✅ | 없거나 0 이하면 거절. 화면처럼 "최근 1시간"으로 접지 않는다 |
| `to` | long(ms, 배타) | ✅ | 미래면 **지금으로 자른다**. `from >= min(to, now)`면 거절 |
| `step` | int(초) | | `60`·`300`·`3600`만. 보존 밖이면 **승격**(응답 `stepSeconds`·`stepEscalated`). `error-groups`는 무시(항상 3600) |
| `service` | UUID | `endpoints`만 필수 | `red-series` 생략 = 창 안에 RED 수신이 있는 전 서비스, `error-groups` 생략 = 전 서비스 |
| `q` | string ≤200 | | `error-groups`: 예외 타입·정규화 메시지 부분일치. `endpoints`(v2): route 또는 method 부분일치, 대소문자 무시(트랜잭션 표와 같은 `ApmEndpointFilter`). `red-series`: **무시**(적용값 null) |
| `method` | string ≤32 | | `endpoints` 전용 — 다른 데이터셋에 주면 **거절**. 정확히 일치(대소문자 무시), `q`와 AND. 원문에 제어 문자(`Character.isISOControl`)가 있으면 먼저 거절 → 일반 공백(U+0020)만 앞뒤 제거 → RFC 9110 tchar(`^[!#$%&'*+.^_\`|~0-9A-Za-z-]+$`)여야 함. `" GET "`·`M-SEARCH`·`patch` 통과, `"GET\n"`·`"\tGET"`·비ASCII 거절 |
| `format` | `csv` \| `jsonl` | | 기본 `csv`. `ndjson`도 JSONL(`TabularFormat.fromWire`) |
| `gzip` | boolean | | `true`/`false`만(대소문자 무시). `on`·`yes`·`1`은 거절 |
| `rawText` | boolean | | 기본 `false`. `true`는 관리자만(아니면 403). 데이터셋과 무관하게 판정 |
| `planToken` | string ≤512(**원문 기준**) | | 다운로드 EP만. 계획 응답의 `planToken` 그대로. 상한 검사가 `trim`보다 먼저다(공백으로 우회 불가). 빈 문자열 = 안 보냄(v1 동작) |

빈 문자열·공백은 "안 보냄"과 같다. 숫자·boolean 형식 오류(`from=abc`·`step=1m`)도 전역 `INVALID_DATA`가 아니라 `APM_EXPORT_INVALID`로 나간다 — 컨트롤러가 전부 `String`으로 받고 `ApmExportRequest.parse`가 변환하기 때문이다(되돌리지 말 것, 컨트롤러 주석).

### 5.2 계획 응답 `ApmExportPlanDto`(`data`)

| 필드 | 뜻 |
|---|---|
| `dataset`·`format`·`gzip`·`filename`·`contentType` | 다운로드 응답과 같은 값. `filename` = `moveseye-apm_{dataset}[_{uid 앞 8자}]_{yyyyMMddTHHmmZ}_{…}.{csv\|jsonl}[.gz]`(서비스 이름 미포함) |
| `fromMs`·`toMs`·`fromAt`·`toAt` | **실제로 쓰는 창**. RED·엔드포인트는 칸 경계로 넓힌 값(시작 내림·끝 올림), `to`는 지금을 넘지 않음. ISO는 UTC |
| `stepSeconds`·`requestedStepSeconds`·`stepEscalated` | 실제 해상도 / 요청값(자동이면 null) / 보존 때문에 굵어졌는가 |
| `rows`·`maxRows`·`allowed` | 데이터 행 수(헤더·메타 제외. RED·엔드포인트는 정확, 에러 그룹은 그 사이 늘 수 있음) / 상한 / `rows <= maxRows` |
| `rawText` | 원문이 실리는가 |
| `retentionClipped`·`retentionDays` | 창 시작이 원천 보존보다 오래됨 / 판정에 쓴 보존 일수(1m=7·5m=30·1h=400·에러 그룹=옵션, 기본 90) |
| `incompleteFromMs` | 이 시각 이후는 적재·롤업 중일 수 있음(없으면 null) |
| `countFromMs` | 에러 그룹 발생 수를 센 실제 시작(정시 내림). 그 밖은 null |
| `services[]` | `{serviceUid, name, env}`. 에러 그룹 전 서비스면 `[]` |
| `columns[]` | 파일 열 이름(순서 고정) |
| `notes[]` | 한국어 안내 — 승격·보존·미완 구간·근사·상한·필터·CSV 수식 방어. FE가 그대로 보여 준다(영어 화면에서도 한국어) |
| `q`·`method`(v2) | **적용값**. `red-series`의 `q`는 보냈어도 항상 null. `method`는 `endpoints`에서만 값 |
| `planToken`(v2) | `v1.<payload>.<mac>` base64url, 약 150자. `allowed=false`여도 항상 채워진다 |
| `planTokenExpiresAtMs`(v2) | 발급 + `plan-token-ttl-seconds`(기본 30분) |

### 5.3 다운로드 성공 응답(HTTP 200)

| 헤더 | 값 |
|---|---|
| `Content-Type` | `text/csv; charset=UTF-8` · `application/x-ndjson; charset=UTF-8` · gzip이면 `application/gzip` |
| `Content-Disposition` | `attachment; filename="…"`(계획 `filename`과 같음) |
| `Cache-Control` | `no-store` |
| `X-Apm-Export-Dataset`·`-From`·`-To`·`-Step`·`-Rows`·`-Raw-Text`·`-Schema-Version` | 계획과 같은 값. Schema-Version은 **1**(열 이름·순서를 바꾸면 올린다. v2는 열 불변이라 그대로) |
| `X-Apm-Export-Retention-Clipped`(v2) | `true`\|`false` — **다운로드 시점** 판정(토큰 유무 무관, 항상) |
| `X-Apm-Export-Retention-Cutoff`(v2) | long(ms) = 다운로드 시각 − `retentionDays`일. 이보다 앞선 구간은 비어 있거나 일부만 |
| `Access-Control-Expose-Headers` | 위 헤더 전부 + `Content-Disposition`(이 응답에만, 전역 CORS 불변) |

파일 열(계약 §4, `ApmExportDataset`):

- `red-series`(19열): `serviceUid, serviceName, env, bucketStartMs, bucketStartAt, stepSeconds, coverage, requests, errors, rps, errorRatePct, p50Ms, p95Ms, p99Ms, apdex, activeRequests, rebucketed, mixedBounds, sampleWarning`. `errors`는 5xx만. 신뢰도 플래그는 칸마다.
- `endpoints`(19열): `serviceUid, serviceName, env, windowFromMs, windowToMs, stepSeconds, route, method, isOther, requests, errors, rps, errorRatePct, p50Ms, p95Ms, p99Ms, rebucketed, mixedBounds, sampleWarning`. `errorRatePct`는 요청 0건이면 빈 칸(화면은 0). `isOther`는 route 상한으로 접힌 `__other__` 행.
- `error-groups`(15열): `groupId, serviceUid, serviceName, env, exceptionType, messageNorm, windowCount, countTotal, firstSeenMs, firstSeenAt, lastSeenMs, lastSeenAt, sampleTraceId, endpointCounts, sampleStack`. `windowCount`는 정시 내림 창(`countFromMs`~`toMs`), `countTotal`은 보존 전체 합, `sampleTraceId`는 7일 뒤 만료, `endpointCounts`는 CSV에서 JSON 문자열·JSONL에서 객체, `sampleStack`은 기본 마스킹.

CSV 규칙: NULL은 빈 칸. 텍스트·JSON 칸이 `= + - @ 탭 CR`로 시작하면 앞에 `'`를 붙인다(수치 칸 제외). 정상 종료에는 표지가 없다. 파일 끝 표지는 데이터 행 **뒤**에 오며 순서는 `# NOTE: retention-clipped …`(결손일 때만) → `# TRUNCATED: …` 또는 `# ERROR: …`(마지막 줄).

JSONL 규칙: 첫 줄 `{"_meta":{schemaVersion, source, dataset, fromMs, toMs, fromAt, toAt, stepSeconds, requestedStepSeconds, stepEscalated, plannedRows, masked, retentionDays, retentionClipped, incompleteFromMs, countFromMs, q, method, retentionCutoffMs, planPinned, timezone, exportedAt}}` → 데이터 행 → 끝 줄 `{"_end":{"rows":N,"truncated":false}}`. **`_end`가 없으면 불완전한 파일**이다. 값은 바꾸지 않는다(수식 방어 없음). v2에서 추가된 `_meta` 키는 `q`·`method`(적용값)·`retentionCutoffMs`·`planPinned` 넷이다.

### 5.4 본문 전 실패 — HTTP 200 + JSON envelope

| body `code` | `errorCode` | 언제 | `data` |
|---|---|---|---|
| 400 | `APM_EXPORT_INVALID` | 모르는 dataset·format·step, 창 누락·역전·미래 시작, `service` 형식·`endpoints` 누락, `q` 200자 초과, 숫자·boolean 형식 오류, `method` 규칙 위반·타 데이터셋 사용, `planToken` 형식·서명·버전·길이(512)·만료·파라미터 불일치·(방어) 고정했는데 원천이 다른 창 계산 | — |
| 400 | `APM_EXPORT_TOO_LARGE` | `rows > maxRows` | `{rows, maxRows}` |
| 429 | `APM_EXPORT_BUSY` | 노드 동시 실행 수 초과(기본 2) | — |
| 404 | `APM_SERVICE_NOT_FOUND` | 없는 service | — |
| 403 | `FORBIDDEN` | `apm.view` 없음 / 비관리자 `rawText=true` | — |
| 403 | (라이선스 잠금) | APM 기능 없음 | 기존 라이선스 계약 |
| 401 | — | 미인증(실제 HTTP 401) | — |

**판정 순서**: 라이선스 → `apm.view`(403) → 파라미터·토큰 검증(400) → 원문 관리자 판정(403) → 동시 실행(429) → 상한(`TOO_LARGE`). 비관리자가 `rawText=true`와 틀린 토큰을 함께 보내면 403보다 400이 먼저다(토큰 검증은 파라미터만 보므로 정보 노출은 없다). v2는 **새 `errorCode`를 만들지 않았다** — FE는 `APM_EXPORT_INVALID`면 계획 재조회 하나로 처리하고, 만료·불일치 구분은 한국어 `message`에만 있다(FE는 그 message를 보이지 않는다).

FE 판정: `downloadExport`는 blob의 `type`이 `application/json`을 포함하면 envelope로 파싱해 `ApmExportError`(`ApiEnvelopeError` + `data`)를 던진다. `TOO_LARGE`는 `data.rows/maxRows`를 문구에 보간하고, `BUSY`는 "잠시 뒤 다시 시도", `INVALID`는 재계획(§4.3), 403·404·네트워크는 공통 판정이다.

## 6. 상태·동시성·실패

### 6.1 계획 고정 토큰 `planToken`(v2)

- **왜**: 계획과 다운로드는 서로 다른 요청이라 각자의 "지금"으로 판정한다. 그 사이에 보존 경계(1m 7일·5m 30일)를 넘으면 다운로드가 계획보다 굵은 해상도로 **재승격**되고, 미래 `to`는 각자의 지금으로 다시 잘린다. FE는 `to=min(to, now)`로 잘라 미래 `to`는 막을 수 있지만 승격 판정은 서버 시계라 막을 수 없다.
- **형식·키**: `v1.<payload>.<mac>`, HMAC-SHA256. 키 = `HMAC-SHA256(JWT_SECRET, "moveseye/apm-export/plan-token/v1")` — 새 env 없이 **용도 분리 파생**(원본 키로 JWT와 이 토큰을 직접 서명하지 않는다). 서버 저장 없음이라 다중 노드에서도 검증된다. `JWT_SECRET`을 바꾸면 발급된 토큰은 전부 무효(계획 재조회).
- **TTL**: 기본 30분, `app.apm.export.plan-token-ttl-seconds`(60~86,400). 길어도 권한이 넓어지지 않는다(다운로드가 권한을 매번 다시 본다).
- **payload**: 데이터셋 · 요청 지문 · `plannedToMs`(지금으로 자른 뒤, 칸 올림 **전**의 `to`) · `stepSeconds` · 계획 응답의 실제 `fromMs`·`toMs` · 만료 시각. 칸 올림 후 값을 넣으면 창이 한 칸 더 밀릴 수 있어 올림 전 값을 넣었다. 다운로드는 `requireSameWindow`로 자기 계산 창이 토큰의 `fromMs`·`toMs`·`step`과 같은지 **본문 전**에 확인한다(원천 코드가 바뀐 날의 방어).
- **고정하는 것**: 창 끝·해상도뿐. **고정하지 않는 것**: 데이터·`coverage`·`incompleteFromMs`·보존 판정(`retentionClipped`)·`exportedAt` — 전부 다운로드 시점 기준이다. 그래서 `rows`는 에러 그룹·전 서비스 RED에서 계획과 조금 다를 수 있다(v1과 같은 성질). "지금"을 통째로 얼리는 안은 버렸다 — 그 사이 보존 배치가 지운 칸을 `DATA`로 오표기할 수 있다.
- **지문**: `dataset`·`from`·**보낸 그대로의** `to`·`step`·`service`·`q`·`method`(대문자 정규화)·`format`·`gzip`·`rawText`의 SHA-256, 필드마다 길이 접두(구분자 연결이면 `q="aG",method="ET"`와 `q="a",method="GET"`이 충돌). 검색어 원문은 토큰에 싣지 않는다(URL·접근 로그에 남기 때문). `red-series`에 `q`를 보내고 계획했다면 다운로드도 같은 `q`를 보내야 한다(적용값이 null이어도 지문은 원 요청 기준).
- **계정 식별자 없음 · 타 사용자 재사용 허용** — 판단: 문제 아님. 토큰은 권한을 주지 않는다. 남의 토큰으로 얻는 것은 "그 파라미터를 그 시각에 계획했을 때의 창 끝·해상도"뿐이고 이는 자기 계획으로도 얻는 정보다. 계정을 묶으면 서명 검증 외 보안 이득 없이 재로그인·링크 공유에서 오작동만 늘어난다. 관리자가 발급한 `rawText=true` 토큰을 비관리자가 써도 원문 판정에서 403이다(`ApmExportPlanTokenTest`·`ApmExportIT.viewerCannotReuseAdminRawTextToken`).
- **검증 순서**: 원문 길이 > 512 → 서명 확인(상수 시간 `MessageDigest.isEqual`, 서명이 맞지 않는 payload는 해석하지 않음) → 필드 파싱 → 만료 → 데이터셋·지문 일치. 실패는 전부 `APM_EXPORT_INVALID`.
- **호환**: 토큰 없는 다운로드 = v1 동작(`request.resolution()`이 `pin == null`이면 `ApmResolution.choose`). 계획 EP에 보낸 `planToken`은 무시된다.

### 6.2 동시 실행 슬롯

- `ApmExportService`가 노드당 `Semaphore(max-concurrent)`(기본 2)를 든다. 다운로드만 잡고 계획은 잡지 않는다. `tryAcquire` 실패 = `APM_EXPORT_BUSY`(429).
- 반납은 `finally`다 — 계획 예외·상한 초과·클라이언트 중단·flush 실패에서도 반납된다(`ApmExportServiceTest` 반납 4경로). 반납이 새면 2회 뒤 영원히 429가 된다.
- 동기 스트리밍(`HttpServletResponse`에 직접 쓰기)이라 파일이 끝날 때까지 요청 스레드와 (에러 그룹은) 읽기 전용 DB 트랜잭션을 붙잡는다. `StreamingResponseBody`를 쓰지 않은 이유는 이 레포에서 비동기 재디스패치가 보안 컨텍스트 없이 돌아 401·500으로 바뀐 사고(SSE, ZM-128)가 있어서다.
- 노드별 판정이라 다중 노드면 합이 늘어난다(전역 상한 없음, §10).
- FE가 취소 시 요청을 끊으므로(§4.2) 컨테이너가 연결 끊김을 `IOException`으로 알리는 시점에 슬롯이 돌아온다. 실제로 즉시 반납되는지는 브라우저 실측이 없다(§9).

### 6.3 실패 처리

- **본문 전**: 전부 JSON envelope(§5.4). 응답이 커밋되기 전이라 "파일 절반 + JSON" 혼재가 없다(`ApmExportServiceTest`가 미커밋·본문 0바이트를 단언).
- **본문 중**(`RuntimeException`): 로그 ERROR + `# NOTE:`(결손 시) → `# ERROR: 내보내기 도중 오류가 발생해 파일이 완전하지 않습니다(N행까지 기록).` / JSONL `{"_error":{"message":…,"rowsWritten":N}}`, `_end` 없음. gzip은 `finish()`로 닫는다. 감사 로그 `outcome=failed`.
- **경합 절단**: 계획에서 센 뒤 행이 늘어(에러 그룹) 상한에 걸리면 `ApmExportSink`(2차 방어)가 멈추고 CSV `# TRUNCATED: 행 상한(N)에 걸려 중단했습니다. 기간을 나눠 다시 받으세요.` / JSONL `_end.truncated=true` + `note`. `outcome=truncated`.
- **클라이언트 중단**(`IOException`·`UncheckedIOException`): 표지를 쓸 곳이 없어 로그 INFO만, gzip `finish()`도 건너뜀. `outcome=client-aborted`.
- idempotency: GET·부작용 없음. 같은 파라미터·같은 토큰으로 여러 번 받을 수 있다(데이터는 매번 다운로드 시점).
- retry/timeout: BE 재시도 없음. FE 다운로드 timeout 10분. `BUSY`는 사용자가 잠시 뒤 다시 누른다(자동 재시도 없음).

### 6.4 FE 요청 중단 배선(`axiosInstance` + `linkCallerSignal`)

- 요청 인터셉터는 중복 요청 취소용으로 요청마다 자기 controller의 signal을 `config.signal`에 넣는다. v2부터 호출부 signal을 `linkCallerSignal`로 이어 붙인다 — 호출부가 끊으면 `beforeAbort`(중복 취소 맵에서 자기 항목 제거) → 호출부 중단 표식(`callerAbortedSignals` WeakSet) → controller abort. 응답 인터셉터는 표식이 있으면 "대체 요청 진행 중 = 영구 pending" 판정보다 먼저 무조건 reject한다(그래야 모달의 `finally`가 돈다).
- 401 refresh 재시도(`API(original)`)는 `config.signal`에 첫 시도의 **인터셉터** signal을 싣고 온다. 그것을 호출부 signal로 오인하면 모든 재시도가 즉시 취소된다 → 인터셉터 signal을 `trackInterceptorSignal`(WeakSet)로 표시하고 호출부 signal은 `config._callerSignal`에 기억해 재시도에 다시 잇는다(`resolveCallerSignal`).
- 리스너는 요청이 끝나면(성공·실패·재시도 전) `config._unlinkCallerSignal`로 뗀다(장수명 signal에 누적 방지).
- signal을 넘기는 호출부는 이 다운로드뿐이다. signal 없는 요청은 동작 불변.
- 보존 결손 헤더를 읽기 위해 인터셉터에 옵트인 `returnHeaders`가 생겼다 — 이 플래그일 때만 `{ data, headers }`를 돌려준다. 🔴 다운로드 외 호출에 쓰면 `useDmoveQuery` 언랩 깊이가 달라지므로 쓰지 않는다.
- 실제 `createDmoveApi`에 가짜 adapter를 끼운 테스트(`axiosCallerSignal.test.ts` 10건)가 이 배선을 고정하며, 배선을 되돌린 변이 4종이 모두 실패함을 확인했다(검수 FE R5).

## 7. 권한과 보안

- 기능 permission: `applicationMonitoring/apm` **`view`**(`ApmAccessChecker.requireRead`) + 라이선스 `Feature.APM`(`@RequiresFeature`). 파일이 조회 권한을 넓히지 않는다 — 같은 데이터를 화면에서 볼 수 있는 사람이 파일로도 받는다.
- 데이터 범위: 서비스 단위 가시성 필터는 없다(APM 화면과 같다). `error-groups`·전 서비스 RED는 설치본의 전 서비스가 대상이다.
- 원문(`rawText`): 판정은 `ApmAccessChecker.canViewRawText` = `AdminAccessChecker.isAdmin`(`ADMIN` ∪ `SUPER_ADMIN`) 하나다. **기본은 항상 마스킹**(`ApmRawTextView.MASKED` — `ApmSqlMasker`가 SQL 리터럴을 `?`로, 프레임 줄은 유지). 화면(`ApmRawTextPolicy`)은 `keep_raw_sql=false`면 "이미 가렸다"며 저장값을 그대로 주지만, `keep_raw_sql`을 켰다가 끈 설치본에는 켜져 있던 동안의 원문이 남아 있어 파일은 그 규칙을 따르지 않는다(마스킹은 멱등이라 두 번 걸어도 같다). 원문 요청은 데이터셋과 무관하게 관리자만이다 — 원문 칸이 새 데이터셋에 생길 때 조용히 열리지 않게. FE는 관리자 + `error-groups`에서만 체크박스를 보이고(원문이 실리는 열이 `sampleStack`뿐), 체크 시 경고 문구를 띄우며, 모달을 닫으면 체크가 초기화된다.
- 감사 로그: `ApmExportService.audit` — 다운로드가 끝날 때마다(성공·절단·실패·중단 전부) `[APM-EXPORT] user= dataset= service= from= to= step= format= gzip= rawText= q=<유무 boolean> method= pinned= rows= outcome= elapsedMs=` 한 줄. 원문 반출은 **WARN**, 그 밖은 INFO. **검색어 본문은 기록하지 않는다**(유무만). `user`·`method`는 `logSafe`로 이스케이프한다(CR·LF·TAB → `\r`·`\n`·`\t`, 그 밖의 C0·C1(`isISOControl`)·Cf(U+202E·U+2066·U+200D 등)·U+2028/2029 → `\uXXXX`) — 개행이 든 값이 위조 `[APM-EXPORT]` 행을 만들지 못하게. `method`는 tchar 검증과 이중 방어다. 감사 **테이블은 없다**.
- secret/개인정보: 파라미터에 비밀값 없음. 계획 토큰은 `JWT_SECRET` 파생 키로 서명하며 payload에 검색어·계정이 들어가지 않는다(지문만). CSV 수식 주입 방어(`'` 접두)는 텍스트·JSON 칸에만 걸고 수치 칸은 손대지 않는다(음수 불변). `sampleTraceId`·`endpointCounts`는 화면과 같은 값이다.

## 8. 운영

- 설정·환경변수(`application.yml` `app.apm.export.*`, `ApmExportProperties`)

  | 키 | 기본 | 범위 | 뜻 |
  |---|---|---|---|
  | `max-rows` (`APM_EXPORT_MAX_ROWS`) | 200,000 | 1~1,000,000 | 한 파일의 데이터 행 상한. 근거: 1분 RED 7일 = 10,080행/서비스 → 약 20개 서비스, CSV 약 30MB |
  | `max-concurrent` (`APM_EXPORT_MAX_CONCURRENT`) | 2 | 1~16 | 이 노드의 동시 다운로드 수(응답 스레드·DB 커넥션 점유) |
  | `chunk-cells` (`APM_EXPORT_CHUNK_CELLS`) | 1,440 | 60~20,000 | RED 시계열을 한 번에 읽는 칸 수(메모리 상한). 1,440 = 1분 해상도 하루 |
  | `plan-token-ttl-seconds` | 1,800 | 60~86,400 | 계획 토큰 유효 시간. **env 자리표시자 없음**(새 env 금지 지시) — 바꾸려면 yml 직접 수정 |

  값은 서버 사양에 묶인 보호 장치라 고객이 올려도 우리가 모르는 동작이 생기지 않는다. 대형 설치본은 1분 RED 전 서비스 7일이 기본 상한을 바로 넘는다.
- metric/log: 메트릭 없음. 로그는 `[APM-EXPORT]`(§7)와 스트리밍 실패 ERROR·연결 끊김 INFO. 로거는 `ApmExportService`(`com.dmove` 아래).
- 장애 증상과 복구

  | 증상 | 원인 | 조치 |
  |---|---|---|
  | 모든 다운로드가 `APM_EXPORT_BUSY`(429) | 노드의 슬롯 2개가 점유 중(긴 파일, 또는 끊긴 연결을 컨테이너가 아직 감지 못함) | 잠시 뒤 재시도. 계속되면 `[APM-EXPORT]` 로그에서 `outcome`이 안 찍힌 요청·`elapsedMs`를 보고, 필요하면 `max-concurrent` 상향 후 재기동 |
  | 계획 `allowed=false` / 다운로드 `APM_EXPORT_TOO_LARGE` | 행 > `max-rows` | 사용자: 해상도 올리기·기간 줄이기·서비스 지정. 운영: 근거가 있으면 `max-rows` 상향 |
  | 다운로드 `APM_EXPORT_INVALID`("계획이 만료"·"조건과 다릅니다"·"올바르지 않습니다") | 토큰 30분 경과·파라미터 변경·`JWT_SECRET` 교체·변조 | FE가 계획을 자동 재조회한다. 사용자가 새 계획을 확인하고 다시 누르면 된다 |
  | 파일 끝 `# ERROR:` / JSONL `_end` 없음 | 스트리밍 도중 DB 오류 | BE 로그 ERROR 확인 후 다시 받기 |
  | 파일 끝 `# TRUNCATED:` / `_end.truncated=true` | 계획 이후 행이 늘어 상한에 걸림(에러 그룹) | 기간을 나눠 다시 받기 |
  | 파일 끝 `# NOTE: retention-clipped` / 헤더 `Retention-Clipped: true` | 창 시작이 보존보다 오래됨 | 결함 아님. 기준선(`Retention-Cutoff`) 이전 구간은 비어 있을 수 있다고 안내 |
  | 계획 `stepEscalated=true` | 요청 해상도의 보존을 넘음 | 결함 아님. 화면과 같은 승격 규칙 |
  | `JWT_SECRET` 교체 직후 INVALID | 파생 키가 바뀜 | 의도된 동작. 재계획 |
- migration/rollback: 마이그레이션 없음. 코드 롤백만으로 되돌아간다. v2 BE만 롤백해도 FE는 `planToken` 없음을 v1로 판정해 동작한다(엔드포인트 필터 내보내기만 차단됨, §4.4). v2 FE만 롤백하면 BE는 토큰·필터를 안 받은 것으로 처리한다(추가형).

## 9. 검증 근거

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위·IT(BE v1) | 신규 58건(`ApmExportIT` 8, 실 PostgreSQL 5433) + 회귀 `premium.apm.*`+`*ArchitectureTest`+`common.export.*` | 1,961건 통과 → 병합 후 2,018건 통과. 검수 R2·R3 반영으로 `ApmExportRequestTest` +4·`ApmExportServiceTest` +5·`ApmExportIT` +4 |
| 단위·IT(BE v2) | 대상 단위 12클래스 95건 + 회귀(IT 포함) 180클래스 | **2,100건 통과, fail 0·skip 0**(`ApmExportIT` 15건 실 DB). N1·N2 반영 후 export IT 15건 단독 재통과 |
| 변이 확인(BE) | 두 exporter를 `ApmResolution.choose()` 직접 호출로 되돌림 | R5 테스트 2건 실패 → 복구 후 통과(토큰이 실제 해상도를 고정함을 증명) |
| 정적(FE v1) | `tsc` 0 · eslint 0 · `typecheck:contract`(계획 DTO 픽스처 `apmExportContractSample.ts`) | 0(병합 시점) |
| 단위(FE v1) | `apmExportApi` 9 · `ApmExportButton` 8→11 + 인접 3스위트 | 17/17, 86/86, 검수 반영 후 20건 통과 |
| 단위(FE v2) | `ApmExportButton` 30 · `ApmOverviewPage` 29 · `apmExportApi` 13 · `linkCallerSignal` 8 · `axiosCallerSignal` 10 · `zm157RealWiring` 9 · 인접 3 | **9스위트 178/178**, `tsc`·`typecheck:contract`·eslint 0 |
| 변이 확인(FE) | 인터셉터 배선을 되돌린 4종(이전 구현·표식 제거·리스너 떼기 제거·401 재시도 구분 제거) | 6·1·2·2건 실패 → 원복 확인 |
| 정적 검수(Codex, gpt-5.6-sol high) | v1 BE R1~R4·FE R1~R6 → BE v2 승인·FE v4 승인. v2 BE R1~R7·N1·N2 → **v3 승인**. v2 FE R1~R5·#4·#5·N1 → **v3 승인** | v1 잔여 권장: FE R4(실제 인터셉터 배선 테스트 — v2 `axiosCallerSignal`로 signal·401 재시도 경로는 덮였고, Blob 401·`application/json;charset` 판정·세션 전환 실배선은 미작성)·FE R5(접근성 레이블, 미반영) |
| runtime(v1 BE EP) | 2026-09-22 실행 중 :3000(병합본)에 admin 쿠키 + `x-visitor-id` curl | 계획 `red-series` 7일 `stepSeconds=300`·`rows=8068`·`allowed=true` / `step=60` 10일 → `stepEscalated=true` / CSV 첫 3바이트 `EF BB BF`, 8,069줄, coverage 분포 DATA 1,653·NO_DATA 6,407·PARTIAL 4·NOT_ROLLED_UP 4 / JSONL gzip 매직 `1F 8B`·`_meta`·`_end` / `from>to` → HTTP 200 + `application/json` + `APM_EXPORT_INVALID` / 동시 3건 중 1건 `429 APM_EXPORT_BUSY` / 관리자 `rawText=true` 반영 / `Access-Control-Expose-Headers` 노출 |
| runtime(2026-09-28 종단 확인) | `reports/zm-151-154_runtime-check.md` §3 | 두 EP가 런타임 OpenAPI에 등록·미인증 HTTP 401 JSON만 확인. **계획·다운로드·FE 렌더는 전용 계정 부재로 미실시** |
| runtime(v2) | — | **미실시**(:3000에 v2 코드 미탑재, :5173은 master 본체) |

미검증 항목:

- v2 전부 — 토큰이 실린 실제 다운로드 URL(약 150자 토큰), 30분 만료 경로, 필터 4조건의 표 `total` = 파일 행 수(IT는 단언), `__other__` 행 필터, 보존 결손 헤더·`# NOTE:` 실물, 교차 오리진에서 `returnHeaders` 헤더 읽기
- 브라우저 실제 다운로드 — `saveAs` 저장 대화상자, CSV BOM·gzip 그대로 저장, 교차 오리진 blob `Content-Type` 판정, 취소 시 네트워크 탭 `(canceled)`와 BE 슬롯 즉시 반납, 7일·1분 전체 서비스 계획의 `allowed=false` 문구, APM 개요 툴바 버튼 자리
- 비관리자 계정 — 원문 체크 미노출·403(v1부터 계정이 없어 미확인)
- 20만 행급 소요 시간, 다중 노드 동시 실행

증거 원천: 계약 `_workspace/contract_apm-data-export.md` · 보고 `reports/zm-154_apm-data-export.md`(BE v1)·`zm-154_apm-data-export-fe.md`(FE v1, §4.1 curl 표)·`zm-154_be-followup.md`(v2)·`zm-154_fe-followup.md`(v2) · 검수 `reviews/review_zm-154-apm-data-export.md`·`review_zm-154-be-followup.md`·`review_zm-154-fe-followup.md` · 런타임 `reports/zm-151-154_runtime-check.md`.

## 10. 결정과 열린 항목

- 결정:
  - **상한 초과는 파일 시작 전 거절**(`TOO_LARGE`) + 계획 `allowed=false`. 잘라서 주고 헤더로 알리는 안은 버렸다 — 헤더는 FE가 못 읽을 수 있고, 감사 자료가 조용히 잘리면 "그 뒤로는 아무 일도 없었다"로 읽힌다. 센 뒤 늘어난 경합만 절단 표지.
  - **빈 칸 ≠ 0** — `coverage` 열로 이유를 적는다(수집 중단과 무트래픽 구분).
  - **원문은 항상 마스킹 기본**, 관리자의 명시 요청만 원문(§7).
  - **오류는 본문 전 JSON envelope / 본문 중 파일 끝 표지**(레포 전역 HTTP 200 + body code 계약).
  - **동기 스트리밍**(`StreamingResponseBody` 아님) — 비동기 재디스패치 사고(ZM-128) 회피. 대가는 동시 실행 상한.
  - **공용 작성기 `common/export/`** — 자빅스 아카이빙(I7, premium 밖)과 공유하려면 premium에 둘 수 없다(ArchUnit A1).
  - **FE `to=min(to, now)` 고정 + BE 토큰 고정 병행** — FE 고정은 미래 `to`의 재자르기를 막고, 토큰은 보존 경계 재승격을 막는다. 둘은 충돌하지 않는다(검수 BE R1=FE R2 → FE 반영, 잔여는 v2 토큰).
  - **토큰에 계정 미포함**(§6.1). **HMAC 서명**(Redis TTL 캐시 대신). **`JWT_SECRET` 파생 키**(새 env 없음).
  - **`red-series`의 `q`는 무시하되 적용값 null로 기록**(DTO·`_meta`·notes·감사 로그) — v1 거동 유지 + "적용했다"고 거짓말하지 않기. 반면 `method`는 타 데이터셋에서 **거절** — 조용히 무시하면 "걸렀다고 믿은 전량 파일".
  - **필터는 SQL이 아니라 술어(`ApmEndpointFilter`) 공유** — 트랜잭션 표의 필터가 합산 뒤 자바 술어라 SQL 재사용이 불가능했다.
  - **새 errorCode 없음** — INVALID 하나, FE 처리는 재계획 하나.
  - **재계획 후 자동 재다운로드 안 함** — 사용자가 못 본 계획으로 파일이 나가지 않게.
  - **FE 만료 선판정 삭제**(검수 R4) — BE INVALID가 정본.
  - **인터셉터 옵트인 `returnHeaders`** — 전역 반환 모양을 바꾸지 않는다.
- 기각 대안:
  - 서버측 계획 캐시(Redis 짧은 TTL) — 다중 노드 공유·계획마다 쓰기·축출 시 오만료.
  - 계획의 `stepSeconds`를 다운로드 `step`으로 되보내기(검수 FE v2 R2) — 파일 메타 `requestedStepSeconds`·`stepEscalated`가 계획과 달라진다.
  - 요청의 `nowMs` 전체를 계획 시각으로 동결 — 보존 배치가 지운 칸을 `DATA`로 오표기.
  - 이 요청만 인터셉터 우회(raw axios) — `x-visitor-id`·401 refresh·envelope 규약을 복제하게 된다.
  - CSV 안 주석 메타 줄 — 엑셀 표를 더럽힌다(계획 EP·헤더·JSONL `_meta`로 대체).
- 열린 항목:

  | 항목 | 상태 |
  |---|---|
  | `env` 파라미터(APM 개요 전체 서비스 RED가 화면 env 선택을 반영하지 못함) — 계약서 `🔄 FE 요청사항`에 FE→BE 요청으로 기록 | 계획 |
  | 다중 노드 전역 동시 실행 상한(현재 노드별 세마포어. `scheduler_lease` 같은 DB 잠금 후보) | 보류 |
  | 보존 결손 CSV 표기의 장기 보존 — 헤더는 받는 순간에만, `# NOTE:` 줄은 결손일 때만 남는다. 정상 파일에는 판정 흔적이 없음 | 보류 |
  | 브라우저 실측·v2 런타임·비관리자 계정 경로(§9) | 계획 |
  | 행 상한 20만·동시 2의 서버 사양 근거(dev 1곳 실측 없음) | 보류 |
  | 원문 내보내기를 허용할지 / 감사 테이블(ZM-156 Q8·ZM-155와 공유 결정) | 보류 |
  | 화면 원문 판정의 틈(`keep_raw_sql` 켰다 끈 설치본에서 비관리자 화면에 원문) — 별도 이슈 권고 | 보류 |
  | 스팬·트레이스 요약 데이터셋(용량 실측 선행, ZM-156 S0 공유) | 보류 |
  | 전 서비스 RED 대상에 숨김 서비스 포함 여부 | 보류 |
  | 엔드포인트 시간 칸별 표(route × bucket) | 보류 |
  | 보존 일수 사본 통일(`ApmResolution` 사본 vs 에러 그룹 옵션 직접 읽기 → ZM-156 S2 `ApmRetentionPolicy`) | 보류 |
  | FE 접근성 레이블(검수 FE R5), INVALID `message`(만료/불일치) 보조 표시 | 보류 |
  | `error-groups` 모달의 "적용 필터" 줄 표시 여부(현재 v2 계획이 적용값을 주므로 보임 — 숨겨야 하면 `apmExportSupportsFilters` 한 줄) | 보류 |
  | `_workspace` 계약서·설계서의 `planToken` 절 상단 "미커밋" 표기가 커밋(`213d875`) 뒤에도 남아 있음 | 계획 |

- 관련 문서: [API 카탈로그](../%EA%B8%B0%EC%88%A0/API-%EC%B9%B4%ED%83%88%EB%A1%9C%EA%B7%B8.md), [아키텍처](../%EA%B8%B0%EC%88%A0/%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98.md), [릴리스 노트](../%EB%A6%B4%EB%A6%AC%EC%8A%A4/%EB%A6%B4%EB%A6%AC%EC%8A%A4-%EB%85%B8%ED%8A%B8.md), [용어집](../%EC%B0%B8%EA%B3%A0/%EC%9A%A9%EC%96%B4%EC%A7%91.md), [권한 강제와 세션 회수](%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md)(`apm.view`·관리자 판정의 정본). 위 문서들에 이 기능 항목이 이미 있는지는 이번 작성에서 확인하지 않았다(미확인).
- Obsidian 관련 노트: `zm-151-156-backlog-sprint`(ZM-154 진행 기록), `fe-usedmovequery-unwrap`(언랩 깊이 규칙), `fe-contract-fixture-gate`(`typecheck:contract`).

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-22 | v1 — BE `b2c564a`(계획·다운로드 EP, 데이터셋 3종, 공용 작성기, 상한·동시 실행·원문 마스킹, 테스트 58건)·`83cc85f`(파라미터 형식 오류 `APM_EXPORT_INVALID` 통일 + 실패 경로 테스트 13건). FE `39ece8e`(버튼·모달·서비스 개요/트랜잭션/에러 3화면, i18n, 테스트 17건)·`9735c02`(창 끝 지금으로 고정, 세션 전환·닫힌 모달의 늦은 파일 폐기, StrictMode 결함 수정). 09-22 BE EP curl 실측 통과 |
| 2026-09-28 | v2 — BE `213d875`(`endpoints` `q`·`method` 필터 `ApmEndpointFilter`, 계획 고정 토큰 `planToken`(HMAC·`JWT_SECRET` 파생·30분), 보존 결손 헤더·CSV `# NOTE:`, 감사 로그 이스케이프 `logSafe`, `method` tchar·제어 문자 거절, 계획 EP 형식 오류 헤더 단언). FE `01b7b28`(APM 개요 전체 서비스 RED, 취소·닫기·계정 전환 시 요청 중단 — 인터셉터 호출부 signal 연결, v2 연동 — 필터·`planToken`·INVALID 재계획·보존 결손 경고·적용 필터 적용값·v1 서버 필터 차단). Codex BE v3·FE v3 승인. 런타임 미실시 |
| 2026-09-28 | 이 문서 최초 작성(v1 + v2 기준) |
