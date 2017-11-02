export declare function executeCommand(args: any, cwd?: string): string;
export declare function waitForOutput(process: any, matcher: any, errorMatcher: any, timeout: any): Promise<boolean>;
export declare function isWin(): boolean;
export declare function killProcessByName(name: any): void;
export declare function killPid(pid: any, signal?: string): void;
export declare function tailFilelUntil(file: any, condition: any, index?: number): {
    result: boolean;
    index: number;
};
