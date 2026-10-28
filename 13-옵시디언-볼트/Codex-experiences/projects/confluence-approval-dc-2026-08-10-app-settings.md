# Confluence Approval DC 앱 전역 설정 (2026-08-10)

- SAL `PluginSettingsFactory`는 `PluginSettings#get`이 `Object`를 반환하므로, 설정 저장소는 String 이외의 값도 안전하게 기본값으로 처리해야 한다.
- 반려 사유 필수 정책은 adapter가 아닌 domain overload로 전달하여 상태 전이와 감사 이벤트 불변식을 한곳에서 유지한다.
- script 블록에 JSON을 주입할 때 `ApprovalJson.write` 결과에서 `<`, `>`, `&`를 Unicode escape로 바꾸면 `</script>` 삽입을 막을 수 있다.
- C9 검증은 작업 트리에 있던 그룹 승인자 미완성 참조와 stale domain artifact 해석으로 컴파일이 차단되었다. 범위 밖 코드를 임의로 복구하지 말고 문서에 원인을 남긴다.
