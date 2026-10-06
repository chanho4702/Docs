# 설계 — Zabbix 관리 완전 컨테이너 드릴다운 재구성 (A안, B안 후계)

## ✅ 사용자 확정 결정 (2026-07-21 리뷰 — 구현 기준)
- **A**: 호스트 단건 조회 BE EP `GET /hosts/manage/{hostid}` **신설**(ManagedHostDto 재사용). 딥링크/새로고침 상세 진입 + 인터페이스 select 데이터 확보.
- **B**: 호스트 '정보/인터페이스' 탭 = 조회 뷰 + 기존 HostFormDrawer/HostDeleteModal 재사용(태그 round-trip 재구현 금지).
- **C**: TemplateDetailDrawer → **상세 페이지 '정보' 탭으로 승격**(메타 수정/삭제/link·unlink 이관, jumpToItemTab은 서브탭 전환으로 대체). 호스트/템플릿 완전 대칭.
- **D**: 메뉴명 "호스트 관리" / "템플릿 관리".
- **E**: 호스트 목록 수정/삭제 액션 1차 존치.
- **F**: 구 경로 3계보(configuration/item-template-management/trigger-management) redirect 존치, 공용 매핑 함수 1개로 통합.
- **진행**: 선행작업 커밋 없이 바로 착수. 하네스 be→fe→QA. 모델 fable5. 미커밋 유지.

---

- **작성**: fe-engineer, 2026-07-21. 설계 전용(코드 변경 없음).
- **배경**: 직전 "구성 관리 1메뉴 + 스코프 토글"(B안, `design_config-mgmt-restructure.md`) 구현 완료(미커밋) 후,
  사용자가 **완전 컨테이너 드릴다운(A안)**으로 최종 결정. 본 문서는 B안 산출물 위에 얹는 증분 재구성 설계.
- **목표 구조 (Zabbix 네이티브)**:
  ```
  호스트 관리   → [호스트 | 호스트 그룹] → 호스트 선택 → 서브탭 [정보/인터페이스 · 아이템 · 트리거 · 디스커버리(placeholder)]
  템플릿 관리   → [템플릿 | 템플릿 그룹] → 템플릿 선택 → 서브탭 [정보 · 아이템 · 트리거 · 디스커버리(placeholder)]
  ```
- **핵심 원칙**: 스코프 토글 제거 — "어느 컨테이너 상세에 있느냐"가 곧 스코프.
  호스트 상세=scope host, 템플릿 상세=scope template. B안의 엔티티 탭·폼 드로어·상속 규칙은 전량 보존·재사용.

---

## 1) 목표 IA + 네비게이션 모델

### 1-1. 사이드 메뉴 (Zabbix 관리, isSuperRole 전용)

```
Zabbix 관리
 ├─ 연동 정보                  /zabbix-management/connection-info      (무변경)
 ├─ 호스트 관리                /zabbix-management/host-management      (기존 경로 유지, 드릴다운 추가)
 ├─ ★ 템플릿 관리             /zabbix-management/template-management  (신설 — 구성 관리 메뉴 대체)
 └─ 사용자 관리                /zabbix-management/user-management      (무변경)
```
- "구성 관리" 메뉴 항목 제거(B안 산출). 메뉴 수는 B안과 동일하게 4개 유지(2→1 통합 효과는 상실되지 않음 —
  구 체제 5개 대비 여전히 감소).
- 호스트 관리 메뉴명: 현행 `host_management.title`("호스트 및 그룹 관리" 계열) 유지 또는 "호스트 관리"로 단순화 — 열린 결정 §D.

### 1-2. 핵심 결정 — (a) 라우트 파라미터 방식 채택 (권고)

