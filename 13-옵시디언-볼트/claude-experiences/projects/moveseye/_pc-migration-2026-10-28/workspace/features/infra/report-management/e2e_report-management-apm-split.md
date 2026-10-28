# functional-qa — 리포트 관리 APM 탭 분리 + APM 전용 보존 설정 (report-management-apm-split)

- 작성: functional-qa / 2026-09-22 · 런타임 실측(BE 워크트리 :3001 + FE 워크트리 Vite :5174 + dev DB 5433)
- 입력: [`features/infra/report-management/contract_report-management-apm-split.md`](contract_report-management-apm-split.md) §5 + [`features/infra/report-management/qa_report-management-apm-split.md`](qa_report-management-apm-split.md)의 "functional-qa로 넘길 때 전달 사항"
- 대상 코드: BE `C:/worktrees/report-apm-be`(브랜치 `report-apm-split`, master `baed6ee` 위 미커밋) · FE `C:/worktrees/report-apm-fe`(브랜치 `report-apm-split`, master `d47c0a5` 위 미커밋). 🔴 두 워크트리·두 master 트리 모두 **수정하지 않았다**.
- 검증 수단: curl(admin 쿠키 + `x-visitor-id`) · `docker exec … psql` · 헤드리스 Chrome CDP(`_tools/headless-shot/cdp-shot.mjs`, DOM 어서션·`performance` 리소스 엔트리로 네트워크 확인). 스크린샷은 판정에 쓰지 않았다(DOM으로 전부 판정 가능).
- 재현 스크립트(scratchpad, 일회성): `run_be_3001_report.ps1`, `api_test.sh`(+ `*.json` body), `mkplan2.mjs`·`mkplan4.mjs`(CDP 플랜 생성) — `C:/Users/DMOVE/AppData/Local/Temp/claude/C--solutions/039051be-9dba-4d6d-ba0f-6b67d4ef1cda/scratchpad/`

---

## 0. 기동 로그 요약

| 항목 | 결과 |
|---|---|
| 기동 전 `report_retention_setting` | 열 5개(`id, enabled, week_retention_weeks, month_retention_months, updated_at`) — **`apm_*` 열 없음**(정적 QA 🟢B의 "수동 열 선존재" 우려 해소). **행 0건**(시드 미적용 상태). Flyway 최신 `65 apm revoked token retention` |
| BE :3001 기동 | `Set-Location C:\worktrees\report-apm-be` · `.env` UTF8 · `JAVA_HOME=jdk-17` · `PORT=SERVER_PORT=3001` · `--no-daemon` · dev 프로필(5433) |
| Flyway | `Current version of schema "public": 65` → `Migrating schema "public" to version "66 - report retention setting apm"` → `Successfully applied 1 migration to schema "public", now at version v66 (execution time 00:00.063s)` |
| Started | `Tomcat started on port 3001` · `Started MoveseyeApplication in 99.886 seconds` |
| 기동 후 테이블 | `apm_enabled boolean NOT NULL DEFAULT true` · `apm_week_retention_weeks integer NOT NULL DEFAULT 52` · `apm_month_retention_months integer NOT NULL DEFAULT 24` 추가, 기존 5열 불변. `flyway_schema_history` 66 `success=t` |
| FE Vite | `VITE_API_URL=http://localhost:3001` 프로세스 env로 주입(워크트리에 `.env` 없음 — 파일 생성 안 함) · `npx vite --host 0.0.0.0 --port 5174` → 로그 `Local: http://localhost:5174/`(auto-increment 없음, CORS 허용 범위 안) |
| 로그인 | `POST /auth/login` admin/<dev-pw> → 200, `userRole: ADMIN`, 쿠키 `accessToken`·`refreshToken` |
| :3000 | 건드리지 않음(검증 내내 LISTENING 유지, 종료 후에도 8872 그대로) |

---

