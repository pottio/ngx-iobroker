import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { IoBrokerWebSocketConfiguration, ioBrokerWebSocketConfigurationToken } from '../../../ngx-iobroker/src/public-api';

const ioBrokerConfiguration: IoBrokerWebSocketConfiguration = {
  clientName: 'sample-app',
  hostnameOrIp: '<ioBrokerIpOrHostname>',
  port: 8082,
  secureConnection: true,
  historyAdapter: 'influxdb.0',
  credentials: {
    user: '<ioBrokerUser>',
    password: '<ioBrokerPassword>',
  },
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    {
      provide: ioBrokerWebSocketConfigurationToken,
      useValue: ioBrokerConfiguration,
    },
  ],
};
