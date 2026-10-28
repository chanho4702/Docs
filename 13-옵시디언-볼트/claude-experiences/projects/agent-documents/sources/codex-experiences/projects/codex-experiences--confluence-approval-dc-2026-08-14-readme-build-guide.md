# Confluence Approval DC README 빌드 가이드

README에 JDK 21 Maven Enforcer와 adapter별 bytecode 기준을 분리해 기록했다. Confluence 9 adapter는 Java 17 bytecode이지만, 루트 reactor 빌드 자체는 JDK 21에서 수행해야 한다.

권장 명령은 `scripts/build.ps1`이며, Maven 직접 실행 예시와 C9/C10 동일 plugin key 혼용 금지도 포함했다.
