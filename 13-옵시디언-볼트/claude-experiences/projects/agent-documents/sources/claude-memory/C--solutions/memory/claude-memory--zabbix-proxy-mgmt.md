---
name: zabbix-proxy-mgmt
description: "2026-10-28 Zabbix 관리 > 프록시·프록시 그룹(기본 기능) 구현 — 워크트리·계약·검수 경과, Zabbix 7.0 proxy 실측 함정"
metadata:
  node_type: memory
  type: project
  originSessionId: eee4683d-0280-4673-9a67-5cecb7771b95
  modified: 2026-10-28T05:47:54.634Z
---

2026-10-28 Zabbix 관리 > **프록시** 페이지(`/zabbix-manage/proxies`·`/proxy-groups`, FE `/zabbix-management/proxy-management`, `?tab=groups`). 계약 `_workspace/features/zabbix-config/proxy/contract_proxy.md`(§0 실측표).
워크트리 BE `C:\worktrees\zbx-proxy-be` · FE `C:\worktrees\zbx-proxy-fe`(브랜치 `zabbix-proxy`, **미커밋**). 티켓 번호 미정.

- **사용자 결정**: 기본 기능(라이선스 게이트 없음) · 프록시 + 프록시 그룹 둘 다 · 감시 호스트 배정은 보기만(배정은 호스트 관리).
- 엔진: `ZabbixProxyService`(getRaw·create·update·delete) · `ZabbixProxyGroupService` 신규 · `ZabbixSettingsService`(settings.get 읽기) · `ZabbixHostService.countRaw`. `ZabbixMethod` 8개 + 조사표 json.
- 🔴 실측 함정(7.0.6): PSK는 get에 안 나옴(쓰기 전용) · **결과 TLS에서 PSK가 빠지면 Zabbix가 PSK를 지움**(모드만 바꿔 "없음"이 된 경우 포함), 모드를 바꿔도 결과가 PSK면 유지 · 액티브는 tls_connect=1만/패시브는 tls_accept=1만 · 인증서 안 쓰면 issuer·subject는 비어야 함 · custom_timeouts=1이면 10개 전부 필수 · 그룹 소속은 local_address 필수.
- 🔴 dev Zabbix의 `ZabbixProxyDemo`(proxyid 1)가 호스트 수십 대 감시 중 — 실측은 시험 프록시만.
- 검수: BE 1차 반려(모드 전환 시 암호화 조용히 꺼짐 🔴·인증서 필드 🔴·custom 값 변환·액션 조건 사용처·빈 값 무시) → 2차 승인. 1차 때 내 계약 해석("모드 바꾸면 PSK 삭제")이 틀렸던 것을 Codex가 잡음. FE 검수 진행 중.
- dev Zabbix 직접 조회 스크립트: scratchpad `zbx.py`(접속 정보는 dev DB setting에서 읽고 출력 안 함).

**Why:** 사용자가 남은 Zabbix 래핑 공백 중 Proxy CRUD를 다음 작업으로 진행(2026-10-28).
**How to apply:** 이어서 할 때 워크트리·계약서부터. 런타임 실측은 BE 재기동 허락 후. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-wrapper-gaps|zabbix-wrapper-gaps]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-web-scenario-mgmt|zabbix-web-scenario-mgmt]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--review-loop-stop-rule|review-loop-stop-rule]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--worktree-remove-junction-node-modules|worktree-remove-junction-node-modules]].