| 기준 | (a) 라우트 파라미터 `/host-management/:hostid` | (b) 같은 페이지 내 뷰 스위치 (`?hostid=` 쿼리) |
|---|---|---|
| 딥링크 | URL이 자원을 직접 표현. 새로고침/공유 자연스러움 | 가능하나 "뷰 상태 플래그"가 쿼리에 섞임 |
| 뒤로가기 | 브라우저 back = 상세→목록(목록 쿼리 이력 보존) — 히스토리 의미 명확 | back이 쿼리 변경 단위로 잘게 쌓여 UX 혼탁 |
| 브레드크럼 | **기존 useBreadcrumbs가 공짜로 처리** — 경로 세그먼트 자동 생성, index 2 동적 세그먼트는 Skeleton→`replacePathBreadcrumb(호스트명)` 치환(HostGroupDetail·AssetDetailPage 선례 그대로) | 세그먼트가 없어 수동 브레드크럼 구현 필요 |
| 리마운트 규칙 | 목록↔상세가 서로 다른 라우트 → 쿼리 네임스페이스 분리. 목록 필터(keyword/offset)와 상세 서브탭 목록 필터가 **충돌하지 않음** | 목록 keyword/offset과 서브탭 keyword/offset이 같은 URL에서 충돌 → 진입/이탈 시 리셋 로직 비대화 |
| SideNav 하이라이트 | `pathname.split("/").slice(0,3)` 로직상 `/zabbix-management/host-management/123`도 current=`host-management` — **무수정 동작** | 동일 |
| 레포 선례 | `/asset/list/:id`, `/monitoring/host-group/:id`, `/event-alert/problem/:id`, `/asset/geo-map/:id` 등 상세 드릴다운 전부 이 방식 | 선례 없음 |

→ **(a) 채택.** (b)는 기각 — 쿼리 충돌·수동 브레드크럼·선례 이탈 3중 비용.

**서브탭 표현: 쿼리 `?tab=`** (경로 세그먼트 `/items`가 아니라). 근거: UserManagementPage·B안 ConfigurationManagementPage의
`QueryParamKeys.TAB` 관례와 일치, 중첩 라우트 불필요, 브레드크럼 세그먼트 오염 없음.

### 1-3. 브레드크럼 / back 네비

- 호스트 상세: `홈 > Zabbix 관리 > 호스트 관리(링크→목록) > {호스트명}` —
  `replacePathBreadcrumb(host.name, path, 3)` (HostGroupDetail 패턴). 템플릿 상세 동일(`{템플릿 표시명}`).
- 상세 페이지 상단에 명시적 back 없이 브레드크럼 중간 링크 + 브라우저 back으로 충분(선례 일치).
  브레드크럼 링크는 목록의 필터 쿼리를 보존하지 않음(브라우저 back은 보존) — 선례와 동일한 수용 사항.
- `translateSegment`용 i18n: `zabbix_management`(존재), `host_management.title`(존재), **`template_management.title`(신규)**.

---

## 2) 엔티티 탭 재사용 — scope/targetId 주입 방식

### 결정: **URL 소비 → props 주입으로 전환** (컨텍스트 불필요)

B안에서 ItemManagementTab/TriggerManagementTab은 URL의 `scope/targetId/targetName/targetTech`를 직접 읽는다.
A안에서는 스코프가 라우트로 결정되므로 이 4개 값을 **상세 페이지가 props로 내려준다**:

```tsx
// 호스트 상세 페이지에서
<ItemManagementTab scope={CONFIG_SCOPE.HOST} targetId={hostid}
                   targetName={host.name} hostInterfaces={host.interfaces} />
<TriggerManagementTab scope={CONFIG_SCOPE.HOST} targetId={hostid}
                      targetName={host.name} targetTech={host.host} />
// 템플릿 상세 페이지에서
<ItemManagementTab scope={CONFIG_SCOPE.TEMPLATE} targetId={templateid} targetName={detail.displayName || detail.name} />
<TriggerManagementTab scope={CONFIG_SCOPE.TEMPLATE} targetId={templateid} targetName={...} targetTech={detail.name} />
```

- 탭 내부 변경은 국소적: `params[QueryParamKeys.SCOPE]` 등 4줄의 URL 읽기 → props 소비로 교체.
  목록 필터(keyword/status/severity/offset/limit)는 **계속 URL** — 상세 페이지가 독립 라우트라 충돌 없음.
- `ItemFormDrawer`는 이미 완전 prop 구동(`scopeType/scopeId/scopeLabel/hostInterfaces`) — **무변경**.
  TriggerFormDrawer도 동일 구조 — **무변경**.
- URL 쿼리 키 `SCOPE/TARGET_ID/TARGET_NAME/TARGET_TECH` 소비처 소멸 → enum 항목은 redirect 매핑(§7)에서 1회 읽으므로 존치.
- props 방식의 이점: 리마운트 시 재해석 불필요, 대상명이 항상 컨테이너 상세 데이터에서 나와 **합성 옵션/URL 위조 케이스 소멸**.

