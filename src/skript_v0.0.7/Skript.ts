import { workspace, window, Uri } from 'vscode';
import * as FileSystem from 'fs';
import * as Path from 'path';
import { SkriptDocument, SkriptPath } from './SkriptDocument';

export const DOCUMENTS = new Array<SkriptDocument>();

/** 스크립트 활성화 시 워크스페이스 전체 스캔 */
export async function onSkriptEnable() {
    window.showInformationMessage("스캔 로직이 시작되었습니다!"); 

    DOCUMENTS.length = 0;

    // 1. 모든 .sk 파일을 찾습니다. (패턴을 더 단순화)
    const files = await workspace.findFiles('**/*.sk');
    
    // 디버깅용: 찾은 파일 개수를 바로 확인해봅시다.
    if (files.length === 0) {
        window.showWarningMessage("워크스페이스에서 .sk 파일을 하나도 찾지 못했습니다. 폴더를 열었는지 확인해주세요!");
        return;
    }

    for (const fileUri of files) {
        try {
            const workspaceFolder = workspace.getWorkspaceFolder(fileUri);
            if (!workspaceFolder) continue;

            const rootPath = workspaceFolder.uri.fsPath;
            // .sk 확장자를 가진 파일인지 다시 한번 검증
            if (Path.extname(fileUri.fsPath) !== '.sk') continue;

            const relativePath = Path.relative(rootPath, fileUri.fsPath);
            const skPath = new SkriptPath(rootPath, relativePath);

            const content = FileSystem.readFileSync(fileUri.fsPath, { encoding: 'UTF-8' });
            const skDocument = new SkriptDocument(skPath, content);
            
            DOCUMENTS.push(skDocument);
        } catch (error) {
            console.error(`파일 로드 실패: ${fileUri.fsPath}`, error);
        }
    }
    
    window.showInformationMessage(`성공적으로 ${DOCUMENTS.length}개의 스크립트 파일을 로드했습니다!`);
}

/** 경로와 일치하는 SkriptDocument 찾기 */
export function find(fsPath: string): SkriptDocument | undefined {
    return DOCUMENTS.find(doc => doc.skPath.fsPath === fsPath);
}

// 기존의 복잡했던 _getSkriptPaths 함수는 이제 필요 없으므로 제거해도 됩니다.