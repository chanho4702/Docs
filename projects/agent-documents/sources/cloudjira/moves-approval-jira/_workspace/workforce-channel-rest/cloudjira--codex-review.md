## 요약

**출시 전에 수정이 필요합니다.** 상대 장애 중 오래된 설정으로 쓰기를 허용하는 경로와, 해제한 연결을 되살리는 상태 저장 경쟁을 확인했습니다.

두 리포의 `git status`·`git diff`와 신규 채널 코드를 UTF-8로 읽었습니다. 파일은 수정하지 않았습니다. 아래 1·2번은 원본 함수에 메모리 대역을 주입해 재현했으며, 전체 테스트·빌드·배포는 실행하지 않았습니다.

## 발견

표의 경로는 해당 리포 기준입니다. 기존 보고서의 발견 자체는 반복하지 않았습니다.

| # | 심각도(높음/중/낮음) | 리포 | 파일:줄 | 문제 | 공격·재현 시나리오 | 고치는 방법 |
|---|---|---|---|---|---|---|
| 1 | 높음 | 승인 앱 | [LinkedIssueSettingSource.js:232](/C:/CloudJira/moves-approval-jira/src/resolver/workforce/LinkedIssueSettingSource.js:232), [WorklogService.js:567](/C:/CloudJira/moves-approval-jira/src/resolver/worklog/WorklogService.js:567), [writeJudge.js:120](/C:/CloudJira/moves-approval-jira/src/resolver/channel/handlers/writeJudge.js:120) | **강제 재조회가 실패해도 72시간 이내 캐시를 쓰기 판정에 사용한다.** `force:true`여도 실패 시 `settingStale`만 설정하고 `settingUnresolved`는 세우지 않는다. `write.judge`는 정책 조회에 `refresh:true`도 전달하지 않는다. 설계 §4.3의 “STALE은 표시만, 쓰기·제출은 즉시 재조회”와 Q3에 어긋난다. | 팀장이 작성 기간을 좁히거나 사전 승인을 필수로 바꿨지만 알림이 유실되고 워크포스가 장애인 경우, 예전의 느슨한 설정으로 기록할 수 있다. **2시간 지난 캐시 + 통신 실패 + `force:true`에서 `active:true`, `settingUnresolved:false`, `linkUnavailable:false`를 재현했다.** | 쓰기·제출의 강제 재조회 실패는 캐시 유무와 무관하게 미해결로 반환하고 거부한다. `write.judge`도 현재 설정을 강제 조회하며 실패하면 DEFER한다. |
| 2 | 높음 | 양쪽 | 승인 [ChannelState.js:147](/C:/CloudJira/moves-approval-jira/src/resolver/channel/ChannelState.js:147), 워크포스 [ChannelState.js:106](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/ChannelState.js:106) | **상태 표시용 `recordOutcome`이 해제·재페어링 결과를 덮어쓴다.** 메모된 연결 객체 전체를 다시 저장하며 현재 `linkId`나 상태 세대를 비교하지 않는다. | 인스턴스 B가 옛 PAIRED 상태로 호출하는 동안 A가 연결을 해제한다. B가 뒤늦게 실패를 기록하면 옛 객체가 저장된다. 승인 앱에서 **`REVOKED → PAIRED(old-link)` 복원을 재현했다.** 재페어링 뒤에는 새 `linkId`까지 옛 값으로 돌아갈 수 있다. | 성공·실패 표시를 연결 상태와 별도 키에 저장하고 `linkId`로 구분한다. 연결 전이는 세대 비교·원자적 갱신으로 보호한다. 단순 `fresh:true` 읽기만으로는 읽기와 쓰기 사이 경쟁이 남는다. |
| 3 | 중 | 양쪽 | 승인 [PairingService.js:350](/C:/CloudJira/moves-approval-jira/src/resolver/channel/PairingService.js:350), [ChannelState.js:125](/C:/CloudJira/moves-approval-jira/src/resolver/channel/ChannelState.js:125); 워크포스 [PairingService.js:243](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/PairingService.js:243), [ChannelState.js:94](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/ChannelState.js:94) | **연결 해제가 미사용 연결 코드(`pending`)를 폐기하지 않는다.** 수신 `pair.complete`는 현재 REVOKED 상태보다 남아 있는 pending의 pin·만료를 기준으로 다시 연결한다. | A가 재연결 코드를 만든 뒤 B에서 연결을 해제한다. A의 수신 해제 경로는 자기 URL과 pending을 남긴다. B 관리자가 보관한 코드를 만료 전에 붙여넣으면 A에서 새 코드를 발급하지 않아도 다시 연결된다. URL만 아는 공격자의 서명 우회는 아니지만, 해제로 철회한 연결 승낙이 남는다. | 로컬·상대 해제 모두 pending을 폐기한다. 진행 중 `pair.complete`도 해제와 경쟁하지 않도록 pending 소비와 연결 전이를 같은 세대로 보호한다. 워크포스의 상대 코드 수락 경로도 자체 pending을 정리한다. |
| 4 | 중 | 워크포스 | [IssueApprovalSettingService.js:167](/C:/CloudJira/moves-workforce/src/resolver/approvalLink/IssueApprovalSettingService.js:167), [IssueSettingStore.js:41](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/IssueSettingStore.js:41), [IssueSettingMigration.js:113](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/IssueSettingMigration.js:113) | **팀장 설정의 `expectedRev` 검사가 저장과 원자적이지 않다.** 메모리에서 rev를 비교한 다음 무조건 `kvs.set`한다. 이관도 “없음 확인 → 쓰기”여서 신규 저장을 덮을 수 있다. | 같은 rev를 연 두 화면이 동시에 저장하면 둘 다 SAVED지만 마지막 저장만 남는다. 지연 이관이 기존 값 부재를 읽은 직후 팀장이 새 설정을 저장해도, 이관이 옛 property 값으로 덮어쓸 수 있다. 작성 기간·사전 승인 설정 손실이다. | 현재 rev를 저장 시점에 조건부로 비교하는 원자적 저장소를 사용한다. 이관은 원자적인 “없을 때만 생성”으로 처리한다. 프로세스 내부 잠금만으로는 다중 인스턴스를 보호하지 못한다. |
| 5 | 중 | 워크포스 | [linkResolve.js:35](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/handlers/linkResolve.js:35), [linkResolve.js:63](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/handlers/linkResolve.js:63), [ProjectSubscriptionQuery.js:70](/C:/CloudJira/moves-workforce/src/rdb/query/ProjectSubscriptionQuery.js:70) | **PROJECT 연결 판정이 사이트 전체 SPACE 구독 중 첫 500개만 본다.** 잘림을 감지하지 않고 나머지를 `linked:false`로 답한다. 기존 F2의 프로젝트 단위 연결 보완은 이 경계에서 완전하지 않다. | SPACE 구독이 500개를 넘고, 조회에서 빠진 프로젝트에 앱 필드 백필 전 새 이슈가 생기면 실제 전체 구독 이슈가 비연동으로 응답된다. 승인 앱의 기간·사전 승인·LINKED_ALL 판정에서 빠질 수 있다. | 요청 이슈의 Jira 프로젝트 ID로 구독을 직접 조회한다. 전량 조회를 유지한다면 페이지 처리하거나 잘림 시 확인 불가로 거부한다. |

