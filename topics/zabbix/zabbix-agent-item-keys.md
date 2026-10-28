---
tags: [zabbix, monitoring, reference, agent-item-key]
updated: 2026-06-09
---

# Zabbix 구조 정리: Host Group → Template → Item → Key

> 기준 문서  
> - Zabbix 공식 문서: Zabbix agent item type (manual/config/items/itemtypes/zabbix_agent)  
> - Zabbix 공식 문서: Item key format
>
> ✅ 2026-06-09 공식 문서 대조 검증 완료 — 키 이름·파라미터 형식 전부 정확.
> 보정 1건: log/log.count/logrt/logrt.count는 active check에서만 지원(필수).
> 관련: [[zabbix-admin-manual-nexen]] · [[zabbix-api-auth]] · [[moveseye-overview]]

---

## 0. 한 줄 요약

Zabbix는 아래 흐름으로 모니터링 설정과 수집이 이루어진다.

```text
Host Group
  └─ Host
      └─ Template
          └─ Item
              └─ Key
                  └─ 실제 수집 값
```

쉽게 말하면 다음과 같다.

| 개념 | 의미 | 실무 감각 |
|---|---|---|
| Host Group | 서버 묶음 | Linux 서버 그룹, DB 서버 그룹, 운영 서버 그룹 |
| Host | 실제 모니터링 대상 | web01, db01, 192.168.0.10 |
| Template | 모니터링 정책 묶음 | Linux 기본 모니터링, MySQL 모니터링 |
| Item | 수집 항목 | CPU 사용률, 메모리 사용량, 디스크 여유 공간 |
| Key | 실제 수집 명령/식별자 | `system.cpu.util`, `vm.memory.size[available]` |

---

## 1. Host Group

Host Group은 여러 Host를 묶는 단위다.

예시:

```text
Linux Servers
├─ web01
├─ web02
└─ batch01

Database Servers
├─ mysql01
└─ postgres01
```

주요 목적:

- 서버 분류
- 권한 관리
- 대시보드/문제 화면 필터링
- 호스트 대량 관리
- 운영/개발/검증 환경 구분

실무에서는 보통 이렇게 나눈다.

```text
운영-Linux
운영-Windows
운영-DB
개발-Linux
네트워크장비
보안장비
```

---

## 2. Host

Host는 Zabbix가 실제로 모니터링하는 대상이다.

예시:

```text
web01.company.local
10.10.10.21
mysql-prod-01
```

Host에는 보통 다음 정보가 붙는다.

| 항목 | 설명 |
|---|---|
| Host name | Zabbix 내부에서 식별하는 이름 |
| Visible name | 화면에 표시되는 이름 |
| Interface | Agent, SNMP, JMX, IPMI 등 접속 정보 |
| Host Group | 이 호스트가 속한 그룹 |
| Template | 이 호스트에 적용할 모니터링 정책 |
| Macro | 호스트별 변수 |

예를 들면 `web01` 호스트에 `Linux by Zabbix agent` 템플릿을 연결하면 CPU, 메모리, 디스크, 네트워크 같은 기본 수집 항목이 자동으로 붙는다.

---

## 3. Template

Template은 Item, Trigger, Graph, Discovery Rule 등을 미리 묶어둔 모니터링 설정 세트다.

예시:

```text
Template: Linux by Zabbix agent
├─ CPU Items
├─ Memory Items
├─ Filesystem Items
├─ Network Items
├─ Triggers
└─ Graphs
```

Template을 쓰는 이유:

- 여러 서버에 같은 모니터링 정책을 반복 적용 가능
- 설정 변경 시 연결된 Host에 일괄 반영 가능
- 운영 표준화 가능
- 신규 서버 추가가 쉬움

실무 감각으로는 다음과 같다.

```text
Host에 직접 Item을 하나하나 만들지 말고,
Template에 Item을 정의한 뒤 Host에 Template을 붙이는 방식이 정석이다.
```

---

## 4. Item

Item은 실제로 어떤 데이터를 수집할지 정의하는 단위다.

예시:

```text
CPU utilization
Memory available
Disk space usage
Network incoming traffic
Process count
Agent availability
```

Item에는 보통 다음 설정이 있다.

| 설정 | 의미 |
|---|---|
| Name | 화면에 보이는 수집 항목 이름 |
| Type | 수집 방식. 예: Zabbix agent, Zabbix agent active, SNMP agent 등 |
| Key | 실제 수집할 값의 식별자 |
| Type of information | Numeric, Character, Log 등 데이터 타입 |
| Update interval | 수집 주기 |
| History storage period | 원본 데이터 보관 기간 |
| Trends storage period | 추세 데이터 보관 기간 |
| Preprocessing | 수집 값 가공 |

예시:

```text
Name  : CPU utilization
Type  : Zabbix agent
Key   : system.cpu.util
Every : 1m
Value : 23.5
```

---

## 5. Key

Key는 Item이 어떤 데이터를 가져올지 결정하는 핵심 값이다.

예시:

```text
system.cpu.util
vm.memory.size[available]
vfs.fs.size[/,pused]
net.if.in[eth0]
proc.num[nginx]
agent.ping
```

즉, Item이 사람이 보는 이름이라면 Key는 실제 수집 명령에 가깝다.

```text
Item Name : CPU utilization
Item Key  : system.cpu.util
Result    : 12.34
```

---

## 6. Zabbix Agent Item Type

공식 문서 기준으로 Zabbix agent item은 Zabbix agent와 통신해서 데이터를 수집하는 Item type이다.

Zabbix agent 방식에는 크게 두 가지가 있다.

| Type | 의미 | 동작 방향 |
|---|---|---|
| Zabbix agent | Passive check | Zabbix server/proxy가 agent에게 값을 요청 |
| Zabbix agent (active) | Active check | Agent가 server/proxy에게 수집할 목록을 받아 직접 값을 전송 |

### 6.1 Passive check

```text
Zabbix Server → Zabbix Agent
```

흐름:

```text
1. Zabbix server가 agent에게 물어본다.
2. Agent가 해당 key 값을 계산한다.
3. Agent가 server에게 값을 반환한다.
```

예시:

```text
server: system.cpu.util 값 줘
agent : 25.3 반환
```

장점:

- 구조가 직관적
- 테스트하기 쉬움
- 서버가 직접 요청하므로 제어가 명확함

주의점:

- 서버에서 agent로 네트워크 접근이 가능해야 함
- 방화벽, NAT 환경에서 불편할 수 있음

### 6.2 Active check

```text
Zabbix Agent → Zabbix Server
```

흐름:

```text
1. Agent가 server에게 내가 수집할 item 목록을 요청한다.
2. Agent가 주기적으로 key 값을 수집한다.
3. Agent가 server에게 결과를 보낸다.
```

장점:

- Agent가 outbound로 통신하므로 NAT/방화벽 환경에서 유리함
- 대규모 환경에서 효율적으로 구성 가능
- 로그 모니터링처럼 agent가 직접 추적해야 하는 항목에 적합함

주의점:

- Hostname 설정이 Zabbix UI의 Host name과 맞아야 함
- 일부 key는 active 또는 passive 제약이 있을 수 있음

---

## 7. Item Key Format

Zabbix item key는 다음 구조를 가진다.

```text
key_name
key_name[param1,param2,param3]
```

예시:

```text
system.cpu.util
vm.memory.size[available]
vfs.fs.size[/,pused]
net.tcp.port[,443]
proc.num[nginx]
```

### 7.1 Key name 허용 문자

Key 이름에는 다음 문자를 사용할 수 있다.

```text
0-9 a-z A-Z _ - .
```

예시:

```text
system.cpu.util
vfs.fs.size
net.if.in
agent.ping
```

### 7.2 Key parameter

Key는 여러 파라미터를 가질 수 있고, 파라미터는 쉼표로 구분한다.

```text
vfs.fs.size[/,pused]
```

해석:

| 부분 | 의미 |
|---|---|
| `vfs.fs.size` | 파일시스템 용량 관련 key |
| `/` | 대상 파일시스템 경로 |
| `pused` | 사용률 percentage used |

