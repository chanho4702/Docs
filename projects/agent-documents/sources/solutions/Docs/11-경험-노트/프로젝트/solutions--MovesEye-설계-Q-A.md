---
type: project
tags: [project, moveseye, reference, design, qa, architecture, documentation]
created: 2026-08-05
updated: 2026-08-05
status: active
---

# MovesEye 설계 Q&A

> MovesEye의 현재 구현이 **어떤 구조이고 왜 그 방식인지**를 빠르게 이해하는 질문·답변이다.
> 상위: [[projects/moveseye/moveseye|moveseye]] · 문서 체계: [[projects/moveseye/moveseye-documentation-system|moveseye-documentation-system]] · 제품 문서 정본: `C:\solutions\moveseye-docs`

## 제품과 경계

### 1. MovesEye는 Zabbix를 대체하나?

아니다. Zabbix가 metric 수집, Trigger 평가, Problem과 inventory의 원천이다. MovesEye는 Zabbix API를 운영 친화적인 화면·권한·자산·비용·맵 업무로 연결한다.

### 2. 현재 백엔드 정본은 무엇인가?

`C:\solutions\moveseye-be-spring`의 Spring Boot 3.3 백엔드다. 2026-06-22 Spring 단일 채택을 확정했고 FE runtime도 Spring으로 전환했다. `moveseye-be` NestJS는 호환 원본과 역사 확인용이다.

### 3. route가 있으면 제품 기능이 완료된 것인가?

아니다. FE route는 placeholder나 edition 후보일 수 있다. Application·Database·GPU Monitoring은 runtime 데이터·권한·운영 검증 전 current 기능으로 약속하지 않는다.

## 수집 엔진

### 4. Spring backend가 세 module인 이유는?

root `app`은 웹·인증·DB·업무 조합을 맡고, `engine-api`는 데이터소스 계약, `engine-zabbix`는 Zabbix 구현을 맡는다. Zabbix 이외 adapter를 넣을 수 있게 외부 시스템 경계를 분리했다. → [[projects/moveseye/2026-07-22-collector-engine-decision|2026-07-22-collector-engine-decision]]

### 5. 왜 `app`이 `engine-zabbix`를 compile 의존하지 못하게 했나?

새 코드가 편의상 Zabbix 구현을 직접 부르면 추상화가 다시 무너진다. `implementation(engine-api)`와 `runtimeOnly(engine-zabbix)`로 build가 위반을 차단한다. review 규칙보다 강한 구조적 안전장치다. → [[projects/moveseye/2026-07-28-collector-engine-phase1|2026-07-28-collector-engine-phase1]]

### 6. `engine-api` 안에 왜 중립과 Zabbix 전용 계약이 함께 있나?

Metric·Inventory·Alert 읽기는 데이터소스 중립화할 가치가 있다. 반면 Template link, Item key, Trigger expression 같은 관리 기능은 Zabbix semantics가 제품 기능 자체다. 억지로 중립화하면 손실 큰 최소공통분모가 되므로 `engine/`과 `zabbix/` 구역을 구분한다.

### 7. Prometheus는 지금 쓸 수 있나?

아니다. adapter 확장 구조는 준비됐지만 Step 6 실연동은 보류 상태다. “지원 가능한 구조”와 “검증된 지원”을 구분한다.

## API·인증·권한

### 8. API 계약의 최종 정본은 무엇인가?

Spring Controller/DTO와 dev profile의 OpenAPI다. `_workspace/contract_*.md`는 BE→FE 개발 접점이며 구현 완료 후 runtime과 일치하는지 검증해야 한다.

### 9. 왜 HTTP 200인데 실패일 수 있나?

NestJS 호환을 보존한 legacy 계약 때문에 일부 오류가 HTTP 200의 `ApiResult.status/code/errorCode`에 표현된다. client는 transport status와 body envelope를 함께 판정한다. 인증 실패는 실제 401이다.

### 10. `syncTime`은 무엇을 보장하나?

응답의 데이터 기준 시각을 표시한다. 서로 다른 Item이 정확히 같은 순간에 측정됐다는 뜻은 아니다. stale 여부와 화면 기준을 설명하는 metadata다.

### 11. 인증 session은 어떻게 유지하나?

