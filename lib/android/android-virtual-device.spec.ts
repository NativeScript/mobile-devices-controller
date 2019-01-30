import { AndroidVirtualDevice } from "./android-virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { DeviceController } from "../device-controller";
import { Status, Platform, DeviceType } from "../enums";
import { assert } from "chai";
import { AndroidController } from "../android-controller";
import { glob } from "glob";
import { join } from "path";

describe("android", async function () {

    before("before all", () => {
        AndroidController.killAll();
    });

    after("after all", () => {
        AndroidController.killAll();
    });

    describe("android controller", () => {

        it("check device filtering", async function () {
            const devices = await DeviceController.getDevices({ name: "Emulator-Api23-Default" });
            for (let index = 0; index < devices.length; index++) {
                const element = devices[index];
                assert.isTrue(element.name.includes("Emulator-Api23-Default"));
            }
            const singleDevices = await DeviceController.getDevices({ name: <any>/^Emulator-Api23-Default$/ });
            assert.isTrue(singleDevices.length === 1 && singleDevices[0].name === "Emulator-Api23-Default")
        });

        it("start Emulator-Api23 and filter booted device by apiLevel 23 and 6.0", async () => {
            const queryApi23 = { apiLevel: "23", platform: Platform.ANDROID };
            const queryApi6 = { apiLevel: "6.0", platform: Platform.ANDROID };

            const bootedDevice = await DeviceController.startDevice(Object.assign({}, queryApi6));

            const deviceApiLevel23 = (await DeviceController.getDevices(queryApi23))[0];
            assert.isTrue(deviceApiLevel23 != null && deviceApiLevel23.status === Status.BOOTED);

            const deviceApiLevel6 = (await DeviceController.getDevices(queryApi6))[0];
            assert.isTrue(deviceApiLevel6 != null && deviceApiLevel6.status === Status.BOOTED);

            AndroidController.killAll();
        });

        it("start and kill twice emulators from api17 api28  with -wipe-data and then -snapshot", async () => {
            const deviceQueries = [
                { name: "Emulator-Api17-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api17-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api18-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api18-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api17-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api18-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api21-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api21-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api22-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api22-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api23-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api23-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api24-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api24-Default", platform: Platform.ANDROID },
                { name: "Emulator-Api25-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api25-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api26-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api26-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api27-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api27-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api28-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api28-Google", platform: Platform.ANDROID },
                { name: "Emulator-Api26-Google", platform: Platform.ANDROID },
            ]
            for (let index = 0; index < deviceQueries.length; index++) {
                const startedDevice = await DeviceController.startDevice(deviceQueries[index], undefined, index % 2 === 0 ? false : true);
                let bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED, platform: Platform.ANDROID });
                console.log("bootedDevices: ", bootedDevices);
                assert.isTrue(bootedDevices.length === 1, `actual ${bootedDevices.length}, expected 1`);
                await DeviceController.kill(startedDevice);
                bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED, platform: Platform.ANDROID });
                console.log("bootedDevices: ", bootedDevices);
                assert.isTrue(bootedDevices.length === 0, "All devices should be killed!");
            }

            AndroidController.killAll();
        });

        const checkIfSnapshotIsSaved = (deviceName, snapshotName) => {
            const avdsDirectory = process.env["AVDS_STORAGE"] || join(process.env["HOME"], "/.android/avd");
            const snapshots = glob.sync(`${avdsDirectory}/${deviceName}.avd/**/${snapshotName}`);
            return snapshots.some(s => s.includes(snapshotName));
        };

        it("check snapshot is saved if not exists", async () => {
            const deviceQuery21 = { name: "Emulator-Api21-Default", platform: Platform.ANDROID, token: "5554" };
            const deviceQuery26 = { name: "Emulator-Api26-Google", platform: Platform.ANDROID, token: "5560" };
            let ds = [deviceQuery21, deviceQuery26]
            for (let index = 0; index < ds.length; index++) {
                const snapshotName = `test-${Date.now()}`;
                const bootedDevice = await DeviceController.startDevice(ds[index], `-snapshot ${snapshotName}`, false);
                const isSnapshotCreated = checkIfSnapshotIsSaved(bootedDevice.name, snapshotName);
                assert.isTrue(isSnapshotCreated, "Snapshot is not created");
                const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED, platform: Platform.ANDROID });
                assert.isTrue(bootedDevices.length === index + 1, `Actual ${bootedDevices}`);
            }

            AndroidController.killAll();
        });

        it("start default devices option `-snapshot clean_boot` and diff tokens", async () => {
            const deviceQuery21 = { name: "Emulator-Api21-Default", platform: Platform.ANDROID, token: "5554" };
            const deviceQuery23 = { name: "Emulator-Api23-Default", platform: Platform.ANDROID, token: "5556" };
            const deviceQuery25 = { name: "Emulator-Api25-Google", platform: Platform.ANDROID, token: "5558" };
            const deviceQuery26 = { name: "Emulator-Api26-Google", platform: Platform.ANDROID, token: "5560" };
            let ds = [deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26,
                deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26]
            for (let index = 0; index < ds.length; index++) {
                await DeviceController.startDevice(ds[index], "-snapshot clean_boot", false);
                const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED, platform: Platform.ANDROID });
                const length = index >= 4 ? 4 : index + 1;
                assert.isTrue(bootedDevices.length >= length, `Actual ${bootedDevices}`);
            }

            AndroidController.killAll();
        });
    });

    describe("android virtual devices", () => {
        it("test start device", function () {
            this.timeout(15000);

            return new Promise(async (resolve, reject) => {
                const androidVirtualDevice = new AndroidVirtualDevice();
                const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
                const d = await androidVirtualDevice.startDevice(ds);
                let timer = setTimeout(() => {
                    reject();
                }, 25000);
                androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                    clearTimeout(timer);
                    timer = null;
                    resolve();
                });

                await AndroidController.kill(d);
            });
        });

        it("attach to device", function () {
            this.timeout(15000);
            return new Promise(async (resolve, reject) => {
                const androidVirtualDevice = new AndroidVirtualDevice();
                const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
                const d = await androidVirtualDevice.startDevice(ds);
                let hasPassedFirstCheck = false;
                let timer = setTimeout(() => {
                    reject();
                }, 15000);

                androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                    clearTimeout(timer);
                    timer = null;
                    resolve();
                    androidVirtualDevice.removeAllListeners();
                });

                const attachedDevices = await androidVirtualDevice.attachToDevice(d);
                assert.isTrue(attachedDevices.status === Status.BOOTED, "Attached device should be alive!");
            });
        });

        it("attach to device twice", function () {
            this.timeout(15000);
            return new Promise(async (resolve, reject) => {
                const androidVirtualDevice = new AndroidVirtualDevice();
                const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
                const d = await androidVirtualDevice.startDevice(ds);
                let hasPassedFirstCheck = false;
                let timer = setTimeout(() => {
                    reject();
                }, 25000);

                let count = 0;
                androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                    clearTimeout(timer);
                    timer = null;
                    hasPassedFirstCheck = true;
                    count++;
                });

                androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                    console.log(d);
                    console.log(hasPassedFirstCheck);
                    console.log(count);
                    androidVirtualDevice.stopDevice();

                    if (hasPassedFirstCheck && count === 1) {
                        resolve();
                    } else {
                        reject();
                    }
                });

                await androidVirtualDevice.attachToDevice(d);
                await androidVirtualDevice.attachToDevice(d);

                await AndroidController.kill(d);
            });
        });

        it("start attach stop attach", function () {
            this.timeout(15000);
            return new Promise(async (resolve, reject) => {
                const androidVirtualDevice = new AndroidVirtualDevice();
                const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
                const d = await androidVirtualDevice.startDevice(ds);
                let hasPassedFirstCheck = false;
                let timer = setTimeout(() => {
                    reject();
                }, 25000);

                let count = 0;
                androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, async (d) => {
                    clearTimeout(timer);
                    timer = null;
                    hasPassedFirstCheck = true;
                    count++;
                    await androidVirtualDevice.stopDevice();
                    if (hasPassedFirstCheck && count === 2) {
                        resolve();
                    }
                });

                androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                    console.log(hasPassedFirstCheck);
                    console.log(count);
                });

                await androidVirtualDevice.attachToDevice(d);
                await androidVirtualDevice.stopDevice();
                await androidVirtualDevice.attachToDevice(d);
                androidVirtualDevice.removeAllListeners();
            });
        });

        it("start attach detach attach stop", function () {
            this.timeout(15000);
            return new Promise(async (resolve, reject) => {
                const androidVirtualDevice = new AndroidVirtualDevice();
                const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
                const d = await androidVirtualDevice.startDevice(ds);
                let hasPassedFirstCheck = false;
                let timer = setTimeout(() => {
                    reject();
                }, 25000);

                let count = 0;
                androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, async (d) => {
                    clearTimeout(timer);
                    timer = null;
                    hasPassedFirstCheck = true;
                    count++;
                    await androidVirtualDevice.stopDevice();
                    if (hasPassedFirstCheck && count === 2) {
                        resolve();
                    }
                });

                await androidVirtualDevice.attachToDevice(d);
                await androidVirtualDevice.detach();
                await androidVirtualDevice.attachToDevice(d);
                await androidVirtualDevice.stopDevice();
                androidVirtualDevice.removeAllListeners();
            });
        });
    });
});

// describe("parse-real-devices", () => {
//     it("find real device", async () => {
//         const devices = await DeviceController.getDevices({ platform: Platform.ANDROID });
//         const ds = devices.filter(d => d.type === DeviceType.DEVICE);
//         console.log(ds);
//         assert.isTrue(ds.length > 0);
//     })
// })