---
name: network-maps-design
description: "네트워크 맵(2026-07-13 설계+구현 완료) — draw.io식 자체 아키텍처 작도 도구(React Flow), Zabbix 맵 동기화 아님, 편집=모든 사용자(예외), V7 문서형 jsonb, E2E 회귀 전건 통과"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8c2d203c-480c-4c2a-a87f-a4300c252bf7
---

2026-07-13 네트워크 맵 기능 **설계+구현 완료**(fullstack-feature 1패스 + QA 클로즈드 루프). 설계 정본 `devdesign_network-maps.md`, 계약 `features/maps/network-maps/contract_network-maps.md`, QA `qa_network-maps.md`+`e2e_network-maps.md` (모두 `C:\solutions\_workspace\`).

**✅ 구현 결과(2026-07-13)**:
- BE: Flyway V7 적용(dev DB 확인) + `networkmap/` 패키지 + API 7개, 테스트 31건. :3000 최신 코드로 재기동됨.
- FE: `@xyflow/react` v12, 목록+에디터(팔레트: 검색→**호스트그룹 필터**→호스트 목록 / 캔버스 / 속성 패널), 커스텀 노드 3종+PortEdge, 색상(`data.color`)·이모지·**호스트 노드에도 유형/이모지 지정**, 그룹 박스는 zIndex -1 최하층(포트 라벨 가림 수정), live 오버레이. `NETMAP_QUERY_KEY` 격리.
- FE 확장(같은 날 사용자 피드백 연쇄): **스텐실 카탈로그 45종**(6카테고리 emoji+라벨, 클라이언트 5종은 팔레트 노출, 라벨 비었을 때만 자동 입력), 그룹 검정 테두리 제거(색 연동, RF 기본 스타일 override), 그룹 라벨 더블클릭 인라인 편집, **자유 텍스트 노드 = shape+`variant:"text"`**(BE type 3종 고정 우회), 도형 리사이즈(dirty는 `resizing:true`만), **뷰(기본·읽기전용)/편집 모드 분리**.
- **노드 유형 6종을 스텐실 카테고리와 통일**(마지막 변경): `server/database/cloud/network/security/etc` → **client/network/server/data/monitoring/cicd**(`TNetworkShapeType`=`TStencilCategory` 단일 타입). 기본 이모지 👤🌐🖥️🗄️📈🚀. 구 값 하위호환: `normalizeShapeType`이 deserialize 시 정규화(server→server, database→data, cloud→server, security→network, etc→server, 미지 값→server 폴백). 최종 **35 suites/291 tests**.
- QA 클로즈드 루프로 수정된 버그: **B1 — `repository.save()` 후 flush 전에 DTO 생성하면 @UpdateTimestamp 미반영 stale updatedAt이 응답에 실려 연속 저장마다 false CONFLICT → `saveAndFlush()` 필수(낙관적 잠금 구현 시 재발 주의 패턴)**; B3 — actor는 JWT id→UserRepository 조회로 해석(username 클레임 없음); B4 — 중첩 i18n 네임스페이스는 `{키}.title` leaf 필수(useBreadcrumbs가 경로 세그먼트→키 변환). 회귀 재검증 전건 🟢, 진짜 conflict 잠금은 건재 확인.

**✅ 파생 수정(같은 날)**: asset_activity.actor_name null도 동일 수정 — **공용 `ActorResolver`**(auth.security, username 클레임 우선→JWT id로 UserRepository 조회)를 추출해 networkmap·asset 양쪽 재사용. 런타임 확인: asset 활동 actorName='admin', networkmap createdBy/updatedBy='admin'. 기존 null 행은 백필 안 함(fix 이전 데이터는 null 정상).
**잔여**: FE lockfile 동기화 install 1회(dev 서버 종료 후), 비관리자 실토큰 런타임 검증 PARTIAL(코드상 requireAdmin 부재 확인됨), MapViewList 실제 흡수는 Geo Maps 단계([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--nav-restructure-2026-07-13|nav-restructure-2026-07-13]]). antd deprecated 경고 중 addonAfter 2곳은 선재 코드(미조치, destroyOnClose/disabledAlpha 2건은 신규 코드라 수정함).

**✅ 커밋됨(2026-07-13, 미푸시)**: BE `moveseye-be-spring` 브랜치 `ZM-69`에 커밋 `2f411a5`(자산관리+네트워크맵+전수감사 수정 전체, 51파일). FE `moveseyee_fe`는 master에서 신규 브랜치 **`ZM-70`** 생성해 커밋 `418a99b`(46파일, 노드 유형 통일 포함). 푸시는 사용자가 직접 수행 예정.

**✅ 개선 2차(2026-07-14, 미커밋)** — 사용자 요청 6종(FE 5 + BE 1). 정적검증 전건 통과, **시각 E2E는 사용자 직접 확인**(claude-in-chrome 확장 미연결+admin 평문비번 미보유로 QA는 DB실데이터+단위테스트+실Zabbix조회 계층까지만):
- FE: ①노드 `data.description` 필드(host/shape/group, 속성패널 TextArea+호버표시 host=Popover·shape/group=Tooltip, text변형 제외) ②**host 노드 호버 메타 Popover**(`useHostHoverDetail` lazy fetch `GET /hosts/detail/{hostid}`, staleTime 60s, OS·IP·그룹·위치·uptime·가용성·장애수) ③shape/group 크기 W/H InputNumber(`patchNodeSize`가 width/height+style 동시갱신) ④엣지 `data.description`+PortEdge 호버툴팁 ⑤**엣지 화살표 방향** none/forward/backward/both(`edgeMarkers.ts` 매핑, markerStart/markerEnd를 엣지 top-level에, PortEdge가 둘다 BaseEdge에 전달) ⑥**뷰 모드 Handle 숨김**(`{editable && <Handle/>}`, editable=`NetmapNodeActionsContext.editing`).
- **버그 수정(중요)**: `diagram.ts` `deserializeEdges`가 **markerEnd/markerStart를 재로드 시 복원 안 하던 잠재버그** — 새로 그은 화살표는 보이나 저장→재로드하면 사라짐. serialize에 markerStart 보존 + deserialize에 둘다 복원 추가. 화살표 방향 4종 round-trip 확보(단위테스트 커버).
- **BE uptime 소스 수정**: `HostService.detail` uptime이 `system.hw.uptime`(이 Zabbix 전 호스트 lastvalue=0/부재)만 읽어 **항상 공백**이던 문제 → `system.hw.uptime` 0/부재면 **`system.uptime` 폴백**(`ZabbixItemKey.SYSTEM_UPTIME` 추가, `Optional.or`). 초 단위 그대로. `parseLongOrNull`이 0→null 접어 순수 개선(회귀 없음). 단 첫수집 전/폴링안됨 호스트는 여전히 null(FE `formatUptimeShort`가 0/null이면 uptime 행 숨김). 링크된 host 10639/10737은 system.uptime도 0이라 그 노드엔 여전히 안 뜰 수 있음.

**교훈:** 네트워크맵 노드/엣지 커스텀 필드는 diagram_json **freeform passthrough**라 추가에 BE 스키마 변경 불필요 — 단, **직렬화 보존은 별개**다. diagram.ts serialize/deserialize **양쪽** 모두에 필드를 명시해야 round-trip 됨(marker가 deserialize 누락으로 유실됐던 게 증거). 신규 노드/엣지 필드 추가 시 이 두 함수 동시 점검 필수.

**✅ 개선 3차(2026-07-14, 미커밋·시각검증 대기)** — 사용자 연쇄 요청. 전부 FE(정적검증 통과, jest 76건). 커밋 전 브라우저 확인 대기(사용자 선택): (a) **4방향 양방향 연결** — ReactFlow `ConnectionMode.Loose` + 공용 `NodeHandles`(4방향 top/right/bottom/left, id 부여, 전부 type=source라도 loose라 양방향), onConnect에 자기연결(source===target) 가드. (b) **엣지 선 옵션 2종** — 실선/점선(`data.lineStyle`, PortEdge strokeDasharray "6 4"), 직선/꺾은선(`data.routing` step|straight, getStraightPath vs getSmoothStepPath). "선이 사선으로 꺾임"은 버그 아니라 getSmoothStepPath가 handle 방향 따라 라우팅하는 특성(옆면 연결점 쓰면 비스듬)—아래점→위점 연결하면 수직. (c) **도형 유형 자유입력** — nodeType Select→AutoComplete(프리셋6종+자유텍스트), `normalizeShapeType`이 미지값을 server로 뭉개던 걸 원문 보존으로 수정(`LEGACY_SHAPE_TYPE_MAP[value] ?? value`, 빈/비문자열만 server), nodeType 타입 `TNetworkShapeType | (string & {})`로 완화, NETMAP_SHAPE_DEFAULT_EMOJI Record<string,string>. (d) **노드 배경색+투명도** — `data.backgroundColor`(host/shape, group 제외), 전용 BackgroundColorField(ColorPicker disabledAlpha 없음→alpha 슬라이더), `color.toHexString()`으로 #RRGGBBAA 저장, content는 `backgroundColor ?? netmapColorTint(...)`(틴트 우회·투명도 보존), onClear=undefined(기본 틴트)와 alpha0(#RRGGBB00 진짜투명) 구분. 기존 테두리색(color)은 #RRGGBB 유지. (e) **host(서버) 노드 크기조절** — HostNode에 NodeResizer+속성패널 NodeSizeFields(기존 shape/group만이었음), HostNodeContent를 width/height 100%로. (f) **노드 정렬 8종** — 순수모듈 `align.ts`(computeAlignment), 공용 `nodeSize.ts`(readNodeSize 추출), `NetworkMapAlignToolbar`(Panel top-center, 편집모드만), 다중선택 selectedNodeIds 추적, 최상위 노드만(parentId 자식 제외), 정렬6종 2개+/분배2종 3개+ 활성. 주의: host는 measured 의존이라 측정 전 정렬 시 width 0 위험. (g) **복사/붙여넣기**(Ctrl+C/V) — 순수모듈 `clipboard.ts`(cloneSelection: 새 id·+16px 오프셋·연속붙여넣기 배수·parentId 재매핑·양끝 모두 선택된 엣지만 재배선), 편집모드 keydown, 입력필드(INPUT/TEXTAREA/contentEditable) 포커스 시 미가로챔. 내부 클립보드(같은 세션만). ※(f)정렬 에이전트가 완료 후 범위 벗어나 (g)를 자발 구현 → 사용자가 "유지" 결정. (h) **z-order 레이어순서** — 순수 `zorder.ts`(computeZOrder, 두 계층: 일반노드 zIndex>=0 / 그룹 zIndex<=-1로 항상 배경 유지, 그룹끼리만 재배치), 속성패널 host/shape/group 전부에 버튼4종(맨앞/앞/뒤/맨뒤), zIndex는 diagram.ts 이미 왕복보존(그룹 -1 폴백은 저장값 있으면 미적용). (i) **자동저장** — `NETMAP_AUTOSAVE_INTERVAL_MS`(10s→**60s로 변경**), 편집모드&&dirty&&!saving&&!autosavePaused일 때만 tick 저장(persist 재사용, silent 옵션), 성공 시 baseUpdatedAt갱신+lastSavedAt+"자동 저장됨" 토스트(1.5s)+TopBar "저장됨·HH:mm:ss", conflict 시 모달 대신 Alert 배너(새로고침/덮어쓰기)+autosavePaused. 수동저장 모달은 유지. (j) **노드추가 화면중앙 배치** — defaultPosition(랜덤)→centerPosition(wrapperRef 중앙→screenToFlowPosition), 그룹은 크기보정. DnD 드롭은 기존 위치. (k) **Ctrl+Z undo/redo** — 순수 `history.ts`(past/present/future, 깊이50, serialize로 스냅샷 정규화→selected/dragging 노이즈 제거, lodash isEqual)+`useNetworkMapHistory` 훅, 커밋=400ms debounce(동작단위), applyingRef 가드(undo적용이 재커밋 안되게), flushPending(undo직전 미커밋 확정), applyDetail서 resetBaseline, 단축키 Ctrl/Cmd+Z/Shift+Z/Y(입력필드 가드 복붙과 공유), TopBar undo/redo 버튼. 최종 jest 15 suites/134 tests.

**⚠️ 함정(2026-07-14 회귀·수정): RF Handle을 조건부 렌더하면 연결선이 안 나온다.** 뷰 모드 연결점 숨김을 `{editable && <Handle/>}`로 구현했더니 편집 전환 후 **선을 아예 못 그음** — 노드가 Handle 없이 먼저 마운트되면 React Flow가 handle bounds를 "없음"으로 등록하고, 나중에 Handle을 DOM에 추가해도 `updateNodeInternals` 없이는 RF가 인식 못 함. **해결: Handle은 항상 렌더하고 뷰 모드에선 CSS(`opacity:0`+`pointerEvents:none`)로만 숨긴다** — 공용 `handleVisibilityStyle(editable)`(nodeActions.tsx). 부차적으로, 편집 모드에서 노드 호버 Popover/Tooltip이 켜져 있으면 target Handle 드롭(연결 완성)을 오버레이가 가로채므로 **호버 툴팁은 뷰 모드에서만** 켠다(편집 중 정보는 속성 패널). 둘 다 커밋 전 수정 완료(HostNode/ShapeNode/GroupNode).

**사용자 확정 결정 (핵심 — 다음 세션이 뒤집으면 안 됨)**:
- **모니터링 뷰가 아니라 draw.io식 작도 도구** — 아키텍처 생성 → 캔버스에서 호스트 배치·연결·박스·라벨·포트 표시·노드유형(server/db/cloud…)·이모지. 에디터가 본체라 1차에 에디터 포함.
- **자체 맵 빌더** (Zabbix sysmap 동기화 채택 안 함 — 내가 추천했으나 사용자가 자체 빌더 선택).
- 상태 오버레이(호스트 노드 가용성 점 + Problem 수)는 1차 경량 포함.
- **편집 권한 = 모든 인증 사용자** — 기존 "변경성=관리자" 규칙의 의도된 예외(다이어그램=문서 성격). created_by/updated_by 기록 + `baseUpdatedAt` 낙관적 잠금(NETMAP_CONFLICT).
- 캔버스 = **React Flow `@xyflow/react` v12** 신규 의존성(미설치 확인됨). ECharts 아님.

**설계 골자**: Flyway **V7** `network_architecture` 단일 테이블, diagram_json jsonb 문서형(정규화 node/link 테이블 안 폐기), linked_hostids는 서버 재추출 캐시, is_main 부분 유니크. API 7개(`/network-architectures`), live는 자산 resolveLive 패턴(트랜잭션 밖 Zabbix). FE는 `/asset/network-map`(목록)+`/asset/network-map/:id`(에디터), 메뉴 "네트워크 맵" 슬롯을 MapViewList에서 교체(MapViewList 거취 미결).

**Why:** 설계 대화에서 방향이 두 번 좁혀짐(동기화 추천→거부→자체 빌더, 조회 우선→에디터가 본체로 정정). 다음 세션이 개요 문서(apply_design §3.1의 3테이블 안)나 Zabbix 동기화로 착수하면 안 됨. **How to apply:** 구현 착수 시 devdesign_network-maps.md를 정본으로 fullstack-feature 실행. §8 5건 전부 확정됨(2026-07-13): MapViewList=Geo Maps로 흡수(1차는 메뉴만 이탈·라우트 존치, 실제 흡수는 Geo Maps 단계), 호스트 중복 배치 허용, 이름 유니크 미강제, 이모지 피커 경량 그리드, 크기 상한 1MB. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--assets-core-devdesign|assets-core-devdesign]](메뉴·live 패턴 공유).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

네트워크 맵 — 2026-07-13 설계+구현+커밋 완료. draw.io식 작도 도구(React Flow), V7 jsonb 문서형, API 7개, 편집=모든 사용자(예외), 스텐실 45종·노드유형 6종 통일, E2E 회귀 전건 통과. 교훈: 낙관적 잠금은 saveAndFlush 필수. 파생 수정: 공용 ActorResolver로 asset_activity actor null도 해소. BE ZM-69/FE ZM-70에 커밋(미푸시). 2026-07-14 개선2차(미커밋): 노드/엣지 description·host호버메타·크기숫자입력·화살표방향·뷰모드Handle숨김+BE uptime폴백. 교훈: 커스텀 필드는 freeform이나 diagram.ts serialize/deserialize 양쪽 보존 필수(marker round-trip 버그)
