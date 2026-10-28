# 설치·운영 로드맵과 작업 가이드

작성일: 2026-10-27 / 현재 단계: 설계 / 아래 명령은 향후 코드 구현 후 사용할 절차 예시다.

![코드 변경 흐름](images/operations.png)

## 1. 단계별 로드맵

| 단계 | 작업 | 선행 조건 | 완료 판정 |
|---|---|---|---|
| 0. 설계 확정 | CPU·SSD·NIC·IP·콘솔·OS·VPN·state·백업 결정 | IDC 정보 | 미결정 표 해소 |
| 1. 호스트 bootstrap | Proxmox 설치·업데이트·초기 계정·TLS 신뢰·콘솔 확보 | 원격 콘솔 | 제한된 출발지에서 접속 |
| 2. 호스트 네트워크 | bridge·routing·NAT·방화벽을 별도 playbook으로 구현 | 관리 복구 경로 | 망 간 차단·인터넷 송신 확인 |
| 3. VM 템플릿 | cloud image 검증·cloud-init·guest agent·Python·SSH 준비 | guest OS 결정 | 테스트 clone에 SSH·Ansible 접속 |
| 4. OpenTofu 기반 | provider 고정·API 토큰·외부 backend·locking·VM 명세 | 템플릿·storage·node | plan 검토·VM 생성 |
| 5. VPN bootstrap | 임시 관리 경로로 VPN 설치·OTP·계정·권한·라우팅 | VPN VM | 새 VPN 세션으로 서비스·관리 접속 |
| 6. 게스트 구성 | baseline·SSH·Docker·내부 서비스·DB·외부 proxy 구성 | VPN 정상 | 서비스 기능·접근 통제 확인 |
| 7. 운영 체계 | backup·monitoring·알림·로그·update·자동 시작 | 서비스 동작 | 알림·백업·재부팅 검증 |
| 8. 운영 전환 | 임시 경로 제거·접근회수·복원·음성 테스트 | 위 단계 통과 | 검증표 승인·구성 버전 태그 |
| 9. 자동화 확장 | PR 검사·plan·승인·외부 runner·drift 점검 | 수동 운영 절차 안정 | CI 계정 권한·실패 복구 확인 |

일정은 장비 접근·VPN 라이선스·서비스 종류 확인 후 산정한다. 검증되지 않은 예상 소요 시간을 확정 일정으로 기록하지 않는다.

## 2. 최초 구축 — VPN 순환 의존 해결

VPN이 아직 없는데 VPN을 통해서만 자동화 도구가 접속하도록 하면 첫 설치를 할 수 없다. bootstrap과 정상 운영 경로를 분리한다.

1. IDC 원격 콘솔로 설치하고 공인 IP와 기본 경로를 확인한다.
2. 관리자 현재 공인 IP에서만 필요한 Proxmox API·SSH를 임시 허용한다. 고정 IP가 없거나 허용 경로를 만들 수 없으면 콘솔을 이용한다.
3. 호스트 bridge·NAT·접근 정책을 만든다. 관리 접속이 끊겼을 때 복구할 이전 설정과 절차를 준비한다.
4. template와 OpenTofu를 통해 VPN VM을 생성한다.
5. 관리자 PC에서 호스트 SSH를 ProxyJump로 사용하여 사설 VPN VM에 접속하거나 콘솔에서 설치한다. VM의 SSH를 인터넷 전체에 포워딩하지 않는다.
6. Ansible로 VPN을 설정하고 개인 OTP 등록을 수행한다.
7. 새 클라이언트 세션에서 VPN 접속 후 호스트 API와 VM SSH가 모두 되는지 확인한다. WSL에서 실행한다면 WSL 내부에서 별도로 확인한다.
8. 운영 inventory·API endpoint를 VPN 관리 주소로 전환한다.
9. 임시 공인 관리 허용을 제거하고 외부에서 차단을 재확인한다. 유지할 비상 고정 IP 예외가 있으면 목적·담당자·회수 기준을 기록한다.

호스트 네트워크 변경은 콘솔 접근과 되돌림 준비 없이 실행하지 않는다. Ansible 접속 자체가 끊어지면 rescue task도 동작하지 않을 수 있으므로 로컬 예약 복구 또는 콘솔 복구 절차를 별도로 준비한다. 확인 후 예약 복구를 해제한다.

## 3. 템플릿·VM 생성 기준

