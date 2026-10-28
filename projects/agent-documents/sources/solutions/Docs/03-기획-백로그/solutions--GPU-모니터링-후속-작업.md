# GPU 모니터링 후속 작업

- 2026-09-17 사용자 요청으로 설계 초안 작성, 구현 미착수.
- P1 구현 정본: [NVIDIA GPU 상세 설계](../02-%EC%84%A4%EA%B3%84/solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md), [API 계약 초안](../06-API-%EA%B3%84%EC%95%BD/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md)
- 장기 방향: [GPU 모니터링 설계](../02-%EC%84%A4%EA%B3%84/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%84%A4%EA%B3%84-%EC%B4%88%EC%95%88.md). LLM은 사용자 요청으로 보류.
- 사용자 확정: 1차 단순 GPU, 최종 GPU 기대 성능과 LLM 정상 여부까지 연결. 하드웨어·성능·서비스·응답 품질 판정은 분리.
- 기본 가정: NVIDIA 물리 GPU·Zabbix 경로부터, DCGM 정밀 지표→LLM engine/APM/synthetic 확장. 제조사·장비·LLM engine은 미확정.
- 목표: GPU 인벤토리·활동률·VRAM·온도·전력·지원 오류 지표, 목록/상세·호스트/이벤트 연계.
- 재개: 상세 설계 S0에서 실제 모델·OS·드라이버·Zabbix/Agent/plugin 조합과 원시 지표 확인. 이후 상태 포함 batch snapshot 포트·MetricPort 시계열·역할 권한·API 4개·목록/상세 구현.
- 주의: index를 영구 키로 쓰지 않음, VRAM 점유와 메모리 활동 분리, 미지원은 0이 아님, 고사용률을 기본 장애로 판단하지 않음.
- 이슈 등록·코드/DB/템플릿 변경·배포는 수행하지 않음.

## 2026-09-30 수집 경로 재설계

- 사용자 요구: NVIDIA만 고려, **Zabbix 에이전트 수집**과 **에이전트 없이 API 수집** 둘 다 설계.
- 정본: [수집 경로 설계](../02-%EC%84%A4%EA%B3%84/solutions--NVIDIA-GPU-%EC%88%98%EC%A7%91-%EA%B2%BD%EB%A1%9C-%EC%84%A4%EA%B3%84.md) · 코덱스 독립 제안: [proposal](../02-%EC%84%A4%EA%B3%84/solutions--NVIDIA-GPU-%EC%88%98%EC%A7%91-%EA%B2%BD%EB%A1%9C-%EC%84%A4%EA%B3%84-%EC%A0%9C%EC%95%88-%28Codex%29.md)
- 확인된 사실: dev Zabbix는 7.0.6, 공식 NVIDIA 플러그인·템플릿은 7.2.1부터 공식 제공 → 09-17의 "공식 템플릿 단일 전제"는 dev와 7.0 LTS 고객에서 성립하지 않는다.
- 방향: 저장소가 Zabbix인 경로 3종(DCGM+HTTP agent · nvidia-smi · 공식 플러그인 읽기)을 1차로, Redfish·SSH·Prometheus는 2차, MovesEye 직접 수집은 LLM 단계와 함께.
- 09-17 P1 설계에서 고칠 곳은 수집 경로 설계 §9(예: `querySeriesChecked` 신설 → ZM-159 `querySeriesResult` 재사용).
- 사용자 결정 대기: 실장비 유무, 1차 경로 구성 확정, Kubernetes 대상 여부, 자체 템플릿 배포 동의.
