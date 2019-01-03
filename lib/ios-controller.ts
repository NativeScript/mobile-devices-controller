import { spawn, spawnSync, execSync } from "child_process";
import { resolve, dirname, basename, sep, extname } from "path";
import { tmpdir } from "os";
import { existsSync, unlinkSync, statSync } from "fs";
import { glob } from "glob";
import {
    executeCommand,
    tailFileUntil,
    wait,
    getRegexResultsAsArray,
    killAllProcessAndRelatedCommand,
    logError,
    isProcessAlive,
} from "./utils";
import { IDevice } from "./device";
import { Platform, DeviceType, Status } from "./enums";
import { IOSDeviceLib } from "ios-device-lib";
import { DeviceController } from "./device-controller";

export class IOSController {

    private static XCRUN = "xcrun ";
    private static SIMCTL = `${IOSController.XCRUN} simctl`;
    private static XCRUN_SIMCTL_LIST_COMMAND = `${IOSController.SIMCTL} list `;
    private static XCRUNLISTDEVICES_COMMAND = `${IOSController.SIMCTL} list devices `;
    private static GET_BOOTED_DEVICES_COMMAND = `${IOSController.SIMCTL} list devices `;
    private static OSASCRIPT_QUIT_SIMULATOR_COMMAND = "osascript -e 'tell application \"Simulator\" to quit'";
    private static IOS_DEVICE = "ios-device";
    private static devicesScreenInfo = new Map<string, IOSDeviceScreenInfo>();
    private static DEVICE_BOOT_TIME = 180000;
    private static WAIT_DEVICE_TO_RESPONSE = 180000;

    private static _dl: IOSDeviceLib.IOSDeviceLib;
    static getDl() {
        if (!IOSController._dl) {
            return new Promise<any>((resolve, reject) => {
                const connectionTimeout = setTimeout(() => {
                    resolve(false);
                }, 30000);
                IOSController._dl = new IOSDeviceLib(d => {
                    console.log("Device found!", d);
                    clearTimeout(connectionTimeout);
                    resolve(IOSController._dl);
                }, device => {
                    console.log("Device LOST!");
                    resolve(false);
                });
            });
        }
        return Promise.resolve(IOSController._dl);
    }

    static disposeDL() {
        if (IOSController._dl) {
            IOSController._dl.dispose("SIGTERM");
            IOSController._dl = undefined;
        }
    }

    public static runningProcesses = new Array();

    public static getAllDevices(verbose: boolean = false): Promise<Map<string, Array<IDevice>>> {
        if (IOSController.devicesScreenInfo.size === 0) {
            IOSController.loadIOSDevicesScreenInfo();
        }
        const devices = IOSController.parseSimulators();
        IOSController.parseRealDevices(devices);
        if (verbose) {
            console.log("All devices: ", devices);
        }

        return Promise.resolve(devices);
    }

    static getSimulatorPidByToken(token: string) {
        const simulatorPidAsString = executeCommand(`ps ax | grep ${token} | grep -v grep`);
        const result = getRegexResultsAsArray(/^\d+/gi, simulatorPidAsString);
        let pid = undefined;
        if (result.length > 0) {
            try {
                pid = parseInt(result[0].trim());
            }
            catch (error) {
                console.error("Couldn't parse simulator pid", error);
            }
        }
        return pid;
    }

    public static deleteDevice(token: string) {
        const result = spawnSync(`xcrun simctl delete ${token}`, {
            shell: true
        });
        if (result.status !== 0) {
            logError("", result.output.toString());
        }
    }

