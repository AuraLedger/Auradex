import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material';
import { Router, ActivatedRoute } from '@angular/router';
import * as Highcharts from 'highcharts/highstock';
import { ChartModule } from 'angular2-highcharts'; 
import { LocalStorageService } from 'angular-2-local-storage';
import { BigNumber } from 'bignumber.js';

import { UserService } from '../user.service';
import { CoinService } from '../coin.service';
import { WebsocketService } from '../websocket.service';
import { BigNumberPipe } from '../big-number.pipe';

import { Market } from '../market';
import { Coin } from '../coin';

import { ListingMessage, DexUtils, CancelMessage, INode, ArrayMap } from '../lib/libauradex';

@Component({
    selector: 'app-trade', 
    templateUrl: './trade.component.html',
    styleUrls: ['./trade.component.scss']
})
export class TradeComponent implements OnInit, AfterViewInit {

    options: Object;

    markets: Market[] = [];
    market: Market;
    account;

    //orderInputs (not using BigNumber here since they are bound to html inputs)
    bidAmount: number;
    bidPrice: number;
    bidMin: number;
    bidMinPercent: number;

    askAmount: number;
    askPrice: number;
    askMin: number;
    askMinPercent: number;

    minToolTip = "Set the minimum amount you are willing to trade, in case someone wants to swap for less than your total.";
    availTooltip = "Your available balance is calculated from your total wallet balance minus your open orders and the average network transaction fee required to initiate a swap."

    //chart
    ohlc;
    volume;
    dataLength;
    groupingUnits;

    private sub: any;

    isBuyPanelOpen = true;
    isBidPanelOpen = true;
    isAskPanelOpen = true;
    isSellPanelOpen = true;
    isMyPanelOpen = true;
    isActivePanelOpen = true;
    isRecentPanelOpen = true;

    constructor(
        private route: ActivatedRoute, 
        private router: Router,
        private localStorageService: LocalStorageService, 
        public coinService: CoinService, 
        public userService: UserService,
        public websocketService: WebsocketService
    ) { 
        this.account = userService.getAccount();
        this.genTestData();
        this.setTheme();

        var mKeys = Object.keys(this.coinService.marketd);
        for(var i = 0; i < mKeys.length; i++)
            this.markets.push(this.coinService.marketd[mKeys[i]]);
    }

    cancel(listing: ListingMessage): void {
        var that = this;
        var coin = listing.act == 'bid' ? this.market.base : this.market.coin;
        //TODO: make sure there are no active swaps for this listing
        that.userService.getPrivateKey(coin.name, (key) => {
            that.market.cancelling[listing.hash] = true; //TODO: add to market and check before accepting trades
            that.userService.areYouSure('Cancel', 'Are you sure?', function() {
                that.websocketService.getSocket(that.market, function(ws) {

                    var cancelMessage: CancelMessage = {
                        act: 'cancel',
                        listing: listing.hash,
                        timestamp: DexUtils.UTCTimestamp()
                    };
                    var msg = DexUtils.getCancelSigMessage(cancelMessage);
                    cancelMessage.hash = DexUtils.sha3(msg);
                    cancelMessage.sig = coin.node.signMessage(msg, key);

                    ws.send(JSON.stringify(cancelMessage));
                    that.market.cancel(cancelMessage);
                    delete that.market.cancelling[listing.hash];
                    that.websocketService.updateBookBalances(coin.name);
                });
            }, () => {
                delete that.market.cancelling[listing.hash];
                //TODO: check for trade offers that may have came in
            });
        });
    }

    selectMarket(mark) {
        this.market = mark;
        this.initMarket();
    } 

    setAskMinPercent(val) {
        val = Number(val.toFixed(0));
        this.askMinPercent = val;
        this.localStorageService.set(this.market.coin.name + 'askMinPercent', val);
    }

    askMinChanged(val) {
        if(!val) return;
        if(val > this.askAmount)
            val = this.askAmount;
        if(val < 0)
            val = 0;
        val = Number(val.toFixed(8));
        this.askMin = val;
        if(this.askAmount > 0)
            this.setAskMinPercent(this.askMin * 100 / this.askAmount);
    }

    calcAskMin() {
        this.askMin = this.askAmount * this.askMinPercent / 100;
        this.askMin = Number(this.askMin.toFixed(8));
    }

    askMinPercentChanged(val) {
        if(!val) return;
        if(val > 100)
            val = 100;
        if(val < 0)
            val = 0;
        this.setAskMinPercent(val);
        this.calcAskMin();
    }

    askAmountChanged(val) {
        if(!val) return;
        if(this.market.coinAvailable.isLessThan(val || 0)) 
            val = this.market.coinAvailable.toNumber();
        if(val < 0)
            val = 0;
        this.askAmount = val;
        this.calcAskMin();
    }

    validateAskInputs(): string {
        if(this.market.coinAvailable.isLessThan(this.askAmount || 0))
            return 'Not enough funds.';
        if(this.askMin > this.askAmount)
            return 'Min cannot be greater than amount';
        return null;
    }

    setBidMinPercent(val) {
        val = Number(val.toFixed(0));
        this.bidMinPercent = val;
        this.localStorageService.set(this.market.coin.name + 'bidMinPercent', val);
    }

    bidMinChanged(val) {
        if(!val) return;
        if(val > this.bidAmount)
            val = this.bidAmount;
        if(val < 0)
            val = 0;
        val = Number(val.toFixed(8));
        this.bidMin = val;
        if(this.bidAmount > 0)
            this.setBidMinPercent(this.bidMin * 100 / this.bidAmount);
    }

    calcBidMin() {
        this.bidMin = this.bidAmount * this.bidMinPercent / 100;
        this.bidMin = Number(this.bidMin.toFixed(8));
    }

    bidMinPercentChanged(val) {
        if(!val) return;
        if(val > 100)
            val = 100;
        if(val < 0)
            val = 0;
        this.setBidMinPercent(val);
        this.calcBidMin();
    }

    bidAmountChanged(val) {
        if(!val) return;
        if(this.market.baseAvailable.isLessThan(val || 0))
            val = this.market.baseAvailable.toNumber();
        if(val < 0)
            val = 0;
        this.bidAmount = val;
        this.calcBidMin();
    }

    validateBidInputs(): string {
        if(this.market.baseAvailable.isLessThan(this.bidAmount || 0))
            return 'Not enough funds.';
        if(this.bidMin > this.bidAmount)
            return 'Min cannot be greater than amount';
        return null;
    }

    //TODO: make sure they don't also have an ask with a better price
    placeBid() {
        var amount = new BigNumber((this.bidAmount || 0).toString());
        var price = new BigNumber((this.bidPrice || 0).toString());
        var min = new BigNumber((this.bidMin || 0).toString());

        if(amount.isLessThanOrEqualTo(0))
            return;
        if(price.isLessThanOrEqualTo(0))
            return;

        var size: BigNumber = amount.times(price);
        if(size.isGreaterThan(this.market.baseAvailable)) {
            this.userService.showError('not enough funds');
            return;
        } 

        if(this.market.coinAvailable.isLessThan(this.market.coin.node.getRedeemFee())) {
            this.userService.showError('You need alteast ' + this.market.coin.node.getRedeemFee().toFixed(8) + ' ' + this.market.coin.ticker + ' for the redeem transaction to complete this trade');
            return;
        }

        if(size.isLessThan(this.market.base.node.getInitFee().times(10))) {
            this.userService.showError('amount is too small, must be worth atleast ' + this.market.base.node.getInitFee().times(10).toFixed(8) + ' ' + this.market.base.ticker + ' (10 times the average network fee');
            return;
        }

        if(this.market.base.node.getInitFee().times(10).isGreaterThan(min.times(price))) {
            min = this.market.base.node.getInitFee().times(10).div(price);
            this.bidMin = min.toNumber();
            this.bidMinChanged(this.bidMin);
        }

        var entry: ListingMessage = {
            act: 'bid',
            price: price,
            amount: amount,
            address: this.userService.getAccount()[this.market.base.name].address,
            redeemAddress: this.userService.getAccount()[this.market.coin.name].address,
            min: min,
            timestamp: DexUtils.UTCTimestamp(),
        };

        //find matches
        var offers = DexUtils.findMatches(this.market.ask.array, entry, true);

        //verify listings and broadcast offers
        var doneCount = 0;
        var that = this;
        this.userService.getPrivateKey(this.market.base.name, function(key) {
            that.websocketService.getSocket(that.market, function(ws) {
                var allDone = (increment: boolean) => {
                    if(increment) 
                        doneCount++;
                    if(doneCount == offers.length) {
                        if(entry.amount.isGreaterThanOrEqualTo(entry.min))
                        {
                            var msg = DexUtils.getListingSigMessage(entry);
                            entry.hash = DexUtils.sha3(msg);
                            entry.sig = that.market.base.node.signMessage(msg, key);
                            ws.send(JSON.stringify(entry));
                            that.market.addMyListing(entry);
                            that.bidAmount = 0;
                        }
                    }
                };
                offers.forEach((offer) => {
                    var listing = that.market.listings.get(offer.listing);
                    DexUtils.verifyListing(listing, that.market.coin.node, false, () => {
                        var msg = DexUtils.getOfferSigMessage(offer);
                        offer.hash = DexUtils.sha3(msg);
                        offer.sig = that.market.base.node.signMessage(msg, key);
                        ws.send(JSON.stringify(offer));
                        that.bidAmount = 0;
                        that.userService.showSuccess("Offer has been placed, waiting for lister to accept");
                        that.market.addMyOffer(offer);
                        allDone(true);
                    }, (error) => {
                        that.userService.handleError(error);
                        entry.amount = entry.amount.plus(offer.amount); //add unused maount back onto offer
                        allDone(true);
                    });
                }); 
                allDone(false); //incase 0 offers found
            });
        });
    }

    //TODO: make sure they don't also have an bid with a better price
    placeAsk() {

        var amount = new BigNumber((this.askAmount || 0).toString());
        var price = new BigNumber((this.askPrice || 0).toString());
        var min = new BigNumber((this.askMin || 0).toString());

        if(this.market.coinAvailable.isLessThan(amount)) {
            this.userService.showError('not enough funds');
            return;
        }

        if(this.market.baseAvailable.isLessThan(this.market.base.node.getRedeemFee())) {
            this.userService.showError('You need alteast ' + this.market.base.node.getRedeemFee().toFixed(8) + ' ' + this.market.base.ticker + ' for the redeem transaction to complete this trade');
            return;
        }

        var size: BigNumber = amount.times(price);
        if(this.market.base.node.getInitFee().times(10).isGreaterThan(size)) {
            this.userService.showError('amount is too small, must be worth atleast ' + this.market.base.node.getInitFee().times(10).toFixed(8) + ' ' + this.market.base.ticker + ' (10 times the average network fee)');
            return;
        }

        if(this.market.base.node.getInitFee().times(10).isGreaterThan(min.times(price))) {
            min = this.market.base.node.getInitFee().times(10).div(price);
            this.askMin = min.toNumber();
            this.askMinChanged(this.askMin);
        }

        var entry: ListingMessage = {
            act: 'ask',
            price: price,
            amount: amount,
            address: this.userService.getAccount()[this.market.coin.name].address,
            redeemAddress: this.userService.getAccount()[this.market.base.name].address,
            min: min,
            timestamp: DexUtils.UTCTimestamp(),
        };

        //find matches
        var offers = DexUtils.findMatches(this.market.bid.array, entry, false);

        //verify listings and broadcast offers
        var doneCount = 0;
        var that = this;
        this.userService.getPrivateKey(this.market.coin.name, function(key) {
            that.websocketService.getSocket(that.market, function(ws) {
                var allDone = (increment: boolean) => {
                    if(increment) 
                        doneCount++;
                    if(doneCount == offers.length) {
                        if(entry.amount.isGreaterThanOrEqualTo(entry.min))
                        {
                            var msg = DexUtils.getListingSigMessage(entry);
                            entry.hash = DexUtils.sha3(msg);
                            entry.sig = that.market.coin.node.signMessage(msg, key);
                            ws.send(JSON.stringify(entry));
                            that.market.addMyListing(entry);
                        }
                    }
                };
                offers.forEach((offer) => {
                    var listing = that.market.listings.get(offer.listing);
                    DexUtils.verifyListing(listing, that.market.base.node, false, () => {
                        var msg = DexUtils.getOfferSigMessage(offer);
                        offer.hash = DexUtils.sha3(msg);
                        offer.sig = that.market.coin.node.signMessage(msg, key);
                        ws.send(JSON.stringify(offer));
                        that.askAmount = 0;
                        that.userService.showSuccess("Offer has been placed, waiting for lister to accept");
                        that.market.addMyOffer(offer);
                        allDone(true);
                    }, (error) => {
                        that.userService.handleError(error);
                        entry.amount = entry.amount.plus(offer.amount); //add unused maount back onto offer
                        allDone(true);
                    });
                }); 
                allDone(false); //incase 0 offers found
            });
        });
    }

    genTestData() {
        var data = [
            [, 2, 3, 1, 2, 5],
            [, 3, 3, 1, 2, 2],
            [, 4, 3, 1, 2, 8],
            [, 5, 3, 1, 2, 5],
            [, 6, 3, 1, 2, 3],
            [, 4, 3, 1, 2, 5],
            [, 8, 3, 1, 2, 9],
            [, 3, 3, 1, 2, 5],
            [, 2, 3, 1, 2, 3]
        ];

        data = this.getAppleData();

        // split the data set into ohlc and volume
        this.ohlc = [];
        this.volume = [];
        this.dataLength = data.length;
        // set the allowed units for data grouping
        this.groupingUnits = [[
            'week',                         // unit name
            [1]                             // allowed multiples
        ], [
            'month',
            [1, 2, 3, 4, 6]
        ]];

        var testFactor = 10000;

        for (var i = 0; i < this.dataLength; i += 1) {
            this.ohlc.push([
                data[i][0], // the date
                data[i][1]/testFactor, // open
                data[i][2]/testFactor, // high
                data[i][3]/testFactor, // low
                data[i][4]/testFactor // close
            ]);

            this.volume.push([
                data[i][0], // the date
                data[i][5] // the volume
            ]);
        }
    }

    ngAfterViewInit() {}
    preInit() {

        //if there is no account, TODO: prompt user to create one
        var account = this.userService.getAccount();
        var activeMarkets = {};
        var myMarkets = {};
        var aMarket: Market;
        var login: boolean = false;
        if(!account) {
            var urlSegments = this.route.snapshot.url;
            if(urlSegments.length < 1 || urlSegments[0].path != 'wallet')
                this.router.navigate(['/wallet']);
        } else {
            //restore books, connect to markets with active trades, prompt login
            var that = this;
            var stgKeys = [];
            for(var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if(!key.startsWith('auradex'))
                    stgKeys.push(localStorage.key(i));
            }
            var expire = DexUtils.UTCTimestamp() - 60 * 60 * 24 * 4;
            stgKeys.forEach((k: string) => {
                var idx = k.indexOf('0x');
                if(idx == -1)
                    idx = k.indexOf('staged');
                if(idx > 0)
                {
                    var marketId = k.substring(0, idx);
                    var hash = k.substring(idx);
                    var market: Market = that.coinService.marketd[marketId];

                    if(market) {

                        if(!activeMarkets.hasOwnProperty(marketId)) {
                            activeMarkets[marketId] = market;
                        }

                        var json = JSON.parse(localStorage.getItem(k));
                        that.websocketService.setNumbers(json);
                        var mine = false;

                        if(json.address == account[market.coin.name].address || json.address == account[market.base.name].address) {
                            mine = true;
                        }

                        if(json.act == 'cancel') {
                            market.cancelQueue.push(json);
                        } else if(json.act == 'offer') {
                            market.offerQueue.push(json);
                        } else if(json.act == 'accept') {
                            if(json.hash.startsWith('staged'))
                                market.stagedAccepts.add(json);
                            else
                                market.acceptQueue.push(json);
                        } else if (json.act == 'bid' || json.act == 'ask') {
                            that.websocketService.processMessage(market, json, mine, true);
                        }

                        if (mine && !myMarkets.hasOwnProperty(marketId)) {
                            login = true;
                            myMarkets[marketId] = market;
                        }
                    }
                }
            });

            //for each market
            for(var key in activeMarkets) {
                if(activeMarkets.hasOwnProperty(key)) {
                    var market: Market = activeMarkets[key];
                    that.websocketService.reevalCancelQueue(market);
                    that.websocketService.reevalOfferQueue(market, true);
                    that.websocketService.reevalAcceptQueue(market, true);
                }
            }

            if(login) {
                setTimeout(() => { //wait for next update cycle
                    var aMarket: Market = myMarkets[0];
                    that.userService.getTradePrivateKey(market.coin.name, (privKey) => {
                        if(privKey) {
                            //for each market with object of mine, connect
                            for(var key in myMarkets) {
                                if(myMarkets.hasOwnProperty(key)) {
                                    var market: Market = myMarkets[key];
                                    that.websocketService.connect(market);
                                }
                            }           
                        }
                    }, {});
                }, 100);
            }
        }
    }

    initWebsockets() {
        this.websocketService.connect(this.market);
    }

    initMarket() {
        var that = this;
        this.account = this.userService.getAccount();
        if(this.account) {
            //TODO: update these on a 60 second interval loop
            this.userService.getBalance(this.market.coin.name, function(b) { that.market.coinAvailable = that.market.coinAvailable.plus(b).minus(that.market.coinBalance); that.market.coinBalance = b; });
            this.userService.getBalance(this.market.base.name, function(b) { that.market.baseAvailable = that.market.baseAvailable.plus(b).minus(that.market.baseBalance); that.market.baseBalance = b; });
        }
        this.initWebsockets();

        this.askMinPercent = Number(this.localStorageService.get(this.market.coin.name + 'askMinPercent') || 50);
        this.bidMinPercent = Number(this.localStorageService.get(this.market.base.name + 'bidMinPercent') || 50);
    }

