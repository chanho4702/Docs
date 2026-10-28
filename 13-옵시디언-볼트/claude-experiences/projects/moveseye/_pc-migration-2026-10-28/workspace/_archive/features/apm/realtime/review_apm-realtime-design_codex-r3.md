# APM P5 설계 3회차 본판정

**결론: v3 그대로의 API 계약 확정에는 동의하지 않는다. 아래 필수 정정을 반영하면 P5.1 본 구현은 착수할 수 있으며, R2′ 격리 재측은 출시 게이트로 유지한다.**

- **R2-1 CPU는 이번 시험의 FAIL로 유지한다.** 다만 제품의 CPU 증가율이 49%라는 인과적 결론은 확정하지 않는다.
- **R2-8은 저장 분기로 중복 전송을 유발하는 설계 결함으로 확정한다.** “DB에 26,769건 중복 저장”까지 실증한 것은 아니다.
- 가장 큰 미해결 사항은 **`ignore` 이후의 PII 통과 방지·감시**와 **1,000스팬이면 본문 상한을 만족한다는 미증명 가정**이다.

파일·보존 로그·공식 소스를 읽었으며, 파일 수정과 테스트 실행은 하지 않았다.

## 1. 실측의 타당성

### 1.1 사전 고정 합격선과 실행 절차

**수치 합격선을 결과에 맞춰 완화하지 않은 점은 타당하다. 그러나 사전 계약을 완전히 준수한 시험은 아니다.**

| 검토점 | 판정 |
|---|---|
| 합격선 사전 고정 | 보고서 §0의 수치 기준은 유지됐다. 다만 최초 고정 시점의 commit 등 독립적인 이력 증거까지 확인한 것은 아니다. |
| 반복·시간 축소 | 사전 공개는 적절하다. 공개했다고 `10분 × 3회`와 동등해지는 것은 아니다. |
| v1→H3→v2 원문 재측정 | 탐색과 결함 발견 절차로 유효하다. **서로 다른 YAML의 PASS를 합쳐 v3 PASS로 만들 수는 없다.** |
| BSP 하네스 결함 자진 신고 | 원인 공개와 재측정은 적절하다. 하지만 영향 범위 정리가 불완전하다. 585ms는 계속 인용되고, 수정 하네스도 실제 SDK와 동일하지 않다. |
| 비격리 호스트·OFF 편차 39% | CPU·지연·도달 부하의 일반화를 크게 제한한다. PII 원문 통과나 재전송 발생 같은 직접 관측까지 무효화하지는 않는다. |
| 최대 약 600 SERVER/s | 그 환경의 관측 범위다. L2·L3 지원 성능이나 실제 앱·BE·화면의 종단 성능을 입증하지 않는다. |

보존 하네스에서 추가로 확인한 제한은 다음과 같다.

