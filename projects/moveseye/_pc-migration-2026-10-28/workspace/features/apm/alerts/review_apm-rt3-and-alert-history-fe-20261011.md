# 검수 요청 — FE 2건: RT-3 화면 반영(master) · 알람 이력 화면 반영(브랜치) (2026-10-11)

## A. RT-3 FE — `C:\solutions\moveseyee_fe` master 작업 트리, 미커밋. diff `scratchpad/rt3-fe.diff`
- BE `47d9443`(master) 계약: `features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md` 끝 RT-3 절·개정 절 FE 요청 1~8.
- 타입: SLO series·export plan `untrustedBeforeMs`, unknownReason `LEGACY_UNVERIFIED`, RED coverage 7값 정의.
- SLO 상세: 앞·뒤 경계 음영(차트 창 안으로 클리핑)·각주 분리, 경계 하나라도 있으면 번다운·예산 열 숨김 + 안내. 헤더 사유 표시 신설.
- 캘린더: 업그레이드 당일 오늘 칸 측정 불가·전용 툴팁, 과거 칸 SLI 있고 예산·번 null이면 "—" + 일반 문구.
- 내보내기 모달: 경계 있으면 경고, 기간 안 경계면 "X부터 받기"(from만 바꿔 재계획)·"원래 기간으로", 기간 전체면 버튼 없이 경고. 다운로드는 막지 않음.
- RED 도움말 LEGACY_UNVERIFIED(기다려도 안 채워짐) vs ROLLUP_INCOMPLETE(기다리면 채워짐).
- 검증: tsc·contract·eslint 통과, 관련 7스위트 161 + 재실행 3스위트 120 통과.

## B. 알람 이력 FE — 워크트리 `C:\worktrees\apm-alert-history-fe`(브랜치 `apm-alert-history`), 미커밋. diff `scratchpad/alert-history-fe.diff`
- BE 단위 1 `7bb657b`(BE 브랜치 `apm-alert-history`, 미병합) 계약: `ApmAlertEventDto` + scope·resolveReason·ruleDeleted·serviceDeleted, 지워진 serviceUid 필터 허용. 개요·위젯 DTO의 serviceDeleted는 BE 단위 2·3에서 추가 중(FE는 선택 필드로 미리 수용).
- 알람 탭: 삭제된 규칙(종류 + 태그, 링크 없음 — 편집 권한자에게 규칙 화면 링크 신설), 삭제된 서비스(이름 + 태그, 링크 없음), 해소 사유 열(열림 —, null+해소 "기록 없음"+툴팁, 7사유, 미지 값 원문), SYSTEM 축은 scope로 판정·"시스템" 표시(종류 칸이 수집기/아카이브 구분), 지워진 서비스 uid 필터 유지.
- 개요 카드·홈 위젯: 삭제된 서비스 링크 없음, 시스템 표시 통일.
- 검증: tsc·contract·eslint 통과, 4스위트 127 통과.

## 의견 요청
1. A: 사유 표시가 "SLI null일 때만" 규칙 — BE가 LEGACY_UNVERIFIED와 SLI 값을 함께 보내는 경로가 있는지(BE 코드 대조).
2. A: 내보내기 좁히기 재계획 후 경계가 남는 경우 처리.
3. B: 개요 DTO에 serviceDeleted가 아직 없어 B만 먼저 병합하면 404 링크 — B는 BE 단위 1~3과 함께 병합 예정(독립 병합 금지)이 맞는지.
4. B: 알람 탭에 새로 추가한 규칙 링크(편집 권한자)가 SLO 번·시스템 규칙에도 유효한지.
