# 계약 — 그래프 관리 (호스트·템플릿 상세 > 그래프 탭)

- 작성 2026-10-26 · BE 브랜치 `zabbix-graph-mgmt`(워크트리 `C:\worktrees\zbx-graph-be`) · FE 같은 이름(`C:\worktrees\zbx-graph-fe`)
- Zabbix `graph.*` 래핑. Zabbix UI의 Data collection › Hosts/Templates › Graphs에 해당한다.
- 전 EP **관리자 전용**(`AdminAccessChecker.requireAdmin`, 거부는 HTTP 200 + body code 403). 로컬 저장 없음, 서비스 계정 토큰, 쓰기는 `zabbix_change_log`(entityType `GRAPH`).

## 1. 읽기 전용 규칙

| 구분 | 판정 | 화면 | 쓰기 시 BE |
|---|---|---|---|
| 템플릿 상속 | `templateid ≠ "0"` | `inherited=true`, 원본 템플릿명 `sourceTemplateName`(부모 그래프의 템플릿, 한 단계) | `GRAPH_INHERITED_READONLY: 그래프명` |
| LLD 발견 | `flags = "4"` | `discovered=true` | `GRAPH_DISCOVERED_READONLY: 그래프명` |

`editable = !inherited && !discovered`. 삭제는 하나라도 읽기 전용이면 **아무것도 지우지 않는다**.

## 2. GET `/zabbix-manage/graphs`

쿼리: `hostid` | `templateid`(하나 필수, 둘 다면 hostid) · `search`(그래프명 부분일치) · `limit`(기본 20, 최대 500 — 공통 표의 500개 보기와 맞춤, 상한이 작으면 다음 페이지 offset과 어긋나 중간 행이 빠진다) · `offset`.
둘 다 없으면 `GRAPH_TARGET_REQUIRED`.

응답 `PagedListDto<ManagedGraphDto>`: `{items, total, limit, offset}`

```json
{ "graphid": "1234", "name": "CPU", "width": "900", "height": "200", "graphtype": "0",
  "itemCount": 2, "itemNames": ["CPU user", "CPU system"],
  "inherited": false, "sourceTemplateName": null, "discovered": false, "editable": true }
```
`graphtype`: 0 normal · 1 stacked · 2 pie · 3 exploded(Zabbix 원시 문자열). `itemNames`는 최대 3개, `itemCount`는 gitems 수(같은 아이템을 두 번 넣으면 2).

## 3. GET `/zabbix-manage/graphs/{graphid}` — 편집 프리필

`ManagedGraphDetailDto`: 목록 필드(itemCount·itemNames 제외) + `ownerId`·`ownerName`(소속 호스트/템플릿) + `options` + `gitems`.

- `options`: `show_legend`·`show_work_period`·`show_triggers`·`ymin_type`·`ymax_type`·`yaxismin`·`yaxismax`·`ymin_itemid`·`ymax_itemid`·`percent_left`·`percent_right`·`show_3d` 중 Zabbix가 준 것(원시 값).
- `gitems`: sortorder 순. `{itemid, itemName, itemKey, color(RRGGBB), drawtype, yaxisside, sortorder, calcFnc, type}`.
  ⚠️ 응답은 `calcFnc`(camel), 요청은 Zabbix 원본 키 `calc_fnc`.

없으면 `GRAPH_NOT_FOUND`.

## 4. POST `/zabbix-manage/graphs` · PUT `/zabbix-manage/graphs/{graphid}`

```json
{ "hostid": "10644", "name": "CPU", "width": 900, "height": 200, "graphtype": 0,
  "gitems": [{ "itemid": "11", "color": "1A7C11", "drawtype": "0", "yaxisside": "0", "sortorder": "0", "calc_fnc": "2", "type": "0" }],
  "options": { "show_legend": 1, "ymin_type": 1, "yaxismin": 0 } }
```