### ScopeTargetSelector — **제거 확정**

스코프 토글 + 검색형 대상 select의 역할을 "목록에서 컨테이너를 골라 드릴다운 진입"이 완전 대체한다.
같이 제거: `useZabbixConfigScope.ts`(소비처 소멸), `CONFIG_QUERY_KEY.HOST_SCOPE/TEMPLATE_SCOPE`,
`CONFIG_SCOPE_SEARCH_LIMIT`. B안의 "선택 호스트 인터페이스를 검색 결과에서 해석해 올리는" 우회
(ConfigurationManagementPage의 `selectedHostInterfaces` state + 콜백)도 함께 소멸 — 상세 페이지가
호스트 상세 데이터의 `interfaces`를 직접 내려주므로 **딥링크/새로고침에서도 인터페이스 select가 항상
데이터를 확보**한다(B안의 "검색 결과 밖이면 undefined 폴백" 약점 해소).

`CONFIG_SCOPE` 상수 자체는 **보존** — 엔티티 탭·폼 드로어의 host/template 분기 축으로 계속 쓰인다(이제 prop 값).

---

## 3) 호스트 관리 개편

### 3-1. 목록 레벨 — `/zabbix-management/host-management?tab=host|group`

- **HostManagementPage activeKey 로컬 useState → URL `?tab=` 전환** (⚠️ 현행 리마운트 취약점 해소).
  `QueryParamKeys.TAB`, 기본값 `host`. 탭 전환 시 리셋: `keyword/offset/status/groupids/deviceType`
  (UserManagementPage 패턴). 상수 `HOST_MGMT_TABS = { HOST: "host", GROUP: "group" }` — routes.ts에 정의.
- **HostGroupTab은 목록 레벨 탭으로 유지** (`?tab=group`). 그룹은 엔티티 서브탭을 갖지 않으므로 드릴다운 없음.
- **HostTab 드릴다운 진입점**: `col_name`의 호스트명을 클릭 가능하게(Text→Link 또는 onClick navigate) →
  `/zabbix-management/host-management/{hostid}` 이동. 기존 수정/삭제/상태토글/일괄분류 액션은 **그대로 유지**
  (회귀 최소화 — 목록 액션 축소 여부는 열린 결정 §E).

### 3-2. 상세 레벨 — `/zabbix-management/host-management/:hostid?tab=info|item|trigger|discovery`

신규 `HostDetailPage.tsx` (host-management 폴더):
- `useParams()`로 hostid, 호스트 상세 조회(§3-3) → 브레드크럼 치환 + 서브탭 4개 렌더.
- Tabs(activeKey=`?tab=`, 기본 `info`, `destroyInactiveTabPane`), 서브탭 전환 리셋은 §6.
- 서브탭 구성:

| 탭 | 값 | 내용 |
|---|---|---|
| 정보/인터페이스 | `info` | 신규 `HostInfoTab.tsx` — 읽기전용 Descriptions(표시명/기술명/그룹/분류/태그/템플릿/프록시·모니터링/상태/agent 가용성) + **인터페이스 표**(type/main/ip·dns:port/available — HostTab의 `formatInterface`·`getAgentTag` 헬퍼 재사용) + 액션: [수정]→**기존 HostFormDrawer 재사용**(태그 round-trip 로직 보존 — 재구현 금지), [삭제]→**HostDeleteModal 재사용**(성공 시 목록으로 navigate), 상태 Switch(useUpdateHostStatus 재사용) |
| 아이템 | `item` | ItemManagementTab (props: scope=host, targetId, targetName, hostInterfaces) — 상속 읽기전용·status 토글 허용 규칙 그대로 |
| 트리거 | `trigger` | TriggerManagementTab (props: scope=host, targetId, targetName, targetTech=host.host) |
| 디스커버리 | `discovery` | DiscoveryPlaceholderTab 재사용 |

- '정보/인터페이스' 탭은 **폼 재구현이 아니라 조회 뷰 + 기존 드로어 호출**이다. HostFormDrawer는 `host?: TManagedHost`
  prop을 받으므로 상세 데이터를 그대로 전달.

### 3-3. 호스트 상세 데이터 소스 — **유일한 BE 변경 후보 (권고: 신설)**

