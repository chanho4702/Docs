# UI 일관성 진단 리포트

- 조사일: 2026-08-05 / 브랜치 `develop`
- 대상: `static/ui/src` 전체 (jsx 290개, css 18개)
- 결정된 방향: **Atlaskit 네이티브 순수** — 자체 비주얼 언어를 만들지 않고 Atlaskit 토큰·컴포넌트에 100% 수렴한다.

> ## ✅ P0~P3 완료 (2026-08-05) — RFC-178 커밋 6개
>
> | 항목 | 진단 시점 | 현재 |
> |---|---|---|
> | 페이지 셸 패턴 | 6가지 | **1가지** (`PageContainer`/`PageHeader`) |
> | 생 `<h1>~<h6>` 태그 | 8곳 (레벨 뒤섞임) | **0곳** (Atlaskit `Heading`) |
> | 색 표기법 | 3종 혼재 | **1종** (`token()` / CSS는 `var(--ds-*)`) |
> | `var(--ds-*)` 직접 참조(JS) | 148회 | **0회** |
> | 하드코딩 hex | 899건¹ | **397건** (대부분 손댈 수 없는 것 — 아래 참조) |
> | 차트 팔레트 | 4벌 | **1벌** (`constants/chartPalette.js`) |
> | `fontSize` 단계 | 14단계 / 스케일 밖 154건 | **6단계** / 스케일 밖 2건 |
> | 로딩 표현 | 스피너 41곳 | **0곳** (스켈레톤 + shimmer 바) |
> | 배지 동명이인 | `StatusBadge` 3개 | **0개** |
> | 빈 상태 표현 | 4가지 방식 | **1가지** (공용 `EmptyState`) |
> | CSS 다크 분기 블록 | 라이트/다크 hex 이중 관리 | **87블록 삭제** (토큰이 대신함) |
>
> ¹ 초기 리포트의 "1,328건"은 `token('x', '#hex')`의 **정상 폴백까지 센 수치**였다.
> 폴백을 제외한 실제 하드코딩이 899건이었고, 지금은 397건이다.
>
> **남은 397건은 대부분 고칠 수 없거나 고치면 안 되는 것이다:**
> `gantt.css`(46)·`FullCalendar.css`(26)는 서드파티 오버라이드,
> `chartPalette.js`(24)·`colorOption.js`(21)는 팔레트 정의 자체,
> 나머지 다수는 **ECharts canvas 색**(canvas는 CSS 변수를 해석하지 못한다).
>
> 이후 작업(P4 마감 다듬기)은 수치로 진단할 영역이 아니라 실제 화면을 보며 판단한다.

---

## 0. 한 줄 요약

디자인 감각의 문제가 아니라 **스타일 결정 지점이 216개 파일에 흩어져 있는** 구조의 문제다.
Atlaskit이라는 디자인 시스템이 이미 설치돼 있는데도 대부분의 화면이 그것을 우회하고 매번 새로 정하고 있다.

| 지표 | 수치 | 비고 |
|---|---|---|
| 인라인 `style={{}}` | **1,357회 / 216파일** | 전체 jsx의 74% |
| 하드코딩 hex 색상 | **1,328회 / 194파일** | |
| Atlaskit `token()` | 536회 / 89파일 | 채택률 31% |
| `var(--ds-*)` 직접 참조 | 148회 / 31파일 | 세 번째 표기법 |
| `xcss` 사용 | 40파일 | 14% |
| `@atlaskit/heading` 사용 | **3파일** | 1% — 설치돼 있으나 사실상 미사용 |
| 페이지 전용 CSS 파일 | 18개 / 3,028줄 | |

---

## 1. 페이지 셸 — 최소 6가지 패턴이 공존

> **✅ 완료** — `PageContainer`/`PageHeader` 신설, 17개 라우트 전부 적용. 생 `<h>` 태그 0곳.


