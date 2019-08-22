import { spawn } from "child_process";
import { glob } from "glob";
import { resolve, sep, dirname, join, basename } from "path";
import { existsSync, unlinkSync, readdirSync, readFileSync } from "fs";
import { Platform, DeviceType, Status, AndroidKeyEvent } from "./enums";
import { IDevice } from "./device";
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
import { isNumber } from "util";

const OFFSET_DI_PIXELS = 16;

export class AndroidController {
    private static ANDROID_HOME = AndroidController.getAndroidHome();
    private static EMULATOR = resolve(AndroidController.ANDROID_HOME, "emulator", "emulator");
    private static ADB = resolve(AndroidController.ANDROID_HOME, "platform-tools", "adb");
    private static LIST_DEVICES_COMMAND = AndroidController.ADB + " devices -l";
    private static _emulatorIds: Map<string, string> = new Map();
    private static lockFilesPredicate = f => { return f.endsWith(".lock") || f.startsWith("snapshot.lock.") };
    private static emulators = new Array<IDevice>();

    public static DEFAULT_BOOT_TIME = 150000;
    public static DEFAULT_SNAPSHOT_NAME = "clean_boot"
    public static readonly NO_SNAPSHOT_LOAD_NO_SNAPSHOT_SAVE = ["-no-audio", "-no-boot-anim", "-wipe-data", "-no-snapshot-load", "-no-snapshot-save"];
    public static NO_WIPE_DATA_NO_SNAPSHOT_SAVE = ["-snapshot", AndroidController.DEFAULT_SNAPSHOT_NAME, "-no-snapshot-save"];

    public static runningProcesses = new Array();

    private static getAndroidHome() {
        if (process.env["ANDROID_HOME"]) {
            return process.env["ANDROID_HOME"];
        }
        let androidHome = `${process.env["HOME"]}/Library/Android/sdk`;
        if (existsSync(androidHome)) {
            return androidHome;
        }

        androidHome = `/usr/local/share/android-sdk`;
        if (existsSync(androidHome)) {
            return androidHome;
        }

        androidHome = `${process.env["HOME"]}/Android/Sdk`;
        if (existsSync(androidHome)) {
            return androidHome;
        }

        return androidHome;
    }

    public static async getAllDevices(verbose: boolean = false): Promise<Array<IDevice>> {
        // this should be always first.
        const runningDevices = AndroidController.parseRunningDevicesList(verbose);
        const devices: Array<IDevice> = AndroidController.emulators;
        await AndroidController.parseEmulators(runningDevices, devices);
        await AndroidController.parseRealDevices(runningDevices, devices);

        if (devices.length === 0) {
            logError(`No devices found!
             Please check if any errors are logged and if the ANDROID_HOME is set correctly!`);
        }
        return devices;
    }

