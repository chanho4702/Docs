# 코덱스 설계 대화 2회차 — APM P5 실시간 관제 (2026-09-15, gpt-6-astra xhigh, read-only)

# APM P5 실시간 관제 — Codex 2회차 검토

## 결론

**R-P5 실측(R1·R2 필수) 착수에는 동의합니다. P5.1 본 구현과 API 계약 확정에는 아직 동의하지 않습니다.**

v1은 방향을 대부분 반영했습니다. 남은 문제는 주로 **표시 보장과 실제 용량의 불일치, 캐시 갱신의 손실·무효화 경쟁, snapshot과 증분의 정합성**입니다. 아래 보완을 실측 기준에 포함하면, 이 문제들을 해결하기 위한 작은 시제품과 R1·R2는 시작할 수 있습니다.

검토 대상은 [Codex r1](%EC%BD%94%EB%8D%B1%EC%8A%A4-%EC%84%A4%EA%B3%84-%EB%8C%80%ED%99%94-1%ED%9A%8C%EC%B0%A8-APM-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%282026-09-15-gpt-6-astra-xhigh-read-only%29.md), [Claude r1](Claude-%ED%9A%8C%EC%8B%A0-1%ED%9A%8C%EC%B0%A8-APM-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%84%A4%EA%B3%84-%282026-09-15%29.md), [설계 v1](../02-%EC%84%A4%EA%B3%84/APM-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C%28Realtime%29-%EC%84%A4%EA%B3%84-X-View-%EC%95%A1%ED%8B%B0%EB%B8%8C-%EC%9A%94%EC%B2%AD-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md)입니다. 파일 수정과 테스트 실행은 하지 않았습니다.

---

## 1. 1회차 지적의 반영 판정

### 1.1 핵심 결정 9개

| 항목 | v1 반영 | 판정 | 근거 |
|---|---|---|---|
| 실시간·분석 분리 | §0에서 트레이스 분석과 메트릭 집계 구분 | ✅ 합의 | 전량 메트릭과 샘플 트레이스의 구분이 바로잡혔다. |
| Collector 분기 독립성 | §2.1 동기 fan-out·공유 자원 명시 | 🟡 보완 필요 | 설명은 수용됐다. 다만 새 `propagate`의 **상류 오류 전파**를 R2 장애 항목에 추가해야 한다. |
| 15분 링·상한 | §2.4 pool 1.4M, 서비스당 200점/초 | 🔴 여전히 반대 | 고정 세그먼트의 빈 슬롯 때문에 약속한 용량을 담지 못한다. **대안: 전역 슬롯 할당 또는 실제 바이트를 제한하는 하위 할당 구조**, 표시 보장 문구 수정. |
| 집계와 표시 분리 | 전체 관측 집계 후 reservoir | ✅ 합의 | 계산 순서에 동의한다. HTTP 모집단·오류 정의는 별도 보완 대상이다. |
| 별도 수신 EP | `collector/ingest`, 별도 경로·보안 체인 | ✅ 합의 | 저장·휘발 경로가 명확하다. |
| 별도 1초 SSE | 스트림·연결 큐·지연 측정 분리 | 🟡 보완 필요 | 방향은 맞다. snapshot 경계, 재생 로그, 실제 쓰기 취소가 아직 완성된 계약은 아니다. |
| 오류·느림 전부 보존 금지 | 균등 기본 계층 + 유계 강조 | ✅ 합의 | 계층 분리 원칙에 동의한다. 강조 계층의 전역 할당·창 이동 규칙은 N1에서 보완한다. |
| 실패 응답 진실성 | 400·partialSuccess·503 | 🟡 보완 필요 | 표본 탈락·중복 억제를 수신 거절과 구분하고, 부분 성공의 관측 방법을 확정해야 한다. |
| 라이브 hot path DB 0회 | 별도 `LiveMetadataCache` | 🟡 보완 필요 | 구조에 동의한다. TTL마다 배치를 버리는 방식과 중첩 캐시의 최대 지연은 수정해야 한다. |

### 1.2 Collector·비용·EP 세부 지적

| 항목 | v1 반영 | 판정 | 근거 |
|---|---|---|---|
| 분기 앞 비용은 전체 스팬 수에 비례 | §5.3 | ✅ 합의 | SERVER 1,000/초와 전체 약 7,700/초를 구분했다. |
| `queue_size` 단위 | 5배치로 축소 | 🟡 보완 필요 | `sizer: requests`를 명시하고 소비 중 배치를 포함해야 한다. |
| 재시도 OFF·비블로킹 큐·freshness | 설정 명시 | 🟡 보완 필요 | **5배치가 체류 5초를 보장하지 않는다.** 처리 동시성·요청 시간·큐 나이를 함께 관리해야 한다. |
| 장애 주입으로 저장 경로 보호 확인 | R2 | 🟡 보완 필요 | 변환 오류·잘못된 속성 타입·상류 응답·SDK 재전송까지 추가해야 한다. |
| processor 인스턴스와 설정 공유 구분 | §2.1 | ✅ 합의 | 정정됐다. |
| R3 분모·추가 전송량 산식 | §5.1 | ✅ 합의 | 메트릭 DB 증가량을 트레이스 전송량에 사용하지 않는다. |
| 별도 EP의 SecurityConfig·프록시·JWT 경계 | §2.3 | ✅ 합의 | 설계에 필요한 경계가 들어갔다. 실제 처리 순서는 R1·R6에서 검증한다. |

### 1.3 놓친 것 12개

| 항목 | v1 반영 | 판정 | 근거 |
|---|---|---|---|
| ① 전량의 상류 조건·HTTP/RPC | §0·`proto` | 🟡 보완 필요 | 수신 대상·수신 성공·집계 성공·표시를 더 분리해야 한다. HTTP 기본 화면의 `stats`에 RPC가 섞이지 않아야 한다. |
| ② 시간축·중복·revision·snapshot 이음 | §2.4~§3.2 | 🔴 여전히 반대 | 구독 선등록만으로 일관된 `seq=S` snapshot이 보장되지 않는다. **대안: 발행이 완료된 불변 상태와 재생 로그를 같은 경계로 묶고 `sinceSeq`를 추가**한다. |
| ③ DB 0회·메타 캐시 | §2.3.1 | 🟡 보완 필요 | commit 이후 무효화, 진행 중인 오래된 적재 차단, TTL 전 갱신, 라이선스 중첩 캐시 해소가 필요하다. |
| ④ PII·선택 파서·입력 상한 | §2.2·§2.3 | 🟡 보완 필요 | events/links 정리 후보를 구체화할 수 있다. **문자열 자르기는 PII 제거가 아니다.** 허용 속성의 값 검사도 필요하다. |
| ⑤ allocation·집계·snapshot 힙 | §2.4·§5.2 | 🔴 여전히 반대 | 고정 세그먼트 단편화, 16MB snapshot, 사전 2MB 산정이 성립하지 않는다. **대안: 슬롯별 할당·snapshot 분할·보수적인 전체 바이트 예산**. |
| ⑥ 다운샘플 분포·교체 계약 | 두 계층·`replaceBuckets` | 🟡 보완 필요 | 시간·서비스별 층화 표본임을 표시하고, 연결·브라우저 단계의 실제 수량도 전달해야 한다. 브러시 영역의 전체 관측 수는 현재 집계로 정확히 알 수 없다. |
| ⑦ 초기 진입·재접속·writer | admission·deadline·backoff | 🔴 여전히 반대 | 16MB 상한과 snapshot 크기가 충돌하고, 자동 재접속에 JSON `retryAfterMs`는 효력이 없다. **대안: snapshot chunk와 명시적인 클라이언트 재접속 상태 머신**. |
| ⑧ 액티브·리소스 정확성 | 인스턴스 합산·freshness·null | 🟡 보완 필요 | 액티브는 인스턴스 내부의 **속성 조합별 최신값을 먼저 합산**해야 한다. `expectedInstances`는 저장 경로의 관측 추정치라고 표시해야 한다. |
| ⑨ Java 시작·종료·유실 복구 | P5.3b 독립 게이트 | ✅ 합의 | 첫 출시에서 분리한 판단에 동의한다. 세부 프로토콜은 R5 이전에 확정하면 된다. |
| ⑩ 500 범위·권한 네 축 | §2.3·§3.4 | 🟡 보완 필요 | 바인딩·필터·인터셉터·직렬화를 컨트롤러의 `try` 안에 넣을 수는 없다. 경로별 예외 처리와 SSE 거절 변환이 필요하다. |
| ⑪ 패턴은 관측 특징 | §4.4 | 🟡 보완 필요 | 문구는 수용됐다. 현재 집계 슬롯에는 시작 시각 분산·route별 오류 분모·±5% 지연 띠를 계산할 정보가 없다. P5.4 전에 자료구조를 추가해야 한다. |
| ⑫ 운영의 조용한 오류 | 라우팅·사전·자기계측 등 | 🔴 여전히 반대 | 사전 ID 재사용 시 과거 점의 귀속이 바뀐다. SSE/라이브 ingest만 같은 노드로 보내면 메트릭 액티브가 빠질 수 있다. **대안: 참조 중 ID 재사용 금지와 메트릭 공급 경로까지 포함한 라우팅 계약**. |

