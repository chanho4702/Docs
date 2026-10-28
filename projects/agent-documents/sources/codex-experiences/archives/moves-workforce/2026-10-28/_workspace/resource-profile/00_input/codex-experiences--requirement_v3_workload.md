# resource-profile v3 — Overview 완수율 컬럼을 "작업량 3값" 표현으로

## 배경
v2에서 Overview 테이블에 "완수율" 컬럼(프로그레스 바 + %)을 넣었다. 사용자 피드백: **완수율 % 하나만으론 실제 작업량 감이 안 온다.** 절대값(총 할당/처리/남은)을 같이 보고 싶고, 진행도는 "처리 ÷ 할당"으로.

## 확정 정의 (사용자 승인)
```
처리한 양(spent) ÷ 할당 작업량 = 진행도(%)
할당 작업량 = 처리한 양 + 남은 작업량   (= spentSeconds + remainingSeconds)
```
- **총 할당 = spent + remaining** (앞서 합의: original estimate 아님 — 미입력 왜곡·>100% 방지). 총 = 처리 + 남은으로 산술 항상 일관.
- 진행도 = spent/(spent+remaining) = 기존 `completionRate`와 동일 수치.

## 변경 = 프론트 표현만 (백엔드/설계 재작업 없음)
백엔드 `getResourceLoadSummary`가 이미 `spentSeconds`/`remainingSeconds`/`completionRate`를 내려줌. `useResourceLoadSummary` Map에도 이미 있음. **백엔드 손대지 않는다.** 총 할당은 프론트에서 `spentSeconds + remainingSeconds`로 계산.

## 표현 요구 (Overview 테이블 컬럼)
- 완수율 컬럼을 **"작업량" 컬럼**으로 재구성.
- 셀에 **진행 바 + 3값 노출**: 총 할당 / 처리 / 남은.
  - 예: `[▓▓▓▓░░░░] 40%` + `처리 40h / 할당 100h` (남은 60h는 바의 빈 부분 + 툴팁, 또는 셀에 함께).
- 진행도 % = 처리/할당. `completionRate` 재사용(null이면 '-').
- 단위: 기존 표기 관례를 따르되(resource-profile는 시간 h) **드로어와 일관되게** 맞춰라(다른 작업에서 드로어를 MD로 바꿨을 수 있으니 현재 코드 확인해 일관 단위 선택). 큰 값 가독성 고려.
- (선택) 드로어 LoadSummaryCards의 완수율 카드도 같은 3값 표현으로 일관화.

## 준수
- 백엔드/계약 변경 없음. 프론트 컴포넌트(CompletionBar 또는 신규 WorkloadCell)만.
- i18n 키 추가 시 locales/kr·en 후 merge. 기존 `col.completion`/`overview.completion.*` 재사용/확장.
- 다른 세션이 같은 프론트 파일(드로어 등)을 건드렸을 수 있으니, 현재 파일 상태를 먼저 확인하고 무관 영역은 손대지 마라.
