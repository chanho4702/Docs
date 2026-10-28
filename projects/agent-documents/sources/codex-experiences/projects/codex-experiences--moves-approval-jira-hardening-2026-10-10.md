# Jira 승인 전체 검수 후속 개선

작업 기간: 2026-10-08~2026-10-10. 저장소: `C:\CloudJira\moves-approval-jira`.

관련 경험: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-jira-full-review-2026-10-07|moves-approval-jira-full-review-2026-10-07]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-transition-auto-worklog-certification-2026-10-06|moves-approval-transition-auto-worklog-certification-2026-10-06]].

## 결정과 결과

사용자가 전체 검수 후 개선과 작업 단위 커밋을 요청했다. 커밋만 수행하고 푸시·배포·운영 자료 삭제는 하지 않았다.

- PIN은 사용자+salt 세대+rev+현재 잠금 조건으로 검증·변경·삭제 결과를 적용한다. 최초 등록 INSERT IGNORE와 동시 실패 누적을 검증했다.
- 내보내기 삭제 허가는 client cutoff/count가 아니라 서버 owner/kind/TTL/완주 세션과 실제 내보낸 ID·지문으로 제한한다. 정책 저장 키와 내보내기 키를 분리해 경합으로 보관 정책이 되돌아가지 않게 했다.
- 승인 원문은 현재 대상 열람 권한으로 좁힌다. 관리자 export에는 일반 목록의 참여 범위 전제가 없으므로 TIMESHEET/WORKLOG_CREATE 상세 권한을 별도로 확인한다. 워크로그 이력의 Q73 가린 자료 포함·삭제 정책은 구분하여 보존한다.
- 부분 자식 삭제 후 재개는 같은 부모 세대와 현재 권한을 재검사한다. SQL이 0행을 삭제했거나 지문이 바뀌면 성공으로 기록하지 않는다. 이력 PK 재사용은 observed_at 조건과 현재 지문을 확인한다.
- 필드 PUT 직전 UNKNOWN fence를 저장한다. timeout/5xx/전송 후 중단/stale APPLYING 및 이전 FAILED/TIMEOUT도 재전송하지 않는다. 이전 TIMEOUT의 읽기 응답도 UNKNOWN으로 정규화해 새 요청·재시도 버튼과 서버 판정을 맞춘다.
- 워크로그 수집에서 24회 실패 후 페이지를 버리는 분기를 제거했다. 미완주 cursor와 watermark를 유지한다.
- 만료·알림은 원본 후보 키셋을 이어 읽고 페이지 내부 예산 종료에는 마지막 처리 행을 저장한다. 조회조차 시작하지 못하면 restart marker를 남긴다. 기존 5분 trigger는 미완주 단계만 이어받는다.
- 업무함·미읽음 건수에 현재 권한을 적용한다. incomplete의 0은 정확한 0이 아니며 UI는 …/N+로 안내한다. 알림 전체 읽음 버튼도 불완전 0 때문에 막지 않는다.

## 검증과 커밋

최종 순서: BE → UI → production UI build → Forge lint.

- BE: 108 suites / 1,479 tests PASS.
- UI: 50 suites / 419 tests PASS.
- build: exit 0. 업무함 gzip 45.73 kB, +187 B. 의존성 source map·Atlaskit CSS 계산 경고는 보존했다.
- Forge lint: exit 0, No issues found. 번역 merge/whitespace 검사 통과.
- 실제 Forge SQL/Jira의 경합·권한·전송 결과와 호출 비용은 로컬 mock 계약 테스트의 보장 범위 밖이다.

커밋: `d51cc2d` 스키마, `d1e487f` PIN, `dff4aac` 필드 UNKNOWN, `5f402f7` 보관 허가, `9a49838` 배치·집계, `075e6cd` 화면 연동. 작업 트리 clean, 빌드·생성 번역 제외, Co-Authored-By 없음.

보고서: `C:\CloudJira\moves-approval-jira\_workspace\review-hardening-2026-10-08\REVIEW.md`.

## 교훈과 남은 설계

클라이언트가 다운로드 완료를 주장하는 것과 서버가 실제 반환한 자료의 범위는 별개의 경계다. 서버에는 실제 반환한 ID와 내용 지문을 저장해야 늦게 들어온 과거 자료까지 삭제하지 않는다. 목록의 참여 SQL 전제를 관리자 export에 그대로 가져가면 상세 원문 권한이 넓어질 수 있다.

커서 예산은 페이지 바깥만 확인하면 충분하지 않다. 페이지 중간 및 첫 조회 이전 소진까지 다음 tick에서 재개할 수 있어야 한다. 이미 발송했거나 정책으로 제외된 후보도 원본 스캔 진행에 포함해야 뒤 후보가 영구히 막히지 않는다.

검증은 i18n 키 존재만으로 충분하지 않다. PowerShell에서 Python stdin으로 한글을 전달한 변경이 물음표로 손상된 사례를 발견했고 직접 UTF-8 patch와 원문 읽기로 복구했다. 새 UI 테스트는 저장소의 React createRoot/act 방식과 안정적인 mock 결과 참조를 사용해야 불필요한 의존성 추가나 effect 재렌더 루프를 피한다.

남은 과제는 Jira read-PUT 외부 편집 경쟁, UNKNOWN 결과 해소 절차, 부모 rev를 함께 바꾸지 않는 자식 생산자와 삭제 사이의 완전한 원자적 fencing, 영구 장애 워크로그 페이지의 ID별 영속 재처리 큐다. 키셋보다 앞에 새 후보가 생기면 완주 뒤 다음 원점 주기에서 처리한다. 내보내기는 DB 전체 복원 dump가 아니다.
