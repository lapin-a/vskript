import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { EventEmitter } from 'events';

export interface SyntaxData {
	name: string;       // 구문 이름 (예: "on player join")
	added: string;      // Skript 버전 (예: "2.5", "2.6")
	addon: string;      // 소속 애드온 (기본 "Skript")
	type: string;       // 구문 유형 (예: "event", "condition", "effect")
	patterns: string[]; // 구문 패턴 (예: ["on player join", "when player joins"])
	removed?: string;
	description: {      // 구문 설명 (언어별)
		en: string;
		ko: string;
	};
}

export interface LocalDatabase {
	last_updated: string;               // 마지막 업데이트 날짜
	data: { [key: string]: SyntaxData }; // 패턴이나 이름을 키로 사용하는 데이터셋
}

export class SkriptHubClient {
	private static readonly API_URL = "https://skripthub.net/api/v1/syntax/";
	private storagePath: string;
	private syntaxDb: { [key: string]: SyntaxData } = {};
	private indexedDb: { [firstWord: string]: SyntaxData[] } = {};
	
	constructor(context: vscode.ExtensionContext) {
		// 확장 프로그램의 전역 저장소 경로 설정
		this.storagePath = path.join(context.globalStorageUri.fsPath, 'syntax_db.json');
		
		// context.extensionPath를 사용하면 src 폴더 위치와 상관없이 
		// 무조건 익스텐션의 최상위 루트 폴더(vskript) 경로를 가져옵니다.
		this.loadLocalDb(context.extensionPath);
	}

	/** 로드된 syntaxDb를 기반으로 첫 단어 기준 인덱스를 빌드합니다. */
    private buildIndex() {
        this.indexedDb = {}; // 기존 인덱스 비우기

        for (const key in this.syntaxDb) {
            const syntax = this.syntaxDb[key];
            
            // 구문 패턴들의 첫 단어를 추출합니다. (예: "send %string%" -> "send")
            if (syntax.patterns && syntax.patterns.length > 0) {
                syntax.patterns.forEach(pattern => {
                    const firstWord = pattern.trim().split(/\s+/)[0].toLowerCase();
                    
                    if (firstWord) {
                        // 해당 단어 주머니가 없으면 새로 만들기
                        if (!this.indexedDb[firstWord]) {
                            this.indexedDb[firstWord] = [];
                        }
                        // 중복되지 않게 주머니에 쏙 넣기
                        if (!this.indexedDb[firstWord].includes(syntax)) {
                            this.indexedDb[firstWord].push(syntax);
                        }
                    }
                });
            }
        }
        console.log(`[인덱서] 총 ${Object.keys(this.indexedDb).length}개의 핵심 키워드로 구문 인덱싱 완료.`);
    }

	/** 사용자가 입력한 코드 한 줄을 받아 일치하는 Skript 구문 데이터를 찾아 반환합니다. */
    public findMatch(userLine: string): SyntaxData | null {
        const cleanLine = userLine.trim();
        if (!cleanLine) return null;

        // 1. 사용자가 쓴 코드의 첫 단어 추출 (예: "send" "hi" -> "send")
        const firstWord = cleanLine.split(/\s+/)[0].toLowerCase();
        
        // 2. 해당 첫 단어로 시작하는 구문 후보들 목록만 쏙 골라오기
        const candidates = this.indexedDb[firstWord];
        if (!candidates) return null; // 등록된 구문 중 해당 단어로 시작하는 게 없으면 즉시 패스

        // 3. 전체 DB 대신 '후보군'만 정밀 검사 (우리가 만든 patternToRegex 활용)
        for (const syntax of candidates) {
            for (const pattern of syntax.patterns) {
                // 이전에 파일 최하단에 만들어둔 patternToRegex 함수를 호출합니다.
                // 만약 클래스 내부에 만드셨다면 this.patternToRegex(pattern)으로 수정해 주세요!
                const regex = this.patternToRegex(pattern); 
                
                if (regex.test(cleanLine)) {
                    return syntax; // 정확히 일치하는 패턴을 찾으면 즉시 반환!
                }
            }
        }

        return null; // 후보 키워드는 맞지만 패턴이 정확히 일치하지 않는 경우
    }
	private patternToRegex(pattern: string): RegExp {
        // 1. 특수문자 에스케이프 (정규식에서 오작동할 수 있는 문자들을 안전하게 처리)
        let regexStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 2. 대괄호 [ ] 처리: Skript에서 [the] 같은 대괄호는 선택 사항(생략 가능)을 의미합니다.
        // 변환 예: "cancel \\[the\\] event" -> "cancel (the)? event"
        regexStr = regexStr.replace(/\\\[([^\\\]]+)\\\\]/g, "($1)?");

        // 3. %type% 처리: 변수가 들어갈 자리를 (.+)로 치환하여 어떤 값이 들어와도 매칭되게 만듭니다.
        regexStr = regexStr.replace(/%[^%]+%/g, "(.+)");

        // 4. 공백 최적화: 띄어쓰기가 여러 개 있더라도 하나로 인식하게 만들고 시작(^)과 끝($)을 명시합니다.
        regexStr = regexStr.trim().replace(/\s+/g, "\\s+");
        
