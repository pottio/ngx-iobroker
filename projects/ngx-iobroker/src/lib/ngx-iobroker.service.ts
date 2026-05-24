import { inject, Injectable, InjectionToken } from '@angular/core';
import '@iobroker/types';
import { Subject } from 'rxjs';
import { CallbackRequestError, IoBrokerWebSocketClient } from './client/ioBrokerWebSocketClient';
import { IoBrokerHistoryConfig, IoBrokerHistoryConfigResult, IoBrokerWebSocketConfiguration } from './models';

export const ioBrokerWebSocketConfigurationToken = new InjectionToken<IoBrokerWebSocketConfiguration>('ioBrokerWebSocketConfigurationToken');

@Injectable({
  providedIn: 'root',
})
export class IoBrokerWebSocketService {
  private _defaultHistoryAdapter = 'history.0';
  private _config = inject(ioBrokerWebSocketConfigurationToken);
  private readonly _socketClient = inject(IoBrokerWebSocketClient);
  private readonly _stateChanged: Subject<{ id: string; state: ioBroker.State | null }> = new Subject<{
    id: string;
    state: ioBroker.State | null;
  }>();
  private readonly _objectChanged: Subject<{ id: string; object: ioBroker.Object | null }> = new Subject<{
    id: string;
    object: ioBroker.Object | null;
  }>();

  ready$ = this._socketClient.ready$;
  connectionState$ = this._socketClient.connectionState$;
  errors$ = this._socketClient.errors$;

  stateChanged$ = this._stateChanged.asObservable();
  objectChanged$ = this._objectChanged.asObservable();

  constructor() {
    this.initEventListeners();
  }

  private initEventListeners(): void {
    this._socketClient.on('stateChange', (payload) => {
      const [id, state]: [string, ioBroker.State] = payload;
      if (id && state) {
        this._stateChanged.next({ id, state });
      }
    });
    this._socketClient.on('objectChange', (payload) => {
      const [id, obj]: [string, ioBroker.Object] = payload;
      if (id && obj) {
        this._objectChanged.next({ id, object: obj });
      }
    });
  }

  private async sendCallbackResult<T>(command: string, args: any[]): Promise<T | null> {
    try {
      const result = await this._socketClient.sendCallbackRequest<[CallbackRequestError, T]>(command, args);
      return result[1] ?? null;
    } catch (_) {
      return null;
    }
  }

  private async sendCallbackResultArray<T extends any[]>(command: string, args: any[]): Promise<T | null> {
    try {
      return await this._socketClient.sendCallbackRequest<T>(command, args);
    } catch (_) {
      return null;
    }
  }

  private async sendCommand(command: string, args: any[]): Promise<void> {
    await this._socketClient.sendCallbackRequest<[CallbackRequestError]>(command, args);
  }

  /*
   * CONNECTION MANAGEMENT
   */

  async connect(): Promise<void> {
    const clientName = this._config.clientName.length <= 0 ? `ngx-iobroker.client${Math.floor(Math.random() * 500)}` : this._config.clientName;
    return await this._socketClient.connect({
      host: this._config.hostnameOrIp,
      port: this._config.port,
      useSSL: this._config.secureConnection ?? false,
      username: this._config.credentials?.user,
      password: this._config.credentials?.password,
      name: clientName,
    });
  }

  async disconnect(): Promise<void> {
    return this._socketClient.disconnect();
  }

  /*
   * COMMANDS AND CALLBACK REQUESTS
   */

  /**
   * Authenticate the user with the ioBroker server.
   *
   * @returns The current authentication state.
   */
  async authenticate(): Promise<{ isUserAuthenticated: boolean; isAuthenticationUsed: boolean } | null> {
    const result = await this.sendCallbackResultArray<[boolean, boolean]>('authenticate', []);
    if (!result) {
      return null;
    }
    return {
      isUserAuthenticated: result[0],
      isAuthenticationUsed: result[1],
    };
  }

  /**
   * Update the token expiration on the ioBroker server.
   *
   * @param accessToken - The new access token.
   * @returns True when the token expiration was updated successfully, otherwise null.
   */
  async updateTokenExpiration(accessToken: string): Promise<boolean | null> {
    return this.sendCallbackResult<boolean | null>('updateTokenExpiration', [accessToken]);
  }

