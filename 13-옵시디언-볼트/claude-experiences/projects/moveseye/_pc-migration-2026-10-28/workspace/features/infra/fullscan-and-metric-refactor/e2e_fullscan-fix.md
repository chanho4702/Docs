# e2e_fullscan-fix — BE(Spring) 4건 수정 런타임 재검증

- 일시: 2026-07-01
- 대상 소스: `C:\solutions\moveseye-be-spring` (be-engineer 수정 4파일 + 신규 DTO)
- 기동: `build/libs/moveseye-be-0.0.1.jar` (빌드 10:10:06, 모든 수정 소스 10:09:32 이후 → 수정 포함 확인) → `:3001`
  - env: `moveseye-be\.env` + `PORT/SERVER_PORT=3001`, `SPRING_FLYWAY_ENABLED=false`, JDK17
  - 기동 성공: `Started MoveseyeApplication ... Tomcat started on port 3001` (PID 29400, 10:56)
  - 인증: FE(:5173) 실 로그인(admin)으로 per-user Zabbix 세션 토큰 확보 후 :3001에 재사용 → 서버목록 200(13 hosts)
- ⚠️ 데이터 한계: 라이브 Zabbix 13개 호스트는 모두 dependent-only/idle 클라우드 호스트 → **인터페이스 0 / 세션 history 0 / response-time chart 0**. 값이 살아있는 항목(#1 배열, #3 dependent 폴백)은 런타임 값으로 직접 확증, 값이 0으로만 나오는 항목(#2 inner, #4 total 산출)은 shape 런타임 확증 + 동일 jar 소스의 타깃 단위테스트 값 단언으로 보강.

## 판정 요약

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | response-time/summary `data` 배열 | **반영됨** | API 배열(len=1) + FE 화면 "Oops!" 소멸 |
| 2 | session/history `[{data,type}]` 래핑 | **반영됨** | 런타임 seriesWrapped=true + 단위테스트 |
| 3 | disk line-charts dependent 폴백 | **반영됨** | dependent-only 호스트 1440포인트 반환 |
| 4 | interface total=up+down / discovery·ifNumber | **반영됨** | 런타임 200 정합 + 단위테스트 값 단언 |

---

## #1 response-time/summary — 배열 래핑 (FE .map 크래시 해소)
- repro: `GET http://localhost:3001/host/10703/response-time/summary?from=..&to=..` (Bearer + x-visitor-id)
- 결과: `data` = **배열, len=1**, element0 keys `["responseTime","packageLoss"]` (각 `{avg,max}`). httpStatus 200.
- FE 실화면(`:5173` FE를 `:3000→:3001` 리다이렉트로 수정 BE에 연결):
  - `/monitoring/network-monitoring/10703/response-time` 렌더 → **hasOops=false**, `map is not a function` 콘솔 에러 없음, Response time/Packet Loss 지표 카드(Average/Maximum) 정상 표시.
  - 스크린샷: `C:\solutions\_workspace\fixverify_resptime.png` (Phase A 크래시 증거 `runtimeverify_resptime.png` 대비 해소 확인)
  - summaryCall 캡처: `{status:200, dataIsArray:true, dataLen:1}`
- JSON: `fixverify_result.json`(fix1), `fixverify_fe_resptime.json`

## #2 session/history — [{data,type}] 시리즈 래핑
- repro: `GET http://localhost:3001/session/10703/history?from=..&to=..`
- 결과: `data` = 배열, `data[0]` = `{data:[...], type:""}` → **seriesWrapped=true** (평면 `[{timestamp,value}]` 아님). inner `data`는 idle 호스트라 0건(13개 전 호스트 스캔에도 non-empty 없음).
- 값 보강: `SessionControllerTest`(1 test) 통과 — inner point `{timestamp,value}` 구조 및 `[{data,type}]` 엔벨로프 단언.
- JSON: `fixverify_result.json`(fix2), `fixverify_scan.json`

## #3 disk line-charts — dependent-only 폴백 (vfs.fs.size → vfs.fs.dependent.size)
- repro: `GET http://localhost:3001/host/10695/disk/line-charts?types=USAGE,USED_SPACE,TOTAL_SPACE&partition=/&device=xvda&from=..&to=..`
- 결과(폴백 동작 직접 확증):
  - host **10695**: USAGE **1440 pts** (first value 7.2232 ≈ Phase A pused 7.22%), USED_SPACE 1440, TOTAL_SPACE 1440 (itemid 65121~65123 = dependent 계열)
  - host **10696**: USAGE 1440 (first 58.56 ≈ Phase A 58.67%), USED_SPACE/TOTAL_SPACE 1440 (itemid 65289~65291)
  - `vfs.fs.size[` 정확키가 없어 `toDependentKey()` → `vfs.fs.dependent.size[/,pused]`로 재조회해야만 나오는 값 → 폴백 확증. getDetail 계열과 동일 itemid.
  - baseline 정상경로 10703(partition=/)은 0 pts(해당 파티션 size item 부재) — 대조.
- 값 보강: `DiskLineChartFallbackTest`(2 tests) 통과.
- JSON: `fixverify_result.json`(fix3)

## #4 interface status — total=up+down (adminDown 이중계수 제거) + discovery/ifNumber
- repro: `GET http://localhost:3001/interface/10703/interface/status` (전 13호스트 스캔)
- 런타임 결과: 전 호스트 total=0/up=0/down=0/adminDown=0 (라이브에 net.if 인터페이스 없음) → 200 정합, total==up+down 성립. **이중계수 시나리오(adminDown>0)는 라이브 데이터로 재현 불가.**
- 값 보강(동일 jar 소스 `InterfaceServiceTest` 4 tests 통과, 직접 단언):
  - discovery LLD 배열길이 → total=3
  - discovery 없으면 ifNumber → total=5
  - 폴백 total=up+down=**2** (과거 up+down+adminDown=3에서 정정 → 이중계수 제거 확인)
  - empty → 전부 0
- JSON: `fixverify_scan.json`(interfaceAll)

---

## 산출물
- 결과 JSON: `fixverify_result.json`, `fixverify_scan.json`, `fixverify_fe_resptime.json`
- 스크린샷: `fixverify_resptime.png`
- 러너: `fixverify_run.cjs`, `fixverify_scan.cjs`, `fixverify_fe_resptime.cjs`
- 서버 로그: `fixverify_spring3001.log` / 런처: `_launch_3001.ps1`
- 단위테스트: `gradlew test --tests Interface/Session/ResponseTime/DiskLineChartFallback` → BUILD SUCCESSFUL (4/1/1/2, 0 fail)

## 재현 명령
```
# 1) 기동
powershell -File C:\solutions\_workspace\_launch_3001.ps1   # :3001, .env+PORT=3001+FLYWAY=false
# 2) 토큰(FE 실로그인)
node C:\solutions\_workspace\rtverify_login_list.cjs
# 3) 4건 API 검증
node C:\solutions\_workspace\fixverify_run.cjs
node C:\solutions\_workspace\fixverify_scan.cjs
# 4) #1 FE 화면(:3000→:3001 리다이렉트)
node C:\solutions\_workspace\fixverify_fe_resptime.cjs
```
