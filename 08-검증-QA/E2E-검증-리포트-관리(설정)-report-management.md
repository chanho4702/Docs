# E2E 검증 — 리포트 관리(설정) report-management

검증자: functional-qa / 2026-06-23
대상: BE=Spring(:3000), FE Vite(:5173), dev DB postgres@localhost:5432/dmove
계약: `_workspace/contract_report-management.md`
계정: admin / <마스킹> (role=ADMIN, **zabbix_userid=NULL**), 헤더 `x-visitor-id`

## 종합 판정: **FAIL (차단성)**

화면 진입·메뉴 노출·retention 폼 클라이언트 동작·페이지 가드는 정상이나,
**모든 `/admin/reports*` API가 admin 계정에서 HTTP 200 + body `code:403`(Access Denied)으로 거부**되어
목록/삭제/retention 조회·저장이 전부 동작하지 않는다. 게다가 FE는 그 200+403 응답을 **성공으로 오인**한다.

---

## 항목별 결과

| # | 항목 | 결과 | 근거 |
|---|------|------|------|
| 1 | 메뉴/진입(권한) | PASS | Setting 서브메뉴에 "Report Management" 노출(reportmgmt-04). `/setting/report-management` 진입 200(404 아님). PageWrapper `adminOnly`가 userRole=ADMIN 통과 |
| 2 | 목록 테이블 | **FAIL(차단)** | 화면 "No data". `GET /admin/reports` → **200+code:403**. DB엔 104건 실재(아래 대조) |
| 3 | periodType 필터 | 검증불가 | 목록 자체가 403이라 도달 불가 |
| 4 | 🎯 선택 삭제 | **FAIL(차단)** | `DELETE /admin/reports` 도달 불가(목록 403으로 선택 row 없음). EP 자체도 403 |
| 5 | 🎯 자동삭제(retention) | **FAIL(차단)** | GET/PUT 모두 200+code:403. 폼이 52/24를 보인 건 실제 DB값이 아니라 GET 실패 후 `RETENTION_DEFAULT` fallback. 저장 시도 시 PUT 200+403인데 **성공 토스트 오출력**(아래 BUG-2) |
| 6 | 회귀/콘솔 | 부분 FAIL | `/admin/reports*` 3건이 net 200이나 body 403. console에 500/i18n 경고(아래) |

---

## 화면 ↔ API ↔ DB 대조

### DB 실제 데이터(검증 시점, 무변경)
- `host_group_report`: **total 104건** (WEEK 56 / MONTH 48). 최신: id=105 group_id=2 WEEK 2026-06-15~21
- `report_retention_setting` (id=1): **enabled=t, week=52, month=24**, updated_at 2026-06-23 16:25

### API 응답(브라우저 캡처, `e2e_reportmgmt_result.json`)
```
GET  /admin/reports?offset=0&limit=20  -> HTTP 200  {status:"error", code:403, message:"Access Denied"}
GET  /admin/reports/retention          -> HTTP 200  {status:"error", code:403, message:"Access Denied"}
GET  /admin/reports?offset=0&limit=10  -> HTTP 200  {status:"error", code:403, message:"Access Denied"}
PUT  /admin/reports/retention          -> HTTP 200  {status:"error", code:403, message:"Access Denied"}
```
### 화면
- 목록 테이블: 헤더 정상, body "No data"(0행) — **DB 104건과 불일치(403 때문)**
- retention 폼: enabled 스위치 ON, week=52, month=24 표시 — **GET 403 fallback값일 뿐 DB값과 우연히 일치**(둘 다 기본값)

---

## 🔴 BUG-1 (차단성) — admin 계정이 RolesGuarded EP에서 403. 책임: be-engineer(Spring) — 단, 설계 결정 필요

### 증상
admin(<마스킹>) 토큰으로 `/admin/reports*` 4개 EP 전부 200+code:403. 동일 패턴의 기존 `/admin/users`도 같은 토큰으로 200+403(베이스라인 확인).

### 근본 원인(코드 추적 완료)
1. `auth/service/AuthService.java:60-70` — 로그인 시 `roleid=null` 기본, **`zabbixUserid != null`일 때만** `roleid = String(refRole)` 설정.
2. admin 계정은 **`zabbix_userid=NULL`**(DB 확인) → 발급 JWT의 `roleid`가 **null**(payload=`{userRole:"ADMIN", id:1}`, roleid 클레임 생략).
3. `auth/security/RolesInterceptor.java:52-54` — `@Roles(ADMIN)`을 **`user.getRoleid()`** 와 비교(`"ADMIN".equals(null)` → false) → ForbiddenError("Access Denied").
4. SUPER_ADMIN 우회(48줄)도 roleid 기준이라 미적용.

