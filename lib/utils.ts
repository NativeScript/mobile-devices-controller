import * as childProcess from "child_process";

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
    if (!isWin) {
        executeCommand("killall " + name);
    } else {
        childProcess.execSync('taskkill /IM ' + name + ' /T /F');
    }
}

export function killPid(pid, signal = "SIGINT") {
    if (!isWin) {
        process.kill(pid, signal);
    } else {
        childProcess.execSync('taskkill /PID ' + pid + ' /T /F');
    }
}