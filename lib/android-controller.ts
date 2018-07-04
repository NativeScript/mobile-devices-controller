import { spawn, ChildProcess } from "child_process";
import { resolve, delimiter, sep, dirname, join } from "path";
import { existsSync, rmdirSync, unlinkSync } from "fs";
import { Platform, DeviceType, Status } from "./enums";
import { IDevice, Device } from "./device";
import * as net from "net";
import {
    waitForOutput,
    executeCommand,
    isWin,
    killProcessByName,
    killPid,
    searchFiles,
    getAllFileNames,
    wait
} from "./utils";
import { networkInterfaces } from "os";

const OFFSET_DI_PIXELS = 16;

export class AndroidController {
    private static DEFAULT_BOOT_TIME = 180000;
    private static ANDROID_HOME = process.env["ANDROID_HOME"] || "";
    private static EMULATOR = resolve(AndroidController.ANDROID_HOME, "emulator", "emulator");
    private static ADB = resolve(AndroidController.ANDROID_HOME, "platform-tools", "adb");
    private static LIST_DEVICES_COMMAND = AndroidController.ADB + " devices -l";
    private static AVD_MANAGER = resolve(AndroidController.ANDROID_HOME, "tools", "bin", "avdmanager");
    private static LIST_AVDS = AndroidController.AVD_MANAGER + " list avd";
    private static _emulatorIds: Map<string, string> = new Map();

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
        return parseInt(AndroidController.executeAdbShellCommand(device, "wm density").split(":")[1]) * 0.01;
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

    public static async startEmulator(emulator: IDevice, options = "", logPath = undefined): Promise<IDevice> {
        if (!emulator.token) {
            emulator.token = AndroidController.emulatorId(emulator.apiLevel) || "5554";
        }

        if (logPath) {
            options = options + " > " + logPath + " 2>&1";
        }

        if (!this.checkIfEmulatorIsRunning(emulator.token)) {
            AndroidController.kill(emulator);
            const avdsDirectory = process.env["AVDS_STORAGE"] || join(process.env["HOME"], "/.android/avd");
            const avd = resolve(avdsDirectory, `${emulator.name}.avd`);
            getAllFileNames(avd).filter(f => f.endsWith(".lock")).forEach(f => {
                try {
                    const path = resolve(avd, f);
                    console.log(`Try to delete ${path}!`);

                    if (existsSync(path)) {
                        console.log(`Deleting ${path}!`);
                        unlinkSync(path);
                        console.log(`Deleted ${path}!`);
                    }
                } catch (error) {
                    console.log(`Failed to delete lock file for ${avd}!`);
                }
            });
        }

        emulator = await AndroidController.startEmulatorProcess(emulator, options);

        const result = await AndroidController.waitUntilEmulatorBoot(emulator.token, parseInt(process.env.BOOT_ANDROID_EMULATOR_MAX_TIME) || AndroidController.DEFAULT_BOOT_TIME) === true ? Status.BOOTED : Status.SHUTDOWN;

        if (result === Status.BOOTED) {
            emulator.status = Status.BOOTED;
            emulator.startedAt = Date.now();
        }

        AndroidController.setEmulatorConfig(emulator);
        return emulator;
    }

    public static async reboot(emulator: IDevice) {
        try {
            if (AndroidController.checkApplicationNotRespondingDialogIsDisplayed(emulator)) {
                const errorMsgType = AndroidController.getCurrentErrorMessage(emulator);
                if (errorMsgType) {
                    AndroidController.executeAdbCommand(emulator, `adb shell am force-stop ${errorMsgType}`);
                    AndroidController.executeAdbCommand(emulator, `adb shell pm clear ${errorMsgType}`);
                }
            }
        } catch{ }
        AndroidController.executeAdbCommand(emulator, 'reboot bootloader');
        const result = AndroidController.waitUntilEmulatorBoot(emulator.token, AndroidController.DEFAULT_BOOT_TIME);
        if (!result) {
            emulator = await AndroidController.kill(emulator);
            emulator = await AndroidController.startEmulator(emulator);
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
            console.error("We couldn't unclock the devie: ", result);
        }
    }

