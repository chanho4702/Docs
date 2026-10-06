# 라이선스 로직 검수 및 개선안

- 검수: Codex, 2026-09-19.
- 기준: BE `35e9879`, FE `927f3fd`, 발급기 `dee9c16` 및 현재 작업 트리.
- 협업 상태: `SOLO-CLAUDE`. 구현 수정 없이 코드 검수·기존 테스트·격리 재현을 수행했다.
- FE의 기존 APM 변경과 발급기의 기존 문서·계약 테스트 변경은 보존했다. 고객 키·개인키·운영 DB는 열거나 변경하지 않았다.

## 결론

RS256 서명 검증, 키에 서명된 만료일, 등록용/운영 판정용 검증 분리, 상태 머신, HTTP·포트 게이트의 기본 구조는 유지할 만하다. 핵심 커널을 재작성하기보다 **일시 장애 분류, 발급 파일 무결성, AWS·배치의 게이트 누락**을 먼저 보완해야 한다.

| 번호 | 우선순위 | 발견 사항 | 검증 수준 |
|---|---|---|---|
| R1 | P1 | 라이선스 조회 장애를 INVALID로 바꿔 APM에 영구 실패 403을 반환할 수 있음 | 실제 Provider 실패 주입 + 수신 코드 추적 |
| R2 | P1 | 동일 고객·에디션·발급일의 키 파일을 재발급 시 덮어씀 | 현재 발급기 소스를 컴파일하여 격리 재현 |
| R3 | P2 | ARCHIVED에서도 AWS 외부 조회 경로가 열려 있음 | 실제 인터셉터·서비스, AWS mock 호출 검증 |
| R4 | P2 | APM 배치가 기능 구매 여부를 확인하지 않음 | 실제 스케줄러 판정 메서드 재현 |
| R5 | P2 | FE 라이선스 조회 실패를 미구매로 안내함 | 코드 경로 확인, 브라우저 장애 주입은 미수행 |

P1은 우선 수정 권고, P2는 다음 개선 배치에 포함할 항목이다. 네트워크 침투나 서명 위조를 재현한 결과는 아니다.

## R1 — DB 일시 장애와 유효하지 않은 라이선스를 구분해야 한다

근거:
- `moveseye-be-spring/src/main/java/com/dmove/moveseye/license/provider/SignedKeyLicenseProvider.java:80` — 조회 예외를 삼키고 최대 3회 재시도한 뒤 103행에서 `INVALID` 반환.
- `.../premium/apm/collector/ingest/ApmOtlpController.java:362` — `allows(APM)==false`이면 HTTP 403.
- `.../premium/apm/collector/ingest/live/LiveMetadataCache.java:88` 및 `ApmOtlpLiveController.java:41` — 같은 결과를 라이브 수신의 403으로 변환.

조건: 캐시가 없거나 60초가 지난 시점에 라이선스 행 조회만 일시 실패한다. 수신 토큰 인증/메타 캐시는 정상인 경우 다음 APM 판정까지 도달할 수 있다. DB 전체가 항상 403을 내는 것으로 일반화하면 안 된다. 토큰 조회 단계에서 먼저 실패할 수도 있다.

