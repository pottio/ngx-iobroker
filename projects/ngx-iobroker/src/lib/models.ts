export interface IoBrokerWsConfiguration {
  clientName: string;
  hostnameOrIp: string;
  port: number;
  secureConnection?: boolean;
  credentials?: {
    user: string;
    password: string;
  };
  historyAdapter?: string;
  autoLoadScriptOnInit?: boolean;
  autoSubscribes?: string[];
}

export interface IoBrokerHistoryConfig {
  aliasId: string;
  blockTime: number;
  changesMinDelta: number;
  changesOnly: boolean;
  changesRelogInterval: number;
  debounce: number;
  debounceTime: number;
  disableSkippedValueLogging: boolean;
  enableDebugLogs: boolean;
  enabled: boolean;
  ignoreBelowNumber: string;
  ignoreZero: boolean;
  maxLength: number;
  retention: number;
  round: number;
  storageType: boolean;
  [key: string]: unknown;
}

export interface IoBrokerHistoryConfigResult {
  success: boolean;
  error?: string;
}
