# ZM-154 작업 보고 — APM 데이터 내보내기 FE 후속 2건(F6 · AbortController)

- 작성일: 2026-09-28 · 범위: **FE만**(BE 무수정). BE 후속 계약(`q`/`method`/`planToken`)은 다른 에이전트 작업 중이라 이번 범위 밖
- 워크트리 `C:\worktrees\zm-154-fe-followup` · 브랜치 `ZM-154-followup-fe`(master `105c8bf` 기준) · **미커밋**(사용자 승인 대기)
- `node_modules`는 워크트리에 `npm install --legacy-peer-deps`로 설치(정션 아님, gitignore 대상)
- 근거: 계약 [`./contract_apm-data-export.md`](contract_apm-data-export.md) · 이전 FE 보고 [`zm-154_apm-data-export-fe.md`](zm-154_apm-data-export-fe.md) · 검수 [`./review_zm-154-apm-data-export.md`](review_zm-154-apm-data-export.md)(FE R3 잔여 · R6)
- 검수 인계: [`./review_zm-154-fe-followup.md`](review_zm-154-fe-followup.md)

| 항목 | 상태 |
|---|---|
| F6 — APM 개요 "전체 서비스 RED 내보내기" | ✅ 구현 + 화면 테스트 3건 |
| FE R3 잔여 — AbortController(요청 중단) | ✅ 구현 + 테스트(모달 5건·헬퍼 6건·api 1건) · R6 StrictMode 테스트 유지 + 1건 추가 |
| 브라우저 실측 | ❌ **미실시**(:5173 본체는 master라 워크트리 코드가 아니다) |

---

## 1. 바꾼 파일 (수정 11 · 신규 2 = 13)

### 수정
| 파일 | 내용 |
|---|---|
| `src/services/axiosInstance.ts` | 🔴 요청 인터셉터가 **호출부 `config.signal`을 덮어쓰던 것**을 이어 붙이기로 변경(`linkCallerSignal`). 호출부가 끊으면 중복 취소 맵에서 먼저 빼고 자기 controller를 끊는다 |
| `src/services/apm.api.ts` | `downloadExport(dataset, params, { signal })` — 세 번째 인자(선택) 추가, axios에 그대로 전달 |
| `shared/components/ApmExportModal.tsx` | 중단 스위치(`abortRef`) · 취소/X/Esc = `handleClose`(끊고 닫기) · 언마운트·계정 전환(`onSessionSwitch`) 시 중단 · 중단은 오류로 안 보임 · 받는 중 안내 줄 · 전체 서비스 RED면 **해상도를 맨 앞 줄**에 · 거절 문구에 행 수/상한 + 무엇을 줄일지 · env 미반영 안내 |
| `shared/components/ApmExportButton.tsx` | 버튼 이름 키를 `apmExportLabelKey`로(전체 서비스 RED는 `red_series_all`) |
| `shared/apmExport.ts` | `apmExportIsAllServicesRed` · `apmExportLabelKey` · `apmExportNotAllowedHint` 추가 |
| `overview/ApmOverviewPage.tsx` | 위젯 툴바 `toolbarLeading`에 `<ApmExportButton dataset="red-series" data-testid="apm-overview-export" />`(service 생략) |
| `src/locales/kr.json` · `en.json` | `apm.export` 블록에 **11줄씩 줄 단위 삽입**(기존 줄 변경 0 — `git diff`의 `-` 줄 없음) |
| `src/__tests__/ApmExportButton.test.tsx` | 기존 다운로드 단언을 `{ signal }` 3번째 인자 포함으로 · 신규 6건 |
| `src/__tests__/ApmOverviewPage.test.tsx` | `useApm` mock에 `useApmExportPlan` 추가(payload 직접) · 신규 3건 |
| `src/__tests__/apmExportApi.test.ts` | signal 전달 1건 |

### 신규
| 파일 | 내용 |
|---|---|
| `src/services/linkCallerSignal.ts` | 호출부 signal → 인터셉터 controller 연결 헬퍼(`linkCallerSignal`) + 인터셉터 signal 표시(`trackInterceptorSignal`)·호출부 signal 판별(`resolveCallerSignal`). `beforeAbort`(맵 정리)를 **끊기 전에** 부른다. import 0 — `axiosInstance`는 `import.meta.env` 때문에 jest에서 못 불러와 로직만 떼었다 |
| `src/__tests__/linkCallerSignal.test.ts` | 6건(끊기 순서·이미 끊긴 signal·signal 없음·**401 재시도 2건**·한 번만) |

