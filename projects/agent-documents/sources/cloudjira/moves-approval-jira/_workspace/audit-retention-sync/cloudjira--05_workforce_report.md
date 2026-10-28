# 05 워크포스 리포 보고서 — audit-retention-sync (W1~W5)

작성 2026-10-11 · 대상 `C:\CloudJira\moves-workforce` 브랜치 `RFC-220`(HEAD `4788a77`, 미커밋) · 입력: 요구서 §2 W1~W5, `02_backend_report.md` §8, Q133~Q135
커밋·배포·`forge deploy` 하지 않음. W6(worklog-control WF-7~13)은 지시대로 손대지 않음. 기존 미추적 파일(pptx 3·`캡처.png`·`custom-scopes.yaml`·`LeaderTeamBackfill.test.js`)은 건드리지 않음.

## 결과 요약

| 항목 | 결과 |
|---|---|
| 워크포스 백엔드 `npx jest --runInBand` | **152 suites / 2,090 tests 통과** (직전 보고 152 / 2,071 → +19 tests) |
| 워크포스 UI `npx jest --runInBand` | **161 suites / 2,605 tests 통과** (+1 suite `CostCertBasis.test.jsx`, +2 tests) |
| 워크포스 UI `CI=true npm run build` | 통과, 번들 예산 안(main gzip 491,864 / 950,000 · panel 329,459 / 350,000) |
| 워크포스 `forge lint` | **No issues found** (경고 1 "PermissionLinter Unknown product" — 기존 상태, manifest 무변경) |
| 승인 앱 `npx jest src/integration` | **7 suites / 148 tests 통과**(벡터·서명·자기완결 대조) |
| 계약 바이트 대조 | 7/7 — LF 정규화 sha256 이 02 보고서 §8.3 표와 전부 일치, 형제 리포 원본과도 동일 |
| 워크포스 DB·manifest·scope | 무변경(새 SQL·KVS 키·resolver 없음. KVS `ProjectCost:{id}` 캐시 값의 `certification` 요약에 필드 2개 가산뿐) |

## 1. 구현

### W5 계약 파일 재복사 (먼저 수행)
- `src/integration/approval/{base64url,canonical,contract,ed25519,keyring,signature}.js`·`vectors.json` ← 승인 앱 `src/integration/workforce/` 현재본. 실제 바뀐 것은 `contract.js`·`vectors.json` 둘(나머지 5개는 이미 동일).
- `src/domain/timesheet/period.js`·`src/domain/worklogPolicy/catalog.js` **삭제**(워크포스 안에서 쓰던 곳이 복사본 `contract.js` 의 import 뿐이었다 — 새 `contract.js` 는 import 0). 삭제는 작업 트리에만(스테이징 안 함).
- `vectors.test.js`: `SYNCED` 9 → 7, 각 행에 sha256(LF 정규화) 열 추가.
  - 새 describe 「계약 파일 지문(승인 앱 보고서 표)」 — **CI 에서도 도는** 지문 대조 + "`contract.js` 에 import 문이 없다" 단언(복사 대상이 7개로 닫혀 있음을 고정).
  - 기존 형제 리포 직접 대조(로컬 전용)는 그대로.
- `rms.policy` 의미 검증: 워크포스는 `rms.policy` 를 **생산하지 않는다**(`RMS_POLICY`·`validateBody` 사용처가 복사본 `signature.js` 의 수신 검증뿐). validator 가 형태만 보게 바뀐 데 기대던 생산 쪽 검사가 없으므로 자체 catalog 검사를 따로 둘 대상이 없다.

### W1 인증 문서 읽기 asApp (Q133) — `src/resolver/approvalLink/ApprovalCertReader.js`
- `loadApprovalCertDocs` 에 `as: 'user'|'app'` 인자. **원가 `certifyCostRows` 는 `as:'app'`**, 배지 `withCertBadges` 는 `as:'user'` 그대로.
  - 배지를 asUser 로 남긴 이유: 건별 인증 상태를 화면에 내주는 경로라 Q133 의 "원문 노출 없이 계산에만" 범위 밖. 원가는 집계 숫자만 응답에 실린다.
