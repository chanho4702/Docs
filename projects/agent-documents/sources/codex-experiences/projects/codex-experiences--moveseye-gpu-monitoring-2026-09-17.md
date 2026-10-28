---
tags: [moveseye, gpu, llm, design]
updated: 2026-09-17
---

# GPU 모니터링 설계 재개

사용자 확정: 1차 단순 GPU, 최종 GPU 기대 성능 및 LLM 정상 여부까지 관측. 구현은 아직 하지 않았다.

- 설계: `C:/solutions/_workspace/designs/devdesign_gpu-monitoring.md`
- 재개: `_workspace/planning/deferred_gpu-monitoring.md`, S0에서 장비/OS/Zabbix 플러그인 지원 및 원시 fixture 확인.
- 공동 경험: `C:/Users/DMOVE/claude-experiences/projects/moveseye/2026-09-17-gpu-monitoring-design.md`
- P1 Zabbix NVIDIA, P2 DCGM 성능 지표, P3 engine metrics+APM+합성 추론. Zabbix 자체 한계와 기본 플러그인 제공 범위를 구분한다.
- GPU 활동률 ≠ 정격 성능 ≠ LLM 정상/응답 품질. 각 판정에 별도 증거와 기준선 필요.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moveseye-apm-retention-policy-2026-09-17|moveseye-apm-retention-policy-2026-09-17]]

## 후속 상세 설계

LLM을 보류하고 NVIDIA+Zabbix P1 구현 정본 `_workspace/designs/devdesign_gpu-monitoring-p1.md`와 API 계약 초안 `_workspace/contract_gpu-monitoring.md`를 작성했다. 핵심은 숫자0과 미지원/오류 구분, master 상태 전파, GpuInventoryPort + MetricPort.querySeriesChecked 품질 계약, 고정 snapshot과 새로고침 분리, 시간 경계 trend와 진행 중 gap 분리다. 코드·DB·실제 수집 설정 변경은 없다.
