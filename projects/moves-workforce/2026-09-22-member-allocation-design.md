---
type: project
tags: [project, forge, jira, rms, design, resource-planning, codex-review]
created: 2026-09-22
updated: 2026-09-22
status: active
---

# 참여 기간·투입률(계획 기반 모드) 설계 + Codex 검토

- 산출물: `_workspace/member-allocation/DESIGN.md` v1.1, `codex_review.md`(45KB). 구현 전.
- 발단: 제품 소개 PPT를 만들고 나서 사용자가 "결국 전 직원이 워크로그를 적어야 완성되는 방식인데 관리자만 쓰면 의미 없지 않나"를 제기 → 워크로그 없이 동작하는 축(계획 기반)이 필요. 이어 "Tempo처럼 개인 참여 기간을 못 잡는다"를 확인(`projectusers`에 기간 컬럼 없음, 문서의 "참여 기간"은 프로젝트 기간).
- 설계 핵심: 3컬럼 + `assignment_revision` + `asOfDate`, 지표 사전(실제 가동률/계획 달성률/계획 부하/이슈 계획 소진율 분리), 인력 분석을 명단 기준으로, 비용은 마지막 단계.

## Codex 검토에서 배운 것
- **v1.0의 D6("기간 외 워크로그도 분자에 포함")이 가장 큰 결함**이었다. 기간을 줄이기만 해도 가동률이 치솟는다. 비율 지표의 분자와 분모는 같은 기간이어야 한다 — 당연한데 "돈이 든 사실"이라는 명분에 가려 놓쳤다.
- "기존 행 결과 불변"이라는 하위호환 주장은 소비처별로 갈라 써야 한다. 인력 분석은 조회 범위가 프로젝트 밖일 때 분모가 바뀌는 게 맞고, 그건 의도된 교정이다.
- 무기한 프로젝트(end null)에서 "전체 계획값"은 정의 불가 → null, 범위 값만. `computeProjectMonths`가 end 없으면 0을 내는 걸 그대로 쓰면 인건비가 0이 된다.
- 캐시 무효화(prefix 삭제)는 TiDB 트랜잭션 없음 + KVS 별도라 원자적이지 않다 → revision을 키에 넣는 편이 맞다.
- 워크로그 0 조직에 "계획 소진율"을 보여줘도 0이라 지연인지 미기록인지 모른다. 계획 모드의 KPI는 소진율이 아니라 capacity(계획 MD·계획 부하·미배정 가용).
- 보류한 것: 구·신 산식 dual calculation, 필드별 status 객체, 감사 로그, 수요 비교 — 과설계 판단.

## Codex 운용 메모
- `codex exec --sandbox read-only "$PROMPT" < input.txt > review.md 2> err` — stdin에 설계서+코드 발췌 65KB. 약 8분, 53k 토큰. stderr가 114KB(hook/진행 로그)라 확인은 `tail -c`.
- 프롬프트에 검토 항목 8개와 "근거(§/코드 위치) → 수정 제안" 형식을 지정하니 반영 가능한 출력이 나온다. 결정 D1~D6을 명시적으로 "타당성 검토"로 던진 것이 유효했다.
