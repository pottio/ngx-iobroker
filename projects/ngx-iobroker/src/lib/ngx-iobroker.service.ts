import { Injectable, InjectionToken, inject } from '@angular/core';
import { IoBrokerHistoryConfig, IoBrokerHistoryConfigResult, IoBrokerWsConfiguration } from './models';
import { Connection, PROGRESS, SystemConfig } from '@iobroker/socket-client';
import '@iobroker/types';
import { BehaviorSubject, Observable, Subject, filter, from, map } from 'rxjs';

export const ioBrokerWsConfigurationToken = new InjectionToken<IoBrokerWsConfiguration>('ioBrokerWsConfigurationToken');

@Injectable({
  providedIn: 'root',
})
export class IoBrokerWsService {
  private _defaultHistoryAdapter = 'history.0';
  private _config = inject(ioBrokerWsConfigurationToken);

  private readonly _connection: Connection;

  private _connected: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _connectionProgress: BehaviorSubject<PROGRESS> = new BehaviorSubject<PROGRESS>(PROGRESS.CONNECTING);

  private _objectChanged: Subject<{ id: string; object: ioBroker.Object | null | undefined }> = new Subject<{ id: string; object: ioBroker.Object | null | undefined }>();
  private _stateChanged: Subject<{ id: string; state: ioBroker.State | null | undefined }> = new Subject<{ id: string; state: ioBroker.State | null | undefined }>();

  /**
   * Returns the connection object from the ioBroker socker client. Can be used if functions are missing in the wrapper service.
   *
   * See ioBroker documentation for supported methods: {@link https://github.com/ioBroker/ioBroker.socket-classes#web-methods}
   *
   * @returns The connection object
   */
  public get connection(): Connection {
    return this._connection;
  }

  /**
   * Observes connection state.
   */
  public readonly connected$ = this._connected.asObservable();
  /**
   * Observes connection progress.
   */
  public readonly connectionProgress$ = this._connectionProgress.asObservable();
  /**
   * Observes all object changes. Call `listenObjectChanges` to add object IDs
   */
  public readonly objectChanged$ = this._objectChanged.asObservable();
  /**
   * Observes all state changes. Call `listenStateChanges` to add object IDs
   */
  public readonly stateChanged$ = this._stateChanged.asObservable();

  constructor() {
    this._connection = this.createConnection();
    this.initAsync();
  }

  /**
   * Adds subscription for given object id
   *
   * @param id - The object id
   */
  public listenObjectChanges(id: string): void {
    this._connection.subscribeObject(id, (id: string, obj: ioBroker.Object | null | undefined) => {
      this._objectChanged.next({ id, object: obj });
    });
  }

  /**
   * Adds subscription for given state id
   *
   * @param id - The state id
   */
  public listenStateChanges(id: string): void {
    this._connection.subscribeState(id, (id: string, state: ioBroker.State | null | undefined) => {
      this._stateChanged.next({ id, state });
    });
  }

  /**
   * Observes object changes of single object
   *
   * @param id - The object id
   */
  public objectChangedFilterBy(id: string): Observable<ioBroker.Object | null | undefined> {
    return this.objectChanged$.pipe(
      filter((value) => value.id === id),
      map((value) => value.object),
    );
  }

  /**
   * Observes state changes of single state
   *
   * @param id - The state id
   */
  public stateChangedFilterBy(id: string): Observable<ioBroker.State | null | undefined> {
    return this.stateChanged$.pipe(
      filter((value) => value.id === id),
      map((value) => value.state),
    );
  }

  /**
   * Gets the system configuration.
   *
   * @param compact - Flag for detailed or compact result
   * @returns The system configuration
   */
  public getSystemConfig(compact: boolean): Observable<SystemConfig> {
    return from(compact ? this._connection.getCompactSystemConfig() : this._connection.getSystemConfig());
  }

  /**
   * Get all enums with the given name.
   *
   * @param _enum - The name of the enum, like `rooms` or `functions`
   * @returns The enums
   */
  public getEnums(_enum?: string): Observable<Record<string, ioBroker.EnumObject>> {
    return from(this._connection.getEnums(_enum));
  }

  /**
   * Get the list of all groups.
   *
   * @returns The list of groups
   */
  public getGroups(): Observable<ioBroker.GroupObject[]> {
    return from(this._connection.getGroups());
  }

  /**
   * Get the history of a given state.
   *
   * @param id - The state ID
   * @param options - The history parameters
   * @retuns The historical states
   */
  public getHistory(id: string, options: ioBroker.GetHistoryOptions): Observable<ioBroker.GetHistoryResult> {
    return from(this._connection.getHistory(id, options));
  }

