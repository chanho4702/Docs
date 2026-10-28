# RT-3 업그레이드 설치본 SLO·내보내기 전 구간 미확정 — 원인·해법 (2026-10-10)

> 발견: 런타임 QA(`features/apm/hardening-20261006/qa_apm-runtime-20261010.md` 5-B) → Claude 코드 추적 → 코덱스 확정(`_archive/features/apm/alerts/review_apm-legacy-hold-rt3-20261010_codex.md`).

## 원인 (확정)
- 기존 롤업 데이터가 있는 설치본은 V70 도입 시 `legacy_hold=true`(의도된 영구 보류 진단 — 자동 해제 없음, 수동 해제 기능도 없음).
- `bootstrap_complete`는 "역사 검증 완료"가 아니라 "도입 시점까지 dirty marker 등록 스캔 완료"일 뿐. dev 실측: stage 5 완료, stage 60 진행 중(약 2시간).
- **직접 원인은 소비자 계약**: legacy/bootstrap은 **앞쪽** [from, cutover) 문제인데 `Issue(from)` 하나로 압축되어 소비자가 `incompleteFrom` 이후(=전부)를 버림. 플래그를 꺼도 `from < cutover`면 여전히 LEGACY_UNVERIFIED.
- 영향(추정): 기존 APM을 쓰던 **업그레이드 설치본 대부분**에서 SLO 시계열·내보내기가 사실상 영구히 빔.

## 해법
### 1단계 (배포 전 필수, DB 변경 없음) — 앞·뒤 경계 분리
- `ApmMetricCoverageReader` → `Coverage{ untrustedBeforeMs, prefixReason, incompleteFromMs, suffixReason }`. 신뢰 구간 = `[max(from, untrustedBefore), min(to, incompleteFrom))`.
- cutover는 `ApmMetricDirtyStore.legacyCutover`와 같은 stage 다음 경계로 정규화. stage 60 경계 = max(stage5, stage60). dirty 검색은 `untrustedBefore` 이후에서만.
- 소비자 5곳(ApmSloService series·ApmSloCalculator·ApmAvailabilityService·ApmRedSeriesExporter·ApmEndpointExporter) + 간접(SLO 헤더·today·snapshot·burn·export plan/meta·`ApmExportCoverage`에 `LEGACY_UNVERIFIED` 분리).
- 🔴 부분 coverage에서 전체 창 지표(7/30일 예산·24h availability)는 **null/UNKNOWN 유지** — 남은 점으로 "전체 기간 값"을 만들지 않는다. 시계열 점만 표시.
- FE: `untrustedBeforeMs` 타입, SLO 상세 앞쪽 음영·"업그레이드 이전 미검증" 안내, 캘린더 사유 구분, 내보내기 경고·안전 범위 안내.
- 실 PG IT 시나리오 8종(코덱스 §테스트) — V69까지 적용한 DB에서 업그레이드 재현 포함.

### 2단계 (선택, 제품 결정) — 검증 rebuild로 신뢰 경계를 과거로 확장
- 별도 `legacy_verified_from` 경계(V78+), 권위 원본으로 재집계·검증 성공 시에만 후퇴. raw 보존 7일 한계로 자동 복구는 대체로 7일 이내.
- 🔴 `bootstrap_complete → legacy_hold=false` 단순 연결은 금지(검증이 아님).

### 3단계 (선택) — 관리자 운영 동작
- `RELEASE_RETENTION_ONLY`(디스크 확보용, 조회 신뢰는 그대로) / `ATTEST_VERIFIED`(외부 검증 증거 필요). boolean 토글 금지, 감사·버전 필수.

## 순서
1단계를 다음 작업 단위로(알람 재설계 단위와 병행 가능 — 파일 겹침 없음). 2·3단계는 사용자 결정 후.
