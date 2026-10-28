---
name: hostgroup-report-feature
description: "호스트 그룹 주별/월별 자원+알람 리포트 기능 — 풀스택 완료, 배치 스냅샷+lazy 백필, dev DB 테이블 적용됨"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4c8742f2-51f0-44b4-81e7-5cee1a370871
---

호스트 그룹 상세(`HostGroupDetail`)에 **주별/월별 리포트 탭**(5번째)을 추가하는 풀스택 기능. 2026-06-22 fullstack-feature 파이프라인(BE→계약→FE→integration-qa→functional-qa)으로 **완료**. 산출물: `_workspace/contract_·qa_·e2e_group-report.md`.

**확정 범위(사용자)**: 리포트 항목 = (A)자원 사용률(CPU/메모리/디스크/트래픽의 기간 평균·최대·최소) + (B)알람 통계(severity별 totals + Top 호스트). 기간 단위 = WEEK+MONTH 둘 다. UI = HostGroupDetail '리포트' 탭 + PDF/Excel 내보내기. 집계 = **배치 스냅샷 DB 저장 + lazy 백필**.

**BE(Nest+Spring 양쪽, [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-dual-maintenance|be-dual-maintenance]] 규칙)**:
- 신규 테이블 `host_group_report`: `(id, group_id[idx], period_type[WEEK|MONTH], period_start, period_end, resource jsonb, alerts jsonb, host_count, created_at)`, `UNIQUE(group_id, period_type, period_start)`. **dev DB(dmove)에 적용 완료**(Nest migrationsRun 자동 적용 확인, `\d host_group_report` 일치). Nest 마이그레이션 `1781500000000-CreateHostGroupReport.ts`, Spring Flyway `V3__host_group_report.sql`.
- 엔드포인트: `GET /hosts/:groupid/reports?periodType=&limit=`(목록, 최신 마감 기간 WEEK=8/MONTH=6, 최신순), `GET /hosts/:groupid/reports/detail?periodType=&periodStart=`(단일). 목록·상세 **동일 shape**(`GroupReportResDto`).
- **resource**: cpu/memory/disk/traffic 4키 항상 존재, 각 `{avg,max,min}` 또는 **null**(수집 item 없으면). **alerts**: `totals`(severity 6키) + `topHosts`(`{hostName,count}[]`).
- 집계 재사용: 자원=`getGroupResourceTrend`의 메트릭 키 매핑+trend.get(트래픽 합산/그 외 평균), 리포트는 기간 전체 단일 요약으로 압축. 알람=`getGroupAlertTrend`의 event.get severity 집계.
- **배치 cron**(`host/report/report.schedule.ts` / Spring `ReportSchedule`): 주별=매주 월 03:00(지난 주), 월별=매월 1일 03:30(지난 달), 모든 그룹 upsert. ⚠️ 인증=Zabbix **Super Admin 토큰**(EventSyncService `getSuperAdminToken()`+isSyncing 가드 패턴 재사용 — 사용자 컨텍스트 없는 배치의 핵심).
- **lazy 백필**: 조회 시 마감 기간 스냅샷 없으면 그 자리에서 Zabbix 집계·저장. 미마감(진행 중) 기간은 목록 제외 / 상세는 `REPORT_PERIOD_NOT_CLOSED`(HTTP200 body code). 멱등성 검증됨(CALL#1 ~1.8s 생성→CALL#2 ~12ms DB히트, deep-equal 일치).

**FE**: `HostGroupReport.tsx`(주/월 Segmented+기간 Select+PDF/Excel)·`HostGroupReportResource.tsx`(null→"데이터 없음")·`HostGroupReportAlerts.tsx`, hook `useGroupReport.ts`(목록만 조회, 상세는 목록=상세라 클라이언트 선택 → `REPORT_PERIOD_NOT_CLOSED` 정상흐름 회피), 타입 `TGroupReport` 등(host-monitoring.ts), api `getGroupReports`/`getGroupReportDetail`(후자 미사용 보존), queryKey `HOST_GROUP_QUERY_KEY.REPORTS/REPORT_DETAIL`. **i18n는 `group_report` 네임스페이스**(기존 최상위 `report` 문자열 키 충돌 회피). 응답 2겹 언랩 규약 준수([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-usedmovequery-unwrap|fe-usedmovequery-unwrap]]). `exportSheetsToXlsx` 신설(기존 exportData는 EChart series 기반이라 표엔 부적합).

**검증 전부 그린**: Nest tsc+jest 89, Spring 컴파일+test, FE tsc+lint+jest 13, integration-qa PASS(불일치 0), functional-qa(Nest) PASS(런타임 버그 0 — 주/월 토글·lazy백필·PDF/Excel·빈그룹 graceful 전부 통과).

