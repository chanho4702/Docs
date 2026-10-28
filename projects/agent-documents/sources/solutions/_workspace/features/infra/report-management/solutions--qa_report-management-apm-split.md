# integration-qa — 리포트 관리 APM 탭 분리 + APM 전용 보존 설정 (report-management-apm-split)

- 작성: integration-qa / 2026-09-22 · 정적 대조만(앱 미기동, 빌드·테스트 미실행) — 런타임은 functional-qa 몫
- 계약(단일 진실원천): [`features/infra/report-management/contract_report-management-apm-split.md`](contract_report-management-apm-split.md) (🔄 FE 요청·오케스트레이터 답변·BE 변경 통보 5건 포함)
- 대상 코드: BE 워크트리 `C:/worktrees/report-apm-be`(브랜치 `report-apm-split`, master `baed6ee` 위 미커밋 8수정+2신규) · FE 워크트리 `C:/worktrees/report-apm-fe`(브랜치 `report-apm-split`, master `d47c0a5` 위 미커밋 12수정+2신규)
- 기준선(읽기만): `C:/solutions/moveseye-be-spring`(마이그레이션 최신 V65) · `C:/solutions/moveseyee_fe`(`HomePage.tsx:36-37`)

> 아래 줄 번호는 워크트리 **작업 트리 파일** 기준이다(diff hunk 번호가 아님).

---

## 판정 요약

| # | 항목 | 판정 | 비고 |
|---|---|---|---|
| 1 | 신설 EP 경로·메서드 / 라우팅 충돌 | ✅ | GET·PUT `/admin/reports/retention/apm` 양쪽 일치, `ApmReportController`와 세그먼트가 달라 충돌 없음 |
| 2 | 응답 shape 3필드 ↔ `TRetentionSetting` / `/retention` 불변 / 언랩 깊이 | ✅ | `apmFrom` 3필드 동일 이름·타입, `apm*` 필드 미혼입, 새 훅도 `useDmoveQuery` 1겹·소비자 과다 언랩 없음 |
| 3 | 요청 body ↔ `UpdateRetentionSettingDto` / 범위 | ✅ | 3필드 전부 필수, 1~520 / 1~120 = `RETENTION_LIMITS` |
| 4 | 오류 envelope(403 FORBIDDEN·400 INVALID_DATA) 처리 | ✅ | PUT은 `assertReportEnvelopeOk`, GET은 `useDmoveQuery` 실패 envelope throw — 기존 두 함수와 동일 경로 |
| 5 | 목록 `type` 고정값 / APM 탭 `groupId` 미전송 / 행 키·삭제 배열 | ✅ | `HOST_GROUP`·`APM` ∈ `ReportKind.parse`, APM 탭 `groupId: undefined`, `(type,id)` 키·`splitReportDeleteIds` 유지 |
| 6 | V66 ↔ 엔티티 / `defaults()` / 번호 충돌 | ✅ | 열 이름·타입·NOT NULL·DEFAULT 일치, `defaults()` true/52/24, master 최신 V65라 V66 충돌 없음 |
| 7 | cleanup 계열별 로직 / BE 변경 통보 4건의 FE 영향 | ✅ | 조기 반환 제거·두 스위치 독립·APM만 `apm_*` cutoff, 통보 4건 모두 FE 면 영향 0 |
| 8 | i18n 새 키 4개 kr/en 동시 존재 / 코드 참조 키 전수 / 도움말 문구 | ✅ | 31개 참조 키 전부 양쪽 JSON에 존재, 도움말에 검수번호·§·HTML 태그 없음 |
| 9 | 계약 픽스처가 `tsconfig.contract.json` 범위 안 | ✅ | `src/__tests__/fixtures/` include, `*.test.ts(x)`만 exclude |
| 10 | 라이선스 게이팅 축 = `HomePage.tsx:37` | ✅ | 같은 훅 `useLicense`·같은 식 `licenseLoading \|\| allowsFeature("APM")` |

**🔴 차단 0 · 🟡 권장 1 · 🟢 참고 4** — functional-qa로 넘겨도 된다.

