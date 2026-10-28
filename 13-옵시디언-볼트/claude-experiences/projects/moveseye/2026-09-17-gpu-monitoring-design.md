---
tags: [moveseye, gpu, llm, design]
updated: 2026-10-21
---

# GPU 모니터링부터 LLM 정상 여부까지

사용자 목표: **1차 단순 GPU, 최종 GPU 기대 성능과 LLM 정상 여부까지 확인**. 구현 없이 설계 작성.

- 정본: `C:/solutions/_workspace/features/premium/gpu-monitoring/devdesign_gpu-monitoring.md`, 작업 카드: `_workspace/features/premium/gpu-monitoring/deferred_gpu-monitoring.md`.
- 실제 GPU/OS/규모/serving engine은 미확정. NVIDIA+기존 Zabbix P1을 가정한다.
- 현재 FE 준비 중 화면, Feature gate 존재. MetricDomain.GPU/카탈로그는 미구현. LatestValue primitive double로는 미지원 원인을 표현하지 못하므로 계약 보강 검토.
- 공식 Zabbix NVIDIA 템플릿은 기본 하드웨어와 지원 clock/P-state/PCIe/ECC 등 제공. DCGM 정밀 지표와 LLM engine metrics는 별도 원천·통합 필요. exporter는 저장소가 아니다.
- GPU index 대신 UUID; VRAM 점유와 memory activity 분리; Zabbix 전처리 후 unit 변환 중복 주의.
- 하드웨어 건강, 비교 가능한 workload 기준 성능, LLM 서비스 가용성/지연, 응답 품질은 별도 판단. GPU 사용률로 LLM 정상/원인을 확정하지 않는다.
- 최종 경로: GPU/DCGM + serving engine /metrics + OTel/APM + 합성 추론, 모델/replica/GPU 시간대별 매핑. p95 평균 금지, 표본 부족·shared GPU 귀속 불가 표현.

관련: [[2026-07-28-collector-engine-phase1]], [[2026-09-17-apm-retention-policy-design]]

## P1 상세화 (같은 날 후속 요청)

- 사용자가 LLM을 미루고 NVIDIA+Zabbix P1을 상세 설계하도록 요청.
- P1 정본: `_workspace/features/premium/gpu-monitoring/devdesign_gpu-monitoring-p1.md`, 계약: `_workspace/features/premium/gpu-monitoring/contract_gpu-monitoring.md`(DRAFT).
- 값 상태를 보존하는 신규 GpuInventoryPort snapshot, 기존 MetricPort에 querySeriesChecked 추가 설계. 기존 parseDoubleOrZero를 GPU 최신 상태에 그대로 쓰지 않는다.
- master/discovery lastvalue가 유효 JSON이어도 오류/비활성/오래됨이면 NO_GPU·REMOVED 판정 금지.
- 60초 snapshot은 generatedAt 기준 상태 고정, 30초 갱신은 새 snapshot/page1. 권한은 매 요청 재확인.
- 완료된 경계 trend는 boundaryPartial, 현재 진행 중 시간은 gap. sample count 없는 trend로 전체 평균을 계산하지 않는다.
- source 단일·목록/상세/시계열/진단4 API, GPU 모듈 권한·영역 권한·라이선스 경계, query/caching 상한·실장비 QA까지 명세. 구현 미착수.

## 수집 경로 재설계 (2026-09-30)

사용자 요구: NVIDIA만 고려, **Zabbix 에이전트 수집**과 **에이전트 없이 API 수집** 둘 다 설계. 코덱스에도 같은 과제를 독립 제안으로 맡김.

