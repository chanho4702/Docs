검증 결과: **P0 3건, P1 8건, P2 2건. 현 설계는 구현 착수 전 보완이 필요합니다.**

모든 대상 파일은 UTF-8로 읽었습니다. 코드·파일 수정, 빌드·배포는 하지 않았습니다. 아래에서 `A:`는 승인 앱 리포, `WF:`는 워크포스 리포, `D:`는 `_workspace/linked-issue-schedule/01_architect_design.md`, `R:`는 같은 폴더의 `00_input/requirement.md`입니다. 확정된 사용자 결정은 변경 대상으로 삼지 않았습니다.

## P0 — 막아야 함

1. **“팀장만 편집”을 제안한 PermissionMap 등록으로 보장할 수 없음**
   - **근거:** `D:234`, `D:567`; `WF:src/permission/permissionGuard.js:26`, `:149`, `:150`; `WF:src/permission/TeamLeadFieldPolicy.js:68`.
   - **문제:** 기존 가드는 resource grant와 팀장 축을 **OR**로 처리하고, 관리자는 `isSatisfied`에서 바로 통과한다. `W(...) + teamLead` 등록만 하면 팀장이 아닌 관리자·resource write 보유자도 저장할 수 있어 `R:10`을 위반한다. 반대로 일반 팀장은 신규 resolver를 allowlist에 넣지 않으면 payload가 전부 제거된다. 설계의 변경 목록에는 이 등록이 빠져 있다.
   - **수정안:** 저장 서비스에서도 `TeamLeadAuthority`의 프로젝트별 판정을 **필수 조건**으로 검사한다. 관리자 우회 없는 팀장 필수 축과 `TEAM_LEAD_WRITE_ALLOWLIST` 등록을 명시하고, 관리자이지만 비팀장인 경우와 일반 팀장의 성공 경로를 함께 검증한다.

2. **창 데이터만 교체하면 작성 기간 제한이 실행되지 않는 경로가 남음**
   - **근거:** `D:302`, `D:306`, `D:308`; `A:src/domain/worklogControl/rules.js:160`, `:177`; `A:src/resolver/worklogControl/WorklogControlContext.js:63`, `:71`, `:103`.
   - **문제:** 설계는 스위치와 무관하게 설정을 적용하면서 `judgeCreate`·`judgeMutation`은 그대로 둔다. 기존 판정은 `linked && dateWindowOn`일 때만 창을 검사한다. 따라서 `window`만 채우면 사이트 스위치 OFF 또는 신호 만료로 `linked=false`인 경우 제한을 건너뛴다. 응답의 `dateWindow`도 기존 조건에서는 사라진다.
   - **수정안:** 설정 적용 여부에서 판정용 `windowLinked`와 `dateWindowOn`을 함께 도출하도록 명시한다. 통제용 `linked`와 분리하고, 미해결 설정도 스위치 OFF 상태에서 거부되게 한다. 작성·수정·삭제·편집 컨텍스트의 동일 조건을 계약으로 고정한다.

3. **`approval.ctl` 삭제·구버전 문서 재사용으로 직접 작성 경로가 다시 열림**
   - **근거:** `D:439`, `D:440`, `D:442`; `WF:src/resolver/approvalLink/ApprovalControlLookup.js:98`, `:101`; `WF:src/integration/approval/controlDoc.js:29`, `:45`; `A:src/domain/worklogControl/foreign.js:24`, `:26`.
   - **문제:** `ctl` 부재를 “승인 앱 없음”으로 단정하고 직접 작성한다. 유효한 과거 `ch` 없는 문서를 재사용해도 직접 작성한다. 현재 워크포스 조회기는 `rev` 최고값을 보존하지 않는다. `rms.issue`까지 삭제하면 로컬 제한도 사라질 수 있다. 출처가 정상인 워크포스 작성은 기존 외부 입력 판정에서 `PROVEN`으로 무시되므로 승인 앱 검사를 우회한 기록을 기존 감지기가 자동으로 해결하지 않는다.
   - **수정안:** 한 번 확인한 APP 창구는 프로퍼티 부재·낮은 rev·서명 실패로 DIRECT로 돌아가지 않게 한다. 명시적인 서명 해제만 허용하고, 최초 ABSENT와 기존 연동 문서의 소실을 구분한다. 검증 실패·신뢰 키 없음·경로 없음도 판정표에 추가한다.

