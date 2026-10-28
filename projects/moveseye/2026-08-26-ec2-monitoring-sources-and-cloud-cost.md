---
type: project
tags: [project, moveseye, aws, cloud-monitoring, cost, codex-review]
created: 2026-08-26
updated: 2026-08-26
status: active
---

# moveseye 클라우드 모니터링 — 소스 매트릭스·비용·옵트인 (2026-08-24~26)

## 개요
- **목적**: AWS 모니터링을 "상황판"에서 "시간 축 + 비용 + 소스 인지"로 — **과금 0 기본선** 위에 유료는 옵트인.
- **기술 스택**: Spring Boot 3.3 (AWS SDK v2: ec2·cloudtrail·cloudwatch·costexplorer·pricing) / React 19 + ECharts / Flyway V28·V29·V32·V35
- **저장소/경로**: `moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/` · `moveseyee_fe/src/pages/cloud-infra-monitoring/` · 설계 `_workspace/designs/` · 검수 `_workspace/reviews/`
- **커밋**: BE `f84f4ec`·`d581369`·`224605c`·`1c76397` / FE `a815cd6`·`9d744a0`·`c77121f`·`ca47c9e` (전부 #ZM-79, 미푸시)

## 오늘(2026-08-26) 한 것 — EC2 모니터링 소스 매트릭스
사용자 요청 "자빅스 에이전트 유무 × CloudWatch 사용 유무를 분리·고려" →
1. **설계** `devdesign_ec2-monitoring-sources.md`: 판정 단위는 인스턴스. 2×2 매트릭스(A1 agent+CW / A2 agent 단독=이상형 / B1 CW 단독=현행 / B2 밴드만). 우선순위 `zabbix-agent > cloudwatch > 밴드만`.
2. **코덱스 설계 검토**를 `codex exec --sandbox read-only`로 직접 수령 → §8 반영(품질 게이트 후 CW 중단, ENI 전체 주소, AGENT 인터페이스만, 시스템 컨텍스트 캐시, 리전 단위 거부 캐시, 커버리지 4값).
3. **구현**: `Ec2ZabbixMatcher`(INSTANCE_ID_EXACT > IP_EXACT, 유일 히트만) · `CloudWatchAvailability`(리전 거부 캐시·예산) · `CloudMetricsService` 소스 선택기 · `/ec2s monitoredBy` · overview `monitoringCoverage` · FE 배지/메모리 차트/컬럼/카드.
4. **코덱스 코드 검수 4라운드** — 결함 8+2+1+2 전부 반영 후 커밋(아래 교훈).

## 핵심 결정 (Decisions)
- **과금 0이 기본선, 유료는 항목별 옵트인 + 예상 비용 고지 Modal + 공식 요금 문서 링크** (2026-08-25). 켤 만한 유료는 Cost Explorer(실청구액)·GetMetricData(플릿)뿐. 메모리/디스크·알람·1분 해상도는 Zabbix agent/자체 판정으로 무료 대체.
- **상태 이력은 CloudWatch가 아니라 자체 스냅샷(5분)** — CW엔 상태의 역사가 없고 VPC는 기본 지표 자체가 없다. CloudWatch 안 쓰는 고객도 성립해야 한다.
- **CE는 화면이 직접 부르지 않고 일 배치 적재** — 요청당 $0.01이라 비용 고정(월 <$1).
- **추정 비용 = Price List(무료) 단가 × 스냅샷 가동시간 + EBS, 온디맨드 기준 명시**(청구서와 다름 문의 방지). EC2→자산 자동 생성은 보류(Asset.source 축 파급).
- **agent 매칭은 fail-closed** — 오연결이 미연결보다 나쁘다. 양방향 유일성, 불완전 데이터로 "유일" 판정 금지, 콜드면 IP 근거 비활성. 확정 연결은 Zabbix 태그 `aws.instanceId`(필수 권장).
- **agent 매칭돼도 품질 게이트(CPU·메모리 각각 존재+30분 내) 통과 시에만 CW 중단**, 아니면 명시적 fallback(`fallbackUsed`).

## 겪은 문제 & 해결 (Troubleshooting)
- **`describeRegions(allRegions=true)`가 미옵트인 리전까지 반환** → 팬아웃 34개 중 17개 인증 실패로 헛돎(응답 15.6s). `enabledRegionNames()`(optInStatus 필터) → failedRegions 0, 6.2s. 기존 `getRegions()`는 반대로 `opt-in-not-required`만 봐 opted-in 리전 누락 → 통일.
- **AWS는 형식 틀린 ID에 `.NotFound`가 아니라 `.Malformed`** → 500 유출. 단위 테스트는 green이었고 런타임 실측(:3001 진단 인스턴스)으로만 발견.
- **CloudTrail `readOnly`는 문자열 "true"/"false"** — boolean 비교는 영원히 miss.
- **dev BE는 콘솔 로깅뿐** → 스택 확보는 `.env` export 후 `PORT=3001 bootRun` 진단 인스턴스가 정석.
- **`@Modifying` native upsert의 트랜잭션을 서비스 자기호출로 감싸면 프록시 우회** → 레포지토리 메서드에 `@Transactional`.
- **Mockito 중첩 스터빙**(외부 `when()` 진행 중 내부 mock 스터빙) → UnfinishedStubbingException. mock을 먼저 만든다. `@BeforeEach` 스텁이 static 테스트에서 미사용이면 `lenient()`.
- **병행 세션(코덱스) 충돌**: aimonitor가 V30·V31·V33·V34 선점(내 것 V32·V35), 공유 파일(locales·queryKey·SideNav·routes·EC2Dashboard·AwsServiceImpl)에 hunk 공존, `_workspace` 재편, `ba018f0`이 TriggerFormDrawer 테스트 회귀. → 커밋은 **HEAD + 내 hunk 재구성 스테이징**(스크립트) 또는 `git commit --only`, P3처럼 분리 불가면 한 커밋에 동반하고 메시지에 명시.
- **FE 빌드 깨짐** — 타 세션의 DmoveTable scroll 타입 확장이 남의 파일 `@ts-expect-error`를 unused로 만들어 `tsc && vite build` 실패. `tsc`는 `PIPESTATUS`로 실제 exit 확인.

## 코덱스 검수가 잡은 것 (4라운드) — 혼자 못 봤을 것들
1. 만료 캐시 재사용 → 오연결 (fail-closed로) 2. useip=0 DNS 호스트 ip 우연 일치 (엔진 모델 `useIp` 신설·어댑터 `useip` 전달) 3. freshness `max(cpu,memory)` → 지표별 4. stopped보다 agent 먼저 판정 5. 커버리지 예산 기준(1콜) ≠ 상세(5콜) 6. 예산 잔여 확인/증가 분리 → 동시 초과 (DB 조건부 원자 예약 `reserve`) 7. 콜드 캐시 N중 조회 (single-flight) 8. FE 문구 과장 / 2차: 월 경계 예약·반납 월 불일치(토큰), IP 역방향 유일성(EC2 주소 역색인) / 3차: 부분 리전 실패 시 불완전 색인 교체(콜드 처리) / 4차: 예외 전 clear 누락, EC2 0대=콜드 오판(warm 플래그).

## 교훈 (Lessons)
- `codex exec --sandbox read-only -`(프롬프트 파일→stdin, 레포 안에서)로 **설계·코드 검토를 세션 안에서 직접 받을 수 있다.** 한글 인자 cp949 함정 회피.
- "유일하다"는 판정은 **양방향**이어야 하고, **불완전한 데이터로는 유일을 판정하지 않는다** — 이 두 문장이 4라운드의 절반을 설명한다.
- 무과금이 "기능 축소"가 되지 않게 하는 방법 = **자체 적재(스냅샷)로 시간 축을 만든다**. CW 없이도 성립하는 기본선이 있어야 유료는 "강화"가 된다.
- 예산 가드는 "확인 후 호출"이 아니라 **선점(예약) 후 호출, 미사용 반납, 예약한 달로**.
- 런타임 실측은 단위 테스트가 못 잡는 걸 잡는다(Malformed, allRegions, readOnly 문자열, 미옵트인 리전) — 실 AWS 1콜(무료)로 확인 가능한 건 반드시 한다.

## 남은 것
- 코덱스 P3(플릿 지표) 마무리 → 통합 회귀·최종 검수 · 브라우저 확인 1회 · **agent 경로 실측**(도쿄 EC2에 agent + `aws.instanceId` 태그) · agent 네트워크/디스크 사용률(2차) · freshness 설정화 · 코덱스 잔여 V13/V17 수정 의도 확인 · 푸시

## 관련 노트
- [[projects/moveseye/2026-08-24-cloud-infra-permission]] · [[projects/moveseye/2026-08-25-zm114-error-ux]]
- 설계: `_workspace/features/cloud/aws-monitoring/devdesign_aws-status-timeline.md` · `devdesign_cloud-cost-optin.md` · `devdesign_ec2-monitoring-sources.md` · 과금 근거 `_workspace/features/cloud/aws-monitoring/reference_aws-api-cost.md`
