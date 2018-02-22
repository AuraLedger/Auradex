import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { chart } from 'highcharts';
import {MatTableDataSource} from '@angular/material';


@Component({
  selector: 'app-trade',
  templateUrl: './trade.component.html',
  styleUrls: ['./trade.component.scss']
})
export class TradeComponent implements OnInit, AfterViewInit {
  @ViewChild('chartTarget') chartTarget: ElementRef;

  markets = [
    {
      coin: 'ARA',
      base: 'ETH',
      coinName: 'Aura',
      baseName: 'Ether',
      volume: '10',
      price: '0.001',
      change: '0.05'
    }
  ];
  market;

  isBuyPanelOpen = true;
  isBidPanelOpen = true;
  isAskPanelOpen = true;
  isSellPanelOpen = true;

  bids:  Bid[] = [
    {sum:0, amount: 2, price: 3, total: 6},
    {sum:0, amount: 1, price: 1, total: 1},
    {sum:0, amount: 1, price: 1, total: 1},
    {sum:0, amount: 1, price: 1, total: 1},
    {sum:0, amount: 1, price: 1, total: 1},
  ];

  displayedColumns = ['sum', 'total', 'amount', 'price'];
  dataSource = new MatTableDataSource(this.bids);

  constructor() { 
    this.market = this.markets[0]; 
  }

  ngOnInit() {
  }

  chart: Highcharts.ChartObject;

  ngAfterViewInit() {
    const options: Highcharts.Options = {
      chart: {
        type: 'bar'
      },
      title: {
        text: 'Fruit Consumption'
      },
      xAxis: {
        categories: ['Apples', 'Bananas', 'Oranges']
      },
      yAxis: {
        title: {
          text: 'Fruit eaten'
        }
      },
      series: [{
        name: 'Jane',
        data: [1, 0, 4]
      }, {
        name: 'John',
        data: [5, 7, 3]
      }]
    };

    this.chart = chart(this.chartTarget.nativeElement, options);
  }


  goTo(market) {
    //this.setMarket(market);
    //this.clearData();
    //this.loadData();
  }

  ngOnDestroy() {
    this.chart = null;
  }

}

export interface Bid{
  sum: number;
  amount: number;
  price: number;
  total: number;
}
