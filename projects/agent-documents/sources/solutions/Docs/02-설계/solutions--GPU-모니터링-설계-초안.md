# GPU 모니터링 설계 초안

작성: Codex · 2026-09-17 · 상태: **설계 논의용 / 구현 미착수**

**P1 상세 정본:** [NVIDIA GPU 모니터링 P1 상세 설계](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) · [API 계약 초안](../06-API-%EA%B3%84%EC%95%BD/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md). 사용자 요청으로 단순 NVIDIA+Zabbix부터 구체화했으며 LLM은 후속으로 보류했다. P1 구현 선택은 상세 정본이 우선하고 이 문서는 장기 방향을 보존한다.

> **2026-09-30 갱신 안내:** §4 수집 경로 결정안은 [수집 경로 설계](solutions--NVIDIA-GPU-%EC%88%98%EC%A7%91-%EA%B2%BD%EB%A1%9C-%EC%84%A4%EA%B3%84.md)가 대체한다. DCGM Exporter를 Zabbix HTTP agent로 읽는 경로가 P2 후보에서 1차로 올라갔다.

사용자 요청: GPU 모니터링도 설계한다. **추가로 확정한 방향: 1차는 단순 GPU 모니터링, 최종 목표는 GPU가 기대 성능을 내고 LLM 서비스가 정상인지까지 확인하는 것.** 제조사·운영체제·GPU 모델·규모·Kubernetes 및 LLM serving engine은 아직 미확정이다. NVIDIA 서버의 물리 GPU를 1차 대상으로 가정한다. 코드·DB·템플릿·런타임을 변경하지 않는다.

## 1. 제품이 답할 질문

1. 어느 서버에 GPU가 몇 개 있고, 어떤 모델·용량인가?
2. GPU가 과열되거나 메모리가 부족하고, 오류·성능 제한이 발생하는가?
3. 현재 바쁜 GPU와 사용량이 낮은 GPU는 무엇인가?
4. 장애 시간에 GPU·CPU·메모리·네트워크 상태가 함께 어떻게 변했는가?
5. 확장 단계에서 어떤 Pod/작업이 GPU를 할당받았고 실제로 사용하고 있는가?

GPU 사용률 100%는 정상적인 학습 작업일 수 있다. 높은 사용률을 곧바로 장애로 표시하지 않는다. 하드웨어 가시성과 AI 모델 성능은 다른 영역이며, tokens/s·추론 지연·학습 진행률은 별도 애플리케이션 계측 없이는 알 수 없다.

## 2. 현재 프로젝트 상태

| 항목 | 확인 결과 |
|---|---|
| FE | `/gpu-monitoring/` 경로와 `GpuMonitoring.tsx`는 존재하나 준비 중 화면 |
| 라이선스 | `GPU_MONITORING` Feature 및 FE 게이트 존재 |
| 공용 엔진 | `MetricPort`의 최신값·시계열·트렌드·계열 배치·차원 목록 활용 가능 |
| GPU 도메인 | `MetricDomain`에 GPU 없음, Zabbix 카탈로그 GPU 매핑 미구현 |
| 숫자 상태 | `LatestValue.value`는 primitive double, 미지원 상태를 직접 표현하지 못함 |
| 과거 메모 | premium 설계 §5.9는 `{gpu:"0"}` 차원 확장 제안. 본안은 UUID 식별·지원 상태·MIG 경계를 보강 |
| Prometheus | 경험 기록상 엔진 Phase 1 스텝 6 보류. 이번 설계만으로 재개하지 않음 |

GPU 장비·Zabbix 운영 버전·Agent 플러그인·실제 아이템은 아직 조회/실측하지 않았다. 템플릿 설치 가능 여부를 확인하기 전 “바로 수집 가능”으로 판정하지 않는다. 기존 문서의 모델 변경 0·작업 규모 소~중은 검증된 견적이 아니다.

## 3. 단계별 범위

| 단계 | 포함 | 제외 또는 다음 단계 |
|---|---|---|
| P1 기본 | NVIDIA 물리 GPU 발견, 사용률/VRAM/온도/전력/지원 오류 지표, 최신·과거 차트, 호스트·기존 이벤트 연결 | 프로세스별 원인 분석, MIG 개별 사용률, Pod 귀속, 과금 |
| P2 정밀 | DCGM 기반 지원 지표, MIG 인벤토리/계층/활동 지표, Kubernetes Pod/컨테이너 할당 연결 | 학습/추론 애플리케이션 성능을 GPU 지표로 추정하지 않음 |
| P3 LLM 서비스 | serving engine 지표·요청 trace·합성 추론, 모델별 성능 기준선과 GPU 연계 | 응답 품질은 별도 평가셋과 지표로 분리 |
| P4 선택 확장 | AMD 등 다른 제조사 어댑터, 작업/팀별 사용 추이 | 자동 GPU 제어는 별도 제품 결정 |

