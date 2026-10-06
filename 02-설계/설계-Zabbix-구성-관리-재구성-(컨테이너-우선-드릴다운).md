# 설계 — Zabbix 구성 관리 재구성 (컨테이너 우선 드릴다운)

## ✅ 사용자 확정 결정 (2026-07-21 리뷰 완료 — 구현 기준)
1. **메뉴/경로**: 메뉴명 "구성 관리"(EN Configuration), 경로 `/zabbix-management/configuration` **신설** + 구 경로 2개(`/item-template-management`, `/trigger-management`) redirect. (§6/§7 권고안 채택)
2. **탭 전환 시 대상 유지**: 엔티티 탭(아이템↔트리거↔디스커버리) 전환 시 선택 호스트/템플릿 **유지**(컨테이너 우선). §2 리셋 매트릭스대로.
3. **호스트 아이템 인터페이스 = 명시 선택 UI 추가**: §4-4의 "BE 자동 위임(UI 생략)" 대신 **생성 폼에 인터페이스 select 추가**. 데이터 소스는 **BE 변경 없이** `GET /hosts/manage` 목록이 반환하는 `ManagedHostDto.interfaces`(`List<HostInterfaceDto>`: interfaceid/type/main/useip/ip/dns/port/available) 재사용 — ScopeTargetSelector가 로드하는 호스트 옵션에 interfaces를 실어 선택 호스트의 인터페이스를 ItemFormDrawer에 전달. 미선택 시 BE 자동 해석 폴백 유지(빈 목록/템플릿 스코프면 select 숨김). **⚠️ 옵션 매핑에서 interfaces 필드가 누락되지 않게 할 것.**
4. **트리거 탭 라벨**: 짧게 "트리거"(신규 키 `config_management.tab_trigger`, EN "Triggers").
5. **BE 변경 0건 최종 확정**(인터페이스 명시 UI 포함) — 순수 FE.

**실행**: 하네스, fe-engineer(fable5) 구현 → integration-qa(정적) → functional-qa(런타임). 미커밋 유지.

---

- **작성**: fe-engineer, 2026-07-21. 설계 전용(코드 변경 없음).
- **범위**: "아이템·템플릿 관리" + "트리거 관리" 2개 메뉴를 **구성 관리 1개 메뉴**로 통합.
  스코프(호스트|템플릿) 토글 + 대상 선택 → 엔티티 탭(아이템|트리거|디스커버리placeholder) 드릴다운.
  템플릿/템플릿 그룹 라이프사이클은 같은 메뉴의 별도 탭으로 존치.
- **선행 산출물**: `contract_item-template-mgmt.md`, `contract_trigger-mgmt.md`, `design_trigger-mgmt.md`.
- **핵심 결론(선요약)**: **BE 변경 0건.** 아이템 호스트 다이렉트는 BE·FE 하부(폼/서비스/타입)가
  이미 지원하며, `ItemManagementTab`의 "템플릿 전용 선택기"만 공용 스코프 선택기로 교체하면 열린다.

---

## 1) 목표 IA 다이어그램

```
사이드메뉴: Zabbix 관리
 ├─ 연동 정보
 ├─ 호스트 및 그룹 관리
 ├─ ★ 구성 관리        ← 아이템·템플릿 관리 + 트리거 관리 통합 (메뉴 2→1)
 └─ 사용자 관리

/zabbix-management/configuration  (신설 경로, 구 경로 2개는 redirect)
┌──────────────────────────────────────────────────────────────────────┐
│ [스코프: ●호스트 ○템플릿]  대상: [ web-01 ▼ (검색형 select) ]        │ ← A. 스코프 행
│   ※ 활성 탭이 엔티티 탭(아이템/트리거/디스커버리)일 때만 렌더        │    (탭바 위 고정)
├──────────────────────────────────────────────────────────────────────┤
│ 탭바(단일 평면):                                                     │
│  [아이템] [트리거] [디스커버리]   |   [템플릿] [템플릿 그룹]          │ ← B. 탭 5개
│  └── 엔티티 탭 (스코프 적용) ──┘      └ 라이프사이클 탭 (스코프 무관) ┘│
├──────────────────────────────────────────────────────────────────────┤
│ 탭 콘텐츠:                                                           │
│  · 아이템    : 대상 미선택 → Empty 안내 / 선택 → 필터+생성+목록 CRUD  │
│  · 트리거    : 동일 (현 TriggerManagementPage 본문 그대로)            │
│  · 디스커버리: "준비 중" 빈 패널 (BE/FE 미구현, 자리만)               │
│  · 템플릿    : 현 TemplateList 그대로 (CRUD/상세/링크·언링크)         │
│  · 템플릿그룹: 현 TemplateGroupList 그대로                            │
└──────────────────────────────────────────────────────────────────────┘
```

