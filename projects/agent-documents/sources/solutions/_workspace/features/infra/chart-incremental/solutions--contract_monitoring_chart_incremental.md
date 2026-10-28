# ZM-138 API 계약 — 모니터링 차트 자동 갱신·증분 조회

> 이 문서는 ZM-139~142의 단일 접점이다. 현재 `line-charts` API를 바꾸지 않고, 증분용 API를 추가한다.
> 작성일: 2026-09-07 / 상태: ZM-139 BE 구현 완료, FE 연동 대기

## 1. 해결하려는 문제와 범위

현재 상대 기간 차트는 기본 3분마다 `from`과 `to`를 새로 계산하고, 예를 들어 1시간 화면이면 매번 1시간 전체를 다시 조회한다. 마지막으로 확보한 구간 이후만 받는 계약과 브라우저 병합 규칙이 없기 때문이다.

이번 계약의 목표는 다음과 같다.

- 첫 진입은 선택한 표시 구간 전체를 조회한다.
- 이후에는 마지막으로 **완전히 확보한 구간 끝** 앞의 작은 보정 구간부터 현재까지 조회한다.
- 탭 복귀나 네트워크 재연결 뒤 긴 공백은 작은 조각으로 보충한다.
- 중복·부분 응답을 명시적으로 표시하여, 데이터가 잘린 상태에서 커서를 앞으로 보내지 않는다.

초기 구현 대상은 개별 호스트의 수치형 차트 `cpu`, `memory`, `network`이다. `disk`, `response-time`, `interface`, 사용자 선택 item 차트는 같은 규칙을 적용할 수 있으나, 동적 series 식별자와 집계 방식 확인 후 별도 확장한다. 기존 API는 그대로 둔다.

## 2. 기존 API와의 호환성

기존 API는 유지한다.

- `GET /host/{id}/cpu/line-charts`
- `GET /host/{id}/memory/line-charts`
- `GET /host/{id}/network/line-charts`

기존 응답은 배열이고 증분 응답은 조회 범위·완전성 메타데이터가 필요한 객체이다. 따라서 기존 응답 shape를 조건부로 바꾸지 않는다.

## 3. 신규 API

### 공통 형식

| 항목 | 값 |
|---|---|
| Method | `GET` |
| Path | `/host/{id}/{chart}/line-charts/incremental` |
| `{chart}` | 초기 구현: `cpu`, `memory`, `network` |
| 인증 | Bearer token + `x-visitor-id`, 기존 `/host/**`와 동일 |
| 응답 wrapper | 기존 `ApiResult` 후의 `data` payload. FE의 `useDmoveQuery` 언랩 기준으로 아래 payload를 수신한다. |

예: `GET /host/10652/cpu/line-charts/incremental?from=...&to=...&types=UTILIZATION&knownThrough=...`

### 요청 query parameter

| 이름 | 타입 | 필수 | 의미 |
|---|---|---:|---|
| `from` | epoch seconds | 예 | 화면에 남길 표시 구간의 시작 |
| `to` | epoch seconds | 예 | 이번 갱신의 목표 끝 시각. 클라이언트가 요청 시점에 정한다. |
| `types` | comma-separated string | 예 | 기존 각 차트의 `types` 규칙을 그대로 사용 |
| `knownThrough` | epoch seconds | 아니오 | 직전 성공 응답의 `coveredTo`. 데이터 포인트의 최대 timestamp나 브라우저 수신 시각을 넣지 않는다. |

`knownThrough`가 없으면 최초 전체 조회다. 있으면 BE가 다음 범위를 계산한다.

```text
effectiveFrom = max(from, knownThrough - 120초)
```

120초는 지연 도착·정정값을 다시 읽는 서버 고정 overlap이다. 클라이언트가 임의로 키우지 않으며, 설정한 자동 갱신 주기와도 별개다.

`from < to`여야 하며 `knownThrough > to`는 잘못된 요청이다. `knownThrough < from`은 최초 전체 조회와 같은 의미로 처리한다.

## 4. 응답 payload

