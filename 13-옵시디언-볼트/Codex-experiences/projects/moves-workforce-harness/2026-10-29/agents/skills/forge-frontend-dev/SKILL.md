---
name: forge-frontend-dev
description: "Moves RMS Forge Custom UI 구현 스킬. React·Atlaskit, 공용 컴포넌트, Forge 라우팅, invoke 응답, 권한별 쿼리키·무효화와 i18n을 적용한다. frontend-engineer가 화면·훅·번역 구현에 사용한다."
---

# Forge Frontend Dev — 프론트엔드 구현

## 시작 조건

1. 루트 `AGENTS.md`, `CLAUDE.md`, 작업 계약과 파일 소유권을 먼저 읽는다.
2. 기존 `_workspace/<feature>/01_architect_design.md`, backend 리포트와 실제 생산·소비 소스를 읽는다. 작은 수정에 문서가 없으면 현재 계약과 변경 범위를 간결히 기록하며, 문서를 만들기 위해 백엔드를 재구현하지 않는다.
3. 소유한 파일만 수정하고 다른 작업자의 변경을 되돌리지 않는다.
4. 설계·리포트·실제 응답이 다르면 요구사항과 모든 소비자를 대조해 계약을 조율한다.
   backend 구현이 존재한다는 이유로 설계를 폐기하거나 임의 호환 분기로 결함을 숨기지 않는다.

## Custom UI와 재사용

- 이 앱은 `static/ui`의 React 18 Custom UI다. 일반 DOM과 `@atlaskit/*`을 사용한다.
  UI Kit의 `@forge/react` 컴포넌트를 도입하지 않는다.
- 새 파일 전에 `static/ui/src/components/`에서 공용 지점을 확인하고 실제 props를 읽는다.
- 레이아웃은 `layout/PageContainer.jsx`, `PageHeader.jsx`, `BentoGrid.jsx`를 확인한다.
- 테이블은 `table/`, 로딩은 `skeleton/Skeleton.jsx`와 `table/skeletonRows.js`를 재사용한다.
- 카드·차트는 `card/`, `chart/`와 `constants/chartPalette.js`를 확인한다.
- 실제 설치 의존성·스크립트는 `static/ui/package.json`과 lockfile을 기준으로 확인한다.
  문서의 라이브러리 이름만 보고 설치돼 있다고 가정하지 않는다.
- 현재 차트·캘린더·간트 등은 기존 도메인의 import와 사용 패턴을 먼저 따른다.
  간트는 `@svar-ui/react-gantt`를 사용하며 GPL인 `wx-react-gantt`를 도입하지 않는다.

## Forge Bridge 응답 계약

```js
import { invoke } from '@forge/bridge';

const result = await invoke('resolverFunctionName', params);
if (!result.success) {
    const error = new Error(result.error?.message || 'UNKNOWN_ERROR');
    error.code = result.error?.code;
    throw error;
}
const data = result.content;
```

- 위 예시의 `content`는 해당 계약이 이 필드를 사용할 때만 적용한다.
  실제 성공 응답의 중첩·배열·nullable 위치와 소비 필드를 대조한다.
- 실패 분기는 오류 상태 처리 후 `return`하거나 `throw`해 content 접근을 차단한다.
- `invoke` Promise 자체의 reject와 `success: false` 응답을 모두 기존 오류 UI로 처리한다.
- 실패를 `[]`로 바꿔 성공한 빈 결과로 보이게 하지 않는다.
- 비동기 업로드는 즉시 작업 ID와 폴링 결과를 분리하고 `JobPollingManager.jsx`를 확인한다.
- 한 컴포넌트에 여러 객체 shape을 넘기면 참조하는 모든 필드를 각 생산자와 대조한다.
  `?.`·`?? 0`으로 필수 필드 누락을 숨기지 않는다.

## 라우팅과 상태