- 메모리 캐시 키를 자격별로 분리: 앱 `${cloudId}|app|…`(사이트 단위 — 조회자가 바뀌어도 재호출 없음), 본인 `${cloudId}|user|${accountId}|…`. CLAUDE.md 협업 모드 규칙(앱 자격 캐시 키 분리)과 같은 원칙.
- 가드: `getProjectCostSummary` = `R('PROJECT_COST','detail')`(= `CostAccess.canReadCost` 와 같은 게이트 + 프로젝트 범위). 앱 자격 결과는 서명 검증(`readCertDoc` → `verifyEntry`)을 통과한 문서만 계산 입력이 되고, 응답에는 `certification`(집계)·`certCost`(집계)만 나간다. Jira 실패 로그(`requestJiraJson` 의 status·본문)는 실패 응답 본문이라 문서 원문이 아니다.
- **AGENTS.md 수정함**(이 리포 규칙에 금지 조항 없음) — 보안 절 asApp 줄 아래:
  > **⑦ 승인 앱 인증 문서 읽기(원가 전용, 2026-10-11 Q133)** — 사용자 프로퍼티 `movesApproval.cert.{YYYY-MM}` GET 만, `ApprovalCertReader.certifyCostRows` 한 곳에서. 사유: 타인 프로퍼티는 asUser 로 Jira 관리자만 읽혀 같은 프로젝트 원가가 조회자마다 달라진다. 범위: `getProjectCostSummary`(가드 `PROJECT_COST` read·detail) 안에서 **서명 검증을 통과한 문서만 원가 계산에** 쓰고 문서 원문·건별 인증 값은 응답에 싣지 않는다(집계 숫자만). 건별 배지(`withCertBadges`)는 asUser 그대로, 메모리 캐시 키는 자격별로 분리.
- AGENTS 가 가리키는 "아키텍처 문서"(`Moves_Workforce_아키텍처_설계서.md` §4.4 asApp 허용 경로)에도 ⑦ 한 줄, `CLAUDE.md` Jira API 절에도 한 줄 추가. **둘 다 이 리포에서 gitignore 대상**(`.gitignore` 66·70행)이라 커밋에 실리지 않는다 — 공유가 필요하면 리더가 판단.

### W2 인증 후 삭제분 프로젝트 귀속 (Q135) — `src/integration/approval/certification.js`
- `readCertDoc` 가 `di` 를 `doc.deletedIssues: Map<worklogId, issueId>` 로 보관(없으면 빈 Map).
- `applyCertToCostRows(rows, docs, { projectIssues })` 가 `deletedKeptRowsOf` 로 원가 행을 더한다. **처리 규칙**:

| 경우 | 처리 |
|---|---|
| `di[worklogId]` 의 이슈 id 가 **이 프로젝트 이슈 집합**에 있음 | 이 프로젝트 원가 행으로 추가. 초 = 문서의 인증 초(`w[i][1]`, 승인 앱이 이미 dh 적용 — KEEP 이면 인증값, ZERO 면 0). 날짜 = 문서 달 1일, 이슈 key·요약은 집합에서 |
| 인증 초 0(ZERO 정책) | 더하지 않음 |
| 이슈 id 가 집합에 없음 — 다른 프로젝트 이슈 / **이슈 삭제** / 조회자에게 안 보임(이슈 목록은 기존대로 asUser) | 이 프로젝트에 넣지 않음. **이슈를 따로 조회하지 않는다**(어느 경우든 이 프로젝트 귀속을 증명할 수 없고, 추가 asApp 범위를 만들지 않기 위해) |
| `di` 없음(옛 문서·이슈 id 가 숫자가 아님) / 바이트 예산으로 w 에서 잘린 삭제 항목(`wt:true`) | 어느 프로젝트에도 귀속하지 않음(이슈를 모름) |
| 같은 worklogId 가 Jira 에 아직 보임 | 그 Jira 행이 판정(중복 계상 금지) |
| 같은 worklogId 가 여러 문서에 | 한 번만 |
| 본인 서명분(flag 6) | 포함(`SELF_CERT_HANDLING='INCLUDE'`) + `selfCertifiedSeconds` 에 가산 |