        // 대소문자를 구분하지 않도록 "i" 플래그를 주어 리턴합니다.
        return new RegExp(`^${regexStr}$`, "i");
    }
	
	/** 로컬에 저장된 DB 로드 및 Seed Data 초기화 */
	private loadLocalDb(extensionPath: string) {
		// 1. 만약 사용자 전역 저장소에 DB 파일이 없다면?
		if (!fs.existsSync(this.storagePath)) {
			try {
				// 루트 경로에서 정확히 src/resource/core_syntax.json을 조준합니다.
				const defaultDataPath = path.join(extensionPath, 'src', 'resource', 'core_syntax.json');
				
				if (fs.existsSync(defaultDataPath)) {
					const defaultData = fs.readFileSync(defaultDataPath, 'utf-8');
					this.syntaxDb = JSON.parse(defaultData);
					this.saveDb();
					console.log("내장된 코어 구문(Seed Data)으로 초기 DB를 성공적으로 생성했습니다.");
					return;
				} else {
					console.warn(`기본 코어 데이터 파일을 찾을 수 없습니다: ${defaultDataPath}`);
				}
			} catch (err) {
				console.error("기본 코어 데이터 로드 중 오류 발생:", err);
			}
		}

		// 2. 파일이 존재하면 로드
		if (fs.existsSync(this.storagePath)) {
			try {
				const rawData = fs.readFileSync(this.storagePath, 'utf-8');
				this.syntaxDb = JSON.parse(rawData);
			} catch (err) {
				this.syntaxDb = {};
			}
		}
		this.buildIndex();
	}

	/** 서버에서 새로운 데이터를 가져와 업데이트 (증분 업데이트) */
	public async syncWithServer() {
		try {
			vscode.window.setStatusBarMessage("$(sync~spin) SkriptHub 데이터 동기화 중...");
			
			// 실제 구현 시에는 페이지네이션이나 필터를 통해 '최근 변경분'만 요청하는 로직이 들어갑니다.
			// 여기서는 전체를 가져오되 로컬에 없는 것만 추가하는 기본 로직을 제안합니다.
			const response = await axios.get(SkriptHubClient.API_URL);
			const remoteData = response.data;

			let updatedCount = 0;
			remoteData.forEach((item: any) => {
				const name = item.name;
				if (!this.syntaxDb[name]) {
					this.syntaxDb[name] = {
						name: name,
						added: item.added_in || "2.0",
						addon: "Skript", // 기본적으로 Skript 코어 구문으로 간주
						type: item.type || "effect",
						patterns: item.patterns || [name],
						description: {
							en: item.description || "",
							ko: "" // 추후 번역 엔진 연동 구역
						} // 나중에 번역 엔진으로 채울 공간
					};
					updatedCount++;
				}
			});

			if (updatedCount > 0) {
				this.saveDb();
				vscode.window.showInformationMessage(`SkriptHub: ${updatedCount}개의 새로운 구문이 업데이트되었습니다.`);
			}
			
			vscode.window.setStatusBarMessage("");
		} catch (error) {
			console.error("데이터 동기화 실패:", error);
			vscode.window.showErrorMessage("SkriptHub 데이터를 가져오는 데 실패했습니다.");
		}
	}

	private saveDb() {
		const dir = path.dirname(this.storagePath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(this.storagePath, JSON.stringify(this.syntaxDb, null, 2));
	}

	public getSyncData() {
		return this.syntaxDb;
	}

	public async syncAddonData(addonName: string): Promise<void> {
		// 이미 로드된 애드온인지 확인 (중복 요청 방지)
		const isLoaded = Object.values(this.syntaxDb).some(s => s.addon === addonName);
		if (isLoaded) return;

		try {
			// 상태 표시줄에 진행 상황 표시
			vscode.window.setStatusBarMessage(`$(sync~spin) '${addonName}' 애드온 동기화 중...`);
			
			// API 호출 (서버 API 명세에 따라 쿼리문은 달라질 수 있습니다)
			const response = await axios.get(`${SkriptHubClient.API_URL}?addon=${encodeURIComponent(addonName)}`);
			const remoteData = response.data;

			if (Array.isArray(remoteData)) {
				remoteData.forEach((item: any) => {
					// 구문이 이미 DB에 없으면 추가
					if (!this.syntaxDb[item.name]) {
						this.syntaxDb[item.name] = {
							name: item.name,
							added: item.added_in || "1.0",
							addon: addonName,
							type: item.type || "effect",
							patterns: item.patterns || [item.name],
							description: {
								en: item.description || "",
								ko: "" // 추후 번역 엔진 연동 구역
							}
						};
					}
				});
				this.saveDb(); // 파일로 저장
			}
			vscode.window.setStatusBarMessage(`$(check) ${addonName} 로드 완료`, 3000);
		} catch (error) {
			console.error(`${addonName} 동기화 실패:`, error);
			vscode.window.setStatusBarMessage(`$(error) ${addonName} 데이터 로드 실패`, 3000);
		}
	}
}