### 7.3 빈 파라미터

중간 파라미터를 기본값으로 쓰고 뒤쪽 파라미터만 지정하려면 쉼표 위치를 유지해야 한다.

```text
net.tcp.port[,443]
```

해석:

```text
첫 번째 파라미터: 기본값
두 번째 파라미터: 443
```

### 7.4 따옴표가 필요한 경우

파라미터 안에 쉼표가 있거나 특수 문자가 있으면 큰따옴표를 사용한다.

```text
vfs.file.regexp[/var/log/app.log,"ERROR, WARN"]
```

주의:

```text
작은따옴표는 지원하지 않고, 큰따옴표를 사용한다.
```

---

## 8. Zabbix Agent 주요 Key 분류

공식 문서의 Zabbix agent key는 크게 다음 그룹으로 볼 수 있다.

| 그룹 | 대표 key | 용도 |
|---|---|---|
| Kernel | `kernel.maxfiles`, `kernel.maxproc`, `kernel.openfiles` | OS 커널 제한/상태 |
| Log monitoring | `log`, `log.count`, `logrt`, `logrt.count` | 로그 파일 모니터링 |
| Network | `net.if.in`, `net.if.out`, `net.tcp.port`, `net.tcp.listen` | 네트워크 인터페이스, 포트, 서비스 확인 |
| Processes | `proc.num`, `proc.mem`, `proc.cpu.util`, `proc.get` | 프로세스 개수, 메모리, CPU |
| System | `system.cpu.util`, `system.cpu.load`, `system.uptime`, `system.uname` | CPU, 부하, uptime, OS 정보 |
| Virtual file systems | `vfs.fs.size`, `vfs.fs.discovery`, `vfs.file.exists` | 디스크, 파일, 디렉토리 |
| Virtual memory | `vm.memory.size` | 메모리 사용량 |
| Web monitoring | `web.page.get`, `web.page.perf`, `web.page.regexp` | 웹 페이지 응답/내용 확인 |
| Zabbix | `agent.ping`, `agent.version`, `agent.hostname` | Agent 자체 상태 |

---

## 9. 자주 쓰는 Key 정리

### 9.1 Agent 상태 확인

```text
agent.ping
```

의미:

```text
Agent가 살아 있으면 1 반환
응답이 없으면 값 없음
```

실무 사용:

```text
서버 agent 죽었는지 확인
```

---

### 9.2 Agent 버전 확인

```text
agent.version
```

의미:

```text
설치된 Zabbix agent 버전 반환
```

---

### 9.3 CPU 사용률

```text
system.cpu.util
```

의미:

```text
CPU 사용률 percentage 반환
```

예시:

```text
system.cpu.util[,user]
system.cpu.util[,system]
system.cpu.util[,idle]
```

실무 사용:

```text
CPU 사용률 90% 이상 5분 지속 시 장애 알림
```

---

### 9.4 CPU Load

```text
system.cpu.load
```

의미:

```text
시스템 load average 반환
```

실무 감각:

```text
CPU 코어 수 대비 load가 높은지 확인
```

---

### 9.5 CPU 개수

```text
system.cpu.num
```

의미:

```text
CPU 개수 반환
```

---

### 9.6 메모리

```text
vm.memory.size[available]
vm.memory.size[total]
vm.memory.size[pavailable]
```

의미:

| Key | 의미 |
|---|---|
| `vm.memory.size[available]` | 사용 가능한 메모리 바이트 |
| `vm.memory.size[total]` | 전체 메모리 바이트 |
| `vm.memory.size[pavailable]` | 사용 가능한 메모리 비율 |

실무 사용:

```text
Available memory 10% 미만이면 경고
```

---

### 9.7 디스크 용량

```text
vfs.fs.size[/,total]
vfs.fs.size[/,free]
vfs.fs.size[/,used]
vfs.fs.size[/,pused]
vfs.fs.size[/,pfree]
```

의미:

| Key | 의미 |
|---|---|
| `vfs.fs.size[/,total]` | `/` 전체 용량 |
| `vfs.fs.size[/,free]` | `/` 남은 용량 |
| `vfs.fs.size[/,used]` | `/` 사용 중인 용량 |
| `vfs.fs.size[/,pused]` | `/` 사용률 |
| `vfs.fs.size[/,pfree]` | `/` 여유율 |

실무 사용:

```text
/ 디스크 사용률 85% 이상 경고
/ 디스크 사용률 95% 이상 장애
```

---

### 9.8 파일시스템 자동 발견

```text
vfs.fs.discovery
```

의미:

```text
마운트된 파일시스템 목록을 JSON으로 반환
```

실무 사용:

```text
LLD, Low-level discovery로 /, /data, /home 등을 자동 감지해서 디스크 item 생성
```

---

### 9.9 네트워크 In/Out

```text
net.if.in[eth0]
net.if.out[eth0]
net.if.total[eth0]
```

의미:

| Key | 의미 |
|---|---|
| `net.if.in[eth0]` | eth0 수신 바이트 |
| `net.if.out[eth0]` | eth0 송신 바이트 |
| `net.if.total[eth0]` | eth0 송수신 합계 |

주의:

```text
이 값은 누적 카운터 성격이므로 트래픽 속도로 보려면 Change per second 전처리를 함께 사용하는 경우가 많다.
```

---

### 9.10 네트워크 인터페이스 자동 발견

```text
net.if.discovery
```

의미:

```text
네트워크 인터페이스 목록을 JSON으로 반환
```

실무 사용:

```text
eth0, ens33, lo 등을 자동 발견해서 인터페이스별 트래픽 item 생성
```

---

### 9.11 TCP 포트 열림 확인

```text
net.tcp.port[,80]
net.tcp.port[,443]
net.tcp.port[127.0.0.1,3306]
```

의미:

```text
특정 TCP 포트로 접속 가능한지 확인
```

실무 사용:

```text
웹 서버 80/443 포트 확인
MySQL 3306 포트 확인
Redis 6379 포트 확인
```

---

### 9.12 TCP Listen 상태 확인

```text
net.tcp.listen[8080]
```

의미:

```text
대상 서버에서 해당 포트가 LISTEN 상태인지 확인
```

차이점:

```text
net.tcp.port  : 접속 가능한지 확인
net.tcp.listen: 로컬에서 listen 중인지 확인
```

---

### 9.13 프로세스 개수

```text
proc.num[nginx]
proc.num[java]
proc.num[mysql]
```

의미:

```text
해당 이름의 프로세스 개수 반환
```

실무 사용:

```text
nginx 프로세스가 0개면 장애
java 프로세스 개수가 평소보다 과도하면 이상 징후
```

---

### 9.14 프로세스 메모리

```text
proc.mem[java]
proc.mem[nginx]
proc.mem[mysql]
```

의미:

```text
해당 프로세스가 사용하는 메모리 반환
```

실무 사용:

```text
특정 Java 프로세스 메모리 증가 추적
```

---

### 9.15 프로세스 CPU

```text
proc.cpu.util[java]
proc.cpu.util[nginx]
```

의미:

```text
특정 프로세스의 CPU 사용률 반환
```

---

### 9.16 시스템 Uptime

```text
system.uptime
```

의미:

```text
시스템이 부팅된 후 지난 시간, 초 단위
```

실무 사용:

```text
서버 재기동 감지
```

---

### 9.17 OS 정보

```text
system.uname
system.sw.os
system.hostname
```

의미:

| Key | 의미 |
|---|---|
| `system.uname` | OS 식별 정보 |
| `system.sw.os` | 운영체제 정보 |
| `system.hostname` | 시스템 호스트명 |

---

### 9.18 파일 존재 여부

```text
vfs.file.exists[/etc/passwd]
vfs.file.exists[/var/log/app.log]
```

의미:

```text
파일이 존재하면 1, 없으면 0
```

실무 사용:

```text
중요 설정 파일 존재 여부 확인
배포 산출물 파일 존재 여부 확인
```

---

### 9.19 파일 크기

