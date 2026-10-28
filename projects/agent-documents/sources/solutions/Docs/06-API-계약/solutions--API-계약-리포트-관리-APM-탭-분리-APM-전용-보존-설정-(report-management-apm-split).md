# API 계약 — 리포트 관리 APM 탭 분리 + APM 전용 보존 설정 (report-management-apm-split)

- 작성: Claude(오케스트레이터) / 2026-09-22 · 대상: be-engineer, fe-engineer, integration-qa, functional-qa
- 사용자 결정(09-22): **같은 화면 안 탭 분리(호스트 그룹 / APM)** + **APM 전용 보존(자동삭제) 설정 추가**
- 기준선: [`contract_report-management.md`](API-%EA%B3%84%EC%95%BD-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-%28report-management%29.md)(06-23, 목록/삭제/보존) · [`contract_apm-p3.md`](APM-P3-%EA%B3%84%EC%95%BD-SLO-%ED%99%88-%EC%9C%84%EC%A0%AF-%ED%95%A9%EC%84%B1-%EA%B0%90%EC%8B%9C-%EB%A9%94%EC%8B%9C%EC%A7%95-%EB%B0%B0%EC%B9%98-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%282026-09-07-BE-%EA%B5%AC%ED%98%84-%EC%99%84%EB%A3%8C-FE-%EB%AF%B8%EC%B0%A9%EC%88%98%29.md) §8(APM 리포트 편입, 09-07)
- 이슈 번호: **미정** — 커밋 전에 사용자에게 묻는다(APM 기능은 관례상 ZM-122였으나 이 건은 리포트 관리 쪽이라 확인 필요)
- 작업 위치: BE 워크트리 `C:/worktrees/report-apm-be`(브랜치 `report-apm-split`, master `baed6ee`) · FE 워크트리 `C:/worktrees/report-apm-fe`(브랜치 `report-apm-split`, master `d47c0a5` — ZM-161 관리 콘솔 분리 커밋 포함, `node_modules`는 정션). 🔴 두 master 작업 트리는 건드리지 않는다(BE는 IntelliJ가 `build/classes` 공유, FE master에는 ZM-154 미커밋 변경이 있다)

---

## 0. 현행(바꾸기 전) — 왜 바꾸나

- 설정 › 리포트 관리(관리자 전용, `PageWrapper adminOnly`)는 **한 목록**에 `HOST_GROUP`·`APM` 두 계열이 섞여 나온다(행 키 `(type,id)`, 삭제 배열 `ids`/`apmIds`, 계열 필터 `type` 4값).
- 보존 설정은 `report_retention_setting` **단일 행 한 벌**(`enabled`/`week_retention_weeks`/`month_retention_months`)이고, `ReportManagementService.runCleanup`이 그 한 벌로 `host_group_report`와 모든 `ManagedReportSource`(현재 APM `apm_report_snapshot`)를 같이 지운다.
- 사용자는 APM 리포트를 **따로 관리**하고 싶다 → 목록은 탭으로 가르고, 보존은 계열별로 둔다.

## 0.5 공통 사항 (기존 계약 그대로)

- 권한: 전 EP 관리자 전용, `ReportAdminAccess.require(currentUser)`(userRole ∈ ADMIN ∪ SUPER_ADMIN, 거부 = HTTP 200 + body `code:403` + `errorCode:"FORBIDDEN"` + 한국어 메시지).
- 인증 쿠키 + `x-visitor-id` 필수. envelope `ApiResult<T>`. FE 언랩 2겹(인터셉터+`useDmoveQuery`) → 훅 소비자는 `T` 직접 수신.
- 🔴 새 보존 EP는 `report/`(STANDARD) 패키지에 둔다 — `premium.apm`을 import하면 `LicenseArchitectureTest` A1이 막는다. `ReportKind`는 이미 `report/`에 있으므로 `kind()==ReportKind.APM` 비교는 허용.
- 🔴 새 EP에 `@RequiresFeature(APM)`을 **붙이지 않는다** — 설정값 자체는 STANDARD 데이터이고, 프리미엄을 뺀 빌드에서도 EP가 살아 있어야 FE가 조건 분기를 단순하게 유지한다(FE는 라이선스로 탭을 숨긴다).

