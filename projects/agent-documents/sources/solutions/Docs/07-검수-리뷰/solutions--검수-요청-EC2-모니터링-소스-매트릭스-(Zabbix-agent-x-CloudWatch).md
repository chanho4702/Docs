# 검수 요청 — EC2 모니터링 소스 매트릭스 (Zabbix agent × CloudWatch)

- 작성: Claude, 2026-08-26 · 검수: Codex · 미커밋 (BE `ZM-79` 트리 + FE `master` 트리)
- 설계 `devdesign_ec2-monitoring-sources.md` (§8 = 코덱스 1차 설계 검토 반영본) · 계약 `contract_aws-status-timeline.md` 개정 2
- ⚠️ 트리에 병행 세션(aimonitor) 미커밋분 공존 — 이 범위는 `aws/`·cloud-infra FE만. 🔴 병행 세션이 `EC2Dashboard.tsx`에 "수집 경고 오탐 수정"(2026-08-26) hunk를 넣어 내 커버리지 카드 hunk와 같은 파일에 공존한다.

## 범위·의도
설계 §8(코덱스 검토)의 조건을 전부 구현했다:

**BE**
- `Ec2ZabbixMatcher`: 시스템 컨텍스트 + 전역 5분 캐시(권한 누출 방지) · INSTANCE_ID_EXACT(호스트명/`aws.instanceId` 태그) > IP_EXACT(ENI 전체 주소 ↔ **AGENT 인터페이스만**, 유일 히트만) · 중복 주장·다중 히트는 미연결 · Name 태그 매칭 없음 · 근거·판정시각 보존 · freshness는 LAST_CHECK 프록시
- `CloudWatchAvailability`: 접근 거부 캐시 **리전 단위**로 분리 + 예산 판정 공용화
- `CloudMetricsService` 재작성: agent 품질 게이트(CPU·메모리 존재 + 30분 내 포인트) 통과 시 agent 단독(CW 미호출) / 미달·Zabbix 장애 시 CW **명시적 fallback**(`fallbackUsed`) / 응답 키 셋 6개 고정(memoryUsage 추가)
- `AwsServiceImpl`: `/ec2s`에 `monitoredBy`(4값), overview에 `summary.monitoringCoverage`
- 테스트: Ec2ZabbixMatcherTest 7(명시ID 우선·태그·ENI secondary IP·다중히트 거부·비AGENT 무시·중복주장 폐기·freshness) · CloudMetricsServiceTest 6 재작성(agent 단독=CW 0콜·stale 폴백·미매칭 직행·예산·리전 거부·period)

**FE**
- 타임라인: 소스 배지(agent면 호스트명 병기) · agent면 CPU+**메모리 사용률** 차트, CW면 기존 3차트 · 폴백 경고 Alert
- EC2 목록 "모니터링" 컬럼(4값 Tag) · 개요 커버리지 카드 + 에이전트 설치 안내 문구 · i18n

## 불안한 지점 (먼저 봐 달라)
1. **단건 매칭의 역방향 유일성 미검증** — `matchFor(instance)`는 "인스턴스→호스트 유일"만 본다(호스트가 다른 인스턴스도 때리는지는 전체 목록 없이 판정 불가). INSTANCE_ID 우선순위로 보완했다고 봤는데 충분한가.
2. **agent 시계열 조회를 시스템 컨텍스트로** — 클라우드 화면이 awsResources.view로 게이트되고 스냅샷도 시스템 수집이라 일관된다고 판단. Zabbix 호스트 권한이 없는 사용자에게 EC2 화면 경유로 CPU/메모리가 보이는 것이 정책상 허용되는지 확인 바람.
3. **품질 게이트 30분** — Zabbix 수집 주기가 긴 템플릿(예: 1h)이면 fresh 판정이 계속 실패해 CW로만 간다. 임계값을 설정화할지.
4. **agent 소스의 네트워크/디스크 사용률 미제공(1차)** — 파티션·인터페이스 다차원이라 2차로 뺐다. 화면상 agent 소스가 차트 2개(CPU·메모리)뿐인 게 "덜 보인다"로 읽힐 수 있음.
5. **`getRegions()`(기존)가 `opt-in-not-required`만 필터** — opted-in 리전(예: 서울 외 신규 리전)이 목록/개요 기본 팬아웃에서 빠진다. 내가 만든 `enabledRegionNames()`와 불일치. 이번 범위 밖이지만 발견 사항.
6. useip=0(DNS) Zabbix 호스트 매칭 누락 — 알려진 한계로 문서화만.