    public static fullResetOfSimulator(simulator: IDevice) {
        if ((!simulator.name || !simulator.initType) && !simulator.apiLevel) {
            console.log("To recreate simulator it is need to be specified simulator name or type and apiLevel!");
            return simulator;
        }

        simulator.name = simulator.name || simulator.initType;

        const iOSDevicesInfo = spawnSync(IOSController.SIMCTL, ["list", "-j"], {
            shell: true,
            encoding: "UTF8"
        });
        const iOSDevicesInfoAsObj = JSON.parse(iOSDevicesInfo.stdout.toString());

        let desiredType = simulator.initType || simulator.name.split(" ").slice(0, 2).join("-");
        const type = iOSDevicesInfoAsObj.devicetypes.filter(dt =>
            dt.identifier.toLowerCase().includes(desiredType.toLowerCase())
            || dt.name.toLowerCase().includes(desiredType.toLowerCase()))[0];
        if (!type) {
            logError("Please provide correct simulator type!");
        }
        const runTime = iOSDevicesInfoAsObj.runtimes.filter(drt => new RegExp(drt.version).test(simulator.apiLevel))[0];
        if (!runTime) {
            logError("No such runtime available!")
        }

        const oldToken = simulator.token;
        const command = `xcrun simctl create "${simulator.name}" "${type.name}" "${runTime.identifier}"`
        console.log(command);
        const result = executeCommand(command);
        if (result && result.trim()) {
            simulator.token = result.trim();
            if (oldToken) {
                IOSController.deleteDevice(oldToken);
                console.log(`Remove: `, oldToken);
            }
        } else {
            logError("Failed to create simulator!", result);
        }

        return simulator;
    }

