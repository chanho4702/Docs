# MovesEye 문서 허브

| 항목 | 내용 |
|---|---|
| 대상 독자 | 전체 |
| 문서 상태 | current |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-11 |
| 최종 검토 | 2026-08-11 |
| 검토 주기 | monthly |
| 정본 위치 | C:/solutions/moveseye-docs |
| 적용 범위 | source worktree only; deployment unverified |

# MovesEye 문서 허브

MovesEye(DMOVE)는 여러 모니터링 데이터소스(Zabbix·Prometheus·Datadog·Elasticsearch)를 소스 중립 계약으로 정규화해, 서버·네트워크·클라우드 자원의 상태·장애·자산·비용을 하나의 운영 화면에서 관리하는 **종합 모니터링 제품**이다. 2026-08-11 현재 동작하는 어댑터는 **Zabbix 하나**이며, 나머지는 계약이 준비된 계획 상태다.

이 디렉터리는 제품 설명부터 운영·개발 기준까지 연결하는 **서술 문서 정본(SSOT)** 이다. REST·schema·route 같은 기계적 사실은 코드와 생성 계약이 더 높은 우선순위를 가진다.

## 처음 보는 사람의 읽기 순서

| 독자 | 먼저 읽기 | 다음 문서 |
|---|---|---|
| 고객·도입 검토자 | **제품 소개서** | **자주 묻는 질문**, **제품 개요**, **용어집** |
| 반복 문의에 답해야 하는 지원 담당자 | **자주 묻는 질문** | **문제 해결** |
| 신규 입사자 | **제품 개요** | **용어집** |
| 일반 사용자 | **빠른 시작** | **사용자 가이드**, **화면별 가이드**, **문제 해결** |
| 특정 화면 사용법을 찾는 사람 | **화면별 가이드 색인** | 사이드바 메뉴 그대로 찾는다 |
| 시스템 관리자 | **관리자 가이드** | **설치·배포 가이드**, **문제 해결** |
| 설치 담당자 | **설치·배포 가이드** | **관리자 가이드** |
| 개발 운영자·검증 담당자 | **로컬·검증 Runbook** | **아키텍처**, **데이터 모델** |
| Production 운영 책임자 | **Production Runbook draft** | **Credential 정책 draft** — 둘 다 current 승격 전 실행 금지 |
| 개발자 | `C:\solutions\moveseye_개발자_온보딩.md` | **API 카탈로그**, **아키텍처**, **문서 운영 규칙** |
| 연동 개발자 | **API 카탈로그** | **아키텍처** |
| 기능 담당자 | **기능 문서 목록** | **기능 문서 템플릿** |

## 문서 지도

```text
moveseye-docs/
├── product/       제품 정의·도입 설명
├── guides/        사용자가 목표를 달성하는 절차
├── technical/     아키텍처·데이터·계약의 현재 기준선
├── operations/    기동·점검·장애 대응 Runbook
├── features/      기능별 설계→계약→운영 연결 문서
├── decisions/     채택된 ADR(Architecture Decision Record)
├── reference/     용어집·문서 인벤토리처럼 반복 참조하는 정보
├── releases/      배포 기준 변경 이력
└── templates/     새 문서를 만들 때 복사하는 표준 형식
```

전체 상태와 다음 작성 순서는 **문서 인벤토리**에서 관리한다.

> 기준선 주의: 위 commit은 문서 작성 시 확인한 HEAD다. BE에는 사용자 소유의 미커밋 변경이 있었고, 이 문서 세트는 실제 배포 환경을 검증하지 않았다. 따라서 capability 표의 “소스 구현”은 “배포됨”을 뜻하지 않는다.

## 시스템 한눈에 보기

_[다이어그램 — Confluence 기본 에디터는 mermaid 미지원. Mermaid 매크로 또는 이미지로 교체]_

```
flowchart LR
    U[운영자·관리자] --> FE[React 19 / Vite FE]
    FE -->|HTTP + refresh cookie| BE[Spring Boot 3.3 app]
    BE --> DB[(PostgreSQL / Flyway)]
    BE --> R[(Redis)]
    BE --> API[engine-api<br/>소스 중립 port]
    API --> ZBX[engine-zabbix]
    API -.계획.-> PRM[Prometheus]
    API -.계획.-> DDG[Datadog]
    API -.계획.-> ELS[Elasticsearch]
    ZBX --> Z[Zabbix JSON-RPC]
    BE --> AWS[AWS APIs]
```

백엔드 `app`은 `engine-api`만 compile 의존하고 어댑터는 runtimeOnly로 연결한다 — **빌드가 이 경계를 강제한다.** 새 모니터링 읽기 기능은 특정 소스 구현을 직접 호출하지 않고 capability port를 거치므로, 소스를 추가해도 서비스 레이어와 화면은 바뀌지 않는다.

## 무엇이 정본인가

| 정보 | 정본 | 이 문서 세트의 역할 |
|---|---|---|
| REST 경로·요청·응답 | Spring Controller/DTO + dev OpenAPI | 사람이 이해할 수 있게 흐름과 예외를 설명 |
| FE route·navigation | `moveseyee_fe/src/routes/routes.tsx`, `SideNav.tsx` | 사용자 목표 기준으로 묶어 설명 |
| FE 화면의 실제 내용 | `moveseyee_fe/src/pages/`, `src/components/` | 안정된 사용자 동작을 설명 |
| DB schema | `moveseye-be-spring/src/main/resources/db/migration/` | 테이블의 책임·관계를 설명 |
| 수집 엔진 경계 | `engine-api` public type + module build dependency | 중립 계약과 Zabbix 전용 계약의 경계를 설명 |
| 진행 중 기능 계약 | `C:\solutions\_workspace\contract_*.md` | 완료 후 stable 문서로 승격 |
| 결정·교훈·타임라인 | Obsidian `claude-experiences/projects/moveseye/` | 최종 문서의 배경과 변경 이유를 보존 |
| 에이전트·협업 규칙 | `C:\solutions\AGENTS.md`, `COLLAB.md` | 문서와 코드를 수정하는 절차를 통제 |

코드와 문서가 충돌하면 코드를 확인하되, 충돌을 그대로 방치하지 말고 같은 변경에서 문서를 동기화한다.

## 기존 문서와의 관계

- `C:\solutions\제품소개_신규입사자.md`: 기존 상세 제품 온보딩. 제품 개요의 보조 자료로 유지한다.
- `C:\solutions\moveseye_개발자_온보딩.md`: 개발자 입문 정본. 이 허브의 기술 문서와 함께 읽는다.
- 각 코드 저장소의 `README.md`, `AGENTS.md`, `CLAUDE.md`: 해당 저장소의 빌드·코딩 규칙 정본이다.
- `C:\solutions\_workspace\`: 설계·계약·QA 증거를 기능별로 누적하는 작업 공간이며, 완성 문서의 영구 위치가 아니다.

## 문서를 바꾸는 최소 절차

1. **문서 운영 규칙**에서 문서 유형과 정본을 확인한다.
2. 코드·OpenAPI·migration·route 중 관련 사실 원천을 교차 확인한다.
3. 문서의 `baseline`, `reviewed_at`, 변경 이력을 갱신한다.
4. 상대 문서 링크와 **문서 인벤토리**를 확인한다.
5. 결정이나 재사용할 교훈이 생겼으면 Obsidian MOC에 연결한다.
