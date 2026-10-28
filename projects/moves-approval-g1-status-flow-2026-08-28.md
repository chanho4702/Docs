# Moves Approval G1 상태 워크플로 (2026-08-28)

## 경험

- 승인 앱처럼 도메인이 전이를 고정하는 화면은 React Flow의 연결 편집 기능을 열지 않는다. 노드·엣지 topology를 순수 데이터로 두고 `nodesConnectable={false}`, `edgesFocusable={false}`, `deleteKeyCode={null}`와 요소별 `connectable`·`deletable`·`reconnectable` 제한을 겹쳐야 UI가 도메인 규칙을 흐리지 않는다.
- 조직이 저장한 상태 표시명과 사용자 언어의 기본 표시명을 분리한다. 저장값은 번역하지 않고 그대로 표시하되, 빈 값은 렌더 시점의 i18n 기본값으로 대체한다. 변경 여부도 `trim()`한 의미값으로 비교해야 공백만 입력한 상태에서 저장 버튼이 켜지지 않는다.
- `@atlaskit/form` 15.3의 `Form`은 `defaultValues` prop을 초기값으로 소비하지 않는다. 각 `Field`의 `defaultValue`가 form state의 초기값을 등록하므로 숫자·토글 필드는 Field 단위로 기본값을 전달해야 한다. 서버 저장값이 갱신된 뒤 form을 다시 깨끗한 상태로 만들려면 서버 정책으로 만든 안정적인 `key`로 Form을 재마운트할 수 있다.
- 업무함의 `React.lazy(() => import('../settings/SettingsPage'))` 경계를 유지하면 `@xyflow/react`는 설정 async chunk에 남는다. 실제 멀티 엔트리 빌드에서 `react-flow__` 코드는 `432` chunk에만 존재했고, `inbox.html`은 이 chunk를 참조하지 않으며 `settings.html`만 참조했다.

## 검증

- `npm run test:ui -- --runInBand`: 6 suites, 13 tests 통과(병렬 추가 테스트의 worker 강제 종료 경고 1건)
- `npx jest --runInBand`: 14 suites, 115 tests 통과
- G1 단독 CRA production webpack: 성공(Atlaskit source map 경고 2건)
- `npm run build:ui`: 성공(기존 Atlaskit source map·react-select CSS minifier 경고)
- 실제 멀티 엔트리 분석: React Flow `432` chunk는 `settings.html`에만 있고 `inbox.html` 초기 script에는 없음
- `npx forge lint`: No issues found
