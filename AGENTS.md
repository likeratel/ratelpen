# ratelpen

화면 위에 바로 그리는 주석 도구. Tauri 2 + React + TypeScript, Rust core. macOS 우선, Windows는 실험 지원.

- 라이선스는 MIT다. 로컬 Git 커밋은 허용되지만 push·릴리스·배포·저장소 공개 범위 변경은 사용자 요청이 해당 행동까지 허용하는지 확인한다.
- UI와 core는 `CONTRACT.md`의 명령·이벤트로만 통신한다. 계약을 바꾸면 `CONTRACT.md`, Rust 모델, `src/bridge/types.ts`의 zod 스키마를 함께 고친다.
- 그림 데이터는 메모리에만 둔다. 화면 내용이나 캡처를 네트워크로 보내는 기능을 추가하지 않는다. 앱은 네트워크를 사용하지 않는다.
- 캡처는 사용자가 누른 때에만, 정해진 폴더(Pictures/ratelpen)나 클립보드로만 내보낸다. IPC로 임의 경로를 받지 않는다.
- 키보드 잠금(macOS 이벤트 탭)은 그리기 모드 동안에만 설치하고, 키 입력을 자기 프로세스로 넘기는 것 외에 기록·저장·전송하지 않는다. 강제 종료(Cmd+Option+Esc)는 항상 통과시키고, 그리기 모드를 벗어나는 모든 경로에서 탭을 해제한다.
- IPC 입력은 core에서 검증하고 범위 밖 값은 거부한다. 셸 문자열 조합으로 명령을 실행하지 않는다.
- 플랫폼 전용 코드는 `#[cfg(target_os)]`로 분리하고 Windows에서도 컴파일되게 유지한다.
- 실패를 성공처럼 표시하지 않는다(단축키 등록 실패, 캡처 권한 없음, 설정 저장 실패).
- README에 실제 지원 범위와 검증 한계를 기록한다.
- TypeScript 확인: `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm format:check`.
- Rust 확인: `cargo fmt --check`, `cargo test`, `cargo clippy --all-targets -- -D warnings` (src-tauri).
- 릴리스를 게시했거나 빌드한 앱을 Applications에 설치한 뒤에는 프로젝트 안에 남은 앱 번들(`src-tauri/target/**/bundle/macos/*.app`)을 지운다. 남겨 두면 Spotlight에 설치본과 빌드 산출물이 함께 검색된다. DMG 등 릴리스 산출물은 지우지 않는다.
- 앱은 `/Applications` 한 곳에만 설치한다. 새 빌드를 설치할 때는 기존 번들을 교체하고, `~/Applications` 등 다른 위치에 사본을 두지 않는다. 설치 후 Spotlight에 이 앱의 번들이 하나만 검색되는지 확인한다(`mdfind "kMDItemContentType == 'com.apple.application-bundle' && kMDItemDisplayName == 'ratel*'cdw"`).
