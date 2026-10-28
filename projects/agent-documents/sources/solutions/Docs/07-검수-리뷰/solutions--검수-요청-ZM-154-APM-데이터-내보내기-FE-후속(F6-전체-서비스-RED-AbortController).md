# 검수 요청 — ZM-154 APM 데이터 내보내기 FE 후속(F6 전체 서비스 RED · AbortController)

- 요청: Claude · 2026-09-28
- 검수 대상: FE `moveseyee_fe` 워크트리 **`C:\worktrees\zm-154-fe-followup`**(브랜치 `ZM-154-followup-fe`, master `105c8bf` 기준) — **미커밋 변경**(`git -C C:\worktrees\zm-154-fe-followup diff` + 신규 2파일)
- 🔴 BE 무수정. BE 후속 계약(`q`/`method`/`planToken`)은 다른 작업이라 대상 아님.
- 이전 검수: [`review_zm-154-apm-data-export.md`](%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-154-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0%28CSV-JSONL%29-BE-FE.md) — 이번 건은 그 **FE R3 잔여(AbortController)** 와 제외됐던 **F6**
- 계약: `_workspace/contract_apm-data-export.md` · 작업 보고: `_workspace/reports/zm-154_fe-followup.md`

## 범위

| 층 | 변경 |
|---|---|
| 공통 HTTP | `services/axiosInstance.ts` — 요청 인터셉터가 호출부 `config.signal`을 **덮어쓰던 것**을 이어 붙이기로(`services/linkCallerSignal.ts` 신규). 호출부 중단 시 중복 취소 맵에서 먼저 빼고 끊는다 |
| API | `services/apm.api.ts` — `downloadExport(dataset, params, { signal })` |
| 모달 | `shared/components/ApmExportModal.tsx` — `abortRef` · 취소/X/Esc/언마운트/계정 전환 시 abort · 중단은 오류 미표시 · 받는 중 안내 · 전체 서비스 RED면 해상도 맨 앞 · 거절 문구에 행 수/상한 + 데이터셋별 권유 · env 미반영 안내 |
| 공용 규칙 | `shared/apmExport.ts` — `apmExportIsAllServicesRed`·`apmExportLabelKey`·`apmExportNotAllowedHint` · `ApmExportButton.tsx` 이름 키 |
| 화면 | `overview/ApmOverviewPage.tsx` — 위젯 툴바 `toolbarLeading`에 `red-series`(service 생략) 버튼 |
| i18n | `kr.json`·`en.json` `apm.export`에 11줄씩 삽입(기존 줄 변경 0) |
| 테스트 | `ApmExportButton` +6 · `ApmOverviewPage` +3 · `apmExportApi` +1 · `linkCallerSignal` 6(신규) |

## 의도 (선택한 설계 · 버린 대안)
- **인터셉터를 고쳤다**(모달만 고치지 않음): 인터셉터가 `config.signal`을 대입해 호출부 signal이 요청에 닿지 않았다. 버린 대안: 이 요청만 인터셉터 우회(raw axios) — `x-visitor-id`·401 refresh·envelope 규약을 복제하게 된다.
- **끊기 전에 맵 정리**: 응답 인터셉터의 "대체 요청 진행 중이면 영구 pending" 판정에 호출부 중단이 걸리지 않게 한다. 버린 대안: 응답 인터셉터에서 `signal.reason`으로 구분 — 취소 오류에서 원 config의 호출부 signal을 찾기 어렵다.
- **401 재시도 구분**: 재시도(`API(original)`)는 `config.signal`에 첫 시도의 인터셉터 signal(인터셉터가 곧 끊는 것)을 싣고 온다 → 인터셉터 signal을 `WeakSet`으로 표시하고 호출부 signal은 `config._callerSignal`에 기억해 재시도에 다시 잇는다. 이것 없이는 모든 401 재시도가 즉시 취소된다(작성 중 발견·수정, 테스트 2건).
- 중단 판정은 `controller.signal.aborted`(이 시도의 controller). `axios.isCancel`만으로는 중복 취소와 구분 불가.
- `closedRef`·세션 epoch 폐기 로직 **유지**(중단 신호가 응답 도착 뒤 닿는 틈의 방어선). R6 구조(setup에서 `closedRef=false`) 유지.
- F6은 **자동 판정**(`red-series && !service`) — 새 prop 없음. 서비스 상세 개요 탭 모달은 그대로.
- env 필터는 계약에 파라미터가 없어 파일에 반영 불가 → 모달 안내로 알림. 계약서 요청사항에는 미기재(동시 편집 회피, 보고서 §5-2).

