---
name: no-internal-jargon
description: 고객용 자료(PPT·소개서)에는 내부 용어·코드 식별자·약어를 쓰지 말고 통용 표현으로 풀어 쓸 것 — 사용자 지시 2026-09-14
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7ad1f1a-365b-4bb6-a4a4-bd29b93a2c89
  modified: 2026-09-14T06:04:48.044Z
---

고객·외부 청중용 산출물에서는 EVM/AC/CPI, PROJECT_COST·REPORT 같은 권한 키, ALL/MEMBER_ONLY/TEAM_ONLY, asUser, deny-by-default, Forge SQL/KVS, 토폴로지·롤업·백필·스냅샷·드로어·프리셋·밴드 같은 말을 쓰지 않는다. "비용 열람 권한", "전체/참여 프로젝트만/내 팀만", "사용자 본인의 Jira 권한", "Atlassian 제공 저장소", "하루 한 번 집계본", "예산 초과 예보"처럼 풀어 쓴다. Forge는 첫 언급에 "Atlassian 앱 플랫폼(Forge)"로 설명하고 이후는 "Atlassian 인프라".

**Why:** 제품 소개 PPT v2에서 "EVM 근사"를 보고 사용자가 "저런 용어는 우리만 아는 거잖아, 통용적으로 알 만한 단어로 해야지"라고 지적(2026-09-14).

**How to apply:** 고객용 문서를 만들면 마지막에 코드 식별자·약어·내부 용어를 grep 해 전수 치환한다. 발표자 노트는 내부용이라 예외. 관련: [[product-intro-ppt-v2]].