같은 앱인데 화면을 옮길 때마다 제목 크기·상단 여백·설명문 위치가 달라진다. 통일성이 없다고
느껴지는 체감의 **가장 큰 원인**이다.

| 패턴 | 사용처 | 형태 |
|---|---|---|
| A. `<Backoffice subtitle description>` | 백오피스 7개 페이지 | ✅ **유일하게 통일된 영역** |
| B. `<PageContainer>` | `ProjectPage` **1곳뿐** | 공용 컴포넌트인데 사실상 사장됨 |
| C. `<Box xcss={paddingBlockStart:'space.200'}>` + `<div className="xxx-page">` | Cost / Progress / Gantt | 프로젝트 상세 일부 |
| D. `<div style={{padding:'4px 4px 24px'}}>` + `<h3>` | `ResourcePage` | |
| E. `<><Stack space="space.300">` (제목 없음) | `WorklogPage`, `MyPage` | |
| F. 생 Fragment + 인라인 flex | `ProjectDetailPage`, `PortfolioDashboardPage` | |

### 제목(heading) 레벨이 화면마다 다름

```
components/layout/PageContainer.jsx:16   <h2>            ← 공용 컨테이너
pages/resource/ResourcePage.jsx:41       <h3>
pages/portfolio/PortfolioHeader.jsx:42   <h1 fontSize:22>
pages/projectDetail/issue/…Panel.jsx:198 <h2>
…Table.jsx:169 / …Table.jsx:560          <h4>
backoffice/page/Backoffice.jsx:37        <h3>
```

생 `<h1>~<h4>` 태그가 8곳에 흩어져 있고, `@atlaskit/heading`은 290개 파일 중 **3개**에서만 쓰인다.
나머지 페이지는 제목이 아예 없거나 `<div>` + `fontSize`로 흉내낸다.

**부수 효과**: heading 레벨 뒤섞임은 스크린리더 문서 구조도 깨뜨린다(접근성 회귀).

---

## 2. 색상 — 표기법 3종 × 팔레트 4벌

> **✅ 완료** — `var(--ds-*)` 152건 → `token()`. 팔레트 4벌 → `chartPalette.js` 1벌.
> CSS 8개 파일 토큰화(다크 분기 87블록 삭제). `assignment/theme.js`(브랜드 틸)는 참조 0건이라 삭제.


### 2-1. 같은 색을 세 가지 방식으로 쓴다

```jsx
// A. Portfolio
color: token("color.text.subtle", "#5E6C84")
// B. Resource
color: 'var(--ds-text-subtle, #5E6C84)'
// C. 다수
color: '#5E6C84'
```

셋 다 같은 값을 노리지만, C는 **다크모드에서 그대로 남는다**. 하드코딩 1,328회의 상당수가 여기 해당한다.

### 2-2. 팔레트 소스가 서로 다른 세대로 4벌

| 파일 | 색 계열 | 세대 |
|---|---|---|
| `constants/colorOption.js` | `#0052CC` `#00875A` `#DE350B` | 구 ADG3 팔레트 (21종) |
| `constants/dashboardColorPalette.js` | `#4C9AFF` `#36B37E` `#FF5630` | 다른 세대 (8종) |
| `utils/echartsTheme.js` | `#579DFF` `#4BCE97` `#F5CD47` | 신형 토큰 계열 (다크 전용) |
| `pages/resource/assignment/theme.js` | `#21ADAD` 틸 스케일 | 디무브 브랜드 |
| `constants/statusColorMap.js` | `token()` 매핑 | ✅ 유일하게 토큰 기반 |

차트 비중이 큰 앱인데 **같은 의미의 "진행 중"이 화면마다 다른 파랑**으로 그려진다.
Atlaskit 네이티브로 가기로 한 이상 `assignment/theme.js`의 브랜드 틸도 정리 대상이다.

---

## 3. 타이포 — fontSize 매직넘버 453회, 12단계

> **✅ 완료** — 스케일 밖 154건을 인접 단계로 흡수(13→12 등). 14단계 → 6단계.
> 남은 2건은 의도적 제외(서드파티 gantt 22px, ECharts 도넛 중앙 40px).


