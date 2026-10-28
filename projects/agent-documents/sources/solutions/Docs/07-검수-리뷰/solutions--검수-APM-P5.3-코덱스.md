**판정: 🔴 수정 후 재검수 필요.** `106fcc6`·작업 트리 변경 없음 확인. 파일 수정·테스트·브라우저 실행은 하지 않았으며, 아래 재현은 코드에 근거한 절차입니다.

근거의 FE 파일은 `moveseyee_fe-p5/src/` 기준입니다.

| 항목 | 판정(✅/🟡/🔴) | 근거(파일:행) | 수정안 |
|---|---|---|---|
| 관측 없음·최신 칸 **④** | 🔴 | [active.ts:204](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/active.ts:204): 3초 이내 버킷이 없으면 `bucketAt=null`이지만 TPS는 `0`. `ApmActiveTab.tsx:207`이 그대로 숫자로 표시. 수집 지연이 3초 이상이면 완료 요청이 계속 있어도 발생 | 관측 없음과 관측된 0을 구분. 지연된 최신 버킷은 시각·지연 상태와 함께 표시하고 임의의 3초로 폐기하지 않기 |
| 동시 요청 재합산 | 🔴 | [active.ts:154](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/active.ts:154): 목록만 합산하면서 관측 수는 BE 값을 유지. BE `LiveRuntimeMetrics.java:94`는 **이미 stale을 제외**하며, `LiveSpanRuntimePayload.java:26,34`는 사전 매핑 가능한 목록과 전체 합계를 별도로 생성 | `active.value`를 정본으로 사용. 목록은 상세 설명용. FE에서 추가 제외한다면 합산 범위·참여 수를 함께 재계산하고 BE 합계와 구분 |
| 완료 버킷 없는 서비스 | 🔴 | [active.ts:215](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/active.ts:215): 타일 행을 `store.buckets`에서만 생성. `live{}`에만 있는 서비스는 전체 동시 요청에는 포함되지만 서비스 타일에는 없음 | 서비스 사전·`live`·버킷의 합집합으로 행 생성. 완료 집계 없음과 런타임 관측을 분리 |
| 지연 문구 **①** | 🔴 | [active.ts:273](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/active.ts:273): 계산값은 서버 시각−버킷 끝. 실제 표본 종료→수신 지연이 아님. `kr.json:428`은 “최신 표본 종료에서 수신”, `:639`는 p95라고 설명 | 현재 값은 “최신 집계 구간의 나이”로 명명. 종단 지연 p95는 실제 측정값이 있을 때만 표시 |
| p95 산식·한계 **③** | ✅ / 🟡 | [active.ts:89](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/active.ts:89): 유효 입력에서 BE `HistogramRebucketer.java:304,392`의 보간·무한 버킷·min/max 보정과 일치. 합산 창의 min/max도 함께 합침. 다만 `:87`의 “1초면 일치”는 **여러 서비스 합산 시 보장되지 않음** | 동일 모집단이면 일치한다고 정정. 모집단이 다른 p95의 차이를 오류로 취급하지 말고 서비스 범위·시간 창 명시. `kr.json:647`의 “소수 자리 차이”로 한정한 설명도 수정 |
| 타일·이퀄라이저 10초 창 **⑤** | 🟡 | `active.ts:226,234`, `ApmLiveServiceTiles.tsx:77`, `kr.json:469,483`: 10초 창 선택은 타당하나 타일·막대 p95에 **“약”·“최근 10초”가 없음**. 전체 p95는 1초라 같은 화면에서 의미가 다름 | 값 옆에 집계 창·근사 표기. 갱신 주기와 집계 창을 구분 |
| heap·부분 관측·문구 | ✅ / 🟡 | [ApmLiveServiceTiles.tsx:115](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/ApmLiveServiceTiles.tsx:115): null→측정 불가 정상. 그러나 heap 부분 관측을 **active 관측 수**로 판단(`:55,116`). CPU 관측 수·나이는 계산만 하고 표시하지 않음. 이퀄라이저의 “완료 처리량” 명시는 정상 | 지표별 관측 정보를 사용. heap 완전성은 현 계약으로 판별 불가하므로 그 한계를 안내. 서비스별 truncated·identity·stale도 표시 |
| wall 팝업 **②** | 🔴 | [ApmWallShell.tsx:76](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/ApmWallShell.tsx:76): 팝업 컨테이너 미지정. `apm-realtime.scss:75`의 오버레이는 z-index 1100이며 기본 Popover·Tooltip보다 높음. 전체화면 대상도 wall 요소만임 | `getPopupContainer`를 wall 내부로 지정. **antd 테마 Context는 포털에도 전달되므로 전부 라이트 토큰이라는 진단은 부정확**하지만, CSS 변수 상속·팝업 가림은 별도 문제 |
| wall 원복·접근성 | 🟡 | `ApmWallShell.tsx:36`: 리스너 해제·unmount 전체화면 종료는 있음. `beforeunload`는 `mode`를 제거하지 않음. capture 단계 Esc가 팝업보다 먼저 wall을 닫음. 덮인 앱에 `inert`·포커스 격리 없음 | 새로고침 시 wall 복원 여부를 정본과 일치시키기. 팝업 Esc 우선, 배경 포커스 차단·복귀 처리. 전체화면 종료는 자기 요소 소유 여부 확인 |
| 임계 참고선 제거 | 🔴 | [apmGauge.ts:69](/C:/solutions/moveseyee_fe-p5/src/lib/echarts/apmGauge.ts:69): 임계가 null이면 두 번째 series 생략. `ApmLiveGauge.tsx:46`은 일반 병합이므로 이전 참고선 series가 남는 경로 | 안정적인 series ID와 `replaceMerge` 또는 빈 데이터로 참고선 제거 명시 |
| 정렬·축 로컬 state **⑦** | 🟡 | `ApmActiveTab.tsx:56`: 새로고침·공유 시 오류율 축과 정렬이 초기화. UX §0의 URL 복원 원칙과 불일치 | 최소 오류율 축·정렬 모드를 URL로 저장. “한 번 정렬”의 순서 복원 정책도 명시 |
| 서비스 60개 상한 **⑧** | 🟡 | [active.ts:256](/C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/active.ts:256): 매번 TPS 상위 60개를 다시 선별하여 이름순·한 번 정렬에서도 **구성원이 교체됨**. 제한 안내는 이퀄라이저에만 있음 | 고정 구성원 또는 페이지 방식 적용. 타일에도 표시/전체 수와 제한 안내 |
| DOM 숫자 **⑥**·빈 상태 위치 **⑨**·성능 | ✅ / 🟡 | `ApmLiveGauge.tsx:53`의 DOM 숫자, `ApmActiveTab.tsx:95`의 비활성 탭 계산 가드는 타당. `ApmLiveServiceTiles.tsx:24`는 SVG라 ECharts는 최대 4개. 래퍼 unmount dispose·리스너 정리 확인. 다만 전체 버킷 순회·타일 재생성 및 inline 함수로 memo 효과 제한 | DOM·빈 상태 배치는 수용. 먼저 실제 프레임 비용 측정. wall의 게이지 높이 2배·전체 글자 확대는 정본 대비 미흡 |