  /**
   * Write an error entry into the ioBroker log.
   *
   * @param error - Error message or Error object.
   * @returns A promise that resolves when the log entry has been sent.
   */
  async error(error: Error | string): Promise<void> {
    await this.sendCommand('error', [error]);
  }

  /**
   * Write a log entry into the ioBroker log.
   *
   * @param text - Log text.
   * @param level - Log level, defaults to 'debug'.
   * @returns A promise that resolves when the log entry has been sent.
   */
  async log(text: string, level: ioBroker.LogLevel = 'debug'): Promise<void> {
    await this.sendCommand('log', [text, level]);
  }

  /**
   * Check whether a feature is supported by the current js-controller.
   *
   * @param feature - Feature name.
   * @returns True if the feature is supported, otherwise null.
   */
  async checkFeatureSupported(feature: string): Promise<boolean | null> {
    return this.sendCallbackResult<boolean | null>('checkFeatureSupported', [feature]);
  }

  /**
   * Get history data for a specific state.
   *
   * @param id - Object or state ID.
   * @param options - History query options.
   * @returns The history result or null.
   */
  async getHistory(id: string, options: ioBroker.GetHistoryOptions): Promise<ioBroker.GetHistoryResult | null> {
    return this.sendCallbackResult<ioBroker.GetHistoryResult | null>('getHistory', [id, options]);
  }

  /**
   * Perform an HTTP GET request from the server side.
   *
   * @param url - URL to fetch.
   * @returns The HTTP response status, statusText and body data or null.
   */
  async httpGet(url: string): Promise<{ status: number; statusText: string; data: string } | null> {
    return this.sendCallbackResult<{ status: number; statusText: string; data: string } | null>('httpGet', [url]);
  }

  /**
   * Send a message to a specific adapter instance.
   *
   * @param adapterInstance - Target instance name.
   * @param command - Command name.
   * @param data - Optional payload.
   * @returns The adapter response or null.
   */
  async sendTo(adapterInstance: string, command: string, data?: any): Promise<any | null> {
    return this.sendCallbackResult<any | null>('sendTo', [adapterInstance, command, data]);
  }

  /**
   * Send a message to a specific host.
   *
   * @param host - Host name.
   * @param command - Host command.
   * @param data - Command-specific payload.
   * @returns The host result or null.
   */
  async sendToHost(host: string, command: string, data?: any): Promise<{ error?: string; result?: any } | null> {
    return this.sendCallbackResult<{ error?: string; result?: any } | null>('sendToHost', [host, command, data]);
  }

  /**
   * Ask the server if authentication is enabled and whether the user is authenticated.
   *
   * @returns The authentication state or null.
   */
  async authEnabled(): Promise<{
    isUserAuthenticated: boolean | Error | string;
    isAuthenticationUsed: boolean;
  } | null> {
    const result = await this.sendCallbackResultArray<[boolean | Error | string, boolean]>('authEnabled', []);
    if (!result) {
      return null;
    }
    return {
      isUserAuthenticated: result[0],
      isAuthenticationUsed: result[1],
    };
  }

  /**
   * Logout the current user.
   *
   * @returns A promise that resolves when logout is complete.
   */
  async logout(): Promise<void> {
    await this.sendCommand('logout', []);
  }

  /**
   * List available permissions and commands.
   *
   * @returns A permissions map or null.
   */
  async listPermissions(): Promise<Record<string, { type: 'object' | 'state' | 'users' | 'other' | 'file' | ''; operation: any }> | null> {
    return this.sendCallbackResult<Record<string, { type: 'object' | 'state' | 'users' | 'other' | 'file' | ''; operation: any }> | null>('listPermissions', []);
  }

  /**
   * Get the permissions of the current user.
   *
   * @returns The user's permission map or null.
   */
  async getUserPermissions(): Promise<Record<string, any> | null> {
    return this.sendCallbackResult<Record<string, any> | null>('getUserPermissions', []);
  }

