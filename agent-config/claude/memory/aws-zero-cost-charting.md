---
name: aws-zero-cost-charting
description: 2026-08-24 AWS 상태 타임라인 BE+FE 구현 완료(미커밋·코덱스 검수 대기) — 과금 0 하드 제약, 스냅샷 기본선+GetMetricStatistics 선택 강화
metadata:
  type: project
---

2026-08-25 "통합 타임라인" **BE+FE 구현·커밋 완료**(BE `f84f4ec`·FE `a815cd6`, 둘 다 #ZM-79, 미푸시 — 코덱스 무과금분과 파일이 섞여 레포당 1커밋으로 합침). 08-25 추가: 드로어 "페이지로 보기"·페이지 2컬럼 레이아웃·차트 로우데이터 뷰(chartDataView.ts). 코덱스 검수 대기(`_workspace/features/cloud/aws-monitoring/review_aws-status-timeline.md`). 설계 `devdesign_aws-status-timeline.md` · 계약 `features/cloud/aws-monitoring/contract_aws-status-timeline.md` · 과금 근거 `reference_aws-api-cost.md`.

**하드 제약(사용자)**: 🔴 과금 절대 금지 · 🔴 CloudWatch 안 쓰는 고객 가정 → 기본선=무료 `Describe*` 스냅샷 자체 적재(V28, 5분 배치+30일 정리), CloudWatch는 `GetMetricStatistics`만(프리티어 월 100만 內, **월 예산 가드 V29 기본 50만=프리티어 절반**, 권한거부는 10분 캐시 강등·200+빈 series). 유료 API는 `AwsReadOnlyGateway`에 메서드 자체를 안 만든다. 차트는 ECharts(사용자 지시).

**구현**: BE EP 3종(`/ec2/state-history`·`/ec2/metrics`·`/vpcs/history`)+overview trends 채움, 판정 공유 추출(`Ec2StatusRules`·`NetworkExposureScanner`). FE `InstanceTimeline`(markArea 밴드+markLine 마커)·플릿 추이 스택차트·VPC 진단 추이+최초발견 컬럼.

**검증**: BE 1,035+ green · FE tsc/eslint 0·jest 1099/1100(실패 1=선재 AiAssistantPage) · :3001 런타임 — 실 CloudWatch 호출(288포인트·budget 기록)·스냅샷 적재·NotFound 계약오류 실측. **미검증**: FE 브라우저 렌더(Chrome MCP는 rAF 정지로 ECharts 부적합), 강등 경로 실측, :3000은 구 빌드(다음 재기동 시 반영).

**교훈**:
- 🔴 AWS는 형식 어긋난 ID에 `.NotFound`가 아니라 **`.Malformed`**를 던진다 — NotFound만 매핑하면 500 유출(런타임 실측으로만 발견, 단위테스트는 green이었음)
- 🔴 CloudTrail `readOnly`는 **문자열 "true"/"false"** — boolean 비교는 영원히 miss
- dev BE는 콘솔 로깅뿐이라 스택 확보는 :3001 진단 인스턴스(.env export→PORT=3001 bootRun)가 정석
- `@Modifying` native upsert의 @Transactional을 서비스 자기호출로 감싸면 프록시 우회 — 레포지토리 메서드에 직접 단다
- 타 세션 수정(DmoveTable scroll 타입 확장)이 남의 파일 `@ts-expect-error`를 unused로 만들어 **FE 빌드를 깨뜨림** — tsc는 PIPESTATUS로 실제 exit 확인

관련: [[cloud-aws-gating]] · [[aws-cred-single-source]] · [[chrome-mcp-hidden-tab-no-raf]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

AWS 상태 차트화·과금 0 제약 — 2026-08-25 통합 타임라인+상세 UX **커밋 완료**(BE `f84f4ec`·FE `a815cd6`, #ZM-79, 미푸시·코덱스 검수 대기). 🔴과금 0·CloudWatch 미사용 고객 → 스냅샷(V28 5분배치)이 기본선, GetMetricStatistics는 예산가드(V29, 월 50만)+권한거부 캐시 강등. 🔴AWS는 형식오류 ID에 .Malformed(NotFound 아님)·CloudTrail readOnly는 문자열. 검수요청 _workspace/features/cloud/aws-monitoring/review_aws-status-timeline.md