```jsonc
{
  "requested": { "from": 1725696000, "to": 1725699600 },
  "covered": { "from": 1725699480, "to": 1725699600 },
  "coverage": "COMPLETE",                 // COMPLETE | PARTIAL
  "hasMore": false,                         // 긴 공백 보충이 더 남았는지
  "nextKnownThrough": 1725699600,           // COMPLETE일 때만 존재
  "series": [
    {
      "type": "UTILIZATION",               // 기존 type 값 그대로
      "data": [
        { "timestamp": "2026-09-07T10:59:00Z", "value": 41.2 }
      ]
    }
  ]
}
```

| 필드 | 타입 | 규칙 |
|---|---|---|
| `requested` | `{from:number,to:number}` | FE가 보낸 표시 구간. x축 보존과 요청 식별에 사용한다. |
| `covered` | `{from:number,to:number}` | 이번 응답이 실제로 조회한 구간. `knownThrough`가 있으면 overlap을 포함한다. |
| `coverage` | `COMPLETE \| PARTIAL` | 현재 ZM-139 구현에서 `COMPLETE`는 **MetricPort 조회 호출이 성공적으로 끝났음**을 뜻한다. 현 포트가 Zabbix RAW 상한으로 잘린 결과를 표시하지 않으므로, 원본 데이터까지 완전하다는 뜻으로 해석하면 안 된다. 포트가 잘림 정보를 제공하는 후속 변경에서만 `PARTIAL`을 반환한다. |
| `hasMore` | boolean | 긴 공백을 서버의 증분 조회 예산 안에서 조각으로 나눴을 때, 같은 표시 구간에 더 보충할 데이터가 있음을 뜻한다. `PARTIAL`과 다른 의미다. |
| `nextKnownThrough` | number, optional | `coverage=COMPLETE`일 때만 제공한다. 다음 요청에 넣을 값이며, `covered.to`와 같다. `PARTIAL`일 때는 생략한다. |
| `series` | array | 기존 `TMonitorChart[]`와 같은 `type`, `data` shape. 요청한 type에 데이터가 없어도 해당 series를 빈 배열로 돌려준다. |

### 긴 공백의 보충

`knownThrough`가 있는 요청은 한 번에 최대 30분의 새 구간만 처리한다. 대상 `to`까지 남은 구간이 있으면 `hasMore=true`와 해당 조각 끝의 `nextKnownThrough`를 준다. FE는 동일한 `from`, `to`, `types`로 다음 요청을 이어서 보낸다.

이 규칙은 탭 복귀·재연결 후 1시간 이상의 공백이 한 번의 RAW 조회 폭증으로 바뀌는 것을 막는다. 최초 진입의 전체 조회는 이 30분 조각 규칙과 분리하되, 기존 RAW/trend 선택과 조회 상한 정책을 적용한다.

## 5. FE 병합·복구 규칙

1. 차트 식별자는 `hostId + chart + types + 추가 selector`로 만든다. `interfaceId`처럼 결과를 바꾸는 selector도 반드시 포함한다.
2. 기간·호스트·types·selector가 달라지면 기존 series와 `knownThrough`를 버리고 최초 전체 조회한다.
3. `coverage=COMPLETE`인 응답만 병합한다. series별 키는 `type + timestamp`이며, overlap에서 같은 키가 오면 새 응답 값을 우선한다.
4. 병합 뒤 표시 범위 밖(`timestamp < requested.from`)의 점은 제거한다. x축은 `requested.from`~`requested.to`를 유지하며, 점이 없다고 시간을 압축하지 않는다.
5. `nextKnownThrough`는 성공적으로 병합한 뒤에만 저장한다. `PARTIAL`, 취소, 네트워크 실패, 응답 해석 실패에는 기존 값을 유지한다.
6. `hasMore=true`이면 다음 조각을 순서대로 요청한다. 화면을 떠나거나 차트 식별자가 바뀌면 중단한다. 요청을 병렬로 내지 않는다.
7. 탭이 다시 보이거나 네트워크가 복구되면 즉시 한 번 증분 요청한다. 이후 사용자가 고른 주기로 돌아간다.

현재 engine `SeriesPoint`와 기존 DTO는 초 단위 timestamp만 보존한다. 따라서 초기 대상은 같은 series에서 한 초에 여러 샘플을 보존해야 하는 고주파 item을 제외한다. 그 요구가 생기면 ZM-139에서 포트부터 sub-second 식별자(`ns`)를 보존한 뒤 `type + timestamp + ns`로 병합 키를 확장한다.

