import { spawn } from "child_process";
import { resolve, sep, dirname, join } from "path";
import { existsSync, unlinkSync } from "fs";
import { Platform, DeviceType, Status, AndroidKeyEvent } from "./enums";
import { IDevice, Device } from "./device";
import * as net from "net";
import {
    executeCommand,
    isWin,
    killProcessByName,
    killPid,
    searchFiles,
    getAllFileNames,
    wait,
    logInfo,
    logError,
    logWarn,
    killAllProcessAndRelatedCommand,
    copyIDeviceQuery
} from "./utils";
import { DeviceController } from "./device-controller";

const OFFSET_DI_PIXELS = 16;

export class AndroidController {
    private static DEFAULT_BOOT_TIME = 150000;
    private static ANDROID_HOME = process.env["ANDROID_HOME"] || "";
    private static EMULATOR = resolve(AndroidController.ANDROID_HOME, "emulator", "emulator");
    private static ADB = resolve(AndroidController.ANDROID_HOME, "platform-tools", "adb");
    private static LIST_DEVICES_COMMAND = AndroidController.ADB + " devices -l";
    private static AVD_MANAGER = resolve(AndroidController.ANDROID_HOME, "tools", "bin", "avdmanager");
    private static LIST_AVDS = AndroidController.AVD_MANAGER + " list avd";
    private static _emulatorIds: Map<string, string> = new Map();
    private static lockFilesPredicate = f => { return f.endsWith(".lock") || f.startsWith("snapshot.lock.") };

    public static runningProcesses = new Array();

    public static async getAllDevices(verbose: boolean = false): Promise<Map<string, Array<IDevice>>> {
        AndroidController.checkAndroid();
        // this should be always first.
        const runningDevices = AndroidController.parseRunningDevicesList(verbose);
        const devices: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>();
        await AndroidController.parseEmulators(runningDevices, devices);
        await AndroidController.parseRealDevices(runningDevices, devices);

        return devices;
    }

    public static getPhysicalDensity(device: IDevice) {
        return parseInt(AndroidController.executeAdbShellCommand(device, "wm density", 2000).split(":")[1]) * 0.01;
    }

    public static calculateScreenOffset(density: number) {
        return Math.floor(OFFSET_DI_PIXELS * density);
    }
    public static getPixelsOffset(device: IDevice) {
        return AndroidController.calculateScreenOffset(AndroidController.getPhysicalDensity(device));
    }

    public static setEmulatorConfig(device: IDevice) {
        const density = AndroidController.getPhysicalDensity(device);
        const offsetPixels = AndroidController.getPixelsOffset(device);
        device.config = {
            density: density,
            offsetPixels: offsetPixels,
        };
    }

    public static cleanLockFile(emulator: IDevice) {
        const avdsDirectory = process.env["AVDS_STORAGE"] || join(process.env["HOME"], "/.android/avd");
        const avd = resolve(avdsDirectory, `${emulator.name}.avd`);

        getAllFileNames(avd)
            .filter(f => AndroidController.lockFilesPredicate(f))
            .forEach(f => {
                try {
                    const path = resolve(avd, f);
                    if (existsSync(path)) {
                        unlinkSync(path);
                    }
                } catch (error) {
                    logWarn(`Failed to delete lock file for ${avd}!`);
                }
            });
    }