## P1 — 고쳐야 함

4. **이벤트 경로가 새 기간·사전승인 설정을 집행하지 않음**
   - **근거:** `D:276`, `D:463`, `D:625`; `A:src/resolver/worklogControl/WorklogControlDetector.js:60`, `:183`, `:217`; `A:src/domain/worklogControl/foreign.js:20`.
   - **문제:** 기존 감지기는 출처·visibility·외부 입력 정책을 검사하며 `rms.issue`의 기간·사전승인 조건을 검사하지 않는다. 통제·외부 처리 OFF면 이벤트는 즉시 끝난다. 제공자 미선택 사이트의 기본 Log work, REST·Automation 작성은 새 설정을 우회할 수 있다. 승인 앱을 한 번도 열지 않은 이슈는 새 검증본도 없다.
   - **수정안:** “사전 차단”과 “사후 위반 관찰”의 보장 범위를 명시한다. 이벤트에서 최초 설정 수신과 위반 기록을 처리하거나 후속 작업으로 넘기되, 무조건 삭제로 확대하지 않는다. 변경된 기간·사전승인 조건을 외부 작성에 적용하는 검사·증거·알림 계약을 추가한다.

5. **사전승인 경로에 기간 재검증이 빠지고, NOT_REQUIRED도 최종값이 되지 않음**
   - **근거:** `D:317`, `D:322`, `D:550`; `A:src/resolver/worklogApproval/WorklogApprovalService.js:30`, `:85`, `:91`, `:156`; `A:src/resolver/worklogApproval/WorklogApprovalPolicy.js:23`, `:26`.
   - **문제:** `open()`은 정책·기간 잠금을 검사하지만 `judgeCreate`의 이슈 기간 창 검사는 하지 않는다. 기존 intent 재사용은 `finalizeCreate`로 바로 간다. 적용 경로의 `contextFor`도 창을 판정하지 않고 `beginCreate`에 전달한다. 또한 `read()`는 PREAPPROVAL일 때만 `config.required=true`로 바꾸므로, 기존 프로젝트 설정이 required이면 LINKED_ISSUE의 NOT_REQUIRED가 이를 해제하지 못한다.
   - **수정안:** 요청 생성·intent 재사용·승인 후 적용 직전에 같은 설정 수신 및 창 판정 함수를 호출한다. `config.required`와 effective approvalMode의 최종 우선순위를 명시하고, NOT_REQUIRED 및 기본 따름을 구분해 처리한다.

6. **조직 변경의 게시와 승인 앱 권한 회수가 연결되지 않음**
   - **근거:** `D:511`, `D:520`, `D:521`; `A:src/resolver/workforce/WorkforceInbound.js:162`, `:169`; `A:src/resolver/workforce/WorkforceOrgSource.js:24`, `:61`.
   - **문제:** 워크포스에서 타인 문서를 게시해도 승인 앱은 타인 org를 캐시로만 읽는다. 기존 팀원 문서가 있으면 역조회도 하지 않는다. 이동·퇴사 후 옛 팀장 문서가 sticky 상태로 남으면 옛 팀장의 열람·인증 범위가 유지될 수 있다. 새 팀원 문서와 옛 팀장 문서가 불일치해도 설계는 결재선만 팀원 문서를 따르고 TeamScope 축소는 명시하지 않는다.
   - **수정안:** 이동·비활성·팀장 변경 시 이전 권한을 회수하는 문서와 수신 완료 조건을 정의한다. 불일치 때 TeamScope를 교집합으로 좁히고, 권한 변경을 확인하지 못한 경우 신규 열람·인증을 거부하도록 한다. 게시 실패·크기 초과에서도 이전 권한을 계속 인정하지 않는 절차가 필요하다.

