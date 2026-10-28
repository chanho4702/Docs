# IDC OpenTofu · Ansible 상세 설계

작성일: 2026-10-27 / 설계 상태: 검토용 / 실제 배포: 미수행

## 1. 목표와 범위

물리 서버 한 대(메모리 64GB, 디스크 1TB, 공인 IP 하나 가정)를 Proxmox로 가상화한다. VPN·내부 서비스·외부 공개 서비스 VM을 분리하고, 구성 변경을 Git과 코드로 추적한다.

이번 범위는 설계다. 물리 서버 설치, 방화벽 적용, VPN 계정 생성, state backend 생성, CI 구축은 수행하지 않았다. 단일 서버 장애를 견디는 고가용성은 포함하지 않는다.

![서비스 구성도](images/network.png)

## 2. 설계 결정

| 결정 | 이유 | 후속 확인 |
|---|---|---|
| VM 세 대로 시작 | 인증과 서비스 환경을 분리하면서 관리 대수를 제한 | 실제 서비스·부하 |
| 공인 IP는 호스트에만 부여 | VM별 공인 IP 불필요 | IDC 라우팅·게이트웨이 방식 |
| 내부 가상 브리지 분리 | 보안 영역을 구분하고 통신 정책을 명시 | 호스트 firewall backend |
| host network는 Ansible 전담 | 원격 설정 변경과 되돌림 절차를 하나로 관리 | 지원 모듈·설정파일 소유권 |
| VM 자원은 OpenTofu 전담 | 상태 추적과 변경 계획 확인 | bpg/proxmox 버전 호환 |
| 최초 운영은 관리자 PC에서 실행 | 서버 장애 시 외부에서 복구 가능 | Linux 실행 환경 |
| apply는 검토 후 수동 실행 | 단일 운영 서버의 삭제·교체 위험 확인 | 이후 CI 승인 방식 |
| state·백업은 서버 외부 | 같은 서버 장애로 복구 자료를 잃지 않음 | 보관처·비용·권한 |

## 3. 네트워크 설계

| 이름 | 주소 예시 | 역할 |
|---|---|---|
| vmbr0 | IDC에서 할당한 공인 IP | 물리 NIC 연결, 호스트 기본 게이트웨이 |
| vmbr1 | 10.10.0.1/24 | 관리·VPN 구간 |
| vmbr2 | 10.20.0.1/24 | 내부 서비스 구간 |
| vmbr3 | 10.30.0.1/24 | 외부 서비스 DMZ |
| VPN VM | 10.10.0.2/24 | 기본 게이트웨이 10.10.0.1 |
| 내부 VM | 10.20.0.10/24 | 기본 게이트웨이 10.20.0.1 |
| 외부 VM | 10.30.0.10/24 | 기본 게이트웨이 10.30.0.1 |
| VPN 클라이언트 풀 | 10.99.0.0/24 | 서버·회사·집 네트워크와 중복 검사 |

vmbr1~3에는 물리 NIC를 연결하지 않는다. 호스트의 기본 경로는 IDC 게이트웨이 하나이며 내부 브리지에 default gateway를 추가하지 않는다.

### 3.1 인터넷과 공개 서비스

- 외부에서 공인 IP의 TCP 443으로 들어오는 요청을 외부 VM으로 DNAT한다.
- TCP 80은 인증서 방식·HTTP 리디렉션에 필요할 때만 허용한다.
- VPN 접속은 제품에 맞는 별도 포트로 VPN VM에 DNAT한다. OpenVPN 후보의 포트는 실제 설치 구성에서 확정하며 기존 WireGuard 예시 51820을 그대로 사용하지 않는다.
- VPN이 TCP 443을 사용하면 공개 웹과 충돌하므로 이번 설계에서는 별도 VPN 전송 포트를 선정한다. HTTPS Reverse Proxy가 모든 VPN 프로토콜을 대신 중계한다고 가정하지 않는다.
- VM의 인터넷 송신은 지정한 사설 대역과 외부 인터페이스에만 SNAT/masquerade한다.
- DNAT는 주소 변환이다. 접근 허용은 별도의 FORWARD/VM 방화벽 규칙으로 설정한다.

### 3.2 VPN 경로

VPN VM은 관리망 NIC 하나로 시작한다. 각 VM에 여러 보안 영역의 NIC를 연결해 우회 경로를 만들지 않는다.

