---
name: assets-core-devdesign
description: "자산관리 Assets 개발 설계 v2 — 자산=Zabbix 등록 항목+custom, 스냅샷 모델, 동기화 버튼, Zabbix 쓰기는 2차. 설계서 위치·핵심 결정·미확정 5건"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4fa0755b-ad60-4209-b2e0-00b24b3a2e09
---

2026-07-08 자산관리 개발 설계 진행. **산출물(정본): `C:\solutions\_workspace\devdesign_assets-core.md` (v2)**.

**🔄 같은 날 방향 전환(사용자 결정) — v1 폐기**: 2026-07-03 정의서의 "독립 자산 레코드+Host 0:1" 모델이 아니라, **자산 = Zabbix에 등록된 것**(+ MovesEye 전용 custom 자산). FE·BE 전부 신규 개발, 기존 FE 프로토타입(`AssetList.tsx` 등)·기존 계약 전부 폐기. 정의서는 화면 구성 참고용으로 강등.

**v2 핵심 설계**:
- **스냅샷 모델**: 기준 데이터=MovesEye DB. Zabbix는 **동기화 버튼+옵션**(mode: add_only/add_update, groupIds 범위)으로 pull → `zabbix_hostid` upsert. 화면은 DB만 조회(상세의 live 상태·Problem만 실시간 보강).
- **편집 소유권 분리**: `zabbix_data` jsonb(호스트·그룹·인터페이스·인벤토리·태그 스냅샷)=동기화만 갱신, `custom_properties`/`notes`=사용자만 갱신.
- **삭제=soft(`excluded`)**: 물리 삭제하면 다음 동기화 때 되살아남 → excluded 플래그+동기화 skip. 복원 EP 별도.
- **Zabbix 쓰기(host.create/update/delete, enable/disable, 템플릿)는 전부 2차 로드맵으로 기록만**(사용자 확정). 1차 POST=custom 자산 전용, zabbix 자산 수정은 보조 필드만.
- Flyway **V5**(asset+asset_activity), API 9개, BE `asset/` 패키지(Spring 단일 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-dual-maintenance|be-dual-maintenance]]).
- BE에는 asset 코드 전무(Spring·Nest 양쪽) 확인됨 — 완전 신규.

**확정(2026-07-08)**: 변경성 동작(동기화·생성·수정·삭제) **전부 관리자 전용** — 목록 화면 useSyncUser(일반 사용자 허용)와 달리 자산 동기화는 DB 행 생성이라 관리 통제 우선.

**✅ 구현 완료(2026-07-08)**: fullstack-feature 파이프라인 1패스 완주.
- BE: Spring `asset/` 패키지(도메인·서비스 4·컨트롤러·DTO 9·repo 2) + Flyway **V5**(asset/asset_activity) + 단위테스트 19건. 계약서 `_workspace/features/assets/assets-core/contract_assets-core.md`.
- FE: 전부 신규(목록/상세/생성·편집 모달/동기화 옵션 모달/요약 헤더/이력, services·types·hooks·routes·i18n). **구 `AssetList.tsx`(1726줄) 제거**. tsc/lint/jest(233건) 통과.
- QA: integration-qa 경계면 0 불일치(`qa_assets-core.md`) → functional-qa 실 Zabbix 호스트 75건 동기화, 8 시나리오+핵심 불변식 3종(편집 소유권 분리·재동기화 비삭제·제외 비부활) 런타임 PASS(`e2e_assets-core.md`).
- **DB 적용됨**: dev(dmove)에 V5 자동 적용, asset/asset_activity 생성 확인. 현재 zabbix 75/custom 0(QA 아티팩트 정리됨). BE :3000 재기동됨(구 빌드는 asset 미포함이라 교체).
- QA 발견 이슈 1건 수정 완료: 동기화 `syncedAt`(UTC)과 엔티티 `lastSyncedAt`(KST+'Z' 오표기) 시계 불일치 → AssetSyncService에서 단일 UTC Instant 파생으로 통일.