## 확인했지만 문제없음

- **위조 요청의 DB 비용 차단:** 서명·사이트·nonce 검사 후에 KVS 페어링 상태를 읽는다. URL만으로 SQL·KVS 접근을 유발하는 경로는 확인하지 못했다. 승인 [ChannelServer.js:121](/C:/CloudJira/moves-approval-jira/src/resolver/channel/ChannelServer.js:121), 워크포스 [ChannelServer.js:133](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/ChannelServer.js:133).
- **서명 혼동 방어:** RPC 원문 바이트에 도메인 접두를 붙이고, 응답은 요청 nonce·방향·사이트·linkId·op에 결속한다. [envelope.js:31](/C:/CloudJira/moves-approval-jira/src/integration/channel/envelope.js:31), [envelope.js:187](/C:/CloudJira/moves-approval-jira/src/integration/channel/envelope.js:187).
- **actor·권한:** 송신 USER actor는 서버 scope에서 온다. R2는 actor별 캐시를 사용하고, 권한 응답이 정확히 `[actor]`일 때만 허용한다. 승인 [ChannelClient.js:60](/C:/CloudJira/moves-approval-jira/src/resolver/channel/ChannelClient.js:60), [ActorVerifier.js:122](/C:/CloudJira/moves-approval-jira/src/resolver/channel/ActorVerifier.js:122), 워크포스 [permissionGuard.js:212](/C:/CloudJira/moves-workforce/src/permission/permissionGuard.js:212).
- **공유 계약:** `src/integration/channel/*` 13개 파일을 직접 바이트 비교했고 모두 동일했다. SYSTEM의 단일 subject 제한·STATS 전용 제한과 닫힌 요청 스키마도 확인했다. [ops.js:312](/C:/CloudJira/moves-approval-jira/src/integration/channel/ops.js:312), [ops.js:470](/C:/CloudJira/moves-approval-jira/src/integration/channel/ops.js:470).
- **UsersReadApi:** 신원은 플랫폼 principal·installContext만 사용한다. 기존 `USER_MANAGEMENT` 가드를 재사용하며 응답 필드는 명시적 허용 목록이다. [UsersReadApi.js:23](/C:/CloudJira/moves-workforce/src/api/organization/UsersReadApi.js:23), [UsersReadApi.js:40](/C:/CloudJira/moves-workforce/src/api/organization/UsersReadApi.js:40), [PermissionMap.js:40](/C:/CloudJira/moves-workforce/src/permission/PermissionMap.js:40).
- **기존 지적 수정:** 강제 회전 시 REVOKED 처리, `UNVERIFIED` 전달·소비, OP_UNKNOWN 순서, LINK_DISABLED·RATE_LIMITED 처리, subject 예외 처리는 반영돼 있다. 해제 URL 개별 실패 처리와 orphan 상한 수정도 확인했다. 다만 상태 전이의 안전성은 위 2·3번이 남는다.
- **이관·유휴 비용:** 자기 서명·사이트·프로젝트·이슈 결속을 검증하고 이관 완료 전에는 옛 설정 property를 삭제하지 않는다. 정리 완료 표식 뒤 SQL을 실행하지 않는 경계도 있다. 워크포스 [IssueSettingMigration.js:55](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/IssueSettingMigration.js:55), [LegacyPropertyCleanup.js:53](/C:/CloudJira/moves-workforce/src/resolver/approvalChannel/LegacyPropertyCleanup.js:53), 승인 [PropertyCleanup.js:85](/C:/CloudJira/moves-approval-jira/src/resolver/channel/PropertyCleanup.js:85).

## 실측으로만 판단 가능

- 권한 없는 **활성 사용자**에 대한 `user/permission/search` 응답과 실제 이슈 보안 수준 반영.
- 콜드·중첩 호출·429 상황의 지연과 호출량. 특히 [ActorVerifier.js:128](/C:/CloudJira/moves-approval-jira/src/resolver/channel/ActorVerifier.js:128)의 6초 예산은 **새 호출 시작만 제한**하며, 이미 진행 중인 요청을 중단하지 않으므로 실행 전체의 6초 상한을 보장하지 않는다.
- 4xx·5xx에서도 서명 응답 헤더와 본문이 보존되는지, 실제 유료 설치의 `context.license`.
- production URL 도메인·egress, 해제·회전·재설치 후 URL 동작, 실제 TiDB 배치 쿼리.

운영용 prd 키가 keyring에 없는 점은 기존 보고서대로 남아 있다. 이는 미측정 문제가 아니라 **운영 배포 전 구성 작업**이다.