- `App.jsx`는 `view.createHistory()`와 `router/ForgeHistoryRouter.jsx`를 연결한다.
  Forge 밖 테스트·로컬의 `MemoryRouter` 폴백과 i18n·권한·history 준비 순서를 유지한다.
- 새 경로·탭은 새로고침 복원, 뒤로가기, 딥링크와 쿼리 파라미터를 확인한다.
- 페이지는 `pages/`, 백오피스는 `backoffice/page/`, 탭은 `constants/tabs.js`를 따른다.
- lazy 탭은 `CommonTab.jsx`의 Suspense 경계 안에 둔다. 첫 탭의 기존 정적 로딩을 유지한다.
- Zustand의 UI 상태와 TanStack Query의 서버 상태를 구분해 같은 데이터를 중복 저장하지 않는다.
- `usePermissionStore`의 `canRead`/`canWrite`는 노출·동작 제어다.
  UI 숨김만으로 보안이 확보되지 않으므로 backend 직접 invoke 인가 계약도 확인한다.

## 쿼리키와 갱신

- 신규·수정 키는 `static/ui/src/utils/queryKey/` 팩토리만 사용한다.
- 결과를 바꾸는 projectId, 필터, 페이지 크기·커서, 팀 하위 포함 여부 등을 키에 반영한다.
- 권한·급여 정책·사용자 전환에 따라 응답이 달라지면 권한 축으로 분리하거나 전환 시
  해당 캐시를 제거·무효화하는 기존 공통 경로를 사용한다. 이전 권한의 민감 데이터가 남지 않아야 한다.
- 같은 키에는 같은 응답 shape과 조회 범위를 저장한다. 페이지 크기나 unwrap이 다른 조회를 섞지 않는다.
- mutation별로 목록·상세·요약·형제 탭과 서버 캐시의 갱신 범위를 계약에 연결한다.
- `invalidateQueries`의 prefix/exact 선택을 명시하고 팩토리의 상위 키를 재사용한다.
  예: `projectKeys.costAll()`과 `projectKeys.cost(undefined)`는 같은 prefix가 아니다.
- Jira 커스텀 필드 write 직후 search는 인덱스 지연이 있으므로 기존 서버 응답 캐시 패치 패턴을 따른다.
- Jira 직접 호출은 설계에 지정된 경로에서 `@forge/bridge`의 `requestJira`와
  `utils/jiraApi/` 공용 클라이언트를 사용한다. SQL/KVS는 backend resolver로만 접근한다.

## i18n과 라이선스

1. `locales/script/merge.js`의 실제 입력 폴더와 스크립트를 확인한다.
2. `locales/kr/<기능>.json`, `locales/en/<기능>.json`에 대응 키·값을 추가한다.
3. `static/ui`에서 `npm run merge`를 실행하고 생성 파일에 키가 반영됐는지 확인한다.
4. UI에서는 `useI18nStore`의 `t()`를 사용한다.

- `locales/ko-KR.json`·`en-US.json`은 직접 수정하지 않는다.
  `locales/script/*.json`은 번역 입력 폴더가 아니다.
- 라이선스 차단은 명시적 INACTIVE만 적용하고 UNAVAILABLE은 통과시킨다.
  API 200에 활성 라이선스가 없는 경우는 INACTIVE이며 backend와 같은 경계를 사용한다.
- 라이선스 원문·사용자 민감정보를 frontend console에 출력하지 않는다.

## 검증과 보고

- [공통 검증 기준](../feature-harness/references/verification.md)을 따른다.
  프론트 빌드는 CI와 같은 `CI=true` 조건으로 검증한다.
- 성공·실패·빈 데이터·권한 없음·mutation 후 갱신을 실제 소비 코드와 함께 확인한다.
- `_workspace/<feature>/02_frontend_report.md`에 수정 파일, 페이지·훅, 성공·실패 소비 shape,
  쿼리키·무효화 범위, i18n merge 여부, 검증 결과와 미검증 사항을 기록한다.
