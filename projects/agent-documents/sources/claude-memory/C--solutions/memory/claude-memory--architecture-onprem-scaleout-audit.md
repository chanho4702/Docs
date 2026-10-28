---
name: architecture-onprem-scaleout-audit
description: 2026-08-21 설치형 관점 아키텍처 평가 + 스케일아웃 대비 진단 — 정본 _workspace/audit_architecture-onprem-scaleout.md
metadata: 
  node_type: memory
  type: project
  originSessionId: 6cc1f3ef-0ce8-4437-9fd7-d2936ab634c8
  modified: 2026-08-21T05:31:37.552Z
---

2026-08-21 아키텍처 전면 평가(설치형 + 스케일아웃). 정본: `_workspace/audit_architecture-onprem-scaleout.md`, 공유 페이지: https://claude.ai/code/artifact/593c5e59-081b-40de-a746-b53944241c82

**핵심 결론**: "제품 코드는 설치형인데 배포는 아직 SaaS." 코드 레벨([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--premium-license-design|premium-license-design]] 라이선스·Flyway V26·시크릿 암호화·엔진 포트화)은 갖춰졌으나 **설치 패키지 실물이 없음** — moveseye-ai는 Dockerfile 자체가 없고, 리포에 nginx.conf 0개(문서=nginx, 파이프라인=Apache 불일치), 설치 가이드는 V20 기준 drift + unverified.

**설치형 권고 순서**: ①설치 번들 실물화(compose+이미지 tar+.env 템플릿) ②AI Dockerfile ③클린 머신 설치 리허설 ④dev 프로파일 배포 차단 + NestJS/Vault 잔재 정리. `application-prod.yml`은 BE·AI 모두 없음(default=운영 전략).

**게이트웨이 결정(08-21)**: 전용 API Gateway 제품(SCG·Kong) **미채택** — 인증·rate limit·라우팅(정적 3갈래)을 기존 구조가 이미 보유, 설치형에서 구성요소=지원 비용, 인증 뒤 라이선스(P18)·visitor-id 배선과 충돌. **nginx가 게이트웨이 겸 LB**. 재검토 조건 = 외부 공개 API 판매 or 서비스 4~5개(엔진 gRPC 승격 등). **무도커 설치 경로**도 가능·필요(systemd/Windows 서비스+jlink JRE 동봉+env 주입 장치) — 🔴단 Redis가 Windows 미지원인데 인증 필수 의존성이라 "Windows Server+도커 금지" 고객은 영업 단계에서 거를 것.

**스케일아웃**: 실익은 처리량이 아니라 HA(BE 읽기 대부분 Zabbix 프록시라 증설=병목 이동). Spring BE는 준비도 높음 — 인증 전부 Redis(인메모리 폴백 없음, sticky 불필요), 배치는 scheduler_lease(V21) 보호, 로컬 파일 쓰기 0건. 남은 수정 2건은 단일 인스턴스에서도 이득이라 선반영 권고: **S1** 비용 일괄 업로드 디스패치가 인메모리(@Async, DB queued 픽업은 기동 시점뿐 → DB 폴링 워커화) · **S2** scheduler_lease heartbeat 없음(TTL 30분 고정 → 실행 중 연장). moveseye-ai는 **의도적 단일 인스턴스(설계 M3)** — 승인 게이트 인메모리 Future·아티팩트 로컬 디스크·SSE — 스케일아웃 말고 active-passive 권고. 실질 비용은 Postgres 복제 + Redis Sentinel.


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

아키텍처 설치형·스케일아웃 진단 — 2026-08-21 "코드는 설치형인데 배포는 SaaS": 설치 번들·AI Dockerfile·nginx.conf 전무, 설치 가이드 V20 drift. BE 스케일아웃 준비 높음(잔여 S1 업로드 워커 폴링화·S2 lease heartbeat — 단일에서도 이득이라 선반영 권고), AI는 의도적 단일(M3). **게이트웨이=전용 제품 미채택·nginx로**(재검토: 공개 API 판매 or 서비스 4~5개) · 무도커 경로 가능하나 🔴Redis Windows 미지원. 정본 _workspace/audit_architecture-onprem-scaleout.md