    public static async startEmulator(emulator: IDevice, options: Array<string> = undefined, logPath = undefined, retries = 3): Promise<IDevice> {
        if (!emulator.token) {
            emulator.token = emulator.apiLevel ? (AndroidController.emulatorId(emulator.apiLevel) || "5554") : "5554";
        }
        if (!emulator.name || !emulator.apiLevel) {
            emulator.type = DeviceType.EMULATOR;
            emulator.platform = Platform.ANDROID;

            let searchQuery: IDevice = {};
            Object.assign(searchQuery, emulator);
            delete searchQuery.info;
            delete searchQuery.startedAt;
            delete searchQuery.busySince;
            delete searchQuery.parentProcessPid;
            delete searchQuery.process;
            delete searchQuery.pid;
            delete searchQuery.config;
            delete searchQuery.token;
            const devices = (await DeviceController.getDevices(searchQuery));
            if (devices && devices.length > 0) {
                copyIDeviceQuery(devices[0], emulator);
            } else {
                logError("Requested device is missing", devices);
            }
        }
        if (!emulator.name) {
            logError("Please provide emulator name");
        }

        AndroidController.kill(emulator, false);

        const avdsDirectory = process.env["AVDS_STORAGE"] || join(process.env["HOME"], "/.android/avd");
        const avd = resolve(avdsDirectory, `${emulator.name}.avd`);
        getAllFileNames(avd)
            .filter(f => AndroidController.lockFilesPredicate(f))
            .forEach(f => {
                try {
                    const path = resolve(avd, f);
                    if (existsSync(path)) {
                        unlinkSync(path);
                    }
                } catch (error) {
                    logWarn(`Failed to delete lock file for ${avd}!`);
                    emulator.status = Status.SHUTDOWN;
                }
            });

        emulator.type = DeviceType.EMULATOR;
        emulator = await AndroidController.startEmulatorProcess(emulator, logPath, options);
        let result = await AndroidController.waitUntilEmulatorBoot(emulator, parseInt(process.env.BOOT_ANDROID_EMULATOR_MAX_TIME) || AndroidController.DEFAULT_BOOT_TIME) === true ? Status.BOOTED : Status.SHUTDOWN;

        if (result !== Status.BOOTED) {
            AndroidController.kill(emulator);
            logWarn("Trying to boot emulator again!");
            retries--;
            emulator = await AndroidController.startEmulator(emulator, options, logPath, retries);
        }

        if (result === Status.BOOTED) {
            emulator.status = Status.BOOTED;
            emulator.startedAt = Date.now();
            emulator.releaseVersion = AndroidController.executeAdbShellCommand(emulator, ` getprop ro.build.version.release`).trim();
            emulator.apiLevel = AndroidController.executeAdbShellCommand(emulator, ` getprop ro.build.version.sdk`).trim();
        }

        AndroidController.setEmulatorConfig(emulator);
        return emulator;
    }

    public static async reboot(emulator: IDevice) {
        try {
            if (AndroidController.checkIfEmulatorIsResponding(emulator)) {
                const errorMsgType = AndroidController.getCurrentErrorMessage(emulator);
                if (errorMsgType) {
                    AndroidController.executeAdbShellCommand(emulator, `am force-stop ${errorMsgType}`);
                    AndroidController.executeAdbShellCommand(emulator, `pm clear ${errorMsgType}`);
                }
            }
        } catch{ }

        let result;
        try {
            AndroidController.executeAdbCommand(emulator, 'reboot bootloader');
            result = AndroidController.waitUntilEmulatorBoot(emulator, AndroidController.DEFAULT_BOOT_TIME / 3);
        } catch{ }

        if (!result) {
            emulator = await AndroidController.kill(emulator);
            emulator = await AndroidController.startEmulator(emulator, ["-wipe-data", "-no-snapshot-load", "-no-boot-anim", "-no-audio"]);
        }

        return emulator;
    }

    public static unlock(token, password = undefined) {
        let result = "";
        if (password) {
            result = executeCommand(`${AndroidController.sendKeyCommand(token, 82)} && ${AndroidController.ADB} -s ${token} shell input text ${password} && ${AndroidController.sendKeyCommand(token, 66)}`);
        } else {
            result = executeCommand(`${AndroidController.sendKeyCommand(token, 82)} && ${AndroidController.sendKeyCommand(token, 66)}`);
        }
        if (!(result !== undefined && result !== "")) {
            logError("We couldn't unclock the devie: ", result);
        }
    }

    /**
     * Implement kill process
     * @param emulator 
     */
    public static kill(emulator: IDevice, verbose = true) {
        let isAlive: boolean = true;
        if (emulator.type !== DeviceType.DEVICE) {
            if (emulator.token) {
                try {
                    AndroidController.executeAdbCommand(emulator, " emu kill");
                } catch (error) { }
            }

            const killProcesses = (...args) => {
                args.forEach(arg => {
                    if (!isNaN(arg)) {
                        killPid(+arg);
                    }
                    if (!isWin()) {
                        killAllProcessAndRelatedCommand(arg);
                    }
                    wait(500);
                });
            }

            killProcesses(emulator.pid, emulator.name, `emulator-${emulator.token}`);

            try {
                killProcessByName("emulator64-crash-service");
            } catch (error) { }

            if (verbose) {
                logInfo(`Waiting for ${emulator.name || emulator.token} to stop!`);
            }

            const checkIfDeviceIsKilled = token => {
                wait(1000);
                return executeCommand(AndroidController.LIST_DEVICES_COMMAND).includes(token);
            }

            const startTime = Date.now();
            while (checkIfDeviceIsKilled(emulator.token) && (Date.now() - startTime) <= 10000) {
                if (verbose) {
                    logWarn(`Retrying kill all processes related to ${emulator.name}`);
                }
                wait(1000);
                killProcesses(emulator.pid, emulator.name, emulator.token);
                wait(3000);
            }

            if (checkIfDeviceIsKilled(emulator.token)) {
                logError(`Device: ${emulator.name} is NOT killed!`);
                isAlive = true;
            } else {
                if (verbose) {
                    logInfo(`Device: ${emulator.name || emulator.token} is successfully killed!`);
                }

                isAlive = false;
            }
        }

        if (!isAlive) {
            emulator.status = Status.SHUTDOWN;
            emulator.pid = undefined;
        } else {
            emulator.status = Status.BUSY;
        }

        return emulator;
    }

