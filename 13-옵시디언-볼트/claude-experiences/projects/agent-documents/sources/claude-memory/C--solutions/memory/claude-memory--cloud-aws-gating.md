---
name: cloud-aws-gating
description: 2026-08-24 클라우드(AWS) 설정 기반 활성화 — 게이팅 구현과 착수 후 드러난 고아 화면·오안내
metadata: 
  node_type: memory
  type: project
  originSessionId: ab42e5c3-130a-4842-9019-8b9d096c0f46
  modified: 2026-08-24T01:00:49.573Z
---

2026-08-24 "설정에 AWS 키를 넣으면 클라우드 모니터링이 켜지는" 게이팅을 BE·FE 구현·커밋(BE `285855b`/`ZM-79` · FE `74e41d0`/`master`, 미푸시). 계약 `_workspace/features/cloud/aws-monitoring/contract_cloud-gating.md`, 검수 요청 `_workspace/features/cloud/aws-monitoring/review_cloud-gating.md`.

**착수 후 드러난 것 — 이게 본론이었다**
- 🔴 `CloudInfraInfo.tsx`(AWS 키 입력 화면)가 **고아 파일**이었다. 라우트에도 `SETTINGS_ENTRIES`에도 없어 **제품에 키를 넣을 UI 경로가 아예 없었다**(DB 직접 수정이나 `.env`/IAM 역할에만 의존). 경로 상수 `PATH_SETTING.cloudInfraInfo`와 권한 enum `CLOUD_INFRA_INFO`는 진작 있었는데 아무도 쓰지 않았다 — **상수가 있다 ≠ 화면에 닿는 길이 있다**.
- 도움말 `page_guide.monitoring_cloud`가 "설정 > **데이터 소스 관리**에 AWS 자격 증명이 있어야"라고 안내했으나 그 카탈로그(zabbix/prometheus/elasticsearch/datadog)에 AWS는 없다.
- 폼의 시크릿 키가 `required`인데 BE는 "비우면 기존 유지"(ZM-100)라, 리전만 바꿔도 시크릿 재입력을 강요했다.

**설계 판단**
- 상태 판정(`GET /cloud-infras/status`)은 **AWS를 호출하지 않는다** — 메뉴 렌더마다 불리는 값이라 호출을 섞으면 사이드바가 느려지고 일시적 네트워크 장애가 메뉴를 지운다. 실제 확인은 `POST /test-connection`(사용자가 누를 때만, `ec2:DescribeRegions` 1콜, 실패도 200+`reason`).
- 판정 로직을 복제하지 않고 `CloudCredentialsResolver`로 **추출**했다(`AwsServiceImpl`에서). 복제하면 한쪽만 바뀌어 "메뉴는 켜졌는데 호출이 죽는" 상태가 된다.
- 하이브리드(`.env`·IAM 역할)도 게이트 통과로 인정하되 `settingPresent`로 출처를 구분해 화면에 알린다 — 설정이 비었는데 동작하면 담당자가 이유를 알 수 없다.
- 설정 화면은 **독립 엔트리**로. 데이터 소스 카탈로그는 수집 엔진 포트 개념이고 AWS는 그 포트를 구현하지 않아 섞으면 혼선.
- 🔴 **"기본 리전" 설정은 두지 않는다**(사용자 결정으로 제거). 리전 미지정 호출은 `getRegions()` 하나뿐이고 `ec2:DescribeRegions`는 **어느 리전 엔드포인트로 불러도 전체 목록**을 준다 — 나머지는 리전 명시 or 전체 팬아웃. 즉 "SDK 클라이언트 만들 때 필요한 아무 리전"이라 물을 이유가 없었다. 해석은 `요청 리전 → AWS 표준 체인 → us-east-1`. 함께 사라진 것: 설정 화면 리전 Select와 그 닭-달걀(최초 등록 땐 리전 조회가 막힘) · `CloudInfraInfoDto`/`CloudStatusDto`/`CloudCreds`의 필드 · 홈 위젯 AWS 행 리전 표시(→`-`). 처음엔 목록용 다중선택 필터 훅(`useFilterRegion`)을 그 자리에 쓴 게 문제라고만 봤는데, 값 자체가 불필요했다.

**검증**: BE 1019 green · FE tsc/eslint 통과 · FE 1076 pass(실패 1건 `AiAssistantPage`는 선재, 커밋 `c383528` 상태에서 재현). **런타임 미검증** — 브라우저·실 AWS 호출 없음.

**범위 밖**: 자산관리 ↔ EC2 연동(`AssetSyncService`는 여전히 `cloudData(Map.of())`), Cost Explorer.

🔴 **동시 세션 커밋 사고**: 코덱스가 "멈췄다"는 전제로 작업했으나 실제로는 병행 중이었고, 내가 스테이징한 직후 코덱스가 add/commit을 실행해 **내 커밋 메시지에 코덱스 파일 3개가 담겼다**(파일 소실은 없음). 교훈 — 공유 트리에서는 `git add` 후 `git commit`이 아니라 **`git commit --only <경로>`로 경로를 못 박는다**(인덱스 상태와 무관하게 지정 파일만 담긴다). 한 파일에 두 세션 변경이 겹치면 `git apply --cached`로 hunk만 스테이징해 가른다. 그리고 커밋 직후 `git show --stat`으로 **담긴 파일을 반드시 확인**한다.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--aws-cred-single-source|aws-cred-single-source]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--design-system-and-help|design-system-and-help]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-review-handoff|codex-review-handoff]]

