# 요구사항 — 간트 폴더 개선 2건 (2026-07-07)

`gantt-folder-layer`(2026-07-02) 후속 증분. 사용자 원문:
1. "간트차트 지금 폴더 색상 구분 좀 해야겠다 1depth랑 2depth랑 뎁스별 차이점 두자"
2. "그리고 폴더 레벨도 연결기능 가능하게 해줘"

## R1. 폴더 뎁스별 색상 구분 (프론트 전용)

- 현재: 모든 폴더 막대/그리드 행이 단일 보라(`gantt.css` §폴더 레이어 — bar #8777d9, row rgba(101,84,192,0.08)).
- 요구: **1depth(루트 폴더)와 2depth(하위 폴더) 이상을 뎁스별로 시각 구분**.
- 구현 방향(리더 스코핑):
  - `ganttAdapter.synthesizeFolderNodes`에서 parentFolderId 체인으로 depth(1-base) 계산 → 노드에 `folderDepth` 필드 추가.
  - `GanttChart.jsx`의 기존 DOM 후처리(useEffect, `gantt-folder-bar`/`gantt-folder-row` 토글)에 `gantt-folder-depth-{n}` 클래스 추가 (3 이상은 3으로 캡).
  - `gantt.css`에 뎁스별 팔레트(보라 계열 농도 그라데이션: depth1=진함 → depth3+=연함). 다크모드(`html[data-color-mode="dark"]`) 행 배경도 뎁스별 대응.

## R2. 폴더 레벨 선후행 연결 (풀스택)

- 요구: 폴더 막대에서도 링크 드래그로 선후행(FS) 연결 생성/삭제 가능하게.
- 제약/설계 포인트:
  - **폴더는 Jira 이슈가 아님** → 네이티브 issueLink 사용 불가. **앱 DB(Forge SQL) 신규 테이블** 필요 (기존 `gantt_folder`/`gantt_folder_issue` 테이블·DDL·마이그레이션 패턴 준수 — `src/rdb/schema/`).
  - 연결 조합 스코프: 폴더↔폴더, 폴더↔이슈 혼합 허용 여부는 architect가 결정(사용자 원문은 "폴더 레벨도 연결" — 최소 폴더가 한쪽 끝점인 링크. 이슈↔이슈는 기존 네이티브 경로 유지).
  - 읽기: `getProjectGanttData` 응답에 폴더 링크 병합(additive — 기존 links 배열에 합치거나 별도 folderLinks, architect 결정. 어댑터 `toSvarLinks` 소비 고려).
  - 쓰기: 신규 resolver (setGanttFolderLink 등), 순환 검증(기존 `detectDagCycle` 참조 — 이슈링크+폴더링크 혼합 그래프 순환 고려).
  - 프론트: `GanttChart.jsx` add-link/delete-link 인터셉트에서 `folder:` 접두 노드 분기 → 폴더 링크 mutation(기존 `useGanttFolderMutations` 캐시 부분 패치 패턴 — 폴더는 앱 DB라 인덱스 지연 없음).
  - ⚠️ **링크 스왑 함정(GANTT.md §3/§6)은 Jira issueLink 라운드트립 특성** — 앱 DB 폴더 링크에는 스왑 불요(정방향 저장/읽기). 계약 shape은 기존 Link `{ id, source, target, type:'FS', lag:0 }`와 동형 유지 권장.
  - 삭제 cascade: 폴더 삭제 시 해당 폴더가 끝점인 링크 정리(기존 deleteGanttFolder 승계 로직 + 프로젝트 삭제 cascade에 신규 테이블 추가).

## 참고 문서
- `src/resolver/gantt/GANTT.md` — §2 관계 저장, §3 계약, §4 링크 흐름, §6 함정(스왑 W-1, open:true, 인덱스 지연).
- `_workspace/gantt-folder-layer/` — 폴더 레이어 원 설계·백엔드·프론트 리포트(테이블 DDL, resolver, 캐시 패치 패턴).
- `_workspace/issue-link-gantt/` — 링크(선후행) 원 설계.
- 프론트: `static/ui/src/pages/projectDetail/gantt/` (ganttAdapter.js, GanttChart.jsx, useGanttMutations.js, useGanttFolderMutations.js, gantt.css).

## 검증 기준
- R1: 뎁스 1/2/3+ 폴더가 막대·행 배경 모두 시각적으로 구분. 기존 이슈 summary(초록)/task(파랑)/placeholder(회색 점선)와 충돌 없음. 다크모드 대비 유지.
- R2: 폴더→폴더(및 허용 시 폴더↔이슈) 링크 드래그 생성 → 새로고침 후 유지. 삭제 동작. 순환 시도 시 토스트 거부. 이슈↔이슈 기존 경로 무영향. 루트 `npm test` + `cd static/ui && npm test`/`npm run build` 통과.
