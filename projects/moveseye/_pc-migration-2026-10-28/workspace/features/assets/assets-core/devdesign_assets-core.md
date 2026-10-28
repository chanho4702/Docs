# 자산관리 Assets — 개발 설계서 (v2)

> 작성일: 2026-07-08 (v2 — 같은 날 방향 전환 반영, v1 폐기)
> 요구 원천: 사용자 직접 정의 (2026-07-08). `_workspace/features/assets/assets-design/design_assets-management.md`(2026-07-03 정의서)는 화면 구성·Activity 등 **참고용**으로만 유지 — 도메인 모델은 본 문서가 우선.

---

## 0. 확정된 방향 (사용자 결정, 2026-07-08)

1. **FE·BE 전부 신규 개발.** 기존 FE 프로토타입(`AssetList.tsx`·구 `asset.api.ts`·구 타입)과 기존 데이터·계약은 전부 무시하고 새로 만든다.
2. **자산 = Zabbix에 등록된 것.** 이 페이지의 의의는 그 항목들의 **관리**(추가/수정/삭제).
3. 옵션에 따라 **Zabbix 데이터를 수정하거나 컨트롤**할 수 있어야 한다 → 단, **Zabbix 쓰기 기능은 2차 로드맵으로 기록만**(사용자 확정). 1차는 읽기+동기화.
4. **Zabbix에 등록하지 않고 MovesEye에만 등록·관리**하는 자산도 지원 (custom 자산).
5. **동기화 기능 필수** — 버튼으로, **옵션에 따라** 동기화.
6. Zabbix 모드 자산 삭제 시 **옵션 선택**(Zabbix에서도 삭제 vs MovesEye에서만 제외) — Zabbix측 삭제는 쓰기라서 2차, 1차는 "MovesEye 관리대상 제외"만.

### 아키텍처 대원칙 — 스냅샷 모델

자산 목록/상세의 기준 데이터는 **MovesEye DB**다. Zabbix 데이터는 **동기화(pull)로 DB에 적재**하고, 화면은 DB만 조회한다.

근거: ① zabbix/custom 자산을 한 목록에서 검색·필터·정렬·페이지네이션하려면 단일 저장소 필요 ② "동기화 버튼" 요구 자체가 스냅샷 모델을 전제 ③ Zabbix 장애가 자산 관리 화면을 마비시키지 않음. 상세 화면의 실시간 정보(호스트 상태·활성 Problem)만 조회 시점에 Zabbix를 보강 호출(실패 시 무시).

---

## 1. 도메인 모델

```
Asset (MovesEye DB 레코드 — 단일 테이블, source로 구분)
 ├─ source = 'zabbix' : zabbix_hostid 보유. zabbix_data(스냅샷 jsonb)는 동기화가 소유(덮어씀).
 │                      사용자 편집 영역은 MovesEye 보조 필드(custom_properties·notes)만. (Zabbix 원본 편집=2차)
 ├─ source = 'custom' : Zabbix 무관, 모든 필드 사용자 편집. 동일한 필드 구조(inventory 스키마)를 재사용해
 │                      목록/상세 렌더를 zabbix 자산과 단일화.
 └─ 1:N → AssetActivity (생성/수정/제외/동기화 이력)
```

**편집 소유권 분리**가 핵심 규칙: `zabbix_data`(호스트명·그룹·인터페이스·인벤토리·태그 스냅샷)는 동기화만 갱신, `custom_properties`/`notes`는 사용자만 갱신 → 동기화가 사용자 입력을 지우지 않고, 사용자 편집이 스냅샷과 충돌하지 않는다.

**삭제 = soft delete (`excluded`)**: zabbix 자산 행을 물리 삭제하면 다음 동기화 때 되살아난다. `excluded=true`로 표시하고 동기화가 excluded hostid를 건너뛰게 해야 "관리대상 제외"가 유지된다. custom 자산도 동일 규칙(이력 보존). 복원 기능 제공.

---

## 2. 데이터 정의 — Flyway `V5__asset.sql`

> 현재 V1~V4, 다음 V5. 관용: `IF NOT EXISTS` 멱등, snake_case, `idx_/uq_` 명명.

