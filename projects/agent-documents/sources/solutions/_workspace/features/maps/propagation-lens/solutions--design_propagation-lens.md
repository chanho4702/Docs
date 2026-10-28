# 설계 — 전파(propagation) 가시성 + 엔티티 렌즈 (드릴다운 A안 위 증분)

## ✅ 확정 결정 (2026-07-21, 오케스트레이터 판단 — "네가 판단해서 한 번에")
- **D1 렌즈 기본 뷰 = 정의(definition)**: 템플릿 정의 + 호스트 다이렉트 원본. discovered·상속 사본은 기본 숨김, 토글로 표시.
- **D2 CAP = 1,000**(설정화 `app.lens.cap`), countOutput로 전체 total 병기, 초과 시 필터 유도 배너.
- **D3 렌즈 '생성' 버튼 미제공**: 렌즈=조회+수정/삭제/상태토글+전파. 생성은 드릴다운(대상 필수)으로 유도.
- **D4 전파/이름 맵 = 요청당 구축**(TTL 캐시 금지 — link/unlink 직후 지연 노출 방지).
- **D5 단계**: 사용자에겐 "한 번에". 내부적으로 be가 1)호스트 테이블 강화 2)템플릿 전파 노출 3)렌즈 EP 순차 산출, fe가 이어받음.
- **D6 중첩 템플릿**: 알고리즘만 방어 구현, 전용 UI 생략(실환경 0건).
- 렌즈는 **신규 읽기 EP**(`/zabbix-manage/items/lens`, `/triggers/lens`)로 분리, 쓰기는 기존 EP·FormDrawer 재사용 → 드릴다운 계약 무변경.
- ⚠️ 무거운 필드 2차 보강(보이는 페이지 N건만), 무필터 첫 페이지 3~5초 → FE 로딩 UX 필수.
- ⚠️ 실측 스크립트(자격증명 하드코딩)는 보안상 삭제됨 — 재실측 시 자격증명 하드코딩·파일 기록 금지(env/Vault만).

---

- **작성**: be-engineer, 2026-07-21. 설계 전용(코드 변경 없음). 선행: `design_drilldown-restructure.md`(A안, 구현 완료·미커밋).
- **최우선 가치**: BE 실현성 — §2(무스코프 전건), §3(전파 집계 비용)은 **실 Zabbix(dmove.co.kr) 실측** 기반.
- **실측 스크립트**: 스크래치패드 `zbx_measure{1,2,3}.ps1` (읽기 전용 호출만, super admin 계정).

---

## 0. 실측 결과 요약 (2026-07-21, 실 Zabbix)

### 규모
| 축 | 건수 | 비고 |
|---|---|---|
| 호스트 | **76** | |
| 템플릿 | **347** (호스트 연결된 것 39개) | 최다 연결: Linux Monitoring for Insung Azit(32호스트) |
| 아이템 | **20,440** | 템플릿 소속 7,862 + 호스트 소속 12,578 |
| └ 호스트 소속 내역 | 상속 사본 2,785 / LLD discovered 9,765 / 로컬 ~28 | discovered가 절반 — 렌즈 노이즈 주의 |
| 트리거 | **6,940** | 호스트 3,949 / 템플릿 2,991 |
| **중첩 템플릿 링크** | **0건** | template.get selectTemplates/selectParentTemplates 전 347건 빈 배열 — 이 환경엔 템플릿→템플릿 중첩이 없다 |

