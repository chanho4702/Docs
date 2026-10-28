# 리포트 관리 APM 분리 FE 4차 재검수 결과

- 종합 판정: **수정 후 재검수**
- 차단 항목: **없음**
- 검수 범위: 미커밋 수정 12개·신규 2개 전체
- 테스트: 요청대로 실행하지 않고 소스로만 판단
- 파일 변경: 없음

## 발견 사항

R2 · 보통 · [RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:127), [RetentionSettingForm.test.tsx](C:/worktrees/report-apm-fe/src/__tests__/RetentionSettingForm.test.tsx:464) · `resetFormTo()`가 Ant Form의 touched 상태까지 초기화한다는 전제가 사실과 다르다 · 128행의 `resetFields()`는 touched를 `false`로 내리지만, 곧바로 129행의 `setFieldsValue(values)`가 실행된다. 현재 설치된 `rc-field-form`은 외부 `valueUpdate`에서 값이 달라지면 `touched=true`로 다시 설정한다([Field.js](C:/worktrees/report-apm-fe/node_modules/rc-field-form/es/Field.js:139)). 이 폼에는 `initialValues`가 없으므로 reset 직후 값은 `undefined`이고, 세 필드에 실제 값을 넣는 과정에서 모두 다시 touched가 된다. 현재 충돌 판정은 명시적 `isDirty`만 사용하므로 저장·원격 수용 뒤 재조회가 충돌을 만드는 기능 결함은 해소됐지만, 테스트도 충돌 부재만 확인할 뿐 touched 자체는 검증하지 않는다 · `form.setFields()`로 각 필드의 `value`와 `touched:false`를 명시하거나, touched를 올리지 않는 값 설정 경로를 사용한다. 수정 후 실제 `form.isFieldsTouched()`가 `false`인지 검증하는 테스트를 추가한다.

## 중점 확인 결과

1. **3차 차단 R2 — 닫힘.** [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:84)의 `useLayoutEffect`는 해당 commit의 layout phase에서 실행되며, 삭제된 `RetentionSettingForm`의 passive cleanup보다 앞선다. 따라서 라이선스 회수 commit에서 dirty가 정상적으로 보존된다.

2. **스냅샷 오경고 — 이상 없음.** layout effect가 매 commit마다 현재 dirty로 스냅샷을 덮어쓰고, 경고 조건도 `requestedTab !== activeTab`인 강제 정규화에 한정된다. 확인 후 탭 이동·저장·원격 수용 경로에서는 dirty가 먼저 내려가므로 잘못된 경고를 만들지 않는다.

3. **B→A 원격 복귀 — 정상.** [RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:147)의 양방향 분기가 기준값과 같아지면 `setConflict(null)`을 수행하며 로컬 입력은 유지한다.

4. **최신 응답 적용 — 정상.** “새로 불러오기”는 과거 `conflict`가 아니라 현재 `retention`을 읽으므로 B 경고 뒤 C가 도착한 경우 C를 적용한다.

5. **저장·원격 수용 후 재조회 — 기능상 정상.** hydration과 충돌 판정이 `isDirty` 하나만 읽고 `resetFormTo()`가 이를 `false`로 내리므로 불필요한 충돌은 발생하지 않는다. 다만 Ant Form touched 초기화 자체는 위 발견 사항처럼 미충족이다.

6. **`Modal.useModal` 정합 — 정상.** [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:96)에서 훅을 사용하고, `contextHolder`는 214행에 렌더되어 앱의 [ConfigProvider](C:/worktrees/report-apm-fe/src/App.tsx:30) 아래에 놓인다.

7. **확인창 정리·테스트 경로 — 정상.** blocker effect cleanup이 해당 instance의 `destroy()`를 호출한다. 테스트 mock도 `Modal.useModal()`을 제공하고 context holder 렌더와 `destroy()` 호출을 각각 확인하므로 정적 `Modal.confirm`으로 되돌리면 검증이 깨지는 구조다.

8. **기타 회귀 — 발견하지 못함.** API 경로, 계열별 query key, 목록 필터·삭제 분리, URL/history, 라이선스 탭 정규화 및 i18n에서 추가 결함은 확인되지 않았다.

R1: **닫힘** — URL 정규화와 push/replace 히스토리 동작이 유지된다.  
R2: **부분** — 라이선스 강제 전환과 충돌 동기화는 닫혔지만 Ant Form touched 초기화가 실제로는 되지 않는다.  
R3: **닫힘** — 조회 실패 시 폼·저장을 차단하고 재시도 경로를 제공한다.  
R4: **닫힘** — 비허용 탭 정규화와 라이선스 로딩 정책이 계약과 일치한다.  
R5: **닫힘** — 라우터 링크 접근성과 수정키·가운데 클릭 동작이 유지된다.