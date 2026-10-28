---
tags: [moveseye, zabbix, fullstack, worktree]
updated: 2026-07-18
---

# ✅ 호스트 등록 관리 — 첫 Zabbix 호스트 쓰기 (설계 2026-07-16 → 구현+QA 2026-07-18)

자빅스 UI/UX 개선 1순위. 자빅스 원본 UI로 가야 했던 관제 대상 등록·변경을 DMOVE 안에서 처리. fullstack-feature 파이프라인(be→계약→fe→정적QA→E2E) 1패스 + HIGH 1건 수정 루프로 완주. **동작 버그 0건, E2E 9/10 PASS**(1건은 환경 제약 미검증).

## 구현 요지
- BE: `/hosts/manage` 7 EP(목록/생성/수정/상태/삭제/템플릿검색/프록시목록), Zabbix 어댑터 3종(host write·template·proxy), `AssetSyncService.syncOne`(등록 직후 자산 자동 생성), 감사로그 `V11__host_change_log`. 쓰기 토큰=getSuperAdminToken 관례.
- FE: 설정>호스트 등록 관리(adminOnly) — 목록/폼 Drawer(즉석 그룹 생성 newGroupNames·Unlink vs Unlink-and-clear 분기 경고)/등록 직후 livecheck 결과 스텝(agent UNAVAILABLE 트러블슈팅 안내=차별점)/confirmName 이중확인 삭제/그룹 탭(기존 API 재사용+쿼리키 신설).
- 산출물: `_workspace/`의 devdesign·contract·qa·e2e_host-registration.md.

## Zabbix 7.0 실측 확정 (dev 실호출)
- 프록시: `monitored_by`(0=server/1=proxy/2=proxy group) + `proxyid`(문자열, server면 `"0"`).
- `host.get selectProxy`는 7.0에서 응답에 안 실림 → `proxy.get` 별도 매핑 필요.
- 응답 키: `selectHostGroups`→`hostgroups`(소문자), `selectParentTemplates`→`parentTemplates`, 가용성은 인터페이스 단위.
- 수정 시 인터페이스는 기존 interfaceid로 in-place 갱신(delete+create는 item 참조 깨짐).

## 교훈
1. **동시 세션 격리 = git worktree.** 다른 세션들이 같은 레포에서 작업 중일 때, 본 트리를 안 건드리고 `_worktrees/`에 feature 브랜치 worktree를 만들어 에이전트를 그 안에서만 작업시키면 충돌 0. FE node_modules는 본 레포로 정션(junction) 걸면 npm install 불필요(단 npm install 금지 지시 필수).
2. **Flyway 버전 번호는 세션 간 경합 자원.** 설계 시점 V9가 착수 시점엔 V10까지 선점돼 V11로 조정. 마이그레이션 번호는 구현 착수 직전 재확인이 필수.
3. **공유 dev DB에 신규 마이그레이션 적용 금지(타 세션 Flyway validate 파손).** E2E는 격리 도커 Postgres(5433)로 — Flyway가 V1~V11 자동 적용해 시드까지 재현됨.
4. **자빅스 연동 폼은 ID 축 확인 필수.** `/users/host-groups` 응답의 `id`(로컬 PK)와 `zabbixHostGroupId`(자빅스 id)는 별개 축인데 FE 타입에 후자가 누락돼 로컬 PK가 전송될 뻔(정적 QA HIGH). 수정 후 축 혼동 감지 가드 테스트(fixture에서 두 id를 다른 값으로) 추가 — 이 패턴 재사용 가치 높음.
5. **관리 화면의 Zabbix 호출은 읽기도 서비스 계정 토큰으로.** 순수 admin(roleid=null)은 자빅스 미연동이라 currentUser 토큰이 null — getSuperAdminToken으로 통일. 같은 이유로 비-ADMIN은 JwtAuthFilter가 Zabbix 토큰을 강제해 MovesEye 전용 계정으론 보호 EP 런타임 403 검증 불가(401 선행).

## 열린 항목
- ~~worktree → 본 트리 병합~~ → **2026-07-18 병합 완료**(rebase 후 ff-merge, BE ZM-69·FE ZM-70, 미푸시. worktree 정리됨). FE rebase 충돌: 사용자 관리 개편이 그룹 화면+쓰기 함수 제거 → 쓰기 함수 3종을 host-manage.api로 이관해 해소(교훈 6: **"미사용 함수 제거"는 병행 브랜치의 신규 소비처와 경합할 수 있다** — 병합 시 tsc가 잡아주지만 rebase 시점 재검증 필수).
- 2차: 매크로/태그/인벤토리, SNMP 등 다중 인터페이스, PROXY_GROUP 폼 노출, errorCode별 안내문구, 변경 이력 UI.
- 선재 이슈(타 세션 소관): `application-dev.yml` 미인용 `cors.allowed-origins: *` YAML 오류 + 빈 `MAIL_PORT`로 dev 프로필 기동 실패 — 사용자가 해당 세션에 전달하기로.

관련: [[2026-06-25-livecheck-disk-units]] [[2026-07-08-assets-management]] [[zabbix-api-reference]] [[2026-06-02-fullstack-harness]]