**상호작용 규칙**
- 스코프 행(A)은 **엔티티 탭 3개에만 적용**. 탭바 **위**(페이지 레벨)에 두고,
  활성 탭이 템플릿/템플릿 그룹이면 **숨김**(조건부 렌더 — disabled가 아니라 미표시).
- **대상 선택은 엔티티 탭 간에 공유·유지된다** — 컨테이너 우선의 핵심.
  호스트 web-01 선택 후 아이템 탭 → 트리거 탭으로 이동해도 같은 web-01의 트리거를 본다.
- 라이프사이클 탭으로 갔다 돌아와도 스코프/대상은 URL에 남아 있어 복원된다(리셋 안 함).

**검토 후 기각한 대안**: 상위 탭 [구성|템플릿|템플릿 그룹] + 구성 탭 내부에 엔티티 서브탭(2단 중첩).
탭바 2줄 중첩으로 시각적으로 무겁고, 기존 `?tab=` 딥링크 값(item/template/template-group)과
호환이 깨져 마이그레이션 비용만 늘어난다. 평면 5탭 + 조건부 스코프 행이 동등 기능에 더 단순.

---

## 2) 화면 상태 모델 (URL 쿼리 설계)

전제(memory: fe-page-remount-on-navigate): App.tsx CSSTransition(key=location.key)이 쿼리
navigate마다 페이지를 통째 리마운트한다. **데이터-결정 상태는 전부 URL, 전이 UI 상태(드로어
열림/편집대상/검색입력)만 로컬 useState** — 트리거 페이지에서 이미 검증된 규칙을 그대로 승계.

### 파라미터 (QueryParamKeys — 전부 기존 키 재사용, 신규 키 0개)

| 키 | 값 | 소유 | 비고 |
|---|---|---|---|
| `tab` | `item` \| `trigger` \| `discovery` \| `template` \| `template-group` | 페이지 | 기존 `ITEM_TEMPLATE_TABS` 3값에 `trigger`/`discovery` 추가 → **`CONFIG_TABS`로 개명·확장**(값은 보존 → 구 딥링크 그대로 유효) |
| `scope` | `host` \| `template` (기본 host) | 스코프 행 | 기존 `TRIGGER_SCOPE`와 동일 값 → 공용 `CONFIG_SCOPE`로 통일(`ITEM_SCOPE`/`TRIGGER_SCOPE` 대체) |
| `targetId` / `targetName` / `targetTech` | 대상 ID/표시명/기술명 | 스코프 행 | 트리거 페이지 방식 그대로. `targetTech`는 트리거 expression 플레이스홀더용(계약 §3) — 아이템 탭은 미사용이나 무해 |
| `keyword` `offset` `limit` `status` | 목록 파라미터 | 각 탭 | DmoveTable/Filter 표준 |
| `severity` | 트리거 탭 전용 필터 | 트리거 탭 | |
| `templateDetailId` | 템플릿 탭 상세 드로어 딥링크 | 템플릿 탭 | 유지 |
| `groupids` | 템플릿 탭 그룹 필터 | 템플릿 탭 | 유지 |
| ~~`templateId` / `templateName`~~ | (폐기) | — | 구 아이템 탭 전용 스코프 키 → `scope=template&targetId=`로 흡수. redirect에서 1회 매핑(§7) |

