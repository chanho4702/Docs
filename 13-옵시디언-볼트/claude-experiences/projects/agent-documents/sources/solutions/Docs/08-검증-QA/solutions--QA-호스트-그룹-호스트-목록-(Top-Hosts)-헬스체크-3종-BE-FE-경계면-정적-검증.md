# QA — 호스트 그룹 "호스트 목록"(Top Hosts) 헬스체크 3종 BE↔FE 경계면 정적 검증

검증자: integration-qa · 날짜: 2026-06-18
단일 진실원천: `C:\solutions\_workspace\contract_host-healthcheck.md`
범위: 정적 shape/필드명/옵셔널/래퍼깊이/i18n 키 대조 (런타임 동작은 functional-qa 담당)

## 종합 결과: **PASS** (불일치 0건, 경미한 관찰 1건)

---

## 체크포인트 결과표

| # | 체크포인트 | 기대(BE/계약) | 실제(FE) | 판정 |
|---|-----------|--------------|----------|------|
| 1 | 필드명 일치 | `agentHealth`/`icmpHealth`/`interfaceHealth` (camelCase) | `THostStatusItem` 3필드·테이블 `record.agentHealth/icmpHealth/interfaceHealth` 동일 | PASS |
| 2 | 값 도메인 일치 | `'available'|'unavailable'|'unknown'` (BE enum `HealthState`) | `THealthState` 동일 3값, 배지 색/라벨 맵 3값 전부 매핑 | PASS |
| 3 | 옵셔널/널 규칙 | 항상 문자열, nullable 아님 | FE 타입 non-optional·non-nullable | PASS |
| 4 | 래퍼 언랩 깊이 | 소비처는 `{items,total}` 직접 수신 | `data?.items`/`data?.total` 접근 | PASS |
| 5 | i18n 키 | 사용 t() 키가 kr/en 양쪽 존재 | 전부 존재·매칭 | PASS |
| 6 | 기존 필드 무회귀 | `available`/`status`/`healthValue`/`activeAlarmCount` 불변 | FE 타입·컬럼 그대로 유지 | PASS |
| - | 경로·메서드 | `GET /hosts/:groupid/top-hosts` | `API.get(\`${hostsUrl}/${groupId}/top-hosts\`)` | PASS |

---

## 상세 대조 근거

### CP1 — 필드명 (camelCase 일관성)
- BE enum 산출: `host-status.dto.ts:48,57,67` → `agentHealth`/`icmpHealth`/`interfaceHealth`.
- BE 서비스 매핑: `host.service.ts:554-561` 세 필드 모두 `new HostStatusDto({...})`로 채움. (주의: 객체 리터럴 순서가 계약 표기와 다르게 agent→interface→icmp 순이나, 키-값 매핑이므로 무영향.)
- FE 타입: `host-monitoring.ts:367-369` 동일 3필드.
- FE 소비: `HostGroupTopHosts.tsx:151,160,169` `record.agentHealth/icmpHealth/interfaceHealth`. 철자·대소문자 1:1 일치.

### CP2 — 값 도메인 (BE 출력 ⊆ FE 처리)
- BE 가능값: `constant.ts:83-87` `HealthState = available|unavailable|unknown`. service의 모든 분기(`resolveInterfaceHealth` `host.service.ts:587-591`, `getIcmpHealthByHost` :616, fallback `?? HealthState.UNKNOWN` :561,604)가 이 3값 외로 새지 않음.
- FE 처리: `HostGroupTopHosts.tsx:55-65` `HEALTH_STATE_COLOR`/`HEALTH_STATE_LABEL_KEY`가 3값 전부 키로 보유(available→green, unavailable→red, unknown→default). 누락 색/라벨 없음. `:70-71`에 예상밖값 unknown 폴백까지 방어. **매핑 누락 0.**

### CP3 — 옵셔널/널
- BE DTO 3필드 비옵셔널(`?` 없음), 계약 §2.3 "nullable 아님, 근거 없으면 'unknown' 문자열".
- FE `THostStatusItem` 3필드 비옵셔널·non-nullable. 어긋남 없음.

### CP4 — 래퍼 언랩 깊이 ([[fe-usedmovequery-unwrap]] 패턴)
- BE: 컨트롤러 `host.controller.ts:305-318` `ApiResult<PaginationResponseDto<HostStatusDto>>` → raw 본문 `data:{items,total}`.
- FE: api 함수 `host-monitoring.api.ts:306` 반환타입 `Promise<TResponseList<THostStatusItem>>`, axios 인터셉터+useDmoveQuery 2겹 언랩 후 소비처가 받는 값 = `{items,total}`.
- 컴포넌트 `HostGroupTopHosts.tsx:191,193` `data?.items ?? []`, `data?.total ?? 0`. `data.data` 같은 과다언랩 없음. `TResponseList<T>`(`dataResponse.ts:28-39`)에 items/total 존재. 정확.

### CP5 — i18n 키 (kr/en 양쪽 존재 + 조회 키 매칭)
- 배지 라벨 조회: `HealthStateBadge`가 `t("top_hosts.available"|"top_hosts.unavailable"|"top_hosts.unknown")`.
  - kr.json:96-100 / en.json:96-100 `top_hosts` 블록에 available/unavailable/unknown 3키 모두 존재. 양쪽 일치.
- 컬럼 헤더: `useTableColumns.ts:28` `title: t(item.title || item.key)`. 신규 컬럼은 title 미지정 → key가 t() 키.
  - `agent_health`/`icmp_health`/`interface_health` → kr.json:80-82 / en.json:80-82 모두 존재. 매칭.
- StatusBadge: `t(status.toLowerCase())`(예 `t("ok")`) — 기존 키, 무회귀 범위.

### CP6 — 기존 필드 무회귀
- BE DTO `hostid/name/available/status/healthValue/activeAlarmCount` 시그니처 불변(`host-status.dto.ts:11-38`).
- FE `THostStatusItem` 동일 6필드 유지(`host-monitoring.ts:361-366`), 컬럼 status/health/alerts 렌더 불변.
- 계약 §3 "기존 산식·available 판정 변경 없음" 명시와 정합.

---

## 관찰(비차단, INFO)
- **심각도: 정보** — DTO 객체 리터럴 필드 순서(`host.service.ts:554-561`)가 계약 §2.3 문서 표기 순서(agent→icmp→interface)와 다름(코드는 agent→interface→icmp). 키 기반 직렬화이므로 **응답 shape에 영향 없음**. 수정 불요, 참고만.
- `getIcmpHealthByHost`는 `icmpping` item이 없는 호스트를 result에 넣지 않고, 매핑 시 `?? HealthState.UNKNOWN`(`:561`)으로 보강 → 계약 "item 없으면 unknown"과 정합. 정적 검증 통과(빈 그룹/무데이터 런타임 거동은 functional-qa 확인 권장).

## 책임 주체별 조치
- be-engineer: 조치 없음.
- fe-engineer: 조치 없음.

## 결론
6개 체크포인트 전부 PASS. 차단성 불일치 없음. 경계면 정적 정합성 확보됨.