1. **CPU 측정 구간이 정상 부하 구간만은 아니다.** `ab.sh`는 계측 시작 후 무부하 준비 20초, 부하 240초, drain 60초를 수행하고, `abreport.py`는 전체 처음·마지막 CPU 표본을 사용한다.
2. **저장 처리량 1.003의 분모가 기대 저장 대상 집합이 아니다.** 계산은 `proxy 도착 스팬 수 / 생성 SERVER 수`다. 동일한 논리 trace 집합의 저장 결과 대조를 대체하지 못한다.
3. **저장 지연은 `completion→proxy arrival`이다.** BE 수용·commit까지의 지연이 아니다. 서로 다른 집계의 p95를 더해서 보정할 수도 없다.
4. 수정된 `gen4.mjs`도 단일 큐에서 **동시 export 8개**를 허용한다. BSP 규격은 동일 processor의 export 호출을 직렬화하도록 요구한다. 따라서 “규격 준수 SDK 재측”이라는 표현은 과하다. [공식 BSP 규격](https://opentelemetry.io/docs/specs/otel/trace/sdk/#batching-processor)

### 1.2 R1 10항목

‘신뢰’는 **해당 관측이 판정 범위를 얼마나 뒷받침하는지**를 뜻한다.

| 항목 | 실측 판정 | 신뢰 | 근거 |
|---|---|---|---|
| R1-1 분기 정확성 | PASS → 설정별 제한적 PASS | 중간 | H3 장시간 결과와 v2 원문의 HTTP·RPC·구형 semconv 결과는 다른 설정이다. 각각의 fixture 결과는 유효하지만 합친 v3는 미실행이다. |
| R1-2 PII 제거 | v2 FAIL / H3 PASS | 높음: 발견한 유출·해당 fixture | v2의 4종 유출은 확정이다. H3의 13개 주입 위치 제거도 유효하다. 비문자형 값·절단 경계·다른 값 형태까지 안전하다는 증명은 아니다. |
| R1-3 정상 유실 | PASS → H3 관측 구간 PASS | 중간 | 10분 347,830건의 대조는 유효하다. 짧은 추가 실행을 합친 “반복 4회”는 동등한 10분 반복 4회가 아니다. SDK 이전 손실과 v3 결과는 별도다. |
| R1-4 집계 정확성 | 미측정 | 해당 없음 | 실제 BE 집계가 없다. |
| R1-5 표본 분리 | 미측정 | 해당 없음 | 집계·reservoir·arena를 함께 검증하지 않았다. |
| R1-6 TTL 영향 | 미측정 | 해당 없음 | 메타 캐시·갱신·회수 경로가 없다. |
| R1-7 지연 | 완료→링 PASS → **캡처 도착 관측으로 정정** | 낮음: 계약 충족 / 중간: 전송 관측 | 링이 없으며, 585ms는 빠른 강제 flush 하네스의 결과다. 수정 BSP 결과도 캡처까지다. 실제 링·SSE·화면 지연은 미측정이다. |
| R1-8 늦은 도착·중복 | 미측정 | 해당 없음 | 버킷 귀속·60초 dedup·늦은 수정 전달을 검증하지 않았다. |
| R1-9 부분 성공 | exporter 측 PASS / BE 미측정 | 높음: exporter 동작 | 유효 partialSuccess를 성공으로 처리하고 재전송하지 않는 관측은 유효하다. BE 보존식은 미측정이며 WARN 119건과 응답 건수 차이는 정산해야 한다. |
| R1-10 URL·본문 상한 | 부분 PASS → **기존 최대 크기 가정 FAIL 포함** | 높음: 초과 사례 / 낮음: 새 상한 보장 | 목적 경로·gzip은 확인됐다. 최악 2,000스팬 2.11MiB가 기존 가정을 반증한다. §15의 0.85MiB만으로 설명하면 안 된다. 새 1,000스팬과 실제 413 경계는 미측정이다. |

### 1.3 R2 10항목

| 항목 | 실측 판정 | 신뢰 | 근거 |
|---|---|---|---|
| R2-1 CPU | **FAIL 유지** | 중간: 시험 실패 / 낮음: 정확한 증가율 | 1.49는 기준 1.20을 넘는다. ON은 두 OFF보다 모두 높다. 다만 비격리·부하 차이·측정 구간 혼합 때문에 제품의 인과적 증가율은 확정할 수 없다. |
| R2-2 RSS | PASS → 관측 구간 PASS | 중간 | 비율 약 1.057, peak 284MB는 관측 사실이다. L2·L3·최악 입력·v3 조합까지 일반화할 수 없다. |
| R2-3 저장 처리량 | PASS → **계약 기준 미입증** | 낮음 | proxy 도착량/SERVER 생성량 비율이다. 기대 저장 ID 집합 및 실제 DB·집계 결과와 대조하지 않았다. |
| R2-4 저장 지연 | PASS → **계약 기준 미측정** | 낮음 | +433ms는 proxy 도착 지연이다. 사전 계약의 저장 수용/commit 지연과 측정 지점이 다르다. |
| R2-5 무응답 | PASS → 부분 PASS | 중간 | timeout·큐 포화·실패 계수·retry OFF는 확인됐다. 저장 완료 성능·정확성은 R2-3·4의 제한을 그대로 받는다. |
| R2-6 HTTP 거절 | PASS → 부분 PASS | 중간 | 429·503·partialSuccess 동작은 유효하다. 고정 12건 거절은 **전량 metadata 거절** fixture를 대체하지 않는다. |
| R2-7 연결 거부·reset | PASS → 부분 PASS | 중간 이하 | 하네스의 `refuse`는 연결을 받은 뒤 socket을 끊는 형태다. 실제 연결 거부와 전송 중 reset을 각각 입증해야 한다. consumers 2의 in-flight 상한도 미측정이다. |
| R2-8 transform 실패 | **FAIL 유지** | 높음: 중복 전송 원인 | `propagate`→receiver 오류→SDK 재전송→저장 분기 중복 도착의 대조실험이 있다. DB 중복 행 발생 여부와는 구분한다. |
| R2-9 메모리 압박 | PASS → **요구 프로필 미측정** | 낮음 | RSS 250~290MB와 OOM 0은 유효하다. 지원 부하에서 backlog·큰 속성·오류 100%를 결합한 압박 시험은 아니다. |
| R2-10 복구·freshness | 부분 PASS → 큐 복구 일부 확인 | 낮음~중간 | 큐 복구는 관측됐다. 장애 전 RSS 범위로 60초 내 복귀했다는 충분한 추적과 BE freshness 검증은 없다. |

따라서 **“R2의 나머지 8항목 PASS”는 철회해야 한다.** 정확한 요약은 **“2건 FAIL, 나머지는 제한된 관측 PASS·부분 PASS·미입증이 섞여 있음”**이다.

### 1.4 CPU FAIL과 propagate 결함의 최종 해석

#### CPU: FAIL을 지우지 않는다

이번 결과는 다음 두 문장으로 기록하는 것이 맞다.

> 이번 비격리 시험은 CPU 합격선을 충족하지 못했다.  
> 격리된 지원 환경에서의 CPU 증가율과 합격 여부는 아직 확정되지 않았다.

“노이즈가 있으니 PASS일 수도 있다”는 사후 면제는 허용하지 않는다. 반대로 **“방향까지 인과적으로 확정됐다”**고 쓰는 것도 과하다. R2′가 실패할 것이라고 미리 판정하지 않는다.

#### propagate: 중복 전송 결함은 확정, DB 중복은 미입증

`35,692 = 8,923 × 4`, 추가 도착 `26,769 = 8,923 × 3`은 해당 SDK 재시도 3회 정책에서 발생한 결과다. **300%는 그 fixture의 결과이지 일반적인 운영 중복률이 아니다.**

또한 현재 [ApmSpanStore](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSpanStore.java:62)는 `ON CONFLICT DO NOTHING`을 사용하고, [ApmTraceWriter](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmTraceWriter.java:143)는 이미 저장된 논리 span ID를 걸러낸다. 실측 QA jar와 현재 코드의 동일성도 별도로 확인해야 한다.

따라서 결함 명칭은 **“라이브 processor 오류의 상류 전파에 따른 저장 분기 중복 전송”**으로 정정한다. 이 결함만으로도 현재 동기 분기에서 `propagate`를 제거할 근거는 충분하다.

## 2. v3 P0 7건 반영 판정

번호는 Claude 회신 §2의 일곱 결정 순서다.

| # | v3 반영 | 판정(✅/🟡/🔴) | 대안 |
|---|---|---|---|
| 1 | `propagate`→`ignore` + 카나리아 + 자기 메트릭 | 🔴 | 변경 방향은 동의한다. 그러나 exporter 카운터는 OTTL 실패를 세지 않는다. 정확한 WARN 감시와 전체 정리 후조건 검사, **안전한 형태가 아니면 live 전송 전에 차단하는 경로**를 추가해야 한다. |
| 2 | 정규화·필터·4개 정리 문장·redaction 결합 | 🟡 | 결합 YAML을 새 시험 대상으로 취급한다. 허용 값의 타입·길이·절단 경계, resource/scope, 정상 식별자 보존까지 재검증한다. |
| 3 | batch 최대 2,000→1,000, BE도 1,000 | 🔴 | 1.06MiB는 외삽이며 전송 최대의 증명이 아니다. **Collector 측 모든 잔존 필드·타입·그룹 수를 제한한 직렬화 상한** 또는 직렬화 바이트 기준 분할을 먼저 정의한다. |
| 4 | 3개 OS 실행 명령에 gate + 경고 + 카나리아 | 🟡 | 신규 설치뿐 아니라 기존 서비스 실행 명령의 갱신·재시작 확인을 포함한다. 문자열 검사에 더해 실제 시작 명령으로 생성 YAML을 구동하는 회귀가 필요하다. |
| 5 | SecurityConfig permitAll + 전용 guard | ✅ | 설계 방향에 동의한다. 세션 없이 수신 토큰으로 통과하고, 실패 시 실제 OTLP 상태 코드·본문을 반환하도록 검증한다. |
| 6 | BSP 1,000ms를 저트래픽 필수로 승격 | 🟡 | **P5 권장 지연 프로필의 설정 요건**으로 채택한다. “고트래픽 무관”, “실 SDK 드롭 입증”, “약 2초 보장”은 R7 전에는 확정하지 않는다. |
| 7 | 해제 후 2MB + 압축본 512KB | 🟡 | 두 독립 상한은 채택한다. 정확한 바이트 값과 무압축 요청 정책을 고정하고, 압축률이 낮은 유효 입력까지 검증한다. 평균 압축률을 최대 보장의 근거로 사용하지 않는다. |

### 2.1 결정 1: 0.159.0의 실제 오류 신호

| 상황 | 공식 구현에서 드러나는 신호 | 감시상의 한계 |
|---|---|---|
| OTTL 문장 실행 오류 + `ignore` | WARN **`failed to execute statement`**, `error`·`statement` 필드 | 오류를 기록한 뒤 계속 실행하고 최종적으로 `nil`을 반환한다. 문장 실패 전용 카운터는 없다. |
| OTTL 조건 평가 오류 + `ignore` | WARN **`failed to eval condition`** | 문장 실행 오류와 별도 패턴이다. |
| 공통 processor 계측 | `otelcol_processor_incoming_items`, `otelcol_processor_outgoing_items`, `otelcol_processor_internal_duration` 계열 | 처리량·시간 계측이다. 정리에 실패했지만 그대로 전달된 스팬은 입출력 수가 같을 수 있다. |
| gate OFF의 `set(..., nil)` | `nil` 무시와 gate 활성화를 안내하는 **1회 WARN** | 함수가 오류를 반환하지 않으므로 OTTL 오류 계수로도 잡히지 않는다. |
| redaction | 정규식 컴파일 오류는 초기화 실패. 현재 traces 처리 함수는 정상 반환 경로에서 `nil` 반환 | OTTL 문장 실패와 동일하게 취급할 수 없다. redaction 처리 코드에도 별도 계측 TODO가 남아 있다. |

근거: [OTTL 오류 처리 소스](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/parser.go), [processorhelper 계측 정의](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.159.0/processor/processorhelper/metadata.yaml), [`set` 구현](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/ottlfuncs/func_set.go), [redaction 구현](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/redactionprocessor/processor.go).

보존된 실측 로그에도 직접 존재한다.

- `rp5/col_p2ign.log:49`: **`failed to execute statement`**
- `rp5/col_dv2_nogate.log:45`: **`set`이 nil을 무시했다는 WARN**

따라서 **“gate OFF 경고 0건”과 “ignore 오류는 `failed processing traces`로 감시”는 모두 정정 대상**이다.

로그 역시 정확한 손실 계수는 아니다. Collector에는 로그 샘플링 설정이 있으므로 수집·샘플링 정책에 따라 일부 이벤트가 남지 않을 수 있다. [공식 내부 로그 설정](https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-logs)

### 2.2 필요한 감시와 차단

현재 `slimBypassed`는 events·links·허용목록 밖 키만 검사한다. 다음 실패는 놓칠 수 있다.

- `scope.name/version/schemaUrl`, resource schema URL 잔존
- `span.name`, `status.message`, `traceState` 정리 실패
- 허용 키 안의 잘못된 타입·민감 값
- 정리 실패와 무관한 문장이 실패했지만 payload 형태는 정상인 경우

**수정안은 다음과 같다.**

1. **오류 관측:** 두 OTTL WARN 패턴과 gate WARN을 component·pipeline별로 수집한다. 로그 기반 계수는 exporter 손실 계수와 구분한다.
2. **후조건 검사:** 카나리아를 잔존 필드·값·타입 검사로 확장하고, `reason`별 위반 수를 기록한다. 원문 payload는 기록하지 않는다.
3. **전송 전 차단:** PII 전송 금지 요건을 유지하려면 정리 후 안전한 형태를 만족하지 못한 데이터는 Collector에서 live 분기로 내보내지 않아야 한다. 후단의 타입 안전한 검증·drop 방식이 우선 후보다. **그 검증 자체의 오류 시 통과 여부도 시험해야 한다.**
4. 이 구성을 보장하지 못하면, **유계 비동기 경계 뒤에서 정리 실패를 차단하는 구조**를 대안으로 재측정한다. BE 카나리아만으로 전송 노출을 막았다고 판정하지 않는다.
5. `enqueue_failed + send_failed`는 **전송 실패 신호**로 표시한다. timeout 뒤 BE가 이미 수용했을 가능성과 partialSuccess·processor 실패가 빠지는 점 때문에 정확한 종단 유실 수로 명명하지 않는다.

현재 [ApmCollectorMetricStore](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/state/ApmCollectorMetricStore.java:91)의 집계 형태도 그대로 재사용할 수 없다. `send_failed`를 신호별로 합산하며, 새로 필요한 live exporter별 enqueue 실패·오류 유형을 표현하지 못한다. **메트릭 수집→보존→조회→화면 계약까지 구현 범위에 넣어야 한다.**

## 3. Claude 질문 8건 답변

| # | 답변 |
|---|---|
| **1. ignore 감시가 충분한가?** | **현재는 불충분하다.** OTTL 문장 실패 전용 기본 카운터는 없다. 정확한 WARN 패턴, 확장 카나리아, 전송 전 후조건 차단을 결합해야 한다. “모든 processor 오류가 `slimBypassed`를 올린다”는 시험식도 잘못이다. **문장 오류 검출과 정리 결과 위반 검출을 각각 시험**해야 한다. |
| **2. CPU 완화 순위·1.20 유지?** | **1.20 유지.** 우선 기준 설정과 유효한 측정을 확보한다. 후보 순서는 **a → b → d → c → e**를 권한다. b에는 resource/scope 정리를 각 context에서 한 번 수행하는 검토를 포함한다. a·c를 곧바로 정본에 섞지 말고 correctness를 통과한 후보별 비교 후 하나를 고정한다. 효과 크기는 전부 **추정**이다. |
| **3. gate 없는 events/links 삭제 구문?** | **검증된 일괄 대체 구문을 확인하지 못했다.** `set(span.events, [])`를 대안으로 채택하면 안 된다. 해당 setter는 일반 빈 배열과 같은 타입이 아니며, 잘못된 타입은 오류가 될 수 있다. `delete_key`·`limit`도 Map용 함수를 이 slice에 그대로 적용하는 해법이 아니다. 이번 버전은 gate를 유지한다. |
| **4. 2MB·512KB와 1,000 동기화?** | **보호 상한으로는 합리적인 시작값이다. 최대 유효 배치 보장은 아니다.** 본판정에서는 `2MiB=2,097,152B`, `512KiB=524,288B`로 명시할 것을 권한다. Collector batch 수와 BE 수용 수는 독립 설정이며, 초기 호환 프로필을 둘 다 1,000으로 맞추되 자동 결합하지 않는다. |
| **5. redaction vs replace_pattern?** | **redaction 유지 후 비용 분해 측정.** 별도 processor의 CPU 몫은 아직 모른다. 13~16자리 숫자 route를 가리는 정책은 허용할 수 있지만 service·instance의 정상 식별값까지 바뀌는 사례도 검사해야 한다. 타입 정책과 `summary: silent`를 명시해 최종 허용 payload를 고정한다. |
| **6. consumers 1 vs 2?** | **1을 재측 기준 후보로 두고 2와 비교한다.** 1이 성능 목표를 만족하면 1을 선택한다. 2가 반드시 CPU를 두 배 쓰는 것은 아니다. queue 5와 in-flight를 별도로 관측하고, 선택한 값으로 최종 3회 반복을 수행한다. |
| **7. R7 전에 BSP 필수 표현?** | **설정 요건으로는 가능, 실측 보장으로는 불가.** “P5 지연 프로필: schedule delay 1,000ms”로 안내한다. 서비스 합산 TPS가 아니라 **각 SDK processor의 유입량**이 batch 충족 시간을 결정한다. “고트래픽 무관”은 삭제한다. max queue 값은 실제 export 지연·드롭을 확인해 결정한다. |
| **8. 1,000/s 지원 문구 시점?** | R2′ L2만으로 부족하다. **실제 BE의 R-P5″·R3, 화면의 R4, 실제 SDK의 R7 및 R6를 통과한 프로필에 한해** 지원 문구를 확정한다. 그전에는 “합성 Collector 경로에서 약 600 SERVER/s 구간을 관측”이라고 쓴다. “제품 600/s 지원 검증”도 아직 과하다. |

질문 3의 근거는 [span events/links setter](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/contexts/internal/ctxspan/span.go)와 [slice 값 설정 구현](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/contexts/internal/ctxutil/slice.go)다.

질문 5에서 **processor 하나를 줄이면 fan-out 복제가 한 번 줄어든다는 설명은 틀리다.** 직렬 processor 수와 receiver 분기 복제 수는 다르다. 복제는 분기 consumer의 변경 가능 여부에 따라 결정된다. [0.159.0 fan-out 구현](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.159.0/internal/fanoutconsumer/traces.go)

질문 7의 BSP 기본값은 schedule delay 5,000ms·queue 2,048·batch 512이지만, batch가 먼저 차면 timer 이전에 export한다. 따라서 이번 합성 드롭을 단순히 `초당 스팬 × 5초 > 2,048`로 설명하면 안 된다. [공식 Java 설정](https://opentelemetry.io/docs/languages/java/configuration/), [BSP 규격](https://opentelemetry.io/docs/specs/otel/trace/sdk/#batching-processor)

## 4. 구현 착수·API 계약 확정 선언

### 4.1 선언

| 구분 | 본판정 |
|---|---|
| **(a) v3로 P5.1 본 구현 착수** | **아래 필수 정정을 반영하면 가능.** v3 원문 그대로의 무조건 승인은 아니다. |
| **(b) R2′ 결과가 먼저 필요한가?** | BE 관문·메타 캐시·집계·arena·SSE 구현 전체를 기다리게 할 필요는 없다. **R2′는 live 기능 활성화·출시의 필수 게이트**다. |
| **API 계약 확정** | **현재는 보류.** 최소 종단의 수량·상한·snapshot/SSE 회귀와 계약 표본을 확인한 뒤 확정한다. |
| **P5.2·P5.3** | 명시적으로 잠정인 계약으로 화면 작업을 진행할 수 있다. 최종 연동 계약과 성능 문구는 해당 검증 후 고정한다. |

### 4.2 착수 전에 반드시 고칠 사항

1. **`ignore`의 실제 감시·전송 전 차단 정책을 설계에 확정한다.** 미확인 processor 카운터에 의존하지 않는다.
2. **본문 상한 계약을 완성한다.** 정확한 바이트 단위, 무압축/gzip 정책, Collector 측 잔존 값의 타입·길이·그룹 수, 초과 처리 규칙을 적는다. “1,000이면 최악 1.06MiB”는 외삽으로 낮춘다.
3. **실측 판정과 게이트를 정정한다.** proxy/링/commit을 구분하고, R2′는 출시 전·R-P5″는 최소 종단 직후라는 순서를 §6·§7에 동일하게 반영한다.

결합 YAML의 작은 correctness 시험은 **생성 설정을 배포하거나 계약을 확정하기 전** 필수다. 격리 성능 호스트 확보까지 기다릴 이유는 없다.

### 4.3 구현 순서·첫 커밋·회귀 목록

아래는 **Claude가 수행할 구현·검증 목록**이다.

| 순서·커밋 단위 | 구현 범위 | 필수 회귀 |
|---|---|---|
| **1. P5 기본 OFF 상태의 수신 관문** | 전용 guard, `SecurityConfig` 경로, 유계 body reader·parser, OTLP 오류 변환, 설정값 | **permitAll:** 세션 없는 유효 수신 토큰 성공, 잘못된 토큰 401, 용도·라이선스 403, 사람용 envelope 미유입. 기존 OTLP·사용자용 live API 권한 유지. 필터·바인딩 예외도 계약대로 반환. |
| **2. 본문·부분 성공 계약** | 압축 전후 독립 상한, 1,000스팬 수용 규칙, 거절 사유 카운터 | 각 바이트 상한의 직전·동일·초과, Content-Length 없음·거짓 값, 낮은 압축률·높은 압축률, 깊은 JSON·큰 미사용 필드·느린 본문. **입력=신규 집계+중복+실제 거절**. 999/1,000/1,001·혼합·중복-only·전량 거절. 표본 탈락이 rejected에 섞이지 않음. |
| **3. 메타 캐시** | refresh-ahead, hard expiry, single-flight, generation, 회수 상태 보존 | **AFTER_COMMIT:** commit 후 반영, rollback 시 변화 없음, 오래된 refresh가 새 상태를 덮지 않음. TTL 경계 반복 거절 없음, hot path DB 0, 토큰 회수·라이선스 freshness 상한. |
| **4. 집계·dedup·arena 최소 종단** | 전체 집계와 표본 분리, 60초 dedup, arena·사전 예산 | **R3 최소 시제품 우선.** 200서비스×1점/s, hot service, churn·오류 100%·회전·고수위. 마지막 세그먼트까지 arena 슬롯 상한 준수. 0/3/6/30/61초 지연·역순·재전송, endTs 귀속, retained heap·GC·락 시간. |
| **5. snapshot·SSE** | 발행 경계, revision·재생, multipart, 바이트 예약·반환 | **SSE:** frame/part 2MiB·최대 4part, 연결 큐 8MiB, 재생 로그 전역 64MiB, 고유 바이트 총 96MiB를 독립 적용. 퇴출 frame 참조·취소·끊김의 해제, snapshot chunk 1MiB·동시 버퍼·admission·대기열, multipart 도중 재접속, 느린 writer 반환. |
| **6. Collector 생성 설정·운영 관측** | 결합 YAML, 3개 OS gate, 기존 설치 갱신, 확장 카나리아·메트릭 조회 | **카나리아:** gate OFF, 필드별 정리 실패, 잘못된 타입, 값 검사 실패, 로그 수집 중단. 정상 fixture는 보존하고 위험 payload는 전송 전에 차단. exporter별 enqueue/send 실패·partial 거절 분리. 저장 pipeline gate 회귀. |
| **7. 계약 표본 확정·P5.2·P5.3 종단** | 실제 응답 JSON·상태 전이 고정, UI 연동 | R-P5″·R4·R6·R7, 실제 프록시를 통과한 완료→화면 지연과 유실 동시 판정. 수집기 관측 결측을 정상 0으로 표시하지 않음. |

**첫 커밋은 1번 범위로 한정한다.** Collector에서 live 전송을 먼저 켜지 않는다. API 계약 확정 시에는 위 표의 수량 보존식·바이트 제한·재접속 경계가 테스트 가능한 표본과 일치해야 한다.

### 4.4 R2′ 절차 확정

#### 시험 대상을 먼저 고정

- Collector 버전·바이너리 식별값, BE commit, 하네스 버전, 실제 생성 YAML, feature gate, 최종 consumers 값을 보존한다.
- 결합 YAML의 분기·PII·유효 입력 보존을 먼저 확인한다.
- a~d 최적화 비교는 탐색 시험으로 분리한다. **최종 선택한 하나의 설정으로 정식 3회 반복**한다.
- Collector와 부하원·BE·DB·캡처의 자원 경합을 분리하고 CPU quota·throttling·메모리·시계 오차를 기록한다.

#### 부하·반복

- **L2 1,000 SERVER/s와 L3 1,500 SERVER/s 각각 `OFF→ON→OFF × 3`**.
- 각 구간 **부하를 건 준비 2분 → 측정 10분 → drain 2분**.
- CPU·RSS는 **측정 10분만** 집계한다. 해당 시간에 정의한 입력 집합의 최종 도착·저장 여부는 drain까지 추적한다.
- 같은 논리 trace·정책·크기·서비스 분포를 재현한다. 생성 목표와 실제 달성 부하를 모두 기록한다.
- 낮은 부하, hot service, 큰 속성, 오류 100%, 느림 100%는 별도 프로필로 둔다. L5는 탐색이다.

추가 유효성 기준으로 **실제 부하 목표 편차 ±2%, 같은 묶음의 OFF CPU 편차 10% 이내**를 실행 전에 고정할 것을 제안한다. 이는 **본판정의 새 시험 운영 제안값**이며 기존 결과를 소급해 바꾸는 기준이 아니다. 벗어난 묶음도 보존하되 정식 3회에 넣지 않는다.

#### 판정식

각 반복 \(i\)에서:

```text
C = 측정 구간 ΔCPU_seconds / Δwall_seconds
C_OFF,i = (C_OFF-before,i + C_OFF-after,i) / 2

CPU: C_ON,i / C_OFF,i ≤ 1.20
RSS: RSS_ON,p95,i / mean(RSS_OFF-before,p95,i, RSS_OFF-after,p95,i) ≤ 1.20
     그리고 peak ≤ 사전 고정 프로세스 예산

저장:
  기대 저장 대상 ID 대비 추가 누락 = 0
  저장 분기 추가 중복 전송 = 0
  실제 DB·파생 집계 추가 중복 = 0
  동일 입력으로 정상화한 처리량 T_ON,i / T_OFF,i ≥ 0.99

지연:
  L = 완료 시각 → 실제 저장 수용/commit 시각
  L_ON,p95,i − L_OFF,p95,i ≤ max(0.1 × L_OFF,p95,i, 500ms)
```

**각 반복이 통과해야 한다. 평균으로 실패 반복을 상쇄하지 않는다.** 저장 전송 ID는 `(traceId, spanId)`로 대조하고, DB 결과도 따로 확인한다.

장애는 무응답·429·503·**전량 거절 partialSuccess**를 각각 120초 유지한다. 실제 연결 거부와 전송 중 reset을 분리한다. 정리 오류, 잘못된 타입, gate OFF, 메모리 압박을 포함한다.

큐 대기량과 in-flight를 각각 측정하고, 복구는 **큐 30초·RSS 사전 정의 정상 범위 60초·BE 버킷 freshness**를 모두 확인한다. 최종 PASS 식에는 **CPU·RSS 기준도 명시적으로 AND에 포함**한다.

## 5. v3에서 새로 생기거나 실측 반영으로 생긴 모순

이전 arena·SSE 산술 문제를 신규 지적으로 반복하지 않는다.

| 위치 | 새 모순·불일치 | 정정 |
|---|---|---|
| §6 서문·§6.4 ↔ §6.0·§7 | 앞에서는 R2가 본 구현·계약 확정 전 필수, 뒤에서는 R2′가 출시 게이트다. P5.1 의존성은 여전히 `R1·R2 ✅`다. | 이번 판정의 조건부 착수·출시 게이트로 통일한다. |
| §6.0 하네스 정정 행 ↔ 서문·§2.2·요약표 | “재측값만 인용, 무효 데이터는 어디에도 사용하지 않음”과 585ms의 지속 인용이 충돌한다. | 585ms를 **강제 flush 조건의 완료→캡처 관측**으로 분리하거나 제품 근거에서 제거한다. |
| §2.2·리스크 #13 | gate OFF “로그 0·신호 없음” | 실제 WARN이 있다. **1회 WARN은 있으나 기능 차단·제품 감시가 부족함**으로 정정한다. |
| §2.2 운영 감시·§6.4 | `ignore` 감시 패턴을 `failed processing traces`로 기재하고 processor 메트릭 검출을 기대한다. | 실제 WARN 두 종류와 기본 전용 카운터 부재를 반영한다. |
| §2.3·§3.3·§6.0 | 1,000스팬의 1.06MiB를 외삽과 실측 최대 증명처럼 혼용한다. BE 측 길이 제한을 전송 크기 근거로 사용한다. | **외삽**으로 명시하고 Collector 측 전송 최대를 새로 증명한다. |
| §5.1 | 표 머리글은 raw 458B·gzip 45B인데 600/s·1,500/s 일부 행은 524B·44B를 사용한다. | 정상 단가 기준이면 600/s raw **274.8KB/s·23.74GB/일**, 1,500/s raw **687KB/s·59.36GB/일**, gzip **67.5KB/s·5.832GB/일**이다. PII fixture 단가는 별도로 표시한다. |
| §5.3 | 12,528ms를 11,962~12,422ms “안”이라고 한다. `block_on_overflow:false`라 backlog가 없다는 설명도 틀리다. | 기준선 범위와 허용 증가량을 구분한다. overflow 비차단이어도 이미 수용한 **대기 5배치와 in-flight**는 남는다. |
| §2.2·§5.3·회신 §4 | 정상 p99·max가 11초보다 작다는 이유로 “11초 최악 상한 검증”이라고 한다. | 정상 관측은 최악 상한 증명이 아니다. queue 5·timeout 3초에서 단순 직렬 처리 모델의 보수적 체류 산정만도 consumers 1이면 약 18초, 2이면 약 12초이며, 이는 **모델 추정**이다. |
| §6.0 CPU 후보 c | processor 하나 감소를 fan-out 복제 1회 감소로 설명한다. | 직렬 처리 비용 절감 후보로만 기록한다. 복제 감소는 입증되지 않았다. |
| §7 공수 | 첫 출시 세부 합은 **5~7.5일**인데 합계는 5.5~8.5일이다. 표기 합계에 P5.4를 더하면 상단 11일인데 누적은 10일이다. | 남은 구현·별도 R2′·이미 소진된 선행 시험을 구분해 재합산한다. 일정 자체는 계속 **추정**이다. |

추가로 새 안정 식별값 계약도 확인해야 한다. `dict.instances.key`는 “전체 원본 instance ID의 해시”인데, v3 redaction은 해당 값을 BE 도착 전에 바꿀 수 있다. **해시 입력이 원본인지 정리된 값인지**, 마스킹으로 여러 인스턴스가 합쳐질 때의 동작을 명시해야 한다.

## 6. 되묻는 질문

없음. 위 정정과 검증 순서로 진행하면 된다.
