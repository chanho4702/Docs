# Resource Profile — 프론트엔드 구현 리포트

> `02_backend_report.md` 의 실제 응답 shape 을 단일 진실로 소비. invoke `res.content` 접근 경로를 그대로 맞춤.

## 1. 소비한 응답 shape (백엔드 계약 준수)

| invoke | 접근 경로 | 소비 필드 |
|--------|-----------|-----------|
| `getResourceProfile({ accountId })` | `res.content` | `{ profile, load, inProgressIssues, experience }` |
| `getResourceLoadSummary()` | `res.content` | `{ load:[{accountId,inProgressCount,remainingEstimateSeconds}], generatedAt }` → `Map(accountId→load)` 변환 |
| `getProjectSkillMatch({ projectId })` | `res.content` | 기존 candidate + `inProgressCount`, `remainingEstimateSeconds` 2필드 |

- 세 훅 모두 `res.success && res.content` 가드 후 `res.content` 반환. 실패 시 throw → React Query isError.
- `getResourceLoadSummary`: 진행중 0건인 사람은 배열에서 생략됨 → `Map` 병합, 미존재 시 `{inProgressCount:0, remaining:0}` 취급(`useResourceLoadSummary.js`).
- **소수값 처리**: `remainingEstimateSeconds`(1인 몫/배치 합/candidate)는 나눗셈 결과 → 표기 시 `Math.round(s/3600)` 시간 변환(LoadSummaryCards / InProgressIssueList / ResourceOverviewTable / CandidateRankTable 전부 적용).
- **드로어 분할 맥락(§4.4)**: 이슈 로우 주 표기 = 내 몫(`remainingEstimateSeconds`), `participantCount>1` 이면 보조 표기 `profile.issue.shared`({total}=`issueRemainingEstimateSeconds` 원본, {count}=`participantCount`) → "Nh · N명 공유". InfoTip(`profile.load.tip`) 균등분할 근사 안내.
- **참여/종료 배지**: `participation`('assignee'→info/'coworker'→neutral), `projectHistory.closed=true`→neutral(종료).

## 2. 신규/수정 파일

| 파일 | 변경 |
|------|------|
| `utils/queryKey/resourceKeys.js` | `profile(accountId)`, `loadSummary()` 추가 |
| `pages/resource/overview/useResourceLoadSummary.js` | **신규** — 배치 부하 조회, `Map` 변환, staleTime 60s, 비차단(`isLoadPending`) |
| `pages/resource/overview/profile/useResourceProfile.js` | **신규** — 드로어 온디맨드, `enabled: !!accountId && canRead`, staleTime 60s |
| `pages/resource/overview/profile/LoadSummaryCards.jsx` | **신규** — 진행중/남은작업량(시간)/가동률(UtilBadge 재사용) + InfoTip |
| `pages/resource/overview/profile/InProgressIssueList.jsx` | **신규** — CommonTable, 참여배지 + 분할 맥락 보조표기 |
| `pages/resource/overview/profile/ProjectHistoryList.jsx` | **신규** — CommonTable, 기간(project start~end) + closed 배지 |
| `pages/resource/overview/profile/ResourceProfileDrawer.jsx` | **신규** — 우측 슬라이드 패널(3섹션). ↓ 이탈 참고 |
| `pages/resource/overview/ResourceOverviewTab.jsx` | 수정 — 드로어 상태 + `useResourceLoadSummary` 병합 주입 |
| `pages/resource/overview/ResourceOverviewTable.jsx` | 수정 — 로우 클릭→`onRowSelect`, 진행중/남은작업량 lazy 컬럼(미도착 '-'). 스킬편집 버튼 `stopPropagation` 유지 |
| `pages/resource/match/CandidateRankTable.jsx` | 수정 — 진행중/남은작업량(1인몫) 컬럼 2개 + remaining 헤더 InfoTip |
| `locales/kr/resource.json` · `locales/en/resource.json` | i18n 키 추가(아래) |

- 쿼리키 전부 `resourceKeys` 팩토리 정의. 인라인 배열 없음.
- 권한: `useResourceLoadSummary`/`useResourceProfile` 모두 기존 `canRead('RESOURCE_MANAGEMENT')` 게이트. 신규 쓰기 없음.
- 재사용: UtilBadge / SkillTags / SkillChip / StatusBadge / UserAvatar / CommonTable / InfoTip(공용).

## 3. 설계 대비 이탈 / 특기

1. **Drawer 구현 방식**: `@atlaskit/drawer` 는 **미설치**(package.json/node_modules 부재 확인). 신규 의존성 추가는 이 환경의 node 버전 이슈 이력([[project-forge-node-premature-close]] 등)상 빌드 리스크가 있어, **경량 커스텀 우측 슬라이드 패널**(fixed overlay + panel, `role=dialog`, ESC 대신 오버레이/닫기버튼)로 구현. UX 의도(우측 슬라이드 드로어)·3섹션 구조는 설계 그대로. 후속에 Atlaskit Drawer 도입 원하면 패널 컨테이너만 교체 가능.
2. **i18n 키 충돌 회피**: 설계 §6 `match.remaining.tip` 은 `match.remaining`(leaf) 과 nested JSON 충돌(한 키가 값이자 부모 불가). merge 산출물이 nested traversal 구조라 **`match.remainingTip`** 로 변경(코드·로케일 동시). 나머지 키는 설계 그대로.
3. 헤더 즉시 표기: 드로어 헤더는 프로필 도착 전 테이블 로우(`fallbackPerson`)로 아바타/직무·등급 선표기 → 클릭 반응 체감 개선(§4.4 온디맨드 지연 완화).

## 4. i18n merge 실행 여부 — **실행 완료**

- 키 추가 위치: `locales/kr/resource.json` · `locales/en/resource.json` (merge 소스 폴더).
- `cd static/ui && npm run merge` 실행 → `ko-KR.json`/`en-US.json` 재생성. 산출물에서 키 존재 검증 완료:
  - `resource.col.inProgress/remaining`, `resource.profile.*`(title/section/load/issue/participation/history), `resource.match.load/inProgress/remaining/remainingTip` 전부 kr·en 반영 확인.
- `ko-KR.json`/`en-US.json` **직접 수정 안 함**.

## 5. 빌드/테스트 결과

- `cd static/ui && CI=true npm run build` → **성공**. "Compiled with warnings" = 사전 존재하던 3rd-party source-map 경고(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. 신규/수정 파일발 경고·에러 **없음**.
- `cd static/ui && CI=true npm test` → **8 suites / 74 tests 전부 통과**(회귀 없음).
