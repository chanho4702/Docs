# E2E — Geo Maps(지리 맵) 런타임 행위 검증

> 검증자: functional-qa · 일자: 2026-07-15 · 방식: **실 앱 기동 런타임 검증**(BE Spring :3000 + FE Vite :5174 + 실 dev DB/Zabbix)
> 기준: `contract_geo-maps.md`(9 EP) · `devdesign_geo-maps.md`(§0 결정·§4 처리안) · 정적 QA `qa_geo-maps.md`(CLEAN)
> 결론: **API 26/26 PASS · UI 11/11 실질 PASS**(UI 1건은 어서션 오판, 재확인 PASS). 동작 버그 0. **단, 선결 데이터 이슈 1건(MEDIUM) 발견**.

---

## 0. 선결 조건 처리(적용·데이터·원복)

| 항목 | 처리 | 상태 |
|---|---|---|
| **V8 마이그레이션** | dev DB(dmove@localhost:5432)에 `V8__geo_cluster.sql`을 psql로 직접 실행(멱등 `IF NOT EXISTS`). `geo_cluster` 테이블 + `uq_geo_cluster_main`(부분 유니크) + `idx_geo_cluster_updated_at` 생성 확인. | ✅ 적용(존치 — 스키마) |
| **좌표 보유 호스트** | dev `asset`에 인벤토리 좌표(location_lat/lon) 보유 자산 **7건 실재**(주입 불필요): Fortigate 100D/TEST(37.505954,127.056107 — **동일좌표**), DMOVE-KR(37,127)/JP(35,139)/SG(1.3,104)/AU(-37,144), Zabbix server(56.95,24.22). | ✅ 실데이터 사용 |
| **linked_hostid 주입** | ⚠️ 좌표는 있으나 **전 자산 `linked_hostid`가 NULL**이라 geomap이 후보를 못 뽑는 상태(아래 이슈 F1). 검증 위해 `UPDATE asset SET linked_hostid = zabbix_hostid`(75건, `AssetSyncService`가 하는 것과 동일) 주입 → 검증 → **NULL로 원복 완료**(75건 전부 NULL 재확인). 실 Zabbix 인벤토리는 미변경. | ✅ 주입 후 원복 |
| **BE 기동** | 포트 3000에 **구버전 Spring(geomap 미포함, api-docs에 geo-cluster 0건)** 이 이미 떠 있어 종료 후, 현재 코드로 재기동(`_start_spring_3000.ps1`, JDK17, FLYWAY=false). api-docs에 geo-clusters 6경로(9EP) 로드 확인. | ✅ → 검증 후 종료 |
| **FE 기동** | `npm run dev` — 5173 점유로 **5174**에 기동(Vite auto-increment). | ✅ → 검증 후 종료 |

**서버 종료 확인**: port3000=DOWN(사용자 의도대로 off 복귀), port5174=DOWN(내 FE). 기존 5173 프로세스는 내가 안 띄웠으므로 존치.

---

## 1. API 런타임 검증 (26/26 PASS) — `_geomap_e2e_api.mjs`

로그인(admin/<마스킹> + x-visitor-id) → 토큰으로 9 EP 실호출.