    /**
     * Implement kill process
     * @param emulator 
     */
    public static kill(emulator: IDevice) {
        let isAlive: boolean = true;
        if (emulator.type === DeviceType.EMULATOR) {
            if (emulator.token) {
                try {
                    const result = AndroidController.executeAdbCommand(emulator, " emu kill");
                } catch (error) { }
            }
            if (!emulator.pid) {
                if (!isWin()) {
                    const grepForEmu = executeCommand(`ps | grep ${emulator.token}`);
                    const regExp = /^\d+/;

                    if (regExp.test(grepForEmu)) {
                        const pid = regExp.exec(grepForEmu)[0];
                        emulator.pid = parseInt(pid);
                    }
                }
            }
            if (emulator.pid) {
                try {
                    killPid(emulator.pid);
                    if (!isWin()) {
                        killPid(emulator.pid);
                    }
                    isAlive = false;
                } catch (error) {
                }
            }

            console.log(`Waiting for ${emulator} to stop!`);

            const checkIfDeviceIsKilled = token => {
                return executeCommand(AndroidController.LIST_DEVICES_COMMAND).includes(emulator.token);
            }

            const startTime = Date.now();
            while (checkIfDeviceIsKilled(emulator.token) && (Date.now() - startTime) >= 60000) {
            }

            if (checkIfDeviceIsKilled(emulator.token)) {
                console.log(`Device: ${emulator.name} is NOT killed!`);
                isAlive = true;
            } else {
                console.log(`Device: ${emulator.name} is successfully killed!`);
                isAlive = false;
            }
        }

        if (!isAlive) {
            emulator.status = Status.SHUTDOWN;
            emulator.pid = undefined;
        }

        return emulator;
    }

    public static killAll() {
        killProcessByName("qemu-system-i386");
    }

    public static async restartDevice(device: IDevice) {
        if (device.type === DeviceType.EMULATOR) {
            AndroidController.kill(device);
            AndroidController.startEmulator(device);
        } else {
            console.log("Not implemented for real device!")
        }

        return device;
    }

    public static startAdb() {
        console.log("Start adb");
        executeCommand(AndroidController.ADB + " start-server");
    }

    public static stopAdb() {
        console.log("Stop adb");
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

    public static getCurrientFocusedScreen(device: IDevice) {
        return this.executeAdbCommand(device, " shell dumpsys window windows | grep -E 'mCurrentFocus'", 3000);
    }

    public static checkApplicationNotRespondingDialogIsDisplayed(device: IDevice) {
        try {
            AndroidController.executeAdbShellCommand(device, " am start -n com.android.settings/com.android.settings.Settings")
            const errorMsg = AndroidController.getCurrientFocusedScreen(device);
            if (!errorMsg.toLowerCase()
                .includes('com.android.settings/com.android.settings.Settings')) {
                console.log("Emulator is not responding!", errorMsg);
                return true;
            }
        } catch (error) {
            console.error('Command timeout recieved', error);
            AndroidController.executeAdbShellCommand(device, " am force-stop  com.android.settings");
            return false
        }

        AndroidController.executeAdbShellCommand(device, " am force-stop  com.android.settings");

        return false
    }

    private static getCurrentErrorMessage(device: IDevice) {
        const parts = AndroidController.getCurrientFocusedScreen(device).split(":")
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
        //const commandToExecute = ` am start -n ${packageId}`;
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
            console.log("Uninstall a previous version " + packageId + " app.");
            AndroidController.uninstallApp(device, packageId);
        }

        const output = AndroidController.executeAdbCommand(device, ` install -r ${testAppName}`);
        console.info(output);

        isAppInstalled = AndroidController.isAppInstalled(device, packageId);
        if (!isAppInstalled) {
            const errorMsg = `Failed to install ${testAppName} !`;
            console.error(errorMsg);
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
                console.info(appId + " successfully uninstalled.");
            } else {
                console.error("Failed to uninstall " + appId + ". Error: " + uninstallResult);
            }
        } else {
            console.log(`Application: ${appId} is not installed!`);
        }