```sql
CREATE TABLE IF NOT EXISTS asset (
    id                serial PRIMARY KEY,
    source            varchar NOT NULL,                        -- 'zabbix' | 'custom'
    name              varchar NOT NULL,                        -- zabbix: 호스트 표시명 스냅샷 / custom: 자산명
    zabbix_hostid     varchar,                                 -- source=zabbix 필수
    zabbix_data       jsonb NOT NULL DEFAULT '{}'::jsonb,      -- 동기화 스냅샷 (§2.1)
    inventory_mode    varchar,                                 -- zabbix inventory_mode 스냅샷 (-1/0/1)
    custom_properties jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{"key":"...","value":"..."}] 사용자 편집
    notes             text,
    excluded          boolean NOT NULL DEFAULT false,          -- 관리대상 제외 (soft delete)
    last_synced_at    timestamp,                               -- source=zabbix만
    created_at        timestamp NOT NULL DEFAULT now(),
    updated_at        timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_zabbix_hostid
    ON asset (zabbix_hostid) WHERE zabbix_hostid IS NOT NULL;  -- upsert 기준키
CREATE INDEX IF NOT EXISTS idx_asset_source   ON asset (source);
CREATE INDEX IF NOT EXISTS idx_asset_excluded ON asset (excluded);
CREATE INDEX IF NOT EXISTS idx_asset_name     ON asset (name);

CREATE TABLE IF NOT EXISTS asset_activity (
    id          serial PRIMARY KEY,
    asset_id    integer NOT NULL REFERENCES asset (id) ON DELETE CASCADE,
    action      varchar NOT NULL,      -- 'created'|'updated'|'excluded'|'restored'|'synced'  (2차: 'zabbix_updated'|'zabbix_deleted')
    actor_type  varchar NOT NULL,      -- 'user' | 'system'
    actor_name  varchar,
    changes     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{"field","before","after"}] / synced는 {"added","updated"} 요약
    created_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_activity_asset_id ON asset_activity (asset_id);
```

### 2.1 `zabbix_data` 스냅샷 구조 (Java record `domain/AssetZabbixData`)

`host.get`(+select*)에서 추출해 저장. custom 자산도 **같은 record**를 사용자 입력값으로 채운다(렌더 단일화).

| 필드 | 원천 (zabbix) | custom 자산 |
| --- | --- | --- |
| `host`, `visibleName` | host.get `host`/`name` | 사용자 입력 |
| `status` | 호스트 enabled(0)/disabled(1) | null |
| `groups[]` `{groupid,name}` | selectGroups | 사용자 입력(이름만, groupid null 허용) |
| `interfaces[]` `{type,ip,dns,port,main}` | selectInterfaces | 사용자 입력(옵셔널) |
| `inventory` `Map<String,String>` | selectInventory (Zabbix 표준 ~70필드 중 값 있는 것만) | 사용자 입력 |
| `tags[]` `{tag,value}` | selectTags | 사용자 입력 |

> Zabbix 7.0 제약: Inventory Custom Field 미지원(8.0+) → inventory는 표준 필드 키만. 사용자 임의 필드는 `custom_properties`로(zabbix/custom 자산 공통).

---

## 3. 동기화 설계 (1차 핵심 기능)

### 3.1 엔드포인트

`POST /assets/sync` — body:

```json
{
  "mode": "add_only" | "add_update",   // 신규만 추가 | 신규 추가 + 기존 스냅샷 갱신
  "groupIds": ["1","7"]                // 옵셔널 — 지정 시 해당 호스트그룹만, 미지정 시 전체
}
```

응답: `{ added, updated, skipped, total, syncedAt }` (skipped = excluded 자산 + add_only 모드의 기존 자산)

### 3.2 동작

1. `host.get`(groupids 옵션, `selectGroups`·`selectInterfaces`·`selectInventory`·`selectTags`) 일괄 조회.
2. `zabbix_hostid` 기준 upsert:
   - DB에 없음 → `source='zabbix'` 자산 생성, Activity `created`(actor_type=`system`... 트리거는 사용자 버튼이므로 actor_type=`user`+username, action=`synced` 상세는 §3.3).
   - 있음 + `mode=add_update` → `zabbix_data`·`name`·`inventory_mode`·`last_synced_at` 갱신. `custom_properties`/`notes`/`excluded`는 **불변**(편집 소유권 분리).
   - 있음 + `mode=add_only` → skip.
   - `excluded=true` → 무조건 skip (제외 유지).