| 시나리오 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 인증 가드 | 토큰無→401, visitor-id無→401 | 둘 다 401 | ✅ |
| #1 목록(랜딩) | plain 배열, 빈 상태 OK | `status=success` data=`[]` (count 0) | ✅ |
| #9 host-candidates | plain 배열, 좌표유무 플래그 | total=74, withCoord=7, noCoord=67 | ✅ |
| #9 좌표 호스트 lat/lng | number | 7건 전부 lat/lng number(Fortigate 37.505954,127.056107 등) | ✅ |
| #9 무좌표 후보 | lat/lng=null, hasCoordinate=false | 67건 전부 null+false | ✅ |
| #9 keyword 필터 | ILIKE 부분일치 | `keyword=Fortigate`→2건(100D, 100D TEST)만 | ✅ |
| #3 생성 | name trim, 빈 문서 | id 발급, name 앞뒤공백 제거, linked=[], resolved=[] | ✅ |
| #3 @NotBlank | 공백 name 거부 | HTTP200 + code400 "name is required" | ✅ |
| #4 상세(빈) | hosts=0, 기본 viewport | hosts=0, viewport={127,37.5,zoom6} | ✅ |
| #5 저장(좌표 4호스트) | 성공, linkedHostids 서버 재추출 | linked=["10663","10721","10686","10682"] hostCount4 linkCount1 | ✅ |
| #5 resolvedHosts | 멤버별 좌표/이름/hasCoordinate | 4건 전부 좌표+이름 해석 | ✅ |
| #5 freeform 왕복 | link color/lineStyle/bogusField, viewport bearing/pitch, host custom 보존 | 전부 보존(bogusField=42, bearing15/pitch30, custom=keepme) | ✅ |
| #5 낙관적 잠금 | stale base→GEOMAP_CONFLICT | errorCode=GEOMAP_CONFLICT | ✅ |
| #5 연속 저장 | fresh base 재사용 시 false conflict 없음 | 성공(saveAndFlush 효과) | ✅ |
| #5 좌표 불변식 | 무좌표 hostid 포함→GEOMAP_HOST_NO_COORDINATE + data.hostids | errorCode 일치, `data.hostids=["10703"]`(위반만, 유좌표 제외) | ✅ |
| #5 INVALID_DIAGRAM | hostid 없는 host 원소 | errorCode=GEOMAP_INVALID_DIAGRAM | ✅ |
| #7 main 지정 | isMain=true | true | ✅ |
| #1 정렬/집계 | main 최상단, centroid/카운트 | 대상 id 첫번째+isMain, centroid={36.75,130.03} hostCount4 linkCount1 | ✅ |
| #8 상세 host live | hostid별 available/problem/severity | 4건, KR=available/28문제/s5, JP=available/7문제/s5, Fortigate=unknown/2문제/s4 (실 Zabbix) | ✅ |
| #2 overview live | 클러스터별 worst/open | worst=5, open=37(멤버 합산) | ✅ |
| #4/#6 NOT_FOUND | 없는 id | GET·DELETE 모두 GEOMAP_NOT_FOUND | ✅ |
| #6 삭제+목록 갱신 | 물리삭제 후 목록에서 사라짐 | data=null, 목록 미포함 | ✅ |

**핵심 근거**: live 오버레이가 실 Zabbix에서 실제 problem 수를 가져옴(KR 28건 sev5, JP 7건 sev5) → BE↔Zabbix 왕복·집계 정상. 좌표 불변식이 위반 hostid만 정확히 골라 data.hostids로 반환.

---

## 2. UI 런타임 검증 (11/11 실질 PASS) — `_geomap_e2e_ui.mjs` + 핀 probe

