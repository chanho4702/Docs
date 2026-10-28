# 검수 요청 — 리포트 관리 APM 탭 분리 + APM 전용 보존 설정 (report-management-apm-split)

- 요청: Claude · 2026-09-22 · 사용자 결정 "같은 화면 안 탭 분리 + APM 전용 보존 설정"
- 이슈 번호: 미정(커밋 전 사용자 확인)
- 대상: **미커밋 작업 트리** — BE 워크트리 `C:/worktrees/report-apm-be`(브랜치 `report-apm-split`, master `baed6ee` 기준, 수정 9 + 신규 2) · FE 워크트리 `C:/worktrees/report-apm-fe`(브랜치 `report-apm-split`, master `d47c0a5` 기준, 수정 12 + 신규 2)
- 계약(단일 진실원천): [`../contract_report-management-apm-split.md`](../06-API-%EA%B3%84%EC%95%BD/API-%EA%B3%84%EC%95%BD-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%ED%83%AD-%EB%B6%84%EB%A6%AC-APM-%EC%A0%84%EC%9A%A9-%EB%B3%B4%EC%A1%B4-%EC%84%A4%EC%A0%95-%28report-management-apm-split%29.md)(하단 🔄에 FE 요청·BE 변경 통보·답변) · 정적 QA [`../qa_report-management-apm-split.md`](../08-%EA%B2%80%EC%A6%9D-QA/integration-qa-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%ED%83%AD-%EB%B6%84%EB%A6%AC-APM-%EC%A0%84%EC%9A%A9-%EB%B3%B4%EC%A1%B4-%EC%84%A4%EC%A0%95.md) · 런타임 QA [`../e2e_report-management-apm-split.md`](../08-%EA%B2%80%EC%A6%9D-QA/functional-qa-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%ED%83%AD-%EB%B6%84%EB%A6%AC-APM-%EC%A0%84%EC%9A%A9-%EB%B3%B4%EC%A1%B4-%EC%84%A4%EC%A0%95.md)

## 범위

### BE
| 층 | 변경 |
|---|---|
| DB | `V66__report_retention_setting_apm.sql` — 단일 행에 `apm_enabled`·`apm_week_retention_weeks`·`apm_month_retention_months` 3열(IF NOT EXISTS, NOT NULL DEFAULT true/52/24) + 기존 값 복사 UPDATE(id=1) |
| 엔티티·DTO | `ReportRetentionSetting`(필드 3·`defaults()`·`updateApm`) · `RetentionSettingDto.apmFrom`(같은 3필드 shape, 새 DTO 없음) |
| EP | `ReportManagementController`: `GET/PUT /admin/reports/retention/apm` 신설(`ReportAdminAccess.require`, `@RequiresFeature` 없음, `UpdateRetentionSettingDto` 재사용). 기존 4 EP 불변 |
| 배치 | `ReportManagementService.runCleanup` 계열별 분기(호스트 그룹=기존 열, `kind()==APM` 소스=`apm_*`, 그 밖 소스=호스트 그룹 스위치). 반환 `int`→`CleanupResult(hostGroup, apm, other)` record. `ReportSchedule` 반환 문자열 `deleted={total} hostGroup={n} apm={n}` |
| 문서 | `ManagedReportSource#deleteOlderThan`·`ReportManagementService` Javadoc의 "보존은 한 벌" 문단 정정 |
| 테스트 | `ReportManagementServiceTest` 21(신규 6) · 신규 `ReportRetentionApmIT` 7(실 PG, V66 스키마·기존 열 불변·403·400) · `ApmReportSnapshotIT` 15 갱신. 회귀 `report.*`+`premium.apm.report.*`+`*ArchitectureTest` 116건 통과, IT skip 0 |

### FE
| 층 | 변경 |
|---|---|
| 페이지 | `pages/setting/ReportManagement.tsx` — antd `Tabs`(`host-group`/`apm`), 활성 탭 URL `?tab=`, APM 탭은 `licenseLoading \|\| allowsFeature("APM")`일 때만·없으면 접힘, 탭 전환 시 `offset`·`periodType`·`groupId`·`type` 제거, `destroyOnHidden` |
| 목록 | `ReportListTable` `kind` prop — `type` 고정 전송, 계열 필터·`type` 열 제거, APM은 그룹 필터·열 없음 + `groupId` 미전송, 대상 단위 행별, 행 키 `(type,id)`·삭제 배열 분리 유지 |
| 보존 폼 | `RetentionSettingForm` `kind` prop — 조회/저장 EP·쿼리 키·제목·설명이 계열별. 폼이 직접 조회(`enabled` 옵션으로 안 보이는 계열 EP 미호출) |
| api·hooks·상수 | `getApmRetentionSetting`/`updateApmRetentionSetting`(`/retention/apm`, `assertReportEnvelopeOk`) · `useApmRetentionSetting`/`useUpdateApmRetentionSetting` · `RETENTION_APM` 키 · `REPORT_TAB`·`resolveReportTab` |
| i18n | `report_management.tab_host_group`·`tab_apm`·`retention_title_apm`·`retention_desc_apm` 추가, `retention_desc` 정정, `page_guide.setting_report` 도움말 정정(kr/en) |
| 테스트 | 신규 `ReportManagement.test.tsx` 7 · `ReportListTable.test.tsx`·`RetentionSettingForm.test.tsx` 재작성(axios mock + 실제 훅으로 URL까지) · 픽스처 `reportRetentionContractSample.ts`(`typecheck:contract`). jest 40 + `apmRoutes` 40 · tsc 0 · eslint 0 |