```
10px:  30회      15px:   5회      22px:  2회
11px: 142회      16px:  11회      24px:  1회
12px: 130회      18px:   2회      40px:  1회
13px:  93회      20px:   5회
14px:  31회
```

Atlaskit 타이포 스케일은 11/12/14/16/20/24로 정해져 있는데 **10·13·15·18·22가 섞여 있다**.
특히 13px(93회)은 Atlaskit에 없는 크기다. 화면마다 본문 크기가 미묘하게 다른 이유다.

---

## 4. 컴포넌트 중복

### 4-1. 상태 배지 5종

> **✅ 완료** — 개수보다 **이름이 문제**였다. `StatusBadge` 동명이인 3개(공용/resource/로컬)를 해소하고
> `DateTag`의 중복 구현을 `StatusTag` 래퍼로 바꿨다. 역할이 다른 것(사용자 색 vs 의미)은 합치지 않았다.


| 파일 | 줄수 | 색 소스 | 비고 |
|---|---|---|---|
| `components/lozenge/StatusBadge.jsx` | 67 | `token()` + accent 매핑 | Portfolio에서 공용 승격 |
| `components/lozenge/StatusLozenge.jsx` | 86 | `token()` + `COLOR_OPTIONS` | 아이콘 포함 |
| `components/lozenge/StatusTag.jsx` | 32 | `COLOR_OPTIONS` | `fontSize:'14px'` 고정 |
| `components/lozenge/DateTag.jsx` | 28 | `COLOR_OPTIONS` | StatusTag + 캘린더 아이콘 |
| `pages/resource/StatusBadge.jsx` | 34 | `var(--ds-*)` | **이름까지 중복** |

`pages/resource/StatusBadge.jsx`의 주석 "`@atlaskit/lozenge` 미설치 환경용"은 **사실**이다 —
package.json에 `@atlaskit/lozenge`가 없다. 5종을 합치기 전에 이 패키지 추가 여부를 먼저 정해야 한다.

### 4-2. 카드/패널 래퍼가 페이지마다 자체 정의

> **✅ 완료(부분)** — 진단의 "7종"이 부정확했다. `Summary`는 KPI 타일, `EchartPanel`은 위젯 셸로 역할이 다르다.
> 실제 중복은 전체화면 오버레이 40줄 × 3개 → `CardFullscreen`으로 추출.
> ChartCard는 접기·인라인편집 등 커스텀 대시보드 전용 기능이 있어 통합하지 않았다.


`components/card/Card.jsx`, `components/card/Summary.jsx`, `components/chart/layout/ChartCard.jsx`,
`pages/portfolio/widgets/WidgetCard.jsx`, `pages/resource/teamAnalytics/TeamChartFrame.jsx`,
`components/chart/echart/EchartPanel.jsx`, `backoffice/page/user/UserPage.jsx`의 로컬 `StatCard`
— 모두 "테두리 + 라운드 + 패딩 + 제목" 이라는 같은 일을 서로 다른 값으로 한다.

### 4-3. 비(非)Atlaskit 아이콘 — 유니코드 글리프 · 자체 도형

**전량 Atlaskit 아이콘으로 교체 대상** (사용자 지시, 2026-08-05).
`<svg>` 직접 작성은 다행히 **0건**이고, 문제는 유니코드 문자와 CSS 원형 도형이다.

> **✅ 완료** — (a) 9개 지점 중 8개 교체 + 관련 CSS 3블록 정리.
> (b) 차트 툴팁 `●` 7곳은 P1에서 원형 span(`tooltipMarker`)으로 처리 — ECharts 기본 마커와 같은 모양이라 줄이 정렬된다.
> `⋯` 2곳은 아이콘이 아니라 메뉴 라벨 말줄임표라 그대로 뒀다.
> **UI 렌더 유니코드 글리프 0건.**

