---
name: recently-viewed-excludeid-optional
description: recently-viewed의 excludeId는 빈 문자열 허용이어야 함(@IsNotEmpty 금지) — 목록 화면 최근조회가 깨졌던 선재 버그
metadata: 
  node_type: memory
  type: project
  originSessionId: 9f56c257-24c7-4cb8-a1ec-51074a6daad5
---

moveseye-be `host` 모듈의 `recently-viewed` 엔드포인트에서 `excludeId`는 **빈 문자열을 허용**해야 한다. 목록 화면(서버/네트워크/호스트그룹)은 제외할 자기 id가 없어 `excludeId=`(빈값)를 보내고, 서비스(`host.service.ts` `listRecentlyViewedHosts`)는 `filter.excludeId || ''`로 이를 처리하도록 설계됨. 상세 화면만 자기 id를 넣는다.

**Why:** `SearchRecentlyViewedReqDto.excludeId`에 `@IsNotEmpty()`가 걸려 있어(2026-05-29 도입) 빈 excludeId가 400으로 막혔고, 그 결과 **서버/네트워크 목록의 "최근 조회"가 호스트그룹 기능 추가 전부터 항상 빈 상태로 깨져 있었다**. 2026-06-19 호스트그룹 최근조회 추가 작업의 functional-qa 중 발견·수정(`@IsNotEmpty` → `@IsOptional`). Swagger상 excludeId가 required:false로 바뀜(FE는 이미 빈 문자열 전송 중이라 FE 변경 불필요).

**How to apply:** recently-viewed/mark-view 계열 DTO를 만질 때 excludeId에 `@IsNotEmpty()`를 다시 넣지 말 것. 목록 최근조회가 비어 보이면 이 400을 먼저 의심. refType 값은 enum `RecentlyViewedRefType`(SERVER/NETWORK/EC2S/HOSTGROUP, 대문자 고정)이며 FE `MonitoringType`과 문자열이 정확히 일치해야 한다. 응답 item은 refType별로 필드가 다름(HOSTGROUP은 `{hostid=groupid, name, createdAt}`, region/host 없음). 관련 언랩 규약은 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-usedmovequery-unwrap|fe-usedmovequery-unwrap]].

**⚠️ 2026-06-19 업데이트 — FE는 더 이상 이 BE 엔드포인트를 호출하지 않음.** 사용자 결정으로 "최근 조회"를 **localStorage 기반으로 전환**(전 타입 SERVER/NETWORK/EC2S/HOSTGROUP). FE 구현: `moveseyee_fe/src/utils/recentlyViewed.ts`(add/get), 키 `dmove:recently-viewed:{userId}`(redux `state.auth.id`), **TTL 24시간 + 타입별 최대 5개**, 화면 표시 최신 3개. 기록 지점은 `HeaderDetailInfo.tsx`(SERVER/NETWORK/EC2S, name=headerInfo[0].value)·`HostGroupDetail.tsx`(HOSTGROUP, name=data.name). BE의 recently-viewed/mark-view 엔드포인트·서비스·`recently_viewed` 테이블·HOSTGROUP enum/마이그레이션은 **제거하지 않고 미사용 상태로 보존**(Nest+Spring 양쪽). 따라서 위 excludeId/refType 계약은 BE 측 사실로는 유효하나, 현재 FE 동작과는 무관하다. 이름은 localStorage에 저장되어 stale 가능(그룹/호스트명 변경 시 옛 이름).