  /**
   * Get the adapter version and its name.
   *
   * @returns The adapter version and name or null.
   */
  async getVersion(): Promise<{ version: string | undefined; adapterName: string } | null> {
    const result = await this.sendCallbackResultArray<[CallbackRequestError, string | undefined, string]>('getVersion', []);
    if (!result) {
      return null;
    }
    return { version: result[1] ?? undefined, adapterName: result[2] };
  }

  /**
   * Get the adapter name.
   *
   * @returns The adapter name or null.
   */
  async getAdapterName(): Promise<string | null> {
    return this.sendCallbackResult<string | null>('getAdapterName', []);
  }

  /**
   * Subscribe to messages from another instance.
   *
   * @param targetInstance - The target instance name.
   * @param messageType - The message type.
   * @param data - Optional payload.
   * @returns The subscription result or null.
   */
  async clientSubscribe(targetInstance: string, messageType: string, data: any): Promise<{ accepted: boolean; heartbeat?: number; error?: string } | null> {
    return this.sendCallbackResult<{ accepted: boolean; heartbeat?: number; error?: string } | null>('clientSubscribe', [targetInstance, messageType, data]);
  }

  /**
   * Unsubscribe from messages from another instance.
   *
   * @param targetInstance - The target instance name.
   * @param messageType - The message type.
   * @returns A promise that resolves when the unsubscribe request is sent.
   */
  async clientUnsubscribe(targetInstance: string, messageType: string): Promise<void> {
    await this.sendCommand('clientUnsubscribe', [targetInstance, messageType]);
  }

  /**
   * Get a compact copy of the system configuration.
   *
   * @returns The compact system configuration or null.
   */
  async getCompactSystemConfig(): Promise<{
    common: ioBroker.SystemConfigCommon;
    native?: { secret: string; vendor?: any };
  } | null> {
    return this.sendCallbackResult<{
      common: ioBroker.SystemConfigCommon;
      native?: { secret: string; vendor?: any };
    } | null>('getCompactSystemConfig', []);
  }

  /**
   * Get adapter instances by adapter name.
   *
   * @param adapterName - Optional adapter name.
   * @returns The list of adapter instances or null.
   */
  async getAdapterInstances(adapterName?: string): Promise<ioBroker.InstanceObject[] | null> {
    return this.sendCallbackResult<ioBroker.InstanceObject[] | null>('getAdapterInstances', [adapterName]);
  }

  /**
   * Get an object by ID.
   *
   * @param id - Object ID.
   * @returns The found object or null.
   */
  async getObject(id: string): Promise<ioBroker.Object | null> {
    return this.sendCallbackResult<ioBroker.Object | null>('getObject', [id]);
  }

  /**
   * Get several objects by IDs or all relevant web objects.
   *
   * @param list - Optional list of object IDs.
   * @returns The object map or null.
   */
  async getObjects(list: string[] | null = null): Promise<Record<string, ioBroker.Object> | null> {
    return this.sendCallbackResult<Record<string, ioBroker.Object> | null>('getObjects', [list]);
  }

  /**
   * Get all relevant objects for the web client.
   *
   * @returns The object map or null.
   */
  async getAllObjects(): Promise<Record<string, ioBroker.Object> | null> {
    return this.sendCallbackResult<Record<string, ioBroker.Object> | null>('getAllObjects', []);
  }

  /**
   * Subscribe to object changes by pattern.
   *
   * @param pattern - Object pattern or list of object IDs.
   * @returns A promise that resolves when the subscription request is sent.
   */
  async subscribeObjects(pattern: string | string[]): Promise<void> {
    await this.sendCommand('subscribeObjects', [pattern]);
  }

  /**
   * Unsubscribe from object changes by pattern.
   *
   * @param pattern - Object pattern or list of object IDs.
   * @returns A promise that resolves when the unsubscribe request is sent.
   */
  async unsubscribeObjects(pattern: string | string[]): Promise<void> {
    await this.sendCommand('unsubscribeObjects', [pattern]);
  }

