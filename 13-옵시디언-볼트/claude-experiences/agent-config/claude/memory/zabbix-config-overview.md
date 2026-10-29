---
name: zabbix-config-overview
description: "ZM-118 자빅스 관리 구성 현황 대시보드 — 설계·구현·코덱스 검수 완주, BE c2c4123 / FE 3fbcd57 커밋(미푸시)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3d9d2189-1239-4593-9e1e-925f6e327076
  modified: 2026-08-26T07:02:27.508Z
---

2026-08-26 **ZM-118 완주**(설계 → BE → FE → 브라우저 QA → 코덱스 검수 반영 → 커밋). 미푸시.
격리 worktree `C:\worktrees\zm-118-be|fe`(BE :3002 / FE :5175). 기동 스크립트는 사용자 지시로 커밋 제외·삭제.

**만든 것**: 자빅스 관리 맨 앞 `/zabbix-management/configuration-overview` + 5개 관리 화면의 대시보드 탭 + 목록 KPI 밴드 8곳.
BE read-only EP 6개(`/zabbix-manage/overview*`). 정본: `_workspace/features/zabbix-config/config-overview/devdesign_zabbix-config-overview.md` v1.1 ·
`_workspace/features/zabbix-config/config-overview/contract_zabbix-overview.md` · `_workspace/features/zabbix-config/config-overview/review_zabbix-config-overview.md`(코덱스 반영 §7).

**dev 실측이 드러낸 것** — 이 화면의 존재 이유: 호스트 76대 중 **에이전트 정상 9대**(불통 44) · 템플릿 347개 중 **쓰이는 것 39** ·
아이템 11,834 중 **지원 안 됨 3,568** · 미디어 46 등록 → 11 활성 → **8만 액션이 참조** · 미분류 호스트 61.

🔴 **Zabbix 함정 (되돌리지 말 것)**
- `ZabbixXxxService.countRaw`는 파라미터를 그대로 넘길 뿐 — **`countOutput`을 호출자가 넣어야 한다.** 빠뜨리면 목록이 와서 파서가 0으로 읽어 **에러 없이 모든 수가 0**이 되고 응답도 10초로 느려진다.
- 아이템/트리거는 **모집단이 둘**: 정의(`inherited:false, flags:0` = 렌즈 목록과 같은 수)와 실재(`templated:false`). 단순 뺄셈으로 "자동 생성 수"를 만들 수 없다.
- `value_type` **5(binary)** 가 Zabbix 7.0에서 실제로 나온다 — 기존 `item_template_management.value_type_labels`에 없다.
- 호스트그룹이 두 벌: Zabbix 원본 30 vs 우리 DB `host_group` 7행. **스코프 선택지로 DB 그룹을 쓰면 고를 수 없는 그룹이 생긴다.**
- `action.get`은 `eventsource`를 반드시 요구한다(없으면 에러) → 소스별로 나눠 센다.

🔴 **집계·차트 설계 교훈**
- 상태 분류는 **배타로** 만들어야 조각 합이 총계와 같다(`available`을 그대로 세면 인터페이스 없는 호스트와 SNMP 전용이 이중/누락).
- agent 인터페이스가 **여러 개**면 첫 번째만 보면 안 된다 — Zabbix 응답 순서에 판정이 흔들린다("하나라도 응답하면 정상").
- 퍼널은 **누적 교집합**이어야 한다. 단계별 독립 판정이면 `withTemplate 72 < withItem 73`이 나와 깨진다.
- 크기가 만 단위와 한 자리 수인 도메인을 **같은 막대 축**에 놓으면 작은 쪽이 전부 0에 붙는다 → 비율 막대로.

🔴 **구조 교훈**
- **JPA 엔티티 리스너를 스프링 빈으로 만들면 `@DataJpaTest` 컨텍스트가 안 뜬다**(이 레포에서 과거 6건이 그렇게 깨졌다). static 슬롯 + 별도 Binder 빈으로 꽂는다. 선례 `ChangeLogOriginListener`.
- 캐시 무효화 훅은 **변경 이력 적재 지점**이 정답 — 모든 Zabbix 쓰기가 거기를 거치므로 수십 개 EP에 심을 필요가 없다. 단 `@PostPersist`는 커밋 **전**이라 `TransactionSynchronization.afterCommit`으로 미뤄야 한다(선례 `SettingService.invalidateFleetCacheAfterCommit`).
- 병렬 호출에서 **실패를 0으로 채우면 조용히 틀린 값**이 된다 — 실패 키를 돌려주고 degraded로 올린다.
- FE `staleTime`을 BE TTL과 맞추면 BE가 캐시를 지워도 화면이 안 바뀐다. **신선도 판단은 캐시를 가진 쪽(BE)에 맡기고** FE는 짧게 둔다.
- 기존 페이지 테스트가 `QueryClientProvider` 없이 렌더한다 — 페이지에 react-query 훅(KPI 밴드)을 넣으면 즉시 깨진다(4개 파일 목 처리).
- 브레드크럼이 URL 세그먼트를 `_`로 바꿔 i18n 키로 쓴다 → **세그먼트와 i18n 루트 키를 일치**시킨다(`configuration-overview` ↔ `configuration_overview`). 일반 명사 세그먼트는 남의 네임스페이스와 부딪힌다.

**남은 것**: 푸시 · `degraded` 실발생 화면 미검증 · 규모 상한 초과 경로 미검증 · 대규모 부하 미검증 ·
`LocalDateTime`에 `'Z'`를 붙이는 타임스탬프 표기는 **제품 전역 관례라 이번 범위 밖으로 보류**(코덱스 지적, 전역 과제).

관련: [[zabbix-wrapper-principle]] · [[zabbix-wrapper-gaps]] · [[codex-review-handoff]] · [[commit-requires-approval]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

자빅스 구성 현황 대시보드 — 2026-08-26 ZM-118 완주·커밋(BE `c2c4123`·FE `3fbcd57`, 미푸시). 자빅스 관리 맨 앞 통합 화면+도메인 탭 5+목록 KPI 8. 실측: 에이전트 정상 9/76·템플릿 쓰이는 것 39/347·미디어 8/46. 🔴`countRaw`는 countOutput을 안 넣어줌(빠뜨리면 에러 없이 전부 0) · 아이템/트리거 모집단 이원(정의≠실재) · JPA 엔티티 리스너를 빈으로 만들면 @DataJpaTest 붕괴 · 캐시 무효화는 변경이력 적재 지점+afterCommit · 병렬 실패를 0으로 채우면 조용히 틀림 · FE staleTime을 BE TTL과 맞추면 무효화가 안 보임