| 시나리오 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 로그인(UI) | 진입 | /asset/list 랜딩 | ✅ |
| 메뉴 '지리 맵'(D3) | geoMap 라우트 연결 | SideNav `<Link to={geoMap}>` 소스 확인 + /asset/geo-map 직접 진입 정상 | ✅ |
| 클러스터링 랜딩 | OpenFreeMap 지도 로드 | `.maplibregl-canvas` 렌더(타일 서버 200 도달) | ✅ |
| 클러스터 핀/목록 | 저장 클러스터 표시 | 마커 렌더 + 이름 노출 | ✅ |
| 상세 지도+핀 | 좌표 렌더 | canvas + 마커 3개(4호스트→3핀) | ✅ |
| **동일좌표 집계 핀** | 같은 좌표 2호스트→핀1개 count=2 | **PIN0 count=2**(색#E97659=sev4), PIN1 count=1(sev5,badge28), PIN2 count=1(sev5,badge7) | ✅ (아래 주1) |
| severity 색/Problem 뱃지 | worst severity 색 + 오픈 문제 뱃지 | 핀 색이 worst severity와 일치(sev4 오렌지/sev5 레드), 뱃지=집계 문제수(2/28/7) — API live와 정확히 일치 | ✅ |
| Severity/Display 필터·Edit | 존재 | 상세에 필터·편집 컨트롤 렌더 | ✅ |
| 핀 클릭→상세 패널 | Problems/Hosts/Assets 팝업 | 핀 클릭 시 패널 노출(호스트/자산 키워드) | ✅ |
| 편집기 Element Palette | 호스트 검색 | 팔레트+검색 입력 렌더, "Fortigate" 검색→후보 노출 | ✅ |
| 없는 id UX | 크래시 없음 | pageErrors=0, not-found 처리 | ✅ |

**주1 (어서션 오판 정정)**: 최초 UI 런에서 marker.textContent가 `"22"/"128"/"17"`로 나와 단순 문자열 비교가 실패로 찍혔으나, 이는 count(원 중앙)와 problem 뱃지 텍스트가 이어붙은 것. leaf 노드+bg색 분해 재확인 결과 **count=2/1/1, badge=2/28/7**로 동일좌표 집계·severity 색이 모두 정상. 실제 버그 아님.

---

## 3. 발견 이슈

### F1 (MEDIUM · 데이터/운영 · 주체=운영/be) — dev DB `linked_hostid` 전건 NULL로 geomap이 빈 껍데기
- **현상**: dev `asset` 75건 전부 `linked_hostid`가 NULL(반면 `zabbix_hostid`는 75건 채워짐, 좌표도 7건 존재). geomap의 후보 검색(#9)·좌표 해석(#4 resolvedHosts)·저장 불변식(#5)이 **모두 `linked_hostid` 기준**(`GeoCoordinateResolver`·`AssetRepository.searchGeoCandidates`)이라, **원복된 현 상태에서 geomap은 후보 0건·배치 불가**.
- **원인**: `AssetSyncService`는 생성/업데이트 양쪽에서 `linkedHostid = hostid`를 채우지만(코드 확인), 현 dev 스냅샷은 그 로직 도입 **이전 동기화 상태**라 값이 비어 있음. **코드 버그 아님 — 스냅샷 노후화**.
- **영향**: 자산 재동기화 없이 geomap 기능을 켜면 사용자에게 "배치할 호스트가 없다"로 보임(실제로는 좌표 보유 호스트 7건 존재).
- **권장 조치**: 배포 전 **자산 동기화 1회 실행**(`linked_hostid`가 `zabbix_hostid`로 채워짐). 코드 수정 불필요. (검증에서는 동일 UPDATE를 임시 주입해 전 흐름 정상 확인 후 원복.)
- **대안 검토**: 만약 재동기화 운영이 곤란하면 `GeoCoordinateResolver`/후보 쿼리를 `linked_hostid` COALESCE `zabbix_hostid`로 완화하는 방안이 있으나, 설계상 custom 자산 연결을 고려한 `linked_hostid`가 정본이므로 **재동기화가 정석**. → 오케스트레이터 판단.

그 외 동작 버그(HIGH/MEDIUM) 없음. 정적 QA의 CLEAN 판정과 일관.

---

## 4. 검증 못 한 부분(정직 보고)
- **호스트그룹 일괄 추가 "N개 추가 M개 제외" 요약**(설계 §4): API #9의 groupId 필터 자체는 동작(무좌표 후보 반환 확인)했으나, FE 편집기에서 그룹 추가 시 좌표 없는 멤버 스킵 요약 토스트의 실제 렌더는 특정 groupId 시나리오까지 클릭 구동하지 않음(팔레트 검색·개별 추가는 확인). 로직은 순수헬퍼 단위테스트 영역(정적 QA 커버).
- **낙관적 잠금 conflict의 FE Alert 배너 UI**: API 레벨 GEOMAP_CONFLICT 발생은 확인, 화면 배너 노출은 미구동(2세션 동시편집 시뮬레이션 미수행).
- 그 외 9 EP·핵심 3화면·집계·live·에러 5종은 런타임 확인 완료.

## 5. 산출/근거 파일
- 스크립트: `_workspace/_geomap_e2e_api.mjs`(API 26), `_geomap_e2e_ui.mjs`(UI 11), `_geomap_pin_probe2.mjs`(핀 집계 분해)
- 스크린샷(시각 판정 필요분만): `e2e_geomap_01-clustering.png`~`06-notfound.png`
- 시드/정리: `_geomap_seed.mjs`, `_geomap_cleanup.mjs`