---

## 1. DB — Flyway `V66__report_retention_setting_apm.sql`

```sql
-- APM 리포트 전용 보존 정책 — 같은 단일 행(id=1)에 열 3개를 더한다(계열별 행으로 쪼개지 않는다: PK·기존 조회 불변).
ALTER TABLE report_retention_setting
    ADD COLUMN IF NOT EXISTS apm_enabled                boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS apm_week_retention_weeks   integer NOT NULL DEFAULT 52,
    ADD COLUMN IF NOT EXISTS apm_month_retention_months integer NOT NULL DEFAULT 24;

-- 🔴 업그레이드 시 동작 불변: 지금까지 APM은 기본 한 벌로 지워졌으므로 그 값을 그대로 복사한다
--    (관리자가 30주/12개월로 바꿔 둔 설치본에서 갑자기 52/24로 되돌아가면 안 된다).
UPDATE report_retention_setting
   SET apm_enabled = enabled,
       apm_week_retention_weeks = week_retention_weeks,
       apm_month_retention_months = month_retention_months
 WHERE id = 1;
```

- 🔴 V66이 비어 있는지 워크트리에서 `ls src/main/resources/db/migration | sort -V | tail`로 확인 후 작성(다른 세션이 V66을 먼저 쓰면 V67로).
- 엔티티 `ReportRetentionSetting`: 필드 `apmEnabled`·`apmWeekRetentionWeeks`·`apmMonthRetentionMonths` + `defaults()`에 true/52/24 + `updateApm(boolean, int, int)`. 🔴 시드/V66 미적용 방어용 `defaults()`는 유지.

---

## 2. EP 표

| 메서드 | 경로 | 상태 | 설명 |
|---|---|---|---|
| GET | `/admin/reports` | **불변** | 목록. 탭은 FE가 `type=HOST_GROUP` / `type=APM`을 고정으로 보낸다(기존 필터 재사용). 응답 shape 불변 |
| DELETE | `/admin/reports` | **불변** | `ids` / `apmIds` 그대로 |
| GET | `/admin/reports/retention` | **불변** | 호스트 그룹 보존(응답 shape 불변 — `apm*` 필드를 **여기에 섞지 않는다**) |
| PUT | `/admin/reports/retention` | **불변** | 호스트 그룹 보존 저장 |
| GET | `/admin/reports/retention/apm` | **신설** | APM 보존 현재값 |
| PUT | `/admin/reports/retention/apm` | **신설** | APM 보존 저장(전 필드 필수) |

🔴 경로 충돌 없음: APM 리포트 본문 EP는 `/admin/reports/apm/{id}`·`/admin/reports/apm/detail`(다른 컨트롤러)이고 이 EP는 `/admin/reports/retention/apm`이다.

### 2.1 GET /admin/reports/retention/apm — 응답 data (`RetentionSettingDto`와 **같은 shape**)
```jsonc
{ "enabled": true, "weekRetentionWeeks": 52, "monthRetentionMonths": 24 }
```
- 행이 없으면(시드 미적용) 기본값. 🔴 새 DTO를 만들지 말고 `RetentionSettingDto`를 재사용(`RetentionSettingDto.apmFrom(entity)` 같은 정적 팩토리 추가).

### 2.2 PUT /admin/reports/retention/apm — 요청 body (`UpdateRetentionSettingDto` **재사용**)
```jsonc
{ "enabled": true, "weekRetentionWeeks": 26, "monthRetentionMonths": 12 }
```
- 검증: 기존과 동일(`enabled` 필수, week 1~520, month 1~120). 실패 = HTTP 200 + body `code:400` + `INVALID_DATA`(전역 BindException 핸들러 — 기존 PUT과 같은 모양).
- 응답 data: 저장된 APM 보존값(2.1 shape).
- 로그: `Report retention(APM) updated: enabled={} week={} month={}`.

