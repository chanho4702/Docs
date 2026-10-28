**2회차 판정: 해결 6건·부분 6건·반박 수용 1건. 새 P0 1건·P1 5건·P2 1건입니다.**

UTF-8로 읽고 두 저장소의 현재 작업 사본과 대조했습니다. 아래 **해결은 설계 보완의 적정성 판정**입니다. `rms.issue`·`windowEnforced`·`approvalEdges` 등은 아직 코드에 구현되지 않아 실제 수정 완료를 뜻하지 않습니다. 코드·파일 수정, 테스트·빌드·배포는 하지 않았습니다.
`D:`는 보완 설계, `A:`는 승인 앱, `WF:`는 워크포스입니다.

**1회차 지적별 판정표**

| 지적 | 판정 | 대조 결과와 남은 조건 |
|---|---|---|
| P0-1 팀장 전용 편집 | **해결** | D:242–247의 서비스 필수 `assertLeads`가 관리자·resource grant 우회를 막고, allowlist 추가가 일반 팀장의 payload 손실을 막는다. 실제 가드의 OR 구조와 부합한다. 다만 D:696에는 여전히 `W(...)`가 있어 등록 명세를 통일해야 한다. |
| P0-2 기간 창 검사 누락 | **해결** | D:358–369가 `windowEnforced`를 두 판정 인자와 응답 조건에 함께 전달한다. 기존 `rules.js:160,177`의 AND 조건을 충족하고 통제용 linked도 분리한다. 사전 승인 경로는 별도로 보완됐다. |
| P0-3 ctl 소실·재생 시 직접 작성 | **부분** | APP 기억과 명시 해제는 정상적인 소실·낮은 rev 문제를 닫는다. 그러나 사이트 KVS 기억의 원자적 갱신 계약이 없어 동시 호출로 기억을 되돌릴 수 있다(N3). “화면 밖 사전 차단 불가” 반박은 수용하지만 화면 안 경합까지 정당화하지는 못한다. |
| P1-4 외부 작성 집행 | **부분** | D:413–429가 사전 차단과 사후 관찰을 구분하고 PROVEN도 관찰 대상으로 삼았다. 다만 사전 승인 표식의 존재만 보는 계약은 위조에 취약하며(N1), 요청 없는 알림의 저장·조회 경로도 없다(N5). |
| P1-5 사전 승인 재검증·NOT_REQUIRED | **해결** | D:389–397이 required를 올리고 내리는 우선순위, 생성·재사용·적용의 `open()` 검사, 타임존을 명시한다. 현재 `read()`의 올리기 전용 처리와 intent 조기 반환을 정확히 겨냥한다. |
| P1-6 조직 변경 후 권한 회수 | **부분** | 교집합과 옛 팀장 문서 재게시로 한쪽만 갱신된 경우는 줄인다. 하지만 D:646은 팀원 캐시가 없으면 팀장 문서를 인정하고, D:648의 24시간 차단은 읽기 실패에만 적용한다. 게시 실패 후 옛 문서를 계속 정상적으로 읽으면 권한이 무기한 유지된다. 이를 보장 밖이라고 명시한 것은 회수 문제의 해결이 아니다. |
| P1-7 관계 불일치 | **반박 수용** | 프로젝트 편집 관계와 사람 결재 관계가 문자 그대로 같을 수 없다는 반박은 타당하다. `approvalEdges`의 양방향 투영은 자식 팀장 누락을 닫는다. 다만 Q15의 직속 기준을 구현·테스트에 확정하고, 루트 팀장 처리를 함께 고정해야 한다. |
| P1-8 rev·CAS·감사 | **부분** | typ별 규칙·CAS 재판정·결정적 감사 id는 개선됐다. 그러나 Jira PUT 순서와 rev 순서가 다를 때 영구 불일치가 남고(N2), CAS 후 감사 대기 표식 전 중단도 복구되지 않는다(N4). 쓰기 뒤 GET만으로 “둘 다 성공했다고 믿지 않음”을 보장할 수 없다. |
| P1-9 키 철회·캐시 삭제·재생 | **해결** | D:330–333은 철회 kid의 저장본 사용 금지, 최고 rev 보존, 전체 purge 제외, 최초 수신 재생의 한계를 명시했다. 만료 없는 결정 모델에서 최초 재생을 완전히 막지 못한다는 설명은 타당하다. 동일 rev 재생 위험은 새 수신 규칙의 문제로 N2에 포함했다. |
| P1-10 버전·재연결·부분 해제 | **부분** | rx·handoff·배포 조합표와 관측한 NONE의 `releasedIat`는 유효하다. 그러나 관측하지 못한 해제와 null 게시 실패는 여전히 옛 설정을 되살린다(D:339). sticky capability로 구버전 롤백을 배제한다는 주장도 성립하지 않는다(N6). |
| P1-11 asApp 범위·이벤트 모순 | **해결** | §13이 자격·호출자·REST·필드·용도를 구분하고 AGENTS 변경을 선행 조건으로 둔다. 실제 Refresher의 USER/APP 구조와 맞으며, 타인 org 게시의 G1 관문도 유지한다. |
| P2-12 유휴·활성 비용 | **부분** | 빈 설치와 활성 경로 추가 비용을 구분한 것은 적절하다. 그러나 D:893의 데이터 있는 무접속 설치가 ①과 같다는 표현은 대상별 `markPublished`와 모순된다. N건 대상의 비용과 27/38 빈 설치 예산은 분리해야 한다. |
| P2-13 요구 추적·계약 검증 | **해결** | §20, view 전환의 탐색 설명, 첫날·시간 보존과 남은 날짜 안내, raw `Buffer.equals` 계획이 지적을 닫는다. LF 정규화가 Windows 대응이라는 반박은 타당하지만 바이트 동일의 증명은 별도다. 현재 계약 7파일은 직접 byte 비교에서 모두 동일했다. |