→ **userRole=ADMIN 인데 roleid=null 이므로 RolesGuarded 컨트롤러를 통과할 수 없다.**

### 이것은 Spring 변환 버그가 아니라 "원본 Nest와 1:1 동일한 거동"
- 원본 `auth/services/auth.service.ts:60-70` 동일(zabbixUserid 있을 때만 roleid=refRole).
- 원본 `auth/guards/roles.guard.ts:38` 동일(`requiredRoles.includes(user.roleid)`).
- 원본 `admin/user/admin-user.controller.ts`: `@UseGuards(RolesGuard)` + `@Roles(UserRole.ADMIN)` — **신규 ReportManagementController와 완전히 동일한 패턴**.
- 즉 신규 기능은 기존 AdminUserController 패턴을 정직하게 따랐고, 그 패턴 자체가 zabbix_userid 없는 순수 admin 계정에선 동작 불가.

### 왜 기존 화면들은 멀쩡했나(핵심)
- FE의 admin 화면(사용자 관리 등)은 **RolesGuard가 없는 `/users` 컨트롤러**를 호출한다. `GET /users` → 200+데이터(베이스라인에서 10행 정상 렌더, reportmgmt-baseline-adminusers.png).
- RolesGuarded가 걸린 `/admin/*` EP를 FE가 실제로 호출하는 화면이 거의 없어 이 함정이 표면화되지 않았다.
- **신규 리포트 화면이 유일하게 RolesGuarded `/admin/reports`를 호출**하면서 처음 드러났다.

### 수정 권고(be-engineer/Spring — 셋 중 택1, 설계 합의 필요)
- (A) ReportManagementController에서 `@RolesGuarded`/`@Roles`를 떼고, 원본의 `user.controller`처럼 가드 없이(또는 userRole 기준 별도 체크로) 보호 — 가장 빠르고 기존 FE 호출 패턴과 일관.
- (B) RolesInterceptor/RolesGuard가 `roleid`가 아닌 **`userRole`** 도 함께 보도록 보강(예: roleid null이면 userRole로 폴백). 단 이는 전역 권한 거동 변경이라 회귀 위험 큼 — 신중.
- (C) admin 계정의 토큰에 roleid를 채우도록 로그인 로직 보강 — 원본 거동 변경이라 부적합.
> ⚠️ 어느 쪽이든 "원본 1:1 보존" 원칙과 충돌하므로 BE/설계 측 결정 필요. 단순 코드 수정이 아니라 **권한 모델 설계 이슈**다.

---

## 🔴 BUG-2 (차단성) — FE가 200+code:403 응답을 "성공"으로 오인. 책임: fe-engineer

### 증상
retention 저장 시 PUT이 **200+code:403(Access Denied)** 인데, 화면에 **"The auto-deletion policy has been saved." 성공 토스트** 출력(reportmgmt-03). 실제 DB는 변경 안 됨(저장된 것처럼 보이나 거짓).

### 근본 원인
- `services/axiosInstance.ts:56-61` 응답 인터셉터는 **HTTP 200이면 무조건 success 핸들러** → `response.data`(=`{status:"error",code:403,...}`)를 그대로 반환. body의 `code`/`status` 미검사.
- `useReportManagement`의 mutation은 reject가 없으니 `onSuccess` 실행 → 성공 토스트.
- 계약 §0/§5의 "권한 거부 → HTTP 200 + code:403" 명시 거동에서, FE가 envelope status를 확인하지 않아 성공 오인.

### 영향 범위
- 이건 retention 저장뿐 아니라 **삭제(`DELETE`)와 목록도 동일** — 200+403을 정상 응답으로 받아 `deletedCount` 등을 undefined로 처리하거나 빈 목록으로 렌더(목록은 빈 화면, 삭제는 거짓 성공 가능).
- 인터셉터는 전역이라 다른 화면에도 잠재하나, 200+403을 받는 EP를 호출하는 신규 리포트 화면에서 처음 표면화.

