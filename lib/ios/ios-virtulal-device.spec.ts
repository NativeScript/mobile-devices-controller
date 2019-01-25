import { IOSVirtualDevice } from "./ios-virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { DeviceController } from "../device-controller";
import { IOSController } from "../ios-controller";
import { Status, Platform } from "../enums";
import { assert } from "chai";
import { IDevice } from "lib/device";

describe("start and kill ios device", async () => {

    before("before all", () => {
        IOSController.killAll();
    });

    after("after all", () => {
        IOSController.killAll();
    });

    it("start and kill device 10 times iPhone XR", async () => {
        const deviceQuery = { name: "iPhone XR", platform: Platform.IOS };
        for (let index = 0; index < 10; index++) {
            console.log("index: ", index);
            const startedDevice = await DeviceController.startDevice(deviceQuery);
            let bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED, platform: Platform.IOS });
            assert.isTrue(bootedDevices.length === 1, `Actual length ${bootedDevices.length}`);
            await DeviceController.kill(startedDevice);
            bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED, platform: Platform.IOS });
            assert.isEmpty(bootedDevices, `Actual length ${bootedDevices.length}`);
        }

        IOSController.killAll();
    });

    it("start diff devices", async () => {
        const iPhoneXR = { name: "iPhone XR", apiLevel: "12.1" };
        const iPhoneXR12 = { name: "iPhone XR 12", apiLevel: "12.1" };
        const iPhoneX12 = { name: "iPhone X", apiLevel: "12.1" };
        const iPhone712 = { name: "iPhone 7", apiLevel: "12.1" };
        for (let index = 0; index < [iPhoneXR, iPhoneXR12, iPhoneX12, iPhone712].length; index++) {
            const element = [iPhoneXR, iPhoneXR12, iPhoneX12, iPhone712][index];
            await IOSController.fullResetOfSimulator(element);
        }
        let ds = [iPhoneXR, iPhoneXR12, iPhoneX12, iPhone712, iPhoneXR, iPhoneXR12, iPhoneX12, iPhone712];
        for (let index = 0; index < ds.length; index++) {
            delete (<IDevice>ds[index]).token;
            await DeviceController.startDevice(ds[index]);
            const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED });
            assert.isTrue(bootedDevices.some(d => d.name === ds[index].name) && bootedDevices.length >= 1);
        }

        IOSController.killAll();
    });

    it("create simulator iPhone X", async () => {
        const device = (await DeviceController.getDevices({ name: <any>/^iPhone X$/ }))[0];
        const createdDevice = IOSController.fullResetOfSimulator({ name: device.name, apiLevel: device.apiLevel });
        const isNewDeviceAvailable = (await DeviceController.getDevices(createdDevice))[0];
        assert.isTrue(isNewDeviceAvailable && isNewDeviceAvailable.token === createdDevice.token && isNewDeviceAvailable.token !== device.token);
    })

    it("create simulator iPhone XR and delete old one", async () => {
        const device = (await DeviceController.getDevices({ name: <any>/^iPhone X$/ }))[0];
        const createdDevice = IOSController.fullResetOfSimulator({ name: device.name, apiLevel: device.apiLevel, token: device.token });
        const isNewDeviceAvailable = (await DeviceController.getDevices(createdDevice))[0];
        assert.isTrue(isNewDeviceAvailable && isNewDeviceAvailable.token === createdDevice.token && isNewDeviceAvailable.token !== device.token);
        const oldDevice = (await DeviceController.getDevices({ token: device.token }))[0];
        assert.isUndefined(oldDevice);
    })

    it("create simulator with invalid options", async () => {
        const device = (await DeviceController.getDevices({ name: <any>/^iPhone X$/ }))[0];
        const createdDevice = IOSController.fullResetOfSimulator({ name: device.name });
        assert.isTrue(createdDevice.name == "iPhone X" && !createdDevice.token);
    })

    it("test start device", () => {
        return new Promise(async (resolve, reject) => {
            const iOSVirtualDevice = new IOSVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "iPhone XR" }))[0];
            const d = await iOSVirtualDevice.startDevice(ds);
            let timer = setTimeout(() => {
                reject();
            }, 25000);
            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                resolve();
            });

            IOSController.kill(d.token);
        });
    });

    it("attach to device", () => {
        return new Promise(async (resolve, reject) => {
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
            });

            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                if (hasPassedFirstCheck) {
                    resolve();
                } else {
                    reject();
                }
            });

            const attachedDevices = await iOSVirtualDevice.attachToDevice(d);
            console.log(attachedDevices);

            IOSController.kill(d.token);
        });
    });

    it("attach to device twice", () => {
        return new Promise(async (resolve, reject) => {
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
            });

            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                console.log(hasPassedFirstCheck);
                console.log(count);
                iOSVirtualDevice.stopDevice();

                if (hasPassedFirstCheck && count === 1) {
                    resolve();
                } else {
                    reject();
                }
            });

            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.attachToDevice(d);

            IOSController.kill(d.token);
        });
    });

    it("start attach stop attach", () => {
        return new Promise(async (resolve, reject) => {
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
                iOSVirtualDevice.stopDevice();
                if (hasPassedFirstCheck && count === 2) {
                    resolve();
                }
            });

            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                console.log(hasPassedFirstCheck);
                console.log(count);
            });

            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.stopDevice();
            await iOSVirtualDevice.attachToDevice(d);
        });
    });

    it("start attach detach attach", () => {
        return new Promise(async (resolve, reject) => {
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
                iOSVirtualDevice.stopDevice();
                if (hasPassedFirstCheck && count === 2) {
                    resolve();
                }
            });

            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.detach();
            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.stopDevice();
        });
    });

    describe("install/ uninstall app", () => {

        const deviceQuery = {
            name: "/^iPhone XR$/ig",
            apiLevel: "12.1",
            platform: Platform.IOS,
            status: Status.BOOTED
        };

        let appToInstall;
        let appBundleId;
        let appName;


        it("install app", async () => {
            let device = (await DeviceController.getDevices(deviceQuery))[0];
            if (!device) {
                deviceQuery.status = Status.SHUTDOWN;
                device = (await DeviceController.getDevices(deviceQuery))[0];
                device = await IOSController.startSimulator(device);
            }
            await IOSController.installApp(device, appToInstall);
            let startAppResult = await IOSController.startApplication(device, appToInstall);
            await IOSController.stopApplication(device, appBundleId, appName);
            let uninstallApp = await IOSController.uninstallApp(device, appToInstall, appBundleId);
            let apps = await IOSController.getInstalledApps(device);
            assert.isTrue(!apps.some(app => app.includes(appName)));

            await IOSController.installApp(device, appToInstall);
            await IOSController.installApp(device, appToInstall);
            apps = await IOSController.getInstalledApps(device);
            startAppResult = await IOSController.startApplication(device, appToInstall);
            assert.isTrue(startAppResult.result);
            await IOSController.stopApplication(device, appBundleId, appName);
        });
    });
})