#### (a) 유니코드 글리프 — UI에 실제 렌더되는 것 (주석·테스트 제외)

| # | 위치 | 글리프 | 용도 | Atlaskit 대체 |
|---|---|---|---|---|
| 1 | `portfolio/widgets/PortfolioTsrSignalTable.jsx:189` | `▲` `■` `●` | **신호등**(red/amber/green) — 지적된 항목 | `status-error` / `status-warning` / `status-success` |
| 2 | `analysisReport/issue/IssueAnalysisTable.jsx:63` | `▲` `▼` `●` | 편차 증감 화살표 | `arrow-up` / `arrow-down` / `status-success` |
| 3 | `dashboard/modal/AddChartModal.jsx:132` | `✓` | 선택 완료 배지 | `check-mark` 또는 `check-circle` |
| 4 | `backoffice/…/LevelQuickAddModal.jsx:89` | `✓` | 중복 존재 표시 | `check-circle` |
| 5 | `backoffice/…/RoleQuickAddModal.jsx:89` | `✓` | 〃 | 〃 |
| 6 | `backoffice/…/SkillQuickAddModal.jsx:79` | `✓` | 〃 | 〃 |
| 7 | `issue/subscription/SubscriptionEditForm.jsx:123` | `✕` | 닫기 버튼 | `cross` 또는 `close` |
| 8 | `issue/subscription/SubscriptionForm.jsx:111` | `▾` `▸` | 고급옵션 펼침 토글 | `chevron-down` / `chevron-right` |
| 9 | `gantt/GanttChart.jsx:599, 656` | `⋯` | 버튼 라벨 접미사 | 텍스트 `...` 유지 가능(아이콘 아님) |

위 대체 아이콘은 **전부 `@atlaskit/icon/core`에 실재함을 확인**했다.

#### (b) 차트 툴팁의 `●` — 교체 불가, 별도 처리 필요 ⚠

| 위치 | 개수 |
|---|---|
| `analysisReport/issue/IssueAnalysisChart.jsx:95~109` | 4곳 |
| `progress/ProgressSCurve.jsx:62~64` | 3곳 |

```js
extra.push(`<span style="color:#FF5630">● ${labels.today}</span>`);
```

**ECharts tooltip은 HTML 문자열 포맷터**라 React 컴포넌트를 넣을 수 없다. 선택지는 셋이다.

1. 인라인 `<span>`을 CSS 원형 도형으로 바꾼다 (색은 토큰화) — 차트 툴팁 범례 마커는 원형이 업계 관례라
   Atlaskit 아이콘으로 바꾸는 것이 오히려 어색할 수 있다. **권장.**
2. 아이콘 SVG를 data URI로 인라인 — 유지보수 부담이 크다.
3. 마커를 없애고 색 텍스트만 남긴다.

같은 줄에 `#FF5630` `#FF8B00` `#6554C0` 하드코딩도 있어 P1 색상 작업과 함께 처리하는 것이 효율적이다.

#### (c) CSS 원형 도형

| 위치 | 성격 | 처리 |
|---|---|---|
| `portfolio/PortfolioDashboard.css:71` `.tsr-dot` | 신호등 배경 원 | (a)-1과 함께 제거 |
| `projectDetail/issue/ProjectGroupCard.jsx:21` | 8px 상태 점 | 아이콘 또는 `Badge`로 교체 검토 |
| `dashboard/modal/AddChartModal.css:112` | `✓` 배지 배경 원 | (a)-3과 함께 제거 |
| `AvatarStack` · `JiraUserSelect` · `ProjectFilter` · `sidebar.css:75` · `UserPage.jsx:92` · `SalaryPolicySetting.jsx:200` | **아바타/색상 견본** | 정상 용도 — **제거 대상 아님** |

#### (d) 서드파티 아이콘 폰트 — 대상 외

`gantt/fonts/wx-icons.css` (306줄, `content:"\f101"` 형태 31개). SVAR Gantt 라이브러리 소유물이라
교체하려면 라이브러리 내부를 건드려야 한다. **정리 대상에서 제외**하고 서드파티 영역으로 분류한다.

