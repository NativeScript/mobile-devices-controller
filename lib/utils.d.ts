export declare const killAllProcessAndRelatedCommand: (args: any) => string;
export declare const isProcessAlive: (arg: any) => boolean;
export declare function executeCommand(args: any, cwd?: string, timeout?: number): string;
export declare function waitForOutput(process: any, matcher: any, errorMatcher: any, timeout: any): Promise<boolean>;
export declare function isWin(): boolean;
export declare function isMac(): boolean;
export declare function killProcessByName(name: any): void;
export declare function killPid(pid: any, signal?: string): void;
export declare function tailFileUntil(file: any, condition: any, index?: number): {
    result: boolean;
    index: number;
};
export declare const sortDescByApiLevelPredicate: (a: any, b: any) => number;
export declare const sortAscByApiLevelPredicate: (a: any, b: any) => number;
export declare const filterPredicate: (searchQuery: any, device: any) => boolean;
export declare const filterAndroidPredicate: (searchQuery: any, device: any) => boolean;
export declare function filter<T>(devices: Array<T>, searchQuery: any): T[];
export declare function searchFiles(folder: string, words: string, recursive?: boolean, files?: Array<string>): string[];
export declare function isDirectory(fullName: string): boolean;
export declare function getFiles(folder: string): string[];
export declare function createRegexPattern(text: string): RegExp;
export declare function getAllFileNames(folder: string): string[];
export declare function attachToProcess(processToWatchLog: any, matcher: any, timeOut: any): Promise<{}>;
export declare function waitForResult(childProcess: any, matcher: any, timeout: any): Promise<string>;
export declare const wait: (miliseconds: any) => boolean;
export declare const getRegexResultsAsArray: (regex: any, str: any) => any[];
export declare function logInfo(info: any, obj?: any): void;
export declare function logWarn(info: any, obj?: any): void;
export declare function logError(info: any, obj?: any): void;
