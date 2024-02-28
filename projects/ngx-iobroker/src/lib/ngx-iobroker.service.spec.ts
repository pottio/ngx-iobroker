import { TestBed } from '@angular/core/testing';

import { NgxIobrokerService } from './ngx-iobroker.service';

describe('NgxIobrokerService', () => {
  let service: NgxIobrokerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NgxIobrokerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