    ngOnInit() {
        this.preInit();
        this.sub = this.route.params.subscribe(params => {
            var key: string;
            if(params['id']) {
                key = params['id'];
            }
            if(this.coinService.marketd.hasOwnProperty(key)) {
                this.market = this.coinService.marketd[key];
                this.initMarket();    
            }
            else
                this.router.navigate(['/trade', 'ROP-RNK']);
        });

        this.options = {

            rangeSelector: {
                selected: 1
            },

            title: {
                text: ''
            },


            yAxis: [{
                labels: {
                    align: 'right',
                    x: -3
                },
                title: {
                    text: 'Price (ETH)'
                },
                height: '60%',
                lineWidth: 2,
                resize: {
                    enabled: true
                }
            }, {
                labels: {
                    align: 'right',
                    x: -3
                },
                title: {
                    text: 'Volume'
                },
                top: '65%',
                height: '35%',
                offset: 0,
                lineWidth: 2
            }],

            tooltip: {
                split: true
            },

            series: [{
                type: 'candlestick',
                name: 'Aura',
                data: this.ohlc,
                dataGrouping: {
                    units: this.groupingUnits
                }
            }, {
                type: 'column',
                name: 'Volume',
                data: this.volume,
                yAxis: 1,
                dataGrouping: {
                    units: this.groupingUnits
                }
            }]
        };
    }

    ngOnDestroy() {
        this.options = null;
        this.sub.unsubscribe();
    }


