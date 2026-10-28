---
type: project
tags: [project, moves-approval-jira, moves-workforce, forge, forge-sql, codex-review, concurrency, handoff]
created: 2026-10-28
updated: 2026-10-28
status: in-progress
---

# 2026-10-28 전수 점검 결함 12건 수정 · 워크포스 "앱 자격 읽기" 전환 — 중단 시점 기록

## 개요
- **승인 앱**(`C:\CloudJira\moves-approval-jira`, master): 전수 점검 보고서(`_workspace/full-audit-2026-10-28/REVIEW.md`, 재현 12건)의 P1·P2 전부 + D01~D03 처리. 1단계(R05·R10·R12·R09) → 엔진(R01~R04, 서브에이전트) → 3단계(R06·R07·R08·R11·D02·D03) 로 나눠 묶음마다 Codex(gpt-6-astra xhigh) 독립 검토.
- **워크포스**(`C:\CloudJira\moves-workforce`, 브랜치 RFC-220): 사용자 결정 "승인 여부와 관계없이 워크포스 권한으로 본다, 앱 권한으로 읽는다" → 연동 모드 워크로그 읽기를 asApp 으로 전환(RFC-220 검토 F1·F2·F3 수정). 승인 앱 몫은 `cert.query` BADGE 의 Browse 재확인(R2) 제거(`d9e5351`, develop 푸시·dev 6.7.0 배포 완료).
- 그 밖: `origin/master` 오푸시 되돌림(`cba7826`), Sentry DSN 은 사용자 몫으로 보류, 스테이징 배포 보류(사용자 지시).

## 현재 상태 (2026-10-28 16:40 중단)
| 리포 | 상태 | 테스트 | 커밋 |
|---|---|---|---|
| 승인 앱 | 작업 트리에 R05~R12·D01~D03 + 엔진 R01~R04(Codex 2회 반영·단순 규칙 정리) 수정 전부 | BE 213 suites / 3,150 · UI 105 / 1,001 통과 · check:bundle OK | **미커밋**. `d9e5351` 까지만 develop |
| 워크포스 | 작업 트리에 asApp 전환 + Codex 2회 반영(P1 3·P2 9 수정) | BE 200 파일 / 2,709 · 재현 5/5 · UI 변경 범위 149건 통과(전체 UI 스위트 미완) | **미커밋**. RFC-220 HEAD `5b5f90d` |

**중지된 작업(시스템 메모리 부족으로 Claude Code 가 백그라운드 작업을 강제 종료, 재실행은 사용자 지시 뒤):**
1. 승인 앱 엔진 Codex 3차(최종) 검토 — 프롬프트 `scratchpad/codex_engine3_prompt.md`(세션 임시 폴더). 재실행 명령은 아래 "재개 절차".
2. 워크포스 Codex 3차(최종) 검토 — `scratchpad/codex_wf3_prompt.md`.
3. 워크포스 UI 전체 테스트(`cd static/ui && CI=true npm test -- --watchAll=false`).

## 재개 절차 (다음 세션)
1. 메모리 확보 후(브라우저·IDE 닫기) 세 작업 재실행. Codex 명령 틀:
   `node C:/Claude/node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -m gpt-6-astra -c model_reasoning_effort="xhigh" -s read-only -c approval_policy=never - < prompt.md` (해당 리포 디렉터리에서, stdin 리다이렉트 필수).
   - 엔진 3차 프롬프트 요지: `engine-fix-report.md` "재작업 2회차 — 최종" 표·"한계" 8항을 먼저 읽고, 한계에 적힌 것은 재지적 금지, 규칙 1~7 구현 불일치·새 P1·테스트 단언 변경이 숨긴 회귀·SQL 12문장 중 줄일 것만.
   - 워크포스 3차 프롬프트 요지: 2차 반영 5건 실제 차단 여부(특히 `workforceRegistered` 가 모든 앱 자격 경로의 유일 근거인지), 드로어 `worklogIds` 직접 읽기의 타 이슈 id 차단, `truncated` 캐시 전파, 12개월 상한으로 사라지는 삭제 승인분, `APP_FIELD_UNAVAILABLE` 의 연동 OFF 회귀, 오류 코드 프론트 문구.