짧은 access token과 회전하는 refresh token을 사용하고, refresh/session 상태는 Redis와 cookie 정책으로 통제한다. local HTTP와 운영 HTTPS에서 `Secure` 설정이 다르며 CORS는 credential allowlist가 필요하다. → [[projects/moveseye/2026-07-16-auth-hardening|2026-07-16-auth-hardening]]

### 12. 권한은 Role만 보면 되나?

아니다. Role은 기능 권한, User Group–Host Group 연결은 데이터 범위를 통제한다. FE 메뉴 숨김은 UX일 뿐이고 서버가 두 축을 다시 검증해야 한다.

## 데이터·도메인

### 13. metric은 PostgreSQL에 저장하나?

일반적인 History/Trend 원천은 Zabbix다. PostgreSQL은 사용자·권한·설정·event mirror·자산·비용·map·scheduler metadata처럼 MovesEye 업무 상태를 저장한다.

### 14. 데이터가 없으면 0으로 표시해도 되나?

아니다. “관측값 없음”과 실제 0은 운영 의미가 다르다. 집계 분모가 없거나 Item이 없는 상태를 0으로 채우면 정상처럼 보일 수 있다. → [[topics/metrics/aggregation-null-vs-zero|aggregation-null-vs-zero]]

### 15. 자산 정보의 편집 소유자는 누구인가?

Zabbix에서 온 필드는 Zabbix가 원천이고, MovesEye custom 자산과 비용·분류 같은 보강 필드는 MovesEye가 소유한다. `source`, `zabbix_hostid`, `linked_hostid`, `excluded`가 이 관계를 설명한다. → [[projects/moveseye/2026-07-08-assets-management|2026-07-08-assets-management]]

### 16. 지리 맵 좌표를 왜 자산 DB에 따로 저장하지 않나?

지도와 자산 화면이 서로 다른 좌표를 보여 주는 drift를 막기 위해 Zabbix inventory를 단일 원천으로 정했다. Geo Cluster는 묶음 문서만 DB에 저장한다. → [[projects/moveseye/2026-07-29-geo-maps|2026-07-29-geo-maps]]

### 17. DB schema는 누가 바꾸나?

Flyway migration만 바꾼다. JPA `ddl-auto`는 `none`이다. 기존 TypeORM schema는 V1 baseline이고 이후 변경은 순차 migration으로 추가한다.

## 문서와 작업 흐름

### 18. 최종 제품 문서는 어디에 있나?

`C:\solutions\moveseye-docs`가 정본이다. 제품·사용자·기술·운영·reference·ADR·release로 나뉜다. 루트 온보딩과 repo README는 해당 목적의 보조 정본이다.

### 19. 왜 Obsidian에 최종 문서를 복사하지 않나?

복사본은 언젠가 서로 다른 내용을 갖게 된다. Obsidian은 MOC, 결정 이유, 타임라인, 교훈을 맡고 최종 문서 path를 연결한다. 상세: [[projects/moveseye/moveseye-documentation-system|moveseye-documentation-system]].

### 20. `_workspace` 문서는 언제 정식 문서가 되나?

설계→계약→구현→integration/functional QA가 끝나고 현재 동작이 확정됐을 때다. 모든 로그를 옮기지 않고 불변식·실패·운영·검증 근거만 `moveseye-docs/features/`로 승격한다.

### 21. 문서가 코드와 다르면 무엇을 믿나?

runtime과 기계적 정본을 먼저 확인한다. 단순 drift면 문서를 갱신한다. 확정 결정과 코드가 어긋나면 문서를 코드에 맞춰 숨기지 말고 구현 결함으로 등록한다.

## 관련 문서

- [[projects/moveseye/moveseye-overview|moveseye-overview]] — 현재 2관점 온보딩
- [[projects/moveseye/moveseye-documentation-system|moveseye-documentation-system]] — 문서 탐색·승격 규칙
- [[projects/moveseye/2026-08-03-implementation-risk-audit|2026-08-03-implementation-risk-audit]] — 현재 미검증·위험 경계
- `C:\solutions\moveseye-docs\technical\architecture.md`
- `C:\solutions\moveseye-docs\technical\data-model.md`