---

## 3. cleanup 배치 동작 (`ReportManagementService.runCleanup`)

| 계열 | 기준 설정 | 삭제 조건 |
|---|---|---|
| `host_group_report` | `enabled` / `week_retention_weeks` / `month_retention_months` | 기존 그대로 |
| `ManagedReportSource` 중 `kind()==APM` | **`apm_enabled` / `apm_week_retention_weeks` / `apm_month_retention_months`** | `apm_enabled=false`면 이 계열은 **건너뛴다**(호스트 그룹이 켜져 있어도) |
| 그 밖의 `ManagedReportSource`(현재 없음) | 기본 한 벌 | 기존 그대로 |

- 🔴 `enabled=false`(호스트 그룹)이어도 `apm_enabled=true`면 APM은 지운다 — 두 스위치는 **독립**이다. 기존 "disabled면 전체 skip" 조기 반환을 계열별로 나눈다.
- 로그 한 줄에 계열별 삭제 수를 적는다: `Report cleanup done hostGroup={} apm={} in {}ms`(스케줄러 반환 문자열도 계열별).
- `ManagedReportSource#deleteOlderThan` Javadoc의 "🔴 cutoff는 리포트 관리 화면의 한 벌에서 온다 — 계열마다 다른 보존을 쓰면 그 화면이 거짓말을 한다"를 **정정**: "cutoff는 이 계열의 보존 설정(APM은 `apm_*`)에서 온다 — 화면이 계열별 탭에서 각자 보여 준다".
- `ReportManagementService` 클래스 Javadoc의 "APM 리포트도 같은 설정으로 지운다(09-07)" 문단도 같은 이유로 정정.

---

## 4. FE 화면 계약

### 4.1 페이지 `pages/setting/ReportManagement.tsx`
- antd `Tabs` 2개: `host-group`(호스트 그룹 리포트) · `apm`(APM 리포트). 활성 탭은 **URL 쿼리 `tab`**(`?tab=apm`)로 — 새로고침·공유·뒤로가기 보존(메모리 규칙). 기본 `host-group`.
- 🔴 **APM 탭은 APM 라이선스가 있을 때만** 보인다 — 축은 홈과 같은 `licenseLoading || allowsFeature("APM")`(`pages/home/HomePage.tsx:37` 참고). 라이선스 없이 `?tab=apm`으로 들어오면 `host-group`으로 접는다.
- 각 탭 = 그 계열의 `RetentionSettingForm kind=…` + `ReportListTable kind=…`. 탭을 바꾸면 목록 쿼리 파라미터(`offset`·`periodType`·`groupId`)를 비운다(다른 계열의 페이지 오프셋이 남으면 빈 표가 뜬다).

### 4.2 `ReportListTable` — `kind: TReportKind` prop 필수
| | HOST_GROUP 탭 | APM 탭 |
|---|---|---|
| 목록 요청 `type` | `HOST_GROUP` 고정 | `APM` 고정 |
| 계열 필터 셀렉트 | **제거**(탭이 곧 필터) | 제거 |
| 그룹 필터·그룹 열 | 유지 | **없음**(APM엔 그룹 축이 없다) |
| 기간 단위 필터(주/월) | 유지 | 유지(`APM_WEEKLY`/`APM_MONTHLY` 필터값은 더 쓰지 않는다 — 타입·상수는 남겨도 UI에서 제거) |
| `type` 열(태그) | **제거** | 제거 |
| 대상 수 열 | "N 호스트" | "N 서비스" |
| 행 클릭 | 없음(정본은 호스트 그룹 모니터링 리포트 탭) | APM 상세(`/setting/report-management/apm?id=`) |
| 삭제 | `ids`만 | `apmIds`만(기존 `splitReportDeleteIds` 그대로 — 행 키 `(type,id)` 유지) |