- 공식 cloud image를 사용하고 제공되는 checksum/signature를 검증한다.
- guest OS 버전과 이미지 식별자를 기록한다.
- cloud-init, SSH, Python, qemu-guest-agent가 기대대로 동작하는지 확인한다.
- 템플릿에 개인 비밀키·공유 사용자 비밀번호를 남기지 않는다.
- clone의 machine identity와 SSH host key가 재사용되지 않는지 확인한다.
- 템플릿 VM ID·storage·network bridge 이름을 명시한다.
- 테스트 VM에서 provider schema·권한·disk clone·IP 설정을 확인한 뒤 운영 VM을 생성한다.
- 운영 VM을 수동 생성해 가져오는 경우 import 및 plan을 먼저 확인한다. 이미 존재하는 VM 위에 새 자원을 생성하지 않는다.

## 4. 평상시 변경 흐름

### 4.1 VM 사양 변경

1. 변경 이유·영향·작업 시간을 기록한다.
2. VM 변수만 변경하고 Git diff를 검토한다.
3. OpenTofu fmt·validate·plan을 실행한다.
4. destroy·replace·disk 변경·재부팅 필요 여부를 확인한다.
5. 필요한 데이터 백업을 확인하고 검토한 plan을 apply한다.
6. guest agent·SSH·서비스·접근 정책을 확인한다.
7. no-op plan 또는 예상된 drift만 남았는지 확인하고 변경 결과를 기록한다.

아래는 향후 저장소가 구현된 뒤 사용할 예시다.

```bash
cd tofu/environments/idc
tofu init
tofu fmt -check -recursive
tofu validate
tofu plan -out=reviewed.tfplan
tofu show reviewed.tfplan
# 검토한 코드·state가 바뀌지 않은 상태에서 실행
tofu apply reviewed.tfplan
```

저장된 plan은 민감자료다. Git이나 공개 CI artifact에 올리지 않는다. 코드·state·권한·대상 환경이 바뀌면 plan을 새로 만든다. 디스크 축소와 VM 교체를 단순 설정 변경으로 처리하지 않는다.

