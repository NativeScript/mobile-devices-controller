import { IDevice } from "./device";
export declare class DeviceManager {
    static getAllDevices(platform: "android" | "ios", name?: string): Promise<any>;
    static startDevice(device: IDevice, options?: any): Promise<IDevice>;
    static kill(device: IDevice): Promise<void>;
    static killAll(type: "simulator" | "emulator"): void;
}
