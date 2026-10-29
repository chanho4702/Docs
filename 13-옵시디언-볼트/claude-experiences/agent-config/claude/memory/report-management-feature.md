---
name: report-management-feature
description: "설정>리포트 관리 — 저장 리포트 목록 테이블/관리자 선택삭제/자동삭제(retention) 설정+배치. Spring 단일, 2026-06-23 완료"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7561f7d2-f01f-4e06-8835-22f5a0cc17f2
---

호스트 그룹 리포트([[hostgroup-report-feature]])가 `host_group_report`에 무한 누적되는 걸 관리하기 위해 **설정 페이지 하위 "리포트 관리"** 화면을 추가한 풀스택 기능. 백엔드는 Spring 단일([[be-dual-maintenance]]) — Nest 미반영. 2026-06-23 fullstack-feature 파이프라인으로 완료. 산출물 `_workspace/contract_·e2e_report-management.md`.

**기능(사용자 확정)**: ①저장 리포트 목록 테이블(그룹명/기간유형/기간/호스트수/생성일, 페이지네이션, periodType 필터) ②관리자 선택 삭제(체크박스) ③자동삭제(retention) 설정 — 관리자가 보관기간 조정. **기본값 주간 52주/월간 24개월, enabled=true**.

**BE(Spring `moveseye-be-spring`)**:
- 신규 `ReportManagementController` (`/admin/reports`): `GET`(페이지네이션 목록, `groupName`은 ZabbixHostGroup 조인, resource/alerts/hosts 본문 제외), `DELETE`(body `{ids:number[]}`, 멱등, `{deletedCount}`), `GET/PUT /admin/reports/retention`.
- retention 저장 = **전용 소형 테이블 `report_retention_setting`**(단일행, `enabled/week_retention_weeks/month_retention_months`). 기존 `setting` 테이블은 키가 PG enum(CLOUD/ZABBIX)이라 신규키 추가 위험 → 분리. **Flyway `V4__report_retention_setting.sql`** (CREATE IF NOT EXISTS + INSERT ON CONFLICT).
- cleanup 배치 `ReportSchedule.cleanupReports()` `@Scheduled("0 0 4 * * *")` 매일 04:00 — enabled면 `WEEK: period_start < today-주`, `MONTH: < today-개월` 삭제. `isCleanupRunning` 가드(집계 배치와 분리).
- ⚠️ **권한 = userRole 기준**(roleid 아님). 신규 EP는 기존 `@RolesGuarded+@Roles(roleid 비교)` 대신 `AdminAccessChecker.requireAdmin(currentUser)`로 `TokenUserInfo.userRole`이 ADMIN/SUPER_ADMIN인지 검사. 사유는 아래 admin 403 버그.

**FE(`moveseyee_fe`)**: `pages/setting/ReportManagement.tsx` + `components/ReportListTable·RetentionSettingForm`. `services/report-management.api.ts`, `types/report-management.ts`, `hooks/useReportManagement.ts`, `constants/report-management.ts`(매직넘버), queryKey `REPORT_MANAGEMENT_QUERY_KEY`. 권한은 **`PageWrapper` 신규 `adminOnly` prop**(역할기반: ADMIN/SUPER_ADMIN만 접근·메뉴노출, USER는 error404). `DmovePermissionsKey`에 리포트 전용 키가 없고 permissions가 BE feature 기반이라 신규 권한키 대신 역할가드 채택. SideNav/MobileSideNav 설정 하위 메뉴(`show: isSuperRole`). i18n `report_management.*`(en/kr).

**검증 중 잡은 차단 버그 3건(전부 수정)**:
1. **admin 403**: admin은 zabbix 미연동이라 `zabbix_userid=NULL` → 로그인 시 JWT `roleid=null`. `RolesInterceptor`가 `@Roles`를 roleid와 비교 → 거부. 기존 admin화면은 `@RolesGuarded` 없는 `/users` EP를 써서 안 드러났고, 신규 `/admin/reports`가 처음 `@RolesGuarded`를 FE에서 호출해 표면화. → userRole 기준 `AdminAccessChecker`로 국소 수정(전역 RolesInterceptor 불변). [[moveseye-spring-conversion]] §RolesGuarded 함정 연장.
2. **FE 403→성공 오인**: `axiosInstance` 인터셉터가 HTTP200이면 body `code`(403→200 보존 규약) 미검사 → mutation이 거부를 "저장됨" 토스트로 오인. → 국소 `assertReportEnvelopeOk`(status==="error"||code!==200이면 throw)로 삭제/설정 mutation만 방어(전역 인터셉터 불변).
3. **테이블 i18n 미적용**: [[fe-usetablecolumns-title-i18n]] 참고.
4. **breadcrumb i18n "returned an object" 경고**: `useBreadcrumbs`가 경로 세그먼트를 snake로 바꿔 `t(segment)` 호출(`report-management`→`report_management`)하는데, 그게 nested 객체(`{title,...}`)라 문자열 대신 객체 반환 경고. 평면 키 페이지(setting/my_page)는 무사. → `{키}.title` leaf가 있으면 그걸 쓰는 `translateSegment` 헬퍼로 국소 수정(공용 훅, 평면키 페이지 동작 불변). 교훈: **경로 세그먼트와 이름이 같은 i18n 네임스페이스는 객체이므로 breadcrumb이 깨진다** — 네임스페이스 첫 키를 `title`로 두면 자동 처리됨.

**Spring Flyway 마이그레이션 현 상태(향후 추가 시 참고)**: `V1 baseline / V2 dashboard_widget / V3 host_group_report(hosts 컬럼 인라인 포함) / V4 report_retention_setting`. dev DB validate 통과(V3 checksum 1907559270 일치), V4까지 적용됨. **다음 마이그레이션은 V5**. (과거 hosts를 V4로 분리하려던 시도는 유실됐으나 V3 인라인이 dev DB와 정합해 무해.)

**검증 그린**: Spring build+ReportManagementServiceTest 10/AdminAccessCheckerTest 5, FE tsc+lint+jest 164, functional-qa로 admin403 발견→수정 후 admin `GET /admin/reports` 200(104건) 실측.
