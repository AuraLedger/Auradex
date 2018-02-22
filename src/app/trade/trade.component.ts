import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { chart } from 'highcharts';


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
      volume: '10',
      price: '0.001',
      change: '0.05'
    }
  ];

  constructor() { }

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