## 의도 (선택 · 버린 대안)
- **같은 단일 행에 열 3개** — 버린 것: `kind` 열로 행을 나누기(PK 변경·기존 조회 전부 영향). 업그레이드 시 **기존 값을 복사**해 관리자가 바꿔 둔 보존이 조용히 52/24로 되돌아가지 않게 했다.
- **별도 EP `/retention/apm`(같은 shape)** — 버린 것: 기존 `/retention` 응답에 `apm` 객체 중첩(기존 FE·픽스처·타입 전부 변경). 같은 shape라 FE 폼·훅을 `kind` 하나로 재사용한다.
- **EP는 STANDARD(`report/`), `@RequiresFeature` 없음** — 설정값 자체는 STANDARD 데이터. 프리미엄을 뺀 빌드에서도 EP가 살아 FE가 라이선스 축 하나로만 탭을 숨긴다. `premium.apm`을 import하면 `LicenseArchitectureTest` A1이 막는다.
- **두 스위치 독립** — 호스트 그룹 `enabled=false`여도 `apm_enabled=true`면 APM은 지운다. 버린 것: 호스트 그룹 스위치를 전체 마스터로 두기(화면이 계열별 스위치를 보여 주는데 하나가 다른 하나를 덮으면 화면이 거짓말).
- **탭 = `type` 고정 필터**(목록 EP 불변) — 버린 것: 계열별 목록 EP 신설. 매핑 안 되는 행은 구조상 없다(`type`은 조립 시점에 결정).

## 중점 확인 요청
1. **V66 UPDATE의 안전성** — `ADD COLUMN … DEFAULT` 뒤 `UPDATE … WHERE id=1`: 행이 없을 때(신규 설치) 무해한지, PG에서 `ADD COLUMN NOT NULL DEFAULT`가 기존 행을 채우는 순서와 UPDATE가 같은 트랜잭션에서 충돌하지 않는지, 정적 QA 🟢B(멱등 아님)가 Flyway 재실행 시나리오(checksum 실패 뒤 repair)에서 문제되지 않는지.
2. **`runCleanup` 계열별 분기의 누락** — "그 밖의 소스는 호스트 그룹 스위치를 따른다"가 미래에 세 번째 계열이 붙었을 때 조용히 잘못된 보존을 쓰게 하는 함정은 아닌지(경고 로그나 명시적 실패가 나은지). `CleanupResult` 합계와 스케줄러 문자열 파싱 호환.
3. **트랜잭션 경계** — `updateApmRetentionSetting`이 `loadOrDefault()`(행 없으면 새 엔티티)→`save` 경로에서 호스트 그룹 열을 기본값으로 **덮어쓰지 않는지**(행이 없을 때 첫 저장이 APM 쪽이면 호스트 그룹 열은 defaults로 들어가야 함 — 의도된 동작인지 확인). 두 PUT이 동시에 오면 마지막 쓰기가 상대 열을 되돌리는 경합이 있는지(같은 행, 필드 단위 update이면 JPA dirty checking이 전체 열을 쓰는지).
4. **FE `kind` 분기의 회귀** — `RetentionSettingForm`이 조회를 직접 하게 바뀌면서 부모(`ReportManagement`)가 내려 주던 `initialValues`/`loading` 계약이 사라졌다. 다른 호출처가 없는지, `useEffect(setFieldsValue)`가 탭 전환·재조회 때 사용자가 편집 중인 값을 덮지 않는지.
5. **탭 전환 시 파라미터 제거가 `useQueryParams`의 다른 소비자를 건드리지 않는지**(같은 URL의 `id` 등). `?tab=` 값이 모르는 문자열일 때 `resolveReportTab`이 `host-group`으로 접는지.
6. **라이선스 축** — `licenseLoading`이 true인 동안 APM 탭이 보였다가 라이선스 없음으로 판명되면 접히는 깜빡임·활성 탭 유실이 있는지.
7. **i18n·도움말** — 정정된 `page_guide.setting_report`·`retention_desc`가 고객 문구 규칙(검수번호·§·HTML 금지)을 지키는지, kr/en 키 집합 동일.
8. 테스트가 위를 실제로 고정하는지(특히 3·4·5).

