import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export interface SyntaxData {
    added: string;
    addon?: string;
    removed?: string;
    description_ko?: string;
}

export class SkriptHubClient {
    private static readonly API_URL = "https://skripthub.net/api/v1/syntax/";
    private storagePath: string;
    private syntaxDb: { [key: string]: SyntaxData } = {};

    constructor(context: vscode.ExtensionContext) {
        // 확장 프로그램의 로컬 저장소 경로 설정
        this.storagePath = path.join(context.globalStorageUri.fsPath, 'syntax_db.json');
        this.loadLocalDb();
    }

    /** 로컬에 저장된 DB 로드 */
    private loadLocalDb() {
        if (fs.existsSync(this.storagePath)) {
            const rawData = fs.readFileSync(this.storagePath, 'utf-8');
            this.syntaxDb = JSON.parse(rawData);
        }
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
                        added: item.added_in || "2.0",
                        addon: "Skript", // 기본적으로 Skript 코어 구문으로 간주
                        description_ko: "" // 나중에 번역 엔진으로 채울 공간
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
                            added: item.added_in || "1.0",
                            addon: addonName,
                            description_ko: "" // 추후 번역 엔진 연동 구역
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