    public static async startSimulator(simulator: IDevice, directory: string = tmpdir(), shouldFullResetSimulator: boolean = true, retries: number = 3): Promise<IDevice> {
        simulator.type = DeviceType.SIMULATOR;
        simulator.platform = Platform.IOS;
        if (!simulator.token) {
            simulator = (await DeviceController.getDevices(simulator))[0];
        }

        let udid = simulator.token;

        // && simulator.name
        // && !simulator.name.toLowerCase().includes("iphone 7")
        // && !simulator.name.toLowerCase().includes("iphone 8")
        if (isProcessAlive("Simulator.app") && shouldFullResetSimulator) {
            try {
                const newSim = IOSController.fullResetOfSimulator(simulator);
                if (newSim.token) {
                    simulator = newSim;
                    udid = simulator.token;
                }
            } catch (error) { }
        } else if (shouldFullResetSimulator) {
            const eraseSimResult = executeCommand(`${IOSController.SIMCTL} erase ${udid}`);
        }

        let startedProcess = IOSController.startSimulatorProcess(udid, directory);
        if (startedProcess.stderr
            && (startedProcess.stderr.toString().toLowerCase().includes("unable to boot deleted device")
                || startedProcess.stderr.toString().toLowerCase().includes("Failed to load"))
            || startedProcess.status !== 0) {
            simulator = IOSController.fullResetOfSimulator(simulator);
            udid = simulator.token;
            logError(`Probably the simulator ${simulator.name}\ ${simulator.token} failed to start!`);
            logError(startedProcess.stderr.toString());
            retries--;
            startedProcess = IOSController.startSimulatorProcess(udid, directory, retries);
        }
        // let response: boolean = await waitForOutput(process, /Instruments Trace Complete:/ig, /Failed to load/ig, IOSController.DEVICE_BOOT_TIME);

        if (startedProcess.stdout.toString().includes("Instruments Trace Complete")) {
            const response = IOSController.checkIfSimulatorIsBooted(udid, IOSController.WAIT_DEVICE_TO_RESPONSE);
            if (response) {
                simulator.type = DeviceType.SIMULATOR;
                simulator.status = Status.BOOTED;
                simulator.pid = startedProcess.pid;
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

    public static async kill(udid: string) {
        if (!udid) {
            logError("Please provide device token!");
        }
        console.log(`Killing simulator with udid ${udid}`);
        executeCommand(`${IOSController.SIMCTL} shutdown ${udid}`);
        // Kill all the processes related with sim.id (for example WDA agents).
        await killAllProcessAndRelatedCommand(udid);
    }

    public static getInstalledApps(device: IDevice) {
        const apps = new Array();
        if (device.type === DeviceType.DEVICE) {
            const rowData = executeCommand(`ideviceinstaller -u ${device.token} -l`).replace("package:", "").split("\n");
            rowData.forEach(data => {
                const appBundle = /(\w+\.)+\w+/ig.exec(data);
                if (appBundle && appBundle.length > 0 && appBundle[0].includes(".")) {
                    apps.push(appBundle[0]);
                }
            })
        } else {
            const simLocation = `${IOSController.getSimLocation(device.token)}`
            const installedApps = glob.sync(`${simLocation}/**/*.app`);
            const rowData = installedApps
                .filter(f => {
                    return f.endsWith(".app") && statSync(f).isDirectory();
                })
            rowData.forEach(data => {
                const rowBundle = executeCommand(`defaults read ${data}/Info.plist | grep CFBundleIdentifier`);
                const appId = rowBundle.split("\"")[1];
                apps.push(appId);
            });
        }

        return apps;
    }

    public static async installApp(device: IDevice, fullAppName) {
        if (device.type === DeviceType.DEVICE) {
            const installProcess = await (await IOSController.getDl()).install(fullAppName, [device.token])[0];
            await IOSController.disposeDL();
            if (!installProcess.response.includes("Successfully installed application")) {
                console.error(installProcess.response);
            }
        } else {
            const result = executeCommand(`${IOSController.SIMCTL} install ${device.token} ${fullAppName}`);
        }
    }

    /**
    * @param device - of type {token: string, type: DeviceType}
    * @param bundleId - should be provided when DeviceType.DEVICE else undefined
    * @param appName - should be provided when DeviceType.SIMULATOR else undefined
    **/
    public static async stopApplication(device: IDevice, bundleId: string, appName: string): Promise<boolean> {
        const apps = IOSController.getInstalledApps(device);
        if (apps.some(app => app.includes(bundleId))) {
            if (!device.type) {
                device.platform = Platform.IOS;
                const d = (await DeviceController.getDevices(device))[0];
                device.type = d && d.type;
            }
            if (device.type && device.type === DeviceType.SIMULATOR) {
                executeCommand(`${IOSController.SIMCTL} ${device.token} terminate ${bundleId}`);
                await killAllProcessAndRelatedCommand([device.token, appName]);
            } else {
                const appInfo = { ddi: undefined, appId: bundleId, deviceId: device.token }
                const dl = await IOSController.getDl();
                if (dl) {
                    return new Promise<boolean>((res, reject) => {
                        Promise.all(dl.stop([appInfo]))
                            .then(async response => {
                                console.log("App " + bundleId + " stopped !", response);
                                await IOSController.disposeDL();
                                res(true);
                            }).catch(async err => {
                                console.log("An error occurred! Probably app is still running!", err);
                                await IOSController.disposeDL();
                                res(false);
                            });
                    });
                }
            }
        }
    }

    public static async uninstallApp(device: IDevice, fullAppName: string, bundleId: string = undefined) {
        bundleId = bundleId || IOSController.getIOSPackageId(device.type, fullAppName);
        let result = "";
        try {
            await IOSController.stopApplication(device, bundleId, basename(fullAppName));
            wait(500);
        } catch (error) {
            console.dir(error);
        }

        if (device.type === DeviceType.DEVICE) {
            result = executeCommand(`ideviceinstaller -u ${device.token} -U ${bundleId}`);
        } else {
            result = executeCommand(`${IOSController.SIMCTL} uninstall ${device.token} ${bundleId}`);
        }
    }

    public static async reinstallApplication(device: IDevice, fullAppName, bundleId: string = undefined) {
        bundleId = bundleId || IOSController.getIOSPackageId(device.type, fullAppName);
        await IOSController.uninstallApp(device, fullAppName, bundleId);
        await IOSController.installApp(device, fullAppName);
    }

    public static async refreshApplication(device: IDevice, fullAppName, bundleId: string = undefined) {
        bundleId = bundleId || IOSController.getIOSPackageId(device.type, fullAppName);
        await IOSController.reinstallApplication(device, fullAppName, bundleId);
        await IOSController.startApplication(device, fullAppName, bundleId);
    }

    public static async startApplication(device: IDevice, fullAppName, bundleId: string = undefined): Promise<{ output: string, result: boolean }> {
        bundleId = bundleId || IOSController.getIOSPackageId(device.type, fullAppName);
        let output = "";
        let result = false;
        if (device.type === DeviceType.DEVICE) {
            let startProcess;
            try {
                output = await (await IOSController.getDl()).start([{ "ddi": undefined, "appId": bundleId, "deviceId": device.token }])[0];
                if (!startProcess.response.includes("Successfully started application")) {
                    throw new Error(`Failed to start application ${bundleId}`);
                } else {
                    result = true;
                }
            } catch (error) {
                await IOSController.disposeDL();
            }

            await IOSController.disposeDL();

        } else {
            output = executeCommand(`${IOSController.SIMCTL} launch ${device.token} ${bundleId}`, process.cwd(), 60000);
            result = output.includes(bundleId);
        }

        return Promise.resolve({ output: output, result: result });
    }

    private static startSimulatorProcess(udid, cwd: string = tmpdir(), timeout: number = IOSController.DEVICE_BOOT_TIME) {
        // xcrun instruments -v -t 'Blank' -l 100 -w
        // xcrun instruments -w ${udid} -t Blank `;
        const simProcess = spawnSync(IOSController.XCRUN, ['instruments', '-w', udid, '-t', 'Blank'], {
            shell: true,
            cwd: cwd,
            timeout: timeout
        });

        return simProcess;
    }

    private static isRunning(token) {
        const out = executeCommand(`${IOSController.SIMCTL} spawn ${token} launchctl print system | grep com.apple.springboard.services `);
        return out.includes("M   A   com.apple.springboard.services");
    }

    public static parseSimulators(stdout = undefined): Map<string, Array<IDevice>> {
        const devicesObj = JSON.parse(executeCommand(`${IOSController.XCRUNLISTDEVICES_COMMAND} --json`).toString());
        const deviceObjDevice = devicesObj["devices"];
        const devices: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>();
        Object.getOwnPropertyNames(devicesObj["devices"])
            .forEach(level => {
                deviceObjDevice[level].forEach(deviceObj => {
                    const status: Status = <Status>deviceObj.state.toLowerCase();
                    const apiLevel = /\d+(\.\d{1,2})?/.exec(level)[0];
                    const device = <IDevice>{
                        token: deviceObj.udid,
                        name: deviceObj.name,
                        status: status,
                        type: DeviceType.SIMULATOR,
                        apiLevel: apiLevel,
                        platform: Platform.IOS
                    };

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
                });
            });

        return devices;
    }

    public static parseRealDevices(devices = new Map<string, IDevice[]>()) {
        const devicesUDID = executeCommand("idevice_id  --list").split('\n');
        devicesUDID.forEach(udid => {
            if (udid && udid !== "") {
                const deviceInfo = executeCommand(`ideviceinfo -s -u ${udid}`).split('\n');
                const device = <IDevice>{
                    type: DeviceType.DEVICE,
                    platform: Platform.IOS,
                    token: udid,
                    status: Status.BOOTED,
                }
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
        const simRootHome = resolve(process.env["HOME"], "Library/Developer/CoreSimulator/Devices/", token, "data/Containers/Bundle/Application");
        const simRoot = resolve("/Library/Developer/CoreSimulator/Devices/", token, "data/Containers/Bundle/Application");
        return existsSync(simRootHome) ? simRootHome : simRoot;
    }

    public static filterDeviceBy(...args) {
        const mappedDevices = IOSController.parseSimulators();
        const result = new Array<IDevice>();
        mappedDevices.forEach(devices => {
            devices.forEach(device => {
                let shouldAdd = true;
                const deviceToString = JSON.stringify(<IDevice>device).toLocaleLowerCase();
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
        let pathToVideo = resolve(dir, `${fileName}.mp4`).replace(" ", "\ ");
        if (existsSync(pathToVideo)) {
            unlinkSync(pathToVideo);
        }
        let videoRecoringProcess;
        if (device.type === DeviceType.DEVICE) {
            const p = resolve(__dirname, "../", "bin", "xrecord");
            console.log(`${p} --quicktime --id=${device.token} --out=${pathToVideo} --force`);

            const startRecording = () => {
                return spawn(`${p}`, [`--quicktime`, `--id=\"${device.token}\"`, `--out=\"${pathToVideo}\"`, `--force`], {
                    stdio: 'inherit',
                    shell: true
                });
            }

            videoRecoringProcess = startRecording();
            wait(3000);

            const checkHasStartedRecording = (timeout, pathToVideo) => {
                const startTime = Date.now();
                while (Date.now() - startTime <= timeout && !existsSync(pathToVideo)) {
                }

                return existsSync(pathToVideo);
            }

            let retryCount = 10;
            let awaitOnRecordingStart = false;
            while (!checkHasStartedRecording(5000, pathToVideo) && retryCount >= 0) {
                try {
                    execSync("killall 'QuickTime Player'");
                } catch (error) { }
                try {
                    videoRecoringProcess.kill("SIGTERM");
                } catch (error) { }

                retryCount--;
                wait(2000);

                const quicktimeAppleScriptPath = resolve(__dirname, "../bin/startQuickTimePlayer.scpt")
                spawnSync('osascript', [quicktimeAppleScriptPath, '10'], {
                    shell: true,
                    stdio: 'inherit'
                });

                videoRecoringProcess = startRecording();
                awaitOnRecordingStart = true;
            }

            if (awaitOnRecordingStart) wait(3000);

            if (!existsSync(pathToVideo)) {
                console.error(`Couldn't start recording process!`);
                console.error(`Recording couldn't be started! Check device connection and quick time player`);
                videoRecoringProcess = null;
                pathToVideo = null;
            }
        } else {
            console.log(`${IOSController.XCRUN} simctl io ${device.token} recordVideo ${pathToVideo}`);
            videoRecoringProcess = spawn(`xcrun`, ['simctl ', 'io', device.token, 'recordVideo', `'${pathToVideo}'`], {
                cwd: process.cwd(),
                shell: true,
                stdio: 'inherit'
            });
        }
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
        const plistPath = IOSController.getPlistPath(fullAppName);

        if (existsSync(plistPath)) {
            const command = "/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' " + plistPath;
            result = executeCommand(command);
        } else {
            console.error("File " + plistPath + " does not exist.");
        }

        return result.trim();
    }

    public static getDevicesScreenInfo() {
        if (IOSController.devicesScreenInfo.size == 0) {
            IOSController.loadIOSDevicesScreenInfo();
        }

        return IOSController.devicesScreenInfo;
    }

    /**
     * Get path of Info.plist of iOS app under test.
     * Info.plist holds information for app under test.
     *
     * @return path to Info.plist
     */
    private static getPlistPath(fullAppName) {
        let plistPath = null;
        const ext = extname(fullAppName);
        if (ext.includes('ipa')) {
            const appFullName = dirname(fullAppName) + sep + basename(fullAppName).replace(".ipa", "");
            const command = `unzip -o ${fullAppName} -d ${appFullName}`;
            console.log(command);
            executeCommand(command);
            const appName = executeCommand(`ls ${resolve(appFullName, "Payload")}`).split('\n').filter(f => f.includes(".app"))[0];
            plistPath = resolve(appFullName, "Payload", appName, "Info.plist");
        } else {
            plistPath = resolve(fullAppName, "Info.plist");
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
            let result = tailFileUntil(simLog, "com.apple.intents.intents-image-service", 0);
            while (!result.result) {
                result = tailFileUntil(simLog, bootedIndicator, result.index);
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

        IOSController.devicesScreenInfo.set("iPhone 6", {
            deviceType: "iPhone 6",
            width: 750,
            height: 1334,
            density: 2,
            actionBarHeight: 33
        });

        IOSController.devicesScreenInfo.set("iPhone 6s", {
            deviceType: "iPhone 6s",
            width: 750,
            height: 1334,
            density: 2,
            actionBarHeight: 33
        });

        IOSController.devicesScreenInfo.set("iPhone 7", {
            deviceType: "iPhone 7",
            width: 750,
            height: 1334,
            density: 2,
            actionBarHeight: 33
        });

        IOSController.devicesScreenInfo.set("iPhone 8", {
            deviceType: "iPhone 8",
            width: 750,
            height: 1334,
            density: 2,
            actionBarHeight: 33
        });

        IOSController.devicesScreenInfo.set("iPhone 6 Plus", {
            deviceType: "iPhone 6 Plus",
            width: 1242,
            height: 2208,
            density: 3,
            actionBarHeight: 50
        });

        IOSController.devicesScreenInfo.set("6 Plus", {
            deviceType: "iPhone 6 Plus",
            width: 1242,
            height: 2208,
            density: 3,
            actionBarHeight: 50
        });

        IOSController.devicesScreenInfo.set("7 Plus", {
            deviceType: "iPhone 7 Plus",
            width: 1242,
            height: 2208,
            density: 3,
            actionBarHeight: 50
        });

        IOSController.devicesScreenInfo.set("8 Plus", {
            deviceType: "iPhone 8 Plus",
            width: 1242,
            height: 2208,
            density: 3,
            actionBarHeight: 50
        });

        IOSController.devicesScreenInfo.set("X", {
            deviceType: "iPhone X",
            width: 1242,
            height: 2208,
            density: 3,
            actionBarHeight: 87
        });

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


export interface IOSDeviceScreenInfo {
    // In the context of iOS, the proper term for `density` is `screen scale`. Adhere to `density` for unified API.
    deviceType,
    width,
    height,
    density,
    actionBarHeight
}
