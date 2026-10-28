# E2E 런타임 검증 — 디스크 "추이 + 현황(정합)"

- 일시: 2026-06-24
- BE: **최신 Spring**(`moveseye-be-spring/build/libs/moveseye-be-0.0.1.jar`, 빌드 15:49) on :3000 (PID 12928, 본 검증용 재기동)
- FE: Vite dev :5173 (`VITE_API_URL=http://localhost:3000` → 최신 Spring 연결 확인)
- 대상 그룹: group **2 = Linux servers** (호스트 40대, 디스크 데이터 호스트 6대)
- 산출물: 스크린샷 `e2e-diskcur-0{1..4}.png`, 정합 raw `e2e_disk_current_consistency.json`

---

## 핵심 결론

**막대 ↔ 상세표 정합 = PASS.** 사용자가 찝찝해하던 "추이와 상세가 안 맞음"이 해소됨.
- API 레벨: group 2의 `/disk/current` 40개 호스트 전부 `/disk/detail` 합산과 일치(used/total/fsCount/pused). **불일치 0건.**
- 화면 레벨: 현황 막대의 호스트 사용률 = 그 호스트 드롭다운 선택 시 상세표 마운트 가중합과 모순 없음(예: 10.220.0.52 막대 25% ↔ 상세표 가중합 25.3%).
- 리소스추이 탭 현황 막대 == 리포트 탭 현황 막대(동일 `/disk/current` 소스).

---

## 시나리오별 판정

| # | 시나리오 | 판정 | 근거 |
|---|---|---|---|
| A-1 | 리소스추이 disk: "Period Trend"(기간 추이) 시계열 차트 + Average/Maximum 토글 노출 | **PASS** | `e2e-diskcur-01` 상단. disk 시계열 막대(4호스트) + Average/Maximum segmented 노출 |
| A-2 | "Disk (Current)" 현황 섹션: 호스트별 현황 막대 + 호스트 드롭다운 + 마운트 상세표 | **PASS** | `e2e-diskcur-01` 하단. "Disk Usage (Current)" 막대 + Host 드롭다운 + 상세표 |
| A-3 | 현황 막대: 데이터 있는 호스트만, 사용률 내림차순 | **PASS** | 40호스트 중 6개만 막대(pused null·fsCount 0 제외), 46.5→25→15→11→7→7% 내림차순. 필터/정렬은 `HostGroupDiskCurrentChart.tsx:57-69` |
| B | ★ 정합성: current usedBytes/totalBytes/fsCount/pused == detail 합산 | **PASS** | `e2e_disk_current_consistency.json` realFailures=0. 화면도 일치 |
| C | 리포트 탭: 평균/최대/최소 표 **유지** + "Disk Usage by Host (Current)" 막대 **추가** | **PASS** | `e2e-diskcur-04`. Resource summary 표(Disk Avg 45.86/Max 76.70/Min 7.20%) 유지 + 디스크 현황 막대 추가 렌더 |
| - | 인증 가드 (토큰 없음 / x-visitor-id 없음) | **PASS** | 둘 다 HTTP 401 (INVALID_TOKEN / Missing x-visitor-id header) |

---

## B. 정합 대조 (가장 중요) — 실데이터 호스트 6대 spot-check

`/hosts/2/disk/current` 호스트값 == `/host/{id}/disk/detail` filesystems 합산

| host | hostId | current used / total / fs / pused | detail 합산 used / total / fs / calcPused | 일치 |
|---|---|---|---|---|
| 10.220.0.52 | 10635 | 13305431040 / 52498003968 / 2 / 25.34 | 13305431040 / 52498003968 / 2 / 25.34 | ✅ |
| 10.220.0.92 | 10638 | 7191981056 / 101229563904 / 2 / 7.10 | 동일 / 동일 / 2 / 7.10 | ✅ |
| 10.220.0.93 | 10647 | 3419832320 / 29372829696 / 2 / 11.64 | 동일 / 동일 / 2 / 11.64 | ✅ |
| 10.220.0.70 | 10652 | 31343050752 / 67410931712 / 2 / 46.50 | 동일 / 동일 / 2 / 46.50 | ✅ |
| (dup .92) | 10695 | 7191981056 / 101229563904 / 2 / 7.10 | 동일 / 동일 / 2 / 7.10 | ✅ |
| zabbix-server | 10696 | 148913270784 / 964179525632 / 4 / 15.44 | 동일 / 동일 / 4 / 15.44 | ✅ |

- 추가로 fsCount>0 이지만 size 값이 0인 호스트(예 10634/10636…)도 current==detail(둘 다 0) → 정합 위반 아님.
- 데이터 없는 호스트(pused=null, fsCount=0)는 current 배열에 포함되나(계약 line 69 의도), FE가 막대에서 제외(검증됨).
- `pused`는 **용량 가중** 사용률(계약 line 64-65). 상세표의 마운트별 사용률(예 10652: `/`=48.5%, `/boot`=72.8%)이 막대값 46.5%와 달라 보이는 것은 정상(단순평균 아님, 큰 마운트 가중).

### 화면 레벨 교차검증 (10.220.0.52)
- 막대: ≈25%
- 드롭다운 .52 선택 시 상세표: `/` 12.08GB/48.43GB(26.30%), `/boot` 318.20MB/473.96MB(71.50%)
- 가중합: (12.08+0.318)/(48.43+0.474) ≈ 25.3% → **막대와 모순 없음** ✅

---

## 재현 명령

```
# 1) 최신 Spring jar 기동 (:3000)
powershell -File C:\solutions\_workspace\_run_spring_jar_3000.ps1
# 2) 정합 raw 대조
node C:\solutions\_workspace\e2e_disk_consistency_probe.cjs
# 3) UI E2E (리소스추이 disk + 리포트)
node C:\solutions\_workspace\e2e_disk_current_ui.cjs
```

## 알려진 테스트 노이즈 (제품 버그 아님)

- UI 러너의 가상스크롤 드롭다운 선택이 10635에서 한 번 실패(picked=null)했으나, 화면 캡처상 .52는 정상 선택·정합되며 API 레벨에서도 PASS. 러너 셀렉터 타이밍 이슈일 뿐 제품 결함 아님.
- 1차 정합 probe에서 "34 failures"로 보였던 것은 probe가 `null pused == null pused`를 fail로 처리한 거짓 양성. 로직 수정 후 realFailures=0.

## 산출물 경로

- `C:\solutions\_workspace\e2e_disk_current_consistency.json` — current vs detail 합산 비교표(40호스트)
- `C:\solutions\_workspace\e2e_disk_current_ui_result.json` — UI 시나리오 결과 + diskReqs
- `C:\solutions\_workspace\e2e-diskcur-01-resource-trend-disk-full.png` — 리소스추이 disk 기간추이+현황 전체
- `C:\solutions\_workspace\e2e-diskcur-02-status-bar.png` — 현황 막대 클로즈업
- `C:\solutions\_workspace\e2e-diskcur-03-bar-host-detail.png` — 막대 호스트 선택 → 상세표
- `C:\solutions\_workspace\e2e-diskcur-04-report-disk-bar.png` — 리포트 디스크 현황 막대
