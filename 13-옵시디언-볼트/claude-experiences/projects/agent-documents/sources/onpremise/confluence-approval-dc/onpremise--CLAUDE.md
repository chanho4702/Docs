# confluence-approval-dc

## 하네스: 승인 앱 개발

**목표:** Confluence DC 승인 앱의 수정·기능·UI 작업을 "Claude 스펙/설계/QA + Codex 구현" 파이프라인으로 수행한다.

**트리거:** 이 저장소의 코드를 변경하는 모든 작업(버그 수정, 기능, UI/UX, 리팩토링, 재작업)에는 `approval-dev` 스킬을 사용하라. 코드 수정 전에는 `approval-codebase-map`, UI 설계 전에는 `approval-ui-style`을 읽어라. 단순 질문·코드 읽기는 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-08-11 | 초기 구성 (에이전트 3, 스킬 3) | 전체 | 리뷰 이슈 수정 + UI/UX 개선 작업 착수 |
| 2026-08-11 | 빌드 명령 정정 (pwsh→powershell.exe, jar 잠금 우회) | agents/approval-qa, skills/approval-codebase-map | QA 1차 실행에서 발견 |
| 2026-08-11 | 첫 가동 완료: 배치 3개(백엔드 수정 7건, 서블릿 데코레이터화, 패널 pill/모달) 구현·QA·화면 검증 | - | 배치 2는 1회 재작업(FAIL 17건→PASS), Codex의 검증 우회(다크모드 조건 바꿔치기)를 QA가 적발한 사례 기록 |
| 2026-08-12 | 배치 4a/4b/4c/5a/5b 완료 (사이드 메뉴, 모달·매크로 통일, 이중 사이드바 대체 설계, 재승인 버전 기록 모델) | - | Codex 2회 FAIL 시 사용자 결정으로 Claude 직접 수정 경로 확립. QA 오진 사례(5a 2차)와 "전제 실측" 교훈은 progress-2026-08-12.md 참조 |
| 2026-08-12 | 파이프라인에 Phase 3.5(Codex 교차 검토)·Phase 4 문서 동반 갱신(features.md) 추가 | skills/approval-dev | 사용자 지시: 기능 문서 정리 병행 + 개발 후 Codex 검토 |
| 2026-08-12 | 배치 6a/6b 완료 (CANCELLED 회수, 요청 메모, 영역 본문 해시, 칩 레일·구체 필터, 로컬 타임) + 배치 5·6 화면 테스트 전 동선 PASS | - | 교차 검토가 C10 파손·정규식 StackOverflow 적발 — Phase 3.5 유효성 입증. 다음: 배치 7(성능·기반, docs/backlog.md) |
| 2026-08-12 | 배치 7a/7b 완료 (배치 하이드레이션, 서버 페이징 REST, 알림 인덱스, 스페이스 필터, 행 회수, 반려 인라인 스텝, 409 동선) | - | QA가 스펙 전제 오류(매크로 lazy expiration)와 Codex 허위 보고(경험 Vault)를 실측 적발 — progress-2026-08-12-2.md. 다음: 배치 8(서명 옵션+CC) |
| 2026-08-13 | 빌드·배포 철칙 5조 추가 (clean 좀비화·home 삭제·domain 임베드 게이트·Sitemesh style 파싱·UPM 재설치) | skills/approval-dev | 배치 8 배포 사고 3건(도메인 누락 jar, style 파괴, 좀비화+테스트 데이터 소실)에서 확립 |
| 2026-08-18 | 배치 8d/8e·8.5 검증 완료 + 설정 5탭 통합 + CSRF 필터. 이 세션은 사용자 지시로 **Codex 없이 Claude 직접 구현** | - | 8/15에 파이프라인 밖에서 만들어진 미커밋 1,349줄에서 치명 1·높음 3 적발 — progress-2026-08-18.md, operational-risk-2026-08-18.md |