    setTheme() {
        var theme: any = {
            colors: ['#7cb5ec', '#f7a35c', '#90ee7e', '#7798BF', '#aaeeee', '#ff0066',
                '#eeaaee', '#55BF3B', '#DF5353', '#7798BF', '#aaeeee'],
            chart: {
                backgroundColor: null,
                style: {
                    fontFamily: 'Dosis, sans-serif'
                }
            },
            title: {
                style: {
                    fontSize: '16px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                }
            },
            tooltip: {
                borderWidth: 0,
                backgroundColor: 'rgba(219,219,216,0.8)',
                shadow: false
            },
            legend: {
                itemStyle: {
                    fontWeight: 'bold',
                    fontSize: '13px'
                }
            },
            xAxis: {
                gridLineWidth: 1,
                labels: {
                    style: {
                        fontSize: '12px'
                    }
                }
            },
            yAxis: {
                minorTickInterval: 'auto',
                title: {
                    style: {
                        textTransform: 'uppercase'
                    }
                },
                labels: {
                    style: {
                        fontSize: '12px'
                    }
                }
            },
            plotOptions: {
                candlestick: {
                    lineColor: '#404048'
                }
            },


            // General
            background2: '#F0F0EA'

        };

        // Apply the theme
        Highcharts.setOptions(theme);
    }

    getAppleData() {
        return [
            [1299024000000,49.99,50.62,49.77,50.30,150647189],
            [1299110400000,51.03,51.40,50.85,51.37,125196764],
            [1299196800000,51.44,51.47,51.11,51.43,113316483],
            [1299456000000,51.63,51.67,50.19,50.77,136530149],
            [1299542400000,50.70,51.06,50.32,50.82,89078955],
            [1299628800000,50.67,50.68,50.09,50.35,113349033],
            [1299715200000,49.87,49.97,49.27,49.52,126972055],
            [1299801600000,49.33,50.33,49.29,50.28,117770016],
            [1300060800000,50.45,50.93,50.19,50.51,109113690],
            [1300147200000,48.87,49.69,48.59,49.35,180262334],
            [1300233600000,48.86,49.00,46.61,47.14,289187626],
            [1300320000000,48.12,48.52,47.24,47.81,164854977],
            [1300406400000,48.16,48.31,47.14,47.24,188302604],
            [1300665600000,48.00,48.53,47.89,48.47,102347560],
            [1300752000000,48.94,48.95,48.45,48.74,81558162],
            [1300838400000,48.47,48.60,47.99,48.46,93248498],
            [1300924800000,48.84,49.43,48.41,49.28,101177720],
            [1301011200000,49.72,50.29,49.57,50.22,112292796],
            [1301270400000,50.45,50.62,50.06,50.06,77337407],
            [1301356800000,49.67,50.14,49.44,50.14,88224955],
            [1301443200000,50.09,50.13,49.63,49.80,82351269],
            [1301529600000,49.48,49.97,49.44,49.79,68592006],
            [1301616000000,50.16,50.23,49.04,49.22,104665400],
            [1301875200000,49.19,49.23,48.34,48.74,115020542],
            [1301961600000,48.14,48.89,48.00,48.41,120740809],
            [1302048000000,48.75,49.13,48.16,48.29,100634681],
            [1302134400000,48.30,48.63,48.00,48.30,93361520],
            [1302220800000,48.56,48.59,47.71,47.87,94383317],
            [1302480000000,47.72,47.95,47.15,47.26,99787618],
            [1302566400000,47.21,47.68,47.17,47.49,106627080],
            [1302652800000,47.86,48.02,47.50,48.02,86608963],
            [1302739200000,47.83,48.00,47.44,47.49,75497401],
            [1302825600000,47.61,47.66,46.69,46.78,113458247],
            [1303084800000,46.59,47.46,45.74,47.41,152474427],
            [1303171200000,47.59,48.28,47.39,48.27,104844243],
            [1303257600000,49.07,49.39,48.79,48.92,175163842],
            [1303344000000,50.71,50.73,49.79,50.10,188449618],
            [1303689600000,50.05,50.54,50.04,50.43,66636290],
            [1303776000000,50.52,50.71,49.91,50.06,84400645],
            [1303862400000,50.32,50.34,49.59,50.02,89052887],
            [1303948800000,49.46,49.96,49.36,49.54,90297123],
            [1304035200000,49.54,50.56,49.52,50.02,251585929],
            [1304294400000,49.96,50.07,49.36,49.47,110678246],
            [1304380800000,49.71,49.98,49.37,49.74,78390249],
            [1304467200000,49.75,50.26,49.55,49.94,97312229],
            [1304553600000,49.77,50.14,49.44,49.54,84065352],
            [1304640000000,49.96,50.00,49.46,49.52,70061285],
            [1304899200000,49.69,49.89,49.50,49.66,51188151],
            [1304985600000,49.84,49.96,49.52,49.92,70521969],
            [1305072000000,49.86,50.00,49.32,49.60,84018683],
            [1305158400000,49.45,49.59,48.90,49.51,80239593],
            [1305244800000,49.38,49.46,48.62,48.64,81547956],
            [1305504000000,48.46,48.75,47.51,47.61,112535374],
            [1305590400000,47.43,48.02,47.25,48.02,113196657],
            [1305676800000,48.07,48.72,48.00,48.55,83693267],
            [1305763200000,48.87,48.92,48.38,48.65,65291310],
            [1305849600000,48.51,48.71,47.86,47.89,84547708],
            [1306108800000,47.14,48.00,47.06,47.77,95627217],
            [1306195200000,47.93,47.99,47.33,47.46,80520650],
            [1306281600000,47.63,48.37,47.55,48.11,73555433],
            [1306368000000,48.00,48.13,47.78,47.86,55673751],
            [1306454400000,47.83,48.23,47.76,48.20,50912897],
            [1306800000000,48.73,49.69,48.71,49.69,104434134],
            [1306886400000,49.84,50.30,49.24,49.36,138670602],
            [1306972800000,49.50,49.71,49.19,49.44,84721112],
            [1307059200000,49.03,49.33,48.86,49.06,78360765],
            [1307318400000,49.42,49.58,48.26,48.29,115484677],
            [1307404800000,48.31,48.32,47.41,47.43,132493060],
            [1307491200000,47.40,47.83,47.24,47.46,83471577],
            [1307577600000,47.61,47.67,47.25,47.36,68841199],
            [1307664000000,47.22,47.38,46.50,46.56,108529400],
            [1307923200000,46.74,46.90,46.44,46.66,82414108],
            [1308009600000,47.14,47.61,47.04,47.49,83641901],
            [1308096000000,47.11,47.19,46.41,46.68,99851885],
            [1308182400000,46.70,46.95,45.48,46.45,127647338],
            [1308268800000,47.00,47.04,45.62,45.75,153872649],
            [1308528000000,45.34,45.39,44.36,45.05,160161274],
            [1308614400000,45.24,46.54,45.03,46.47,123343514],
            [1308700800000,46.45,46.99,46.05,46.09,97645436],
            [1308787200000,45.56,47.38,45.45,47.32,139939254],
            [1308873600000,47.34,47.59,46.44,46.62,109981312],
            [1309132800000,46.80,47.70,46.75,47.43,84989933],
            [1309219200000,47.66,48.10,47.63,47.89,73574907],
            [1309305600000,48.01,48.05,47.41,47.72,88179070],
            [1309392000000,47.81,48.02,47.55,47.95,80807391],
            [1309478400000,47.99,49.07,47.74,49.04,108828209],
            [1309824000000,49.00,49.98,48.93,49.92,88818618],
            [1309910400000,49.85,50.59,49.53,50.25,111156241],
            [1309996800000,50.67,51.14,50.57,51.03,99915319],
            [1310083200000,50.48,51.43,50.31,51.39,122481639],
            [1310342400000,50.91,51.40,50.40,50.57,110713974],
            [1310428800000,50.50,51.10,49.80,50.54,112901691],
            [1310515200000,51.19,51.43,50.91,51.15,97909518],
            [1310601600000,51.57,51.66,50.91,51.11,107633155],
            [1310688000000,51.60,52.14,51.31,52.13,121116338],
            [1310947200000,52.20,53.52,52.18,53.40,143157623],
            [1311033600000,54.00,54.09,53.33,53.84,204786344],
            [1311120000000,56.59,56.61,55.14,55.27,235331712],
            [1311206400000,55.28,55.72,54.84,55.33,131629036],
            [1311292800000,55.47,56.44,55.39,56.19,129181885],
            [1311552000000,55.76,57.14,55.66,56.93,147451094],
            [1311638400000,57.14,57.79,57.10,57.63,119145026],
            [1311724800000,57.23,57.52,56.02,56.08,164830470],
            [1311811200000,55.95,56.71,55.45,55.97,148506092],
            [1311897600000,55.38,56.45,54.86,55.78,158145890],
            [1312156800000,56.83,57.07,56.05,56.68,153207957],
            [1312243200000,56.81,56.13,54.61,55.46,250968788],
            [1312329600000,55.46,56.22,54.61,56.08,183125796],
            [1312416000000,55.63,55.90,53.91,53.91,217851424],
            [1312502400000,54.35,54.79,51.80,53.37,301140350],
            [1312761600000,51.67,52.54,50.43,50.46,285951204],
            [1312848000000,51.61,53.52,50.71,53.43,270645704],
            [1312934400000,53.02,53.52,51.79,51.96,219662296],
            [1313020800000,52.93,53.64,52.10,53.39,185491110],
            [1313107200000,54.00,54.23,53.46,53.86,132243405],
            [1313366400000,54.23,55.00,54.01,54.77,115135468],
            [1313452800000,54.50,54.77,53.72,54.35,124722122],
            [1313539200000,54.62,54.93,54.00,54.35,110514943],
            [1313625600000,52.98,53.24,51.62,52.29,212858289],
            [1313712000000,51.74,52.43,50.86,50.86,193970546],
            [1313971200000,52.07,52.13,50.73,50.92,133826210],
            [1314057600000,51.47,53.38,51.00,53.37,164208576],
            [1314144000000,53.35,54.14,52.94,53.74,156566907],
            [1314230400000,52.15,53.64,52.14,53.39,217825076],
            [1314316800000,53.02,54.83,52.97,54.80,160368761],
            [1314576000000,55.45,55.93,55.43,55.71,101313149],
            [1314662400000,55.46,55.98,55.17,55.71,104480264],
            [1314748800000,55.80,56.01,54.55,54.98,130688894],
            [1314835200000,55.12,55.33,54.39,54.43,85930705],
            [1314921600000,53.53,54.00,53.12,53.44,109791514],
            [1315267200000,52.48,54.33,52.35,54.25,127424129],
            [1315353600000,55.08,55.09,54.57,54.85,87643794],
            [1315440000000,54.63,55.52,54.62,54.88,104039460],
            [1315526400000,54.85,55.14,53.57,53.93,141269408],
            [1315785600000,53.29,54.41,53.13,54.28,116957988],
            [1315872000000,54.59,55.17,54.32,54.95,110184487],
            [1315958400000,55.29,56.03,55.11,55.61,133680848],
            [1316044800000,55.92,56.24,55.70,56.14,104454581],
            [1316131200000,56.51,57.22,56.43,57.21,174622161],
            [1316390400000,56.71,59.03,56.46,58.80,205964780],
            [1316476800000,59.32,60.41,58.74,59.06,193937289],
            [1316563200000,59.95,60.23,58.86,58.88,151493755],
            [1316649600000,57.29,58.55,56.67,57.40,242120137],
            [1316736000000,57.18,58.11,57.12,57.76,136620610],
            [1316995200000,57.12,57.71,55.90,57.60,203218862],
            [1317081600000,58.39,58.46,56.87,57.04,158124372],
            [1317168000000,57.17,57.68,56.64,56.72,107463181],
            [1317254400000,57.42,57.46,55.17,55.80,162841147],
            [1317340800000,55.30,55.56,54.45,54.47,137059223],
            [1317600000000,54.34,54.66,53.31,53.51,167269011],
            [1317686400000,53.51,54.54,50.61,53.21,308418887],
            [1317772800000,52.55,54.26,51.47,54.04,196617358],
            [1317859200000,53.33,54.97,53.11,53.91,203145054],
            [1317945600000,53.68,53.96,52.64,52.83,133904162],
            [1318204800000,54.16,55.54,54.03,55.54,110628287],
            [1318291200000,56.08,57.60,55.93,57.18,151420465],
            [1318377600000,58.19,58.46,57.16,57.46,155570982],
            [1318464000000,57.85,58.35,57.55,58.35,106545775],
            [1318550400000,59.55,60.29,59.32,60.29,143341730],
            [1318809600000,60.25,60.96,59.42,60.00,171510696],
            [1318896000000,60.25,60.69,59.43,60.32,220400096],
            [1318982400000,57.34,58.35,56.83,56.95,275998093],
            [1319068800000,57.14,57.19,56.32,56.47,137382294],
            [1319155200000,56.87,57.02,55.82,56.12,155310512],
            [1319414400000,56.60,58.07,56.49,57.97,125589044],
            [1319500800000,57.86,58.08,56.77,56.82,107650200],
            [1319587200000,57.39,57.51,56.16,57.23,114074982],
            [1319673600000,58.22,58.43,57.41,57.81,123713317],
            [1319760000000,57.57,58.05,57.50,57.85,80709748],
            [1320019200000,57.49,58.48,57.29,57.83,96406303],
            [1320105600000,56.77,57.07,56.17,56.64,132946877],
            [1320192000000,57.16,57.21,56.44,56.77,82063667],
            [1320278400000,57.01,57.63,56.48,57.58,110381075],
            [1320364800000,57.43,57.63,57.02,57.18,75556992],
            [1320624000000,57.13,57.14,56.59,57.10,67565799],
            [1320710400000,57.46,58.29,57.37,58.03,100109842],
            [1320796800000,56.71,57.27,56.32,56.47,139670930],
            [1320883200000,56.72,56.74,54.59,55.03,186245269],
            [1320969600000,55.23,55.53,54.32,54.95,163446017],
            [1321228800000,54.79,55.04,54.03,54.18,108265507],
            [1321315200000,54.40,55.64,54.21,55.55,107744812],
            [1321401600000,55.61,55.88,54.90,54.97,87302012],
            [1321488000000,54.85,54.94,53.64,53.92,120030148],
            [1321574400000,54.13,54.28,53.55,53.56,93018765],
            [1321833600000,52.91,53.10,52.27,52.72,112050589],
            [1321920000000,53.00,53.99,52.99,53.79,102324341],
            [1322006400000,53.50,53.69,52.41,52.43,107160445],
            [1322179200000,52.63,53.02,51.90,51.94,63689801],
            [1322438400000,53.19,53.82,52.90,53.73,86660854],
            [1322524800000,53.69,54.12,52.89,53.31,94007858],
            [1322611200000,54.47,54.61,54.04,54.60,101516702],
            [1322697600000,54.65,55.57,54.39,55.42,96794838],
            [1322784000000,55.69,56.23,55.51,55.67,94818290],
            [1323043200000,56.21,56.63,55.77,56.14,89342127],
            [1323129600000,56.07,56.38,55.63,55.85,70951013],
            [1323216000000,55.70,55.85,55.25,55.58,76249929],
            [1323302400000,55.92,56.50,55.75,55.81,94089051],
            [1323388800000,56.12,56.29,55.86,56.23,74285785],
            [1323648000000,55.95,56.27,55.64,55.98,75266366],
            [1323734400000,56.14,56.49,55.30,55.54,84784203],
            [1323820800000,55.24,55.34,53.95,54.31,101788680],
            [1323907200000,54.76,54.82,54.04,54.13,64112125],
            [1323993600000,54.34,54.88,54.22,54.43,105394401],
            [1324252800000,54.64,54.98,54.35,54.60,58881914],
            [1324339200000,55.39,56.59,55.32,56.56,84350728],
            [1324425600000,56.67,56.76,56.00,56.64,65736678],
            [1324512000000,56.71,57.02,56.59,56.94,50589112],
            [1324598400000,57.10,57.66,57.07,57.62,67401964],
            [1324944000000,57.59,58.44,57.57,58.08,66308613],
            [1325030400000,58.13,58.32,57.33,57.52,57214227],
            [1325116800000,57.63,57.95,57.22,57.87,54039041],
            [1325203200000,57.64,58.04,57.64,57.86,44943710],
            [1325548800000,58.49,58.93,58.43,58.75,75564699],
            [1325635200000,58.57,59.24,58.47,59.06,65061108],
            [1325721600000,59.28,59.79,58.95,59.72,67816805],
            [1325808000000,59.97,60.39,59.89,60.34,79596412],
            [1326067200000,60.79,61.11,60.19,60.25,98505792],
            [1326153600000,60.84,60.86,60.21,60.46,64581762],
            [1326240000000,60.38,60.41,59.90,60.36,53798059],
            [1326326400000,60.33,60.41,59.82,60.20,53180911],
            [1326412800000,59.96,60.06,59.81,59.97,56539749],
            [1326758400000,60.60,60.86,60.42,60.67,60724055],
            [1326844800000,60.99,61.35,60.90,61.30,69197758],
            [1326931200000,61.45,61.62,60.93,61.11,65434453],
            [1327017600000,61.07,61.07,59.96,60.04,103492249],
            [1327276800000,60.38,61.21,60.33,61.06,76515446],
            [1327363200000,60.73,60.73,59.94,60.06,136909311],
            [1327449600000,64.92,64.92,63.39,63.81,239565837],
            [1327536000000,64.05,64.11,63.31,63.52,81057711],
            [1327622400000,63.48,64.07,63.40,63.90,74971631],
            [1327881600000,63.67,64.84,63.63,64.72,94832073],
            [1327968000000,65.08,65.46,64.72,65.21,97977985],
            [1328054400000,65.49,65.57,65.08,65.17,67510562],
            [1328140800000,65.13,65.31,64.85,65.02,46698547],
            [1328227200000,65.33,65.71,65.08,65.67,71717009],
            [1328486400000,65.48,66.43,65.46,66.28,62420596],
            [1328572800000,66.46,67.11,66.37,66.98,79055263],
            [1328659200000,67.21,68.11,67.10,68.10,101969280],
            [1328745600000,68.68,70.96,68.65,70.45,221053602],
            [1328832000000,70.14,71.09,69.79,70.49,157824975],
            [1329091200000,71.36,71.98,71.01,71.80,129301606],
            [1329177600000,72.09,72.79,71.71,72.78,115483011],
            [1329264000000,73.47,75.18,70.98,71.10,376528040],
            [1329350400000,70.21,72.13,69.52,71.74,236137405],
            [1329436800000,71.87,72.54,71.47,71.73,133947191],
            [1329782400000,72.41,73.55,72.02,73.55,151396399],
            [1329868800000,73.30,73.64,72.72,73.29,120823808],
            [1329955200000,73.58,73.98,72.79,73.77,142006312],
            [1330041600000,74.24,74.70,74.09,74.63,103819905],
            [1330300800000,74.47,75.50,73.75,75.11,136895304],
            [1330387200000,75.42,76.49,75.12,76.49,150096478],
            [1330473600000,77.37,78.23,76.53,77.49,238000378],
            [1330560000000,78.31,78.32,76.97,77.78,170813188],
            [1330646400000,77.75,78.11,77.50,77.88,107927589],
            [1330905600000,77.92,78.21,75.14,76.17,202280183],
            [1330992000000,74.81,76.24,73.75,75.75,202559651],
            [1331078400000,76.69,76.83,74.76,75.81,199629549],
            [1331164800000,76.38,77.57,76.02,77.43,129110723],
            [1331251200000,77.74,78.25,77.59,77.88,104724732],
            [1331510400000,78.43,78.86,78.14,78.86,101820019],
            [1331596800000,79.65,81.17,79.39,81.16,172712659],
            [1331683200000,82.58,84.96,82.20,84.23,354709747],
            [1331769600000,85.66,85.72,82.65,83.65,289917768],
            [1331856000000,83.53,84.17,82.57,83.65,206371879],
            [1332115200000,85.48,85.97,84.15,85.87,225308790],
            [1332201600000,85.64,86.70,83.14,86.57,204167033],
            [1332288000000,86.11,87.09,85.92,86.07,161010374],
            [1332374400000,85.40,86.36,85.08,85.62,156032898],
            [1332460800000,85.78,85.97,84.91,85.15,107621815],
            [1332720000000,85.68,86.74,85.04,86.71,148934219],
            [1332806400000,86.60,88.04,86.58,87.78,151782141],
            [1332892800000,88.34,88.78,87.19,88.23,163864869],
            [1332979200000,87.54,88.08,86.75,87.12,152059432],
            [1333065600000,86.97,87.22,85.42,85.65,182759395],
            [1333324800000,85.98,88.40,85.77,88.38,149586458],
            [1333411200000,89.61,90.32,88.93,89.90,208638360],
            [1333497600000,89.19,89.41,88.14,89.19,143245095],
            [1333584000000,89.57,90.67,89.06,90.53,160318858],
            [1333929600000,89.45,91.41,89.33,90.89,149384046],
            [1334016000000,91.42,92.00,89.43,89.78,222422452],
            [1334102400000,90.89,90.98,89.05,89.46,174152769],
            [1334188800000,89.29,90.19,88.64,88.97,153582163],
            [1334275200000,89.16,89.24,86.22,86.46,214911067],
            [1334534400000,87.15,87.18,82.61,82.88,262696056],
            [1334620800000,82.71,87.14,81.70,87.10,256371472],
            [1334707200000,87.67,88.61,86.10,86.91,238632471],
            [1334793600000,85.75,86.39,83.50,83.92,208678365],
            [1334880000000,84.48,84.95,81.49,81.85,257743808],
            [1335139200000,81.52,82.38,79.52,81.67,241629479],
            [1335225600000,80.37,81.10,79.29,80.04,269099838],
            [1335312000000,87.95,88.29,86.57,87.14,226427670],
            [1335398400000,87.75,87.81,86.02,86.81,134016274],
            [1335484800000,86.44,86.60,85.79,86.14,101692500],
            [1335744000000,85.40,85.49,83.29,83.43,126535038],
            [1335830400000,83.56,85.25,83.03,83.16,152749513],
            [1335916800000,82.89,83.91,82.69,83.71,106906016],
            [1336003200000,84.36,84.49,82.90,83.12,97637057],
            [1336089600000,82.44,82.62,80.74,80.75,132497421],
            [1336348800000,80.21,81.82,80.18,81.35,115073217],
            [1336435200000,81.37,81.64,79.82,81.17,124312720],
            [1336521600000,80.53,82.00,80.12,81.31,120175923],
            [1336608000000,82.08,82.27,81.21,81.50,83317752],
            [1336694400000,80.71,82.07,80.62,80.96,99886332],
            [1336953600000,80.37,81.07,79.66,79.75,88156103],
            [1337040000000,80.21,80.46,78.82,79.02,119076678],
            [1337126400000,79.15,79.56,77.29,78.01,140223874],
            [1337212800000,77.90,78.21,75.73,75.73,179304713],
            [1337299200000,76.28,77.63,74.60,75.77,183072463],
            [1337558400000,76.36,80.22,76.29,80.18,157772790],
            [1337644800000,81.36,81.98,78.94,79.57,173696754],
            [1337731200000,79.64,81.83,79.03,81.51,146224365],
            [1337817600000,82.27,82.36,80.18,80.76,124049506],
            [1337904000000,80.66,80.84,79.78,80.33,82116552],
            [1338249600000,81.56,82.00,80.76,81.75,95126346],
            [1338336000000,81.31,82.86,80.94,82.74,132355209],
            [1338422400000,82.96,83.07,81.64,82.53,122977603],
            [1338508800000,81.31,81.81,80.07,80.14,130245094],
            [1338768000000,80.21,81.07,78.36,80.61,139247129],
            [1338854400000,80.18,80.92,79.76,80.40,97053376],
            [1338940800000,81.11,81.98,80.79,81.64,100362262],
            [1339027200000,82.47,82.47,81.50,81.67,94993164],
            [1339113600000,81.66,82.94,81.29,82.90,86872870],
            [1339372800000,83.96,84.07,81.52,81.60,147815696],
            [1339459200000,82.07,82.37,80.96,82.31,108894961],
            [1339545600000,82.07,82.64,81.48,81.74,73443230],
            [1339632000000,81.61,81.93,81.04,81.65,86460283],
            [1339718400000,81.57,82.09,81.36,82.02,83813380],
            [1339977600000,81.57,83.98,81.48,83.68,110102790],
            [1340064000000,83.34,84.29,83.30,83.92,90350932],
            [1340150400000,84.03,84.18,82.97,83.68,89789644],
            [1340236800000,83.63,84.03,82.49,82.52,81626258],
            [1340323200000,82.72,83.17,82.20,83.16,71186311],
            [1340582400000,82.47,82.83,81.48,81.54,76088656],
            [1340668800000,81.62,82.07,81.05,81.72,69187503],
            [1340755200000,82.14,82.39,81.70,82.07,50764770],
            [1340841600000,81.67,82.00,80.80,81.29,70760543],
            [1340928000000,82.57,83.43,82.04,83.43,105360031],
            [1341187200000,83.53,84.78,83.37,84.65,100022776],
            [1341273600000,84.98,85.71,84.86,85.63,60428165],
            [1341446400000,85.79,87.76,85.66,87.13,121095121],
            [1341532800000,86.73,86.92,85.94,86.55,104757156],
            [1341792000000,86.47,87.70,86.30,87.70,94850224],
            [1341878400000,88.28,88.55,86.47,86.89,127989407],
            [1341964800000,86.59,86.81,85.32,86.35,117329366],
            [1342051200000,85.75,86.21,84.67,85.56,106997163],
            [1342137600000,86.14,86.74,85.71,86.42,77904449],
            [1342396800000,86.45,87.37,86.43,86.70,75326342],
            [1342483200000,87.26,87.36,86.16,86.71,73453037],
            [1342569600000,86.66,86.91,86.22,86.61,63174888],
            [1342656000000,87.33,87.91,86.57,87.76,109214567],
            [1342742400000,87.58,87.78,86.24,86.33,99367450],
            [1343001600000,84.91,86.56,83.96,86.26,121993795],
            [1343088000000,86.77,87.10,85.50,85.85,141283044],
            [1343174400000,82.07,82.97,81.43,82.14,219314368],
            [1343260800000,82.82,82.91,81.48,82.13,101702580],
            [1343347200000,82.14,83.69,81.66,83.59,101013241],
            [1343606400000,84.42,85.63,83.97,85.00,94784970],
            [1343692800000,86.18,87.39,86.10,87.25,115581676],
            [1343779200000,87.99,88.06,86.14,86.69,96124742],
            [1343865600000,86.12,87.24,85.75,86.83,83062203],
            [1343952000000,87.66,88.28,87.37,87.96,86228604],
            [1344211200000,88.18,89.27,87.89,88.94,75580008],
            [1344297600000,88.97,89.29,88.29,88.70,72627492],
            [1344384000000,88.48,89.13,88.16,88.55,61176080],
            [1344470400000,88.26,88.82,88.26,88.68,55452586],
            [1344556800000,88.39,88.82,88.39,88.81,48765045],
            [1344816000000,89.06,90.00,89.04,90.00,69707463],
            [1344902400000,90.27,91.23,90.03,90.24,85041824],
            [1344988800000,90.19,90.57,89.68,90.12,64377278],
            [1345075200000,90.17,90.97,90.07,90.91,63694204],
            [1345161600000,91.43,92.60,91.26,92.59,110689894],
            [1345420800000,92.86,95.02,92.84,95.02,153345689],
            [1345507200000,95.83,96.41,92.90,93.72,203176260],
            [1345593600000,93.49,95.57,92.59,95.55,141330637],
            [1345680000000,95.16,95.70,94.45,94.66,105029568],
            [1345766400000,94.22,95.64,93.65,94.75,109334113],
            [1346025600000,97.14,97.27,96.22,96.53,106728601],
            [1346112000000,96.43,96.59,95.81,96.40,66844323],
            [1346198400000,96.46,96.81,96.09,96.21,50701084],
            [1346284800000,95.81,95.94,94.69,94.84,75672793],
            [1346371200000,95.32,95.51,93.89,95.03,84579607],
            [1346716800000,95.11,96.45,94.93,96.42,91972629],
            [1346803200000,96.51,96.62,95.66,95.75,84090475],
            [1346889600000,96.17,96.90,95.83,96.61,97845664],
            [1346976000000,96.86,97.50,96.54,97.21,82416145],
            [1347235200000,97.21,97.61,94.59,94.68,121998898],
            [1347321600000,95.02,95.73,93.79,94.37,125984852],
            [1347408000000,95.26,95.70,93.71,95.68,178054492],
            [1347494400000,96.77,97.93,96.40,97.57,149589629],
            [1347580800000,98.56,99.57,98.27,98.75,150118311],
            [1347840000000,99.91,99.97,99.23,99.97,99507499],
            [1347926400000,99.98,100.33,99.49,100.27,93375667],
            [1348012800000,100.04,100.57,99.94,100.30,81715004],
            [1348099200000,99.88,100.01,99.09,99.81,84141932],
            [1348185600000,100.34,100.72,99.91,100.01,142897076],
            [1348444800000,98.12,99.30,97.57,98.68,159936196],
            [1348531200000,98.32,98.97,96.14,96.22,129690449],
            [1348617600000,95.53,96.10,94.46,95.03,144175906],
            [1348704000000,94.90,97.45,94.34,97.33,148522031],
            [1348790400000,96.96,97.30,95.25,95.30,133777077],
            [1349049600000,95.88,96.68,93.79,94.20,135895921],
            [1349136000000,94.54,95.19,92.95,94.47,156997638],
            [1349222400000,94.98,95.98,94.66,95.92,106069719],
            [1349308800000,95.89,96.32,95.08,95.26,92688813],
            [1349395200000,95.03,95.14,93.04,93.23,148501108],
            [1349654400000,92.41,92.51,90.87,91.17,159494867],
            [1349740800000,91.24,91.50,89.08,90.84,209648887],
            [1349827200000,91.39,92.14,91.00,91.56,127588930],
            [1349913600000,92.40,92.50,89.70,89.70,136520097],
            [1350000000000,89.94,90.77,89.33,89.96,115003665],
            [1350259200000,90.34,90.73,89.12,90.68,108124961],
            [1350345600000,90.77,92.90,90.14,92.83,137442816],
            [1350432000000,92.70,93.26,92.00,92.09,97327643],
            [1350518400000,91.37,91.72,90.00,90.38,119155512],
            [1350604800000,90.15,90.25,87.09,87.12,186021017],
            [1350864000000,87.49,90.77,87.25,90.58,136682392],
            [1350950400000,90.14,90.56,87.39,87.62,176786197],
            [1351036800000,88.78,89.51,87.23,88.12,139631772],
            [1351123200000,88.57,88.86,86.51,87.08,164081393],
            [1351209600000,87.06,87.71,84.43,86.29,254605834],
            [1351641600000,84.98,85.99,83.96,85.05,127500471],
            [1351728000000,85.46,86.14,84.88,85.22,90361922],
            [1351814400000,85.13,85.28,82.11,82.40,149843064],
            [1352073600000,83.36,83.97,82.51,83.52,132321224],
            [1352160000000,84.32,84.39,82.87,83.26,93729041],
            [1352246400000,81.98,82.08,79.39,79.71,198412186],
            [1352332800000,80.09,80.32,76.47,76.82,264036339],
            [1352419200000,77.20,79.27,76.25,78.15,232476496],
            [1352678400000,79.16,79.21,76.95,77.55,128950479],
            [1352764800000,76.99,78.64,76.62,77.56,133302610],
            [1352851200000,77.93,78.21,76.60,76.70,119291977],
            [1352937600000,76.79,77.07,74.66,75.09,197477385],
            [1353024000000,75.03,75.71,72.25,75.38,316722763],
            [1353283200000,77.24,81.07,77.13,80.82,205792965],
            [1353369600000,81.70,81.71,79.23,80.13,160687856],
            [1353456000000,80.61,81.05,79.51,80.24,93306759],
            [1353628800000,81.02,81.71,80.37,81.64,68206579],
            [1353888000000,82.27,84.29,81.96,84.22,157644431],
            [1353974400000,84.22,84.35,82.87,83.54,133328454],
            [1354060800000,82.47,83.69,81.75,83.28,130264981],
            [1354147200000,84.32,84.89,83.61,84.19,128674525],
            [1354233600000,83.83,84.06,83.24,83.61,97824986],
            [1354492800000,84.81,84.94,83.64,83.74,91069097],
            [1354579200000,83.11,83.11,81.73,82.26,139482392],
            [1354665600000,81.27,81.32,76.97,76.97,261159353],
            [1354752000000,75.56,79.04,74.09,78.18,294301791],
            [1354838400000,79.06,79.31,75.71,76.18,196941794],
            [1355097600000,75.00,76.93,74.51,75.69,157620575],
            [1355184000000,77.11,78.51,76.77,77.34,148085903],
            [1355270400000,78.25,78.29,76.61,77.00,121783130],
            [1355356800000,75.88,76.81,75.11,75.67,156314627],
            [1355443200000,73.54,74.02,72.23,72.83,252394499],
            [1355702400000,72.70,74.29,71.60,74.12,189736022],
            [1355788800000,75.00,76.41,74.32,76.27,156417023],
            [1355875200000,75.92,76.24,75.07,75.19,112340424],
            [1355961600000,75.71,75.74,74.13,74.53,120421798],
            [1356048000000,73.21,74.24,72.89,74.19,149129554],
            [1356307200000,74.34,74.89,74.10,74.31,43936977],
            [1356480000000,74.14,74.21,73.02,73.29,75609030],
            [1356566400000,73.36,73.75,72.09,73.58,113779680],
            [1356652800000,72.90,73.50,72.59,72.80,88569243],
            [1356912000000,72.93,76.49,72.71,76.02,164872785],
            [1357084800000,79.12,79.29,77.38,78.43,140124866],
            [1357171200000,78.27,78.52,77.29,77.44,88240950],
            [1357257600000,76.71,76.95,75.12,75.29,148581860],
            [1357516800000,74.60,75.60,73.60,74.80,121038176],
            [1357603200000,75.60,75.98,74.46,75.04,114676751],
            [1357689600000,74.64,75.00,73.71,73.87,101899959],
            [1357776000000,75.51,75.53,73.65,74.79,150285296],
            [1357862400000,74.43,75.05,74.15,74.33,87688741],
            [1358121600000,71.81,72.50,71.22,71.68,183544396],
            [1358208000000,71.19,71.28,69.05,69.42,219192932],
            [1358294400000,70.66,72.78,70.36,72.30,172700045],
            [1358380800000,72.90,72.96,71.72,71.81,113412579],
            [1358467200000,71.22,71.75,70.91,71.43,118287267],
            [1358812800000,72.08,72.55,70.95,72.11,115386173],
            [1358899200000,72.69,73.57,72.11,73.43,215375853],
            [1358985600000,65.71,66.53,64.32,64.36,365212953],
            [1359072000000,64.53,65.18,62.14,62.84,301993503],
            [1359331200000,62.55,64.74,62.27,64.26,196378931],
            [1359417600000,65.50,65.74,64.59,65.47,142768017],
            [1359504000000,65.29,66.09,64.93,65.26,104288317],
            [1359590400000,65.28,65.61,65.00,65.07,79833215],
            [1359676800000,65.59,65.64,64.05,64.80,134867089],
            [1359936000000,64.84,65.13,63.14,63.19,119278754],
            [1360022400000,63.44,65.68,63.17,65.41,143336536],
            [1360108800000,65.21,66.64,64.65,65.34,148426012],
            [1360195200000,66.18,67.14,64.87,66.89,176145074],
            [1360281600000,67.71,68.40,66.89,67.85,158288984],
            [1360540800000,68.07,69.28,67.61,68.56,129358516],
            [1360627200000,68.50,68.91,66.82,66.84,152262712],
            [1360713600000,66.74,67.66,66.17,66.72,118801221],
            [1360800000000,66.36,67.38,66.29,66.66,88876501],
            [1360886400000,66.98,67.17,65.70,65.74,97981177],
            [1361232000000,65.87,66.10,64.84,65.71,108944213],
            [1361318400000,65.38,65.38,64.11,64.12,119074886],
            [1361404800000,63.71,64.17,63.26,63.72,111795180],
            [1361491200000,64.18,64.51,63.80,64.40,82663644],
            [1361750400000,64.84,65.02,63.22,63.26,93144464],
            [1361836800000,63.40,64.51,62.52,64.14,125374074],
            [1361923200000,64.06,64.63,62.95,63.51,146836928],
            [1362009600000,63.44,63.98,63.06,63.06,80628737],
            [1362096000000,62.57,62.60,61.43,61.50,138111792],
            [1362355200000,61.11,61.17,59.86,60.01,145684399],
            [1362441600000,60.21,62.17,60.11,61.59,159607042],
            [1362528000000,62.07,62.18,60.63,60.81,115062269],
            [1362614400000,60.64,61.72,60.15,61.51,117117826],
            [1362700800000,61.40,62.20,61.23,61.67,97898983],
            [1362960000000,61.39,62.72,60.73,62.55,118558356],
            [1363046400000,62.23,62.70,61.08,61.20,116477473],
            [1363132800000,61.21,62.07,60.77,61.19,101454192],
            [1363219200000,61.83,62.09,61.49,61.79,75968746],
            [1363305600000,62.56,63.46,62.46,63.38,160989787],
            [1363564800000,63.06,65.35,63.03,65.10,151549090],
            [1363651200000,65.64,65.85,64.07,64.93,131693310],
            [1363737600000,65.35,65.38,64.23,64.58,77165158],
            [1363824000000,64.32,65.43,64.30,64.68,95813410],
            [1363910400000,64.94,66.01,64.73,65.99,98776111],
            [1364169600000,66.38,67.14,65.97,66.23,125283438],
            [1364256000000,66.49,66.55,65.79,65.88,73573423],
            [1364342400000,65.21,65.26,64.39,64.58,82852294],
            [1364428800000,64.26,64.55,63.09,63.24,110745586],
            [1364774400000,63.13,63.38,61.11,61.27,97432489],
            [1364860800000,61.09,62.59,60.91,61.40,132443234],
            [1364947200000,61.62,62.47,61.47,61.71,90803727],
            [1365033600000,61.97,62.14,60.75,61.10,89664638],
            [1365120000000,60.64,60.71,59.95,60.46,95923478],
            [1365379200000,60.69,61.07,60.36,60.89,75264742],
            [1365465600000,60.91,61.21,60.39,61.00,76688115],
            [1365552000000,61.16,62.44,60.86,62.24,93981748],
            [1365638400000,61.96,62.57,61.60,62.05,82154093],
            [1365724800000,62.02,62.02,61.30,61.40,59681279],
            [1365984000000,61.00,61.13,59.94,59.98,79379706],
            [1366070400000,60.22,60.94,60.08,60.89,76442758],
            [1366156800000,60.04,60.09,56.87,57.54,236263461],
            [1366243200000,57.86,57.97,55.68,56.01,166574163],
            [1366329600000,55.42,57.09,55.01,55.79,152318201],
            [1366588800000,56.09,57.46,55.90,56.95,107479442],
            [1366675200000,57.71,58.34,56.97,58.02,166058949],
            [1366761600000,56.22,59.32,56.07,57.92,242458391],
            [1366848000000,58.75,59.13,58.14,58.34,96209155],
            [1366934400000,58.54,59.82,58.32,59.60,191068990],
            [1367193600000,60.06,61.94,60.00,61.45,160081110],
            [1367280000000,62.16,63.61,61.72,63.25,172884362],
            [1367366400000,63.49,63.56,62.06,62.76,126788697],
            [1367452800000,63.11,64.08,62.95,63.65,105506184],
            [1367539200000,64.47,64.75,64.16,64.28,90381788],
            [1367798400000,65.10,66.03,64.90,65.82,124160162],
            [1367884800000,66.42,66.54,64.81,65.52,120938076],
            [1367971200000,65.58,66.48,65.12,66.26,118149038],
            [1368057600000,65.69,66.14,65.08,65.25,99687476],
            [1368144000000,65.42,65.67,64.35,64.71,83712482],
            [1368403200000,64.50,65.41,64.50,64.96,79277310],
            [1368489600000,64.84,65.03,63.16,63.41,111778940],
            [1368576000000,62.74,63.00,60.34,61.26,185403085],
            [1368662400000,60.46,62.55,59.84,62.08,150866478],
            [1368748800000,62.72,62.87,61.57,61.89,107019829],
            [1369008000000,61.70,63.69,61.44,63.28,112893984],
            [1369094400000,62.59,63.64,62.03,62.81,114074240],
            [1369180800000,63.44,64.05,62.60,63.05,110814858],
            [1369267200000,62.28,63.74,62.26,63.16,88345236],
            [1369353600000,62.98,63.67,62.91,63.59,69106639],
            [1369699200000,64.27,64.44,62.98,63.06,96536188],
            [1369785600000,62.86,63.93,62.77,63.56,82695669],
            [1369872000000,63.66,64.93,63.50,64.51,88428648],
            [1369958400000,64.64,65.30,64.21,64.25,96075042],
            [1370217600000,63.97,64.62,63.21,64.39,93087841],
            [1370304000000,64.75,64.92,63.91,64.19,73181521],
            [1370390400000,63.66,64.39,63.39,63.59,72647337],
            [1370476800000,63.64,63.86,62.01,62.64,104268458],
            [1370563200000,62.36,63.32,61.82,63.12,101185686],
            [1370822400000,63.53,64.15,62.40,62.70,112589043],
            [1370908800000,62.25,63.25,61.90,62.51,71426348],
            [1370995200000,62.79,63.04,61.64,61.74,66356668],
            [1371081600000,61.79,62.45,61.25,62.28,71528086],
            [1371168000000,62.20,62.33,61.21,61.44,65672880],
            [1371427200000,61.63,62.24,61.48,61.71,64860453],
            [1371513600000,61.65,62.13,61.46,61.68,48790448],
            [1371600000000,61.63,61.67,60.43,60.43,77757785],
            [1371686400000,59.90,60.85,59.31,59.55,89374558],
            [1371772800000,59.78,60.00,58.30,59.07,120297338],
            [1372032000000,58.20,58.38,56.86,57.51,120186430],
            [1372118400000,57.96,58.26,56.98,57.52,78584786],
            [1372204800000,57.70,57.83,56.52,56.87,91986573],
            [1372291200000,57.04,57.34,56.22,56.25,84350049],
            [1372377600000,55.91,57.18,55.55,56.65,144659417],
            [1372636800000,57.53,58.90,57.32,58.46,97793045],
            [1372723200000,58.57,60.23,58.50,59.78,117521579],
            [1372809600000,60.12,60.43,59.64,60.11,60232158],
            [1372982400000,60.06,60.47,59.34,59.63,68520760],
            [1373241600000,60.02,60.14,58.66,59.29,74578420],
            [1373328000000,59.09,60.50,58.63,60.34,88172238],
            [1373414400000,59.94,60.69,59.75,60.10,70350819],
            [1373500800000,60.42,61.18,60.17,61.04,81618964],
            [1373587200000,61.09,61.40,60.49,60.93,69910463],
            [1373846400000,60.72,61.64,60.69,61.06,60543105],
            [1373932800000,60.93,61.53,60.60,61.46,54134367],
            [1374019200000,61.39,61.75,61.17,61.47,49764064],
            [1374105600000,61.91,62.12,61.52,61.68,54760818],
            [1374192000000,61.87,62.00,60.62,60.71,67194715],
            [1374451200000,61.35,61.39,60.78,60.90,51997596],
            [1374537600000,60.86,60.99,59.82,59.86,92348403],
            [1374624000000,62.70,63.51,62.18,62.93,148013824],
            [1374710400000,62.96,63.06,62.26,62.64,57420636],
            [1374796800000,62.19,63.01,62.05,63.00,50068753],
            [1375056000000,62.97,64.28,62.89,63.97,62110300],
            [1375142400000,64.28,65.31,64.18,64.76,77355565],
            [1375228800000,65.00,65.33,64.20,64.65,80739351],
            [1375315200000,65.11,65.26,64.75,65.24,51562322],
            [1375401600000,65.43,66.12,65.24,66.08,68695326],
            [1375660800000,66.38,67.24,66.02,67.06,79713592],
            [1375747200000,66.86,67.41,66.02,66.46,83728540],
            [1375833600000,66.26,66.71,65.97,66.43,74713968],
            [1375920000000,66.26,66.30,65.42,65.86,63999838],
            [1376006400000,65.52,65.78,64.81,64.92,66905209],
            [1376265600000,65.27,66.95,65.23,66.77,91108290],
            [1376352000000,67.28,70.67,66.86,69.94,220484936],
            [1376438400000,71.13,72.04,70.49,71.21,189092911],
            [1376524800000,70.92,71.77,69.87,71.13,122573507],
            [1376611200000,71.45,71.85,71.27,71.76,90575856],
            [1376870400000,72.05,73.39,72.00,72.53,127629481],
            [1376956800000,72.82,72.94,71.55,71.58,89671743],
            [1377043200000,71.94,72.45,71.60,71.77,83969305],
            [1377129600000,72.14,72.23,71.17,71.85,61051676],
            [1377216000000,71.90,71.91,71.34,71.57,55682221],
            [1377475200000,71.54,72.89,71.50,71.85,82741050],
            [1377561600000,71.14,71.79,69.47,69.80,106047109],
            [1377648000000,69.43,70.83,69.43,70.13,76901678],
            [1377734400000,70.24,70.93,70.16,70.24,59913714],
            [1377820800000,70.29,70.42,69.50,69.60,68100788],
            [1378166400000,70.44,71.51,69.62,69.80,83025166],
            [1378252800000,71.37,71.75,70.90,71.24,86257878],
            [1378339200000,71.46,71.53,70.52,70.75,59091879],
            [1378425600000,71.21,71.34,69.99,71.17,89881253],
            [1378684800000,72.14,72.56,71.93,72.31,85171583],
            [1378771200000,72.31,72.49,69.93,70.66,185798872],
            [1378857600000,66.72,67.67,66.40,66.82,223526688],
            [1378944000000,66.93,67.91,66.57,67.53,101012471],
            [1379030400000,67.05,67.40,66.39,66.41,74708438],
            [1379289600000,65.86,65.94,63.89,64.30,137137665],
            [1379376000000,63.99,65.67,63.93,65.05,99844773],
            [1379462400000,66.17,66.62,65.81,66.38,114215304],
            [1379548800000,67.24,67.98,67.04,67.47,101134712],
            [1379635200000,68.29,68.36,66.57,66.77,174825322],
            [1379894400000,70.87,70.99,68.94,70.09,190526525],
            [1379980800000,70.70,70.78,69.69,69.87,91085743],
            [1380067200000,69.89,69.95,68.78,68.79,79239167],
            [1380153600000,69.43,69.79,69.13,69.46,59305183],
            [1380240000000,69.11,69.24,68.67,68.96,57009729],
            [1380499200000,68.18,68.81,67.77,68.11,65039408],
            [1380585600000,68.35,69.88,68.34,69.71,88470655],
            [1380672000000,69.38,70.26,69.11,69.94,72295902],
            [1380758400000,70.07,70.34,68.68,69.06,80688503],
            [1380844800000,69.12,69.23,68.37,69.00,64717380],
            [1381104000000,69.51,70.38,69.34,69.68,78073107],
            [1381190400000,69.99,70.09,68.65,68.71,72729006],
            [1381276800000,69.23,69.68,68.33,69.51,75431216],
            [1381363200000,70.19,70.34,69.58,69.95,69650490],
            [1381449600000,69.57,70.55,69.31,70.40,66934938],
            [1381708800000,69.98,71.08,69.91,70.86,65474542],
            [1381795200000,71.07,71.71,70.79,71.24,80018603],
            [1381881600000,71.54,71.79,71.32,71.59,62775013],
            [1381968000000,71.43,72.11,71.38,72.07,63398335],
            [1382054400000,72.28,72.75,72.24,72.70,72635570],
            [1382313600000,73.11,74.90,73.07,74.48,99526945],
            [1382400000000,75.20,75.49,72.58,74.27,133515753],
            [1382486400000,74.14,75.10,74.14,74.99,78431122],
            [1382572800000,75.00,76.07,74.64,75.99,96191095],
            [1382659200000,75.90,76.18,75.02,75.14,84448133],
            [1382918400000,75.58,75.86,74.74,75.70,137610123],
            [1383004800000,76.61,77.04,73.51,73.81,158952115],
            [1383091200000,74.23,75.36,73.86,74.98,88540697],
            [1383177600000,75.00,75.36,74.47,74.67,68923785],
            [1383264000000,74.86,74.97,73.69,74.29,68722304],
            [1383523200000,74.44,75.26,74.12,75.25,61157033],
            [1383609600000,74.94,75.56,74.71,75.06,66368071],
            [1383696000000,74.88,74.98,74.03,74.42,55844152],
            [1383782400000,74.23,74.74,73.20,73.21,65655100],
            [1383868800000,73.51,74.45,73.23,74.37,69829543],
            [1384128000000,74.28,74.52,73.49,74.15,56863303],
            [1384214400000,73.95,74.85,73.86,74.29,51114651],
            [1384300800000,74.00,74.61,73.85,74.38,49304927],
            [1384387200000,74.69,75.61,74.55,75.45,70605087],
            [1384473600000,75.23,75.58,74.93,75.00,79479764],
            [1384732800000,75.00,75.31,74.03,74.09,61236224],
            [1384819200000,74.15,74.77,74.00,74.22,52234707],
            [1384905600000,74.18,74.35,73.48,73.57,48545798],
            [1384992000000,73.94,74.46,73.38,74.45,65506861],
            [1385078400000,74.22,74.59,74.08,74.26,55931232],
            [1385337600000,74.43,75.12,74.43,74.82,57348403],
            [1385424000000,74.87,76.59,74.86,76.20,100345728],
            [1385510400000,76.62,78.00,76.20,77.99,90861841],
            [1385683200000,78.50,79.76,78.26,79.44,79532215],
            [1385942400000,79.71,80.62,78.69,78.75,118135885],
            [1386028800000,79.76,80.91,79.67,80.90,112741734],
            [1386115200000,80.79,81.31,80.12,80.71,94452666],
            [1386201600000,81.81,82.16,80.92,81.13,111895315],
            [1386288000000,80.83,80.96,79.94,80.00,86088352],
            [1386547200000,80.14,81.37,80.13,80.92,80123533],
            [1386633600000,80.52,81.13,80.17,80.79,69567610],
            [1386720000000,81.01,81.57,79.96,80.19,89929693],
            [1386806400000,80.38,80.76,80.00,80.08,65572318],
            [1386892800000,80.34,80.41,79.10,79.20,83205283],
            [1387152000000,79.37,80.38,79.29,79.64,70648452],
            [1387238400000,79.39,79.92,79.05,79.28,57475649],
            [1387324800000,78.21,78.78,76.97,78.68,141465807],
            [1387411200000,78.38,78.57,77.68,77.78,80239369],
            [1387497600000,77.91,78.80,77.83,78.43,109103435],
            [1387756800000,81.14,81.53,80.39,81.44,125326831],
            [1387843200000,81.41,81.70,80.86,81.10,41888735],
            [1388016000000,81.16,81.36,80.48,80.56,51002035],
            [1388102400000,80.55,80.63,79.93,80.01,56471317],
            [1388361600000,79.64,80.01,78.90,79.22,63407722],
            [1388448000000,79.17,80.18,79.14,80.15,55819372],
            [1388620800000,79.38,79.58,78.86,79.02,58791957],
            [1388707200000,78.98,79.10,77.20,77.28,98303870],
            [1388966400000,76.78,78.11,76.23,77.70,103359151],
            [1389052800000,77.76,77.99,76.85,77.15,79432766],
            [1389139200000,76.97,77.94,76.96,77.64,64686685],
            [1389225600000,78.11,78.12,76.48,76.65,69905199],
            [1389312000000,77.12,77.26,75.87,76.13,76320664],
            [1389571200000,75.70,77.50,75.70,76.53,94860843],
            [1389657600000,76.89,78.10,76.81,78.06,83734371],
            [1389744000000,79.07,80.03,78.81,79.62,98472619],
            [1389830400000,79.27,79.55,78.81,79.18,57471330],
            [1389916800000,78.78,78.87,77.13,77.24,108426689],
            [1390262400000,77.28,78.58,77.20,78.44,82255544],
            [1390348800000,78.70,79.61,78.26,78.79,95219334],
            [1390435200000,78.56,79.50,77.83,79.45,100978346],
            [1390521600000,79.14,79.37,77.82,78.01,108384437],
            [1390780800000,78.58,79.26,77.96,78.64,144219152],
            [1390867200000,72.68,73.57,71.72,72.36,266833581],
            [1390953600000,71.99,72.48,71.23,71.54,125942796],
            [1391040000000,71.79,72.36,70.96,71.40,169762789],
            [1391126400000,70.74,71.65,70.51,71.51,116336444],
            [1391385600000,71.80,72.53,71.33,71.65,100620772],
            [1391472000000,72.26,72.78,71.82,72.68,94273543],
            [1391558400000,72.37,73.61,72.32,73.23,82322156],
            [1391644800000,72.87,73.36,72.54,73.22,64497223],
            [1391731200000,74.48,74.70,73.91,74.24,93638601],
            [1391990400000,74.09,76.00,74.00,75.57,86451022],
            [1392076800000,75.80,76.82,75.64,76.57,70672252],
            [1392163200000,76.71,77.08,76.18,76.56,77127064],
            [1392249600000,76.38,77.84,76.31,77.78,76960156],
            [1392336000000,77.50,78.00,77.32,77.71,68468036],
            [1392681600000,78.00,78.74,77.94,78.00,65306248],
            [1392768000000,77.82,78.13,76.34,76.77,78554420],
            [1392854400000,76.14,76.71,75.57,75.88,76529103],
            [1392940800000,76.11,76.37,74.94,75.04,69757247],
            [1393200000000,74.74,75.70,74.63,75.36,72364950],
            [1393286400000,75.63,75.65,74.43,74.58,58247350],
            [1393372800000,74.80,75.00,73.66,73.91,69131286],
            [1393459200000,73.88,75.54,73.72,75.38,75557321],
            [1393545600000,75.58,76.11,74.59,75.18,93074653],
            [1393804800000,74.77,75.81,74.69,75.39,59784494],
            [1393891200000,75.86,76.09,75.40,75.89,64884834],
            [1393977600000,75.85,76.39,75.59,76.05,50065519],
            [1394064000000,76.11,76.35,75.44,75.82,46423111],
            [1394150400000,75.87,76.00,75.15,75.78,55415241],
            [1394409600000,75.48,76.19,75.48,75.85,44691430],
            [1394496000000,76.49,76.96,76.08,76.58,70198849],
            [1394582400000,76.36,76.76,76.00,76.66,50195460],
            [1394668800000,76.78,77.09,75.59,75.81,64435609],
            [1394755200000,75.54,75.84,74.71,74.96,59299492],
            [1395014400000,75.39,75.71,75.12,75.25,49886074],
            [1395100800000,75.13,76.00,75.03,75.91,52411863],
            [1395187200000,76.04,76.61,75.57,75.89,56188958],
            [1395273600000,75.70,76.10,75.34,75.53,52099537],
            [1395360000000,75.99,76.25,75.19,76.12,93612169],
            [1395619200000,76.92,77.21,76.44,77.03,88924871],
            [1395705600000,77.36,77.96,77.08,77.86,70573356],
            [1395792000000,78.07,78.43,76.98,77.11,74942224],
            [1395878400000,77.14,77.36,76.45,76.78,55507676],
            [1395964800000,76.90,76.99,76.32,76.69,50141063],
            [1396224000000,77.03,77.26,76.56,76.68,42167188],
            [1396310400000,76.82,77.41,76.68,77.38,50189685],
            [1396396800000,77.48,77.64,77.18,77.51,45104871],
            [1396483200000,77.34,77.50,76.81,76.97,40648111],
            [1396569600000,77.12,77.14,75.80,75.97,68812485],
            [1396828800000,75.43,75.84,74.56,74.78,72462530],
            [1396915200000,75.03,75.16,74.10,74.78,60971883],
            [1397001600000,74.66,75.78,74.57,75.76,51542722],
            [1397088000000,75.81,76.03,74.74,74.78,59912818],
            [1397174400000,74.14,74.69,73.88,74.23,67975012],
            [1397433600000,74.56,74.59,73.89,74.53,51445177],
            [1397520000000,74.32,74.52,73.05,73.99,66622577],
            [1397606400000,74.01,74.44,73.45,74.14,53732994],
            [1397692800000,74.29,75.39,74.17,74.99,71106721],
            [1398038400000,75.05,76.02,74.85,75.88,45668931],
            [1398124800000,75.47,75.98,75.21,75.96,50664453],
            [1398211200000,75.58,75.88,74.92,74.96,98735259],
            [1398297600000,81.17,81.43,80.10,81.11,189978082],
            [1398384000000,80.65,81.71,80.57,81.71,97568814],
            [1398643200000,81.83,85.11,81.79,84.87,167371680],
            [1398729600000,84.82,85.14,84.22,84.62,84344673],
            [1398816000000,84.66,85.63,84.26,84.30,114220883],
            [1398902400000,84.57,84.97,83.77,84.50,61052418],
            [1398988800000,84.62,84.89,84.24,84.65,47878572],
            [1399248000000,84.31,85.86,84.29,85.85,71766758],
            [1399334400000,85.97,86.34,84.92,84.92,93641373],
            [1399420800000,85.04,85.33,83.96,84.62,70715988],
            [1399507200000,84.04,84.92,83.77,84.00,57574363],
            [1399593600000,83.51,83.75,82.90,83.65,72899498],
            [1399852800000,83.93,84.81,83.91,84.69,53324677],
            [1399939200000,84.57,84.93,84.39,84.82,39934594],
            [1400025600000,84.63,85.34,84.53,84.84,41600846],
            [1400112000000,84.96,85.23,84.01,84.12,57711731],
            [1400198400000,84.09,85.36,83.63,85.36,69091834],
            [1400457600000,85.41,86.76,85.33,86.37,79439024],
            [1400544000000,86.36,86.63,85.82,86.39,58708986],
            [1400630400000,86.26,86.67,86.01,86.62,49249914],
            [1400716800000,86.66,87.12,86.30,86.75,50218945],
            [1400803200000,86.75,87.82,86.64,87.73,58052491],
            [1401148800000,87.98,89.41,87.95,89.38,87216605],
            [1401235200000,89.43,89.98,89.11,89.14,78921885],
            [1401321600000,89.69,90.98,89.68,90.77,94118633],
            [1401408000000,91.14,92.02,89.84,90.43,141005137],
            [1401667200000,90.57,90.69,88.93,89.81,92337903],
            [1401753600000,89.78,91.25,89.75,91.08,73231620],
            [1401840000000,91.06,92.56,90.87,92.12,83870521],
            [1401926400000,92.31,92.77,91.80,92.48,75951141],
            [1402012800000,92.84,93.04,92.07,92.22,87620911],
            [1402272000000,92.70,93.88,91.75,93.70,75414804],
            [1402358400000,94.73,95.05,93.57,94.25,62777042],
            [1402444800000,94.13,94.76,93.47,93.86,45681114],
            [1402531200000,94.04,94.12,91.90,92.29,54748791],
            [1402617600000,92.20,92.44,90.88,91.28,54525280],
            [1402876800000,91.51,92.75,91.45,92.20,35561270],
            [1402963200000,92.31,92.70,91.80,92.08,29726347],
            [1403049600000,92.27,92.29,91.35,92.18,33514108],
            [1403136000000,92.29,92.30,91.34,91.86,35527686],
            [1403222400000,91.85,92.55,90.90,90.91,100898066],
            [1403481600000,91.32,91.62,90.60,90.83,43694391],
            [1403568000000,90.75,91.74,90.19,90.28,39036087],
            [1403654400000,90.21,90.70,89.65,90.36,36868541],
            [1403740800000,90.37,91.05,89.80,90.90,32629359],
            [1403827200000,90.82,92.00,90.77,91.98,64028803],
            [1404086400000,92.10,93.72,92.09,92.93,49589028],
            [1404172800000,93.52,94.07,93.13,93.52,38223477],
            [1404259200000,93.86,94.06,93.09,93.48,28465073],
            [1404345600000,93.67,94.10,93.20,94.03,22891753],
            [1404691200000,94.14,95.99,94.10,95.97,56467939],
            [1404777600000,96.27,96.80,93.92,95.35,65221678],
            [1404864000000,95.44,95.95,94.76,95.39,36436440],
            [1404950400000,93.76,95.55,93.52,95.04,39685552],
            [1405036800000,95.36,95.89,94.86,95.22,34018228],
            [1405296000000,95.86,96.89,95.65,96.45,42810155],
            [1405382400000,96.80,96.85,95.03,95.32,45696176],
            [1405468800000,96.97,97.10,94.74,94.78,53502415],
            [1405555200000,95.03,95.28,92.57,93.09,57298243],
            [1405641600000,93.62,94.74,93.02,94.43,49987593],
            [1405900800000,94.99,95.00,93.72,93.94,39079002],
            [1405987200000,94.68,94.89,94.12,94.72,55196597],
            [1406073600000,95.42,97.88,95.17,97.19,92917719],
            [1406160000000,97.04,97.32,96.42,97.03,45728843],
            [1406246400000,96.85,97.84,96.64,97.67,43469117],
            [1406505600000,97.82,99.24,97.55,99.02,55317689],
            [1406592000000,99.33,99.44,98.25,98.38,43143095],
            [1406678400000,98.44,98.70,97.67,98.15,33010001],
            [1406764800000,97.16,97.45,95.33,95.60,56842647],
            [1406851200000,94.90,96.62,94.81,96.13,48511286],
            [1407110400000,96.37,96.58,95.17,95.59,39958144],
            [1407196800000,95.36,95.68,94.36,95.12,55932663],
            [1407283200000,94.75,95.48,94.71,94.96,38558342],
            [1407369600000,94.93,95.95,94.10,94.48,46711179],
            [1407456000000,94.26,94.82,93.28,94.74,41865193],
            [1407715200000,95.27,96.08,94.84,95.99,36584844],
            [1407801600000,96.04,96.88,95.61,95.97,33795352],
            [1407888000000,96.15,97.24,96.04,97.24,31916439],
            [1407974400000,97.33,97.57,96.80,97.50,28115566],
            [1408060800000,97.90,98.19,96.86,97.98,48951331],
            [1408320000000,98.49,99.37,97.98,99.16,47572413],
            [1408406400000,99.41,100.68,99.32,100.53,69399270],
            [1408492800000,100.44,101.09,99.95,100.57,52699192],
            [1408579200000,100.57,100.94,100.11,100.58,33478198],
            [1408665600000,100.29,101.47,100.19,101.32,44183834],
            [1408924800000,101.79,102.17,101.28,101.54,40270173],
            [1409011200000,101.42,101.50,100.86,100.89,33151984],
            [1409097600000,101.02,102.57,100.70,102.13,52369011],
            [1409184000000,102.13,102.78,101.56,102.25,68459801],
            [1409270400000,102.86,102.90,102.20,102.50,44595247],
            [1409616000000,103.06,103.74,102.72,103.30,53564262],
            [1409702400000,103.10,103.20,98.58,98.94,125420521],
            [1409788800000,98.85,100.09,97.79,98.12,85718221],
            [1409875200000,98.80,99.39,98.31,98.97,58457035],
            [1410134400000,99.30,99.31,98.05,98.36,46356742],
            [1410220800000,99.08,103.08,96.14,97.99,189846255],
            [1410307200000,98.01,101.11,97.76,101.00,100869587],
            [1410393600000,100.41,101.44,99.62,101.43,62399743],
            [1410480000000,101.21,102.19,101.08,101.66,64096903],
            [1410739200000,102.81,103.05,101.44,101.63,61316516],
            [1410825600000,99.80,101.26,98.89,100.86,66908133],
            [1410912000000,101.27,101.80,100.59,101.58,60926498],
            [1410998400000,101.93,102.35,101.56,101.79,37299435],
            [1411084800000,102.29,102.35,100.88,100.96,70902406],
            [1411344000000,101.80,102.14,100.58,101.06,52788426],
            [1411430400000,100.60,102.94,100.54,102.64,63402196],
            [1411516800000,102.16,102.85,101.20,101.75,60171828],
            [1411603200000,100.51,100.71,97.72,97.87,100091990],
            [1411689600000,98.53,100.75,98.40,100.75,62370501],
            [1411948800000,98.65,100.44,98.63,100.11,49766312],
            [1412035200000,100.81,101.54,100.53,100.75,55264139],
            [1412121600000,100.59,100.69,98.70,99.18,51491286],
            [1412208000000,99.27,100.22,98.04,99.90,47757828],
            [1412294400000,99.44,100.21,99.04,99.62,43469585],
            [1412553600000,99.95,100.65,99.42,99.62,37051182],
            [1412640000000,99.43,100.12,98.73,98.75,42094183],
            [1412726400000,98.76,101.11,98.31,100.80,57404674],
            [1412812800000,101.54,102.38,100.61,101.02,77376525],
            [1412899200000,100.69,102.03,100.30,100.73,66331592],
            [1413158400000,101.33,101.78,99.81,99.81,53583368],
            [1413244800000,100.39,100.52,98.57,98.75,63688562],
            [1413331200000,97.97,99.15,95.18,97.54,100933600],
            [1413417600000,95.55,97.72,95.41,96.26,72154523],
            [1413504000000,97.50,99.00,96.81,97.67,68179688],
            [1413763200000,98.32,99.96,98.22,99.76,77517279],
            [1413849600000,103.02,103.02,101.27,102.47,94623904],
            [1413936000000,102.84,104.11,102.60,102.99,68263146],
            [1414022400000,104.08,105.05,103.63,104.83,71074674],
            [1414108800000,105.18,105.49,104.53,105.22,47053916],
            [1414368000000,104.85,105.48,104.70,105.11,34187701],
            [1414454400000,105.40,106.74,105.35,106.74,48060949],
            [1414540800000,106.65,107.37,106.36,107.34,52687879],
            [1414627200000,106.96,107.35,105.90,106.98,40654793],
            [1414713600000,108.01,108.04,107.21,108.00,44639285],
            [1414972800000,108.22,110.30,108.01,109.40,52282550],
            [1415059200000,109.36,109.49,107.72,108.60,41574365],
            [1415145600000,109.10,109.30,108.12,108.86,37435905],
            [1415232000000,108.60,108.79,107.80,108.70,34968457],
            [1415318400000,108.75,109.32,108.55,109.01,33691535],
            [1415577600000,109.02,109.33,108.67,108.83,27195547],
            [1415664000000,108.70,109.75,108.40,109.70,27442252],
            [1415750400000,109.38,111.43,109.37,111.25,46942431],
            [1415836800000,111.80,113.45,111.60,112.82,59522855],
            [1415923200000,113.15,114.19,113.05,114.18,44063595],
            [1416182400000,114.27,117.28,113.30,113.99,46746712],
            [1416268800000,113.94,115.69,113.89,115.47,44223978],
            [1416355200000,115.44,115.74,113.80,114.67,41869160],
            [1416441600000,114.91,116.86,114.85,116.31,43395537],
            [1416528000000,117.51,117.57,116.03,116.47,57179298],
            [1416787200000,116.85,118.77,116.62,118.62,47450824],
            [1416873600000,119.07,119.75,117.45,117.60,68840440],
            [1416960000000,117.94,119.10,117.83,119.00,40831886],
            [1417132800000,119.27,119.40,118.05,118.93,24814402],
            [1417392000000,118.81,119.25,111.27,115.07,83814037],
            [1417478400000,113.50,115.75,112.75,114.63,59348940],
            [1417564800000,115.75,116.35,115.11,115.93,43063440],
            [1417651200000,115.77,117.20,115.29,115.49,42155776],
            [1417737600000,115.99,116.08,114.64,115.00,38318895],
            [1417996800000,114.10,114.65,111.62,112.40,57664850],
            [1418083200000,110.19,114.30,109.35,114.12,60208036],
            [1418169600000,114.41,114.85,111.54,111.95,44565318],
            [1418256000000,112.26,113.80,111.34,111.62,41471578],
            [1418342400000,110.46,111.87,109.58,109.73,56028138],
            [1418601600000,110.70,111.60,106.35,108.22,67218082],
            [1418688000000,106.37,110.16,106.26,106.74,60790733],
            [1418774400000,107.12,109.84,106.82,109.41,53411773],
            [1418860800000,111.87,112.65,110.66,112.65,59006218],
            [1418947200000,112.26,113.24,111.66,111.78,88429770],
            [1419206400000,112.16,113.49,111.97,112.94,45167549],
            [1419292800000,113.23,113.33,112.46,112.54,26028419],
            [1419379200000,112.58,112.71,112.01,112.01,14479611],
            [1419552000000,112.10,114.52,112.01,113.99,33720951],
            [1419811200000,113.79,114.77,113.70,113.91,27598920],
            [1419897600000,113.64,113.92,112.11,112.52,29881477],
            [1419984000000,112.82,113.13,110.21,110.38,41403351],
            [1420156800000,111.39,111.44,107.35,109.33,53204626],
            [1420416000000,108.29,108.65,105.41,106.25,64285491],
            [1420502400000,106.54,107.43,104.63,106.26,65797116],
            [1420588800000,107.20,108.20,106.70,107.75,40105934],
            [1420675200000,109.23,112.15,108.70,111.89,59364547],
            [1420761600000,112.67,113.25,110.21,112.01,53699527],
            [1421020800000,112.60,112.63,108.80,109.25,49650790],
            [1421107200000,111.43,112.80,108.91,110.22,67091928],
            [1421193600000,109.04,110.49,108.50,109.80,48956588],
            [1421280000000,110.00,110.06,106.66,106.82,60013996],
            [1421366400000,107.03,107.58,105.20,105.99,78513345],
            [1421712000000,107.84,108.97,106.50,108.72,49899907],
            [1421798400000,108.95,111.06,108.27,109.55,48575897],
            [1421884800000,110.26,112.47,109.72,112.40,53796409],
            [1421971200000,112.30,113.75,111.53,112.98,46464828],
            [1422230400000,113.74,114.36,112.80,113.10,55614979],
            [1422316800000,112.42,112.48,109.03,109.14,95568749],
            [1422403200000,117.62,118.12,115.31,115.31,146477063],
            [1422489600000,116.32,119.19,115.56,118.90,84436432],
            [1422576000000,118.40,120.00,116.85,117.16,83745461],
            [1422835200000,118.05,119.17,116.08,118.63,62739100],
            [1422921600000,118.50,119.09,117.61,118.65,51915749],
            [1423008000000,118.50,120.51,118.31,119.56,70149743],
            [1423094400000,120.02,120.23,119.25,119.94,42246245],
            [1423180800000,120.02,120.25,118.45,118.93,43706567],
            [1423440000000,118.55,119.84,118.43,119.72,38889797],
            [1423526400000,120.17,122.15,120.16,122.02,62008506],
            [1423612800000,122.77,124.92,122.50,124.88,73561797],
            [1423699200000,126.06,127.48,125.57,126.46,74474466],
            [1423785600000,127.28,127.28,125.65,127.08,54272219],
            [1424131200000,127.49,128.88,126.92,127.83,63152405],
            [1424217600000,127.62,128.78,127.45,128.72,44891737],
            [1424304000000,128.48,129.03,128.33,128.45,37362381],
            [1424390400000,128.62,129.50,128.05,129.50,48948419],
            [1424649600000,130.02,133.00,129.66,133.00,70974110],
            [1424736000000,132.94,133.60,131.17,132.17,69228130],
            [1424822400000,131.56,131.60,128.15,128.79,74711746],
            [1424908800000,128.78,130.87,126.61,130.42,91287529],
            [1424995200000,130.00,130.57,128.24,128.46,62014847],
            [1425254400000,129.25,130.28,128.30,129.09,48096663],
            [1425340800000,128.96,129.52,128.09,129.36,37816283],
            [1425427200000,129.10,129.56,128.32,128.54,31666340],
            [1425513600000,128.58,128.75,125.76,126.41,56517146],
            [1425600000000,128.40,129.37,126.26,126.60,72842060],
            [1425859200000,127.96,129.57,125.06,127.14,88528487],
            [1425945600000,126.41,127.22,123.80,124.51,68856582],
            [1426032000000,124.75,124.77,122.11,122.24,68938974],
            [1426118400000,122.31,124.90,121.63,124.45,48362719],
            [1426204800000,124.40,125.40,122.58,123.59,51827283],
            [1426464000000,123.88,124.95,122.87,124.95,35874300],
            [1426550400000,125.90,127.32,125.65,127.04,51023104],
            [1426636800000,127.00,129.16,126.37,128.47,65270945],
            [1426723200000,128.75,129.25,127.40,127.50,45809490],
            [1426809600000,128.25,128.40,125.16,125.90,68695136],
            [1427068800000,127.12,127.85,126.52,127.21,37709674],
            [1427155200000,127.23,128.04,126.56,126.69,32842304],
            [1427241600000,126.54,126.82,123.38,123.38,51655177],
            [1427328000000,122.76,124.88,122.60,124.24,47572869],
            [1427414400000,124.57,124.70,122.91,123.25,39546151],
            [1427673600000,124.05,126.40,124.00,126.37,47099670],
            [1427760000000,126.09,126.49,124.36,124.43,42090553],
            [1427846400000,124.82,125.12,123.10,124.25,40621437],
            [1427932800000,125.03,125.56,124.19,125.32,32220131],
            [1428278400000,124.47,127.51,124.33,127.35,37193975],
            [1428364800000,127.64,128.12,125.98,126.01,35012268],
            [1428451200000,125.85,126.40,124.97,125.60,37329243],
            [1428537600000,125.85,126.58,124.66,126.56,32483974],
            [1428624000000,125.95,127.21,125.26,127.10,40187953],
            [1428883200000,128.37,128.57,126.61,126.85,36365123],
            [1428969600000,127.00,127.29,125.91,126.30,25524593],
            [1429056000000,126.41,127.13,126.01,126.78,28970419],
            [1429142400000,126.28,127.10,126.11,126.17,28368987],
            [1429228800000,125.55,126.14,124.46,124.75,51957046],
            [1429488000000,125.57,128.12,125.17,127.60,47054310],
            [1429574400000,128.10,128.20,126.67,126.91,32435057],
            [1429660800000,126.99,128.87,126.32,128.62,37654505],
            [1429747200000,128.30,130.42,128.14,129.67,45770902],
            [1429833600000,130.49,130.63,129.23,130.28,44525905],
            [1430092800000,132.31,133.13,131.15,132.65,96954207],
            [1430179200000,134.46,134.54,129.57,130.56,118923970],
            [1430265600000,130.16,131.59,128.30,128.64,63386083],
            [1430352000000,128.64,127.88,124.58,125.15,83195423],
            [1430438400000,126.10,130.13,125.30,128.95,58512638],
            [1430697600000,129.50,130.57,128.26,128.70,50988278],
            [1430784000000,128.15,128.45,125.78,125.80,49271416],
            [1430870400000,126.56,126.75,123.36,125.01,72141010],
            [1430956800000,124.77,126.08,124.02,125.26,43940895],
            [1431043200000,126.68,127.62,126.11,127.62,55550382],
            [1431302400000,127.39,127.56,125.62,126.32,42035757],
            [1431388800000,125.60,126.88,124.82,125.86,48160032],
            [1431475200000,126.15,127.19,125.87,126.01,34694235],
            [1431561600000,127.41,128.95,127.16,128.95,45203456],
            [1431648000000,129.07,129.49,128.21,128.77,38208034],
            [1431907200000,128.38,130.72,128.36,130.19,50882918],
            [1431993600000,130.69,130.88,129.64,130.07,44633240],
            [1432080000000,130.00,130.98,129.34,130.06,36454932],
            [1432166400000,130.07,131.63,129.83,131.39,39730364],
            [1432252800000,131.60,132.97,131.40,132.54,45595972],
            [1432598400000,132.60,132.91,129.12,129.62,70697560],
            [1432684800000,130.34,132.26,130.05,132.04,45833246],
            [1432771200000,131.86,131.95,131.10,131.78,30733309],
            [1432857600000,131.23,131.45,129.90,130.28,50884452],
            [1433116800000,130.28,131.39,130.05,130.54,32112797],
            [1433203200000,129.86,130.66,129.32,129.96,33667627],
            [1433289600000,130.66,130.94,129.90,130.12,30983542],
            [1433376000000,129.58,130.58,128.91,129.36,38450118],
            [1433462400000,129.50,129.69,128.36,128.65,35626800],
            [1433721600000,128.90,129.21,126.83,127.80,52674786],
            [1433808000000,126.70,128.08,125.62,127.42,56075420],
            [1433894400000,127.92,129.34,127.85,128.88,39087250],
            [1433980800000,129.18,130.18,128.48,128.59,35390887],
            [1434067200000,128.18,128.33,127.11,127.17,36886246],
            [1434326400000,126.10,127.24,125.71,126.92,43988946],
            [1434412800000,127.03,127.85,126.37,127.60,31494131],
            [1434499200000,127.72,127.88,126.74,127.30,32918071],
            [1434585600000,127.23,128.31,127.22,127.88,35407220],
            [1434672000000,127.71,127.82,126.40,126.60,54716887],
            [1434931200000,127.49,128.06,127.08,127.61,34039345],
            [1435017600000,127.48,127.61,126.88,127.03,30268863],
            [1435104000000,127.21,129.80,127.12,128.11,55280855],
            [1435190400000,128.86,129.20,127.50,127.50,31938100],
            [1435276800000,127.67,127.99,126.51,126.75,44066841],
            [1435536000000,125.46,126.47,124.48,124.53,49161427],
            [1435622400000,125.57,126.12,124.86,125.42,44370682],
            [1435708800000,126.90,126.94,125.99,126.60,30238811],
            [1435795200000,126.43,126.69,125.77,126.44,27210952],
            [1436140800000,124.94,126.23,124.85,126.00,28060431],
            [1436227200000,125.89,126.15,123.77,125.69,46946811],
            [1436313600000,124.48,124.64,122.54,122.57,60761614],
            [1436400000000,123.85,124.06,119.22,120.07,78595038],
            [1436486400000,121.94,123.85,121.21,123.28,61354474],
            [1436745600000,125.03,125.76,124.32,125.66,41440538],
            [1436832000000,126.04,126.37,125.04,125.61,31768139],
            [1436918400000,125.72,127.15,125.58,126.82,33649200],
            [1437004800000,127.74,128.57,127.35,128.51,36222447],
            [1437091200000,129.08,129.62,128.31,129.62,46164710],
            [1437350400000,130.97,132.97,130.70,132.07,58900203],
            [1437436800000,132.85,132.92,130.32,130.75,76756427],
            [1437523200000,121.99,125.50,121.99,125.22,115450607],
            [1437609600000,126.20,127.09,125.06,125.16,50999452],
            [1437696000000,125.32,125.74,123.90,124.50,42162332],
            [1437955200000,123.09,123.61,122.12,122.77,44455540],
            [1438041600000,123.38,123.91,122.55,123.38,33618097],
            [1438128000000,123.15,123.50,122.27,122.99,37011653],
            [1438214400000,122.32,122.57,121.71,122.37,33628268],
            [1438300800000,122.60,122.64,120.91,121.30,42884953],
            [1438560000000,121.50,122.57,117.52,118.44,69975968],
            [1438646400000,117.42,117.70,113.25,114.64,124138623],
            [1438732800000,112.95,117.44,112.10,115.40,99312613],
            [1438819200000,115.97,116.50,114.12,115.13,52903040],
            [1438905600000,114.58,116.25,114.50,115.52,38670405],
            [1439164800000,116.53,119.99,116.53,119.72,54951597],
            [1439251200000,117.81,118.18,113.33,113.49,97082814],
            [1439337600000,112.53,115.42,109.63,115.24,101685610],
            [1439424000000,116.04,116.40,114.54,115.15,48535789],
            [1439510400000,114.32,116.31,114.01,115.96,42929516],
            [1439769600000,116.04,117.65,115.50,117.16,40884745],
            [1439856000000,116.43,117.44,116.01,116.50,34560708],
            [1439942400000,116.10,116.52,114.68,115.01,48286510],
            [1440028800000,114.08,114.35,111.63,112.65,67765523],
            [1440115200000,110.43,111.90,105.64,105.76,126289223],
            [1440374400000,94.87,108.80,92.00,103.12,161454199],
            [1440460800000,111.11,111.11,103.50,103.74,102240208],
            [1440547200000,107.08,109.89,105.05,109.69,96226269],
            [1440633600000,112.23,113.24,110.02,112.92,83265146],
            [1440720000000,112.17,113.31,111.54,113.29,52896384],
            [1440979200000,112.03,114.53,112.00,112.76,55962842],
            [1441065600000,110.15,111.88,107.36,107.72,75988194],
            [1441152000000,110.23,112.34,109.13,112.34,61520170],
            [1441238400000,112.49,112.78,110.04,110.37,52906410],
            [1441324800000,108.97,110.45,108.51,109.27,49628615],
            [1441670400000,111.75,112.56,110.32,112.31,54114204],
            [1441756800000,113.76,114.02,109.77,110.15,84344438],
            [1441843200000,110.27,113.28,109.90,112.57,62675234],
            [1441929600000,111.79,114.21,111.76,114.21,49441846],
            [1442188800000,116.58,116.89,114.86,115.31,58201862],
            [1442275200000,115.93,116.53,114.42,116.28,43004052],
            [1442361600000,116.25,116.54,115.44,116.41,36909956],
            [1442448000000,115.66,116.49,113.72,113.92,63462713],
            [1442534400000,112.21,114.30,111.87,113.45,73418992],
            [1442793600000,113.67,115.37,113.66,115.21,46554289],
            [1442880000000,113.38,114.18,112.52,113.40,49809010],
            [1442966400000,113.63,114.72,113.30,114.32,35645658],
            [1443052800000,113.25,115.50,112.37,115.00,49810647],
            [1443139200000,116.44,116.69,114.02,114.71,55842210],
            [1443398400000,113.85,114.57,112.44,112.44,51723929],
            [1443484800000,112.83,113.51,107.86,109.06,73135853],
            [1443571200000,110.17,111.54,108.73,110.30,66105030],
            [1443657600000,109.07,109.62,107.31,109.58,63747954],
            [1443744000000,108.01,111.01,107.55,110.38,57560431],
            [1444003200000,110.08,111.37,109.07,110.78,51723110],
            [1444089600000,110.63,111.74,109.76,111.31,48196751],
            [1444176000000,110.47,111.77,109.41,110.78,46602587],
            [1444262400000,110.06,110.19,108.21,109.50,61698450],
            [1444348800000,111.64,112.28,109.49,112.12,52533783],
            [1444608000000,112.73,112.75,111.44,111.60,30114425],
            [1444694400000,110.82,112.45,110.68,111.79,32424018],
            [1444780800000,111.29,111.52,109.56,110.21,44325611],
            [1444867200000,110.93,112.10,110.49,111.86,37340996],
            [1444953600000,111.78,112.00,110.53,111.04,38236278],
            [1445212800000,110.80,111.75,110.11,111.73,29606075],
            [1445299200000,111.34,114.17,110.82,113.77,48778770],
            [1445385600000,114.00,115.58,113.70,113.76,41795238],
            [1445472000000,114.33,115.50,114.10,115.50,41272693],
            [1445558400000,118.77,119.23,116.33,119.08,59139552],
            [1445817600000,118.08,118.13,114.92,115.28,66019504],
            [1445904000000,115.40,116.54,113.99,114.55,57953589],
            [1445990400000,117.58,119.30,116.06,119.27,85023324],
            [1446076800000,118.70,120.69,118.27,120.53,50240803],
            [1446163200000,120.99,121.22,119.45,119.50,48811991],
            [1446422400000,120.80,121.36,119.61,121.18,31761309],
            [1446508800000,120.79,123.49,120.70,122.57,45331025],
            [1446595200000,122.56,123.82,121.62,122.00,44343498],
            [1446681600000,121.85,122.69,120.18,120.92,39258480],
            [1446768000000,121.08,121.81,120.62,121.06,32931447],
            [1447027200000,120.96,121.81,120.05,120.57,33657546],
            [1447113600000,116.90,118.07,116.06,116.77,58635125],
            [1447200000000,116.37,117.42,115.21,116.11,45104903],
            [1447286400000,116.26,116.82,115.65,115.72,32262598],
            [1447372800000,115.20,115.57,112.27,112.34,45164053],
            [1447632000000,111.38,114.24,111.00,114.18,37651022],
            [1447718400000,114.92,115.05,113.32,113.69,27253964],
            [1447804800000,115.76,117.49,115.50,117.29,46163404],
            [1447891200000,117.64,119.75,116.76,118.78,42908179],
            [1447977600000,119.20,119.92,118.85,119.30,34103529],
            [1448236800000,119.27,119.73,117.34,117.75,32266736],
            [1448323200000,117.33,119.35,117.12,118.88,42426855],
            [1448409600000,119.21,119.23,117.92,118.03,21388308],
            [1448582400000,118.29,118.41,117.60,117.81,13043720],
            [1448841600000,117.99,119.41,117.75,118.30,37658671],
            [1448928000000,118.75,118.81,116.86,117.34,34700991],
            [1449014400000,117.34,118.11,116.08,116.28,33198964],
            [1449100800000,115.24,116.79,114.22,115.20,41569509],
            [1449187200000,115.29,119.25,115.11,119.03,57776977],
            [1449446400000,118.32,119.86,117.81,118.28,32084249],
            [1449532800000,117.52,118.60,116.86,118.23,34309450],
            [1449619200000,115.30,117.69,115.08,115.62,46361357],
            [1449705600000,116.04,116.94,115.51,116.17,29212727],
            [1449792000000,115.19,115.39,112.85,113.18,46886161],
            [1450051200000,112.18,112.68,109.79,112.48,64318732],
            [1450137600000,111.94,112.80,110.35,110.49,53323105],
            [1450224000000,111.07,111.99,108.80,111.34,56238467],
            [1450310400000,112.02,112.25,108.98,108.98,44772827],
            [1450396800000,108.91,109.52,105.81,106.03,96453327],
            [1450656000000,107.28,107.37,105.57,107.33,47590610],
            [1450742400000,107.40,107.72,106.45,107.23,32789367],
            [1450828800000,107.27,108.85,107.20,108.61,32657354],
            [1450915200000,109.00,109.00,107.95,108.03,13596680],
            [1451260800000,107.59,107.69,106.18,106.82,26704210],
            [1451347200000,106.96,109.43,106.86,108.74,30931243],
            [1451433600000,108.58,108.70,107.18,107.32,25213777],
            [1451520000000,107.01,107.03,104.82,105.26,40912316],
            [1451865600000,102.61,105.37,102.00,105.35,67281190],
            [1451952000000,105.75,105.85,102.41,102.71,55790992],
            [1452038400000,100.56,102.37,99.87,100.70,68457388],
            [1452124800000,98.68,100.13,96.43,96.45,81094428],
            [1452211200000,98.55,99.11,96.76,96.96,70798016],
            [1452470400000,98.97,99.06,97.34,98.53,49739377],
            [1452556800000,100.55,100.69,98.84,99.96,49154227],
            [1452643200000,100.32,101.19,97.30,97.39,61745031],
            [1452729600000,97.96,100.48,95.74,99.52,62424154],
            [1452816000000,96.20,97.71,95.36,97.13,79010008],
            [1453161600000,98.41,98.65,95.50,96.66,52841349],
            [1453248000000,95.10,98.19,93.42,96.79,72008265],
            [1453334400000,97.06,97.88,94.94,96.30,52054521],
            [1453420800000,98.63,101.46,98.37,101.42,65562769],
            [1453680000000,101.52,101.53,99.21,99.44,51196375],
            [1453766400000,99.93,100.88,98.07,99.99,63538305],
            [1453852800000,96.04,96.63,93.34,93.42,132224500],
            [1453939200000,93.79,94.52,92.39,94.09,55557109],
            [1454025600000,94.79,97.34,94.35,97.34,64010141],
            [1454284800000,96.47,96.71,95.40,96.43,40571593],
            [1454371200000,95.42,96.04,94.28,94.48,37081206],
            [1454457600000,95.00,96.84,94.08,96.35,45366710],
            [1454544000000,95.86,97.33,95.19,96.60,46263907],
            [1454630400000,96.52,96.92,93.69,94.02,45853883],
            [1454889600000,93.13,95.70,93.04,95.01,53852284],
            [1454976000000,94.29,95.94,93.93,94.99,44262912],
            [1455062400000,95.92,96.35,94.10,94.27,42244975],
            [1455148800000,93.79,94.72,92.59,93.70,49686210],
            [1455235200000,94.19,94.50,93.01,93.99,40121670],
            [1455580800000,95.02,96.85,94.61,96.64,47490678],
            [1455667200000,96.67,98.21,96.15,98.12,44390173],
            [1455753600000,98.84,98.89,96.09,96.26,38494442],
            [1455840000000,96.00,96.76,95.80,96.04,34485576],
            [1456099200000,96.31,96.90,95.92,96.88,34048195],
            [1456185600000,96.40,96.50,94.55,94.69,31686699],
            [1456272000000,93.98,96.38,93.32,96.10,36155642],
            [1456358400000,96.05,96.76,95.25,96.76,27393905],
            [1456444800000,97.20,98.02,96.58,96.91,28913208],
            [1456704000000,96.86,98.23,96.65,96.69,34876558],
            [1456790400000,97.65,100.77,97.42,100.53,50153943],
            [1456876800000,100.51,100.89,99.64,100.75,33084941],
            [1456963200000,100.58,101.71,100.45,101.50,36792245],
            [1457049600000,102.37,103.75,101.37,103.01,45936485],
            [1457308800000,102.39,102.83,100.96,101.87,35828909],
            [1457395200000,100.78,101.76,100.40,101.03,31274161],
            [1457481600000,101.31,101.58,100.27,101.12,27130729],
            [1457568000000,101.41,102.24,100.15,101.17,33513577],
            [1457654400000,102.24,102.28,101.50,102.26,27200833],
            [1457913600000,101.91,102.91,101.78,102.52,25027426],
            [1458000000000,103.96,105.18,103.85,104.58,40067734],
            [1458086400000,104.61,106.31,104.59,105.97,37893758],
            [1458172800000,105.52,106.47,104.96,105.80,34244593],
            [1458259200000,106.34,106.50,105.19,105.92,43402289],
            [1458518400000,105.93,107.65,105.14,105.91,35180796],
            [1458604800000,105.25,107.29,105.21,106.72,32232567],
            [1458691200000,106.48,107.07,105.90,106.13,25452612],
            [1458777600000,105.47,106.25,104.89,105.67,25480914],
            [1459123200000,106.00,106.19,105.06,105.19,19303557],
            [1459209600000,104.89,107.79,104.88,107.68,30774115],
            [1459296000000,108.65,110.42,108.60,109.56,45159861],
            [1459382400000,109.72,109.90,108.88,108.99,25685672],
            [1459468800000,108.78,110.00,108.20,109.99,25626163],
            [1459728000000,110.42,112.19,110.27,111.12,37243224],
            [1459814400000,109.51,110.73,109.42,109.81,26495312],
            [1459900800000,110.23,110.98,109.20,110.96,26047772],
            [1459987200000,109.95,110.42,108.12,108.54,30881022],
            [1460073600000,108.91,109.77,108.17,108.66,23514462],
            [1460332800000,108.97,110.61,108.83,109.02,28313525],
            [1460419200000,109.34,110.50,108.66,110.44,26812000],
            [1460505600000,110.80,112.34,110.80,112.04,32691799],
            [1460592000000,111.62,112.39,111.33,112.10,25337435],
            [1460678400000,112.11,112.30,109.73,109.85,46418482],
            [1460937600000,108.89,108.95,106.94,107.48,60834027],
            [1461024000000,107.88,108.00,106.23,106.91,32292344],
            [1461110400000,106.64,108.09,106.06,107.13,28666865],
            [1461196800000,106.93,106.93,105.52,105.97,31356434],
            [1461283200000,105.01,106.48,104.62,105.68,33477142],
            [1461542400000,105.00,105.65,104.51,105.08,27950966],
            [1461628800000,103.91,105.30,103.91,104.35,40338403],
            [1461715200000,96.00,98.71,95.68,97.82,113538389],
            [1461801600000,97.61,97.88,94.25,94.83,81990674],
            [1461888000000,93.99,94.72,92.51,93.74,68334434],
            [1462147200000,93.96,94.08,92.40,93.64,47736879],
            [1462233600000,94.20,95.74,93.68,95.18,56533960],
            [1462320000000,95.20,95.90,93.82,94.19,40824776],
            [1462406400000,94.00,94.07,92.68,93.24,35763138],
            [1462492800000,93.37,93.45,91.85,92.72,43458189],
            [1462752000000,93.00,93.77,92.59,92.79,32855251],
            [1462838400000,93.33,93.57,92.11,93.42,33592465],
            [1462924800000,93.48,93.57,92.46,92.51,28539912],
            [1463011200000,92.72,92.78,89.47,90.34,76109795],
            [1463097600000,90.00,91.67,90.00,90.52,44188153],
            [1463356800000,92.39,94.39,91.65,93.88,61140610],
            [1463443200000,94.55,94.70,93.01,93.49,46507449],
            [1463529600000,94.16,95.21,93.89,94.56,41923114],
            [1463616000000,94.64,94.64,93.57,94.20,29693945],
            [1463702400000,94.64,95.43,94.52,95.22,31804564],
            [1463961600000,95.87,97.19,95.67,96.43,37860535],
            [1464048000000,97.22,98.09,96.84,97.90,35036561],
            [1464134400000,98.67,99.74,98.11,99.62,38168760],
            [1464220800000,99.68,100.73,98.64,100.41,56093437],
            [1464307200000,99.44,100.47,99.24,100.35,36229530],
            [1464652800000,99.60,100.40,98.82,99.86,42307212],
            [1464739200000,99.02,99.54,98.33,98.46,29173285],
            [1464825600000,97.60,97.84,96.63,97.72,40191600],
            [1464912000000,97.79,98.27,97.45,97.92,28504888],
            [1465171200000,97.99,101.89,97.55,98.63,23292504],
            [1465257600000,99.25,99.87,98.96,99.03,22409450],
            [1465344000000,99.02,99.56,98.68,98.94,20848131],
            [1465430400000,98.50,99.99,98.46,99.65,26601354],
            [1465516800000,98.53,99.35,98.48,98.83,31712936],
            [1465776000000,98.69,99.12,97.10,97.34,38020494],
            [1465862400000,97.32,98.48,96.75,97.46,31931944],
            [1465948800000,97.82,98.41,97.03,97.14,29445227],
            [1466035200000,96.45,97.75,96.07,97.55,31326815],
            [1466121600000,96.62,96.65,95.30,95.33,61008219],
            [1466380800000,96.00,96.57,95.03,95.10,34411901],
            [1466467200000,94.94,96.35,94.68,95.91,35546358],
            [1466553600000,96.25,96.89,95.35,95.55,29219122],
            [1466640000000,95.94,96.29,95.25,96.10,32240187],
            [1466726400000,92.91,94.66,92.65,93.40,75311356],
            [1466985600000,93.00,93.05,91.50,92.04,46622188],
            [1467072000000,92.90,93.66,92.14,93.59,40444914],
            [1467158400000,93.97,94.55,93.63,94.40,36531006],
            [1467244800000,94.44,95.77,94.30,95.60,35836356],
            [1467331200000,95.49,96.46,95.33,95.89,26026540],
            [1467676800000,95.39,95.40,94.46,94.99,27705210],
            [1467763200000,94.60,95.66,94.37,95.53,30949090],
            [1467849600000,95.70,96.50,95.62,95.94,25139558],
            [1467936000000,96.49,96.89,96.05,96.68,28912103],
            [1468195200000,96.75,97.65,96.73,96.98,23794945],
            [1468281600000,97.17,97.70,97.12,97.42,24167463],
            [1468368000000,97.41,97.67,96.84,96.87,25892171],
            [1468454400000,97.39,98.99,97.32,98.79,38918997],
            [1468540800000,98.92,99.30,98.50,98.78,30136990],
            [1468800000000,98.70,100.13,98.60,99.83,36493867],
            [1468886400000,99.56,100.00,99.34,99.87,23779924],
            [1468972800000,100.00,100.46,99.74,99.96,26275968],
            [1469059200000,99.83,101.00,99.13,99.43,32702028],
            [1469145600000,99.26,99.30,98.31,98.66,28313669],
            [1469404800000,98.25,98.84,96.92,97.34,40382921],
            [1469491200000,96.82,97.97,96.42,96.67,56239822],
            [1469577600000,104.26,104.35,102.75,102.95,92344820],
            [1469664000000,102.83,104.45,102.82,104.34,39869839],
            [1469750400000,104.19,104.55,103.68,104.21,27733688],
            [1470009600000,104.41,106.15,104.41,106.05,38167871],
            [1470096000000,106.05,106.07,104.00,104.48,33816556],
            [1470182400000,104.81,105.84,104.77,105.79,30202641],
            [1470268800000,105.58,106.00,105.28,105.87,27408650],
            [1470355200000,106.27,107.65,106.18,107.48,40553402],
            [1470614400000,107.52,108.37,107.16,108.37,28037220],
            [1470700800000,108.23,108.94,108.01,108.81,26315204],
            [1470787200000,108.71,108.90,107.76,108.00,24008505],
            [1470873600000,108.52,108.93,107.85,107.93,27484506],
            [1470960000000,107.78,108.44,107.78,108.18,18660434],
            [1471219200000,108.14,109.54,108.08,109.48,25868209],
            [1471305600000,109.63,110.23,109.21,109.38,33794448],
            [1471392000000,109.10,109.37,108.34,109.22,25355976],
            [1471478400000,109.23,109.60,109.02,109.08,21984703],
            [1471564800000,108.77,109.69,108.36,109.36,25368072],
            [1471824000000,108.86,109.10,107.85,108.51,25820230],
            [1471910400000,108.59,109.32,108.53,108.85,21257669],
            [1471996800000,108.56,108.75,107.68,108.03,23675081],
            [1472083200000,107.39,107.88,106.68,107.57,25086248],
            [1472169600000,107.41,107.95,106.31,106.94,27766291],
            [1472428800000,106.62,107.44,106.29,106.82,24970300],
            [1472515200000,105.80,106.50,105.50,106.00,24863945],
            [1472601600000,105.66,106.57,105.64,106.10,29662406],
            [1472688000000,106.14,106.80,105.62,106.73,26701523],
            [1472774400000,107.70,108.00,106.82,107.73,26334858],
            [1473120000000,107.90,108.30,107.51,107.70,26880391],
            [1473206400000,107.83,108.76,107.07,108.36,42364328],
            [1473292800000,107.25,107.27,105.24,105.52,53002026],
            [1473379200000,104.64,105.72,103.13,103.13,46556984],
            [1473638400000,102.65,105.72,102.53,105.44,45292770],
            [1473724800000,107.51,108.79,107.24,107.95,62176190],
            [1473811200000,108.73,113.03,108.60,111.77,112340318],
            [1473897600000,113.86,115.73,113.49,115.57,90613177],
            [1473984000000,115.12,116.13,114.04,114.92,79886911],
            [1474243200000,115.19,116.18,113.25,113.58,47023046],
            [1474329600000,113.05,114.12,112.51,113.57,34514269],
            [1474416000000,113.85,113.99,112.44,113.55,36003185],
            [1474502400000,114.35,114.94,114.00,114.62,31073984],
            [1474588800000,114.42,114.79,111.55,112.71,52481151],
            [1474848000000,111.64,113.39,111.55,112.88,29869442],
            [1474934400000,113.00,113.18,112.34,113.09,24607412],
            [1475020800000,113.69,114.64,113.43,113.95,29641085],
            [1475107200000,113.16,113.80,111.80,112.18,35886990],
            [1475193600000,112.46,113.37,111.80,113.05,36379106],
            [1475452800000,112.71,113.05,112.28,112.52,21701760],
            [1475539200000,113.06,114.31,112.63,113.00,29736835],
            [1475625600000,113.40,113.66,112.69,113.05,21453089],
            [1475712000000,113.70,114.34,113.13,113.89,28779313],
            [1475798400000,114.31,114.56,113.51,114.06,24358443],
            [1476057600000,115.02,116.75,114.72,116.05,36235956],
            [1476144000000,117.70,118.69,116.20,116.30,64041043],
            [1476230400000,117.35,117.98,116.75,117.34,37586787],
            [1476316800000,116.79,117.44,115.72,116.98,35192406],
            [1476403200000,117.88,118.17,117.13,117.63,35652191],
            [1476662400000,117.33,117.84,116.78,117.55,23624896],
            [1476748800000,118.18,118.21,117.45,117.47,24553478],
            [1476835200000,117.25,117.76,113.80,117.12,20034594],
            [1476921600000,116.86,117.38,116.33,117.06,24125801],
            [1477008000000,116.81,116.91,116.28,116.60,23192665],
            [1477267200000,117.10,117.74,117.00,117.65,23538673],
            [1477353600000,117.95,118.36,117.31,118.25,48128970],
            [1477440000000,114.31,115.70,113.31,115.59,66134219],
            [1477526400000,115.39,115.86,114.10,114.48,34562045],
            [1477612800000,113.87,115.21,113.45,113.72,37861662],
            [1477872000000,113.65,114.23,113.20,113.54,26419398],
            [1477958400000,113.46,113.77,110.53,111.49,43825812],
            [1478044800000,111.40,112.35,111.23,111.59,28331709],
            [1478131200000,110.98,111.46,109.55,109.83,26932602],
            [1478217600000,108.53,110.25,108.11,108.84,30836997],
            [1478476800000,110.08,110.51,109.46,110.41,32560000],
            [1478563200000,110.31,111.72,109.70,111.06,24254179],
            [1478649600000,109.88,111.32,108.05,110.88,59176361],
            [1478736000000,111.09,111.09,105.83,107.79,57134541],
            [1478822400000,107.12,108.87,106.55,108.43,34143898],
            [1479081600000,107.71,107.81,104.08,105.71,51175504],
            [1479168000000,106.57,107.68,106.16,107.11,32264510],
            [1479254400000,106.70,110.23,106.60,109.99,58840522],
            [1479340800000,109.81,110.35,108.83,109.95,26964598],
            [1479427200000,109.72,110.54,109.66,110.06,28428917],
            [1479686400000,110.12,111.99,110.01,111.73,29264571],
            [1479772800000,111.95,112.42,111.40,111.80,25965534],
            [1479859200000,111.36,111.51,110.33,111.23,27426394],
            [1480032000000,111.47,111.87,110.95,111.79,11475922],
            [1480291200000,111.43,112.46,111.39,111.57,27193983],
            [1480377600000,110.78,112.03,110.07,111.46,28528750],
            [1480464000000,111.60,112.20,110.27,110.52,36162258],
            [1480550400000,110.36,110.94,109.03,109.49,37086862],
            [1480636800000,109.17,110.09,108.85,109.90,26527997],
            [1480896000000,110.00,110.03,108.25,109.11,34324540],
            [1480982400000,109.50,110.36,109.19,109.95,26195462],
            [1481068800000,109.26,111.19,109.16,111.03,29998719],
            [1481155200000,110.86,112.43,110.60,112.12,27068316],
            [1481241600000,112.31,114.70,112.31,113.95,34402627],
            [1481500800000,113.29,115.00,112.49,113.30,26374377],
            [1481587200000,113.84,115.92,113.75,115.19,43733811],
            [1481673600000,115.04,116.20,114.98,115.19,34031834],
            [1481760000000,115.38,116.73,115.23,115.82,46524544],
            [1481846400000,116.47,116.50,115.64,115.97,44351134],
            [1482105600000,115.80,117.38,115.75,116.64,27779423],
            [1482192000000,116.74,117.50,116.68,116.95,21424965],
            [1482278400000,116.80,117.40,116.78,117.06,23783165],
            [1482364800000,116.35,116.51,115.64,116.29,26085854],
            [1482451200000,115.59,116.52,115.59,116.52,14249484],
            [1482796800000,116.52,117.80,116.49,117.26,18296855],
            [1482883200000,117.52,118.02,116.20,116.76,20905892],
            [1482969600000,116.45,117.11,116.40,116.73,15039519],
            [1483056000000,116.65,117.20,115.43,115.82,30586265],
            [1483401600000,115.80,116.33,114.76,116.15,28781865],
            [1483488000000,115.85,116.51,115.75,116.02,21118116],
            [1483574400000,115.92,116.86,115.81,116.61,22193587],
            [1483660800000,116.78,118.16,116.47,117.91,31751900],
            [1483920000000,117.95,119.43,117.94,118.99,33561948],
            [1484006400000,118.77,119.38,118.30,119.11,24462051],
            [1484092800000,118.74,119.93,118.60,119.75,27588593],
            [1484179200000,118.90,119.30,118.21,119.25,27086220],
            [1484265600000,119.11,119.62,118.81,119.04,26111948],
            [1484611200000,118.34,120.24,118.22,120.00,34439843],
            [1484697600000,120.00,120.50,119.71,119.99,23712961],
            [1484784000000,119.40,120.09,119.37,119.78,25597291],
            [1484870400000,120.45,120.45,119.73,120.00,32597892],
            [1485129600000,120.00,120.81,119.77,120.08,22050218],
            [1485216000000,119.55,120.10,119.50,119.97,23211038],
            [1485302400000,120.42,122.10,120.28,121.88,32586673],
            [1485388800000,121.67,122.44,121.60,121.94,26337576],
            [1485475200000,122.14,122.35,121.60,121.95,20562944],
            [1485734400000,120.93,121.63,120.66,121.63,30377503],
            [1485820800000,121.15,121.39,120.62,121.35,49200993],
            [1485907200000,127.03,130.49,127.01,128.75,111985040],
            [1485993600000,127.98,129.39,127.78,128.53,33710411],
            [1486080000000,128.31,129.19,128.16,129.08,24507301],
            [1486339200000,129.13,130.50,128.90,130.29,26845924],
            [1486425600000,130.54,132.09,130.45,131.53,38183841],
            [1486512000000,131.35,132.22,131.22,132.04,23004072],
            [1486598400000,131.65,132.44,131.12,132.42,28349859],
            [1486684800000,132.46,132.94,132.05,132.12,20065458],
            [1486944000000,133.08,133.82,132.75,133.29,23035421],
            [1487030400000,133.47,135.09,133.25,135.02,33226223],
            [1487116800000,135.52,136.27,134.62,135.51,35623100],
            [1487203200000,135.67,135.90,134.84,135.34,22584555],
            [1487289600000,135.10,135.83,135.10,135.72,22198197],
            [1487635200000,136.23,136.75,135.98,136.70,24507156],
            [1487721600000,136.43,137.12,136.11,137.11,20836932],
            [1487808000000,137.38,137.48,136.30,136.53,20788186],
            [1487894400000,135.91,136.66,135.28,136.66,21776585],
            [1488153600000,137.14,137.44,136.28,136.93,20257426],
            [1488240000000,137.08,137.44,136.70,136.99,23482860],
            [1488326400000,137.89,140.15,137.60,139.79,36414585],
            [1488412800000,140.00,140.28,138.76,138.96,26210984],
            [1488499200000,138.78,139.83,138.59,139.78,21571121],
            [1488758400000,139.36,139.77,138.60,139.34,21750044],
            [1488844800000,139.06,139.98,138.79,139.52,17446297],
            [1488931200000,138.95,139.80,138.82,139.00,18707236],
            [1489017600000,138.74,138.79,137.05,138.68,22155904],
            [1489104000000,139.25,139.36,138.64,139.14,19612801],
            [1489363200000,138.85,139.43,138.82,139.20,17421717],
            [1489449600000,139.30,139.65,138.84,138.99,15309065],
            [1489536000000,139.41,140.75,139.02,140.46,25691774],
            [1489622400000,140.72,141.02,140.26,140.69,19231998],
            [1489708800000,141.00,141.00,139.89,139.99,43884952],
            [1489968000000,140.40,141.50,140.23,141.46,21542038],
            [1490054400000,142.11,142.80,139.73,139.84,39529912],
            [1490140800000,139.84,141.60,139.76,141.42,25860165],
            [1490227200000,141.26,141.58,140.61,140.92,20346301],
            [1490313600000,141.50,141.74,140.35,140.64,22395563],
            [1490572800000,139.39,141.22,138.62,140.88,23575094],
            [1490659200000,140.91,144.04,140.62,143.80,33374805],
            [1490745600000,143.68,144.49,143.19,144.12,29189955],
            [1490832000000,144.19,144.50,143.50,143.93,21207252],
            [1490918400000,143.72,144.27,143.01,143.66,19661651],
            [1491177600000,143.71,144.12,143.05,143.70,19985714],
            [1491264000000,143.25,144.89,143.17,144.77,19891354],
            [1491350400000,144.22,145.46,143.81,144.02,27717854],
            [1491436800000,144.29,144.52,143.45,143.66,21149034],
            [1491523200000,143.73,144.18,143.27,143.34,16672198],
            [1491782400000,143.60,143.88,142.90,143.17,18933397],
            [1491868800000,142.94,143.35,140.06,141.63,30379376],
            [1491955200000,141.60,142.15,141.01,141.80,20350000],
            [1492041600000,141.91,142.38,141.05,141.05,17822880],
            [1492387200000,141.48,141.88,140.87,141.83,16582094],
            [1492473600000,141.41,142.04,141.11,141.20,14697544],
            [1492560000000,141.88,142.00,140.45,140.68,17328375],
            [1492646400000,141.22,142.92,141.16,142.44,23319562],
            [1492732800000,142.44,142.68,141.85,142.27,17320928],
            [1492992000000,143.50,143.95,143.18,143.64,17134333],
            [1493078400000,143.91,144.90,143.87,144.53,18871501],
            [1493164800000,144.47,144.60,143.38,143.68,20041241],
            [1493251200000,143.92,144.16,143.31,143.79,14246347],
            [1493337600000,144.09,144.30,143.27,143.65,20860358],
            [1493596800000,145.10,147.20,144.96,146.58,33602943],
            [1493683200000,147.54,148.09,146.84,147.51,45352194],
            [1493769600000,145.59,147.49,144.27,147.06,45697034],
            [1493856000000,146.52,147.14,145.81,146.53,23371872],
            [1493942400000,146.76,148.98,146.76,148.96,27327725],
            [1494201600000,149.03,153.70,149.03,153.01,48752413],
            [1494288000000,153.87,154.88,153.45,153.99,39130363],
            [1494374400000,153.63,153.94,152.11,153.26,25805692],
            [1494460800000,152.45,154.07,152.31,153.95,27255058],
            [1494547200000,154.70,156.42,154.67,156.10,32527017],
            [1494806400000,156.01,156.65,155.05,155.70,26009719],
            [1494892800000,155.94,156.06,154.72,155.47,20048478],
            [1494979200000,153.60,154.57,149.71,150.25,50767678],
            [1495065600000,151.27,153.34,151.13,152.54,33568215],
            [1495152000000,153.38,153.98,152.63,153.06,26960788],
            [1495411200000,154.00,154.58,152.91,153.99,22966437],
            [1495497600000,154.90,154.90,153.31,153.80,19918871],
            [1495584000000,153.84,154.17,152.67,153.34,19219154],
            [1495670400000,153.73,154.35,153.03,153.87,19235598],
            [1495756800000,154.00,154.24,153.31,153.61,21927637],
            [1496102400000,153.42,154.43,153.33,153.67,20126851],
            [1496188800000,153.97,154.17,152.38,152.76,24451164],
            [1496275200000,153.17,153.33,152.22,153.18,16404088],
            [1496361600000,153.58,155.45,152.89,155.45,27770715],
            [1496620800000,154.34,154.45,153.46,153.93,25331662],
            [1496707200000,153.90,155.81,153.78,154.45,26624926],
            [1496793600000,155.02,155.98,154.48,155.37,21069647],
            [1496880000000,155.25,155.54,154.40,154.99,21250798],
            [1496966400000,155.19,155.19,146.02,148.98,64882657],
            [1497225600000,145.74,146.09,142.51,145.42,72307330],
            [1497312000000,147.16,147.45,145.15,146.59,34165445],
            [1497398400000,147.50,147.50,143.84,145.16,31531232],
            [1497484800000,143.32,144.48,142.21,144.29,32165373],
            [1497571200000,143.78,144.50,142.20,142.27,50361093],
            [1497830400000,143.66,146.74,143.66,146.34,32541404],
            [1497916800000,146.87,146.87,144.94,145.01,24900073],
            [1498003200000,145.52,146.07,144.61,145.87,21265751],
            [1498089600000,145.77,146.70,145.12,145.63,19106294],
            [1498176000000,145.13,147.16,145.11,146.28,35439389],
            [1498435200000,147.17,148.28,145.38,145.82,25692361],
            [1498521600000,145.01,146.16,143.62,143.73,24761891],
            [1498608000000,144.49,146.11,143.16,145.83,22082432],
            [1498694400000,144.71,145.13,142.28,143.68,31499368],
            [1498780800000,144.45,144.96,143.78,144.02,23024107],
            [1499040000000,144.88,145.30,143.10,143.50,14277848],
            [1499212800000,143.69,144.79,142.72,144.09,21569557],
            [1499299200000,143.02,143.50,142.41,142.73,24128782],
            [1499385600000,142.90,144.75,142.90,144.18,19201712],
            [1499644800000,144.11,145.95,143.37,145.06,21090636],
            [1499731200000,144.73,145.85,144.38,145.53,19781836],
            [1499817600000,145.87,146.18,144.82,145.74,24884478],
            [1499904000000,145.50,148.49,145.44,147.77,25199373],
            [1499990400000,147.97,149.33,147.33,149.04,20132061],
            [1500249600000,148.82,150.90,148.57,149.56,23793456],
            [1500336000000,149.20,150.13,148.67,150.08,17868792],
            [1500422400000,150.48,151.42,149.95,151.02,20922969],
            [1500508800000,151.50,151.74,150.19,150.34,17243748],
            [1500595200000,149.99,150.44,148.88,150.27,26252630],
            [1500854400000,150.58,152.44,149.90,152.09,21493160],
            [1500940800000,151.80,153.84,151.80,152.74,18853932],
            [1501027200000,153.35,153.93,153.06,153.46,15780951],
            [1501113600000,153.75,153.99,147.30,150.56,32476337],
            [1501200000000,149.89,150.23,149.19,149.50,17213653],
            [1501459200000,149.90,150.33,148.13,148.73,19845920],
            [1501545600000,149.10,150.22,148.41,150.05,35368645],
            [1501632000000,159.28,159.75,156.16,157.14,69936800],
            [1501718400000,157.05,157.21,155.02,155.57,27097296],
            [1501804800000,156.07,157.40,155.69,156.39,20559852],
            [1502064000000,157.06,158.92,156.67,158.81,21870321],
            [1502150400000,158.60,161.83,158.27,160.08,36205896],
            [1502236800000,159.26,161.27,159.11,161.06,26131530],
            [1502323200000,159.90,160.00,154.63,155.32,40804273],
            [1502409600000,156.60,158.57,156.07,157.48,26257096],
            [1502668800000,159.32,160.21,158.75,159.85,22122734],
            [1502755200000,160.66,162.20,160.14,161.60,29465487],
            [1502841600000,161.94,162.51,160.15,160.95,27671612],
            [1502928000000,160.52,160.71,157.84,157.86,27940565],
            [1503014400000,157.86,159.50,156.72,157.50,27428069],
            [1503273600000,157.50,157.89,155.11,157.21,26368528],
            [1503360000000,158.23,160.00,158.02,159.78,21604585],
            [1503446400000,159.07,160.47,158.88,159.98,19399081],
            [1503532800000,160.43,160.74,158.55,159.27,19818918],
            [1503619200000,159.65,160.56,159.27,159.86,25480063],
            [1503878400000,160.14,162.00,159.93,161.47,25965972],
            [1503964800000,160.10,163.12,160.00,162.91,29516910],
            [1504051200000,163.80,163.89,162.61,163.35,27269584],
            [1504137600000,163.64,164.52,163.48,164.00,26785096],
            [1504224000000,164.80,164.94,163.63,164.05,16591051],
            [1504569600000,163.75,164.25,160.56,162.08,29536314],
            [1504656000000,162.71,162.99,160.52,161.91,21651726],
            [1504742400000,162.09,162.24,160.36,161.26,21928502],
            [1504828800000,160.86,161.15,158.53,158.63,28611535],
            [1505088000000,160.50,162.05,159.89,161.50,31580798],
            [1505174400000,162.61,163.96,158.77,160.86,71714046],
            [1505260800000,159.87,159.96,157.91,159.65,44907361],
            [1505347200000,158.99,159.40,158.09,158.28,23760749],
            [1505433600000,158.47,160.97,158.00,159.88,49114602],
            [1505692800000,160.11,160.50,158.00,158.67,28269435],
            [1505779200000,159.51,159.77,158.44,158.73,20810632],
            [1505865600000,157.90,158.26,153.83,156.07,52951364],
            [1505952000000,155.80,155.80,152.75,153.39,37511661],
            [1506038400000,151.54,152.27,150.56,151.89,46645443],
            [1506297600000,149.99,151.83,149.16,150.55,44387336],
            [1506384000000,151.78,153.92,151.69,153.14,36660045],
            [1506470400000,153.80,154.72,153.54,154.23,25182779],
            [1506556800000,153.89,154.28,152.70,153.28,22005455],
            [1506643200000,153.21,154.13,152.00,154.12,26299810],
            [1506902400000,154.26,154.45,152.72,153.81,18698842],
            [1506988800000,154.01,155.09,153.91,154.48,16230293],
            [1507075200000,153.63,153.86,152.46,153.48,20163750],
            [1507161600000,154.18,155.44,154.05,155.39,21283769],
            [1507248000000,154.97,155.49,154.56,155.30,17407558],
            [1507507200000,155.81,156.73,155.48,155.84,16262923],
            [1507593600000,156.06,158.00,155.10,155.90,15617014],
            [1507680000000,155.97,156.98,155.75,156.55,16905640],
            [1507766400000,156.35,157.37,155.73,156.00,16125054],
            [1507852800000,156.73,157.28,156.41,156.99,16394188],
            [1508112000000,157.90,160.00,157.65,159.88,24121452],
            [1508198400000,159.78,160.87,159.23,160.47,18997275],
            [1508284800000,160.42,160.71,159.60,159.76,16374164],
            [1508371200000,156.75,157.08,155.02,155.98,42584166],
            [1508457600000,156.61,157.75,155.96,156.25,23974146],
            [1508716800000,156.89,157.69,155.50,156.17,21984327],
            [1508803200000,156.29,157.42,156.20,157.10,17757230],
            [1508889600000,156.91,157.55,155.27,156.41,21207098],
            [1508976000000,157.23,157.83,156.78,157.41,17000469],
            [1509062400000,159.29,163.60,158.70,163.05,44454160],
            [1509321600000,163.89,168.07,163.72,166.72,44700772],
            [1509408000000,167.90,169.65,166.94,169.04,36046828],
            [1509494400000,169.87,169.94,165.61,166.89,33637762],
            [1509580800000,166.60,168.50,165.28,168.11,41393373],
            [1509667200000,174.00,174.26,171.12,172.50,59398631],
            [1509926400000,172.36,174.99,171.72,174.25,35026306],
            [1510012800000,173.91,175.25,173.60,174.81,24361485],
            [1510099200000,174.66,176.24,174.33,176.24,24409527],
            [1510185600000,175.11,176.10,173.14,175.88,29482596],
            [1510272000000,175.11,175.38,174.27,174.67,25145500],
            [1510531200000,173.50,174.50,173.40,173.97,16982080],
            [1510617600000,173.04,173.48,171.18,171.34,24782487],
            [1510704000000,169.97,170.32,168.38,169.08,29158070],
            [1510790400000,171.18,171.87,170.30,171.10,23637484],
            [1510876800000,171.04,171.39,169.64,170.15,21899544],
            [1511136000000,170.29,170.56,169.56,169.98,16262447],
            [1511222400000,170.78,173.70,170.78,173.14,25131295],
            [1511308800000,173.36,175.00,173.05,174.96,25588925],
            [1511481600000,175.10,175.50,174.65,174.97,14026673],
            [1511740800000,175.05,175.08,173.34,174.09,20716802],
            [1511827200000,174.30,174.87,171.86,173.07,26428802],
            [1511913600000,172.63,172.92,167.16,169.48,41666364],
            [1512000000000,170.43,172.14,168.44,171.85,41527218],
            [1512086400000,169.95,171.67,168.50,171.05,39759288],
            [1512345600000,172.48,172.62,169.63,169.80,32542385],
            [1512432000000,169.06,171.52,168.40,169.64,27350154],
            [1512518400000,167.50,170.20,166.46,169.01,28560000],
            [1512604800000,169.03,170.44,168.91,169.32,25673308],
            [1512691200000,170.49,171.00,168.82,169.37,23355231],
            [1512950400000,169.20,172.89,168.79,172.67,35273759],
            [1513036800000,172.15,172.39,171.46,171.70,19409230],
            [1513123200000,172.50,173.54,172.00,172.27,23818447],
            [1513209600000,172.40,173.13,171.65,172.22,20476541],
            [1513296000000,173.63,174.17,172.46,173.97,40169307],
            [1513555200000,174.88,177.20,174.86,176.42,29421114],
            [1513641600000,174.99,175.39,174.09,174.54,27436447],
            [1513728000000,174.87,175.42,173.25,174.35,23475649],
            [1513814400000,174.17,176.02,174.10,175.01,20949896],
            [1513900800000,174.68,175.42,174.50,175.01,16349444],
            [1514246400000,170.80,171.47,169.68,170.57,33185536],
            [1514332800000,170.10,170.78,169.71,170.60,21498213],
            [1514419200000,171.00,171.85,170.48,171.08,16480187],
            [1514505600000,170.52,170.59,169.22,169.23,25999922],
            [1514851200000,170.16,172.30,169.26,172.26,25555934],
            [1514937600000,172.53,174.55,171.96,172.23,29517899],
            [1515024000000,172.54,173.47,172.08,173.03,22434597],
            [1515110400000,173.44,175.37,173.05,175.00,23660018],
            [1515369600000,174.35,175.61,173.93,174.35,20567766],
            [1515456000000,174.55,175.06,173.41,174.33,21583997],
            [1515542400000,173.16,174.30,173.00,174.29,23959895],
            [1515628800000,174.59,175.49,174.49,175.28,18667729],
            [1515715200000,176.18,177.36,175.65,177.09,25418080],
            [1516060800000,177.90,179.39,176.14,176.19,29565947],
            [1516147200000,176.15,179.25,175.07,179.10,34386836],
            [1516233600000,179.37,180.10,178.25,179.26,31193352],
            [1516320000000,178.61,179.58,177.41,178.46,32425067],
            [1516579200000,177.30,177.78,176.60,177.00,27108551],
            [1516665600000,177.30,179.44,176.82,177.04,32689146],
            [1516752000000,177.25,177.30,173.20,174.22,51105090],
            [1516838400000,174.50,174.95,170.53,171.11,41529004],
            [1516924800000,172.00,172.00,170.06,171.51,39143011],
            [1517184000000,170.16,170.16,167.07,167.96,50640406],
            [1517270400000,165.52,167.37,164.70,166.97,46048185],
            [1517356800000,166.87,168.44,166.50,167.43,32478930],
            [1517443200000,167.16,168.62,166.76,167.78,47230787],
            [1517529600000,166.00,166.80,160.10,160.50,86593825],
            [1517788800000,159.10,163.88,156.00,156.49,72738522],
            [1517875200000,154.83,163.72,154.00,163.03,68243838],
            [1517961600000,163.08,163.40,159.07,159.54,51608580],
            [1518048000000,160.29,161.00,155.03,155.15,54390516],
            [1518134400000,157.07,157.89,150.24,156.41,70672608],
            [1518393600000,158.50,163.89,157.51,162.71,60819539],
            [1518480000000,161.95,164.75,161.65,164.34,32549163],
            [1518566400000,163.04,167.54,162.88,167.37,40644933],
            [1518652800000,169.79,173.09,169.00,172.99,51147171],
            [1518739200000,172.36,174.82,171.77,172.43,40176091],
            [1519084800000,172.05,174.26,171.42,171.85,33930540],
            [1519171200000,172.83,174.12,171.01,171.07,37471623],
            [1519257600000,171.80,173.95,171.71,172.50,30991940],
            [1519344000000,173.67,175.65,173.54,175.50,33812360],
            [1519603200000,176.35,179.39,176.21,178.97,38162174],
            [1519689600000,179.10,180.48,178.16,178.39,38928125]
        ];
    }
}

export interface Bid{
    sum: number;
    amount: number;
    price: number;
    total: number;
}
