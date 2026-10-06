---
type: topic
tags: [topic, claude-code, codex, review, orchestration, lesson]
created: 2026-09-28
updated: 2026-09-28
---

# `codex exec` 운용 노트 — 검수·구현 위임에서 반복된 함정과 잘 된 조합

moveseye에서 2026-08~09 두 달간 코덱스를 **검수자**(기본)와 **구현자**(P4·P5.6·P5.1 초반)로 써 본 결과. 규약 정본은 `C:\solutions\COLLAB.md §8`, 모델 선택은 메모리 `codex-model-choice`(09-17 이후 검수는 `gpt-5.6-sol` high).

## 실행 형태(Windows)

```
codex exec --skip-git-repo-check -C <worktree> --approve-for-me -m <model> \
  -c model_reasoning_effort='"high"' -c windows.sandbox='"unelevated"' \
  -c sandbox_workspace_write.network_access=true \
  --add-dir ~/.gradle --add-dir %TEMP% --add-dir _workspace - < prompt.md
```

- 🔴 `--full-auto` 없음(`--approve-for-me`) · `-s`와 `--approve-for-me` 동시 불가 · `writable_roots`는 `-c` 배열 전달 실패 → `--add-dir`.
- 🔴 **node_modules 정션을 `--add-dir`에 넣으면** 샌드박스 헬퍼 1223(권한 상승 취소)으로 즉시 실패 — 빼면 정상.
- 🔴 **승격 샌드박스 오류**(`helper_unknown_error: setup refresh had errors`) — 모든 셸 호출이 거부되고 검수가 "판정 불가"만 낸다. **판정 불가는 검수가 아니라 환경 오류.** 우회 ① `-c windows.sandbox='"unelevated"'`를 **처음부터** ② 그래도 안 되면 diff + 관련 미변경 코드를 **인라인 번들로 본문에 첨부**하고 "명령 실행 금지"를 명시(09-28 데드락 검수는 이걸로 2차에서 정상).
- 🔴 다른 코덱스 프로세스(장기 PoC)가 떠 있는 동안 새 샌드박스는 같은 오류로 실패한다.
- `codex exec`는 **git 저장소 안에서만** 돈다(`C:/worktrees`가 별도 git dir이면 거부 → `--skip-git-repo-check` 또는 레포 안 워크트리).
- 사용량 한도에 걸리면 시각을 확인하고 재실행(09-16~20 소진 기간에는 하네스 에이전트가 구현, 코덱스는 medium 검수만).

## 구현을 맡길 때

- **격리 git worktree**에서만. 결과는 Claude가 검수 보고서(`reviews/review_*_claude.md`)를 쓰고 코덱스가 반영, Claude가 커밋·병합.
- 🔴 **"N,000 green이 사실을 감췼다"** — 코덱스 K8s 구현은 지어낸 속성명(`container.restart_count`)을 **테스트가 스스로 먹여** 통과했다. 검수는 contrib 정본 문서를 대조해야 잡는다. 검수자도 틀릴 수 있다(R2 위치 지시가 정본과 달라 코덱스가 링크로 반박) — **검수 지시도 정본 대조**.
- 🔴 **코덱스가 메모리 부족으로 killed돼도 worktree 파일 수정은 전부 남는다** — 보고서 0바이트여도 항목별 grep + 전체 테스트로 확인한 뒤 이어간다.
- 🔴 코덱스에 전체 `:test`를 시키지 말 것(메모리) — 선별만, 전체 회귀는 Claude 단독. → [[shared-it-db-worktree-collision]]
- 에이전트(코덱스 포함)가 `review_*.md`를 Write로 덮어쓴 사례 — 정본은 계약서에 두고 검수 파일은 파생물로.

## 검수를 맡길 때 — 잘 된 조합

- **구현 = 하네스 `fe-engineer`/`be-engineer`, 검수 = 코덱스**가 가장 안정적이었다. 코덱스가 Claude 검수가 놓친 **정확성 회귀**를 반복해서 잡았다(P5.2 사전 ID 필터 누락 / P5.3 '관측 없음≠0' 규칙 파괴 / C5 1콜 상한<보유 상한 / ZM-167 lost update / Redis reload flight 분리).
- **좁혀 가며 반복**: 1차 전체 → 2·3차 반영분 → 4·5차 특정 파일. 매 회차 "후속 가능 여부"를 적게 해야 끝난다. 평균 2~3회, **지적 반영 시 "권장"도 전부 반영**하면 재검수 횟수가 준다.
- 🔴 왕복이 5회로 늘어난 경우(ZM-167 FE)는 지적이 계속 "같은 결함의 다른 경로"였다 — 상태 보호 같은 기능은 **이탈 경로를 처음부터 표로 열거**해서 설계한다.
- 자체 감사 + 코덱스 감사를 **병렬로 돌리고 서로 재검증**시키면 과장·인과 오류가 걸러진다(09-28 APM 전체 검토: 🔴 5건 하향, 2건 인과 정정). → [[2026-09-28-apm-full-review]]
- 설계 단계 대화(v0 → 반박 → 합의 → 실측 → 재판정)는 r1~r3 세 회전이 적당했다. read-only로 돌린다. → [[2026-09-23-apm-p5-realtime]]

## 검수 의뢰서에 꼭 넣는 것

- 범위 표(설계 항목 ↔ 변경 ↔ 파일) · **의도(왜 이렇게)** · 버린 대안 · **"스스로 불안한 지점"** · 검증 결과(테스트 수·선재 실패의 근거) · "이전엔 없던 격리"처럼 **공통화가 조용히 바꾼 행위**.
- 인계서 이름 `_workspace/reviews/review_{feature}.md`, 코덱스 결과는 `_codex.md`(회차 `-v2_codex.md`). 인덱스 문서 머리에 **갱신 날짜** — 세션이 끊기면 그 한 줄로 낡은 문서를 가른다.

관련: [[harness-engineering]] · [[test-false-safety-nets]] · [[shared-it-db-worktree-collision]] · [[2026-09-02-apm-p2-traces]](P4 역할 교대) · [[2026-09-22-zm151-156-backlog-sprint]] · [[2026-09-28-apm-metric1m-deadlock]]