---

## 항목별 근거

### 1. 신설 EP 경로·메서드 ✅

| 면 | 근거 |
|---|---|
| BE 베이스 | `ReportManagementController.java:42` `@RequestMapping("/admin/reports")` |
| BE GET | `:116` `@GetMapping("/retention/apm")` → `getApmRetention` → `reportManagementService.getApmRetentionSetting()` (`:119`) |
| BE PUT | `:129` `@PutMapping("/retention/apm")` → `updateApmRetention(@Valid @RequestBody UpdateRetentionSettingDto)` (`:130-132`) |
| FE GET | `services/report-management.api.ts:17` `baseUrl = "admin/reports"`, `:94-95` `API.get(\`${baseUrl}/retention/apm\`)` |
| FE PUT | `:103-104` `API.put(\`${baseUrl}/retention/apm\`, body)` |

**라우팅 충돌 판단 — 없음.**
- APM 리포트 본문 컨트롤러 `premium/apm/report/ApmReportController.java:56` `@RequestMapping("/admin/reports/apm")` + `:73` `@GetMapping("/{id}")` + `:109` `@GetMapping("/detail")`. 이 패턴들은 세그먼트가 `[admin, reports, apm, *]`이고 신설 EP는 `[admin, reports, retention, apm]`이라 3번째 세그먼트(`apm` ≠ `retention`)에서 갈린다 — Spring `PathPattern` 매칭에 애매함이 없다.
- `ReportManagementController` 안에는 경로 변수(`/{...}`) 매핑이 하나도 없어(`:59` 루트, `:76` 루트 DELETE, `:87`·`:95` `/retention`) `/retention/apm`이 다른 핸들러에 잡힐 여지가 없다.
- 계약 §0.5의 두 금지(`premium.apm` import 금지 · `@RequiresFeature` 미부착)도 지켜졌다 — `report/*.java`·`report/dto/*.java`에 `import com.dmove.moveseye.premium` 0건, 컨트롤러 `:104-136`에 `@RequiresFeature` 없음.

### 2. 응답 shape · `/retention` 불변 · 언랩 깊이 ✅

| BE `RetentionSettingDto` (`report/dto/RetentionSettingDto.java`) | FE `TRetentionSetting` (`types/report-management.ts`) | 일치 |
|---|---|---|
| `boolean enabled` (`:382`) | `enabled: boolean` (`:90`, 필수) | ✅ |
| `int weekRetentionWeeks` (`:383`) | `weekRetentionWeeks: number` (`:91`, 필수) | ✅ |
| `int monthRetentionMonths` (`:384`) | `monthRetentionMonths: number` (`:92`, 필수) | ✅ |

- APM 팩토리 `apmFrom(e)` `:395-400`이 `isApmEnabled()`·`getApmWeekRetentionWeeks()`·`getApmMonthRetentionMonths()`를 **같은 3필드 이름**에 담는다 — 새 DTO 없음(계약 §2.1). record라 Lombok `isXxx` 키 변형 함정도 없다.
- **`/retention` 응답에 `apm*` 미혼입**: GET `/retention` 핸들러 `:87-92`는 `getRetentionSetting()` → `RetentionSettingDto.from()`(`ReportManagementService.java:178-180`) 그대로이고, DTO에 `apm*` 필드가 아예 없다. IT `ReportRetentionApmIT.getReturnsThreeFields`(`:535-536`)가 `$.data.apmEnabled`·`apmWeekRetentionWeeks` `doesNotExist()`로 못 박는다.
- **언랩 깊이**: `useApmRetentionSetting`(`hooks/useReportManagement.ts:103-109`)이 `useDmoveQuery<TRetentionSetting>`를 쓴다(기존 `useRetentionSetting` `:88-94`와 같은 모양). `useDmoveQuery.ts:61-65`가 `envelope.data`를 한 겹 벗겨 돌려주므로 소비자 `RetentionSettingForm.tsx:60` `const { data: retention } = isApm ? apmQuery : hostGroupQuery` → `:70` `form.setFieldsValue(retention)` — `.data`를 한 번 더 벗기지 않는다 ✅. 테스트 `RetentionSettingForm.test.tsx`의 `ok()` 헬퍼(`{status,code,data}`)가 인터셉터 1겹 벗긴 뒤 모양을 흉내 내고 화면에 `26`/`12`가 뜨는지 보므로 깊이가 어긋나면 그 테스트가 잡는다.

