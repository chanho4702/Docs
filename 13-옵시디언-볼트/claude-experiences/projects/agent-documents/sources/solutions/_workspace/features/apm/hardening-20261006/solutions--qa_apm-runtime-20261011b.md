# APM 런타임(행위) 검증 — 2026-10-11 b (오늘 커밋분)

- 환경: dev BE :3000(master, pid 3528, 13:03 기동 → `47d9443`(11:28 커밋) 포함, Flyway v75, DB 5433/dmove), FE Vite :5173(master, `4695584`·`892a9ef`·`f784219` 포함, 작업 트리 깨끗). 재기동 없음.
  - 참고: :5173에 Vite가 두 개 떠 있다(pid 45584 `--host 0.0.0.0`, pid 23476 `[::1]`, 10-10 22:18 기동). 둘 다 같은 `C:\solutions\moveseyee_fe` 작업 트리를 서빙하므로 코드는 같다.
- 업그레이드 상태: `apm_metric_rollup_state` stage 5·60 모두 `legacy_hold=true`, `legacy_cutover=2026-10-10 13:24:06Z`(KST 22:24:06). 기대 경계는 1m·5m=22:25 KST, 1h=23:00 KST.
- 방법: API는 Node fetch(쿠키 + `x-visitor-id`), 화면은 헤드리스 Chrome CDP(`shot.mjs`, 한 번에 하나)로 DOM 단언·네트워크 수집. ECharts 옵션(음영 markArea)은 React fiber의 `option` prop을 읽어 판정했다. **스크린샷 0장**.
- 계정: 임시 계정 `qa_tmp_admin`(user id **145**, `userRole=ADMIN`, platform DMOVE, Zabbix 미연동) + 임시 역할 25 `QA_TMP_APM_ADMIN`(역할 19 복제 + `apm` view·edit·download·delete=true). 관리 콘솔(adminOnly)과 내보내기 때문에 ADMIN으로 만들었다. 실제 admin 로그인은 하지 않았다.
- AI 서버(:3100)는 떠 있지 않았다. 항목 2는 **LLM 호출 없는 가짜 AI 서버**(scratchpad `mock-ai.mjs`, :3100)를 잠시 띄워 확인하고 바로 종료했다(실 LLM 비용 0).
- 정리(전부 완료): `home_widget` 11건(user 145, 서비스 상세 진입 시 자동 생성된 `apm_svc_*`) 삭제, `user` 145 삭제, `role` 25 삭제, Redis `REFRESH_SESSION_FAMILY:145` 삭제, 가짜 AI 서버(pid 19124) 종료. 확인: `qa_tmp%` 사용자 0, `QA_TMP%` 역할 0, user 145 위젯 0, :3100 LISTEN 0.

## 요약

| # | 항목 | 판정 |
|---|---|---|
| 1a | SLO 시계열 — 도입 이전 포함 기간 | **통과** |
| 1b | SLO 시계열 — 도입 이후만 | **통과** |
| 1c | SLO 목록·상세 행 `LEGACY_UNVERIFIED` | **통과**(burn null의 원인은 무트래픽과 구분 불가) |
| 1d | SLO 상세 화면 | **통과**(캘린더 업그레이드 당일 칸 툴팁만 **확인 불가**) |
| 1e | 내보내기 모달 경고·"X부터 받기" | **통과**(RED 1m·endpoints 둘 다) |
| 1f | 가용성 도입 이후 구간 | **통과**(시계열) / 24h 퍼센트는 **확인 불가** |
| 2 | AI 어시스턴트 첫 질문 → `?c=` | **통과**(가짜 AI 서버로) |
| 3 | 표 이중 요청(자산 목록·아카이브 파일) | **통과** |
| 4 | 수집기 토큰 도움말 queue_size·retry_max_elapsed | **통과** |