```text
vfs.file.size[/var/log/app.log]
```

의미:

```text
파일 크기 반환
```

실무 사용:

```text
로그 파일 비정상 증가 감지
```

---

### 9.20 로그 모니터링

```text
log[/var/log/app.log,"ERROR"]
log.count[/var/log/app.log,"ERROR"]
logrt[/var/log/app.*.log,"ERROR"]
logrt.count[/var/log/app.*.log,"ERROR"]
```

의미:

| Key | 의미 |
|---|---|
| `log` | 로그 파일에서 패턴 매칭 라인 수집 |
| `log.count` | 로그 파일에서 패턴 매칭 개수 수집 |
| `logrt` | rotate되는 로그 파일 모니터링 |
| `logrt.count` | rotate되는 로그 파일의 패턴 매칭 개수 |

주의:

```text
log, log.count, logrt, logrt.count 키는 active check에서만 지원된다. (passive check 불가)
```

---

### 9.21 웹 페이지 응답 시간

```text
web.page.perf[www.example.com]
web.page.perf[https://www.example.com]
```

의미:

```text
웹 페이지 로딩 시간 반환, 초 단위
```

---

### 9.22 웹 페이지 내용 확인

```text
web.page.get[www.example.com]
web.page.regexp[www.example.com,,,OK]
```

의미:

| Key | 의미 |
|---|---|
| `web.page.get` | 웹 페이지 내용 가져오기 |
| `web.page.regexp` | 웹 페이지에서 특정 문자열/정규식 찾기 |

---

## 10. Template → Item → Key 예시

### 예시 1. Linux 서버 기본 모니터링

```text
Host Group: 운영-Linux
  Host: web01
    Template: Linux by Zabbix agent
      Item: CPU utilization
        Key: system.cpu.util
      Item: Available memory
        Key: vm.memory.size[available]
      Item: Disk space usage /
        Key: vfs.fs.size[/,pused]
      Item: Agent availability
        Key: agent.ping
```

---

### 예시 2. Nginx 서버 모니터링

```text
Host Group: 운영-Web
  Host: nginx01
    Template: Linux by Zabbix agent
    Template: Custom Nginx Process
      Item: Nginx process count
        Key: proc.num[nginx]
      Item: Nginx port 80 check
        Key: net.tcp.listen[80]
      Item: Nginx port 443 check
        Key: net.tcp.listen[443]
```

---

### 예시 3. Java 서버 모니터링

```text
Host Group: 운영-WAS
  Host: was01
    Template: Linux by Zabbix agent
    Template: Custom Java Process
      Item: Java process count
        Key: proc.num[java]
      Item: Java memory usage
        Key: proc.mem[java]
      Item: Java CPU usage
        Key: proc.cpu.util[java]
      Item: Service port check
        Key: net.tcp.listen[8080]
```

---

## 11. Trigger와 연결되는 방식

Item은 값을 수집하고, Trigger는 그 값을 보고 장애 여부를 판단한다.

예시:

```text
Item
  Key: system.cpu.util
  Value: 95

Trigger
  CPU 사용률이 5분 동안 90% 초과면 High Problem 발생
```

흐름:

```text
Key로 값 수집
  ↓
Item에 저장
  ↓
Trigger expression 평가
  ↓
Problem 발생
  ↓
Action으로 알림 발송
```

---

## 12. 실무에서 자주 쓰는 설계 패턴

### 12.1 기본 OS Template은 공통으로 붙인다

```text
Linux 서버 → Linux by Zabbix agent
Windows 서버 → Windows by Zabbix agent
```

### 12.2 서비스별 Custom Template을 따로 만든다

```text
Template Custom Nginx
Template Custom Java App
Template Custom MySQL Port
Template Custom Redis
```

### 12.3 Host에 직접 Item을 만들지 않는다

나쁜 예:

```text
web01 Host에만 직접 Item 생성
```

좋은 예:

```text
Template Custom WebApp 생성
→ Item 정의
→ web01, web02, web03에 Template 연결
```

### 12.4 Key 이름만 보지 말고 반환 값 타입을 같이 본다