### 4-4. 로딩/빈 상태/에러 표현이 산발적

`Spinner` 52파일 · `EmptyState` 15파일 · `SectionMessage` 48파일이 각자 다른 배치로 쓰인다.
"데이터 없음"이 어떤 화면은 `EmptyState`, 어떤 화면은 회색 텍스트 한 줄이다.

> **✅ 2026-08-05 로딩 부분 처리 완료 — 스켈레톤 전환.** 아래 §4-5 참조. 빈 상태/에러 표현 통일은 P3에 남아 있다.

### 4-5. 로딩 표현 — 스피너에서 스켈레톤으로 (2026-08-05 적용)

`@atlaskit/skeleton`(2.1.5)을 직접 의존성으로 승격하고 `components/skeleton/Skeleton.jsx`에
프리미티브 6종을 만들었다. 색을 넘기지 않으므로 `--ds-skeleton-*` 토큰을 타고 다크모드가 자동 대응된다.

| 프리미티브 | 쓰임 |
|---|---|
| `SkeletonTable` | 표 — `columns`에 배열(`['30%','20%',…]`)을 주면 실제 열 비율대로 그린다 |
| `SkeletonChart` | 차트 — 막대 실루엣 + 축 자리 |
| `SkeletonCards` | KPI 타일 행(`direction="row"`) / 카드 목록(`"column"`) |
| `SkeletonText` | 문단·폼 필드 자리 |
| `SkeletonBlock` | 내부 구조를 흉내낼 수 없는 것(관계도·조직도) |
| `SkeletonCell` | 표 셀 하나가 늦게 오는 지연 hydrate |

**적용 원칙 — 전부 바꾸지 않았다.**

- **스켈레톤**: 아직 아무것도 없는 자리에 콘텐츠가 처음 들어올 때. 올 것의 구조를 미리 보여 준다.
- **스피너 유지**: ① 이미 있는 콘텐츠 위에서 갱신 중(`LoadingOverlay`, 칸반/대시보드 오버레이,
  `isFetching` 인라인), ② 무엇이 올지 모르는 `Suspense` 청크 로딩(App·CommonTab·ProjectWorkPanel),
  ③ 컨트롤 내부의 짧은 진행 표시(드롭다운·미리보기·저장 중).

스켈레톤은 순수 시각 표현이라 보조기술에 아무것도 알리지 못한다. 모든 프리미티브를
`role="status"` + `aria-label` 로 감싸 기존 `<Spinner label>` 이 하던 고지 역할을 유지했다.

**전환한 화면(24개 파일)**: 전사 대시보드 · 비용 · 진척 · 간트 · 작업이력 · 이슈 목록 · 작업 배정 ·
이슈/인력/팀 분석 리포트 · 자원관리(인력현황·조직·팀분석·배정보드·카드목록·상세·관계도·프로필드로어) ·
내 프로젝트 · 구독 목록/요약 · 스토리지 · 백오피스 목록 5종 · 권한 모달 2종 · 팀/사용자 모달 4종.

---

## 5. CSS 파일 3,028줄

| 파일 | 줄수 |
|---|---|
| `pages/projectDetail/progress/ProgressPage.css` | 421 |
| `pages/projectDetail/gantt/gantt.css` | 415 |
| `pages/projectDetail/dashboard/modal/AddChartModal.css` | 392 |
| `pages/projectDetail/gantt/fonts/wx-icons.css` | 306 |
| `layout/sidebar.css` | 215 |
| `pages/projectDetail/cost/CostPage.css` | 203 |
| `components/table/table.css` | 188 |
| `components/calendar/FullCalendar.css` | 173 |
| `pages/projectDetail/analysisReport/resource/ResourceAnalysisChart.css` | 145 |
| 그 외 9개 | 570 |