### 4.3 `RetentionSettingForm` — `kind: TReportKind` prop 필수
- `HOST_GROUP`: 기존 훅(`useRetentionSetting`/`useUpdateRetentionSetting`) · 제목 `report_management.retention_title` · 설명은 **"호스트 그룹 리포트"**로 문구 정정(지금 문구는 두 계열 공통을 전제).
- `APM`: 신설 훅(`useApmRetentionSetting`/`useUpdateApmRetentionSetting`, 쿼리 키 `REPORT_MANAGEMENT_QUERY_KEY.RETENTION_APM`) · 제목 `retention_title_apm` · 설명 `retention_desc_apm`("APM 주간/월간 리포트 스냅샷의 보존 기간. 호스트 그룹 리포트와 독립").
- 저장 성공/실패/403 토스트는 기존과 같은 키.

### 4.4 services / types / hooks
- `services/report-management.api.ts`: `getApmRetentionSetting()`·`updateApmRetentionSetting(body)` — 기존 두 함수와 같은 형태(`assertReportEnvelopeOk` 포함), URL `${baseUrl}/retention/apm`.
- `types/report-management.ts`: `TRetentionSetting` 재사용(주석의 "한 벌이 두 계열 모두" 문장 정정). 새 타입 불필요.
- `constants/queryKey.ts`: `REPORT_MANAGEMENT_QUERY_KEY.RETENTION_APM`.
- 계약 픽스처: `src/__tests__/fixtures/`에 APM 보존 응답 샘플 1개(`: TRetentionSetting`) — `npm run typecheck:contract` 대상.

### 4.5 i18n (`kr.json`·`en.json`, `report_management.*` 블록에 **줄 단위 추가** — 기존 줄 변경은 문구 정정 2건만)
| 키 | kr | en |
|---|---|---|
| `tab_host_group` | 호스트 그룹 리포트 | Host group reports |
| `tab_apm` | APM 리포트 | APM reports |
| `retention_title_apm` | APM 리포트 자동 삭제 | APM report auto-deletion |
| `retention_desc_apm` | APM 주간/월간 리포트 스냅샷의 보존 기간입니다. 호스트 그룹 리포트 설정과 독립적으로 적용됩니다. | Retention for APM weekly/monthly report snapshots. Applied independently of host group reports. |
| `retention_desc`(정정) | 호스트 그룹 리포트… (두 계열 공통이라는 표현 제거) | … |

### 4.6 테스트
- `ReportListTable.test.tsx`: `kind` prop 기준으로 재작성 — HOST_GROUP 탭에 APM 행/타입 열 없음, APM 탭에 그룹 열 없음·"서비스" 단위·행 클릭 상세, 삭제 배열 분리 유지.
- 신규 `ReportManagement.test.tsx`: 탭 2개 렌더 · `?tab=apm`이면 APM 탭 활성 · 라이선스 없으면 APM 탭 미노출·`?tab=apm`이 host-group으로 접힘 · 탭 전환 시 목록 파라미터 초기화.
- `RetentionSettingForm`: APM kind가 `/retention/apm`으로 저장하는지(api mock).

---

## 5. 검증 계획

- BE: `ReportManagementServiceTest`에 ① APM 보존 GET/PUT ② `runCleanup` — `enabled=false`+`apm_enabled=true`면 APM만 지움 / 반대도 ③ 계열별 cutoff가 각자 설정에서 나오는지. IT: 기존 IT가 Flyway를 타므로 V66 적용 자체는 IT 통과로 확인 + MockMvc/IT로 새 EP 2개(관리자 200·비관리자 403 FORBIDDEN·검증 실패 400).
- FE: jest(위 4.6) + `tsc` + eslint + `npm run typecheck:contract`.
- integration-qa: DTO shape(3필드) ↔ `TRetentionSetting`, URL, 403 envelope, 목록 `type` 고정값 대조.
- functional-qa: 🔴 실행 중 :3000은 V66 이전 코드다 — 재기동은 사용자 요청 시에만. 워크트리 BE를 **:3001**로 띄워 dev DB(5433)에 V66을 적용해 실측한다(새 열은 DEFAULT가 있어 :3000의 옛 코드도 계속 동작). FE는 워크트리 Vite를 `VITE_API_URL=:3001`로.