### 3. 요청 body ✅

| BE `UpdateRetentionSettingDto.java` | FE |
|---|---|
| `@NotNull Boolean enabled` (`:19-20`) | `TRetentionSetting.enabled: boolean` 필수 — PUT body 타입이 `TRetentionSetting`(`api.ts:100-101`) |
| `@NotNull @Min(1) @Max(520) Integer weekRetentionWeeks` (`:22-25`) | `RETENTION_LIMITS.WEEK_MIN=1 / WEEK_MAX=520`(`constants/report-management.ts:13-14`) → `InputNumber min/max`(`RetentionSettingForm.tsx:138-139`) + `required` 룰(`:131-134`) |
| `@NotNull @Min(1) @Max(120) Integer monthRetentionMonths` (`:27-30`) | `MONTH_MIN=1 / MONTH_MAX=120`(`:15-16`) → `InputNumber min/max`(`:157-158`) + `required`(`:150-153`) |

- 폼 제출값은 `handleSubmit(values: TRetentionSetting)`(`:74`) 그대로 `updateRetention(values)` — 여분 필드도, 누락 필드도 없다. `precision={0}`(`:140`,`:159`)라 정수만 나간다.
- BE는 `/retention`과 `/retention/apm`이 **같은 DTO**(`Controller:98`·`:132`)이므로 검증 규칙이 갈릴 수 없다(계약 §2.2 "재사용" 충족).

### 4. 오류 envelope ✅

- **BE**: `ReportAdminAccess.require`(`report/ReportAdminAccess.java:61-63`) → `ForbiddenError(DENIED_MESSAGE, ErrorCode.FORBIDDEN)` — 전역 핸들러가 HTTP 200 + `code:403` + `errorCode:"FORBIDDEN"`로 내린다(IT `getDeniedForPlainUser`·`putDeniedForPlainUser` `:541-546`·`:594-606`가 그 모양을 단언, `putDeniedForPlainUser`는 DB 미저장까지 확인). `@Valid` 실패는 `GlobalExceptionHandler.java:199/286/319`의 `INVALID_DATA`·400 경로(IT `putRejectsInvalidWeek` `:577-590`).
- **FE PUT**: `updateApmRetentionSetting` `api.ts:103-106` `.then(assertReportEnvelopeOk)` — `reportEnvelope.ts:33-45`가 `status==="error"` 또는 `code!==200`이면 `ReportApiError` throw. 기존 `updateRetentionSetting`(`:79-83`)과 글자 단위로 같은 형태.
- **FE GET**: `getApmRetentionSetting`(`:94-95`)에는 `assertReportEnvelopeOk`가 없지만 기존 `getRetentionSetting`(`:71-72`)도 없다 — 조회는 `useDmoveQuery.ts:45-47`의 `isFailureEnvelope → ApiEnvelopeError` throw가 잡는다(ZM-100 P1). 두 조회 함수의 처리 경로가 동일하므로 "새 함수에도 같이 적용" 조건 충족.
- **FE 소비자 분기**: `RetentionSettingForm.tsx:79-87` `error instanceof ReportApiError && error.code === HTTP_STATUS.FORBIDDEN`(`constants/http.ts:5` = 403) → `permission_denied` 토스트, 그 외(400 `INVALID_DATA` 포함) → `retention_save_failed`. 계약 §4.3 "저장 성공/실패/403 토스트는 기존과 같은 키" 충족. 테스트 `RetentionSettingForm.test.tsx` "HTTP 200 + body code:403은 성공이 아니다"가 회귀 방어.

### 5. 목록 계열 고정 · `groupId` · 행 키/삭제 배열 ✅

