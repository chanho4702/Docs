---
name: gpu-collection-paths-design
description: "GPU 모니터링 수집 경로 설계(2026-09-30) — NVIDIA 한정, Zabbix 에이전트 수집과 API 수집 둘 다. 공식 플러그인은 7.2.1부터라 dev(7.0.6)에서 못 씀"
metadata:
  node_type: memory
  type: project
  originSessionId: 24a3df5c-fb39-49d1-8853-e53d97f143de
  modified: 2026-10-12T06:30:23.890Z
---

2026-09-30 사용자 지시: GPU 모니터링 설계, **NVIDIA만 고려**, **Zabbix 에이전트로 수집하는 경우와 에이전트 없이 API로 수집하는 경우 둘 다** 고민. 코덱스에도 같은 과제를 독립 제안으로 맡김("코덱스한테도 시켜봐"). 구현 미착수.

- 정본: `_workspace/features/premium/gpu-monitoring/devdesign_gpu-collection-paths.md` · 코덱스 안: `_workspace/_archive/features/premium/gpu-monitoring/proposal_gpu-collection-paths_codex.md` · 작업 카드 `_workspace/features/premium/gpu-monitoring/deferred_gpu-monitoring.md`
- 09-17 설계(코덱스 작성, `devdesign_gpu-monitoring.md`·`-p1.md`·`features/premium/gpu-monitoring/contract_gpu-monitoring.md`)는 유지하되 "공식 템플릿 단일 전제"만 뒤집음. 값 상태·집계·시계열·화면 규칙은 P1 문서가 계속 정본.
- 🔴 **dev Zabbix 7.0.6, 공식 NVIDIA 플러그인·템플릿은 7.2.1부터 공식 제공.** 근거: What's new 7.2.1 원문, 7.0 문서 플러그인 페이지 404, 7.0 Agent 2 템플릿 목록에 없음. "7.0에서 기술적으로 불가"까지 확인한 것은 아님(우회 미검증).
- 방향: 1차 = 저장소가 Zabbix인 3경로(DCGM Exporter+HTTP agent · nvidia-smi UserParameter · 공식 플러그인 읽기). 2차 = Redfish·SSH·고객 Prometheus(엔진 스텝 6 재개 선행). 3차 = MovesEye 직접 수집(LLM과 함께). CloudWatch는 유료 사용자 지정 지표라 제외.
- 자체 템플릿 키는 `moveseye.gpu.*[UUID]`로 통일, 호스트 단위 프로필 하나만 사용.
- 🔴 DCGM 기본 지표 목록에 VRAM total·전력 제한·ECC 없음(저장소 CSV 확인).
- 🔴 P1의 `querySeriesChecked` 신설안은 ZM-159 `querySeriesResult`와 중복 — 재사용으로 고칠 것.

- 2026-09-30 사용자 추가 확정: **시험 실장비 있음(GPU 1~2장 서버)**, **GPU 클러스터도 대상**(정의: 여러 GPU 서버를 고속 네트워크로 묶어 하나처럼 쓰는 환경, 스케줄러 미특정), 규모는 "알 수 없음, 최대한 많이", 노드의 Zabbix 등록 여부는 모름.
- 클러스터 설계(문서 §13·§14): 클러스터 = Zabbix **요약 호스트** 하나 + 집계 계산 아이템(`avg(last_foreach(/*/키?[group=..]))`)으로 미리 집계, MovesEye DB에 클러스터 테이블 없음. 노드×GPU 격자 화면. 노드 간 연결망(InfiniBand·RoCE)은 `/sys/class/infiniband` 카운터 — 일반 `net.if.*`로는 RDMA가 안 잡힘.
- 🔴 7.0에서 막히는 건 플러그인이 아니라 **템플릿**: 에이전트-플러그인 통신 규약이 7.0용 플러그인과 NVIDIA 플러그인 모두 `6.4.0`(소스 확인, 실행 미검증). 7.0 패키지 저장소에는 NVIDIA 플러그인 패키지 없음(실측).
- 코덱스 대조 완료(문서 §11): 방향 일치. 받아들인 것 — 알람 정본 없으면 health UNKNOWN, 수집 등급별 필수 지표, 프로필 ID 버전 접미사, SeriesResult 계열별 품질, 권한 migration 필수. 갈린 것 — 포트 분리(포트 하나·모델 둘로 판단), 기존 Prometheus 고객 처리(사용자 결정 Q5).
- 2026-10-01 Q4 확정: 자체 템플릿 배포 동의 + **템플릿 태그(`moveseye_preset`·`moveseye_preset_version`·`moveseye_preset_min_product`)로 "MovesEye 프리셋 템플릿"을 정의**(문서 §15). 수집 프로필 판정은 호스트에 상속된 이 태그로, 키 접두사는 보조. 파일은 BE `resources/zabbix-presets/`에 Zabbix 메이저별.
- 2026-10-01 Q2 확정(1차 경로 그대로), Q5 확정(**Prometheus 배제, Zabbix만** — C1·K2·K3 범위 밖, 엔진 스텝 6 재개 논의 없음). SNMP 질문 → GPU는 SNMP를 말하지 않음, net-snmp extend+nvidia-smi 변형(S1)만 가능하며 A2의 전송 변형 프리셋으로 1차 후순위(문서 §16). **남은 사용자 결정 없음, 다음 = S0 실측(설치 범위 승인 필요).**


