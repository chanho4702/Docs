# Moves Approval 로직·설계 검토 (2026-10-08)

- 대상: 현재 작업 트리(미커밋 라이선스·Sentry 변경 포함). 사용자 요청은 전체 평가·설계 검사이며 기능 수정·배포·커밋은 수행하지 않았다.
- 상세 보고서: `C:\CloudJira\moves-approval\_workspace\project-review-2026-10-08\review-report.txt`
- 결함 재현: 같은 폴더의 `review.test.js`. 현재 잘못된 동작을 기대하는 진단 테스트이므로 수정 후 정상 회귀 계약으로 바꿀 것.
- 주요 17건: 동시 승인/반려 후 APPROVED와 REJECT 원본 모순, DRAFT dedupe와 결정 클레임의 실패 복구 부재, 업무함 req_rev 역행, 보관 내보내기 BINARY UUID 변환 누락, 앱 설정 관리자의 페이지 권한 없는 보관 데이터 조회, getRequestDefaults의 this.loadPage 오타, 모달 표시/처리 requestId 불일치, PIN/위임 스페이스 정책 미적용, 적용 스페이스 설정 미강제, 영역 그룹 미확장, 목록 커서 조기 종료, 알림 스윕 첫 100건 정체, Flow 자식 교체 실패, PIN 카운터 경합, 실패한 회수 감사 이벤트, 알림 정책/라이선스 경로 불일치, 다음 단계 앱 알림 부재.
- 검증: 기존 백엔드 193건 + 진단 13건 = 206건 통과, UI 82건 통과, production build 성공(Atlaskit 경고), forge lint 0 errors/0 warnings/1 MAJOR_VERSION_RULE approval로 exit 1. 실제 Forge SQL 통합·운영 데이터·iframe E2E는 미검증.
- 교훈: 결정 원본과 파생 상태를 분리해도 종결 CAS와 리컨실러가 연결되지 않으면 수렴하지 않는다. SQL 문장/호출 횟수 mock 테스트에 더해 부분 실패 후 재개와 교차 실행을 검사해야 한다. export의 페이지 가시성과 purge 범위는 동일한 ID manifest로 묶어야 한다.
- 관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-g2-space-settings-2026-08-28|moves-approval-g2-space-settings-2026-08-28]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-region-macro-2026-08-26|moves-approval-region-macro-2026-08-26]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-f1-page-approval-2026-08-26|moves-approval-f1-page-approval-2026-08-26]]

## 1차 개선

- 사용자가 개선을 요청해 R03~R07, R09~R10과 R11 커서 부분을 수정했다. 상세 상태는 `_workspace/project-review-2026-10-08/improvement-result.txt`에 기록했다.
- 보관 삭제는 cutoff만 신뢰하지 않고 사용자 소유 exportId와 페이지별 ID 기록, 마지막 페이지 확인으로 묶었다. 삭제 시 현재 권한과 보관 정책을 다시 검사한다. 기존 내보내기 기록으로는 삭제할 수 없고 재내보내기가 필요하다.
- 결재함은 req_rev 역행을 막고 결정한 승인자의 차례를 해제한다. 스캔 예산 종료를 데이터 종료로 취급하지 않는다.
- 모달은 requestId를 조회에도 보내며 서버가 pageId를 대조한다. 영역 요청은 서버의 regionId로 조회·재상신한다. 페이지/영역 생성은 prepareRequest로 검증을 공유한다.
- 백엔드 정상 회귀 206건, UI 84건 통과. 과거의 결함 재현 진단은 `review.repro.js`로 보존하여 성공 검증에 섞지 않았다.
- 동시 승인/반려, 중간 실패 복구, PIN/위임 정책·카운터, Flow 원자성, 알림·스윕, 가시성 집계는 아직 미해결이다. 전체 개선 완료로 해석하지 않는다.
- 최종 UI build 성공(기존 Atlaskit source map·postcss-calc 경고). Forge lint는 코드 오류/경고 0, 기존 egress 변경의 MAJOR_VERSION_RULE 승인 항목 1로 exit 1. 배포·커밋 없음.
