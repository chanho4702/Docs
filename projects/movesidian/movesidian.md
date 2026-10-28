---
tags: [project, forge, confluence, weaver]
updated: 2026-07-09
---

# movesidian (앱명: Weaver)

Confluence 스페이스 문서 간 관계를 **옵시디언 그래프뷰처럼** 노드-엣지로 시각화하는 Forge 앱.
구조적 엣지(링크·mention·계층·라벨) + 의미적 엣지(Forge LLM 판정)의 2레이어.
작업 위치: `C:\CloudJira\movesidian` · 로드맵: repo의 `PLAN.md` · 규칙: repo의 `CLAUDE.md`

## 핵심 결정

- 앱 이름 **Weaver**, 대상은 **Confluence만**, **Rovo 적극 활용**(단 배치 분석은 `@forge/llm`, Rovo Agent는 대화형 탐색 레이어로 Phase 2 격상)
- 스택: Custom UI(React 18+TS strict+Vite) + Forge SQL + ECharts graph(force, 트리셰이킹)
- 좌표 영속화: force 1회 수렴 → SQL 저장 → 이후 `layout:'none'`
- Developer Space **Dmove**, 설치 사이트 **tom-chkim-dev.atlassian.net**, 앱 ID `337f396b-ebe2-4c5b-a96c-8f0e55a5c198`
- 구조는 [[moves-workforce]] 컨벤션 이식(rdb/schema+query, resolver/Controller 등록, onInstall 마이그레이션 — [[forge-migration-lifecycle]], [[forge-sql-no-fk-cascade]] 교훈 반영)

## 타임라인

- [[2026-07-03-weaver-kickoff]] — 킥오프: 요구 확정 + Forge API 문서 검증(⚠️ Forge LLM 임베딩 없음) + 스캐폴드 생성·git init까지. 첫 커밋 직전 중단(사용자 보류)

## 열린 항목

- Phase 0 재개 지점: **템플릿 원본 첫 커밋부터** (git init까지 완료 상태)
- Phase 2 착수 시 임베딩 대안 결정 필요: A안(임베딩 없이 구조신호+LLM 판정, Runs on Atlassian 유지) vs B안(외부 임베딩+TiDB VECTOR, egress로 배지 상실)
- forge CLI 12.19.0 → 13.0.0 메이저 업데이트 보류 중 (배포 문제 시 업데이트)