- 생성: `hostid`|`templateid`·`name`·`gitems`(1개 이상) 필수. 응답 = 생성 직후 상세.
- 수정: **보낸 필드만**. `hostid`/`templateid`는 무시(그래프의 소속으로 검증). 🔴 `gitems`는 보내면 **전체 교체**.
- `gitems` 허용 키: `itemid`·`color`·`drawtype`·`yaxisside`·`sortorder`·`calc_fnc`·`type`. 그 밖의 키(get 응답의 `gitemid`·`graphid` 등)는 버린다. `color`는 6자리 hex(대문자로 저장), `sortorder` 생략 시 들어온 순서.
- `options`는 §3의 키만 전달.
- 🔴 그래프 유형별 항목 제약(Zabbix 공식 편집 화면과 같음): `calc_fnc` normal 1·2·4·7 / stacked 1·2·4 / pie·exploded 1·2·4·9, 항목 `type=2`(합계)는 원형만. 어기면 `GRAPH_ITEM_INVALID: itemid(calc_fnc=7)`. 수정에서 `graphtype`만 바꿔도 기존 항목을 새 유형 기준으로 검사한다. FE는 유형을 바꾸면 선택지를 줄이고 맞지 않는 값을 avg·단일로 정리한다.
- 🔴 항목 아이템은 **소속 호스트·템플릿의 숫자형(value_type 0·3)** 만. 아니면 `GRAPH_ITEM_INVALID: itemid, …`. (Zabbix는 여러 호스트 아이템을 섞은 그래프를 허용하지만, 그러면 여러 호스트 탭에 같은 그래프가 나타나 "이 호스트의 그래프" 모델이 깨진다.)
- 오류: `GRAPH_TARGET_REQUIRED` · `GRAPH_NAME_REQUIRED` · `GRAPH_ITEMS_REQUIRED` · `GRAPH_ITEM_INVALID` · `GRAPH_INHERITED_READONLY` · `GRAPH_DISCOVERED_READONLY` · `GRAPH_CREATE_FAILED`. Zabbix 거부(이름 중복 등)는 원문.

변경 이력 payload는 Zabbix에 보낸 값 그대로(graphid·name 제외, `ownerId` 추가).

## 5. DELETE `/zabbix-manage/graphs`

본문 `{ "ids": ["1234"] }` → `{ "ids": [...], "count": n }`(`DiscoveryDeleteResDto`, 중복 id는 한 번). 빈 목록 `GRAPH_IDS_REQUIRED`, 없는 id 포함 `GRAPH_NOT_FOUND`, 읽기 전용 포함 시 §1 코드로 전부 거부.

## 6. 오류 전달 형식

BE는 `ApiError("GRAPH_X: 상세")`로 던지고, 응답 envelope은 `errorCode = "GRAPH_X"`, `message = 상세`(없으면 코드)다. FE `graphErrorMessage`는 `errorCode`로 번역하고 상세를 `{{detail}}`로 넣는다.

## 7. FE

- 탭 키 `graph`(`CONTAINER_DETAIL_TABS.GRAPH`), 호스트·템플릿 상세에서 트리거 다음.
- 항목 선택은 `/zabbix-manage/items`(스코프·검색·limit 200) 재사용 후 숫자형만 노출. 기존 항목 라벨은 상세의 `itemName`·`itemKey`.
- y축 `ymin_type/ymax_type = 2`(아이템 기준)는 폼에서 고르지 않고, 기존 값이면 보내지 않아 유지된다.

- 수정 폼은 **그 그래프의 상세(`detail.graphid === 행 graphid`)가 와 있고 `editable`일 때만** 저장할 수 있다. 상세 조회 실패는 폼 위에 오류로 보인다.
- 목록 조회 실패는 빈 표가 아니라 오류로 보인다.
- 항목 선택은 아이템 EP 상한(200)까지 받아 숫자형만 보이고, 더 있으면 검색하라는 안내를 띄운다.

## 8. 실측(2026-10-26, dev Zabbix 7.0.6 · BE 재기동 후)

- 호스트 10084: 그래프 8개 = 상속 5(원본 템플릿명 표시됨)·발견 3·편집 가능 0. 상속 상세는 gitems에 아이템명, options 원본 전체.
- 상속·발견 그래프 수정·삭제 → `GRAPH_INHERITED_READONLY`·`GRAPH_DISCOVERED_READONLY`(메시지 = 그래프명).
- 생성(색 소문자 → 대문자 저장) → 수정(이름·stacked·항목 2개, sortorder 0·1) 성공. stacked + calc 7 → `GRAPH_ITEM_INVALID: itemid(calc_fnc=7)`, 문자형 아이템 → `GRAPH_ITEM_INVALID: itemid`, 이름 중복 → Zabbix 원문(`Graph "…" already exists on the host "…"`).
- 템플릿 10076(링크 호스트 0): 목록 4건, 호스트 아이템으로 생성 → `GRAPH_ITEM_INVALID`, 템플릿 아이템으로 원형(last·합계) 생성 성공 — `item.get hostids=[templateid]` 검증이 템플릿에서도 동작함 확인.
- 만든 그래프 2개 삭제, 잔여 0.
