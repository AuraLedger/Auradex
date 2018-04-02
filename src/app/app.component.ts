import { Component, AfterViewInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

import { DexUtils } from './lib/DexUtils';
import { CoinService } from './coin.service';
import { UserService } from './user.service';
import { WebsocketService } from './websocket.service';
import { Market } from './market';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
    title = 'Auradex';

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private coinService: CoinService,
        private userService: UserService,
        private websocketService: WebsocketService 
    ) {}
}