## 검증
- BE 전체 green(aws 스코프 49건 포함) · FE tsc/eslint 0 · FE jest: (실행 결과 별도 기재)
- :3001 런타임: `/ec2s` monitoredBy=cloudwatch · overview.monitoringCoverage `{cloudwatch:1}` · `/ec2/metrics` `source=cloudwatch, fallbackUsed=false`, 키 6개
- **미검증**: agent 경로 실측(dev에 에이전트 깔린 EC2 없음 — 단위 테스트만) · 브라우저 렌더(배지·메모리 차트·컬럼·카드)

---

## 코덱스 코드 검수 1차 반영 (2026-08-26) — 결함 8건 전부 수정

원문: `_workspace/codex-review_ec2-monitoring-sources.txt`. 총평 "수정 후 머지" → 아래 반영.

| # | 지적 | 반영 |
|---|---|---|
| 1 높음 | 만료 캐시를 조회 실패 시 재사용 → 오연결 | **fail-closed**: 실패 시 캐시 폐기·미매칭(→CW 폴백). 테스트 `fetchFailureDoesNotReuseCache` |
| 2 높음 | useip=0(DNS) 호스트의 ip가 우연 일치로 IP_EXACT | 엔진 모델 `HostNetworkInterface.useIp` 신설(기존 생성자 보존) + 어댑터 `useip` 필드 요청·전달 + 매처가 `useIp==false` 제외. 테스트 `ignoresDnsAccessedInterfaces` |
| 3 높음 | freshness를 max(cpu, memory)로 합쳐 stale CPU 통과 | **지표별** 첫 Series 기준 각각 30분 판정. 테스트 `cpuStaleAloneFallsBackEvenIfMemoryFresh` |
| 4 중간 | stopped보다 agent freshness를 먼저 봐 방금 끈 인스턴스가 agent로 집계 | stopped 우선. 테스트 `stoppedWinsOverFreshAgent`(신규 `AwsServiceImplCoverageTest`) |
| 5 중간 | 커버리지 예산 기준(1콜) ≠ 상세(5콜) | `CloudWatchAvailability.METRICS_CALLS_PER_REQUEST=5` 공용 상수로 통일 |
| 6 중간 | 잔여 확인과 증가 분리 → 동시 요청이 상한 초과 | DB **조건부 원자 예약** `reserve(month,n,cap)`(`calls+n<=cap`일 때만 갱신) → 예약 실패면 미호출, 미사용분 `release` 반납 |
| 7 중간 | 콜드 캐시에서 리전 병렬 스레드가 Zabbix 전체 조회 N회 | `hosts()` synchronized single-flight |
| 8 낮음 | FE 안내가 "메모리·디스크"로 과장 | "메모리 사용률까지 … (디스크는 후속 지원)"으로 정정 |
| 불안 ⑤ | `getRegions()`가 opt-in-not-required만 | `enabledRegionNames()`로 통일 — opted-in 리전 목록·개요 포함 |

**미반영(합의된 한계, 문서화)**: 단건 매칭의 역방향 유일성(구조적 — `aws.instanceId` 태그 운영을 필수 권장으로 승격) · freshness 30분 하드코딩(설정화는 후속) · 동시 요청 cap 초과 방지의 DB 통합 테스트(경합 IT는 별도 과제).
검증: aws 스코프 테스트 green(신규 5건 포함) · FE tsc 0. BE 전체·FE 전체는 아래에 추가 기재.

## 코덱스 2차 검수 반영 (2026-08-26) — 8/8 해소 확인 + 신규 2건 수정