### 리셋 매트릭스 (기존 `handleTabChange` 리셋 로직의 일반화)

| 전이 | 리셋 | 유지 |
|---|---|---|
| 탭 전환(모든 조합) | `keyword` `offset` `status` `severity` `templateDetailId` `groupids` | `scope` `targetId/Name/Tech` — **엔티티 탭 간 대상 유지가 이 재구성의 목적.** 라이프사이클 탭에서는 무시되므로 남겨도 무해(복귀 시 복원) |
| 스코프 토글(host↔template) | `targetId/Name/Tech` + 목록 파라미터 전부 | `tab` |
| 대상 변경/해제 | `offset` | 나머지 |

- 탭 리셋 목록에서 구 `templateId/templateName`도 함께 null 처리(과도기 URL 청소).
- `destroyInactiveTabPane` 유지(비활성 탭 쿼리 실행 방지). 스코프 행은 Tabs **밖**이므로
  탭 전환에도 언마운트되지 않고, 리마운트 시엔 URL에서 복원.

---

## 3) 컴포넌트 재구성 매핑 (파일 단위 before → after)

**원칙: 파일 이동 최소화.** 기존 두 폴더는 그대로 두고, 신설 폴더에는 페이지 레벨 3파일만 만든다
(대량 이동은 테스트 import 경로·git 이력만 어지럽힘 — 후속 정리 태스크로 분리 가능).

### 신규 — `src/pages/zabbix-management/configuration/`
| 파일 | 내용 |
|---|---|
| `ConfigurationManagementPage.tsx` | 페이지 골격: 조건부 `<ScopeTargetSelector/>` + Tabs 5개 + §2 리셋 로직. `ItemTemplateManagementPage`의 후계 |
| `ScopeTargetSelector.tsx` | **TriggerManagementPage 상단부(스코프 Radio + 검색형 대상 Select + 합성 옵션 주입)를 추출한 공용 컴포넌트.** URL(`scope/targetId/Name/Tech`) 자체 읽기/쓰기 — props 불필요. 검색어(`targetSearch`)만 로컬 state. 스코프 검색 훅은 신규 `CONFIG_QUERY_KEY.HOST_SCOPE/TEMPLATE_SCOPE` 키 사용(페이지별 쿼리키 분리 규칙 — 트리거·아이템의 기존 SCOPE 키 4개는 폐기) |
| `DiscoveryPlaceholderTab.tsx` | §5 참조 — 빈 패널 |

