# 검수 요청 — AWS 상태 타임라인 (스냅샷 수집 + 프리티어 지표 + 통합 타임라인 FE)

- 작성: Claude, 2026-08-24 · 검수: Codex (COLLAB.md §8)
- 미커밋. BE `ZM-79` 브랜치 트리 + FE `master` 트리.
- 설계 `devdesign_aws-status-timeline.md` · 계약 `contract_aws-status-timeline.md` · 과금 근거 `reference_aws-api-cost.md`

## 범위·의도

사용자 확정 방향: "AWS 모니터링에 시간 축을 만든다. 🔴 과금 절대 금지, CloudWatch 안 쓰는 고객 가정."

**BE (moveseye-be-spring)**
- V28: `cloud_instance_snapshot`·`cloud_vpc_snapshot` + 스케줄러 시드 2행(`cloud_snapshot` 5분 / `cloud_snapshot_cleanup` 매일·보존 30일)
- V29: `cloud_api_budget`(월 호출 카운터)
- `Ec2StatusRules`·`NetworkExposureScanner` 추출 — overview/vpcs detail의 판정을 스냅샷과 공유(복제 금지)
- `CloudSnapshotService`(수집·정리) + Job 2종 / `CloudSnapshotQueryService`(state-history·플릿추이·vpc history)
- `CloudMetricsService` — `GetMetricStatistics` 5지표, 권한거부 10분 캐시 강등, 월 예산 가드(기본 50만=프리티어 절반), Period 자동 산정(retention 규칙+1440 상한)
- `AwsReadOnlyGateway`에 `getMetricStatistics` 단일 메서드 추가(gradle `cloudwatch` 의존 복원 — GetMetricData 계열은 메서드 자체 없음)
- 컨트롤러 EP 3종 신설(`/ec2/state-history`·`/ec2/metrics`·`/vpcs/history`) + overview `trends.instanceStates` 채움
- 부수 수정: `awsNotFoundError`에 `.Malformed` 매핑(런타임 실측 — AWS가 형식 어긋난 ID에 Malformed를 던져 500 유출) · `LicenseArchitectureTest` A5 허용목록에 `getMyPermissions` 추가(코덱스 신규 EP가 규칙에 안 잡혀 전체 테스트 실패하던 선재 건)

**FE (moveseyee_fe)**
- `InstanceTimeline.tsx` 신규(ECharts): 상태 밴드 markArea + CloudTrail write 이벤트 markLine + CPU/네트워크/디스크 차트. 강등 시 밴드 스트립+Alert로 대체(에러 아님)
- `EC2Dashboard`: 플릿 상태 추이 스택 차트 / `VPCDetail`: 진단 추이 step 차트 + "최초 발견" 컬럼
- 서비스 3함수·타입 6종·쿼리키 3종·i18n(kr/en) `cloud_timeline`·`vpc_history` 블록
- 부수 수정: `MapViewList`·`ServerLocationList`의 stale `@ts-expect-error` 2줄 제거(코덱스의 DmoveTable scroll 타입 확장으로 unused가 돼 `tsc && vite build` 실패하던 것)

## 불안한 지점 (여기를 먼저 봐 달라)

1. **`CloudMetricsService.deniedUntil`이 인메모리 전역(리전 무구분)** — 한 리전 권한거부가 10분간 전 리전 지표를 강등시킨다. IAM 권한이 리전별로 갈리는 계정은 드물다고 봤는데, 과한 단순화인지 판단 바람.
2. **예산 체크·기록 사이 race** — findById→호출→addCalls 사이에 동시 요청이 끼면 상한을 수 콜 초과할 수 있다(addCalls 자체는 원자적). 상한이 50만이라 실질 위험은 낮다고 판단했지만 D3 취지상 허용 오차인지.
3. **스냅샷 run_at이 서버 로컬 LocalDateTime** — API 경계에서 systemDefault로 Instant 변환. 서버 TZ가 바뀌면 이력 시각이 흔들린다. 기존 테이블들 관례(timestamp)를 따랐는데 timestamptz로 갔어야 했는지.
4. **`cloud_snapshot` 5분 팬아웃이 활성 리전 전부(≈30)를 돈다** — EC2 API는 무과금이지만 rate limit(계정당 Describe 계열 burst)·수집 소요시간 관점 검토 바람. 병렬 8, 리전당 2~3+VPC×3 콜.
5. **FE InstanceTimeline의 조회 창이 range 선택 시점 고정**(useMemo) — 화면을 오래 켜두면 창이 흐르지 않는다. refetch 정책(현재 기본)과 함께 봐 달라.
6. **CloudTrail 마커는 readOnly==="false" 문자열 비교** — CloudTrail 원값이 문자열이라 맞지만, BE가 언젠가 boolean으로 정규화하면 조용히 사라진다. 계약에 못 박을지.