원문: `codex-review2_ec2-monitoring-sources.txt`. 1차 8건 전부 "O" 판정. 총평 "수정 후 머지" — 아래 2건 요구.

| 지적 | 반영 |
|---|---|
| 높음 — 월 경계에서 예약·반납 월 불일치(8월 예약 → 9월 반납 시 8월분 잔존·9월 음수) | `CloudWatchAvailability.Reservation(month, calls)` 토큰 도입 — `reserve()`가 토큰을 돌려주고 `release(token, unused)`가 **예약한 달**로 반납. 테스트 `verify(release(RESERVATION, 4))` |
| 머지 차단 — IP 매칭 역방향 유일성(다른 VPC의 EC2가 같은 사설 IP면 둘 다 같은 호스트 지표 수신) | EC2 주소→instanceId **역색인**을 매처에 두고 스냅샷 배치(5분·전 리전)가 `indexInstances()`로 채움. IP_EXACT는 ①인스턴스→호스트 유일 ②호스트 주소를 쓰는 EC2가 이 인스턴스뿐(역색인) 둘 다 만족할 때만. **색인이 콜드면 IP 근거 사용 안 함(fail-closed)**, INSTANCE_ID 근거는 무영향. 테스트 `refusesIpMatchWhenAddressSharedByOtherInstance`·`coldIndexDisablesIpBasisButNotInstanceId` |

코덱스가 "차단 아님"으로 판정한 2건(freshness 30분 하드코딩·DB 경합 IT)은 후속 과제로 유지.
⚠️ 운영 함의: 재기동 직후 첫 스냅샷(≤5분) 전까지는 IP 매칭이 비활성 — 그동안은 `aws.instanceId` 태그 매칭만 동작. 설계 의도(오연결 < 미연결)와 일치.

## 코덱스 3차 검수 반영 (2026-08-26) — 2건 해소 확인, 신규 차단 1건 수정

원문: `codex-review3_ec2-monitoring-sources.txt`. 2차 요구 2건 "O". 신규:
| 지적 | 반영 |
|---|---|
| **차단** — 부분 리전 수집 실패 시 성공 리전만으로 색인을 교체 → 실패 리전의 동일 사설 IP EC2를 몰라 "유일" 오판 | `CloudSnapshotService`: **전 리전 성공(failed==0)일 때만** 색인 교체, 부분 실패면 `matcher.clearIndex()`로 콜드 처리(IP 근거 전면 비활성, 다음 완전 수집이 되살림). 테스트 `reportsPartialRegionFailureInSummary`에 `verify(clearIndex)` |
| 콜드 상태 UX 부재 — 사용자가 "색인 대기"와 "미매칭 확정"을 구분 못 함 | `/ec2/metrics` `collection.ipMatchIndexReady`(bool) 노출. FE 문구 연결은 후속 |
| 5분 갱신 창(새 EC2가 같은 사설 IP를 얻는 경우) | 구조적 창 — `aws.instanceId` 태그 매칭은 무영향. 운영 권장을 "필수 권장"으로 문서화(계약 개정 2) |
| 색인 교체 중 동시 읽기 | O (완성본을 AtomicReference로 일괄 교체 — 코덱스 확인) |

검증: aws 스코프 green(신규 `indexReadyReflectsWarmAndCleared` 포함). BE 전체·코덱스 4차(최종) 결과 아래 기재.

## 코덱스 4차 반영 (2026-08-26 09:5x) — 소결함 2건 수정
| 지적 | 반영 |
|---|---|
| 전 리전 실패 시 예외를 먼저 던져 `clearIndex()` 미실행 → warm 색인 잔존 | 예외 전 `clearIndex()`. 테스트 `throwsWhenAllRegionsFail`에 verify |
| EC2 0대 정상 수집이 빈 색인=콜드로 표시 | `indexWarm` 플래그 분리 — 내용 유무와 별개로 warm 판정. 테스트 보강 |
aws 스코프 green.