데이터 조건(공통 한계): SLO가 걸린 서비스(`moveseye-ai`·`moveseye-backend`, HIDDEN)와 `moveseye-be`는 도입 경계(10-10 22:25) 이후 요청이 0건이다(1m 마지막 수신: moveseye-be 10-08 20:59). 그래서 경계 이후의 **점·상태는 있지만 SLI 수치는 전부 null(requests=0)**이다. "값이 있다"는 "점이 존재하고 무트래픽으로 측정됨(requests 0, null 아님)"으로 판정했다. 실제 SLI 숫자가 그려지는지는 트래픽이 있는 서비스로 다시 봐야 한다.

---

## 1a·1b. `GET /apm/slos/{uid}/series` (BE `47d9443`)

경로는 FE `services/apm.api.ts:773` 기준. 롤업 적체가 풀린 뒤(13:24 KST) 재실행한 값이다.

| 검증 | 판정 | 근거 |
|---|---|---|
| 7일(자동 → step 2400, 1h 원천) | 통과 | 3개 SLO 모두 `untrustedBeforeMs`=**2026-10-10 23:00 KST**, 첫 점 23:00, 점 21개, `incompleteFromMs`=13:00(정상 꼬리), `errorBudgetTotal` null, `budgetRemainingPct` 전부 null. `step=60`을 줘도 보존 때문에 2400으로 승격되고 같은 결과다 |
| 24시간(step 300, 5m 원천) | 통과 | `untrustedBeforeMs`=**2026-10-10 22:25 KST**, 첫 점 22:25, 점 178개(22:25~13:10), `incompleteFromMs`=13:15, 예산 null |
| 경계 이후 점 | 통과(데이터 한계) | 점이 경계부터 끝까지 존재한다(이전에는 창 전체가 비었다). 각 점 `requests:0, measured:0, sliPct:null` — 무트래픽 |
| 6시간(도입 이후만, step 60) | 통과 | `untrustedBeforeMs` null, `incompleteFromMs` null, 점 361개(07:24~13:24). `errorBudgetTotal`은 null인데 요청 0건이라 예산 분모가 없는 경우다(잘림 때문 아님) |

🟡 관찰 1a-A(RT-3 결함 아님): 처음 호출(13:07)에는 `incompleteFromMs`가 **01:25 KST**(5m)·01:00(1h)였다. `apm_metric_rollup_dirty`에 stage 5 marker 119건(01:25~13:05, blocked 없음)이 쌓여 있었기 때문이다. BE가 13:04에 기동된 뒤 `apm_rollup`이 몇 회차에 걸쳐 따라잡아 13:24에는 2건(13:15~)만 남았다. 1m 원본은 03:00부터 계속 들어오고 있었으므로, **이전 BE 프로세스에서 01:25~13:04 동안 롤업이 돌지 않았던 것**으로 보인다(이전 프로세스 로그가 없어 원인은 확인하지 못함). 그동안의 화면은 뒤쪽을 "Aggregating" 음영으로 정확히 표시했다.

## 1c. SLO 목록·상세 행

| 검증 | 판정 | 근거 |
|---|---|---|
| 목록 `GET /apm/slos` | 통과 | 7개 SLO 전부 `unknownReason:"LEGACY_UNVERIFIED"`, `sliPct`·`errorBudgetTotal`·`budgetRemainingPct` null, `status:"UNKNOWN"`. 7일 창(시작 10-04)·30일 창(시작 09-11) 모두 경계 이전을 포함하므로 맞다 |
| 상세 `GET /apm/slos/068dffa9…` row | 통과 | 목록과 같은 값, `unknownReason:"LEGACY_UNVERIFIED"` |
| burn(1h·6h·5m·30m) | 판정 보류 | 전부 null, `burnCondition:"UNKNOWN"`. 6시간 창은 도입 이후지만 해당 서비스 요청이 0건이라 null이 정상이다. "검증됐고 값이 있는" burn은 트래픽이 없어 확인할 수 없다 |
| 화면 `/application-monitoring/slo?preset=7d` | 통과 | 행 7개. AI 가용성 7일 행: SLI 칸 "Includes pre-upgrade data", 예산 칸 "—"(Tooltip title = "The SLO period overlaps data from before the upgrade, which cannot be verified. …"), burn "— / —", 상태 "Not measured". 요청 `GET /apm/slos` code 200 |