### 성능 (핵심 판정 근거)
| 호출 | 시간 | 크기 |
|---|---|---|
| item.get **무필터 전건**(현 list 파라미터: 전체 output+selectHosts) | **36.6s** | 8.7MB |
| item.get 무필터, selectHosts 제거 | 34.6s | 7.5MB |
| item.get 무필터, **lastvalue/lastclock까지 제거** | **20.7s** | 6.5MB |
| item.get search=cpu 무스코프(1,699건) | 2.3~7.7s | 0.6MB |
| item.get hostids=전 호스트 76(12,578건) | 27.6s | 5.4MB |
| item.get templateids=전 템플릿 347(7,862건) | 19.1s | 3.4MB |
| item.get **limit=200**(무필터, selectHosts 포함/제외) | **2.1s / 0.5s** | 72KB |
| trigger.get 무필터 전건(expandExpression) | **16.9s** | 3.6MB |
| trigger.get 무필터(expand 없음) / limit=200(expand 포함) | 5.6s / **1.8s** | 1.8MB / - |
| **countOutput**(어떤 필터든) | **0.1~0.17s** | - |
| item.get itemids=20건 lastvalue만(페이지 보강) | 0.1~1.8s | - |
| template.get 전 347 + hosts/items/triggers **count** | **0.36s** | 46KB |
| template.get 전 347 **전파 맵**(selectHosts ids+양방향 템플릿 링크) | **0.17s** | 26KB |
| template.get 10건 selectHosts=count(배치 보강) | 0.10s | - |
| host.get 76건 현 파라미터 / **+ item·trigger·discovery count** | 2.3s → **0.35s(추가비용 없음)** | +3.6KB |
| host.get **templateids 필터** | 동작 확인(10001→9건, 0.28s) | - |
| item.get **hostids 다건 / groupids** 필터 | 동작 확인(0.1s) | - |

### 도출 판정 (한 줄)
1. **기존 패턴(전건 fetch → 메모리 skip/limit)의 무스코프 재사용 = 불가.** selectHosts·lastvalue를 다 빼도 20초. 원인은 행 수 자체(2만 행 직렬화·전송).
2. **Zabbix API에는 offset이 없다** → 서버측 진짜 페이징 불가. **유일한 현실 해법 = `limit=CAP` 상한 + countOutput 별도 total + truncated 경고** (limit=200 실측 0.5~2.1s).
3. 전파 집계(템플릿→호스트)는 **싸다**: 전 템플릿 전파 맵 1콜 0.17s/26KB, 개수는 select "count"로 사실상 0원.
4. 호스트 테이블 강화(아이템/트리거/디스커버리 수 + templateids 필터)는 **추가 비용 없음** — 즉시 가능.

---

## 1. 목표 IA + 화면 책임 + 역할 분담

```
Zabbix 관리
├ 호스트 관리    : 드릴다운(A안 유지) + [강화] 테이블에 적용 템플릿 이름·아이템/트리거/디스커버리 수 + 상단 템플릿 필터
├ 템플릿 관리    : 드릴다운(A안 유지) + [강화] '전파 대상' 가시화(연결 호스트 수는 목록에 이미 있음 → 상세 정보탭에 목록 명시)
├ 아이템 관리 ★  : 엔티티 렌즈 — 전 호스트/템플릿 가로지르는 목록 + 필터 + 정의처→전파 컬럼 + CRUD
├ 트리거 관리 ★  : 엔티티 렌즈 — 동일
└ 디스커버리 관리 : placeholder (이번 범위 아님)
```

### 드릴다운 vs 렌즈 — 역할 분담 원칙
| | 드릴다운(호스트/템플릿 상세 서브탭) | 엔티티 렌즈(아이템/트리거 관리) |
|---|---|---|
| 질문 | "이 컨테이너 안에 뭐가 있나" | "이 아이템/트리거가 **어디에** 있고 **어디로** 퍼지나" |
| 스코프 | 항상 단일 컨테이너(경로가 스코프) | 무스코프 기본 + 다축 필터(그룹/호스트들/템플릿들/유형/상태/검색) |
| 데이터 EP | 기존 `/zabbix-manage/items·triggers` (hostid/templateid 스코프) — **무변경** | **신규 렌즈 EP** (§2-C) — 기존 EP 계약 비오염 |
| CRUD | 전체 CRUD(현행 유지) | 수정/상태토글/삭제 = 렌즈에서 직접(행에 컨테이너가 명시되므로 기존 FormDrawer 재사용 가능). **생성 = 열린 결정 D3** |
| 폼 | ItemFormDrawer/TriggerFormDrawer(완전 prop 구동: scopeType/scopeId/scopeLabel) | **동일 컴포넌트 재사용** — 행의 컨테이너(hostid가 호스트인지 템플릿인지)에서 scopeType/scopeId 도출해 주입. 폼 중복 구현 금지 |
| 상속 규칙 | 상속 행 읽기전용(+status 토글) — 현행 | 동일 규칙 그대로(inherited 판정 로직 공유) |

