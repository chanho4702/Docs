# 검수 요청 — ZM-154 APM 데이터 기간 지정 내보내기(CSV/JSONL) BE + FE

- 요청: Claude · 2026-09-22 · 사용자 "저 작업이 실제 이뤄졌는지도 확인 및 검수가 필요해 검수 과정은 코덱스 시켜"
- 검수 대상 커밋(둘 다 master, 미푸시):
  - BE `moveseye-be-spring` **`b2c564a`** (36파일, +3,759/−26) — 2026-09-16 작성, 09-22 master 병합
  - FE `moveseyee_fe` **`39ece8e`** (15파일, +1,380/−20) — 2026-09-22
- 🔴 같은 브랜치의 다른 커밋(ZM-122 `baed6ee`·`739ae89`·`1954534`, ZM-151/153 `0c3d9e6`·`3741f37`, ZM-152 `2c58efb`)은 **검수 대상이 아니다**.
- 설계 정본: `_workspace/features/apm/data-export/devdesign_apm-data-export.md` · 계약: `_workspace/features/apm/data-export/contract_apm-data-export.md`
- 작업 보고: BE `_workspace/features/apm/data-export/zm-154_apm-data-export.md` · FE `_workspace/features/apm/data-export/zm-154_apm-data-export-fe.md`

## 범위

### BE (`git show b2c564a`)
| 층 | 변경 |
|---|---|
| 공용 작성기 `common/export/` (신규) | `TabularWriter`(행 스트리밍 SPI) · `CsvTabularWriter`(RFC 4180·UTF-8 BOM·CRLF·NULL=빈 칸·수식 주입 방어·절단/실패 `#` 표지) · `JsonlTabularWriter`(`_meta` 첫 줄·`_end` 끝 줄·`_error`) · `TabularFormat`·`TabularColumn` |
| APM 내보내기 `premium/apm/export/` (신규) | `ApmExportController`(`GET /apm/exports/{dataset}/plan` JSON · `GET /apm/exports/{dataset}` 파일, `@RequiresFeature(APM)`·`requireRead`·`@VisitorIdCheck`) · `ApmExportService`(원문 판정→세마포어→계획→상한→헤더→스트림→실패 표지→감사 로그) · `ApmExportRequest`(엄격 검증) · `ApmExportDataset`(3종 열 정의) · `ApmExportPlanDto` · `ApmExportProperties`(`max-rows` 20만·`max-concurrent` 2·`chunk-cells` 1,440) · `source/`(SPI·계획·싱크·격자·coverage·대상 + `ApmRedSeriesExporter`·`ApmEndpointExporter`·`ApmErrorGroupExporter`) |
| 기존 수정 | `engine-api ErrorCode`(+`APM_EXPORT_INVALID`·`TOO_LARGE`·`BUSY`) · `ApmErrorQueryService`(필터 조립을 `windowFilter()`로 추출 + `countForExport`·`streamForExport`) · `application.yml`(`app.apm.export.*`) |
| 테스트 | 단위 50 + IT 8(`ApmExportIT`, 실 PostgreSQL) |

### FE (`git show 39ece8e`)
| 층 | 변경 |
|---|---|
| 타입·API | `types/apm.ts`(`TApmExportPlan` 등) · `services/apm.api.ts`(`getExportPlan` envelope 그대로, `downloadExport` blob — `application/json`이면 `ApmExportError`, timeout 10분) · `hooks/useApm.ts`(`useApmExportPlan`) · `constants/queryKey.ts` |
| 공용 UI (신규) | `shared/apmExport.ts`(형식·해상도 선택지·데이터셋별 지원 여부·오류 문구) · `shared/components/ApmExportButton.tsx`(누른 순간 시간 창 고정) · `shared/components/ApmExportModal.tsx`(형식/gzip/해상도/원문 → 계획 표시 → `allowed=false`면 비활성 → `saveAs(blob, plan.filename)`) |
| 붙인 화면 | 서비스 상세 › 개요 탭(`red-series`) · 트랜잭션 탭(`endpoints`) · `ApmErrorExplorer`(`error-groups`, 에러 메뉴와 서비스 상세 에러 탭이 공유) — **F6(APM 개요 전체 서비스)은 지시로 제외** |
| i18n | `kr.json`·`en.json` `apm.export.*` 55줄씩 |
| 테스트 | `apmExportApi.test.ts` 9 · `ApmExportButton.test.tsx` 8 · 계약 픽스처 `fixtures/apmExportContractSample.ts` |