## 1d. SLO 상세 화면 (FE `4695584`)

대상 `/application-monitoring/slo/068dffa9-cbbe-4d8e-8e56-80a6d24bf3e2`(AI 서버 가용성 7일).

| 검증 | 판정 | 근거 |
|---|---|---|
| `?preset=7d` SLI 추이 앞쪽 음영 | 통과 | 요청 `…/series?from=…&to=…&step=300` code 200. 차트 option `markArea`: `[{x:창 시작, name:"Not verified"},{x:1791640800000(10-10 23:00 KST)}]` + `[{x:1791669600000(07:00), name:"Aggregating"},{x:창 끝}]`(당시 롤업 적체 구간) |
| 안내 문구 | 통과 | SLI 추이·번다운 각주에 "Data before 2026. 10. 10. 오후 11:00:00 predates the upgrade and is not verified, so it is not shown — missing, not zero." + 뒤쪽 "Buckets from … onward are not drawn because their aggregation is not yet confirmed" |
| 번다운 숨김 + 안내 | 통과 | `apm-slo-burndown-withheld` 있음: "Part of the period is not confirmed, so the error budget is not calculated. A budget curve built from a truncated period would look different from reality, so it is not drawn. …" |
| 상단·게이지는 행 값 | 통과 | SLI "—" + `apm-slo-detail-sli-reason` "Includes pre-upgrade data", 예산 사용 "—", burn "— / —", 상태 "Not measured". 게이지 자리 `apm-slo-gauge-unknown`: "The remaining budget was not calculated" + LEGACY 설명 |
| `?preset=6h` | 통과 | markArea 없음, 각주에 미검증·미확정 문구 없음, `burndown-withheld` 없음(예산 null은 무트래픽). 상단·게이지는 7d와 같은 행 값("—"·LEGACY 사유) — 행은 화면 기간이 아니라 SLO 롤링 창을 따르므로 맞다 |
| 캘린더 업그레이드 당일 칸 툴팁 | **확인 불가** | 업그레이드는 10-10 22:24 KST이고 오늘(10-11) 0시는 경계 이후라 오늘 칸 `unknownReason`은 null(무트래픽 `requests:0`)이다. 10-10 칸은 스냅샷 행이 없다(서비스가 09-23 이후 무트래픽, 일간 창이 도입 이전을 포함). 측정 불가 칸 series는 0개였다. 업그레이드 직후 당일에 다시 봐야 한다 |
| 콘솔 예외 | 통과 | CDP `exceptionThrown` 0건. console.error는 기존 전역 경고(`key` prop spread)뿐 |

## 1e. 내보내기 모달

API(`GET /apm/exports/{dataset}/plan`, moveseye-be):

| 요청 | untrustedBeforeMs | incompleteFromMs | 비고 |
|---|---|---|---|
| red-series 1m, 3일 | 10-10 22:25 KST | 13:22(1m 수신 지연 꼬리) | notes 첫 줄 "2026-10-10T13:25:00Z 이전 구간은 집계를 검증할 수 없어 … 값을 비웠습니다." |
| red-series 1m, 6시간 | null | 13:22 | 앞쪽 안내 없음 |
| red-series 자동(5m), 7일 | 10-10 22:25 KST | 13:15 | — |
| endpoints 7일 | 10-10 22:25 KST | 13:15 | — |
| endpoints 6시간 | null | 13:22 | — |

화면:

| 검증 | 판정 | 근거 |
|---|---|---|
| RED 1m(서비스 상세 개요 `?preset=24h`, 해상도 "1 min") | 통과 | 계획 범위 "2026-10-10 13:17 ~ 2026-10-11 13:17", 1,440행. 경고 `apm-export-untrusted`(data-kind=`partial`) "Data before 2026-10-10 22:25 predates the upgrade and cannot be verified … Narrow the start time to 2026-10-10 22:25 or later to get values." + 버튼 "Export from 2026-10-10 22:25" |
| "X부터 받기" 클릭 → 재계획 | 통과 | 새 요청 `…/red-series/plan?from=1791638700000(22:25 KST)&…&step=60` code 200. 범위 "2026-10-10 22:25 ~ 2026-10-11 13:17", 892행, 경고 사라짐, `apm-export-narrowed` "The start time was narrowed to 2026-10-10 22:25. Restore original period". notes에서도 앞쪽 줄이 빠졌다 |
| 원래 기간으로 되돌리기 | 통과 | `apm-export-untrusted-restore` 클릭 → `from=1791605820000`으로 재계획, 경고·버튼 다시 표시 |
| endpoints(트랜잭션 탭 `?preset=7d`) | 통과 | 88행, 같은 경고·버튼. 클릭 → `from=1791638700000`, 범위 "2026-10-10 22:25 ~ …", 0행(경계 이후 무트래픽), 경고 사라짐 |

참고: 계획 `notes`는 영문 화면에서도 한국어이고 시각이 UTC ISO(`…13:25:00Z`)로 나온다. 타입 주석("사람이 읽는 안내(한국어)")대로라 결함으로 보지 않았다. 모달의 FE 경고는 로컬 시각으로 나온다.

## 1f. 가용성 `GET /apm/services/{uid}/availability`

| 검증 | 판정 | 근거 |
|---|---|---|
| 7일(step 300) 상태 구간 | 통과 | 13:24 재조회: `status 없음 10-04 13:24~10-10 22:24` → `STALE 10-10 22:29~10-11 13:19`(179칸). 도입 이전만 비고 이후는 끝까지 상태가 있다. (13:08 조회 때는 롤업 적체로 01:23~12:33이 비고 1m 꼬리 12:38~만 STALE — 관찰 1a-A와 같은 원인) |
| 24시간 | 통과 | 13:08 조회 때도 `없음 112칸`(경계 이전) → `STALE 176칸`(22:28~끝). 24h는 1m 꼬리로 덮어 읽어 롤업 적체 영향이 없었다 |
| 6시간 | 통과 | 72칸 전부 STALE |
| 세 서비스(be·ai·backend) | 통과 | 같은 모양 |
| 24h 퍼센트 `availability24hPct` | **확인 불가** | `GET /apm/services/overview` → moveseye-be `availability24hPct:null`, STALE. 24시간 창이 경계(10-10 22:25)를 포함하는 동안은 계약상 null이고, 서비스도 무트래픽이라 두 원인을 가를 수 없다. 10-11 22:25 KST 이후 + 트래픽 있는 서비스로 다시 봐야 한다 |

상태가 `UP` 같은 "값"이 아니라 `STALE`(수신 끊김)인 것은 서비스가 10-08 이후 안 보내서다. 판정 기준은 "도입 이후 칸에 status가 실렸는가"로 했다.

## 2. AI 어시스턴트 대화 주소 (FE `892a9ef`)

| 검증 | 판정 | 근거 |
|---|---|---|
| `/ai-assistant`(`?c=` 없음)에서 첫 질문 → URL에 새 대화 id | 통과 | 가짜 AI 서버가 `POST /ai/conversations` → id `qa-mock-conv-0001`을 돌려주게 했다. 질문 전송 후 URL이 `/ai-assistant` → **`/ai-assistant?c=qa-mock-conv-0001`**로 바뀌었다. 서버 로그 순서: `POST /ai/conversations` → `POST /ai/conversations/qa-mock-conv-0001/messages`(body `{"message":"QA 주소 동기화 확인","route":"/ai-assistant"}`) → 목록 재조회. 화면에 사용자 질문과 "mock reply"가 남았다 |
| 주소 변경이 대화 재선택을 부르지 않음 | 통과 | URL 반영 뒤 `GET /ai/conversations/{id}` 호출이 없었다(재선택 루프 없음) |

