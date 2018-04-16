export declare function executeCommand(args: any, cwd?: string): string;
export declare function waitForOutput(process: any, matcher: any, errorMatcher: any, timeout: any): Promise<boolean>;
export declare function isWin(): boolean;
export declare function isMac(): boolean;
export declare function killProcessByName(name: any): void;
export declare function killPid(pid: any, signal?: string): void;
export declare function tailFilelUntil(file: any, condition: any, index?: number): {
    result: boolean;
    index: number;
};
export declare function fileExists(p: any): boolean;
export declare function searchFiles(folder: string, words: string, recursive?: boolean, files?: Array<string>): string[];
export declare function isDirectory(fullName: string): boolean;
export declare function getFiles(folder: string): string[];
export declare function createRegexPattern(text: string): RegExp;
export declare function attachToProcess(processToWatchLog: any, matcher: any, timeOut: any): Promise<{}>;
export declare function waitForResult(childProcess: any, matcher: any, timeout: any): Promise<string>;
export declare const wait: (miliseconds: any) => boolean;
export declare const getRegexResultsAsArray: (regex: any, str: any) => any[];
