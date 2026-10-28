---
tags: [forge, confluence, forge-sql, forge-llm, rovo, kickoff]
updated: 2026-07-09
---

# 2026-07-03 — Weaver 킥오프: 요구 확정 + Forge API 검증 + 스캐폴드

[[movesidian]] 프로젝트 첫 세션. 요구사항 확정 → 최신 Forge 문서 리서치 → 설계안 합의 → Phase 0 착수 중 보류.

## 확정된 요구

- 앱명 **Weaver** / **Confluence만** / **Rovo 적극 활용** (킥오프 기본값이 "Rovo 최소화"였는데 사용자가 뒤집음)
- Rovo 적극이어도 배치 색인은 Rovo Agent로 불가(대화형) → 배치 의미 분석은 `@forge/llm`, Rovo는 `rovo:agent`+`action` 대화 탐색 레이어("이 둘 왜 연결됐어?")로 Phase 2 격상

## Forge 문서 검증 결과 (developer.atlassian.com 실확인, 백그라운드 에이전트)

1. **⚠️ Forge LLM(`@forge/llm`)에 임베딩 API 없음** — "임베딩으로 후보 좁히고 LLM 판정" 전략 불가. 대안: (A) 구조신호+TF-IDF로 후보 축소 → LLM chat 판정(Runs on Atlassian 유지, 권장) / (B) 외부 임베딩 API + **Forge SQL(TiDB) VECTOR 타입**(커뮤니티 검증 사례 있음, `forge-sql-orm`이 `vecCosineDistance` 헬퍼 제공. 공식 보장 아님) — egress 선언으로 배지 상실
2. Forge LLM은 **Preview**(프로덕션 허용). manifest `modules.llm` + `model: [claude]`. 한도: 컨텍스트 200K, **분당 100요청**, 추론 5분
3. **scheduledTrigger는 cron 미지원** — `fiveMinute|hour|day|week` 4종만, 시각 보장 없음·중복 호출 가능·재시도 없음 → 멱등 + run 가드 필수
4. **sql 모듈 후추가 = major version 업그레이드** 유발 → Phase 0부터 manifest 포함해야 함
5. Forge SQL 마이그레이션: `import { migrationRunner } from '@forge/sql'` (**named import**), `enqueue('v001_...', DDL).run()`
6. 이벤트명: `avi:confluence:created|updated|deleted|trashed|restored:page`, 페이로드 `selfGenerated`로 자기유발 이벤트 구분 가능
7. REST v2 확인: `/spaces/{id}/pages?body-format=atlas_doc_format`·`/pages/{id}/labels`·`/ancestors`·`/direct-children`
8. 스페이스별 그래프 진입점은 `confluence:spacePage`(사이드바, spaceKey 전달)

## 스캐폴드 진행 (Phase 0)

- `forge create -t confluence-space-page-custom-ui -s <spaceId> -y` — **비TTY에서는 `-s`(Developer Space id) 필수**, 없으면 "Prompts can not be meaningfully rendered" 에러. 유효 템플릿 목록은 CLI가 안 알려줌(추측 성공)
- Developer Space 목록: `forge developer-spaces list`
- 스크래치패드에 생성 → robocopy로 프로젝트 루트 이식(node_modules 제외) → git init까지 완료. **첫 커밋 직전 사용자 보류** → 여기가 재개 지점
- 생성된 앱: id `337f396b-ebe2-4c5b-a96c-8f0e55a5c198`, 런타임 nodejs24.x, Dmove 스페이스

## 교훈

- 사용자에게 Developer Space를 물었더니 **설치 사이트 URL**(tom-chkim-dev.atlassian.net)로 답함 — Dev Space(소유권 그룹)와 설치 사이트는 별개 개념이라 혼동 잦음. 다음엔 질문에 구분 명시
- 설계 확정 전 문서 검증 리서치를 백그라운드 에이전트로 돌리고 그 사이 요구 확인 질문 → 대기 시간 없이 병행 진행 가능