## 의도 (선택한 설계 · 버린 대안)
- **상한 초과는 파일 시작 전 거절**(`TOO_LARGE`) + 계획 EP `allowed=false`. 버린 것: 잘라서 주고 헤더로 알림 — 교차 오리진·axios 언랩에서 FE가 헤더를 못 읽을 수 있고, 감사 자료가 조용히 잘리면 "그 뒤론 아무 일도 없었다"로 읽힌다.
- 센 뒤 행이 늘어난 경합(에러 그룹)은 **절단 표지**(CSV `# TRUNCATED:` · JSONL `_end.truncated=true`).
- **빈 칸 ≠ 0**: 행 없는 칸은 비우고 `coverage` 열(DATA/NO_DATA/PARTIAL/NOT_ROLLED_UP/OUT_OF_RETENTION)로 이유를 적는다. 버린 것: 화면처럼 `requests=0`.
- **원문은 항상 마스킹 기본**, 관리자가 `rawText=true`를 명시할 때만. 버린 것: 화면 규칙(`keep_raw_sql=false`면 저장값 그대로) — 켰다 끈 설치본에 원문이 남는 틈이 있어 파일에는 안 씀.
- 보존 밖 기간은 화면과 같이 **상위 해상도로 승격**(`stepEscalated`).
- 실패는 파일이 아니라 **기존 JSON envelope**(HTTP 200 + body code) — FE는 blob의 `Content-Type`으로 판정.
- 공용 작성기를 `premium` 밖 `common/export`에 둔 이유: 자빅스 아카이빙(I7)과 공유하려면 premium에 둘 수 없다(ArchUnit A1).
- FE: 계획 조회는 폴링 없음·파라미터 전부 쿼리 키. 모달은 열릴 때만 마운트해 닫으면 원문 체크가 초기화된다. 버튼을 누른 순간의 `useApmTimeRange()` 창을 모달이 끝까지 쓴다(자동 새로고침으로 상대 구간이 흘러도 계획과 파일이 같은 창).
- FE: `rawText` 체크는 **관리자 + `error-groups`에서만** 노출(원문이 실리는 열이 `sampleStack`뿐).

