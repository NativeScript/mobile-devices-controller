export declare function executeCommand(args: any, cwd?: any): string;
export declare function waitForOutput(process: any, matcher: any, errorMatcher: any, timeout: any): Promise<boolean>;
export declare function isWin(): boolean;
export declare function killProcessByName(name: any): void;
export declare function killPid(pid: any, signal?: string): void;
