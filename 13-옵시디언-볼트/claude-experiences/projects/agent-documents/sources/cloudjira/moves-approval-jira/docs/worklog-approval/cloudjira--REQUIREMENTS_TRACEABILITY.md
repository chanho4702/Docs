# 요구사항 대응표

2026-10-13 요구와 작업 트리를 연결한다. “구현”은 코드 경로가 존재함을, “검증”은 해당 경계 테스트 또는 별도 사이트 실측 필요 여부를 뜻한다. 전체 릴리스 합격과 동일한 표현으로 사용하지 않는다. 최종 결과는 [README](cloudjira--README.md)의 검증 상태를 따른다.

## 원래 요구 1–6

| 요구 | 변경된 동작·사례 | 주된 코드 | 검증 근거 | 남은 제한 |
| --- | --- | --- | --- | --- |
| 1. 입력 패널 중복 제거 | Jira 이슈는 Approval 입력, Workforce Jira 패널은 이동 안내. Workforce 앱 내부 작성은 정상 DIRECT 유지 | Approval `entries/issue.jsx`, `WorklogTab`, `LinkedWorklogPanel`; Workforce `PanelWorklogForm` | `WorklogTab.test`, `WorklogDialog.test`, `PanelWorklogCreate.test` | 실제 Forge 이슈 iframe/메뉴 배치는 사이트 확인 필요 |
| 2. 건별 요청·자동 적재 | 저장 뒤 `worklogAutoRequest`/wa 정책으로 요청; 후보 없으면 선택; 수동 정책은 명시 요청 | `WorklogRequestService`, `WorklogApprovalPanel`, `AutomaticApproverAccess` | `WorklogRequestService.test`, `WorklogApprovalFlow.test` | 자동 요청은 자동 승인 아님; 반려 동일 지문은 무한 자동 재접수하지 않음 |
| 2. 일괄 승인 | 업무함에서 여러 워크로그 선택; 성공 건만 선택 해제 | `InboxService`, `InboxTable`, `BulkApproveBar`, `bulkSelection` | `InboxService.test`, `bulkSelection.test`, `InboxPage.test` | 개별 권한·경합 실패는 부분 실패로 남음 |
| 2. 마감 후 승인분 집계 | 정상 출처의 승인 확정 시간만 집계; 상태·제외 이유는 기록별 표시 | `WorkforcePublisher`; Workforce `ApprovalCertReader`, `CollabWorklogFetcher`, `ProjectCalendarService`, `RelationGraphService` | Publisher/decoder/reader/shared contract tests | 0일은 자동마감OFF. 게시 지연과 30KB `truncated` 누락분으로 완전성 제한 |
| 3. 연동 프로젝트 팀장 정책 | 담당 프로젝트 연결 이슈에 autoRequest/closeDays, lockApproved 고정 | Workforce `IssueApprovalSettingService`, `IssueApprovalBulkModal`, `approvalBulk` | 이슈 설정 서비스·bulk UI tests | 상대 capability·서명·팀장 프로젝트 권한 필요 |
| 3. 단독 정책 | 사이트 기본 자동 요청·마감과 자체 팀장 사용 | `SettingsRepository`, `WorklogApprovalSettings`, policy loader | `SettingsFeatureFlags.test`, `WorklogApprovalFlow.test` | 팀장 부재 시 수동 후보 선택 필요 |
| 3. 승인·마감 수정 금지 | 서버의 현재 승인·기간 상태가 수정/삭제를 거부, 화면은 읽기 전용 | `WorklogControlService`, `WorklogControlWorker`, certification projection | 요청·control worker/service tests | Jira 플랫폼 우회 REST/visibility 실제 효과는 배포 사이트 실측 필요 |
| 3. 소명·재승인 | 기존 승인·인증 기준이 있는 기록의 필수 사유와 새 APPEAL 회차, 기존 잠금·확정 시간 유지 | `appealWorklogApproval`, `WorklogApprovalPanel` | request/appeal·projection·UI reason tests | 마감 미승인 건의 최초 승인 우회 불가, 투영 완료 전 불가, 자유 편집·자동 해제 없음 |
| 4. 누가 언제 무엇을 승인 | 결정자·시각·반려 사유·과거 회차 20개 pagination | `getWorklogCertification`, `ApprovalRepository.listHistory`, `WorklogApprovalPanel` | history/can* API·UI pagination tests | 현재 이슈 권한 없는 사용자에게 공개하지 않음 |
| 4. 연동 변경 이력·Workforce 조회 | 정상 관리 이슈 변경 관찰, Approval handoff 상세에서 승인·변경 이력 | `worklogHistory`, `WorklogHandoffPage`; Workforce `WorklogHistoryList` | history/control observation·handoff UI tests | 관측 이전 원문·확인 불가 actor 복구 보장 없음 |
| 5. 간단한 이슈 패널 | 입력→내 기록/상태→상세 순서, 중복 정책·직접 인증 패널 제외 | `WorklogTab`, `WorklogDetailModal`, `WorklogApprovalStatus` | 전체 UI 및 대상 tests | 320/480px 실제 iframe 렌더 검증은 별도 |
| 6. 기본 팀장·수동 선택 | 서버 후보 API로 기본값과 검색, 자기 승인 제외, 미결정 요청 승인자 변경 | `WorklogRequestService`, `listWorklogApprovalCandidates`, `WorklogApprovalPanel` | 후보·canChangeApprover·UI tests | 결정 시작 후 기존 승인자 강제 교체 불가 |

