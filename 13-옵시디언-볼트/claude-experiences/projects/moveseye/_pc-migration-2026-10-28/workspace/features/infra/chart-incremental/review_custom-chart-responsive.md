# review_custom-chart-responsive — 커스텀 차트/홈 위젯 그리드 반응형 고정 버그 수정

2026-08-21 · Claude 작업 · 검수 요청

## 범위

- `moveseyee_fe/src/components/Dashboard/CustomChartsDashboard.tsx`
- `moveseyee_fe/src/pages/home/widgets/HomeWidgetGrid.tsx`

## 증상

작은 화면에서 커스텀 차트 탭(또는 홈 위젯)을 **신규 로드**한 뒤 창을 큰 화면으로 옮기면
그리드/차트가 로드 시점 폭에 고정되어 반응형이 동작하지 않음. (반대 방향이면 카드가 화면을 넘침)

## 원인

react-grid-layout v2.2.3 `useContainerWidth`의 ResizeObserver 부착 effect는
**마운트 시 1회만 실행**되고, 그 시점에 `containerRef.current === null`이면
`if (!node) return;` 후 deps(`measureWidth`, `mounted=true` 고정이라 identity 불변)가
바뀌지 않아 **영영 재시도하지 않는다** (`dist/chunk-PZLKKWSX.mjs:22-58`).

우리 쪽 두 컴포넌트는 위젯 로딩 중(`widgets.length === 0`) 첫 렌더에서 ref가 달린
컨테이너 div 자체를 렌더하지 않아(Empty 분기/early return) 옵저버 부착이 실패했고,
이후 수동 `measureWidth()`(widgets.length 변동 시 1회)로 폭이 한 번만 잡힌 채 고정됐다.

위젯이 react-query 캐시에 있으면 첫 렌더부터 div가 존재해 정상 동작 → "신규 로드일 때만"
재현되는 간헐성의 원인.

## 수정 내용

ref가 달린 컨테이너 div를 **위젯 유무와 무관하게 항상 렌더**하고, Empty/그리드 분기를
div 안쪽으로 이동. 로직 변경 없음(렌더 구조만 재배치). 두 파일 동일 패턴.

## 불안한 지점

- `MonitoringDetailDashboard.tsx:82` 주석에 "비활성 탭은 언마운트한다: useContainerWidth가…"
  라는 기존 우회가 있음 — 이번 수정과 충돌하진 않지만(언마운트→재마운트 시 ref가 첫 렌더부터
  존재하면 정상), 같은 근본 원인의 다른 우회라 함께 볼 가치 있음.
- Empty 상태에 `minHeight: 320` div가 항상 깔리게 됨 — 기존 Empty 단독 렌더 대비
  세로 여백이 미세하게 달라질 수 있음(시각 확인 안 함).

## 검증 / 미검증

- ✅ `npx tsc --noEmit` 통과
- ✅ `npx jest src/__tests__/HomePage.test.tsx` 7/7 통과
- ✅ prettier 적용
- ❌ 브라우저 실측(작은 창 로드 → 큰 창 확대) 미실시 — 코드 경로상 확실하나 런타임 미확인
