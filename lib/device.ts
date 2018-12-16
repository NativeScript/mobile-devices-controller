import { Status, DeviceType, Platform } from "./enums";
import { ChildProcess } from "child_process";

export interface IDevice {
  name?: string,
  token?: string,
  type?: DeviceType,
  platform?: Platform,
  status?: Status,
  startedAt?: number,
  busySince?: number,
  pid?: number,
  apiLevel?: string,
  info?: string,
  config?: any,
  process?: ChildProcess;
  parentProcessPid?: number;
}

export class Device implements IDevice {
  private _startedAt?: number;
  private _busySince?: number;
  private _info?: string;
  private _config?: any;

  constructor(private _name?: any,
    private _apiLevel?: string,
    private _type?: DeviceType,
    private _platform?: Platform,
    private _token?: string,
    private _status?: Status,
    private _pid?) {
    this._startedAt = -1;
    this._busySince = -1;
  }

  process?: ChildProcess;
  parentProcessPid?: number;

  get name() {
    return this._name;
  }

  set name(name) {
    this._name = name;
  }

  set apiLevel(api) {
    this._apiLevel = api;
  }

  get apiLevel() {
    return this._apiLevel;
  }

  set token(token) {
    this._token = token;
  }

  get token() {
    return this._token;
  }

  set type(type) {
    this._type = type;
  }

  get type() {
    return this._type;
  }

  get platform() {
    return this._platform;
  }

  set platform(platform) {
    this._platform = platform;
  }

  set pid(pid) {
    this._pid = pid;
  }

  get pid() {
    return this._pid;
  }

  get status() {
    return this._status;
  }

  set status(status: Status) {
    this._status = status;
  }

  get startedAt() {
    return this._startedAt;
  }

  set startedAt(startedAt) {
    this._startedAt = startedAt;
  }

  get busySince() {
    return this._busySince;
  }

  set busySince(busySince) {
    this._busySince = busySince;
  }

  get info() {
    return this._info;
  }

  set info(info) {
    this._info = info;
  }

  get config() {
    return this._config;
  }

  set config(config) {
    this._config = config;
  }

  public toJson() {
    return {
      name: this.name,
      token: this.token,
      type: this.type,
      platform: this.platform,
      info: this.info,
      config: this.config,
      status: this.status,
      startedAt: this.startedAt,
      pid: this.pid,
      apiLevel: this.apiLevel,
      parentProcessPid: this.apiLevel
    }
  }

  public toString() {
    return "" +
      "name " + this.name +
      "; token " + this.token +
      "; type " + this.type +
      "; platform " + this.platform +
      "; info " + this.info +
      "; config " + this.config +
      "; status " + this.status +
      "; startedAt " + this.startedAt +
      "; pid " + this.pid +
      "; apiLevel " + this.apiLevel;
  }
}

// export function toString(device:IDevice) {
//   return "" +
//     "name " + this.name +
//     "; token " + this.token +
//     "; type " + this.type +
//     "; platform " + this.platform +
//     "; info " + this.info +
//     "; config " + this.config +
//     "; status " + this.status +
//     "; startedAt" + this.startedAt +
//     "; pid" + this.pid +
//     "; apiLevel" + this.apiLevel;
// }