## 중점 확인 요청
1. `linkCallerSignal`의 `beforeAbort`가 **자기 controller일 때만** 맵을 지우는가(같은 키로 이미 대체 요청이 들어온 경우 그 요청을 지우지 않는가).
2. 호출부 중단 → 응답 인터셉터가 **reject**로 끝나는가(영구 pending 없음) → 모달 `finally`가 `downloading`을 푸는가.
3. 🔴 401 refresh 재시도(`API(original)`)가 **즉시 취소되지 않는가**(첫 시도 인터셉터 signal을 호출부로 오인하지 않는가) + 호출부 중단은 재시도에도 닿는가 · axios `mergeConfig`가 `_callerSignal`을 재시도 config에 보존하는가(잃으면 재시도에서 호출부 연결만 빠지고 취소되지는 않는다).
4. signal 없는 기존 요청 동작 불변(중복 취소·고아 취소 경로 포함).
5. StrictMode: 점검용 cleanup이 진행 중 다운로드를 끊지 않는가, `onSessionSwitch` 등록이 setup/cleanup으로 누수 없이 1개만 남는가.
6. 계정 전환 시 모달이 열린 채로 남는 경우 — 중단 후 재시도 가능 상태(오류 Alert 없음, 버튼 활성)가 맞는가.
7. 중단된 요청이 어떤 경로로도 오류 Alert·토스트를 띄우지 않는가(`catch`의 조건 순서).
8. 거절 문구 `not_allowed_rows`가 **모든 데이터셋**에 적용된 것(기존 숫자 없는 문구 대체)이 적절한가. 폴백 `not_allowed` 유지.
9. F6 버튼 자리(편집 버튼 왼쪽)·온보딩 화면에서 미노출이 서비스 상세 개요와 일관적인가.
10. 로케일 kr/en 키 대칭(11키)·고객 문구에 내부 표기 없음.

## 검증 (Claude, 2026-09-28)
- `tsc --noEmit` 0 · `typecheck:contract` 0 · eslint(바꾼 11개) 0
- jest `-w 2`: 대상 4 스위트 63건 + 인접 3 스위트 = **7 스위트 140/140** 통과. 고아 워커 없음
- ❌ **브라우저 실측 미실시**(dev :5173은 master 본체) — 실제 네트워크 `(canceled)`·BE 슬롯 반납 후 즉시 재다운로드·전체 서비스 계획 `allowed=false` 문구는 미확인
- ❌ 인터셉터 자체의 jest 통합 테스트 불가(`import.meta.env`) — 로직을 `linkCallerSignal`로 떼어 단위 테스트

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정"으로 표시.
- 마지막에 중점 확인 1~10 각각 판정(충족/불충족/추정) 한 줄씩과 종합 판정(승인 / 수정 후 재검수).

---

## v2 연동 (2026-09-28 증분 — 같은 워크트리)

- 계약: `contract_apm-data-export.md` 맨 아래 "v2 후속" 절(v2.1~v2.5 + FE 요청 3건). BE는 `C:\worktrees\zm-154-be-followup` 미커밋 · :3000 미반영
- 누적 대상 **18개 파일**(이번 증분 추가: `types/apm.ts`·`hooks/useApm.ts`·`ApmServiceTransactionsTab.tsx`·픽스처·`ApmServiceTransactionsTab.test.tsx`)
- 작업 보고: `reports/zm-154_fe-followup.md` "v2 연동" 절

| 층 | 변경 |
|---|---|
| 계약 타입·픽스처 | `TApmExportParams.method` · `TApmExportDownloadParams`(+`planToken`) · `TApmExportPlan` += `q`·`method`·`planToken`·`planTokenExpiresAtMs` · 엔드포인트 필터 샘플 신규 |
| 훅 | 계획 쿼리 키에 `method` |
| 화면 | 트랜잭션 탭이 표의 `keyword`·`httpMethod`를 버튼에 전달 · 모달이 `method`를 `endpoints`에서만 싣고, 다운로드에 `planToken`, `APM_EXPORT_INVALID`/만료 시 계획 `refetch()` + 모달 안 info 안내, "적용 필터" 줄 |
| i18n | kr/en 8키 19줄씩 삽입 |
| 테스트 | `ApmExportButton` +4 · `ApmServiceTransactionsTab` +2 · `apmExportApi` +1 |