P1에서도 MIG 활성 또는 vGPU 환경을 감지 가능한 범위에서 표시하고, 지원을 확인하지 않은 지표를 0으로 보여 주지 않는다. MIG 여부를 알 수 없으면 UNKNOWN을 반환한다. Windows/소비자 GPU/가상 GPU는 실제 조합 검증 전 지원 목록에 포함하지 않는다.

## 4. 수집 경로 결정안

### P1: 기존 Zabbix를 저장·알람 정본으로 활용

흐름: `NVIDIA GPU → NVML / Zabbix Agent 2 NVIDIA plugin → Zabbix history/trends → engine-zabbix → MetricPort → premium/gpu API → GPU 화면`.

Zabbix는 공식 NVIDIA 플러그인/템플릿을 제공한다. 서버·Agent·플러그인·템플릿·NVML·GPU 모델의 실제 호환 조합을 확인하고 버전을 고정한다. 최신 웹 페이지의 요구 버전을 현재 운영 환경에 그대로 적용하지 않는다. [Zabbix 공식 통합 문서](https://www.zabbix.com/integrations/nvidia)

- app에서 Zabbix 구현을 직접 import하지 않는다. `engine-api` 계약으로 읽고 `engine-zabbix`가 원시 키를 해석한다.
- GPU별 원격 SSH/nvidia-smi 실행을 화면 조회 경로에 넣지 않는다.
- 서버 GPU 수만큼 독립 API 호출하지 않고 계열/호스트 배치로 읽는다. 페이지 크기·기간·시계열 수 상한을 둔다.
- 숫자 history를 MovesEye PostgreSQL에 재적재하지 않는다. PG에는 필요 시 장비 식별/설정/사용자 메모 등 소량 메타만 둔다.
- 공식 플러그인이 지원되지 않는 조합은 설치 가이드에서 UNSUPPORTED로 표시한다. 임시 스크립트 fallback을 조용히 자동 적용하지 않는다.

### P2 후보: DCGM Exporter + 시계열 저장소

DCGM Exporter는 `/metrics`를 노출하는 수집 구성요소이며 과거 시계열 저장소 자체가 아니다. Kubernetes/MIG가 우선 요구라면 `DCGM Exporter → Prometheus 또는 호환 저장소 → 중립 엔진 어댑터`를 먼저 설계한다. Prometheus 어댑터·데이터소스 식별/권한·인벤토리·알람 연계 작업을 P2 전제에 포함한다. [NVIDIA DCGM Exporter](https://docs.nvidia.com/datacenter/dcgm/latest/gpu-telemetry/dcgm-exporter.html)

대안인 Zabbix HTTP 수집으로 exporter 지표를 저장하는 안은 대상 수·태그·MIG 발견/키 매핑이 검증될 때만 채택한다. 두 경로를 동시에 기본 활성화하지 않는다. exporter를 매 화면 요청마다 직접 scrape하는 구조는 사용하지 않는다.

### Zabbix로 어디까지 가능한가

구분할 것은 **센서/계측 원천**과 **수집·저장 도구**다. Zabbix는 GPU나 LLM 내부 수치를 스스로 생성하지 않는다. 공식 플러그인은 NVML을 읽으며, 추가 exporter/API가 공개한 값은 별도 수집 구성으로 가져올 수 있다.

| 필요한 정보 | 공식 NVIDIA 템플릿 기준 | 확장 시 원천/방법 |
|---|---|---|
| 장비 발견·UUID, 드라이버, 사용률·VRAM, 온도·전력 | 기본 후보 | 호환 Agent 2 NVIDIA plugin + template |
| clock·P-state·PCIe 송수신, 지원 ECC·에너지·팬 | 템플릿에 항목 존재, 장비별 지원 확인 | 같은 경로의 선택 지표 |
| throttling 원인, Xid, NVLink, MIG 상세 | 공식 기본 제공으로 약속하지 않음 | DCGM/NVML 또는 드라이버 이벤트 수집 |
| SM/Tensor/DRAM 활동 및 GPU간 통신 병목 | 기본 템플릿만으로 충분하지 않음 | DCGM profiling/exporter |
| LLM 대기열·KV cache·토큰 처리·첫 토큰 지연 | GPU 플러그인만으로 불가 | vLLM 등 serving engine `/metrics` 또는 자체 계측 |
| 사용자 체감 스트리밍 지연·오류·연결 중단 | GPU 플러그인만으로 불가 | gateway/client 계측 + OpenTelemetry/APM |
| 실제 질문에 정상 응답·품질 | GPU 지표로 판단 불가 | 합성 추론 + 별도 평가셋 |

clock의 Zabbix 저장 단위는 템플릿 전처리 후 Hz일 수 있으므로 API MHz 변환을 중복하지 않는다. 전력·PCIe도 원천 단위와 저장 단위를 대조한다. GPU fan 항목은 실제 회전 검출과 동일하다고 가정하지 않는다. 공식 템플릿 범위 근거: [Zabbix NVIDIA](https://www.zabbix.com/integrations/nvidia).

Zabbix 유지 대안은 HTTP agent로 exporter의 Prometheus 형식 텍스트를 주기적으로 읽고 전처리/dependent item/LLD를 구성하는 것이다. 이는 **별도 통합 개발**이며 기존 NVIDIA 템플릿에 자동 추가되는 기능이 아니다. histogram bucket·counter reset·고카디널리티 라벨·payload 크기를 검증해야 한다. LLM percentile을 단순 gauge 하나로 복사하지 않는다. 공식 경로: [Prometheus 데이터 수집](https://www.zabbix.com/documentation/current/en/manual/config/items/itemtypes/http/prometheus).

Zabbix 없이 시작한다면 `GPU → DCGM Exporter → Prometheus 호환 저장소 → MovesEye 어댑터`를 우선 후보로 한다. DCGM 비지원 조합은 호스트 상주 NVML exporter를 별도 검증한다. nvidia-smi 주기 실행은 제한된 fallback/설치 진단 용도로만 검토한다. 어떤 경로든 지원 지표·단위·수집 주기·인증·보존·장애 상태 계약은 동일해야 한다.

**현재 권고**: P1은 기존 Zabbix 경로를 활용하되 canonical GPU 모델과 source provenance를 남긴다. P2에서 DCGM 필요 지표를 실측한 뒤 Zabbix 추가 수집과 Prometheus 어댑터의 비용/운영 부담을 비교한다. “LLM 목표이므로 지금 바로 모든 저장소를 교체”하지 않는다.

## 5. 지표 카탈로그와 의미

아래 canonical 명칭은 제안이며 API 계약에서 확정한다. 기본 30초 수집을 초안으로 두되 실제 템플릿 설정과 장비 부하 측정으로 정한다.

| 지표 | 정규 단위/형태 | 범위·주의 |
|---|---|---|
| `gpu.utilization` | % gauge | GPU 활동 시간 지표, 실제 연산 효율/처리량이 아님 |
| `gpu.vram.used`, `gpu.vram.total`, `gpu.vram.free` | bytes gauge | 같은 메모리 범위의 값으로 계산 |
| `gpu.vram.usedPct` | % derived | used/total×100; total≤0/미지원/시각 불일치면 null |
| `gpu.memory.activity` | % gauge | 메모리 읽기·쓰기 활동, VRAM 점유율과 구분 |
| `gpu.temperature` | °C gauge | 모델별 지원·제한 온도 확인 |
| `gpu.power.draw`, `gpu.power.limit` | W gauge | 보드/장치 범위 일치 여부 확인 |
| `gpu.clock.sm`, `gpu.clock.memory` | MHz gauge | 지원 시 제공, 낮은 clock만으로 throttling 확정 금지 |
| `gpu.throttle.reasons` | 상태 집합 | 지원하는 원인만 표시, 의도적 전력 제한과 고장 구분 |
| `gpu.ecc.corrected`, `gpu.ecc.uncorrected` | counter | volatile/aggregate 구분, reset 보정 후 증가량 사용 |
| `gpu.xid.last` | 오류 코드/관측 시각 | 지원 경로에서만; 코드 숫자를 오류 횟수로 사용하지 않음 |
| `gpu.performance.state`, PCIe traffic | 상태/bytes/s | P1 선택 지표; P-state만으로 고장 판정 금지 |
| NVLink traffic, SM/Tensor/DRAM activity | 확장 지표 | 장비/드라이버/권한·측정 모드별 P2 검증 |

예시 매핑은 공식 템플릿의 `nvml.device.utilization.gpu[UUID]`와 `nvml.device.memory.fb.used[UUID]` 등에서 시작하되 **실제 item key·unit·전처리·unsupported 값을 수집한 매핑표**를 착수 산출물로 만든다. memory activity와 usedPct를 같은 카드에 연결하지 않는다.

모델/드라이버에 따라 값이 없거나 오류가 반환될 수 있다. DCGM/NVML의 미지원·sentinel·NaN/Inf를 정상 숫자로 변환하지 않는다. GPU/MIG별 지원 차이는 런타임 출력으로 확인한다. [NVIDIA metric reference](https://docs.nvidia.com/datacenter/dcgm/latest/reference/dcgm-exporter-metrics.html)

## 6. 식별·상태·집계 규칙

### 식별

- P1 논리 식별: `(sourceId, hostId, gpuUuid)`. ordinal index 0/1은 표시·원시 매핑용이며 영구 식별자가 아니다.
- UUID가 없으면 host+PCI bus ID 등의 fallback과 `identityQuality=FALLBACK`을 명시한다. 재부팅·교체 이후 동일 장비라고 자동 단정하지 않는다.
- P2 MIG는 parent GPU UUID + MIG 식별자 + 발견 세대를 관리한다. GI/CI 숫자는 재생성 때 재사용될 수 있어 단독 식별자로 쓰지 않는다.
- 같은 물리 장비가 여러 데이터소스에 있으면 source 범위별로 보이고 중복 후보만 표시한다. 자동 합산/병합하지 않는다.
- GPU 사라짐은 “목록 응답에서 빠졌다” 한 번으로 확정하지 않는다. 성공한 재발견 결과와 수집 오류를 구분한다.

### 값과 상태

API 값 모델 초안: `{value: number|null, unit, observedAt, status, reason}`. 상태는 `OK`, `STALE`, `UNSUPPORTED`, `NO_DATA`, `ERROR`. 장비 연결 상태·하드웨어 건강 상태와 값 상태는 분리한다.

기존 `LatestValue`가 미지원 사유를 담지 못하므로 GPU capability/availability 계약 또는 공용 값 상태 확장 중 실제 adapter 증거를 전달할 방법을 S0에서 결정한다. 원시 숫자 0 또는 아이템 누락만으로 지원 여부를 추론하지 않는다. 기존 소비자 회귀를 막는 추가 계약을 우선 검토한다.

freshness는 실제 item 수집 주기·전처리 heartbeat에 기반한다. 초안은 expected heartbeat의 3배를 넘으면 STALE이나 변경값만 저장하는 아이템을 매 30초 기록한다고 가정하지 않는다. 차트의 긴 결측 구간은 연결하지 않는다.

하드웨어 건강은 S0의 모델별 필수 관측표에 따라 판정한다. 필수 온도·메모리·수집 건강 및 해당 모델에서 지원되는 오류 지표 중 하나라도 결측/오류이면 UNKNOWN 또는 판정 제한으로 표시한다. 관측 가능한 범위에서 경보가 없다는 사실과 완전한 하드웨어 건강을 구분하며, 미지원 지표와 관측 충족률을 함께 제공한다.

### 목록 집계

- 물리 GPU와 MIG 자식을 동시에 더하지 않는다. P1 집계는 물리 GPU만, P2는 선택한 계층만 집계한다.
- 평균 GPU 활동률은 유효한 물리 GPU의 산술평균과 관측 수를 함께 보여 주며 이종 모델의 연산 용량 가중 평균이라고 표현하지 않는다.
- VRAM 합산 비율은 같은 범위의 fresh used/total 쌍을 가진 GPU 집합에서 `Σused/Σtotal`로 계산한다. 값 없는 GPU를 분모에만 포함하지 않는다.
- 전력 합산은 중복되지 않은 물리 보드 범위에서만 한다. 일부 관측이면 “관측된 N개 합계”로 표시한다.
- idle 후보는 “관측 구간 내 활동률이 낮음”이다. 할당·예약·업무 일정 정보 없이 낭비 비용으로 환산하지 않는다.

## 7. 화면 구성

### GPU 전체 목록

- 상단: 발견된 물리 GPU 수, fresh 관측 수, 하드웨어 경고 수, 관측된 전력 합계.
- 필터: 데이터소스, 호스트 그룹, 호스트, 모델, 데이터 상태, 건강 상태.
- 행: 호스트 / GPU 이름·UUID 축약 / 활동률 / VRAM used·total / 온도 / 전력 / 경고 / 마지막 수집.
- 기본 정렬은 조치가 필요한 하드웨어 이벤트와 수집 문제를 우선하며, 활동률 정렬은 사용자가 선택한다.
- `GPU 없음`, `템플릿 미설정`, `플러그인 미지원`, `권한 없음`, `소스 연결 실패`를 구분한다. 판정 증거가 부족하면 확인 필요로 안내한다.

### GPU 상세

- 장비 정보: 모델, UUID, PCI bus, 드라이버, VRAM, 호스트, 지원 지표.
- 동일 시간축 차트: 활동률, VRAM, 온도, 전력, 선택적으로 clock/오류 증가량.
- 기존 이벤트 타임라인과 호스트 상세로 연결하고 조회 시간 범위를 유지한다.
- 수집 진단 탭: 아이템/플러그인 상태·마지막 수신·미지원 사유를 권한에 맞게 제공.
- P2에서 MIG 트리, Pod/컨테이너 할당 탭 추가. 프로세스/PID 수집은 별도 opt-in이며 커맨드라인을 기본 저장하지 않는다.

현재 FE `FeatureGate`를 유지한다. BE는 `GPU_MONITORING` 권한 확인과 기존 소스/호스트 접근 권한을 모두 적용한다. 캐시는 사용자별 또는 허용 범위별로 분리한다. GPU 옵션 보유가 모든 호스트 접근을 허용하지 않는다.

## 8. 이벤트 정책

P1의 평가 정본은 Zabbix trigger이며 MovesEye는 기존 AlertPort/이벤트 경로로 읽는다. 동일 GPU 경보를 BE에서 별도로 재평가하여 중복 이벤트를 만들지 않는다.

| 상황 | 권고 |
|---|---|
| 고온 지속 | 모델/운영 기준 임계치 + 지속 시간 + recovery hysteresis |
| VRAM 부족 위험 | usedPct 지속 조건; OOM 확정은 별도 증거 필요 |
| ECC uncorrected 증가 | 지원되는 counter의 reset 보정 증가량으로 경고 |
| Xid | 코드별 의미/반복 여부를 보고 등급 결정, 모든 코드를 동일 장애로 분류하지 않음 |
| 수집 중단 | 소스/호스트 장애의 하위 증상은 종속 처리해 경보 폭주 방지 |
| 사용률 높음 | 기본 하드웨어 장애 판정에서 제외, 용량 경고는 별도 opt-in |
| 사용률 낮음 | 최적화 참고 지표, 기본 장애 알림 없음 |

공식 템플릿에 활동률 경보가 이미 있을 수 있으므로 실제 trigger 목록과 제품 정책을 대조한다. 기존 경보를 화면에서 숨겨 해결하지 않는다. 템플릿/trigger 변경 필요를 설치 단계에서 명시하고, 기존 고객 설정을 자동 덮어쓰지 않는다.

## 9. 저장·보존·조회 부하

P1 history/trend 보존은 Zabbix 유효 설정이 정본이다. APM의 7/30/400일을 GPU에 그대로 복사하지 않는다. UI에 실제로 접근 가능한 원시·집계 기간을 보여 주고 보존 밖 요청은 명확히 표시한다. 장기 상세가 필요하면 기존 자빅스 아카이빙 설계와 연결한다.

30초 간격·GPU당 숫자 12종 가정 시 `12×86400/30=34,560 samples/GPU/day`. 100개는 약 346만 samples/day다. 이는 논리 샘플 수 추정이며 PostgreSQL 행 수/용량 실측이 아니다. 실제 Zabbix 전처리·아이템별 주기·압축·인덱스·트렌드가 용량을 바꾼다.

- UI 갱신은 수집보다 빠르게 하지 않는 것을 기본으로 하고 비활성 탭 polling을 중단한다.
- 최신값은 짧은 TTL 캐시 및 동일 요청 합치기, 발견 정보는 더 긴 TTL을 사용한다. 수치는 실제 수집/heartbeat에 맞춘다.
- 목록 페이지와 상세 차트를 배치 조회하고 N+1 호출을 금지한다. 원시 장기 조회 대신 소스 trend를 사용하되 avg만 보고 순간 과열을 놓치지 않도록 min/max를 함께 제공한다.
- 다중 노드에서 조회 캐시/동시 요청 제한의 적용 범위를 명시한다. 장애 소스에 무제한 재시도하지 않는다.
- PID·Pod UID·작업 ID는 P1 메트릭 태그에 추가하지 않는다. P2 관계 이력은 별도 보존/카디널리티 예산으로 관리한다.

## 10. Kubernetes·MIG 확장 시 추가 조건

DCGM Exporter는 P2 수집 후보이며 설치만으로 Pod별 정확한 GPU 사용량을 보장하지 않는다. kubelet PodResources/device plugin 및 exporter의 매핑 조건을 검증한다. Pod 이름 대신 cluster/node/Pod UID/container 및 시간 구간으로 할당 이력을 관리한다. [NVIDIA exporter 프로젝트](https://github.com/NVIDIA/dcgm-exporter)

공유 GPU/time-slicing에서는 장치 전체 값이 여러 Pod 라벨에 반복될 수 있다. 이를 합산하거나 각 Pod의 전용 사용률로 표현하지 않는다. **할당량과 실제 활동량을 분리**하고 귀속 불가 상태를 허용한다.

NVML/nvidia-smi는 MIG 장치의 일부 utilization을 지원하지 않는다. DCGM의 MIG 지원 지표와 GPU 모델 조합을 검증한 후 계층별 카탈로그를 확정한다. 물리 GPU의 값을 MIG별 값처럼 복제하지 않는다. [NVIDIA MIG 가이드](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/getting-started-with-mig.html)

APM 연결은 동일 호스트 이름만으로 확정하지 않는다. source/host·cluster/node/Pod UID·시간 범위와 명시적 서비스 매핑을 사용하고, 연결 근거를 표시한다. 과거 trace가 보존 만료이면 GPU 그래프만 남았음을 알린다.

## 11. 구현 순서와 검증

| 단계 | 산출물/완료 기준 |
|---|---|
| S0 대상 확인 | GPU 모델·OS·드라이버·Zabbix/Agent/plugin 버전·규모·MIG 여부, 원시 fixture와 지원표, 지표 상태 전달 계약 결정 |
| S1 엔진 계약 | GPU 도메인·UUID 차원·카탈로그 매핑·지원/누락 상태, batch 조회·기존 라이선스 데코레이터 회귀 검증 |
| S2 BE | `premium/gpu/` 기능, 목록/상세/시계열/진단 API, 소스·호스트 권한, 캐시/시간창 상한, 계약서 |
| S3 FE | 준비 중 화면 교체, 목록·상세·상태/결측·이벤트·호스트 동선 |
| S4 실장비 QA | 다중 GPU, index 변경, idle/busy, 미지원, 수집 중단, 장비 재발견, 권한/라이선스, 부하 시험 |
| S5 P2 착수 판단 | GPU 성능/DCGM·Kubernetes/MIG 필요와 Prometheus 경로 결정; 대표 workload·비교 지표·기준선·허용 편차 확보가 성능 판정 완료 조건. 기준선 없으면 수집만 완료, 성능 판정 불가 |
| S6 P3 별도 설계 | LLM engine·모델 배포 정보·서비스/GPU 매핑·SLI/SLO·합성 추론 예산 확정 |

필수 테스트: memory activity와 VRAM 점유 분리; 미지원이 0으로 표시되지 않음; UUID와 index 변경; double 센티널 차단; counter reset; 일부 관측의 집계 분모; 소스 중복/부모·자식 중복 방지; no-data를 정상으로 판정하지 않음; 배치 호출 수가 GPU 수에 선형 증가하지 않음; 권한 다른 사용자 사이 캐시 유출 없음.

실제 GPU가 없으면 fixture 기반 계약 검증까지만 완료했다고 기록한다. 가짜 데이터로 차트가 그려지는 것을 실장비 지원 검증으로 간주하지 않는다. 고온/오류 유발 부하를 운영 GPU에 자동 실행하지 않는다.

API 경로와 응답은 구현 시 `_workspace/contract_gpu-monitoring.md`로 확정한다. 예비 기능은 목록·장비 상세·시계열·수집 지원 상태다. 기존 HTTP/body 오류 형식·payload 언랩·라이선스 상태 계약을 재사용한다. 마이그레이션 번호는 지금 선점하지 않는다.

## 12. 다음 논의와 재개 지시

단순 GPU부터 시작한다는 순서는 사용자 확정이다. 다음에 확정할 것은 ① 실제 GPU/OS/버전 ② 대상 대수 ③ 기본 지표·오류 지표 중 필수 범위 ④ 원시/집계 조회 기간 ⑤ 향후 LLM engine(vLLM 등)과 배포 방식이다. 기본안은 NVIDIA 물리 GPU + 기존 Zabbix 경로다.

> “GPU 모니터링 설계를 이어서 진행한다. `_workspace/designs/devdesign_gpu-monitoring.md`의 S0부터 최신 COLLAB·영역 규약을 읽고 대상 장비와 Zabbix 지원 조합을 확인한다. GPU 모니터링은 현재 메뉴만 있고 미구현이다. enum과 카탈로그 추가만으로 완료라고 판단하지 말고 UUID·지원 상태·메모리 지표 의미·권한·알람 정본·저장 부하를 함께 검증한다.”

## 13. 최종 목표: GPU 성능과 LLM 정상 여부 연결

### 정상 판정은 네 층으로 분리

| 층 | 판정에 필요한 관측 | 표시 원칙 |
|---|---|---|
| 하드웨어 | 온도·오류·메모리·전력·clock·수집 건강 | P1은 “관측된 하드웨어 이상 없음”; 정격 성능 보장 아님 |
| 성능 | DCGM 활동/대역폭, 동일 조건 기준선 대비 처리량·지연 | P2는 성능 저하 의심과 근거, GPU 단독 원인 확정 금지 |
| 서비스 | 실제 요청 성공률·지연·토큰 출력·대기열·합성 추론 | P3에서 모델별 SLO와 사용자 관측을 결합 |
| 응답 품질 | 고정 평가셋·구조 검증·업무별 정답/근거 평가 | 속도·HTTP 200과 별개; 미계측이면 평가 안 됨 |

최종 제품은 “이 서비스가 느려졌고, 해당 replica의 GPU에 어떤 증거가 동시에 있었는가”까지 제공한다. 인과를 검증하지 않은 상관관계를 “GPU 고장으로 LLM 품질 저하”라고 표현하지 않는다.

### P2에서 더 수집할 것

- SM activity/occupancy, Tensor pipe activity, DRAM activity, PCIe/NVLink throughput, clock·전력·열 제한 사유.
- GPU 사용률이 높아도 실제 유효 연산량은 낮을 수 있다. DRAM/Tensor 중 하나가 낮다고 비정상으로 판단하지 않는다. LLM prefill/decode, batch·정밀도·모델 구조에 따라 양상이 다르다.
- DCGM field 이름은 버전별로 달라질 수 있으므로 실제 exporter HELP/TYPE·field ID·unit으로 카탈로그 버전을 고정한다. 지원 metric group과 Nsight 등 profiler 충돌도 확인한다.
- 수동 모니터링과 적극적인 성능 검증을 구분한다. “기대 성능” 기준은 동일 장비·드라이버·전력 설정·MIG 구성·대표 workload의 측정값이며 제조사 peak TFLOPS와 직접 비교하지 않는다. 부하 발생 진단/benchmark는 별도 승인된 유지보수 환경에서만 수행한다.

근거: [DCGM profiling](https://docs.nvidia.com/datacenter/dcgm/latest/learn/modules/profiling/), [DCGM field 식별자](https://docs.nvidia.com/datacenter/dcgm/3.0/dcgm-api/dcgm-api-field-ids.html).

### P3 LLM 수집 계약 초안

| 정보 | 원천 | 용도 |
|---|---|---|
| running/waiting 요청, queue time | serving engine | 유입 증가·스케줄링 적체 |
| KV cache 점유, preemption, engine/OOM 오류 | engine metrics·선별 로그 | 메모리 압력과 재처리 |
| 입력/출력 token 수, 성공 요청 수 | engine/client | 처리량과 workload 차이 구분 |
| TTFT, ITL/TPOT, 전체 응답 지연 | engine + client/gateway | 첫 응답 대기·스트리밍 속도·체감 지연 |
| 모델명/버전·정밀도·양자화·TP/PP·replica | 배포 메타데이터 | 비교 조건과 GPU 집합 매핑 |
| 외부 요청·RAG/도구 호출 시간 | OpenTelemetry/APM | GPU 밖 지연 구간 구분 |
| 합성 추론 성공·첫 token·완료·응답 검증 | 제한된 synthetic client | 프로세스 생존을 넘어 실제 생성 경로 확인 |

vLLM의 `/metrics`에는 TTFT·ITL·대기 요청 등의 메트릭이 있다. 정확한 명칭과 유무는 설치 버전을 고정해 검증한다. ITL은 stream 출력 event 간격일 수 있고 TPOT는 요청 평균일 수 있으므로 같은 지표로 합치지 않는다. 전체 출력 tokens/s와 요청별 tokens/s도 구분한다. [vLLM production metrics](https://docs.vllm.ai/en/latest/usage/metrics/), [vLLM metrics semantics](https://docs.vllm.ai/en/latest/design/metrics/).

collector 원천: `DCGM/GPU + engine /metrics + OTel traces + synthetic 결과`. 숫자 지표는 시계열 저장소, 요청별 상세는 APM trace 정책, 모델/replica/GPU 할당 이력은 별도 메타데이터로 관리한다. 동일 지표를 Zabbix와 Prometheus가 함께 제공하면 하나를 정본으로 지정하고 출처를 표시한다.

TTFT/ITL/end-to-end p95는 동일 의미·bucket·시간 범위의 histogram을 합친 뒤 계산한다. replica별 p95를 평균하지 않는다. 무트래픽은 정상 성능의 증거가 아니므로 표본 부족으로 표시한다. 합성 요청은 실제 사용자 트래픽과 구분하고 동시성·입출력 token·주기·일일 예산을 제한한다. warm/cold 모델 상태를 함께 기록하며 프롬프트·응답 원문은 기본 저장하지 않는다.

### 성능 기준선과 상관 분석

비교 키는 GPU 모델/개수/MIG, 모델·revision, engine/driver, 정밀도/양자화, TP/PP, 입력·출력 길이 구간, 동시성, prefix cache 상태다. 모델/설정이 바뀌면 별도 기준선을 만든다. 대표 부하 시험과 정상 운영 구간의 표본을 구분하고 목표/SLO를 설치별로 정한다.

| 관측 예 | 가능한 해석 | 다음 확인 |
|---|---|---|
| TTFT 증가 + waiting 증가 | 요청 증가 또는 prefill/스케줄러 지연 | 입력 길이·동시성·prefill 시간 |
| 출력 속도 저하 + clock 저하 + 열 제한 | 열에 의한 성능 제한 의심 | 같은 workload·온도/제한 원인·전후 비교 |
| GPU 활동 낮음 + 응답 느림 | CPU/RAG/네트워크/스케줄러 등 GPU 외부 병목 가능 | APM 구간·CPU·I/O·queue |
| KV cache 압력 + preemption 증가 | 메모리/동시성 설정 병목 가능 | context 길이·batch·메모리 설정 |
| GPU 지표 정상 + synthetic 생성 실패 | 서비스/모델 준비·인증·라우팅 등 확인 필요 | 실패 구간·engine 상태·서버 로그 |

화면은 `LLM 서비스 → replica → 시간대별 GPU 집합 → 호스트`로 이동한다. 단일 요청에 여러 GPU가 관여할 수 있으므로 한 GPU로 강제 귀속하지 않는다. 초기 P1에서도 UUID·source·host·관측시각·단위·지원 상태를 정확히 남겨 이 연결의 기반으로 쓴다.

## 근거 및 연결

- [premium 에디션 설계](solutions--%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-%EC%97%90%EB%94%94%EC%85%98%28STANDARD-PREMIUM%29-%EC%84%A4%EA%B3%84%EC%84%9C-v4.md) §5.9 — 기존 GPU 도입 메모.
- [APM 보존 정책](solutions--APM-%EB%B3%B4%EC%A1%B4-%EC%84%A0%EB%B3%84-%EC%88%98%EC%A7%91-%EC%9E%A5%EA%B8%B0-%EC%83%81%EC%84%B8-%EC%A1%B0%ED%9A%8C-%EC%84%A4%EA%B3%84.md) — 상세 trace 연계 시 실제 보존 여부 확인.
- [자빅스 아카이빙 설계](solutions--%EC%84%A4%EA%B3%84-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B9%99-%28%EA%B0%90%EC%82%AC-%EA%B7%9C%EC%A0%9C-%EB%8C%80%EB%B9%84-%EC%9E%A5%EA%B8%B0-%EB%B3%B4%EA%B4%80%29.md)
- [GPU 준비 중 화면](file:///C:/solutions/moveseyee_fe/src/pages/gpu-monitoring/GpuMonitoring.tsx)
- [MetricPort](file:///C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/port/MetricPort.java)
- [LatestValue](file:///C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/metric/LatestValue.java)
- 외부 문서는 2026-09-17 확인. 실제 지원 버전과 런타임 출력은 구현 착수 시 재검증한다.