- **`type` 고정값**: `ReportListTable.tsx:69` `type: kind` — `kind: TReportKind = "HOST_GROUP" | "APM"`(`types:16`), 페이지가 `REPORT_TAB_KIND[tab]`(`ReportManagement.tsx:61`, `constants:75-78`)로 내려준다. BE `ReportKind.parse`(`report/ReportKind.java:49-50`)가 `"HOST_GROUP"`·`"APM"`을 정확히 받는다. `TSearchReportListParams.type?: TReportTypeFilter`(`types:56`)는 `TReportKind`의 상위집합이라 타입도 통과.
- **APM 탭 `groupId` 미전송**: `ReportListTable.tsx:67` `groupId: (!isApm && groupId) || undefined` — APM이면 항상 `undefined`. `serializerObjParams`(`utils/index.ts:366-370`)는 `qs.stringify`라 `undefined` 키를 직렬화하지 않는다 → 쿼리스트링에 `groupId`가 아예 안 실린다. BE `ReportListAssembler.java:132` `groupId != null`이면 `extraSources`(APM)가 빠지는 위험을 정확히 피했다. 테스트 "APM 탭은 URL에 남은 groupId를 보내지 않는다"가 방어.
- **탭 전환 파라미터 초기화**: `ReportManagement.tsx:49-58` `offset`·`periodType`·`groupId`·`type` 전부 `null` → `useQueryParams.ts:55-59`가 `null`이면 `current.delete(key)`. 계약 §4.1 3개 + `type`(옛 URL 잔존값)까지 지운다.
- **행 키·삭제 배열**: `ReportListTable.tsx:231` `rowKey={reportRowKey}`(`apmReportDisplay.ts:38-41` `${type}:${id}`), `:187` `splitReportDeleteIds(keys)`(`apmReportDisplay.ts:72-86` — `ids`/`apmIds` 분리, 빈 배열은 키 자체를 생략) → BE `DeleteReportsReqDto`의 `ids`/`apmIds`(`Controller:82`). 계약 §4.2 "행 키 `(type,id)` 유지·`apmIds`만" 충족. 테스트 "APM 탭의 선택은 apmIds로만 나간다"·"호스트 그룹 탭의 선택은 ids로만 나간다"·"두 계열이 섞여 들어와도 배열을 가른다".
- **행 클릭**: `:212-215` APM 행만 `apmReportDetailPath(record.id)`(`constants/routes.ts:300-301` → `/setting/report-management/apm?id=`). 계약 §4.2 일치.
- **오케스트레이터 답변 1 확인**: 목록 행 `type`은 `ReportListAssembler.java:97`(`ReportKind.HOST_GROUP` 고정)과 `ManagedReportSource.kind()`에서만 나오므로 두 값 밖의 행은 존재할 수 없다 — "항상 켜진 type 필터"로 빠지는 행 없음.

### 6. 마이그레이션 V66 ↔ 엔티티 ✅

| V66 (`db/migration/V66__report_retention_setting_apm.sql`) | 엔티티 `host/domain/ReportRetentionSetting.java` | `defaults()` |
|---|---|---|
| `apm_enabled boolean NOT NULL DEFAULT true` (`:5`) | `@Column(name="apm_enabled", nullable=false) boolean apmEnabled` (`:58-59`) | `.apmEnabled(true)` (`:83`) |
| `apm_week_retention_weeks integer NOT NULL DEFAULT 52` (`:6`) | `@Column(name="apm_week_retention_weeks", nullable=false) int apmWeekRetentionWeeks` (`:61-62`) | `.apmWeekRetentionWeeks(52)` (`:84`) |
| `apm_month_retention_months integer NOT NULL DEFAULT 24` (`:7`) | `@Column(name="apm_month_retention_months", nullable=false) int apmMonthRetentionMonths` (`:64-65`) | `.apmMonthRetentionMonths(24)` (`:85`) |