    public static killAll() {
        const script = resolve(__dirname, "scripts", "killallEmulators.sh");
        if (!isWin() && existsSync(script)) {
            executeCommand(`sh ${script}`);
        }
        AndroidController.stopAdb();
        killProcessByName("qemu-system-i386");
        killProcessByName("qemu-system-x86_64");
        AndroidController.startAdb();
    }

    public static async restartDevice(device: IDevice) {
        if (device.type === DeviceType.EMULATOR) {
            logInfo(`Ensure device: ${device.name} is not booted!`);
            AndroidController.kill(device);
            logInfo(`Restarting device ${device.name}`);
            AndroidController.startEmulator(device);
        } else {
            logError("Not implemented for real device!")
        }

        return device;
    }

    public static startAdb() {
        logInfo("Start adb");
        executeCommand(AndroidController.ADB + " start-server");
    }

    public static stopAdb() {
        logInfo("Stop adb");
        executeCommand(AndroidController.ADB + " kill-server");
    }

    public static killAdbProcess() {
        killProcessByName("adb.exe");
    }

    public static isAppRunning(device: IDevice, appId: string) {
        const result = AndroidController.executeAdbShellCommand(device, "ps");
        if (result.includes(appId)) {
            return true;
        } else {
            return false;
        }
    }

    public static getCurrentFocusedScreen(device: IDevice, commandTimeout: number = 1000) {
        return this.executeAdbCommand(device, " shell dumpsys window windows | grep -E 'mCurrentFocus'", commandTimeout);
    }

    public static checkApiLevelIsLessThan(device: IDevice, apiLevel: number) {
        let dApiLevel = device.apiLevel;
        if (!device.releaseVersion) {
            dApiLevel = /\d.\d/ig.exec(device.apiLevel)[0];
        }
        return +dApiLevel < apiLevel
    }

    public static checkIfEmulatorIsResponding(device: IDevice) {
        try {
            const androidSettings = "com.android.settings/com.android.settings.Settings";
            AndroidController.executeAdbShellCommand(device, ` am start -n ${androidSettings}`);

            let errorMsg = AndroidController.getCurrentFocusedScreen(device);
            const startTime = Date.now();
            while (Date.now() - startTime <= 5000
                && !errorMsg.toLowerCase()
                    .includes(androidSettings.toLowerCase())) {
                errorMsg = AndroidController.getCurrentFocusedScreen(device);
            }
            if (!errorMsg.toLowerCase()
                .includes(androidSettings.toLowerCase())) {
                logWarn("Emulator is not responding!", errorMsg);
                if (AndroidController.checkApiLevelIsLessThan(device, 5)) {
                    console.log(`Skip check if device is responding since api level is lower than 5.0`);
                    return true;
                }
                return false;
            }
        } catch (error) {
            logError('Command timeout received', error);
            AndroidController.executeAdbShellCommand(device, " am force-stop com.android.settings");
            return false
        }
        try {
            AndroidController.executeAdbShellCommand(device, " am force-stop com.android.settings");
        } catch (error) { }

        return true
    }

    private static getCurrentErrorMessage(device: IDevice) {
        const parts = AndroidController.getCurrentFocusedScreen(device).split(":")
        return parts.length > 1 ? parts[1].trim() : undefined
    }

    public static reinstallApplication(device, appFullName, packageId: string = undefined) {
        packageId = packageId || AndroidController.getPackageId(appFullName);
        AndroidController.uninstallApp(device, packageId);
        AndroidController.installApp(device, appFullName, packageId);
    }