## 🔄 FE 요청사항

FE 구현(2026-09-22, 워크트리 `C:/worktrees/report-apm-fe`) 결과 — **계약과 어긋난 점은 없다.** 아래는 확인 요청 2건 + 알림 1건.

1. **(확인 요청) 목록 `type` 필터가 이제 "항상 켜져 있다".** 탭 분리 뒤 FE는 `type`을 비우지 않는다 —
   호스트 그룹 탭은 언제나 `type=HOST_GROUP`, APM 탭은 `type=APM`을 보낸다(§4.2대로). 그래서
   **어느 계열에도 걸리지 않는 행이 있으면 그 행은 어느 탭에서도 안 보인다**(예전엔 필터를 비우면
   전부 나왔다). `host_group_report`에 `type`이 비거나 매핑되지 않는 행이 생길 수 있는지 한 번
   확인해 주면 좋겠다. 없으면 그대로 둔다.
2. **(확인 요청) `GET /admin/reports/retention/apm`은 화면 진입만으로 호출된다.** APM 탭을 여는
   순간 조회가 나가고(탭을 떠나면 언마운트), 호스트 그룹 탭에서는 호출하지 않는다. 행이 없을 때
   기본값(true/52/24)을 주는 §2.1 동작이 그대로면 FE는 추가 분기가 필요 없다.
3. **(알림) APM 탭 노출 축은 FE 라이선스다.** `licenseLoading || allowsFeature("APM")`(홈과 같은 축).
   계약 §0.5대로 EP에는 `@RequiresFeature`를 붙이지 않는 것을 전제로 구현했다 — 붙이면 라이선스가
   없는 설치본에서 **탭은 애초에 안 보이므로 화면은 멀쩡하지만**, 나중에 축을 바꿀 때 근거가 갈린다.

### FE 구현 메모 — 미저장 입력 보호는 "탭 이탈 확인"을 골랐다(검수 R2)
코덱스 검수가 준 두 선택지 중 **확인창**을 골랐다(계열별 draft를 부모에 보존하는 쪽을 버렸다).
- **보존 설정은 필드가 3개**(스위치 + 숫자 2개)이고, 사용자가 탭을 오가며 두 계열을 나란히
  편집하는 흐름이 아니다 — 초안을 들고 다녀 봐야 되돌아올 일이 드물다.
- draft를 부모에 두면 **"화면의 값"과 "서버의 값"이 갈리는 상태가 탭 밖까지 산다.** 돌아왔을 때
  화면이 초안을 그리는데 그 사이 서버 값이 바뀌었다면, 이 폼의 PUT은 **전체 교체**라 초안 저장이
  곧 덮어쓰기가 된다(R3이 막으려는 것과 같은 사고). 확인창은 그 상태를 아예 만들지 않는다.
- 확인창은 폼이 `onDirtyChange`로 dirty만 올려 주면 끝이라 **탭 컴포넌트가 폼 내부를 몰라도 된다** —
  나중에 세 번째 계열이 붙어도 그대로 쓴다.
- 짝이 되는 안전장치: 같은 탭 안에서는 **손댄 폼을 재조회가 덮지 않는다**(`isFieldsTouched` 가드).
  그래서 "입력 중 값이 서버 값으로 되돌아가는" 경로와 "탭을 떠나며 말없이 사라지는" 경로가 둘 다 막힌다.