## 중점 확인 요청 (여기가 검수의 값어치)
1. **응답 커밋 전 판정이 정말 다 끝나는가** — 상한 초과·403·429가 `HttpServletResponse` 헤더/본문을 쓴 뒤 나면 "파일 절반 + JSON"이 섞인다. `ApmExportService`의 순서와 `ApmExportServiceTest`의 "미커밋·본문 0바이트" 검증이 실제로 그것을 고정하는지.
2. **세마포어 반납 경로** — 예외·클라이언트 중단(`ClientAbortException`)·스트림 flush 실패에서도 반납되는가. 반납이 새면 2회 뒤 영원히 429.
3. **CSV 수식 주입 방어의 범위** — TEXT/JSON 칸에만 `'` 접두인데, 숫자 칸으로 분류된 열에 문자열이 들어올 경로(예: route가 숫자 칸으로 잘못 분류)가 없는가. 음수·소수점·과학표기 값이 `-`로 시작해 방어에 걸리지 않는가(테스트가 "음수 불변"이라고 주장).
4. **행 수 계산의 정확성** — `red-series`·`endpoints`는 계획에서 행 수를 "정확히" 센다고 주장한다. 격자(`ApmExportGrid`)와 실제 스트림이 같은 규칙인지(`ApmExportGridParityTest`가 화면 격자와 비교하는 대상이 옳은지), 창 끝이 "지금"으로 잘릴 때 격자 칸 수가 계획과 파일에서 같은지.
5. **`ApmErrorQueryService.windowFilter()` 추출이 동작 불변인가** — 기존 목록 `query()`의 SQL/파라미터가 바뀌지 않았는지 diff로 확인. 내보내기와 목록이 "같은 모집단"이라는 주장(`ApmExportIT`)이 정렬·페이지·env 필터 차이를 빼고 성립하는지.
6. **`fetchSize` 커서 스트림이 트랜잭션 밖에서 끊기지 않는가** — 읽기 전용 트랜잭션 경계와 서블릿 응답 스트림 flush 순서.
7. **원문 판정 경로** — 비관리자 `rawText=true`가 계획 EP에서도 403인지(파일 EP만 막으면 계획으로 원문 여부를 탐색 가능). `ApmAccessChecker.canViewRawText` 축(역할)과 화면 축이 같은지.
8. **미래 `to`를 지금으로 자르는 처리** — 계획과 파일 사이에 시간이 흘러 "지금"이 달라지면 두 응답의 행 수·`toAt`가 어긋난다. 허용 가능한가, 아니면 계획의 `toAt`를 파일 요청에 그대로 넘겨야 하나(FE는 계획과 **같은 파라미터**를 넘기지만 `to`가 미래면 서버가 각자 자른다).
9. **FE blob 오류 판정** — `downloadExport`가 `application/json`일 때만 오류로 본다. 교차 오리진 배포(FE 아파치 / BE 도커, HTTP)에서 `Content-Type`이 `application/json;charset=UTF-8`처럼 파라미터가 붙거나, 프록시가 바꾸는 경우 `startsWith` 판정인지. 401(세션 만료)이 blob으로 오면 공통 인터셉터(재인증·로그아웃)가 여전히 동작하는지(`responseType: 'blob'`에서 인터셉터가 JSON을 파싱하지 못해 놓치는 경로).
10. **FE 언랩 깊이** — `getExportPlan`이 envelope를 그대로 반환하고 `useDmoveQuery`가 한 겹 벗긴다고 한다(메모리 규칙 "인터셉터+훅 2겹"). 소비자(`ApmExportModal`)가 `plan.filename` 등에 접근하는 깊이가 실제 훅 반환과 맞는지 — 목 테스트는 이 오차를 못 잡는다.
11. **FE 시간 창 고정** — 버튼을 누른 순간 고정한 from/to가 `ApmTimeRange.toIso`로 UTC ISO가 되는지, BE `from`/`to`는 **long(ms)** 계약인데 FE가 ISO 문자열을 보내는 건 아닌지(계약 §2 vs FE 보고 §3 #1의 "fromAt/toAt는 toIso"라는 문장). 파라미터 이름·타입을 코드로 대조.
12. **i18n 줄 단위 삽입** — `kr.json`·`en.json`에 55줄을 `"apm": {` 바로 다음에 넣었다. 두 파일의 키 집합이 같은지, 기존 키와 충돌·중복이 없는지, JSON 유효성.
13. **테스트가 위를 실제로 고정하는가** — 특히 BE 1·2·7, FE 9·10·11.

## 검증 현황
- ✅ BE: 신규 58건(IT 8 포함, 도커 PG 5433 실연결) 통과 · 회귀 `premium.apm.*`+`ArchitectureTest`+`common.export.*` 1,961건 통과(공유 IT DB 충돌 9건은 단독 재실행에서 해소) · master 병합 후 회귀 2,018건 통과(IT 실행 확인).
- ✅ FE: `tsc` 0 · eslint 0 · `typecheck:contract` 0(병합 시점) · jest 신규 17 + 인접 스위트 89건 통과.
- ✅ 09-22 실물 확인: 두 커밋 master 존재, 파일 15/36 전부 존재, `ApmExportButton` 사용처 3곳.
- ❌ **런타임(:3000) 실측 없음** — 브라우저 실제 다운로드(CSV BOM·gzip 저장), 교차 오리진 blob `Content-Type`, 수만 행 소요 시간, 비관리자 계정 원문 체크 미노출, 세마포어 429 실동작. BE 재기동은 사용자 요청 시에만.
- ❌ 다중 노드 동시 실행 상한(노드별 세마포어)·행 상한 20만의 서버 사양 근거 없음(dev 1곳).

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정"으로 표시.
- 마지막에 중점 확인 요청 1~13 각각 판정(충족/불충족/추정) 한 줄씩과 종합 판정(승인 / 수정 후 재검수)을 적는다.

---

## 검수 결과 요약 (2026-09-22, 코덱스 gpt-5.6-sol high, 읽기 전용 · 결과 원문 `review_zm-154-apm-data-export-be_codex.md` · `-fe_codex.md`)

> 첫 실행은 코덱스 승격 샌드박스 헬퍼 오류(`setup refresh had errors`)로 "판정 불가"였다 → `-c windows.sandbox='"unelevated"'`로 재실행한 결과가 아래다.

| 레포 | 1차 종합 | 차단 | 반영 후 |
|---|---|---|---|
| BE | **수정 후 재검수** | R1·R2·R3 | R1은 FE만(사용자 결정) · R2·R3 반영 → **v2 승인**(`-be-v2_codex.md`, 차단 없음). 권장 R4(계획 EP 형식 오류 테스트에 `Content-Type`·`Content-Disposition` 단언 추가)는 후속 |
| FE | **수정 후 재검수** | R1·R2 | v2(R2 stepSeconds 되보내기 철회) → v3(R6 StrictMode 결함 발견·수정) → **v4 승인**(`-fe-v4_codex.md`, 차단 없음). 잔여: 보존 경계 재승격(BE plan token)·AbortController — 후속 |

| 번호 | 심각도 | 요지 | 상태 |
|---|---|---|---|
| BE R1 = FE R2 | 필수 | **미래 `to`를 계획·다운로드가 각각의 "지금"으로 다시 자른다** → 두 응답의 창·행 수·파일명이 어긋날 수 있다(RED/endpoint의 `ceil()`은 계약 "toMs ≤ 지금"과도 충돌). 툴바가 오늘의 미래 시각 선택을 허용해 실제로 닿는 경로 | [x] **FE만 반영(사용자 결정 09-22)** — `ApmExportButton`이 모달을 열 때 `to=min(to, Date.now())`로 확정. 다운로드는 계획과 **같은 파라미터**(재검수 v2 R2: 계획의 `stepSeconds`를 되보내면 파일 메타 `requestedStepSeconds`·`stepEscalated`가 계획과 달라져 그 안은 철회). 창 끝이 지금을 넘지 않으니 BE가 요청마다 다시 자를 것이 없다. ⚠️ 잔여: 두 요청 사이에 보존 경계(7·30일)를 넘으면 BE가 해상도를 재승격할 수 있음 — FE로는 못 막고 BE 계획 고정(plan token)이 필요, 후속 |
| BE R2 | 필수 | `from=abc` 같은 타입 불일치가 `APM_EXPORT_INVALID`가 아니라 전역 `INVALID_DATA`로 나간다(컨트롤러가 `Long`으로 먼저 받음) | [x] 반영(워크트리 `zm-154-be`, 미커밋) — 두 EP가 `from/to/step/gzip/rawText`를 `String`으로 받고 `ApmExportRequest.parse(String…)`이 변환·검증(실패 = `APM_EXPORT_INVALID` + 한국어 메시지, Swagger 타입은 `@Schema`로 유지). 전역 핸들러 불변. ⚠️ boolean은 `true`/`false`만(스프링 기본이 받던 `on`/`yes`/`1`은 거절 — FE는 영향 없음). 빈 문자열은 "안 보냄"과 동일. 테스트 +4(`ApmExportRequestTest`) + IT 형식 오류 케이스 |
| BE R3 | 필수 | 실패 경로 테스트 부족: 세마포어 반납(plan 예외·중단·flush 실패 뒤 재다운로드), HTTP 403/429의 JSON `Content-Type`·미커밋·첨부 헤더 부재, 커서가 트랜잭션 안에서 소비되는지 | [x] 테스트 보강(코드 무변경, 결함 없음 확인) — `ApmExportServiceTest` +5(반납 4경로·429 미커밋), `ApmExportIT` +4(형식 오류·403 FORBIDDEN·실제 점유 상태 429·커서 활성+read-only). 회귀 `premium.apm.export.*`+`common.export.*`+`*ArchitectureTest` 78건 통과, IT 12건 실행(skip 0) |
| FE R1 | 필수 | 최대 10분짜리 다운로드 중 **계정 전환**이 일어나도 Promise가 살아서 이전 계정 파일이 새 계정 화면에서 `saveAs` | [x] 반영 — 다운로드 시작 시 `getSessionEpoch()` 고정, 응답 뒤 재비교해 다르면 `saveAs`·상태 갱신 없이 버린다(오류 경로도 동일). 테스트 "drops the file when the session changed…" |
| FE R3 | 권장 | 다운로드 중 취소/닫기가 요청을 중단하지 않음 → 뒤늦게 파일 저장·BE 동시 슬롯 점유 | [~] **반쪽 반영** — 모달이 닫힌(언마운트) 뒤 도착한 응답은 `closedRef`로 버린다(뒤늦은 파일 저장 없음, 테스트 "drops the file when the modal was closed…"). 요청 자체의 중단(AbortController, BE 슬롯 반납)은 권장 항목이라 이번 범위 밖 — 후속. 🔴 3차 재검수 **R6(필수)**: StrictMode(개발)에서 effect 재실행으로 `closedRef`가 첫 마운트부터 `true` → 정상 파일까지 버림 — setup에서 `false` 초기화로 수정 + StrictMode 렌더 테스트 추가 |
| FE R4 | 권장 | 실제 인터셉터 배선으로 Blob 401·`application/json;charset=UTF-8`·세션 전환·미래 `to` 테스트 없음 | [ ] |
| FE R5 | 권장 | 형식/해상도 컨트롤에 접근성 레이블 미연결 | [ ] |

**충족으로 확인된 것(중점 항목)**: BE 1·2·3·4·5·6·7(응답 커밋 전 판정·세마포어 finally·수식 방어 범위·행 수 정확성·`windowFilter` 동작 불변·커서 트랜잭션·원문 축) · FE 9·10·11·12(blob JSON 판정·언랩 깊이·from/to는 양쪽 다 long ms·i18n 키 41개 일치). BE 8·13, FE 13은 불충족(위 표).

**FE 반영 검증(09-22)**: jest `ApmExportButton` 11 + `apmExportApi` 9 = 20건 통과 · eslint 0 · `tsc` 0. 실행 중 BE에 curl로 전제 확인 — 계획 A(`to`=미래, 7일+1h → 3600 승격, `toMs`가 격자 ceil로 "지금"보다 47분 미래)의 `fromMs/toMs/stepSeconds`를 2초 뒤 되돌려 보낸 계획 B가 **행 수 676·파일명·`toMs` 전부 동일**. `endpoints`(step=300)·`error-groups`(step=3600)도 `step`을 거부하지 않음. 에러 그룹도 `toMs` 되돌리기가 동일(ms 단위 그대로).

**런타임 실측(09-22, Claude)**: 실행 중 :3000(병합본 포함)에 curl — 계획·CSV BOM·JSONL gzip·JSON envelope·승격·429·rawText 전부 정상(FE 보고 §4.1). 검수 지적은 실측이 닿지 않은 **경계 조건**(미래 `to`·세션 전환·취소)이다.

**커밋(09-22, 사용자 위임 "적당한거 선택해서 ㄱㄱ")**: FE master `9735c02` · BE master `83cc85f`(워크트리 `ZM-154-review`를 master 위로 리베이스 후 ff, 컴파일 확인). 미푸시. 워크트리·브랜치 정리됨.
