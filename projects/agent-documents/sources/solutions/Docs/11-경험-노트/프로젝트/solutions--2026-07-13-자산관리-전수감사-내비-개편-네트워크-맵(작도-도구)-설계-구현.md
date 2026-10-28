# 2026-07-13 — 자산관리 전수감사 → 내비 개편 → 네트워크 맵(작도 도구) 설계+구현

[[projects/moveseye/moveseye|moveseye]] 하루 세션 요약. 자산관리 기능 감사·수정 → 내비게이션 재편 → 네트워크 맵 신규 기능(설계→구현→QA 클로즈드 루프→회귀 재검증→git 커밋)까지 한 세션에서 완주.

## 1. 자산관리(assets-core) 전수감사 + 수정

BE·FE·계약 3갈래 병렬 감사(be-engineer/fe-engineer/integration-qa 동시 스폰) → HIGH 0, MEDIUM 4건 발견 → 전부 같은 날 수정 + 재검증 PASS.

- **계약 문서 drift**: `contract_assets-core.md`가 v1(pre-V6)에 머물러 실제 구현(summary 8필드·list 20필드 등 V6 확장)을 반영 못 함 — 코드는 정합했으나 문서만 뒤처짐. v2로 재산출.
- **offset 페이지네이션 버그**: `PageRequest.of(offset/limit, limit)` 정수 나눗셈으로 offset이 limit 배수로 내림됨(`limit=20,offset=25`→실제 20). `OffsetBasedPageRequest` 신규 작성으로 해결 — **같은 버그가 `ReportManagementService`에도 있어 함께 수정**(감사 담당자가 스스로 파생 발견·보고).
- **트랜잭션 안 Zabbix 외부 호출**: 동기화·상세조회가 DB 트랜잭션을 잡은 채 Zabbix HTTP 왕복 → 커넥션 풀 점유 리스크. sync는 `TransactionTemplate`으로 "조회 밖/upsert만 안"으로 분리, getDetail은 애초에 lazy 연관이 없어 `@Transactional` 제거만으로 충분.
- **레거시 쿼리키 공유**: 구 `MapViewList`가 신규 자산 훅과 같은 react-query 키를 써서 캐시 교차오염 위험 → `ASSET_LEGACY_QUERY_KEY` 네임스페이스 분리.

상세: `_workspace/audit_assets-full-2026-07-13.md`, 메모리 [[assets-core-devdesign]].

## 2. 내비게이션 개편

- 대시보드 메뉴·라우트·페이지 완전 삭제, 랜딩(`/`)과 로그인 후 이동을 `/asset/list`로 변경.
- 자산 메뉴를 "자산 관리"(목록/비용/지도)로 재편, 지도 하위에 네트워크 맵·지리 맵 2단.
- 비용은 독립 화면이 없어 플레이스홀더로 연결(향후 정식 구현 대상).

상세: 메모리 [[nav-restructure-2026-07-13]].

## 3. 네트워크 맵 — draw.io식 아키텍처 작도 도구 (신규 기능)

### 무엇을 만들었나
모니터링 뷰가 아니라 **에디터가 본체**인 네트워크 아키텍처 작도 도구. 아키텍처 생성 → React Flow 캔버스에서 호스트 배치(팔레트: 검색→호스트그룹 필터→목록)·연결(엣지+포트 라벨)·그룹 박스·자유 텍스트·색상·이모지 지정. 호스트 노드에는 실 Zabbix 상태점+Problem 뱃지 오버레이.

- BE: Flyway V7 `network_architecture` 단일 테이블, **diagram_json jsonb 문서형**(정규화 node/link 테이블 안 폐기 — 자유 작도 도구는 노드를 SQL로 질의할 일이 없고 React Flow 직렬화와 1:1). API 7개, `linked_hostids`는 서버 재추출 캐시.
- 편집 권한 = **모든 인증 사용자**(이 제품 "변경성=관리자" 규칙의 의도된 예외 — 다이어그램은 문서 성격) + `baseUpdatedAt` 낙관적 잠금.
- FE 최종 상태: 스텐실 카탈로그 45종(클라이언트/네트워크/서버·플랫폼/데이터/모니터링/CI-CD), 노드 유형 6종을 카테고리와 통일, 도형 리사이즈, 그룹 라벨 인라인 편집, 뷰/편집 모드 분리. 35 suites / 291 tests.

