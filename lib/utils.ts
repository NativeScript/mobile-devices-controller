import * as childProcess from "child_process";
import {
    readFileSync,
    readdirSync,
    existsSync,
    statSync
} from "fs";

import { resolve } from "path";
import { createInterface } from "readline";

export function executeCommand(args, cwd = process.cwd(), timeout = 720000): string {
    const commands = args.trim().split(" ");
    const baseCommand = commands.shift();
    const output = childProcess.spawnSync(baseCommand, commands, {
        cwd: cwd,
        shell: true,
        encoding: "UTF8",
        timeout: timeout
    });

    return output.output[1].toString();
}

export function waitForOutput(process, matcher, errorMatcher, timeout) {
    return new Promise<boolean>(function (resolve, reject) {
        const abortWatch = setTimeout(function () {
            process.kill();
            console.log("Timeout expired, output not detected for: " + matcher);
            resolve(false);
        }, timeout);

        process.stdout.on("data", function (data) {
            let line = "" + data;
            console.log(line);
            if (errorMatcher.test(line)) {
                clearTimeout(abortWatch);
                resolve(false);
            }

            if (matcher.test(line)) {
                clearTimeout(abortWatch);
                resolve(true);
            }
        });
    });
}

export function isWin() {
    return /^win/.test(process.platform);
}

export function isMac() {
    return /^darwin/.test(process.platform);
}

export function killProcessByName(name) {
    if (!isWin()) {
        executeCommand("killall " + name);
    } else {
        childProcess.execSync('taskkill /IM ' + name + ' /T /F');
    }
}

export function killPid(pid, signal = "SIGINT") {
    if (!isWin()) {
        try {
            const result = process.kill(pid, signal);
            
            const killCommandLog = executeCommand(`kill -9 ${pid}`);
            logWarn(killCommandLog)
        } catch (error) { }

    } else {
        childProcess.execSync('taskkill /PID ' + pid + ' /T /F || true');
    }
}

export function tailFileUntil(file, condition, index = 0) {
    const log = readFileSync(file, "UTF8");
    const logTail = log.substr(index, log.length - 1);
    let result = false;
    if (logTail.includes(condition)) {
        result = true;
    }

    index = log.length - 1;

    return {
        result: result,
        index: index,
    };
}

export function filter<T>(devices: Array<T>, searchQuery) {
    return devices.filter((device) => 
        (!searchQuery || searchQuery === null || Object.getOwnPropertyNames(searchQuery).length === 0)
        ? true
        : Object.getOwnPropertyNames(searchQuery).every(prop => searchQuery[prop] ? new RegExp(searchQuery[prop]).test(device[prop]) : true)
    );
}

export function searchFiles(folder: string, words: string, recursive: boolean = true, files: Array<string> = new Array()) {
    const rootFiles = getFiles(folder);
    const regex = createRegexPattern(words);
    rootFiles.filter(f => {
        const fileFullName = resolve(folder, f);
        regex.lastIndex = 0;
        let m = regex.test(f);
        if (m) {
            files.push(fileFullName);
        } else if (isDirectory(fileFullName) && recursive) {
            searchFiles(fileFullName, words, recursive, files);
        }
    });

    return files;
}

export function isDirectory(fullName: string) {
    try {
        if (statSync(fullName).isDirectory()) {
            return true;
        }
    } catch (e) {
        console.log(e.message);
        return false;
    }

    return false;
}


export function getFiles(folder: string) {
    let files: Array<string> = new Array();
    readdirSync(resolve(folder)).forEach(file => {
        files.push(file);
    });

    return files;
}

/// ^nativ\w*(.+).gz$ native*.gz
/// \w*nativ\w*(.+)\.gz$ is like *native*.gz
/// \w*nativ\w*(.+)\.gz\w*(.+)$ is like *native*.gz*
export function createRegexPattern(text: string) {
    let finalRex = "";
    text.split(",").forEach(word => {
        word = word.trim();
        let searchRegex = word;
        if (word !== "" && word !== " ") {
            searchRegex = searchRegex.replace(".", "\\.");
            searchRegex = searchRegex.replace("*", "\\w*(.+)?");
            if (!word.startsWith("*")) {
                searchRegex = "^" + searchRegex;
            }
            if (!word.endsWith("*")) {
                searchRegex += "$";
            }
            if (!finalRex.includes(searchRegex)) {
                finalRex += searchRegex + "|";
            }
        }
    });
    finalRex = finalRex.substring(0, finalRex.length - 1);
    const regex = new RegExp(finalRex, "gi");
    return regex;
}

export function getAllFileNames(folder: string) {
    let files: Array<string> = new Array();
    readdirSync(resolve(folder)).forEach(file => {
        files.push(file);
    });

    return files;
}

export async function attachToProcess(processToWatchLog, matcher, timeOut) {
    return new Promise((resolve, reject) => {
        waitForResult(processToWatchLog, matcher, timeOut).then((result) => {
            processToWatchLog.kill("SIGINT");
            resolve();
        });
    });
}

export async function waitForResult(childProcess, matcher, timeout) {
    let log = "";
    const reader = createInterface({ input: childProcess.stdout });
    return new Promise<string>((resolve, reject) => {
        const abortWatch = setTimeout(function () {
            childProcess.kill();
        }, timeout);
        reader.on("line", line => {
            console.log(line.toString());
            log += line.toString();
            if (matcher.test(line)) {
                clearTimeout(abortWatch);
                resolve(log);
            }
        });
    });
}

export const wait = miliseconds => {
    const startTime = Date.now();
    while (Date.now() - startTime <= miliseconds) { }
    return true;
}

export const getRegexResultsAsArray = (regex, str) => {
    let m;
    const result = [];
    while ((m = regex.exec(str)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }

        m.forEach(element => {
            if (result.indexOf(element) < 0) {
                result.push(element);
            }
        });
    }

    return result;
}


export function logInfo(info, obj = undefined) {
    if (obj) {
        info += " " + JSON.stringify(obj);
    }
    console.log(`${ConsoleColor.FgCyan}%s${ConsoleColor.Reset}`, info);
}

export function logWarn(info, obj = undefined) {
    if (obj) {
        info += " " + JSON.stringify(obj);
    }
    console.log(`${ConsoleColor.BgYellow}${ConsoleColor.FgBlack}%s${ConsoleColor.Reset}`, info);
}

export function logError(info, obj = undefined) {
    if (obj) {
        info += " " + JSON.stringify(obj);
    }
    console.log(`${ConsoleColor.BgRed}%s${ConsoleColor.Reset}`, info);
}

enum ConsoleColor {
    Reset = "\x1b[0m",
    Bright = "\x1b[1m",
    Dim = "\x1b[2m",
    Underscore = "\x1b[4m",
    Blink = "\x1b[5m",
    Reverse = "\x1b[7m",
    Hidden = "\x1b[8m",

    FgBlack = "\x1b[30m",
    FgRed = "\x1b[31m",
    FgGreen = "\x1b[32m",
    FgYellow = "\x1b[33m",
    FgBlue = "\x1b[34m",
    FgMagenta = "\x1b[35m",
    FgCyan = "\x1b[36m",
    FgWhite = "\x1b[37m",

    BgBlack = "\x1b[40m",
    BgRed = "\x1b[41m",
    BgGreen = "\x1b[42m",
    BgYellow = "\x1b[43m",
    BgBlue = "\x1b[44m",
    BgMagenta = "\x1b[45m",
    BgCyan = "\x1b[46m",
    BgWhite = "\x1b[47m"
}
