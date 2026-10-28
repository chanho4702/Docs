# 프로젝트 스킬 선택 UI 구현 보고

## 구현 범위
- `static/ui/src/pages/project/modal/ProjectSkillPicker.jsx`, `ProjectSkillPicker.css`, `ProjectSkillPicker.test.jsx`.
- `locales/kr/projectSkills.json`, `locales/en/projectSkills.json` 신규 namespace.
- 부모 모달·기존 SkillMultiSelect·RequiredSkillEditor는 수정하지 않았다. 기존 SkillChip은 읽었으나 삭제 버튼/unknown 표시/긴 이름 줄바꿈을 지원하지 않아 전용 선택 칩을 구현했다.

## 계약
- default export, `value: string[]`, `onChange(ids)`, `disabled=false`, `onReadyChange(boolean)`.
- `getSkillList`: `{success:true,data:[{id,name,category,description}],truncated?:boolean}`. 실패 응답·Promise rejection·비정상 배열 원소·truncated는 throw하고 오류/재시도 UI를 보여준다.
- 쿼리키 `backofficeKeys.skills()`; 기존 공유 shape인 배열을 유지한다. 마운트 때 staleTime:0으로 재조회한다. 변경 resolver 호출은 부모 책임이므로 이 컴포넌트의 mutation/무효화는 없다.
- readiness는 성공 && !isFetching. loading/error는 선택 변경을 막는다. 상위 disabled는 readiness와 독립적이다.
- 중복 선택 방지, 직군/검색 필터와 선택 독립, unknown ID 표시 및 제거, 검색 Enter의 상위 form 제출 방지, 모든 버튼 type=button.

## 디자인
- 직군/검색/후보 리스트와 선택 목록을 나눈 2열 패널. 선택 상태는 selected 토큰 배경과 체크, 선택 수 badge로 표시.
- 기존 앱 타이포그래피를 유지하고 Atlassian CSS theme tokens를 사용한다. 520px 이하 viewport는 단일 열, 목록은 높이 제한으로 modal 전체가 밀려나지 않게 구성한다.
- label, group 이름, aria-pressed, 상태/오류 알림, focus-visible 제공.

## 검증
- `npm test -- --runInBand ProjectSkillPicker.test.jsx`: 1 suite / 8 tests 통과.
- 테스트 범위: 직군 변경 후 선택 유지/개별 제거, 중복/unknown, 실패·잘못된 응답·잘린 응답 재시도, 통신 실패 보존, loading/상위 disabled 차단, 검색 결과와 선택 목록 독립, Enter 제출 방지.
- `git diff --check`: 통과.
- 번역 merge·전체 테스트·CI 빌드·브라우저 시각 확인은 리더 통합 검증에 위임했다. merge 명령을 실행하지 않았다.
- 신규 라우팅/권한/백엔드 로그/외부 서비스 추가 없음.

## 추가 모달 통합 검증
- 리더 요청으로 `static/ui/src/pages/project/modal/__test__/ProjectModal.test.jsx` 추가. 제품 모달·saveSession 코드는 수정하지 않았다.
- Jest CommonJS 제약 때문에 소스의 top-level context await만 Babel AST로 동기 Forge mock 호출로 치환하고 실제 JSX를 실행한다. 실제 CommonModal, Atlaskit Form/Field, QueryClient, Picker, saveSession을 사용한다. modal portal 및 개별 Atlaskit 입력 시각 컴포넌트만 DOM mock 처리한다.
- 10개 시나리오 통과: 신규 picker/통합 저장, success:false·transport·partial 실패 입력 유지, 중복 제출/닫기 차단, 상세/스킬 조회 실패 저장 차단, 재오픈 draft 초기화, background refetch draft 보존, 상위 Enter 제출 방지 중 버튼 기본 동작 보존.
- CommonModal의 모든 Enter 방지가 picker 버튼에도 적용되는 접근성 문제를 발견했다. 리더 승인으로 picker section에서 버튼 Enter 전파만 중단해 기본 키보드 활성화를 보존했다. 공용 모달은 수정하지 않았다.
- RequiredSkillEditor는 현재 주석 외 import 소비자가 없으므로 이번 변경에서 수정하지 않았다.
