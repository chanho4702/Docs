# E2E 런타임 검증 — 네트워크 맵(Network Maps)

> 검증자: functional-qa (실앱 기동·행위/E2E) · 2026-07-13 (초기 검증 + **2026-07-13 회귀 재검증**)
> 선행: `qa_network-maps.md`(integration-qa 정적 shape 통과) · 근거 `devdesign_network-maps.md` §4 · `contract_network-maps.md`
>
> **🟢 회귀 재검증 결과(be-engineer B1·B3 수정 + 코디네이터 B4 수정 후, BE :3000 최신코드 재기동): B1·B2·B3·B4 전부 FIXED 확인. 잠금 기능 무력화 없음.** (상세 §재검증)
> 환경: BE Spring `:3000`(기동돼 있던 인스턴스 재사용) · FE Vite `:5173`(기동돼 있던 인스턴스) · Vault `:8200`(unseal) · PostgreSQL `dmove@localhost:5432`
> 도구: 직접 HTTP(curl/python) + Playwright chromium-1223 헤드리스(`_workspace/node_modules`, FE 툴체인과 분리) · 실 Zabbix 데이터
> 계정: admin / <마스킹> (`x-visitor-id` 필수, 토큰 TTL 24h)

## 요약

- **핵심 흐름 대부분 PASS**: 메뉴/라우팅, 목록/생성/삭제, 작도 round-trip(위치·라벨·포트·색·이모지·그룹소속·viewport 전부 복원 + linkedHostids 서버 재추출), live 오버레이(실 Zabbix), 레이어링, 에러경로(NOT_FOUND/INVALID_DIAGRAM/TOO_LARGE/name blank), N1(isMain 키), Flyway V7 적용.
- **신규 발견 버그 4건**:
  - **B1 (BE, HIGH)** — PATCH/setMain 응답 `updatedAt`이 **stale**(flush 전 값) → **두 번째 연속 저장마다 false `NETMAP_CONFLICT`**. 에디터 저장 UX를 망가뜨림. 정적 QA의 F1보다 넓은 근본원인.
  - **B2 (FE, MEDIUM)** — integration-qa **F1 런타임 재현**([Set as main]→저장 conflict). 근본은 B1이라 FE 단독수정만으론 불충분.
  - **B3 (BE, LOW~MEDIUM)** — `created_by`/`updated_by` **항상 null**(목록 "Updated By"=`-`). 컨트롤러가 JWT username 클레임에 의존하나 토큰에 username 부재.
  - **B4 (FE, LOW)** — 목록/에디터 상단 **제목·breadcrumb i18n 깨짐**: `Key 'Network_map (En)' Returned An Object Instead Of String.`
- **제한**: 시나리오 9(비관리자 편집)는 dev 비관리자 계정 비밀번호 미상으로 런타임 토큰 미확보 → 정적/간접 확인만(PARTIAL).

---

## 🟢 회귀 재검증 (2026-07-13, 수정 반영 후)

be-engineer가 B1(`saveAndFlush`로 stale updatedAt 수정)·B3(actor를 JWT id→UserRepository 조회로 해석) 수정 + gradlew test 전체 통과, 코디네이터가 B4(locale `network_map.title` 추가) 수정. **BE :3000 기존 프로세스(pid 5204) 중지 후 최신 코드 bootRun 재기동**(JAVA_HOME=jdk-17, VAULT_TOKEN, .env 동일 셸 export, PORT=3000, SPRING_FLYWAY_ENABLED=false; "Started in 10.8s" 확인, DB 스키마 변경 없음). FE dev :5173 미변경. **판정은 API 응답·DOM 어서션(스크린샷 없음)**.