    public static refreshApplication(device, appFullName, packageId: string = undefined) {
        packageId = packageId || AndroidController.getPackageId(appFullName);
        AndroidController.reinstallApplication(device, appFullName, packageId);
        AndroidController.startApplication(device, packageId);
    }

    public static startApplication(device: IDevice, packageId: string) {
        const commandToExecute = "monkey -p " + packageId + " 1";
        //const commandToExecute = ` am start -n ${ packageId }`;
        Promise.resolve(AndroidController.executeAdbShellCommand(device, commandToExecute));
    }

    public static getInstalledApps(device) {
        const list = AndroidController.executeAdbShellCommand(device, `pm list packages -3`).split("\n");
        return list;
    }

    public static isAppInstalled(device: IDevice, packageId) {
        let isAppInstalled = AndroidController.getInstalledApps(device).some(pack => pack.includes(packageId));
        return isAppInstalled
    }

    public static installApp(device: IDevice, testAppName, packageId: string = undefined) {
        packageId = packageId || AndroidController.getPackageId(testAppName);
        let isAppInstalled = AndroidController.isAppInstalled(device, packageId);
        if (isAppInstalled) {
            logInfo("Uninstall a previous version " + packageId + " app.");
            AndroidController.uninstallApp(device, packageId);
        }

        const output = AndroidController.executeAdbCommand(device, ` install -r ${testAppName}`);
        logInfo(output);

        isAppInstalled = AndroidController.isAppInstalled(device, packageId);
        if (!isAppInstalled) {
            const errorMsg = `Failed to install ${testAppName} !`;
            logError(errorMsg);
            throw new Error(errorMsg);
        }

        return packageId;
    }

    public static uninstallApp(device, appId) {
        const isAppInstalled = AndroidController.isAppInstalled(device, appId);
        if (isAppInstalled) {
            AndroidController.stopApplication(device, appId);
            const uninstallResult = AndroidController.executeAdbCommand(device, `uninstall ${appId}`);
            if (uninstallResult.includes("Success")) {
                logInfo(appId + " successfully uninstalled.");
            } else {
                logError("Failed to uninstall " + appId + ". Error: " + uninstallResult);
            }
        } else {
            logInfo(`Application: ${appId} is not installed!`);
        }

        if (AndroidController.getInstalledApps(device).some(app => app === appId)) {
            logError("We couldn't uninstall application!");
        }
    }

    public static stopApplication(device: IDevice, appId) {
        AndroidController.executeAdbShellCommand(device, `am force-stop ${appId}`);
    }

    public static executeKeyEvent(device: IDevice, keyEvent: AndroidKeyEvent | string | number) {
        if (typeof keyEvent === 'string') {
            keyEvent = AndroidKeyEvent[keyEvent];
        }
        AndroidController.executeAdbShellCommand(device, `input keyevent ${keyEvent}`);
    }

    public static async getScreenshot(device: IDevice, dir, fileName) {
        fileName = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
        const pathToScreenshotPng = `/sdcard/${fileName}`;
        AndroidController.executeAdbShellCommand(device, `screencap ${pathToScreenshotPng}`);
        const fullFileName = resolve(dir, fileName);
        AndroidController.pullFile(device, pathToScreenshotPng, fullFileName);
        return fullFileName;
    }

    public static async recordVideo(device: IDevice, dir, fileName, callback: () => Promise<any>) {
        const { pathToVideo, devicePath, videoRecoringProcess } = AndroidController.startRecordingVideo(device, dir, fileName);
        new Promise(async (res, reject) => {
            callback().then((result) => {
                videoRecoringProcess.kill("SIGINT");
                AndroidController.pullFile(device, devicePath, pathToVideo);
                console.log(result);
                res(pathToVideo);
            }).catch((error) => {
                reject(error);
            });
        });
    }

    public static startRecordingVideo(device: IDevice, dir, fileName) {
        const videoFileName = `${fileName}.mp4`;
        const pathToVideo = resolve(dir, videoFileName);
        const devicePath = `/sdcard/${videoFileName}`;
        const prefix = AndroidController.getTokenPrefix(device);
        const videoRecoringProcess = spawn(AndroidController.ADB, ['-s', `${prefix}${device.token}`, 'shell', 'screenrecord', `${devicePath}`]);
        if (videoRecoringProcess) {
            AndroidController.runningProcesses.push(videoRecoringProcess.pid);
        }

        return { pathToVideo: pathToVideo, devicePath: devicePath, videoRecoringProcess: videoRecoringProcess };
    }

