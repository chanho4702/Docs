---
type: project
tags: [project, forge, jira, rms, ppt, pptx-skill, presentation]
created: 2026-09-11
updated: 2026-09-11
status: active
---

# 제품 소개 PPT 프롬프트 v2 (pptx 스킬용, 12장+부록 2)

- 산출물: `_workspace/product-intro-ppt/PROMPT.md` (moves-workforce 리포지토리)
- 대상 스킬: Anthropic 공식 `pptx` 스킬(pptxgenjs 처음부터 생성). 이 세션에 등록된 스킬 목록엔 없고 `~/.claude/skills/skills-main/skills-main/skills/pptx/`에 존재.
- 원고 기준을 **`Moves_Workforce_제품_소개서.md` v1.1(2026-09-08) §7 12장 구성**으로 바꿈. [[2026-07-06-ppt-genspark-sourcepack]](16장·Genspark)과 [[2026-07-07-competitive-advantage-report]](경쟁 우위 보강)를 통합·현행화한 버전.
- 달라진 점: 소스팩 인라인 대신 **정본 파일 경로를 읽게** 함(Claude Code 실행 전제) · 디무브 틸 팔레트 지정 · 한글 폰트 `fontFace` 명시 강제 · 캡처 placeholder 규격(점선 틸 박스 + 화면 경로) · 근사/추정/스냅샷 단서 3개 필수 · §2.8 미배포 기능은 부록으로 격리 · QA 루프(markitdown + 이미지 검수 서브에이전트) 명시.
- 교훈: 7월 프롬프트의 수치(resolver 109개 등)는 이미 낡았다. PPT 프롬프트에는 카운트류 숫자를 넣지 말고 정본 문서만 참조시키는 편이 안전하다.