## A. API 실측 (curl → :3001)

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| A1 | `GET /admin/reports/retention/apm` → 200, data 3필드 | ✅ | `{"status":"success","code":200,"data":{"enabled":true,"weekRetentionWeeks":52,"monthRetentionMonths":24}}` (행 0건 → 기본값, §2.1) |
| A1 | `GET /admin/reports/retention` 응답에 `apm*` 없음 | ✅ | `data:{"enabled":true,"weekRetentionWeeks":52,"monthRetentionMonths":24}` — 키 3개뿐 |
| A2 | `PUT /admin/reports/retention/apm {false,26,12}` → 저장값 반환 | ✅ | 응답 `data:{"enabled":false,"weekRetentionWeeks":26,"monthRetentionMonths":12}`. BE 로그 `Report retention(APM) updated: enabled=false week=26 month=12`. DB: `id=1 | enabled=t | 52 | 24 | apm_enabled=f | 26 | 12`(행이 없던 상태에서 upsert — 호스트 그룹 열은 기본값으로 생성) |
| A2 | 이어 `GET /admin/reports/retention` 불변 | ✅ | `{"enabled":true,"weekRetentionWeeks":52,"monthRetentionMonths":24}` — PUT 전과 동일 |
| A2 | 원상복구 | ✅ | 아래 §D |
| A3 | `PUT … {weekRetentionWeeks:0}` → HTTP 200 + body 400 `INVALID_DATA` | ✅ | `HTTP 200` · `{"status":"error","code":400,"errorCode":"INVALID_DATA","message":"입력값을 확인해 주세요."}` |
| A4 | 비관리자 → 200 + code 403 `FORBIDDEN` | **미확인** | 5433 시드의 USER 계정(`Admin`·`guest`·`chanho`)은 비밀번호 불일치(`WRONG_USER_OR_PASSWORD`), 계정 생성 금지 지시라 실측 불가. 정적 QA #4(`ReportAdminAccess.require` 경로 동일) + IT `ReportRetentionApmIT.getDeniedForPlainUser`/`putDeniedForPlainUser`(BE 통보 6: 실 PostgreSQL 통과)로 대체. 참고: 쿠키 없이 GET → **HTTP 401** `{"status":"error","code":401,"message":"INVALID_TOKEN"}`(인증 게이트는 살아 있음) |
| A5 | `GET /admin/reports?type=APM` 행 `type` 전부 APM | ✅ | `total 2, items 2, types ["APM"]`, `groupId/groupName` 전부 null, 샘플 `{"id":2,"type":"APM","groupId":null,"groupName":null,"title":"APM 주간 리포트 (2026-09-14 ~ 2026-09-20)","periodType":"WEEK",…,"hostCount":4}` |
| A5 | `GET /admin/reports?type=HOST_GROUP` 행 `type` 전부 HOST_GROUP | ✅ | `total 117, items 100(limit 상한), types ["HOST_GROUP"]`. 참고 `type` 없이 → `total 119 = 117 + 2`(두 계열 밖 행 없음 — 오케스트레이터 답변 1 실측 확인) |
| A6 | DB `apm_*` 3열이 기존 값 복사로 채워졌는지 | ✅ 열 · **복사는 검증 대상 없음** | 열 3개·NOT NULL·DEFAULT(true/52/24)는 위 §0. 그러나 dev DB는 V66 적용 시점에 **행이 0건**이라 `UPDATE … WHERE id = 1`이 복사할 대상이 없었다(0 rows affected). 값 복사 자체는 BE IT(`ReportRetentionApmIT`, BE 통보 6)에만 근거한다 — 실 업그레이드 설치본(행 있음)과 동일 조건은 dev에서 재현되지 않았다 |

---

## B. 화면 실측 (헤드리스 Chrome, `/setting/report-management`)

> 헤드리스 UI는 영문(메모리 규칙)이라 라벨은 en.json 값으로 판정했다(`Host group reports`/`APM reports`/`Auto-deletion Policy`/`APM report auto-deletion`/`N hosts`/`N services`). 네트워크는 `performance.getEntriesByType('resource')`에서 `/admin/reports*`만 추린 것(첫 로드는 Vite 모듈 수백 건으로 버퍼(250)가 차서 비신뢰 → 첫 로드 뒤 버퍼 5000으로 키우고 `pushState`+`popstate` 인앱 이동/탭 클릭으로 측정).