    public static stopRecordingVideo(device, videoRecoringProcess, devicePath, pathToVideo) {
        videoRecoringProcess.kill("SIGINT");
        wait(1000);
        AndroidController.pullFile(device, devicePath, pathToVideo);
    }

    public static getPackageId(appFullName) {
        return AndroidController.runAaptCommand(appFullName, "package");
    }

    public static getLaunchableActivity(appFullName) {
        return AndroidController.runAaptCommand(appFullName, "launchable-activity");
    }

    public static pullFile(device: IDevice, remotePath, destinationFile) {
        const destinationFolder = dirname(destinationFile);
        // Verify remotePath
        const remoteBasePath = remotePath.substring(0, remotePath.lastIndexOf("/"));
        const sdcardFiles = AndroidController.executeAdbShellCommand(device, "ls -la " + remoteBasePath);
        if (sdcardFiles.includes("No such file or directory")) {
            const error = remoteBasePath + " does not exist.";
            logError(error);
            return undefined;
        }

        if (!existsSync(destinationFolder)) {
            logError(`The folder ${destinationFolder} doesn't exist!`);
            return undefined;
        }

        // Pull files
        const output = AndroidController.executeAdbCommand(device, "pull " + remotePath + " " + destinationFile);
        console.log(output);
        const o = output.toLowerCase();
        if ((o.includes("error")) || (o.includes("failed")) || (o.includes("does not exist"))) {
            const error = "Failed to transfer " + remotePath + " to " + destinationFolder;
            logError(error);
            logError("Error: " + output);
            return undefined;
        } else {
            logInfo(remotePath + " transferred to " + destinationFile);
        }

        return destinationFile;
    }

    public static pushFile(device: IDevice, fileName, deviceParh) {

        let output = AndroidController.executeAdbShellCommand(device, "mount -o rw,remount -t rootfs /");

        // Verify remotePath
        const remoteBasePath = deviceParh.substring(0, deviceParh.lastIndexOf("/"));
        const sdcardFiles = AndroidController.executeAdbShellCommand(device, "ls -la " + remoteBasePath);
        if (sdcardFiles.includes("No such file or directory")) {
            const error = remoteBasePath + " does not exist.";
            logError(error);
            return undefined;
        }

        // Verify localPath
        fileName = fileName.replace("/", sep).replace("\\", sep);
        if (!existsSync(fileName)) {
            const error = fileName + " does not exist.";
            console.log(error);
            return undefined;
        }

        // Push files
        output = AndroidController.executeAdbCommand(device, "push " + fileName + " " + deviceParh);
        logInfo(output);
        if ((output.toLowerCase().includes("error")) || (output.toLowerCase().includes("failed"))) {
            logError("Failed to transfer " + fileName + " to " + deviceParh);
            logError("Error: ", output);
            return undefined;
        } else {
            console.log(fileName + " transferred to " + deviceParh);
        }

        return fileName;
    }

    private static getAaptPath() {
        let aaptPath = "";
        let aaptExecutableName = "aapt";
        if (isWin()) {
            aaptExecutableName += ".exe";
        }

        const androidHome = resolve(AndroidController.ANDROID_HOME, "build-tools");
        const searchedFiles = searchFiles(androidHome, aaptExecutableName);
        aaptPath = searchedFiles[searchedFiles.length - 1];

        return aaptPath;
    }

    private static runAaptCommand(appFullName, grep) {
        let command = AndroidController.getAaptPath() + " dump badging " + appFullName;

        let result = "";
        try {
            const commandResult = executeCommand(command);
            result = (new RegExp(`${grep}` + ":\\s+name='\(\w+\|\.+\)'", `i`)).exec(commandResult)[1];
            result = /(\w+.)+\w/ig.exec((new RegExp(`${grep}` + ":\\s+name='\(\w+\|\.+\)'", `i`)).exec(commandResult)[1])[0];
            result = (new RegExp(`${grep}` + ":\\s+name='\(\(\w+.\)+\)'", `ig`)).exec(commandResult)[1];
        } catch (error) {

        }

        return result;
    }

