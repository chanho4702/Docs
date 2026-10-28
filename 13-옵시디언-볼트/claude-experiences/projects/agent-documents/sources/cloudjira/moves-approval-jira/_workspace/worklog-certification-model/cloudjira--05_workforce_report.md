# 05 워크포스 리포 보고서 — worklog-certification-model (WF-1~WF-6)

작성: 2026-10-10 · 대상 리포 `C:\CloudJira\moves-workforce`(develop, 미커밋) · 입력 `01_architect_design.md` §4.6·§12, `02_backend_report.md` §4
커밋·배포·`forge deploy` 하지 않음. 워크포스의 기존 미추적 파일(pptx·png·`custom-scopes.yaml`·`LeaderTeamBackfill.test.js`)은 건드리지 않음.

## 결과 요약

| 항목 | 결과 |
|---|---|
| 워크포스 백엔드 `npx jest --runInBand` | **152 suites / 2,071 tests 통과** (착수 전 148 / 2,008 → +4 suites, +63 tests) |
| 워크포스 UI `npm test -- --runInBand` | **160 suites / 2,603 tests 통과** (착수 전 159 / 2,594 → +1 suite, +9 tests). 1회차에 `kanbanPagination.test.jsx` 1건이 시간 초과로 실패했으나 단독·재실행 모두 통과(이번 변경과 무관한 타이밍 흔들림) |
| 워크포스 UI `CI=true npm run build` | 통과, 번들 예산 안(main gzip 491,861 / 950,000, panel 329,459 / 350,000) |
| 워크포스 `forge lint` | **No issues found** (경고 1: PermissionLinter "Unknown product" — manifest 무변경이므로 기존 상태) |
| 승인 앱 계약 테스트 `npx jest contract src/integration/workforce src/resolver/workforce` | **13 suites / 207 tests 통과**. `signature.test` 의 벡터 골든에 `approval.cert` 케이스가 추가돼 통과 |
| 승인 앱 전체 `npx jest` | 124/125 통과. 실패 1건 `WorklogCertService.test.js` 는 병렬 부하에서만 나고 단독 실행 33/33 통과 — vectors.json 과 무관(다른 세션이 진행 중인 인증 서비스의 시간 예산 테스트) |
| 워크포스 DB | **무증가** — 새 SQL 테이블·KVS 키·manifest 속성 없음. 기존 KVS 캐시 값(`ProjectCost:{id}`)에 필드 2개(`certification`, `_certDigest`)만 더해짐(키 동일) |
| manifest·scope | 변경 없음(`read:jira-user` 로 사용자 프로퍼티 GET) |

## 1. 바꾼 파일

### 승인 앱 리포(허용 범위: 벡터 파일만)
- `src/integration/workforce/vectors.json` — `signatures[]` 에 `approval.cert` 벡터 1건 추가(02 보고서 §4 의 3건 본문 그대로, ent `{accountId:'5b10ac8d82e05b22cc7d4ef5', periodKey:'2026-10'}`, kid `ap-test-1`, iat `1791000000000`, sig `hJrOcpcrnn04…SdqCw`). 서명은 RFC 기반 독립 구현(정규화·Ed25519 를 node:crypto 로 직접)으로 만들었고 승인 앱 `signature.test` 가 메시지 바이트·서명 재생성·검증을 통과시켰다 → 두 구현이 같은 바이트를 낸다. 줄끝은 기존 작업 사본과 같은 CRLF, 형식은 `JSON.stringify(…, null, 2)` 그대로(다른 항목 무변경). **02 보고서 D8 해소.**

### 워크포스 리포 — 계약 복사(WF-1, 수정 없이 그대로)
| 워크포스 경로 | 승인 앱 원본 |
|---|---|
| `src/integration/approval/{base64url,canonical,contract,ed25519,keyring,signature}.js` | `src/integration/workforce/` 같은 이름 |
| `src/integration/approval/vectors.json` | `src/integration/workforce/vectors.json`(위 갱신본) |
| `src/domain/timesheet/period.js` | 같은 경로 — `contract.js` 가 `parsePeriodKey` 를 import |
| `src/domain/worklogPolicy/catalog.js` | 같은 경로 — `contract.js` 가 `normalizeOverride` 를 import |

`contract.js` 의 import 경로까지 바이트 동일하게 두려고 의존 파일 2개를 같은 상대 경로에 복사했다(§5 요구 1 참조).

