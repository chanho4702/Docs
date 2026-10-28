---
name: forge-frontend-dev
description: "Moves RMS Forge 프론트엔드를 구현하는 스킬. React 18 페이지/컴포넌트, Zustand 스토어, TanStack Query 쿼리키 팩토리, Atlaskit UI, @forge/bridge invoke 호출, i18n(t() + locales merge 워크플로우)을 제공한다. frontend-engineer 에이전트가 사용. 프론트/페이지/UI/화면 구현 및 번역 추가 시 사용."
---

# Forge Frontend Dev — 프론트엔드 구현 패턴

설계서 계약대로 백엔드 응답을 소비하는 React 화면(`static/ui/`)을 구현하는 절차.

## 구현 절차

1. 설계서의 경계면 계약·프론트 설계, backend가 통지한 실제 응답 shape을 읽는다
2. `queryKey/` 팩토리에 쿼리키 추가 → 훅/컴포넌트 작성 → `invoke`로 데이터 소비
3. i18n 키를 `locales/kr/`·`locales/en/`에 추가하고 **merge 실행**
4. `cd static/ui && npm test`, 필요 시 `npm run build` 통과 확인
5. `_workspace/<feature>/02_frontend_report.md`에 페이지/훅/쿼리키 + 소비 shape + merge 여부 기록

## Forge Bridge 호출 (경계면 핵심)

```js
import { invoke } from '@forge/bridge';
const result = await invoke('resolverFunctionName', { ...params });
// result: { success, content, error }
if (!result.success) { /* result.error 처리 */ }
const data = result.content; // 백엔드 계약의 content shape과 정확히 일치해야 함
```
**`result.content`의 접근 경로가 백엔드 응답 shape과 글자 그대로 일치해야 한다.** 다르면 backend-engineer에게 즉시 확인.

## 라우팅 / 페이지

- `static/ui/src/App.jsx`의 `MemoryRouter`. 앱 로드 시 i18n + 권한 로드 후 렌더
- 페이지: `static/ui/src/pages/`, 백오피스: `static/ui/src/backoffice/page/`
- 탭: `static/ui/src/constants/tabs.js`(`mainPageTabs`, `projectDetailTabs`), 권한 노출 `canRender`

## 상태 관리

- Zustand 스토어(`static/ui/src/stores/`): `useI18nStore`(`t`, `init`), `usePermissionStore`(`canRead`/`canWrite(pageId)`), `useJobStore`
- React Query: 쿼리키는 **반드시** `static/ui/src/utils/queryKey/` 팩토리로 정의
  ```js
  userKeys.list(params)   // ["users","list",params]
  projectKeys.kanban()    // ["kanban"]
  ```
  인라인 키 배열 금지.

## Jira 직접 호출 (설계서가 지정한 경우만)

`static/ui/src/utils/jiraApi/`에서 `@forge/bridge`의 `requestJira`로 Jira REST 직접 호출(JQL 생성기 `jqlMaker`).

## i18n 워크플로우 (규칙 엄수)

**`locales/ko-KR.json`·`locales/en-US.json` 직접 수정 금지.**

1. **키 추가 위치는 추측하지 말고 `locales/script/merge.js`를 먼저 Read해 실제 소스 폴더를 확인하라.** 현재 merge.js는 **`locales/kr/*.json`·`locales/en/*.json`을 읽어** `ko-KR.json`/`en-US.json`을 생성한다. `locales/script/*.json`은 (마이그레이션 중인) 빈 스텁이라 거기 넣으면 반영 안 된다. → 키는 `locales/kr/{기능}.json`·`locales/en/{기능}.json`에 추가.
2. `cd static/ui && npm run merge` 실행 → `ko-KR.json`/`en-US.json` 생성. 산출물에 키가 들어갔는지 확인.
3. UI에서는 `useI18nStore`의 `t('key')`로만 사용

merge 실행을 빠뜨리면 번역이 반영되지 않는다 — 키 추가 후 반드시 실행하고 리포트에 명시. (빌드 시 prebuild가 merge를 자동 실행하지만, 개발 중 확인을 위해 수동 실행 권장.)

## UI 라이브러리

Atlaskit + `@compiled/react`. 차트 ECharts/ApexCharts, 캘린더 FullCalendar, 대시보드 `react-grid-layout`, 칸반 `react-kanban-kit`, 상태 플로우 `@xyflow/react`.

## 체크리스트

- [ ] `invoke` 결과의 `result.content` 접근이 백엔드 shape과 일치
- [ ] `result.success === false` 분기 처리
- [ ] 쿼리키가 `queryKey/` 팩토리로 정의됨
- [ ] i18n 키를 `locales/kr/`·`locales/en/`에 추가 + `npm run merge` 실행
- [ ] ko-KR/en-US 직접 수정하지 않음
- [ ] `npm test`/`npm run build` 통과, 결과를 리포트에 기록
