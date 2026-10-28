# 프론트 구현 보고

## 결과
전체 UI 테스트 **50 suites / 416 tests PASS**, 16.037초. `frontend-tests.json` success=true, failed=0. `npm run merge` 성공, 양쪽 새 한글/영문 원문을 직접 확인했다. 빌드·배포·커밋은 수행하지 않았다.

## 실제 연결
- `exportRetentionExcel`과 `exportExpiredHistoryExcel`은 첫 페이지의 sessionId를 모든 후속 페이지에 넘기고 마지막 파일 다운로드 성공 뒤 `{sessionId}`만 confirm한다. 원문이 비어 있는 중간 페이지도 cursor가 있으면 계속 진행한다. 세션 누락/불일치는 `RETENTION_EXPORT_REQUIRED` code로 표시한다. 중간 페이지·다운로드 실패는 confirm하지 않는다.
- 기존 Excel 상세 JSON 원본/큰 셀 분할 보존 경로를 유지했다. history Q73 가림 행도 기존대로 포함한다.
- fieldChange의 UNKNOWN 열거/라벨/행 안내/승인 직후 결과 안내를 추가했다. 상세와 행은 UNKNOWN에서 다시 적용 버튼을 숨긴다. 일괄 승인 결과는 적용 실패와 결과 불명확을 분리하여 알린다. 기존 TIMEOUT 안내의 재시도 권고를 제거했다.
- InboxPage의 내 차례·미읽음 badge와 InboxFilters 상태 pill은 incomplete=true 또는 조회 오류에서 0을 `…`, 양수를 `N+`로 표시한다. tooltip은 확인된 최소 건수이며 범위/권한 확인이 미완료임을 설명한다. 정확한 집계는 현재 보이는 요청 기준임을 안내한다. 공용 `utils/countDisplay.js`로 표시 판단을 공유한다.
- 보관 화면은 전체 만료 수와 현재 열람 가능 export 수의 차이를 안내한다. 이전 `expiredCount-purgeableCount`를 전부 새 기록으로 설명하던 안내를 제거했다. 삭제 후보 상한·재검사·내용 변경 시 새 내보내기·시작 시점부터 7일 허가 유효기간을 한국어/영어로 표시한다.

## 파일
`static/ui/src/features/settings/{exportRetentionExcel,DataSettings,WorklogHistoryRetentionSection}`, `features/worklogHistory/exportWorklogHistoryExcel`, `features/fieldChange/{fieldChangeModel,FieldChangeTargetHeader}`, `features/inbox/{InboxPage,InboxFilters,BulkApproveBar}`, `utils/countDisplay.js` 및 각 회귀 테스트. `locales/{kr,en}/{data,fieldChange,filter,inbox}.json` 양쪽 수정 후 merge. 생성된 ko-KR/en-US는 직접 수정하지 않았다.

## 검증 사례
실제 xlsx 저장/복원과 surrogate pair 분할 기존 회귀 유지. 추가 검증은 빈 중간 페이지 이후 동일 session confirm, 승인/이력 중간 페이지 실패로 다운로드·confirm 금지, UNKNOWN retry 플래그가 있어도 버튼 숨김, 일괄 UNKNOWN 별도 집계, incomplete 0과 양수의 실제 sidebar badge 표시이다.

## 미검증
번들 예산·forge lint·배포 환경 클릭/실제 파일 다운로드는 root가 모든 에이전트 종료 후 수행한다. 신규 scope/엔트리/쿼리키는 없다.

## root 최종 반영

알림 패널의 전체 읽음 버튼도 incomplete/error의 0을 정확한 0으로 간주하지 않도록 보강했다. 확정 0·불완전 0·조회 실패의 실제 버튼 상태 3개 회귀를 추가했다. 최종 전체 UI는 50 suites / 419 tests PASS이며 UI build와 Forge lint도 통과했다. 배포 환경 확인은 수행하지 않았다.
