# Update v0.1.1
> **VS Code 1.120 이상이 필요합니다.** (이전: 1.56)

1. 서버 환경 감지
	- `plugins` 폴더를 자동으로 찾아 jar 안의 `plugin.yml`에서 Skript와 애드온 이름·버전을 읽음
	- 설정 `vskript.serverPath`, `vskript.skriptVersion`, `vskript.addons`(예: `SkBee@3.5.0`) 추가 — 설정값이 감지 결과보다 우선하며, 둘이 다르면 알림을 한 번 표시
	- 상태 표시줄에 Skript 버전·애드온 수 표시
	- 명령 `VSkript: 서버 환경 보기`, `VSkript: 서버 환경 다시 감지 및 구문 데이터 동기화` 추가
	- jar 추가·삭제나 설정 변경 시 자동으로 다시 감지
2. 구문 데이터 자동 다운로드
	- 사용 중인 Skript·애드온의 구문 데이터를 [vskript-database](https://github.com/lapin-a/vskript-database)에서 내려받음 (바뀐 것만, 오프라인이면 캐시 사용)
	- 설정 `vskript.database.autoDownload`, `vskript.database.url` 추가
3. 자동완성
	- 현재 Skript·애드온 버전에서 쓸 수 있는 구문만 제안
	- 설치한 애드온의 구문도 제안
	- Skript 버전 결정 순서: 파일 상단 주석(`# version: 2.10`, `# mc: 1.20`) > 서버 환경
	- `{@` 입력 시 옵션 변수만 제안
4. 호버
	- 구문 위에 마우스를 올리면 설명·패턴·지원 버전 표시 (현재 버전에서 쓸 수 없는 구문은 경고 표시)
	- `vskript.language`가 `ko`이면 한국어 설명 표시 (Skript 기본 구문 1,219개 번역)
5. 진단
	- 현재 Skript·애드온 버전에서 쓸 수 없는 구문을 경고 (설정 `vskript.diagnostics.versionCheck`로 끌 수 있음)
	- 여러 문서를 연달아 고칠 때 앞 문서의 진단이 갱신되지 않던 문제 수정
	- 문서를 닫았다 다시 열면 진단이 사라지던 문제 수정
6. 제거
	- 파일 주석 `# addons:` (실제 데이터 없이 동작하던 기능) — 애드온은 서버 환경 감지와 `vskript.addons` 설정으로 지정
7. Fixed
	- v0.1.0 소스가 컴파일되지 않던 문제
	- 저장하지 않은 새 문서를 열면 오류가 나던 문제
	- 코드 스니펫이 등록되지 않던 문제
	- 아웃라인에서 함수 매개변수 타입이 `[object Object]`로 표시되던 문제
	- 구문 데이터 동기화 중에 "다시 감지"를 실행하면 바뀐 설정이 바로 반영되지 않던 문제
	- 확장이 다른 확장의 로그(`console.log`)까지 바꾸던 문제 — 로그는 출력 패널의 `VSkript` 채널에 기록

# Update v0.1.0
1. 진단
	- 이벤트·명령어·함수·options 줄 끝 콜론(`:`) 누락 검사
	- 들여쓰기 검사 (탭·공백 혼용, 섹션 아래 들여쓰기 깊이)
2. 자동완성
	- Skript 기본 구문 자동완성
	- `{@` 입력 시 옵션 변수 자동완성
3. 호버
	- `{@옵션}` 위에 마우스를 올리면 옵션 값 표시
	- 설정 `vskript.hoverContentMode`: 함수 호버에 Docs 주석(`description`) 또는 함수 본문(`code`) 표시
4. 정의로 이동
	- 열려 있지 않은 파일의 함수도 `F12`로 이동
5. 설정 `vskript.language` (`en` / `ko`) 추가
6. `.sk` 파일이 있는 작업 공간을 열면 확장이 바로 활성화됨

# Updata v0.0.9
1. Syntax Highlight
	- 2.8 버전 컬러 테마 지원
	- White 버전 테마 추가

# Updata v0.0.8
1. Syntax Highlight
	- skript-reflect 애드온 패턴 추가

# Update v0.0.7
1. Syntax Highlight
   - 문자 표현에서 모든 종류 컬러 표시 (&7, §7, \<grey\> 등) (참조 : https://skriptlang.github.io/Skript/text.html)
   - 문자 표현에서 \{\@option\} 변수 강조
   - Option의 값 영역에 하이라이트 적용
   - Exit, Continue 이펙트에 제어문 스타일 적용
   - boolean에 숫자 스타일(흰색) 적용
   - skript 2.6의 새로운 문법 'parse if'와 'do while'에 문법 스타일(주황색, 볼드) 적용
2. Fixed
   - 함수 파타메터의 타입에서 'string' 강조


# Update v0.0.6
1. Syntax Highlight
   - 색상 변경
    - 변수와 글자에 중첩 익스프레션 패턴 추가
   - 글자에 컬러코드(&[0-9a-fA-F]) 사용시 색상 표시
   - Periodical Event 색상 적용
2. Semantic Highlight
   - Aliases 표시
   - Function 매개변수 표시
3. Outline
   - Event, Command, Function에서 사용된 지역변수 표기
     - 최초 사용된 위치로 바로가기
     - 사용 횟수 표기
   - Command 옵션 표기
   - At Time, Periodical Event 표기
4. Docs Trigger Key
   - 변경 전: "#> DOCS" + Enter
   - 변경 후: "#>>" + Enter
5. Docs Annotation
   - @invisible : 심볼 검색 차단
     ```vskript
     #> @invisible
     function fxTest():
        true is true
     ```
6. Fixed
    - 띄어쓰기로 들여쓰기 한 경우 인식이 안되던 문제