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
        const cleanLine = userLine.replace(/^[\s\t]+|[\s\t]+$/g, '').trim();
        if (!cleanLine) return null;

        const normalizedLine = cleanLine.replace(/[\s\t]+/g, ' ');
        const firstWord = normalizedLine.split(' ')[0].toLowerCase();
        const capitalizedWord = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
        
        // 1. 대소문자 바구니 통합 추출
        let candidates: any[] = [
            ...(this.indexedDb[firstWord] || []),
            ...(this.indexedDb[capitalizedWord] || [])
        ];

        // 🌟 [최강 안전망] indexedDb 내부 구조가 꼬여있어 candidates가 비어있을 경우,
        // 어떠한 엇박자도 용납하지 않고 전체 오브젝트 맵을 전수조사하여 첫단어 일치 후보를 실시간으로 다 긁어모읍니다.
        if (candidates.length === 0) {
            try {
                const allSyntaxes: any[] = [];
                for (const key of Object.keys(this.indexedDb)) {
                    const value = this.indexedDb[key];
                    if (Array.isArray(value)) {
                        allSyntaxes.push(...value);
                    } else if (value && typeof value === 'object') {
                        allSyntaxes.push(...Object.values(value));
                    }
                }
                
                candidates = allSyntaxes.filter((syntax: any) => {
                    if (!syntax || !syntax.patterns) return false;
                    return syntax.patterns.some((p: string) => {
                        if (!p) return false;
                        const pClean = p.replace(/[\[\]()%<>.+]/g, '').trim();
                        const pFirst = pClean.split(' ')[0].toLowerCase();
                        return pFirst === firstWord || 'on' === firstWord;
                    });
                });
            } catch (e) {
                candidates = [];
            }
        }

        // 🌟 [무적 필수 구문 백업] 공식 문서의 허점을 메우는 필수 뼈대 강제 주입
        if (firstWord === 'send') {
            candidates.push({
                name: "send message",
                patterns: ["send %objects% to %audiences%", "send %objects%"]
            } as any);
        }
        if (firstWord === 'message' || firstWord === 'msg') {
            candidates.push({
                name: "message",
                patterns: ["message %objects% to %audiences%", "message %objects%"]
            } as any);
        }
        if (firstWord === 'return') {
            candidates.push({
                name: "return",
                patterns: ["return %objects%", "return"]
            } as any);
        }

        if (candidates.length === 0) return null; 

        // 2. 후보군 패턴 정밀 매칭 검사
        for (const syntax of candidates) {
            if (!syntax || !syntax.patterns) continue;
            for (const pattern of syntax.patterns) {
                const regex = this.patternToRegex(pattern); 
                
                // 일반 구문 매칭 및 이벤트(on load 등) 유연 방어 매칭
                if (regex.test(cleanLine) || (cleanLine.startsWith('on ') && regex.test(cleanLine.substring(3)))) {
                    return syntax; 
                }
            }
        }

        return null; 
    }

	private patternToRegex(pattern: string): RegExp {
        try {
            let p = pattern.trim();

            // 1. %type% 와일드카드와 <.+> 기호들을 정규식 무적 와일드카드(.*)로 치환
            p = p.replace(/%[^%]+%/g, "(.*)");
            p = p.replace(/<[^>]+>/g, "(.*)");

            // 2. 🌟 [핵심] 정규식 깨짐을 유발하는 원흉인 소괄호 () 와 대괄호 [] 기호들을 
            // 굳이 정규식 그룹으로 만들지 말고, 그냥 순수 공백이나 와일드카드 수준으로 평탄화(Flat) 시켜버립니다!
            // 이렇게 하면 어떤 개판인 중첩 패턴이 들어와도 Unterminated group 에러가 절대로 발생하지 않습니다.
            p = p.replace(/\[/g, ' ').replace(/\]/g, ' ')
                 .replace(/\(/g, ' ').replace(/\)/g, ' ')
                 .replace(/\|/g, ' '); // 파이프라인 기호도 공백 처리

            // 3. 혹시 남아있을지 모르는 다른 정규식 예약어들 안전하게 이스케이프
            p = p.replace(/[.*+?^$|\\+]/g, '\\$&');

            // 4. 연속된 공백 및 띄어쓰기를 유연하게 허용하는 정규식으로 마감
            p = p.replace(/\s+/g, "\\s*");

            return new RegExp(`^${p}$`, "i");

        } catch (e) {
            // 세상이 무너져도 에러를 뱉지 않고 조용히 패스하게 만드는 최후의 보루
            return /^__SAFE_IGNORE_DUMMY_REGEX__$/i;
        }
    }

	/** 로컬에 저장된 DB 로드 및 Seed Data 초기화 */
	private loadLocalDb(extensionPath: string) {
		// [강제 리셋 장치] 루트 경로에서 우리가 정성껏 만든 1056개 core_syntax.json을 조준합니다.
		const defaultDataPath = path.join(extensionPath, 'src', 'resource', 'core_syntax.json');

		try {
			if (fs.existsSync(defaultDataPath)) {
				// 🌟 핵심: 옛날 캐시 파일이 있든 없든, 무조건 새 1056개 데이터를 가져와서 강제로 덮어씁니다!
				const defaultData = fs.readFileSync(defaultDataPath, 'utf-8');
				this.syntaxDb = JSON.parse(defaultData);

				// 전역 캐시 위치(this.storagePath)에도 새 데이터를 강제로 박아버립니다.
				this.saveDb();
				console.log("🌟 [vskript] 1056개의 최신 구문 데이터베이스 강제 로드 및 캐시 리셋 완료!");
				this.buildIndex();
				return; // 캐시 리셋을 완벽하게 끝냈으므로 아래 낡은 코드는 실행 안 하고 즉시 종료!
			}
		} catch (err) {
			console.error("기본 데이터 리셋 중 오류 발생, 안전 모드로 전환합니다:", err);
		}

		// --- 혹시라도 위 리셋 로직이 실패했을 때만 작동하는 안전 백업용 기존 로직 ---
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