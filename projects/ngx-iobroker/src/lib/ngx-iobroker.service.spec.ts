import { TestBed } from '@angular/core/testing';
import { IoBrokerWebSocketService, ioBrokerWebSocketConfigurationToken, IoBrokerWebSocketConfiguration } from 'ngx-iobroker';

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

describe('IoBrokerWebSocketService', () => {
  let service: IoBrokerWebSocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: ioBrokerWebSocketConfigurationToken, useValue: ioBrokerConfiguration }] });
    service = TestBed.inject(IoBrokerWebSocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
