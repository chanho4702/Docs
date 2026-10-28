# 로컬 브랜치 정리 — 2026-10-28

사용자 지시에 따라 C:/solutions 하위 Git 저장소 8개의 로컬 브랜치 65개를 조사했다. 원격 브랜치·태그·stash·worktree 파일은 변경하지 않았다.

- 삭제 35개: moveseye-be-spring 26개, moveseyee_fe 8개, moveseye-ai 1개.
- 보존 30개: 현재/다른 worktree가 사용하는 브랜치, master/main/develop 등 기반 브랜치, 최근48시간 활동 또는 reflog 활동 판정이 불확실한 브랜치.
- 삭제 조건: 로컬 master/main에 전체 커밋이 포함됨을 merge-base로 확인, 사용 worktree 없음, 최근 활동 없음. 실행 직전에 SHA·활동 시각·worktree·병합 관계를 다시 확인하고 `git branch -d`만 사용했다.
- `zabbix-proxy`, `ZM-172`, 이번 APM 전용 브랜치와 다른 작업 파일은 보존했다.

전체 이름·원래 SHA·상류·판정·삭제 결과는 [JSON 기록](branch-cleanup-20261028.json)에 있다. 필요하면 해당 저장소에서 `git branch <원래이름> <기록된SHA>`로 이름을 복원할 수 있다. 삭제 대상 커밋은 메인 브랜치에서 계속 도달 가능하다.

최종 확인: 삭제 35개·보존 30개. 이번 기능 브랜치와 `zabbix-proxy`·`ZM-172` worktree는 계속 존재하며, 원본 master checkout은 변경하지 않았다.