---

## 2. F6 — 배치 · 문구

**배치**: APM 개요 위젯 툴바의 **편집 버튼 왼쪽**(`ApmDashboardPanel`의 `toolbarLeading`) — 서비스 상세 › 개요 탭의 "RED 내보내기"와 같은 자리 규칙. 왼쪽 `headerLeft`(지난주 리포트 링크, 관리자만)와 겹치지 않는다. 서비스 0건 온보딩 화면에는 대시보드 패널이 없어 버튼도 없다(내보낼 것이 없다).

**동작**: `service` 생략 = 계약상 "창 안에 RED 수신이 있는 전 서비스". 창은 기존 버튼과 같이 누른 순간의 `useApmTimeRange()`를 고정(끝은 지금으로 자름).

**모달이 달라지는 점**(`dataset=red-series && !service`일 때만 — 서비스 상세 개요 탭은 그대로):
| 요소 | 내용 |
|---|---|
| 제목·버튼 | "전체 서비스 RED 시계열 내보내기" / "전체 서비스 RED 내보내기" |
| 해상도 | 형식·gzip 줄 **위 맨 앞 줄**로 올리고 아래에 이유 한 줄: "전체 서비스는 서비스 수만큼 행이 늘어납니다. 해상도를 먼저 고르세요 — 1분은 5분보다 5배, 1시간보다 60배 많은 행입니다." |
| 거절(`allowed=false`) | 제목 "내보낼 행이 {rows}개로 한 번에 받을 수 있는 상한({maxRows}개)을 넘어 내려받을 수 없습니다." + 설명 "해상도를 1시간으로 올리거나 기간을 줄여 주세요. 특정 서비스만 필요하면 서비스 상세의 개요 탭에서 내보내면 행이 훨씬 적습니다." |
| 파일 읽는 법(맨 앞) | "이 파일에는 기간 안에 요청이 들어온 모든 서비스가 담깁니다. 화면의 환경(env) 선택은 파일에 적용되지 않으며, 서비스별 env는 env 열로 구분합니다." |

거절 문구의 행 수 표시는 **모든 데이터셋**에 적용했다(기존 "행 수가 상한을 넘어…"는 숫자가 없었다). 권유 문구만 데이터셋별: 단일 서비스 RED = "해상도를 올리거나 기간을 줄여 주세요." · 엔드포인트/에러 그룹 = "기간을 줄이거나 조건을 좁혀 주세요." 기존 키 `apm.export.not_allowed`는 다운로드 `TOO_LARGE`에 data가 없을 때의 폴백으로 남아 있다.

새 로케일 키(kr/en 각 11줄): `button.red_series_all` · `title.red_series_all` · `step_first_hint` · `not_allowed_rows` · `not_allowed_hint.{all_services,step,other}` · `downloading_hint` · `guide.all_services_env`. 고객 문구에 검수번호·§·HTML 태그 없음.

---

## 3. Abort 설계

### 3.1 선행 결함 — 인터셉터가 호출부 signal을 버렸다
`applyDmoveInterceptors`의 요청 인터셉터는 중복 요청 취소용으로 매 요청 `config.signal = controller.signal`을 **대입**했다. 호출부가 `signal`을 실어도 덮여 요청에 닿지 않는다. 그래서 모달에 AbortController만 두면 아무것도 끊기지 않는다 → 인터셉터에서 **이어 붙이기**로 바꿨다.

🔴 이어 붙일 때의 함정: 응답 인터셉터는 취소 오류를 받으면 `controllers.has(key)`로 "대체 요청이 진행 중인 중복 취소"를 판정해 **영구 pending**을 돌려준다. 호출부 중단인데 맵에 자기 controller가 남아 있으면 이 판정에 걸려 모달의 `finally`(받는 중 표시 해제)가 영영 돌지 않는다. 그래서 `linkCallerSignal`은 **끊기 전에** 맵 항목(자기 것일 때만)을 지운다 → 응답 인터셉터가 reject로 끝낸다.