**🔴 재현 방법**

1. **거짓 TPS 0:** 서버 시각을 `T`, 최신 수신 버킷을 `T−4초`, `stats.count>0`으로 구성한다. TPS는 0, p95는 관측 없음인데 10초 오류율·스파크에는 요청이 남는다.
2. **동시 요청 과소 합산:** BE 합계 `7`, 관측/기대 `2/2`, 사전 매핑 목록에는 값 `4`인 인스턴스 하나만 두고 `truncated=true`로 전달한다. 화면은 **4와 2/2**를 함께 표시한다.
3. **서비스 누락:** 사전에 서비스를 등록하고 `live[svc].active.value=5`를 전달하되 완료 버킷은 보내지 않는다. 상단 합계에는 5가 포함되지만 해당 서비스 타일은 없다.
4. **지연 오표기:** 같은 버킷의 마지막 요청 종료 시각·실제 전달 지연을 달리한다. 헤더 숫자는 그 차이를 반영하지 않고 버킷 끝과 서버 시각만 따라간다.
5. **wall 팝업:** 라이트 모드에서 wall 진입 후 서비스 Select·도움말을 열고 전체화면에서도 반복한다. 팝업은 wall 바깥에 마운트된다. 실제 가림 양상은 브라우저 확인 필요.
6. **참고선 잔류:** 컴포넌트를 유지한 채 임계가 있는 snapshot에서 임계가 null인 snapshot으로 전환한다. DOM 참고 문구는 없어져도 기존 두 번째 gauge series는 일반 병합으로 남는다.

**실 BE 연결 시 P5.3 때문에 새로 확인할 3가지**

1. **수집 지연과 화면 집계:** 정상·저트래픽·3초 이상 batch 지연에서 TPS/p95가 0 또는 관측 없음으로 잘못 바뀌는지, 집계 시각·잠정 상태가 맞는지 확인.
2. **런타임 모집단:** 사전 누락·64대 상한·90초 만료·active 미지원/CPU만 지원·완료 없는 서비스를 넣어 BE 합계, 표시 참여 수, 서비스 타일, heap 부분 관측을 대조.
3. **wall 운영:** 실제 전체화면에서 필터·도움말·Esc·새로고침·이탈을 확인하고, 60개 이상 서비스와 900초 보관 조건에서 프레임 지연·탭 숨김·반복 진입 후 인스턴스 수를 측정.

**되묻는 질문:** 없음.