`sidebar.css`(hex 26회) · `table.css`(hex 39회) · `Select.css`(hex 28회)에 색이 하드코딩돼 있어
**다크모드에서 이 세 곳이 깨진다**. gantt/FullCalendar CSS는 서드파티 오버라이드라 성격이 다르므로
정리 대상에서 분리해야 한다.

---

## 6. 권장 작업 순서와 규모

작업량은 "파일 수 × 손대는 깊이" 기준의 개략 추정이다.

### P0 — 페이지 셸 통일 (체감 효과 최대 / 위험 낮음)

`PageContainer`를 Atlaskit `Heading` + `Box`/`Stack` 기반으로 다시 만들고, 백오피스의 `Backoffice`
컴포넌트와 같은 계약으로 맞춘 뒤 **전 페이지에 적용**. 제목 레벨·상단 여백·설명문·액션 버튼 위치를
한 곳에서 결정한다.

- 대상: 페이지 루트 28개 + `PageContainer`/`Backoffice` 2개
- 화면 안쪽은 건드리지 않으므로 회귀 위험이 낮고, "같은 앱" 느낌의 대부분이 여기서 나온다.

### P1 — 색상 표기 단일화 (다크모드 부채 동시 상환)

1. `var(--ds-*)` 148회 → `token()` 로 기계적 치환 (31파일, 위험 거의 없음)
2. 팔레트 4벌 → 1벌로 통합. 역할별로만 남긴다: 범주형(차트 시리즈) / 상태(status) / semantic(성공·경고·위험)
3. 하드코딩 hex 1,328회 → 토큰. **전량이 아니라 semantic 색부터** — 텍스트·배경·보더가 우선이고,
   차트 시리즈 색은 2번에서 팔레트로 흡수된다.
4. `sidebar.css` / `table.css` / `Select.css`의 hex → CSS 변수

- 3번이 가장 크다. 파일 단위로 나눠 점진 적용 권장.

### P2 — 타이포·간격 스케일 고정

`fontSize` 매직넘버 453회를 Atlaskit `Text`/`Heading` 컴포넌트 또는 토큰 스케일로.
13px(93회)·10px(30회)처럼 스케일에 없는 값은 인접 단계로 흡수 결정이 필요하다.

### P0.5 — 비Atlaskit 아이콘 제거 (§4-3)

유니코드 글리프 9개 지점을 `@atlaskit/icon/core`로 교체. 파일 수가 적고(8파일) 서로 독립적이라
P0와 병행 가능하며, 눈에 띄는 이물감이 바로 사라진다.
차트 툴팁 `●` 7곳은 ECharts 제약이 있어 P1 색상 작업에 붙인다.

### P3 — 중복 컴포넌트 통합

배지 5종 → 1종(+`@atlaskit/lozenge` 도입 여부 결정), 카드 래퍼 7종 → 1종,
로딩/빈/에러 상태 표현 규칙 정립.

### P4 — 마감 다듬기

여기까지 오면 카드 그림자·라운드·아이콘 톤·엠프티 스테이트 일러스트 정도만 손봐도 크게 달라진다.
**이 단계를 먼저 하면 흩어진 채로 예뻐질 뿐이므로 순서를 지키는 것이 중요하다.**

---

## 7. 착수 전 결정이 필요한 항목

1. **`@atlaskit/lozenge` 도입 여부** — 배지 5종 통합의 전제. 미도입 시 자체 배지 1종을 공용으로 확정해야 한다.
2. **디무브 브랜드 틸(`#21ADAD`) 처리** — Atlaskit 네이티브 순수로 정했으므로 `assignment/theme.js`의
   틸 포인트 컬러는 제거 대상이 된다. 브랜드 색을 로고·랜딩 등 일부에만 남길지 결정 필요.
3. **13px 본문(93회) 흡수 방향** — 12px로 내릴지 14px로 올릴지. 테이블 밀도에 영향이 크다.
4. **적용 범위** — 미배포 기능(팀 관리 RFC-147, 팀 분석 RFC-174~176, 급여 정책 RFC-163)이 커밋 전
   상태로 남아 있다. 이들을 포함해서 정리할지, 배포 후로 미룰지.

