---
tags: [project, forge, jira, confluence, doclink]
updated: 2026-09-29
---

# moves-workforce-docs (앱명: Moves Workforce Docs)

[[moves-workforce]] 프로젝트의 Jira 이슈에 Confluence 문서를 연결·분류·관리하는 **별도 Forge 앱**.
작업 위치: `C:\CloudJira\moves-workforce-docs` · 설계 정본: repo의 `docs/DESIGN.md` · 규칙: repo의 `CLAUDE.md`

## 핵심 결정

- 방향 이력: 09-22 확장 팩 보류 → 09-23 Workforce 본체 문서 탭 → **09-29 별도 애드온으로 재확정**
- 연결 정보의 단일 출처 = **Jira 이슈 프로퍼티 `movesDocs`**. Confluence 콘텐츠 프로퍼티는 안 쓴다(이중 기록 회피, Confluence 쓰기 스코프 0)
- Workforce 쪽은 읽기 전용 「문서」 탭 + 「문서 관리 열기」 버튼. Workforce 스코프 변경 없음(마이너 배포)
- 범위: 문서↔이슈 연결, 분류, 현황 관리. **이슈 없는 프로젝트 문서·폴더·문서 세트 생성은 범위 밖**
- 다중 제품 호환(`app.compatibility`, Jira 필수+Confluence 선택)은 Workforce Docs에만 적용

## 타임라인

- [[2026-09-29-workforce-docs-kickoff]] — 설계 + 두 저장소 구현 + 교차 검증. 배포 전

## 열린 항목

- `forge register` → `forge deploy` → `forge install`(Jira, 이어서 Confluence) — 사용자 계정 작업이라 미수행
- 등록 뒤 앱 id·환경 id를 Workforce `static/ui/src/constants/movesDocs.js`에 채워야 버튼이 보인다
- 설계서 §10의 실측 항목 P1~P8 (설치 감지·별칭 색인·Jira 화면 안의 Confluence 호출·앱 간 이동·스코프·검색 품질)
- 문서 제목이 이슈를 볼 수 있는 모든 사람에게 보이는 한계 — 고객 안내 필요
- 라이선스(`licensing.enabled`)·마켓 등록은 미착수