prevent_destroy 등 삭제 보호는 보조 장치다. resource block 제거 등에서 보호가 사라질 수 있으므로 plan의 삭제·교체 탐지와 리뷰를 병행한다. [OpenTofu 자원 동작](https://opentofu.org/docs/language/resources/behavior/)

### 4.2 VM 내부 설정 변경

1. role 또는 group_vars를 변경한다.
2. YAML·Ansible lint·syntax 검사를 수행한다.
3. 비밀 노출을 차단한 상태로 check/diff를 검토한다.
4. 한 VM부터 제한 적용한다.
5. 서비스·권한·로그를 검증한다.
6. 동일 playbook 재실행 시 불필요한 변경이 반복되지 않는지 확인한다.

```bash
ansible-playbook -i ansible/inventories/idc/hosts.generated.yml   ansible/playbooks/external.yml --syntax-check

ansible-playbook -i ansible/inventories/idc/hosts.generated.yml   ansible/playbooks/external.yml --check --diff --limit external

ansible-playbook -i ansible/inventories/idc/hosts.generated.yml   ansible/playbooks/external.yml --limit external
```

check mode는 모듈 지원과 실제 실행 결과에 의존하며 성공해도 런타임 정상 동작을 보장하지 않는다. secret task는 diff를 끄고 no_log를 적용한다. shell command로 매번 설정을 덧붙이지 말고 멱등적인 module/template/handler를 우선한다. [Ansible check/diff 문서](https://docs.ansible.com/projects/ansible-core/devel/playbook_guide/playbooks_checkmode.html)

### 4.3 네트워크·방화벽 변경

일반 앱 배포와 별도 작업으로 실행한다.

1. 현재 설정·route·방화벽 backend와 규칙을 확인한다.
2. 허용할 출발지·대상·포트를 정책표와 대조한다.
3. 기존 접근을 유지한 상태에서 새 허용 규칙을 먼저 추가한다.
4. 구문 검사와 rollback 준비 후 한 호스트씩 적용한다.
5. 기존 SSH 세션이 아니라 새 세션으로 API·VPN·SSH 접근을 검증한다.
6. 허용되지 않은 방향에서 차단되는지 검사한다.
7. 불필요한 임시 허용을 제거하고 재부팅 지속성을 확인한다.

전체 nftables/iptables flush 또는 Proxmox/Docker 생성 체인 덮어쓰기는 금지한다. 호스트 INPUT, 전달 FORWARD, VM NIC 방화벽을 구분해 변경한다.

### 4.4 VPN 사용자 추가·회수

- 개인 계정·장치별 자격증명을 발급한다.
- 관리자와 일반 사용자의 권한을 구분한다.
- OTP 등록·재인증·자동 로그인 프로필 정책을 확인한다.
- 사용자 추가 시 허용 경로와 차단 경로를 모두 검증한다.
- 회수 시 계정만 비활성화하지 말고 인증서·키와 활성 세션도 회수한다.
- 비상 MFA 복구 절차는 서버 밖에 보관하고 누가 승인했는지 기록한다.

## 5. 검증 기준

| 검증 | 기대 결과 | 실행 위치 |
|---|---|---|
| HTTPS 공개 웹 | 성공 | VPN 없는 외부망 |
| 공인 IP의 8006·SSH·DB | 차단, 기록된 비상 예외 제외 | VPN 없는 외부망 |
| 잘못된 OTP·회수된 자격증명 | 접속 실패 | VPN 클라이언트 |
| 일반 VPN → 내부 웹 | 허용된 서비스만 성공 | 일반 사용자 계정 |
| 일반 VPN → 관리·DB | 차단 | 일반 사용자 계정 |
| 관리자 VPN → API·SSH | 성공 | 관리자 실행기 |
| 외부 VM → 관리망·내부망 | DB 예외 외 차단 | 외부 VM |
| VPN 사용자 주소 사칭 | 우회 불가 | 통제된 테스트 VM |
| VM 업데이트·DNS·NTP | 성공 | 각 VM |
| IPv6 | 정책 우회 없음 | IPv6 제공 시 외부·VM |
| Ansible 반복 실행 | 불필요한 변경 없음 | 관리 실행기 |
| OpenTofu 재plan | 의도하지 않은 변경 없음 | 관리 실행기 |
| 전체 재부팅 | VPN 우선 복구, 서비스 정상 | 콘솔·외부 클라이언트 |
| 외부 백업 복원 | 데이터 일관성·서비스 기능 정상 | 격리 복구 환경 |

검증은 소유·승인된 서버 범위에서만 수행한다. 테스트 날짜·대상·계정 역할·기대 결과·실제 결과·증빙을 기록한다. 현재 표는 계획이며 통과 결과가 아니다.

## 6. 장애 복구

### VPN 장애

IDC 콘솔 또는 사전 허용한 고정 관리자 IP의 SSH로 호스트에 접근한다. VPN VM 상태·네트워크·시각·로그를 확인한다. MFA 문제를 해결하기 위해 관리 화면 전체를 인터넷에 공개하지 않는다.

### 잘못된 방화벽·네트워크 변경

호스트 로컬 예약 복구 또는 콘솔로 이전 설정을 복원한다. 새 관리 세션으로 확인한 뒤 원인 규칙을 분석한다. 단순 Git revert만으로 실행 중인 방화벽은 되돌아가지 않는다.

### VM·DB 장애

격리 환경에서 외부 VM 백업 또는 DB 백업을 복원한다. 복원본의 IP·VPN·자동 시작을 통제하여 기존 운영본과 동시에 충돌하지 않게 한다. 데이터 검증 후 트래픽을 전환한다.

### 물리 서버·SSD 전체 장애

1. 외부 저장소에서 설계·Git·state·키·백업을 확보한다.
2. Proxmox를 다시 설치하고 IDC 네트워크·복구 경로를 설정한다.
3. 기존 state와 실제 VM 존재 여부를 대조한다. stale state로 바로 apply하지 않는다.
4. 백업 VM을 복원할지 새 VM을 만들지 결정하고 한 방식으로 진행한다.
5. 복원한 VM은 필요 시 import·state 매핑을 조정하고 plan을 검토한다.
6. VPN·내부 DB·외부 앱 순으로 복구하고 데이터 일관성을 확인한다.
7. 공개 전 접근 정책과 운영 검증을 수행한다.

### state·암호화 키 문제

state 버전 이력과 외부 키 보관처를 사용한다. state가 사라졌다고 기존 VM을 새로 만들지 않는다. 자원을 조사하고 import 여부를 결정한다. locking 해제는 실행 중인 작업이 없다는 증거를 확인한 뒤 수행한다.

## 7. CI 도입 순서

1. 첫 단계: lint·fmt·validate·syntax·secret 검사만 자동화한다.
2. 다음 단계: 읽기 범위를 제한한 plan을 제공하고 삭제·교체를 강조한다.
3. 이후: 승인된 변경만 외부 runner에서 apply한다.
4. 동일 환경의 apply는 직렬화하고 state lock을 사용한다.
5. 신뢰하지 않는 PR 코드에는 production credential을 제공하지 않는다.
6. 기계 ID와 사람 VPN MFA를 분리한다. OTP seed를 CI secret으로 공유해 사람 로그인을 흉내 내지 않는다.
7. drift 검사는 알림·검토용으로 시작하며 자동 원복은 초기 범위에서 제외한다.

## 8. 작업 종료 시 남길 기록

변경 이유, Git revision, 도구·provider 버전, plan의 생성·변경·삭제 건수, 실제 적용 결과, 서비스 검증, 백업 위치 식별자, 남은 위험, rollback 방법을 기록한다. 토큰·비밀번호·개인키·OTP seed는 기록하지 않는다.