**현행 BE에 호스트 단건 조회 EP가 없다** (`host-manage.api.ts` 실측: `GET /hosts/manage` 목록,
PUT/PATCH/DELETE `/{hostid}`만 존재. 목록 필터는 keyword/groupids/status — hostid 필터 불가).
딥링크/새로고침으로 상세에 직접 진입하면 hostid만으로 데이터를 확보해야 한다.

- **권고: `GET /hosts/manage/{hostid}` 신설** (be-engineer 작업 1건). 응답 = 기존 `ManagedHostDto` 단건 재사용
  (신규 DTO 불필요), 가드/권한은 기존 manage EP와 동일. FE는 `HostManageService.getHostDetail(hostid)` +
  `useHostDetail` 훅(`HOST_MANAGE_QUERY_KEY.DETAIL` 키 신설) + `TResponse` 언랩(기존 unwrapEnvelope 경로).
  404/삭제된 hostid → 에러 안내 + 목록 링크.
- 대안(FE-only): 목록 EP를 큰 limit으로 불러 클라이언트에서 hostid를 find — 호스트 수 증가 시 파탄,
  keyword로는 hostid 검색 불가. **기각 권고**(열린 결정 §A에 대안으로만 기재).
- 이 EP가 확정되면 계약 문서 갱신 필요: `contract_host-registration.md`에 §(신규) 추가 → be-engineer 산출.

---

## 4) 템플릿 관리 독립 메뉴

### 4-1. 목록 레벨 — `/zabbix-management/template-management?tab=template|template-group` (신설)

신규 `TemplateManagementPage.tsx` (item-template-management 폴더에 생성 — 폴더 이동 최소화 원칙, §5):
- Tabs 2개: `TemplateList`(기존 재사용) / `TemplateGroupList`(기존 재사용). 기본 `template`.
  상수 `TEMPLATE_MGMT_TABS = { TEMPLATE: "template", TEMPLATE_GROUP: "template-group" }` — **구 CONFIG_TABS 값 보존**
  → 구 딥링크의 tab 값이 redirect(§7)에서 무손실 매핑된다.
- 탭 전환 리셋: `keyword/offset/groupids/templateDetailId/groupId`(그룹 상세 드로어 키).
- `TemplateGroupDetailDrawer`(그룹 상세)는 드로어 유지 — 그룹은 엔티티 서브탭이 없다.

### 4-2. 상세 레벨 — `/zabbix-management/template-management/:templateid?tab=info|item|trigger|discovery`

신규 `TemplateDetailPage.tsx`:
- 데이터: **기존 `GET /zabbix-manage/templates/{templateid}`(useTemplateDetail) 재사용 — BE 변경 없음.**
- 서브탭: [정보 `info` | 아이템 `item` | 트리거 `trigger` | 디스커버리 `discovery`] — 호스트 상세와 완전 대칭.
- **TemplateDetailDrawer → 상세 페이지로 승격(권고)**: 드로어의 콘텐츠를 분해 이관 —
  - 메타(Descriptions)+수정(TemplateFormDrawer 호출)+삭제(TemplateDeleteModal, 성공 시 목록 navigate)+
    **호스트 연결(link)/해제(unlink) 섹션** → 신규 `TemplateInfoTab.tsx`로 이동.
  - "포함 아이템 개수 + 아이템 탭에서 관리→"(jumpToItemTab) → **삭제**: 아이템 서브탭이 같은 페이지에 있으므로
    단순 탭 전환(`?tab=item`)으로 대체. 읽기전용 미리보기 목록도 불필요(서브탭이 풀 CRUD 제공).
  - 승격 후 `TemplateDetailDrawer.tsx` 삭제, `templateDetailId` 쿼리 키 소비처 제거(redirect 매핑에서만 읽음).
  - TemplateList의 "관리" 버튼·아이템 개수 클릭 → 상세 페이지 navigate로 교체(드로어 open 대신).
  - 근거: 호스트/템플릿 대칭이 A안의 골자 — 한쪽만 드로어면 IA가 다시 비대칭이 된다. 드로어 유지안은 열린 결정 §C.

---

## 5) B안 산출물 처리 (파일 단위)

