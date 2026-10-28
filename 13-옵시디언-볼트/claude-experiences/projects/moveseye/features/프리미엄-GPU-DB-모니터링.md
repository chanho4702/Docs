---
type: feature-map
tags: [moveseye, feature-map, premium, gpu, db-monitoring, nvidia, jdbc]
updated: 2026-10-22
---

# 프리미엄 GPU·DB 모니터링 — NVIDIA 3경로·프리셋 템플릿·DB JDBC 폴러 설계

> 기능 지도 [[무브스아이-기능-지도]] · 허브 [[moveseye]] · 링크는 `C:\solutions` 로컬 파일(file://)이라 이 PC에서만 열린다. 읽기용 사본은 [[2026-10-07-docs-reading-repo]].

**한 줄** — GPU(ZM-78): NVIDIA 수집 3경로(DCGM Exporter·nvidia-smi·공식 플러그인)와 태그 식별 프리셋 템플릿, 설치 가이드 API, 위젯 대시보드. DB 모니터링: 시장 조사 → BE 내장 JDBC 폴러(세션·Top SQL·락·플랜) 설계 v1.1 → Datadog DBM 전수 대조 v1.2 → §16 인사이트 카탈로그 v1.3(10-22, 코덱스 3차 검수 반영).

**상태** — GPU 1·2차 master 병합·푸시 완료(10-13, V72·V73), 작업 폴더 정리 끝. DB 모니터링은 10-22 v2.1 착수본(Q22·26·27·3·12·13 확정, J2 원격 수집기 GA) → ZM-172 워크트리 코드 2차 커밋(10-22, 미푸시) → 10-23 v2.3 P0 착수(로컬 Docker PG16·R1-PG 실측 통과·계약 시험본·코어 폴러 프레임, 코덱스 6·7차 전건 반영) → **10-26 코어를 Gradle 모듈 `dbm-collector-core`로 분리(프로덕션 의존 0, 124 테스트), 8차 검수(gpt-6-astra) 보류→전건 반영(128 테스트), 3차 커밋·master rebase(`ad29023`, 미푸시) → J1 PG lease/writer/checkpoint + Flyway V90 + 실 PG IT 7건, 4차 커밋 `c3f3068`(미푸시), 진행 보고 `report_zm172-progress_2026-10-26.md` → **10-27 보존 v2.5(APM/Zabbix 계단 원본 2일·1m 7일·5m 30일·1h 400일·사건 400일, 디스크 예산 정책 삭제, APM 파티션·보존 구현체 `premium.common` 추출 + `dbm_retention` V91, 5차 커밋 `75ace5e` 미푸시) → **WS-2 잔여 J1 구동 조립(DbmPollerManager 레인 스레드·PgConfigSource·CodecSecretResolver·GET /dbm/poller/status, DBM IT 42건, 6차 커밋 `5e33e0e`) → **WS-3 1단계 PG 어댑터 S·L·C·Q(실 PG16 end-to-end, 7차 `b576f18`) → **WS-3 2단계 typed 파티션 표 V92(8차 `a0d28d6`, 미푸시) → 10-28 WS-1 대상 관리 API(admission·enc:v2, 110 테스트, 미커밋) + 코덱스 9차 🔴 N1~N9 → A 결정: 9차 `b6f622f` 안정화 · 10차 `b8c528c` WS-1 커밋 → 10-28 master rebase·ff 병합(HEAD `b8c528c`, 미푸시)**; 시간순 이력 [[2026-10-28-db-monitoring-worklog]](`_workspace/.../history_zm172-worklog.md`); 설계 v1.3까지는 Q1~Q31 결정 대기였음; GA 플랜은 Oracle·MSSQL 캐시만·전용 DB 객체 생성 없음·Redis/MongoDB 비범위 유지(Q31), Flyway V90~ 예약).

## 정본 문서 (moveseye-docs)
- [준비 중인 모니터링(화면)](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%A4%80%EB%B9%84-%EC%A4%91%EC%9D%B8-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md)
- [인프라 모니터링 가이드(DB·GPU 준비 중 절)](../../agent-documents/sources/solutions/moveseye-docs/guides/features/solutions--%EC%9D%B8%ED%94%84%EB%9D%BC-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md)

