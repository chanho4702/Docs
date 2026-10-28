---
tags: [moveseye, architecture, on-premise, scale-out, gateway]
updated: 2026-08-21
---

# 2026-08-21 아키텍처 전면 평가 — 설치형·스케일아웃·게이트웨이

> 정본: `C:\solutions\_workspace\audit_architecture-onprem-scaleout.md` (파일:라인 근거 포함)
> 공유 페이지: https://claude.ai/code/artifact/593c5e59-081b-40de-a746-b53944241c82

코드·설정·파이프라인 실물 조사 2회(배포/패키징 실태, 스케일아웃 제약)를 바탕으로 한 전면 평가. 조치는 미착수, 판단과 권고만 확정.

## 핵심 결론 3개

### 1. 설치형: "제품 코드는 설치형인데 배포는 아직 SaaS"

- 코드 레벨은 성숙: 라이선스 커널(RS256 공개키 jar 내장·발급기 별도 저장소·ArchUnit 강제, [[topics/backend/offline-license-enforcement|offline-license-enforcement]]), Flyway V1~V26 연속 + baseline, 시크릿 암호화, 안전한 운영 기본값(fail-fast), 엔진 포트화.
- 그러나 **고객사에 건넬 설치 패키지가 실물로 없음**: CI가 자사 서버에 직접 `docker run`/`cp`(자사 운영형), moveseye-ai는 Dockerfile 자체가 없고, 리포에 nginx.conf 0개(문서=nginx vs 파이프라인=Apache 불일치), 설치 가이드는 V20 기준 drift + "production deployment unverified".
- 권고 순서: ①설치 번들 실물화(compose+이미지 tar+.env 템플릿) ②AI Dockerfile ③클린 머신 설치 리허설 ④dev 프로파일 배포 차단(+NestJS/Vault 잔재·`.env` 죽은 키 정리). `application-prod.yml`은 BE·AI 모두 없음("default=운영" 전략 — 고객이 dev 프로필로 띄우면 Swagger 열림).

### 2. 스케일아웃: 실익은 처리량이 아니라 HA

- BE 읽기 대부분이 Zabbix 프록시라 **BE 증설 = 병목 이동**. 평가 기준은 active-active 2대(HA).
- **Spring BE는 준비도 높음**: 인증 상태 전부 Redis(인메모리 폴백 없음, JWT 쿠키라 sticky 불필요), 배치는 scheduler_lease(V21) 클레임, 로컬 파일 쓰기 0건(업로드도 DB bytea+heartbeat fencing), SSE/WS 없음.
- 잔여 수정 2건 — **단일 인스턴스에서도 크래시 복구가 좋아지므로 선반영 권고**:
  - S1: 비용 일괄 업로드 디스패치가 인메모리 `@Async`(DB queued 픽업은 기동 시점뿐) → DB 폴링 워커화. claimQueued·heartbeat 부품은 기존재, 배선만 남음.
  - S2: scheduler_lease heartbeat 없음(TTL 30분 고정 — 크래시 시 30분 잠김 / 30분 초과 배치는 중복 시작 가능) → 실행 중 TTL 연장.
- **moveseye-ai는 의도적 단일 인스턴스(설계 M3)**: 승인 게이트가 인메모리 `CompletableFuture` 블로킹, 아티팩트 본문이 로컬 디스크(메타만 DB), SSE 스트림·busy·OAuth 코드 메모리. → 스케일아웃 말고 **active-passive**. 부하가 LLM 대기(I/O)라 수직 확장으로 충분.
- 실질 비용은 데이터 계층: Postgres 복제 + Redis Sentinel(인증이 전부 Redis라 죽으면 전원 로그인 불가). 전체 가용성은 고객 Zabbix HA에 종속 — 문서 명시 필요.

### 3. 게이트웨이: "달지 말자"가 아니라 "nginx로 달자"

- 리버스 프록시(nginx) 수준 = **필수**(고객은 URL 하나: `/`=FE·`/api/`=BE·`/ai/`=AI, 스케일아웃 시 LB 겸용).
- 전용 API Gateway 제품(Spring Cloud Gateway·Kong) = **현 단계 미채택**:
  1. 게이트웨이가 파는 가치(인증·rate limit·라우팅)를 이미 기존 구조가 보유 — 서비스 2개, 정적 3갈래.
  2. 설치형에서 구성요소 = 지원 비용(JVM 3개째 또는 이기종+자체 DB, 홉 +1).
  3. 인증 설계와 충돌 — 라이선스 게이트는 인증 뒤(P18), visitor-id·refresh가 BE 배선. 게이트웨이로 올리면 복제/분할로 버그 표면 확대.
- 재검토 조건: 외부 공개 API 판매(API 키·쿼터·과금) 시작, 또는 엔진 gRPC 분리 승격([[projects/moveseye/2026-07-22-collector-engine-decision|2026-07-22-collector-engine-decision]]) 등 서비스 4~5개 이상.

## 곁가지 판단

- **무도커 설치 경로**: 가능하고 언젠가 필요(공공·금융 도커 금지). Java fat jar라 도커 의존이 원래 낮음. 대체재 = systemd 유닛/Windows 서비스 + **JRE 동봉(jlink)** + env 주입 장치(Spring은 `.env` 자동 로드 안 함). 🔴함정: **Redis는 Windows 공식 미지원**인데 우리 Redis는 인증 필수 의존성 — "Windows Server + 도커 금지" 고객은 영업 단계에서 걸러야(지원 환경 명세에 명시).
- 지원 OS 목록을 좁게 못박는 것이 무도커 환경 다양성 관리의 유일한 수단.

## 교훈

- **"설치형"이라는 말과 실제 산출물은 별개다** — 코드가 아무리 설치형답게 짜여도, CI가 자사 서버에 직접 배포하고 있으면 그 제품의 배포 아키텍처는 SaaS다. 평가는 문서·코드가 아니라 파이프라인 실물에서 갈렸다.
- 스케일아웃 평가의 순서: "무엇이 막나"보다 **"애초에 왜 늘리나(처리량 vs HA)"**를 먼저 갈라야 답이 달라진다.
- 단일 인스턴스 가정이 코드 주석에 명시돼 있으면(M3, DeviceClassificationRegistry 등) 평가가 빨라진다 — 설계 시점에 제약을 적어두는 습관의 가치.