  /**
   * Returns the history configuration for all data points with enabled history.
   *
   * This function calls sendTo command `getEnabledDPs`.
   * See ioBroker documentation for details: {@link https://github.com/ioBroker/ioBroker.history/blob/master/docs/de/README.md#liste-aktivierter-datenpunkte-aufrufen}
   *
   * @param historyAdapter - Optional overwriting of the configured history adapter
   * @returns The history configurations
   */
  public getHistoryConfigurations(historyAdapter?: string): Observable<Record<string, Partial<IoBrokerHistoryConfig>>> {
    return from(this._connection.sendTo(historyAdapter ?? this._config.historyAdapter ?? this._defaultHistoryAdapter, 'getEnabledDPs'));
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
  public enableHistoryForDataPoint(id: string, config: Partial<IoBrokerHistoryConfig>, historyAdapter?: string): Observable<IoBrokerHistoryConfigResult> {
    return from(
      this._connection.sendTo(historyAdapter ?? this._config.historyAdapter ?? this._defaultHistoryAdapter, 'enableHistory', {
        id,
        options: config,
      }),
    );
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
  public disableHistoryForDataPoint(id: string, historyAdapter?: string): Observable<IoBrokerHistoryConfigResult> {
    return from(
      this._connection.sendTo(historyAdapter ?? this._config.historyAdapter ?? this._defaultHistoryAdapter, 'disableHistory', {
        id,
      }),
    );
  }

  /**
   * Gets the object with the given id from the server.
   *
   * @param id - The object ID
   * @returns The object
   */
  public getObject(id: string): Observable<ioBroker.Object | null | undefined> {
    return from(this._connection.getObject(id));
  }

  /**
   * Gets all objects.
   *
   * @returns The objects
   */
  public getObjects(): Observable<Record<string, ioBroker.Object>> {
    return from(this._connection.getObjects());
  }

  /**
   * Gets the given state.
   *
   * @param id - The state ID
   * @returns The state
   */
  public getState(id: string): Observable<ioBroker.State | null | undefined> {
    return from(this._connection.getState(id));
  }

  /**
   * Gets all states.
   *
   * @param pattern - Pattern of states or array of IDs
   * @returns The states
   */
  public getStates(pattern?: string | string[]): Observable<Record<string, ioBroker.State>> {
    return from(this._connection.getStates(pattern));
  }

  /**
   * Sets the given state value.
   *
   * @param id - The state ID
   * @param value - The state value
   * @param ack - Optional acknowledgement flag
   */
  public setState(id: string, value: ioBroker.StateValue, ack?: boolean): void {
    this._connection.setState(id, value, ack);
  }

  /**
   * Sends log to ioBroker log.
   *
   * @param text - Log text
   * @param level - Log level
   */
  public log(text: string, level: 'info' | 'debug' | 'warn' | 'error' | 'silly'): void {
    this._connection.log(text, level);
  }

  /**
   * Sends a message to a specific instance or all instances of some specific adapter.
   *
   * @param instance - The instance to send this message to
   * @param command - The command name of the target instance
   * @param data - The message data to send
   */
  public sendTo(instance: string, command: string, data?: any): void {
    this._connection.sendTo(instance, command, data);
  }

  private createConnection(): Connection {
    const clientName = this._config.clientName.length <= 0 ? `ngx-iobroker.client${Math.floor(Math.random() * 500)}` : this._config.clientName;
    const host = `${this._config.hostnameOrIp}:${this._config.port}`;
    const authParams = this._config.credentials ? `key=nokey&user=${this._config.credentials?.user}&pass=${this._config.credentials?.password}&` : '';
    const configParams = `EIO=3&transport=websocket`;

    const connection = new Connection({
      name: clientName,
      host: `${host}/?${authParams}${configParams}`,
      protocol: this.getProtocol(),
      onProgress: (progress: PROGRESS) => this.callbackOnProgress(progress),
      onReady: (objects: Record<string, ioBroker.Object>) => this.callbackOnReady(objects),
      onObjectChange: (id: string, obj: ioBroker.Object | null | undefined) => this.callbackOnObjectChange(id, obj),
    });

    connection.registerConnectionHandler((connected: boolean) => this.callbackOnConnectionChanged(connected));

    return connection;
  }

  private callbackOnProgress(progress: PROGRESS): void {
    this._connectionProgress.next(progress);
  }

  private callbackOnReady(objects: Record<string, ioBroker.Object>): void {
    if (this._config.autoSubscribes) {
      this._config.autoSubscribes.forEach((id: string) => {
        this.listenStateChanges(id);
      });
    }
  }

  private callbackOnObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    this._objectChanged.next({ id, object: obj });
  }

  private callbackOnConnectionChanged(connected: boolean): void {
    this._connected.next(connected);
  }

  private getProtocol(): string {
    return `http${this._config.secureConnection ? 's' : ''}`;
  }

  private async initAsync(): Promise<void> {
    if (this._config.autoLoadScriptOnInit) {
      this.loadIoBrokerWsScript();
    }

    const success = await this.waitForIoBrokerWsScriptLoadedAsync(3000);

    if (!success) {
      console.error(
        this._config.autoLoadScriptOnInit
          ? 'Script cant be loaded. Make sure hostname/ip, port and secure settings are correctly.'
          : 'Script cant be loaded. Make sure script is attached in index.html head correctly.',
      );
    }
  }

  private loadIoBrokerWsScript(): void {
    const node = document.createElement('script');
    node.src = `${this.getProtocol()}://${this._config.hostnameOrIp}:${this._config.port}/socket.io/socket.io.js`;
    node.type = 'text/javascript';
    node.async = true;
    document.getElementsByTagName('head')[0].appendChild(node);
  }

  private async waitForIoBrokerWsScriptLoadedAsync(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let currentMs = 0;
      const interval = setInterval(() => {
        try {
          //@ts-expect-error Will access to window.io after script loaded
          if (io) {
            clearInterval(interval);
            resolve(true);
          }
        } catch (_) {
          currentMs += 10;
          if (currentMs >= timeoutMs) {
            resolve(false);
          }
        }
      }, 10);
    });
  }
}
