# 자산관리(assets-core) 풀스택 전수 검사 — 2026-07-13

검사 3갈래: BE 로직(be-engineer) / FE 로직(fe-engineer, npx jest 실행 포함) / BE↔FE 계약 대조(integration-qa).
리뷰 전용 — 코드 수정 없음.

## 총평
- **HIGH(런타임 파손급): 0건.** BE↔FE 계약은 9개 엔드포인트 전부 정합(경로·필드·enum·언랩 깊이·403→200 규약). FE 테스트 3 suites / 19 tests 전부 통과.
- **MEDIUM: 4건** — 아래 참조. 최우선은 계약 문서 drift(#2)와 offset 시맨틱(#1).
- 핵심 로직(동기화 3분기, excluded soft delete 일관성, 편집 소유권 분리, AssetDerivation, 정렬 인젝션 방어, 활동 로그, 엔티티↔V5/V6 DDL, i18n 키, 언랩 깊이)은 전부 이상 없음 판정.

## MEDIUM

### 1. [BE] offset이 limit의 배수가 아니면 무시됨
`AssetService.java:70-73`(getList), `:124-126`(getActivities) — `PageRequest.of(offset/limit, limit)` 정수 나눗셈으로 offset이 limit 배수로 내림된다. 예: `limit=20, offset=25` → 실제 offset 20. 현재 FE는 `(page-1)*limit`(항상 배수)로 호출해 무증상. 임의 offset 소비자(무한스크롤 등)에서 깨짐.
→ offset 직접 적용 방식으로 교체하거나 계약서에 "배수만 지원" 명시.

### 2. [문서] 계약 정본 `contract_assets-core.md`가 V6 데모 개편 미반영 (BE·FE 양쪽 대비 drift)
BE·FE 구현은 서로 정합하나 문서는 v1(pre-V6). AssetSummaryDto 5→8필드, AssetListItemDto 12→20필드, AssetDetailDto +10필드/LiveInfo 2→6필드, Create/Update +7필드, SearchAssetListDto 필터 +7종(savedView 포함)이 문서에 없음. `qa_assets-core.md`의 "불일치 0" 결론도 확장 이전 모델 기준이라 현행 코드에 유효하지 않음.
→ be-engineer가 계약서를 V6 실제 shape로 재산출 후 api-contract-sync 재실행. `owner`(응답)/`ownerName`(요청) 비대칭 footgun도 명시.

### 3. [BE] @Transactional 안에서 Zabbix 외부 HTTP 호출
`AssetSyncService.java:48-56`(sync 쓰기 트랜잭션), `AssetService.java:110-118`+resolveLive(getDetail readOnly 트랜잭션 내 host.get+problem.get 2회). 외부 호출 시간만큼 DB 커넥션 점유 → 동시 동기화/Zabbix 지연 시 풀 고갈 위험. 정확성 버그 아님.
→ "Zabbix 조회(트랜잭션 밖) → 짧은 쓰기 트랜잭션 upsert" 2단계 분리.

### 4. [FE] 레거시 MapViewList가 신규 훅과 쿼리키(`AssetList`/`AssetDetail`) 공유 — 캐시 교차오염 (추정)
`MapViewList.tsx:96-104,125-130` vs `useAsset.ts:28,55`. 동일 QueryClient에서 shape가 다른 두 payload(TAssetDetailData vs TAssetDetail)가 같은 키 네임스페이스 사용. 신규 상세 → 맵뷰 이동 시 stale 캐시 shape 충돌 가능(id 공간이 겹칠 때). 목록 invalidate도 prefix 매칭이라 레거시 쿼리까지 교차 refetch.
→ 레거시 화면에 별도 쿼리키 네임스페이스 부여.

## LOW

### BE
- **L-B1** createdAt/updatedAt은 JVM 존(@CreationTimestamp) + 'Z' 포맷, lastSyncedAt만 UTC 정규화 — 동일 엔티티 내 시계 불일치(운영 UTC 전제면 무증상). `Asset.java:134-140` vs `AssetSyncService.java:70-71`
- **L-B2** custom 자산 deviceType 기본값 null vs zabbix notClassified — notClassified 필터에서 custom 누락. `AssetService.java:163`
- **L-B3** 저장되는 enum성 입력(deviceType/lifecycleStatus 등) 서버측 무검증 — 유령 값 저장 가능
- **L-B4** exclude/restore 멱등성 없음 → 중복 활동 로그. `AssetService.java:224-243`
- **L-B5** 동시 sync 시 uq_asset_zabbix_hostid 위반이 일반 예외로 전파(데이터 무결성은 보호됨)
- **L-B6** resolveLive가 lastCheck 하나 위해 selectItems로 호스트 전체 아이템 로드(성능). `AssetService.java:318,334,361-379`
- **L-B7** ACTION_SYNCED/"synced" enum이 실제 미생성(죽은 값) — 계약·FE enum에도 잔존

### FE
- **L-F1** asset 라우트 4개 permissionKey 부재(컴포넌트 레벨 useIsSuperRole 가드는 정상, 라우트 컨벤션 비일관). `routes.tsx:443-455`
- **L-F2** DmoveTableFilter 경유 필터 변경 시 offset 미초기화(SavedViews만 자체 리셋) → 필터 후 빈 페이지 노출 가능. 공용 컴포넌트 이슈
- **L-F3** custom property key 중복 검사 trim 미적용. `AssetFormModal.tsx:97-105`
- **L-F4** sync 후 상세/이력 캐시 미무효화(목록만). `useAsset.ts:136-142`
- **L-F5** SavedViews 바가 목록 진입마다 카운트 쿼리 4발(limit=1) — 설계상 의도, 부하 참고

### 계약/기타
- **L-C1** MapViewList/ServerLocationList가 코어 계약 타입과 별개의 병렬 타입(TAsset 등)으로 /assets 소비 — 향후 계약 변경 시 동기화 사각지대
- 비기본 정렬(sortBy=name 등)·searchField별 jsonb 검색은 단위테스트가 리포지토리 목킹이라 실SQL 미검증 — 런타임 재검증 권장

## 이상 없음 확인(요약)
동기화 upsert 3분기·excluded skip(부활 없음)·N+1 회피 / soft delete 필터 일관 / 편집 소유권(ASSET_ZABBIX_READ_ONLY, applySnapshot이 사용자 필드 보존) / AssetDerivation null·edge / 정렬·검색 화이트리스트(SQL 인젝션 불가) / 활동 로그 원자성 / 엔티티↔V5+V6 DDL 1:1 / AdminAccessChecker 전 변경성 EP 적용 / FE 언랩 깊이(data.data 0건)·queryKey 파라미터 반영·enabled·i18n 키 누락 0건·없는 id 접근 안전 / 계약 9개 EP·요청/응답 필드·enum·페이징·날짜 전부 BE↔FE 정합.

## 기존 QA에 이미 기록된 것(중복 아님)
cloud state 폼 orphan, account_name/partition/dns_name 미채움, owner 검색 vs 필터 데이터원천 상이 → `qa_assets-demo-reshape.md` 🟡1~3.

---

## 수정 반영 (같은 날, 사용자 승인 범위 ①②③)

- **① MEDIUM #2 해소** — `contract_assets-core.md`를 v2(2026-07-13, V6 반영)로 전면 재산출. footgun 5종 명문화(owner/ownerName 비대칭, 응답 전용 파생, offset 시맨틱, synced 미생성, owner 3원천). 구 `qa_assets-core.md`("불일치 0")는 v1 기준이라 무효 — 정합 기록은 본 문서의 재검증 결과로 대체.
- **② MEDIUM #1 해소** — `common/response/OffsetBasedPageRequest.java` 신설(임의 offset 정확 적용), `AssetService` getList/getActivities 교체. 테스트 +8건(AssetServiceTest 비배수 offset 2 + OffsetBasedPageRequestTest 6), asset 전체 34건 통과.
  - ⚠️ **파생 발견**: `host/report/ReportManagementService.java:51`에 동일한 `offset/limit` 환산 버그 존재 — 스코프 밖 미수정, 추후 `OffsetBasedPageRequest` 재사용해 수정 권장.
- **③ MEDIUM #4 해소** — `ASSET_LEGACY_QUERY_KEY`(AssetLegacyList/AssetLegacyDetail) 신설, `MapViewList.tsx`(3곳)·`dashboards/Default.tsx`(4곳) 교체. `ASSET_QUERY_KEY`는 useAsset.ts 전용 격리, prefix invalidate 교차 차단. tsc + jest 19건 통과.
- **재검증(integration-qa)**: 계약 v2 ↔ BE ↔ FE 삼자 대조 **PASS** — 새 불일치 0, L-1(문서 drift)·L-4(병렬 타입 사각지대) 해소 확인. 잔여: `MapViewList.tsx:127`의 `@ts-expect-error`(레거시 자체 타입 부채, 경계면 무관).
- **2차 승인분(같은 날) — MEDIUM #3 + 리포트 offset 버그 해소**:
  - **MEDIUM #3 해소** — sync는 `TransactionTemplate`로 "Zabbix 조회(트랜잭션 밖) → execute 블록 내 upsert" 분리(`ZabbixSyncServiceImpl` 선례 관례 채택, upsert 원자성·롤백 보존). getDetail은 lazy 연관 전무 확인 후 `@Transactional(readOnly=true)` 제거만으로 해결. `AssetSyncService`/`AssetService`/`AssetSyncServiceTest` 변경.
  - **ReportManagementService offset 버그 해소** — `:50`을 `OffsetBasedPageRequest`로 교체, 비배수 offset 테스트 1건 추가.
  - 테스트: 4개 스위트 45건 전부 통과(AssetServiceTest 20 / AssetSyncServiceTest 8 / OffsetBasedPageRequestTest 6 / ReportManagementServiceTest 11), BUILD SUCCESSFUL.
- **미수정 잔여**: LOW 전체(L-B1~7, L-F1~5, MapViewList `@ts-expect-error` 레거시 타입 부채) — 승인 범위 밖. MEDIUM은 전량 해소됨.
