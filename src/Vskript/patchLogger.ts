import * as path from 'path';

// 🌟 다른 모듈이 로드되기 전, 순정 콘솔 객체를 완벽하게 선점합니다.
const originalLog = console.log;
const originalInfo = console.info;

const interceptor = function(originalFn: any, ...args: any[]) {
    const fullLogMessage = args.map(a => String(a)).join(' ');
    
    if (fullLogMessage.includes('[즉시 스캔 완료]') || fullLogMessage.includes('[데이터 업데이트]') || fullLogMessage.includes('초고속 최적화 성공')) {
        // 경로 기호(\, /)를 기준으로 문장 맨 끝의 순수 .sk 파일명만 무조건 낚아챕니다.
        const fileMatch = fullLogMessage.match(/([^\\\/]+\.sk)/i);
        if (fileMatch && fileMatch[1]) {
            const fileName = fileMatch[1].trim();
            if (fileName.startsWith('-')) return; // 하이픈 비활성화 파일 출력 전면 차단
            
            if (fullLogMessage.includes('[즉시 스캔 완료]')) {
                originalFn(`[즉시 스캔 완료] ${fileName}`);
            } else {
                originalFn(`[데이터 업데이트] 초고속 최적화 성공: ${fileName}`);
            }
            return;
        }
    }
    originalFn(...args);
};

console.log = (...args: any[]) => interceptor(originalLog, ...args);
console.info = (...args: any[]) => interceptor(originalInfo, ...args);