2. 녹색이면 **승인 앱 → 워크포스** 순으로 커밋(`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, 경로 지정 add — 워크포스 미추적 파일 LeaderTeamBackfill.test.js·custom-scopes.yaml·pptx·png·캡처.png·docs/external-api/* 제외) → `git push origin HEAD:develop` → dev 배포(승인 `forge deploy -e development --non-interactive`, 워크포스 `-e moves-rms`). 스테이징은 보내지 않는다.
3. 배포 출력의 webpack ⚠ 줄 확인(테스트가 못 잡는 import 부패 신호).
4. dev 실측 필요 목록(RELEASE_GATE F 절): 엔진의 TiDB 상관 서브쿼리 3종(결정 CAS COUNT·클레임 EXISTS·이벤트 DELETE EXISTS) — 승인·반려·회수 1회씩; R07 증분 스캔 200건 이상; R08 `INSERT … SELECT … ON DUPLICATE KEY`; 워크포스 asApp 검색이 숨긴 워크로그를 돌려주는지·`issue.control` AGGREGATE 전원 id.

## 핵심 결정 (Decisions)
- **승인 상태를 워크로그 프로퍼티에 표식으로 쓰지 않는다**(사용자 제안 거부). 편집 권한자 누구나 쓸 수 있고(불변식 9), 상태가 자주 바뀌어 쓰기 비용이 늘고, 숨긴 기록 읽기 문제를 풀지 못한다. "화면당 묶음 1회 + 캐시"가 이미 있어 호출 부담은 작다는 수치(0.2~0.4초)로 설명해 결정을 이끌었다.
- **워크포스 가시성은 워크포스 권한 모델이 정한다**: 연동 ON 이면 asApp 읽기, 범위는 `workforceRegistered`(users 행 기준) + `scopedProjectIds` + 협업. 승인 앱은 상태 사실만(불변식 8 예외 ①⑤⑥은 승인 앱 자기 화면에만). CLAUDE.md 불변식 8 에 기록.
- **결정 수락과 종료 확정의 결속은 트랜잭션 없이도 가능하다**: ① 클레임은 부모 PENDING·LIVE 일 때만(EXISTS) ② 종료 CAS 는 "내가 본 결정 수 = 실제 결정 수"(COUNT 서브쿼리) ③ 되돌림은 **모순이 확실할 때만**(APPROVED+내 REJECT, REJECTED+내 APPROVE 이면서 이벤트 없음) ④ 패자 이벤트는 최종 상태 ≠ 목표 상태일 때만 삭제 ⑤ 대리인 경유 복구는 하지 않는다. 멀티 테이블 UPDATE 는 Forge SQL 미실측이라 배제. 남는 한계 8개는 보고서에 명시.
- **테이블 부재와 DB 장애는 다른 사실이다**: `isTableReady` boolean 은 유지, `tableState` 셋을 추가해 validator 만 가른다.
- **"넣고 나서 지운다" + 세대 결속**: DELETE→INSERT 교체는 실패·읽기 창에서 빈 집합(=전체 적용)을 만든다. INSERT(멱등, rev 조건)→DELETE NOT IN(rev 조건).
- **D01**: 상용 의존성만 패치(BE 0건, UI dompurify 3.4.17·markdown-it 14.3.3·fast-uri·undici·brace-expansion). major 가 필요한 것(@forge/bridge 7·@mdxeditor/editor 4·exceljs 3)은 UI 회귀 검증과 함께 별도.

## 겪은 문제 & 해결 (Troubleshooting)
- **`npm audit fix --omit=dev` 가 devDependencies 를 node_modules 에서 지웠다**(jest·react-scripts·webpack). 그 뒤 `npx jest` 는 레지스트리에서 jest 를 받아 돌아가 눈치채기 어려웠고, UI 테스트·빌드·check:bundle 은 조용히 빈 출력/모듈 없음으로 끝났다. `npm install` 로 복구. **audit fix 는 `--omit` 없이, 끝나면 `ls node_modules/jest` 확인.**
- **승인 UI 테스트는 `craco test` 가 아니라 `jest`(static/ui 의 자체 설정, `moduleNameMapper` 로 @forge/bridge 모의)**. `craco test` 로 돌리면 8 suites 가 "Unable to establish a connection with the Custom UI bridge" 로 죽는다.
- **Codex 가 잡은 결함(묶음별)**: 1단계 P2 2(빈 중간 페이지·라이선스 무기한 대기) → 3단계 P2 5·P3 1(reevaluate 200 잘림·재개 시 since 재계산·매핑 동시 저장·대리 결재 단계 비교·마감 '넘긴 뒤' 멈춤·i18n 키) → 엔진 1차 P1 2·P2 5, 2차 P1 1·P2 7(뿌리는 하나: "내 클레임이 종료 CAS 에 포함됐는지 증명할 데이터가 없다") → 단순 규칙으로 정리. 워크포스 1차 P1 2(JQL 삽입·미등록 ALL 스코프)·P2 4, 2차 P1 1(미등록 Jira 관리자)·P2 4. **단위 테스트는 전부 통과했던 것들** — 경계·동시성·재개 시나리오는 독립 검토가 유일한 그물.
- **asUser→asApp 전환은 Jira 가 대신 해 주던 범위 제한을 전부 우리 책임으로 만든다**: JQL 화이트리스트, 앱 필드 재필터, 등록 사용자 판정, 표시 행과 판정 행의 일치.
- **서브에이전트가 REVIEW.md 를 셸로 실행**(bash 백틱 명령 치환, 두 번) — 피해 없음. 문서 행 추가는 Edit 도구로.
- **엔진 서브에이전트의 보고서 파일 쓰기가 막혀** 최종 절은 리더가 직접 append 했다.
- **메모리 부족으로 백그라운드 3개 강제 종료** — Codex 두 개(각 500KB 출력 중)와 UI 전체 테스트를 동시에 띄운 것이 원인으로 보인다. 다음부터 Codex 는 한 번에 하나, UI 전체 테스트는 Codex 와 겹치지 않게.

## 교훈 (Lessons)
- 결함 보고서 처리 순서 "작고 명확한 계약 오류 → 엔진 정합성 → 규모 경계 → 인지 개선"이 맞았다. 1단계는 두 시간 안에 끝나고, 엔진은 설계서를 써서 위임했다.
- 동시성 수정은 2회차 검토에서 **지적이 늘면** 패치를 더 쌓지 말고 "증명할 수 없는 것은 하지 않는다"로 규칙을 줄여야 한다. 남는 한계를 문서화하는 것이 더 안전한 코드보다 낫다.
- 정리·복구 루프의 질문 네 개: 실패 행을 다음 회차가 다시 고르는가 / 한 행 실패가 뒤를 막는가 / 영구 실패 행이 배치를 점유하는가 / **재개할 때 경계값(since·until·커서)을 다시 계산하지 않는가.**
- "fail-close 를 유지하면서 사용자에게 알린다"(incomplete 플래그 + 커서 고정)는 패턴은 counts 경로에 이미 있었다 — 형제 경로를 먼저 찾아 계약을 맞춘다.

## 산출물 위치
- 승인 앱: `_workspace/RELEASE_GATE.md`(F 절 처리 현황), `_workspace/full-audit-2026-10-28/{REVIEW,engine-fix-design,engine-fix-report}.md`, `tmp/full-audit-2026-10-28/*.repro.test.js`(수정 전 결함 고정 — R01~R03·R05·R09·R10·R12 는 깨지는 게 정상), CLAUDE.md 변경 이력 2026-10-28 3행, AGENTS.md 결정 저장 순서 1행.
- 워크포스: `_workspace/rfc220-review/{03_verify_report,04_fix_design,05_fix_report}.md`, AGENTS.md ⑦·⑧·⑨, CLAUDE.md 2026-10-28 행.
- 메모리: `workforce-worklog-visibility-decision-2026-10-28.md`.

## 관련 노트
- [[2026-10-27-stale-draft-sweep-license-boundary]] · [[2026-10-20-marketplace-prelaunch-audit]] · [[2026-10-14-linked-mode-fix-reopen]]