## 추가 지시

| 지시 | 처리 | 근거·검증 | 제한/상태 |
| --- | --- | --- | --- |
| 상태 승인은 삭제하지 말고 기능 제외 | runtime false, 설정·프로젝트 진입·manifest action에서 제외, 코드 유지 | SettingsFeatureFlags/transition tests, `manifest.yml` | 기존 workflow validator 모듈의 런타임 비활성 동작과 사이트 업그레이드 확인 필요 |
| Approval UI/UX 신경 쓸 것 | Atlaskit 기반, 서버 권한 버튼, 로딩·빈 상태·inline error·입력 보존·저장/접수 분리 | WorklogApprovalFlow/WorklogDialog tests, frontend report | 디자인 가독성과 좁은 화면은 실제 검토 범위 구분 |
| 설정이 직관적일 것 | 요청 시점/마감/승인자 중심, 승인 후 잠금 고정, 고급 진단 분리 | WorklogApprovalSettings, settingsNavigation | 고급 기록 규칙은 운영 필요상 남김 |
| 오래된 사전승인 설정도 정리 | `approvalMode` 입력·결재선 편집을 숨기고 기존값 비파괴 보존 | WorklogPolicy/IssueExceptionList tests | 내부 레거시 구현은 보존 |
| 감사자료 보관 강화 | 승인·인증·출처 핵심 근거 보호, export와 purge 분리 | retention tests, `01_audit_storage_review.md` | 원문 전체 백업 아님; 영구 보호 행은 export 후에도 공간 회수 불가 |
| 용량 차면 파일로 내보내도록 안내 | 관리자70/85/95% 단일 배너→데이터관리, 자동삭제 없음 | `StorageService.test`9건, StorageNotice admin guard | 자동 파일 저장·push/email 미구현; 측정은 테이블 통계 추정 |
| 사용량·비용 설명 | 200명×작성건수 시나리오, 공식가격·가정·한도 분리 | [비용 문서](cloudjira--COST_AND_CAPACITY.md) | 실측 확정 비용 아님, 타 설치/환경이 앱 무료한도 사용 가능 |
| 상세 설계·가이드·공식근거·아키텍처 | 이 폴더5문서와2HTML/JSON, 공식 Atlassian 문서 확인 | [설계](cloudjira--DESIGN_AND_IMPLEMENTATION.md), 다이어그램 receipt | 출시/실측의 대체물이 아님 |
| 동의 묻지 말고 계속 작업 | 세부 가역 변경·테스트를 범위 내 진행 | 작업 보고 | 도구 접근 승인과 제품 요구 재확인을 구분 |
| 적당한 단위 커밋 | 리더가 검증된 경로별 commit 관리 | 최종 git commit 기록 | 자식 에이전트 임의 commit/build/deploy 없음 |

## 보존 사실과 운영 성공을 혼동하지 않는 수용 기준

