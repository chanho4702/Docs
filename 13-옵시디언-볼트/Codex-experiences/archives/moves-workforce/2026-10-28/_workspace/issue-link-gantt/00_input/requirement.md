# 요구사항: 이슈 연결 Gantt (WBS 확장 + 선후행 의존성)

## 한 줄 요약
Jira 3단계 계층 한계를 넘어, **커스텀 필드에 정의한 연결관계**(확장 WBS 트리 + 선후행 의존성)를
프로젝트 상세의 신규 **간트 탭**에서 시각화하고, **간트에서 관계·일정을 직접 편집**해 Jira에 write-back한다.

## 확정된 제품 결정 (사용자 답변, 2026-06-29)
1. **위치/범위**: 프로젝트 상세(`/project/:id`) **신규 탭** (단일 프로젝트의 이슈들 대상). 추후 포트폴리오 확장 가능성은 범위 외.
2. **연결관계 성격**: **둘 다**
   - (a) **확장 계층(WBS 트리)** — Jira hierarchy(Epic→Story→Sub-task, 3단계)를 넘는 부모-자식 트리. 간트 좌측 들여쓰기 그룹.
   - (b) **선후행 의존성** — finish-to-start 등 스케줄 의존. 간트 막대 사이 화살표.
3. **연결관계 데이터 소스**: **앱이 정의한 Jira 커스텀 필드**(manifest에 신규 커스텀 필드 추가).
   - 근거: Jira 계층은 3단계 제한, issue link는 전역·스키마 통제 불가. 커스텀 필드는 프로젝트 격리 + 스키마(타입/lag 등) 100% 통제.
   - 기존 커스텀 필드 패턴 보유: `projectId`, `coworker` (manifest).
4. **편집 범위**: **관계 + 일정 전면 편집(풀편집 Gantt)**
   - 간트에서 화살표/부모 연결을 **생성·삭제** → 커스텀 필드 write-back + 순환(cycle) 검사.
   - 막대 드래그/리사이즈로 이슈 **start/due 변경** → Jira에 write-back.

## 일정 데이터 (기존 재사용 가정)
- 이슈 start = `customfield_10015`(Jira 표준 시작일), due = `duedate`. (진척도 페이지와 동일 — `src/resolver/projectProgress`에서 사용 중)
- 완성률/진행 표시는 진척도 산식 재사용 검토(있으면 막대에 오버레이, 없으면 MVP 제외).

## 설계에서 반드시 풀어야 할 난제 (architect가 결정·근거 제시)
1. **커스텀 필드 스키마** — WBS 부모 포인터 + 선후행 의존성을 *어떤 필드에 어떤 형식*으로 담는가.
   - 부모(계층)와 선후행(의존성)을 한 필드에 합칠지, 분리할지.
   - Forge 커스텀 필드 타입 선택(object/string(JSON)/multi-issue 등)과 manifest 모듈 정의.
   - 방향: 선행(predecessors) 저장 vs 후행 — 그래프 도출 일관성.
   - lag·관계타입(FS/SS/FF/SF) 포함 여부 (MVP는 단순 FS depends-on부터 가능).
2. **라이브러리 적합성 재검증 (중요)** — 풀편집 + **임의 깊이 WBS 트리** + 의존성 화살표 + 드래그를 모두 만족하는지.
   - 후보 gantt-task-react는 계층 깊이가 얕을 수 있음(project 1단 그룹 위주) → **임의 깊이 트리 지원 여부를 실제 확인**.
   - 깊은 트리+의존성+드래그가 필요하면 SVAR(GPL)·DHTMLX/Bryntum(상업)·자체구현(ECharts/SVG) 중 트레이드오프 제시.
   - **상업용 마켓플레이스 앱이므로 GPL copyleft·상업 라이선스 비용은 사용자 의사결정 사항** → 설계서에 라이선스 영향과 추천을 명시(리더가 사용자에 재확인).
3. **읽기/쓰기 백엔드 계약** — 프로젝트 이슈 + 커스텀 필드 일괄 조회(read), 관계 write-back(커스텀 필드 set) + 일정 write-back(start/due set) resolver 함수와 응답 shape.
   - Jira 쓰기 API(필드 업데이트), 권한, 실패 처리. (메모리: [[feedback_no_asapp]] — resolver 경로는 asUser 유지)
4. **순환/검증** — WBS 트리 사이클(부모 루프), 의존성 DAG 사이클 방지. 자기참조·교차 프로젝트 참조 차단.
5. **3단계 Jira 계층과의 관계** — 기존 Jira 부모(parent)와 커스텀 WBS 부모를 어떻게 병합/우선할지(둘 다 있을 때).
6. **성능** — 프로젝트 이슈 N개 + 커스텀 필드 + 일정 페치. 워크로그 페처 격리 교훈([[feedback_worklog_fetch_isolation]]) 참고.

## 제약
- 메모리 준수: Jira API는 asApp 지양(resolver는 asUser), 번역은 locales/kr·en + merge.
- responseWrapper 응답 표준, 커스텀 에러 패턴.
- Forge 256MB·번들 크기(Gantt 라이브러리 추가 시 고려).
- 이번 산출물은 **설계 우선**(architect). 구현은 설계 확정 + 라이브러리/라이선스 사용자 승인 후 진행.