## 6. 자동 갱신 설정 (ZM-140)

| 옵션 | 동작 |
|---|---|
| 끔 | 최초 조회만 하고 자동 요청하지 않는다. 수동 새로고침·복귀 보충은 가능하다. |
| 30초 | 증분 요청. 수집 delay가 1분인 item에는 같은 데이터가 올 수 있다. |
| 1분 (기본) | 증분 요청. 현재 일반 item 수집 주기와 가장 잘 맞는 기본값이다. |
| 3분 | 증분 요청. 현행 기본 주기와 호환된다. |

설정은 계정 서버 설정이나 Redis에 저장하지 않는다. 초기 구현은 브라우저 `localStorage`에 로그인 사용자 ID를 포함한 키로 저장한다. 따라서 같은 브라우저의 서로 다른 사용자는 분리되지만, 다른 기기와 동기화되지는 않는다. 계정 간 동기화가 필요해질 때만 별도 사용자 설정 API를 추가한다.

자동 갱신은 상대 기간(`period`) 차트에서만 기본 활성화한다. 사용자가 과거의 고정 `from/to` 기간을 보고 있을 때는 자동으로 움직이는 `to`를 만들지 않는다.

## 7. BE 구현 경계와 부하 제어

- ZM-139는 기존 CPU/Memory/Network service가 받는 `TimeRange`를 `covered` 범위로 바꾸고, 위 wrapper DTO를 추가한다. 기존 endpoint는 변경하지 않는다.
- ZM-139는 `coverage` 필드를 추가했지만, 현재 `MetricPort`/`AdaptiveSeriesQuery`에는 RAW 상한·잘림 여부가 전달되지 않는다. 따라서 정상 호출은 `COMPLETE`로 반환하고 `nextKnownThrough`를 준다. 원본 완전성 표시는 포트 결과에 `truncated`를 추가하는 후속 작업으로 보완한다.
- `AdaptiveSeriesQuery`의 trend 빈 응답 RAW fallback도 같은 조회 예산과 완전성 표시에 포함한다.
- 이 API는 Redis에 사용자별 chart 배열을 저장하지 않는다. series와 cursor는 탭 메모리에 둔다. ZM-143의 single-flight와 짧은 공유 결과 캐시는 동일 요청을 합치는 용도로만 별도 적용한다.
- 응답 시 series별 데이터가 시간 오름차순인지 보장한다.

## 8. 오류 계약

기존 프로젝트 규약대로 HTTP status가 아니라 body `code`/`errorCode`를 사용한다.

| 상황 | 응답 |
|---|---|
| `from >= to`, 숫자 형식 오류, `knownThrough > to` | HTTP 200 + `code:400`, `errorCode:"INVALID_DATE"` (기존 `ErrorCode` 재사용) |
| 지원하지 않는 `types` | HTTP 200 + `code:400`, 기존 chart type 검증 오류 규약 |
| host 접근 불가/존재하지 않음 | 기존 host 권한·존재 오류 규약 |
| 내부 또는 Zabbix 조회 실패 | 기존 공통 오류 규약. 실패 응답에는 `nextKnownThrough` 없음 |

## 9. 완료 기준

- [x] ZM-139: CPU/Memory/Network 신규 endpoint, 120초 overlap·30분 backfill 조각·응답 coverage 필드·단위 테스트
- [ ] ZM-140: localStorage 기반 주기 선택과 1분 기본값
- [ ] ZM-141: overlap 병합, 시간축 유지, 기간/selector 변경 초기화
- [ ] ZM-142: visibility/network 복귀 시 순차 보충
- [ ] ZM-143: 같은 chart identity·covered range 요청 single-flight
- [ ] ZM-148: 실제 Zabbix delay 분포 및 호출량으로 30초/1분 기본값과 30분 조각 예산 검증

## 🔄 FE 요청사항

- [ ] (2026-09-07, Codex) ZM-140~142 구현 전에 `useChartOption` 외에 차트를 직접 조회하는 경로가 있는지 확인하고, 있다면 이 계약의 대상 여부를 기록한다.