3. Zabbix에서 사라진 호스트(DB에는 있는데 host.get에 없음): **1차는 아무것도 안 함**(행 유지, `last_synced_at`만 옛날로 남음). 감지·표시("미발견" 뱃지)·정리 정책은 2차(§8).
4. Activity: 자산별 개별 기록 대신 **동기화 실행 1건 요약 기록이 과다하지 않게** — 신규 생성 자산에만 `created` 기록 + 갱신 자산에는 기록 생략(스냅샷 갱신은 이력 가치 낮고 N이 큼). 동기화 실행 자체의 이력이 필요하면 2차에 sync_run 테이블 검토.
5. 트랜잭션: upsert 전체 단일 트랜잭션. Zabbix 호출 실패 시 DB 무변경 + 에러 반환(기존 데이터 즉시 삭제 금지 원칙 — 정의서 §3.5 준용).

### 3.3 FE 동기화 UX

목록 헤더의 **[동기화] 버튼 → 옵션 모달**(FormModal): mode 라디오(기본 add_update) + 호스트그룹 멀티셀렉트(빈값=전체) → 실행 → 결과 토스트("추가 n건 · 갱신 m건") + 목록 refetch. 실행 중 버튼 loading. 마지막 동기화 시각을 버튼 옆에 표시(`GET /assets/summary`의 `lastSyncedAt`).

---

## 4. API 계약 (1차)

공통: `ApiResult<T>` 래핑(syncTime 자동), 비즈니스 에러 = HTTP 200 + body code(401만 실상태코드). 권한 표기 A=관리자(`AdminAccessChecker.requireAdmin`), U=인증 사용자.

| # | Method | Path | 권한 | 설명 |
| --- | --- | --- | --- | --- |
| 1 | GET | `/assets` | U | 목록. `limit`(기본 20, 1~100)·`offset`·`keyword`·`searchField`(name\|host\|group\|serial\|tag\|owner)·`source`(zabbix\|custom)·`groupName`·`includeExcluded`(기본 false)·`sortBy`(name\|source\|lastSyncedAt\|updatedAt)·`sortDirection` → `PaginationResponseDto<AssetListItemDto>` |
| 2 | GET | `/assets/summary` | U | `{ total, zabbixCount, customCount, excludedCount, lastSyncedAt }` |
| 3 | GET | `/assets/{id}` | U | 상세 `AssetDetailDto`. source=zabbix면 실시간 보강 `live: { available, activeProblemCount }`(Zabbix 호출, try-catch — 실패 시 null) + `recentActivities`(5) |
| 4 | GET | `/assets/{id}/activities` | U | 이력 목록 (limit/offset) |
| 5 | POST | `/assets` | A | **custom 자산 생성**. `{ name*, zabbixData(groups/interfaces/inventory/tags), customProperties, notes }`. Activity `created`. (2차: `registerToZabbix` 옵션 → host.create) |
| 6 | PATCH | `/assets/{id}` | A | 수정. **custom 자산**: 전 필드. **zabbix 자산**: `customProperties`·`notes`만 허용 — zabbixData 변경 시도는 검증 에러("Zabbix 반영은 추후 지원"). diff를 Activity `updated`로 기록. (2차: `applyToZabbix` 옵션 → host.update) |
| 7 | DELETE | `/assets/{id}` | A | **관리대상 제외**(`excluded=true`, soft). Activity `excluded`. (2차: `?deleteFromZabbix=true` → host.delete. 1차에 이 파라미터가 오면 명시적 에러) |
| 8 | PATCH | `/assets/{id}/restore` | A | 제외 복원. Activity `restored` |
| 9 | POST | `/assets/sync` | A | §3 동기화. **관리자 전용 확정**(2026-07-08 사용자 결정 — 목록 화면 useSyncUser와 달리 자산 동기화는 DB에 자산 행을 생성하므로 관리 통제 우선) |

검증: `name` 필수, source 불변, zabbix 자산 생성은 동기화로만(POST는 custom 전용), enum(mode 등) 검증, custom_properties key 중복 금지.

---

## 5. BE 설계 (moveseye-be-spring — Spring 단일)

