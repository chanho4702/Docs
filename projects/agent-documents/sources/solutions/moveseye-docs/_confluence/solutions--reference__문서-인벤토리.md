# MovesEye 문서 인벤토리

| 항목 | 내용 |
|---|---|
| 대상 독자 | 문서 관리자, 개발 리더, 운영 리더 |
| 문서 상태 | current |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-11 |
| 최종 검토 | 2026-08-11 |
| 검토 주기 | monthly |
| 정본 위치 | C:/solutions/moveseye-docs |

# MovesEye 문서 인벤토리

## 1. 현재 문서 세트

| ID | 문서 | 대상 | 상태 | 다음 review trigger |
|---|---|---|---|---|
| H1 | `README.md` 문서 허브 | 전체 | current | 문서 추가·경로 변경 |
| G1 | `문서-운영규칙.md` 운영 규칙 | 작성자 | current | 역할·정본 정책 변경 |
| P1 | `product/제품-개요.md` 제품 개요 | 도입·신규 | current | capability·edition 변경 |
| P2 | `product/제품-소개서.md` 제품 소개서 | 고객·영업 | current | 기능 제공 범위·edition 변경 |
| U1 | `guides/빠른-시작.md` 빠른 시작 | 신규 사용자 | current | 메뉴·초기 설정 변경 |
| U2 | `guides/사용자-가이드.md` 사용자 가이드 | 사용자·관리자 | current | route·SideNav 변경 |
| U3 | `guides/관리자-가이드.md` 관리자 가이드 | 시스템 관리자 | current | 권한 키·scheduler job·license 정책 변경 |
| U4 | `guides/문제-해결.md` 문제 해결 가이드 | 사용자·지원 | current | 신규 알려진 이슈·오진 사례 |
| U5 | `guides/pages/` 화면별 가이드 27종 + 색인 | 사용자·운영·지원 | current | **SideNav 메뉴 추가·삭제·이름 변경**, 화면 구성 변경 |
| U5-APM | `guides/pages/모니터링/애플리케이션-모니터링.md`, `수집기-설치.md` | 사용자·관리자·설치·지원 | review | APM 브라우저 렌더·배포 검증 완료 시 `current`. `ApmInstallGuideService` 문구·`ApmInstallVersions` 버전 변경 시 수집기 설치 문서 동기화 |
| U6 | `guides/자주-묻는-질문.md` FAQ | 고객·사용자·관리자·지원 | review | 신규 반복 문의, 기능 제공 상태([제공]/[개발 중]/[예정]) 변경 |
| T1 | `technical/아키텍처.md` 아키텍처 | 개발·운영 | current | module·인증·data flow 변경 |
| T2 | `technical/데이터-모델.md` 데이터 모델 | BE·운영 | current | Flyway migration 추가 |
| T3 | `technical/API-카탈로그.md` API 카탈로그 | 개발·연동 | current | controller 추가·응답 규약 변경 |
| O0 | `operations/설치-배포-가이드.md` 설치·배포 가이드 | 설치·인프라 | review | env 변수·Dockerfile·Flyway 최신 버전 변경 |
| O1 | `operations/운영자-런북.md` 로컬·검증 Runbook | 개발 운영 | review | env·기동 변경, runtime 재현 검토 |
| O2 | `operations/프로덕션-런북.md` Production Runbook | 운영 책임자 | draft/실행 금지 | owner·pipeline·backup/restore·rollback·escalation 확정 |
| O3 | `operations/시크릿-보호-정책.md` Credential 정책 | 보안·운영 | draft/production 차단 | secret store·masking·권한·rotation 검증 |
| FH1 | `features/README.md` 기능 문서 hub | 기능 담당 | review | 첫 stable 기능 문서 승격 |
| DH1 | `decisions/README.md` ADR hub | 기술 리더 | current | ADR 추가·대체 |
| D1 | `decisions/ADR-0001-문서-정본과-옵시디언.md` | 문서 관리자 | current/accepted | 정본 platform 변경 |
| R1 | `reference/용어집.md` 용어집 | 전체 | current | 도메인 용어·계약 변경 |
| R2 | 이 문서 인벤토리 | 문서 관리자 | current | 문서 상태 변경 |
| L1 | `releases/릴리스-노트.md` 릴리스 노트 | 전체 | draft | 실제 배포 기준 확정 |

## 1.1 템플릿과 작업 규칙

| 문서 | 용도 | 상태 |
|---|---|---|
| `AGENTS.md` | 문서 저장소 작업 규칙 | current |
| `templates/기능-문서-템플릿.md` | 기능 문서 | template |
| `templates/ADR-템플릿.md` | ADR | template |
| `templates/런북-템플릿.md` | 운영 절차 | template |
| `templates/릴리스-템플릿.md` | 릴리스 | template |

## 2. 기존 문서