  /**
   * Query objects using a view.
   *
   * @param design - Design name.
   * @param search - Search name.
   * @param params - Query parameters.
   * @returns The view rows or null.
   */
  async getObjectView(
    design: string,
    search: string,
    params: { startkey?: string; endkey?: string; depth?: number },
  ): Promise<{
    rows: Array<{ id: string; value: ioBroker.Object & { virtual: boolean; hasChildren: number } }>;
  } | null> {
    return this.sendCallbackResult<{
      rows: Array<{ id: string; value: ioBroker.Object & { virtual: boolean; hasChildren: number } }>;
    } | null>('getObjectView', [design, search, params]);
  }

  /**
   * Create or update an object.
   *
   * @param id - Object ID.
   * @param obj - Object definition.
   * @returns A promise that resolves when the object is set.
   */
  async setObject(id: string, obj: ioBroker.Object): Promise<void> {
    await this.sendCommand('setObject', [id, obj]);
  }

  /**
   * Delete an object.
   *
   * @param id - Object ID.
   * @param _options - Optional delete options.
   * @returns A promise that resolves when the object is deleted.
   */
  async delObject(id: string, _options?: any): Promise<void> {
    await this.sendCommand('delObject', [id, _options]);
  }

  /**
   * Get states by pattern for the current adapter.
   *
   * @param pattern - Optional state pattern or list of state IDs.
   * @returns The state map or null.
   */
  async getStates(pattern?: string | string[]): Promise<Record<string, ioBroker.State> | null> {
    return this.sendCallbackResult<Record<string, ioBroker.State> | null>('getStates', [pattern]);
  }

  /**
   * Get foreign states by pattern.
   *
   * @param pattern - State pattern or list of state IDs.
   * @returns The state map or null.
   */
  async getForeignStates(pattern: string | string[]): Promise<Record<string, ioBroker.State> | null> {
    return this.sendCallbackResult<Record<string, ioBroker.State> | null>('getForeignStates', [pattern]);
  }

  /**
   * Get a state by ID.
   *
   * @param id - State ID.
   * @returns The state object or null.
   */
  async getState(id: string): Promise<ioBroker.State | null> {
    return this.sendCallbackResult<ioBroker.State | null>('getState', [id]);
  }

  /**
   * Set a state by ID.
   *
   * @param id - State ID.
   * @param state - State value or object.
   * @returns The updated state or null.
   */
  async setState(id: string, state: ioBroker.SettableState): Promise<ioBroker.State | null> {
    return this.sendCallbackResult<ioBroker.State | null>('setState', [id, state]);
  }

  /**
   * Get a binary state by ID.
   *
   * @param id - State ID.
   * @returns The base64 binary state or null.
   */
  async getBinaryState(id: string): Promise<string | null> {
    return this.sendCallbackResult<string | null>('getBinaryState', [id]);
  }

  /**
   * Set a binary state by ID.
   *
   * @param id - State ID.
   * @param base64 - Base64 encoded content.
   * @returns A promise that resolves when the binary state is set.
   */
  async setBinaryState(id: string, base64: string): Promise<void> {
    await this.sendCommand('setBinaryState', [id, base64]);
  }

  /**
   * Subscribe to state changes by pattern.
   *
   * @param pattern - State pattern or list of state IDs.
   * @returns A promise that resolves when subscription is requested.
   */
  async subscribe(pattern: string | string[]): Promise<void> {
    await this.sendCommand('subscribe', [pattern]);
  }

  /**
   * Subscribe to state changes by pattern (alias).
   *
   * @param pattern - State pattern or list of state IDs.
   * @returns A promise that resolves when subscription is requested.
   */
  async subscribeStates(pattern: string | string[]): Promise<void> {
    await this.sendCommand('subscribeStates', [pattern]);
  }

  /**
   * Unsubscribe from state changes by pattern.
   *
   * @param pattern - State pattern or list of state IDs.
   * @returns A promise that resolves when unsubscription is requested.
   */
  async unsubscribe(pattern: string | string[]): Promise<void> {
    await this.sendCommand('unsubscribe', [pattern]);
  }

  /**
   * Unsubscribe from state changes by pattern (alias).
   *
   * @param pattern - State pattern or list of state IDs.
   * @returns A promise that resolves when unsubscription is requested.
   */
  async unsubscribeStates(pattern: string | string[]): Promise<void> {
    await this.sendCommand('unsubscribeStates', [pattern]);
  }