예시:

```text
system.cpu.util        → Float
proc.num[nginx]        → Integer
agent.ping             → 1 또는 값 없음
log[...]               → Log
vfs.fs.discovery       → JSON
```

반환 값 타입에 따라 Trigger, Graph, Preprocessing 방식이 달라진다.

---

## 13. Key 테스트 방법

Agent 서버에서 직접 테스트할 수 있다.

```bash
zabbix_agentd -t system.cpu.util
zabbix_agentd -t 'vm.memory.size[available]'
zabbix_agentd -t 'vfs.fs.size[/,pused]'
zabbix_agentd -t 'proc.num[nginx]'
```

Zabbix server/proxy에서 원격으로 테스트할 수도 있다.

```bash
zabbix_get -s 10.10.10.21 -k system.cpu.util
zabbix_get -s 10.10.10.21 -k 'vm.memory.size[available]'
zabbix_get -s 10.10.10.21 -k 'vfs.fs.size[/,pused]'
```

주의:

```text
쉘에서 key 파라미터에 대괄호, 쉼표, 따옴표가 들어가면 따옴표로 감싸는 것이 안전하다.
```

---

## 14. 장애 대응 관점에서 보는 핵심 Key

| 목적 | Key | 판단 기준 예시 |
|---|---|---|
| Agent 생존 확인 | `agent.ping` | 값이 없으면 agent 장애 가능 |
| CPU 과부하 | `system.cpu.util` | 90% 이상 지속 |
| Load 증가 | `system.cpu.load` | CPU 코어 수 대비 과도 |
| 메모리 부족 | `vm.memory.size[pavailable]` | 10% 미만 |
| 디스크 부족 | `vfs.fs.size[/,pused]` | 85%, 95% 기준 |
| 네트워크 트래픽 | `net.if.in`, `net.if.out` | 평소 대비 급증 |
| 포트 장애 | `net.tcp.listen[포트]` | listen 상태 아님 |
| 프로세스 죽음 | `proc.num[프로세스명]` | 0개 |
| 로그 에러 | `log.count[...]` | ERROR 급증 |
| 서버 재부팅 | `system.uptime` | 값이 낮아짐 |

---

## 15. 최종 암기 구조

```text
Host Group = 서버 분류
Host       = 실제 서버
Template   = 모니터링 정책 묶음
Item       = 수집 항목
Key        = 실제 수집 명령/식별자
Trigger    = 수집 값을 보고 장애 판단
Action     = 장애 발생 시 알림/명령 수행
```

가장 중요한 흐름:

```text
Template에 Item을 만든다.
Item에는 Key를 넣는다.
Host에 Template을 붙인다.
Zabbix agent가 Key 기준으로 값을 수집한다.
Trigger가 값을 보고 문제를 만든다.
```

---

## 16. 예시로 완전히 이해하기

목표:

```text
web01 서버의 디스크 사용률이 90% 넘으면 알림을 받고 싶다.
```

설정 구조:

```text
Host Group
  운영-Linux

Host
  web01

Template
  Linux by Zabbix agent

Item
  Disk space usage /

Key
  vfs.fs.size[/,pused]

Trigger
  최근 값이 90보다 크면 Problem
```

실제 의미:

```text
Zabbix agent가 web01에서 / 디스크 사용률을 수집한다.
수집된 값이 92라면 Trigger가 Problem을 발생시킨다.
Action이 Slack, Email 등으로 알림을 보낸다.
```

---

## 17. 개인 정리용 결론

Zabbix를 볼 때는 화면 이름보다 이 질문 순서로 보면 된다.

```text
1. 이 Host는 어떤 Host Group에 속해 있나?
2. 이 Host에는 어떤 Template이 붙어 있나?
3. 그 Template 안에 어떤 Item이 있나?
4. 그 Item의 Key는 무엇인가?
5. 그 Key는 어떤 값을 반환하는가?
6. 그 값을 기준으로 어떤 Trigger가 걸려 있는가?
```

이 순서로 보면 Zabbix 구조가 훨씬 빨리 잡힌다.