### 워크포스 리포 — 신규
| 파일 | 내용 |
|---|---|
| `src/integration/approval/certification.js` | 순수. `readCertDoc`(껍데기 v·kind·accountId·periodKey 대조 → `verifyEntry(family=APPROVAL, typ='approval.cert', ent={accountId, periodKey})`), `certOfWorklog`(상태 판정), `applyCertToCostRows`(원가 입력), `certBadgeOf`(배지), `certPeriodsOfKeys`·`candidatePeriodsOf`·`startedMsOf`·`certPairsOfRows`. `CertStatus` = CLAIMED·UNCERTIFIED·UNKNOWN·CERTIFIED·CHANGED·DELETED, `SELF_CERT_HANDLING='INCLUDE'` |
| `src/resolver/approvalLink/ApprovalCertReader.js` | 수신(WF-2). asUser 로 `GET /rest/api/3/user/properties?accountId=`(키 목록) → 있는 달만 `GET /user/properties/movesApproval.cert.{YYYY-MM}?accountId=`. 메모리 캐시(TTL 5분, 2,000항목, **키에 cloudId·조회자 포함**). `certifyCostRows`(원가)·`withCertBadges`(배지) |
| `static/ui/src/components/lozenge/CertBadge.jsx` | 배지(Atlaskit Lozenge + Tooltip). null 이면 렌더 없음 |
| `locales/kr/approvalCert.json`·`locales/en/approvalCert.json` | 새 namespace `approvalCert`(badge 7·tooltip 7·cost 4). `npm run merge` 실행 완료 → `ko-KR.json`·`en-US.json` 반영 |
| 테스트 5개 | `src/integration/approval/__test__/{testKeys.js, vectors.test.js, certification.test.js}`, `src/resolver/approvalLink/__test__/ApprovalCertReader.test.js`, `src/resolver/projectCost/__test__/ProjectCostCertification.test.js`, `static/ui/src/components/lozenge/__test__/CertBadge.test.jsx` |

### 워크포스 리포 — 수정
| 파일 | 변경 |
|---|---|
| `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js` | 정규화 행에 `worklogId`·`started` 가산(인증 목록·월 경계 대조용) |
| `src/resolver/projectCost/ProjectCostController.js`·`ProjectCostService.js` | WF-3. 조회자 `{accountId, cloudId}` 전달. miss·hit 두 경로 모두 `certifyCostRows` 적용 후 `buildMonthlyEffort`·`allocateIssueCost`. 캐시 hit 는 `_certDigest`(쓰인 문서 서명 지문) 대조 — 다르면 miss 로 재계산. 응답 루트에 `certification: null | {applied, docCount, certifiedSeconds, selfCertifiedSeconds, changedCount, excludedSeconds, excludedCount, unknownCount, legacySeconds}` |
| `src/resolver/resourceAnalysis/ResourceAnalysisController.js`·`ResourceAnalysisService.js` | WF-4. `getResourceWorklogDetail` 의 `logs[]` 에 `worklogId`·`startedMs` 가산, **캐시 뒤에서** 조회자 자격으로 `logs[].certification` 부착(연동이 아니면 응답 그대로) |
| `src/resolver/myWork/MyWorkController.jsx`·`MyWorkService.jsx` | WF-4. `getProjectWorklog` 응답에 `certifications: {[worklogId]: {status, certifiedSeconds, self}}` 가산 — **본인 워크로그만**, 연동 아니면 키 자체 없음 |
| `static/ui/src/pages/myWork/table/MyIssueTable.jsx` | 워크로그 행 시간 옆에 `CertBadge` |
| `static/ui/src/pages/projectDetail/analysisReport/resource/ResourceAnalysisChart.jsx` | 워크로그 표에 "인증" 열 — 배지가 하나라도 있을 때만 |
| `static/ui/src/pages/projectDetail/cost/CostPage.jsx` | `certification.applied` 면 정보 SectionMessage(인증 h·본인 인증 h·제외 h/건, 변경·확인 불가 건수) |

resolver 추가 없음 → `PermissionMap`·`CONTROLLER_REGISTRARS` 무변경. 기존 3개 resolver 는 가드 그대로, 응답은 가산 필드만.

## 2. 계약 대조 결과