        if (AndroidController.getInstalledApps(device).some(app => app === appId)) {
            console.error("We couldn't uninstall application!");
        }
    }

    public static stopApplication(device: IDevice, appId) {
        AndroidController.executeAdbShellCommand(device, `am force-stop ${appId}`);
    }

    public static async getScreenshot(device: IDevice, dir, fileName) {
        fileName = fileName.endsWith(".pne") ? fileName : `${fileName}.png`;
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
            console.log(error);
            return undefined;
        }

        if (!existsSync(destinationFolder)) {
            console.log(`The folder ${destinationFolder} doesn't exist!`);
            return undefined;
        }

        // Pull files
        const output = AndroidController.executeAdbCommand(device, "pull " + remotePath + " " + destinationFile);
        console.log(output);
        const o = output.toLowerCase();
        if ((o.includes("error")) || (o.includes("failed")) || (o.includes("does not exist"))) {
            const error = "Failed to transfer " + remotePath + " to " + destinationFolder;
            console.log(error);
            console.log("Error: " + output);
            return undefined;
        } else {
            console.log(remotePath + " transferred to " + destinationFile);
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
            console.log(error);
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
        console.log(output);
        if ((output.toLowerCase().includes("error")) || (output.toLowerCase().includes("failed"))) {
            console.log("Failed to transfer " + fileName + " to " + deviceParh);
            console.log("Error: ", output);
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

    private static async startEmulatorProcess(emulator: IDevice, options) {
        const process = spawn
            (AndroidController.EMULATOR,
            [" -avd ", emulator.name, "-port ", emulator.token, "-no-snapshot", "-no-audio", options || " -wipe-data"], {
                shell: true,
                detached: false
            });

        process.stdout.on("data", (data) => {
            console.log(data.toString());
        });
        process.stdout.on("error", (error) => {
            console.log(error.toString());
        });
        emulator.pid = process.pid;

        return emulator;
    }

    private static waitUntilEmulatorBoot(deviceId, timeOutInMiliseconds: number): boolean {
        const startTime = Date.now();
        let found = false;

        console.log("Booting emulator ...");

        while ((Date.now() - startTime) <= timeOutInMiliseconds && !found) {
            found = AndroidController.checkIfEmulatorIsRunning(DeviceType.EMULATOR + "-" + deviceId);
        }

        if (!found) {
            let error = deviceId + " failed to boot in " + timeOutInMiliseconds + " seconds.";
            console.log(error, true);
        } else {
            console.log("Emilator is booted!");
        }

        return found;
    }

    private static checkIfEmulatorIsRunning(token) {
        let isBooted = executeCommand(AndroidController.ADB + " -s " + token + " shell getprop sys.boot_completed").trim() === "1";
        if (isBooted) {
            isBooted = executeCommand(AndroidController.ADB + " -s " + token + " shell getprop init.svc.bootanim").toLowerCase().trim() === "stopped";
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
                emulator = new AndroidDevice(name, undefined, DeviceType.EMULATOR, undefined, Status.SHUTDOWN);
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
                        if (avdInfo.includes(k)) {
                            v[0].status = Status.BOOTED;
                            v[0].token = emu.token;
                            busyTokens.push(emu.token);
                            AndroidController.setEmulatorConfig(v[0]);
                        }
                    })
                } catch (error) {
                    console.log(error);
                }
            }
        }

        if (busyTokens.length === 0) {
            busyTokens.push(5544);
        }
        emulators.forEach((devices, key, map) => {
            devices.forEach(device => {
                if (!device.token) {
                    const lastToken = Math.max(...busyTokens)
                    const token = lastToken % 2 === 0 ? lastToken + 2 : lastToken + 1;
                    device.token = token.toString();
                    busyTokens.push(token);
                }
            });
        });

        if (verbose) {
            console.log("Avds lAist: ", info);
            console.log("Parsed emulators: ", emulators);
        }

        return emulators;
    }

    /**
 * Send an arbitrary Telnet command to the device under test.
 *
 * @param {string} command - The command to be sent.
 *
 * @return {string} The actual output of the given command.
 */
    private static async sendTelnetCommand(port, command): Promise<string> {
        console.debug(`Sending telnet command device: ${command} to localhost:${port}`);
        return await new Promise<string>((resolve, reject) => {
            let conn = net.createConnection(port, 'localhost'),
                connected = false,
                readyRegex = /^OK$/m,
                dataStream = "",
                res = null;
            conn.on('connect', () => {
                console.debug("Socket connection to device created");
            });

            conn.setTimeout(60000, () => {
            });

            conn.on('data', (data) => {
                let recievedData = data.toString('utf8');
                if (!connected) {
                    if (readyRegex.test(recievedData)) {
                        connected = true;
                        console.debug("Socket connection to device ready");
                        conn.write(`${command}\n`);
                    }
                } else {
                    dataStream += data;
                    if (readyRegex.test(recievedData)) {
                        res = dataStream.replace(readyRegex, "").trim();
                        const resArray = res.trim().split('\n');
                        res = resArray[resArray.length - 1];
                        console.debug(`Telnet command got response: ${res}`);
                        conn.write("quit\n");
                    }
                }
            });
            conn.on('error', (err) => { // eslint-disable-line promise/prefer-await-to-callbacks
                console.debug(`Telnet command error: ${err.message}`);
                AndroidController.kill(<any>{ token: port, type: DeviceType.EMULATOR })
                reject(err);
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
                if (line.includes(DeviceType.EMULATOR.toString().toLowerCase())) {
                    const token = parseEmulatorToken(line);
                    devices.push(new AndroidDevice(undefined, undefined, DeviceType.EMULATOR, token, Status.BOOTED));
                }

                if (line.includes(Status.OFFLINE.toString().toLowerCase())) {
                    const token = parseEmulatorToken(line);
                    devices.push(new AndroidDevice(undefined, undefined, DeviceType.EMULATOR, token, Status.OFFLINE));
                }

                if (line.includes("usb")) {
                    const token = line.split("   ")[0].trim();
                    const status: Status = Status.BOOTED;
                    const name = line.split("model:")[1].trim().split(" ")[0].trim();
                    const apiLevel = executeCommand(`${AndroidController.ADB} -s ${token} shell getprop ro.build.version.release`).trim();
                    devices.push(new AndroidDevice(name, apiLevel, DeviceType.DEVICE, token, status));
                }

                if (line.includes("unauthorized")) {
                    const status: Status = Status.UNAUTORIZED;
                    devices.push(new AndroidDevice(Status.UNAUTORIZED, Status.UNAUTORIZED, DeviceType.DEVICE, "", Status.UNAUTORIZED));
                }
            }
        });

        if (verbose) {
            console.log("Running devices: ", runningDevices);
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

    private static executeAdbCommand(device: IDevice, command: string, timeout: number = 720000) {
        const prefix = AndroidController.getTokenPrefix(device);
        const commandToExecute = `${AndroidController.ADB} -s ${prefix}${device.token} ${command}`;
        const result = executeCommand(commandToExecute, process.cwd(), timeout);
        return result;
    }

    private static executeAdbShellCommand(device: IDevice, command: string) {
        const commandToExecute = `shell ${command}`;
        const result = AndroidController.executeAdbCommand(device, commandToExecute);
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
            console.error(resultAsString);
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
    constructor(name: string, apiLevel, type: DeviceType, token?: string, status?: Status, pid?: number) {
        super(name, apiLevel, type, Platform.ANDROID, token, status, pid);
    }
}