**⚠️ 잔여/참고**:
- 구 asset API를 쓰던 `dashboards/Default.tsx`(감가상각)·`pages/asset/MapViewList.tsx`(맵뷰)는 `asset-legacy.api.ts`/`asset-legacy.ts`로 **격리만**(동작 유지) — 신모델 이관/폐기는 별도 제품 결정 대기.
- custom 자산 폼은 name/inventory/customProperties/notes만(groups/interfaces/tags 편집기 미구현, §9#3).
- 비관리자 403 런타임 재현 불가(비-ADMIN은 JwtAuthFilter에서 401로 더 강하게 차단) — 결함 아님, 권한 게이트는 컨트롤러 requireAdmin 5개로 확인.
- 화이트보드 3건(User Flow·API Sequence) 여전히 미확인(Chrome 확장 미연결).
- **2차 로드맵(설계서 §8)**: Zabbix 쓰기(host.create/update/delete·enable/disable·템플릿), 사라진 호스트 감지·자동 동기화 배치·sync_run 이력, Excel 업로드, Costs/Maps 접점.

**🔍 전수 검사+수정(2026-07-13)**: BE·FE·계약 3갈래 감사 — HIGH 0, BE↔FE 런타임 불일치 0. MEDIUM 4건 중 3건 같은 날 수정 완료: ① **계약서 v2 재산출**(V6 반영, footgun 5종 명문화 — 응답 `owner`/요청 `ownerName` 비대칭, coverage·deploymentStatus 응답 전용 파생, synced 액션 미생성, owner 3원천 상이. 구 qa_assets-core.md "불일치 0"은 v1 기준이라 무효), ② **offset 배수 내림 버그 수정** — `common/response/OffsetBasedPageRequest` 신설(재사용 가능), ③ **레거시 쿼리키 분리** — `ASSET_LEGACY_QUERY_KEY` 신설(MapViewList·Default.tsx), `ASSET_QUERY_KEY`는 useAsset.ts 전용. 재검증(삼자 대조) PASS. 2차 승인분도 같은 날 완료: ④ **트랜잭션 분리** — sync는 TransactionTemplate(Zabbix 조회 밖→upsert만 트랜잭션, ZabbixSyncServiceImpl 선례), getDetail은 lazy 연관 전무라 @Transactional 제거만, ⑤ **ReportManagementService offset 동일 버그도 OffsetBasedPageRequest로 수정**. BE 테스트 45건 통과. **잔여(미수정)**: LOW 12건뿐 — custom deviceType null 기본값(notClassified 필터 누락), enum성 입력 무검증, exclude/restore 비멱등, 필터 변경 시 offset 미리셋, sync 후 상세 캐시 미무효화, resolveLive selectItems 전체 로드(성능) 등. 상세: `_workspace/audit_assets-full-2026-07-13.md`.

**Why:** 하루에 방향이 v1→v2로 뒤집혀(정의서 모델 폐기) 다음 세션이 v1이나 정의서 기준으로 착수하면 안 됨. 1차 구현은 끝났고 다음은 위 2차 로드맵. **How to apply:** 후속 작업 시 devdesign_assets-core.md(v2) §8 + contract_assets-core.md를 정본으로. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-dual-maintenance|be-dual-maintenance]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--host-livecheck-feature|host-livecheck-feature]](live 상태 원천 동일).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

Assets 자산관리 기능 — 2026-07-08 설계+구현 완료. 자산=Zabbix 등록 항목+custom, 스냅샷 모델+동기화 버튼(옵션), 삭제=excluded soft, 편집 소유권 분리, Zabbix 쓰기=2차. BE Spring V5+API 9개, FE 전부 신규(구 AssetList 제거), QA 통과(실 Zabbix 75건). 설계서 devdesign_assets-core.md(v2)+계약 features/assets/assets-core/contract_assets-core.md. 2026-07-13 전수검사+수정: HIGH 0, MEDIUM 4건 전량 해소(계약서 v2 재산출/offset 버그+리포트 동일 버그/트랜잭션 분리/레거시 쿼리키 분리), 재검증 PASS, 잔여 LOW만 — audit_assets-full-2026-07-13.md