### 수정
| 파일 | before → after |
|---|---|
| `item-template-management/ItemManagementTab.tsx` | 템플릿 전용 선택기(내장 Select + `templateId/templateName` URL) **제거** → URL의 `scope/targetId` 소비. `listParams`를 `scope`에 따라 `hostid`/`templateid` 분기(타입 `TManagedItemListParams`는 이미 hostid 지원). `ItemFormDrawer`에 `scopeType={scope}` 전달(현재 `ITEM_SCOPE.TEMPLATE` 하드코딩 → 이미 host 분기 구현돼 있음). §4의 상속 읽기전용 규칙 추가 |
| `trigger-management/TriggerManagementPage.tsx` | → `TriggerManagementTab.tsx` **개명**. 상단 스코프/대상 UI 블록 제거(페이지로 승격됨), 나머지(필터/목록/토글/드로어/삭제) 유지. `handleScopeChange`/`handleTargetChange`/`targetOptions`/`targetSearch`는 ScopeTargetSelector로 이동 |
| `constants/routes.ts` | `PATH_ZABBIX_MANAGEMENT.configuration` 추가, `itemTemplateManagement`/`triggerManagement`는 redirect 매칭용 주석 강등. `ITEM_TEMPLATE_TABS` → `CONFIG_TABS`(ITEM/TRIGGER/DISCOVERY/TEMPLATE/TEMPLATE_GROUP, 기존 3값 보존) |
| `constants/zabbix-item-template.ts` / `zabbix-trigger.ts` | `ITEM_SCOPE`·`TRIGGER_SCOPE` → 공용 `CONFIG_SCOPE`(신규 `constants/zabbix-config.ts`)로 통일. 나머지 상수 그대로 |
| `constants/queryKey.ts` | `CONFIG_QUERY_KEY { HOST_SCOPE, TEMPLATE_SCOPE }` 추가. `ITEM_TEMPLATE_QUERY_KEY.HOST_SCOPE/TEMPLATE_SCOPE`(현재 미사용 잔재)·`TRIGGER_QUERY_KEY.HOST_SCOPE/TEMPLATE_SCOPE` 제거 |
| `hooks/useZabbixTrigger.ts` | `useTriggerHostScope`/`useTriggerTemplateScope` → 공용 훅 `useConfigHostScope`/`useConfigTemplateScope`(신규 `hooks/useZabbixConfigScope.ts`)로 이동, ScopeTargetSelector가 소비 |
| `item-template-management/TemplateDetailDrawer.tsx` | `jumpToItemTab`: `templateId/templateName` 대신 `tab=item&scope=template&targetId=&targetName=` 세팅 |
| `routes/routes.tsx` | configuration 라우트 추가 + redirect 2개(§7). 구 2개 라우트 element 교체 |
| `layouts/app/SideNav.tsx` / `MobileSideNav.tsx` | 메뉴 2항목 → 1항목(`config_management.title`, key `configuration`) |
| `locales/kr.json` / `en.json` | §6 신규 키. 기존 `item_template_management.*`/`trigger_management.*` 키는 **유지**(하위 컴포넌트 대량 교체 회피) |

### 제거
- 단독 트리거 메뉴 항목(SideNav/MobileSideNav) 및 단독 라우트 element(경로는 redirect로 존치).
- `ItemManagementTab` 내장 템플릿 선택기, `QueryParamKeys.TEMPLATE_ID/TEMPLATE_NAME` 소비처
  (enum 키 자체는 redirect 매핑에서 1회 읽으므로 존치).

---

## 4) 아이템 호스트 다이렉트 부활 상세

**BE 결론: 변경 불필요 — 실측 확인 완료** (`ZabbixItemManageController/Service`):
- 목록 `GET /zabbix-manage/items` — `hostid` 파라미터 처리 확인(Service.list, hostidFilter 우선).
- 키 자동완성 `GET /items/keys` — `hostid` 수용(둘 중 하나 필수, ITEM_TARGET_REQUIRED).
- 생성 `POST /items` — `ItemCreateReqDto.hostId` 수용, **인터페이스 자동 해석 구현됨**
  (`resolveInterfaceId`: 명시 `interfaceId` 우선 → main agent 인터페이스 → 첫 인터페이스 → 없으면 미설정.
  인터페이스 필요 유형 집합 {0,3,12,13,14,16,20}만 대상).

**FE 하부도 이미 지원** — 막힌 곳은 탭 진입점뿐:
- `ItemFormDrawer`: `scopeType` prop으로 host/template 분기 완비(hostId 전송, 마스터 후보 hostid 조회,
  KeyCatalogModal hostId 전달). 현재 호출부가 `ITEM_SCOPE.TEMPLATE`를 하드코딩했을 뿐.
- `TItemCreateReq.hostId/interfaceId`, `TManagedItemListParams.hostid`, `TItemKeyListParams.hostid` 존재.

**필요 변경(전부 FE, ItemManagementTab 국소)**
1. 대상 선택 UI: 자체 선택기 삭제 → 페이지 레벨 ScopeTargetSelector 공유(§3).
2. 목록: `scope===host ? {hostid: targetId} : {templateid: targetId}`.
3. 키 자동완성: KeyCatalogModal은 이미 hostId/templateId 분기 — 전달값만 스코프 따라감.
4. 인터페이스: 1차는 **BE 자동 해석에 위임, FE 인터페이스 선택 UI 없음**(생성 폼 단순 유지).
   인터페이스가 전혀 없는 호스트 + 인터페이스 필요 유형이면 자빅스 -32602 원문이 토스트로
   노출됨(기존 에러 경로) — 수용. 명시 선택은 후속(TItemCreateReq.interfaceId 자리 있음).