| ID | 재검증 항목 | 기대 | 실제 응답 발췌 | 판정 |
|---|---|---|---|---|
| **B1** | 같은 아키텍처 연속 저장 2회 | 2회째 false CONFLICT 없이 성공 | save#1 응답 updatedAt=`15:18:47.248` **==** 직후 GET=`15:18:47.248`(stale 해소) → save#2(base=save#1 응답값) = **SUCCESS** `updatedAt=15:18:48.939` | **FIXED** |
| **B2** | [Set as main] 직후 저장 | conflict 없이 성공 | setMain 응답 updatedAt=`50.615` **==** GET=`50.615`(non-stale) → save-after-setMain(base=setMain 응답값) = **SUCCESS** `updatedAt=52.280` | **FIXED** |
| **B3** | 응답/목록 updatedBy=실제 username | `admin` | create 응답 `createdBy=admin, updatedBy=admin`; 목록 `updatedBy='admin'`; save#2 `updatedBy='admin'` | **FIXED** |
| 잠금건재 | 오래된 base로 PATCH | 여전히 CONFLICT | 최초 base(수 회 쓰기 전 값)로 PATCH → **`NETMAP_CONFLICT`** (잠금 무력화 아님) | **PASS** |
| **B4** | breadcrumb/제목 정상 | 객체-에러 문자열 소멸 | breadcrumb DOM=`Home / Asset / Network Maps`, 제목=`Network Maps`, body에 "Returned An Object Instead Of String" **없음** | **FIXED** |