## 설계·기획 (_workspace)
- [devdesign_gpu-monitoring](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--devdesign_gpu-monitoring.md)
- [devdesign_gpu-monitoring-p1](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--devdesign_gpu-monitoring-p1.md)
- [devdesign_gpu-collection-paths](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--devdesign_gpu-collection-paths.md)
- [proposal_gpu-collection-paths_codex](../../agent-documents/sources/solutions/_workspace/_archive/features/premium/gpu-monitoring/solutions--proposal_gpu-collection-paths_codex.md)
- [guide_gpu-nvidia-smi-collection](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--guide_gpu-nvidia-smi-collection.md)
- [deferred_gpu-monitoring](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--deferred_gpu-monitoring.md)
- [devdesign_db-monitoring(v2.3)](../../agent-documents/sources/solutions/_workspace/features/premium/db-monitoring/solutions--devdesign_db-monitoring.md) · [contract_db-monitoring(P0 시험본)](../../agent-documents/sources/solutions/_workspace/features/premium/db-monitoring/solutions--contract_db-monitoring.md) · [env_p0-test-db](../../agent-documents/sources/solutions/_workspace/features/premium/db-monitoring/solutions--env_p0-test-db.md)
- [review_db-monitoring-v1.3_codex(3차 검수 원문)](../../agent-documents/sources/solutions/_workspace/_archive/features/premium/db-monitoring/solutions--review_db-monitoring-v1.3_codex.md)
- [research_datadog-dbm-2026-10-22](../../agent-documents/sources/solutions/_workspace/features/premium/db-monitoring/solutions--research_datadog-dbm-2026-10-22.md)
- [consult_datadog-gap_codex](../../agent-documents/sources/solutions/_workspace/_archive/features/premium/db-monitoring/solutions--consult_datadog-gap_codex.md)
- [proposal_db-monitoring_codex](../../agent-documents/sources/solutions/_workspace/_archive/features/premium/db-monitoring/solutions--proposal_db-monitoring_codex.md)
- [research_db-monitoring-2026-10-19](../../agent-documents/sources/solutions/_workspace/features/premium/db-monitoring/solutions--research_db-monitoring-2026-10-19.md)
- [devdesign_premium-edition](../../agent-documents/sources/solutions/_workspace/features/auth-license/license/solutions--devdesign_premium-edition.md)

## 계약 (_workspace/contract_*)
- [contract_gpu-monitoring](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--contract_gpu-monitoring.md)

## 보고·검수·QA 증거
- [review_gpu-p1](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--review_gpu-p1.md)
- [review_db-monitoring-design](../../agent-documents/sources/solutions/_workspace/features/premium/db-monitoring/solutions--review_db-monitoring-design.md)
- [gpu-p1-source-profile(실측)](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--gpu-p1-source-profile.md)
- [e2e_gpu-monitoring-runtime](../../agent-documents/sources/solutions/_workspace/features/premium/gpu-monitoring/solutions--e2e_gpu-monitoring-runtime.md)

## 경험 노트 (Vault)
[[2026-09-17-gpu-monitoring-design]] · [[2026-10-19-db-monitoring-design]] · [[2026-10-22-datadog-dbm-gap]] · [[2026-08-06-license-kernel-design]] · [[2026-07-22-collector-engine-decision]]

## 열린 항목
- GPU 후속: 클러스터 화면·GPU별 알람 귀속·관리 콘솔 항목·6.0 템플릿·공식 플러그인 단독 실측·Windows nvidia-smi
- GPU 정리 결정 대기: dev74 DB(5434) 보존 여부·시험 서버 잔존물(스크립트·dcgm-exporter·방화벽)·7.0.6 시험 호스트
- DB 모니터링 Q1~Q31 확정(핵심 Q22 maxDbTargets·Q26 PG/MySQL 플랜 프로필·Q27 namespace 상한·Q3/Q29 RAC; Q31 비범위 저장소는 결정 안 해도 됨) → P0 실측 R1~R10(상용 DB 시험 VM 별도). 고객 문구는 설계서 §16.5 10개 규칙대로
- 🔴 시험 서버 10.220.0.13 재부팅·GPU 부하 금지

## 이웃 영역
[[인증-권한-라이선스]] · [[인프라-모니터링]] · [[apm-수집과-운영]]
