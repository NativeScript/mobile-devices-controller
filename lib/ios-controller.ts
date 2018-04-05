import { spawn, ChildProcess } from "child_process";
import { resolve, dirname, basename, sep } from "path";
import { existsSync, readFileSync, utimes, Stats } from "fs";
import {
    waitForOutput,
    executeCommand,
    tailFilelUntil,
    fileExists,
    attachToProcess,
    wait
} from "./utils";
import { IDevice, Device } from "./device";
import { Platform, DeviceType, Status } from "./enums";
import { IOSDeviceLib } from "ios-device-lib";

export class IOSController {

    private static XCRUN = "xcrun ";
    private static SIMCTL = `${IOSController.XCRUN} simctl`;
    private static XCRUNLISTDEVICES_COMMAND = `${IOSController.SIMCTL} list devices `;
    private static BOOT_DEVICE_COMMAND = `${IOSController.XCRUN} instruments -v -t 'Blank' -l 1 -w `;
    private static GET_BOOTED_DEVICES_COMMAND = `${IOSController.SIMCTL} list devices `;
    private static BOOTED = "Booted";
    private static SHUTDOWN = "Shutdown";
    private static OSASCRIPT_QUIT_SIMULATOR_COMMAND = "osascript -e 'tell application \"Simulator\" to quit'";
    private static IOS_DEVICE = "ios-device";
    private static devicesScreenInfo = new Map<string, IOSDeviceScreenInfo>();
    private static DEVICE_BOOT_TIME = 180000;
    private static WAIT_DEVICE_TO_RESPONCE = 180000;

    public static runningProcesses = new Array();

    public static getAllDevices(verbose: boolean = false): Promise<Map<string, Array<IDevice>>> {
        if (IOSController.devicesScreenInfo.size === 0) {
            IOSController.loadIOSDevicesScreenInfo();
        }
        const devices = IOSController.parseSimulators();
        const allDevices = IOSController.parseRealDevices(devices);
        if (verbose) {
            console.log("All devices: ", devices);
        }

        return Promise.resolve(allDevices);
    }

    static getSimulatorPidByToken(token: string) {
        const simulatorPidAsString = executeCommand(`ps ax | grep ${token} | grep -v grep`);
        const regex = new RegExp(/^\d+/, "gi");
        const regexMatch = regex.exec(simulatorPidAsString);
        if (regexMatch !== null && regexMatch.length > 0 && regexMatch[0]) {
            try {
                return parseInt(regex.exec(simulatorPidAsString)[0]);
            } catch (error) {
                console.error("Could't parse simulator pid", error);
            }
        }
        return undefined;
    }

