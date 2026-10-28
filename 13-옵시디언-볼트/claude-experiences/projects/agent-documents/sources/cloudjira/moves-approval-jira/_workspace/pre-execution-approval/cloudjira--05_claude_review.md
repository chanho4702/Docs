# Claude 독립 코드 리뷰

2026-10-06. Claude Code Opus를 `Read, Glob, Grep`만 허용한 읽기 전용 모드로 실행했다. 파일 수정·shell·테스트·빌드·배포 권한은 주지 않았다.

## 결론

보안 P0는 발견하지 않았다. 권한 우회, 남의 작성자로 등록, 직접 등록 우회, resolver 3종 등록, owner+rev CAS를 직접 확인했다.

출시 전 수정 권고는 다음과 같다.

1. **P1 — 정책 동일성 비교가 무관한 변경에도 승인을 무효화한다.** `policySnapshotOf`가 확장된 그룹 구성원, Flow 전체 metadata, configRev, bindingRev를 모두 비교하여 그룹 구성원·Flow 이름·다른 편집자의 현재 선택이 바뀌어도 대기 요청을 만료시키거나 승인된 입력안을 BLOCKED로 만든다. 요청 당시 승인 단계는 이미 고정돼 있으므로 현재 그룹을 다시 확장할 이유가 없고 비용도 크다. 현재 Flow가 계속 허용되고 raw step 구조가 같은지만 비교하도록 권고했다.
2. **P2 — 생성 실패 입력안을 영구 차단한다.** FAILED 또는 오래된 CREATING을 다시 claim하라고 제안했다. 내부 확인 결과 request 조회가 DRAFT를 숨기며 엔진 생성이 여러 SQL에 걸쳐 있어 부분 생성물을 안전하게 판별·정리할 수 없다. 동일 requestId 재실행의 멱등성이 보장되지 않으므로 이 제안은 적용하지 않고 지원 확인 fail-closed를 유지한다.
3. **P2 — 반려·만료·취소 요청도 applyStatus 기본 WAITING 때문에 ‘등록 대기’로 보인다.** 승인 상태가 APPROVED가 아니면 등록 상태를 승인 대기 또는 등록 대상 아님으로 표시하도록 권고했다.
4. **P2 — 설정 전제 고지가 부족하다.** 시간 추적 제공자로 Moves Approval을 선택해야 앱 입력 화면이 사용되고, 전역 설정에서 프로젝트가 활성화돼야 필수 정책이 유효하다는 점을 설정 화면과 가이드에 더 명확히 표시하도록 권고했다.

## 영역별 평가

- 사용성: Workforce와 같은 `layout: blank`/`100vh`, 독립 adminPage 자동 높이 분리, required 분기, 승인 상태와 등록 상태 분리, UNKNOWN 대조·중복 경고는 적절하다고 평가했다. 승인 후 요청자가 직접 등록해야 한다는 알림 보강을 제안했다.
- 성능: 설정 11개·알림 lazy 분리와 설정 초기 gzip 약 430KB→178KB, invocation 범위 memo를 긍정적으로 평가했다. 현재 그룹 재확장이 가장 큰 불필요 비용이라고 지적했다.
- 문서: 앱 밖 경로 비차단, 요청자 asUser 등록, UNKNOWN 자동 복구 없음, Workforce 설치만으로 연동 완료가 아니라는 고지는 정확하다고 평가했다. 정책 변경의 실제 영향과 제공자/프로젝트 활성 전제를 보강하라고 했다.

## 실제 사이트 검증 권고

- Jira worklog POST property 저장·expand 조회·요청자 작성자 보존
- 그룹 Flow의 요청 후 그룹 구성원 변경과 Flow 단계 변경
- 제공자 미선택/프로젝트 비활성 상태
- v036~v038 마이그레이션·인덱스·보관 정리
- POST 직후 timeout의 UNKNOWN·수동 대조
- `layout: blank` iframe 높이·다크 모드·모달 왕복 스크롤
- 그룹 Flow 50건 일괄 승인 처리 시간

원본 CLI 출력의 핵심 파일 위치: `src/domain/worklogApproval/draft.js`, `src/resolver/worklogApproval/WorklogApprovalService.js`, `src/resolver/approval/target/WorklogCreateTargetAdapter.js`, `static/ui/src/features/worklogApproval/`, `docs/guide/ko/06-worklog-period-lock.md`.

## 보완 후 재검토

같은 Claude Code Opus를 다시 읽기 전용으로 실행해 위 네 항목만 재검토했다. 결과는 **P0/P1/P2로 재현되는 결함 없음, 네 항목 모두 통과**였다.

- 기존 요청 판정은 `required`, `projectEnabled`, 원래 프로젝트, 저장된 Flow의 현재 허용 여부, raw 승인 단계 구조만 비교하며 현재 selected Flow나 `valid`, revision, 표시 metadata, 확장 그룹 구성원을 비교하지 않는다.
- FAILED/CREATING 자동 재시도를 막는 근거가 ApprovalRepository의 DRAFT→approver→event→inbox→LIVE 다중 SQL 및 LIVE-only load와 일치한다고 확인했다.
- 목록·상세·증명서가 같은 등록 상태 helper를 사용하고 승인 대기/등록 대상 아님/등록 대기/실제 실행 상태를 구분한다고 확인했다.
- 설정 화면과 한영 가이드가 제공자 선택과 전역 프로젝트 활성 전제를 충분히 고지한다고 확인했다.

별도 실측 권고로, Flow 편집 저장 시 같은 principals 집합의 배열 순서가 바뀌는지 확인할 필요가 있다고 했다. 현재 raw 단계 해시는 배열 순서에 민감하다. 실제 편집기가 안정 순서를 보장하는지 확인 전에는 동작을 바꾸지 않았다.

## 프론트 수정 반영

등록 상태 오해를 제거했다. 목록·상세·증명서가 같은 helper로 승인 상태를 함께 판정하여 미승인 WAITING은 ‘승인 후 등록 가능’, 반려·만료·취소 WAITING은 ‘등록 대상 아님’으로 표시한다. APPROVED WAITING만 ‘등록 대기’이며 UNKNOWN/APPLIED 등 실행 사실은 승인 상태와 관계없이 유지한다. 목록 제목은 ‘내 워크로그 승인 요청 · 등록 현황’이다.

설정 전제도 명시했다. 백엔드의 projectEnabled=false 응답에는 전역 적용 프로젝트 활성화를 사이트 관리자에게 요청하도록 경고하고, Jira의 Moves Approval 시간 추적 제공자 선택이 필요하다는 설명을 고정한다. 현재 제공자 선택은 자동 감지하지 않으며 미선택 기본 입력은 사전승인으로 차단되지 않는다고 안내한다.

공통 승인 완료 알림을 새 종별 문구로 분리하는 변경은 범위를 넓히므로 후속 항목으로 남겼다. 현재 상세·설정의 요청자 본인 등록 안내는 유지한다. 관련 UI 결과는 `frontend-claude-remediation-test.log` 및 `02_frontend_report.md`에 기록한다.

프론트 보완 검증: **2 suites / 19 tests 모두 통과**, 번역 merge 성공. 빌드·Forge·배포·커밋은 실행하지 않았다.