**2026-06-22 호스트별 자원 분해 확장 완료**(`contract_·qa_·e2e_group-report-hosts.md`): 사용자가 "리포트에서 그룹 내 각 호스트 데이터를 보고 싶다"던 요구가 초기 확정범위(자원=그룹집계only)에서 **누락**됐던 것을 추가. 리포트 응답에 `hosts:[{hostid,hostName,resource}]`(resource는 그룹과 동일 `ReportResource` 재사용, cpu.avg desc·cpu null 맨뒤 정렬) 추가. **그룹 집계 `resource`는 그대로 유지**. 저장=신규 jsonb 컬럼 `hosts`(Nest 마이그레이션 `1781600000000`, Spring Flyway). 구버전 스냅샷(hosts NULL) 조회 시 **lazy 재집계**로 채움(빈그룹 `[]`과 NULL 구분). FE는 자원섹션에 **호스트 선택 드롭다운**(전체↔개별, `HostGroupReportResource` 재사용, 기간변경시 없는 호스트→"전체" 폴백), export는 선택대상 반영(파일명 `_all`/`_{hostid}`), i18n `group_report.host_select/all_hosts`. 검증: Nest 9+46 jest·Spring build·FE tsc+lint+jest 9, integration-qa PASS(불일치0), functional-qa PASS(런타임0). ⚠️ **Flyway 안티패턴 1건 발견·수정**: be-engineer가 기적용 `V3`에 ADD COLUMN을 넣어 기설치 환경서 컬럼 누락 → **V3 원복 + 신규 `V4__host_group_report_hosts.sql`(ADD COLUMN IF NOT EXISTS) 분리**, Spring 실기동 validate 통과·V4 success 확인. 교훈: 이미 적용된 Flyway 마이그레이션은 수정 말고 새 버전으로 분리.

**2026-06-23 호스트별 비교 차트 + N/A 표시 + 트래픽 버그 수정**: 리포트 자원 섹션에 **호스트별 평균치 비교 막대 차트**(`HostGroupReportHostCompare.tsx` + `useGroupReportHostCompare.ts`, metric CPU/메모리/디스크/트래픽 토글 + avg/max/min 토글, 응답 `hosts[]` 소비, BE 무변경) 추가. 사용자 "모든 호스트가 안 그려진다" 불만 → 진단(`diag_report-host-resource-keys.md`): group2 40호스트 중 **CPU/메모리/디스크 값 있는 건 6개뿐(나머지 31개는 수집 멈춘 죽은 호스트=trend 없음, 코드로 못 살림)** + **트래픽은 확정 버그**(item 키가 `net.if.in["ens18"]` 형태라 `includes('bytes')` 필터가 항상 0개). 조치: ①FE는 죽은 호스트를 **제외 대신 회색 N/A(value:null, 막대 안그림·0과 구분)로 표시**(값 호스트 desc 앞/N/A 뒤, 40개 dataZoom 스크롤+라벨회전). ②**트래픽 버그는 Spring만 수정**(사용자 지시 — 정책 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-dual-maintenance|be-dual-maintenance]] Spring 단일): `MetricUtils.isTrafficKey`/`isDiskPusedKey` 정규식(`^net\.if\.(in|out)(\[...\])?$` errors류 제외, `^vfs\.fs\.size\[[^\]]*,pused\]$` 전 마운트)으로 `ReportService`+`HostService(getGroupResourceTrend)` 양 지점 교체, 디스크 search 프리픽스도 `vfs.fs.size`로 넓힘(2차 버그). 라이브 프로브 group2 트래픽 0→126item/35host/trend6. ⚠️ **Nest엔 같은 트래픽/디스크 버그 잔존**(report.service.ts:109-111, host.service.ts:2501-2503) → **FE가 Nest(:3000) 연결이라 사용자 화면 트래픽은 아직 N/A**(FE Spring 전환 전까지). ③회귀: 비교차트 series가 객체배열(`{name,value,itemStyle}`)이 되며 공용 유틸 "데이터 보기" 모달·Excel export 값 공백 → `utils/index.ts`에 `extractChartPointValue` 헬퍼 추가(객체면 .value 추출, null→no_data, number케이스 보존)로 `getDataSourceChart`+`exportData` 수정. 검증: FE tsc+lint+jest 144, functional-qa PASS(40호스트 N/A 표시·모달 복구 런타임 확인), Spring build+MetricUtilsTest/ReportServiceTest.

**2026-06-22 Spring 런타임 E2E 추가 완료**(`e2e_group-report-spring.md`): 직전 functional-qa가 Nest 경로만 검증해 생략됐던 Spring 경로를 Spring(3001)+Nest(3000) 동시 기동으로 메움 → **PASS, Nest↔Spring deep-equal 6건 전부 EQUAL**(null 키 보존·jsonb 중첩·날짜포맷·periodType 문자열까지 원시 JSON 일치). BE 스위칭해도 FE 무영향. 운영 함정 1건(차단성 아님): `gradlew bootRun`이 `moveseye-be\.env`를 자동 로드 안 해 첫 기동이 `${DB_PORT}` 미치환으로 실패 → `.env`를 export 후 같은 세션 bootRun으로 해결(`_workspace/_load_env_spring.ps1`). Spring `CLAUDE.md §2`에 이 주입 단계 명시 권고됨(미반영).

관련: 직전에 같은 화면에서 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--hostgroup-monitoring-plan|hostgroup-monitoring-plan]]의 가용성·건강도 추이 탭을 제거(4탭→이번에 리포트 추가로 5탭).