    public static async startSimulator(simulator: IDevice): Promise<IDevice> {
        let udid = simulator.token;
        executeCommand(IOSController.SIMCTL + " erase " + udid);
        const process = IOSController.startSimulatorProcess(udid);

        let responce: boolean = await waitForOutput(process, /Instruments Trace Complete:/ig, /Failed to load/ig, IOSController.DEVICE_BOOT_TIME);
        if (responce === true) {
            responce = IOSController.checkIfSimulatorIsBooted(udid, IOSController.WAIT_DEVICE_TO_RESPONCE);
            if (responce) {

                simulator.type = DeviceType.SIMULATOR;
                simulator.status = Status.BOOTED;
                simulator.pid = IOSController.getSimulatorPidByToken(simulator.token);
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
            IOSController.kill(device.token);
            device.status = Status.SHUTDOWN;
            device.pid = undefined;
            device.startedAt = -1;
            device.busySince = -1;
            await IOSController.startSimulator(device);
        }
    }

    public static killAll() {
        const log = executeCommand("killall Simulator ");
        executeCommand(IOSController.OSASCRIPT_QUIT_SIMULATOR_COMMAND);
    }

    public static kill(udid: string) {
        console.log(`Killing simulator with udid ${udid}`);
        executeCommand(`${IOSController.SIMCTL} shutdown ${udid}`);

        // Kill all the processes related with sim.id (for example WDA agents).
        const killAllRelatedProcessesCommand = `ps aux | grep -ie ${udid} | awk '{print $2}' | xargs kill -9`;
        executeCommand(killAllRelatedProcessesCommand);
    }

    public static getInstalledApps(device: IDevice) {
        const apps = new Array();
        if (device.type === DeviceType.DEVICE) {
            const rowData = executeCommand(`ideviceinstaller -u ${device.token} -l`).replace("package:", "").split("\n");
            rowData.forEach(data => {
                if (data.includes(".") && data.includes("-")) {
                    const appId = data.replace(" ", "").split("-")[0];
                    apps.push(appId);
                }
            })
        } else {
            const rowData = executeCommand(`find ${IOSController.getSimLocation(device.token)} /data/Containers/Bundle/Application -type d -name *.app`).split("\n");
            rowData.forEach(data => {
                const rowBundle = executeCommand(`defaults read " ${data} /Info.plist | grep CFBundleIdentifier`);
                const appId = rowBundle.split("\"")[1];
                apps.push(appId);
            });
        }

        return apps;
    }

    public static async installApp(device: IDevice, fullAppName) {
        if (device.type === DeviceType.DEVICE) {
            const dl = new IOSDeviceLib(d => {
                console.log("Device FOUND!", device);
            }, device => {
                console.log("Device LOST!", device);
            });

            const installProcess = await dl.install(fullAppName, [device.token])[0];
            if (!installProcess.response.includes("Successfully installed application")) {
                console.error(installProcess.response);
            }
        } else {
            executeCommand(`${IOSController.SIMCTL} install ${device.token} ${fullAppName}`);
        }
    }

    public static async uninstallApp(device: IDevice, fullAppName: string, bundleId: string = undefined) {
        bundleId = bundleId || IOSController.getIOSPackageId(device.type, fullAppName);
        if (device.type === DeviceType.DEVICE) {
            const dl = new IOSDeviceLib(d => {
                console.log("Device found!", d);

            }, device => {
                console.log("Device LOST!", device);
            });

            const iDeviceAppData = [{ "ddi": undefined, "appId": bundleId, "deviceId": device.token }];
            wait(1000);
            const apps = await Promise.all(dl.apps([device.token]));
            if (apps.some(app => app.response.some(r => r.CFBundleIdentifier.includes(bundleId)))) {
                const stopProcess = (await Promise.all(dl.stop(iDeviceAppData)))[0];
                if (!stopProcess.response.includes("Successfully stopped application")) {
                    console.error(stopProcess.response);
                }

                const uninstallProcess = await dl.uninstall(bundleId, [device.token])[0];
                if (!uninstallProcess.response.includes("Successfully uninstalled application")) {
                    console.error(uninstallProcess.response);
                }
            }

            const result = executeCommand(`ideviceinstaller -u ${device.token} -i ${fullAppName}`);
        } else {
            executeCommand(`${IOSController.SIMCTL} uninstall ${device.token} ${bundleId}`);
        }
    }

    public static async refreshApplication(device: IDevice, fullAppName) {
        const bundleId = IOSController.getIOSPackageId(device.type, fullAppName);
        if (device.type === DeviceType.DEVICE) {
            const dl = new IOSDeviceLib(d => {
                console.log("Device found!", device);
            }, device => {
                console.log("Device LOST!", device);
            });

            wait(1000);
            const apps = await Promise.all(dl.apps([device.token]));

            console.log("KOR1", apps);

            const iDeviceAppData = [{ "ddi": undefined, "appId": bundleId, "deviceId": device.token }];
            if (apps.some(app => app.response.some(r => r.CFBundleIdentifier.includes(bundleId)))) {
                const stopProcess = (await Promise.all(dl.stop(iDeviceAppData)))[0];
                if (!stopProcess.response.includes("Successfully stopped application")) {
                    console.error(stopProcess.response);
                }

                const uninstallProcess = await dl.uninstall(bundleId, [device.token])[0];
                if (!uninstallProcess.response.includes("Successfully uninstalled application")) {
                    console.error(uninstallProcess.response);
                }
            }

            const installProcess = await dl.install(fullAppName, [device.token])[0];
            if (!installProcess.response.includes("Successfully installed application")) {
                console.error(installProcess.response);
            }

            const startProcess = await dl.start(iDeviceAppData)[0];
            if (!startProcess.response.includes("Successfully started application")) {
                throw new Error(`Failed to start application ${bundleId}`);
            }
        } else {
            Promise.resolve(executeCommand(`${IOSController.SIMCTL} launch ${device.token} ${bundleId}`));
        }
    }

    public static async startApplication(device: IDevice, fullAppName) {
        const bundleId = IOSController.getIOSPackageId(device.type, fullAppName);
        if (device.type === DeviceType.DEVICE) {
            const bundleId = IOSController.getIOSPackageId(device.type, fullAppName);
            if (device.type === DeviceType.DEVICE) {
                const dl = new IOSDeviceLib(d => {
                }, device => {
                    console.log("Device LOST!", device);
                });

                const startProcess = await dl.start([{ "ddi": undefined, "appId": bundleId, "deviceId": device.token }])[0];
                if (!startProcess.response.includes("Successfully started application")) {
                    throw new Error(`Failed to start application ${bundleId}`);
                }
            }
        } else {
            Promise.resolve(executeCommand(`${IOSController.SIMCTL} launch ${device.token} ${bundleId}`));
        }
    }

    private static startSimulatorProcess(udid) {
        //xcrun instruments -v -t 'Blank' -l 100 -w
        const simProcess = spawn(IOSController.BOOT_DEVICE_COMMAND, [udid], {
            shell: true,
            detached: false
        });

        return simProcess;
    }

    private static isRunning(token) {
        const out = executeCommand(`${IOSController.SIMCTL} spawn ${token} launchctl print system | grep com.apple.springboard.services `);
        return out.includes("M   A   com.apple.springboard.services");
    }

    public static parseSimulators(stdout = undefined): Map<string, Array<IDevice>> {
        if (!stdout) {
            stdout = executeCommand(IOSController.XCRUNLISTDEVICES_COMMAND);
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

                IOSController.devicesScreenInfo.forEach((v, k, m) => {
                    if (device.name.includes(k)) {
                        device.config = {
                            density: v.density,
                            offsetPixels: v.actionBarHeight
                        };
                    }
                });

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

    public static parseRealDevices(devices = new Map<string, IDevice[]>()) {
        const devicesUDID = executeCommand("idevice_id  --list").split('\n');
        devicesUDID.forEach(udid => {
            if (udid && udid !== "") {
                const deviceInfo = executeCommand(`ideviceinfo -s -u ${udid}`).split('\n');
                const device = new Device(undefined, undefined, DeviceType.DEVICE, Platform.IOS, udid, Status.BOOTED);
                deviceInfo.forEach(info => {
                    if (info && info.trim() !== "") {
                        if (info.toLowerCase().includes('devicename')) {
                            device.name = info.split(": ")[1].trim();
                        }
                        if (info.toLowerCase().includes('productversion')) {
                            device.apiLevel = info.split(": ")[1].trim();
                        }
                    }
                });
                if (device.name) {
                    if (devices.has(device.name)) {
                        devices.get(device.name).push(device);
                    } else {
                        devices.set(device.name, [device]);
                    }
                }
            }
        });

        return devices;
    }

    public static getSimLocation(token) {
        const simRoot = resolve(process.env.HOME, "/Library/Developer/CoreSimulator/Devices/", token);
        return simRoot;
    }

    public static filterDeviceBy(...args) {
        const mappedDevices = IOSController.parseSimulators();
        const result = new Array<IDevice>();
        mappedDevices.forEach(devices => {
            devices.forEach(device => {
                let shouldAdd = true;
                const deviceToString = (<Device>device).toString().toLocaleLowerCase();
                args.forEach(arg => {
                    if (deviceToString.includes(arg.toLocaleLowerCase())) {
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

    public static async getScreenshot(device: IDevice, dir, fileName) {
        const pathToScreenshotPng = resolve(dir, `${fileName}.png`);
        if (device.type === DeviceType.DEVICE) {
            executeCommand(`idevicescreenshot -u ${device.token} ${pathToScreenshotPng}`);
        } else {
            executeCommand(`${IOSController.SIMCTL} io ${device.token} screenshot ${pathToScreenshotPng}`);
        }

        return pathToScreenshotPng;
    }

    public static async recordVideo(device: IDevice, dir, fileName, callback: () => Promise<any>): Promise<any> {
        const { pathToVideo, videoRecoringProcess } = IOSController.startRecordingVideo(device, dir, fileName);

        return new Promise(async (res, reject) => {
            callback().then((result) => {
                videoRecoringProcess.kill("SIGINT");
                console.log(result);
                res(pathToVideo);
            }).catch((error) => {
                if (videoRecoringProcess) {
                    videoRecoringProcess.kill("SIGINT");
                }
                console.log('', error);
                reject(error);
            });
        });
    }

    public static startRecordingVideo(device: IDevice, dir, fileName) {
        if (device.type === DeviceType.DEVICE) {
            return;
        }

        const pathToVideo = resolve(dir, `${fileName}.mp4`).replace(" ", "\ ");
        console.log(`${IOSController.XCRUN} simctl io ${device.token} recordVideo ${pathToVideo}`);
        const videoRecoringProcess = spawn(`xcrun`, ['simctl ', 'io', device.token, 'recordVideo', `'${pathToVideo}'`], {
            cwd: process.cwd(),
            shell: true,
            stdio: 'inherit'
        });
        if (videoRecoringProcess) {
            IOSController.runningProcesses.push(videoRecoringProcess.pid);
        }

        return { pathToVideo: pathToVideo, videoRecoringProcess: videoRecoringProcess };
    }

    // Should find a better way
    private static checkIfSimulatorIsBooted(udid, timeout) {
        const startTime = new Date().getTime();
        let currentTime = new Date().getTime();

        console.log("Check if simulator is booted!");
        let booted = false;
        while ((currentTime - startTime) < timeout && !booted) {
            currentTime = new Date().getTime();
            const devices = IOSController.filterDeviceBy(udid, Status.BOOTED);
            booted = devices.length > 0 && IOSController.isRunning(udid);
        }

        if (!booted) {
            let error = `Simulator with " ${udid} failed to boot`;
            console.log(error, true);
        } else {
            console.log("Simulator is booted!");
        }

        return booted;
    }

    public static getIOSPackageId(deviceType: DeviceType, fullAppName) {
        let result = "";
        const plistPath = IOSController.getPlistPath(deviceType, fullAppName);

        if (fileExists(plistPath)) {
            const command = "/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' " + plistPath;
            result = executeCommand(command);
        } else {
            console.error("File " + plistPath + " does not exist.");
        }

        return result.trim();
    }

    /**
     * Get path of Info.plist of iOS app under test.
     * Info.plist holds information for app under test.
     *
     * @return path to Info.plist
     */
    private static getPlistPath(deviceType: DeviceType, fullAppName) {
        let plistPath = null;
        if (deviceType === DeviceType.SIMULATOR) {
            plistPath = resolve(fullAppName, "Info.plist");
        } else if (deviceType === DeviceType.DEVICE) {
            const appFullName = dirname(fullAppName) + sep + basename(fullAppName).replace(".ipa", "");
            const command = `unzip -o ${fullAppName} -d ${appFullName}`;
            executeCommand(command);
            const appName = executeCommand("ls " + resolve(appFullName, "Payload")).trim();
            plistPath = resolve(appFullName, "Payload", appName, "Info.plist");
        }

        return plistPath;
    }


    // Not testes to the end
    private static async waitForBootInSystemLog(simulator: IDevice, bootedIndicator, startupTimeout) {
        return await IOSController.tailLogsUntil(simulator.token, bootedIndicator, startupTimeout);
    }

    private static async tailLogsUntil(token, bootedIndicator, timeoutMs) {
        let simLog = resolve(IOSController.getLogDir(token), 'system.log');

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

    public static getLogDir(token) {
        let home = process.env.HOME;
        return resolve(home, 'Library', 'Logs', 'CoreSimulator', token);
    }

    private static loadIOSDevicesScreenInfo() {
        const devices = new Map<string, IOSDeviceScreenInfo>();

        // IOSController.devicesScreenInfo.set("iPhone 5", new IOSDeviceScreenInfo("iPhone 5", 640, 1336, 326, 30));
        // IOSController.devicesScreenInfo.set("iPhone 5C", new IOSDeviceScreenInfo("iPhone 5C", 640, 1336, 326, 30));
        // IOSController.devicesScreenInfo.set("iPhone 5S", new IOSDeviceScreenInfo("iPhone 5S", 640, 1336, 326, 30));

        IOSController.devicesScreenInfo.set("iPhone 6", new IOSDeviceScreenInfo("iPhone 6", 750, 1334, 2, 33));
        IOSController.devicesScreenInfo.set("iPhone 6s", new IOSDeviceScreenInfo("iPhone 6s", 750, 1334, 2, 33));
        IOSController.devicesScreenInfo.set("iPhone 7", new IOSDeviceScreenInfo("iPhone 7", 750, 1334, 2, 33));
        IOSController.devicesScreenInfo.set("iPhone 8", new IOSDeviceScreenInfo("iPhone 8", 750, 1334, 2, 33));

        IOSController.devicesScreenInfo.set("6 Plus", new IOSDeviceScreenInfo("iPhone 6 Plus", 1242, 2208, 3, 50));
        IOSController.devicesScreenInfo.set("6s Plus", new IOSDeviceScreenInfo("iPhone 6 Plus", 1242, 2208, 3, 50));
        IOSController.devicesScreenInfo.set("7 Plus", new IOSDeviceScreenInfo("iPhone 7 Plus", 1242, 2208, 3, 50));
        IOSController.devicesScreenInfo.set("8 Plus", new IOSDeviceScreenInfo("iPhone 8 Plus", 1242, 2208, 3, 50));

        IOSController.devicesScreenInfo.set("X", new IOSDeviceScreenInfo("iPhone X", 11242, 2208, 3, 87));

        // IOSController.devicesScreenInfo("Mini 2", new IOSDeviceScreenInfo("Mini 2", 11242, 2208, 401));
        // IOSController.devicesScreenInfo("Mini 3", new IOSDeviceScreenInfo("Mini 3", 11242, 2208, 401));
        // IOSController.devicesScreenInfo("Mini 4", new IOSDeviceScreenInfo("Mini 4", 11242, 2208, 401));

        // IOSController.devicesScreenInfo("iPad 3", new IOSDeviceScreenInfo("iPad 3", 1536, 2048, 264));
        // IOSController.devicesScreenInfo("iPad 4", new IOSDeviceScreenInfo("iPad 4", 1536, 2048, 264));

        // IOSController.devicesScreenInfo("iPad Air", new IOSDeviceScreenInfo("iPad Air", 1536, 2048, 264));
        // IOSController.devicesScreenInfo.set("iPad Air 2", new IOSDeviceScreenInfo("iPad Air 2", 1536, 2048, 264, 32));

        // IOSController.devicesScreenInfo("9.7-inch Pro", new IOSDeviceScreenInfo("iPad Pro", 1536, 2048, 264));
        // IOSController.devicesScreenInfo("12.9-inch iPad Pro", new IOSDeviceScreenInfo("12.9-inch iPad Pro", 1536, 2048, 264));
    }
}

export class IOSDevice extends Device {
    constructor(token: string, name: string, status: Status, type: DeviceType, apiLevel?: string, pid?: number) {
        super(name, apiLevel, type, Platform.IOS, token, status, pid);
    }
}

export class IOSDeviceScreenInfo {
    // In the context of iOS, the proper term for `density` is `screen scale`. Adhere to `density` for unified API.
    constructor(public deviceType, public width, public height, public density, public actionBarHeight) { }
}
