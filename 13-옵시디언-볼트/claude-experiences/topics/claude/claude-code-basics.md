---
type: topic
tags: [topic, claude-code, usage, reference, learning]
created: 2026-05-30
updated: 2026-05-30
---

# Claude Code 간단 사용법 (내 학습 노트)

> Claude Code를 쓸 때 반복적으로 필요한 기본기 + 내가 만든 하네스를 어떻게 부르는지. 학습용 레퍼런스.

## 0. 핵심 멘탈 모델
- Claude Code는 **CLI 에이전트**. "프로젝트 디렉토리"가 곧 작업 컨텍스트다.
- 세션을 **어느 폴더에서 여느냐**가 전부를 결정한다 — 그 폴더의 `CLAUDE.md`·`.claude/`가 자동 로드된다.
- 다른 폴더에서 열면 그 프로젝트의 하네스/스킬/규칙은 **로드되지 않는다**. (예: `C:\Users\DMOVE`에서 열면 `moves-workforce` 하네스 못 씀)

## 1. 세션 시작
```
cd C:\프로젝트경로
claude
```
- 그 폴더의 `CLAUDE.md`(프로젝트 지침), `.claude/skills/`, `.claude/agents/`, `.claude/settings*.json`이 컨텍스트에 올라온다.
- 전역 지침은 `C:\Users\DMOVE\.claude\CLAUDE.md` (모든 프로젝트 공통, 한국어 응답·옵시디언 기록 규칙 등).

## 2. `.claude/` 디렉토리 구조 (프로젝트 하네스의 집)
| 경로 | 역할 |
|------|------|
| `CLAUDE.md` | 프로젝트 지침 + 하네스 트리거 포인터 + 변경 이력 |
| `.claude/agents/*.md` | 전문 에이전트 정의 (누가) |
| `.claude/skills/<name>/SKILL.md` | 스킬 = 절차/패턴 (어떻게) |
| `.claude/settings.local.json` | 권한 allow 리스트 등 |

## 3. 스킬(skill) 호출 — 자동 vs 명시
- **자동 트리거:** 스킬의 `description`이 트리거 메커니즘. 관련 요청을 자연어로 하면 알아서 발동. (그래서 description을 "pushy"하게 쓴다 → [[harness-engineering]])
- **명시 호출:** 확실히 하려면 `/스킬명` 또는 문장에 "○○ 스킬로 ~~"라고 직접 언급.

## 4. 자주 쓰는 입력 패턴
- `/<커맨드>` — 슬래시 커맨드/스킬 호출.
- `! <명령>` — 셸 명령을 이 세션에서 직접 실행(출력이 대화에 들어옴). 인터랙티브 로그인(`gcloud auth login` 등)에 유용.
- 자연어 — 대부분의 작업. Claude가 도구(파일 읽기/편집/Bash 등)를 알아서 씀.

## 5. 플러그인 설치 (예: Superpowers → [[superpowers]])
플러그인 설치는 **인터랙티브 슬래시 커맨드**라 내가(Claude) 대신 못 함 — 사용자가 직접 입력:
```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

## 6. ★ 내가 만든 하네스(moves-workforce) 호출법
> 전제: **`C:\CloudJira\moves-workforce`에서 세션을 열어야** 한다. 오케스트레이터는 `feature-harness` 스킬.

**① 자연어 기능 요청 (자동 트리거)**
```
프로젝트별 워크로그 집계 리포트 페이지 추가해줘
대시보드에 월별 가동률 위젯 신설해줘
```
**② 부분 재실행 (이전 산출물 기반)**
```
진척도 페이지 백엔드만 다시 해줘
worklog-summary 프론트만 수정하고 검증 다시 돌려줘
```
→ Phase 0이 `_workspace/<feature>/` 존재를 확인해 해당 에이전트만 재호출.

**③ 명시 호출 (자동이 안 걸릴 때)**
```
/feature-harness 칸반 보드에 담당자 필터 추가
```

**호출하면 도는 순서 (순차 파이프라인):**
```
Phase 0 슬러그 결정 + _workspace/<slug>/ 준비
Phase 2 architect → 경계면 계약 설계서
Phase 3 backend  → 구현 + 실제 응답 shape 확정
Phase 4 frontend → 그 shape 소비 + i18n merge
Phase 5 verifier → 경계면 교차검증 + 테스트 (실패 시 재호출 ≤3회)
Phase 6 결과 요약
```
- 각 단계 = `general-purpose` 서브에이전트(opus). 리더가 `.claude/agents/{name}.md`+스킬을 읽혀 역할 부여, 리포트 파일로 중계.
- 왜 순차인가 = 이 런타임이 팀 통신/커스텀 agent_type을 안 받아서. 상세 [[harness-engineering]].

## 7. 기록 습관 (이 Vault)
- 새 경험·교훈 → `projects/` 또는 `topics/`에 `.md` 생성 + [[INDEX]]에 한 줄. 절대날짜 표기.
- 관련 노트는 `[[위키링크]]`로 연결. 이미 있으면 갱신.

## 관련 노트
- [[harness-engineering]] — 하네스 구축 원리(이 노트의 심화)
- [[superpowers]] — 외부 스킬 프레임워크 + 접목 포인트
- [[moves-workforce]] — 하네스가 깔린 실제 프로젝트