- 이슈 집합은 비용 탭이 원래 읽는 `fetchAllProjectIssues` 결과(`id → {key, summary}`) — **추가 Jira 호출 0**.
- 워크로그를 전부 지운 참여 인원의 문서도 읽도록 `certPairsOfRows(rows, { accounts: 참여 인원 })` — 행 없는 인원은 프로젝트 전체 행의 달(앞뒤 한 달 포함)을 후보로.
- 요약(`certification`)에 `deletedKeptSeconds`·`deletedKeptCount` 가산(`certifiedSeconds` 에도 포함). 화면 안내 한 줄 추가(`approvalCert.cost.deletedKept`).

### W3 확정 원가 / 예상 원가 나란히 (Q134 나)
- 서버: 응답 루트 `certCost: null | { confirmed: {seconds, md, cost}, expected: {seconds, md, cost} }`.
  - confirmed = 인증 적용 행(인증 초 + 문서 없는 사용자×월의 주장 초 + 삭제 유지분)
  - expected = Jira 에 지금 있는 기록 그대로 + 삭제 유지분 ("지금 기록이 그대로 인증된다면")
  - **문서가 없는 사용자×월은 양쪽에 같은 행이 들어가 값이 같다**(테스트 고정).
  - 금액 산식 = Σ 인원 하루 단가(급여 ÷ 프로젝트 총 근무일) × 투입 MD — 기존 이슈별 `estimatedCost` 와 같은 산식(`CostCalculator.summarizeLaborCost` 신설). 실집행(AC)은 `총급여 × 일정률` 이라 워크로그와 무관해 두 값이 갈리지 않으므로 비교 축으로 쓰지 않았다.
  - `certification` 이 null(미연동·문서 없음·레거시 캐시)이면 `certCost` 도 null → 화면 지금과 같음.
  - 캐시: `certCost` 는 KVS 캐시에 넣지 않고 miss·hit 두 경로에서 매번 계산(예상 쪽은 Jira 기록이 바뀌면 인증 문서와 무관하게 바뀐다).
- 화면: `static/ui/src/pages/projectDetail/cost/CostCertBasis.jsx`(신규) — 기존 KPI 타일 스타일(`cost-kpi-grid`) 두 칸, 금액 + `{h}h · {MD} MD`, InfoTip 으로 산식·해석. `CostPage` 의 인증 안내 바로 아래, `certification.applied` 일 때만.
- 번역: `locales/{kr,en}/approvalCert.json` 에 `cost.deletedKept` 1 + `basis.*` 6, `npm run merge` 반영.

### W4 월 귀속 보정 (V5)
- `certOfWorklog`: ① 시각으로 덮는 문서(ps ≤ started < pe)에 그 worklogId 가 있으면 그것 → ② 없으면 **그 작성자의 읽어 둔 다른 문서에서 worklogId 로** 찾는다(여럿이면 최근 서명) → ③ 어디에도 없고 덮는 문서가 있으면 미인증(잘렸으면 확인 불가) → ④ 덮는 문서도 없으면 null(기존 계산).
- 원래 달 문서를 읽도록 `certPairsOfRows` 가 작성자별로 자기 행의 달 **앞뒤 한 달**까지 후보에 넣는다(문서 GET 은 키 목록에 실제로 있는 달만 — 늘어나는 호출은 "문서가 있는 이웃 달"뿐).
- 원가에서 인증한 달과 지금 작업일의 달이 다르면 월별 원가는 **인증한 달**로 간다(`date` = 그 달 1일, 원래 날짜는 `claimedDate`). 승인 앱 `cs` 와 월 합계를 맞추기 위함. 이슈별 원가는 날짜와 무관.
- 배지 경로도 같은 판정을 쓰므로 옮겨진 워크로그가 "미인증" 대신 원래 인증 상태로 표시된다.

## 2. 바꾼 파일 (워크포스)