### 삭제
| 파일/심볼 | 사유 |
|---|---|
| `configuration/ConfigurationManagementPage.tsx` | 후계 = HostDetailPage/TemplateDetailPage + 목록 페이지 2개 |
| `configuration/ScopeTargetSelector.tsx` | 컨테이너 선택(드릴다운 진입)이 대체 — §2 |
| `hooks/useZabbixConfigScope.ts` | 소비처(ScopeTargetSelector) 소멸 |
| `constants/queryKey.ts`의 `CONFIG_QUERY_KEY` | 위 훅 전용 키 |
| `constants/zabbix-config.ts`의 `CONFIG_SCOPE_SEARCH_LIMIT` | 위 훅 전용 상수 |
| `constants/routes.ts`의 `CONFIG_ENTITY_TABS` | "스코프 행 노출 탭 집합" 개념 소멸 |
| `item-template-management/TemplateDetailDrawer.tsx` | §4-2 승격(권고 채택 시). `jumpToItemTab`·드로어 어댑트 로직 폐기 |
| `__tests__/ConfigurationManagementPage.test.tsx`, `ScopeTargetSelector.test.tsx` | 대상 소멸 → 신규 페이지 테스트로 대체(§8) |
| SideNav/MobileSideNav의 "구성 관리" 메뉴 항목 | "템플릿 관리" 항목으로 교체 |

### 재활용(이동/수정)
| 파일 | 처리 |
|---|---|
| `configuration/DiscoveryPlaceholderTab.tsx` | **보존** — 두 상세 페이지가 공유. 폴더에 홀로 남으므로 `zabbix-management/` 공용 위치로 이동(예: `zabbix-management/DiscoveryPlaceholderTab.tsx`) 후 configuration 폴더 삭제 |
| `item-template-management/ItemManagementTab.tsx` | URL scope/target 읽기 4줄 → props(§2). Empty 안내("대상을 선택하세요")는 상세 페이지에선 targetId가 항상 있으므로 방어 코드로 강등. 나머지(상속 규칙·목록·CRUD) 무변경 |
| `trigger-management/TriggerManagementTab.tsx` | 동일 — URL 읽기 → props. 나머지 무변경 |
| `item-template-management/ItemFormDrawer.tsx` | **무변경** (scopeType/인터페이스 select/상속 규칙 이미 prop 구동) |
| `trigger-management/TriggerFormDrawer.tsx`, `TriggerDeleteModal.tsx`, `ItemDeleteModal.tsx` | 무변경 |
| `constants/zabbix-config.ts`의 `CONFIG_SCOPE`/`TConfigScope` | 보존 — prop 타입 축(§2) |
| `constants/routes.ts`의 `CONFIG_TABS` | **재편**: `HOST_MGMT_TABS`/`TEMPLATE_MGMT_TABS`/`CONTAINER_DETAIL_TABS`(§6)로 분해. 구 값(item/trigger/discovery/template/template-group)은 redirect 매핑 함수가 참조하므로 값 자체는 보존 |
| `routes/routes.tsx`의 configuration 라우트 + redirect 2개 | §7 — configuration 라우트는 element를 redirect로 교체, 구 redirect 2개는 새 매핑으로 재조준 |
| i18n `config_management.*` | `title`(메뉴) 삭제, `tab_trigger/tab_discovery/discovery_placeholder`는 상세 페이지 서브탭 라벨로 재사용(키 유지). `select_*_placeholder` 2키 삭제 |

### 무관(보존)
`item-template-management/`의 TemplateList/TemplateGroupList/TemplateFormDrawer/TemplateGroupFormModal/
TemplateGroupDetailDrawer/TemplateDeleteModal/TemplateGroupDeleteModal/KeyCatalogModal — 전부 그대로
(TemplateList의 상세 진입 방식만 §4-2대로 navigate로 교체).

---

## 6) URL 상태 모델

### 파라미터 총람

| 레벨 | 경로 | 쿼리 |
|---|---|---|
| 호스트 목록 | `/zabbix-management/host-management` | `tab=host\|group`(기본 host), host탭: `keyword/groupids/status/deviceType/offset/limit`, group탭: 기존 그룹 목록 파라미터 |
| 호스트 상세 | `/zabbix-management/host-management/:hostid` | `tab=info\|item\|trigger\|discovery`(기본 info), item탭: `keyword/status/offset/limit`, trigger탭: `keyword/status/severity/offset/limit` |
| 템플릿 목록 | `/zabbix-management/template-management` | `tab=template\|template-group`(기본 template), `keyword/groupids/offset/limit`(+그룹탭 `groupId` 드로어 키) |
| 템플릿 상세 | `/zabbix-management/template-management/:templateid` | 호스트 상세와 동일 서브탭 4값 |

