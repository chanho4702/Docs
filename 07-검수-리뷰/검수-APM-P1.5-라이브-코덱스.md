검수 결과: 커밋 차단 🔴 4건입니다.  
SSE의 선택적 `visitorId` 검사는 기존 세션 바인딩 규약을 실제로 우회합니다.  
D2의 “분할 금지”가 조회 병합·동일 버킷 적재 경로에서 다시 깨집니다. 테스트 실행·파일 수정은 하지 않았습니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | `ApmLiveStreamController.java:294` | `visitorId`가 없으면 Redis 세션 대조를 건너뜁니다. | `VisitorIdCheckInterceptor`는 MCP 외에는 `x-visitor-id`를 필수로 요구합니다. 따라서 다른 기기 로그인 등으로 Redis 세션이 교체되어도, 기존 `accessToken` 쿠키만 남아 있으면 `/stream`은 최대 30분 열립니다. 이는 세션 바인딩 우회입니다. | 브라우저 EventSource에는 `visitorId` 쿼리를 필수화하고, 헤더 기반 클라이언트만 헤더를 허용하십시오. 쿼리 `visitorId`가 액세스 로그에 남는 경로는 배포 설정에서 마스킹 여부도 확인하십시오. 토큰을 쿼리에 넣지 않은 점은 정상입니다. |
| 2 | 🔴 | `ApmHistogramMerger.java:161` | 조회 병합이 여전히 무조건 `rebucket()`합니다. | `mergesExactlyInto`가 적재에서만 적용됩니다. 서로 다른 bounds 행을 조회에서 합칠 때 `foldOnto()`가 더 촘촘한 목적 격자로 분할할 수 있어, D2가 막으려던 분포 날조와 1000배 단위 오독이 다시 발생합니다. | `mergesExactlyInto(from.boundsMillis(), to.boundsMillis())`가 참일 때만 접고, 아니면 해당 조각 또는 전체 p95를 `null` 처리하십시오. 분할이 필요한 경우에는 신뢰 가능한 백분위를 만들지 않는 쪽이 안전합니다. |
| 3 | 🔴 | `ApmMetric1mStore.java:560` | 동일 PK에 서로 다른 `boundsId`가 오면 뒤 벡터만 버리고 `count/sum/min/max`은 합산합니다. | 저장된 histogram은 일부 관측만, 스칼라는 전체 관측이 됩니다. 이후 p95가 “전체 요청의 p95”처럼 노출되지만 실제로는 먼저 온 일부 벡터의 p95입니다. D2의 “벡터를 섞거나 버리는 경우”에 해당합니다. | bounds 불일치가 한 번이라도 나면 해당 PK의 `hist_counts`와 `bounds_id`를 모두 `null`로 확정하고, 전용 drop/stat을 남기십시오. 이 시나리오를 검증하는 테스트도 추가하십시오. |
| 4 | 🔴 | `ApmLiveProperties.java:51` | 각 설정값만 제한하고, 서비스×route×route-slot의 총 힙 예산은 제한하지 않습니다. | 허용 최댓값 조합은 `2,000 × 5,000 × 600/1 = 60억` route 슬롯입니다. 기본값의 약 27MB 추정은 이 허용 조합에서 전혀 성립하지 않으며, 기동 후 OOM으로 이어질 수 있습니다. | 교차 필드 검증으로 총 슬롯/예상 바이트 상한을 강제하거나, `maxRoutesPerService`·`routeWindowSeconds`를 서비스 수와 결합해 안전한 예산 안으로 제한하십시오. |
| 5 | 🟡 | `ApmLiveStreamController.java:61` | 라이선스는 연결 시점에만 확인합니다. | 만료·회수 뒤에도 기본 30분 동안 스트림이 유지됩니다. 설계상 감수한 정책이지만, 실시간 데이터 접근이 라이선스 통제 대상이면 즉시 회수 요구와 충돌합니다. | 정책적으로 허용한다면 최대 노출 시간 30분을 명시 승인하고, 필요 시 timeout 축소 또는 저빈도 재검증을 도입하십시오. |
| 6 | 🟡 | `ApmLiveProperties.java:128` | `windowSeconds`, `routeWindowSeconds`가 `bucketSeconds`의 배수가 아니어도 기동됩니다. | `slots()`가 내림이므로 예를 들어 route window 10초·bucket 60초면 실제 보존은 60초가 됩니다. 설정값의 의미와 실제 창이 달라집니다. | 배수 관계를 검증하거나, 응답/설정 문서에 실제 유효 창을 명확히 노출하십시오. |
| 7 | 🟡 | `ApmLiveStreamControllerTest.java` 및 `apmLiveHook.test.tsx` | 단위 테스트가 실제 쿠키 CORS·프록시 버퍼링·SSE 재연결을 검증하지 못합니다. | Mock `EventSource`와 Mockito는 URL·`close()` 호출만 보장합니다. Apache가 SSE를 버퍼링하거나 credentials 응답 헤더가 빠지는 배포 결함은 그대로 남습니다. | 커밋 뒤가 아니라 배포 전 필수 런타임 QA로 실제 브라우저, Apache, 쿠키 세션 교체, emitter 수 회복을 확인하십시오. |

## 요청서 §5 항목별 판정

1. **세션 대조 선택성:** 불합격. 기존 `VisitorIdCheckInterceptor` 의도와 다르며 우회 경로입니다.
2. **Apache·누수·라이선스:** 부분 통과. 코드상 토글 off/언마운트/필터 변경의 `close()` 및 서버 emitter 제거는 구현됐습니다. Apache·실연결은 미검증이고 라이선스 지연 회수는 정책 승인 필요입니다.
3. **메모리 27MB:** 불합격. 기본값 추정은 타당하나 허용 설정 조합 전체의 상한이 없습니다.
4. **액티브 인스턴스 합산:** 조건부 통과. 계약대로 “최신 관측값”이지만 다중 인스턴스 총 액티브로 읽히면 오해 소지가 있습니다.
5. **6칸 겹침·FE 병합:** 통과. `(serviceUid, ts)` 덮어쓰기, 창 밖 폐기, 필터 변경 시 close/reset 흐름은 일관됩니다.
6. **V43 family 분리:** 불합격. V43의 UNIQUE/cache/조회 키는 맞지만, 적재 내 불일치와 조회 병합이 여전히 잘못된 p95를 만들 수 있습니다.
7. **R3 결과 동일성:** 조건부 통과. Q1 워터마크 꼬리 overlay와 Q3 CTE의 의미는 코드상 보존됩니다. Q2는 결과 정렬을 Java로 옮겼고 null 정렬은 comparator 계약을 별도 확인할 필요가 있습니다. 성능 개선 효과는 요청서대로 미재측입니다.

## 커밋 전 반드시 고쳐야 할 것

- [ ] SSE `visitorId` 누락 통과를 제거하고, 세션 바인딩을 필수화
- [ ] `ApmHistogramMerger`에서 분할 재버킷 금지
- [ ] 동일 PK의 bounds 불일치 시 histogram 전체 무효화
- [ ] Live 설정의 총 메모리 예산 교차 검증 추가