중복 CRUD의 일관성은 "폼·모달 컴포넌트 단일 소스 + BE EP 단일 소스(쓰기는 기존 items/triggers EP 그대로 사용)"로 보장한다. **렌즈가 신설하는 것은 읽기 EP뿐, 쓰기 EP는 기존 것을 그대로 호출**한다.

---

## 2. BE 변경 목록 (EP별 실현성 판정)

### A. 호스트 테이블 강화 — 판정: **가능(저비용·저위험)**
`GET /hosts/manage` (기존 EP, additive 변경만):
- `HostManageService.list`/`fetchRawOne`의 host.get 파라미터에 `selectItems:"count"`, `selectTriggers:"count"`, `selectDiscoveries:"count"` 추가. **실측: 추가 비용 없음(0.35s), +3.6KB.**
- `ManagedHostDto`에 필드 추가(additive — 기존 FE 비파괴):
  - `itemCount: Integer`, `triggerCount: Integer`, `discoveryCount: Integer` (count 문자열 → int 변환은 템플릿 관리의 `countOf` 헬퍼 패턴 재사용)
- `ManagedHostListReqDto`에 `templateids: List<String>` 필터 추가 → host.get `templateids` 전달. **실측 동작 확인.** (groupids와 동일한 복수 파라미터 관례)
- 적용 템플릿 이름은 `templates`(TemplateRefDto[])로 **이미 내려간다** — BE 무변경, FE 컬럼만.
- 단건 `GET /hosts/manage/{hostid}`(A안 신설)도 동일 select 추가로 일관 유지.

### B. 템플릿 관리 '전파 대상' — 판정: **사실상 구현 완료(소폭 보강만)**
- 목록 `ManagedTemplateDto`: `hostCount` **이미 존재**(selectHosts:"count"). 무변경.
- 상세 `ManagedTemplateDetailDto`: `linkedHosts`(hostid+name 전체 목록) **이미 존재**. FE가 정보탭에 "전파 대상 N 호스트" 섹션으로 노출하면 끝.
- (선택) 목록 DTO에 `triggerCount` 추가 — selectTriggers:"count" 실측 0.36s에 포함됨, additive. 렌즈 진입 링크("이 템플릿의 트리거 N개")용.
- 중첩 템플릿 경유 전파: **이 환경 중첩 0건**(실측) → 상세에 "중첩 포함" 표기는 생략 가능. 전파 맵 알고리즘(§3)은 방어적으로 중첩을 처리하되 UI 노출은 하지 않음 권고(열린 결정 D6).

### C. 엔티티 렌즈 목록 — 판정: **조건부 가능 (CAP 전략 필수, 무제한 전건은 불가)**

신규 EP 2개 (기존 목록 EP와 분리 — 드릴다운 계약 비오염):

#### C-1. `GET /zabbix-manage/items/lens`
`/{itemid}` 경로와 literal 우선 매칭이라 충돌 없음(`/items/keys` 선례). 권한 `AdminAccessChecker.requireAdmin`(관례 유지).

요청 `ItemLensReqDto`:
| 파라미터 | 타입 | 설명 |
|---|---|---|
| `groupids` | string[] | 호스트그룹 필터(item.get groupids — 실측 동작) |
| `hostids` | string[] | 호스트 다건(실측 동작) |
| `templateids` | string[] | 템플릿 다건 |
| `search` | string | name+key_ OR 부분검색(기존 관례) |
| `type` / `status` | int | 유형/상태 |
| `origin` | string | `plain`(filter flags=0) / `discovered`(flags=4) / null=전체 |
| `view` | string | `definition`(inherited=false: 템플릿 원본+로컬만, 사본 제외) / `all`(기본값은 열린 결정 D1) |
| `limit`/`offset` | int | 기본 20, 1~200 / offset — **단, offset+limit ≤ CAP** |

서버 알고리즘(§3-1)·응답:
```jsonc
// data = LensPagedDto<LensItemDto>  (신규 DTO — 기존 PagedListDto 비변경)
{ "items": [...], "total": 20440,      // countOutput 기반 정확한 전체 건수
  "limit": 20, "offset": 0,
  "truncated": true, "cap": 1000 }     // total > cap이면 true: "상위 cap건만 탐색 가능, 필터를 좁혀라"
```