    private static async startEmulatorProcess(emulator: IDevice, logPath: string, options: Array<string>) {
        options = options || ["-no-audio", "-no-snapshot-save", "-no-boot-anim"];
        if (logPath) {
            options.push(` > ${logPath} 2 >& 1`);
        }

        logInfo(`Starting emulator with options: -avd ${emulator.name} -port ${emulator.token}`, options);
        const process = spawn(AndroidController.EMULATOR,
            [" -avd ", emulator.name, " -port ", emulator.token, ...options], {
                shell: true,
                detached: false,
                stdio: 'ignore'
            });

        emulator.pid = process.pid;
        emulator.process = process;

        return emulator;
    }

    private static waitUntilEmulatorBoot(device: IDevice, timeOutInMilliseconds: number): boolean {
        const startTime = Date.now();
        let found = false;

        logInfo("Booting emulator ...");
        //emulator: ERROR: There's another emulator instance running with the current AVD 'Emulator-Api23-Default'. Exiting...

        while ((Date.now() - startTime) <= timeOutInMilliseconds && !found) {
            found = AndroidController.checkIfEmulatorIsRunning(DeviceType.EMULATOR + "-" + device.token);
        }

        found = AndroidController.checkIfEmulatorIsResponding(device);
        if (!found) {
            logError(`${device.token} failed to boot in ${timeOutInMilliseconds} milliseconds`, true);
        } else {
            logInfo("Emulator is booted!");
        }

        return found;
    }

    private static checkIfEmulatorIsRunning(token) {
        let isBooted = executeCommand(`${AndroidController.ADB} -s ${token} shell getprop sys.boot_completed`).trim() === "1";
        if (isBooted) {
            isBooted = executeCommand(`${AndroidController.ADB} -s ${token} shell getprop init.svc.bootanim`).toLowerCase().trim() === "stopped";
        }

        return isBooted;
    }

    public static async refreshDeviceStatus(token: string, verbose = false) {
        const emulators = AndroidController.parseRunningDevicesList(verbose);
        const emulator = emulators.filter(e => e.token === token)[0];
        return emulator != null ? emulator.status : Status.SHUTDOWN;
    }

    private static async parseEmulators(runningDevices: Array<AndroidDevice>, emulators: Map<string, Array<IDevice>> = new Map<string, Array<Device>>(), verbose = false) {
        let availableDevices = false;
        const info = executeCommand(AndroidController.LIST_AVDS);
        const infoLines = info.split("\n");
        let emulator = null;
        let status: Status = Status.SHUTDOWN;
        // Name: Emulator-Api25-Google
        // Path: /Users/progressuser/.android/avd/Emulator-Api25-Google.avd
        // Target: Google APIs (Google Inc.)
        //         Based on: Android 7.1.1 (Nougat) Tag/ABI: google_apis/x86
        //   Skin: 480x800
        // Sdcard: 12M
        infoLines.forEach(line => {
            if (line.toLowerCase().includes("available android")) {
                status = Status.SHUTDOWN;
            }
            if (line.toLowerCase().includes("following android virtual devices could not be loaded")) {
                status = Status.INVALID;
            }

            if (line.toLowerCase().includes("name")) {
                const name = line.split("Name: ")[1].trim();
                emulator = new AndroidDevice(name, undefined, DeviceType.EMULATOR, undefined, undefined, Status.SHUTDOWN);
            }
            if (line.includes("Tag/ABI:")) {
                //const apiLevel = /\d+((.|,)\d+)?/gi.exec(line.split("Tag/ABI:")[0].trim());
                const apiLevel = line.substring(line.lastIndexOf("on:") + 3, line.lastIndexOf("Tag/ABI:")).replace(/android|api/ig, "").replace(/\(\w.+\)/, "").trim();
                emulator.apiLevel = apiLevel;
            }

            if (emulator && emulator.name && emulator.apiLevel) {
                if (!emulators.has(emulator.name)) {
                    emulators.set(emulator.name, new Array<IDevice>());
                    emulators.get(emulator.name).push(emulator);
                }
            }
        });

        const busyTokens = new Array();
        for (let index = 0; index < runningDevices.length; index++) {
            const emu = runningDevices[index];
            if (emu.type === DeviceType.EMULATOR) {
                try {
                    const avdInfo = await AndroidController.sendTelnetCommand(emu.token, "avd name");

                    emulators.forEach((v, k, m) => {
                        if (avdInfo && avdInfo.includes(k)) {
                            v[0].status = Status.BOOTED;
                            v[0].token = emu.token;
                            v[0].releaseVersion = emu.releaseVersion;
                            v[0].apiLevel = emu.apiLevel;
                            busyTokens.push(emu.token);
                            AndroidController.setEmulatorConfig(v[0]);
                        }
                    })
                } catch (error) {
                    logError(error);
                }
            }
        }

        if (busyTokens.length === 0) {
            busyTokens.push(5544);
        }
        emulators.forEach((devices, key, map) => {
            devices.forEach(device => {
                if (!device.token) {
                    const token = AndroidController.getTokenForEmulator(busyTokens);
                    device.token = token.toString();
                    busyTokens.push(token);
                }
            });
        });

        if (verbose) {
            logInfo("Avds list info: ", info);
            logInfo("Parsed emulators: ", emulators);
        }

        return emulators;
    }