7. **같은 원천을 쓰더라도 권한 관계가 서로 일치하지 않음**
   - **근거:** `R:19`; `D:225`, `D:506`, `D:507`, `D:509`; `A:src/resolver/worklogCert/WorklogCertService.js:297`, `:512`.
   - **문제:** 편집자는 후손 팀까지 포함하지만 결재자·leads는 직속 팀만 포함한다. 이를 동일 판정이라고 표현할 수 없다. 특히 자식 팀장이 부모 팀장을 `leaderKeys`로 받더라도 부모 팀장의 `leads`는 `users.team_key=부모 팀`만 담으므로, 자식 팀장이 그 집합에 없으면 결재선과 인증 권한이 어긋난다. **추측:** 실제 소속 배치에 따라 이 사례가 발생한다.
   - **수정안:** 확정된 직속 결재 범위를 유지하면서 편집·결재·열람·인증의 관계별 행렬을 작성한다. `leaderKeys`에 지정한 결재자를 상대 문서의 `leads`에서도 일관되게 표현하고, 자기 승인 금지·루트 팀장·복수 팀장·팀장 소속 누락 사례를 포함한다.

8. **rev·CAS·감사 기록의 재사용 조건이 기존 코드와 맞지 않음**
   - **근거:** `D:147`, `D:252`, `D:293`, `D:329`, `D:619`; `A:src/resolver/workforce/WorkforceInbound.js:85`, `:121`; `A:src/resolver/workforce/WorkforceLinkRepository.js:416`.
   - **문제:** 기존 org 수신은 같은 rev의 다른 본문도 `STALE_REV`이며, 동일 본문에도 UPDATE한다. 설계의 EQUIVOCATION·변경 시에만 쓰기와 다르다. Jira의 read→PUT 사이에는 CAS가 없어 두 팀장이 같은 expectedRev를 통과하고 서로 덮어쓸 수 있다. 수신 CAS 패배 후 재료가 항상 같거나 최신이라는 보장도 없다. CAS 성공 후 감사 INSERT 실패 시 재수신으로 감사가 복구된다는 절차가 없다.
   - **수정안:** 새 typ의 revision 판정을 별도로 정의하고 CAS 패배 시 저장본을 다시 판정한다. 워크포스 저장은 이슈별 직렬화·리스 등으로 경쟁을 제어하고 결과 대조를 추가한다. 감사 id를 결정적으로 만들고 누락 복구 절차를 둔다. 동일 rev·동일 본문·다른 본문의 반환과 SQL 횟수를 각각 고정한다.

9. **만료 없는 서명 문서의 신뢰 철회·최초 재생·캐시 삭제 후 재생 정책이 빠짐**
   - **근거:** `D:145`, `D:146`, `D:199`, `D:284`; `A:src/integration/workforce/signature.js:84`, `:89`, `:90`; `A:src/integration/workforce/keyring.js:51`; `A:src/resolver/personalData/PersonalDataRepository.js:189`.
   - **문제:** 다른 이슈·사이트 복사는 서명 결속으로 막을 수 있다. 그러나 같은 대상의 과거 서명은 저장된 최고 rev가 없으면 다시 받아들인다. 전체 캐시 삭제도 그 방어를 없앤다. 키 신뢰 철회 후 검증 실패를 sticky로 처리하면 기존 허용값이 계속 쓰일 수 있다. `notAfter`는 서명 iat만 비교하므로 침해된 키의 과거 iat 서명을 막는 별도 정책이 필요하다.
   - **수정안:** 만료 없음은 유지하되 발행 키 철회와 기존 설정 적용 중지를 구분한다. 최고 rev/tombstone의 보존·초기화 조건과 캐시 복구 절차를 정의하고, revoked kid의 캐시 재사용 여부를 명시한다. 단순 프로퍼티 삭제는 저장본이 있을 때 fail-open이 아니지만, 최초 ABSENT의 처리까지 정의해야 한다.

10. **두 앱의 버전 불일치·재연결·부분 해제에 대한 배포 계약이 부족함**
    - **근거:** `D:126`, `D:183`, `D:262`, `D:344`, `D:560`, `D:779`; `WF:src/integration/approval/controlDoc.js:35`; `A:src/domain/worklogControl/rules.js:90`.
    - **문제:** 구버전 워크포스는 `ch`의 서명은 검증해도 반환 객체에서 버리므로 직접 작성한다. 새 워크포스도 ch 없는 ctl에서 직접 작성한다. 승인 설정 기능을 먼저 활성화하면 설정과 집행이 분리된다. 해제 신호와 null 설정 게시도 원자적이지 않아 실패·재연결 때 이전 설정이 되살아날 수 있다. 기존 NONE보다 새 설정만 먼저 수신되면 설정이 비활성인 상태가 남는다.
    - **수정안:** 수신 코드→워크포스 넘김 코드→능력 확인→APP 활성화→설정 편집 활성화→재정의 제거 순서를 명시한다. 양쪽 구버전 조합과 롤백을 테스트하고, 해제·재연결의 신호와 설정 rev를 연결해 부분 성공을 복구한다. v064~v066은 현재 코드와 충돌하지 않지만 구현 시 번호를 다시 확인해야 한다.

