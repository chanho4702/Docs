---
name: approval-dev
description: >-
  confluence-approval-dc 개발 오케스트레이터. 승인 앱의 버그 수정, 기능 추가, UI/UX 개선,
  리팩토링 등 코드를 변경하는 모든 작업에 반드시 이 스킬을 사용할 것. "이슈 잡아줘", "고쳐줘",
  "개선해줘", "다시 실행", "재작업", "이전 결과 보완", "배치 이어서", "QA 다시" 같은 후속 요청도
  포함한다. 구현은 Codex CLI에 위임하고 Claude는 스펙·설계·검증을 맡는 파이프라인을 조율한다.
  단순 질문/코드 읽기에는 사용하지 않는다.
---

# approval-dev — 개발 파이프라인 오케스트레이터

**실행 모드: 하이브리드** — 스펙/설계/QA는 Claude 서브 에이전트(`Agent` 도구, `model: "opus"`),
구현은 `codex exec` 순차 배치. 에이전트 팀(TeamCreate)은 쓰지 않는다: 구현 채널이 Codex 단일
직렬 큐라 팀 통신의 이득이 없다.

## Phase 0: 컨텍스트 확인
1. `_workspace/` 존재 확인:
   - 있음 + 부분 재작업 요청 → 해당 배치의 spec/qa만 다시 (부분 재실행)
   - 있음 + 새 작업 → 기존을 `_workspace_prev/`로 이동 후 새로 시작
   - 없음 → `_workspace/` 생성, 초기 실행
2. `approval-codebase-map` 스킬을 읽는다 (수정 전 필수).
3. git 상태 확인. 커밋이 없는 저장소라면 **작업 시작 전 baseline 커밋을 먼저 제안**한다
   (Codex가 네트워크 단절로 죽으면 트리가 부분 적용 상태로 남는데, 커밋이 없으면 되돌릴 수 없다).

## Phase 1: 작업 분해와 배치 설계
- 요구사항을 배치로 나눈다. **배치 경계 = 파일 집합**: 같은 파일을 건드리는 작업은 같은 배치로.
- UI 변경이 포함되면 `approval-ui-designer` 에이전트를 먼저(또는 백엔드 배치와 병렬로) 스폰해
  `_workspace/design-*.md`를 받는다. 디자이너는 Codex가 아니므로 병렬 가능.
- 스펙은 메인이 컨텍스트를 충분히 쥔 경우 직접 쓰고, 아니면 `approval-spec-writer`를 스폰한다.
  산출: `_workspace/spec-{n}.md`

## Phase 2: Codex 구현 (배치당 반복)
```
codex exec -m gpt-5.6-sol -c model_reasoning_effort="xhigh" --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check - < _workspace/spec-{n}.md
```
- **모델은 최상위(gpt-5.6-sol, 2026-08-13 사용자 지시)** — models_cache.json에서 priority 1 확인.
  effort는 xhigh (ultra는 자체 위임 기능이 파이프라인 통제 밖이라 제외).
- **구현은 전부 Codex** — Claude는 스펙·검토·QA만 (2026-08-13 사용자 지시로 직접 수정 경로 폐지.
  Codex 재작업이 반복 실패해도 직접 고치지 말고 사용자에게 보고).
- 프로젝트 루트에서 실행. **배치 병렬 실행 절대 금지** — 한 셸에서 순차로만.
  (pgrep 감시 방식은 Windows Git Bash에서 동작하지 않아 실제로 빌드가 깨진 전례가 있다.)
- 실행이 중간에 죽으면: 트리가 부분 적용 상태다. 부분 상태를 설명하는 복구 지시를 스펙 앞에
  붙여 재실행한다. 커밋이 있으면 `git diff`로 부분 상태를 먼저 파악한다.

## Phase 3: 배치 검증 (배치당 반복)
- `approval-qa` 에이전트 스폰 (스펙 경로 + 수정 파일 목록 전달).
- FAIL → QA가 제안한 재작업 지시로 Phase 2 재실행 (1회). 재실패 시 사용자에게 보고하고 중단.
- PASS → 다음 배치로. **incremental QA**: 전체 완성 후 몰아서 검증하지 않는다.

## Phase 3.5: Codex 교차 검토 (QA PASS 후, 커밋 전 — 2026-08-12 추가)
- 구현·QA와 별개의 제3 시선으로 Codex에 리뷰를 시킨다:
  `codex exec ... - < 리뷰 프롬프트` — 프롬프트에는 배치의 diff 범위(기준 커밋), 설계 문서 경로,
  "버그·회귀·설계 불일치를 찾아 보고만 하라(수정 금지)"를 명시한다.
