---
name: zabbix-config-drilldown-restructure
description: "2026-07-21 Zabbix 관리 IA를 완전 컨테이너 드릴다운(A안)으로 재구성(미커밋). 호스트 관리/템플릿 관리 각각 목록→선택→서브탭[정보·아이템·트리거·디스커버리]. 트리거 단독메뉴+B안(구성관리 스코프토글) 폐기·대체. BE 단건 EP 1개 추가. 런타임 미검증(브라우저 미연결+dev DB Setting stale)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c5f188f-27ea-4a1a-aee6-b9f557b1edd0
  modified: 2026-07-21T06:24:50.464Z
---

2026-07-21 Zabbix 관리 메뉴 정보구조를 **완전 컨테이너 드릴다운(A안)**으로 최종 재구성. **미커밋.** 하루 사이 3단계 진화의 종착점:
1. 트리거 관리를 **단독 메뉴**로 신설([[trigger-management-feature]])
2. → "구성 관리 1메뉴 + 스코프 토글"(B안)로 통합 재구성
3. → **A안(완전 드릴다운)**으로 최종 전환 ← 현재. 1·2의 메뉴 셸은 폐기, 알맹이(엔티티 탭)만 재활용.

## 최종 IA (Zabbix 네이티브)
```
호스트 관리  → 목록 → 호스트 선택 → 서브탭[정보/인터페이스 · 아이템 · 트리거 · 디스커버리(placeholder)]
템플릿 관리  → 목록(+템플릿 그룹) → 템플릿 선택 → 서브탭[정보 · 아이템 · 트리거 · 디스커버리]
```
- 스코프 토글 없음 — 어느 컨테이너 화면이냐가 곧 scope(host/template). 호스트/템플릿 완전 대칭.
- 라우트 파라미터 방식: `/zabbix-management/host-management/:hostid?tab=info|item|trigger|discovery`, 신설 `/zabbix-management/template-management(/:templateid?tab=...)`. 레포 선례(asset/host-group 상세)의 useBreadcrumbs 자동 브레드크럼·SideNav slice(0,3) 하이라이트 무수정 동작.
- **아이템 호스트 다이렉트 부활**(과거 템플릿 전용 → 호스트에도 직접 CRUD). 인터페이스 명시 select(호스트 스코프+인터페이스 필요 유형에서만, 단건 EP host.interfaces 주입).

## 핵심 구현
- **BE 변경 1건**: `GET /hosts/manage/{hostid}` 단건 조회 신설(ManagedHostDto 재사용, HOST_NOT_FOUND 재사용, fetchOne/fetchRawOne 공유). 딥링크/새로고침 상세 진입 + 인터페이스 select 데이터 확보. 계약 features/zabbix-config/host-registration/contract_host-registration.md §1-1. **나머지는 순수 FE.** 트리거/아이템 BE(zabbix-manage) EP는 무변경.
- 엔티티 탭(ItemManagementTab/TriggerManagementTab/DiscoveryPlaceholderTab)은 scope/targetId를 **URL 소비→props 주입**으로 전환(목록 필터 keyword/offset/status/severity는 URL 유지). ItemFormDrawer(인터페이스 select)·TriggerFormDrawer·상속 읽기전용 규칙 무변경 보존.
- TemplateDetailDrawer → **템플릿 상세 '정보' 탭으로 승격**(메타/삭제/host link·unlink 이관). 호스트 '정보' 탭 = 조회뷰+기존 HostFormDrawer/HostDeleteModal 재사용(태그 round-trip 재구현 금지).
- 구 3계보(configuration/item-template-management/trigger-management) → 공용 매핑 함수 `routes/zabbix-legacy-redirect.ts` 1개로 redirect(15케이스 테스트). bare item-template는 템플릿 목록으로 폴백(LOW-1 수정).
- HostManagementPage activeKey 로컬 useState→URL `?tab=` 개선([[fe-page-remount-on-navigate]]).

## 검증
- FE: tsc/lint/build 그린, jest 556 통과(선재 실패 1건 useGroupReportHostCompare.test.ts만, 본작업 무관·베이스라인 동일). BE: build+test 그린.
- integration-qa 정적: **PASS 6/0**(단건 EP 소비·props 주입·인터페이스 주입·link/unlink 이관·redirect 매핑·상속 규칙 전부 계약 1:1).
- ⚠️ **런타임 미검증**(functional-qa 잔여): (1)Chrome 확장 미연결로 FE 화면 인터랙션 불가, (2)dev 프로필 docker DB(:5433)의 `Setting(ZABBIX)` 행이 stale(엉뚱한 내부 IP)이라 관리자 API 401 — BE가 DB Setting을 env보다 우선(정상 동작)하는데 그 행 데이터가 낡음. 실 dev DB(:5432)는 admin 비번이 <dev-db-pw> 아님. 런타임 하려면 Setting 교정+브라우저 연결+BE 재빌드 필요.

## 산출물
`_workspace/`: design_drilldown-restructure.md(A안), design_config-mgmt-restructure.md(B안 폐기), design_trigger-mgmt.md, contract_*, qa_drilldown-restructure.md, e2e_*. IA 비교 목업 아티팩트도 생성함.

관련: [[trigger-management-feature]], [[item-template-management-feature]], [[host-registration-feature]], [[host-classification-tags-feature]]
