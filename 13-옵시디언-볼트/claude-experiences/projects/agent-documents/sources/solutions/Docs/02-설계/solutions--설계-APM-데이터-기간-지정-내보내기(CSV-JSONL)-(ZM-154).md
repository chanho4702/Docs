# 설계 — APM 데이터 기간 지정 내보내기(CSV/JSONL) (ZM-154)

- 작성일: 2026-09-16 · 갱신 2026-09-22 · 상태: ✅ **BE·FE 구현 완료, 양쪽 master 반영(미푸시)** — BE `b2c564a`(09-16 작성, 09-22 병합) · FE `39ece8e`(F1~F5·F7~F9, F6은 지시로 제외). 런타임 종단 확인은 BE 재기동 후 잔여
- FE 보고: [`../reports/zm-154_apm-data-export-fe.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-154-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0-FE.md)
- 근거: `planning/tasks_backlog-2026-09-16.md` §I4 · 형식·마스킹 기준: [`devdesign_apm-cold-archive.md`](%EC%84%A4%EA%B3%84-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%EB%B3%B4%EC%A1%B4-%EB%A7%8C%EB%A3%8C-%EC%A0%84%EC%97%90-%ED%8C%8C%EC%9D%BC%EB%A1%9C-%EB%B3%B4%EA%B4%80-%28ZM-156%29.md)(ZM-156) §6
- 계약: [`../contract_apm-data-export.md`](../06-API-%EA%B3%84%EC%95%BD/%EA%B3%84%EC%95%BD-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0-%28ZM-154%29.md) · 보고서: [`../reports/zm-154_apm-data-export.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-154-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0%28CSV-JSONL%29.md)
- 표기: 🔴 어기면 파일이 조용히 틀린다 · ⚠️ 알고 있어야 할 한계

---

## 0. 한 줄 요약

기간·대상을 골라 **평평한 표 3종**(서비스 RED 시계열 · 엔드포인트 집계 · 예외 그룹)을 CSV 또는 JSONL(선택적 gzip)로 **스트리밍**해 내려준다. 판정(권한·원문·상한·동시 실행)은 **본문을 쓰기 전에** 모두 끝내고, 그 실패는 평소 계약(HTTP 200 + body code)으로 나간다. 행 수·실제 창·해상도는 **계획 EP**가 먼저 알려 준다.

---

## 1. 결정 표