1. 정상 경로에서 1건 저장 후 동일 worklogId의 요청·결정·이력을 확인한다. 접수 실패를 주입해도 기록이 중복 생성되지 않아야 한다.
2. 팀장이 없는 작성자가 후보 선택으로 요청할 수 있어야 한다. 권한 없는 사람·자기 자신은 승인자로 우회할 수 없어야 한다.
3. 일괄 승인에서 실패 건만 남아야 한다. 승인 직후 게시를 지연시켜도 수정·삭제는 열리지 않아야 한다.
4. 0이 아닌 마감 유예일, 수동 CLOSED, 수동 REOPENED 각각에서 이슈별 정책과 집계를 확인한다. 0일을 월말 즉시 마감으로 안내하지 않는다.
5. 외부 원문 변경 후 확정 시간은 보존하고 CHANGED 표시가 나와야 한다. 추가 시간이 자동 승인되어서는 안 된다.
6. 기존 승인·인증 기준이 있는 기록의 소명 접수 시 기존 잠금·확정 시간을 유지해야 한다. 마감된 미승인 기록을 소명 API로 최초 승인하지 않아야 한다. 이전 반려·승인 사유가 pagination 뒤에도 보여야 한다.
7. 이슈 삭제 후 일반 조회의 권한 경계를 지킨다. 승인 export도 현재 권한 필터로 원본을 제외할 수 있으며, 변경 이력의 가린 기본 metadata export나 삭제 전 보관 파일과 구분한다. 저장 사실만으로 관리자에게 원문 열람을 보장하지 않는다.
8. 85/95% 경고 뒤 export·파일 확인·허용 정리를 시험한다. 보호된 승인 근거가 삭제되지 않아야 하며, 회수 불가능한 용량을 화면/문서에서 숨기지 않아야 한다.

보완이 필요한 제품 범위는 **대량 월 교환 문서 분할**, **영구 승인 근거의 검증 가능한 압축 아카이브**, **삭제 이슈를 위한 별도 권한 기반 감사 보관함**, **완전한 설명 원문 백업**이다. 현재 기능처럼 설명하지 않는다.

## 2026-10-14 추가 요구와 검토 반영

| 요구 | 구현 | 남은 수용 검증 |
|---|---|---|
| 연동 이슈의 입력 탭 한 개 | Workforce activity displayConditions, Approval 시간 추적 제공자 | 사이트에서 제공자 선택·서명 게시 반영 후 한 탭 확인 |
| 워크로그 입력 모달 | WorklogTab 작성 버튼 → Forge Modal | 실제 Jira iframe 크기 확인 |
| Workforce와 같은 설명 편집 | MDXEditor, Markdown↔ADF, 미지원 원본 읽기 전용 보존, 미변경 설명은 PUT에서 생략 | 실제 Jira 서식 저장 대조 |
| 계획·투입·진행률 필드 | Workforce 읽기 전용 숫자 필드 3개 | 설치 업그레이드·Jira 화면 배치; 기록공수는 승인 확정공수가 아님 |
| 앱 API 공개 | 최신 결정으로 Approval apiRoute 제거; 내부 연동은 entity property로 단일화 | 과거 등록 custom scope는 route 미연결 상태 |
| Workforce 팀 구성 동기화 | 사용자 property `movesRms.org` 서명 검증 후 팀/팀장/팀원 표시·권한 반영 | 다른 사용자 property 읽기 권한과 서명 수신 실사이트 확인 |
| Claude 적극 활용 | 실제 Claude CLI 읽기 전용 검토, 확인된 결함 6건 보완 | 최종 통합검증 기록 참조 |
| 승인·마감 차단 증명 | 단계별 HTTP 진단 강화, 차단 검증 문서와 수용 매트릭스 | 실사이트 직접 PUT/DELETE 증거는 미수집 |

리뷰 보완: 재처리 실패 한 행이 다음 행을 막지 않도록 커서를 전진시키고 다음 순환에서 재시도한다. 소명 승인 대상은 원래 승인 snapshot으로 고정하고 현재 변경값은 observation으로 분리한다. 구 인증 기록은 새 승인으로 덮어쓰지 않는다. 기간 제출/승인/마감 사유를 구분한다. 자동 요청은 첫 작성자의 서명된 조직 문서도 확인하되 실패를 팀장 확인 성공으로 처리하지 않는다. Workforce는 외부 삭제된 승인 기록의 서명된 확정분을 현재 열람 범위 안에서 보충한다.

자동 요청의 다른 사용자 프로퍼티 조회는 실제 Jira 앱 권한 확인이 필요하다. 권한 거부나 검증 실패 시 캐시가 없으면 승인자 선택 필요 상태를 유지한다. 삭제 보충은 서명 문서 갱신 후 가능하며, 삭제된 이슈 자체의 열람 권한 문제를 해결하지는 않는다.