**새 지적**

1. **N1 — P0: 사전 승인 표식 위조로 사후 검사 우회**
   - **근거:** D:425는 `moves.approval.worklog`가 없을 때만 위반으로 기록한다. 실제 코드는 표식을 DB의 적용 상태와 대조한다([Detector:162](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlDetector.js:162), [Repository:482](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlRepository.js:482)).
   - **영향:** 직접 작성한 기록에 임의 표식을 붙이면, 새 관찰·제출 검사가 프로퍼티 존재를 승인 증거로 취급할 수 있다. APP 출처도 현재 값과의 일치 여부를 구분해야 한다.
   - **수정안:** 관찰과 제출에 공용 DB 검증 함수를 사용한다. 승인 결과·적용 상태·operationId·worklogId·이슈·작성자·승인 입력값을 대조하고, 표식 존재만으로 면제하지 않는다. 위조·다른 기록 표식 복사·승인 후 외부 수정 사례를 추가한다.

2. **N2 — P1: 마지막 Jira 값과 최고 rev가 영구적으로 어긋날 수 있음**
   - **근거:** D:266–272는 리스 없이 read→PUT→GET을 수행하고, D:321–325는 동일 rev만 교체하며 낮은 rev는 거부한다. 실제 수신 CAS도 Jira 쓰기를 직렬화하지 않는다([Inbound:121](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceInbound.js:121)).
   - **재현:** 두 저장이 같은 expectedRev를 읽는다. 높은 rev 문서가 먼저 PUT·수신되고, 지연된 낮은 rev 문서가 나중에 PUT되면 Jira의 최종 값은 낮은 rev다. 승인 앱은 이를 계속 거부한다. 각각 상대 PUT 전에 GET하면 둘 다 SAVED도 가능하다. 동일 rev의 서로 다른 문서를 재채택하면 과거 허용값 재생도 가능하다.
   - **수정안:** 이슈별 게시를 원자적으로 직렬화하거나 게시 의도를 영속화하고 충돌 후 더 높은 rev로 재게시한다. 동일 rev·다른 본문은 충돌로 닫고, “Jira 최종 값으로 수렴”의 복구 계약을 별도로 둔다.

3. **N3 — P1: 사이트 작성 창구 기억의 동시 갱신으로 APP 차단 해제**
   - **근거:** D:531의 `{state,ctlRev}` KVS 키에는 원자적 비교·갱신 규칙이 없다. 저장소 내 기존 상태 코드도 KVS에 CAS가 없음을 명시한다([State:81](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlState.js:81)).
   - **재현:** 두 호출이 기억 rev=9를 읽고 각각 APP/11과 WORKFORCE/10을 검증한다. APP/11 저장 뒤 WORKFORCE/10이 저장되면 기억이 후퇴하고 직접 작성이 열린다.
   - **수정안:** 최고 rev와 상태 전이를 원자적으로 직렬화한다. “다시 읽은 뒤 set”만으로는 부족하다. 해당 보장이 마련되지 않으면 WORKFORCE 해제는 차단 상태로 처리한다.

4. **N4 — P1: 감사 복구 표식 자체가 유실되는 중단 구간**
   - **근거:** D:344는 CAS 성공→감사 INSERT→실패 시 `AUDIT_PENDING` 순서다. 실제 수신 UPDATE는 `last_result`까지 한 번에 저장할 수 있다([Repository:416](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceLinkRepository.js:416)).
   - **영향:** CAS 직후 프로세스 중단 또는 실패 표식 UPDATE 실패 시 다음 수신은 UNCHANGED라 감사가 영구 누락된다. 다음 설정이 먼저 들어오면 이전 감사의 복구 재료도 사라진다.
   - **수정안:** 수신 CAS와 함께 감사 대기 재료를 저장하고 성공 후 해제한다. 다음 변경이 이전 대기 재료를 덮지 못하게 하거나 영속 감사 outbox를 사용한다.

