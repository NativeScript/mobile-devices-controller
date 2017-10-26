import * as childProcess from "child_process";
import { readFileSync } from "fs";

export function executeCommand(args, cwd?): string {
    cwd = cwd || process.cwd();

    const output = childProcess.spawnSync("", args.split(" "), {
        shell: true,
        cwd: process.cwd(),
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