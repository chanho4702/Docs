# M8 프론트엔드 구현 보고

## 구현

- `PortfolioTopology`의 스페이스 노드 클릭 시 `getPortfolioSpaceIssues`를 온디맨드로 호출한다.
- `spaceKey:null`은 resolver를 호출하지 않고 조회 불가 안내만 표시한다.
- 성공 응답은 `invoke(...).content`에서 직접 소비한다.
  - `{ projectId, spaceKey, hourRate, scanned, truncated, orderedByTimeSpent, issues }`
- 이슈 목록은 기존 `IssueComponent`로 Jira 이슈를 열고, 상태·담당자·실적/계획 MD를 표시한다.
- 300건 절단 및 작업시간 정렬 폴백을 화면에 안내한다.
- 인력/프로젝트 노드 크기가 투입 공수(MD)임을 명시하고, 스페이스 노드 크기는 이슈 수로 구분했다.

## Query key / i18n

- `portfolioKeys.spaceIssues(projectId, spaceKey)` 추가 및 factory 계약 테스트 추가.
- `locales/kr/portfolio.json`, `locales/en/portfolio.json`에 M8 원천 번역 추가.
- `npm run merge` 실행 완료 (`ko-KR.json`, `en-US.json` 생성 반영).

## 검증

- `npm test -- --runInBand src/utils/queryKey/queryKeyFactories.test.js` 통과 (3 tests).
- `npm run build` 통과. 기존 의존성 source-map 누락 경고 3건은 있으나 빌드 성공 및 bundle budget 통과.

## 후속 보완 — 사람 계층 제거

- 토폴로지를 `프로젝트 → 스페이스 → 상태`로 축소했다. 사람 노드, 사람-프로젝트 edge, 사람 범례/툴팁/상한 배너를 제거했다.
- `buildPortfolioTopology`도 사람 집계 및 관련 반환 필드를 제거했으며, 해당 단위 테스트를 갱신했다.
- 이 차트에만 프로젝트 `14–48px`, 스페이스 `12–38px`, 상태 `12–34px`의 노드 크기를 적용했다.
- 공용 force 기본값을 바꾸지 않도록 선택적 `force` override를 추가하고, 이 차트에서만 `repulsion:300`, `edgeLength:[100,200]`, `gravity:0.04`를 사용했다.
- 상태는 Done(녹색 `#36B37E`), In Progress(황색 `#FFAB00`), To Do(청색 `#0052CC`) 범례 카테고리와 노드 색으로 명시적으로 구분했다.
- 상태 노드 클릭은 `getPortfolioSpaceIssues({ projectId, spaceKey, statusKey })`를 호출한다. 성공 DTO는 기존과 동일하게 `result.content`에서 소비한다.
- 반환 `issues[]`는 status→issue edge와 실제 이슈 노드로 전개한다. 이슈 노드 크기는 `actualMd` 전용 sizer(`10–28px`)를 쓰며, 클릭하면 `router.open(siteUrl/browse/{key})`로 Jira 이슈를 연다.
- 상태 조회 결과가 선택된 동안에는 스페이스 목록 패널 대신 그래프 전개 결과를 우선 표시한다. `spaceKey:null`도 프로젝트 전체 상태 조회 파라미터로 그대로 전송한다.
- `portfolioKeys.spaceIssues(projectId, spaceKey, statusKey)`로 상태별 캐시를 분리했다.
- 사람 계층 없이도 `Workforce(RMS) 프로젝트 → Jira 프로젝트(스페이스) → 상태 → 이슈` 경로를 범례·하단 안내·각 노드/상태→이슈 edge 툴팁에 명시했다. 이슈 노드 툴팁도 해당 Workforce(RMS) 프로젝트와 Jira 스페이스 문맥을 함께 표시한다.

## 최종 검증

- `npm run merge` 실행 완료.
- 관련 Jest 3 suite, 88 tests 통과.
- `npm run build` 통과. 기존 의존성 source-map 누락 경고 3건만 발생했고 bundle budget은 통과했다.

## Workforce 허브 보완

- 단일 `Workforce` 루트 노드를 추가해 모든 Workforce(RMS) 프로젝트를 먼저 연결했다. 최종 edge 체인은 `Workforce 허브 → RMS 프로젝트 → Jira 스페이스 → 상태 → 실제 이슈`이며, 스페이스 없는 legacy 집계는 `RMS 프로젝트 → 상태`를 유지한다.
- 사람 노드와 사람 edge는 재도입하지 않았다. 허브의 의미는 별도 범례 항목, 노드/edge 툴팁, 원천 locale 안내 문구에 명시했다.
- 이 차트에만 force override를 `repulsion: 220`, `edgeLength: [70, 150]`, `gravity: 0.12`, `curveness: 0.2`로 적용하고 높이는 `400–760px` 범위로 제한해 허브 중심의 밀도를 높였다. 기존 공용 기본값과 다른 graph 위젯에는 영향을 주지 않는다.
- 상태 클릭의 `done`/`inProgress`/`todo` 조회와 status→issue edge, `actualMd` 기반 이슈 노드 크기는 그대로 유지한다.
- 형태도 구분했다: Workforce 허브는 `roundRect`, RMS 프로젝트는 `rect`, Jira 프로젝트(스페이스)는 `triangle`, 상태는 `circle`, 실제 이슈는 `diamond` symbol을 사용한다.

## 이슈 클릭 URL 방어

- 그래프 이슈 노드는 이미지나 stylesheet URL을 사용하지 않는다. `issueTypeIconUrl`은 기존 스페이스 목록의 `<Image>`에만 전달되므로 graph click 경로와 분리되어 있다.
- `router.open` 전에 `siteUrl`과 issue key로 절대 `https?` Jira browse URL을 만드는 `toJiraBrowseUrl()`를 추가했다. 누락·상대·비정상 URL은 `null`로 막아 Custom UI 경로가 잘못 해석되지 않게 했다.
- 기존 목록의 `IssueComponent`/`ProjectComponent`도 같은 URL 정규화와 `Anchor` 기본 동작 취소를 적용했다. ECharts graph click은 anchor 기본 동작이 없는 canvas 이벤트여서 별도 `preventDefault()`가 필요하지 않다.
- `jiraIssueUrl.test.js`에서 정상 절대 URL, 잘못된 context URL 차단, issue key URL 인코딩을 검증했다.
- 재검증: 관련 Jest 4 suite, 91 tests 통과 및 `CI=true npm run build` 통과. 기존 의존성 source-map 경고 3건만 발생했다.

## 통합대시보드 계층 정정

- `PortfolioTopology`은 `Workforce 허브 → RMS 프로젝트 → 상태 → 실제 이슈`만 표시하도록 스페이스 노드, triangle 형태, 스페이스 클릭 목록과 그 resolver 소비를 제거했다.
- 상태 클릭은 `getPortfolioSpaceIssues({ projectId, spaceKey: null, statusKey })`만 호출하며, `result.content.issues`를 status→issue edge와 `actualMd` 크기의 diamond 이슈 노드로 전개한다.
- `buildPortfolioTopology`도 스페이스 계산 반환값을 제거하고 `projectStatusEdges`만 반환하도록 정리했으며, backend resolver는 변경하지 않았다.
