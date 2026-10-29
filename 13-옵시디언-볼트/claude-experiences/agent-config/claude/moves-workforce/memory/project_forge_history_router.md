---
name: project-forge-history-router
description: 앱 라우팅을 MemoryRouter → Forge view.createHistory() 어댑터로 교체(2026-08-26) — 새로고침 복원·딥링크, 렌더 테스트 인프라 없음
metadata:
  type: project
---

2026-08-26 사용자 요청("새로고침하면 첫 진입점으로 돌아감, 링크 공유도 안 됨")으로 `static/ui/src/App.jsx`의 `MemoryRouter`를 **`router/ForgeHistoryRouter.jsx`**(Forge `view.createHistory()` → React Router 7 `<Router location navigator>` 어댑터)로 교체. Forge 밖에서는 `createHistory` 실패 시 `MemoryRouter` 폴백.

- Forge history는 `history` v5 규약(`listen(({location, action}) => …)`), 어댑터는 v4 shape(location 직접)도 받는다.
- 페이지 코드(`useNavigate`/`<Route>`)는 무변경.
- **하위 탭·뷰도 URL**(2차 커밋): `utils/useUrlParam.js`(`useSearchParams` 래퍼, **replace** 쓰기, `{only:true}`면 다른 파라미터 제거). `CommonTab`(메인·프로젝트 상세, 중첩 드롭다운 키 포함)·`ResourcePage`(Atlaskit Tabs `selected`/`onChange` 제어, 조건부 teamAnalytics 탭 인덱스 동기)는 `?tab=`, `ProjectWorkPanel` 목록|트리|간트는 `?view=`. 모르는 키는 첫 탭으로 흡수. 상위 탭 전환 시 `view` 제거.
- ✅ **dev(moves-rms) 실측 완료(2026-08-26)**: Forge history는 해시가 아니라 **경로 세그먼트**(`/jira/apps/{app}/{env}/project/<id>?tab=…`)를 쓰고 `search`도 정상 분리해 준다. `listen` 콜백은 `(location, action)`, 반환은 unsubscribe Promise. 공식 문서 지원 모듈에 jira:globalPage 포함(플랫폼 제약 아님).
- 🔴 **딥링크 실패의 진짜 원인 2개(모두 앱 쪽)**: ① `CommonTab`이 Atlaskit `<Tabs selected>` 안에 패널 자식을 1개만 두어 `panels[selected]`가 index≥1이면 없음 → 두 번째 이후 탭 직접 진입 시 본문 공백(앱 내 전환은 index 0 선방문으로 우연히 동작). 본문을 `<Tabs>` 밖으로 뺐다. ② 상세 제목이 `location.state`에만 의존 → `findProjectById` `rows[0].project_name` 폴백.
- ⚠ **브라우저 자동화 함정**: Claude-in-Chrome이 만든 창이 다른 창에 가려지면 탭이 `hidden` → rAF 정지·타이머 1s/1min 억제·스크린샷 타임아웃. "iframe 멈춤"으로 오인했다. 측정 전 `document.visibilityState === 'visible'` 확인 필수. iframe 내부 관측은 앱→`window.parent.postMessage` 하트비트 + 상위 프레임 `javascript_tool` 수신으로 가능.
- 이 dev CDN은 main.js 다운로드가 2~18초, 호스트 스켈레톤이 60초까지 흔들린다 — 코드 문제 아님.
- **컴포넌트 렌더 테스트 불가**: 리포에 `@testing-library/react` 없고 jest 27이 `react-router-dom` 7(ESM)을 해석 못 함 → 라우터 동작은 배포 후 실화면 확인. **커밋 0e9fa92(#RFC-191, develop)**, 배포·E2E 미수행.
- 후속 후보: 페이지 헤더 "링크 복사" 버튼 — iframe 안에서 부모 Jira URL을 조립해야 해서 배포 후 실제 URL 형태 확인이 먼저.

관련: [[project-worklog-export]] · [[project-legacy-root-no-concurrent]]
