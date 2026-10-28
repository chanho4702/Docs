# Resource Allocation Graph — 프론트엔드 구현 리포트

> `02_backend_report.md` 의 실제 응답 shape 을 단일 진실로 소비. invoke `res.content` 접근 경로를 그대로 맞춤.

## 1. 소비한 응답 shape (백엔드 계약 준수)

`invoke('getResourceAllocationGraph', { includeClosed })` → **`res.content`** (`useResourceAllocation.js`):
- `projects[]`: `{ projectId, projectName, statusKey, statusName, statusColor, endDate, closed, memberCount }`
- `members[]`: `{ accountId, displayName, avatarUrl(48x48)|null, assignedCount, util|null, utilBand }`
- `links[]`: `{ projectId, accountId, roleKey|null, roleName|null }`
- `generatedAt`

- `res.success && res.content` 가드 후 `{ projects, members, links, generatedAt }` 반환. 실패 시 throw → isError.
- INNER JOIN 특성(배정 ≥1 프로젝트만 등장)에 맞춰 빈 상태(`projects/links` 0건)는 `resource.allocation.empty` 표기.
- `util` 은 tooltip 에서 `Math.round(util*100)%` 반올림 표기, null 은 `resource.util.none`.
- **상태·프로젝트 필터는 클라이언트 처리**(재조회 없음). `includeClosed` 만 서버 재조회(쿼리키 `resourceKeys.allocation({includeClosed})` 로 분리 캐시).

## 2. 신규/수정 파일

| 파일 | 변경 |
|------|------|
| `utils/queryKey/resourceKeys.js` | `allocation(params)` 팩토리 추가 |
| `pages/resource/allocation/useResourceAllocation.js` | **신규** — invoke → res.content, `enabled: canRead`, staleTime 5m |
| `pages/resource/allocation/allocationGraphOption.js` | **신규** — ECharts graph option 빌더 + 엣지 팔레트/해시 + tooltip formatter |
| `pages/resource/allocation/AllocationGraph.jsx` | **신규** — `echarts-for-react` graph, avatar CSP 프로브, onEvents click → 드로어 |
| `pages/resource/allocation/AllocationFilters.jsx` | **신규** — 상태/프로젝트 다중선택(@atlaskit/select isMulti) + 종료포함 토글 |
| `pages/resource/allocation/AllocationTab.jsx` | **신규** — 클라이언트 필터 오케스트레이션 + ResourceProfileDrawer 재사용 |
| `pages/resource/ResourcePage.jsx` | 로컬 Tabs 3번째 탭 "배정 현황" 추가(수정) |
| `locales/kr/resource.json`·`locales/en/resource.json` | `tab.allocation` + `allocation.*` 키 추가 |

- 쿼리키 팩토리 사용. 재사용: `ResourceProfileDrawer`(담당자 노드 클릭), `UserAvatar` 패턴(드로어 헤더), `useColorMode`(다크), `useI18nStore`.
- 권한: 페이지 상단 `canRead('RESOURCE_MANAGEMENT')` 게이트 그대로. 드로어 스킬편집은 기존 `canWrite` 전달. 신규 쓰기 없음. **Overview/Match 탭·resource-profile 컴포넌트 회귀 없음(탭 추가만).**

## 3. ECharts graph 구현 요점

