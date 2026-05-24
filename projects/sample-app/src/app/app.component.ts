import { Component, inject } from '@angular/core';
import { IoBrokerWebSocketService } from '../../../ngx-iobroker/src/public-api';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly _ioBroker = inject(IoBrokerWebSocketService);

  public readonly ioBrokerConnectionState = toSignal(this._ioBroker.connectionState$);

  constructor() {
    this._ioBroker.connect();
    this._ioBroker.stateChanged$.pipe(takeUntilDestroyed()).subscribe((value) => {
      console.log(`${value.id}: ${value.state?.val}`);
    });
  }
}