- 재현(B1): 로그인→`GET /{id}`(base 확보)→`PATCH {desc,baseUpdatedAt:base}`(save#1)→응답 updatedAt을 base로 `PATCH`(save#2). save#2 성공 + save#1 응답 updatedAt==GET이면 통과.
- 재현(B4): 브라우저 `/asset/network-map` 진입 후 `.page-header-breadcrumbs` innerText에 에러 문자열 부재 확인(`_netmap_b4check.mjs`).
- 참고: B4 KR 라벨("네트워크 맵")은 헤드리스에서 언어 토글이 전환되지 않아 EN "Network Maps"만 직접 확인(객체-에러 소멸이 핵심 수정 검증).
- 정리: 재검증 테스트 아키텍처(E2E-Regress) 삭제 → dev DB는 id=1만 잔존. **재기동한 BE :3000은 사용자 화면 확인용으로 그대로 유지.**

### B3 확장 재검증 — asset activity actor (공용 ActorResolver, 2026-07-13)
be-engineer가 actor 해석을 **공용 `ActorResolver`로 추출해 networkmap·asset 재사용**(전체 테스트 통과). BE :3000 최신코드 재기동 후 API로 확인:
- **asset**: `PATCH /assets/66 {"notes":"e2e-actor-check"}`(admin) → `GET /assets/66/activities` 최신 활동 `action=updated, actorType=user, actorName='admin'`(2026-07-13). 기존 3건(07-08 이력)은 actorName=null=수정 전 정상. notes는 `""`로 원복(활동 2건 추가는 허용 범위). → **FIXED**(asset activity actorName 실 username 기록).
- **networkmap 회귀 없음**: 신규 arch 생성 시 `createdBy='admin', updatedBy='admin'`, 목록 updatedBy='admin' 유지(임시 arch로 확인 후 삭제). 참고: 잔존 id=1 "ㅂㅈㄷ"의 updatedBy=null은 fix 이전 미수정 데이터라 정상(회귀 아님).

---

## 0. 기동·인증 흐름 · Flyway V7

| 단계 | 기대 | 실제 | 판정 |
|---|---|---|---|
| BE/FE/Vault 기동 | :3000, :5173, :8200 LISTEN | 전부 기동돼 있음(원 프로세스 재사용, 미변경) | PASS |
| Flyway V7 | dev DB에 network_architecture 생성 | `flyway_schema_history` version=7 "network architecture" success=t, installed_on **2026-07-13 13:51:11**(내 세션 이전 기동 시 적용). 테이블 컬럼 전건(diagram_json/linked_hostids **jsonb** 포함) + 부분유니크 인덱스 `uq_network_architecture_main` + `idx_network_architecture_updated_at` 존재 | PASS |
| 미인증 거부 | 토큰 없음 → 401 | `GET /network-architectures` 토큰 없음 → **401** | PASS |
| visitor-id 필수 | x-visitor-id 없음 → 401 | 토큰 있어도 x-visitor-id 없음 → **401** | PASS |
| 인증 통과 | 토큰+visitor-id → 200 | 로그인(admin) 토큰+visitor-id → **200**, 목록 반환 | PASS |

- 재현: `curl -X POST :3000/auth/login -H "x-visitor-id: qa" -d '{"username":"admin","password":"<마스킹>"}'` → token. 이후 `-H "Authorization: Bearer <t>" -H "x-visitor-id: qa"`.
- ⚠️ 운영 주의: 세션 저장소가 **사용자당 단일 활성 토큰**으로 보임 — 같은 admin 재로그인 시 이전 토큰이 401(INVALID_TOKEN)됨. 각 검증 배치에서 로그인+사용을 한 세션으로 묶어 수행함(브라우저 검증과 API 검증을 시간 분리).
- DB 확인: `psql -h localhost -U postgres -d dmove -c "SELECT version,description,success FROM flyway_schema_history WHERE version='7'"`.

---

## 시나리오 1 — 메뉴/라우팅 · PASS(제목 i18n은 B4)

| 단계 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 사이드메뉴 지도>네트워크 맵 | `/asset/network-map`로 이동(구 MapViewList 아님) | 목록 페이지 앵커 hrefs = `["/asset/network-map", ".../1", ".../2"]`. **mapview 앵커 없음** → 메뉴가 신규 화면으로 교체됨 | PASS |
| `/asset/mapview` 직접 접근 | 여전히 동작(라우트 존치) | 직접 이동 → 렌더됨(404 아님, MapViewList) | PASS |

- 라우트: `routes.tsx` L443-453(networkMap/networkMapEditor/mapview 각각 PageWrapper). 경로상수 `constants/routes.ts` L116-119.
- 참고: 브라우저 raw HTTP(`Invoke-WebRequest /sign-in`)는 404였으나 이는 SPA 폴백/헤더 이슈일 뿐, 실브라우저 SPA 라우팅은 정상.

---

## 시나리오 2 — 목록/생성/삭제 · PASS

| 단계 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 생성(UI) | 이름·설명 모달 → 생성 | "Create Architecture" 모달(Name/Description) → 제출 → **에디터 `/asset/network-map/4`로 이동**(`NetworkMapListPage` onCreated navigate) | PASS |
| 목록 표시 | "N nodes / M links"·수정자 | 신규 행 "E2E-UI-Created \| created via UI \| **0 nodes / 0 links** \| 2026-07-13 23:49:10 \| **-** \| Delete". main 아키텍처는 **★ Main 뱃지 + 최상단** | PASS(수정자 `-`는 B3) |
| 삭제(확인모달) | 확인 모달 → 물리삭제 | "Delete architecture — This permanently deletes the architecture. This cannot be undone." → Delete → 행 제거. API로도 삭제 후 GET=NETMAP_NOT_FOUND, 재삭제=NOT_FOUND(물리삭제 확인) | PASS |

- 증거: `e2e_netmap_11-create-modal.png`, `12-list-after-create.png`, `13-delete-confirm.png`, `14-after-delete.png`.
- API 재현: `POST /network-architectures {"name":"x"}` → `DELETE /network-architectures/{id}`(성공) → `GET`=NETMAP_NOT_FOUND.

---

## 시나리오 3 — 작도 round-trip(핵심) · PASS

에디터 id=2에 host 노드(실 Zabbix hostid 10703)+shape 노드+group 박스+엣지(라벨·포트)+색상+이모지+노드유형을 저장 후 새로고침·재조회.

| 요소 | 기대(저장값) | 재조회 복원값 | 판정 |
|---|---|---|---|
| group 박스 | DMZ, w/h 420×320, color #e0f7fa | 동일 복원(라벨/크기/색) | PASS |
| host 노드 | pos(40,70), parentId=g1, extent=parent, hostid=10703(data.hostid), label=Edge-Server, nodeType=server, color=#ffcc00, emoji=🖥️ | 전 필드 복원. **parentId/extent 보존**(그룹 소속) | PASS |
| shape 노드 | Firewall, nodeType=security, color=#ff5252, emoji=🛡️ | 복원 | PASS |
| 엣지 | uplink, sourcePort=eth0, targetPort=443, color=#3f51b5 | 라벨·양 포트·색 복원 | PASS |
| viewport | {x:10,y:20,zoom:1.1} | 복원 | PASS |
| linkedHostids(서버 재추출) | 클라이언트 미전송 | 서버가 diagram에서 **['10703'] 재추출** 저장(응답·상세) | PASS |
| emoji 무손실 | 🖥️=U+1F5A5 U+FE0F | 저장·재조회 코드포인트 **완전 일치**(콘솔 `???`는 표시 인코딩) | PASS |
| 시각 렌더 | 캔버스에 전부 표시 | `04-editor-roundtrip.png`: DMZ 배경 + Edge-Server(🖥️,금테,server) + Firewall(🛡️,빨강,security) + uplink 엣지 + eth0/443 포트 라벨. react-flow nodes=3, edges=1 | PASS |

- 증거: `e2e_netmap_04-editor-roundtrip.png`.
- 재현: `PATCH /network-architectures/2 {name, diagramJson:{nodes:[group,host(data.hostid),shape],edges:[{label,data:{sourcePort,targetPort,color}}],viewport}}` → `GET /network-architectures/2`로 필드 대조.

---

## 시나리오 4 — 낙관적 잠금 + F1 회귀 · 🔴 B1/B2 발견 (모달 UI 자체는 PASS)

### 모달/복구 동작 = PASS
- conflict 발생 시 모달 "Edited by another user" + **[Reload server version]/[Overwrite with mine]** 2버튼 정상(`07-save2-conflict.png`).
- **[Overwrite with mine]** 클릭 → 강제 저장 성공(모달 닫힘), 새로고침 시 로컬 변경 반영 확인 → 복구 경로 동작. PASS.
- 서버측 잠금 검증 로직 정상: 실제 stale base로 PATCH → NETMAP_CONFLICT(`assertNotConflict` L236-244, ISO 문자열 `.equals`).

### 🔴 B1 (BE, HIGH) — PATCH/setMain 응답 updatedAt이 stale → 두 번째 연속 저장마다 false NETMAP_CONFLICT
- **관측(API)**:
  - TEST A: `GET` updatedAt=`14:31:09.200` → 1.2s 후 `PATCH`(base=09.200) **응답** updatedAt=`14:31:09.200`(옛값) → 직후 `GET` 실제 persist=`14:31:56.984`. **응답 ≠ 실제 저장값**.
  - TEST B(FE 실제 흐름 재현): 저장#1 응답 updatedAt을 다음 base로 사용(계약 footgun#1대로) → **저장#2 = NETMAP_CONFLICT**(단일 사용자·동시편집 없음).
- **관측(브라우저)**: 에디터에서 이름 편집→[저장](성공, modal=null) → 다시 편집→[저장] → **conflict 모달**(`07-save2-conflict.png`). 즉 두 번째 저장마다 "다른 사용자가 수정함" 오탐.
- **근본원인**: `NetworkArchitectureService.update()` L104-106 및 `setMain()` L130-131 — `repository.save(entity)` 후 **flush 전에** `NetworkArchitectureDetailDto.from(entity)`로 응답 구성. `@UpdateTimestamp`는 commit flush 시점에 갱신되므로 `entity.getUpdatedAt()`은 findEntity 로드 시점의 **옛 값**을 반환 → 응답 updatedAt이 항상 한 저장만큼 뒤처짐. (`create()`는 INSERT 즉시 발생해 정상.)
- **영향**: 에디터에서 연속 저장·[Set as main] 직후 저장이 매번 conflict. 사용자는 매번 Overwrite를 눌러야 하거나 새로고침해야 함 → 핵심 저장 UX 파손.
- **수정 주체/제안(BE)**: `update()`·`setMain()`에서 `repository.saveAndFlush(entity)`(또는 flush 후 `entityManager.refresh`)로 **flush 후** DTO 구성 → 응답 updatedAt이 실제 persist 값과 일치. 위치: `NetworkArchitectureService.java` L105·L130.
- 재현 명령: 위 TEST A/B(로그인→GET→sleep 1.2→PATCH→GET 비교, 응답 updatedAt≠GET 이면 재현).

### 🔴 B2 (FE, MEDIUM) — F1 런타임 재현: [Set as main] 직후 저장 conflict
- 브라우저에서 [Set as main]→이름 편집→[저장] → **conflict 모달**(`09-f1-save-after-setmain.png`). integration-qa F1(`qa_network-maps.md` §4)이 런타임에서 재현됨(FAIL).
- **주의(정적 QA 제안 보정)**: integration-qa는 F1 수정으로 `handleSetMain`에 `setBaseUpdatedAt(res.updatedAt)` 추가를 제안했으나, **`res.updatedAt`도 stale(B1)**이므로 그것만으로는 여전히 conflict. **B1(BE) 수정이 선행**돼야 하며, 그 후 F1의 FE 수정(setMain 응답으로 base 재동기화)도 함께 적용해야 완전 해소. `NetworkMapEditorPage.tsx` handleSetMain(L490~).

---

## 시나리오 5 — N1(isMain 직렬화 키) · PASS

| 확인 | 실제 | 판정 |
|---|---|---|
| 목록/상세 JSON main 필드 키 | `"isMain":false`/`"isMain":true` — 키가 **`isMain`**(≠`main`). record Boolean 컴포넌트 직렬화 정상(is-접두 stripping 미적용) | PASS |
| UI Main 뱃지 | 목록에서 main 아키텍처에 **★ Main** 뱃지 + 최상단 정렬(`13-delete-confirm.png`) | PASS |

- 재현: `GET /network-architectures` 응답에 `"isMain"` grep.

---

## 시나리오 6 — live 오버레이 · PASS

| 단계 | 기대 | 실제 | 판정 |
|---|---|---|---|
| host 노드 상태 | 상태점 + Problem 뱃지(실 Zabbix) | Edge-Server(host 10703)에 **빨간 상태점 + 주황 "3" 뱃지**. API `GET /2/live` = `{hostid:10703, available:"unavailable", openProblemCount:3, worstSeverity:"3"}` | PASS |
| 도형 노드 | 무관(뱃지 없음) | Firewall(shape)에 상태점/뱃지 없음 | PASS |
| [상태 새로고침] | 재조회 동작 | 클릭 후 뱃지 유지, 오류 없음(`05-refresh-status.png`) | PASS |
| 호스트 0개 | 빈 배열 | `GET /1/live`(0 hosts) = `data:[]`(Zabbix 미호출) | PASS |

- 비고: admin은 `zabbixUserid:null`이나 live/host 검색은 BE 서비스 레벨 Zabbix 연결로 **실 데이터 13 호스트** 반환(`getLive` authToken null 폴백 정상 동작).
- 증거: `e2e_netmap_04-editor-roundtrip.png`(뱃지), `05-refresh-status.png`.

---

## 시나리오 7 — 레이어링(z-order) · PASS

- `04-editor-roundtrip.png`: DMZ 그룹박스(최하 배경) 위에 **엣지선·uplink 라벨·eth0/443 포트 라벨·자식 host 노드(Edge-Server)** 모두 가려지지 않고 표시. 엣지가 그룹 경계를 넘어가도 상위 레이어 유지.
- 판정: PASS(그룹=배경 컨테이너, 엣지/라벨/노드 상위 레이어 규약 준수).

---

## 시나리오 8 — 에러 경로 · PASS

| 케이스 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 없는 id 에디터 접근 | 안내(크래시 없음) | `/asset/network-map/999999` → "**Architecture not found.**" + [List] 버튼(`10-nonexistent-id.png`) | PASS |
| GET/PATCH 없는 id | NETMAP_NOT_FOUND | 둘 다 `errorCode:NETMAP_NOT_FOUND`(HTTP 200 + code 400) | PASS |
| host 노드 hostid 누락 | INVALID_DIAGRAM | `NETMAP_INVALID_DIAGRAM` | PASS |
| 잘못된 node type("router") | INVALID_DIAGRAM | `NETMAP_INVALID_DIAGRAM` | PASS |
| nodes 배열 누락 | INVALID_DIAGRAM | `NETMAP_INVALID_DIAGRAM` | PASS |
| 1MB 초과 diagram | TOO_LARGE | >1.1MB PATCH → `NETMAP_TOO_LARGE`(**재현 성공**, 생략 안 함) | PASS |
| 생성 name blank | code 400 + errorCode 없음 | `{status:error, code:400, message:"name is required"}` | PASS |

---

## 시나리오 9 — 권한(전 사용자 편집) · PARTIAL

- 컨트롤러 `NetworkArchitectureController` L31-33: **requireAdmin 미적용** 명시(의도된 예외). 전 EP `@CurrentUser`만 요구.
- admin(ADMIN)으로 생성/수정/삭제/main **전 변경성 EP 200**(어디서도 403 미발생) 확인.
- **비관리자 런타임 미검증(제한)**: dev 비관리자 계정(demouser/guest/andy 등)의 비밀번호가 미상(zabbix 연동 계정은 dev DB password NULL — be CLAUDE.md §8)이라 비관리자 토큰 확보 실패 → 비관리자 편집을 실제 토큰으로 재현하지 못함. 코드/거동상 role 검사가 전혀 없어 임의 인증 사용자면 통과하는 구조는 확인됨. 진짜 비관리자 토큰 검증이 필요하면 별도 계정 자격증명 필요.

---

## 신규 발견 버그(수정 요망) 정리

| ID | 심각도 | 주체 | 요약 | 위치 | 상태 |
|---|---|---|---|---|---|
| **B1** | HIGH | BE | PATCH/setMain 응답 updatedAt이 stale(flush 전) → 두 번째 연속 저장·setMain 직후 저장마다 false NETMAP_CONFLICT. `saveAndFlush`로 수정 | `NetworkArchitectureService.java` update/setMain | **🟢 FIXED**(재검증: 연속 저장 성공, 응답==persist) |
| **B2** | MEDIUM | FE→(근본 BE) | F1 런타임 재현([Set as main]→저장 conflict). 근본은 B1(응답 stale) | setMain 응답 stale(B1) | **🟢 FIXED**(재검증: setMain 직후 저장 성공) |
| **B3** | LOW~MED | BE | created_by/updated_by 항상 null — 컨트롤러가 `currentUser.getUsername()` 사용하나 admin JWT payload에 username 부재. actor를 JWT id→UserRepository 조회로 해석해 수정 | `NetworkArchitectureController`/actor 해석 | **🟢 FIXED**(재검증: createdBy/updatedBy=`admin`) |
| **B4** | LOW | FE | 목록/에디터 상단 제목·breadcrumb i18n 깨짐: "Key 'Network_map (En)'..." — `network_map.title` 리프 부재로 객체 반환. locale title 추가로 수정 | `hooks/useBreadcrumbs.tsx` + locales `network_map.title` | **🟢 FIXED**(재검증: breadcrumb=`Network Maps`, 에러 문자열 소멸) |

> 4건 전부 초기 검증에서 발견 → 수정 → 회귀 재검증 통과(§회귀 재검증). 낙관적 잠금 자체는 건재(오래된 base → NETMAP_CONFLICT 유지).

- B3/B4는 앱 전역 성격(JWT payload·breadcrump 세그먼트 규약)이나 네트워크 맵 화면에서 사용자 눈에 띄게 발현.
- **shape 자체는 정합**(integration-qa 통과) — B1~B4는 전부 런타임 동작/표시 문제로 functional-qa 영역.

## 증거 파일(`_workspace/`)
- 스크린샷: `e2e_netmap_01-signin` ~ `15-after-overwrite`.png
- 재현 스크립트: `_netmap_e2e.mjs`(로그인/목록/메뉴/에디터), `_netmap_e2e2.mjs`(refresh/conflict/F1/badid), `_netmap_e2e3.mjs`(UI 생성/삭제/복구) — Playwright(`node _netmap_e2e*.mjs`, chromium-1223 executablePath 명시).

## 정리
- 검증 종료 후 테스트 아키텍처(E2E-*) 전건 삭제 → dev DB는 원상(id=1 "ㅂㅈㄷ", non-main)만 잔존.
- 원래 떠 있던 BE(:3000)·FE(:5173)·Vault·PostgreSQL 프로세스는 건드리지 않음(Playwright 브라우저는 각 스크립트 종료 시 close).