- Codex 리뷰 결과는 QA와 같은 기준으로 취급: 지적이 타당하면 수정 후 QA 재확인, 오진이면 근거와 함께 기각 기록.
- 단, Codex가 구현한 배치의 자기 리뷰는 가치가 낮다 — **Claude가 직접 수정한 배치**나 도메인 의미론
  변경 배치에 우선 적용한다.

## Phase 4: 종합 보고 + 문서 동반 갱신
- 배치별 결과, QA verdict, 남은 리스크를 사용자에게 보고.
- **`docs/features.md`(사용자 관점 기능 정리)를 배치 내용에 맞춰 갱신** — "(개발 중)" 표기를
  완료로 전환하거나 신규 기능을 추가한다. 고객 요구 대응 배치면 `docs/requirements-*.md`의
  반영 상태도 갱신.
- `docs/progress-{날짜}.md`에 진행 기록 추가 (기존 progress 문서 형식 따름).
- CLAUDE.md 변경 이력 갱신 (하네스 자체가 바뀐 경우).

## 에러 핸들링
| 상황 | 대응 |
|------|------|
| Codex 배치 실패/부분 적용 | 복구 지시 prepend 후 1회 재실행, 재실패 시 diff 첨부 보고 |
| 빌드 실패 | QA가 원인 파일 지목 → 수정 스펙으로 재배치 |
| QA 2회 FAIL | 중단, 사용자 결정 대기 |
| 반대 adapter 빌드 요구 | C9 인스턴스 실행 중이면 거부하고 이유 설명 (README 함정) |

## 빌드·배포 철칙 (2026-08-13 배포 사고 3건에서 확립 — 위반 금지)
1. **`mvn clean`은 인스턴스가 떠 있으면 절대 실행 금지.** "실패하고 만다"가 아니다 — jar 잠금으로
   죽기 전까지 container 파일을 지워 웹앱이 전 경로 404 좀비가 된다.
2. **c9의 `clean`은 `target/confluence/home`(H2 테스트 데이터)을 삭제한다.** 인스턴스를 내리고
   clean이 필요하면, 테스트 데이터를 지켜야 하는 상황인지 먼저 판단하고 필요 시
   `target/confluence/home`을 target 밖으로 복사해 백업한 뒤 실행한다 (부팅 후 되돌려 넣기 가능).
3. **`target/classes/kr/.../domain`은 `<Embed-Dependency>` 패키징 재료다.** 삭제했다면 이후 패키징은
   반드시 clean과 함께 — clean 없는 증분 verify는 domain이 빠진 jar를 만들고, 배포하면
   REST·패널·매크로 전부 NoClassDefFoundError로 죽는다. 배포 전 게이트:
   `unzip -l <jar> | grep -c "approval/domain/.*class"` 가 0이면 배포 금지.
4. **서블릿 `<style>`(text block) 안 CSS 주석에 꺾쇠 태그 문자열 금지** — Sitemesh가 style 내용도
   태그로 파싱해 style 블록 전체가 잘린다 (무스타일 렌더).
5. QuickReload가 새 jar를 감지하지 않으면 UPM REST 재설치(토큰 발급 → multipart 업로드)를 쓰되,
   3번 게이트 통과 jar만. 재설치/재기동 후에는 반드시 구+신 REST 엔드포인트 200을 실측한다.
6. **AMPS 개발 인스턴스는 js/css를 `target/classes`에서 라이브 서빙한다** (AlternativeDirectoryResourceLoader).
   Codex가 빌드만 돌려도 브라우저의 JS는 미배포 코드로 바뀌는데 서버 렌더 마크업은 설치된 jar
   버전에 머문다 → **버전 스큐로 라이브 TypeError** (배치 8d에서 실증: JS는 ccKeys를 읽는데 마크업엔
   필드가 없음). 배치 구현이 진행 중일 때 화면 이상 제보가 오면 코드 결함보다 먼저 스큐를 의심하고,
   jar 재설치로 마크업을 JS와 맞춘 뒤 재현하라.

## 테스트 시나리오
- 정상: "반려 사유 필수 버그 고쳐줘" → Phase 0~4, 배치 1개, QA PASS, 보고.
- 에러: Codex가 파일을 한 줄로 압축 → QA Step 3이 감지 → 재작업 스펙에 "재포매팅 금지" 강조 → 재실행 PASS.