| 경로 | 현재 역할 | 상태·조치 |
|---|---|---|
| `C:\solutions\제품소개_신규입사자.md` | 상세 제품 온보딩 | 유지. P1과 중복되는 부분은 차기 review에서 통합 |
| `C:\solutions\moveseye_개발자_온보딩.md` | 개발자 입문 | 유지. 최근 cost/scheduler/engine 변화 월간 점검 필요 |
| 각 repo `README.md` | build·module 설명 | repo 정본으로 유지 |
| 각 repo `AGENTS.md`/`CLAUDE.md` | 작업 규칙 | 문서 세트로 복사하지 않음 |
| `_workspace/design_*.md`, `devdesign_*.md` | 진행 중·과거 설계 | 기능 완료 시 핵심만 `features/`로 승격 |
| `_workspace/contract_*.md` | BE↔FE 경계 계약 | 코드와 OpenAPI 반영 후 기능 문서에 결과 연결 |
| `_workspace/e2e_*.md` | runtime QA 증거 | 기능 문서의 검증 근거로 연결 |

## 3. 다음 작성 우선순위

| 우선 | 문서 | 완료 조건 |
|---:|---|---|
| 1 | Production Runbook draft 승격 | 환경별 배포 경로, owner, backup restore, rollback 검증 포함 |
| 2 | Credential 정책 draft 승격 | secret store, masking, rotation, 최소권한 검증 포함 |
| 3 | 설치·배포 가이드 `review` → `current` | 실제 신규 환경 설치 1회 수행으로 절차 검증 |
| 4 | 라이선스 기능 문서 승격 | 구현 완료 후 `_workspace/features/auth-license/license/devdesign_premium-edition.md`에서 핵심 승격 |
| 5 | 기능 문서 승격 | 자산·비용·맵·Zabbix 관리·scheduler부터 작성 |
| 6 | 릴리스 기준선 | 배포 version·commit·migration·검증 evidence 연결 |
| 7 | 사용자 매뉴얼 screenshot | 안정화된 화면만 task별 보조 이미지 추가 |

> 완료: API 카탈로그(T3, 2026-08-11). 자동 생성이 아니라 수기 작성이므로 controller 추가 시 갱신이 필요하다.

## 3.1 파일명 규칙

문서 파일명은 **한글 케밥 표기**를 쓴다(`관리자-가이드.md`). 예외는 도구·플랫폼이 파일명으로 인식하는 것뿐이다.

| 유지하는 파일 | 이유 |
|---|---|
| `README.md`(루트·각 하위 디렉터리) | git 호스팅이 디렉터리 진입 시 자동 렌더링한다 |
| `AGENTS.md` | 에이전트 도구가 파일명으로 찾는다 |
| `.gitignore` | 도구 규약 |

## 4. 분기별 감사 질문

1. 현재라고 쓴 기능이 실제 배포 환경에서 동작하는가?
2. route가 있지만 placeholder인 기능을 제품 기능처럼 설명하지 않았는가?
3. 최신 Flyway version과 데이터 모델 baseline이 같은가?
4. OpenAPI와 FE service path가 일치하는가?
5. secret·실계정·운영 URL이 문서에 들어가지 않았는가?
6. `_workspace`에서 완료됐지만 stable 문서로 승격되지 않은 기능이 있는가?
7. Obsidian의 결정 노트와 current 문서가 서로 연결되는가?
8. 마지막 review 이후 독자 질문이 문서에 반영됐는가?

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 최초 인벤토리와 작성 backlog 생성 |
| 2026-08-11 | 신규 5종 등록(제품 소개서·관리자 가이드·문제 해결·API 카탈로그·설치 배포 가이드). 문서 파일명 한글화 및 규칙 명문화 |
| 2026-08-11 | **제품 포지셔닝 리뉴얼** — 다중 데이터소스(Zabbix·Prometheus·Datadog·Elastic) 종합 모니터링 기준으로 8개 문서 갱신 |
| 2026-08-11 | 화면별 가이드 25종 신설(U5) — SideNav 구조 그대로 디렉터리 구성 |
| 2026-09-01 | FAQ 신설(U6, `guides/자주-묻는-질문.md`) — 13영역 90문항, 2026-08-11 이후 기능 반영. 사실 검증 전이라 `review` |
| 2026-09-01 | **APM 고객 문서 신설**(U5-APM) — `애플리케이션-모니터링.md`(화면·상태 5종·알람 규칙·Zabbix 액션 연결)·`수집기-설치.md`(온보딩 3단계·60초 검증·문제 해결, `ApmInstallGuideService` 문구와 동일). 정정: `준비-중인-모니터링.md`에서 APM 절 제거·"Prometheus·Datadog 소스 필요" 문구 삭제, 제품 소개서 "Datadog: APM"→"외부 APM 읽기 연동(P4 후보)"·"APM [예정]"→"[제공(P1)]·트레이스/서비스 맵 [P2]", FAQ·사용자 가이드·라이선스 문서 링크 갱신 |
