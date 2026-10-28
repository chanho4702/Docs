# Confluence Approval DC: 재기동 없는 만료 주기 재등록 (2026-08-20)

- scheduler의 기존 job 제거는 최초 등록처럼 job이 없을 때 예외가 날 수 있다. 이를 전체 재등록 실패로 처리하면 설정 저장 후 Confluence 재기동을 안내하는 잘못된 UX가 된다.
- 만료 sweep·알림 drain scheduler는 기존 job 제거 실패를 debug로 남기고 새 job 등록을 계속 시도하도록 보정했다.
- 오류 문구에서도 재기동 안내를 제거했다. 실제 등록 실패 때는 잠시 후 재저장을 안내한다.
- JDK 21 `mvn -pl approval-confluence9 -am package`가 테스트 포함 성공했다.