- **레이아웃**: `series.layout:'none'` 수동 이분 배치 — 프로젝트 노드 x=100(좌), 담당자 노드 x=600(우), y = index*46. 컨테이너 높이 = `max(프로젝트수, 담당자수)*46 + 80`(최소 360) 동적. `roam:true`(팬/줌).
- **엣지/프로젝트 색 = projectId 결정적 팔레트**: `projectColor(projectId)` = 문자열 안정 해시(`hashString`) → `PROJECT_PALETTE`(DMOVE 틸 #21ADAD 포함 16색) 인덱스. **리스트 순서·필터와 무관하게 프로젝트별 색 고정**(설계 §4.3). 엣지 `lineStyle.color`·프로젝트 노드색 동일 매핑.
- **중복 배정 강조**: `assignedCount>=2` → 노드 크기 확대(`30 + min((n-1)*6, 24)`) + 빨강 테두리(#E34935, width 3) + 라벨에 `(n)` 병기.
- **호버**: `emphasis:{ focus:'adjacency' }`(연결 강조) + tooltip `formatter` 분기 — 담당자 노드(배정 프로젝트 목록·역할·가동율/밴드), 프로젝트 노드(상태·팀원 수), 엣지(프로젝트 — 담당자 (역할)). tooltip HTML 은 `esc()`로 이스케이프.
- **노드 클릭**: `onEvents.click` 에서 `dataType==='node' && id.startsWith('m:')` → `onMemberClick(accountId)` → `ResourceProfileDrawer` 오픈(accountId 전달).

## 4. Avatar image symbol CSP fallback 처리

- 담당자 노드 심볼: `avatarUrl` 존재 & **로드 성공 확인** 시 `image://{avatarUrl}`, 아니면 `circle`(accountId 결정적 색 `memberColor`).
- **CSP 대비 프로브**: `AllocationGraph` 에서 각 `avatarUrl` 을 `new Image()` 로 사전 로드 시도 → `onload` 성공분만 `avatarOkSet` 에 누적, 옵션 재빌드 시 그 URL 만 image symbol 로 승격. `onerror`(CSP 차단/404)면 circle 유지. **초기 렌더는 circle → 확인된 것만 아바타로 승격**이라 깨진 이미지 심볼이 뜨지 않음.
- **주의(리포트 명시)**: Forge iframe CSP 에서 Jira avatar CDN 로드가 차단되면 전부 circle 로 남는다. `image://` 실제 로드 가부는 **코드로 확인 불가 → 배포 후 E2E 확인 필요**. fallback(circle + accountId 색 + 이름 라벨)이 항상 동작하므로 그래프 식별성은 보장됨. (설계의 "이니셜 심볼"은 ECharts symbol 이 중앙 텍스트를 직접 못 그려, circle 색 + 오른쪽 이름 라벨로 대체 — 노드 data 에 `_initial` 보유해 후속 커스텀 렌더 확장 가능.)

## 5. i18n 신규 키 + merge 실행 여부 — **실행 완료**

- 추가 위치: `locales/kr·en/resource.json`. 신규: `tab.allocation`, `allocation.{title,description,filter.*,tooltip.*,node.overload,empty,legend.*}`.
- `cd static/ui && npm run merge` 실행 → `ko-KR.json`/`en-US.json` 재생성, 산출물에서 키 kr·en 전수 확인. `ko-KR.json`/`en-US.json` **직접 수정 안 함**. util 밴드 라벨은 기존 `resource.band.*`/`resource.util.*` 재사용.

## 6. 빌드/테스트 결과

- `cd static/ui && CI=true npm run build` → **성공(Compiled)**. 잔여 경고는 사전 존재 3rd-party source-map(`@atlaskit/analytics-next-stable-react-context`, `marklassian`) **2건뿐** — 빌드 로그 라인 단위 확인, 신규/수정 파일발 eslint/컴파일 경고 **없음**.
- `cd static/ui && CI=true npm test` → **8 suites / 74 tests 전부 통과**(회귀 없음).

## 7. 검증자 유의

- 담당자 노드 클릭 → `ResourceProfileDrawer`(resource-profile 산출물) 그대로 재사용. `fallbackPerson` 은 member 로부터 `{accountId, displayName, avatarUrls:{'24x24':avatarUrl}}` 구성(드로어 헤더 즉시 표기용), 나머지는 profile 로드가 채움.
- 필터 상호작용: 상태 다중선택 변경 시, 통과 못한 프로젝트 선택은 자동 정리. 프로젝트 옵션은 상태 필터 통과분으로 좁힘. 연결 없는 member 노드는 그래프에서 제외(클라이언트 필터).
- statusKey null 프로젝트는 `'__none__'` 키로 그룹핑(옵션/필터 일관).
