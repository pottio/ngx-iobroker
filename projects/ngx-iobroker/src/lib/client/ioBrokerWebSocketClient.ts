import { Injectable, OnDestroy } from '@angular/core';
import '@iobroker/types';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

interface IoBrokerConnectOptions {
  host?: string;
  port?: number | string;
  useSSL?: boolean;
  username?: string;
  password?: string;
  name?: string;
  pingInterval?: number;
  connectTimeout?: number;
}

export type CallbackRequestError = Error | string | null | undefined;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface IoBrokerCallbackRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  name: string;
}

interface IoBrokerSubscription {
  callback: (payload: any) => void;
  pattern: RegExp | null;
}

const MESSAGE_TYPES = {
  MESSAGE: 0,
  PING: 1,
  PONG: 2,
  CALLBACK: 3,
};

const DEFAULT_PING_INTERVAL = 5000;
const DEFAULT_CONNECT_TIMEOUT = 15000;
const DEFAULT_TOKEN_REFRESH_INTERVAL = 55 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class IoBrokerWebSocketClient implements OnDestroy {
  private socket$?: WebSocketSubject<any>;
  private socketSubscription?: Subscription;
  private messageSubject = new Subject<any>();
  private readySubject = new BehaviorSubject<boolean>(false);
  private connectionStateSubject = new BehaviorSubject<ConnectionState>('disconnected');
  private errorSubject = new Subject<string>();
  private eventHandlers = new Map<string, Array<(...args: any[]) => void>>();
  private pendingCallbacks = new Map<number, IoBrokerCallbackRequest>();
  private pendingMessages: Array<any> = [];
  private subscriptions = new Map<string, IoBrokerSubscription>();

  private messageId = 0;
  private sessionID = Date.now();
  private connectingPromise?: Promise<void>;
  private destroyed = false;
  private connectTimeoutId?: ReturnType<typeof setTimeout>;
  private pingIntervalId?: ReturnType<typeof setInterval>;
  private tokenRefreshTimerId?: ReturnType<typeof setTimeout>;
  private authFallbackTimerId?: ReturnType<typeof setTimeout>;
  private lastPingTimestamp = 0;

  private accessToken: string | null = null;
  private tokenCreatedAt: number | null = null;
  private options: IoBrokerConnectOptions | null = null;
  private useSSL = false;
  private useAuthentication = false;
  private connectionRecoveryEnabled = true;

  get ready$(): Observable<boolean> {
    return this.readySubject.asObservable();
  }

  get connectionState$(): Observable<ConnectionState> {
    return this.connectionStateSubject.asObservable();
  }

  get message$(): Observable<any> {
    return this.messageSubject.asObservable();
  }

  get errors$(): Observable<string> {
    return this.errorSubject.asObservable();
  }

  ngOnDestroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.disconnect();
    this.messageSubject.complete();
    this.readySubject.complete();
    this.connectionStateSubject.complete();
    this.errorSubject.complete();
    this.eventHandlers.clear();
    this.subscriptions.clear();
    this.pendingMessages = [];
  }

  public async connect(options: IoBrokerConnectOptions = {}): Promise<void> {
    const url = this.buildUrlFromOptions(options);

    if (this.destroyed) {
      throw new Error('IoBrokerWebsocketService has been destroyed');
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    if (this.socket$ && this.connectionStateSubject.value === 'connected') {
      return Promise.resolve();
    }

    this.connectionStateSubject.next('connecting');
    this.options = { ...options };
    this.useSSL = this.determineSSLUsage(url, options.port, options.useSSL);
    this.useAuthentication = !!options.username?.trim();
    this.options.pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
    this.options.connectTimeout = options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;

    if (this.useAuthentication) {
      await this.authenticate(url, this.options);
    }

    this.connectingPromise = this.createWebSocket(url)
      .then(() => {
        this.connectionStateSubject.next('connected');
        this.readySubject.next(true);
        this.scheduleTokenRefresh();
        this.processPendingMessages();
      })
      .catch((error) => {
        this.emitError(error instanceof Error ? error.message : String(error));
        this.connectionStateSubject.next('disconnected');
        this.readySubject.next(false);
        throw error;
      })
      .finally(() => {
        this.connectingPromise = undefined;
      });

    return this.connectingPromise;
  }

  public async disconnect(): Promise<void> {
    this.clearConnectTimeout();
    this.clearPingInterval();
    this.clearTokenTimers();
    this.readySubject.next(false);
    this.connectionStateSubject.next('disconnected');
    this.cancelAllCallbacks();

    this.socketSubscription?.unsubscribe();
    this.socketSubscription = undefined;
    this.socket$?.complete();
    this.socket$ = undefined;
  }

  public on(name: string, callback: (...args: any[]) => void): void {
    const handlers = this.eventHandlers.get(name) ?? [];
    handlers.push(callback);
    this.eventHandlers.set(name, handlers);
  }

  public off(name: string, callback?: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(name)) {
      return;
    }
    if (!callback) {
      this.eventHandlers.delete(name);
      return;
    }
    const handlers = this.eventHandlers.get(name)!.filter((storedCallback) => storedCallback !== callback);
    if (handlers.length === 0) {
      this.eventHandlers.delete(name);
    } else {
      this.eventHandlers.set(name, handlers);
    }
  }

  async subscribe(stateIdOrPattern: string, callback: (payload: any) => void): Promise<void> {
    const pattern = this.compilePattern(stateIdOrPattern);
    this.subscriptions.set(stateIdOrPattern, { callback, pattern });
    await this.sendCallbackRequest('subscribe', [stateIdOrPattern], 5000);
  }

  async unsubscribe(stateIdOrPattern: string): Promise<void> {
    this.subscriptions.delete(stateIdOrPattern);
    await this.sendCallbackRequest('unsubscribe', [stateIdOrPattern], 2000).catch(() => undefined);
  }

  getConnectionStats(): Record<string, any> {
    return {
      connected: this.connectionStateSubject.value === 'connected',
      ready: this.readySubject.value,
      destroyed: this.destroyed,
      sessionID: this.sessionID,
      useSSL: this.useSSL,
      useAuthentication: this.useAuthentication,
      subscriptionCount: this.subscriptions.size,
      pendingCallbacks: this.pendingCallbacks.size,
      connectionRecoveryEnabled: this.connectionRecoveryEnabled,
      lastTokenAge: this.accessToken && this.tokenCreatedAt ? Date.now() - this.tokenCreatedAt : null,
    };
  }

  setConnectionRecovery(enabled: boolean): void {
    this.connectionRecoveryEnabled = enabled;
  }

  private determineSSLUsage(url: string, port?: number | string, explicitSSL?: boolean): boolean {
    if (explicitSSL !== undefined) {
      return explicitSSL;
    }
    if (port !== undefined) {
      const portNumber = typeof port === 'string' ? Number(port) : port;
      return portNumber === 443 || portNumber === 8443 || portNumber === 8084;
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  private async authenticate(url: string, options: IoBrokerConnectOptions): Promise<void> {
    if (!options.username) {
      throw new Error('Username required for authentication');
    }
    if (!options.password) {
      throw new Error('Password required for authentication');
    }
    const tokenUrl = this.buildTokenUrl(url, options);

    // const body = new HttpParams({
    //   fromObject: {
    //     grant_type: 'password',
    //     username: options.username.trim(),
    //     password: options.password,
    //     client_id: 'ioBroker',
    //     stayloggedin: 'false',
    //   },
    // });
    // const headers = new HttpHeaders({
    //   'Content-Type': 'application/x-www-form-urlencoded',
    // });
    // const tokenData = await firstValueFrom(
    //   this.http.post<{ access_token?: string }>(tokenUrl, body.toString(), {
    //     headers,
    //   })
    // );

    // if (!tokenData || !tokenData.access_token) {
    //   throw new Error('Invalid authentication response: missing access_token');
    // }
    // this.accessToken = tokenData.access_token;
    //

    // implement alternative using fetch
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: options.username.trim(),
        password: options.password,
        client_id: 'ioBroker',
        stayloggedin: 'false',
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Authentication failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const tokenData = await response.json();
    if (!tokenData || !tokenData.access_token) {
      throw new Error('Invalid authentication response: missing access_token');
    }
    this.accessToken = tokenData.access_token;

    this.tokenCreatedAt = Date.now();
  }

  private buildTokenUrl(url: string, options: IoBrokerConnectOptions): string {
    const parsed = new URL(url);
    const protocol = this.useSSL ? 'https:' : 'http:';
    const host = options.host ?? parsed.hostname;
    const port = (options.port ?? parsed.port) || (this.useSSL ? '443' : '80');
    return `${protocol}//${host}:${port}/oauth/token`;
  }

  private createWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      const wsUrl = this.constructWebSocketUrl(url);
      this.socket$ = webSocket({
        url: wsUrl,
        deserializer: (event) => {
          try {
            return JSON.parse(event.data as string);
          } catch {
            return null;
          }
        },
        serializer: (value) => JSON.stringify(value),
        openObserver: {
          next: () => {
            opened = true;
            this.clearConnectTimeout();
            this.setPingInterval();
            this.emitEvent('connect');
            resolve();
          },
        },
        closeObserver: {
          next: () => {
            this.connectionStateSubject.next('disconnected');
            this.readySubject.next(false);
            this.clearPingInterval();
            this.emitEvent('disconnect');
            if (this.connectionRecoveryEnabled && !this.destroyed) {
              this.scheduleReconnect(this.options ?? {});
            }
            if (!opened) {
              reject(new Error('WebSocket closed before connection was established'));
            }
          },
        },
      });

      this.socketSubscription = this.socket$.subscribe({
        next: (message) => {
          if (message !== null) {
            this.handleIncomingMessage(message);
          }
        },
        error: (err) => {
          this.emitError(err instanceof Error ? err.message : String(err));
          if (!opened) {
            reject(err);
          }
        },
        complete: () => {
          this.emitEvent('close');
        },
      });

      this.connectTimeoutId = setTimeout(() => {
        if (!opened) {
          reject(new Error('WebSocket connection timed out'));
          this.emitError('WebSocket connection timed out');
          this.disconnect();
        }
      }, this.options?.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT);
    });
  }

  private scheduleReconnect(options: IoBrokerConnectOptions): void {
    if (this.destroyed) {
      return;
    }

    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
    }

    setTimeout(() => {
      if (!this.destroyed && this.connectionStateSubject.value !== 'connected') {
        this.connect(options).catch(() => undefined);
      }
    }, 3000);
  }

  private constructWebSocketUrl(baseUrl: string): string {
    const parsed = new URL(baseUrl);
    const protocol = this.useSSL ? 'wss:' : 'ws:';
    const host = this.options?.host ?? parsed.hostname;
    const port = (this.options?.port ?? parsed.port) || (this.useSSL ? '443' : '80');
    const nameQuery = this.options?.name ? `&name=${encodeURIComponent(this.options.name)}` : '';
    const tokenQuery = this.useAuthentication && this.accessToken ? `&token=${encodeURIComponent(this.accessToken)}` : '';
    return `${protocol}//${host}:${port}${parsed.pathname}?sid=${this.sessionID}${nameQuery}${tokenQuery}`;
  }

  private handleIncomingMessage(data: any): void {
    this.messageSubject.next(data);

    if (!Array.isArray(data) || data.length < 1) {
      return;
    }

    const type = data[0];
    if (type === MESSAGE_TYPES.PING) {
      this.sendRaw([MESSAGE_TYPES.PONG]);
      return;
    }

    if (type === MESSAGE_TYPES.PONG) {
      this.lastPingTimestamp = Date.now();
      return;
    }

    if (type === MESSAGE_TYPES.CALLBACK) {
      const id = data[1];
      const args = data[3];
      this.resolveCallback(id, args);
      return;
    }

    if (type === MESSAGE_TYPES.MESSAGE) {
      const name = data[2];
      const args = data[3];
      this.emitEvent(name, args);
      this.dispatchSubscription(name, args);
      if (name === 'ready') {
        this.readySubject.next(true);
      }
      if (name === 'reauthenticate') {
        this.handleReauthenticate();
      }
    }
  }

  private sendRaw(payload: any): void {
    if (!this.socket$ || this.connectionStateSubject.value !== 'connected') {
      this.pendingMessages.push(payload);
      return;
    }
    this.socket$.next(payload);
  }

  public async sendCallbackRequest<T>(name: string, args: any[], timeout = 8000): Promise<T> {
    if (this.destroyed) {
      throw new Error('Client has been destroyed');
    }
    if (this.connectionStateSubject.value !== 'connected') {
      throw new Error('Client not ready for operations');
    }

    const id = ++this.messageId;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new Error(`${name} request timed out`));
      }, timeout);

      this.pendingCallbacks.set(id, { resolve, reject, timeoutId, name });
      this.sendRaw([MESSAGE_TYPES.CALLBACK, id, name, args]);
    });
  }

  private resolveCallback(id: number, args: any): void {
    const request = this.pendingCallbacks.get(id);
    if (!request) {
      return;
    }
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }
    request.resolve(args);
    this.pendingCallbacks.delete(id);
  }

  private escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private dispatchSubscription(name: string, args: any): void {
    for (const [key, subscription] of this.subscriptions.entries()) {
      if (!key) {
        continue;
      }
      const matches = subscription.pattern ? subscription.pattern.test(name) : name === key;
      if (matches) {
        try {
          subscription.callback(args);
        } catch (err) {
          this.emitError(err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  private emitEvent(name: string, payload?: any): void {
    if (!name) {
      return;
    }
    const handlers = this.eventHandlers.get(name);
    if (!handlers) {
      return;
    }
    handlers.forEach((callback) => {
      try {
        callback(payload);
      } catch (err) {
        this.emitError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  private emitError(message: string): void {
    this.errorSubject.next(message);
  }

  private setPingInterval(): void {
    this.clearPingInterval();
    this.pingIntervalId = setInterval(() => {
      if (this.socket$ && this.connectionStateSubject.value === 'connected') {
        this.sendRaw([MESSAGE_TYPES.PING]);
      }
    }, this.options?.pingInterval ?? DEFAULT_PING_INTERVAL);
  }

  private clearPingInterval(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = undefined;
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = undefined;
    }
  }

  private processPendingMessages(): void {
    if (!this.socket$ || this.connectionStateSubject.value !== 'connected') {
      return;
    }
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      this.socket$.next(message);
    }
  }

  private cancelAllCallbacks(): void {
    for (const request of this.pendingCallbacks.values()) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Client disconnected'));
    }
    this.pendingCallbacks.clear();
  }

  private scheduleTokenRefresh(): void {
    this.clearTokenTimers();
    if (!this.useAuthentication || !this.accessToken) {
      return;
    }
    this.tokenRefreshTimerId = setTimeout(async () => {
      try {
        await this.refreshToken();
      } catch (error) {
        this.emitError(error instanceof Error ? error.message : String(error));
      }
    }, DEFAULT_TOKEN_REFRESH_INTERVAL);
  }

  private clearTokenTimers(): void {
    if (this.tokenRefreshTimerId) {
      clearTimeout(this.tokenRefreshTimerId);
      this.tokenRefreshTimerId = undefined;
    }
    if (this.authFallbackTimerId) {
      clearTimeout(this.authFallbackTimerId);
      this.authFallbackTimerId = undefined;
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.options || !this.useAuthentication) {
      return;
    }
    if (!this.options.username || !this.options.password || !this.options.host || !this.options.port) {
      return;
    }
    await this.authenticate(this.buildUrlFromOptions(this.options), this.options);
    if (this.connectionStateSubject.value === 'connected') {
      this.sendRaw([MESSAGE_TYPES.CALLBACK, ++this.messageId, 'updateTokenExpiration', [this.accessToken]]);
    }
    this.scheduleTokenRefresh();
  }

  private handleReauthenticate(): void {
    if (!this.useAuthentication || !this.options) {
      return;
    }
    this.refreshToken().catch((err) => this.emitError(err instanceof Error ? err.message : String(err)));
  }

  private compilePattern(pattern: string): RegExp | null {
    if (!pattern.includes('*')) {
      return null;
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  }

  private buildUrlFromOptions(options: IoBrokerConnectOptions): string {
    const proto = this.useSSL ? 'https:' : 'http:';
    const host = options.host ?? 'localhost';
    const port = options.port ?? (this.useSSL ? '443' : '80');
    return `${proto}//${host}:${port}`;
  }
}