### 설계 과정 교훈
- 사용자 의도가 대화 중 두 번 좁혀짐: Zabbix sysmap 동기화 추천 → 거부(자체 빌더), "조회 우선" 선택 → 실은 에디터가 본체. **선택지 답변만 믿지 말고 서술형 클래리파이가 방향을 뒤집을 수 있다.**
- "검색은 호스트 그룹 선택 앞에 둬줘"를 "그룹 필터가 없으니 변경 불필요"로 종결했다가 지적받음 — **전제(그룹 필터의 존재)가 요구사항 자체**였다. 위치 지시에 담긴 존재 전제를 읽을 것.
- 기능 하나를 붙박이로 완성하지 않고 **화면을 보면서 이터레이션하는 방식**이 잘 맞았다: 도형 지정→포트 z-order→색상→스텐실 카탈로그→그룹 테두리→자유 텍스트→리사이즈→뷰/편집 모드→유형 재분류로 10차례 가까이 이어졌고, 매번 구현 담당 에이전트를 SendMessage로 재개(같은 컨텍스트 유지)해 재탐색 비용 없이 처리됨.

### 기술 교훈
- **낙관적 잠금 + `@UpdateTimestamp`는 `saveAndFlush()` 필수**: `save()` 후 flush 전에 응답 DTO를 만들면 stale updatedAt이 나가고, 클라이언트가 그걸 다음 base로 쓰면 연속 저장마다 false conflict. 단위테스트(Mockito)로는 안 잡히고 런타임 E2E에서만 드러남.
- JWT payload에 username 클레임이 없으면 `currentUser.getUsername()`은 조용히 null — actor 기록은 id→UserRepository 조회로. 같은 원인의 `asset_activity.actor_name` null도 **공용 `ActorResolver`(auth.security) 추출로 같은 날 함께 수정**(중복 구현 대신 공용화, 기존 null 행은 백필 안 함).
- BE 검증기가 노드 타입을 3종(host/shape/group)으로 고정해두면, 신규 요소(자유 텍스트)는 새 타입을 추가하지 말고 **기존 타입의 freeform data 변형**(`shape`+`data.variant="text"`)으로 우회 — BE 재작업 없이 FE만으로 확장 가능.
- React Flow 에디터: 그룹(parent) 노드는 기본 zIndex가 엣지보다 높아 포트 라벨을 가림 → `zIndex:-1`(배경층)로 낮추고 `elevateNodesOnSelect={false}`. 그룹 기본 테두리(#1a192b)도 라이브러리 기본값이라 명시적으로 override 필요.
- 노드 유형(enum) 분류를 나중에 갈아엎을 때는, 저장된 구 값에 대한 **정규화 함수(normalizeShapeType)를 deserialize 경로에 심어** 하위 호환 — 크래시 없이 자동 마이그레이션.
- FE i18n: `useBreadcrumbs`가 경로 세그먼트→키 변환하므로 **중첩 네임스페이스에는 `{키}.title` leaf 필수**(없으면 "returned an object" 경고). 3단 경로 상세 페이지는 이름 로드 후 `replacePathBreadcrumb`로 Skeleton을 치환하는 게 이 앱 관례(HostGroupDetail 패턴) — 신규 페이지 만들 때 빠뜨리기 쉬움.
- `moveseyee_fe`의 jest 툴체인이 devDependencies 미등록이라 `yarn add`가 통째 프루닝하는 부채 발견 → 정식 등록으로 해결(exact pin, `--legacy-peer-deps` 필요, `npm test` 스크립트도 신설).

### 운영 교훈
- **QA 스크린샷 최소화** 사용자 지시 → `functional-qa` 에이전트 정의+`fullstack-feature` 스킬에 반영: 판정은 API 응답·DOM 어서션, 스크린샷은 시각 판정이 불가피한 항목(레이어 겹침·색상)에만 최소로. 습관적 "증거용" 캡처 금지.
- QA 담당 에이전트가 **스코프 밖 파생 버그를 발견하면 즉시 보고**하게 하니(리포트 offset 버그, asset actor null) 그 자리에서 바로 승인받아 함께 해소할 수 있었다 — 별도 티켓으로 묻히지 않음.

## 산출물
- `_workspace/`: `devdesign_network-maps.md`(설계 정본) · `contract_network-maps.md` · `qa_network-maps.md` · `e2e_network-maps.md` · `audit_assets-full-2026-07-13.md`
- git: BE `moveseye-be-spring`(브랜치 ZM-69, 커밋 `2f411a5`) / FE `moveseyee_fe`(신규 브랜치 **ZM-70**, 커밋 `418a99b`) — **둘 다 미푸시**, 사용자가 직접 푸시 예정.

## 2026-08-10 — 운영 demo map seed

운영에 네트워크 맵 2개를 seed하고 실제 홈·상세에서 5개 zone, live badge, port label, edge style, minimap 렌더를 확인했다. 상세 데이터와 검증·회수 절차는 [[projects/moveseye/2026-08-10-demo-map-seed|2026-08-10-demo-map-seed]] 참조.