5. **상속 아이템 읽기전용(신규 규칙, 호스트 스코프에서 중요)**: 호스트 아이템 다수는 링크된
   템플릿 상속본(`templateid !== "0"`, 이미 "상속" 태그 표시 중). 자빅스는 상속 아이템의
   key/name 수정·삭제를 거부한다 → 트리거 탭과 동일하게 **수정/삭제 버튼·체크박스 비활성 +
   툴팁**. **status 토글은 허용**(자빅스가 상속 아이템 enable/disable은 허용 — 트리거와 다른 지점).
   템플릿 스코프에서도 동일 규칙 적용(부모 템플릿 상속본) — 현행 미비점의 개선.

---

## 5) 디스커버리 placeholder 명세

- 탭 라벨: `config_management.tab_discovery` = "디스커버리" / "Discovery".
- 콘텐츠(`DiscoveryPlaceholderTab.tsx`): AntD `<Empty>` 1개 —
  `config_management.discovery_placeholder` = "디스커버리 규칙 관리는 준비 중입니다." /
  "Discovery rule management is coming soon." 대상 선택 여부와 무관하게 동일 표시(조회 없음).
- 탭 자체는 항상 노출(disabled 아님 — 자리 예고가 목적).
- 후속 확장 지점: BE `discoveryrule.*` EP(`/zabbix-manage/discovery-rules` 예약) + 계약 산출 후
  `DiscoveryManagementTab`으로 교체. 스코프/대상/리셋 규칙은 §2를 그대로 상속하므로 페이지 무변경.

---

## 6) 메뉴/네이밍/라우트

- **메뉴명 권고: "구성 관리"** (EN "Configuration"). 부모 메뉴가 이미 "Zabbix 관리"라
  "Zabbix 구성 관리"는 중복 — 형제 항목("호스트 및 그룹 관리" 등)과 결 맞춤.
- **라우트 권고: `/zabbix-management/configuration` 신설 + 구 경로 redirect** (아래 §7).
  기존 경로 유지안(`/item-template-management`에 트리거 흡수)은 redirect가 1개 줄지만
  경로명이 내용과 영구 불일치 — 이 레포는 이미 구경로 redirect 관례가 확립돼 있어
  (`/setting/host-management`→, `/users-roles/*`→) 신설 비용이 낮다.
- i18n 신규 키(루트 `config_management` — 루트 키 중복 금지 교훈 주의, kr/en 동시 추가):
  `title`, `tab_discovery`, `discovery_placeholder`.
  탭 라벨 재사용: 아이템=`item_template_management.tab_item`, 템플릿=`tab_template`,
  템플릿 그룹=`tab_template_group`, 트리거=`trigger_management.title`(또는 신규 `config_management.tab_trigger` — 짧은 라벨이 필요하면 신규 권장).
  스코프/대상 라벨은 `trigger_management.scope_host/scope_template/select_*` 재사용(문구 동일).

---

## 7) 리스크 · 마이그레이션 · 회귀 주의

**딥링크/북마크 호환 (routes.tsx redirect 2개, UserManagementRedirect 선례 재사용)**
| 구 URL | 신 URL 매핑 |
|---|---|
| `/zabbix-management/trigger-management?scope=…&targetId=…` | `/…/configuration?tab=trigger` + **나머지 쿼리 전량 보존**(scope/target 키 동일해서 무손실) |
| `/…/item-template-management?tab=item&templateId=X&templateName=Y` | `/…/configuration?tab=item&scope=template&targetId=X&targetName=Y` (**키 매핑 필요** — templateId→targetId) |
| `/…/item-template-management?tab=template\|template-group&…` | `/…/configuration` + 쿼리 그대로 (tab 값 보존됨) |