🔴 두 번째 함정(작성 중 발견·수정) — **401 refresh 재시도**: `API(original)`은 원 config를 다시 보내므로 `config.signal`에 첫 시도의 **인터셉터** signal이 들어 있고, 인터셉터는 같은 키의 이전 controller(=그 signal)를 먼저 끊는다. 그것을 호출부 signal로 이어 붙이면 **모든 401 재시도가 즉시 취소**된다. 그래서 인터셉터가 만든 signal을 `WeakSet`으로 표시(`trackInterceptorSignal`)하고, 첫 시도의 호출부 signal을 `config._callerSignal`에 기억해 재시도에는 그것을 쓴다(`resolveCallerSignal`). 호출부 signal이 없으면 재시도에도 아무것도 잇지 않는다. 테스트 2건이 이 순서를 그대로 재현한다.

영향 범위: axios 인스턴스에 `signal`을 넘기는 호출부는 이번 다운로드뿐이다(grep — `aiChatStore`의 signal은 fetch SSE 경로). signal 없는 요청은 동작 불변(헬퍼가 즉시 반환, 재시도도 동일).

### 3.2 어느 경로가 중단하나

| 경로 | 요청 중단 | 파일 저장 | 오류 안내 | 받는 중 표시 | 테스트 |
|---|---|---|---|---|---|
| 취소 버튼 | ✅ `handleClose` → abort | 안 함 | 없음 | 모달 닫힘 | "aborts the request when cancelled…" |
| X · Esc(`onCancel`) | ✅ `handleClose`(같은 함수) | 안 함 | 없음 | 모달 닫힘 | 취소 버튼과 같은 핸들러(별도 테스트 없음) |
| 언마운트(메뉴 이동 등) | ✅ effect cleanup → abort | 안 함 | 없음(언마운트) | — | "aborts the request when the screen unmounts…" |
| 계정 전환(모달 열린 채) | ✅ `onSessionSwitch` → abort | 안 함(epoch 검사도 이중) | 없음 | **해제**(재시도 가능) | "aborts on account switch while the modal stays open…" + 기존 R1 테스트에 `aborted=true` 단언 추가 |
| 다운로드 성공 후 `onClose` | — (이미 끝남, `abortRef`는 finally에서 비움) | 저장 | — | — | 기존 |
| StrictMode 점검용 cleanup | ❌ 끊지 않음(마운트 직후라 `abortRef=null`) | 저장 | — | — | 기존 R6 테스트에 `aborted=false` 단언 + **느린 다운로드** 신규 1건 |
| 중단이 늦게 닿음(응답이 먼저 도착) | — | 안 함(`signal.aborted`·`closedRef`·epoch 검사) | 없음 | — | 기존 "drops the file when the modal was closed…" |

- 중단 판정은 `controller.signal.aborted`(이 시도의 controller)로 한다 — `axios.isCancel`만 보면 인터셉터의 중복 취소와 구분이 안 된다.
- `closedRef`·세션 epoch 검사는 **그대로** 둔다(중단 신호가 응답 도착 뒤에 닿는 틈의 마지막 방어선).
- R6 재발 방지: `closedRef.current=false`를 setup에서 되돌리는 구조 유지. 새 cleanup은 `offSessionSwitch()` + `abort()`인데, StrictMode의 점검 cleanup 시점엔 진행 중 다운로드가 없어 아무것도 끊지 않는다. setup이 다시 돌며 핸들러를 재등록한다.
- 오류 **토스트**: 모달은 원래 다운로드 실패를 토스트가 아니라 모달 안 Alert로 보인다. 중단 시에는 그 Alert도 띄우지 않는다. 성공 토스트(`downloaded`)는 중단 시 당연히 없다.

---

## 4. 검증 결과

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | ✅ 0 |
| `npm run typecheck:contract` | ✅ 0(09-22 보고의 기존 2건은 master에서 이미 해소됨) |
| `npx eslint --max-warnings 0`(바꾼·새 `.ts/.tsx` 11개, 수정 후 인터셉터·헬퍼·테스트 재실행) | ✅ 0 |
| `npx jest ... -w 2` 대상 4 스위트 | ✅ **63/63** — `ApmExportButton` 18(기존 12 + 신규 6) · `ApmOverviewPage` 29(기존 26 + 신규 3) · `apmExportApi` 10(기존 9 + 1) · `linkCallerSignal` 6 |
| 인접 화면 3 스위트(`ApmServiceTransactionsTab`·`ApmServiceDetailPage`·`apmAggScreens`) | ✅ 함께 실행 — **7 스위트 140/140**, 97초 |
| 고아 jest 워커 | 없음(워크트리 경로 node 프로세스 0) |
| 브라우저 실측 | ❌ 미실시 |