결과: 정상 구매 설치본이 INVALID로 보이고, 해당 요청이 403을 받으면 OTLP 클라이언트는 재시도하지 않는 실패로 처리한다. 만료에 따른 의도적인 차단과 인프라 일시 장애가 같은 결과로 합쳐진다. [OTLP 공식 명세](https://opentelemetry.io/docs/specs/otlp/#retryable-response-codes)는 HTTP 429/502/503/504를 재시도 대상으로 규정한다.

재현: repository 예외를 주입한 실제 Provider가 INVALID와 `allows(APM)=false`를 반환했다. 연속 두 번 호출하면 DB 시도는 총 6회였다. 실패 결과는 캐시하지 않아 장애 중 요청마다 동기 재시도가 반복된다. 실제 Collector의 데이터 폐기까지 실행한 E2E는 아니다.

개선:
- 서명 오류 `INVALID`, 키 없음 `NONE`, 판정 인프라 장애 `UNAVAILABLE`을 구분한다. 상태 enum 대신 별도 판정 예외/결과로 표현해도 된다.
- 권한은 열지 않은 채 수신에는 HTTP 503과 재시도 안내, UI에는 일시 장애와 재시도 버튼을 제공한다.
- 짧은 실패 재시도 간격, 동시 갱신 공유, 원인별 계측을 둔다. 마지막 정상 라이선스를 무기한 연장하지 않는다.
- 회귀 검증: 토큰 인증 성공 + 라이선스 조회 실패 → 503, 서명 오류·실제 미보유 → 기존 정책에 따른 거절, 복구 후 정상 수신.

## R2 — 재발급이 기존 키 파일과 대장 연결을 깨뜨린다

근거: `moveseye-license-issuer/src/main/java/com/dmove/moveseye/tools/license/LicenseIssuerCore.java:111`.

파일명은 `고객사_에디션_날짜.lic`이고 `Files.writeString`이 기존 파일을 덮어쓴다. 대장에는 서로 다른 jti의 행을 추가하지만 파일명은 같다. `LicenseIssuerWeb.java:166`의 다운로드도 파일명으로 찾으므로 이전 대장의 링크가 새 키를 내려준다.

재현: 격리 폴더에서 시험 키쌍을 만들고 같은 고객·STANDARD로 365일 키, 30일 키를 연속 발급했다.

```text
samePath=true, firstFileNowContainsSecondKey=true, ledgerRowsSharingPath=2
```

개선:
- 파일명에 jti를 포함하고 `CREATE_NEW`로 충돌 시 덮어쓰기를 거부한다.
- 다운로드를 발급 ID로 조회하고 대장 jti와 파일의 jti·해시를 대조한다.
- 파일 기록과 대장 기록의 중간 실패를 복구할 절차를 둔다.
- 고객명 정규화 결과가 같은 경우도 검사한다(예: 공백과 밑줄).

## R3 — ARCHIVED의 AWS 실시간 조회 차단이 빠져 있다

근거:
- `.../license/web/interceptor/AccessModeInterceptor.java:57` — READ_ONLY의 GET 허용.
- `.../aws/CloudInfraController.java:210` — `/cloud-infras/ec2/metrics`는 권한·자격증명만 확인.
- `.../aws/CloudMetricsService.java:99` — `aws.findInstance` 호출. 188행에서 CloudWatch 조회.
- `.../aws/client/AwsReadOnlyGateway.java`에는 라이선스 판정이 없다.

ARCHIVED는 DB에 저장된 데이터만 읽는 정책이지만, 기존 포트 데코레이터는 Zabbix 포트만 보호한다. AWS 직접 호출은 이 경계를 지나지 않는다. `tryAgentSeries`는 라이선스 차단 예외도 일반 예외로 잡아 CloudWatch fallback으로 진행할 수 있다.

재현: ARCHIVED Provider로 실제 GET 인터셉터가 통과했고, 실제 CloudMetricsService에서 mock AWS gateway의 `findInstance` 호출을 확인했다. 실제 AWS API 호출·비용 발생은 없다.

개선:
- 외부 조회 경계에서 `allowsLiveQuery()`를 공통 강제한다. 모든 AWS GET을 일괄 차단하지 말고 DB snapshot 조회와 외부 실조회 경로를 구분한다.
- 라이선스 차단 예외를 다른 공급자로 fallback하는 장애로 해석하지 않는다.
- 회귀 검증: EXPIRED 실조회 허용, ARCHIVED gateway 호출 0회, ARCHIVED DB snapshot 조회 허용.

## R4 — STANDARD로 바꿔도 APM 알람 배치가 허용된다

근거:
- `.../scheduler/SchedulerManager.java:191` — `requiresActiveLicense`와 `status.canWrite()`만 검사.
- `.../scheduler/SchedulerJob.java` — 필요한 Feature를 표현하는 계약 없음.
- `.../premium/apm/alert/evaluate/ApmAlertEvaluationJob.java:69`, `.../alert/sync/ApmAlertSyncJob.java:57` — 각각 evaluateAll/syncAll로 직접 진입하며 별도 APM 보유 검사 없음.

조건: PREMIUM 또는 STANDARD+APM으로 설정한 알람 규칙이 남은 상태에서 APM 없는 활성 STANDARD 키로 교체한다. HTTP APM 화면·수신은 막혀도 배치는 FULL만 보고 허용한다. 기존 규칙의 평가·Zabbix 동기화가 계속 실행될 수 있다. 원본 수집이 멈추므로 모든 알람이 지속적으로 발생한다는 뜻은 아니다.

재현: `STANDARD/ACTIVE/features=[]`에서 실제 `isBlockedByLicense(ApmAlertEvaluationJob)`는 false, `allows(APM)`는 false였다.

개선:
- 배치 계약에 `requiredFeature()` 등을 추가해 APM 동작 배치를 검사한다.
- retention·rollup·기존 자료 보존을 위한 파생 계산은 현재 의도대로 계속 허용한다. 모든 APM 배치를 차단하면 원본 삭제와 롤업 사이에 자료 손실이 생긴다.
- PREMIUM→STANDARD 교체 회귀 테스트와 premium SchedulerJob의 기능 판정 구조 검사를 추가한다.

## R5 — 상태 조회 실패가 구매 안내로 표시된다

근거:
- `moveseyee_fe/src/hooks/useLicense.ts` — `isError`를 반환하지만 데이터 없으면 기능 목록은 빈 배열.
- `.../components/license/FeatureGate.tsx:29` — isLoading과 allowsFeature만 확인.
- `.../components/license/UpsellPanel.tsx:35` — has/isReadOnly가 false이면 구매 문구 선택.
- `.../routes/PageWrapper.tsx:81` — 라이선스의 isError는 소비하지 않음.

초기 `/features` 요청 실패 후 캐시가 없으면 정상 고객도 미구매 안내를 본다. 서버 게이트 우회는 아니지만, 장애를 구매 문제로 오인하게 만든다.

개선: 로딩 / 조회 실패 / 실제 미구매 / 만료를 분리한다. 실패에는 재시도를 제공하고 구매 여부를 단정하지 않는다. 기존 캐시가 있는 상태에서 재조회 실패했을 때의 표시 정책도 명시한다.

## 정책·운영 개선 제안 — 위 결함과 구분

1. **시작일 의미 명확화.** startsAt은 지금 사용 개시 제한이 아니라 만료일 계산·표시용이다. 미래 시작 키도 등록 즉시 열린다. 의도된 정책을 유지한다면 필드·화면 명칭을 분명히 하고, 실제 개시 제한이 필요하면 예약 등록/PENDING과 기존 키 교체 시점을 함께 설계한다.
2. **호스트 수 과금 여부.** maxHosts는 보존만 하고 강제하지 않는 명시적 정책이다. APM 서비스·인스턴스·수집량 단위 제한도 현재 커널에는 없다. 상품 모델 확정 전 이를 구현 결함으로 취급하지 않는다.
3. **만료 후 APM 과거 자료 접근.** 현재 premium은 EXPIRED부터 조회도 차단한다. STANDARD의 과거 자료 열람 보장과 구분해 안내해야 한다. 과거 APM 조회·내보내기를 보장하려면 수집/분석/내보내기를 별도 권한으로 나누는 정책 변경이 필요하다.
4. **다중 BE 반영 시간.** 등록·해지 이벤트는 JVM 내부이므로 다른 노드는 최대 60초 뒤 반영된다. 전체 노드 즉시 해지가 필요하면 공유 세대 번호/무효화 전달을 추가하고 두 노드 검증을 한다.
5. **발급 키 운영.** 운영용 개인키의 관리 주체·백업·롤오버·유출 시 폐기 절차를 명문화한다. 다중 공개키 슬롯은 정상 교체에는 유용하지만 유출된 구 키를 계속 신뢰하면 위조 발급도 계속 인정된다. 현 개인키나 백업 상태는 이번에 열람하지 않았다.
6. **감사 이력·갱신 UX.** 해지 행위자는 현재 로그에만 남고 DB에는 revoked_at만 있다. revoked_by/사유, 갱신 전후 기능 차이·기간 단축 경고·등록 이력 화면을 권고한다. 동시 등록/해지는 단일 활성 행 제약만 믿지 말고 충돌 응답/직렬화 정책과 테스트를 둔다.
7. **문서 정본 동기화.** `_workspace/designs/devdesign_premium-edition.md`의 요약·P12에는 아직 등록일부터 기간 계산이라는 이전 정책이 남아 있다. 발급기 CLAUDE.md와 LicenseType/LicenseRepository 주석에도 이전 설명이 있다. 현재 키 만료일 정본과 시작일 비강제를 기준으로 정리한다.
8. **계약 검증 강화.** 양쪽 enum·상수의 독립 테스트 외에, 시험 키쌍으로 발급기 산출물을 실제 BE verifier에 넣는 round-trip 테스트를 둔다. graceDays 범위·시각 관계·지원하지 않는 클레임도 검증한다.

## 검증 결과와 한계

- BE: LicenseKeyVerifierTest 11, SignedKeyLicenseProviderTest 15, LiveLicenseFreshnessTest 7, LicenseContractTest 4, LicenseArchitectureTest 7, LicenseGuardedPortTest 8 — **52건 성공**.
- FE: licenseGate / licenseGateWatcher / licenseMenuLock / LicenseSettingsPages — **4 suite, 34건 성공**.
- 격리 재현: [IssuerCollisionProbe.java](../verification/license-review-20260919/IssuerCollisionProbe.java), [LicenseBoundaryProbe.java](../verification/license-review-20260919/LicenseBoundaryProbe.java).
- 기존 테스트가 모두 통과해도 AWS 직접 호출·STANDARD로 교체한 premium 배치·발급 파일 충돌은 검사 범위 밖이다.
- 처음 BE 테스트는 샌드박스 네트워크 제한으로 실패했다. 승인 후 의존성을 내려받아 root 테스트가 성공했다. `test --tests`가 하위 engine-zabbix에도 적용되어 해당 모듈의 테스트 없음 오류가 났으므로, 범위를 `:test`로 수정해 최종 BUILD SUCCESSFUL을 확인했다.
- 재현용 JVM은 로컬 캐시 jar를 넓게 모아 실행해 로깅 바인딩 경고가 있었다. 재현 assertion은 모두 통과했다. 정식 회귀 테스트는 Gradle의 정규 classpath에 편입해야 한다.
- 이번에 미수행: 라이선스 등록·해지 DB 통합 테스트, 실제 Collector 손실/복구 E2E, AWS 실호출, 다중 노드 무효화 E2E, 브라우저 네트워크 장애 주입.
- 제품 코드 수정·서버 재시작·라이선스 교체·배포는 하지 않았다.

## 권장 처리 순서

1. R1과 R2 수정 및 회귀 테스트.
2. R3·R4 외부 호출/배치 경계 통일.
3. R5 장애 UX와 문서 정본 정리.
4. 시작일·만료 후 APM 열람·과금 단위의 상품 정책 결정 후 필요한 기능 확장.
