# 요구사항 — Confluence 문서 관리 기능을 Workforce 본체로 흡수 (2026-09-30)

## 결정
제품 소유자 결정: 별도 앱 **Moves Workforce Docs**(`C:\CloudJira\moves-workforce-docs`)를 폐기하고 그 기능을 **Moves Workforce 본체**로 흡수한다.
이유: 애드온은 Workforce 없이 독자 가치가 약하고(Jira 기본 기능 + 분류·현황판뿐), 두 앱을 맞추는 구조(설치 감지·이름 복사·앱 간 이동)가 사라진다.

## 흡수 뒤 모습
- 프로젝트 상세 「문서」 탭이 **완전한 관리 화면**이 된다: 문서 연결(Confluence 검색: 제목/본문, 스페이스 선택, 주소 붙여넣기), 분류 변경, 연결 해제, 현황(문서 없는 이슈·오래된 문서·끊긴 링크·누락된 필수 분류).
- 설정(분류 목록·필수 여부·오래된 문서 기준일)은 **백오피스 설정 화면**에 들어간다.
- 라이선스·권한·번역·저장은 전부 Workforce 것을 쓴다.

## 애드온 코드의 처리
| 그대로 옮기는 것 | 버리는 것 |
|---|---|
| 프로퍼티 계약(`movesDocsProperty.js` — 쓰기·읽기·병합·상한), Confluence 검색(`utils/confluenceApi/*`), 연결·분류·해제 화면과 모달, 현황 로직(`documents.js`·`filters.js`), `useProjectData`, 테스트 | 설치 감지(`useMovesDocsInstalled`, `jql/parse`), 앱 간 이동 상수(`constants/movesDocs.js`), 별도 라이선스 판정, 사용자별 프로젝트 기억(KVS `projects:*`)과 홈 화면, 애드온 manifest·라우터·레이아웃 |

애드온 저장소의 정본 문서: `C:\CloudJira\moves-workforce-docs\docs\DESIGN.md`(계약·검색·현황·한계·실측 항목), `docs\SECURITY_AUDIT.md`(반영된 보안 규칙 — **흡수 뒤에도 전부 유지**), `docs\BUILD_REPORT.md`.

## Workforce에 새로 들어가는 것
1. **manifest**: `app.compatibility`(Jira 필수, Confluence 선택), 스코프 `search:confluence`, `jira:entityProperty`에 `movesDocs` 색인(`movesDocsPageId`·`movesDocsCategory`·`movesDocsCount`). → **메이저 버전 + 고객 관리자 재승인**. 다중 제품 호환은 Preview·비가역임을 알고 결정했다.
2. **설정**: 문서 분류 목록(이름·필수 여부, 최대 30개, 이름 1~30자, 대소문자 무시 중복 금지)과 오래된 문서 기준일(1~3650, 기본 90). 기본 분류: 기획·설계·회의록·산출물·기타(필수 없음). Workforce의 설정 저장 방식(`src/resolver/backoffice/setting`, KVS `settings` 엔티티 → **manifest attributes 선언 필수**)과 설정 카탈로그·서버 검증 규약을 따른다.
3. **권한**: 문서 탭 읽기 = `PROJECT read`, 연결·분류·해제 = `PROJECT write`(간트가 PROJECT로 통합된 전례). 설정은 `SETTINGS`. 새 권한 키를 만들지 않는다.
4. **Confluence 미연결 폴백**: 탭은 항상 보이되, Confluence를 쓸 수 없으면 상단 안내 + 연결 추가만 막고 저장된 목록은 읽기 전용으로 표시(애드온 로직 그대로).
5. **번역**: 애드온의 문구를 Workforce `locales/kr|en/movesDocs.json` 한 파일(네임스페이스 `movesDocs.*`)로 합친다. 기존 `movesDocs.json`(읽기 전용 탭 문구)을 확장한다.

## 보안 규칙 (애드온 감사 결과, 유지)
- 이슈 프로퍼티는 신뢰하지 않는다: 읽을 때 30건·id 숫자 1~19자리·제목/스페이스 255·분류 30자 강제.
- 문서 링크는 id로만 조립(`/wiki/pages/viewpage.action?pageId=`). 계약에 `url` 필드 없음.
- 최신 정보 조회 500건 상한, 넘는 문서는 "확인 불가".
- 검색어의 검색 문법 문자 제거, CQL 값 이스케이프, 문서 번호는 숫자만.
- 재조회 실패는 `isError`로 판정(옛 값에 가려지지 않게), 분류가 섞인 문서는 고르기 전 저장 불가, 저장 중 모달 닫기 금지.
- 설정 저장은 서버에서 `SETTINGS write` 강제 + 검증.

## 하지 않는 것
- Confluence 쪽 화면 모듈, 프로젝트 단위(이슈 없는) 문서, 폴더, 문서 세트 생성, 자동 갱신 끄기 설정.
- 애드온 저장소 삭제(사용자가 결정). 이 작업에서는 읽기만 한다.

## 영향 범위
백엔드(설정 resolver·검증·manifest attributes), 프론트(탭 전면 교체·백오피스 설정 UI·번역), manifest(스코프·호환·색인), 테스트(애드온 테스트 이식 — Workforce 프론트는 `jsdom` 환경이나 `@testing-library/react`가 없으므로 도입 여부는 설계에서 결정).
