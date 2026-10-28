# APM 코드 산책 — 쉽게 읽는 해설 (강화판)

> 대상: `moveseye-be-spring`의 `otel/`(18파일) + `premium/apm/`(**264파일**, P3 포함), FE `src/pages/application-monitoring/`(**121파일**). 2026-09-01 재구성 + 같은 날 밤 P1.5(실시간 관제) 커밋 기준. 2026-09-02 §9~§11(실시간·히스토그램 경계·성능 수술) 증보. 2026-09-03 §12~§17(P2 트레이스 — 수신·롤업·조회·배포·QA·권한 전환) 증보. **2026-09-07 §18~§23(P3 운영 심화 — SLO·합성 감시·메시징/배치·리포트·홈 위젯/AI 툴·QA) 증보, BE `0ef3a2d`·FE `336bc1f`·AI `84ad916` 기준.** **2026-09-14 §24~§28(P4 RUM·K8s — 역할 교대·보안·수집/조회·K8s·P3 QA 2회차) 증보, BE master `6af7c46`(P4 병합) 기준. 🔴 P4 FE는 worktree `moveseyee_fe-p4`에서 코덱스가 검수 반영 중(미커밋)이라 FE 서술은 계약 `features/apm/core/contract_apm-p4.md` 기준이다.**
> 이 문서 하나로 "무엇이 있고 · 왜 그렇게 됐고 · 지금 어디까지 왔고 · 다음이 뭔지"를 알 수 있게 쓴 입문서다. 라인 번호·검수 항목은 `_workspace/features/apm/core/apm-p1-logic-analysis.md`(정본)에 있고 여기서는 다루지 않는다. 어떤 문서를 열어야 할지는 §D.

---

## 0. 30초 요약

```
 [고객 앱]            [고객 망 안]                  [우리 서버(BE)]                     [화면]
 Java/.NET/Node ──▶ OTel Collector ──HTTP/json──▶ /apm/otlp/v1/metrics ──▶ Postgres ──▶ 개요·서비스·알람·수집기
 (자동계측 붙임)     (모아서·거르고·토큰 붙임)     (검사→해석→등록→정규화→1분표 저장)   apm_metric_1m/5m/1h
                     (tail 샘플링: 오류·느림 100%,  ──▶ /apm/otlp/v1/traces ──▶ apm_span(7일) ──▶ 트레이스 탐색·워터폴
                      정상 2%)                     (같은 토큰·같은 검사, 트레이스 단위 잠금)    + apm_trace_summary
                                                            │                            ▲
                                                            ▼                            │
                                                     5분마다 롤업 / 매일 정리 / 5분마다 알람 평가 → Zabbix로 push
                                                     5분마다 트레이스 롤업 → 서비스 맵 엣지·예외 그룹·DB 쿼리 그룹·외부 의존(P2, §13)
```

고객 앱에 OpenTelemetry(OTel, 앱 지표를 표준 형식으로 내보내는 오픈소스) 에이전트를 붙이면, 고객 망 안의 **Collector**(수집기)가 지표를 모아 15초마다 우리 서버로 보낸다. 우리 서버는 그 묶음을 검사하고 해석해서 **1분 단위 표**에 더해 넣고, 배치가 그 표를 굵게 접고(롤업) 오래된 것을 지운다. 화면은 그 표를 읽어 서비스별 "요청·오류·응답시간·런타임"을 보여 주고, 알람은 우리가 판정한 뒤 Zabbix에 값을 밀어 Slack/Teams 배달을 공짜로 얻는다. **P2(2026-09-02)부터는 같은 수집기가 스팬(요청 하나의 구간 기록)도 보낸다** — 우리는 그것을 7일간 원본으로 두고 워터폴로 보여 주며, 5분마다 네 개의 표로 접어 서비스 맵·예외·DB 쿼리·외부 호출 화면을 만든다(§12~§15). **P3(2026-09-07)는 그 위에 운영 층을 얹는다** — 같은 1분·5분 표에서 SLO(약속 대비 남은 버짓)를 재고, 같은 스팬에서 큐·배치를 접고, Zabbix 웹 시나리오를 빌려 합성 감시를 보여 주고, 주간/월간 리포트로 굳힌다(§18~§23). **P4(2026-09-08)는 손님이 하나 더 는다** — 고객의 *고객* 브라우저가 Collector 없이 `POST /apm/rum/v1/*`로 직접 온다. 토큰이 JS에 박혀 누구나 보므로 origin·상한·PII 방어가 절반이고(§25), 5분 표에 바로 대입해 페이지별 Web Vitals를 보여 주며(§26), 서버 집계에는 절대 섞지 않는다. 같은 물결에서 Collector가 K8s 파드 컨텍스트(재시작·OOM)를 인스턴스에 붙인다(§27). 이번엔 **코덱스가 짓고 Claude가 검수**했다(§24).

---

## A. 지금까지 무슨 일이 있었나 (2026-08-26 → 09-03)

하루 반 동안 커밋 7개(BE 3·FE 3 + 미커밋 1묶음)와 문서 10여 개가 생겼고(1~10행), 그 뒤 P1.5(11행)와 **P2 하루치 17커밋**(12행)이 이어졌다. 순서대로 읽으면 "왜 지금 이 모양인가"가 보인다.

| # | 때 | 커밋 | 무슨 일 | 왜 / 당신이 알아야 할 결과 한 가지 |
|---|---|---|---|---|
| 1 | 08-26 | — | **설계 v3.1** + 화면 WBS v1.1 확정. 코덱스 설계 검수 23건 반영 | 수집 경로를 OTel 단일로, 알람은 Zabbix `history.push`로. **P1~P4 ~247일** 어림 |
| 2 | 08-31 오전 | — | **R1·R10 실측**(Collector↔BE json round-trip, Zabbix push) → 설계 v3.2 | 실측이 설계를 4곳 뒤집었다: **500은 exporter가 즉시 폐기(503만 재시도)** · exemplar에 원문 SQL → 폐기 · UpDownCounter는 delta 설정에도 CUMULATIVE → 포인트 단위 판정 · 아이템 생성 직후 push는 캐시 동기화 전 실패(대기≠실패) |
| 3 | 08-31 | BE `3b67d01` FE `223ae83` | **P1 구현 전 구간** + self-monitoring 종단 검증(BE가 자기 자신을 APM으로 감시) | 빈 DB → 수신 → 자동 등록 → 1m 적재 → 조회 → 롤업 → 알람 → **데모 Zabbix에 실 프로비저닝·push ok**. 종단이 성립한다는 것이 이 커밋의 뜻. 첫 검출 결함: Zabbix 미설정 DB의 500을 APM이 잡아 자기 자신을 DEGRADED로 판정(=정상 동작) |
| 4 | 08-31 | (3에 포함) | **코덱스 1차** 🔴1 🟡2 🟢1 | 8MB 상한이 본문을 다 읽은 **뒤** 검사되고 있었다 → 스트리밍 상한으로 교체. 동명 Zabbix 객체를 소유 확인 없이 재사용 → `owner=moveseye-apm` 태그 검증 |
| 5 | 08-31 저녁 | (3~6 사이) | 차트 **표 전환**·툴팁 가독성·**화면/차트 가이드**(위젯 67·`?` 47) | 가이드를 쓰다가 "전일 대비" 라벨이 BE 계산(직전 동일 길이 창)과 다른 것을 발견 → 라벨 정정. **설명하려고 읽으면 결함이 나온다**의 첫 사례 |
| 6 | 08-31 밤 | — | **로직 분석 문서**(1,129줄, 근거 547개) | 검수가 못 찾은 **결함 5건(A1~A5)** 발견: 알람 캐시 유예가 영원히 만족 · sync 배지가 5분 뒤 리셋 · 규칙 꺼도 Zabbix 트리거 살아 있음 · THEIRS가 임계 검증 우회 · 라이선스 만료 시 롤업만 멈춰 5m/1h 영구 공백 |
| 7 | 08-31~09-01 | FE `c7713e5` | **수집기 화면**(상태·토큰/설정 생성·설치 가이드·등록 설정 4탭) + 라이선스 만료 UX | 토큰 원문은 **1회 모달**에서만. 테스트 +100 |
| 8 | 09-01 09:03 | BE `5953444` (FE `c7713e5`) | 6의 결함 5건 수정 + **코덱스 2차** 🔴3 🟡2 반영 | 토큰 원문이 react-query mutation 캐시에 남아 있었다 → 캐시 우회 · FE가 `keepRawSql:false`를 항상 보내 전역 설정이 무효였다 → 미변경 시 생략 · 트리거 다건 on/off 부분 실패 → `TRIGGER_STATUS_PENDING` 배지+재시도 |
| 9 | 09-01 14:30 | BE `ee8ad09` FE `5f25846` | **패키지 재구성**(레이어 → 메뉴 → 기능 세트) + `otel/` 하위 분할 + 수집기 기본값 **프로퍼티화**(`config-defaults` EP) + **상세 주석 145파일** | **왜 두 번 갈랐나**: 1차로 레이어(`api/query/domain`)를 화면 메뉴(`overview/service/collector/alert/core`)로 갈랐는데, 메뉴 *안*이 여전히 `query/`·`dto/` 계층이라 기능 하나 고칠 때 세 폴더를 열어야 했다 → 2차로 메뉴 안을 "같이 바뀌는 것" 단위(`list/`·`red/`…)로 다시 갈랐다. 두 단계가 한 커밋에 들어갔다 |
| 10 | 09-01 오후 | **미커밋** | 9의 주석 작업이 **결함 8건(A22~A29)** 발견 → 수정 → **코덱스 3차** 🔴1 🟡3 → 반영. BE `:test` **2135 green** | 여덟 건 중 여섯이 "화면이 그럴듯하게 틀린 값을 보여 주는" 유형(꺼진 규칙이 적용 중으로 · 초를 ms로 · 지워진 구간을 장애로) — **증상 신고로는 절대 안 올라온다**. 3차 🔴은 A28 수정의 빈틈(꼬리 칸의 HTTP 집계 누락 → DEGRADED가 UP으로) |

| 11 | 09-01 밤 | BE `1b43bb1` FE `57dbd2b` | **P1.5 실시간 관제(Live)** + V43(히스토그램 경계 family 분리) + R3 성능 후속 + 4차 검수(🔴1 세션 바인딩 우회 등) 반영. 10의 미커밋 분량도 이 사이 전부 커밋됐다(BE `dbe9bc6`·`7e9f2d8` / FE `e8c7da9`·`4159e00`) | "지금"을 보여 주는 별도 경로(10초 인메모리 링 + SSE)가 생겼다(§9). R3 볼륨 실측(`features/apm/core/r3_apm-volume.md`)이 성능 수술 3건을 낳았고(§11), "pool wait p95가 4.7초"라는 미스터리(D2)가 히스토그램 경계 규칙을 다시 쓰게 했다(§10) |
| 12 | 09-02 | BE 9커밋(`e63c2e8`~`c5aac1a`) FE 8커밋(`9495aa4`~`3f1087b`) | **P2 트레이스 전 구간** — 1차(수신·V44 9테이블)·2차(롤업 4종·조회 EP 17)·3차(배포 감지·웹훅·전후 비교·계약 표본 7종), 코덱스 검수 5회(BE 1·2·3차 🔴 4+4+1, FE 1차 🔴2, QA 수정분 높음 1), **종단 QA 2회차**(실 트래픽 3,790요청·브라우저, 결함 15+3), FE 4물결(탐색/상세 → 맵/에러/DB/의존 + 관리자 게이팅 → 배포 탭/markLine/exemplar 칩 → 토큰 scope) | 하루에 P2가 통째로 들어왔다. 코드 자체보다 **검수·QA가 뒤집은 것**이 이야기다(§16): 동시 첫 수신이 요약을 두 행으로 · 덧셈 UPSERT가 재실행에 두 번 세고 · 에러 화면이 15분 창에서 늘 비고 · exemplar 링크가 0/23 · CUMULATIVE 극값이 800배 · 그리고 **P1부터 조회 EP에 권한 판정이 없었다**(§17) |
| 13 | 09-03 | BE `4264f57` FE `8ced9ed` | APM 권한을 역할 축(ADMIN 일괄)에서 **DMOVE 권한 옵션**(`applicationMonitoring`/`apm` 보기·편집)으로 전환 **완료**. BE `DmovePermissions`·`DmovePermissionChecker.requireEdit/hasEdit`·`ApmAccessChecker` @Component(view 36 EP·edit 26 EP)·**V48 백필(UPDATE 3문)**·`DmovePermissionBackfillIT`, FE `useApmPermissions`·사이드바/검색 13/설정 2/라우트 15·쓰기 UI 12화면·`permissionLabels.ts` | §17. 12행의 "USER 회귀"를 되돌렸다 — 조회는 기본 열림으로 복귀, 관리 화면은 `edit` 칸으로 위임 가능. BE 2568 green(신규 10)·FE 2372 pass. **런타임(V48 실적용·역할 편집 화면 렌더) 미검증**. 🔴 V48은 V27 복제가 아니다 — `dmove_permission` 기본값이 `'{}'`(객체)라 V27식 `jsonb_array_elements`가 기동 실패를 낸다(§17-2) |

| 14 | 09-07 | BE `e386e61`·`dba4386` FE `8da4251` AI `533d4c0`·`ce2d026` | **P3 1차 물결 — SLO(V51)·홈 위젯 3종·AI 툴 8종** + 코덱스 1차 검수 🔴6 🟡8 반영(V53) | 검수가 **알람의 뼈대를 뒤집었다**: 번 알람이 SRE의 서로 다른 두 알람을 **AND로** 묶고 있어 지속 장애가 안 울렸고, 롤링 창이 한 단만 읽어 "10:00 이후 장애가 30일 버짓에 없는" 구멍이 있었으며, LATENCY의 NULL 히스토그램이 분모에서 조용히 빠져 "정상 100건 + 못 잰 9,900건 = SLI 100%"가 가능했다(§18) |
| 15 | 09-07 | BE `1498082`·`b2c85dd` FE `b7fcac9` | **P3 2차 물결 — 합성 감시(Zabbix httptest 엔진 계약·V52)·메시징 5m 롤업·배치 잡 집계** + 코덱스 2차 검수 🔴6 🟡4 반영(V54) | Zabbix 쓰기 계약이 **소스 정본으로만** 성립했다: `post_type`은 Zabbix가 받지 않는 필드였고(생성·수정 전부 `-32602`), RAW/FORM 상수를 거꾸로 읽고 있었다. 배치 잡은 "하루보다 긴 것만 놓친다"고 적혀 있었는데 실제 경계는 **15분**이었다(§19·§20) |
| 16 | 09-07 | BE `19b5674`·`dcfc281` FE `a830de3`·`336bc1f` | **P3 3차 물결 — 리포트 배치(V55)·리포트 관리 편입·설치 가이드 출처 31건** + FE 계약 동기화 | 리포트를 기존 관리 화면에 **편입**하려다 `LicenseArchitectureTest` A1이 실제로 빨갛게 떴다 → `ManagedReportSource` SPI로 의존을 뒤집었다. 두 표의 **id가 겹쳐** 행 키가 `(type, id)`가 됐다(§21) |
| 17 | 09-07 | BE `0ef3a2d` AI `84ad916` (FE는 작업 트리에서 진행 중) | **P3 종단 QA**(실 Zabbix·:3001·헤드리스 Chrome, PASS 74/FAIL 3, 결함 23) → BE D1~D9·M-1~M-6 전건 반영(V56), AI A1~A8 반영 | 가장 큰 발견 셋: **SLO 번 알람이 실 Zabbix까지 완주**(같은 회차에 `2.55`/`0`/`-1` 세 값 관측) · 합성 감시의 **쉼표 든 한글 이름 아이템 키**를 BE가 읽어 낸다 · 필수 파라미터 누락이 **HTTP 500**(전역 핸들러 공백). 그리고 SLO를 *끄면* Zabbix에 열린 Problem이 영원히 남았다(D3, §23). 🔴 계약 §9.2의 **FE 할 일 8가지는 마지막 커밋에 없다 — 작업 트리에서 반영 중**(§23-4) |
| 18 | 09-07~08 | BE `5547cd0`·`05e830d` FE `20338f7`·`fd87470` | **P3 마무리** — 코덱스 3차 반영(리포트 직전 합계 실집계·공유 아이템 `-1` 금지·RESOLVE 큐·catch-up) + **QA 2회차**(재검증 전건 PASS, 새 결함 6) → D10~D13 반영. FE 잔여 8가지·`references[]`·리포트 3차 동기화 커밋 | 2회차가 D3를 두 경로 모두 실증했고(열린 Problem이 실제로 0), 유일한 MED 신규 D10 — **전역과 같은 kind의 서비스별 규칙은 트리거 이름 충돌로 영영 미동기** → 서비스별만 접미, 전역 이름 불변(§28). 🔴 D10 런타임 재현 미실시 |
| 19 | 09-08 | BE `8ec9e1c` → master **`6af7c46`**(병합) | **P4 BE — RUM(보안 계층·수신·5분 집계·조회 EP 5·토큰/스니펫 EP 6)·K8s 컨텍스트(V57)**. 🔴 **구현은 코덱스(`gpt-6-astra xhigh`, 격리 worktree), 검수는 Claude**(`features/apm/core/review_apm-p4-be_claude.md` 🔴4 🟡16 🟢5) → 코덱스 반영 → 병합. 3,051 → **3,072** green | 검수가 잡은 것: K8s OOM 속성이 메트릭이 아니라 **기본 비활성 리소스 속성**(영원히 null) · 재시작 이름이 semconv가 아님 · `observe()`가 영수증 앞이라 재전송 이중 계산 · preflight 401/403이 토큰 존재를 노출. **"3,051 green이 사실을 감췄다"**(§24-2) |
| 20 | 09-08~14 | FE worktree `moveseyee_fe-p4`(**미커밋**, 코덱스 수정 중) | **P4 FE** — RUM 목록/상세·Web Vitals 5카드·PV/세션 추이·브라우저/OS/지역·평균 timing 워터폴·JS 오류·수집기 "브라우저(RUM)" 탭·트레이스 Browser 행·인스턴스 K8s 열/배지. Claude 검수(`review_apm-p4-fe_claude.md` HIGH 2 · MEDIUM 4 · LOW 8) → 반영 진행 중 | HIGH는 `useTableColumns` 경유로 **숫자 열이 문자열 정렬**되던 것(jsdom이 못 잡는다). FE→BE 역요청 F1~F4(페이지별 TTFB·p75 시계열·상한 플래그·표본)는 **미해결**(계약 §🔄) |

**한 줄로**: 설계(1) → 실측이 설계를 고침(2) → 한 번에 종단 구현(3) → 검수·분석·주석이라는 **세 종류의 읽기**가 각각 다른 결함을 찾아냈다(4·6·10) → 그 사이 구조를 두 번 갈랐다(9) → P1.5(11) → **P2가 하루에 들어오고 종단 QA가 결함 18건을 냈다**(12) → 그중 권한이 별도 전환으로 완결됐다(13) → **P3가 하루에 세 물결로 들어오고, 검수 두 번이 알람 뼈대와 Zabbix 쓰기 계약을 고쳤고, 종단 QA가 결함 23건을 냈다**(14~17). 코드는 그 결과물이다.

---

## B. 지금 상태 · 남은 일

### B-1. P1(기반+메트릭) 완수율 — 대략 90%

| 영역 | 상태 |
|---|---|
| BE 파이프라인(수신·등록·적재·롤업·보존·조회·알람·Zabbix) | ✅ 구현·종단 검증·검수 3회 |
| FE 화면(개요·서비스 목록/상세 5탭·알람 규칙 3탭·수집기 4탭) | ✅ 구현. 브라우저 실렌더 확인은 **목록·상세 2탭만** |
| 계약·설계·분석 문서 | ✅ 코드와 동기(§D) |
| 테스트 | BE 2135 green(IT 포함) · FE 2015/2017(선재 실패 2, 계약 3건 반영 후 재실행 결과는 이 문서 작성 시점에 못 봤다) |

### B-1′. P2(트레이스) 완수율 — 대략 90% (2026-09-02 기준)

| 영역 | 상태 |
|---|---|
| BE 수신·적재(`/v1/traces`, 스팬·요약, 잠금·dedup·SQL 정책) | ✅ 실 트래픽 3,790요청 종단 검증(§12) |
| BE 롤업 4종·조회 EP 17 + 배포 4 + exemplar | ✅ 구현·검수 3회·QA 2회(§13~§15) |
| FE 화면(트레이스 탐색·상세·서비스 맵·에러·DB·외부 호출·배포 탭·markLine·exemplar 칩·토큰 scope) | ✅ 브라우저 QA(헤드리스 Chrome) 통과. **트레이스 비교(#5) 화면만 없음** |
| 권한 | ✅ DMOVE 권한 옵션(`applicationMonitoring`/`apm` 보기·편집)으로 전환 완료(09-03, BE `4264f57`·FE `8ced9ed`, §17). 런타임(V48 실적용) 미검증 |
| 실측 미완 | 대량 백필의 잠금 유지 시간·WAL(`maxBuckets` 288), BRIN 효용, 산점도의 넓은 창 성능, 타임아웃 휴리스틱 문자열 목록(§13-6) |

### B-1″. P3(운영 심화) 완수율 — 대략 85% (2026-09-07 기준)

| 영역 | 상태 |
|---|---|
| BE SLO(계산기·스냅샷·번 알람·Zabbix 정리 큐) | ✅ 구현·검수 1회·**실 Zabbix push 완주 실측**(§18·§23-1) |
| BE 합성 감시(엔진 계약 `zabbix/httptest`·매퍼·이력 페이징·바인딩) | ✅ 구현·검수 1회·**실 Zabbix 생성→수정→삭제 round-trip 실측**(§19·§23-2). `PROXY_GROUP`·`truncated:true`만 실측 못 함 |
| BE 메시징·배치(트레이스 롤업 5·6단계·V54 완료 경로) | ✅ 구현·검수·IT. 🔴 **샘플 앱이 메시징·배치 스팬을 하나도 안 내서 100% 손으로 만든 OTLP로만** 검증(§20-4) |
| BE 리포트(V55·SPI 편입·lazy 백필) | ✅ 구현·QA. 🔴 `previousTotals`가 채워진 경우·합성 가용성은 데이터가 없어 `null` 경로만 확인 |
| BE 홈 위젯 3·AI 툴 8·설치 출처 31 | ✅ 구현·QA(AI는 dev 툴 EP 단독 호출, 실 LLM 대화 미검증) |
| FE SLO·합성·메시징/배치·리포트·홈 위젯 | ✅ 4커밋(`8da4251`·`b7fcac9`·`a830de3`·`336bc1f`) + 브라우저 QA 통과. 🔴 **QA 반영분(계약 §9.2 여덟 가지)과 설치 가이드 `references[]` 렌더는 마지막 커밋에 없고 작업 트리에서 진행 중(미커밋)**(§23-4) |
| 코덱스 3차 검수(리포트·QA 반영분) | ⏳ 요청서 `features/apm/core/review_apm-p3-w3.md`만 있고 **결과 파일 없음** → ✅ 09-07 반영 `5547cd0`(§A 18행), QA 2회차 §28 |

### B-1‴. P4(RUM·K8s) 완수율 — 대략 75% (2026-09-14 기준)

| 영역 | 상태 |
|---|---|
| BE RUM 보안(전용 체인·origin·상한·PII·403 통일)·수신·5분 UPSERT·조회 5 EP·토큰/origin/스니펫 6 EP | ✅ master `6af7c46`. 검수 R1~R25·변이 B1~B5 반영, 3,072 green(`RumSchemaIT` 8·`ApmKubernetesMetricObserverIT` 1 실 PG). 🔴 **실 브라우저 번들·CORS·CSP·동의 철회 E2E 미실행**(스니펫은 Node 구문 검사만) |
| BE K8s(Collector `kubernetes` 옵션·관측기·writer·인스턴스 9필드) | ✅ 구현·검수. 🔴 **실 클러스터·RBAC·kubelet TLS 미검증** — 픽스처는 contrib 출력 계약 재현본. 5.3a(RBAC·DaemonSet 분리)는 인프라 별건 |
| FE RUM 목록/상세·수집기 RUM 탭·트레이스 Browser 행·인스턴스 K8s 열 | 🟡 worktree `p4-rum-fe` **미커밋**. 정적 게이트(`tsc`·`typecheck:contract`·eslint) green, 관련 9 스위트 248/248, 검수 필수 2건(표 정렬·Browser 색 순서) 반영 중. 브라우저 렌더 미확인 |
| 계약 왕복 | 🔴 FE→BE 역요청 F1~F4 미해결(`ttfbP75Ms`·p75 시계열·상한 플래그·표본) — BE DTO 변경 필요 |
| 로그 상관(P4 나머지) | ❌ 미착수 |

### B-2. 남은 P1 항목 (WBS 번호)

| 항목 | 규모 | 왜 아직 |
|---|---|---|
| 8.1~8.3 Collector 설치 가이드 문서·스택별 계측 가이드·고객 문서 | M×3 | 설치 가이드 *화면*(BE가 문구 생성)은 있고, **문서 파일·소개서 정정**이 없다 |
| 8.6 행위 QA(functional-qa) | M | 수집기 화면·개요·알람 화면 **브라우저 미검증**, 다크모드 미검증 |
| 8.10 라이선스 시나리오 QA | S | 미보유 403·만료 후 READ_ONLY·Collector 재시도 상한 — 시나리오로 안 돌려 봤다 |
| 홈 위젯 3종(4.5·7.19) | S+S | WBS상 P3이지만 사용자가 P1 잔여로 꼽았다 |
| A6·A7 (알람) | — | A6 대상 집합에서 빠진 스코프(HIDDEN 전환 등)의 Zabbix 객체 정리 경로 없음 · A7 전역/서비스별 규칙이 **아이템 1개를 공유**해 한쪽 삭제 시 cascade. 둘 다 "추정" 등급, 미착수 |
| 1.9 비-JVM 실측(R12 잔여) | M | 런타임 슬롯 표는 .NET/Node/Python/Go까지 있지만 **JVM만 실측**했다 |
| Zabbix **알림 도달** | — | 데모 서버에 우리 그룹을 조건으로 가진 액션이 0 → "알림 액션 없음" 배지만 확인 |

### B-3. 미커밋 상태 (승인 대기) — ✅ 09-01 커밋 완료(§A 11행). 아래는 당시 기록으로 남긴다.

- **BE 약 37파일**(+신규 테스트 3, 작성 시점에도 늘고 있음): A22~A29 결함 8건 수정 + 3차 검수 4건 반영. 마이그레이션 없음. ⚠️ 다른 에이전트가 `service/list/ApmServiceQueryService`를 고치는 중이라 파일 수는 더 늘 수 있다.
- **FE 20파일**(+신규 `shared/useApmEffectiveRules.ts`): BE 계약 변경 3건 소비 — ① 서비스 상세 임계선을 `effective` 규칙에서(§7 Q11) ② 개요 최근 알람의 `kind`를 wire 표기+`thresholdUnit`으로 ③ 가용성 스트립의 `status` 없는 칸을 빈칸으로(§7 Q12).
- 커밋 메시지 관례 `#ZM-122 [FIX] …`. 푸시는 사용자가 직접.

### B-4. P2~P4가 무엇인가 (한 줄씩)

| Phase | 내용 | 어림 | 지금 자리 |
|---|---|---|---|
| **P2 트레이스** | `/v1/traces` 수신·스팬 저장·워터폴·서비스 맵·에러/DB/외부 호출 분석·배포 | ~77일 | ✅ **2026-09-02 하루에 들어왔다**(§A 12행, §12~§16). 잔여: 트레이스 비교 화면·`maxMs`→`valueMs` 개명(권한 전환은 09-03 완료, §17) |
| **P3 운영 심화** | SLO·합성 감시(Zabbix 웹 시나리오)·메시징/배치·리포트·AI 툴·홈 위젯 | ~42일 | ✅ **2026-09-07 하루에 세 물결로 들어왔다**(§A 14~17행, §18~§23). 잔여: FE 작업 트리(QA 반영 8가지·`references[]` 렌더) 커밋·코덱스 3차 결과 |
| **P4 경험 확장** | RUM(브라우저)·로그 상관·K8s 컨텍스트 | ~28일 + 로그/K8s 별도 | ✅ **RUM·K8s는 2026-09-08 BE 병합**(§A 19행, §25~§27), FE는 worktree 진행 중(20행). 토큰의 `kind`·`scopes`가 예약해 둔 자리(§2 #3)를 RUM 토큰이 실제로 썼다. 잔여: 로그 상관 미착수·F1~F4·실 브라우저/K8s 검증 |

---

## 1. 폴더 지도

패키지는 **레이어(controller/service/dto)가 아니라 화면 메뉴**로 나뉘고, 메뉴 안은 **기능 세트**(같이 바뀌는 것끼리)로 나뉜다. "이 화면을 지운다 = 이 폴더를 지운다"가 되게 하려는 선택이다. 컨트롤러는 메뉴 루트에, 응답 DTO는 그것을 만드는 서비스 옆에 둔다.

| 폴더 | 파일 수 | 한 줄 역할 |
|---|---|---|
| `otel/` | 18 | **OTLP 공용 도구함.** `json/`(표기 읽기)·`metric/`(리더·포인트)·`histogram/`(경계 산수)·`token/`(해시)·**`trace/`(스팬 리더 6, P2 §12)**. APM과 AI 모니터링이 함께 쓴다. 도메인 로직은 안 들어온다. |
| `apm/overview/` | 10 | 메뉴 1 "개요" — 위젯 6개를 한 응답으로 + `live/`(실시간 관제 — 10초 링·SSE, §9). |
| `apm/service/` | 44 | 메뉴 2 "서비스" — `list/ red/ runtime/ instance/ status/ registry/(+auto/) hostlink/` + **`deploy/`(P2)**. |
| `apm/collector/` | 45 | 메뉴 13 "수집기" — `ingest/`(OTLP 수신 파이프라인) + `token/ config/ install/ state/ drops/ setting/` + **`ApmCollectorProperties`**(설치본별 기본값). |
| `apm/alert/` | 19 | 메뉴 12 "알람" — `rule/ evaluate/ bridge/ sync/ query/`. |
| `apm/core/` | 39 | 메뉴가 아님. `domain/`(엔티티 12+리포지토리 12), `metric/`(조회 세트 6), `batch/{rollup,retention,partition}/`(Job+Service 짝), `setting/`(전역 설정), **`security/`(`ApmAccessChecker` — 누가 읽나, §17)**. |
| **`apm/trace/`** (P2) | 39 | 메뉴 4~7 "트레이스·에러·DB·외부 호출"의 **공통 원천**. `ingest/`(스팬 적재 8, §12) · `rollup/`(4종 접기 3, §13) · `query/`(워터폴·플레임·산점도·비교 14, §14) · `errors/`·`dbquery/`·`dependency/`·`exemplar/`(조회 세트 각 3~4). 메뉴 넷이 한 원본(`apm_span`)에서 갈라지므로 메뉴 4 "트레이스" 폴더 하나에 조회 세트로 얹었다. ⚠️ 루트 `package-info.java`의 `trace` 절은 아직 **1차 물결 문구**("지금은 `trace/ingest/`만 있다", "`servicemap`은 패키지를 만들지 않았다")라 코드와 어긋난다 — 갱신 대상. |
| **`apm/servicemap/`** (P2) | 4 | 메뉴 3 "서비스 맵" — 컨트롤러·조회·DTO 2. 읽는 표는 `trace/rollup`이 만든 `apm_service_edge_5m`. |
| **`apm/service/deploy/`** (P2) | 9 | 서비스 메뉴의 "배포 탭" 세트 — 감지(`ApmDeploymentDetector`)·저장·조회·전후 비교·**웹훅 컨트롤러**(§15). 원천이 트레이스가 아니라 **메트릭 수신·인스턴스**라 `trace/`가 아니라 `service/` 아래다. |
| **`apm/slo/`** (P3) | 10 | 메뉴 10 "SLO" — 컨트롤러·`ApmSloService`·**`ApmSloCalculator`**(SLI·버짓·번 레이트의 산수)·DTO 4 + `snapshot/`(일 스냅샷 Job·Service). 번 알람의 *평가*는 `alert/evaluate/ApmSloBurnEvaluator`에 있다(§18). |
| **`apm/synthetic/`** (P3) | 15 | 메뉴 9 "합성 감시" — 컨트롤러 2(전용 화면·서비스 탭)·`ApmSyntheticService`(1,724줄, 이 폴더의 본체)·`ZabbixMapper`(Zabbix JSON ↔ 우리 DTO)·`ItemCatalog`(결과 아이템 키 규칙)·`ErrorCatalog`(실패 사유 분류)·DTO 8. 🔴 **이 메뉴만 원천이 OTel이 아니라 Zabbix**다(§19). 엔진 계약은 `engine-api …/zabbix/httptest/`. |
| **`apm/messaging/`** (P3) | 5 | 메뉴 8 앞 절반 "큐/토픽" — 컨트롤러·조회·DTO 2 + `rollup/ApmMessagingRollupStep`(5분 접기 SQL). 원본은 `apm_span`이고 배치는 **`apm_trace_rollup`의 5단계**다(§20). |
| **`apm/job/`** (P3) | 7 | 메뉴 8 뒤 절반 "배치 작업" — 컨트롤러·조회·**`ApmJobConventions`**(고객 앱이 지켜야 할 `job.*` 규약의 정본)·DTO 3 + `rollup/ApmJobRollupStep`(6단계). |
| **`apm/report/`** (P3) | 8 | 주간/월간 APM 리포트 — `ApmReportBuilder`(본문 조립 735줄)·`Service`(저장·lazy 백필)·`Controller`·`Jobs`(배치 2)·**`ApmManagedReportSource`**(관리 화면 SPI 구현)·DTO 2. 🔴 EP가 `/apm/*`이 아니라 `/admin/reports/apm/**`다(§21). |
| **`apm/overview/widget/`** (P3) | 5 | 홈 위젯 3종 — 컨트롤러·`ApmWidgetService`(30초 공용 캐시)·DTO 3(§22). |
| `apm/core/domain/` (갱신) | 34 | P3로 엔티티+리포지토리 5쌍 추가 — `ApmSlo`·`ApmSloSnapshot`·`ApmSyntheticBinding`·`ApmZbxCleanup`(Zabbix 정리 큐)·`ApmReportSnapshot`. `apm_messaging_5m`·`apm_job_run`은 메트릭 표처럼 **엔티티 없이 JDBC**. |
| **`apm/rum/`** (P4) | 21 | 메뉴 11 "사용자 경험(RUM)" — `ApmRumController`(조회 5·토큰/origin/스니펫 6)·**`ApmRumIngestController`**(공개 수신 — 라이선스 면제 목록에 FQN, 실제 HTTP 상태) + `security/`(전용 `SecurityFilterChain`·`RumOriginPolicy`·`RumRateLimiter`)·`ingest/`(`RumParser`·`RumSanitizer`·`RumStore`·`RumVital`)·`page/`(조회·DTO)·`token/`·`snippet/`. 🔴 **이 메뉴만 원천이 Collector가 아니라 브라우저**다(§25·§26). 6표 전부 **엔티티 없이 JDBC**. `rum/package-info.java`가 있다 — §C 규칙 7("루트·core·otel 세 곳만")의 **예외**(검수 R19가 요청한 것으로, 이 패키지만 톤이 달라 판단 근거를 적을 자리가 필요했다). |
| `apm/service/instance/` (갱신) | +2 | **`ApmKubernetesMetricObserver`**(`k8s.container.restarts` Gauge만)·**`ApmKubernetesStateWriter`**(재시작·OOM의 유일한 쓰기 경로 — 조건부 JDBC UPDATE 한 문장, §27-2). 원천이 메트릭 수신이라 `rum/`이 아니라 `service/` 아래다. |

⚠️ 루트 `package-info.java`는 `slo`·`overview/widget` 절은 있으나 **`synthetic`·`messaging`·`job`·`report`·`rum` 절이 없고**, 190행 부근에 "`synthetic`(메뉴9 · P3)은 패키지를 만들지 않았다"는 **옛 문구가 남아 있다** — 코드와 어긋난다(갱신 대상). `CLAUDE.md` §0.5-7 166행의 같은 문구도 마찬가지.

```
premium/apm/
├─ overview/      ApmOverviewController · QueryService · Dto
│    └─ live/     실시간 관제 — LiveBuffer · SnapshotService · SSE 컨트롤러 (§9)
├─ service/       ApmServiceController
│    ├─ list/ red/ runtime/ instance/ status/ hostlink/
│    └─ registry/ (승인 대기 화면) + registry/auto/ (자동 등록 엔진)
├─ collector/     ApmCollectorController · ApmCollectorProperties
│    ├─ config/ state/ install/ drops/ token/ setting/
│    └─ ingest/   ApmOtlpController · 파이프라인 2개
│         └─ receipt/ resolve/ normalize/ store/ drop/ status/
├─ alert/         ApmAlertRuleController
│    └─ rule/ evaluate/ bridge/ sync/ query/
├─ trace/         (P2) 스팬이 원천인 것 전부 — 메뉴 4~7이 여기서 갈라진다
│    ├─ ingest/   TraceIngestPipeline · ApmTraceWriter(잠금) · SpanStore · SummaryStore · AttrAllowlist · SqlPolicy · SampledReason
│    ├─ rollup/   ApmTraceRollupService(4종) · ApmSpanHistogramSql · ApmTraceRollupJob
│    ├─ query/    ApmTraceController · QueryService · ApmSpanTree(크리티컬 패스) · RawTextPolicy/View · DTO 6
│    └─ errors/ dbquery/ dependency/ exemplar/   (조회 세트)
├─ servicemap/    (P2) ApmServiceMapController · QueryService · DTO 2
├─ slo/           (P3) ApmSloController · Service · Calculator(산수) · DTO 4
│    └─ snapshot/ 일 스냅샷 — ApmSloSnapshotJob · Service (00:50)
├─ synthetic/     (P3) Zabbix 웹 시나리오 — Controller 2 · Service · ZabbixMapper · ItemCatalog · ErrorCatalog · DTO 8
├─ messaging/     (P3) ApmMessagingController · QueryService · DTO 2 · rollup/ApmMessagingRollupStep
├─ job/           (P3) ApmJobController · QueryService · ApmJobConventions · DTO 3 · rollup/ApmJobRollupStep
├─ report/        (P3) ApmReportBuilder · Service · Controller · Jobs · ApmManagedReportSource(SPI 구현) · DTO 2
├─ rum/           (P4) ApmRumController · ApmRumIngestController(공개 수신) · package-info
│    ├─ security/ RumSecurityConfiguration(전용 체인) · RumOriginPolicy · RumRateLimiter · RumLimitException
│    ├─ ingest/   RumParser · RumSanitizer(PII) · RumStore(5분 UPSERT) · RumVital · RumObservation
│    └─ page/ token/ snippet/   (조회 세트 · 토큰 세트 · 스니펫 세트)
└─ core/          domain/ · metric/ · batch/{rollup,retention,partition}/ · setting/ · security/(ApmAccessChecker)
```

P3에서 FE는 `slo/`·`synthetics/`·`messaging/`(메시징+배치 한 화면) 세 폴더가 채워졌고, 리포트 화면은 APM 폴더가 아니라 **`src/pages/setting/report/`**(리포트 관리 화면의 일부라서)에, 홈 위젯은 `src/pages/home/widgets/apm/`에 있다. P4(worktree `moveseyee_fe-p4`, 미커밋)에서 **`rum/`**(`ApmRumPage`·`ApmRumPageDetail` + `components/` 6)이 생기고 `planned/ApmRumPage.tsx`는 **삭제**됐다(`planned/` 폴더 자체가 비었다). 수집기의 "브라우저(RUM)" 탭은 `collectors/tabs/ApmCollectorRumTab.tsx`(+`components/ApmRumSnippetGuide.tsx`), K8s 배지는 `services/components/ApmKubernetesBadges.tsx`, 트레이스의 Browser 행은 `traces/waterfall/`가 그대로 그린다 — 폴더 판정은 종전 규칙(두 메뉴 이상이 쓰면 `shared/`)이다.

`service/deploy/`(P2 배포 감지·웹훅)는 위 그림의 `service/` 아래에 있다 — 원천이 메트릭 수신(인스턴스의 `service.version`)이라서다(§15).

FE도 같은 원칙이다 — `src/pages/application-monitoring/{overview,services,collectors,alert-rules,service-map,traces,errors,db,dependencies,deployments,synthetics,planned,shared}/`. P2에서 `errors/`·`db/`·`dependencies/`는 **사이드바에 없는 메뉴**인데도 자기 폴더를 갖는다(진입이 서비스 상세 탭·전역 검색일 뿐 화면의 크기와 소유는 노출 메뉴와 같다). 각 폴더의 `components/Apm*Explorer.tsx`가 전용 화면과 서비스 상세 탭 **양쪽의 본체**이고 탭은 `fixedServiceUid`만 넘기는 3줄 래퍼다. 판정 기준은 하나: **두 메뉴 이상이 import하면 `shared/`, 한 메뉴만 쓰면 그 메뉴 폴더**. 훅·API·타입·차트 빌더는 레포 전역 관례대로 `src/{hooks,services,types,lib/echarts}`에 그대로 둔다(폴더 안 `README.md`가 정본).

각 폴더의 `package-info.java`(루트·`core/`·`otel/` 세 곳)가 "왜 이렇게 나눴나"의 정본이다(§7 Q10).

---

## 2. 한 요청이 지나가는 길

Collector가 메트릭 한 묶음(보통 수십 KB, 수백 포인트)을 `POST /apm/otlp/v1/metrics`로 보냈다고 하자.

| # | 어디서 | 무엇을 | 왜 |
|---|---|---|---|
| 1 | `ApmOtlpController` | Content-Type이 json인지 본다. 아니면 **415**. | OTel 기본은 protobuf라 설정을 빠뜨리면 여기서 걸린다. |
| 2 | 〃 | 크기 검사. `Content-Length`가 상한을 넘으면 **한 바이트도 읽지 않고 413**, 아니면 스트리밍 복사 중 압축 2MB / 해제 후 8MB를 넘는 순간 중단·413. | 인증 전에 큰 본문을 메모리에 올리면 토큰 없는 상대도 서버를 넘어뜨린다(코덱스 1차 🔴). |
| 3 | 〃 → `ApmReceiveTokenService` | `Authorization: Bearer <토큰>`을 해시해 DB에서 찾는다. 없거나 회수됐으면 **401**. 토큰의 **`kind=COLLECTOR` ∧ `scopes`에 `ingest`**가 아니면 **403**. | 토큰 원문은 DB에 없고 sha256만 있다. scope 검사는 P4에서 브라우저에 심을 RUM 공개 토큰이 서버 적재 경로에 들어오지 못하게 지금 막아 둔 것(A10). |
| 4 | 〃 → `LicenseProvider` | `Feature.APM` 보유·만료 확인. 아니면 **403**. | 만료되면 그 순간부터 데이터 손실 — 설계된 동작이다(AI 모니터링은 503 재시도 — 의도된 차이, A9). |
| 5 | 〃 | 트레이스·로그 경로면 **200으로 받고 버린다**(`SIGNAL_NOT_SUPPORTED` 카운트). | 404를 주면 exporter 로그가 실패로 뒤덮여 메트릭 문제를 가린다. |
| 6 | 〃 | JSON 파싱. 실패하면 **400**. | 다시 보내도 같으니 재시도 의미 없음. |
| 7 | `ApmOtlpReceiptService` | 본문 sha256이 이미 처리한 것인지 **판정만**(영수증은 나중에). | 같은 배치가 두 번 오면 1분 값이 두 배가 된다. |
| 8 | `MetricIngestPipeline` → `OtlpMetricsReader` | JSON 트리를 평면 포인트 목록(`OtlpMetricPoint`)으로 편다. 깨진 노드는 그 노드만 버린다. | 포인트 하나 때문에 배치 전체를 죽이면 정상 데이터 수백 개가 사라진다. |
| 9 | `MetricIngestor` ① | 리소스의 `service.name`이 `otelcol-contrib`면 **수집기 자기 지표**로 갈라 `ApmCollectorStateService`로 보낸다. | 안 가르면 "otelcol-contrib"라는 유령 서비스가 생긴다. |
| 10 | 〃 ② → `ApmRegistrarServiceResolver` → `ApmRegistrar` | 리소스를 **서비스·인스턴스**로 바꾼다. 없으면 등록 모드(AUTO/APPROVE/ALLOWLIST)에 따라 만들거나 대기열에 넣거나 거절. | 저장 안 함은 "정책"이지 오류가 아니라 200이다. 서비스가 **삭제**되면 이 캐시를 즉시 비운다(A27 — 안 비우면 10분간 지워진 id로 적재). |
| 11 | 〃 ③ → `ApmMetricAllowlist` | 메트릭 이름이 허용목록(약 21개)에 없으면 버린다(`NOT_ALLOWLISTED`). | 카디널리티(시계열 가짓수)가 터지는 곳은 고객 서버가 아니라 우리 테이블이다. |
| 12 | 〃 ④ → `ApmDimsNormalizer` | 살릴 차원만 뽑아 키 정렬 JSON → sha256(`dims_hash`). route가 500개를 넘으면 `__other__`로 접는다. | 해시가 흔들리면 같은 시계열이 매번 새 행이 된다. |
| 13 | 〃 ⑤ → `CumulativeDeltaTracker` | 누적값(CUMULATIVE)을 **직전 관측과의 차이**로 바꾼다. 게이지·UpDownCounter는 건드리지 않는다. | 누적값을 그대로 더하면 그래프가 수백 배로 부푼다. |
| 14 | 〃 ⑥ → `ApmMetric1mStore` | 같은 (서비스·인스턴스·메트릭·차원·분) 행끼리 메모리에서 합친 뒤 **UPSERT(있으면 더하고 없으면 삽입)**. 히스토그램은 정규 경계로 맞추고(**단위까지 보고** — 초 단위 풀 메트릭은 `pool_s`, A24) 파티션이 있는지 먼저 보장한다. | JPA 없이 JDBC — 분당 1만 행 경로다. |
| 15 | `ApmIngestDropStatRecorder` | 버린 이유별 카운터를 메모리에 모았다가 10초/1000건마다 DB에 반영. | 버리는 데이터에 저장 데이터보다 많은 DB 왕복을 쓰지 않으려고. |
| 16 | 컨트롤러 | 성공하면 **영수증 기록** + `ApmIngestRecentTracker`(최근 60초 링 버퍼)에 적고 200. 적재 중 DB 장애면 **503**. | 500은 exporter가 영구 실패로 보고 즉시 폐기한다. 503만 재시도한다. |

응답 코드가 곧 데이터 생사다: **429·502·503·504만 재시도**, 나머지(200 포함)는 큐에서 지운다. 그래서 이 컨트롤러만 이 레포의 "에러도 200+body" 규약을 따르지 않는다. (P4부터 예외가 하나 더 — 브라우저가 직접 오는 `POST /apm/rum/v1/*`도 실제 HTTP 상태를 낸다. 그 길은 이 표와 **입구부터 다르다**: 전용 SecurityFilterChain·Origin·공개 토큰·preflight. §25.)

---

## 3. 폴더별 해설

### 3-1. `otel/` — OTLP 공용 도구함

OTLP(OpenTelemetry Protocol)가 JSON을 적는 방식만 안다. "이 값이 무슨 뜻인가"는 여기서 정하지 않는다. 하위 폴더는 **"무엇에 답하는가"**로 갈랐다.

| 폴더 | 클래스 | 한 줄 |
|---|---|---|
| `json/` | `OtlpJson` | 속성 배열·64비트 정수의 문자열 표기·나노초 시각·enum 숫자/이름 표기를 읽는 유틸. |
| 〃 | `OtlpModels` | 중립 값 `Temporality`(CUMULATIVE=시작 이후 누적 / DELTA=구간 증분). |
| `metric/` | `OtlpMetricsReader` | `resourceMetrics → scopeMetrics → metrics → dataPoints`를 평면 목록으로 편다. exponential 히스토그램은 여기서 explicit로 바꾼다. |
| 〃 | `OtlpMetricPoint`·`OtlpMetricKind`·`OtlpResource`·`OtlpScope`·`OtlpExemplar` | 포인트 1개와 그 부속. `OtlpResource.isCollectorName`이 "수집기인가" 판정의 유일한 출처. |
| `histogram/` | `HistogramRebucketer` | 버킷 배열을 다른 경계로 접고(🔴 `mergesExactlyInto` — **병합만 허용**, §10) 백분위(p95 등)를 보간. 순수 함수. |
| 〃 | `CanonicalBounds` | 패밀리별 정규 경계 — 자바 에이전트가 실제로 보내는 값 그대로. `familyFor(name, unit)` — **단위를 본다**(A24). |
| `token/` | `ReceiveTokenService` | 256비트 난수 토큰 생성·sha256·상수시간 비교. AI(71자 접두 형식)와 APM(64자) 두 해시 형식을 `matches`가 모두 받는다(A25). |

**함정.** 히스토그램은 "값"이 아니라 **버킷 개수 배열**이다(`counts`는 `bounds`보다 정확히 1개 길고 마지막이 +∞ 버킷). `summary` 타입은 버킷이 없어 아예 안 읽는다. `otel..`은 `premium..`·`aimonitor..`를 import하면 안 된다(ArchUnit이 막는다). AI 전용 해석기 `OtlpMetricsParser`는 이름만 보고 재사용될 위험 때문에 09-01에 `aimonitor/otel/`로 **내려보냈다**.

### 3-2. `collector/ingest/` — 수신 파이프라인

§2가 곧 이 폴더의 해설이다. 클래스만 정리하면:

| 클래스 | 한 줄 |
|---|---|
| `ApmOtlpController` | 입구. 상태 코드 계약의 주인. 라이선스 면제 목록에 FQN이 박혀 있어 자리를 옮기면 테스트가 깨진다. |
| `ApmIngestPipeline` / `MetricIngestPipeline` | 인터페이스와 유일한 구현. 리더 → 인제스터를 잇고 `route_limit` 설정을 배치마다 반영. |
| `receipt/ApmOtlpReceiptService` | 본문 해시 영수증(2일 보관). 판정은 적재 전, 기록은 적재 성공 후. |
| `resolve/ApmServiceResolver`·`ApmRegistrarServiceResolver` | 등록 엔진 어댑터. 배치 1건마다 새로 만든다. 사유는 알지만 세지는 않는다. |
| `normalize/ApmMetricAllowlist` | 저장할 메트릭·살릴 차원·히스토그램 패밀리·화면 슬롯 표. 파생 차원 `status_class`(2xx…)·`db.operation`(SELECT…). |
| `normalize/ApmDimsNormalizer` | 차원 → canonical JSON → `dims_hash`. route 상한 지킴이. |
| `normalize/CumulativeDeltaTracker` | 누적→증분. 리셋 감지(startTime 변경·값 감소). 30분 안 본 시리즈는 잊는다. |
| `store/MetricIngestor` | ①~⑥ 조립 라인. "정책 미저장"은 200, "장애로 0행"만 503. |
| `store/ApmMetric1mStore` | 1분 표 UPSERT(덧셈). 재버킷·`bounds_id` 확보·파티션 보장. |
| `drop/ApmDropReason` | 10가지 사유 enum(varchar로 저장 — 개명은 마이그레이션 사안). D2가 `RAW_BOUNDS`·`BOUNDS_CONFLICT` 둘을 보탰다(§10). |
| `drop/ApmIngestDropStatRecorder`·`ApmDropMetricKey`·`ApmIngestUnavailableException` | 카운터 버퍼 / `ROUTE_OVERFLOW`에 서비스 id를 이름에 붙이는 규약 / 503 신호. |
| `status/ApmIngestRecentTracker`·`Controller`·`Dto` | "최근 60초에 뭔가 왔나" — 온보딩 검증 버튼용, 메모리 전용. `GET /apm/ingest/drops`도 여기 얹혀 있다. |

**함정.** (1) 카운터는 `sum`이 정본이고 `count`는 반올림 산물이다. (2) 1m UPSERT는 **덧셈**이라 멱등이 아니다 — 중복 차단은 영수증 몫. (3) 첫 관측 누적값은 startTime이 120초 이내일 때만 받고 아니면 버린다(`CUMULATIVE_FIRST_SKIPPED`).

### 3-3. `collector/` 나머지 — 수집기 관리 화면

| 세트 | 클래스 | 한 줄 |
|---|---|---|
| 루트 | `ApmCollectorController`·**`ApmCollectorProperties`** | `/apm/collectors/**`·`collector-config`·`install-guide`. Properties는 `app.apm.collector.*`(큐 경로 OS별·다운로드 베이스·주소 예시) — **고객사마다 다른 값**을 코드 상수에서 올린 것. |
| `token/` | `ApmTokenController`·`ApmReceiveTokenService`·DTO 3 | 발급(원문은 응답에 1회)·회수·인증. 해시는 접두 없는 64자(컬럼이 `char(64)`). 발급 시 `scopes=["ingest"]`를 채운다. |
| `config/` | `ApmCollectorConfigGenerator`·`Service`·DTO 3 | `resources/apm/collector-template.yaml`에 endpoint·토큰 자리를 치환. `keepRawSql`이면 SQL 마스킹 프로세서를 두 곳에서 지운다(요청 생략 시 전역 설정이 기본, A8). **`defaults()`가 `GET /apm/collectors/config-defaults`**를 만든다. |
| `install/` | `ApmInstallGuideService`·`ApmInstallVersions`·`ApmInstallTarget`·Dto | OS×스택별 설치 단계를 BE가 문구로 만든다(순수 함수). 버전은 코드 상수(실측한 조합), 경로는 Properties에서 — **yaml 생성기와 같은 값**을 말해야 한다(테스트가 못박음). |
| `state/` | `ApmCollectorStateService`·`QueryService`·`MetricStore`·DTO 2 | 수집기 "지금 상태" 1행 + 센티널 시계열(큐 길이·전송 실패 추이). |
| `drops/` | `ApmIngestDropQueryService`·Dto | 드롭 통계 조회. `count`는 창 안 수가 아니라 **누적**. `from`·`to`는 서로 독립(한쪽만 주면 그 방향 무한, A26). |
| `setting/` | `ApmSettingController`·DTO 2 | 전역 설정 화면(GET/PUT). 로직은 `core/setting`. |

**함정.** 수집기 상태 화면이 답하는 질문은 하나 — "서비스가 조용한데 앱이 죽었나, 수집기가 끊겼나". 그래서 `null`(메트릭이 안 옴)과 `0`(실패 0건)을 끝까지 구분한다.

### 3-4. `service/` — 서비스 메뉴

| 세트 | 클래스 | 한 줄 |
|---|---|---|
| 루트 | `ApmServiceController` | `/apm/services/**` 14개 EP. 읽기는 로그인 사용자, PUT/DELETE만 관리자. |
| `list/` | `ApmServiceQueryService` + DTO 6 | 목록·상세·인스턴스·수정·삭제. 배치 질의 6개로 N+1 회피. `null`≠`0`. 삭제는 `afterCommit`에 등록 캐시 비움. |
| `red/` | `ApmSeriesQueryService` + DTO 5 | RED(Rate·Errors·Duration) 시계열·엔드포인트 표·상태코드·메서드·지연 히트맵·런타임. 빈 칸까지 격자로 채운다. |
| `runtime/` | `RuntimeSlotMap`·`ApmRuntimeFamilyResolver`·Dto | 언어별 메트릭 이름 → 화면 슬롯(메모리·GC·스레드…). JVM만 실측. |
| `status/` | `ApmStatusJudge`·`ApmAvailabilityService`·`ApmApdex`·Dto | UP/DEGRADED/STALE/UNKNOWN 판정, 5분 칸 가용성(보존 승격·꼬리 1m 덧대기·`status` 생략 칸, A28), Apdex. |
| `registry/` | `ApmRegistryController`·`Service`·DTO 3 | 승인 대기 목록·승인·거절·"이름 없는 앱". 전부 관리자. |
| `registry/auto/` | `ApmRegistrar`·`ApmRegistryWriter`·`ApmNaming`·`Resolution`·Ref 2 | 수신 경로가 부르는 자동 등록 엔진. 캐시 10분, `last_seen` 갱신은 60초에 1회. |
| `hostlink/` | `ApmZabbixHostLinker` | `host.name` → Zabbix 호스트 id(자산 DB만, Zabbix 호출 없음). |
| `instance/` | `ApmInstanceRowDto` | 인스턴스 행. 지표는 1m 표에서만(7일). |

**함정.** (1) 상태 판정에서 **UNKNOWN**은 "수집기도 끊김" — 이걸 STALE로 찍으면 멀쩡한 앱을 재기동하게 된다. (2) 배포 유예 10분은 `service.version`이 바뀐 새 인스턴스에만 준다. (3) `registry/`를 화면과 `auto/`로 가른 이유: 사람이 보는 승인 화면과 수신이 부르는 엔진은 같이 바뀌지 않는다.

### 3-5. `alert/` — 알람 메뉴 (§6에서 흐름 설명)

| 세트 | 클래스 | 한 줄 |
|---|---|---|
| 루트 | `ApmAlertRuleController` | 규칙 CRUD·resync·미리보기·Zabbix 상태·이력. 읽기까지 관리자. |
| `rule/` | `ApmAlertService`·`ApmAlertKind`·`ApmAlertKinds`·DTO 5 | 종류 enum 6개(ERROR_RATE·P95_LATENCY·STALE·COLLECTOR_FAILURE·ACTIVE_REQUESTS_SPIKE·SLO_BURN)와 CRUD. **`targetsOf`가 "누구에게 적용되나"의 단일 정의**(배치·화면 공용, A22). |
| `evaluate/` | `ApmAlertEvaluationJob`·`Service`·`ApmAlertEvaluator` | 5분마다 1m 원본에서 값을 재고 push·이벤트 기록. 시작부에서 `TRIGGER_STATUS_PENDING` 바인딩 재시도. |
| `bridge/` | `ZabbixAlertBridge`·Dto | Zabbix 호스트/아이템/트리거 만들기·값 push·상태 진단·소유 태그 검증. 가장 큰 파일. |
| `sync/` | `ApmAlertSyncJob`·`Service` | 매일 우리 규칙 ↔ Zabbix 객체 대조(고치지 않고 표시만). |
| `query/` | `ApmAlertQueryStore`·Dto | 개요의 "최근 알람" 조인 SQL. `kind`는 wire 표기로 변환해 낸다(A23). |

### 3-6. `core/` — 메뉴 없는 공용

| 세트 | 클래스 | 한 줄 |
|---|---|---|
| `domain/` | 엔티티 12 + 리포지토리 12 | `apm_service`·`apm_instance`·`apm_pending_service`·`apm_receive_token`·`apm_collector`·`apm_setting`·`apm_hist_bounds`·`apm_otlp_receipt`·`apm_ingest_drop_stat`·`apm_alert_rule`·`apm_alert_rule_binding`·`apm_alert_event`. **메트릭 표 1m/5m/1h는 엔티티가 없다**(JDBC 전용). 24파일로 "폴더 5개" 규칙을 넘지만 의도된 예외(FK로 얽힌 한 덩어리). |
| `metric/` | `ApmMetricStore` | 메트릭 표 집계 질의(JDBC). 센티널(service_id=0) 항상 제외, 5xx만 오류. 히스토그램 합은 컬럼 24개 전개. (구 `core/query/` — "query"는 계층 이름이라 개명) |
| 〃 | `ApmHistBoundsCatalog`·`ApmHistogramMerger`·`ApmPercentiles` | `bounds_id`→경계 캐시 / 경계 다른 벡터 병합 / p50·p95·p99 + `null`·`sampleWarning`. |
| 〃 | `ApmResolution`·`ApmTimeRange` | 1m(7일)·5m(30일)·1h(400일) 표 선택 / ms 에폭 ↔ 시스템 시간대 `timestamp`. |
| `batch/` | rollup·retention·partition 각 Job+Service | §4. `ApmPartitionService`는 **수신 적재도 요청 시점에 부른다**(배치 전용 아님). |
| `setting/` | `ApmSettingService` | 전역 설정 읽기·쓰기(30초 캐시)·롤업 워터마크. 캐시 비움은 **커밋 뒤**(A29 — 트랜잭션 안에서 재적재하면 롤백된 값이 30초간 산다). |

**함정.** 시간대 축은 **시스템 기본 시간대** 하나다(적재·파티션·조회 모두). 어느 한 곳만 UTC를 쓰면 KST에서 9시간 밀린 빈 그래프가 나오고 "데이터가 없다"로 오해된다.

---

## 4. 시간이 지나면 벌어지는 일(배치)

배치 5개는 모두 `scheduler_setting` 표의 `job_key`로 등록된다(이름이 한 글자라도 다르면 **등록 자체가 안 된다**).

```
   매 5분                 매 5분                     매일 00:30         매일 01:30              매일 02:00
 ┌────────────┐      ┌──────────────────┐      ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐
 │ apm_rollup │      │ apm_alert_evaluate│      │ apm_partition │  │  apm_retention   │  │ apm_alert_sync│
 │ 1m→5m→1h   │      │ 규칙 재고 → push  │      │ _maintain     │  │ 파티션 DROP·숨김 │  │ Zabbix 대조   │
 └────────────┘      └──────────────────┘      │ D+2 선생성    │  └──────────────────┘  └───────────────┘
   라이선스 무관         라이선스 필요            └──────────────┘    라이선스 무관           라이선스 필요
                                                  라이선스 무관
```

| 배치 | 클래스 | 하는 일 |
|---|---|---|
| 롤업 | `ApmRollupJob`·`Service` | 닫힌 버킷(2분 지연 후)만 `INSERT … SELECT … GROUP BY`로 접는다. **대입 UPSERT**라 재실행해도 두 배가 안 된다. 5m/1h는 인스턴스 축을 버린다(**1d 단은 없다**). 워터마크(어디까지 접었나)는 `apm_setting`에. 창이 통째로 비면 원본 보존 기간 안에서는 기다린다(A5). |
| 파티션 선생성 | `ApmPartitionMaintainJob`·`ApmPartitionService` | 오늘~D+2 날짜별 파티션을 만든다. DEFAULT 파티션이 없어 없으면 INSERT가 **에러**다. |
| 보존 정리 | `ApmRetentionJob`·`Service` | 1m 7일·5m 30일·1h 400일 지난 파티션 **DROP**(DELETE 아님), 30일 조용한 인스턴스·드롭 통계 삭제, 영수증 2일, `hidden_after_days`(기본 14) 미수신 서비스 **숨김**(삭제 아님). 한 단계 실패해도 나머지는 돈다. **(P4)** `rumPartitions`(RUM 5분 표 5종 30일·`apm_rum_span` 7일 DROP)·`rumErrors`(`apm_rum_js_error_group` 마지막 관측 90일 DELETE — 비파티션) 두 단계 추가(§26-5). |
| 알람 평가 | `ApmAlertEvaluationJob` | §6. **시작부에서 `TRIGGER_STATUS_PENDING` 배지가 붙은 바인딩부터** 규칙 on/off를 Zabbix 트리거에 다시 적용한다(코덱스 2차 🔴3 — 다건 중 하나가 실패하면 나머지 트리거가 계속 Problem을 내던 문제). 원하는 상태는 규칙 `enabled`에서 재독. |
| 알람 동기화 | `ApmAlertSyncJob` | §6. 같은 재시도를 하루 1회 더 한다. |

롤업이 라이선스와 무관하게 도는 이유: 만료 중에도 보존 배치는 1m 파티션을 지우므로, 롤업만 멈추면 되살렸을 때 그 구간의 5m/1h가 영구 공백이 된다(A5). 롤업은 DB 내부 파생이라 "외부 수집 중단"이라는 만료 정책과 충돌하지 않는다.

---

## 5. 화면이 물어보는 것(조회)

| 화면 | EP | 답하는 클래스 | 비고 |
|---|---|---|---|
| 개요 | `GET /apm/overview` | `ApmOverviewQueryService` → `ApmServiceQueryService.overview` + `ApmAlertQueryStore` | 위젯 6개 한 응답. 목록과 **같은 행**에서 뽑아 숫자가 어긋나지 않게. `recentAlerts[].kind`는 wire 표기+`thresholdUnit`. |
| 개요 "실시간" 패널 | `GET /apm/live/snapshot` · `GET /apm/live/stream`(SSE) | `ApmLiveStreamController` → `ApmLiveSnapshotService` → `LiveBuffer` | 🔴 DB가 아니라 인메모리 링을 읽는다(§9). 스트림의 첫 이벤트가 `snapshot`이라 연결 하나로 초기 상태까지 받는다. |
| 서비스 목록 | `GET /apm/services/overview` | `ApmServiceQueryService` (+ `ApmStatusJudge`·`ApmAvailabilityService`·`ApmRuntimeFamilyResolver`·`ApmZabbixHostLinker`) | 배치 질의 6개. `envs`·`tags`는 필터 전 전량. `availability24hPct`는 §7 Q12 규칙. |
| 서비스 상세·수정·삭제 | `GET/PUT/DELETE /apm/services/{uid}` | `ApmServiceQueryService` | PUT은 부분 수정(`null`=유지, `""`/`[]`=지움). |
| 서비스 적용 규칙 | `GET …/{uid}/alert-rules` | `ApmAlertService.forService` | 같은 kind가 **두 줄**(꺼진 서비스별 + 실제 도는 전역)일 수 있다 → FE 키는 `ruleUid`, `effective`가 어느 쪽이 도는지(§7 Q11). |
| 인스턴스 표 | `…/{uid}/instances` | `ApmServiceQueryService.instances` | 1m 표만(7일 밖은 `null`). |
| 가용성 스트립 | `…/{uid}/availability` | `ApmAvailabilityService` | 창 시작이 7일 밖이면 **5m→1h로 승격**해 읽고 최근 30분은 1m으로 덧댄다(수신 여부와 HTTP 집계 둘 다). 답할 수 없는 칸은 `status` 키 자체가 없다(§7 Q12). `step`은 요청 그대로. |
| RED 추이·엔드포인트·상태코드·메서드·히트맵 | `…/{uid}/red-series` 등 | `ApmSeriesQueryService` → `ApmMetricStore` | `rebucketed`·`sampleWarning` 플래그 동반. `endpoints?sort=route` 허용. |
| 런타임 탭 | `…/{uid}/runtime` | `ApmSeriesQueryService.runtime` + `RuntimeSlotMap` | 슬롯은 맵 — 없는 슬롯은 키 자체가 없다. |
| 승인 대기·이름 없는 앱 | `/apm/services/pending`, `/unknown` | `ApmRegistryService` | 관리자. |
| 수집기 목록·시계열 | `/apm/collectors`, `…/{id}/series` | `ApmCollectorQueryService` → `ApmCollectorMetricStore` | 센티널 시계열은 별도 스토어. 회수된 토큰의 수집기도 STALE로 남는다. |
| **설정 폼 기본값** | `GET /apm/collectors/config-defaults` | `ApmCollectorConfigService.defaults` ← `ApmCollectorProperties` | 큐 경로(OS별)·다운로드 베이스·주소 예시·slowMs·normalPct·memoryLimitMib. FE는 손대지 않은 칸만 이 값으로 채운다(`useApmConfigDefaultsSync`). |
| 설정 yaml·설치 가이드 | `POST /apm/collector-config`, `GET /apm/install-guide` | `ApmCollectorConfigService`·`ApmInstallGuideService` | yaml은 `text/yaml`·`no-store`. 회수된 토큰은 거절. |
| 토큰·설정·수신 확인·드롭 | `/apm/receive-tokens`, `/apm/settings`, `/apm/ingest/recent`, `/apm/ingest/drops` | `ApmReceiveTokenService`·`ApmSettingService`·`ApmIngestRecentTracker`·`ApmIngestDropQueryService` | 발급 `withConfig`면 완성 yaml을 **그 응답에만** 싣는다. |
| 알람 규칙·이력·Zabbix 상태 | `/apm/alert-rules/**`, `/apm/alert-events` | `ApmAlertService` | `notOwnedConflicts`(동명 미소유 객체 수) 포함. |

| **(P2) 트레이스·산점도·상세·플레임·비교** | `GET /apm/traces`, `/scatter`, `/{traceId}`, `/flame`, `POST /compare` | `ApmTraceQueryService` + `ApmSpanTree` | §14. 총계 10만 상한(`totalCapped`), 산점도는 칸별 표본, 상세는 전위 순회 순서. 404는 "만료"로 안내 |
| **(P2) 서비스 맵·엣지 시계열** | `GET /apm/service-map`, `/service-map/edges/series` | `ApmServiceMapQueryService` | 노드 id `kind:ref`, env 필터는 호출하는 쪽만, 엣지 2,000 상한. 빈 구간은 점을 안 만든다 |
| **(P2) 에러·DB·외부 의존** | `/apm/errors/**`, `/apm/db/**`, `/apm/dependencies/**` | `ApmErrorQueryService`·`ApmDbQueryService`·`ApmDependencyQueryService` | 에러 `count`는 1시간 버킷 근사(§16-1), DB 기본 정렬 `totalMs`, 타임아웃≠오류 부분집합. 상세는 LEFT JOIN(창 밖이어도 404 아님) |
| **(P2) exemplar 점프** | `GET …/{uid}/exemplars` | `ApmExemplarQueryService` | `stored`(§16-2)·`maxMs`=exemplar 자신의 값(§16-3) |
| **(P2) 배포** | `GET …/{uid}/deployments`, `/deployments/{id}/compare`, `/new-errors`, **`POST …/{uid}/deployments`(웹훅)** | `ApmDeploymentService`·`ApmDeploymentWebhookController` | §15. 목록 기본 창 30일. 웹훅만 실제 HTTP 상태 코드 |

| **(P3) SLO** | `GET /apm/slos?service=`, `/{sloUid}`, `/{sloUid}/series`, `POST/PUT/DELETE /apm/slos[/{uid}]` | `ApmSloService` → `ApmSloCalculator` | §18. 목록은 서비스 축 배치 질의(SLO 수와 무관). 상세의 `calendar`는 스냅샷 + **오늘 칸만 조회 시점 재계산**. 쓰기는 `edit` |
| **(P3) 홈 위젯** | `GET /apm/widgets/{status-summary,slow-services,alerts}?limit=` | `ApmWidgetService` | §22. `limit` 기본 5·상한 20, 창은 서버가 정해 `windowMinutes:60`으로 내려 준다. **30초 공용 캐시** |
| **(P3) 합성 감시** | `GET /apm/synthetics[?service&hostId]`, `/{httptestId}`, `/results`, `/calendar`, `/proxies`, `/error-catalog`, `POST/PUT/DELETE`, `GET /apm/services/{uid}/synthetics`, `POST …/bind`, `…/unbind` | `ApmSyntheticService` (+ 엔진 `ZabbixHttpTestService`) | §19. **매 호출이 Zabbix로 간다**(우리 DB는 바인딩 한 줄뿐). 식별자는 `httptestId`. `proxies`·`error-catalog`는 view |
| **(P3) 메시징** | `GET /apm/messaging/destinations`, `/series?destination=` | `ApmMessagingQueryService` | §20. 축 `(서비스·시스템·목적지·오퍼레이션)`, 최대 500줄. 🔴 목적지는 **쿼리 파라미터**(토픽 이름에 `/`가 흔하다). `step`은 300 고정 |
| **(P3) 배치 작업** | `GET /apm/jobs`, `/jobs/runs?name=[&service]`, `/jobs/timeline` | `ApmJobQueryService` | §20. 행 축 `(serviceUid, jobName)`. `runs`는 이름이 창에 없으면 404, 필터만 0건이면 **200 + 빈 배열**. 간트는 레인당 200·전체 2,000 |
| **(P3) 리포트** | `GET /admin/reports?type=`(확장), `DELETE /admin/reports`(확장, `apmIds`), `GET /admin/reports/apm/{id}`, `/apm/detail?periodType&periodStart` | `ReportListAssembler`(SPI 병합) · `ApmReportService` | §21. 🔴 **권한이 `apm.view`가 아니라 관리자**(리포트 관리 화면 규약). `detail`은 마감된 기간이면 **그 자리에서 만들어 저장**(lazy 백필) |

| **(P4) RUM 조회** | `GET /apm/rum/pages`, `/pages/{groupId}`, `/vitals`, `/breakdown?by=browser\|os\|geo`, `/series` | `RumQueryService` | §26-4. 창 최대 30일·5분 경계 정렬(응답 `from/to`가 실제 창)·저장 행 50,000 절단은 **최신 보존**·페이지 500·상세 항목 각 50. `sessionMode`·`timingMode`·`mixedBounds`·`exceedsTopBound`를 응답이 직접 말한다. 모르는 `groupId`는 `page:null` |
| **(P4) RUM 토큰·origin·스니펫** | `GET/POST /apm/rum/tokens`, `DELETE /tokens/{id}`(·`?tokenId`), `PUT /apm/rum/origins`, `GET /apm/rum/snippet?tokenId` | `RumTokenService`·`RumSnippetService` | §25-1·§26-5. **목록까지 `edit`**(관리 화면 데이터). 발급·스니펫 응답 `no-store`, 원문은 발급 응답 한 번. 상한 3종은 재발급으로만 변경 |
| **(P4) RUM 공개 수신** | `OPTIONS`/`POST /apm/rum/v1/traces`·`/metrics?tokenId=` | `ApmRumIngestController`(전용 체인 경유) | §25. **`ApmAccessChecker`를 타지 않는다** — 세션이 아니라 Origin+공개 Bearer. 실제 HTTP 상태(204/200·400·401·403·413·415·429·503), `ApiResult` 언랩 없음 |

**읽기 EP 전부에 `ApmAccessChecker.requireRead`가 첫 줄에 있다**(P1 EP까지 소급, §17). SSE만 `canRead`로 묻고 응답을 직접 쓴다. P3 뒤의 수: **`requireRead` 54 · `requireEdit` 34 · `canRead` 1**(P2 시점 36/26에서 view +18 = SLO 3·위젯 3·합성 7·메시징 2·배치 3, edit +8 = SLO 3·합성 5). P4에서 view +5(RUM 조회)·edit +6(토큰 3·origin 1·스니펫 1·collection DELETE 1) → **59 / 40**. 리포트 EP는 이 판정을 **타지 않고** `ReportAdminAccess.require`(관리자)다. RUM 공개 수신은 판정 자체가 없다(세션이 없다).

조회 공통 규칙: `null`은 "요청이 없었다", `0`은 "측정값이 0"이다. 화면은 전자를 회색, 후자를 초록으로 그린다. P2 표에서는 하나 더 — 백분위 `null`은 "관측이 없거나 경계를 몰라 계산 못 함", `mixedBounds:true`면 건수는 정확하되 백분위만 `null`.

---

## 6. 알람이 Zabbix까지 가는 길

**왜 Zabbix에 태우나.** Zabbix에 Problem이 하나 뜨면 고객이 이미 만들어 둔 액션·미디어(Slack·Teams·Jandi·메일)·에스컬레이션·유지보수 창이 **그대로 동작**한다. 우리가 알림 채널을 새로 만들면 라우팅을 다시 만들고 고객은 알림을 두 군데서 받는다.

```
 규칙(apm_alert_rule)                    Zabbix
 ┌─ 전역 "오류율 > 5%" ─┐              호스트 그룹 "MovesEye APM"
 │  서비스별 펼침        │   생성 →      └ 호스트 "MovesEye APM" (인터페이스 없음, 태그 owner:moveseye-apm)
 │   svc A → 바인딩 A   │                   ├ 트래퍼 아이템 apm.error_rate[<uid A>]  ← history.push로 값 밀기
 │   svc B → 바인딩 B   │                   ├ 트리거 last(...)>5                      → Problem 발생/해소
 └──────────────────────┘                   └ 태그 owner/apm_service/apm_kind/apm_uid
        │ 5분마다
        ▼
 ApmAlertEvaluator: 1m 표에서 값 계산 → value > 임계 → apm_alert_event 열기/닫기(우리 화면용)
```

1. **규칙 저장**(`ApmAlertService`): 전역 규칙은 서비스 수만큼 펼쳐진다(`targetsOf`). **켜진** 서비스별 규칙이 같은 종류로 있으면 전역은 그 서비스에서 펼치지 않는다 — 꺼진 서비스별 규칙은 덮개가 아니다(A22). 종류·대상은 수정 불가(아이템 키에 들어가므로). 비활성화 = 우리 열린 이벤트 해소 → Zabbix 트리거 `status=1`(A3).
2. **프로비저닝**(`ZabbixAlertBridge.ensureProvisioned`): 그룹·호스트·아이템·트리거를 만들고 `apm_alert_rule_binding`에 id를 적는다. 동명 객체가 있어도 **`owner=moveseye-apm` 태그가 없으면 쓰지 않는다**(`ZABBIX_OBJECT_NOT_OWNED`). 액션은 **만들지 않는다**(고객 운영 정책) — 대신 `status()`가 우리 그룹/태그를 조건으로 가진 활성 액션 수를 세어 "알림 액션 없음" 배지를 띄운다.
3. **평가**(`ApmAlertEvaluationService.evaluateAll`, 5분): 켜진 규칙만 → 값이 **없으면 아무것도 안 한다**(요청 0건을 오류율 0%로 밀면 죽은 서비스가 가장 건강해 보인다) → 값을 push → `value > 임계`면 우리 이벤트 열기, 아니면 열린 것 닫기.
4. **판정식은 Zabbix 트리거와 같다.** STALE만 예외 — 마지막 수신 시각은 Zabbix가 모르므로 우리가 판정해 넘었을 때만 경과 분을, 아니면 0을 밀고 트리거는 `>0`이다.
5. **Zabbix eventid 짝 맞추기**는 다음 실행에서(push 직후엔 Problem이 아직 없다). `problem.get recent:true`는 안 쓴다(해소된 것까지 준다).
6. **동기화**(`ApmAlertSyncService`, 매일): 표현식이 다르면 `drift=true`만 세운다(사람이 Zabbix에서 바꾼 결정을 되돌리지 않는다). 객체가 사라졌으면 다시 만들고, `NOT_SUPPORTED` 아이템은 사유를 적는다. **배지는 세운 쪽이 내린다**(A2 — 평가 배치가 sync 배지를 지우지 않는다). 되돌릴지는 화면의 resync(OURS/THEIRS)로 사람이 고르고, THEIRS도 임계 검증을 통과해야 한다(A4).

**함정.** `pendingCache`(방금 만들어 Zabbix 서버 캐시를 기다리는 정상 상태, 몇십 초)와 `missing`(못 만든 실패)을 한 칸에 뭉치면 화면이 "기다리세요"와 "고치세요"를 구분 못 한다. `cache_ready`는 **첫 push 성공에서만** true가 된다(A1 — 예전엔 매 배치 갱신되어 유예가 영원했다).

---

## 7. 자주 헷갈리는 것 14개 (+ P4 4개)

**Q1. 왜 `core/`에 `setting`이 있나?** 보존 일수·등록 모드·stale 분·route 상한은 설정 *화면*의 것이 아니라 수신·배치·조회·등록이 다 읽는 **APM 전역 설정**이라 core로 올렸다. 화면 계약(DTO·컨트롤러)은 `collector/setting/`에 남았고, 그래서 `core → collector` import 2줄이 아직 남아 있다(세 번째 줄을 늘리지 말 것).

**Q2. `ingest`와 `collector`의 차이는?** `collector/`는 "수집기" **메뉴** 전체(토큰·yaml·가이드·상태·설정)이고, `ingest/`는 그 안에서 **OTLP를 받아 저장하는 파이프라인**만이다. 수신 컨트롤러가 수집기 메뉴에 있는 이유는 토큰이 그 메뉴 소유이기 때문이다. P2의 `/v1/traces` 수신도 **입구는 여기**다(같은 컨트롤러·같은 토큰·같은 형식/크기/중복 검사) — 다만 파이프라인은 `trace/ingest/TraceIngestPipeline`로 갈라진다(§12-3). "수신 입구는 수집기 메뉴, 적재는 트레이스 메뉴"가 2026-09-02에 정리된 경계다.

**Q3. 1m·5m·1h가 왜 세 개인가?** 1분 해상도를 400일 두면 수십억 행이라 "지난 3개월 p95" 한 장에 그 전부를 훑는다. 최근 7일은 1m(인스턴스 축 있음), 30일은 5m, 400일은 1h(둘 다 서비스 합산). `ApmResolution`이 창 길이로 표를 고른다.

**Q4. 토큰은 왜 한 번만 보이나?** DB에는 sha256만 있어 서버도 원문을 모른다. 되돌릴 수 있게 저장하면 DB 유출 시 남의 텔레메트리를 위조할 재료가 된다. 잃어버리면 재발급(=옛 토큰 즉시 무효). 그래서 yaml 생성 EP도 `${RECEIVE_TOKEN}` 자리표시만 남긴다(발급과 같은 요청일 때만 채운다). FE도 원문을 react-query 캐시에 두지 않고 컴포넌트 지역 상태에만 둔다.

**Q5. 왜 404는 오류율에 안 들어가나?** `ApmMetricStore.ERROR_STATUS_CLASS = "5xx"`. 4xx는 클라이언트 잘못이라 서비스 상태가 아니다. 상태코드 원값은 저장하지 않고 `status_class`(1xx~5xx)로 접는다 — "418이 몇 건"은 트레이스(P2)의 몫.

**Q6. 재버킷(rebucket)이 뭔가?** 수신 히스토그램의 버킷 경계가 우리 정규 경계(`CanonicalBounds`)와 다를 때 다른 격자로 접는 것. 🔴 09-01(D2)부터 **병합만 허용**한다 — `mergesExactlyInto`(목적 경계가 소스 경계의 부분집합)일 때만 접고, 소스보다 촘촘한 격자로 나눠 담는 것은 없는 분포를 지어내는 일이라 금지됐다. 접을 수 없으면 수신 격자 **그대로** 저장하고 `RAW_BOUNDS`를 센다(전말은 §10). 접은 행은 `REBUCKETED` 카운터와 응답의 `rebucketed` 플래그로 알린다. 자바 에이전트 기본 조합에서는 0건이어야 정상이다.

**Q7. `cache_ready`(pendingCache)가 뭔가?** Zabbix는 아이템을 만든 직후 서버 설정 캐시가 동기화되기 전까지 `history.push`를 받지 않는다. 그 "곧 낫는 대기"를 실패와 구분하려고 바인딩에 따로 센다. 실패라면 `missing`이다.

**Q8. `__other__` route가 뭔가?** 서비스당 route가 `route_limit`(기본 500)을 넘으면 새 route는 `__other__` 한 줄로 접힌다. LRU로 밀어내지 않는다(밀어내면 시간이 지나며 시계열이 무제한이 된다). 엔드포인트 표에 내 API가 없으면 `otherRoutes` 배지를 먼저 본다.

**Q9. 센티널 `service_id = 0`이 뭔가?** 수집기 자기 지표(큐 길이·전송 실패)를 `apm_metric_1m`에 `service_id=0`으로 넣어 추이를 본다. `ApmMetricStore`는 이 값을 **항상 제외**하고, 수집기 시계열은 `ApmCollectorMetricStore`가 따로 읽는다. 진짜 서비스에 0을 쓰면 안 된다.

**Q10. `package-info.java`가 뭔가?** 자바 패키지 자체에 붙는 주석 파일이다. 이 트리에서는 "왜 이렇게 나눴나·어디에 넣을까·남은 순환 의존"을 적어 둔 **설계 메모**로 쓴다(`otel/`, `premium/apm/`, `premium/apm/core/` 세 곳). 새 클래스를 어디 둘지 고민되면 먼저 연다. P2·P3 메뉴의 빈 패키지는 **만들어 두지 않았다**("있는데 비었다"로 읽혀 더 헷갈렸다).

**Q11. `effective`가 뭔가?** 서비스 상세의 "적용 규칙" 응답(`GET …/{uid}/alert-rules`)에 붙는 불리언. 예전엔 화면이 "서비스별 규칙이 있으면 전역을 덮는다"를 **켜짐 여부와 무관하게** 적용해서, 서비스별 규칙을 꺼 둔 종류는 전역 규칙이 응답에서 빠졌다 — 실제로는 그 전역 규칙이 감시 중인데 차트의 임계선이 사라졌다(A22). 지금은 배치와 화면이 같은 판정(`targetsOf`: **활성** 서비스별 규칙만 덮개)을 쓰고, 꺼진 규칙도 목록에 남기되 `effective=false`, `appliedRuleUid`가 실제 도는 규칙을 가리킨다. 그래서 같은 kind가 두 줄일 수 있고 FE 키는 `ruleUid`다.

**Q12. 가용성 스트립에서 `status`가 없는 칸이 뭔가?** "답할 수 없는 칸"이다 — ① 읽는 단의 버킷이 칸보다 굵거나(1시간 단으로 5분 칸을 물으면 "그 5분에 왔나"에 답할 수 없다) ② 보존(400일)마저 넘었다. **`UNKNOWN`과 다르다**: UNKNOWN은 "수신이 없었고 수집기도 조용했다"는 **관측 결과**고, 생략은 **관측 자체가 없다**. FE는 회색이 아니라 빈칸/빗금으로 그린다. 퍼센트(`availability24hPct`)는 `UP+DEGRADED ÷ 판정된 칸` — **UNKNOWN과 생략 칸은 분모에서 뺀다**(수집기 사고는 앱 책임이 아니다), DEGRADED는 깎지 않고(느려도 응답했다), 판정된 칸이 0이면 0%가 아니라 `null`(모름)이다.

**Q13. 왜 FE에 기본값을 내려주나(`config-defaults`)?** 큐 경로·다운로드 베이스·주소 예시는 **고객사마다 다른 값**(폐쇄망 미러, 사이트 표준 디렉터리)이라 코드 상수에서 `app.apm.collector.*` 프로퍼티로 올렸다. 그런데 FE가 기본값을 자기 쪽에 하드코딩해 두면 프로퍼티를 바꾼 설치본에서 **화면이 안내한 경로와 생성된 yaml이 갈라진다**. 그래서 서버가 EP로 내려 주고, FE는 사용자가 손대지 않은 칸만 그 값으로 채운다. 우선순위는 **요청(FE 입력) > 프로퍼티 > 코드 기본값**. 버전 번호(0.159.0·2.31.1)는 프로퍼티가 아니다 — 실측한 조합이라 고객이 바꾸면 검증되지 않은 설치가 된다.

**Q14. 실시간 화면과 1분 표의 숫자가 서로 다르다 — 버그인가?** 아니다. **다른 저장소를 다른 시각 축으로 읽는다**(§9). 실시간은 인메모리 링(에폭 기준 10초 칸, exporter가 내보낸 시각)이고 1분 표는 DB(KST 벽시계 1분 칸, 이미 닫힌 분만)다. 실시간의 마지막 칸들은 늦게 온 값으로 계속 채워지는 중이라 순간 비교는 성립하지 않는다. 정확한 값·과거·판정은 언제나 1분 표 쪽이 정본이다 — 링은 그 표에 **이미 저장된 것**을 조금 일찍 보여 주는 창일 뿐이다(적재 성공 후 훅이라 링에만 있는 데이터는 없다).

**Q15. (P4) RUM은 왜 1분 표·롤업을 안 쓰고 5분 표에 바로 쓰나?** 질문이 다르다. 서버 메트릭은 "이 인스턴스가 지난 1분에 어땠나"까지 묻고 400일을 보존하므로 1m→5m→1h 세 단이 필요했다(Q3). RUM은 "이 페이지 그룹의 p75가 어떤가"뿐이고 인스턴스 축이 없으며 보존이 30일이다. 단 하나면 롤업·워터마크·원본 표가 전부 필요 없고, 수신 트랜잭션 하나에 영수증까지 넣을 수 있다(§26-3). 대가는 눈금이 언제나 5분이라는 것 — "지난 15분" 창에 점이 셋뿐이다.

**Q16. (P4) RUM 세션 수가 GA(또는 다른 도구)보다 훨씬 많다 — 버그인가?** 아니다, **정의가 다르다**. 우리 세션은 (페이지·브라우저·OS·국가·5분 버킷)별 distinct의 **합**이라 한 사람이 한 페이지에 30분 있으면 6이고 세 페이지를 오가면 더 는다. 전체 기간 고유 세션을 내려면 해시를 기간 내내 들고 있어야 해서 30일치 해시 표가 필요하다(§26-3). 응답의 `sessionMode`가 그 정의를 문자열로 말하고 FE 각주가 반복한다. 비교하려면 PV를 쓴다.

**Q17. (P4) preflight가 왜 401을 절대 안 주나?** `OPTIONS ?tokenId=1..N`을 임의 Origin으로 훑을 때 "토큰 없음 401 / origin 불일치 403"이 갈리면 **살아 있는 토큰 id가 열거**된다. 토큰 원문은 못 알아내도 "7번은 살아 있고 origin은 이것이 아니다"까지는 알려 주는 셈이라, 모든 거부를 같은 403·같은 본문으로 접었다(§25-4, `ApmOtlpController`가 같은 원칙을 P1부터 지켰다). 401은 POST의 Bearer 검증 실패 하나뿐이고 그것은 원문을 이미 아는 상대에게만 간다.

**Q18. (P4) K8s 재시작 배지가 왜 5분 뒤에 꺼지나 — 이력은 어디 갔나?** 배지(`restarted`/`oomKilled`)는 "이 조회 창에서 **방금**"이라는 뜻이고 시각(`restartedAt`/`oomKilledAt`)은 이력이라 남는다(§27-2). 둘을 하나로 만들면 — 배지를 영구히 켜 두면 "언제 일어났나"를 배지가 말할 수 없고, 시각을 5분 뒤 지우면 이력을 잃는다. FE가 `재시작`(색)과 `재시작 · 이력`(회색)을 가르는 이유다. 그리고 그 시각은 실제 종료 시각이 아니라 **텔레메트리 관측 시각**이다(수집 주기 30초 + 전송 지연만큼 늦다).

---

## 8. 고치고 싶을 때 어디를 여나

| 하고 싶은 것 | 여는 곳 | 같이 볼 것 |
|---|---|---|
| 허용 메트릭 추가 | `collector/ingest/normalize/ApmMetricAllowlist.buildTable` | 히스토그램이면 `otel/histogram/CanonicalBounds.familyFor`(이름+단위), 화면에 띄우려면 `service/runtime/RuntimeSlotMap` |
| 상태 판정 임계 기본값(오류율 5%·p95 2000ms·stale 5분·route 500·hidden 14일) | `core/setting/ApmSettingService.DEFAULTS` | V38 시드와 같아야 한다. 화면은 `/apm/settings` |
| **설치본별 기본값**(큐 경로·다운로드 미러·주소 예시) | `application.yml`의 `app.apm.collector.*` (env `APM_QUEUE_DIR_LINUX`·`APM_QUEUE_DIR_WINDOWS`·`APM_DOWNLOAD_BASE_URL`·`APM_ENDPOINT_HINT`) | 바인딩은 `collector/ApmCollectorProperties`. 키를 생략하면 코드 기본값, **빈 값을 명시하면 기동 실패**. yaml 생성기와 설치 가이드가 같은 값을 읽는지 `ApmCollectorPropertiesConsistencyTest` |
| 실시간(Live) 창·칸·상한·SSE 수명 | `application.yml`의 `app.apm.live.*` | 바인딩은 `overview/live/ApmLiveProperties`. 🔴 값 조합의 힙 추정이 `max-heap-mb`(기본 64MB)를 넘거나 창이 칸(10초)의 배수가 아니면 **기동 실패**(§9) |
| 보존 기간(1m 7일 등) | `scheduler_setting` 표의 `apm_retention` options | 코드 기본값은 `ApmRetentionJob` 상수·`ApmResolution`(사본 — 갈리면 A17). 롤업의 "기다릴지" 판정도 이 값을 본다 |
| 알람 종류 추가 | `alert/rule/ApmAlertKind`(enum 한 줄에 단위·키·심각도) | 값 계산은 `alert/evaluate/ApmAlertEvaluator`, FE 계약 이름 변환은 `ApmAlertKinds` |
| 서비스 목록/상세에 필드 추가 | `service/list/ApmServiceRowDto` + `ApmServiceQueryService` | 상세는 `ApmServiceDetailDto.from`에 필드를 펼쳐 적는다. 계약 표본 `src/test/resources/apm/contract/*.json`과 FE `typecheck:contract` |
| 설치 가이드 문구·버전 | `collector/install/ApmInstallGuideService`·`ApmInstallVersions` | 버전 올릴 때 다운로드 URL이 200인지 확인 |
| Collector yaml 템플릿 | `src/main/resources/apm/collector-template.yaml` | 치환 로직은 `collector/config/ApmCollectorConfigGenerator`. otelcol `validate` 통과본 유지 |
| 상태 판정 규칙(UP/DEGRADED/STALE/UNKNOWN) | `service/status/ApmStatusJudge.judge` | 배포 유예 `DEPLOY_GRACE`, 가용성은 `ApmAvailabilityService.statusOf`(스트립과 %가 같은 함수) |
| 응답 코드 계약(수신) | `collector/ingest/ApmOtlpController` | 500 금지·503만 재시도. 클래스 이름·위치를 바꾸면 `LicenseArchitectureTest` 목록도 |
| 드롭 사유 추가 | `collector/ingest/drop/ApmDropReason` | 추가는 자유, 개명은 마이그레이션. 32자 이내 |
| FE 새 파일 위치 | `src/pages/application-monitoring/README.md` | 두 메뉴 이상이 쓰면 `shared/`. 배럴(`index.ts`) 금지. `../`로 메뉴 경계 넘지 않기 |
| **(P2)** 스팬 속성 허용/거부·구 semconv 별칭 | `trace/ingest/ApmSpanAttrAllowlist`(`ALLOWED_KEYS`·`DENIED_KEYS`·`LEGACY_ALIAS`) | 별칭은 신 이름 우선·거부 판정보다 먼저. 절단 길이 `MAX_LONG_VALUE`(4096)는 Collector `truncate_all`과 같아야 한다 |
| **(P2)** SQL·예외 마스킹 규칙 | `trace/ingest/ApmSqlPolicy`·`ApmSqlMasker` | KEEP/MASK/DROP은 설정 두 스위치의 곱. 조회 쪽 원문 마스킹(`trace/query/ApmRawTextView`)이 같은 `MASKED`를 빌려 쓴다 |
| **(P2)** 샘플 사유 임계(2초) | `trace/ingest/ApmSampledReason.DEFAULT_SLOW_MS` | 저장값은 `SLOW_INFERRED`. FE 라벨 "느림(추정)"·툴팁의 "2초"도 함께 |
| **(P2)** 트레이스 롤업 LAG·lookback·한 입 크기 | `trace/rollup/ApmTraceRollupService`(`LAG` 3분·`LOOKBACK_BUCKETS` 2·`CHILD_LOOKAHEAD_MINUTES` 5·`DEFAULT_MAX_BUCKETS` 288) | `maxBuckets`는 `scheduler_setting`의 `apm_trace_rollup` options로도 조정. 소스 창은 버킷 경계 정렬 필수 |
| **(P2)** 예외 메시지·SQL 정규화(지문) | `db/migration/V45__apm_trace_rollup.sql`의 `apm_error_message_norm`·`apm_sql_norm` | 지우는 순서가 규칙. 바꾸면 기존 그룹과 지문이 갈려 **새 그룹**이 선다(마이그레이션 사안). 함수 본문 안에 `$$` 금지 |
| **(P2)** 서비스 맵 노드 유형 판정 | `ApmTraceRollupService.rollupEdges`의 CASE(SERVICE → QUEUE → DB → HTTP) | 화면 모양은 FE `service-map/nodes/apmMapNodeStyle.ts` |
| **(P2)** 배포 감지 창(30분)·캐시 | `service/deploy/ApmDeploymentDetector`(`LIVE_WINDOW`·`DEDUP_WINDOW`·`CACHE_TTL`) | 설정으로 열지 않았다. 부트스트랩 규칙(첫 버전 미기록)은 `observe`의 `bootstrap` 분기 |
| **(P2)** 웹훅 응답 코드·scope | `service/deploy/ApmDeploymentWebhookController`(`@ExceptionHandler`) · `collector/token/ApmReceiveTokenService.ALLOWED_SCOPES` | 이 EP만 실제 HTTP 상태. scope를 늘리면 FE 배지는 원문 표시로 버틴다 |
| **(P2)** 산점도 칸·표본 상한 | `trace/query/ApmTraceQueryService`(`DEFAULT_CELLS` 120·`MAX_CELLS` 600·`SCATTER_SCAN_CAP` 200,000·`SCATTER_MIN_PER_CELL_SCAN` 200) | 넓은 창이 느리면 칸을 줄이지 말고 창을 좁힌다 |
| **누가 APM을 읽나·관리하나·원문을 보나** | `core/security/ApmAccessChecker`(@Component — `requireRead`/`canRead`=`apm.view`, `requireEdit`/`canEdit`=`apm.edit`, `canViewRawText`=역할 축) → 실제 판정은 `auth/security/DmovePermissionChecker.has()`(관리자 우회 한 곳). 모듈·기능 문자열은 `ApmAccessChecker.MODULE`/`FEATURE`에만 둔다 | §17. 어느 EP가 view/edit인지의 기준은 "관리 화면 데이터인가"(메서드가 아니다). FE 축은 `enums/user-roles.ts`·`utils/permissions.ts`(`canViewFeature`/`canEditFeature`)·`hooks/useApmPermissions.ts`, 라벨은 `constants/permissionLabels.ts` |

| **(P3)** SLO 번 알람 창·기본 임계·상한 | `slo/ApmSloCalculator`(`FAST_WINDOW_MINUTES` 60·`FAST_CHECK_MINUTES` 5·`SLOW_WINDOW_MINUTES` 360·`SLOW_CHECK_MINUTES` 30·`SLOW_WINDOW_DIVISOR` 2.4·`MIN_BURN_THRESHOLD` 1) | 기본 임계는 `defaultBurnThreshold(windowDays)`(창에서 계산 — 상수 14.4를 고치지 말 것). 상한 `1/(1-목표)` 검증은 `ApmAlertService.validThreshold`. 값 규약 `>0/0/-1`의 `-1`은 `ApmAlertKind.VALUE_UNMEASURABLE` **한 곳** |
| **(P3)** SLO 스냅샷 시각·백필 상한 | `scheduler_setting`의 `apm_slo_snapshot`(V51 시드 00:50) · `slo/snapshot/ApmSloSnapshotService.BACKFILL_MAX_DAYS`(30) | 30일은 5m 롤업 보존과 같아야 한다 — 넘기면 원본 없는 날을 0으로 굳힌다. 보존 400일은 `ApmRetentionJob.DEFAULT_SLO_SNAPSHOT_DAYS` |
| **(P3)** 합성 감시 결과 아이템 키·history 타입 | `synthetic/ApmSyntheticItemCatalog`(`web.test.*` 5키·`HISTORY_CHARACTER=1`) | 키 형태가 틀리면 증상은 오류가 아니라 **빈 차트**다. 실패 사유 분류(정규식)는 `ApmSyntheticErrorCatalog`. 이력 페이지 크기 `ApmSyntheticService.HISTORY_PAGE_SIZE`(2만)·`MAX_HISTORY_PAGES`(25) |
| **(P3)** 합성 `stale` 임계 | `ApmSyntheticService`(주기×3, 최소 300초) | 근거 없는 상수다(§19-5). 바꾸면 계약 §3.4 표도 |
| **(P3)** 배치 잡 계측 규약(`job.*`) | `job/ApmJobConventions`(`ATTR_NAME`·`ATTR_RUN_ID`·`ATTR_TRIGGER`) + `trace/ingest/ApmSpanAttrAllowlist`의 허용 키 | 🔴 허용목록에 없으면 적재가 **조용히 버려** `apm_job_run`이 영원히 빈다(§20-3). 두 곳을 같이 본다 |
| **(P3)** 소비 지연 lookback·완료 경로 스캔 범위 | `messaging/rollup/ApmMessagingRollupStep`(1시간) · `job/rollup/ApmJobRollupStep.LATE_ARRIVAL_LOOKBACK_DAYS`(7) | 후자를 줄이는 것이 V54 인덱스 부하의 첫 조정 지점. 두 단계는 `apm_trace_rollup` 트랜잭션 안이라 실패하면 맵·에러·DB·의존까지 롤백된다(§20-2) |
| **(P3)** 리포트 배치 시각·따라잡기 | `scheduler_setting`의 `apm_report_weekly`(월 10:10)·`apm_report_monthly`(1일 10:40) · `report/ApmReportService.MAX_CATCHUP`(3) | 🔴 03:00대로 당기면 KST에서 UTC 전날이라 "지난주"가 한 주 밀린다(§21-3). `MAX_CATCHUP`은 과거 소급이 아니라 **직전 기간부터 앞으로** 닫힌 기간을 메운다 |
| **(P3)** 리포트 목록에 새 계열 추가 | `report/ManagedReportSource`(SPI) 구현 + `ReportKind` | `report/`(STANDARD)는 `premium`을 import하면 안 된다 — `LicenseArchitectureTest` A1이 막는다(§21-1) |
| **(P3)** 설치 가이드 출처 추가 | `collector/install/ApmDocRef`(enum 31) | `references[]`는 enum 전체가 아니라 **그 조합이 인용한 것**만 파생된다. 스텝·env·notice의 `refs[]`에 id를 적으면 목록에 자동으로 올라온다(양방향 테스트) |
| **(P3)** 홈 위젯 창·상한·캐시 | `overview/widget/ApmWidgetService`(`DEFAULT_WINDOW_MINUTES` 60·`DEFAULT_LIMIT` 5·`MAX_LIMIT` 20·`CACHE_TTL_MS` 30초) | 창을 바꾸면 응답 `windowMinutes`가 따라가므로 FE 문구는 자동. 캐시엔 **권한 무관 값만** |
| **(P3)** AI 툴 표시 반올림·창 상한·limit | `moveseye-ai …/tool/apm/AbstractApmTool`(`scaleFor`·`MIN_ABS` 0.000001) · `ApmTimeWindow`(90d/30d/400d) | 키 이름으로 자릿수를 고른다(`*Pct` 2·`*Ms` 1·`apdex*` 3). `limit` 밖은 오류가 아니라 클램프+`notes[]`(§22-2) |

| **(P4)** RUM 상한 기본값·범위(rps 20·본문 256KiB·일 10만) | `V57`의 CHECK + `RumTokenService.create` 검증 + FE `constants/apmRum.ts`의 `APM_RUM_LIMITS` | 셋이 같아야 한다. gzip 회선 2MiB·배치 4096·preflight 100rps는 `ApmRumIngestController`·`RumRateLimiter.PREFLIGHT_RPS` 코드 상수(§25-5) |
| **(P4)** Web Vitals 임계·격자 | `rum/ingest/RumVital`(임계 5쌍) · `otel/histogram/CanonicalBounds.rumMillis/rumScore` · V57 시드 2행 | 🔴 셋을 같이 바꾼다 — `RumSchemaIT`가 패밀리별 배열 대조로 막는다(§26-2). FE `APM_RUM_THRESHOLDS`는 페이지 행 폴백일 뿐 정본은 응답의 `goodThreshold/poorThreshold` |
| **(P4)** PII 규칙(ID 정규화·스택 필터·국가 힌트) | `rum/ingest/RumSanitizer`(`ID` 정규식·`path`·`stack`·`country`) | `{id}`는 **페이지 그룹 키**이기도 하다 — 규칙을 바꾸면 기존 그룹과 갈려 새 그룹이 선다(지문 정규화와 같은 사안). 스택 줄 판정은 `at ` 또는 Firefox 형태(§25-6) |
| **(P4)** Origin 규칙 | `rum/security/RumOriginPolicy`(`valid`·`allows`·32개) | 정확 문자열 매칭을 "친절하게" 동치화하지 말 것(§25-2). 계약 §1 표·FE `origins_invalid` 문구도 함께 |
| **(P4)** 재시작·OOM 판정·배지 TTL | `service/instance/ApmKubernetesStateWriter`(`UPDATE` CTE 한 문장·`BADGE_TTL_SECONDS` 300·pending 5분) | 판정은 SQL 한 곳에만(§27-2). 관측 대상 메트릭 이름은 `ApmKubernetesMetricObserver`(`k8s.container.restarts` Gauge) — contrib 문서와 대조 후 바꿀 것 |
| **(P4)** Collector K8s 블록 | `collector/config/ApmCollectorConfigGenerator.kubernetes()` + 템플릿의 `# K8S_RECEIVERS`·`# K8S_PROCESSORS`·`# K8S_PIPELINE` 자리표시 | `ApmKubernetesConfigTest`가 네 파이프라인의 processor 배열·순서를 본다. `k8sattributes.extract.metadata`에 `restart_count`·`last_terminated_reason`을 넣으면 contrib `Validate()`가 거부(§27-1) |
| **(P4)** 스니펫 코드·설치 명령·notice | `resources/apm/rum-snippet.js` · `rum/snippet/RumSnippetService` | 🔴 OTel JS **2.x** API. 버전을 고정하려면 `installCommand`에 `@x.y.z`(R16 미완). `__ENDPOINT__`·`__TOKEN_ID__` 두 자리표시만 치환. 출처는 `ApmDocRef.RUM_*` 3건 |

관련 마이그레이션: `V38__apm_p1.sql`(표·시드·배치 등록) · `V39__apm_setting_updated_by.sql` · `V40__apm_rollup_aggregate.sql`(배열 합 함수) · `V41__apm_alert.sql`(알람 표·배치 2개) · `V43__apm_hist_bounds_family_unique.sql`(경계 UNIQUE를 `(bounds, family)`로 — §10) · **P2**: `V44__apm_trace.sql`(트레이스 9테이블 + 폐기 통계 `signal` 축, §12-5) · `V45__apm_trace_rollup.sql`(BRIN 2·정규화 함수 2·jsonb 합·`apm_trace_rollup` 잡 시드, §13-4) · `V46__apm_trace_rollup_min_max.sql`(5분 표 3종 `min_ns`/`max_ns`, QA D5) · `V47__apm_metric_exemplar_value.sql`(메트릭 1m/5m/1h `exemplar_value`, QA D17 §16-3) · `V48__add_application_monitoring_permission.sql`(역할 jsonb에 APM 권한 백필 — 🔴 V27 복제가 아니라 **UPDATE 3문**, §17-2) · (V49·V50은 이벤트 사본 — APM 아님) · **P3**: `V51__apm_slo.sql`(`apm_slo`·`apm_slo_snapshot`·`apm_alert_rule.slo_id`·`apm_slo_snapshot` 잡 시드 00:50, §18) · `V52__apm_synthetic_messaging_job.sql`(`apm_synthetic_binding`·`apm_messaging_5m` 일 파티션·`apm_job_run` — 파티션 아님, `UNIQUE(trace_id, span_id)`, §19·§20) · `V53__apm_slo_p3_review.sql`(검수 반영 — `def_version`·스냅샷 `finalized`/`measured_until`/`requests`/당시 설정·**`apm_zbx_cleanup` 정리 큐**, 🔴 V51을 고치지 않고 새 버전으로 — 이미 적용된 DB의 checksum 때문, §18-4·§18-6) · `V54__apm_job_late_arrival.sql`(`apm_span` 루트 INTERNAL **부분 인덱스** — 늦게 도착한 장시간 배치 발견용, §20-3) · `V55__apm_report_snapshot.sql`(`apm_report_snapshot` + 배치 시드 2, §21) · `V56__apm_job_run_service_set_null.sql`(`apm_job_run.service_id` FK `CASCADE`→**`SET NULL`**, QA M-4 §23-3) · **P4**: `V57__apm_rum_kubernetes.sql`(설계의 "V39(P4)"가 실제로는 여기 — `apm_receive_token`에 `allowed_origins`·`rum_rps/body_bytes/daily_limit` CHECK 포함 · `apm_instance`에 K8s 7컬럼 + `(k8s_namespace, k8s_pod)` 부분 인덱스 · `apm_rum_add_counts` 원소별 합 함수 · `apm_hist_bounds` `rum_ms`/`rum_score` 시드 · RUM 표 6종(`page_5m`·`receipt`·`session_5m`·`timing_5m`·`error_5m` 일 파티션 30일, `apm_rum_span` 7일, `js_error_group` 비파티션) + 어제~D+2 파티션 선생성. 전부 `IF NOT EXISTS`(R17), §25~§27).

---

## 9. 실시간(Live) 파이프라인 — "지금"은 다른 길로 온다 (P1.5)

### 9-1. 왜 필요했나

저장 경로의 최소 알갱이가 **1분**이고 화면은 30초마다 그 표를 다시 읽는다. 그래서 개요·서비스 화면이 보여 주는 것은 언제나 **1~2분 전**이다. 배포 직후나 장애 순간에 사용자가 묻는 것은 "지난 한 시간 어땠나"가 아니라 "**지금** 얼마나 들어오고, 몇 개가 처리 중이고, 어디서 터지고 있나"다. P1.5는 이 세 질문만을 위한 **별도 경로**를 만들었다 — DB를 거치지 않는다.

```
 수신 스레드(MetricIngestor, 적재 성공 후) ──▶ LiveBuffer(10초 칸 인메모리 링)
                                                  │ 10초마다 tick(스레드 1개)
 브라우저 EventSource ◀── SSE(/apm/live/stream) ──┘  snapshot → bucket → heartbeat
```

BE `premium/apm/overview/live/`(7파일) + FE `src/hooks/useApmLive.ts`·`src/pages/application-monitoring/overview/live/`(3파일). 개요 메뉴 소속인 이유는 규칙 ①(메뉴 우선)이다 — 링이 답하는 질문은 개요 화면의 것이고, 수신은 그것을 먹여 줄 뿐 그 데이터를 쓰지 않는다.

### 9-2. 왜 DB가 아니라 메모리인가 (`LiveBuffer`)

10초 칸을 DB에 만들면 행 수가 6배가 되는데, 그 6배는 **15분만 살아 있으면 되는 데이터**다. 파티션·롤업·보존을 전부 통과시키는 대신, 수신 스레드가 지나가는 길에 메모리 링을 갱신한다(§2의 ⑭ 적재 성공 **후** `LiveBuffer.offer()` 훅). 순서가 중요하다 — 저장이 실패해 503으로 돌려보낼 배치를 링에 먼저 넣으면, exporter가 재전송한 같은 배치가 한 번 더 더해져 실시간 rps가 두 배가 된다. 같은 이유로 이 훅은 **절대 던지지 않는다**(던지면 이미 저장된 배치가 503이 되어 재전송·이중 계상).

링은 축이 둘이다:

| 축 | 창 | 먹여 살리는 화면 | 왜 창이 다른가 |
|---|---|---|---|
| 서비스 링 | 90칸 = **15분** | 흐르는 차트 3장(rps·액티브·오류율) | 시계열은 흐름을 봐야 한다 |
| route 링 | 6칸 = **60초** | "지금 오류 나는 엔드포인트" 표 | 🔴 route를 15분 들면 최악 메모리가 27MB → **400MB**로 뛴다. 그 표가 보는 창은 어차피 60초다 |

담는 메트릭도 **둘뿐**이다(`http.server.request.duration`·`http.server.active_requests`). JVM·DB 계열은 10초 해상도가 필요한 값이 아니다. 동시성은 링 하나에 `synchronized` 락 하나 — 무잠금 곡예 대신 정직한 락(임계 구역이 배열 인덱싱 수준이라 경합 미미). 전제 셋: **단일 인스턴스**(BE 2대면 화면이 절반만 움직인다 — 승격 조건·Redis Stream 대안은 `features/apm/realtime/devdesign_apm-live.md` §6), **휘발**(재기동하면 비어서 시작 — 그래서 과거 조회가 없다), **"약 30초 이내"이지 초 단위가 아니다**(아래).

### 9-3. snapshot 한 번 + bucket 6칸 겹침 + heartbeat

`GET /apm/live/stream`(SSE)의 이벤트 순서: 연결 즉시 `snapshot`(창 전체 90칸) → 10초마다 `bucket`(뒤쪽 **6칸**) → 30초마다 `heartbeat`(프록시가 조용한 연결을 끊지 않게). 폴링이 아니라 SSE인 이유 — 10초 폴링은 사용자당 시간당 360요청이 인증·라이선스·DB를 다시 타고, 폴링 주기와 칸 경계가 어긋나면 같은 칸을 두 번 받거나 건너뛴다. tick 스레드는 연결 수와 무관하게 **하나**고, 보는 사람이 없으면 DB도 안 읽는다(유휴 부하 0).

🔴 **왜 증분이 1칸이 아니라 6칸인가.** 파이프라인 지연이 25~35초라 **방금 닫힌 칸은 거의 항상 비어 있다**. 1칸만 보내면 실시간 차트의 맨 끝이 늘 0이다. 그래서 뒤로 6칸을 겹쳐 보내고, 화면이 늦게 도착한 값으로 빈 칸을 채운다. 겹침이 안전한 이유는 병합 규칙이 한 줄이기 때문이다 — FE(`useApmLive.ts`의 `mergeApmLive`)는 **`(serviceUid, ts)` 키로 덮어쓴다**(멱등). 같은 칸이 다섯 번 와도 마지막 값이 이길 뿐 더해지지 않는다. QA 실측(`features/apm/realtime/e2e_apm-live-qa.md` §5-5)이 이를 확증했다: SSE 캡처 1,074키에서 전형적 시퀀스가 `[0, 7, 7, 7, 7, 7]` — 처음 실릴 때는 0, 다음 tick에 채워진 뒤 불변, **값이 줄어든 사례 0건**.

읽기 쪽 계약도 §5의 규칙 그대로다: 요청 0건인 칸의 오류율·p95·액티브는 `null`(0이 아니다 — 0%로 칠하면 죽은 서비스가 초록으로 보인다). 단 **rps만 0으로 채운다** — 흐르는 차트에 구멍을 내면 조용한 구간이 장애처럼 보인다.

### 9-4. "실시간(약 30초 이내)"의 산수 — 그리고 실측

```
 에이전트 export(권장 10초) + 수집기 batch(5초) + 10초 칸 + 전송 ≈ 25~35초
```

지연 예산의 대부분이 **고객 서버 설정**(상류)에 있다. 링을 1초 칸으로 잘라도 해상도는 안 올라간다 — 데이터가 10초에 한 번 오기 때문이다. 앱이 export 주기를 기본값(60초)으로 두면 링은 60초마다 한 칸만 채워진다. 그래서 화면 문구가 "초 단위"가 아니라 "약 30초 이내"이고, 이는 계약값이다. 실측(`e2e_apm-live-qa.md` §B, 권장 설정 기준): 요청 → 링 도달 중앙값 8.9초·최대 12.6초, SSE 추가 0~10초 — **화면 도달 중앙값 ≈ 14초 · 최악 ≈ 23초**. 문구보다 여유가 있다.

부수 발견 하나: 링의 칸은 요청 시각이 아니라 **exporter가 내보낸 시각**으로 정해진다. 한 버스트가 앞뒤 칸에 나뉘어 실리므로, 초 단위 정밀 상관에는 쓸 수 없다(같은 결론의 다른 표현이다).

### 9-5. 함정 셋 — 인증·라이선스·힙

1. **`EventSource`는 커스텀 헤더를 못 싣는다.** 그래서 스트림 EP는 `x-visitor-id` 헤더 대신 `visitorId` **쿼리**도 받되, 판정은 인터셉터와 같은 코드(`VisitorSessionChecker`)로 한다. 🔴 한때 "값이 없으면 통과"였고 그것이 4차 검수의 결함이었다(다른 기기 로그인으로 세션이 밀린 브라우저가 스트림만 계속 받는 바인딩 우회) — 지금은 둘 다 없으면 401이다. 액세스 토큰을 쿼리로 받지 않는 것도 같은 결이다(프록시 로그에 평문으로 남는, SSE 인증의 가장 흔한 사고).
2. **라이선스는 연결을 여는 순간에만 검사된다**(인터셉터). 열린 스트림은 만료·회수 뒤에도 수명이 끝날 때까지 흐른다 — 그 노출 창이 곧 `stream-timeout-seconds`라서 기본값을 30분에서 **10분**으로 좁혔다. 만료되면 브라우저가 스스로 재접속하고 그 재접속이 라이선스를 다시 검사하므로 화면상 변화는 없다.
3. **`@Min`/`@Max`는 곱셈을 못 막는다.** 값마다는 합법인데 조합하면 route 슬롯 60억이 되는 설정이 검증을 통과해 기동 직후 OOM이 된다. 그래서 `ApmLiveProperties`가 어림식을 직접 계산해 힙 예산(`max-heap-mb`, 기본 64MB)과 대조하고 넘으면 **기동을 실패**시킨다 — 메시지가 곧 조정 안내다. 창이 칸의 배수가 아닐 때도 기동 실패다(내림으로 조용히 접으면 설정값과 실제 창이 달라지는데, 그 차이는 화면 어디에도 안 나온다).

FE 쪽 마무리: 연결 수명은 훅이 소유한다(토글 off·언마운트·필터 변경 시 반드시 `close()` — 안 하면 서버에 emitter가 쌓인다). 재접속은 `EventSource`에 맡긴다(우리가 닫고 새로 열면 지수 백오프가 리셋돼 죽은 서버를 계속 두드린다). 서비스 이름 옆 실시간 점(●)의 기준은 칸 수가 아니라 **최근 90초**(`APM_LIVE_DOT_WINDOW_SECONDS`)다 — 칸 수(2칸=20초)로 재던 초기안은 export 주기 60초인 앱에서 점이 거의 안 켜지는 문제가 있어 QA 권고로 시간 기준으로 바꿨다(60초 주기 + 30초 지연 = 90초).

---

## 10. 히스토그램 경계(bounds) 이야기 — 4.7초 미스터리 (D2)

### 10-1. 증상: 커넥션 풀 대기 p95가 4,734ms

런타임 탭의 "풀 대기 시간 p95"가 **4.7초**로 나왔다. 실제 대기는 밀리초대(HikariCP가 정상인 서버)였다. 그런데 화면·DB·계산 어디에도 에러가 없다 — 모든 단계가 "성공적으로" 틀린 값을 만들었다.

### 10-2. 원인: 초 단위 값이 ms 격자에 담겨 왔고, 우리가 그걸 "펴서" 담았다

자바 에이전트는 `db.client.connection.wait_time`을 **초 단위 값**으로 보내면서, 버킷 격자는 OTel SDK **기본 ms 격자** `[0, 5, 10, 25, …, 10000]`를 그대로 썼다. 값이 0.003(초)쯤이니 관측은 전부 첫 칸 `(0, 5]`에 몰린다. 적재는 이것을 우리 정규 격자 `pool_s` `[0, 0.005, …, 10]`로 재버킷했는데 — 재버킷은 "버킷 안이 균등 분포"라고 가정하고 겹치는 폭의 비율로 나눠 담는다. 첫 칸 `(0, 5]`(초!)는 `pool_s`의 앞쪽 12칸을 통째로 덮으므로, 한 칸에 몰려 있던 관측이 **0초~5초에 고르게 퍼진 분포**로 둔갑했다. 데이터에 없던 모양을 우리가 지어낸 것이고, 그 분포의 95% 지점이 4.7초다.

교훈이 규칙이 됐다: **낮은 해상도는 화면에서 알아볼 수 있지만, 그럴듯하게 지어낸 분포는 알아볼 수 없다.**

### 10-3. 해결 3단

**① 규칙 — 병합만 허용한다**(`otel/histogram/HistogramRebucketer.mergesExactlyInto`). 목적 경계가 소스 경계의 **부분집합**일 때만 접는다. 그때는 소스 버킷이 통째로 목적 버킷에 들어가므로 나누는 일 자체가 없다(오차 0). 반대로 목적 경계가 소스 버킷 안쪽을 자르면(더 촘촘하면) 접지 않는다 — 수신 격자 **그대로** 저장하고 `RAW_BOUNDS` 드롭 사유를 센다(`collector/ingest/store/ApmMetric1mStore.resolveBounds`). 잃는 것은 백분위 해상도뿐이다. `count`·`sum`·`min`·`max`는 버킷과 무관하게 정확하다.

**② V43 — 같은 숫자라도 족보가 다르면 딴 줄**(`db/migration/V43__apm_hist_bounds_family_unique.sql`). 그런데 ①에는 함정이 있었다. "그대로 저장"하려던 수신 격자 `[0,5,…,10000]`이 우리 `pool_ms` 정규 시드와 **숫자가 완전히 같다**. 경계 카탈로그(`apm_hist_bounds`)의 UNIQUE가 `(bounds)`뿐이면 두 번째 행이 조용히 삼켜지고, 조회가 앞의 `pool_ms` 행을 물어 와 초 값을 ms로 읽는다 — 이번엔 반대 방향으로 **1000배** 어긋난다("커넥션 대기 0.005ms"는 그럴듯해서 아무도 의심하지 않는다). 그래서 UNIQUE를 `UNIQUE(bounds, family)`로 넓히고, 접기를 거부한 격자는 정규 라벨 대신 `observed`(초)/`observed_ms`(ms)라는 별도 family로 등록한다. QA에서 실물이 확인됐다 — `pool_ms`(id 5)와 `observed`(id 10)가 문자 그대로 같은 배열로 **공존** 중이고, V43 이전이면 공존할 수 없던 행들이다.

**③ 조회 병합 — 접을 수 없으면 백분위를 포기한다**(`core/metric/ApmHistogramMerger`). 한 시계열 안에 경계가 다른 조각이 섞여 있으면(SDK 버전 교체·경계 변경 과도기), 정확히 겹치는 조각만 접고 나머지는 **빼고** 합친 뒤 `mixedBounds=true`를 세운다. 화면은 그 구간의 p50·p95·p99·Apdex를 `—`로 둔다.

### 10-4. "근사값"과 "미산출"은 다르다

| | `rebucketed`(해상도 조정됨) | `mixedBounds`(경계 혼재로 백분위 미산출) |
|---|---|---|
| 무슨 일이 있었나 | 경계가 달랐지만 **접을 수 있었다**(병합) | 경계가 **접을 수 없게** 섞여 있었다(분할이 되는 경우) |
| 값 | **있다 — 근사** | **없다 — `null`** |
| 왜 이 쪽인가 | 병합은 오차가 거의 0이라 주는 것이 낫다 | 분할은 날조라 그럴듯한 거짓보다 빈칸이 낫다 |
| 요청수·오류율 | 정확(버킷 무관) | 정확(버킷 무관) |
| 화면 배지 | "해상도 조정됨" | "경계 혼재로 백분위 미산출" |

같은 계열의 사유가 적재 쪽에도 둘 있다: `RAW_BOUNDS`(접기를 거부하고 원본 격자로 저장했다 — 데이터는 무사), `BOUNDS_CONFLICT`(같은 1분 행에 경계 다른 히스토그램이 부딪혀 그 행의 벡터를 NULL로 확정했다 — UPSERT **뒤**에 지운다는 순서까지가 의미다: 앞에 지우면 같은 문장이 방금 지운 자리에 다시 넣는다).

수정이 실제로 발동한 흔적도 로그로 남았다(`e2e_apm-live-qa.md` §E): 같은 메트릭이 21:08까지는 `REBUCKETED`로 접히다가 그 이후 `RAW_BOUNDS`로 바뀌었고, `poolWaitP95Ms`는 4,734ms → **p50 3.0ms**로 내려왔다. §9의 `LiveBuffer`도 같은 규칙을 쓴다 — 접을 수 없는 경계의 포인트는 히스토그램만 버리고 건수·오류는 그대로 센다(p95 하나 때문에 rps를 잃지 않는다).

---

## 11. 성능 수술 3건 (R3)

### 11-1. 계기: 합성 24시간을 부어 보니

R3(`features/apm/core/r3_apm-volume.md`)는 설계 어림을 검증하려고 합성 24시간분 **14.04M행**을 QA DB에 부은 실측이다. 행 수 어림은 정확했는데 두 가지가 틀렸다: 행당 비용이 150B가 아니라 **686B**(절반이 인덱스 — `dims_hash char(64)`가 PK 키의 46%를 먹고, PK 인덱스 하나가 1m 테이블의 41%다), 그리고 **서비스 목록 24h가 cold 13~14초**였다. 설계의 승격 조건(§4.6)에 없던 축이 가장 먼저 무너진 것이다.

### 11-2. 수술 ① 가용성 하이브리드 — 13초의 정체 (`service/status/ApmAvailabilityService`)

범인은 목록의 `availability24hPct`였다. 24시간을 5분 칸으로 판정하는데 네 질의가 전부 **1m 원본**을 읽어서, **12.96M행을 읽어 246행을 만드는** 28초짜리 질의가 됐다(EXPLAIN이 임시파일 2.8GB를 쏟았다). 게다가 캐시 키가 5분 격자라 **5분마다 첫 요청 한 건**이 이 비용을 물었다.

고침: 기준선을 **5m 롤업**으로 내리고(5분 칸 = 5m 버킷이라 판정이 굵어지지 않는다 — 잃는 것이 없다), 롤업이 아직 못 접은 **꼬리만 1m**으로 이어 붙인다. 🔴 꼬리 길이는 상수 30분이 아니라 **롤업 워터마크**가 정한다(`pctTailStart`: 창끝−30분과 워터마크 끝 중 이른 쪽). 상수만 믿으면 롤업이 밀린 동안 5m의 빈 구간을 "수신 없음"으로 읽어 **전 서비스의 가용성이 한꺼번에 떨어진다** — 롤업이 늦은 것을 앱이 죽은 것으로 그리는, 이 화면에서 가장 나쁜 오독이다. 워터마크가 아예 없으면(롤업 미실행) 창 전체를 1m으로 읽는다. 즉 롤업이 밀리면 **느려지되 틀리지는 않는다**.

### 11-3. 수술 ② 롤업 maxBuckets — 한 입 크기 제한 (`core/batch/rollup/ApmRollupService`)

정상 운영의 롤업은 회차당 1버킷, 실측 **1.2초**로 아무 문제가 없다. 위험은 **밀린 구간 따라잡기**였다 — 상한이 288(=하루치)이라 24시간 정체 복구가 **6분 39초짜리 단일 INSERT 문장**이 되고 임시파일 6.7GB를 쏟았다(5분 주기 배치가 자기 예산을 넘는다). 상한을 `DEFAULT_MAX_BUCKETS_5M` 288→**60**(5시간/회, 회차당 ~80초), `_1H` 48→**12**로 내렸다. 하루치 정체는 5회차(25분)에 나눠 따라잡는데 그래도 실시간의 60배 속도다. 이 값을 다시 올리려면 수술 ①의 워터마크 꼬리와 함께 봐야 한다 — 따라잡기가 길어질수록 목록이 1m을 더 읽는다(둘이 한 쌍이다).

### 11-4. 수술 ③ `ApmMetricStore` — 컬럼 전개 위에서 정렬을 빼다 (`core/metric/ApmMetricStore`)

히스토그램 벡터(`integer[]`)의 원소별 합은 PG에 집계 함수가 없어 길이 셋 중 하나였다: 자바 합산(행 전부 전송 — 6h RED가 16만 행), `unnest` 재집계(행이 버킷 수만큼 **폭발** — 16만→240만), **고정 폭 컬럼 전개**(채택 — `sum(hist_counts[1]) … sum(hist_counts[24])`, 행 폭발 0·전송은 결과 행 수만큼). 대가는 폭 상한(24칸)이라, 모든 질의가 벡터 길이를 함께 읽어 **잘렸으면 경고하고 플래그를 세운다**(조용히 꼬리를 잃으면 p99가 좋아 보인다).

R3가 여기에 한 번 더 손을 댔다: `order by`를 SQL에서 빼고 **정렬은 자바가 한다**(결과는 수백 행이다). 재미있는 것은 **실측이 처음의 가설을 뒤집은** 대목이다 — "order by가 PG를 Sort+GroupAggregate로 몰았다"고 봤는데, A/B를 떠 보니 order by를 빼도 플랜이 같았다. 진범은 `work_mem 4MB`(해시 테이블 추정치가 예산을 넘어 해시 집계를 포기한 것)였고, 64MB에서는 스필이 사라졌다. 그래서 "무료로 수 배"짜리 조치는 코드가 아니라 **설치 가이드의 PG 권장 설정**(O1 — `work_mem` 64MB·`shared_buffers` 25% 등, `install-guide`의 notices로 나간다)이다. order by 제거는 플래너 제약을 하나 줄이는 것이라 유지했다. 덤으로 롤업의 진단 선조회(`countMixedBoundsGroups`)를 본 질의의 부산물로 통합했다(같은 GROUP BY를 두 번 돌지 않는다 — 백필에서 ~7초 절약).

**남긴 것**: `dims` 사전 테이블 분리(S1, 행당 686→400B)는 스키마 변경이라 P2와 함께 판단하기로 보류. 목록 cold가 실제 몇 초가 됐는지는 **재실측 전**이다 — 합성 데이터를 이미 지워서, 다음 볼륨 실측(또는 P2 착수 전)의 숙제로 남았다(QA에서 D1이 "전제 불성립"으로 미검증 처리된 이유).

---

## 12. 트레이스는 어떻게 들어오나 (P2 1차 물결)

### 12-1. 스팬이 무엇이고, 무엇이 남고 무엇이 버려지나

메트릭이 "1분 동안 요청이 몇 건이었나"라면, **스팬**은 "요청 하나가 어느 함수·어느 DB 호출에서 몇 ms를 썼나"의 구간 기록이다. 요청 하나가 스팬 여러 개(트레이스 하나)를 만들고, 자동계측은 **모든 요청**에 대해 그것을 만든다. 그대로 받으면 메트릭의 수백 배가 쌓인다.

그래서 고객 망 안의 Collector가 먼저 거른다 — **tail 샘플링**(트레이스가 끝난 뒤에 남길지 정하는 방식, `collector-template.yaml`의 `tail_sampling`, 결정 대기 10초). 정책은 셋이고 P1의 설정 생성기 옵션 두 개가 그것을 채운다:

| 정책 | 남기는 것 | 옵션 |
|---|---|---|
| `errors` | 상태가 ERROR인 스팬이 있는 트레이스 — **조건 없이 100%** | — |
| `slow` | 지속시간이 `slowMs` 이상 — 100% | `slowMs`(기본 2000) |
| `normal` | 나머지 중 확률로 — 기본 **2%** | `normalPct`(기본 2) |

종단 QA 실측(3,790요청)이 이 표를 그대로 확인했다 — 오류 71/71, 느림 20/20, 정상 3,705 중 **75(2.02%)**. 이것이 P2 화면 전체에 걸리는 전제다: **건수는 근사, 오류 비중은 실제보다 높아 보인다, 정본은 메트릭.** 그리고 exemplar 링크가 "대부분 죽어 있는" 이유이기도 하다(§16-2).

### 12-2. 리더 — `otel/trace/OtlpTracesReader` (6파일)

`otel/metric`의 짝이다. 같은 규칙 — 깨진 것만 버린다·해석하지 않는다·절대 던지지 않는다. `resourceSpans → scopeSpans → spans`를 평면 `OtlpSpan` 목록으로 펴고, 부속으로 `OtlpSpanKind`(SERVER/CLIENT/PRODUCER/CONSUMER/INTERNAL — 숫자 1~5와 이름 표기 둘 다 받는다)·`OtlpSpanStatus`(UNSET/OK/ERROR)·`OtlpSpanEvent`(`isException()` = 이름이 `exception`)·`OtlpSpanLink`를 낸다.

리더가 **보장하는 불변식**이 하류 전부의 전제다:

| 불변식 | 왜 |
|---|---|
| `traceId` 32자·`spanId` 16자 **소문자 hex**. 아니면 그 스팬만 버린다. 대문자는 접는다 | 하류가 문자열 비교·PK로 쓴다 |
| **전부 0인 식별자는 거부** | 통과시키면 무관한 스팬 수천 개가 "한 트레이스"로 뭉친다 |
| `parentSpanId` 없음 = `null` = 루트. 형식이 깨진 값도 null | 스팬을 버리는 쪽이 더 잃는다. 대가: "null = 루트"가 100%는 아니다(고아가 루트로 보인다 — §14의 트리가 이것을 감당한다) |
| `start`는 never null(없거나 `"0"`이면 **수신 시각**), `end`도 never null(없으면 start = duration 0), duration은 음수가 안 된다 | AI 모니터링에서 겪은 `timeUnixNano "0"` → 1970 소실을 여기서 막는다 |
| 속성은 **거르지 않는다** | 거르는 것은 적재 계층의 몫(정책이 거기 있다) |
| 이벤트·링크는 스팬당 **128개**(파서 상한, 메모리 방어) | 적재는 다시 32개로 자른다(두 층이다) |

`OtlpSpanStatus`에서 헷갈리는 것 하나: `"status": {}`가 UNSET이고 **절대다수가 그것**이다(R1 실측 32스팬 중 31). 화면에서 "미지정"이 실패로 읽히면 안 되는 이유다.

### 12-3. 적재 — `premium/apm/trace/ingest/` (8파일)

`ApmOtlpController`는 그대로 수집기 메뉴에 있다(형식·크기·토큰·라이선스·중복 판정은 신호와 무관하니까). 갈리는 것은 `receive()` 안에서 파이프라인을 고르는 한 줄뿐이고, 🔴 그 주입은 **구체 타입**(`TraceIngestPipeline`)이다 — 인터페이스로 받으면 `@Primary`인 메트릭 파이프라인이 들어와 **스팬을 메트릭 리더에 먹인다**(조용히 0건 적재 + 200). 트레이스는 이제 `SIGNAL_NOT_SUPPORTED`가 아니다(그 자리는 `/v1/logs`만 남았다).

```
 TraceIngestPipeline: 파싱 → 수집기 자기 스팬 분리 → 서비스 귀속(ApmRegistrar 재사용) → 속성 허용목록·SQL 정책
                      → 트레이스별로 모아서 ──▶ ApmTraceWriter (트레이스 하나 = 트랜잭션 하나 = 잠금 하나)
                                                 ├ pg_advisory_xact_lock(hashtextextended(trace_id, 0))
                                                 ├ ApmSpanStore.findSpanIds → 이미 있는 스팬 빼고 → INSERT ON CONFLICT DO NOTHING
                                                 └ ApmTraceSummaryStore.merge (찾기 → INSERT 또는 조건부 UPDATE, 3회)
```

**"동시에 두 번 처음 보는" 문제와 advisory lock.** 코덱스 1차 검수의 🔴 첫 번째 — 같은 트레이스의 앞부분과 뒷부분이 두 배치로 나뉘어 **동시에** 도착하면, 둘 다 "요약이 없네" 하고 INSERT해 요약이 **두 행**이 된다. 행 잠금으로는 못 막는다 — 잠글 행이 아직 없는 것이 문제다. 비파티션 registry 테이블을 두는 안도 있었지만 그건 일 2천만 행짜리 테이블을 하나 더 만드는 일이다. 잠금은 테이블이 없다. 그래서 `ApmTraceWriter`가 `select pg_advisory_xact_lock(hashtextextended(?, 0))`로 **trace_id 해시 하나**를 잡고 그 안에서 dedup → 스팬 → 요약을 한 벌로 한다. `_xact_`(트랜잭션 잠금)인 이유는 세션 잠금은 해제를 놓치면 풀에 반납된 커넥션이 잠금을 든 채 재사용되기 때문이고, 한 트랜잭션이 잠금을 **하나만** 잡으므로 교착이 없다. 서로 다른 트레이스는 서로를 기다리지 않고(64비트 해시), 해시 충돌로 남남인 둘이 같은 키를 잡아도 결과는 틀리지 않고 잠깐 기다릴 뿐이다. 대가: 배치 중간 실패 시 앞부분은 커밋된 채 남는다 — 503으로 돌아온 같은 배치를 아래 dedup이 걸러 준다는 것이 전제다. IT `concurrentFirstWritesCollapseToOneSummary`(스레드 8개 동시 첫 수신 → 요약 1행)가 이 자리를 지킨다. DDL(파티션 생성)은 트랜잭션 **밖**에서 끝낸다 — 안에서 하면 부모 테이블 ACCESS EXCLUSIVE가 커밋까지 유지돼 그 사이 수신이 멈춘다.

**스팬 dedup은 두 층이다.** 영수증(본문 sha256, P1)이 "같은 바이트"를 걸러 주고, 그 아래 **논리 키 `(trace_id, span_id)`**가 "같은 스팬"을 걸러 준다. 후자가 필요한 이유는 PK에 `start_ts`가 들어가서다(12-5) — 시각을 다시 찍은 재전송은 PK로는 다른 행이다. 잠금 안에서 `findSpanIds(traceId)`로 이미 저장된 집합을 읽어 빼고, PK의 `ON CONFLICT DO NOTHING`은 마지막 그물로만 남는다. `span_count`는 **실제로 들어간 수**다. 버린 안: 해시 기반 근사 필터 — 오탐이 곧 진짜 스팬 유실이라 이 도메인에서는 받아들일 수 없다. 남는 구멍: 보존 경계를 넘겨 파티션이 DROP된 스팬이 재전송되면 "새 트레이스"가 된다(7일 지난 스팬을 보내는 exporter는 없다고 보고 감수). QA A-6·A-7이 동일 본문·공백만 다른 본문 두 경우 모두 행 3·`span_count` 3으로 확인했다.

**`ApmSqlPolicy` — KEEP / MASK / DROP.** 설정 화면의 `keep_raw_sql`·`mask_sql` 두 스위치가 **처음으로 적재를 바꾼다**(그전까지는 화면에만 있었다). 판정은 두 줄이다: `keepRaw`면 KEEP, 아니면 `mask ? MASK : DROP`. 즉 기본(`keep_raw_sql=false`·`mask_sql=true`)은 **MASK** — `db.query.text`의 리터럴(`'…'`·숫자)을 `?`로 바꿔 저장한다. `mask_sql`까지 끄면 **DROP** — 저장하지 않고 `RAW_SQL_BLOCKED`(signal=TRACE)를 세어 화면이 "왜 SQL 칸이 비었나"에 답한다. 같은 정책이 이벤트 속성과 `exception.message`·`exception.stacktrace`에도 걸리되, 스택의 `at …` 프레임 줄은 건드리지 않는다(줄 번호를 지우면 스택트레이스가 아무 말도 못 한다). 🔴 그리고 **SQL 키워드 쌍이 보일 때만** 가린다 — `no row for email = 'bob@example.com'` 같은 자유 텍스트의 리터럴은 원문으로 남는다(QA D12). 결함이 아니라 선택이다: 모든 따옴표를 가리면 예외 메시지가 `Cannot find ? in ?`이 되어 에러 화면이 답해야 할 질문("무슨 일이 났나")에 아무도 답 못 한다. 개인정보가 예외에 실리는 설치본은 Collector `redaction/pii`가 정본이고, 이것은 마지막 방어선이다.

**`ApmSpanAttrAllowlist` + 구 semconv 별칭.** 거부 목록(`url.full`·`url.query`·`user_agent.original`·`client.address`·`enduser.*`·헤더 등)은 어떤 경우에도 저장하지 않고, 허용 목록(HTTP·주소·DB·RPC·메시징·code·thread·exception)만 남긴다. 상한은 속성 48개, 값 1024자(SQL·예외 4종은 4096자 — Collector `truncate_all`과 **일부러 같은 값**), 잘리면 `…(truncated)`. 🔴 jsonb 안이라 DB가 막아 주지 않는다 — 8MB 요청이 그대로 한 행이 되던 구멍을 이 상한이 막는다(코덱스 1차 🔴4, 이벤트 이름 255자·이벤트/링크 32개도 함께). 이벤트 **이름**은 허용목록으로 막지 않는다 — `exception` 말고도 SDK가 제 이름을 붙이는 것이 정상이라(재시도·캐시 미스), 모르는 이름을 버리면 워터폴에 "뭔가 일어났는데 이름이 없는" 점이 남는다. 자를 뿐 버리지 않는다.
`LEGACY_ALIAS`(12쌍, QA D4)는 종단 QA가 낳았다: 구 semconv로 보내는 앱(`db.statement`·`db.name`·`net.peer.name`)의 스팬이 저장되는 속성이 `db.system` **하나뿐**이었고 그 사실이 어디에도 안 남았다 — DB 화면에 쿼리 대신 스팬 이름이, 서비스 맵에 `mysql`이라는 이름의 노드가 섰다. 별칭은 신 이름으로 접되 **신 이름이 있으면 그쪽이 이기고, 별칭 해석이 거부 판정보다 먼저**라 `http.url` → `url.full`은 펴진 뒤 거부된다(구 이름이 우회로가 되지 않는다). 허용목록 밖 폐기도 이제 `NOT_ALLOWLISTED`/signal=TRACE/키별로 센다(단위가 **속성**이라 스팬·포인트와 더하면 안 된다).

**`sampled_reason` — 왜 `SLOW`가 아니라 `SLOW_INFERRED`인가.** Collector의 tail 샘플링 프로세서는 **어느 정책이 통과시켰는지 스팬에 적어 주지 않는다**(정책 이름은 수집기 자기 메트릭의 라벨로만 나온다). 그래서 `ApmSampledReason`은 짐작한다: ① 속성(`sampling.policy` 등)이 있으면 원문 그대로(고객이 심은 정책 이름일 수 있으니 우리 어휘로 뭉개지 않는다, 32자) → ② 오류 스팬이 있으면 `ERROR`(확실) → ③ 지속시간 ≥ `DEFAULT_SLOW_MS`(2000)면 **`SLOW_INFERRED`** → ④ `SAMPLED`. ③의 임계는 그 수집기의 실제 `slowMs`가 아니다(설정 생성 시점의 선택이고 DB에 없다) — 고객이 5초로 올렸으면 확률로 뽑힌 트레이스가 `SLOW_INFERRED`로 보인다. 코드 주석에만 "추정"이라 적어 두면 화면·후속 API·문의는 그 사실을 알 수 없으므로 **값 자체가 근거를 말하게** 했다(코덱스 1차 🟡5). `SLOW`는 에이전트가 속성으로 알려 준 경우에만 저장된다(우리는 만들지 않는다). FE 라벨은 "느림(추정)".

### 12-4. 요약 병합과 "start_ts가 내려가는" 행

`apm_trace_summary`는 트레이스당 한 행(시작·종료·루트 이름·오류·스팬 수·서비스 목록)이고 스팬이 올 때마다 **병합**된다(min/max/OR/합집합 — 멱등한 연산이라 재전송분도 다시 보낸다. 그래야 "스팬은 저장됐는데 요약 병합이 실패했던" 앞 배치가 복구된다). 함정은 **더 이른 스팬(대개 루트)이 나중에 도착**하는 경우다 — 요약의 `start_ts`가 작아지고 행이 **다른 일 파티션으로 이동**한다(PG 11+ row movement, IT로 실증). 그래서 `ON CONFLICT`만 쓰지 않고 trace_id로 먼저 찾은 뒤 그 행의 현재 `start_ts`를 조건으로 UPDATE한다 — ON CONFLICT만 쓰면 키가 달라져 같은 트레이스가 두 행이 된다. 경합(0행 UPDATE)은 `MAX_UPDATE_ATTEMPTS = 3`(`ApmTraceSummaryStore`)까지 시도하고 그래도 안 되면 **던진다**(→ 503 → Collector 재시도). "다음 배치가 메운다"는 가정은 **그 배치가 마지막이면 성립하지 않는다**(코덱스 1차 🟡7) — 그때 남는 것은 "스팬은 있는데 요약이 틀린, 아무도 모르는" 상태다.

`root_span_id`가 NULL이면 "루트가 아직 안 왔다"다 — `root_name`만으로는 잠정값과 빈 이름이 구분되지 않아 컬럼을 하나 더 뒀다. 그리고 요약의 지속시간은 timestamp 차라 **항상 1000ns의 배수**, 스팬은 나노초 원값 — 화면에 나란히 놓으면 끝자리가 안 맞는다(계약 §7.6-10, 결함 아님).

### 12-5. "설계의 PK를 PG가 거부한 사연" — `V44__apm_trace.sql`

테이블 9개(`apm_span`·`apm_trace_summary` + 롤업 표 6 + `apm_deployment`). 설계서 §7과 다른 점 다섯이 전부 의도적인데, 그중 하나는 **선택이 아니라 강제**였다. 설계는 `PK(trace_id, span_id)`였다. 그런데 PostgreSQL은 **파티션 키가 모든 UNIQUE/PK에 포함되기를 요구**한다 — 일 파티션(`start_ts`)과 그 PK는 **동시에 성립할 수 없는 스키마**였고, 실제 PG를 붙인 IT(`ApmTraceSchemaIT`)가 처음 돌 때 그것을 잡았다. 그래서 PK는 `(trace_id, span_id, start_ts)`가 됐고, 재전송 멱등성이 PK만으로는 안 지켜지게 되어(시각이 다시 찍힌 재전송은 다른 키) 12-3의 논리 키 dedup이 필요해졌다. 나머지 넷: `trace_id`가 bytea가 아니라 hex varchar(P1의 `exemplar_trace_id`와 조인이 인덱스를 타려면 타입이 같아야 한다) · `end_ts`·`root_span_id` 추가 · `service_ids`가 `bigint[]` · `apm_span`에 `(trace_id)` 단독 인덱스를 **만들지 않았다**(PK 선두가 trace_id라 중복 — 가장 쓰기가 잦은 테이블의 삽입 비용만 늘린다).

파티션·보존은 P1 기계에 얹혔다: `ApmPartitionService.PARTITIONED_TABLES`에 6개 추가(선생성이 하루 3 → **9개**), `ApmRetentionJob`에 **별도 단계** `tracePartitions`(span 7·summary 7·edge 30·error_1h 90·db_5m 30·dependency 30일) + 그룹 본체 `errorGroups`·`dbQueryGroups`(90일, **자식을 먼저 지운다** — 파티션 자식에는 부모 FK가 없어 부모만 지우면 고아가 남는다) + `deployments`(400일, 쓰는 코드가 생기기 **전에** 먼저 넣었다 — 나중에 넣으면 그 사이 쌓인 것이 비파티션 표에 무기한 남는다). 메트릭과 한 단계로 묶지 않은 이유는 실패 격리다.

**아직 열려 있는 것**(계약 §7.6): 실 Collector 왕복은 종단 QA로 닫혔지만, `links`는 실데이터 0건(Kafka 트레이스가 오면 다시 본다) · `reWriteBatchedInserts` 켜진 URL의 `SUCCESS_NO_INFO` 경로는 실행된 적이 없다 · `collector ↔ trace` 패키지 순환은 **P4(로그) 착수 직전에 `core/ingest/`로 승격**하기로 시점을 못박았다(지금 옮기면 2차 물결이 그 위에서 리베이스돼야 하고, 패키지명을 안 바꾸는 이동은 나중에 해도 비용이 같다).

---

## 13. 스팬을 네 개의 표로 접는 롤업 (P2 2차 물결)

### 13-1. 왜 접나 — 원본은 7일이고 질문은 30~90일이다

`apm_span`은 일 2천만 행 규모라 7일만 둔다. 그런데 화면이 묻는 것은 "지난달 어느 서비스가 어느 DB를 얼마나 불렀나", "이 예외가 처음 나타난 게 언제인가"다. 그래서 `premium/apm/trace/rollup/ApmTraceRollupService`가 5분마다 스팬을 **네 표**로 접는다. 메트릭 롤업(§4)과 **별도 잡**(`apm_trace_rollup`, V45 시드)이다 — `scheduler_lease`가 `job_key`별이라 한 잡에 묶으면 한쪽의 지연이 다른 쪽의 skip이 되고, 메트릭 1h가 실패해 던지면 트레이스는 시작조차 못 하며, 원본도 워터마크도 다르다. `requiresActiveLicense() = false`인 근거는 `ApmRollupJob`과 같다(보존 배치가 7일 파티션을 DROP하므로 집계만 멈추면 영구 공백).

| 단계 | 스팬에서 고르는 것 | 표 · 버킷 | 키가 되는 것 |
|---|---|---|---|
| `rollupEdges` | `kind ∈ {CLIENT, PRODUCER}` | `apm_service_edge_5m` · 5분 | 대상 판정: 자식 스팬이 **다른 서비스**에 있으면 `SERVICE` → `messaging.system`이면 `QUEUE` → `db.system`이면 `DB` → 나머지 `HTTP`. 식별 못 하면 엣지가 **되지 않는다** |
| `rollupErrors` | `events`에 `name='exception'` | `apm_error_group` + `_1h` · **1시간** | 지문 = `sha256(type \| apm_error_message_norm(message))` — 스택 프레임은 넣지 않는다(스택이 절반의 이벤트에만 있어 같은 오류가 둘로 갈린다) |
| `rollupDbQueries` | `db.system` 있는 스팬 | `apm_db_query_group` + `_5m` · 5분 | 지문 = `sha256(db_system \| apm_sql_norm(text ?? summary ?? 스팬 이름))` |
| `rollupDependencies` | `kind=CLIENT`이고 DB도 큐도 **옆 서비스도** 아닌 것 | `apm_dependency_5m` · 5분 | `target = server.address ?? peer.service`, 타임아웃 = `error.type`·예외에 `time.?out` |

히스토그램은 넷 다 `CanonicalBounds.durationSeconds()`(14단, family `duration_s`) **하나**만 쓴다. DB 스팬에 `db_operation_s`가 아닌 이것을 쓰는 이유는 **한 화면에서 비교되기 때문**이다 — 맵의 DB 엣지 p95와 외부 호출 p95가 나란히 서는데 격자가 다르면 차이가 격자 탓인지 사실인지 알 수 없다. 메트릭과 같은 격자라 `ApmHistBoundsCatalog`·`ApmPercentiles`가 벡터를 그대로 읽는다 — 조회 계층에 새 코드가 없는 것이 이 선택의 실질적 이득. SQL은 `width_bucket + 1`로 번호를 만들고 **spine 조인**(`generate_series(1, n+1)` × 키)으로 길이가 고정된 벡터를 편다 — spine이 없으면 관측 0인 칸이 배열에서 빠져 "i번째가 어느 구간인지"를 아무도 모르게 된다.

### 13-2. 워터마크 하나 · 트랜잭션 하나 · LAG 3분 + lookback 2버킷

**워터마크가 하나다**(`apm_setting.trace_rollup_watermark_5m`). 넷을 따로 두면 "맵에는 있는데 에러 목록에는 없는 5분"이 생긴다. 같은 이유로 네 단계가 **한 트랜잭션**이다 — 부분 성공 상태가 없고, 던지면 넷 다 되돌아가 다음 회차가 같은 창을 처음부터 접는다(메트릭 롤업과 다른 점 — 거기는 5m/1h가 각자 커밋된다).

**LAG는 3분**(메트릭은 2분). `SERVICE` 엣지는 부모(CLIENT)와 자식(SERVER) 스팬이 **둘 다** 저장돼 있어야 성립하는데 둘은 다른 서비스, 다른 Collector 배치로 온다. 자식이 아직 안 왔으면 같은 호출이 `HTTP` 엣지로 굳고, 대입 UPSERT라 **나중에 고쳐지지 않는다**. 자식 조회 창만 끝에서 5분 더 본다(`CHILD_LOOKAHEAD_MINUTES = 5` — 집계 대상은 부모 기준이라 늘어나지 않는다). QA B-1이 qa-node → qa-python 44건(= 30 + 10 + 4)이 `SERVICE` 엣지로 정확히 서는 것을 확인했다.

**lookback 2버킷**(코덱스 2차 🟡5). 워터마크가 지나간 버킷은 다시 보지 않으므로 LAG보다 늦게 도착한 스팬은 어느 집계에도 없었다. 전부 대입이 된 지금(13-3)은 다시 세는 것이 안전하므로, **워터마크는 그대로 전진시키면서 소스 창만 뒤로 2버킷(10분) 넓힌다** → 허용 지연 3분 → 13분. 그 이상 늦은 것은 여전히 누락이다(dirty-bucket 목록을 따로 들어야 하는데 이 규모에서는 비용이 이득을 넘는다). 이 변경이 "접을 것이 있었나"(워터마크 붙잡기) 판정도 바꿨다 — 쓴 행 수로 판단하면 예외 단계가 매번 시간 버킷을 다시 대입하므로 새 창이 비어도 rows > 0이 나와 `holdWatermark`가 영영 발동하지 않는다. 지금은 **원본 스팬 존재 확인**으로 판단한다.

**지워진 서비스의 스팬을 건너뛴다.** `apm_span`에는 `apm_service` FK가 없지만 `apm_error_group`·`apm_db_query_group`에는 있다. 서비스를 지운 뒤에도 스팬은 최대 7일 남으므로 그것을 집계하려 하면 FK 위반으로 **트랜잭션 전체가 롤백**되고 워터마크가 전진하지 못한다 = 집계 영구 정지. 두 단계의 소스에 `exists (select 1 from apm_service …)` 가드가 있다(IT "지워진 서비스가 집계를 멈추지 않는다"). 엣지·의존은 파티션 표라 FK가 없어 해당 없음.

### 13-3. "덧셈 UPSERT가 재실행에 두 번 세는 사연" → 대입

처음에는 예외 그룹만 **덧셈**이었다(`count_total`·`_1h.count`를 `+`로 UPSERT). 트랜잭션으로 "썼으면 워터마크도 전진한다"를 보장하니 안전하다고 봤다. 코덱스 2차 🔴1이 그 방어의 빈틈을 짚었다 — 트랜잭션은 *부분* 실패만 막는다. **커밋이 성공한 뒤** 응답·연결이 끊겨 잡이 같은 창을 다시 도는 at-least-once 재실행에서는 같은 값이 한 번 더 더해진다. 롤업이 "성공적으로" 두 배를 만드는 경로다.

지금은 `rollupErrors`가 소스 창을 **시간 경계로 내려**(`date_trunc('hour', from)`) 그 시간대의 스팬을 처음부터 다시 세고 **대입**한다 — 창이 09:35~09:40이면 스팬은 09:00~09:40을 읽고 09시 버킷에 그 합을 넣는다. 몇 번을 돌려도 같다. `endpoint_counts`도 병합이 아니라 대입이고, `count_total`은 UPSERT에서 **손대지 않고** `syncErrorCountTotals`가 이번 창에 손댄 그룹만 `_1h` 합으로 다시 계산한다(순수 함수 = 멱등). 대가는 같은 시간대를 최대 12번 다시 읽는 것 — 대상이 예외 이벤트가 있는 스팬뿐이라 감수했다. ⚠️ 소스 창은 **버킷 경계에 정렬**돼 있어야 한다 — 반쯤 걸친 창으로 대입하면 그 버킷의 앞부분이 지워진다.

**예외 `count_total`이 "보존 창 합"으로 바뀐 대가.** 위 변경으로 `count_total`의 뜻이 "평생 누적"에서 **"보존 중인 90일 버킷의 합"**으로 바뀌었다 — 파티션이 떨어지면 줄어든다. 얻은 것은 목록의 창 안 발생 수와 **같은 원천**이라 둘이 어긋나지 않는 것(예전엔 "평생 누적은 그대로인데 창 합은 보존이 지나 줄어드는" 불일치가 있었다). FE 라벨은 "최근 90일 발생"으로 바뀌었다.

### 13-4. 지문 정규화가 PG 함수인 이유 (`V45`)

같은 버그가 만든 메시지 100개(`order 4f2a… not found`, `order 91bb… not found`…)를 한 그룹으로 접으려면 메시지에서 가변 부분을 지워야 한다. 그것을 자바가 아니라 **PG 함수**(`apm_error_message_norm`·`apm_sql_norm`)로 둔 이유는 롤업 SQL이 `GROUP BY` 키로 그 결과를 **DB 안에서** 바로 쓰기 때문이다 — 자바로 하면 스팬을 전부 끌어와 그룹핑해야 하고, 그 순간 롤업이 `INSERT … SELECT`가 아니게 된다. 🔴 지우는 **순서가 규칙의 일부**다: 메시지는 UUID → `0x` hex → 16자+ hex → 따옴표 값 → 숫자 → 공백 압축(숫자를 먼저 지우면 `a1b2-c3d4`가 부서져 토큰이 조각난다). SQL은 블록 주석 → 줄 주석 → **달러 인용** → 문자열 리터럴 → 숫자 → `IN (?,?,?)` → `IN (?)` → 공백 압축 → 4000자(주석을 먼저 지우는 이유는 `-- don't`의 홑따옴표가 리터럴 치환의 짝을 깨서다). 달러 인용은 코덱스 2차 🟡7이 넣었다 — 그 안에는 홑따옴표가 없어도 되므로 리터럴 규칙이 통째로 비껴갔고 `keep_raw_sql` 설치본에서 원문이 `query_norm`에 남았다. ⚠️ 함수 본문 자체가 달러 인용이라 주석·정규식에 `$$`를 나란히 쓰면 마이그레이션이 죽는다(정규식을 갈라 놓은 이유). `apm_sql_norm`의 결과는 `query_norm`에 **그대로 저장**되어 지문이자 표시값이라 사람이 읽을 수 있어야 한다. 대소문자는 접지 않는다(클래스명이 뭉개진다). IT가 "메시지 변형 100건 → 그룹 1", "SQL 리터럴/IN/주석/공백 변형 → 그룹 1"을 고정한다.

인덱스 둘(`apm_span_start_brin`·`apm_trace_summary_start_brin`)이 **BRIN**인 이유: 롤업의 `where start_ts >= ? and < ?`에 서비스 축이 없어 V44 인덱스(`(service_id, start_ts)`)를 못 타고 파티션을 통째로 읽는다. B-tree를 더하면 이 스키마에서 쓰기가 가장 잦은 테이블의 삽입 비용이 그대로 수신 비용이다. BRIN은 수십 KB·삽입 비용 사실상 0이고, 상관관계가 흐려져도 **최악이 지금과 같다**. 효용은 실 볼륨에서 `EXPLAIN`으로 확인해야 한다(미실측).

### 13-5. 카디널리티 — 이 표들 중 터질 수 있는 곳 하나

DB 쿼리 그룹이 유일하게 그룹 테이블을 터뜨릴 수 있다. `keep_raw_sql`이 켜져 있고 정규화가 못 잡는 형태(배열 리터럴·동적 컬럼 목록)가 오면 그룹이 실행 건수만큼 생긴다. `IN (?)` 접기가 가장 흔한 원인을 막지만 전부는 아니다 — **그룹 수가 갑자기 늘면 여기를 먼저 본다.** `apm_error_group_1h.endpoint_counts`는 `apm_jsonb_count_merge(max_keys=50)`로 키 50개에서 잘린다(route 카디널리티가 열려 있어 한 행의 jsonb가 수만 키로 자라지 않게) — 넘는 route는 조용히 빠지고 알리는 필드가 없다(계약 §7.8.7-11).

### 13-6. 아직 실측 없는 것

한 트랜잭션이 최대 `maxBuckets`(기본 288 = 하루치) 버킷을 잡는다 — 밀린 구간 따라잡기의 **잠금 유지 시간·WAL 크기를 모른다**. 메트릭 롤업이 R3에서 288 → 60으로 내린 전례(§11-3)가 있으니 첫 대량 백필 때 `options.maxBuckets`로 낮출 준비를 해 둔다. 예외 롤업 비용(시간대 12회 재스캔 + lookback 3배)도 실 볼륨 미측정. 타임아웃 판정(`time.?out` 정규식)은 SDK·언어마다 달라 **놓치는 쪽으로 기울여 두었다** — 실 데이터로 문자열 목록을 채워야 한다. `peer.service`는 허용목록에 넣었지만 `SERVICE` 엣지 판정에는 안 쓴다(서비스 *이름*이라 `service_uid`로 풀려면 `name_norm`·`env_norm` 정규화를 SQL에 복제해야 한다) — `HTTP` 엣지의 라벨 폴백으로만.

---

## 14. 조회 — 워터폴·크리티컬 패스·플레임·산점도 (`trace/query/` + `servicemap/`)

### 14-1. 트리 조립 — `ApmSpanTree`는 불완전한 트레이스를 전제로 짜였다

트레이스는 늘 온전하지 않다 — 루트가 아직 안 왔거나, 부모가 다른 Collector 배치에 있거나, 계측 버그로 부모 사슬이 돈다. `ApmSpanTree`는 그것을 **버리지 않고 표시한다**: 고아(부모를 못 찾음·자기 자신을 가리킴)는 **루트로 승격**(`orphan=true` — 버리면 하필 그것이 느린 DB 호출일 때 원인이 사라진다), 부모 사슬 **순환은 끊고** `cycleBroken`으로 알린다(그대로 재귀하면 500), 그리고 **재귀를 쓰지 않는다**(깊이는 데이터가 정한다 — 5,000 깊이 테스트 포함). 중복 span_id는 앞엣것을 유지한다. 결과 `spans[]`는 **전위 순회 순서**(부모 바로 다음 자식, 형제는 시작 순)로 나가고, 그래서 FE는 트리를 다시 만들지 않고 위에서 아래로 그리며 접기는 "그 마디의 `depth`보다 큰 뒤 행을 숨긴다"로 처리한다. 요약이 없고 스팬만 있어도 상세는 선다(요약을 스팬에서 지어낸다) — 404는 둘 다 없을 때만.

### 14-2. 크리티컬 패스 — "자식 구간 뺀 자기 시간"이 최대인 경로

**자기 시간(`selfMs`)** = 자기 구간 − (자식 구간들의 **합집합** ∩ 자기 구간). 단순 합산으로 빼면 병렬 자식에서 **음수**가 되고, 자식이 부모 밖으로 삐져나가도 겹치는 부분만 뺀다(`Math.max(0, duration − covered)`). **크리티컬 패스** = 자기 시간 합이 최대인 루트→리프 경로 — 리프→루트 DP(전위 순회를 뒤에서 훑으면 자식이 먼저 계산돼 있다). 흔한 대안("부모의 끝을 덮는 자식을 따라간다")과 대부분 같은 경로를 주지만 **형제가 병렬일 때 갈리고 그때 우리 쪽이 쓸모 있다** — 150ms 일한 형제 대신 마지막에 끝난 10ms를 따라가지 않는다.

**3자 정합.** 응답에는 같은 사실이 세 번 실린다 — `spans[].onCriticalPath` 플래그, `criticalPath[]` 배열, `criticalPathMs`(경로의 자기 시간 합). 종단 QA가 실데이터 8트레이스(스팬 4~151)에서 **플래그 집합 == 배열(순서까지) == 강조된 스팬의 Σ`selfMs` == `criticalPathMs`, delta 0.0**을 확인했다. 그런데 BE의 계약 표본 `trace-detail.json`은 손으로 채워져 **알고리즘상 나올 수 없는 값**(형제 41ms/84.8ms 중 짧은 쪽이 플래그 true인데 배열엔 없음)을 담고 있었고, FE는 그것에 맞춰 "플래그 ∪ 배열" 합집합 규칙과 회귀 테스트까지 만들었다(QA D6 — 존재하지 않는 서버 거동을 위해 FE에 규칙이 하나 생긴 것). 지금은 표본을 `ApmSpanTree`를 **실제로 돌려서** 만들고, 양쪽에 같은 **불변식 테스트**(집합 == 배열 == Σ == 합계)가 있다 — 파일 대조만으로는 "둘 다 틀려도 초록"이라서다. FE는 배열 단일 정본(`apmCriticalPathIds`)으로 되돌렸다.

### 14-3. 플레임·비교

플레임(`/flame`)은 워터폴과 **다른 트리**다 — 같은 `(서비스, 이름)`의 형제를 합친다(루프 안 얇은 막대 200개가 한 칸). `valueMs`는 병렬 호출에서 부모보다 클 수 있어 칸 폭은 부모 대비 **비율**로 그린다. 비교(`POST /compare`)는 두 트레이스를 **경로 서명**(루트부터의 이름 사슬)으로 짝짓고 **자기 시간** 델타를 낸다 — 이름만 맞추면 트리 위치가 다른 두 스팬이 한 줄로 엉키고, 지속시간으로 비교하면 같은 지연이 부모 사슬 전체에서 반복돼 표 위쪽이 껍데기로 채워진다. 🔴 비교는 **BE만 있고 FE 화면이 없다**(P2 FE 잔여). 인자 누락은 `APM_TRACE_COMPARE_INVALID`(400) — 예전엔 `APM_TRACE_NOT_FOUND`를 재사용해 `code`(400)와 `errorCode`("찾을 수 없음")가 서로 다른 이야기를 했고 화면이 호출부 버그를 "만료됨"으로 안내했다(QA D10).

### 14-4. 산점도 — 정렬 없는 limit이 왜 거짓말인가

산점도는 창 안 트레이스 전부를 찍을 수 없어 다운샘플한다: 시간축은 창을 `cells`(기본 120, 최대 600)로 나눈 고정 폭(**올림** — 내림이면 창 끝 몇 ms가 어느 칸에도 안 들어간다), y축은 **로그**(`floor(log10(duration_ns) × 4)`), 칸마다 `row_number() over (order by duration_ns desc, trace_id)`로 `perCell`(기본 3)개. 느린 것부터 남기므로 **위쪽 윤곽은 보존, 아래쪽 밀도는 성기다**(FE '표본' 배지).

처음 구현은 창 전체에 `limit 200000`을 걸고 그 안에서 칸별 대표를 뽑았다. 코덱스 2차 🔴4 — 그 limit에는 **정렬이 없다**. PG가 어느 20만 건을 먼저 만나느냐는 플랜·물리 순서에 달려 **비결정적**이고, 하필 앞쪽 시간대만 뽑히면 뒤쪽 시간대가 통째로 비어 보인다. "같은 데이터인데 새로고침마다 그림이 다르다"는 사용자가 결함으로 신고할 수 없는 종류다. 지금은 `generate_series(0, cells-1)` × `cross join lateral`로 **칸마다** `limit perCellScan`(= `SCATTER_SCAN_CAP` 200,000/cells, 최소 200)을 걸고 `(duration_ns desc, trace_id)`로 안정 정렬한다 → 어느 시간대도 사라지지 않고 같은 데이터면 같은 그림. 대가: 조기 종료가 사라져 넓은 창에서 느려질 수 있다(칸이 좁은 시간 범위라 `apm_trace_summary_start_brin`이 잘 듣는 것이 완화). 그때의 대응은 `cells`를 줄이는 것이 아니라 **창을 좁히는 것**이다(칸을 줄이면 칸당 예산이 늘어 더 느려진다). 목록 총계도 `select count(*) from (select 1 … limit 100000) t`(`COUNT_CAP`)로 **상한**을 건다 — 바깥에 `limit`을 붙이면 스캔이 안 멈춘다.

### 14-5. 서비스 맵 EP와 `mixedBounds`의 NULL 판정

`GET /apm/service-map`은 `apm_service_edge_5m`를 창으로 합쳐 노드·엣지를 낸다. 노드 id는 `kind:ref`(`SERVICE`면 ref가 `service_uid` — 내부 id는 밖으로 안 나간다), 엣지의 `fromId`·`toId`가 같은 문자열이라 FE는 그것으로만 연결한다. 엣지가 없는 서비스도 노드로 선다(사라지면 장애로 오해). `env` 필터는 **호출하는 쪽에만** 걸린다(반대편까지 거르면 "스테이징이 운영 DB를 부른다"가 맵에서 사라진다). 엣지 상한 2,000(호출 수 내림차순이라 굵은 것부터 남고 `truncated`만 알린다). 내부 id ↔ `service_uid`는 `ApmServiceRefLookup` 한 곳이 통로이고 **캐시하지 않는다** — 캐시를 두면 "방금 등록된 서비스가 맵에서 이름 없이 나온다"를 위해 등록 경로에 갈고리를 걸어야 한다. 설계서의 `/layout`(사용자별 배치 저장)·`/errors/treemap`·`/db/slow-series`·`/dependencies/sankey` 넷은 **만들지 않았다** — 같은 집계를 두 EP로 두면 필터가 어긋나거나, 저장 테이블이 필요한 별도 과제다(FE 맵의 "위치는 저장되지 않습니다" 각주가 그 결과).

`mixedBounds`(경계 혼재, §10-4)의 판정은 `ApmSpanLatency`의 SQL 조각 하나를 맵·에러·DB·의존이 공유한다: `count(distinct bounds_id) > 1 or (bool_or(bounds_id is null) and count(bounds_id) > 0)`. 뒤 절이 코덱스 2차 지적 4다 — `count(distinct)`는 NULL을 세지 않아 **경계를 모르는 행이 섞여도 혼재를 놓치고** 남의 눈금으로 잰 ms를 내보냈다. **전부 NULL**인 경우는 혼재가 아니라 "경계를 모른다"(`mixedBounds:false` + 백분위 `null`). 같은 결함이 P1 메트릭 롤업의 `bounds_id` 혼재 판정에도 있어 함께 고쳤다 — 그쪽은 판정 결과가 5m/1h 표에 **저장**되므로 조회보다 오래 남는다.

**원문 열람** — `ApmRawTextPolicy`(설정 × 자격) + `ApmRawTextView`(마스킹 규칙). `keep_raw_sql=true`인 설치본에서만 판정이 살아나고(꺼져 있으면 저장값이 이미 마스킹본), 자격 없는 열람자에게는 **값만** 가린다(스택의 `at …` 줄은 남긴다). 규칙은 적재의 `ApmSqlPolicy.MASKED`를 그대로 빌린다. 오늘은 읽기 티어와 원문 티어가 같은 집합이지만 나눠 둔 이유는 §17이다.

---

## 15. 배포 감지와 웹훅 (`service/deploy/`, P2 3차 물결)

### 15-1. AUTO = "살아 있는 버전 집합에 없던 버전" — 왜 인스턴스 버전 변화가 아닌가

첫 직관은 "인스턴스의 `service.version` 컬럼이 바뀌면 배포"다. 그런데 **컨테이너 배포는 기존 인스턴스를 고치지 않는다** — 새 인스턴스를 띄우고 옛것을 죽인다. 인스턴스 단위로 보면 K8s·ECS에서 배포를 **한 건도 못 잡는다**. 그래서 `ApmDeploymentDetector`는 **서비스 단위 집합**으로 판정한다: "살아 있는 인스턴스 중 아무도 보고하고 있지 않던 버전이 관측되면 배포". in-place 재시작(윈도우 서비스·systemd)과 롤링 교체가 둘 다 잡힌다.

- **"살아 있다" = 최근 30분**(`LIVE_WINDOW`) 안에 수신이 있었던 인스턴스. 짧을수록 롤백을 잘 잡고 길수록 유령 배포가 준다 — 30분은 그 사이의 판단이지 실측이 아니다(설정으로 열지 않았다).
- 🔴 **부트스트랩**: 아는 버전이 하나도 없던 서비스의 첫 버전은 **기록하지 않는다**. 이 규칙이 없으면 제품을 처음 켜는 날 돌고 있던 서비스 전부가 "방금 배포됨"으로 찍히고 그 마커가 **400일** 남는다. 판정 근거를 DB에서 읽으므로 BE 재기동도 유령을 만들지 않는다(QA C-5가 세 사건으로 실증 — 알려진 버전 0개인 qa-node `1.0.0`은 기록 안 됨, 재기동 `1.1.0`은 기록됨).
- 감지 시각은 **분 단위로 잘린다**(같은 (서비스·버전·분)이 자연키로 한 행), 30분 창 안의 재감지는 별도 조회가 막는다(다중 노드 대비).
- ⚠️ 코덱스 3차 🟡2: 감지는 수신 hot path라 무슨 예외가 나도 삼키는데, 전에는 삼키기 **전에** 그 버전을 캐시에 넣어 버려서 DB가 몇 초 흔들리기만 해도 그 버전이 영원히 "이미 아는 버전"이 되고 **배포 마커 하나가 영구히 사라졌다**(캐시 TTL이 지나 DB를 다시 읽을 때쯤이면 그 버전의 인스턴스 행이 이미 저장돼 live set에 들어 있다). 지금은 실패한 버전을 캐시에서 도로 뺀다.

AUTO가 못 잡는 셋 — **같은 버전 재배포**(버전 문자열만으로는 "다시 올렸다"와 "아무 일도 없었다"가 구분 안 됨) · **30분 안의 롤백**(되돌린 버전의 인스턴스가 아직 살아 있는 것으로 보인다) · **`service.version`을 안 보내는 앱**. 전부 웹훅으로 메운다. 반대 방향 오차: 30분 넘게 끊겼던 인스턴스가 같은 버전으로 돌아오면 배포로 기록될 수 있다("버전이 사라졌다 다시 나타났다"는 사실 자체는 맞다).

### 15-2. 웹훅 — 이 EP만 계약이 다르다

`POST /apm/services/{uid}/deployments`의 클라이언트는 브라우저가 아니라 **파이프라인의 curl 한 줄**이다. `curl --fail`·GitHub Actions 스텝은 상태 코드로만 성패를 가르므로 이 레포 규약(200 + 본문 code)을 따르면 **토큰이 틀려도 파이프라인이 초록**이고 배포 마커는 조용히 사라진다. 그래서 OTLP 수신과 같은 규약 — 실제 200/400/401/403/404, 본문은 envelope이 아닌 평문 `{id, serviceUid, version, detectedAt, created}`. 같은 경로의 GET은 여전히 200+code다(한 경로에 두 계약이 공존).

- **scope `deploy`**: 기존 수신 토큰(`scopes:["ingest"]`)으로는 403. `ApmReceiveTokenService`에 `SCOPE_INGEST`·`SCOPE_DEPLOY`·`ALLOWED_SCOPES`가 생겼고 **모르는 scope는 발급 시 거절**(`APM_TOKEN_SCOPE_UNSUPPORTED`) — `"deploys"` 오타가 통과하면 아무 문도 못 여는 토큰이 화면에는 정상으로 보인다. 판정은 `kind == COLLECTOR ∧ scopes ∋ deploy`(브라우저에 심는 RUM 공개 토큰이 서버 쓰기 권한을 얻으면 안 된다). 한 토큰에 둘을 묶는 것은 허용하되 권고하지 않는다(노출면이 다르다) — FE 발급 창이 체크박스 둘 + 경고 배너로 그 결정을 그대로 옮겼다(§A 12행 FE 4물결).
- 🔴 **깨진 JSON 400**(코덱스 3차 🔴1): 본문 파싱 실패는 컨트롤러 진입 **전**에 `HttpMessageNotReadableException`이 되어 전역 핸들러의 200+`INVALID_DATA`로 새고 있었다 — 이 EP에서 가장 흔한 실수 하나가 정확히 우리가 막으려던 사고를 그대로 만들고 있었다. `ApmDeploymentWebhookController`의 **전용 `@ExceptionHandler`**가 잡아 실제 400 + `APM_DEPLOYMENT_BODY_INVALID`로 답한다(컨트롤러 스코프 핸들러가 전역 `@ControllerAdvice`를 이긴다). ⚠️ 이 400은 **토큰 검사보다 먼저** 난다(스프링이 본문을 먼저 역직렬화) — 토큰이 틀리고 본문도 깨졌으면 401이 아니라 400. 본문을 아예 안 보내면 파싱 실패가 아니라 `version` 누락이다.
- **멱등**: 같은 (서비스·버전·분) 재전송은 새 행 없이 같은 `id`, `created:false`(실패가 아니다). CI 재시도가 마커를 두 번 긋지 않게 하는 것이 이 성질의 전부다.
- 보안 체인: `permitAll`은 **POST에만**(같은 경로 GET은 401, `/apm/services/a/b/deployments`는 비매칭) — 코덱스 3차 🟡3으로 **실제 `SecurityFilterChain`을 통과시키는 테스트**(`ApmDeploymentWebhookSecurityChainTest`)가 생겼다. `*`를 `**`로 넓히면 깨진다. QA C-6이 15케이스 전건 계약 일치를 확인했다.

### 15-3. 전후 비교와 RED 시계열의 `deployments`

전후 비교(`/deployments/{id}/compare`)의 원천은 **메트릭**(§2 RED)이다 — 샘플링된 트레이스가 아니라 건수·오류율이 근사가 아니다. `before = [배포−창, 배포)`, `after = [배포, 배포+창)`(배포 시각 자체는 '후'). 🔴 `delta`에 **건수가 없다** — `afterComplete:false`(후 창이 현재 시각에 잘린 진행 중 배포)일 때 두 창의 길이가 달라 `requests`를 비교하면 "배포 후 요청이 1/12로 줄었다"는 가짜 급락이 나온다. 비율 지표만 비교하고, `errorRatePointDiff`는 **퍼센트 포인트**(2%→5%면 +3), `p95PctChange`는 상대 변화율 — 같은 "+3"이 다른 뜻이라 필드를 갈랐고 FE 라벨에 단위를 박았다. 🔴 `delta`에 **판정(개선/악화)도 없다** — 임계는 서비스마다 다르고, 서버가 정하면 화면이 그것을 사실로 표시한다. 이 비교는 인과가 아니라 나란히 놓은 두 숫자다. `window`는 5~1440 밖이면 거절하지 않고 잘라 쓰며 실제 값이 `windowMinutes`에 실린다. 후 창 길이 0은 `ApmTimeRange`에 넘기지 않고 명시적 empty DTO다(넘기면 "최근 1시간"으로 접히는 P1 함정).

**RED 시계열의 `deployments` 가산 필드 — `null` vs `[]`.** `ApmSeriesQueryService.buildRed`의 마지막 인자 `withDeployments`가 서비스 RED(`redSeries`)에서만 `true`다. 엔드포인트·인스턴스 시계열은 **`null`**("이 EP는 싣지 않는다"), 서비스 RED에서 배포가 없으면 **`[]`**("이 창에 없었다"), 있으면 항목(최대 `MAX_DEPLOY_MARKS` 200). FE `apmDeploymentMarkState`가 세 갈래(`absent`/`none`/`present`)로 갈라 아무것도 안 그리기/"이 기간에 배포 없음" 범례/세로선을 구분한다 — 별도 호출 없이 RED 응답 하나로 markLine이 선다. 캔버스 markLine과 **함께 DOM 범례**(`apm-deployment-marker`)를 세우는 이유: 카드를 표 모드로 바꾸면 캔버스가 사라지고 스크린리더도 그림은 못 읽는다.

**계약 표본 7종**(`deployments.json`·`deployment-compare*.json`·`deployment-new-errors.json`·`webhook-*.json`)은 코덱스 3차 🟡4가 낳았다 — 표본 테스트가 `new ObjectMapper()`로 직렬화하면서 "애플리케이션과 같은 조건"이라고 **적어만** 두고 있었다. 그 둘이 갈리면 표본은 전부 초록인데 실제 응답의 시각 필드만 배열로 나간다. 지금은 애플리케이션 `ObjectMapper`로 직렬화하고, 웹훅 평문 본문 셋은 **컨트롤러를 실제로 호출해서** 만든다(뒤에 record가 없는 `Map`이라 손으로 지은 표본은 아무것도 지키지 못한다).

---

## 16. QA가 잡은 것들 (`features/apm/core/e2e_apm-p2-qa.md`, 결함 15 + 3)

종단 QA는 실 트래픽 3,790요청(`traffic.py`)과 헤드리스 Chrome으로 두 회차를 돌았다. 열여덟 건 중 **이야기가 되는** 다섯을 고른다 — 공통점은 "정상 동작처럼 보이는 화면"이라 사용자가 결함임을 알 방법이 없었다는 것.

### 16-1. D1 — 에러 화면이 15분 창에서 늘 비던 이유(1시간 버킷 정시 내림)

17:03에 16:34~16:49의 예외 8그룹이 실재하는데 `?from=now-15m` → 0, `now-60m` → **0**, `now-120m` → 8. 화면은 "이 기간에 발생한 예외가 없습니다"를 정상처럼 보여 줬다. 원인은 `apm_error_group_1h`가 **1시간 버킷**이고 조인이 `bucket_start >= from`으로 창의 raw 경계를 썼다는 것 — 창이 정시에 시작하지 않으면 사건이 든 버킷이 통째로 배제된다. 더 나쁜 것은 배포의 `new-errors`였다 — 창 시작이 배포 시각(분 단위)이라 정시에 걸릴 확률이 1/60, **사실상 영구 0건**. 그런데 그 메서드 주석은 "시각 정밀도는 롤업 주기가 아니라 그룹 행의 `first_seen_at`(초 단위)이다"라고 적고 있었다 — `first_seen_at` 필터 **앞에서** 조인이 먼저 잘라내므로 사실이 아니었다.
고침(`ApmTimeRange.fromTsHourFloor`, 목록·상세·시계열 3곳): 버킷 조인의 **창 시작만 정시로 내리고**, 넓힌 만큼의 오탐은 그룹 행의 초 단위 `first_seen_at`·`last_seen_at` 교집합으로 2차 필터. 대가: `count`가 창을 덮는 정시 버킷 **전체**의 합이라 요청한 창보다 넓다 — "넓게 세거나 0을 보여 주거나"의 선택이었다. **목록·정렬은 정확, 건수는 근사** — FE 열 제목이 "발생(1시간 단위 근사)"이 된 이유(코덱스 QA-수정분 검수 #2). 5분 버킷 테이블(맵·DB·의존)에는 같은 보정을 걸지 않았다 — 사각지대가 5분이라 최소 프리셋 15분에서는 대부분 살아나고, 그쪽은 정확한 건수가 쓸모 있는 표다.

### 16-2. D2 — exemplar 0/23 (tail 2% → `stored`)

메트릭 exemplar가 준 `traceId` 23개 중 저장된 트레이스가 **0개**(대조군인 에러 그룹 `sampleTraceId` 8/8, DB 그룹 12/12는 전부 열린다). 구조적이다 — exemplar는 메트릭 경로(요청 100%)에서 오고 트레이스는 tail 샘플링(§12-1)을 통과한 것만 남는다. exemplar가 고르는 값은 버킷의 최대 지연인데 그것이 2초 미만·정상 응답이면 남을 확률이 2%. 화면에 미치는 영향이 결함의 본체였다: 계약이 `APM_TRACE_NOT_FOUND`를 "만료됐습니다"로 안내하라고 못박아 뒀는데 이 경우는 **처음부터 저장된 적이 없는 것**이라, 사용자는 보존 기간을 의심하며 창을 좁혀 보고 영원히 열리지 않는다. 다행히 FE가 아직 그 링크를 걸기 전이었다.
고침: exemplar 응답 항목에 **`stored: boolean`** — 서버가 `apm_trace_summary`를 **배치 1회**(창 ±5분 파티션 프루닝)로 확인해 채운다. 상세 404에 새 코드를 만들지 **않았다** — 그 EP는 "샘플링 탈락"과 "보존 만료"를 구분할 방법이 없다(지워진 행은 흔적을 안 남긴다). 옛 주석의 "점마다 찌르는 비용이 크다"는 확인 방법을 잘못 가정한 것이었다. FE는 세 갈래로 그린다(파란 링크 / 회색 금지 아이콘·링크 없음 / 구 서버는 회색 링크).

### 16-3. D17 — CUMULATIVE 극값 미차분 800배 ("exemplar는 최댓값이 아니다", V47)

2회차에서 칩이 `17:10 · 104.88 s`라고 적으면서 **130.9 ms**짜리 `POST /auth/login` 트레이스로 링크됐다. 같은 수가 다섯 버킷에 그대로 반복되고 `traceId`만 매 버킷 바뀌었다. 원인은 **두 값의 출처가 달랐던 것** — 라벨은 `apm_metric_1m.max` 컬럼에서, 링크는 `exemplar_trace_id`에서 왔다. CUMULATIVE(자바 에이전트 기본) 히스토그램에서 `count`·`sum`은 직전 관측과 빼서 증분을 얻지만 **극값은 뺄 수 없어** 누적 최대가 리셋되지 않는다(§2 ⑤ `CumulativeDeltaTracker`의 사각). 붙는 exemplar는 그 export 배치의 최신 것이라 최대값을 낸 요청과 무관하다. 환경 격리로 확정 — `…TEMPORALITY_PREFERENCE=delta`로만 바꿔 재기동하니 그 시점 이후 버킷부터 값이 버킷마다 달라졌다. 설치 가이드가 "CUMULATIVE도 처리"라고 명시하므로 **지원한다고 적어 둔 조합에서 값이 틀린** 것이다.
고침은 "이전 버킷과 비교해 증가분이 없으면 내리지 않는다" 같은 보정이 아니라 **출처를 바꾸는 것**이었다: V47 `exemplar_value` — 값의 정본은 OTLP exemplar 자신(`asDouble`/`asInt`, 구 semconv ms는 초로 환산), 귀속은 exemplar의 `timeUnixNano`(버킷 밖이면 폐기), UPSERT·롤업·조회 전부 **traceId와 값을 같은 행에서 한 쌍으로**. 그리고 CUMULATIVE 히스토그램의 `min`/`max`는 **저장하지 않는다**(`MetricIngestor.valuesOf` — NULL. 고정된 옛 최대값을 싣느니 없는 편이 낫다). 대가 셋: 백분위 클램프가 CUMULATIVE 구간에서 생략 · V47 이전 버킷은 라벨 `null`(옛 `max`로 메우지 않는다 — 그게 거짓말이었다) · 그리고 실시간 "느린 엔드포인트" Top이 그 축을 잃었다 — 이것을 코덱스 QA-수정분 검수 #1이 **P1 Live의 회귀**로 잡아, 저장 롤업용 극값과 **Live용 값을 갈랐다**(`liveMaxOf` — 링에는 그 export의 히스토그램 최상위 버킷 상한이 가고 저장 `max`는 계속 NULL, `c5aac1a`). `maxMs` 필드명은 뜻이 바뀌었는데 그대로다(개명 `valueMs`는 FE 동시 작업이라 보류).

### 16-4. D7 — USER 계정 크래시 (permissions `[]`)

`user.role='USER'`로 로그인하면 `/home`을 포함한 **모든 경로**가 에러 화면 — `Cannot read properties of undefined (reading 'view') at SideNav.tsx:211`. `GET /users/me/permissions`가 USER에게 **`data: []`**를 주고(ADMIN에겐 모듈 배열), `useAuth`가 그것을 평탄화하면 `{}` — truthy라 `if (!permissions) return []` 방어를 통과하고, 그 뒤 `permissions?.hostGroup.view`처럼 **중첩 키에 옵셔널 체이닝이 없는 자리**에서 터진다. P2가 만든 회귀가 아니라 **FE 선재 이슈**인데, 관리자 계정으로만 테스트하는 한 영영 드러나지 않는 종류다(관리자는 모든 키가 채워져 있다). 이것 때문에 §10.5가 요구한 "USER에게 APM 메뉴 숨김"을 런타임으로 검증할 수 없었다.
고침(FE `65e3446`): `utils/permissions.ts`의 `permissionFlagsOf`·`canViewFeature` — 어떤 모양(`null`·배열·빈 객체·비boolean)이 와도 던지지 않고 `=== true`만 참. 규칙은 하나 — **권한 플래그는 절대 직접 파고들지 않고 이 파일을 거친다.** 2회차 QA에서 USER의 UI 폼 로그인 → `/home` 정상 렌더·APM 그룹 없음·검색 "일치하는 화면 없음"을 확인했다. 이 헬퍼가 §17 전환의 FE 쪽 발판이다.

### 16-5. 나머지 한 줄씩

D3 SSE가 USER에게 **401 INVALID_TOKEN**(`produces=text/event-stream` 핸들러가 `ForbiddenError`를 렌더 못 해 `/error` 재디스패치 → SecurityContext 없는 익명 401 — FE가 세션 만료로 읽어 refresh→재시도→로그아웃) → `canRead`로 묻고 응답을 직접 쓴다, 회귀 테스트는 `getResolvedException() == null` · D4 구 semconv 별칭(§12-3) · D5 트레이스 롤업에 min/max 클램프 없음(110ms 1건인데 p50 175ms) → V46 `min_ns`/`max_ns`(P1 QA D2의 보정을 트레이스만 물려받지 못했었다) · D6 표본 불변식(§14-2) · D8 커넥션 스팬(`db.query.text`가 빈 문자열)이 쿼리 그룹이 되어 `dmove_apm|postgres`가 느린 쿼리 3위 → 키가 있는데 빈 것만 제외(아예 없는 것은 정책 DROP일 수 있어 이름 폴백 유지) · D9 계측된 옆 서비스 호출이 "외부 호출"에도 `127.0.0.1`로 두 벌 계상 → 맵의 SERVICE 판정과 같은 조인으로 제외(**결정 번복**, 과거 버킷은 대입 UPSERT라 남는다) · D11 403만 영어 + `errorCode` 없음 → `FORBIDDEN` + 한국어(APM 경로만 — 전역 인터셉터는 `NON_NULL`이 키를 지워 응답이 한 글자도 안 바뀐다) · D16 배포 표가 로딩 중 "배포 없음"을 1초 노출(`isPending` 통일) · D18 USER가 에러 화면을 URL로 열면 403을 "예외가 없습니다"로 그림 → `ApmQueryError` 공용 배너 7화면.

---

## 17. 권한 — 역할 축에서 DMOVE 권한 옵션으로 (✅ 2026-09-03 완료 — BE `4264f57` · FE `8ced9ed`)

### 17-1. 사연 — 세 단계

**① P1부터 조회 EP에 판정이 없었다.** 설계 §8.1은 조회를 🅞(운영자 이상)로 적었는데, P1 조회 EP들은 `@VisitorIdCheck`(로그인) + `Feature.APM`만 검사했다. 즉 일반 `USER`가 서비스 목록·RED 시계열을 읽을 수 있었고, P2 17개 EP가 같은 틀로 만들어지면서 **트레이스 상세·예외 스택·정규화 SQL**까지 그 범위에 들어갔다. 코덱스 2차 🔴2가 발견했다.

**② ADMIN 일괄 게이트.** `core/security/ApmAccessChecker.requireRead`를 신설해 개요·서비스·RED·런타임·실시간·맵·트레이스·에러·DB·의존·exemplar·배포·`/services/{uid}/alert-rules` **전부**의 첫 줄에 넣었다(서비스 계층에 두면 배치·AI 프록시 같은 비인간 호출자까지 검사를 받고, 그 예외를 만들다 보면 검사가 조건부가 된다). 판정은 `ADMIN ∪ SUPER_ADMIN` — 우리 역할 축(`USER·ADMIN·SUPER_ADMIN`)에는 설계가 말하는 "운영자" 등급이 **없고**, 실 계정에 SUPER_ADMIN이 0명인 설치본이 있어 그 축을 좁히면 전원이 잠긴다. 같은 메뉴의 수집기·토큰·설정·알람 규칙은 처음부터 관리자 전용이었으니 "한 메뉴의 절반만 잠긴" 상태를 잠긴 쪽에 맞춘 것이다. 별도 클래스로 둔 이유는 `AdminAccessChecker`와 답하는 질문이 다르기 때문("이 화면을 볼 자격" vs "남의 화면을 바꿀 자격") — 한 이름으로 쓰면 읽기 티어를 넓힐 때 쓰기까지 같이 넓어진다. 그리고 `canViewRawText`(원문 열람)를 **지금부터 갈라 두었다** — 오늘은 같은 집합이지만 읽기가 넓어지는 날 원문만 좁게 두기 위해서(SUPER_ADMIN 전용으로 좁히지 않은 이유도 같다 — 원문 보관을 일부러 켠 관리자가 정작 원문을 못 보는 스위치는 없는 스위치보다 나쁘다).

**③ USER 회귀.** ②의 대가는 명시적이었다: "USER 계정으로 APM 화면을 보던 동작이 있었다면 깨진다." FE가 사이드바 APM 그룹·전역 검색 13항목을 `useIsUserRoleAdmin`(= BE `userRole` 축, `useIsSuperRole`의 Zabbix 역할 혼합이 **아니다** — 후자로 가리면 "Zabbix 슈퍼관리자인 일반 계정"에게 메뉴가 열리고 API만 막힌다)으로 가렸고, D7(§16-4)을 고친 뒤 런타임으로 확인했다. 그러나 이것은 **관리자가 역할 편집 화면에서 끄고 켤 수 없는** 잠금이다 — APM은 모니터링 계열(호스트 그룹·서버·네트워크)처럼 "누가 보나"를 역할별로 정해야 하는 화면인데, 코드 상수가 그것을 대신하고 있었다. 그래서 하루 만에(09-03) 아래 전환으로 이어졌다.

### 17-2. 전환의 설계·의도 — 무엇을 어느 칸에 묶었나

목표: APM 조회·편집을 **DMOVE 권한**(역할 편집 화면의 모듈/기능 체크박스, `Role.dmove_permission` jsonb)에 편입한다. 모듈 `applicationMonitoring` / 기능 `apm` 한 줄. FE는 features를 이름으로 평탄화해 `permissions.apm.view`로 읽는다 — 이름이 곧 계약이라 BE `DmovePermissions.of`·V48의 jsonb 키·FE `DmovePermissionsKey.APPLICATION_MONITORING = "apm"`·`ApmAccessChecker.MODULE/FEATURE`가 전부 같은 문자열이어야 한다(다른 이름을 적으면 영원히 false인 죽은 키 — `ASSET`이 전례).

| 축 | 뜻 | 대상 EP |
|---|---|---|
| **view(보기)** | 조회 화면 전부 — 개요·서비스·RED·런타임·인스턴스·실시간(스냅샷·SSE)·맵·트레이스·에러·DB·의존·exemplar·배포 목록/비교·`GET /services/{uid}/alert-rules` | **36개** — `ApmAccessChecker.requireRead`(SSE만 `canRead`로 묻고 응답을 직접 쓴다, §16-5 D3) |
| **edit(편집)** | 토큰(목록·발급·회수)·수집기(목록·시계열·기본값·설정 YAML·설치 가이드)·수신 상태·APM 설정(GET·PUT)·알람 규칙 CRUD·resync·preview·zabbix-status·alert-events·등록 관리(pending·approve·reject·unknown)·서비스 `PUT`/`DELETE` | **26개** — `ApmAccessChecker.requireEdit`. 삭제를 별도 축으로 두지 않은 이유: APM에 "삭제" 화면이 따로 없고 체크박스를 둘로 나누면 FE가 두 값을 물어야 한다 |
| **원문**(SQL 원문·스택) | **계속 관리자(`userRole`) 축** | `canViewRawText` — 정적 메서드 그대로. "화면 보라고 준 권한"이 "고객 데이터 열람 권한"이 되지 않게(`apm.view` 기본값이 열림이라 거기 묶으면 승격이 아무 화면에도 안 보인다) |
| delete/download | 켜지 않는다 | 대응 EP가 없다(켜면 아무 EP도 보지 않는 체크박스가 된다). YAML 생성은 내려받기가 아니라 생성이라 edit |

🔴 **view/edit을 가르는 축은 HTTP 메서드가 아니라 "관리 화면의 데이터인가"다.** 수집 토큰 목록·APM 설정 조회·설치 가이드·미등록 서비스 목록은 전부 **GET**이지만 수신 경로·비밀값·설치 절차를 담고 있어 `edit`이다. 반대로 `POST /apm/traces/compare`는 아무것도 바꾸지 않는 조회라 `view`다. 그래서 FE도 수집기·알람 규칙 화면은 **조회부터** `canEdit`로 막고(아래 §17-3), 메서드로 추측하면 "메뉴는 보이는데 표가 403"이 된다.

기본값은 **view=true·edit=canAction(관리자만)** — 모니터링 계열과 같다. P1 조회가 원래 "로그인만 하면 열리는" 화면이었고 ②는 임시 조치였으므로 그것을 되돌려 기본을 다시 열었다(⚠️ 거동 변화 — 2026-09-02~03 사이에만 있던 "USER는 APM 조회 불가"가 사라진다. 좁히려면 역할에서 체크를 끈다 — **코드가 아니라 데이터로** 답하는 것이 이 전환의 요점이다). "기본 차단 + 전원 수동 부여"는 26개 역할을 손으로 여는 일이 되고 그동안 APM 메뉴는 아무도 못 본다. edit 기본이 관리자만인 이유: 토큰 하나면 임의의 데이터를 밀어 넣을 수 있다.

**관리자 우회는 여러 겹이다.** 전환 뒤에도 관리자는 체크와 무관하게 통과한다 — 그 우회가 코드에 겹겹이 있다는 것을 알아야 "체크를 껐는데 왜 보이나"에 답할 수 있다: ⑴ BE `DmovePermissionChecker.has()`의 `isAdministrator` 단락(view·edit 공통 판정 **한 곳**에 둔다 — 축마다 복사하면 새 축을 추가할 때 우회를 빠뜨린 축이 생기고 그 축만 관리자에게 잠긴다) ⑵ BE `getCurrentPermissions`가 관리자에게는 저장된 역할이 아니라 **코드 템플릿**(`DmovePermissions.of`)을 준다 ⑶ FE `PageWrapper`의 `adminOnly`/`userRoleAdminOnly`가 `permissionKey`보다 **먼저 단락**한다(둘 중 하나라도 있으면 `permissionKey`는 무시) ⑷ 원문 열람 `canViewRawText`는 애초에 관리자 축이다. 🔴 `edit`은 `view`를 함축하지 **않는다**(그 반대도) — 두 칸은 독립 체크박스이고 "edit이면 view도 참"으로 접어 주면 화면에서 view를 끈 관리자가 왜 여전히 보이는지 알아낼 방법이 없다.

**V48 백필이 필수인 이유.** `Role.dmove_permission`은 jsonb **한 덩어리**라 코드(`DmovePermissions.of`)에 모듈을 추가해도 **이미 저장된 역할 행은 바뀌지 않는다**. 그러면 역할 편집 화면에 APM 체크박스가 **아예 나타나지 않고**(FE `DmovePermission.tsx`는 BE가 준 배열을 그대로 아코디언으로 그린다 — 모듈 목록 하드코딩이 없다), 판정은 fail-closed라 그 역할의 사용자는 APM을 영영 못 본다. 선례는 V27(`awsResources`)인데 🔴 **view가 반대**다 — V27은 코드 기본값 자체가 관리자 전용이라 false였고, 같은 파일을 복제하면서 그 한 칸을 같이 복사하면 "새로 만든 역할은 APM이 보이는데 기존 역할만 안 보이는", 화면에서 원인을 알아낼 수 없는 어긋남이 된다. edit은 백필로 나눠 주지 않는다(관리자는 우회로 통과하므로 지금 동작에 공백이 없고, 위임은 관리자가 명시적으로 켠다). 백필된 모듈은 배열 **맨 뒤**에 붙는다(코드 템플릿에서는 `cloudInfraMonitoring` 다음) — 순서는 아코디언 나열 순서일 뿐 판정에 안 쓰인다.

**🔴 V48은 V27 복제가 아니다 — "기본값 `'{}'`" 사연.** 처음엔 V27을 그대로 베끼려 했다. 그런데 V1 baseline이 이 컬럼을 `jsonb DEFAULT '{}'::jsonb NOT NULL`로 만들어서, **한 번도 권한을 저장하지 않은 역할의 값은 NULL이 아니라 빈 객체 `'{}'`**다. V27의 CASE 식은 첫 분기에서 NULL만 걸러 내고 다음 분기에서 `jsonb_array_elements()`를 부르는데, 객체에 그것을 쓰면 `cannot extract elements from an object`로 **마이그레이션 자체가 실패하고 앱이 기동하지 않는다**(V27이 살아남은 건 그런 행이 아직 없었기 때문일 뿐 — **같은 잠재 결함이 V27에 그대로 있다**, 별건). 그래서 V48은 CASE 대신 **UPDATE 세 문장**으로 나누고 각 문장이 자기가 다룰 수 있는 모양만 WHERE로 집어 간다: ① 배열이 아닌 값(`'{}'`·NULL)은 모듈 하나짜리 배열로 **세운다**(애초에 권한이 없던 역할이라 덮어써서 잃는 것이 없다) → ② 모듈 없는 배열엔 맨 뒤에 **append** → ③ 모듈은 있는데 `apm` 기능만 없는 배열엔 기능만 채운다(신설 모듈이라 지금 걸릴 행은 없지만 재실행·손으로 넣어 둔 dev DB 대비). ①이 먼저라 ②·③은 항상 배열만 본다. 세 문장 모두 "없을 때만" 손대 멱등 — 중복이 생기면 체크박스가 두 개로 보이고 판정은 `anyMatch`라 둘 중 하나만 켜져도 통과해 화면과 실제가 어긋난다. 이것을 Mockito로는 볼 수 없어 `user/DmovePermissionBackfillIT`가 도커 PG(5433)에 세 모양(`'{}'`·보통 배열·이미 모듈 있는 배열)과 재실행을 대고 검증한다(DB 없으면 skip — 리포트에 남는다).

### 17-3. 실제로 들어간 것 — 층별 (커밋 기준)

| 층 | 파일 | 들어간 것 |
|---|---|---|
| BE 템플릿 | `common/constants/DmovePermissions.java` | `module("applicationMonitoring", feature("apm", true, canAction, false, false))` — view=true 기본·edit=관리자만. 역할 편집 화면 체크박스·관리자 템플릿·Zabbix 동기화 시드가 이 한 줄로 같이 정해진다 |
| BE 판정 | `auth/security/DmovePermissionChecker.java` | `requireEdit`/`hasEdit` 신설. view·edit 판정과 **관리자 우회를 `has()` 한 곳**에 — 축마다 복사하면 새 축을 추가할 때 우회를 빠뜨린 축이 생기고 그 축만 관리자에게 잠긴다(`DmovePermissionCheckerTest` 신규) |
| BE 백필 | `db/migration/V48__add_application_monitoring_permission.sql` + `test/…/user/DmovePermissionBackfillIT.java` | UPDATE 3문(위). 🔴 **어느 DB에도 실적용 미검증** — 테스트만 도커 PG로 돌았다 |
| BE APM 게이트 | `premium/apm/core/security/ApmAccessChecker.java` | 정적 유틸 → **`@Component`**(DB를 읽어야 하니 static일 수 없다 — ApplicationContext를 static에 붙드는 우회는 일부러 안 썼다: 테스트에서 주입이 없으면 조용히 옛 판정으로 되돌아가 "프로덕션과 다른 규칙을 검증하는 테스트"가 된다). `requireRead`→`hasView`, `requireEdit` 신설, **컨트롤러 16·호출부 62곳** 교체. 모듈·기능 문자열은 `MODULE`/`FEATURE` 상수로 이 클래스에만(컨트롤러 16개에 흩어지면 오타가 "조용한 fail-closed"). `canViewRawText`는 정적·역할 축 그대로. 거부 문구가 둘로 갈렸다 — 조회 `"APM 화면을 볼 권한이 없습니다."` / 관리 `"APM 설정을 변경할 권한이 없습니다."`(둘 다 `errorCode: FORBIDDEN`, body `code:403`) — 관리 EP도 이제 한국어+`errorCode`다(예전엔 영어 `Access Denied`에 코드 없음). 비용: 판정 1회 = `user`+`role` 조회 2건(관리자 0건). SSE는 구독 시작에 한 번 |
| FE 키·헬퍼 | `enums/user-roles.ts` `APPLICATION_MONITORING = "apm"` · `utils/permissions.ts` `canEditFeature` · `hooks/useApmPermissions.ts` `{canView, canEdit}` | **단일 진입점**. 두 값을 합치지 않는다(합치면 읽기 티어를 넓히는 순간 쓰기까지 넓어진다). 원문 열람 분기는 FE에 **없다**(마스킹은 서버가 한다) |
| FE view 배선 | `layouts/app/SideNav.tsx`·`MobileSideNav.tsx`(`show: canViewApm`) · `constants/navSearchEntries.ts`(13항목 `permission: APPLICATION_MONITORING`) · `layouts/app/SettingsMenu.tsx`(알람 규칙·SLO 2항목 — `permission` 필드 **신설**) · `routes/routes.tsx` APM 15개 라우트 `permissionKey={APPLICATION_MONITORING}` | 🔴 라우트에 `adminOnly`·`userRoleAdminOnly`를 **같이 주면 안 된다** — `PageWrapper` 통과 조건이 OR라 역할 prop이 하나라도 있으면 `permissionKey`가 단락돼 권한 게이트가 죽는다(`apmAdminGating.test.tsx`가 소스에 `useIsUserRoleAdmin`이 되살아나지 않는지까지 문자열로 고정) |
| FE edit 배선 | 서비스 설정 탭(`ApmServiceSettingsTab` 읽기 전용 + 저장/삭제 잠금) · 알람 규칙(`ApmAlertRulesPage` + 탭 3) · 수집기(`ApmCollectorsPage` + 탭 4 + 토큰 발급 서랍 + 만료 배너) — 12화면 | 🔴 **알람 규칙·수집기는 조회부터 `canEdit`**(BE 관리 EP 축과 일치). 없으면 버튼만 숨기는 게 아니라 **조회 훅 자체를 `enabled: canManage`로 끄고** 읽기 전용 배너(`apm.collectors.edit_required`·`apm.alerts.edit_required` — "권한은 역할 편집 화면의 '애플리케이션 모니터링 > APM'에서 켭니다")를 띄운다 — 안 끄면 매 렌더 body 403이 쌓이고 화면엔 "권한이 없습니다"만 뜬다 |
| FE 역할 편집 화면 라벨 | `constants/permissionLabels.ts`(신규) · `components/user-roles/DmovePermission.tsx`·`DmoveRowPermission.tsx` · `locales/{kr,en}.json` | 🔴 **`t("apm")`이 로케일 루트 객체와 충돌한다** — `apm`은 이미 `apm.menu.*`·`apm.collectors.*` 수백 키의 **객체 루트**라 i18next가 문자열을 돌려주지 않고 키 원문 `"apm"`을 찍는다(한 JSON에 같은 이름의 문자열과 객체를 둘 수도 없다). 권한 키는 BE `feature.name`과 반드시 같아야 하니 이름은 두고 **라벨만 예외표로 우회**: `PERMISSION_LABEL_KEYS = { apm: "apm_permission" }`(→ "APM (서비스·트레이스·수집기)"). 같은 표의 `PERMISSION_HINT_KEYS`로 `DmoveRowPermission`에 **힌트 줄**이 생겼다(힌트가 있는 기능만 — "보기=APM 화면 조회, 편집=토큰·수집기 설정·알람 규칙·서비스 편집(원문 SQL/스택 열람은 관리자만)"). 체크박스 4개(보기·생성/편집·삭제·다운로드)만으로는 "편집을 켜면 무엇까지 열리는가"를 알 수 없어서다 |
| 테스트 | BE 전체 2568 green(신규 10) · FE `apmAdminGating` 19 전면 갱신·`SideNavPermissions` +4, 전체 2372 pass(선재 2·플레이크 무관), `tsc`·`typecheck:contract` green | 런타임(V48 실적용·`/users/me/permissions` 응답·역할 편집 화면 렌더) **미검증** |

**🔴 배포 순서 — BE 먼저(코드 + V48).** FE만 먼저 올리면 **관리자에게도 APM 메뉴가 사라진다.** `useAuth`의 `grantAll`은 관리자에게 "모든 기능을 연다"가 아니라 **BE가 내려준 배열에 있는 키만** `true`로 채운다(`normalizeDmovePermissions` — 배열을 순회하며 `result[name]`을 만든다). 그 배열이 어디서 오는지가 역할에 따라 다르다: 관리자는 `getCurrentPermissions`가 **코드 템플릿**(`DmovePermissions.of`)을 주므로 구 BE(템플릿에 `applicationMonitoring`이 없는 빌드)에서는 `apm` 키 자체가 없고, 일반 사용자는 **역할 행**을 그대로 받으므로 V48이 안 돈 DB에서는 키가 없다. 어느 쪽이든 `permissions.apm`이 `undefined` → `canViewFeature`가 false → 사이드바·검색·라우트 15개가 전부 닫힌다. BE가 판정에서 관리자를 우회하는 것과 별개로, **FE 메뉴는 키의 존재에 달려 있다.**

**"체크를 껐는데 왜 보이나"에 답하는 순서**: ⑴ 그 계정이 `userRole` ADMIN/SUPER_ADMIN인가(BE `has()` 우회 + `getCurrentPermissions`가 코드 템플릿을 준다 + FE `grantAll`) ⑵ 역할 행에 `apm` 항목이 **두 벌**인가(V48 재실행·수동 삽입 — `anyMatch`) ⑶ 라우트에 역할 prop이 같이 붙었나(OR 단락). 반대로 "켰는데 안 보이나"는 ⑴ V48이 그 DB에 돌았나 ⑵ FE 키 이름이 `apm`인가.

갱신된 문서: 이 장 · 화면 가이드 §1.8·FAQ 14 · 계약 `features/apm/core/contract_apm-read-api.md` §10.5(전면 개정 — FE가 알아야 할 것·EP별 축·원문) · `ApmAccessChecker` 클래스 주석(축 대응 표·"되돌리지 말 것" 두 가지).

---

## 18. SLO — "약속을 숫자로" (P3 1차 물결, `premium/apm/slo/`)

SLO는 "이 서비스는 30일 동안 요청의 99.9%를 성공시킨다" 같은 **약속**이다. 그 약속을 지표(SLI)로 재고, 어겨도 되는 몫(**에러 버짓**)이 얼마나 남았는지, 지금 그 몫을 **몇 배 속도로 태우는지**(번 레이트)를 보여 주는 화면이다. 정본은 `features/apm/core/contract_apm-p3.md` §1, 검수는 `reviews/review_apm-p3-w1*`.

### 18-1. 산수는 한 클래스에 — `ApmSloCalculator`

| 항목 | 정의 | 왜 그렇게 |
|---|---|---|
| SLI(AVAILABILITY) | 성공 ÷ 전체, 실패는 **5xx만** | 가용성 판정과 같은 정의. 4xx를 실패로 세면 봇 트래픽 하나가 SLO를 깬다 |
| SLI(LATENCY) | 임계 이하 응답 ÷ **잴 수 있었던** 요청 | 히스토그램 버킷 누적. 임계가 버킷을 가로지르면 **균등 분포로 보간**(Apdex와 같은 규약, `ApmPercentiles.countAtOrBelowMs`를 P3에서 공용으로 올렸다). `+∞` 버킷은 절대 안 센다 |
| 에러 버짓 | `(1 − 목표) × measured` | 🔴 **반올림하지 않는다** — 요청 적은 SLO에서 하루치 오차가 월간 버짓을 눈에 띄게 어긋나게 한다(스냅샷의 `good`이 `double`인 이유도 같다) |
| 번 레이트 | 창 안의 나쁜 비율 ÷ (1 − 목표) | 창 길이는 식에 안 들어간다 — 창은 "얼마나 최근의 속도인가"만 정한다 |
| 창 | 지금부터 거슬러 센 롤링 창(7일·30일) | 날짜 경계로 안 자른다. 새로고침마다 값이 조금씩 움직이는 것이 정상 |

**`measured` vs `requests` — 검수 🔴3이 만든 구분.** 처음엔 하나였다. 그런데 LATENCY에서 **히스토그램이 없는 조각**(적재가 경계 충돌로 벡터를 NULL로 확정한 행)이 `ApmHistogramMerger`에서 조용히 빠지면 분모가 그만큼 줄어든 채 "전체 요청의 SLI"로 화면에 올라갔다 — **정상 100건 + 못 잰 9,900건 = SLI 100%**가 가능한 모양이다. 그래서 `Counted(good, measured, requests, mixedBounds)`가 둘을 따로 들고, 갈리면 `mixedBounds`가 선다. 이 플래그는 **표·시계열·스냅샷 세 곳에 같은 규칙**으로 실린다. AVAILABILITY는 언제나 둘이 같다.

**버킷 보간의 함정.** 값이 없으면 `null`이다 — 0이 아니다. 요청 0건 창의 SLI를 0%로 읽으면 새벽에 트래픽 없는 서비스가 매일 버짓을 통째로 태운 것으로 보이고, 100%로 읽으면 죽어 있던 시간이 완벽한 시간이 된다. 그때 `status`는 `UNKNOWN`이고 화면은 회색이어야 한다.

### 18-2. 롤링 창을 세 조각으로 읽는다 — 검수 🔴2의 구멍

처음 구현은 `ApmResolution.choose`가 고른 **한 단**만 읽었다(30일 창은 1h, 7일 창은 5m). 둘 다 롤업이라 두 군데가 비었다: ① SQL이 `bucket_start >= from`이라 **창 시작을 가로지르는 버킷**이 통째로 빠지고(1h 단이면 최대 1시간) ② 롤업은 닫힌 버킷만 지연을 두고 채우므로 **10:37에 30일 창을 보면 10:00 이후의 장애가 버짓에 아예 없다** — 가장 주의해서 봐야 할 구간이 빠지는 것이다.

`planSegments`가 창을 **① 시작 경계 부분(촘촘한 단) + ② 완성 롤업 본문(굵은 단) + ③ 최신 꼬리(촘촘한 단)**로 나눠 읽고 합친다. 경계는 굵은 단의 버킷 격자에 맞춰 자르므로 중복도 누락도 없다. ③의 시작은 상수가 아니라 **롤업 워터마크**가 정한다(`coarseTrustedUntil` — `ApmAvailabilityService.pctTailStart`와 같은 방식). 상수 30분으로 가정하면 롤업이 밀린 동안 굵은 단의 끝이 몇 시간 비어 **전 SLO의 버짓이 한꺼번에 좋아 보인다**(장애 구간이 통째로 빠지므로). 실제로 잰 구간은 `measuredFromMs`/`measuredToMs`로 **응답까지** 올라간다 — 창과 다를 수 있다는 사실을 숨기면 못 잰 시간이 "아무 일도 없던 시간"이 된다.

격자 내림이 `ApmRollupService.floor`(로컬 시각 `date_trunc`)를 빌려 쓰는 이유: 에폭을 나눠 자르면 +05:30처럼 오프셋이 단의 배수가 아닌 지역에서 격자가 어긋나 이음매가 버킷을 가로지른다. ⚠️ 이 판단은 KST에서만 실측됐다.

### 18-3. 스냅샷 — `finalized`와 정의 버전

일 스냅샷 배치(`apm_slo_snapshot`, 매일 00:50)가 어제를 확정하고 오늘 진행분을 쓰고 창 안의 빠진 날을 백필한다(🔴 **5m 롤업 보존 30일 안쪽만** — `BACKFILL_MAX_DAYS`. 그 밖은 원본이 없어 0을 굳히고, 그 0은 캘린더에 없는 사고로 박힌다). 검수 🔴4가 잡은 것: D일 00:50에 쓴 **50분치 진행분**이 D+1 배치 실패 뒤 "행이 있다"는 이유로 건너뛰어져 **하루 전체로 영구히 굳었다**. 백필 판정을 "행이 있나" → **"확정됐나(`finalized`)"**로 바꿨고, 확정된 행은 절대 미확정으로 돌아가지 않는다(돌아가면 보존이 지난 뒤 매일 밤 조금씩 작아진다).

**과거는 되계산하지 않는다**(감사 관점 — "지난주에 우리가 본 값"을 사후에 바꾸지 않는다). 대신 행이 **당시 설정**(`target`·`windowDays`·`latencyThresholdMs`)과 `apm_slo.def_version`을 갖고 있어 지금 설정과 다르면 `staleDefinition:true`로 알린다. 정의 버전은 **재는 기준이 바뀔 때만** 오른다(이름 변경으로는 안 오른다). 오늘 칸은 스냅샷을 쓰지 않고 조회 시점에 다시 재는데, 검수 🟡10이 잡은 대로 **버짓만은 롤링 창** 기준이다 — 오늘 요청만으로 계산하면 월간 예산이 소진돼도 오늘 실패가 없으면 100%가 된다(`ApmSloService.todayCell`).

### 18-4. 번 알람 — 코덱스가 AND를 잡은 사연

처음 구현은 `burn1h > T AND burn6h > T/2.4` **한 줄**이었다. 코덱스 1차 🔴1: SRE 워크북의 멀티윈도우 알람은 **서로 다른 두 알람**이고, `burn1h = burn6h = 10`인 **지속 장애는 이 AND로는 발화하지 않는다**(1시간 조건이 14.4를 못 넘어서). 지금은 SRE 원문대로다:

```
( burn1h > T      AND  burn5m  > T      )   ← 빠른 소진: 즉시 페이지
OR
( burn6h > T/2.4  AND  burn30m > T/2.4  )   ← 느린 소진: 몇 시간에 걸쳐 샌다
```

🔴 **OR는 줄 사이에, AND는 줄 안에** 있다. 긴 창(1h·6h)이 "심각한가"를, 짧은 확인 창(5m·30m)이 **"아직도 나쁜가"**를 묻는다 — 확인 창이 없으면 1시간 창의 기억 때문에 **이미 복구된 장애로 최대 1시간을 더 울린다**. 그래서 창이 둘에서 **넷**이 됐고(`burnWindowsBatch`가 4번 잰다), 어느 줄이 넘었는지는 `burnCondition`(`FAST`/`SLOW`/`NONE`/`UNKNOWN`)으로 응답·로그에 실린다. 2.4는 마법 숫자가 아니라 두 SRE 항목의 비율 `(2%/1h) ÷ (5%/6h)`이다(`SLOW_WINDOW_DIVISOR`가 그 식으로 계산된다).

같은 검수가 두 가지를 더 고쳤다. **기본 임계는 창에서 계산한다** — `0.02 × windowDays × 24` = 30일 14.4 · 7일 3.36. 7일 창에 14.4를 쓰면 "1시간에 예산의 2%"가 아니라 약 8.57%다. 그리고 **상한 `1/(1−목표)`** — 모든 요청이 실패해도 번 레이트는 이 값을 넘지 못하므로 그 이상을 임계로 두면 **영원히 발화하지 않는다**. 서버가 거절하고(`APM_ALERT_RULE_INVALID_THRESHOLD`), 기본값이 상한을 넘는 조합(목표 90% → 최대 10)은 **최대의 절반**을 기본으로 준다. 하한 1은 **허용**이다(판정이 `초과`라 자동 발화가 아니다 — 예전 코드는 `<= 1`로 1까지 거절해 계약과 어긋나 있었다).

### 18-5. Zabbix push 값 규약 — `>0 / 0 / -1`

SRE 조건은 네 창의 OR·AND라 트래퍼 아이템 하나의 표현식으로 못 쓴다. 그래서 STALE처럼 **판정은 우리가 하고** 결과 하나를 `apm.slo_burn[<slo_uid>]`에 민다(🔴 대괄호 안이 서비스가 아니라 **SLO UUID**). 트리거는 `>0`. 값의 뜻은 셋뿐이다:

| 값 | 뜻 | 트리거 |
|---|---|---|
| `> 0` | 위반 중. 발화한 줄의 **긴 창** 번 레이트(빠른 줄이면 1h, 느린 줄만이면 6h) | 발화 |
| `0` | 쟀고 정상 | 해소 |
| `-1` | 🔴 측정 불가(요청 0건·경계 혼재) | 해소(발화 안 함) |

`-1`이 생긴 사연: 전에는 측정 불가일 때 **아무것도 안 밀었다**. 그러면 아이템의 마지막 양수가 남아 트리거가 참인 채 유지되고 — **"수집이 끊겼다"가 "계속 타는 중"으로** 보였다. 반대로 0을 밀면 가장 나쁜 순간에 조용해진다. 그래서 셋째 값이다. 정본은 `ApmAlertKind.VALUE_UNMEASURABLE` 한 곳. 어느 줄이 넘었는지는 값으로 구분되지 않는다(코드를 값에 섞으면 그 이력을 더는 "번 레이트"라 부를 수 없다). 그래서 이 아이템의 그래프를 "번 레이트 추이"로 읽으면 안 된다 — 대부분 0이고 발화 구간에만 값이 뜬다.

**D3 — 끌 때 `-1`을 먼저 민다.** QA에서 발화 중인 SLO를 `enabled:false`로 끄자 우리 DB는 해소됐는데 **Zabbix에는 Problem이 영원히 남았다**. 아이템에 마지막 양수가 있고, 고아 정리가 트리거를 `status=1`로 내려 **다시는 평가되지 않기** 때문이다. 지금은 `ZabbixAlertBridge.pushUnmeasurable`이 트리거를 내리기 **직전에** `-1`을 한 번 민다 — 값이 먼저 들어가야 아직 살아 있는 트리거가 그것을 평가해 회복 이벤트를 만든다(순서를 바꾸면 비활성 트리거에 값을 미는 것이라 아무 일도 없다). 덤으로 재활성이 안전해졌다 — 트리거를 다시 켜는 순간 `last()`가 `-1`이라 몇 시간 전 장애 값으로 곧장 울리지 않는다. ⚠️ `trigger.update`와 Zabbix 설정 캐시의 경합은 미실측이다(3차 검수 요청 불안 1).

### 18-6. 정리 큐 `apm_zbx_cleanup` — 지운 알람이 영원히 울리던 경로

검수 🔴6: 삭제 경로가 "Zabbix 호출 → 실패하면 **예외를 삼키고** → 바인딩·규칙 행 삭제"였다. 그 순간 남은 아이템·트리거를 가리킬 id가 사라지고, 트리거는 마지막 양수를 들고 참인 채 남으며 화면에는 그 규칙이 없다 — **지운 알람이 영원히 울린다.** V53이 큐 표를 만들었고 `ApmZbxCleanupService`가 **행을 지우기 전에** id를 옮겨 적은 뒤 알람 평가 배치(5분)가 성공할 때까지 재시도한다(회차당 20건, 지수 백오프 상한 60분, 성공 시 자기 소멸). 🔴 순서는 **트리거 먼저, 아이템 나중** — 아이템을 먼저 지우면 Zabbix가 그것을 참조하는 트리거를 cascade로 없애 우리 것이 아닌 트리거가 딸려 갈 수 있는데, 큐에는 참조 카운트를 셀 바인딩이 없으므로 넣는 순서가 그 규칙을 대신한다. QA에서는 동기 경로가 매번 성공해 **큐가 한 번도 안 찼다**(누수 0은 확인).

**`burnAlertEnabled:false`는 규칙을 삭제한다** — SLO `enabled:false`(규칙은 남기고 대상만 비워 5분 안에 조용해짐, 다시 켜면 돌아옴)와 다르다. 비활성 규칙을 남기면 알람 규칙 목록에 사용자가 만든 적 없는 행이 보이고, 거기서 다시 켜면 SLO 화면과 갈린다 — 입구가 하나면 상태도 하나다. 대가는 다시 켤 때 **새 규칙 uid**가 생겨 발화 이력의 연결이 끊기는 것. 알람 규칙 화면에서 `SLO_BURN`을 만들면 거절된다(`APM_ALERT_RULE_SCOPE_INVALID` — 거기엔 SLO를 고를 축이 없다).

---

## 19. 합성 감시 — Zabbix 웹 시나리오를 빌려 쓰기 (P3 2차 물결, `premium/apm/synthetic/`)

APM의 다른 모든 시그널은 OTel Collector로 들어오지만 **합성 감시만 Zabbix의 웹 시나리오**다. 이미 있고 실사용 중이라서 — 프록시(지역) 분산·주기·재시도·인증까지 갖춘 채 돌고 있는 것을 다시 만들면 운영할 스케줄러가 하나 더 생긴다. 그래서 **수집은 Zabbix, 화면만 APM**이다. 정본 `features/apm/core/contract_apm-p3.md` §3, 검수 `reviews/review_apm-p3-w2*`.

### 19-1. 엔진 계약 — 가공 없음

`engine-api …/zabbix/httptest/ZabbixHttpTestService`(get/create/update/delete)는 `httptest.*` JSON-RPC를 그대로 나르기만 한다(ADR D9·D11 — `maintenance`·`item` 계약과 같은 모양). 24시간 가용성·p95·캘린더·한국어 실패 사유는 전부 app 계층이 만든다. 🔴 **결과(측정값)를 읽는 계약은 여기 없다** — Zabbix는 시나리오를 만들면 결과를 **보통의 아이템**(`web.test.*`)으로 자동 생성하므로, 이미 있는 `ZabbixItemService.getRaw` + `ZabbixHistoryService`로 읽는다. 키 규칙은 `ApmSyntheticItemCatalog`가 안다.

그래서 이 메뉴의 성질 셋이 따라온다: **정본이 우리 DB가 아니다**(우리가 저장하는 것은 서비스 연결 한 줄, `apm_synthetic_binding`) · 창이 Zabbix history 보존에 잘린다(`coveredDays < days`가 정상) · 시나리오가 사라질 수 있다(`orphaned:true`).

### 19-2. 매퍼 — `post_type`은 Zabbix가 안 받는다 · RAW=0/FORM=1을 거꾸로 읽었던 사연

코덱스 2차 🔴1·🔴2, 둘 다 `ApmSyntheticZabbixMapper`. **① 쓰기**: 모든 단계에 `post_type`을 실어 보내고 있었는데 Zabbix 7.0 `httptest.create/update`의 단계 입력 스키마(`CHttpTest.php`)에는 그 필드가 **없다** — `posts` 하나뿐이고 형식은 `posts`가 **문자열이냐 배열이냐**로 정해진다. 없는 파라미터는 `-32602`라 **생성과 `steps`를 포함한 수정이 전부 거절**되고 있었다. 이제 `post_type`을 보내지 않고 RAW는 문자열, FORM은 `[{name,value}]`로 보낸다. 판정은 **값 → 선언** 순서다(`isRawBody`: `postsRaw`가 왔으면 RAW가 확실, 없을 때만 `postType` 선언) — 반대로 하면 "형식만 바꾸고 본문은 안 보낸" 요청에서 배열 자리에 빈 문자열이 가 Zabbix가 형식을 RAW로 바꿔 버린다. 셋 다 없으면 `posts` 키 자체를 안 보낸다(=유지).

**② 읽기**: `defines.inc.php`는 `ZBX_POSTTYPE_RAW = 0`·`FORM = 1`인데 코드가 반대였다. RAW 문자열이 빈 FORM Map으로, FORM 배열이 문자열로 읽혀 **①만 고쳐도 기존 시나리오를 저장하면 본문이 손상**됐을 것이다. 지금은 `postTypeOf(posts, code)`가 **`posts`의 실제 타입을 정본**으로 본다(List→FORM, String→RAW) — 값 자체가 형식을 말해 주므로 상수 방향을 다시 틀릴 여지가 없고, `post_type` 코드는 `posts`를 안 읽은 조회의 보조다. 테스트의 기준 데이터(`post_type=1`을 RAW 정답으로 고정)도 같이 틀려 있었다는 것이 교훈이다 — **문서 기반 구현은 테스트도 같은 문서를 베낀다.**

### 19-3. `httpStepId` round-trip — 이력을 지키는 유일한 끈, 그리고 `isNew`

Zabbix update에 `steps`를 보내면 **전체 교체**다. 그때 `httpstepid`를 빼면 그 단계는 **오류 없이** 지워졌다가 새로 생기고, 새 단계엔 새 아이템이 붙어 **그 단계의 응답 시간 이력이 사라진다**. 이 레포가 액션에서 겪은 round-trip 사고(`ActionFilterNormalizer`)의 더 나쁜 판본이다 — 저쪽은 거절이라도 됐다. QA D9가 이것을 **반증 실험으로 실증**했다: 같은 본문에서 `httpStepId`만 빼자 stepId 35·36 → 37·38, 단계 아이템 6개 itemid 전부 교체, Zabbix는 200.

그래서 목록엔 없고 **단건 조회 EP를 추가**했다(설계 표엔 없다 — 폼이 `httpStepId`를 되돌려 보내야 하는데 목록에 다 실으면 시나리오 수 × 단계 수만큼 헛되이 무겁다). 그리고 D9 반영으로 **서버가 막는다**(`ApmSyntheticService.reconcileStepIds`, Zabbix 호출 전): ① id 있음 → 그대로 ② id 없는데 **이름이 같은** 기존 단계가 있으면 그 id를 **되붙인다**(QA가 실증한 파괴 시나리오가 정확히 이 모양이라 규약을 모르는 클라이언트도 구제) ③ 짝도 없고 `isNew:true`도 없으면 `400 APM_SYNTHETIC_STEP_ID_REQUIRED`. 서버는 "새 단계"와 "개명하면서 id를 빠뜨림"을 구분할 수 없어 후자를 통과시키면 이력이 조용히 사라지므로, **새 단계를 추가하는 클라이언트는 `isNew:true`를 보내야 한다** — 🔴 계약 변경이라 FE 마지막 커밋엔 없고 작업 트리에서 반영 중(§23-4). 요청 DTO의 `isNew`가 `Boolean` 래퍼인 이유: `boolean isNew`면 Jackson이 "is"를 떼어 JSON 키가 예약어 `new`가 된다.

### 19-4. 결과 아이템 — hostid 축·이력 커서·`lastvalue`

| 사연 | 무엇이 틀렸었나 | 지금 |
|---|---|---|
| 🔴 동명 시나리오(검수 #3) | `hostid`를 조회하고도 버리고 `(metric, 시나리오, 단계)`만 키로 써서 **A 호스트 장애가 B 호스트 정상값에 덮였다**. 같은 이름을 호스트마다 두는 구성(지역별 감시)이 정상 사용법이라 드문 사고가 아니다 | `ItemKey(hostId, metric, scenario, step)`·`ScenarioRef(hostId, scenario)`. `parse(hostId, key)` 서명이 호출자가 hostid를 버릴 수 없게 강제한다. 회귀 테스트는 같은 `history.get` 한 번에 두 아이템의 점이 섞여 오는 실제 거동 그대로 |
| `web.test.error` 타입(#4) | `history=4`(Text)로 물었다. 실제는 **Character(1)**라 Zabbix가 **오류 없이 빈 배열**을 주고 실패 사유가 통째로 `UNKNOWN` | 아이템의 실제 `value_type`을 우선하고(`item.get`에 추가로 읽음), 타입별로 `history.get`을 나눠 부른다. 카탈로그 `HISTORY_CHARACTER=1`은 폴백 |
| 🔴 이력 절단(#5) | ASC 조회에 기본 상한 10만이 걸려 **오래된 점만 남고 최신이 잘렸다**(1분 주기 70개 시나리오의 24시간 실패 아이템만으로 초과). `truncated`도 단계 계열의 점 수만 세고 있었다 | `pagedHistory`가 `limit` 2만을 명시하고 커서(마지막 초, **포함**)를 밀며 끝까지 읽고 `(itemid, ms)`로 dedupe — 배제하면 같은 초의 다른 아이템 점을 영영 못 본다(대가: 같은 아이템·같은 초 두 점은 하나로 접힘, `web.test.*` 최소 주기가 1초라 실사용에선 없다). **최신 상태는 이력이 아니라 `lastvalue`/`lastclock`**에서 만든다(절단과 무관). ⚠️ "Max history display period"(기본 24h)보다 오래된 마지막 값은 `lastclock='0'`으로 와 그때만 이력의 마지막 점으로 떨어진다. `truncated`는 fail·error·time·bps·code 전부의 OR |
| `delay` 매크로(#9) | `{$INTERVAL}`을 읽고도 초 변환 실패로 **수정을 거절** | 표시 환산(`delaySec`, 매크로면 null)과 쓰기 검증(`isWritableDelay` — 매크로면 통과, 아니면 1초~1일)을 갈랐다 |

`web.test.fail`은 불리언이 아니라 **실패한 단계 번호**(0=성공)다 — 불리언으로 읽으면 가용성이 정확히 반대가 된다. `web.test.time`은 **초**라 BE가 ×1000 한다. 이 두 줄이 `ApmSyntheticItemCatalog` 주석의 첫머리에 있는 이유다.

### 19-5. 가용성 옆의 신선도·커버리지, `monitored_by`, 프록시 칸이 없는 이유

가용성의 분모는 **관측된** 실행 수라 23시간 전 성공 한 점만 있어도 `OK · 100%`다 — 그 자체는 정확하지만 "지금 정상"으로 읽힌다(검수 마무리 지적). 분모 규약은 그대로 두고(안 돈 시간을 장애로 만들지 않는다) 신뢰도를 따로 낸다: `expectedChecks24h`(86400/주기, 매크로면 null)·`coveragePct`(**수집 공백**)·`staleSeconds`·`stale`(임계 `max(주기×3, 300초)` — ⚠️ 근거 없는 상수). 🔴 한 번도 안 돈 시나리오는 `stale=false`("아직"과 "끊겼다"는 다르다). `truncated`(조회 한계 — 창을 줄이라)와 수집 공백(Zabbix를 점검하라)은 **다른 문구**여야 한다.

**`monitored_by` 분기(#10).** `proxyid=0`만으로 "서버 직접 감시"를 확정하던 것이 **프록시 그룹 감시**(`monitored_by=2`, `proxyid` 비어 있음)를 서버로 오표시해 지역 비교에서 다른 관측 위치가 서버 줄에 합쳐졌다. 지금은 `monitored_by`·`proxy_groupid`를 함께 읽어 `SERVER/PROXY/PROXY_GROUP/UNKNOWN`으로 가르고 🔴 서버로 접지 않는다(`monitored_by=1`인데 `proxyid`가 없는 모순도 UNKNOWN). "없는 필드로 `host.get`이 죽는다"던 옛 우려는 같은 레포의 `HostManageService`가 이미 그 필드를 요청하고 있어 성립하지 않았다. ⚠️ 그룹 **이름**은 모른다(`proxygroup.get`을 엔진 계약에 안 넣었다).

**프록시 칸이 없는 이유.** 설계는 "프록시별 비교"를 요구했지만 착수해 보니 **Zabbix 7.0 `httptest`에 프록시 필드가 없다** — 시나리오를 실행하는 것은 그것이 붙은 **호스트를 감시하는 쪽**이다. 그래서 `GET /apm/synthetics/proxies`는 "프록시 목록"이 아니라 **프록시 + 그 프록시가 감시하는 호스트**를 준다. 이 사실을 화면이 말해 주지 않으면 사용자는 대신 **호스트의 프록시를 바꾸고**, 그 순간 그 호스트의 **모든 감시**가 옮겨 간다. "프록시별 비교"는 첫 단계 URL이 같은 시나리오를 형제로 보는 휴리스틱(`byProxy`, 24시간 고정)으로 대체됐다.

### 19-6. QA 실 round-trip 결과 (`e2e_apm-p3-qa.md` §0 3-1~3-17)

가장 무서운 두 시나리오가 둘 다 안전했고 — 이유가 서로 다르다. ① 쉼표 든 한글 시나리오 이름(`qa-apm-syn-한글, 쉼표 시나리오`) 때문에 Zabbix가 아이템 키를 **따옴표로 감쌌는데도** BE가 값을 읽어 냈다(`checks24h:2`·`p95Ms:86.7` — R-8이 걱정한 "빈 차트"가 아니다). ② 화면 Drawer 저장 경로에서 PUT 본문에 `httpStepId`가 실리고 **아이템 id 9개가 불변**이라 R-7이 닫혔다. 그 밖에 `post_type` 미전송·RAW/FORM 정합(Zabbix 실측: RAW `posts`는 문자열, FORM은 배열)·검증 10종·매크로 주기·`monitoredBy` SERVER/PROXY·`orphaned`·bind/unbind 409/404 전부 PASS. **미검증**: `PROXY_GROUP`(dev Zabbix에 그룹이 없다)·`truncated:true`(이력이 짧다)·정리 큐. 원복: 시나리오 22개·`web.test.*` 0건·바인딩 0행.

---

## 20. 메시징·배치 — 스팬에서 큐와 잡을 읽어 내기 (P3 2차 물결, `messaging/`·`job/`)

둘 다 원본은 `apm_span`이고, **별도 배치가 아니라 트레이스 롤업(`apm_trace_rollup`)의 5·6단계**다. 워터마크가 갈리면 "서비스 맵에는 있는데 메시징 표에는 없는 5분"이 생기기 때문이다(맵의 `QUEUE` 엣지가 바로 그 PRODUCER 스팬들이다). 🔴 QA 관찰 2: `apm_rollup`을 돌려도 `apm_messaging_5m`/`apm_job_run`은 0행이다 — "기능이 죽었다"로 오진하기 쉬워 두 스텝 클래스 javadoc에 박아 뒀다. 정본 `features/apm/core/contract_apm-p3.md` §4·§5.

### 20-1. 메시징 롤업 — 발행 짝 검증·개별 소비 시각 lookback·`lagP95OverCap`

축은 `(서비스, 시스템, 목적지, 오퍼레이션)`이라 같은 토픽이 `order-svc/PUBLISH`·`billing-svc/PROCESS`로 따로 선다(서버가 합치면 그 구분을 되돌릴 수 없다). 🔴 `messaging.system`이 없으면 메시징 스팬이 아니다 — kind만으로 고르면 큐와 무관한 스팬이 섞인다. 목적지 정규화는 신·구 semconv 둘 다 읽는데, `messaging.destination`(구)은 적재의 `LEGACY_ALIAS`가 이미 신 이름으로 개명하므로 롤업 SQL의 그 폴백은 **죽은 분기**이고 `messaging.operation`(구)의 폴백은 별칭이 없어 **살아 있다**(QA M-6). 🔴 둘 다 지우지 말 것 — 앞의 것은 별칭표가 이 표현식을 모르니 한 줄 빠지면 "모든 큐가 익명 자리로 접히는 조용한 왜곡"이고, 뒤의 것을 지우면 이미 저장된 구 이름 행이 통째로 RECEIVE로 접힌다.

**소비 지연**은 소비 스팬이 발행 스팬을 **스팬 링크**(정식) 또는 부모로 가리킬 때만 잰다. 검수 🟡7: 처음엔 `kind=PRODUCER`만 확인해 **비동기 작업 인과 링크까지 그 큐의 지연으로** 집계될 수 있었다. 지금은 셋을 모두 요구한다 — 발행 쪽에 `messaging.system`이 있고 · 소비 쪽과 같고 · 정규화된 목적지가 같고 `__unnamed__`가 아닐 것. 확인이 안 되면 **재지 않고** 그 비율이 `lagUnmeasuredPct`로 드러난다(`PUBLISH` 줄은 지연 개념이 없어 100%가 정상). 배치 소비는 첫 링크만 본다(근사). lookback은 검수 지적대로 **"처리 창 시작 − 1시간"에서 "개별 소비 시각 − 1시간"**으로 바꿨다 — 전자는 밀린 구간을 따라잡느라 창이 커지면 같은 표본의 포함 여부가 달라졌다. 그보다 오래 큐에 머문 메시지, 즉 **가장 보고 싶은 지연**은 여전히 `lagCount`에 안 들어간다.

**`lagP95OverCap`(#8).** 지연 히스토그램이 지속시간용 격자(`duration_s` 14단, 상계 ≈10초)를 공유한다. 상계를 넘는 지연이 많으면 p95가 마지막 유한 경계 10초로 나오는데, 그 값이 관측 min·max 안이면 **클램프가 아무 일도 안 한다**(1초 1건·60초 99건 → p95 10초로 6배 과소) — 계약이 적었던 "max로 근사"는 이 경우 성립하지 않았다. 전용 격자는 안 만들었다(`CanonicalBounds`·`apm_hist_bounds`·`isCanonical` 세 곳이 갈리면 **모든 히스토그램이 조용히 재버킷**된다). 대신 `ApmPercentiles.exceedsTopBound`로 "이건 하한이다"를 내보내고 화면이 `≥ 10,000ms`로 그린다. QA 4-5에서 실측 p95 60초가 그대로 `lagP95Ms:10000 · lagP95OverCap:true · lagMaxMs:60000`으로 왔다.

### 20-2. 트랜잭션이 두 단계만큼 커졌다

메시징·배치가 실패하면 엣지·에러·DB·의존까지 **함께 롤백**된다. 워터마크가 안 움직이므로 손실은 없지만 **한 도메인의 결함이 나머지 넷을 멈출 수 있는 결합**이 생겼다 — 같은 창을 공유해야 한다는 요구와 맞바꾼 것이고, 되돌리려면 워터마크를 갈라야 한다. 코덱스 2차가 "그 롤백이 실제로 일어나는지"를 요구해 `ApmRollupTransactionRollbackIT`가 새 두 단계에 각각 예외를 주입하고 네 집계 0행 + 워터마크 미전진 + 다음 회차 복구를 실 PG에서 못 박는다(대조군 포함 — "롤백은 되는데 원래도 안 써졌던" 위양성을 막는다).

### 20-3. 배치 잡 — `job.*` 규약·완료 시각 경로(V54)·`(service, job)` 축·SET NULL(V56)

OpenTelemetry에는 배치·잡 시그널이 **없다**. HTTP·DB·메시징은 자동 계측이 채우지만 "이 프로세스가 밤 2시에 돌아 12분 걸렸고 성공했다"를 말하는 표준이 없어 **우리가 규약을 정했다**(`ApmJobConventions` — 정본): ① 루트 스팬 ② `kind=INTERNAL`(SERVER면 RED에 섞여 API 트래픽이 부푼다) ③ `job.name` 속성(**스팬 이름이 아니다** — 계측 라이브러리가 정해 버전에 따라 바뀌면 같은 잡이 두 줄로 갈린다). `UNSET`은 실패가 아니다(실측 32스팬 중 31이 UNSET) — `successRatePct`는 정확히는 "실패로 기록되지 않은 비율"이다. **규약을 안 지키면 이 화면은 영원히 빈다**, 그래서 빈 상태에 규약과 코드 예시를 그대로 싣는다.

**허용목록에 `job.*`가 없어 조용히 버려지던 사연.** `ApmSpanAttrAllowlist`는 P2가 정한 허용 키만 남기고 나머지를 적재에서 지운다. `job.name`·`job.run.id`·`job.trigger`·`messaging.operation.type`이 거기 없었다 — 즉 착수 시점에 규약대로 계측한 앱의 스팬이 들어와도 `apm_job_run`이 **영원히 빈 상태**였고 오류도 로그도 없었다. 2차 물결이 네 키를 더했다. ⚠️ 소급되지 않는다 — 그 전에 저장된 스팬에는 여전히 없으니 배포 이후 실행부터 채워진다(빈 화면을 규약 위반으로 오진하지 말 것).

**완료 시각 경로 — "하루보다 긴 배치"가 아니라 15분이었다(검수 🔴6).** 스팬은 잡이 **끝난 뒤** 도착하는데 롤업은 `start_ts`가 재처리 창(워터마크 + 두 버킷 = 약 15분) 안인 스팬만 잡았다. 다른 트래픽으로 워터마크가 전진하는 환경에서 **30분짜리 배치도** 도착 시점엔 시작 버킷이 창 밖이라 영원히 안 나타났다. 지금은 WHERE가 두 갈래 — 시작이 창 안 **또는** `start_ts + duration`이 창에 걸침(스캔 하한 `from − 7일` = 스팬 보존). 그 스캔을 가능하게 하는 것이 **V54 부분 인덱스**(`WHERE kind='INTERNAL' AND parent_span_id IS NULL`, 파티션 부모에 만들어 기존·미래 파티션에 딸려 간다). 멱등은 `UNIQUE(trace_id, span_id)` + 대입 UPSERT가 맡아 두 경로에 동시에 걸려도 한 줄이다(`apm_job_run`이 파티션이 아닌 이유 — 질의 축이 시간보다 `job_name` 단건이 잦고, 자연키로 재실행 멱등을 얻는다). 남는 한계는 **스팬 보존 7일을 넘겨 끝나는 잡**뿐. ⚠️ 부분 인덱스의 쓰기 비용·설치 시 ACCESS EXCLUSIVE 소요는 미측정. 🔴 `ApmJobConventions` javadoc 끝의 "하루보다 긴 잡은 … 10분" 문단은 **V54 이전 문구**라 코드와 어긋난다(갱신 대상).

**`(service, job)` 축(QA M-2)과 SET NULL(M-4).** `/apm/jobs`가 `job_name` 하나로 묶어 같은 이름을 두 서비스가 내면 한 줄로 합산되고 서비스명엔 "마지막 실행자"만 찍혔다(실측 4건 중 3건이 남의 실행). 지금은 `(service_id, job_name)`이 행이고 `/runs`에 `service` 파라미터가 생겼다. 그리고 계약 §5.2가 "지워진 서비스면 `serviceUid:null`"이라 적어 놓고 V52의 FK가 `ON DELETE CASCADE`라 서비스를 지우면 **90일치 실행 이력이 통째로 사라졌다** — 그 null 경로가 실제로는 없었고, 같은 문장을 쓰는 메시징 표는 FK가 아예 없어 반대로 동작했다. V56이 `SET NULL`로 통일했다(배치 이력은 사건 기록이라 서비스를 지운 뒤에도 답이 있어야 한다). 조회·적재 코드는 무수정 — `getLong`이 NULL에 0을 주고 `refs.get(0L)`이 null이라 이미 접혀 있었다.

### 20-4. 🔴 실 데이터가 없다

QA 관찰 1: 샘플 앱은 PRODUCER·CONSUMER 스팬을 **0건** 낸다(`apm_span` 202,871건 중 0, `job.name` 보유 0). §4·§5는 **전부 손으로 만든 OTLP**로만 검증됐다 — 실제 OTel 에이전트가 내는 속성 이름·형태가 다를 가능성은 열려 있다(§7.2-2와 같은 성격). 그 밖에 `attrs->>` 조인 술어가 GIN `jsonb_path_ops`를 못 타는 비용, `apm_messaging_5m`의 열린 목적지 축(임시 큐 `amq.gen-*`가 행을 폭발시킬 수 있다 — 상한 대신 30일 파티션 DROP만) 실측 전.

---

## 21. 리포트 — 두 표의 id가 겹친다 (P3 3차 물결, `premium/apm/report/` + `report/`)

주간/월간 APM 리포트를 **기존 리포트 체계(설정 › 리포트 관리)에 편입**했다. 그래서 이 절만 EP가 `/apm/*`이 아니라 `/admin/reports*`이고, 절반은 새 EP가 아니라 **기존 두 EP의 확장**이다. 정본 `features/apm/core/contract_apm-p3.md` §8.

### 21-1. `ManagedReportSource` SPI — 아키텍처 테스트 A1이 실제로 막은 이야기

편입하려면 `report/`(STANDARD)의 `ReportManagementService`가 `premium.apm`의 `ApmReportSnapshotRepository`를 알아야 할 것처럼 보였고, 처음 그렇게 주입하자 `LicenseArchitectureTest` **A1("premium 밖의 코드는 premium에 의존하지 않는다")이 실제로 빨갛게 떴다** — "STANDARD 코드가 프리미엄에 얽히면 분리 배포도 모듈 승격도 불가능해진다". 그래서 의존을 뒤집었다: `report/ManagedReportSource`(SPI — `kind()`·`count()`·`top(limit)`·삭제)를 두고 프리미엄의 `ApmManagedReportSource`가 자기를 꽂는다. `ReportListAssembler`가 계열마다 `offset+limit`개를 `periodStart` 내림차순으로 미리 받아 병합한다(합친 목록의 k번째는 반드시 어떤 계열의 상위 k+1개 안에 있으므로 페이지가 정확하다 — 작은 계열 전제). 프리미엄을 들어낸 빌드에서는 구현이 없고 목록·삭제·보존이 호스트 그룹만 다룬다 — **STANDARD 코드는 한 줄도 안 고쳤다.**

**두 표의 id가 겹친다.** `host_group_report`와 `apm_report_snapshot`은 시퀀스가 달라 **1번이 양쪽에 다 있다**. 행의 키는 `(type, id)`, 삭제 본문은 배열이 둘(`ids`/`apmIds`), 상세 EP는 계열마다 다르다(`/admin/reports/apm/{id}` — `/reports/{id}`는 서버가 "1번 리포트"를 결정할 수 없어 불가능). 🔴 호스트 그룹 id로 APM 상세를 부르면 `APM_REPORT_NOT_FOUND`다(QA 5-5 실측). 목록 EP에는 `@RequiresFeature(APM)`을 붙이지 않았다 — 붙이면 APM 미보유 설치본에서 호스트 그룹 리포트 목록까지 막힌다.

### 21-2. 기간 = 스냅샷 1건 · 요청 가중 가용성(D4)

한 기간에 스냅샷은 **하나**고 서비스별 수치는 본문 `services[]`다(`host_group_report`가 그룹마다 한 행인 것과 다르다 — 리포트 관리 목록은 사람이 훑는 표라 서비스 40개 설치본에서 매주 40행이 쌓이면 못 쓴다). `ApmReportBuilder`가 서비스마다 RED(`ApmSeriesQueryService.redWindow` — 화면과 **같은 함수**, 창 전체 히스토그램을 한 번에 병합한 백분위)·가용성(스트립과 같은 판정, `firstSeenAt` 이전 칸은 아예 안 센다)·배포·알람·SLO 일 스냅샷 합·합성 캘린더·예외 Top 5를 두 창(이번·직전) 재서 굳힌다. 집계 경로에 트랜잭션이 없다 — 합성이 있으면 집계 중 **Zabbix HTTP**가 나가는데, 감싸면 그 왕복 내내 커넥션을 붙잡고 서비스 수만큼 곱해져 풀이 마른다(대가: 스냅샷 격리가 아니다).

**D4 — 가용성 56.63%.** `totals.availabilityPct`가 **단순 평균**이었다. 실측: moveseye-be(204,591건, 100%)·qa-node(83%)·qa-python(100%)·qa-direct(**0건, 0%**)·qa-oldsemconv(**0건, 0%**) → `(100+83+100+0+0)/5 = 56.63` — 실제 트래픽의 99.9%가 100% 가용이었던 주에 헤드라인이 그렇게 떴다. 🔴 "UNKNOWN은 분모에서 뺀다"는 안전장치가 못 막는다 — 요청 0건 서비스의 칸은 `UNKNOWN`이 아니라 **`STALE`**(수집기 자체는 살아 있으므로)이라 다른 서비스가 살아 있는 설치본에서 죽은 서비스는 언제나 0%다. 지금은 `p95`·`apdex`와 같은 **요청 수 가중 평균**이고 제외된 수를 `notes.availabilityUnweightedServices`로 내보낸다. 서비스별 칸은 그대로 0%(거기서 0%는 사실이고 그래야 죽은 서비스를 발견한다). ⚠️ 그 전에 굳은 스냅샷은 단순 평균 값이 박혀 있다.

### 21-3. `createdAt` KST+Z(D2) · UTC/로컬 축 · 배치 시각

**D2.** 같은 응답 안에서 `createdAt = 2026-09-07T17:48:36Z`(KST 시각에 Z를 붙임)와 `body.generatedAt = 08:48:36Z`(진짜 UTC)가 갈렸고, FE가 Z를 믿고 +9 해서 목록에 **다음 날 새벽**으로 그렸다. HOST_GROUP 행도 같은 선재 결함이었지만 계약이 형식을 못박아 APM이 물려받았다. `ReportTimes.toUtcIso`로 **두 계열을 함께** 진짜 UTC로 고쳤다(한 목록에 섞여 나오므로). 🔴 전역으로는 안 고쳤다 — 이 패턴은 `BaseEntity` 포함 수십 곳의 NestJS 1:1 보존물이라 별도 과제.

**두 축.** 기간(`fromTs`/`toTs`)은 **UTC 자정** 경계(호스트 그룹 리포트와 같은 `ReportPeriod`)인데 `apm_slo_snapshot.day`와 합성 캘린더의 날짜는 **서버 로컬**이다. KST에서 최대 9시간 어긋나 주/월 경계에서 SLO·합성이 하루치를 더 담거나 덜 담을 수 있다. RED·가용성은 epoch 창이라 무관. 월간 가용성은 5m 보존(30일) 밖이라 **1시간 칸**이고, 대가는 한 시간 안에 끝난 장애가 안 보이는 것(`notes.availabilityCellSeconds: 3600`).

**배치.** `apm_report_weekly` 월요일 10:10 · `apm_report_monthly` 1일 10:40 — 호스트 그룹의 03:00대보다 늦은 이유는 자원 경합 회피 + **KST 04시에 돌면 UTC로는 아직 전날**이라 "지난주"가 한 주 밀리기 때문. 그래도 시각에 기대지 않고 이미 닫힌 기간을 최대 3개(`MAX_CATCHUP`)까지 함께 굳히는데, QA 5-10이 확인한 대로 이것은 **과거 소급이 아니라 직전 기간에서 앞으로** 훑는 것이다. 목록에 없는 기간도 `/detail`로 열면 그 자리에서 만든다(lazy 백필, 마감된 기간만) — 그때는 **지금 남아 있는 원재료**로 만들므로 5m 롤업(30일)·예외 그룹(90일)이 지난 기간은 그만큼 얇다(`topErrors`가 비면 "오류가 없었다"가 아니라 "원본이 지워졌다"). 라이선스 만료돼도 배치는 돈다(멈추면 원재료가 보존을 넘겨 그 기간을 영원히 못 만든다) — 조회만 `Feature.APM` 게이트.

**권한은 `apm.view`가 아니라 관리자다**(`ReportAdminAccess.require`). 리포트 관리는 설정 화면이고 그 규약이 관리자라서 — 편입의 대가. D7로 거부 바디가 `errorCode:"FORBIDDEN"` + 한국어가 됐는데 **리포트 관리 6개 EP만**이다(`AdminAccessChecker` 자체는 컨트롤러 40여 곳이 부르고 NestJS 1:1 문자열 계약이라 안 건드렸다).

---

## 22. 홈 위젯·AI 툴·권한 축 정리 (P3 1차 물결 + 3차)

### 22-1. 홈 위젯 3종 — 30초 캐시

`apm_status`(도넛+오류율 Top)·`apm_slow_services`·`apm_alerts`(터진 것 + `sloRisks` = 곧 터질 것)를 `HomeWidgetType` 21종에 더했다. 🔴 `adminOnly`가 아니다 — APM 권한 축은 역할이 아니라 `apm.view`(기본 열림)인데 홈 카탈로그에 그 축이 없어 **카탈로그는 열어 두고 거부는 EP가** 한다(FE는 `isHomeWidgetTypeVisible`에 `apm.view`를 태워 카탈로그에서도 감춘다). 기본 세트엔 안 넣었다(수집기 없는 설치본 대다수에 빈 카드가 생긴다). `GET /apm/overview`를 쓰지 않은 이유: 저쪽은 목록 한 벌 + 합계 두 벌 + 히트맵을 만들어 서비스 목록보다 비싸고 홈은 카드마다 폴링한다. 코덱스 🟡11("`limit=5`라도 SLO 전량 계산, SLO 100개면 질의 300회")로 SLO 표가 **서비스 축 배치 질의**가 되고 세 EP 공유 계산에 **30초 공용 캐시**(`ApmWidgetService`, 권한 무관 값만)가 붙었다. 창은 서버가 정해 `windowMinutes:60`으로 내려 준다 — FE가 "최근 60분"을 하드코딩하면 창을 바꾸는 순간 거짓이 된다. QA 2-1~2-7 PASS(`limit` 클램프만 데이터가 없어 미관측).

### 22-2. AI 툴 8 — `moveseye-ai …/tool/apm/`

전부 READ·NEUTRAL, BE 무수정(기존 읽기 EP의 프록시). 정본 `features/apm/core/contract_apm-p3-ai.md`. 핵심 규약: **시간은 ms 에폭**(다른 BE 축은 초 — `ApmTimeWindow` 한 곳에서만 변환, 상한 90d/30d/400d 밖·뒤집힌 창은 BE에 가기 전에 자른다) · **서비스는 이름으로 들어온다**(`overview?q=`로 해소, 정확 일치 우선, 🔴 후보가 둘 이상이면 고르지 않고 **후보를 돌려준다** — 첫 것을 잡으면 다른 환경을 진단한다) · `null`은 0이 아니다(`num()`이 키를 남기고 값만 null) · 근사값을 근사라고 말하게 한다(`note`) · **`notes[]`(이번 응답에만) vs `note`(고정 규약)** 두 벌(QA A1 — `out.put("note")`가 절단 안내를 덮어 모델이 9개를 다 봤다고 믿던 것). 코덱스 🟡12가 잡은 반올림: 모든 소수를 한 자리로 반올림해 `errorRatePct 0.04→0.0`·`apdex 0.99→1.0`으로 **작은 이상이 정상**이 됐다 → 단위별 자릿수(`scaleFor`) + 비영 값은 유효숫자 2자리로 물러남 + `BigDecimal`로 지수 표기 차단(QA A8, `1.9E-5`를 모델이 `1.9`로 오독). 🟡13 지정 `deploymentId`의 서비스 소속 검증, 🟡14 STALE/UNKNOWN을 수집 문제로 **단정하지 않기**(앱·호스트 중단도 같은 그림).

**403 문구는 MCP 통로 전용이다(QA A5).** 채팅·dev 툴 통로는 `AuthPreflight.requireAdmin`(ADMIN∪SUPER_ADMIN)이 툴 실행 **전에** 막는데, BE `DmovePermissionChecker.isAdministrator`가 APM 권한 검사를 **통째로 우회시키는 집합이 정확히 같다**. 즉 채팅으로 툴을 실행할 수 있는 사람은 APM 403을 받을 수 없고, 받을 사람은 툴 실행에 이르지 못한다. `apm.forbidden.view/edit` 문구가 실제로 나가는 통로는 `McpAuthFilter`(`user.mcp_permission` 축)뿐이다 — 문구는 유지했다(MCP 클라이언트의 일반 사용자가 관리자에게 **어느 화면의 어느 스위치**를 요청해야 하는지 그대로 말해 준다). QA 6-1~6-3: 세 툴의 숫자가 BE와 **전건 일치**. 실 LLM 대화는 미검증. 🔴 drift: AI `docs/screens.json`의 APM 화면은 **11개·서비스 상세 탭 10개**로 P2 시점 그대로다 — FE는 P3에서 `synthetics` 탭(11번째)과 SLO·합성 감시·메시징·리포트 화면을 열었는데 카탈로그에 없다(`ScreenToolReferenceTest`는 실제 FE 파일을 읽지 않아 잡지 못한다). SLO·합성·메시징·배치·리포트를 읽는 **AI 툴도 없다**(툴 8종은 전부 P1·P2 EP).

### 22-3. 설치 가이드 `references[]` — 인용에서 파생

설치 가이드의 명령·환경변수·경고는 OTel·Microsoft·systemd·PostgreSQL 공식 문서를 우리 환경에 옮긴 것이라 그 근거를 응답에 실었다(`ApmDocRef` enum 31건, 계약 `features/apm/core/contract_apm-read-api.md` §8.8). 스텝·env·notice의 `refs[]`가 `references[].id`를 가리키고, `references[]`는 enum 전체가 아니라 **그 조합(os×stack)이 실제로 인용한 것**만 `ApmDocRef.resolve`가 파생시킨다 — 끊긴 참조도 고아 항목도 구조적으로 안 생기고 전 조합 테스트가 양방향을 못박는다. 순서는 enum 선언 순(Collector → SDK → 스택 → OS/DB). 가산 필드라 기존 FE는 무수정으로 돈다 — FE 설치 탭의 출처 열은 마지막 커밋엔 없고 작업 트리에서 진행 중(§23-4).

### 22-4. 권한 축 — P3에서 늘어난 것

P3 EP는 §17의 두 축을 그대로 탄다: view +18(SLO 3·위젯 3·합성 7·메시징 2·배치 3), edit +8(SLO 쓰기 3·합성 쓰기 5). `GET /apm/synthetics/proxies`·`error-catalog`는 관리 폼의 선택지지만 비밀값이 없고 조회 사용자도 "어느 지역에서 도는가"를 이해하는 데 필요해 **view**다. 합성 상세엔 비밀번호가 없다(`httpPasswordSet: boolean`만, ZM-100 규약). **예외는 리포트** — 관리자 축(§21-3). QA 7-1~7-5: USER view=false 27건 전부 403 · view=true 조회 15건 200/쓰기 8건 403/리포트 4건 403 · view+edit 23건 200/리포트 여전히 403. 🔴 QA 관찰 4: `user.zabbix_role`에는 Zabbix roleid가 아니라 **우리 `role` 테이블 id**가 들어간다 — `refId`를 넣으면 권한이 빈 배열이 되어 "view=true인데 403"으로 보인다(QA에서 실제로 오진할 뻔).

---

## 23. P3 QA가 잡은 것들 (`features/apm/core/e2e_apm-p3-qa.md`, 결함 23 · 관찰 4)

실 Zabbix(`dmove.co.kr`)·BE `:3001`(dev DB 5433)·헤드리스 Chrome, 스크린샷 0장(캔버스는 픽셀 샘플링). PASS 74 / FAIL 3. BE D1~D9·M-1~M-6 전건 반영(`0ef3a2d`, +77 테스트 → 2,969 green), AI A1~A8 반영(`84ad916`). **런타임 재검증은 안 했다.**

### 23-1. 가장 중요한 발견 셋

1. **SLO 번 알람이 실 Zabbix까지 완주한다.** 같은 push 회차(17:22:07)에 `2.553485`(위반 — 발화한 FAST 줄의 1h 값과 소수 6자리까지 일치) · `0`(쟀고 정상) · `-1`(측정 불가)이 각각의 아이템에 들어갔고, 트리거는 양수에서만 PROBLEM이 됐다(§18-5의 세 값 규약을 한 회차에서 동시에 봤다). 다만 **끌 때** 열린 Problem이 남았다(D3 → §18-5).
2. **쉼표 든 한글 이름의 아이템 키를 BE가 읽는다.** Zabbix가 `web.test.time["qa-apm-syn-한글, 쉼표 시나리오",단계 하나 RAW,resp]`처럼 키를 따옴표로 감쌌는데도 `ApmSyntheticItemCatalog`의 파서가 맞혔다 — "빈 차트"가 아니다(§19-6).
3. **필수 파라미터 누락이 HTTP 500(D1).** `GlobalExceptionHandler`에 `MissingServletRequestParameterException` 핸들러가 없어 catch-all로 빠졌고, 응답이 `{statusCode,message}`라 FE가 읽지도 분기하지도 못했다. `ApmReportController`는 그 상황을 방어하려고 null 가드까지 써 놓고도 `@RequestParam(required=true)`가 앞에서 던져 **죽은 코드**였다. P3가 이 계약에서 `required` 쿼리 파라미터를 처음 쓴 자리라 지금 드러났다. 반영: 전역 핸들러 신설(200 + `INVALID_DATA`) **+** 세 EP는 `required=false`로 내려 서비스 계층이 계약 코드(`APM_MESSAGING_DESTINATION_REQUIRED`·`APM_JOB_NOT_FOUND`·`APM_REPORT_PERIOD_INVALID`)를 내게 했다(전역 핸들러는 EP를 몰라 `INVALID_DATA`밖에 말할 수 없다).

### 23-2. 나머지 한 줄씩

| # | 무엇 | 반영 |
|---|---|---|
| D2 | 리포트 `createdAt` KST+Z | §21-3. 두 계열 함께 UTC |
| D4 | 가용성 합계 56.63% | §21-2. 요청 가중 + `availabilityUnweightedServices` |
| D5 | 폐기 통계 표 React 중복 키 — `SIGNAL_NOT_SUPPORTED`가 LOG·METRIC 두 줄인데 FE `rowKey`가 `(reason, metricName)` | 🔴 BE 무수정(세 축을 이미 다 보낸다). FE `TApmDropRow.signal` + rowKey + **시그널 컬럼 노출**(키만 고치면 "글자까지 같은 두 줄"이 남는다). FE 작업 트리에 미커밋 상태로 진행 중 |
| D6 | 거절 문구에 `%s` 노출 — `"…" + "…".formatted(x)`가 마지막 리터럴에만 걸린다. `formatted`는 남는 인자를 조용히 버려 컴파일·테스트가 못 잡는다 | 괄호로 전체를 묶음. 레포 전체 정규식으로 같은 패턴 없음 확인. 테스트가 `%s` 부재만이 아니라 **인자가 박혔는지**까지 본다 |
| D7 | 리포트 403이 영어 `Access Denied`·`errorCode` 없음 | §21-3. `ReportAdminAccess`(6개 EP만) |
| D8 | `burnAlertEnabled:false`인데 임계를 보내면 조용히 버려짐 — 임계는 `apm_slo`가 아니라 **`apm_alert_rule` 행**에 살아 저장할 곳이 없다 | 동작 유지·계약 명시. 값을 저장할 자리를 만들면 "꺼진 알람의 임계"라는 두 번째 진실이 생긴다. 꺼진 채 범위 밖 값은 여전히 400. FE는 스위치를 끄면 임계 입력을 숨긴다(이미 그렇다) |
| D9 | `httpStepId` 없는 단계를 BE가 안 막음 | §19-3. 이름으로 되붙이기 → `isNew` → 400 |
| M-1 | `status` 필터 0건이 "창에 없다"는 404 — FE 안내("창을 넓혀 보라")를 따라도 **영원히 안 나온다** | 빈 결과를 404로 말하기 전에 `existsInWindow`(필터 없는 `limit 1`) 한 번 더 → 잡이 있으면 **200 + 빈 배열** |
| M-2 | `/apm/jobs` 한 줄이 서비스 여럿을 합침 | §20-3. `(service_id, job_name)` |
| M-3 | 간트 절단이 이름순 앞 잡이 예산을 다 먹는 방식 — `qa-bulk` 2,001건 주입에 다른 잡 4개가 `lanes`에서 **전멸**, 신호는 `truncated:true` 하나 | 레인당 최근 200 → 전체 2,000 2단. `lanes[].runs`·`failures`는 절단 전 전체 수라 화면이 "50개 중 20개"를 말할 수 있다. ⚠️ PG 함정: `count(*) filter (...)`를 괄호로 감싸면 `OVER`가 못 붙는다(실측) |
| M-4 | `apm_job_run` FK CASCADE | §20-3. V56 |
| M-5 | `from >= to`를 조용히 "최근 1시간"으로 접음 | 동작 유지. 화면이 자동으로 붙이는 값이라 사용자가 못 고치고 400이면 대시보드가 통째로 에러 카드. 응답 `fromMs/toMs`가 실제 창을 반향하므로 축 라벨을 응답 값으로 |
| M-6 | 구 semconv 폴백 하나가 죽은 분기 | 주석 정정만(§20-1 — 둘 다 지우지 말 것) |
| A1~A8 | AI 툴 절단 안내 소실·`summary`/`total` 모집단 불일치·403 문구 중복·이름 해소가 창 검증보다 먼저(잘못된 창에도 BE 1콜)·limit 오류→클램프·`dropsWindow` enum·지수 표기·A5 통로 | §22-2 |

### 23-3. 관찰 — 결함은 아니지만 오진을 만든다

① 샘플 앱은 메시징·배치 스팬을 하나도 안 낸다(§20-4) ② 메시징·배치 집계는 `apm_rollup`이 아니라 `apm_trace_rollup`이다 ③ **같은 사용자의 다른 `x-visitor-id` 로그인이 기존 세션을 무효화한다** — 브라우저를 열어 둔 채 curl 스윕을 돌리면 전건 401(제품 의도로 보이나 QA 자동화에서 유령 실패를 만든다) ④ `user.zabbix_role` = 우리 `role` id(§22-4). ⚠️ 재현 함정: AI `application-dev.yml`이 `server.port: 3100`을 하드코딩해 `PORT=3101`만 주면 안 뜬다 → `SERVER_PORT`도 함께(반영 완료).

### 23-4. 🔴 FE에 남은 것 — 계약 §9.2 여덟 가지의 현재 상태

기준은 **FE 마지막 커밋 `336bc1f`**다. 그 커밋에는 여덟 가지 중 ⑥(SLO 스위치를 끄면 임계 입력을 `Show when={burnAlertEnabled}`로 아예 숨김)만 들어 있고, 나머지는 **작업 트리에 미커밋으로 반영이 진행 중**이다(이 문서를 쓰는 동안 별도 세션이 고치고 있었다 — 파일이 실시간으로 바뀌었다). 커밋 전에 아래 표로 대조할 것:

| # | 할 일 | `336bc1f` | 작업 트리(2026-09-07 저녁, 미커밋) |
|---|---|---|---|
| ① | 폐기 통계 rowKey에 `signal` + 시그널 컬럼 | ❌ | 🟡 `apmDropRowKey`에 `signal` 추가·`APM_DROP_SIGNALS`·상태 탭 컬럼(`apm.collectors.drop_signal.*`) |
| ② | 배치 표 rowKey `(serviceUid, jobName)` + `/runs`에 `service` | ❌ `rowKey="jobName"` | 🟡 `rowKey={apmJobRowKey}`, `useApmMessaging`에 `service` 키 |
| ③ | `/runs` 404("창을 넓혀 보라")와 빈 배열("필터를 풀어 보라") 분기 | ❌ | 🟡 `apm.jobs.runs_filter_empty` 분기 |
| ④ | 합성 Drawer 단계 추가 시 `isNew:true` | ❌ | 🟡 `apmSyntheticDisplay.ts`가 `httpStepId` 없는 새 단계에만 `isNew:true`, Drawer 숨은 입력 |
| ⑤ | 간트 `runs > bars.length` 레인 배지 | ❌ | 🟡 `apm.jobs.lane_truncated`("{{runs}}개 중 {{shown}}개 표시") |
| ⑥ | SLO 알람 스위치 끄면 임계 입력 비활성화 | ✅ | — |
| ⑦ | 리포트 각주 `availabilityUnweightedServices` | ❌ | 🟡 `ApmReportNotes.tsx` + `types/report-management.ts` |
| ⑧ | 표본 JSON 동기화 | ❌ | 🟡 `apmReportContractSample.ts`·`apmContractSample.ts` 변경 중 |
| + | 설치 가이드 `references[]`·`refs[]` 렌더(§22-3) | ❌ | 🟡 `ApmCollectorInstallTab`에 `refsOf`·출처 열 |

🔴 같은 작업 트리에 **다른 세션의 호스트 모니터링 증분 차트 작업**(`hooks/chart/*`·`host-monitoring.api.ts` 등)이 섞여 있다. 커밋할 때 `git add -A` 금지 — 파일을 골라 스테이징할 것.

> ✅ 후기(2026-09-14): 위 여덟 가지와 `references[]` 렌더는 FE `20338f7`·`fd87470`으로 커밋됐다(§A 18행). 이 표는 당시 기록으로 남긴다.

---

## 24. 역할 교대 — "이번엔 코덱스가 짓고 Claude가 검사했다" (P4, 2026-09-08~14)

P1~P3까지는 **Claude가 짓고 코덱스가 검수**했다(`COLLAB.md` §8). P4는 사용자 지시 한 줄("구현 코덱스 최상위 모델 시켜")로 **반대**가 됐다 — 코덱스가 구현, Claude가 오케스트레이션·검수·병합. 같은 코드를 두 눈이 보는 구조는 같지만, 검수자가 바뀌면 잡히는 결함의 종류가 달라진다는 것이 이 절의 이야기다.

### 24-1. 어떻게 돌렸나 — 격리 worktree + `codex exec`

| 회차 | 작업 디렉터리 | 산출 |
|---|---|---|
| BE 구현 | git worktree `moveseye-be-spring-p4` / 브랜치 `p4-rum` / 기준 master `5547cd0` | `scratchpad/codex-p4/out_be.md` — 신규 43·수정 29, 3,051 green |
| BE 검수 반영 | 〃 | `out_fix.md` — R1~R25·B1~B5 반영, **3,072** green(303 suites) |
| FE 구현 | worktree `moveseyee_fe-p4` / `p4-rum-fe` / 기준 `5b0d3ce` | `out_fe.md` — 신규 31·수정 24, 관련 9 스위트 248/248 |
| FE 검수 반영 | 〃 | **진행 중**(`out_fe_fix.md`가 아직 0바이트 — 이 문서를 쓰는 동안 코덱스가 그 트리를 고치고 있다) |

호출은 `codex exec`에 모델 `gpt-6-astra`·reasoning `xhigh`, `--add-dir C:\solutions\_workspace`(계약 정본 `features/apm/core/contract_apm-p4.md`만 worktree 밖 쓰기 예외), `--approve-for-me`. 로그 헤더가 그것을 증언한다 — `sandbox: workspace-write [workdir, …, C:\solutions\_workspace]`. **worktree를 쓴 이유**는 §23-4의 함정 그대로다: 본 트리에는 다른 세션의 미커밋 파일이 섞여 있어, 코덱스가 `git add -A`를 하거나 내가 원복하다 남의 파일을 날릴 수 있다. 격리 트리는 "이 안의 변경은 전부 P4"를 보장한다.

**지시문의 뼈대**(`err_be.log` 머리에 원문이 남아 있다) — 이 다섯 절이 코덱스에게 준 전부다. 코덱스 지시문을 다시 쓸 일이 있으면 이 순서를 지킬 것:

| 절 | 무엇을 적었나 | 왜 그 자리인가 |
|---|---|---|
| 역할 한 줄 | "당신은 구현 담당, Claude가 오케스트레이션·검수·병합. 이 디렉터리 안에서만 쓰기. 커밋·푸시 금지" | 첫 줄에 쓰기 범위가 없으면 코덱스가 계약 정본을 worktree에 만들고(실제로 그랬다 — `out_be.md` "계약은 worktree에 작성했습니다") 옮기는 일이 남는다 |
| 먼저 읽어라(정본) | `CLAUDE.md` 규약·최근 규약 실례 폴더·설계 §15·WBS WS-5·계약 정본 스타일 2종·실측 함정(`r1_*`)·마이그레이션 최신 번호(V56→V57)·예약된 `KIND_RUM` | "규약을 지켜라"가 아니라 **규약이 적힌 파일과 그것을 지킨 코드**를 가리킨다. 코덱스는 예시가 있으면 따라 쓰고 없으면 자기 톤으로 쓴다(R19가 그 증거 — 예시를 못 준 `rum/`만 압축형이었다) |
| 범위 | WBS 번호 그대로 5.1a(보안 9항목)·5.1b(파서·V57·연결·조회·스니펫)·5.3b(K8s) | 항목마다 "또는 …이면 …(근거 주석)"으로 **선택지를 열어 뒀다** — 토큰 표 재사용 여부·HLL 없을 때 distinct 근사 등. 닫힌 지시는 설계의 오류까지 그대로 구현시킨다 |
| 규칙 | 라이선스 게이트(`MACHINE_CLIENT_CLASSES`)·테스트 3층(단위·MVC 실제 상태·IT, 도커 없으면 skip 명시)·`:test` green(직전 3,051)·clean/bootRun/`--stop` 금지·계약 신설 | "테스트를 써라"가 아니라 **무엇을 고정할 테스트인지**(origin 우회·토큰 오용·429·PII·vitals 분류) 목록 — 그래도 변이 B 다섯이 살아남았다. 다음엔 "변이 실험으로 검출력을 증명하라"를 규칙에 넣는다 |
| 마지막 출력 | 파일 목록·EP 표(권한·HTTP 상태)·설계와 다르게 간 결정과 근거·테스트 결과·🔴 불안한 지점(검수 우선순위) | 검수의 입력이 된다. §7 "불안한 지점" 4건은 코덱스 자진 신고였고 검수가 그 판정 자체를 다시 채점했다(검수 §4 — "정확하나 과소평가"·"불충분") |

**실패 사례 — 셸이 안 뜬다.** Windows에서 코덱스의 "unified exec" 프로세스 생성이 세 번 거부됐다: BE 1차에 `CreateProcessWithLogonW failed: 1326`(로그온 실패) 2회, 검수 반영 회차에 `ShellExecuteExW failed to launch setup helper: 1223`(사용자가 취소한 승격 프롬프트) 1회(`err_fix.log:61`). 세 번 다 **세션이 죽지 않았다** — 코덱스는 다른 도구 호출(웹 검색·파일 읽기·다음 명령)로 이어 가 결과 파일까지 냈다. 교훈은 하나: `err_*.log`의 ERROR 줄만 보고 "실패"로 단정하지 말 것. 판정은 `out_*.md`와 워킹트리 diff로 한다(그래서 검수 첫 줄이 늘 `git status`·`:test` 재현이다).

### 24-2. 검수가 잡은 것 — 왜 "3,051 green"이 사실을 감췄나

검수 산출은 둘이다: `features/apm/core/review_apm-p4-be_claude.md`(🔴4 🟡16 🟢5 + 변이 실험 A 4건·B 5건) · `review_apm-p4-fe_claude.md`(HIGH 2 · MEDIUM 4 · LOW 8 + 변이 3건). 병합 전 필수로 올린 것과 그 이유:

| # | 잡은 것 | 왜 초록이 못 잡았나 |
|---|---|---|
| BE R2 | **K8s OOM이 절대 켜지지 않는다.** 관측기가 `k8s.container.status.last_terminated_reason`을 **메트릭 이름**으로 찾는데, contrib `k8sclusterreceiver`에서 그것은 **기본 비활성 리소스 속성**이고 생성 yaml도 켜지 않았다 | `ApmKubernetesContextTest`·`ApmKubernetesMetricObserverIT`가 **그 지어낸 이름을 스스로 먹여** 통과했다. 공식 문서(`documentation.md`)를 대조해야만 보이는 종류 — "실 클러스터가 없어 미검증"으로 미룰 항목이 아니었다 |
| BE R5 | 재시작 속성 이름이 `container.restart_count` — semconv 정본은 **`k8s.container.restart_count`** | 같은 이유. 이름을 잘못 알면 테스트도 그 이름으로 쓴다 |
| BE R1 | `kubernetes.observe()`가 `ingestor.ingest()`(이미 커밋) **뒤**, `receiptService.record()` **앞**에 무방비로 놓였다 → 예외 하나가 503 → exporter 재전송 → **영수증이 없어 이중 적재** | 같은 파일 주석이 경고한 함정을 반대 방향으로 밟았다. 예외 주입 테스트가 없었다 |
| BE R4 | preflight가 미존재 토큰엔 401, origin 불일치엔 403 → `OPTIONS ?tokenId=1..N`을 훑으면 **살아 있는 토큰이 열거**된다 | `ApmOtlpController:399`가 같은 레포에서 못 박은 원칙("사유를 응답에 적지 않는다")인데 계약에도 테스트에도 없었다. **변이로 401→403을 바꿔도 깨지는 테스트가 0**이었다 = 비용 0으로 고칠 수 있고, 동시에 아무도 그 동작을 지키고 있지 않았다는 뜻 |
| FE H1 | `ApmRumTable`이 Zabbix 시대의 `useTableColumns`를 경유해 **모든 숫자 열이 문자열 정렬**(`[9,1000,20,3,150] → [1000,150,20,3,9]`) | jsdom은 정렬·스타일 상호작용을 재현하지 않아 248개가 다 통과했다. APM 표 15여 개 중 이 훅을 쓴 것은 이 파일 하나 |

변이 실험 B(BE)의 다섯 — `JwtAuthFilter`의 RUM 스킵 한 줄 제거·preflight 401 복원·yaml 파이프라인에서 `k8sattributes` 제거·`Vary` 제거·발급 응답 `no-store` 제거 — 가 **전부 살아남았다**. 보안상 가장 민감한 줄들에 테스트가 0개였다는 뜻이고, 코덱스 반영 후 B1~B5 전부 검출되는 것을 다시 변이로 확인했다(`mutation-b-review/`·`mutation-b4-isolated/`).

**교훈**: 초록은 "코드가 테스트와 일치한다"이지 "코드가 세상과 일치한다"가 아니다. 외부 계약(contrib 메트릭 이름·semconv·Zabbix 필드)을 읽는 코드는 **공식 문서 대조**가 검수의 첫 항목이어야 하고, 테스트 검출력은 변이로 잰다. 그리고 검수도 틀린다 — R2 지시문은 두 키를 `k8sattributes.extract.metadata`에 넣으라고 했는데 코덱스가 contrib 0.159.0 `config.go`로 **`Validate()`가 그것을 거부한다**를 증명하고 `k8s_cluster.resource_attributes`에 켰다(계약 §6 "R2 설정 위치 정정"). 검수 중 실수도 하나 공개돼 있다 — `ApmInstance.java`를 `git checkout --`으로 한 번 날리고 캡처 diff로 바이트 동일 복원(그 파일만 CRLF).

병합: 코덱스 반영분 `8ec9e1c` → master **`6af7c46`**(2026-09-08). FE는 검수 필수 2건(H1+H2·M3) 반영이 worktree에서 진행 중이라 **아직 master에 없다**(FE master HEAD `5b0d3ce`). 🔴 이 문서의 FE 서술은 **계약 기준**이며 worktree 파일은 실시간으로 바뀐다.

---

## 25. RUM — 브라우저는 믿을 수 없는 손님 (P4, `premium/apm/rum/`, 설계 §15)

Collector는 고객 망 **안**에 있고 토큰은 yaml 파일에 있다. RUM은 다르다 — 스니펫이 **고객의 고객 브라우저**에서 돌고, 토큰은 JS 번들에 박혀 **누구나 볼 수 있다**. 그래서 이 패키지의 절반은 수신이 아니라 방어다. 정본은 `features/apm/core/contract_apm-p4.md` §1~§2, 검수 `review_apm-p4-be_claude.md` §2.

### 25-1. 공개 토큰 — 같은 표, 다른 종류

`apm_receive_token`을 재사용하되 `kind=RUM`·`scopes=["rum"]`을 서비스가 **고정**한다(FE 입력으로 안 받는다). §2 #3에서 "P4 대비"로 넣어 둔 scope 검사가 여기서 값을 했다 — RUM 토큰은 `/apm/otlp/**`에 못 들어가고, Collector 토큰은 `/apm/rum/v1/**`에 못 들어간다(`RumTokenService.usable`이 kind·scope·회수를 다 본다). V57이 붙인 것은 `allowed_origins text[]`·`rum_rps`(20, 1~1000)·`rum_body_bytes`(256KiB, 1KiB~8MiB)·`rum_daily_limit`(10만, ~1천만) — DB CHECK로도 걸어 뒀다. 상한 셋은 **발급 후 불변**(바꾸려면 재발급), origin만 `PUT /apm/rum/origins`로 교체. 원문은 발급 응답 `plainToken` 한 번뿐이고 발급·스니펫 응답은 `Cache-Control: no-store`(변이 B5가 살아남았던 그 헤더).

### 25-2. Origin — 정확 매칭, 그리고 "빈 목록은 중지"

`RumOriginPolicy.valid`는 `http(s)://host[:port]`만 통과시킨다 — userinfo·path·query·fragment·`*`·`\` 전부 거절, 최대 32개, `distinct`. 비교는 `Arrays.asList(allowed).contains(origin)` **문자열 정확 매칭**이다. 그래서 `https://app.example.com`과 `…:443`은 다른 origin이고 대소문자도 안 접는다 — "서버가 친절하게 동치화"하면 그 규칙 자체가 우회면이 된다. **빈 목록은 오류가 아니라 의도적 수신 중지**(FE가 `수신 중지` 태그로 보여 준다). ⚠️ Origin은 **비브라우저 클라이언트가 위조할 수 있다** — 그래서 RUM 데이터는 서버 RED·SLO·서비스 맵 집계에 **절대 섞이지 않는다**(§26-4).

### 25-3. 전용 체인 · `JwtAuthFilter` 한 줄 · A1

`RumSecurityConfiguration`이 `@Order(1)`로 `/apm/rum/v1/traces`·`/metrics` 두 경로만 잡는 `SecurityFilterChain`을 **premium 안에** 둔다(표준 모듈이 premium을 import하면 `LicenseArchitectureTest` A1이 막는다). 이 체인은 `permitAll`이지만 OPTIONS를 **필터가 직접** `controller.preflight()`로 넘긴다 — Spring MVC의 기본 CORS 처리가 200을 먼저 돌려주면 우리의 403·429가 사라지기 때문이다. `JwtAuthFilter`는 `@Component`라 모든 체인에 자동 등록되므로 한 줄이 필요했다:

```java
if (request.getServletPath().startsWith("/apm/rum/v1/")) return null;   // JwtAuthFilter:82
```

없으면 RUM Bearer를 JWT로 오인해 Redis·Zabbix까지 간다. **보안상 가장 민감한 한 줄에 테스트가 0개**였던 것이 변이 B1이고, 지금은 `JwtAuthFilterRumTest`가 RUM 경로 2개와 인접 경로 4개의 인증 유지를 함께 고정한다. 라이선스는 `@LicenseExempt` + 세 진입점 모두 `licenseProvider.current().allows(APM)` 직접 호출 — `MACHINE_CLIENT_CLASSES`의 네 번째 항목이다("MACHINE"은 실행 환경이 아니라 "세션 화면이 아닌 exporter의 실제 HTTP 계약"이라는 뜻, 계약 §1).

### 25-4. preflight — 거부 사유를 말하지 않는다 (R4)

브라우저 OPTIONS는 **Authorization 값을 싣지 않는다**. 그래서 비밀이 아닌 `tokenId`를 쿼리로 보내고 그 토큰의 allowlist를 읽는다. 처음엔 "토큰 없음 401 / origin 불일치 403"이었다 — 그 차이만으로 살아 있는 id를 열거할 수 있다. 지금 `RumTokenService.preflight`는 미존재·회수·종류/scope 불일치·origin 불일치를 **전부 같은 403·같은 본문·CORS 허용 헤더 없음**으로 접고, 401은 POST의 Bearer 검증(`authenticate`)만 낸다. POST는 Bearer 해시로 찾은 토큰 id와 쿼리 `tokenId`의 **일치를 다시 검사**한다(토큰 원문을 URL에 넣는 길은 없다). 허용 origin에는 401/429/503에도 CORS를 달아 SDK가 상태를 읽게 한다.

### 25-5. 세 가지 상한 — 초·일·바이트, 그리고 preflight 큐

`RumRateLimiter`는 단일 노드 인메모리다. ① **토큰별 1초 슬라이딩 창**(초 경계에서 두 배가 안 된다) → 429 `Retry-After: 1`. ② **UTC 일 예산** — 저장 성공이 아니라 **파싱 수신량** 기준이라 재전송·중복도 차감되고 503에서 환급하지 않는다(재시작이면 초기화 — 다중 노드가 필요하면 Redis, 계약 §7-3). ③ **preflight 전역 100 rps 고정 큐** — `tokenId`별 map을 만들면 공격자가 임의 id마다 상태를 할당시킬 수 있어 큐 하나만 둔다(R12). 토큰 창이 10,000개를 넘으면 새 토큰은 503(`RUM_UNAVAILABLE`, R23). 본문은 `Content-Length > wireLimit`면 한 바이트도 안 읽고 413, gzip 회선 `min(bodyBytes, 2MiB)`, 해제 후 `bodyBytes` — 그리고 🔴 **Content-Type/Encoding 검사가 `getParameter("tokenId")`보다 먼저**다(R11): `x-www-form-urlencoded`로 오면 Tomcat이 폼 파싱을 하며 토큰 상한과 무관하게 2MB까지 버퍼링한 뒤에야 415가 나가기 때문이다. 배치 상한 4096은 gauge/histogram이 없는 metric 항목에도 센다(R13).

### 25-6. PII — 저장 직전의 허용목록 (`RumSanitizer`)

| 무엇 | 규칙 | 왜 그 모양인가 |
|---|---|---|
| URL | 절대 URL이면 path만 · percent 디코딩 **최대 3회 후** 판정 · `?#` 이후 절단 · `..` 정규화 · 세그먼트가 숫자·8자+hex·UUID·24자+ base64·`eyJ…`(JWT)·`@`·`%`·`;`·80자 초과·제어문자면 `{id}` · 512자 넘으면 `/{overflow}` | 디코딩을 **먼저** 하는 이유는 `%2F`·이중 인코딩으로 ID 정규화를 우회 못 하게. `{id}`는 PII 제거이자 **페이지 그룹 키**(`groupId = sha256(tokenId + path)`) |
| `enduser.id`·`session.id` | `sha256(tokenId + "\n" + value)` | 토큰별 salt라 두 사이트의 같은 사용자를 이어 붙일 수 없다. session.id는 distinct 계수에만 쓴다 |
| IP | 저장 안 함. 국가는 `CF-IPCountry` → `Accept-Language` 지역 코드, ISO 아니면 `null` | **GeoIP가 아니라 힌트**다(계약 §7-7). FE 라벨이 "국가 힌트"인 이유 |
| UA | family(브라우저·OS)만 | 원문은 지문이 된다 |
| JS 오류 | 메시지 첫 줄 **폐기**. 스택은 `at …` 또는 Firefox 형태 `fn@url:line(:col)`에 맞는 줄만, 이메일 `[redacted]`, UTF-8 4096(DB `CHECK(octet_length ≤ 4096)`) | 처음엔 `contains("@")`로 Firefox 프레임을 살렸는데 그러면 `Error: invalid mail a@b.com`이 저장됐다(R9) — 지금은 **형태**로 판정 |
| 스팬 속성 | `rum.browser`·`url.path`·해시 `enduser.id`·HTTP method/status·유효 `traceparent`/`tracestate`만 | 나머지는 `RUM_PII_REMOVED`로 센다(거부 스팬 수가 아니라 **제거 속성 수**) |

500은 없다 — JSON/구조 400, 타입/인코딩 415, 내부 503(`catch(Exception)`). 🟢 잔여: 잘못된 UTF-8은 `CharConversionException`이라 400이 아닌 503으로 샌다.

### 25-7. 한 요청이 지나가는 길 — RUM판 (§2와 나란히 읽기)

브라우저가 `POST /apm/rum/v1/metrics?tokenId=7`(Web Vitals gauge 5개)을 보냈다고 하자. §2의 Collector 경로와 **입구부터 다르다**.

| # | 어디서 | 무엇을 | §2와 다른 점 |
|---|---|---|---|
| 0 | 브라우저 | 교차 출처라 먼저 `OPTIONS` preflight — `Origin`·`Access-Control-Request-Headers: authorization,content-type`만, **Authorization 값 없음** | Collector는 preflight가 없다. 그래서 `tokenId`가 쿼리에 있다 |
| 1 | `RumSecurityConfiguration` 필터 | OPTIONS면 MVC로 안 보내고 `controller.preflight()` 직접 호출 | MVC 기본 CORS가 200을 먼저 주는 것을 막는다 |
| 2 | `preflight()` | `Origin` 헤더가 정확히 하나·형식 유효 → 아니면 **403**. 전역 100 rps 큐. `tokens.preflight(tokenId)` — 미존재·회수·종류 불일치·origin 불일치 **전부 같은 403**. 라이선스 없으면 403. 통과면 **204** + `Allow-Origin: <그 origin>`·`Allow-Methods: POST`·`Max-Age: 60`·`Vary` | Collector는 401/403을 갈라 준다(exporter가 로그에 적을 뿐 사람이 안 본다). 브라우저 쪽은 **누구나 볼 수 있어** 사유를 접는다 |
| 3 | `POST` 진입 | `Origin` 재검사 → `Content-Type: application/json`·`Content-Encoding` gzip/identity 검사(**`getParameter` 전**) → `Content-Length > wireLimit`면 안 읽고 413 | §2 #1·#2와 같은 정신, 순서만 더 엄격(R11) |
| 4 | `tokens.authenticate` | `Bearer` 원문 sha256 → 토큰 → `usable`(kind RUM·scope rum·미회수) → 쿼리 `tokenId`와 **일치** 검사. 실패 **401**(허용 origin이면 CORS 헤더 동반) | 토큰 원문이 URL에 오는 길은 없다 |
| 5 | `RumRateLimiter.request` | 토큰별 1초 창 → 429 `Retry-After: 1` | §2엔 없다(Collector는 큐가 있어 자기 속도를 안다) |
| 6 | 본문 읽기 | gzip 회선 `min(bodyBytes, 2MiB)`·해제 후 `bodyBytes` 초과 즉시 413. JSON 파싱 실패 400 | §2 #2·#6 |
| 7 | `RumParser` | 배치 4096 상한(초과 413) → 관측 목록(`web_vitals.*` gauge = 관측 1, CUMULATIVE 폐기, 허용목록 밖 `dropped`) | §2 #8·#11이 한 클래스 |
| 8 | `limiter.observations` | 파싱 수신량으로 **일 예산 차감**(초과 429 `Retry-After: 자정까지 초`) | 저장 **전**이라 재전송도 먹는다 — 계약이 인정한 설계 |
| 9 | `RumSanitizer` | path 정규화·해시·국가·UA family·스택 필터 — 원문은 여기서 끝난다 | §2 #12(차원 정규화)의 PII판 |
| 10 | `RumStore.prepare` → `store` | 파티션 DDL(트랜잭션 밖) → 한 트랜잭션: 영수증 `ON CONFLICT` 0행이면 skip, 세션 distinct, 5분 표 UPSERT, timing·오류·스팬 | §2 #7(영수증 판정)·#14(UPSERT)·#16(영수증 기록)이 **한 트랜잭션** — 그래서 "저장됐는데 영수증이 없다"가 없다 |
| 11 | 응답 | `{}` 또는 `partialSuccess.rejectedDataPoints:"3"`(int64 **문자열**) + 200. 폐기는 `signal=RUM`으로 기록. DB 장애면 503 | §2 #16과 같은 "500 금지". `ApiResult` 봉투가 아니라 FE 2겹 언랩 금지 |

---

## 26. RUM 수집·조회 — 5분 표에 바로 쓴다

### 26-1. 파서 — 무엇을 관측으로 치나 (`RumParser`)

OTLP/JSON을 공용 `OtlpJson` 규약(enum 숫자·int64 문자열)으로 읽되, 비신뢰 입력이라 **공용 리더의 오류 로그에 원문이 실리지 않게** 여기서 먼저 검증한다. `documentLoad` 스팬 = **PV 1**(+ navigation timing: `fetchStart`…`loadEventEnd` 15키), `documentFetch`/`resourceFetch` = resource timing(정규화 path·`resource.start_time`·전송 바이트), CLIENT fetch/XHR 스팬 = `apm_rum_span` 보관용(이름은 호출한 페이지가 아니라 **요청 대상 path**, R15), `exception` 이벤트 = 오류 그룹. 메트릭은 `web_vitals.lcp/inp/cls/ttfb/fcp`(별칭 `web.vitals.*`·대문자) gauge 하나가 **관측 1**, DELTA histogram은 합산, **CUMULATIVE는 폐기**(같은 값이 매번 다시 더해진다 — 변이 A3). 시각은 과거 30일~미래 5분. `traceparent`가 있으면 OTLP traceId와 **같아야** 하고, 다르면 그 스팬만 `partialSuccess`로 버린다(R14 — 처음엔 배치 전체 400이라 정상 스팬까지 재시도 루프에 갇혔다).

### 26-2. 경계가 임계인 이유 — `RumVital`·V57 시드·`RumSchemaIT`

Web Vitals 임계는 Google 그대로다: LCP 2500/4000 · INP 200/500 · CLS 0.1/0.25 · TTFB 800/1800 · FCP 1800/3000(경계 포함 — `≤good`=good, `≤poor`=needs). 분포 good/needs/poor를 히스토그램에서 세려면 **그 임계가 버킷 경계여야** 보간 없이 정확하다. 그래서 `CanonicalBounds.rumMillis()`는 기존 초 격자 ×1000에 `{0,200,500,800,1800,2500,3000,4000,60000}`을 합친 21경계이고, CLS는 시간과 섞지 않는 별도 격자 `rumScore()`(11경계)다 — 초 격자에 0.1을 넣으면 "100ms"로 오해될 자리라서. V57이 `apm_hist_bounds`에 두 행(`rum_ms`·`rum_score`)을 시드하고, `RumSchemaIT`가 `RumVital.bounds()`와 **패밀리별로 배열 대조**한다 — §10에서 `CanonicalBounds` 주석이 경고한 "DB 사본 drift"를 정확히 막는 테스트다. 적재 시 bounds id는 family가 아니라 **경계 배열 정확 일치**로 찾는다(R10: `apm_hist_bounds` UNIQUE는 `(bounds, family)`라 훗날 rum 격자를 한 줄 더 넣으면 `queryForObject`가 모든 수신을 503으로 만들었을 것). good/needs/poor는 비율이 아니라 **관측 수 추정치**라 재버킷이면 소수가 나온다; `samples=0`이면 셋 다 `null`.

### 26-3. 저장 — 롤업 없이 수신 즉시 UPSERT (`RumStore`)

메트릭(§2 #14)은 1분 표에 넣고 배치가 접는데, RUM은 **수신 즉시 5분 표에 대입**한다 — 원본 표도 워터마크도 없다. 볼륨이 서버 메트릭보다 작고 "지금 이 페이지의 p75"가 유일한 질문이라서다. 한 트랜잭션 안에서: 영수증 `INSERT … ON CONFLICT DO NOTHING`이 **0행이면 전부 건너뛰고**(같은 배치 재전송), 세션 `(그룹·브라우저·OS·국가·버킷·session_hash)` distinct, 페이지 행 UPSERT(`pv+`, 히스토그램은 `apm_rum_add_counts`로 **원소별 합** — 길이가 다르면 자르지 않고 조회에서 `mixedBounds`로 드러낸다, min/max는 한쪽이 NULL이면 NULL로 병합 — 일부 표본의 극값으로 전체를 클램프하지 않으려고), timing 평균 합·오류 그룹·브라우저 스팬. 영수증이 같은 트랜잭션이라 **적재 실패 후 재전송은 중복 판정에 안 걸린다**(변이 A4·`concurrentDuplicateDeliveryCommitsExactlyOnce`가 실 PG로 고정). 파티션 DDL은 `prepare()`가 **트랜잭션 밖**에서 먼저 — 롤백된 DDL이 PG 파티션 캐시에 남는 문제. 페이지·차원 순으로 정렬해 잠가 역순 배치의 deadlock을 줄인다.

**세션의 정직성.** `sessions`는 "페이지+브라우저+OS+국가+5분 버킷 안 distinct"의 **합**이다. 한 사용자가 30분 머물면 6번 센다 — 전체 기간 unique를 내려면 세션 해시를 기간 내내 들고 있어야 하고 그것은 30일치 해시 표다. 대신 응답마다 `sessionMode:"DISTINCT_PER_PAGE_DIMENSION_5M_SUM"`을 실어 **과대계상임을 계약으로 말한다**(FE 각주 `session_note`). 세션 ID 없는 관측은 세션을 만들지 않는다.

### 26-4. 조회 — 절단은 최신을 남긴다 · 트레이스 상세에 Browser 행

`RumQueryService`: 창 최대 30일, `from` 5분 내림·`to` 5분 올림(응답의 `from/to`가 실제 창), 저장 행 **CAP 50,000**. 처음엔 `order by bucket asc limit 50001`이라 30일 창에서 **최근이 잘려 나갔다**(R6 — `truncated` 배지만으론 "최신 손실"인 줄 모른다). 지금은 `bucket desc`로 읽고 시계열은 오름차순으로 복원한다. 페이지 500·상세의 timing/오류/트레이스 각 50. `mixedBounds`는 bounds_id 불일치·배열 길이 불일치·패밀리 불일치 중 하나면 true → p75·분포 `null`, 표본 수는 유지. `+∞` 버킷에 걸린 p75는 `exceedsTopBound`(FE `≥` 접두). 상세의 `timings`는 이름별 **평균**(`timingMode:"AGGREGATE_AVERAGE"`) — 개별 로드의 워터폴이 아니라 구간이 겹칠 수 있다(FE가 "집계 평균"이라 적는 이유). `traceIds`는 **서버 스팬이 실제로 있는** 것만, 조회 창 ±5분 안에서(R7 — 처음엔 시간 조건이 없어 RUM 0건 설치본에서도 트레이스 상세 매 요청이 파티션 전부를 훑었다; V57에 `(group_id, start_ts)` 인덱스).

**트레이스 상세 연결**(`ApmTraceQueryService:597~`): 서버 스팬 범위 ±5분에서 `apm_rum_span`을 같은 `trace_id`로 조인해 트리에 얹는다. Browser 행은 `serviceUid=null`·`label="Browser"`·`attrs["rum.browser"]="true"`(FE는 이 속성으로 식별), 중복 spanId는 서버 우선, **잃어버린 부모는 지어내지 않는다**(parentSpanId가 fetch 스팬을 가리키는 서버 스팬만 자연히 붙는다). 표시 summary는 Browser 포함으로 duration·root·spanCount를 재계산하되 **저장된 서버 summary가 있으면 error는 서버 값**(R8 — 위조 가능한 스팬 하나가 서버 트레이스의 에러 플래그를 바꾸면 안 된다). 저장된 `apm_trace_summary`·RED·SLO·서비스 맵은 **무변경** — 서비스 맵에 BROWSER 노드를 만들지 않은 것도 같은 결정이다("공개 데이터로 서버 그래프를 오염시키지 않는다", 계약 §3).

### 26-5. 보존·폐기 통계·스니펫

`ApmRetentionJob`에 두 단계가 늘었다 — `rumPartitions`(5분 표 5종 30일 · `apm_rum_span` **7일** DROP)·`rumErrors`(`apm_rum_js_error_group`는 비파티션이라 `last_seen_at < now-90d` DELETE). 폐기 통계는 `signal=RUM` 7사유(`RUM_ORIGIN_DENIED`·`RATE_LIMITED`·`BODY_TOO_LARGE`·`INVALID_PAYLOAD`·`UNAVAILABLE`·`PII_REMOVED`·`NOT_ALLOWLISTED`), 토큰을 못 찾은 거부는 **기록하지 않는다**(R24 — `token_id=0`이 화면에 유령 토큰으로 떴다).

스니펫(`resources/apm/rum-snippet.js`, 86줄)은 HTML에 붙이는 CDN 스크립트가 아니라 **번들러용 ES module**이다: `WebTracerProvider` + document-load/fetch/XHR 계측 + `web-vitals`의 `onLCP…onFCP`를 OTLP gauge로 직접 `fetch(keepalive, credentials:'omit')`, `window.error` → `exception` 스팬, 반환값이 **종료 함수**. `consentGranted()`가 기본 `false`라 동의 전엔 초기화조차 안 되고 exporter도 게이트로 감싸 철회 즉시 멈춘다. 세션 id는 `crypto.randomUUID()`를 **탭 메모리에만**. `RumSnippetService`는 `app.apm.collector.endpoint-hint`의 origin + `/apm/rum`을 박고 토큰은 `PASTE_ONCE_ISSUED_RUM_TOKEN` 자리표시(GET은 원문을 재노출하지 않는다), `cspConnectSrc`는 **MovesEye origin만**(백엔드 origin은 BE가 모른다 — R25로 계약 문장을 정정), `references`는 `ApmDocRef` 3건. 🔴 `installCommand`는 **버전 미고정**인데 코드는 OTel JS **2.x** API(`resourceFromAttributes`·`spanProcessors`)다 — R16으로 notice에 "2.x 필수·1.x 혼용 금지·lockfile 고정"을 적는 데서 멈췄고, 정확한 npm 조합·브라우저 번들 실행은 **미검증**이다.

**FE→BE 역요청 4건(계약 §🔄 F1~F4)이 미해결**이다: 페이지별 `ttfbP75Ms`(그래서 페이지 표에 TTFB 열이 없고 상단 카드로 안내) · 버킷별 p75 시계열(상세의 "p75 추이" 카드가 안내문만) · 목록 p75의 상한 초과 플래그 · 표본 보완(`rum-snippet.json`은 스니펫 DTO 9필드가 계약 게이트에 전혀 안 걸린 유일한 조회 DTO).

### 26-6. 아직 실측 없는 것 (§13-6과 같은 성격 — 계약 §7의 열 가지 중 코드로 못 닫는 것)

| 항목 | 지금 아는 것 | 열리는 조건 |
|---|---|---|
| 실 브라우저 번들 → CORS → BE → 백엔드 `traceparent` 전파 종단 | MockMvc는 전용 체인+실제 `JwtAuthFilter`까지만. 스니펫은 Node ES module **구문 검사**만 통과 | 고객 사이트 하나에 붙여 개발자 도구로 §2.18.4a의 코드 표를 한 번 훑는 것 — 첫 RUM 고객이 곧 실측이다 |
| OTel JS 정확 버전 조합 | 2.x API 사용은 확실, 어떤 2.x 조합이 번들되는지는 미검증(R16 잔여) | `installCommand`에 `@x.y.z` 고정 후 `npm ci` + 번들 1회 |
| 다중 BE 노드·재시작의 일 예산 | 단일 노드 인메모리, 재시작 초기화(계약 §1·§7-3 세 번 명시) | 노드가 둘이 되는 날 Redis 원자 연산으로 — 그 전까지 예산은 "대략" |
| CUMULATIVE 히스토그램을 보내는 SDK | 폐기한다는 규칙만 있고 실 SDK가 그렇게 보내는지 모른다(스니펫은 gauge) | 고객이 자체 SDK 설정으로 붙일 때 폐기 통계 `RUM_INVALID_PAYLOAD`·`NOT_ALLOWLISTED` 추이로 발견 |
| 50,000행 절단의 실제 빈도 | 경계 테스트(50,001행)만. 페이지 그룹 × 브라우저 × OS × 국가 × 버킷 조합이 실사용에서 얼마나 넓어지는지 모른다 | 30일 창 조회의 `truncated` 비율 관측. 자주 잘리면 집계를 SQL로 내려 CAP을 그룹 수로(R6 대안) |
| `mixedBounds: true`의 실제 발생 | 격자는 V57 시드 하나뿐이라 지금은 못 만든다 | rum 격자를 두 번째로 바꾸는 날 — 그때 R10(배열 정확 일치)이 수신을 살린다 |
| Firefox 이외 스택 형태(Safari `fn@url` 유사·번들러 소스맵 줄) | `at ` 또는 `fn@url:line(:col)` 두 형태만 남긴다 | 실 오류 그룹의 `sampleStack`이 `null`로만 쌓이면 형태를 하나 더 배운다(R9의 형태 판정 자리) |

---

## 27. K8s 컨텍스트 — 재시작·OOM은 "이벤트"가 아니라 "카운터와 이유"다

### 27-1. Collector `kubernetes` 옵션

설정 생성(`POST /apm/collector-config`)과 발급 `withConfig`에 `kubernetes?: boolean`(기본 false). `ApmCollectorConfigGenerator.kubernetes()`가 세 자리표시를 채운다: 리시버 `kubeletstats`(ServiceAccount 인증, `https://${K8S_NODE_NAME}:10250`, SA CA·`insecure_skip_verify: false`, node/pod/container) + `k8s_cluster`(**`resource_attributes.k8s.container.status.last_terminated_reason.enabled: true`** — R2의 핵심 한 줄), 프로세서 `k8sattributes`(metadata 6종, pod 연결은 `k8s.pod.uid` → connection 순), 파이프라인 `metrics/k8s` + 기존 metrics/traces/logs 파이프라인에도 `k8sattributes`를 **끼워 넣는다**(변이 B3 — 정의만 있고 파이프라인에 안 꽂힌 상태를 아무도 안 보고 있었다; 지금은 네 배열과 batch/tail_sampling 이전 순서를 검증). 생성 yaml 머리에 NOTICE 4줄 — kubelet serving CA가 SA CA와 다르면 별도 마운트(검증을 끄지 말 것)·RBAC(pods/namespaces/nodes/replicasets/deployments get/list/watch + nodes/stats)·**kubeletstats는 DaemonSet, k8s_cluster는 클러스터당 1개**(중복이면 과대 수집)·`K8S_NODE_NAME`은 Downward API. 🔴 **이 통합 설정은 한 노드 시험용**이고 RBAC·배포는 WBS 5.3a **인프라 과제로 별건**이다 — 생성기는 yaml을 만들 뿐 클러스터에 배포하지 않는다.

### 27-2. 관측기와 writer — 한 곳에서만 쓴다

`ApmKubernetesMetricObserver`(35줄)는 **`k8s.container.restarts` Gauge(Int)** 포인트만 본다. 이유(`OOMKilled`)는 datapoint가 아니라 그 포인트의 **리소스 속성**에서 읽는다(계약 §6 "가짜 상태 메트릭이나 datapoint의 임의 reason은 쓰지 않는다"). `service.name`이 없는 지표라 `namespace+pod`가 맞는 **기존 인스턴스에만** 붙인다(V57 부분 인덱스 `apm_instance_k8s_context`). 등록 리소스 경로(`ApmRegistrar` → `observeInstance`)와 cluster 메트릭 경로(`observePod`)는 **찾는 조건만 다르고** 같은 `ApmKubernetesStateWriter.UPDATE` 한 문장을 쓴다 — R18 이전엔 JPA판·JDBC판 두 벌이라 한쪽만 고치면 갈렸고, JPA `save`가 그 사이 들어온 JDBC 관측을 덮었다. 지금 `ApmInstance`의 K8s 컬럼은 전부 `updatable=false`라 일반 touch/save가 이전 상태를 못 쓴다.

판정은 SQL CTE 한 곳(`with incoming as (…) update apm_instance …`)에 있다: `n > 이전 count`면 `restarted_at = at`(**에지**), 최초값·reset(감소)은 기준만 바꾸고 재시작이 아니다(과거 사건 시점을 모르니 시각을 지어내지 않는다). OOM은 `reason='OOMKilled' ∧ (증가 ∨ pending)`일 때 **한 번** — `last_terminated_reason`은 컨테이너가 사는 내내 같은 값으로 반복 보고되므로 레벨로 찍으면 "한 번 OOM된 파드는 배지가 영구 점등, 시각은 언제나 방금"이 된다(R3). 증가 관측에 이유가 아직 없으면 `container_restart_reason_pending`을 켜 두고 **5분 안**에 늦게 온 이유와 한 번 결합한다. `k8s_seen_at <= at` 가드가 늦게 도착한 과거 샘플을 거른다. 배지는 `badgeActive(observed, from, to)` = `[from, to)` ∧ `to−5분 < observed`(정확히 5분이면 false) — `restarted`/`oomKilled`는 조회 창의 함수이고 `restartedAt`/`oomKilledAt`은 이력으로 남는다(그래서 FE가 "최근"과 "이력" 태그를 가른다). 🔴 이 시각은 **텔레메트리 관측 시각**이지 실제 종료 시각이 아니다.

같은 카운트가 어떻게 읽히는지 한 표로 — 이 표가 곧 `ApmKubernetesContextTest`·`ApmKubernetesMetricObserverIT`가 고정하는 경우들이다:

| 이전 count → 관측 | reason | `restarted_at` | `oom_at` | pending | 뜻 |
|---|---|---|---|---|---|
| null → 3 | — | 그대로(null) | 그대로 | false | **최초 관측** — 과거 3번이 언제였는지 모른다 |
| 3 → 4 | `OOMKilled` | 관측 시각 | 관측 시각 | false | 재시작 + OOM **한 번** |
| 3 → 4 | (없음) | 관측 시각 | 그대로 | **true** | 이유가 늦는다 — 5분 기다린다 |
| 4 → 4 (pending, 3분 뒤) | `OOMKilled` | 그대로 | 관측 시각 | false | 늦은 이유 **한 번 결합** |
| 4 → 4 | `OOMKilled` (반복) | 그대로 | 그대로 | false | 레벨 반복 보고 — **무시** |
| 4 → 0 | 아무거나 | 그대로 | 그대로 | false | reset(파드 교체) — 기준만 0 |
| 4 → 5 (at < `k8s_seen_at`) | — | 그대로 | 그대로 | 그대로 | 늦게 도착한 **과거** 샘플 — 버린다 |

`MetricIngestPipeline`에서 `kubernetes.observe(points)`는 `ingestor.ingest()` 뒤에 있지만 이제 `try/catch`로 격리되고 실패는 `K8S_ENRICHMENT_FAILED`(signal=METRIC, **보강 실패 배치 수**이지 메트릭 손실 수가 아니다)로 센다 — 통계 기록 실패까지 다시 격리한다(R1). 허용목록에서 쓰지도 않는 pod/node CPU·memory 4종을 뺐고(R20 — `service.name`이 없어 어차피 `UNKNOWN_SERVICE`로 폐기되며 통계만 부풀렸다), 정본 이름은 `k8s.container.restart_count`, 구 `container.restart_count`는 **writer 입구 폴백만**(R5). ⚠️ `collector-template.yaml`의 `filter/metrics`엔 구 이름 `container\.restart_count`가 `k8s\..*` 옆에 아직 있다 — 해롭진 않다(둘 다 통과). **미검증**: 실 클러스터·RBAC·kubelet TLS. K8s 픽스처(`test/resources/apm/k8s/cluster-restarts-0.159.0.json`)는 contrib 출력 계약을 **재현한** OTLP/JSON이지 캡처본이 아니다.

---

## 28. P3 QA 2회차와 D10 — 같은 이름의 트리거는 둘일 수 없다 (`e2e_apm-p3-qa.md` §7)

09-08 2회차(실 Zabbix·`:3001`·헤드리스 Chrome)에서 **1차 결함 23건 중 재검증 대상 전건 PASS**, 새 결함 6건(MED 1·LOW 2·INFO 3). §23-4가 "작업 트리에서 진행 중"이라 적었던 FE 여덟 가지도 이 회차에서 **DOM으로 실측**됐다 — 폐기 표 `신호` 열(로그/메트릭 두 줄로 갈림, 중복 키 0)·합성 Drawer 저장의 PUT 본문(`steps[0].httpStepId:"43"`, `steps[1].isNew:true`)·배치 표 `(serviceUid, jobName)` 행 키·`실패` 필터의 "창을 넓혀도 나오지 않으니 필터를 풀어 보세요" 분기·간트 `250개 중 200개 표시` 배지·리포트 각주 3종·설치 가이드 출처 카드 21개. 그 밖에 3차 반영분 셋(`previousTotals` 실집계 — 총계 증감이 서비스별 증감의 합과 일치·`definitionChanged` 배지·catch-up이 `08-17·08-24·08-31` 셋을 오래된 순으로 메움)은 **없던 상태를 심어야** 비로소 보였고, 심어 보니 맞았다(§7.3 — 대신 `availabilityPoint` 증감 경로는 시드로도 열리지 않아 여전히 아무도 본 적 없는 코드다). 두 가지만 여기 길게 적는다.

**D3 실증 — SLO를 끄면 Problem이 닫힌다.** §18-5·§23-1의 "끌 때 열린 Problem이 남았다"가 두 경로 모두에서 닫혔다: SLO 끄기(`ApmAlertOrphanSweeper`)·규칙 끄기(`applyEnabledState`) 둘 다 아이템에 **`-1`이 먼저** 들어가고 트리거가 내려가며 Zabbix 열린 문제가 실제로 0이 됐다. 1차에 미검증이던 `apm_zbx_cleanup` 큐도 이번엔 행이 **실제로 생겼다가 소멸**했다(`RESOLVE · 41619 · 사유='규칙 비활성화' · attempts=0` → 다음 회차 `cleanup(try=1 ok=1 left=0)`).

**D10 — 전역과 같은 kind의 서비스별 규칙은 트리거를 영영 못 만든다.** 3차 검수 #2(공유 아이템 가드)를 검증하려고 "서비스별 규칙으로 전역을 덮는" 계약상 정상 흐름을 만들자 `Trigger "APM p95 응답시간 — moveseye-be" already exists`로 **덮기 자체가 실패**했다. 원인: 트리거 description이 `(kind.displayName, scope.label)`뿐이라(규칙 uid는 태그에만) 같은 (kind, 서비스)의 두 번째 트리거를 Zabbix가 거절하고, 덮인 전역 바인딩은 설계상 지우지 않고 내려 두므로(`status=1`) 그 이름이 영구 점유된다. 피해는 가드 검증 불가로 끝나지 않는다 — 그 (서비스, kind)의 Zabbix 알림이 통째로 멈추고(우리 DB만 `fired=1`), 고아 정리가 아이템에 `-1`을 밀어 최근 데이터도 "측정 불가"로 굳는다. **반영**(`05e830d`): `triggerDescription(rule, kind, scope)`이 이름을 조립하는 **유일한 곳**이 되고 **서비스별 규칙에만** 접미 `(서비스 규칙 <rule_uid 앞 8자>)`가 붙는다. 전역 이름은 글자 하나 안 바꿨다 — 고객 액션·미디어 조건이 이름을 걸고 있을 수 있어 돌고 있는 것의 이름을 바꾸면 "알람은 뜨는데 연락이 없는" 최악의 고장이 되고, 서비스별 트리거는 이 결함 때문에 **만들어진 적이 없어** 잃을 것이 없다. uid까지 넣는 이유는 `SLO_BURN`의 라벨이 `<서비스> / <SLO 이름>`이라 SLO 이름이 겹치면 표식만으론 또 겹쳐서. 마이그레이션 없음 — 트리거를 **찾는** 축은 태그이고 이름은 DB에 없다; 옛 이름은 `alignLegacyDescription`이 "정확히 우리가 쓴 옛 이름"일 때만 **한 번** 옮긴다(사용자가 손수 고친 이름은 안 건드림). 🔴 **런타임 재현은 안 했다**(그 작업 범위에서 `:3000`·`:3001`·dev DB 접촉 금지) — D3d(공유 아이템 `-1` 금지 + `event.acknowledge`)와 함께 다음 QA의 첫 항목이다.

나머지 한 줄씩: D11 `APM_REPORT_PERIOD_INVALID`의 message가 코드 이름 그대로 → 호출부가 한국어 문구를 넘김(`ErrorCode`엔 메시지 칸이 없다 — 공용 enum에 문자열을 달면 NestJS 1:1 보존 계약과 충돌) · D12 지워진 서비스의 잡 `serviceName`이 `""` → `null`로 `serviceUid`와 축을 맞춤(🔴 메시징 쪽 `""`는 그대로 — 다른 EP까지 같이 바꾸면 그쪽 FE가 조용히 깨진다) · D13 배치 이력 각주가 0건에도 렌더 → BE는 0을 그대로, FE 규약 `N > 0`만 렌더 · A9 AI `notes[]` 한·영 혼용 · A10 `apm_slo_status`가 창 입력을 조용히 무시.

---

## 29. P5.6 비동기 표시 — 워터폴에 "관계"와 "시간상 특징"을 얹되 "실행 방식"은 말하지 않기 (FE 단독, `traces/waterfall/`, 2026-09-15)

제니퍼의 "비동기 모니터링"을 우리 데이터로 다시 짠 첫 출시분이다. **BE 변경 0**, 새 메뉴·새 탭도 없다 — 트레이스 상세 워터폴 탭 안에 요소 7개가 들어갔고, 전부 이미 있는 `GET /apm/traces/{traceId}` 응답(`spans[].{links, offsetMs, durationMs, parentSpanId, selfMs, kind, orphan}` + `rootMissing/cycleBroken/truncated`)만 읽는다. 코드는 worktree `moveseyee_fe-p56`(`p56-async` `c698463`, master 병합 포함) `src/pages/application-monitoring/traces/waterfall/`의 신규 5파일 — **`apmAsync.ts`**(순수 함수)·**`useApmAsyncNavigation.ts`**(훅)·`ApmSpanLinks.tsx`·`ApmAsyncKindShare.tsx`·`apm-async.scss` — 와 기존 `ApmTraceWaterfall.tsx`·`ApmSpanDetailPanel.tsx`·`ApmWaterfallBar.tsx`·`apmWaterfall.ts`·`ApmTraceDetailPage.tsx`의 수정이다. 누가 지었나: 코덱스 구현 → Claude 검수(🔴2·🟡13, 변이 3/3 검출) → 코덱스 반영 — `reviews/review_apm-p56-fe_{codex-impl,claude,codex-fix}.md`. 출시 게이트 R-P5.6은 **PASS**(`features/apm/realtime/r-p5-6_apm-async-links.md`, §29-6). 설계 정본은 `features/apm/realtime/devdesign_apm-realtime-ux.md` §3(v1.2).

### 29-1. 정직 규칙 — "비동기"를 세 층으로 쪼갠 이유

이 절의 코드는 전부 한 결정에서 나온다: **우리 데이터는 "비동기로 실행됐다"를 증명하지 못한다.** 그래서 설계는 말할 수 있는 것과 없는 것을 셋으로 갈랐고, 코드는 그 경계를 타입 이름으로 지킨다.

| 층 | 데이터 근거 | 코드에서의 이름 | 화면 문구 |
|---|---|---|---|
| ① **관계** | `span.links[]`(적재 상한 32/스팬, 허용목록 속성만) | `TApmAsyncLink{traceId, spanId, sameTrace, isParent, attrs}` — `sameTrace`는 **분류 축**이지 실행 방식이 아니다 | "응답에 포함된 링크 L(같은 i · 다른 j)" |
| ② **시간상 특징** | `childEnd > parentEnd + 1ms` | `TApmAsyncMark.afterParentEndMs`(null이면 해당 없음) · `hatchMs` | "부모 종료 이후 종료 K", `⇢` |
| ③ **실제 실행 방식** | **없다** — `thread.*`는 스팬을 *시작한* 스레드, 스팬에 프로세스/인스턴스 식별자 없음 | 타입도 필드도 없다 | **"병렬 실행"·"스레드 N개" 금지**(R-P5.6 문구 게이트 0건) |

🔴 링크에는 대상 `kind`가 없다. 그래서 `ApmSpanLinks`는 다른 trace를 가리키는 링크에 "발행/소비" 라벨을 **붙이지 않는다**(테스트가 `queryByText("발행 스팬")` null을 단언). 붙이려면 대상을 조회해야 하고, 그 일괄 EP(F4)는 P5.6b다.

### 29-2. `apmAsyncMarks` / `apmAsyncSummary` — 컴포넌트 밖의 순수 함수 두 개

`apmAsync.ts:48` `apmAsyncMarks(spans) → Map<spanId, TApmAsyncMark>`. O(n + 링크 수) — `byId` 맵 한 번, 스팬마다 `parentSpanId`로 부모를 찾아 종료 시각을 비교한다. **트리를 다시 만들지 않고 정렬도 건드리지 않는다**(§14의 전위 순회 계약 그대로). 핵심 세 줄:

```ts
const after = !uncertain && parentEnd !== null && childEnd > parentEnd + APM_ASYNC_PARENT_TOLERANCE_MS; // 1ms
afterParentEndMs: after ? childEnd - parentEnd : null,
hatchMs: after ? Math.max(0, childEnd - Math.max(span.offsetMs, parentEnd)) : 0,
```

해칭이 `childEnd − parentEnd`가 아닌 이유: 그 식은 **부모 종료와 자식 시작 사이 공백**까지 포함한다. 자식이 부모 종료 200ms 뒤에 시작해 100ms 돌았다면 "부모 종료 이후 +300ms에 종료"(`afterParentEndMs`)는 맞지만 막대에 칠할 구간은 100ms다. 테스트는 `late`(자식 시작 < 부모 종료)와 `gap`(자식 시작 > 부모 종료) 두 fixture로 `max(childStart, parentEnd)` 항을 정확히 겨눈다 — 검수 변이(식을 `childEnd − parentEnd`로) 1 failed로 검출. R-P5.6 D-3에서 `B-detached`(after 800 · hatch 600)가 같은 것을 실데이터로 확인했다.

**`uncertain`은 스팬 단위다**(`:57~66`). 처음 구현은 트레이스 플래그 `rootMissing`/`cycleBroken`을 **모든 스팬에** 투영해 판정을 통째로 껐고, 화면은 그 상태에서 "발견되지 않았습니다"라고 말했다 — 설계 §3이 막으려던 오독("발견되지 않음 ≠ 없음")이 한 단계 아래에서 재발한 형태(검수 🔴-2). 반영 후: 실제로 부모를 못 찾은 스팬(`orphan` 또는 `parentSpanId`가 응답에 없음)만 제외하고, 사유 라벨만 트레이스 플래그로 고른다(`brokenParent`는 BE가 순환에서 떼어 낸 스팬 — orphan으로 승격하되 원래 `parentSpanId`는 보존한다는 §14 규칙을 그대로 읽는다). 제외된 스팬은 행에 `불확실` 태그, 요약에 "판정 안 함 N"으로 **드러난다**. ✅ R-P5.6 fixture G: 부모 미저장 자식은 "Unclassified 1", 그 아래 손자(부모가 응답 안에 있음)는 정상 판정 `after=400`.

`apmAsyncSummary(marks, {truncated})`(`:88`)는 다섯 숫자(`afterParentEnd`·`uncertain`·`linksIncluded`·`linksSameTrace`·`linksOtherTrace`)와 `truncated`를 돌려준다. 🔴 `linksIncluded`는 **응답에 포함된** 수다 — DTO에 절단 플래그가 없어 "전체 M개 중"을 말할 수 없고(P5.6b `linksTruncated`), 그래서 요약·팝오버·빈 상태 문구 전부 "응답에 포함된"·"스팬당 최대 32개가 저장"으로 적는다(R-P5.6 D-1의 UX 조건 — E-links-33을 넣어도 팝오버는 32행 + 완전성 주장 없음).

### 29-3. `keepIds` — 필터는 트리를 다시 만들지 않는다

"관련 스팬만 보기"(`?asyncOnly=1`)는 두 집합으로 만든다. `apmAsyncRelatedIds(marks)`(`:113`) = 링크가 있거나 `afterParentEndMs !== null`인 스팬 → `apmAsyncKeepIds(spans, ids)`(`:123`) = 거기에 **부모 사슬을 집합에만** 더한 것(방문한 사슬은 다시 걷지 않으므로 O(n), 순환 부모 사슬도 `keep.has`로 끝난다 — 테스트 있음). 이 집합을 `apmWaterfallRows({…, keepIds})`(`apmWaterfall.ts:105`)에 넘기면 전위 순회가 **행을 밀 때만** 걸러 낸다:

```ts
if (collapsed) skipDeeperThan = span.depth;        // 접기 규칙 먼저
if (keepIds && !keepIds.has(span.spanId)) return;   // 그 다음 필터
```

순서가 중요하다 — `keepIds` 검사가 `skipDeeperThan` 설정 **뒤**에 있어서, 필터에 걸러진 마디를 접어 둔 상태였다면 그 자식들도 여전히 숨는다(접기 의미 보존). 정렬·재귀·트리 재구성이 없으니 크리티컬 패스·자기 시간·행 순서는 그대로다. `keepIds`를 안 넘기는 기존 호출부 5곳은 동작이 같다(검수 확인). 조상은 행을 흐리게만 그린다(`asyncOnly && !relatedIds.has(id)`). 검수 변이(`apmAsyncKeepIds`가 조상을 안 담게) 4 failed로 검출. ✅ R-P5.6 fixture C: `?asyncOnly=1` 7행 = 관련 6 + 루트 1, 링크 없는 형제 302는 제외 — 손계산과 일치.

### 29-4. `useApmAsyncNavigation` — 가시 행 index 역산, 조상 펼침, 복귀 스냅샷

훅(`useApmAsyncNavigation.ts:41`)의 첫 줄 주석이 그 존재 이유다: *"URL 선택과 전위 순회 가시 행을 연결한다. scrollTop은 원본 배열 index로 계산하지 않는다."* 워터폴은 가상 스크롤(§14, 5,000스팬에서 DOM 행 34개)이라 대상 행이 DOM에 없을 수 있고, 접힘·필터 때문에 **원본 배열 index ≠ 화면 index**다. 그래서 점프는 세 단계다.

1. **`reveal(id)`**(`:128`): `apmAsyncKeepIds(spans, {id})`로 조상 사슬을 구해 `collapsedIds`에서 **조상만** 지운다(대상 자신은 접힌 채여도 된다). `revealedId`도 세워 두는데, 필터가 켜진 상태에서 필터 밖 대상으로 가면 `rows` memo(`:94`)가 대상+조상을 **임시로** `effectiveKeep`에 더한다 — 화면엔 "선택한 링크 대상과 조상을 함께 표시하고 있습니다"가 뜬다.
2. **`jump` effect**(`:152`): 새로 계산된 `rows`에서 `rows.findIndex(row => row.span.spanId === id)` — 이것이 **가시 행 index**다 — × `APM_WATERFALL_ROW_HEIGHT`가 `scrollTop`. 이미 화면 안이면 스크롤을 안 움직여 출발 행과 대상 행이 같이 남게 한다(관계선을 보여 주려고). 행 DOM이 아직 없으면 다음 렌더(가상 창 갱신 뒤)에 포커스한다.
3. `element.focus({preventScroll:true})` + `highlightId` 1.5초(`APM_ASYNC_HIGHLIGHT_MS`, `BRAND.primarySoft`, reduced-motion이면 전환 0) + `onSelectSpan` → `?span=`.

테스트는 접힌 가지 40행을 만들어 `(259−40)×ROW_HEIGHT`를 단언한다 — 원본 index로 계산하면 틀리는 숫자다. ✅ R-P5.6 fixture H: 깊이 4 대상이 든 가지를 접고 얕은 행에서 링크 클릭 → 조상 사슬 801→803→804→805→806 자동 펼침, 806 가시.

**관계선은 선택한 링크 하나만**(`relation` 단일 상태, `followLink:194`). `ApmTraceWaterfall.tsx:176` `relationshipRows`가 두 행의 가시 index를 구하고 `showRelationship`은 **둘 다 뷰포트 안일 때만** 참 — 가상 스크롤 밖 행에 선을 그리면 허공을 가리킨다. SVG는 뷰포트 높이로 잘라 y를 `scrollTop` 상대값으로 둔다(검수 Y-7: 처음엔 `rows.length × 28`px, 5,000행이면 140,000px SVG였다). 점선(`strokeDasharray="4 3"`)에 **화살표 marker가 없다** — 링크는 시간 순서가 아니므로 "출발 끝→대상 시작" 화살표로 순차·대기를 암시하지 않는다(테스트가 `querySelector("marker")` null까지 단언). 부모를 가리키는 링크(`isParent`)는 목록·개수에는 남기되 트리 선과 겹치는 관계선만 생략한다.

**복귀 스냅샷**(`toggleAsyncOnly:209`): 필터를 켤 때 `{traceId, spanId, scrollTop, collapsedIds}`를 `filterSnapshotRef`(페이지가 소유 — 탭을 왕복해도 산다)에 저장하고, 끌 때 `restore`로 되돌린다. 브라우저 뒤로가기로 필터가 꺼지는 경우도 `lastAsyncOnly` 비교로 같은 경로를 탄다(`:114`). 필터 켜기의 선택 스팬은 "지금 선택이 keep 안이면 유지, 아니면 관련 첫 스팬".

### 29-5. URL — 복귀 5키, push와 replace

다른 trace 열기는 `apmAsyncLinkPath(link, source)`(`apmAsync.ts:139`)가 만든다: `apmTraceDetailPath(link.traceId)?span=<대상>&from=<현 trace>&fromSpan=<현 선택>&fromTab=<탭>&fromAsync=<0|1>`. `from` 하나로는 원래 선택을 복원할 수 없어 키가 다섯이다. 도착지의 `apmAsyncReturnPath(params)`(`:158`)는 `?tab=&span=&asyncOnly=`를 되짚어 만들고(`fromAsync=1`일 때만 `asyncOnly=1`을 싣는다 — Y-10), 잘못된 값(`fromTab=async`)은 `resolveApmTraceDetailTab`이 `waterfall`로 정규화한다. ✅ R-P5.6 D-4: 5키 전부 전달, 복귀 시 탭·필터·선택 3종 복원, 배너 "Opened from a link in trace …".

`ApmTraceDetailPage.tsx:294`: **필터 토글과 다른 trace 이동은 history push**, **스팬 선택은 replace** — 설계 §0이 URL에 상태를 두는 이유로 "공유·새로고침·뒤로가기"를 들었는데 기존 `updateParams` 기본값(replace)은 앞 둘만 채웠다(검수 Y-2). 스팬 클릭마다 히스토리가 쌓이는 건 원치 않아 선택만 replace로 남겼다. 🔴 이 앱의 페이지 전환 key는 `location.pathname`(`App.tsx:240`)이라 같은 경로의 query 변경은 리마운트하지 않는다 — 메모리 `fe-page-remount-on-navigate`는 구 동작이다.

링크 대상 조회 실패는 셋으로 갈린다(`:125~160`): `resolveApiError(...).messageKey === "api_error.permission_denied"` → 403(재시도 없음) / `APM_TRACE_NOT_FOUND` + `from` → "현재 저장된 트레이스를 찾지 못했습니다"(🔴 기존 제목 "만료됐습니다"를 링크 대상에 붙이면 틀리다 — 별도 tail 판정을 받아 애초에 저장 안 됐을 수 있다) / 그 밖 → `ApmQueryError` + 재시도(`refetch`, invalidate 아님 — 단건 상세라 캐시를 흔들 이유가 없다). 대상 trace는 있는데 그 spanId가 없으면 워터폴은 뜨고 "대상 스팬이 이 트레이스 응답에 없습니다" + Retry — 미저장과 확실히 다른 상태(✅ fixture I, `notFoundMsg:false`). ⚠️ 403 분기는 **모듈 권한은 있고 `apm.view`만 없는** 조합에서만 도달한다 — 모듈 권한이 없으면 `PageWrapper`가 `/errors/404`로 먼저 보낸다(R-P5.6 §7-1).

메시징 링크(`apmAsyncMessagingPath:176`)는 `messaging.system`·`messaging.destination.name`·`serviceUid` 셋을 다 식별할 때만 `/application-monitoring/messaging?msgDest=&msgSystem=&msgService=&from=&to=`(ms 에폭, ±60초)를 만든다. 🔴 처음엔 `Typography.Link href`라 SPA를 우회해 **앱 전체가 리로드**됐다(검수 🔴-1, APM 안 내부 이동 12곳 중 이곳만) → `react-router Link`로.

### 29-6. 되지 않는 것 — 코드가 일부러 안 만든 것

| 안 만든 것 | 왜 |
|---|---|
| "비동기 N개 · 미완 M개" 요약 | 스팬은 끝나야 export된다. 진행 중 작업은 데이터에 없다 |
| 스레드 레인 · "스레드 N개" | `thread.name`은 고유 ID가 아니고(서비스·JVM이 달라도 같은 이름) 스팬에 인스턴스 식별자가 없다 → BE 필드 F1 뒤 P5.6b |
| 링크 전부를 선으로(최대 5,000×32) | 가상 스크롤 밖 행은 허공. 선택한 하나만 |
| "발행/소비" 라벨 | 링크에 대상 kind 없음. 일괄 확인 EP(F4)는 P5.6b |
| "전체 링크 M개 중 L개" | DTO에 절단 플래그 없음(F2 `linksTruncated`). 리더 상한 128은 적재 32에 가려 관측조차 안 된다 |
| 역탐색("이 trace를 링크로 참조하는 trace") | 현 detail 응답으로 불가 — 역방향 EP(F3) |
| "비동기 작업이 없습니다" 빈 상태 | "이 응답에서 발견되지 않음"만 쓴다 — 링크는 계측이 만들 때만 저장되고, `@Async`·CF 자동계측은 **안 만든다** |

마지막 줄이 R-P5.6에서 확인된 사실이다. 검증 시작 시점 `apm_span` 82,582행 중 `links IS NOT NULL`은 **0행** — `TraceIngestPipeline.linksJson()` 주석의 "실측 0건"이 사실이었고, 이번 fixture 191건이 링크 경로의 **최초 실측**(ID·순서·허용 속성 100% 보존, 비허용 잔존 0). 실 javaagent 2.31.1로 `@Async`(fire-and-forget·대기)·CompletableFuture(`thenApply`·`thenApplyAsync`·사용자 Executor·`allOf`) 7구성 × (자동계측 단독 / `@WithSpan`) = 14구성 1,400요청을 돌렸더니 **링크 0%, 부모 컨텍스트 전파 100%** — 자동계측은 작업 자체의 스팬도 안 만들지만(`@WithSpan`이면 100%) 컨텍스트는 전파해 작업 안의 자동계측 스팬이 루트의 직계 자식으로 붙는다. fire-and-forget은 100% 자식이 부모보다 늦게 끝나므로 ⇢ 마커가 실제 운영에서 가장 자주 붙을 자리다. Kafka/RabbitMQ는 브로커가 없어 **미측정** — 자동계측이 링크를 만드는 현실적 경로가 바로 메시징이라 "링크 0%"는 `@Async`/CF 범위의 사실로만 읽어야 한다. 게이트(ⓑ 보존 + D-1·3·4·5)는 PASS이고 구현 수정 요구는 0건; 문서 정정 4건(D-5는 **프로덕션 빌드로만** — 개발 빌드는 8스팬도 469ms 정지 · 128/129 관측 불가 · QA 포트 5174~5175(dev CORS 5173~5175만) · 403 도달 조건)은 UX 정본 v1.2에 들어갔다.

---

## C. 오늘 정한 규칙 10개 (2026-09-01)

새 코드를 넣을 때 이 열 줄만 지키면 구조가 다시 흐트러지지 않는다. 정본은 `moveseye-be-spring/CLAUDE.md` §0.5-6/7과 `package-info.java` 세 곳.

| # | 영역 | 규칙 | 한 줄 이유 |
|---|---|---|---|
| 1 | 패키지 | **메뉴 우선.** 그 클래스가 답하는 질문이 어느 화면의 것인지 먼저 본다. 다른 메뉴가 가져다 써도 정체성이 한 메뉴면 그 메뉴에 둔다 | 개요가 서비스 목록을 부르는 건 하류 의존이지 공유가 아니다 |
| 2 | 패키지 | **세트 = 같이 바뀌고 같이 읽히는 것.** 서비스·저장소·DTO를 `query/`·`dto/` 계층으로 가르지 않는다 | 기능 하나 고칠 때 실제로 함께 열리는 파일이 한 폴더에 있어야 한다 |
| 3 | 패키지 | **`core/`는 import 그래프로 판정.** 둘 이상의 메뉴가 *실제로* 쓰고 화면 어휘가 없을 때만. 한 메뉴만 쓰면 내린다 | 이 기준으로 `ApmApdex`·`ApmNaming`이 core에서 내려왔다. 영속 계층(`domain/`)만 통째로 예외 |
| 4 | 패키지 | **DTO는 세트 폴더 바로 아래.** `dto/` 하위가 아니다 | DTO는 그것을 만드는 서비스와 항상 같이 바뀌고, 옆 기능 DTO와는 아무 때도 같이 안 바뀐다 |
| 5 | 패키지 | 세트 폴더는 평면 유지. **10파일을 넘고 그중 DTO가 과반**일 때만 `dto/`를 뺀다. 한 폴더 5개 안팎이 목표 | `registry/`가 11파일이 되어 화면/`auto/`로 가른 것이 이 규칙의 적용 사례 |
| 6 | 패키지 | **컨트롤러는 메뉴 루트에 하나.** 그 메뉴의 입구가 어디인지 한눈에 | 예외는 `ingest/ApmOtlpController`(라이선스 면제 목록에 FQN이 박혀 있어 못 옮김)와 `ApmIngestStatusController`·`ApmRegistryController`·`ApmTokenController`·`ApmSettingController`(세트 전용 경로) |
| 7 | 패키지 | **`package-info.java`는 루트·`core/`·`otel/` 세 곳만.** 빈 P2/P3 패키지를 미리 만들지 않는다 | "있는데 비었다"가 더 헷갈렸다. 착수할 때 만든다 |
| 8 | 값 | **설치본별로 다른 값은 하드코딩 대신 프로퍼티**(`app.apm.collector.*`). 우선순위 **FE 입력 > 프로퍼티 > 코드 기본값**, 기본값은 `config-defaults` EP로 FE에 내려 준다 | 판정은 "고객사마다 달라야 하는가" 하나. 검증한 버전 번호는 코드 상수로 남긴다 |
| 9 | 알람 | **활성 서비스별 규칙만 전역을 덮는다.** 배치(`targetsOf`)와 화면(`forService`)이 같은 문장으로 판정하고, 응답은 `effective`·`appliedRuleUid`로 말한다 | 두 곳이 따로 판정하면 화면 ≠ 감시 대상(A22) |
| 10 | 가용성 | **`status` 없는 칸 = 보존 밖(UNKNOWN과 다름).** %는 `UP+DEGRADED ÷ 판정된 칸`, **UNKNOWN·생략 칸은 분모 제외**, 판정 칸 0이면 `null` | "데이터가 지워졌다"와 "그때 죽어 있었다"를 같은 색으로 칠하면 화면이 거짓말한다(A28) |

P4(2026-09-14)에서 셋이 늘었다 — 정본은 `features/apm/core/contract_apm-p4.md` §1·§7과 검수 §2.

| # | 영역 | 규칙 | 한 줄 이유 |
|---|---|---|---|
| 11 | 공개 수신 | **브라우저가 직접 오는 EP는 거부 사유를 응답에 적지 않는다.** 미존재·회수·종류 불일치·origin 불일치는 같은 403·같은 본문. 401은 Bearer 검증 실패 하나 | 토큰이 JS에 박혀 누구나 볼 수 있는 경로에서 401/403 차이는 토큰 열거 통로다(§25-4). `ApmOtlpController:399`의 원칙을 RUM에도 |
| 12 | 공개 데이터 | **위조 가능한 원천(RUM)은 서버 집계(RED·SLO·서비스 맵·리포트·저장 summary)에 섞지 않는다.** 상세 표시에서만 합치고 `attrs.rum.browser`로 출처를 남긴다 | Origin은 비브라우저가 위조할 수 있다. 섞이는 순간 알람·SLO가 남의 손에 들어간다(§26-4) |
| 13 | 외부 계약 | **contrib 메트릭·semconv·Zabbix 필드처럼 남이 정한 이름은 공식 문서 대조가 검수의 첫 항목이고, 테스트 검출력은 변이로 잰다.** "실 환경 미보유"는 이름이 틀린 것의 변명이 못 된다 | 지어낸 이름을 테스트가 스스로 먹여 3,051이 초록이었다(§24-2). `post_type`·RAW/FORM(§19-2)도 같은 종류였다 |
| 14 | 패키지 | `package-info.java`는 여전히 루트·`core/`·`otel/`이 원칙이되, **다른 손이 다른 톤으로 쓴 세트**에는 판단 근거를 적을 자리로 허용한다(`rum/`) | 규칙 7의 취지("있는데 비었다"를 막자)와 충돌하지 않는다 — 비어 있지 않고, 톤 차이를 다음 사람에게 설명한다 |

---

## D. 문서 지도 — 무엇을 알고 싶으면 어디를 열라

경로는 `C:\solutions\_workspace\` 기준.

| 알고 싶은 것 | 문서 | 한 줄 |
|---|---|---|
| **처음부터 끝까지 단위별로**(개념·조건·전체상·데이터의 길·단계별 결정·운영·검증·용어) | `guides/apm-handbook/00-index.md` (2026-09-14, 17분책) | **종합 안내서.** 이 문서(시간순 사연)와 화면 가이드(도움말 원문)를 대체하지 않고 앞에 놓인다. `01-what-to-see.md` 봐야 하는 것/해결한 것 · `05-menus-and-tabs.md` 메뉴·탭 사전 · `06-data-path.md` 데이터의 길 · `13-verification.md` §8.5 정본 간 불일치 · `17-sources.md` 출처(외부 공식 문서 URL + 내부 정본). 구 `guides/apm-handbook.md`는 안내 스텁 |
| 왜 OTel인가·전체 아키텍처·저장 모델·만료 정책 | `features/apm/core/devdesign_apm.md` (v3.2, 541줄) | **설계 정본.** §3 Collector 템플릿·§4 수신/알람·§7 스키마·§10 실측 항목 R1~R14 |
| 메뉴 13개·차트 18종·Phase·남은 일 산출 | `features/apm/core/devdesign_apm-screens-wbs.md` (v1.1, 437줄) | §1.3 Phase 표·§3 메뉴별 차트 명세·§4 WBS 80여 태스크·§4.1 공수 ~247일 |
| 스키마·수신·토큰·등록·적재·배치·알람의 **BE 계약** | `features/apm/core/contract_apm.md` | §1 V38 스키마 → §2 수신/토큰/설정/등록 API → §3 적재 → 배치 → 알람. Phase별 누적 |
| 화면이 부르는 **읽기 API 계약**·상태 판정 정의·수집기 화면 API | `features/apm/core/contract_apm-read-api.md` (348줄) | **§5 가용성 정의**(Q12의 정본)·§6 FE 요청 결정·§7 구현 상태·**§8 수집기 API + §8.6 프로퍼티** |
| Collector↔BE json이 실제로 어떻게 오나 | `features/apm/core/r1_apm-collector-roundtrip.md` | 500 즉시 폐기·enum 숫자·64비트 문자열·배치 크기·픽스처 위치 |
| Zabbix `history.push`가 실제로 어떻게 동작하나 | `features/apm/core/r10_apm-zabbix-history-push.md` | 캐시 동기화 대기·항목별 error·NOT_SUPPORTED·`problem.get recent` 함정 |
| 종단이 성립하는가(빈 DB → Zabbix 프로비저닝) | `features/apm/core/e2e_apm-selfmonitoring.md` | 3회차. 실 수집기 1대·데모 Zabbix 잔존물 id |
| 실시간(Live)의 설계 — 왜 링/SSE인가·다중화 승격 조건 | `features/apm/realtime/devdesign_apm-live.md` | P1.5 설계 정본. §4 SSE·§6 단일 인스턴스 전제·§7 화면·§8 배포 전 확인(프록시 버퍼링) |
| Live가 실제로 도는가(지연·멱등·브라우저 실측) | `features/apm/realtime/e2e_apm-live-qa.md` | 화면 도달 중앙값 14초·최악 23초 · 덮어쓰기 1,074키 값 역행 0건 · V43/RAW_BOUNDS 실동작 · 권고 2건 |
| 볼륨·성능 실측(14M행/일) — §11의 근거 | `features/apm/core/r3_apm-volume.md` | 행당 686B(어림 2.4배)·목록 cold 13초의 정체·§9.1 조치 목록·§9.2 A/B 결과 |
| 코드가 **실제로** 어떻게 동작하나(라인 번호 포함)·결함 목록 | `features/apm/core/apm-p1-logic-analysis.md` (1,129줄) | §0~§10 흐름·§11 결정 27건·**§12.1 A1~A29**·§12.3 먼저 볼 파일 10개 |
| 화면·차트 하나하나가 무슨 뜻인가(도움말 원문) | `guides/apm-screen-chart-guide.md` | 위젯 67+·`?` 58+·FAQ 20. **P2 화면은 §2.7~§2.11, P3 화면은 §2.12~§2.17**. FE `page_guide`·`chart_help` 키의 정본 |
| 코드가 **왜** 이렇게 생겼나(입문) | `guides/apm-code-walkthrough.md` | **이 문서** |
| **(P2)** 트레이스 수신·스키마·롤업·QA 반영의 **BE 계약** | `features/apm/core/contract_apm.md` §7(§7.1~7.7 1차 물결·§7.8 2차·§7.9 QA 반영·"마스킹의 한계") | §12·§13·§16의 정본. 🔴 불안한 지점 목록(§7.6·§7.8.7)이 "아직 실측 없는 것"의 정본 |
| **(P2)** 화면이 부르는 트레이스·맵·에러·DB·의존·exemplar API, **권한**, 배포·웹훅 | `features/apm/core/contract_apm-read-api.md` §10(§10.0 여섯 가지·§10.2 타입·§10.5 권한·§10.6~10.7 FE 상태) · §11(배포·§11.3 AUTO·§11.4 웹훅·§11.8~11.10 FE 회신) | §14·§15·§17의 정본. FE 요청/회신 왕복이 절 끝에 누적돼 있다 |
| **(P2)** 실 트래픽·브라우저 종단 QA — 결함 18건과 실측 표 | `features/apm/core/e2e_apm-p2-qa.md` | §16의 정본. §2 tail 샘플링 실측·§4 C-2 크리티컬 패스 3자 정합·C-6 웹훅 15케이스·§8 2회차 재검증·D17 |
| **(P2)** 검수 | `features/apm/core/review_apm-p2-w1.md`·`w2`·`w3` + `_codex.md`, `review_apm-p2-fe1_codex.md`, `review_apm-p2-qafix_codex.md` | 1차 🔴4(잠금·dedup·SQL·이벤트 상한) · 2차 🔴4(대입·권한·원문·산점도) · 3차 🔴1(웹훅 400) · FE 1차(워터폴 0ms·가상화 드리프트) · QA-수정분(Live 회귀·count 라벨) |
| **(P3)** SLO·홈 위젯·합성 감시·메시징·배치·리포트의 **BE 계약** | `features/apm/core/contract_apm-p3.md` (2,206줄) | §18~§21·§23의 정본. §0 공통(D1) · §1 SLO(§1.3 열한 가지·§1.5 번 알람·§1.8 스냅샷) · §2 위젯 · §3 합성(§3.3 열세 가지) · §4 메시징 · §5 배치(§5.3 계측 규약) · §6 권한 · §7 구현 상태·불안한 지점 · **§8 리포트**(`/admin/reports*`) · **§9 QA 반영 — FE 할 일 8가지** · FE 요청 R-1~R-16 왕복 |
| **(P3)** AI 툴 8·screens.json 11·'/' 명령 4·원인 브리핑 프롬프트 | `features/apm/core/contract_apm-p3-ai.md` | §22-2의 정본. §0 다섯 가지·§1 툴 표·§3.1 403 문구의 통로(MCP 전용) |
| **(P3)** 설치 가이드 `references[]`·`refs[]` | `features/apm/core/contract_apm-read-api.md` §8.8 | §22-3. 출처 카탈로그 31건 표 |
| **(P3)** 종단 QA — 실 Zabbix·브라우저, 결함 23·관찰 4·미검증 15 | `features/apm/core/e2e_apm-p3-qa.md` | §23의 정본. §0 요약표 · §1 D1~D9 · §2 M-1~M-6 · §2b A1~A8 · §6 발견 셋 |
| **(P3)** 검수 | `features/apm/core/review_apm-p3-w1.md`+`_codex.md` · `w2.md`+`_codex.md` · `w3.md`(결과 대기) | 1차 🔴6(AND·롤링 조각·NULL 분모·finalized·정리 큐) · 2차 🔴6(`post_type`·RAW/FORM·hostid·절단·늦은 도착) · 3차 요청서만 |
| **(P3)** QA 2회차 — D3 실증·D10 트리거 이름 충돌 | `features/apm/core/e2e_apm-p3-qa.md` **§7**(§7.1 D3 두 경로·§7.2 D10 재현·§7.7 반영·§7.10 발견 셋) | §28의 정본. 🔴 D3d·D10 런타임 재현은 다음 회차 첫 항목 |
| **(P4)** RUM·K8s의 **BE 계약** — 보안·수신·스키마·DTO·스니펫·K8s·FE 역요청 | `features/apm/core/contract_apm-p4.md` | §25~§27의 정본. §1 보안(상한 표·PII 규약) · §2 수신(상태 코드·CORS·OTLP 이름) · §3 스키마/보존/트레이스 연결 · §4 조회 DTO 전량+임계 표 · §5 스니펫 · §6 K8s(R2 위치 정정·배지 규칙) · §7 불안한 지점 10 · **§🔄 F1~F4 미해결** · 검수 반영 표(R1~R25) |
| **(P4)** 검수 — BE·FE | `features/apm/core/review_apm-p4-be_claude.md`(🔴4 🟡16 🟢5, §6 변이 A/B) · `review_apm-p4-fe_claude.md`(HIGH 2·MEDIUM 4·LOW 8, 규약 체크리스트) · `review_apm-p4-fe_codex-memo.md`(코덱스 자진 신고) | §24의 정본. 🔴 이번엔 **Claude가 검수자** — 코덱스 보고는 `scratchpad/codex-p4/out_{be,fix,fe}.md` |
| **(P4)** 설계 §15 RUM 보안 계약·WBS WS-5 | `features/apm/core/devdesign_apm.md` §15·§7(V39 행)·§8.1·§9, `devdesign_apm-screens-wbs.md` WS-5(5.1a·5.1b·5.3b)·§3.18 | 검수 §2가 항목별 준수 표로 대조했다. ⚠️ 설계의 "V39(P4)"·`apm_rum_token` 별도 표는 실제로 V57·`apm_receive_token` 재사용 |
| **(P5.6)** 비동기 표시 — 화면 설계·실측·검수 | `features/apm/realtime/devdesign_apm-realtime-ux.md` §3(v1.2, §3.5 E 실측 요약표·출시 문구) · `features/apm/realtime/r-p5-6_apm-async-links.md` · `reviews/review_apm-p56-fe_{codex-impl,claude,codex-fix}.md` | §29의 정본. FE worktree `moveseyee_fe-p56` `p56-async` `c698463` — 🔴 성능은 프로덕션 빌드로만 · `@Async`/CF 링크 0% · Kafka/RabbitMQ 미측정 |
| 검수에서 무엇이 지적되고 어떻게 고쳤나 | `features/apm/core/review_apm-p1.md` + `_codex.md` | 1차: 8MB 스트리밍·소유 태그·액션 태그값·logs/ |
| 〃 | `features/apm/core/review_apm-p1-r2.md` + `_codex.md` | 2차: 수집기 화면·A1~A5·토큰 캐시·keepRawSql·트리거 부분 실패 |
| 〃 | `features/apm/core/review_apm-p1-r3.md` + `_codex.md` | 3차: A22~A29·꼬리 HTTP·afterCommit 테스트·가용성 % 정의 |
| 패키지 규칙의 **레포 규약** | `moveseye-be-spring/CLAUDE.md` §0.5-6(otel)·§0.5-7(apm) | §C의 정본 |
| 패키지 안에서의 판정·남은 순환 의존 | `premium/apm/package-info.java`·`core/package-info.java`·`otel/package-info.java` | 코드 옆 설계 메모 |
| FE 폴더 규칙 | `moveseyee_fe/src/pages/application-monitoring/README.md` | `shared/` 판정·배럴 금지·import 형태 |
| 설계 단계 검수 | `features/apm/core/review_apm-design.md` | v3.1로 이어진 23건 |

**읽는 순서 추천**: 처음이면 이 문서 §0 → §A → §B → §1 → §2. 코드를 고치려면 §8 → `package-info` → 분석 §12.3. 계약을 바꾸려면 `features/apm/core/contract_apm-read-api.md` §7.2/§8.2의 "FE 확인 필요" 표부터. P1.5 이후 이야기(실시간·히스토그램 경계·성능)는 §9~§11. **P2 트레이스는 §12(수신) → §13(롤업) → §14(조회) → §15(배포) 순으로, 그 다음 §16(QA)이 "왜 지금 이 모양인가"를 채운다. 권한을 손대려면 §17부터.** P3는 도메인이 넷이라 필요한 것만 — SLO §18 · 합성 감시 §19 · 메시징/배치 §20 · 리포트 §21 · 위젯/AI/권한 §22 — 읽고, §23이 그 넷을 한 번에 흔든 QA다. FE 잔여 작업을 이어받는다면 §23-4 표부터. **P4는 §24(누가 지었고 무엇이 잡혔나) → §25(방어) → §26(수집·조회) → §27(K8s) 순**이고, §28은 P3 QA 2회차의 후기다. RUM을 손대기 전엔 §25-2(origin 정확 매칭)·§26-4(서버 집계에 안 섞는다) 두 결정을 먼저 받아들일 것.

또 하나 — 화면·차트 하나하나의 뜻은 `guides/apm-screen-chart-guide.md` **§2.12~§2.17**(P3 화면)·**§2.18**(P4 RUM·K8s)과 FAQ 17~24가 정본이다.
