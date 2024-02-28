import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NgxIobrokerComponent } from './ngx-iobroker.component';

describe('NgxIobrokerComponent', () => {
  let component: NgxIobrokerComponent;
  let fixture: ComponentFixture<NgxIobrokerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgxIobrokerComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(NgxIobrokerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
