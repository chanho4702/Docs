# 리포트 관리 APM 분리 FE 재검수 결과

- 종합 판정: **수정 후 재검수**
- 차단 항목: **R1, R2**
- 검수 범위: 미커밋 수정 12개·신규 2개 전체
- 테스트: 요청대로 실행하지 않음
- 파일 변경: 없음

## 발견 사항

R1 · 차단 · [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:90) · `?tab=`가 정규화되지 않는다 · `rawTab` 원문을 사용하도록 고쳤지만 `if (!rawTab ...)`이 파라미터 부재와 빈 문자열을 동일하게 처리한다. 따라서 `?tab=cloud`는 고쳐지지만 `?tab=`는 그대로 남는다 · `rawTab == null`처럼 파라미터 부재만 구분하거나 `searchParams.has(tab)`를 사용하고 `?tab=` 테스트를 추가한다.

R2 · 차단 · [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:46), [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:88), [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:96) · dirty 확인은 탭 클릭만 보호하며 브라우저 뒤로가기와 라이선스 정규화는 우회한다 · `Modal.confirm`은 `handleChangeTab`에서만 실행된다. 브라우저 뒤로가기는 `rawTab`을 직접 바꿔 `activeTab`을 전환하고, 라이선스 비허용 전환은 먼저 APM 탭을 `visibleTabs`에서 제거한 뒤 effect가 `goToTab(..., true)`를 직접 호출한다. 두 경로 모두 `destroyOnHidden`으로 폼을 확인 없이 언마운트한다 · URL/history 전환을 navigation blocker 또는 pending-tab 상태로 통합하고, 라이선스 강제 전환도 dirty 폐기 여부를 명시적으로 처리한다.

R2 · 보통 · [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:102) · 열린 정적 확인창이 페이지 언마운트에 묶여 있지 않다 · `Modal.confirm` 반환 handle을 보관하거나 정리하지 않는다. 확인창이 열린 상태에서 브라우저 탐색으로 화면을 벗어나면 모달이 남고, 뒤늦은 `onOk`가 이전 `location`을 캡처한 `goToTab`을 실행할 수 있다 · confirm handle을 ref에 보관하고 페이지 언마운트 시 `destroy()`한다.

R2 · 보통 · [RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:98) · dirty 상태에서 원격 변경을 조용히 무시해 다른 관리자의 값을 다시 덮어쓸 수 있다 · 새 `retention`이 들어와도 `isFieldsTouched()`이면 비교나 알림 없이 반환한다. 사용자는 원격 변경 사실을 모르므로 “사용자가 새로고침해서 판단”할 계기가 없다. 전체 교체 PUT을 누르면 원격 변경이 소실된다 · 최초 hydration 값을 기준으로 새 응답과 비교하고, 달라졌으면 충돌 Alert와 새로고침/유지 선택을 제공한다. “토스트와 섞인다”는 반영 제외 사유는 이 데이터 충돌 위험을 해소하지 못한다.

R1/R4 · 보통 · [ReportManagement.test.tsx](C:/worktrees/report-apm-fe/src/__tests__/ReportManagement.test.tsx:244) · 정규화가 `replace`라는 테스트는 실제 히스토리 동작을 고정하지 못한다 · 단일 initial entry에서 뒤로간 뒤 `activeKind`만 검사한다. 라이선스가 없으면 raw URL이 `apm`이어도 `activeKind`는 항상 `HOST_GROUP`이고, 정규화를 실수로 push해도 effect가 다시 정규화하므로 통과할 수 있다 · 앞선 `/origin` entry와 pathname probe를 두고 한 번의 뒤로가기로 `/origin`에 도달하는지 검사한다. 반면 사용자 탭 클릭 후 뒤로가는 172~181행 테스트는 push 동작을 실제로 고정한다.

R5 · 보통 · [ReportListTable.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/ReportListTable.tsx:127) · 실제 `href`는 추가됐지만 수정키 클릭의 새 탭 동작을 막는다 · 모든 click에서 무조건 `preventDefault()` 후 SPA `navigate`를 실행하므로 Ctrl/Meta/Shift+클릭도 현재 탭 이동으로 바뀐다. 반영 기록의 “새 탭 열기 동작”은 완전히 충족되지 않는다 · React Router `Link`를 사용하거나 기본 primary click만 가로채고 modifier click은 브라우저 기본 동작에 맡긴다.

## 확인 결과

- 사용자 클릭 전환은 `push`, 자동 정규화는 `replace`로 분리되어 있다.
- `?tab=cloud` 같은 알 수 없는 값은 접힌 값이 아닌 `rawTab`과 비교해 정상적으로 정규화된다.
- 정규화가 반복해서 뒤로가기를 되밀어 무한히 맴도는 소스 경로는 없다. 다만 라이선스 동적 회수 직전 항목도 호스트 그룹이었다면 논리적으로 동일한 호스트 그룹 항목이 연속되어 뒤로가기 한 번이 화면상 무동작처럼 보일 수 있다.
- hydration 가드, 저장 성공 및 폼 언마운트 시 `onDirtyChange(false)`, 확인 전 탭 유지 동작은 구현되어 있다.
- R3은 제대로 보완됐다. GET 실패 시 Form이 렌더링되지 않고, 로딩 중에도 `disabled={!retention}`이므로 UI에서 PUT을 발생시킬 경로가 없다.
- `useDmoveQuery`의 네트워크 오류 1회 재시도는 QueryClient 기본값보다 훅 옵션이 우선하므로 실제 동작한다. 테스트의 2회 실패 및 8초 대기는 가짜 통과용 조정이 아니다.
- R4의 깜빡임 미제거 사유는 계약의 optimistic 노출 정책과 일치해 타당하다.
- R5에서 행 전체 접근성을 범위 밖으로 둔 판단은 제목 링크가 정상 접근성을 제공한다는 전제에서는 타당하다. 다만 수정키 클릭 문제는 남았다.
- 기존 승인 항목인 API 경로·DTO shape·계열별 query key·삭제 배열 분리·i18n 대응에서는 새 회귀를 발견하지 못했다.

R1: **부분** — push/replace와 일반 raw 값 정규화는 고쳤지만 빈 `tab` 값과 replace 테스트가 남았다.  
R2: **부분** — 클릭 전환과 재조회 덮어쓰기는 막았지만 history·라이선스 우회와 원격 충돌 알림 누락이 남았다.  
R3: **닫힘** — 오류 UI·재시도·기본값 제거·저장 차단 및 재시도 테스트가 모두 소스상 유효하다.  
R4: **부분** — 비허용 URL 정규화는 맞고 깜빡임 유지 사유도 타당하지만 replace 테스트가 이를 고정하지 못한다.  
R5: **부분** — 키보드 접근과 단일 SPA 이동은 개선됐지만 수정키 새 탭 열기가 깨져 있다.