```
com.dmove.moveseye
├── asset/
│   ├── AssetController.java          @RequestMapping("/assets") @Tag("Assets") @SecurityRequirement("bearer") @VisitorIdCheck
│   ├── AssetService.java             CRUD·목록·상세(live 보강)
│   ├── AssetSyncService.java         §3 동기화 (upsert 트랜잭션)
│   ├── AssetActivityService.java     diff 계산·기록
│   ├── repository/ AssetRepository · AssetActivityRepository
│   └── dto/ SearchAssetListDto(@Getter@Setter) · AssetListItemDto · AssetDetailDto · CreateAssetReqDto
│            · UpdateAssetReqDto · SyncAssetsReqDto · SyncAssetsResDto · AssetSummaryDto · AssetActivityDto (record+from)
└── domain/ Asset.java · AssetActivity.java · AssetZabbixData.java (record, @JdbcTypeCode(SqlTypes.JSON))
```

관용 준수: 엔티티 `@Getter @Builder @NoArgsConstructor(PROTECTED)` + 도메인 메서드(`applySnapshot()`, `updateCustomFields()`, `exclude()/restore()`), IDENTITY Integer id, snake_case `@Column`, `@CreationTimestamp/@UpdateTimestamp`, 날짜 `@JsonFormat(...'Z')`, 목록은 `Pageable`+`@Query` 옵셔널 필터(`:param IS NULL OR ...`) → `PaginationResponseDto`.

**Zabbix 읽기 확장 (신규 쓰기 없음)**: 기존 `ZabbixHostService.get`은 select가 제한적 → `getRaw(authToken, params)`에 `selectInventory`·`selectInterfaces`·`selectTags`·`selectGroups`를 포함하는 동기화용 파라미터 추가(또는 `ZabbixHostGetParams` 확장). keyword의 `group`/`tag` 검색은 DB jsonb 검색(`zabbix_data->'groups'` 등 `@Query` nativeQuery)으로 처리.

상세 live 보강: `available`은 host.get(interface available), `activeProblemCount`는 기존 `getHostActiveAlarmCounts` 계열 재사용 — [[host-livecheck-feature]]와 동일 원천.

테스트: 동기화 upsert 3분기(add/update/skip)+excluded 유지+Zabbix 실패 롤백, 편집 소유권(zabbix 자산 zabbixData 수정 거부), soft delete/복원, diff 기록. Zabbix는 mock.

---

## 6. FE 설계 (moveseyee_fe — 전부 신규, 구 코드 제거)

```
src/pages/asset/
├── AssetListPage.tsx           DmoveTableFilter + DmoveTable (서버사이드) + 요약 헤더 + [동기화][자산 생성]
└── components/
    ├── AssetSummaryHeader.tsx  total/zabbix/custom/제외 + 마지막 동기화 시각 (HostGroupKpiHeader 패턴)
    ├── SyncOptionsModal.tsx    §3.3 — mode 라디오 + 그룹 멀티셀렉트(SelectInfinityScroll)
    ├── AssetFormModal.tsx      custom 생성 / 수정 겸용 (FormModal 패턴, isEdit=!!id).
    │                           zabbix 자산 수정 모드: zabbixData 섹션 읽기전용+뱃지("Zabbix 동기화 값 — 편집은 추후 지원")
    ├── CustomPropertiesEditor.tsx  key:value Form.List (양 source 공통 편집 영역)
    ├── InventoryFieldsSection.tsx  inventory 표준 필드 입력/표시 (custom=편집, zabbix=읽기전용)
    └── AssetActivityList.tsx   이력 타임라인
src/pages/asset/AssetDetailPage.tsx   라우트 /asset/list/:id (routes.tsx에 추가) — 요약/연결정보/inventory/커스텀속성/이력
                                      + zabbix 자산이면 live 상태·Problem 뱃지, [Host 상세로 이동](hostid 링크)
src/services/asset.api.ts       재작성 — 계약 9개 (구 함수 전부 제거)
src/types/asset.ts              재정의 — TAsset, TAssetZabbixData, TAssetSummary, TSyncResult, TAssetActivity
src/hooks/useAsset.ts           useAssetList/Summary/Detail/Activities (useDmoveQuery — 언랩 2겹, payload 직접 수신)
                                + useCreateAsset/useUpdateAsset/useExcludeAsset/useRestoreAsset/useSyncAssets (invalidate ASSET_QUERY_KEY)
src/constants/queryKey.ts       ASSET_QUERY_KEY 확장 (SUMMARY/ACTIVITIES 추가)
src/locales/en.json·kr.json     기존 asset_field.*/inventory_field.* 최대 재사용 + sync/exclude 신규 키 (⚠️ kr.json)
```