- 기존 열(V4 `id/enabled/week_retention_weeks/month_retention_months/updated_at`)은 V66이 건드리지 않는다. IT `v66KeepsExistingColumns`(`ReportRetentionApmIT.java:504-519`)가 `information_schema`로 `updated_at NOT NULL + now()`까지 확인.
- 업그레이드 값 복사 `UPDATE ... SET apm_enabled = enabled, ... WHERE id = 1`(`:12-16`) — 계약 §1 SQL과 동일.
- **번호 충돌 없음**: master `C:/solutions/moveseye-be-spring/src/main/resources/db/migration` 최신은 `V65__apm_revoked_token_retention.sql`, 워크트리에는 V66이 이 파일 하나뿐(`ls | sort -V | tail`). BE 통보 4와 일치.
- `updateApm(boolean,int,int)`(`:98-102`)는 자기 열 3개만 대입, `update(...)`(`:91-95`)는 호스트 그룹 열만 — 두 폼이 서로 덮지 않는다. 단위 테스트 `updateApmRetentionDoesNotTouchHostGroup`·`updateHostGroupRetentionDoesNotTouchApm`이 양방향 방어.

### 7. cleanup 계열별 로직 · BE 변경 통보의 FE 영향 ✅

`ReportManagementService.runCleanup`(`report/ReportManagementService.java:255-320`) ↔ 계약 §3 표:

| 계열 | 기준 설정 | 코드 |
|---|---|---|
| `host_group_report` | `enabled` / week / month | `:262-267` `if (setting.isEnabled())` → `deleteByPeriodTypeAndPeriodStartBefore(WEEK, weekCutoff)`·`(MONTH, monthCutoff)`, cutoff는 `:258-259`(`getWeekRetentionWeeks/getMonthRetentionMonths`) |
| `ManagedReportSource` `kind()==APM` | `apm_enabled` / `apm_*` | `:275-279` `isApm && !setting.isApmEnabled()` → `continue`; cutoff `:283-286` `isApm ? apmWeekCutoff : weekCutoff`, `apmWeekCutoff/apmMonthCutoff`는 `:260-261`(`getApmWeekRetentionWeeks/getApmMonthRetentionMonths`) |
| 그 밖의 소스(현재 없음) | 호스트 그룹 한 벌 | `:280-282` `!isApm && !setting.isEnabled()` → `continue`, cutoff는 호스트 그룹 것(BE 통보 5의 해석 — 계약 "기존 그대로"와 모순 없음) |

- **조기 반환 없음**(`:256-257` 사이에 `if (!enabled) return` 없음) → `enabled=false` + `apm_enabled=true`면 APM만 지운다. 단위 테스트 `cleanupHostGroupDisabledApmEnabled`·`cleanupApmDisabledHostGroupEnabled`·`cleanupBothDisabled`·`cleanupBothEnabled`(cutoff를 26주/12개월로 달리 두고 `ArgumentCaptor`로 계열별 cutoff 확인)가 §5 ①②③을 전부 덮는다.
- 로그 한 줄: `ReportSchedule.java:59-60` `"Report cleanup done hostGroup={} apm={} in {}ms"` — 계약 §3 문자열과 동일. APM 저장 로그 `ReportManagementService.java:213` `"Report retention(APM) updated: enabled={} week={} month={}"` — 계약 §2.2 동일.
- Javadoc 정정: `ManagedReportSource.java:85-88`("cutoff는 이 계열의 보존 설정에서 온다…")·`ReportManagementService` 클래스 주석 `:32-37` — 계약 §3 두 정정 모두 반영.

**BE 변경 통보 4건 → FE 영향**

| 통보 | FE 영향 | 근거 |
|---|---|---|
| 1. `runCleanup` 반환 `int → CleanupResult` | **없음** | 호출부는 `ReportSchedule.java:57` 하나(`grep runCleanup(` 결과 2건 = 정의+호출). HTTP EP 없음 |
| 2. 스케줄러 반환 문자열 `deleted=N hostGroup=n apm=n` | **없음** | FE `src/`에서 `deleted=` 문자열 파싱 0건(grep). 스케줄러 이력 화면은 문자열을 그대로 표시 |
| 3. `@Operation` 미부착 | **없음** | FE는 Swagger를 런타임에 읽지 않음. `api-contract-sync` 대조 시 javadoc 기준으로 보면 됨 |
| 5. 기타 소스는 호스트 그룹 스위치 | **없음** | 현재 그런 소스가 없고, 있어도 FE 면(EP·shape)과 무관 |