## 검증 완료

- BE 전체 **1,035+ 테스트 green**(신규: Ec2StatusRules·CloudSnapshotService 5·CloudMetricsService 4·CloudSnapshotQuery 3·NotFound Malformed)
- FE `tsc` 0 · eslint 0 · jest 1,099/1,100 (실패 1건은 선재 `AiAssistantPage`, 본 작업 무관)
- **런타임(:3001 진단 인스턴스 + dev 도커 DB)**:
  - V28/V29 적용, 5분 배치 자동 실행 — 인스턴스 1행(`ec2-tokyo`)·VPC 17행 적재, ap-northeast-2 `0.0.0.0/0:22` critical이 기존 실시간 진단과 일치
  - `/ec2/state-history` 3회차 반환 · `/ec2/metrics` **실 CloudWatch 호출**(CPU 288포인트·period 300s·`cloud_api_budget` 2026-08|5 기록) · `/overview` trends 3버킷
  - NotFound/Malformed 3케이스 전부 계약 오류(`INSTANCE_NOT_FOUND`/`VPC_NOT_FOUND`)

## 미검증

- **FE 브라우저 렌더** — 차트 3종·밴드·마커의 실제 렌더 미확인(Chrome MCP 탭은 rAF 정지로 ECharts 검증 부적합 — 알려진 함정). 로그인 브라우저에서 EC2 상세/대시보드/VPC 상세 한 번씩 봐야 함
- **강등 경로 실측** — CLOUDWATCH_ACCESS_DENIED(권한 없는 계정 필요)·BUDGET_EXHAUSTED(카운터 조작으로 재현 가능: `UPDATE cloud_api_budget SET calls=500000`)는 단위 테스트만
- **:3000 반영** — 사용자 재기동(17:33) 이후의 수정(Malformed 매핑·Phase2·3 전부)이 실서버에 미반영. 다음 재기동 때 자동 반영(`build/classes` 최신)
- `vpcs/history`의 런타임 실측(스냅샷 2회차 이상 쌓인 뒤 firstSeen 판정)

---

## 추가분 (2026-08-25) — 상세 UX 개편 + 로우데이터

- **드로어 상단 "페이지로 보기"**: EC2·VPC 목록의 ResizableDrawer `extra`에 버튼 — 전용 페이지 라우트(region 쿼리 포함)로 이동.
- **페이지 레이아웃 재구성**(패널 모드는 기존 세로 스택 유지, `isPanel`=props 주입 여부로 판별):
  - EC2 상세: 정보(전폭, 4컬럼) → [타임라인+CloudTrail | xl16] · [상태점검·예정이벤트·SG·볼륨 | xl8]
  - VPC 상세: 정보(전폭) → [노출진단+추이 | xl16] · [서브넷·게이트웨이 | xl8] → 라우팅·SG·연결EC2·CloudTrail 전폭
- **차트 로우데이터**: 공용 `chartDataView.ts` — ECharts toolbox.dataView를 시각 포맷 표(optionToContent, 시각+시리즈 병합)로 교체 + saveAsImage. 적용: 타임라인 3차트·플릿 추이·VPC 진단 추이. 밴드 전용 스트립은 제외(수치 시리즈 없음).
- 검증: tsc 0 · eslint 0 · jest 1,099/1,100(선재 1건 동일). **브라우저 렌더 여전히 미확인** — dataView 표·2컬럼 레이아웃은 화면에서 한 번 봐야 함.
- 불안한 지점 추가: ⑦ dataView 팝업 배경이 ECharts 기본(밝은색)이라 다크모드에서 대비 어색할 수 있음 — 실화면 확인 후 `dataView.backgroundColor`를 팔레트로 물릴지 결정.