실행 출력 요약(401 재시도 수정 후 마지막 합동 실행): `Test Suites: 7 passed, 7 total` · `Tests: 140 passed, 140 total` · `Time: 97.151 s`.
참고: `ApmExportButton` 스위트에서 antd Modal `useScrollLocker`의 jsdom 콘솔 스택이 찍힌다 — 기존 테스트에서도 나던 것(실패 아님).

---

## 5. 미해결 · 후속

1. ❌ **브라우저 실측 미실시** — 확인할 것: 개요 툴바의 버튼 자리(편집 버튼 왼쪽, 좁은 폭 줄바꿈), 긴 다운로드 중 취소 → 네트워크 탭에서 요청이 `(canceled)`로 끊기는지, 끊은 직후 다른 내보내기가 `BUSY` 없이 시작되는지(BE 슬롯 반납), 7일·1분 전체 서비스 계획이 실제로 `allowed=false`가 되는지와 문구.
2. **env 필터 미반영** — 개요는 `?env=`로 좁힐 수 있지만 내보내기 EP에 `env` 파라미터가 없다(계약 §2). 파일은 env 무관 전 서비스이고 모달이 그 사실을 적는다. 요구가 생기면 BE에 `env` 추가 요청 후보(지금 진행 중인 BE 후속 `q`/`method`/`planToken`과 같은 부류). → **09-28 v2 연동 때 계약서 `🔄 FE 요청사항 (v2 연동 시)` 아래에 "FE → BE 요청: `env` 파라미터" 한 줄로 추가**(BE 에이전트 종료 후, 코디네이터 지시).
3. ~~보존 경계 재승격 — BE `planToken` 후속 대기~~ → v2 연동으로 해소(아래 "v2 연동" 절).
4. 검수 FE R4(실제 인터셉터 배선 테스트)·R5(접근성 레이블)는 이번 범위 밖. 단 R4의 일부(호출부 signal 연결)는 `linkCallerSignal` 단위 테스트로 덮었다 — 인터셉터 자체는 `import.meta.env`로 jest 로드 불가.
5. 커밋 — 사용자 승인 대기. 제안: `#ZM-154 [FEAT] APM 개요 전체 서비스 RED 내보내기(해상도 우선·거절 사유 행 수) + 내보내기 취소 시 요청 중단(AbortController, 인터셉터가 호출부 signal 이어 붙이기) -2026-09-28` (13개 파일, `git add -A` 금지 — 파일 지정).

---

## v2 연동 (2026-09-28, 계약 `features/apm/data-export/contract_apm-data-export.md` "v2 후속" 절)

- BE: 워크트리 `C:\worktrees\zm-154-be-followup`(미커밋) · **:3000에는 아직 없음** → 브라우저·런타임 실측 **미실시**
- 같은 워크트리에서 증분. 누적 변경 **18개 파일**(수정 16 · 신규 2), `git diff` +853/−55(신규 2파일 제외)

| # | 항목 | 상태 |
|---|---|---|
| 1 | 트랜잭션 탭 `q`·`method`를 계획·다운로드·쿼리 키에 · 모달 "적용 필터" · "필터 미반영" 주석·보고서 정정 | ✅ |
| 2 | 다운로드에 `planToken` · `APM_EXPORT_INVALID` → 계획 재조회 + 모달 안 안내 · 만료 토큰은 누를 때 먼저 재조회 | ✅ |
| 3 | 계약 타입·픽스처에 `q`·`method`·`planToken`·`planTokenExpiresAtMs` → `typecheck:contract` 0 | ✅ |
| 4 | 계약서 `🔄 FE 요청사항`에 "FE → BE 요청: `env` 파라미터(개요 전체 서비스 RED)" 한 줄 | ✅ |