---

## 8. 최종 결과 (2026-08-05)

### 커밋 — RFC-178 6개

| 커밋 | 내용 | 파일 |
|---|---|---|
| `906729a` | 스켈레톤·벤토 그리드·페이지 셸·색 토큰 | 128 |
| `424d998` | 색 토큰 단일화(페이지 CSS·팔레트·조건부 색상) | 27 |
| `9e71be5` | 타이포 스케일 12단계 → 6단계 | 65 |
| `1015100` | 배지 동명이인 해소·중복 구현 제거 | 13 |
| `0a3b01d` | 카드 전체화면·뷰 전환 버튼 공용화 | 7 |
| (최종) | 빈 상태 통일 + 사이드바 로고 전환 | 18 |

### 신설한 공용 지점

| 파일 | 역할 |
|---|---|
| `components/layout/PageContainer` · `PageHeader` | 페이지 제목·여백을 한 곳에서 결정 |
| `components/layout/BentoGrid` | 중요도를 타일 크기로 표현하는 격자(6열 기준) |
| `components/skeleton/Skeleton` | 스켈레톤 프리미티브 7종 |
| `components/table/skeletonRows` | 표 헤더는 살리고 행만 비우는 로딩 |
| `components/feedback/LoadingOverlay` | 갱신 중 shimmer 바(스피너 대체) |
| `components/card/CardFullscreen` | 카드 전체화면 오버레이 |
| `components/chart/ViewToggleButtons` | 차트 ⇄ 표 전환 버튼 |
| `components/chart/echart/tooltipMarker` | ECharts 툴팁 마커 |
| `components/lozenge/SemanticBadge` | 의미 배지(동명이인 해소) |
| `constants/chartPalette` | 차트 색 단일 출처 |

### 삭제한 것

`components/spinner/`(폴더 전체) · `constants/dashboardColorPalette.js` ·
`pages/resource/assignment/theme.js`(참조 0건) · `pages/resource/StatusBadge.jsx`(동명이인) ·
`pages/portfolio/widgets/EmptyState.jsx`(재노출 껍데기)

### 곁다리로 고친 결함

작업 중 발견해 함께 고친 것들이다. 전부 **눈에 잘 안 띄지만 실제로 틀린** 동작이었다.

1. **이슈별 비용 우측 파이가 간헐적으로 빈 채로 남던 문제**
   패널이 `flex-basis: 0 → 40%`로 펼쳐지는 0.3초 동안 ECharts가 폭 0에서 init 된다.
   `ResizeObserver` 콜백이 인스턴스 준비 전에 오면 흘러가고, 트랜지션이 끝나면 크기 변화가
   없어 resize가 영영 호출되지 않는다 → 패널 오픈 후 두 시점에 resize를 직접 보장.
2. **`background: color + '22'`** — 막대색에 알파를 문자열로 이어 붙이던 코드.
   토큰은 `var(...)` 문자열이라 그대로 두면 무효 값이 되어 배경이 사라진다.
3. **`Card` 전체화면 배경 `#fff` 하드코딩** — 다크모드에서 흰 장막.
4. **빈 상태를 `<h2>`/`<h4>`로 그리던 3곳** — 스크린리더 문서 구조 오염.
5. **`CostPage.css` 고아 셀렉터** — 다중 셀렉터 다크 블록을 정리하다 첫 줄이 남아 CSS 문법 오류.

### 다음 (P4 — 마감 다듬기)

수치로 진단할 영역이 아니다. 실제 화면을 보며 판단한다.
카드 그림자·라운드 통일, 아이콘 톤, 엠프티 스테이트 일러스트, 간격 리듬 정도가 후보다.

**미검증**: 전 과정이 빌드 통과 기준이다. 실제 화면 E2E는 사용자가 별도 수행.