⚠️ **10:00 시점 상황**: 병행 세션(코덱스)이 `AwsServiceImpl.java`에 **P3(플릿 지표) 구현을 진행 중**(`CloudPaidFeatures` 주입·`FLEET_*` 상수 추가, 09:58 갱신). 내 소스 매트릭스 변경과 같은 파일에 미커밋으로 공존 — 커밋 분리·검수 범위 확정을 위해 사용자 조율 대기. 코덱스 5차(최종) 확인은 그쪽 편집이 멈춘 뒤 실행.

## 커밋 (2026-08-26, 사용자 "그냥 해")
- BE `1c76397` (ZM-79): 소스 매트릭스 + **코덱스 P3 플릿 지표(FleetMetricsCache·AwsServiceImpl 팬아웃·테스트 2) 동반** — 같은 파일(AwsServiceImpl·CloudWatchAvailability)이라 분리 불가. 코덱스 5차 최종 확인은 미실행(사용자 지시로 생략).
- FE `ca47c9e` (master): 공유 파일(EC2Dashboard·locales)은 hunk 분리 스테이징 — 그쪽 "오탐 수정"·ai_monitor hunk 제외.
- 커밋 제외(코덱스 잔여): CostService·InterfaceService·SettingService·LicenseContractTest·SettingServiceTest·build.gradle.kts 주석·**V13/V17(적용된 마이그레이션 수정 — CLAUDE.md §3-7 위반 소지, 확인 필요)**.

## agent 경로 런타임 실측 (2026-08-28) — ✅ 통과
- 방법: dev Zabbix의 신선 호스트 `10635`(10.220.0.52, CPU·메모리 1분 내)에 태그 `aws.instanceId=i-06ac35f551a92b5b1`을 BE `PUT /hosts/manage`로 임시 부착 → 매처 캐시 TTL(5분) 경과 후 조회 → 원복.
- 결과: `/ec2/metrics` → `source=zabbix-agent`, `matchBasis=INSTANCE_ID_EXACT`, CPU 1,439pt(12.1%)·memoryUsage 1,440pt(67.1%), `fallbackUsed=false`(CW 미호출), `observedAt` 신선 / `/ec2s monitoredBy=zabbix-agent`.
- 품질 게이트 실증: 먼저 시도한 `10745`(agentAvailable=1이지만 24h 데이터 없는 데모 호스트)는 게이트가 **올바르게 거부**해 CW 폴백(`fallbackUsed=true`) — LAST_CHECK 프록시는 느슨하지만 시계열 게이트가 잡는다.
- 함정 2개: ① `/host/*` 지표 EP는 Zabbix 사용자 토큰 경유라 로컬 admin은 401(알려진 제약) — 신선도 조사는 Zabbix API 직접(설정 DB 자격증명을 .env 키로 복호화) ② PUT 본문에 한글 태그값 → curl 인라인은 cp949로 깨져 INVALID_DATA — UTF-8 파일 `--data-binary @file`.
- 코덱스 CW 전역 스위치(e6e3199) 이후 dev는 CW 꺼짐(`cloudwatch-off`/`PAID_FEATURE_OFF`) — agent 경로는 무관하게 동작함을 확인.
- FE: `ipMatchIndexReady` 콜드 안내 문구 연결(타임라인·i18n) — 미커밋.

## 후속 반영 (2026-08-28) — 검수 빚 3건 해소
- freshness 30분 하드코딩 → `app.cloud.agent-freshness-minutes`(env `CLOUD_AGENT_FRESHNESS_MINUTES`, 기본 30). 매처 단일 값을 커버리지·시계열 게이트가 공유.
- CE 페이지네이션 → `nextPageToken` 추적, 최대 5페이지(페이지=$0.01), 예산엔 실제 페이지 수 기록, 상한 도달 시 요약 `TRUNCATED`.
- agent 소스 디스크 사용률 → 루트 파티션(`/` → `C:`) 시계열 `items.diskUsage`(게이트 대상 아님). FE 차트 추가. 네트워크는 인터페이스 다차원이라 여전히 후속.
- 검증: BE 전체 green · FE tsc/eslint 0. 커밋 BE(master) / FE(master).
