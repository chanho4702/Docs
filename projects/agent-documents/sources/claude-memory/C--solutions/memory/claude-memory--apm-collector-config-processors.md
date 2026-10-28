---
name: apm-collector-config-processors
description: "APM Collector 설정 yaml 프로세서 상세(attributes/drop·redaction/pii·filter/metrics 기본 포함 스위치+추가 규칙) + 포트·충돌 가이드 — 09-15 커밋 BE 301f901(포트)·2896c40(프로세서) / FE ab45574 #ZM-122, 미푸시"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ff0d0f4-3d9a-4217-ad4d-e7f0de3cf957
  modified: 2026-09-15T01:36:38.130Z
---

2026-09-15 사용자 요청 두 건을 BE+FE로 구현 — BE `301f901`(포트)·`2896c40`(프로세서), FE `ab45574` #ZM-122 커밋(미푸시).

**1) 포트·충돌 가이드** — 안내 `ports`(앱→Collector 4317/4318 인바운드·Collector→MovesEye 아웃바운드 HTTPS·13133 로컬 전용) + 세 OS `collector.ports` 단계(듣는 프로세스 확인 + 방화벽 + 충돌 시 `receivers.otlp.protocols.*.endpoint`/`extensions.health_check.endpoint` 변경·앱 ENDPOINT 동기화) + 확인 단계 `address already in use` 판독. 포트 상수 `ApmInstallVersions.OTLP_GRPC_PORT/OTLP_HTTP_PORT/HEALTH_CHECK_PORT`는 템플릿 yaml과 테스트로 대조.

**2) 프로세서 상세(계약 §8.9)** — `ApmCollectorProcessorOptionsDto{attributesDrop{useDefaults,extra[{key|pattern,action}]}, redactionPii{useDefaults,extra[regex]}, filterMetrics{…}}`를 `POST /apm/collector-config`·`withConfig` 둘 다 받음. 생성기 `applyProcessorOptions`가 템플릿 목록 항목 줄만 갈아 끼움(파서 안 씀·주석 보존). 🔴 기본 제외+추가 없음 = 프로세서 통째 제거(빈 include는 모든 지표 폐기). 기본 마스킹 제외 시 `X-Apm-Warning: masking-reduced`(raw-sql과 쉼표 합성)+WARN 로그+헤더 주석. 기본 규칙은 `config-defaults.processors`로 내려줌(템플릿 파싱, 코드에 중복 없음). FE `ApmProcessorOptionsFields`(Collapse, 두 폼 공용)·`apmBuildProcessorOptions`(전부 기본이면 undefined → 키 미전송).

**How to apply:**
- 옵션 DTO 필드 추가 시 `new ApmCollectorConfigOptionsDto(` 호출처가 main 2·test 20+ (FQN 호출 포함) — 정식 생성자만 쓰는 규칙(P4 D1)이라 전부 손봐야 컴파일된다.
- 🔴 python 편집 스크립트의 멱등 검사는 "new가 old를 접두로 포함"하는 앵커에서 깨져 블록이 두 번 들어간다(types/apm.ts에서 실제 발생) — 앵커는 new 텍스트에 다시 등장하지 않는 것으로 잡을 것.
- BE 테스트는 bootRun 중이라 격리 워크트리에서: 생성기 29·MVC 13·가이드 143 등 통과. FE 5스위트 153 통과. 런타임 캡처는 구 BE(:3000)라 기본 규칙 목록 없음 상태만 확인 — **BE 재기동 후 재확인 필요**.
- 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-install-guide-readability|apm-install-guide-readability]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-install-macos|apm-install-macos]].