의도(v2)
- 재조회 후 **자동 재다운로드 안 함** — 새 계획(행 수·`allowed`)을 사용자가 보고 다시 누른다. 버린 대안: 재조회 결과로 즉시 이어 받기 — `refetch()` 반환이 언랩 전 envelope이라 언랩 깊이 함정 + 사용자가 못 본 계획으로 파일이 나간다.
- invalidate 대신 `refetch()` — 활성 쿼리 하나라 동일 효과, 화면 테스트에 QueryClient 의존을 새로 만들지 않음.
- 적용 필터는 **계획 응답값** 표시(요청값 아님).

중점 확인 요청(v2)
11. `method`가 `endpoints` 밖으로 절대 나가지 않는가(계획·다운로드 둘 다, 권한·데이터셋 바뀐 state 포함).
12. 다운로드 파라미터가 계획 파라미터와 **정확히 같고** `planToken`만 더해지는가(토큰 지문 불일치 = INVALID). 쿼리 키에 `method`가 빠진 경로가 없는가.
13. INVALID → 재조회 → 재조회도 INVALID(파라미터 자체 오류)일 때 루프·영구 잠금이 없는가.
14. 만료 판정(`<=`, 클라이언트 시계)과 BE 만료의 어긋남 — 늦은 시계면 BE INVALID 경로로 수렴하는가.
15. 재조회 중 버튼 잠금(`planSettled`)과 안내 표시·해제 시점(옵션 변경·재클릭)이 자연스러운가.
16. 픽스처가 계약 v2.2 필드 순서·타입과 맞는가(`planTokenExpiresAtMs` long → number).

검증(v2): `tsc` 0 · `typecheck:contract` 0 · eslint(15개) 0 · jest 7 스위트 **147/147** · 고아 워커 0 · ❌ 브라우저·런타임 미실시(:3000에 v2 BE 없음)

---

## 검수 결과(코덱스 v1)