**회귀 주의점**
1. **엔티티 탭 간 대상 유지 ↔ 탭 리셋의 균형**: 기존 페이지는 탭 전환 시 선택 대상까지
   리셋했다(§2에서 의도적으로 변경). 트리거 탭에서 `severity` 리셋 누락 시 아이템 탭 목록
   요청에 무해하지만 URL 잔재 — 리셋 목록에 포함(§2 표).
2. **쿼리키 캐시**: ScopeTargetSelector가 단일 키를 쓰므로 아이템/트리거 탭이 같은 검색
   캐시를 공유 — 같은 페이지 내 공유는 규칙 위반 아님(페이지 간 공유만 금지).
3. **호스트 스코프 아이템 수정 실패 케이스**: §4-5 미적용 시 상속 아이템 수정에서 자빅스
   원문 에러가 빈발할 것 — 반드시 함께 구현.
4. **SideNav 활성 하이라이트**: 메뉴 key가 경로 기반이면 `configuration` 반영 확인.
5. **테스트 영향**: `ItemManagementTab.test.tsx`(선택기 제거·scope 소비로 재작성),
   `ItemFormDrawer.test.tsx`(host scopeType 케이스 추가), `TriggerFormDrawer.test.tsx`(무변경
   기대 — props 동일), `TemplateList/TemplateGroupList/TemplateGroupDetailDrawer/
   TemplateGroupFormModal.test.tsx`(무변경 기대), 신규 `ConfigurationManagementPage.test.tsx`
   (탭 전환 리셋·조건부 스코프 행)·`ScopeTargetSelector.test.tsx`. 실행은 `npx jest`.
6. **미커밋 선행 작업과의 충돌**: 트리거 관리·아이템/템플릿 관리·호스트 분류 태그가 전부
   미커밋 상태 — 이 재구성은 그 위에 증분으로 얹는다(파일 이동 최소화 원칙의 또 다른 이유).

---

## 8) 작업 분해 (체크리스트)

**BE — 없음** (§4 실측 결론. 계약 문서 2건도 EP 변경 없어 개정 불필요; FE 스코프 사용 확대만 주석 추가 가능)

**FE (난이도: 중 — 신규 로직보다 재배선 위주)**
- [ ] 1. 상수/키: `CONFIG_TABS`(routes.ts), `CONFIG_SCOPE`(constants/zabbix-config.ts),
      `CONFIG_QUERY_KEY`(queryKey.ts), 기존 SCOPE 상수/키 정리 — 난이도 하
- [ ] 2. `ScopeTargetSelector.tsx` 추출 + `useZabbixConfigScope.ts` 훅 이동 — 중
- [ ] 3. `ConfigurationManagementPage.tsx` (탭 5개 + §2 리셋) — 중
- [ ] 4. `ItemManagementTab` 호스트 스코프 지원 + 상속 읽기전용 규칙(§4) — 중
- [ ] 5. `TriggerManagementPage` → `TriggerManagementTab` 슬림화 — 하
- [ ] 6. `DiscoveryPlaceholderTab` — 하
- [ ] 7. 라우트/redirect 2개 + SideNav/MobileSideNav 메뉴 통합 — 하
- [ ] 8. `TemplateDetailDrawer.jumpToItemTab` 파라미터 이행 — 하
- [ ] 9. i18n(kr/en) — 하
- [ ] 10. 테스트 갱신/신규(§7-5) + `yarn build`·lint — 중

**QA**
- [ ] integration-qa(정적): scope 분기별 요청 파라미터(hostid/templateid) ↔ 계약 대조,
      redirect 매핑 표(§7) 검증 — 얇게(계약 변경 없음)
- [ ] functional-qa(런타임): ① 호스트 대상 아이템 생성(agent 유형 → 인터페이스 자동 해석
      확인) ② 엔티티 탭 간 대상 유지 ③ 스코프 토글 리셋 ④ 구 딥링크 3종 redirect
      ⑤ 상속 아이템 수정/삭제 비활성·status 토글 허용 ⑥ 템플릿/그룹 탭 기존 흐름 무회귀