### v2.1 바꾼 파일(이번 증분)
| 파일 | 내용 |
|---|---|
| `src/types/apm.ts` | `TApmExportParams.method` · `TApmExportDownloadParams`(= params + `planToken`) · `TApmExportPlan`에 `q`·`method`·`planToken`·`planTokenExpiresAtMs`(계약 v2.2, 맨 뒤) |
| `src/__tests__/fixtures/apmExportContractSample.ts` | 기존 샘플 3종에 v2 4필드 · 신규 `APM_EXPORT_PLAN_ENDPOINTS_FILTERED_SAMPLE`(계약 v2.3 예시) — 계약 게이트 |
| `src/hooks/useApm.ts` | `useApmExportPlan` 쿼리 키에 `method` 추가(`q`는 원래 있음) |
| `src/services/apm.api.ts` | `downloadExport`의 params 타입을 `TApmExportDownloadParams`로. 빈 값 제거(`clean`)는 그대로 — 빈 `planToken`·null `method`는 요청에서 빠진다 |
| `ApmServiceTransactionsTab.tsx` | 버튼에 `q={keyword}` · `method={methodFilter}`(표의 `useApmEndpoints`가 쓰는 같은 값). "필터는 실리지 않는다" 주석 → "표와 같은 술어, total = 파일 행 수"로 정정 |
| `ApmExportButton.tsx` | `method` prop → scope |
| `ApmExportModal.tsx` | `method`는 `endpoints`에서만(`apmExportSupportsMethod`) · 다운로드 `{ ...params, planToken: plan.planToken }` · `APM_EXPORT_INVALID` → `replan("invalid")` · 만료 → `replan("expired")` · "적용 필터" 줄(endpoints·error-groups) · 재조회 안내 Alert(info) · "plan token 후속" 주석 정정 |
| `shared/apmExport.ts` | `apmExportSupportsMethod` · `apmExportSupportsFilters` · `apmExportPlanExpired` |
| `src/locales/kr.json` · `en.json` | 8키 19줄씩 **삽입만**(`plan.filters`·`filter_q`·`filter_method`·`filter_none`·`replanned.{invalid,expired}`) |
| 테스트 | `ApmExportButton` +4 · `ApmServiceTransactionsTab` +2(+`useApmExportPlan`·`useIsUserRoleAdmin` mock) · `apmExportApi` +1 |
| 문서 | 이전 FE 보고 `zm-154_apm-data-export-fe.md` §3 #3·§5-3 정정(취소선 + v2 해소) · 계약서 FE 요청 1줄 |

### v2.2 설계
- **필터 전달 경로**: 표 → 버튼 → 모달 scope → params. `method`는 모달이 `endpoints`일 때만 싣는다 — BE는 다른 데이터셋의 method를 거절(조용히 무시하지 않음)하므로 FE가 막는다. 에러 화면이 `method`를 넘겨도 null(테스트).
- **적용 필터 표시**는 요청값이 아니라 **계획 응답의 `q`·`method`**(BE가 다듬은 값)를 쓴다. 없으면 "없음(전체)". RED에는 줄 자체가 없다.
- **토큰**: 계획과 같은 `params` 객체 + `planToken`. 계획의 `stepSeconds`를 되보내지 않는 R2 규칙 유지(토큰이 해상도를 고정한다).
- **재조회**: 모달의 계획 쿼리 `refetch()`. invalidate 대신 쓴 이유 — 열린 모달의 활성 쿼리 하나라 효과가 같고, 화면 테스트 스위트(훅 mock, QueryClientProvider 없음)에 QueryClient 의존을 새로 만들지 않는다. 🔴 `refetch()` 반환값(언랩 전 envelope)은 **쓰지 않는다** — 화면은 훅의 `data`만 본다(언랩 깊이 규칙).
- **자동으로 이어 받지 않는다**: INVALID·만료 모두 재조회 + "계획을 다시 확인했습니다. 새 계획을 확인한 뒤 다시 내려받아 주세요." 안내 후 사용자가 다시 누른다. 새 계획의 행 수·해상도·`allowed`가 달라질 수 있어서다. 재조회 중에는 기존 규칙대로 버튼이 잠긴다. 안내는 조건을 바꾸거나 다시 누르면 사라진다.
- 만료 판정은 `planTokenExpiresAtMs <= Date.now()`(클라이언트 시계). 시계가 늦으면 만료를 놓쳐 BE가 INVALID를 주고 → 같은 재조회 경로로 떨어진다(이중 안전).
- INVALID가 파라미터 자체 오류(예: 검색어 200자 초과)면 재조회도 INVALID → 기존 계획 오류 Alert가 뜨고 버튼 잠김(루프 없음 — 자동 재다운로드가 없다).