11. **현재 asApp 허용 범위를 넘는 호출과 이벤트 경로의 모순이 있음**
    - **근거:** `D:254`, `D:511`, `D:607`, `D:641`; `WF:AGENTS.md:51`, `:57`; `A:AGENTS.md:43`, `:44`; `A:src/resolver/worklogControl/IssueSignalRefresher.js:39`.
    - **문제:** WF의 현행 ⑧은 `movesRms.policy`만 허용하고 org는 본인 asUser다. 신규 issue·kb·타인 org asApp은 현행 규칙 안이 아니라 **규칙 확장이 필요한 설계**다. 승인 앱은 공유 Refresher를 issue GET으로 바꾸면서 “전부 asUser”와 “이벤트는 rms.issue를 읽지 않음”을 동시에 주장하지만 해당 Refresher는 APP 모드도 가진다. 관리자 org 재조회도 현행 규칙은 DELETE 관문 용도로 한정한다.
    - **수정안:** 자격·호출자·REST 경로·필드·용도·사유를 호출별로 명시한다. USER와 APP 조회를 분리하고, 필요한 AGENTS 변경을 선행 조건으로 둔다. 타인 org 게시에는 G1 외에도 인가·조회·rev 취득·실패 복구를 함께 정의한다.

## P2 — 개선

12. **유휴 SQL 증가 0과 활성 경로 비용을 구분해야 함**
    - **근거:** `D:274`, `D:276`, `D:738`, `D:739`; `A:src/resolver/worklogControl/IssueSignalRefresher.js:18`; `A:src/resolver/worklogPolicy/WorklogPolicyAuthority.js:19`; `A:src/resolver/workforce/WorkforcePublisher.js:535`.
    - **문제:** 이벤트 0건·빈 설치의 27/38 상한 유지 방향은 타당하다. 하지만 이벤트 전체가 SQL 0인 것은 아니다. 현재 Refresher는 미수신 설치에서 관문 SELECT 1, 신선한 행에서는 SQL 2를 사용하고, 갱신 시 추가 SELECT·DML이 생긴다. 새 설정도 통합되지 않으면 SELECT가 추가된다. `drainCtl`은 내용이 같아도 `markPublished`를 호출한다.
    - **수정안:** 표를 “전체 비용”과 “추가 비용”으로 나눈다. 준비된 스키마·무경합 기준 새 설정 최초 수신은 SELECT 1 + INSERT 1 + 감사 1, 변경은 SELECT 1 + UPDATE 1 + 감사 1로 명시하되 기존 정책 쿼리·프로브·실패 로그·CAS 재시도는 별도 산정한다. 빈 설치와 기존 데이터가 있는 무접속 설치를 구분해 검증한다.

13. **요구사항 추적과 계약 검증 기준이 일부 얕음**
    - **근거:** `R:7`, `R:17`, `R:19`, `R:23`; `D:199`, `D:207`, `D:452`, `D:520`; `WF:src/integration/approval/__test__/vectors.test.js:109`, `:120`.
    - **문제:** 요구 1의 새 하위 탭을 view 전환으로 표현했지만 동등한 탐색 경험인지 설명이 없다. 요구 4의 기간 일괄 입력은 비활성화 후 하루씩 이동만 설명하며 사전 선택값·범위 보존이 얕다. 요구 5는 조직 게시와 실제 수신·권한 회수를 혼동한다. 계약 테스트는 줄끝을 정규화하므로 요구된 **바이트 동일**보다 약하다.
    - **수정안:** 요구 1~5에 구현·검증·완료 조건을 각각 연결한다. 확정된 단계 분리는 유지하되 첫 단계의 범위 입력 대체 흐름을 명시한다. 계약 7파일은 raw byte 비교도 수행하고, 신·구 상대 앱의 ctl 검증·필드 추출·넘김 행동을 별도로 검증한다.