## 검증 현황
- ✅ BE 단위+IT 116건(IT skip 0, V66 실 PG 적용), FE jest 40+40·tsc·eslint·`typecheck:contract` 0.
- ✅ 정적 QA 차단 0·권장 1(반영: `destroyInactiveTabPane`→`destroyOnHidden`, 재테스트 7/7).
- ✅ 런타임 QA(:3001 워크트리 BE + Vite :5174, dev DB에 V66 적용 후): API 6항목·화면 7항목 통과, APM 저장이 호스트 그룹 값을 건드리지 않음(화면·API·DB), `/retention/apm` 탭 진입 1회, `groupId` 미전송, deprecated 경고 없음, :3000 옛 코드도 V66 뒤 정상. 보존 값·행 원상복구 확인.
- ❌ 미확인: 비관리자 403 런타임(USER 계정 비밀번호 불명 — IT·정적으로만) · 라이선스 없음 접힘 런타임(dev는 PREMIUM — jest로만) · V66 값 복사 실측(dev에 행 0건 — IT로만).

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정".
- 마지막에 중점 확인 요청 1~8 각각 판정 한 줄씩과 종합 판정(승인 / 수정 후 재검수).

---

## 반영 기록(FE)

- 반영: Claude(fe-engineer) · 2026-09-22 · 워크트리 `C:/worktrees/report-apm-fe`(브랜치 `report-apm-split`, **미커밋**)
- 검수 결과: [`review_report-management-apm-split-fe_codex.md`](%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%EB%B6%84%EB%A6%AC-FE-%EA%B2%80%EC%88%98-%EA%B2%B0%EA%B3%BC.md) — 판정 "수정 후 재검수", 차단 R1·R2·R3
- 재검증: jest 3스위트 **54/54** + `apmRoutes` **40/40** · `tsc --noEmit` **0** · eslint(바꾼 12파일) **0** · `typecheck:contract` **0** · i18n `report_management` 키 집합 kr/en 동일(45/45)

| R | 판정 | 반영 내용 |
|---|---|---|
| **R1** 탭 전환이 히스토리를 안 남김 | **반영** | `ReportManagement.tsx`에 `goToTab(next, replace)` 도입 — **사용자가 누른 전환은 `updateParams([...], false)`(push)**, 화면이 스스로 하는 정규화만 `replace`. 테스트를 `useQueryParams` mock에서 **진짜 `MemoryRouter`**로 바꿔 주소·히스토리를 직접 본다(호스트 그룹→APM→뒤로가기 = 호스트 그룹 복귀). 부수 수정: 정규화 판정을 접힌 값(`resolveReportTab` 결과)이 아니라 **URL 원본 문자열**과 비교하도록 고침 — 안 그러면 `?tab=cloud`가 "이미 host-group"으로 보여 주소가 영영 안 고쳐진다. 파라미터 없는 깨끗한 주소에는 기본 탭을 적지 않는다 |
| **R2** 미저장 입력이 조용히 사라짐 | **반영** | ① hydration 가드: `if (isHydrated && form.isFieldsTouched()) return;` — 손댄 폼은 재조회가 덮지 않는다. ② 탭 이탈 확인: `RetentionSettingForm`에 `onDirtyChange` 콜백 추가 → 부모가 `useRef`로 들고, dirty면 antd `Modal.confirm`(신규 키 `unsaved_title`·`unsaved_desc`·`unsaved_leave`, kr/en 동시) 후에만 이동. 저장 성공·언마운트 시 dirty 해제. **"부모에 계열별 draft 보존" 대신 확인창을 고른 이유는 계약서 `🔄 > FE 구현 메모`에 적었다** |
| **R3** GET 실패가 기본값으로 위장 | **반영** | 쿼리의 `isError`를 읽어 **실패 시 폼을 아예 그리지 않고** 오류 `Alert` + 재시도 버튼(`refetch`)만 보여 준다. `Form`의 `initialValues={RETENTION_DEFAULT}`를 제거하고(값은 서버에서만 온다) 저장 버튼에 `disabled={!retention}`. 신규 키 `retention_load_failed`·`retention_load_failed_desc`·`retention_retry`. 테스트 3건 추가(기본값 미표시·PUT 불가·재시도 성공) |
| **R4** 비허용 확정 후 URL 불일치 | **반영**(권장) | R1의 정규화 effect가 같이 처리 — 라이선스를 **읽는 중에는 주소를 건드리지 않고**(잠정값으로 정상 고객 딥링크를 지우지 않는다), 비허용이 확정되면 `tab=host-group`으로 `replace`. 로딩→비허용 rerender 테스트 + "정규화는 replace라 뒤로가기가 제자리를 맴돌지 않는다" 테스트 추가. 깜빡임 자체는 계약 §4.1의 optimistic 노출 정책이라 **그대로 둔다**(바꾸려면 계약 변경) |
| **R5** 상세 진입이 포인터 전용 | **반영**(권장) | APM 제목 `Typography.Link`에 `href={apmReportDetailPath(id)}`를 달아 Tab·Enter·새 탭 열기가 동작한다. 클릭 핸들러에서 `preventDefault`(전체 새로고침 방지) + `stopPropagation`(행 `onClick`과 겹친 **이중 이동** 방지) 후 SPA `navigate` 1회. 테스트 2건 추가(href 존재·이동 1회). 행 전체를 링크로 만들지는 **않았다** — `DmoveTable` 공용 컴포넌트에 `tabIndex`/`role`/Enter·Space/체크박스 전파 차단을 넣는 일은 이 화면 밖 25개 표에 영향을 주므로 별건으로 둔다 |