### 1.4 미결 Q1~Q16

| 항목 | v1 반영 | 판정 | 근거 |
|---|---|---|---|
| Q1 별도 EP·패키지 | 채택 | ✅ 합의 | 배치 수신과 화면 기능의 책임 분리가 적절하다. |
| Q2 `url.path`·name 폴백 | 제외·경로 미식별 | ✅ 합의 | 원문 경로를 표시용 폴백으로 사용하지 않는다. |
| Q3 SSE·락 | SSE·서비스별 락 | ✅ 합의 | 시작점으로 적절하다. 전역 snapshot 경계는 별도로 필요하다. |
| Q4 새 스트림·단일 노드 | 채택 | 🟡 보완 필요 | P5 대시보드용 메트릭과 관리 변경의 전달 경로까지 명시해야 한다. |
| Q5 액티브 a/b/c | a 채택·b 별도·c 제외 | ✅ 합의 | 범위 결정에 동의한다. |
| Q6 모든 점의 traceId | spanId까지 제공 | ✅ 합의 | 저장 여부를 조회 결과와 구분한다. |
| Q7 큐·응답 | 재시도 OFF·partialSuccess | 🟡 보완 필요 | N4의 수량 보존식과 exporter 관측 계약이 필요하다. |
| Q8 상한·거절 응답 | 2MB·2,000개·control | 🟡 보완 필요 | 평균 500B는 최대 배치 크기의 증명이 아니다. control 자체는 허용하되 N6의 종료·재접속 규칙이 필요하다. |
| Q9 X축·늦은 도착 | 종료 시각·revision | 🟡 보완 필요 | `final=true` 이후 수정하는 계약을 정리해야 한다. |
| Q10 EWMA·계절 기준선 | EWMA 우선·8표본 | 🟡 보완 필요 | p95의 평균으로 5분 p95를 만들 수 없다. EWMA도 warm-up이 필요하다. |
| Q11 상수·버전·게이지 | 채택 | ✅ 합의 | 알고리즘 검증 전 사용자 설정 확대를 피한 판단에 동의한다. |
| Q12 균등 + 강조 | 채택 | 🟡 보완 필요 | 전역 강조 예산·시간 창 이동·다단계 표본 수를 확정해야 한다. |
| Q13 기능별·합산 힙 | 128MB·합산 검증 | 🔴 여전히 반대 | 검증식에 넣는 상한 자체가 과소 산정됐다. **대안: 자료구조와 송신 바이트 상한부터 확정한 뒤 기동 검증**. |
| Q14 라이선스·네 축 | 채택 | 🟡 보완 필요 | 기존 60초 캐시와 새 30초 캐시가 겹치면 30초 약속을 지킬 수 없다. |
| Q15 WBS 번호 | 문서 대응표·향후 WBS 반영 | 🟡 보완 필요 | 번호 선택에는 합의한다. 통합 WBS 개정은 아직 예정 작업이다. |
| Q16 BSP 조건부 권고 | R7 A/B | ✅ 합의 | 조건부 권고와 별도 앱 영향 측정이 적절하다. |

### 1.5 범위·공수·실측

| 항목 | v1 반영 | 판정 | 근거 |
|---|---|---|---|
| 공수 6~9일 | §7 채택 | 🟡 보완 필요 | §0은 P5.4를 후속으로 두는데 §7 합계는 이를 첫 출시로 포함한다. 기존 추정을 그대로 더하면 **첫 출시 약 4~6일, P5.4 포함 약 6~9일 추정**으로 구분해야 한다. |
| 선행 실측 구분 | R1~R7 | ✅ 합의 | R1·R2 선행, R3 최소 시제품, R4 렌더 확정 전, R5 별도 게이트에 동의한다. 합격식은 §5에서 구체화한다. |

---

## 2. Claude 회신 5개에 대한 재답

| 회신 | 재답 | 동의 조건 |
|---|---|---|
| 1. Collector 도달분 전량·200/1,500점/초 표시 | **수신 대상 정의에는 동의. 표시 약속에는 반대.** | “등록·승인·인증·유효성 조건을 충족한 Collector 도달 완료 스팬 전체를 처리 대상으로 한다”로 한정한다. **수신 처리율과 표시 보존율은 별도 숫자**여야 한다. |
| 2. hot path DB 0회·30초 캐시 | **조건부 동의** | TTL 전 비동기 갱신, hard expiry 이후 거절, commit 이후 무효화, 오래된 비동기 결과의 재삽입 방지, 라이선스 단일 freshness 기준이 필요하다. |
| 3. reservoir·강조·버킷 교체 | **동의** | “전체 15분 요청의 단일 균등 표본”이 아니라 **서비스·초별 층화 표본**이다. 강조 계층도 전역 예산을 가지고, 기존 버킷의 표본을 바꾸면 반드시 교체 이벤트를 보낸다. |
| 4. epoch·seq·spanId·revision | **방향 동의, 현재 이음 절차에는 반대** | `sinceSeq`, view 식별자, 발행 시점의 일관된 snapshot, 사전 참조 수명, 점/통계 revision 충돌 해소가 필요하다. |
| 5. 첫 출시 P5.1~5.3(a) | **동의** | P5.4와 Java 목록을 출시 합계·완료 기준에서도 분리한다. 액티브는 메트릭의 관측 시점·커버리지를 계속 표시한다. |

**표시 약속의 산술 반례:** 1,500점/초는 5분에 450k점, 15분에 1.35M점입니다. 그런데 브라우저는 잠정 300k점부터 솎습니다. 따라서 pool을 고쳐도 **“1,500점/초까지 화면에 전량 표시”는 현재 설계와 양립하지 않습니다.**