| 대조 | 방법 | 결과 |
|---|---|---|
| 계약 파일 9개 바이트 동일(줄끝 무시) | `vectors.test.js` 「승인 앱 리포와 계약 파일 동일」 — 형제 리포 `../moves-approval-jira/src` 가 있을 때만 실행(CI 에는 없어 skip) | 9/9 동일 |
| 정규화 4건·도메인 접두·시험 키 유도 | 같은 `vectors.json` | 일치 |
| 서명 벡터 8건(approval.timesheet 2·**approval.cert 1**·approval.worklog·rms.org 2·rms.check·rms.pm) | 메시지 바이트 hex·서명 재생성·`verifyEntry` | 양쪽 리포 모두 통과 |
| typ·키·validator·상한 | 복사본이 원본과 동일(`TYP.APPROVAL_CERT`·`TYP_FAMILY`·`entOf`·`CERT_DOC_PREFIX`·`CERT_DOC_KIND`·`CERT_DOC_VERSION=2`·`CERT_LIST_MAX=1000`·`CertFlag`·validators) | 동일 |
| 문서 껍데기 | 워크포스는 `v===2 && kind==='movesApproval.certification' && accountId·periodKey === 읽은 키` 를 요구(서명 대상 밖이라 위치와 대조) | 02 §4 예시 형태로 왕복 테스트 통과 |
| 변조·재사용 | 다른 사용자/달(껍데기 MALFORMED, 껍데기까지 바꾸면 BAD_SIGNATURE)·다른 사이트·본문 변조·신뢰 밖 kid·키링 없음·워크포스 계열 키·v1 모양·`sc>cs` 스키마 위반 | 전부 거부(테스트) |

## 3. 판정 규칙(구현된 그대로)

- **연동 판정**: 승인 앱 계열 신뢰 kid(`KEYRING.approval` ∩ `MOVES_LINK_TRUSTED_KIDS` 또는 env=prd)가 0개이거나, Ed25519 자가 시험 실패, 또는 cloudId 없음 → **Jira 호출 0회**, 응답·계산 지금과 동일. 현재 키링이 양쪽 모두 비어 있으므로 **배포해도 키 등록 전까지는 완전히 휴면**이다.
- **월 귀속**: 작성자 날짜의 달 + (월 첫날/마지막 날이면) 이웃 달을 후보로 문서를 읽고, 문서의 `ps ≤ started < pe` 로 고른다 — 승인 앱 사이트 타임존을 몰라도 된다.
- **원가(WF-3)**: 검증된 문서가 덮는 행 → `w` 에 있으면 `w[i][1]`(countedSeconds, KEEP/ZERO 적용값)로 교체, 없으면 제외(UNCERTIFIED), `wt:true` 의 목록 밖은 제외(UNKNOWN). 문서가 없는 사용자×월은 주장 그대로. 본인 서명(flag 4)은 포함 + `selfCertifiedSeconds` 로 구분. 예산(`actualCost = 총급여×일정률`)은 워크로그와 무관해 그대로이고, **월별 비용 분배와 이슈별 비용 안분**이 인증 기준으로 바뀐다.
- **배지(WF-4)**: 인증 / 인증 후 변경(flag 1) / 인증 후 삭제(flag 2) / 본인 인증(flag 4, 별도 배지) / 미인증 / 확인 불가 / 주장(문서 없는 달 — **그 작성자 프로퍼티를 실제로 읽은 경우만**). 읽지 못한 작성자는 배지 없음. 현황 수치(h·MD)는 전부 주장 그대로 표시.
- **v1(WF-5)**: `movesApproval.{YYYY}` 는 키 목록에서 걸러 읽지 않으며 원가에 쓰지 않는다(테스트). v1 결재 상태 배지 표시는 이번 범위에서 구현하지 않았다(ts1 재계산이 필요한 별도 작업, workforce-link 설계 §12.5).