    public static getTokenForEmulator(busyTokens: Array<number>) {
        const lastToken = Math.max(...busyTokens)
        const token = lastToken % 2 === 0 ? lastToken + 2 : lastToken + 1;
        return token;
    }
    /**
 * Send an arbitrary Telnet command to the device under test.
 *
 * @param {string} command - The command to be sent.
 *
 * @return {string} The actual output of the given command.
 */
    public static async sendTelnetCommand(port, command, shouldFailOnError: boolean = true): Promise<string> {
        //console.debug(`Sending telnet command device: ${command} to localhost:${port}`);
        return await new Promise<string>((resolve, reject) => {
            let conn = net.createConnection(port, 'localhost'),
                connected = false,
                readyRegex = /^OK$/m,
                dataStream = "",
                res = null;
            conn.on('connect', () => {
                //console.debug("Socket connection to device created");
            });

            conn.setTimeout(60000, () => {

            });

            conn.on('data', (data) => {
                let receivedData = data.toString('utf8');
                if (!connected) {
                    if (readyRegex.test(receivedData)) {
                        connected = true;
                        //console.debug("Socket connection to device ready");
                        conn.write(`${command}\n`);
                    }
                } else {
                    dataStream += data;
                    if (readyRegex.test(receivedData)) {
                        res = dataStream.replace(readyRegex, "").trim();
                        const resArray = res.trim().split('\n');
                        res = resArray[resArray.length - 1];
                        //console.debug(`Telnet command got response: ${res}`);
                        conn.write("quit\n");
                    }
                }
            });
            conn.on('error', (err) => { // eslint-disable-line promise/prefer-await-to-callbacks
                logError(`Telnet command error: ${err.message}`);
                // if (shouldFailOnError) {
                //     AndroidController.kill(<any>{ token: port, type: DeviceType.EMULATOR });
                //     reject(err);
                // } else {
                resolve();
                //}
            });
            conn.on('close', () => {
                if (res === null) {
                    reject(new Error("Never got a response from command"));
                } else {
                    resolve(res);
                }
            });
        });
    };

    public static parseRunningDevicesList(verbose) {
        // examples
        // List of devices attached
        // ce0217125d20e41304     unauthorized usb:337641472X
        // emulator-5566          device product:sdk_phone_x86 model:Android_SDK_built_for_x86 device:generic_x86

        // ce0217125d20e41304     device usb:337641472X product:dreamltexx model:SM_G950F device:dreamlte
        // emulator-5566          device product:sdk_phone_x86 model:Android_SDK_built_for_x86 device:generic_x86

        const runningDevices = executeCommand(AndroidController.LIST_DEVICES_COMMAND)
            .replace("List of devices attached", "")
            .trim()
            .split("\n");
        const devices: Array<AndroidDevice> = new Array();

        runningDevices.forEach(line => {
            const parseEmulatorToken = line => {
                return line.split("   ")[0].replace(/\D+/ig, '');
            }
            if (line.trim().includes("device")) {
                let token = line.split("   ")[0].trim();
                const releaseVersion = executeCommand(`${AndroidController.ADB} -s ${token} shell getprop ro.build.version.release`).trim();
                const apiLevel = executeCommand(`${AndroidController.ADB} -s ${token} shell getprop ro.build.version.sdk`).trim();
                if (line.startsWith(DeviceType.EMULATOR.toString().toLowerCase())) {
                    token = parseEmulatorToken(line);
                    devices.push(new AndroidDevice(undefined, apiLevel, DeviceType.EMULATOR, releaseVersion, token, Status.BOOTED));
                }

                if (line.includes(Status.OFFLINE.toString().toLowerCase())) {
                    token = parseEmulatorToken(line);
                    devices.push(new AndroidDevice(undefined, apiLevel, DeviceType.EMULATOR, releaseVersion, token, Status.OFFLINE));
                }

                if (line.includes("usb") || line.includes("vbox86p")) {
                    const status: Status = Status.BOOTED;
                    const name = line.split("model:")[1].trim().split(" ")[0].trim();
                    devices.push(new AndroidDevice(name, apiLevel, DeviceType.DEVICE, releaseVersion, token, status));
                }

                if (line.includes("unauthorized")) {
                    devices.push(new AndroidDevice(Status.UNAUTORIZED, Status.UNAUTORIZED, DeviceType.DEVICE, undefined, "", Status.UNAUTORIZED));
                }
            }
        });

        if (verbose) {
            logInfo("Running devices: ", runningDevices);
        }

        return devices;
    }