권장 문구는 다음과 같습니다.

> 정상 지원 부하에서 적격 수신 관측 전체로 통계를 계산합니다. X-View는 서버 보관량·선택 시간 창·브라우저 처리 한도에 따라 표본을 표시하며, 각 단계의 관측 수와 표시 수를 제공합니다.

---

## 3. v1의 새 결정 검토

### 3.1 Chunk pool — 방향은 맞지만 현재 구조는 성립하지 않는다〔N1〕

#### 고정 세그먼트의 문제

**실측이 필요 없는 산술 반례**입니다.

| 부하 | 실제 15분 점 수 | 필요한 200점 세그먼트 | 결과 |
|---|---:|---:|---|
| 200서비스 × 서비스당 1점/초 | 180,000 | 180,000개 | 7,000개 pool은 약 **35초** 만에 소진 |
| 10서비스 × 서비스당 100점/초 | 900,000 | 9,000개 | 약 **700초** 만에 소진 |
| 1,500점/초·15분, 모든 슬롯을 빈틈없이 사용 | 1,350,000 | 6,750개 | 강조에 남는 것은 50,000점뿐 |

“200점짜리를 빌리되 논리 용량을 100·50으로 줄인다”면 실제 메모리는 줄지 않습니다. 물리적으로 작은 배열을 새로 만든다면 고정 세그먼트 pool이라는 설명부터 달라집니다.

서비스당 1,000세그먼트 제한은 **독점 제한**일 뿐 공정 배분이 아닙니다. 7개 서비스가 선점하면 8번째는 여전히 들어오지 못합니다.

#### 권장 자료구조

**전역 primitive 배열 arena에서 점 슬롯을 필요한 만큼 할당**하는 시제품을 권합니다.

```text
전역 arena
  점 열 배열: endTs[], duration[], flags[], traceHi[], traceLo[], spanId[] ...
  nextSlot[] / freeHead
  전체 실제 슬롯 수 고정

버킷 헤더[serviceSlot, secondSlot]
  bucketTime, observed, retained, headSlot, pointsRev, statsRev

서비스별 예산
  base 사용량 / emphasis 사용량 / 상한

전역 예산
  base 예약량 / emphasis 예약량 / 전체 바이트 상한
```

- slab/page로 물리 할당하더라도 **한 page를 한 저빈도 버킷에 독점시키지 않습니다.**
- reservoir 교체는 이미 가진 슬롯을 덮어써서 추가 allocation을 피합니다.
- 슬롯 연결 방식에서 임의의 표본 위치를 찾는 비용은 R3에서 측정합니다. 필요하면 **별도로 예산을 잡은 위치 인덱스**를 추가합니다.
- 창 밖 버킷은 슬롯을 반납합니다. snapshot이 참조하는 동안 재사용되지 않도록 복사 또는 참조 수명 규칙이 필요합니다.
- 전체 1.4M을 유지한다면 예를 들어 **기본 1.35M·강조 50k**처럼 전역 예약을 명시합니다. 서비스당 강조 20k는 추가 상한입니다.
- 강조도 **초별 reservoir와 합계 예산**으로 정의하는 편이 단순합니다. 서비스 생애 전체에 대한 Algorithm R에서 오래된 점만 삭제하면, 최근 15분의 올바른 reservoir가 되지 않습니다.
- 메모리 압력으로 기존 표본 수를 줄일 때는 무작위로 축소하고 버킷 revision을 올립니다. 과거에 버린 점을 복구할 수 없으므로, 용량을 다시 늘렸다고 과거 버킷의 포함 확률을 높여 표시해서는 안 됩니다.

**수신 집계는 완료됐지만 표시 슬롯이 부족한 경우 `poolExhausted`는 OTLP 수신 거절이 아닙니다.** 표시 축소 계수로 분리해야 합니다.

### 3.2 메타 캐시 — 이벤트 목록보다 갱신 경계가 중요하다〔N3〕

#### TTL 만료마다 손실이 생기는 구조

v1은 TTL 만료 후 비동기 재적재를 걸고 해당 배치를 거절합니다. 이를 매 30초마다 반복하고 매번 1초분을 잃는다고 가정하면 **약 3.3% 손실 추정**입니다. 정상 상태 `<0.1%`와 충돌합니다.

권장 방식은 다음과 같습니다.

1. **soft refresh 시점**에 비동기 갱신을 시작합니다.
2. **hard expiry 30초**까지는 기존에 검증된 값을 사용할 수 있습니다.
3. hard expiry 이후 갱신에 실패하면 허용 값을 연장하지 않고 거절합니다.
4. 같은 key의 갱신은 하나만 수행하고, 갱신 큐·동시 DB 조회·음성 캐시도 유계화합니다.
5. `generation`을 두어 무효화 이전에 시작한 조회 결과가 나중에 돌아와도 다시 캐시에 넣지 못하게 합니다.

“DB 장애 시 stale 허용”은 **hard expiry 안에서만**이라는 뜻으로 확정해야 합니다.

#### 실제 무효화 경로

| 경로 | 코드에서 확인한 사실 | 필요한 보완 |
|---|---|---|
| 수신 토큰 회수 | [ApmReceiveTokenService.revoke:304](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenService.java:304)는 registrar와 무관 | 토큰 도메인에서 commit 이후 이벤트 발행. 알려진 회수는 단순 miss보다 거절 상태로 유지하는 편이 명확하다. |
| 서비스 승인 | [ApmRegistryService.approve:99](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/registry/ApmRegistryService.java:99)는 트랜잭션 안에서 `clearCache()` 호출 | P5 무효화는 **commit 이후** 수행한다. |
| 승인 대기 거절 | 같은 파일 `reject:150`에는 `clearCache()`가 없음 | 호출 지점에만 덧붙이면 빠진다. 거절은 영구 차단이 아니라 대기열 삭제라는 기존 의미도 유지한다. |
| 서비스 삭제 | [ApmServiceQueryService.delete:499](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/list/ApmServiceQueryService.java:499)는 이미 afterCommit 사용 | 메타뿐 아니라 링·사전·공유 snapshot·재생 로그의 노출 정책도 정한다. 서비스 제거 이벤트가 필요하다. |
| 표시명·숨김·복원·임계 변경 | 같은 파일 `update:448`은 `hostLinker.clear()` 사용 | registrar 호출만 추적하면 놓친다. 어떤 변경이 실시간 표시·집계에 영향을 주는지 분리한다. |
| 자동 숨김·자동 재활성화·자동 등록 | [ApmRetentionService:332](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:332), registrar/writer 경로 | 관리 API 밖의 상태 전이도 포함한다. v1 캐시 상태에는 `HIDDEN`이 빠져 있다. |
| 라이선스 등록·해지·갱신 | [SignedKeyLicenseProvider:48](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/license/provider/SignedKeyLicenseProvider.java:48)는 **60초 캐시** | 새 30초 캐시가 기존 캐시 결과를 다시 저장하면 30초 상한이 깨진다. 검증된 원천 snapshot과 freshness를 공유해야 한다. |
| 시간 경과에 따른 라이선스 상태 전이 | provider가 현재 시각으로 계산 | 재적재 이벤트만 기다리면 안 된다. 서명된 기간과 기존 상태 정책으로 다음 전이 시각을 정한다. |
| 다른 노드·직접 DB 변경 | in-process 이벤트가 전달되지 않음 | “즉시” 대상에서 제외하고 hard expiry를 적용한다. DB 장애 시에는 새 상태 적용 대신 **기존 허용을 중단하는 것**이 30초 보장이다. |

