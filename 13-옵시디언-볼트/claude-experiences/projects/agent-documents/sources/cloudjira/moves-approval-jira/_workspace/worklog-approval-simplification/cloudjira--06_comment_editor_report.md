# 워크로그 설명 편집기 추가 개선

2026-10-13 사용자 후속 요구인 “코멘트도 워크포스처럼”을 Approval 공용 워크로그 모달에 적용했다.

## 구현

- `components/markdown/MarkdownEditor.jsx`: MDXEditor 기반 제목, 목록, 인용, 굵게, 기울임, 링크, 코드 블록 편집. Workforce와 동일한 편집기·변환 라이브러리 계열을 사용한다. 다른 저장소 코드에 대한 런타임 import는 없다.
- 에디터와 Markdown→ADF, ADF→Markdown 변환기는 동적 import로 내려받는다. 실제 entry/main 번들 예산 확인은 전체 에이전트 종료 후 root가 수행한다.
- `useWorklogComment`: 원본 ADF의 미지원 노드·서식을 변환 전에 읽기 전용으로 분류한다. 이미지, 멘션, 표, 링크 카드, 이모지, 밑줄 등은 원본 보존을 우선한다. Workforce의 일부 서식 손실 허용보다 보수적으로 모든 미지원 서식을 잠근다.
- 변환 경고도 읽기 전용으로 전환한다. 변환·편집기 로딩 실패는 저장을 막고 재시도한다. 날짜·시간만 수정하거나 설명을 변경하지 않았다면 comment를 요청에서 생략한다. 빈 설명으로 수정했을 때 기존 설명을 유지하는 기존 정책도 유지한다.
- 기존 ADF→Markdown 라이브러리가 orderedList.attrs를 변경하므로 반드시 복사본을 변환한다.
- MDXEditor의 초기 정규화 onChange는 사용자의 수정으로 판정하지 않는다. 연속 등록 성공 후 편집기를 새 인스턴스로 초기화해 입력 본문을 비운다. 기존 날짜·시간 범위 입력은 유지한다.
- `getWorklogEditorContext`는 `loadOwn`으로 본인 작성분을 검증한 후에만 `commentAdf`를 반환한다. 일반 워크로그 목록에 원본 ADF를 추가하지 않는다. 기존 Handoff도 같은 검증 컨텍스트를 재사용한다.
- 서버 `worklogCommentAdf.js`: 편집기 지원 ADF 부분집합, 올바른 부모·자식, mark 및 attrs, UTF-8 64 KiB, 깊이 32, 노드 2,000개, 텍스트 4,000자 한도를 검증한다. 링크는 http/https/mailto만 허용하고 제어 문자·공백을 거부한다. 기존 평문 API도 계속 지원한다.
- 권한·승인 잠금 상태에서는 설명을 읽기 전용으로 보여 주고 저장은 기존 권한·잠금 검사와 새 로드 상태 모두 통과해야 열린다.

## 근거

- Atlassian ADF 문서 구조: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
- MDXEditor 설치·초기값·onChange 문서: https://mdxeditor.dev/editor/docs/getting-started
- 라이브러리 구현 직접 확인: marklassian 1.2.1 `dist/index.js`, adf-to-md 1.2.1 `index.js`, MDXEditor 3.55.0 `dist/index.d.ts`.

## 검증과 범위

- 백엔드 관련 4 suites / 49 tests 통과.
- UI 관련 2 suites / 20 tests 통과.
- 평문 호환성, 원본 ADF 전달, 위험 링크·용량·깊이·노드·길이 제한, 본인 편집 전용 원본 반환, 목록 원본 비노출을 검증했다.
- 미지원 이미지·멘션·서식, 변환 실패·재시도, 원본 변환 부작용 방지, 변경하지 않은 rich text의 전송 생략, 연속 등록 초기화, 기존 모달 계약을 검증했다.
- `git diff --check` 통과. locales merge 실행 완료. 생성된 합본 locale는 커밋 대상에서 제외한다.
- 앱 빌드, 브라우저 실제 MDXEditor 렌더, 실제 Jira REST 저장은 이 작업 단위에서 수행하지 않았다. root가 최종 검증에 포함해야 한다.

## 의존성

- `@mdxeditor/editor`: npm이 해석한 3.55.0.
- `marklassian` 및 `adf-to-md`: 1.2.1.
- `@testing-library/dom`: 테스트 라이브러리 peer dependency를 명시한 devDependency.
- 설치는 `--legacy-peer-deps`로 수행했다. 기존 프로젝트의 peer dependency 조합과 편집기 추가 때문에 package-lock 변동이 크다. 전체 UI 회귀 검사와 production build가 최종 확인 단계다.

## 제한

- 이미지·멘션 삽입과 완전한 Jira ADF 편집기를 새로 제공하지 않는다. 기존 미지원 ADF는 읽기 전용이며 원본을 유지한다.
- 클라이언트는 Markdown 문자열 4,000자를 제한하고 서버는 ADF 본문 텍스트 4,000자를 제한하므로 서식 기호가 많은 입력은 클라이언트에서 더 일찍 막힐 수 있다.
- 비운 설명은 삭제 동작이 아니라 기존 설명 유지다.
