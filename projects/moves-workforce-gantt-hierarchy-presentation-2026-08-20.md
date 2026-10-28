# 간트 계층 가이드 제거

## 결정

좌측 테이블의 CSS 기반 tree guide와 elbow를 제거했다. 행의 실제 연결을 보장하지 못하는 장식은 계층 관계를 오히려 오해하게 만들 수 있다.

## 유지한 것

- SVAR task의 `parent` 관계와 기본 들여쓰기
- 이슈 타입 아이콘 실패 fallback
- 폴더 및 WBS의 실제 이동·권한 검증

## 검증

`ganttAdapter.folderLinks.test.js` 통과. CI build는 이 환경에서 `craco build` 시작 뒤 결과 출력 없이 종료되어 별도 확인이 필요하다.
