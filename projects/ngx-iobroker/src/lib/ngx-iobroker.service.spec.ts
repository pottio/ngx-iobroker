import { TestBed } from '@angular/core/testing';
import { IoBrokerWsService, ioBrokerWsConfigurationToken, IoBrokerWsConfiguration } from 'ngx-iobroker';

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

describe('IoBrokerWsService', () => {
  let service: IoBrokerWsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: ioBrokerWsConfigurationToken, useValue: ioBrokerConfiguration }] });
    service = TestBed.inject(IoBrokerWsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
