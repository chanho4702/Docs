---
name: zabbix-wrapper-gaps
description: "2026-08-18 Zabbix 래핑 커버리지 평가(~40% API·핵심 관리 축 8할 완성)와 후순위로 민 미구현 목록(매크로·Maintenance·그래프·Scripts·사용자미디어…). 사용자가 \"일단 후순위\"로 결정"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3562659e-89d6-4e69-8d26-295d509aeecb
  modified: 2026-08-18T08:17:48.229Z
---

**2026-08-18 평가**: Zabbix API 객체 25개/60여 메서드 래핑(전체 60여/250여). 메뉴 기준으로
"관리자가 매일 하는 일" 8할은 우리 화면 — 호스트·템플릿·그룹·아이템·트리거·LLD·네트워크 디스커버리·
액션 5종·미디어 타입·사용자. **사용자 결정: 나머지는 일단 후순위.**

**후순위 목록 (실사용에 걸리는 순)**:
1. 🔴 **호스트/템플릿 매크로** — `{$SNMP_COMMUNITY}` 없이는 SNMP 템플릿이 안 돈다. 호스트 폼에 매크로 탭 없음 → 결국 Zabbix로 가야 하는 구멍
2. 🔴 **Maintenance(점검 기간)** — 점검 때 알림 끄기. 운영하면 반드시 씀
3. 그래프(graph.*) — 우리 차트가 있어 낮음
4. Scripts(script.*) — 액션 폼에서 글로벌 스크립트 ID를 손으로 넣는 반쪽 상태
5. 사용자 미디어(user.medias) — 액션이 "누구에게"를 정해도 수신 주소가 없으면 안 감. 사용자 관리 소관
6. Web scenarios · Proxy CRUD(조회만 있음) · Services/SLA · Authentication(LDAP/SAML) · API tokens
7. Administration > General(하우스키핑·GUI 등) — 처음 한 번이라 래핑 가치 낮음

**Why:** 사용자가 "자빅스를 완전히 래핑함?" 평가를 요청 → 위 표로 답 → "일단 이거 후순위로 밀자".
**How to apply:** "남은 작업" 질문 시 이 목록을 꺼낸다. 착수 시 1·2번부터. 원칙은 [[zabbix-wrapper-principle]].

관련: [[zabbix-wrapper-principle]]

**2026-08-19 갱신**: 🔴매크로 **완료**(전역 페이지 + 호스트/템플릿 드릴다운 매크로 탭, 상속 계산은 BE `ZabbixMacroManageService.viewHost` — 호스트→1단 템플릿 ID순→2단→전역, 계약 `features/zabbix-config/macro/contract_macro.md`). 다음 = 🔴Maintenance → 사용자 미디어 → Scripts·그래프·Web·Proxy·SLA·인증.
🔴 교훈(2026-08-19): 다른 세션의 FE 커밋 `0e2f94c`가 내 직전 커밋 `8d53684`의 10파일을 되돌린 트리로 push됨 → 복원 커밋 `8c9d619`로 fix-forward. **병행 세션이 있을 때는 커밋 직후 `git ls-tree HEAD`로 내 파일이 살아 있는지 확인**, 다음 커밋 전에 `git diff --stat <내커밋> HEAD -- <내파일>`이 0인지 본다.

**2026-08-19 추가 공백**: LLD **프로토타입 4종(아이템·트리거·그래프·호스트)은 조회만** — CRUD 미지원(사용자 질문으로 확인). 규칙 본체만 CRUD.

**2026-08-19 Maintenance 완료**(BE `2d972e1`·FE `d04fb4f`, 계약 `features/zabbix-ops/alert-actions-media/contract_maintenance.md`, 경로 `/zabbix-management/maintenance-management`). 🔴 timeperiod는 **유형별 허용 필드만** 보내야 함(get은 전 필드 반환 → round-trip 깨짐) → `MaintenanceTimeperiodNormalizer`. 커밋 타입 태그는 사용자 요청으로 `[FEATURE]`(FEAT 아님). 다음 = 사용자 미디어 → LLD 프로토타입 CRUD → Scripts·그래프·Web·Proxy·SLA·인증.

**2026-08-19 LLD 프로토타입 CRUD 완료**(BE `d904932`·FE `5399294`, 계약 §6). 4종 폼은 `discovery/prototypes/`. 🔴 key/host에 {#MACRO} 없으면 BE 거부(1개만 생기는 함정). 그래프 get의 gitemid/graphid는 벗겨 보내야 함. 점검 기간은 알림 관리 탭으로 편입(`f6d3d08`). Zabbix 관리 메뉴에 hover 툴팁(zabbix_menu_hint.*). BE 로깅 logback-spring.xml(`1d9859b`) — prod yml은 사용자가 불필요하다고 해 제거. **다음 = 사용자 미디어 → Scripts·그래프·Web·Proxy·SLA·인증.**

**2026-08-19 사용자 미디어 완료**(BE `6a46895`·FE `942682c`, 계약 `features/zabbix-ops/alert-actions-media/contract_user-media.md`). 🔴 Zabbix media.active는 0=사용(반직관) → BE가 enabled로 반전. sendto 이메일만 배열. **남은 공백**: Scripts · 그래프(일반) · Web 시나리오 · Proxy CRUD · SLA · 인증 설정. **새 과제 후보**: MCP 서버(우리 BE를 에이전트 툴로 — Node 프록시 + PAT 발급, moveseye-ai와 툴 카탈로그 공유; 사용자가 관심 표명, 설계 미착수).

**2026-08-19 오후**: Scripts 완료(BE `6c5c08f`·FE `06eec8d`, 계약 `features/zabbix-ops/alert-actions-media/contract_script.md` — 🔴getscriptsbyhosts는 `{hostid}` 객체·timeout은 Webhook만). LLD **완전 마무리**(BE `74770cb`·FE `eed65cd`, 계약 §6-b): 프로토타입 태그·전처리·유형별 extra·의존성·호스트 인터페이스/매크로, 상태 토글, 규칙 지금 실행(task.create type 6), 생성물 트리거/그래프/호스트(flags=4 + selectXDiscovery parent id) — 🔴 프로토타입 ID 조회 output은 객체별 필드만. **다음 = 일반 그래프(호스트/템플릿 graph CRUD)** → 이후 Web 시나리오/Proxy CRUD/SLA/인증은 보류(사용자 결정). MCP 서버는 **다른 세션이 진행 중**(mcp_permission·MCP 토큰 필터 등 코드 확인).

**2026-08-19 갱신 2**: 후순위 목록 중 **매크로·Maintenance·사용자 미디어·Scripts 완료**(전부 dev Zabbix 실서버 검증). LLD 프로토타입 4종(아이템·트리거·그래프·호스트)도 완결 — 태그·전처리·의존성·인터페이스·매크로·상태토글·"지금 실행"·생성물 조회까지. 남은 후순위 = **그래프(일반) · Web 시나리오 · Proxy CRUD · SLA · 인증(LDAP/SAML) · API 토큰 · Administration>General**(사용자: "일단 재끼고").
그 뒤 작업 축이 **이벤트/알림 화면 개선**으로 옮겨갔다 → [[event-alert-history-mode]] (통합 커밋 완료, 이력 모드는 성능 문제로 미커밋 중단).

**2026-10-27**: 일반 그래프(10-26) 완료, **Web 시나리오 구현**(유료 Feature WEB_SCENARIO, APM 합성 감시와 분리) → [[zabbix-web-scenario-mgmt]]. 남은 후순위 = Proxy CRUD · SLA · 인증(LDAP/SAML) · API 토큰 · Administration>General.
