# Confluence Approval DC — 빌드 복구와 Flow 사용자 선택

## 빌드 환경

Confluence 9 플러그인은 Java 17 target, 전체 Maven reactor는 Java 21을 요구한다.
Maven이 PATH에 없으면 프로젝트 내부 `.tools`의 Maven 3.9.x로 실행할 수 있다.
`mvn -pl approval-confluence9 -am package`로 C9 JAR를 생성한다.

## OSGi 설정 조회

SAL `PluginSettingsFactory`는 `ComponentLocator`가 아니라 plugin-scoped OSGi service로 조회한다.
이 차이는 WebPanel 초기화 실패를 막는다.

## Flow 사용자 선택

Flow 설정은 `/users?query=` 결과의 `user.key`를 승인 단계에 저장한다.
표시명이나 username을 저장하면 rename·directory 차이에서 Flow가 깨질 수 있다.