### v2 반영 (재검수 `review_report-management-apm-split-fe-v2_codex.md` — 차단 R1·R2)

- 재검증: jest **4스위트 105/105**(`ReportManagement` 19 · `ReportListTable` 42 · `RetentionSettingForm` 24 · `apmRoutes` 40) · `tsc --noEmit` **0** · eslint(바꾼 12파일) **0** · `typecheck:contract` **0** · i18n `report_management` 키 kr/en **50/50 동일**

| R(v2) | 판정 | 반영 내용 |
|---|---|---|
| **R1** `?tab=`(빈 값) 미정규화 | **반영** | `!rawTab` → **`rawTab == null`**. 파라미터 **부재**(손대지 않을 깨끗한 주소)와 **빈 값**(고쳐야 할 잘못된 주소)을 가른다. `?tab=` 테스트 추가 |
| **R1/R4** replace 테스트가 히스토리를 고정 못 함 | **반영** | 테스트를 `createMemoryRouter`(데이터 라우터) + `initialEntries: ["/origin", <page>]`로 바꾸고 **뒤로가기 한 번에 `/origin`에 닿는지**로 단언(모르는 값·라이선스 없음 두 경우 모두). 지적대로 탭만 보면 push여도 effect가 다시 접어 통과한다 |
| **R2(차단)** dirty 보호가 탭 클릭만 막음 | **반영** | 확인 로직을 클릭 핸들러에서 걷어내고 라우터 **`useBlocker`** 한 곳으로 모았다(앱은 `createBrowserRouter` 데이터 라우터라 사용 가능). 탭 클릭·**브라우저 뒤로/앞으로**가 같은 문을 지난다. `handleChangeTab`은 그냥 이동시키고, 블로커가 dirty + 같은 pathname + 탭이 달라질 때만 가로챈다. 뒤로가기 차단·취소 후 재이동(`reset`) 테스트 추가. 🔴 **pathname이 바뀌는 이동(화면 이탈)은 일부러 가두지 않는다** — 세션 만료 리디렉션·로그아웃까지 붙들면 보존 설정 한 칸 때문에 사용자가 갇힌다 |
| **R2** 라이선스 강제 전환의 dirty | **반영** | 확인창을 띄우지 않는다(“머무르기”를 눌러도 APM 탭은 이미 없다 — 되돌릴 선택지가 없는 확인은 거짓 선택이다). 대신 정규화 직전에 dirty면 `message.warning`(신규 키 `tab_apm_forced`, kr/en)으로 **입력이 저장되지 않았다는 사실**을 알리고 블로커를 통과시킨다. 폴링 중 회수 상황을 리렌더로 재현한 테스트 추가 |
| **R2** 확인창이 언마운트에 안 묶임 | **반영** | `Modal.confirm` 핸들을 ref에 보관하고 effect cleanup에서 `destroy()`. 화면 이탈 시 `destroy` 호출 테스트 추가 |
| **R2** 원격 변경을 조용히 무시 | **반영** | 폼에 **기준값(baseline)** 도입 — 최초 hydration·저장 성공 시 갱신. dirty인데 새 응답이 기준값과 다르면 충돌 `Alert`(신규 키 `retention_conflict*` 4개, kr/en) + **새로 불러오기 / 내 입력 유지** 두 버튼. "유지"는 기준값을 원격 값으로 옮겨 같은 경고를 반복하지 않는다. 🔴 저장 직후 재조회가 자기 저장에 자기가 경고하지 않는지까지 테스트로 고정(기준값 동반 이동) |
| **R5** 수정키 클릭 새 탭이 깨짐 | **반영** | `Typography.Link + preventDefault + navigate` → **React Router `Link to=`**, 우리가 하는 일은 `stopPropagation`(행 `onClick`과의 이중 이동 차단) 하나뿐. 테스트를 실물 라우터(`useNavigate`만 mock)로 바꿔 ① 일반 클릭 = 주소 1회 이동·행 핸들러 미호출 ② **Ctrl/⌘ 클릭 = 주소 불변·`navigate` 미호출**(브라우저에 위임)을 고정 |