**2026-08-26 추가 — 개요 "수집 실패" 경고 오탐 + 토글 미연결**
- 🔴 `EC2Dashboard` 경고 조건이 `state≠ok`였는데 BE 개요는 무과금 모드에서 cloudWatch·alarms를 **항상 `disabled(ZERO_COST_MODE)`**(AwsServiceImpl 하드코딩)로 내려 → 경고 100% 상시 노출. FE 수정: `unavailable|partial`만 경고, 전 리전 disabled면 info 안내(`cloud_overview.cloudwatch_disabled_notice`), 타입에 `disabled` 추가. 테스트 4건(미커밋).
- 🔴 설정의 `paidFeatures.fleetMetrics` 토글은 **소비 코드 0곳**(costExplorer만 비용 화면에 연결) — P3(GetMetricData) 미착수라 켜도 개요 동작 불변. 사용자가 "설정 다 켰는데 왜"라고 물은 실체. 개별 인스턴스 시계열(CloudMetricsService)은 토글이 아니라 권한캐시+월예산으로만 게이트.
- **08-26 P3 연결(미커밋, Codex 5차 최종 "커밋 가능" — 커밋 승인 대기)** — 3·4차 추가 반영: `FleetMetricsCache` custom 키에 Instant 전체 정밀도, CLOUD 저장 시 무효화를 **afterCommit**으로(롤백 시 유지), **세대 펜스**(조회 시작 세대 캡처→같은 세대일 때만 put; 팬아웃 도중 무효화 시 늦은 put 폐기). BE 1389 green. 🔴 커밋 순서 주의: 내 코드가 병행 세션의 **미커밋 신규 파일**(CloudWatchAvailability·Ec2ZabbixMatcher)에 의존 → 그쪽 커버리지 커밋이 먼저 들어가야 함. 문서 경로: _workspace/features/cloud/aws-monitoring/review_cloud-fleet-metrics-p3.md(08-26 _workspace가 reviews/·designs/로 재편됨).
- (구) 3차 검수 중 메모 — — 1·2차 검수 반영 완료: 10분 캐시(`FleetMetricsCache` 컴포넌트, custom 창은 from|to 키, CLOUD 설정 저장 시 invalidate), 리전당 20대, 플릿 예산 몫 70%(`reserve(calls, cap)` 오버로드), 네트워크 SUM/period, SdkException 강등, NO_DATAPOINTS 제외, FE 사유 우선순위(BUDGET>PAID_OFF>기타), 설정 화면 비용 문구를 GetMetricStatistics 프리티어 기준으로 정정, 계약서 갱신. BE 1384 green·FE 10/10. 🔴교훈: 병행 세션과 같은 파일(AwsServiceImpl) 동시 편집 — 앵커 재확인 필수 / gradle test는 :3000 실행 중 인스턴스를 오염시킬 수 있음.
- **08-26 P3 연결 상세(1차 착수 시점 메모)**: `AwsServiceImpl.overview()`가 `CloudPaidFeatures.fleetMetricsEnabled()`를 읽어 켜짐이면 실행 중 인스턴스(리전당 50대 상한)에 GetMetricStatistics 3지표 팬아웃(기존 예산 예약 재사용) → cpuTop/networkTop 채움·cloudWatch=ok; 꺼짐=`disabled/PAID_FEATURE_OFF`(ZERO_COST_MODE 아님). FE는 사유별 안내(PAID_FEATURE_OFF/BUDGET_EXHAUSTED/FLEET_CAP). 🔴불안: 10분 폴링×리전×N대 콜 수가 프리티어를 넘을 수 있음(캐시 필요 여부 검수 요청). 🔴교훈: 같은 파일을 병행 세션이 편집 중(CRLF·앵커 어긋남)이라 패치는 현재 본문 재확인 후 적용. 기록 _workspace/features/cloud/aws-monitoring/review_cloud-fleet-metrics-p3.md


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

클라우드(AWS) 설정 기반 활성화 — 2026-08-24 게이팅 BE·FE 구현(미커밋, 검수대기). 🔴착수 후 드러난 본론: **AWS 키 입력 화면이 고아 파일**이라 제품에 키 넣을 UI 경로가 없었음(경로상수·권한enum은 있었는데 아무도 안 씀) · 도움말이 없는 메뉴("데이터 소스 관리")로 오안내 · 시크릿 required가 ZM-100 "비우면 유지"와 충돌. 상태판정은 AWS 미호출(메뉴 렌더마다 불림), 연결테스트만 실호출. **"기본 리전" 설정은 폐기**(DescribeRegions는 어느 리전에서든 전체를 줌 → 물을 이유가 없던 값). 런타임 미검증
