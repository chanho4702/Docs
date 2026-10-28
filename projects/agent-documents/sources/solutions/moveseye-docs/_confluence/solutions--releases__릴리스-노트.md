# MovesEye 릴리스 노트

| 항목 | 내용 |
|---|---|
| 대상 독자 | 사용자, 운영자, 개발자 |
| 문서 상태 | draft |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-05 documentation baseline |
| 최종 검토 | 2026-08-05 |
| 검토 주기 | per-release |
| 정본 위치 | 배포 commit + Flyway + QA evidence |
| 적용 범위 | none; template baseline only |

# MovesEye 릴리스 노트

실제 배포 단위가 확정되기 전까지 이 파일은 형식 정본이며 `draft`다. 작업 완료일과 배포일을 혼동하지 않는다.

## Unreleased

### Added

- MovesEye 문서 정본과 Obsidian MOC 구조를 도입했다.
- 제품 개요, 빠른 시작, 사용자 가이드, 아키텍처, 데이터 모델, 로컬·검증 Runbook, 용어집을 최초 작성했다.

### Changed

- 문서의 사실 원천을 OpenAPI·Flyway·FE route·engine module dependency로 명시했다.

### Known limitations

- Application·Database·GPU Monitoring은 route 존재만으로 current 기능으로 보지 않는다.
- Prometheus adapter는 collector engine Phase 1 이후 보류 상태다.
- 환경별 실제 배포·백업·복구 Runbook은 별도 검증이 필요하다.

## 릴리스 작성 형식

```markdown
## [version] - YYYY-MM-DD

기준:
- BE commit:
- FE commit:
- latest Flyway:
- 배포 환경:
- QA evidence:

### Added
### Changed
### Fixed
### Security
### Migration / Operator action
### Known limitations
```

사용자 영향, 운영자 조치, schema·env 변경을 분리해 쓴다. commit 목록을 그대로 붙이지 않는다.