#### v2에서 함께 처리한 것
- 페이지 테스트가 데이터 라우터를 쓰면서 jsdom에 없는 전역 `Request`가 필요해졌다 — **공용 `jest.setup.ts`가 아니라 그 파일 안에서만** 최소 스텁으로 폴리필했다(전역 폴리필은 다른 스위트의 동작을 조용히 바꾼다).
- 블로커 도입으로 이 페이지는 **데이터 라우터 안에서만 렌더된다**는 전제가 생겼다(운영 `createBrowserRouter` ✅, 테스트 `createMemoryRouter` ✅). 다른 곳에서 `MemoryRouter`로 감싸 재사용하면 `useBlocker`가 throw한다 — 페이지 주석에 명시.

### v3 반영 (3차 재검수 `review_report-management-apm-split-fe-v3_codex.md` — 차단 R2 1 + 보통 R2 1, R1·R3·R4·R5 닫힘)

- 재검증: jest **4스위트 109/109**(`ReportManagement` 19 · `ReportListTable` 43 · `RetentionSettingForm` 23 · `apmRoutes` 40) · `tsc --noEmit` **0** · eslint(바꾼 12파일) **0** · `typecheck:contract` **0** · i18n `report_management` kr/en **50/50 동일**

| R(v3) | 판정 | 반영 내용 |
|---|---|---|
| **R2(차단)** 라이선스 강제 전환 경고가 실제 폼에서는 누락 | **반영** | 지적한 순서가 정확했다 — 라이선스 회수 렌더에서 `visibleTabs`가 APM 탭을 먼저 빼고 `destroyOnHidden`이 폼을 지우면, **지워진 자식의 passive cleanup(`onDirtyChange(false)`)이 부모의 정규화 effect보다 먼저** 돈다. 부모에 `dirtyAtCommit` ref를 두고 **`useLayoutEffect`**(언마운트 passive cleanup보다 앞선 단계)에서 그 커밋의 dirty를 떠 둔 뒤, 경고 판정이 `isRetentionDirty \|\| dirtyAtCommit`을 본다. 테스트 stub에 **실제 폼과 같은 unmount cleanup**을 넣어 순서를 재현하고 경고 **1회**를 단언. 🔴 수정을 되돌리면 그 테스트가 실패하는 것까지 확인했다(빈손 통과가 아니다) |
| **R2(보통) ①** 원격이 기준값으로 복귀해도 경고가 남음 | **반영** | 충돌 분기에 **반대 분기**를 넣었다 — `setConflict(같으면 null, 다르면 최신 응답)`. 원격 B→A 복귀 시 경고 소멸 + 내 입력 유지 테스트 추가 |
| **R2(보통) ②** "새로 불러오기"가 낡은 값을 적용 | **반영** | 보관해 둔 충돌 값이 아니라 **현재 최신 응답(`retention`)** 을 적용한다. 경고(B) 뒤 서버가 C로 바뀐 상태에서 눌러 **C가 들어가는지** 테스트 추가. `내 입력 유지`의 기준값 갱신도 최신 응답 기준으로 통일 |
| **R2(보통) ③** dirty 판정 축이 둘(antd touched ↔ 부모 dirty) | **반영** | 폼에 **명시적 `isDirty` ref 한 축**을 두고 hydration·충돌 판정·부모 통지가 전부 그것만 본다. 값 적용은 `resetFormTo()` 단일 통로로 모아 **antd touched까지 함께 초기화**(`resetFields()` → `setFieldsValue()`, 같은 커밋이라 깜빡임 없음) + 기준값·충돌·부모 dirty를 한 번에 맞춘다. 저장 성공·원격 수용 모두 이 통로를 쓴다. "원격 수용 후 재조회가 충돌을 만들지 않는다"·"저장 뒤 재조회는 조용히 반영된다" 테스트 추가 |
| **(functional-qa 2차 🟢2)** 정적 `Modal.confirm`이 테마 컨텍스트를 못 읽음 | **반영** | 이 앱에는 antd `App` 래퍼가 없어(`App.useApp()`은 정적으로 폴백) **`Modal.useModal()` + `contextHolder`** 로 교체했다. 다크 모드에서 확인창만 라이트로 뜨는 문제와 `Static function can not consume context like dynamic theme` 경고가 사라진다. 핸들 `destroy()` 정리는 그대로. 테스트 mock도 훅 경로로 바꿔(정적 함수로 되돌리면 스위트가 깨진다) contextHolder 렌더까지 단언 |

