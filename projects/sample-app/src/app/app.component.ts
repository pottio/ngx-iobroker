import { Component, inject } from '@angular/core';
import { IoBrokerWsService } from '../../../ngx-iobroker/src/public-api';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

@Component({
    selector: 'app-root',
    imports: [],
    templateUrl: './app.component.html'
})
export class AppComponent {
  private readonly _ioBroker = inject(IoBrokerWsService);

  public readonly ioBrokerConnected = toSignal(this._ioBroker.connected$, { initialValue: false });

  constructor() {
    this._ioBroker.stateChanged$.pipe(takeUntilDestroyed()).subscribe((value) => {
      console.log(`${value.id}: ${value.state?.val}`);
    });
  }
}