관리자 PC → 공인 IP의 VPN 포트 → DNAT → VPN VM에서 인증·복호화 → Proxmox gateway → 허용된 내부 서비스 또는 관리 주소.

목표 설계는 VPN 클라이언트 원본 주소를 보존하는 routed 방식이다. 호스트에는 VPN 클라이언트 풀의 반환 경로를 VPN VM으로 지정한다. OpenVPN AS의 NAT/routing 모드와 클라이언트별 주소·그룹 처리 방식은 선정 버전에서 확인한다. 단순 SNAT로 모든 사용자를 VPN VM 주소 하나로 합치면 호스트에서 개인별 권한을 구분할 수 없다.

VPN 사용자별 정책은 VPN 서버와 호스트/VM 방화벽의 역할을 나누어 적용한다. 사용자 그룹·고정 주소·주소 풀을 어떻게 매핑할지 확정한 뒤 구현한다. VM IP filter를 사용하면 VPN VM이 전달하는 클라이언트 대역도 허용 대상으로 설계해야 한다. 반대로 외부 VM에는 그 대역을 사칭할 권한을 주지 않는다.

초기에는 사설 서비스망만 VPN으로 보내는 split tunnel을 사용한다. 일반 인터넷 브라우징까지 IDC 서버를 거치게 하지 않는다.

### 3.3 방화벽 정책표

| 출발 | 목적 | 정책 |
|---|---|---|
| 인터넷 | 외부 VM | 443, 필요 시 80 |
| 인터넷 | VPN VM | 선정한 VPN 전송 포트 |
| 인터넷 | Proxmox·내부 VM | 기본 차단 |
| 관리자 VPN | Proxmox | 8006, 필요한 SSH |
| 관리자 VPN | VM | SSH와 승인된 관리 서비스 |
| 일반 VPN 사용자 | 내부 VM | 지정한 내부 웹서비스만 |
| 일반 VPN 사용자 | Proxmox·SSH·DB | 차단 |
| 외부 VM | 관리망·내부망 | 차단, 명시적 DB 예외만 |
| 내부 VM | Proxmox 관리 기능 | 기본 차단 |
| VM | 인터넷 | DNS·NTP·업데이트·필요한 앱 목적지 허용 |
| 허용된 연결의 응답 | 요청 출발지 | 상태 추적 기반 허용 |

IPv6가 활성화되어 있으면 같은 정책을 적용한다. 진단·PMTU에 필요한 ICMP/ICMPv6를 무차별 차단하지 않는다.