### v2.3 검증
| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | ✅ 0 |
| `npm run typecheck:contract` | ✅ 0(v2 4필드가 필수라 픽스처 누락 시 여기서 깨진다) |
| `npx eslint --max-warnings 0`(변경·신규 `.ts/.tsx` 15개) | ✅ 0 |
| `npx jest -w 2` 7 스위트 | ✅ **147/147** — `ApmExportButton` 22 · `ApmOverviewPage` 29 · `ApmServiceTransactionsTab`(+2) · `apmExportApi` 11 · `linkCallerSignal` 6 · `ApmServiceDetailPage` · `apmAggScreens`(에러 탐색 포함). `Time: 79.747 s` |
| 고아 jest 워커 | 0 |
| 줄바꿈 | 변경 파일을 체크아웃과 같은 CRLF로 정리(내용 diff 불변) |
| 브라우저·런타임 | ❌ 미실시(:3000에 v2 BE 없음, :5173은 master) |

v2 테스트가 보는 것: 트랜잭션 탭 필터 → 계획 파라미터(`q`·`method`·`service`) + "적용 필터" 표시 / 필터 없으면 null / 모달 단위에서 endpoints 필터·토큰이 다운로드에 실림 / error-groups에는 method 미전송 / 다운로드 `APM_EXPORT_INVALID` → 계획 2회째 조회(같은 파라미터)·안내 표시·오류 Alert 없음·자동 재다운로드 없음 / 만료 토큰 → 다운로드 미호출·재조회·안내 → 새 계획으로 다시 눌러 저장 / api 계층에서 `planToken`·`q`·`method` 쿼리 전달, 빈 토큰·null method 제거.

### v2.4 미해결
1. ❌ 런타임 미확인 — BE v2가 :3000에 올라간 뒤: 토큰이 실린 실제 다운로드 URL(약 150자 토큰 + 파라미터), 30분 뒤 만료 경로, 표 total = 파일 행 수(BE IT는 단언함), `__other__` 행 필터 포함 여부.
2. 모달이 BE의 INVALID `message`(만료/불일치 구분)는 보이지 않는다 — 계약상 FE는 코드 하나로 처리하면 되고, 한국어 전용 문구라 i18n 안내로 대신했다. 필요하면 안내 아래 보조 줄로 추가 가능.
3. `env` 파라미터 — 계약서에 FE 요청으로 기록, BE 미결.
4. 커밋 — 승인 대기. 제안(한 커밋): `#ZM-154 [FEAT] 내보내기 FE 후속 — APM 개요 전체 서비스 RED(해상도 우선·거절 사유), 취소 시 요청 중단(AbortController·인터셉터 signal 연결), v2 연동(트랜잭션 필터 q·method, planToken·INVALID/만료 재계획) -2026-09-28` (18개 파일, `git add -A` 금지).

---

## 코덱스 반영 (2026-09-28, 검수 v1 — `_archive/features/apm/data-export/review_zm-154-fe-followup_codex.md`)

판정 "수정 후 재검수"(필수 R1 · 권장 R2~R5) → **5건 전부 반영**, 미커밋. 누적 **22개 파일**(수정 17 · 신규 5). 상세 표(반영 위치 파일:줄)는 인계서 "검수 결과(코덱스 v1)" 절.

| # | 반영 요지 |
|---|---|
| R1 | v2 네 필드를 옵셔널로(v1/v2 혼재). 계획에 `planToken`이 없고 `endpoints`에 `q`/`method`가 있으면 **내려받기 차단** + 모달 경고("서버 버전이 낮아 검색어·메서드 필터를 적용한 내보내기를 지원하지 않습니다. 필터를 지우면 전체 엔드포인트를 내보낼 수 있습니다."). 필터 없으면 v1 동작(토큰 없이). v1 표본 픽스처 추가 |
| R2 | 호출부가 끊은 인터셉터 signal을 WeakSet으로 표시 → 응답 인터셉터가 맵 판정보다 먼저 무조건 reject. signal 없는 중복 취소 규칙은 그대로 |
| R3 | `linkCallerSignal`이 unsubscribe를 돌려주고 `config._unlinkCallerSignal`로 성공·실패·재시도 전 경로에서 뗀다 |
| R4 | 클라이언트 시계 만료 선판정과 `replanned.expired` 키 삭제. 만료는 BE `APM_EXPORT_INVALID`가 정본 → 기존 재조회 흐름. 안내 문구를 "유효 시간이 지났거나 조건이 바뀌어…"로 |
| R5 | `import.meta.env`를 `src/constants/apiBaseUrl.ts`로 격리 + `jest.config.cjs` 매핑(`aiBaseUrl`과 같은 방식) → 실제 `createDmoveApi`에 adapter를 끼운 테스트 8건. 🔴 **변이 확인: 인터셉터 배선을 되돌린 4종(이전 구현 / R2 표식 제거 / R3 떼기 제거 / 401 재시도 구분 제거) 모두 빨간불(6·1·2·2건 실패) → 원복 확인** |