## 4. 미검증·실측 항목(WF-6 — 문서화만)

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| S1 | **asUser 로 다른 사용자의 사용자 프로퍼티 읽기**(키 목록·값). Jira 문서상 타인 프로퍼티는 "Administer Jira" 필요 | 비관리자 조회자는 타인 문서를 못 읽는다 → 그 사용자×월은 주장 기준. **같은 프로젝트 원가가 조회자에 따라 다를 수 있다**(캐시는 `_certDigest` 대조로 섞이지 않게 막음). 내 워크로그 화면(본인)은 영향 없음 | dev 사이트에서 관리자/비관리자 두 계정으로 비용 탭 조회. 비관리자가 403 이면 워크포스 AGENTS asApp 예외에 "승인 인증 문서 읽기 — 서명 검증 후 원가·배지에만" 사유를 추가하고 `ApprovalCertReader` 의 `as` 를 바꾸는 것이 후속 결정(이번 구현은 지시대로 asUser) |
| S2 | 승인 앱이 asApp 으로 타 사용자 프로퍼티 쓰기(U1=W2·W11) | 문서가 아예 없으면 전 기능 휴면(안전) | 승인 앱 04_spike_todo |
| S3 | 두 앱 프로퍼티 키 격리(W5) — 워크포스 앱이 승인 앱이 쓴 사용자 프로퍼티를 읽을 수 있나 | 못 읽으면 휴면 | 같은 dev 사이트에서 승인 앱 게시 후 워크포스 비용 탭 |
| S4 | 32KB 실측(U2) | 워크포스는 크기 무관(읽기만) | 승인 앱 쪽 |
| S5 | Forge 런타임 node:crypto Ed25519(W1) | 실패 시 `selfTest` 가 막아 호출 0회·휴면 | 배포 후 비용 탭 응답 `certification` 확인 |
| S6 | `route` 의 `accountId`(콜론 포함) 인코딩 | 쿼리값이라 `%3A` 인코딩이 정상이어야 함 | S1 과 함께 |
| S7 | 호출량 | 비용 탭 1회 = 워크로그 작성자 수(키 목록, 상한 300명) + 문서 수. 메모리 캐시 5분(조회자별) | dev 실측 |

알려진 한계(설계상):
- **인증 후 삭제(flag 2)** 워크로그는 Jira 에 없어 이슈·프로젝트로 귀속할 수 없다 → 프로젝트 원가에 들어가지 않는다(`cs` 에는 포함). §5 요구 2.
- 전사 포트폴리오 스냅샷(스케줄·asApp)과 진척도·가동률은 사용자 컨텍스트가 없거나 운영 지표라 **주장 기준 유지**(DESIGN "운영 지표는 전체 기준").
- 사람·프로젝트 단위 집계 배지(예: 인원별 "인증 h / 주장 h")는 이번에 워크로그 행 배지 + 비용 탭 요약까지만 했다.
- 사용자 300명 초과 프로젝트는 초과분을 주장 기준으로 둔다(`CERT_ACCOUNT_MAX`).

## 5. 승인 앱 쪽에 요구할 변경

1. **`contract.js` 의 도메인 의존 제거 권장** — 지금은 `parsePeriodKey`(domain/timesheet/period)·`normalizeOverride`(domain/worklogPolicy/catalog)를 import 해서, "그대로 복사"하려면 워크포스가 그 두 파일까지 같은 경로에 복사해야 한다(현재 그렇게 했다). 계약 파일이 자기완결이면 동기화 대상이 줄고 period/catalog 변경이 계약 변경으로 번지지 않는다.
2. **`w` 항목에 issueId 추가 검토(계약 변경)** — DELETED(flag 2) 건을 워크포스가 프로젝트로 귀속할 수 없다. 예: `[worklogId, seconds, flag, issueId]`(flag 0 도 명시) — validator·32KB 계산(1,000건 × +~10B)·벡터 갱신 필요. 안 하면 "인증 후 삭제분은 프로젝트 원가 밖"이 확정 규칙이 된다.
3. **동기화 절차** — `contract.js`·`keyring.js`(키 등록 포함)·`signature.js`·`canonical.js`·`base64url.js`·`ed25519.js`·`vectors.json`·`period.js`·`catalog.js` 를 고치면 워크포스 `src/integration/approval/`·`src/domain/` 에도 같은 커밋 주기로 복사. 워크포스 `vectors.test.js` 가 두 리포가 나란히 있는 PC 에서 바이트 차이를 잡는다.
4. **키 등록** — 양쪽 `KEYRING.approval` 이 비어 있어 연동 전체가 휴면이다. 승인 앱 kid 공개키를 키링에 넣고 두 앱 모두 배포, 워크포스 dev 환경에 `forge variables set MOVES_LINK_TRUSTED_KIDS ap-dev-1`(prd 키는 목록 없이 신뢰).
5. `vectors.json` 의 `note`("수정 금지 — 두 리포가 같은 파일로 대조")는 그대로 두었다. 이번 추가는 두 리포 동시 갱신이라 규칙 안이다.

## 6. 워크포스 리포에 남은 문서 작업(이번에 하지 않음)

- `CLAUDE.md`/`AGENTS.md` 에 연동 모듈(`src/integration/approval/` 복사본·`approvalLink`)과 asUser 읽기 규칙 한 줄 — S1 결과로 asApp 예외 여부가 정해진 뒤 함께 쓰는 것이 낫다.