`LensItemDto` = ManagedItemDto 전 필드(계약 §1-1 표현 규칙 동일: 원시 문자열 보존) **+ 전파 필드**:
| 추가 필드 | 타입 | 설명 |
|---|---|---|
| `containerKind` | string | `"host"` \| `"template"` — hostid가 가리키는 컨테이너 종류 |
| `source` | object\|null | 정의처. `{ kind: "local"\|"template"\|"discovery", templateId?, templateName? }` — 상속 행이면 원본 템플릿 역추적(§3-2), flags=4면 discovery |
| `propagation` | object\|null | **템플릿 정의 행만**. `{ hostCount: n }` — 이 템플릿(중첩 포함) 연결 호스트 수. 호스트 행은 null |

전파 대상 호스트 **목록**(ids/names)은 행마다 내리지 않는다(행×호스트 폭발 방지) — FE가 필요 시 기존 `GET /zabbix-manage/templates/{id}` 상세(linkedHosts)를 팝오버에서 호출.

#### C-2. `GET /zabbix-manage/triggers/lens`
동일 구조. 요청 = C-1 − `origin` + `severity`(priority filter). 응답 `LensTriggerDto` = ManagedTriggerDto 전 필드 + `containerKind`/`source`/`propagation`. 페이지 20행의 `expression`은 **페이지 보강 단계에서 expandExpression으로 재조회**(§3-1 5단계) — 무필터 expand 전건 16.9s 회피(limit 내 expand는 1.8s).

#### 성능 판정 (실측 환산)
| 시나리오 | 예상 응답 시간 |
|---|---|
| 무필터 첫 페이지(CAP=1,000 fetch + count + 이름맵 + 페이지 보강 3콜) | **약 3~5s** — 관리자 화면 허용 범위지만 FE 로딩 UX 필수 |
| 검색/그룹/유형 필터 적용(결과 수백~2천) | 1~3s |
| 호스트/템플릿 다건 필터(결과 수백) | <1s |
| CAP 초과 구간(offset ≥ CAP) | **제공 불가** — `truncated`로 FE가 필터 유도. Zabbix offset 부재의 근본 제약 |

#### D. 신규 에러코드
없음(렌즈는 읽기 전용, 쓰기는 기존 EP·에러코드 그대로). `LENS_OFFSET_EXCEEDS_CAP`(400) 1건만 추가 권고(offset+limit > cap 요청 방어).

### E. 기존 EP 변경 없음 확인
`/zabbix-manage/items`·`/triggers`·`/templates` 목록/상세/쓰기 EP, `features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md`·`features/zabbix-config/trigger-mgmt/contract_trigger-mgmt.md` 계약 **무변경**. 변경은 A(additive DTO 필드+필터), B(선택 additive), C(신규 EP)뿐 → 드릴다운 회귀 리스크 최소화.

---

## 3. 전파 산출 알고리즘 (의사코드)

### 3-1. 렌즈 목록 파이프라인 (아이템 기준; 트리거 동형)
```
LENS_CAP = 1000 (상수, 열린 결정 D2)

list(query):
  token = superAdminToken
  zbxFilter = build(query)                       # groupids/hostids/templateids/search/filter{type,status,flags}/inherited

  # 1) 정확한 total — countOutput (실측 0.1s)
  total = item.get(countOutput, zbxFilter)

  # 2) CAP 상한 fetch — 무거운 필드 제외가 핵심
  rows = item.get(zbxFilter, output=ITEM_OUTPUT−{lastvalue,lastclock},   # lastvalue 제외: 36.6s→(전건 기준)20.7s, CAP 기준 ~0.5s
                  sortfield=name, limit=LENS_CAP)                        # selectHosts 미사용(이름은 4에서 맵 해석)
  truncated = total > rows.size

  # 3) 메모리 페이지 슬라이스 (offset+limit ≤ CAP 검증)
  page = rows.skip(offset).limit(limit)

  # 4) 이름/컨테이너 맵 (2콜, 실측 합 ~0.3s; 캐시 시 0원 — 열린 결정 D4)
  hostMap = host.get(output=[hostid,name])            # 76건
  tplMap  = template.get(output=[templateid,host,name])  # 347건
  containerKind(row) = tplMap.containsKey(row.hostid) ? "template" : "host"
  hostName(row) = (tplMap|hostMap)[row.hostid].name

  # 5) 페이지 보강 (행 20건 → 콜 3개, N+1 아님)
  a) lastvalue: item.get(itemids=pageIds, output=[itemid,lastvalue,lastclock])   # 실측 0.1~1.8s
     (트리거: trigger.get(triggerids=pageIds, expandExpression, selectHosts) — expand는 여기서만)
  b) source 역추적(§3-2): 상속 행들의 parent item 1콜(+중첩 시 반복, 이 환경 0회)
  c) propagation: 템플릿 정의 행들의 templateid 집합 → propagationMap(§3-3)에서 hostCount 조회
```