| # | 항목 | 판정 | 근거(DOM/네트워크) |
|---|---|---|---|
| B1 | 탭 2개 렌더, 기본 호스트 그룹 탭 | ✅ | `tabs:["Host group reports","APM reports"]`, `active:"Host group reports"`, 카드 제목 `["Report Management","Auto-deletion Policy","Saved Reports"]` (직접 진입·인앱 진입 둘 다) |
| B1 | `?tab=apm` 진입 시 APM 탭 활성 | ✅ | 직접 로드 `url:"/setting/report-management?tab=apm&offset=0&limit=10"`, `active:"APM reports"`, 카드 제목 `"APM report auto-deletion"`. 인앱 `pushState`로도 동일 |
| B2 | APM 탭 진입 시 `/retention/apm` **1회** | ✅ | 탭 클릭 직후 `api:["/admin/reports/retention/apm","/admin/reports?type=APM&offset=0&limit=10"]`(1회). 직접 로드에서도 `/retention/apm` 1회 + 목록 2회(`limit=20` 선조회 + `limit=10` — 기존 표 페이지네이션 동작, 이 기능 변경 아님) |
| B2 | APM 목록 요청에 `groupId` 부재 | ✅ | URL에 `groupId=5`가 남은 상태에서 APM 탭 클릭 → `/admin/reports?type=APM&offset=0&limit=10`(groupId 없음). 호스트 그룹 탭은 `/admin/reports?groupId=5&type=HOST_GROUP&periodType=WEEK&…` |
| B2 | 호스트 그룹 탭에서 `/retention/apm` 미호출 | ✅ | 호스트 그룹 탭 마운트 3회(첫 로드·되돌아오기 2회) 모두 `/retention/apm` 0회. 신선 마운트 시 `api:["/admin/reports/retention","/admin/reports?type=HOST_GROUP&offset=0&limit=10"]`; 캐시 적중 시 `api:[]` |
| B3 | APM 탭: 그룹 열·계열 필터 없음, 단위 "서비스", 타입 태그 열 없음 | ✅ | `ths:["","Report","Period type","Period","Targets","Created at"]`(Group 없음), `selects:["Period type","10 / page"]`(그룹·계열 셀렉트 없음), 행 `["","APM weekly report (2026-09-14 – 2026-09-20)","Weekly","2026-09-14 ~ 2026-09-20","4 services","2026-09-21 10:10:00"]`, `tags:0`. 2행 모두 APM |
| B3 | 호스트 그룹 탭: 그룹 열 있음, APM 행 없음 | ✅ | `ths:["","Report","Group","Period type","Period","Targets","Created at"]`, `selects:["Group","Period type","10 / page"]`, 10행 전부 `N hosts`(예 `"MovesEye APM","MovesEye APM","Weekly",…,"1 hosts"` — 호스트 그룹 이름이 "MovesEye APM"인 HOST_GROUP 행이지 APM 행이 아님, `type=HOST_GROUP` 목록 응답과 일치), `tags:0` |
| B4 | APM 보존 폼 저장 → 성공 토스트 → 호스트 그룹 값 불변(화면·API) | ✅ | 폼 초기 `enabled:false week:26 month:12`(A2 값) → 폼 스위치 `form button#enabled` 클릭 + 주 입력 `30` 타이핑 → `enabled:"true" week:"30"` → Save → 토스트 `"The auto-deletion policy has been saved."`, `api:["/admin/reports/retention/apm"(PUT),"/admin/reports/retention/apm"(무효화 재조회)]`. BE 로그 `Report retention(APM) updated: enabled=true week=30 month=12`. 호스트 그룹 탭 폼 `enabled:"true" week:"52" month:"24"`(불변), API `GET /retention` `{true,52,24}`(불변), DB `enabled=t 52 24 / apm_enabled=t 30 12`. APM 탭 재방문 `true/30/12` 유지 |
| B5 | 탭 전환 시 URL에서 `offset`·`periodType`·`groupId` 제거 | ✅ | 전 `?offset=0&periodType=WEEK&groupId=5&limit=10` → APM 탭 클릭 후 `?limit=10&tab=apm&offset=0`(`periodType`·`groupId` 제거, `offset`은 제거 뒤 표 페이지네이션이 `offset=0&limit=10`을 다시 채움 — 다른 계열 오프셋이 남지 않는다는 목적 충족). 되돌아오기 `?limit=10&tab=host-group&offset=0`. 옛 `type=APM_WEEKLY`도 제거됨(정적 QA D) |
| B6 | 라이선스 없을 때 `?tab=apm` → 호스트 그룹으로 접힘 | **미확인(정적 테스트로만)** | dev 라이선스 `GET /features` → `edition:"PREMIUM", features:["APM","DB_MONITORING","GPU_MONITORING"]`이라 APM 탭이 항상 보이고, 라이선스를 끌 수 없다. `ReportManagement.test.tsx` 게이팅 3건(정적 QA #10)에만 근거 |
| B7 | 콘솔: `destroyInactiveTabPane` 경고 없어야 함 | ✅ | 4회 실행 콘솔 전량에 `destroyInactiveTabPane` 0건. `ReportManagement.tsx`는 `destroyOnHidden` 사용 확인 |
| B7 | 그 밖의 경고/에러 | 🟢 기록 | 아래 결함 목록 🟢1·🟢2 — 전부 이 기능 밖에서 오는 기존 경고 |

---

## C. 스케줄러 문자열 (`deleted=N hostGroup=n apm=n`)

| 항목 | 판정 | 근거 |
|---|---|---|
| 실행 이력 | **이력 없음** | `GET /settings/schedulers/report_cleanup/logs?limit=5` → `data:[]`; `scheduler_run_log`에 `report_cleanup` 0건(dev에서 한 번도 안 돌았음). 배치는 지시대로 실행하지 않았다 |
| 형식(코드) | ✅ | `ReportSchedule.cleanupReports` 반환 `"deleted=" + total + " hostGroup=" + n + " apm=" + n`; `BuiltInJobs.summarizingCleanupJob`은 문자열을 가공하지 않고 그대로 `summary`(varchar 500)에 넣는다 |
| 표 렌더 | ✅(코드+화면) | 설정 › 스케줄러 표 `tableLayout:"fixed"` 확인, "Report cleanup" 행 존재(`Daily at 04:00`, `No history`). 마지막 실행 열(폭 280)은 `Typography.Text ellipsis={{tooltip}}`(`SchedulerManagement.tsx:181-187`)라 문자열이 길어도 줄바꿈이 아니라 말줄임+툴팁; 실행 이력 목록(`SchedulerRunLogList.tsx:50-55`)은 폭 제한 없는 마지막 열에 그대로 출력. 실측 문자열이 없어 "깨지지 않음"은 렌더 규칙으로만 판정 |

---

## D. 종료 정리

| 항목 | 결과 |
|---|---|
| 보존 값 원상복구 | `PUT /retention/apm {true,52,24}` → 응답 `{true,52,24}`; `GET /retention/apm` `{true,52,24}` · `GET /retention` `{true,52,24}` — 시작 시 API 응답과 동일 |
| DB 행 | 시작 시 **0건**이었으므로 검증 중 upsert된 `id=1` 행을 `DELETE … WHERE id=1`로 제거(→ 0건). 제거 후 `GET /retention/apm`·`GET /retention` 둘 다 기본값 `{true,52,24}`(행 없음 → `defaults()` 경로 실 DB 확인). **:3000(옛 코드)** `GET /admin/reports/retention` → 200 `{true,52,24}` — V66 적용 DB에서 옛 코드 정상 |
| V66 | dev DB에 적용된 채로 둠(`flyway_schema_history` 66 success=t, 되돌리지 않음) |
| 프로세스 | 종료: java 24592(앱)·37720(gradlew 클라이언트)·cmd 40248/24640·node 14508/34660(Vite). 종료 후 LISTENING: `:3000`(8872, 그대로)·`:5173`(9616, 타 세션) — `:3001`·`:5174` 없음 |
| 워크트리·master | 파일 변경 0(FE 워크트리에 `.env` 생성 안 함, Vite env는 프로세스 환경변수로만) |

---

## 결함 목록

| # | 심각도 | 책임 | 내용 | 재현 | 비고 |
|---|---|---|---|---|---|
| 🟢1 | 참고 | FE(기존) | 콘솔 `Warning: [antd: InputNumber] addonAfter is deprecated. Please use Space.Compact instead.` — `RetentionSettingForm.tsx`의 `InputNumber addonAfter`. master 파일에도 같은 2곳이 있어 **이 기능이 새로 만든 경고가 아님** | `/setting/report-management` 로드 → 콘솔 | 정리하려면 별도 커밋(두 폼 공통 컴포넌트라 한 곳 수정) |
| 🟢2 | 참고 | FE(기존·앱 전역) | 콘솔 `A props object containing a "key" prop is being spread into JSX`(antd Tabs/rc-tabs + React 19, 앱 내 `<Tabs` 사용 31개 페이지 공통) · React Router v7 future flag 경고 · `[antd: message] Static function can not consume context` · `[antd: Table] dataSource length is less than pagination.total…`(목록 표 `limit=20` 선조회 — 기존 동작) · 스케줄러 화면 `[antd: Modal] destroyOnClose is deprecated`(`SchedulerEditModal` 등 이 기능 밖) | 위와 동일 | 결함으로 다루지 않음. `destroyInactiveTabPane` 경고는 **없음** |
| 🟢3 | 참고 | BE | A6 값 복사(`UPDATE … WHERE id=1`)는 dev DB에 행이 없어 **실측되지 않았다**. 업그레이드 설치본 동작은 IT `ReportRetentionApmIT`에만 근거 | 행이 있는 DB에서 V65→V66 적용 | 배포 전 스테이징(행 있는 DB)에서 한 번 확인 권장 |
| 🟢4 | 참고 | BE | 두 폼이 한 행을 공유하므로 APM 저장이 `updated_at`도 갱신한다(`14:29:48` APM 저장 시 행 `updated_at` 변경). 화면·API에 노출되지 않아 영향 0 | A2/B4 | 계약 §1 "같은 단일 행" 설계의 자연스러운 결과 |

🔴 0 · 🟡 0 · 🟢 4 · 미확인 2(A4 비관리자 403 — 계정 없음 / B6 라이선스 없음 — 끌 수 없음, 둘 다 정적 테스트·IT로 대체)

---

## 종합 판정

**통과.** 계약 §2(새 EP 2개·기존 EP 불변)·§1(V66 열·기본값·기존 열 보존)·§4(탭·URL·목록 계열 고정·`groupId` 차단·보존 폼 독립)가 dev 런타임에서 **값 수준으로** 확인됐다. 호스트 그룹 보존값은 APM 저장 전후로 API·DB·화면 모두 불변이고, 탭 전환은 다른 계열의 파라미터를 남기지 않으며, `/retention/apm`은 APM 탭에서만 정확히 1회 나간다. 결함은 🟢 4건뿐이고 그중 콘솔 경고 2건은 이 기능 밖의 기존 경고다. 남은 공백은 비관리자 403(계정 부재)과 라이선스 부재 접힘(끌 수 없음)으로, 각각 IT/jest로만 덮인다 — 커밋을 막을 사유는 아니다.

정리 완료: :3001·:5174 종료, 보존 값 원복(행 0건으로 복귀), V66 유지, 워크트리·master 무변경.

---

## 2차 재실측(코덱스 반영 후)

- 작성: functional-qa / 2026-09-22 15:40~16:12 · 코덱스 검수 반영(BE R1~R6 + v2, FE R1~R5 + v2, **FE v3 일부**)으로 **바뀐 부분만** 재실측. 1차와 같은 구성(BE 워크트리 :3001 + FE 워크트리 Vite :5174 + dev DB 5433 + 헤드리스 Chrome CDP). 워크트리·master **무수정**.
- 측정 대상 코드: BE `C:/worktrees/report-apm-be`(master `baed6ee` 위 미커밋 13파일). FE `C:/worktrees/report-apm-fe`(master `d47c0a5` 위 미커밋) — 🔴 **실측 도중 다른 세션이 FE 워크트리를 편집하고 있었다**(`RetentionSettingForm.tsx` 15:49~15:50, `ReportManagement.tsx` 15:50~15:57, Vite HMR 7회 — 요청서에 아직 없는 **v3 검수**(`review_…-fe-v3_codex.md` 15:46) 반영으로 보인다). 그래서 15:48 병렬 1회차(편집 중 화면 미렌더)는 **폐기**하고, 파일이 멈춘 뒤(15:57:14 이후) 다시 돌렸다. 아래 FE 판정은 전부 **md5 `ReportManagement.tsx 517932cc…` / `RetentionSettingForm.tsx 539497ba…` / `ReportListTable.tsx beffa4e4…`** 상태의 코드다(코드가 또 바뀌면 이 절은 그 시점 판정이다).
- 재현 스크립트(scratchpad): `run_be_3001_report2.ps1`(1차 스크립트 + Flyway validate 우회 1줄, 아래 🟡1), `api_test2.sh`(→ `api_test2.out`), `race.mjs`(정밀 경합), `mkplan5.mjs` → `plan5_p1~p5.json`/`.out`.

### 0. 기동

| 항목 | 결과 |
|---|---|
| 시작 상태 | `report_retention_setting` **행 0건**(1차 종료 상태 그대로), `flyway_schema_history` 66 `success=t` |
| BE :3001 1차 시도 | **기동 실패** — `FlywayValidateException: Migration checksum mismatch for migration version 66 → Applied to database: 277040461 / Resolved locally: 317686038`. 원인: 코덱스 **R4 반영이 V66 SQL의 주석을 고쳐** 파일 체크섬이 바뀌었는데, dev DB에는 1차 기동(14:20) 때의 옛 체크섬이 기록돼 있다. 아래 결함 🟡1 |
| BE :3001 2차 시도 | 이번 기동에만 `SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false`(프로세스 env, 코드·DB 무변경) → `Current version of schema "public": 66` → **`Schema "public" is up to date. No migration necessary.`**(V66 재적용 없음) → `Tomcat started on port 3001` · `Started MoveseyeApplication in 52.083 seconds` |
| FE Vite | `VITE_API_URL=http://localhost:3001` 프로세스 env · `Local: http://localhost:5174/` |
| 로그인 | admin/<dev-pw> → 200. ⚠️ 15:46 로그인 세션이 **~15:52에 외부 요인으로 무효화**됐다(같은 쿠키로 `GET /retention/apm` → 401 `INVALID_TOKEN`; 계정당 세션 1개 정책(ZM-157)이라 다른 세션의 admin 로그인으로 추정 — 이쪽 BE 로그엔 로그인 1회뿐). 15:59 재로그인 후 FE 플랜을 다시 돌렸다 |
| :3000 | 시작 시 LISTENING(pid 10856, 사용자 세션) → 종료 시 내려가 있음. **건드리지 않음** |

### A. BE(API) 재실측

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| A1 | 동시 저장 잠금 — `PUT /retention`·`PUT /retention/apm` 동시(백그라운드 curl 2개 + `wait`) ×10 | ✅ | 회차마다 값을 바꿔(hg `40+i/20+i`, apm `26+i/12+i`) 보냈고 **10/10 회차 양쪽 GET이 각자 마지막 값**(예: 10회차 hg `{true,50,30}` · apm `{false,36,22}`, DB `1|t|50|30|…|f|36|22`). 응답 전부 HTTP 200·22~81ms |
| A1 | 정밀 경합(`race.mjs`: 같은 tick에 `fetch` 2개 → `Promise.all`) ×30 | ✅ | **30/30 OK · 30/30 겹침**(`max(start) < min(end)` — 클라이언트 관측 구간이 실제로 겹친 회차만 셈). lost update 0. BE 로그 `Report retention updated`/`(APM) updated` 라인이 `exec-1/2/3/5` 스레드로 교차 기록됨 |
| A1b | **첫 저장 경합**(회차마다 행 삭제 후 두 PUT 동시) ×10 | ✅ | 10/10 회차 DB 행 `t\|hw\|hm\|f\|aw\|am` 정확히 일치, 응답 전부 200. BE 로그 `duplicate key`/`DataIntegrityViolation` **0건**(`ON CONFLICT DO NOTHING` → 재잠금 경로가 실 DB에서 동작) |
| A2 | 행 없는 상태에서 `PUT /retention/apm {false,26,12}`만 먼저 → `GET /retention` 기본값 | ✅ | PUT 응답 `{false,26,12}` → `GET /retention` **`{true,52,24}`** · `GET /retention/apm` `{false,26,12}` · DB `1\|t\|52\|24\|…\|f\|26\|12`(호스트 그룹 열은 **열 기본값**으로 생성 — INSERT에 값을 안 적는 설계와 일치) |
| A3 | 스케줄러 이력 문자열(코드만, 배치 미실행) | ✅ | `ReportSchedule.java:76-79` `"deleted=" + total + " hostGroup=" + n + " apm=" + n`, **`other`는 0이 아닐 때만** `" other=" + n`; `:58` `Report cleanup done hostGroup={} apm={} other={}` 로그는 항상 `other` 포함 — 반영 기록 R2·R5와 일치. `ReportScheduleTest` 3건이 고정(코드 확인). 실행 이력은 여전히 0건(`scheduler_run_log` report_cleanup 없음) |

### B. FE(헤드리스, `/setting/report-management`) 재실측

> 라벨은 영문(헤드리스 UI 규칙). 네트워크는 `performance` 리소스 엔트리에서 `/admin/reports*`만(`clearPerf` 뒤 측정). 5중 병렬 콜드 로드는 폼 표시까지 30~50초가 걸려 P1·P3·P4는 **단독/2중으로 재실행**한 값이다.

| # | 항목 | 판정 | 근거(DOM/네트워크) |
|---|---|---|---|
| B1 | `?tab=`(빈 값) → `tab=host-group`으로 **replace** | ✅ | `/__blank__`에서 `history.length=2` → `?tab=` 진입 후 `url:"/setting/report-management?tab=host-group&limit=10&offset=0"`, `hist:3`(진입 1건만 증가) → `history.back()` **한 번에 `/__blank__`**(`hist:3` 불변) — 정규화가 항목을 쌓지 않았다 |
| B2 | 호스트 그룹→APM 클릭→**뒤로가기** → 호스트 그룹 복귀(push) | ✅ | 클릭 후 `url:"?tab=apm&limit=10&offset=0"`, **`hist:3→4`**, `api:["/admin/reports/retention/apm","/admin/reports?type=APM&offset=0&limit=10"]` → `back()` → `active:"Host group reports"`, `url:"?tab=host-group&offset=0&limit=10"`(폼 `130/80` 즉시, 캐시) → `forward()` → `active:"APM reports"` `url:"?tab=apm…"` |
| B3-① | dirty 후 **탭 클릭** → 확인창 / 취소 → 유지 / 확인 → 이동 | ✅ | 주 `46→31` 타이핑 → `Host group reports` 클릭 → `.ant-modal-confirm` **1개**, 제목 `"You have unsaved changes"`, 버튼 `["Cancel","Leave"]`, `active:"APM reports"` `url:…tab=apm…`(이동 안 됨) → **Cancel** → `modals:0`, `active:"APM reports"`, **`week:"31"` 유지**, url 불변 → 다시 클릭 → 확인창 재표시 → **Leave** → `active:"Host group reports"`, `url:"?tab=host-group&limit=10&offset=0"`, `hist:3→4` |
| B3-② | dirty 후 **브라우저 뒤로가기** → 확인창 / 취소 시 URL `tab=apm` 복구 | ✅ | APM 탭에서 주 `46→32` → `history.back()` → `modals:1`(같은 제목·버튼), **`url:"?tab=apm&limit=10&offset=0"`**(라우터가 URL을 먼저 되돌린 뒤 막음), `week:"32"` → **Cancel** → `modals:0`, `active:"APM reports"`, `url` 그대로 `tab=apm`, `week:"32"`, `hist:5` 불변 → 다시 `back()` → 확인창 → **Leave** → `active:"Host group reports"` `url:…tab=host-group…` |
| B4 | GET 실패 UI — 폼 대신 오류 Alert+재시도, 저장 버튼 없음, 재시도 시 폼 | ✅ | 호스트 그룹 탭에서 `XMLHttpRequest.open`/`fetch`를 패치해 `/admin/reports/retention/apm`만 닫힌 포트(`localhost:1`)로 돌린 뒤 APM 탭 클릭 → 가로채기 **2회**(원 요청 + react-query 재시도 1회) → `alerts:[{type:"ant-alert-error",msg:"Could not load the retention settings.",btns:["Try again"]}]`, **`formPresent:false`, `saveBtn:null`**, 목록은 정상 요청(`/admin/reports?type=APM…`) → 패치 해제 + **Try again** → `formPresent:true` `46/19`, `alerts:[]`, `api:["/admin/reports/retention/apm"]`(1회) |
| B5 | 원격 충돌 — dirty 상태에서 외부 PUT 뒤 재조회 → 충돌 Alert(새로 불러오기/내 입력 유지) | ✅ | 주 `46→33`(dirty) → 페이지 컨텍스트 `fetch`로 `PUT /retention/apm {true,45,18}`(200; curl과 동일한 외부 변경) → **62초 대기(staleTime 60s) 후 `visibilitychange` 발화** → `/retention/apm` 재조회 실제 발생 → `alerts:[{type:"ant-alert-warning",msg:"These settings were changed elsewhere",btns:["Reload values","Keep my input"]}]`, **`week:"33"` 유지**(덮지 않음) → **Keep my input** → `alerts:[]`, `week:"33"` → 두 번째 외부 PUT `{true,46,19}` + `queryClient.invalidateQueries()`(React fiber에서 client를 찾아 호출) → 충돌 Alert 재표시(기준값이 45/18로 옮겨져 46/19와 달라짐) → **Reload values** → `week:"46" month:"19"`, `alerts:[]` |
| B6 | APM 제목 링크 — `href`·SPA 이동 1회·Ctrl+클릭 주소 불변 | ✅ | `hrefs:["/setting/report-management/apm?id=2","/setting/report-management/apm?id=1"]`(= `apmReportDetailPath`). `window.__qaMarker='alive'` 심고 `a.click()` → `url:"/setting/report-management/apm?id=2"`, **`hist:3→4`(정확히 1회 — 행 `onClick` 이중 이동 없음)**, `marker:"alive"`·`navigation` 엔트리 1(전체 새로고침 없음), 상세 `h3:["APM Report","APM weekly report (2026-09-14 – 2026-09-20)",…]` → `back()` → 목록(`rows=2`) → `MouseEvent(click,{ctrlKey:true})` → **`url` 불변**, `hist:4` 불변, `marker:"alive"` |
| B7 | 콘솔 | ✅(신규 1건 🟢2) | 플랜 5개 전량: `key` prop spread(antd Tabs, 6)·`InputNumber addonAfter`(6)·React Router future flag(6) — 전부 1차 기록 그대로. **새로 보인 것 1건**: `[antd: Modal] Static function can not consume context like dynamic theme`(B3의 `Modal.confirm`) — 아래 🟢2. `destroyInactiveTabPane` 0건, 예외 0건 |

### C. 종료 정리

| 항목 | 결과 |
|---|---|
| 보존 값 원상복구 | 시작이 **행 0건**이었으므로 검증 중 생긴 `id=1` 행(`t\|130\|80\|…\|t\|46\|19`)을 `DELETE`(→ 0건). 이후 `GET /retention` **`{true,52,24}`** · `GET /retention/apm` **`{true,52,24}`** — 시작 시 응답과 동일 |
| V66 | `flyway_schema_history` 66 `success=t` 유지(재적용·repair 없음, 체크섬 행 그대로 — 🟡1 참조) |
| 프로세스 | `taskkill /T`: java 36712(앱)+36468, node 21816(Vite)+31416. 부모 9008·36264 소멸 확인. 헤드리스 Chrome(포트 9341~9345·9351) 0. 종료 후 LISTENING: `:5173`(12108, 타 세션)뿐 — **`:3001`·`:5174` 없음**, `:3000` 없음(사용자가 내린 상태). 남아 있는 `node tsc --noEmit`·`eslint …ReportManagement.tsx`(FE 워크트리)는 **타 세션 것이라 두었다** |
| 워크트리·master | 파일 변경 0(이 세션 기준). FE 워크트리는 위와 같이 **타 세션이 편집 중** |

### 결함 목록(2차)

| # | 심각도 | 책임 | 내용 | 재현 | 비고 |
|---|---|---|---|---|---|
| 🟡1 | 운영 차단(dev) | BE(코덱스 R4 반영 부수효과) + 병합 절차 | **V66 체크섬 드리프트**: R4가 `V66__report_retention_setting_apm.sql`의 주석을 고쳐 체크섬이 `277040461→317686038`로 바뀌었다. V66을 R4 **이전** 파일로 적용한 DB(지금은 dev 5433 — 1차 14:20 적용)에서는 이 워크트리든 병합 후 master든 **기동이 Flyway validate에서 실패**한다. 새 설치본·V66 미적용 DB는 무관(운영 출하 전) | `run_be_3001_report.ps1` 그대로 기동 → `BUILD FAILED` + `Migration checksum mismatch for migration version 66` | 병합/다음 기동 전에 dev DB에서 `flyway repair`(또는 `update flyway_schema_history set checksum=317686038 where version='66'`) 1회. 🔴 **V66 파일은 이제 고정**(주석 한 글자도) — 또 바꾸면 같은 일이 반복된다. 이번 실측은 `SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false`로 우회했고 DB는 손대지 않았다 |
| 🟢2 | 참고 | FE(이 기능) | 콘솔 `[antd: Modal] Static function can not consume context like dynamic theme` — `ReportManagement.tsx`의 `Modal.confirm`(정적 호출)이 `ConfigProvider` 테마를 못 받는다 → **다크 모드에서 확인창만 라이트 테마**일 수 있다(시각 미검증). 앱에 같은 정적 호출 16파일이 있어 새 패턴은 아니나, 이 페이지는 `main.tsx`의 `<App>` 안이라 `App.useApp().modal.confirm` 또는 `Modal.useModal()`로 바꾸면 사라진다(`ApmCollectorRumTab.tsx`가 그 예) | B3 확인창 표시 시 콘솔 | 기능 동작엔 영향 0 |
| 🟢3 | 참고(절차) | — | 실측 중 FE 워크트리가 타 세션에 의해 편집됐다(v3 반영 추정). 이 절의 FE 판정은 위 md5 상태 기준 — **v3 반영 기록이 요청서에 오르면 그 diff가 이 절의 항목(B1~B6)에 걸치는지만 확인**하면 된다 | — | 1회차 결과 폐기·재실행 |
| 🟢4 | 참고(환경) | — | admin 세션이 로그인 6분 뒤 외부에서 무효화됐다(계정당 세션 1개, ZM-157). 같은 시각대 BE 로그에 `AccessDeniedException` 스택 5건(요청 URI 미기록 — 이 기능 EP는 쿠키 없이 401 JSON을 주므로 다른 EP로 추정)과 헤드리스 종료 시 소켓 절단 `IOException` 1건 | — | dev 공유 Redis라 :3000/:3001이 세션을 공유한다. 병행 검증 시 전용 계정 권장(메모리 규칙과 동일) |

🔴 0 · 🟡 1(dev DB 체크섬 — 코드 결함 아님, 병합 전 repair 필요) · 🟢 3 · 미확인 0(1차의 A4·B6 미확인은 이번 범위 밖)

### 종합 판정(2차)

**통과.** 코덱스 반영분이 dev 런타임에서 값 수준으로 확인됐다 — BE는 두 PUT의 동시 저장(같은 tick 30회 전부 겹침)·첫 저장 경합(행 없음 ×10) 모두 lost update·중복 키 0, 첫 저장 경로가 호스트 그룹 열을 기본값으로 남긴다. FE는 정규화 replace(뒤로가기 한 번에 진입 전 페이지)·탭 클릭 push·`useBlocker` 기반 dirty 보호(탭 클릭·뒤로가기 동일 확인창, 취소 시 값과 `tab=apm` 유지)·GET 실패 시 폼 미표시+재시도·원격 충돌 Alert(유지/새로 불러오기)·라우터 `Link`(SPA 1회, Ctrl+클릭 위임)가 전부 동작한다. 남은 것은 **병합 전 dev DB V66 체크섬 repair(🟡1)** 하나뿐이고 코드 수정 사유는 없다.

정리 완료: :3001·:5174 종료, 보존 행 삭제로 원복(양쪽 GET 기본값), V66 유지, 워크트리·master 무변경(이 세션).
