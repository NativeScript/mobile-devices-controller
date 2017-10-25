import { spawn, spawnSync } from "child_process";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { waitForOutput, executeCommand, tailFilelUntil } from "./utils";
import { IDevice, Device } from "./device";
import { Platform, DeviceType, Status } from "./enums";

export class IOSManager {

    private static XCRUN = "xcrun ";
    private static SIMCTL = `${IOSManager.XCRUN} simctl`;
    private static XCRUNLISTDEVICES_COMMAND = `${IOSManager.SIMCTL} list devices `;
    private static BOOT_DEVICE_COMMAND = `${IOSManager.XCRUN} instruments -v -t 'Blank' -l 1 -w `;
    private static GET_BOOTED_DEVICES_COMMAND = `${IOSManager.SIMCTL} list devices `;
    private static BOOTED = "Booted";
    private static SHUTDOWN = "Shutdown";
    private static OSASCRIPT_QUIT_SIMULATOR_COMMAND = "osascript -e 'tell application \"Simulator\" to quit'";
    private static IOS_DEVICE = "ios-device";

    public static getAllDevices(verbose: boolean = false) {
        const devices = IOSManager.parseDevices();
        if (verbose) {
            console.log("All devices: ", devices);
        }

        return devices;
    }

    public static async startSimulator(simulator: IDevice) {
        let udid = simulator.token;
        executeCommand(IOSManager.SIMCTL + " erase " + udid);
        const process = IOSManager.startSimulatorProcess(udid);

        let responce: boolean = await waitForOutput(process, /Instruments Trace Complete:/ig, /Failed to load/ig, 180000);
        if (responce === true) {
            responce = IOSManager.checkIfSimulatorIsBooted(udid, 180000);
            if (responce) {
                simulator.type = DeviceType.SIMULATOR;
                simulator.status = Status.BOOTED;
                simulator.procPid = process.pid;
                simulator.startedAt = Date.now();
                console.log(`Launched simulator with name: ${simulator.name}; udid: ${simulator.token}; status: ${simulator.status}`);
            }
        } else {
            console.log("Simulator is probably already started!");
        }

        return simulator;
    }

    public static async restartDevice(device: IDevice) {
        if (device.type === DeviceType.SIMULATOR) {
            IOSManager.kill(device.token);
            device.status = Status.SHUTDOWN;
            device.procPid = undefined;
            device.startedAt = -1;
            device.busySince = -1;
            await IOSManager.startSimulator(device);
        }
    }

    public static killAll() {
        const log = executeCommand("killall Simulator ");
        executeCommand(IOSManager.OSASCRIPT_QUIT_SIMULATOR_COMMAND);
    }

    public static kill(udid: string) {
        console.log(`Killing simulator with udid ${udid}`);
        executeCommand(IOSManager.SIMCTL + "  shutdown " + udid);

        // Kill all the processes related with sim.id (for example WDA agents).
        const killAllRelatedProcessesCommand = "ps aux | grep -ie " + udid + " | awk '{print $2}' | xargs kill -9";
        executeCommand(killAllRelatedProcessesCommand);
    }

    public static getInstalledApps(token) {
        const apps = new Array();
        const rowData = executeCommand("find " + IOSManager.getSimLocation(token) + "/data/Containers/Bundle/Application -type d -name *.app").split("\\r?\\n");
        rowData.forEach(sim => {
            const rowBundle = executeCommand("defaults read " + sim + "/Info.plist | grep CFBundleIdentifier");
            const appId = rowBundle.split("\"")[1];
            apps.push(appId);
        });

        return apps;
    }

    public static installApp(token, fullAppName) {
        executeCommand(IOSManager.SIMCTL + " install " + token, fullAppName);
    }

    public static uninstallApp(token, bundleId) {
        executeCommand(IOSManager.SIMCTL + " uninstall " + token + " " + bundleId);
    }

    private static startSimulatorProcess(udid) {
        //xcrun instruments -v -t 'Blank' -l 100 -w
        const simProcess = spawn(IOSManager.BOOT_DEVICE_COMMAND, [udid], {
            shell: true,
            detached: false
        });

        executeCommand

        return simProcess;
    }

    private static isRunning(token) {
        const out = executeCommand(IOSManager.SIMCTL + " spawn " + token + " launchctl print system | grep com.apple.springboard.services ");
        return out.includes("M   A   com.apple.springboard.services");
    }

