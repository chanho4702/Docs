---
name: codex-model-choice
description: "코덱스 모델은 작업 난이도로 나눠 쓴다 — astra 금지, 검수는 sol(high), 일반 구현·테스트는 terra/luna(medium)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 73f0e76e-73ad-4f5f-b22e-ed7729545a96
  modified: 2026-09-28T01:24:39.547Z
---

2026-09-17 사용자: "코덱스 아스트라 그만 쓰자 한단계 낮은거로 검수걸어".
2026-09-19 사용자: "코덱스는 너무 높은 모델 쓰지말고 **적당히 작업 상태에 따라 구분**하셈".

**등급 규칙** (`~/.codex/models_cache.json` 기준 오름차순: `gpt-5.5` < `gpt-5.6-luna`
< `gpt-5.6-terra` < `gpt-5.6-sol` < `gpt-6-astra`)

| 작업 | 모델 | 추론 강도 |
|---|---|---|
| 설계 검수·결함 추적(근거를 파야 하는 것) | `gpt-5.6-sol` | `high` |
| 명세가 뚜렷한 구현·테스트 작성 | `gpt-5.6-terra` | `medium` |
| 기계적 정리·문구·반복 수정 | `gpt-5.6-luna` | `low`~`medium` |
| `gpt-6-astra` | **기본 금지** — 사용자가 그 작업을 콕 집어 지정할 때만 | — |

🔴 **예외 지정 이력**: 2026-09-21 사용자 "자바 에이전트 확장은 **설계 기반 착수**하고 **상위 모델로**
작업, 코덱스 **아스트라 모델**이랑 자세히 검토한다". 고객 JVM 안에서 우리 코드가 도는 과제라
위험이 커서 그 작업에 한해 astra를 쓴다. **다른 작업으로 번지지 않게 할 것.**

**Why:** 비용·한도 부담. 같은 이유로 "무조건 최상위"도 "무조건 최하위"도 아니고 작업이 요구하는
만큼만 쓴다. 2026-09-18 검수에서 `sol`(high)이 실제로 🔴 3건을 잡았으니 검수는 그 급을 유지한다.

**How to apply:**
- 검수(읽기 전용): `codex exec -s read-only -m gpt-5.6-sol -c model_reasoning_effort='"high"'`
- 구현(쓰기): `codex exec --skip-git-repo-check --approve-for-me -m gpt-5.6-terra -c model_reasoning_effort='"medium"' -c sandbox_workspace_write.network_access=true --add-dir <필요한 외부 경로> - < prompt.md`
- 🔴 `-s`와 `--approve-for-me`는 **동시 불가**. `--full-auto`는 쓰지 않는다.
- 🔴 `--add-dir node_modules`는 넣지 않는다(정션 때문에 샌드박스 헬퍼가 1223으로 죽는다).
- 🔴 결과가 부실하면 등급을 올려 재실행한다 — 처음부터 높이지 않는다.
- 🔴 **검수는 처음부터 `-c windows.sandbox='"unelevated"'`를 붙여 띄운다** — 2026-09-28 세 건 동시 재발(3분·4만 토큰씩 낭비). 검수(읽기 전용) 명령 정본: `codex exec --skip-git-repo-check -s read-only -m gpt-5.6-sol -c model_reasoning_effort='"high"' -c windows.sandbox='"unelevated"' --add-dir C:\solutions\_workspace -o <reviews/review_*_codex.md> - < prompt.md`(워크트리에서 `cd` 후 실행).
- **모든 셸 호출이 `helper_unknown_error: setup refresh had errors`로 거부되면**(코덱스가 "판정 불가"만 낸다, 2026-09-22 발생) 승격 Windows 샌드박스(`~/.codex/config.toml` `[windows] sandbox="elevated"`) 문제다 — 설정 파일은 건드리지 말고 **`-c windows.sandbox='"unelevated"'`를 덧붙여** 재실행하면 된다(검증됨). 결과 파일 머리에 "판정 불가·소스 접근 실패"가 있으면 검수가 아니라 환경 오류다 — 그대로 보고하지 말 것.
- 결과는 `-o <파일>`로 바로 받고, 저장소 안에서(`cd` 후) 실행한다. 두 레포면 레포마다 따로 띄운다.

관련 [[codex-review-handoff]] [[apm-implementation-progress]]

## 2026-10-26 astra 예외 지정(ZM-172 코어 모듈 분리 검수)
사용자: "이거 작업 난이도 있겠다 **상위 모델 사용해서 검수 및 테스트 진행**" → DB 모니터링 코어 Gradle 모듈 분리 + 7차 반영 재검수(8차)에 한해 `gpt-6-astra` high. **다른 작업으로 번지지 않게 할 것** — 다음 DBM 검수도 기본은 `gpt-6.1-sol`이며, 사용자가 다시 지정할 때만 astra.

## 2026-10-19 등급표 갱신
`models_cache.json`이 바뀌었다: **`gpt-6.1-sol`("Latest workhorse")** · `gpt-6-astra`(frontier, 기본 금지 유지) · `gpt-6-sol`(이전 세대) · `gpt-6-luna`(빠르고 저렴) · `gpt-reserve` · 5.6 계열은 "Older generation". 따라서 지금은 **설계 검수·결함 추적 = `gpt-6.1-sol` high**, 구현 = `gpt-6-sol`/`gpt-6.1-sol` medium, 기계적 정리 = `gpt-6-luna`. DB 모니터링 설계(2026-10-19)는 독립 제안·검수 모두 `gpt-6.1-sol` high로 돌렸다([[db-monitoring-design]]).