#### v3에서 갱신한 기존 테스트
- v2에서 **저장을 "재조회 트리거"로 쓰던 4건**(`손댄 폼은 재조회가 덮지 않는다`·`충돌 알림`·`새로 불러오기`·`내 입력 유지`)을 `queryClient.invalidateQueries()` 기반의 **순수 원격 변경**으로 바꿨다. v3 ③ 이후 저장은 dirty를 정상적으로 내리므로, 저장을 트리거로 쓰면 그 시나리오가 더 이상 "손댄 폼" 상황이 아니다 — 옛 방식이 통과하려면 오히려 ③을 되돌려야 했다.

### v4 반영 (4차 재검수 `review_report-management-apm-split-fe-v4_codex.md` — 차단 0, 보통 R2 1건)

**R2(보통) `resetFormTo()`의 touched 초기화가 실제로는 안 됐다 — 반영.** 지적이 정확했다: `resetFields()` 뒤의 `setFieldsValue()`는 `rc-field-form`이 **외부 값 주입을 사용자 입력처럼 취급해**(`Field.js`의 `valueUpdate` + `source:"external"`) touched를 다시 올린다. `initialValues`가 없어 reset 직후 값이 `undefined`라 세 필드가 전부 되살아났다. → 값과 `touched: false`(+`errors: []`)를 **한 번에 명시하는 `form.setFields()`** 로 교체. 실제 `form.isFieldsTouched()`를 보는 테스트 3건 추가(저장 성공 후 · 원격 수용 후 · **최초 hydration 직후**), 옛 구현으로 되돌리면 그 3건이 실패하는 것까지 확인했다 — 그중 hydration 건이 실패한다는 사실은 **첫 조회만으로도 폼이 touched였다**는 뜻이라, 이 지적이 잡은 범위가 저장·수용 경로보다 넓었다. 재검증: `RetentionSettingForm` **26/26**(4스위트 합계 **112/112**) · `tsc` **0** · eslint **0** · `typecheck:contract` **0**.

### 반영하지 않은 것
- **R4의 "깜빡임 제거"** — 노출 정책(`licenseLoading || allowsFeature`)은 계약 §4.1이 홈과 맞춰 정한 축이라 FE 단독으로 바꾸지 않았다. URL 정규화까지만 반영.
- **R5의 "행 전체를 접근 가능한 링크로"** — 공용 `DmoveTable` 변경이 필요해 범위 밖(위 표 참조).
- ~~**원격 변경 알림**~~ — v2에서 **반영으로 뒤집었다**(위 표). 1차의 "토스트와 섞인다"는 사유는 재검수 지적대로 **데이터 충돌 위험을 해소하지 못한다**. 토스트가 아니라 폼 안의 충돌 `Alert`로 두어 "내 행동의 결과"와 섞이지 않게 했다.

### v2에서도 반영하지 않은 것
- **화면 전체를 떠나는 이동의 dirty 보호** — 블로커를 pathname 변경까지 넓히지 않았다(위 R2 참조). 세션 만료·로그아웃 리디렉션을 붙들면 사용자가 갇히고, 그 판단은 이 화면 혼자 내릴 일이 아니다. 필요하면 전역 정책으로 따로 다룬다.
- **행 전체를 접근 가능한 링크로** — 1차와 같다(공용 `DmoveTable` 25개 표에 영향).
- **라이선스 콜드 로드 깜빡임** — 계약 §4.1의 optimistic 노출 정책이라 FE 단독으로 바꾸지 않는다(재검수도 사유 타당 판정).

---

## 반영 기록(BE)

코덱스 BE 검수([`review_report-management-apm-split-be_codex.md`](%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%EB%B6%84%EB%A6%AC-BE-%EA%B2%80%EC%88%98-%EA%B2%B0%EA%B3%BC.md), 판정 "수정 후 재검수", 차단 R1) 반영. 워크트리 `C:/worktrees/report-apm-be`, 미커밋.

