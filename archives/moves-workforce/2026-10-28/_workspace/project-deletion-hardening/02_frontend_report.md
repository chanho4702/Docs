# 프로젝트 삭제 프론트 보완

## 변경

기존 미커밋 변경과 리더가 적용한 최초 실패 상태 보존을 유지했다. `ProjectList.jsx`, `useKanbanMutations.js` 양쪽이 `projectDeletionState.js`의 동일한 DTO 검증을 사용한다. projectId 불일치/누락, 알려지지 않은 status, completed와 status 모순, retryable 누락은 FAILED로 내려 자동 재호출을 중지한다. bridge reject와 success:false는 첫 호출부터 모달에 남고 안전 오류 코드를 보존한다. 권한 거부/대상 부재는 재시도 버튼을 제공하지 않는다.

`ProjectDeletionStatusModal.jsx`는 오류 원인과 조치, 중단 단계, 오류 코드, 접근 불가 이슈 건수를 표시한다. 백엔드와 협의한 lastError {code,stage}만 사용하고 원본 message는 표시하지 않는다. Jira HTTP 401/403/429 및 나머지 HTTP 실패를 번역으로 안내하고 SQL 실패 단계도 구분한다. retryable=false를 존중한다. 실패 모달 닫기와 Escape 동작을 지원하며 처리 중에는 닫기를 막는다.

완료 tombstone의 status=COMPLETED/completed=true/retryable=false를 받으면 양쪽 모달을 닫고 자동 continuation을 멈춘다. 완료 상태를 실패 모달로 보여 주지 않는다. 실패/중간 상태에서 칸반 카드 낙관적 제거를 롤백하고 최종 완료 시 제거를 유지한다.

## 계약과 캐시

- 소비: deleteProject의 content.deletion. projectId/status/completed/retryable 필수, lastError.code/stage 및 blockedIssueCount 선택 표시.
- 실패 envelope: error.code만 안전 형식으로 정규화. 임의 error.message/cause는 미표시. 네트워크 오류는 요청 결과 미확인으로 안내하여 실패 확정과 구분한다.
- 신규 TanStack Query key 없음. 기존 kanbanQueryKeys와 invalidateProjectViews를 유지한다. 목록의 완료 시 목록/칸반/KPI 갱신, 칸반 settle 시 동일 무효화 계약 유지.
- 번역: locales/kr/project.json 및 locales/en/project.json 추가, npm run merge로 ko-KR/en-US 생성. 한글 인코딩과 키를 확인했다.
- 새 request/trace ID는 백엔드 응답 계약에 없으므로 생성하거나 표시하지 않는다.

## 검증

실행: static/ui에서 `npm test -- --runInBand src/pages/projectKanban/__test__/projectDeletionFlow.test.jsx src/pages/projectKanban/__test__/ProjectKanbanBoard.test.js src/pages/projectKanban/__test__/useKanbanMutations.test.js`

결과: 3 suites, 16 tests PASS. 새 테스트는 실제 React Query hook과 상태 모달을 렌더링하여 최초 envelope/bridge 실패, 오류 원문 비노출, 카드 복원, 재시도 후 완료 tombstone/모달 제거/카드 제거, malformed 또는 다른 프로젝트 DTO 중단, 접근 불가 건수/중단 단계, retryable=false/닫기를 검증한다. 기존 continuation 테스트에서 2.5초 이어가기 및 실패/완료 상태 재호출 중지 확인.

`npm run merge` 성공. 기존 MODULE_TYPELESS_PACKAGE_JSON 경고만 출력. 전체 FE 테스트와 CI=true build는 리더가 통합 검증한다. live Jira/브라우저 E2E 미실행. ProjectList 실제 렌더 통합 테스트는 미추가이며 공용 helper와 소스 소비 계약으로 대조했다.

## 확인한 한계

응답 유실 후 같은 모달의 재시도는 백엔드 tombstone 계약으로 복구된다. 브라우저 새로고침으로 메모리 상태가 사라지고 이미 부모 프로젝트가 제거되었다면 목록에서 복구 버튼을 찾을 수 없다. getProjectDeletionStatus는 프로젝트 ID가 필요하므로 새로고침 복구를 위해서는 작업 ID 보관/복원 진입점 설계가 별도로 필요하다. 이번 범위에서 임의 localStorage 보존이나 새 작업 관리 화면을 도입하지 않았다. 사용자 추가 요구의 앱 전체 장애 표시 범위는 리더 확인 대상이다.

## 후속 구현: Sentry 및 Claude 검토

- `reportDeletionFailure`를 목록과 칸반의 backend/bridge/업무 상태 실패에 연결했다. 안전한 코드·단계만 보내며 식별자·원문은 전송하지 않는다.
- TTL 중복 억제와 분당 최대 20건 상한, 예상 권한 오류 제외, Sentry 실패 격리, beforeSend에서 reporter event의 자동 첨부 민감정보 제거를 적용했다. sendDefaultPii=false.
- Claude 지적에 따라 continuation effect의 mutation 객체 의존성을 안정된 mutate/isPending으로 변경했다. 무관한 재렌더가 대기 타이머를 초기화하지 않는다.
- reporter/훅/모달/continuation targeted 테스트 3 suites / 19건 통과. 최종 전체 frontend 테스트와 CI build는 Sentry 추가 후 재실행 중이다.
- 전역 모든 invoke의 자동 Sentry 수집은 범위 밖이며 실제 운영 Sentry 수신은 미검증이다. 상세는 `04_observability_review.md`.
