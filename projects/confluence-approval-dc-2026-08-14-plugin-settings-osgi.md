# Confluence Approval DC — PluginSettingsFactory OSGi 조회

## 상황

Confluence 9 WebPanel 생성 중 `ApprovalSettings.fromComponentLocator()`가 `PluginSettingsFactory`를 `ComponentLocator`에서 찾지 못해 페이지 렌더링이 실패했다.

## 결정

`PluginSettingsFactory`는 SAL OSGi service로 조회한다. 기존 `PluginScopedOsgiServiceLocator`를 재사용해 설정 조회의 단일 진입점에서 해결했으므로 panel, macro, REST, scheduler에 같은 동작이 적용된다.

## 호환성

Confluence 9 어댑터는 Java 17 target이며, Confluence 9.2 플러그인 manifest도 `application-version` 9.2.x로 제한한다. Java 8 환경에는 빌드·실행할 수 없다.
