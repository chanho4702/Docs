---
tags: [moveseye, assets, zabbix, fullstack, spring, react]
updated: 2026-08-07
---

# 자산관리(Assets) 코어 — 설계+구현 (2026-07-08)

한 세션에서 **개발 설계 → 방향 전환 → 풀스택 구현 1패스 완주**까지. 산출물 정본: `_workspace/devdesign_assets-core.md`(v2), `_workspace/features/assets/assets-core/contract_assets-core.md`(계약), `qa_/e2e_assets-core.md`(QA).

## 방향 전환이 설계의 핵심이었다

- 처음엔 2026-07-03 [[assets-design-spec]] 정의서(자산=독립 인벤토리 레코드, Host 0:1 연결)를 기준으로 설계서 v1을 썼다.
- 그런데 사용자 요구는 **"자산 = Zabbix에 등록된 것"** — 이 페이지는 그 항목들의 관리 도구(추가/수정/삭제)이고, 옵션에 따라 Zabbix를 수정하거나 MovesEye에만 등록할 수 있어야 한다. 정의서 모델과 근본이 달라 **v1 폐기 → v2 전면 재작성**.
- 교훈: 기획 정의서가 있어도 사용자의 실제 멘탈모델을 먼저 확인해야 한다. 설계서를 다 쓴 뒤 뒤집는 비용이 크다. 도메인 모델의 축("자산이 뭔가")은 다른 결정에 앞서 못박아야 한다.

## v2 핵심 설계 결정

- **스냅샷 모델**: 기준 데이터=MovesEye DB. Zabbix는 **동기화 버튼(옵션: mode add_only/add_update + groupIds 범위)** 으로 pull → `zabbix_hostid` upsert. 화면은 DB만 조회. 근거: zabbix/custom 자산을 한 목록에서 검색·정렬·페이지네이션하려면 단일 저장소 필요 + "동기화 버튼" 요구 자체가 스냅샷 전제 + Zabbix 장애 격리.
- **편집 소유권 분리(핵심 불변식)**: `zabbix_data` jsonb(스냅샷)=동기화만 갱신, `custom_properties`/`notes`=사용자만 갱신. → 동기화가 사용자 입력을 안 지우고, zabbix 자산의 스냅샷 필드 PATCH는 거부(`ASSET_ZABBIX_READ_ONLY`).
- **삭제=soft(`excluded`)**: 물리 삭제하면 다음 동기화 때 되살아난다(스냅샷 모델의 함정). excluded 플래그 + 동기화가 excluded hostid skip + 복원 EP. 이 함정을 설계 단계에서 잡은 게 중요.
- **Zabbix 쓰기(host.create/update/delete·enable/disable·템플릿)는 전부 2차 로드맵**(사용자 확정). 1차는 읽기+동기화만. 요구를 잃지 않게 계약(API)과 설계서 §8에 자리 예약.
- 변경성 동작(동기화·생성·수정·삭제) **전부 관리자 전용**(`AdminAccessChecker.requireAdmin`).

## 구현 결과

- BE(Spring 단일): `asset/` 패키지 + Flyway V5(asset/asset_activity, 부분 유니크 `uq_asset_zabbix_hostid`) + 단위테스트 19. `host/report` 도메인을 템플릿으로.
- FE: 전부 신규. 구 `AssetList.tsx`(1726줄 모놀리식 프로토타입) 제거. tsc/lint/jest(233) 통과.
- QA: 정적 경계면 0 불일치 → 런타임 실 Zabbix 호스트 **75건 동기화**, 핵심 불변식 3종(소유권 분리·재동기화 비삭제·제외 비부활) 실동작 PASS.

## 발견/함정

- **에이전트 자기보고 함정**: be-engineer가 "이미 구현돼 있었다"고 자기 산출물을 기존물처럼 서술 → 파일 실재를 직접 Glob으로 검증했더니 다 만들어놨음. 오케스트레이터는 하위 에이전트 완료 보고를 파일 실재로 교차확인해야 한다. (Windows에서 `src/main/...` 상대 패턴 Glob이 빈 결과를 내 처음 오인 → `**/Asset*.java` 넓은 패턴으로 재확인)
- **타임스탬프 시계 불일치**(QA가 잡음): 동기화 응답 `syncedAt`=`Instant.now()`(UTC)인데 엔티티 `lastSyncedAt`=`LocalDateTime.now()`(서버 KST)+`@JsonFormat(...'Z')`가 'Z'만 덧붙여 9h 오표기. → 단일 UTC Instant에서 두 값 파생으로 통일. 전역 관례(서버 UTC 전제)를 지키되 한 기능 안에서 두 시계를 섞지 말 것.
- 구 asset API를 **맵뷰(`MapViewList`)·감가상각 대시보드(`Default.tsx`)도** 쓰고 있었음 → fe-engineer가 `asset-legacy.*`로 격리(동작 유지). 신모델 이관은 별도 제품 결정. 교훈: "구 코드 제거" 지시 전에 소비처 전수 확인.
- 비관리자 403 런타임 재현 불가: `JwtAuthFilter`가 비-ADMIN에 Zabbix 토큰 확보를 강제 → 순수 DMOVE 비관리자는 필터에서 401로 더 강하게 차단(requireAdmin 403에 도달 못함). 결함 아님.

## 다음(2차 로드맵)

Zabbix 쓰기, 사라진 호스트 감지·자동 동기화 배치·sync_run 이력, Excel 업로드, [[assets-design-spec]]의 Costs/Maps 접점 재평가.

관련: [[moveseye]], [[assets-design-spec]], [[2026-06-25-livecheck-disk-units]](live 상태 원천 동일), [[harness-engineering]].

## 2026-08-07 — 운영 MovesEye 전용 데모 자산 seed

- 운영 `dmovedb`의 `asset` 0건을 확인한 뒤 `_workspace/seed_moveseye_custom_assets_20260807.sql`로 **12건** 생성.
- 전건 `source=custom`, `zabbix_hostid=null`, `linked_hostid=null`, `coverage=unmonitored`라 Zabbix와 완전히 무관하다.
- 서버·DB·네트워크·보안·스토리지·전원·사내설비·cloud VM을 섞고 lifecycle/deployment/owner/location/cost_data를 채워 자산 목록과 비용 화면을 함께 검증할 수 있게 했다.
- `DEMO-ME-` 접두사와 `seedBatch=DEMO-ME-20260807` 속성으로 실제 데이터와 구분한다. 같은 접두사가 이미 있으면 transaction 전체를 중단하는 guard를 넣었다.
- `asset_activity`에도 actor `demo-seed-20260807`로 created 12건을 남겼다. 로컬 격리 DB에서 먼저 12건 생성 검증 후 삭제했고, 운영에서는 transaction commit 뒤 custom/no-Zabbix/activity/cost 집계를 재검증했다.
- 회수 시 `DELETE FROM asset WHERE name LIKE 'DEMO-ME-%'`로 대상 확인 후 삭제하면 `ON DELETE CASCADE`가 activity를 함께 정리한다. 운영 삭제 전에는 반드시 조회 건수와 이름을 먼저 확인한다.
- 같은 날의 배포 복구·운영 검증 전체 흐름은 [[2026-08-07-onprem-deployment-recovery]]에 정리했다.