    private static parseRealDevices(runningDevices: Array<AndroidDevice>, devices: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>()) {
        runningDevices.forEach(d => {
            if (d.type === DeviceType.DEVICE) {
                devices.set(d.name, new Array());
                devices.get(d.name).push(d);
            }
        });
    }

    public static emulatorId(platformVersion) {
        return AndroidController._emulatorIds.get(platformVersion.toString());
    }

    private static sendKeyCommand = (token, key) => {
        return `${AndroidController.ADB} -s ${token} shell input keyevent ${key}`;
    }

    public static async clearLog(device: IDevice) {
        await this.executeAdbCommand(device, " logcat -c", 5000);
    }

    // public static async getDeviceLog(device: IDevice, shouldCleanLog: boolean) {
    //     await this.executeAdbCommand(device, " logcat ");
    //     if (shouldCleanLog) {
    //         await this.executeAdbCommand(device, " logcat -c");
    //     }
    // }

    private static checkAndroid() {
        let avdMangerExt = "";
        let emulatorExt = "";
        if (isWin()) {
            avdMangerExt = ".bat";
            emulatorExt = ".exe";
        }
        if (!existsSync(AndroidController.AVD_MANAGER + avdMangerExt)) {
            AndroidController.LIST_AVDS = "android list avds ";
        }

        if (!existsSync(AndroidController.EMULATOR + emulatorExt)) {
            AndroidController.EMULATOR = "emulator ";
        }
    }

    private static executeAdbCommand(device: IDevice, command: string, timeout: number = AndroidController.DEFAULT_BOOT_TIME) {
        const prefix = AndroidController.getTokenPrefix(device);
        const commandToExecute = `${AndroidController.ADB} -s ${prefix}${device.token} ${command}`;
        const result = executeCommand(commandToExecute, process.cwd(), timeout);
        return result;
    }

    public static executeAdbShellCommand(device: IDevice, command: string, timeout: number = AndroidController.DEFAULT_BOOT_TIME) {
        const commandToExecute = `shell ${command}`;
        const result = AndroidController.executeAdbCommand(device, commandToExecute, timeout);
        return result;
    }

    private static getTokenPrefix(device: IDevice) {
        const result = device.type === DeviceType.EMULATOR && !device.token.startsWith("emulator") ? "emulator-" : "";
        return result;
    }

    private static getAlwaysFinishActivitiesGlobalSettingValue(device: IDevice, value): boolean {
        const commandToExecute = `settings get global always_finish_activities`;
        const resultAsString = AndroidController.executeAdbShellCommand(device, commandToExecute).trim();
        const matchResult = /^\d/igm.exec(resultAsString);
        const result: boolean = (matchResult != null && matchResult.length > 0) ? matchResult[0] == value : false;
        if (!result) {
            logError(resultAsString);
        }

        return result;
    }

    public static setDontKeepActivities(value: boolean, device: IDevice) {
        const status = value ? 1 : 0;
        const commandToExecute = `settings put global always_finish_activities ${status}`;
        AndroidController.executeAdbShellCommand(device, commandToExecute);
        if (!AndroidController.getAlwaysFinishActivitiesGlobalSettingValue(device, status)) {
            throw new Error(`Failed to set "Don't keep activities" to ${value}!`);
        }
    }
}

export class AndroidDevice extends Device {
    constructor(name: string, apiLevel, type: DeviceType, releaseVersion: string, token?: string, status?: Status, pid?: number) {
        super(name, apiLevel, type, Platform.ANDROID, token, status, pid, releaseVersion);
    }
}