    public static parseDevices(stdout = undefined) {
        if (!stdout) {
            stdout = executeCommand(IOSManager.XCRUNLISTDEVICES_COMMAND);
        }

        let deviceSectionRe = /-- iOS (.+) --(\n\s{4}.+)*/mg;
        let matches = [];
        let match = deviceSectionRe.exec(stdout);

        while (match !== null) {
            matches.push(match);
            match = deviceSectionRe.exec(stdout);
        }
        if (matches.length < 1) {
            throw new Error("No matching devices!!!");
        }

        const devices: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>();
        for (match of matches) {
            let apiLevel = match[1];
            // split the full match into lines and remove the first
            for (let line of match[0].split('\n').slice(1)) {
                let lineRe = /([^\s].+) \((\w+-.+\w+)\) \((\w+\s?\w+)\)/; // https://regex101.com/r/lG7mK6/3
                let lineMatch = lineRe.exec(line);
                if (lineMatch === null) {
                    throw new Error(`Could not match line: ${line}`);
                }

                const status: Status = <Status>lineMatch[3].toLowerCase();
                const device = new IOSDevice(
                    lineMatch[2],
                    lineMatch[1],
                    status,
                    DeviceType.SIMULATOR,
                    apiLevel
                );
                if (!devices.has(device.name)) {
                    devices.set(device.name, new Array<IDevice>());
                    devices.get(device.name).push(device);
                } else {
                    devices.get(device.name).push(device);
                }
            }
        }

        return devices;
    }

    public static filterDeviceBy(...args) {
        const mappedDevices = IOSManager.parseDevices();
        const result = new Array<IDevice>();
        mappedDevices.forEach(devices => {
            devices.forEach(device => {
                let shouldAdd = true;
                args.forEach(arg => {
                    if (device.toString().includes(arg)) {
                        shouldAdd = shouldAdd && true;
                    } else {
                        shouldAdd = false;
                    }
                });
                if (shouldAdd) {
                    result.push(device);
                }
            });
        });

        return result;
    }

    public async getScreenshot(dir, token) {
        let pathToScreenshotPng = resolve(dir, `screenshot-${token}.png`);
        executeCommand(`${IOSManager.SIMCTL} io ${token} 'screenshot' ${pathToScreenshotPng}`);
        let screenshotImg = readFileSync(pathToScreenshotPng);
        //await fs.rimraf(pathToScreenshotPng);
        return screenshotImg.toString('base64');
    }

    // Should find a better way
    private static checkIfSimulatorIsBooted(udid, timeout) {
        const startTime = new Date().getTime();
        let currentTime = new Date().getTime();

        console.log("Check if simulator is booted!");
        let booted = false;
        while ((currentTime - startTime) < timeout && !booted) {
            currentTime = new Date().getTime();
            const devices = IOSManager.filterDeviceBy(udid, Status.BOOTED);
            booted = devices.length > 0 && IOSManager.isRunning(udid);
        }

        if (!booted) {
            let error = "Simulator with " + udid + " failed to boot";
            console.log(error, true);
        } else {
            console.log("Simulator is booted!");
        }

        return booted;
    }

    // Not testes to the end
    private static async waitForBootInSystemLog(simulator: IDevice, bootedIndicator, startupTimeout) {
        return await IOSManager.tailLogsUntil(simulator.token, bootedIndicator, startupTimeout);
    }

    private static async tailLogsUntil(token, bootedIndicator, timeoutMs) {
        let simLog = resolve(IOSManager.getLogDir(token), 'system.log');

        // we need to make sure log file exists before we can tail it
        let exists = existsSync(simLog);
        while (!exists) {
            exists = existsSync(simLog);
        }

        console.info(`Simulator log at '${simLog}'`);
        console.info(`Tailing simulator logs until we encounter the string "${bootedIndicator}"`);
        console.info(`We will time out after ${timeoutMs}ms`);
        let isBooted = false;
        try {
            let result = tailFilelUntil(simLog, "com.apple.intents.intents-image-service", 0);
            while (!result.result) {
                result = tailFilelUntil(simLog, bootedIndicator, result.index);
            }
            isBooted = result.result;

        } catch (err) {
            console.debug('Simulator startup timed out. Continuing anyway.');
        }

        return isBooted;
    }

    private static getSimLocation(token) {
        const simRoot = resolve(process.env.HOME, "/Library/Developer/CoreSimulator/Devices/");
        return simRoot + token;
    }

    public static getLogDir(token) {
        let home = process.env.HOME;
        return resolve(home, 'Library', 'Logs', 'CoreSimulator', token);
    }
}

export class IOSDevice extends Device {
    constructor(token: string, name: string, status: Status, type: DeviceType, apiLevel?: string, procPid?: number) {
        super(name, apiLevel, type, Platform.IOS, token, status, procPid);
    }
}