- 컨테이너 식별자는 **경로 세그먼트**(`:hostid`/`:templateid`), 서브탭·목록 필터는 **쿼리**. `scope/targetId/targetName/targetTech` 쿼리 키는 신규 URL에서 미사용(redirect 입력으로만 존재).
- 상수(routes.ts, 중립 모듈):
  ```ts
  HOST_MGMT_TABS       = { HOST: "host", GROUP: "group" }
  TEMPLATE_MGMT_TABS   = { TEMPLATE: "template", TEMPLATE_GROUP: "template-group" }
  CONTAINER_DETAIL_TABS = { INFO: "info", ITEM: "item", TRIGGER: "trigger", DISCOVERY: "discovery" }
  ```

### 전환 리셋 매트릭스

| 전이 | 리셋 | 유지 |
|---|---|---|
| 목록 레벨 탭 전환(host↔group, template↔template-group) | `keyword/offset/status/groupids/deviceType/templateDetailId/groupId` | `tab`만 갱신 |
| 목록 → 상세 진입(navigate) | 새 경로이므로 쿼리 없음(기본 `tab=info`) — 목록 쿼리는 히스토리에 보존(back으로 복원) | — |
| 상세 서브탭 전환(info↔item↔trigger↔discovery) | `keyword/offset/status/severity` | `tab` 외 경로(=컨테이너) — **컨테이너 유지가 드릴다운의 본질** |
| 상세 → 목록(브레드크럼/삭제 후) | 목록 기본 상태(필터 없는 URL). 브라우저 back이면 필터 복원 | — |

- 전이 UI 상태(드로어 열림/편집 대상/삭제 대상/pendingStatusId)는 로컬 useState 유지 — 기존 규칙 그대로.
- ⚠️ 리마운트 규칙(memory: fe-page-remount-on-navigate): 서브탭 전환도 쿼리 navigate → 페이지 통째 리마운트.
  상세 페이지의 컨테이너 식별은 경로에 있으므로 안전. 호스트 상세 조회는 react-query 캐시로 재요청 흡수.

---

## 7) 라우트/redirect/i18n 마이그레이션

### 7-1. routes.ts

```ts
PATH_ZABBIX_MANAGEMENT = {
  ...,
  hostManagement:        ".../host-management",            // 유지
  hostManagementDetail:  ".../host-management/:hostid",     // 신설
  templateManagement:    ".../template-management",         // 신설
  templateManagementDetail: ".../template-management/:templateid", // 신설
  configuration:         ".../configuration",               // redirect 매칭용 강등(주석 갱신)
  itemTemplateManagement / triggerManagement                // redirect 매칭용 존치(기존)
}
```

### 7-2. routes.tsx — redirect 3계보 (공용 매핑 함수 1개로 통합)

B안 redirect 2개(ItemTemplateManagementRedirect/TriggerManagementRedirect)는 configuration으로 보내고
있으므로, **configuration 쿼리 → 신 URL 매핑 함수를 하나 만들고 3개 redirect가 모두 이를 통과**하게 한다
(구 키 매핑 → configuration 형식 정규화 → 신 URL 산출의 2단 합성):

| 입력 (구 URL) | 출력 (신 URL) |
|---|---|
| `/configuration?tab=item\|trigger\|discovery&scope=host&targetId=X` | `/host-management/X?tab=<동일값>` + `keyword/status/severity/offset` 보존 |
| `/configuration?tab=item\|trigger\|discovery&scope=template&targetId=X` | `/template-management/X?tab=<동일값>` + 동상 |
| `/configuration?tab=entity&targetId 없음` | scope=host(기본)→`/host-management?tab=host`, scope=template→`/template-management?tab=template` |
| `/configuration?tab=template\|template-group` | `/template-management?tab=<동일값>` + `keyword/groupids/offset` 보존. `templateDetailId=X` 있으면 `/template-management/X?tab=info`로 승격 매핑 |
| `/item-template-management?...` | 기존 매핑(templateId→scope=template&targetId, tab 기본 item) 적용 후 위 표 통과 |
| `/trigger-management?...` | 쿼리 그대로 tab=trigger로 위 표 통과 |