- 목록 컬럼: 자산명(→상세) · source 뱃지(Zabbix/Custom) · 호스트그룹 · 주요 인벤토리(type·OS) · 태그/커스텀속성 수 · 마지막 동기화 · 수정일. `includeExcluded` 토글 시 제외 자산 회색 + [복원].
- 삭제 확인 모달: 1차는 "MovesEye 관리대상에서 제외합니다(Zabbix에는 영향 없음)" 문구만. "Zabbix에서도 삭제" 체크박스는 2차에 추가(1차 미노출 — 죽은 UI 금지).
- 권한: 조회 라우트는 인증만, [동기화]·[생성]·[수정]·[삭제] 버튼은 `isSuperRole` + `<Show>` (**확정** — 변경성 동작 전부 관리자 전용).
- 구 `AssetList.tsx`·구 API·구 타입은 신규 검증 후 제거(Excel 포함 — git 이력으로 복원).

---

## 7. 구현 단계 (fullstack-feature 파이프라인)

| Phase | 담당 | 내용 | 완료 기준 |
| --- | --- | --- | --- |
| 1 | be-engineer | V5 + domain/repo + CRUD·soft delete·Activity + **동기화**(Zabbix 읽기 확장 포함) + 테스트 | compileJava·테스트 통과, Swagger 노출 |
| 2 | api-contract-sync | Spring DTO ↔ FE 타입 대조 | 불일치 0 |
| 3 | fe-engineer | §6 전체 + 구 asset 코드 제거 | tsc·lint·jest 통과 |
| 4 | integration-qa → functional-qa | 경계면 대조 → dev 기동 E2E: 동기화(양 mode·그룹 범위) → 목록/검색 → custom 생성 → 수정(소유권 분리) → 제외/복원 | 시나리오 통과 |

## 8. 2차 로드맵 (이번에 기록만 — 사용자 요구 원형 보존)

1. **Zabbix 쓰기**: 생성 시 "Zabbix에 등록"(host.create — 인터페이스 최소 1개 필수), 수정 시 "Zabbix에 반영"(host.update: 기본정보·인벤토리·태그·그룹), 삭제 시 "Zabbix에서도 삭제"(host.delete — 삭제 확인창 옵션), 모니터링 enable/disable 컨트롤, 템플릿 link/unlink. **쓰기용 토큰 정책(로그인 사용자 vs Super Admin) 결정 필요.**
2. Zabbix에서 사라진 호스트 감지·표시·정리 정책 / 자동(주기) 동기화 배치 / sync_run 이력 테이블.
3. Excel 업로드(zabbix/custom 타입, 성공/실패 카운트) — 구 프로토타입 UX 참고.
4. 정의서(2026-07-03)의 Costs·Maps·AWS 수집과의 접점 재평가 — 특히 Asset↔Cost 연결 시 본 모델(source 구분)과의 정합.

## 9. 미확정 — 착수 전 확인

| # | 항목 | 제안(기본값) |
| --- | --- | --- |
| 1 | 요약 지표 구성 — total/zabbix/custom/excluded로 충분한가 (정의서의 "모니터링 커버리지" 지표는 본 모델에선 무의미) | 제안대로 4지표+lastSyncedAt |
| 2 | ~~동기화·생성/수정/삭제 권한~~ → **확정(2026-07-08): 변경성 동작 전부 관리자 전용** | — |
| 3 | custom 자산에 인터페이스(IP/포트) 입력 포함 여부 | 포함(옵셔널) — 2차 "Zabbix 등록" 대비 |
| 4 | 목록 검색 대상에 inventory 전체 포함 여부(jsonb 검색 비용) | 1차는 name·host·group·serial·tag·owner 한정 |
| 5 | 화이트보드 3건(User Flow·API Sequence) 여전히 미확인 — Chrome 확장 연결 필요 | 연결 후 보강, 상충 시 본 문서 갱신 |