  /**
   * Read a file from the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param fileName - File name.
   * @returns The file content and MIME type or null.
   */
  async readFile(adapter: string, fileName: string): Promise<{ data: string | ArrayBuffer | null; mimeType: string } | null> {
    const result = await this.sendCallbackResultArray<[any, string | ArrayBuffer, string]>('readFile', [adapter, fileName]);
    if (!result) {
      return null;
    }
    return { data: result[1], mimeType: result[2] };
  }

  /**
   * Read a file from the ioBroker DB as base64.
   *
   * @param adapter - Adapter instance name.
   * @param fileName - File name.
   * @returns The file content as base64 and MIME type or null.
   */
  async readFile64(adapter: string, fileName: string): Promise<{ base64: string | null; mimeType?: string | null } | null> {
    const result = await this.sendCallbackResultArray<[any, string | null, string | null]>('readFile64', [adapter, fileName]);
    if (!result) {
      return null;
    }
    return { base64: result[1], mimeType: result[2] };
  }

  /**
   * Write a file into the ioBroker DB as base64.
   *
   * @param adapter - Adapter instance name.
   * @param fileName - File name.
   * @param data64 - File content as base64.
   * @param options - Optional mode options.
   * @returns A promise that resolves when the file is written.
   */
  async writeFile64(adapter: string, fileName: string, data64: string, options?: { mode?: number }): Promise<void> {
    await this.sendCommand('writeFile64', [adapter, fileName, data64, options]);
  }

  /**
   * Write a file into the ioBroker DB as text.
   *
   * @param adapter - Adapter instance name.
   * @param fileName - File name.
   * @param data - File content as text.
   * @param options - Optional mode options.
   * @returns A promise that resolves when the file is written.
   */
  async writeFile(adapter: string, fileName: string, data: string, options?: { mode?: number }): Promise<void> {
    await this.sendCommand('writeFile', [adapter, fileName, data, options]);
  }

  /**
   * Delete a file in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param name - File name.
   * @returns A promise that resolves when the file is deleted.
   */
  async unlink(adapter: string, name: string): Promise<void> {
    await this.sendCommand('unlink', [adapter, name]);
  }

  /**
   * Delete a file in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param name - File name.
   * @returns A promise that resolves when the file is deleted.
   */
  async deleteFile(adapter: string, name: string): Promise<void> {
    await this.sendCommand('deleteFile', [adapter, name]);
  }

  /**
   * Delete a folder in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param name - Folder name.
   * @returns A promise that resolves when the folder is deleted.
   */
  async deleteFolder(adapter: string, name: string): Promise<void> {
    await this.sendCommand('deleteFolder', [adapter, name]);
  }

  /**
   * Rename a file in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param oldName - Current file name.
   * @param newName - New file name.
   * @returns A promise that resolves when the file is renamed.
   */
  async renameFile(adapter: string, oldName: string, newName: string): Promise<void> {
    await this.sendCommand('renameFile', [adapter, oldName, newName]);
  }

  /**
   * Rename a file or folder in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param oldName - Current name.
   * @param newName - New name.
   * @returns A promise that resolves when the rename is complete.
   */
  async rename(adapter: string, oldName: string, newName: string): Promise<void> {
    await this.sendCommand('rename', [adapter, oldName, newName]);
  }

  /**
   * Create a folder in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param dirName - Desired folder name.
   * @returns A promise that resolves when the folder is created.
   */
  async mkdir(adapter: string, dirName: string): Promise<void> {
    await this.sendCommand('mkdir', [adapter, dirName]);
  }

  /**
   * Read the content of a folder in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param dirName - Folder name.
   * @param options - Optional read options.
   * @returns The folder contents or null.
   */
  async readDir(adapter: string, dirName: string, options?: any): Promise<ioBroker.ReadDirResult[] | null> {
    return this.sendCallbackResult<ioBroker.ReadDirResult[] | null>('readDir', [adapter, dirName, options]);
  }

  /**
   * Change the mode of a file in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param fileName - File name.
   * @param options - Mode options.
   * @returns A promise that resolves when the mode is changed.
   */
  async chmodFile(adapter: string, fileName: string, options?: { mode?: number }): Promise<void> {
    await this.sendCommand('chmodFile', [adapter, fileName, options]);
  }

