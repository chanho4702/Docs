# 프로젝트 스킬 입력 UI

- ProjectModal 생성/수정 양쪽에 controlled ProjectSkillPicker 제공. 검색/직군과 선택 목록을 분리, 칩/개수/개별 삭제, unknown ID 보존.
- 기본 정보 2열(모바일 1열), 등록·수정 이력 접기, Atlaskit 색상 토큰과 다크 모드 적용.
- Form submit이 mutateAsync 완료까지 기다리고 ref로 중복 제출 방지. 저장 중 닫기/기본 필드/스킬 수정 잠금.
- catalog·기존 스킬·프로젝트 상세 실패 시 저장 차단, 조회 재시도 제공. 모달 재오픈마다 draft/session 초기화, background refetch로 사용자 draft 덮어쓰지 않음.
- insert: requestId + base fields + skillIds. update: project_id + base fields + skillIds. success data.projectId/skillIds 검증.
- transport/부분 실패 시 생성 기본정보 snapshot 유지, 같은 insert/requestId 재시도. 범위 밖 복구는 관리자 수정 권한 필요 안내. 성공으로 오인하지 않음.
- 부분 실패 및 성공 시 프로젝트 목록/칸반/요약/상세, resource projectSkills/projectMatch/activeProjects, assignment cards/board/pool 갱신. SQL 스킬 변경으로 후보 계산을 갱신하기 위한 무효화이며 일반 배정 mutation 정책을 변경하지 않음.
- 번역 source: projectSkills.json, projectSkillSave.json(kr/en). merge 생성본 반영.
- 실제 React/Atlaskit 컴포넌트를 Forge mock과 함께 Chromium에서 렌더링: 라이트/다크, 390px 모바일, 검색/선택/Enter/부분 실패 재저장 확인. 실제 Jira 설치 브라우저 확인은 미실행.
- 캘린더 CSS 겹침 수정은 이전 작업 결과로 보존.