- `targetName/targetTech`는 신 URL에서 불필요(상세 페이지가 자체 조회) → 매핑 시 폐기.
- B안이 미커밋(외부 북마크 없음)이라 `/configuration` redirect는 이론상 생략 가능하나, 매핑 함수가 공용이라
  한 줄 라우트 추가 비용뿐 — **유지 권고**(로컬 세션 딥링크·문서 링크 보호).

### 7-3. 신규 라우트 4개 (전부 `PageWrapper adminOnly`)

hostManagement(기존 element 유지) / hostManagementDetail→HostDetailPage /
templateManagement→TemplateManagementPage / templateManagementDetail→TemplateDetailPage.

### 7-4. i18n (kr/en 동시, 루트 키 중복 금지 교훈 주의)

- 신규 루트 `template_management`: `title`(메뉴/브레드크럼 — translateSegment가 `.title` leaf 자동 인식),
  `tab_template`/`tab_template_group`은 기존 `item_template_management.tab_*` 재사용으로 갈음 가능.
- 신규(호스트 상세): `host_management.tab_info`("정보/인터페이스"), `detail_not_found`(404 안내),
  인터페이스 표 컬럼 키 몇 개(`col_if_type/col_if_address/col_if_main` 등).
- 신규(템플릿 상세): `item_template_management.tab_info`("정보") — 기존 드로어 키
  (`member_*`, `link_*` 등)는 TemplateInfoTab이 그대로 재사용.
- 삭제: `config_management.title`, `select_host_placeholder`, `select_template_placeholder`.
  유지·재사용: `config_management.tab_trigger/tab_discovery/discovery_placeholder`(서브탭 라벨) —
  네임스페이스 잔존이 어색하면 `zbx_detail.*`로 이사(선택 사항, 필수 아님).
- 기존 `item_template_management.select_host_hint/select_template_hint`(Empty 안내)는 방어 경로로 존치.

---

## 8) 작업 분해 (체크리스트 + 난이도) · 리스크

### BE (1건, 조건부 — 열린 결정 §A)
- [ ] `GET /hosts/manage/{hostid}` 단건 조회 EP + 계약 문서 갱신 — **하** (ManagedHostDto 재사용)

### FE (난이도: 중 — 신규 페이지 3개 + 재배선)
- [ ] 1. 상수/라우트: PATH 4개, HOST_MGMT_TABS/TEMPLATE_MGMT_TABS/CONTAINER_DETAIL_TABS, CONFIG_TABS·CONFIG_ENTITY_TABS 정리 — 하
- [ ] 2. redirect 공용 매핑 함수 + 3계보 재조준(§7-2) — 중 (매핑 표 케이스 누락 주의)
- [ ] 3. HostManagementPage `?tab=` URL화 + HostTab 이름 클릭 드릴다운 진입 — 하
- [ ] 4. `useHostDetail` 훅 + `HOST_MANAGE_QUERY_KEY.DETAIL` + `getHostDetail` 서비스 — 하 (BE §A 선행)
- [ ] 5. `HostDetailPage.tsx` + `HostInfoTab.tsx` (드로어/모달 재사용, 브레드크럼 치환, 404 처리, 삭제 후 목록 navigate) — **중상** (신규 화면)
- [ ] 6. ItemManagementTab/TriggerManagementTab URL→props 전환 — 하 (국소 4줄 + prop 타입)
- [ ] 7. `TemplateManagementPage.tsx` (목록 탭 2개 + 리셋) — 하
- [ ] 8. `TemplateDetailPage.tsx` + `TemplateInfoTab.tsx` (드로어 콘텐츠 이관: 메타/수정/삭제/link·unlink) + TemplateDetailDrawer 삭제 + TemplateList 진입 교체 — **중상**
- [ ] 9. ConfigurationManagementPage/ScopeTargetSelector/useZabbixConfigScope/CONFIG_QUERY_KEY 삭제 + DiscoveryPlaceholderTab 이동 — 하
- [ ] 10. SideNav/MobileSideNav 메뉴 교체(구성 관리→템플릿 관리) — 하
- [ ] 11. i18n(kr/en) §7-4 — 하
- [ ] 12. 테스트: 삭제 2건 대체(신규 `HostDetailPage`/`TemplateManagementPage`/`TemplateDetailPage` 테스트),
      `ItemManagementTab.test`(props 방식 개정), `HostTab.test`(드릴다운 진입 추가), `TemplateList.test`(navigate 교체 반영),
      redirect 매핑 단위 테스트. 실행 `npx jest`, 검증 `yarn build`+lint — **중**

