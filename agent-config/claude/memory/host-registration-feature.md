---
name: host-registration-feature
description: "호스트 등록 관리 — 2026-07-18 구현+QA 완료(worktree feature/host-registration, 본 트리 미병합). 계약 features/zabbix-config/host-registration/contract_host-registration.md, E2E e2e_host-registration.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: 71d96fe6-aa9c-4794-bfb3-832a899baf50
---

자빅스 UI/UX 개선 1순위 "호스트 등록 관리" — 2026-07-16 설계 확정 → 2026-07-18 **구현+정적QA+E2E 완료, 동작 버그 0건**. 설계서 `_workspace/devdesign_host-registration.md`, 계약 `features/zabbix-config/host-registration/contract_host-registration.md`, QA `qa_host-registration.md`, E2E `e2e_host-registration.md`.

**병합 완료(2026-07-18, 미푸시):** worktree 개발분을 rebase 후 본 트리에 ff-merge — BE ZM-69(병합 커밋 34133f5, 직후 외부 amend로 c5e09f3, 트리 동일)·FE ZM-70(9f7f8c7+71f68a5). worktree·feature 브랜치 정리 완료. FE rebase 충돌 해소: 사용자 관리 개편(4131b40)이 그룹 화면+쓰기 함수를 제거 → **그룹 쓰기 함수 3종(create/update/deleteHostGroups)을 user-roles.api→host-manage.api로 이관**, HostGroupDetailModal 존치(유일 소비처=그룹 탭). 병합 후 BE gradlew build·FE tsc+테스트 17건 재검증 통과.

**구현 요지:** BE `/hosts/manage` 7 EP + Zabbix 어댑터(host write/template/proxy) + `AssetSyncService.syncOne` + 감사로그 **V11**__host_change_log(설계의 V9는 다른 세션이 V9·V10 선점해 조정). FE 설정>호스트 등록 관리(adminOnly) 화면 6종 + `HOST_MANAGE_QUERY_KEY` 신설.

**설계 대비 이탈(합리):** ①관리 화면 Zabbix 호출은 읽기 포함 전부 `getSuperAdminToken()`(순수 admin은 자빅스 토큰 null) ②삭제 confirmName은 기술명/표시명 둘 다 허용 ③수정 시 인터페이스 in-place 갱신(interfaceid 유지). Zabbix 7.0 실측: `monitored_by`+`proxyid`(server면 "0") 확정, `selectProxy` 미지원→proxy.get 별도 매핑, `selectHostGroups`→응답 키 `hostgroups`.

**QA에서 잡은 결함(교훈):** FE 그룹 select가 로컬 DB PK를 전송(HIGH) — `/users/host-groups` 응답의 `id`(로컬 PK)와 `zabbixHostGroupId`(자빅스 id)는 별개 축. `THostGroup`에 `zabbixHostGroupId` 추가로 해소, 축 혼동 감지 가드 테스트 있음. **자빅스 연동 폼은 항상 자빅스 id 축인지 확인할 것.**

**잔여(2차):** monitoredBy PROXY_GROUP(2) 폼 미노출(설계 범위), errorCode별 안내문구, 호스트 탭 그룹 필터 전체목록화, 비admin 403 런타임 검증(비-ADMIN은 JwtAuthFilter가 Zabbix 토큰 강제라 실 Zabbix 사용자 필요). E2E용 격리 도커 Postgres(5433)는 다른 세션도 사용 정황이 있어 stop 안 함. [[assets-core-devdesign]] [[host-livecheck-feature]] [[multi-session-worktree]]