| R | 판정 | 반영 내용 |
|---|---|---|
| **R1** 두 PUT의 lost update | **반영(차단 해소)** | `ReportRetentionSettingRepository`에 `findByIdForUpdate`(`@Lock(PESSIMISTIC_WRITE)` + JPQL)와 `insertDefaultsIfAbsent`(native `insert … on conflict (id) do nothing`) 추가. 두 저장 메서드가 새 `loadForUpdate()`로 **행을 잠그고** 읽는다(둘 다 기존 `@Transactional`). 읽기 경로(`getRetentionSetting`·`getApmRetentionSetting`·`runCleanup`)는 잠그지 않는다 — 화면 진입이 저장을 줄 세우면 안 된다. **행이 없을 때의 첫 저장 경합**은 `save(defaults())`를 버리고 `ON CONFLICT DO NOTHING` → 재잠금 읽기로 바꿔 중복 키 500을 없앴다(INSERT에 값을 적지 않고 **열 기본값**에 맡겨 `defaults()`·마이그레이션과 숫자가 갈리지 않게 했다). 회귀 고정: `ReportRetentionApmIT`에 **실제 두 트랜잭션이 겹치는 IT 2건** — ① 래치로 T1이 잠금을 쥔 동안 T2를 띄우고 `t2.isDone()==false`로 **실제로 기다리는지**를 단언 → T1 커밋 후 둘 다 완료 → 양쪽 값 모두 보존 확인, ② 행을 지운 뒤 두 저장을 배리어로 동시 출발시켜 중복 키 없이 둘 다 반영. 단위 1건(멱등 INSERT→재잠금 호출 순서). `@DynamicUpdate`는 쓰지 않았다 — 잠금으로 직렬화하면 전 열 UPDATE여도 최신 값을 다시 읽으므로 불필요하고, 열 단위 UPDATE 최적화는 이 표(하루 몇 번 쓰기)에 의미가 없다 |
| **R2** 세 번째 계열의 조용한 fallback | **반영** | `runCleanup`의 정책 선택을 `private SeriesRetention retentionFor(ReportKind, …)`의 **`default` 없는 enum switch 식**으로 교체 — 새 `ReportKind`가 생기면 **여기서 컴파일이 깨진다**. "`default ->`를 붙여 이 검사를 무력화하지 말 것"을 주석에 못 박았다. 스케줄러 요약은 `deleted={total} hostGroup={n} apm={n}`이고 **`other`가 0이 아닐 때만** ` other={n}`을 덧붙인다(합계와 표시 계열이 어긋나지 않는다 / 지금은 `other` 계열이 없어 매일 `other=0`을 찍으면 이력만 길어진다). `Report cleanup done …` 로그에는 `other`를 **항상** 적는다. `ReportScheduleTest` 3건으로 고정 |
| **R3** V65→V66 비기본값 복사 미검증 | **반영(방식 변경)** | Flyway `target("65")`는 **쓰지 않았다** — 이 IT의 DB는 이미 V66까지 적용돼 있어 V65 상태를 만들려면 다른 DB/스키마에 V1~V65를 통째로 재적용해야 하고, 수십 개 마이그레이션의 실행 시간과 기본 스키마를 전제로 쓴 마이그레이션들의 위험을 이 한 가지 확인에 치르게 된다. 대신 **V65 시점의 표 모양을 실제 표에서 떠서**(`LIKE public.report_retention_setting INCLUDING ALL` 후 V66이 더한 열 3개 DROP) 격리 스키마 `v66_probe`에 만들고, **V66 파일을 classpath에서 글자 그대로 읽어** `search_path`로 그 스키마에 적용한다(검증 대상 SQL은 한 글자도 바뀌지 않는다). IT 2건: ① `false/30/12`가 `apm_*`에 그대로 복사되고 원래 열·`updated_at`도 그대로, ② 행이 없는 새 설치본에서 UPDATE 0건이 무해하고 이후 들어오는 행은 기본값 `true/52/24`를 받는다. 🔴 `search_path`는 커넥션에 남는 상태라 설정·실행·복구를 **한 `ConnectionCallback` 안에서** 끝냈다(다른 커넥션에서 되돌리면 오염된 커넥션이 그대로 풀로 돌아간다) |
| **R5** 스케줄러 요약 문자열 미고정 | **반영** | 신규 `ReportScheduleTest` 3건 — `CleanupResult(5,3,0)`→`deleted=8 hostGroup=5 apm=3`, `(5,3,2)`→`deleted=10 hostGroup=5 apm=3 other=2`, `(0,0,0)`→`deleted=0 hostGroup=0 apm=0`(지운 게 없어도 실행됐다는 증거는 남는다) |
| **R4** V66 주석이 재실행 안전성을 과장 | **반영** | "`IF NOT EXISTS`는 공유 dev DB의 **DDL 충돌**을 막기 위한 것이지 파일 전체가 재실행 안전하다는 뜻이 아니다 / 손으로 재실행하면 UPDATE가 APM 값을 덮는다 / 정상 경로에서는 Flyway가 적용 완료 migration을 재실행하지 않고(`repair`도 마찬가지) PG에서 ALTER와 UPDATE가 한 트랜잭션이다"로 한정 |
| **R6** `ReportAdminAccess` "6개 EP" | **반영** | 8개로 갱신 + 열거를 `ReportManagementController` 6개(APM 보존 둘 포함) / `ApmReportController` 2개로 나눠 적었다 |

