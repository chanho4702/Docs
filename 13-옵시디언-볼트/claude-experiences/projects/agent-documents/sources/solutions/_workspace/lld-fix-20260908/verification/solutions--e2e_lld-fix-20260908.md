# LLD 격리 브라우저 검증 — 2026-09-08

## 범위와 안전 장치

- 수정 worktree의 실제 `LldRuleFormDrawer.tsx`와 실제 React/Ant Design을 Chromium에서 렌더링했다.
- 전용 Vite `127.0.0.1:15173`, strictPort 사용. 실제 BE/DB/Zabbix는 연결하지 않았다.
- 데이터 조회·변경 훅과 번역만 mock. 브라우저는 전용 origin 이외 HTTP 요청을 차단했다.
- 원본 저장소와 공유 서버 3000/5173을 변경하지 않았다. 패키지 설치도 하지 않았다.
- Python Playwright 미설치로 기존 npm-cache Playwright 및 기존 Chromium 1223을 사용했다.
- 종료 후 브라우저를 닫았고, 직접 기동한 `runtime-server.cjs` PID 48980을 확인하여 종료했다. 15173 리스너가 사라진 것을 확인했다.

## 결과

| 흐름 | 실제 관찰 및 어서션 | 판정 |
|---|---|---|
| A 편집 → B 상세 로딩 | A 이름 초기 표시 확인, B 전환 후 저장 버튼 disabled, A 이름 제거, mutation 0회 | 통과 |
| B 로딩 완료 → 저장 클릭 | B 이름/키 표시, interfaceId 1001 직접 입력 후 저장 클릭, payload itemid B·name Rule B·key key.B 확인 | 통과 |
| B 편집 → 취소로 생성 모드 | 취소 버튼 실제 클릭 후 name/key 빈 값 확인 | 통과 |
| 런타임 예외 | pageerror 0건 | 통과 |

실제 캡처한 저장 payload:

```json
{"itemid":"B","body":{"name":"Rule B","key":"key.B","type":0,"delay":"1h","interfaceId":"1001","extra":{},"description":"","status":0,"lifetime":"7d","lifetimeType":0,"enabledLifetimeType":1,"filter":{"evaltype":"0","formula":"","conditions":[]},"lldMacroPaths":[],"preprocessing":[],"overrides":[]}}
```

실행 stdout:

```text
PASS R2: A → B loading disables save and clears A name, mutation count 0
PASS R2: loaded B actual save click payload [위 JSON]
PASS R2: B edit → create clears name and key
PASS browser page errors: 0; external requests blocked; no live API
```

## 재현

`verification` 폴더에서 첫 터미널 `node runtime-server.cjs`, 두 번째 터미널 `node runtime-check.cjs`를 실행한다. 종료 시 본인이 기동한 server 프로세스만 종료한다.

## 한계

실제 인증/API/Zabbix CRUD 통합 검증이 아니다. 이번 런타임 검증은 R2 사용자 폼 전환·저장만 대상으로 하며 R1/R3~R7 전체 런타임 통과를 의미하지 않는다. 최초 저장 시도는 mock 상세의 interfaceId 누락으로 필수값 검증에 차단됐으며, 재현 스크립트에 UI 입력을 추가한 최종 실행은 exit code 0으로 통과했다.