- 결과 원문: [`review_zm-154-fe-followup_codex.md`](%EA%B2%80%EC%88%98-ZM-154-FE-%ED%9B%84%EC%86%8D-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 판정 **수정 후 재검수**(필수 R1 · 권장 R2~R5)
- 반영: 2026-09-28 Claude, 같은 워크트리 `C:\worktrees\zm-154-fe-followup` · **미커밋**(반영 커밋 없음 → 위치는 파일:줄) · 5건 전부 반영(미반영 없음)
- 누적 대상 **22개 파일**(수정 17 · 신규 5). 이번 반영에서 추가된 것: `src/constants/apiBaseUrl.ts`·`__mocks__/apiBaseUrlMock.js`·`jest.config.cjs`(매핑 1줄)·`src/__tests__/axiosCallerSignal.test.ts`

| 번호 | 심각도 | 요지 | 상태 · 반영 위치 |
|---|---|---|---|
| R1 | 필수 | v1 BE(토큰 없음)에서 엔드포인트 필터가 빠진 전량 파일을 정상 파일로 저장 | [x] v2 네 필드 **옵셔널**(`src/types/apm.ts:3700~3717`, v1/v2 혼재 모델) · 판정 `apmExportNeedsServerFilterSupport`(`shared/apmExport.ts:88`: 계획에 `planToken` 없음 + `endpoints` + `q`/`method` 있음) → `ApmExportModal.tsx:152` `filterUnsupported`가 내려받기 잠금·클릭 가드, `:524` 경고 Alert("서버 버전이 낮아… 필터를 지우면 전체 엔드포인트를 내보낼 수 있습니다"), "적용 필터" 줄은 "지원 안 함(서버 버전)". 필터 없으면 v1 동작(`:222` `planToken ?? null` → 요청에서 빠짐). v1 `error-groups`의 `q`는 v1 조건이라 허용(아래 #5에 따라 v1 계획엔 "적용 필터" 줄 없음). 픽스처 v1 표본 `APM_EXPORT_PLAN_V1_ENDPOINTS_SAMPLE`(`fixtures/apmExportContractSample.ts:198`) · 테스트 3건(`ApmExportButton.test.tsx` "blocks a filtered endpoints export when the server is v1" · "keeps the v1 behaviour" · "v1 server: error-groups q") |
| R2 | 권장 | 호출부 취소 직후 같은 키 새 요청 등록 시 취소된 요청이 영구 pending | [x] 호출부 중단 표식 `callerAbortedSignals`(`services/linkCallerSignal.ts:60`) · 응답 인터셉터가 표식이면 맵 판정 전에 무조건 reject(`services/axiosInstance.ts:187`). signal 없는 중복 취소 → 대체 요청 있으면 pending 규칙 유지(테스트로 고정). 재현 테스트 `axiosCallerSignal.test.ts` "R2: a caller abort still rejects even if a same-key request registers right after" + 기존 규칙 테스트 |
| R3 | 권장 | abort 리스너가 요청 완료 시 안 떨어져 장수명 signal에 누적 | [x] `linkCallerSignal`이 unsubscribe 반환(`linkCallerSignal.ts:68`) → `config._unlinkCallerSignal`(`axiosInstance.ts:151`) → 성공(`:169`)·실패/취소/401 재시도 전(`:182`)에서 호출(재시도는 요청 인터셉터가 새로 연결). 테스트: 실제 인스턴스 성공·실패 후 `removeEventListener("abort")` 단언 2건 + 헬퍼 단위 1건 |
| R4 | 권장 | 클라이언트 시계로 만료 선판정 → 시계가 빠르면 영구 다운로드 불가 | [x] 선판정(`apmExportPlanExpired`)·`replanned.expired` 키 **삭제**, BE `APM_EXPORT_INVALID`를 만료 정본으로(`ApmExportModal.tsx:161~165` 주석, 재조회 흐름은 기존). 안내 문구 `replanned.invalid`를 "유효 시간이 지났거나 조건이 바뀌어…"로 넓힘. 테스트: 만료 시각이 1시간 지난 계획으로도 토큰을 실어 그대로 받는다(`ApmExportButton.test.tsx:615`), 기존 INVALID→재조회 테스트 유지 |
| R5 | 권장 | 401 재시도 테스트가 헬퍼 직접 호출이라 배선 회귀를 못 잡음 | [x] `import.meta.env`를 `src/constants/apiBaseUrl.ts`로 격리 + jest 매핑(`jest.config.cjs`, `aiBaseUrl`과 같은 방식) → **실제 `createDmoveApi` + 사용자 adapter** 테스트 `src/__tests__/axiosCallerSignal.test.ts`(8건: 기본 중단·R2·중복 규칙·R3 2건·401 재시도 3건 = 미중단 재시도 성공 / refresh 중 abort → 재시도 안 나감 / 재시도 도중 abort). **변이 확인**: 배선을 되돌린 4종 모두 빨간불 → 원복(아래) |

변이 확인(`axiosInstance.ts`만 바꿔 `axiosCallerSignal.test.ts` 실행, 끝나고 원본 복구·diff 동일 확인):
| 변이 | 결과 |
|---|---|
| M1 이전 구현(호출부 signal 덮어쓰기, 연결 없음) | 6/8 실패 |
| M2 호출부 중단 표식 검사 제거 | 1/8 실패(R2) |
| M3 리스너 떼기 호출 제거 | 2/8 실패(R3) |
| M4 401 재시도 구분 제거(첫 시도 인터셉터 signal을 호출부로 오인) | 2/8 실패(미중단 재시도·재시도 도중 abort) |

### 계약 v2 FE 요청 #4·#5(BE 코덱스 반영분, 같은 반영 회차에 함께 처리)

| 번호 | 요지 | 상태 · 반영 위치 |
|---|---|---|
| #4 | 보존 결손 헤더 `X-Apm-Export-Retention-Clipped`(true\|false)·`-Cutoff`(ms) 소비 — true면 저장 후 모달 안 경고(오류 아님) | [x] 🔴 인터셉터는 전역으로 안 바꿨다 — **옵트인 플래그 `returnHeaders`**(`axiosInstance.ts:24` 선언, `:175` 이 플래그일 때만 `{ data, headers }`). 다운로드만 사용(`apm.api.ts:1014`), 헤더 해석 `readRetentionHeaders`(`apm.api.ts:1053`, AxiosHeaders·평범한 객체 둘 다, 못 읽으면 null). 반환 타입 `TApmExportDownload`(`types/apm.ts:3654`). 모달: 저장 → `result.retentionClipped ?? plan.retentionClipped`(`ApmExportModal.tsx:236`, 헤더를 못 읽는 배포는 계획 판정으로 최소 요건) → true면 **모달을 닫지 않고** 경고 Alert(`:533`, "…{기준 시각} 이전 구간은 비어 있거나 일부만 있습니다. 파일은 저장되었습니다."). 테스트: api 3건(false·true+cutoff(AxiosHeaders)·헤더 없음=null) · 모달 3건(true=저장+경고+모달 유지 / false=닫힘 / 헤더 null+계획 true=기준 시각 없는 경고) · 실제 인스턴스 2건(기본은 본문만 = 다른 호출 영향 0 / 옵트인만 `{data, headers}`) |
| #5 | 계획 DTO `q`·`method`는 적용값 — `red-series`에서 `q`를 적용 필터로 보이지 말 것 | [x] "적용 필터" 줄은 **계획 응답 적용값만**(`ApmExportModal.tsx:275`, 요청값 폴백 삭제). 줄은 endpoints·error-groups에서 계획이 적용값 필드를 줄 때만(`:284`) — red-series 없음, v1 계획 없음(v1+엔드포인트 필터는 "지원 안 함"). 픽스처 red-series 표본 `q: null` 유지 + 적용값 주석. 테스트 2건(적용값 null이면 요청 `q`를 보여 주지 않음 / red-series 줄 없음) + v1 테스트 2건 갱신 |

- ⚠️ #5에서 error-groups의 적용 `q`는 계속 보인다(v2 계획이 적용값을 준다 — red-series만 항상 null). 지시문의 "트랜잭션 탭 endpoints만 표시된다"를 "red-series에는 표시하지 않는다"로 해석했다 — error-groups까지 숨겨야 하면 한 줄(`apmExportSupportsFilters`) 수정.
- 🔴 #4 주의: `returnHeaders` 옵트인은 인터셉터 반환 모양을 바꾸므로 **다운로드 외 호출에 쓰면 안 된다**(useDmoveQuery 언랩 깊이가 달라진다).

검증(반영 후): `tsc` 0 · `typecheck:contract` 0 · eslint(변경·신규 `.ts/.tsx`) 0 · jest `-w 2` **8 스위트 169/169**(`ApmExportButton` 30 · `ApmOverviewPage` 29 · `apmExportApi` 13 · `linkCallerSignal` 8 · `axiosCallerSignal` 10 · `ApmServiceTransactionsTab`·`ApmServiceDetailPage`·`apmAggScreens`) · 고아 워커 0 · ❌ 브라우저·런타임 미실시

재검수 요청 중점
1. R1 판정 조건이 충분한가 — `planToken` 부재를 "v1 BE"로 보는 것(v2는 `allowed=false`여도 항상 채운다, 계약 v2.2). `q`가 공백뿐이면 BE도 "안 보냄"이라 trim 기준으로 판정.
2. R2 표식은 **호출부 중단으로 끊긴 인터셉터 signal**에만 붙는가(중복 취소·고아 취소 경로 불변).
3. R3 unlink가 401 재시도에서 첫 시도 리스너를 떼고 재시도가 새로 잇는가(재시도 도중 abort 테스트가 이를 본다).
4. `apiBaseUrl` 격리가 런타임 동작을 바꾸지 않는가(`API_BASE_URL = import.meta.env.VITE_API_URL` 그대로).
5. #4 `returnHeaders`가 다운로드 외 경로로 새지 않는가 · 결손 경고 뒤 모달이 열린 채일 때의 재다운로드·닫기 흐름.
6. #5 적용값 표시 규칙(v1 계획 줄 숨김 포함)이 계약 의도와 맞는가.

## 검수 결과(코덱스 v2)

- 결과 원문: [`review_zm-154-fe-followup-v2_codex.md`](%EA%B2%80%EC%88%98-ZM-154-FE-%ED%9B%84%EC%86%8D-v2-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 판정 **수정 후 재검수**(필수 N1 하나)
- 반영: 2026-09-28 Claude, 같은 워크트리 · **미커밋**(위치는 파일:줄)

| 번호 | 코덱스 v2 판정 | 상태 |
|---|---|---|
| R1 | 닫힘 | [x] (v1 절 그대로) |
| R2 | 닫힘 | [x] |
| R3 | 닫힘 | [x] |
| R4 | 닫힘 | [x] |
| R5 | **부분**(신규 테스트는 실배선 통과, 그러나 env 격리가 기존 실배선 로더를 깨뜨림 = N1) | [x] N1 반영으로 완료 |
| #4 | 충족 | [x] |
| #5 | 충족 | [x] |
| **N1** | 필수 · `src/__tests__/support/realDmoveApi.ts:26` — `apiBaseUrl` 분리로 기존 `zm157RealWiring.test.tsx`의 커스텀 소스 로더가 로딩 단계에서 확정 실패(마커 `import.meta.env.VITE_API_URL` 부재 throw + 새 의존성 `../constants/apiBaseUrl`·`./linkCallerSignal` 미매핑) | [x] **커스텀 로더 제거 — 원본 모듈을 그대로 불러온다**: `loadRealDmoveApi(requireActual)`가 `requireActual("@/services/axiosInstance")`만 돌려준다(`realDmoveApi.ts:20~23`). env는 `jest.config.cjs` 매핑(`apiBaseUrlMock.js`)이 해결하고, 의존성은 jest 레지스트리를 그대로 타 앱 코드와 같은 모듈 인스턴스다(이전 로더의 수동 dependency map과 같은 의도, 더 강함 — 인터셉터 소스가 변환조차 안 거친다). 리덕스 스토어 대역은 사용처(`zm157RealWiring.test.tsx:38`)가 이미 `jest.mock("@/redux/store")`로 둔다. 시그니처·사용법·`installFakeHttp` 불변. `typescript` 런타임 import 제거 |

N1 검증
- `realDmoveApi` 사용처 grep: `src/__tests__/zm157RealWiring.test.tsx` 하나 → `npx jest src/__tests__/zm157RealWiring.test.tsx` **9/9 통과**(파일의 `it` 9개 전부). 소스를 읽어 `axiosInstance`·`VITE_API_URL`을 찾는 다른 스위트 없음(`readFileSync` 쓰는 스위트는 다른 파일을 읽거나 axios를 대역으로 둔다).
- 테스트 URL 기준 주소가 로더의 `http://api.test` → 매핑의 `http://localhost:3000`으로 바뀌지만 zm157은 주소 문자열을 단언하지 않는다(grep 0).
- 전체: `tsc` 0 · `typecheck:contract` 0(`realDmoveApi.ts`는 계약 게이트 포함 파일) · eslint 0 · jest `-w 2` **9 스위트 178/178**(zm157 9 + 기존 대상 8 스위트 169) · 고아 워커 0

최종 대상 **23개 파일**(수정 18 · 신규 5) — `git -C C:\worktrees\zm-154-fe-followup status --short` 기준
| 구분 | 파일 |
|---|---|
| 수정 | `jest.config.cjs` · `src/hooks/useApm.ts` · `src/locales/en.json` · `src/locales/kr.json` · `src/pages/application-monitoring/overview/ApmOverviewPage.tsx` · `src/pages/application-monitoring/services/detail/tabs/ApmServiceTransactionsTab.tsx` · `src/pages/application-monitoring/shared/apmExport.ts` · `src/pages/application-monitoring/shared/components/ApmExportButton.tsx` · `src/pages/application-monitoring/shared/components/ApmExportModal.tsx` · `src/services/apm.api.ts` · `src/services/axiosInstance.ts` · `src/types/apm.ts` |
| 수정(테스트) | `src/__tests__/ApmExportButton.test.tsx` · `src/__tests__/ApmOverviewPage.test.tsx` · `src/__tests__/ApmServiceTransactionsTab.test.tsx` · `src/__tests__/apmExportApi.test.ts` · `src/__tests__/fixtures/apmExportContractSample.ts` · `src/__tests__/support/realDmoveApi.ts`(N1) |
| 🆕 신규 | `src/services/linkCallerSignal.ts` · `src/constants/apiBaseUrl.ts` · `__mocks__/apiBaseUrlMock.js` · `src/__tests__/linkCallerSignal.test.ts` · `src/__tests__/axiosCallerSignal.test.ts` |

- 파일 목록 정정: `src/__tests__/linkCallerSignal.test.ts`는 **처음부터 신규**(1차 작업에서 새로 만든 파일, 미추적 `??`)다. 이동·재작성이 아니며, 1차 보고 §1 "신규" 표에도 신규로 적혀 있었다 — 이 목록이 정본.

## 검수 결과 요약(재검수 v3)
(코덱스 재검수 후 기입)

## 검수 결과(코덱스 v3) — 2026-09-28

- 대상: v2 잔여 N1. 원문 `review_zm-154-fe-followup-v3_codex.md`.
- N1 닫힘(커스텀 로더 제거 → `jest.requireActual` 실제 axiosInstance, zm157 9개 단언 유지, `API_BASE_URL` 값 불변, 다른 스위트 주소 가정 불변). 새 결함 0.
- **판정: 승인.** 커밋은 사용자 승인 대기. 브라우저 실측 미실시(:5173 본체는 master).