### 8. i18n ✅

- **새 키 4개 양쪽 존재**: `locales/kr.json`·`en.json` `report_management` 블록(각 39키)에 `tab_host_group`·`tab_apm`·`retention_title_apm`·`retention_desc_apm` 모두 있음(diff `+` 4줄씩, 값은 계약 §4.5 표와 글자 단위 일치). `retention_desc` 정정도 양쪽 반영(kr "…호스트 그룹 리포트는…", en "Host group reports older than…").
- **코드 참조 키 전수(31개) ↔ JSON**: `src/`(테스트 제외)에서 `"report_management.xxx"` 문자열 31종 추출 → `created_time, delete_failed, delete_success, field_required, filter_group, filter_period_type, group_name, list_title, month_retention_months, period, period_month, period_type, period_week, permission_denied, report_title, retention_desc, retention_desc_apm, retention_enabled, retention_save_failed, retention_saved, retention_title, retention_title_apm, tab_apm, tab_host_group, target_count, target_hosts, target_services, title, unit_month, unit_week, week_retention_weeks` — 전부 kr/en 양쪽에 존재. 중첩 키 `report_management.apm.title_weekly/title_monthly/slo_*/synthetic_*`(`apmReportDisplay.ts:124-125, 322-326, 340-341`)도 양쪽 존재.
- **도움말 `page_guide.setting_report`**(kr `:8544`, en `:8549`): 5줄 문구에 검수번호·`§`·HTML 태그·실측치 없음 ✅. 내용("탭으로 나눠 봅니다 / 보관 기간은 탭마다 따로 / APM 탭은 라이선스에서만")이 구현과 일치.

### 9. 계약 픽스처 게이트 범위 ✅

- `tsconfig.contract.json:20-21` `"include": ["src", "src/__tests__/fixtures"]`, `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]`.
- 픽스처 `src/__tests__/fixtures/reportRetentionContractSample.ts`는 include 안이고 `.test.` 접미가 아니라 exclude에 안 걸린다. 세 상수 전부 `: TRetentionSetting` 주석 부착(`:19`, `:31`, `:41`) — `npm run typecheck:contract`가 shape 어긋남을 잡는 구조([[fe-contract-fixture-gate]]). APM 샘플이 호스트 그룹 샘플과 값이 다르고(26/12 vs 52/24) `RetentionSettingForm.test.tsx`가 그 값으로 "어느 EP를 읽었나"를 가른다.

### 10. 라이선스 게이팅 축 ✅

| | 훅 | 식 |
|---|---|---|
| `pages/home/HomePage.tsx:36-37`(워크트리·master 동일) | `const { allowsFeature, isLoading: licenseLoading } = useLicense();` | `const apmLicensed = licenseLoading \|\| allowsFeature("APM");` |
| `pages/setting/ReportManagement.tsx:37-38` | `const { allowsFeature, isLoading: licenseLoading } = useLicense();` | `const apmLicensed = licenseLoading \|\| allowsFeature("APM");` |

- 글자 단위 동일. `:40-42` `visibleTabs`에서 APM 탭 제외, `:44-47` `?tab=apm`인데 안 보이면 `HOST_GROUP`으로 접음(계약 §4.1). 테스트 `ReportManagement.test.tsx` 게이팅 3건(없으면 탭 없음 / `?tab=apm` 접힘 / 로딩 중 감추지 않음).

---

## 불일치·주의 목록

