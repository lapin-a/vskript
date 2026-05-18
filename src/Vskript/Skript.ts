import { workspace, window } from 'vscode'
import * as FileSystem from 'fs'
import * as Path from 'path'
import * as vscode from 'vscode' // Uri 타입을 위해 vscode 임포트 추가
import { SkriptDocument, SkriptPath } from './SkriptDocument';

// [오타 교정] WORKSAPCE_FATH -> WORKSPACE_FOLDERS
const WORKSPACE_FOLDERS = workspace.workspaceFolders;

export const DOCUMENTS = new Array<SkriptDocument>();

/** 스크립트 전체 실행 (초기 스캔) */
export async function onSkriptEnable() {

	if (WORKSPACE_FOLDERS) {
		for (const path of WORKSPACE_FOLDERS) {
			let rootPath = new SkriptPath(path.uri.fsPath, '');
			for (let skPath of await _getSkriptPaths(rootPath)) {
				let document = FileSystem.readFileSync(skPath.fsPath, {encoding: 'UTF-8'});
				let skDocument = new SkriptDocument(skPath, document);
				DOCUMENTS.push(skDocument);
				
				console.log(`[즉시 스캔 완료] ${Path.basename(skPath.fsPath)}`);
			};
		}
		window.showInformationMessage(`Loaded ${DOCUMENTS.length} skript files.`);
	}
	
}

/** * 단일 파일 스캔 및 등록 (extension.ts 동기화용 수술 부위)
 */
export function scanSingleFile(uri: vscode.Uri): SkriptDocument {
	const fsPath = uri.fsPath;
	
	// 이미 인덱싱된 문서가 있다면 중복 등록 방지하고 즉시 반환
	let existing = find(fsPath);
	if (existing) return existing;

	// 워크스페이스 루트 경로 추적 (없을 시 파일의 부모 폴더를 임시 루트로 지정)
	let root = workspace.workspaceFolders?.[0]?.uri.fsPath || Path.dirname(fsPath);
	let name = Path.relative(root, fsPath);
	
	let skPath = new SkriptPath(root, name);
	let documentContent = FileSystem.readFileSync(fsPath, {encoding: 'UTF-8'});
	let skDocument = new SkriptDocument(skPath, documentContent);
	
	DOCUMENTS.push(skDocument);
	console.log(`[즉시 스캔 완료] ${Path.basename(fsPath)}`);
	
	return skDocument;
}

/** 경로와 같은 SkriptFile이 있으면 반환 */
export function find(fsPath:string): SkriptDocument | undefined {
	for (const document of DOCUMENTS) if (document.skPath.fsPath === fsPath) {
		return document;
	}
	return;
}

/** 하위경로 받아오기 */
async function _getSkriptPaths(loopPath: SkriptPath): Promise<SkriptPath[]> {
	let skPathArray = new Array<SkriptPath>();
	for (const file of FileSystem.readdirSync(loopPath.fsPath, {encoding:'UTF-8', withFileTypes:true})) {
		let skPath = new SkriptPath(loopPath.root, Path.join(loopPath.name, file.name));
		if (file.name.charAt(0) === '-') {
			continue;
		}
		if (file.isDirectory()) {
			skPathArray.push(...await _getSkriptPaths(skPath))
		} else if (Path.extname(file.name) === '.sk') {
			skPathArray.push(skPath);
		}
	};
	return new Promise((resolve) => {
		resolve(skPathArray);
	})
}