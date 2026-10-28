# 리포트 관리 APM 분리 FE 3차 재검수 결과

- 종합 판정: **수정 후 재검수**
- 차단 항목: **R2**
- 검수 범위: 미커밋 수정 12개·신규 2개 전체
- 테스트: 요청대로 실행하지 않고 소스로만 판단
- 파일 변경: 없음

## 발견 사항

R2 · 차단 · [ReportManagement.tsx](C:/worktrees/report-apm-fe/src/pages/setting/ReportManagement.tsx:145), [RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:137), [ReportManagement.test.tsx](C:/worktrees/report-apm-fe/src/__tests__/ReportManagement.test.tsx:97) · 라이선스 강제 전환 경고가 실제 폼에서는 누락된다 · 라이선스가 회수되면 렌더 단계에서 `visibleTabs`가 먼저 APM 탭을 제거하고 `destroyOnHidden`이 폼을 언마운트한다. React는 삭제된 자식의 passive cleanup을 새 passive effect보다 먼저 실행하므로 폼 cleanup의 `onDirtyChange(false)`가 부모의 145행 정규화 effect보다 선행한다. 따라서 151행에서 dirty가 이미 `false`가 되어 `message.warning`이 호출되지 않은 채 입력이 사라진다. 현재 테스트의 폼 stub에는 실제 cleanup이 없어 이 순서를 재현하지 못한다 · 강제 전환 직전 dirty를 부모가 별도로 스냅샷하거나, 언마운트 cleanup보다 앞선 단계에서 경고·정규화를 처리한다. 테스트 stub에도 실제 폼과 동일한 unmount cleanup을 넣어 라이선스 회수 시 경고를 검증한다.

R2 · 보통 · [RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:121), [RetentionSettingForm.tsx](C:/worktrees/report-apm-fe/src/pages/setting/components/RetentionSettingForm.tsx:175) · 충돌 상태가 최신 서버 값과 어긋날 수 있고 dirty 판정 두 개가 서로 갈라진다 · 원격 값 B를 받아 `conflict=B`가 된 뒤 서버가 기준값 A로 되돌아와도 134행에는 반대 분기의 `setConflict(null)`이 없어 과거 B 경고가 남는다. 이 상태에서 “새로 불러오기”를 누르면 현재 서버 A가 아니라 오래된 B를 폼에 적용한다. 또한 저장 성공·새로 불러오기에서는 부모 dirty만 `false`로 만들고 Ant Form의 touched 상태는 초기화하지 않는다. 이후 로컬 변경이 없는 재조회도 계속 “손댄 폼” 분기로 들어가 불필요한 충돌을 만들 수 있다 · 명시적인 local-dirty 상태를 기준으로 hydration과 충돌 판정을 통일하고, 저장 성공·원격 수용 시 touched 상태도 초기화한다. 원격 B→기준값 A 복귀와 원격 수용 후 재조회 테스트를 추가한다.

## 항목별 확인

- R1: 부재는 URL을 건드리지 않고, 빈 값과 모르는 값은 `host-group`으로 정규화된다. `/origin` 선행 entry를 둔 테스트는 자동 정규화가 `replace`임을 실제 히스토리로 고정한다. 빈 값도 동일한 `goToTab(activeTab, true)` 단일 경로를 사용한다.
- R2 blocker: 같은 pathname에서 해석된 탭이 바뀌는 클릭·뒤로가기·앞으로가기는 모두 차단된다. 해석 결과가 같은 빈 값/모르는 값 정규화는 폼을 교체하지 않으므로 차단하지 않는 것이 맞다.
- R2 proceed/reset: 확인은 dirty를 내린 뒤 `proceed`, 취소는 dirty를 유지한 채 `reset`한다. React Router의 POP 차단은 URL을 현재 위치로 복구한 뒤 blocked 상태를 만들므로 취소 시 이전 탭 URL이 유지된다.
- pathname 변경 미차단: 이번 계약의 “탭 이탈 보호” 범위와 데이터 라우터의 인증·권한 리디렉션을 고려하면 화면 단독 정책으로는 수용 가능하다. 다만 일반 메뉴 이동도 입력을 버린다는 명시적인 제품 결정이며, 향후 전체 화면 보호가 필요하면 인증 경로를 예외 처리하는 전역 정책으로 다뤄야 한다.
- 확인창: `blocker` 상태 변화와 페이지 언마운트 cleanup에서 `destroy()`가 호출되어 뒤늦은 callback 문제는 해소됐다.
- R5: React Router `Link`의 일반 클릭은 SPA 이동하고 `stopPropagation`이 행 이동을 막는다. Ctrl/⌘/Shift 및 가운데 클릭은 `Link`가 가로채지 않아 브라우저 기본 동작에 위임된다.
- 데이터 라우터 전제: 운영 마운트는 [routes.tsx](C:/worktrees/report-apm-fe/src/routes/routes.tsx:880)의 ZM-161 `SettingsLayout` 자식이며, 최종적으로 [routes.tsx](C:/worktrees/report-apm-fe/src/routes/routes.tsx:1210)의 `createBrowserRouter`와 [App.tsx](C:/worktrees/report-apm-fe/src/App.tsx:114)의 `RouterProvider` 아래에 있다. 운영 코드의 다른 마운트 지점은 없다.
- 테스트 `Request` 폴리필은 해당 테스트 파일의 Jest 환경에만 존재하므로 다른 스위트로 새지 않는다.
- API 경로·계열별 query key·목록 분리·삭제 배열·i18n에서 새 회귀는 발견하지 못했다.

R1: **닫힘** — 세 입력 상태와 push/replace 동작이 소스상 정상이다.  
R2: **부분** — `useBlocker`, POP 복구, 확인창 cleanup은 맞지만 라이선스 강제 전환 경고와 충돌 상태 동기화가 남았다.  
R3: **닫힘** — 조회 실패 시 폼·저장을 차단하고 재시도 경로를 제공한다.  
R4: **닫힘** — 비허용 URL 정규화와 replace가 맞고, 콜드 로드 정책은 계약상 유지 사항이다.  
R5: **닫힘** — 링크 접근성, 단일 이동, 수정키·가운데 클릭 위임이 충족된다.