## 구현 착수 (2026-10-07~)
- 티켓 **ZM-78**(GPU 모니터링 페이지, 에픽 ZM-117). 워크트리 `C:\worktrees\zm-78-be`·`zm-78-fe`(브랜치 ZM-78, master에서 분기). `fullstack-feature` 절차, be-engineer 에이전트(opus) 3개로 분할: S1 엔진(완료, engine-zabbix 335건·GPU 62건) / 프리셋 템플릿 2종+카탈로그(완료 26건) / S2 app API(진행). 인계 문서 `_workspace/features/premium/gpu-monitoring/impl_gpu-s1-engine.md`·`impl_gpu-presets.md`. **미커밋**.
- 시험 서버 `GPU-SERVER` 10.220.0.13 (root, Rocky 10.2, **RTX 5070** GeForce 1장, 드라이버 615.71.09). 🔴 **LLM 서비스(ollama·llm-api·chroma) 운영 중 — 재부팅·드라이버 재적재·GPU 부하 금지**. 실측 정본 `_workspace/features/premium/gpu-monitoring/gpu-p1-source-profile.md`.
- 🔴 **Zabbix 7.4.15 서버가 10.220.0.82에 따로 있다**(API `/api_jsonrpc.php`). GPU 서버 에이전트는 7.4.15+NVIDIA 플러그인(사용자가 10-01 설치)으로 거길 바라봄. GPU-SERVER는 두 Zabbix 모두 등록. BE 프로필 **dev70**(5433→7.0.6)/**dev74**(5434→7.4.15, 컨테이너 `dmove-postgres-dev74`) 분리, `_tools/run_be_3000_dev.ps1 -Profile dev74`(단 스크립트는 master 레포를 띄움 — 워크트리 런타임은 별도).
- Claude가 서버에 한 것: dcgm-exporter 컨테이너(`4.5.2-4.8.1-ubi9`, :9400), firewalld rich rule 4개(211.174.53.7·10.220.0.82 → 10050·9400). 그 외 무변경.
- 실측 사실: 공식 플러그인 원시값 전력 **mW**·PCIe KB/s JSON·P-state 숫자·미지원 문구 `NVML error: The requested operation is not available on target device.`·`nvml.device.utilization.gpu`는 에이전트 키 아님(dependent). DCGM GeForce: Xid·NVLink 줄 없음, MEMORY_TEMP는 미지원인데 0, FB 합산 12225≠12227.
- 10-08 진행: **S2 API 완료**(premium/gpu 23파일, 권한 Flyway **V72**, GPU 테스트 63건; health는 P1 UNKNOWN+호스트 이벤트 링크), S2.5 **설치 가이드 API**(사용자 요구: Zabbix 버전 체크·연동 방식 선택·프리셋 설치 상태, V73 gpu_setting) 진행, **S3 FE** 진행(zm-78-fe). 프리셋 3종(dcgm-http·nvidia-smi·nvidia-smi-**active**) + 카탈로그 39건.
- 🔴 **BE가 Zabbix 7.2+와 통신 불가였음**(본문 `auth` 제거됨, 7.4.15 `unexpected parameter "auth"` 실측) → `ZabbixClient`를 헤더 Bearer 기본 + 6.4 미만만 본문 auth(`apiinfo.version` 캐시)로 수정, `ZabbixClientAuthTransportTest` 5건. 런타임 확인은 워크트리 BE 기동 후. **ZM-78 안 [FIX] 분리 커밋 예정.**
- 런타임 실측 ✅: 7.0.6(Admin 자격증명은 BE 저장값 복호화 사용)에 프리셋 가져오기 성공, **nvidia-smi 액티브 → GPU-SERVER-SMI(10763) 값 수신**, 7.4(Admin/zabbix, API `/api_jsonrpc.php`)에 **DCGM 프리셋 → GPU-Server(10676) 값 수신**(공식 템플릿과 동시 연결 = MULTIPLE_PROFILES 실케이스). 🔴 공인망 dmove.co.kr은 사설 10.220.0.x에 못 들어감(패시브·HTTP agent 불가 → 액티브만) · 사용자 매크로 값 안 `{HOST.CONN}` 미전개(URL 직접 사용) · smi 미지원 문구는 CUSTOM_ERROR여야 깨끗함.
- GPU 서버 에이전트 conf: `Server=10.220.0.82,211.174.53.7`, `ServerActive` 동일, `Hostname=GPU-Server,GPU-SERVER-SMI`(백업 `.bak-20261008`), `/usr/local/bin/moveseye-gpu-smi.sh` + agent2.d conf 배치. dev74 DB(5434)에 라이선스 `dev74-zbx74_PREMIUM_20261008.lic` 등록(기존 .lic 전부 등록기한 만료 — 발급기 `--deadline 3650`). master BE :3002(5434) 기동 중(설정 저장은 auth 수정 후).
- 10-08 오후 런타임 검증 ✅: 워크트리 BE(:3002)로 **7.4.15(dev74, DCGM+공식 동시)·7.0.6(dev70s=5435+Redis DB2, smi 액티브)** 양쪽에서 설치가이드 4 EP·목록·상세·시계열·진단·오류경로 전부 실데이터 통과. 런타임에서 잡은 결함: 7.0 전용 `lastcheck`/7.2+ `status` 필드 → 공통 `ts_delete`만 · `itemDiscovery: []` 역직렬화 → 아이템 단위 격리 · **dev70/dev74 Redis 공유로 Zabbix 세션 토큰 충돌 → dev74는 `spring.data.redis.database: 1`** · P-state 숫자+텍스트 동시 → 텍스트만 · 🔴기존 결함: 새 설치 Zabbix URL 미설정 시 JwtAuthFilter NPE→오류 디스패치가 LICENSE_REQUIRED로 둔갑(URL 명시 오류만 추가, 후속) · 재기동 직후 캐시 세션 401(기존).
- 🔴 공유 dev DB(5433)에는 브랜치 마이그레이션(V72/V73)을 적용하지 않았다 — :3000 master BE 재기동이 깨지므로. 7.0.6 검증은 샌드박스 5435 사용. 검수 요청서 `_workspace/features/premium/gpu-monitoring/review_gpu-p1.md`(커밋 계획: BE [FIX] 인증 + [FEAT] GPU, FE [FEAT]). 런타임 기록 `features/premium/gpu-monitoring/e2e_gpu-monitoring-runtime.md`.
- 10-08 마감: FE S3(목록·상세 107건)+S3b(설치 가이드 171건) 완료, 헤드리스 CDP로 실 BE 응답 화면 확인(설치 가이드 step 값은 `zabbix|path|guide|verify` 이름). BE 전체 `:test` 4,719건 실패 0. **커밋 완료 10-08**: BE `22318f0`([FIX] Zabbix 7.2+ 인증)·`5dc84ee`([FEAT] GPU P1), FE `183b5c3` — 전부 ZM-78 브랜치(워크트리), **master 미병합·미푸시**. 코덱스 검수 BE·FE 완료(조건부 승인, 🔴0·🟡6+5) → 전부 반영해 BE `c574215`·FE `66042bf` 커밋(메시지는 작업 요약만 — 사용자 지시). 회귀 BE engine 357·app 4,727·FE 172. 샌드박스 DB 5434/5435는 V72 변경으로 재생성(빈 상태 — 재사용 시 라이선스·Zabbix 설정 다시 넣어야 함). GPU 서버 에이전트·exporter·방화벽은 그대로. 남은 것: master 병합·워크트리 정리(사용자 확인 후)·푸시(사용자). 워크트리 BE(:3002 dev74)·FE(:5174) 기동 상태로 둠(사용자 확인용). 후속: detectedProfiles 후보 전체, 관리 콘솔 GPU 항목, 공식 플러그인 단독 프로필 실측, 6.0 템플릿, R6 새 설치 동선.
- (구) 다음: 에이전트 4개 완료 → 워크트리 BE dev74 기동·런타임 검증(7.4 설정 저장·GPU API 실응답) → 전체 :test → 커밋 승인 요청 → 코덱스 검수 요청서. 그전 5단계 메모: — 7.4 공식 템플릿 export로 어댑터 키 표 확정, 7.0.6에 프리셋 가져오기·GPU-SERVER 연결·값 확인; dev74 DB에 Zabbix 설정 저장. 그다음 S3 FE.

- 10-10 코덱스 병합 준비 검토(`_workspace/_archive/features/premium/gpu-monitoring/review_gpu-p1_merge-readiness_codex.md`): **조건부 진행 가능**. 🔴 master에 V74·V75(APM)가 먼저 들어가 ZM-78의 V72·V73은 outOfOrder=false라 무시됨 → **V76·V77로 번호 변경 필수**(V76/77 비어 있음, V74/75는 apm_alert_event만이라 의미 충돌 없음). BE 파일 교집합 0, FE 공용 8파일(nav·routes·locales) 자동 병합 예상이나 APM incidents+GPU 둘 다 남았는지 확인. 번호 참조는 GpuPermissionBackfillIT(version='72')·DmovePermissions 주석·문서까지. FE는 전체 jest+build+lint. 5433 history에 V72/73 있으면 멈춤. 정리는 푸시·CI 뒤.

**Why:** 설치형이라 고객 Zabbix 버전을 통제 못 함. 7.0·6.0 LTS 고객에서 공식 경로 하나로는 제품이 성립하지 않는다.

**How to apply:** 재개 시 결정은 다 끝났다 — 첫 실작업은 시험 서버에서 DCGM·nvidia-smi 원문 확보와 공식 플러그인 7.0 실행 시험. S0는 모의 exporter로 실장비 없이 시작 가능하나 dev Zabbix에 템플릿·호스트를 만드는 것은 쓰기라 따로 승인받는다. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--license-kernel-progress|license-kernel-progress]](판정 12가 GPU EP에서 닫힘) [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--collector-engine-direction|collector-engine-direction]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-wrapper-principle|zabbix-wrapper-principle]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--cloud-paid-api-optin|cloud-paid-api-optin]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-model-choice|codex-model-choice]]

**인덱스(MEMORY.md)에서 옮긴 커밋·진행 기록**
- 1차: ✅10-10 사용자가 master에 rebase 병합(미푸시) — BE `5995169`·`3c41669`·`3680909` / FE `1432ce3`·`c24ef50`. V72/V73은 V74/V75 앞 번호 그대로지만 로컬 어느 DB에도 V74/75 미적용·master 미푸시라 문제없음(푸시를 함께 하면 됨). PREMIUM 전원 GPU 개방은 의도(사용자 확인).
- 2차: ✅10-13 master 병합(rebase+ff-only, 미푸시) — BE `f57f8f8`(MovesEye 프리셋 표시)·`f99621e`(GPU 위젯 대시보드·수집 방식 현황) / FE `b199745`. 회귀 BE 5,181건 실패 0·FE는 기존 실패 8건만. 🔴푸시 시 V72·V73을 V74·V75와 함께
- 🔴 BE·FE 테스트 동시 실행 금지 — 메모리 부족으로 중단 2회.
- ✅10-13 **푸시 확인**(원격 master에 ZM-78 포함, 사용자가 푸시) → 정리: 워크트리 `C:\worktrees\zm-78-be`·`zm-78-fe`와 로컬 ZM-78 가지 삭제(원격 가지는 미삭제), 샌드박스 `dmove-postgres-dev70s`(5435)+볼륨 삭제, Redis DB 2는 원래 비어 있었음.
- 🔴 **남겨 둔 것(사용자 결정 대기)**: ① `dmove-postgres-dev74`(5434) — `application-dev74-db.yml`이 master에 커밋돼 있고 라이선스·7.4 설정 등록됨, 보존 권장 ② 시험 GPU 서버 10.220.0.13에 Claude가 넣은 것(`/usr/local/bin/moveseye-gpu-smi.sh`, `/etc/zabbix/zabbix_agent2.d/moveseye-gpu-smi.conf`, 에이전트 `Server=`·`ServerActive=`·`Hostname=` 수정, `dcgm-exporter` 컨테이너 :9400, firewalld rich rule 4개) + 7.0.6 시험 호스트 `GPU-SERVER-SMI`(10763). Agent 2·NVIDIA 공식 플러그인은 사용자가 10-01 직접 설치.
- 10-13 문서: nvidia-smi 방식 설계·스크립트 줄별 설명·저장 위치 정리 `_workspace/features/premium/gpu-monitoring/guide_gpu-nvidia-smi-collection.md`(고객용 문서로 옮길지 미정). 저장 위치 요점: GPU 측정값은 **Zabbix DB(history/trends)만**, MovesEye PG는 `gpu_setting`·`home_widget(gpu:detail)`·권한, Redis는 30초~24시간 단기 캐시.
- 보류 후보(사용자 지시 시 착수): 클러스터 화면, GPU별 알람 정확 귀속, 관리 콘솔 메뉴, Zabbix 6.0 템플릿, 공식 플러그인 단독 실측, JWT·Zabbix 세션 분리, Windows용 nvidia-smi.