### 3-2. 상속 행의 정의처(source) 역추적
Zabbix에서 아이템/트리거의 `templateid` 필드는 **부모 엔티티의 id**(템플릿 id가 아님).
```
resolveSources(pageRows):
  pending = { row.templateid : row } for row where templateid != "0" and flags != "4"
  depth = 0
  while pending and depth < 5:                       # 방어 상한(중첩 대비, 실환경 1회로 종료)
    parents = item.get(itemids=pending.keys, output=[itemid,hostid,templateid])   # 1콜/깊이
    for p in parents:
      if p.templateid == "0": row.source = { kind:"template", templateId:p.hostid, templateName:tplMap[p.hostid] }
      else: pending2[p.templateid] = row             # 더 위 원본이 있음(중첩)
    pending = pending2; depth++
```
페이지 20행 기준 추가 1콜(중첩 없음) — 실측 등가 콜 0.1s급.

### 3-3. 템플릿 전파 맵 (template → 전파 대상 호스트 집합)
```
buildPropagationMap():                                # 1콜, 실측 0.17s / 26KB
  tpls = template.get(output=[templateid], selectHosts=[hostid], selectParentTemplates=[templateid])
  directHosts[t]  = t.hosts
  children[p]    += t  for p in t.parentTemplates     # 역방향 간선(부모→자식)
  propagatedHosts(t) = directHosts[t] ∪ (⋃ propagatedHosts(c) for c in BFS(children, t))
      # 의미: t가 부모(=t를 링크한 자식 템플릿)의 아이템은 자식을 링크한 호스트에도 상속
      # 실환경 중첩 0건 → BFS는 no-op, propagated == direct
  return { t → hostIds(set) }        # hostCount = size
캐시: 요청당 1회 구축(기본) — 렌즈 1요청에 1콜 0.17s는 수용 가능.
     (선택) Caffeine/Redis TTL 30~60s로 승격 — D4.
```

---

## 4. FE 화면 구성 개요 (계약 경계만 — 상세 FE 설계는 후속 fe-engineer)

1. **아이템 관리 / 트리거 관리 (신설 메뉴 2개, isSuperRole)** — 라우트 `/zabbix-management/item-lens`·`/trigger-lens`(명칭은 fe 재량, 구 `/item-template-management`·`/trigger-management`는 redirect 3계보에 이미 편입돼 있으므로 **재사용 금지**).
   - 상단 필터 바: 그룹(멀티) / 호스트(멀티) / 템플릿(멀티) / 유형 / 상태 / (트리거: 심각도) / (아이템: origin·view) / 검색. 필터 상태는 **URL query**(리마운트 메모리 준수).
   - 테이블 컬럼: 이름·키(/표현식)·컨테이너(아이콘: 호스트|템플릿 + 이름 → 해당 드릴다운 상세로 링크)·정의처(source: "로컬"|"템플릿명 링크"|"디스커버리")·**전파**(템플릿 행: "→ N 호스트" 클릭 시 팝오버=템플릿 상세 linkedHosts 재조회)·상태·(아이템: 최근값).
   - `truncated=true`면 테이블 상단 Alert: "전체 {total}건 중 상위 {cap}건만 표시 — 필터를 좁혀 주세요". 페이지네이션 total은 `min(total, cap)` 기준으로 렌더(진짜 total은 안내문에).
   - 행 액션: 수정/상태토글/삭제 → 기존 ItemFormDrawer·TriggerFormDrawer·DeleteModal 재사용(scopeType=containerKind, scopeId=row.hostid, scopeLabel=hostName 주입). 상속 행 읽기전용 규칙 동일.
   - 무필터 첫 로드 3~5s → 스켈레톤/스피너 필수, react-query `keepPreviousData`.