- 로케일(kr/en): `replanned.expired` 삭제 · `replanned.invalid` 문구 변경 · `filter_unsupported`·`filter_unsupported_short` 추가 — 여전히 HEAD 대비 **삽입만**(이 키들은 이번 작업의 미커밋 추가분이라 수정해도 기존 줄 변경 0)
- 테스트 작성 중 발견: 가짜 adapter가 `CanceledError(message, config, request)` 인자 순서를 틀려 config가 빠지면 R2 테스트가 **우연히 통과**했다 — 실제 XHR 어댑터와 같은 순서로 고친 뒤에야 중복 취소 규칙 테스트가 의미 있게 돌았다.
- 🆕 같은 회차에 계약 v2 FE 요청 **#4·#5**(BE 코덱스 반영으로 새로 생김)도 처리:
  - **#4 보존 결손 헤더** — 인터셉터에 옵트인 `returnHeaders`(기본 동작·다른 호출 영향 0, 실제 인스턴스 테스트로 고정)를 두고 다운로드만 `{ data, headers }`를 받는다. `X-Apm-Export-Retention-Clipped: true`면 저장은 그대로, 모달을 닫지 않고 "…{기준 시각} 이전 구간은 비어 있거나 일부만 있습니다. 파일은 저장되었습니다." 경고. 헤더를 못 읽으면(v1 BE·미노출) 계획의 `retentionClipped`로 대신(기준 시각 없는 문구). 로케일 2키 추가(삽입만).
  - **#5 적용값 표시** — "적용 필터"는 계획 응답의 `q`·`method` 적용값만. 요청값 폴백 삭제 → red-series는 줄 없음, v1 계획도 줄 없음. error-groups의 적용 `q`는 v2 계획이 주므로 보인다(해석 — 인계서에 명시).
- 검증: `tsc` 0 · `typecheck:contract` 0 · eslint 0 · jest `-w 2` **8 스위트 169/169**(`ApmExportButton` 30 · `ApmOverviewPage` 29 · `apmExportApi` 13 · `linkCallerSignal` 8 · `axiosCallerSignal` 10 · 인접 3) · 고아 워커 0 · 브라우저·런타임 **미실시**
- 테스트 작성 중: 모달·api 편집 스크립트를 bash heredoc으로 넘기자 `\r\n` 패턴이 맞지 않아(백슬래시 처리) 파일로 써서 실행했다(메모리 [[bash-heredoc-eats-backslash]]와 같은 부류).
- 🆕 **코덱스 v2 재검수 반영(N1)** — `_archive/features/apm/data-export/review_zm-154-fe-followup-v2_codex.md`: R1~R4·#4·#5 닫힘, R5 부분 → 필수 N1. `apiBaseUrl` 분리가 기존 `zm157RealWiring.test.tsx`의 커스텀 소스 로더(`support/realDmoveApi.ts` — 원본 소스에서 `import.meta.env.VITE_API_URL`을 치환·변환·실행)를 깨뜨렸다(1차 반영 때 `realDmoveApi` 사용처를 돌리지 않아 놓쳤다). 로더를 없애고 `requireActual("@/services/axiosInstance")`로 **원본 모듈을 그대로** 쓰게 단순화 → zm157 **9/9**, 대상 9 스위트 **178/178**, `tsc`·`typecheck:contract`·eslint 0.
- 최종 파일 **23개**(수정 18 · 신규 5, `realDmoveApi.ts` 수정 추가). `linkCallerSignal.test.ts`는 처음부터 신규(`??`) — 목록 정본은 인계서 "검수 결과(코덱스 v2)" 절.
- 커밋 제안 갱신(23개 파일, `git add -A` 금지 — 신규 5개 포함 파일 지정): `#ZM-154 [FEAT] 내보내기 FE 후속 — APM 개요 전체 서비스 RED, 취소 시 요청 중단(인터셉터 호출부 signal 연결·중단 표식·리스너 해제), v2 연동(q·method·planToken, v1 서버 필터 차단) + 보존 결손 헤더 경고·적용 필터 적용값 표시 + 코덱스 검수 R1~R5 반영 -2026-09-28`