| # | 심각도 | 책임 | 내용 | 근거 | 제안 |
|---|---|---|---|---|---|
| A | 🟡 권장 | FE | antd `Tabs`의 `destroyInactiveTabPane`이 설치된 antd에서 **deprecated**(`destroyOnHidden`으로 대체). 동작은 하지만 dev 콘솔 경고가 뜬다 | `ReportManagement.tsx:82`; `node_modules/antd/es/tabs/index.d.ts:13-14` `@deprecated Please use destroyOnHidden instead`, `:18` `destroyOnHidden?: boolean` (package.json은 `^5.24.2`이나 설치본에 신 prop 존재) | `destroyOnHidden`으로 교체(한 줄). 경고만이라 커밋 전 정리 권장 수준 |
| B | 🟢 참고 | BE | V66 주석이 "IF NOT EXISTS로 멱등"이라 하지만 **뒤따르는 `UPDATE`는 멱등이 아니다** — 누군가 dev DB에 `apm_*` 열을 수동으로 먼저 만들고 값을 바꿔 둔 상태에서 Flyway가 V66을 처음 적용하면 그 값이 호스트 그룹 값으로 덮인다. Flyway 정상 흐름(1회 적용)에서는 문제 없음 | `V66__report_retention_setting_apm.sql:3, :12-16` | 조치 불필요. functional-qa가 :3001로 dev DB(5433)에 V66을 적용할 때 사전에 수동 열이 없는지만 확인 |
| C | 🟢 참고 | FE | `report_management.*`에 이제 참조 없는 키가 남는다: `filter_type`·`type`·`type_host_group`·`type_apm`·`type_apm_weekly`·`type_apm_monthly`·`host_count` | kr/en 키 목록 ↔ 코드 참조 31종 대조 | 계약 §4.2 "타입·상수는 남겨도"와 같은 취지로 두어도 됨. 정리하려면 별도 커밋 |
| D | 🟢 참고 | FE | 탭 전환 시 계약 §4.1의 3개(`offset`·`periodType`·`groupId`) 외에 `type`도 지운다 — 계약 초과지만 해롭지 않음(옛 URL 잔존값 제거) | `ReportManagement.tsx:56-57` | 유지 |
| E | 🟢 참고 | BE·FE | `ReportSchedule` 반환 문자열이 `deleted=N` → `deleted=N hostGroup=n apm=n`으로 길어졌다. FE는 파싱하지 않으나 스케줄러 이력 표 열 폭이 좁으면 줄바꿈될 수 있다 | `ReportSchedule.java:61`; FE `deleted=` 파싱 0건 | functional-qa가 설정 › 스케줄러 이력 표에서 한 번 눈으로 확인 |

---

## 종합

- 계약 §1·§2·§3·§4 전 항목이 BE·FE 양쪽 코드에서 **글자 단위로 대응**한다. 응답 DTO 3필드 ↔ `TRetentionSetting`, URL, 403/400 envelope, 목록 `type` 고정값·`groupId` 차단, V66 ↔ 엔티티, cleanup 독립 스위치, i18n 4키, 픽스처 게이트, 라이선스 축 — **차단(🔴) 0건**.
- 🔄 섹션의 FE 확인 요청 2건은 코드로 재확인됐다(①`type` 값이 두 계열 밖일 수 없음 — `ReportListAssembler.java:97`·`kind()`, ②행 없으면 `loadOrDefault()` → `defaults()` true/52/24 — `ReportManagementService.java:218-221`). BE 변경 통보 5건 중 FE 면에 닿는 것은 없다.
- **functional-qa로 넘겨도 된다.** 넘길 때 같이 전달할 것:
  1. 워크트리 BE를 **:3001**로 띄워 dev DB(5433)에 V66 적용(계약 §5) — 적용 전 `report_retention_setting`에 `apm_*` 열이 수동으로 이미 있는지 확인(위 B).
  2. 실측 항목: APM 탭 진입 시 `GET /admin/reports/retention/apm` 1회만 나가고 `/retention`은 안 나가는지(`enabled` 분기, `RetentionSettingForm.tsx:58-59`) / APM 탭 저장 후 호스트 그룹 탭 값 불변 / APM 탭 목록 요청에 `groupId`가 없는지 / 라이선스 없는 계정(또는 mock)에서 `?tab=apm` 접힘 / 일반 USER로 PUT → 권한 토스트.
  3. 위 A(`destroyInactiveTabPane` 경고)는 콘솔에 뜰 수 있으니 결함으로 오진하지 말 것.
