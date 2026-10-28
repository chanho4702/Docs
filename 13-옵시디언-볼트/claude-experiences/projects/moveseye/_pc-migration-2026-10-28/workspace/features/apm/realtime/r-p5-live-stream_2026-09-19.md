# R-P5 APM Live Spans SSE 실연결 1회 관측

- 실행 시각(KST): 2026-09-19 16:53:13 ~ 17:04:13 (660.006초, 11분 0.006초)
- 대상: `http://localhost:3000/apm/live/spans/stream`
- 인증: `POST /auth/login`을 이 실행에서 **한 번만** 호출하고, 반환된 `accessToken` 쿠키와 `x-visitor-id: e2e-live`를 사용했다.
- 환경 조건: dev BE와 실제 수집기가 동작 중인 공유 호스트이다. CPU·네트워크·다른 클라이언트가 격리된 환경이 아니다.
- 방법: `_tools/live-stream-probe.mjs`가 SSE wire를 바이트 줄 단위로 해석했다. snapshot CRC에는 각 `snapshot.chunk`의 `data:` 뒤 JSON 원문 UTF-8 바이트만 순서대로 누적했다. begin/end envelope와 SSE 줄 끝은 포함하지 않았다.

| 번호 | 관측값 | 조건·한계 |
|---|---|---|
| 1. CRC32 일치 | snapshot 2회 모두 일치. `330b3d78-9a00-4eb9-9b48-e67dc352fcf4`: chunk 16/16, `crc32:4487c00b`; `29c3ca6d-27a2-4e85-843c-a2cb4ba300e0`: chunk 16/16, `crc32:a62911d6`. begin 없는 chunk 0건, end 고아 0건, 종료되지 않은 snapshot 0건. | 파일 골든을 쓰지 않고 수신한 wire JSON 원문으로 계산했다. |
| 2. 이벤트 종류와 순서 | `snapshot.begin` 2건 → `snapshot.chunk` 32건 → `snapshot.end` 2건, `spans` 658건, `heartbeat` 0건, `control` 0건. snapshot마다 begin 뒤 16개 chunk와 end가 관측됐다. | 알려진 이벤트 밖의 이벤트는 관측되지 않았다. 두 번째 snapshot은 10분 재접속 직후였다. |
| 3. seq 연속성 | `spans` 658건에서 건너뜀 0건, 되돌림 0건, 형식 불량 0건. | multipart의 같은 `seq` 반복은 하나의 seq로 취급해 검사했다. |
| 4. 멀티파트 | `part: {index,count}`가 있는 spans에서 중간 part만 수신하고 연결이 종료된 경우 0건. | 같은 `seq`의 수신 part 집합이 `count`에 도달한 뒤에만 완료로 셌다. |
| 5. heartbeat 주기 | **못 쟀다.** heartbeat 이벤트 관측 0건이므로 최소·중앙값·최대 주기를 산출할 표본이 없다. | 이 관측은 spans가 계속 흘러 조용한 구간이 아니었다. 0초 주기로 해석하지 않는다. |
| 6. 장시간 유지 | 첫 연결 HTTP 200이 600.091초 유지된 뒤 서버가 응답 스트림을 종료했다. 0.253초 뒤 같은 쿠키로 HTTP 200 재접속했고, 두 번째 연결은 관측 종료까지 59.390초 유지됐다. 9.5~11분 구간에는 `spans`, 재접속 뒤 `snapshot.begin/chunk/end`, 다시 `spans`가 왔다. `control`은 0건이었다. | 11분 최소 조건 충족. 두 번째 연결은 11분 시각에 probe가 의도적으로 닫았다. |
| 7. 표본 종료→수신 | `spans` 프레임 655개에서 최신 점의 `endTs` 대비 수신 시각: 최소 0.811초, 중앙값 1.734초, p95 1.895초. | 이는 **표본 종료→수신**이다. 브라우저 렌더·상태 병합을 포함하지 않으므로 요청 종료→화면 지연이 아니다. 최신 `endTs`가 없는 spans 3개는 표본에서 제외했다. |

## 어긋남

관측된 계약 어긋남은 없다. 10분 재활용은 `control`이 아니라 서버의 SSE 응답 종료로 나타났고, 이후 재접속 시 새 snapshot이 전송됐다.

## 못 잰 항목

- heartbeat 최소·중앙값·최대: heartbeat 표본 0건이다. 데이터가 지속적으로 도착한 이번 공유 호스트 관측에서는 heartbeat가 발생하지 않았다.
- 요청 종료→화면 지연: 이 probe는 서버 SSE 수신까지만 측정하며 브라우저 화면 렌더를 계측하지 않는다.

## 실행 출력 원문 요약

```text
관측 660.006초, snapshot.begin 2, snapshot.chunk 32, snapshot.end 2,
spans 658, heartbeat 0, control 0.
첫 연결 600.091초 후 서버 종료, 0.253초 뒤 재접속.
```
