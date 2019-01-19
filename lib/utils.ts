import * as childProcess from "child_process";
import {
    readFileSync,
    readdirSync,
    statSync
} from "fs";

import { resolve } from "path";
import { createInterface } from "readline";
import { DeviceType, Platform } from "./enums";
import { isRegExp } from "util";

export const killAllProcessAndRelatedCommand = args => {
    if (!args || args.length === 0) return;
    args = Array.isArray(args) ? args : [args];
    const greps = new Array();
    args.forEach(e => greps.push(`| grep -ie '${e}'`));
    greps.push("| grep -v grep ");
    greps.push("| awk '{print $2}'");
    const killCommand = `/bin/ps aux ${greps.join(" ")} | xargs kill -9`;
    console.log(`Executing "${killCommand}"`);
    childProcess.execSync(killCommand, {
        stdio: "pipe",
        cwd: process.cwd(),
        env: process.env
    });
};

export const isProcessAlive = (arg: any) => {
    const result = childProcess.spawnSync(`/bin/ps aux`, [`| grep -i ${arg} | grep -v grep`], {
        shell: true
    });
    const test = !result.output.every(output => !output || output.length === 0)
        && result.output
            .filter(output => output && output.length > 0)
            .every(f => {
                return new RegExp(arg.toString().trim()).test(f + "");
            });
    console.log(`Is process ${arg} alive: ${test}`);
    return test;
}
export function executeCommand(args, cwd = process.cwd(), timeout = 720000): string {
    const [baseCommand, ...commands] = args.trim().split(" ").filter(c => c && c.trim() !== "");
    const output = childProcess.spawnSync(baseCommand, commands, {
        cwd: cwd,
        shell: true,
        encoding: "UTF8",
        timeout: timeout
    });

    return output && output.stdout && output.stdout.toString();
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

export const sortDescByApiLevelPredicate = (a, b) => { return (+a.apiLevel !== NaN && +b.apiLevel) ? +b.apiLevel - +a.apiLevel : -1 };
export const sortAscByApiLevelPredicate = (a, b) => { return (+a.apiLevel !== NaN && +b.apiLevel) ? +a.apiLevel - +b.apiLevel : -1 };

export const convertStringToRegExp = (phrase) => {
    if (!phrase) return phrase;
    if (isRegExp(phrase)) {
        return phrase;
    }

    if (/(^\"\/|^\/)(\w.+.|\W.+.)\/([a-z]+$|[a-z]+\"$|\"|$)/.test(phrase)) {
        const match = /(^\"\/|^\/)(\w.+.|\W.+.)\/([a-z]+$|[a-z]+\"$|\"|$)/.exec(phrase);
        return new RegExp(match[2], match[3]);
    }

    return phrase;
}

const basicPredicateFilter = (searchQuery, device, prop) => {
    if (searchQuery[prop]) {
        const searchPropValue = convertStringToRegExp(searchQuery[prop]);
        if (!isRegExp(searchPropValue) && typeof searchQuery[prop] === 'object') {
            return true;
        }
        if (isRegExp(searchPropValue)) {
            return searchPropValue.test(device[prop]);
        }

        return searchQuery[prop] === device[prop];
    } else {
        return true;
    }
}

export const filterPredicate = (searchQuery, device) =>
    (!searchQuery || searchQuery === null || Object.getOwnPropertyNames(searchQuery).length === 0)
        ? true : Object.getOwnPropertyNames(searchQuery)
            .every(prop => {
                return basicPredicateFilter(searchQuery, device, prop);
            });

export const filterAndroidPredicate = (searchQuery, device) =>
    (!searchQuery || searchQuery === null || Object.getOwnPropertyNames(searchQuery).length === 0)
        ? true : Object.getOwnPropertyNames(searchQuery)
            .every(prop => {
                if (searchQuery[prop]
                    && (prop === "apiLevel" || prop === "releaseVersion")) {
                    let searchApiLevelQueryValue = convertStringToRegExp(searchQuery[prop]);
                    searchApiLevelQueryValue = isRegExp(searchApiLevelQueryValue) ? searchApiLevelQueryValue : new RegExp(searchApiLevelQueryValue);
                    return searchApiLevelQueryValue.test(device[prop]) || searchApiLevelQueryValue.test(device["releaseVersion"]);
                }
                return basicPredicateFilter(searchQuery, device, prop);
            });

export function filter<T>(devices: Array<T>, searchQuery) {
    if (searchQuery.type === DeviceType.EMULATOR || searchQuery.Platform === Platform.ANDROID) {
        return devices.filter((device) => filterAndroidPredicate(searchQuery, device))
    }

    return devices.filter((device) => filterPredicate(searchQuery, device))
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

export const copyIDeviceQuery = (source, target = {}) => {
    Object.getOwnPropertyNames(source)
        .forEach(prop => {
            const p = prop.startsWith("_") ? prop.substring(1) : prop;
            if (source[p]) {
                target[p] = source[p];
            }
        });

    return target;
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