수정: `AGENTS.md`, `src/integration/approval/{contract.js,vectors.json,certification.js}`, `src/integration/approval/__test__/{vectors.test.js,certification.test.js}`, `src/resolver/approvalLink/ApprovalCertReader.js`(+테스트), `src/resolver/projectCost/{CostCalculator.js,ProjectCostService.js}`(+테스트 2), `static/ui/src/pages/projectDetail/cost/CostPage.jsx`, `locales/{kr,en}/approvalCert.json`, `locales/{ko-KR,en-US}.json`(merge 산출)
신규: `static/ui/src/pages/projectDetail/cost/CostCertBasis.jsx`, `static/ui/src/pages/projectDetail/cost/__test__/CostCertBasis.test.jsx`
삭제: `src/domain/timesheet/period.js`, `src/domain/worklogPolicy/catalog.js`
gitignore 대상(로컬만): `CLAUDE.md`, `Moves_Workforce_아키텍처_설계서.md`
resolver 추가 없음 → `PermissionMap`·`CONTROLLER_REGISTRARS` 무변경. `getProjectCostSummary` 응답은 가산 필드(`certCost`, `certification.deletedKept*`)만.

## 3. 테스트로 고정한 것 (신규·변경)
- 계약 지문 7건 + `contract.js` import 0 (CI 포함).
- W4: 11월로 옮겨진 10월 인증분 → 11월 문서 유무와 무관하게 10월 인증(CHANGED 포함), 어디에도 없으면 덮는 달 기준 미인증, 다른 사용자 문서의 같은 id 는 무시, 원가 월이 인증 달로 이동. `certPairsOfRows` 앞뒤 한 달·참여 인원 확장.
- W2: 프로젝트 이슈만 귀속(다른 프로젝트 이슈 제외), 본인분 포함·구분, ZERO·Jira 에 아직 보이는 id·di 없는 옛 문서·이슈 집합 없음은 제외, Jira 행 0개(전부 삭제)여도 적용, 리더에서 행 없는 참여 인원 문서 읽기.
- W1: 원가 호출은 전부 `as:'app'`, 배지는 전부 `as:'user'`, 앱 캐시는 조회자 무관·본인 캐시와 분리.
- W3: `certCost` 산식·null 조건·문서 없는 경우 확정=예상·hit 경로 재계산·캐시 미저장, `CostCertBasis` 렌더/미렌더.

## 4. 미검증·주의

| # | 항목 | 확인 방법 |
|---|---|---|
| S1' | asApp 으로 타 사용자 프로퍼티 GET 이 실제로 되는가(앱 scope `read:jira-user` 로 충분한지) — 이번 변경의 전제 | 개발 사이트에서 비관리자 계정으로 비용 탭 → `certification` 이 관리자 조회와 같은지. 403 이면 문서 없음 처리(조용히 기존 계산)라 장애는 아니다 |
| S3 | 워크포스 앱이 승인 앱이 쓴 사용자 프로퍼티를 읽는가(앱 간 키 격리) | 위와 같은 시나리오 |
| S7' | 호출량: 비용 탭 1회 = (작성자 ∪ 참여 인원) 키 목록(상한 300명) + 실제 문서가 있는 (사람, 달)만 문서 GET. 앞뒤 한 달·참여 인원 확장으로 문서 GET 이 늘 수 있다. 앱 캐시 5분은 이제 조회자 간 공유 | dev 실측(대형 프로젝트 비용 탭 응답 시간) |
| — | 배포 직후 10분 레거시 캐시: `certification` 에 `deletedKept*` 없음 → 안내 줄 생략, `certCost` 는 hit 경로에서 새로 계산돼 정상 | 자연 해소 |
| — | 키링(`KEYRING.approval`)이 양쪽 모두 비어 있어 배포해도 키 등록 전까지 전 기능 휴면(이전 보고 그대로) | 키 등록 시 |

## 5. 승인 앱 쪽 참고
- 승인 앱 리포는 이번에 **수정하지 않았다**(벡터·계약 원본 그대로 복사만).
- 02 보고서 §8.3 의 sha256 은 작성 시점 값이다. 리더 커밋 전에 승인 앱 계약 파일이 또 바뀌면 워크포스 `vectors.test.js` 의 지문 표도 같이 갱신해야 CI 가 깨지지 않는다(로컬 형제 대조는 자동).
- 워크포스 읽는 쪽 규칙은 02 §8.2 와 일치: `di[worklogId]` → 이슈 → 프로젝트, `wt:true` 이고 w 에 없는 워크로그는 "인증 여부 불명"(원가 제외), 월 합계는 `cs`.