Spring은 트랜잭션 이벤트를 commit 이후에 처리할 수 있습니다. 비트랜잭션 호출의 처리 여부도 명시해야 합니다. [Spring transaction-bound events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)

또한 **“tail 샘플이 한 번도 저장되지 않으면 등록되지 않는다”는 설명은 과도합니다.** 현재 [MetricIngestPipeline:101](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/MetricIngestPipeline.java:101)도 registrar를 사용합니다. 메트릭으로 등록될 수 있습니다. 반대로 traces-only 서비스의 최초 정상 샘플 도착 시간에는 확정적인 상한이 없으므로 “수 초~수 분이면 된다”는 약속은 피해야 합니다.

### 3.3 `partialSuccess` — 성공으로 처리된다〔N4〕

**질문에 대한 답은 ‘예’입니다.** 유효한 부분 성공 응답은 재시도 OFF 여부와 무관하게 재시도하지 않습니다. OTLP가 부분 성공 응답의 재시도를 금지합니다. [OTLP/HTTP partial success](https://opentelemetry.io/docs/specs/otlp/#partial-success-1)

Collector 0.159.0의 trace handler는 다음과 같이 동작합니다.

- `Partial success response`라는 **WARN**을 기록합니다.
- 로그 필드로 `message`, `dropped_spans`를 남깁니다.
- 이후 **`nil`을 반환**합니다.
- 응답 JSON 파싱 실패는 오류로 반환합니다.
- Content-Type을 정확한 문자열로 분기하므로 응답은 **`application/json`을 명시**하는 편이 안전합니다.

따라서 **export 성공 지표를 BE의 집계 성공 개수로 해석하면 안 됩니다.** [0.159.0 otlphttpexporter 구현](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.159.0/exporter/otlphttpexporter/otlp.go#L322-L348)

권장 응답 예시:

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "partialSuccess": {
    "rejectedSpans": "12",
    "errorMessage": "Rejected 12 spans: metadataUnavailable=10, servicePending=2"
  }
}
```

`errorMessage`는 길이를 제한한 운영자용 설명으로 두고, 기계 판정의 정본은 BE 사유별 카운터로 둡니다. 원문 속성·토큰·PII는 넣지 않습니다.

#### 수량 규칙

```text
파싱·분류가 끝난 입력 스팬 수
  = 신규 집계 수
  + 이미 처리한 중복으로 확인한 수
  + 실제 거절 수

partialSuccess.rejectedSpans
  = 실제 거절 수
```

- **중복 억제:** 이미 처리했음을 확인했다면 멱등 성공으로 취급하고 별도 `deduplicated` 계수.
- **reservoir 탈락·브라우저 솎음:** 집계 성공이며 수신 거절에 포함하지 않음.
- **서비스별 메타 미확인:** 해당 부분을 실제 거절했다면 partialSuccess.
- **전체 인증 상태를 확인할 수 없음·공통 처리 자원 불능·락 획득 시간 초과·시스템 내부 실패:** 503 대상.
- **잘못된 JSON:** 400. 파서의 예상하지 못한 내부 결함은 503으로 구분.
- **요청 제한:** 429.

“503은 우리 코드 예외에만”이라는 분류에는 반대합니다. **요청을 일시적으로 처리할 수 없는 상태**인지가 기준입니다. 재시도 OFF는 이 의미를 바꾸지 않습니다.

### 3.4 버킷 교체·snapshot·seq — 계약을 한 단계 더 구체화해야 한다〔N2〕

#### 통째 교체는 유지할 수 있다

첫 구현은 `replaceBuckets`를 유지하는 데 동의합니다. 다만 비용은 새 점 수가 아니라 다음으로 계산해야 합니다.

```text
송신 점 수/초
  = 그 tick에서 다시 보낸 모든 버킷의 기본 점 수
  + 강조 점 수
```

**대역폭 추정 예시:** 1,500점/초·점당 90B이면 기본 135KB/초입니다. 늦은 도착 1%, 즉 15점이 서로 다른 200점 버킷을 변경하면 3,000점을 추가 전송하여 **약 405KB/초**가 됩니다. 한 버킷에 몰리면 추가량은 훨씬 작습니다. “늦은 도착 1% → 대역폭 1% 추가”가 아닙니다.

따라서 먼저 **dirty 버킷을 tick당 한 번만 병합**, 최대 frame bytes·연결별 queued bytes를 제한하고 R1/R4에서 측정합니다. 이 비용이 실패할 때 버킷 내부 delta를 도입합니다.

#### 필요한 계약 보완

1. **snapshot의 일관된 발행 경계**

   서비스 A를 복사한 뒤 새 tick이 발행되고 서비스 B를 복사한 경우, 마지막 전역 seq를 snapshot에 붙여 앞선 이벤트를 버리면 A 변경을 잃을 수 있습니다.

   권장 방식은 **tick에서 확정한 불변 상태와 재생 로그를 함께 발행**하고, snapshot은 그 상태 `S`를 참조하는 것입니다. 구독·재생 시작 위치 결정도 같은 발행 경계 아래에서 처리합니다.

2. **`seq`는 데이터 발행 번호**

   연결별 snapshot·control을 만들 때마다 전역 seq를 증가시키지 않습니다. heartbeat는 마지막 데이터 seq를 알리고, 재생 위치를 임의로 앞당기지 않습니다.

3. **`sinceSeq`와 view 식별자 추가**

   view에는 서비스·환경뿐 아니라 protocol·시간 창·표본 정책을 포함합니다. 다른 필터로 바뀌었는데 같은 커서로 재생하면 안 됩니다.

4. **점과 통계 revision 분리**

   현재처럼 동일한 `rev`로 점 전체 교체와 통계만 교체하면 순서에 따라 최신 통계나 점이 밀릴 수 있습니다. `pointsRev`·`statsRev`를 분리하거나, 한 버킷의 업데이트 형식을 하나로 통일합니다.

5. **`final` 의미 수정**

   5초 뒤에도 수정한다면 `final`이 아닙니다. `provisionalUntil` 또는 `settled`로 바꾸고, 창 안에서는 늦은 수정이 가능하다고 명시합니다. 기준 시각은 **버킷 생성 시각이 아니라 버킷 종료 시각**입니다.

권장 payload 골격:

```jsonc
{
  "streamEpoch": "e7f1",
  "viewKey": "all|prod|http|300|sampling-v1",
  "sinceSeq": 184220,
  "seq": 184221,
  "dictDelta": { "from": 42, "to": 43 },
  "replaceBuckets": {
    "1": [{
      "b": 1789000000000,
      "pointsRev": 4,
      "base": { "observed": 412, "retained": 200, "delivered": 100, "points": [] },
      "emphasis": { "observed": 5, "retained": 5, "delivered": 5, "points": [] }
    }]
  },
  "statsRevision": {
    "1": [{
      "b": 1789000000000,
      "statsRev": 7,
      "provisionalUntil": 1789000006000,
      "stats": {}
    }]
  }
}
```

FE는 epoch/view가 같고 `sinceSeq`가 마지막 적용 seq와 일치할 때만 적용합니다. 불일치는 재생 또는 snapshot으로 복구합니다. 수동으로 EventSource를 다시 만들 때는 `sinceEpoch`·`sinceSeq` 쿼리 방식도 정의해야 합니다.

#### 사전·중복에서 추가로 고칠 것

- **`dictVersion`만 올려 옛 매핑을 버리면 안 됩니다.** 과거 점은 아직 옛 instanceId를 참조합니다. 첫 구현은 **링·snapshot·재생 로그가 참조하는 ID의 재사용 금지**, 상한 초과는 `__other__`가 가장 단순합니다.
- service LRU 퇴출·삭제도 명시적인 제거 이벤트 또는 세대 변경이 필요합니다.
- `traceIdLo ^ rotate(spanId)` 하나는 `(traceId, spanId)`의 정확한 동일성 검사가 아닙니다. 충돌 시 전체 키를 비교해야 합니다.
- dedup 용량은 **표시 1,500/초가 아니라 지원 수신 처리율 × 60초**로 계산해야 합니다.
- 60초 dedup과 900초 늦은 도착 허용을 함께 유지하면 60초보다 늦게 온 중복은 다시 집계될 수 있습니다. 이 한계를 명시하거나 dedup 기간을 맞춰야 합니다.

### 3.5 HTTP SERVER 기본 대상 — 동의하되 첫 출시는 HTTP만 권장〔N5〕

**HTTP X-View에 동의합니다. 비-HTTP를 기본 숨김으로 전송하는 것은 후속으로 미루는 편을 권합니다.**

현재 설계에는 다음 불일치가 있습니다.

- 점에는 `proto`가 있지만 `stats`는 서비스별 하나입니다. RPC를 숨겨도 TPS·p95가 RPC를 포함할 수 있습니다.
- `http.request.method`만 확인하므로 구형 `http.method`를 놓칩니다.
- `rpc.system`은 최신 규약에서 `rpc.system.name`으로 이동했습니다. [공식 RPC migration guide](https://opentelemetry.io/docs/specs/semconv/non-normative/rpc-migration/)
- HTTP 위에서 동작하는 RPC는 속성이 겹칠 수 있으므로 판별 우선순위가 필요합니다.
- 일반적인 메시징 처리는 PRODUCER/CONSUMER/CLIENT 등이 사용되며, SERVER만 수신해서 메시징을 지원한다고 말할 수 없습니다. [공식 messaging span kind](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/#span-kind)

첫 출시 권장 순서는 **구/신 속성 정규화 → protocol 판별 → HTTP SERVER 선택 → 속성 정리**입니다. 비-HTTP도 유지한다면 `stats`·표본·상한·사전을 protocol별로 분리하고 비용을 다시 계산해야 합니다.

오류 정의도 맞춰야 합니다. 기존 [LivePoint:28](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LivePoint.java:28)는 HTTP 5xx를 오류로 봅니다. v1은 `status.code==ERROR`만 봅니다. **RED 비교용 `http5xxCount`와 스팬 오류 `spanErrorCount`를 구분**하는 방식을 권합니다. `isSlow`도 오류 여부와 독립적으로 계산해야 합니다.

### 3.6 자기계측·단일 live 노드 — 배포 조건을 확장해야 한다〔N10〕

#### 자기계측

- Collector의 자기 메트릭을 없애면 R2 관측 수단도 사라집니다. **업무 X-View에서 제외하는 것과 Collector 운영 메트릭 수집을 구분**합니다.
- 기존 [OtlpResource.isCollectorName:82](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/otel/metric/OtlpResource.java:82)는 `otelcol` 계열 판정이며, MovesEye BE 전체를 식별하지 않습니다.
- 서비스명 정규식은 배포에서 정한 정확한 식별자와 함께 사용해야 합니다. 광범위한 `moves.*` 같은 패턴은 피합니다.
- BE 경로 제외에는 새 경로뿐 아니라 기존 `/apm/otlp/**`, SSE, 자체 관측용 endpoint도 포함해 검토합니다. 식별은 속성 제거 전에 수행합니다.
- 경로를 검사에 사용하는 것과 그 원문을 라이브 payload로 전송하는 것은 별개입니다.

Java의 일반 `OTEL_INSTRUMENTATION_*_ENABLED`는 계측 라이브러리를 끄는 설정입니다. 임의 URL 제외용 환경변수로 단정하면 안 됩니다. 공식 문서에는 **declarative config의 `rule_based_routing` sampler로 SERVER의 `url.path`를 제외하는 방법**이 있습니다. Java 2.31.1에서 적용 설정과 기존 sampler 정책의 상호작용을 R1에서 확인할 후보입니다. [공식 Java 경로 제외 예시](https://opentelemetry.io/blog/2025/declarative-config/#health-check-exclusion)

#### 배포 라우팅

다중 BE에서 최소한 다음 표가 필요합니다.

| 데이터/작업 | 필요한 조건 |
|---|---|
| 모든 Collector의 live traces | 같은 지정 live 노드로 전달 |
| 브라우저 snapshot·SSE·재접속 | 같은 live 노드로 전달 |
| 액티브·CPU·heap 메트릭 | 해당 live 노드의 메트릭 링에도 전달 |
| 토큰·서비스·라이선스 변경 | 같은 노드에서 처리하거나, 타 노드 변경은 최대 30초 지연으로 명시 |
| 롤링 배포·장애 전환 | 옛 노드의 SSE만 남는 분할 상태 방지. 새 epoch·coverage 초기화를 표시 |
| ingress·프록시 | 경로·context path·timeout·buffering을 실제 배포 경로로 검증 |

**P5.1~5.2의 trace 라우팅만 맞춰서는 P5.3 대시보드까지 성립하지 않습니다.**

---

## 4. Claude의 2회차 질문 N1~N12에 대한 답

### 4.1 판정 요약

| 질문 | 답 |
|---|---|
| **N1 chunk pool** | **현재 방식 반대.** §3.1의 슬롯 arena 시제품 권장. 서비스별 상한과 전역 강조 예약을 병행한다. |
| **N2 통째 교체·revision** | **조건부 동의.** 먼저 통째 교체를 유지하되 §3.4의 발행 경계·revision·바이트 상한을 확정한다. |
| **N3 in-process 이벤트·TTL** | **조건부 동의.** 단일 프로세스 안에서는 충분하다. `clearCache()` 호출처만 따라붙이는 방식은 불충분하며 commit·generation·hard expiry가 필요하다. |
| **N4 partialSuccess·503** | **부분 성공은 성공 취급.** WARN과 별도 BE 거절 계수를 사용한다. 503은 코드 예외뿐 아니라 일시적 처리 불능도 포함한다. |
| **N5 HTTP·RPC** | **HTTP 기본에 동의. 첫 출시는 비-HTTP 전송 제외 권장.** 유지한다면 통계까지 protocol별 분리한다. |
| **N6 control·EventSource** | **P5만 control 사용하는 데 동의.** P1.5 변경은 불필요하다. 단 아래 재접속 상태 머신이 필수다. |
| **N7 힙 검증·기동 실패** | **실제 상한에 근거한 실패에는 동의. 현재 추정식으로 전체 BE 기동을 막는 데는 반대.** |
| **N8 OTTL 정리** | **일부는 소스로 확인 가능.** events/links도 삭제 후보가 있으나 feature gate 조건을 포함해 R1 검증해야 한다. |
| **N9 15칸 histogram** | **대략적인 게이지에는 조건부 동의. 정밀 p95·±5% 띠 탐지에는 부족.** |
| **N10 자기계측** | §3.6 기준. 경로 기반 sampler는 공식 후보이나 해당 버전 검증 전 확정하지 않는다. |
| **N11 잠정 숫자** | 시작값으로 둘 수 있지만 서로 충돌하는 조합은 먼저 수정한다. 특히 heartbeat 5초·갱신 판정 3초는 불일치다. |
| **N12 동일 슬롯 8표본** | **학습 시작 게이트로 조건부 동의. 정확성 보증으로는 부족.** backtest·결측·정책 변경 검사가 추가로 필요하다. |

### 4.2 N6 — control을 유지하는 구체 계약

EventSource는 서버가 연결을 닫으면 재접속합니다. JSON 안의 `retryAfterMs`는 브라우저가 해석하는 프로토콜 필드가 아닙니다. 표준의 `retry:` 또는 애플리케이션의 명시적 처리가 필요합니다. [WHATWG Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)

```text
권한·라이선스 reject
  → control 수신 즉시 source.close()
  → 자동 재접속 중단
  → 로그인/권한 변화 또는 사용자의 재시도로 새 연결

429·일시적 서버 제한
  → source.close()
  → retryAfterMs + jitter 뒤 새 EventSource 생성
  → 마지막 적용 커서를 sinceEpoch/sinceSeq로 전달

paused
  → 연결 유지, 서버의 유계 대기열에서 대기
  → heartbeat 유지
  → 입장 허용 시 snapshot 시작

일반 네트워크 단절
  → native 재접속 허용
  → 서버 retry: 값 적용
```

권장 control 예시:

```json
{
  "type": "reject",
  "code": 403,
  "errorCode": "APM_VIEW_FORBIDDEN",
  "retryable": false
}
```

```json
{
  "type": "reject",
  "code": 429,
  "errorCode": "APM_LIVE_TOO_MANY_CONNECTIONS",
  "retryable": true,
  "retryAfterMs": 15000
}
```

추가 조건:

- 인증 필터·라이선스 인터셉터에서 먼저 거절되면 controller의 control까지 도달하지 않습니다. **P5 경로의 거절 변환 위치**를 명시해야 합니다.
- admission 대기 연결도 메모리·연결 수 제한에 포함합니다. 아직 snapshot이 없는 연결에 증분을 계속 쌓지 않습니다.
- 느린 클라이언트에게 마지막 control을 보낼 수 있다는 보장은 없습니다. 송신이 막히면 종료하고 다음 연결에서 사유를 처리합니다.
- Spring MVC의 개별 응답 쓰기는 blocking입니다. `SseEmitter`나 timer만으로 2초 뒤 writer가 반드시 풀린다고 볼 수 없습니다. **실제 연결 중단 후 writer가 반환되는지** 확인해야 합니다. [Spring MVC 비동기 쓰기](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html)

### 4.3 N7 — 힙 검증식과 snapshot

현재 숫자에는 세 가지 큰 누락이 있습니다.

1. **300k점 × 70~90B = JSON만 21~27MB 추정.** 16MB snapshot 상한보다 큽니다.
2. **450k점 snapshot은 31.5~40.5MB 추정.** 15분 1.35M점이면 94.5~121.5MB입니다.
3. 200서비스 × 200route × 256자는 문자열 내용만으로도 상당한 용량입니다. 인스턴스·버킷 헤더·Map·인덱스를 포함한 총 2MB는 보수적 상한이 아닙니다.

여기에 10초 재생 로그, 늦은 버킷 재전송, protocol 분리, dedup 전체 키, 삭제 대기 참조가 더해집니다.

**대안:** snapshot을 `begin → chunk → end`로 나누고 `snapshotId`·고정 `seq=S`를 공유합니다. FE는 마지막 chunk까지 받은 뒤 한 번에 snapshot을 확정합니다. 다만 서버가 큰 JSON을 먼저 완성한 다음 잘라 보내면 임시 메모리는 줄지 않습니다.

기동 정책은 다음이 적절합니다.

- P5 활성 설정의 **계산 가능한 최소 필요량이 예산을 초과:** P5 활성화 실패.
- P5 필수인 설치 모드: BE 기동 실패 허용.
- P5 선택 기능인 설치 모드: P5 비활성 상태와 원인을 명시하고 나머지 BE 기동 허용.
- `maxMemory` 30%·50%는 제품 정책의 **잠정값**이며, 안전성 자체를 증명하지 않는다.
- `MB`와 `MiB`의 단위를 통일한다.

### 4.4 N8 — 0.159.0 OTTL 사전 검토

소스 기준으로 다음은 확인할 수 있습니다.

| 항목 | 사전 판단 |
|---|---|
| SERVER kind | `kind.string`의 `"Server"`는 유효하다. 설정에는 `span.kind != SPAN_KIND_SERVER`처럼 enum 사용을 권장한다. |
| span name·status message·trace state | setter가 존재한다. 빈 name 또는 고정 `"_live"` 이름을 R1에서 확인하면 된다. |
| scope attributes | `instrumentation_scope.attributes` 경로를 사용하면 별도 `context: scope` 추측을 줄일 수 있다. |
| events·links | setter가 존재하고, 내부 구현은 nil로 비우는 동작을 제공한다. |
| `set(..., nil)` | **`ottl.set.allowNil` feature gate가 꺼져 있으면 무시된다.** 단순히 nil을 설정했다고 지워진 것으로 판단하면 안 된다. |
| `set(events, [])` | 일반 배열을 pdata message slice에 넣는 방식으로 단정하면 안 된다. 해당 setter는 타입 검사를 한다. |

근거: [span context](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/contexts/ottlspan/README.md), [events/links setter](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/contexts/internal/ctxspan/span.go#L466-L499), [nil slice 처리](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/contexts/internal/ctxutil/slice.go#L157-L171), [set feature gate 처리](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/ottlfuncs/func_set.go#L33-L48).

R1 후보는 다음입니다. **실행 검증된 yaml은 아닙니다.**

```yaml
# Collector 실행 옵션의 ottl.set.allowNil 활성화 여부를 함께 고정
trace_statements:
  - context: span
    statements:
      - set(span.name, "_live")
      - set(span.status.message, "")
      - set(span.trace_state, "")
      - keep_keys(instrumentation_scope.attributes, [])
      - set(span.events, nil)
      - set(span.links, nil)
```

feature gate는 다른 pipeline의 OTTL에도 영향을 줄 수 있으므로 기존 저장 설정을 함께 검사합니다. scope name/version·schema URL처럼 아직 허용목록 밖에서 전달되는 문자열도 점검 대상입니다.

**`error_mode: propagate`는 ‘라이브 내부에서만 폐기’가 아닙니다.** transform은 오류를 상류로 반환하고, fan-out은 각 consumer 오류를 모아 반환합니다. 현재 transform이 batch 앞에 있으므로 저장 분기가 이미 처리한 요청에서도 receiver 오류가 생길 수 있습니다. 상류 재전송 여부와 저장 중복 영향은 **추정이며 R2 확인 대상**입니다. [transform 오류 모드](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/transformprocessor/README.md), [fan-out 오류 반환 구현](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.159.0/internal/fanoutconsumer/traces.go#L42-L68)

실패하면 **live batch의 비동기 경계 뒤로 정리를 옮기는 배치 순서** 또는 별도 live 처리 프로세스를 검토합니다. 어느 쪽도 측정 없이 격리를 보장한다고 쓰면 안 됩니다.

### 4.5 N9·N11·N12 — 정밀도와 잠정 숫자

**N9 histogram**

[CanonicalBounds:53](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/otel/histogram/CanonicalBounds.java:53)는 14개 경계와 마지막 초과 구간을 사용합니다. 예를 들어 100~250ms, 1~2.5초 구간이 넓고 10초 초과는 하나로 합쳐집니다.

- 첫 출시 게이지에는 **근사값 표시·구간/overflow 정보**를 조건으로 사용할 수 있습니다.
- 소수점 p95를 정확한 실측값처럼 표현하지 않습니다.
- ±5% 지연 띠 탐지는 이 histogram으로 불가능합니다.
- 5분 p95는 1초 p95의 평균이 아니라 **histogram을 합친 뒤** 계산합니다.
- 정확도 요구가 정해지면 더 촘촘한 고정 histogram 또는 유계 sketch를 비교합니다.

**N11 숫자**

| 값 | 판단 |
|---|---|
| heartbeat 5초·갱신 판정 3초 | 무트래픽 때 주기적으로 멈춤으로 보인다. 판정 시간을 heartbeat 간격보다 충분히 길게 설정한다. |
| 메트릭 stale 90초 | export 60초+전송 여유의 시작값으로 가능. 실제 `asOf` 기준으로 판정한다. |
| 숨김 5분 | 정책값으로 가능. 브라우저가 타이머를 늦출 수 있으므로 서버 자원 제한은 별도로 유지한다. |
| deadline 2초 | 목표로 가능. snapshot chunk 크기와 실제 socket write 종료 검증이 필요하다. |
| 연결 50 | 활성·대기 연결을 포함하고 사용자/전체 제한을 구분한다. |
| 토큰 5rps | 5,000점/초·1,000점 배치면 이미 평균 5rps다. burst·동일 토큰의 Collector 수를 포함해 정해야 한다. |
| 본문 2MB | 평균 크기로는 증명 불가. 최대 문자열·resource/scope 반복·UTF-8·JSON escaping을 포함한다. |
| 큐 5배치 | 시작값으로 가능. `sizer`와 `num_consumers`를 고정한다. 기본 consumer는 10개이므로 현재 5MB는 대기분만의 환산이다. [exporterhelper 설정](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.159.0/exporter/exporterhelper/README.md#sending-queue) |

**N12 계절 기준선**

8개는 모델을 켜 보기 위한 최소 게이트로 둘 수 있습니다. 동일 슬롯 8개를 확보할 보존 기간, 같은 모집단·오류 정의, 결측·배포·설정 변경, MAD=0 처리가 함께 필요합니다. **8개라는 숫자만으로 오탐률은 보장되지 않습니다.** 첫 출시 밖이므로 P5.4 backtest에서 확정하면 됩니다.

---

## 5. 합의 범위와 R1·R2 구체 절차

### 5.1 착수 판정

> **이 v1을 기반으로 R-P5 실측에 착수할 수 있습니다. 아래 절차와 합격식을 실측 계약으로 추가하는 조건입니다.**

R1·R2는 불확실성을 확인하는 작업이므로 chunk pool과 FE 계약을 모두 완성할 때까지 미룰 필요는 없습니다. 다만 **“v1 원문 그대로 구현해도 된다”는 합의는 아닙니다.**

**P5.1 본 구현·계약 확정 전 필수 수정:**

1. 수신 처리율·서버 보관량·브라우저 표시량을 분리하고 200/1,500 표시 보장 문구 정정.
2. 고정 세그먼트 강등을 실제 allocation을 제한하는 구조로 교체.
3. 메타 캐시의 사전 갱신·hard expiry·commit 이후 무효화·generation·라이선스 freshness 확정.
4. snapshot 발행 경계·`sinceSeq`·view·revision·사전 참조 수명 확정.
5. snapshot chunk·재생 로그·연결 큐의 **바이트 상한** 확정.
6. control 거절의 명시적 종료·재접속 및 필터/인터셉터 처리 위치 확정.
7. partialSuccess에 표시 탈락·중복 억제를 섞지 않는 수량 규칙 확정.
8. HTTP 모집단·오류 정의·단일 live 노드의 메트릭 공급 경로 확정.

### 5.2 공통 실측 준비

아래 시간·허용 차이는 **새로 제안하는 잠정 합격선이며 추정**입니다. 측정 결과를 본 뒤 통과시키려고 바꾸지 말고 실행 전에 고정합니다.

| 항목 | 절차 |
|---|---|
| 환경 | 격리된 QA 환경. Collector 0.159.0·javaagent 2.31.1·JDK·BE commit·브라우저 버전·CPU quota·메모리 제한·프록시 설정 기록 |
| 설정 | 실제 생성 yaml과 실행 feature gate 보존. live 큐 `sizer: requests`, consumer 수 명시. 재시도 OFF·영속 큐 없음 확인 |
| 대상 | HTTP SERVER를 기본 정상 모집단으로 정의. 비-HTTP·자기계측·잘못된 입력은 별도 fixture로 분리 |
| 식별 | `(traceId, spanId)`와 부하 생성기의 논리 요청 ID로 지점별 대조 |
| 시간 | 앱 완료, Collector 수신, live HTTP 도착, 집계 commit, SSE 수신, 화면 반영 시각 측정. 호스트 간 시계 오차를 먼저 측정 |
| 반복 | 각 프로필 준비 2분·측정 10분·drain 2분, 3회 반복. DB 장애·기동 직후는 정상 구간과 별도 |
| 정상 사전 조건 | 토큰·서비스 승인 및 캐시 warm-up 완료. **측정 중 TTL 갱신 구간은 제외하지 않음** |
| 실패 원칙 | 지점별 ID와 카운터가 맞지 않으면 미해명 손실로 남긴다. 표본 탈락을 수신 유실로 세지 않는다. |

### 5.3 부하 프로필

전체 스팬 수는 SERVER 비율 13%를 사용한 **부하 생성 가정**입니다.

| 프로필 | SERVER 완료/초 | 서비스 분포 | 전체 스팬/초 | 목적 |
|---|---:|---|---:|---|
| L0 | 0·저빈도 교대 | 1~10서비스 | 변동 | heartbeat·idle·batch timeout |
| L1 | 100 | 10서비스 균등 | 약 770 | 낮은 부하의 batch 지연 |
| L2 | 1,000 | 10서비스 ×100 | 약 7,700 | 기본 지원 부하 |
| L3 | 1,500 | 200서비스 균등 분산 | 약 11,540 | 다서비스·메타·전송 상한 |
| L4 | 1,000 | 단일 서비스 | 약 7,700 | 집계 전량과 표시 200점/초 분리 |
| L5 | 5,000 | 다서비스·10초 burst 포함 | 약 38,460 | 처리율 확장·과부하 경계 탐색 |

오류·느림은 정상 혼합 외에 **오류 100%·느림 100%**를 별도로 수행합니다. L5는 수신 지원 상한으로 채택하기 전까지 탐색 프로필입니다. v1의 “5,000에서도 수신·집계 전량”을 제품 약속으로 유지한다면 L5도 필수 통과 대상으로 올려야 합니다.

### 5.4 R1 — 분기·PII·정합성·지연

정상 적격 ID 집합을 `E`, BE 신규 집계 ID 집합을 `A`로 둡니다.

| 검증 | 절차·측정 지점 | 합격/불합격 판정식 |
|---|---|---|
| 분기 정확성 | 모든 span kind, 구/신 HTTP 속성, RPC, 자기계측 fixture를 Collector 전후에서 대조 | 비대상 오포함=0. 정상 적격 대상의 의도치 않은 필터 탈락=0 |
| PII 제거 | name·message·events·links·trace state·scope 및 허용 속성에 식별용 문자열 삽입. **BE 파싱 전 live HTTP 본문** 검사 | 금지 문자열 통과=0. 동시에 정상 fixture 전달 확인. 전부 버려서 0건이 된 결과는 불합격 |
| 정상 유실 | L1~L3에서 Collector 도달 적격 ID와 BE 집계 ID 비교 | `loss = |E \ A| / |E| < 0.001`. 각 반복 모두 충족 |
| 집계 정확성 | 생성기 정답과 `endTs` 버킷 count·오류·slow·sum 비교 | 수용된 고유 관측에 대해 count·오류·slow 오차=0. p95는 histogram 정의에 따른 근사 범위로 비교 |
| 표본 분리 | L4·오류 100%에서 전체 집계와 표시 수 동시 관측 | `stats.count=수용 고유 관측 수`, `displayed≤상한`. reservoir 탈락으로 rejectedSpans가 증가하면 불합격 |
| TTL 영향 | 10분 동안 토큰·서비스·설정 캐시 갱신 시점별 거절·DB 접근 측정 | hot path DB 호출=0. TTL마다 반복 거절하면 불합격. 정상 총 유실률에도 포함 |
| 지연 | 실제 프록시를 통과해 완료→링, 완료→SSE 수신, 완료→화면 반영 측정 | 기존 기준 `p50(완료→링)<5초`. 추가 제안: `p95(완료→화면)≤5초`, `p99≤10초` |
| 늦은 도착·중복 | 0·3·6·30·61초 지연 및 역순·재전송 fixture | 버킷 귀속 오류=0. 계약한 dedup 기간 안 추가 집계=0. 5초 이후 수정이 FE에 반영되지 않으면 불합격 |
| 부분 성공 응답 | 수용/거절 혼합, 중복-only, 잘못된 JSON, 429·503 응답 | BE 수량 보존식 일치. 유효 partialSuccess는 재전송=0·WARN 확인. 503도 retry OFF에서 exporter 재시도=0 |
| URL·본문 상한 | context path·끝 슬래시·최대 문자열·2,000개 배치·gzip 경계값 | 목적 경로 일치. 제한 이하 수용·초과 계약대로 거절. 평균 크기만 확인하면 미완료 |

지연은 전달된 점만 골라 측정하면 손실이 숨겨질 수 있습니다. **유실률과 지연을 반드시 함께 통과**해야 합니다. 브라우저는 `message` 도착과 차트 반영 완료를 별도로 기록합니다.

### 5.5 R2 — Collector 비용과 저장 경로 보호

동일 부하를 **OFF → ON → OFF** 순서로 반복해 시간 경과에 따른 변동을 확인합니다. tail 정책 비교에는 같은 논리 trace 집합과 동일 정책을 사용하고, 저장 결과는 raw export ID와 실제 저장·메트릭 집계 양쪽에서 확인합니다.

| 검증 | 절차·측정 지점 | 합격/불합격 판정식 |
|---|---|---|
| 정상 CPU | L2 필수, L3 추가. Collector CPU seconds 증가량을 측정 시간으로 나눔 | `C = ΔCPU_seconds / Δwall_seconds`. 잠정 `C_ON/C_OFF≤1.20`. quota·throttling도 함께 기록 |
| 정상 메모리 | 동일 구간의 RSS·Go heap·큐·in-flight 관측 | 잠정 `RSS_ON,p95/RSS_OFF,p95≤1.20`, peak는 설정한 프로세스 예산 이내 |
| 저장 처리량 | live OFF/ON의 저장 대상 trace ID·메트릭 입력과 출력 대조 | 추가 유실=0·추가 중복=0. 정상화 처리량 비율 `T_ON/T_OFF≥0.99` |
| 저장 지연 | 완료→저장 수용/commit의 p95 비교 | 잠정 `L_ON,p95−L_OFF,p95≤max(0.1×L_OFF,p95, 500ms)` |
| live 무응답 | live EP만 3초 초과 무응답으로 120초 유지 후 복구 | 저장 처리량·지연 기준 유지. live 실패 계수 증가. retry OFF 유지 |
| HTTP 거절 | live EP가 429·503·전량 metadata 거절 partialSuccess를 각각 120초 반환 | 응답별 전송 실패/WARN/BE 거절 계수가 예상대로 구분. 저장 추가 유실·중복=0 |
| 연결 거부·reset | live 목적지만 연결 거부 및 전송 중 reset | 저장 기준 유지. live 큐·in-flight가 선언한 상한 초과 시 불합격 |
| transform 실패 | 잘못된 타입·정리 문장 실패 fixture 주입 | receiver 응답과 SDK 재전송 확인. 저장 분기에 추가 유실·중복이 생기면 현재 배치 순서 불합격 |
| 메모리 압박 | 지원 부하에서 live backlog·큰 속성·오류 100%로 압박. 전체 quota 초과 실험은 별도 표시 | 지원 예산 안에서는 저장 기준 유지·OOM=0·무한 증가=0. 예산 밖 결과를 정상 지원 보장에 섞지 않음 |
| 복구·freshness | 장애 해제 후 queue age·endTs age·RSS 추적 | 잠정 30초 안에 live 큐 정상화, 60초 안에 RSS가 장애 전 정상 범위로 복귀. 오래된 점을 현재 TPS에 몰아넣으면 불합격 |

CPU·RSS의 20%는 **성능 목표의 잠정 제안**입니다. 저장 데이터의 추가 유실·중복 0과는 다른 종류의 기준입니다. 자원 목표가 실패하면 비용을 보고 설정·지원 부하를 다시 결정할 수 있지만, 저장 정확성 실패를 허용 오차로 덮으면 안 됩니다.

**R2 최종 판정:**

```text
PASS
  = 저장 추가 유실 0
  ∧ 저장 추가 중복 0
  ∧ 저장 처리량·지연 기준 충족
  ∧ 모든 live 큐·동시성·메모리가 선언한 상한 이내
  ∧ 실패·부분 거절·복구를 관측 가능
```

R1·R2 통과는 Collector 분기와 최소 종단의 타당성 확인입니다. **1.4M점 보관·다중 snapshot·50개 브라우저의 출시 적합성은 R3·R4에서 별도로 통과해야 합니다.**

---

## 6. 되묻는 질문 — 3회차용

1. **200/1,500점/초는 서버의 기본 계층 보관 목표로 바꾸고, 브라우저는 시간 창과 처리 한도에 따른 표본 표시로 확정할 수 있는가?** 화면 전량 보장이 필요하다면 snapshot·브라우저 예산을 다시 잡아야 한다.
2. **첫 출시는 HTTP SERVER만 전송·집계하고, RPC/OTHER 지원은 후속으로 분리하는 데 동의하는가?**
3. **첫 배포는 BE 전체 1대인가, 다중 BE 중 live 노드 1대인가?** 후자라면 액티브·리소스 메트릭과 관리 변경을 그 노드에 전달할 구체 경로가 필요하다.