## 인용 대조 결과

표본 **24개**를 대조했습니다. 현재 두 리포의 계약 7파일은 **실제 바이트가 모두 동일**합니다.

| 설계 인용 | 실제 코드 대조 | 결과 |
|---|---|---|
| `D:40` → `WF:policySignal.js:13`, `:51` | values·locks를 빈 객체로 게시 | 일치 |
| `D:41` → `WF:policySignal.js:23–27` | TTL 28일, 잔여 7일에 갱신 | 일치 |
| `D:42` → `A:WorklogPolicyAuthority.js:13–33` | 검증·rev 판정·수신 반영 | 일치 |
| `D:42` → `A:IssueSignalRefresher.js:8` | 1시간 재조회 간격 | 일치 |
| `D:43` → `A:rules.js:88–102`, `:108` | 연동·NONE 해제·통제 유지 | 일치 |
| `D:49` → `A:WorklogPolicyService.js:31–36` | saveIssue 저장 경로 | 일치 |
| `D:49` → `A:worklogPolicy.sql.js:3–6` | issue override 테이블 | 일치 |
| `D:49` → `A:migrate.js:113` | v043 등록 | 일치 |
| `D:50` → `A:WorklogPolicyResolver.js:8–21` | 프로젝트·이슈·WF 조회와 병합 | 일치 |
| `D:51` → `A:PermissionMap.js:37–44` | 정책 resolver 8개 등록 | 일치 |
| `D:52` → `A:SettingsService.js:504–509` | 프로젝트 정책 감사 기록 | 일치 |
| `D:53` → `A:TimesheetService.js:269–271` | 정책 값·출처·revision 복사 | 일치 |
| `D:60` → `WF:IssueWorklogControlService.js:225–282` | 직접 POST, 승인 앱 상한·잠금 검사 없음 | 일치 |
| `D:61` → `WF:WorklogModal.jsx:444–456` | 부분 생성 실패 시 직접 삭제로 복구 | 일치 |
| `D:68` → `A:contract.js:258–267` | org 팀·팀장·leads·cap·rev 구조 | 일치 |
| `D:69` → `A:WorkforceInbound.js:165–180` | 본인 읽기만 갱신, 타인은 캐시 | 일치 |
| `D:71` → `WF:orgCap.js:10–14` | 팀 구조 미게시 | 일치 |
| `D:138` → `A:signature.js:12`, `:38–42` | typ·cloudId·ent·kid·iat·body 서명 | 일치 |
| `D:147` → `A:WorkforceInbound.js:85–88` | 동일 rev의 다른 본문도 STALE_REV | **오류: EQUIVOCATION 아님** |
| `D:183` → `A:signature.js:16`, `:45` | 모르는 키도 서명 대상 | 일치. 행동 호환까지 보장하지 않음 |
| `D:184` → `A:WorklogControlCtl.js:56–60` | 삭제 조건은 실제 `:61` | **줄 오류** |
| `D:232` → `WF:PrincipalResolver.js:117–125`, `:153–193` | 후손 팀·인원 쓰기 집합 | 일치 |
| `D:284` → `A:signature.js:74–113` | 대상 변경은 재구성한 바이트의 서명 실패 | **오류: TARGET_MISMATCH 반환 없음** |
| `D:294` → `A:migrate.js:136–138` | 사용된 번호는 v061~v063 | **오류: v064~v065까지 사용했다는 서술** |

총평:  
요구 1~5는 모두 언급됐지만 권한 강제·조직 회수·외부 작성 집행의 완료 조건이 부족합니다.  
서명 결속은 위조·다른 대상 복사를 막지만 같은 대상 재생과 신뢰 철회는 별도 설계가 필요합니다.  
재정의 데이터·과거 policy_evidence 보존과 PermissionMap 삭제 방향은 타당하며 v064~v066은 현재 충돌하지 않습니다.  
유휴 SQL 증가 0은 빈 설치 기준으로 검증 가능하지만 최초 호출·이벤트·기존 데이터 비용까지 입증한 주장은 아닙니다.  
P0 해소와 P1의 경로별 계약·버전 조합 검증을 완료한 뒤 구현에 착수하는 것이 적절합니다.