import * as childProcess from "child_process";
import {
    readFileSync,
    readdirSync,
    existsSync,
    statSync
} from "fs";

import { resolve } from "path";
import { createInterface } from "readline";

export function executeCommand(args, cwd = process.cwd()): string {
    const commands = args.trim().split(" ");
    const baseCommand = commands.shift();
    const output = childProcess.spawnSync(baseCommand, commands, {
        cwd: cwd,
        shell: true,
        encoding: "UTF8"
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

export function killProcessByName(name) {
    if (!isWin()) {
        executeCommand("killall " + name);
    } else {
        childProcess.execSync('taskkill /IM ' + name + ' /T /F');
    }
}

export function killPid(pid, signal = "SIGINT") {
    if (!isWin()) {
        process.kill(pid, signal);
    } else {
        childProcess.execSync('taskkill /PID ' + pid + ' /T /F');
    }
}

export function tailFilelUntil(file, condition, index = 0) {
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

export function fileExists(p) {
    try {
        if (existsSync(p)) {
            return true;
        }

        return false;
    } catch (e) {
        if (e.code == 'ENOENT') {
            console.log("File does not exist. " + p);
            return false;
        }

        console.log("Exception fs.statSync (" + p + "): " + e);
        throw e;
    }
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