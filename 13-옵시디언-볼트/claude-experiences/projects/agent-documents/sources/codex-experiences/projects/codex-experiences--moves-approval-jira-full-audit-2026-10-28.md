# Moves Approval for Jira 전수 분석 — 2026-10-28

대상은 `C:/CloudJira/moves-approval-jira`이며 Confluence판 `moves-approval`과 다르다. 사용자 요청은 분석이므로 제품 코드 수정·커밋·배포 없이 진행했다.

## 결과와 근거

- 보고서: `C:/CloudJira/moves-approval-jira/_workspace/full-audit-2026-10-28/REVIEW.md`.
- 전체 백엔드 201 suites / 3,041 tests, UI 105 suites / 1,001 tests 통과. `check:bundle`, UI build, `forge lint` 통과. UI build에는 외부 라이브러리 source map·CSS 경고가 있다.
- 별도 재현 3 suites / 12 tests는 **문제 동작이 현재 발생함**을 확인하는 진단이다. 위치 `tmp/full-audit-2026-10-28/`. 수정 후 정상 동작 테스트가 아니며 정식 테스트에 그대로 편입하면 안 된다.
- 재현한 항목: 승인·반려 동시 저장 후 aggregate 불일치, 결정 claim 후 실패의 멱등 재시도 미복구, 업무함 투영 세대 역행·기결정자 내 차례, 회수 CAS 패배 후 감사 이벤트 잔존, CONTENT_CHANGED 만료 계약 불일치, 다음 단계 앱 내 알림 부재, 통제 증분 200건 반복, 결재선 프로젝트 교체 실패의 전역 범위 해석, 채널 `isActive`와 공통 `active` 계약 차이, SQL 테이블 프로브 오류의 validator PASS, 업무함 권한 장애의 정상 빈 결과, 부분 그룹 명부의 전원 승인 사용.
- 위 항목은 이 작업에서 **수정하지 않았다**. 후속 작업은 현재 HEAD에서 다시 확인해야 한다.
- npm audit --omit=dev: BE High 3, UI Critical 1 / High 10 / Moderate 3. DOMPurify Critical 조건은 현재 PDF 경로에서 확인하지 못했다. 패키지 경고와 실제 공격 가능성을 구분한다.
- bulkApprove 전체 deadline 부재, KVS 상태·pending 표식의 경쟁은 정적 위험으로만 분류했다. 플랫폼 실DB 경합·운영 라이선스·실브라우저는 미검증이다.

## 교훈

1. 결재자 행의 조건부 UPDATE와 parent CAS가 각각 있어도 요청 전체 결정 순서가 보장되지는 않는다. 확정 상태와 원본 결정의 불변식을 실제 경합 순서로 검증해야 한다.
2. 멱등 조기 반환 전에 부분 완료 작업의 수렴 여부를 확인해야 한다. 이벤트·반려 사유·대리인 정보의 복구 가능성도 함께 설계해야 한다.
3. false·빈 목록·null은 “정상 부재”와 “확인 장애”를 구별하지 못한다. validator, 승인 명부, 업무함에서 결과가 정반대가 될 수 있다.
4. 미완주 시 watermark를 유지하는 것만으로는 배치가 진전하지 않는다. 묶음 내부 keyset 커서와 고정 상한이 필요하다.
5. 저장소 검사 중 HEAD가 바뀔 수 있다. 시작 `6818bfc` → 최종 `d9e5351`의 3파일 변경을 확인하고 관련 handler 24건과 번들을 재검증했다. 최신 BADGE의 actor 권한 재검사 제거는 명시된 제품 정책이므로 이번 결함으로 분류하지 않았다.
6. 경험 노트의 Confluence판 의존성 해결·브랜치 문제를 Jira판에 그대로 적용하지 않는다. 현재 저장소·코드·환경을 먼저 대조한다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-jira-marketplace-docs-2026-10-20|moves-approval-jira-marketplace-docs-2026-10-20]] · [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-docs-refresh-2026-10-26|moves-approval-docs-refresh-2026-10-26]] · [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-worklog-simplification-2026-10-13|moves-approval-worklog-simplification-2026-10-13]]
