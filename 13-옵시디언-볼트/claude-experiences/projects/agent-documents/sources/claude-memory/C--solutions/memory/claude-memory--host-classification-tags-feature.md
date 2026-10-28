---
name: host-classification-tags-feature
description: "2026-07-21 호스트 관리 화면에 분류(device_type)+임의 태그 CRUD+일괄지정 풀스택+QA 완료(미커밋). device_type=Zabbix 태그, 마이그레이션 없음"
metadata: 
  node_type: memory
  type: project
  originSessionId: 04c70e1f-81ca-4580-9a69-e43ed305df2b
  modified: 2026-07-21T00:12:35.716Z
---

2026-07-21 "자빅스 관리 > 호스트 관리"(host.manage, [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--host-registration-feature|host-registration-feature]] 확장)에 **호스트 분류(device_type) 세팅 + 임의 Zabbix 태그(key:value) 전체 CRUD + 목록 일괄 분류지정**을 풀스택 구현+전 QA PASS(미커밋). 계약 `_workspace/features/zabbix-config/classification-tags/contract_host-classification-tags.md`, QA `qa_/e2e_host-classification-tags.md`.

**분류 기준(정본):** 호스트 종류는 host group/inventory/template이 아니라 **Zabbix `device_type` 태그** 하나로 결정. 규칙은 BE `common.util.DeviceTypeResolver`(태그 정확히 1개+유효 6종이면 그 값, 그 외 notClassified). 6종: server/network/security/database/hardware/notClassified(마지막만 camelCase). 자산 화면 분류와 동일 규칙 단일소스.

**BE(moveseye-be-spring, host.manage 패키지):**
- POST/PUT `/hosts/manage` 요청에 `tags: {tag,value}[]`+`deviceType` 추가, 응답 `ManagedHostDto`에 tags+deviceType(항상 non-null 6종) 추가. list/fetchRawOne에 `selectTags:"extend"`.
- 신규 `PATCH /hosts/manage/device-type` req`{hostIds[],deviceType?}` res`{success[],failed[{hostid,reason}]}` 부분실패허용. 전 EP AdminAccessChecker.requireAdmin.
- **device_type은 Zabbix 태그라 로컬 스키마 변경 없음 → Flyway 마이그레이션 불필요(V12 유지)**. 감사는 host_change_log payload(JSONB)에 deviceType/tagCount만 기록.
- 저장정책: notClassified=device_type 태그 삭제, 다중 device_type=1개로 정리. deviceType은 tags에서 분리해 deviceType 필드가 단독 소스(서버가 재조립).

**교훈(중요):**
- **host.update tags는 전체 교체(replace) 시맨틱** — 폼이 모든 태그를 round-trip해야 다른 태그 소실 안 됨. 최우선 회귀케이스(env=prod 등 타 태그 보존)로 QA PASS 확인. PUT tags null=미변경/[]=전체삭제/목록=교체.
- 분류만 안전하게 바꾸려면 PATCH /device-type(호스트별 현재태그 fetch→device_type만 교체)이 정석. create/update/bulk 말미 assetSyncService.syncOne으로 자산 분류 자동 반영.
- **목록 deviceType 필터는 BE 미지원 → FE 클라이언트 사이드(현재 페이지 한정)**. 전역 필터 원하면 후속 BE 파라미터 필요(단 notClassified는 "태그없음/다중/미유효"라 Zabbix 태그필터로 서버처리 곤란, 별도 설계). ← 사용자 결정 대기 잔여.

**FE(moveseyee_fe):** HostFormDrawer에 분류 Select+태그 Form.List(device_type은 일반 태그목록에서 제외), HostTab에 분류 컬럼+필터+일괄지정 툴바(DmoveTable hasCheckboxAction, 선례 ItemManagementTab). 분류 6종 옵션/i18n은 기존 자산 ASSET_DEVICE_TYPE_OPTIONS·EDeviceType 재사용(중복정의 금지, 루트키 중복 회피).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

호스트 분류·태그 관리 — 2026-07-21 호스트 관리 화면에 분류(device_type)+임의 태그 CRUD+일괄지정 풀스택+전QA PASS(미커밋). device_type=Zabbix 태그(host group 아님), 마이그레이션 없음(V12 유지), 신규 PATCH /hosts/manage/device-type. 교훈: host.update tags 전체교체라 폼 round-trip 필수(타 태그 보존), 목록 필터는 FE 클라이언트 사이드(전역필터 후속 결정 잔여)
