import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { IoBrokerWsConfiguration, ioBrokerWsConfigurationToken } from '../../../ngx-iobroker/src/public-api';

const ioBrokerConfiguration: IoBrokerWsConfiguration = {
  clientName: 'sample-app',
  hostnameOrIp: '<ioBrokerIpOrHostname>',
  port: 8082,
  secureConnection: true,
  historyAdapter: 'influxdb.0',
  credentials: {
    user: '<ioBrokerUser>',
    password: '<ioBrokerPassword>',
  },
  autoLoadScriptOnInit: true,
  autoSubscribes: ['0_userdata.*'],
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    {
      provide: ioBrokerWsConfigurationToken,
      useValue: ioBrokerConfiguration,
    },
  ],
};
