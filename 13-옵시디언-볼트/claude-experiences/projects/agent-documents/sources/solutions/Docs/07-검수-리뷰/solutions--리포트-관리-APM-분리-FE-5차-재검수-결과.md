# 리포트 관리 APM 분리 FE 5차 재검수 결과

- 종합 판정: **승인**
- 차단 항목: **없음**
- 추가 발견: **없음**
- 테스트: 요청에 따라 실행하지 않음

## 최종 확인

1. `setFields` 경로: 정상

[RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:130)의 `resetFormTo()`는 각 필드에 `value`와 `touched:false`를 함께 전달한다.

`rc-field-form` 2.7.1은 [useForm.js](C:/worktrees/report-apm-fe/node_modules/rc-field-form/es/useForm.js:468)에서 `value`를 store에 반영한 뒤 `setField` 알림으로 전체 `fieldData`를 전달한다. [Field.js](C:/worktrees/report-apm-fe/node_modules/rc-field-form/es/Field.js:178)는 그 알림에서 `touched`와 `errors`를 그대로 갱신한다. `isFieldsTouched()`도 이 `touched` 상태를 조회하므로 값은 유지하면서 `false`로 내려가는 구현이 맞다.

내부 `dirty` 플래그는 `true`가 되지만 이는 `isFieldsTouched()`와 별개이며, 현재 제품 로직은 자체 `isDirty`를 사용하므로 회귀가 아니다.

2. `errors: []`: 문제 없음

`resetFormTo()`는 다음 초기화 경계에서만 호출된다.

- 최초 hydration 또는 수정되지 않은 폼의 재조회
- 저장 성공
- 사용자가 원격 값 수용을 명시한 경우

저장 실패 경로인 [RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:184)에서는 호출되지 않는다. 현재 서버 400은 필드 오류로 주입되지 않고 오류 toast로 처리되므로, 서버 오류 뒤 유지해야 할 검증 메시지를 잘못 지우는 경로가 없다. 오히려 기준값이 교체된 뒤 기존 client validation 오류가 남는 것을 방지하는 명시적 초기화다.

3. `Form.useForm` 테스트 wrapper: 문제 없음

[RetentionSettingForm.test.tsx](C:/worktrees/report-apm-fe/src/__tests__/RetentionSettingForm.test.tsx:43)의 mock은 Jest 환경에서만 적용된다. 실제 `Form.useForm`을 한 번 호출하고 반환값을 변경 없이 돌려주며, form instance 포착 외에는 동작을 바꾸지 않는다. 프로덕션 source나 bundle 경로에는 영향을 주지 않는다.

새 단언 3건은 저장 성공, 원격 수용, 최초 hydration 경계를 각각 직접 검증하며 기존 구현의 결함을 적절히 포착한다.

4. 새 결함·회귀: 없음

이번 변경 범위에서 저장 실패 처리, client validation, 원격 충돌 처리 및 값 hydration 흐름에 새 회귀는 확인되지 않았다.

R1: **닫힘**  
R2: **닫힘** — `setFields`로 값과 `touched:false`가 함께 반영되며 직접 단언도 추가됨  
R3: **닫힘**  
R4: **닫힘**  
R5: **닫힘**