Proxmox 자체 INPUT과 VM 트래픽 FORWARD는 별개다. 기존 pve-firewall은 명시적 forward 규칙을 무시할 수 있으므로, 버전과 backend를 먼저 확정한다. Ansible이 backend가 생성하는 체인을 덮어쓰거나 nftables/iptables 전체를 flush하지 않게 한다. 관리되는 파일·체인·VM 규칙의 소유권을 문서화한다. [공식 방화벽 문서](https://github.com/proxmox/pve-docs/blob/master/pve-firewall.adoc)

## 4. 도구별 관리 경계

| 자원·설정 | 소유자 | 금지하는 중복 |
|---|---|---|
| Proxmox ISO 설치·공인 IP 초기 접속 | 초기 수동 runbook | VM provider로 bare-metal 설치 시도 |
| 호스트 브리지·라우팅·NAT·방화벽 | Ansible host playbook | OpenTofu에서도 같은 브리지·규칙 관리 |
| VM ID·CPU·RAM·디스크·NIC·시작 정책 | OpenTofu | Ansible로 같은 VM 자원 생성·변경 |
| cloud-init 초기 IP·관리 공개키·초기 계정 | OpenTofu | 비밀번호·개인키·OTP seed 삽입 |
| 게스트 계정·패키지·SSH·서비스 | Ansible guest playbook | cloud-init으로 계속 앱 설정 덮어쓰기 |
| 서비스 데이터 | DB·백업 도구 | Git/state를 데이터 백업으로 취급 |

cloud-init은 최초 접속을 위한 최소 설정이다. 이후 네트워크·계정 변경은 재실행 동작과 충돌을 확인해 관리한다. host playbook은 일반 서비스 배포와 분리하고 명시적으로 호출할 때만 실행한다.

OpenTofu는 bpg/proxmox provider를 후보로 한다. 구현 시 Proxmox와 호환되는 버전을 확인하고 고정하며 lockfile을 커밋한다. API 토큰만으로 가능한 작업과 SSH가 필요한 작업을 구분한다. 자동화 편의를 위해 무조건 root@pam 자격증명을 공유하지 않는다. [Provider 문서](https://github.com/bpg/terraform-provider-proxmox/blob/main/docs/index.md)

## 5. 제안하는 코드 저장소 구조

아래는 향후 생성할 구조이며 현재 구현 파일은 없다.

```text
idc-infra/
  README.md
  docs/
    architecture.md
    bootstrap.md
    recovery.md
    access-policy.md
    images/
  tofu/
    environments/idc/
      versions.tf
      providers.tf
      backend.tf
      main.tf
      variables.tf
      outputs.tf
      terraform.tfvars.example
    modules/vm/
  ansible/
    ansible.cfg
    requirements.yml
    inventories/bootstrap/
    inventories/idc/
      hosts.generated.yml
      group_vars/
    playbooks/
      host-network.yml
      base.yml
      vpn.yml
      internal.yml
      external.yml
      verify.yml
    roles/
      host_network/
      baseline/
      ssh_hardening/
      vpn/
      container_runtime/
      reverse_proxy/
      backup/
  scripts/
    render_inventory.py
  tests/
    acceptance.md
  .gitignore
```

- VM 주소·VM ID·역할의 정본은 OpenTofu 변수와 outputs로 둔다. 역할 표기는 vpn/internal/external로 일관되게 사용한다.
- outputs에는 비밀정보 없이 hostname, IP, 역할, SSH 사용자만 노출한다.
- inventory 생성기는 필요한 outputs만 선별해 생성한다. 전체 state를 inventory로 복사하지 않는다.
- hosts.generated.yml은 자동 생성 대상으로 수동 편집하지 않는다. 수동 서비스 변수는 group_vars로 분리한다.
- bootstrap inventory는 VPN 이전 임시 접속 경로를 기록한다. 운영 inventory와 혼동하지 않도록 분리한다.
- .gitignore에 state, state backup, plan 파일, .terraform/, 개인 tfvars, 평문 비밀, 생성 inventory를 제외한다. provider lockfile은 제외하지 않는다.
- 임시 다운로드·PNG 검증 파일과 실행 코드는 향후 저장소에서 분리한다.

## 6. 실행 위치와 자동화 인증

초기 실행기는 관리자 PC의 Linux 환경을 사용한다. Windows native는 Ansible control node가 아니므로 WSL 또는 Linux 환경을 사용하고, VPN 라우팅이 WSL 내부에서도 동작하는지 실제 테스트한다. 운영 CI로 확장할 때는 서버 밖의 별도 Linux runner를 사용한다. [Ansible 설치 문서](https://docs.ansible.com/projects/ansible/latest/intro_installation.html)

| 주체 | 인증 | 권한 원칙 |
|---|---|---|
| 사람 | VPN 개인 계정 + OTP | 관리자·일반 사용자 분리 |
| Proxmox 웹 관리자 | 개인 계정 + MFA | 필요한 역할 |
| OpenTofu | 별도 API 토큰 | 대상 VM·pool·storage에 필요한 범위 |
| Ansible | 별도 SSH 키·관리 계정 | 필요한 sudo 권한, 접속 출발지 제한 |
| CI runner | 별도 기계 ID | 사람 계정·OTP 재사용 금지 |
| 백업 작업 | 별도 저장소 계정 | 쓰기와 보존본 삭제 권한 분리 |

API 토큰은 매 실행 OTP를 입력하는 사람 인증과 다르다. 토큰·runner 탈취에 대비해 네트워크 범위, 권한, 만료·회전, 로그를 설정한다. API TLS 검증과 SSH host key 검증은 유지한다. 초기에 인증서와 host key를 신뢰하는 방법을 bootstrap 절차에 기록한다.

## 7. state · plan · 비밀정보

OpenTofu state에는 민감값이 남을 수 있다. sensitive 표시는 화면 노출 억제이지 암호화가 아니다. state와 저장된 plan은 비밀자료 수준으로 취급한다. [민감정보](https://opentofu.org/docs/language/state/sensitive-data/)

권장 운영안은 외부 remote backend + 지원되는 state locking + 접근제어 + 버전 보존이다. 실제 backend 종류와 locking 지원을 확인한 후 선정한다. 같은 IDC 호스트에 state backend를 두지 않는다. state/plan 암호화를 적용할 때는 키도 서버 밖에 보관하고, 새 실행기에서 복호화·복구를 검증한다. [locking](https://opentofu.org/docs/language/state/locking/), [암호화](https://opentofu.org/docs/language/state/encryption/)

원격 backend가 준비되지 않으면 운영 apply에 앞서 준비한다. 로컬 state를 시범 사용한 경우 외부 암호화 백업과 단일 실행자를 유지하고 운영 전 migration을 별도 수행한다.

- API 토큰·SSH 개인키·VPN 키·OTP seed·DB 비밀번호를 Git이나 tfvars 예시에 넣지 않는다.
- Ansible Vault 또는 외부 secret manager로 보관한다. Vault 암호는 암호화 파일과 별도 보관한다.
- secret task는 no_log를 적용하고 diff를 끈다. 로그·템플릿 산출물·백업도 점검한다.
- OTP 등록은 개인별 절차로 수행하고 OTP seed를 코드 배포 산출물로 공유하지 않는다.
- Git에 코드가 있어도 state·비밀·DB가 없으면 완전 복구할 수 없다.

## 8. 게스트·서비스 보안

Proxmox 관리에는 별도 MFA를 적용한다. SSH는 공개키 접속과 sudo 확인 후 비밀번호/root 직접 로그인을 차단한다. web MFA가 SSH를 보호한다고 가정하지 않는다.

내부 웹도 로그인과 역할 검사를 유지한다. DB는 지정 앱 서버에서만 접속하고 앱별 DB 계정에 최소 권한을 부여한다. 공개 웹은 HTTPS, 인증서 갱신, 로그인 rate limit, 요청 크기·timeout, 적절한 cookie 설정을 적용한다.

Docker 포트 공개는 UFW만으로 차단되지 않을 수 있다. 외부 공개 포트를 최소화하고 Proxmox VM 방화벽과 Docker backend에 맞는 정책으로 검증한다. privileged container, 불필요한 Docker socket 마운트, 평문 secret 로그를 피한다. [Docker 방화벽 문서](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

## 9. 백업과 복구 경계

| 자료 | 보관 위치 | 복구 용도 |
|---|---|---|
| Git | 서버 밖 원격 저장소 | 의도한 구성 |
| state·버전 이력 | 외부 backend | 실제 자원과 코드의 매핑 |
| 암호화 키·인증정보 | 외부 보안 저장소 | 복호화·관리 접속 |
| VM 백업 | 외부 저장소 | OS·서비스 환경 |
| DB 백업·필요 시 로그 | 외부 저장소 | 일관된 데이터 복구 |
| IDC 네트워크·콘솔 정보 | 외부 운영 문서 | 호스트 초기 복구 |

VM snapshot과 OpenTofu state는 DB 백업을 대체하지 않는다. backup job의 성공 로그 외에 실제 복원 결과를 남긴다. RPO/RTO는 업무 요구로 결정하며, 확인 전 시간 보장을 하지 않는다.

## 10. 미결정 사항

Proxmox·provider·Ansible 버전, guest OS, backend, VPN 라이선스, 사용자 수, public DNS, DB 종류, 외부 백업 용량, 복구 목표, IDC 콘솔, IPv6, 고정 관리자 IP가 미정이다. 구현 시작 시 결정표에 근거와 날짜를 기록한다.

## 11. 참고 문서

- [Proxmox 네트워크](https://pve.proxmox.com/wiki/Network_Configuration)
- [Proxmox 사용자·MFA](https://github.com/proxmox/pve-docs/blob/master/pveum.adoc)
- [OpenVPN Access Server 인증](https://openvpn.net/access-server/features/authentication-systems/)
- [OpenTofu state backend](https://opentofu.org/docs/language/state/backends/)
- [Ansible check/diff mode](https://docs.ansible.com/projects/ansible-core/devel/playbook_guide/playbooks_checkmode.html)

문서 확인일: 2026-10-27. 링크의 latest/devel 동작을 무조건 채택하지 않고 구현 시 고정한 버전의 문서와 다시 대조한다.
