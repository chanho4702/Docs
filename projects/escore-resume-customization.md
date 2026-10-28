---
type: project
tags: [resume, escore, elastic, moveseye, moves-workforce]
created: 2026-08-06
updated: 2026-08-06
status: active
---

# 에스코어 지원 이력서 보강 기준선

## 목적

김찬호 후보자의 에스코어 `Elastic Stack 기반 구축 전문가` 지원 이력서를 수정 요청이 들어올 때 이어서 관리하기 위한 기준선이다.

## 파일

- 원본: `C:\Users\DMOVE\claude-experiences\[시너지파트너즈] - 김찬호 후보자 이력서_에스코어.docx`
- 현재 보강본: `C:\Users\DMOVE\claude-experiences\[시너지파트너즈] - 김찬호 후보자 이력서_에스코어_보강본.docx`
- 원본은 덮어쓰지 않고 보존한다.

## 지원 포지션 핵심 요구사항

- Java/Spring backend 구축
- Linux·shell·운영 도구 활용
- Elastic/OpenSearch 기반 구축 및 검색·분석
- 고객 커뮤니케이션
- 우대: Elastic tuning, semantic search, RAG, AI 서비스 구현

## 2026-08-06 반영 내용

### MovesEye

- Java 17/Spring Boot 3.3 기반 백엔드 전환과 React 19 연동을 디무브 경력의 첫 프로젝트로 배치했다.
- NestJS → Spring 단일 백엔드 전환, 기존 Controller/DTO·응답 계약 보존을 명시했다.
- Gradle `app`/`engine-api`/`engine-zabbix` 멀티모듈과 Metric·Inventory·Alert port, Zabbix JSON-RPC adapter를 강조했다.
- Flyway V1-V19, PostgreSQL, Redis, Vault, HttpOnly cookie·refresh rotation·rate limit·fail-closed 인가를 반영했다.
- 영속 Job·heartbeat·lease/fencing·조건부 UPDATE 기반 CSV 대량 업로드의 재시작 복구·경합 안전성을 기록했다.
- 근거 정본은 `C:\solutions\moveseye-docs`, `moveseye-be-spring`, `moveseyee_fe`다.

### Moves Workforce

- Forge `nodejs22.x`·arm64·256MB 환경과 32개 resolver registrar, Forge SQL 13개 table, KVS Custom Entity 12종을 정량화했다.
- 계층형 팀·프로젝트 배정, MD/MM·가동률·진척도·인건비·Gantt, 급여 정책을 반영했다.
- Async Events + Queue 기반 Excel 업로드·portfolio 집계·issue backfill과 scheduled/event trigger를 강조했다.
- `PermissionMap`, `guardedDefine`, `ALL | MEMBER_ONLY | TEAM_ONLY`, `PROJECT_COST` 분리와 deny-by-default RBAC를 명시했다.
- worklog fetch, `p-limit`, KVS 10분 cache, 일일 snapshot으로 서버리스 제약에 대응한 내용을 추가했다.
- 근거 정본은 `C:\CloudJira\moves-workforce`와 [[moves-workforce-documentation-baseline-sync]]다.

### Elastic 및 지원동기

- 기존 Elasticsearch master/data/ingest, index·shard·mapping, Beats/Elastic Agent, Kibana 경험을 유지했다.
- Linux shell·Docker 기반 설치/기동 표준화와 cluster·pipeline·source 구간별 장애 진단을 추가했다.
- MovesEye의 Java/Spring 모니터링 경험을 Elastic/OpenSearch 기술서비스로 확장한다는 지원동기로 연결했다.

## 과장 방지 원칙

- OpenSearch 실무 구축, Elastic Certified Engineer, 검색 tuning, semantic search, 상용 RAG 구축 경험은 확인되지 않았다.
- OpenSearch와 RAG는 Elasticsearch 기반 및 Spring AI·Ollama 학습을 통한 확장 준비 경험으로만 표현한다.
- MovesEye 문서의 `소스 구현·배포 미확인` 상태를 고객 운영 배포 실적으로 바꾸지 않는다.
- 숫자는 문서 한 곳만 보지 않고 code·manifest·Flyway·route와 교차 확인한다.
- 개인 프로젝트와 회사 실무를 계속 구분한다.

## 문서 검수 기준선

- 원본 서식, 사진, 개인정보 동의 문구와 실제 Word bullet numbering을 유지했다.
- Microsoft Word 렌더 기준 최종 7페이지다.
- 전체 페이지에서 잘림·겹침·표 깨짐·빈 페이지가 없음을 확인했다.
- 자기소개서와 개인정보 동의서는 각각 독립 페이지로 배치했다.

## 후속 수정 시 확인 순서

1. 현재 보강본과 이 노트를 기준선으로 연다.
2. 수정 요청이 사실·표현·레이아웃 중 어느 범주인지 구분한다.
3. 신규 경력·수치는 관련 repository와 문서에서 다시 검증한다.
4. OpenSearch/RAG 등 미검증 항목을 실무 경력으로 승격하지 않는다.
5. DOCX 수정 후 Microsoft Word로 전 페이지를 다시 렌더링해 빈 페이지와 overflow를 확인한다.

관련: [[moveseye-documentation-system]], [[moves-workforce-documentation-baseline-sync]]
