---
name: host-duplicate-name-fix
description: "호스트 등록 \"already exists\" 오류 — Zabbix 중복 판정은 기술명 기준·목록 검색은 표시명만 봐서 \"없는 호스트\"로 오인, FE가 오류를 일반 문구로 덮던 것 수정(2026-09-22, ZM-166 커밋 BE 631d420·FE 2ac4cd5, 미푸시)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6747421f-5a72-4e63-8d69-969ebf118ba4
  modified: 2026-09-22T07:25:15.838Z
---

2026-09-22 사용자 보고: host.create가 `Host with the same name "10.220.0.82" already exists`로 실패했는데 화면엔 그 호스트가 없고 오류도 안 보임.

**실측 원인:** dmove.co.kr Zabbix에 hostid 10696 = 기술명 `10.220.0.82`, 표시명 `zabbix-server`(디스커버리 생성). Zabbix 중복 판정은 **기술명(host)**, 우리 목록 검색은 `search {name}`(표시명)만 → 화면에서 못 찾음. BE는 HTTP 200+code 400으로 원문을 정상 전달했고 FE `HostFormDrawer.handleError`가 403·INVALID_NAME 외 전부 "요청 처리 실패"로 치환.

**수정(ZM-166, BE `631d420` 3파일·FE `2ac4cd5` 7파일, master 직접 커밋·미푸시):** `HOST_DUPLICATE_NAME` + 생성/수정 전 `host.get filter host/name` 선검사(data=`{field,hostid,host,name}`) + Zabbix "already exists" 폴백 매핑 + list `search {host,name}`·`searchByAny`(🔴 filter까지 OR라 status는 Java 후처리) / FE 필드 에러 + 기타 오류는 BE 원인 문장 토스트. BE 29/29·FE 23/23·:3002 실측 통과. 인계 `_workspace/features/zabbix-config/host-registration/review_host-duplicate-name.md`.

**Why:** 사용자가 원인을 못 보고 5회 반복 시도 — "일반 실패 문구로 덮기"는 원인 은폐가 된다.
**How to apply:** Zabbix 이름 관련 오류를 다룰 때 기술명/표시명 축을 먼저 구분. 호스트 검색 UI는 두 축 다 검색. `searchByAny`를 쓸 때 filter 조합 주의. 🔴 master 작업 트리에 타 세션 APM 미커밋 변경 혼재 — 선별 커밋. [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-wrapper-principle|zabbix-wrapper-principle]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]]