2. **호스트 관리 테이블 강화** — 컬럼 추가: 템플릿(이미 응답에 있음, 태그 렌더+초과 접기), 아이템 수/트리거 수/디스커버리 수(신규 필드, 클릭 시 해당 호스트 드릴다운 서브탭으로 navigate). 상단 필터에 템플릿 select(`/hosts/manage/templates` 검색 재사용, `templateids` 쿼리).
3. **템플릿 관리 전파 뷰** — 목록 hostCount 컬럼(있음)에 "전파" 의미 부여(클릭→상세 정보탭), 상세 정보탭에 "전파 대상 호스트 N" 섹션(linkedHosts — A안 TemplateInfoTab에 이미 이관되는 link/unlink 섹션과 통합).

계약 경계: FE가 소비하는 신규 shape = `LensPagedDto`/`LensItemDto`/`LensTriggerDto`/`ManagedHostDto.{itemCount,triggerCount,discoveryCount}`/`ManagedHostListReqDto.templateids`. 나머지는 기존 계약 재사용.

---

## 5. 작업 분해 + 단계 제안

### 단계 제안 — **2단계 분리 권고**
- **1단계 (저리스크·소형)**: §2-A 호스트 테이블 강화 + §2-B 템플릿 전파 노출 + FE 컬럼/필터. BE 변경이 additive뿐이라 드릴다운 회귀 없음. 실측상 성능 무비용.
- **2단계 (리스크 보유 ⚠)**: 렌즈 EP 2개 + 렌즈 화면 2개. CAP 전략·페이지 보강·source 역추적이 신규 로직이며, 무필터 3~5s UX와 truncated 정책에 사용자 판단이 필요(D1~D3 확정 후 착수).
- 한 번에 가는 것도 가능은 하나, 2단계의 열린 결정 3건이 미확정 상태로 착수하면 재작업 확률이 높다.

### BE (be-engineer)
| # | 작업 | 난이도 | 단계 |
|---|---|---|---|
| B1 | host.get select 3종 count + `ManagedHostDto` 3필드 + `templateids` 필터 + 단건 EP 동기화 + 테스트 | 하 | 1 |
| B2 | (선택) `ManagedTemplateDto.triggerCount` additive | 하 | 1 |
| B3 | `ItemLensReqDto`/`LensPagedDto`/`LensItemDto` + `items/lens` EP(§3-1 파이프라인) + 테스트(happy/empty/truncated/offset초과) | **중상** | 2 |
| B4 | `triggers/lens` EP(+페이지 expandExpression 보강) + 테스트 | 중 | 2 |
| B5 | 전파 맵·이름 맵 헬퍼(§3-3, 요청당 캐시) + source 역추적(§3-2) — B3/B4 공용 컴포넌트로 분리 | 중 | 2 |
| B6 | 계약 문서: `features/zabbix-config/host-registration/contract_host-registration.md` §추가, 신규 `contract_entity-lens.md` 산출 | 하 | 각 단계 |

### FE (fe-engineer)
| # | 작업 | 난이도 | 단계 |
|---|---|---|---|
| F1 | 호스트 테이블 컬럼 3+1(템플릿) + 템플릿 필터 + 카운트 클릭 → 드릴다운 서브탭 navigate | 중 | 1 |
| F2 | 템플릿 정보탭 '전파 대상' 섹션(기존 linkedHosts) + 목록 컬럼 의미화 | 하 | 1 |
| F3 | 렌즈 페이지 2개(메뉴/라우트/i18n/필터바/truncated Alert/URL 상태) | **중상** | 2 |
| F4 | 렌즈 행 액션 → 기존 FormDrawer/DeleteModal 재사용 배선(containerKind→scope 주입) | 중 | 2 |
| F5 | 테스트(npx jest) + yarn build/lint | 중 | 각 단계 |

