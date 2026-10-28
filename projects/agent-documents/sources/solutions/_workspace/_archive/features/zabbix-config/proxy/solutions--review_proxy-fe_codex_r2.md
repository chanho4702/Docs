**판정: 반려 — 🔴 1건, 🟡 1건**

1차 결함 4건 중 **3건은 해소**, 최신 상세 확보 문제는 **실패 경로가 남아 부분 해소**입니다. 파일은 수정하지 않았습니다.

**1. 🔴 상세 재조회가 실패하면 이전 캐시로 저장할 수 있음**

위치: [ProxyFormDrawer.tsx:172](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:172), [ProxyGroupFormDrawer.tsx:33](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyGroupFormDrawer.tsx:33)

실패 시나리오: 이전 캐시가 있는 상태에서 Drawer를 열고 최신 상세 조회가 실패하면, React Query는 이전 데이터를 유지하면서 `isFetching=false`가 됩니다. 두 폼은 이를 준비 완료로 판단하여 **옛 상세로 채우고 저장을 허용**합니다. 네트워크 중단으로 `fetchStatus="paused"`가 되어도 같은 문제가 있습니다.

캐시의 `tlsAccept=1`, 서버의 최신 값이 `2`라면 옛 `tls_accept=1`을 전송하여 암호화를 되돌릴 수 있습니다. 실제 QueryObserver 상태 전이와 컴포넌트 제출 실행에서 캐시 재사용을 확인했습니다.

고치는 방향: **이번 열기에서 상세 조회가 성공했는지** 별도로 추적하고, 성공 전에는 캐시로 최초 채움·저장을 허용하지 않아야 합니다. 캐시가 있는 재조회 실패·일시 중단 테스트를 추가해야 합니다.

**2. 🟡 편집 중 백그라운드 재조회가 입력과 저장을 다시 차단함**

위치: [ProxyFormDrawer.tsx:430](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:430), [ProxyGroupFormDrawer.tsx:91](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyGroupFormDrawer.tsx:91)

실패 시나리오: 최신 상세로 폼을 채우고 편집하다가 다른 창에서 돌아오면, `staleTime: 0`인 상세가 재조회됩니다. `detailReady`가 다시 false가 되어 **폼 전체와 저장 버튼이 비활성화**됩니다. 조회가 지연되면 타임아웃·재시도 동안 저장할 수 없습니다. 실행에서 편집값은 보존되지만 저장이 차단됨을 확인했습니다.

고치는 방향: 최초 상세 확보와 이후 백그라운드 조회 상태를 분리해야 합니다. 이번 열기에서 정상적으로 채운 폼은 이후 `isFetching`만으로 잠그지 않도록 하고, 편집 중 재조회 테스트를 추가해야 합니다.

**1차 결함 재검수**

| 1차 결함 | 결과 | 확인 근거 |
|---|---|---|
| 최신 상세 대신 이전 캐시 사용 | 🔴 부분 해소 | 성공 응답 대기는 구현됨. 실패·중단 시 위 결함 1 발생 |
| 생성 시 이전 입력·PSK 잔존 | 🟢 해소 | `resetFields()` 적용. 편집→생성에서 설명·허용 주소 초기화, 생성 취소→재진입에서 PSK 식별자·32자 키 초기화 확인 |
| 수정 시 빈 값 생략 | 🟢 해소 | `port`, `local_port`, 그룹 `failover_delay`, `min_online`이 빈 문자열로 전송됨 |
| 모드 왕복 시 TLS 선택 손실 | 🟢 해소 | `tlsByMode` 기억·복원으로 `[1,2,4]` 왕복 후 최종 요청 `tls_accept=7` 확인 |

`resetFields` 시점은 Ant Design Drawer의 닫기·재열기 실행에서도 추가 결함이 발견되지 않았습니다.

검증은 메모리 내 React/Ant Design 실행과 QueryObserver 상태 전이로 수행했습니다. 기존 Jest **20건은 캐시 쓰기 `EPERM`으로 실행하지 못했습니다**. 그룹 폼 회귀 테스트는 현재 테스트 파일에 없습니다. `git diff --check`와 kr/en 156개 키·보간 변수 대조는 통과했습니다. 실제 브라우저 표시와 BE 연동 결과는 **확인 불가**입니다.