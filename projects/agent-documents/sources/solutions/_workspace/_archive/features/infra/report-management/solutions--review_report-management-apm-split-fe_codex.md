# 리포트 관리 APM 분리 FE 검수 결과

- 검수 대상: `C:/worktrees/report-apm-fe`, 브랜치 `report-apm-split`, 기준 `d47c0a5`, 수정 12개·신규 2개
- 검수 기준: `features/infra/report-management/contract_report-management-apm-split.md` 전체 및 하단 🔄, 검수 요청서, 지정 인접 코드
- BE 대조: `C:/worktrees/report-apm-be`의 `ReportManagementController`, `RetentionSettingDto`, `UpdateRetentionSettingDto` 확인 완료. FE 경로·3필드 shape·필수값·범위와 일치
- 테스트: 요청대로 실행하지 않음. 소스와 테스트 코드만 검토
- 종합 판정: **수정 후 재검수**
- 차단 항목: **R1, R2, R3**

## 발견 사항

R1 · 필수 · `src/pages/setting/ReportManagement.tsx:49`, `src/hooks/useQueryParams.tsx:46` · 탭 전환이 브라우저 히스토리를 남기지 않아 계약의 “뒤로가기 보존”을 충족하지 못한다 · `handleChangeTab`은 `updateParams`의 두 번째 인수를 생략하고, `useQueryParams`의 기본값은 `replace=true`다. 따라서 호스트 그룹→APM 전환 후 뒤로가기를 눌러도 이전 탭으로 돌아갈 히스토리 항목이 없다. `ReportManagement.test.tsx:119`도 파라미터 배열만 검사하여 이 문제를 잡지 못한다 · 사용자가 누른 탭 전환에는 `updateParams([...], false)`를 사용하고, 라이선스·잘못된 URL 정규화만 `replace=true`로 처리한다. 실제 `MemoryRouter` 히스토리 이동 테스트를 추가한다.

R2 · 필수 · `src/pages/setting/ReportManagement.tsx:77`, `src/pages/setting/components/RetentionSettingForm.tsx:68` · 편집 중인 보존 설정이 탭 전환 또는 재조회로 조용히 사라질 수 있다 · `destroyOnHidden` 때문에 탭을 떠나는 즉시 폼이 언마운트되어 미저장 값이 소멸한다. 같은 탭에서도 조회 결과 객체가 변경되면 `useEffect`가 무조건 `form.setFieldsValue(retention)`을 실행한다. 서버 값이 다른 상태로 포커스 재조회되거나 캐시가 무효화되면 dirty 필드를 덮는다. 현재 테스트는 최초 hydration과 저장만 검사하고 dirty 상태에서의 탭 전환·재조회는 검사하지 않는다 · 계열별 draft를 부모에 보존하거나 탭 이탈 확인을 제공한다. 조회값은 최초 hydration 또는 `!form.isFieldsTouched()`일 때만 적용하고, 원격 변경은 알림 후 사용자가 새로고침하도록 한다.

R3 · 필수 · `src/pages/setting/components/RetentionSettingForm.tsx:60`, `:93`, `:112` · 보존 설정 GET 실패가 계약 기본값으로 위장되어 실제 설정을 덮어쓸 수 있다 · 쿼리의 `isError`를 무시하고 폼에 `RETENTION_DEFAULT(true/52/24)`를 항상 넣는다. GET이 네트워크 오류나 403으로 실패하면 로딩이 끝난 뒤 기본값과 활성화된 저장 버튼이 나타난다. 관리자가 저장하면 읽지 못한 실제 값을 기본값으로 덮어쓴다. “행 없음” 기본값은 BE가 정상 응답해야 하는 계약이므로 FE fallback과 구분해야 한다. 테스트도 PUT 실패만 있고 GET 실패가 없다 · 조회 성공 전까지 폼을 비활성화하고, 실패 시 오류·재시도 UI를 표시한다. GET 실패 시 PUT이 호출되지 않는 테스트를 추가한다.