- 정본: `_workspace/features/premium/gpu-monitoring/devdesign_gpu-collection-paths.md`, 코덱스 안: `_workspace/_archive/features/premium/gpu-monitoring/proposal_gpu-collection-paths_codex.md`.
- **전제가 깨짐**: dev Zabbix는 7.0.6인데 공식 NVIDIA 플러그인·템플릿은 7.2.1부터 공식 제공(What's new 7.2.1 원문, 7.0 문서에는 플러그인 페이지 404·템플릿 목록에 없음). 09-17 설계는 공식 템플릿 하나만 전제했다.
- "API로 수집"은 세 가지다 — Zabbix가 부른다(HTTP agent) / 고객 Prometheus를 읽는다 / MovesEye가 직접 받는다. 구조를 가르는 축은 에이전트 유무가 아니라 **저장소가 Zabbix냐 아니냐**.
- 1차: DCGM Exporter + Zabbix HTTP agent, nvidia-smi UserParameter, 공식 플러그인 읽기. 셋 다 저장·알람이 Zabbix라 새 저장소가 없다.
- 자체 템플릿은 마스터 아이템만 다르고 dependent 키(`moveseye.gpu.*`)를 통일 → MovesEye가 아는 키 계열은 공식+자체 둘뿐.
- 자체 템플릿이면 미지원 오류 문구를 우리가 정할 수 있어 미지원 판정이 결정적이 된다.
- HTTP 경로는 모의 exporter로 실장비 없이 전 구간 검증 가능. 단 파이프라인 검증이지 장비 지원 검증이 아니다.
- DCGM 기본 지표 목록에는 VRAM total·전력 제한·ECC가 없다(저장소 CSV 원문 확인).
- 설계 drift: P1의 `querySeriesChecked` 신설안은 ZM-159 `querySeriesResult`와 중복.

교훈: **설계서가 전제한 외부 제품 버전을 실제 환경 버전과 대조하지 않으면 설계 전체가 공중에 뜬다.** 인증 없이 되는 `apiinfo.version` 한 번이면 확인된다.

### 같은 날 후속: 7.0 고객·클러스터·코덱스 대조

- "7.4를 못 쓰는 고객은?" → 버전 무관 경로 둘(DCGM+HTTP agent, nvidia-smi)이 기본. 추가로 **7.0에서 막히는 건 플러그인이 아니라 템플릿**임을 소스로 확인(통신 규약 버전이 7.0용 플러그인과 NVIDIA 플러그인 모두 `6.4.0`). 실행 시험 전이라 선택 경로로만 둠.
- 패키지 저장소 목록이 가장 단단한 증거였다: 7.0 저장소에는 NVIDIA 플러그인 패키지가 없고 7.2에는 있다. 문서 검색 요약보다 저장소 목록을 먼저 볼 것.
- 클러스터(여러 GPU 서버를 고속 네트워크로 묶은 환경, 규모 미상·최대한 많이): 조회 때 계산하지 않고 Zabbix 집계 아이템으로 미리 집계. 클러스터 = 요약 호스트 하나. 집계는 값 없는 아이템을 빼고 계산하므로 "값이 있는 GPU 수"를 함께 저장.
- 연결망: RDMA 통신은 일반 네트워크 인터페이스 카운터가 아니라 `/sys/class/infiniband` 쪽에 잡힌다.
- 코덱스 독립 제안과 방향 일치. 코덱스가 더 잘 본 것: 알람 정본이 없는 경로의 건강 상태는 UNKNOWN, 수집 등급별 필수 지표, 요청 위조 방어. 내가 더 본 것: 통신 규약 확인, 미지원 오류 문구 고정, 클러스터.
- 시험 장비: GPU 1~2장 서버. 클러스터는 실측 원문을 복제한 모의로 검증.
- 2026-10-01 사용자 확정: 자체 템플릿을 **태그로 식별하는 "MovesEye 프리셋 템플릿"**으로 정의. 태그가 호스트에 상속되므로 수집 프로필 판정도 태그로 — 키 접두사 추측보다 단단하다. 설치 현황·갱신 필요·제품 짝 확인이 전부 `template.get` 태그 필터 하나로 풀린다.
- 2026-10-01 결정 완료: 1차 경로 그대로, **Prometheus 배제(Zabbix만)**. SNMP 질문에는 "GPU는 SNMP를 말하지 않는다 — net-snmp extend로 nvidia-smi를 실어 나르는 전송 변형만 가능"으로 답함. 전송 방법과 데이터 원천을 구분해 설명하는 게 핵심이었다.

## 구현 1차 완주 (2026-10-07~08, ZM-78)

- be-engineer 3분할(엔진 / 프리셋 템플릿 / app API) + S2.5 설치 가이드 + fe-engineer 2분할(목록·상세 / 설치 가이드)로 하루 반 만에 BE·FE 전부. 같은 워크트리에서 에이전트 둘이 병렬일 땐 **경로를 배타로 나누고, bootRun 중엔 gradle 금지**를 프롬프트에 박아야 한다(한 번 "코드 밖 문자열" 컴파일 오류가 상대 편집 중간 상태 때문에 났다).
- **실장비 런타임 검증이 잡은 것**(fixture로는 절대 못 잡는 것들): Zabbix 7.2+가 본문 `auth`를 거부(제품 전체가 7.2+와 통신 불가였음) · `item.get` 필드가 7.0/7.4에서 서로 거부 · 비LLD 아이템 `itemDiscovery: []` · 사용자 매크로 값 안 `{HOST.CONN}` 미전개 · dev BE 두 벌이 Redis를 공유하면 Zabbix 세션 토큰이 섞임 · 새 설치 URL 미설정 NPE가 LICENSE_REQUIRED로 둔갑. 교훈: **설계 가정 표(A1~A14)를 만들어 두고 하나씩 실측으로 닫는 방식**이 효과적이었다.
- 공유 dev DB에 브랜치 마이그레이션을 적용하지 않으려면 샌드박스 DB+Redis DB 인덱스를 통째로 분리(5434/DB1, 5435/DB2). `.env`는 복사하되 설정 행은 암호화된 채로 DB 간 복사.
- 헤드리스 CDP 검증에서 첫 goto는 25초 이상 기다릴 것(12초면 앱 셸도 안 뜬 채로 "빈 화면"으로 오판).

## 병합 (2026-10-10·10-13, 미푸시)
- 코덱스 병합 준비 검토(`_workspace/_archive/features/premium/gpu-monitoring/review_gpu-p1_merge-readiness_codex.md`): 조건부 진행 — master에 V74·V75(APM)가 먼저 들어가 ZM-78의 V72·V73이 out-of-order. 로컬 어느 DB에도 V74/75 미적용·master 미푸시라 번호는 그대로 두고 **푸시 시 V72·V73을 V74·V75와 함께** 보내기로.
- 1차 10-10: 사용자가 master에 rebase 병합 — BE `5995169`·`3c41669`·`3680909` / FE `1432ce3`·`c24ef50`. PREMIUM 전원 GPU 개방은 의도.
- 2차 10-13: MovesEye 프리셋 표시 `f57f8f8` · GPU 위젯 대시보드·수집 방식 현황 `f99621e` / FE `b199745`. 회귀 BE 5,181건 실패 0.
- 🔴 BE·FE 테스트 동시 실행 금지(메모리 부족 중단 2회). 샌드박스 DB 5434/5435는 V72 변경으로 재생성(빈 상태).
- 후속: detectedProfiles 후보 전체 · 관리 콘솔 GPU 항목 · 공식 플러그인 단독 프로필 실측 · 6.0 템플릿 · R6 새 설치 동선. 기능 지도 [[프리미엄-GPU-DB-모니터링]].

## 푸시·정리·문서화 (2026-10-13)
- 사용자가 BE·FE master를 푸시(원격 master에 ZM-78 포함 확인). 2차 병합은 master가 그사이 앞서 있어(BE 1·FE 7커밋) **워크트리에서 rebase → 컴파일·tsc·관련 jest 259건 → ff-only**. 겹친 파일(locales·navSearchEntries)은 자동 병합.
- 정리: 워크트리·로컬 ZM-78 가지 삭제(원격 가지는 손대지 않음), 7.0 샌드박스 DB(5435) 삭제. **dev74 DB(5434)는 보존 권장**(`application-dev74-db.yml`이 master에 있고 7.0/7.4 번갈아 쓰기용). 시험 서버 잔존물(스크립트·conf·dcgm-exporter·방화벽 4줄·에이전트 설정, 7.0.6 시험 호스트 `GPU-SERVER-SMI`)은 사용자 결정 대기.
- 문서: `_workspace/features/premium/gpu-monitoring/guide_gpu-nvidia-smi-collection.md` — 서버에 넣는 것(스크립트 1 + UserParameter 1줄), 1분 1회 호출·종속 아이템 구조, 19열 표, 트리거·매크로, **저장 위치**(측정값은 Zabbix DB history/trends뿐, MovesEye PG는 설정·위젯 배치·권한, Redis는 단기 캐시), 스크립트 줄별 설명(`LC_ALL=C`·`flock -w 4`·`exec timeout 10`·4+10<15초).
- 사용자 질문에서 드러난 설명 포인트: "서버에 뭘 설치하나 / 누가 넣었나 / 계속 호출하나 / DB는 어디" — 설치형 고객에게도 똑같이 나올 질문이라 고객 문서의 첫 절로 쓸 만하다. LLD 개념은 **`{#}`=디스커버리가 채운 값, `{$}`=사람이 정한 설정값, 프로토타입=`{#}`를 끼우는 틀**로 설명하니 바로 통했다.
- 교훈: 시험 서버에 무엇을 넣었는지 실측 기록(`gpu-p1-source-profile.md` §8)에 남겨 둔 덕에 "니가 넣은 거야?"에 파일 경로·설정 줄까지 바로 답했다. **외부 서버에 쓰기를 하면 같은 날 기록에 경로 단위로 남길 것.**