5. **N5 — P1: 요청 없는 위반 알림을 현재 알림 모델로 구현할 수 없음**
   - **근거:** D:428·925·1030은 외부 워크로그 위반 알림을 약속한다. 현재 생성 함수는 requestId를 필수로 요구하고([Service:181](C:/CloudJira/moves-approval-jira/src/resolver/notification/NotificationService.js:181)), 목록은 `approval_request`와 INNER JOIN한다([Repository:82](C:/CloudJira/moves-approval-jira/src/resolver/notification/NotificationRepository.js:82)).
   - **영향:** 결재 요청이 없는 직접 작성 위반은 생성이 거부되거나 알림 목록에서 사라진다. 템플릿 추가만으로 해결되지 않는다.
   - **수정안:** 요청 없는 알림의 저장·조회·권한·멱등 키·보관 계약과 필요한 migration을 §12·단계 2d에 추가한다. “로그 한 줄”과 “작성자 알림 한 건”을 각각 검증한다.

6. **N6 — P1: sticky capability 한 건으로 현재 상대 앱 버전을 보장**
   - **근거:** D:955·963은 `handoff` 문서 한 건으로 구버전 조합이 불가능하다고 주장한다. org는 만료 없이 sticky이며 타인은 캐시만 읽는다([Inbound:165](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceInbound.js:165)).
   - **영향:** 새 워크포스 접속으로 capability가 저장된 뒤 구버전으로 롤백하면 문서는 남는다. 승인 앱은 APP 전환을 허용하지만 실제 워크포스는 직접 작성한다. orgteam 전환에도 같은 문제가 있다.
   - **수정안:** capability에 배포 세대·유효기간과 활성화 시 최신 확인 계약을 둔다. 롤백 전에 capability 회수와 수신 확인을 요구하고, 새→구 롤백 후 APP 재활성화 거부를 테스트한다.

7. **N7 — P2: 보완 계약과 기존 테스트·작업 순서의 충돌**
   - **근거:** D:243의 grant 없음과 D:696의 `W(...)`, D:321의 `EQUAL_REV_REPLACED`와 D:976의 `EQUIVOCATION`, D:190의 everApp 유지와 D:994의 WORKFORCE 기존 동작이 충돌한다. D:936의 권고 순서에는 필수 2d도 빠져 있다.
   - **수정안:** §9·§17·§18을 최종 계약으로 통일한다. 대상 N건의 무접속 SQL 비용도 별도로 명시하고 빈 설치 27/38과 동일하다고 표현하지 않는다.

**보완 설계의 새 인용 표본 10개 대조**

| 설계 위치 | 파일:줄 표본 | 실제 확인 | 판정 |
|---|---|---|---|
| D:242 | `WF:src/permission/TeamLeadFieldPolicy.js:29–66` | allowlist 등록과 TEAM_LEAD 경로의 필드 제한 | 일치 |
| D:246 | `WF:src/permission/permissionGuard.js:107–138` | 현재 account/team 축만 지원하며 project 축은 없음 | 일치 |
| D:249 | `WF:src/resolver/approvalLink/IssueMembership.js:15–27` | 활성 프로젝트 DB와 앱 필드 소속을 함께 확인 | 일치 |
| D:263 | `WF:src/resolver/approvalLink/LinkSigner.js:41–44` | seed·kid·publicKey·crypto 상태 검사 | 일치 |
| D:264 | `WF:src/resolver/approvalLink/InstallCloudId.js:29–49` | explicit→설치→앱 context→runtime 순서 | 일치 |
| D:343 | `A:src/rdb/schema/ddl/auditDelegation.sql.js:3–12` | BINARY(16) audit_id PK·설정 감사 테이블 | 일치 |
| D:333 | `A:src/resolver/personalData/PersonalDataRepository.js:189–193` | accountId 부재 시 inbound 전체 삭제 대상 | 일치 |
| D:358 | `A:src/resolver/worklog/WorklogService.js:158–159` | windowLinked와 dateWindowOn을 별도로 전달 | 일치 |
| D:393 | `A:src/resolver/worklogApproval/WorklogApprovalService.js:58–61` | 기존 요청 존재 시 재검증 없이 반환 | 일치 |
| D:206 | `WF:src/integration/approval/__test__/vectors.test.js:133–140` | 형제 리포 비교도 LF 정규화된 문자열 사용 | 일치 |

**총평 — 3줄**

기간 창·팀장 강제·사전 승인 우선순위·asApp 경계·요구 추적의 보완은 실제 코드 구조에 맞습니다.  
사전 승인 증거 검증, 게시·KVS 경합, 감사 복구, 조직 회수와 capability 롤백은 아직 닫히지 않았습니다.  
새 P0/P1을 계약과 테스트 목록에 반영한 뒤 구현에 착수해야 하며, 현재 상태를 검증 완료로 판정할 수 없습니다.