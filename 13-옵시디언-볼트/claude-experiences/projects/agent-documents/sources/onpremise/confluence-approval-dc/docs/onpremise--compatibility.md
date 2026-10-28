# 호환성 기준

## 지원 매트릭스

| 산출물 | Compile API | Bytecode | 지원 Confluence | 지원 Runtime |
|---|---|---:|---|---|
| `approval-confluence9` | 9.2.22 LTS | Java 17 | 9.2.x | Java 17 또는 21 |
| `approval-confluence10` | 10.2.14 LTS | Java 21 | ⚠️ **미완성 — 아래 참조** | Java 21 |

> **2026-08-19 실태** — `approval-confluence10`은 **아직 제품에 쓸 수 있는 상태가 아니다.**
> 소스가 7개뿐이고(C9는 57개), 업무함·설정 화면·알림·전자서명·위임·i18n·XSRF 필터가 모두 없다.
> 순차 승인 이전 시점에서 멈춰 있다. 현재 배포 대상 고객은 Confluence 9이므로 우선순위를 낮춰 두었다.
> **"Confluence 10 지원"을 표방하기 전에 이식을 마쳐야 한다.**

## 분리 이유

Confluence 10.2는 Java 21 전용입니다. 또한 Confluence major version 경계에서 Servlet/REST와 dependency injection API의 `javax`/`jakarta` 차이가 발생할 수 있습니다. 하나의 OSGi bundle이 두 namespace를 optional import하는 방식은 설치는 되더라도 런타임 wiring 실패를 늦게 발견할 위험이 있으므로 사용하지 않습니다.

공통 비즈니스 규칙은 Java 17로 작성한 `approval-domain`에 두고 제품 API를 호출하는 코드만 version adapter에 둡니다.

두 adapter는 같은 앱의 호환 버전이므로 Atlassian plugin key와 macro key를 공유합니다. 그래야 UPM이 9.x용 JAR에서 10.x용 JAR로의 교체를 앱 업그레이드로 인식하고, 기존 페이지의 `approval-region` macro 저장 형식도 유지됩니다. 대신 각 descriptor의 `application-version`을 방어선으로 두고, 실제 배포에서는 Marketplace 호환 버전 범위를 정본으로 관리합니다.

## CI 검증 기준

1. JDK 21에서 `approval-domain` test 실행
2. `approval-confluence9` package 및 descriptor 검증
3. `approval-confluence10` package 및 descriptor 검증
4. Confluence 9.2.x + Java 17 smoke test
5. Confluence 9.2.x + Java 21 smoke test
6. Confluence 10.2.x + Java 21 smoke test
7. PostgreSQL 단일 node 통합 테스트
8. 출시 전 지원 DB 및 1/2/4 node 검증

## 이전 로컬 검증 (참고)

2026-08-20 기준으로 `approval-domain`의 Maven `clean verify`는 JDK 21에서 통과했고,
JUnit 테스트 61개가 모두 성공했다. 같은 날 C9 전체 `clean verify`는 실행 중인 로컬
Confluence가 Cargo container 안의 JAR을 점유하여 Maven `clean` 단계에서 중단됐다.
이는 소스·테스트 실패가 아니라 실행 인스턴스의 파일 잠금이며, C9/C10 패키지 및 descriptor
검증은 인스턴스를 종료한 깨끗한 작업 환경에서 다시 수행해야 한다. 상세 로그와 검증 범위는
`progress-2026-08-20-verification.md`에 기록한다.

## 금지 사항

- Confluence 10 전용 API를 `approval-domain`에 노출하지 않는다.
- `source`/`target`만 설정하고 실제 JDK를 확인하지 않은 빌드를 허용하지 않는다.
- Java 21로 compile한 class를 Confluence 9용 JAR에 포함하지 않는다.
- 9.x와 10.x 산출물의 Atlassian plugin key, macro key, page panel key(`approval-page-panel`)를 서로 다르게 만들어 업그레이드 연속성을 깨뜨리지 않는다.
## 최신 C9 패키징 검증 (2026-08-20)

`mvn -B -pl approval-confluence9 -am package`를 JDK 21과 Maven 3.9.16에서 실행했다.
`approval-domain` 테스트 61건과 Confluence 9 adapter 테스트 187건이 모두 통과했고,
`approval-confluence9/target/approval-confluence9-1.0.0.jar` 생성까지 확인했다.

이 검증은 Confluence 9 adapter의 최신 소스 기준이다. `approval-confluence10`은 여전히 기능과 검증 범위가
부족하므로 고객 배포 대상으로 안내하지 않는다. C9 package·단위 테스트 통과는 확인됐지만,
`scripts/build.ps1 -Target all`, `scripts/release-check.ps1`, 지원 DB 및 1/2/4 node 검증은 별도 운영 검증으로 남아 있다.