### QA
- integration-qa: additive 필드 하위호환(기존 화면 shape 비파괴), 렌즈 DTO ↔ FE 타입 대조, offset≤cap 검증.
- functional-qa: ① 호스트 테이블 카운트 실값 대조(Zabbix UI와) ② 템플릿 필터 → 드릴다운 왕복 ③ 렌즈 무필터 truncated 경고+로딩 ④ 렌즈 필터 조합·검색 ⑤ 렌즈에서 수정/토글/삭제 후 드릴다운 화면과 정합 ⑥ 상속 행 읽기전용 ⑦ 전파 카운트=템플릿 상세 linkedHosts 수 일치.

---

## 6. 리스크

1. **무필터 렌즈 응답 3~5s + CAP 너머 탐색 불가(HIGH·구조적)** — Zabbix API offset 부재가 근본 원인. CAP+truncated+필터 유도로 관리하는 것이지 제거는 불가. FE 로딩 UX·경고 문구가 계약의 일부.
2. **아이템 렌즈 노이즈** — discovered 9,765건(48%)·상속 사본 2,785건. 기본 view/origin 결정(D1)이 UX를 좌우. 잘못 정하면 "전부 중복으로 보이는 화면"이 된다.
3. **미커밋 선행작업 위 증분(반복 리스크)** — A안 드릴다운 포함 5~6건 미커밋 위에 또 쌓는다. 최소한 A안 구현분 커밋 후 착수 권고(A안 문서 리스크 §2와 동일).
4. **기존 목록 EP 회귀** — 렌즈를 신규 EP로 분리했고 기존 EP는 additive만이라 낮음. 단 `ManagedHostDto` 필드 추가 시 FE 스냅샷 테스트·integration-qa의 기존 계약 문서(features/zabbix-config/host-registration/contract_host-registration.md) 갱신 누락 주의.
5. **전파 맵 정합** — link/unlink 직후 렌즈의 hostCount가 캐시 TTL만큼 낡을 수 있음(D4에서 요청당 구축을 기본으로 하면 소멸, TTL 캐시 채택 시에만 존재).
6. **다른 Zabbix 규모** — 실측은 dmove.co.kr(2만 아이템) 기준. 10만+ 아이템 환경이면 CAP fetch도 수 초 → CAP·필수 필터 정책을 설정값으로 두는 것이 안전(`app.lens.cap` 프로퍼티화 권고).
7. **트리거 expandExpression 회귀 주의** — 렌즈는 목록 단계에서 expand를 빼고 페이지 보강에서만 expand한다. 기존 드릴다운 목록(expand 포함)과 응답 필드는 같지만 **경로가 다르므로** FE가 렌즈 목록의 expression을 "원시(미확장)"로 받지 않도록 페이지 보강 결과로 덮어써야 함(구현 시 단위 테스트 고정).

---

## 열린 결정 (사용자 리뷰 요청)

- **D1. 렌즈 기본 뷰**: `view=definition`(상속 사본 제외: 템플릿 원본+로컬, ~7.9천건) + `origin=plain`(discovered 제외) 기본 권고 — "정의 중심" 렌즈. 대안: 전체(20,440건, truncated 상시).
- **D2. LENS_CAP 값**: 1,000 권고(무필터 ~2s대 fetch). 대안 2,000(더 넓은 탐색, ~4s). `app.lens.cap` 설정화.
- **D3. 렌즈에서 '생성' 버튼**: (a) 제공 — 폼에 대상(호스트/템플릿) 선택 스텝 선행(기존 탭2 UX 교훈 재사용) vs (b) 미제공 — 생성은 드릴다운으로 유도(렌즈=탐색/정리 도구로 순수화). **권고 (b)** — 1차 범위 축소, CRUD 진입점 단일화.
- **D4. 전파 맵·이름 맵 캐시**: 요청당 구축(기본 권고, 정합 100%·+0.5s) vs Caffeine/Redis TTL 30~60s(응답 −0.5s, link/unlink 직후 지연 노출).
- **D5. 단계 분리**: 2단계 권고(§5). 1단계는 열린 결정 없이 즉시 착수 가능.
- **D6. 중첩 템플릿 UI 노출**: 실환경 0건 — 알고리즘만 방어 구현하고 UI 표기 생략 권고.