**검증**: 회귀 `report.*` + `premium.apm.report.*` + `*ArchitectureTest` = **124건 통과 / 실패 0 / 에러 0 / skip 0**(도커 5433 살아 있었음). 이번 반영으로 늘어난 테스트 **8건**(IT 4 + 단위 4), IT 총 11건. IT 실행 전·후 다른 워크트리의 gradle 테스트 워커 0 확인(단독 실행).

**반영하지 않은 것**: 없음(R1~R6 전건 반영). 다만 R3은 위 표대로 **검증 방식**을 Flyway 타깃 대신 격리 스키마 + 원본 SQL 실행으로 바꿨다.

### v2 반영
재검수([`…-be-v2_codex.md`](%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%EB%B6%84%EB%A6%AC-BE-%EC%9E%AC%EA%B2%80%EC%88%98-%EA%B2%B0%EA%B3%BC.md), **승인·차단 없음**)의 권장 2건을 **테스트 파일에서만** 반영(운영 코드 무변경). **R1(테스트 결정성)**: `Thread.sleep(800)`을 걷어내고 `awaitBlockedOnLock`(= `pg_stat_activity`에서 `wait_event_type='Lock'`인 백엔드를 폴링)으로 **"실제로 잠금을 기다리는 중"이라는 DB의 사실**을 확인한 뒤에야 `isDone()==false`를 단언한다 — 운영 코드에 테스트 훅을 넣지 않은 이유는 필요한 신호가 "저장 메서드 진입"이 아니라 "JDBC 호출 안에서 막혀 있음"이고 그 사실은 자바 쪽에 존재하지 않기 때문이다(행 잠금 `transactionid`와 speculative insert `SpeculativeToken` 둘 다 이 부류로 보고된다). 기다려야 할 쪽이 먼저 끝나거나 20초 안에 아무도 막히지 않으면 **테스트가 실패**한다. 첫 저장 경합 테스트는 `CyclicBarrier`를 버리고 A를 **INSERT 직후·커밋 전**에 붙잡아, B의 첫 조회도 "행 없음"이 되는 interleaving을 매번 성립시킨다. **R3(정리 보장)**: 격리 스키마 준비를 `createV65ShapedProbeTable()`로 묶고 정리를 `@AfterEach dropProbeSchema()`로 옮겨 **준비 단계에서 터져도** `v66_probe`가 남지 않게 했다(테스트 안 `finally`로는 만들 수 없는 보장).

검증(단독 실행, 다른 gradle 워커 0 확인): `ReportRetentionApmIT` **11** · `ReportManagementServiceTest` **22** · `ReportScheduleTest` **3** — 합 **36건, 실패 0 / 에러 0 / skip 0**. 실행 뒤 `moveseye_it`에 `v66_probe` 잔여 0 확인.


---

## 최종 상태 (2026-09-22)

| 레포 | 코덱스 왕복 | 최종 판정 | 검증 |
|---|---|---|---|
| BE | 1차(차단 R1 lost update) → v2 **승인**(권장 2건 테스트 보강 반영) | ✅ 승인 | 회귀 124건·IT skip 0, 관련 3클래스 36건 |
| FE | 1차(차단 R1·R2·R3) → v2(차단 R1·R2) → v3(차단 R2) → v4(보통 1) → v5 **승인** | ✅ 승인 | jest 112건·tsc·eslint·계약 게이트 0 |

- 런타임 QA 1차·2차 통과(`../e2e_report-management-apm-split.md`) — 동시 저장 잠금 30/30, dirty 보호·GET 실패·원격 충돌·링크.
- 🟡 병합 전: dev DB(5433) V66 체크섬 드리프트 → `flyway repair` 1회(사용자 결정 대기).
- 커밋: 이슈 번호 확인 → BE 13파일·FE 14파일, 사용자 승인 대기.

**이슈·커밋(09-22)**: 사용자 위임으로 Jira **ZM-167** 발급(기존 티켓 없음). BE master `5f6b0b2` · FE master `34028f2`(각 워크트리에서 커밋 → master 위로 리베이스 → 사후 검증(BE 단위 25·FE jest 72·tsc·계약 게이트) → ff 병합). dev DB(5433) V66 체크섬 277040461→317686038 정정(repair 상당). 미푸시. 워크트리·브랜치 정리됨.