### QA
- [ ] integration-qa: 신설 EP 계약 대조(§3-3), 엔티티 탭 요청 파라미터(hostid/templateid) 불변 확인, redirect 매핑 표 검증
- [ ] functional-qa: ① 호스트 목록→상세 4서브탭 왕복(필터 리셋·컨테이너 유지) ② 딥링크/새로고침(상세 직접 진입, 인터페이스 select 데이터 확보) ③ 템플릿 상세 승격 흐름(link/unlink·수정·삭제→목록) ④ 구 딥링크 3계보 redirect ⑤ 호스트 목록 기존 기능 무회귀(일괄분류·상태토글·등록) ⑥ 브레드크럼 치환·SideNav 하이라이트 ⑦ 브라우저 back(상세→목록 필터 복원)

### 리스크
1. **호스트 관리 회귀**: HostManagementPage 탭 URL화 + HostTab 진입점 추가가 기존 목록 기능(일괄 분류
   지정 — 2026-07-21 미커밋 최신작)과 겹친다. 목록 액션은 손대지 않는 것이 방어선(§3-1).
2. **미커밋 선행작업 4건 위의 증분**: B안 구현·호스트 분류 태그·아이템/템플릿·트리거 전부 미커밋 —
   파일 삭제(드로어·configuration 폴더)가 이 이력 위에서 일어남. 커밋 단위 분리 권고(선행분 커밋 후 A안 착수).
3. **TemplateDetailDrawer 승격 누락 위험**: 드로어의 link/unlink·clear 옵션·부분실패 처리 등 세부 동작이
   많다 — 이관 시 기능 목록 대조 필수(§4-2 항목별).
4. **redirect 매핑 조합 폭발**: 3계보×스코프×tab — §7-2 표를 단위 테스트로 고정.
5. **쿼리키 공유 논점**: useItemList/useTriggerList가 이제 호스트 상세·템플릿 상세 **두 페이지**에서 쓰인다.
   쿼리키 배열에 `scope:targetId` 솔트가 이미 포함되어 실충돌은 없으나, "페이지 간 키 공유 금지" 규칙의
   자구와 어긋남 — 키에 컨테이너 축이 포함되므로 허용으로 정리(불안하면 CONTAINER별 키 상수 분리는 기계적 후속).
6. **BE EP 선행 의존**: §A 미결이면 FE 5번 작업이 막힌다 — 착수 전 확정 필요.

---

## 열린 결정 (사용자 리뷰 요청)

- **§A. 호스트 단건 조회 BE EP 신설 여부** — 권고: `GET /hosts/manage/{hostid}` 신설(소형, ManagedHostDto 재사용).
  대안(FE가 목록 전체 로드 후 find)은 규모 취약으로 기각 권고. **A안에서 유일한 BE 변경.**
- **§B. 호스트 상세 '정보/인터페이스' 탭 범위** — 권고: 읽기전용 조회 뷰 + 기존 HostFormDrawer/HostDeleteModal
  재사용(§3-2). 대안: 인라인 편집 폼으로 재구성(비용 큼, 태그 round-trip 재구현 위험).
- **§C. TemplateDetailDrawer 승격 여부** — 권고: 상세 페이지 '정보' 탭으로 승격 + 드로어 삭제(호스트/템플릿
  대칭 완성). 대안: 드로어 유지 + 아이템/트리거만 서브탭(비대칭 잔존, 작업량은 감소).
- **§D. 호스트 관리 메뉴명** — 현행 "호스트 및 그룹 관리" 유지 vs "호스트 관리"로 단순화(그룹은 내부 탭이므로
  후자 권고 — 템플릿 관리도 그룹을 내부 탭으로 품는 것과 결 맞춤).
- **§E. 호스트 목록의 수정/삭제 액션 존치 여부** — 권고: 1차는 존치(회귀 최소). 대안: 상세로 일원화하고 목록은
  드릴다운+상태토글만(목록 슬림화 — 후속 정리로 미뤄도 무방).
- **§F. `/configuration` redirect 존치 여부** — 권고: 존치(매핑 함수 공용이라 비용 미미). 대안: B안이 미커밋이므로
  라우트째 삭제(외부 북마크 없음 전제).
