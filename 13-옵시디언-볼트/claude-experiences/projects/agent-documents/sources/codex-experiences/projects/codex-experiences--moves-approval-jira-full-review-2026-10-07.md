# Moves Approval Jira 전체 검수와 보관 내보내기 개선 (2026-10-07)

## 범위

현재 작업 트리의 승인·권한·타임시트·워크로그·전환·필드 변경·보관·라이선스·PIN·UI 계약을 검토하고 기존 수정은 보존했다. 세부 결과는 저장소 `_workspace/full-review-2026-10-07/REVIEW.md`에 있다. 커밋·푸시·배포는 하지 않았다.

## 개선과 교훈

- BINARY(16) request_id를 문자열 IN 절로 조회해 보관 파일에서 결재선·이벤트가 빠졌다. UUID_TO_BIN 규약을 export에도 적용하고 eventId·단계 임계값·그룹 출처를 보존했다.
- 보관 정책 변경 후 삭제 범위는 마지막 내보내기와 현 정책 cutoff의 교집합이어야 한다. 무기한은 삭제 불가이며 표시 숫자도 실제 조건을 따라야 한다.
- export 테이블·컬럼 미준비를 빈 마지막 페이지로 답하면 불완전 파일이 삭제 허가를 만든다. STORAGE_NOT_READY로 실패해야 한다.
- 서버가 부속 자료를 반환해도 UI 파일에 쓰지 않으면 삭제 후 근거가 소실된다. 상세 JSON 시트에 반환 자료를 보존하고 30000자 단위·UTF-16 안전 분할을 적용했다.
- 실제 ExcelJS writeBuffer/load 테스트로 영어 History 예약 시트 이름에 의한 기존 실패를 찾아 Approval history로 고쳤다. 파일 테스트는 목록 배열 검증만으로 대체할 수 없다.
- 가시성 필터 후 스캔 예산을 다 썼다고 데이터가 끝난 것은 아니다. 업무함은 가시 행 0개라도 마지막 원본 커서를 유지한다.
- 일반 알림 게이트만 검사하면 직접 INSERT 경로(임박·독촉)가 라이선스를 우회한다. 알림 생성 경계마다 공통 판정을 적용하되 상태 정합성은 계속 돌린다.
- PIN 정책 읽기 실패를 기본값으로 숨기면 필수 검증이 생략된다. 변경 경계에서는 정책 실패를 전달한다.
- 인증 fingerprint가 문자열이면 객체의 hash를 읽는 증명서에서 값이 조용히 사라진다. 실제 대상 어댑터와 서비스의 계약을 함께 검증했다.
- 중첩 npm test에는 -- 구분자를 넣어야 루트 --runInBand가 내부 Jest까지 전달된다.

## 잔존 설계

내보낸 request ID 집합을 서버에서 고정하지 않은 삭제 허가, PIN 동시 실패 횟수 유실, approval 관리자 export와 Jira 건별 열람의 차이, field PUT timeout 재시도와 외부 편집 경쟁, 스윕 24회 실패 페이지 영구 건너뜀·첫 100건 후보 고갈, 목록과 집계의 범위 차이, 미적용 field-change 보관 보호가 남는다. 상세 JSON는 서버 반환 자료를 보존하며 전체 DB 복원 계약이 아니다.

## 검증

- Backend: 104 suites / 1437 tests 통과.
- UI: 50 suites / 409 tests 통과.
- UI 빌드 성공(Atlaskit source map/CSS 경고), Forge lint No issues found.
- 실제 xlsx roundtrip: 부속 자료·복수 결정·긴 문자열/이모지 복원, 다운로드 실패 confirm 금지 검증.
- 실환경 Jira/Forge SQL의 권한·UUID·트리거·impersonation·호출량은 로컬 테스트와 구분한다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-worklog-policy-hierarchy-cost-2026-10-06|moves-approval-worklog-policy-hierarchy-cost-2026-10-06]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-transition-auto-worklog-certification-2026-10-06|moves-approval-transition-auto-worklog-certification-2026-10-06]]