| # | 결정 | 고른 것 | 버린 것 | 이유 |
|---|---|---|---|---|
| D1 | 1차 대상 | RED 시계열 · 엔드포인트 집계 · 예외 그룹 | 스팬·트레이스 요약 | §2 |
| D2 | 상한 초과 처리 | **시작 전 거절**(`APM_EXPORT_TOO_LARGE`) + 계획 EP의 `allowed=false` | 잘라서 주고 헤더로 알림 / 마지막 줄 표지만 | 헤더는 FE가 못 읽을 수 있고(교차 오리진·axios 언랩), 표지는 사람이 안 본다. 감사 자료가 조용히 잘리면 "그 뒤로는 아무 일도 없었다"로 읽힌다. RED·엔드포인트는 행 수를 **정확히** 미리 셀 수 있다(격자·합산 결과) |
| D2' | 센 뒤 행이 늘어난 경합(에러 그룹) | 상한에서 멈추고 **절단 표지**(CSV `# TRUNCATED:` 줄 · JSONL `_end.truncated=true`) | 조용히 멈춤 | 거절 판정 이후에도 "조용한 절단"은 없어야 한다 |
| D3 | 보존을 넘는 기간 | 화면과 같이 **상위 해상도로 승격**(`ApmResolution.choose`) + 계획에 `stepEscalated`·안내 문구 | 요청 해상도 고수(앞 구간 빈 칸) | 화면과 파일이 같은 숫자를 말해야 한다. 400일도 넘는 부분은 `OUT_OF_RETENTION` 칸 |
| D4 | 빈 값 vs 0 | 🔴 **행이 없는 칸은 수치를 비우고 `coverage` 열로 이유를 적는다** | 화면처럼 `requests=0` 채움 | 수집 중단과 무트래픽이 같은 줄이 되면 안 된다(§3) |
| D5 | 원문(스택) | 🔴 **항상 마스킹이 기본**, 관리자가 `rawText=true`를 **명시**했을 때만 원문 | 화면 규칙(`keep_raw_sql=false`면 그대로) | §4 |
| D6 | 오류 계약 | 본문 전 실패 = JSON envelope(HTTP 200 + code) · 본문 중 실패 = 파일 끝 표지 | 파일 EP만 실제 HTTP 상태 | 레포 전역 계약(CLAUDE.md §3 #1). 본문이 나간 뒤에는 HTTP로 알릴 수 없다 |
| D7 | 스트리밍 방식 | 컨트롤러가 `HttpServletResponse`에 **동기**로 흘려 씀 | `StreamingResponseBody`(비동기 디스패치) | 이 레포에서 비동기 재디스패치가 보안 컨텍스트 없이 돌아 401·500으로 바뀐 사고(SSE, ZM-128). 대가: 요청 스레드 점유 → 동시 실행 상한(D9) |
| D8 | 메타 전달 | **계획 EP**(`/plan`, JSON) + 응답 헤더(이 응답에만 `Access-Control-Expose-Headers`) + JSONL `_meta` | CSV 안 주석 줄 | CSV는 엑셀 표를 더럽히지 않게 표만 둔다 |
| D9 | 서버 보호 | `app.apm.export.max-rows`(20만) · `max-concurrent`(2) · `chunk-cells`(1,440) | 고정 상수 | 서버 사양에 묶인 값 — "고객사마다 달라야 하는가"(§0.5) |
| D10 | 작성기 위치 | `common/export/`(도메인 무지) | `premium/apm/` 안 | ZM-156(premium)·I7 자빅스 아카이빙(**premium 밖**)이 같이 써야 한다 — premium에 두면 ArchUnit A1로 공유 불가 |
| D11 | 마이그레이션 | **없음** | — | 새 테이블·컬럼이 필요 없다(V61 미사용) |

---

## 2. 🔴 스팬(트레이스)을 1차에서 뺀 이유

| 이유 | 설명 |
|---|---|
| 용량을 모른다 | 콜드 아카이브 설계 §6.2가 스팬 용량을 "착수 전 실측 필수"로 남겼다. 상한 20만 행이 하루치도 못 담는 설치본이 있을 수 있고 근거 있는 상한을 정할 수 없다 |
| 평평하지 않다 | attrs·events·links가 중첩 jsonb → CSV로 읽을 수 없다(JSONL만 의미) |
| 원문의 본거지 | `db.query.text`·예외 메시지가 스팬마다 있다. 마스킹 비용·위험이 가장 크다 — 스택 한 칸(예외 그룹)으로 규칙을 먼저 검증한다 |

2차 후보: `trace-summary`(평평함, CSV) → `spans`(JSONL 전용, 짧은 창 한정, 용량 실측 후).

---

## 3. 빈 값과 0 — `coverage` 열 (RED 시계열)

| 값 | 뜻 | 수치 칸 |
|---|---|---|
| `DATA` | 그 칸에 행이 있다 | 채움. 요청 0건이면 `requests=0`, 오류율·지연은 빈 칸(잴 것이 없었다) |
| `NO_DATA` | 닫혔고·보존 안이고·롤업도 지났는데 행이 없다 = **수신이 없었다** | 빈 칸 |
| `PARTIAL` | 칸이 아직 닫히지 않았다(1m은 적재 여유 2분 포함) | 있으면 채움(값이 늘 수 있음) |
| `NOT_ROLLED_UP` | 5m·1h에서 롤업 워터마크 뒤 | 빈 칸(1m에는 있을 수 있음) |
| `OUT_OF_RETENTION` | 그 해상도 테이블의 보존 밖 | 빈 칸 |

- 판정 순서: PARTIAL → DATA → OUT_OF_RETENTION → NOT_ROLLED_UP → NO_DATA (`ApmExportCoverage`).
- `activeRequests`(GAUGE)는 RED 행과 **독립**이다 — 트래픽이 없어도 보고된다.
- 신뢰도 플래그(`rebucketed`·`mixedBounds`·`sampleWarning`)는 화면과 달리 **칸마다** 싣는다.
- 🔴 창은 **칸 경계로 넓힌다**(시작 내림·끝 올림). 화면처럼 칸 중간에서 자르면 첫 칸이 비어 "수신이 없었다"로 읽힌다. 실제 창은 계획·헤더·`_meta`로 되돌린다.

---

## 4. 🔴 원문 마스킹 — 화면보다 엄격한 이유

| 상황 | 화면(`ApmRawTextPolicy`) | 내보내기 |
|---|---|---|
| `keep_raw_sql=false`, 비관리자 | 저장값 그대로("이미 가렸다") | **마스킹 적용** |
| `keep_raw_sql=true`, 비관리자 | 마스킹 | 마스킹 |
| 관리자, `rawText` 미지정 | 원문 | **마스킹** |
| 관리자, `rawText=true` | — | 원문(+ WARN 감사 로그) |
| 비관리자, `rawText=true` | — | 🔴 **본문 전 403** |

- 파일은 DB보다 통제가 약하다(백로그 §I4 주의).
- 🔴 `keep_raw_sql`을 **켰다가 끈** 설치본에는 켜져 있던 동안의 원문이 남는다(소급 마스킹 없음). 설정만 보고 "이미 가렸다"고 믿으면 그 행이 나간다 → 화면에도 같은 틈이 있다(보고서 미결 #3).
- 마스킹은 멱등(`ApmSqlMasker`는 리터럴 → `?`)이라 두 번 걸어도 문제없다.
- 권한 판정은 `ApmAccessChecker.canViewRawText` 하나 — 내보내기가 원문 열람을 우회하는 통로가 되지 않는다. 원문 요청은 **데이터셋과 무관하게** 관리자만(원문 칸이 새 데이터셋에 생길 때 조용히 열리지 않게).
- `messageNorm`은 이미 정규화된 값이라 원문으로 보지 않는다(화면과 같은 판단).
- 콜드 아카이브 §6.5와 같은 경계: **작성기는 마스킹을 모른다** — APM 원천이 가린 값을 넘긴다.

---

## 5. 형식 규칙 (콜드 아카이브 §6.1과 일치)

| | CSV | JSONL |
|---|---|---|
| 용도 | 사람이 엑셀로 연다 | 다시 넣는다 |
| 인코딩 | UTF-8 + BOM, CRLF (RFC 4180) | UTF-8, LF |
| NULL | 빈 칸 | `null` |
| 실수 | `Double.toString`(왕복 가능), NaN·무한대는 빈 칸 | 숫자, NaN은 `null` |
| 🔴 수식 주입 | 텍스트·JSON 칸이 `= + - @ \t \r`로 시작하면 앞에 `'` (OWASP) — 수치 칸은 손대지 않는다 | **값을 바꾸지 않는다** |
| 메타 | 없음(절단·실패 때만 `#` 줄) | 첫 줄 `{"_meta":…}`, 끝 줄 `{"_end":…}` |
| 완결 판정 | 계획/헤더의 `rows`와 비교 | `_end` 줄 존재 |
| 중첩 값 | JSON 문자열 한 칸 | 중첩 객체 |
| 시각 | `…Ms`(epoch ms) + `…At`(ISO-8601 UTC) 병기 | 같음 |

- gzip은 `Content-Type: application/gzip` + 파일명 `.gz`(`Content-Encoding`을 쓰지 않는다 — 브라우저가 풀어 버리면 확장자와 내용이 어긋난다).
- 파일명 `moveseye-apm_{dataset}[_{uid8}]_{fromUTC}_{toUTC}.{csv|jsonl}[.gz]` — 서비스 이름(한글) 미포함.

---

## 6. 구조

```
common/export/            (app, 도메인 무지 — ZM-156·I7과 공유 예정)
  TabularWriter ─ CsvTabularWriter · JsonlTabularWriter
  TabularFormat · TabularColumn
premium/apm/export/
  ApmExportController   GET /apm/exports/{dataset}/plan · GET /apm/exports/{dataset}
  ApmExportService      원문 판정 → 동시 실행(Semaphore) → plan → 상한 → stream → 감사 로그
  ApmExportRequest · ApmExportDataset · ApmExportPlanDto · ApmExportProperties
  source/  ApmExportSource(SPI: plan / write) · Plan · Sink(상한 2차 방어) · Grid · Coverage · Target
           ApmRedSeriesExporter   ApmMetricStore.redSeries/gaugeSeries를 chunk-cells씩
           ApmEndpointExporter    ApmMetricStore.routeTable (route 상한에 묶여 계획에서 전량)
           ApmErrorGroupExporter  ApmErrorQueryService.streamForExport (읽기 전용 tx + fetchSize 500)
```

- 🔴 **새 SQL을 거의 만들지 않았다.** RED·엔드포인트는 IT 검증된 `ApmMetricStore`를, 예외 그룹은 `ApmErrorQueryService`의 **목록과 같은 필터 함수**(`windowFilter`로 추출)를 쓴다. 새 SQL은 보존 옵션 1줄(`scheduler_setting.options->>'errorGroup1hDays'`)뿐.
- `ApmExportSource`는 콜드 아카이브의 `ArchiveSource` SPI와 모양(계획 → 스트리밍 쓰기)을 맞춰 두었다.
- 격자 규칙은 화면(`ApmSeriesQueryService.grid`)과 같고 `ApmExportGridParityTest`가 고정한다.

---

## 7. 한계 (⚠️)

1. **요청 스레드 점유** — 동기 스트리밍이라 파일이 끝날 때까지 스레드·(에러 그룹은) DB 트랜잭션을 붙잡는다. `max-concurrent`가 묶는다. 노드당 판정이라 다중 노드면 합이 늘어난다.
2. **에러 그룹 발생 수는 정시 내림 창에서 센다**(화면 계약 §10.2와 같은 근사) — 계획의 `countFromMs`로 알린다.
3. **보존 일수 사본** — RED·엔드포인트는 `ApmResolution`의 사본(A17)을, 예외 그룹은 옵션을 직접 읽는다. ZM-156 S2의 `ApmRetentionPolicy` 추출 때 통일.
4. **감사 테이블 없음** — 누가 무엇을 받았는지는 로그(`[APM-EXPORT]`, 원문은 WARN)로만 남는다(콜드 아카이브 §3.4 Q8과 같은 공백).
5. **스트리밍 중 실패는 HTTP로 못 알린다** — 파일 끝 표지뿐이다. 브라우저는 "완료"로 저장한다.
6. **엑셀 한 칸 32,767자** — 긴 스택은 엑셀에서 잘려 보일 수 있다(파일 값은 온전).
7. 엔드포인트 집계는 **창 전체 합산 1종**이다(시간 칸별 route 표는 2차).