한계: 실제 AI 서버·LLM은 쓰지 않았다(비용 0). FE의 주소 동기화 로직만 검증한 것이다. 새로고침 후 대화 복원(`?c=`로 진입 → `GET /ai/conversations/{id}`)은 따로 보지 않았다.

## 3. 표 이중 요청 (FE `f784219`)

| 검증 | 판정 | 근거 |
|---|---|---|
| `/asset/list`(limit 없음) | 통과 | URL `?offset=0&limit=20`, 행 20개, 페이지 크기 "20 / page". `/assets` 목록 요청은 **1번**: `GET /assets?offset=0&limit=20&searchField=name&includeExcluded=false` code 200(+ `/assets/summary`). 직전 QA(1b-A)의 limit 20 + limit 10 두 번 요청이 사라졌다 |
| 관리 콘솔 데이터 아카이브 파일 탭 `/setting/data-archive`(limit 없음) | 통과 | URL `?offset=0&limit=50`. `/archives` 요청은 **1번**: `GET /archives?includeDeleted=false&page=1&limit=50` code 200. 파일 0건이라 빈 상태("No data") |

## 4. 수집기 토큰 도움말 (FE `892a9ef`)

| 검증 | 판정 | 근거 |
|---|---|---|
| 발급 창 도움말 패널 목록 | 통과 | `/setting/apm/collectors?tab=tokens` → `apm-token-issue-open` 클릭 → 창 제목의 `apm-help-col_issue` 클릭. `apm-help-options` 항목 14개 중 9·10번째가 "Queue size (batches) — how long the Collector holds out without the server", "Retry budget (minutes) — how long one batch keeps being retried"(폼 순서대로 memory_limit 다음, queue_dir 앞) |
| 본문 | 통과 | 펼치면 `apm-help-option-apm.collectors.option_help.queue_size`: "What it is: the maximum number of batches … Default: 10000. Allowed 1000–200000. …", `…retry_max_elapsed`: "What it is: how many minutes the Collector keeps retrying … Default: 30 minutes. Allowed 5–1440. …" |

토큰은 발급하지 않았다(창만 열고 닫음).

## 공통 — 콘솔
- 예외(`exceptionThrown`) 0건. console.error는 기존 전역 경고(`key` prop spread), 관리 콘솔의 `[antd: Tabs] destroyInactiveTabPane is deprecated`, "There may be circular references" 1건(아카이브/콘솔 구간, 기존 경고로 보임)뿐이다.

## 재현 도구(scratchpad, 일회성)
`C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\e05d80c9-f57f-4b0d-a549-a1c837b68a1b\scratchpad\rt3b\`
- `login.mjs`(로그인·쿠키), `get.mjs`(GET 헬퍼, Git Bash에서는 `MSYS_NO_PATHCONV=1` 필요)
- API: `a1.mjs`(SLO 시계열), `a2.mjs`(SLO 상세·캘린더), `a3.mjs`·`a4.mjs`(가용성), `a5.mjs`(overview 24h), `a6.mjs`(내보내기 계획)
- 화면: `s1.mjs`(SLO 상세), `s2.mjs`(내보내기 모달), `s3.mjs`(SLO 목록·자산·아카이브·토큰 도움말·AI) → `node gen.mjs admin sN.mjs pN.json && node shot.mjs pN.json > rN.json && node show.cjs rN.json`
- `mock-ai.mjs`(LLM 없는 가짜 AI 서버, 항목 2 전용)
- 임시 계정은 삭제했으므로 재실행하려면 계정을 다시 만들어야 한다(이 보고 상단 절차).