### 수정 권고(fe-engineer)
- retention/삭제 mutation(또는 인터셉터)에서 응답 envelope의 `status==="error"` / `code>=400`을 검사해 reject 처리(`onError` 경로로). 최소한 리포트 관리 훅(`useUpdateRetentionSetting`/`useDeleteReports`)에서 `data.code !== 200`이면 throw.
- BUG-1이 해결돼도 BUG-2는 별개로 남는다(다른 403/에러 케이스에서 여전히 성공 오인). 독립 수정 권장.

---

## 🟡 경미 이슈

| 이슈 | 내용 | 책임 |
|------|------|------|
| i18n 경고 | console `key 'report_management (en)' returned an object instead of string` — 어딘가 `t("report_management")`(객체키)를 문자열로 호출. 실제 타이틀("Report Management")은 정상 렌더. en/kr.json `report_management.title` 존재 확인 | fe-engineer(경미) |
| console 500 | 페이지 로드시 "Failed to load resource: 500" 다수 — `/admin/reports*` 응답은 200(403 body)이므로 별개 출처. 무관 리소스 가능성, 차단 아님 | 관찰만 |
| antd 경고 | `useForm` not connected / `addonAfter` deprecated — 동작엔 영향 없음 | fe-engineer(경미) |

---

## ✅ 정상 동작(PASS) 항목
- 페이지 가드: `adminOnly`가 userRole=ADMIN 통과, 404 미리다이렉트(reportmgmt-01)
- 메뉴 노출: Setting 하위 "Report Management" 링크 표시(reportmgmt-04)
- retention 폼 클라이언트 범위 검증: 9999 입력→520 클램프, 0 입력→1 클램프(reportmgmt-02)
- 401 처리: 토큰 없이 호출 시 진짜 401(`INVALID_TOKEN`) 반환(브라우저 외 curl 확인)

---

## 재현 명령
```bash
# 토큰
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -H "x-visitor-id: qa" -d '{"username":"admin","password":"<마스킹>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
# BUG-1 재현: admin인데 403
curl -s "http://localhost:3000/admin/reports?limit=5" -H "Authorization: Bearer $TOKEN" -H "x-visitor-id: qa"
#   -> {"status":"error","code":403,"message":"Access Denied"}
# 동일 패턴 기존 EP도 403:
curl -s "http://localhost:3000/admin/users?limit=2" -H "Authorization: Bearer $TOKEN" -H "x-visitor-id: qa"
# RolesGuard 없는 EP는 200(FE가 실제로 쓰는 것):
curl -s "http://localhost:3000/users?limit=2" -H "Authorization: Bearer $TOKEN" -H "x-visitor-id: qa"

# 브라우저 E2E 재실행(cwd=_workspace 필수, playwright는 _workspace/node_modules):
cd C:/solutions/_workspace
node e2e_reportmgmt_runner.cjs        # 진입/목록/api 캡처
node e2e_reportmgmt_ui2.cjs           # retention 범위검증 + 저장 성공오인(BUG-2)
node e2e_reportmgmt_menu.cjs          # 메뉴 노출
node e2e_reportmgmt_adminbaseline.cjs # 기존 admin 화면 정상 베이스라인
```

## 스크린샷 / 산출물(`C:\solutions\_workspace\`)
- `reportmgmt-01-entry.png` — 리포트 관리 진입(목록 No data, retention 폼)
- `reportmgmt-02-retention-validation.png` — 범위 클램프 검증
- `reportmgmt-03-save-attempt.png` — 저장 시 성공 토스트(거짓, BUG-2)
- `reportmgmt-04-menu-expanded.png` — Setting 메뉴 노출
- `reportmgmt-baseline-adminusers.png` — 기존 admin 화면 정상(10행)
- 결과 JSON: `e2e_reportmgmt_result.json`, `e2e_reportmgmt_ui2.json`, `e2e_reportmgmt_menu.json`, `e2e_reportmgmt_baseline.json`
- 러너: `e2e_reportmgmt_runner.cjs`, `e2e_reportmgmt_ui2.cjs`, `e2e_reportmgmt_menu.cjs`, `e2e_reportmgmt_adminbaseline.cjs`

## 환경/데이터 정리
- DB 무변경 확인: report 104건·retention true/52/24 그대로(모든 PUT/DELETE가 403으로 미반영) → 원복 불필요.
- 검증용 headless 브라우저는 각 스크립트 종료 시 close. :3000 Spring·:5173 FE 유지.
- 일반 USER 계정: 별도 마련 어려워 미수행. PageWrapper `adminOnly` 코드상 비-ADMIN은 404 리다이렉트(routes.tsx:94)로 가드됨 — 코드 검증으로 갈음.
