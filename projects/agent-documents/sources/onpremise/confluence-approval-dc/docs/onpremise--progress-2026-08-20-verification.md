# 검증 기록 — 2026-08-20

## 목적

현재 소스와 사용자·운영 문서의 정합성을 확인하고, 배포 가능 여부를 다시 판정했다.
검증 도구는 프로젝트의 고정 toolchain(JDK 21, Maven 3.9.16)과
`scripts/build.ps1`을 사용했다.

## 결과 요약

| 범위 | 결과 | 근거 |
|---|---|---|
| `approval-domain` | 통과 | `clean verify` 성공, JUnit 61개 성공(실패·오류·skip 0) |
| `approval-confluence9` package | 통과 | `mvn -B -pl approval-confluence9 -am package` 성공, domain 61건·C9 adapter 187건 통과 및 JAR 생성 확인 |
| `approval-confluence10` 전체 build | 미실행 | C10은 현재 고객 배포 대상이 아니며 별도 검증이 필요함 |
| 전체 release gate | 미실행 | `scripts/build.ps1 -Target all` 및 `scripts/release-check.ps1`의 최신 통과 결과는 아직 없음 |

현재 상태는 **C9 package와 단위 테스트는 통과했지만, 전체 release gate와 고객 환경 다중 node 검증은 미완료**다.
따라서 이 기록만으로 고객 운영 배포 승인을 확정하지 않는다.

## 확인한 구현 범위

- `approval-domain`은 Atlassian API 없이 상태 전이, 순차 승인, 만료, 동시성 잠금 규칙을 제공한다.
- C9 adapter는 업무함·설정·Flow·그룹·알림·전자서명·위임·감사 이력을 포함한 현재 제품 범위다.
- C10 adapter는 page panel, macro, 기본 REST/AO 저장소만 있는 초기 구현이다. C9 사용자·관리자
  가이드의 기능을 C10에 제공한다고 해석하면 안 된다.
- 승인/반려 REST 경로는 로그인 사용자와 페이지 권한을 서버에서 검사한다. UI 노출만으로 권한을
  판단하지 않는다.

## 재검증 방법

1. 로컬 Confluence와 AMPS Cargo를 완전히 종료한다.
2. 필요할 때만 `./scripts/run-confluence.ps1 -Target confluence9 -ResetContainer`로 Cargo 설정을
   정리한다. 이 옵션의 범위는 `target/container`이며 Confluence 데이터 홈을 삭제하지 않는다.
3. 루트에서 `./scripts/build.ps1 -Target all`을 실행한다.
4. C9 배포 전에는 `powershell.exe -File scripts/release-check.ps1`도 exit 0인지 확인한다.
5. C9과 C10 JAR은 같은 plugin key를 공유하므로 같은 실행 인스턴스에 함께 설치하지 않는다.

## 문서 갱신

- README의 C10 상태 안내를 오래된 진행 기록 대신 현재 `compatibility.md`와 이 검증 기록으로
  연결했다.
- 호환성 문서에 이번 로컬 검증의 통과 범위와 파일 잠금으로 보류된 범위를 명시했다.
## 추가 검증 — C9 재패키징 및 cluster lock fail-closed (2026-08-20)

이후 로컬 Confluence 파일 점유 없이 `mvn -B -pl approval-confluence9 -am package`를 다시 실행했다.
결과는 성공이며, `approval-domain` 61건과 C9 adapter 187건의 테스트가 모두 통과했다.
배포 산출물 `approval-confluence9-1.0.0.jar` 생성도 확인했다.

또한 `ClusterLockService` OSGi 조회 실패 시 기존처럼 lock 없이 상태 변경을 수행하지 않도록 수정했다.
이 경우 `APPROVAL_LOCK_TIMEOUT` 오류를 반환하고 REST 요청은 HTTP 409 Conflict로 종료된다.
따라서 Data Center 환경에서 lock 서비스를 확보하지 못한 상태의 승인·반려·회수·만료는 저장되지 않는다.
Confluence 재기동을 안내하거나 요구하지 않는다. 관리자 또는 지원 담당자가 앱 상태를 확인하고, 필요하면 앱을 다시 활성화한 뒤 요청을 다시 시도한다.

이 결과는 단일 개발 환경의 빌드·단위 테스트 범위다. 실제 고객 환경의 지원 DB와 1/2/4 node 동시 처리 검증은 여전히 배포 전 수행해야 한다.
