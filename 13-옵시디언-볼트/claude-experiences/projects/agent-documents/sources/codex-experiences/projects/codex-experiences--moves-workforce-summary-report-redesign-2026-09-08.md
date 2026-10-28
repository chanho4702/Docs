# Moves Workforce 요약 리포트 재설계

2026-09-08. [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-period-report-phase3-2026-09-08|moves-workforce-period-report-phase3-2026-09-08]] 후속.

- 사용자 피드백으로 기간 리포트를 요약 리포트로 바꾸고 analysisReport 첫 자식으로 이동했다. key periodReport와 context 전달을 유지해 CommonTab의 기존 딥링크·Suspense를 재사용했다.
- 현재 완성률 hook은 KPI에만 두고 추이·판정에는 저장된 스냅샷을 사용한다. 스냅샷 근거는 ChartTableToggle 표로 통합했다.
- 상위8+기타 차트에서도 전체 원본 표는 유지한다. byMember에 unlogged를 합칠 때 accountId로 중복 제거하고 0을 가짜 양수로 만들지 않고 경고색 라벨을 사용했다.
- 비용은 권한 boolean으로 응답을 추측하지 않고 cost 키 존재로 카드 표시를 결정한다. 따라서 초기 로딩에는 비용 카드를 예측하지 않고 메타를 전폭으로 둔다.
- 기존 다중 세션 변경은 SHA-256, 생성 번역은 periodReport 이외 namespace 비교로 보존 확인했다.
- 지정 merge 후 Jest 13 suites / 150 tests 통과. 사용자 요청으로 빌드를 하지 않았으며 실제 canvas·반응형·다크 모드 시각 검수는 별도다.
- 상세 결과: C:/CloudJira/moves-workforce/_workspace/project-period-report/runs/redesign/RESULT.md.

## localStorage 레이아웃 편집 후속

- 2026-09-08: 위젯 카탈로그는 6열 좌표로 저장하고 대시보드 12열로 변환한다. x/w의 0.5 단위를 허용해야 한 칸 드래그 결과가 유효하다.
- react-grid-layout v2는 dragConfig.handle/cancel과 gridConfig.margin을 사용한다. 비편집 리사이즈 핸들은 DOM 제거가 아니라 react-resizable-hide CSS로 숨기므로 실제 그리드 테스트도 이를 검사한다.
- 권한으로 잠시 빠지는 cost 위젯은 전체 카탈로그로 저장 상태를 정규화하고, 현재 가시 layout만 병합해 배치를 보존한다. 사용자 제거만 hidden에 기록한다.
- merge 후 지정 Jest 14 suites / 210 tests 통과. 빌드 생략, 브라우저 직접 조작은 미검증. 결과: C:/CloudJira/moves-workforce/runs/layout/RESULT.md.