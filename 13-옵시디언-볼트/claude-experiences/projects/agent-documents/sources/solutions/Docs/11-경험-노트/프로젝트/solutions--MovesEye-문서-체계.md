---
type: project
tags: [project, moveseye, documentation, moc, ssot, obsidian]
created: 2026-08-05
updated: 2026-08-05
status: active
---

# MovesEye 문서 체계

> 상위: [[projects/moveseye/moveseye|moveseye]] · 현재 구조: [[projects/moveseye/moveseye-overview|moveseye-overview]] · 설계 질문: [[projects/moveseye/moveseye-design-qa|moveseye-design-qa]]
> 제품 문서 정본: `C:\solutions\moveseye-docs\README.md`

## 왜 만들었나

MovesEye의 지식이 Spring BE, React FE, 구 NestJS, `_workspace`, 루트 온보딩, Obsidian 경험 노트에 흩어져 있었다. 문서가 없는 문제가 아니라 **어떤 문서가 현재 정본인지**, 기능 완료 뒤 **어디를 갱신해야 하는지** 알기 어려운 문제였다.

Moves Workforce의 `제품 산출물 ↔ 개발 기준선 ↔ Obsidian 경험·결정` 분리를 이식하되, MovesEye는 여러 Git 저장소로 나뉘어 있어 독립 `moveseye-docs`를 정본으로 채택했다.

## 세 층

```text
1. C:\solutions\moveseye-docs
   현재 제품·사용법·아키텍처·운영 문서

2. C:\solutions\_workspace
   기능 개발 중 design / contract / E2E·QA 증거

3. C:\Users\DMOVE\claude-experiences\projects\moveseye
   MOC / 결정 이유 / 타임라인 / 재사용할 교훈
```

Obsidian에는 최종 문서를 복사하지 않는다. 이 노트는 사람이 “어디로 가야 하는지” 찾게 하고, 위키링크는 “왜 그렇게 됐는지” 복원하게 한다.

**예외 — 외부 게시본의 Vault 사본.** Confluence 등 저장소 밖에 게시되는 문서는 링크만 두면 오프라인에서 끊기고 변경 이력도 추적이 안 된다. 이런 것만 사본을 둔다: [[projects/moveseye/assets-design-spec|assets-design-spec]] · [[projects/moveseye/geo-maps-design-spec|geo-maps-design-spec]] · [[projects/moveseye/license-guide|license-guide]]. 조건은 **frontmatter `source:`로 정본 경로를 명시**하고 **“정본을 먼저 고치고 여기로 복사”** 방향을 본문 첫 인용구에 적는 것이다. 사본이 정본 행세를 하기 시작하면 이 예외는 폐기한다.

## 현재 정본 문서

| 질문 | 문서 경로 |
|---|---|
| 문서 전체 지도 | `C:\solutions\moveseye-docs\README.md` |
| 문서 status·갱신 규칙 | `C:\solutions\moveseye-docs\GOVERNANCE.md` |
| 제품이 무엇인가 | `product\overview.md` |
| 처음 어떻게 쓰나 | `guides\quick-start.md` |
| 메뉴별로 무엇을 하나 | `guides\user-guide.md` |
| 시스템 경계는 무엇인가 | `technical\architecture.md` |
| 무엇을 어디에 저장하나 | `technical\data-model.md` |
| 어떻게 기동·진단하나 | `operations\operator-runbook.md` |
| 용어의 정확한 뜻은 | `reference\glossary.md` |
| 무엇이 있고 무엇이 비었나 | `reference\document-inventory.md` |

## 기계적 사실의 정본

| 정보 | 정본 |
|---|---|
| REST 계약 | Spring Controller/DTO + dev `/v3/api-docs` |
| FE 화면·메뉴 | `routes.tsx`, `SideNav.tsx` |
| DB schema | Flyway `V1`~latest |
| 수집 엔진 경계 | `engine-api` public 계약 + Gradle dependency |
| 진행 중 BE↔FE 계약 | `_workspace/contract_*.md` |
| 에이전트 협업 | 루트 `AGENTS.md`, `COLLAB.md` |

## 독자별 진입

- 신규 입사자: 제품 개요 → 빠른 시작 → [[projects/moveseye/moveseye-overview|moveseye-overview]]
- 운영자: 사용자 가이드 → 운영 Runbook → [[projects/moveseye/zabbix-admin-manual-nexen|zabbix-admin-manual-nexen]]
- 개발자: 루트 개발자 온보딩 → 아키텍처 → 데이터 모델 → 관련 dated note
- 설계 검토자: [[projects/moveseye/moveseye-design-qa|moveseye-design-qa]] → 관련 결정·구현 노트

## 기능 완료 뒤 문서 승격

```text
design/devdesign → contract → 구현 → integration/functional QA
  → moveseye-docs/features/<feature>.md
  → 사용자·운영·아키텍처 문서 영향 반영
  → 이 Vault에 결정·교훈·타임라인 연결
```

모든 `_workspace` 파일을 옮기지 않는다. 최종 동작, 경계 불변식, 운영상 주의, 검증 근거만 승격한다.

## 채택 결정

- 제품 문서는 독립 docs 저장소를 정본으로 둔다.
- Obsidian은 MOC와 이유·교훈을 맡는다.
- 코드와 문서가 충돌하면 코드만 믿고 끝내지 않고, 문서 drift를 같은 변경에서 해소한다.
- route 존재와 제품 제공 상태를 구분한다. Application·Database·GPU Monitoring은 runtime 검증 전 current로 약속하지 않는다.
- `current` 문서와 `배포됨`을 구분한다. 배포 주장은 commit·Flyway·환경·QA evidence가 있을 때만 한다.
- 비밀값·실계정·운영 URL은 어떤 문서 층에도 기록하지 않는다.

상세: `C:\solutions\moveseye-docs\decisions\ADR-0001-documentation-ssot-and-obsidian.md`

## 연결된 경험

- [[projects/moveseye/2026-07-22-collector-engine-decision|2026-07-22-collector-engine-decision]] · [[projects/moveseye/2026-07-28-collector-engine-phase1|2026-07-28-collector-engine-phase1]] — engine 경계
- [[projects/moveseye/2026-07-28-be-package-restructure|2026-07-28-be-package-restructure]] — Spring package·어휘 규칙
- [[projects/moveseye/2026-07-16-auth-hardening|2026-07-16-auth-hardening]] — 인증·권한 문서화 원천
- [[projects/moveseye/2026-07-08-assets-management|2026-07-08-assets-management]] · [[projects/moveseye/2026-07-13-network-maps|2026-07-13-network-maps]] · [[projects/moveseye/2026-07-29-geo-maps|2026-07-29-geo-maps]] — 기능 문서 승격 우선 대상
- [[projects/moveseye/2026-08-03-implementation-risk-audit|2026-08-03-implementation-risk-audit]] — 문서가 가려서는 안 되는 미검증 경계
- [[projects/moves-workforce/2026-07-08-deliverables-map|2026-07-08-deliverables-map]] — Moves Workforce 참고 구조

## 열린 항목

- 환경별 실제 배포·백업·복구 Runbook 검증
- 보안·권한 정책서 작성
- OpenAPI 기반 API catalogue 자동 생성
- 자산·비용·맵·Zabbix 관리·scheduler 기능 문서 승격
- 실제 배포 version/commit 기준 릴리스 노트 운용