### FE 구현 메모(계약 밖에서 함께 고친 것)
- **화면 도움말 `page_guide.setting_report`(kr·en)** 문구를 정정했다. 기존 문구가 "두 계열이 한
  목록에 나오고 보관 기간은 두 종류에 함께 적용된다"고 말해 탭 분리 후 **거짓말**이 된다.
- `REPORT_TYPE_FILTER`의 `APM_WEEKLY`·`APM_MONTHLY`는 타입·상수로만 남고 UI에서 사라졌다(§4.2대로).

### 오케스트레이터 답변(2026-09-22)
1. **매핑되지 않는 행은 없다.** 목록 행의 `type`은 DB 컬럼이 아니라 조립 시점에 정해진다 — `host_group_report`에서 온 행은 `ReportKind.HOST_GROUP`, `ManagedReportSource`에서 온 행은 그 소스의 `kind()`(APM). 두 값 밖의 행은 만들어질 수 없다(`ReportListAssembler`·`ReportListItemDto.from`). 그대로 둔다.
2. **행이 없으면 기본값(true/52/24)** — §2.1이 그 계약이고 BE 구현도 `loadOrDefault()`를 같이 쓴다. FE 분기 불필요.
3. 확인 — 이 계약 기준으로 EP에 `@RequiresFeature`는 붙지 않는다.

### BE 변경 통보(2026-09-22, be-engineer · 워크트리 `C:/worktrees/report-apm-be`)
**§1·§2·§3은 계약 그대로 구현됐다 — FE가 보는 면(경로·요청/응답 shape·403/400 envelope·목록 EP)은 한 글자도 달라지지 않았다.** 아래는 BE 내부 사실의 통보다.

1. **`ReportManagementService.runCleanup` 반환 타입**을 `int` → `ReportManagementService.CleanupResult(hostGroup, apm, other)` record(+`total()`)로 바꿨다. §3이 "계열별 로그·반환 문자열"을 요구하는데 합계 하나로는 계열을 복원할 수 없어서다. 호출부는 `ReportSchedule` 하나이고 HTTP EP는 없다(FE 영향 0). `ApmReportSnapshotIT`의 해당 단언도 계열별로 바꿨다.
2. **스케줄러 반환 문자열**은 `deleted={total} hostGroup={n} apm={n}`이다. `deleted=` 접두를 남긴 이유는 스케줄러 실행 이력에 이미 쌓인 옛 행과 형식이 이어지게 하려는 것. (코덱스 검수 R2 반영) `other`가 0이 아니면 ` other={n}`이 덧붙는다 — 합계와 표시된 계열이 어긋나지 않게. 로그 한 줄은 `Report cleanup done hostGroup={} apm={} other={} in {}ms`(계약 문구에 `other={}`만 추가).
3. **Swagger `@Operation`을 붙이지 않았다** — 이 컨트롤러의 기존 EP 6개가 전부 javadoc만 쓰고 `@Operation`이 없어 문체를 맞췄다(새 EP 둘에만 summary가 붙으면 Swagger의 같은 태그 안이 엇갈린다). `@RequiresFeature`도 §0.5대로 없다.
4. **마이그레이션 번호는 계약대로 `V66`**(직전이 `V65__apm_revoked_token_retention.sql`).
5. **§3의 "그 밖의 `ManagedReportSource`"(현재 없음)는 호스트 그룹 스위치를 따른다** — `enabled=false`면 그 계열도 건너뛴다(계약 표의 "기존 그대로"를 그렇게 읽었다).
6. 검증: 신규 단위 6건 포함 `ReportManagementServiceTest` 21건 + 신규 IT `ReportRetentionApmIT` 7건(실 PostgreSQL), 회귀 합계 **116건 통과 / 실패 0 / skip 0**. skip 0이라는 것은 도커 5433이 살아 있었다는 뜻이고, 따라서 **V66이 빈 DB에 V1부터 실제로 적용**됐으며 `updated_at`을 비롯한 기존 열이 그대로임을 IT가 `information_schema`로 읽어 확인했다.