  /**
   * Change file owner in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param fileName - File name.
   * @param options - Owner information or owner string.
   * @returns A promise that resolves when ownership is changed.
   */
  async chownFile(adapter: string, fileName: string, options: { owner: string; ownerGroup?: string } | string): Promise<void> {
    await this.sendCommand('chownFile', [adapter, fileName, options]);
  }

  /**
   * Check whether a file or folder exists in the ioBroker DB.
   *
   * @param adapter - Adapter instance name.
   * @param fileName - File or folder name.
   * @returns True if the item exists, otherwise null.
   */
  async fileExists(adapter: string, fileName: string): Promise<boolean | null> {
    return this.sendCallbackResult<boolean | null>('fileExists', [adapter, fileName]);
  }

  /**
   * Subscribe to file changes in the ioBroker DB.
   *
   * @param id - Instance name or meta object ID.
   * @param pattern - File name pattern or list of patterns.
   * @returns A promise that resolves when the subscription is requested.
   */
  async subscribeFiles(id: string, pattern: string | string[]): Promise<void> {
    await this.sendCommand('subscribeFiles', [id, pattern]);
  }

  /**
   * Unsubscribe from file changes in the ioBroker DB.
   *
   * @param id - Instance name or meta object ID.
   * @param pattern - File name pattern or list of patterns.
   * @returns A promise that resolves when the unsubscription is requested.
   */
  async unsubscribeFiles(id: string, pattern: string | string[]): Promise<void> {
    await this.sendCommand('unsubscribeFiles', [id, pattern]);
  }

  /*
   * ADDITIONAL HISTORY COMMANDS
   */

  /**
   * Returns the history configuration for all data points with enabled history.
   *
   * This function calls sendTo command `getEnabledDPs`.
   * See ioBroker documentation for details: {@link https://github.com/ioBroker/ioBroker.history/blob/master/docs/de/README.md#liste-aktivierter-datenpunkte-aufrufen}
   *
   * @param historyAdapter - Optional overwriting of the configured history adapter
   * @returns The history configurations
   */
  public getHistoryConfigurations(historyAdapter?: string): Promise<Record<string, Partial<IoBrokerHistoryConfig>>> {
    const historyAdapterToUse = historyAdapter ?? this._config.historyAdapter ?? this._defaultHistoryAdapter;
    return this.sendCallbackResult<any | null>('sendTo', [historyAdapterToUse, 'getEnabledDPs']);
  }

  /**
   * Enables the history recording for a data point.
   *
   * This function calls sendTo command `enableHistory`.
   * See ioBroker documentation for details: {@link https://github.com/ioBroker/ioBroker.history/blob/master/docs/de/README.md#aktivieren}
   *
   * @param id - Data point ID
   * @param config - History recording configuration
   * @param historyAdapter - Optional overwriting of the configured history adapter
   * @returns The result of the operation
   */
  public enableHistoryForDataPoint(id: string, config: Partial<IoBrokerHistoryConfig>, historyAdapter?: string): Promise<IoBrokerHistoryConfigResult> {
    const historyAdapterToUse = historyAdapter ?? this._config.historyAdapter ?? this._defaultHistoryAdapter;
    return this.sendCallbackResult<any | null>('sendTo', [
      historyAdapterToUse,
      'enableHistory',
      {
        id,
        options: config,
      },
    ]);
  }

  /**
   * Disables the history recording for a data point.
   *
   * This function calls sendTo command `disableHistory`.
   * See ioBroker documentation for details: {@link https://github.com/ioBroker/ioBroker.history/blob/master/docs/de/README.md#deaktivieren}
   *
   * @param id - Data point ID
   * @param historyAdapter - Optional overwriting of the configured history adapter
   * @returns The result of the operation
   */
  public disableHistoryForDataPoint(id: string, historyAdapter?: string): Promise<IoBrokerHistoryConfigResult> {
    const historyAdapterToUse = historyAdapter ?? this._config.historyAdapter ?? this._defaultHistoryAdapter;
    return this.sendCallbackResult<any | null>('sendTo', [
      historyAdapterToUse,
      'disableHistory',
      {
        id,
      },
    ]);
  }
}