R4 · 권장 · `src/pages/setting/ReportManagement.tsx:38`, `:44`, `:82`, `src/__tests__/ReportManagement.test.tsx:145` · 라이선스 없는 콜드 로드에서 APM 탭과 내용이 잠시 나타났다 사라지며 URL도 `?tab=apm`으로 남는다 · `licenseLoading || allowsFeature("APM")`는 계약과 일치하지만 로딩 중에는 APM 탭과 자식 조회를 실제로 마운트한다. 라이선스 없음이 확정되면 `destroyOnHidden`으로 APM 폼의 입력이 사라지고 화면만 호스트 그룹으로 바뀐다. URL을 정규화하지 않아 이후 라이선스 상태가 허용으로 바뀌면 동일 URL에서 APM 탭으로 다시 튈 수 있다. 테스트는 로딩/비허용 상태를 각각 정적으로만 렌더하여 이 전환을 검사하지 않는다 · 계약의 optimistic 노출을 유지하더라도 비허용 확정 시 `tab=host-group`으로 `replace` 정규화한다. 로딩→비허용 rerender 테스트를 추가한다. 깜빡임 자체를 없애려면 계약의 노출 정책 변경이 필요하다.

R5 · 권장 · `src/pages/setting/components/ReportListTable.tsx:120`, `:229`, `src/components/Table/DmoveTable.tsx:338` · APM 상세 진입이 포인터 클릭에만 의존한다 · 제목은 `Typography.Link`지만 `href`나 자체 클릭 핸들러가 없고, 실제 이동은 포커스 불가능한 테이블 행의 `onClick`에서만 수행된다. 키보드 사용자는 APM 상세를 열 수 없다 · 제목에 실제 `href={apmReportDetailPath(id)}` 또는 React Router `Link`를 제공한다. 행 전체도 링크로 유지하려면 `tabIndex`, `role`, Enter/Space 처리와 체크박스 이벤트 전파 방지를 함께 적용한다.

## 확인 완료 사항

- APM 보존 API는 FE의 `GET/PUT admin/reports/retention/apm`과 BE의 `/admin/reports/retention/apm`이 일치한다.
- `TRetentionSetting`의 `enabled`, `weekRetentionWeeks`, `monthRetentionMonths`는 BE DTO와 일치하며 범위도 week 1~520, month 1~120으로 일치한다.
- 목록 쿼리 키에는 `type`이 포함되고, 호스트 그룹/APM 보존 키도 분리되어 쿼리 키 충돌은 없다.
- `useQueryParams`는 기존 URL을 복사한 뒤 지정한 네 키만 제거하므로 `id` 등 다른 파라미터는 보존한다.
- `resolveReportTab`은 알 수 없는 값과 빈 값을 `host-group`으로 접는다.
- 변경된 `kr.json`·`en.json`은 모두 JSON 파싱에 성공했고, 이번에 추가·변경된 키 집합은 동일하다. 저장소 전체 키 집합에는 기존부터 존재한 불일치가 있으나 이번 diff에서 추가된 것은 아니다.
- 정정 문구에는 검수번호·§·HTML이 노출되지 않는다.
- ZM-161 관리 콘솔 구조와 충돌하지 않는다. `report-management`는 `operations` 그룹의 `adminOnly` 항목이며 라우트도 `PageWrapper adminOnly`다. APM 상세 하위 경로의 관리 콘솔 활성 키 처리도 유지된다.
- 신규 interval·event listener·수동 subscription이 없어 이번 변경에서 명확한 메모리 누수는 발견하지 못했다.

## 중점 확인 4~8 판정

- 4. FE `kind` 분기: **수정 필요** — 호출처는 하나뿐이고 API 분기는 맞지만, 탭 전환·재조회 시 미저장 입력 보호가 없다.
- 5. 탭 파라미터: **수정 필요** — `id` 등은 보존되고 미지정 탭 fallback도 맞지만, 탭 전환이 `replace`라 뒤로가기가 동작하지 않는다.
- 6. 라이선스 축: **권장 보완** — 계약식과 일치하나 콜드 로드 깜빡임, APM 자식 선마운트, 비허용 확정 후 URL 불일치가 있다.
- 7. i18n·도움말: **승인** — 변경 키의 kr/en 집합과 문구 규칙, JSON 유효성 모두 이상 없다.
- 8. 테스트 고정: **수정 필요** — 계열별 URL·API 경로는 고정하지만 뒤로가기, dirty 폼 재조회/탭 이탈, GET 실패, 라이선스 상태 전환은 고정하지 못한다.