    public static getPhysicalDensity(device: IDevice) {
        return (+(/(\d+)/img.exec(AndroidController.executeAdbShellCommand(device, "wm density", 2000)))[0]) * 0.01;
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

    public static cleanLockFiles(emulator: IDevice) {
        const avdsDirectory = process.env["ANDROID_AVD_HOME"] || join(process.env["HOME"], "/.android/avd");
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

    public static async getSecurity(emulator) {
        const receivedData = await AndroidController.sendEmulatorConsoleCommands(emulator, {
            port: emulator.token,
            commands: undefined,
            shouldFailOnError: true,
            matchExit: /\w+/ig,
            retries: 10,
            getAllData: true
        });
        const emulator_console_auth_token_line = receivedData && receivedData.split("\n")
            .filter(l => l.includes("emulator_console_auth_token"))[0]
        const line = emulator_console_auth_token_line && emulator_console_auth_token_line.trim().replace('\'', "").replace('\'', "");
        let security;
        if (existsSync(line)) {
            security = readFileSync(line, "UTF8");
        }

        security = security || readFileSync(`${process.env["HOME"]}/.emulator_console_auth_token`, "UTF8").toString().trim();

        return security;
    }

    public static async getSnapshots(emulator: IDevice, securityToken?: string) {
        const commands = securityToken ? [`auth ${securityToken}`, "avd snapshot list"] : ["avd snapshot list"];
        const availableSnapshots = await AndroidController.sendEmulatorConsoleCommands(emulator, {
            port: emulator.token,
            commands: commands,
            shouldFailOnError: true,
            matchExit: /\w+/ig,
            retries: 15,
            getAllData: true
        });

        return availableSnapshots;
    }


    public static async saveSnapshot(emulator: IDevice, snapshotName: string, securityToken?: string) {
        const commands = securityToken ? [`auth ${securityToken}`, `avd snapshot save ${snapshotName}`] : [`avd snapshot save ${snapshotName}`];
        await AndroidController.sendEmulatorConsoleCommands(emulator, {
            port: emulator.token,
            commands: commands,
            shouldFailOnError: true,
            matchExit: /^\s*$/,
            retries: 10,
            getAllData: false
        });
    }

    public static async startEmulator(emulator: IDevice, startEmulatorOptions?: StartEmulatorOptions): Promise<IDevice> {
        if (!startEmulatorOptions || !startEmulatorOptions.options) {
            startEmulatorOptions = new StartEmulatorOptions();
            startEmulatorOptions.options = Array.from(AndroidController.NO_WIPE_DATA_NO_SNAPSHOT_SAVE);
            startEmulatorOptions.retries = 3;
        }
        if (!emulator.token) {
            emulator.token = emulator.apiLevel ? (AndroidController.emulatorId(emulator.apiLevel) || "5554") : "5554";
        }

        // trying to find device since name and apiLevel are mandatory;
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
            delete searchQuery.options;
            const devices = (await DeviceController.getDevices(searchQuery));
            if (devices && devices.length > 0) {
                copyIDeviceQuery(devices[0], emulator);
            } else {
                logError("Requested device is missing", emulator);
            }
        }

        if (!emulator.name) {
            logError("Please provide emulator name");
            return {};
        }

        // kill emulator instance in case some process are still alive
        await AndroidController.kill(emulator, false, startEmulatorOptions.retries);
        // clean lock files
        AndroidController.cleanLockFiles(emulator);

        emulator.type = DeviceType.EMULATOR;
        emulator = await AndroidController.startEmulatorProcess(emulator, startEmulatorOptions.logPath, startEmulatorOptions.options);
        let result = (await AndroidController.waitUntilEmulatorBoot(emulator, startEmulatorOptions.defaultBootTime || AndroidController.DEFAULT_BOOT_TIME) === true) ? Status.BOOTED : Status.SHUTDOWN;

        let security;
        //let snapshot = AndroidController.DEFAULT_SNAPSHOT_NAME;
        if (startEmulatorOptions.options
            && startEmulatorOptions.options.indexOf("-snapshot") >= 0
            && result === Status.BOOTED) {
            const snapshotName = startEmulatorOptions.options[startEmulatorOptions.options.indexOf("-snapshot") + 1];
            security = await AndroidController.getSecurity(emulator);
            const availableSnapshots = await AndroidController.getSnapshots(emulator, security);
            if (!availableSnapshots || !availableSnapshots.includes(snapshotName)) {
                console.log("Available snapshots: ", availableSnapshots);
                logWarn(`Snapshot "${snapshotName}" is not available. Saving snapshot ...`);
                await AndroidController.saveSnapshot(emulator, snapshotName, security);
                await AndroidController.startEmulator(emulator, startEmulatorOptions);
            }
        }

        if (!result || result !== Status.BOOTED) {
            await AndroidController.kill(emulator);
            logWarn("Trying to boot emulator again!");
            logWarn(`Left retries: ${startEmulatorOptions.retries}!`);
            isNumber(startEmulatorOptions.retries) && startEmulatorOptions.retries--;
            if (startEmulatorOptions.retries === 0 || !isNumber(startEmulatorOptions.retries)) {
                const newOptions = Array.from(AndroidController.NO_SNAPSHOT_LOAD_NO_SNAPSHOT_SAVE);
                if (startEmulatorOptions.options.indexOf("-no-window")) {
                    newOptions.push("-no-window");
                }
                startEmulatorOptions.options = newOptions;
            }
            emulator = await AndroidController.startEmulator(emulator, startEmulatorOptions);
        }

        if (result === Status.BOOTED) {
            emulator.status = Status.BOOTED;
            emulator.startedAt = Date.now();
            if (!emulator.apiLevel || !emulator.releaseVersion) {
                emulator.releaseVersion = AndroidController.executeAdbShellCommand(emulator, ` getprop ro.build.version.release`).trim();
                emulator.apiLevel = AndroidController.executeAdbShellCommand(emulator, ` getprop ro.build.version.sdk`).trim();
            }
        }

        if (!emulator.config || !emulator.config.offsetPixels) {
            AndroidController.setEmulatorConfig(emulator);
        }

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
            result = await AndroidController.waitUntilEmulatorBoot(emulator, AndroidController.DEFAULT_BOOT_TIME / 3);
        } catch{ }

        if (!result) {
            emulator = await AndroidController.kill(emulator);
            const options = {
                options: ["-wipe-data", "-no-snapshot-load", "-no-boot-anim", "-no-audio"],
                retries: 3,
            };
            emulator = await AndroidController.startEmulator(emulator, options);
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
    public static async kill(emulator: IDevice, verbose = true, retries: number = 3) {
        let isAlive: boolean = true;
        if (emulator.type !== DeviceType.DEVICE) {
            if (emulator.token) {
                try {
                    AndroidController.executeAdbCommand(emulator, " emu kill");
                } catch (error) { }
            }

            try {
                if (!isWin()) {
                    emulator.pid && killAllProcessAndRelatedCommand(emulator.pid);
                    killAllProcessAndRelatedCommand(["sdk/emulator/qemu", emulator.name]);
                }
                emulator.pid && killPid(+emulator.pid);
                killProcessByName("emulator64-crash-service");
            } catch (error) { }

            if (verbose) {
                logInfo(`Waiting for ${emulator.name || emulator.token} to stop!`);
            }

            const checkIfDeviceIsKilled = token => {
                return executeCommand(AndroidController.LIST_DEVICES_COMMAND).includes(token);
            }

            const startTime = Date.now();
            while (checkIfDeviceIsKilled(emulator.token) && (Date.now() - startTime) <= 10000 && retries >= 0) { }

            if (checkIfDeviceIsKilled(emulator.token)) {
                logError(`Device: ${emulator.name} is NOT killed!`);
                retries--;
                isAlive = true;
                if (verbose) {
                    logWarn(`Retrying kill all processes related to ${emulator.name}`);
                }
                await AndroidController.kill(emulator, verbose, retries);
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
            emulator.status = Status.INVALID;
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
            await AndroidController.kill(device);
            logInfo(`Restarting device ${device.name}`);
            const options = <StartEmulatorOptions>{
                options: AndroidController.NO_SNAPSHOT_LOAD_NO_SNAPSHOT_SAVE,
                retries: 3,
            }
            await AndroidController.startEmulator(device, options);
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

    public static isAppRunning(device: IDevice, packageId: string) {
        const result = AndroidController.executeAdbShellCommand(device, "ps");
        if (result.includes(packageId)) {
            return true;
        } else {
            return false;
        }
    }

    public static getCurrentFocusedScreen(device: IDevice, commandTimeout: number = 1000) {
        return this.executeAdbCommand(device, " shell dumpsys window windows | grep -E 'mSurface'", commandTimeout);
    }

    public static checkApiLevelIsLessThan(device: IDevice, apiLevel: number) {
        let dApiLevel = device.apiLevel;
        if (!device.releaseVersion) {
            dApiLevel = /\d.\d/ig.exec(device.apiLevel)[0];
        }
        return isNaN(+dApiLevel) || +dApiLevel < apiLevel
    }

    public static checkIfEmulatorIsResponding(device: IDevice) {
        if (AndroidController.checkApiLevelIsLessThan(device, 19)) {
            console.log(`Skip check if device is responding since api level is lower than 19/ 5.0`);
            return true;
        }

        const shortTimeout = 15000;
        console.log("Check if emulator is responding");
        try {
            const androidSettings = "com.android.settings/com.android.settings.Settings";
            AndroidController.executeAdbShellCommand(device, ` am start -n ${androidSettings}`, shortTimeout);
            wait(500);
            let errorMsg = AndroidController.getCurrentFocusedScreen(device);
            const startTime = Date.now();
            while (Date.now() - startTime <= 5000
                && !errorMsg.toLowerCase()
                    .includes(androidSettings.toLowerCase())) {
                wait(1000);
                errorMsg = AndroidController.getCurrentFocusedScreen(device);
            }
            if (!errorMsg.toLowerCase()
                .includes(androidSettings.toLowerCase())) {
                logWarn("Emulator is not responding!", errorMsg);
                return false;
            }
        } catch (error) {
            logError('Command timeout received', error);
            AndroidController.executeAdbShellCommand(device, " am force-stop com.android.settings", shortTimeout);
            return false
        }
        try {
            AndroidController.executeAdbShellCommand(device, " am force-stop com.android.settings", shortTimeout);
        } catch (error) { }

        return true
    }

    private static getCurrentErrorMessage(device: IDevice) {
        const parts = AndroidController.getCurrentFocusedScreen(device).split(":")
        return parts.length > 1 ? parts[1].trim() : undefined
    }

    public static reinstallApplication(device, appFullName, packageId: string = undefined) {
        packageId = packageId || AndroidController.getPackageId(appFullName);
        AndroidController.uninstallApplication(device, packageId);
        AndroidController.installApplication(device, appFullName, packageId);
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

    public static getInstalledApplications(device) {
        const list = AndroidController.executeAdbShellCommand(device, `pm list packages -3`).split("\n");
        return list;
    }

    public static isAppInstalled(device: IDevice, packageId) {
        let isAppInstalled = AndroidController.getInstalledApplications(device).some(pack => pack.includes(packageId));
        return isAppInstalled
    }

    public static installApplication(device: IDevice, testAppName, packageId: string = undefined) {
        packageId = packageId || AndroidController.getPackageId(testAppName);
        let isAppInstalled = AndroidController.isAppInstalled(device, packageId);
        if (isAppInstalled) {
            logInfo("Uninstall a previous version " + packageId + " app.");
            AndroidController.uninstallApplication(device, packageId);
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

    public static uninstallApplication(device, packageId) {
        const isAppInstalled = AndroidController.isAppInstalled(device, packageId);
        if (isAppInstalled) {
            AndroidController.stopApplication(device, packageId);
            const uninstallResult = AndroidController.executeAdbCommand(device, `uninstall ${packageId}`);
            if (uninstallResult.includes("Success")) {
                logInfo(packageId + " successfully uninstalled.");
            } else {
                logError("Failed to uninstall " + packageId + ". Error: " + uninstallResult);
            }
        } else {
            logInfo(`Application: ${packageId} is not installed!`);
        }

        if (AndroidController.getInstalledApplications(device).some(app => app === packageId)) {
            logError("We couldn't uninstall application!");
        }
    }

    public static stopApplication(device: IDevice, packageId) {
        AndroidController.executeAdbShellCommand(device, `am force-stop ${packageId}`);
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
        const { pathToVideo, devicePath, videoRecordingProcess } = AndroidController.startRecordingVideo(device, dir, fileName);
        new Promise(async (res, reject) => {
            callback().then((result) => {
                videoRecordingProcess.kill("SIGINT");
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
        const videoRecordingProcess = spawn(AndroidController.ADB, ['-s', `${prefix}${device.token}`, 'shell', 'screenrecord', `${devicePath}`]);
        if (videoRecordingProcess) {
            AndroidController.runningProcesses.push(videoRecordingProcess.pid);
        }

        return { pathToVideo: pathToVideo, devicePath: devicePath, videoRecordingProcess: videoRecordingProcess };
    }

    public static stopRecordingVideo(device, videoRecordingProcess, devicePath, pathToVideo) {
        videoRecordingProcess.kill("SIGINT");
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

    private static parsePlatforms() {
        const platformsFolder = resolve(AndroidController.ANDROID_HOME, "system-images");
        const platforms = new Map<string, { sdk: string, releaseVersion: string }>();
        const files = glob.sync(`${platformsFolder}/*`);
        const errors = new Array();
        for (let index = 0; index < files.length; index++) {
            const f = files[index];
            const versions = <any>{};
            const file = glob.sync(`${f}/*/*/build.prop`)[0];
            if (file) {
                const fileContent = readFileSync(file, "UTF8");
                const fileData = fileContent.split("\n");

                for (let i = 0; i < fileData.length; i++) {
                    const line = fileData[i];
                    if (line) {
                        if (line.includes("ro.build.version.sdk") || line.includes("AndroidVersion.ApiLevel")) {
                            // versions.sdk = /\d+(\.\d)?(\.\d)?/.exec(line)[0];
                            versions.sdk = line.split("=")[1].trim();
                        }
                        if (line.includes("ro.build.version.release") || line.includes("Platform.Version")) {
                            // versions.releaseVersion = /\d+(\.\d)?(\.\d)?/.exec(line)[0];
                            versions.releaseVersion = line.split("=")[1].trim();
                        }

                        if (versions.sdk && versions.releaseVersion) {
                            i = fileData.length;
                        }
                    }
                }

                const platformName = basename(f);
                if (!platforms.has(platformName) && versions.sdk && versions.releaseVersion) {
                    platforms.set(platformName, versions);
                }
            } else {
                errors.push(f);
            }
        }

        if (errors.length > 0) {
            logError(`System images ${errors.join(", ")} needs to be preinstalled!
        We found that some files which are important for handling of devices are missing!
        The best way to fix it is to reinstall the platform.`);
        }

        return platforms;
    }

    private static parseEmulatorsAvds() {
        const platforms = AndroidController.parsePlatforms();
        const avdsHomeDir = process.env["ANDROID_AVD_HOME"] || process.env["HOME"] || process.env["HOMEPATH"] || process.env["USERPROFILE:"];
        const emulators = new Array();

        if (!existsSync(avdsHomeDir)) {
            logError(`Path to avds storage is not valid '${avdsHomeDir}'! 
            Please provide the correct path using env variable ANDROID_AVD_HOME="path to avds"!
            Usually, when android studio is installed it should be on home/.android/avd`);
            return emulators;
        }

        const avdsDirectory = join(avdsHomeDir, "/.android/avd");
        if (!existsSync(avdsDirectory)) {
            logError(`Path to avds storage is not valid '${avdsDirectory}'! 
        Please provide the correct path using env variable ANDROID_AVD_HOME="path to avds"!
        Usually, when android studio is installed it should be on home/.android/avd`);
            return emulators;
        }
        readdirSync(avdsDirectory)
            .filter(f => f.endsWith(".ini"))
            .forEach(f => {
                readFileSync(resolve(avdsDirectory, f), "UTF8")
                    .split("\n")
                    .forEach(line => {
                        if (line.includes("target=")) {
                            const buildPlatform = line.split("=")[1].trim();
                            const versions = platforms.get(buildPlatform)
                            const name = f.replace(".ini", "");
                            const emu = <IDevice>{
                                name: name,
                                apiLevel: versions.sdk,
                                releaseVersion: versions.releaseVersion,
                                platform: Platform.ANDROID,
                                type: DeviceType.EMULATOR,
                                status: Status.SHUTDOWN
                            }
                            emulators.push(emu);
                        }
                    });
            });

        const files = glob.sync(`${avdsDirectory}/*.avd/config.ini`);
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            const fileContent = readFileSync(resolve(file), "UTF8");
            const fileData = fileContent.split("\n");
            const config = <any>{};
            for (let i = 0; i < fileData.length; i++) {
                const line = fileData[i];
                if (line) {
                    if (line && line.includes("hw.lcd.density=")) {
                        config.density = +(line.split("=")[1]) * 0.01;
                        config.offsetPixels = AndroidController.calculateScreenOffset(config.density);
                    }
                    if (line && line.includes("skin.name=")) {
                        const [width, height] = line.split("=")[1].split("x");
                        config.screen = { width: width, height: height };
                    }

                    if (config.offsetPixels && config.density && config.screen) {
                        i = fileData.length;
                        const dirName = basename(dirname(file)).replace(".avd", "");
                        if (emulators.some(e => e.name === dirName)) {
                            emulators.filter(e => e.name === dirName)[0].config = config;
                        } else {
                            console.error(`avd ${file} is not valid!`);
                        }
                    }
                }
            }
        }
        return emulators;
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
            });

        process.stdout.on("data", (data) => {
            console.log(data.toString());
        })
        process.stdout.on("error", (data) => {
            console.log(data.toString());
        })

        emulator.pid = process.pid;
        emulator.process = process;

        return emulator;
    }

    private static async waitUntilEmulatorBoot(device: IDevice, timeOutInMilliseconds: number) {
        return new Promise((resolve, reject) => {
            logInfo("Booting emulator ...");
            const abortWatch = setTimeout(function () {
                clearTimeout(abortWatch);
                logError("Received timeout: ", timeOutInMilliseconds);
                return resolve(false);
            }, timeOutInMilliseconds);

            let isBooted = AndroidController.checkIfEmulatorIsRunning(DeviceType.EMULATOR + "-" + device.token, timeOutInMilliseconds);
            if (isBooted) {
                isBooted = AndroidController.checkIfEmulatorIsResponding(device);
            }
            if (!isBooted) {
                logError(`${device.token} failed to boot in ${timeOutInMilliseconds} milliseconds`, true);
            } else {
                logInfo("Emulator is booted!");
            }
            clearTimeout(abortWatch);
            return resolve(isBooted);;
        });
    }

    private static getBootAnimProp(token: string) {
        return executeCommand(`${AndroidController.ADB} -s ${token} shell getprop sys.bootanim`).trim();
    }

    private static getBootCompletedProp(token: string) {
        return executeCommand(`${AndroidController.ADB} -s ${token} shell getprop sys.boot_completed`).trim();
    }

    private static checkIfEmulatorIsRunning(token, timeOutInMilliseconds = AndroidController.DEFAULT_BOOT_TIME) {
        console.log(`Check if "${token}" is running.`);
        const convertBootCompletedToBool = (msg) => msg.trim() === "1";
        const convertBootAnimToBool = (msg) => msg.trim() === "stopped";
        let isBootedMessage = AndroidController.getBootCompletedProp(token);
        if (isBootedMessage.includes("closed")) {
            return false;
        }
        let isBooted = convertBootCompletedToBool(isBootedMessage);
        let isBootedSecondCheck = false;
        if (isBooted) {
            isBootedSecondCheck = convertBootAnimToBool(AndroidController.getBootAnimProp(token));
        }
        const startTime = Date.now();
        while ((Date.now() - startTime) <= timeOutInMilliseconds && (!isBooted || !isBootedSecondCheck)) {
            isBootedMessage = AndroidController.getBootCompletedProp(token);
            isBooted = convertBootCompletedToBool(isBootedMessage);;
            if (isBooted) {
                isBootedSecondCheck = executeCommand(`${AndroidController.ADB} -s ${token} shell getprop init.svc.bootanim`).toLowerCase().trim() === "stopped";
            }
            wait(1000);
        }

        console.log(`Check has "${isBooted ? "passed" : "failed"}".`);

        return isBooted;
    }

    public static async refreshDeviceStatus(token: string, verbose = false) {
        const emulators = AndroidController.parseRunningDevicesList(verbose);
        const emulator = emulators.filter(e => e.token === token)[0];
        return emulator != null ? emulator.status : Status.SHUTDOWN;
    }

    public static async sendEmulatorConsoleCommands(emulator: IDevice, options: EmulatorConsoleOptions) {
        const isValidResult = (avdInfo, matchExit: RegExp) => {
            let result = false;
            if (matchExit) {
                result = matchExit.test(avdInfo);
                if (!result) {
                    console.log(result)
                }
                matchExit.lastIndex = 0;
                return result;
            }
            return !avdInfo && avdInfo !== null;
        }

        let copiedOptions = <EmulatorConsoleOptions>{};
        Object.assign(copiedOptions, options);
        copiedOptions.commands = options.commands && Array.from(options.commands);
        let avdInfo = await AndroidController.sendTelnetCommand(copiedOptions);
        let isValid = false;
        if (!isValidResult(avdInfo, copiedOptions.matchExit)) {
            options.retries--;
            if (options.retries === 5) {
                await AndroidController.reboot(emulator);
            }
            avdInfo = await AndroidController.sendEmulatorConsoleCommands(emulator, options);
        } else {
            isValid = true;
        }

        if (!isValid && !isValidResult(avdInfo, copiedOptions.matchExit)) {
            logError(`There is a problem with emulators console and probably
            we could not establish connection with telnet localhost ${emulator.token}`)
        }
        return avdInfo;
    }

    private static async parseEmulators(runningDevices: Array<IDevice>,
        emulators: Array<IDevice> = new Array<IDevice>(),
        verbose = false) {

        let emulatorsAvds
        if (AndroidController.emulators.length > 0) {
            emulators = AndroidController.emulators;
        } else {
            const emulatorsAvds = AndroidController.parseEmulatorsAvds();
            emulators.push(...emulatorsAvds);
        }

        const busyTokens = new Array();
        emulators.forEach(d => d.status = Status.SHUTDOWN);
        for (let index = 0; index < runningDevices.length; index++) {
            const emu = runningDevices[index];
            if (emu.type === DeviceType.EMULATOR) {
                try {
                    let avdInfo = await AndroidController.sendEmulatorConsoleCommands(emu, {
                        port: emu.token,
                        commands: ["avd name"],
                        shouldFailOnError: true,
                        matchExit: /\w+/ig,
                        retries: 10,
                        getAllData: false
                    });

                    avdInfo = avdInfo && avdInfo.trim();
                    if (!avdInfo || avdInfo === null) {
                        logError("Something went wrong. We couldn't parse the emulator name!");
                    }

                    const emulatorsToFilter = emulatorsAvds || AndroidController.emulators;
                    let rEmu = emulatorsToFilter.filter(avd => avd.name === avdInfo)[0];
                    if (!rEmu) {
                        logError(`Something went wrong. We couldn't parse the running emulator ${emu.token}/ ${avdInfo} !`, emu.token);
                    }

                    rEmu.status = Status.BOOTED;
                    rEmu.token = emu.token;
                    rEmu.releaseVersion = emu.releaseVersion;
                    rEmu.apiLevel = emu.apiLevel;
                    busyTokens.push(emu.token);

                } catch (error) {
                    logError(error);
                }
            }
        }

        if (busyTokens.length === 0) {
            busyTokens.push(5544);
        }
        emulators.forEach((device) => {
            if (!device.token) {
                const token = AndroidController.getTokenForEmulator(busyTokens);
                device.token = token.toString();
                busyTokens.push(token);
            }
        });

        if (AndroidController.emulators.length === 0) {
            AndroidController.emulators = emulators;
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
    public static async sendTelnetCommand(options: EmulatorConsoleOptions): Promise<string> {

        //console.debug(`Sending telnet command device: ${command} to localhost:${port}`);
        var index = 0;
        return await new Promise<string>((resolve, reject) => {
            let conn = net.createConnection(+options.port, 'localhost'),
                readyRegex = /^OK$/m,
                allData = "",
                res = null;
            conn.on('connect', () => {
            });

            conn.setTimeout(60000, () => {
            });

            conn.on('data', (data) => {
                let receivedData = data.toString('utf8');
                allData += receivedData;
                if (!options.commands) {
                    res = receivedData;
                    conn.write("quit\n");
                }
                if (readyRegex.test(receivedData) && options.commands && options.commands.length > 0) {
                    const el = options.commands[index];
                    conn.write(`${el}\n`);
                }
                if (options.commands && options.commands.length === 0 && readyRegex.test(receivedData)) {
                    res = receivedData.replace(readyRegex, "").trim();
                    if (options.getAllData) {
                        res = allData;
                    }
                    conn.write("quit\n");
                }

                if (options.commands && readyRegex.test(receivedData)) {
                    options.commands.shift();
                }
            });
            conn.on('error', (err) => { // eslint-disable-line promise/prefer-await-to-callbacks
                resolve(res);
            });
            conn.on('close', () => {
                resolve(res);
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
        const devices: Array<IDevice> = new Array();

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
                    devices.push(<IDevice>{
                        token: token,
                        apiLevel: apiLevel,
                        releaseVersion: releaseVersion,
                        status: Status.BOOTED,
                        type: DeviceType.EMULATOR,
                        platform: Platform.ANDROID
                    });
                }

                if (line.includes(Status.OFFLINE.toString().toLowerCase())) {
                    token = parseEmulatorToken(line);
                    devices.push(<IDevice>{
                        token: token,
                        apiLevel: apiLevel,
                        platform: Platform.ANDROID,
                        releaseVersion: releaseVersion,
                        status: Status.OFFLINE,
                        type: DeviceType.EMULATOR,
                    });
                }

                if (line.includes("usb") || line.includes("vbox86p")) {
                    const status: Status = Status.BOOTED;
                    const name = line.split("model:")[1].trim().split(" ")[0].trim();
                    devices.push(<IDevice>{
                        name: name,
                        token: token,
                        apiLevel: apiLevel,
                        releaseVersion: releaseVersion,
                        status: status,
                        platform: Platform.ANDROID,
                        type: DeviceType.DEVICE
                    });
                }

                if (line.includes("unauthorized")) {
                    devices.push(<IDevice>{
                        status: Status.UNAUTORIZED,
                        platform: Platform.ANDROID,
                        type: DeviceType.DEVICE
                    });
                }
            }
        });

        if (verbose) {
            logInfo("Running devices: ", runningDevices);
        }

        return devices;
    }

    private static parseRealDevices(runningDevices: Array<IDevice>, devices: Array<IDevice> = new Array<IDevice>()) {
        runningDevices.forEach(d => {
            if (d.type === DeviceType.DEVICE) {
                devices.push(d);
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

export interface EmulatorConsoleOptions {
    port: string;
    commands?: Array<string>;
    getAllData?: boolean;
    shouldFailOnError?: boolean;
    retries?: number;
    matchExit?: RegExp
}

export class StartEmulatorOptions {
    options?: Array<string>;
    retries?: number;
    logPath?: string;
    defaultBootTime?: number = +process.env.BOOT_ANDROID_EMULATOR_MAX_TIME
        || +AndroidController.DEFAULT_BOOT_TIME
        || 1000
}