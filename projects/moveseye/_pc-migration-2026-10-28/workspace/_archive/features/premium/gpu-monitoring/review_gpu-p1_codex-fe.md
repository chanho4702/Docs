## 검수 결과 — FE

**조건부 승인 — 🔴 0건, 🟡 5건.** 검수 범위는 깨끗한 작업 트리의 `dfb0442..183b5c3`입니다. 요청서의 “미커밋 작업 트리” 설명과 실제 상태가 다릅니다.

### 🔴

없음.

### 🟡

- 🟡 **현재값 오류가 추가 시계열 전체를 숨깁니다.**  
  [GpuDetailPage.tsx](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/GpuDetailPage.tsx:154)에서 clock·PCIe 차트 지원 여부를 `gpuValueShown()` 즉, 현재값 `OK|STALE` 여부로 판정합니다. `ERROR`, `DISABLED`, `NO_DATA`는 미지원이 아니며 과거 이력이 존재할 수 있습니다. 계약 §6의 “현재 비활성·오류인 아이템도 과거 이력은 그린다”와 어긋납니다. `status !== "UNSUPPORTED"`처럼 지원 여부와 현재 수집 상태를 분리해야 합니다.

- 🟡 **복합 차트에서 일부 계열의 `ERROR` 상태가 보이지 않습니다.**  
  [GpuSeriesChart.tsx](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/components/GpuSeriesChart.tsx:63)에서 한 계열이라도 값이 있으면 차트를 렌더하고, [오류 안내 분기](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/components/GpuSeriesChart.tsx:120)는 모든 계열이 비었을 때만 도달합니다. 예를 들어 `vram.used=AVAILABLE`, `vram.free=ERROR`이면 실패한 계열은 빈 범례로만 남고 오류·사유가 표시되지 않습니다. 계열별 상태 배지나 부분 오류 안내가 필요합니다.

- 🟡 **상세 화면 수동 새로고침이 추가 시계열을 갱신하지 않습니다.**  
  [GpuDetailPage.tsx](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/GpuDetailPage.tsx:356)의 버튼은 `detail`과 `primarySeries`만 `refetch()`하고 `extraSeries`는 제외합니다. 특히 고정 기간에서는 자동 갱신도 없으므로 clock·PCIe 결과가 계속 이전 캐시에 머뭅니다.

- 🟡 **진단의 `COLLECTION_ERROR`에는 계약상 다음 행동인 재시도가 없습니다.**  
  [GpuDiagnosticsTab.tsx](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/components/GpuDiagnosticsTab.tsx:194)에서 성공 응답의 `COLLECTION_ERROR`를 `SOURCE_ERROR` 빈 상태로 표시하면서 `onRetry`를 넘기지 않습니다. 오류 envelope 경로에는 재시도 버튼이 있지만, 동일한 소스 오류를 나타내는 collection 상태에는 안내 문구만 있고 실행 동선이 없습니다.

- 🟡 **설치 명령에 계약되지 않은 FE 환경값이 들어갑니다.**  
  [gpuSetup.ts](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/shared/gpuSetup.ts:258)의 컨테이너 포트 `9400`, `/etc/dcgm-exporter`, [메인 agent 설정 경로](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/shared/gpuSetup.ts:293)는 `guideContext` 값이 아닙니다. QA §6.2 G4가 이를 예외로 기록했지만, 이번 검수 조건인 “명령 블록에 BE 값만 끼움”에는 예외가 없습니다. 이미지나 설치 레이아웃 변경 시 FE 명령만 낡을 수 있으므로 BE DTO 확장 또는 계약상 고정값 명시가 필요합니다.

### 🟢·의견

- 계약 §3~§8·§11과 BE DTO 대비 타입 필드·nullable·epoch ms·점 표기 metric은 일치합니다. 인터셉터와 `useDmoveQuery`의 2겹 언랩도 소비자에서 payload를 직접 받도록 구현되어 있습니다.
- 7종 빈 상태, `GPU_SNAPSHOT_EXPIRED` 복구, `GPU_SCOPE_TOO_LARGE` 필터 동선, null 버킷·gap·`boundaryPartial`, 권한 게이트, 데스크톱·모바일·검색 메뉴 중복 여부는 정적 검수상 적합합니다.
- `kr.json`과 `en.json`의 `gpu.*` 하위 키는 각각 384개로 누락 차이가 없습니다.
- 접근성상 [GpuSetupGuideStep.tsx](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/components/setup/GpuSetupGuideStep.tsx:170)의 입력 설명은 `<label>`/`aria-labelledby`로 연결하는 편이 안전합니다. [gpu-setup.scss](C:/worktrees/zm-78-fe/src/pages/gpu-monitoring/gpu-setup.scss:12)의 `rgba()` 두 곳도 다크모드 실측 전 Ant Design token으로 교체하는 것을 권고합니다.
- 지정 Jest는 두 번 시도했으나 읽기 전용 환경에서 Jest haste-map 캐시 생성이 `EPERM`으로 차단됐습니다. 따라서 문서에 기록된 171건 통과는 확인했지만 이번 세션에서 독립 재실행하지는 못했습니다. 30초 타이머·비활성 탭·다크모드는 기존 테스트에도 직접 검증이 없습니다.